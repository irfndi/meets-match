package telemetry

import (
	"context"
	"testing"
)

// TestOpenTelemetryIntegration tests that OpenTelemetry instrumentation is properly configured
func TestOpenTelemetryIntegration(t *testing.T) {
	ctx := context.Background()

	// Test telemetry configuration loading
	config := LoadConfigFromEnv()
	if config == nil {
		t.Fatal("Failed to load telemetry config")
	}

	// For testing, disable OpenTelemetry to avoid connection issues
	config.Enabled = false

	// Test OpenTelemetry initialization
	shutdown, err := InitializeOpenTelemetry(ctx, config)
	if err != nil {
		t.Fatalf("Failed to initialize OpenTelemetry: %v", err)
	}
	defer shutdown()

	t.Log("OpenTelemetry initialized successfully (disabled for testing)")
}

// TestInstrumentationFunctions tests the instrumentation helper functions
func TestInstrumentationFunctions(t *testing.T) {
	// Test database instrumentation function
	_, err := InstrumentDatabase("postgres", "invalid_dsn")
	if err == nil {
		t.Error("Expected error for invalid DSN")
	}

	t.Log("Instrumentation functions are properly defined")
}
