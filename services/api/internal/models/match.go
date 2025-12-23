package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

type MatchStatus string

const (
	MatchStatusPending  MatchStatus = "pending"
	MatchStatusMatched  MatchStatus = "matched"
	MatchStatusRejected MatchStatus = "rejected"
)

type MatchAction string

const (
	MatchActionLike    MatchAction = "like"
	MatchActionDislike MatchAction = "dislike"
	MatchActionSkip    MatchAction = "skip"
	MatchActionNone    MatchAction = "none"
)

type MatchScore struct {
	Total       float64 `json:"total"`
	Location    float64 `json:"location"`
	Interests   float64 `json:"interests"`
	Preferences float64 `json:"preferences"`
}

// Value implements the driver.Valuer interface for MatchScore
func (m MatchScore) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// Scan implements the sql.Scanner interface for MatchScore
func (m *MatchScore) Scan(value interface{}) error {
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, &m)
}

type Match struct {
	ID          string       `json:"id"`
	User1ID     string       `json:"user1_id"`
	User2ID     string       `json:"user2_id"`
	Status      MatchStatus  `json:"status"`
	Score       MatchScore   `json:"score"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	MatchedAt   *time.Time   `json:"matched_at,omitempty"`
	User1Action *MatchAction `json:"user1_action,omitempty"`
	User2Action *MatchAction `json:"user2_action,omitempty"`
}
