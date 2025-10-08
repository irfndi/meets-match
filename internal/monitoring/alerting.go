package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// AlertLevel represents the severity level of an alert
type AlertLevel string

const (
	AlertLevelInfo     AlertLevel = "info"
	AlertLevelWarning  AlertLevel = "warning"
	AlertLevelError    AlertLevel = "error"
	AlertLevelCritical AlertLevel = "critical"
)

// Type aliases for backward compatibility with tests
type AlertSeverity = AlertLevel
type AlertConfig = AlertManagerConfig
type AlertOperator string

const (
	SeverityInfo     AlertSeverity = AlertLevelInfo
	SeverityWarning  AlertSeverity = AlertLevelWarning
	SeverityError    AlertSeverity = AlertLevelError
	SeverityCritical AlertSeverity = AlertLevelCritical
)

const (
	OperatorGreaterThan    AlertOperator = ">"
	OperatorLessThan       AlertOperator = "<"
	OperatorGreaterOrEqual AlertOperator = ">="
	OperatorLessOrEqual    AlertOperator = "<="
	OperatorEqual          AlertOperator = "=="
	OperatorNotEqual       AlertOperator = "!="
)

// AlertStatus represents the status of an alert
type AlertStatus string

const (
	AlertStatusFiring   AlertStatus = "firing"
	AlertStatusResolved AlertStatus = "resolved"
	AlertStatusSilenced AlertStatus = "silenced"
	AlertStatusPending  AlertStatus = "pending"
)

// Alert represents a monitoring alert
type Alert struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Level       AlertLevel             `json:"level"`
	Severity    AlertSeverity          `json:"severity"` // Alias for Level for backward compatibility
	Status      AlertStatus            `json:"status"`
	Source      string                 `json:"source"`
	Timestamp   time.Time              `json:"timestamp"`
	ResolvedAt  *time.Time             `json:"resolved_at,omitempty"`
	Labels      map[string]string      `json:"labels,omitempty"`
	Annotations map[string]interface{} `json:"annotations,omitempty"`
	Value       float64                `json:"value,omitempty"`
	Threshold   float64                `json:"threshold,omitempty"`
	TraceID     string                 `json:"trace_id,omitempty"`
	SpanID      string                 `json:"span_id,omitempty"`
	RuleName    string                 `json:"rule_name,omitempty"`
	RuleID      string                 `json:"rule_id,omitempty"`
	Message     string                 `json:"message,omitempty"`
}

// IsActive returns true if the alert is currently firing
func (a *Alert) IsActive() bool {
	return a.Status == AlertStatusFiring
}

// Age returns the duration since the alert was created
func (a *Alert) Age() time.Duration {
	return time.Since(a.Timestamp)
}

// AlertRule defines conditions for triggering alerts
type AlertRule struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Level       AlertLevel             `json:"level"`
	Severity    AlertSeverity          `json:"severity"` // Alias for Level for backward compatibility
	Metric      string                 `json:"metric"`
	Condition   string                 `json:"condition"` // ">", "<", ">=", "<=", "==", "!="
	Operator    AlertOperator          `json:"operator"`  // Alias for Condition for backward compatibility
	Threshold   float64                `json:"threshold"`
	Duration    time.Duration          `json:"duration"`
	Labels      map[string]string      `json:"labels,omitempty"`
	Annotations map[string]interface{} `json:"annotations,omitempty"`
	Enabled     bool                   `json:"enabled"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// ShouldTrigger evaluates if the rule should trigger based on current conditions
func (r *AlertRule) ShouldTrigger(value float64) bool {
	if !r.Enabled {
		return false
	}
	return value >= r.Threshold
}

// AlertChannel defines how alerts are delivered
type AlertChannel struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"` // "webhook", "email", "slack", "telegram", "discord"
	Config    map[string]string `json:"config"`
	Enabled   bool              `json:"enabled"`
	Levels    []AlertLevel      `json:"levels"`
	LastUsed  *time.Time        `json:"last_used,omitempty"`
	FailCount int               `json:"fail_count"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

// WebhookConfig represents webhook configuration
type WebhookConfig struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"` // POST, PUT, PATCH
	Headers map[string]string `json:"headers,omitempty"`
	Timeout time.Duration     `json:"timeout"`
	Auth    *AuthConfig       `json:"auth,omitempty"`
}

// AuthConfig represents authentication configuration
type AuthConfig struct {
	Type     string `json:"type"` // bearer, basic, api_key
	Token    string `json:"token,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	APIKey   string `json:"api_key,omitempty"`
	Header   string `json:"header,omitempty"` // for api_key type
}

// EmailConfig represents email notification configuration
type EmailConfig struct {
	SMTPHost      string   `json:"smtp_host"`
	SMTPPort      int      `json:"smtp_port"`
	Username      string   `json:"username"`
	Password      string   `json:"password"`
	FromAddress   string   `json:"from_address"`
	ToAddresses   []string `json:"to_addresses"`
	SubjectPrefix string   `json:"subject_prefix"`
	UseTLS        bool     `json:"use_tls"`
}

// SlackConfig represents Slack notification configuration
type SlackConfig struct {
	WebhookURL string `json:"webhook_url"`
	Channel    string `json:"channel"`
	Username   string `json:"username"`
	IconEmoji  string `json:"icon_emoji"`
}

// TelegramConfig represents Telegram notification configuration
type TelegramConfig struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

// DiscordConfig represents Discord notification configuration
type DiscordConfig struct {
	WebhookURL string `json:"webhook_url"`
	Username   string `json:"username"`
	AvatarURL  string `json:"avatar_url"`
}

// NotificationChannel interface for backward compatibility with tests
type NotificationChannel interface {
	GetType() string
}

// AlertManager manages alerts and notifications
type AlertManager struct {
	mu           sync.RWMutex
	alerts       map[string]*Alert
	rules        map[string]*AlertRule
	channels     map[string]*AlertChannel
	metrics      *MetricsCollector
	tracer       *Tracer
	config       AlertManagerConfig
	alertHistory []Alert
	maxHistory   int
	ctx          context.Context
	cancel       context.CancelFunc
	notifier     *NotificationService
	stopCh       chan struct{} // For backward compatibility with tests
	running      bool          // Indicates if the alert manager is running
}

// NotificationService handles sending notifications through various channels
type NotificationService struct {
	mu       sync.RWMutex
	channels map[string]*AlertChannel
	client   *http.Client
}

// AlertManagerConfig holds alert manager configuration
type AlertManagerConfig struct {
	Enabled              bool          `json:"enabled"`
	EvaluationInterval   time.Duration `json:"evaluation_interval"`
	RetentionPeriod      time.Duration `json:"retention_period"`
	AlertRetention       time.Duration `json:"alert_retention"` // Alias for RetentionPeriod
	MaxAlerts            int           `json:"max_alerts"`
	MaxHistory           int           `json:"max_history"`
	DefaultTimeout       time.Duration `json:"default_timeout"`
	NotificationChannels []string      `json:"notification_channels"`
}

// DefaultAlertManagerConfig returns default configuration
func DefaultAlertManagerConfig() AlertManagerConfig {
	return AlertManagerConfig{
		Enabled:              true,
		EvaluationInterval:   30 * time.Second,
		RetentionPeriod:      7 * 24 * time.Hour,
		AlertRetention:       7 * 24 * time.Hour,
		MaxAlerts:            1000,
		MaxHistory:           5000,
		DefaultTimeout:       10 * time.Second,
		NotificationChannels: []string{},
	}
}

// DefaultAlertConfig returns default configuration (alias for backward compatibility)
func DefaultAlertConfig() AlertConfig {
	return DefaultAlertManagerConfig()
}

// NewAlertManagerWithDeps creates a new alert manager with dependencies
func NewAlertManagerWithDeps(config AlertManagerConfig, metrics *MetricsCollector, tracer *Tracer) *AlertManager {
	ctx, cancel := context.WithCancel(context.Background())

	am := &AlertManager{
		alerts:     make(map[string]*Alert),
		rules:      make(map[string]*AlertRule),
		channels:   make(map[string]*AlertChannel),
		metrics:    metrics,
		tracer:     tracer,
		config:     config,
		maxHistory: config.MaxHistory,
		ctx:        ctx,
		cancel:     cancel,
		notifier:   NewNotificationService(),
		stopCh:     make(chan struct{}),
	}

	// Register default alert rules
	am.registerDefaultRules()

	// Start evaluation loop
	if config.Enabled {
		go am.evaluationLoop()
		go am.cleanupLoop()
	}

	return am
}

// NewAlertManager creates a new alert manager with default dependencies (for backward compatibility)
func NewAlertManager(config AlertConfig) *AlertManager {
	return NewAlertManagerWithDeps(config, nil, nil)
}

// NewNotificationService creates a new NotificationService
func NewNotificationService() *NotificationService {
	return &NotificationService{
		channels: make(map[string]*AlertChannel),
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// AddChannel adds a channel to the notification service
func (ns *NotificationService) AddChannel(channel *AlertChannel) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.channels[channel.ID] = channel
}

// RemoveChannel removes a channel from the notification service
func (ns *NotificationService) RemoveChannel(channelID string) {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	delete(ns.channels, channelID)
}

// GetChannelStats returns statistics for notification channels
func (ns *NotificationService) GetChannelStats() map[string]interface{} {
	ns.mu.RLock()
	defer ns.mu.RUnlock()

	stats := map[string]interface{}{
		"total_channels":   len(ns.channels),
		"channels_by_type": make(map[string]int),
		"enabled_channels": 0,
		"failed_channels":  0,
	}

	typeCount := make(map[string]int)
	for _, channel := range ns.channels {
		typeCount[channel.Type]++
		if channel.Enabled {
			stats["enabled_channels"] = stats["enabled_channels"].(int) + 1
		}
		if channel.FailCount > 0 {
			stats["failed_channels"] = stats["failed_channels"].(int) + 1
		}
	}

	stats["channels_by_type"] = typeCount
	return stats
}

// registerDefaultRules registers default monitoring rules
func (am *AlertManager) registerDefaultRules() {
	// High error rate
	am.AddRule(AlertRule{
		ID:          "high_error_rate",
		Name:        "High Error Rate",
		Description: "HTTP error rate is above threshold",
		Level:       AlertLevelError,
		Metric:      "http_error_rate",
		Condition:   ">",
		Threshold:   0.05, // 5%
		Duration:    2 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})

	// High response time
	am.AddRule(AlertRule{
		ID:          "high_response_time",
		Name:        "High Response Time",
		Description: "HTTP response time is above threshold",
		Level:       AlertLevelWarning,
		Metric:      "http_response_time_p95",
		Condition:   ">",
		Threshold:   2.0, // 2 seconds
		Duration:    5 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})

	// High memory usage
	am.AddRule(AlertRule{
		ID:          "high_memory_usage",
		Name:        "High Memory Usage",
		Description: "Memory usage is above threshold",
		Level:       AlertLevelWarning,
		Metric:      "memory_usage_percent",
		Condition:   ">",
		Threshold:   80.0, // 80%
		Duration:    5 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})

	// Database connection failures
	am.AddRule(AlertRule{
		ID:          "database_connection_failure",
		Name:        "Database Connection Failure",
		Description: "Database connection failure rate is above threshold",
		Level:       AlertLevelCritical,
		Metric:      "database_connection_failure_rate",
		Condition:   ">",
		Threshold:   0.1, // 10%
		Duration:    1 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})

	// Redis connection failures
	am.AddRule(AlertRule{
		ID:          "redis_connection_failure",
		Name:        "Redis Connection Failure",
		Description: "Redis connection failure rate is above threshold",
		Level:       AlertLevelError,
		Metric:      "redis_connection_failure_rate",
		Condition:   ">",
		Threshold:   0.1, // 10%
		Duration:    2 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})

	// Telegram bot failures
	am.AddRule(AlertRule{
		ID:          "telegram_bot_failure",
		Name:        "Telegram Bot Failure",
		Description: "Telegram bot message failure rate is above threshold",
		Level:       AlertLevelError,
		Metric:      "telegram_message_failure_rate",
		Condition:   ">",
		Threshold:   0.05, // 5%
		Duration:    3 * time.Minute,
		Enabled:     true,
		CreatedAt:   time.Now(),
	})
}

// AddRule adds an alert rule
func (am *AlertManager) AddRule(rule AlertRule) {
	am.mu.Lock()
	defer am.mu.Unlock()
	rule.UpdatedAt = time.Now()
	am.rules[rule.ID] = &rule
}

// RemoveRule removes an alert rule
func (am *AlertManager) RemoveRule(ruleID string) {
	am.mu.Lock()
	defer am.mu.Unlock()
	delete(am.rules, ruleID)
}

// GetRule gets an alert rule
func (am *AlertManager) GetRule(ruleID string) (*AlertRule, bool) {
	am.mu.RLock()
	defer am.mu.RUnlock()
	rule, exists := am.rules[ruleID]
	return rule, exists
}

// GetAllRules returns all alert rules
func (am *AlertManager) GetAllRules() map[string]*AlertRule {
	am.mu.RLock()
	defer am.mu.RUnlock()

	rules := make(map[string]*AlertRule)
	for id, rule := range am.rules {
		rules[id] = rule
	}
	return rules
}

// GetRules returns all alert rules as a slice (for backward compatibility)
func (am *AlertManager) GetRules() []AlertRule {
	am.mu.RLock()
	defer am.mu.RUnlock()

	rules := make([]AlertRule, 0, len(am.rules))
	for _, rule := range am.rules {
		rules = append(rules, *rule)
	}
	return rules
}

// GetAlerts returns all alerts as a slice (for backward compatibility)
func (am *AlertManager) GetAlerts() []Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	alerts := make([]Alert, 0, len(am.alerts))
	for _, alert := range am.alerts {
		alerts = append(alerts, *alert)
	}
	return alerts
}

// GetAlertsByRule returns alerts filtered by rule name
func (am *AlertManager) GetAlertsByRule(ruleName string) []Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	var alerts []Alert
	for _, alert := range am.alerts {
		if alert.RuleName == ruleName {
			alerts = append(alerts, *alert)
		}
	}
	return alerts
}

// GetChannels returns all channels as a slice (for backward compatibility)
func (am *AlertManager) GetChannels() []AlertChannel {
	am.mu.RLock()
	defer am.mu.RUnlock()

	channels := make([]AlertChannel, 0, len(am.channels))
	for _, channel := range am.channels {
		channels = append(channels, *channel)
	}
	return channels
}

// AddNotificationChannel adds a notification channel (for backward compatibility)
func (am *AlertManager) AddNotificationChannel(channelID string, channel NotificationChannel) {
	// Create AlertChannel from NotificationChannel
	alertChannel := &AlertChannel{
		ID:      channelID,
		Name:    channelID,
		Type:    channel.GetType(),
		Enabled: true,
		Config:  make(map[string]string),
	}
	am.AddChannel(alertChannel)
}

// RemoveNotificationChannel removes a notification channel (for backward compatibility)
func (am *AlertManager) RemoveNotificationChannel(channelID string) {
	am.RemoveChannel(channelID)
}

// AddChannel adds a new alert channel
func (am *AlertManager) AddChannel(channel *AlertChannel) error {
	if channel.ID == "" {
		return fmt.Errorf("channel ID cannot be empty")
	}
	if channel.Name == "" {
		return fmt.Errorf("channel name cannot be empty")
	}
	if channel.Type == "" {
		return fmt.Errorf("channel type cannot be empty")
	}

	am.mu.Lock()
	defer am.mu.Unlock()

	// Check if channel already exists
	if _, exists := am.channels[channel.ID]; exists {
		return fmt.Errorf("channel with ID %s already exists", channel.ID)
	}

	channel.CreatedAt = time.Now()
	am.channels[channel.ID] = channel
	am.notifier.AddChannel(channel)
	return nil
}

// UpdateChannel updates an existing alert channel
func (am *AlertManager) UpdateChannel(channelID string, updates map[string]interface{}) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	channel, exists := am.channels[channelID]
	if !exists {
		return fmt.Errorf("channel with ID %s not found", channelID)
	}

	// Apply updates
	if name, ok := updates["name"].(string); ok {
		channel.Name = name
	}
	if enabled, ok := updates["enabled"].(bool); ok {
		channel.Enabled = enabled
	}
	if config, ok := updates["config"].(map[string]interface{}); ok {
		for k, v := range config {
			if str, ok := v.(string); ok {
				channel.Config[k] = str
			}
		}
	}

	return nil
}

// RemoveChannel removes an alert channel
func (am *AlertManager) RemoveChannel(channelID string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	if _, exists := am.channels[channelID]; !exists {
		return fmt.Errorf("channel with ID %s not found", channelID)
	}

	delete(am.channels, channelID)
	am.notifier.RemoveChannel(channelID)
	return nil
}

// GetChannel retrieves a specific alert channel
func (am *AlertManager) GetChannel(channelID string) (*AlertChannel, error) {
	am.mu.RLock()
	defer am.mu.RUnlock()

	channel, exists := am.channels[channelID]
	if !exists {
		return nil, fmt.Errorf("channel with ID %s not found", channelID)
	}

	return channel, nil
}

// ListChannels returns all alert channels
func (am *AlertManager) ListChannels() []*AlertChannel {
	am.mu.RLock()
	defer am.mu.RUnlock()

	channels := make([]*AlertChannel, 0, len(am.channels))
	for _, channel := range am.channels {
		channels = append(channels, channel)
	}

	return channels
}

// TestChannel tests a notification channel
func (am *AlertManager) TestChannel(channelID string) error {
	channel, err := am.GetChannel(channelID)
	if err != nil {
		return err
	}

	// Create a test alert
	testAlert := &Alert{
		ID:          "test_" + channelID,
		Name:        "Test Alert",
		Description: "This is a test alert to verify channel configuration",
		Level:       AlertLevelInfo,
		Status:      AlertStatusFiring,
		Value:       1.0,
		Threshold:   0.5,
		Timestamp:   time.Now(),
		Labels:      map[string]string{"test": "true"},
	}

	return am.notifier.SendNotification(testAlert, channel)
}

// GetChannelExists checks if an alert channel exists
func (am *AlertManager) GetChannelExists(channelID string) (*AlertChannel, bool) {
	am.mu.RLock()
	defer am.mu.RUnlock()
	channel, exists := am.channels[channelID]
	return channel, exists
}

// GetAllChannels returns all alert channels
func (am *AlertManager) GetAllChannels() map[string]*AlertChannel {
	am.mu.RLock()
	defer am.mu.RUnlock()

	channels := make(map[string]*AlertChannel)
	for id, channel := range am.channels {
		channels[id] = channel
	}
	return channels
}

// FireAlert fires an alert
func (am *AlertManager) FireAlert(alert *Alert) {
	if !am.config.Enabled {
		return
	}

	am.mu.Lock()
	defer am.mu.Unlock()

	// Set alert ID if not provided
	if alert.ID == "" {
		alert.ID = generateID()
	}

	// Set timestamp if not provided
	if alert.Timestamp.IsZero() {
		alert.Timestamp = time.Now()
	}

	// Set status to firing
	alert.Status = AlertStatusFiring

	// Store alert
	am.alerts[alert.ID] = alert

	// Add to history
	am.addToHistory(*alert)

	// Send notifications
	go am.sendNotifications(alert)

	// Record metrics
	if am.metrics != nil {
		am.metrics.NewCounter("alerts_fired_total", "Total number of alerts fired", map[string]string{"level": string(alert.Level)}).Inc()
	}
}

// ResolveAlert resolves an alert
func (am *AlertManager) ResolveAlert(alertID string) {
	am.mu.Lock()
	defer am.mu.Unlock()

	if alert, exists := am.alerts[alertID]; exists {
		now := time.Now()
		alert.Status = AlertStatusResolved
		alert.ResolvedAt = &now

		// Add to history
		am.addToHistory(*alert)

		// Send resolution notification
		go am.sendNotifications(alert)

		// Record metrics
		if am.metrics != nil {
			am.metrics.NewCounter("alerts_resolved_total", "Total number of alerts resolved", map[string]string{"level": string(alert.Level)}).Inc()
		}

		// Remove from active alerts after a delay
		go func() {
			time.Sleep(5 * time.Minute)
			am.mu.Lock()
			delete(am.alerts, alertID)
			am.mu.Unlock()
		}()
	}
}

// GetAlert gets an alert
func (am *AlertManager) GetAlert(alertID string) (*Alert, bool) {
	am.mu.RLock()
	defer am.mu.RUnlock()
	alert, exists := am.alerts[alertID]
	return alert, exists
}

// GetAllAlerts returns all active alerts
func (am *AlertManager) GetAllAlerts() map[string]*Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	alerts := make(map[string]*Alert)
	for id, alert := range am.alerts {
		alerts[id] = alert
	}
	return alerts
}

// GetAlertsBySeverity returns alerts filtered by severity level
func (am *AlertManager) GetAlertsBySeverity(severity AlertSeverity) []Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	var alerts []Alert
	for _, alert := range am.alerts {
		if alert.Severity == severity || alert.Level == AlertLevel(severity) {
			alerts = append(alerts, *alert)
		}
	}
	return alerts
}

// TriggerAlert triggers an alert
func (am *AlertManager) TriggerAlert(alert Alert) error {
	if !am.config.Enabled {
		return nil
	}

	// Set alert ID if not provided
	if alert.ID == "" {
		alert.ID = generateID()
	}

	// Set timestamp if not provided
	if alert.Timestamp.IsZero() {
		alert.Timestamp = time.Now()
	}

	// Set status to firing
	alert.Status = AlertStatusFiring

	am.FireAlert(&alert)
	return nil
}

// GetAlertHistory returns alert history
func (am *AlertManager) GetAlertHistory(limit int) []Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	if limit <= 0 || limit > len(am.alertHistory) {
		limit = len(am.alertHistory)
	}

	// Return most recent alerts
	start := len(am.alertHistory) - limit
	if start < 0 {
		start = 0
	}

	return am.alertHistory[start:]
}

// addToHistory adds an alert to history
func (am *AlertManager) addToHistory(alert Alert) {
	am.alertHistory = append(am.alertHistory, alert)

	// Trim history if it exceeds max size
	if len(am.alertHistory) > am.maxHistory {
		am.alertHistory = am.alertHistory[len(am.alertHistory)-am.maxHistory:]
	}
}

// ClearOldAlerts clears old alerts based on age
func (am *AlertManager) ClearOldAlerts(maxAge time.Duration) {
	am.mu.Lock()
	defer am.mu.Unlock()

	now := time.Now()
	for id, alert := range am.alerts {
		if now.Sub(alert.Timestamp) > maxAge {
			delete(am.alerts, id)
		}
	}
}

// Start starts the alert manager
func (am *AlertManager) Start() {
	am.mu.Lock()
	defer am.mu.Unlock()

	if am.running {
		return
	}

	am.running = true
	am.stopCh = make(chan struct{})

	// Start evaluation loop
	go am.evaluationLoop()
}

// evaluationLoop runs the alert evaluation loop
func (am *AlertManager) evaluationLoop() {
	ticker := time.NewTicker(am.config.EvaluationInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if am.config.Enabled {
				am.evaluateRules()
			}
		case <-am.ctx.Done():
			return
		}
	}
}

// evaluateRules evaluates all alert rules
func (am *AlertManager) evaluateRules() {
	am.mu.RLock()
	rules := make([]*AlertRule, 0, len(am.rules))
	for _, rule := range am.rules {
		if rule.Enabled {
			rules = append(rules, rule)
		}
	}
	am.mu.RUnlock()

	for _, rule := range rules {
		am.evaluateRule(rule)
	}
}

// EvaluateRule evaluates a rule with a given value (for testing)
func (am *AlertManager) EvaluateRule(rule AlertRule, value float64) (bool, *Alert) {
	// Evaluate condition
	if am.evaluateCondition(value, rule.Condition, rule.Threshold) {
		// Create alert
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    rule.Name,
			Description: rule.Description,
			Severity:    rule.Severity,
			Status:      AlertStatusFiring,
			Timestamp:   time.Now(),
			Value:       value,
			Threshold:   rule.Threshold,
		}
		return true, alert
	}
	return false, nil
}

// evaluateRule evaluates a single alert rule
func (am *AlertManager) evaluateRule(rule *AlertRule) {
	// This is a simplified evaluation - in a real implementation,
	// you would query your metrics store (Prometheus, etc.)
	// For now, we'll use the metrics collector

	if am.metrics == nil {
		return
	}

	// Get metric value (simplified)
	value := am.getMetricValue(rule.Metric)

	// Evaluate condition
	if am.evaluateCondition(value, rule.Condition, rule.Threshold) {
		// Check if alert already exists
		alertID := fmt.Sprintf("%s_%s", rule.ID, rule.Metric)
		if _, exists := am.GetAlert(alertID); !exists {
			// Fire new alert
			alert := &Alert{
				ID:          alertID,
				Name:        rule.Name,
				Description: rule.Description,
				Level:       rule.Level,
				Source:      "alert_manager",
				Labels:      rule.Labels,
				Annotations: rule.Annotations,
				Value:       value,
				Threshold:   rule.Threshold,
			}

			am.FireAlert(alert)
		}
	} else {
		// Resolve alert if it exists
		alertID := fmt.Sprintf("%s_%s", rule.ID, rule.Metric)
		if alert, exists := am.GetAlert(alertID); exists && alert.Status == AlertStatusFiring {
			am.ResolveAlert(alertID)
		}
	}
}

// getMetricValue gets the current value of a metric (simplified)
func (am *AlertManager) getMetricValue(metricName string) float64 {
	// This is a simplified implementation
	// In a real system, you would query your metrics store
	switch metricName {
	case "http_error_rate":
		return 0.02 // 2% error rate
	case "http_response_time_p95":
		return 1.5 // 1.5 seconds
	case "memory_usage_percent":
		return 75.0 // 75%
	case "database_connection_failure_rate":
		return 0.05 // 5%
	case "redis_connection_failure_rate":
		return 0.02 // 2%
	case "telegram_message_failure_rate":
		return 0.01 // 1%
	default:
		return 0.0
	}
}

// evaluateCondition evaluates a condition
func (am *AlertManager) evaluateCondition(value float64, condition string, threshold float64) bool {
	switch condition {
	case ">":
		return value > threshold
	case ">=":
		return value >= threshold
	case "<":
		return value < threshold
	case "<=":
		return value <= threshold
	case "==":
		return value == threshold
	case "!=":
		return value != threshold
	default:
		return false
	}
}

// sendNotifications sends alert notifications to all channels
func (am *AlertManager) sendNotifications(alert *Alert) {
	am.mu.RLock()
	channels := make([]*AlertChannel, 0)
	for _, channel := range am.channels {
		if channel.Enabled && am.shouldSendToChannel(channel, alert.Level) {
			channels = append(channels, channel)
		}
	}
	am.mu.RUnlock()

	for _, channel := range channels {
		go am.sendToChannel(channel, alert)
	}
}

// SendNotification sends alert notification through configured channels
func (am *AlertManager) SendNotification(alert *Alert) error {
	am.mu.RLock()
	channels := make([]*AlertChannel, 0, len(am.channels))
	for _, channel := range am.channels {
		if channel.Enabled && am.shouldNotifyChannel(channel, alert) {
			channels = append(channels, channel)
		}
	}
	am.mu.RUnlock()

	var errors []string
	for _, channel := range channels {
		if err := am.notifier.SendNotification(alert, channel); err != nil {
			errors = append(errors, fmt.Sprintf("channel %s: %v", channel.Name, err))
			channel.FailCount++
		} else {
			now := time.Now()
			channel.LastUsed = &now
			channel.FailCount = 0
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("notification errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// shouldNotifyChannel determines if a channel should receive the alert
func (am *AlertManager) shouldNotifyChannel(channel *AlertChannel, alert *Alert) bool {
	// Check if channel supports this alert level
	for _, level := range channel.Levels {
		if level == alert.Level {
			return true
		}
	}
	return false
}

// shouldSendToChannel checks if alert should be sent to channel
func (am *AlertManager) shouldSendToChannel(channel *AlertChannel, level AlertLevel) bool {
	if len(channel.Levels) == 0 {
		return true // Send all levels if none specified
	}

	for _, l := range channel.Levels {
		if l == level {
			return true
		}
	}
	return false
}

// sendToChannel sends alert to a specific channel
func (am *AlertManager) sendToChannel(channel *AlertChannel, alert *Alert) {
	switch channel.Type {
	case "webhook":
		am.sendWebhook(channel, alert)
	case "email":
		// Email implementation would go here
	case "slack":
		// Slack implementation would go here
	case "telegram":
		// Telegram implementation would go here
	}
}

// SendNotification sends alert notification through a specific channel
func (ns *NotificationService) SendNotification(alert *Alert, channel *AlertChannel) error {
	switch channel.Type {
	case "webhook":
		return ns.sendWebhook(alert, channel)
	case "email":
		return ns.sendEmail(alert, channel)
	case "slack":
		return ns.sendSlack(alert, channel)
	case "telegram":
		return ns.sendTelegram(alert, channel)
	case "discord":
		return ns.sendDiscord(alert, channel)
	default:
		return fmt.Errorf("unsupported channel type: %s", channel.Type)
	}
}

// sendWebhook sends alert via webhook
func (ns *NotificationService) sendWebhook(alert *Alert, channel *AlertChannel) error {
	url := channel.Config["url"]
	if url == "" {
		return fmt.Errorf("webhook URL not configured")
	}

	payload := map[string]interface{}{
		"alert":     alert,
		"channel":   channel.Name,
		"timestamp": time.Now(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add custom headers
	for key, value := range channel.Config {
		if key != "url" {
			req.Header.Set(key, value)
		}
	}

	resp, err := ns.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// sendEmail sends alert via email
func (ns *NotificationService) sendEmail(alert *Alert, channel *AlertChannel) error {
	host := channel.Config["smtp_host"]
	port := channel.Config["smtp_port"]
	username := channel.Config["username"]
	password := channel.Config["password"]
	from := channel.Config["from_address"]
	to := channel.Config["to_addresses"]

	if host == "" || port == "" || username == "" || password == "" || from == "" || to == "" {
		return fmt.Errorf("email configuration incomplete")
	}

	subject := fmt.Sprintf("[%s] %s", strings.ToUpper(string(alert.Level)), alert.Name)
	body := fmt.Sprintf("Alert: %s\nDescription: %s\nLevel: %s\nTimestamp: %s\nValue: %.2f\nThreshold: %.2f",
		alert.Name, alert.Description, alert.Level, alert.Timestamp.Format(time.RFC3339), alert.Value, alert.Threshold)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s", from, to, subject, body)

	auth := smtp.PlainAuth("", username, password, host)
	err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(msg))
	if err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

// sendSlack sends alert via Slack
func (ns *NotificationService) sendSlack(alert *Alert, channel *AlertChannel) error {
	webhookURL := channel.Config["webhook_url"]
	if webhookURL == "" {
		return fmt.Errorf("Slack webhook URL not configured")
	}

	color := "good"
	switch alert.Level {
	case AlertLevelWarning:
		color = "warning"
	case AlertLevelError, AlertLevelCritical:
		color = "danger"
	}

	payload := map[string]interface{}{
		"channel":  channel.Config["channel"],
		"username": channel.Config["username"],
		"attachments": []map[string]interface{}{
			{
				"color": color,
				"title": alert.Name,
				"text":  alert.Description,
				"fields": []map[string]interface{}{
					{"title": "Level", "value": string(alert.Level), "short": true},
					{"title": "Status", "value": string(alert.Status), "short": true},
					{"title": "Value", "value": fmt.Sprintf("%.2f", alert.Value), "short": true},
					{"title": "Threshold", "value": fmt.Sprintf("%.2f", alert.Threshold), "short": true},
				},
				"timestamp": alert.Timestamp.Unix(),
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Slack payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create Slack request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := ns.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send Slack notification: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Slack returned status %d", resp.StatusCode)
	}

	return nil
}

// sendTelegram sends alert via Telegram
func (ns *NotificationService) sendTelegram(alert *Alert, channel *AlertChannel) error {
	botToken := channel.Config["bot_token"]
	chatID := channel.Config["chat_id"]

	if botToken == "" || chatID == "" {
		return fmt.Errorf("Telegram configuration incomplete")
	}

	message := fmt.Sprintf("🚨 *%s*\n\n%s\n\n*Level:* %s\n*Status:* %s\n*Value:* %.2f\n*Threshold:* %.2f\n*Time:* %s",
		alert.Name, alert.Description, alert.Level, alert.Status, alert.Value, alert.Threshold, alert.Timestamp.Format(time.RFC3339))

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       message,
		"parse_mode": "Markdown",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Telegram payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create Telegram request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := ns.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send Telegram notification: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Telegram returned status %d", resp.StatusCode)
	}

	return nil
}

// sendDiscord sends alert via Discord
func (ns *NotificationService) sendDiscord(alert *Alert, channel *AlertChannel) error {
	webhookURL := channel.Config["webhook_url"]
	if webhookURL == "" {
		return fmt.Errorf("Discord webhook URL not configured")
	}

	color := 3066993 // Green
	switch alert.Level {
	case AlertLevelWarning:
		color = 16776960 // Yellow
	case AlertLevelError:
		color = 16711680 // Red
	case AlertLevelCritical:
		color = 8388608 // Dark Red
	}

	payload := map[string]interface{}{
		"username":   channel.Config["username"],
		"avatar_url": channel.Config["avatar_url"],
		"embeds": []map[string]interface{}{
			{
				"title":       alert.Name,
				"description": alert.Description,
				"color":       color,
				"fields": []map[string]interface{}{
					{"name": "Level", "value": string(alert.Level), "inline": true},
					{"name": "Status", "value": string(alert.Status), "inline": true},
					{"name": "Value", "value": fmt.Sprintf("%.2f", alert.Value), "inline": true},
					{"name": "Threshold", "value": fmt.Sprintf("%.2f", alert.Threshold), "inline": true},
				},
				"timestamp": alert.Timestamp.Format(time.RFC3339),
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal Discord payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create Discord request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := ns.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send Discord notification: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Discord returned status %d", resp.StatusCode)
	}

	return nil
}

// sendWebhook sends alert via webhook
func (am *AlertManager) sendWebhook(channel *AlertChannel, alert *Alert) {
	url := channel.Config["url"]
	if url == "" {
		return
	}

	payload := map[string]interface{}{
		"alert":     alert,
		"channel":   channel.Name,
		"timestamp": time.Now(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), am.config.DefaultTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")

	// Add custom headers
	for key, value := range channel.Config {
		if key != "url" {
			req.Header.Set(key, value)
		}
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	// Record metrics
	if am.metrics != nil {
		status := "success"
		if resp.StatusCode >= 400 {
			status = "error"
		}
		am.metrics.NewCounter("alert_notifications_total", "Total alert notifications sent", map[string]string{"channel": channel.Type, "status": status}).Inc()
	}
}

// cleanupLoop runs the cleanup routine
func (am *AlertManager) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			am.cleanup()
		case <-am.ctx.Done():
			return
		}
	}
}

// cleanup removes old alerts and maintains limits
func (am *AlertManager) cleanup() {
	am.mu.Lock()
	defer am.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-am.config.RetentionPeriod)

	// Remove old alerts
	for id, alert := range am.alerts {
		if alert.Timestamp.Before(cutoff) {
			delete(am.alerts, id)
		}
	}

	// Enforce max alerts limit
	if len(am.alerts) > am.config.MaxAlerts {
		// Convert to slice for sorting
		alerts := make([]*Alert, 0, len(am.alerts))
		for _, alert := range am.alerts {
			alerts = append(alerts, alert)
		}

		// Sort by timestamp (oldest first)
		for i := 0; i < len(alerts)-1; i++ {
			for j := i + 1; j < len(alerts); j++ {
				if alerts[i].Timestamp.After(alerts[j].Timestamp) {
					alerts[i], alerts[j] = alerts[j], alerts[i]
				}
			}
		}

		// Remove oldest alerts
		excess := len(alerts) - am.config.MaxAlerts
		for i := 0; i < excess; i++ {
			delete(am.alerts, alerts[i].ID)
		}
	}
}

// AlertsHandler returns a handler for alerts management
func (am *AlertManager) AlertsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		alerts := am.GetAllAlerts()

		summary := map[string]interface{}{
			"total_alerts":     len(alerts),
			"alerts_by_level":  am.getAlertsByLevel(alerts),
			"alerts_by_status": am.getAlertsByStatus(alerts),
			"config":           am.config,
			"alerts":           alerts,
		}

		c.JSON(http.StatusOK, summary)
	}
}

// AlertHistoryHandler returns a handler for alert history
func (am *AlertManager) AlertHistoryHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100 // Default limit
		if l := c.Query("limit"); l != "" {
			if parsed, err := time.ParseDuration(l); err == nil {
				limit = int(parsed)
			}
		}

		history := am.GetAlertHistory(limit)

		c.JSON(http.StatusOK, map[string]interface{}{
			"total":   len(history),
			"limit":   limit,
			"history": history,
		})
	}
}

// RulesHandler returns a handler for alert rules management
func (am *AlertManager) RulesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		rules := am.GetAllRules()

		c.JSON(http.StatusOK, map[string]interface{}{
			"total_rules": len(rules),
			"rules":       rules,
		})
	}
}

// ChannelsHandler returns a handler for alert channels management
func (am *AlertManager) ChannelsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		channels := am.GetAllChannels()

		c.JSON(http.StatusOK, map[string]interface{}{
			"total_channels": len(channels),
			"channels":       channels,
		})
	}
}

// getAlertsByLevel groups alerts by level
func (am *AlertManager) getAlertsByLevel(alerts map[string]*Alert) map[AlertLevel]int {
	counts := make(map[AlertLevel]int)
	for _, alert := range alerts {
		counts[alert.Level]++
	}
	return counts
}

// getAlertsByStatus groups alerts by status
func (am *AlertManager) getAlertsByStatus(alerts map[string]*Alert) map[AlertStatus]int {
	counts := make(map[AlertStatus]int)
	for _, alert := range alerts {
		counts[alert.Status]++
	}
	return counts
}

// NewEmailNotificationChannel creates a new email notification channel
func NewEmailNotificationChannel(name, smtpHost string, smtpPort int, username, password, from string) *AlertChannel {
	return &AlertChannel{
		ID:      generateChannelID(),
		Name:    name,
		Type:    "email",
		Enabled: true,
		Config: map[string]string{
			"smtp_host": smtpHost,
			"smtp_port": fmt.Sprintf("%d", smtpPort),
			"username":  username,
			"password":  password,
			"from":      from,
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// NewSlackNotificationChannel creates a new Slack notification channel
func NewSlackNotificationChannel(name, webhookURL, channel string) *AlertChannel {
	return &AlertChannel{
		ID:      generateChannelID(),
		Name:    name,
		Type:    "slack",
		Enabled: true,
		Config: map[string]string{
			"webhook_url": webhookURL,
			"channel":     channel,
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// generateChannelID generates a unique channel ID
func generateChannelID() string {
	return fmt.Sprintf("channel_%d", time.Now().UnixNano())
}

// Stop stops the alert manager and cancels all running goroutines
func (am *AlertManager) Stop() {
	if am.cancel != nil {
		am.cancel()
	}
}
