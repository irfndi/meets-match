package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/irfndi/match-bot/services/api/internal/config"
	"github.com/irfndi/match-bot/services/api/internal/grpcserver"
	"github.com/irfndi/match-bot/services/api/internal/httpserver"
	sentrypkg "github.com/irfndi/match-bot/services/api/internal/sentry"

	_ "github.com/lib/pq"
)

func main() {
	cfg := config.Load()
	logger := log.New(os.Stdout, "", log.LstdFlags)

	// Initialize Sentry (graceful degradation if disabled or DSN not set)
	if err := sentrypkg.Init(cfg); err != nil {
		logger.Printf("WARNING: Sentry initialization failed: %v", err)
	} else if cfg.EnableSentry {
		logger.Printf("Sentry initialized for environment: %s", cfg.SentryEnvironment)
	}
	defer sentrypkg.Flush(2 * time.Second)

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		log.Fatalf("configuration error: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}

	// Configure connection pool for production use
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(1 * time.Minute)

	defer func() {
		if err := db.Close(); err != nil {
			logger.Printf("failed to close db: %v", err)
		}
	}()

	// Wait for DB with retry
	maxRetries := 30
	for i := 0; i < maxRetries; i++ {
		if err := db.Ping(); err == nil {
			logger.Println("Database connection established")
			break
		}
		if i == maxRetries-1 {
			log.Fatalf("failed to connect to database after %d retries", maxRetries)
		}
		logger.Printf("Waiting for database... (%d/%d)", i+1, maxRetries)
		time.Sleep(1 * time.Second)
	}

	httpApp := httpserver.New()
	grpcServer := grpcserver.New(db)

	group, groupCtx := errgroup.WithContext(ctx)

	group.Go(func() error {
		logger.Printf("http listening on %s", cfg.HTTPAddr)
		if err := httpApp.Listen(cfg.HTTPAddr); err != nil {
			if groupCtx.Err() != nil {
				return nil
			}
			return err
		}
		return nil
	})

	group.Go(func() error {
		listener, err := net.Listen("tcp", cfg.GRPCAddr)
		if err != nil {
			return err
		}
		logger.Printf("grpc listening on %s", cfg.GRPCAddr)
		if err := grpcServer.Serve(listener); err != nil {
			if groupCtx.Err() != nil {
				return nil
			}
			return err
		}
		return nil
	})

	group.Go(func() error {
		<-groupCtx.Done()

		// Create shutdown context with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Shutdown HTTP with timeout
		if err := httpApp.ShutdownWithContext(shutdownCtx); err != nil {
			logger.Printf("HTTP shutdown error: %v", err)
		}

		// Graceful stop for gRPC
		grpcServer.GracefulStop()

		logger.Println("Graceful shutdown completed")
		return nil
	})

	if err := group.Wait(); err != nil {
		logger.Printf("server error: %v", err)
		os.Exit(1)
	}
}
