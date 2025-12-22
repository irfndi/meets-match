import { Effect, Either } from 'effect';
import type { Context } from 'grammy';
import { userService } from '../services/userService.js';
import { profileMenu } from '../menus/profile.js';

export const profileCommand = (ctx: Context) =>
  Effect.runPromise(
    Effect.gen(function* (_) {
      if (!ctx.from) return;

      const result = yield* _(userService.getUser(String(ctx.from.id)).pipe(Effect.either));

      if (Either.isLeft(result)) {
        console.error('Error fetching profile:', result.left);
        yield* Effect.tryPromise(() =>
          ctx.reply(
            'Could not load profile. Please make sure you have started the bot with /start.',
          ),
        );
        return;
      }

      const response = result.right;
      const user = response.user;

      if (!user) {
        yield* Effect.tryPromise(() => ctx.reply('Profile not found. Please use /start.'));
        return;
      }

      const msg = `
👤 Profile

Name: ${user.firstName} ${user.lastName || ''}
Username: ${user.username ? '@' + user.username : 'N/A'}
Age: ${user.age || 'Not set'}
Gender: ${user.gender || 'Not set'}
Bio: ${user.bio || 'Not set'}
Location: ${user.location?.city || 'Unknown'}, ${user.location?.country || ''}

Use the buttons below to edit your profile.
`;
      yield* Effect.tryPromise(() => ctx.reply(msg, { reply_markup: profileMenu }));
    }),
  );
