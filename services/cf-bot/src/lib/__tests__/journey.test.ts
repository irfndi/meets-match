import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getJourney,
  recordJourneyEvent,
  recordJourneyError,
  formatJourneyForReport,
  generateTraceId,
} from "../journey.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe("Journey Tracking", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  describe("getJourney", () => {
    it("should return empty journey for new user", async () => {
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.events).toEqual([]);
    });

    it("should parse existing journey", async () => {
      await kv.put(
        "journey:123",
        JSON.stringify({ events: [{ ts: "2024-01-01", action: "test" }] }),
      );
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.events).toHaveLength(1);
    });

    it("should handle corrupted data gracefully", async () => {
      await kv.put("journey:123", "not-json");
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.events).toEqual([]);
    });
  });

  describe("recordJourneyEvent", () => {
    it("should append event to journey", async () => {
      await recordJourneyEvent(kv as unknown as KVNamespace, "123", {
        action: "like",
        targetId: "456",
      });
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.events).toHaveLength(1);
      expect(journey.events[0].action).toBe("like");
      expect(journey.events[0].targetId).toBe("456");
    });

    it("should limit to max events", async () => {
      for (let i = 0; i < 25; i++) {
        await recordJourneyEvent(kv as unknown as KVNamespace, "123", {
          action: `event-${i}`,
        });
      }
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.events.length).toBeLessThanOrEqual(20);
    });
  });

  describe("recordJourneyError", () => {
    it("should store error trace", async () => {
      await recordJourneyError(kv as unknown as KVNamespace, "123", "TRACE001");
      const journey = await getJourney(kv as unknown as KVNamespace, "123");
      expect(journey.lastErrorTrace).toBe("TRACE001");
      expect(journey.lastErrorAt).toBeDefined();
    });
  });

  describe("formatJourneyForReport", () => {
    it("should format events", () => {
      const journey = {
        events: [
          { ts: "2024-01-01T10:00:00Z", action: "like", targetId: "456" },
          { ts: "2024-01-01T10:01:00Z", action: "dislike", targetId: "789" },
        ],
      };
      const text = formatJourneyForReport(journey);
      expect(text).toContain("like");
      expect(text).toContain("456");
      expect(text).toContain("dislike");
    });

    it("should handle empty journey", () => {
      const text = formatJourneyForReport({ events: [] });
      expect(text).toContain("No recent activity");
    });

    it("should handle invalid timestamp gracefully", () => {
      const journey = {
        events: [
          { ts: "not-a-valid-date", action: "something" },
        ],
      };
      const text = formatJourneyForReport(journey);
      expect(text).toContain("invalid time");
      expect(text).toContain("something");
    });

    it("should handle empty timestamp string", () => {
      const journey = {
        events: [
          { ts: "", action: "empty-ts" },
        ],
      };
      const text = formatJourneyForReport(journey);
      expect(text).toContain("invalid time");
      expect(text).toContain("empty-ts");
    });

    it("should include event detail when present", () => {
      const journey = {
        events: [
          { ts: "2024-01-01T10:00:00Z", action: "cmd", detail: "ref_abc" },
        ],
      };
      const text = formatJourneyForReport(journey);
      expect(text).toContain("(ref_abc)");
    });

    it("should include target ID arrow when present", () => {
      const journey = {
        events: [
          { ts: "2024-01-01T10:00:00Z", action: "like", targetId: "999" },
        ],
      };
      const text = formatJourneyForReport(journey);
      expect(text).toContain("→ 999");
    });

    it("should only show last 10 events", () => {
      const events = Array.from({ length: 15 }, (_, i) => ({
        ts: "2024-01-01T10:00:00Z",
        action: `event-${i}`,
      }));
      const text = formatJourneyForReport({ events });
      const lines = text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(10);
      expect(text).toContain("event-14");
      expect(text).not.toContain("event-0");
    });

    it("should handle journey with no events property", () => {
      const text = formatJourneyForReport({ events: [] } as any);
      expect(text).toContain("No recent activity");
    });
  });

  describe("recordJourneyEvent failure handling", () => {
    it("should not throw on KV put failure", async () => {
      const failingKv = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockRejectedValue(new Error("KV write failed")),
        _store: new Map(),
      };

      await expect(
        recordJourneyEvent(failingKv as unknown as KVNamespace, "123", {
          action: "test",
        }),
      ).resolves.toBeUndefined();
    });

    it("should not throw on KV get failure", async () => {
      const failingKv = {
        get: vi.fn().mockRejectedValue(new Error("KV read failed")),
        put: vi.fn().mockResolvedValue(undefined),
        _store: new Map(),
      };

      await expect(
        recordJourneyEvent(failingKv as unknown as KVNamespace, "123", {
          action: "test",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("recordJourneyError failure handling", () => {
    it("should not throw on KV put failure", async () => {
      const failingKv = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockRejectedValue(new Error("KV write failed")),
        _store: new Map(),
      };

      await expect(
        recordJourneyError(failingKv as unknown as KVNamespace, "123", "TRACE001"),
      ).resolves.toBeUndefined();
    });

    it("should not throw on KV get failure", async () => {
      const failingKv = {
        get: vi.fn().mockRejectedValue(new Error("KV read failed")),
        put: vi.fn().mockResolvedValue(undefined),
        _store: new Map(),
      };

      await expect(
        recordJourneyError(failingKv as unknown as KVNamespace, "123", "TRACE001"),
      ).resolves.toBeUndefined();
    });
  });

  describe("generateTraceId", () => {
    it("should generate 8-char hex string", () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9A-F]{8}$/);
    });
  });
});
