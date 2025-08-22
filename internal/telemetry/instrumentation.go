package telemetry

import (
	"database/sql"
	"fmt"

	"github.com/XSAM/otelsql"
	"github.com/go-redis/redis/extra/redisotel/v8"
	"github.com/go-redis/redis/v8"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

// InstrumentDatabase wraps a database connection with OpenTelemetry instrumentation
func InstrumentDatabase(driverName, dataSourceName string) (*sql.DB, error) {
	// Open database with instrumentation
	db, err := otelsql.Open(driverName, dataSourceName,
		otelsql.WithAttributes(
			semconv.DBSystemPostgreSQL,
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to open instrumented database: %w", err)
	}

	// Register database stats metrics
	err = otelsql.RegisterDBStatsMetrics(db,
		otelsql.WithAttributes(
			semconv.DBSystemPostgreSQL,
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to register database stats: %w", err)
	}

	return db, nil
}

// InstrumentRedisClient instruments a Redis client with OpenTelemetry tracing and metrics
func InstrumentRedisClient(client *redis.Client) error {
	// Add tracing hook
	client.AddHook(redisotel.NewTracingHook())
	return nil
}

// InstrumentRedisClusterClient instruments a Redis cluster client with OpenTelemetry tracing and metrics
func InstrumentRedisClusterClient(client *redis.ClusterClient) error {
	// Add tracing hook
	client.AddHook(redisotel.NewTracingHook())
	return nil
}
