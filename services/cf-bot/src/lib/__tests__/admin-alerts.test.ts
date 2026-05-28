import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifySeverity,
  buildErrorSource,
  sendImmediateAlert,
  queueAlert,
  sendAggregatedAlerts,
} from "../admin-alerts.js";
import type { ErrorContext } from "../error-feedback.js";

function createMockApiService(responseMap: Record<string, () => Response>) {
  const sortedPatterns = Object.entries(responseMap).sort(
    (a, b) => b[0].length - a[0].length,
  );
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url = String(req.url ?? "");
      for (const [pattern, factory] of sortedPatterns) {
        if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

describe("classifySeverity", () => {
  it("returns silent for silenced sources (callback_query)", () => {
    expect(classifySeverity({ action: "callback_query" })).toBe("silent");
  });

  it("returns silent for text_message", () => {
    expect(classifySeverity({ action: "text_message" })).toBe("silent");
  });

  it("returns silent for contact_message", () => {
    expect(classifySeverity({ action: "contact_message" })).toBe("silent");
  });

  it("returns silent for location_message", () => {
    expect(classifySeverity({ action: "location_message" })).toBe("silent");
  });

  it("returns silent for photo_message", () => {
    expect(classifySeverity({ action: "photo_message" })).toBe("silent");
  });

  it("returns silent for video_message", () => {
    expect(classifySeverity({ action: "video_message" })).toBe("silent");
  });

  it("returns high for gift_payment", () => {
    expect(classifySeverity({ action: "gift_payment" })).toBe("high");
  });

  it("returns high for premium_purchase", () => {
    expect(classifySeverity({ action: "premium_purchase" })).toBe("high");
  });

  it("returns high for match_action", () => {
    expect(classifySeverity({ action: "match_action" })).toBe("high");
  });

  it("returns high for send_dm", () => {
    expect(classifySeverity({ action: "send_dm" })).toBe("high");
  });

  it("returns high for rollback", () => {
    expect(classifySeverity({ action: "rollback" })).toBe("high");
  });

  it("returns high for block", () => {
    expect(classifySeverity({ action: "block" })).toBe("high");
  });

  it("returns high for report_conversation", () => {
    expect(classifySeverity({ action: "report_conversation" })).toBe("high");
  });

  it("returns high for dm_credit_purchase", () => {
    expect(classifySeverity({ action: "dm_credit_purchase" })).toBe("high");
  });

  it("returns high for gift_premium_payment", () => {
    expect(classifySeverity({ action: "gift_premium_payment" })).toBe("high");
  });

  it("returns low for unrecognized sources", () => {
    expect(classifySeverity({ action: "random_action" })).toBe("low");
  });

  it("uses command as fallback when action is missing", () => {
    expect(classifySeverity({ command: "match" })).toBe("low");
  });

  it("returns low for undefined context", () => {
    expect(classifySeverity(undefined)).toBe("low");
  });

  it("returns low for empty context", () => {
    expect(classifySeverity({})).toBe("low");
  });

  it("uses command from context for high severity", () => {
    expect(classifySeverity({ command: "gift_payment" })).toBe("high");
  });
});

describe("buildErrorSource", () => {
  it("uses action when available", () => {
    expect(buildErrorSource({ action: "send_dm" })).toBe("send_dm");
  });

  it("falls back to command when action is missing", () => {
    expect(buildErrorSource({ command: "/start" })).toBe("/start");
  });

  it("returns 'unknown' for undefined context", () => {
    expect(buildErrorSource(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for empty context", () => {
    expect(buildErrorSource({})).toBe("unknown");
  });
});

describe("sendImmediateAlert", () => {
  beforeEach(() => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as any;
  });

  it("does nothing when ADMIN_CHAT_ID is not set", async () => {
    const env = {
      ADMIN_CHAT_ID: undefined,
      BOT_TOKEN: "test-token",
    } as any;

    await sendImmediateAlert(env, {
      traceId: "TRACE001",
      userId: "123",
      source: "match_action",
      severity: "high",
      message: "Test alert",
    });

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("sends Telegram message when ADMIN_CHAT_ID is set", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
    } as any;

    await sendImmediateAlert(env, {
      traceId: "TRACE002",
      userId: "456",
      source: "match_action",
      severity: "high",
      message: "Test alert message",
    });

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/bot"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("HIGH Severity Alert"),
      }),
    );
  });

  it("handles fetch failure gracefully", async () => {
    (globalThis as any).fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));

    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
    } as any;

    await expect(
      sendImmediateAlert(env, {
        traceId: "TRACE003",
        userId: "789",
        source: "low_source",
        severity: "low",
        message: "Test",
      }),
    ).resolves.toBeUndefined();
  });

  it("handles Telegram API error response gracefully", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 400 }),
    );

    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
    } as any;

    await expect(
      sendImmediateAlert(env, {
        traceId: "TRACE004",
        userId: "111",
        source: "source",
        severity: "high",
        message: "Test",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("queueAlert", () => {
  it("posts alert payload to error-reports API", async () => {
    const env = {
      API_SERVICE: createMockApiService({
        "/error-reports": () =>
          new Response(JSON.stringify({ id: "r1" }), { status: 201 }),
      }),
    } as any;

    await queueAlert(env, {
      traceId: "TRACE005",
      userId: "123",
      source: "test_source",
      severity: "low",
      message: "Queued alert",
      journey: "some journey data",
    });

    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("error-reports"),
      }),
    );
  });

  it("handles API failure gracefully", async () => {
    const env = {
      API_SERVICE: {
        fetch: vi.fn().mockRejectedValue(new Error("API down")),
      },
    } as any;

    await expect(
      queueAlert(env, {
        traceId: "TRACE006",
        userId: "123",
        source: "test",
        severity: "low",
        message: "Test",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("sendAggregatedAlerts", () => {
  beforeEach(() => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as any;
  });

  it("returns early when ADMIN_CHAT_ID is not set", async () => {
    const env = {
      ADMIN_CHAT_ID: undefined,
      API_SERVICE: createMockApiService({}),
    } as any;

    await sendAggregatedAlerts(env);
    expect(env.API_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it("returns early when summary count is 0", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
      API_SERVICE: createMockApiService({
        "/error-reports/summary": () =>
          new Response(
            JSON.stringify({
              severity: "low",
              count: 0,
              sources: [],
              latestAt: "2024-01-01T00:00:00Z",
            }),
            { status: 200 },
          ),
      }),
    } as any;

    await sendAggregatedAlerts(env);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("sends summary and marks alerts as sent", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
      API_SERVICE: createMockApiService({
        "/error-reports/mark-sent": () =>
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        "/error-reports/summary": () =>
          new Response(
            JSON.stringify({
              severity: "low",
              count: 5,
              sources: [{ source: "source_a", count: 3 }, { source: "source_b", count: 2 }],
              latestAt: "2024-01-01T00:00:00Z",
            }),
            { status: 200 },
          ),
      }),
    } as any;

    await sendAggregatedAlerts(env);

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/bot"),
      expect.objectContaining({
        body: expect.stringContaining("Error Report Summary"),
      }),
    );

    const markSentCall = (env.API_SERVICE.fetch as any).mock.calls.find(
      (call: any) => String(call[0].url).includes("mark-sent"),
    );
    expect(markSentCall).toBeDefined();
  });

  it("handles summary fetch failure gracefully", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      API_SERVICE: createMockApiService({
        "/error-reports/summary": () =>
          new Response(null, { status: 500 }),
      }),
    } as any;

    await expect(sendAggregatedAlerts(env)).resolves.toBeUndefined();
  });

  it("handles mark-sent failure gracefully", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      BOT_TOKEN: "test-token",
      API_SERVICE: createMockApiService({
        "/error-reports/mark-sent": () =>
          new Response(null, { status: 500 }),
        "/error-reports/summary": () =>
          new Response(
            JSON.stringify({
              severity: "low",
              count: 3,
              sources: [{ source: "src", count: 3 }],
              latestAt: "2024-01-01T00:00:00Z",
            }),
            { status: 200 },
          ),
      }),
    } as any;

    await expect(sendAggregatedAlerts(env)).resolves.toBeUndefined();
  });

  it("handles total failure gracefully", async () => {
    const env = {
      ADMIN_CHAT_ID: "admin123",
      API_SERVICE: {
        fetch: vi.fn().mockRejectedValue(new Error("Total failure")),
      },
    } as any;

    await expect(sendAggregatedAlerts(env)).resolves.toBeUndefined();
  });
});
