import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import {
  getJourney,
  recordJourneyError,
  generateTraceId,
  formatJourneyForReport,
  recordJourneyEvent,
} from "./journey.js";
import { getMainMenuKeyboard } from "./main-menu.js";
import { t, type Language } from "./i18n.js";
import { getVersionInfo } from "./version.js";
import { createLogger } from "@meetsmatch/cf-shared";
import {
  classifySeverity,
  buildErrorSource,
  sendImmediateAlert,
  queueAlert,
} from "./admin-alerts.js";

const log = createLogger("cf-bot");

export function isBotBlockedError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("403: Forbidden: bot was blocked by the user") ||
      error.message.includes("Forbidden: bot was blocked by the user")
    );
  }
  return false;
}

/**
 * Detects permanent Telegram delivery failures that should never be retried.
 * These happen when the user deleted their account, blocked the bot,
 * or never started a chat with the bot.
 */
export function isPermanentDeliveryError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("chat not found") ||
      msg.includes("bot was blocked by the user") ||
      msg.includes("user is deactivated") ||
      msg.includes("forbidden: bot was blocked")
    );
  }
  return false;
}

export interface ErrorContext {
  command?: string;
  action?: string;
  targetUserId?: string;
  extra?: string;
  userTier?: string;
  userLanguage?: string;
}

interface ErrorReportPayload {
  reporterId: string;
  traceId: string;
  message: string;
  journey: string;
  severity: "high" | "low";
  source: string;
  botVersion: string;
  apiVersion: string;
  errorStack?: string;
  userLanguage?: string;
  userTier?: string;
  triggerInput?: string;
  kvSession?: string;
  cfMetadata?: string;
}

/** Fetch API version via service binding (lightweight health check). */
async function fetchApiVersion(env: Env): Promise<string> {
  try {
    const res = await env.API_SERVICE.fetch(new Request("http://api/health"));
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const version = (data.version as Record<string, string> | undefined)
        ?.version;
      if (version) return version;
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** Build the enriched error report payload. */
async function buildErrorReportPayload(
  ctx: MyContext,
  env: Env,
  traceId: string,
  context: ErrorContext | undefined,
  error: unknown,
): Promise<ErrorReportPayload> {
  const userId = ctx.from ? String(ctx.from.id) : "unknown";
  const source = buildErrorSource(context);
  const severity = classifySeverity(context);

  // Versions
  const botVersion = getVersionInfo().version;
  const apiVersion = await fetchApiVersion(env);

  // Trigger input
  const triggerInput =
    ctx.message?.text ??
    (ctx.callbackQuery?.data
      ? `callback:${ctx.callbackQuery.data}`
      : undefined);

  // User context
  const userLanguage =
    context?.userLanguage ?? ctx.from?.language_code ?? undefined;
  const userTier = context?.userTier ?? undefined;

  // Stack trace
  const errorStack = error instanceof Error ? error.stack : String(error);

  // KV session snapshot
  let kvSession: string | undefined;
  try {
    const sessionKey = `session:${userId}`;
    const sessionRaw = await env.KV.get(sessionKey);
    if (sessionRaw) {
      kvSession = sessionRaw;
    }
  } catch {
    /* ignore */
  }

  // Journey
  const journey = await getJourney(env.KV, userId);
  const journeyText = formatJourneyForReport(journey);

  // Build report text for admin / message field
  const isUserSubmitted =
    error instanceof Error &&
    (error as Error & { code?: string }).code === "USER_SUBMITTED_REPORT";
  const reportLines = [
    t(isUserSubmitted ? "errorFeedbackTitle" : "errorReportTitle", "en"),
    "",
    `🤖 *Bot:* \`${botVersion}\``,
    `🔗 *API:* \`${apiVersion}\``,
    `🎯 *Source:* ${source}`,
    `⚡ *Severity:* ${severity}`,
    "",
    t("errorReportUser", "en", { userId }),
    t("errorReportTraceId", "en", { traceId }),
    t("errorReportTime", "en", { time: new Date().toISOString() }),
  ];
  if (userLanguage) reportLines.push(`🌐 *Language:* ${userLanguage}`);
  if (userTier) reportLines.push(`👑 *Tier:* ${userTier}`);
  if (triggerInput) reportLines.push(`📝 *Trigger:* \`${triggerInput}\``);
  reportLines.push(
    "",
    t("errorReportJourney", "en"),
    "```",
    journeyText || t("errorReportNoActivity", "en"),
    "```",
  );
  if (errorStack) {
    reportLines.push("", "*Stack:*", "```", errorStack.slice(0, 2000), "```");
  }

  return {
    reporterId: userId,
    traceId,
    message: reportLines.join("\n"),
    journey: journeyText,
    severity: severity === "high" ? "high" : "low",
    source,
    botVersion,
    apiVersion,
    errorStack,
    userLanguage,
    userTier,
    triggerInput,
    kvSession,
  };
}

export async function replyWithError(
  ctx: MyContext,
  env: Env,
  lang: Language = "en",
  context?: ErrorContext,
  error?: unknown,
): Promise<void> {
  const userId = ctx.from ? String(ctx.from.id) : "unknown";
  const traceId = generateTraceId();
  const source = buildErrorSource(context);
  const severity = classifySeverity(context);

  // Write error metric to Analytics Engine (fire-and-forget, no await)
  env.ANALYTICS?.writeDataPoint({
    blobs: [
      source,
      severity,
      context?.userTier ?? "unknown",
      context?.userLanguage ?? "unknown",
    ],
    doubles: [1, Date.now()],
    indexes: [userId],
  });

  // Record error in journey
  await recordJourneyError(env.KV, userId, traceId);

  // Build enriched payload for background submission
  const payloadPromise = buildErrorReportPayload(
    ctx,
    env,
    traceId,
    context,
    error ?? new Error("replyWithError called without error"),
  );

  // Admin alerting (skip for silent/expected errors like 403 bot blocked)
  if (severity !== "silent") {
    payloadPromise.then((payload) => {
      const alertPayload = {
        traceId,
        userId,
        source,
        severity,
        message: `Error in ${source} for user ${userId} (bot:${payload.botVersion} api:${payload.apiVersion})`,
      };
      if (severity === "high") {
        sendImmediateAlert(env, alertPayload).catch(() => {});
      } else {
        queueAlert(env, alertPayload).catch(() => {});
      }
    });
  }

  // Build contextual message
  const parts: string[] = [t("genericError", lang)];
  if (context?.command) {
    parts.push(t("errorCommandContext", lang, { command: context.command }));
  }
  if (context?.action) {
    parts.push(t("errorActionContext", lang, { action: context.action }));
  }
  parts.push(t("errorTraceId", lang, { traceId }));
  parts.push(t("errorReportPrompt", lang));

  const keyboard = new InlineKeyboard()
    .text(t("errorReportButton", lang), `report_error:${traceId}`)
    .row()
    .text(t("errorMainMenuButton", lang), "menu:main");

  try {
    await ctx.reply(parts.join("\n"), {
      reply_markup: keyboard,
    });
  } catch (err) {
    if (isBotBlockedError(err)) {
      log.info("replyWithError", "User blocked bot, skipping error reply", {
        userId,
      });
      return;
    }
    throw err;
  }
}

export async function handleErrorReportCallback(
  ctx: MyContext,
  env: Env,
  traceId: string,
  lang: Language = "en",
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);

  try {
    // Re-build enriched payload with callback context
    const payload = await buildErrorReportPayload(
      ctx,
      env,
      traceId,
      { action: "error_report_callback" },
      Object.assign(new Error("User-submitted error report"), {
        code: "USER_SUBMITTED_REPORT",
      }),
    );

    // Persist to database via API
    const apiResponse = await env.API_SERVICE.fetch(
      new Request("http://api/error-reports", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );

    if (!apiResponse.ok) {
      log.error("handleErrorReport", "API failed to store report", {
        userId,
        status: apiResponse.status,
      });
      await ctx
        .answerCallbackQuery(t("errorReportFailed", lang))
        .catch(() => {});
      await ctx.reply(t("errorReportFailed", lang), {
        reply_markup: getMainMenuKeyboard(),
      });
      return;
    }

    // Send to bot owner / admin channel if configured
    const adminChatId = env.ADMIN_CHAT_ID;
    if (adminChatId) {
      await ctx.api.sendMessage(adminChatId, payload.message).catch(() => {});
    }

    // Also log it server-side
    log.error("errorReport", `User ${userId} reported error ${traceId}`, {
      userId,
      traceId,
      botVersion: payload.botVersion,
      apiVersion: payload.apiVersion,
    });

    await ctx
      .answerCallbackQuery(t("errorReportThankYou", lang))
      .catch(() => {});
    await ctx.reply(t("errorReportSent", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    log.error("handleErrorReport", "Failed to send report", { userId }, error);
    await ctx.answerCallbackQuery(t("errorReportFailed", lang)).catch(() => {});
  }
}

export async function recordCommandJourney(
  ctx: MyContext,
  env: Env,
  command: string,
  detail?: string,
): Promise<void> {
  if (!ctx.from) return;
  await recordJourneyEvent(env.KV, String(ctx.from.id), {
    action: `cmd/${command}`,
    detail,
  });
}

export async function recordActionJourney(
  ctx: MyContext,
  env: Env,
  action: string,
  targetId?: string,
): Promise<void> {
  if (!ctx.from) return;
  await recordJourneyEvent(env.KV, String(ctx.from.id), {
    action,
    targetId,
  });
}
