package monitoring

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/XSAM/otelsql"
	"github.com/go-redis/redis/extra/redisotel/v8"
	"github.com/go-redis/redis/v8"
	_ "github.com/lib/pq" // PostgreSQL driver
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// DatabaseInstrumentation provides OpenTelemetry instrumentation for database operations
type DatabaseInstrumentation struct {
	tracer trace.Tracer
	meter  metric.Meter

	// Database metrics
	dbConnectionsActive   metric.Int64UpDownCounter
	dbConnectionsIdle     metric.Int64UpDownCounter
	dbConnectionsTotal    metric.Int64Counter
	dbQueryDuration       metric.Float64Histogram
	dbQueryTotal          metric.Int64Counter
	dbTransactionDuration metric.Float64Histogram
	dbTransactionTotal    metric.Int64Counter
}

// NewDatabaseInstrumentation creates a new database instrumentation instance
func NewDatabaseInstrumentation() (*DatabaseInstrumentation, error) {
	tracer := otel.Tracer(instrumentationName, trace.WithInstrumentationVersion(instrumentationVersion))
	meter := otel.Meter(instrumentationName, metric.WithInstrumentationVersion(instrumentationVersion))

	// Create database metrics
	dbConnectionsActive, err := meter.Int64UpDownCounter(
		"db_connections_active",
		metric.WithDescription("Number of active database connections"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_connections_active counter: %w", err)
	}

	dbConnectionsIdle, err := meter.Int64UpDownCounter(
		"db_connections_idle",
		metric.WithDescription("Number of idle database connections"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_connections_idle counter: %w", err)
	}

	dbConnectionsTotal, err := meter.Int64Counter(
		"db_connections_total",
		metric.WithDescription("Total number of database connections created"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_connections_total counter: %w", err)
	}

	dbQueryDuration, err := meter.Float64Histogram(
		"db_query_duration_seconds",
		metric.WithDescription("Database query duration in seconds"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_query_duration_seconds histogram: %w", err)
	}

	dbQueryTotal, err := meter.Int64Counter(
		"db_query_total",
		metric.WithDescription("Total number of database queries"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_query_total counter: %w", err)
	}

	dbTransactionDuration, err := meter.Float64Histogram(
		"db_transaction_duration_seconds",
		metric.WithDescription("Database transaction duration in seconds"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_transaction_duration_seconds histogram: %w", err)
	}

	dbTransactionTotal, err := meter.Int64Counter(
		"db_transaction_total",
		metric.WithDescription("Total number of database transactions"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create db_transaction_total counter: %w", err)
	}

	return &DatabaseInstrumentation{
		tracer:                tracer,
		meter:                 meter,
		dbConnectionsActive:   dbConnectionsActive,
		dbConnectionsIdle:     dbConnectionsIdle,
		dbConnectionsTotal:    dbConnectionsTotal,
		dbQueryDuration:       dbQueryDuration,
		dbQueryTotal:          dbQueryTotal,
		dbTransactionDuration: dbTransactionDuration,
		dbTransactionTotal:    dbTransactionTotal,
	}, nil
}

// InstrumentPostgreSQL creates an instrumented PostgreSQL database connection
func (d *DatabaseInstrumentation) InstrumentPostgreSQL(dataSourceName string) (*sql.DB, error) {
	// Register the otelsql wrapper for the postgres driver
	driverName, err := otelsql.Register("postgres",
		otelsql.WithAttributes(
			attribute.String("db.system", "postgresql"),
		),
		otelsql.WithSpanOptions(otelsql.SpanOptions{
			Ping:                 true,
			DisableQuery:         false,
			OmitConnResetSession: false,
			OmitConnPrepare:      false,
			OmitConnQuery:        false,
			OmitRows:             false,
			OmitConnectorConnect: false,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to register otelsql driver: %w", err)
	}

	// Open database connection with instrumentation
	db, err := sql.Open(driverName, dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(1 * time.Minute)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Start connection pool metrics collection
	go d.collectConnectionPoolMetrics(db)

	return db, nil
}

// InstrumentRedis creates an instrumented Redis client
func (d *DatabaseInstrumentation) InstrumentRedis(options *redis.Options) *redis.Client {
	// Create Redis client
	client := redis.NewClient(options)

	// Add OpenTelemetry hook
	client.AddHook(redisotel.NewTracingHook(
		redisotel.WithAttributes(
			attribute.String("db.system", "redis"),
			attribute.String("db.redis.database_index", fmt.Sprintf("%d", options.DB)),
		),
	))

	return client
}

// collectConnectionPoolMetrics collects database connection pool metrics
func (d *DatabaseInstrumentation) collectConnectionPoolMetrics(db *sql.DB) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		stats := db.Stats()
		ctx := context.Background()

		// Record connection pool metrics
		d.dbConnectionsActive.Add(ctx, int64(stats.OpenConnections),
			metric.WithAttributes(
				attribute.String("db.system", "postgresql"),
				attribute.String("state", "active"),
			),
		)

		d.dbConnectionsIdle.Add(ctx, int64(stats.Idle),
			metric.WithAttributes(
				attribute.String("db.system", "postgresql"),
				attribute.String("state", "idle"),
			),
		)

		d.dbConnectionsTotal.Add(ctx, int64(stats.OpenConnections),
			metric.WithAttributes(
				attribute.String("db.system", "postgresql"),
			),
		)
	}
}

// TraceQuery wraps a database query with tracing
func (d *DatabaseInstrumentation) TraceQuery(ctx context.Context, query string, args ...interface{}) (context.Context, trace.Span) {
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		// Add query information to existing span
		span.SetAttributes(
			attribute.String("db.statement", query),
			attribute.Int("db.args.count", len(args)),
		)
		return ctx, span
	}

	// Create new span for query
	ctx, span = d.tracer.Start(ctx, "db.query",
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			attribute.String("db.system", "postgresql"),
			attribute.String("db.statement", query),
			attribute.Int("db.args.count", len(args)),
		),
	)

	return ctx, span
}

// TraceTransaction wraps a database transaction with tracing
func (d *DatabaseInstrumentation) TraceTransaction(ctx context.Context, name string) (context.Context, trace.Span) {
	ctx, span := d.tracer.Start(ctx, fmt.Sprintf("db.transaction.%s", name),
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			attribute.String("db.system", "postgresql"),
			attribute.String("db.operation", "transaction"),
			attribute.String("db.transaction.name", name),
		),
	)

	return ctx, span
}

// RecordQueryMetrics records metrics for a database query
func (d *DatabaseInstrumentation) RecordQueryMetrics(ctx context.Context, operation string, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("db.system", "postgresql"),
		attribute.String("db.operation", operation),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	d.dbQueryTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	d.dbQueryDuration.Record(ctx, duration.Seconds(), metric.WithAttributes(attributes...))
}

// RecordTransactionMetrics records metrics for a database transaction
func (d *DatabaseInstrumentation) RecordTransactionMetrics(ctx context.Context, operation string, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("db.system", "postgresql"),
		attribute.String("db.operation", operation),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	d.dbTransactionTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	d.dbTransactionDuration.Record(ctx, duration.Seconds(), metric.WithAttributes(attributes...))
}
