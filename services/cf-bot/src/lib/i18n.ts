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
}

const en: Translations = {
  welcomeNew:
    "👋 Welcome to MeetMatch!\n\n" +
    "I'm here to help you find meaningful connections.\n\n" +
    "Let's start by setting up your profile with /profile, then discover matches with /match!",
  welcomeBack: "👋 Welcome back to MeetMatch! Ready to find your match? Use /match to start swiping!",
  welcomeBackIncomplete: "👋 Welcome back! Your profile is still incomplete.\n\nMissing fields:\n{missing}\n\nUse /profile to update your info.",
  profileTitle: '👤 Profile',
  profileIncompleteWarning: '⚠️ Your profile is incomplete. To start matching, please fill in:\n{missing}',
  profileSelectField: 'Select a field to edit:',
  matchProfileIncomplete: '⚠️ You need to complete your profile before matching.\n\nMissing fields:\n{missing}\n\nUse /profile to update your info.',
  matchFinding: '🔍 Finding matches for you...',
  matchNoMatches: 'No potential matches found right now. Try again later or adjust your preferences in /settings.',
  matchLikeSuccess: '❤️ You liked this profile!',
  matchDislikeSuccess: '👎 Profile skipped.',
  matchSkipSuccess: '⏩ Skipped.',
  matchError: 'Something went wrong. Please try again.',
  matchItsAMatch:
    "🎉 Awesome! You and {name} have liked each other!\n\n" +
    "💕 It's a match! 💕\n\n" +
    "Time to start something special ✨",
  matchStartChatting: '👉 [Start chatting with {name}](https://t.me/{username})',
  matchSayHiTo: 'Say hi to {pronoun} 👋',
  matchNoUsername: "💬 {name} hasn't set a username yet. You can share your username with them!",
  matchesNoMatches: "💑 No matches or likes yet. Use /match to find potential matches, then like someone who likes you back!",
  matchesMutualMatchesTitle: '💑 You have {count} mutual match(es):',
  matchesPendingLikesTitle: '💕 {count} person(s) liked you! See them now?',
  settingsTitle: '⚙️ Settings',
  bioPrompt: 'Enter your bio (max 300 characters). Type Cancel to abort.',
  bioTooLong: 'Bio is too long (max 300 characters). Try again or type Cancel.',
  bioUpdated: 'Bio updated!',
  agePrompt: 'Enter your age (18-65). Type Cancel to abort.',
  ageInvalid: 'Invalid age. Must be between 18 and 65. Try again or type Cancel.',
  ageUpdated: 'Age updated to {age}!',
  namePrompt: 'Enter your display name (1-50 characters). Type Cancel to abort.',
  nameInvalid: 'Name must be 1-50 characters. Try again or type Cancel.',
  nameUpdated: 'Name updated to {name}!',
  genderPrompt: 'Select your gender:',
  genderInvalid: 'Invalid selection. Please choose Male or Female, or type Cancel.',
  genderUpdated: 'Gender updated!',
  interestsPrompt: 'Enter your interests separated by commas (max 10). Type Cancel to abort.',
  interestsInvalid: 'Please enter at least one interest, separated by commas. Try again or type Cancel.',
  interestsUpdated: 'Interests updated: {interests}!',
  locationPrompt: 'How would you like to set your location?',
  locationShareButton: '📍 Share my location',
  locationTypeButton: '⌨️ Type city & country',
  locationTypePrompt: 'Please enter city and country separated by a comma (e.g., "Jakarta, Indonesia"). Type Cancel to abort.',
  locationUpdated: 'Location updated!',
  locationInvalid: 'Could not verify that location. Please enter a real city and country (e.g., "Jakarta, Indonesia"), or share your location. Try again or type Cancel.',
  ageRangePrompt: 'Enter your preferred age range (e.g., "18-30"). Type Cancel to abort.',
  ageRangeInvalid: 'Invalid format. Enter age range like "18-30". Try again or type Cancel.',
  ageRangeUpdated: 'Age range set to {min}-{max}!',
  distancePrompt: 'Enter max distance in km (1-500). Type Cancel to abort.',
  distanceInvalid: 'Enter a valid integer distance in km (1-500). Try again or type Cancel.',
  distanceUpdated: 'Max distance set to {distance}km!',
  genderPrefPrompt: 'Enter preferred genders separated by commas (male, female, other, prefer_not_to_say). Type Cancel to abort.',
  genderPrefInvalid: 'Enter valid genders separated by commas (male, female, other, prefer_not_to_say). Try again or type Cancel.',
  genderPrefUpdated: 'Gender preference set to: {preferences}!',
  phoneVerifyPrompt:
    "📱 One more step — verify your phone number to build trust with your matches.\n\n" +
    "Tap the button below to share your contact. Your number is only visible to mutual matches.",
  phoneVerifyButton: '📲 Share my contact',
  phoneVerified: '✅ Phone number verified! Your profile is now complete. Use /match to start finding connections!',
  phoneSkipped: '✅ Profile complete! You can verify your phone number anytime in /settings. Use /match to start finding connections!',
  genericError: '❌ Sorry, there was an error. Please try again later.',
  genericCancel: 'Cancel',
  genericCancelled: 'Cancelled.',
  notificationsNewLikes: '❤️ new like(s)',
  notificationsNewMutual: '💕 new mutual match(es)',
  notificationsCheckMatches: 'You have {items}! Check them out with /matches.',
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
