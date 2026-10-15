"use client";
import { Children, type ReactNode, useEffect, useId, useRef, useState } from "react";
export const DURATION_CHOICES = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 90, 120];
export function DurationWheel({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolling = useRef(false);
  useEffect(() => {
    ref.current?.scrollTo({ top: Math.max(0, DURATION_CHOICES.indexOf(value)) * 44,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function settle() {
    if (!scrolling.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const index = Math.max(0, Math.min(DURATION_CHOICES.length - 1, Math.round((ref.current?.scrollTop ?? 0) / 44)));
      scrolling.current = false; onChange(DURATION_CHOICES[index]);
    }, 180);
  }
  return <div className="polish-duration"><span>专注时长</span>
    <div ref={ref} className="polish-wheel" role="group" aria-label="选择专注分钟，可滚动或点击" tabIndex={0}
      onPointerDown={() => { scrolling.current = true; }} onWheel={() => { scrolling.current = true; }} onScroll={settle}
      onKeyDown={event => {
        const index = Math.max(0, DURATION_CHOICES.indexOf(value));
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(DURATION_CHOICES[Math.max(0, Math.min(DURATION_CHOICES.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]);
        }
      }}>
      {DURATION_CHOICES.map(minutes => <button key={minutes} type="button" aria-pressed={value === minutes}
        onClick={() => { scrolling.current = false; onChange(minutes); }}>{minutes}<small> 分钟</small></button>)}
    </div><span className="polish-wheel-hint">滑动选择，也可点击数值</span>
  </div>;
}
export function ProgressOrbit({ completed, total, unavailable = false }: { completed: number; total: number; unavailable?: boolean }) {
  const safeTotal = Math.max(0, Number.isFinite(total) ? total : 0);
  const safeDone = Math.min(safeTotal, Math.max(0, Number.isFinite(completed) ? completed : 0));
  const progress = safeTotal ? safeDone / safeTotal : 0;
  return <div className="polish-orbit" role="img" aria-label={unavailable ? "任务进度尚未读到" : "已读取任务完成 " + safeDone + " / " + safeTotal}>
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="33" />
      <circle className="polish-orbit-fill" cx="40" cy="40" r="33" pathLength="100"
        strokeDasharray="100" strokeDashoffset={unavailable ? 100 : 100 - progress * 100} /></svg>
    <strong key={unavailable ? "unknown" : safeDone} className="polish-count">{unavailable ? "—" : safeDone}</strong>
  </div>;
}
export function StackedList({ children }: { children: ReactNode }) {
  const items = Children.toArray(children), [expanded, setExpanded] = useState(false), id = useId();
  if (items.length <= 1) return <>{items}</>;
  return <div className={"polish-stack " + (expanded ? "is-open" : "")}>
    {items[0]}<div id={id} hidden={!expanded} className="polish-stack-rest">{items.slice(1)}</div>
    <button type="button" className="polish-stack-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}>{expanded ? "收起记录" : "展开另外 " + (items.length - 1) + " 条记录"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
  </div>;
}
export function SaveFeedback({ local, label }: { local: boolean; label: string }) {
  return <p className={"polish-save-feedback " + (local ? "is-local" : "is-confirmed")} role="status" aria-live="polite">
    <svg viewBox="0 0 24 24" aria-hidden="true">{local ? <path d="M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h3" />
      : <path className="polish-check-path" pathLength="1" d="M5 12l5 5L20 7" />}</svg>
    <span><strong>{local ? "已存本机待同步" : "保存已确认"}</strong><small>{label}</small></span>
  </p>;
}
