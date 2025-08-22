package telemetry

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Config holds the configuration for OpenTelemetry
type Config struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	OTLPEndpoint   string
	Enabled        bool
}

// DefaultConfig returns a default configuration
func DefaultConfig() *Config {
	return &Config{
		ServiceName:    "meets-match",
		ServiceVersion: "1.0.0",
		Environment:    getEnv("ENVIRONMENT", "development"),
		OTLPEndpoint:   getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
		Enabled:        getEnv("OTEL_ENABLED", "true") == "true",
	}
}

// Provider holds the OpenTelemetry providers
type Provider struct {
	TraceProvider  *trace.TracerProvider
	MetricProvider *metric.MeterProvider
	config         *Config
}

// NewProvider creates a new OpenTelemetry provider
func NewProvider(config *Config) (*Provider, error) {
	if !config.Enabled {
		logger := GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"operation": "initialize_otel",
			"service":   "telemetry",
			"enabled":   false,
		}).Info("OpenTelemetry is disabled")
		return &Provider{config: config}, nil
	}

	ctx := context.Background()

	// Create resource
	res, err := createResource(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create trace provider
	traceProvider, err := newTraceProvider(res, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace provider: %w", err)
	}

	// Create metric provider
	metricProvider, err := newMetricProvider(res, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric provider: %w", err)
	}

	// Set global providers
	otel.SetTracerProvider(traceProvider)
	otel.SetMeterProvider(metricProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &Provider{
		TraceProvider:  traceProvider,
		MetricProvider: metricProvider,
		config:         config,
	}, nil
}

// Shutdown gracefully shuts down the providers
func (p *Provider) Shutdown(ctx context.Context) error {
	if !p.config.Enabled {
		return nil
	}

	var errs []error

	if p.TraceProvider != nil {
		if err := p.TraceProvider.Shutdown(ctx); err != nil {
			errs = append(errs, fmt.Errorf("failed to shutdown trace provider: %w", err))
		}
	}

	if p.MetricProvider != nil {
		if err := p.MetricProvider.Shutdown(ctx); err != nil {
			errs = append(errs, fmt.Errorf("failed to shutdown metric provider: %w", err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("shutdown errors: %v", errs)
	}

	return nil
}

// createResource creates a new resource with service information
func createResource(ctx context.Context) (*resource.Resource, error) {
	return resource.New(ctx,
		resource.WithSchemaURL(semconv.SchemaURL),
		resource.WithAttributes(
			semconv.ServiceName("meetsmatch"),
			semconv.ServiceVersion("1.0.0"),
			semconv.ServiceInstanceID("meetsmatch-instance-1"),
		),
	)
}

// newTraceProvider creates a new trace provider
func newTraceProvider(res *resource.Resource, config *Config) (*trace.TracerProvider, error) {
	// Create OTLP trace exporter
	exporter, err := otlptracehttp.New(
		context.Background(),
		otlptracehttp.WithEndpoint(config.OTLPEndpoint),
		otlptracehttp.WithInsecure(), // Use insecure for local development
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Create trace provider
	tp := trace.NewTracerProvider(
		trace.WithBatcher(exporter),
		trace.WithResource(res),
		trace.WithSampler(trace.AlwaysSample()), // Sample all traces in development
	)

	return tp, nil
}

// newMetricProvider creates a new metric provider
func newMetricProvider(res *resource.Resource, config *Config) (*metric.MeterProvider, error) {
	// Create OTLP metric exporter
	exporter, err := otlpmetrichttp.New(
		context.Background(),
		otlpmetrichttp.WithEndpoint(config.OTLPEndpoint),
		otlpmetrichttp.WithInsecure(), // Use insecure for local development
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric exporter: %w", err)
	}

	// Create metric provider
	mp := metric.NewMeterProvider(
		metric.WithReader(metric.NewPeriodicReader(exporter, metric.WithInterval(30*time.Second))),
		metric.WithResource(res),
	)

	return mp, nil
}

// LoadConfigFromEnv loads OpenTelemetry configuration from environment variables
func LoadConfigFromEnv() *Config {
	return &Config{
		ServiceName:    getEnv("OTEL_SERVICE_NAME", "meets-match"),
		ServiceVersion: getEnv("OTEL_SERVICE_VERSION", "1.0.0"),
		Environment:    getEnv("ENVIRONMENT", "development"),
		OTLPEndpoint:   getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
		Enabled:        getEnv("OTEL_ENABLED", "true") == "true",
	}
}

// InitializeOpenTelemetry initializes OpenTelemetry with the given configuration
func InitializeOpenTelemetry(ctx context.Context, config *Config) (func(), error) {
	provider, err := NewProvider(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create OpenTelemetry provider: %w", err)
	}

	// Return shutdown function
	return func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := provider.Shutdown(shutdownCtx); err != nil {
			logger := GetContextualLogger(shutdownCtx)
			logger.WithFields(map[string]interface{}{
				"operation": "shutdown_otel",
				"service":   "telemetry",
			}).WithError(err).Error("Error shutting down OpenTelemetry")
		}
	}, nil
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
