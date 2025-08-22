# SigNoz Monitoring Stack Startup Script for Windows
# This script initializes and starts the complete monitoring infrastructure

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting SigNoz Monitoring Stack..." -ForegroundColor Green

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is available
try {
    docker-compose --version | Out-Null
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Create necessary directories
Write-Host "📁 Creating necessary directories..." -ForegroundColor Yellow
$directories = @(
    "./data/clickhouse",
    "./data/alertmanager", 
    "./data/prometheus",
    "./logs"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "   Created: $dir" -ForegroundColor Gray
    }
}

# Pull latest images
Write-Host "📥 Pulling latest Docker images..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml pull

# Start ClickHouse first (dependency for other services)
Write-Host "🗄️ Starting ClickHouse..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d clickhouse

# Wait for ClickHouse to be ready
Write-Host "⏳ Waiting for ClickHouse to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 1

while ($attempt -le $maxAttempts) {
    try {
        $result = docker-compose -f docker-compose.monitoring.yml exec -T clickhouse clickhouse-client --query "SELECT 1" 2>$null
        if ($result -eq "1") {
            Write-Host "✅ ClickHouse is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Continue waiting
    }
    
    Write-Host "   Waiting for ClickHouse... ($attempt/$maxAttempts)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
    $attempt++
}

if ($attempt -gt $maxAttempts) {
    Write-Host "❌ ClickHouse failed to start within expected time" -ForegroundColor Red
    exit 1
}

# Initialize ClickHouse databases
Write-Host "🔧 Initializing ClickHouse databases..." -ForegroundColor Yellow
$initQuery = @"
CREATE DATABASE IF NOT EXISTS signoz_traces;
CREATE DATABASE IF NOT EXISTS signoz_metrics;
CREATE DATABASE IF NOT EXISTS signoz_logs;
"@

docker-compose -f docker-compose.monitoring.yml exec -T clickhouse clickhouse-client --query $initQuery

# Start AlertManager
Write-Host "🚨 Starting AlertManager..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d alertmanager

# Start OpenTelemetry Collectors
Write-Host "📊 Starting OpenTelemetry Collectors..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d otel-collector otel-collector-metrics

# Start SigNoz Query Service
Write-Host "🔍 Starting SigNoz Query Service..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d query-service

# Wait for Query Service to be ready
Write-Host "⏳ Waiting for Query Service to be ready..." -ForegroundColor Yellow
$attempt = 1

while ($attempt -le $maxAttempts) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Query Service is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Continue waiting
    }
    
    Write-Host "   Waiting for Query Service... ($attempt/$maxAttempts)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
    $attempt++
}

# Start SigNoz Frontend
Write-Host "🖥️ Starting SigNoz Frontend..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d frontend

# Start Logspout for Docker log collection
Write-Host "📝 Starting Logspout..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d logspout

# Start exporters for database monitoring
Write-Host "📈 Starting database exporters..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d postgres-exporter redis-exporter

# Start Nginx exporter
Write-Host "🌐 Starting Nginx exporter..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d nginx-exporter

# Start Node exporter for system metrics
Write-Host "💻 Starting Node exporter..." -ForegroundColor Yellow
docker-compose -f docker-compose.monitoring.yml up -d node-exporter

# Final health check
Write-Host "🏥 Performing health checks..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check SigNoz Frontend
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3301" -UseBasicParsing -TimeoutSec 10
    Write-Host "✅ SigNoz Frontend is accessible at http://localhost:3301" -ForegroundColor Green
} catch {
    Write-Host "⚠️ SigNoz Frontend might not be ready yet. Please wait a few more minutes." -ForegroundColor Yellow
}

# Check Query Service
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ SigNoz Query Service is healthy" -ForegroundColor Green
} catch {
    Write-Host "⚠️ SigNoz Query Service might not be ready yet" -ForegroundColor Yellow
}

# Check AlertManager
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9093/-/healthy" -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ AlertManager is healthy" -ForegroundColor Green
} catch {
    Write-Host "⚠️ AlertManager might not be ready yet" -ForegroundColor Yellow
}

# Show running services
Write-Host "`n📋 Running services:" -ForegroundColor Cyan
docker-compose -f docker-compose.monitoring.yml ps

Write-Host "`n🎉 SigNoz Monitoring Stack started successfully!" -ForegroundColor Green
Write-Host "`n📊 Access points:" -ForegroundColor Cyan
Write-Host "   • SigNoz UI: http://localhost:3301" -ForegroundColor White
Write-Host "   • AlertManager: http://localhost:9093" -ForegroundColor White
Write-Host "   • Query Service: http://localhost:8080" -ForegroundColor White
Write-Host "   • ClickHouse: http://localhost:8123" -ForegroundColor White
Write-Host "`n📚 Useful commands:" -ForegroundColor Cyan
Write-Host "   • View logs: docker-compose -f docker-compose.monitoring.yml logs -f [service]" -ForegroundColor White
Write-Host "   • Stop stack: docker-compose -f docker-compose.monitoring.yml down" -ForegroundColor White
Write-Host "   • Restart service: docker-compose -f docker-compose.monitoring.yml restart [service]" -ForegroundColor White
Write-Host "`n⚡ The monitoring stack is now collecting metrics, traces, and logs!" -ForegroundColor Green