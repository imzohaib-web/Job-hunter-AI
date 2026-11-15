import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "jobpilot-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Ignore localStorage access errors (e.g. sandboxed iframe / disabled cookies)
  }
  return "system";
}

function applyTheme(theme: Theme): "light" | "dark" {
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  return resolved;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initialTheme = getStoredTheme();
  const initialResolved = typeof window !== "undefined" ? applyTheme(initialTheme) : "light";

  if (typeof window !== "undefined") {
    // Listen to OS color scheme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      if (get().theme === "system") {
        const resolved = applyTheme("system");
        set({ resolvedTheme: resolved });
      }
    });
  }

  return {
    theme: initialTheme,
    resolvedTheme: initialResolved,
    setTheme: (theme: Theme) => {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Ignore localStorage error
      }
      const resolved = applyTheme(theme);
      set({ theme, resolvedTheme: resolved });
    },
  };
});
