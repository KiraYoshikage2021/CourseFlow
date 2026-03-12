import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface HabitWithStats {
  id: string;
  name: string;
  color_value: number;
  days_of_week: string; // "1,3,5"，1=周一，7=周日
  created_at: string;
  is_active: boolean;
  scheduled_today: boolean;
  completed_today: boolean;
  streak: number;
}

interface HabitStore {
  habits: HabitWithStats[];
  loading: boolean;
  load: (date: string) => Promise<void>;
  add: (name: string, daysOfWeek: string, colorValue: number) => Promise<void>;
  update: (id: string, name: string, daysOfWeek: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggle: (habitId: string, date: string) => Promise<void>;
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  habits: [],
  loading: false,

  load: async (date) => {
    set({ loading: true });
    try {
      const habits = await invoke<HabitWithStats[]>("get_habits", { date });
      set({ habits });
    } catch (e) {
      console.error("get_habits 失败:", e);
    } finally {
      set({ loading: false });
    }
  },

  add: async (name, daysOfWeek, colorValue) => {
    const habit = await invoke<HabitWithStats>("add_habit", {
      name,
      daysOfWeek,
      colorValue,
    });
    set((s) => ({ habits: [...s.habits, habit] }));
  },

  update: async (id, name, daysOfWeek) => {
    await invoke("update_habit", { id, name, daysOfWeek });
    set((s) => ({
      habits: s.habits.map((h) =>
        h.id === id ? { ...h, name, days_of_week: daysOfWeek } : h
      ),
    }));
  },

  remove: async (id) => {
    await invoke("delete_habit", { id });
    set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }));
  },

  toggle: async (habitId, date) => {
    const nowCompleted = await invoke<boolean>("toggle_habit_completion", {
      habitId,
      date,
    });
    // 重新 load 以更新 streak
    await get().load(date);
    // 如果 load 失败也不崩溃，因为 load 内部已处理
    void nowCompleted;
  },
}));
