"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CloudCog,
  DatabaseBackup,
  Download,
  FlaskConical,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Health = {
  generatedAt: string;
  score: number;
  status: "healthy" | "attention" | "risk";
  warnings: string[];
  database: {
    tables: number;
    rows: number;
    foreignKeyIssueCount: number;
  };
  files: {
    referenced: number;
    checked: number;
    available: number;
    missing: number;
  };
  backup: null | {
    createdAt: string;
    ageHours: number | null;
    rowCount: number;
    fileCount: number;
    failedHistoryCount: number;
  };
  sync: {
    receipts: number;
    conflicts: number;
    failed: number;
    lastProcessedAt: string | null;
  };
  ai: {
    tasks: number;
    failed: number;
    running: number;
    lastFinishedAt: string | null;
  };
};

type DemoState = {
  active: boolean;
  count: number;
  safety?: string;
};

type AiTask = {
  id: string;
  mode: string;
  prompt: string;
  status: string;
  provider: string;
  model: string;
  sourceIds: string[];
  error: string;
  createdAt: string;
  finishedAt: string | null;
  transparency?: {
    sourceCount: number;
    confidence: number;
    estimatedTokens: number;
    costLabel: string;
    durationMs: number | null;
    fallback: boolean;
  };
};

function dateText(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "暂无" : date.toLocaleString("zh-CN");
}

export function ReliabilityCenter({
  onNotice,
  onWorkspaceReload,
}: {
  onNotice: (message: string) => void;
  onWorkspaceReload: () => Promise<void>;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [demo, setDemo] = useState<DemoState>({ active: false, count: 0 });
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [healthResponse, demoResponse, tasksResponse] = await Promise.all([
      fetch("/api/health", { cache: "no-store" }),
      fetch("/api/demo", { cache: "no-store" }),
      fetch("/api/ai/tasks", { cache: "no-store" }),
    ]);
    const healthResult = (await healthResponse.json()) as {
      health?: Health;
      error?: string;
    };
    const demoResult = (await demoResponse.json()) as DemoState & { error?: string };
    const tasksResult = (await tasksResponse.json()) as {
      tasks?: AiTask[];
      error?: string;
    };
    if (!healthResponse.ok || !healthResult.health) {
      throw new Error(healthResult.error || "数据健康检查失败。");
    }
    setHealth(healthResult.health);
    if (demoResponse.ok) setDemo(demoResult);
    if (tasksResponse.ok) setTasks(tasksResult.tasks ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        onNotice(error instanceof Error ? error.message : "可靠性中心读取失败。"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, onNotice]);

  async function runHealth(action: "scan" | "backup" | "drill") {
    setBusy(action);
    try {
      const response = await fetch("/api/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as {
        health?: Health;
        drill?: { completed?: boolean; files?: number; checksum?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "可靠性操作失败。");
      if (result.health) setHealth(result.health);
      onNotice(
        action === "backup"
          ? "私有云端快照已检查并保存。"
          : action === "drill"
            ? `只读恢复演练通过：校验 ${result.drill?.files ?? 0} 个备份附件，未改动正式数据。`
            : "数据健康检查已完成。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "可靠性操作失败。");
    } finally {
      setBusy("");
    }
  }

  async function demoAction(action: "seed" | "reset") {
    if (
      action === "reset" &&
      !window.confirm(
        "只会删除带 demo-v13- 前缀的虚构演示数据，真实记录不会被删除。确定重置吗？",
      )
    ) {
      return;
    }
    setBusy(`demo-${action}`);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          confirmation: action === "reset" ? "RESET DEMO" : undefined,
        }),
      });
      const result = (await response.json()) as DemoState & {
        removed?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "演示模式操作失败。");
      setDemo(result);
      await Promise.all([load(), onWorkspaceReload()]);
      onNotice(
        action === "seed"
          ? `已加入 ${result.count} 条虚构演示内容，可以放心体验各模块。`
          : `演示数据已重置，共清理 ${result.removed ?? 0} 条；真实内容未改动。`,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "演示模式操作失败。");
    } finally {
      setBusy("");
    }
  }

  function exportReport() {
    if (!health) return;
    const blob = new Blob([JSON.stringify(health, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `richangyu-health-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice("数据健康报告已经下载。");
  }

  const scoreLabel =
    health?.status === "healthy"
      ? "状态良好"
      : health?.status === "attention"
        ? "建议处理"
        : "需要关注";

  return (
    <>
      <section className="settings-card reliability-card">
        <div className="panel-heading">
          <span className="heading-icon green">
            <Activity size={17} />
          </span>
          <div>
            <h3>数据健康与恢复演练</h3>
            <p>检查数据库、附件、备份、同步和 AI 队列</p>
          </div>
        </div>

        {health ? (
          <>
            <div className={`health-score ${health.status}`}>
              <strong>{health.score}</strong>
              <span>
                <b>{scoreLabel}</b>
                <small>上次检查 {dateText(health.generatedAt)}</small>
              </span>
              {health.status === "healthy" ? (
                <CheckCircle2 size={24} />
              ) : (
                <AlertTriangle size={24} />
              )}
            </div>
            <div className="health-metrics">
              <span>
                <HardDrive size={15} />
                <b>{health.database.rows}</b> 行数据
              </span>
              <span>
                <ShieldCheck size={15} />
                <b>{health.files.available}/{health.files.referenced}</b> 附件可用
              </span>
              <span>
                <CloudCog size={15} />
                <b>{health.sync.failed + health.sync.conflicts}</b> 同步问题
              </span>
              <span>
                <Bot size={15} />
                <b>{health.ai.failed}</b> AI 失败任务
              </span>
            </div>
            {health.warnings.length > 0 && (
              <div className="health-warnings" role="status">
                {health.warnings.map((warning) => (
                  <span key={warning}>
                    <AlertTriangle size={14} /> {warning}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="health-loading">
            <LoaderCircle className="spin" size={18} /> 正在进行只读检查…
          </div>
        )}

        <div className="reliability-actions">
          <button onClick={() => void runHealth("scan")} disabled={Boolean(busy)}>
            <RefreshCw className={busy === "scan" ? "spin" : ""} size={15} />
            重新体检
          </button>
          <button onClick={() => void runHealth("backup")} disabled={Boolean(busy)}>
            <DatabaseBackup size={15} /> 创建云端快照
          </button>
          <button onClick={() => void runHealth("drill")} disabled={Boolean(busy)}>
            <FlaskConical size={15} /> 恢复演练
          </button>
          <button onClick={exportReport} disabled={!health}>
            <Download size={15} /> 下载报告
          </button>
        </div>
        <p className="reliability-note">
          恢复演练只读取并校验最近快照的清单、校验和与附件副本，不会把备份写回正式数据。
        </p>
      </section>

      <section className="settings-card demo-card">
        <div className="panel-heading">
          <span className="heading-icon purple">
            <Sparkles size={17} />
          </span>
          <div>
            <h3>安全演示模式</h3>
            <p>用虚构内容体验时间表、表格、财务、兼职和饮食</p>
          </div>
        </div>
        <div className="demo-status">
          <span className={demo.active ? "active" : ""} />
          <div>
            <strong>{demo.active ? "演示数据已开启" : "尚未加入演示数据"}</strong>
            <small>
              {demo.active
                ? `当前有 ${demo.count} 条核心演示内容`
                : "适合第一次使用或录制讲解时快速填充页面"}
            </small>
          </div>
        </div>
        <p className="settings-explainer">
          演示人物、金额与经历均为虚构。重置时只清理带固定演示前缀的数据，不会触碰你的真实记录。
        </p>
        <div className="reliability-actions">
          <button
            onClick={() => void demoAction("seed")}
            disabled={Boolean(busy)}
          >
            <Sparkles size={15} />
            {demo.active ? "重新生成演示" : "一键加入演示"}
          </button>
          {demo.active && (
            <button
              className="danger-soft"
              onClick={() => void demoAction("reset")}
              disabled={Boolean(busy)}
            >
              <RotateCcw size={15} /> 安全重置演示
            </button>
          )}
        </div>
      </section>

      <section className="settings-card ai-transparency-card">
        <div className="panel-heading">
          <span className="heading-icon amber">
            <Bot size={17} />
          </span>
          <div>
            <h3>AI 运行透明度</h3>
            <p>查看模型、来源、可信度、耗时、费用说明与失败原因</p>
          </div>
        </div>
        <div className="ai-task-list">
          {tasks.slice(0, 5).map((task) => (
            <article key={task.id}>
              <span className={`ai-task-state ${task.status}`} />
              <div>
                <strong>{task.prompt || `${task.mode} 自动总结`}</strong>
                <small>
                  {task.provider || "等待分配"} · {task.model || "尚未运行"} ·{" "}
                  {task.transparency?.sourceCount ?? task.sourceIds.length} 条来源
                </small>
                <small>
                  可信度{" "}
                  {Math.round((task.transparency?.confidence ?? 0) * 100)}% ·{" "}
                  {task.transparency?.estimatedTokens ?? 0} 估算 tokens ·{" "}
                  {task.transparency?.costLabel ?? "费用未知"}
                </small>
                {task.error && <em>{task.error}</em>}
              </div>
            </article>
          ))}
          {!tasks.length && (
            <div className="ai-task-empty">
              <Bot size={21} />
              <span>还没有 AI 任务；运行一次生活问询后会显示完整来源信息。</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
