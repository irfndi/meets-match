import type { MyContext } from "../types.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { getVersionInfo } from "../lib/version.js";
import { formatDuration } from "@meetsmatch/cf-shared";
import { t, type Language } from "../lib/i18n.js";
import { replyWithError } from "../lib/error-feedback.js";
import type { Env } from "../index.js";

export const helpCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  try {
    let lang: Language = "en";
    if (ctx.from) {
      try {
        const res = await env.API_SERVICE.fetch(
          new Request(`http://api/users/${ctx.from.id}`, { method: "GET" }),
        );
        if (res.ok) {
          const data = (await res.json()) as { user?: { language?: string } };
          lang = (data.user?.language as Language) ?? "en";
        }
      } catch {
        // ignore, fallback to en
      }
    }
    const msg = [
      t("helpTitle", lang),
      "",
      t("helpCommands", lang),
      "",
      t("helpTips", lang),
      "",
      t("helpContact", lang),
    ].join("\n");

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    await replyWithError(ctx, env, "en", { command: "help" });
  }
};

export const aboutCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  try {
    let lang: Language = "en";
    if (ctx.from) {
      try {
        const res = await env.API_SERVICE.fetch(
          new Request(`http://api/users/${ctx.from.id}`, { method: "GET" }),
        );
        if (res.ok) {
          const data = (await res.json()) as { user?: { language?: string } };
          lang = (data.user?.language as Language) ?? "en";
        }
      } catch {
        // ignore, fallback to en
      }
    }
    const { version, environment, builtAt } = getVersionInfo();
    const serverAge = formatDuration(builtAt);

    const msg = [
      t("aboutTitle", lang),
      "",
      t("aboutDescription", lang),
      "",
      t("aboutBuiltWith", lang),
      "",
      t("aboutVersion", lang, { version }),
      t("aboutEnvironment", lang, { environment }),
      t("aboutLastUpdated", lang, { builtAt }),
      t("aboutServerAge", lang, { serverAge }),
    ].join("\n");

    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    await replyWithError(ctx, env, "en", { command: "about" });
  }
};
