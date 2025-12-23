package config

import (
	"fmt"
	"os"
)

// Config holds runtime settings loaded from env vars.
type Config struct {
	HTTPAddr    string
	GRPCAddr    string
	DatabaseURL string
	RedisURL    string
	Environment string
	LogLevel    string
}

// Load loads configuration from environment variables.
// Required variables: DATABASE_URL
// Optional variables with defaults: HTTP_ADDR, GRPC_ADDR, REDIS_URL, ENVIRONMENT, LOG_LEVEL
func Load() Config {
	return Config{
		HTTPAddr:    envOr("HTTP_ADDR", ":8080"),
		GRPCAddr:    envOr("GRPC_ADDR", ":50051"),
		DatabaseURL: envRequired("DATABASE_URL"),
		RedisURL:    envOr("REDIS_URL", "redis://localhost:6379/0"),
		Environment: envOr("ENVIRONMENT", "development"),
		LogLevel:    envOr("LOG_LEVEL", "info"),
	}
}

// Validate checks that all required configuration is present and valid.
func (c Config) Validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	return nil
}

// IsDevelopment returns true if running in development mode.
func (c Config) IsDevelopment() bool {
	return c.Environment == "development" || c.Environment == "dev"
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envRequired(key string) string {
	value := os.Getenv(key)
	if value == "" {
		// In development, allow empty but warn
		fmt.Printf("WARNING: %s is not set. This is required in production.\n", key)
	}
	return value
}
