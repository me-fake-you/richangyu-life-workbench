import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings } from "../../../lib/life-store";
import { createBackup, logOperation } from "../backup/route";
import { POST as createAutomaticSnapshot } from "../backup/snapshot/route";

type JsonObject = Record<string, unknown>;

type FileReference = {
  table_name: string;
  row_id: string;
  object_key: string;
  size: number;
};

function safeIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error("检测到不安全的数据表名称。");
  }
  return `"${value}"`;
}

function databaseIso(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(" ", "T")}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

async function tableOverview(DB: D1Database) {
  const tables = await DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_cf_%'
       AND name NOT IN ('d1_migrations')
     ORDER BY name`,
  ).all<{ name: string }>();
  const rows: Array<{ name: string; rows: number }> = [];
  for (const table of tables.results) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.name)) continue;
    const count = await DB.prepare(
      `SELECT COUNT(*) AS count FROM ${safeIdentifier(table.name)}`,
    ).first<{ count: number }>();
    rows.push({ name: table.name, rows: Number(count?.count) || 0 });
  }
  return rows;
}

async function fileReferences(DB: D1Database) {
  const result = await DB.prepare(
    `SELECT 'media' AS table_name, id AS row_id, object_key, size FROM media
     UNION ALL
     SELECT 'inbox_attachments', id, object_key, size FROM inbox_attachments
     UNION ALL
     SELECT 'meal_media', id, object_key, size FROM meal_media
     UNION ALL
     SELECT 'finance_documents', id, object_key, size FROM finance_documents
     UNION ALL
     SELECT 'application_documents', id, object_key, size FROM application_documents`,
  ).all<FileReference>();
  return result.results;
}

async function scanHealth(DB: D1Database, MEDIA: R2Bucket) {
  const [tables, references, latestBackup, failedBackups, syncReceipts, aiTasks] =
    await Promise.all([
      tableOverview(DB),
      fileReferences(DB),
      DB.prepare(
        `SELECT operation_type, status, filename, row_count, file_count, created_at
         FROM backup_operations
         WHERE status = 'completed'
           AND operation_type IN ('automatic', 'export')
         ORDER BY created_at DESC LIMIT 1`,
      ).first<JsonObject>(),
      DB.prepare(
        `SELECT COUNT(*) AS count FROM backup_operations
         WHERE status != 'completed'`,
      ).first<{ count: number }>(),
      DB.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflicts,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           MAX(processed_at) AS last_processed_at
         FROM client_mutations`,
      ).first<JsonObject>(),
      DB.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
           MAX(finished_at) AS last_finished_at
         FROM ai_tasks`,
      ).first<JsonObject>(),
    ]);

  let foreignKeyIssues: JsonObject[] = [];
  try {
    const foreignKeys = await DB.prepare("PRAGMA foreign_key_check").all<JsonObject>();
    foreignKeyIssues = foreignKeys.results.slice(0, 100);
  } catch {
    foreignKeyIssues = [];
  }

  const missingFiles: FileReference[] = [];
  let checkedFiles = 0;
  for (let offset = 0; offset < references.length; offset += 6) {
    const group = references.slice(offset, offset + 6);
    const results = await Promise.all(
      group.map(async (reference) => ({
        reference,
        exists: Boolean(await MEDIA.get(reference.object_key)),
      })),
    );
    for (const result of results) {
      checkedFiles += 1;
      if (!result.exists) missingFiles.push(result.reference);
    }
  }

  const latestCreatedAt = databaseIso(latestBackup?.created_at);
  const latestTime = latestCreatedAt ? new Date(latestCreatedAt).getTime() : 0;
  const backupAgeHours = latestTime
    ? Math.max(0, Math.round((Date.now() - latestTime) / 3_600_000))
    : null;
  const warnings: string[] = [];
  if (!latestBackup) warnings.push("还没有可验证的备份。");
  else if ((backupAgeHours ?? 0) > 72) warnings.push("最近一次备份已超过 72 小时。");
  if (missingFiles.length) warnings.push(`${missingFiles.length} 个附件引用找不到原文件。`);
  if (foreignKeyIssues.length) warnings.push(`${foreignKeyIssues.length} 条数据关联不完整。`);
  if (Number(failedBackups?.count) > 0) warnings.push("备份历史中存在失败记录。");

  const score = Math.max(
    0,
    100 -
      (latestBackup ? 0 : 25) -
      ((backupAgeHours ?? 0) > 72 ? 10 : 0) -
      Math.min(35, missingFiles.length * 10) -
      Math.min(20, foreignKeyIssues.length * 5) -
      Math.min(10, Number(failedBackups?.count) * 2),
  );

  return {
    generatedAt: new Date().toISOString(),
    score,
    status: score >= 90 ? "healthy" : score >= 70 ? "attention" : "risk",
    warnings,
    database: {
      tables: tables.length,
      rows: tables.reduce((sum, table) => sum + table.rows, 0),
      largestTables: [...tables].sort((a, b) => b.rows - a.rows).slice(0, 8),
      foreignKeyIssueCount: foreignKeyIssues.length,
      foreignKeyIssues,
    },
    files: {
      referenced: references.length,
      checked: checkedFiles,
      available: references.length - missingFiles.length,
      missing: missingFiles.length,
      missingItems: missingFiles.slice(0, 20).map((item) => ({
        table: item.table_name,
        rowId: item.row_id,
        objectKey: item.object_key,
      })),
    },
    backup: latestBackup
      ? {
          operationType: latestBackup.operation_type,
          status: latestBackup.status,
          filename: latestBackup.filename,
          rowCount: Number(latestBackup.row_count) || 0,
          fileCount: Number(latestBackup.file_count) || 0,
          createdAt: latestCreatedAt,
          ageHours: backupAgeHours,
          failedHistoryCount: Number(failedBackups?.count) || 0,
        }
      : null,
    sync: {
      receipts: Number(syncReceipts?.total) || 0,
      conflicts: Number(syncReceipts?.conflicts) || 0,
      failed: Number(syncReceipts?.failed) || 0,
      lastProcessedAt: syncReceipts?.last_processed_at ?? null,
    },
    ai: {
      tasks: Number(aiTasks?.total) || 0,
      failed: Number(aiTasks?.failed) || 0,
      running: Number(aiTasks?.running) || 0,
      lastFinishedAt: aiTasks?.last_finished_at ?? null,
    },
  };
}

async function recoveryDrill(DB: D1Database, MEDIA: R2Bucket) {
  const operation = await DB.prepare(
    `SELECT filename, created_at FROM backup_operations
     WHERE operation_type = 'automatic' AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
  ).first<{ filename: string; created_at: string }>();
  if (!operation) {
    throw new Error("请先创建一次自动快照，再进行恢复演练。");
  }
  const object = await MEDIA.get(operation.filename);
  if (!object) {
    throw new Error("最近备份的清单文件不存在，请重新创建快照。");
  }
  const raw = await new Response(object.body).text();
  const manifest = JSON.parse(raw) as {
    format?: string;
    counts?: { tables?: number; rows?: number; files?: number };
    automaticSnapshot?: {
      copiedFiles?: Array<{ backupObjectKey: string }>;
    };
  };
  if (manifest.format !== "richangyu-backup" || !manifest.counts) {
    throw new Error("备份清单格式校验失败。");
  }
  const copiedFiles = manifest.automaticSnapshot?.copiedFiles ?? [];
  let missingCopies = 0;
  for (let offset = 0; offset < copiedFiles.length; offset += 6) {
    const group = copiedFiles.slice(offset, offset + 6);
    const copies = await Promise.all(
      group.map((file) => MEDIA.get(file.backupObjectKey)),
    );
    missingCopies += copies.filter((copy) => !copy).length;
  }
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const checksum = [...new Uint8Array(hashBuffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const completed = missingCopies === 0;
  await logOperation(DB, {
    operationType: "recovery_drill",
    scope: "full",
    filename: operation.filename,
    status: completed ? "completed" : "failed",
    tableCount: Number(manifest.counts.tables) || 0,
    rowCount: Number(manifest.counts.rows) || 0,
    fileCount: copiedFiles.length,
    includePrivate: true,
    strategy: "dry-run",
    note: completed
      ? `只读恢复演练通过；SHA-256 ${checksum.slice(0, 16)}…`
      : `只读恢复演练发现 ${missingCopies} 个备份附件缺失。`,
  });
  return {
    completed,
    checkedAt: new Date().toISOString(),
    sourceCreatedAt: operation.created_at,
    tables: Number(manifest.counts.tables) || 0,
    rows: Number(manifest.counts.rows) || 0,
    files: copiedFiles.length,
    missingCopies,
    checksum,
    wroteProductionData: false,
  };
}

export async function GET() {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    return Response.json({ health: await scanHealth(DB, MEDIA) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "数据健康检查失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const body = (await request.json().catch(() => ({}))) as JsonObject;
    const action = String(body.action ?? "scan");
    if (action === "scan") {
      return Response.json({ health: await scanHealth(DB, MEDIA) });
    }
    if (action === "backup") {
      const response = await createAutomaticSnapshot();
      const result = await response.json();
      return Response.json({ snapshot: result, health: await scanHealth(DB, MEDIA) });
    }
    if (action === "drill") {
      const drill = await recoveryDrill(DB, MEDIA);
      return Response.json({ drill, health: await scanHealth(DB, MEDIA) });
    }
    if (action === "memory-check") {
      const bundle = await createBackup(DB, false);
      return Response.json({
        checkedAt: new Date().toISOString(),
        tables: bundle.counts.tables,
        rows: bundle.counts.rows,
        files: bundle.counts.files,
      });
    }
    return Response.json({ error: "不支持的数据健康操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "数据健康操作失败。" },
      { status: 500 },
    );
  }
}
