package bothandler

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// StateType represents different types of bot states
type StateType string

const (
	StateTypeConversation StateType = "conversation"
	StateTypeOnboarding   StateType = "onboarding"
	StateTypeMatching     StateType = "matching"
	StateTypeProfile      StateType = "profile"
)

// UserSession represents a user's bot session state
type UserSession struct {
	UserID      string                 `json:"user_id"`
	ChatID      int64                  `json:"chat_id"`
	State       StateType              `json:"state"`
	Data        map[string]interface{} `json:"data"`
	LastUpdated time.Time              `json:"last_updated"`
	ExpiresAt   time.Time              `json:"expires_at"`
}

// StateManager manages bot user sessions and states
type StateManager struct {
	sessions map[string]*UserSession
	mutex    sync.RWMutex
	ttl      time.Duration
}

// NewStateManager creates a new state manager
func NewStateManager(sessionTTL time.Duration) *StateManager {
	return &StateManager{
		sessions: make(map[string]*UserSession),
		mutex:    sync.RWMutex{},
		ttl:      sessionTTL,
	}
}

// GetSession gets a user's session, creating one if it doesn't exist
func (sm *StateManager) GetSession(userID string, chatID int64) *UserSession {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	session, exists := sm.sessions[userID]
	if !exists || time.Now().After(session.ExpiresAt) {
		// Create new session
		session = &UserSession{
			UserID:      userID,
			ChatID:      chatID,
			State:       StateTypeConversation, // Default state
			Data:        make(map[string]interface{}),
			LastUpdated: time.Now(),
			ExpiresAt:   time.Now().Add(sm.ttl),
		}
		sm.sessions[userID] = session
	} else {
		// Update existing session
		session.LastUpdated = time.Now()
		session.ExpiresAt = time.Now().Add(sm.ttl)
		session.ChatID = chatID // Update chat ID in case it changed
	}

	return session
}

// SetSessionState sets the state for a user's session
func (sm *StateManager) SetSessionState(userID string, state StateType) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if session, exists := sm.sessions[userID]; exists {
		session.State = state
		session.LastUpdated = time.Now()
		session.ExpiresAt = time.Now().Add(sm.ttl)
	}
}

// SetSessionData sets data for a user's session
func (sm *StateManager) SetSessionData(userID string, key string, value interface{}) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if session, exists := sm.sessions[userID]; exists {
		session.Data[key] = value
		session.LastUpdated = time.Now()
		session.ExpiresAt = time.Now().Add(sm.ttl)
	}
}

// GetSessionData gets data from a user's session
func (sm *StateManager) GetSessionData(userID string, key string) (interface{}, bool) {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	if session, exists := sm.sessions[userID]; exists {
		value, ok := session.Data[key]
		return value, ok
	}
	return nil, false
}

// ClearSessionData clears specific data from a user's session
func (sm *StateManager) ClearSessionData(userID string, key string) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if session, exists := sm.sessions[userID]; exists {
		delete(session.Data, key)
		session.LastUpdated = time.Now()
	}
}

// ClearSession clears a user's entire session
func (sm *StateManager) ClearSession(userID string) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	delete(sm.sessions, userID)
}

// CleanupExpiredSessions removes expired sessions
func (sm *StateManager) CleanupExpiredSessions() {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	now := time.Now()
	for userID, session := range sm.sessions {
		if now.After(session.ExpiresAt) {
			delete(sm.sessions, userID)
		}
	}
}

// GetActiveSessionsCount returns the number of active sessions
func (sm *StateManager) GetActiveSessionsCount() int {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	return len(sm.sessions)
}

// Conversation state helpers

// SetActiveConversation sets the active conversation for a user
func (sm *StateManager) SetActiveConversation(userID string, conversationID string) {
	sm.SetSessionData(userID, "active_conversation", conversationID)
}

// GetActiveConversation gets the active conversation for a user
func (sm *StateManager) GetActiveConversation(userID string) string {
	if value, ok := sm.GetSessionData(userID, "active_conversation"); ok {
		if conversationID, ok := value.(string); ok {
			return conversationID
		}
	}
	return ""
}

// ClearActiveConversation clears the active conversation for a user
func (sm *StateManager) ClearActiveConversation(userID string) {
	sm.ClearSessionData(userID, "active_conversation")
}

// Onboarding state helpers

// SetOnboardingStep sets the current onboarding step for a user
func (sm *StateManager) SetOnboardingStep(userID string, step string) {
	sm.SetSessionData(userID, "onboarding_step", step)
}

// GetOnboardingStep gets the current onboarding step for a user
func (sm *StateManager) GetOnboardingStep(userID string) string {
	if value, ok := sm.GetSessionData(userID, "onboarding_step"); ok {
		if step, ok := value.(string); ok {
			return step
		}
	}
	return ""
}

// Profile editing state helpers

// SetProfileEditField sets the field being edited in profile
func (sm *StateManager) SetProfileEditField(userID string, field string) {
	sm.SetSessionData(userID, "profile_edit_field", field)
}

// GetProfileEditField gets the field being edited in profile
func (sm *StateManager) GetProfileEditField(userID string) string {
	if value, ok := sm.GetSessionData(userID, "profile_edit_field"); ok {
		if field, ok := value.(string); ok {
			return field
		}
	}
	return ""
}

// Matching state helpers

// SetCurrentMatchIndex sets the current match index for browsing
func (sm *StateManager) SetCurrentMatchIndex(userID string, index int) {
	sm.SetSessionData(userID, "current_match_index", index)
}

// GetCurrentMatchIndex gets the current match index for browsing
func (sm *StateManager) GetCurrentMatchIndex(userID string) int {
	if value, ok := sm.GetSessionData(userID, "current_match_index"); ok {
		if index, ok := value.(int); ok {
			return index
		}
	}
	return 0
}

// SetCachedMatches sets cached matches for a user
func (sm *StateManager) SetCachedMatches(userID string, matches interface{}) {
	sm.SetSessionData(userID, "cached_matches", matches)
}

// GetCachedMatches gets cached matches for a user
func (sm *StateManager) GetCachedMatches(userID string) interface{} {
	if value, ok := sm.GetSessionData(userID, "cached_matches"); ok {
		return value
	}
	return nil
}

// Utility methods

// SerializeSession serializes a session to JSON
func (sm *StateManager) SerializeSession(userID string) ([]byte, error) {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	if session, exists := sm.sessions[userID]; exists {
		return json.Marshal(session)
	}
	return nil, fmt.Errorf("session not found for user %s", userID)
}

// DeserializeSession deserializes a session from JSON
func (sm *StateManager) DeserializeSession(userID string, data []byte) error {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	var session UserSession
	if err := json.Unmarshal(data, &session); err != nil {
		return err
	}

	sm.sessions[userID] = &session
	return nil
}

// StartCleanupRoutine starts a background routine to clean up expired sessions
func (sm *StateManager) StartCleanupRoutine(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			sm.CleanupExpiredSessions()
		}
	}()
}