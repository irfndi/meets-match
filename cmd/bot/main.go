package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-telegram/bot"
	"github.com/joho/godotenv"
	"github.com/meetsmatch/meetsmatch/internal/bothandler"
	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/services"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	// Load environment variables
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		log.Fatal("TELEGRAM_BOT_TOKEN environment variable is required")
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

	db, err := database.NewConnection(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize services
	userService := services.NewUserService(db)
	matchingService := services.NewMatchingService(db)
	messagingService := services.NewMessagingService(db)

	// Initialize Telegram bot
	ctx := context.Background()
	botAPI, err := bot.New(botToken)
	if err != nil {
		log.Fatalf("Failed to create bot: %v", err)
	}

	// Get bot info
	botInfo, err := botAPI.GetMe(ctx)
	if err != nil {
		log.Fatalf("Failed to get bot info: %v", err)
	}
	log.Printf("Authorized on account %s", botInfo.Username)

	// Initialize bot handler
	botHandler := bothandler.NewHandler(botAPI, userService, matchingService, messagingService)

	// Setup HTTP server for webhook
	router := gin.Default()
	
	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "telegram-bot"})
	})

	// Metrics endpoint
	router.GET("/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"metrics": "placeholder"})
	})

	// Webhook endpoint
	router.POST("/webhook", botHandler.HandleWebhook)

	// Setup webhook if URL is provided
	if webhookURL != "" {
		_, err = botAPI.SetWebhook(ctx, &bot.SetWebhookParams{
			URL: webhookURL + "/webhook",
		})
		if err != nil {
			log.Fatalf("Failed to set webhook: %v", err)
		}
		log.Printf("Webhook set to %s", webhookURL+"/webhook")
	} else {
		// Remove webhook for local development
		_, err = botAPI.DeleteWebhook(ctx, &bot.DeleteWebhookParams{})
		if err != nil {
			log.Printf("Failed to remove webhook: %v", err)
		}
		
		// Register handlers and start polling for local development
		botHandler.RegisterHandlers()
		go func() {
			botAPI.Start(ctx)
		}()
		log.Println("Bot started in polling mode")
	}

	// Start HTTP server
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Starting bot server on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}