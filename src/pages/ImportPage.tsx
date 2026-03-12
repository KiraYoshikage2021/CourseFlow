import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import {
  FileJson, CheckCircle2, Trash2, CalendarRange, X, ChevronRight,
} from "lucide-react";
import { useProjectStore } from "../store/useProjectStore";
import { useEventStore } from "../store/useEventStore";
import type { CalendarEvent } from "../store/useEventStore";

// ── 数据类型 ────────────────────────────────────────────────

interface Bookmark {
  title: string;
  level: number;
  page: number;
}

interface BookImportData {
  total_pages: number;
  chapters: Bookmark[];
}

// ── 工具函数 ────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const PRESET_COLORS = [
  0x6366f1, 0x8b5cf6, 0xec4899, 0xef4444,
  0xf97316, 0xeab308, 0x22c55e, 0x06b6d4,
];

// ── 核心生成算法（移植自 Flutter _executeGeneration）────────

function generateEvents(
  bookmarks: Bookmark[],
  totalBookPages: number,
  minPages: number,
  maxPages: number,
  startDate: Date,
  projectId: string,
): Array<{ title: string; date: string; project_id: string }> {
  const results: Array<{ title: string; date: string; project_id: string }> = [];
  let currentDate = new Date(startDate);

  const pendingTitles: string[] = [];
  let pendingPageCount = 0;

  function flushBuffer() {
    if (pendingTitles.length === 0) return;
    let combinedTitle = pendingTitles.join(" + ");
    if (combinedTitle.length > 30) {
      combinedTitle = `${pendingTitles[0]}…等${pendingTitles.length}章`;
    }
    results.push({
      title: `${combinedTitle} (共${pendingPageCount}页)`,
      date: toDateStr(currentDate),
      project_id: projectId,
    });
    currentDate = addDays(currentDate, 1);
    pendingTitles.length = 0;
    pendingPageCount = 0;
  }

  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    let length =
      i === bookmarks.length - 1
        ? totalBookPages - bm.page + 1
        : bookmarks[i + 1].page - bm.page;
    if (length <= 0) length = 1;

    if (length > maxPages) {
      if (pendingPageCount > 0) flushBuffer();
      let processed = 0;
      let partCount = 1;
      while (processed < length) {
        const remaining = length - processed;
        const chunkSize = remaining <= maxPages ? remaining : minPages;
        results.push({
          title: `${bm.title} (Part ${partCount}) - ${chunkSize}页`,
          date: toDateStr(currentDate),
          project_id: projectId,
        });
        currentDate = addDays(currentDate, 1);
        processed += chunkSize;
        partCount++;
      }
      continue;
    }

    if (pendingPageCount + length > maxPages) flushBuffer();
    pendingTitles.push(bm.title);
    pendingPageCount += length;
    if (pendingPageCount >= minPages) flushBuffer();
  }

  if (pendingPageCount > 0) flushBuffer();
  return results;
}

// ── 生成参数弹窗 ─────────────────────────────────────────────

function GenerateDialog({
  defaultName,
  defaultTotalPages,
  onGenerate,
  onClose,
}: {
  defaultName: string;
  defaultTotalPages: number;
  onGenerate: (
    projectName: string,
    minPages: number,
    maxPages: number,
    totalPages: number,
    startDate: Date
  ) => Promise<void>;
  onClose: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [projectName, setProjectName] = useState(defaultName);
  const [totalPages, setTotalPages] = useState(defaultTotalPages.toString());
  const [minPages, setMinPages] = useState("10");
  const [maxPages, setMaxPages] = useState("20");
  const [startDate, setStartDate] = useState(toDateStr(tomorrow));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    const min = parseInt(minPages) || 10;
    const max = parseInt(maxPages) || 20;
    const total = parseInt(totalPages) || defaultTotalPages;

    if (min > max) {
      setError("最小值不能大于最大值");
      return;
    }
    if (!projectName.trim()) {
      setError("请输入项目名称");
      return;
    }

    setError("");
    setGenerating(true);
    try {
      await onGenerate(projectName.trim(), min, max, total, new Date(startDate));
      onClose();
    } catch (e) {
      setError(`生成失败: ${e}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">生成学习计划</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-4">
          {/* 项目名称 */}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">项目名称</label>
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* 书籍总页数 */}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">书籍总页数</label>
            <input
              type="number"
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
              className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <p className="text-[10px] text-[var(--text-faint)] mt-0.5">已从 JSON 自动读取</p>
          </div>

          {/* 每日页数范围 */}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">每日学习页数范围</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  value={minPages}
                  onChange={(e) => setMinPages(e.target.value)}
                  placeholder="最小值"
                  className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div className="flex items-center text-[var(--text-faint)]"><ChevronRight size={14} /></div>
              <div className="flex-1">
                <input
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  placeholder="最大值"
                  className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 开始日期 */}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[var(--bg-muted)] text-[var(--text-primary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium text-sm"
          >
            {generating ? "生成中…" : "生成"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

export default function ImportPage() {
  const { add: addProject, load: loadProjects } = useProjectStore();
  const { loadMonth } = useEventStore();

  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);

  // ── 选择并解析 JSON 文件 ──

  async function pickJsonFile() {
    setLoading(true);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;

      const text = await readTextFile(path as string);
      const data: BookImportData = JSON.parse(text);

      // 按页码排序
      const sorted = [...(data.chapters ?? [])].sort((a, b) => a.page - b.page);

      setFileName((path as string).split(/[/\\]/).pop() ?? "");
      setBookmarks(sorted);
      setTotalPages(data.total_pages ?? 0);
      setLastCount(null);
    } catch (e) {
      console.error("JSON 解析错误:", e);
      alert("文件解析失败，请检查是否为标准 JSON 格式");
    } finally {
      setLoading(false);
    }
  }

  function clearFile() {
    setFileName("");
    setBookmarks([]);
    setTotalPages(0);
    setLastCount(null);
  }

  // ── 执行生成算法 ──

  async function handleGenerate(
    projectName: string,
    minPages: number,
    maxPages: number,
    total: number,
    startDate: Date
  ) {
    setLoading(true);
    try {
      // 1. 创建新项目（高难度）
      const colorValue = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
      const newProject = await addProject(projectName, colorValue, "high");

      // 2. 用算法生成事件列表
      const events = generateEvents(bookmarks, total, minPages, maxPages, startDate, newProject.id);

      // 3. 批量写入（复用 add_events_batch）
      const { invoke } = await import("@tauri-apps/api/core");
      const now = new Date().toISOString();
      const payload: CalendarEvent[] = events.map((e, i) => ({
        id: `${Date.now()}-${i}`,
        title: e.title,
        date: e.date,
        created_at: now,
        is_completed: false,
        is_pinned: false,
        project_id: e.project_id,
      }));
      await invoke("add_events_batch", { events: payload });

      // 4. 刷新 store：把生成的日期所在月份全部加载
      const months = new Set(events.map((e) => e.date.slice(0, 7)));
      await Promise.all([loadProjects(), ...[...months].map((m) => loadMonth(m))]);

      setLastCount(events.length);
    } finally {
      setLoading(false);
    }
  }

  // ── 渲染 ──

  const defaultName = fileName.replace(/\.json$/i, "");
  const defaultTotal =
    totalPages > 0
      ? totalPages
      : bookmarks.length > 0
      ? bookmarks[bookmarks.length - 1].page + 20
      : 100;

  return (
    <div className="p-8 max-w-2xl mx-auto h-full flex flex-col">
      {/* 标题 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">导入学习计划</h1>
        <p className="text-[var(--text-muted)] text-sm">上传书签 JSON，自动生成按章节分配的学习日程</p>
      </div>

      {/* 状态区 */}
      <div className="flex flex-col items-center py-8 gap-3 flex-shrink-0">
        {loading ? (
          <div className="text-[var(--text-muted)] text-sm animate-pulse">处理中…</div>
        ) : bookmarks.length === 0 ? (
          <FileJson size={52} className="text-[var(--text-faintest)]" />
        ) : (
          <CheckCircle2 size={52} className="text-green-500" />
        )}

        <p className="font-semibold text-[var(--text-primary)] text-sm">
          {bookmarks.length === 0 ? "尚未选择文件" : fileName}
        </p>
        {bookmarks.length > 0 && (
          <p className="text-[var(--text-muted)] text-xs">
            共 {totalPages} 页 · {bookmarks.length} 个章节
          </p>
        )}
        {lastCount !== null && (
          <div className="text-green-400 text-xs bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2 mt-1">
            已生成项目及 {lastCount} 个日程 🎉
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-default)] my-2" />

      {/* 书签列表 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {bookmarks.length === 0 ? (
          <div className="text-[var(--text-faint)] text-sm text-center py-12">
            请点击下方按钮选择 JSON 文件
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-default)]">
            {bookmarks.map((bm, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-1">
                <span className="text-[var(--text-faint)] text-xs w-8 text-right flex-shrink-0">#{i + 1}</span>
                <span className="flex-1 text-[var(--text-secondary)] text-sm truncate">{bm.title}</span>
                <span className="text-[var(--text-muted)] text-xs flex-shrink-0 font-mono">P.{bm.page}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="pt-5 flex-shrink-0">
        {bookmarks.length === 0 ? (
          <button
            onClick={pickJsonFile}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-2xl font-medium transition-colors"
          >
            <FileJson size={18} />
            选择书签 JSON 文件
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={clearFile}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-3 rounded-2xl border border-[var(--border-strong)] text-red-400 hover:bg-red-500/10 transition-colors text-sm"
            >
              <Trash2 size={15} />
              重选
            </button>
            <button
              onClick={() => setShowDialog(true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-2xl font-medium transition-colors text-sm"
            >
              <CalendarRange size={17} />
              生成计划
            </button>
          </div>
        )}
      </div>

      {/* 生成参数弹窗 */}
      {showDialog && (
        <GenerateDialog
          defaultName={defaultName}
          defaultTotalPages={defaultTotal}
          onGenerate={handleGenerate}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}