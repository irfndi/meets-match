import { Effect } from 'effect';
import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

import { matchService } from '../services/matchService.js';
import { mainMenuKeyboard } from '../ui/keyboards.js';

const NO_MATCHES_MESSAGE = `
No potential matches found right now. 🕵️

Try adjusting your preferences in *Settings* or check back later!
`;

const MATCH_PROFILE_TEMPLATE = (
  name: string,
  age: number,
  gender: string,
  bio: string,
  interests: string,
  location: string,
) => `
👤 *${name}*, ${age}
⚧ ${gender}

📝 ${bio}

🌟 Interests: ${interests}

📍 ${location}

Do you like this match?
`;

export const matchCommand = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.from?.id) return;
    const userId = String(ctx.from.id);

    // 1. Get Potential Matches
    const res = yield* _(matchService.getPotentialMatches(userId, 1));

    if (!res.potentialMatches || res.potentialMatches.length === 0) {
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

    const matchUser = res.potentialMatches[0];

    // 2. Create Match (record pending state)
    const matchRes = yield* _(matchService.createMatch(userId, matchUser.id));
    const matchId = matchRes.match?.id;

    if (!matchId) {
      yield* _(Effect.fail(new Error('Failed to create match')));
      return; // Should not reach here if fail works as expected
    }

    // 3. Format Message
    const interests = matchUser.interests.join(', ') || 'None';
    const location = matchUser.location
      ? `${matchUser.location.city}, ${matchUser.location.country}`
      : 'Unknown';

    const message = MATCH_PROFILE_TEMPLATE(
      // Helper function or string literal
      matchUser.firstName,
      matchUser.age,
      matchUser.gender,
      matchUser.bio || 'No bio',
      interests,
      location,
    );

    // 4. Send Message with Buttons
    const keyboard = new InlineKeyboard()
      .text('👍 Like', `like_${matchId}`)
      .text('👎 Pass', `dislike_${matchId}`)
      .row()
      .text('⏭️ Next', 'next_match');

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
        console.error('Match error:', error);
        yield* _(
          Effect.tryPromise(() =>
            ctx.reply('Sorry, something went wrong finding matches.', {
              reply_markup: mainMenuKeyboard(),
            }),
          ),
        );
      }),
    ),
    Effect.runPromise,
  );

const MUTUAL_MATCH_MESSAGE = (name: string) => `
🎉 *It's a Match!*

You and *${name}* liked each other!

Start a conversation now 👋
`;

const LIKED_MESSAGE = `
👍 *Liked!*

We'll let you know if they like you back.
`;

const PASSED_MESSAGE = `
👎 *Passed*

Moving on to the next potential match...
`;

// Handle like action
export const handleLike = (ctx: Context, matchId: string) =>
  Effect.gen(function* (_) {
    if (!ctx.from?.id) return;
    const userId = String(ctx.from.id);

    const result = yield* _(matchService.likeMatch(matchId, userId));

    yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));

    if (result.isMutual) {
      // Get match details to show the other user's name
      const matchDetails = yield* _(matchService.getMatch(matchId));
      const otherUserId =
        matchDetails.match?.user1Id === userId
          ? matchDetails.match?.user2Id
          : matchDetails.match?.user1Id;

      // For now, show generic mutual message
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText(MUTUAL_MATCH_MESSAGE('your match'), {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('🔥 Find More Matches', 'next_match')
              .row()
              .text('📋 View Matches', 'view_matches'),
          }),
        ),
      );
    } else {
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText(LIKED_MESSAGE, {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('⏭️ Next Match', 'next_match'),
          }),
        ),
      );
    }
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* (_) {
        console.error('Like error:', error);
        yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery('Something went wrong')));
      }),
    ),
    Effect.runPromise,
  );

// Handle dislike/pass action
export const handleDislike = (ctx: Context, matchId: string) =>
  Effect.gen(function* (_) {
    if (!ctx.from?.id) return;
    const userId = String(ctx.from.id);

    yield* _(matchService.dislikeMatch(matchId, userId));
    yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));

    yield* _(
      Effect.tryPromise(() =>
        ctx.editMessageText(PASSED_MESSAGE, {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('⏭️ Next Match', 'next_match'),
        }),
      ),
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* (_) {
        console.error('Dislike error:', error);
        yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery('Something went wrong')));
      }),
    ),
    Effect.runPromise,
  );

// Main callback router for match-related actions
export const matchCallbacks = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.callbackQuery?.data) return;
    const data = ctx.callbackQuery.data;

    if (data === 'next_match') {
      yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));
      // Delete the current message and show a new match
      yield* _(
        Effect.tryPromise(() => ctx.deleteMessage()).pipe(Effect.catchAll(() => Effect.void)),
      );
      yield* _(Effect.promise(() => matchCommand(ctx)));
      return;
    }

    if (data === 'view_matches') {
      yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));
      yield* _(
        Effect.tryPromise(() =>
          ctx.reply('Your matches list coming soon! Use /matches when implemented.'),
        ),
      );
      return;
    }

    if (data.startsWith('like_')) {
      const matchId = data.replace('like_', '');
      yield* _(Effect.promise(() => handleLike(ctx, matchId)));
      return;
    }

    if (data.startsWith('dislike_')) {
      const matchId = data.replace('dislike_', '');
      yield* _(Effect.promise(() => handleDislike(ctx, matchId)));
      return;
    }
  }).pipe(Effect.runPromise);
