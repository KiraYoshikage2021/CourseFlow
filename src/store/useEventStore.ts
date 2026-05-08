import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string | null;         // scheduled date; null = 待分配
  due_date?: string | null;    // deadline / target completion date
  created_at: string;
  completed_at?: string | null;
  is_completed: boolean;
  is_pinned: boolean;
  project_id: string | null;
  milestone_id?: string | null;
  sort_order?: number;
}

interface EventStore {
  eventsByDate: Record<string, CalendarEvent[]>;
  unscheduled: CalendarEvent[];             // date = null 的事件
  overdue: CalendarEvent[];
  loadingDates: Set<string>;

  loadDate: (date: string) => Promise<void>;
  loadMonth: (yearMonth: string) => Promise<void>;
  loadUnscheduled: () => Promise<void>;
  loadOverdue: (today: string) => Promise<void>;
  addEvent: (title: string, projectId: string | null, date?: string | null, dueDate?: string | null) => Promise<void>;
  addEventsBatch: (events: CalendarEvent[]) => Promise<void>;
  updateEvent: (id: string, date: string | null, title: string, projectId: string | null, dueDate?: string | null) => Promise<void>;
  moveEventDate: (event: CalendarEvent, targetDate: string | null) => Promise<void>;
  deleteEvent: (id: string, date: string | null) => Promise<void>;
  batchDeleteEvents: (ids: string[]) => Promise<void>;
  batchCompleteEvents: (ids: string[], addToReview?: boolean) => Promise<void>;
  batchUncompleteEvents: (ids: string[]) => Promise<void>;
  batchAssignMilestone: (ids: string[], milestoneId: string | null) => Promise<void>;
  invalidateAll: () => void;
  toggle: (id: string, date: string | null, addToReview?: boolean) => Promise<void>;
  pin: (id: string, date: string | null) => Promise<void>;
  deleteByProject: (projectId: string) => Promise<void>;
}

export const useEventStore = create<EventStore>((set, get) => ({
  eventsByDate: {},
  unscheduled: [],
  overdue: [],
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

  loadOverdue: async (today) => {
    try {
      const events = await invoke<CalendarEvent[]>("get_overdue_events", { today });
      set({ overdue: events });
    } catch (e) {
      console.error("get_overdue_events 失败:", e);
    }
  },

  // date 不传或传 null 时，事件进入 unscheduled
  addEvent: async (title, projectId, date = null, dueDate = null) => {
    try {
      const event = await invoke<CalendarEvent>("add_event", { title, projectId, date, dueDate });
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

  updateEvent: async (id, date, title, projectId, dueDate = null) => {
    // 乐观更新
    if (date) {
      set((s) => ({
        eventsByDate: {
          ...s.eventsByDate,
          [date]: (s.eventsByDate[date] ?? []).map((e) =>
            e.id === id ? { ...e, title, project_id: projectId, due_date: dueDate } : e
          ),
        },
      }));
    } else {
      set((s) => ({
        unscheduled: s.unscheduled.map((e) =>
          e.id === id ? { ...e, title, project_id: projectId, due_date: dueDate } : e
        ),
      }));
    }
    set((s) => ({
      overdue: s.overdue.map((e) =>
        e.id === id ? { ...e, title, project_id: projectId, due_date: dueDate } : e
      ),
    }));
    try {
      await invoke("update_event", { id, title, projectId, dueDate });
    } catch (e) {
      console.error("update_event 失败:", e);
      date ? get().loadDate(date) : get().loadUnscheduled();
      throw e;
    }
  },

  moveEventDate: async (event, targetDate) => {
    const sourceDate = event.date;
    if (sourceDate === targetDate) return;

    const movedEvent: CalendarEvent = { ...event, date: targetDate };
    set((s) => {
      const eventsByDate = { ...s.eventsByDate };
      if (sourceDate) {
        eventsByDate[sourceDate] = (eventsByDate[sourceDate] ?? []).filter((e) => e.id !== event.id);
      }
      if (targetDate) {
        eventsByDate[targetDate] = [...(eventsByDate[targetDate] ?? []), movedEvent];
      }

      const unscheduled = targetDate
        ? s.unscheduled.filter((e) => e.id !== event.id)
        : [...s.unscheduled.filter((e) => e.id !== event.id), movedEvent];

      return {
        eventsByDate,
        unscheduled,
        overdue: s.overdue.map((e) => (e.id === event.id ? movedEvent : e)),
      };
    });

    try {
      await invoke("reschedule_event", { id: event.id, date: targetDate });
    } catch (e) {
      console.error("reschedule_event 失败:", e);
      if (sourceDate) await get().loadDate(sourceDate);
      if (targetDate) await get().loadDate(targetDate);
      if (!sourceDate || !targetDate) await get().loadUnscheduled();
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
    set((s) => ({ overdue: s.overdue.filter((e) => e.id !== id) }));
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
        overdue: s.overdue.filter((e) => !idSet.has(e.id)),
      };
    });
    try {
      await invoke("batch_delete_events", { ids });
    } catch (e) {
      console.error("batch_delete_events 失败:", e);
      throw e;
    }
  },

  batchCompleteEvents: async (ids, addToReview = true) => {
    const idSet = new Set(ids);
    const completedAt = new Date().toISOString();
    set((s) => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const [date, events] of Object.entries(s.eventsByDate)) {
        updated[date] = events.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: true, completed_at: e.completed_at ?? completedAt } : e
        );
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: true, completed_at: e.completed_at ?? completedAt } : e
        ),
        overdue: s.overdue.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: true, completed_at: e.completed_at ?? completedAt } : e
        ),
      };
    });
    try {
      await invoke("batch_complete_events", { ids, addToReview });
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
          idSet.has(e.id) ? { ...e, is_completed: false, completed_at: null } : e
        );
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: false, completed_at: null } : e
        ),
        overdue: s.overdue.map((e) =>
          idSet.has(e.id) ? { ...e, is_completed: false, completed_at: null } : e
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

  batchAssignMilestone: async (ids, milestoneId) => {
    const idSet = new Set(ids);
    set((s) => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const [date, events] of Object.entries(s.eventsByDate)) {
        updated[date] = events.map((e) =>
          idSet.has(e.id) ? { ...e, milestone_id: milestoneId } : e
        );
      }
      return {
        eventsByDate: updated,
        unscheduled: s.unscheduled.map((e) =>
          idSet.has(e.id) ? { ...e, milestone_id: milestoneId } : e
        ),
        overdue: s.overdue.map((e) =>
          idSet.has(e.id) ? { ...e, milestone_id: milestoneId } : e
        ),
      };
    });
    try {
      await invoke("batch_assign_event_milestone", { ids, milestoneId });
    } catch (e) {
      console.error("batch_assign_event_milestone 失败:", e);
      throw e;
    }
  },

  toggle: async (id, date, addToReview = true) => {
    const toggle = (e: CalendarEvent) =>
      e.id === id
        ? {
            ...e,
            is_completed: !e.is_completed,
            completed_at: e.is_completed ? null : new Date().toISOString(),
          }
        : e;
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
    set((s) => ({ overdue: s.overdue.map(toggle) }));
    try {
      await invoke("toggle_event_complete", { id, addToReview });
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
      set((s) => ({ overdue: s.overdue.map(toggle) }));
    }
  },

  pin: async (id, date) => {
    const toggle = (e: CalendarEvent) =>
      e.id === id ? { ...e, is_pinned: !e.is_pinned } : e;
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
    set((s) => ({ overdue: s.overdue.map(toggle) }));
    try {
      await invoke("toggle_event_pinned", { id });
    } catch (e) {
      console.error("toggle_event_pinned 失败:", e);
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
      set((s) => ({ overdue: s.overdue.map(toggle) }));
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
        overdue: s.overdue.filter((e) => e.project_id !== projectId),
      };
    });
  },

  invalidateAll: () => {
    set({ eventsByDate: {}, unscheduled: [], overdue: [], loadingDates: new Set() });
  },
}));
