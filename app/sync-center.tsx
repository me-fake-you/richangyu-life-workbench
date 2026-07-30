"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
  CloudOff,
  CopyPlus,
  Download,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  discardOfflineMutation,
  duplicateConflictAsNew,
  flushOfflineMutations,
  exportOfflineQueue,
  getOfflineDiagnostics,
  getDeviceId,
  listOfflineMutations,
  retryOfflineMutation,
  subscribeToSyncChanges,
  type OfflineMutation,
  type OfflineDiagnostics,
} from "./offline-sync";

type ServerState = {
  latestBackup?: {
    status?: string;
    createdAt?: string;
    rowCount?: number;
    fileCount?: number;
  } | null;
  diagnostics?: {
    receipts: number;
    devices: number;
    processed: number;
    conflicts: number;
    failed: number;
    lastProcessedAt: string | null;
  };
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateText(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "暂无" : date.toLocaleString("zh-CN");
}

function actionLabel(action: OfflineMutation["action"]) {
  if (action === "event.create") return "新建生活记录";
  if (action === "event.update") return "编辑生活记录";
  return "新增收件箱内容";
}

export function SyncCenter({
  onSynced,
  onNotice,
}: {
  onSynced: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<OfflineMutation[]>([]);
  const [server, setServer] = useState<ServerState | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<OfflineDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    const connected = window.navigator.onLine;
    setOnline(connected);
    const [nextRows, nextDiagnostics] = await Promise.all([
      listOfflineMutations(),
      getOfflineDiagnostics(),
    ]);
    setRows(nextRows);
    setDiagnostics(nextDiagnostics);
    if (!connected) {
      setServer(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/sync?deviceId=${encodeURIComponent(getDeviceId())}`,
        { cache: "no-store" },
      );
      if (response.ok) setServer((await response.json()) as ServerState);
    } catch {
      setServer(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const unsubscribe = subscribeToSyncChanges(() => void refresh());
    const connectionChanged = () => void refresh();
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
    };
  }, [refresh]);

  async function syncNow() {
    setLoading(true);
    try {
      const result = await flushOfflineMutations();
      if (result.processed) await onSynced();
      onNotice(
        result.conflicts || result.failed
          ? `同步完成，仍有 ${result.conflicts + result.failed} 条需要确认。`
          : result.processed
            ? `已同步 ${result.processed} 条本机更改。`
            : "当前没有等待同步的内容。",
      );
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "同步失败。");
    } finally {
      setLoading(false);
    }
  }

  const issues = rows.filter((item) => item.status !== "pending");
  const pending = rows.filter((item) => item.status === "pending");

  async function retryAllFailed() {
    const failed = rows.filter((item) => item.status === "failed");
    for (const item of failed) await retryOfflineMutation(item.id);
    await syncNow();
  }

  async function downloadDiagnostics() {
    const report = await exportOfflineQueue();
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `richangyu-sync-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice("同步诊断报告已经下载，报告不包含照片原文件。");
  }

  return (
    <section className="settings-card sync-center-card">
      <div className="panel-heading">
        <span className="heading-icon green">
          {online ? <CloudCog size={17} /> : <CloudOff size={17} />}
        </span>
        <div>
          <h3>跨设备同步中心</h3>
          <p>云端数据、离线队列与冲突处理</p>
        </div>
      </div>

      <div className="sync-summary">
        <span>
          {online ? <CheckCircle2 size={16} /> : <CloudOff size={16} />}
          {online ? "已连接云端" : "当前离线"}
        </span>
        <span>{pending.length} 条待同步</span>
        <span>{issues.length} 条待确认</span>
      </div>

      <p className="settings-explainer">
        手机和电脑登录同一 Sites 账号后会读取同一份云端数据。断网时的文字记录先保存在本机，恢复网络后自动上传。
      </p>

      {diagnostics && (
        <div className="sync-diagnostics" aria-label="同步诊断">
          <span>
            <b>本机</b>
            {diagnostics.deviceId.slice(0, 8)}
          </span>
          <span>
            <b>网络</b>
            {diagnostics.network.effectiveType}
            {diagnostics.network.saveData ? " · 省流量" : ""}
          </span>
          <span>
            <b>离线附件</b>
            {diagnostics.assetCount} 个 · {fileSize(diagnostics.assetBytes)}
          </span>
          <span>
            <b>最早等待</b>
            {dateText(diagnostics.oldestQueuedAt)}
          </span>
          <span>
            <b>本机上次成功</b>
            {dateText(diagnostics.lastSyncedAt)}
          </span>
          <span>
            <b>云端回执</b>
            {server?.diagnostics?.receipts ?? 0} 条 ·{" "}
            {server?.diagnostics?.devices ?? 0} 台设备
          </span>
        </div>
      )}

      {issues.length > 0 && (
        <div className="sync-issue-list">
          {issues.map((item) => (
            <article key={item.id}>
              <AlertTriangle size={17} />
              <div>
                <strong>{actionLabel(item.action)}</strong>
                <small>{item.error || "需要重新同步"}</small>
                {item.serverCurrent && (
                  <small>
                    云端版本：
                    {String(
                      item.serverCurrent.title ||
                        item.serverCurrent.content ||
                        "无标题",
                    )}
                  </small>
                )}
              </div>
              <div className="sync-issue-actions">
                {item.status === "failed" && (
                  <button
                    onClick={async () => {
                      await retryOfflineMutation(item.id);
                      await syncNow();
                    }}
                  >
                    <RefreshCw size={13} /> 重试
                  </button>
                )}
                {item.status === "conflict" &&
                  item.action === "event.update" && (
                    <button
                      onClick={async () => {
                        await duplicateConflictAsNew(item.id);
                        await syncNow();
                      }}
                    >
                      <CopyPlus size={13} /> 本机另存
                    </button>
                  )}
                <button
                  className="danger"
                  onClick={async () => {
                    await discardOfflineMutation(item.id);
                    await refresh();
                    onNotice("已保留云端版本并丢弃这次本机更改。");
                  }}
                >
                  <Trash2 size={13} /> 丢弃
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="data-actions">
        <button
          onClick={() => void syncNow()}
          disabled={loading || !online}
        >
          <RefreshCw className={loading ? "spin" : ""} size={16} />
          <span>
            <strong>{loading ? "正在同步" : "立即检查并同步"}</strong>
            <small>
              {server?.latestBackup?.createdAt
                ? `最近备份：${new Date(
                    server.latestBackup.createdAt,
                  ).toLocaleString("zh-CN")}`
                : "同时检查云端连接和本机离线队列"}
            </small>
          </span>
        </button>
        {issues.some((item) => item.status === "failed") && (
          <button onClick={() => void retryAllFailed()} disabled={loading || !online}>
            <RefreshCw size={16} />
            <span>
              <strong>重试全部失败项</strong>
              <small>冲突项仍需逐条确认，避免覆盖另一台设备</small>
            </span>
          </button>
        )}
        <button onClick={() => void downloadDiagnostics()}>
          <Download size={16} />
          <span>
            <strong>导出同步诊断</strong>
            <small>保存离线队列与附件元数据，便于排查弱网问题</small>
          </span>
        </button>
      </div>
    </section>
  );
}
