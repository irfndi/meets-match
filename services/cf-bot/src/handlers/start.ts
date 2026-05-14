import type { MyContext } from '../types.js';
import type { Env } from '../index.js';
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay } from '../lib/user-utils.js';

const WELCOME_MESSAGE = `
👋 Welcome to MeetMatch!

I'm your personal matchmaking assistant. I'll help you find people with similar interests near you.

To get started:
1️⃣ Set up your profile with /profile
2️⃣ Start matching with /match
3️⃣ View your matches with /matches

Need help? Just type /help anytime.
`;

const WELCOME_BACK_MESSAGE = `
👋 Welcome back to MeetMatch!

Ready to find your next match?
`;

export const startCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply(WELCOME_MESSAGE);
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply('❌ Sorry, there was an error setting up your profile. Please try again later.');
    return;
  }

  const { user, created } = result;

  if (created) {
    await ctx.reply(WELCOME_MESSAGE);
    return;
  }

  // Existing user — welcome back
  const { complete, missing } = getProfileCompleteness(user);

  if (!complete) {
    await ctx.reply(
      `${WELCOME_BACK_MESSAGE}\n⚠️ Your profile is incomplete. To start matching, please fill in:\n${getMissingFieldsDisplay(missing)}\n\nUse /profile to update your info.`.trim()
    );
    return;
  }

  await ctx.reply(WELCOME_BACK_MESSAGE.trim());
};
