"use client";

import { useCallback, useEffect, useState } from "react";

export type FocusSession = {
  targetType: "schedule" | "task";
  targetId: string;
  title: string;
  mode: "stopwatch" | "pomodoro";
  durationMinutes: number;
  startedAt: string;
  resumedAt: string | null;
  accumulatedMs: number;
  status: "running" | "paused";
};

export const FOCUS_STORAGE_KEY = "life-workbench-focus-session";
const FOCUS_CHANGE_EVENT = "life-workbench-focus-change";

export function focusElapsedMs(session: FocusSession, now = Date.now()) {
  return (
    session.accumulatedMs +
    (session.status === "running" && session.resumedAt
      ? Math.max(0, now - new Date(session.resumedAt).getTime())
      : 0)
  );
}

export function focusClock(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function focusDisplay(session: FocusSession, now = Date.now()) {
  const elapsed = focusElapsedMs(session, now);
  if (session.mode === "pomodoro") {
    return focusClock(Math.max(0, session.durationMinutes * 60_000 - elapsed));
  }
  return focusClock(elapsed);
}

function normalizeSession(value: unknown): FocusSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FocusSession> & { scheduleId?: string };
  const targetId = String(candidate.targetId || candidate.scheduleId || "");
  if (!targetId || !["running", "paused"].includes(String(candidate.status))) {
    return null;
  }
  return {
    targetType: candidate.targetType === "task" ? "task" : "schedule",
    targetId,
    title: String(candidate.title || "专注事项"),
    mode: candidate.mode === "pomodoro" ? "pomodoro" : "stopwatch",
    durationMinutes: Math.max(1, Number(candidate.durationMinutes) || 25),
    startedAt: String(candidate.startedAt || new Date().toISOString()),
    resumedAt: candidate.resumedAt ? String(candidate.resumedAt) : null,
    accumulatedMs: Math.max(0, Number(candidate.accumulatedMs) || 0),
    status: candidate.status === "paused" ? "paused" : "running",
  };
}

export type FocusClockController = {
  session: FocusSession | null;
  now: number;
  start: (input: {
    targetType: FocusSession["targetType"];
    targetId: string;
    title: string;
    mode?: FocusSession["mode"];
    durationMinutes?: number;
  }) => boolean;
  toggle: () => void;
  pause: () => void;
  clear: () => void;
};

export function useFocusClock(): FocusClockController {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const persist = useCallback((next: FocusSession | null) => {
    setSession(next);
    setNow(Date.now());
    if (next) {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(FOCUS_STORAGE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent<FocusSession | null>(FOCUS_CHANGE_EVENT, {
        detail: next,
      }),
    );
  }, []);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(FOCUS_STORAGE_KEY);
        const restored = saved ? normalizeSession(JSON.parse(saved)) : null;
        if (saved && !restored) window.localStorage.removeItem(FOCUS_STORAGE_KEY);
        setSession(restored);
        setNow(Date.now());
      } catch {
        window.localStorage.removeItem(FOCUS_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!session || session.status !== "running") return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [session]);

  const start = useCallback(
    (input: {
      targetType: FocusSession["targetType"];
      targetId: string;
      title: string;
      mode?: FocusSession["mode"];
      durationMinutes?: number;
    }) => {
      if (session && (session.targetId !== input.targetId || session.targetType !== input.targetType)) {
        return false;
      }
      const startedAt = new Date().toISOString();
      persist({
        targetType: input.targetType,
        targetId: input.targetId,
        title: input.title,
        mode: input.mode === "pomodoro" ? "pomodoro" : "stopwatch",
        durationMinutes: Math.max(1, Number(input.durationMinutes) || 25),
        startedAt,
        resumedAt: startedAt,
        accumulatedMs: 0,
        status: "running",
      });
      return true;
    },
    [persist, session],
  );

  const pause = useCallback(() => {
    if (!session || session.status !== "running") return;
    persist({
      ...session,
      accumulatedMs: focusElapsedMs(session),
      resumedAt: null,
      status: "paused",
    });
  }, [persist, session]);

  const toggle = useCallback(() => {
    if (!session) return;
    if (session.status === "running") {
      pause();
      return;
    }
    persist({
      ...session,
      resumedAt: new Date().toISOString(),
      status: "running",
    });
  }, [pause, persist, session]);

  const clear = useCallback(() => persist(null), [persist]);

  return { session, now, start, toggle, pause, clear };
}
