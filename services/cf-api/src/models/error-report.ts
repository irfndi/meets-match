import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import { DatabaseError, NotFoundError } from "@meetsmatch/cf-shared";

export const ERROR_REPORT_STATUSES = [
  "pending",
  "reviewed",
  "dismissed",
] as const;
export type ErrorReportStatus = (typeof ERROR_REPORT_STATUSES)[number];

const ERROR_REPORT_SELECT_COLUMNS = `id, reporter_id as reporterId, trace_id as traceId, message, journey,
  status, severity, alert_sent as alertSent, source,
  bot_version as botVersion, api_version as apiVersion, worker_version as workerVersion,
  error_stack as errorStack, user_language as userLanguage, user_tier as userTier,
  trigger_input as triggerInput, kv_session as kvSession, cf_metadata as cfMetadata, created_at as createdAt`;

export interface CreateErrorReportRequest {
  reporterId: string;
  traceId?: string;
  message?: string;
  journey?: string;
  severity?: "high" | "low";
  source?: string;
  botVersion?: string;
  apiVersion?: string;
  workerVersion?: string;
  errorStack?: string;
  userLanguage?: string;
  userTier?: string;
  triggerInput?: string;
  kvSession?: string;
  cfMetadata?: string;
}

export interface ErrorReport {
  id: string;
  reporterId: string;
  traceId: string | null;
  message: string | null;
  journey: string | null;
  status: ErrorReportStatus;
  severity: "high" | "low";
  alertSent: number;
  source: string | null;
  botVersion: string | null;
  apiVersion: string | null;
  workerVersion: string | null;
  errorStack: string | null;
  userLanguage: string | null;
  userTier: string | null;
  triggerInput: string | null;
  kvSession: string | null;
  cfMetadata: string | null;
  createdAt: string;
  updatedAt?: string | null;
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
            `INSERT INTO error_reports (
              id, reporter_id, trace_id, message, journey, status,
              severity, source, bot_version, api_version, worker_version,
              error_stack, user_language, user_tier, trigger_input, kv_session, cf_metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(
            id,
            req.reporterId,
            req.traceId ?? null,
            req.message ?? null,
            req.journey ?? null,
            req.severity ?? "low",
            req.source ?? null,
            req.botVersion ?? null,
            req.apiVersion ?? null,
            req.workerVersion ?? null,
            req.errorStack ?? null,
            req.userLanguage ?? null,
            req.userTier ?? null,
            req.triggerInput ?? null,
            req.kvSession ?? null,
            req.cfMetadata ?? null,
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
          botVersion: req.botVersion ?? null,
          apiVersion: req.apiVersion ?? null,
          workerVersion: req.workerVersion ?? null,
          errorStack: req.errorStack ?? null,
          userLanguage: req.userLanguage ?? null,
          userTier: req.userTier ?? null,
          triggerInput: req.triggerInput ?? null,
          kvSession: req.kvSession ?? null,
          cfMetadata: req.cfMetadata ?? null,
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
            `SELECT ${ERROR_REPORT_SELECT_COLUMNS}
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

  findById(
    id: string,
  ): Effect.Effect<ErrorReport | null, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db
          .prepare(
            `SELECT ${ERROR_REPORT_SELECT_COLUMNS}
             FROM error_reports
             WHERE id = ?`,
          )
          .bind(id)
          .first();
        return result as unknown as ErrorReport | null;
      },
      catch: (error) => new DatabaseError("findErrorReportById", error),
    });
  }

  updateStatus(
    id: string,
    status: ErrorReportStatus,
  ): Effect.Effect<ErrorReport, DatabaseError | NotFoundError, never> {
    return Effect.tryPromise({
      try: async () => {
        const updateResult = await this.db
          .prepare(
            `UPDATE error_reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(status, id)
          .run();

        if (!updateResult || (updateResult.meta?.changes as number) === 0) {
          throw new NotFoundError("ErrorReport", id);
        }

        const updated = await this.db
          .prepare(
            `SELECT ${ERROR_REPORT_SELECT_COLUMNS}
             FROM error_reports
             WHERE id = ?`,
          )
          .bind(id)
          .first();

        if (!updated) {
          throw new DatabaseError(
            "updateErrorReportStatus",
            new Error(
              "Updated error_report row missing after successful update",
            ),
          );
        }
        return updated as unknown as ErrorReport;
      },
      catch: (error) => {
        if (error instanceof NotFoundError) return error;
        if (error instanceof DatabaseError) return error;
        return new DatabaseError("updateErrorReportStatus", error);
      },
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
