// Package config provides configuration loading for the worker service.
package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all worker service configuration.
type Config struct {
	// Redis connection URL
	RedisURL string

	// API service gRPC address
	APIAddress string

	// Bot service gRPC address
	BotAddress string

	// Cron schedule for re-engagement job (default: 10 AM daily)
	ReengagementSchedule string

	// Cron schedule for DLQ processor (default: every 5 minutes)
	DLQProcessorSchedule string

	// Maximum concurrent workers
	Concurrency int

	// Enable debug logging
	Debug bool
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379/0"),
		APIAddress:           getEnv("API_GRPC_ADDRESS", "localhost:50051"),
		BotAddress:           getEnv("BOT_GRPC_ADDRESS", "localhost:50052"),
		ReengagementSchedule: getEnv("REENGAGEMENT_SCHEDULE", "0 10 * * *"), // 10 AM daily
		DLQProcessorSchedule: getEnv("DLQ_PROCESSOR_SCHEDULE", "*/5 * * * *"), // Every 5 minutes
		Concurrency:          getEnvInt("WORKER_CONCURRENCY", 10),
		Debug:                getEnv("DEBUG", "false") == "true",
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	if c.RedisURL == "" {
		return fmt.Errorf("REDIS_URL is required")
	}
	if c.APIAddress == "" {
		return fmt.Errorf("API_GRPC_ADDRESS is required")
	}
	if c.BotAddress == "" {
		return fmt.Errorf("BOT_GRPC_ADDRESS is required")
	}
	return nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}
