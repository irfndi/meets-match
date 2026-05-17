import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";
import { escapeMarkdownV2 } from "./i18n.js";
import type { ErrorContext } from "./error-feedback.js";

const log = createLogger("cf-bot");

/** High-severity sources that should trigger immediate admin alerts */
const HIGH_SEVERITY_SOURCES = new Set([
  // Payment / gift failures
  "gift_payment",
  "gift_premium_payment",
  "premium_purchase",
  "dm_credit_purchase",
  // Core handler crashes
  "match_action",
  "rollback",
  "send_dm",
  // Data integrity issues
  "block",
  "report_conversation",
]);

/** Sources that are expected and should not alert at all */
const SILENCED_SOURCES = new Set([
  // User blocked the bot — expected, not a bug
  "callback_query",
  "text_message",
  "contact_message",
  "location_message",
  "photo_message",
  "video_message",
]);

export type Severity = "high" | "low" | "silent";

export function classifySeverity(context?: ErrorContext): Severity {
  const source = context?.action ?? context?.command ?? "unknown";

  if (SILENCED_SOURCES.has(source)) {
    return "silent";
  }
  if (HIGH_SEVERITY_SOURCES.has(source)) {
    return "high";
  }
  return "low";
}

export function buildErrorSource(context?: ErrorContext): string {
  return context?.action ?? context?.command ?? "unknown";
}

interface AlertPayload {
  traceId: string;
  userId: string;
  source: string;
  severity: Severity;
  message: string;
  journey?: string;
}

/** Send a high-severity alert to admin chat immediately */
export async function sendImmediateAlert(
  env: Env,
  payload: AlertPayload,
): Promise<void> {
  const adminChatId = env.ADMIN_CHAT_ID;
  if (!adminChatId) return;

  const text = buildAlertMessage(payload);
  try {
    // We don't have ctx.api here, so use a fetch to the bot's own send-notification endpoint
    // or use the Telegram API directly. Simpler: call the bot's internal sendMessage via service binding.
    // But we don't have a service binding to ourselves.
    // Alternative: store in D1 and let the next interaction or cron pick it up.
    // Actually, for immediate alerts we need to send now. Let's use fetch to Telegram API directly.
    await sendTelegramMessage(env, adminChatId, text);
  } catch (error) {
    log.error(
      "sendImmediateAlert",
      "Failed to send admin alert",
      { adminChatId },
      error,
    );
  }
}

/** Queue a low-severity alert to be sent in batch later */
export async function queueAlert(
  env: Env,
  payload: AlertPayload,
): Promise<void> {
  try {
    await env.API_SERVICE.fetch(
      new Request("http://api/error-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterId: payload.userId,
          traceId: payload.traceId,
          message: payload.message,
          journey: payload.journey,
          severity: payload.severity,
          source: payload.source,
        }),
      }),
    );
  } catch (error) {
    log.error(
      "queueAlert",
      "Failed to queue alert",
      { traceId: payload.traceId },
      error,
    );
  }
}

/** Send aggregated low-severity alerts to admin chat (called by cron trigger) */
export async function sendAggregatedAlerts(env: Env): Promise<void> {
  const adminChatId = env.ADMIN_CHAT_ID;
  if (!adminChatId) {
    log.warn("sendAggregatedAlerts", "ADMIN_CHAT_ID not configured, skipping");
    return;
  }

  try {
    const res = await env.API_SERVICE.fetch(
      new Request("http://api/error-reports/summary?hours=6", {
        method: "GET",
      }),
    );
    if (!res.ok) {
      log.error("sendAggregatedAlerts", "Failed to fetch alert summary", {
        status: res.status,
      });
      return;
    }

    const summary = (await res.json()) as {
      severity: string;
      count: number;
      sources: Array<{ source: string | null; count: number }>;
      latestAt: string;
    };

    if (summary.count === 0) {
      log.info("sendAggregatedAlerts", "No low-severity alerts to send");
      return;
    }

    const sourceLines = summary.sources
      .map((s) => `  • ${escapeMarkdownV2(s.source ?? "unknown")}: ${s.count}`)
      .join("\n");

    const text = [
      "📊 *Error Report Summary*",
      "",
      `*Period:* Last 6 hours`,
      `*Total low-severity errors:* ${summary.count}`,
      "",
      "*Breakdown by source:*",
      sourceLines,
      "",
      `*Latest:* ${escapeMarkdownV2(new Date(summary.latestAt).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))}`,
    ].join("\n");

    await sendTelegramMessage(env, adminChatId, text);

    // Mark all unsent low-severity alerts as sent
    const markRes = await env.API_SERVICE.fetch(
      new Request("http://api/error-reports/mark-sent", {
        method: "POST",
      }),
    );
    if (!markRes.ok) {
      log.error("sendAggregatedAlerts", "Failed to mark alerts as sent", {
        status: markRes.status,
      });
    }
  } catch (error) {
    log.error(
      "sendAggregatedAlerts",
      "Failed to send aggregated alerts",
      undefined,
      error,
    );
  }
}

function buildAlertMessage(payload: AlertPayload): string {
  const severityEmoji = payload.severity === "high" ? "🚨" : "⚠️";
  return [
    `${severityEmoji} *${payload.severity.toUpperCase()} Severity Alert*`,
    "",
    `*Source:* ${escapeMarkdownV2(payload.source)}`,
    `*User:* ${escapeMarkdownV2(payload.userId)}`,
    `*Trace ID:* \`${escapeMarkdownV2(payload.traceId)}\``,
    `*Time:* ${escapeMarkdownV2(new Date().toISOString())}`,
    "",
    escapeMarkdownV2(payload.message.slice(0, 400)),
  ].join("\n");
}

async function sendTelegramMessage(
  env: Env,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_notification: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${body}`);
  }
}
