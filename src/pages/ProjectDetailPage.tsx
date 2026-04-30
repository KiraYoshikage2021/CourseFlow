import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle, ArrowLeft, Archive, BarChart3, CheckCircle2, Circle, ClipboardList, Flag,
  LayoutList, ListChecks, Pencil, Plus, PlusCircle, RotateCcw, Save, Search, Settings, Trash2, X,
} from "lucide-react";
import { useProjectStore, type Difficulty, type Project } from "../store/useProjectStore";
import { useEventStore, type CalendarEvent } from "../store/useEventStore";
import {
  useMilestoneStore,
  type MilestoneStatus,
  type MilestoneWithStats,
} from "../store/useMilestoneStore";
import { AppSelect, DateInput } from "../components/FormControls";

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function toDateStr(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function taskSortDate(event: CalendarEvent) {
  return event.due_date ?? event.date ?? "9999-12-31";
}

function compareOpenTasks(a: CalendarEvent, b: CalendarEvent) {
  const dateCompare = taskSortDate(a).localeCompare(taskSortDate(b));
  if (dateCompare !== 0) return dateCompare;
  return a.title.localeCompare(b.title, "zh-Hans");
}

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: "未开始",
  active: "进行中",
  completed: "已完成",
};

const MILESTONE_STATUS_OPTIONS = [
  { value: "not_started", label: "未开始" },
  { value: "active", label: "进行中" },
  { value: "completed", label: "已完成" },
];

const DIFFICULTY_OPTIONS = [
  { value: "low", label: "低难度" },
  { value: "medium", label: "中难度" },
  { value: "high", label: "高难度" },
];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

type TaskStatusFilter = "all" | "open" | "completed";
type TaskScheduleFilter = "all" | "scheduled" | "unscheduled";
type DetailTab = "overview" | "tasks" | "statistics" | "settings";
type TaskViewMode = "flat" | "grouped";
type TaskGroup = {
  id: string;
  name: string;
  milestone: MilestoneWithStats | null;
  events: CalendarEvent[];
};
type DetailDialog = MilestoneWithStats | "add" | "batchAdd" | null;

function MilestoneDialog({
  milestone,
  onClose,
  onSave,
}: {
  milestone?: MilestoneWithStats;
  onClose: () => void;
  onSave: (name: string, status: MilestoneStatus, targetDate: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? "not_started");
  const [targetDate, setTargetDate] = useState(milestone?.target_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("请输入阶段名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim(), status, targetDate || null);
      onClose();
    } catch (e) {
      setError(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {milestone ? "编辑阶段" : "新增阶段"}
          </h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs text-[var(--text-tertiary)] mb-1">名称</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          placeholder="例如：基础概念"
        />

        <label className="block text-xs text-[var(--text-tertiary)] mb-1">状态</label>
        <AppSelect
          value={status}
          onChange={(value) => setStatus(value as MilestoneStatus)}
          options={MILESTONE_STATUS_OPTIONS}
          className="mb-4"
          buttonClassName="bg-[var(--bg-muted)] border-transparent"
        />

        <label className="block text-xs text-[var(--text-tertiary)] mb-1">目标日期</label>
        <DateInput
          value={targetDate}
          onChange={setTargetDate}
          placeholder="无目标日期"
          className="mb-4"
          buttonClassName="bg-[var(--bg-muted)] border-transparent"
        />

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchAddDialog({
  project,
  milestones,
  onSave,
  onClose,
}: {
  project: Project;
  milestones: MilestoneWithStats[];
  onSave: (events: CalendarEvent[]) => Promise<void>;
  onClose: () => void;
}) {
  const [baseName, setBaseName] = useState(project.name);
  const [count, setCount] = useState(5);
  const [namingMode, setNamingMode] = useState<0 | 1>(0);
  const [startDate, setStartDate] = useState(toDateStr(new Date()));
  const [isDaily, setIsDaily] = useState(true);
  const [milestoneId, setMilestoneId] = useState("");
  const [saving, setSaving] = useState(false);

  const milestoneOptions = useMemo(
    () => [
      { value: "", label: "未分阶段" },
      ...milestones.map((milestone) => ({
        value: milestone.id,
        label: milestone.name,
      })),
    ],
    [milestones]
  );

  const endDate = (() => {
    if (!isDaily || count <= 1) return startDate;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + count - 1);
    return toDateStr(d);
  })();

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
          is_pinned: false,
          project_id: project.id,
          milestone_id: milestoneId || null,
          due_date: null,
        });
      }

      await onSave(events);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorToHex(project.color_value) }}
          />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1 truncate">批量添加任务</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">任务名称前缀</label>
        <input
          autoFocus
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          placeholder="例如：背单词"
        />

        <label className="block text-sm text-[var(--text-tertiary)] mb-1.5">生成数量</label>
        <input
          type="number"
          min={1}
          max={999}
          value={count}
          onChange={(e) => setCount(Math.max(1, Number.parseInt(e.target.value) || 1))}
          className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />

        <label className="block text-sm text-[var(--text-tertiary)] mb-2">所属阶段</label>
        <AppSelect
          value={milestoneId}
          onChange={setMilestoneId}
          options={milestoneOptions}
          className="mb-4"
          buttonClassName="bg-[var(--bg-muted)] border-transparent"
        />

        <label className="block text-sm text-[var(--text-tertiary)] mb-2">命名模式</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setNamingMode(0)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              namingMode === 0
                ? "bg-indigo-600 text-white"
                : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            完全同名
          </button>
          <button
            onClick={() => setNamingMode(1)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              namingMode === 1
                ? "bg-indigo-600 text-white"
                : "bg-[var(--bg-muted)] text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            序号递增
          </button>
        </div>

        <label className="block text-sm text-[var(--text-tertiary)] mb-2">时间安排</label>
        <div className="flex items-center gap-3 mb-2">
          <DateInput
            value={startDate}
            onChange={setStartDate}
            clearable={false}
            className="flex-1"
            buttonClassName="bg-[var(--bg-muted)] border-transparent"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer flex-shrink-0">
            <span>每日一条</span>
            <div
              onClick={() => setIsDaily(!isDaily)}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                isDaily ? "bg-indigo-600" : "bg-[var(--bg-subtle)]"
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                  isDaily ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
          </label>
        </div>
        {isDaily ? (
          <p className="text-xs text-[var(--text-muted)] mb-4">预计结束于：{endDate}</p>
        ) : (
          <p className="text-xs text-yellow-600 mb-4">关闭「每日一条」后，所有任务将为待分配状态（无日期）</p>
        )}

        <div className="bg-[var(--bg-card)] rounded-xl px-3 py-2 mb-5">
          <p className="text-xs text-[var(--text-muted)] mb-1.5">预览（共 {count} 条）</p>
          {previewTitles.map((title, i) => (
            <p key={i} className="text-xs text-[var(--text-secondary)] truncate">
              • {title}
            </p>
          ))}
          {count > 5 && <p className="text-xs text-[var(--text-faint)]">…还有 {count - 5} 条</p>}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={saving || !baseName.trim() || count <= 0}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "生成中…" : `生成 ${count} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { projectMap, load: loadProjects, update: updateProject, archive, restore, remove: removeProject } = useProjectStore();
  const { deleteByProject } = useEventStore();
  const { milestonesByProject, load: loadMilestones, add, update, remove } = useMilestoneStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DetailDialog>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("flat");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMilestoneId, setTaskMilestoneId] = useState<string>("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [taskScheduleFilter, setTaskScheduleFilter] = useState<TaskScheduleFilter>("all");
  const [taskMilestoneFilter, setTaskMilestoneFilter] = useState("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastSelectedTaskIndex = useRef<number | null>(null);
  const [batchMilestoneId, setBatchMilestoneId] = useState("");
  const [batchAssigning, setBatchAssigning] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDifficulty, setSettingsDifficulty] = useState<Difficulty>("low");
  const [savingSettings, setSavingSettings] = useState(false);

  const project = projectMap[projectId];
  const milestones = milestonesByProject[projectId] ?? [];
  const today = toDateStr(new Date());

  async function loadEvents() {
    const rows = await invoke<CalendarEvent[]>("get_events_by_project", { projectId });
    setEvents(rows);
  }

  useEffect(() => {
    Promise.all([loadProjects(), loadMilestones(projectId), loadEvents()])
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    setSelectedTaskIds((prev) => {
      const validIds = new Set(events.map((event) => event.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [events]);

  useEffect(() => {
    if (!project) return;
    setSettingsName(project.name);
    setSettingsDifficulty(project.difficulty);
  }, [project]);

  const stats = useMemo(() => {
    const total = events.length;
    const done = events.filter((e) => e.is_completed).length;
    const unassigned = events.filter((e) => !e.milestone_id).length;
    const scheduled = events.filter((e) => e.date).length;
    const unscheduled = events.filter((e) => !e.date).length;
    const overdue = events.filter((e) => !e.is_completed && e.due_date && e.due_date < today).length;
    const dueToday = events.filter((e) => !e.is_completed && e.due_date === today).length;
    const open = total - done;
    return { total, done, open, unassigned, scheduled, unscheduled, overdue, dueToday };
  }, [events, today]);

  const milestoneMap = useMemo(
    () => Object.fromEntries(milestones.map((m) => [m.id, m])),
    [milestones]
  );
  const milestoneFilterOptions = useMemo(
    () => [
      { value: "all", label: "全部阶段" },
      { value: "none", label: "未分阶段" },
      ...milestones.map((milestone) => ({
        value: milestone.id,
        label: milestone.name,
      })),
    ],
    [milestones]
  );
  const milestoneAssignOptions = useMemo(
    () => [
      { value: "", label: "未分阶段" },
      ...milestones.map((milestone) => ({
        value: milestone.id,
        label: milestone.name,
      })),
    ],
    [milestones]
  );

  const filteredEvents = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    return events.filter((event) => {
      if (q && !event.title.toLowerCase().includes(q)) return false;
      if (taskStatusFilter === "open" && event.is_completed) return false;
      if (taskStatusFilter === "completed" && !event.is_completed) return false;
      if (taskScheduleFilter === "scheduled" && !event.date) return false;
      if (taskScheduleFilter === "unscheduled" && event.date) return false;
      if (taskMilestoneFilter === "none" && event.milestone_id) return false;
      if (
        taskMilestoneFilter !== "all" &&
        taskMilestoneFilter !== "none" &&
        event.milestone_id !== taskMilestoneFilter
      ) {
        return false;
      }
      return true;
    });
  }, [events, taskQuery, taskStatusFilter, taskScheduleFilter, taskMilestoneFilter]);

  const hasTaskFilters =
    taskQuery.trim() !== "" ||
    taskStatusFilter !== "all" ||
    taskScheduleFilter !== "all" ||
    taskMilestoneFilter !== "all";
  const visibleTaskIds = useMemo(
    () => filteredEvents.map((event) => event.id),
    [filteredEvents]
  );
  const filteredTaskIndexMap = useMemo(
    () => Object.fromEntries(filteredEvents.map((event, index) => [event.id, index])),
    [filteredEvents]
  );
  const allVisibleTasksSelected =
    visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id));
  const selectedEvents = useMemo(
    () => events.filter((event) => selectedTaskIds.has(event.id)),
    [events, selectedTaskIds]
  );
  const allSelectedCompleted =
    selectedEvents.length > 0 && selectedEvents.every((event) => event.is_completed);
  const allSelectedOpen =
    selectedEvents.length > 0 && selectedEvents.every((event) => !event.is_completed);
  const selectedCompletedCount = selectedEvents.filter((event) => event.is_completed).length;
  const selectedOpenCount = selectedEvents.length - selectedCompletedCount;
  const milestoneStats = useMemo(() => {
    const total = milestones.length;
    const completed = milestones.filter((m) => m.status === "completed" || (m.total > 0 && m.done >= m.total)).length;
    const active = milestones.filter((m) => m.status === "active").length;
    const notStarted = milestones.filter((m) => m.status === "not_started").length;
    return { total, completed, active, notStarted };
  }, [milestones]);
  const currentMilestone = useMemo(
    () =>
      milestones.find((m) => m.status === "active" && !(m.total > 0 && m.done >= m.total)) ??
      milestones.find((m) => m.status !== "completed" && !(m.total > 0 && m.done >= m.total)) ??
      null,
    [milestones]
  );
  const openEvents = useMemo(
    () => events.filter((event) => !event.is_completed),
    [events]
  );
  const overdueTasks = useMemo(
    () =>
      openEvents
        .filter((event) => !!event.due_date && event.due_date < today)
        .slice()
        .sort(compareOpenTasks),
    [openEvents, today]
  );
  const dueTodayTasks = useMemo(
    () =>
      openEvents
        .filter((event) => event.due_date === today)
        .slice()
        .sort(compareOpenTasks),
    [openEvents, today]
  );
  const currentMilestoneTasks = useMemo(
    () =>
      currentMilestone
        ? openEvents
            .filter((event) => event.milestone_id === currentMilestone.id)
            .slice()
            .sort(compareOpenTasks)
        : [],
    [currentMilestone, openEvents]
  );
  const unassignedTasks = useMemo(
    () =>
      openEvents
        .filter((event) => !event.milestone_id)
        .slice()
        .sort(compareOpenTasks),
    [openEvents]
  );
  const sortedOpenTasks = useMemo(
    () => openEvents.slice().sort(compareOpenTasks),
    [openEvents]
  );
  const nextRecommendedTask = useMemo(
    () =>
      overdueTasks[0] ??
      dueTodayTasks[0] ??
      currentMilestoneTasks[0] ??
      sortedOpenTasks[0] ??
      null,
    [currentMilestoneTasks, dueTodayTasks, overdueTasks, sortedOpenTasks]
  );
  const groupedEvents = useMemo(() => {
    const groups: TaskGroup[] = milestones.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      milestone,
      events: filteredEvents.filter((event) => event.milestone_id === milestone.id),
    }));
    const unassigned = filteredEvents.filter((event) => !event.milestone_id);
    if (unassigned.length > 0) {
      groups.push({
        id: "unassigned",
        name: "未分阶段",
        milestone: null,
        events: unassigned,
      });
    }
    return groups.filter((group) => group.events.length > 0);
  }, [filteredEvents, milestones]);

  async function handleSaveMilestone(name: string, status: MilestoneStatus, targetDate: string | null) {
    if (dialog === "add") {
      const milestone = await add(projectId, name, targetDate);
      if (status !== "not_started") {
        await update(milestone.id, projectId, name, status, targetDate);
      }
    } else if (dialog && dialog !== "batchAdd") {
      await update(dialog.id, projectId, name, status, targetDate);
    }
    await loadMilestones(projectId);
  }

  async function handleDeleteMilestone(milestone: MilestoneWithStats) {
    const ok = window.confirm(`删除「${milestone.name}」吗？相关任务会变为未分阶段。`);
    if (!ok) return;
    await remove(milestone.id, projectId);
    await loadMilestones(projectId);
    await loadEvents();
  }

  async function assignMilestone(eventId: string, milestoneId: string) {
    setBusyEventId(eventId);
    try {
      await invoke("assign_event_milestone", {
        id: eventId,
        milestoneId: milestoneId || null,
      });
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId ? { ...event, milestone_id: milestoneId || null } : event
        )
      );
      await loadMilestones(projectId);
    } finally {
      setBusyEventId(null);
    }
  }

  function handleTaskSelection(eventId: string, e: React.MouseEvent<HTMLInputElement>) {
    const idx = filteredTaskIndexMap[eventId];
    if (idx === undefined) return;

    if (e.shiftKey && lastSelectedTaskIndex.current !== null) {
      const start = Math.min(lastSelectedTaskIndex.current, idx);
      const end = Math.max(lastSelectedTaskIndex.current, idx);
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredEvents[i].id);
        }
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        next.has(eventId) ? next.delete(eventId) : next.add(eventId);
        return next;
      });
    } else {
      setSelectedTaskIds((prev) => {
        if (prev.has(eventId) && prev.size === 1) return new Set();
        return new Set([eventId]);
      });
    }

    lastSelectedTaskIndex.current = idx;
  }

  function toggleVisibleTaskSelection() {
    if (visibleTaskIds.length === 0) return;
    setSelectedTaskIds((prev) => {
      if (visibleTaskIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        for (const id of visibleTaskIds) next.delete(id);
        lastSelectedTaskIndex.current = null;
        return next;
      }
      lastSelectedTaskIndex.current = 0;
      return new Set([...prev, ...visibleTaskIds]);
    });
  }

  async function handleBatchAssignMilestone() {
    if (selectedTaskIds.size === 0) return;
    const ids = [...selectedTaskIds];
    const idSet = new Set(ids);
    const assignedMilestoneId = batchMilestoneId || null;
    setBatchAssigning(true);
    try {
      await invoke("batch_assign_event_milestone", {
        ids,
        milestoneId: assignedMilestoneId,
      });
      setEvents((prev) =>
        prev.map((event) =>
          idSet.has(event.id) ? { ...event, milestone_id: assignedMilestoneId } : event
        )
      );
      setSelectedTaskIds(new Set());
      lastSelectedTaskIndex.current = null;
      await loadMilestones(projectId);
    } finally {
      setBatchAssigning(false);
    }
  }

  async function handleBatchSetCompletion(isCompleted: boolean) {
    if (selectedTaskIds.size === 0) return;
    const ids = [...selectedTaskIds];
    const idSet = new Set(ids);
    const completedAt = isCompleted ? new Date().toISOString() : null;
    setBatchAssigning(true);
    try {
      await invoke(isCompleted ? "batch_complete_events" : "batch_uncomplete_events", { ids });
      setEvents((prev) =>
        prev.map((event) =>
          idSet.has(event.id) ? { ...event, is_completed: isCompleted, completed_at: completedAt } : event
        )
      );
      setSelectedTaskIds(new Set());
      lastSelectedTaskIndex.current = null;
      await loadMilestones(projectId);
    } finally {
      setBatchAssigning(false);
    }
  }

  async function addTask() {
    if (!taskTitle.trim() || !project) return;
    const event = await invoke<CalendarEvent>("add_event", {
      title: taskTitle.trim(),
      projectId: project.id,
      date: null,
      dueDate: taskDueDate || null,
    });
    if (taskMilestoneId) {
      await invoke("assign_event_milestone", {
        id: event.id,
        milestoneId: taskMilestoneId,
      });
    }
    setTaskTitle("");
    setTaskDueDate("");
    await Promise.all([loadEvents(), loadMilestones(projectId)]);
  }

  async function handleBatchAdd(eventsToAdd: CalendarEvent[]) {
    await invoke("add_events_batch", { events: eventsToAdd });
    await Promise.all([loadEvents(), loadMilestones(projectId)]);
  }

  async function handleSaveSettings() {
    if (!project || !settingsName.trim()) return;
    setSavingSettings(true);
    try {
      await updateProject(project.id, settingsName.trim(), project.color_value, settingsDifficulty);
      await loadProjects();
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleArchive() {
    if (!project) return;
    if (project.is_archived) {
      await restore(project.id);
    } else {
      await archive(project.id);
    }
    await loadProjects();
  }

  async function handleDeleteProject() {
    if (!project) return;
    const ok = window.confirm(`删除「${project.name}」吗？该项目下的所有任务也会被一并删除。`);
    if (!ok) return;
    await Promise.all([deleteByProject(project.id), removeProject(project.id)]);
    navigate("/projects");
  }

  function showTaskList(options: {
    status?: TaskStatusFilter;
    schedule?: TaskScheduleFilter;
    milestone?: string;
    selectedIds?: string[];
    viewMode?: TaskViewMode;
  } = {}) {
    setActiveTab("tasks");
    setTaskQuery("");
    setTaskStatusFilter(options.status ?? "all");
    setTaskScheduleFilter(options.schedule ?? "all");
    setTaskMilestoneFilter(options.milestone ?? "all");
    setTaskViewMode(options.viewMode ?? "flat");
    setSelectedTaskIds(new Set(options.selectedIds ?? []));
    lastSelectedTaskIndex.current = null;
  }

  function focusTask(event: CalendarEvent) {
    showTaskList({
      status: event.is_completed ? "all" : "open",
      milestone: event.milestone_id ?? "none",
      selectedIds: [event.id],
    });
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-[var(--text-faint)]">加载中…</div>;
  }

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-[var(--text-tertiary)]">项目不存在</p>
        <button onClick={() => navigate("/projects")} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm">
          返回项目
        </button>
      </div>
    );
  }

  const color = colorToHex(project.color_value);
  const completion = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);
  const canCompleteProject = stats.total > 0 && stats.done >= stats.total;
  const currentMilestoneCompletion = currentMilestone?.total
    ? Math.round((currentMilestone.done / currentMilestone.total) * 100)
    : 0;
  const archiveReadiness = project.is_archived
    ? {
        label: "已归档",
        detail: "项目已进入历史记录，需要继续编辑时可以先恢复。",
        tone: "text-[var(--text-tertiary)]",
      }
    : canCompleteProject
    ? {
        label: "可以归档",
        detail: "所有任务都已完成，可以把项目移出活跃视图。",
        tone: "text-green-400",
      }
    : stats.total === 0
    ? {
        label: "还没有任务",
        detail: "先补充任务或阶段，再判断项目是否完成。",
        tone: "text-yellow-500",
      }
    : {
        label: "暂不建议归档",
        detail: `还有 ${stats.open} 个未完成任务，完成后再归档更清晰。`,
        tone: "text-yellow-500",
      };

  function getTaskTimingLabel(event: CalendarEvent) {
    if (event.due_date && event.due_date < today) return `逾期 ${event.due_date}`;
    if (event.due_date === today) return "今日到期";
    if (event.due_date) return `截止 ${event.due_date}`;
    if (event.date) return `排期 ${event.date}`;
    return "未排期";
  }

  function getRecommendationReason(event: CalendarEvent) {
    if (overdueTasks.some((task) => task.id === event.id)) return "逾期任务，建议先收尾";
    if (dueTodayTasks.some((task) => task.id === event.id)) return "今日到期，适合马上处理";
    if (currentMilestoneTasks.some((task) => task.id === event.id)) return "属于当前阶段，能推进主线进度";
    return "按日期和标题排序后的下一个未完成任务";
  }

  const renderCockpitTaskRow = (event: CalendarEvent) => {
    const milestone = event.milestone_id ? milestoneMap[event.milestone_id] : null;
    const isOverdue = !!event.due_date && event.due_date < today;
    const isDueToday = event.due_date === today;
    const timingClass = isOverdue
      ? "text-red-400"
      : isDueToday
      ? "text-yellow-500"
      : "text-[var(--text-tertiary)]";

    return (
      <button
        key={event.id}
        type="button"
        onClick={() => focusTask(event)}
        className="w-full text-left border-b border-[var(--border-default)] px-2 py-2 hover:bg-[var(--bg-muted)] transition-colors last:border-b-0"
      >
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{event.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-indigo-300 truncate max-w-36">{milestone?.name ?? "未分阶段"}</span>
          <span className={timingClass}>{getTaskTimingLabel(event)}</span>
          {!event.date && <span className="text-yellow-500">待排期</span>}
        </div>
      </button>
    );
  };

  const renderTaskRow = (event: CalendarEvent) => {
    const milestone = event.milestone_id ? milestoneMap[event.milestone_id] : null;
    const isSelected = selectedTaskIds.has(event.id);
    const isOverdue = !event.is_completed && !!event.due_date && event.due_date < today;
    const isDueToday = !event.is_completed && event.due_date === today;
    const milestoneLabelClass = milestone
      ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
      : "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-faint)]";
    const scheduleLabelClass = event.date
      ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
      : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500";
    const dueLabelClass = isOverdue
      ? "border-red-500/25 bg-red-500/10 text-red-400"
      : isDueToday
      ? "border-yellow-500/25 bg-yellow-500/10 text-yellow-500"
      : event.due_date
      ? "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]"
      : "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-faint)]";
    return (
      <div
        key={event.id}
        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
          isSelected ? "bg-indigo-500/10" : ""
        }`}
      >
        {!project.is_archived && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => undefined}
            onClick={(e) => handleTaskSelection(event.id, e)}
            className="w-4 h-4 mt-1 accent-indigo-500 flex-shrink-0 cursor-pointer"
            title="选择任务（Shift 范围选择，Ctrl 保留多选）"
          />
        )}
        {event.is_completed ? (
          <CheckCircle2 size={16} className="mt-1 text-green-500 flex-shrink-0" />
        ) : (
          <Circle size={16} className="mt-1 text-[var(--text-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${event.is_completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
            {event.title}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-block max-w-44 rounded-md border px-2 py-0.5 text-[10px] leading-4 truncate align-middle ${milestoneLabelClass}`}>
              {milestone?.name ?? "未分阶段"}
            </span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-4 ${scheduleLabelClass}`}>
              {event.date ? `排期 ${event.date}` : "待分配"}
            </span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-4 ${dueLabelClass}`}>
              {isOverdue ? "已逾期" : isDueToday ? "今日到期" : event.due_date ? `截止 ${event.due_date}` : "无截止"}
            </span>
          </div>
        </div>
        <AppSelect
          value={event.milestone_id ?? ""}
          disabled={project.is_archived || busyEventId === event.id}
          onChange={(value) => assignMilestone(event.id, value)}
          options={milestoneAssignOptions}
          className="w-40 flex-shrink-0 mt-0.5"
          buttonClassName="bg-[var(--bg-elevated)] py-1.5 text-xs"
        />
      </div>
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-full">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate("/projects")}
          className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: color }}>
          {project.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] truncate">{project.name}</h1>
            {project.is_archived && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--bg-muted)] text-[var(--text-tertiary)]">
                <Archive size={12} /> 已归档
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {stats.done}/{stats.total} 完成 · {completion}% · {stats.unassigned} 条未分阶段
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {([
          ["overview", "概览", ClipboardList],
          ["tasks", "任务", LayoutList],
          ["statistics", "统计", BarChart3],
          ["settings", "设置", Settings],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeTab === key
                ? "bg-indigo-600 text-white"
                : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="border-y border-[var(--border-default)] bg-[var(--bg-card)]/30 divide-y divide-[var(--border-default)]">
          <div className="grid grid-cols-4 divide-x divide-[var(--border-default)]">
            {[
              ["总体进度", `${completion}%`, `${stats.done}/${stats.total} 完成`],
              ["当前阶段", currentMilestone?.name ?? "无", currentMilestone ? `${currentMilestoneTasks.length} 个未完成` : "暂无进行中阶段"],
              ["逾期任务", String(overdueTasks.length), overdueTasks.length > 0 ? "需要优先处理" : "没有逾期"],
              ["未分阶段", String(unassignedTasks.length), unassignedTasks.length > 0 ? "需要补充阶段" : "阶段归属清晰"],
            ].map(([label, value, hint]) => (
              <div key={label} className="px-4 py-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className="text-xl font-bold text-[var(--text-primary)] truncate">{value}</p>
                <p className="text-xs text-[var(--text-faint)] mt-1">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1.15fr_0.85fr] divide-x divide-[var(--border-default)]">
            <section className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks size={16} className="text-indigo-300" />
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">下一步推荐</h2>
              </div>
              {nextRecommendedTask ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-primary)] truncate">{nextRecommendedTask.title}</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{getRecommendationReason(nextRecommendedTask)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-indigo-300">
                      {nextRecommendedTask.milestone_id ? milestoneMap[nextRecommendedTask.milestone_id]?.name ?? "未知阶段" : "未分阶段"}
                    </span>
                    <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-tertiary)]">
                      {getTaskTimingLabel(nextRecommendedTask)}
                    </span>
                    <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text-tertiary)]">
                      {nextRecommendedTask.date ? `排期 ${nextRecommendedTask.date}` : "待排期"}
                    </span>
                  </div>
                  <button
                    onClick={() => focusTask(nextRecommendedTask)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
                  >
                    <Search size={15} />
                    查看任务
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {canCompleteProject ? "所有任务已完成" : "还没有可推荐的任务"}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {canCompleteProject ? "可以进入归档流程。" : "先在任务页添加任务，驾驶舱会自动给出下一步。"}
                  </p>
                  {!project.is_archived && (
                    <button
                      onClick={() => setActiveTab("tasks")}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-muted)] transition-colors"
                    >
                      <Plus size={15} />
                      添加任务
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Archive size={16} className="text-[var(--text-tertiary)]" />
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">归档准备度</h2>
              </div>
              <p className={`text-xl font-bold ${archiveReadiness.tone}`}>{archiveReadiness.label}</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">{archiveReadiness.detail}</p>
              <div className="mt-4 grid grid-cols-2 divide-x divide-[var(--border-default)] border-y border-[var(--border-default)] text-center">
                <div className="py-2">
                  <p className="text-lg font-bold text-[var(--text-primary)]">{stats.open}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">未完成</p>
                </div>
                <div className="py-2">
                  <p className="text-lg font-bold text-[var(--text-primary)]">{stats.unassigned}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">未分阶段</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (project.is_archived || canCompleteProject) {
                    handleToggleArchive();
                  } else {
                    showTaskList({ status: "open" });
                  }
                }}
                className={`mt-4 inline-flex items-center gap-2 w-full justify-center px-4 py-2 rounded-lg text-sm transition-colors ${
                  canCompleteProject && !project.is_archived
                    ? "bg-green-600/15 text-green-300 hover:bg-green-600/25"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                }`}
              >
                {project.is_archived ? <RotateCcw size={15} /> : canCompleteProject ? <Archive size={15} /> : <Search size={15} />}
                {project.is_archived ? "恢复项目" : canCompleteProject ? "完成并归档" : "查看未完成任务"}
              </button>
            </section>
          </div>

          <div className="grid grid-cols-[1fr_1fr] divide-x divide-[var(--border-default)]">
            <section className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Flag size={16} className="text-indigo-300" />
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">当前阶段</h2>
              </div>
              {currentMilestone ? (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="font-medium text-[var(--text-primary)] truncate">{currentMilestone.name}</p>
                    <span className="text-xs text-[var(--text-muted)]">
                      {currentMilestone.done}/{currentMilestone.total} · {currentMilestoneCompletion}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-muted)] overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${currentMilestoneCompletion}%` }} />
                  </div>
                  <p className="text-xs text-[var(--text-faint)] mt-2">
                    {STATUS_LABEL[currentMilestone.status]} · {currentMilestoneTasks.length} 个未完成
                    {currentMilestone.target_date ? ` · 目标 ${currentMilestone.target_date}` : ""}
                  </p>
                  <button
                    onClick={() => showTaskList({ status: "open", milestone: currentMilestone.id, viewMode: "grouped" })}
                    className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-muted)] transition-colors"
                  >
                    <LayoutList size={15} />
                    查看阶段任务
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-faint)]">
                    {milestoneStats.total > 0 ? "所有阶段都已完成或暂无进行中阶段。" : "还没有阶段。"}
                  </p>
                  {!project.is_archived && (
                    <button
                      onClick={() => setDialog("add")}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-muted)] transition-colors"
                    >
                      <PlusCircle size={15} />
                      新增阶段
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className={overdueTasks.length > 0 ? "text-red-400" : "text-[var(--text-tertiary)]"} />
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">待处理队列</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-[var(--text-tertiary)]">逾期任务</p>
                    <span className="text-xs text-red-400">{overdueTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {overdueTasks.slice(0, 3).map(renderCockpitTaskRow)}
                    {overdueTasks.length === 0 && (
                      <p className="border-y border-[var(--border-default)] px-2 py-3 text-sm text-[var(--text-faint)]">
                        暂无逾期任务
                      </p>
                    )}
                  </div>
                  {overdueTasks.length > 3 && (
                    <button
                      onClick={() => showTaskList({ status: "open", selectedIds: overdueTasks.map((event) => event.id) })}
                      className="mt-2 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      查看全部 {overdueTasks.length} 个
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-[var(--text-tertiary)]">未分阶段任务</p>
                    <span className="text-xs text-yellow-500">{unassignedTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {unassignedTasks.slice(0, 3).map(renderCockpitTaskRow)}
                    {unassignedTasks.length === 0 && (
                      <p className="border-y border-[var(--border-default)] px-2 py-3 text-sm text-[var(--text-faint)]">
                        没有未分阶段任务
                      </p>
                    )}
                  </div>
                  {unassignedTasks.length > 3 && (
                    <button
                      onClick={() => showTaskList({ status: "open", milestone: "none" })}
                      className="mt-2 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      查看全部 {unassignedTasks.length} 个
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "statistics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              ["已排期", stats.scheduled],
              ["待分配", stats.unscheduled],
              ["今日到期", stats.dueToday],
              ["未分阶段", stats.unassigned],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4">
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>
          <section className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">阶段进度</h2>
            <div className="flex flex-col gap-3">
              {milestones.map((milestone) => {
                const pct = milestone.total === 0 ? 0 : Math.round((milestone.done / milestone.total) * 100);
                return (
                  <div key={milestone.id}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm text-[var(--text-primary)] truncate">{milestone.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{milestone.done}/{milestone.total} · {pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-muted)] overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {milestones.length === 0 && (
                <p className="text-sm text-[var(--text-faint)]">暂无阶段数据</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="grid grid-cols-[1fr_320px] gap-4">
          <section className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">项目设置</h2>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">项目名称</label>
            <input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500 mb-4"
            />
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">难度</label>
            <AppSelect
              value={settingsDifficulty}
              onChange={(value) => setSettingsDifficulty(value as Difficulty)}
              options={DIFFICULTY_OPTIONS}
              className="mb-5"
              buttonClassName="bg-[var(--bg-elevated)]"
            />
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings || !settingsName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              保存设置
            </button>
          </section>
          <div className="flex flex-col gap-4">
            <section className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">项目生命周期</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                当前状态：{project.is_archived ? "已归档" : canCompleteProject ? "已完成，可归档" : "进行中"} · 难度 {DIFFICULTY_LABEL[project.difficulty]}
              </p>
              <button
                onClick={handleToggleArchive}
                className="inline-flex items-center gap-2 w-full justify-center px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-muted)] transition-colors"
              >
                {project.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                {project.is_archived ? "恢复项目" : canCompleteProject ? "完成并归档项目" : "归档项目"}
              </button>
            </section>
            <section className="bg-[var(--bg-card)] border border-red-500/20 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-red-400 mb-2">危险操作</h2>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                删除项目会同时删除项目下的所有任务，且无法在应用内撤销。
              </p>
              <button
                onClick={handleDeleteProject}
                className="inline-flex items-center gap-2 w-full justify-center px-4 py-2 rounded-lg bg-red-600/10 text-red-400 text-sm hover:bg-red-600/20 transition-colors"
              >
                <Trash2 size={15} />
                删除项目
              </button>
            </section>
          </div>
        </div>
      )}

      {activeTab === "tasks" && (
      <div className="grid grid-cols-[300px_1fr] gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">阶段</h2>
            {!project.is_archived && (
              <button
                onClick={() => setDialog("add")}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-indigo-400 hover:bg-[var(--bg-elevated)] transition-colors"
                title="新增阶段"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {milestones.map((milestone) => {
              const pct = milestone.total === 0 ? 0 : Math.round((milestone.done / milestone.total) * 100);
              return (
                <div key={milestone.id} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{milestone.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {STATUS_LABEL[milestone.status]} · {milestone.done}/{milestone.total} · {pct}%
                      </p>
                      {milestone.target_date && (
                        <p className="text-xs text-[var(--text-faint)] mt-0.5">目标 {milestone.target_date}</p>
                      )}
                    </div>
                    {!project.is_archived && (
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => setDialog(milestone)}
                          className="p-1.5 text-[var(--text-muted)] hover:text-blue-400 rounded-lg hover:bg-[var(--bg-elevated)]"
                          title="编辑阶段">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteMilestone(milestone)}
                          className="p-1.5 text-[var(--text-muted)] hover:text-red-400 rounded-lg hover:bg-[var(--bg-elevated)]"
                          title="删除阶段">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {milestones.length === 0 && (
              <div className="text-sm text-[var(--text-faint)] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4">
                还没有阶段
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
              任务 {filteredEvents.length}/{events.length}
            </h2>
            <div className="flex items-center gap-2">
              {!project.is_archived && (
                <button
                  onClick={() => setDialog("batchAdd")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <PlusCircle size={14} />
                  批量添加
                </button>
              )}
              <div className="flex bg-[var(--bg-card)] rounded-lg p-0.5">
                {([
                  ["flat", "平铺"],
                  ["grouped", "按阶段"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTaskViewMode(key)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      taskViewMode === key
                        ? "bg-indigo-600 text-white"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={taskQuery}
                onChange={(e) => setTaskQuery(e.target.value)}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500"
                placeholder="搜索任务"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all", "全部状态"],
                ["open", "未完成"],
                ["completed", "已完成"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTaskStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    taskStatusFilter === key
                      ? "bg-indigo-600 text-white"
                      : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {label}
                </button>
              ))}
              {([
                ["all", "全部日期"],
                ["scheduled", "已排期"],
                ["unscheduled", "待分配"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTaskScheduleFilter(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                    taskScheduleFilter === key
                      ? "bg-indigo-600 text-white"
                      : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {label}
                </button>
              ))}
              <AppSelect
                value={taskMilestoneFilter}
                onChange={setTaskMilestoneFilter}
                options={milestoneFilterOptions}
                className="w-44"
                buttonClassName="py-1 px-2.5 text-xs"
                title="阶段筛选"
              />
            </div>
          </div>

          {!project.is_archived && (
            <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 mb-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 shadow-lg shadow-black/5">
              <button
                onClick={toggleVisibleTaskSelection}
                disabled={visibleTaskIds.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] disabled:opacity-40 transition-colors"
              >
                <ListChecks size={14} />
                {allVisibleTasksSelected ? "取消当前选择" : "选择当前"}
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                已选 {selectedEvents.length} 项 · {selectedOpenCount} 未完成 · {selectedCompletedCount} 已完成
              </span>
              {selectedTaskIds.size > 0 && (
                <>
                  <AppSelect
                    value={batchMilestoneId}
                    onChange={setBatchMilestoneId}
                    options={milestoneAssignOptions}
                    className="w-44"
                    buttonClassName="bg-[var(--bg-elevated)] py-1.5 text-xs"
                  />
                  <button
                    onClick={handleBatchAssignMilestone}
                    disabled={batchAssigning}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    分配阶段
                  </button>
                  {allSelectedCompleted ? (
                    <button
                      onClick={() => handleBatchSetCompletion(false)}
                      disabled={batchAssigning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-600/80 text-white text-xs hover:bg-yellow-500 disabled:opacity-50 transition-colors"
                    >
                      <Circle size={13} />
                      取消完成
                    </button>
                  ) : allSelectedOpen ? (
                    <button
                      onClick={() => handleBatchSetCompletion(true)}
                      disabled={batchAssigning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/80 text-white text-xs hover:bg-green-500 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 size={13} />
                      标记完成
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleBatchSetCompletion(false)}
                        disabled={batchAssigning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-600/80 text-white text-xs hover:bg-yellow-500 disabled:opacity-50 transition-colors"
                      >
                        <Circle size={13} />
                        取消完成
                      </button>
                      <button
                        onClick={() => handleBatchSetCompletion(true)}
                        disabled={batchAssigning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/80 text-white text-xs hover:bg-green-500 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={13} />
                        标记完成
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setSelectedTaskIds(new Set());
                      lastSelectedTaskIndex.current = null;
                    }}
                    disabled={batchAssigning}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-muted)] disabled:opacity-50 transition-colors"
                  >
                    清除
                  </button>
                </>
              )}
            </div>
          )}

          {!project.is_archived && (
            <div className="flex gap-2 mb-3">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                className="flex-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500"
                placeholder="添加一个待分配任务"
              />
              <AppSelect
                value={taskMilestoneId}
                onChange={setTaskMilestoneId}
                options={milestoneAssignOptions}
                className="w-40"
              />
              <DateInput
                value={taskDueDate}
                onChange={setTaskDueDate}
                placeholder="无截止"
                className="w-36"
                title="截止日期"
              />
              <button
                onClick={addTask}
                disabled={!taskTitle.trim()}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50 hover:bg-indigo-500 transition-colors"
              >
                添加
              </button>
            </div>
          )}

          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl divide-y divide-[var(--border-default)] overflow-hidden">
            {taskViewMode === "grouped" ? (
              groupedEvents.map((group) => {
                const groupDone = group.events.filter((event) => event.is_completed).length;
                return (
                  <div key={group.id}>
                    <div className="flex items-center justify-between gap-3 bg-[var(--bg-elevated)] px-4 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">{group.name}</p>
                        {group.milestone?.target_date && (
                          <p className="text-[10px] text-[var(--text-faint)]">目标 {group.milestone.target_date}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--text-faint)] flex-shrink-0">
                        {groupDone}/{group.events.length}
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--border-default)]">
                      {group.events.map(renderTaskRow)}
                    </div>
                  </div>
                );
              })
            ) : (
              filteredEvents.map(renderTaskRow)
            )}
            {filteredEvents.length === 0 && (
              <div className="text-sm text-[var(--text-faint)] text-center py-12">
                {hasTaskFilters ? "暂无匹配任务" : "暂无任务"}
              </div>
            )}
          </div>
        </section>
      </div>
      )}

      {dialog === "batchAdd" && (
        <BatchAddDialog
          project={project}
          milestones={milestones}
          onSave={handleBatchAdd}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog !== "batchAdd" && (
        <MilestoneDialog
          milestone={dialog === "add" ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSave={handleSaveMilestone}
        />
      )}
    </div>
  );
}
