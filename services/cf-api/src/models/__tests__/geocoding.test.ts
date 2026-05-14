import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeocodingService } from "../geocoding.js";
import { haversine } from "../match.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    _store: store,
  };
}

describe("GeocodingService", () => {
  it("should return cached results on KV hit", async () => {
    const kv = mockKV();
    kv._store.set("geo:search:test:en:3", JSON.stringify([{ city: "TestCity", country: "TC", latitude: 1, longitude: 2 }]));
    const service = new GeocodingService(kv as unknown as KVNamespace);
    const { Effect } = await import("effect");
    const results = await Effect.runPromise(service.searchCities("test", { limit: 3 }));
    expect(results[0].city).toBe("TestCity");
  });
});

describe("haversine", () => {
  it("should calculate ~0 for same point", () => {
    expect(haversine(0, 0, 0, 0)).toBe(0);
  });

  it("should return positive distance for different points", () => {
    const d = haversine(-6.2, 106.8, -6.9, 107.6);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(200);
  });

  it("should handle antipodal points", () => {
    const d = haversine(0, 0, 0, 180);
    expect(d).toBeGreaterThan(20000);
  });
});
