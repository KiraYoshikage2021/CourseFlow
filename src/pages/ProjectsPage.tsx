import { useEffect, useRef, useState } from "react";
import {
  Plus, X, Trash2, CalendarPlus, ListChecks,
  GripVertical, FolderOpen, CheckCircle2, Circle,
  Flame, TrendingUp, Coffee, PlusCircle,
} from "lucide-react";
import { useProjectStore, type Project, type Difficulty } from "../store/useProjectStore";
import { useEventStore, type CalendarEvent } from "../store/useEventStore";

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

function getProjectEvents(
  eventsByDate: Record<string, CalendarEvent[]>,
  unscheduled: CalendarEvent[],
  projectId: string
): Array<{ date: string | null; event: CalendarEvent }> {
  const result: Array<{ date: string | null; event: CalendarEvent }> = [];
  for (const [date, events] of Object.entries(eventsByDate)) {
    for (const event of events) {
      if (event.project_id === projectId) result.push({ date, event });
    }
  }
  for (const event of unscheduled) {
    if (event.project_id === projectId) result.push({ date: null, event });
  }
  return result.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;   // 无日期排最后
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
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

// ── 添加单条日程弹窗（无日期）────────────────────────────────

function AddEventDialog({
  project, onSave, onClose,
}: {
  project: Project;
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try { await onSave(title.trim()); onClose(); }
    catch { alert("添加失败，请重试"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorToHex(project.color_value) }} />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1 truncate">
            为「{project.name}」添加日程
          </h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">具体事项</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-6 outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="具体事项…"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "添加中…" : "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 批量添加日程弹窗 ─────────────────────────────────────────

function BatchAddDialog({
  project, onSave, onClose,
}: {
  project: Project;
  onSave: (titles: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const titles = text.split("\n").map((t) => t.trim()).filter(Boolean);

  async function handleSave() {
    if (titles.length === 0) return;
    setSaving(true);
    try { await onSave(titles); onClose(); }
    catch { alert("批量添加失败，请重试"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorToHex(project.color_value) }} />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1 truncate">批量添加日程</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">
          每行一个事项（共 {titles.length} 条）
        </label>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-6 outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
          placeholder={"第一章复习\n第二章习题\n背单词 50 个\n…"}
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving || titles.length === 0}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "添加中…" : `添加 ${titles.length} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 日程列表弹窗 ─────────────────────────────────────────────

function ProjectEventsDialog({
  project, eventsByDate, unscheduled, onClose,
  onBatchDelete, onBatchComplete, onDeleteSingle, onOpenBatchAdd,
}: {
  project: Project;
  eventsByDate: Record<string, CalendarEvent[]>;
  unscheduled: CalendarEvent[];
  onClose: () => void;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onBatchComplete: (ids: string[]) => Promise<void>;
  onDeleteSingle: (id: string, date: string | null) => Promise<void>;
  onOpenBatchAdd: () => void;
}) {
  const [manageMode, setManageMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const entries = getProjectEvents(eventsByDate, unscheduled, project.id);
  const color = colorToHex(project.color_value);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    try { await onBatchDelete([...selected]); setSelected(new Set()); setManageMode(false); }
    finally { setBusy(false); }
  }

  async function handleBatchComplete() {
    if (selected.size === 0) return;
    setBusy(true);
    try { await onBatchComplete([...selected]); setSelected(new Set()); setManageMode(false); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-[var(--text-primary)] flex-1 truncate">
            {manageMode ? "批量管理" : "日程列表"} · {project.name}
          </span>
          {!manageMode && (
            <button onClick={onOpenBatchAdd}
              className="text-[var(--text-tertiary)] hover:text-indigo-400 transition-colors p-1" title="批量添加">
              <PlusCircle size={17} />
            </button>
          )}
          <button
            onClick={() => { setManageMode((v) => !v); setSelected(new Set()); }}
            className="text-[var(--text-tertiary)] hover:text-indigo-400 transition-colors p-1"
            title={manageMode ? "退出管理" : "批量管理"}
          >
            <ListChecks size={17} />
          </button>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1">
            <X size={17} />
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0">
          {entries.length === 0 ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">暂无相关日程</p>
          ) : (
            entries.map(({ date, event }) => (
              <div
                key={event.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-colors cursor-pointer ${
                  manageMode && selected.has(event.id) ? "bg-indigo-900/40" : "hover:bg-[var(--bg-muted)]"
                }`}
                onClick={() => manageMode && toggleSelect(event.id)}
              >
                {manageMode ? (
                  <input type="checkbox" checked={selected.has(event.id)}
                    onChange={() => toggleSelect(event.id)}
                    className="w-4 h-4 accent-indigo-500 flex-shrink-0" />
                ) : (
                  <div className="flex-shrink-0 text-[var(--text-muted)]">
                    {event.is_completed
                      ? <CheckCircle2 size={16} className="text-green-500" />
                      : <Circle size={16} />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${event.is_completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                    {event.title}
                  </p>
                  <p className="text-[10px] text-[var(--text-faint)]">
                    {date ?? <span className="text-yellow-600">待分配</span>}
                  </p>
                </div>
                {!manageMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSingle(event.id, date); }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* 底部操作栏 */}
        {manageMode ? (
          <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border-strong)] flex-shrink-0">
            <button onClick={handleBatchDelete} disabled={selected.size === 0 || busy}
              className="flex-1 py-2 rounded-xl bg-red-600/80 text-white hover:bg-red-500 disabled:opacity-40 text-sm transition-colors font-medium">
              删除 ({selected.size})
            </button>
            <button onClick={handleBatchComplete} disabled={selected.size === 0 || busy}
              className="flex-1 py-2 rounded-xl bg-green-600/80 text-white hover:bg-green-500 disabled:opacity-40 text-sm transition-colors font-medium">
              标记完成 ({selected.size})
            </button>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-[var(--border-strong)] flex-shrink-0">
            <button onClick={onClose}
              className="w-full py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] text-sm transition-colors">
              关闭
            </button>
          </div>
        )}
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
          <span className="text-red-400">该项目下的所有日程也会被一并删除！</span>
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
  project, highlighted, onDragStart, onEdit, onAddEvent, onShowEvents, onDelete,
}: {
  project: Project;
  highlighted: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onEdit: () => void;
  onAddEvent: () => void;
  onShowEvents: () => void;
  onDelete: () => void;
}) {
  const color = colorToHex(project.color_value);
  // 兼容 Rust 可能返回 "Low"/"Medium"/"High"（PascalCase）的情况
  const diffKey = (project.difficulty?.toLowerCase() ?? "low") as Difficulty;
  const diffCfg = DIFFICULTY_CONFIG[diffKey] ?? DIFFICULTY_CONFIG["low"];
  const DiffIcon = diffCfg.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
        highlighted
          ? "border-indigo-500 bg-indigo-950/30"
          : "border-[var(--border-default)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
      }`}
      onClick={onEdit}
    >
      {/* 颜色头像 */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-primary)] font-bold text-base flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {project.name.charAt(0)}
      </div>

      {/* 名称 + 难度 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--text-primary)] truncate">{project.name}</span>
          <DiffIcon size={14} className={diffCfg.color} />
        </div>
        <span className="text-xs text-[var(--text-faint)]">优先级 {project.priority}</span>
      </div>

      {/* 操作区（阻止冒泡到 onEdit）*/}
      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onAddEvent}
          className="p-2 text-[var(--text-muted)] hover:text-blue-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]" title="添加日程">
          <CalendarPlus size={16} />
        </button>
        <button onClick={onShowEvents}
          className="p-2 text-[var(--text-muted)] hover:text-purple-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]" title="查看全部日程">
          <ListChecks size={16} />
        </button>
        <button onClick={onDelete}
          className="p-2 text-[var(--text-muted)] hover:text-red-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]" title="删除项目">
          <Trash2 size={15} />
        </button>
        {/* 拖拽手柄：只有手柄可以发起拖拽 */}
        <div
          draggable
          onDragStart={onDragStart}
          className="p-2 text-[var(--text-faint)] hover:text-[var(--text-secondary)] cursor-grab active:cursor-grabbing rounded-lg hover:bg-[var(--bg-elevated)]"
          title="拖拽排序"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

type Dialog =
  | { type: "editor"; project?: Project }
  | { type: "addEvent"; project: Project }
  | { type: "batchAdd"; project: Project }
  | { type: "events"; project: Project }
  | { type: "confirmDelete"; project: Project };

export default function ProjectsPage() {
  const { projects, load, add, update, remove, reorder } = useProjectStore();
  const { eventsByDate, unscheduled, loadMonth, loadUnscheduled, addEvent, batchDeleteEvents, batchCompleteEvents, deleteEvent, deleteByProject } = useEventStore();
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Project[]>([]);

  // 拖拽状态
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const months = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    Promise.all([load(), loadUnscheduled(), ...months.map((m) => loadMonth(m))])
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    setLocalOrder([...projects].sort((a, b) => a.priority - b.priority));
  }, [projects]);

  function closeDialog() { setDialog(null); }

  // ── 拖拽处理（仅手柄触发 dragStart，整个卡片可接受 dragOver）──

  function handleDragStart(e: React.DragEvent, index: number) {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const newOrder = [...localOrder];
    const [moved] = newOrder.splice(dragIndex.current, 1);
    newOrder.splice(index, 0, moved);
    dragIndex.current = index;
    setLocalOrder(newOrder);
  }

  async function handleDragEnd() {
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    await reorder(localOrder.map((p) => p.id));
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

  async function handleAddEvent(title: string) {
    if (dialog?.type !== "addEvent") return;
    await addEvent(title, dialog.project.id, null);
    setHighlighted(dialog.project.id);
  }

  async function handleBatchAdd(titles: string[]) {
    if (dialog?.type !== "batchAdd") return;
    for (const title of titles) {
      await addEvent(title, dialog.project.id, null);
    }
    setHighlighted(dialog.project.id);
  }

  async function handleDeleteProject() {
    if (dialog?.type !== "confirmDelete") return;
    const { project } = dialog;
    await Promise.all([deleteByProject(project.id), remove(project.id)]);
    if (highlighted === project.id) setHighlighted(null);
    closeDialog();
  }

  return (
    <div className="p-8 max-w-2xl mx-auto min-h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">项目管理</h1>
          <p className="text-[var(--text-muted)] text-sm">拖动 <GripVertical size={12} className="inline" /> 图标调整优先级顺序</p>
        </div>
        <button
          onClick={() => setDialog({ type: "editor" })}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />新建项目
        </button>
      </div>

      {/* 内容区 */}
      {!loaded ? (
        <div className="text-[var(--text-faint)] text-center py-20">加载中…</div>
      ) : localOrder.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center gap-4">
          <FolderOpen size={52} className="text-[var(--text-faintest)]" />
          <p className="text-[var(--text-tertiary)] font-medium">还没有项目</p>
          <p className="text-[var(--text-faint)] text-sm">点击右上角「新建项目」开始</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {localOrder.map((project, index) => (
            <div
              key={project.id}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <ProjectCard
                project={project}
                highlighted={highlighted === project.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onEdit={() => { setHighlighted(project.id); setDialog({ type: "editor", project }); }}
                onAddEvent={() => { setHighlighted(project.id); setDialog({ type: "addEvent", project }); }}
                onShowEvents={() => { setHighlighted(project.id); setDialog({ type: "events", project }); }}
                onDelete={() => setDialog({ type: "confirmDelete", project })}
              />
            </div>
          ))}
        </div>
      )}

      {/* 弹窗 */}
      {dialog?.type === "editor" && (
        <ProjectEditorDialog project={dialog.project} onSave={handleSaveProject} onClose={closeDialog} />
      )}
      {dialog?.type === "addEvent" && (
        <AddEventDialog project={dialog.project} onSave={handleAddEvent} onClose={closeDialog} />
      )}
      {dialog?.type === "batchAdd" && (
        <BatchAddDialog project={dialog.project} onSave={handleBatchAdd} onClose={closeDialog} />
      )}
      {dialog?.type === "events" && (
        <ProjectEventsDialog
          project={dialog.project}
          eventsByDate={eventsByDate}
          unscheduled={unscheduled}
          onClose={closeDialog}
          onBatchDelete={batchDeleteEvents}
          onBatchComplete={batchCompleteEvents}
          onDeleteSingle={(id, date) => deleteEvent(id, date)}
          onOpenBatchAdd={() => setDialog({ type: "batchAdd", project: dialog.project })}
        />
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