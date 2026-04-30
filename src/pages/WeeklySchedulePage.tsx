import { useEffect, useMemo, useState } from "react";
import { Eraser, Wand2, CalendarCheck, FolderOpen, AlertCircle, RotateCcw, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore, type Project } from "../store/useProjectStore";
import { useWeeklyStore, type WeeklySchedule } from "../store/useWeeklyStore";
import { useEventStore } from "../store/useEventStore";

// ── 常量 ───────────────────────────────────────────────────

const WEEK_DAYS = [
  { key: "1", label: "周一" },
  { key: "2", label: "周二" },
  { key: "3", label: "周三" },
  { key: "4", label: "周四" },
  { key: "5", label: "周五" },
  { key: "6", label: "周六" },
  { key: "7", label: "周日" },
];

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function deepCopy(s: WeeklySchedule): WeeklySchedule {
  const copy: WeeklySchedule = {};
  for (const [k, v] of Object.entries(s)) copy[k] = [...v];
  // 确保 1~7 都存在
  for (let i = 1; i <= 7; i++) {
    if (!copy[i.toString()]) copy[i.toString()] = [];
  }
  return copy;
}

/** 判断两个 schedule 是否相同 */
function scheduleEquals(a: WeeklySchedule, b: WeeklySchedule): boolean {
  for (let i = 1; i <= 7; i++) {
    const k = i.toString();
    const listA = a[k] ?? [];
    const listB = b[k] ?? [];
    if (listA.length !== listB.length) return false;
    for (let j = 0; j < listA.length; j++) {
      if (listA[j] !== listB[j]) return false;
    }
  }
  return true;
}

function filterScheduleByProjects(s: WeeklySchedule, allowedIds: Set<string>): WeeklySchedule {
  const next: WeeklySchedule = {};
  for (let i = 1; i <= 7; i++) {
    const key = i.toString();
    next[key] = (s[key] ?? []).filter((id) => allowedIds.has(id));
  }
  return next;
}

interface RescheduleChange {
  id: string;
  title: string;
  project_id: string;
  old_date: string | null;
  new_date: string | null;
}

function dateText(date: string | null) {
  return date ?? "待分配";
}

function ReschedulePreviewDialog({
  changes,
  projects,
  saving,
  onConfirm,
  onCancel,
}: {
  changes: RescheduleChange[];
  projects: Project[];
  saving: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );
  const assigned = changes.filter((change) => !change.old_date && change.new_date).length;
  const moved = changes.filter((change) => change.old_date && change.new_date).length;
  const cleared = changes.filter((change) => !change.new_date).length;
  const visibleChanges = changes.slice(0, 80);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[82vh] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">重排预览</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {assigned} 条新安排 · {moved} 条移动 · {cleared} 条转为待分配
            </p>
          </div>
          <button onClick={onCancel} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="flex flex-col gap-1.5">
            {visibleChanges.map((change) => {
              const project = projectMap[change.project_id];
              const color = project ? colorToHex(project.color_value) : "#6366f1";
              return (
                <div key={change.id} className="grid grid-cols-[1fr_auto] gap-3 items-center rounded-lg px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-default)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm text-[var(--text-primary)] truncate">{change.title}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-faint)] mt-0.5 truncate">
                      {project?.name ?? "未知项目"}
                    </p>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    <span className="text-[var(--text-faint)]">{dateText(change.old_date)}</span>
                    <span className="mx-2 text-[var(--text-faint)]">→</span>
                    <span className={change.new_date ? "text-indigo-300" : "text-yellow-400"}>
                      {dateText(change.new_date)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {changes.length > visibleChanges.length && (
            <p className="text-xs text-[var(--text-faint)] text-center py-3">
              还有 {changes.length - visibleChanges.length} 项变更未显示
            </p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-[var(--border-default)]">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "应用中…" : "确认重排"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 单日卡片 ───────────────────────────────────────────────

function DayCard({
  dayKey,
  dayLabel,
  selectedIds,
  projects,
  pendingCounts,
  onToggle,
}: {
  dayKey: string;
  dayLabel: string;
  selectedIds: string[];
  projects: Project[];
  /** 每个项目的待分配事件数 */
  pendingCounts: Record<string, number>;
  onToggle: (projectId: string) => void;
}) {
  const isWeekend = dayKey === "6" || dayKey === "7";

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <span
          className={`text-sm font-bold px-2.5 py-0.5 rounded-lg ${
            isWeekend
              ? "bg-orange-500/10 text-orange-400"
              : "bg-indigo-500/10 text-indigo-400"
          }`}
        >
          {dayLabel}
        </span>
        <span className="text-xs text-[var(--text-faint)]">
          {selectedIds.length === 0
            ? "休息日"
            : `安排 ${selectedIds.length} 科`}
        </span>
      </div>

      {/* 项目 Chip 列表 */}
      <div className="flex flex-wrap gap-2">
        {projects.map((project) => {
          const selected = selectedIds.includes(project.id);
          const hex = colorToHex(project.color_value);
          const pending = pendingCounts[project.id] ?? 0;
          return (
            <button
              key={project.id}
              onClick={() => onToggle(project.id)}
              style={
                selected
                  ? {
                      borderColor: hex,
                      backgroundColor: hex + "22",
                      color: hex,
                    }
                  : {}
              }
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                selected
                  ? "border-current font-bold"
                  : "border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--bg-inactive)] hover:text-[var(--text-tertiary)]"
              }`}
            >
              {project.name}
              {pending > 0 && (
                <span className={`ml-1 text-[10px] ${selected ? "opacity-70" : "text-[var(--text-faint)]"}`}>
                  ({pending})
                </span>
              )}
            </button>
          );
        })}
        {projects.length === 0 && (
          <span className="text-xs text-[var(--text-faintest)]">暂无项目</span>
        )}
      </div>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────

export default function WeeklySchedulePage() {
  const { projects, load: loadProjects } = useProjectStore();
  const { schedule: savedSchedule, loaded, load: loadWeekly, save } = useWeeklyStore();
  const { loadMonth, loadUnscheduled, invalidateAll } = useEventStore();

  // 草稿状态
  const [draft, setDraft] = useState<WeeklySchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [lastUndo, setLastUndo] = useState<{ changes: RescheduleChange[]; schedule: WeeklySchedule } | null>(null);
  const [undoCount, setUndoCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewChanges, setPreviewChanges] = useState<RescheduleChange[] | null>(null);
  const [previewSchedule, setPreviewSchedule] = useState<WeeklySchedule | null>(null);
  const [previewPreviousSchedule, setPreviewPreviousSchedule] = useState<WeeklySchedule | null>(null);

  // 【新增】每个项目的待分配事件数量
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  // 初始加载（带错误处理）
  useEffect(() => {
    setLoadError(null);
    Promise.all([loadProjects(), loadWeekly()])
      .catch((e) => setLoadError(String(e)));
  }, []);

  // 加载待分配事件统计
  useEffect(() => {
    if (!loaded) return;
    loadPendingCounts();
  }, [loaded]);

  async function loadPendingCounts() {
    try {
      // 复用 get_project_stats 或直接查 unscheduled
      const events = await invoke<Array<{ project_id: string | null }>>(
        "get_unscheduled_events"
      );
      const counts: Record<string, number> = {};
      for (const e of events) {
        if (e.project_id) {
          counts[e.project_id] = (counts[e.project_id] ?? 0) + 1;
        }
      }
      setPendingCounts(counts);
    } catch {
      // 非关键功能，静默失败
    }
  }

  async function reloadScheduleData() {
    invalidateAll();
    const now = new Date();
    const months = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    await Promise.all([loadUnscheduled(), ...months.map((m) => loadMonth(m))]);
    await loadPendingCounts();
  }

  // 首次或 savedSchedule 更新后初始化草稿
  useEffect(() => {
    if (loaded && draft === null) {
      setDraft(deepCopy(savedSchedule));
    }
  }, [loaded, savedSchedule]);

  // 脏检查：草稿是否与已保存的模板不同
  const isDirty = useMemo(() => {
    if (!draft || !loaded) return false;
    // 同时用结构化比较和 JSON 序列化兜底
    try {
      return JSON.stringify(draft) !== JSON.stringify(savedSchedule);
    } catch {
      return !scheduleEquals(draft, savedSchedule);
    }
  }, [draft, savedSchedule, loaded]);

  function toggleProject(dayKey: string, projectId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = deepCopy(prev);
      const list = next[dayKey] ?? [];
      if (list.includes(projectId)) {
        next[dayKey] = list.filter((id) => id !== projectId);
      } else {
        next[dayKey] = [...list, projectId];
      }
      return next;
    });
    setLastCount(null);
    setLastUndo(null);
    setUndoCount(null);
    setSaveError(null);
  }

  function clearAll() {
    setDraft((prev) => {
      if (!prev) return prev;
      const next: WeeklySchedule = {};
      for (const key of Object.keys(prev)) next[key] = [];
      return next;
    });
    setLastCount(null);
    setLastUndo(null);
    setUndoCount(null);
    setSaveError(null);
  }

  async function handleSaveAndApply() {
    if (!draft) return;
    setSaving(true);
    setLastCount(null);
    setSaveError(null);
    try {
      const activeProjectIds = new Set(projects.filter((p) => !p.is_archived).map((p) => p.id));
      const scheduleToSave = filterScheduleByProjects(draft, activeProjectIds);
      const changes = await invoke<RescheduleChange[]>("preview_reschedule_events", {
        schedule: scheduleToSave,
      });

      if (changes.length === 0) {
        await save(scheduleToSave);
        setDraft(deepCopy(scheduleToSave));
        setLastCount(0);
        setLastUndo(null);
        setUndoCount(null);
        await reloadScheduleData();
        return;
      }

      setPreviewChanges(changes);
      setPreviewSchedule(scheduleToSave);
      setPreviewPreviousSchedule(deepCopy(savedSchedule));
    } catch (e) {
      console.error("preview_reschedule_events 失败:", e);
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmApply() {
    if (!previewChanges || !previewSchedule || !previewPreviousSchedule) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save(previewSchedule);
      const count = await invoke<number>("apply_reschedule_changes", { changes: previewChanges });
      setLastCount(count);
      setLastUndo({ changes: previewChanges, schedule: previewPreviousSchedule });
      setUndoCount(null);
      setDraft(deepCopy(previewSchedule));
      setPreviewChanges(null);
      setPreviewSchedule(null);
      setPreviewPreviousSchedule(null);
      await reloadScheduleData();
    } catch (e) {
      console.error("apply_reschedule_changes 失败:", e);
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleUndoReschedule() {
    if (!lastUndo) return;
    setSaving(true);
    setSaveError(null);
    try {
      const count = await invoke<number>("undo_reschedule_changes", {
        changes: lastUndo.changes,
      });
      await save(lastUndo.schedule);
      setDraft(deepCopy(lastUndo.schedule));
      setLastUndo(null);
      setLastCount(null);
      setUndoCount(count);
      await reloadScheduleData();
    } catch (e) {
      console.error("undo_reschedule_changes 失败:", e);
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── 渲染 ──

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-[var(--text-tertiary)]">加载失败</p>
        <p className="text-[var(--text-faint)] text-sm">{loadError}</p>
        <button
          onClick={() => {
            setLoadError(null);
            Promise.all([loadProjects(), loadWeekly()])
              .catch((e) => setLoadError(String(e)));
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-500 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  if (!loaded || draft === null) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-faint)]">
        加载中…
      </div>
    );
  }

  const sortedProjects = projects
    .filter((p) => !p.is_archived)
    .sort((a, b) => a.priority - b.priority);

  if (sortedProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <FolderOpen size={52} className="text-[var(--text-faintest)]" />
        <p className="text-[var(--text-tertiary)] font-medium">没有进行中的项目</p>
        <p className="text-[var(--text-faint)] text-sm">请先去「项目」页添加或恢复项目</p>
      </div>
    );
  }

  const activeProjectIds = new Set(sortedProjects.map((p) => p.id));
  const visibleDraft = filterScheduleByProjects(draft, activeProjectIds);

  // 统计当前草稿中被管理的项目总待分配数
  const managedIds = new Set(Object.values(visibleDraft).flat());
  const totalPending = Object.entries(pendingCounts)
    .filter(([pid]) => managedIds.has(pid))
    .reduce((sum, [, c]) => sum + c, 0);

  return (
    <div className="p-8 max-w-2xl mx-auto min-h-full pb-32">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">周规划配置</h1>
          <p className="text-[var(--text-muted)] text-sm">设置每天学习的科目，保存后自动分配日程</p>
        </div>
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors px-3 py-2 rounded-xl hover:bg-[var(--bg-elevated)]"
          title="清空所有选中"
        >
          <Eraser size={15} />
          清空
        </button>
      </div>

      {/* 待分配统计 */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle size={15} />
          当前管理的项目共有 {totalPending} 条待分配日程
        </div>
      )}

      {/* 7 天卡片 */}
      <div className="flex flex-col gap-4 mb-8">
        {WEEK_DAYS.map(({ key, label }) => (
          <DayCard
            key={key}
            dayKey={key}
            dayLabel={label}
            selectedIds={visibleDraft[key] ?? []}
            projects={sortedProjects}
            pendingCounts={pendingCounts}
            onToggle={(pid) => toggleProject(key, pid)}
          />
        ))}
      </div>

      {/* 保存错误提示 */}
      {saveError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <AlertCircle size={16} />
          保存失败：{saveError}
        </div>
      )}

      {/* 上次重排结果提示 */}
      {lastCount !== null && (
        <div className="flex items-center gap-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 mb-6">
          <CalendarCheck size={16} className="flex-shrink-0" />
          <span className="flex-1">已应用 {lastCount} 项排程变更</span>
          {lastUndo && (
            <button
              onClick={handleUndoReschedule}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={13} />
              撤销
            </button>
          )}
        </div>
      )}

      {undoCount !== null && (
        <div className="flex items-center gap-2 text-sm text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 mb-6">
          <RotateCcw size={16} />
          已撤销 {undoCount} 项排程变更
        </div>
      )}

      {/* 保存按钮（固定底部）*/}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
        {isDirty && !saving && (
          <span className="text-xs text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-full">
            未保存
          </span>
        )}
        <button
          onClick={handleSaveAndApply}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-3 rounded-2xl text-sm font-semibold shadow-xl transition-all"
        >
          <Wand2 size={17} />
          {saving ? "重排中…" : "保存并重排日程"}
        </button>
      </div>

      {previewChanges && (
        <ReschedulePreviewDialog
          changes={previewChanges}
          projects={projects}
          saving={saving}
          onConfirm={handleConfirmApply}
          onCancel={() => {
            if (saving) return;
            setPreviewChanges(null);
            setPreviewSchedule(null);
            setPreviewPreviousSchedule(null);
          }}
        />
      )}
    </div>
  );
}
