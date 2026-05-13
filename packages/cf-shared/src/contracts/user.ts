import { Schema } from "@effect/schema";

// --- Enums ---

export const Gender = Schema.Literal("male", "female", "other", "prefer_not_to_say");
export type Gender = typeof Gender.Type;

// --- Nested Types ---

export const Location = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
  lastUpdated: Schema.optional(Schema.String), // ISO 8601
});
export type Location = typeof Location.Type;

export const Preferences = Schema.Struct({
  minAge: Schema.optional(Schema.Number),
  maxAge: Schema.optional(Schema.Number),
  genderPreference: Schema.optional(Schema.Array(Schema.String)),
  relationshipType: Schema.optional(Schema.Array(Schema.String)),
  maxDistance: Schema.optional(Schema.Number),
  notificationsEnabled: Schema.optional(Schema.Boolean),
  preferredLanguage: Schema.optional(Schema.String),
  preferredCountry: Schema.optional(Schema.String),
  premiumTier: Schema.optional(Schema.String),
});
export type Preferences = typeof Preferences.Type;

// --- Main User Type ---

export const User = Schema.Struct({
  id: Schema.String,
  username: Schema.optional(Schema.String),
  firstName: Schema.optional(Schema.String),
  lastName: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String),
  age: Schema.optional(Schema.Number),
  gender: Schema.optional(Gender),
  interests: Schema.optional(Schema.Array(Schema.String)),
  photos: Schema.optional(Schema.Array(Schema.String)),
  location: Schema.optional(Location),
  preferences: Schema.optional(Preferences),
  isActive: Schema.optional(Schema.Boolean),
  isSleeping: Schema.optional(Schema.Boolean),
  isProfileComplete: Schema.optional(Schema.Boolean),
  createdAt: Schema.optional(Schema.String), // ISO 8601
  updatedAt: Schema.optional(Schema.String),
  lastActive: Schema.optional(Schema.String),
});
export type User = typeof User.Type;

// --- Request/Response Types ---

export const GetUserRequest = Schema.Struct({
  userId: Schema.String,
});
export type GetUserRequest = typeof GetUserRequest.Type;

export const GetUserResponse = Schema.Struct({
  user: User,
});
export type GetUserResponse = typeof GetUserResponse.Type;

export const CreateUserRequest = Schema.Struct({
  user: User,
});
export type CreateUserRequest = typeof CreateUserRequest.Type;

export const CreateUserResponse = Schema.Struct({
  user: User,
});
export type CreateUserResponse = typeof CreateUserResponse.Type;

export const UpdateUserRequest = Schema.Struct({
  userId: Schema.String,
  user: User,
  updateMask: Schema.optional(Schema.Array(Schema.String)),
});
export type UpdateUserRequest = typeof UpdateUserRequest.Type;

export const UpdateUserResponse = Schema.Struct({
  user: User,
});
export type UpdateUserResponse = typeof UpdateUserResponse.Type;

export const UpdateLastActiveRequest = Schema.Struct({
  userId: Schema.String,
});
export type UpdateLastActiveRequest = typeof UpdateLastActiveRequest.Type;

export const UpdateLastActiveResponse = Schema.Struct({
  success: Schema.Boolean,
});
export type UpdateLastActiveResponse = typeof UpdateLastActiveResponse.Type;

export const UpdateLastRemindedAtRequest = Schema.Struct({
  userId: Schema.String,
});
export type UpdateLastRemindedAtRequest = typeof UpdateLastRemindedAtRequest.Type;

export const UpdateLastRemindedAtResponse = Schema.Struct({
  success: Schema.Boolean,
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

export const UserService = Schema.Tag<UserService>("UserService");
