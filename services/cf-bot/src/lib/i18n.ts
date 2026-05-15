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
  matchLikeLimitReached: string;
  matchDislikeLimitReached: string;
  matchSkipGated: string;
  matchReferralPrompt: string;
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
  mediaPrompt: string;
  mediaInvalidType: string;
  mediaMaxReached: string;
  mediaUploadSuccess: string;
  mediaUploadError: string;
  mediaDonePrompt: string;
  mediaDoneButton: string;
  mediaAddMoreButton: string;
  mediaDeletedCleanup: string;
  mediaRequiredPrompt: string;
  mediaManagerTitle: string;
  mediaManagerEmpty: string;
  mediaManagerItemPhoto: string;
  mediaManagerItemVideo: string;
  mediaManagerDeletePrompt: string;
  mediaManagerUploadPrompt: string;
  mediaDeleteSuccess: string;
  mediaDeleteError: string;
  mediaRetryPrompt: string;
  mediaLimitReached: string;
  matchFallbackNotice: string;
  matchAdjustSettingsPrompt: string;
  hiddenFromMatches: string;
  reportPrompt: string;
  reportSubmitted: string;
  reportCancelled: string;
  rollbackNoAction: string;
  rollbackSuccess: string;
  rollbackGated: string;
  likeMessagePrompt: string;
  likeMessageSkipButton: string;
  likeMessageSent: string;
  giftTitle: string;
  giftSelect: string;
  giftSent: string;
  giftReceived: string;
  giftGated: string;
  giftCancelled: string;
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
  matchLikeLimitReached: '🛑 *Like Limit Reached*\n\nYou\'ve used all your free likes for today.\n\nUpgrade to Premium for unlimited likes, or share your referral link to earn bonus likes!',
  matchDislikeLimitReached: '🛑 *Dislike Limit Reached*\n\nYou\'ve used all your free dislikes for today.\n\nUpgrade to Premium for unlimited dislikes, or share your referral link to earn bonus likes!',
  matchSkipGated: '🔒 *Skip is a Premium feature*\n\nFree users can only Like or Dislike.\n\nUpgrade to Premium to skip profiles and browse faster!',
  matchReferralPrompt: '👋 You\'re on a roll! Share MeetMatch with friends to earn bonus likes and dislikes! 🎁',
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
  agePrompt: 'How old are you? Enter your age (12–80). Type *Cancel* to abort.',
  ageInvalid: 'Invalid age. Must be between 12 and 80. Try again or type *Cancel*.',
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
  mediaPrompt: 'Send me 1-3 photos or videos for your profile. Tap 📎 to attach.',
  mediaInvalidType: 'Please send a photo or video only. Other file types are not supported.',
  mediaMaxReached: 'You already have {count} media. Maximum is 3. Tap ✅ Done or delete existing media first.',
  mediaUploadSuccess: '✅ Added! You now have {count}/3 media.',
  mediaUploadError: '❌ Failed to upload. Please try again.',
  mediaDonePrompt: 'Send more or tap ✅ Done when finished.',
  mediaDoneButton: '✅ Done',
  mediaAddMoreButton: '📤 Add more',
  mediaDeletedCleanup: '📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!',
  mediaRequiredPrompt: '📸 *Media Required*\n\nPlease upload at least 1 photo or video to complete your profile.',
  mediaManagerTitle: '📸 *Your Media ({count}/3)*',
  mediaManagerEmpty: '📸 *Your Media (0/3)*\n\nNo media uploaded yet.\n\nUpload photos or videos to show on your profile:',
  mediaManagerItemPhoto: '📷 Photo',
  mediaManagerItemVideo: '🎥 Video',
  mediaManagerDeletePrompt: 'Tap an item to delete it, or upload more:',
  mediaManagerUploadPrompt: 'Upload photos or videos to show on your profile:',
  mediaDeleteSuccess: '✅ Deleted!',
  mediaDeleteError: '❌ Failed to delete. Please try again.',
  mediaRetryPrompt: '❌ Upload failed. Want to try again?',
  mediaLimitReached: '📸 *Upload Limit Reached*\n\nYou\'ve used all your free media uploads for today (10 max).\n\nShare MeetMatch with friends to earn bonus uploads, or upgrade to Premium for unlimited uploads!',
  matchFallbackNotice: '🔍 *Broadening your search…*\n\nYour current settings are a bit restrictive. Here are some profiles outside your usual preferences — try liking someone new!',
  matchAdjustSettingsPrompt: 'Tap ⚙️ Settings to adjust your age range, distance, or gender preferences.',
  hiddenFromMatches: '👋 Your profile is now hidden from matches. Come back to stay visible!',
  reportPrompt: '⚠️ *Report Profile*\n\nWhy are you reporting this profile? Type your reason below, or tap *Cancel*.',
  reportSubmitted: '✅ Report submitted. Thank you for keeping our community safe.',
  reportCancelled: 'Report cancelled.',
  rollbackNoAction: '↩️ Nothing to undo. You haven\'t taken any action on a profile yet.',
  rollbackSuccess: '↩️ Undone! The previous profile is back.',
  rollbackGated: '🔒 *Undo is a Premium+ feature*\n\nUpgrade to Premium or Premium+ to undo your last action!',
  likeMessagePrompt: '💌 *Send a Like with Message*\n\nType your message below, or send a photo/video. Tap *Skip* to like without a message.',
  likeMessageSkipButton: '⏭ Skip',
  likeMessageSent: '💌 Your like with message was sent!',
  giftTitle: '🎁 *Send a Gift*',
  giftSelect: 'Choose a gift to send:\n\n🌹 Rose — 10 ⭐\n🍫 Chocolate — 25 ⭐\n🧸 Teddy Bear — 50 ⭐\n💎 Diamond — 100 ⭐',
  giftSent: '🎁 You sent a *{gift}*! They\'ll receive it soon.',
  giftReceived: '🎁 *New Gift!*\n\n{name} sent you a *{gift}*! 💕',
  giftGated: '🔒 *Gifts are a Premium feature*\n\nUpgrade to Premium to send gifts to your matches!',
  giftCancelled: 'Gift cancelled.',
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
