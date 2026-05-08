import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface ReviewItem {
  id: string;
  title: string;
  source_event_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  created_at: string;
  is_active: boolean;
  due_date: string;
  last_reviewed_at: string | null;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  elapsed_days: number;
  reps: number;
  lapses: number;
  project_name: string | null;
  milestone_name: string | null;
}

export interface ReviewRatingStats {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface ReviewDailyLoad {
  date: string;
  due_count: number;
}

export interface ReviewStats {
  total_active: number;
  due_today: number;
  overdue: number;
  due_next_7_days: number;
  reviewed_today: number;
  reviewed_last_7_days: number;
  rating_counts_30_days: ReviewRatingStats;
  retention_percent_30_days: number;
  upcoming_load_7_days: ReviewDailyLoad[];
}

interface ReviewStore {
  dueItems: ReviewItem[];
  stats: ReviewStats | null;
  projectItemsByProject: Record<string, ReviewItem[]>;
  loadingDue: boolean;
  loadingStats: boolean;
  loadDue: (today: string) => Promise<void>;
  loadStats: (today: string) => Promise<void>;
  loadProjectItems: (projectId: string) => Promise<void>;
  setEventReviewEnabled: (eventId: string, enabled: boolean, projectId?: string) => Promise<void>;
  submitReview: (itemId: string, rating: ReviewRating, today: string) => Promise<void>;
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  dueItems: [],
  stats: null,
  projectItemsByProject: {},
  loadingDue: false,
  loadingStats: false,

  loadDue: async (today) => {
    set({ loadingDue: true });
    try {
      const dueItems = await invoke<ReviewItem[]>("get_due_review_items", { today });
      set({ dueItems, loadingDue: false });
    } catch (e) {
      console.error("get_due_review_items 失败:", e);
      set({ loadingDue: false });
    }
  },

  loadStats: async (today) => {
    set({ loadingStats: true });
    try {
      const stats = await invoke<ReviewStats>("get_review_stats", { today });
      set({ stats, loadingStats: false });
    } catch (e) {
      console.error("get_review_stats 失败:", e);
      set({ loadingStats: false });
    }
  },

  loadProjectItems: async (projectId) => {
    try {
      const items = await invoke<ReviewItem[]>("get_review_items_by_project", { projectId });
      set((state) => ({
        projectItemsByProject: {
          ...state.projectItemsByProject,
          [projectId]: items,
        },
      }));
    } catch (e) {
      console.error("get_review_items_by_project 失败:", e);
    }
  },

  setEventReviewEnabled: async (eventId, enabled, projectId) => {
    await invoke("set_event_review_enabled", { eventId, enabled });
    if (projectId) {
      await get().loadProjectItems(projectId);
    }
  },

  submitReview: async (itemId, rating, today) => {
    await invoke<ReviewItem>("review_item", {
      itemId,
      rating,
      reviewedAt: new Date().toISOString(),
    });
    await Promise.all([get().loadDue(today), get().loadStats(today)]);
  },
}));
