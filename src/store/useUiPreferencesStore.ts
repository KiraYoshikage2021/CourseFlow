import { create } from "zustand";

export type TodayWorkbenchStyle = "workbench" | "cards";

const TODAY_WORKBENCH_STYLE_KEY = "courseflow-today-workbench-style";

function readTodayWorkbenchStyle(): TodayWorkbenchStyle {
  const saved = localStorage.getItem(TODAY_WORKBENCH_STYLE_KEY);
  return saved === "cards" ? "cards" : "workbench";
}

interface UiPreferencesState {
  todayWorkbenchStyle: TodayWorkbenchStyle;
  setTodayWorkbenchStyle: (style: TodayWorkbenchStyle) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set) => ({
  todayWorkbenchStyle: readTodayWorkbenchStyle(),

  setTodayWorkbenchStyle: (style) => {
    localStorage.setItem(TODAY_WORKBENCH_STYLE_KEY, style);
    set({ todayWorkbenchStyle: style });
  },
}));
