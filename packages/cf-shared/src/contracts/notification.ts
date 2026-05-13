import { Schema } from "@effect/schema";

// --- Enums ---

export const NotificationType = Schema.Literal(
  "UNSPECIFIED",
  "MUTUAL_MATCH",
  "NEW_LIKE",
  "MATCH_REMINDER",
  "PROFILE_INCOMPLETE",
  "WELCOME",
  "SYSTEM",
  "REENGAGEMENT_GENTLE",
  "REENGAGEMENT_URGENT",
  "REENGAGEMENT_LAST_CHANCE"
);
export type NotificationType = typeof NotificationType.Type;

export const NotificationChannel = Schema.Literal(
  "UNSPECIFIED",
  "TELEGRAM",
  "EMAIL",
  "PUSH",
  "SMS"
);
export type NotificationChannel = typeof NotificationChannel.Type;

export const NotificationStatus = Schema.Literal(
  "UNSPECIFIED",
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "FAILED",
  "DLQ"
);
export type NotificationStatus = typeof NotificationStatus.Type;

// --- Main Notification Type ---

export const Notification = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  type: NotificationType,
  channel: Schema.optional(NotificationChannel),
  status: Schema.optional(NotificationStatus),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.String), // JSON string
  retryCount: Schema.optional(Schema.Number),
  maxRetries: Schema.optional(Schema.Number),
  createdAt: Schema.optional(Schema.String),
  scheduledAt: Schema.optional(Schema.String),
  deliveredAt: Schema.optional(Schema.String),
  failedAt: Schema.optional(Schema.String),
  errorMessage: Schema.optional(Schema.String),
});
export type Notification = typeof Notification.Type;

// --- Request/Response Types ---

export const EnqueueNotificationRequest = Schema.Struct({
  userId: Schema.String,
  type: NotificationType,
  channel: Schema.optional(NotificationChannel),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.String),
  scheduledAt: Schema.optional(Schema.String),
});
export type EnqueueNotificationRequest = typeof EnqueueNotificationRequest.Type;

export const EnqueueNotificationResponse = Schema.Struct({
  notificationId: Schema.String,
  status: NotificationStatus,
});
export type EnqueueNotificationResponse = typeof EnqueueNotificationResponse.Type;

export const GetNotificationRequest = Schema.Struct({
  notificationId: Schema.String,
});
export type GetNotificationRequest = typeof GetNotificationRequest.Type;

export const GetNotificationResponse = Schema.Struct({
  notification: Schema.optional(Notification),
});
export type GetNotificationResponse = typeof GetNotificationResponse.Type;

export const GetDLQStatsRequest = Schema.Struct({});
export type GetDLQStatsRequest = typeof GetDLQStatsRequest.Type;

export const GetDLQStatsResponse = Schema.Struct({
  totalMessages: Schema.Number,
  oldestMessageAge: Schema.optional(Schema.String),
});
export type GetDLQStatsResponse = typeof GetDLQStatsResponse.Type;

export const ReplayDLQRequest = Schema.Struct({
  limit: Schema.optional(Schema.Number),
});
export type ReplayDLQRequest = typeof ReplayDLQRequest.Type;

export const ReplayDLQResponse = Schema.Struct({
  replayedCount: Schema.Number,
});
export type ReplayDLQResponse = typeof ReplayDLQResponse.Type;

export const GetQueueStatsRequest = Schema.Struct({});
export type GetQueueStatsRequest = typeof GetQueueStatsRequest.Type;

export const GetQueueStatsResponse = Schema.Struct({
  pendingCount: Schema.Number,
  processingCount: Schema.Number,
  deliveredCount: Schema.Number,
  failedCount: Schema.Number,
  dlqCount: Schema.Number,
});
export type GetQueueStatsResponse = typeof GetQueueStatsResponse.Type;

export const SendNotificationRequest = Schema.Struct({
  userId: Schema.String,
  type: NotificationType,
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.String),
});
export type SendNotificationRequest = typeof SendNotificationRequest.Type;

export const SendNotificationResponse = Schema.Struct({
  success: Schema.Boolean,
});
export type SendNotificationResponse = typeof SendNotificationResponse.Type;

export const GetReengagementCandidatesRequest = Schema.Struct({
  minInactiveDays: Schema.optional(Schema.Number),
  maxInactiveDays: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
});
export type GetReengagementCandidatesRequest = typeof GetReengagementCandidatesRequest.Type;

export const GetReengagementCandidatesResponse = Schema.Struct({
  userIds: Schema.Array(Schema.String),
});
export type GetReengagementCandidatesResponse = typeof GetReengagementCandidatesResponse.Type;

export const LogNotificationResultRequest = Schema.Struct({
  notificationId: Schema.String,
  status: NotificationStatus,
  errorMessage: Schema.optional(Schema.String),
});
export type LogNotificationResultRequest = typeof LogNotificationResultRequest.Type;

export const LogNotificationResultResponse = Schema.Struct({
  success: Schema.Boolean,
});
export type LogNotificationResultResponse = typeof LogNotificationResultResponse.Type;

// --- Service Interface ---

export interface NotificationService {
  readonly enqueueNotification: (req: EnqueueNotificationRequest) => Promise<EnqueueNotificationResponse>;
  readonly getNotification: (req: GetNotificationRequest) => Promise<GetNotificationResponse>;
  readonly getDLQStats: (req: GetDLQStatsRequest) => Promise<GetDLQStatsResponse>;
  readonly replayDLQ: (req: ReplayDLQRequest) => Promise<ReplayDLQResponse>;
  readonly getQueueStats: (req: GetQueueStatsRequest) => Promise<GetQueueStatsResponse>;
  readonly sendNotification: (req: SendNotificationRequest) => Promise<SendNotificationResponse>;
  readonly getReengagementCandidates: (req: GetReengagementCandidatesRequest) => Promise<GetReengagementCandidatesResponse>;
  readonly logNotificationResult: (req: LogNotificationResultRequest) => Promise<LogNotificationResultResponse>;
}

export const NotificationService = Schema.Tag<NotificationService>("NotificationService");
