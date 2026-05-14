import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  Notification,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  EnqueueNotificationRequest,
  EnqueueNotificationResponse,
  GetNotificationRequest,
  GetNotificationResponse,
  GetDLQStatsRequest,
  GetDLQStatsResponse,
  ReplayDLQRequest,
  ReplayDLQResponse,
  GetQueueStatsRequest,
  GetQueueStatsResponse,
} from "../../contracts/notification.js";

const validNotification = {
  id: "notif-1",
  userId: "user-1",
  type: "MUTUAL_MATCH" as const,
  channel: "TELEGRAM" as const,
  status: "PENDING" as const,
  title: "You have a match!",
  body: "Someone liked you back",
  payload: '{"matchId":"match-1"}',
  retryCount: 0,
  maxRetries: 3,
  createdAt: "2025-01-01T00:00:00Z",
  scheduledAt: "2025-01-01T00:00:00Z",
};

describe("Notification Contracts", () => {
  describe("Notification schema", () => {
    it("should encode and decode a valid notification", () => {
      const result = Schema.decodeUnknownSync(Notification)(validNotification);
      expect(result.id).toBe("notif-1");
      expect(result.type).toBe("MUTUAL_MATCH");
      expect(result.channel).toBe("TELEGRAM");
      expect(result.status).toBe("PENDING");
      expect(result.retryCount).toBe(0);
      expect(result.maxRetries).toBe(3);
    });

    it("should accept minimal notification (required fields only)", () => {
      const minimal = { id: "n1", userId: "u1", type: "WELCOME" as const };
      const result = Schema.decodeUnknownSync(Notification)(minimal);
      expect(result.id).toBe("n1");
      expect(result.channel).toBeUndefined();
      expect(result.status).toBeUndefined();
    });

    it("should reject notification with missing type", () => {
      const invalid = { id: "n1", userId: "u1" };
      expect(() => Schema.decodeUnknownSync(Notification)(invalid)).toThrow();
    });

    it("should reject notification with invalid type", () => {
      const invalid = { id: "n1", userId: "u1", type: "SPAM" };
      expect(() =>
        Schema.decodeUnknownSync(Notification)(invalid),
      ).toThrow();
    });

    it("should produce round-trip equivalent output", () => {
      const encoded = Schema.encodeSync(Notification)(validNotification);
      const decoded = Schema.decodeUnknownSync(Notification)(encoded);
      expect(decoded).toEqual(validNotification);
    });
  });

  describe("NotificationType enum", () => {
    it.each([
      "UNSPECIFIED",
      "MUTUAL_MATCH",
      "NEW_LIKE",
      "MATCH_REMINDER",
      "PROFILE_INCOMPLETE",
      "WELCOME",
      "SYSTEM",
      "REENGAGEMENT_GENTLE",
      "REENGAGEMENT_URGENT",
      "REENGAGEMENT_LAST_CHANCE",
    ] as const)("should accept %s", (type) => {
      expect(() =>
        Schema.decodeUnknownSync(NotificationType)(type),
      ).not.toThrow();
    });

    it("should reject unknown notification type", () => {
      expect(() =>
        Schema.decodeUnknownSync(NotificationType)("FAKE"),
      ).toThrow();
    });
  });

  describe("NotificationChannel enum", () => {
    it.each(["UNSPECIFIED", "TELEGRAM", "EMAIL", "PUSH", "SMS"] as const)(
      "should accept %s",
      (channel) => {
        expect(() =>
          Schema.decodeUnknownSync(NotificationChannel)(channel),
        ).not.toThrow();
      },
    );
  });

  describe("NotificationStatus enum", () => {
    it.each([
      "UNSPECIFIED",
      "PENDING",
      "PROCESSING",
      "DELIVERED",
      "FAILED",
      "DLQ",
    ] as const)("should accept %s", (status) => {
      expect(() =>
        Schema.decodeUnknownSync(NotificationStatus)(status),
      ).not.toThrow();
    });

    it("should reject unknown status", () => {
      expect(() =>
        Schema.decodeUnknownSync(NotificationStatus)("DONE"),
      ).toThrow();
    });
  });

  describe("EnqueueNotificationRequest / EnqueueNotificationResponse", () => {
    it("should decode valid enqueue request with all fields", () => {
      const result = Schema.decodeUnknownSync(EnqueueNotificationRequest)({
        userId: "u1",
        type: "MUTUAL_MATCH",
        channel: "TELEGRAM",
        title: "Match!",
        body: "You matched",
        payload: "{}",
        scheduledAt: "2025-01-01T00:00:00Z",
      });
      expect(result.userId).toBe("u1");
      expect(result.type).toBe("MUTUAL_MATCH");
    });

    it("should decode minimal enqueue request", () => {
      const result = Schema.decodeUnknownSync(EnqueueNotificationRequest)({
        userId: "u1",
        type: "WELCOME",
      });
      expect(result.channel).toBeUndefined();
      expect(result.title).toBeUndefined();
    });

    it("should decode enqueue response", () => {
      const result = Schema.decodeUnknownSync(EnqueueNotificationResponse)({
        notificationId: "notif-1",
        status: "PENDING",
      });
      expect(result.notificationId).toBe("notif-1");
      expect(result.status).toBe("PENDING");
    });
  });

  describe("GetNotificationRequest / GetNotificationResponse", () => {
    it("should decode request", () => {
      const result = Schema.decodeUnknownSync(GetNotificationRequest)({
        notificationId: "notif-1",
      });
      expect(result.notificationId).toBe("notif-1");
    });

    it("should decode response with notification present", () => {
      const result = Schema.decodeUnknownSync(GetNotificationResponse)({
        notification: validNotification,
      });
      expect(result.notification?.id).toBe("notif-1");
    });

    it("should decode response with notification absent (not found)", () => {
      const result = Schema.decodeUnknownSync(GetNotificationResponse)({});
      expect(result.notification).toBeUndefined();
    });
  });

  describe("DLQ Request/Response types", () => {
    it("should decode GetDLQStatsRequest (empty struct)", () => {
      const result = Schema.decodeUnknownSync(GetDLQStatsRequest)({});
      expect(result).toEqual({});
    });

    it("should decode GetDLQStatsResponse", () => {
      const result = Schema.decodeUnknownSync(GetDLQStatsResponse)({
        totalMessages: 42,
        oldestMessageAge: "7d",
      });
      expect(result.totalMessages).toBe(42);
    });

    it("should decode ReplayDLQRequest with limit", () => {
      const result = Schema.decodeUnknownSync(ReplayDLQRequest)({ limit: 10 });
      expect(result.limit).toBe(10);
    });

    it("should decode ReplayDLQResponse", () => {
      const result = Schema.decodeUnknownSync(ReplayDLQResponse)({
        replayedCount: 5,
      });
      expect(result.replayedCount).toBe(5);
    });
  });

  describe("QueueStats Request/Response", () => {
    it("should decode GetQueueStatsRequest (empty struct)", () => {
      const result = Schema.decodeUnknownSync(GetQueueStatsRequest)({});
      expect(result).toEqual({});
    });

    it("should decode GetQueueStatsResponse", () => {
      const result = Schema.decodeUnknownSync(GetQueueStatsResponse)({
        pendingCount: 10,
        processingCount: 2,
        deliveredCount: 100,
        failedCount: 3,
        dlqCount: 0,
      });
      expect(result.pendingCount).toBe(10);
      expect(result.failedCount).toBe(3);
    });
  });
});
