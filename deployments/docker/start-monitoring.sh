#!/bin/bash

# SigNoz Monitoring Stack Startup Script
# This script initializes and starts the complete monitoring infrastructure

set -e

echo "🚀 Starting SigNoz Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p ./data/clickhouse
mkdir -p ./data/alertmanager
mkdir -p ./data/prometheus
mkdir -p ./logs

# Set proper permissions
echo "🔐 Setting permissions..."
chmod -R 755 ./data
chmod -R 755 ./logs

# Pull latest images
echo "📥 Pulling latest Docker images..."
docker-compose -f docker-compose.monitoring.yml pull

# Start ClickHouse first (dependency for other services)
echo "🗄️ Starting ClickHouse..."
docker-compose -f docker-compose.monitoring.yml up -d clickhouse

# Wait for ClickHouse to be ready
echo "⏳ Waiting for ClickHouse to be ready..."
for i in {1..30}; do
    if docker-compose -f docker-compose.monitoring.yml exec -T clickhouse clickhouse-client --query "SELECT 1" > /dev/null 2>&1; then
        echo "✅ ClickHouse is ready!"
        break
    fi
    echo "Waiting for ClickHouse... ($i/30)"
    sleep 2
done

# Initialize ClickHouse databases
echo "🔧 Initializing ClickHouse databases..."
docker-compose -f docker-compose.monitoring.yml exec -T clickhouse clickhouse-client --query "
CREATE DATABASE IF NOT EXISTS signoz_traces;
CREATE DATABASE IF NOT EXISTS signoz_metrics;
CREATE DATABASE IF NOT EXISTS signoz_logs;
"

# Start AlertManager
echo "🚨 Starting AlertManager..."
docker-compose -f docker-compose.monitoring.yml up -d alertmanager

# Start OpenTelemetry Collectors
echo "📊 Starting OpenTelemetry Collectors..."
docker-compose -f docker-compose.monitoring.yml up -d otel-collector otel-collector-metrics

# Start SigNoz Query Service
echo "🔍 Starting SigNoz Query Service..."
docker-compose -f docker-compose.monitoring.yml up -d query-service

# Wait for Query Service to be ready
echo "⏳ Waiting for Query Service to be ready..."
for i in {1..30}; do
    if curl -f http://localhost:8080/api/v1/health > /dev/null 2>&1; then
        echo "✅ Query Service is ready!"
        break
    fi
    echo "Waiting for Query Service... ($i/30)"
    sleep 2
done

# Start SigNoz Frontend
echo "🖥️ Starting SigNoz Frontend..."
docker-compose -f docker-compose.monitoring.yml up -d frontend

# Start Logspout for Docker log collection
echo "📝 Starting Logspout..."
docker-compose -f docker-compose.monitoring.yml up -d logspout

# Start exporters for database monitoring
echo "📈 Starting database exporters..."
docker-compose -f docker-compose.monitoring.yml up -d postgres-exporter redis-exporter

# Start Nginx exporter
echo "🌐 Starting Nginx exporter..."
docker-compose -f docker-compose.monitoring.yml up -d nginx-exporter

# Start Node exporter for system metrics
echo "💻 Starting Node exporter..."
docker-compose -f docker-compose.monitoring.yml up -d node-exporter

# Final health check
echo "🏥 Performing health checks..."
sleep 10

# Check SigNoz Frontend
if curl -f http://localhost:3301 > /dev/null 2>&1; then
    echo "✅ SigNoz Frontend is accessible at http://localhost:3301"
else
    echo "⚠️ SigNoz Frontend might not be ready yet. Please wait a few more minutes."
fi

# Check Query Service
if curl -f http://localhost:8080/api/v1/health > /dev/null 2>&1; then
    echo "✅ SigNoz Query Service is healthy"
else
    echo "⚠️ SigNoz Query Service might not be ready yet"
fi

# Check AlertManager
if curl -f http://localhost:9093/-/healthy > /dev/null 2>&1; then
    echo "✅ AlertManager is healthy"
else
    echo "⚠️ AlertManager might not be ready yet"
fi

# Show running services
echo "\n📋 Running services:"
docker-compose -f docker-compose.monitoring.yml ps

echo "\n🎉 SigNoz Monitoring Stack started successfully!"
echo "\n📊 Access points:"
echo "   • SigNoz UI: http://localhost:3301"
echo "   • AlertManager: http://localhost:9093"
echo "   • Query Service: http://localhost:8080"
echo "   • ClickHouse: http://localhost:8123"
echo "\n📚 Useful commands:"
echo "   • View logs: docker-compose -f docker-compose.monitoring.yml logs -f [service]"
echo "   • Stop stack: docker-compose -f docker-compose.monitoring.yml down"
echo "   • Restart service: docker-compose -f docker-compose.monitoring.yml restart [service]"
echo "\n⚡ The monitoring stack is now collecting metrics, traces, and logs!"