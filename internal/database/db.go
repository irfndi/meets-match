package database

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"github.com/XSAM/otelsql"
	_ "github.com/lib/pq"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

type DB struct {
	*sql.DB
}

type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

func NewConnection(config Config) (*DB, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"host":      config.Host,
		"port":      config.Port,
		"database":  config.DBName,
		"ssl_mode":  config.SSLMode,
		"operation": "database_connection",
	})

	logger.Info("Establishing database connection")

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.DBName,
		config.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		logger.WithError(err).Error("Failed to open database connection")
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	logger.Debug("Database connection pool configured")

	// Test the connection
	if err := db.Ping(); err != nil {
		logger.WithError(err).Error("Failed to ping database")
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info("Database connection established successfully")
	return &DB{db}, nil
}

// NewInstrumentedConnection creates a new database connection with OpenTelemetry instrumentation
func NewInstrumentedConnection(config Config) (*DB, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"host":            config.Host,
		"port":            config.Port,
		"database":        config.DBName,
		"ssl_mode":        config.SSLMode,
		"operation":       "instrumented_database_connection",
		"instrumentation": "opentelemetry",
	})

	logger.Info("Establishing instrumented database connection")

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.DBName,
		config.SSLMode,
	)

	// Convert port to integer
	port, _ := strconv.Atoi(config.Port)

	// Open database with OpenTelemetry instrumentation
	db, err := otelsql.Open("postgres", dsn,
		otelsql.WithAttributes(
			semconv.DBSystemPostgreSQL,
			semconv.DBName(config.DBName),
			semconv.NetPeerName(config.Host),
			semconv.NetPeerPort(port),
		),
	)
	if err != nil {
		logger.WithError(err).Error("Failed to open instrumented database connection")
		return nil, fmt.Errorf("failed to open instrumented database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	logger.Debug("Instrumented database connection pool configured")

	// Test the connection
	if err := db.Ping(); err != nil {
		logger.WithError(err).Error("Failed to ping instrumented database")
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Register database stats for metrics
	if err := otelsql.RegisterDBStatsMetrics(db,
		otelsql.WithAttributes(
			semconv.DBSystemPostgreSQL,
			semconv.DBName(config.DBName),
		),
	); err != nil {
		logger.WithError(err).Warn("Failed to register database stats")
	}

	logger.Info("Instrumented database connection established successfully")
	return &DB{db}, nil
}

func (db *DB) Close() error {
	return db.DB.Close()
}

func (db *DB) Health() error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "database_health_check",
	})

	logger.Debug("Performing database health check")

	err := db.Ping()
	if err != nil {
		logger.WithError(err).Error("Database health check failed")
	} else {
		logger.Debug("Database health check passed")
	}

	return err
}

// Transaction helper
func (db *DB) WithTransaction(fn func(*sql.Tx) error) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "database_transaction",
	})

	logger.Debug("Starting database transaction")

	tx, err := db.Begin()
	if err != nil {
		logger.WithError(err).Error("Failed to begin transaction")
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			logger.WithField("panic", p).Error("Transaction panicked, rolling back")
			tx.Rollback()
			panic(p)
		} else if err != nil {
			logger.WithError(err).Warn("Transaction failed, rolling back")
			tx.Rollback()
		} else {
			err = tx.Commit()
			if err != nil {
				logger.WithError(err).Error("Failed to commit transaction")
			} else {
				logger.Debug("Transaction committed successfully")
			}
		}
	}()

	return fn(tx)
}
