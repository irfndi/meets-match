import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  Match,
  MatchStatus,
  MatchAction,
  GetPotentialMatchesRequest,
  GetPotentialMatchesResponse,
  LikeMatchRequest,
  LikeMatchResponse,
  DislikeMatchRequest,
  DislikeMatchResponse,
  SkipMatchRequest,
  SkipMatchResponse,
  GetMatchListRequest,
  GetMatchListResponse,
  GetMatchRequest,
  GetMatchResponse,
  CreateMatchRequest,
  CreateMatchResponse,
} from "../../contracts/match.js";

const validMatch = {
  id: "match-1",
  user1Id: "user-1",
  user2Id: "user-2",
  status: "PENDING" as const,
  score: 0.85,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  matchedAt: "2025-01-01T00:00:00Z",
  user1Action: "LIKE" as const,
  user2Action: "NONE" as const,
};

describe("Match Contracts", () => {
  describe("Match schema", () => {
    it("should encode and decode a valid match", () => {
      const result = Schema.decodeUnknownSync(Match)(validMatch);
      expect(result.id).toBe("match-1");
      expect(result.status).toBe("PENDING");
      expect(result.score).toBe(0.85);
    });

    it("should accept minimal match (required fields only)", () => {
      const minimal = { id: "m1", user1Id: "u1", user2Id: "u2" };
      const result = Schema.decodeUnknownSync(Match)(minimal);
      expect(result.id).toBe("m1");
      expect(result.status).toBeUndefined();
    });

    it("should reject match with missing user1Id", () => {
      const invalid = { id: "m1", user2Id: "u2" };
      expect(() => Schema.decodeUnknownSync(Match)(invalid)).toThrow();
    });

    it("should produce round-trip equivalent output", () => {
      const encoded = Schema.encodeSync(Match)(validMatch);
      const decoded = Schema.decodeUnknownSync(Match)(encoded);
      expect(decoded).toEqual(validMatch);
    });
  });

  describe("MatchStatus enum", () => {
    it.each(["PENDING", "MATCHED", "REJECTED"] as const)(
      "should accept %s",
      (status) => {
        expect(() =>
          Schema.decodeUnknownSync(MatchStatus)(status),
        ).not.toThrow();
      },
    );

    it("should reject invalid status", () => {
      expect(() => Schema.decodeUnknownSync(MatchStatus)("BLOCKED")).toThrow();
    });
  });

  describe("MatchAction enum", () => {
    it.each(["LIKE", "DISLIKE", "SKIP", "NONE"] as const)(
      "should accept %s",
      (action) => {
        expect(() =>
          Schema.decodeUnknownSync(MatchAction)(action),
        ).not.toThrow();
      },
    );

    it("should reject invalid action", () => {
      expect(() =>
        Schema.decodeUnknownSync(MatchAction)("SUPER_LIKE"),
      ).toThrow();
    });

    it("should allow LIKE action in a match", () => {
      const match = {
        ...validMatch,
        user1Action: "LIKE" as const,
      };
      expect(() => Schema.decodeUnknownSync(Match)(match)).not.toThrow();
    });

    it("should reject invalid action in match user1Action", () => {
      const invalid = {
        ...validMatch,
        user1Action: "INVALID",
      };
      expect(() => Schema.decodeUnknownSync(Match)(invalid)).toThrow();
    });
  });

  describe("GetPotentialMatchesRequest / GetPotentialMatchesResponse", () => {
    it("should decode request with limit", () => {
      const result = Schema.decodeUnknownSync(GetPotentialMatchesRequest)({
        userId: "abc",
        limit: 10,
      });
      expect(result.userId).toBe("abc");
      expect(result.limit).toBe(10);
    });

    it("should decode request without limit", () => {
      const result = Schema.decodeUnknownSync(GetPotentialMatchesRequest)({
        userId: "abc",
      });
      expect(result.limit).toBeUndefined();
    });
  });

  describe("LikeMatchRequest / LikeMatchResponse", () => {
    it("should decode LikeMatchRequest", () => {
      const result = Schema.decodeUnknownSync(LikeMatchRequest)({
        matchId: "m1",
        userId: "u1",
      });
      expect(result.matchId).toBe("m1");
    });

    it("should decode LikeMatchResponse with mutual=false", () => {
      const result = Schema.decodeUnknownSync(LikeMatchResponse)({
        isMutual: false,
        match: validMatch,
      });
      expect(result.isMutual).toBe(false);
    });

    it("should decode LikeMatchResponse with mutual=true", () => {
      const result = Schema.decodeUnknownSync(LikeMatchResponse)({
        isMutual: true,
        match: validMatch,
      });
      expect(result.isMutual).toBe(true);
    });
  });

  describe("DislikeMatchRequest / SkipMatchRequest", () => {
    it("should decode DislikeMatchRequest", () => {
      const result = Schema.decodeUnknownSync(DislikeMatchRequest)({
        matchId: "m1",
        userId: "u1",
      });
      expect(result.matchId).toBe("m1");
    });

    it("should decode SkipMatchRequest", () => {
      const result = Schema.decodeUnknownSync(SkipMatchRequest)({
        matchId: "m1",
        userId: "u1",
      });
      expect(result.matchId).toBe("m1");
    });
  });

  describe("GetMatchListRequest / GetMatchListResponse", () => {
    it("should decode request with optional filters", () => {
      const result = Schema.decodeUnknownSync(GetMatchListRequest)({
        userId: "abc",
        status: "MATCHED",
        limit: 20,
        offset: 0,
      });
      expect(result.status).toBe("MATCHED");
      expect(result.limit).toBe(20);
    });

    it("should decode request without optional fields", () => {
      const result = Schema.decodeUnknownSync(GetMatchListRequest)({
        userId: "abc",
      });
      expect(result.status).toBeUndefined();
    });

    it("should decode response with matches array", () => {
      const result = Schema.decodeUnknownSync(GetMatchListResponse)({
        matches: [validMatch],
      });
      expect(result.matches).toHaveLength(1);
    });
  });

  describe("GetMatchRequest / GetMatchResponse", () => {
    it("should decode GetMatchRequest", () => {
      const result = Schema.decodeUnknownSync(GetMatchRequest)({
        matchId: "match-1",
      });
      expect(result.matchId).toBe("match-1");
    });

    it("should decode GetMatchResponse", () => {
      const result = Schema.decodeUnknownSync(GetMatchResponse)({
        match: validMatch,
      });
      expect(result.match.id).toBe("match-1");
    });
  });

  describe("CreateMatchRequest / CreateMatchResponse", () => {
    it("should decode CreateMatchRequest", () => {
      const result = Schema.decodeUnknownSync(CreateMatchRequest)({
        user1Id: "u1",
        user2Id: "u2",
      });
      expect(result.user1Id).toBe("u1");
      expect(result.user2Id).toBe("u2");
    });

    it("should reject CreateMatchRequest with missing user2Id", () => {
      expect(() =>
        Schema.decodeUnknownSync(CreateMatchRequest)({ user1Id: "u1" }),
      ).toThrow();
    });
  });

  describe("SkipMatchResponse / DislikeMatchResponse", () => {
    it("should decode SkipMatchRequest", () => {
      const result = Schema.decodeUnknownSync(SkipMatchRequest)({
        matchId: "m1",
        userId: "u1",
      });
      expect(result.matchId).toBe("m1");
    });

    it("should decode DislikeMatchResponse", () => {
      const result = Schema.decodeUnknownSync(DislikeMatchResponse)({
        match: validMatch,
      });
      expect(result.match.id).toBe("match-1");
    });

    it("should decode SkipMatchResponse", () => {
      const result = Schema.decodeUnknownSync(SkipMatchResponse)({
        match: validMatch,
      });
      expect(result.match.id).toBe("match-1");
    });
  });

  describe("Match with likeMessage", () => {
    it("should accept a likeMessage with text", () => {
      const matchWithMessage = {
        ...validMatch,
        likeMessage: {
          fromUserId: "user-1",
          text: "Hello!",
          createdAt: "2025-01-01T00:00:00Z",
        },
      };
      expect(() =>
        Schema.decodeUnknownSync(Match)(matchWithMessage),
      ).not.toThrow();
    });

    it("should accept a likeMessage with mediaUrl", () => {
      const matchWithMessage = {
        ...validMatch,
        likeMessage: {
          fromUserId: "user-1",
          mediaUrl: "https://example.com/photo.jpg",
          createdAt: "2025-01-01T00:00:00Z",
        },
      };
      expect(() =>
        Schema.decodeUnknownSync(Match)(matchWithMessage),
      ).not.toThrow();
    });

    it("should accept a likeMessage with both text and mediaUrl", () => {
      const matchWithMessage = {
        ...validMatch,
        likeMessage: {
          fromUserId: "user-1",
          text: "Hey!",
          mediaUrl: "https://example.com/photo.jpg",
          createdAt: "2025-01-01T00:00:00Z",
        },
      };
      expect(() =>
        Schema.decodeUnknownSync(Match)(matchWithMessage),
      ).not.toThrow();
    });

    it("should reject likeMessage with missing fromUserId", () => {
      const invalid = {
        ...validMatch,
        likeMessage: {
          text: "Hello",
          createdAt: "2025-01-01T00:00:00Z",
        },
      };
      expect(() => Schema.decodeUnknownSync(Match)(invalid)).toThrow();
    });
  });

  describe("GetPotentialMatchesResponse", () => {
    it("should decode response with user array", () => {
      const validUser = {
        id: "user-1",
      };
      const result = Schema.decodeUnknownSync(GetPotentialMatchesResponse)({
        potentialMatches: [validUser],
      });
      expect(result.potentialMatches).toHaveLength(1);
      expect(result.potentialMatches[0].id).toBe("user-1");
    });

    it("should decode response with empty array", () => {
      const result = Schema.decodeUnknownSync(GetPotentialMatchesResponse)({
        potentialMatches: [],
      });
      expect(result.potentialMatches).toHaveLength(0);
    });
  });

  describe("GetMatchListResponse", () => {
    it("should decode response with empty matches", () => {
      const result = Schema.decodeUnknownSync(GetMatchListResponse)({
        matches: [],
      });
      expect(result.matches).toHaveLength(0);
    });

    it("should reject response with non-array matches", () => {
      expect(() =>
        Schema.decodeUnknownSync(GetMatchListResponse)({
          matches: "invalid",
        }),
      ).toThrow();
    });
  });
});
