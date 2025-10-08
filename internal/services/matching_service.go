package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

type Match = database.Match

type MatchingService struct {
	db *database.DB
}

func NewMatchingService(db *database.DB) *MatchingService {
	return &MatchingService{db: db}
}

func (s *MatchingService) CreateMatch(userID, targetID, status string) (*Match, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"target_id": targetID,
		"status":    status,
		"operation": "create_match",
	})

	logger.Info("Creating match")
	// Check if match already exists
	existingMatch, err := s.getExistingMatch(userID, targetID)
	if err != nil && err.Error() != "match not found" {
		logger.WithError(err).Error("Failed to check existing match")
		return nil, err
	}

	if existingMatch != nil {
		logger.WithField("existing_match_id", existingMatch.ID).Info("Updating existing match")
		// Update existing match
		return s.updateMatchStatus(existingMatch.ID, status)
	}

	// Create new match
	match := &Match{
		ID:        uuid.New().String(),
		UserID:    userID,
		TargetID:  targetID,
		Status:    status,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	query := `
		INSERT INTO matches (id, user_id, target_id, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`

	err = s.db.QueryRow(
		query,
		match.ID, match.UserID, match.TargetID,
		match.Status, match.CreatedAt, match.UpdatedAt,
	).Scan(&match.ID)

	if err != nil {
		logger.WithError(err).Error("Failed to insert match")
		return nil, err
	}

	// Check if this creates a mutual match
	if status == "accepted" {
		logger.Debug("Checking for mutual match")
		err = s.checkAndCreateMutualMatch(userID, targetID)
		if err != nil {
			logger.WithError(err).Error("Failed to check mutual match")
			return nil, err
		}
	}

	logger.WithField("match_id", match.ID).Info("Successfully created match")
	return match, nil
}

func (s *MatchingService) getExistingMatch(userID, targetID string) (*Match, error) {
	match := &Match{}
	query := `
		SELECT id, user_id, target_id, status, created_at, updated_at
		FROM matches 
		WHERE user_id = $1 AND target_id = $2
	`

	err := s.db.QueryRow(query, userID, targetID).Scan(
		&match.ID, &match.UserID, &match.TargetID,
		&match.Status, &match.CreatedAt, &match.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("match not found")
		}
		return nil, err
	}

	return match, nil
}

func (s *MatchingService) updateMatchStatus(matchID, status string) (*Match, error) {
	query := `
		UPDATE matches 
		SET status = $1, updated_at = $2 
		WHERE id = $3
		RETURNING id, user_id, target_id, status, created_at, updated_at
	`

	match := &Match{}
	err := s.db.QueryRow(query, status, time.Now(), matchID).Scan(
		&match.ID, &match.UserID, &match.TargetID,
		&match.Status, &match.CreatedAt, &match.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return match, nil
}

func (s *MatchingService) checkAndCreateMutualMatch(userID, targetID string) error {
	// Check if target user has also accepted this user
	var count int
	query := `
		SELECT COUNT(*) 
		FROM matches 
		WHERE user_id = $1 AND target_id = $2 AND status = 'accepted'
	`

	err := s.db.QueryRow(query, targetID, userID).Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		// It's a mutual match! Update both matches
		return s.db.WithTransaction(func(tx *sql.Tx) error {
			// Update both matches to mutual status
			updateQuery := `
				UPDATE matches 
				SET status = 'mutual', updated_at = $1 
				WHERE (user_id = $2 AND target_id = $3) OR (user_id = $3 AND target_id = $2)
			`
			_, err := tx.Exec(updateQuery, time.Now(), userID, targetID)
			if err != nil {
				return err
			}

			// Create conversation for the mutual match
			conversationID := uuid.New().String()
			convQuery := `
				INSERT INTO conversations (id, user1_id, user2_id, last_activity, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6)
			`
			now := time.Now()
			_, err = tx.Exec(convQuery, conversationID, userID, targetID, now, now, now)
			if err != nil {
				return err
			}

			return nil
		})
	}

	return nil
}

func (s *MatchingService) GetPotentialMatches(userID string, limit int) ([]*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"limit":     limit,
		"operation": "get_potential_matches",
	})

	logger.Debug("Getting potential matches for user")
	// Get user's preferences
	user, err := s.getUserWithPreferences(userID)
	if err != nil {
		logger.WithError(err).Error("Failed to get user preferences")
		return nil, err
	}

	// Build query based on preferences
	query := `
		SELECT DISTINCT u.id, u.telegram_id, u.username, u.name, u.age, u.gender, 
		       u.bio, u.location_text, u.latitude, u.longitude, u.photos, 
		       u.preferences, u.state, u.is_active, u.created_at, u.updated_at
		FROM users u
		WHERE u.id != $1 
		  AND u.is_active = true 
		  AND u.state = 'active'
		  AND u.age BETWEEN $2 AND $3
		  AND u.gender = ANY($4)
		  AND u.id NOT IN (
			  SELECT target_id FROM matches WHERE user_id = $1
		  )
	`

	args := []interface{}{
		userID,
		user.Preferences.MinAge,
		user.Preferences.MaxAge,
		user.Preferences.Genders,
	}

	// Add distance filter if user has location
	if user.Latitude != nil && user.Longitude != nil && user.Preferences.MaxDistance > 0 {
		query += ` AND (
			u.latitude IS NULL OR u.longitude IS NULL OR
			(
				6371 * acos(
					cos(radians($5)) * cos(radians(u.latitude)) *
					cos(radians(u.longitude) - radians($6)) +
					sin(radians($5)) * sin(radians(u.latitude))
				)
			) <= $7
		)`
		args = append(args, *user.Latitude, *user.Longitude, user.Preferences.MaxDistance)
	}

	query += ` ORDER BY RANDOM() LIMIT $` + fmt.Sprintf("%d", len(args)+1)
	args = append(args, limit)

	logger.WithFields(map[string]interface{}{
		"min_age": user.Preferences.MinAge,
		"max_age": user.Preferences.MaxAge,
		"genders": user.Preferences.Genders,
	}).Debug("Executing potential matches query")

	rows, err := s.db.Query(query, args...)
	if err != nil {
		logger.WithError(err).Error("Failed to query potential matches")
		return nil, err
	}
	defer rows.Close()

	var matches []*User
	for rows.Next() {
		match := &User{}
		scanErr := rows.Scan(
			&match.ID, &match.TelegramID, &match.Username, &match.Name,
			&match.Age, &match.Gender, &match.Bio, &match.LocationText,
			&match.Latitude, &match.Longitude, &match.Photos,
			&match.Preferences, &match.State, &match.IsActive,
			&match.CreatedAt, &match.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan potential match row")
			return nil, scanErr
		}
		matches = append(matches, match)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating potential match rows")
		return nil, err
	}

	logger.WithField("count", len(matches)).Info("Successfully retrieved potential matches")
	return matches, nil
}

func (s *MatchingService) getUserWithPreferences(userID string) (*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "get_user_with_preferences",
	})

	logger.Debug("Getting user with preferences")
	user := &User{}
	query := `
		SELECT id, preferences, latitude, longitude
		FROM users WHERE id = $1
	`

	err := s.db.QueryRow(query, userID).Scan(
		&user.ID, &user.Preferences, &user.Latitude, &user.Longitude,
	)

	if err != nil {
		logger.WithError(err).Error("Failed to get user with preferences")
		return nil, err
	}

	logger.Info("Successfully retrieved user with preferences")
	return user, nil
}

func (s *MatchingService) GetUserMatches(userID string, status string, limit, offset int) ([]*Match, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"status":    status,
		"limit":     limit,
		"offset":    offset,
		"operation": "get_user_matches",
	})

	logger.Debug("Getting user matches")
	query := `
		SELECT id, user_id, target_id, status, created_at, updated_at
		FROM matches 
		WHERE user_id = $1
	`
	args := []interface{}{userID}

	if status != "" {
		query += ` AND status = $2`
		args = append(args, status)
	}

	query += ` ORDER BY created_at DESC LIMIT $` + fmt.Sprintf("%d", len(args)+1) + ` OFFSET $` + fmt.Sprintf("%d", len(args)+2)
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		logger.WithError(err).Error("Failed to query user matches")
		return nil, err
	}
	defer rows.Close()

	var matches []*Match
	for rows.Next() {
		match := &Match{}
		scanErr := rows.Scan(
			&match.ID, &match.UserID, &match.TargetID,
			&match.Status, &match.CreatedAt, &match.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan user match row")
			return nil, scanErr
		}
		matches = append(matches, match)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating user match rows")
		return nil, err
	}

	logger.WithField("count", len(matches)).Info("Successfully retrieved user matches")
	return matches, nil
}

func (s *MatchingService) GetMutualMatches(userID string, limit, offset int) ([]*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"limit":     limit,
		"offset":    offset,
		"operation": "get_mutual_matches",
	})

	logger.Debug("Getting mutual matches for user")
	query := `
		SELECT DISTINCT u.id, u.telegram_id, u.username, u.name, u.age, u.gender,
		       u.bio, u.location_text, u.latitude, u.longitude, u.photos,
		       u.preferences, u.state, u.is_active, u.created_at, u.updated_at
		FROM users u
		INNER JOIN matches m ON (u.id = m.target_id AND m.user_id = $1) 
		                     OR (u.id = m.user_id AND m.target_id = $1)
		WHERE m.status = 'mutual' AND u.id != $1
		ORDER BY m.updated_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := s.db.Query(query, userID, limit, offset)
	if err != nil {
		logger.WithError(err).Error("Failed to query mutual matches")
		return nil, err
	}
	defer rows.Close()

	var matches []*User
	for rows.Next() {
		match := &User{}
		scanErr := rows.Scan(
			&match.ID, &match.TelegramID, &match.Username, &match.Name,
			&match.Age, &match.Gender, &match.Bio, &match.LocationText,
			&match.Latitude, &match.Longitude, &match.Photos,
			&match.Preferences, &match.State, &match.IsActive,
			&match.CreatedAt, &match.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan mutual match row")
			return nil, scanErr
		}
		matches = append(matches, match)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating mutual match rows")
		return nil, err
	}

	logger.WithField("count", len(matches)).Info("Successfully retrieved mutual matches")
	return matches, nil
}

func (s *MatchingService) GetMatches(userID, status string) ([]*Match, error) {
	// Default limit for interface compatibility
	return s.GetUserMatches(userID, status, 50, 0)
}

func (s *MatchingService) DeleteMatch(matchID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"match_id":  matchID,
		"operation": "delete_match",
	})

	logger.Debug("Deleting match")
	query := `DELETE FROM matches WHERE id = $1`
	_, err := s.db.Exec(query, matchID)
	if err != nil {
		logger.WithError(err).Error("Failed to delete match")
		return err
	}

	logger.Info("Successfully deleted match")
	return nil
}
