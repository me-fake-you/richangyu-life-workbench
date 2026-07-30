"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  LoaderCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  flushOfflineMutations,
  listOfflineMutations,
  subscribeToSyncChanges,
} from "./offline-sync";

type SyncState = {
  online: boolean;
  pending: number;
  conflicts: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: string | null;
};

export function SyncStatus({
  onSynced,
  onNotice,
}: {
  onSynced: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [state, setState] = useState<SyncState>({
    online: true,
    pending: 0,
    conflicts: 0,
    failed: 0,
    syncing: false,
    lastSyncedAt: null,
  });

  const refresh = useCallback(async () => {
    const rows = await listOfflineMutations();
    setState((current) => ({
      ...current,
      online: window.navigator.onLine,
      pending: rows.filter((item) => item.status === "pending").length,
      conflicts: rows.filter((item) => item.status === "conflict").length,
      failed: rows.filter((item) => item.status === "failed").length,
      lastSyncedAt: window.localStorage.getItem("richangyu-last-synced-at"),
    }));
  }, []);

  const flush = useCallback(async () => {
    if (!window.navigator.onLine) {
      await refresh();
      return;
    }
    const rows = await listOfflineMutations();
    if (!rows.some((item) => item.status === "pending")) {
      await refresh();
      return;
    }
    setState((current) => ({ ...current, syncing: true, online: true }));
    try {
      const result = await flushOfflineMutations();
      if (result.processed > 0) {
        await onSynced();
        onNotice(`已同步 ${result.processed} 条离线记录。`);
      }
      if (result.conflicts > 0) {
        onNotice(`${result.conflicts} 条记录存在跨设备冲突，请到同步中心处理。`);
      }
    } catch {
      // The pending queue stays on the device for the next retry.
    } finally {
      await refresh();
      setState((current) => ({ ...current, syncing: false }));
    }
  }, [onNotice, onSynced, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh().then(flush), 0);
    const unsubscribe = subscribeToSyncChanges(() => void refresh());
    const online = () => void refresh().then(flush);
    const offline = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(() => void flush(), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush, refresh]);

  const issueCount = state.conflicts + state.failed;
  const title = !state.online
    ? `离线模式${state.pending ? ` · ${state.pending} 条待同步` : ""}`
    : state.syncing
      ? "正在同步…"
      : issueCount
        ? `${issueCount} 条需要处理`
        : state.pending
          ? `${state.pending} 条等待同步`
          : "云端已同步";
  const Icon = !state.online
    ? CloudOff
    : state.syncing
      ? LoaderCircle
      : issueCount
        ? AlertTriangle
        : state.pending
          ? Cloud
          : CheckCircle2;

  return (
    <button
      className={`global-sync-status ${
        !state.online
          ? "offline"
          : issueCount
            ? "warning"
            : state.syncing
              ? "syncing"
              : "synced"
      }`}
      onClick={() => void flush()}
      title={
        state.lastSyncedAt
          ? `最近同步：${new Date(state.lastSyncedAt).toLocaleString("zh-CN")}`
          : "点击检查离线队列"
      }
    >
      <Icon className={state.syncing ? "spin" : ""} size={15} />
      <span>{title}</span>
    </button>
  );
}
