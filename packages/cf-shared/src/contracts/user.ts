import { Array, Boolean, Literal, Number, String, Struct, optional } from "effect/Schema";

// --- Enums ---

export const Gender = Literal("male", "female", "other", "prefer_not_to_say");
export type Gender = typeof Gender.Type;

// --- Nested Types ---

export const Location = Struct({
  latitude: Number,
  longitude: Number,
  city: optional(String),
  country: optional(String),
  lastUpdated: optional(String), // ISO 8601
});
export type Location = typeof Location.Type;

export const Preferences = Struct({
  minAge: optional(Number),
  maxAge: optional(Number),
  genderPreference: optional(Array(String)),
  relationshipType: optional(Array(String)),
  maxDistance: optional(Number),
  notificationsEnabled: optional(Boolean),
  preferredLanguage: optional(String),
  preferredCountry: optional(String),
  premiumTier: optional(String),
});
export type Preferences = typeof Preferences.Type;

// --- Main User Type ---

export const User = Struct({
  id: String,
  username: optional(String),
  displayName: optional(String),
  lastName: optional(String),
  bio: optional(String),
  age: optional(Number),
  gender: optional(Gender),
  interests: optional(Array(String)),
  photos: optional(Array(String)),
  location: optional(Location),
  preferences: optional(Preferences),
  isActive: optional(Boolean),
  isSleeping: optional(Boolean),
  isProfileComplete: optional(Boolean),
  createdAt: optional(String), // ISO 8601
  updatedAt: optional(String),
  lastActive: optional(String),
});
export type User = typeof User.Type;

// --- Request/Response Types ---

export const GetUserRequest = Struct({
  userId: String,
});
export type GetUserRequest = typeof GetUserRequest.Type;

export const GetUserResponse = Struct({
  user: User,
});
export type GetUserResponse = typeof GetUserResponse.Type;

export const CreateUserRequest = Struct({
  user: User,
});
export type CreateUserRequest = typeof CreateUserRequest.Type;

export const CreateUserResponse = Struct({
  user: User,
});
export type CreateUserResponse = typeof CreateUserResponse.Type;

export const UpdateUserRequest = Struct({
  userId: String,
  user: User,
  updateMask: optional(Array(String)),
});
export type UpdateUserRequest = typeof UpdateUserRequest.Type;

export const UpdateUserResponse = Struct({
  user: User,
});
export type UpdateUserResponse = typeof UpdateUserResponse.Type;

export const UpdateLastActiveRequest = Struct({
  userId: String,
});
export type UpdateLastActiveRequest = typeof UpdateLastActiveRequest.Type;

export const UpdateLastActiveResponse = Struct({
  success: Boolean,
});
export type UpdateLastActiveResponse = typeof UpdateLastActiveResponse.Type;

export const UpdateLastRemindedAtRequest = Struct({
  userId: String,
});
export type UpdateLastRemindedAtRequest = typeof UpdateLastRemindedAtRequest.Type;

export const UpdateLastRemindedAtResponse = Struct({
  success: Boolean,
});
export type UpdateLastRemindedAtResponse = typeof UpdateLastRemindedAtResponse.Type;

// --- Service Interface (for Service Bindings) ---

export interface UserService {
  readonly getUser: (req: GetUserRequest) => Promise<GetUserResponse>;
  readonly createUser: (req: CreateUserRequest) => Promise<CreateUserResponse>;
  readonly updateUser: (req: UpdateUserRequest) => Promise<UpdateUserResponse>;
  readonly updateLastActive: (req: UpdateLastActiveRequest) => Promise<UpdateLastActiveResponse>;
  readonly updateLastRemindedAt: (req: UpdateLastRemindedAtRequest) => Promise<UpdateLastRemindedAtResponse>;
}


