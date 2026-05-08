import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Brain, ClipboardList, Download, Upload, School, AlertCircle,
  CheckCircle2, X, FileJson, Loader2, Sun, Moon, Sparkles, Volume2, VolumeX,
} from "lucide-react";
import { useProjectStore } from "../store/useProjectStore";
import { useWeeklyStore } from "../store/useWeeklyStore";
import { useEventStore } from "../store/useEventStore";
import { useThemeStore } from "../store/useThemeStore";
import {
  useUiPreferencesStore,
  type CompletionFeedbackLevel,
  type TodayWorkbenchStyle,
} from "../store/useUiPreferencesStore";

// ── 工具 ────────────────────────────────────────────────────

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** 触发浏览器下载（Tauri WebView 兼容） */
function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // 延迟清理以确保下载启动
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

interface FsrsSettings {
  desired_retention: number;
  maximum_interval: number;
  weights: number[];
  optimized_at: string | null;
  optimizer_review_count: number;
  optimizer_loss: number | null;
}

interface FsrsOptimizeResult {
  updated: boolean;
  message: string;
  reviewed_count: number;
  prediction_count: number;
  previous_loss: number | null;
  optimized_loss: number | null;
  settings: FsrsSettings;
}

// ── 确认弹窗 ────────────────────────────────────────────────

function ConfirmDialog({
  title, description, confirmLabel, onConfirm, onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{title}</h2>
        <p className="text-[var(--text-tertiary)] text-sm mb-6 whitespace-pre-line">{description}</p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">
            取消
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-colors font-medium">
            {confirmLabel ?? "确定覆盖"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 设置项 ──────────────────────────────────────────────────

function SettingsItem({
  icon, title, subtitle, onClick, disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-[var(--bg-elevated)]/50 transition-colors disabled:opacity-50 first:rounded-t-2xl last:rounded-b-2xl"
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
      </div>
      <span className="text-[var(--text-faintest)] text-lg">›</span>
    </button>
  );
}

// ── 主页面 ──────────────────────────────────────────────────

export default function SettingsPage() {
  const { load: loadProjects } = useProjectStore();
  const { load: loadWeekly } = useWeeklyStore();
  const { invalidateAll, loadMonth, loadUnscheduled } = useEventStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const {
    todayWorkbenchStyle,
    completionFeedbackLevel,
    completionSoundEnabled,
    setTodayWorkbenchStyle,
    setCompletionFeedbackLevel,
    setCompletionSoundEnabled,
  } = useUiPreferencesStore();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [fsrsSettings, setFsrsSettings] = useState<FsrsSettings | null>(null);
  const [optimizingFsrs, setOptimizingFsrs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTypeRef = useRef<"flutter" | "tauri">("tauri");

  useEffect(() => {
    void loadFsrsSettings();
  }, []);

  async function loadFsrsSettings() {
    try {
      const settings = await invoke<FsrsSettings>("get_fsrs_settings");
      setFsrsSettings(settings);
    } catch (e) {
      console.error("get_fsrs_settings 失败:", e);
    }
  }

  async function handleOptimizeFsrs() {
    setOptimizingFsrs(true);
    setMessage(null);
    try {
      const result = await invoke<FsrsOptimizeResult>("optimize_fsrs_parameters");
      setFsrsSettings(result.settings);
      const lossText =
        result.previous_loss !== null && result.optimized_loss !== null
          ? ` loss ${result.previous_loss.toFixed(3)} → ${result.optimized_loss.toFixed(3)}`
          : "";
      setMessage({
        type: result.updated ? "success" : "error",
        text: `${result.message} 已读取 ${result.reviewed_count} 条日志，${result.prediction_count} 条可训练预测。${lossText}`,
      });
    } catch (e) {
      setMessage({ type: "error", text: `FSRS 优化失败: ${e}` });
    } finally {
      setOptimizingFsrs(false);
    }
  }

  // ── 刷新所有 store ──

  async function refreshAllStores() {
    invalidateAll();
    const now = new Date();
    const months = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    await Promise.all([
      loadProjects(),
      loadWeekly(),
      loadUnscheduled(),
      ...months.map((m) => loadMonth(m)),
    ]);
  }

  // ── 导出备份 ──

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const json = await invoke<string>("export_backup");
      downloadJson(json, `courseflow_backup_${timestamp()}.json`);
      setMessage({ type: "success", text: "备份文件已下载" });
    } catch (e) {
      setMessage({ type: "error", text: `导出失败: ${e}` });
    } finally {
      setBusy(false);
    }
  }

  // ── 导入文件被选中 ──

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // 重置以便重复选择同一文件

    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const command =
        importTypeRef.current === "flutter"
          ? "import_flutter_backup"
          : "import_backup";
      const result = await invoke<string>(command, { json: text });
      await refreshAllStores();
      setMessage({ type: "success", text: result });
    } catch (e) {
      setMessage({ type: "error", text: `导入失败: ${e}` });
    } finally {
      setBusy(false);
    }
  }

  // ── 触发导入（先确认） ──

  function triggerImport(type: "flutter" | "tauri") {
    importTypeRef.current = type;
    setConfirm({
      title: type === "flutter" ? "导入 Flutter 版备份" : "恢复数据",
      description:
        "恢复数据将【完全覆盖】当前 App 里的所有日程和项目数据。\n\n确定要继续吗？",
      onConfirm: () => {
        setConfirm(null);
        fileInputRef.current?.click();
      },
    });
  }

  // ── 渲染 ──

  return (
    <div className="p-8 max-w-lg mx-auto min-h-full">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* 头部 */}
      <div className="text-center mb-10 pt-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-600/10 mb-4">
          <School size={40} className="text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">CourseFlow</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">Version 3.0.0 · Tauri</p>
      </div>

      {/* 全局加载遮罩 */}
      {busy && (
        <div className="flex items-center gap-2 text-sm text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 mb-6">
          <Loader2 size={15} className="animate-spin" />
          处理中，请稍候…
        </div>
      )}

      {/* 操作结果提示 */}
      {message && (
        <div
          className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-6 ${
            message.type === "success"
              ? "text-green-400 bg-green-500/10 border border-green-500/20"
              : "text-red-400 bg-red-500/10 border border-red-500/20"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span className="flex-1">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 数据安全 */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-indigo-400 mb-3 px-1">
          数据安全
        </p>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl divide-y divide-[var(--border-default)]">
          <SettingsItem
            icon={<Download size={18} className="text-blue-400" />}
            title="备份数据"
            subtitle="导出所有数据为 JSON 文件，防丢失"
            onClick={handleExport}
            disabled={busy}
          />
          <SettingsItem
            icon={<Upload size={18} className="text-green-400" />}
            title="恢复数据"
            subtitle="从备份文件导入并覆盖当前数据"
            onClick={() => triggerImport("tauri")}
            disabled={busy}
          />
        </div>
      </div>

      {/* 数据迁移 */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-orange-400 mb-3 px-1">
          数据迁移
        </p>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl">
          <SettingsItem
            icon={<FileJson size={18} className="text-orange-400" />}
            title="导入 Flutter 版备份"
            subtitle="从旧版 App 的备份 JSON 迁移数据到 Tauri 版"
            onClick={() => triggerImport("flutter")}
            disabled={busy}
          />
        </div>
        <p className="text-xs text-[var(--text-faintest)] mt-2 px-1">
          支持旧版导出的 yantu_backup_*.json 文件，自动转换字段格式
        </p>
      </div>

      {/* 复习算法 */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-cyan-400 mb-3 px-1">
          复习算法
        </p>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl px-5 py-4">
          <div className="flex items-start gap-4">
            <Brain size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">FSRS 参数优化</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                使用 FSRS-5 的 19 个权重，根据本地复习日志优化后续间隔。
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <p className="text-[var(--text-faint)]">目标记住率</p>
                  <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                    {fsrsSettings ? `${Math.round(fsrsSettings.desired_retention * 100)}%` : "加载中"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <p className="text-[var(--text-faint)]">训练日志</p>
                  <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                    {fsrsSettings ? `${fsrsSettings.optimizer_review_count} 条` : "加载中"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <p className="text-[var(--text-faint)]">最近优化</p>
                  <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                    {fsrsSettings?.optimized_at ? fsrsSettings.optimized_at.slice(0, 10) : "默认参数"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                  <p className="text-[var(--text-faint)]">当前 loss</p>
                  <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                    {fsrsSettings?.optimizer_loss !== null && fsrsSettings?.optimizer_loss !== undefined
                      ? fsrsSettings.optimizer_loss.toFixed(3)
                      : "暂无"}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleOptimizeFsrs}
              disabled={optimizingFsrs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 disabled:opacity-50 transition-colors"
            >
              {optimizingFsrs && <Loader2 size={13} className="animate-spin" />}
              优化参数
            </button>
          </div>
        </div>
      </div>

      {/* 外观 */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-purple-400 mb-3 px-1">
          外观
        </p>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl divide-y divide-[var(--border-default)]">
          <SettingsItem
            icon={theme === "dark"
              ? <Sun size={18} className="text-yellow-400" />
              : <Moon size={18} className="text-purple-400" />}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            subtitle={theme === "dark" ? "当前为深色主题" : "当前为浅色主题"}
            onClick={toggleTheme}
          />
          <div className="flex items-center gap-4 w-full px-5 py-4">
            <ClipboardList size={18} className="text-indigo-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">Dashboard 样式</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {todayWorkbenchStyle === "workbench" ? "当前为紧凑工作台和表格式日历" : "当前为独立卡片布局"}
              </p>
            </div>
            <div className="flex items-center rounded-lg bg-[var(--bg-muted)] p-0.5">
              {([
                ["workbench", "工作台"],
                ["cards", "卡片"],
              ] as const).map(([style, label]: readonly [TodayWorkbenchStyle, string]) => (
                <button
                  key={style}
                  onClick={() => setTodayWorkbenchStyle(style)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    todayWorkbenchStyle === style
                      ? "bg-indigo-600 text-white"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 w-full px-5 py-4">
            <Sparkles size={18} className="text-green-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">完成动效</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {completionFeedbackLevel === "off"
                  ? "关闭打勾动画"
                  : completionFeedbackLevel === "standard"
                  ? "只显示动态打勾"
                  : "动态打勾并增加轻量闪光"}
              </p>
            </div>
            <div className="flex items-center rounded-lg bg-[var(--bg-muted)] p-0.5">
              {([
                ["off", "关闭"],
                ["standard", "标准"],
                ["rich", "丰富"],
              ] as const).map(([level, label]: readonly [CompletionFeedbackLevel, string]) => (
                <button
                  key={level}
                  onClick={() => setCompletionFeedbackLevel(level)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    completionFeedbackLevel === level
                      ? "bg-green-600 text-white"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 w-full px-5 py-4">
            {completionSoundEnabled ? (
              <Volume2 size={18} className="text-green-400 flex-shrink-0" />
            ) : (
              <VolumeX size={18} className="text-[var(--text-muted)] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">完成音效</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {completionSoundEnabled ? "完成任务时播放短促清脆提示音" : "完成任务时不播放声音"}
              </p>
            </div>
            <button
              onClick={() => setCompletionSoundEnabled(!completionSoundEnabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                completionSoundEnabled ? "bg-green-600" : "bg-[var(--bg-muted)]"
              }`}
              aria-pressed={completionSoundEnabled}
            >
              <span
                className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  completionSoundEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 底部 */}
      <p className="text-center text-[var(--text-faintest)] text-sm">前程似锦 ✨</p>

      {/* 确认弹窗 */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
