import { describe, it, expect } from "vitest";
import { getProfileCompleteness, getMissingFieldsDisplay } from "../user-utils.js";

describe("getProfileCompleteness", () => {
  it("returns complete for fully filled profile", () => {
    const user = {
      id: "1",
      displayName: "Test",
      age: 25,
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],

    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns missing fields for empty profile", () => {
    const user = { id: "1" };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(["displayName", "age", "gender", "bio", "location", "interests"]);
  });

  it("detects missing location when only country is provided", () => {
    const user = {
      id: "1",
      displayName: "Test",
      age: 25,
      gender: "male",
      bio: "Hello",
      location: { country: "Indonesia" },
      interests: ["Hiking"],

    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("location");
  });

  it("accepts GPS coordinates as valid location", () => {
    const user = {
      id: "1",
      displayName: "Test",
      age: 25,
      gender: "male",
      bio: "Hello",
      location: { latitude: -6.2, longitude: 106.8 },
      interests: ["Hiking"],

    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("detects empty interests array", () => {
    const user = {
      id: "1",
      displayName: "Test",
      age: 25,
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: [],

    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("interests");
  });

  it("detects empty displayName", () => {
    const user = {
      id: "1",
      displayName: "   ",
      age: 25,
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],

    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("displayName");
  });

  it("detects empty bio", () => {
    const user = {
      id: "1",
      displayName: "Test",
      age: 25,
      gender: "male",
      bio: "",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("bio");
  });
});

describe("getMissingFieldsDisplay", () => {
  it("formats missing fields with emojis", () => {
    const result = getMissingFieldsDisplay(["displayName", "age", "interests"]);
    expect(result).toContain("👤 Name");
    expect(result).toContain("🎂 Age");
    expect(result).toContain("🌟 Interests");
  });

  it("returns empty string for no missing fields", () => {
    const result = getMissingFieldsDisplay([]);
    expect(result).toBe("");
  });
});
