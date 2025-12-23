package config

import (
	"bytes"
	"io"
	"os"
	"strings"
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
	t.Setenv("SENTRY_RELEASE", "meetsmatch-api@test")
	t.Setenv("ENABLE_SENTRY", "true")

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
	if cfg.SentryRelease != "meetsmatch-api@test" {
		t.Errorf("Expected SentryRelease meetsmatch-api@test, got %s", cfg.SentryRelease)
	}
	if !cfg.EnableSentry {
		t.Error("Expected EnableSentry to be true")
	}
}

func TestParseBool_InvalidLogsWarning(t *testing.T) {
	output := captureStdout(t, func() {
		if parseBool("tue") {
			t.Error("Expected invalid boolean to parse as false")
		}
	})

	if !strings.Contains(output, "Could not parse boolean value") {
		t.Errorf("Expected warning output, got %q", output)
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	original := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("Failed to create pipe: %v", err)
	}

	os.Stdout = writer
	fn()

	_ = writer.Close()
	os.Stdout = original

	var buffer bytes.Buffer
	_, _ = io.Copy(&buffer, reader)
	_ = reader.Close()

	return buffer.String()
}
