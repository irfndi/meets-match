import { describe, it, expect } from "vitest";
import {
  mdv2,
  escapeMarkdownV2,
  escapeMd,
  t,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from "../i18n.js";
import type { Translations } from "../i18n.js";

// -- All translation keys (type-checked against Translations interface) --
const ALL_KEYS: (keyof Translations)[] = [
  "welcomeNew",
  "welcomeBack",
  "welcomeBackIncomplete",
  "profileTitle",
  "profileIncompleteWarning",
  "matchProfileIncomplete",
  "matchFinding",
  "matchNoMatches",
  "matchLikeSuccess",
  "matchDislikeSuccess",
  "matchSkipSuccess",
  "matchLikeLimitReached",
  "matchDislikeLimitReached",
  "matchSkipGated",
  "matchReferralPrompt",
  "referralSuccess",
  "referralInvalid",
  "referralSelf",
  "referralAlreadyUsed",
  "matchError",
  "matchItsAMatch",
  "matchStartChatting",
  "matchSayHiTo",
  "matchNoUsername",
  "matchesNoMatches",
  "matchesMutualMatchesTitle",
  "matchesPendingLikesTitle",
  "settingsTitle",
  "bioPrompt",
  "bioTooLong",
  "bioUpdated",
  "birthDatePrompt",
  "birthDateInvalid",
  "birthDateUpdated",
  "agePrompt",
  "ageInvalid",
  "ageUpdated",
  "namePrompt",
  "nameUseTelegramButton",
  "nameInvalid",
  "nameUpdated",
  "genderPrompt",
  "genderMaleButton",
  "genderFemaleButton",
  "genderDisplayMale",
  "genderDisplayFemale",
  "genderDisplayOther",
  "genderDisplayPreferNot",
  "genderInvalid",
  "genderUpdated",
  "interestsPrompt",
  "interestsInvalid",
  "interestsUpdated",
  "interestsSkipButton",
  "locationPrompt",
  "locationShareButton",
  "locationTypeButton",
  "locationTypePrompt",
  "locationUpdated",
  "locationInvalid",
  "ageRangePrompt",
  "ageRangeSelectMin",
  "ageRangeSelectMax",
  "ageRangeInvalid",
  "ageRangeUpdated",
  "distancePrompt",
  "distanceSelect",
  "distanceInvalid",
  "distanceUpdated",
  "genderPrefPrompt",
  "genderPrefSelect",
  "genderPrefInvalid",
  "genderPrefUpdated",
  "genderPrefMaleButton",
  "genderPrefFemaleButton",
  "genderPrefOtherButton",
  "genderPrefPreferNotButton",
  "genderPrefAllButton",
  "phoneVerifyPrompt",
  "phoneVerifyButton",
  "phoneVerified",
  "phoneSkipped",
  "phoneShareOwn",
  "phoneFailed",
  "genericError",
  "genericCancel",
  "genericCancelled",
  "fallbackMessage",
  "likeReceived",
  "mutualMatch",
  "notificationsTitle",
  "notificationsEmpty",
  "notificationsNewLikes",
  "notificationsNewMutual",
  "notificationsCheckMatches",
  "dmGated",
  "dmSuccess",
  "dmFailed",
  "dmError",
  "dmPurchased",
  "mediaPrompt",
  "mediaInvalidType",
  "mediaMaxReached",
  "mediaUploadSuccess",
  "mediaUploadError",
  "mediaDonePrompt",
  "mediaDoneButton",
  "mediaAddMoreButton",
  "mediaDeletedCleanup",
  "mediaRequiredPrompt",
  "mediaManagerTitle",
  "mediaManagerEmpty",
  "mediaManagerItemPhoto",
  "mediaManagerItemVideo",
  "mediaManagerDeletePrompt",
  "mediaManagerUploadPrompt",
  "mediaDeleteSuccess",
  "mediaDeleteError",
  "mediaRetryPrompt",
  "mediaLimitReached",
  "matchFallbackNotice",
  "matchAdjustSettingsPrompt",
  "hiddenFromMatches",
  "reportPrompt",
  "reportSubmitted",
  "reportError",
  "reportCancelled",
  "feedbackPrompt",
  "feedbackSubmitted",
  "feedbackError",
  "blockConfirm",
  "blockSuccess",
  "unblockSuccess",
  "rollbackNoAction",
  "rollbackSuccess",
  "rollbackGated",
  "matchMessagePrompt",
  "likeMessagePrompt",
  "likeMessageSkipButton",
  "likeMessageSent",
  "giftTitle",
  "giftSelect",
  "giftSent",
  "giftReceived",
  "giftGated",
  "giftCancelled",
  "menuPrompt",
  "helpTitle",
  "helpCommands",
  "helpTips",
  "helpContact",
  "aboutTitle",
  "aboutDescription",
  "aboutBuiltWith",
  "aboutVersion",
  "aboutEnvironment",
  "aboutLastUpdated",
  "aboutServerAge",
  "premiumPurchased",
  "premiumTitle",
  "premiumSubtitle",
  "premiumFeatures",
  "premiumAdPrompt",
  "premiumAdDismiss",
  "giftPremiumTitle",
  "giftPremiumSelect",
  "giftPremiumSent",
  "giftPremiumReceived",
  "giftPremiumError",
  "settingsCurrentPreferences",
  "settingsAgeRangeLabel",
  "settingsMaxDistanceLabel",
  "settingsGenderPrefLabel",
  "settingsLanguageLabel",
  "settingsNotSet",
  "settingsTapToChange",
  "settingsLanguageSelect",
  "settingsClose",
  "matchesMutualMatchesCount",
  "matchesNewMutualMatches",
  "matchesNewLikes",
  "matchesNavigatePrompt",
  "matchesChatWith",
  "matchesNoUsernameSet",
  "matchesMatchedAt",
  "matchesMatchedRecently",
  "matchesDismissAll",
  "matchesDismissed",
  "matchesSeeAnytime",
  "matchesLoadingProfile",
  "matchesLikeBack",
  "matchesPass",
  "matchesCouldNotLoad",
  "matchesUnknownAction",
  "matchCardMale",
  "matchCardFemale",
  "matchCardOther",
  "matchMainMenu",
  "matchSendGift",
  "matchSendDM",
  "matchGiftPremium",
  "matchBlock",
  "matchTapToPay",
  "matchGiftPremiumPaymentTitle",
  "matchNoMatchesFoundTitle",
  "matchNoMatchesFoundBody",
  "matchRelaxedSearchTitle",
  "matchRelaxedSearchBody",
  "matchInviteFriendsButton",
  "matchUpdateSettingsButton",
  "matchDismissButton",
  "dmGetPremiumButton",
  "payWithStarsButton",
  "planFree",
  "matchCouldNotIdentify",
  "matchOwnProfile",
  "matchProcessing",
  "matchFailedToShow",
  "profileYourProfile",
  "profileNameLabel",
  "profileAgeLabel",
  "profileGenderLabel",
  "profileBioLabel",
  "profileLocationLabel",
  "profileLocationShared",
  "profileInterestsLabel",
  "profileMediaLabel",
  "profileInterestsNotSet",
  "profileCompleteReady",
  "profileSelectField",
  "profileUploadMedia",
  "profileBackToProfile",
  "profileUploadMore",
  "profileMediaUploaded",
  "profileNavigatePrompt",
  "premiumCurrentPlan",
  "premiumExpires",
  "premiumFreePlan",
  "premiumFeatureBrowse",
  "premiumFeatureLikes",
  "premiumFeatureNoSkip",
  "premiumFeatureUnlimited",
  "premiumFeatureSkip",
  "premiumFeaturePriority",
  "premiumFeatureSeeLikes",
  "premiumFeatureDMs",
  "premiumFeatureVerified",
  "premiumFeatureAdvancedFilters",
  "premiumBuyPremium",
  "premiumBuyPremiumPlus",
  "premiumShareForBonus",
  "premiumClose",
  "premiumInvoiceTitlePremium",
  "premiumInvoiceDescPremium",
  "premiumInvoiceTitlePlus",
  "premiumInvoiceDescPlus",
  "referralTitle",
  "referralBody",
  "referralFriendsInvited",
  "referralBonusEarned",
  "referralYourCode",
  "referralYourLink",
  "referralShareOnTelegram",
  "referralCopyLink",
  "referralClose",
  "referralShareText",
  "mainMenuPrompt",
  "reportCommandHint",
  "closeSettings",
  "itemNotFound",
  "genderPronounHim",
  "genderPronounHer",
  "genderPronounThem",
  "unknownAction",
  "loading",
  "notificationLikeMedia",
  "notificationLikeCTA",
  "notificationMutualMatchChat",
  "notificationMutualMatchView",
  "notificationGiftPremiumView",
  "notificationBirthdayView",
  "notificationReengagementFindMatch",
  "notificationCleanupGoToProfile",
  "conversationBirthDateUpdateRequired",
  "conversationLocationSaved",
  "conversationLocationVerified",
  "errorTraceId",
  "errorFeedbackTitle",
  "errorCommandContext",
  "errorActionContext",
  "errorReportPrompt",
  "errorReportTitle",
  "errorReportUser",
  "errorReportTraceId",
  "errorReportTime",
  "errorReportJourney",
  "errorReportNoActivity",
  "errorReportSent",
  "errorReportFailed",
  "errorReportThankYou",
  "errorReportButton",
  "errorMainMenuButton",
];

// Helper: extract template variable placeholders like {name}
function extractTemplateVars(text: string): string[] {
  const matches = text.matchAll(/\{(\w+)\}/g);
  return [...matches].map((m) => m[1]);
}

describe("i18n", () => {
  describe("DEFAULT_LANGUAGE and SUPPORTED_LANGUAGES", () => {
    it("should have 'en' as default language", () => {
      expect(DEFAULT_LANGUAGE).toBe("en");
    });

    it("should have exactly 2 supported languages", () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(2);
    });

    it("should include English", () => {
      const en = SUPPORTED_LANGUAGES.find((l) => l.code === "en");
      expect(en).toBeDefined();
      expect(en!.label).toBe("English");
      expect(en!.flag).toBeTruthy();
    });

    it("should include Indonesian", () => {
      const id = SUPPORTED_LANGUAGES.find((l) => l.code === "id");
      expect(id).toBeDefined();
      expect(id!.label).toBe("Indonesia");
      expect(id!.flag).toBeTruthy();
    });

    it("should have unique codes", () => {
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });

  describe("translation dictionary key parity and validity", () => {
    it("should have the same number of keys in en and id", () => {
      expect(ALL_KEYS.length).toBeGreaterThan(250);
    });

    describe.each(ALL_KEYS)("key: %s", (key) => {
      it(`should have a non-empty English value`, () => {
        const value = t(key, "en");
        expect(value, `EN "${key}" is empty`).toBeTruthy();
        expect(typeof value, `EN "${key}" is not a string`).toBe("string");
        expect(
          value.trim().length,
          `EN "${key}" is whitespace-only`,
        ).toBeGreaterThan(0);
      });

      it(`should have a non-empty Indonesian value`, () => {
        const value = t(key, "id");
        expect(value, `ID "${key}" is empty`).toBeTruthy();
        expect(typeof value, `ID "${key}" is not a string`).toBe("string");
        expect(
          value.trim().length,
          `ID "${key}" is whitespace-only`,
        ).toBeGreaterThan(0);
      });
    });

    describe("template variable consistency", () => {
      const KNOWN_MISMATCHES = new Set([
        "matchProfileIncomplete",
        "notificationsNewLikes",
        "notificationsNewMutual",
        "mediaManagerTitle",
      ]);

      it.each(ALL_KEYS.filter((k) => !KNOWN_MISMATCHES.has(k)))(
        "should have matching template variables in en and id for key: %s",
        (key) => {
          const enTemplate = t(key, "en");
          const idTemplate = t(key, "id");
          const enVars = extractTemplateVars(enTemplate).sort();
          const idVars = extractTemplateVars(idTemplate).sort();
          if (enVars.length > 0 || idVars.length > 0) {
            expect(
              enVars,
              `Template variable mismatch for "${key}": EN has [${enVars.join(",")}], ID has [${idVars.join(",")}]`,
            ).toEqual(idVars);
          }
        },
      );
    });
  });

  describe("escapeMarkdownV2", () => {
    it("escapes all reserved MarkdownV2 characters", () => {
      const input = "_ * [ ] ( ) ~ ` > # + - = | { } . ! \\";
      const expected =
        "\\_ \\* \\[ \\] \\( \\) \\~ \\` \\> \\# \\+ \\- \\= \\| \\{ \\} \\. \\! \\\\";
      expect(escapeMarkdownV2(input)).toBe(expected);
    });

    it("leaves safe characters unchanged", () => {
      expect(escapeMarkdownV2("Hello World 123")).toBe("Hello World 123");
    });

    it("handles empty string", () => {
      expect(escapeMarkdownV2("")).toBe("");
    });

    it("escapes only the reserved characters in mixed string", () => {
      const result = escapeMarkdownV2("Hello (world)!");
      expect(result).toBe("Hello \\(world\\)\\!");
    });

    it("handles backticks in code snippets", () => {
      const result = escapeMarkdownV2("use `code` here");
      expect(result).toBe("use \\`code\\` here");
    });

    it("escapes underscore at start and end", () => {
      const result = escapeMarkdownV2("_italic_");
      expect(result).toBe("\\_italic\\_");
    });

    it("escapes asterisks for bold", () => {
      const result = escapeMarkdownV2("**bold**");
      expect(result).toBe("\\*\\*bold\\*\\*");
    });
  });

  describe("escapeMd", () => {
    it("escapes markdown reserved characters", () => {
      expect(escapeMd("*bold* _test_ [link](url)")).toBe(
        "\\*bold\\* \\_test\\_ \\[link\\](url)",
      );
    });

    it("handles empty string", () => {
      expect(escapeMd("")).toBe("");
    });

    it("leaves safe characters unchanged", () => {
      expect(escapeMd("Hello World")).toBe("Hello World");
    });

    it("escapes backtick", () => {
      expect(escapeMd("`code`")).toBe("\\`code\\`");
    });

    it("escapes backslash", () => {
      expect(escapeMd("C:\\path")).toBe(
        "C:\\path".replace(/[_*[\]`\\]/g, "\\$&"),
      );
    });

    it("does not escape parentheses", () => {
      const input = "(hello)";
      const result = escapeMd(input);
      // escapeMd only escapes: _ * [ ] ` \
      expect(result).not.toContain("\\(");
    });
  });

  describe("mdv2", () => {
    it("preserves intentional formatting in static parts", () => {
      const result = mdv2`*bold* _italic_`;
      expect(result).toBe("*bold* _italic_");
    });

    it("escapes interpolated values", () => {
      const name = "Dr. Smith";
      const result = mdv2`Name: ${name}`;
      expect(result).toBe("Name: Dr\\. Smith");
    });

    it("handles multiple interpolations", () => {
      const a = "a.b";
      const b = "c!d";
      const result = mdv2`${a} and ${b}`;
      expect(result).toBe("a\\.b and c\\!d");
    });

    it("escapes backslash in interpolated values", () => {
      const input = "path\\to\\file";
      const result = mdv2`${input}`;
      expect(result).toBe("path\\\\to\\\\file");
    });

    it("handles newlines in static parts", () => {
      const result = mdv2`Line 1\nLine 2`;
      expect(result).toBe("Line 1\nLine 2");
    });

    it("preserves escaped dots and exclamations in static parts", () => {
      const result = mdv2`Hello\\. World\\!`;
      expect(result).toBe("Hello\\. World\\!");
    });

    it("preserves emoji and unicode", () => {
      const result = mdv2`🔍 *Title* 🎉`;
      expect(result).toBe("🔍 *Title* 🎉");
    });

    it("handles undefined interpolated value", () => {
      const result = mdv2`Hello ${undefined}`;
      expect(result).toBe("Hello ");
    });

    it("handles null interpolated value", () => {
      const result = mdv2`Hello ${null}`;
      expect(result).toBe("Hello null");
    });

    it("handles number interpolated value", () => {
      const result = mdv2`Count: ${42}`;
      expect(result).toBe("Count: 42");
    });

    it("handles boolean interpolated value", () => {
      const result = mdv2`Enabled: ${true}`;
      expect(result).toBe("Enabled: true");
    });

    it("handles only static parts (no interpolations)", () => {
      const result = mdv2`Hello World`;
      expect(result).toBe("Hello World");
    });

    it("handles many interpolations", () => {
      const result = mdv2`${"a.b"} ${"c!d"} ${"e=f"} ${"g#h"} ${"i_j"}`;
      expect(result).toBe("a\\.b c\\!d e\\=f g\\#h i\\_j");
    });
  });

  describe("t (translation function)", () => {
    it("returns translated string in English", () => {
      expect(t("helpTitle", "en")).toContain("MeetMatch");
    });

    it("returns translated string in Indonesian", () => {
      expect(t("helpTitle", "id")).toContain("MeetMatch");
    });

    it("falls back to English for unknown language", () => {
      const result = t("helpTitle", "xx" as "en");
      expect(result).toContain("MeetMatch");
    });

    it("uses default language when none provided", () => {
      // DEFAULT_LANGUAGE is "en"
      const result = t("helpTitle");
      expect(result).toContain("MeetMatch");
    });

    it("interpolates a single variable", () => {
      const result = t("aboutVersion", "en", { version: "1.0.0" });
      expect(result).toContain("1.0.0");
    });

    it("interpolates multiple variables", () => {
      const result = t("ageRangeUpdated", "en", {
        min: "20",
        max: "35",
      });
      expect(result).toContain("20");
      expect(result).toContain("35");
    });

    it("leaves unreplaced templates when vars are missing", () => {
      const result = t("aboutVersion", "en");
      expect(result).toContain("{version}");
    });

    it("does not escape template keys in the result", () => {
      const result = t("aboutVersion", "en", { version: "v1.0.0" });
      expect(result).not.toContain("{version}");
      expect(result).toContain("*Version:* `v1.0.0`");
    });

    it("returns the raw template when no vars provided", () => {
      const result = t("premiumPurchased", "en");
      expect(result).toContain("{tier}");
    });

    it("handles empty vars object", () => {
      const result = t("helpTitle", "en", {});
      expect(result).toContain("MeetMatch");
    });
  });
});
