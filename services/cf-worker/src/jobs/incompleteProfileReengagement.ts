import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-worker");

const MIN_ACCOUNT_DAYS = 3;
const COOLDOWN_DAYS = 2;
const BATCH_SIZE = 100;

interface IncompleteUser {
  id: string;
  first_name: string | null;
  language: string | null;
  created_at: string | null;
  last_reminded_at: string | null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&");
}

const MESSAGE_VARIANTS = [
  (name: string) =>
    `Hey ${name}! Your profile is almost ready. Finish it up to start finding matches! 💕`,
  (name: string) =>
    `${name}, you're so close! Complete your profile and unlock your first match ✨`,
  (name: string) =>
    `Don't leave us hanging, ${name}! Finish your profile and see who's waiting for you 👀`,
  (name: string) =>
    `Hey ${name}, other people are matching right now. Complete your profile to join in! 🔥`,
  (name: string) =>
    `${name}, your perfect match is waiting! Just finish a few more profile details 💘`,
  (name: string) =>
    `Quick one, ${name} — complete your profile and we'll show you your first match! 🎁`,
];

function pickVariant(): (name: string) => string {
  const idx = Math.floor(Math.random() * MESSAGE_VARIANTS.length);
  return MESSAGE_VARIANTS[idx];
}

export async function runIncompleteProfileReengagementJob(
  env: Env,
): Promise<void> {
  log.info("incompleteProfileReengagement", "Starting job");

  const minCreatedDate = new Date();
  minCreatedDate.setDate(minCreatedDate.getDate() - MIN_ACCOUNT_DAYS);

  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, first_name, language, created_at, last_reminded_at FROM users
       WHERE is_active = 1
         AND is_sleeping = 0
         AND is_profile_complete = 0
         AND created_at <= ?
         AND (last_reminded_at IS NULL OR last_reminded_at <= ?)
       LIMIT ?`,
    )
      .bind(minCreatedDate.toISOString(), cooldownDate.toISOString(), BATCH_SIZE)
      .all();

    const candidates = (results ?? []) as Array<Record<string, unknown>>;
    log.info("incompleteProfileReengagement", `Found ${candidates.length} candidates`);

    for (const user of candidates) {
      const userId = String(user.id);
      const firstName = user.first_name ? String(user.first_name) : null;
      const lang = (String(user.language || "en") as "en" | "id") || "en";

      try {
        const variant = pickVariant();
        const displayName = firstName
          ? escapeMarkdown(firstName)
          : lang === "id"
            ? "Kamu"
            : "There";
        const message = variant(displayName);

        const response = await env.API_SERVICE.fetch(
          new Request("http://api/notifications", {
            method: "POST",
            body: JSON.stringify({
              userId,
              type: "INCOMPLETE_PROFILE",
              channel: "TELEGRAM",
              payload: JSON.stringify({
                message,
                action: "complete_profile",
                language: lang,
              }),
            }),
            headers: { "Content-Type": "application/json" },
          }),
        );

        if (response.ok) {
          await env.DB.prepare(
            "UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
            .bind(userId)
            .run();
          log.info("incompleteProfileReengagement", `Sent to ${userId}`);
        } else {
          log.error(
            "incompleteProfileReengagement",
            `Failed to enqueue for ${userId}`,
            { status: response.status },
          );
        }
      } catch (error) {
        log.error("incompleteProfileReengagement", `Error for ${userId}`, undefined, error);
      }
    }

    log.info("incompleteProfileReengagement", "Job complete");
  } catch (error) {
    log.error("incompleteProfileReengagement", "Job failed", undefined, error);
    throw error;
  }
}
