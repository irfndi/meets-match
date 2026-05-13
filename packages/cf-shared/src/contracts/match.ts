import { Schema } from "@effect/schema";
import { User } from "./user.js";

// --- Enums ---

export const MatchStatus = Schema.Literal("PENDING", "MATCHED", "REJECTED");
export type MatchStatus = typeof MatchStatus.Type;

export const MatchAction = Schema.Literal("LIKE", "DISLIKE", "SKIP", "NONE");
export type MatchAction = typeof MatchAction.Type;

// --- Main Match Type ---

export const Match = Schema.Struct({
  id: Schema.String,
  user1Id: Schema.String,
  user2Id: Schema.String,
  status: Schema.optional(MatchStatus),
  score: Schema.optional(Schema.Number),
  createdAt: Schema.optional(Schema.String), // ISO 8601
  updatedAt: Schema.optional(Schema.String),
  matchedAt: Schema.optional(Schema.String),
  user1Action: Schema.optional(MatchAction),
  user2Action: Schema.optional(MatchAction),
});
export type Match = typeof Match.Type;

// --- Request/Response Types ---

export const GetPotentialMatchesRequest = Schema.Struct({
  userId: Schema.String,
  limit: Schema.optional(Schema.Number),
});
export type GetPotentialMatchesRequest = typeof GetPotentialMatchesRequest.Type;

export const GetPotentialMatchesResponse = Schema.Struct({
  potentialMatches: Schema.Array(User),
});
export type GetPotentialMatchesResponse = typeof GetPotentialMatchesResponse.Type;

export const LikeMatchRequest = Schema.Struct({
  matchId: Schema.String,
  userId: Schema.String,
});
export type LikeMatchRequest = typeof LikeMatchRequest.Type;

export const LikeMatchResponse = Schema.Struct({
  isMutual: Schema.Boolean,
  match: Match,
});
export type LikeMatchResponse = typeof LikeMatchResponse.Type;

export const DislikeMatchRequest = Schema.Struct({
  matchId: Schema.String,
  userId: Schema.String,
});
export type DislikeMatchRequest = typeof DislikeMatchRequest.Type;

export const DislikeMatchResponse = Schema.Struct({
  match: Match,
});
export type DislikeMatchResponse = typeof DislikeMatchResponse.Type;

export const SkipMatchRequest = Schema.Struct({
  matchId: Schema.String,
  userId: Schema.String,
});
export type SkipMatchRequest = typeof SkipMatchRequest.Type;

export const SkipMatchResponse = Schema.Struct({
  match: Match,
});
export type SkipMatchResponse = typeof SkipMatchResponse.Type;

export const GetMatchListRequest = Schema.Struct({
  userId: Schema.String,
  status: Schema.optional(MatchStatus),
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
});
export type GetMatchListRequest = typeof GetMatchListRequest.Type;

export const GetMatchListResponse = Schema.Struct({
  matches: Schema.Array(Match),
});
export type GetMatchListResponse = typeof GetMatchListResponse.Type;

export const GetMatchRequest = Schema.Struct({
  matchId: Schema.String,
});
export type GetMatchRequest = typeof GetMatchRequest.Type;

export const GetMatchResponse = Schema.Struct({
  match: Match,
});
export type GetMatchResponse = typeof GetMatchResponse.Type;

export const CreateMatchRequest = Schema.Struct({
  user1Id: Schema.String,
  user2Id: Schema.String,
});
export type CreateMatchRequest = typeof CreateMatchRequest.Type;

export const CreateMatchResponse = Schema.Struct({
  match: Match,
});
export type CreateMatchResponse = typeof CreateMatchResponse.Type;

// --- Service Interface ---

export interface MatchService {
  readonly getPotentialMatches: (req: GetPotentialMatchesRequest) => Promise<GetPotentialMatchesResponse>;
  readonly likeMatch: (req: LikeMatchRequest) => Promise<LikeMatchResponse>;
  readonly dislikeMatch: (req: DislikeMatchRequest) => Promise<DislikeMatchResponse>;
  readonly skipMatch: (req: SkipMatchRequest) => Promise<SkipMatchResponse>;
  readonly getMatchList: (req: GetMatchListRequest) => Promise<GetMatchListResponse>;
  readonly getMatch: (req: GetMatchRequest) => Promise<GetMatchResponse>;
  readonly createMatch: (req: CreateMatchRequest) => Promise<CreateMatchResponse>;
}

export const MatchService = Schema.Tag<MatchService>("MatchService");
