package jobs

import (
	"context"
	"log"
	"time"

	"github.com/hibiken/asynq"

	"github.com/irfndi/match-bot/services/worker/internal/clients"
)

// DLQProcessorHandler processes dead letter queue retry tasks.
type DLQProcessorHandler struct {
	apiClient *clients.APIClient
	botClient *clients.BotClient
}

// NewDLQProcessorHandler creates a new DLQ processor handler.
func NewDLQProcessorHandler(apiClient *clients.APIClient, botClient *clients.BotClient) *DLQProcessorHandler {
	return &DLQProcessorHandler{
		apiClient: apiClient,
		botClient: botClient,
	}
}

// ProcessTask handles the DLQ processor task.
func (h *DLQProcessorHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	log.Println("Starting DLQ processor job...")
	startTime := time.Now()

	// Get DLQ stats first
	stats, err := h.apiClient.GetDLQStats(ctx)
	if err != nil {
		log.Printf("Failed to get DLQ stats: %v", err)
		return nil // Don't fail the job, just log and continue
	}

	log.Printf("DLQ Stats - Total: %d, By Type: %v, By Error: %v",
		stats.TotalCount, stats.CountByType, stats.CountByError)

	if stats.TotalCount == 0 {
		log.Println("No DLQ entries to process")
		return nil
	}

	// Process pending DLQ entries (limit to 50 per run)
	result, err := h.apiClient.ReplayDLQ(ctx, 50)
	if err != nil {
		log.Printf("Failed to replay DLQ: %v", err)
		return nil // Don't fail the job
	}

	log.Printf("DLQ processor completed in %s - Replayed: %d, Failed: %d",
		time.Since(startTime), result.ReplayedCount, result.FailedCount)

	return nil
}
