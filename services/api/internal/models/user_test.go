package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestLocation_Value_Scan(t *testing.T) {
	loc := Location{
		Latitude:    37.5665,
		Longitude:   126.9780,
		City:        "Seoul",
		Country:     "KR",
		LastUpdated: time.Now(),
	}

	// Test Value()
	_, err := loc.Value()
	if err != nil {
		t.Fatalf("Failed to get Value: %v", err)
	}

	// Test Scan()
	var newLoc Location
	// Simulate DB returning []byte
	bytes, _ := json.Marshal(loc)
	err = newLoc.Scan(bytes)
	if err != nil {
		t.Fatalf("Failed to Scan: %v", err)
	}

	if newLoc.City != loc.City {
		t.Errorf("Expected city %s, got %s", loc.City, newLoc.City)
	}
}

func TestPreferences_Value_Scan(t *testing.T) {
	pref := Preferences{
		NotificationsEnabled: true,
		PreferredLanguage:    "en",
	}

	// Test Value()
	_, err := pref.Value()
	if err != nil {
		t.Fatalf("Failed to get Value: %v", err)
	}

	// Test Scan()
	var newPref Preferences
	bytes, _ := json.Marshal(pref)
	err = newPref.Scan(bytes)
	if err != nil {
		t.Fatalf("Failed to Scan: %v", err)
	}

	if newPref.PreferredLanguage != pref.PreferredLanguage {
		t.Errorf("Expected language %s, got %s", pref.PreferredLanguage, newPref.PreferredLanguage)
	}
}
