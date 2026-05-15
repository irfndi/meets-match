import {
  Array,
  Boolean,
  Literal,
  Number,
  String,
  Struct,
  optional,
} from "effect/Schema";
import { User } from "./user.js";

// --- Enums ---

export const MatchStatus = Literal("PENDING", "MATCHED", "REJECTED");
export type MatchStatus = typeof MatchStatus.Type;

export const MatchAction = Literal("LIKE", "DISLIKE", "SKIP", "NONE");
export type MatchAction = typeof MatchAction.Type;

// --- Main Match Type ---

export const Match = Struct({
  id: String,
  user1Id: String,
  user2Id: String,
  status: optional(MatchStatus),
  score: optional(Number),
  createdAt: optional(String), // ISO 8601
  updatedAt: optional(String),
  matchedAt: optional(String),
  user1Action: optional(MatchAction),
  user2Action: optional(MatchAction),
  likeMessage: optional(
    Struct({
      fromUserId: String,
      text: optional(String),
      mediaUrl: optional(String),
      createdAt: String,
    }),
  ),
});
export type Match = typeof Match.Type;

// --- Request/Response Types ---

export const GetPotentialMatchesRequest = Struct({
  userId: String,
  limit: optional(Number),
});
export type GetPotentialMatchesRequest = typeof GetPotentialMatchesRequest.Type;

export const GetPotentialMatchesResponse = Struct({
  potentialMatches: Array(User),
});
export type GetPotentialMatchesResponse =
  typeof GetPotentialMatchesResponse.Type;

export const LikeMatchRequest = Struct({
  matchId: String,
  userId: String,
});
export type LikeMatchRequest = typeof LikeMatchRequest.Type;

export const LikeMatchResponse = Struct({
  isMutual: Boolean,
  match: Match,
});
export type LikeMatchResponse = typeof LikeMatchResponse.Type;

export const DislikeMatchRequest = Struct({
  matchId: String,
  userId: String,
});
export type DislikeMatchRequest = typeof DislikeMatchRequest.Type;

export const DislikeMatchResponse = Struct({
  match: Match,
});
export type DislikeMatchResponse = typeof DislikeMatchResponse.Type;

export const SkipMatchRequest = Struct({
  matchId: String,
  userId: String,
});
export type SkipMatchRequest = typeof SkipMatchRequest.Type;

export const SkipMatchResponse = Struct({
  match: Match,
});
export type SkipMatchResponse = typeof SkipMatchResponse.Type;

export const GetMatchListRequest = Struct({
  userId: String,
  status: optional(MatchStatus),
  limit: optional(Number),
  offset: optional(Number),
});
export type GetMatchListRequest = typeof GetMatchListRequest.Type;

export const GetMatchListResponse = Struct({
  matches: Array(Match),
});
export type GetMatchListResponse = typeof GetMatchListResponse.Type;

export const GetMatchRequest = Struct({
  matchId: String,
});
export type GetMatchRequest = typeof GetMatchRequest.Type;

export const GetMatchResponse = Struct({
  match: Match,
});
export type GetMatchResponse = typeof GetMatchResponse.Type;

export const CreateMatchRequest = Struct({
  user1Id: String,
  user2Id: String,
});
export type CreateMatchRequest = typeof CreateMatchRequest.Type;

export const CreateMatchResponse = Struct({
  match: Match,
});
export type CreateMatchResponse = typeof CreateMatchResponse.Type;

// --- Service Interface ---

export interface MatchService {
  readonly getPotentialMatches: (
    req: GetPotentialMatchesRequest,
  ) => Promise<GetPotentialMatchesResponse>;
  readonly likeMatch: (req: LikeMatchRequest) => Promise<LikeMatchResponse>;
  readonly dislikeMatch: (
    req: DislikeMatchRequest,
  ) => Promise<DislikeMatchResponse>;
  readonly skipMatch: (req: SkipMatchRequest) => Promise<SkipMatchResponse>;
  readonly getMatchList: (
    req: GetMatchListRequest,
  ) => Promise<GetMatchListResponse>;
  readonly getMatch: (req: GetMatchRequest) => Promise<GetMatchResponse>;
  readonly createMatch: (
    req: CreateMatchRequest,
  ) => Promise<CreateMatchResponse>;
}
