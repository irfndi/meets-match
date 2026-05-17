import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDuration } from "../version.js";

describe("version utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatDuration", () => {
    it("formats seconds ago", () => {
      const ts = new Date("2026-05-17T11:59:30Z").toISOString();
      expect(formatDuration(ts)).toBe("30s ago");
    });

    it("formats minutes ago", () => {
      const ts = new Date("2026-05-17T11:58:15Z").toISOString();
      expect(formatDuration(ts)).toBe("1m ago");
    });

    it("formats hours and minutes ago", () => {
      const ts = new Date("2026-05-17T10:30:00Z").toISOString();
      expect(formatDuration(ts)).toBe("1h 30m ago");
    });

    it("formats days and hours ago", () => {
      const ts = new Date("2026-05-15T08:00:00Z").toISOString();
      expect(formatDuration(ts)).toBe("2d 4h ago");
    });

    it("returns 'unknown' for invalid date", () => {
      expect(formatDuration("not-a-date")).toBe("unknown");
    });

    it("returns 'unknown' for empty string", () => {
      expect(formatDuration("")).toBe("unknown");
    });

    it("handles future dates as 0s ago", () => {
      const ts = new Date("2026-05-17T13:00:00Z").toISOString();
      expect(formatDuration(ts)).toBe("0s ago");
    });
  });
});
