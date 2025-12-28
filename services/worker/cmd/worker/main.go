// Package main is the entry point for the worker service.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"golang.org/x/sync/errgroup"

	"github.com/irfndi/match-bot/services/worker/internal/clients"
	"github.com/irfndi/match-bot/services/worker/internal/config"
	"github.com/irfndi/match-bot/services/worker/internal/jobs"
)

func main() {
	log.Println("Starting MeetMatch Worker service...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Create gRPC clients
	apiClient, err := clients.NewAPIClient(cfg.APIAddress)
	if err != nil {
		log.Fatalf("Failed to create API client: %v", err)
	}
	defer apiClient.Close()
	log.Printf("Connected to API service at %s", cfg.APIAddress)

	botClient, err := clients.NewBotClient(cfg.BotAddress)
	if err != nil {
		log.Fatalf("Failed to create Bot client: %v", err)
	}
	defer botClient.Close()
	log.Printf("Connected to Bot service at %s", cfg.BotAddress)

	// Create job handlers
	reengagementHandler := jobs.NewReengagementHandler(apiClient, botClient)
	dlqProcessorHandler := jobs.NewDLQProcessorHandler(apiClient, botClient)

	// Create worker to process tasks
	worker, err := jobs.NewWorker(cfg.RedisURL, cfg.Concurrency)
	if err != nil {
		log.Fatalf("Failed to create worker: %v", err)
	}
	worker.RegisterHandler(jobs.TypeReengagement, reengagementHandler)
	worker.RegisterHandler(jobs.TypeDLQProcessor, dlqProcessorHandler)

	// Create scheduler to enqueue periodic tasks
	scheduler, err := jobs.NewScheduler(cfg.RedisURL, cfg.ReengagementSchedule, cfg.DLQProcessorSchedule)
	if err != nil {
		log.Fatalf("Failed to create scheduler: %v", err)
	}

	// Setup graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Run scheduler and worker concurrently
	g, _ := errgroup.WithContext(ctx)

	g.Go(func() error {
		log.Println("Starting task scheduler...")
		if err := scheduler.Run(); err != nil {
			return err
		}
		return nil
	})

	g.Go(func() error {
		log.Println("Starting task worker...")
		if err := worker.Run(); err != nil {
			return err
		}
		return nil
	})

	// Wait for shutdown signal
	<-ctx.Done()
	log.Println("Shutting down worker service...")

	// Graceful shutdown
	scheduler.Shutdown()
	worker.Shutdown()

	log.Println("Worker service stopped")
}
