package bothandler

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewStateManager(t *testing.T) {
	ttl := time.Hour
	sm := NewStateManager(ttl)

	assert.NotNil(t, sm)
	// Test that it starts with no active sessions
	assert.Equal(t, 0, sm.GetActiveSessionsCount())
}

func TestStateManager_GetSession(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Get session for first time (should create new)
	session := sm.GetSession(userID, chatID)
	
	assert.NotNil(t, session)
	assert.Equal(t, userID, session.UserID)
	assert.Equal(t, chatID, session.ChatID)
	assert.Equal(t, StateTypeConversation, session.State) // Default state
	assert.NotNil(t, session.Data)
	assert.True(t, session.LastUpdated.After(time.Time{}))
	assert.True(t, session.ExpiresAt.After(time.Now()))

	// Get same session again (should return existing)
	session2 := sm.GetSession(userID, chatID)
	assert.Equal(t, session, session2) // Should be the same object
	assert.Equal(t, 1, sm.GetActiveSessionsCount())
}

func TestStateManager_GetSession_Expired(t *testing.T) {
	sm := NewStateManager(time.Millisecond * 10) // Very short TTL
	userID := "123"
	chatID := int64(12345)

	// Create session
	session := sm.GetSession(userID, chatID)
	assert.NotNil(t, session)

	// Wait for expiration
	time.Sleep(time.Millisecond * 20)

	// Get session again (should create new due to expiration)
	session2 := sm.GetSession(userID, chatID)
	assert.NotEqual(t, session, session2) // Should be different objects
	assert.True(t, session2.LastUpdated.After(session.LastUpdated))
}

func TestStateManager_SetSessionState(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	session := sm.GetSession(userID, chatID)
	assert.Equal(t, StateTypeConversation, session.State)

	// Change state
	sm.SetSessionState(userID, StateTypeOnboarding)
	
	// Verify state changed
	session = sm.GetSession(userID, chatID)
	assert.Equal(t, StateTypeOnboarding, session.State)
	assert.True(t, session.LastUpdated.After(time.Now().Add(-time.Second)))
}

func TestStateManager_SetSessionState_NonExistent(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "nonexistent"

	// Try to set state for non-existent session (should not panic)
	sm.SetSessionState(userID, StateTypeOnboarding)
	
	// Should still have no active sessions since session doesn't exist
	assert.Equal(t, 0, sm.GetActiveSessionsCount())
}

func TestStateManager_SessionData(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)

	// Set data
	sm.SetSessionData(userID, "test_key", "test_value")
	
	// Get data
	value, ok := sm.GetSessionData(userID, "test_key")
	assert.True(t, ok)
	assert.Equal(t, "test_value", value)

	// Test non-existent key
	_, ok = sm.GetSessionData(userID, "nonexistent")
	assert.False(t, ok)

	// Clear data
	sm.ClearSessionData(userID, "test_key")
	_, ok = sm.GetSessionData(userID, "test_key")
	assert.False(t, ok)
}

func TestStateManager_ClearSession(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)
	sm.SetSessionData(userID, "test", "value")
	
	assert.Equal(t, 1, sm.GetActiveSessionsCount())

	// Clear session
	sm.ClearSession(userID)
	
	assert.Equal(t, 0, sm.GetActiveSessionsCount())
	
	// Verify data is gone
	_, ok := sm.GetSessionData(userID, "test")
	assert.False(t, ok)
}

func TestStateManager_CleanupExpiredSessions(t *testing.T) {
	sm := NewStateManager(time.Millisecond * 10) // Very short TTL

	// Add multiple sessions
	sm.GetSession("123", 12345)
	sm.GetSession("456", 67890)
	sm.GetSession("789", 11111)

	assert.Equal(t, 3, sm.GetActiveSessionsCount())

	// Wait for expiration
	time.Sleep(time.Millisecond * 20)

	// Add one more session (should not expire)
	sm.GetSession("999", 22222)

	// Run cleanup
	sm.CleanupExpiredSessions()

	// Verify only the new session remains
	assert.Equal(t, 1, sm.GetActiveSessionsCount())
	
	// Verify the remaining session is the new one
	session := sm.GetSession("999", 22222)
	assert.Equal(t, "999", session.UserID)
}

func TestStateManager_ConversationHelpers(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)

	// Test active conversation
	sm.SetActiveConversation(userID, "conv123")
	assert.Equal(t, "conv123", sm.GetActiveConversation(userID))

	// Clear active conversation
	sm.ClearActiveConversation(userID)
	assert.Equal(t, "", sm.GetActiveConversation(userID))
}

func TestStateManager_OnboardingHelpers(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)

	// Test onboarding step
	sm.SetOnboardingStep(userID, "name")
	assert.Equal(t, "name", sm.GetOnboardingStep(userID))
	
	// Default should be empty
	assert.Equal(t, "", sm.GetOnboardingStep("nonexistent"))
}

func TestStateManager_ProfileEditHelpers(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)

	// Test profile edit field
	sm.SetProfileEditField(userID, "age")
	assert.Equal(t, "age", sm.GetProfileEditField(userID))
	
	// Default should be empty
	assert.Equal(t, "", sm.GetProfileEditField("nonexistent"))
}

func TestStateManager_MatchingHelpers(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session
	_ = sm.GetSession(userID, chatID)

	// Test match index
	sm.SetCurrentMatchIndex(userID, 5)
	assert.Equal(t, 5, sm.GetCurrentMatchIndex(userID))
	
	// Default should be 0
	assert.Equal(t, 0, sm.GetCurrentMatchIndex("nonexistent"))

	// Test cached matches
	matches := []string{"user1", "user2", "user3"}
	sm.SetCachedMatches(userID, matches)
	
	cached := sm.GetCachedMatches(userID)
	assert.Equal(t, matches, cached)
	
	// Default should be nil
	assert.Nil(t, sm.GetCachedMatches("nonexistent"))
}

func TestStateManager_Serialization(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Create session with data
	session := sm.GetSession(userID, chatID)
	sm.SetSessionState(userID, StateTypeOnboarding)
	sm.SetSessionData(userID, "test_key", "test_value")

	// Serialize session
	data, err := sm.SerializeSession(userID)
	require.NoError(t, err)
	assert.NotEmpty(t, data)

	// Clear session and create new state manager
	sm.ClearSession(userID)
	sm2 := NewStateManager(time.Hour)

	// Deserialize session
	err = sm2.DeserializeSession(userID, data)
	require.NoError(t, err)

	// Verify deserialized session
	session2 := sm2.GetSession(userID, chatID)
	assert.Equal(t, session.UserID, session2.UserID)
	assert.Equal(t, session.State, session2.State)
	assert.Equal(t, "test_value", session2.Data["test_key"])
}

func TestStateManager_Serialization_NonExistent(t *testing.T) {
	sm := NewStateManager(time.Hour)

	// Try to serialize non-existent session
	data, err := sm.SerializeSession("nonexistent")
	assert.Error(t, err)
	assert.Nil(t, data)
}

func TestStateManager_Deserialization_InvalidData(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"

	// Try to deserialize invalid data
	err := sm.DeserializeSession(userID, []byte("invalid json"))
	assert.Error(t, err)
}

func TestStateManager_StartCleanupRoutine(t *testing.T) {
	sm := NewStateManager(time.Millisecond * 10) // Very short TTL

	// Add sessions
	sm.GetSession("123", 12345)
	sm.GetSession("456", 67890)

	assert.Equal(t, 2, sm.GetActiveSessionsCount())

	// Start cleanup routine
	sm.StartCleanupRoutine(time.Millisecond * 5)

	// Wait for cleanup to run
	time.Sleep(time.Millisecond * 30)

	// Verify sessions were cleaned up
	assert.Equal(t, 0, sm.GetActiveSessionsCount())
}

func TestStateManager_ConcurrentAccess(t *testing.T) {
	sm := NewStateManager(time.Hour)
	userID := "123"
	chatID := int64(12345)

	// Test concurrent access
	done := make(chan bool, 3)

	// Goroutine 1: Get session repeatedly
	go func() {
		for i := 0; i < 50; i++ {
			sm.GetSession(userID, chatID)
		}
		done <- true
	}()

	// Goroutine 2: Set state repeatedly
	go func() {
		for i := 0; i < 50; i++ {
			sm.SetSessionState(userID, StateTypeOnboarding)
			sm.SetSessionState(userID, StateTypeConversation)
		}
		done <- true
	}()

	// Goroutine 3: Set data repeatedly
	go func() {
		for i := 0; i < 50; i++ {
			sm.SetSessionData(userID, "counter", i)
		}
		done <- true
	}()

	// Wait for all goroutines to complete
	<-done
	<-done
	<-done

	// Verify final state exists
	session := sm.GetSession(userID, chatID)
	assert.NotNil(t, session)
}

func TestStateManager_MultipleUsers(t *testing.T) {
	sm := NewStateManager(time.Hour)

	// Set sessions for multiple users
	users := []string{"user1", "user2", "user3"}
	chatIDs := []int64{11111, 22222, 33333}

	for i, userID := range users {
		_ = sm.GetSession(userID, chatIDs[i])
		sm.SetSessionState(userID, StateTypeConversation) // Use a valid state type
		sm.SetSessionData(userID, "index", i)
	}

	// Verify all sessions exist and are correct
	for i, userID := range users {
		session := sm.GetSession(userID, chatIDs[i])
		assert.Equal(t, StateTypeConversation, session.State)
		assert.Equal(t, i, session.Data["index"])
	}

	// Clear one user's session
	sm.ClearSession("user2")

	// Verify only that user's session was cleared
	assert.Equal(t, 2, sm.GetActiveSessionsCount())
	
	// Verify other users' sessions still exist
	for _, userID := range []string{"user1", "user3"} {
		session := sm.GetSession(userID, 0) // chatID doesn't matter for existing session
		assert.NotNil(t, session)
	}
}