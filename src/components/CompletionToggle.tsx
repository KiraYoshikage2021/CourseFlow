import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useUiPreferencesStore } from "../store/useUiPreferencesStore";

type CompletionToggleSize = "sm" | "md" | "lg";

interface CompletionToggleProps {
  checked: boolean;
  onChange?: () => void | Promise<void>;
  color?: string;
  size?: CompletionToggleSize;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  stopPropagation?: boolean;
}

let audioContext: AudioContext | null = null;

function playCompletionSound() {
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  audioContext ??= new AudioContextCtor();
  const ctx = audioContext;
  void ctx.resume();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  gain.connect(ctx.destination);

  const first = ctx.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(880, now);
  first.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.13);

  const second = ctx.createOscillator();
  second.type = "triangle";
  second.frequency.setValueAtTime(1760, now + 0.035);
  second.connect(gain);
  second.start(now + 0.035);
  second.stop(now + 0.15);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

const SIZE_CLASS: Record<CompletionToggleSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-7 h-7",
};

export default function CompletionToggle({
  checked,
  onChange,
  color = "#22c55e",
  size = "md",
  disabled = false,
  readOnly = false,
  className = "",
  title,
  ariaLabel,
  stopPropagation = false,
}: CompletionToggleProps) {
  const { completionFeedbackLevel, completionSoundEnabled } = useUiPreferencesStore();
  const reducedMotion = useReducedMotion();
  const previousChecked = useRef(checked);
  const [burstKey, setBurstKey] = useState(0);
  const interactive = !disabled && !readOnly && !!onChange;
  const enableMotion = completionFeedbackLevel !== "off" && !reducedMotion;
  const showBursts = checked && enableMotion && completionFeedbackLevel === "rich" && burstKey > 0;

  useEffect(() => {
    if (!previousChecked.current && checked) {
      if (enableMotion) setBurstKey((key) => key + 1);
      if (!readOnly && completionSoundEnabled) playCompletionSound();
    }
    previousChecked.current = checked;
  }, [checked, completionSoundEnabled, enableMotion, readOnly]);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) event.stopPropagation();
    if (!interactive) return;
    void onChange?.();
  }

  const style = {
    "--completion-color": color,
    "--completion-soft": `${color}24`,
  } as CSSProperties;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel ?? (checked ? "取消完成" : "标记完成")}
      title={title ?? (checked ? "取消完成" : "标记完成")}
      disabled={disabled}
      tabIndex={interactive ? 0 : -1}
      onClick={handleClick}
      className={`completion-toggle ${SIZE_CLASS[size]} ${checked ? "completion-toggle--checked" : ""} ${
        enableMotion ? "completion-toggle--motion" : "completion-toggle--still"
      } ${interactive ? "cursor-pointer" : "cursor-default"} ${disabled ? "opacity-50" : ""} ${className}`}
      style={style}
    >
      <svg className="completion-toggle__svg" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="completion-toggle__circle" cx="12" cy="12" r="9" />
        {checked && (
          <path
            key={enableMotion ? burstKey : "static"}
            className="completion-toggle__check"
            d="M7 12.5l3.2 3.2L17.5 8"
          />
        )}
      </svg>
      {showBursts && (
        <span key={burstKey} className="completion-toggle__bursts" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="completion-toggle__burst" />
          ))}
        </span>
      )}
    </button>
  );
}
