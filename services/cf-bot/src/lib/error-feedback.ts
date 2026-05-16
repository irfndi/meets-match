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
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");

export interface ErrorContext {
  command?: string;
  action?: string;
  targetUserId?: string;
  extra?: string;
}

export async function replyWithError(
  ctx: MyContext,
  env: Env,
  lang: Language = "en",
  context?: ErrorContext,
): Promise<void> {
  const userId = ctx.from ? String(ctx.from.id) : "unknown";
  const traceId = generateTraceId();

  // Record error in journey
  await recordJourneyError(env.KV, userId, traceId);

  // Build contextual message
  const parts: string[] = [t("genericError", lang)];
  if (context?.command) {
    parts.push(`\n📍 Command: /${context.command}`);
  }
  if (context?.action) {
    parts.push(`🎬 Action: ${context.action}`);
  }
  parts.push(`\n🔍 Trace ID: \`${traceId}\``);
  parts.push(
    `\nIf this keeps happening, tap *Report* below and tell us what you were doing.`,
  );

  const keyboard = new InlineKeyboard()
    .text("🐛 Report Issue", `report_error:${traceId}`)
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(parts.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleErrorReportCallback(
  ctx: MyContext,
  env: Env,
  traceId: string,
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);

  try {
    const journey = await getJourney(env.KV, userId);
    const journeyText = formatJourneyForReport(journey);

    const reportText = [
      `🐛 *Error Report*`,
      ``,
      `*User:* ${userId}`,
      `*Trace ID:* \`${traceId}\``,
      `*Time:* ${new Date().toISOString()}`,
      ``,
      `*Recent Journey:*`,
      "```",
      journeyText,
      "```",
    ].join("\n");

    // Send to bot owner / admin channel if configured
    const adminChatId = env.ADMIN_CHAT_ID;
    if (adminChatId) {
      await ctx.api.sendMessage(adminChatId, reportText, {
        parse_mode: "MarkdownV2",
      });
    }

    // Also log it server-side
    log.error("errorReport", `User ${userId} reported error ${traceId}`, {
      userId,
      traceId,
      journey: journey.events,
    });

    await ctx.answerCallbackQuery("Report sent. Thank you!").catch(() => {});
    await ctx.reply("✅ Report sent! We'll look into it.", {
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    log.error("handleErrorReport", "Failed to send report", { userId }, error);
    await ctx
      .answerCallbackQuery("❌ Could not send report. Please try again.")
      .catch(() => {});
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
