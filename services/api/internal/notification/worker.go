package notification

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/google/uuid"
)

// Adaptive polling configuration
const (
	minPollInterval = 50 * time.Millisecond   // Minimum polling interval when busy
	maxPollInterval = 2 * time.Second         // Maximum polling interval when idle
	pollBackoffRate = 1.5                     // Rate at which to increase interval
)

// Worker processes notifications from the queue.
// It runs multiple goroutines to handle concurrent processing.
type Worker struct {
	service      *Service
	queue        Queue
	config       WorkerConfig
	workerID     string
	stopCh       chan struct{}
	wg           sync.WaitGroup
	isRunning    bool
	mu           sync.Mutex
	pollInterval time.Duration // Current adaptive polling interval
}

// NewWorker creates a notification worker.
func NewWorker(service *Service, queue Queue, config WorkerConfig) *Worker {
	return &Worker{
		service:      service,
		queue:        queue,
		config:       config,
		workerID:     fmt.Sprintf("%s-%s", config.WorkerPrefix, uuid.New().String()[:8]),
		stopCh:       make(chan struct{}),
		pollInterval: minPollInterval, // Start with minimum interval
	}
}

// Start begins processing notifications.
// This is a blocking call - run in a goroutine.
//
// Example usage:
//
//	worker := notification.NewWorker(service, queue, config)
//	go func() {
//	    if err := worker.Start(ctx); err != nil {
//	        log.Printf("Worker stopped: %v", err)
//	    }
//	}()
//
//	// Later, to stop:
//	worker.Stop()
func (w *Worker) Start(ctx context.Context) error {
	w.mu.Lock()
	if w.isRunning {
		w.mu.Unlock()
		return fmt.Errorf("worker already running")
	}
	w.isRunning = true
	w.mu.Unlock()

	log.Printf("[%s] Starting notification worker with %d concurrent processors",
		w.workerID, w.config.Concurrency)

	// Channel for notifications to process
	notificationCh := make(chan uuid.UUID, w.config.BatchSize*2)

	// Start worker goroutines
	for i := 0; i < w.config.Concurrency; i++ {
		w.wg.Add(1)
		go w.processLoop(ctx, notificationCh, i)
	}

	// Start delayed queue promoter
	w.wg.Add(1)
	go w.promoteDelayedLoop(ctx)

	// Main loop - fetch from pending queue with adaptive polling
	timer := time.NewTimer(w.pollInterval)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			w.Stop()
			return ctx.Err()
		case <-w.stopCh:
			close(notificationCh)
			return nil
		case <-timer.C:
			// Fetch batch from pending queue
			ids, err := w.queue.Dequeue(ctx, w.config.BatchSize)
			if err != nil {
				log.Printf("[%s] Error fetching from queue: %v", w.workerID, err)
				w.adaptPollInterval(false) // Backoff on errors
				timer.Reset(w.pollInterval)
				continue
			}

			// Adapt polling interval based on queue activity
			if len(ids) > 0 {
				w.adaptPollInterval(true) // Speed up when busy
			} else {
				w.adaptPollInterval(false) // Slow down when idle
			}

			// Send to processing channel
			for _, id := range ids {
				select {
				case notificationCh <- id:
				case <-w.stopCh:
					close(notificationCh)
					return nil
				}
			}

			timer.Reset(w.pollInterval)
		}
	}
}

// adaptPollInterval adjusts the polling interval based on queue activity.
// When busy (hasWork=true), interval decreases towards minPollInterval.
// When idle (hasWork=false), interval increases towards maxPollInterval.
func (w *Worker) adaptPollInterval(hasWork bool) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if hasWork {
		// Speed up polling when there's work
		w.pollInterval = minPollInterval
	} else {
		// Gradually slow down when idle
		newInterval := time.Duration(float64(w.pollInterval) * pollBackoffRate)
		if newInterval > maxPollInterval {
			newInterval = maxPollInterval
		}
		w.pollInterval = newInterval
	}
}

// processLoop handles notifications from the channel.
func (w *Worker) processLoop(ctx context.Context, ch <-chan uuid.UUID, workerNum int) {
	defer w.wg.Done()

	processorID := fmt.Sprintf("%s-%d", w.workerID, workerNum)

	for id := range ch {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		default:
		}

		if err := w.service.Process(ctx, id, processorID); err != nil {
			log.Printf("[%s] Error processing notification %s: %v", processorID, id, err)

			// Report to Sentry
			w.captureWorkerError(err, id, processorID)
		}
	}
}

// promoteDelayedLoop moves due notifications from delayed to pending.
func (w *Worker) promoteDelayedLoop(ctx context.Context) {
	defer w.wg.Done()

	ticker := time.NewTicker(w.config.DelayedPollInterval)
	defer ticker.Stop()

	// DLQ health check ticker (every 5 minutes)
	dlqCheckTicker := time.NewTicker(5 * time.Minute)
	defer dlqCheckTicker.Stop()

	// Reconciliation ticker (every 5 minutes)
	reconcileTicker := time.NewTicker(5 * time.Minute)
	defer reconcileTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			promoted, err := w.queue.PromoteDelayed(ctx, time.Now())
			if err != nil {
				log.Printf("[%s] Error promoting delayed notifications: %v", w.workerID, err)

				// Report to Sentry
				w.capturePromoteError(err)
				continue
			}
			if promoted > 0 {
				log.Printf("[%s] Promoted %d delayed notifications", w.workerID, promoted)
			}
		case <-dlqCheckTicker.C:
			// Periodic DLQ health check
			if err := w.service.CheckDLQHealth(ctx); err != nil {
				log.Printf("[%s] Error checking DLQ health: %v", w.workerID, err)
			}
		case <-reconcileTicker.C:
			// Periodic reconciliation to sync Redis and PostgreSQL
			reconciled, err := w.service.Reconcile(ctx)
			if err != nil {
				log.Printf("[%s] Error during reconciliation: %v", w.workerID, err)
			} else if reconciled > 0 {
				log.Printf("[%s] Reconciled %d orphaned notifications", w.workerID, reconciled)
			}
		}
	}
}

// Stop gracefully stops the worker.
func (w *Worker) Stop() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.isRunning {
		return
	}

	log.Printf("[%s] Stopping notification worker...", w.workerID)

	// Signal all goroutines to stop
	close(w.stopCh)

	// Wait for all goroutines to finish
	w.wg.Wait()

	w.isRunning = false
	log.Printf("[%s] Notification worker stopped", w.workerID)
}

// IsRunning returns whether the worker is currently running.
func (w *Worker) IsRunning() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.isRunning
}

// captureWorkerError reports a worker processing error to Sentry.
func (w *Worker) captureWorkerError(err error, notificationID uuid.UUID, processorID string) {
	if err == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	scope.SetTag("service", "notification_worker")
	scope.SetTag("processor_id", processorID)
	scope.SetTag("worker_id", w.workerID)

	scope.SetExtra("notification_id", notificationID.String())

	hub.CaptureException(err)
}

// capturePromoteError reports a delayed queue promotion error to Sentry.
func (w *Worker) capturePromoteError(err error) {
	if err == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	scope.SetTag("service", "notification_worker")
	scope.SetTag("worker_id", w.workerID)
	scope.SetTag("operation", "promote_delayed")

	hub.CaptureException(err)
}
