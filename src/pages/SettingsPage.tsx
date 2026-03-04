import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Download, Upload, School, AlertCircle,
  CheckCircle2, X, FileJson, Loader2,
} from "lucide-react";
import { useProjectStore } from "../store/useProjectStore";
import { useWeeklyStore } from "../store/useWeeklyStore";
import { useEventStore } from "../store/useEventStore";

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
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
        <p className="text-gray-400 text-sm mb-6 whitespace-pre-line">{description}</p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
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
      className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-gray-800/50 transition-colors disabled:opacity-50 first:rounded-t-2xl last:rounded-b-2xl"
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <span className="text-gray-700 text-lg">›</span>
    </button>
  );
}

// ── 主页面 ──────────────────────────────────────────────────

export default function SettingsPage() {
  const { load: loadProjects } = useProjectStore();
  const { load: loadWeekly } = useWeeklyStore();
  const { invalidateAll, loadMonth, loadUnscheduled } = useEventStore();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTypeRef = useRef<"flutter" | "tauri">("tauri");

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
        <h1 className="text-2xl font-bold text-white">CourseFlow</h1>
        <p className="text-gray-500 text-sm mt-1">Version 2.0.0 · Tauri</p>
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
            className="text-gray-500 hover:text-gray-300"
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl">
          <SettingsItem
            icon={<FileJson size={18} className="text-orange-400" />}
            title="导入 Flutter 版备份"
            subtitle="从旧版 App 的备份 JSON 迁移数据到 Tauri 版"
            onClick={() => triggerImport("flutter")}
            disabled={busy}
          />
        </div>
        <p className="text-xs text-gray-700 mt-2 px-1">
          支持旧版导出的 yantu_backup_*.json 文件，自动转换字段格式
        </p>
      </div>

      {/* 底部 */}
      <p className="text-center text-gray-700 text-sm">前程似锦 ✨</p>

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