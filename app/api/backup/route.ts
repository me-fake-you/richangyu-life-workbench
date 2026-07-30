import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings } from "../../../lib/life-store";
import { isPrivateVaultUnlocked } from "../../../lib/private-vault";

type JsonObject = Record<string, unknown>;

type BackupFile = {
  table: string;
  rowId: string;
  objectKey: string;
  path: string;
  filename: string;
  contentType: string;
  size: number;
};

export type BackupBundle = {
  format: "richangyu-backup";
  schemaVersion: 1;
  app: "日常屿·生活工作台";
  createdAt: string;
  includePrivate: boolean;
  tables: Record<string, JsonObject[]>;
  files: BackupFile[];
  counts: {
    tables: number;
    rows: number;
    files: number;
    fileBytes: number;
  };
};

type TableInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_RESTORE_SIZE = 500 * 1024 * 1024;
const fileTables = new Set([
  "media",
  "inbox_attachments",
  "meal_media",
  "finance_documents",
  "application_documents",
]);
const sensitiveTables = new Set([
  "record_drafts",
  "client_mutations",
  "audit_logs",
  "private_vault_settings",
  "financial_accounts",
  "finance_transactions",
  "finance_documents",
  "finance_budgets",
  "savings_goals",
  "recurring_transactions",
  "finance_settings",
  "side_hustle_clients",
  "side_hustle_projects",
  "work_sessions",
  "receivables",
  "settlements",
  "meals",
  "meal_items",
  "meal_media",
  "nutrition_settings",
  "water_logs",
  "job_applications",
  "application_events",
  "application_documents",
]);

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
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

function safeIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`不安全的数据表名称：${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function bindable(value: unknown) {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
  return JSON.stringify(value);
}

async function listTables(DB: D1Database) {
  const result = await DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE '_cf_%'
       AND name NOT IN ('d1_migrations')
     ORDER BY name`,
  ).all<{ name: string }>();
  return result.results
    .map((row) => row.name)
    .filter((name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));
}

async function tableInfo(DB: D1Database, table: string) {
  const result = await DB.prepare(
    `PRAGMA table_info(${safeIdentifier(table)})`,
  ).all<TableInfo>();
  return result.results;
}

function filterPrivateRows(
  tables: Record<string, JsonObject[]>,
  includePrivate: boolean,
) {
  if (includePrivate) return tables;
  const result = { ...tables };
  for (const table of sensitiveTables) {
    if (table in result) result[table] = [];
  }
  result.life_events = (result.life_events ?? []).filter(
    (row) => !Boolean(row.is_private),
  );
  const eventIds = new Set(result.life_events.map((row) => String(row.id)));
  result.life_event_versions = (result.life_event_versions ?? []).filter(
    (row) => eventIds.has(String(row.event_id)),
  );
  result.media = (result.media ?? []).filter((row) =>
    eventIds.has(String(row.event_id)),
  );
  const mediaIds = new Set(result.media.map((row) => String(row.id)));
  result.photo_insights = (result.photo_insights ?? []).filter((row) =>
    mediaIds.has(String(row.media_id)),
  );
  result.photo_metadata = (result.photo_metadata ?? []).filter((row) =>
    mediaIds.has(String(row.media_id)),
  );
  result.life_relations = (result.life_relations ?? []).filter((row) =>
    eventIds.has(String(row.from_event_id)),
  );
  return result;
}

function extension(filename: string) {
  const match = filename.match(/(\.[a-zA-Z0-9]{1,10})$/);
  return match ? match[1].toLowerCase() : "";
}

function collectFiles(tables: Record<string, JsonObject[]>) {
  const files: BackupFile[] = [];
  for (const table of fileTables) {
    for (const row of tables[table] ?? []) {
      const objectKey = text(row.object_key, 1000);
      if (!objectKey) continue;
      const rowId = text(row.id, 120);
      const filename = text(row.filename, 300) || `${rowId}.bin`;
      files.push({
        table,
        rowId,
        objectKey,
        path: `files/${table}/${rowId}${extension(filename)}`,
        filename,
        contentType:
          text(row.content_type, 120) || "application/octet-stream",
        size: Math.max(0, Number(row.size) || 0),
      });
    }
  }
  return files;
}

export async function createBackup(
  DB: D1Database,
  includePrivate: boolean,
): Promise<BackupBundle> {
  const tableNames = await listTables(DB);
  const rawTables: Record<string, JsonObject[]> = {};
  for (const table of tableNames) {
    if (table === "backup_operations") continue;
    const result = await DB.prepare(
      `SELECT * FROM ${safeIdentifier(table)}`,
    ).all<JsonObject>();
    rawTables[table] = result.results;
  }
  const tables = filterPrivateRows(rawTables, includePrivate);
  const files = collectFiles(tables);
  const rowCount = Object.values(tables).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );
  return {
    format: "richangyu-backup",
    schemaVersion: 1,
    app: "日常屿·生活工作台",
    createdAt: new Date().toISOString(),
    includePrivate,
    tables,
    files,
    counts: {
      tables: Object.keys(tables).length,
      rows: rowCount,
      files: files.length,
      fileBytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  };
}

function writeAscii(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
) {
  const bytes = encoder.encode(value);
  target.set(bytes.slice(0, length), offset);
}

function octal(value: number, length: number) {
  return Math.max(0, Math.floor(value))
    .toString(8)
    .padStart(length - 1, "0")
    .slice(-(length - 1))
    .concat("\0");
}

function tarHeader(name: string, size: number, modifiedAt = Date.now()) {
  const header = new Uint8Array(512);
  writeAscii(header, 0, 100, name);
  writeAscii(header, 100, 8, octal(0o644, 8));
  writeAscii(header, 108, 8, octal(0, 8));
  writeAscii(header, 116, 8, octal(0, 8));
  writeAscii(header, 124, 12, octal(size, 12));
  writeAscii(header, 136, 12, octal(Math.floor(modifiedAt / 1000), 12));
  for (let index = 148; index < 156; index += 1) header[index] = 32;
  header[156] = "0".charCodeAt(0);
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 265, 32, "richangyu");
  writeAscii(header, 297, 32, "richangyu");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function padding(size: number) {
  const remainder = size % 512;
  return remainder ? new Uint8Array(512 - remainder) : null;
}

function backupTarStream(bundle: BackupBundle, MEDIA: R2Bucket) {
  const dataBytes = encoder.encode(JSON.stringify(bundle, null, 2));
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(tarHeader("data.json", dataBytes.byteLength));
        controller.enqueue(dataBytes);
        const dataPadding = padding(dataBytes.byteLength);
        if (dataPadding) controller.enqueue(dataPadding);

        for (const file of bundle.files) {
          const object = await MEDIA.get(file.objectKey);
          if (!object) continue;
          const actualSize = file.size;
          controller.enqueue(tarHeader(file.path, actualSize));
          const reader = object.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
          const filePadding = padding(actualSize);
          if (filePadding) controller.enqueue(filePadding);
        }
        controller.enqueue(new Uint8Array(1024));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

function parseTar(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = decoder
      .decode(header.slice(0, 100))
      .replace(/\0.*$/, "")
      .trim();
    const sizeText = decoder
      .decode(header.slice(124, 136))
      .replace(/\0.*$/, "")
      .trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!name || !Number.isFinite(size) || size < 0) {
      throw new Error("备份包结构损坏，无法读取文件目录。");
    }
    const start = offset + 512;
    const end = start + size;
    if (end > bytes.length) {
      throw new Error("备份包不完整，文件内容已被截断。");
    }
    entries.set(name, bytes.slice(start, end));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

async function readBackupFile(file: File) {
  if (file.size > MAX_RESTORE_SIZE) {
    throw new Error("单次恢复包不能超过 500MB，请分批导入照片和数据。");
  }
  if (file.name.toLowerCase().endsWith(".json")) {
    return {
      bundle: JSON.parse(await file.text()) as BackupBundle,
      entries: new Map<string, Uint8Array>(),
    };
  }
  const entries = parseTar(await file.arrayBuffer());
  const data = entries.get("data.json");
  if (!data) throw new Error("备份包缺少 data.json。");
  return {
    bundle: JSON.parse(decoder.decode(data)) as BackupBundle,
    entries,
  };
}

function validateBackup(bundle: BackupBundle) {
  if (
    bundle?.format !== "richangyu-backup" ||
    bundle.schemaVersion !== 1 ||
    !bundle.tables ||
    typeof bundle.tables !== "object"
  ) {
    throw new Error("这不是受支持的日常屿备份包。");
  }
}

async function previewBackup(DB: D1Database, bundle: BackupBundle) {
  const currentTables = new Set(await listTables(DB));
  let supportedRows = 0;
  let unsupportedRows = 0;
  let conflicts = 0;
  const tablePreview: Array<{
    table: string;
    rows: number;
    conflicts: number;
    supported: boolean;
  }> = [];
  for (const [table, rows] of Object.entries(bundle.tables)) {
    const supported = currentTables.has(table);
    if (!supported) {
      unsupportedRows += rows.length;
      tablePreview.push({ table, rows: rows.length, conflicts: 0, supported });
      continue;
    }
    supportedRows += rows.length;
    const info = await tableInfo(DB, table);
    const primaryKeys = info
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    let tableConflicts = 0;
    if (primaryKeys.length === 1 && rows.length) {
      const key = primaryKeys[0];
      const existing = await DB.prepare(
        `SELECT ${safeIdentifier(key)} AS value FROM ${safeIdentifier(table)}`,
      ).all<{ value: unknown }>();
      const values = new Set(existing.results.map((row) => String(row.value)));
      tableConflicts = rows.filter((row) =>
        values.has(String(row[key])),
      ).length;
    }
    conflicts += tableConflicts;
    tablePreview.push({
      table,
      rows: rows.length,
      conflicts: tableConflicts,
      supported,
    });
  }
  return {
    createdAt: bundle.createdAt,
    includePrivate: bundle.includePrivate,
    supportedTables: tablePreview.filter((item) => item.supported).length,
    unsupportedTables: tablePreview.filter((item) => !item.supported).length,
    supportedRows,
    unsupportedRows,
    conflicts,
    files: bundle.files?.length ?? 0,
    fileBytes: bundle.files?.reduce((sum, file) => sum + file.size, 0) ?? 0,
    tables: tablePreview,
    warnings: [
      bundle.includePrivate ? "备份包包含私密记录。" : "",
      unsupportedRows ? `${unsupportedRows} 行来自当前版本未知的数据表，将被跳过。` : "",
      conflicts ? `${conflicts} 行与现有主键相同，需要选择冲突策略。` : "",
    ].filter(Boolean),
  };
}

const restoreOrder = [
  "life_events",
  "life_event_versions",
  "record_drafts",
  "client_mutations",
  "audit_logs",
  "projects",
  "automations",
  "automation_runs",
  "automation_messages",
  "financial_accounts",
  "side_hustle_clients",
  "side_hustle_projects",
  "collections",
  "inbox_items",
  "schedule_events",
  "feed_sources",
  "research_papers",
  "job_organizations",
  "job_postings",
  "job_applications",
  "meals",
  "media",
  "photo_insights",
  "photo_metadata",
  "photo_stories",
  "life_relations",
  "milestones",
  "collection_rows",
  "collection_views",
  "inbox_attachments",
  "schedule_rule_settings",
  "schedule_instances",
  "schedule_exceptions",
  "work_sessions",
  "receivables",
  "finance_transactions",
  "settlements",
  "finance_documents",
  "meal_items",
  "meal_media",
  "feed_items",
  "paper_signals",
  "job_snapshots",
  "job_changes",
  "application_events",
  "application_documents",
];

function orderedTables(tables: string[]) {
  const rank = new Map(restoreOrder.map((table, index) => [table, index]));
  return [...tables].sort(
    (left, right) =>
      (rank.get(left) ?? 1000) - (rank.get(right) ?? 1000) ||
      left.localeCompare(right),
  );
}

async function restoreRows(
  DB: D1Database,
  bundle: BackupBundle,
  strategy: "skip" | "overwrite",
) {
  const currentTables = new Set(await listTables(DB));
  let restored = 0;
  let skipped = 0;
  let unsupported = 0;

  for (const table of orderedTables(Object.keys(bundle.tables))) {
    const rows = bundle.tables[table] ?? [];
    if (!currentTables.has(table) || table === "backup_operations") {
      unsupported += rows.length;
      continue;
    }
    const info = await tableInfo(DB, table);
    const allowedColumns = new Set(info.map((column) => column.name));
    const primaryKeys = info
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    for (const row of rows) {
      const columns = Object.keys(row).filter((column) =>
        allowedColumns.has(column),
      );
      if (!columns.length) {
        skipped += 1;
        continue;
      }
      const quotedColumns = columns.map(safeIdentifier).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      const updateColumns = columns.filter(
        (column) => !primaryKeys.includes(column),
      );
      const conflictClause =
        strategy === "overwrite" && primaryKeys.length && updateColumns.length
          ? ` ON CONFLICT(${primaryKeys
              .map(safeIdentifier)
              .join(", ")}) DO UPDATE SET ${updateColumns
              .map(
                (column) =>
                  `${safeIdentifier(column)} = excluded.${safeIdentifier(column)}`,
              )
              .join(", ")}`
          : "";
      const insertMode =
        strategy === "skip" || !conflictClause ? "INSERT OR IGNORE" : "INSERT";
      const statement = DB.prepare(
        `${insertMode} INTO ${safeIdentifier(table)}
         (${quotedColumns}) VALUES (${placeholders})${conflictClause}`,
      ).bind(...columns.map((column) => bindable(row[column])));
      try {
        const result = await statement.run();
        if (Number(result.meta?.changes) > 0) restored += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { restored, skipped, unsupported };
}

async function restoreFiles(
  MEDIA: R2Bucket,
  bundle: BackupBundle,
  entries: Map<string, Uint8Array>,
  strategy: "skip" | "overwrite",
) {
  let restored = 0;
  let skipped = 0;
  let missing = 0;
  for (const file of bundle.files ?? []) {
    const bytes = entries.get(file.path);
    if (!bytes) {
      missing += 1;
      continue;
    }
    if (strategy === "skip" && (await MEDIA.get(file.objectKey))) {
      skipped += 1;
      continue;
    }
    await MEDIA.put(file.objectKey, bytes.slice().buffer as ArrayBuffer, {
      httpMetadata: { contentType: file.contentType },
      customMetadata: { originalName: file.filename },
    });
    restored += 1;
  }
  return { restored, skipped, missing };
}

export async function logOperation(
  DB: D1Database,
  values: {
    operationType: string;
    scope: string;
    filename: string;
    status?: string;
    tableCount: number;
    rowCount: number;
    fileCount: number;
    includePrivate: boolean;
    strategy?: string;
    note?: string;
  },
) {
  await DB.prepare(
    `INSERT INTO backup_operations
     (id, operation_type, scope, filename, status, table_count, row_count,
      file_count, include_private, strategy, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      values.operationType,
      values.scope,
      values.filename,
      values.status ?? "completed",
      values.tableCount,
      values.rowCount,
      values.fileCount,
      values.includePrivate ? 1 : 0,
      values.strategy ?? "skip",
      values.note ?? "",
    )
    .run();
}

export async function GET(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const url = new URL(request.url);
    const format = text(url.searchParams.get("format"), 20) || "history";
    if (format === "history") {
      const result = await DB.prepare(
        "SELECT * FROM backup_operations ORDER BY created_at DESC LIMIT 50",
      ).all<JsonObject>();
      return Response.json({
        operations: result.results.map((row) => ({
          id: row.id,
          operationType: row.operation_type,
          scope: row.scope,
          filename: row.filename,
          status: row.status,
          tableCount: row.table_count,
          rowCount: row.row_count,
          fileCount: row.file_count,
          includePrivate: Boolean(row.include_private),
          strategy: row.strategy,
          note: row.note,
          createdAt: databaseIso(row.created_at),
        })),
      });
    }

    const includePrivate = boolean(url.searchParams.get("includePrivate"));
    if (includePrivate && !(await isPrivateVaultUnlocked(request, DB))) {
      return Response.json(
        { error: "导出私密内容前需要先解锁私密空间。" },
        { status: 403 },
      );
    }
    const bundle = await createBackup(DB, includePrivate);
    const date = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      const filename = `richangyu-metadata-${date}.json`;
      await logOperation(DB, {
        operationType: "export",
        scope: "metadata",
        filename,
        tableCount: bundle.counts.tables,
        rowCount: bundle.counts.rows,
        fileCount: 0,
        includePrivate,
      });
      return new Response(JSON.stringify(bundle, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "private, no-store",
        },
      });
    }
    if (format !== "tar") {
      return Response.json({ error: "不支持的备份格式。" }, { status: 400 });
    }
    const filename = `richangyu-full-backup-${date}.tar`;
    await logOperation(DB, {
      operationType: "export",
      scope: "full",
      filename,
      tableCount: bundle.counts.tables,
      rowCount: bundle.counts.rows,
      fileCount: bundle.counts.files,
      includePrivate,
    });
    return new Response(backupTarStream(bundle, MEDIA), {
      headers: {
        "content-type": "application/x-tar",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-richangyu-row-count": String(bundle.counts.rows),
        "x-richangyu-file-count": String(bundle.counts.files),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "创建备份失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const action = text(form.get("action"), 30);
    const file = form.get("backup");
    if (!(file instanceof File) || !file.size) {
      return Response.json({ error: "请选择备份文件。" }, { status: 400 });
    }
    const { bundle, entries } = await readBackupFile(file);
    validateBackup(bundle);
    if (
      bundle.includePrivate &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return Response.json(
        { error: "恢复含私密内容的备份前需要先解锁私密空间。" },
        { status: 403 },
      );
    }
    const preview = await previewBackup(DB, bundle);
    if (action === "preview") {
      return Response.json({ preview });
    }
    if (action !== "restore") {
      return Response.json({ error: "不支持的恢复操作。" }, { status: 400 });
    }
    if (text(form.get("confirmation"), 20) !== "RESTORE") {
      return Response.json(
        { error: "恢复确认缺失，请重新确认操作。" },
        { status: 400 },
      );
    }
    const strategy =
      text(form.get("strategy"), 20) === "overwrite" ? "overwrite" : "skip";
    const rowResult = await restoreRows(DB, bundle, strategy);
    const fileResult = await restoreFiles(MEDIA, bundle, entries, strategy);
    await logOperation(DB, {
      operationType: "restore",
      scope: entries.size ? "full" : "metadata",
      filename: file.name,
      tableCount: preview.supportedTables,
      rowCount: rowResult.restored,
      fileCount: fileResult.restored,
      includePrivate: bundle.includePrivate,
      strategy,
      note: `跳过 ${rowResult.skipped} 行、${fileResult.skipped} 个文件；缺失 ${fileResult.missing} 个文件。`,
    });
    return Response.json({
      restored: {
        rows: rowResult.restored,
        files: fileResult.restored,
      },
      skipped: {
        rows: rowResult.skipped,
        files: fileResult.skipped,
      },
      unsupportedRows: rowResult.unsupported,
      missingFiles: fileResult.missing,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "恢复备份失败。",
      },
      { status: 500 },
    );
  }
}
