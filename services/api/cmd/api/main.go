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

	_ "github.com/lib/pq"
)

func main() {
	cfg := config.Load()
	logger := log.New(os.Stdout, "", log.LstdFlags)

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
		_ = httpApp.Shutdown()
		grpcServer.GracefulStop()
		return nil
	})

	if err := group.Wait(); err != nil {
		logger.Printf("server error: %v", err)
		os.Exit(1)
	}
}
