"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileArchive,
  FileJson,
  History,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

type BackupPreview = {
  createdAt: string;
  includePrivate: boolean;
  supportedTables: number;
  unsupportedTables: number;
  supportedRows: number;
  unsupportedRows: number;
  conflicts: number;
  files: number;
  fileBytes: number;
  warnings: string[];
  tables: Array<{
    table: string;
    rows: number;
    conflicts: number;
    supported: boolean;
  }>;
};

type BackupOperation = {
  id: string;
  operationType: string;
  scope: string;
  filename: string;
  status: string;
  tableCount: number;
  rowCount: number;
  fileCount: number;
  includePrivate: boolean;
  strategy: string;
  note: string;
  createdAt: string;
};

function fileSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function DataPortabilityCenter({
  onNotice,
  onOpenLegacyImport,
  onRestored,
}: {
  onNotice: (notice: string) => void;
  onOpenLegacyImport: () => void;
  onRestored: () => Promise<void>;
}) {
  const [includePrivate, setIncludePrivate] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [strategy, setStrategy] = useState<"skip" | "overwrite">("skip");
  const [busy, setBusy] = useState("");
  const [operations, setOperations] = useState<BackupOperation[]>([]);

  async function loadHistory() {
    const response = await fetch("/api/backup?format=history", {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      operations?: BackupOperation[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || "读取备份历史失败。");
    setOperations(result.operations ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/backup?format=history", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          operations?: BackupOperation[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "读取备份历史失败。");
        }
        if (!cancelled) setOperations(result.operations ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          onNotice(error instanceof Error ? error.message : "读取备份历史失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onNotice]);

  function download(format: "json" | "tar") {
    if (
      includePrivate &&
      !window.confirm(
        "这个备份会包含私密空间和敏感财务记录。请只保存到你信任的设备，确定继续吗？",
      )
    ) {
      return;
    }
    const url = `/api/backup?format=${format}&includePrivate=${includePrivate}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    onNotice(
      format === "tar"
        ? "完整备份正在下载，包含附件和照片，请等待浏览器完成。"
        : "元数据备份正在下载。",
    );
    window.setTimeout(() => void loadHistory().catch(() => undefined), 1800);
  }

  async function inspect(file: File) {
    setBackupFile(file);
    setPreview(null);
    setBusy("preview");
    try {
      const form = new FormData();
      form.set("action", "preview");
      form.set("backup", file);
      const response = await fetch("/api/backup", { method: "POST", body: form });
      const result = (await response.json()) as {
        preview?: BackupPreview;
        error?: string;
      };
      if (!response.ok || !result.preview) {
        throw new Error(result.error || "备份预检失败。");
      }
      setPreview(result.preview);
      onNotice("备份预检完成，尚未写入任何数据。");
    } catch (error) {
      setBackupFile(null);
      onNotice(error instanceof Error ? error.message : "备份预检失败。");
    } finally {
      setBusy("");
    }
  }

  async function restore() {
    if (!backupFile || !preview) return;
    const message =
      strategy === "overwrite"
        ? `将恢复 ${preview.supportedRows} 行数据，并用备份覆盖相同主键的现有记录。此操作会改变已有数据，确定继续吗？`
        : `将合并 ${preview.supportedRows} 行数据；${preview.conflicts} 行冲突记录会保留现有版本。确定继续吗？`;
    if (!window.confirm(message)) return;
    setBusy("restore");
    try {
      const form = new FormData();
      form.set("action", "restore");
      form.set("backup", backupFile);
      form.set("strategy", strategy);
      form.set("confirmation", "RESTORE");
      const response = await fetch("/api/backup", { method: "POST", body: form });
      const result = (await response.json()) as {
        restored?: { rows: number; files: number };
        skipped?: { rows: number; files: number };
        missingFiles?: number;
        error?: string;
      };
      if (!response.ok || !result.restored) {
        throw new Error(result.error || "恢复失败。");
      }
      await Promise.all([loadHistory(), onRestored()]);
      setBackupFile(null);
      setPreview(null);
      onNotice(
        `恢复完成：写入 ${result.restored.rows} 行、${result.restored.files} 个文件；跳过 ${result.skipped?.rows ?? 0} 行。`,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "恢复备份失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="portability-center">
      <div className="portability-heading">
        <div>
          <span className="heading-icon green">
            <DatabaseBackup size={18} />
          </span>
          <div>
            <h3>数据备份与恢复</h3>
            <p>版本化导出全部数据；恢复前先预检，不会在选择文件时直接写入。</p>
          </div>
        </div>
        <label className="private-backup-toggle">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(event) => setIncludePrivate(event.target.checked)}
          />
          <span>
            <ShieldCheck size={15} />
            包含私密与敏感数据
          </span>
        </label>
      </div>

      <div className="backup-choice-grid">
        <button onClick={() => download("json")}>
          <span className="backup-choice-icon purple">
            <FileJson size={23} />
          </span>
          <span>
            <strong>元数据备份</strong>
            <small>JSON；适合频繁保存，包含所有模块数据，不含附件原文件</small>
          </span>
          <Download size={17} />
        </button>
        <button onClick={() => download("tar")}>
          <span className="backup-choice-icon green">
            <FileArchive size={23} />
          </span>
          <span>
            <strong>完整可移植备份</strong>
            <small>TAR；同时包含照片、票据、资料附件和结构化数据</small>
          </span>
          <Archive size={17} />
        </button>
      </div>

      <div className="restore-area">
        <div className="restore-heading">
          <div>
            <RotateCcw size={18} />
            <span>
              <strong>恢复或迁移</strong>
              <small>支持日常屿 JSON 元数据和完整 TAR 备份包</small>
            </span>
          </div>
          <button onClick={onOpenLegacyImport}>
            导入 CSV / Markdown / 日历 <ChevronRight size={14} />
          </button>
        </div>
        <label className={`backup-drop ${busy === "preview" ? "busy" : ""}`}>
          {busy === "preview" ? (
            <LoaderCircle className="spin" size={26} />
          ) : (
            <Upload size={26} />
          )}
          <span>
            <strong>{backupFile?.name || "选择备份包进行预检"}</strong>
            <small>
              {backupFile
                ? `${fileSize(backupFile.size)} · 预检不会修改当前数据`
                : "选择 .json 或 .tar 文件"}
            </small>
          </span>
          <input
            type="file"
            accept=".json,.tar,application/json,application/x-tar"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file);
              event.target.value = "";
            }}
          />
        </label>

        {preview && (
          <div className="restore-preview">
            <header>
              <span>
                <CheckCircle2 size={17} /> 预检通过
              </span>
              <small>备份创建于 {dateText(preview.createdAt)}</small>
            </header>
            <div className="restore-preview-stats">
              <span>
                <strong>{preview.supportedTables}</strong> 张数据表
              </span>
              <span>
                <strong>{preview.supportedRows}</strong> 行数据
              </span>
              <span>
                <strong>{preview.files}</strong> 个附件
              </span>
              <span>
                <strong>{fileSize(preview.fileBytes)}</strong> 文件体积
              </span>
              <span>
                <strong>{preview.conflicts}</strong> 行冲突
              </span>
            </div>
            {preview.warnings.length > 0 && (
              <div className="restore-warnings">
                <AlertTriangle size={16} />
                <span>{preview.warnings.join("；")}</span>
              </div>
            )}
            <div className="restore-strategy">
              <label>
                <input
                  type="radio"
                  checked={strategy === "skip"}
                  onChange={() => setStrategy("skip")}
                />
                <span>
                  <strong>安全合并（推荐）</strong>
                  <small>相同主键保留当前版本，只加入缺失数据</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={strategy === "overwrite"}
                  onChange={() => setStrategy("overwrite")}
                />
                <span>
                  <strong>以备份覆盖冲突</strong>
                  <small>用于回滚到备份内容，现有同主键数据会改变</small>
                </span>
              </label>
            </div>
            <button
              className="restore-confirm"
              onClick={() => void restore()}
              disabled={busy === "restore"}
            >
              {busy === "restore" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              确认恢复
            </button>
          </div>
        )}
      </div>

      <div className="backup-history">
        <header>
          <span>
            <History size={16} /> 最近操作
          </span>
          <small>记录备份与恢复结果，不保存密钥</small>
        </header>
        {operations.length ? (
          operations.slice(0, 6).map((operation) => (
            <article key={operation.id}>
              <span
                className={`backup-history-mark ${operation.operationType}`}
              >
                {operation.operationType === "restore" ? (
                  <RotateCcw size={14} />
                ) : (
                  <Download size={14} />
                )}
              </span>
              <span>
                <strong>
                  {operation.operationType === "restore" ? "恢复" : "备份"} ·{" "}
                  {operation.scope === "full" ? "完整包" : "元数据"}
                </strong>
                <small>
                  {operation.rowCount} 行 · {operation.fileCount} 个文件 ·{" "}
                  {dateText(operation.createdAt)}
                </small>
              </span>
              {operation.includePrivate && <em>含私密</em>}
            </article>
          ))
        ) : (
          <p className="backup-history-empty">
            完成第一次正式备份后，操作记录会显示在这里。
          </p>
        )}
      </div>
    </section>
  );
}
