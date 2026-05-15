import { describe, it, expect } from "vitest";
import {
  getProfileCompleteness,
  getMissingFieldsDisplay,
} from "../user-utils.js";

describe("getProfileCompleteness", () => {
  it("returns complete for fully filled profile", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns missing fields for empty profile", () => {
    const user = { id: "1" };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual([
      "displayName",
      "birthDate",
      "gender",
      "bio",
      "location",
      "interests",
      "mediaUrls",
    ]);
  });

  it("detects missing location when only country is provided", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("location");
  });

  it("accepts GPS coordinates as valid location", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { latitude: -6.2, longitude: 106.8 },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("detects empty interests array", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: [],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("interests");
  });

  it("detects empty displayName", () => {
    const user = {
      id: "1",
      displayName: "   ",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("displayName");
  });

  it("detects empty bio", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("bio");
  });
});

describe("getMissingFieldsDisplay", () => {
  it("formats missing fields with emojis", () => {
    const result = getMissingFieldsDisplay([
      "displayName",
      "birthDate",
      "interests",
    ]);
    expect(result).toContain("👤 Name");
    expect(result).toContain("🎂 Age");
    expect(result).toContain("🌟 Interests");
  });

  it("returns empty string for no missing fields", () => {
    const result = getMissingFieldsDisplay([]);
    expect(result).toBe("");
  });
});
