import { describe, it, expect } from "vitest";
import { mdv2, escapeMarkdownV2, escapeMd, t } from "../i18n.js";

describe("i18n utilities", () => {
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
      // In template literal source, \\. produces \\. in cooked string
      // which mdv2 includes as-is, resulting in escaped dot in output
      const result = mdv2`Hello\\. World\\!`;
      expect(result).toBe("Hello\\. World\\!");
    });

    it("preserves emoji and unicode", () => {
      const result = mdv2`🔍 *Title* 🎉`;
      expect(result).toBe("🔍 *Title* 🎉");
    });
  });

  describe("escapeMd", () => {
    it("escapes markdown reserved characters", () => {
      expect(escapeMd("*bold* _test_ [link](url)")).toBe(
        "\\*bold\\* \\\_test\\_ \\[link\\](url)",
      );
    });
  });

  describe("t", () => {
    it("returns translated string", () => {
      expect(t("helpTitle", "en")).toContain("MeetMatch");
    });

    it("falls back to English for unknown language", () => {
      expect(t("helpTitle", "xx" as any)).toContain("MeetMatch");
    });

    it("interpolates variables", () => {
      expect(t("aboutVersion", "en", { version: "1.0.0" })).toContain("1.0.0");
    });
  });
});
