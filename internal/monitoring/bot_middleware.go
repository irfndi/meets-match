package monitoring

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-telegram/bot/models"
)

// BotMonitoringMiddleware provides monitoring for Telegram bot interactions
type BotMonitoringMiddleware struct {
	metrics *MetricsCollector
	tracer  *Tracer
	alerts  *AlertManager
	config  *BotMiddlewareConfig
}

// BotMiddlewareConfig configures the bot monitoring middleware
type BotMiddlewareConfig struct {
	// EnableMetrics enables bot metrics collection
	EnableMetrics bool
	// EnableTracing enables bot interaction tracing
	EnableTracing bool
	// EnableAlerting enables alerting for bot issues
	EnableAlerting bool
	// SlowProcessingThreshold defines slow message processing
	SlowProcessingThreshold time.Duration
	// ErrorRateThreshold for alerting (percentage)
	ErrorRateThreshold float64
	// MaxMessageSize for alerting on large messages
	MaxMessageSize int
}

// DefaultBotMiddlewareConfig returns default bot monitoring configuration
func DefaultBotMiddlewareConfig() *BotMiddlewareConfig {
	return &BotMiddlewareConfig{
		EnableMetrics:           true,
		EnableTracing:           true,
		EnableAlerting:          true,
		SlowProcessingThreshold: 2 * time.Second,
		ErrorRateThreshold:      10.0, // 10% error rate
		MaxMessageSize:          4096, // Telegram's max message size
	}
}

// NewBotMonitoringMiddleware creates a new bot monitoring middleware
func NewBotMonitoringMiddleware(config *BotMiddlewareConfig) *BotMonitoringMiddleware {
	if config == nil {
		config = DefaultBotMiddlewareConfig()
	}

	bmm := &BotMonitoringMiddleware{
		config: config,
	}

	if config.EnableMetrics {
		bmm.metrics = NewMetricsCollector()
	}

	if config.EnableTracing {
		bmm.tracer = GetGlobalTracer()
		if bmm.tracer == nil {
			bmm.tracer = NewTracer(DefaultTracerConfig())
		}
	}

	if config.EnableAlerting {
		bmm.alerts = NewAlertManager(DefaultAlertConfig())
	}

	return bmm
}

// ProcessUpdate wraps update processing with monitoring
func (bmm *BotMonitoringMiddleware) ProcessUpdate(ctx context.Context, update *models.Update, handler func(context.Context, *models.Update) error) error {
	start := time.Now()
	updateType := bmm.getUpdateType(update)
	userID := bmm.getUserID(update)
	chatID := bmm.getChatID(update)

	// Start tracing span
	span := bmm.tracer.StartSpan("telegram_update", SpanKindInternal)
	if span != nil {
		span.SetTag("update.type", bmm.getUpdateType(update))
		span.SetTag("user.id", fmt.Sprintf("%d", bmm.getUserID(update)))
		span.SetTag("chat.id", fmt.Sprintf("%d", bmm.getChatID(update)))
	}

	// Process the update
	err := handler(ctx, update)

	// Update span with result
	if span != nil {
		if err != nil {
			span.Status = SpanStatusError
			span.LogError(err.Error())
		} else {
			span.Status = SpanStatusOK
		}
		span.Finish()
	}

	// Calculate duration
	duration := time.Since(start)

	// Finish span if tracing is enabled
	if span != nil {
		span.SetTag("duration_ms", strconv.FormatInt(duration.Milliseconds(), 10))
		span.SetTag("success", strconv.FormatBool(err == nil))

		if err != nil {
			span.Status = SpanStatusError
			span.SetTag("error", "true")
			span.SetTag("error.message", err.Error())
		} else {
			span.Status = SpanStatusOK
		}

		span.Finish()
	}

	// Record metrics if enabled
	if bmm.config.EnableMetrics && bmm.metrics != nil {
		bmm.recordUpdateMetrics(updateType, userID, chatID, duration, err)
	}

	// Check for alerting conditions if enabled
	if bmm.config.EnableAlerting && bmm.alerts != nil {
		bmm.checkBotAlertConditions(updateType, userID, chatID, duration, err)
	}

	return err
}

// ProcessMessage wraps message processing with monitoring
func (bmm *BotMonitoringMiddleware) ProcessMessage(ctx context.Context, message *models.Message, handler func(context.Context, *models.Message) error) error {
	start := time.Now()
	messageType := bmm.getMessageType(message)
	userID := message.From.ID
	chatID := message.Chat.ID
	messageSize := len(message.Text)

	// Start tracing if enabled
	var span *Span
	if bmm.config.EnableTracing && bmm.tracer != nil {
		span = bmm.tracer.StartSpan("bot.process_message", SpanKindInternal)
		if span != nil {
			span.SetTag("message.type", messageType)
			span.SetTag("user.id", strconv.FormatInt(userID, 10))
			span.SetTag("chat.id", strconv.FormatInt(chatID, 10))
			span.SetTag("message.size", strconv.Itoa(messageSize))
			span.SetTag("bot.operation", "process_message")

			// Add span to context
			ctx = context.WithValue(ctx, "span", span)
		}
	}

	// Process the message
	err := handler(ctx, message)

	// Calculate duration
	duration := time.Since(start)

	// Finish span if tracing is enabled
	if span != nil {
		span.SetTag("duration_ms", strconv.FormatInt(duration.Milliseconds(), 10))
		span.SetTag("success", strconv.FormatBool(err == nil))

		if err != nil {
			span.Status = SpanStatusError
			span.SetTag("error", "true")
			span.SetTag("error.message", err.Error())
		} else {
			span.Status = SpanStatusOK
		}

		span.Finish()
	}

	// Record metrics if enabled
	if bmm.config.EnableMetrics && bmm.metrics != nil {
		bmm.recordMessageMetrics(messageType, userID, chatID, messageSize, duration, err)
	}

	// Check for alerting conditions if enabled
	if bmm.config.EnableAlerting && bmm.alerts != nil {
		bmm.checkMessageAlertConditions(messageType, userID, chatID, messageSize, duration, err)
	}

	return err
}

// ProcessCallback wraps callback processing with monitoring
func (bmm *BotMonitoringMiddleware) ProcessCallback(ctx context.Context, callback *models.CallbackQuery, handler func(context.Context, *models.CallbackQuery) error) error {
	start := time.Now()
	userID := callback.From.ID
	chatID := int64(0)
	if callback.Message.Message != nil {
		chatID = callback.Message.Message.Chat.ID
	}
	callbackData := callback.Data

	// Start tracing if enabled
	var span *Span
	if bmm.config.EnableTracing && bmm.tracer != nil {
		span = bmm.tracer.StartSpan("bot.process_callback", SpanKindInternal)
		if span != nil {
			span.SetTag("callback.id", callback.ID)
			span.SetTag("callback.data", callbackData)
			span.SetTag("user.id", strconv.FormatInt(userID, 10))
			span.SetTag("chat.id", strconv.FormatInt(chatID, 10))
			span.SetTag("bot.operation", "process_callback")

			// Add span to context
			ctx = context.WithValue(ctx, "span", span)
		}
	}

	// Process the callback
	err := handler(ctx, callback)

	// Calculate duration
	duration := time.Since(start)

	// Finish span if tracing is enabled
	if span != nil {
		span.SetTag("duration_ms", strconv.FormatInt(duration.Milliseconds(), 10))
		span.SetTag("success", strconv.FormatBool(err == nil))

		if err != nil {
			span.Status = SpanStatusError
			span.SetTag("error", "true")
			span.SetTag("error.message", err.Error())
		} else {
			span.Status = SpanStatusOK
		}

		span.Finish()
	}

	// Record metrics if enabled
	if bmm.config.EnableMetrics && bmm.metrics != nil {
		bmm.recordCallbackMetrics(callbackData, userID, chatID, duration, err)
	}

	// Check for alerting conditions if enabled
	if bmm.config.EnableAlerting && bmm.alerts != nil {
		bmm.checkCallbackAlertConditions(callbackData, userID, chatID, duration, err)
	}

	return err
}

// getUpdateType determines the type of update
func (bmm *BotMonitoringMiddleware) getUpdateType(update *models.Update) string {
	if update.Message != nil {
		return "message"
	}
	if update.EditedMessage != nil {
		return "edited_message"
	}
	if update.CallbackQuery != nil {
		return "callback_query"
	}
	if update.InlineQuery != nil {
		return "inline_query"
	}
	if update.ChosenInlineResult != nil {
		return "chosen_inline_result"
	}
	if update.ChannelPost != nil {
		return "channel_post"
	}
	if update.EditedChannelPost != nil {
		return "edited_channel_post"
	}
	return "unknown"
}

// getUserID extracts user ID from update
func (bmm *BotMonitoringMiddleware) getUserID(update *models.Update) int64 {
	if update.Message != nil && update.Message.From != nil {
		return update.Message.From.ID
	}
	if update.EditedMessage != nil && update.EditedMessage.From != nil {
		return update.EditedMessage.From.ID
	}
	if update.CallbackQuery != nil {
		return update.CallbackQuery.From.ID
	}
	if update.InlineQuery != nil {
		return update.InlineQuery.From.ID
	}
	if update.ChosenInlineResult != nil {
		return update.ChosenInlineResult.From.ID
	}
	return 0
}

// getChatID extracts chat ID from update
func (bmm *BotMonitoringMiddleware) getChatID(update *models.Update) int64 {
	if update.Message != nil {
		return update.Message.Chat.ID
	}
	if update.EditedMessage != nil {
		return update.EditedMessage.Chat.ID
	}
	if update.CallbackQuery != nil {
		// Handle MaybeInaccessibleMessage
		if update.CallbackQuery.Message.Message != nil {
			return update.CallbackQuery.Message.Message.Chat.ID
		}
	}
	if update.ChannelPost != nil {
		return update.ChannelPost.Chat.ID
	}
	if update.EditedChannelPost != nil {
		return update.EditedChannelPost.Chat.ID
	}
	return 0
}

// getMessageType determines the type of message
func (bmm *BotMonitoringMiddleware) getMessageType(message *models.Message) string {
	if message.Text != "" {
		return "text"
	}
	if message.Photo != nil {
		return "photo"
	}
	if message.Video != nil {
		return "video"
	}
	if message.Audio != nil {
		return "audio"
	}
	if message.Document != nil {
		return "document"
	}
	if message.Sticker != nil {
		return "sticker"
	}
	if message.Voice != nil {
		return "voice"
	}
	if message.Contact != nil {
		return "contact"
	}
	if message.Location != nil {
		return "location"
	}
	return "other"
}

// recordUpdateMetrics records metrics for update processing
func (bmm *BotMonitoringMiddleware) recordUpdateMetrics(updateType string, userID, chatID int64, duration time.Duration, err error) {
	labels := map[string]string{
		"update_type": updateType,
		"user_id":     strconv.FormatInt(userID, 10),
		"chat_id":     strconv.FormatInt(chatID, 10),
	}

	// Update count
	bmm.metrics.NewCounter("bot_updates_total", "Total bot updates processed", labels).Inc()

	// Processing duration
	bmm.metrics.NewHistogram("bot_update_duration_seconds", "Bot update processing duration", labels, nil).Observe(duration.Seconds())

	// Error count
	if err != nil {
		errorLabels := map[string]string{
			"update_type": updateType,
			"error_type":  "processing_error",
		}
		bmm.metrics.NewCounter("bot_errors_total", "Total bot errors", errorLabels).Inc()
	}

	// Slow processing
	if duration > bmm.config.SlowProcessingThreshold {
		slowLabels := map[string]string{
			"update_type": updateType,
		}
		bmm.metrics.NewCounter("bot_slow_updates_total", "Total slow bot updates", slowLabels).Inc()
	}
}

// recordMessageMetrics records metrics for message processing
func (bmm *BotMonitoringMiddleware) recordMessageMetrics(messageType string, userID, chatID int64, messageSize int, duration time.Duration, err error) {
	labels := map[string]string{
		"message_type": messageType,
		"user_id":      strconv.FormatInt(userID, 10),
		"chat_id":      strconv.FormatInt(chatID, 10),
	}

	// Message count
	bmm.metrics.NewCounter("bot_messages_total", "Total bot messages processed", labels).Inc()

	// Message size
	bmm.metrics.NewHistogram("bot_message_size_bytes", "Bot message size", labels, nil).Observe(float64(messageSize))

	// Processing duration
	bmm.metrics.NewHistogram("bot_message_duration_seconds", "Bot message processing duration", labels, nil).Observe(duration.Seconds())

	// Error count
	if err != nil {
		errorLabels := map[string]string{
			"message_type": messageType,
			"error_type":   "processing_error",
		}
		bmm.metrics.NewCounter("bot_message_errors_total", "Total bot message errors", errorLabels).Inc()
	}
}

// recordCallbackMetrics records metrics for callback processing
func (bmm *BotMonitoringMiddleware) recordCallbackMetrics(callbackData string, userID, chatID int64, duration time.Duration, err error) {
	labels := map[string]string{
		"callback_data": callbackData,
		"user_id":       strconv.FormatInt(userID, 10),
		"chat_id":       strconv.FormatInt(chatID, 10),
	}

	// Callback count
	bmm.metrics.NewCounter("bot_callbacks_total", "Total bot callbacks processed", labels).Inc()

	// Processing duration
	bmm.metrics.NewHistogram("bot_callback_duration_seconds", "Bot callback processing duration", labels, nil).Observe(duration.Seconds())

	// Error count
	if err != nil {
		errorLabels := map[string]string{
			"callback_data": callbackData,
			"error_type":    "processing_error",
		}
		bmm.metrics.NewCounter("bot_callback_errors_total", "Total bot callback errors", errorLabels).Inc()
	}
}

// checkBotAlertConditions checks for bot-specific alert conditions
func (bmm *BotMonitoringMiddleware) checkBotAlertConditions(updateType string, userID, chatID int64, duration time.Duration, err error) {
	// Alert on processing errors
	if err != nil {
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "bot_processing_error",
			Level:       AlertLevelError,
			Status:      AlertStatusFiring,
			Message:     "Bot processing error",
			Description: "Error processing " + updateType + ": " + err.Error(),
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"update_type": updateType,
				"user_id":     strconv.FormatInt(userID, 10),
				"chat_id":     strconv.FormatInt(chatID, 10),
				"error":       err.Error(),
			},
		}
		bmm.alerts.TriggerAlert(*alert)
	}

	// Alert on slow processing
	if duration > bmm.config.SlowProcessingThreshold {
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "bot_slow_processing",
			Level:       AlertLevelWarning,
			Status:      AlertStatusFiring,
			Message:     "Slow bot processing",
			Description: "Update processing took " + duration.String() + " for " + updateType,
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"update_type": updateType,
				"user_id":     strconv.FormatInt(userID, 10),
				"chat_id":     strconv.FormatInt(chatID, 10),
				"duration":    duration.String(),
			},
		}
		bmm.alerts.TriggerAlert(*alert)
	}
}

// checkMessageAlertConditions checks for message-specific alert conditions
func (bmm *BotMonitoringMiddleware) checkMessageAlertConditions(messageType string, userID, chatID int64, messageSize int, _ time.Duration, _ error) {
	// Alert on large messages
	if messageSize > bmm.config.MaxMessageSize {
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "bot_large_message",
			Level:       AlertLevelWarning,
			Status:      AlertStatusFiring,
			Message:     "Large message detected",
			Description: "Message size " + strconv.Itoa(messageSize) + " bytes exceeds limit",
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"message_type": messageType,
				"user_id":      strconv.FormatInt(userID, 10),
				"chat_id":      strconv.FormatInt(chatID, 10),
				"message_size": strconv.Itoa(messageSize),
			},
		}
		bmm.alerts.TriggerAlert(*alert)
	}
}

// checkCallbackAlertConditions checks for callback-specific alert conditions
func (bmm *BotMonitoringMiddleware) checkCallbackAlertConditions(callbackData string, userID, chatID int64, _ time.Duration, err error) {
	// Alert on callback errors
	if err != nil {
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "bot_callback_error",
			Level:       AlertLevelError,
			Status:      AlertStatusFiring,
			Message:     "Bot callback error",
			Description: "Error processing callback " + callbackData + ": " + err.Error(),
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"callback_data": callbackData,
				"user_id":       strconv.FormatInt(userID, 10),
				"chat_id":       strconv.FormatInt(chatID, 10),
				"error":         err.Error(),
			},
		}
		bmm.alerts.TriggerAlert(*alert)
	}
}

// GetMetrics returns the metrics collector
func (bmm *BotMonitoringMiddleware) GetMetrics() *MetricsCollector {
	return bmm.metrics
}

// GetTracer returns the tracer
func (bmm *BotMonitoringMiddleware) GetTracer() *Tracer {
	return bmm.tracer
}

// GetAlerts returns the alert manager
func (bmm *BotMonitoringMiddleware) GetAlerts() *AlertManager {
	return bmm.alerts
}
