import { Struct, String, optional } from "effect/Schema";

export const AppError = Struct({
  code: String,
  message: String,
  details: optional(String),
});
export type AppError = typeof AppError.Type;

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError";
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
  }
}

export class ValidationError extends Error {
  readonly _tag = "ValidationError";
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Validation error on ${field}: ${message}`);
    this.field = field;
  }
}

export class DatabaseError extends Error {
  readonly _tag = "DatabaseError";
  constructor(
    public readonly operation: string,
    public readonly cause: unknown,
  ) {
    super(`Database error during ${operation}`);
  }
}
