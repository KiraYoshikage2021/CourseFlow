import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  AlertCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  EyeOff,
  Lock,
  LockOpen,
  Palette,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEventStore, type CalendarEvent } from "../store/useEventStore";
import { useProjectStore, type Project } from "../store/useProjectStore";
import { useHabitStore, type HabitWithStats } from "../store/useHabitStore";
import { useMilestoneStore } from "../store/useMilestoneStore";
import { useUiPreferencesStore, type TodayWorkbenchStyle } from "../store/useUiPreferencesStore";
import { DateInput } from "../components/FormControls";

// ── 工具函数 ────────────────────────────────────────────────

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function getYearMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function getWeekStart(d: Date) {
  const dayOffset = (d.getDay() + 6) % 7; // 周一为起始
  return addDays(d, -dayOffset);
}

function formatShortDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function dueLabel(dueDate?: string | null) {
  return dueDate ? `截止 ${dueDate.slice(5)}` : "";
}

function dueTone(event: CalendarEvent, today: string) {
  if (!event.due_date || event.is_completed) return "text-[var(--text-faint)]";
  if (event.due_date < today) return "text-red-400";
  if (event.due_date === today) return "text-yellow-400";
  return "text-[var(--text-faint)]";
}

function formatWeekRange(start: Date, end: Date) {
  const startText = `${start.getFullYear()}年${formatShortDate(start)}`;
  const endText = start.getFullYear() === end.getFullYear()
    ? formatShortDate(end)
    : `${end.getFullYear()}年${formatShortDate(end)}`;
  return `${startText} - ${endText}`;
}

type DashboardViewMode = "month" | "week";
type WeekDensity = "comfortable" | "compact";
type MilestoneNameMap = Record<string, string>;

type TodayWorkItem =
  | { kind: "task"; id: string; event: CalendarEvent; completed: boolean }
  | { kind: "habit"; id: string; habit: HabitWithStats; completed: boolean };

function getMilestoneName(event: CalendarEvent, milestoneMap: MilestoneNameMap) {
  return event.milestone_id ? milestoneMap[event.milestone_id] ?? null : null;
}

// 按完成状态(未完成优先) + 难度(高→低) + 项目优先级 排序
function compareEvents(
  a: CalendarEvent,
  b: CalendarEvent,
  projectMap: Record<string, Project>
) {
  if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
  const diffOrder = { high: 2, medium: 1, low: 0 };
  const pA = a.project_id ? projectMap[a.project_id] : null;
  const pB = b.project_id ? projectMap[b.project_id] : null;
  const dA = pA ? diffOrder[pA.difficulty] : 0;
  const dB = pB ? diffOrder[pB.difficulty] : 0;
  if (dA !== dB) return dB - dA;
  return (pA?.priority ?? 99) - (pB?.priority ?? 99);
}

const MONTH_NAMES = ["一月","二月","三月","四月","五月","六月",
                     "七月","八月","九月","十月","十一月","十二月"];
const WEEK_DAYS = ["一","二","三","四","五","六","日"];

// ── 月份选择器 ───────────────────────────────────────────────

function MonthPicker({
  year,
  currentMonth,
  onSelect,
  onClose,
}: {
  year: number;
  currentMonth: number;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const [pickerYear, setPickerYear] = useState(year);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-72 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPickerYear((y) => y - 1)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[var(--text-primary)] font-semibold">{pickerYear} 年</span>
            <button
              onClick={() => setPickerYear((y) => y + 1)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => { onSelect(pickerYear, i + 1); onClose(); }}
              className={`py-2 rounded-xl text-sm transition-colors ${
                pickerYear === year && currentMonth === i + 1
                  ? "bg-indigo-600 text-white font-semibold"
                  : "bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 事件管理弹窗 ─────────────────────────────────────────────

function EventManagerDialog({
  date,
  events,
  projects,
  projectMap,
  milestoneMap,
  onClose,
  onAdd,
  onToggle,
  onPin,
  onEdit,
  onDelete,
}: {
  date: string;
  events: CalendarEvent[];
  projects: Project[];
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  onClose: () => void;
  onAdd: (title: string, projectId: string | null, dueDate: string | null) => Promise<void>;
  onToggle: (id: string) => void;
  onPin: (id: string) => void;
  onEdit: (event: CalendarEvent, title: string, projectId: string | null, dueDate: string | null) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newProjectId, setNewProjectId] = useState<string | null>(
    projects.length > 0 ? projects[0].id : null
  );
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [month, day] = [date.slice(5, 7), date.slice(8, 10)];
  const todayStr = toDateStr(new Date());

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await onAdd(newTitle.trim(), newProjectId, newDueDate || null);
      setNewTitle("");
      setNewDueDate("");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setEditTitle(event.title);
    setEditProjectId(event.project_id);
    setEditDueDate(event.due_date ?? "");
  }

  async function handleSaveEdit() {
    if (!editingEvent || !editTitle.trim()) return;
    setSaving(true);
    try {
      await onEdit(editingEvent, editTitle.trim(), editProjectId, editDueDate || null);
      setEditingEvent(null);
    } finally {
      setSaving(false);
    }
  }

  const sorted = useMemo(
    () => [...events].sort((a, b) => compareEvents(a, b, projectMap)),
    [events, projectMap]
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{parseInt(month)}月{parseInt(day)}日</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        {/* 事件列表 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 mb-4 min-h-0">
          {sorted.length === 0 && (
            <p className="text-[var(--text-faint)] text-sm text-center py-6">暂无事项</p>
          )}
          {sorted.map((event) => {
            const project = event.project_id ? projectMap[event.project_id] : null;
            const milestoneName = getMilestoneName(event, milestoneMap);
            if (editingEvent?.id === event.id) {
              // 编辑行
              return (
                <div key={event.id} className="bg-[var(--bg-muted)] rounded-xl p-3 flex flex-col gap-2">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                    className="bg-[var(--bg-subtle)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <ProjectSelect
                    projects={projects}
                    value={editProjectId}
                    onChange={setEditProjectId}
                  />
                  <div>
                    <label className="block text-[10px] text-[var(--text-faint)] mb-1">截止日期</label>
                    <DateInput
                      value={editDueDate}
                      onChange={setEditDueDate}
                      placeholder="无截止日期"
                      buttonClassName="bg-[var(--bg-subtle)] border-transparent py-1.5"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingEvent(null)}
                      className="flex-1 py-1.5 rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-inactive)] text-sm transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 text-sm transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-muted)] group transition-colors"
              >
                <input
                  type="checkbox"
                  checked={event.is_completed}
                  onChange={() => onToggle(event.id)}
                  className="w-4 h-4 accent-indigo-500 flex-shrink-0 cursor-pointer"
                />
                {project && (
                  <div
                    className="w-1 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colorToHex(project.color_value) }}
                  />
                )}
                <span className={`flex-1 text-sm min-w-0 truncate ${
                  event.is_completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                }`}>
                  {event.title}
                </span>
                {project && (
                  <span className="text-xs text-[var(--text-muted)] hidden group-hover:inline">{project.name}</span>
                )}
                {milestoneName && (
                  <span className="max-w-24 truncate rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300">
                    {milestoneName}
                  </span>
                )}
                {event.due_date && (
                  <span className={`text-[10px] flex-shrink-0 ${dueTone(event, todayStr)}`}>
                    {dueLabel(event.due_date)}
                  </span>
                )}
                <button
                  onClick={() => onPin(event.id)}
                  title={event.is_pinned ? "取消锁定" : "锁定日期"}
                  className={`p-1 rounded transition-colors flex-shrink-0 ${
                    event.is_pinned
                      ? "text-amber-400"
                      : "opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-amber-400"
                  }`}
                >
                  {event.is_pinned ? <Lock size={13} /> : <LockOpen size={13} />}
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(event)}
                    className="text-[var(--text-tertiary)] hover:text-indigo-400 p-1 rounded transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(event.id)}
                    className="text-[var(--text-tertiary)] hover:text-red-400 p-1 rounded transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 添加新事项 */}
        <div className="border-t border-[var(--border-strong)] pt-4">
          <ProjectSelect projects={projects} value={newProjectId} onChange={setNewProjectId} />
          <div className="mt-2">
            <label className="block text-[10px] text-[var(--text-faint)] mb-1">截止日期</label>
            <DateInput
              value={newDueDate}
              onChange={setNewDueDate}
              placeholder="无截止日期"
              buttonClassName="bg-[var(--bg-muted)] border-transparent rounded-xl"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1 bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="添加事项…"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newTitle.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 项目选择器（共用子组件）───────────────────────────────────

function ProjectSelect({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
          value === null
            ? "bg-[var(--bg-inactive)] text-[var(--text-primary)]"
            : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
        }`}
      >
        无
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
            value === p.id
              ? "bg-indigo-600 text-white"
              : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
          }`}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorToHex(p.color_value) }}
          />
          {p.name}
        </button>
      ))}
    </div>
  );
}

// ── 今日工作区 ───────────────────────────────────────────────

function EventMiniRow({
  event,
  projectMap,
  milestoneMap,
  today,
  onToggle,
  onOpenDate,
}: {
  event: CalendarEvent;
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  today: string;
  onToggle: (event: CalendarEvent) => void | Promise<void>;
  onOpenDate: (date: string) => void;
}) {
  const project = event.project_id ? projectMap[event.project_id] : null;
  const color = project ? colorToHex(project.color_value) : "#6366f1";
  const milestoneName = getMilestoneName(event, milestoneMap);

  return (
    <div className="flex items-center gap-2 min-w-0 group">
      <input
        type="checkbox"
        checked={event.is_completed}
        onChange={() => onToggle(event)}
        className="w-3.5 h-3.5 accent-indigo-500 flex-shrink-0 cursor-pointer"
      />
      <div className="w-1 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <button
        onClick={() => event.date && onOpenDate(event.date)}
        disabled={!event.date}
        className={`flex-1 min-w-0 text-left text-xs truncate ${
          event.is_completed
            ? "line-through text-[var(--text-muted)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {event.title}
      </button>
      {event.date && (
        <span className="text-[10px] text-[var(--text-faint)] flex-shrink-0">{event.date.slice(5)}</span>
      )}
      {milestoneName && (
        <span className="max-w-20 truncate rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300 flex-shrink-0">
          {milestoneName}
        </span>
      )}
      {event.due_date && (
        <span className={`text-[10px] flex-shrink-0 ${dueTone(event, today)}`}>
          {dueLabel(event.due_date)}
        </span>
      )}
    </div>
  );
}

function TodayWorkItemRow({
  item,
  projectMap,
  milestoneMap,
  today,
  onToggleEvent,
  onToggleHabit,
  onOpenDate,
}: {
  item: TodayWorkItem;
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  today: string;
  onToggleEvent: (event: CalendarEvent) => void | Promise<void>;
  onToggleHabit: (habitId: string) => void | Promise<void>;
  onOpenDate: (date: string) => void;
}) {
  if (item.kind === "habit") {
    const habit = item.habit;
    const color = colorToHex(habit.color_value);
    return (
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="checkbox"
          checked={habit.completed_today}
          onChange={() => onToggleHabit(habit.id)}
          className="w-3.5 h-3.5 accent-green-500 flex-shrink-0 cursor-pointer"
        />
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <button
          onClick={() => onToggleHabit(habit.id)}
          className="flex-1 min-w-0 text-left"
        >
          <p className={`text-xs truncate ${
            habit.completed_today
              ? "line-through text-[var(--text-muted)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}>
            {habit.name}
          </p>
          <p className="text-[10px] text-[var(--text-faint)] truncate">
            习惯 · 连续 {habit.streak} 天
          </p>
        </button>
      </div>
    );
  }

  const event = item.event;
  const project = event.project_id ? projectMap[event.project_id] : null;
  const color = project ? colorToHex(project.color_value) : "#6366f1";
  const milestoneName = getMilestoneName(event, milestoneMap);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        type="checkbox"
        checked={event.is_completed}
        onChange={() => onToggleEvent(event)}
        className="w-3.5 h-3.5 accent-indigo-500 flex-shrink-0 cursor-pointer"
      />
      <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <button
        onClick={() => event.date && onOpenDate(event.date)}
        disabled={!event.date}
        className="flex-1 min-w-0 text-left"
      >
        <p className={`text-xs truncate ${
          event.is_completed
            ? "line-through text-[var(--text-muted)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}>
          {event.title}
        </p>
        <p className="text-[10px] text-[var(--text-faint)] truncate">
          任务{project ? ` · ${project.name}` : ""}
          {milestoneName ? ` · ${milestoneName}` : ""}
          {event.due_date && (
            <span className={dueTone(event, today)}> · {dueLabel(event.due_date)}</span>
          )}
        </p>
      </button>
    </div>
  );
}

function TodayWorkPanel({
  today,
  style,
  todayEvents,
  overdueEvents,
  unscheduledEvents,
  habits,
  projects,
  projectMap,
  milestoneMap,
  onAddToday,
  onToggleEvent,
  onToggleHabit,
  onOpenDate,
}: {
  today: string;
  style: TodayWorkbenchStyle;
  todayEvents: CalendarEvent[];
  overdueEvents: CalendarEvent[];
  unscheduledEvents: CalendarEvent[];
  habits: HabitWithStats[];
  projects: Project[];
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  onAddToday: (title: string, projectId: string | null) => Promise<void>;
  onToggleEvent: (event: CalendarEvent) => void | Promise<void>;
  onToggleHabit: (habitId: string) => void | Promise<void>;
  onOpenDate: (date: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  const todayTasks = useMemo(
    () => [...todayEvents].sort((a, b) => compareEvents(a, b, projectMap)),
    [todayEvents, projectMap]
  );
  const visibleOverdue = useMemo(
    () => [...overdueEvents].filter((e) => !e.is_completed).slice(0, 5),
    [overdueEvents]
  );
  const visibleUnscheduled = useMemo(
    () => [...unscheduledEvents]
      .filter((e) => !e.is_completed)
      .sort((a, b) => compareEvents(a, b, projectMap))
      .slice(0, 5),
    [unscheduledEvents, projectMap]
  );
  const todayHabits = useMemo(
    () => habits.filter((h) => h.scheduled_today),
    [habits]
  );
  const todayWorkItems = useMemo<TodayWorkItem[]>(() => {
    const items: TodayWorkItem[] = [
      ...todayTasks.map((event) => ({
        kind: "task" as const,
        id: `task-${event.id}`,
        event,
        completed: event.is_completed,
      })),
      ...todayHabits.map((habit) => ({
        kind: "habit" as const,
        id: `habit-${habit.id}`,
        habit,
        completed: habit.completed_today,
      })),
    ];

    return items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.kind === "task" && b.kind === "task") {
        return compareEvents(a.event, b.event, projectMap);
      }
      if (a.kind === "habit" && b.kind === "habit") {
        return a.habit.name.localeCompare(b.habit.name);
      }
      return a.kind === "task" ? -1 : 1;
    });
  }, [todayTasks, todayHabits, projectMap]);
  const openTodayItems = todayWorkItems.filter((item) => !item.completed).length;
  const completedTodayItems = todayWorkItems.length - openTodayItems;
  const useCardLayout = style === "cards";
  const panelGridClass = useCardLayout
    ? "grid grid-cols-1 xl:grid-cols-[1.05fr_1.45fr_1fr_1fr] gap-3"
    : "grid grid-cols-1 xl:grid-cols-[1.05fr_1.45fr_1fr_1fr] rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)]/30 divide-y xl:divide-y-0 xl:divide-x divide-[var(--border-default)] overflow-hidden";
  const panelSectionClass = useCardLayout
    ? "rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-3 min-w-0"
    : "p-3 min-w-0";
  const overdueSectionClass = useCardLayout
    ? "rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 min-w-0"
    : "p-3 min-w-0 bg-yellow-500/5";

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAddToday(title.trim(), projectId);
      setTitle("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">今日工作台</h1>
          <p className="text-xs text-[var(--text-muted)]">{today}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span>{openTodayItems} 个待执行</span>
          <span>{completedTodayItems}/{todayWorkItems.length} 今日完成</span>
          <span>{visibleOverdue.length} 个逾期</span>
        </div>
      </div>

      <div className={panelGridClass}>
        <div className={panelSectionClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-2">
            <Plus size={15} className="text-indigo-400" />
            快速添加
          </div>
          <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
          <div className="flex gap-2 mt-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1 min-w-0 bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="添加到今天…"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !title.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              添加
            </button>
          </div>
        </div>

        <div className={panelSectionClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-2">
            <CalendarCheck size={15} className="text-green-400" />
            今日执行
          </div>
          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
            {todayWorkItems.map((item) => (
              <TodayWorkItemRow
                key={item.id}
                item={item}
                projectMap={projectMap}
                milestoneMap={milestoneMap}
                today={today}
                onToggleEvent={onToggleEvent}
                onToggleHabit={onToggleHabit}
                onOpenDate={onOpenDate}
              />
            ))}
            {todayWorkItems.length === 0 && (
              <span className="text-xs text-[var(--text-faint)]">今天没有执行项</span>
            )}
          </div>
        </div>

        <div className={overdueSectionClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-400 mb-2">
            <AlertCircle size={15} />
            逾期任务
          </div>
          <div className="flex flex-col gap-1.5">
            {visibleOverdue.map((event) => (
              <EventMiniRow
                key={event.id}
                event={event}
                projectMap={projectMap}
                milestoneMap={milestoneMap}
                today={today}
                onToggle={onToggleEvent}
                onOpenDate={onOpenDate}
              />
            ))}
            {visibleOverdue.length === 0 && (
              <span className="text-xs text-[var(--text-faint)]">没有逾期任务</span>
            )}
          </div>
        </div>

        <div className={panelSectionClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-2">
            <ClipboardList size={15} className="text-purple-400" />
            待分配
          </div>
          <div className="flex flex-col gap-1.5">
            {visibleUnscheduled.map((event) => (
              <EventMiniRow
                key={event.id}
                event={event}
                projectMap={projectMap}
                milestoneMap={milestoneMap}
                today={today}
                onToggle={onToggleEvent}
                onOpenDate={onOpenDate}
              />
            ))}
            {visibleUnscheduled.length === 0 && (
              <span className="text-xs text-[var(--text-faint)]">没有待分配任务</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 日历格子 ─────────────────────────────────────────────────

function DayCell({
  day,
  isToday,
  isCurrentMonth,
  style,
  events,
  projectMap,
  milestoneMap,
  onClick,
}: {
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  style: TodayWorkbenchStyle;
  events: CalendarEvent[];
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  onClick: () => void;
}) {
  const useCardLayout = style === "cards";
  const sorted = useMemo(
    () => [...events].sort((a, b) => compareEvents(a, b, projectMap)),
    [events, projectMap]
  );
  const visible = sorted.slice(0, 2);
  const extra = sorted.length - 2;

  return (
    <div
      onClick={onClick}
      className={`${useCardLayout ? "rounded-xl" : "rounded-md"} p-1.5 cursor-pointer transition-colors flex flex-col min-h-[72px] border
        ${isToday
          ? "bg-green-500/10 border-green-600"
          : isCurrentMonth
          ? useCardLayout
            ? "bg-[var(--bg-card)] border-[var(--border-default)] hover:border-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)]/50"
            : "bg-transparent border-[var(--border-default)] hover:bg-[var(--bg-card)]/60 hover:border-[var(--bg-subtle)]"
          : useCardLayout
          ? "bg-[var(--bg-card)] border-[var(--border-default)] opacity-40"
          : "bg-transparent border-[var(--border-default)] opacity-40"
        }`}
    >
      <span className={`text-xs font-bold mb-1 ${isToday ? "text-green-400" : "text-[var(--text-secondary)]"}`}>
        {day}
      </span>
      <div className="flex flex-col gap-0.5 flex-1">
        {visible.map((event) => {
          const project = event.project_id ? projectMap[event.project_id] : null;
          const color = project ? colorToHex(project.color_value) : "#6366f1";
          const isHigh = project?.difficulty === "high";
          const milestoneName = getMilestoneName(event, milestoneMap);
          return (
            <div
              key={event.id}
              className="rounded px-1 py-0.5 flex items-center gap-1 min-w-0"
              style={{
                backgroundColor: event.is_completed ? "var(--bg-muted)" : color + "33",
                borderLeft: isHigh && !event.is_completed ? `2px solid ${color}` : undefined,
              }}
            >
              <span
                className="text-[10px] truncate font-semibold leading-tight"
                style={{
                  color: event.is_completed ? "var(--text-muted)" : color,
                  textDecoration: event.is_completed ? "line-through" : undefined,
                }}
              >
                {event.title}
              </span>
              {milestoneName && (
                <span className="max-w-12 truncate rounded bg-[var(--bg-elevated)] px-1 text-[8px] text-indigo-300 flex-shrink-0">
                  {milestoneName}
                </span>
              )}
              {isHigh && !event.is_completed && (
                <span className="text-[9px] flex-shrink-0">🔥</span>
              )}
              {event.is_pinned && (
                <span className="text-[9px] flex-shrink-0">📌</span>
              )}
            </div>
          );
        })}
        {extra > 0 && (
          <span className="text-[9px] text-[var(--text-faint)] pl-1">+{extra}</span>
        )}
      </div>
    </div>
  );
}

// ── 周视图 ───────────────────────────────────────────────────

function WeekEventRow({
  event,
  projectMap,
  milestoneMap,
  today,
  density,
  showProjectAccents,
  onToggle,
  onOpenDate,
  onDragStart,
}: {
  event: CalendarEvent;
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  today: string;
  density: WeekDensity;
  showProjectAccents: boolean;
  onToggle: (event: CalendarEvent) => void | Promise<void>;
  onOpenDate: (date: string) => void;
  onDragStart: (event: CalendarEvent, e: DragEvent<HTMLDivElement>) => void;
}) {
  const project = event.project_id ? projectMap[event.project_id] : null;
  const color = project ? colorToHex(project.color_value) : "#6366f1";
  const milestoneName = getMilestoneName(event, milestoneMap);
  const isCompact = density === "compact";
  const accentStyle = showProjectAccents
    ? {
        backgroundColor: event.is_completed ? "var(--bg-muted)" : `${color}16`,
        borderColor: event.is_completed ? "transparent" : `${color}44`,
        borderLeftColor: event.is_completed ? `${color}55` : color,
      }
    : {
        backgroundColor: "var(--bg-muted)",
        borderColor: "transparent",
        borderLeftColor: "transparent",
      };

  return (
    <div
      draggable={!event.is_pinned}
      onDragStart={(e) => onDragStart(event, e)}
      className={`group flex items-start min-w-0 border border-l-[3px] ${
        isCompact ? "gap-1.5 rounded-md px-1.5 py-1" : "gap-2 rounded-lg px-2 py-2"
      } ${
        event.is_pinned ? "" : "cursor-grab active:cursor-grabbing"
      }`}
      style={accentStyle}
      title={event.is_pinned ? "已锁定，不能拖拽移动" : "拖拽到其他日期"}
    >
      <input
        type="checkbox"
        checked={event.is_completed}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(event)}
        className={`${isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} mt-0.5 accent-indigo-500 flex-shrink-0 cursor-pointer`}
      />
      <button
        onClick={() => event.date && onOpenDate(event.date)}
        className="flex-1 min-w-0 text-left"
      >
        <span
          className={`block ${isCompact ? "text-[11px]" : "text-xs"} leading-snug truncate ${
            event.is_completed
              ? "line-through text-[var(--text-muted)]"
              : "text-[var(--text-primary)] group-hover:text-indigo-300"
          }`}
        >
          {event.title}
        </span>
        <span className={`block ${isCompact ? "text-[9px]" : "text-[10px]"} truncate mt-0.5 ${event.due_date ? dueTone(event, today) : "text-[var(--text-faint)]"}`}>
          {project?.name ?? "无项目"}
          {milestoneName ? ` · ${milestoneName}` : ""}
          {event.due_date ? ` · ${dueLabel(event.due_date)}` : ""}
        </span>
      </button>
      {event.is_pinned && <Lock size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />}
    </div>
  );
}

function WeekView({
  weekDates,
  todayStr,
  eventsByDate,
  projectMap,
  milestoneMap,
  style,
  density,
  hideCompleted,
  showProjectAccents,
  onOpenDate,
  onToggle,
  onMoveEvent,
}: {
  weekDates: Date[];
  todayStr: string;
  eventsByDate: Record<string, CalendarEvent[]>;
  projectMap: Record<string, Project>;
  milestoneMap: MilestoneNameMap;
  style: TodayWorkbenchStyle;
  density: WeekDensity;
  hideCompleted: boolean;
  showProjectAccents: boolean;
  onOpenDate: (date: string) => void;
  onToggle: (event: CalendarEvent) => void | Promise<void>;
  onMoveEvent: (event: CalendarEvent, targetDate: string) => void | Promise<void>;
}) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const isCompact = density === "compact";
  const useCardLayout = style === "cards";

  function handleEventDragStart(event: CalendarEvent, e: DragEvent<HTMLDivElement>) {
    if (event.is_pinned) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/x-courseflow-event",
      JSON.stringify({ id: event.id, date: event.date })
    );
    e.dataTransfer.setData("text/plain", event.id);
  }

  function getDraggedEvent(e: DragEvent<HTMLDivElement>) {
    const raw = e.dataTransfer.getData("application/x-courseflow-event");
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as { id?: string; date?: string | null };
      if (!payload.id || !payload.date) return null;
      return (eventsByDate[payload.date] ?? []).find((event) => event.id === payload.id) ?? null;
    } catch {
      return null;
    }
  }

  return (
    <div className={`grid grid-cols-7 ${useCardLayout ? "gap-2" : "gap-0"} flex-1 min-h-0`}>
      {weekDates.map((date, index) => {
        const dateStr = toDateStr(date);
        const allEvents = [...(eventsByDate[dateStr] ?? [])].sort((a, b) => compareEvents(a, b, projectMap));
        const events = hideCompleted
          ? allEvents.filter((event) => !event.is_completed)
          : allEvents;
        const openCount = allEvents.filter((event) => !event.is_completed).length;
        const hiddenCompletedCount = allEvents.length - events.length;
        const isToday = dateStr === todayStr;
        const isDragOver = dragOverDate === dateStr;
        const columnShapeClass = useCardLayout ? "rounded-xl border" : "border-y border-r first:border-l";
        const columnToneClass = isDragOver
          ? "border-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-400/30"
          : isToday
          ? "border-green-600 bg-green-500/10"
          : useCardLayout
          ? "border-[var(--border-default)] bg-[var(--bg-card)]"
          : "border-[var(--border-default)] bg-[var(--bg-card)]/30";

        return (
          <div
            key={dateStr}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverDate !== dateStr) setDragOverDate(dateStr);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOverDate(dateStr);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragOverDate(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDate(null);
              const draggedEvent = getDraggedEvent(e);
              if (!draggedEvent || draggedEvent.date === dateStr) return;
              void onMoveEvent(draggedEvent, dateStr);
            }}
            className={`${columnShapeClass} ${columnToneClass} flex flex-col min-h-0`}
          >
            <button
              onClick={() => onOpenDate(dateStr)}
              className={`${isCompact ? "px-2 py-1.5" : "px-3 py-2"} ${useCardLayout ? "rounded-t-xl" : ""} text-left border-b border-[var(--border-default)] hover:bg-[var(--bg-muted)] transition-colors`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${isToday ? "text-green-400" : "text-[var(--text-secondary)]"}`}>
                  周{WEEK_DAYS[index]}
                </span>
                <span className="text-[10px] text-[var(--text-faint)]">{openCount} 未完成</span>
              </div>
              <div className={`${isCompact ? "mt-0.5" : "mt-1"} flex items-end gap-1`}>
                <span className={`${isCompact ? "text-xl" : "text-2xl"} font-bold leading-none ${isToday ? "text-green-300" : "text-[var(--text-primary)]"}`}>
                  {date.getDate()}
                </span>
                <span className="text-[10px] text-[var(--text-faint)] mb-0.5">{date.getMonth() + 1}月</span>
              </div>
            </button>

            <div className={`flex-1 overflow-y-auto ${isCompact ? "p-1.5 gap-1" : "p-2 gap-1.5"} flex flex-col min-h-0`}>
              {events.map((event) => (
                <WeekEventRow
                  key={event.id}
                  event={event}
                  projectMap={projectMap}
                  milestoneMap={milestoneMap}
                  today={todayStr}
                  density={density}
                  showProjectAccents={showProjectAccents}
                  onToggle={onToggle}
                  onOpenDate={onOpenDate}
                  onDragStart={handleEventDragStart}
                />
              ))}
              {events.length === 0 && (
                <div className="flex-1 min-h-[80px] flex items-center justify-center text-xs text-[var(--text-faint)]">
                  {hiddenCompletedCount > 0 ? `已隐藏 ${hiddenCompletedCount} 个完成项` : "空"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 项目侧边栏 ───────────────────────────────────────────────

function ProjectSidebar({
  projects,
  projectStats,
}: {
  projects: Project[];
  projectStats: Record<string, [number, number]>;
}) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-[var(--border-default)] pr-4 pt-2 flex flex-col gap-3">
      <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">项目进度</span>
      {projects.map((p) => {
        const [total, done] = projectStats[p.id] ?? [0, 0];
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const color = colorToHex(p.color_value);
        return (
          <div key={p.id} className="flex items-center gap-2.5">
            {/* 环形进度 */}
            <div className="relative w-9 h-9 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--ring-track)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={color} strokeWidth="3" strokeOpacity="0.6"
                  strokeDasharray={`${pct * 0.942} 94.2`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-tertiary)] font-bold">
                {pct}%
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-[var(--text-secondary)] truncate">{p.name}</span>
                {p.difficulty === "high" && <span className="text-[10px]">🔥</span>}
              </div>
              <span className="text-[10px] text-[var(--text-faint)]">{done}/{total} 完成</span>
            </div>
          </div>
        );
      })}
      {projects.length === 0 && (
        <p className="text-xs text-[var(--text-faintest)]">暂无项目</p>
      )}
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    eventsByDate,
    unscheduled,
    overdue,
    loadMonth,
    loadUnscheduled,
    loadOverdue,
    addEvent,
    updateEvent,
    moveEventDate,
    deleteEvent,
    toggle,
    pin,
  } = useEventStore();
  const { projects, projectMap, load: loadProjects } = useProjectStore();
  const { habits, load: loadHabits, toggle: toggleHabit } = useHabitStore();
  const { milestonesByProject, load: loadMilestones } = useMilestoneStore();
  const { todayWorkbenchStyle } = useUiPreferencesStore();

  const today = new Date();
  const todayStr = toDateStr(today);
  const [focusedDate, setFocusedDate] = useState(today);
  const [viewMode, setViewMode] = useState<DashboardViewMode>("week");
  const [weekDensity, setWeekDensity] = useState<WeekDensity>("comfortable");
  const [weekHideCompleted, setWeekHideCompleted] = useState(false);
  const [weekProjectAccents, setWeekProjectAccents] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [projectStats, setProjectStats] = useState<Record<string, [number, number]>>({});

  const year = focusedDate.getFullYear();
  const month = focusedDate.getMonth() + 1;
  const weekStart = useMemo(() => getWeekStart(focusedDate), [focusedDate]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );
  const weekStartStr = toDateStr(weekDates[0]);
  const weekEndStr = toDateStr(weekDates[6]);

  async function loadProjectStats() {
    const stats = await invoke<Record<string, [number, number]>>("get_project_stats");
    setProjectStats(stats);
  }

  // 切换月份/周时加载可见范围数据
  useEffect(() => {
    const visibleMonths = new Set([getYearMonth(focusedDate), getYearMonth(today)]);
    if (viewMode === "week") {
      visibleMonths.add(getYearMonth(weekDates[0]));
      visibleMonths.add(getYearMonth(weekDates[6]));
    }

    Promise.all([
      ...Array.from(visibleMonths).map((ym) => loadMonth(ym)),
      loadUnscheduled(),
      loadOverdue(todayStr),
      loadHabits(todayStr),
      loadProjects(),
      loadProjectStats(),
    ]).finally(() => setLoaded(true));
  }, [year, month, viewMode, weekStartStr, weekEndStr, todayStr]);

  async function handleAddToday(title: string, projectId: string | null) {
    await addEvent(title, projectId, todayStr);
    await loadProjectStats();
  }

  async function handleToggleEvent(event: CalendarEvent) {
    await toggle(event.id, event.date);
    await loadProjectStats();
  }

  async function handleMoveEvent(event: CalendarEvent, targetDate: string) {
    await moveEventDate(event, targetDate);
    await loadOverdue(todayStr);
  }

  async function handleToggleHabit(habitId: string) {
    await toggleHabit(habitId, todayStr);
  }

  function changePeriod(offset: number) {
    setFocusedDate((d) =>
      viewMode === "week"
        ? addDays(d, offset * 7)
        : new Date(d.getFullYear(), d.getMonth() + offset, 1)
    );
  }

  // 日历格子数据
  const { cells } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7; // 周一为起始
    return { cells: { offset, daysInMonth } };
  }, [year, month]);

  const sortedProjects = useMemo(
    () => projects.filter((p) => !p.is_archived).sort((a, b) => a.priority - b.priority),
    [projects]
  );

  useEffect(() => {
    if (sortedProjects.length === 0) return;
    void Promise.all(sortedProjects.map((project) => loadMilestones(project.id)));
  }, [sortedProjects, loadMilestones]);

  const activeProjectMap = useMemo(
    () => Object.fromEntries(sortedProjects.map((p) => [p.id, p])),
    [sortedProjects]
  );

  const milestoneMap = useMemo<MilestoneNameMap>(
    () =>
      Object.fromEntries(
        Object.values(milestonesByProject)
          .flat()
          .map((milestone) => [milestone.id, milestone.name])
      ),
    [milestonesByProject]
  );

  const isVisibleEvent = (event: CalendarEvent) =>
    !event.project_id || !projectMap[event.project_id]?.is_archived;

  const selectedDateEvents = selectedDay
    ? (eventsByDate[selectedDay] ?? []).filter(isVisibleEvent)
    : [];

  const todayEvents = (eventsByDate[todayStr] ?? []).filter(isVisibleEvent);
  const visibleOverdue = overdue.filter(isVisibleEvent);
  const visibleUnscheduled = unscheduled.filter(isVisibleEvent);
  const weekEventsByDate = useMemo(() => {
    const result: Record<string, CalendarEvent[]> = {};
    for (const date of weekDates) {
      const dateStr = toDateStr(date);
      result[dateStr] = (eventsByDate[dateStr] ?? []).filter(isVisibleEvent);
    }
    return result;
  }, [weekDates, eventsByDate, projectMap]);
  const weekSummary = useMemo(() => {
    const events = Object.values(weekEventsByDate).flat();
    const completed = events.filter((event) => event.is_completed).length;
    return {
      total: events.length,
      open: events.length - completed,
      completed,
    };
  }, [weekEventsByDate]);
  const periodTitle = viewMode === "week"
    ? formatWeekRange(weekDates[0], weekDates[6])
    : MONTH_NAMES[month - 1];

  return (
    <div className="p-6 min-h-full flex flex-col">
      <TodayWorkPanel
        today={todayStr}
        style={todayWorkbenchStyle}
        todayEvents={todayEvents}
        overdueEvents={visibleOverdue}
        unscheduledEvents={visibleUnscheduled}
        habits={habits}
        projects={sortedProjects}
        projectMap={activeProjectMap}
        milestoneMap={milestoneMap}
        onAddToday={handleAddToday}
        onToggleEvent={handleToggleEvent}
        onToggleHabit={handleToggleHabit}
        onOpenDate={setSelectedDay}
      />

      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => changePeriod(-1)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMonthPicker(true)}
            className="text-2xl font-bold text-[var(--text-primary)] hover:text-indigo-400 transition-colors"
          >
            {periodTitle}
          </button>
          {viewMode === "month" && (
            <span className="text-2xl font-light text-[var(--text-muted)]">{year}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[var(--bg-muted)] rounded-lg p-0.5">
            {(["week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === mode
                    ? "bg-indigo-600 text-white"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {mode === "month" ? "月" : "周"}
              </button>
            ))}
          </div>
          <button
            onClick={() => changePeriod(1)}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      {viewMode === "week" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border-default)] bg-[var(--bg-card)]/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <SlidersHorizontal size={14} />
            <span>周视图</span>
            <span className="text-[var(--text-faint)]">
              {weekSummary.open} 未完成 · {weekSummary.completed}/{weekSummary.total} 已完成
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-[var(--bg-muted)] p-0.5">
              {([
                ["comfortable", "舒适"],
                ["compact", "紧凑"],
              ] as const).map(([density, label]) => (
                <button
                  key={density}
                  onClick={() => setWeekDensity(density)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    weekDensity === density
                      ? "bg-indigo-600 text-white"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setWeekHideCompleted((value) => !value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors ${
                weekHideCompleted
                  ? "bg-indigo-600/15 text-indigo-300"
                  : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <EyeOff size={13} />
              隐藏已完成
            </button>
            <button
              onClick={() => setWeekProjectAccents((value) => !value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors ${
                weekProjectAccents
                  ? "bg-indigo-600/15 text-indigo-300"
                  : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Palette size={13} />
              项目色
            </button>
          </div>
        </div>
      )}

      {/* 主体：侧边栏 + 日历 */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* 项目侧边栏 */}
        <ProjectSidebar projects={sortedProjects} projectStats={projectStats} />

        {/* 日历区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {!loaded ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-faint)]">加载中…</div>
          ) : viewMode === "week" ? (
            <WeekView
              weekDates={weekDates}
              todayStr={todayStr}
              eventsByDate={weekEventsByDate}
              projectMap={activeProjectMap}
              milestoneMap={milestoneMap}
              style={todayWorkbenchStyle}
              density={weekDensity}
              hideCompleted={weekHideCompleted}
              showProjectAccents={weekProjectAccents}
              onOpenDate={setSelectedDay}
              onToggle={handleToggleEvent}
              onMoveEvent={handleMoveEvent}
            />
          ) : (
            <>
              {/* 星期头 */}
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {WEEK_DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-bold text-[var(--text-faint)] py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* 日期格子 */}
              <div className="grid grid-cols-7 gap-1.5 flex-1 auto-rows-fr">
                {/* 偏移空格 */}
                {Array.from({ length: cells.offset }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {/* 日期 */}
                {Array.from({ length: cells.daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  return (
                    <DayCell
                      key={dateStr}
                      day={dayNum}
                      isToday={isToday}
                      isCurrentMonth={true}
                      style={todayWorkbenchStyle}
                      events={(eventsByDate[dateStr] ?? []).filter(isVisibleEvent)}
                      projectMap={activeProjectMap}
                      milestoneMap={milestoneMap}
                      onClick={() => setSelectedDay(dateStr)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 月份选择器弹窗 */}
      {showMonthPicker && (
        <MonthPicker
          year={year}
          currentMonth={month}
          onSelect={(y, m) => setFocusedDate(new Date(y, m - 1, 1))}
          onClose={() => setShowMonthPicker(false)}
        />
      )}

      {/* 日程管理弹窗 */}
      {selectedDay && (
        <EventManagerDialog
          date={selectedDay}
          events={selectedDateEvents}
          projects={sortedProjects}
          projectMap={activeProjectMap}
          milestoneMap={milestoneMap}
          onClose={() => setSelectedDay(null)}
          onAdd={(title, projectId, dueDate) => addEvent(title, projectId, selectedDay, dueDate)}
          onToggle={(id) => toggle(id, selectedDay)}
          onPin={(id) => pin(id, selectedDay)}
          onEdit={(event, title, projectId, dueDate) => updateEvent(event.id, selectedDay, title, projectId, dueDate)}
          onDelete={(id) => deleteEvent(id, selectedDay)}
        />
      )}
    </div>
  );
}
