import { create } from "zustand";

export type TodayWorkbenchStyle = "workbench" | "cards";
export type CompletionFeedbackLevel = "off" | "standard" | "rich";

const TODAY_WORKBENCH_STYLE_KEY = "courseflow-today-workbench-style";
const COMPLETION_FEEDBACK_LEVEL_KEY = "courseflow-completion-feedback-level";
const COMPLETION_SOUND_ENABLED_KEY = "courseflow-completion-sound-enabled";

function readTodayWorkbenchStyle(): TodayWorkbenchStyle {
  const saved = localStorage.getItem(TODAY_WORKBENCH_STYLE_KEY);
  return saved === "cards" ? "cards" : "workbench";
}

function readCompletionFeedbackLevel(): CompletionFeedbackLevel {
  const saved = localStorage.getItem(COMPLETION_FEEDBACK_LEVEL_KEY);
  if (saved === "off" || saved === "standard" || saved === "rich") return saved;
  return "rich";
}

function readCompletionSoundEnabled() {
  return localStorage.getItem(COMPLETION_SOUND_ENABLED_KEY) !== "false";
}

interface UiPreferencesState {
  todayWorkbenchStyle: TodayWorkbenchStyle;
  completionFeedbackLevel: CompletionFeedbackLevel;
  completionSoundEnabled: boolean;
  setTodayWorkbenchStyle: (style: TodayWorkbenchStyle) => void;
  setCompletionFeedbackLevel: (level: CompletionFeedbackLevel) => void;
  setCompletionSoundEnabled: (enabled: boolean) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set) => ({
  todayWorkbenchStyle: readTodayWorkbenchStyle(),
  completionFeedbackLevel: readCompletionFeedbackLevel(),
  completionSoundEnabled: readCompletionSoundEnabled(),

  setTodayWorkbenchStyle: (style) => {
    localStorage.setItem(TODAY_WORKBENCH_STYLE_KEY, style);
    set({ todayWorkbenchStyle: style });
  },

  setCompletionFeedbackLevel: (level) => {
    localStorage.setItem(COMPLETION_FEEDBACK_LEVEL_KEY, level);
    set({ completionFeedbackLevel: level });
  },

  setCompletionSoundEnabled: (enabled) => {
    localStorage.setItem(COMPLETION_SOUND_ENABLED_KEY, String(enabled));
    set({ completionSoundEnabled: enabled });
  },
}));
