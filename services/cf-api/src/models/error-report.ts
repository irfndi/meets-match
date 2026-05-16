import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import { DatabaseError } from "@meetsmatch/cf-shared";

export interface CreateErrorReportRequest {
  reporterId: string;
  traceId?: string;
  message?: string;
  journey?: string;
}

export interface ErrorReport {
  id: string;
  reporterId: string;
  traceId: string | null;
  message: string | null;
  journey: string | null;
  status: "pending" | "reviewed" | "dismissed";
  createdAt: string;
}

export class ErrorReportRepository {
  constructor(private readonly db: D1Database) {}

  create(
    req: CreateErrorReportRequest,
  ): Effect.Effect<ErrorReport, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db
          .prepare(
            `INSERT INTO error_reports (id, reporter_id, trace_id, message, journey, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
          )
          .bind(
            id,
            req.reporterId,
            req.traceId ?? null,
            req.message ?? null,
            req.journey ?? null,
          )
          .run();
        return {
          id,
          reporterId: req.reporterId,
          traceId: req.traceId ?? null,
          message: req.message ?? null,
          journey: req.journey ?? null,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        };
      },
      catch: (error) => new DatabaseError("createErrorReport", error),
    });
  }
}
