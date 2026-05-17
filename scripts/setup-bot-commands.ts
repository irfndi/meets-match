/**
 * One-time setup script to register BotFather commands.
 * Run this after deploying the bot or when commands change.
 *
 * Usage:
 *   BOT_TOKEN=<token> pnpm exec tsx scripts/setup-bot-commands.ts
 */

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Error: BOT_TOKEN environment variable is required.");
  process.exit(1);
}

const commands = [
  { command: "start", description: "Get started with MeetMatch" },
  { command: "profile", description: "View or edit your profile" },
  { command: "match", description: "Find your next match" },
  { command: "matches", description: "View your matches and likes" },
  { command: "settings", description: "Adjust match preferences" },
  { command: "premium", description: "Upgrade to Premium" },
  { command: "referral", description: "Invite friends for bonus swipes" },
  { command: "feedback", description: "Send us feedback" },
  { command: "report", description: "Report a profile" },
  { command: "help", description: "How to use MeetMatch" },
  { command: "about", description: "About MeetMatch" },
];

async function main() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to set commands: ${res.status} ${body}`);
    process.exit(1);
  }

  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) {
    console.error(
      `Failed to set commands: ${data.description ?? "unknown error"}`,
    );
    process.exit(1);
  }

  console.log("Bot commands registered successfully:");
  for (const cmd of commands) {
    console.log(`  /${cmd.command} - ${cmd.description}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
