import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import { DatabaseError } from "@meetsmatch/cf-shared";

export interface CreateFeedbackRequest {
  userId: string;
  type?: string;
  message?: string;
  mediaUrl?: string;
}

export interface Feedback {
  id: string;
  userId: string;
  type: string;
  message: string | null;
  mediaUrl: string | null;
  status: "open" | "reviewed" | "resolved" | "dismissed";
  createdAt: string;
}

export class FeedbackRepository {
  constructor(private readonly db: D1Database) {}

  create(req: CreateFeedbackRequest): Effect.Effect<Feedback, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db
          .prepare(
            `INSERT INTO feedback (id, user_id, type, message, media_url, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)`
          )
          .bind(id, req.userId, req.type ?? "bug", req.message ?? null, req.mediaUrl ?? null)
          .run();
        return {
          id,
          userId: req.userId,
          type: req.type ?? "bug",
          message: req.message ?? null,
          mediaUrl: req.mediaUrl ?? null,
          status: "open" as const,
          createdAt: new Date().toISOString(),
        };
      },
      catch: (error) => new DatabaseError("createFeedback", error),
    });
  }
}
