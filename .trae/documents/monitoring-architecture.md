# Comprehensive Monitoring Architecture with SigNoz and OpenTelemetry

## 1. Architecture Overview

This document outlines the implementation of a comprehensive monitoring, alerting, and logging solution using SigNoz and OpenTelemetry across our entire application stack. The solution provides end-to-end observability for our containerized Go Telegram bot, TypeScript API, React frontend, PostgreSQL, Redis, and Nginx services.

### 1.1 Architecture Diagram

```mermaid
graph TB
    subgraph "Application Services"
        A[Go Telegram Bot]
        B[TypeScript API]
        C[React Frontend]
        D[Nginx Reverse Proxy]
    end
    
    subgraph "Data Layer"
        E[PostgreSQL]
        F[Redis]
    end
    
    subgraph "Monitoring Stack"
        G[SigNoz]
        H[OpenTelemetry Collector]
        I[Jaeger]
        J[ClickHouse]
    end
    
    A --> H
    B --> H
    C --> H
    D --> H
    E --> H
    F --> H
    
    H --> G
    H --> I
    G --> J
```

### 1.2 Technology Stack

* **Observability Platform**: SigNoz (self-hosted)

* **Instrumentation**: OpenTelemetry (Go, Node.js, Browser)

* **Metrics Storage**: ClickHouse

* **Tracing Backend**: Jaeger

* **Log Aggregation**: SigNoz Logs

* **Containerization**: Docker Compose

## 2. SigNoz Setup and Configuration

### 2.1 SigNoz Docker Compose Configuration

Create `deployments/monitoring/docker-compose.signoz.yml`:

```yaml
version: '3.8'

services:
  # SigNoz Services
  clickhouse:
    image: clickhouse/clickhouse-server:22.8-alpine
    container_name: signoz-clickhouse
    hostname: clickhouse
    ports:
      - "9000:9000"
      - "8123:8123"
    volumes:
      - ./clickhouse-config.xml:/etc/clickhouse-server/config.xml
      - ./clickhouse-users.xml:/etc/clickhouse-server/users.xml
      - ./custom-function.xml:/etc/clickhouse-server/custom-function.xml
      - ./clickhouse-cluster.xml:/etc/clickhouse-server/config.d/cluster.xml
      - signoz-clickhouse-data:/var/lib/clickhouse/
    environment:
      - CLICKHOUSE_DB=signoz_traces
      - CLICKHOUSE_USER=signoz
      - CLICKHOUSE_PASSWORD=signoz
    restart: on-failure
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "localhost:8123/ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  alertmanager:
    image: prom/alertmanager:v0.23.0
    container_name: signoz-alertmanager
    volumes:
      - ./alertmanager-config.yml:/etc/alertmanager/config.yml
    command:
      - '--config.file=/etc/alertmanager/config.yml'
      - '--storage.path=/alertmanager'
    ports:
      - "9093:9093"
    restart: on-failure

  query-service:
    image: signoz/query-service:0.39.0
    container_name: signoz-query-service
    command: ["-config=/root/config/prometheus.yml"]
    volumes:
      - ./prometheus.yml:/root/config/prometheus.yml
      - ../logs/signoz/:/var/log/signoz/
    environment:
      - ClickHouseUrl=tcp://clickhouse:9000
      - ALERTMANAGER_API_PREFIX=http://alertmanager:9093/api/v1
      - SIGNOZ_LOCAL_DB_PATH=/var/lib/signoz/signoz.db
      - DASHBOARDS_PATH=/root/config/dashboards
      - STORAGE=clickhouse
      - GODEBUG=netdns=go
      - TELEMETRY_ENABLED=true
      - DEPLOYMENT_TYPE=docker-standalone-amd
    restart: on-failure
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      clickhouse:
        condition: service_healthy
    ports:
      - "8080:8080"

  frontend:
    image: signoz/frontend:0.39.0
    container_name: signoz-frontend
    restart: on-failure
    depends_on:
      - alertmanager
      - query-service
    ports:
      - "3301:3301"
    volumes:
      - ../logs/signoz/:/var/log/signoz/

  otel-collector:
    image: signoz/signoz-otel-collector:0.88.11
    container_name: signoz-otel-collector
    command: ["--config=/etc/otelcol-contrib/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otelcol-contrib/otel-collector-config.yaml
      - /var/log:/var/log:ro
    environment:
      - OTEL_RESOURCE_ATTRIBUTES=service.name=signoz-otel-collector,service.version=0.88.11
    ports:
      - "1777:1777"     # pprof extension
      - "4317:4317"     # OTLP gRPC receiver
      - "4318:4318"     # OTLP HTTP receiver
      - "8888:8888"     # Prometheus metrics
      - "8889:8889"     # Prometheus exporter metrics
      - "13133:13133"   # health_check extension
      - "14250:14250"   # Jaeger gRPC
      - "14268:14268"   # Jaeger thrift HTTP
      - "9411:9411"     # Zipkin
    restart: on-failure
    depends_on:
      clickhouse:
        condition: service_healthy

  otel-collector-metrics:
    image: signoz/signoz-otel-collector:0.88.11
    container_name: signoz-otel-collector-metrics
    command: ["--config=/etc/otelcol-contrib/otel-collector-metrics-config.yaml"]
    volumes:
      - ./otel-collector-metrics-config.yaml:/etc/otelcol-contrib/otel-collector-metrics-config.yaml
    environment:
      - OTEL_RESOURCE_ATTRIBUTES=service.name=signoz-otel-collector-metrics,service.version=0.88.11
    ports:
      - "1778:1777"     # pprof extension
      - "8890:8888"     # Prometheus metrics
    restart: on-failure
    depends_on:
      clickhouse:
        condition: service_healthy

volumes:
  signoz-clickhouse-data:

networks:
  default:
    name: signoz-network
```

### 2.2 OpenTelemetry Collector Configuration

Create `deployments/monitoring/otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "http://localhost:3000"
            - "https://meetsmatch.app"
          allowed_headers:
            - "*"
  
  jaeger:
    protocols:
      grpc:
        endpoint: 0.0.0.0:14250
      thrift_http:
        endpoint: 0.0.0.0:14268
  
  zipkin:
    endpoint: 0.0.0.0:9411
  
  prometheus:
    config:
      scrape_configs:
        - job_name: 'otel-collector'
          scrape_interval: 10s
          static_configs:
            - targets: ['0.0.0.0:8888']
        - job_name: 'signoz-metrics'
          scrape_interval: 60s
          static_configs:
            - targets: ['query-service:8080']

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  
  memory_limiter:
    limit_mib: 1000
  
  resource:
    attributes:
      - key: service.namespace
        value: "meetsmatch"
        action: upsert

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000?dial_timeout=10s&compress=lz4
    database: signoz_traces
    username: signoz
    password: signoz
    ttl: 72h
    traces_table_name: signoz_traces
    metrics_table_name: signoz_metrics
    logs_table_name: signoz_logs
  
  prometheus:
    endpoint: "0.0.0.0:8889"
    const_labels:
      cluster: "meetsmatch-cluster"

service:
  pipelines:
    traces:
      receivers: [otlp, jaeger, zipkin]
      processors: [memory_limiter, batch, resource]
      exporters: [clickhouse]
    
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch, resource]
      exporters: [clickhouse, prometheus]
    
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [clickhouse]
  
  extensions: [health_check, pprof, zpages]
```

## 3. Application Instrumentation

### 3.1 Go Backend Instrumentation

Update `internal/monitoring/telemetry.go`:

```go
package monitoring

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

type TelemetryConfig struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	OTLPEndpoint   string
	SampleRate     float64
}

type Telemetry struct {
	tracer   trace.Tracer
	meter    metric.Meter
	shutdown func(context.Context) error
}

func NewTelemetry(config TelemetryConfig) (*Telemetry, error) {
	ctx := context.Background()

	// Create resource
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(config.ServiceName),
			semconv.ServiceVersion(config.ServiceVersion),
			semconv.DeploymentEnvironment(config.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Setup tracing
	traceExporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(config.OTLPEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	tracerProvider := trace.NewTracerProvider(
		trace.WithBatcher(traceExporter),
		trace.WithResource(res),
		trace.WithSampler(trace.TraceIDRatioBased(config.SampleRate)),
	)
	otel.SetTracerProvider(tracerProvider)

	// Setup metrics
	metricExporter, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpoint(config.OTLPEndpoint),
		otlpmetrichttp.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric exporter: %w", err)
	}

	meterProvider := metric.NewMeterProvider(
		metric.WithResource(res),
		metric.WithReader(metric.NewPeriodicReader(metricExporter,
			metric.WithInterval(30*time.Second))),
	)
	otel.SetMeterProvider(meterProvider)

	// Setup propagation
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer := otel.Tracer(config.ServiceName)
	meter := otel.Meter(config.ServiceName)

	shutdown := func(ctx context.Context) error {
		if err := tracerProvider.Shutdown(ctx); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
		if err := meterProvider.Shutdown(ctx); err != nil {
			log.Printf("Error shutting down meter provider: %v", err)
		}
		return nil
	}

	return &Telemetry{
		tracer:   tracer,
		meter:    meter,
		shutdown: shutdown,
	}, nil
}

func (t *Telemetry) Tracer() trace.Tracer {
	return t.tracer
}

func (t *Telemetry) Meter() metric.Meter {
	return t.meter
}

func (t *Telemetry) Shutdown(ctx context.Context) error {
	return t.shutdown(ctx)
}
```

### 3.2 Gin Middleware for HTTP Tracing

Create `internal/middleware/otel.go`:

```go
package middleware

import (
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

type OTelMiddleware struct {
	tracer          trace.Tracer
	requestCounter  metric.Int64Counter
	requestDuration metric.Float64Histogram
}

func NewOTelMiddleware(serviceName string) *OTelMiddleware {
	tracer := otel.Tracer(serviceName)
	meter := otel.Meter(serviceName)

	requestCounter, _ := meter.Int64Counter(
		"http_requests_total",
		metric.WithDescription("Total number of HTTP requests"),
	)

	requestDuration, _ := meter.Float64Histogram(
		"http_request_duration_seconds",
		metric.WithDescription("HTTP request duration in seconds"),
		metric.WithUnit("s"),
	)

	return &OTelMiddleware{
		tracer:          tracer,
		requestCounter:  requestCounter,
		requestDuration: requestDuration,
	}
}

func (m *OTelMiddleware) Handler() gin.HandlerFunc {
	return otelgin.Middleware("meetsmatch-api")
}

func (m *OTelMiddleware) MetricsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start).Seconds()

		attrs := []attribute.KeyValue{
			attribute.String("method", c.Request.Method),
			attribute.String("route", c.FullPath()),
			attribute.Int("status_code", c.Writer.Status()),
		}

		m.requestCounter.Add(c.Request.Context(), 1, metric.WithAttributes(attrs...))
		m.requestDuration.Record(c.Request.Context(), duration, metric.WithAttributes(attrs...))
	}
}
```

## 4. Database Monitoring

### 4.1 PostgreSQL Monitoring

Update `internal/database/postgres.go` to include OpenTelemetry instrumentation:

```go
package database

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	"go.opentelemetry.io/contrib/instrumentation/database/sql/otelsql"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

type PostgresMetrics struct {
	connectionsActive   metric.Int64UpDownCounter
	connectionsIdle     metric.Int64UpDownCounter
	queriesTotal        metric.Int64Counter
	queryDuration       metric.Float64Histogram
	connectionErrors    metric.Int64Counter
}

func NewPostgresConnection(dsn string) (*sql.DB, *PostgresMetrics, error) {
	// Register the instrumented driver
	driverName, err := otelsql.Register("postgres",
		otelsql.WithAttributes(
			semconv.DBSystemPostgreSQL,
		),
		otelsql.WithSpanOptions(otelsql.SpanOptions{
			Ping:                 true,
			RowsNext:             true,
			RowsClose:            true,
			RowsAffected:         true,
			LastInsertID:         true,
			Query:                true,
			QueryContext:         true,
			Exec:                 true,
			ExecContext:          true,
			Prepare:              true,
			PrepareContext:       true,
			ConnectorConnect:     true,
			ConnPing:             true,
			ConnPrepare:          true,
			ConnPrepareContext:   true,
			ConnExec:             true,
			ConnExecContext:      true,
			ConnQuery:            true,
			ConnQueryContext:     true,
			ConnBeginTx:          true,
			TxCommit:             true,
			TxRollback:           true,
		}),
	)
	if err != nil {
		return nil, nil, err
	}

	db, err := sql.Open(driverName, dsn)
	if err != nil {
		return nil, nil, err
	}

	// Setup metrics
	meter := otel.Meter("postgres")
	metrics := &PostgresMetrics{}

	metrics.connectionsActive, _ = meter.Int64UpDownCounter(
		"db_connections_active",
		metric.WithDescription("Number of active database connections"),
	)

	metrics.connectionsIdle, _ = meter.Int64UpDownCounter(
		"db_connections_idle",
		metric.WithDescription("Number of idle database connections"),
	)

	metrics.queriesTotal, _ = meter.Int64Counter(
		"db_queries_total",
		metric.WithDescription("Total number of database queries"),
	)

	metrics.queryDuration, _ = meter.Float64Histogram(
		"db_query_duration_seconds",
		metric.WithDescription("Database query duration in seconds"),
		metric.WithUnit("s"),
	)

	metrics.connectionErrors, _ = meter.Int64Counter(
		"db_connection_errors_total",
		metric.WithDescription("Total number of database connection errors"),
	)

	// Start metrics collection goroutine
	go metrics.collectConnectionMetrics(db)

	return db, metrics, nil
}

func (m *PostgresMetrics) collectConnectionMetrics(db *sql.DB) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		stats := db.Stats()
		ctx := context.Background()

		m.connectionsActive.Add(ctx, int64(stats.OpenConnections))
		m.connectionsIdle.Add(ctx, int64(stats.Idle))
	}
}
```

### 4.2 Redis Monitoring

Create `internal/cache/redis_otel.go`:

```go
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/github.com/redis/go-redis/v9/redisotel"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

type RedisMetrics struct {
	connectionsActive metric.Int64UpDownCounter
	operationsTotal   metric.Int64Counter
	operationDuration metric.Float64Histogram
	cacheHits         metric.Int64Counter
	cacheMisses       metric.Int64Counter
	memoryUsage       metric.Int64UpDownCounter
}

func NewRedisClientWithOTel(addr, password string, db int) (*redis.Client, *RedisMetrics, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	// Enable OpenTelemetry instrumentation
	if err := redisotel.InstrumentTracing(rdb); err != nil {
		return nil, nil, err
	}
	if err := redisotel.InstrumentMetrics(rdb); err != nil {
		return nil, nil, err
	}

	// Setup custom metrics
	meter := otel.Meter("redis")
	metrics := &RedisMetrics{}

	metrics.connectionsActive, _ = meter.Int64UpDownCounter(
		"redis_connections_active",
		metric.WithDescription("Number of active Redis connections"),
	)

	metrics.operationsTotal, _ = meter.Int64Counter(
		"redis_operations_total",
		metric.WithDescription("Total number of Redis operations"),
	)

	metrics.operationDuration, _ = meter.Float64Histogram(
		"redis_operation_duration_seconds",
		metric.WithDescription("Redis operation duration in seconds"),
		metric.WithUnit("s"),
	)

	metrics.cacheHits, _ = meter.Int64Counter(
		"redis_cache_hits_total",
		metric.WithDescription("Total number of cache hits"),
	)

	metrics.cacheMisses, _ = meter.Int64Counter(
		"redis_cache_misses_total",
		metric.WithDescription("Total number of cache misses"),
	)

	metrics.memoryUsage, _ = meter.Int64UpDownCounter(
		"redis_memory_usage_bytes",
		metric.WithDescription("Redis memory usage in bytes"),
	)

	// Start metrics collection
	go metrics.collectRedisMetrics(rdb)

	return rdb, metrics, nil
}

func (m *RedisMetrics) collectRedisMetrics(rdb *redis.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		ctx := context.Background()
		
		// Get Redis info
		info := rdb.Info(ctx, "memory", "stats")
		if info.Err() != nil {
			continue
		}

		// Parse and record metrics
		// Implementation depends on parsing Redis INFO output
		// This is a simplified version
		poolStats := rdb.PoolStats()
		m.connectionsActive.Add(ctx, int64(poolStats.TotalConns))
	}
}
```

## 5. Nginx Monitoring

### 5.1 Nginx Configuration with OpenTelemetry

Create `deployments/nginx/nginx.conf`:

```nginx
load_module modules/ngx_http_opentelemetry_module.so;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # OpenTelemetry configuration
    opentelemetry_config /etc/nginx/otel-nginx.toml;
    opentelemetry on;
    opentelemetry_operation_name "HTTP $request_method $uri";
    opentelemetry_propagate;

    # Logging format with trace information
    log_format otel_json escape=json
    '{
        "timestamp": "$time_iso8601",
        "remote_addr": "$remote_addr",
        "request_method": "$request_method",
        "request_uri": "$request_uri",
        "status": $status,
        "body_bytes_sent": $body_bytes_sent,
        "request_time": $request_time,
        "upstream_response_time": "$upstream_response_time",
        "trace_id": "$opentelemetry_trace_id",
        "span_id": "$opentelemetry_span_id",
        "user_agent": "$http_user_agent",
        "referer": "$http_referer"
    }';

    access_log /var/log/nginx/access.log otel_json;
    error_log /var/log/nginx/error.log warn;

    # Upstream definitions
    upstream api_backend {
        server api:8080;
        keepalive 32;
    }

    upstream bot_backend {
        server bot:8081;
        keepalive 32;
    }

    # Main server block
    server {
        listen 80;
        server_name localhost;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # API routes
        location /api/ {
            opentelemetry_operation_name "API $request_method $uri";
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # OpenTelemetry headers
            proxy_set_header traceparent $opentelemetry_context_traceparent;
            proxy_set_header tracestate $opentelemetry_context_tracestate;
        }

        # Bot webhook
        location /webhook/ {
            opentelemetry_operation_name "BOT $request_method $uri";
            proxy_pass http://bot_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # OpenTelemetry headers
            proxy_set_header traceparent $opentelemetry_context_traceparent;
            proxy_set_header tracestate $opentelemetry_context_tracestate;
        }

        # Frontend
        location / {
            opentelemetry_operation_name "FRONTEND $request_method $uri";
            proxy_pass http://frontend:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # Metrics endpoint for Prometheus
    server {
        listen 9113;
        location /metrics {
            stub_status on;
            access_log off;
            allow 172.16.0.0/12;  # Docker networks
            deny all;
        }
    }
}
```

Create `deployments/nginx/otel-nginx.toml`:

```toml
exporter = "otlp"
processor = "batch"

[exporters.otlp]
host = "signoz-otel-collector"
port = 4317

[processors.batch]
max_queue_size = 2048
schedule_delay_millis = 5000
max_export_batch_size = 512

[service]
name = "nginx"
namespace = "meetsmatch"
version = "1.0.0"
instance_id = "nginx-1"
```

## 6. Frontend Instrumentation

### 6.1 React Frontend OpenTelemetry Setup

Create `web/frontend/src/utils/telemetry.ts`:

```typescript
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint: string;
}

export class FrontendTelemetry {
  private provider: WebTracerProvider;
  private meterProvider: MeterProvider;

  constructor(config: TelemetryConfig) {
    // Create resource
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
    });

    // Setup tracing
    this.provider = new WebTracerProvider({
      resource,
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${config.otlpEndpoint}/v1/traces`,
    });

    this.provider.addSpanProcessor(
      new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 1000,
        scheduledDelayMillis: 30000,
      })
    );

    this.provider.register({
      contextManager: new ZoneContextManager(),
    });

    // Setup metrics
    const metricExporter = new OTLPMetricExporter({
      url: `${config.otlpEndpoint}/v1/metrics`,
    });

    this.meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 30000,
        }),
      ],
    });

    // Register auto-instrumentations
    registerInstrumentations({
      instrumentations: [
        getWebAutoInstrumentations({
          '@opentelemetry/instrumentation-document-load': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-user-interaction': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-fetch': {
            enabled: true,
            propagateTraceHeaderCorsUrls: [
              /^https?:\/\/localhost.*/,
              /^https?:\/\/.*\.meetsmatch\.app.*/,
            ],
          },
          '@opentelemetry/instrumentation-xml-http-request': {
            enabled: true,
            propagateTraceHeaderCorsUrls: [
              /^https?:\/\/localhost.*/,
              /^https?:\/\/.*\.meetsmatch\.app.*/,
            ],
          },
        }),
      ],
    });
  }

  getTracer(name: string) {
    return this.provider.getTracer(name);
  }

  getMeter(name: string) {
    return this.meterProvider.getMeter(name);
  }
}

// Initialize telemetry
const telemetry = new FrontendTelemetry({
  serviceName: 'meetsmatch-frontend',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.REACT_APP_OTEL_ENDPOINT || 'http://localhost:4318',
});

export default telemetry;
```

## 7. Centralized Logging

### 7.1 Structured Logging Configuration

Update `internal/monitoring/logging.go`:

```go
package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type StructuredLogger struct {
	logger *zap.Logger
}

type LogEntry struct {
	Timestamp     time.Time              `json:"timestamp"`
	Level         string                 `json:"level"`
	Message       string                 `json:"message"`
	Service       string                 `json:"service"`
	Version       string                 `json:"version"`
	Environment   string                 `json:"environment"`
	TraceID       string                 `json:"trace_id,omitempty"`
	SpanID        string                 `json:"span_id,omitempty"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
	UserID        string                 `json:"user_id,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	StackTrace    string                 `json:"stack_trace,omitempty"`
}

func NewStructuredLogger(serviceName, version, environment string) (*StructuredLogger, error) {
	config := zap.NewProductionConfig()
	config.EncoderConfig.TimeKey = "timestamp"
	config.EncoderConfig.LevelKey = "level"
	config.EncoderConfig.MessageKey = "message"
	config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	config.EncoderConfig.EncodeLevel = zapcore.LowercaseLevelEncoder

	logger, err := config.Build(
		zap.AddCallerSkip(1),
		zap.Fields(
			zap.String("service", serviceName),
			zap.String("version", version),
			zap.String("environment", environment),
		),
	)
	if err != nil {
		return nil, err
	}

	return &StructuredLogger{logger: logger}, nil
}

func (l *StructuredLogger) LogInfo(ctx context.Context, message string, metadata map[string]interface{}) {
	l.logWithContext(ctx, zapcore.InfoLevel, message, metadata, "")
}

func (l *StructuredLogger) LogWarning(ctx context.Context, message string, metadata map[string]interface{}) {
	l.logWithContext(ctx, zapcore.WarnLevel, message, metadata, "")
}

func (l *StructuredLogger) LogError(ctx context.Context, message string, stackTrace string, metadata map[string]interface{}) {
	l.logWithContext(ctx, zapcore.ErrorLevel, message, metadata, stackTrace)
}

func (l *StructuredLogger) logWithContext(ctx context.Context, level zapcore.Level, message string, metadata map[string]interface{}, stackTrace string) {
	fields := []zap.Field{}

	// Extract trace information from context
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		fields = append(fields,
			zap.String("trace_id", span.SpanContext().TraceID().String()),
			zap.String("span_id", span.SpanContext().SpanID().String()),
		)
	}

	// Extract correlation ID from context
	if correlationID := ctx.Value("correlation_id"); correlationID != nil {
		if id, ok := correlationID.(string); ok {
			fields = append(fields, zap.String("correlation_id", id))
		}
	}

	// Extract user ID from context
	if userID := ctx.Value("user_id"); userID != nil {
		if id, ok := userID.(string); ok {
			fields = append(fields, zap.String("user_id", id))
		}
	}

	// Add metadata
	if metadata != nil {
		for key, value := range metadata {
			fields = append(fields, zap.Any(key, value))
		}
	}

	// Add stack trace for errors
	if stackTrace != "" {
		fields = append(fields, zap.String("stack_trace", stackTrace))
	}

	// Log the message
	switch level {
	case zapcore.InfoLevel:
		l.logger.Info(message, fields...)
	case zapcore.WarnLevel:
		l.logger.Warn(message, fields...)
	case zapcore.ErrorLevel:
		l.logger.Error(message, fields...)
	default:
		l.logger.Info(message, fields...)
	}
}

func (l *StructuredLogger) Sync() error {
	return l.logger.Sync()
}
```

## 8. Alert Rules and Dashboards

### 8.1 SigNoz Alert Rules

Create `deployments/monitoring/alert-rules.yaml`:

```yaml
groups:
  - name: meetsmatch.rules
    rules:
      # Application Health Alerts
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
          ) > 0.05
        for: 2m
        labels:
          severity: critical
          service: "{{ $labels.service }}"
        annotations:
          summary: "High error rate detected for {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }} for service {{ $labels.service }}"

      - alert: HighResponseTime
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 2
        for: 5m
        labels:
          severity: warning
          service: "{{ $labels.service }}"
        annotations:
          summary: "High response time for {{ $labels.service }}"
          description: "95th percentile response time is {{ $value }}s for service {{ $labels.service }}"

      # Database Alerts
      - alert: DatabaseConnectionsHigh
        expr: db_connections_active > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High number of database connections"
          description: "Database has {{ $value }} active connections"

      - alert: DatabaseSlowQueries
        expr: |
          histogram_quantile(0.95, sum(rate(db_query_duration_seconds_bucket[5m])) by (le)) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow database queries detected"
          description: "95th percentile query time is {{ $value }}s"

      # Redis Alerts
      - alert: RedisMemoryHigh
        expr: redis_memory_usage_bytes > 1073741824  # 1GB
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Redis memory usage"
          description: "Redis memory usage is {{ $value | humanizeBytes }}"

      - alert: RedisCacheMissRateHigh
        expr: |
          (
            sum(rate(redis_cache_misses_total[5m]))
            /
            (sum(rate(redis_cache_hits_total[5m])) + sum(rate(redis_cache_misses_total[5m])))
          ) > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High cache miss rate"
          description: "Cache miss rate is {{ $value | humanizePercentage }}"

      # System Alerts
      - alert: HighMemoryUsage
        expr: go_memstats_alloc_bytes > 536870912  # 512MB
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage for {{ $labels.service }}"
          description: "Memory usage is {{ $value | humanizeBytes }}"

      - alert: HighGoroutineCount
        expr: go_goroutines > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High goroutine count for {{ $labels.service }}"
          description: "Goroutine count is {{ $value }}"

      # Telegram Bot Specific Alerts
      - alert: TelegramMessageProcessingErrors
        expr: |
          sum(rate(telegram_messages_total{status="error"}[5m])) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High Telegram message processing errors"
          description: "Error rate is {{ $value }} messages/second"

      - alert: TelegramMessageProcessingDelay
        expr: |
          histogram_quantile(0.95, sum(rate(telegram_message_processing_duration_seconds_bucket[5m])) by (le)) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Telegram message processing delay"
          description: "95th percentile processing time is {{ $value }}s"
```

### 8.2 Notification Configuration

Create `deployments/monitoring/alertmanager-config.yml`:

```yaml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@meetsmatch.app'
  smtp_auth_username: 'alerts@meetsmatch.app'
  smtp_auth_password: 'your-email-password'

route:
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
    - match:
        severity: warning
      receiver: 'warning-alerts'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:5001/'

  - name: 'critical-alerts'
    email_configs:
      - to: 'admin@meetsmatch.app'
        subject: '[CRITICAL] {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Service: {{ .Labels.service }}
          Severity: {{ .Labels.severity }}
          {{ end }}
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts'
        title: '[CRITICAL] {{ .GroupLabels.alertname }}'
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Service:* {{ .Labels.service }}
          {{ end }}

  - name: 'warning-alerts'
    email_configs:
      - to: 'team@meetsmatch.app'
        subject: '[WARNING] {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Service: {{ .Labels.service }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

## 9. Docker Compose Integration

### 9.1 Main Application Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # Application Services
  bot:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.bot
    container_name: meetsmatch-bot
    environment:
      - DATABASE_URL=postgres://meetsmatch:password@postgres:5432/meetsmatch?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318
      - OTEL_SERVICE_NAME=meetsmatch-bot
      - OTEL_SERVICE_VERSION=1.0.0
      - ENVIRONMENT=production
    depends_on:
      - postgres
      - redis
      - signoz-otel-collector
    networks:
      - app-network
      - signoz-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  api:
    build:
      context: .
      dockerfile: deployments/docker/Dockerfile.api
    container_name: meetsmatch-api
    environment:
      - DATABASE_URL=postgres://meetsmatch:password@postgres:5432/meetsmatch?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318
      - OTEL_SERVICE_NAME=meetsmatch-api
      - OTEL_SERVICE_VERSION=1.0.0
      - ENVIRONMENT=production
    depends_on:
      - postgres
      - redis
      - signoz-otel-collector
    networks:
      - app-network
      - signoz-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./web/frontend
      dockerfile: Dockerfile
    container_name: meetsmatch-frontend
    environment:
      - REACT_APP_API_URL=http://localhost/api
      - REACT_APP_OTEL_ENDPOINT=http://localhost:4318
      - REACT_APP_ENVIRONMENT=production
    networks:
      - app-network
    restart: unless-stopped

  nginx:
    build:
      context: ./deployments/nginx
      dockerfile: Dockerfile
    container_name: meetsmatch-nginx
    ports:
      - "80:80"
      - "443:443"
      - "9113:9113"  # Metrics endpoint
    volumes:
      - ./deployments/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./deployments/nginx/otel-nginx.toml:/etc/nginx/otel-nginx.toml:ro
      - nginx-logs:/var/log/nginx
    depends_on:
      - api
      - bot
      - frontend
    networks:
      - app-network
      - signoz-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Database Services
  postgres:
    image: postgres:15-alpine
    container_name: meetsmatch-postgres
    environment:
      - POSTGRES_DB=meetsmatch
      - POSTGRES_USER=meetsmatch
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - app-network
      - signoz-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U meetsmatch"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: meetsmatch-redis
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    networks:
      - app-network
      - signoz-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Monitoring Services (from signoz compose)
  signoz-clickhouse:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: clickhouse
    networks:
      - signoz-network

  signoz-query-service:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: query-service
    networks:
      - signoz-network

  signoz-frontend:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: frontend
    networks:
      - signoz-network

  signoz-otel-collector:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: otel-collector
    networks:
      - app-network
      - signoz-network

  signoz-otel-collector-metrics:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: otel-collector-metrics
    networks:
      - signoz-network

  signoz-alertmanager:
    extends:
      file: deployments/monitoring/docker-compose.signoz.yml
      service: alertmanager
    networks:
      - signoz-network

volumes:
  postgres-data:
  redis-data:
  nginx-logs:
  signoz-clickhouse-data:

networks:
  app-network:
    driver: bridge
  signoz-network:
    driver: bridge
```

## 10. Implementation Steps

### 10.1 Phase 1: Infrastructure Setup

1. **Create monitoring directory structure**:

   ```bash
   mkdir -p deployments/monitoring
   mkdir -p deployments/nginx
   mkdir -p deployments/docker
   ```

2. **Deploy SigNoz stack**:

   ```bash
   cd deployments/monitoring
   docker-compose -f docker-compose.signoz.yml up -d
   ```

3. **Verify SigNoz installation**:

   * Access SigNoz UI at `http://localhost:3301`

   * Check collector health at `http://localhost:13133`

### 10.2 Phase 2: Application Instrumentation

1. **Update Go dependencies**:

   ```bash
   go mod tidy
   ```

2. **Implement OpenTelemetry in Go services**:

   * Update main.go files to initialize telemetry

   * Add middleware to HTTP handlers

   * Instrument database connections

3. **Update frontend with OpenTelemetry**:

   ```bash
   cd web/frontend
   npm install @opentelemetry/api @opentelemetry/sdk-trace-web @opentelemetry/auto-instrumentations-web
   ```

### 10.3 Phase 3: Database and Infrastructure Monitoring

1. **Configure PostgreSQL monitoring**:

   * Update database connection code

   * Enable query instrumentation

2. **Configure Redis monitoring**:

   * Update Redis client initialization

   * Add custom metrics collection

3. **Configure Nginx monitoring**:

   * Build Nginx with OpenTelemetry module

   * Update configuration files

### 10.4 Phase 4: Alerting and Dashboards

1. **Import alert rules**:

   ```bash
   curl -X POST http://localhost:8080/api/v1/rules \
     -H "Content-Type: application/yaml" \
     --data-binary @alert-rules.yaml
   ```

2. **Configure notification channels**:

   * Set up email SMTP configuration

   * Configure Slack webhooks

   * Test alert delivery

3. **Create custom dashboards**:
   - Application performance dashboard
   - Database performance dashboard
   - Infrastructure overview dashboard
   - Business metrics dashboard

### 10.5 Phase 5: Testing and Validation

1. **Test trace propagation**:
   ```bash
   curl -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
        http://localhost/api/health
   ```

2. **Validate metrics collection**:
   - Check metrics in SigNoz UI
   - Verify alert rule evaluation
   - Test notification delivery

3. **Load testing**:
   ```bash
   # Install k6 for load testing
   k6 run --vus 10 --duration 30s load-test.js
   ```

## 11. Performance Metrics and SLIs/SLOs

### 11.1 Service Level Indicators (SLIs)

| Service | SLI | Measurement |
|---------|-----|-------------|
| API | Availability | Percentage of successful HTTP requests (status < 500) |
| API | Latency | 95th percentile response time < 500ms |
| Bot | Message Processing | 99% of messages processed within 2 seconds |
| Database | Query Performance | 95th percentile query time < 100ms |
| Redis | Cache Hit Rate | Cache hit rate > 90% |

### 11.2 Service Level Objectives (SLOs)

| Service | SLO | Target | Measurement Window |
|---------|-----|--------|--------------------|---|
| API | Availability | 99.9% | 30 days |
| API | Latency | 95th percentile < 500ms | 7 days |
| Bot | Message Processing | 99% within 2s | 24 hours |
| Database | Availability | 99.95% | 30 days |
| Redis | Availability | 99.9% | 30 days |

### 11.3 Error Budget Calculation

```yaml
# Error Budget Configuration
error_budgets:
  api_availability:
    slo: 99.9%
    window: 30d
    budget: 0.1%  # 43.2 minutes downtime per month
  
  api_latency:
    slo: 95th_percentile < 500ms
    window: 7d
    budget: 5%    # 5% of requests can exceed 500ms
  
  bot_processing:
    slo: 99% within 2s
    window: 24h
    budget: 1%    # 1% of messages can exceed 2s
```

## 12. Dashboard Configurations

### 12.1 Application Overview Dashboard

```json
{
  "dashboard": {
    "title": "MeetsMatch Application Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Response Time (95th percentile)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Active Users",
        "type": "stat",
        "targets": [
          {
            "expr": "telegram_active_users",
            "legendFormat": "Active Users"
          }
        ]
      }
    ]
  }
}
```

### 12.2 Database Performance Dashboard

```json
{
  "dashboard": {
    "title": "Database Performance",
    "panels": [
      {
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "db_connections_active",
            "legendFormat": "Active Connections"
          },
          {
            "expr": "db_connections_idle",
            "legendFormat": "Idle Connections"
          }
        ]
      },
      {
        "title": "Query Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(db_query_duration_seconds_bucket[5m])) by (le, operation))",
            "legendFormat": "{{operation}} (95th percentile)"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(redis_cache_hits_total[5m])) / (sum(rate(redis_cache_hits_total[5m])) + sum(rate(redis_cache_misses_total[5m])))",
            "legendFormat": "Hit Rate"
          }
        ]
      }
    ]
  }
}
```

## 13. Troubleshooting Guide

### 13.1 Common Issues

**Issue: Traces not appearing in SigNoz**
- Check OTEL collector logs: `docker logs signoz-otel-collector`
- Verify endpoint configuration in application
- Ensure network connectivity between services

**Issue: High memory usage alerts**
- Check for memory leaks in application code
- Review goroutine count and database connection pools
- Analyze heap dumps if necessary

**Issue: Database connection errors**
- Check PostgreSQL logs: `docker logs meetsmatch-postgres`
- Verify connection string and credentials
- Monitor connection pool metrics

### 13.2 Performance Optimization

1. **Database Optimization**:
   - Add database indexes for frequently queried columns
   - Implement connection pooling
   - Use read replicas for read-heavy workloads

2. **Cache Optimization**:
   - Implement cache warming strategies
   - Use appropriate TTL values
   - Monitor cache hit rates and adjust accordingly

3. **Application Optimization**:
   - Implement request batching
   - Use async processing for non-critical operations
   - Optimize serialization/deserialization

## 14. Security Considerations

### 14.1 Monitoring Security

- **Access Control**: Implement RBAC for SigNoz dashboard access
- **Data Encryption**: Enable TLS for all monitoring communications
- **Sensitive Data**: Avoid logging sensitive information in traces
- **Network Security**: Use private networks for monitoring traffic

### 14.2 Compliance

- **Data Retention**: Configure appropriate retention policies
- **Audit Logging**: Enable audit logs for monitoring system access
- **Privacy**: Ensure user data privacy in monitoring data

## 15. Maintenance and Operations

### 15.1 Regular Maintenance Tasks

1. **Weekly**:
   - Review alert noise and adjust thresholds
   - Check dashboard accuracy and relevance
   - Analyze performance trends

2. **Monthly**:
   - Update monitoring dependencies
   - Review and update alert rules
   - Capacity planning based on metrics

3. **Quarterly**:
   - Review SLIs/SLOs and adjust targets
   - Conduct monitoring system health checks
   - Update documentation

### 15.2 Backup and Recovery

```bash
# Backup SigNoz data
docker exec signoz-clickhouse clickhouse-client --query="BACKUP DATABASE signoz_traces TO Disk('backups', 'backup_$(date +%Y%m%d).zip')"

# Backup monitoring configurations
tar -czf monitoring-config-$(date +%Y%m%d).tar.gz deployments/monitoring/
```

## 16. Cost Optimization

### 16.1 Resource Management

- **Sampling**: Implement intelligent sampling for high-volume traces
- **Retention**: Configure appropriate data retention policies
- **Compression**: Enable compression for metrics and logs storage
- **Resource Limits**: Set appropriate resource limits for monitoring containers

### 16.2 Monitoring Costs

```yaml
# Resource limits for monitoring services
resources:
  signoz-clickhouse:
    limits:
      memory: 4Gi
      cpu: 2
    requests:
      memory: 2Gi
      cpu: 1
  
  signoz-otel-collector:
    limits:
      memory: 1Gi
      cpu: 500m
    requests:
      memory: 512Mi
      cpu: 250m
```

This comprehensive monitoring architecture provides end-to-end observability for the MeetsMatch application, ensuring high availability, performance, and reliability while maintaining cost efficiency and security best practices.

