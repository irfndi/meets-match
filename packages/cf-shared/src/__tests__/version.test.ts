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

    it("handles exactly 0 seconds difference", () => {
      const ts = "2026-05-17T12:00:00.000Z";
      expect(formatDuration(ts)).toBe("0s ago");
    });

    it("handles exactly 1 minute boundary", () => {
      const ts = "2026-05-17T11:59:00.000Z";
      expect(formatDuration(ts)).toBe("1m ago");
    });

    it("handles exactly 1 hour boundary", () => {
      const ts = "2026-05-17T11:00:00.000Z";
      expect(formatDuration(ts)).toBe("1h 0m ago");
    });

    it("handles exactly 1 day boundary", () => {
      const ts = "2026-05-16T12:00:00.000Z";
      expect(formatDuration(ts)).toBe("1d 0h ago");
    });

    it("handles large multi-day duration", () => {
      const ts = "2026-05-01T00:00:00.000Z";
      const result = formatDuration(ts);
      expect(result).toMatch(/^\d+d \d+h ago$/);
    });

    it("handles fractional seconds (sub-second difference)", () => {
      const ts = "2026-05-17T11:59:59.500Z";
      expect(formatDuration(ts)).toBe("0s ago");
    });

    it("handles exactly 59 seconds", () => {
      const ts = "2026-05-17T11:59:01.000Z";
      expect(formatDuration(ts)).toBe("59s ago");
    });

    it("handles exactly 59 minutes", () => {
      const ts = "2026-05-17T11:01:00.000Z";
      expect(formatDuration(ts)).toBe("59m ago");
    });

    it("handles exactly 23 hours", () => {
      const ts = "2026-05-16T13:00:00.000Z";
      expect(formatDuration(ts)).toBe("23h 0m ago");
    });
  });
});
