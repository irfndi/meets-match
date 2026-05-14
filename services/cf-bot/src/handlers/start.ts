import type { MyContext } from '../types.js';
import type { Env } from '../index.js';
import { ApiServiceClient } from '../services/api-client.js';

const WELCOME_MESSAGE = `
👋 Welcome to MeetMatch!

I'm your personal matchmaking assistant. I'll help you find people with similar interests near you.

To get started:
1️⃣ Set up your profile with /profile
2️⃣ Start matching with /match
3️⃣ View your matches with /matches

Need help? Just type /help anytime.
`;

export const startCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply(WELCOME_MESSAGE);
    return;
  }

  try {
    const client = new ApiServiceClient(env.API_SERVICE);
    await client.createUser({
      user: {
        id: String(ctx.from.id),
        username: ctx.from.username ?? undefined,
        displayName: ctx.from.first_name,
        isActive: true,
      },
    });
  } catch (error) {
    console.error('Failed to create user on /start:', error);
  }

  await ctx.reply(WELCOME_MESSAGE);
};
