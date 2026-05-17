import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeocodingService } from "../geocoding.js";
import { createMockKV } from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";
import { runEffect } from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";

describe("GeocodingService", () => {
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

  describe("searchCities", () => {
    it("returns cached results when available", async () => {
      const cached = [
        { latitude: 40.7, longitude: -74, city: "New York", country: "USA" },
      ];
      const { service } = makeService({
        "geo:search:New York:en:1": JSON.stringify(cached),
      });
      const result = await runEffect(
        service.searchCities("New York", { limit: 1 }),
      );
      expect(result).toEqual(cached);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches from API and caches result", async () => {
      const apiResult = [
        {
          lat: "40.7128",
          lon: "-74.006",
          address: { city: "New York", country: "United States" },
        },
      ];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => apiResult,
      });

      const { service, kv } = makeService();
      const result = await runEffect(
        service.searchCities("New York", { limit: 1 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].city).toBe("New York");
      expect(result[0].country).toBe("United States");
      expect(kv._store.has("geo:search:New York:en:1")).toBe(true);
    });

    it("skips results without city or country", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { lat: "0", lon: "0", address: {} },
          {
            lat: "40",
            lon: "-74",
            address: { city: "Boston", country: "USA" },
          },
        ],
      });

      const { service } = makeService();
      const result = await runEffect(
        service.searchCities("test", { limit: 5 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].city).toBe("Boston");
    });

    it("deduplicates by city+country", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { lat: "40", lon: "-74", address: { city: "NYC", country: "USA" } },
          {
            lat: "40.1",
            lon: "-74.1",
            address: { city: "NYC", country: "USA" },
          },
        ],
      });

      const { service } = makeService();
      const result = await runEffect(service.searchCities("nyc", { limit: 5 }));
      expect(result).toHaveLength(1);
    });

    it("throws on API error", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
      const { service } = makeService();
      await expect(
        runEffect(service.searchCities("test", { limit: 1 })),
      ).rejects.toThrow("Geocoding search failed");
    });
  });

  describe("reverseGeocode", () => {
    it("returns cached result when available", async () => {
      const cached = {
        latitude: 40.7,
        longitude: -74,
        city: "NYC",
        country: "USA",
      };
      const { service } = makeService({
        "geo:reverse:40.700000:-74.000000": JSON.stringify(cached),
      });
      const result = await runEffect(service.reverseGeocode(40.7, -74));
      expect(result).toEqual(cached);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches and caches reverse geocode", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { city: "London", country: "UK" },
        }),
      });

      const { service, kv } = makeService();
      const result = await runEffect(service.reverseGeocode(51.5, -0.1));
      expect(result).toEqual({
        latitude: 51.5,
        longitude: -0.1,
        city: "London",
        country: "UK",
      });
      expect(kv._store.has("geo:reverse:51.500000:-0.100000")).toBe(true);
    });

    it("returns null when no city/country", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: {} }),
      });

      const { service } = makeService();
      const result = await runEffect(service.reverseGeocode(0, 0));
      expect(result).toBeNull();
    });

    it("throws on API error", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      const { service } = makeService();
      await expect(runEffect(service.reverseGeocode(0, 0))).rejects.toThrow();
    });
  });

  describe("calculateDistance", () => {
    it("calculates distance between two locations", () => {
      const { service } = makeService();
      const a = { latitude: 0, longitude: 0, city: "A", country: "X" };
      const b = { latitude: 1, longitude: 0, city: "B", country: "Y" };
      const dist = service.calculateDistance(a, b);
      expect(dist).toBeGreaterThan(110);
      expect(dist).toBeLessThan(112);
    });

    it("returns 0 for same point", () => {
      const { service } = makeService();
      const a = { latitude: 10, longitude: 20, city: "A", country: "X" };
      const b = { latitude: 10, longitude: 20, city: "B", country: "Y" };
      expect(service.calculateDistance(a, b)).toBeCloseTo(0, 5);
    });
  });
});
