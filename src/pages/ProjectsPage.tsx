import { useEffect, useRef, useState, useCallback } from "react";
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

// ── 【完整版】批量添加日程弹窗（对齐 Flutter BatchAddEventsDialog）────

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function BatchAddDialog({
  project, onSave, onClose,
}: {
  project: Project;
  onSave: (events: CalendarEvent[]) => Promise<void>;
  onClose: () => void;
}) {
  const [baseName, setBaseName] = useState(project.name);
  const [count, setCount] = useState(5);
  const [namingMode, setNamingMode] = useState<0 | 1>(0); // 0: 同名, 1: 序号递增
  const [startDate, setStartDate] = useState(toDateStr(new Date()));
  const [isDaily, setIsDaily] = useState(true);
  const [saving, setSaving] = useState(false);

  // 计算预计结束日期
  const endDate = (() => {
    if (!isDaily || count <= 1) return startDate;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + count - 1);
    return toDateStr(d);
  })();

  // 预览生成的事件标题
  const previewTitles = Array.from({ length: Math.min(count, 5) }, (_, i) => {
    if (namingMode === 0) return baseName;
    const pad = count > 9 ? 2 : 1;
    return `${baseName} ${String(i + 1).padStart(pad, "0")}`;
  });

  async function handleGenerate() {
    if (!baseName.trim() || count <= 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const events: CalendarEvent[] = [];
      const base = new Date(startDate + "T00:00:00");

      for (let i = 0; i < count; i++) {
        let title = baseName.trim();
        if (namingMode === 1) {
          const pad = count > 9 ? 2 : 1;
          title = `${title} ${String(i + 1).padStart(pad, "0")}`;
        }

        let date: string | null = null;
        if (isDaily) {
          const d = new Date(base);
          d.setDate(d.getDate() + i);
          date = toDateStr(d);
        }

        events.push({
          id: crypto.randomUUID(),
          title,
          date,
          created_at: now,
          is_completed: false,
          project_id: project.id,
        });
      }

      await onSave(events);
      onClose();
    } catch {
      // 静默处理
    } finally {
      setSaving(false);
    }
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

        {/* 名称前缀 */}
        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">日程名称前缀</label>
        <input
          autoFocus
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          placeholder="例如：背单词"
        />

        {/* 生成数量 */}
        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">生成数量</label>
        <input
          type="number"
          min={1}
          max={999}
          value={count}
          onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />

        {/* 命名模式 */}
        <label className="block text-sm text-[var(--text-tertiary)] mb-2">命名模式</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setNamingMode(0)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              namingMode === 0 ? "bg-indigo-600 text-white" : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            完全同名
          </button>
          <button
            onClick={() => setNamingMode(1)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              namingMode === 1 ? "bg-indigo-600 text-white" : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            序号递增
          </button>
        </div>

        {/* 时间安排 */}
        <label className="block text-sm text-[var(--text-tertiary)] mb-2">时间安排</label>
        <div className="flex items-center gap-3 mb-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer flex-shrink-0">
            <span>每日一条</span>
            <div
              onClick={() => setIsDaily(!isDaily)}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                isDaily ? "bg-indigo-600" : "bg-[var(--bg-subtle)]"
              }`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                isDaily ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </div>
          </label>
        </div>
        {isDaily && (
          <p className="text-xs text-[var(--text-muted)] mb-4">
            预计结束于：{endDate}
          </p>
        )}
        {!isDaily && (
          <p className="text-xs text-yellow-600 mb-4">
            关闭「每日一条」后，所有事件将为待分配状态（无日期）
          </p>
        )}

        {/* 预览 */}
        <div className="bg-[var(--bg-card)] rounded-xl px-3 py-2 mb-5">
          <p className="text-xs text-[var(--text-muted)] mb-1.5">预览（共 {count} 条）</p>
          {previewTitles.map((t, i) => (
            <p key={i} className="text-xs text-[var(--text-secondary)] truncate">• {t}</p>
          ))}
          {count > 5 && <p className="text-xs text-[var(--text-faint)]">…还有 {count - 5} 条</p>}
        </div>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">取消</button>
          <button onClick={handleGenerate} disabled={saving || !baseName.trim() || count <= 0}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "生成中…" : `生成 ${count} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 日程列表弹窗 ─────────────────────────────────────────────

function ProjectEventsDialog({
  project, eventsByDate, unscheduled, onClose,
  onBatchDelete, onBatchComplete, onBatchUncomplete, onDeleteSingle, onOpenBatchAdd,
}: {
  project: Project;
  eventsByDate: Record<string, CalendarEvent[]>;
  unscheduled: CalendarEvent[];
  onClose: () => void;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onBatchComplete: (ids: string[]) => Promise<void>;
  onBatchUncomplete: (ids: string[]) => Promise<void>;
  onDeleteSingle: (id: string, date: string | null) => Promise<void>;
  onOpenBatchAdd: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const lastClickedIdx = useRef<number | null>(null);

  const entries = getProjectEvents(eventsByDate, unscheduled, project.id);
  const color = colorToHex(project.color_value);
  const inSelectMode = selected.size > 0;

  // 分析选中项的完成状态
  const selectedEntries = entries.filter((e) => selected.has(e.event.id));
  const allCompleted = selectedEntries.length > 0 && selectedEntries.every((e) => e.event.is_completed);
  const allUncompleted = selectedEntries.length > 0 && selectedEntries.every((e) => !e.event.is_completed);

  function handleCircleClick(idx: number, e: React.MouseEvent) {
    const id = entries[idx].event.id;

    if (e.shiftKey && lastClickedIdx.current !== null) {
      // Shift+点击：范围选择
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(entries[i].event.id);
        }
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+点击：切换单个，保留其他选中
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else {
      // 普通点击：如果已选中则取消，否则只选中这一个
      setSelected((prev) => {
        if (prev.has(id) && prev.size === 1) {
          return new Set();
        }
        return new Set([id]);
      });
    }
    lastClickedIdx.current = idx;
  }

  function toggleSelectAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.event.id)));
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    try { await onBatchDelete([...selected]); setSelected(new Set()); lastClickedIdx.current = null; }
    finally { setBusy(false); }
  }

  async function handleBatchComplete() {
    if (selected.size === 0) return;
    setBusy(true);
    try { await onBatchComplete([...selected]); setSelected(new Set()); lastClickedIdx.current = null; }
    finally { setBusy(false); }
  }

  async function handleBatchUncomplete() {
    if (selected.size === 0) return;
    setBusy(true);
    try { await onBatchUncomplete([...selected]); setSelected(new Set()); lastClickedIdx.current = null; }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-[var(--text-primary)] flex-1 truncate">
            {inSelectMode ? `已选 ${selected.size} 项` : "日程列表"} · {project.name}
          </span>
          {inSelectMode ? (
            <>
              <button onClick={toggleSelectAll}
                className="text-[var(--text-tertiary)] hover:text-indigo-400 transition-colors p-1"
                title={selected.size === entries.length ? "取消全选" : "全选"}>
                <ListChecks size={17} />
              </button>
              <button onClick={() => { setSelected(new Set()); lastClickedIdx.current = null; }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1" title="取消选择">
                <X size={17} />
              </button>
            </>
          ) : (
            <>
              <button onClick={onOpenBatchAdd}
                className="text-[var(--text-tertiary)] hover:text-indigo-400 transition-colors p-1" title="批量添加">
                <PlusCircle size={17} />
              </button>
              <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1">
                <X size={17} />
              </button>
            </>
          )}
        </div>

        {/* 提示文字 */}
        {!inSelectMode && entries.length > 0 && (
          <p className="text-[10px] text-[var(--text-faint)] mb-2 px-1">点击圆圈选择，Ctrl 多选，Shift 范围选择</p>
        )}

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0">
          {entries.length === 0 ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">暂无相关日程</p>
          ) : (
            entries.map(({ date, event }, idx) => {
              const isSelected = selected.has(event.id);
              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl group transition-colors ${
                    isSelected ? "bg-indigo-500/10" : "hover:bg-[var(--bg-muted)]"
                  }`}
                >
                  {/* 圆圈按钮：加大点击热区 */}
                  <button
                    onClick={(e) => handleCircleClick(idx, e)}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
                  >
                    {isSelected ? (
                      <CheckCircle2 size={18} className="text-indigo-500" />
                    ) : event.is_completed ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                      <Circle size={18} className="text-[var(--text-muted)]" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${event.is_completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                      {event.title}
                    </p>
                    <p className="text-[10px] text-[var(--text-faint)]">
                      {date ?? <span className="text-yellow-600">待分配</span>}
                    </p>
                  </div>
                  {!inSelectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSingle(event.id, date); }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-[var(--bg-muted)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 底部操作栏 */}
        {inSelectMode ? (
          <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border-strong)] flex-shrink-0">
            <button onClick={handleBatchDelete} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600/80 text-white hover:bg-red-500 disabled:opacity-40 text-sm transition-colors font-medium">
              删除 ({selected.size})
            </button>
            {/* 根据选中项状态显示 完成/取消完成 */}
            {allCompleted ? (
              <button onClick={handleBatchUncomplete} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-yellow-600/80 text-white hover:bg-yellow-500 disabled:opacity-40 text-sm transition-colors font-medium">
                取消完成 ({selected.size})
              </button>
            ) : allUncompleted ? (
              <button onClick={handleBatchComplete} disabled={busy}
                className="flex-1 py-2 rounded-xl bg-green-600/80 text-white hover:bg-green-500 disabled:opacity-40 text-sm transition-colors font-medium">
                标记完成 ({selected.size})
              </button>
            ) : (
              // 混合选中：两个按钮都显示
              <>
                <button onClick={handleBatchUncomplete} disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-yellow-600/80 text-white hover:bg-yellow-500 disabled:opacity-40 text-sm transition-colors font-medium">
                  取消完成
                </button>
                <button onClick={handleBatchComplete} disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-green-600/80 text-white hover:bg-green-500 disabled:opacity-40 text-sm transition-colors font-medium">
                  标记完成
                </button>
              </>
            )}
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
  project, highlighted, isDragOver,
  onEdit, onAddEvent, onShowEvents, onDelete,
  onDragStart, onDragEnd,
}: {
  project: Project;
  highlighted: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onAddEvent: () => void;
  onShowEvents: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const color = colorToHex(project.color_value);
  const diffKey = (project.difficulty?.toLowerCase() ?? "low") as Difficulty;
  const diffCfg = DIFFICULTY_CONFIG[diffKey] ?? DIFFICULTY_CONFIG["low"];
  const DiffIcon = diffCfg.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
        isDragOver
          ? "border-indigo-400 bg-indigo-500/10 scale-[1.01]"
          : highlighted
          ? "border-indigo-500 bg-indigo-500/10"
          : "border-[var(--border-default)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
      }`}
      onClick={onEdit}
    >
      {/* 颜色头像 */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
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

      {/* 操作区 */}
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
        {/* 拖拽手柄：mousedown 触发拖拽 */}
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
  | { type: "addEvent"; project: Project }
  | { type: "batchAdd"; project: Project }
  | { type: "events"; project: Project }
  | { type: "confirmDelete"; project: Project };

export default function ProjectsPage() {
  const { projects, load, add, update, remove, reorder } = useProjectStore();
  const { eventsByDate, unscheduled, loadMonth, loadUnscheduled, addEvent, addEventsBatch, batchDeleteEvents, batchCompleteEvents, batchUncompleteEvents, deleteEvent, deleteByProject } = useEventStore();
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Project[]>([]);

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

  // 拖拽排序：使用 ReorderableList + pointer events
  async function handleReorder(fromIndex: number, toIndex: number) {
    const newOrder = [...localOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setLocalOrder(newOrder);
    setHighlighted(moved.id);
    await reorder(newOrder.map((p) => p.id));
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

  async function handleBatchAdd(events: CalendarEvent[]) {
    if (dialog?.type !== "batchAdd") return;
    await addEventsBatch(events);
    await loadUnscheduled();
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
        <ReorderableList
          items={localOrder}
          onReorder={handleReorder}
          renderItem={(project, _index, isDragOver, dragHandlers) => (
            <ProjectCard
              project={project}
              highlighted={highlighted === project.id}
              isDragOver={isDragOver}
              onDragStart={dragHandlers.onDragStart}
              onDragEnd={dragHandlers.onDragEnd}
              onEdit={() => { setHighlighted(project.id); setDialog({ type: "editor", project }); }}
              onAddEvent={() => { setHighlighted(project.id); setDialog({ type: "addEvent", project }); }}
              onShowEvents={() => { setHighlighted(project.id); setDialog({ type: "events", project }); }}
              onDelete={() => setDialog({ type: "confirmDelete", project })}
            />
          )}
        />
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
          onBatchUncomplete={batchUncompleteEvents}
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