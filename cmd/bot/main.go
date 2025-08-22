package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-telegram/bot"
	"github.com/joho/godotenv"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/meetsmatch/meetsmatch/internal/bothandler"
	"github.com/meetsmatch/meetsmatch/internal/cache"
	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/middleware"
	"github.com/meetsmatch/meetsmatch/internal/monitoring"
	"github.com/meetsmatch/meetsmatch/internal/services"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

// Helper functions for environment variables
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntEnvWithDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func main() {
	// Initialize context and basic logging
	ctx := context.Background()
	ctx = telemetry.WithCorrelationID(ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"service":   "meets-match-bot",
		"operation": "startup",
	})

	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		logger.WithError(err).Warn("Error loading .env file")
	}

	// Initialize OpenTelemetry
	otelConfig := telemetry.LoadConfigFromEnv()
	otelConfig.ServiceName = "meets-match-bot"
	shutdown, err := telemetry.InitializeOpenTelemetry(ctx, otelConfig)
	if err != nil {
		logger.WithError(err).Warn("Failed to initialize OpenTelemetry")
	} else {
		defer shutdown()
		logger.Info("OpenTelemetry initialized successfully")
	}

	// Load environment variables
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		logger.Fatal("TELEGRAM_BOT_TOKEN environment variable is required")
	}

	webhookURL := os.Getenv("TELEGRAM_WEBHOOK_URL")
	port := os.Getenv("BOT_PORT")
	if port == "" {
		port = "8081"
	}

	// Initialize database connection
	dbConfig := database.Config{
		Host:     os.Getenv("DB_HOST"),
		Port:     os.Getenv("DB_PORT"),
		User:     os.Getenv("DB_USER"),
		Password: os.Getenv("DB_PASSWORD"),
		DBName:   os.Getenv("DB_NAME"),
		SSLMode:  os.Getenv("DB_SSLMODE"),
	}

	// Set defaults if not provided
	if dbConfig.Host == "" {
		dbConfig.Host = "localhost"
	}
	if dbConfig.Port == "" {
		dbConfig.Port = "5432"
	}
	if dbConfig.SSLMode == "" {
		dbConfig.SSLMode = "disable"
	}

	// Use instrumented database connection if OpenTelemetry is enabled
	var db *database.DB
	if otelConfig.Enabled {
		db, err = database.NewInstrumentedConnection(dbConfig)
		if err != nil {
			logger.WithError(err).Warn("Failed to create instrumented database connection, falling back to regular connection")
			db, err = database.NewConnection(dbConfig)
		}
	} else {
		db, err = database.NewConnection(dbConfig)
	}
	if err != nil {
		logger.WithError(err).Fatal("Failed to connect to database")
	}
	defer db.Close()

	// Initialize Redis
	redisConfig := &cache.RedisConfig{
		Host:     os.Getenv("REDIS_HOST"),
		Port:     6379, // Default port
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
		PoolSize: 10,
	}
	// Use instrumented Redis service if OpenTelemetry is enabled
	var redisService *cache.RedisService
	if otelConfig.Enabled {
		redisService, err = cache.NewInstrumentedRedisService(redisConfig)
		if err != nil {
			logger.WithError(err).Warn("Failed to create instrumented Redis service, falling back to regular service")
			redisService, err = cache.NewRedisService(redisConfig)
		}
	} else {
		redisService, err = cache.NewRedisService(redisConfig)
	}
	if err != nil {
		logger.WithError(err).Fatal("Failed to connect to Redis")
	}
	defer redisService.Close()

	// Initialize services
	userService := services.NewUserService(db)
	matchingService := services.NewMatchingService(db)
	messagingService := services.NewMessagingService(db)

	// Initialize monitoring components
	healthChecker := monitoring.NewHealthChecker("meets-match-bot", "1.0.0", time.Now().Format(time.RFC3339), "dev")
	healthChecker.RegisterDatabaseCheck("postgres", db.DB)
	healthChecker.RegisterRedisCheck("redis", redisService)

	metricsCollector := monitoring.NewMetricsCollector()

	tracer := monitoring.NewTracer(monitoring.TracerConfig{
		ServiceName:    "meets-match-bot",
		ServiceVersion: "1.0.0",
		MaxTraces:      1000,
		TraceRetention: 24 * time.Hour,
		SamplingRate:   1.0,
		Enabled:        true,
	})

	alertManager := monitoring.NewAlertManager(monitoring.DefaultAlertConfig())
	// Default rules are registered automatically in NewAlertManager

	// Initialize cache middleware
	cacheConfig := middleware.CacheConfig{
		Enabled:      true,
		DefaultTTL:   3600, // 1 hour in seconds
		UserTTL:      30 * time.Minute,
		MatchTTL:     time.Hour,
		ProfileTTL:   2 * time.Hour,
		ResponseTTL:  15 * time.Minute,
		SkipPatterns: []string{"/health", "/metrics"},
	}
	cacheMiddleware := middleware.NewCacheMiddleware(redisService, cacheConfig)

	// Initialize Telegram bot
	ctx = context.Background()
	botAPI, err := bot.New(botToken)
	if err != nil {
		logger.WithError(err).Fatal("Failed to create bot")
	}

	// Get bot info
	botInfo, err := botAPI.GetMe(ctx)
	if err != nil {
		logger.WithError(err).Fatal("Failed to get bot info")
	}
	logger.WithField("username", botInfo.Username).Info("Authorized on Telegram account")

	// Register Telegram bot with health checker
	healthChecker.RegisterTelegramBotCheck("telegram", botAPI)

	// Initialize bot handler with middleware
	botHandler := bothandler.NewHandler(botAPI, userService, matchingService, messagingService)
	botHandler.SetCacheMiddleware(cacheMiddleware)

	// Add monitoring hooks to bot handler
	botHandler.SetMetricsCollector(metricsCollector)
	botHandler.SetTracer(tracer)
	botHandler.SetAlertManager(alertManager)

	// Setup HTTP server for webhook
	router := gin.Default()

	// Add OpenTelemetry middleware for Gin if enabled
	if otelConfig.Enabled {
		router.Use(otelgin.Middleware(otelConfig.ServiceName))
	}

	// Add logging middleware
	loggingConfig := middleware.DefaultLoggingConfig()
	router.Use(middleware.LoggingMiddleware(loggingConfig))

	// Initialize monitoring middleware with existing components
	monitoringConfig := monitoring.DefaultMiddlewareConfig()
	monitoringMiddleware := monitoring.NewMonitoringMiddleware(monitoringConfig)

	// Set the existing monitoring components
	monitoringMiddleware.SetMetrics(metricsCollector)
	monitoringMiddleware.SetTracer(tracer)
	monitoringMiddleware.SetAlerts(alertManager)
	monitoringMiddleware.SetHealth(healthChecker)

	// Add monitoring middleware
	router.Use(monitoringMiddleware.GinMiddleware())

	// Register all monitoring endpoints
	monitoringMiddleware.RegisterRoutes(router)

	// Cache management endpoints
	router.POST("/cache/warm", func(c *gin.Context) {
		err := cacheMiddleware.WarmCache(context.Background())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Cache warmed successfully"})
	})

	router.DELETE("/cache/invalidate", func(c *gin.Context) {
		pattern := c.Query("pattern")
		if pattern == "" {
			pattern = "*"
		}
		err := cacheMiddleware.ClearCache()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Cache invalidated successfully"})
	})

	// Webhook endpoint
	router.POST("/webhook", botHandler.HandleWebhook)

	// Setup webhook if URL is provided
	if webhookURL != "" {
		_, err = botAPI.SetWebhook(ctx, &bot.SetWebhookParams{
			URL: webhookURL + "/webhook",
		})
		if err != nil {
			logger.WithError(err).Fatal("Failed to set webhook")
		}
		logger.WithField("webhook_url", webhookURL+"/webhook").Info("Webhook configured")
	} else {
		// Remove webhook for local development
		_, err = botAPI.DeleteWebhook(ctx, &bot.DeleteWebhookParams{})
		if err != nil {
			logger.WithError(err).Warn("Failed to remove webhook")
		}

		// Register handlers and start polling for local development
		botHandler.RegisterHandlers()
		go func() {
			botAPI.Start(ctx)
		}()
		logger.Info("Bot started in polling mode")
	}

	// Start HTTP server
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start periodic monitoring tasks
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				// Update cache hit rate and active users metrics
				metricsCollector.UpdateCacheHitRate("redis", 0.95)
				metricsCollector.UpdateActiveUsers("30m", 100)

				// Alert manager runs its own evaluation loop
				// No need to manually trigger alerts here
			case <-ctx.Done():
				return
			}
		}
	}()

	// Start server in a goroutine
	go func() {
		logger.WithField("port", port).Info("Starting HTTP server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.WithError(err).Fatal("Failed to start server")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	// Graceful shutdown with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.WithError(err).Fatal("Server forced to shutdown")
	}

	logger.Info("Server exited")
}
