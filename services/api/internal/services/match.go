package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/services/api/internal/models"
)

type MatchService struct {
	pb.UnimplementedMatchServiceServer
	db *sql.DB
}

func NewMatchService(db *sql.DB) *MatchService {
	return &MatchService{db: db}
}

// Haversine distance in kilometers
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // Earth radius in km
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)
	lat1Rad := lat1 * (math.Pi / 180.0)
	lat2Rad := lat2 * (math.Pi / 180.0)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLon/2)*math.Sin(dLon/2)*math.Cos(lat1Rad)*math.Cos(lat2Rad)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

// Weights for match score calculation
const (
	LocationWeight    = 0.3
	InterestsWeight   = 0.4
	PreferencesWeight = 0.3
)

func (s *MatchService) GetPotentialMatches(ctx context.Context, req *pb.GetPotentialMatchesRequest) (*pb.GetPotentialMatchesResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 10
	}

	// 1. Get User
	userSvc := NewUserService(s.db)
	userResp, err := userSvc.GetUser(ctx, &pb.GetUserRequest{UserId: req.UserId})
	if err != nil {
		return nil, err
	}
	currentUser := protoToModel(userResp.User)

	// Check eligibility
	if !currentUser.IsActive || !currentUser.IsProfileComplete {
		return &pb.GetPotentialMatchesResponse{PotentialMatches: []*pb.User{}}, nil
	}

	// 2. Build Query for Candidates
	// Filter by Active, Complete, Age Range (if set), Gender (if set)
	query := `
		SELECT id, username, first_name, last_name, bio, age, gender, interests, photos, location, preferences, is_active, is_profile_complete
		FROM users
		WHERE id != $1 AND is_active = true AND is_profile_complete = true
        AND NOT EXISTS (
            SELECT 1 FROM matches 
            WHERE (user1_id = $1 AND user2_id = users.id) 
               OR (user1_id = users.id AND user2_id = $1)
        )
	`
	args := []interface{}{currentUser.ID}
	argID := 2

	// Preferences filter (struct value, fields are pointers)
	if currentUser.Preferences.MinAge != nil && *currentUser.Preferences.MinAge > 0 {
		query += fmt.Sprintf(" AND age >= $%d", argID)
		args = append(args, *currentUser.Preferences.MinAge)
		argID++
	}
	if currentUser.Preferences.MaxAge != nil && *currentUser.Preferences.MaxAge > 0 {
		query += fmt.Sprintf(" AND age <= $%d", argID)
		args = append(args, *currentUser.Preferences.MaxAge)
		argID++
	}
	if len(currentUser.Preferences.GenderPreference) > 0 {
		query += fmt.Sprintf(" AND gender = ANY($%d)", argID)
		args = append(args, pq.Array(currentUser.Preferences.GenderPreference))
	}

	// Fetch more candidates than limit to allow for scoring and re-ranking
	query += fmt.Sprintf(" LIMIT %d", limit*5)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query users: %v", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	var candidates []*models.User
	for rows.Next() {
		var u models.User
		err := rows.Scan(
			&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Bio, &u.Age, &u.Gender,
			pq.Array(&u.Interests), pq.Array(&u.Photos), &u.Location, &u.Preferences,
			&u.IsActive, &u.IsProfileComplete,
		)
		if err != nil {
			continue // Skip malformed
		}
		candidates = append(candidates, &u)
	}

	// Check for errors from iterating over rows
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(codes.Internal, "error iterating candidate rows: %v", err)
	}

	// 3. Score Candidates
	type scoredCandidate struct {
		user  *models.User
		score float64
	}
	var scoredMatches []scoredCandidate

	for _, u := range candidates {

		// Verify distance hard constraint if max_distance is set
		if currentUser.Location != nil && u.Location != nil && currentUser.Preferences.MaxDistance != nil {
			dist := haversine(currentUser.Location.Latitude, currentUser.Location.Longitude, u.Location.Latitude, u.Location.Longitude)
			if dist > float64(*currentUser.Preferences.MaxDistance) {
				continue
			}
		}

		score := calculateMatchScore(currentUser, u)
		scoredMatches = append(scoredMatches, scoredCandidate{user: u, score: score.Total})
	}

	// 4. Sort by Score
	// Sort descending
	// Note: In Go 1.21+ we could use slices.SortFunc, but implementing manual sort for now or use sort.Slice
	// Assuming sort imported or we add it.
	// We didn't import "sort" before, need to check imports. "sort" is not in imports.
	// I will bubble sort or simple selection sort since N is small (limit * 5 = 50),
	// OR I will assume I can update imports manually.
	// Actually, I can replace the whole file content to fix imports, which is cleaner.
	// But since I am using replace_file_content on a chunk, I must be careful.
	// I will use a simple insertion sort for small N to avoid import issues or errors.
	for i := 1; i < len(scoredMatches); i++ {
		j := i
		for j > 0 && scoredMatches[j].score > scoredMatches[j-1].score {
			scoredMatches[j], scoredMatches[j-1] = scoredMatches[j-1], scoredMatches[j]
			j--
		}
	}

	// 5. Return Top N
	var protoMatches []*pb.User
	count := 0
	for _, m := range scoredMatches {
		if count >= limit {
			break
		}
		protoMatches = append(protoMatches, modelToProto(m.user))
		count++
	}

	return &pb.GetPotentialMatchesResponse{PotentialMatches: protoMatches}, nil
}

func calculateMatchScore(user1, user2 *models.User) models.MatchScore {
	score := models.MatchScore{}

	// 1. Location Score
	if user1.Location != nil && user2.Location != nil {
		dist := haversine(user1.Location.Latitude, user1.Location.Longitude, user2.Location.Latitude, user2.Location.Longitude)
		maxDist := 20.0
		if user1.Preferences.MaxDistance != nil {
			maxDist = float64(*user1.Preferences.MaxDistance)
		}
		if dist <= maxDist {
			score.Location = 1.0 - (dist / maxDist)
		}
	}

	// 2. Interests Score
	if len(user1.Interests) > 0 && len(user2.Interests) > 0 {
		common := 0
		unique := make(map[string]bool)
		for _, i := range user1.Interests {
			unique[i] = true
		}
		for _, i := range user2.Interests {
			if unique[i] {
				common++
			}
			unique[i] = true
		}
		if len(unique) > 0 {
			score.Interests = float64(common) / float64(len(unique)) // Jaccard
		}
	}

	// 3. Preferences Score
	prefMatches := 0
	prefChecks := 0

	// No struct nil check needed for value type

	// Age
	if user1.Preferences.MinAge != nil && user1.Preferences.MaxAge != nil && user2.Age != nil {
		prefChecks++
		if *user2.Age >= *user1.Preferences.MinAge && *user2.Age <= *user1.Preferences.MaxAge {
			prefMatches++
		}
	}
	// Gender
	if len(user1.Preferences.GenderPreference) > 0 && user2.Gender != nil {
		prefChecks++
		allowed := false
		for _, g := range user1.Preferences.GenderPreference {
			if string(*user2.Gender) == string(g) {
				allowed = true
				break
			}
		}
		if allowed {
			prefMatches++
		}
	}
	// Relationship Type - overlap check
	if len(user1.Preferences.RelationshipType) > 0 && len(user2.Preferences.RelationshipType) > 0 {
		prefChecks++
		// Check overlap
		overlap := false
		rtSet := make(map[string]bool)
		for _, rt := range user1.Preferences.RelationshipType {
			rtSet[rt] = true
		}
		for _, rt := range user2.Preferences.RelationshipType {
			if rtSet[rt] {
				overlap = true
				break
			}
		}
		if overlap {
			prefMatches++
		}
	}

	if prefChecks > 0 {
		score.Preferences = float64(prefMatches) / float64(prefChecks)
	}

	// Total Weighted Score
	score.Total = (score.Location * LocationWeight) +
		(score.Interests * InterestsWeight) +
		(score.Preferences * PreferencesWeight)

	// Normalize
	if score.Total > 1.0 {
		score.Total = 1.0
	}

	return score
}

// ... Implement other methods as TODOs or empty ...

func (s *MatchService) CreateMatch(ctx context.Context, req *pb.CreateMatchRequest) (*pb.CreateMatchResponse, error) {
	if req.User1Id == "" || req.User2Id == "" {
		return nil, status.Error(codes.InvalidArgument, "users are required")
	}

	// Check if exists
	var id string
	err := s.db.QueryRowContext(ctx, "SELECT id FROM matches WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)", req.User1Id, req.User2Id).Scan(&id)
	if err == nil {
		// Exists, return it
		m, err := s.GetMatch(ctx, &pb.GetMatchRequest{MatchId: id})
		if err != nil {
			return nil, err
		}
		return &pb.CreateMatchResponse{Match: m.Match}, nil
	}

	// Calculate score
	userSvc := NewUserService(s.db)
	u1Resp, err := userSvc.GetUser(ctx, &pb.GetUserRequest{UserId: req.User1Id})
	if err != nil {
		return nil, err
	}
	u2Resp, err := userSvc.GetUser(ctx, &pb.GetUserRequest{UserId: req.User2Id})
	if err != nil {
		return nil, err
	}

	u1 := protoToModel(u1Resp.User)
	u2 := protoToModel(u2Resp.User)
	score := calculateMatchScore(u1, u2)
	scoreJSON, err := json.Marshal(score)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to marshal match score: %v", err)
	}

	// Insert
	newID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO matches (id, user1_id, user2_id, status, score, created_at, updated_at, user1_action, user2_action)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err = s.db.ExecContext(ctx, query,
		newID, req.User1Id, req.User2Id, "pending", scoreJSON, now, now, "none", "none",
	)

	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create match: %v", err)
	}

	m, err := s.GetMatch(ctx, &pb.GetMatchRequest{MatchId: newID})
	if err != nil {
		return nil, err
	}
	return &pb.CreateMatchResponse{Match: m.Match}, nil
}

func (s *MatchService) GetMatch(ctx context.Context, req *pb.GetMatchRequest) (*pb.GetMatchResponse, error) {
	if req.MatchId == "" {
		return nil, status.Error(codes.InvalidArgument, "match_id required")
	}

	query := `SELECT id, user1_id, user2_id, status, score, created_at, updated_at, matched_at, user1_action, user2_action FROM matches WHERE id = $1`

	var m models.Match
	var matchedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, query, req.MatchId).Scan(
		&m.ID, &m.User1ID, &m.User2ID, &m.Status, &m.Score, &m.CreatedAt, &m.UpdatedAt, &matchedAt, &m.User1Action, &m.User2Action,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "match not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to get match: %v", err)
	}
	if matchedAt.Valid {
		m.MatchedAt = &matchedAt.Time
	}

	// Convert to proto
	pbMatch := &pb.Match{
		Id:        m.ID,
		User1Id:   m.User1ID,
		User2Id:   m.User2ID,
		Status:    string(m.Status),
		Score:     m.Score.Total,
		CreatedAt: timestamppb.New(m.CreatedAt),
		UpdatedAt: timestamppb.New(m.UpdatedAt),
	}
	if m.MatchedAt != nil {
		pbMatch.MatchedAt = timestamppb.New(*m.MatchedAt)
	}

	return &pb.GetMatchResponse{Match: pbMatch}, nil
}

func (s *MatchService) LikeMatch(ctx context.Context, req *pb.LikeMatchRequest) (*pb.LikeMatchResponse, error) {
	if req.MatchId == "" {
		return nil, status.Error(codes.InvalidArgument, "match_id is required")
	}
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// Fetch match
	query := `SELECT id, user1_id, user2_id, user1_action, user2_action, status FROM matches WHERE id = $1`
	var id, u1, u2 string
	var act1, act2 models.MatchAction
	var statusStr models.MatchStatus
	err := s.db.QueryRowContext(ctx, query, req.MatchId).Scan(&id, &u1, &u2, &act1, &act2, &statusStr)
	if err != nil {
		return nil, err
	}

	who := 0 // 1 for user1, 2 for user2
	switch req.UserId {
	case u1:
		who = 1
	case u2:
		who = 2
	default:
		return nil, status.Error(codes.PermissionDenied, "user not part of match")
	}

	// Update action
	updateQuery := ""
	isMatch := false
	now := time.Now()

	if who == 1 {
		if act2 == models.MatchActionLike {
			isMatch = true
			updateQuery = `UPDATE matches SET user1_action='like', status='matched', matched_at=$2, updated_at=$2 WHERE id=$1`
		} else {
			updateQuery = `UPDATE matches SET user1_action='like', updated_at=$2 WHERE id=$1`
		}
	} else {
		if act1 == models.MatchActionLike {
			isMatch = true
			updateQuery = `UPDATE matches SET user2_action='like', status='matched', matched_at=$2, updated_at=$2 WHERE id=$1`
		} else {
			updateQuery = `UPDATE matches SET user2_action='like', updated_at=$2 WHERE id=$1`
		}
	}

	_, err = s.db.ExecContext(ctx, updateQuery, req.MatchId, now)
	if err != nil {
		return nil, err
	}

	// Get updated match
	res, err := s.GetMatch(ctx, &pb.GetMatchRequest{MatchId: req.MatchId})
	if err != nil {
		return nil, err
	}

	return &pb.LikeMatchResponse{IsMutual: isMatch, Match: res.Match}, nil
}

func (s *MatchService) DislikeMatch(ctx context.Context, req *pb.DislikeMatchRequest) (*pb.DislikeMatchResponse, error) {
	if req.MatchId == "" {
		return nil, status.Error(codes.InvalidArgument, "match_id is required")
	}
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	query := `SELECT id, user1_id, user2_id FROM matches WHERE id = $1`
	var id, u1, u2 string
	err := s.db.QueryRowContext(ctx, query, req.MatchId).Scan(&id, &u1, &u2)
	if err != nil {
		return nil, err
	}

	who := 0
	switch req.UserId {
	case u1:
		who = 1
	case u2:
		who = 2
	default:
		return nil, status.Error(codes.PermissionDenied, "user not part of match")
	}

	updateQuery := ""
	now := time.Now()
	if who == 1 {
		updateQuery = `UPDATE matches SET user1_action='dislike', status='rejected', updated_at=$2 WHERE id=$1`
	} else {
		updateQuery = `UPDATE matches SET user2_action='dislike', status='rejected', updated_at=$2 WHERE id=$1`
	}

	_, err = s.db.ExecContext(ctx, updateQuery, req.MatchId, now)
	if err != nil {
		return nil, err
	}

	res, err := s.GetMatch(ctx, &pb.GetMatchRequest{MatchId: req.MatchId})
	if err != nil {
		return nil, err
	}

	return &pb.DislikeMatchResponse{Match: res.Match}, nil
}

func (s *MatchService) GetMatchList(ctx context.Context, req *pb.GetMatchListRequest) (*pb.GetMatchListResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id required")
	}

	query := `
        SELECT id, user1_id, user2_id, status, score, created_at, updated_at, matched_at
        FROM matches 
        WHERE (user1_id=$1 OR user2_id=$1) AND status='matched'
        ORDER BY matched_at DESC
        LIMIT $2
    `
	limit := 50
	rows, err := s.db.QueryContext(ctx, query, req.UserId, limit)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	var matches []*pb.Match
	for rows.Next() {
		var m models.Match
		var matchedAt sql.NullTime
		// Scan partial fields
		err := rows.Scan(&m.ID, &m.User1ID, &m.User2ID, &m.Status, &m.Score, &m.CreatedAt, &m.UpdatedAt, &matchedAt)
		if err != nil {
			continue
		}
		if matchedAt.Valid {
			m.MatchedAt = &matchedAt.Time
		}

		pbMatch := &pb.Match{
			Id:        m.ID,
			User1Id:   m.User1ID,
			User2Id:   m.User2ID,
			Status:    string(m.Status),
			Score:     m.Score.Total,
			CreatedAt: timestamppb.New(m.CreatedAt),
			UpdatedAt: timestamppb.New(m.UpdatedAt),
		}
		if m.MatchedAt != nil {
			pbMatch.MatchedAt = timestamppb.New(*m.MatchedAt)
		}
		matches = append(matches, pbMatch)
	}

	// Check for errors from iterating over rows
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(codes.Internal, "error iterating match rows: %v", err)
	}

	return &pb.GetMatchListResponse{Matches: matches}, nil
}

// SkipMatch marks a match as skipped (saved for later)
func (s *MatchService) SkipMatch(ctx context.Context, req *pb.SkipMatchRequest) (*pb.SkipMatchResponse, error) {
	if req.MatchId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "match_id and user_id required")
	}

	query := `SELECT id, user1_id, user2_id FROM matches WHERE id = $1`
	var id, u1, u2 string
	err := s.db.QueryRowContext(ctx, query, req.MatchId).Scan(&id, &u1, &u2)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "match not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to get match: %v", err)
	}

	who := 0
	switch req.UserId {
	case u1:
		who = 1
	case u2:
		who = 2
	default:
		return nil, status.Error(codes.PermissionDenied, "user not part of match")
	}

	updateQuery := ""
	now := time.Now()
	if who == 1 {
		updateQuery = `UPDATE matches SET user1_action='skip', updated_at=$2 WHERE id=$1`
	} else {
		updateQuery = `UPDATE matches SET user2_action='skip', updated_at=$2 WHERE id=$1`
	}

	_, err = s.db.ExecContext(ctx, updateQuery, req.MatchId, now)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to skip match: %v", err)
	}

	res, err := s.GetMatch(ctx, &pb.GetMatchRequest{MatchId: req.MatchId})
	if err != nil {
		return nil, err
	}

	return &pb.SkipMatchResponse{Match: res.Match}, nil
}
