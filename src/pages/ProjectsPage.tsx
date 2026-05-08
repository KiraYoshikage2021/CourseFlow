import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus, X, Trash2,
  GripVertical, FolderOpen,
  Flame, TrendingUp, Coffee,
  ChevronRight, Search,
} from "lucide-react";
import { useProjectStore, type Project, type Difficulty } from "../store/useProjectStore";
import { useEventStore } from "../store/useEventStore";
import { useMilestoneStore, type MilestoneWithStats } from "../store/useMilestoneStore";

// ── 工具函数 ────────────────────────────────────────────────

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

const DIFFICULTY_CONFIG = {
  low:    { label: "低", icon: Coffee,     color: "text-[var(--text-tertiary)]" },
  medium: { label: "中", icon: TrendingUp, color: "text-blue-400" },
  high:   { label: "高", icon: Flame,      color: "text-orange-400" },
} as const;

const PRESET_COLORS = [
  0x6366f1, 0x8b5cf6, 0xec4899, 0xef4444,
  0xf97316, 0xeab308, 0x22c55e, 0x06b6d4,
];

type ProjectProgressFilter = "all" | "incomplete" | "completed" | "empty";

function isMilestoneComplete(milestone: MilestoneWithStats) {
  return milestone.status === "completed" || (milestone.total > 0 && milestone.done >= milestone.total);
}

function getMilestoneSummary(milestones: MilestoneWithStats[]) {
  const ordered = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const openMilestones = ordered.filter((milestone) => !isMilestoneComplete(milestone));
  const current =
    openMilestones.find((milestone) => milestone.status === "active") ??
    openMilestones[0] ??
    null;
  const next = current
    ? openMilestones.find((milestone) => milestone.id !== current.id && milestone.sort_order > current.sort_order) ??
      openMilestones.find((milestone) => milestone.id !== current.id) ??
      null
    : null;
  return { current, next, hasMilestones: ordered.length > 0 };
}

// ── 项目编辑弹窗 ─────────────────────────────────────────────

function ProjectEditorDialog({
  project, onSave, onClose,
}: {
  project?: Project;
  onSave: (name: string, difficulty: Difficulty) => Promise<void>;
  onClose: () => void;
}) {
  const isEditing = !!project;
  const [name, setName] = useState(project?.name ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(project?.difficulty ?? "low");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), difficulty); onClose(); }
    catch { alert("保存失败，请重试"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{isEditing ? "编辑项目" : "新建项目"}</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">项目名称</label>
        <input
          autoFocus={!isEditing}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-5 outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：量子力学"
        />

        <label className="block text-sm text-[var(--text-tertiary)] mb-2">难度等级</label>
        <div className="flex gap-2 mb-6">
          {(["low", "medium", "high"] as Difficulty[]).map((d) => {
            const cfg = DIFFICULTY_CONFIG[d];
            const Icon = cfg.icon;
            return (
              <button key={d} onClick={() => setDifficulty(d)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  difficulty === d ? "bg-indigo-600 text-white" : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <Icon size={14} />{cfg.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "保存中…" : isEditing ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 删除确认弹窗 ─────────────────────────────────────────────

function ConfirmDeleteDialog({
  projectName, onConfirm, onClose,
}: {
  projectName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">删除项目</h2>
        <p className="text-[var(--text-tertiary)] text-sm mb-6">
          确定要删除「{projectName}」吗？<br />
          <span className="text-red-400">该项目下的所有任务也会被一并删除！</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">取消</button>
          <button onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy}
            className="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors font-medium">
            {busy ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 项目卡片 ─────────────────────────────────────────────────

function ProjectCard({
  project, highlighted, isDragOver,
  stats, milestones = [], onOpenDetails, onDelete,
  canReorder, onDragStart, onDragEnd,
}: {
  project: Project;
  highlighted: boolean;
  isDragOver: boolean;
  stats?: [number, number];
  milestones?: MilestoneWithStats[];
  onOpenDetails: () => void;
  onDelete: () => void;
  canReorder: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const color = colorToHex(project.color_value);
  const diffKey = (project.difficulty?.toLowerCase() ?? "low") as Difficulty;
  const diffCfg = DIFFICULTY_CONFIG[diffKey] ?? DIFFICULTY_CONFIG["low"];
  const DiffIcon = diffCfg.icon;
  const [total, done] = stats ?? [0, 0];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const completed = total > 0 && done >= total;
  const milestoneSummary = getMilestoneSummary(milestones);
  const isArchived = project.is_archived;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
        isArchived
          ? "border-[var(--border-default)] bg-[var(--bg-muted)]/30 opacity-75 hover:opacity-95 hover:bg-[var(--bg-card)]"
          : isDragOver
          ? "border-indigo-400 bg-indigo-500/10 scale-[1.01]"
          : highlighted
          ? "border-indigo-500 bg-indigo-500/10"
          : "border-[var(--border-default)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
      }`}
      onClick={onOpenDetails}
    >
      {/* 颜色头像 */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${
          isArchived ? "opacity-50 grayscale" : ""
        }`}
        style={{ backgroundColor: color }}
      >
        {project.name.charAt(0)}
      </div>

      {/* 名称 + 难度 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--text-primary)] truncate">{project.name}</span>
          <DiffIcon size={14} className={diffCfg.color} />
          {completed && !isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">
              可归档
            </span>
          )}
          {isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-tertiary)]">
              已归档
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--text-faint)]">
          {isArchived ? "历史记录 · 可在详情页恢复" : `优先级 ${project.priority}`}
          {total > 0 ? ` · ${done}/${total} 完成 · ${pct}%` : ""}
        </span>
        {!isArchived && milestoneSummary.current ? (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-faint)] min-w-0">
            <span className="max-w-40 truncate rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--text-tertiary)]">
              当前 {milestoneSummary.current.name}
            </span>
            <span className="flex-shrink-0">
              {milestoneSummary.current.done}/{milestoneSummary.current.total}
            </span>
            {milestoneSummary.next && (
              <span className="truncate text-[var(--text-faint)]">
                下个 {milestoneSummary.next.name}
              </span>
            )}
          </div>
        ) : !isArchived && milestoneSummary.hasMilestones ? (
          <div className="mt-1 text-[10px] text-green-400">阶段全部完成</div>
        ) : null}
      </div>

      {/* 操作区 */}
      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onOpenDetails}
          className={`inline-flex items-center gap-1.5 rounded-lg transition-colors ${
            isArchived
              ? "px-3 py-1.5 bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:text-indigo-300 hover:bg-[var(--bg-muted)]"
              : "p-2 text-[var(--text-muted)] hover:text-indigo-400 hover:bg-[var(--bg-elevated)]"
          }`}
          title="项目详情">
          <ChevronRight size={isArchived ? 14 : 16} />
          {isArchived && "查看详情"}
        </button>
        {!isArchived && (
          <button onClick={onDelete}
            className="p-2 text-[var(--text-muted)] hover:text-red-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]" title="删除项目">
            <Trash2 size={15} />
          </button>
        )}
        {canReorder && !isArchived && (
          <div
            className="p-2 text-[var(--text-faint)] hover:text-[var(--text-secondary)] cursor-grab active:cursor-grabbing rounded-lg hover:bg-[var(--bg-elevated)]"
            title="拖拽排序"
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart();
            }}
            onMouseUp={onDragEnd}
          >
            <GripVertical size={16} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 可排序列表（pointer events 实现）─────────────────────────

function ReorderableList({
  items,
  onReorder,
  renderItem,
}: {
  items: Project[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (project: Project, index: number, isDragOver: boolean, dragHandlers: {
    onDragStart: () => void;
    onDragEnd: () => void;
  }) => React.ReactNode;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (dragIndex === null) return;
    const y = e.clientY;
    let found = -1;
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        found = i;
        break;
      }
      if (y < rect.top && i > 0) {
        found = i;
        break;
      }
    }
    if (found === -1 && itemRefs.current.length > 0) {
      const lastEl = itemRefs.current[itemRefs.current.length - 1];
      if (lastEl) {
        const rect = lastEl.getBoundingClientRect();
        if (y > rect.bottom) found = itemRefs.current.length - 1;
      }
    }
    if (found >= 0 && found !== dragIndex) {
      setOverIndex(found);
    } else {
      setOverIndex(null);
    }
  }, [dragIndex]);

  const handlePointerUp = useCallback(() => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onReorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [dragIndex, overIndex, onReorder, handlePointerMove]);

  const startDrag = useCallback((index: number) => {
    setDragIndex(index);
    setOverIndex(null);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }, []);

  useEffect(() => {
    if (dragIndex !== null) {
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      return () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [dragIndex, handlePointerMove, handlePointerUp]);

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {items.map((project, index) => {
        const isBeingDragged = dragIndex === index;
        const isDragOver = overIndex === index && dragIndex !== index;

        return (
          <div
            key={project.id}
            ref={(el) => { itemRefs.current[index] = el; }}
            className={`transition-all duration-150 ${
              isBeingDragged ? "opacity-40 scale-95" : ""
            }`}
          >
            {isDragOver && dragIndex !== null && dragIndex > index && (
              <div className="h-0.5 bg-indigo-500 rounded-full -mt-1.5 mb-1.5 mx-4 animate-pulse" />
            )}

            {renderItem(project, index, isDragOver, {
              onDragStart: () => startDrag(index),
              onDragEnd: () => {},
            })}

            {isDragOver && dragIndex !== null && dragIndex < index && (
              <div className="h-0.5 bg-indigo-500 rounded-full mt-1.5 -mb-1.5 mx-4 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

type Dialog =
  | { type: "editor"; project?: Project }
  | { type: "confirmDelete"; project: Project };

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, load, add, update, remove, reorder } = useProjectStore();
  const { deleteByProject } = useEventStore();
  const { milestonesByProject, load: loadMilestones } = useMilestoneStore();
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Project[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [projectQuery, setProjectQuery] = useState("");
  const [progressFilter, setProgressFilter] = useState<ProjectProgressFilter>("all");
  const [projectStats, setProjectStats] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    Promise.all([load(), loadProjectStats()])
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    void Promise.all(projects.map((project) => loadMilestones(project.id)));
  }, [projects, loadMilestones]);

  const visibleProjects = useMemo(
    () =>
      projects
        .filter((p) => (view === "archived" ? p.is_archived : !p.is_archived))
        .filter((p) => {
          const q = projectQuery.trim().toLowerCase();
          if (q && !p.name.toLowerCase().includes(q)) return false;

          const [total, done] = projectStats[p.id] ?? [0, 0];
          if (progressFilter === "empty") return total === 0;
          if (progressFilter === "completed") return total > 0 && done >= total;
          if (progressFilter === "incomplete") return total > 0 && done < total;
          return true;
        })
        .sort((a, b) => a.priority - b.priority),
    [projects, view, projectQuery, progressFilter, projectStats]
  );

  const hasProjectFilters = projectQuery.trim() !== "" || progressFilter !== "all";
  const canReorder = view === "active" && !hasProjectFilters;
  const activeProjectsCount = projects.filter((project) => !project.is_archived).length;
  const archivedProjectsCount = projects.length - activeProjectsCount;
  const totalTasks = Object.values(projectStats).reduce((sum, [total]) => sum + total, 0);
  const completedTasks = Object.values(projectStats).reduce((sum, [, done]) => sum + done, 0);
  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  useEffect(() => {
    setLocalOrder(visibleProjects);
  }, [visibleProjects]);

  async function loadProjectStats() {
    const stats = await invoke<Record<string, [number, number]>>("get_project_stats");
    setProjectStats(stats);
  }

  function closeDialog() { setDialog(null); }

  // 拖拽排序：使用 ReorderableList + pointer events
  async function handleReorder(fromIndex: number, toIndex: number) {
    if (!canReorder) return;
    const newOrder = [...localOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setLocalOrder(newOrder);
    setHighlighted(moved.id);
    if (view === "active") {
      await reorder(newOrder.map((p) => p.id));
    }
  }

  // ── 弹窗处理 ──

  async function handleSaveProject(name: string, difficulty: Difficulty) {
    if (dialog?.type === "editor" && dialog.project) {
      const p = dialog.project;
      await update(p.id, name, p.color_value, difficulty);
      setHighlighted(p.id);
    } else {
      const colorValue = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
      const newProject = await add(name, colorValue, difficulty);
      setHighlighted(newProject.id);
    }
  }

  async function handleDeleteProject() {
    if (dialog?.type !== "confirmDelete") return;
    const { project } = dialog;
    await Promise.all([deleteByProject(project.id), remove(project.id)]);
    if (highlighted === project.id) setHighlighted(null);
    closeDialog();
  }

  return (
    <div className="p-6 xl:p-8 max-w-[1500px] mx-auto min-h-full">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">项目管理</h1>
          <p className="text-[var(--text-muted)] text-sm">
            拖动 <GripVertical size={12} className="inline" /> 图标调整进行中项目的优先级
          </p>
        </div>
        <button
          onClick={() => setDialog({ type: "editor" })}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />新建项目
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
        <aside className="xl:sticky xl:top-6 self-start rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-2">
              <p className="text-[10px] text-[var(--text-faint)]">进行中</p>
              <p className="text-base font-semibold text-[var(--text-primary)]">{activeProjectsCount}</p>
            </div>
            <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-2">
              <p className="text-[10px] text-[var(--text-faint)]">归档</p>
              <p className="text-base font-semibold text-[var(--text-primary)]">{archivedProjectsCount}</p>
            </div>
            <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-2">
              <p className="text-[10px] text-[var(--text-faint)]">完成率</p>
              <p className="text-base font-semibold text-[var(--text-primary)]">{completionRate}%</p>
            </div>
          </div>

          <div className="flex items-center rounded-xl bg-[var(--bg-muted)] p-1 mb-4">
            {(["active", "archived"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  view === key
                    ? "bg-indigo-600 text-white"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {key === "active" ? "进行中" : "已归档"}
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              className="w-full bg-[var(--bg-muted)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="搜索项目"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            {([
              ["all", "全部进度"],
              ["incomplete", "未完成"],
              ["completed", "已完成"],
              ["empty", "无任务"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setProgressFilter(key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  progressFilter === key
                    ? "bg-indigo-600 text-white"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {view === "active" ? "进行中项目" : "归档项目"}
              </p>
              <p className="text-xs text-[var(--text-faint)]">
                当前显示 {localOrder.length} 个项目{canReorder ? " · 可拖拽排序" : ""}
              </p>
            </div>
            {hasProjectFilters && (
              <button
                onClick={() => {
                  setProjectQuery("");
                  setProgressFilter("all");
                }}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                清除筛选
              </button>
            )}
          </div>

          {!loaded ? (
            <div className="text-[var(--text-faint)] text-center py-20">加载中…</div>
          ) : localOrder.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] text-center py-20 flex flex-col items-center gap-4">
              <FolderOpen size={52} className="text-[var(--text-faintest)]" />
              <p className="text-[var(--text-tertiary)] font-medium">
                {hasProjectFilters ? "没有匹配的项目" : view === "active" ? "还没有进行中的项目" : "暂无归档项目"}
              </p>
              <p className="text-[var(--text-faint)] text-sm">
                {hasProjectFilters ? "调整搜索词或筛选条件" : view === "active" ? "点击右上角「新建项目」开始" : "完成后的项目可以在这里恢复"}
              </p>
            </div>
          ) : (
            <ReorderableList
              items={localOrder}
              onReorder={handleReorder}
              renderItem={(project, _index, isDragOver, dragHandlers) => (
                <ProjectCard
                  project={project}
                  highlighted={highlighted === project.id}
                  isDragOver={isDragOver}
                  stats={projectStats[project.id]}
                  milestones={milestonesByProject[project.id]}
                  canReorder={canReorder}
                  onDragStart={dragHandlers.onDragStart}
                  onDragEnd={dragHandlers.onDragEnd}
                  onOpenDetails={() => {
                    setHighlighted(project.id);
                    navigate(`/projects/${project.id}`);
                  }}
                  onDelete={() => setDialog({ type: "confirmDelete", project })}
                />
              )}
            />
          )}
        </main>
      </div>

      {/* 弹窗 */}
      {dialog?.type === "editor" && (
        <ProjectEditorDialog project={dialog.project} onSave={handleSaveProject} onClose={closeDialog} />
      )}
      {dialog?.type === "confirmDelete" && (
        <ConfirmDeleteDialog
          projectName={dialog.project.name}
          onConfirm={handleDeleteProject}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
