package models

import (
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type SQLiteTime struct{ time.Time }

var _ sql.Scanner = (*SQLiteTime)(nil)
var _ driver.Valuer = (*SQLiteTime)(nil)

func (st *SQLiteTime) Scan(value interface{}) error {
	if value == nil {
		st.Time = time.Time{}
		return nil
	}
	switch v := value.(type) {
	case time.Time:
		st.Time = v
		return nil
	case string:
		layouts := []string{
			"2006-01-02 15:04:05.999999",
			"2006-01-02 15:04:05",
			time.RFC3339,
			time.RFC3339Nano,
		}
		for _, layout := range layouts {
			if t, err := time.Parse(layout, v); err == nil {
				st.Time = t
				return nil
			}
		}
		return fmt.Errorf("cannot parse %q as time", v)
	case []byte:
		return st.Scan(string(v))
	}
	return fmt.Errorf("cannot scan %T into SQLiteTime", value)
}

func (st SQLiteTime) Value() (driver.Value, error) {
	if st.Time.IsZero() {
		return nil, nil
	}
	return st.Time.Format("2006-01-02 15:04:05.999999"), nil
}

type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	return json.Marshal(a)
}

func (a *StringArray) Scan(value interface{}) error {
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, &a)
}

type GenderArray []Gender

func (a GenderArray) Value() (driver.Value, error) {
	return json.Marshal(a)
}

func (a *GenderArray) Scan(value interface{}) error {
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, &a)
}

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
	MinAge               *int        `json:"min_age,omitempty"`
	MaxAge               *int        `json:"max_age,omitempty"`
	GenderPreference     GenderArray `json:"gender_preference,omitempty"`
	RelationshipType     []string    `json:"relationship_type,omitempty"`
	MaxDistance          *int        `json:"max_distance,omitempty"`
	NotificationsEnabled bool        `json:"notifications_enabled"`
	PreferredLanguage    string      `json:"preferred_language,omitempty"`
	PreferredCountry     string      `json:"preferred_country,omitempty"`
	PremiumTier          string      `json:"premium_tier,omitempty"`
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
	Interests         StringArray `json:"interests" db:"interests"`
	Photos            StringArray `json:"photos" db:"photos"`
	Location          *Location   `json:"location,omitempty" db:"location"`
	Preferences       Preferences `json:"preferences" db:"preferences"`
	IsActive          bool        `json:"is_active" db:"is_active"`
	IsSleeping        bool        `json:"is_sleeping" db:"is_sleeping"`
	IsProfileComplete bool        `json:"is_profile_complete" db:"is_profile_complete"`
	CreatedAt         SQLiteTime  `json:"created_at" db:"created_at"`
	UpdatedAt         SQLiteTime  `json:"updated_at" db:"updated_at"`
	LastActive        SQLiteTime  `json:"last_active" db:"last_active"`
	LastRemindedAt    *SQLiteTime `json:"last_reminded_at,omitempty" db:"last_reminded_at"`
}
