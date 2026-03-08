import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Pencil, Trash2 } from "lucide-react";
import { useEventStore, type CalendarEvent } from "../store/useEventStore";
import { useProjectStore, type Project } from "../store/useProjectStore";

// ── 工具函数 ────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function getYearMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 按难度(高→低) + 项目优先级 排序，与 Flutter 逻辑一致
function compareEvents(
  a: CalendarEvent,
  b: CalendarEvent,
  projectMap: Record<string, Project>
) {
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
  onSelect: (month: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-72 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[var(--text-primary)] font-semibold">{year} 年</span>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => { onSelect(i + 1); onClose(); }}
              className={`py-2 rounded-xl text-sm transition-colors ${
                currentMonth === i + 1
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
  onClose,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
}: {
  date: string;
  events: CalendarEvent[];
  projects: Project[];
  projectMap: Record<string, Project>;
  onClose: () => void;
  onAdd: (title: string, projectId: string | null) => Promise<void>;
  onToggle: (id: string) => void;
  onEdit: (event: CalendarEvent, title: string, projectId: string | null) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState<string | null>(
    projects.length > 0 ? projects[0].id : null
  );
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [month, day] = [date.slice(5, 7), date.slice(8, 10)];

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await onAdd(newTitle.trim(), newProjectId);
      setNewTitle("");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setEditTitle(event.title);
    setEditProjectId(event.project_id);
  }

  async function handleSaveEdit() {
    if (!editingEvent || !editTitle.trim()) return;
    setSaving(true);
    try {
      await onEdit(editingEvent, editTitle.trim(), editProjectId);
      setEditingEvent(null);
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...events].sort((a, b) => compareEvents(a, b, projectMap));

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

// ── 日历格子 ─────────────────────────────────────────────────

function DayCell({
  day,
  isToday,
  isCurrentMonth,
  events,
  projectMap,
  onClick,
}: {
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
  projectMap: Record<string, Project>;
  onClick: () => void;
}) {
  const sorted = [...events].sort((a, b) => compareEvents(a, b, projectMap));
  const visible = sorted.slice(0, 2);
  const extra = sorted.length - 2;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-1.5 cursor-pointer transition-colors flex flex-col min-h-[72px] border
        ${isToday
          ? "bg-green-950/40 border-green-600"
          : isCurrentMonth
          ? "bg-[var(--bg-card)] border-[var(--border-default)] hover:border-[var(--bg-subtle)]"
          : "bg-[var(--bg-card)] border-[var(--border-default)] opacity-40"
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
              {isHigh && !event.is_completed && (
                <span className="text-[9px] flex-shrink-0">🔥</span>
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
  const { eventsByDate, loadMonth, addEvent, updateEvent, deleteEvent, toggle } = useEventStore();
  const { projects, projectMap, load: loadProjects } = useProjectStore();

  const today = new Date();
  const [focusedDate, setFocusedDate] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const year = focusedDate.getFullYear();
  const month = focusedDate.getMonth() + 1;

  // 切换月份时加载数据
  useEffect(() => {
    const ym = getYearMonth(focusedDate);
    Promise.all([loadMonth(ym), loadProjects()]).finally(() => setLoaded(true));
  }, [year, month]);

  function changeMonth(offset: number) {
    setFocusedDate((d) => new Date(d.getFullYear(), d.getMonth() + offset, 1));
  }

  // 日历格子数据
  const { cells } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7; // 周一为起始
    return { cells: { offset, daysInMonth } };
  }, [year, month]);

  // 项目统计（全量事件）
  const projectStats = useMemo(() => {
    const stats: Record<string, [number, number]> = {};
    for (const events of Object.values(eventsByDate)) {
      for (const e of events) {
        if (!e.project_id) continue;
        if (!stats[e.project_id]) stats[e.project_id] = [0, 0];
        stats[e.project_id][0]++;
        if (e.is_completed) stats[e.project_id][1]++;
      }
    }
    return stats;
  }, [eventsByDate]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.priority - b.priority),
    [projects]
  );

  const selectedDateEvents = selectedDay ? (eventsByDate[selectedDay] ?? []) : [];

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => changeMonth(-1)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMonthPicker(true)}
            className="text-2xl font-bold text-[var(--text-primary)] hover:text-indigo-400 transition-colors"
          >
            {MONTH_NAMES[month - 1]}
          </button>
          <span className="text-2xl font-light text-[var(--text-muted)]">{year}</span>
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* 主体：侧边栏 + 日历 */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* 项目侧边栏 */}
        <ProjectSidebar projects={sortedProjects} projectStats={projectStats} />

        {/* 日历区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 星期头 */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-bold text-[var(--text-faint)] py-1">
                {d}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          {!loaded ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-faint)]">加载中…</div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5 flex-1 auto-rows-fr">
              {/* 偏移空格 */}
              {Array.from({ length: cells.offset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* 日期 */}
              {Array.from({ length: cells.daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const isToday = dateStr === toDateStr(today);
                return (
                  <DayCell
                    key={dateStr}
                    day={dayNum}
                    isToday={isToday}
                    isCurrentMonth={true}
                    events={eventsByDate[dateStr] ?? []}
                    projectMap={projectMap}
                    onClick={() => setSelectedDay(dateStr)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 月份选择器弹窗 */}
      {showMonthPicker && (
        <MonthPicker
          year={year}
          currentMonth={month}
          onSelect={(m) => setFocusedDate(new Date(year, m - 1, 1))}
          onClose={() => setShowMonthPicker(false)}
        />
      )}

      {/* 日程管理弹窗 */}
      {selectedDay && (
        <EventManagerDialog
          date={selectedDay}
          events={selectedDateEvents}
          projects={sortedProjects}
          projectMap={projectMap}
          onClose={() => setSelectedDay(null)}
          onAdd={(title, projectId) => addEvent(title, projectId, selectedDay)}
          onToggle={(id) => toggle(id, selectedDay)}
          onEdit={(event, title, projectId) => updateEvent(event.id, selectedDay, title, projectId)}
          onDelete={(id) => deleteEvent(id, selectedDay)}
        />
      )}
    </div>
  );
}