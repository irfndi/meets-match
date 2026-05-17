import { describe, it, expect, vi } from "vitest";
import {
  buildMediaKey,
  buildMediaPublicUrl,
  extractMediaKeyFromUrl,
} from "../media.js";

describe("media utilities", () => {
  beforeAll(() => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "test-uuid-1234"),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("buildMediaKey", () => {
    it("builds a key with userId, timestamp, uuid and extension", () => {
      const key = buildMediaKey("user_42", "jpg");
      expect(key).toMatch(/^user_42\/\d+_test-uuid-1234\.jpg$/);
    });

    it("works with different extensions", () => {
      expect(buildMediaKey("u1", "png")).toMatch(/\.png$/);
      expect(buildMediaKey("u1", "mp4")).toMatch(/\.mp4$/);
    });
  });

  describe("buildMediaPublicUrl", () => {
    it("concatenates CDN base with key", () => {
      const url = buildMediaPublicUrl("user/123.jpg");
      expect(url).toBe(
        "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/user/123.jpg",
      );
    });
  });

  describe("extractMediaKeyFromUrl", () => {
    it("extracts key from a valid CDN URL", () => {
      const key = extractMediaKeyFromUrl(
        "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/user/123.jpg",
      );
      expect(key).toBe("user/123.jpg");
    });

    it("returns null for non-CDN URLs", () => {
      expect(
        extractMediaKeyFromUrl("https://example.com/image.jpg"),
      ).toBeNull();
      expect(extractMediaKeyFromUrl("random-string")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractMediaKeyFromUrl("")).toBeNull();
    });
  });
});
