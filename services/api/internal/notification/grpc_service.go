package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
)

// GRPCService implements the NotificationService gRPC interface.
type GRPCService struct {
	pb.UnimplementedNotificationServiceServer
	service *Service
	db      *sql.DB // For user queries (re-engagement candidates)
}

// NewGRPCService creates a new gRPC notification service.
func NewGRPCService(service *Service) *GRPCService {
	return &GRPCService{service: service}
}

// NewGRPCServiceWithDB creates a new gRPC notification service with database access.
func NewGRPCServiceWithDB(service *Service, db *sql.DB) *GRPCService {
	return &GRPCService{service: service, db: db}
}

// EnqueueNotification enqueues a new notification for delivery.
func (s *GRPCService) EnqueueNotification(ctx context.Context, req *pb.EnqueueNotificationRequest) (*pb.EnqueueNotificationResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// Convert proto to domain types
	createReq := CreateRequest{
		UserID:   req.UserId,
		Type:     protoTypeToType(req.Type),
		Channel:  protoChannelToChannel(req.Channel),
		Priority: int(req.Priority),
	}

	// Set optional fields
	if req.IdempotencyKey != "" {
		createReq.IdempotencyKey = &req.IdempotencyKey
	}
	if req.RelatedMatchId != "" {
		createReq.RelatedMatchID = &req.RelatedMatchId
	}
	if req.RelatedUserId != "" {
		createReq.RelatedUserID = &req.RelatedUserId
	}

	// Convert payload
	if req.Payload != nil {
		switch p := req.Payload.Payload.(type) {
		case *pb.NotificationPayload_Telegram:
			var replyMarkup json.RawMessage
			if p.Telegram.ReplyMarkup != "" {
				replyMarkup = json.RawMessage(p.Telegram.ReplyMarkup)
			}
			createReq.Payload = Payload{
				Telegram: &TelegramPayload{
					ChatID:      p.Telegram.ChatId,
					Text:        p.Telegram.Text,
					ParseMode:   p.Telegram.ParseMode,
					ReplyMarkup: replyMarkup,
				},
			}
		case *pb.NotificationPayload_Email:
			createReq.Payload = Payload{
				Email: &EmailPayload{
					To:         p.Email.To,
					Subject:    p.Email.Subject,
					Body:       p.Email.Body,
					TemplateID: p.Email.TemplateId,
				},
			}
		}
	}

	// Enqueue
	notification, err := s.service.Enqueue(ctx, createReq)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to enqueue notification: %v", err)
	}

	return &pb.EnqueueNotificationResponse{
		NotificationId: notification.ID.String(),
		Status:         statusToProtoStatus(notification.Status),
	}, nil
}

// GetNotification retrieves a notification by ID.
func (s *GRPCService) GetNotification(ctx context.Context, req *pb.GetNotificationRequest) (*pb.GetNotificationResponse, error) {
	if req.NotificationId == "" {
		return nil, status.Error(codes.InvalidArgument, "notification_id is required")
	}

	id, err := uuid.Parse(req.NotificationId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid notification_id format")
	}

	notification, err := s.service.GetNotification(ctx, id)
	if err != nil {
		if err == ErrNotFound {
			return nil, status.Error(codes.NotFound, "notification not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to get notification: %v", err)
	}

	resp := &pb.GetNotificationResponse{
		Id:           notification.ID.String(),
		UserId:       notification.UserID,
		Type:         typeToProtoType(notification.Type),
		Channel:      channelToProtoChannel(notification.Channel),
		Status:       statusToProtoStatus(notification.Status),
		AttemptCount: int32(notification.AttemptCount),
		MaxAttempts:  int32(notification.MaxAttempts),
		CreatedAt:    timestamppb.New(notification.CreatedAt),
	}

	if notification.LastError != nil {
		resp.LastError = *notification.LastError
	}
	if notification.NextRetryAt != nil {
		resp.NextRetryAt = timestamppb.New(*notification.NextRetryAt)
	}
	if notification.DeliveredAt != nil {
		resp.DeliveredAt = timestamppb.New(*notification.DeliveredAt)
	}

	return resp, nil
}

// GetDLQStats returns statistics about the dead letter queue.
func (s *GRPCService) GetDLQStats(ctx context.Context, _ *pb.GetDLQStatsRequest) (*pb.GetDLQStatsResponse, error) {
	stats, err := s.service.GetDLQStats(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get DLQ stats: %v", err)
	}

	resp := &pb.GetDLQStatsResponse{
		TotalCount:   stats.TotalCount,
		CountByType:  stats.CountByType,
		CountByError: stats.CountByError,
	}

	if stats.OldestItem != nil {
		resp.OldestItem = timestamppb.New(*stats.OldestItem)
	}

	return resp, nil
}

// ReplayDLQ replays notifications from the dead letter queue.
func (s *GRPCService) ReplayDLQ(ctx context.Context, req *pb.ReplayDLQRequest) (*pb.ReplayDLQResponse, error) {
	filter := DLQFilter{
		Limit: int(req.Limit),
	}

	if req.Type != pb.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED {
		t := protoTypeToType(req.Type)
		filter.Type = &t
	}
	if req.ErrorCode != "" {
		ec := ErrorCode(req.ErrorCode)
		filter.ErrorCode = &ec
	}
	if req.Since != nil {
		t := req.Since.AsTime()
		filter.Since = &t
	}

	replayed, err := s.service.ReplayDLQ(ctx, filter)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to replay DLQ: %v", err)
	}

	return &pb.ReplayDLQResponse{
		ReplayedCount: int32(replayed),
		FailedCount:   0, // We don't track individual failures yet
	}, nil
}

// GetQueueStats returns Redis queue statistics.
func (s *GRPCService) GetQueueStats(ctx context.Context, _ *pb.GetQueueStatsRequest) (*pb.GetQueueStatsResponse, error) {
	stats, err := s.service.GetQueueStats(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get queue stats: %v", err)
	}

	return &pb.GetQueueStatsResponse{
		PendingCount: stats.PendingCount,
		DelayedCount: stats.DelayedCount,
		DlqCount:     stats.DLQCount,
	}, nil
}

// Type conversion helpers

func protoTypeToType(t pb.NotificationType) Type {
	switch t {
	case pb.NotificationType_NOTIFICATION_TYPE_MUTUAL_MATCH:
		return TypeMutualMatch
	case pb.NotificationType_NOTIFICATION_TYPE_NEW_LIKE:
		return TypeNewLike
	case pb.NotificationType_NOTIFICATION_TYPE_MATCH_REMINDER:
		return TypeMatchReminder
	case pb.NotificationType_NOTIFICATION_TYPE_PROFILE_INCOMPLETE:
		return TypeProfileIncomplete
	case pb.NotificationType_NOTIFICATION_TYPE_WELCOME:
		return TypeWelcome
	case pb.NotificationType_NOTIFICATION_TYPE_SYSTEM:
		return TypeSystem
	case pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_GENTLE:
		return TypeReengagementGentle
	case pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_URGENT:
		return TypeReengagementUrgent
	case pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_LAST_CHANCE:
		return TypeReengagementLastChance
	default:
		return TypeSystem
	}
}

func typeToProtoType(t Type) pb.NotificationType {
	switch t {
	case TypeMutualMatch:
		return pb.NotificationType_NOTIFICATION_TYPE_MUTUAL_MATCH
	case TypeNewLike:
		return pb.NotificationType_NOTIFICATION_TYPE_NEW_LIKE
	case TypeMatchReminder:
		return pb.NotificationType_NOTIFICATION_TYPE_MATCH_REMINDER
	case TypeProfileIncomplete:
		return pb.NotificationType_NOTIFICATION_TYPE_PROFILE_INCOMPLETE
	case TypeWelcome:
		return pb.NotificationType_NOTIFICATION_TYPE_WELCOME
	case TypeSystem:
		return pb.NotificationType_NOTIFICATION_TYPE_SYSTEM
	case TypeReengagementGentle:
		return pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_GENTLE
	case TypeReengagementUrgent:
		return pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_URGENT
	case TypeReengagementLastChance:
		return pb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_LAST_CHANCE
	default:
		return pb.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED
	}
}

func protoChannelToChannel(c pb.NotificationChannel) Channel {
	switch c {
	case pb.NotificationChannel_NOTIFICATION_CHANNEL_TELEGRAM:
		return ChannelTelegram
	case pb.NotificationChannel_NOTIFICATION_CHANNEL_EMAIL:
		return ChannelEmail
	case pb.NotificationChannel_NOTIFICATION_CHANNEL_PUSH:
		return ChannelPush
	case pb.NotificationChannel_NOTIFICATION_CHANNEL_SMS:
		return ChannelSMS
	default:
		return ChannelTelegram
	}
}

func channelToProtoChannel(c Channel) pb.NotificationChannel {
	switch c {
	case ChannelTelegram:
		return pb.NotificationChannel_NOTIFICATION_CHANNEL_TELEGRAM
	case ChannelEmail:
		return pb.NotificationChannel_NOTIFICATION_CHANNEL_EMAIL
	case ChannelPush:
		return pb.NotificationChannel_NOTIFICATION_CHANNEL_PUSH
	case ChannelSMS:
		return pb.NotificationChannel_NOTIFICATION_CHANNEL_SMS
	default:
		return pb.NotificationChannel_NOTIFICATION_CHANNEL_UNSPECIFIED
	}
}

func statusToProtoStatus(s Status) pb.NotificationStatus {
	switch s {
	case StatusPending:
		return pb.NotificationStatus_NOTIFICATION_STATUS_PENDING
	case StatusProcessing:
		return pb.NotificationStatus_NOTIFICATION_STATUS_PROCESSING
	case StatusDelivered:
		return pb.NotificationStatus_NOTIFICATION_STATUS_DELIVERED
	case StatusFailed:
		return pb.NotificationStatus_NOTIFICATION_STATUS_FAILED
	case StatusDLQ:
		return pb.NotificationStatus_NOTIFICATION_STATUS_DLQ
	case StatusCancelled:
		return pb.NotificationStatus_NOTIFICATION_STATUS_CANCELLED
	default:
		return pb.NotificationStatus_NOTIFICATION_STATUS_UNSPECIFIED
	}
}

// SendNotification is implemented by the Bot service, not the API.
// This stub returns unimplemented error.
func (s *GRPCService) SendNotification(_ context.Context, _ *pb.SendNotificationRequest) (*pb.SendNotificationResponse, error) {
	return nil, status.Error(codes.Unimplemented, "SendNotification is implemented by the Bot service")
}

// GetReengagementCandidates retrieves users eligible for re-engagement notifications.
// Queries users who are inactive, have notifications enabled, and haven't been reminded recently.
func (s *GRPCService) GetReengagementCandidates(ctx context.Context, req *pb.GetReengagementCandidatesRequest) (*pb.GetReengagementCandidatesResponse, error) {
	if s.db == nil {
		return nil, status.Error(codes.Unavailable, "database not configured for re-engagement queries")
	}

	// Set defaults
	minDays := int(req.MinInactiveDays)
	if minDays <= 0 {
		minDays = 3
	}
	maxDays := int(req.MaxInactiveDays)
	if maxDays <= 0 {
		maxDays = 21
	}
	cooldownDays := int(req.ReminderCooldownDays)
	if cooldownDays <= 0 {
		cooldownDays = 3
	}
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 100
	}
	offset := int(req.Offset)

	// Query for inactive users who:
	// - Are active (not deleted)
	// - Are not sleeping (not paused)
	// - Have notifications enabled
	// - Haven't been reminded recently (cooldown)
	// - Have been inactive for min-max days
	query := `
		SELECT
			u.id,
			u.first_name,
			EXTRACT(DAY FROM NOW() - u.last_active)::int as days_inactive,
			COALESCE(
				(SELECT COUNT(*) FROM matches m
				 WHERE m.user2_id = u.id
				 AND m.user1_action = 'like'
				 AND m.user2_action = 'none'),
				0
			)::int as pending_likes_count,
			COALESCE((u.preferences->>'notifications_enabled')::boolean, true) as notifications_enabled,
			u.last_active,
			u.last_reminded_at
		FROM users u
		WHERE u.is_active = true
		  AND u.is_sleeping = false
		  AND COALESCE((u.preferences->>'notifications_enabled')::boolean, true) = true
		  AND u.last_active < NOW() - INTERVAL '1 day' * $1
		  AND u.last_active > NOW() - INTERVAL '1 day' * $2
		  AND (
			u.last_reminded_at IS NULL
			OR u.last_reminded_at < NOW() - INTERVAL '1 day' * $3
		  )
		ORDER BY u.last_active ASC
		LIMIT $4 OFFSET $5
	`

	rows, err := s.db.QueryContext(ctx, query, minDays, maxDays, cooldownDays, limit, offset)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query candidates: %v", err)
	}
	defer rows.Close()

	candidates := make([]*pb.ReengagementCandidate, 0)
	for rows.Next() {
		var c pb.ReengagementCandidate
		var lastActive time.Time
		var lastRemindedAt sql.NullTime

		err := rows.Scan(
			&c.UserId,
			&c.FirstName,
			&c.DaysInactive,
			&c.PendingLikesCount,
			&c.NotificationsEnabled,
			&lastActive,
			&lastRemindedAt,
		)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to scan candidate: %v", err)
		}

		c.LastActive = timestamppb.New(lastActive)
		if lastRemindedAt.Valid {
			c.LastRemindedAt = timestamppb.New(lastRemindedAt.Time)
		}

		candidates = append(candidates, &c)
	}

	if err = rows.Err(); err != nil {
		return nil, status.Errorf(codes.Internal, "error iterating candidates: %v", err)
	}

	// Get total count for pagination
	countQuery := `
		SELECT COUNT(*)
		FROM users u
		WHERE u.is_active = true
		  AND u.is_sleeping = false
		  AND COALESCE((u.preferences->>'notifications_enabled')::boolean, true) = true
		  AND u.last_active < NOW() - INTERVAL '1 day' * $1
		  AND u.last_active > NOW() - INTERVAL '1 day' * $2
		  AND (
			u.last_reminded_at IS NULL
			OR u.last_reminded_at < NOW() - INTERVAL '1 day' * $3
		  )
	`
	var total int32
	if err := s.db.QueryRowContext(ctx, countQuery, minDays, maxDays, cooldownDays).Scan(&total); err != nil {
		// Non-fatal, just use count from results
		total = int32(len(candidates))
	}

	return &pb.GetReengagementCandidatesResponse{
		Candidates: candidates,
		Total:      total,
	}, nil
}

// LogNotificationResult logs a notification delivery result for audit.
func (s *GRPCService) LogNotificationResult(ctx context.Context, req *pb.LogNotificationResultRequest) (*pb.LogNotificationResultResponse, error) {
	// Create a notification record for audit purposes
	createReq := CreateRequest{
		UserID:   req.UserId,
		Type:     protoTypeToType(req.Type),
		Channel:  ChannelTelegram,
		Priority: 0,
	}

	n, err := s.service.Enqueue(ctx, createReq)
	if err != nil {
		return &pb.LogNotificationResultResponse{
			Success: false,
		}, nil
	}

	// If the notification was already delivered (from Bot), mark it as delivered
	if req.Status == pb.NotificationStatus_NOTIFICATION_STATUS_DELIVERED {
		_ = s.service.repo.MarkDelivered(ctx, n.ID, n.CreatedAt)
	}

	return &pb.LogNotificationResultResponse{
		NotificationId: n.ID.String(),
		Success:        true,
	}, nil
}
