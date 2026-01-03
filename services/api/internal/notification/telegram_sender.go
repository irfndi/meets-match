package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// TelegramSenderConfig holds Telegram sender configuration.
type TelegramSenderConfig struct {
	// BotToken is the Telegram Bot API token.
	BotToken string

	// Timeout for HTTP requests.
	Timeout time.Duration

	// BaseURL for the Telegram API (optional, for testing).
	BaseURL string
}

// TelegramSender sends notifications via Telegram Bot API.
type TelegramSender struct {
	botToken       string
	maskedBotToken string // For safe logging (first 5 chars + "...")
	httpClient     *http.Client
	apiBaseURL     string
}

// NewTelegramSender creates a Telegram notification sender.
func NewTelegramSender(config TelegramSenderConfig) *TelegramSender {
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 10 * time.Second
	}

	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = "https://api.telegram.org"
	}

	// Create masked token for safe logging
	maskedToken := "***"
	if len(config.BotToken) > 5 {
		maskedToken = config.BotToken[:5] + "***"
	}

	return &TelegramSender{
		botToken:       config.BotToken,
		maskedBotToken: maskedToken,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		apiBaseURL: baseURL,
	}
}

// Channel returns the channel this sender handles.
func (s *TelegramSender) Channel() Channel {
	return ChannelTelegram
}

// Send delivers a notification via Telegram.
func (s *TelegramSender) Send(ctx context.Context, n *Notification) SendResult {
	if n.Payload.Telegram == nil {
		return SendResult{
			Success:   false,
			ErrorCode: ErrorCodeInvalidPayload,
			Error:     fmt.Errorf("missing Telegram payload"),
		}
	}

	payload := n.Payload.Telegram

	// Build request body
	reqBody := map[string]interface{}{
		"chat_id": payload.ChatID,
		"text":    payload.Text,
	}

	if payload.ParseMode != "" {
		reqBody["parse_mode"] = payload.ParseMode
	}

	if len(payload.ReplyMarkup) > 0 {
		var markup interface{}
		if err := json.Unmarshal(payload.ReplyMarkup, &markup); err == nil {
			reqBody["reply_markup"] = markup
		}
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return SendResult{
			Success:   false,
			ErrorCode: ErrorCodeInvalidPayload,
			Error:     fmt.Errorf("failed to marshal request: %w", err),
		}
	}

	// Make API request (URL contains token but errors use masked version)
	url := fmt.Sprintf("%s/bot%s/sendMessage", s.apiBaseURL, s.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return SendResult{
			Success:   false,
			ErrorCode: ErrorCodeNetworkError,
			Error:     fmt.Errorf("failed to create request for bot %s: %w", s.maskedBotToken, err),
		}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		errorCode := s.categorizeNetworkError(err)
		return SendResult{
			Success:   false,
			ErrorCode: errorCode,
			Error:     fmt.Errorf("request failed: %w", err),
		}
	}
	defer func() { _ = resp.Body.Close() }()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return SendResult{
			Success:   false,
			ErrorCode: ErrorCodeNetworkError,
			Error:     fmt.Errorf("failed to read response: %w", err),
		}
	}

	// Parse response
	var result telegramResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return SendResult{
			Success:      false,
			ErrorCode:    ErrorCodeNetworkError,
			Error:        fmt.Errorf("failed to decode response: %w", err),
			ResponseData: respBody,
		}
	}

	if !result.OK {
		errorCode := s.mapTelegramError(result.ErrorCode, result.Description)
		return SendResult{
			Success:      false,
			ErrorCode:    errorCode,
			Error:        fmt.Errorf("telegram error %d: %s", result.ErrorCode, result.Description),
			ResponseData: respBody,
		}
	}

	return SendResult{
		Success:      true,
		ResponseData: result.Result,
	}
}

// telegramResponse is the response from Telegram API.
type telegramResponse struct {
	OK          bool            `json:"ok"`
	ErrorCode   int             `json:"error_code,omitempty"`
	Description string          `json:"description,omitempty"`
	Result      json.RawMessage `json:"result,omitempty"`
}

// mapTelegramError maps Telegram API errors to our error codes.
func (s *TelegramSender) mapTelegramError(code int, description string) ErrorCode {
	// Check description for specific patterns
	descLower := strings.ToLower(description)

	switch code {
	case 400:
		// Bad request - check specific errors
		if strings.Contains(descLower, "chat not found") ||
			strings.Contains(descLower, "user not found") ||
			strings.Contains(descLower, "bot was blocked") ||
			strings.Contains(descLower, "user is deactivated") {
			return ErrorCodeUserBlocked
		}
		return ErrorCodeInvalidPayload

	case 401:
		// Unauthorized - invalid bot token
		return ErrorCodeInvalidPayload

	case 403:
		// Forbidden - user blocked the bot or chat not accessible
		return ErrorCodeUserBlocked

	case 429:
		// Too Many Requests - rate limited
		return ErrorCodeRateLimited

	case 500, 502, 503, 504:
		// Telegram service issues
		return ErrorCodeServiceDown

	default:
		return ErrorCodeUnknown
	}
}

// categorizeNetworkError categorizes network errors.
func (s *TelegramSender) categorizeNetworkError(err error) ErrorCode {
	errStr := strings.ToLower(err.Error())

	if strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "deadline exceeded") {
		return ErrorCodeNetworkError
	}

	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "no such host") {
		return ErrorCodeServiceDown
	}

	return ErrorCodeNetworkError
}
