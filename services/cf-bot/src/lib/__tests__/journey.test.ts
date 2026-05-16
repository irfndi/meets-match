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
  });

  describe("generateTraceId", () => {
    it("should generate 8-char hex string", () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9A-F]{8}$/);
    });
  });
});
