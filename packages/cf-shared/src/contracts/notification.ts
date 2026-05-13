import { Array, Boolean, Literal, Number, String, Struct, optional } from "effect/Schema";

// --- Enums ---

export const NotificationType = Literal(
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

export const NotificationChannel = Literal(
  "UNSPECIFIED",
  "TELEGRAM",
  "EMAIL",
  "PUSH",
  "SMS"
);
export type NotificationChannel = typeof NotificationChannel.Type;

export const NotificationStatus = Literal(
  "UNSPECIFIED",
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "FAILED",
  "DLQ"
);
export type NotificationStatus = typeof NotificationStatus.Type;

// --- Main Notification Type ---

export const Notification = Struct({
  id: String,
  userId: String,
  type: NotificationType,
  channel: optional(NotificationChannel),
  status: optional(NotificationStatus),
  title: optional(String),
  body: optional(String),
  payload: optional(String), // JSON string
  retryCount: optional(Number),
  maxRetries: optional(Number),
  createdAt: optional(String),
  scheduledAt: optional(String),
  deliveredAt: optional(String),
  failedAt: optional(String),
  errorMessage: optional(String),
});
export type Notification = typeof Notification.Type;

// --- Request/Response Types ---

export const EnqueueNotificationRequest = Struct({
  userId: String,
  type: NotificationType,
  channel: optional(NotificationChannel),
  title: optional(String),
  body: optional(String),
  payload: optional(String),
  scheduledAt: optional(String),
});
export type EnqueueNotificationRequest = typeof EnqueueNotificationRequest.Type;

export const EnqueueNotificationResponse = Struct({
  notificationId: String,
  status: NotificationStatus,
});
export type EnqueueNotificationResponse = typeof EnqueueNotificationResponse.Type;

export const GetNotificationRequest = Struct({
  notificationId: String,
});
export type GetNotificationRequest = typeof GetNotificationRequest.Type;

export const GetNotificationResponse = Struct({
  notification: optional(Notification),
});
export type GetNotificationResponse = typeof GetNotificationResponse.Type;

export const GetDLQStatsRequest = Struct({});
export type GetDLQStatsRequest = typeof GetDLQStatsRequest.Type;

export const GetDLQStatsResponse = Struct({
  totalMessages: Number,
  oldestMessageAge: optional(String),
});
export type GetDLQStatsResponse = typeof GetDLQStatsResponse.Type;

export const ReplayDLQRequest = Struct({
  limit: optional(Number),
});
export type ReplayDLQRequest = typeof ReplayDLQRequest.Type;

export const ReplayDLQResponse = Struct({
  replayedCount: Number,
});
export type ReplayDLQResponse = typeof ReplayDLQResponse.Type;

export const GetQueueStatsRequest = Struct({});
export type GetQueueStatsRequest = typeof GetQueueStatsRequest.Type;

export const GetQueueStatsResponse = Struct({
  pendingCount: Number,
  processingCount: Number,
  deliveredCount: Number,
  failedCount: Number,
  dlqCount: Number,
});
export type GetQueueStatsResponse = typeof GetQueueStatsResponse.Type;

export const SendNotificationRequest = Struct({
  userId: String,
  type: NotificationType,
  title: optional(String),
  body: optional(String),
  payload: optional(String),
});
export type SendNotificationRequest = typeof SendNotificationRequest.Type;

export const SendNotificationResponse = Struct({
  success: Boolean,
});
export type SendNotificationResponse = typeof SendNotificationResponse.Type;

export const GetReengagementCandidatesRequest = Struct({
  minInactiveDays: optional(Number),
  maxInactiveDays: optional(Number),
  limit: optional(Number),
});
export type GetReengagementCandidatesRequest = typeof GetReengagementCandidatesRequest.Type;

export const GetReengagementCandidatesResponse = Struct({
  userIds: Array(String),
});
export type GetReengagementCandidatesResponse = typeof GetReengagementCandidatesResponse.Type;

export const LogNotificationResultRequest = Struct({
  notificationId: String,
  status: NotificationStatus,
  errorMessage: optional(String),
});
export type LogNotificationResultRequest = typeof LogNotificationResultRequest.Type;

export const LogNotificationResultResponse = Struct({
  success: Boolean,
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


