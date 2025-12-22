package services

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	_ "github.com/lib/pq"
)

func setupTestDB(t *testing.T) *sql.DB {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}

	if err := db.Ping(); err != nil {
		t.Fatalf("failed to ping db: %v", err)
	}

	return db
}

func TestUserService_CreateAndGetUser(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	svc := NewUserService(db)
	ctx := context.Background()

	userID := "test-user-" + time.Now().Format("20060102150405")

	// Create
	req := &pb.CreateUserRequest{
		User: &pb.User{
			Id:        userID,
			Username:  "testuser",
			FirstName: "Test",
			LastName:  "User",
		},
	}

	createResp, err := svc.CreateUser(ctx, req)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}

	if createResp.User.Id != userID {
		t.Errorf("Expected ID %s, got %s", userID, createResp.User.Id)
	}

	// Get
	getResp, err := svc.GetUser(ctx, &pb.GetUserRequest{UserId: userID})
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}

	if getResp.User.FirstName != "Test" {
		t.Errorf("Expected FirstName Test, got %s", getResp.User.FirstName)
	}

	// Update
	updateReq := &pb.UpdateUserRequest{
		UserId: userID,
		User: &pb.User{
			FirstName: "UpdatedTest",
			Bio:       "Updated Bio",
		},
	}
	updateResp, err := svc.UpdateUser(ctx, updateReq)
	if err != nil {
		t.Fatalf("UpdateUser failed: %v", err)
	}
	if updateResp.User.FirstName != "UpdatedTest" {
		t.Errorf("Expected FirstName UpdatedTest, got %s", updateResp.User.FirstName)
	}

	// Verify Update
	getResp2, _ := svc.GetUser(ctx, &pb.GetUserRequest{UserId: userID})
	if getResp2.User.Bio != "Updated Bio" {
		t.Errorf("Expected Bio 'Updated Bio', got %s", getResp2.User.Bio)
	}

	// Error Cases
	// Get Non-Existent
	_, err = svc.GetUser(ctx, &pb.GetUserRequest{UserId: "non-existent"})
	if err == nil {
		t.Error("Expected error for non-existent user, got nil")
	}

	// Create Duplicate
	_, err = svc.CreateUser(ctx, req)
	if err == nil {
		t.Error("Expected error for duplicate user creation, got nil")
	}
}
