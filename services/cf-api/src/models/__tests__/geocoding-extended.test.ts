import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeocodingService } from "../geocoding.js";
import { createMockKV } from "@meetsmatch/cf-shared/testing";
import { runEffect } from "@meetsmatch/cf-shared/testing";

describe("GeocodingService extended", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeService(kvData: Record<string, string> = {}) {
    const kv = createMockKV(kvData);
    return { service: new GeocodingService(kv as any), kv };
  }

  describe("searchCities with language", () => {
    it("uses language in cache key", async () => {
      const cached = [
        { latitude: 48.8, longitude: 2.3, city: "Paris", country: "France" },
      ];
      const { service } = makeService({
        "geo:search:Paris:fr:5": JSON.stringify(cached),
      });
      const result = await runEffect(
        service.searchCities("Paris", { limit: 5, language: "fr" }),
      );
      expect(result).toEqual(cached);
    });

    it("fetches with language parameter", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            lat: "48.8566",
            lon: "2.3522",
            address: { city: "Paris", country: "France" },
          },
        ],
      });

      const { service } = makeService();
      const result = await runEffect(
        service.searchCities("Paris", { limit: 5, language: "fr" }),
      );
      expect(result).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe("reverseGeocode with town/village addresses", () => {
    it("uses town when city is missing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { town: "Smallville", country: "USA" },
        }),
      });

      const { service } = makeService();
      const result = await runEffect(service.reverseGeocode(40, -75));
      expect(result).not.toBeNull();
      expect(result!.city).toBe("Smallville");
      expect(result!.country).toBe("USA");
    });

    it("uses village when both city and town missing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { village: "Hamlet", country: "UK" },
        }),
      });

      const { service } = makeService();
      const result = await runEffect(service.reverseGeocode(51, -1));
      expect(result).not.toBeNull();
      expect(result!.city).toBe("Hamlet");
    });

    it("uses municipality when other fields missing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { municipality: "District", country: "Germany" },
        }),
      });

      const { service } = makeService();
      const result = await runEffect(service.reverseGeocode(52, 13));
      expect(result).not.toBeNull();
      expect(result!.city).toBe("District");
    });
  });

  describe("calculateDistance", () => {
    it("calculates antipodal distance", () => {
      const { service } = makeService();
      const a = { latitude: 0, longitude: 0, city: "A", country: "X" };
      const b = { latitude: 0, longitude: 180, city: "B", country: "Y" };
      const dist = service.calculateDistance(a, b);
      expect(dist).toBeGreaterThan(20000);
    });
  });
});
