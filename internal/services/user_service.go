package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/meetsmatch/meetsmatch/internal/database"
)

type User = database.User
type Preferences = database.Preferences
type Photos = database.Photos

type UserService struct {
	db *database.DB
}

func NewUserService(db *database.DB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) CreateUser(telegramID int64, username, name string) (*User, error) {
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
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

func (s *UserService) GetUserByID(id string) (*User, error) {
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
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

func (s *UserService) GetUserByTelegramID(telegramID int64) (*User, error) {
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
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

func (s *UserService) UpdateUserState(userID, state string) error {
	query := `UPDATE users SET state = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, state, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user state: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserName(userID, name string) error {
	query := `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, name, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user name: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserAge(userID string, age int) error {
	query := `UPDATE users SET age = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, age, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user age: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserGender(userID, gender string) error {
	query := `UPDATE users SET gender = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, gender, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user gender: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserBio(userID, bio string) error {
	query := `UPDATE users SET bio = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, bio, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user bio: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserLocation(userID, locationText string, lat, lng *float64) error {
	query := `
		UPDATE users 
		SET location_text = $1, latitude = $2, longitude = $3, updated_at = $4 
		WHERE id = $5
	`
	_, err := s.db.Exec(query, locationText, lat, lng, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user location: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserPhotos(userID string, photos Photos) error {
	query := `UPDATE users SET photos = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, photos, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user photos: %w", err)
	}
	return nil
}

func (s *UserService) UpdateUserPreferences(userID string, preferences Preferences) error {
	query := `UPDATE users SET preferences = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, preferences, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user preferences: %w", err)
	}
	return nil
}

func (s *UserService) SetUserActive(userID string, isActive bool) error {
	query := `UPDATE users SET is_active = $1, updated_at = $2 WHERE id = $3`
	_, err := s.db.Exec(query, isActive, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user active status: %w", err)
	}
	return nil
}

func (s *UserService) DeleteUser(userID string) error {
	return s.db.WithTransaction(func(tx *sql.Tx) error {
		// Delete user's matches
		_, err := tx.Exec(`DELETE FROM matches WHERE user_id = $1 OR target_id = $1`, userID)
		if err != nil {
			return fmt.Errorf("failed to delete user matches: %w", err)
		}

		// Delete user's messages
		_, err = tx.Exec(`DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1`, userID)
		if err != nil {
			return fmt.Errorf("failed to delete user messages: %w", err)
		}

		// Delete user's sessions
		_, err = tx.Exec(`DELETE FROM user_sessions WHERE user_id = $1`, userID)
		if err != nil {
			return fmt.Errorf("failed to delete user sessions: %w", err)
		}

		// Delete user's analytics
		_, err = tx.Exec(`DELETE FROM analytics WHERE user_id = $1`, userID)
		if err != nil {
			return fmt.Errorf("failed to delete user analytics: %w", err)
		}

		// Finally delete the user
		_, err = tx.Exec(`DELETE FROM users WHERE id = $1`, userID)
		if err != nil {
			return fmt.Errorf("failed to delete user: %w", err)
		}

		return nil
	})
}

func (s *UserService) GetActiveUsers(limit, offset int) ([]*User, error) {
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
		return nil, fmt.Errorf("failed to get active users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		user := &User{}
		err := rows.Scan(
			&user.ID, &user.TelegramID, &user.Username, &user.Name,
			&user.Age, &user.Gender, &user.Bio, &user.LocationText,
			&user.Latitude, &user.Longitude, &user.Photos,
			&user.Preferences, &user.State, &user.IsActive,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	return users, nil
}

func (s *UserService) GetUserStats(userID string) (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// Get total matches
	var totalMatches int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM matches WHERE user_id = $1`,
		userID,
	).Scan(&totalMatches)
	if err != nil {
		return nil, fmt.Errorf("failed to get total matches: %w", err)
	}
	stats["total_matches"] = totalMatches

	// Get mutual matches
	var mutualMatches int
	err = s.db.QueryRow(
		`SELECT COUNT(*) FROM matches WHERE user_id = $1 AND status = 'mutual'`,
		userID,
	).Scan(&mutualMatches)
	if err != nil {
		return nil, fmt.Errorf("failed to get mutual matches: %w", err)
	}
	stats["mutual_matches"] = mutualMatches

	// Get total messages sent
	var messagesSent int
	err = s.db.QueryRow(
		`SELECT COUNT(*) FROM messages WHERE sender_id = $1`,
		userID,
	).Scan(&messagesSent)
	if err != nil {
		return nil, fmt.Errorf("failed to get messages sent: %w", err)
	}
	stats["messages_sent"] = messagesSent

	return stats, nil
}
