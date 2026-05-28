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

    it("returns null for URL that is exactly the CDN base with trailing slash", () => {
      expect(
        extractMediaKeyFromUrl(
          "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/",
        ),
      ).toBeNull();
    });

    it("returns null for URL that is exactly the CDN base without trailing slash", () => {
      expect(
        extractMediaKeyFromUrl(
          "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev",
        ),
      ).toBeNull();
    });

    it("extracts key from deep CDN URL path", () => {
      const key = extractMediaKeyFromUrl(
        "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/user/123/profile/photo.jpg",
      );
      expect(key).toBe("user/123/profile/photo.jpg");
    });
  });

  describe("buildMediaKey — error handling", () => {
    it("throws for userId with special characters", () => {
      expect(() => buildMediaKey("user/../etc", "jpg")).toThrow(
        "Invalid userId for media key",
      );
      expect(() => buildMediaKey("user with spaces", "jpg")).toThrow(
        "Invalid userId for media key",
      );
      expect(() => buildMediaKey("user@domain", "jpg")).toThrow(
        "Invalid userId for media key",
      );
    });

    it("throws for extension with special characters", () => {
      expect(() => buildMediaKey("user1", "jpeg.exe")).toThrow(
        "Invalid extension for media key",
      );
      expect(() => buildMediaKey("user1", "mp4 virus")).toThrow(
        "Invalid extension for media key",
      );
      expect(() => buildMediaKey("user1", ".png")).toThrow(
        "Invalid extension for media key",
      );
    });

    it("throws for empty userId", () => {
      expect(() => buildMediaKey("", "jpg")).toThrow(
        "Invalid userId for media key",
      );
    });

    it("throws for empty extension", () => {
      expect(() => buildMediaKey("user1", "")).toThrow(
        "Invalid extension for media key",
      );
    });

    it("accepts userId with underscores and hyphens", () => {
      expect(() => buildMediaKey("user_name-123", "jpg")).not.toThrow();
    });

    it("accepts numeric extensions", () => {
      expect(() => buildMediaKey("user1", "webp")).not.toThrow();
    });
  });

  describe("buildMediaPublicUrl — edge cases", () => {
    it("handles key with special characters", () => {
      const url = buildMediaPublicUrl("user/photo%20name.jpg");
      expect(url).toContain("photo%20name.jpg");
    });

    it("handles nested keys", () => {
      const url = buildMediaPublicUrl("a/b/c/d.jpg");
      expect(url).toBe(
        "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/a/b/c/d.jpg",
      );
    });
  });
});
