import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyColorMode, COLOR_MODE_KEY, loadColorMode } from "./appearance";

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
});
afterEach(() => vi.unstubAllGlobals());

describe("color mode", () => {
  it.each(["light", "dark"] as const)(
    "restores an explicit %s preference before consulting the system",
    (mode) => {
      vi.mocked(localStorage.getItem).mockReturnValue(mode);
      expect(loadColorMode()).toBe(mode);
      expect(localStorage.getItem).toHaveBeenCalledWith(COLOR_MODE_KEY);
      expect(window.matchMedia).not.toHaveBeenCalled();
    },
  );
  it("uses the system preference when no choice was saved", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(loadColorMode()).toBe("dark");
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-color-scheme: dark)",
    );
  });
  it("ignores an invalid stored preference", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("invalid");
    expect(loadColorMode()).toBe("light");
  });
  it("still works if browser storage is unavailable", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Storage denied");
    });
    expect(loadColorMode()).toBe("light");
  });
  it("applies the mode to the whole document, including detached Blockly menus and native controls", () => {
    const root = { dataset: { language: "de" }, style: { colorScheme: "" } };
    vi.stubGlobal("document", { documentElement: root });
    applyColorMode("dark");
    expect(root.dataset).toEqual({ language: "de", theme: "dark" });
    expect(root.style.colorScheme).toBe("dark");
    applyColorMode("light");
    expect(root.style.colorScheme).toBe("light");
  });
});
