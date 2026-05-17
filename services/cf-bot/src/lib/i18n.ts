export type Language = "en" | "id";

export const DEFAULT_LANGUAGE: Language = "en";

export const SUPPORTED_LANGUAGES: {
  code: Language;
  label: string;
  flag: string;
}[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "id", label: "Indonesia", flag: "🇮🇩" },
];

export interface Translations {
  welcomeNew: string;
  welcomeBack: string;
  welcomeBackIncomplete: string;
  profileTitle: string;
  profileIncompleteWarning: string;
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
  referralSuccess: string;
  referralInvalid: string;
  referralSelf: string;
  referralAlreadyUsed: string;
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
  nameUseTelegramButton: string;
  nameInvalid: string;
  nameUpdated: string;
  genderPrompt: string;
  genderMaleButton: string;
  genderFemaleButton: string;
  genderInvalid: string;
  genderUpdated: string;
  interestsPrompt: string;
  interestsInvalid: string;
  interestsUpdated: string;
  interestsSkipButton: string;
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
  distanceSelect: string;
  distanceInvalid: string;
  distanceUpdated: string;
  genderPrefPrompt: string;
  genderPrefSelect: string;
  genderPrefInvalid: string;
  genderPrefUpdated: string;
  phoneVerifyPrompt: string;
  phoneVerifyButton: string;
  phoneVerified: string;
  phoneSkipped: string;
  phoneShareOwn: string;
  phoneFailed: string;
  genericError: string;
  genericCancel: string;
  genericCancelled: string;
  fallbackMessage: string;
  likeReceived: string;
  mutualMatch: string;
  notificationsTitle: string;
  notificationsEmpty: string;
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
  reportError: string;
  reportCancelled: string;
  feedbackPrompt: string;
  feedbackSubmitted: string;
  feedbackError: string;
  blockConfirm: string;
  blockSuccess: string;
  unblockSuccess: string;
  rollbackNoAction: string;
  rollbackSuccess: string;
  rollbackGated: string;
  matchMessagePrompt: string;
  likeMessagePrompt: string;
  likeMessageSkipButton: string;
  likeMessageSent: string;
  giftTitle: string;
  giftSelect: string;
  giftSent: string;
  giftReceived: string;
  giftGated: string;
  giftCancelled: string;
  menuPrompt: string;
  helpTitle: string;
  helpCommands: string;
  helpTips: string;
  helpContact: string;
  aboutTitle: string;
  aboutDescription: string;
  aboutBuiltWith: string;
  aboutVersion: string;
  aboutEnvironment: string;
  aboutLastUpdated: string;
  aboutServerAge: string;
  premiumPurchased: string;
  premiumTitle: string;
  premiumSubtitle: string;
  premiumFeatures: string;
  premiumAdPrompt: string;
  premiumAdDismiss: string;
  giftPremiumTitle: string;
  giftPremiumSelect: string;
  giftPremiumSent: string;
  giftPremiumReceived: string;
  giftPremiumError: string;
  // --- Settings labels ---
  settingsCurrentPreferences: string;
  settingsAgeRangeLabel: string;
  settingsMaxDistanceLabel: string;
  settingsGenderPrefLabel: string;
  settingsLanguageLabel: string;
  settingsTapToChange: string;
  settingsLanguageSelect: string;
  settingsClose: string;
  // --- Matches ---
  matchesMutualMatchesCount: string;
  matchesNewMutualMatches: string;
  matchesNewLikes: string;
  matchesNavigatePrompt: string;
  matchesChatWith: string;
  matchesNoUsernameSet: string;
  matchesMatchedAt: string;
  matchesMatchedRecently: string;
  matchesDismissAll: string;
  matchesDismissed: string;
  matchesSeeAnytime: string;
  matchesLoadingProfile: string;
  matchesLikeBack: string;
  matchesPass: string;
  matchesCouldNotLoad: string;
  matchesUnknownAction: string;
  // --- Match card & actions ---
  matchCardMale: string;
  matchCardFemale: string;
  matchCardOther: string;
  matchMainMenu: string;
  matchSendGift: string;
  matchSendDM: string;
  matchGiftPremium: string;
  matchBlock: string;
  matchTapToPay: string;
  matchGiftPremiumPaymentTitle: string;
  matchNoMatchesFoundTitle: string;
  matchNoMatchesFoundBody: string;
  matchRelaxedSearchTitle: string;
  matchRelaxedSearchBody: string;
  matchCouldNotIdentify: string;
  matchOwnProfile: string;
  matchProcessing: string;
  matchFailedToShow: string;
  // --- Profile ---
  profileYourProfile: string;
  profileNameLabel: string;
  profileAgeLabel: string;
  profileGenderLabel: string;
  profileBioLabel: string;
  profileLocationLabel: string;
  profileInterestsLabel: string;
  profileMediaLabel: string;
  profileInterestsNotSet: string;
  profileCompleteReady: string;
  profileSelectField: string;
  profileUploadMedia: string;
  profileBackToProfile: string;
  profileUploadMore: string;
  profileMediaUploaded: string;
  profileNavigatePrompt: string;
  // --- Premium ---
  premiumCurrentPlan: string;
  premiumExpires: string;
  premiumFreePlan: string;
  premiumFeatureBrowse: string;
  premiumFeatureLikes: string;
  premiumFeatureNoSkip: string;
  premiumFeatureUnlimited: string;
  premiumFeatureSkip: string;
  premiumFeaturePriority: string;
  premiumFeatureSeeLikes: string;
  premiumFeatureDMs: string;
  premiumFeatureVerified: string;
  premiumFeatureAdvancedFilters: string;
  premiumBuyPremium: string;
  premiumBuyPremiumPlus: string;
  premiumShareForBonus: string;
  premiumClose: string;
  premiumInvoiceTitlePremium: string;
  premiumInvoiceDescPremium: string;
  premiumInvoiceTitlePlus: string;
  premiumInvoiceDescPlus: string;
  // --- Referral ---
  referralTitle: string;
  referralBody: string;
  referralFriendsInvited: string;
  referralBonusEarned: string;
  referralYourCode: string;
  referralYourLink: string;
  referralShareOnTelegram: string;
  referralCopyLink: string;
  referralClose: string;
  referralShareText: string;
  // --- Misc ---
  mainMenuPrompt: string;
  reportCommandHint: string;
  closeSettings: string;
  itemNotFound: string;
  genderPronounHim: string;
  genderPronounHer: string;
  genderPronounThem: string;
  unknownAction: string;
  loading: string;
  notificationLikeMedia: string;
  notificationLikeCTA: string;
  notificationMutualMatchChat: string;
  notificationMutualMatchView: string;
  notificationGiftPremiumView: string;
  notificationBirthdayView: string;
  notificationReengagementFindMatch: string;
  notificationCleanupGoToProfile: string;
  // --- Conversations ---
  conversationBirthDateUpdateRequired: string;
  conversationLocationSaved: string;
  conversationLocationVerified: string;
  // --- Error feedback ---
  errorTraceId: string;
  errorCommandContext: string;
  errorActionContext: string;
  errorReportPrompt: string;
  errorReportTitle: string;
  errorReportUser: string;
  errorReportTraceId: string;
  errorReportTime: string;
  errorReportJourney: string;
  errorReportNoActivity: string;
  errorReportSent: string;
  errorReportFailed: string;
  errorReportThankYou: string;
  errorReportButton: string;
  errorMainMenuButton: string;
}

const en: Translations = {
  welcomeNew:
    "👋 *Welcome to MeetMatch!*\n\n" +
    "I'm here to help you find meaningful connections with people who share your interests.\n\n" +
    "Let's get started — tap *👤 Profile* below to set up your profile, then find matches!",
  welcomeBack:
    "👋 *Welcome back!* Ready to meet someone new? Tap *🔍 Find Match* to start discovering people!",
  welcomeBackIncomplete:
    "👋 *Welcome back!*\n\nYour profile is still incomplete. To start matching, please add:\n\n{missing}\n\nTap *👤 Profile* to finish setting up.",
  profileTitle: "👤 Your Profile",
  profileIncompleteWarning:
    "⚠️ *Profile Incomplete*\n\nTo start matching, please fill in:\n{missing}",
  matchProfileIncomplete:
    "⚠️ *Almost there!*\n\nComplete your profile before matching:\n\n{missing}\n\nTap *👤 Profile* to update your info.",
  matchFinding: "🔍 *Finding matches for you…*",
  matchNoMatches:
    "No potential matches right now. Try again later, or adjust your preferences in *⚙️ Settings*!",
  matchLikeSuccess: "❤️ You liked this profile!",
  matchDislikeSuccess: "👎 Skipped.",
  matchSkipSuccess: "⏩ Skipped.",
  matchLikeLimitReached:
    "🛑 *Like Limit Reached*\n\nYou've used all your free likes for today.\n\nUpgrade to Premium for unlimited likes, or share your referral link to earn bonus likes!",
  matchDislikeLimitReached:
    "🛑 *Dislike Limit Reached*\n\nYou've used all your free dislikes for today.\n\nUpgrade to Premium for unlimited dislikes, or share your referral link to earn bonus likes!",
  matchSkipGated:
    "🔒 *Skip is a Premium feature*\n\nFree users can only Like or Dislike.\n\nUpgrade to Premium to skip profiles and browse faster!",
  matchReferralPrompt:
    "👋 You're on a roll! Share MeetMatch with friends to earn bonus likes and dislikes! 🎁",
  referralSuccess:
    "🎉 *Referral successful!*\n\nYou earned *+{bonus}* bonus swipes!",
  referralInvalid: "❌ Invalid or expired referral code.",
  referralSelf: "❌ You can't use your own referral code.",
  referralAlreadyUsed: "❌ You've already used a referral code before.",
  matchError: "Something went wrong. Please try again.",
  matchMessagePrompt: "✉️ Send a message to your match:",
  matchItsAMatch:
    "🎉 *It's a Match!*\n\n" +
    "You and *{name}* have liked each other! 💕\n\n" +
    "Time to start something special ✨",
  matchStartChatting:
    "👉 [Start chatting with {name}](https://t.me/{username})",
  matchSayHiTo: "Say hi to {pronoun} 👋",
  matchNoUsername:
    "💬 *{name}* hasn't set a Telegram username yet. You can share yours with them!",
  matchesNoMatches:
    "💑 *No matches yet.*\n\nUse *🔍 Find Match* to discover people, then like someone who likes you back!",
  matchesMutualMatchesTitle: "💑 You have {count} mutual match(es):",
  matchesPendingLikesTitle: "💕 {count} person(s) liked you! See them now?",
  settingsTitle: "⚙️ *Settings*\n\nAdjust your match preferences:",
  bioPrompt:
    "Tell us about yourself! Enter your bio (max 300 characters). Type *Cancel* to abort.",
  bioTooLong:
    "Bio is too long (max 300 characters). Try again or type *Cancel*.",
  bioUpdated: "✅ Bio updated!",
  birthDatePrompt:
    "When were you born? Enter your birthdate in *DD.MM.YYYY* format (e.g. *15.03.1995*). Type *Cancel* to abort.",
  birthDateInvalid:
    "Invalid date. Please use *DD.MM.YYYY* format and make sure it is a real date between 12 and 80 years ago. Try again or type *Cancel*.",
  birthDateUpdated: "✅ Birthdate updated!",
  agePrompt: "How old are you? Enter your age (12–80). Type *Cancel* to abort.",
  ageInvalid:
    "Invalid age. Must be between 12 and 80. Try again or type *Cancel*.",
  ageUpdated: "✅ Age updated to {age}!",
  namePrompt:
    "What should we call you? Enter your display name (1–50 characters). Type *Cancel* to abort.",
  nameUseTelegramButton: "👤 Use my Telegram name",
  nameInvalid: "Name must be 1–50 characters. Try again or type *Cancel*.",
  nameUpdated: "✅ Name updated to *{name}*!",
  genderPrompt: "Select your gender:",
  genderMaleButton: "Male",
  genderFemaleButton: "Female",
  genderInvalid:
    "Invalid selection. Please choose *Male* or *Female*, or type *Cancel*.",
  genderUpdated: "✅ Gender updated!",
  interestsPrompt:
    "What are you into? Enter your interests separated by commas (max 10). Type *Cancel* to abort.",
  interestsInvalid:
    "Please enter at least one interest, separated by commas. Try again or type *Cancel*.",
  interestsSkipButton: "⏭️ Skip",
  interestsUpdated: "✅ Interests updated: *{interests}*!",
  locationPrompt: "How would you like to set your location?",
  locationShareButton: "📍 Share my location",
  locationTypeButton: "⌨️ Type city & country",
  locationTypePrompt:
    "Please enter city and country separated by a comma (e.g., *Jakarta, Indonesia*). Type *Cancel* to abort.",
  locationUpdated: "✅ Location updated!",
  locationInvalid:
    "Could not verify that location. Please enter a real city and country (e.g., *Jakarta, Indonesia*), or share your location. Try again or type *Cancel*.",
  ageRangePrompt:
    "Select your preferred age range. Tap an age or type manually.",
  ageRangeSelectMin: "👇 Select *minimum* age:",
  ageRangeSelectMax: "👇 Select *maximum* age (must be ≥ {min}):",
  ageRangeInvalid:
    "Invalid range. Min must be 12–80, max must be ≥ min and ≤ 80. Try again or type *Cancel*.",
  ageRangeUpdated: "✅ Age range updated to *{min}–{max}*!",
  distancePrompt: "Enter max distance in km (1–500). Type *Cancel* to abort.",
  distanceSelect: "👇 Select max distance:",
  distanceInvalid:
    "Enter a valid integer distance in km (1–500). Try again or type *Cancel*.",
  distanceUpdated: "✅ Max distance set to *{distance} km*!",
  genderPrefPrompt:
    "Enter preferred genders separated by commas (*male, female, other, prefer_not_to_say*). Type *Cancel* to abort.",
  genderPrefSelect: "👇 Select gender preference:",
  genderPrefInvalid:
    "Enter valid genders separated by commas (*male, female, other, prefer_not_to_say*). Try again or type *Cancel*.",
  genderPrefUpdated: "✅ Gender preference set to: *{preferences}*!",
  phoneVerifyPrompt:
    "📱 *One more step* — verify your phone number to build trust with your matches.\n\n" +
    "Tap the button below to share your contact. Your number is only visible to mutual matches.",
  phoneVerifyButton: "📲 Share my contact",
  phoneVerified:
    "✅ Phone number verified! Your profile is now complete. Use *🔍 Find Match* to start discovering people!",
  phoneSkipped:
    "✅ Profile complete! You can verify your phone number anytime in *⚙️ Settings*. Use *🔍 Find Match* to start discovering people!",
  phoneShareOwn: "Please share your own contact.",
  phoneFailed: "Could not get phone number. Please try again.",
  genericError: "❌ Sorry, something went wrong. Please try again later.",
  genericCancel: "Cancel",
  genericCancelled: "Cancelled.",
  fallbackMessage:
    "I'm not sure what you mean. Use the menu below or try /help for guidance.",
  likeReceived: "❤️ Someone liked you!",
  mutualMatch: "🎉 *It's a Match!* You and {name} liked each other!",
  notificationsTitle: "🔔 *Notifications*",
  notificationsEmpty: "No new notifications.",
  notificationsNewLikes: "❤️ new like(s)",
  notificationsNewMutual: "💕 new mutual match(es)",
  notificationsCheckMatches:
    "You have {items}! Check them out with *💕 My Matches*.",
  dmGated:
    "🔒 *Direct Messages are a Premium feature*\n\n" +
    "Send a DM to anyone without waiting for a mutual match.\n\n" +
    "*Options:*\n" +
    "• Upgrade to Premium/Premium+ for unlimited DMs\n" +
    "• Buy 1 DM with Telegram Stars (no subscription)",
  dmSuccess: "✅ DM unlocked! You can now message *{name}* directly:",
  dmFailed: "❌ Could not unlock DM. Please try again.",
  dmError: "❌ Something went wrong. Please try again later.",
  dmPurchased:
    "✅ You bought {count} DM credit(s)! You now have {total} DM credit(s).",
  mediaPrompt:
    "Send me 1-3 photos or videos for your profile. Tap 📎 to attach.",
  mediaInvalidType:
    "Please send a photo or video only. Other file types are not supported.",
  mediaMaxReached:
    "You already have {count} media. Maximum is 3. Tap ✅ Done or delete existing media first.",
  mediaUploadSuccess: "✅ Added! You now have {count}/3 media.",
  mediaUploadError: "❌ Failed to upload. Please try again.",
  mediaDonePrompt: "Send more or tap ✅ Done when finished.",
  mediaDoneButton: "✅ Done",
  mediaAddMoreButton: "📤 Add more",
  mediaDeletedCleanup:
    "📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!",
  mediaRequiredPrompt:
    "📸 *Media Required*\n\nPlease upload at least 1 photo or video to complete your profile.",
  mediaManagerTitle: "📸 *Your Media ({count}/3)*",
  mediaManagerEmpty:
    "📸 *Your Media (0/3)*\n\nNo media uploaded yet.\n\nUpload photos or videos to show on your profile:",
  mediaManagerItemPhoto: "📷 Photo",
  mediaManagerItemVideo: "🎥 Video",
  mediaManagerDeletePrompt: "Tap an item to delete it, or upload more:",
  mediaManagerUploadPrompt: "Upload photos or videos to show on your profile:",
  mediaDeleteSuccess: "✅ Deleted!",
  mediaDeleteError: "❌ Failed to delete. Please try again.",
  mediaRetryPrompt: "❌ Upload failed. Want to try again?",
  mediaLimitReached:
    "📸 *Upload Limit Reached*\n\nYou've used all your free media uploads for today (10 max).\n\nShare MeetMatch with friends to earn bonus uploads, or upgrade to Premium for unlimited uploads!",
  matchFallbackNotice:
    "🔍 *Broadening your search…*\n\nYour current settings are a bit restrictive. Here are some profiles outside your usual preferences — try liking someone new!",
  matchAdjustSettingsPrompt:
    "Tap ⚙️ Settings to adjust your age range, distance, or gender preferences.",
  hiddenFromMatches:
    "👋 Your profile is now hidden from matches. Come back to stay visible!",
  reportPrompt:
    "⚠️ *Report Profile*\n\nWhy are you reporting this profile? Type your reason below, or tap *Cancel*.",
  reportSubmitted:
    "✅ Report submitted. Thank you for keeping our community safe.",
  reportError: "❌ Failed to submit report. Please try again.",
  reportCancelled: "Report cancelled.",
  feedbackPrompt:
    "💬 *Feedback*\n\nWhat suggestions or feedback do you have? Type *Cancel* to abort.",
  feedbackSubmitted: "✅ Feedback submitted. Thank you!",
  feedbackError: "❌ Failed to submit feedback. Please try again.",
  blockConfirm: "Are you sure you want to block this user?",
  blockSuccess: "✅ User blocked.",
  unblockSuccess: "✅ User unblocked.",
  rollbackNoAction:
    "↩️ Nothing to undo. You haven't taken any action on a profile yet.",
  rollbackSuccess: "↩️ Undone! The previous profile is back.",
  rollbackGated:
    "🔒 *Undo is a Premium+ feature*\n\nUpgrade to Premium or Premium+ to undo your last action!",
  likeMessagePrompt:
    "💌 *Send a Like with Message*\n\nType your message below, or send a photo/video. Tap *Skip* to like without a message.",
  likeMessageSkipButton: "⏭ Skip",
  likeMessageSent: "💌 Your like with message was sent!",
  giftTitle: "🎁 *Send a Gift*",
  giftSelect:
    "Choose a gift to send:\n\n🌹 Rose — 10 ⭐\n🍫 Chocolate — 25 ⭐\n🧸 Teddy Bear — 50 ⭐\n💎 Diamond — 100 ⭐",
  giftSent: "🎁 You sent a *{gift}*! They'll receive it soon.",
  giftReceived: "🎁 *New Gift!*\n\n{name} sent you a *{gift}*! 💕",
  giftGated:
    "🔒 *Gifts are a Premium feature*\n\nUpgrade to Premium to send gifts to your matches!",
  giftCancelled: "Gift cancelled.",
  menuPrompt: "Use the menu below to get started:",
  helpTitle: "🤖 *MeetMatch Bot*",
  helpCommands:
    "*Commands:*\n*/start* — Get started\n*/profile* — View or edit your profile\n*/match* — Find your next match\n*/matches* — View your matches and likes\n*/settings* — Adjust your preferences\n*/referral* — Invite friends for bonus swipes\n*/feedback* — Send us feedback\n*/report* — Report a profile\n*/help* — Show this help\n*/about* — About MeetMatch",
  helpTips:
    "*Tips:*\n• Complete your profile for better matches\n• Use */settings* to adjust age range and distance\n• Matches are based on interests, location, and preferences",
  helpContact: "Need help? Contact support.",
  aboutTitle: "🌟 *About MeetMatch*",
  aboutDescription:
    "MeetMatch helps you find people with similar interests near you.",
  aboutBuiltWith: "Built with ❤️ using modern tech stack.",
  aboutVersion: "*Version:* `{version}`",
  aboutEnvironment: "*Environment:* {environment}",
  aboutLastUpdated: "*Last updated:* {builtAt}",
  aboutServerAge: "*Build age:* {serverAge}",
  premiumPurchased:
    "✅ You're now on *{tier}*! Enjoy your upgraded experience.",
  premiumTitle: "👑 *Premium*",
  premiumSubtitle: "Unlock exclusive features with Premium:",
  premiumFeatures:
    "• Unlimited likes & dislikes\n" +
    "• Skip profiles you don't like\n" +
    "• See who liked you\n" +
    "• Send unlimited DMs\n\n" +
    "Tap below to upgrade!",
  premiumAdPrompt:
    "👑 *Unlock Premium Features*\n\n" +
    "• Unlimited likes & dislikes\n" +
    "• Skip profiles you don't like\n" +
    "• See who liked you\n" +
    "• Send unlimited DMs\n\n" +
    "Tap below to upgrade!",
  premiumAdDismiss: "Maybe later",
  giftPremiumTitle: "🎁 *Gift Premium*",
  giftPremiumSelect:
    "Choose a plan to gift to this user:\n\n" +
    "👑 Premium — unlimited likes, skip, priority matching\n" +
    "💎 Premium+ — everything in Premium + unlimited DMs, verified badge",
  giftPremiumSent: "✅ You gifted *{tier}* to *{name}*! They'll love it! 💕",
  giftPremiumReceived:
    "🎁 *Surprise!*\n\n*{name}* gifted you *{tier}*! Enjoy your upgraded experience! 💕",
  giftPremiumError:
    "❌ Could not process the gift. Please contact support if you were charged.",
  // --- Settings labels ---
  settingsCurrentPreferences: "*Current Preferences:*",
  settingsAgeRangeLabel: "🎯 Age Range: {value}",
  settingsMaxDistanceLabel: "📍 Max Distance: {value}",
  settingsGenderPrefLabel: "⚧ Gender Preference: {value}",
  settingsLanguageLabel: "🌐 Language: {value}",
  settingsTapToChange: "Tap a field below to change it:",
  settingsLanguageSelect: "🌐 *Select Language*\n\nCurrent: {value}",
  settingsClose: "Settings closed.",
  // --- Matches ---
  matchesMutualMatchesCount: "💑 You have {count} mutual match(es):",
  matchesNewMutualMatches: "💕 You have {count} new mutual match(es)!",
  matchesNewLikes:
    "💕 {count} person(s) liked your profile! Want to check them out?",
  matchesNavigatePrompt: "Use the menu below to navigate:",
  matchesChatWith: "💬 Chat with {name}",
  matchesNoUsernameSet: "💬 {name} (no username set)",
  matchesMatchedAt: "Matched at: {time}",
  matchesMatchedRecently: "recently",
  matchesDismissAll: "⏭ Dismiss all",
  matchesDismissed: "Dismissed.",
  matchesSeeAnytime: "💕 You can see your likes anytime with /matches.",
  matchesLoadingProfile: "Loading profile...",
  matchesLikeBack: "❤️ Like back",
  matchesPass: "👎 Pass",
  matchesCouldNotLoad: "Could not load profile. Please try again.",
  matchesUnknownAction: "Unknown action.",
  // --- Match card & actions ---
  matchCardMale: "M",
  matchCardFemale: "F",
  matchCardOther: "O",
  matchMainMenu: "🏠 Main menu",
  matchSendGift: "🎁 Send a gift",
  matchSendDM: "📩 Send DM",
  matchGiftPremium: "🎁 Gift Premium",
  matchBlock: "🚫 Block",
  matchTapToPay: "Tap the button below to pay with Telegram Stars.",
  matchGiftPremiumPaymentTitle: "🎁 Gift Premium",
  matchNoMatchesFoundTitle: "🔍 *No potential matches found right now*",
  matchNoMatchesFoundBody:
    "Your community is still growing. Invite friends to discover more people and earn bonus likes!\n\nOr broaden your search in *⚙️ Settings*",
  matchRelaxedSearchTitle:
    "🔍 *Showing profiles slightly outside your preferences*",
  matchRelaxedSearchBody:
    "We expanded your search a little to help you discover more people near you.",
  matchCouldNotIdentify: "Could not identify you. Try again.",
  matchOwnProfile: "❌ You can't interact with your own profile.",
  matchProcessing: "Processing... please wait.",
  matchFailedToShow: "❌ Failed to show profile. Please try /match again.",
  // --- Profile ---
  profileYourProfile: "👤 Your Profile",
  profileNameLabel: "Name: {value}",
  profileAgeLabel: "Age: {value}",
  profileGenderLabel: "Gender: {value}",
  profileBioLabel: "Bio: {value}",
  profileLocationLabel: "Location: {value}",
  profileInterestsLabel: "Interests: {value}",
  profileMediaLabel: "Media: {value}",
  profileInterestsNotSet: "Not set",
  profileCompleteReady: "✅ Profile complete — Ready to match",
  profileSelectField: "Select a field to edit:",
  profileUploadMedia: "📤 Upload Media",
  profileBackToProfile: "← Back to Profile",
  profileUploadMore: "📤 Upload More",
  profileMediaUploaded: "{count}/3 uploaded",
  profileNavigatePrompt: "👇 Use the menu below to navigate:",
  // --- Premium ---
  premiumCurrentPlan: "*Current plan:* {plan}",
  premiumExpires: "📅 Expires: {date}",
  premiumFreePlan: "*Free Plan:*",
  premiumFeatureBrowse: "• Browse unlimited profiles",
  premiumFeatureLikes: "• {likes} likes + {dislikes} dislikes per day",
  premiumFeatureNoSkip: "• No skip (Like or Dislike only)",
  premiumFeatureUnlimited: "• Unlimited likes & dislikes",
  premiumFeatureSkip: "• ⏩ Skip profiles",
  premiumFeaturePriority: "• Priority matching",
  premiumFeatureSeeLikes: "• See who liked you",
  premiumFeatureDMs: "• Unlimited direct DMs",
  premiumFeatureVerified: "• Verified badge",
  premiumFeatureAdvancedFilters: "• Advanced filters",
  premiumBuyPremium: "⭐ Buy Premium ({stars} Stars)",
  premiumBuyPremiumPlus: "💎 Buy Premium+ ({stars} Stars)",
  premiumShareForBonus: "🎁 Share for Free Bonus",
  premiumClose: "❌ Close",
  premiumInvoiceTitlePremium: "MeetMatch Premium",
  premiumInvoiceDescPremium:
    "Upgrade to Premium — unlimited likes, skip, priority matching, and see who liked you.",
  premiumInvoiceTitlePlus: "MeetMatch Premium+",
  premiumInvoiceDescPlus:
    "Upgrade to Premium+ — everything in Premium plus unlimited DMs, verified badge, and advanced filters.",
  // --- Referral ---
  referralTitle: "🎁 *Invite Friends, Earn Bonus*",
  referralBody:
    "Share your referral link with friends. When they join and complete their profile, *both of you get +5 bonus likes & dislikes!*",
  referralFriendsInvited: "👥 *Friends invited:* {count}",
  referralBonusEarned: "⭐ *Bonus earned:* +{count} likes/dislikes",
  referralYourCode: "*Your referral code:* `{code}`",
  referralYourLink: "*Your link:* {link}",
  referralShareOnTelegram: "📤 Share on Telegram",
  referralCopyLink: "📋 Copy Link",
  referralClose: "❌ Close",
  referralShareText: "Join me on MeetMatch! 🎁",
  // --- Misc ---
  mainMenuPrompt: "Main menu:",
  reportCommandHint:
    "⚠️ To report a profile, tap the ⚠️ button when viewing a match card.",
  closeSettings: "Settings closed.",
  itemNotFound: "Item not found.",
  genderPronounHim: "him",
  genderPronounHer: "her",
  genderPronounThem: "them",
  unknownAction: "Unknown action.",
  loading: "Loading...",
  notificationLikeMedia: "\n\n📎 They also sent a photo/video with their like.",
  notificationLikeCTA: " Use *💕 My Matches* to see who likes you.",
  notificationMutualMatchChat:
    "\n\n👉 [Start chatting](https://t.me/{username})",
  notificationMutualMatchView: "💕 View Matches",
  notificationGiftPremiumView: "👑 View Premium",
  notificationBirthdayView: "💕 View Matches",
  notificationReengagementFindMatch: "🔍 Find Matches",
  notificationCleanupGoToProfile: "👤 Go to Profile",
  // --- Conversations ---
  conversationBirthDateUpdateRequired:
    "📢 *Profile Update Required*\n\nWe have updated how ages are stored. Please enter your birthdate to continue.\n\nEnter your birthdate in *DD.MM.YYYY* format (e.g. *15.03.1995*).",
  conversationLocationSaved:
    "📍 *{city}, {country}* saved!\n\nWe could not verify the exact coordinates right now, but your city is recorded. Distance matching will work once we verify it.",
  conversationLocationVerified: "📍 Location verified: *{city}, {country}*",
  // --- Error feedback ---
  errorTraceId: "\n🔍 Trace ID: `{traceId}`",
  errorCommandContext: "\n📍 Command: /{command}",
  errorActionContext: "🎬 Action: {action}",
  errorReportPrompt:
    "\nIf this keeps happening, tap *Report* below and tell us what you were doing.",
  errorReportTitle: "🐛 *Error Report*",
  errorReportUser: "*User:* {userId}",
  errorReportTraceId: "*Trace ID:* `{traceId}`",
  errorReportTime: "*Time:* {time}",
  errorReportJourney: "*Recent Journey:*",
  errorReportNoActivity: "No recent activity recorded.",
  errorReportSent: "✅ Report sent! We'll look into it.",
  errorReportFailed: "❌ Could not send report. Please try again.",
  errorReportThankYou: "Report sent. Thank you!",
  errorReportButton: "🐛 Report Issue",
  errorMainMenuButton: "🏠 Main menu",
};

const id: Translations = {
  welcomeNew:
    "👋 *Selamat datang di MeetMatch!*\n\n" +
    "Saya di sini untuk membantu kamu menemukan koneksi yang bermakna dengan orang-orang yang memiliki minat serupa.\n\n" +
    "Mari mulai — ketuk *👤 Profil* di bawah untuk mengatur profilmu, lalu temukan match!",
  welcomeBack: "👋 *Selamat datang kembali!*",
  welcomeBackIncomplete:
    "👋 *Selamat datang kembali!*\n\nProfilmu belum lengkap. Yang kurang: {missing}\n\nKetuk *👤 Profil* untuk melengkapi.",
  matchProfileIncomplete:
    "⚠️ Profilmu belum lengkap. Lengkapi dulu ya sebelum mencari match.",
  matchFinding: "🔍 Mencari match untukmu...",
  matchNoMatches:
    "😕 Belum ada match saat ini. Coba lagi nanti atau ubah preferensi match-mu di *⚙️ Pengaturan*.",
  matchSkipGated: "Kamu sudah mencapai batas swipe harian. Coba lagi besok!",
  matchReferralPrompt:
    "🎁 *Undang Teman*\n\n" +
    "Bagikan kode referalmu dan dapatkan bonus swipe!\n\n" +
    "Kode referalmu: `{code}`",
  referralSuccess:
    "🎉 *Referal berhasil!*\n\n" + "Kamu mendapatkan *+{bonus}* swipe bonus!",
  referralInvalid: "❌ Kode referal tidak valid atau sudah kadaluarsa.",
  referralSelf: "❌ Kamu tidak bisa menggunakan kode referalmu sendiri.",
  referralAlreadyUsed:
    "❌ Kamu sudah pernah menggunakan kode referal sebelumnya.",
  profileTitle: "👤 *Profilmu*",
  profileIncompleteWarning:
    "⚠️ *Profil Belum Lengkap*\n\nLengkapi profil untuk mulai mencari match:\n{missing}",
  settingsTitle: "⚙️ *Pengaturan*",
  bioPrompt:
    "Ceritakan tentang dirimu! Masukkan bio (maks 300 karakter). Ketik *Batal* untuk membatalkan.",
  bioTooLong:
    "Bio terlalu panjang. Maksimal 300 karakter. Coba lagi atau ketik *Batal*.",
  bioUpdated: "✅ Bio diperbarui!",
  birthDatePrompt:
    "Kapan tanggal lahirmu? Masukkan tanggal lahir dalam format *DD.MM.YYYY* (contoh: *15.03.1995*). Ketik *Batal* untuk membatalkan.",
  birthDateInvalid:
    "Tanggal tidak valid. Gunakan format *DD.MM.YYYY* dan pastikan tanggalnya nyata antara 12–80 tahun yang lalu. Coba lagi atau ketik *Batal*.",
  birthDateUpdated: "✅ Tanggal lahir diperbarui!",
  agePrompt:
    "Berapa umurmu? Masukkan umur (12–80). Ketik *Batal* untuk membatalkan.",
  ageInvalid:
    "Umur tidak valid. Harus antara 12–80. Coba lagi atau ketik *Batal*.",
  ageUpdated: "✅ Umur diperbarui menjadi {age}!",
  namePrompt:
    "Siapa nama panggilanmu? Masukkan nama tampilan (1–50 karakter). Ketik *Batal* untuk membatalkan.",
  nameUseTelegramButton: "👤 Gunakan nama Telegram",
  nameInvalid: "Nama harus 1–50 karakter. Coba lagi atau ketik *Batal*.",
  nameUpdated: "✅ Nama diperbarui menjadi *{name}*!",
  genderPrompt: "Pilih jenis kelamin:",
  genderMaleButton: "Laki-laki",
  genderFemaleButton: "Perempuan",
  genderInvalid:
    "Pilihan tidak valid. Pilih *Laki-laki* atau *Perempuan*, atau ketik *Batal*.",
  genderUpdated: "✅ Jenis kelamin diperbarui!",
  interestsPrompt:
    "Apa minatmu? Masukkan minat yang dipisahkan koma (maks 10). Ketik *Batal* untuk membatalkan.",
  interestsInvalid:
    "Masukkan setidaknya satu minat, dipisahkan koma. Coba lagi atau ketik *Batal*.",
  interestsUpdated: "✅ Minat diperbarui!",
  interestsSkipButton: "⏭️ Lewati",
  locationPrompt: "Bagaimana cara mengatur lokasimu?",
  locationShareButton: "📍 Bagikan lokasiku",
  locationTypeButton: "⌨️ Ketik kota & negara",
  locationTypePrompt:
    "Masukkan kota dan negara dipisahkan koma (contoh: *Jakarta, Indonesia*). Ketik *Batal* untuk membatalkan.",
  locationUpdated: "✅ Lokasi diperbarui!",
  locationInvalid: "Lokasi tidak valid. Coba lagi atau ketik *Batal*.",
  ageRangePrompt:
    "Pilih rentang usia yang diinginkan. Ketuk usia atau ketik secara manual.",
  ageRangeInvalid:
    "Rentang usia tidak valid. Gunakan format *min-max* (contoh: *18-25*). Coba lagi atau ketik *Batal*.",
  ageRangeUpdated: "✅ Rentang usia diperbarui!",
  distancePrompt:
    "Masukkan jarak maksimal dalam km (1–500). Ketik *Batal* untuk membatalkan.",
  distanceInvalid:
    "Jarak tidak valid. Harus antara 5–500 km. Coba lagi atau ketik *Batal*.",
  distanceUpdated: "✅ Jarak diperbarui!",
  genderPrefPrompt:
    "Masukkan jenis kelamin yang diinginkan dipisahkan koma (*laki-laki, perempuan, lainnya, lebih_suka_tidak_menyebutkan*). Ketik *Batal* untuk membatalkan.",
  genderPrefInvalid:
    "Jenis kelamin tidak valid. Pilih *laki-laki, perempuan, lainnya*. Coba lagi atau ketik *Batal*.",
  genderPrefUpdated: "✅ Preferensi jenis kelamin diperbarui!",
  phoneVerifyPrompt:
    "📱 *Satu langkah lagi* — verifikasi nomor teleponmu untuk membangun kepercayaan dengan match-mu.\n\n" +
    "Ketuk tombol di bawah untuk membagikan kontakmu. Nomormu hanya terlihat oleh match yang saling suka.",
  phoneVerifyButton: "📲 Bagikan kontakku",
  phoneVerified:
    "✅ Nomor telepon terverifikasi! Profilmu sekarang lengkap. Gunakan *🔍 Cari Match* untuk mulai menemukan orang!",
  phoneSkipped:
    "⚠️ Verifikasi telepon dilewati. Kamu bisa verifikasi nanti di pengaturan.",
  phoneShareOwn: "❌ Harap bagikan kontakmu sendiri.",
  phoneFailed: "Tidak bisa mendapatkan nomor telepon. Coba lagi.",
  reportPrompt: "Apa alasan laporan? Ketik *Batal* untuk membatalkan.",
  reportSubmitted: "✅ Laporan dikirim. Terima kasih!",
  reportError: "❌ Gagal mengirim laporan. Coba lagi.",
  feedbackPrompt:
    "💬 *Umpan Balik*\n\nApa saran atau masukanmu? Ketik *Batal* untuk membatalkan.",
  feedbackSubmitted: "✅ Umpan balik dikirim. Terima kasih!",
  feedbackError: "❌ Gagal mengirim umpan balik. Coba lagi.",
  blockConfirm: "Apakah kamu yakin ingin memblokir pengguna ini?",
  blockSuccess: "✅ Pengguna diblokir.",
  unblockSuccess: "✅ Blokir dibatalkan.",
  mediaPrompt:
    "Kirimkan 1–3 foto atau video untuk profilmu. Ketuk 📎 untuk melampirkan.",
  mediaInvalidType: "❌ Tipe file tidak didukung. Kirim foto atau video.",
  mediaMaxReached: "❌ Maksimal {count}/3 media tercapai.",
  mediaUploadSuccess: "✅ Media diunggah! Sekarang kamu punya {count}/3.",
  mediaUploadError: "❌ Gagal mengunggah media. Coba lagi.",
  mediaDonePrompt: "Kirim lebih banyak atau ketuk ✅ Selesai jika sudah.",
  mediaDoneButton: "✅ Selesai",
  mediaAddMoreButton: "📤 Tambah lagi",
  mediaDeletedCleanup: "🗑️ Media dihapus dari profil.",
  mediaManagerEmpty: "📸 *Manajer Media*\n\nBelum ada media di profilmu.",
  mediaManagerTitle: "📸 *Manajer Media*\n\nMedia profilmu:",
  mediaLimitReached:
    "❌ *Batas unggahan tercapai!*\n\n" +
    "Kamu sudah mencapai batas unggahan harian.\n\n" +
    "🎁 *Dapatkan lebih banyak* dengan mengundang teman atau upgrade ke Premium!",
  mediaRetryPrompt: "❌ Gagal mengunggah. Coba lagi?",
  notificationsTitle: "🔔 *Notifikasi*",
  notificationsEmpty: "Tidak ada notifikasi baru.",
  likeReceived: "❤️ Seseorang menyukaimu!",
  mutualMatch: "🎉 *Match baru!* Kamu dan {name} saling menyukai!",
  matchMessagePrompt: "✉️ Kirim pesan ke match-mu:",
  likeMessagePrompt: "💌 Tambahkan pesan dengan like-mu:",
  likeMessageSent: "✅ Pesan dan like terkirim!",
  menuPrompt: "Ada yang bisa saya bantu?",
  genericError: "❌ Maaf, terjadi kesalahan. Coba lagi nanti.",
  genericCancel: "Batal",
  genericCancelled: "Dibatalkan.",
  fallbackMessage:
    "Saya tidak mengerti maksudmu. Gunakan menu di bawah atau coba /help untuk panduan.",
  notificationsNewLikes: "❤️ {count} orang menyukaimu!",
  notificationsNewMutual: "🎉 Match baru dengan {name}!",
  premiumTitle: "👑 *Premium*",
  premiumSubtitle: "Akses fitur eksklusif dengan Premium:",
  premiumFeatures:
    "• Suka & tidak suka tanpa batas\n" +
    "• Lewati profil yang tidak kamu suka\n" +
    "• Lihat siapa yang menyukaimu\n" +
    "• Kirim DM tanpa batas\n\n" +
    "Ketuk di bawah untuk upgrade!",
  premiumAdDismiss: "Nanti saja",
  matchLikeSuccess: "❤️ Kamu menyukai profil ini!",
  matchDislikeSuccess: "👎 Dilewati.",
  matchSkipSuccess: "⏩ Dilewati.",
  matchLikeLimitReached:
    "🛑 *Batas Like Tercapai*\n\nKamu sudah menggunakan semua like gratis hari ini.\n\nUpgrade ke Premium untuk like tanpa batas, atau bagikan link referal untuk mendapatkan bonus like!",
  matchDislikeLimitReached:
    "🛑 *Batas Dislike Tercapai*\n\nKamu sudah menggunakan semua dislike gratis hari ini.\n\nUpgrade ke Premium untuk dislike tanpa batas, atau bagikan link referal untuk mendapatkan bonus dislike!",
  matchError: "Terjadi kesalahan. Coba lagi.",
  matchItsAMatch:
    "🎉 *Match!*\n\n" +
    "Kamu dan *{name}* saling menyukai! 💕\n\n" +
    "Saatnya memulai sesuatu yang istimewa ✨",
  matchStartChatting: "👉 [Mulai chat dengan {name}](https://t.me/{username})",
  matchSayHiTo: "Say hi ke {pronoun} 👋",
  matchNoUsername:
    "💬 *{name}* belum mengatur username Telegram. Kamu bisa membagikan username-mu!",
  matchesNoMatches:
    "💑 *Belum ada match.*\n\nGunakan *🔍 Cari Match* untuk menemukan orang, lalu like seseorang yang juga menyukaimu!",
  matchesMutualMatchesTitle: "💑 Kamu punya {count} mutual match:",
  matchesPendingLikesTitle: "💕 {count} orang menyukaimu! Lihat sekarang?",
  ageRangeSelectMin: "👇 Pilih usia *minimum*:",
  ageRangeSelectMax: "👇 Pilih usia *maksimum* (harus ≥ {min}):",
  distanceSelect: "👇 Pilih jarak maksimal:",
  genderPrefSelect: "👇 Pilih preferensi jenis kelamin:",
  notificationsCheckMatches: "Kamu punya {items}! Cek di *💕 Match Saya*.",
  dmGated:
    "🔒 *Direct Message adalah fitur Premium*\n\n" +
    "Kirim DM ke siapa saja tanpa menunggu mutual match.\n\n" +
    "*Pilihan:*\n" +
    "• Upgrade ke Premium/Premium+ untuk DM tanpa batas\n" +
    "• Beli 1 DM dengan Telegram Stars (tanpa berlangganan)",
  dmSuccess: "✅ DM terbuka! Kamu sekarang bisa chat *{name}* langsung:",
  dmFailed: "❌ Gagal membuka DM. Coba lagi.",
  dmError: "❌ Terjadi kesalahan. Coba lagi nanti.",
  dmPurchased: "✅ Kamu membeli {count} kredit DM! Total kredit DM: {total}.",
  mediaRequiredPrompt:
    "📸 *Media Diperlukan*\n\nUnggah minimal 1 foto atau video untuk melengkapi profil.",
  mediaManagerItemPhoto: "📷 Foto",
  mediaManagerItemVideo: "🎥 Video",
  mediaManagerDeletePrompt:
    "Ketuk item untuk menghapus, atau unggah lebih banyak:",
  mediaManagerUploadPrompt: "Unggah foto atau video untuk profilmu:",
  mediaDeleteSuccess: "✅ Terhapus!",
  mediaDeleteError: "❌ Gagal menghapus. Coba lagi.",
  matchFallbackNotice:
    "🔍 *Memperluas pencarian…*\n\nPengaturanmu saat ini terlalu ketat. Berikut profil di luar preferensimu — coba like seseorang yang baru!",
  matchAdjustSettingsPrompt:
    "Ketuk ⚙️ Pengaturan untuk mengatur rentang usia, jarak, atau preferensi jenis kelamin.",
  hiddenFromMatches:
    "👋 Profilmu sekarang disembunyikan dari match. Kembali untuk tetap terlihat!",
  reportCancelled: "Laporan dibatalkan.",
  rollbackNoAction:
    "↩️ Tidak ada yang dibatalkan. Kamu belum melakukan aksi apa pun.",
  rollbackSuccess: "↩️ Berhasil dibatalkan! Profil sebelumnya kembali.",
  rollbackGated:
    "🔒 *Undo adalah fitur Premium+*\n\nUpgrade ke Premium atau Premium+ untuk membatalkan aksi terakhirmu!",
  likeMessageSkipButton: "⏭ Lewati",
  giftTitle: "🎁 *Kirim Hadiah*",
  giftSelect:
    "Pilih hadiah yang ingin dikirim:\n\n🌹 Mawar — 10 ⭐\n🍫 Cokelat — 25 ⭐\n🧸 Beruang — 50 ⭐\n💎 Berlian — 100 ⭐",
  giftSent: "🎁 Kamu mengirim *{gift}*! Mereka akan menerimanya segera.",
  giftReceived: "🎁 *Hadiah Baru!*\n\n{name} mengirimmu *{gift}*! 💕",
  giftGated:
    "🔒 *Hadiah adalah fitur Premium*\n\nUpgrade ke Premium untuk mengirim hadiah ke match-mu!",
  giftCancelled: "Hadiah dibatalkan.",
  helpTitle: "🤖 *MeetMatch Bot*",
  helpCommands:
    "*Perintah:*\n*/start* — Mulai\n*/profile* — Lihat atau edit profil\n*/match* — Cari match berikutnya\n*/matches* — Lihat match dan like-mu\n*/settings* — Atur preferensi\n*/referral* — Undang teman untuk bonus swipe\n*/feedback* — Kirim masukan\n*/report* — Laporkan profil\n*/help* — Tampilkan bantuan\n*/about* — Tentang MeetMatch",
  helpTips:
    "*Tips:*\n• Lengkapi profil untuk match yang lebih baik\n• Gunakan */settings* untuk mengatur rentang usia dan jarak\n• Match didasarkan pada minat, lokasi, dan preferensi",
  helpContact: "Butuh bantuan? Hubungi support.",
  aboutTitle: "🌟 *Tentang MeetMatch*",
  aboutDescription:
    "MeetMatch membantu kamu menemukan orang dengan minat serupa di dekatmu.",
  aboutBuiltWith: "Dibangun dengan ❤️ menggunakan tech stack modern.",
  aboutVersion: "*Versi:* `{version}`",
  aboutEnvironment: "*Environment:* {environment}",
  aboutLastUpdated: "*Terakhir diperbarui:* {builtAt}",
  aboutServerAge: "*Usia build:* {serverAge}",
  premiumPurchased:
    "✅ Kamu sekarang di *{tier}*! Nikmati pengalaman yang ditingkatkan.",
  premiumAdPrompt:
    "👑 *Buka Fitur Premium*\n\n" +
    "• Like & dislike tanpa batas\n" +
    "• Lewati profil yang tidak kamu suka\n" +
    "• Lihat siapa yang menyukaimu\n" +
    "• Kirim DM tanpa batas\n\n" +
    "Ketuk di bawah untuk upgrade!",
  giftPremiumTitle: "🎁 *Hadiah Premium*",
  giftPremiumSelect:
    "Pilih paket untuk dihadiahkan:\n\n" +
    "👑 Premium — like tanpa batas, skip, prioritas match\n" +
    "💎 Premium+ — semua fitur Premium + DM tanpa batas, badge verifikasi",
  giftPremiumSent:
    "✅ Kamu memberikan *{tier}* ke *{name}*! Semoga mereka suka! 💕",
  giftPremiumReceived:
    "🎁 *Kejutan!*\n\n*{name}* memberikanmu *{tier}*! Nikmati pengalaman yang ditingkatkan! 💕",
  giftPremiumError:
    "❌ Gagal memproses hadiah. Hubungi support jika kamu sudah membayar.",
  // --- Settings labels ---
  settingsCurrentPreferences: "*Preferensi Saat Ini:*",
  settingsAgeRangeLabel: "🎯 Rentang Usia: {value}",
  settingsMaxDistanceLabel: "📍 Jarak Maksimal: {value}",
  settingsGenderPrefLabel: "⚧ Preferensi Gender: {value}",
  settingsLanguageLabel: "🌐 Bahasa: {value}",
  settingsTapToChange: "Ketuk bidang di bawah untuk mengubahnya:",
  settingsLanguageSelect: "🌐 *Pilih Bahasa*\n\nSaat ini: {value}",
  settingsClose: "Pengaturan ditutup.",
  // --- Matches ---
  matchesMutualMatchesCount: "💑 Kamu punya {count} mutual match:",
  matchesNewMutualMatches: "💕 Kamu punya {count} mutual match baru!",
  matchesNewLikes: "💕 {count} orang menyukaimu! Mau lihat?",
  matchesNavigatePrompt: "Gunakan menu di bawah untuk navigasi:",
  matchesChatWith: "💬 Chat dengan {name}",
  matchesNoUsernameSet: "💬 {name} (belum set username)",
  matchesMatchedAt: "Match pada: {time}",
  matchesMatchedRecently: "baru saja",
  matchesDismissAll: "⏭ Abaikan semua",
  matchesDismissed: "Diabaikan.",
  matchesSeeAnytime: "💕 Kamu bisa lihat like kapan saja dengan /matches.",
  matchesLoadingProfile: "Memuat profil...",
  matchesLikeBack: "❤️ Like back",
  matchesPass: "👎 Lewati",
  matchesCouldNotLoad: "Gagal memuat profil. Coba lagi.",
  matchesUnknownAction: "Aksi tidak dikenal.",
  // --- Match card & actions ---
  matchCardMale: "L",
  matchCardFemale: "P",
  matchCardOther: "L",
  matchMainMenu: "🏠 Menu utama",
  matchSendGift: "🎁 Kirim hadiah",
  matchSendDM: "📩 Kirim DM",
  matchGiftPremium: "🎁 Gift Premium",
  matchBlock: "🚫 Blokir",
  matchTapToPay: "Ketuk tombol di bawah untuk membayar dengan Telegram Stars.",
  matchGiftPremiumPaymentTitle: "🎁 Gift Premium",
  matchNoMatchesFoundTitle: "🔍 *Belum ada match saat ini*",
  matchNoMatchesFoundBody:
    "Komunitas kami masih berkembang. Undang teman untuk menemukan lebih banyak orang dan dapatkan bonus like!\n\nAtau perluas pencarianmu di *⚙️ Pengaturan*",
  matchRelaxedSearchTitle: "🔍 *Menampilkan profil di luar preferensimu*",
  matchRelaxedSearchBody:
    "Kami memperluas pencarianmu sedikit untuk membantu menemukan lebih banyak orang di dekatmu.",
  matchCouldNotIdentify: "Tidak bisa mengenali kamu. Coba lagi.",
  matchOwnProfile: "❌ Kamu tidak bisa berinteraksi dengan profilmu sendiri.",
  matchProcessing: "Memproses... mohon tunggu.",
  matchFailedToShow: "❌ Gagal menampilkan profil. Coba /match lagi.",
  // --- Profile ---
  profileYourProfile: "👤 Profilmu",
  profileNameLabel: "Nama: {value}",
  profileAgeLabel: "Umur: {value}",
  profileGenderLabel: "Gender: {value}",
  profileBioLabel: "Bio: {value}",
  profileLocationLabel: "Lokasi: {value}",
  profileInterestsLabel: "Minat: {value}",
  profileMediaLabel: "Media: {value}",
  profileInterestsNotSet: "Belum diatur",
  profileCompleteReady: "✅ Profil lengkap — Siap match",
  profileSelectField: "Pilih bidang yang ingin diedit:",
  profileUploadMedia: "📤 Unggah Media",
  profileBackToProfile: "← Kembali ke Profil",
  profileUploadMore: "📤 Unggah Lagi",
  profileMediaUploaded: "{count}/3 diunggah",
  profileNavigatePrompt: "👇 Gunakan menu di bawah untuk navigasi:",
  // --- Premium ---
  premiumCurrentPlan: "*Paket saat ini:* {plan}",
  premiumExpires: "📅 Berlaku hingga: {date}",
  premiumFreePlan: "*Paket Gratis:*",
  premiumFeatureBrowse: "• Jelajahi profil tanpa batas",
  premiumFeatureLikes: "• {likes} like + {dislikes} dislike per hari",
  premiumFeatureNoSkip: "• Tidak bisa skip (hanya Like atau Dislike)",
  premiumFeatureUnlimited: "• Like & dislike tanpa batas",
  premiumFeatureSkip: "• ⏩ Skip profil",
  premiumFeaturePriority: "• Prioritas match",
  premiumFeatureSeeLikes: "• Lihat siapa yang menyukaimu",
  premiumFeatureDMs: "• DM langsung tanpa batas",
  premiumFeatureVerified: "• Badge terverifikasi",
  premiumFeatureAdvancedFilters: "• Filter lanjutan",
  premiumBuyPremium: "⭐ Beli Premium ({stars} Stars)",
  premiumBuyPremiumPlus: "💎 Beli Premium+ ({stars} Stars)",
  premiumShareForBonus: "🎁 Bagikan untuk Bonus Gratis",
  premiumClose: "❌ Tutup",
  premiumInvoiceTitlePremium: "MeetMatch Premium",
  premiumInvoiceDescPremium:
    "Upgrade ke Premium — like tanpa batas, skip, prioritas match, dan lihat siapa yang menyukaimu.",
  premiumInvoiceTitlePlus: "MeetMatch Premium+",
  premiumInvoiceDescPlus:
    "Upgrade ke Premium+ — semua fitur Premium plus DM tanpa batas, badge terverifikasi, dan filter lanjutan.",
  // --- Referral ---
  referralTitle: "🎁 *Undang Teman, Dapatkan Bonus*",
  referralBody:
    "Bagikan link referalmu dengan teman. Ketika mereka bergabung dan melengkapi profil, *kalian berdua dapat +5 bonus like & dislike!*",
  referralFriendsInvited: "👥 *Teman diundang:* {count}",
  referralBonusEarned: "⭐ *Bonus didapat:* +{count} like/dislike",
  referralYourCode: "*Kode referalmu:* `{code}`",
  referralYourLink: "*Linkmu:* {link}",
  referralShareOnTelegram: "📤 Bagikan di Telegram",
  referralCopyLink: "📋 Salin Link",
  referralClose: "❌ Tutup",
  referralShareText: "Bergabung di MeetMatch! 🎁",
  // --- Misc ---
  mainMenuPrompt: "Menu utama:",
  reportCommandHint:
    "⚠️ Untuk melaporkan profil, ketuk tombol ⚠️ saat melihat kartu match.",
  closeSettings: "Pengaturan ditutup.",
  itemNotFound: "Item tidak ditemukan.",
  genderPronounHim: "dia",
  genderPronounHer: "dia",
  genderPronounThem: "mereka",
  unknownAction: "Aksi tidak dikenal.",
  loading: "Memuat...",
  notificationLikeMedia:
    "\n\n📎 Mereka juga mengirim foto/video dengan like-nya.",
  notificationLikeCTA:
    " Gunakan *💕 Match Saya* untuk melihat siapa yang menyukaimu.",
  notificationMutualMatchChat: "\n\n👉 [Mulai chat](https://t.me/{username})",
  notificationMutualMatchView: "💕 Lihat Match",
  notificationGiftPremiumView: "👑 Lihat Premium",
  notificationBirthdayView: "💕 Lihat Match",
  notificationReengagementFindMatch: "🔍 Cari Match",
  notificationCleanupGoToProfile: "👤 Ke Profil",
  // --- Conversations ---
  conversationBirthDateUpdateRequired:
    "📢 *Pembaruan Profil Diperlukan*\n\nKami telah memperbarui cara penyimpanan umur. Masukkan tanggal lahirmu untuk melanjutkan.\n\nMasukkan tanggal lahir dalam format *DD.MM.YYYY* (contoh: *15.03.1995*).",
  conversationLocationSaved:
    "📍 *{city}, {country}* tersimpan!\n\nKami belum bisa memverifikasi koordinat tepatnya, tetapi kotamu sudah tercatat. Pencocokan jarak akan berfungsi setelah kami memverifikasinya.",
  conversationLocationVerified: "📍 Lokasi terverifikasi: *{city}, {country}*",
  // --- Error feedback ---
  errorTraceId: "\n🔍 Trace ID: `{traceId}`",
  errorCommandContext: "\n📍 Perintah: /{command}",
  errorActionContext: "🎬 Aksi: {action}",
  errorReportPrompt:
    "\nJika ini terus terjadi, ketuk *Laporkan* di bawah dan ceritakan apa yang sedang kamu lakukan.",
  errorReportTitle: "🐛 *Laporan Error*",
  errorReportUser: "*Pengguna:* {userId}",
  errorReportTraceId: "*Trace ID:* `{traceId}`",
  errorReportTime: "*Waktu:* {time}",
  errorReportJourney: "*Aktivitas Terbaru:*",
  errorReportNoActivity: "Tidak ada aktivitas terbaru.",
  errorReportSent: "✅ Laporan terkirim! Kami akan mengeceknya.",
  errorReportFailed: "❌ Gagal mengirim laporan. Coba lagi.",
  errorReportThankYou: "Laporan terkirim. Terima kasih!",
  errorReportButton: "🐛 Laporkan Masalah",
  errorMainMenuButton: "🏠 Menu utama",
};

const dictionaries: Record<Language, Translations> = { en, id };

export function escapeMd(value: string): string {
  return value.replace(/[_*\[\]`\\]/g, "\\$&");
}

export function escapeMarkdownV2(value: string): string {
  return value.replace(/[_*\[\]()~`>#+=|{}\.!\\-]/g, "\\$&");
}

/**
 * Tagged template literal for MarkdownV2 captions/messages.
 * Automatically escapes all interpolated values while preserving
 * intentional formatting in the static template parts.
 *
 * Usage:
 *   mdv2`👤 *Your Profile*\n\n*Name:* ${rawDisplayName}`
 */
export function mdv2(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce((result, str, i) => {
    const val = values[i];
    const escaped = val !== undefined ? escapeMarkdownV2(String(val)) : "";
    return result + str + escaped;
  }, "");
}

export function t(
  key: keyof Translations,
  lang: Language = DEFAULT_LANGUAGE,
  vars?: Record<string, string>,
): string {
  const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANGUAGE];
  let text = dict[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, escapeMd(v));
    }
  }
  return text;
}
