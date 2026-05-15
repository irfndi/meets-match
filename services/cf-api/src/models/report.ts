import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import { DatabaseError } from "@meetsmatch/cf-shared";

export interface CreateReportRequest {
  reporterId: string;
  reportedId: string;
  reason?: string;
  mediaUrl?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string | null;
  mediaUrl: string | null;
  status: "pending" | "reviewed" | "dismissed" | "actioned";
  createdAt: string;
}

export class ReportRepository {
  constructor(private readonly db: D1Database) {}

  create(
    req: CreateReportRequest,
  ): Effect.Effect<Report, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db
          .prepare(
            `INSERT INTO reports (id, reporter_id, reported_id, reason, media_url, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
          )
          .bind(
            id,
            req.reporterId,
            req.reportedId,
            req.reason ?? null,
            req.mediaUrl ?? null,
          )
          .run();
        return {
          id,
          reporterId: req.reporterId,
          reportedId: req.reportedId,
          reason: req.reason ?? null,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        };
      },
      catch: (error) => new DatabaseError("createReport", error),
    });
  }
}
