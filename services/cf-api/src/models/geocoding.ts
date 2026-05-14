import { Effect } from "effect";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface Location {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
}

export interface SearchOptions {
  limit: number;
  language?: string;
  preferCountry?: string;
  preferCoords?: { lat: number; lon: number };
}

export class GeocodingService {
  constructor(
    private readonly kv: KVNamespace,
    private readonly apiUrl = "https://nominatim.openstreetmap.org"
  ) {}

  searchCities(query: string, opts: SearchOptions): Effect.Effect<Array<Location>, Error, never> {
    return Effect.tryPromise({
      try: async () => {
        const cacheKey = `geo:search:${query}:${opts.language ?? "en"}:${opts.limit}`;
        const cached = await this.kv.get(cacheKey);
        if (cached) return JSON.parse(cached) as Array<Location>;

        const params = new URLSearchParams({ q: query, format: "json", addressdetails: "1", limit: String(opts.limit) });
        if (opts.language) params.set("accept-language", opts.language);

        const res = await fetch(`${this.apiUrl}/search?${params.toString()}`, { headers: { "User-Agent": "meetsmatch/1.0" } });
        if (!res.ok) throw new Error(`Geocoding search failed: ${res.status}`);

        const results = (await res.json()) as Array<Record<string, unknown>>;
        const locations: Array<Location> = [];
        const seen = new Set<string>();

        for (const r of results) {
          const addr = (r.address ?? {}) as Record<string, string>;
          const city = addr.city || addr.town || addr.village || addr.municipality || "";
          const country = addr.country || "";
          if (!city || !country) continue;
          const key = `${city}|${country}`;
          if (seen.has(key)) continue;
          seen.add(key);
          locations.push({
            latitude: Number(r.lat),
            longitude: Number(r.lon),
            city,
            country,
          });
          if (locations.length >= opts.limit) break;
        }

        await this.kv.put(cacheKey, JSON.stringify(locations), { expirationTtl: 86400 });
        return locations;
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });
  }

  reverseGeocode(lat: number, lon: number): Effect.Effect<Location | null, Error, never> {
    return Effect.tryPromise({
      try: async () => {
        const cacheKey = `geo:reverse:${lat.toFixed(6)}:${lon.toFixed(6)}`;
        const cached = await this.kv.get(cacheKey);
        if (cached) return JSON.parse(cached) as Location;

        const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "json", addressdetails: "1", zoom: "10" });
        const res = await fetch(`${this.apiUrl}/reverse?${params.toString()}`, { headers: { "User-Agent": "meetsmatch/1.0" } });
        if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);

        const result = (await res.json()) as Record<string, unknown>;
        const addr = (result.address ?? {}) as Record<string, string>;
        const city = addr.city || addr.town || addr.village || addr.municipality || "";
        const country = addr.country || "";
        if (!city || !country) return null;

        const location: Location = { latitude: lat, longitude: lon, city, country };
        await this.kv.put(cacheKey, JSON.stringify(location), { expirationTtl: 86400 });
        return location;
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });
  }

  calculateDistance(a: Location, b: Location): number {
    const R = 6371; // km
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const sinDLat2 = Math.sin(dLat / 2);
    const sinDLon2 = Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon2 * sinDLon2), Math.sqrt(1 - (sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon2 * sinDLon2)));
    return R * c;
  }
}
