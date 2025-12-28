package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/services/api/internal/models"
)

type UserService struct {
	pb.UnimplementedUserServiceServer
	db *sql.DB
}

func NewUserService(db *sql.DB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.GetUserResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	query := `
		SELECT id, username, first_name, last_name, bio, age, gender, interests, photos, location, preferences, is_active, is_sleeping, is_profile_complete, created_at, updated_at, last_active
		FROM users WHERE id = $1
	`

	var u models.User
	err := s.db.QueryRowContext(ctx, query, req.UserId).Scan(
		&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Bio, &u.Age, &u.Gender,
		pq.Array(&u.Interests), pq.Array(&u.Photos), &u.Location, &u.Preferences,
		&u.IsActive, &u.IsSleeping, &u.IsProfileComplete,
		&u.CreatedAt, &u.UpdatedAt, &u.LastActive,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "user not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to get user: %v", err)
	}

	return &pb.GetUserResponse{User: modelToProto(&u)}, nil
}

func (s *UserService) CreateUser(ctx context.Context, req *pb.CreateUserRequest) (*pb.CreateUserResponse, error) {
	if req.User == nil || req.User.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "invalid user data")
	}

	u := protoToModel(req.User)
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	u.LastActive = now

	// Marshal complex types for insertion
	locJSON, err := json.Marshal(u.Location)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to marshal location: %v", err)
	}
	prefJSON, err := json.Marshal(u.Preferences)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to marshal preferences: %v", err)
	}

	query := `
		INSERT INTO users (id, username, first_name, last_name, bio, age, gender, interests, photos, location, preferences, is_active, is_sleeping, is_profile_complete, created_at, updated_at, last_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id
	`

	_, err = s.db.ExecContext(ctx, query,
		u.ID, u.Username, u.FirstName, u.LastName, u.Bio, u.Age, u.Gender,
		pq.Array(u.Interests), pq.Array(u.Photos), locJSON, prefJSON,
		u.IsActive, u.IsSleeping, u.IsProfileComplete,
		u.CreatedAt, u.UpdatedAt, u.LastActive,
	)

	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" { // unique_violation
			return nil, status.Error(codes.AlreadyExists, "user already exists")
		}
		return nil, status.Errorf(codes.Internal, "failed to create user: %v", err)
	}

	return &pb.CreateUserResponse{User: modelToProto(u)}, nil
}

func (s *UserService) UpdateUser(ctx context.Context, req *pb.UpdateUserRequest) (*pb.UpdateUserResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// This is a simplified update. In a real scenario, we'd build a dynamic query based on update_mask.
	// For now, we'll fetch, update fields, and save back, or just use COALESCE in SQL.
	// Given the Python implementation, it updates partial fields.

	// Let's implement a dynamic update query builder

	// But first, let's just support full update or specific fields if needed.
	// Since we are moving one by one, let's stick to a simple implementation:
	// If the user object is provided, we update non-zero fields (merging).

	// However, standard Update usually implies full replacement or partial with mask.
	// Let's assume we update fields that are present in the request User object (basic merge).

	// Ideally we should use the UpdateMask, but let's implement a simple merge for now.

	// 1. Fetch existing
	uReq := protoToModel(req.User)

	// Build dynamic query
	query := "UPDATE users SET updated_at = NOW()"
	args := []interface{}{}
	argID := 1

	if uReq.FirstName != "" {
		query += fmt.Sprintf(", first_name = $%d", argID)
		args = append(args, uReq.FirstName)
		argID++
	}
	if uReq.Username != nil {
		query += fmt.Sprintf(", username = $%d", argID)
		args = append(args, *uReq.Username)
		argID++
	}
	if uReq.Bio != nil {
		query += fmt.Sprintf(", bio = $%d", argID)
		args = append(args, *uReq.Bio)
		argID++
	}
	if uReq.Age != nil {
		query += fmt.Sprintf(", age = $%d", argID)
		args = append(args, *uReq.Age)
		argID++
	}
	if uReq.Gender != nil {
		query += fmt.Sprintf(", gender = $%d", argID)
		args = append(args, *uReq.Gender)
		argID++
	}
	if uReq.Interests != nil { // empty slice is valid update
		query += fmt.Sprintf(", interests = $%d", argID)
		args = append(args, pq.Array(uReq.Interests))
		argID++
	}
	if uReq.Photos != nil {
		query += fmt.Sprintf(", photos = $%d", argID)
		args = append(args, pq.Array(uReq.Photos))
		argID++
	}
	if uReq.Location != nil {
		locJSON, err := json.Marshal(uReq.Location)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to marshal location: %v", err)
		}
		query += fmt.Sprintf(", location = $%d", argID)
		args = append(args, locJSON)
		argID++
	}

	// Handle preferences merge - fetch existing and merge
	if req.User.Preferences != nil {
		// Fetch existing preferences
		existingResp, err := s.GetUser(ctx, &pb.GetUserRequest{UserId: req.UserId})
		if err != nil {
			return nil, err
		}

		existingPrefs := models.Preferences{}
		if existingResp.User != nil && existingResp.User.Preferences != nil {
			existingPrefs = protoToModel(existingResp.User).Preferences
		}

		// Merge incoming preferences with existing
		incomingPrefs := protoToModel(req.User).Preferences

		// Only update fields that are explicitly set in the request
		if incomingPrefs.MinAge != nil {
			existingPrefs.MinAge = incomingPrefs.MinAge
		}
		if incomingPrefs.MaxAge != nil {
			existingPrefs.MaxAge = incomingPrefs.MaxAge
		}
		if incomingPrefs.MaxDistance != nil {
			existingPrefs.MaxDistance = incomingPrefs.MaxDistance
		}
		if len(incomingPrefs.GenderPreference) > 0 {
			existingPrefs.GenderPreference = incomingPrefs.GenderPreference
		}
		if len(incomingPrefs.RelationshipType) > 0 {
			existingPrefs.RelationshipType = incomingPrefs.RelationshipType
		}
		if incomingPrefs.PreferredLanguage != "" {
			existingPrefs.PreferredLanguage = incomingPrefs.PreferredLanguage
		}
		if incomingPrefs.PreferredCountry != "" {
			existingPrefs.PreferredCountry = incomingPrefs.PreferredCountry
		}
		if incomingPrefs.PremiumTier != "" {
			existingPrefs.PremiumTier = incomingPrefs.PremiumTier
		}
		// NotificationsEnabled is a bool, always set from incoming
		existingPrefs.NotificationsEnabled = incomingPrefs.NotificationsEnabled

		prefJSON, err := json.Marshal(existingPrefs)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to marshal preferences: %v", err)
		}
		query += fmt.Sprintf(", preferences = $%d", argID)
		args = append(args, prefJSON)
		argID++
	}

	query += fmt.Sprintf(" WHERE id = $%d", argID)
	args = append(args, req.UserId)

	_, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user: %v", err)
	}

	// Fetch updated
	resp, err := s.GetUser(ctx, &pb.GetUserRequest{UserId: req.UserId})
	if err != nil {
		return nil, err
	}

	return &pb.UpdateUserResponse{User: resp.User}, nil
}

// UpdateLastActive updates the user's last_active timestamp to now.
// This is called by the bot on every user interaction (fire-and-forget).
func (s *UserService) UpdateLastActive(ctx context.Context, req *pb.UpdateLastActiveRequest) (*pb.UpdateLastActiveResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	query := `UPDATE users SET last_active = NOW(), updated_at = NOW() WHERE id = $1`
	result, err := s.db.ExecContext(ctx, query, req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update last_active: %v", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	return &pb.UpdateLastActiveResponse{Success: true}, nil
}

// UpdateLastRemindedAt updates the user's last_reminded_at timestamp to now.
// This is called by the worker after sending a re-engagement reminder.
func (s *UserService) UpdateLastRemindedAt(ctx context.Context, req *pb.UpdateLastRemindedAtRequest) (*pb.UpdateLastRemindedAtResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	query := `UPDATE users SET last_reminded_at = NOW(), updated_at = NOW() WHERE id = $1`
	result, err := s.db.ExecContext(ctx, query, req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update last_reminded_at: %v", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	return &pb.UpdateLastRemindedAtResponse{Success: true}, nil
}

// Helpers

func modelToProto(u *models.User) *pb.User {
	if u == nil {
		return nil
	}

	pbUser := &pb.User{
		Id:                u.ID,
		FirstName:         u.FirstName,
		IsActive:          u.IsActive,
		IsSleeping:        u.IsSleeping,
		IsProfileComplete: u.IsProfileComplete,
		CreatedAt:         timestamppb.New(u.CreatedAt),
		UpdatedAt:         timestamppb.New(u.UpdatedAt),
		LastActive:        timestamppb.New(u.LastActive),
	}

	if u.Username != nil {
		pbUser.Username = *u.Username
	}
	if u.LastName != nil {
		pbUser.LastName = *u.LastName
	}
	if u.Bio != nil {
		pbUser.Bio = *u.Bio
	}
	if u.Age != nil {
		pbUser.Age = int32(*u.Age)
	}
	if u.Gender != nil {
		pbUser.Gender = string(*u.Gender)
	}

	pbUser.Interests = u.Interests
	pbUser.Photos = u.Photos

	if u.Location != nil {
		pbUser.Location = &pb.Location{
			Latitude:    u.Location.Latitude,
			Longitude:   u.Location.Longitude,
			City:        u.Location.City,
			Country:     u.Location.Country,
			LastUpdated: timestamppb.New(u.Location.LastUpdated),
		}
	}

	// Preferences conversion
	// Check if we should populate preferences (if any field is set)
	// Heuristic: if any pointer is not nil or slices not empty
	prefs := u.Preferences
	hasPrefs := prefs.MinAge != nil || prefs.MaxAge != nil || len(prefs.GenderPreference) > 0 ||
		len(prefs.RelationshipType) > 0 || prefs.MaxDistance != nil ||
		prefs.NotificationsEnabled || prefs.PreferredLanguage != "" ||
		prefs.PreferredCountry != "" || prefs.PremiumTier != ""

	if hasPrefs {
		pbPrefs := &pb.Preferences{
			GenderPreference:     make([]string, len(prefs.GenderPreference)),
			RelationshipType:     prefs.RelationshipType,
			NotificationsEnabled: prefs.NotificationsEnabled,
			PreferredLanguage:    prefs.PreferredLanguage,
			PreferredCountry:     prefs.PreferredCountry,
			PremiumTier:          prefs.PremiumTier,
		}

		if prefs.MinAge != nil {
			pbPrefs.MinAge = int32(*prefs.MinAge)
		}
		if prefs.MaxAge != nil {
			pbPrefs.MaxAge = int32(*prefs.MaxAge)
		}
		if prefs.MaxDistance != nil {
			pbPrefs.MaxDistance = int32(*prefs.MaxDistance)
		}
		if len(prefs.GenderPreference) > 0 {
			for i, g := range prefs.GenderPreference {
				pbPrefs.GenderPreference[i] = string(g)
			}
		}

		pbUser.Preferences = pbPrefs
	}

	return pbUser
}

func protoToModel(p *pb.User) *models.User {
	if p == nil {
		return nil
	}

	u := &models.User{
		ID:                p.Id,
		FirstName:         p.FirstName,
		IsActive:          p.IsActive,
		IsSleeping:        p.IsSleeping,
		IsProfileComplete: p.IsProfileComplete,
		Interests:         p.Interests,
		Photos:            p.Photos,
	}

	if p.Username != "" {
		u.Username = &p.Username
	}
	if p.LastName != "" {
		u.LastName = &p.LastName
	}
	if p.Bio != "" {
		u.Bio = &p.Bio
	}
	if p.Age != 0 {
		age := int(p.Age)
		u.Age = &age
	}
	if p.Gender != "" {
		g := models.Gender(p.Gender)
		u.Gender = &g
	}

	if p.Location != nil {
		u.Location = &models.Location{
			Latitude:  p.Location.Latitude,
			Longitude: p.Location.Longitude,
			City:      p.Location.City,
			Country:   p.Location.Country,
		}
		if p.Location.LastUpdated != nil {
			u.Location.LastUpdated = p.Location.LastUpdated.AsTime()
		}
	}

	if p.Preferences != nil {
		// Initialize with direct values
		u.Preferences = models.Preferences{
			NotificationsEnabled: p.Preferences.NotificationsEnabled,
			PreferredLanguage:    p.Preferences.PreferredLanguage,
			PreferredCountry:     p.Preferences.PreferredCountry,
			PremiumTier:          p.Preferences.PremiumTier,
			RelationshipType:     p.Preferences.RelationshipType,
		}

		if p.Preferences.MinAge > 0 {
			ma := int(p.Preferences.MinAge)
			u.Preferences.MinAge = &ma
		}
		if p.Preferences.MaxAge > 0 {
			ma := int(p.Preferences.MaxAge)
			u.Preferences.MaxAge = &ma
		}
		if p.Preferences.MaxDistance > 0 {
			md := int(p.Preferences.MaxDistance)
			u.Preferences.MaxDistance = &md
		}
		if len(p.Preferences.GenderPreference) > 0 {
			gps := make([]models.Gender, len(p.Preferences.GenderPreference))
			for i, s := range p.Preferences.GenderPreference {
				gps[i] = models.Gender(s)
			}
			u.Preferences.GenderPreference = gps
		}
	}

	return u
}
