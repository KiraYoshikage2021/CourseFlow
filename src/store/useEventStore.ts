import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string | null;         // null = 待分配（未绑定日期）
  created_at: string;
  is_completed: boolean;
  project_id: string | null;
}

interface EventStore {
  eventsByDate: Record<string, CalendarEvent[]>;
  unscheduled: CalendarEvent[];             // date = null 的事件
  loadingDates: Set<string>;

  loadDate: (date: string) => Promise<void>;
  loadMonth: (yearMonth: string) => Promise<void>;
  loadUnscheduled: () => Promise<void>;
  addEvent: (title: string, projectId: string | null, date?: string | null) => Promise<void>;
  updateEvent: (id: string, date: string | null, title: string, projectId: string | null) => Promise<void>;
  deleteEvent: (id: string, date: string | null) => Promise<void>;
  batchDeleteEvents: (ids: string[]) => Promise<void>;
  batchCompleteEvents: (ids: string[]) => Promise<void>;
  toggle: (id: string, date: string | null) => Promise<void>;
  deleteByProject: (projectId: string) => Promise<void>;
  /** 批量插入事件（一个事务），用于批量添加日程 */
  addEventsBatch: (events: CalendarEvent[]) => Promise<number>;
  /** 清空所有缓存，重排后调用 */
  invalidateAll: () => void;
}

export const useEventStore = create<EventStore>((set, get) => ({
  eventsByDate: {},
  unscheduled: [],
  loadingDates: new Set(),

  loadDate: async (date) => {
    if (get().loadingDates.has(date)) return;
    set((s) => ({ loadingDates: new Set([...s.loadingDates, date]) }));
    try {
      const events = await invoke<CalendarEvent[]>("get_events_by_date", { date });
      set((s) => ({
        eventsByDate: { ...s.eventsByDate, [date]: events },
        loadingDates: new Set([...s.loadingDates].filter((d) => d !== date)),
      }));
    } catch (e) {
      console.error("loadDate 失败:", e);
      set((s) => ({
        loadingDates: new Set([...s.loadingDates].filter((d) => d !== date)),
      }));
    }
  },

  loadMonth: async (yearMonth) => {
    try {
      const events = await invoke<CalendarEvent[]>("get_events_by_month", { yearMonth });
      const grouped: Record<string, CalendarEvent[]> = {};
      for (const event of events) {
        if (!event.date) continue;
        if (!grouped[event.date]) grouped[event.date] = [];
        grouped[event.date].push(event);
      }

      // 【修复】先清除该月份已缓存的旧 key，再合并新数据
      // 避免重排后旧日期缓存残留
      set((s) => {
        const cleaned: Record<string, CalendarEvent[]> = {};
        for (const [date, evts] of Object.entries(s.eventsByDate)) {
          // 保留不属于当前月份的缓存
          if (!date.startsWith(yearMonth)) {
            cleaned[date] = evts;
          }
        }
        return { eventsByDate: { ...cleaned, ...grouped } };
      });
    } catch (e) {
      console.error("loadMonth 失败:", e);
    }
  },

  loadUnscheduled: async () => {
    try {
      const events = await invoke<CalendarEvent[]>("get_unscheduled_events");
      set({ unscheduled: events });
    } catch (e) {
      console.error("loadUnscheduled 失败:", e);
    }
  },

  // 【修复】date 显式默认 null，避免 undefined 传给 Rust
  addEvent: async (title, projectId, date = null) => {
    try {
      const event = await invoke<CalendarEvent>("add_event", {
        title,
        projectId,
        date: date ?? null, // 确保 undefined 也变成 null
      });
      if (event.date) {
        set((s) => ({
          eventsByDate: {
            ...s.eventsByDate,
            [event.date!]: [...(s.eventsByDate[event.date!] ?? []), event],
          },
        }));
      } else {
        set((s) => ({ unscheduled: [...s.unscheduled, event] }));
      }
    } catch (e) {
      console.error("add_event 失败:", e);
      throw e;
    }
  },

  updateEvent: async (id, date, title, projectId) => {
    // 乐观更新
    if (date) {
      set((s) => ({
        eventsByDate: {
          ...s.eventsByDate,
          [date]: (s.eventsByDate[date] ?? []).map((e) =>
            e.id === id ? { ...e, title, project_id: projectId } : e
          ),
        },
      }));
    } else {
      set((s) => ({
        unscheduled: s.unscheduled.map((e) =>
          e.id === id ? { ...e, title, project_id: projectId } : e
        ),
      }));
    }
    try {
      await invoke("update_event", { id, title, projectId });
    } catch (e) {
      console.error("update_event 失败:", e);
      date ? get().loadDate(date) : get().loadUnscheduled();
      throw e;
    }
  },

  deleteEvent: async (id, date) => {
    if (date) {
      set((s) => ({
        eventsByDate: {
          ...s.eventsByDate,
          [date]: (s.eventsByDate[date] ?? []).filter((e) => e.id !== id),
        },
      }));
    } else {
      set((s) => ({ unscheduled: s.unscheduled.filter((e) => e.id !== id) }));
    }
    try {
      await invoke("delete_event", { id });
    } catch (e) {
      console.error("delete_event 失败:", e);
      date ? get().loadDate(date) : get().loadUnscheduled();
      throw e;
    }
  },

  batchDeleteEvents: async (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const [date, events] of Object.entries(s.eventsByDate)) {
        updated[date] = events.filter((e) => !idSet.has(e.id));
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.filter((e) => !idSet.has(e.id)),
      };
    });
    try {
      await invoke("batch_delete_events", { ids });
    } catch (e) {
      console.error("batch_delete_events 失败:", e);
      throw e;
    }
  },

  batchCompleteEvents: async (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const [date, events] of Object.entries(s.eventsByDate)) {
        updated[date] = events.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: true } : e
        );
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: true } : e
        ),
      };
    });
    try {
      await invoke("batch_complete_events", { ids });
    } catch (e) {
      console.error("batch_complete_events 失败:", e);
      throw e;
    }
  },

  toggle: async (id, date) => {
    const toggle = (e: CalendarEvent) =>
      e.id === id ? { ...e, is_completed: !e.is_completed } : e;
    if (date) {
      set((s) => ({
        eventsByDate: {
          ...s.eventsByDate,
          [date]: (s.eventsByDate[date] ?? []).map(toggle),
        },
      }));
    } else {
      set((s) => ({ unscheduled: s.unscheduled.map(toggle) }));
    }
    try {
      await invoke("toggle_event_complete", { id });
    } catch (e) {
      console.error("toggle 失败:", e);
      // 回滚
      if (date) {
        set((s) => ({
          eventsByDate: {
            ...s.eventsByDate,
            [date]: (s.eventsByDate[date] ?? []).map(toggle),
          },
        }));
      } else {
        set((s) => ({ unscheduled: s.unscheduled.map(toggle) }));
      }
    }
  },

  // 【修复】添加 try-catch 错误处理
  deleteByProject: async (projectId) => {
    try {
      await invoke("delete_events_by_project", { projectId });
      set((s) => {
        const updated: Record<string, CalendarEvent[]> = {};
        for (const [date, events] of Object.entries(s.eventsByDate)) {
          updated[date] = events.filter((e) => e.project_id !== projectId);
        }
        return {
          eventsByDate: updated,
          unscheduled: s.unscheduled.filter((e) => e.project_id !== projectId),
        };
      });
    } catch (e) {
      console.error("delete_events_by_project 失败:", e);
      throw e;
    }
  },

  // 【新增】批量插入事件，使用后端 add_events_batch 命令（单事务）
  addEventsBatch: async (events) => {
    try {
      const count = await invoke<number>("add_events_batch", { events });
      // 按 date 分组更新缓存
      for (const event of events) {
        if (event.date) {
          set((s) => ({
            eventsByDate: {
              ...s.eventsByDate,
              [event.date!]: [...(s.eventsByDate[event.date!] ?? []), event],
            },
          }));
        } else {
          set((s) => ({ unscheduled: [...s.unscheduled, event] }));
        }
      }
      return count;
    } catch (e) {
      console.error("add_events_batch 失败:", e);
      throw e;
    }
  },

  // 【新增】清空所有缓存，供重排后强制刷新
  invalidateAll: () => {
    set({ eventsByDate: {}, unscheduled: [] });
  },
}));