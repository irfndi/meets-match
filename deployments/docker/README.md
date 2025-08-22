# SigNoz Monitoring Stack for Meets-Match

This directory contains the complete monitoring, alerting, and logging infrastructure for the Meets-Match application using SigNoz and OpenTelemetry.

## 🏗️ Architecture Overview

The monitoring stack consists of:

- **SigNoz**: Complete observability platform (traces, metrics, logs)
- **ClickHouse**: Time-series database for storing telemetry data
- **OpenTelemetry Collectors**: Data collection and processing
- **AlertManager**: Alert routing and notification management
- **Prometheus**: Metrics collection and alerting rules
- **Exporters**: Database and infrastructure metrics collection

## 📁 File Structure

```
deployments/docker/
├── docker-compose.monitoring.yml    # Main monitoring stack configuration
├── otel-collector-config.yaml       # OTel collector for traces/logs
├── otel-collector-metrics-config.yaml # OTel collector for metrics
├── clickhouse-config.xml            # ClickHouse database configuration
├── clickhouse-users.xml             # ClickHouse user management
├── clickhouse-cluster.xml           # ClickHouse cluster settings
├── custom-function.xml              # ClickHouse custom functions
├── alertmanager-config.yml          # Alert routing configuration
├── prometheus.yml                   # Prometheus scrape configuration
├── alert_rules.yml                  # Prometheus alerting rules
├── start-monitoring.sh              # Linux/macOS startup script
├── start-monitoring.ps1             # Windows PowerShell startup script
└── README.md                        # This documentation
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available for the monitoring stack
- Ports 3301, 8080, 8123, 9093 available

### Starting the Monitoring Stack

#### On Windows:
```powershell
.\start-monitoring.ps1
```

#### On Linux/macOS:
```bash
chmod +x start-monitoring.sh
./start-monitoring.sh
```

#### Manual Start:
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

### Stopping the Stack

```bash
docker-compose -f docker-compose.monitoring.yml down
```

## 🌐 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| SigNoz UI | http://localhost:3301 | Main observability dashboard |
| AlertManager | http://localhost:9093 | Alert management interface |
| Query Service | http://localhost:8080 | SigNoz API endpoint |
| ClickHouse | http://localhost:8123 | Database interface |

## 📊 Monitored Services

### Application Services
- **meets-match-api**: Go backend API server
- **meets-match-bot**: Telegram bot service
- **meets-match-frontend**: React frontend application

### Infrastructure Services
- **PostgreSQL**: Database metrics via postgres-exporter
- **Redis**: Cache metrics via redis-exporter
- **Nginx**: Web server metrics via nginx-exporter
- **Docker**: Container metrics via Docker API
- **System**: Host metrics via node-exporter

## 🚨 Alert Rules

### Application Alerts
- **HighErrorRate**: >5% error rate for 2 minutes
- **HighResponseTime**: >2s 95th percentile response time
- **ServiceDown**: Service unavailable for 1 minute
- **HighMemoryUsage**: >1GB memory usage
- **HighCPUUsage**: >80% CPU usage

### Database Alerts
- **DatabaseDown**: Database exporter unavailable
- **PostgreSQLHighConnections**: >80% connection usage
- **PostgreSQLSlowQueries**: Query efficiency <10%
- **RedisHighMemoryUsage**: >90% memory usage
- **RedisHighConnections**: >100 connected clients
- **RedisSlowLog**: >10 slow queries in 5 minutes

### Infrastructure Alerts
- **HighDiskUsage**: >85% disk usage
- **HighSystemLoad**: Load >2 for 5 minutes
- **NginxDown**: Nginx unavailable
- **NginxHighErrorRate**: >5% error rate

### Telegram Bot Alerts
- **TelegramBotHighErrorRate**: >10% error rate
- **TelegramBotSlowProcessing**: >5s processing time
- **TelegramBotQueueBacklog**: >100 messages in queue

## 📧 Notification Channels

Alerts are routed to different channels based on severity:

- **Critical Alerts**: Webhook + Email
- **Warning Alerts**: Email only
- **Database Alerts**: Database team email
- **Error Alerts**: Development team email

### Configuring Notifications

Edit `alertmanager-config.yml` to configure:
- SMTP settings for email notifications
- Webhook URLs for integrations
- Routing rules for different alert types

## 🔧 Configuration

### Environment Variables

Create a `.env` file in this directory:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=alerts@meets-match.com

# Webhook URLs
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...

# Database Connections
POSTGRES_EXPORTER_URL=postgresql://user:pass@postgres:5432/meets_match?sslmode=disable
REDIS_EXPORTER_URL=redis://redis:6379
```

### Customizing Metrics Collection

1. **Add new scrape targets** in `prometheus.yml`
2. **Modify collection intervals** in OTel collector configs
3. **Add custom alert rules** in `alert_rules.yml`
4. **Configure new exporters** in `docker-compose.monitoring.yml`

## 🔍 Troubleshooting

### Common Issues

#### ClickHouse Connection Issues
```bash
# Check ClickHouse logs
docker-compose -f docker-compose.monitoring.yml logs clickhouse

# Verify ClickHouse is responding
curl http://localhost:8123/ping
```

#### SigNoz UI Not Loading
```bash
# Check frontend logs
docker-compose -f docker-compose.monitoring.yml logs frontend

# Verify query service is healthy
curl http://localhost:8080/api/v1/health
```

#### Missing Metrics
```bash
# Check OTel collector logs
docker-compose -f docker-compose.monitoring.yml logs otel-collector
docker-compose -f docker-compose.monitoring.yml logs otel-collector-metrics

# Verify exporters are running
docker-compose -f docker-compose.monitoring.yml ps
```

#### Alerts Not Firing
```bash
# Check AlertManager logs
docker-compose -f docker-compose.monitoring.yml logs alertmanager

# Verify alert rules are loaded
curl http://localhost:9093/api/v1/rules
```

### Performance Tuning

#### For High-Volume Environments

1. **Increase ClickHouse resources**:
   ```yaml
   clickhouse:
     deploy:
       resources:
         limits:
           memory: 4G
           cpus: '2'
   ```

2. **Adjust collection intervals**:
   - Increase scrape intervals in `prometheus.yml`
   - Reduce batch sizes in OTel collector configs

3. **Configure data retention**:
   ```xml
   <!-- In clickhouse-config.xml -->
   <ttl_only_drop_parts>1</ttl_only_drop_parts>
   <merge_tree>
       <ttl_only_drop_parts>1</ttl_only_drop_parts>
   </merge_tree>
   ```

## 📈 Metrics Reference

### Application Metrics
- `http_requests_total`: Total HTTP requests
- `http_request_duration_seconds`: Request duration histogram
- `process_resident_memory_bytes`: Process memory usage
- `process_cpu_seconds_total`: Process CPU usage

### Database Metrics
- `pg_stat_database_*`: PostgreSQL database statistics
- `redis_memory_used_bytes`: Redis memory usage
- `redis_connected_clients`: Redis client connections

### Infrastructure Metrics
- `node_filesystem_*`: Filesystem usage
- `node_memory_*`: Memory statistics
- `node_cpu_*`: CPU statistics
- `nginx_http_requests_total`: Nginx request counts

### Telegram Bot Metrics
- `telegram_bot_messages_total`: Total messages processed
- `telegram_bot_errors_total`: Total errors
- `telegram_bot_processing_duration_seconds`: Processing time
- `telegram_bot_queue_size`: Current queue size

## 🔐 Security Considerations

1. **Network Security**:
   - Use Docker networks to isolate services
   - Expose only necessary ports
   - Configure firewall rules for production

2. **Authentication**:
   - Enable ClickHouse authentication in production
   - Use strong passwords for SMTP configuration
   - Secure webhook URLs

3. **Data Privacy**:
   - Configure log sampling to avoid sensitive data
   - Set appropriate data retention policies
   - Use TLS for external communications

## 📚 Additional Resources

- [SigNoz Documentation](https://signoz.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [ClickHouse Documentation](https://clickhouse.com/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [AlertManager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)

## 🤝 Contributing

To add new monitoring capabilities:

1. Update the appropriate configuration files
2. Add new alert rules if needed
3. Update this documentation
4. Test the changes in a development environment
5. Submit a pull request with your changes

## 📞 Support

For issues with the monitoring stack:

1. Check the troubleshooting section above
2. Review service logs using Docker Compose
3. Consult the official documentation
4. Create an issue in the project repository