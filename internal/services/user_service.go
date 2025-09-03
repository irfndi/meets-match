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

type User = database.User
type Preferences = database.Preferences
type Photos = database.Photos
type UserStats = database.UserStats

type UserService struct {
	db *database.DB
}

func NewUserService(db *database.DB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) CreateUser(telegramID int64, username, name string) (*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"telegram_id": telegramID,
		"username":    username,
		"operation":   "create_user",
	})

	user := &User{
		ID:         uuid.New().String(),
		TelegramID: telegramID,
		Username:   username,
		Name:       name,
		State:      "new",
		IsActive:   true,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
		Preferences: Preferences{
			MinAge:       18,
			MaxAge:       50,
			Genders:      []string{"male", "female"},
			MaxDistance:  50,
			ShowOnline:   true,
			ShowDistance: true,
		},
	}
	logger.WithField("user_id", user.ID).Info("Creating new user")

	query := `
		INSERT INTO users (
			id, telegram_id, username, name, state, is_active, 
			preferences, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`

	err := s.db.QueryRow(
		query,
		user.ID, user.TelegramID, user.Username, user.Name,
		user.State, user.IsActive, user.Preferences,
		user.CreatedAt, user.UpdatedAt,
	).Scan(&user.ID)

	if err != nil {
		logger.WithError(err).Error("Failed to create user in database")
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	logger.WithField("user_id", user.ID).Info("Successfully created user")
	return user, nil
}

func (s *UserService) GetUserByID(id string) (*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   id,
		"operation": "get_user_by_id",
	})

	user := &User{}
	query := `
		SELECT id, telegram_id, username, name, age, gender, bio,
		       location_text, latitude, longitude, photos, preferences,
		       state, is_active, created_at, updated_at
		FROM users WHERE id = $1
	`

	err := s.db.QueryRow(query, id).Scan(
		&user.ID, &user.TelegramID, &user.Username, &user.Name,
		&user.Age, &user.Gender, &user.Bio, &user.LocationText,
		&user.Latitude, &user.Longitude, &user.Photos,
		&user.Preferences, &user.State, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			logger.Warn("User not found")
			return nil, fmt.Errorf("user not found")
		}
		logger.WithError(err).Error("Failed to get user from database")
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	logger.Info("Successfully retrieved user")
	return user, nil
}

func (s *UserService) GetUserByTelegramID(telegramID int64) (*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"telegram_id": telegramID,
		"operation":   "get_user_by_telegram_id",
	})

	user := &User{}
	query := `
		SELECT id, telegram_id, username, name, age, gender, bio,
		       location_text, latitude, longitude, photos, preferences,
		       state, is_active, created_at, updated_at
		FROM users WHERE telegram_id = $1
	`

	err := s.db.QueryRow(query, telegramID).Scan(
		&user.ID, &user.TelegramID, &user.Username, &user.Name,
		&user.Age, &user.Gender, &user.Bio, &user.LocationText,
		&user.Latitude, &user.Longitude, &user.Photos,
		&user.Preferences, &user.State, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			logger.Warn("User not found by Telegram ID")
			return nil, fmt.Errorf("user not found")
		}
		logger.WithError(err).Error("Failed to get user by Telegram ID from database")
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	logger.WithField("user_id", user.ID).Info("Successfully retrieved user by Telegram ID")
	return user, nil
}

func (s *UserService) UpdateUserState(userID, state string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"new_state": state,
		"operation": "update_user_state",
	})

	query := `UPDATE users SET state = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, state, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user state")
		return fmt.Errorf("failed to update user state: %w", err)
	}
	logger.Info("Successfully updated user state")
	return nil
}

func (s *UserService) UpdateUserName(userID, name string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "update_user_name",
	})

	logger.Debug("Updating user name")
	query := `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, name, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user name")
		return fmt.Errorf("failed to update user name: %w", err)
	}

	logger.Info("Successfully updated user name")
	return nil
}

func (s *UserService) UpdateUserAge(userID string, age int) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"age":       age,
		"operation": "update_user_age",
	})

	logger.Debug("Updating user age")
	query := `UPDATE users SET age = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, age, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user age")
		return fmt.Errorf("failed to update user age: %w", err)
	}

	logger.Info("Successfully updated user age")
	return nil
}

func (s *UserService) UpdateUserGender(userID, gender string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"gender":    gender,
		"operation": "update_user_gender",
	})

	logger.Debug("Updating user gender")
	query := `UPDATE users SET gender = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, gender, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user gender")
		return fmt.Errorf("failed to update user gender: %w", err)
	}

	logger.Info("Successfully updated user gender")
	return nil
}

func (s *UserService) UpdateUserBio(userID, bio string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "update_user_bio",
	})

	logger.Debug("Updating user bio")
	query := `UPDATE users SET bio = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, bio, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user bio")
		return fmt.Errorf("failed to update user bio: %w", err)
	}

	logger.Info("Successfully updated user bio")
	return nil
}

func (s *UserService) UpdateUserLocation(userID, locationText string, lat, lng *float64) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":       userID,
		"location_text": locationText,
		"operation":     "update_user_location",
	})

	logger.Debug("Updating user location")
	query := `
		UPDATE users 
		SET location_text = $1, latitude = $2, longitude = $3, updated_at = $4 
		WHERE id = $5
	`
	_, err := s.db.Exec(query, locationText, lat, lng, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user location")
		return fmt.Errorf("failed to update user location: %w", err)
	}

	logger.Info("Successfully updated user location")
	return nil
}

func (s *UserService) UpdateUserPhotos(userID string, photos Photos) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "update_user_photos",
	})

	logger.Debug("Updating user photos")
	query := `UPDATE users SET photos = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, photos, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user photos")
		return fmt.Errorf("failed to update user photos: %w", err)
	}

	logger.Info("Successfully updated user photos")
	return nil
}

func (s *UserService) UpdateUserPreferences(userID string, preferences Preferences) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "update_user_preferences",
	})

	logger.Debug("Updating user preferences")
	query := `UPDATE users SET preferences = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, preferences, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user preferences")
		return fmt.Errorf("failed to update user preferences: %w", err)
	}

	logger.Info("Successfully updated user preferences")
	return nil
}

func (s *UserService) SetUserActive(userID string, isActive bool) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"is_active": isActive,
		"operation": "set_user_active",
	})

	logger.Debug("Setting user active status")
	query := `UPDATE users SET is_active = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, isActive, time.Now(), userID)
	if err != nil {
		logger.WithError(err).Error("Failed to update user active status")
		return fmt.Errorf("failed to update user active status: %w", err)
	}

	logger.Info("Successfully updated user active status")
	return nil
}

func (s *UserService) DeleteUser(userID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "delete_user",
	})

	logger.Debug("Deleting user")
	return s.db.WithTransaction(func(tx *sql.Tx) error {
		// Delete user's matches
		_, err := tx.Exec(`DELETE FROM matches WHERE user_id = $1 OR target_id = $1`, userID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete user matches")
			return fmt.Errorf("failed to delete user matches: %w", err)
		}

		// Delete user's messages
		_, err = tx.Exec(`DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1`, userID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete user messages")
			return fmt.Errorf("failed to delete user messages: %w", err)
		}

		// Delete user's sessions
		_, err = tx.Exec(`DELETE FROM user_sessions WHERE user_id = $1`, userID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete user sessions")
			return fmt.Errorf("failed to delete user sessions: %w", err)
		}

		// Delete user's analytics
		_, err = tx.Exec(`DELETE FROM analytics WHERE user_id = $1`, userID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete user analytics")
			return fmt.Errorf("failed to delete user analytics: %w", err)
		}

		// Finally delete the user
		_, err = tx.Exec(`DELETE FROM users WHERE id = $1`, userID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete user")
			return fmt.Errorf("failed to delete user: %w", err)
		}

		logger.Info("Successfully deleted user")
		return nil
	})
}

func (s *UserService) GetActiveUsers(limit, offset int) ([]*User, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"limit":     limit,
		"offset":    offset,
		"operation": "get_active_users",
	})

	logger.Debug("Querying active users")
	query := `
		SELECT id, telegram_id, username, name, age, gender, bio,
		       location_text, latitude, longitude, photos, preferences,
		       state, is_active, created_at, updated_at
		FROM users 
		WHERE is_active = true AND state = 'active'
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := s.db.Query(query, limit, offset)
	if err != nil {
		logger.WithError(err).Error("Failed to query active users")
		return nil, fmt.Errorf("failed to get active users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		user := &User{}
		scanErr := rows.Scan(
			&user.ID, &user.TelegramID, &user.Username, &user.Name,
			&user.Age, &user.Gender, &user.Bio, &user.LocationText,
			&user.Latitude, &user.Longitude, &user.Photos,
			&user.Preferences, &user.State, &user.IsActive,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan user row")
			return nil, fmt.Errorf("failed to scan user: %w", scanErr)
		}
		users = append(users, user)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating user rows")
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	logger.WithField("count", len(users)).Info("Successfully retrieved active users")
	return users, nil
}

func (s *UserService) GetUserStats(userID string) (*UserStats, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "get_user_stats",
	})

	logger.Debug("Getting user statistics")
	var stats UserStats

	// Get total matches
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM matches 
		WHERE user_id = $1 AND status = 'liked'
	`, userID).Scan(&stats.TotalMatches)
	if err != nil {
		logger.WithError(err).Error("Failed to get total matches")
		return nil, fmt.Errorf("failed to get total matches: %w", err)
	}

	// Get mutual matches
	err = s.db.QueryRow(`
		SELECT COUNT(*) FROM matches m1
		JOIN matches m2 ON m1.target_id = m2.user_id AND m1.user_id = m2.target_id
		WHERE m1.user_id = $1 AND m1.status = 'liked' AND m2.status = 'liked'
	`, userID).Scan(&stats.MutualMatches)
	if err != nil {
		logger.WithError(err).Error("Failed to get mutual matches")
		return nil, fmt.Errorf("failed to get mutual matches: %w", err)
	}

	// Get messages sent
	err = s.db.QueryRow(`
		SELECT COUNT(*) FROM messages 
		WHERE sender_id = $1
	`, userID).Scan(&stats.MessagesSent)
	if err != nil {
		logger.WithError(err).Error("Failed to get messages sent")
		return nil, fmt.Errorf("failed to get messages sent: %w", err)
	}

	// Get messages received
	err = s.db.QueryRow(`
		SELECT COUNT(*) FROM messages 
		WHERE receiver_id = $1
	`, userID).Scan(&stats.MessagesReceived)
	if err != nil {
		logger.WithError(err).Error("Failed to get messages received")
		return nil, fmt.Errorf("failed to get messages received: %w", err)
	}

	logger.WithFields(map[string]interface{}{
		"total_matches":     stats.TotalMatches,
		"mutual_matches":    stats.MutualMatches,
		"messages_sent":     stats.MessagesSent,
		"messages_received": stats.MessagesReceived,
	}).Info("Successfully retrieved user statistics")

	return &stats, nil
}
