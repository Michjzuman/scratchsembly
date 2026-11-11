import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  getLanguage,
  loadLanguage,
  localizeMessage,
  setLanguage,
  statementText,
  t,
} from "./i18n";
import { exampleBlocks } from "./examples";
import { EXAMPLES } from "./blocks";
import { compile } from "./engine/compiler";
import { initialState } from "./engine/cpu";

const key = "assembly-playground.language";
afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage(DEFAULT_LANGUAGE);
});

function preference(value: string | null) {
  const getItem = vi.fn((name: string) => (name === key ? value : null));
  vi.stubGlobal("localStorage", { getItem });
  return getItem;
}

describe("English defaults and explicit language preferences", () => {
  it("starts in English and lists English first", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(getLanguage()).toBe("en");
    expect(LANGUAGES[0]).toEqual({ value: "en", label: "English" });
    expect(t("Deutsch", "English")).toBe("English");
    expect(statementText("setze", "set", "mov")).toBe("set");
  });

  it.each([null, "", "fr", "invalid"])(
    "falls back to English for preference %s",
    (value) => {
      const getItem = preference(value);
      expect(loadLanguage()).toBe("en");
      expect(getItem).toHaveBeenCalledWith(key);
    },
  );

  it.each(["en", "de", "asm"] as const)(
    "preserves the saved %s preference",
    (value) => {
      preference(value);
      expect(loadLanguage()).toBe(value);
    },
  );

  it("still defaults to English when storage is inaccessible", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Storage blocked");
      },
    });
    expect(loadLanguage()).toBe("en");
  });

  it("updates the document language, including English for mnemonic mode", () => {
    const root = { lang: "en" };
    vi.stubGlobal("document", { documentElement: root });
    for (const language of ["de", "en", "asm"] as const) {
      setLanguage(language);
      expect(root.lang).toBe(language === "de" ? "de" : "en");
      expect(getLanguage()).toBe(language);
    }
  });

  it("uses English labels only when creating English or Assembly examples", () => {
    const original = structuredClone(EXAMPLES[0].blocks);
    for (const language of ["en", "asm", "de"] as const) {
      setLanguage(language);
      const blocks = exampleBlocks(EXAMPLES[0].blocks, "arm64");
      const expected = language === "de" ? "schleife" : "loop";
      expect(blocks.find((block) => block.op === "LABEL")?.a).toBe(expected);
      expect(blocks.find((block) => block.op === "JNE")?.a).toBe(expected);
    }
    expect(EXAMPLES[0].blocks).toEqual(original);
  });
});

describe("English runtime and validation copy", () => {
  it("translates legacy CPU and compiler diagnostics for the English UI", () => {
    setLanguage("en");
    expect(localizeMessage(initialState().message)).toBe(
      "Ready when you are. Run your program or execute a single step.",
    );
    const errors = compile([
      { id: "invalid", op: "LABEL", a: "invalid label", b: "" },
      { id: "reserved", op: "LABEL", a: "EAX", b: "" },
      { id: "missing", op: "JMP", a: "missing", b: "" },
    ]).errors.map((error) => localizeMessage(error.message));
    expect(errors).toContain(
      "LABEL: A label must start with a letter or underscore and contain only letters, digits, and underscores.",
    );
    expect(errors).toContain(
      "LABEL: This name is reserved for a register or instruction.",
    );
    expect(errors).toContain("JMP: Label “missing” does not exist.");
    expect(localizeMessage("Unbekannter Operand: nope")).toBe(
      "Unknown operand: nope",
    );
    expect(localizeMessage("Du kannst nicht durch 0 teilen.")).toBe(
      "Cannot divide by zero.",
    );
  });

  it("retains German diagnostics for an explicit German selection", () => {
    setLanguage("de");
    expect(localizeMessage("Du kannst nicht durch 0 teilen.")).toBe(
      "Du kannst nicht durch 0 teilen.",
    );
    expect(statementText("setze", "set", "mov")).toBe("setze");
  });
});
