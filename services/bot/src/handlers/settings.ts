import { Effect } from 'effect';
import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

import { captureEffectError } from '../lib/sentry.js';
import { userService } from '../services/userService.js';

const SETTINGS_MESSAGE = `
⚙️ *Settings*

Configure your preferences below:
`;

const formatPreferences = (prefs: any) => {
  const lines = [];

  if (prefs?.minAge || prefs?.maxAge) {
    lines.push(`🎂 Age Range: ${prefs.minAge || 18} - ${prefs.maxAge || 65}`);
  }
  if (prefs?.maxDistance) {
    lines.push(`📍 Max Distance: ${prefs.maxDistance} km`);
  }
  if (prefs?.genderPreference?.length) {
    lines.push(`⚧ Looking for: ${prefs.genderPreference.join(', ')}`);
  }
  if (prefs?.preferredLanguage) {
    lines.push(`🌐 Language: ${prefs.preferredLanguage}`);
  }
  if (prefs?.notificationsEnabled !== undefined) {
    lines.push(`🔔 Notifications: ${prefs.notificationsEnabled ? 'On' : 'Off'}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No preferences set yet.';
};

export const settingsCommand = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.from?.id) return;
    const userId = String(ctx.from.id);

    const res = yield* _(userService.getUser(userId));
    const user = res.user;
    const prefs = user?.preferences || {};

    const prefsText = formatPreferences(prefs);
    const message = `${SETTINGS_MESSAGE}\n${prefsText}`;

    const keyboard = new InlineKeyboard()
      .text('🎂 Age Range', 'settings_age_range')
      .text('📍 Distance', 'settings_distance')
      .row()
      .text('⚧ Gender Pref', 'settings_gender')
      .text('🌐 Language', 'settings_language')
      .row()
      .text('🔔 Notifications', 'settings_notifications')
      .row()
      .text('❌ Close', 'settings_close');

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
        yield* _(captureEffectError('settingsCommand', ctx.from?.id?.toString())(error));
        yield* _(
          Effect.tryPromise(() => ctx.reply('Sorry, something went wrong loading settings.')),
        );
      }),
    ),
    Effect.runPromise,
  );

// Settings callbacks router
export const settingsCallbacks = (ctx: Context) =>
  Effect.gen(function* (_) {
    if (!ctx.callbackQuery?.data || !ctx.from?.id) return;
    const data = ctx.callbackQuery.data;
    const userId = String(ctx.from.id);

    yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery()));

    if (data === 'settings_close') {
      yield* _(Effect.tryPromise(() => ctx.deleteMessage()));
      return;
    }

    if (data === 'settings_notifications') {
      // Toggle notifications
      const res = yield* _(userService.getUser(userId));
      const currentValue = res.user?.preferences?.notificationsEnabled ?? true;

      yield* _(
        userService.updateUser(userId, {
          preferences: { notificationsEnabled: !currentValue },
        }),
      );

      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText(
            `🔔 Notifications ${!currentValue ? 'enabled' : 'disabled'}!\n\nUse /settings to see all options.`,
            { parse_mode: 'Markdown' },
          ),
        ),
      );
      return;
    }

    if (data === 'settings_age_range') {
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText('🎂 *Age Range Settings*\n\nSelect your preferred age range:', {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('18-25', 'age_18_25')
              .text('25-35', 'age_25_35')
              .row()
              .text('35-45', 'age_35_45')
              .text('45+', 'age_45_65')
              .row()
              .text('← Back', 'settings_back'),
          }),
        ),
      );
      return;
    }

    if (data.startsWith('age_')) {
      const ranges: Record<string, [number, number]> = {
        age_18_25: [18, 25],
        age_25_35: [25, 35],
        age_35_45: [35, 45],
        age_45_65: [45, 65],
      };
      const range = ranges[data];
      if (range) {
        yield* _(
          userService.updateUser(userId, {
            preferences: { minAge: range[0], maxAge: range[1] },
          }),
        );
        yield* _(
          Effect.tryPromise(() =>
            ctx.editMessageText(
              `✅ Age range set to ${range[0]}-${range[1]}!\n\nUse /settings to see all options.`,
            ),
          ),
        );
      }
      return;
    }

    if (data === 'settings_distance') {
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText('📍 *Distance Settings*\n\nSelect maximum distance for matches:', {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('10 km', 'dist_10')
              .text('25 km', 'dist_25')
              .row()
              .text('50 km', 'dist_50')
              .text('100 km', 'dist_100')
              .row()
              .text('← Back', 'settings_back'),
          }),
        ),
      );
      return;
    }

    if (data.startsWith('dist_')) {
      const distance = parseInt(data.replace('dist_', ''), 10);
      if (!Number.isNaN(distance)) {
        yield* _(
          userService.updateUser(userId, {
            preferences: { maxDistance: distance },
          }),
        );
        yield* _(
          Effect.tryPromise(() =>
            ctx.editMessageText(
              `✅ Max distance set to ${distance} km!\n\nUse /settings to see all options.`,
            ),
          ),
        );
      }
      return;
    }

    if (data === 'settings_gender') {
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText('⚧ *Gender Preference*\n\nWho would you like to match with?', {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('Men', 'gender_pref_male')
              .text('Women', 'gender_pref_female')
              .row()
              .text('Everyone', 'gender_pref_all')
              .row()
              .text('← Back', 'settings_back'),
          }),
        ),
      );
      return;
    }

    if (data.startsWith('gender_pref_')) {
      const prefMap: Record<string, string[]> = {
        gender_pref_male: ['male'],
        gender_pref_female: ['female'],
        gender_pref_all: ['male', 'female'],
      };
      const genderPref = prefMap[data];
      if (genderPref) {
        yield* _(
          userService.updateUser(userId, {
            preferences: { genderPreference: genderPref },
          }),
        );
        yield* _(
          Effect.tryPromise(() =>
            ctx.editMessageText(
              `✅ Gender preference updated!\n\nUse /settings to see all options.`,
            ),
          ),
        );
      }
      return;
    }

    if (data === 'settings_language') {
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText('🌐 *Language*\n\nSelect your preferred language:', {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
              .text('English', 'lang_en')
              .text('Indonesian', 'lang_id')
              .row()
              .text('Spanish', 'lang_es')
              .text('Russian', 'lang_ru')
              .row()
              .text('← Back', 'settings_back'),
          }),
        ),
      );
      return;
    }

    if (data.startsWith('lang_')) {
      const lang = data.replace('lang_', '');
      yield* _(
        userService.updateUser(userId, {
          preferences: { preferredLanguage: lang },
        }),
      );
      yield* _(
        Effect.tryPromise(() =>
          ctx.editMessageText(`✅ Language set to ${lang}!\n\nUse /settings to see all options.`),
        ),
      );
      return;
    }

    if (data === 'settings_back') {
      // Go back to main settings
      yield* _(Effect.promise(() => settingsCommand(ctx)));
      yield* _(
        Effect.tryPromise(() => ctx.deleteMessage()).pipe(Effect.catchAll(() => Effect.void)),
      );
      return;
    }
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* (_) {
        yield* _(captureEffectError('settingsCallbacks', ctx.from?.id?.toString())(error));
        yield* _(Effect.tryPromise(() => ctx.answerCallbackQuery('Something went wrong')));
      }),
    ),
    Effect.runPromise,
  );
