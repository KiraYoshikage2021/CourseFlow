import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useEventStore } from "./useEventStore";

// schedule: { "1": ["proj_a", "proj_b"], ..., "7": [] }
// key = 星期几（1=周一, 7=周日），value = 当天安排的项目 ID 列表
export type WeeklySchedule = Record<string, string[]>;

interface WeeklyStore {
  schedule: WeeklySchedule;
  loaded: boolean;
  load: () => Promise<void>;
  save: (schedule: WeeklySchedule) => Promise<void>;
  // 保存模板并执行重排算法，返回本次分配的事件数量
  saveAndReschedule: (schedule: WeeklySchedule) => Promise<number>;
}

function emptySchedule(): WeeklySchedule {
  const s: WeeklySchedule = {};
  for (let i = 1; i <= 7; i++) s[i.toString()] = [];
  return s;
}

export const useWeeklyStore = create<WeeklyStore>((set) => ({
  schedule: emptySchedule(),
  loaded: false,

  load: async () => {
    try {
      const raw = await invoke<Record<string, string[]>>("get_weekly_template");
      // 确保 1~7 全部存在
      const schedule = emptySchedule();
      for (const [day, ids] of Object.entries(raw)) {
        schedule[day] = ids;
      }
      set({ schedule, loaded: true });
    } catch (e) {
      console.error("get_weekly_template 失败:", e);
      set({ loaded: true });
    }
  },

  save: async (schedule) => {
    await invoke("save_weekly_template", { schedule });
    set({ schedule });
  },

  saveAndReschedule: async (schedule) => {
    // 先保存模板
    await invoke("save_weekly_template", { schedule });
    // 再执行重排，返回分配的事件数
    const count = await invoke<number>("reschedule_events", { schedule });
    set({ schedule });

    // 【修复】重排后清空 eventStore 缓存，
    // 这样 Dashboard 切换/停留在当月时会重新拉取最新数据
    useEventStore.getState().invalidateAll();

    return count;
  },
}));