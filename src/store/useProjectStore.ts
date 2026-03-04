import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Difficulty = "low" | "medium" | "high";

export interface Project {
  id: string;
  name: string;
  color_value: number;
  priority: number;
  difficulty: Difficulty;
}

interface ProjectStore {
  projects: Project[];
  projectMap: Record<string, Project>;
  loading: boolean;
  load: () => Promise<void>;
  add: (name: string, colorValue: number, difficulty: Difficulty) => Promise<Project>;
  update: (id: string, name: string, colorValue: number, difficulty: Difficulty) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  projectMap: {},
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const raw = await invoke<Project[]>("get_projects");
      // Rust 端已加 #[serde(rename_all = "lowercase")]，正常情况下无需转换
      // 保留 toLowerCase 兜底以防万一
      const projects = raw.map((p) => ({
        ...p,
        difficulty: (p.difficulty?.toLowerCase?.() ?? "low") as Difficulty,
      }));
      set({
        projects,
        projectMap: Object.fromEntries(projects.map((p) => [p.id, p])),
        loading: false,
      });
    } catch (e) {
      console.error("get_projects 失败:", e);
      set({ loading: false });
    }
  },

  add: async (name, colorValue, difficulty) => {
    const raw = await invoke<Project>("add_project", {
      name,
      colorValue,
      difficulty,
    });
    const project = {
      ...raw,
      difficulty: (raw.difficulty?.toLowerCase?.() ?? "low") as Difficulty,
    };
    const projects = [...get().projects, project];
    set({
      projects,
      projectMap: Object.fromEntries(projects.map((p) => [p.id, p])),
    });
    return project;
  },

  update: async (id, name, colorValue, difficulty) => {
    await invoke("update_project", { id, name, colorValue, difficulty });
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, name, color_value: colorValue, difficulty } : p
    );
    set({
      projects,
      projectMap: Object.fromEntries(projects.map((p) => [p.id, p])),
    });
  },

  remove: async (id) => {
    await invoke("delete_project", { id });
    const projects = get().projects.filter((p) => p.id !== id);
    set({
      projects,
      projectMap: Object.fromEntries(projects.map((p) => [p.id, p])),
    });
  },

  // 【修复】reorder 后同步更新本地 projects 排序
  reorder: async (ids) => {
    await invoke("reorder_projects", { ids });
    const { projects } = get();
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    const sorted = [...projects]
      .map((p) => ({
        ...p,
        priority: orderMap.get(p.id) ?? p.priority,
      }))
      .sort((a, b) => a.priority - b.priority);
    set({
      projects: sorted,
      projectMap: Object.fromEntries(sorted.map((p) => [p.id, p])),
    });
  },
}));