import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const WEEK_DAYS = ["一", "二", "三", "四", "五", "六", "日"];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toDateStr(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string, placeholder: string) {
  const date = parseDate(value);
  if (!date) return placeholder;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function monthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function AppSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
  className,
  buttonClassName,
  menuClassName,
  title,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: -9999, left: -9999, width: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: rect.width,
      });
    }

    updatePosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={cx(
          "w-full min-w-0 flex items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName
        )}
      >
        <span className={cx("truncate", !selected && "text-[var(--text-faint)]")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown size={15} className="text-[var(--text-faint)] flex-shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
          }}
          className={cx(
            "fixed z-[100] max-h-64 overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-2xl",
            menuClassName
          )}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <span className="truncate">{option.label}</span>
                {active && <Check size={14} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export function DateInput({
  value,
  onChange,
  placeholder = "选择日期",
  disabled = false,
  clearable = true,
  className,
  buttonClassName,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  buttonClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDate(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => selectedDate ?? new Date()
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (selectedDate) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 288;
      const menuHeight = 355;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
      const belowTop = rect.bottom + 4;
      const top =
        belowTop + menuHeight > window.innerHeight && rect.top > menuHeight
          ? rect.top - menuHeight - 4
          : belowTop;
      setMenuPosition({ top, left });
    }

    updatePosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const monthCells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: offset + daysInMonth }, (_, index) => {
      if (index < offset) return null;
      return new Date(year, month, index - offset + 1);
    });
  }, [visibleMonth]);

  function moveMonth(offset: number) {
    setVisibleMonth((current) =>
      new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function pick(date: Date) {
    onChange(toDateStr(date));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={cx(
          "w-full min-w-0 flex items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName
        )}
      >
        <span className={cx("truncate", !selectedDate && "text-[var(--text-faint)]")}>
          {formatDate(value, placeholder)}
        </span>
        <CalendarDays size={15} className="text-[var(--text-faint)] flex-shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: menuPosition.top, left: menuPosition.left }}
          className="fixed z-[100] w-72 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
              title="上个月"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {monthTitle(visibleMonth)}
            </span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
              title="下个月"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[var(--text-faint)]">
            {WEEK_DAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} className="h-8" />;
              const dateStr = toDateStr(date);
              const isSelected = dateStr === value;
              const isToday = dateStr === toDateStr(new Date());
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => pick(date)}
                  className={cx(
                    "h-8 rounded-lg text-xs transition-colors",
                    isSelected
                      ? "bg-indigo-600 text-white font-semibold"
                      : isToday
                      ? "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {clearable && value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              <X size={13} />
              清除日期
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
