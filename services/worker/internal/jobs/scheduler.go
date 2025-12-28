// Package jobs provides scheduled background tasks for the worker service.
package jobs

import (
	"log"

	"github.com/hibiken/asynq"
)

// Task type identifiers
const (
	TypeReengagement  = "notification:reengagement"
	TypeDLQProcessor  = "notification:dlq_processor"
)

// Scheduler manages periodic job scheduling using asynq.
type Scheduler struct {
	scheduler *asynq.Scheduler
}

// NewScheduler creates a new job scheduler.
func NewScheduler(redisURL string, reengagementCron, dlqCron string) (*Scheduler, error) {
	redisOpt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil, err
	}

	scheduler := asynq.NewScheduler(redisOpt, nil)

	// Register re-engagement job (runs at configured schedule, default 10 AM daily)
	_, err = scheduler.Register(reengagementCron, asynq.NewTask(TypeReengagement, nil))
	if err != nil {
		return nil, err
	}
	log.Printf("Registered re-engagement job with schedule: %s", reengagementCron)

	// Register DLQ processor job (runs at configured schedule, default every 5 minutes)
	_, err = scheduler.Register(dlqCron, asynq.NewTask(TypeDLQProcessor, nil))
	if err != nil {
		return nil, err
	}
	log.Printf("Registered DLQ processor job with schedule: %s", dlqCron)

	return &Scheduler{scheduler: scheduler}, nil
}

// Run starts the scheduler. Blocks until shutdown.
func (s *Scheduler) Run() error {
	return s.scheduler.Run()
}

// Shutdown gracefully stops the scheduler.
func (s *Scheduler) Shutdown() {
	s.scheduler.Shutdown()
}
