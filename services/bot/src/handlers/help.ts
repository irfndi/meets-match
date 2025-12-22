import { Effect } from 'effect';
import type { Context } from 'grammy';

import { mainMenuKeyboard } from '../ui/keyboards.js';

export const HELP_MESSAGE = `
🤖 *MeetMatch Bot Help*

*Basic Commands:*
/start - Start the bot and register
/help - Show this help message
/profile - View and edit your profile
/match - Find new matches
/matches - View your current matches
/settings - Adjust your preferences

*Profile Commands:*
/name - Set your name
/age - Set your age
/gender - Set your gender
/bio - Set your bio
/interests - Set your interests
/location - Set your location

Need more help? Contact support at @MeetMatchSupport
`;

export const ABOUT_MESSAGE = `
*About MeetMatch*

MeetMatch is an AI-powered matchmaking bot that helps you find people with similar interests near you.

*How it works:*
1. Create your profile
2. Set your preferences
3. Get matched with compatible people
4. Connect with matches

*Privacy:*
- Your data is secure and never shared with third parties
- You control what information is visible to others
- You can delete your account at any time with /delete

*Version:* 3.0
*Created by:* MeetMatch Team
`;

const replyWithMarkdown = (ctx: Context, message: string) =>
  Effect.tryPromise({
    try: () =>
      ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(),
      }),
    catch: (error) => error as Error,
  });

export const helpCommand = (ctx: Context) =>
  Effect.runPromise(replyWithMarkdown(ctx, HELP_MESSAGE));

export const aboutCommand = (ctx: Context) =>
  Effect.runPromise(replyWithMarkdown(ctx, ABOUT_MESSAGE));
