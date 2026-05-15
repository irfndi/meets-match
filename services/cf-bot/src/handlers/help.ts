import type { MyContext } from "../types.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { getVersionInfo } from "../lib/version.js";
import { formatDuration } from "@meetsmatch/cf-shared";
import { t } from "../lib/i18n.js";

export const helpCommand = async (ctx: MyContext): Promise<void> => {
  const msg = [
    t("helpTitle"),
    "",
    t("helpCommands"),
    "",
    t("helpTips"),
    "",
    t("helpContact"),
  ].join("\n");

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard(),
  });
};

export const aboutCommand = async (ctx: MyContext): Promise<void> => {
  const { version, environment, builtAt } = getVersionInfo();
  const serverAge = formatDuration(builtAt);

  const msg = [
    t("aboutTitle"),
    "",
    t("aboutDescription"),
    "",
    t("aboutBuiltWith"),
    "",
    t("aboutVersion", "en", { version }),
    t("aboutEnvironment", "en", { environment }),
    t("aboutLastUpdated", "en", { builtAt }),
    t("aboutServerAge", "en", { serverAge }),
  ].join("\n");

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard(),
  });
};
