import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Flame, Pencil, Trash2, X, Check, BarChart2 } from "lucide-react";
import { useHabitStore, HabitWithStats } from "../store/useHabitStore";

// ── 工具函数 ─────────────────────────────────────────────────

function colorToHex(val: number) {
  return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
}

function todayStr() {
  return dateToStr(new Date());
}

function dateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function strToLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computeLongestStreak(
  scheduledDows: Set<number>,
  completionSet: Set<string>,
  createdAt: string,
  today: string
): number {
  const todayDate = strToLocalDate(today);
  let start = strToLocalDate(createdAt);
  // 不超过 2 年
  const limit = addDays(todayDate, -730);
  if (start < limit) start = limit;

  let max = 0;
  let current = 0;
  let d = new Date(start);

  while (dateToStr(d) <= today) {
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (scheduledDows.has(dow)) {
      const ds = dateToStr(d);
      if (completionSet.has(ds)) {
        current++;
        max = Math.max(max, current);
      } else if (ds < today) {
        current = 0;
      }
    }
    d = addDays(d, 1);
  }
  return max;
}

const PRESET_COLORS = [
  0x6366f1, 0x8b5cf6, 0xec4899, 0xef4444,
  0xf97316, 0xeab308, 0x22c55e, 0x06b6d4,
];

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_SHORT  = ["一",   "二",   "三",   "四",   "五",   "六",   "日"];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

// ── 弹窗：新增 / 编辑习惯 ────────────────────────────────────

function HabitDialog({
  habit,
  onClose,
  onSave,
}: {
  habit?: HabitWithStats;
  onClose: () => void;
  onSave: (name: string, daysOfWeek: string, colorValue: number) => Promise<void>;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [selectedDays, setSelectedDays] = useState<number[]>(
    habit
      ? habit.days_of_week.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
      : []
  );
  const [colorValue] = useState(
    habit?.color_value ?? PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleDay = (d: number) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("请输入习惯名称"); return; }
    if (selectedDays.length === 0) { setError("请至少选择一天"); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), selectedDays.join(","), colorValue);
      onClose();
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorToHex(colorValue) }}
          />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1">
            {habit ? "编辑习惯" : "新增习惯"}
          </h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs text-[var(--text-tertiary)] mb-1">名称</label>
        <input
          className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] mb-4 focus:outline-none focus:border-indigo-500"
          placeholder="例：运动、阅读、冥想…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="block text-xs text-[var(--text-tertiary)] mb-2">打卡天数</label>
        <div className="flex gap-1.5 mb-5">
          {DAY_VALUES.map((d, i) => {
            const active = selectedDays.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:bg-[var(--bg-base)]"
                }`}
              >
                {DAY_LABELS[i]}
              </button>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

// ── 弹窗：历史 ───────────────────────────────────────────────

function HistoryModal({
  habit,
  onClose,
}: {
  habit: HabitWithStats;
  onClose: () => void;
}) {
  const [completions, setCompletions] = useState<string[] | null>(null);
  const today = todayStr();
  const color = colorToHex(habit.color_value);

  useEffect(() => {
    const fromDate = habit.created_at.slice(0, 10);
    invoke<string[]>("get_habit_history", {
      habitId: habit.id,
      fromDate,
      toDate: today,
    })
      .then(setCompletions)
      .catch(() => setCompletions([]));
  }, [habit.id]);

  if (completions === null) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 text-[var(--text-tertiary)] text-sm">
          加载中…
        </div>
      </div>
    );
  }

  const completionSet = new Set(completions);
  const scheduledDows = new Set(
    habit.days_of_week.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
  );
  const createdDate = habit.created_at.slice(0, 10);

  // 热图：最近 12 周
  const todayLocal = strToLocalDate(today);
  const todayDow = todayLocal.getDay();
  const daysFromMonday = todayDow === 0 ? 6 : todayDow - 1;
  const thisMonday = addDays(todayLocal, -daysFromMonday);
  const gridStart = addDays(thisMonday, -11 * 7);
  const heatmapDates: Date[] = [];
  for (let i = 0; i < 84; i++) heatmapDates.push(addDays(gridStart, i));

  // 统计数据
  const totalCompletions = completions.length;
  const longestStreak = computeLongestStreak(
    scheduledDows, completionSet, habit.created_at.slice(0, 10), today
  );

  const monthStart = `${today.slice(0, 7)}-01`;
  let d = strToLocalDate(monthStart);
  const scheduledThisMonth: string[] = [];
  while (dateToStr(d) <= today) {
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (scheduledDows.has(dow)) scheduledThisMonth.push(dateToStr(d));
    d = addDays(d, 1);
  }
  const completedThisMonth = scheduledThisMonth.filter((ds) => completionSet.has(ds)).length;
  const monthRate =
    scheduledThisMonth.length === 0
      ? 100
      : Math.round((completedThisMonth / scheduledThisMonth.length) * 100);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1">{habit.name}</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: "当前连续", value: habit.streak },
            { label: "历史最长", value: longestStreak },
            { label: "本月完成率", value: `${monthRate}%` },
            { label: "累计打卡", value: totalCompletions },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--bg-card)] rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{s.value}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 热图 */}
        <p className="text-xs text-[var(--text-tertiary)] mb-2">近 12 周</p>
        <div className="flex gap-2">
          {/* 星期标签 */}
          <div className="flex flex-col pt-5" style={{ gap: "3px" }}>
            {DAY_SHORT.map((label, i) => (
              <div
                key={i}
                className="text-xs text-[var(--text-tertiary)]"
                style={{ height: "14px", lineHeight: "14px", width: "12px", textAlign: "right" }}
              >
                {i % 2 === 0 ? label : ""}
              </div>
            ))}
          </div>

          <div>
            {/* 月份标签 */}
            <div className="flex mb-1" style={{ gap: "3px" }}>
              {Array.from({ length: 12 }, (_, weekIndex) => {
                const weekStart = heatmapDates[weekIndex * 7];
                const showLabel = weekStart.getDate() <= 7 || weekIndex === 0;
                return (
                  <div
                    key={weekIndex}
                    className="text-xs text-[var(--text-tertiary)]"
                    style={{ width: "14px" }}
                  >
                    {showLabel ? `${weekStart.getMonth() + 1}` : ""}
                  </div>
                );
              })}
            </div>

            {/* 热图格子 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 14px)",
                gridTemplateRows: "repeat(7, 14px)",
                gap: "3px",
              }}
            >
              {Array.from({ length: 7 }, (_, dayIndex) =>
                Array.from({ length: 12 }, (_, weekIndex) => {
                  const date = heatmapDates[weekIndex * 7 + dayIndex];
                  const ds = dateToStr(date);
                  const dow = date.getDay() === 0 ? 7 : date.getDay();
                  const isScheduled = scheduledDows.has(dow);
                  const isCompleted = completionSet.has(ds);
                  const isFuture = ds > today;
                  const isBeforeCreated = ds < createdDate;
                  const isToday = ds === today;

                  let bg = "var(--bg-card)";
                  if (!isFuture && !isBeforeCreated && isScheduled) {
                    bg = isCompleted ? color : "var(--border-default)";
                  }

                  return (
                    <div
                      key={ds}
                      title={`${ds}${isScheduled ? (isCompleted ? " ✓" : isFuture ? "" : " ✗") : ""}`}
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "3px",
                        backgroundColor: bg,
                        opacity: isFuture ? 0.25 : 1,
                        outline: isToday ? `2px solid ${color}` : "none",
                        outlineOffset: "1px",
                      }}
                    />
                  );
                })
              ).flat()}
            </div>
          </div>
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            已打卡
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <div className="w-3 h-3 rounded-sm bg-[var(--border-default)]" />
            未打卡
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <div className="w-3 h-3 rounded-sm bg-[var(--bg-card)]" />
            非打卡日
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 习惯卡片 ─────────────────────────────────────────────────

function HabitCard({
  habit,
  today,
  onToggle,
  onEdit,
  onDelete,
  onHistory,
}: {
  habit: HabitWithStats;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  const color = colorToHex(habit.color_value);
  const scheduledDays = habit.days_of_week
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n));
  const dayLabels = scheduledDays.map((d) => DAY_LABELS[d - 1]).join("、");

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-card)] transition-opacity ${
        habit.scheduled_today ? "opacity-100" : "opacity-40"
      }`}
    >
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{habit.name}</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{dayLabels}</p>
      </div>

      {/* Streak */}
      <div className="flex items-center gap-1 text-orange-400 flex-shrink-0">
        <Flame size={14} />
        <span className="text-xs font-semibold">{habit.streak}</span>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onHistory}
          className="p-1.5 text-[var(--text-muted)] hover:text-indigo-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]"
          title="查看历史"
        >
          <BarChart2 size={14} />
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 text-[var(--text-muted)] hover:text-blue-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]"
          title="编辑"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-[var(--text-muted)] hover:text-red-400 transition-colors rounded-lg hover:bg-[var(--bg-elevated)]"
          title="删除"
        >
          <Trash2 size={14} />
        </button>

        {habit.scheduled_today && (
          <button
            onClick={onToggle}
            className={`ml-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              habit.completed_today
                ? "bg-green-500 text-white hover:bg-green-600"
                : "border-2 border-[var(--border-default)] text-transparent hover:border-indigo-400"
            }`}
            title={habit.completed_today ? "撤销打卡" : "打卡"}
          >
            <Check size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

export default function HabitsPage() {
  const { habits, loading, load, add, update, remove, toggle } = useHabitStore();
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<
    | { type: "add" }
    | { type: "edit"; habit: HabitWithStats }
    | { type: "history"; habit: HabitWithStats }
    | null
  >(null);

  const today = todayStr();

  const todayDow = (() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  })();

  useEffect(() => {
    load(today).finally(() => setLoaded(true));
  }, []);

  const todayHabits = habits.filter((h) =>
    h.days_of_week.split(",").map((s) => parseInt(s.trim())).includes(todayDow)
  );
  const otherHabits = habits.filter(
    (h) => !h.days_of_week.split(",").map((s) => parseInt(s.trim())).includes(todayDow)
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-sm">
        加载中…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">习惯</h1>
        <button
          onClick={() => setDialog({ type: "add" })}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          新增习惯
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="text-center text-[var(--text-tertiary)] text-sm mt-24">
          <Flame size={36} className="mx-auto mb-3 opacity-30" />
          <p>还没有习惯，点击右上角开始吧</p>
        </div>
      ) : (
        <>
          {todayHabits.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                今天
              </h2>
              <div className="flex flex-col gap-2">
                {todayHabits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    today={today}
                    onToggle={() => toggle(h.id, today)}
                    onEdit={() => setDialog({ type: "edit", habit: h })}
                    onDelete={() => remove(h.id)}
                    onHistory={() => setDialog({ type: "history", habit: h })}
                  />
                ))}
              </div>
            </section>
          )}

          {otherHabits.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                其他天数
              </h2>
              <div className="flex flex-col gap-2">
                {otherHabits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    today={today}
                    onToggle={() => toggle(h.id, today)}
                    onEdit={() => setDialog({ type: "edit", habit: h })}
                    onDelete={() => remove(h.id)}
                    onHistory={() => setDialog({ type: "history", habit: h })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 弹窗 */}
      {dialog?.type === "add" && (
        <HabitDialog
          onClose={() => setDialog(null)}
          onSave={async (name, daysOfWeek, colorValue) => {
            await add(name, daysOfWeek, colorValue);
            await load(today);
          }}
        />
      )}
      {dialog?.type === "edit" && (
        <HabitDialog
          habit={dialog.habit}
          onClose={() => setDialog(null)}
          onSave={async (name, daysOfWeek) => {
            await update(dialog.habit.id, name, daysOfWeek);
            await load(today);
          }}
        />
      )}
      {dialog?.type === "history" && (
        <HistoryModal
          habit={dialog.habit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
