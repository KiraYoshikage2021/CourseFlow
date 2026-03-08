import { create } from "zustand";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  init: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",

  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("light", next === "light");
    localStorage.setItem("courseflow-theme", next);
    set({ theme: next });
  },

  init: () => {
    const saved = localStorage.getItem("courseflow-theme") as Theme | null;
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("light", theme === "light");
    set({ theme });
  },
}));