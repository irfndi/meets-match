import { Code, ConnectError } from '@connectrpc/connect';
import { User } from '@meetsmatch/contracts/proto/meetsmatch/v1/user_pb.js';
import { Effect } from 'effect';
import type { Context } from 'grammy';
import { captureError } from '../lib/sentry.js';
import { userService } from '../services/userService.js';

const WELCOME_MESSAGE = `
👋 Welcome to MeetMatch!

I'm your personal matchmaking assistant. I'll help you find people with similar interests near you.

To get started:
1️⃣ Set up your profile with /profile
2️⃣ Start matching with /match
3️⃣ View your matches with /matches

Need help? Just type /help anytime.
`;

export const startCommand = (ctx: Context) =>
  Effect.runPromise(
    Effect.gen(function* (_) {
      if (!ctx.from) return;

      const user = new User({
        id: String(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        isActive: true,
      });

      try {
        yield* _(userService.createUser(user));
      } catch (error) {
        // Ignore AlreadyExists error, re-throw others
        if (error instanceof ConnectError && error.code === Code.AlreadyExists) {
          // User already exists, which is fine
        } else {
          console.error('Failed to create user:', error);
          captureError(error, {
            tags: { context: 'startCommand' },
            userId: String(ctx.from.id),
          });
          // Continue anyway to show welcome message
        }
      }

      yield* _(Effect.tryPromise(() => ctx.reply(WELCOME_MESSAGE)));
    }),
  );
