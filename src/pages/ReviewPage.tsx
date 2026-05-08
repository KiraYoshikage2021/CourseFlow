import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
} from "lucide-react";
import {
  useReviewStore,
  type ReviewItem,
  type ReviewRating,
  type ReviewStats,
} from "../store/useReviewStore";

type ReviewFilter = "due" | "overdue" | "today";

const REVIEW_RATING_OPTIONS: Array<{
  value: ReviewRating;
  label: string;
  description: string;
  className: string;
}> = [
  { value: "again", label: "忘记", description: "很快再复习", className: "bg-red-500/10 text-red-400 hover:bg-red-500/15" },
  { value: "hard", label: "困难", description: "缩短间隔", className: "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/15" },
  { value: "good", label: "正常", description: "按计划推进", className: "bg-green-500/10 text-green-400 hover:bg-green-500/15" },
  { value: "easy", label: "简单", description: "拉长间隔", className: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/15" },
];

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "暂无";
}

function dueTone(item: ReviewItem, today: string) {
  if (item.due_date < today) return "text-red-400";
  if (item.due_date === today) return "text-cyan-300";
  return "text-[var(--text-faint)]";
}

function ReviewStatCards({ stats }: { stats: ReviewStats | null }) {
  const cards = [
    { label: "活跃复习", value: stats?.total_active ?? 0, tone: "text-[var(--text-primary)]" },
    { label: "今日到期", value: stats?.due_today ?? 0, tone: "text-cyan-300" },
    { label: "逾期", value: stats?.overdue ?? 0, tone: "text-red-400" },
    { label: "今日已复习", value: stats?.reviewed_today ?? 0, tone: "text-green-400" },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs text-[var(--text-faint)]">{card.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function ReviewLoadChart({ stats }: { stats: ReviewStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-faint)]">
        复习负载加载中
      </div>
    );
  }

  const maxLoad = Math.max(1, ...stats.upcoming_load_7_days.map((item) => item.due_count));
  const ratingTotal =
    stats.rating_counts_30_days.again +
    stats.rating_counts_30_days.hard +
    stats.rating_counts_30_days.good +
    stats.rating_counts_30_days.easy;
  const retentionText = ratingTotal > 0
    ? `${Math.round(stats.retention_percent_30_days)}%`
    : "暂无";

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">未来 7 天负载</p>
          <p className="text-xs text-[var(--text-faint)]">
            近 30 天记住率 {retentionText} · 近 7 天已复习 {stats.reviewed_last_7_days}
          </p>
        </div>
        <span className="text-xs text-[var(--text-faint)]">{stats.due_next_7_days} 项</span>
      </div>
      <div className="flex items-end gap-2 h-28">
        {stats.upcoming_load_7_days.map((item) => (
          <div key={item.date} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex items-end h-20">
              <div
                className="w-full rounded-t-md bg-cyan-400/60 min-h-1"
                style={{ height: `${Math.max(6, (item.due_count / maxLoad) * 76)}px` }}
              />
            </div>
            <span className="text-[10px] text-[var(--text-faint)]">{item.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewQueueItem({
  item,
  selected,
  today,
  onSelect,
}: {
  item: ReviewItem;
  selected: boolean;
  today: string;
  onSelect: () => void;
}) {
  const isOverdue = item.due_date < today;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
        selected
          ? "border-cyan-500 bg-cyan-500/10"
          : "border-[var(--border-default)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
          <p className="mt-1 text-xs text-[var(--text-faint)] truncate">
            {item.project_name ?? "无项目"}
            {item.milestone_name ? ` · ${item.milestone_name}` : ""}
          </p>
        </div>
        <span className={`text-[10px] flex-shrink-0 ${isOverdue ? "text-red-400" : "text-cyan-300"}`}>
          {isOverdue ? "逾期" : "今日"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-faint)]">
        <span>到期 {item.due_date}</span>
        <span>复习 {item.reps} 次</span>
      </div>
    </button>
  );
}

function CurrentReviewCard({
  item,
  today,
  reviewing,
  onReview,
}: {
  item: ReviewItem | null;
  today: string;
  reviewing: boolean;
  onReview: (rating: ReviewRating) => void | Promise<void>;
}) {
  if (!item) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-8 min-h-[420px] flex flex-col items-center justify-center text-center">
        <CheckCircle2 size={46} className="text-green-400 mb-3" />
        <p className="text-lg font-semibold text-[var(--text-primary)]">当前没有到期复习</p>
        <p className="text-sm text-[var(--text-faint)] mt-1">回到 Dashboard 或继续处理项目任务。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-6 min-h-[420px] flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
          <Brain size={13} />
          复习中
        </div>
        <span className={`text-xs ${dueTone(item, today)}`}>到期 {item.due_date}</span>
      </div>

      <div className="flex-1">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)] leading-snug">
          {item.title}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1 text-[var(--text-secondary)]">
            {item.project_name ?? "无项目"}
          </span>
          {item.milestone_name && (
            <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-indigo-300">
              {item.milestone_name}
            </span>
          )}
          <span className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1 text-[var(--text-faint)]">
            上次 {formatDate(item.last_reviewed_at)}
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-3">
            <p className="text-[10px] text-[var(--text-faint)]">稳定度</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item.stability.toFixed(1)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-3">
            <p className="text-[10px] text-[var(--text-faint)]">难度</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item.difficulty.toFixed(1)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-3">
            <p className="text-[10px] text-[var(--text-faint)]">复习次数</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item.reps}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-3">
            <p className="text-[10px] text-[var(--text-faint)]">间隔</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item.scheduled_days} 天</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-8">
        {REVIEW_RATING_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onReview(option.value)}
            disabled={reviewing}
            className={`rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-40 ${option.className}`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="block mt-0.5 text-[10px] opacity-75">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { dueItems, stats, loadingDue, loadDue, loadStats, submitReview } = useReviewStore();
  const today = useMemo(() => toDateStr(new Date()), []);
  const [filter, setFilter] = useState<ReviewFilter>("due");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    void Promise.all([loadDue(today), loadStats(today)]);
  }, [loadDue, loadStats, today]);

  const filteredItems = useMemo(() => {
    if (filter === "overdue") return dueItems.filter((item) => item.due_date < today);
    if (filter === "today") return dueItems.filter((item) => item.due_date === today);
    return dueItems;
  }, [dueItems, filter, today]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? null;
  const overdueCount = dueItems.filter((item) => item.due_date < today).length;
  const todayCount = dueItems.filter((item) => item.due_date === today).length;

  async function handleReview(rating: ReviewRating) {
    if (!selectedItem) return;
    setReviewing(true);
    try {
      await submitReview(selectedItem.id, rating, today);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="p-6 xl:p-8 max-w-[1600px] mx-auto min-h-full">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">复习</h1>
          <p className="text-[var(--text-muted)] text-sm">
            处理今日到期和逾期复习，评分后自动计算下一次复习日期
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <CalendarDays size={15} className="text-cyan-400" />
          {today}
        </div>
      </div>

      <ReviewStatCards stats={stats} />

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_320px] gap-5">
        <aside className="min-w-0">
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <ListChecks size={15} className="text-cyan-400" />
                复习队列
              </div>
              {loadingDue && <span className="text-xs text-[var(--text-faint)]">加载中</span>}
            </div>
            <div className="flex items-center rounded-xl bg-[var(--bg-muted)] p-1 mb-3">
              {([
                ["due", `全部 ${dueItems.length}`],
                ["overdue", `逾期 ${overdueCount}`],
                ["today", `今日 ${todayCount}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    filter === key
                      ? "bg-cyan-600 text-white"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredItems.map((item) => (
                <ReviewQueueItem
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  today={today}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))}
              {filteredItems.length === 0 && (
                <div className="rounded-xl bg-[var(--bg-muted)]/60 px-4 py-8 text-center">
                  <Clock3 size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
                  <p className="text-sm text-[var(--text-tertiary)]">当前筛选下没有复习项</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <CurrentReviewCard
            item={selectedItem}
            today={today}
            reviewing={reviewing}
            onReview={handleReview}
          />
        </main>

        <aside className="min-w-0 flex flex-col gap-4">
          <ReviewLoadChart stats={stats} />
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-3">
              <AlertCircle size={15} className="text-yellow-400" />
              使用提示
            </div>
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              按真实回忆情况评分即可。FSRS 会根据你的历史复习记录更新稳定度和难度；记录积累后可以在设置页优化参数。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
