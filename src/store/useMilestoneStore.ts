import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type MilestoneStatus = "not_started" | "active" | "completed";

export interface MilestoneWithStats {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  status: MilestoneStatus;
  target_date: string | null;
  created_at: string;
  total: number;
  done: number;
}

interface MilestoneStore {
  milestonesByProject: Record<string, MilestoneWithStats[]>;
  loading: boolean;
  load: (projectId: string) => Promise<void>;
  add: (projectId: string, name: string, targetDate: string | null) => Promise<MilestoneWithStats>;
  update: (id: string, projectId: string, name: string, status: MilestoneStatus, targetDate: string | null) => Promise<void>;
  remove: (id: string, projectId: string) => Promise<void>;
  reorder: (projectId: string, ids: string[]) => Promise<void>;
}

export const useMilestoneStore = create<MilestoneStore>((set) => ({
  milestonesByProject: {},
  loading: false,

  load: async (projectId) => {
    set({ loading: true });
    try {
      const milestones = await invoke<MilestoneWithStats[]>("get_milestones", { projectId });
      set((s) => ({
        milestonesByProject: { ...s.milestonesByProject, [projectId]: milestones },
        loading: false,
      }));
    } catch (e) {
      console.error("get_milestones 失败:", e);
      set({ loading: false });
    }
  },

  add: async (projectId, name, targetDate) => {
    const milestone = await invoke<MilestoneWithStats>("add_milestone", {
      projectId,
      name,
      targetDate,
    });
    set((s) => ({
      milestonesByProject: {
        ...s.milestonesByProject,
        [projectId]: [...(s.milestonesByProject[projectId] ?? []), milestone],
      },
    }));
    return milestone;
  },

  update: async (id, projectId, name, status, targetDate) => {
    await invoke("update_milestone", { id, name, status, targetDate });
    set((s) => ({
      milestonesByProject: {
        ...s.milestonesByProject,
        [projectId]: (s.milestonesByProject[projectId] ?? []).map((m) =>
          m.id === id ? { ...m, name, status, target_date: targetDate } : m
        ),
      },
    }));
  },

  remove: async (id, projectId) => {
    await invoke("delete_milestone", { id });
    set((s) => ({
      milestonesByProject: {
        ...s.milestonesByProject,
        [projectId]: (s.milestonesByProject[projectId] ?? []).filter((m) => m.id !== id),
      },
    }));
  },

  reorder: async (projectId, ids) => {
    await invoke("reorder_milestones", { ids });
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    set((s) => ({
      milestonesByProject: {
        ...s.milestonesByProject,
        [projectId]: [...(s.milestonesByProject[projectId] ?? [])]
          .map((m) => ({ ...m, sort_order: orderMap.get(m.id) ?? m.sort_order }))
          .sort((a, b) => a.sort_order - b.sort_order),
      },
    }));
  },
}));
