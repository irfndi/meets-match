import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  User,
  Gender,
  Location,
  Preferences,
  SubscriptionTier,
  GetUserRequest,
  GetUserResponse,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  UpdateLastActiveRequest,
  UpdateLastActiveResponse,
  UpdateLastRemindedAtRequest,
  UpdateLastRemindedAtResponse,
} from "../../contracts/user.js";

const validUser = {
  id: "user-1",
  username: "johndoe",
  displayName: "John",
  lastName: "Doe",
  bio: "Hello world",
  age: 30,
  gender: "male" as const,
  interests: ["coding", "music"],
  mediaUrls: [
    {
      url: "https://example.com/photo.jpg",
      type: "image",
      uploadedAt: "2025-01-01T00:00:00Z",
    },
  ],
  location: {
    latitude: 40.7128,
    longitude: -74.006,
    city: "New York",
    country: "US",
    lastUpdated: "2025-01-01T00:00:00Z",
  },
  preferences: {
    minAge: 18,
    maxAge: 50,
    genderPreference: ["female"],
    relationshipType: ["serious"],
    maxDistance: 50,
    notificationsEnabled: true,
  },
  isActive: true,
  isSleeping: false,
  isProfileComplete: true,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  lastActive: "2025-01-01T00:00:00Z",
};

describe("User Contracts", () => {
  describe("User schema", () => {
    it("should encode and decode a valid user", () => {
      const result = Schema.decodeUnknownSync(User)(validUser);
      expect(result.id).toBe("user-1");
      expect(result.age).toBe(30);
      expect(result.gender).toBe("male");
      expect(result.location?.city).toBe("New York");
      expect(result.preferences?.minAge).toBe(18);
    });

    it("should accept user with only required fields (id)", () => {
      const minimal = { id: "minimal-user" };
      const result = Schema.decodeUnknownSync(User)(minimal);
      expect(result.id).toBe("minimal-user");
      expect(result.displayName).toBeUndefined();
      expect(result.age).toBeUndefined();
    });

    it("should reject user with wrong type for required field", () => {
      const invalid = { id: 123 }; // id must be string
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should reject user with missing required field", () => {
      const invalid = {}; // missing id
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should reject invalid gender enum value", () => {
      const invalid = { id: "user-x", gender: "unicorn" };
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should reject age as string instead of number", () => {
      const invalid = { id: "user-x", age: "30" };
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should reject non-array interests", () => {
      const invalid = { id: "user-x", interests: "coding" };
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should produce round-trip equivalent output", () => {
      const encoded = Schema.encodeSync(User)(validUser);
      const decoded = Schema.decodeUnknownSync(User)(encoded);
      expect(decoded).toEqual(validUser);
    });
  });

  describe("Gender schema", () => {
    it.each(["male", "female", "other", "prefer_not_to_say"] as const)(
      "should accept %s",
      (value) => {
        expect(() => Schema.decodeUnknownSync(Gender)(value)).not.toThrow();
      },
    );

    it("should reject invalid gender", () => {
      expect(() => Schema.decodeUnknownSync(Gender)("unknown")).toThrow();
    });
  });

  describe("Location schema", () => {
    it("should decode valid location with all fields", () => {
      const loc = {
        latitude: 40.7,
        longitude: -74.0,
        city: "NYC",
        country: "US",
        lastUpdated: "2025-01-01T00:00:00Z",
      };
      const result = Schema.decodeUnknownSync(Location)(loc);
      expect(result.latitude).toBe(40.7);
      expect(result.longitude).toBe(-74.0);
    });

    it("should decode minimal location (only lat/lon)", () => {
      const minimal = { latitude: 0, longitude: 0 };
      const result = Schema.decodeUnknownSync(Location)(minimal);
      expect(result.latitude).toBe(0);
      expect(result.city).toBeUndefined();
    });

    it("should decode location without coordinates (city-only)", () => {
      const result = Schema.decodeUnknownSync(Location)({
        city: "Jakarta",
        country: "Indonesia",
      });
      expect(result.latitude).toBeUndefined();
      expect(result.city).toBe("Jakarta");
    });

    it("should reject partial coordinates (only latitude or only longitude)", () => {
      expect(() =>
        Schema.decodeUnknownSync(Location)({
          latitude: 0,
          city: "Jakarta",
        }),
      ).toThrow();
      expect(() =>
        Schema.decodeUnknownSync(Location)({
          longitude: 0,
          city: "Jakarta",
        }),
      ).toThrow();
    });
  });

  describe("Preferences schema", () => {
    it("should decode empty preferences", () => {
      const result = Schema.decodeUnknownSync(Preferences)({});
      expect(result.minAge).toBeUndefined();
      expect(result.maxDistance).toBeUndefined();
    });

    it("should decode full preferences", () => {
      const prefs = {
        minAge: 18,
        maxAge: 65,
        genderPreference: ["female", "other"],
        relationshipType: ["serious", "casual"],
        maxDistance: 100,
        notificationsEnabled: false,
        preferredLanguage: "en",
        preferredCountry: "US",
        premiumTier: "gold",
      };
      const result = Schema.decodeUnknownSync(Preferences)(prefs);
      expect(result.minAge).toBe(18);
      expect(result.genderPreference).toHaveLength(2);
    });
  });

  describe("GetUserRequest / GetUserResponse", () => {
    it("should decode valid GetUserRequest", () => {
      const result = Schema.decodeUnknownSync(GetUserRequest)({
        userId: "abc",
      });
      expect(result.userId).toBe("abc");
    });

    it("should decode GetUserResponse", () => {
      const result = Schema.decodeUnknownSync(GetUserResponse)({
        user: validUser,
      });
      expect(result.user.id).toBe("user-1");
    });
  });

  describe("CreateUserRequest / CreateUserResponse", () => {
    it("should decode valid CreateUserRequest", () => {
      const result = Schema.decodeUnknownSync(CreateUserRequest)({
        user: validUser,
      });
      expect(result.user.id).toBe("user-1");
    });

    it("should reject CreateUserRequest with missing user", () => {
      expect(() => Schema.decodeUnknownSync(CreateUserRequest)({})).toThrow();
    });
  });

  describe("UpdateUserRequest / UpdateUserResponse", () => {
    it("should decode valid UpdateUserRequest with updateMask", () => {
      const result = Schema.decodeUnknownSync(UpdateUserRequest)({
        userId: "abc",
        user: validUser,
        updateMask: ["displayName", "age"],
      });
      expect(result.userId).toBe("abc");
      expect(result.updateMask).toEqual(["displayName", "age"]);
    });

    it("should decode UpdateUserRequest without updateMask", () => {
      const result = Schema.decodeUnknownSync(UpdateUserRequest)({
        userId: "abc",
        user: validUser,
      });
      expect(result.updateMask).toBeUndefined();
    });
  });

  describe("SubscriptionTier schema", () => {
    it.each(["free", "premium", "premium_plus"] as const)(
      "should accept %s",
      (tier) => {
        expect(() =>
          Schema.decodeUnknownSync(SubscriptionTier)(tier),
        ).not.toThrow();
      },
    );

    it("should reject invalid tier", () => {
      expect(() =>
        Schema.decodeUnknownSync(SubscriptionTier)("gold"),
      ).toThrow();
    });
  });

  describe("UpdateLastActiveRequest / UpdateLastActiveResponse", () => {
    it("should decode valid UpdateLastActiveRequest", () => {
      const result = Schema.decodeUnknownSync(UpdateLastActiveRequest)({
        userId: "abc",
      });
      expect(result.userId).toBe("abc");
    });

    it("should reject UpdateLastActiveRequest with missing userId", () => {
      expect(() =>
        Schema.decodeUnknownSync(UpdateLastActiveRequest)({}),
      ).toThrow();
    });

    it("should decode UpdateLastActiveResponse with success=true", () => {
      const result = Schema.decodeUnknownSync(UpdateLastActiveResponse)({
        success: true,
      });
      expect(result.success).toBe(true);
    });

    it("should decode UpdateLastActiveResponse with success=false", () => {
      const result = Schema.decodeUnknownSync(UpdateLastActiveResponse)({
        success: false,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateLastRemindedAtRequest / UpdateLastRemindedAtResponse", () => {
    it("should decode valid UpdateLastRemindedAtRequest", () => {
      const result = Schema.decodeUnknownSync(UpdateLastRemindedAtRequest)({
        userId: "abc",
      });
      expect(result.userId).toBe("abc");
    });

    it("should decode UpdateLastRemindedAtResponse", () => {
      const result = Schema.decodeUnknownSync(UpdateLastRemindedAtResponse)({
        success: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("User mediaUrls validation", () => {
    it("should reject media item with invalid type", () => {
      const invalid = {
        ...validUser,
        mediaUrls: [
          {
            url: "https://example.com/file.pdf",
            type: "document",
            uploadedAt: "2025-01-01T00:00:00Z",
          },
        ],
      };
      expect(() => Schema.decodeUnknownSync(User)(invalid)).toThrow();
    });

    it("should accept media item with type image", () => {
      const user = {
        id: "user-media",
        mediaUrls: [
          {
            url: "https://example.com/photo.jpg",
            type: "image",
            uploadedAt: "2025-01-01T00:00:00Z",
          },
        ],
      };
      expect(() => Schema.decodeUnknownSync(User)(user)).not.toThrow();
    });

    it("should accept media item with type video", () => {
      const user = {
        id: "user-media",
        mediaUrls: [
          {
            url: "https://example.com/video.mp4",
            type: "video",
            uploadedAt: "2025-01-01T00:00:00Z",
          },
        ],
      };
      expect(() => Schema.decodeUnknownSync(User)(user)).not.toThrow();
    });
  });

  describe("Location schema — source field", () => {
    it("should accept GPS source", () => {
      const loc = { latitude: 1, longitude: 2, source: "gps" };
      expect(() => Schema.decodeUnknownSync(Location)(loc)).not.toThrow();
    });

    it("should accept geocoded source", () => {
      const loc = { latitude: 1, longitude: 2, source: "geocoded" };
      expect(() => Schema.decodeUnknownSync(Location)(loc)).not.toThrow();
    });

    it("should reject invalid source value", () => {
      const loc = { latitude: 1, longitude: 2, source: "manual" };
      expect(() => Schema.decodeUnknownSync(Location)(loc)).toThrow();
    });

    it("should decode NaN as numeric value (Effect schema permits it)", () => {
      const result = Schema.decodeUnknownSync(Location)({
        latitude: NaN,
        longitude: 0,
      });
      expect(Number.isNaN(result.latitude)).toBe(true);
      expect(result.longitude).toBe(0);
    });
  });
});
