# Telegram Bot Architecture

## Overview

The MeetsMatch Telegram bot supports both **polling** and **webhook** modes, automatically switching based on configuration. This dual-mode architecture provides flexibility for different deployment environments.

## Architecture Modes

### 1. Webhook Mode (Production)

**When**: `TELEGRAM_WEBHOOK_URL` environment variable is set

**How it works**:
- Bot registers a webhook URL with Telegram
- Telegram sends updates via HTTP POST to `/webhook` endpoint
- Gin HTTP server handles incoming requests
- More efficient for production with high message volume

**Configuration**:
```bash
TELEGRAM_WEBHOOK_URL=https://your-domain.com
BOT_PORT=8081
```

**Advantages**:
- Real-time message delivery
- Lower server resource usage
- Better scalability
- No constant polling overhead

### 2. Polling Mode (Development)

**When**: `TELEGRAM_WEBHOOK_URL` is not set or empty

**How it works**:
- Bot continuously polls Telegram API for updates
- Webhook is explicitly deleted to avoid conflicts
- Updates processed through registered handlers
- Ideal for local development and testing

**Configuration**:
```bash
# TELEGRAM_WEBHOOK_URL not set or empty
BOT_PORT=8081
```

**Advantages**:
- Simple setup for development
- Works behind NAT/firewall
- No need for public domain/SSL
- Easy debugging and testing

## Implementation Details

### Main Bot Setup (`cmd/bot/main.go`)

```go
// Automatic mode detection
if webhookURL != "" {
    // Webhook mode: Set webhook URL
    _, err = botAPI.SetWebhook(ctx, &bot.SetWebhookParams{
        URL: webhookURL + "/webhook",
    })
    log.Printf("Webhook set to %s", webhookURL+"/webhook")
} else {
    // Polling mode: Remove webhook and start polling
    _, err = botAPI.DeleteWebhook(ctx, &bot.DeleteWebhookParams{})
    botHandler.RegisterHandlers()
    go func() {
        botAPI.Start(ctx)
    }()
    log.Println("Bot started in polling mode")
}
```

### HTTP Server

Both modes run an HTTP server for:
- Health checks (`/health`)
- Metrics endpoint (`/metrics`)
- Webhook endpoint (`/webhook`) - only used in webhook mode

### Handler Architecture

```go
type Handler struct {
    bot                 *bot.Bot
    userService         *services.UserService
    matchingService     *services.MatchingService
    messagingService    *services.MessagingService
    authMiddleware      *middleware.AuthMiddleware
    loggingMiddleware   *middleware.LoggingMiddleware
    rateLimitMiddleware *middleware.RateLimitMiddleware
    stateManager        *StateManager
}
```

## Configuration Recommendations

### Development Environment

```bash
# .env.development
TELEGRAM_BOT_TOKEN=your_bot_token
# TELEGRAM_WEBHOOK_URL not set (polling mode)
BOT_PORT=8081
DB_HOST=localhost
DB_PORT=5432
```

### Staging Environment

```bash
# .env.staging
TELEGRAM_BOT_TOKEN=your_staging_bot_token
TELEGRAM_WEBHOOK_URL=https://staging.meetsmatch.com
BOT_PORT=8081
```

### Production Environment

```bash
# .env.production
TELEGRAM_BOT_TOKEN=your_production_bot_token
TELEGRAM_WEBHOOK_URL=https://api.meetsmatch.com
BOT_PORT=8081
```

## Security Considerations

### Webhook Security
- Use HTTPS for webhook URLs
- Validate incoming requests
- Implement rate limiting
- Use secret tokens for webhook validation (recommended)

### Polling Security
- Secure bot token storage
- Network security for API calls
- Rate limiting on outgoing requests

## Monitoring and Health Checks

### Health Endpoint
```bash
GET /health
# Response: {"status": "healthy", "service": "telegram-bot"}
```

### Metrics Endpoint
```bash
GET /metrics
# Response: {"metrics": "placeholder"}
```

## Deployment Considerations

### Docker Deployment
```dockerfile
# Webhook mode
ENV TELEGRAM_WEBHOOK_URL=https://your-domain.com
EXPOSE 8081
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telegram-bot
spec:
  template:
    spec:
      containers:
      - name: bot
        env:
        - name: TELEGRAM_WEBHOOK_URL
          value: "https://api.meetsmatch.com"
        ports:
        - containerPort: 8081
```

### Load Balancer Configuration
- Route `/webhook` to bot service
- Health check on `/health`
- SSL termination for webhook security

## Troubleshooting

### Common Issues

1. **Webhook not receiving updates**
   - Check webhook URL accessibility
   - Verify SSL certificate
   - Check Telegram webhook info: `getWebhookInfo`

2. **Polling not working**
   - Ensure webhook is deleted
   - Check bot token validity
   - Verify network connectivity

3. **Duplicate updates**
   - Ensure only one mode is active
   - Check for multiple bot instances

### Debug Commands

```bash
# Check webhook status
curl -X GET "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Delete webhook manually
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Set webhook manually
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/webhook"
```

## Performance Optimization

### Webhook Mode
- Use connection pooling
- Implement request queuing
- Add response caching
- Monitor response times

### Polling Mode
- Adjust polling intervals
- Implement exponential backoff
- Handle rate limits gracefully
- Monitor API quota usage

## Migration Between Modes

### Development to Production
1. Set `TELEGRAM_WEBHOOK_URL` environment variable
2. Ensure webhook endpoint is accessible
3. Deploy with new configuration
4. Verify webhook registration

### Production to Development
1. Remove `TELEGRAM_WEBHOOK_URL` environment variable
2. Restart bot service
3. Verify polling mode activation
4. Check webhook deletion in logs