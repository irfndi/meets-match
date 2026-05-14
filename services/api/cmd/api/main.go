package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/irfndi/match-bot/services/api/internal/config"
	"github.com/irfndi/match-bot/services/api/internal/grpcserver"
	"github.com/irfndi/match-bot/services/api/internal/httpserver"
	"github.com/irfndi/match-bot/services/api/internal/migrate"
	"github.com/irfndi/match-bot/services/api/internal/notification"
	sentrypkg "github.com/irfndi/match-bot/services/api/internal/sentry"
	"github.com/irfndi/match-bot/services/api/internal/services"

	_ "modernc.org/sqlite"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
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

	db, err := sql.Open("sqlite", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		log.Fatalf("failed to enable WAL mode: %v", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		log.Fatalf("failed to enable foreign keys: %v", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	defer func() {
		if err := db.Close(); err != nil {
			logger.Printf("failed to close db: %v", err)
		}
	}()

	// Wait for DB with retry - allows DB to start up in containerized environments
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
		time.Sleep(1 * time.Second) // Retry delay between connection attempts
	}

	migrationsDir := "migrations"
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		migrationsDir = filepath.Join("..", "..", "migrations")
		if _, err2 := os.Stat(migrationsDir); os.IsNotExist(err2) {
			migrationsDir = filepath.Join("services", "api", "migrations")
		}
	}
	if err := migrate.Up(db, migrationsDir); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	logger.Println("Database migrations applied")

	// Initialize notification system (optional - graceful degradation if Redis unavailable)
	var notificationService *notification.Service
	var notificationWorker *notification.Worker

	notifCfg := notification.LoadConfig()
	workerCfg := notification.LoadWorkerConfig()

	// Try to connect to Redis for notification queue
	redisQueue, err := notification.NewRedisQueue(cfg.RedisURL, notifCfg)
	if err != nil {
		logger.Printf("WARNING: Redis connection failed, notification queue disabled: %v", err)
	} else {
		logger.Println("Redis connection established for notification queue")

		// Create notification repository and service
		notifRepo := notification.NewPostgresRepository(db, notifCfg)
		notificationService = notification.NewService(notifRepo, redisQueue, notifCfg)

		// Register Telegram sender (bot token from env)
		if botToken := os.Getenv("TELEGRAM_BOT_TOKEN"); botToken != "" {
			// Configurable timeout (default 10s, useful for slow networks)
			telegramTimeout := 10 * time.Second
			if timeoutStr := os.Getenv("TELEGRAM_SENDER_TIMEOUT_SECONDS"); timeoutStr != "" {
				if secs, err := time.ParseDuration(timeoutStr + "s"); err == nil && secs > 0 {
					telegramTimeout = secs
				}
			}

			telegramSender := notification.NewTelegramSender(notification.TelegramSenderConfig{
				BotToken: botToken,
				Timeout:  telegramTimeout,
			})
			notificationService.RegisterSender(telegramSender)
			logger.Println("Telegram sender registered for notifications")
		} else {
			logger.Println("WARNING: TELEGRAM_BOT_TOKEN not set, Telegram notifications disabled")
		}

		// Create worker (will be started in errgroup)
		notificationWorker = notification.NewWorker(notificationService, redisQueue, workerCfg)
	}

	userSvc := services.NewUserService(db)
	matchSvc := services.NewMatchService(db)

	httpHandler := httpserver.NewHandler(userSvc, matchSvc)
	grpcServer := grpcserver.New(db, &grpcserver.Options{
		NotificationService: notificationService,
	})

	httpServer := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: httpHandler,
	}

	group, groupCtx := errgroup.WithContext(ctx)

	group.Go(func() error {
		logger.Printf("http listening on %s", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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

	// Start notification worker if available
	if notificationWorker != nil {
		group.Go(func() error {
			logger.Println("Starting notification worker...")
			if err := notificationWorker.Start(groupCtx); err != nil {
				if groupCtx.Err() != nil {
					return nil
				}
				return err
			}
			return nil
		})
	}

	group.Go(func() error {
		<-groupCtx.Done()

		// Create shutdown context with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Stop notification worker first
		if notificationWorker != nil {
			notificationWorker.Stop()
		}

		// Shutdown HTTP with timeout
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
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
