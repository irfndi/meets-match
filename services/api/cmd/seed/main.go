package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/lib/pq"
)

type Location struct {
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	City        string    `json:"city,omitempty"`
	Country     string    `json:"country,omitempty"`
	LastUpdated time.Time `json:"last_updated"`
}

type Preferences struct {
	MinAge               *int     `json:"min_age,omitempty"`
	MaxAge               *int     `json:"max_age,omitempty"`
	GenderPreference     []string `json:"gender_preference,omitempty"`
	RelationshipType     []string `json:"relationship_type,omitempty"`
	MaxDistance          *int     `json:"max_distance,omitempty"`
	NotificationsEnabled bool     `json:"notifications_enabled"`
	PreferredLanguage    string   `json:"preferred_language,omitempty"`
	PreferredCountry     string   `json:"preferred_country,omitempty"`
	PremiumTier          string   `json:"premium_tier,omitempty"`
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("Error closing db: %v", err)
		}
	}()

	// Wait for DB with retry
	maxRetries := 30
	for i := 0; i < maxRetries; i++ {
		if err := db.Ping(); err == nil {
			log.Println("Database connection established")
			break
		}
		if i == maxRetries-1 {
			log.Fatalf("failed to connect to database after %d retries", maxRetries)
		}
		log.Printf("Waiting for database... (%d/%d)", i+1, maxRetries)
		time.Sleep(1 * time.Second)
	}

	log.Println("Seeding database...")

	// Create a test user
	loc := Location{
		Latitude:    37.5665,
		Longitude:   126.9780,
		City:        "Seoul",
		Country:     "South Korea",
		LastUpdated: time.Now(),
	}
	locJSON, _ := json.Marshal(loc)

	pref := Preferences{
		NotificationsEnabled: true,
		PreferredLanguage:    "en",
	}
	prefJSON, _ := json.Marshal(pref)

	query := `
		INSERT INTO users (id, first_name, username, age, gender, interests, photos, location, preferences, is_profile_complete)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET
			first_name = EXCLUDED.first_name,
			username = EXCLUDED.username,
			updated_at = NOW();
	`

	_, err = db.Exec(query,
		"123456789",
		"Test User",
		"testuser",
		25,
		"male",
		pq.Array([]string{"coding", "coffee"}),
		pq.Array([]string{"photo1.jpg"}),
		locJSON,
		prefJSON,
		true,
	)

	if err != nil {
		log.Fatalf("Failed to seed user: %v", err)
	}

	log.Println("Seeding completed successfully.")
}
