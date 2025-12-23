package config

import (
	"os"
	"testing"
)

func TestLoad(t *testing.T) {
	// Test defaults
	os.Clearenv()
	cfg := Load()

	if cfg.HTTPAddr != ":8080" {
		t.Errorf("Expected default HTTPAddr :8080, got %s", cfg.HTTPAddr)
	}
	if cfg.GRPCAddr != ":50051" {
		t.Errorf("Expected default GRPCAddr :50051, got %s", cfg.GRPCAddr)
	}

	// Test overrides
	t.Setenv("HTTP_ADDR", ":9090")
	t.Setenv("GRPC_ADDR", ":9091")
	t.Setenv("DATABASE_URL", "postgres://test")
	t.Setenv("REDIS_URL", "redis://test")

	cfg = Load()

	if cfg.HTTPAddr != ":9090" {
		t.Errorf("Expected HTTPAddr :9090, got %s", cfg.HTTPAddr)
	}
	if cfg.GRPCAddr != ":9091" {
		t.Errorf("Expected GRPCAddr :9091, got %s", cfg.GRPCAddr)
	}
	if cfg.DatabaseURL != "postgres://test" {
		t.Errorf("Expected DatabaseURL postgres://test, got %s", cfg.DatabaseURL)
	}
	if cfg.RedisURL != "redis://test" {
		t.Errorf("Expected RedisURL redis://test, got %s", cfg.RedisURL)
	}
}
