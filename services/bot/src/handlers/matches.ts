import { Effect } from 'effect';
import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

import { captureEffectError } from '../lib/sentry.js';
import { matchService } from '../services/matchService.js';
import { userService } from '../services/userService.js';
import { mainMenuKeyboard } from '../ui/keyboards.js';

const NO_MATCHES_MESSAGE = `
📋 *Your Matches*

You don't have any matches yet!

Use /match to start finding people.
`;

const MATCHES_HEADER = `
📋 *Your Matches*

Here are your mutual matches:
`;

export const matchesCommand = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.from?.id) return;
    const userId = String(ctx.from.id);

    // Get user's match list
    const res = yield* _(matchService.getMatchList(userId));
    const matches = res.matches || [];

    if (matches.length === 0) {
      yield* _(
        Effect.tryPromise(() =>
          ctx.reply(NO_MATCHES_MESSAGE, {
            parse_mode: 'Markdown',
            reply_markup: mainMenuKeyboard(),
          }),
        ),
      );
      return;
    }

    // Build match list with user info
    const matchLines: string[] = [];
    const keyboard = new InlineKeyboard();

    for (let i = 0; i < Math.min(matches.length, 10); i++) {
      const match = matches[i];
      // Determine the other user's ID
      const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;

      try {
        const userRes = yield* _(userService.getUser(otherUserId));
        const otherUser = userRes.user;

        if (otherUser) {
          const name = otherUser.firstName || 'Unknown';
          const age = otherUser.age || '?';
          const matchDate = match.matchedAt
            ? new Date(Number(match.matchedAt.seconds) * 1000).toLocaleDateString()
            : 'Unknown';

          matchLines.push(`${i + 1}. *${name}*, ${age} - matched ${matchDate}`);

          // Add view button for each match
          if (i % 2 === 0) {
            keyboard.text(`👤 ${name}`, `view_match_user_${otherUserId}`);
          } else {
            keyboard.text(`👤 ${name}`, `view_match_user_${otherUserId}`).row();
          }
        }
      } catch (e) {
        // Skip if we can't fetch user
        console.error(`Failed to fetch user ${otherUserId}:`, e);
      }
    }

    if (matchLines.length === 0) {
      yield* _(
        Effect.tryPromise(() =>
          ctx.reply(NO_MATCHES_MESSAGE, {
            parse_mode: 'Markdown',
            reply_markup: mainMenuKeyboard(),
          }),
        ),
      );
      return;
    }

    // Add row and close button
    keyboard.row().text('🔥 Find More Matches', 'next_match');
    keyboard.row().text('❌ Close', 'matches_close');

    const message = `${MATCHES_HEADER}\n${matchLines.join('\n')}`;

    yield* _(
      Effect.tryPromise(() =>
        ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }),
      ),
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* (_) {
        yield* _(captureEffectError('matchesCommand', ctx.from?.id?.toString())(error));
        yield* _(
          Effect.tryPromise(() =>
            ctx.reply('Sorry, something went wrong loading your matches.', {
              reply_markup: mainMenuKeyboard(),
            }),
          ),
        );
      }),
    ),
    Effect.runPromise,
  );

// Matches-related callbacks
export const matchesCallbacks = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.callbackQuery?.data || !ctx.from?.id) return;
    const data = ctx.callbackQuery.data;

    yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));

    if (data === 'matches_close') {
      yield* _(Effect.tryPromise(() => ctx.deleteMessage()));
      return;
    }

    if (data.startsWith('view_match_user_')) {
      const targetUserId = data.replace('view_match_user_', '');

      const res = yield* _(userService.getUser(targetUserId));
      const user = res.user;

      if (!user) {
        yield* _(Effect.tryPromise(() => ctx.editMessageText('User not found.')));
        return;
      }

      const interests = user.interests?.join(', ') || 'None';
      const location = user.location
        ? `${user.location.city}, ${user.location.country}`
        : 'Unknown';

      const profileText = `
👤 *${user.firstName}*, ${user.age || '?'}
⚧ ${user.gender || 'Unknown'}

📝 ${user.bio || 'No bio'}

🌟 Interests: ${interests}

📍 ${location}
`;

      const keyboard = new InlineKeyboard()
        .url('💬 Message', `tg://user?id=${targetUserId}`)
        .row()
        .text('← Back to Matches', 'back_to_matches');

      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText(profileText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          }),
        ),
      );
      return;
    }

    if (data === 'back_to_matches') {
      yield* _(Effect.tryPromise(() => ctx.deleteMessage()));
      yield* _(Effect.promise(() => matchesCommand(ctx)));
      return;
    }
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* (_) {
        yield* _(captureEffectError('matchesCallbacks', ctx.from?.id?.toString())(error));
        yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery('Something went wrong')));
      }),
    ),
    Effect.runPromise,
  );
