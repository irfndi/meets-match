# Telegram Bot Architecture Documentation

## Overview

This Telegram bot service supports both **polling** and **webhook** modes, providing flexibility for different deployment scenarios and requirements.

## Architecture Modes

### 1. Webhook Mode (Recommended for Production)

**When to use:**
- Production environments
- High-traffic bots
- When you have a stable public URL with HTTPS
- Better resource efficiency
- Real-time message processing

**Configuration:**
```bash
# Set webhook URL to enable webhook mode
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_PORT=8080
```

**How it works:**
1. Bot registers a webhook URL with Telegram
2. Telegram sends updates via HTTP POST to your webhook endpoint
3. Your service processes updates immediately
4. Responds with HTTP 200 OK to acknowledge receipt

**Advantages:**
- ✅ Real-time message processing
- ✅ Lower server resource usage
- ✅ Better scalability
- ✅ No polling overhead
- ✅ Supports multiple bot instances behind load balancer

**Requirements:**
- HTTPS endpoint (SSL certificate required)
- Public IP address or domain
- Stable internet connection
- Port 80, 88, 443, or 8443

### 2. Polling Mode (Development/Testing)

**When to use:**
- Development environments
- Testing and debugging
- Local development without public URL
- Simple deployments
- Behind NAT/firewall without port forwarding

**Configuration:**
```bash
# Leave webhook URL empty to enable polling mode
# TELEGRAM_WEBHOOK_URL=  # commented out or empty
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_PORT=8080  # still needed for health checks and metrics
```

**How it works:**
1. Bot continuously polls Telegram's getUpdates API
2. Retrieves new messages in batches
3. Processes each update sequentially
4. Acknowledges processed updates

**Advantages:**
- ✅ No HTTPS requirement
- ✅ Works behind NAT/firewall
- ✅ Simple setup for development
- ✅ No webhook URL management

**Disadvantages:**
- ❌ Higher latency (polling interval)
- ❌ More server resources (continuous polling)
- ❌ Less efficient for high-traffic bots

## Configuration Guide

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather | - |
| `TELEGRAM_WEBHOOK_URL` | ❌ | Webhook URL (enables webhook mode) | "" (polling) |
| `BOT_PORT` | ❌ | HTTP server port | 8080 |
| `GIN_MODE` | ❌ | Gin framework mode | "release" |
| `DB_HOST` | ✅ | Database host | "localhost" |
| `DB_PORT` | ❌ | Database port | 5432 |
| `DB_USER` | ✅ | Database username | - |
| `DB_PASSWORD` | ✅ | Database password | - |
| `DB_NAME` | ✅ | Database name | - |
| `REDIS_ADDR` | ❌ | Redis address | "localhost:6379" |
| `REDIS_PASSWORD` | ❌ | Redis password | "" |
| `REDIS_DB` | ❌ | Redis database number | 0 |

### Mode Detection Logic

```go
// Automatic mode detection in main.go
webhookURL := os.Getenv("TELEGRAM_WEBHOOK_URL")

if webhookURL != "" {
    // Webhook mode
    log.Info("Starting bot in webhook mode", "url", webhookURL)
    err = botHandler.SetWebhook(webhookURL)
    if err != nil {
        log.Error("Failed to set webhook", "error", err)
        return
    }
} else {
    // Polling mode
    log.Info("Starting bot in polling mode")
    go botHandler.StartPolling()
}
```

## Deployment Recommendations

### Production Deployment (Webhook)

1. **Use HTTPS with valid SSL certificate**
   ```bash
   # Example with Let's Encrypt
   TELEGRAM_WEBHOOK_URL=https://bot.yourdomain.com/webhook
   ```

2. **Configure reverse proxy (Nginx/Apache)**
   ```nginx
   server {
       listen 443 ssl;
       server_name bot.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location /webhook {
           proxy_pass http://localhost:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Use environment-specific configurations**
   ```bash
   # Production
   GIN_MODE=release
   BOT_PORT=8080
   
   # Staging
   GIN_MODE=debug
   BOT_PORT=8081
   ```

4. **Implement health checks**
   ```bash
   # Health check endpoint
   curl https://bot.yourdomain.com/health
   ```

### Development Setup (Polling)

1. **Local development**
   ```bash
   # .env.local
   TELEGRAM_BOT_TOKEN=your_dev_bot_token
   # TELEGRAM_WEBHOOK_URL=  # empty for polling
   GIN_MODE=debug
   BOT_PORT=8080
   ```

2. **Testing with ngrok (optional webhook testing)**
   ```bash
   # Terminal 1: Start your bot
   go run cmd/bot/main.go
   
   # Terminal 2: Expose local server
   ngrok http 8080
   
   # Update environment
   TELEGRAM_WEBHOOK_URL=https://abc123.ngrok.io/webhook
   ```

## Error Handling & Recovery

### Webhook Mode Error Handling

- **Connection failures**: Telegram retries webhook calls
- **HTTP errors**: Return appropriate status codes
- **Processing errors**: Log and return 200 OK to prevent retries
- **Webhook validation**: Verify requests come from Telegram

### Polling Mode Error Handling

- **Network failures**: Automatic retry with exponential backoff
- **Rate limiting**: Respect Telegram's rate limits
- **Connection recovery**: Reconnect on connection loss

## Monitoring & Observability

### Health Checks

```bash
# Check bot health
GET /health

# Response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "mode": "webhook",
  "database": "connected",
  "redis": "connected",
  "webhook_info": {
    "url": "https://bot.yourdomain.com/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### Metrics

```bash
# Get bot metrics
GET /metrics

# Response
{
  "cache_stats": {
    "hits": 1250,
    "misses": 89,
    "hit_rate": 93.4
  },
  "message_stats": {
    "total_processed": 5432,
    "errors": 12,
    "success_rate": 99.8
  }
}
```

## Security Considerations

### Webhook Security

1. **Validate webhook requests**
   ```go
   // Verify request comes from Telegram
   func validateTelegramRequest(r *http.Request) bool {
       // Implement IP whitelist or secret token validation
       return true
   }
   ```

2. **Use HTTPS only**
   - Never use HTTP for webhooks in production
   - Telegram requires HTTPS for webhook URLs

3. **Implement rate limiting**
   ```go
   // Rate limit webhook requests
   rateLimiter := middleware.NewRateLimiter(100, time.Minute)
   ```

### General Security

1. **Secure bot token storage**
   - Use environment variables
   - Never commit tokens to version control
   - Rotate tokens regularly

2. **Input validation**
   - Validate all user inputs
   - Sanitize message content
   - Implement command validation

3. **Error handling**
   - Don't expose internal errors to users
   - Log security events
   - Implement proper error boundaries

## Troubleshooting

### Common Issues

1. **Webhook not receiving updates**
   - Check HTTPS certificate validity
   - Verify webhook URL accessibility
   - Check Telegram webhook info: `GET https://api.telegram.org/bot<token>/getWebhookInfo`

2. **Polling not working**
   - Verify bot token
   - Check network connectivity
   - Ensure no webhook is set

3. **High latency**
   - Switch from polling to webhook mode
   - Optimize database queries
   - Implement caching

### Debug Commands

```bash
# Check webhook status
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Delete webhook (switch to polling)
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://yourdomain.com/webhook"}'
```

## Performance Optimization

### Webhook Mode
- Use connection pooling
- Implement request queuing
- Add load balancing for multiple instances
- Use CDN for static content

### Polling Mode
- Optimize polling interval
- Implement batch processing
- Use efficient update handling
- Add circuit breakers

### General
- Implement Redis caching
- Use database connection pooling
- Add request/response compression
- Monitor and optimize database queries

## Migration Between Modes

### Polling to Webhook
1. Set up HTTPS endpoint
2. Update `TELEGRAM_WEBHOOK_URL` environment variable
3. Restart the bot service
4. Verify webhook is active

### Webhook to Polling
1. Remove or comment out `TELEGRAM_WEBHOOK_URL`
2. Restart the bot service
3. Bot will automatically delete webhook and start polling

## Conclusion

Choose the appropriate mode based on your deployment requirements:
- **Webhook**: Production environments with HTTPS
- **Polling**: Development, testing, or simple deployments

The bot service automatically detects and configures the appropriate mode based on the `TELEGRAM_WEBHOOK_URL` environment variable, making it easy to switch between modes without code changes.