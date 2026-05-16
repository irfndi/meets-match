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
  profileSelectField: "Tap a field below to edit it:",
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
    "*Commands:*\n*/start* — Get started\n*/profile* — View or edit your profile\n*/match* — Find your next match\n*/matches* — View your matches and likes\n*/settings* — Adjust your preferences\n*/help* — Show this help\n*/about* — About MeetMatch",
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
};

const id: Translations = {
  welcomeNew:
    "👋 *Selamat datang di MeetMatch!*\n\n" +
    "Saya di sini untuk membantu kamu menemukan koneksi yang bermakna dengan orang-orang yang memiliki minat serupa.\n\n" +
    "Mari mulai — ketuk *👤 Profil* di bawah untuk mengatur profilmu, lalu temukan match!",
  welcomeBack: "👋 *Selamat datang kembali!*",
  welcomeBackIncomplete:
    "👋 *Selamat datang kembali!*\n\nProfilmu belum lengkap. Yang kurang: {missing}\n\nKetuk *👤 Profil* untuk melengkapi.",
  profileTitle: "👤 *Profilmu*",
  profileIncompleteWarning:
    "⚠️ Profilmu belum lengkap. Lengkapi profil untuk mulai mencari match.",
  profileSelectField: "Pilih bagian profil yang ingin diubah:",
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
    "Rentang usia match yang diinginkan? Masukkan format *min-max* (contoh: *18-25*). Ketik *Batal* untuk membatalkan.",
  ageRangeInvalid:
    "Rentang usia tidak valid. Gunakan format *min-max* (contoh: *18-25*). Coba lagi atau ketik *Batal*.",
  ageRangeUpdated: "✅ Rentang usia diperbarui!",
  distancePrompt:
    "Jarak maksimal match (km)? Masukkan angka (5–500). Ketik *Batal* untuk membatalkan.",
  distanceInvalid:
    "Jarak tidak valid. Harus antara 5–500 km. Coba lagi atau ketik *Batal*.",
  distanceUpdated: "✅ Jarak diperbarui!",
  genderPrefPrompt:
    "Jenis kelamin match yang diinginkan? Pilih atau masukkan dipisahkan koma (*laki-laki, perempuan, lainnya*). Ketik *Batal* untuk membatalkan.",
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
  matchLikeSuccess: "❤️ You liked this profile!",
  matchDislikeSuccess: "👎 Skipped.",
  matchSkipSuccess: "⏩ Skipped.",
  matchLikeLimitReached:
    "🛑 *Like Limit Reached*\n\nYou've used all your free likes for today.\n\nUpgrade to Premium for unlimited likes, or share your referral link to earn bonus likes!",
  matchDislikeLimitReached:
    "🛑 *Dislike Limit Reached*\n\nYou've used all your free dislikes for today.\n\nUpgrade to Premium for unlimited dislikes, or share your referral link to earn bonus likes!",
  matchError: "Something went wrong. Please try again.",
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
  ageRangeSelectMin: "👇 Select *minimum* age:",
  ageRangeSelectMax: "👇 Select *maximum* age (must be ≥ {min}):",
  distanceSelect: "👇 Select max distance:",
  genderPrefSelect: "👇 Select gender preference:",
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
  mediaRequiredPrompt:
    "📸 *Media Required*\n\nPlease upload at least 1 photo or video to complete your profile.",
  mediaManagerItemPhoto: "📷 Photo",
  mediaManagerItemVideo: "🎥 Video",
  mediaManagerDeletePrompt: "Tap an item to delete it, or upload more:",
  mediaManagerUploadPrompt: "Upload photos or videos to show on your profile:",
  mediaDeleteSuccess: "✅ Deleted!",
  mediaDeleteError: "❌ Failed to delete. Please try again.",
  matchFallbackNotice:
    "🔍 *Broadening your search…*\n\nYour current settings are a bit restrictive. Here are some profiles outside your usual preferences — try liking someone new!",
  matchAdjustSettingsPrompt:
    "Tap ⚙️ Settings to adjust your age range, distance, or gender preferences.",
  hiddenFromMatches:
    "👋 Your profile is now hidden from matches. Come back to stay visible!",
  reportCancelled: "Report cancelled.",
  rollbackNoAction:
    "↩️ Nothing to undo. You haven't taken any action on a profile yet.",
  rollbackSuccess: "↩️ Undone! The previous profile is back.",
  rollbackGated:
    "🔒 *Undo is a Premium+ feature*\n\nUpgrade to Premium or Premium+ to undo your last action!",
  likeMessageSkipButton: "⏭ Skip",
  giftTitle: "🎁 *Send a Gift*",
  giftSelect:
    "Choose a gift to send:\n\n🌹 Rose — 10 ⭐\n🍫 Chocolate — 25 ⭐\n🧸 Teddy Bear — 50 ⭐\n💎 Diamond — 100 ⭐",
  giftSent: "🎁 You sent a *{gift}*! They'll receive it soon.",
  giftReceived: "🎁 *New Gift!*\n\n{name} sent you a *{gift}*! 💕",
  giftGated:
    "🔒 *Gifts are a Premium feature*\n\nUpgrade to Premium to send gifts to your matches!",
  giftCancelled: "Gift cancelled.",
  helpTitle: "🤖 *MeetMatch Bot*",
  helpCommands:
    "*Commands:*\n*/start* — Get started\n*/profile* — View or edit your profile\n*/match* — Find your next match\n*/matches* — View your matches and likes\n*/settings* — Adjust your preferences\n*/help* — Show this help\n*/about* — About MeetMatch",
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
  premiumAdPrompt:
    "👑 *Unlock Premium Features*\n\n" +
    "• Unlimited likes & dislikes\n" +
    "• Skip profiles you don't like\n" +
    "• See who liked you\n" +
    "• Send unlimited DMs\n\n" +
    "Tap below to upgrade!",
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
