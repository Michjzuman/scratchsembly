export type ColorMode = "light" | "dark";
export const COLOR_MODE_KEY = "assembly-playground.color-mode";

export function loadColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(COLOR_MODE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage is optional; use the system preference instead.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}
