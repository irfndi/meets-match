import type { MyContext } from '../types.js';

const WELCOME_MESSAGE = `
👋 Welcome to MeetMatch!

I'm your personal matchmaking assistant. I'll help you find people with similar interests near you.

To get started:
1️⃣ Set up your profile with /profile
2️⃣ Start matching with /match
3️⃣ View your matches with /matches

Need help? Just type /help anytime.
`;

export const startCommand = async (ctx: MyContext): Promise<void> => {
  await ctx.reply(WELCOME_MESSAGE);
};
