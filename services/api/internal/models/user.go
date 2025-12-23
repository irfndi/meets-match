package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

type Gender string

const (
	GenderMale   Gender = "male"
	GenderFemale Gender = "female"
)

type Location struct {
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	City        string    `json:"city,omitempty"`
	Country     string    `json:"country,omitempty"`
	LastUpdated time.Time `json:"last_updated"`
}

// Make Location implement driver.Valuer
func (l Location) Value() (driver.Value, error) {
	return json.Marshal(l)
}

// Make Location implement sql.Scanner
func (l *Location) Scan(value interface{}) error {
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, &l)
}

type Preferences struct {
	MinAge               *int     `json:"min_age,omitempty"`
	MaxAge               *int     `json:"max_age,omitempty"`
	GenderPreference     []Gender `json:"gender_preference,omitempty"`
	RelationshipType     []string `json:"relationship_type,omitempty"`
	MaxDistance          *int     `json:"max_distance,omitempty"`
	NotificationsEnabled bool     `json:"notifications_enabled"`
	PreferredLanguage    string   `json:"preferred_language,omitempty"`
	PreferredCountry     string   `json:"preferred_country,omitempty"`
	PremiumTier          string   `json:"premium_tier,omitempty"`
}

// Make Preferences implement driver.Valuer
func (p Preferences) Value() (driver.Value, error) {
	return json.Marshal(p)
}

// Make Preferences implement sql.Scanner
func (p *Preferences) Scan(value interface{}) error {
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, &p)
}

type User struct {
	ID                string      `json:"id" db:"id"`
	Username          *string     `json:"username,omitempty" db:"username"`
	FirstName         string      `json:"first_name" db:"first_name"`
	LastName          *string     `json:"last_name,omitempty" db:"last_name"`
	Bio               *string     `json:"bio,omitempty" db:"bio"`
	Age               *int        `json:"age,omitempty" db:"age"`
	Gender            *Gender     `json:"gender,omitempty" db:"gender"`
	Interests         []string    `json:"interests" db:"interests"`
	Photos            []string    `json:"photos" db:"photos"`
	Location          *Location   `json:"location,omitempty" db:"location"`
	Preferences       Preferences `json:"preferences" db:"preferences"`
	IsActive          bool        `json:"is_active" db:"is_active"`
	IsSleeping        bool        `json:"is_sleeping" db:"is_sleeping"`
	IsProfileComplete bool        `json:"is_profile_complete" db:"is_profile_complete"`
	CreatedAt         time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at" db:"updated_at"`
	LastActive        time.Time   `json:"last_active" db:"last_active"`
	LastRemindedAt    *time.Time  `json:"last_reminded_at,omitempty" db:"last_reminded_at"`
}
