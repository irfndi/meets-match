export type Language = 'en';

export const DEFAULT_LANGUAGE: Language = 'en';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

interface Translations {
  welcomeNew: string;
  welcomeBack: string;
  welcomeBackIncomplete: string;
  profileTitle: string;
  profileIncompleteWarning: string;
  profileSelectField: string;
  matchProfileIncomplete: string;
  matchFinding: string;
  matchNoMatches: string;
  matchLikeSuccess: string;
  matchDislikeSuccess: string;
  matchSkipSuccess: string;
  matchError: string;
  matchItsAMatch: string;
  matchStartChatting: string;
  matchSayHiTo: string;
  matchNoUsername: string;
  matchesNoMatches: string;
  matchesMutualMatchesTitle: string;
  matchesPendingLikesTitle: string;
  settingsTitle: string;
  bioPrompt: string;
  bioTooLong: string;
  bioUpdated: string;
  birthDatePrompt: string;
  birthDateInvalid: string;
  birthDateUpdated: string;
  agePrompt: string;
  ageInvalid: string;
  ageUpdated: string;
  namePrompt: string;
  nameInvalid: string;
  nameUpdated: string;
  genderPrompt: string;
  genderInvalid: string;
  genderUpdated: string;
  interestsPrompt: string;
  interestsInvalid: string;
  interestsUpdated: string;
  locationPrompt: string;
  locationShareButton: string;
  locationTypeButton: string;
  locationTypePrompt: string;
  locationUpdated: string;
  locationInvalid: string;
  ageRangePrompt: string;
  ageRangeSelectMin: string;
  ageRangeSelectMax: string;
  ageRangeInvalid: string;
  ageRangeUpdated: string;
  distancePrompt: string;
  distanceInvalid: string;
  distanceUpdated: string;
  genderPrefPrompt: string;
  genderPrefInvalid: string;
  genderPrefUpdated: string;
  phoneVerifyPrompt: string;
  phoneVerifyButton: string;
  phoneVerified: string;
  phoneSkipped: string;
  genericError: string;
  genericCancel: string;
  genericCancelled: string;
  notificationsNewLikes: string;
  notificationsNewMutual: string;
  notificationsCheckMatches: string;
  dmGated: string;
  dmSuccess: string;
  dmFailed: string;
  dmError: string;
  dmPurchased: string;
}

const en: Translations = {
  welcomeNew:
    "👋 *Welcome to MeetMatch!*\n\n" +
    "I'm here to help you find meaningful connections with people who share your interests.\n\n" +
    "Let's get started — tap *👤 Profile* below to set up your profile, then find matches!",
  welcomeBack: "👋 *Welcome back!* Ready to meet someone new? Tap *🔍 Find Match* to start discovering people!",
  welcomeBackIncomplete: "👋 *Welcome back!*\n\nYour profile is still incomplete. To start matching, please add:\n\n{missing}\n\nTap *👤 Profile* to finish setting up.",
  profileTitle: '👤 Your Profile',
  profileIncompleteWarning: '⚠️ *Profile Incomplete*\n\nTo start matching, please fill in:\n{missing}',
  profileSelectField: 'Tap a field below to edit it:',
  matchProfileIncomplete: '⚠️ *Almost there!*\n\nComplete your profile before matching:\n\n{missing}\n\nTap *👤 Profile* to update your info.',
  matchFinding: '🔍 *Finding matches for you…*',
  matchNoMatches: "No potential matches right now. Try again later, or adjust your preferences in *⚙️ Settings*!",
  matchLikeSuccess: '❤️ You liked this profile!',
  matchDislikeSuccess: '👎 Skipped.',
  matchSkipSuccess: '⏩ Skipped.',
  matchError: 'Something went wrong. Please try again.',
  matchItsAMatch:
    "🎉 *It's a Match!*\n\n" +
    "You and *{name}* have liked each other! 💕\n\n" +
    "Time to start something special ✨",
  matchStartChatting: '👉 [Start chatting with {name}](https://t.me/{username})',
  matchSayHiTo: 'Say hi to {pronoun} 👋',
  matchNoUsername: "💬 *{name}* hasn't set a Telegram username yet. You can share yours with them!",
  matchesNoMatches: "💑 *No matches yet.*\n\nUse *🔍 Find Match* to discover people, then like someone who likes you back!",
  matchesMutualMatchesTitle: '💑 You have {count} mutual match(es):',
  matchesPendingLikesTitle: '💕 {count} person(s) liked you! See them now?',
  settingsTitle: '⚙️ *Settings*\n\nAdjust your match preferences:',
  bioPrompt: 'Tell us about yourself! Enter your bio (max 300 characters). Type *Cancel* to abort.',
  bioTooLong: 'Bio is too long (max 300 characters). Try again or type *Cancel*.',
  bioUpdated: '✅ Bio updated!',
  birthDatePrompt: 'When were you born? Enter your birthdate in *DD.MM.YYYY* format (e.g. *15.03.1995*). Type *Cancel* to abort.',
  birthDateInvalid: 'Invalid date. Please use *DD.MM.YYYY* format and make sure it is a real date between 12 and 80 years ago. Try again or type *Cancel*.',
  birthDateUpdated: '✅ Birthdate updated!',
  agePrompt: 'How old are you? Enter your age (18–65). Type *Cancel* to abort.',
  ageInvalid: 'Invalid age. Must be between 18 and 65. Try again or type *Cancel*.',
  ageUpdated: '✅ Age updated to {age}!',
  namePrompt: 'What should we call you? Enter your display name (1–50 characters). Type *Cancel* to abort.',
  nameInvalid: 'Name must be 1–50 characters. Try again or type *Cancel*.',
  nameUpdated: '✅ Name updated to *{name}*!',
  genderPrompt: 'Select your gender:',
  genderInvalid: 'Invalid selection. Please choose *Male* or *Female*, or type *Cancel*.',
  genderUpdated: '✅ Gender updated!',
  interestsPrompt: 'What are you into? Enter your interests separated by commas (max 10). Type *Cancel* to abort.',
  interestsInvalid: 'Please enter at least one interest, separated by commas. Try again or type *Cancel*.',
  interestsUpdated: '✅ Interests updated: *{interests}*!',
  locationPrompt: 'How would you like to set your location?',
  locationShareButton: '📍 Share my location',
  locationTypeButton: '⌨️ Type city & country',
  locationTypePrompt: 'Please enter city and country separated by a comma (e.g., *Jakarta, Indonesia*). Type *Cancel* to abort.',
  locationUpdated: '✅ Location updated!',
  locationInvalid: 'Could not verify that location. Please enter a real city and country (e.g., *Jakarta, Indonesia*), or share your location. Try again or type *Cancel*.',
  ageRangePrompt: 'Select your preferred age range. Tap an age or type manually.',
  ageRangeSelectMin: '👇 Select *minimum* age:',
  ageRangeSelectMax: '👇 Select *maximum* age (must be ≥ {min}):',
  ageRangeInvalid: 'Invalid range. Min must be 12–80, max must be ≥ min and ≤ 80. Try again or type *Cancel*.',
  ageRangeUpdated: '✅ Age range updated to *{min}–{max}*!',
  distancePrompt: 'Enter max distance in km (1–500). Type *Cancel* to abort.',
  distanceInvalid: 'Enter a valid integer distance in km (1–500). Try again or type *Cancel*.',
  distanceUpdated: '✅ Max distance set to *{distance} km*!',
  genderPrefPrompt: 'Enter preferred genders separated by commas (*male, female, other, prefer_not_to_say*). Type *Cancel* to abort.',
  genderPrefInvalid: 'Enter valid genders separated by commas (*male, female, other, prefer_not_to_say*). Try again or type *Cancel*.',
  genderPrefUpdated: '✅ Gender preference set to: *{preferences}*!',
  phoneVerifyPrompt:
    "📱 *One more step* — verify your phone number to build trust with your matches.\n\n" +
    "Tap the button below to share your contact. Your number is only visible to mutual matches.",
  phoneVerifyButton: '📲 Share my contact',
  phoneVerified: '✅ Phone number verified! Your profile is now complete. Use *🔍 Find Match* to start discovering people!',
  phoneSkipped: '✅ Profile complete! You can verify your phone number anytime in *⚙️ Settings*. Use *🔍 Find Match* to start discovering people!',
  genericError: '❌ Sorry, something went wrong. Please try again later.',
  genericCancel: 'Cancel',
  genericCancelled: 'Cancelled.',
  notificationsNewLikes: '❤️ new like(s)',
  notificationsNewMutual: '💕 new mutual match(es)',
  notificationsCheckMatches: 'You have {items}! Check them out with *💕 My Matches*.',
  dmGated:
    "🔒 *Direct Messages are a Premium feature*\n\n" +
    "Send a DM to anyone without waiting for a mutual match.\n\n" +
    "*Options:*\n" +
    "• Upgrade to Premium/Premium+ for unlimited DMs\n" +
    "• Buy 1 DM with Telegram Stars (no subscription)",
  dmSuccess: '✅ DM unlocked! You can now message *{name}* directly:',
  dmFailed: '❌ Could not unlock DM. Please try again.',
  dmError: '❌ Something went wrong. Please try again later.',
  dmPurchased: '✅ You bought {count} DM credit(s)! You now have {total} DM credit(s).',
};

const dictionaries: Record<Language, Translations> = { en };

export function t(key: keyof Translations, lang: Language = DEFAULT_LANGUAGE, vars?: Record<string, string>): string {
  const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANGUAGE];
  let text = dict[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }
  }
  return text;
}
