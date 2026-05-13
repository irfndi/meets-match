package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	HTTPAddr          string
	GRPCAddr          string
	DatabaseURL       string
	RedisURL          string
	Environment       string
	LogLevel          string
	SentryDSN         string
	SentryEnvironment string
	SentryRelease     string
	EnableSentry      bool
}

func Load() (Config, error) {
	env := envOr("ENVIRONMENT", "development")
	return Config{
		HTTPAddr:          envOr("HTTP_ADDR", ":8080"),
		GRPCAddr:          envOr("GRPC_ADDR", ":50051"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisURL:          envOr("REDIS_URL", "redis://localhost:6379/0"),
		Environment:       env,
		LogLevel:          envOr("LOG_LEVEL", "info"),
		SentryDSN:         envOr("SENTRY_DSN", ""),
		SentryEnvironment: envOr("SENTRY_ENVIRONMENT", env),
		SentryRelease:     envOr("SENTRY_RELEASE", "meetsmatch-api@dev"),
		EnableSentry:      parseBool(envOr("ENABLE_SENTRY", "false")),
	}, nil
}

func (c Config) Validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	return nil
}

func (c Config) IsDevelopment() bool {
	return c.Environment == "development" || c.Environment == "dev"
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parseBool(s string) bool {
	b, err := strconv.ParseBool(s)
	if err != nil {
		return false
	}
	return b
}
