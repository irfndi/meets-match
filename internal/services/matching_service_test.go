package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/meetsmatch/meetsmatch/internal/database"
)

func TestNewMatchingService(t *testing.T) {
	service := NewMatchingService(nil)
	assert.NotNil(t, service)
}

func TestMatch_Creation(t *testing.T) {
	userID := "user-1"
	targetID := "user-2"
	status := "pending"

	match := &Match{
		ID:        "match-123",
		UserID:    userID,
		TargetID:  targetID,
		Status:    status,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	assert.Equal(t, userID, match.UserID)
	assert.Equal(t, targetID, match.TargetID)
	assert.Equal(t, status, match.Status)
	assert.False(t, match.CreatedAt.IsZero())
	assert.False(t, match.UpdatedAt.IsZero())
}

func TestMatch_StatusTransitions(t *testing.T) {
	tests := []struct {
		name     string
		from     string
		to       string
		expected bool
	}{
		{"Pending to accepted", "pending", "accepted", true},
		{"Pending to rejected", "pending", "rejected", true},
		{"Accepted to mutual", "accepted", "mutual", true},
		{"Rejected to accepted", "rejected", "accepted", true},
		{"Mutual to pending", "mutual", "pending", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := isValidMatchStatusTransition(tt.from, tt.to)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// isValidMatchStatusTransition validates match status transitions
func isValidMatchStatusTransition(from, to string) bool {
	validTransitions := map[string][]string{
		"pending":  {"accepted", "rejected"},
		"accepted": {"mutual", "rejected"},
		"rejected": {"accepted"}, // Allow users to change their mind
		"mutual":   {"completed", "ended"},
	}

	if transitions, exists := validTransitions[from]; exists {
		for _, validTo := range transitions {
			if validTo == to {
				return true
			}
		}
	}
	return false
}

func TestMatch_MutualMatchLogic(t *testing.T) {
	match1 := &Match{
		ID:        "match-1",
		UserID:    "user-1",
		TargetID:  "user-2",
		Status:    "accepted",
		CreatedAt: time.Now(),
	}

	match2 := &Match{
		ID:        "match-2",
		UserID:    "user-2",
		TargetID:  "user-1",
		Status:    "accepted",
		CreatedAt: time.Now(),
	}

	// Test mutual match detection
	isMutual := isMutualMatch(match1, match2)
	assert.True(t, isMutual)

	// Test non-mutual match
	match3 := &Match{
		ID:        "match-3",
		UserID:    "user-3",
		TargetID:  "user-2",
		Status:    "rejected",
		CreatedAt: time.Now(),
	}

	isMutual = isMutualMatch(match1, match3)
	assert.False(t, isMutual)
}

// isMutualMatch checks if two matches create a mutual connection
func isMutualMatch(match1, match2 *Match) bool {
	return (match1.UserID == match2.TargetID && match1.TargetID == match2.UserID) &&
		match1.Status == "accepted" && match2.Status == "accepted"
}

func TestMatch_AgeDifference(t *testing.T) {
	tests := []struct {
		name     string
		age1     int
		age2     int
		maxDiff  int
		expected bool
	}{
		{"Small age difference", 25, 27, 10, true},
		{"Exact age", 30, 30, 10, true},
		{"Max age difference", 25, 35, 10, true},
		{"Too large difference", 20, 35, 10, false},
		{"Negative age (invalid)", -5, 25, 10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := isValidAgeDifference(tt.age1, tt.age2, tt.maxDiff)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// isValidAgeDifference validates age difference against max preference
func isValidAgeDifference(age1, age2, maxDiff int) bool {
	if age1 <= 0 || age2 <= 0 {
		return false
	}
	
	diff := age1 - age2
	if diff < 0 {
		diff = -diff
	}
	
	return diff <= maxDiff
}

func TestMatch_PreferenceCompatibility(t *testing.T) {
	user1Prefs := database.Preferences{
		MinAge:       25,
		MaxAge:       35,
		Genders:      []string{"female"},
		MaxDistance:  50,
		ShowOnline:   true,
		ShowDistance: true,
	}

	user2 := &User{
		ID:     "user-2",
		Age:    28,
		Gender: "female",
	}

	// Test compatible match
	compatible := isPreferenceCompatible(user1Prefs, user2)
	assert.True(t, compatible)

	// Test incompatible - age too young
	user3 := &User{
		ID:     "user-3",
		Age:    20,
		Gender: "female",
	}

	compatible = isPreferenceCompatible(user1Prefs, user3)
	assert.False(t, compatible)

	// Test incompatible - wrong gender
	user4 := &User{
		ID:     "user-4",
		Age:    28,
		Gender: "male",
	}

	compatible = isPreferenceCompatible(user1Prefs, user4)
	assert.False(t, compatible)
}

// isPreferenceCompatible checks if user matches preferences
func isPreferenceCompatible(prefs database.Preferences, user *User) bool {
	// Check age
	if user.Age < prefs.MinAge || user.Age > prefs.MaxAge {
		return false
	}

	// Check gender
	genderMatch := false
	for _, gender := range prefs.Genders {
		if gender == user.Gender {
			genderMatch = true
			break
		}
	}
	if !genderMatch {
		return false
	}

	return true
}

func TestMatchingAlgo_ScoreCalculation(t *testing.T) {
	user1 := &User{
		ID:       "user-1",
		Age:      28,
		Gender:   "male",
		LocationText: "New York, NY",
	}

	user2 := &User{
		ID:       "user-2",
		Age:      26,
		Gender:   "female",
		LocationText: "New York, NY",
	}

	score := calculateMatchScore(user1, user2)
	assert.Greater(t, score, 0.0)
	assert.LessOrEqual(t, score, 100.0)

	// Test age difference scoring
	user3 := &User{
		ID:       "user-3",
		Age:      40,
		Gender:   "female",
		LocationText: "New York, NY",
	}

	score2 := calculateMatchScore(user1, user3)
	// Larger age difference should result in lower score
	assert.Greater(t, score, score2)
}

// calculateMatchScore calculates a compatibility score between two users (0-100)
func calculateMatchScore(user1, user2 *User) float64 {
	score := 50.0 // Base score

	// Age compatibility (closer ages score higher)
	ageDiff := user1.Age - user2.Age
	if ageDiff < 0 {
		ageDiff = -ageDiff
	}
	if ageDiff <= 2 {
		score += 20
	} else if ageDiff <= 5 {
		score += 10
	} else if ageDiff <= 10 {
		score += 5
	}

	// Location (same city gets bonus)
	if user1.LocationText == user2.LocationText {
		score += 30
	}

	// Ensure score doesn't exceed 100
	if score > 100 {
		score = 100
	}

	return score
}

func TestMatchTimeValidation(t *testing.T) {
	// Test match time validation
	now := time.Now()
	
	match := &Match{
		ID:        "match-123",
		UserID:    "user-1",
		TargetID:  "user-2",
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Test valid match (created and updated times are valid)
	assert.True(t, isValidMatchTime(match))

	// Test invalid match (updated before created)
	invalidMatch := &Match{
		ID:        "match-456",
		UserID:    "user-3",
		TargetID:  "user-4",
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now.Add(-1 * time.Hour), // Updated before created
	}

	assert.False(t, isValidMatchTime(invalidMatch))
}

// isValidMatchTime validates that match timestamps are logical
func isValidMatchTime(match *Match) bool {
	return match.UpdatedAt.After(match.CreatedAt) || 
		match.UpdatedAt.Equal(match.CreatedAt)
}

func TestMatchStatusValidation(t *testing.T) {
	// Test match status validation
	validStatuses := []string{"pending", "accepted", "rejected", "mutual", "completed", "ended"}
	
	for _, status := range validStatuses {
		assert.True(t, isValidMatchStatus(status), "Status %s should be valid", status)
	}
	
	// Test invalid status
	assert.False(t, isValidMatchStatus("invalid"))
	assert.False(t, isValidMatchStatus(""))
}

// isValidMatchStatus checks if the status is valid
func isValidMatchStatus(status string) bool {
	validStatuses := map[string]bool{
		"pending":    true,
		"accepted":   true,
		"rejected":   true,
		"mutual":     true,
		"completed":  true,
		"ended":      true,
	}
	
	return validStatuses[status]
}