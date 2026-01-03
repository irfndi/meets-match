package jobs

import (
	"log"
	"sync/atomic"

	"github.com/hibiken/asynq"
)

// Worker processes async tasks.
type Worker struct {
	server    *asynq.Server
	mux       *asynq.ServeMux
	isRunning atomic.Bool
}

// NewWorker creates a new task worker.
func NewWorker(redisURL string, concurrency int) (*Worker, error) {
	redisOpt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil, err
	}

	server := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: concurrency,
		Queues: map[string]int{
			"default":  6,
			"critical": 10,
			"low":      1,
		},
	})

	mux := asynq.NewServeMux()

	return &Worker{
		server: server,
		mux:    mux,
	}, nil
}

// RegisterHandler registers a task handler for a task type.
func (w *Worker) RegisterHandler(taskType string, handler asynq.Handler) {
	w.mux.Handle(taskType, handler)
	log.Printf("Registered handler for task type: %s", taskType)
}

// Run starts the worker server. Blocks until shutdown.
func (w *Worker) Run() error {
	w.isRunning.Store(true)
	defer w.isRunning.Store(false)
	return w.server.Run(w.mux)
}

// Shutdown gracefully stops the worker.
func (w *Worker) Shutdown() {
	w.isRunning.Store(false)
	w.server.Shutdown()
}

// IsHealthy returns true if the worker is running and healthy.
func (w *Worker) IsHealthy() bool {
	return w.isRunning.Load()
}
