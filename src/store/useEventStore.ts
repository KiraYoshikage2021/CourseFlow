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
  addEventsBatch: (events: CalendarEvent[]) => Promise<void>;
  updateEvent: (id: string, date: string | null, title: string, projectId: string | null) => Promise<void>;
  deleteEvent: (id: string, date: string | null) => Promise<void>;
  batchDeleteEvents: (ids: string[]) => Promise<void>;
  batchCompleteEvents: (ids: string[]) => Promise<void>;
  batchUncompleteEvents: (ids: string[]) => Promise<void>;
  invalidateAll: () => void;
  toggle: (id: string, date: string | null) => Promise<void>;
  deleteByProject: (projectId: string) => Promise<void>;
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
      set((s) => ({ eventsByDate: { ...s.eventsByDate, ...grouped } }));
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

  // date 不传或传 null 时，事件进入 unscheduled
  addEvent: async (title, projectId, date = null) => {
    try {
      const event = await invoke<CalendarEvent>("add_event", { title, projectId, date });
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

  addEventsBatch: async (events) => {
    try {
      await invoke("add_events_batch", { events });
      // 更新本地缓存
      set((s) => {
        const updated = { ...s.eventsByDate };
        const newUnscheduled = [...s.unscheduled];
        for (const event of events) {
          if (event.date) {
            updated[event.date] = [...(updated[event.date] ?? []), event];
          } else {
            newUnscheduled.push(event);
          }
        }
        return { eventsByDate: updated, unscheduled: newUnscheduled };
      });
    } catch (e) {
      console.error("add_events_batch 失败:", e);
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

  batchUncompleteEvents: async (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const [date, events] of Object.entries(s.eventsByDate)) {
        updated[date] = events.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: false } : e
        );
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: false } : e
        ),
      };
    });
    try {
      await invoke("batch_uncomplete_events", { ids });
    } catch (e) {
      console.error("batch_uncomplete_events 失败:", e);
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

  deleteByProject: async (projectId) => {
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
  },

  invalidateAll: () => {
    set({ eventsByDate: {}, unscheduled: [], loadingDates: new Set() });
  },
}));