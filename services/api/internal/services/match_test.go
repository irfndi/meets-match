package services

import (
	"context"
	"testing"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/services/api/internal/models"
)

func TestHaversine(t *testing.T) {
	tests := []struct {
		name     string
		lat1     float64
		lon1     float64
		lat2     float64
		lon2     float64
		expected float64 // approximate expected distance in km
		delta    float64 // acceptable error margin
	}{
		{
			name: "Same location",
			lat1: 37.5665, lon1: 126.9780,
			lat2: 37.5665, lon2: 126.9780,
			expected: 0, delta: 0.1,
		},
		{
			name: "Seoul to Busan",
			lat1: 37.5665, lon1: 126.9780, // Seoul
			lat2: 35.1796, lon2: 129.0756, // Busan
			expected: 325, delta: 10, // ~325 km
		},
		{
			name: "New York to London",
			lat1: 40.7128, lon1: -74.0060, // NYC
			lat2: 51.5074, lon2: -0.1278, // London
			expected: 5570, delta: 50, // ~5570 km
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := haversine(tt.lat1, tt.lon1, tt.lat2, tt.lon2)
			if result < tt.expected-tt.delta || result > tt.expected+tt.delta {
				t.Errorf("haversine() = %v, expected ~%v (±%v)", result, tt.expected, tt.delta)
			}
		})
	}
}

func TestCalculateMatchScore_EmptyUsers(t *testing.T) {
	user1 := &User{
		ID:        "1",
		FirstName: "Test",
	}
	user2 := &User{
		ID:        "2",
		FirstName: "Test2",
	}

	score := calculateMatchScore(user1, user2)

	// With no data, all scores should be 0
	if score.Location != 0 {
		t.Errorf("Expected location score 0, got %v", score.Location)
	}
	if score.Interests != 0 {
		t.Errorf("Expected interests score 0, got %v", score.Interests)
	}
	if score.Preferences != 0 {
		t.Errorf("Expected preferences score 0, got %v", score.Preferences)
	}
	if score.Total != 0 {
		t.Errorf("Expected total score 0, got %v", score.Total)
	}
}

func TestCalculateMatchScore_WithLocation(t *testing.T) {
	maxDist := 20
	user1 := &User{
		ID:        "1",
		FirstName: "Test",
		Location: &Location{
			Latitude:  37.5665,
			Longitude: 126.9780,
		},
		Preferences: Preferences{
			MaxDistance: &maxDist,
		},
	}
	user2 := &User{
		ID:        "2",
		FirstName: "Test2",
		Location: &Location{
			Latitude:  37.5700, // ~400m away
			Longitude: 126.9800,
		},
	}

	score := calculateMatchScore(user1, user2)

	// Should have high location score since very close
	if score.Location < 0.9 {
		t.Errorf("Expected location score > 0.9 for nearby users, got %v", score.Location)
	}
}

func TestCalculateMatchScore_WithInterests(t *testing.T) {
	user1 := &User{
		ID:        "1",
		FirstName: "Test",
		Interests: []string{"coding", "coffee", "music"},
	}
	user2 := &User{
		ID:        "2",
		FirstName: "Test2",
		Interests: []string{"coding", "coffee", "travel"},
	}

	score := calculateMatchScore(user1, user2)

	// Jaccard similarity: intersection=2, union=4, so 0.5
	if score.Interests < 0.4 || score.Interests > 0.6 {
		t.Errorf("Expected interests score ~0.5, got %v", score.Interests)
	}
}

func TestCalculateMatchScore_WithPreferences(t *testing.T) {
	minAge := 20
	maxAge := 30
	user2Age := 25
	male := Gender("male")
	female := Gender("female")

	user1 := &User{
		ID:        "1",
		FirstName: "Test",
		Preferences: Preferences{
			MinAge:           &minAge,
			MaxAge:           &maxAge,
			GenderPreference: []Gender{male},
		},
	}
	user2 := &User{
		ID:        "2",
		FirstName: "Test2",
		Age:       &user2Age,
		Gender:    &male,
	}

	score := calculateMatchScore(user1, user2)

	// Both age and gender match, so 2/2 = 1.0
	if score.Preferences != 1.0 {
		t.Errorf("Expected preferences score 1.0, got %v", score.Preferences)
	}

	// Test with wrong gender
	user2.Gender = &female
	score2 := calculateMatchScore(user1, user2)

	// Age matches, gender doesn't, so 1/2 = 0.5
	if score2.Preferences != 0.5 {
		t.Errorf("Expected preferences score 0.5, got %v", score2.Preferences)
	}
}

func TestMatchService_CreateMatch_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	// Test with empty user IDs
	_, err := svc.CreateMatch(context.Background(), &pb.CreateMatchRequest{
		User1Id: "",
		User2Id: "",
	})

	if err == nil {
		t.Error("Expected error for empty user IDs")
	}
}

func TestMatchService_GetMatch_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	// Test with empty match ID
	_, err := svc.GetMatch(context.Background(), &pb.GetMatchRequest{
		MatchId: "",
	})

	if err == nil {
		t.Error("Expected error for empty match ID")
	}
}

func TestMatchService_LikeMatch_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	// Test with empty match ID - validation should fail before DB access
	_, err := svc.LikeMatch(context.Background(), &pb.LikeMatchRequest{
		MatchId: "",
		UserId:  "user1",
	})

	if err == nil {
		t.Error("Expected error for empty match ID")
	}

	// Test with empty user ID
	_, err = svc.LikeMatch(context.Background(), &pb.LikeMatchRequest{
		MatchId: "match1",
		UserId:  "",
	})

	if err == nil {
		t.Error("Expected error for empty user ID")
	}
}

func TestMatchService_DislikeMatch_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	// Test with empty match ID
	_, err := svc.DislikeMatch(context.Background(), &pb.DislikeMatchRequest{
		MatchId: "",
		UserId:  "user1",
	})

	if err == nil {
		t.Error("Expected error for empty match ID")
	}

	// Test with empty user ID
	_, err = svc.DislikeMatch(context.Background(), &pb.DislikeMatchRequest{
		MatchId: "match1",
		UserId:  "",
	})

	if err == nil {
		t.Error("Expected error for empty user ID")
	}
}

func TestMatchService_GetMatchList_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	_, err := svc.GetMatchList(context.Background(), &pb.GetMatchListRequest{
		UserId: "",
	})

	if err == nil {
		t.Error("Expected error for empty user ID")
	}
}

func TestMatchService_GetPotentialMatches_InvalidArgs(t *testing.T) {
	svc := &MatchService{db: nil}

	_, err := svc.GetPotentialMatches(context.Background(), &pb.GetPotentialMatchesRequest{
		UserId: "",
	})

	if err == nil {
		t.Error("Expected error for empty user ID")
	}
}

// Alias types for test usage
type User = models.User
type Location = models.Location
type Preferences = models.Preferences
type Gender = models.Gender
