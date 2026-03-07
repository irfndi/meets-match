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

    // ⚡ Bolt Optimization: Fetch users concurrently instead of sequentially
    // Reduces latency from O(n) to O(1) for n matches
    const topMatches = matches.slice(0, 10);
    const userEffects = topMatches.map((match) => {
      const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      return userService.getUser(otherUserId).pipe(
        Effect.map((res) => ({ match, otherUser: res.user, otherUserId })),
        Effect.catchAll((e) => {
          console.error(`Failed to fetch user ${otherUserId}:`, e);
          return Effect.succeed(null);
        }),
      );
    });

    const results = yield* _(Effect.all(userEffects, { concurrency: 'unbounded' }));

    let validMatchIndex = 0;
    for (const result of results) {
      if (!result || !result.otherUser) continue;

      const { match, otherUser, otherUserId } = result;
      const name = otherUser.firstName || 'Unknown';
      const age = otherUser.age || '?';
      const matchDate = match.matchedAt
        ? new Date(Number(match.matchedAt.seconds) * 1000).toLocaleDateString()
        : 'Unknown';

      matchLines.push(`${validMatchIndex + 1}. *${name}*, ${age} - matched ${matchDate}`);

      // Add view button for each match
      if (validMatchIndex % 2 === 0) {
        keyboard.text(`👤 ${name}`, `view_match_user_${otherUserId}`);
      } else {
        keyboard.text(`👤 ${name}`, `view_match_user_${otherUserId}`).row();
      }

      validMatchIndex++;
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
