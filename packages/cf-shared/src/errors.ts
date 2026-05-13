import { Schema } from "@effect/schema";

export const AppError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.String),
});
export type AppError = typeof AppError.Type;

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError";
  constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} not found: ${id}`);
  }
}

export class ValidationError extends Error {
  readonly _tag = "ValidationError";
  constructor(public readonly field: string, public readonly message: string) {
    super(`Validation error on ${field}: ${message}`);
  }
}

export class DatabaseError extends Error {
  readonly _tag = "DatabaseError";
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Database error during ${operation}`);
  }
}
