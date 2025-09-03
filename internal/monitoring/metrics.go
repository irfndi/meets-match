package monitoring

import (
	"fmt"
	"net/http"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// MetricType represents the type of metric
type MetricType string

const (
	MetricTypeCounter   MetricType = "counter"
	MetricTypeGauge     MetricType = "gauge"
	MetricTypeHistogram MetricType = "histogram"
	MetricTypeSummary   MetricType = "summary"
)

// Metric represents a single metric
type Metric struct {
	Name      string            `json:"name"`
	Type      MetricType        `json:"type"`
	Help      string            `json:"help"`
	Labels    map[string]string `json:"labels,omitempty"`
	Value     float64           `json:"value"`
	Timestamp time.Time         `json:"timestamp"`
}

// Counter represents a counter metric
type Counter struct {
	mu     sync.RWMutex
	name   string
	help   string
	labels map[string]string
	value  uint64
}

// NewCounter creates a new counter
func NewCounter(name, help string, labels map[string]string) *Counter {
	return &Counter{
		name:   name,
		help:   help,
		labels: labels,
	}
}

// Inc increments the counter by 1
func (c *Counter) Inc() {
	atomic.AddUint64(&c.value, 1)
}

// Add adds the given value to the counter
func (c *Counter) Add(value float64) {
	if value < 0 {
		return // Counters can't decrease
	}
	atomic.AddUint64(&c.value, uint64(value))
}

// Get returns the current value
func (c *Counter) Get() float64 {
	return float64(atomic.LoadUint64(&c.value))
}

// ToMetric converts to a Metric struct
func (c *Counter) ToMetric() Metric {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return Metric{
		Name:      c.name,
		Type:      MetricTypeCounter,
		Help:      c.help,
		Labels:    c.labels,
		Value:     c.Get(),
		Timestamp: time.Now(),
	}
}

// Gauge represents a gauge metric
type Gauge struct {
	mu     sync.RWMutex
	name   string
	help   string
	labels map[string]string
	value  int64 // Using int64 for atomic operations
}

// NewGauge creates a new gauge
func NewGauge(name, help string, labels map[string]string) *Gauge {
	return &Gauge{
		name:   name,
		help:   help,
		labels: labels,
	}
}

// Set sets the gauge to the given value
func (g *Gauge) Set(value float64) {
	atomic.StoreInt64(&g.value, int64(value*1000)) // Store as int64 with 3 decimal precision
}

// Inc increments the gauge by 1
func (g *Gauge) Inc() {
	atomic.AddInt64(&g.value, 1000)
}

// Dec decrements the gauge by 1
func (g *Gauge) Dec() {
	atomic.AddInt64(&g.value, -1000)
}

// Add adds the given value to the gauge
func (g *Gauge) Add(value float64) {
	atomic.AddInt64(&g.value, int64(value*1000))
}

// Get returns the current value
func (g *Gauge) Get() float64 {
	return float64(atomic.LoadInt64(&g.value)) / 1000
}

// ToMetric converts to a Metric struct
func (g *Gauge) ToMetric() Metric {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return Metric{
		Name:      g.name,
		Type:      MetricTypeGauge,
		Help:      g.help,
		Labels:    g.labels,
		Value:     g.Get(),
		Timestamp: time.Now(),
	}
}

// Histogram represents a histogram metric
type Histogram struct {
	mu      sync.RWMutex
	name    string
	help    string
	labels  map[string]string
	buckets []float64
	counts  []uint64
	sum     uint64
	count   uint64
}

// NewHistogram creates a new histogram
func NewHistogram(name, help string, labels map[string]string, buckets []float64) *Histogram {
	if buckets == nil {
		// Default buckets
		buckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}
	}
	return &Histogram{
		name:    name,
		help:    help,
		labels:  labels,
		buckets: buckets,
		counts:  make([]uint64, len(buckets)+1), // +1 for +Inf bucket
	}
}

// Observe adds an observation to the histogram
func (h *Histogram) Observe(value float64) {
	atomic.AddUint64(&h.count, 1)
	atomic.AddUint64(&h.sum, uint64(value*1000)) // Store with 3 decimal precision

	// Find the appropriate bucket
	for i, bucket := range h.buckets {
		if value <= bucket {
			atomic.AddUint64(&h.counts[i], 1)
			return
		}
	}
	// Value is greater than all buckets, add to +Inf bucket
	atomic.AddUint64(&h.counts[len(h.buckets)], 1)
}

// GetCount returns the total count of observations
func (h *Histogram) GetCount() uint64 {
	return atomic.LoadUint64(&h.count)
}

// GetSum returns the sum of all observations
func (h *Histogram) GetSum() float64 {
	return float64(atomic.LoadUint64(&h.sum)) / 1000
}

// GetBuckets returns the bucket counts
func (h *Histogram) GetBuckets() map[string]uint64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	buckets := make(map[string]uint64)
	for i, bucket := range h.buckets {
		buckets[fmt.Sprintf("%.3f", bucket)] = atomic.LoadUint64(&h.counts[i])
	}
	buckets["+Inf"] = atomic.LoadUint64(&h.counts[len(h.buckets)])
	return buckets
}

// GetPercentile calculates the percentile value
func (h *Histogram) GetPercentile(percentile float64) float64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if h.GetCount() == 0 {
		return 0
	}

	target := float64(h.GetCount()) * percentile / 100.0
	var cumulative uint64

	for i, bucket := range h.buckets {
		cumulative += atomic.LoadUint64(&h.counts[i])
		if float64(cumulative) >= target {
			return bucket
		}
	}

	return 0
}

// GetAverage calculates the average value
func (h *Histogram) GetAverage() float64 {
	count := h.GetCount()
	if count == 0 {
		return 0
	}
	return h.GetSum() / float64(count)
}

// ToMetric converts to a Metric struct
func (h *Histogram) ToMetric() Metric {
	h.mu.RLock()
	defer h.mu.RUnlock()

	labels := make(map[string]string)
	for k, v := range h.labels {
		labels[k] = v
	}
	labels["count"] = fmt.Sprintf("%d", h.GetCount())
	labels["average"] = fmt.Sprintf("%.2f", h.GetAverage())
	labels["p95"] = fmt.Sprintf("%.2f", h.GetPercentile(95))
	labels["p99"] = fmt.Sprintf("%.2f", h.GetPercentile(99))

	return Metric{
		Name:      h.name,
		Type:      MetricTypeHistogram,
		Help:      h.help,
		Labels:    labels,
		Value:     float64(h.GetCount()),
		Timestamp: time.Now(),
	}
}

// MetricsCollector manages all metrics
type MetricsCollector struct {
	mu         sync.RWMutex
	counters   map[string]*Counter
	gauges     map[string]*Gauge
	histograms map[string]*Histogram
	startTime  time.Time
}

// NewMetricsCollector creates a new metrics collector
func NewMetricsCollector() *MetricsCollector {
	mc := &MetricsCollector{
		counters:   make(map[string]*Counter),
		gauges:     make(map[string]*Gauge),
		histograms: make(map[string]*Histogram),
		startTime:  time.Now(),
	}

	// Register default system metrics
	mc.registerSystemMetrics()

	return mc
}

// registerSystemMetrics registers default system metrics
func (mc *MetricsCollector) registerSystemMetrics() {
	// System metrics
	mc.NewGauge("go_memstats_alloc_bytes", "Number of bytes allocated and still in use", nil)
	mc.NewGauge("go_memstats_sys_bytes", "Number of bytes obtained from system", nil)
	mc.NewGauge("go_goroutines", "Number of goroutines that currently exist", nil)
	mc.NewCounter("go_memstats_gc_total", "Number of GC runs", nil)

	// HTTP metrics
	mc.NewCounter("http_requests_total", "Total number of HTTP requests", map[string]string{"method": "", "status": ""})
	mc.NewHistogram("http_request_duration_seconds", "HTTP request duration in seconds", map[string]string{"method": "", "status": ""}, nil)

	// Bot metrics
	mc.NewCounter("telegram_messages_total", "Total number of Telegram messages processed", map[string]string{"type": "", "status": ""})
	mc.NewHistogram("telegram_message_processing_duration_seconds", "Time spent processing Telegram messages", map[string]string{"type": ""}, nil)

	// Cache metrics
	mc.NewCounter("cache_operations_total", "Total number of cache operations", map[string]string{"operation": "", "result": ""})
	mc.NewGauge("cache_size_bytes", "Current cache size in bytes", nil)

	// Database metrics
	mc.NewCounter("database_queries_total", "Total number of database queries", map[string]string{"operation": "", "status": ""})
	mc.NewHistogram("database_query_duration_seconds", "Database query duration in seconds", map[string]string{"operation": ""}, nil)
	mc.NewGauge("database_connections_active", "Number of active database connections", nil)
}

// NewCounter creates or gets a counter
func (mc *MetricsCollector) NewCounter(name, help string, labels map[string]string) *Counter {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	key := mc.getMetricKey(name, labels)
	if counter, exists := mc.counters[key]; exists {
		return counter
	}

	counter := NewCounter(name, help, labels)
	mc.counters[key] = counter
	return counter
}

// NewGauge creates or gets a gauge
func (mc *MetricsCollector) NewGauge(name, help string, labels map[string]string) *Gauge {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	key := mc.getMetricKey(name, labels)
	if gauge, exists := mc.gauges[key]; exists {
		return gauge
	}

	gauge := NewGauge(name, help, labels)
	mc.gauges[key] = gauge
	return gauge
}

// NewHistogram creates or gets a histogram
func (mc *MetricsCollector) NewHistogram(name, help string, labels map[string]string, buckets []float64) *Histogram {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	key := mc.getMetricKey(name, labels)
	if histogram, exists := mc.histograms[key]; exists {
		return histogram
	}

	histogram := NewHistogram(name, help, labels, buckets)
	mc.histograms[key] = histogram
	return histogram
}

// getMetricKey generates a unique key for a metric with labels
func (mc *MetricsCollector) getMetricKey(name string, labels map[string]string) string {
	key := name
	for k, v := range labels {
		key += fmt.Sprintf("_%s_%s", k, v)
	}
	return key
}

// UpdateSystemMetrics updates system-level metrics
func (mc *MetricsCollector) UpdateSystemMetrics() {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Update memory metrics
	mc.NewGauge("go_memstats_alloc_bytes", "Number of bytes allocated and still in use", nil).Set(float64(memStats.Alloc))
	mc.NewGauge("go_memstats_sys_bytes", "Number of bytes obtained from system", nil).Set(float64(memStats.Sys))
	mc.NewGauge("go_goroutines", "Number of goroutines that currently exist", nil).Set(float64(runtime.NumGoroutine()))
	mc.NewCounter("go_memstats_gc_total", "Number of GC runs", nil).Add(float64(memStats.NumGC))
}

// GetAllMetrics returns all metrics
func (mc *MetricsCollector) GetAllMetrics() []Metric {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	// Update system metrics before returning
	mc.UpdateSystemMetrics()

	var metrics []Metric

	// Add counters
	for _, counter := range mc.counters {
		metrics = append(metrics, counter.ToMetric())
	}

	// Add gauges
	for _, gauge := range mc.gauges {
		metrics = append(metrics, gauge.ToMetric())
	}

	// Add histograms
	for _, histogram := range mc.histograms {
		metrics = append(metrics, histogram.ToMetric())
	}

	return metrics
}

// GetMetricsSummary returns a summary of all metrics
func (mc *MetricsCollector) GetMetricsSummary() map[string]interface{} {
	metrics := mc.GetAllMetrics()

	summary := map[string]interface{}{
		"timestamp":     time.Now(),
		"uptime":        time.Since(mc.startTime).String(),
		"total_metrics": len(metrics),
		"metrics_by_type": map[string]int{
			"counters":   len(mc.counters),
			"gauges":     len(mc.gauges),
			"histograms": len(mc.histograms),
		},
		"metrics": metrics,
	}

	return summary
}

// PrometheusHandler returns a handler that exports metrics in Prometheus format
func (mc *MetricsCollector) PrometheusHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		metrics := mc.GetAllMetrics()

		c.Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

		for _, metric := range metrics {
			// Write HELP line
			c.Writer.WriteString(fmt.Sprintf("# HELP %s %s\n", metric.Name, metric.Help))

			// Write TYPE line
			c.Writer.WriteString(fmt.Sprintf("# TYPE %s %s\n", metric.Name, metric.Type))

			// Write metric line
			labelStr := ""
			if len(metric.Labels) > 0 {
				labelPairs := make([]string, 0, len(metric.Labels))
				for k, v := range metric.Labels {
					labelPairs = append(labelPairs, fmt.Sprintf(`%s="%s"`, k, v))
				}
				labelStr = fmt.Sprintf("{%s}", fmt.Sprintf("%s", labelPairs))
			}

			c.Writer.WriteString(fmt.Sprintf("%s%s %g %d\n", metric.Name, labelStr, metric.Value, metric.Timestamp.Unix()*1000))
		}
	}
}

// JSONHandler returns a handler that exports metrics in JSON format
func (mc *MetricsCollector) JSONHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		summary := mc.GetMetricsSummary()
		c.JSON(http.StatusOK, summary)
	}
}

// RecordHTTPRequest records HTTP request metrics
func (mc *MetricsCollector) RecordHTTPRequest(method, status string, duration time.Duration) {
	labels := map[string]string{"method": method, "status": status}
	mc.NewCounter("http_requests_total", "Total number of HTTP requests", labels).Inc()
	mc.NewHistogram("http_request_duration_seconds", "HTTP request duration in seconds", labels, nil).Observe(duration.Seconds())
}

// RecordTelegramMessage records Telegram message metrics
func (mc *MetricsCollector) RecordTelegramMessage(messageType, status string, duration time.Duration) {
	labels := map[string]string{"type": messageType, "status": status}
	mc.NewCounter("telegram_messages_total", "Total number of Telegram messages processed", labels).Inc()
	mc.NewHistogram("telegram_message_processing_duration_seconds", "Time spent processing Telegram messages", map[string]string{"type": messageType}, nil).Observe(duration.Seconds())
}

// RecordCacheOperation records cache operation metrics
func (mc *MetricsCollector) RecordCacheOperation(operation, result string) {
	labels := map[string]string{"operation": operation, "result": result}
	mc.NewCounter("cache_operations_total", "Total number of cache operations", labels).Inc()
}

// RecordDatabaseQuery records database query metrics
func (mc *MetricsCollector) RecordDatabaseQuery(operation, status string, duration time.Duration) {
	labels := map[string]string{"operation": operation, "status": status}
	mc.NewCounter("database_queries_total", "Total number of database queries", labels).Inc()
	mc.NewHistogram("database_query_duration_seconds", "Database query duration in seconds", map[string]string{"operation": operation}, nil).Observe(duration.Seconds())
}

// Business Metrics Methods

// RecordUserRegistration records a user registration event
func (mc *MetricsCollector) RecordUserRegistration() {
	mc.NewCounter("user_registrations_total", "Total number of user registrations", nil).Inc()
}

// RecordUserLogin records a user login event
func (mc *MetricsCollector) RecordUserLogin(method string) {
	labels := map[string]string{"method": method}
	mc.NewCounter("user_logins_total", "Total number of user logins", labels).Inc()
}

// RecordUserProfileUpdate records a user profile update
func (mc *MetricsCollector) RecordUserProfileUpdate(updateType string) {
	labels := map[string]string{"type": updateType}
	mc.NewCounter("user_profile_updates_total", "Total number of user profile updates", labels).Inc()
}

// RecordUserDeletion records a user account deletion
func (mc *MetricsCollector) RecordUserDeletion(reason string) {
	labels := map[string]string{"reason": reason}
	mc.NewCounter("user_deletions_total", "Total number of user deletions", labels).Inc()
}

// RecordMatchCreated records a match creation event
func (mc *MetricsCollector) RecordMatchCreated(matchType string) {
	labels := map[string]string{"type": matchType}
	mc.NewCounter("matches_created_total", "Total number of matches created", labels).Inc()
	mc.updateMatchSuccessRate()
}

// RecordMatchAccepted records a match acceptance
func (mc *MetricsCollector) RecordMatchAccepted(matchType string) {
	labels := map[string]string{"type": matchType}
	mc.NewCounter("matches_accepted_total", "Total number of matches accepted", labels).Inc()
	mc.updateMatchSuccessRate()
}

// RecordMatchRejected records a match rejection
func (mc *MetricsCollector) RecordMatchRejected(matchType, reason string) {
	labels := map[string]string{"type": matchType, "reason": reason}
	mc.NewCounter("matches_rejected_total", "Total number of matches rejected", labels).Inc()
	mc.updateMatchSuccessRate()
}

// updateMatchSuccessRate calculates and updates the match success rate
func (mc *MetricsCollector) updateMatchSuccessRate() {
	acceptedCounter := mc.NewCounter("matches_accepted_total", "Total number of matches accepted", nil)
	createdCounter := mc.NewCounter("matches_created_total", "Total number of matches created", nil)

	accepted := acceptedCounter.Get()
	total := createdCounter.Get()

	if total > 0 {
		successRate := (accepted / total) * 100
		mc.NewGauge("match_success_rate_percent", "Match success rate as percentage", nil).Set(successRate)
	}
}

// RecordMessageReceived records a received message
func (mc *MetricsCollector) RecordMessageReceived(messageType, source string) {
	labels := map[string]string{"type": messageType, "source": source}
	mc.NewCounter("messages_received_total", "Total number of messages received", labels).Inc()
}

// RecordMessageSent records a sent message
func (mc *MetricsCollector) RecordMessageSent(messageType, destination string) {
	labels := map[string]string{"type": messageType, "destination": destination}
	mc.NewCounter("messages_sent_total", "Total number of messages sent", labels).Inc()
}

// RecordMessageProcessingTime records message processing duration
func (mc *MetricsCollector) RecordMessageProcessingTime(messageType string, duration time.Duration) {
	labels := map[string]string{"type": messageType}
	mc.NewHistogram("message_processing_duration_seconds", "Message processing duration in seconds", labels, nil).Observe(duration.Seconds())
}

// RecordMessageError records a message processing error
func (mc *MetricsCollector) RecordMessageError(messageType, errorType string) {
	labels := map[string]string{"message_type": messageType, "error_type": errorType}
	mc.NewCounter("message_errors_total", "Total number of message processing errors", labels).Inc()
}

// RecordAPIRequest records API request metrics with detailed labels
func (mc *MetricsCollector) RecordAPIRequest(endpoint, method, status string, duration time.Duration) {
	labels := map[string]string{"endpoint": endpoint, "method": method, "status": status}
	mc.NewCounter("api_requests_total", "Total number of API requests", labels).Inc()
	mc.NewHistogram("api_request_duration_seconds", "API request duration in seconds", map[string]string{"endpoint": endpoint, "method": method}, nil).Observe(duration.Seconds())
}

// UpdateCacheHitRate updates the cache hit rate
func (mc *MetricsCollector) UpdateCacheHitRate(cacheType string, hitRate float64) {
	labels := map[string]string{"type": cacheType}
	mc.NewGauge("cache_hit_rate_percent", "Cache hit rate as percentage", labels).Set(hitRate)
}

// UpdateActiveUsers updates the active users count
func (mc *MetricsCollector) UpdateActiveUsers(timeWindow string, count int64) {
	labels := map[string]string{"window": timeWindow}
	mc.NewGauge("active_users", "Number of active users", labels).Set(float64(count))
}

// RecordError records an error by type and component
func (mc *MetricsCollector) RecordError(component, errorType, severity string) {
	labels := map[string]string{"component": component, "type": errorType, "severity": severity}
	mc.NewCounter("errors_total", "Total number of errors", labels).Inc()
}

// UpdateErrorRate updates the error rate for a component
func (mc *MetricsCollector) UpdateErrorRate(component string, errorRate float64) {
	labels := map[string]string{"component": component}
	mc.NewGauge("error_rate_percent", "Error rate as percentage", labels).Set(errorRate)
}

// RecordBusinessEvent records custom business events
func (mc *MetricsCollector) RecordBusinessEvent(eventType, category string, value float64) {
	labels := map[string]string{"type": eventType, "category": category}
	mc.NewCounter("business_events_total", "Total number of business events", labels).Inc()
	if value > 0 {
		mc.NewHistogram("business_event_values", "Business event values", labels, nil).Observe(value)
	}
}

// UpdateBusinessMetric updates a business-specific gauge metric
func (mc *MetricsCollector) UpdateBusinessMetric(metricName, category string, value float64) {
	labels := map[string]string{"category": category}
	mc.NewGauge(fmt.Sprintf("business_%s", metricName), fmt.Sprintf("Business metric: %s", metricName), labels).Set(value)
}

// GetBusinessMetricsSummary returns a summary of business-specific metrics
func (mc *MetricsCollector) GetBusinessMetricsSummary() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	summary := map[string]interface{}{
		"timestamp": time.Now(),
		"user_metrics": map[string]interface{}{
			"registrations":   mc.getCounterValue("user_registrations_total", nil),
			"logins":          mc.getCounterValue("user_logins_total", nil),
			"profile_updates": mc.getCounterValue("user_profile_updates_total", nil),
			"deletions":       mc.getCounterValue("user_deletions_total", nil),
		},
		"matching_metrics": map[string]interface{}{
			"matches_created":  mc.getCounterValue("matches_created_total", nil),
			"matches_accepted": mc.getCounterValue("matches_accepted_total", nil),
			"matches_rejected": mc.getCounterValue("matches_rejected_total", nil),
			"success_rate":     mc.getGaugeValue("match_success_rate_percent", nil),
		},
		"message_metrics": map[string]interface{}{
			"received": mc.getCounterValue("messages_received_total", nil),
			"sent":     mc.getCounterValue("messages_sent_total", nil),
			"errors":   mc.getCounterValue("message_errors_total", nil),
		},
		"performance_metrics": map[string]interface{}{
			"api_requests":     mc.getCounterValue("api_requests_total", nil),
			"database_queries": mc.getCounterValue("database_queries_total", nil),
			"cache_hit_rate":   mc.getGaugeValue("cache_hit_rate_percent", nil),
			"active_users":     mc.getGaugeValue("active_users", nil),
		},
	}

	return summary
}

// Helper methods to get metric values safely
func (mc *MetricsCollector) getCounterValue(name string, labels map[string]string) float64 {
	key := mc.getMetricKey(name, labels)
	if counter, exists := mc.counters[key]; exists {
		return counter.Get()
	}
	return 0
}

func (mc *MetricsCollector) getGaugeValue(name string, labels map[string]string) float64 {
	key := mc.getMetricKey(name, labels)
	if gauge, exists := mc.gauges[key]; exists {
		return gauge.Get()
	}
	return 0
}
