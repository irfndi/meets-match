package monitoring

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// BotInstrumentation provides OpenTelemetry instrumentation for Telegram bot operations
type BotInstrumentation struct {
	tracer trace.Tracer
	meter  metric.Meter

	// Bot metrics
	botUpdatesTotal       metric.Int64Counter
	botUpdateDuration     metric.Float64Histogram
	botMessagesTotal      metric.Int64Counter
	botCallbacksTotal     metric.Int64Counter
	botInlineQueriesTotal metric.Int64Counter
	botErrorsTotal        metric.Int64Counter
	botActiveUsers        metric.Int64UpDownCounter
	botMessageSize        metric.Int64Histogram
}

// NewBotInstrumentation creates a new bot instrumentation instance
func NewBotInstrumentation() (*BotInstrumentation, error) {
	tracer := otel.Tracer(instrumentationName, trace.WithInstrumentationVersion(instrumentationVersion))
	meter := otel.Meter(instrumentationName, metric.WithInstrumentationVersion(instrumentationVersion))

	// Create bot metrics
	botUpdatesTotal, err := meter.Int64Counter(
		"bot_updates_total",
		metric.WithDescription("Total number of bot updates received"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_updates_total counter: %w", err)
	}

	botUpdateDuration, err := meter.Float64Histogram(
		"bot_update_duration_seconds",
		metric.WithDescription("Bot update processing duration in seconds"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_update_duration_seconds histogram: %w", err)
	}

	botMessagesTotal, err := meter.Int64Counter(
		"bot_messages_total",
		metric.WithDescription("Total number of messages processed"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_messages_total counter: %w", err)
	}

	botCallbacksTotal, err := meter.Int64Counter(
		"bot_callbacks_total",
		metric.WithDescription("Total number of callback queries processed"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_callbacks_total counter: %w", err)
	}

	botInlineQueriesTotal, err := meter.Int64Counter(
		"bot_inline_queries_total",
		metric.WithDescription("Total number of inline queries processed"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_inline_queries_total counter: %w", err)
	}

	botErrorsTotal, err := meter.Int64Counter(
		"bot_errors_total",
		metric.WithDescription("Total number of bot errors"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_errors_total counter: %w", err)
	}

	botActiveUsers, err := meter.Int64UpDownCounter(
		"bot_active_users",
		metric.WithDescription("Number of active bot users"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_active_users counter: %w", err)
	}

	botMessageSize, err := meter.Int64Histogram(
		"bot_message_size_bytes",
		metric.WithDescription("Bot message size in bytes"),
		metric.WithUnit("By"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create bot_message_size_bytes histogram: %w", err)
	}

	return &BotInstrumentation{
		tracer:                tracer,
		meter:                 meter,
		botUpdatesTotal:       botUpdatesTotal,
		botUpdateDuration:     botUpdateDuration,
		botMessagesTotal:      botMessagesTotal,
		botCallbacksTotal:     botCallbacksTotal,
		botInlineQueriesTotal: botInlineQueriesTotal,
		botErrorsTotal:        botErrorsTotal,
		botActiveUsers:        botActiveUsers,
		botMessageSize:        botMessageSize,
	}, nil
}

// TraceUpdate creates a span for processing a bot update
func (b *BotInstrumentation) TraceUpdate(ctx context.Context, updateType string, updateID int64, userID int64) (context.Context, trace.Span) {
	spanName := fmt.Sprintf("bot.update.%s", updateType)
	ctx, span := b.tracer.Start(ctx, spanName,
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("bot.update.type", updateType),
			attribute.Int64("bot.update.id", updateID),
			attribute.Int64("bot.user.id", userID),
			attribute.String("component", "telegram_bot"),
		),
	)

	return ctx, span
}

// TraceMessage creates a span for processing a message
func (b *BotInstrumentation) TraceMessage(ctx context.Context, messageType string, messageID int, userID int64, chatID int64) (context.Context, trace.Span) {
	spanName := fmt.Sprintf("bot.message.%s", messageType)
	ctx, span := b.tracer.Start(ctx, spanName,
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("bot.message.type", messageType),
			attribute.Int("bot.message.id", messageID),
			attribute.Int64("bot.user.id", userID),
			attribute.Int64("bot.chat.id", chatID),
			attribute.String("component", "telegram_bot"),
		),
	)

	return ctx, span
}

// TraceCallback creates a span for processing a callback query
func (b *BotInstrumentation) TraceCallback(ctx context.Context, callbackData string, userID int64) (context.Context, trace.Span) {
	ctx, span := b.tracer.Start(ctx, "bot.callback",
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("bot.callback.data", callbackData),
			attribute.Int64("bot.user.id", userID),
			attribute.String("component", "telegram_bot"),
		),
	)

	return ctx, span
}

// TraceInlineQuery creates a span for processing an inline query
func (b *BotInstrumentation) TraceInlineQuery(ctx context.Context, query string, userID int64) (context.Context, trace.Span) {
	ctx, span := b.tracer.Start(ctx, "bot.inline_query",
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("bot.inline_query.query", query),
			attribute.Int64("bot.user.id", userID),
			attribute.String("component", "telegram_bot"),
		),
	)

	return ctx, span
}

// RecordUpdateMetrics records metrics for a bot update
func (b *BotInstrumentation) RecordUpdateMetrics(ctx context.Context, updateType string, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("update_type", updateType),
		attribute.String("component", "telegram_bot"),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
		b.botErrorsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	b.botUpdatesTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	b.botUpdateDuration.Record(ctx, duration.Seconds(), metric.WithAttributes(attributes...))
}

// RecordMessageMetrics records metrics for a message
func (b *BotInstrumentation) RecordMessageMetrics(ctx context.Context, messageType string, messageSize int, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("message_type", messageType),
		attribute.String("component", "telegram_bot"),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
		b.botErrorsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	b.botMessagesTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	if messageSize > 0 {
		b.botMessageSize.Record(ctx, int64(messageSize), metric.WithAttributes(attributes...))
	}
}

// RecordCallbackMetrics records metrics for a callback query
func (b *BotInstrumentation) RecordCallbackMetrics(ctx context.Context, callbackData string, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("callback_data", callbackData),
		attribute.String("component", "telegram_bot"),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
		b.botErrorsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	b.botCallbacksTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
}

// RecordInlineQueryMetrics records metrics for an inline query
func (b *BotInstrumentation) RecordInlineQueryMetrics(ctx context.Context, query string, resultsCount int, duration time.Duration, err error) {
	attributes := []attribute.KeyValue{
		attribute.String("component", "telegram_bot"),
		attribute.Int("results_count", resultsCount),
	}

	if err != nil {
		attributes = append(attributes, attribute.String("error", "true"))
		b.botErrorsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
	} else {
		attributes = append(attributes, attribute.String("error", "false"))
	}

	b.botInlineQueriesTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
}

// RecordUserActivity records user activity metrics
func (b *BotInstrumentation) RecordUserActivity(ctx context.Context, userID int64, action string) {
	attributes := []attribute.KeyValue{
		attribute.Int64("user_id", userID),
		attribute.String("action", action),
		attribute.String("component", "telegram_bot"),
	}

	switch action {
	case "join":
		b.botActiveUsers.Add(ctx, 1, metric.WithAttributes(attributes...))
	case "leave":
		b.botActiveUsers.Add(ctx, -1, metric.WithAttributes(attributes...))
	}
}

// RecordError records an error with context
func (b *BotInstrumentation) RecordError(ctx context.Context, err error, operation string, span trace.Span) {
	attributes := []attribute.KeyValue{
		attribute.String("operation", operation),
		attribute.String("error_type", fmt.Sprintf("%T", err)),
		attribute.String("component", "telegram_bot"),
	}

	// Record error in span
	if span != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		span.SetAttributes(
			attribute.String("error.message", err.Error()),
			attribute.String("error.type", fmt.Sprintf("%T", err)),
		)
	}

	// Record error metric
	b.botErrorsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))
}

// SetSpanSuccess marks a span as successful
func (b *BotInstrumentation) SetSpanSuccess(span trace.Span) {
	if span != nil {
		span.SetStatus(codes.Ok, "")
	}
}

// AddSpanAttributes adds additional attributes to a span
func (b *BotInstrumentation) AddSpanAttributes(span trace.Span, attributes ...attribute.KeyValue) {
	if span != nil {
		span.SetAttributes(attributes...)
	}
}
