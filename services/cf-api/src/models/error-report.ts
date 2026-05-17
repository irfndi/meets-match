import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import { DatabaseError } from "@meetsmatch/cf-shared";

export interface CreateErrorReportRequest {
  reporterId: string;
  traceId?: string;
  message?: string;
  journey?: string;
  severity?: "high" | "low";
  source?: string;
}

export interface ErrorReport {
  id: string;
  reporterId: string;
  traceId: string | null;
  message: string | null;
  journey: string | null;
  status: "pending" | "reviewed" | "dismissed";
  severity: "high" | "low";
  alertSent: number;
  source: string | null;
  createdAt: string;
}

export interface AggregatedAlert {
  severity: string;
  count: number;
  sources: Array<{ source: string | null; count: number }>;
  latestAt: string;
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
            `INSERT INTO error_reports (id, reporter_id, trace_id, message, journey, status, severity, source, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(
            id,
            req.reporterId,
            req.traceId ?? null,
            req.message ?? null,
            req.journey ?? null,
            req.severity ?? "low",
            req.source ?? null,
          )
          .run();
        return {
          id,
          reporterId: req.reporterId,
          traceId: req.traceId ?? null,
          message: req.message ?? null,
          journey: req.journey ?? null,
          status: "pending" as const,
          severity: req.severity ?? "low",
          alertSent: 0,
          source: req.source ?? null,
          createdAt: new Date().toISOString(),
        };
      },
      catch: (error) => new DatabaseError("createErrorReport", error),
    });
  }

  findUnsentLowSeverity(
    batchSize = 100,
  ): Effect.Effect<ErrorReport[], DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db
          .prepare(
            `SELECT id, reporter_id as reporterId, trace_id as traceId, message, journey,
                    status, severity, alert_sent as alertSent, source, created_at as createdAt
             FROM error_reports
             WHERE severity = 'low' AND alert_sent = 0
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .bind(batchSize)
          .all();
        return (result.results ?? []) as unknown as ErrorReport[];
      },
      catch: (error) => new DatabaseError("findUnsentLowSeverity", error),
    });
  }

  markAlertsSent(ids: string[]): Effect.Effect<void, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        if (ids.length === 0) return;
        const placeholders = ids.map(() => "?").join(",");
        await this.db
          .prepare(
            `UPDATE error_reports SET alert_sent = 1 WHERE id IN (${placeholders})`,
          )
          .bind(...ids)
          .run();
      },
      catch: (error) => new DatabaseError("markAlertsSent", error),
    });
  }

  getAlertSummary(
    hours = 6,
  ): Effect.Effect<AggregatedAlert, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const since = new Date(
          Date.now() - hours * 60 * 60 * 1000,
        ).toISOString();

        const totalResult = await this.db
          .prepare(
            `SELECT severity, COUNT(*) as count, MAX(created_at) as latestAt
             FROM error_reports
             WHERE alert_sent = 0 AND created_at > ?
             GROUP BY severity`,
          )
          .bind(since)
          .all();

        const sourceResult = await this.db
          .prepare(
            `SELECT source, COUNT(*) as count
             FROM error_reports
             WHERE alert_sent = 0 AND created_at > ?
             GROUP BY source
             ORDER BY count DESC
             LIMIT 10`,
          )
          .bind(since)
          .all();

        const rows = (totalResult.results ?? []) as Array<{
          severity: string;
          count: number;
          latestAt: string;
        }>;
        const lowRow = rows.find((r) => r.severity === "low");

        return {
          severity: "low",
          count: Number(lowRow?.count ?? 0),
          sources: (sourceResult.results ?? []) as Array<{
            source: string | null;
            count: number;
          }>,
          latestAt: lowRow?.latestAt ?? since,
        };
      },
      catch: (error) => new DatabaseError("getAlertSummary", error),
    });
  }
}
