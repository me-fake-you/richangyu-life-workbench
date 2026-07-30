import {
  createBackup,
  logOperation,
} from "../route";
import { ensureIntelligenceSchema } from "../../../../lib/intelligence-store";
import { getLifeBindings } from "../../../../lib/life-store";

export async function POST() {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const today = new Date().toISOString().slice(0, 10);
    const existing = await DB.prepare(
      `SELECT id, filename, created_at FROM backup_operations
       WHERE operation_type = 'automatic'
         AND substr(created_at, 1, 10) = ?
         AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(today)
      .first<{ id: string; filename: string; created_at: string }>();
    if (existing) {
      return Response.json({
        skipped: true,
        reason: "today_already_backed_up",
        objectKey: existing.filename,
        createdAt: existing.created_at,
      });
    }
    const bundle = await createBackup(DB, true);
    const snapshotId = crypto.randomUUID();
    const prefix = `backups/automatic/${today}/${snapshotId}`;
    const copiedFiles: Array<{
      originalObjectKey: string;
      backupObjectKey: string;
      filename: string;
      size: number;
    }> = [];
    for (let offset = 0; offset < bundle.files.length; offset += 4) {
      const group = bundle.files.slice(offset, offset + 4);
      await Promise.all(
        group.map(async (file) => {
          const source = await MEDIA.get(file.objectKey);
          if (!source) return;
          const backupObjectKey = `${prefix}/files/${file.table}/${file.rowId}`;
          await MEDIA.put(backupObjectKey, source.body, {
            httpMetadata: { contentType: file.contentType },
            customMetadata: {
              originalObjectKey: file.objectKey,
              originalName: file.filename,
            },
          });
          copiedFiles.push({
            originalObjectKey: file.objectKey,
            backupObjectKey,
            filename: file.filename,
            size: file.size,
          });
        }),
      );
    }
    const manifestKey = `${prefix}/manifest.json`;
    const manifest = {
      ...bundle,
      automaticSnapshot: {
        id: snapshotId,
        createdAt: new Date().toISOString(),
        manifestKey,
        copiedFiles,
      },
    };
    await MEDIA.put(
      manifestKey,
      new TextEncoder().encode(JSON.stringify(manifest)).buffer,
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { backupType: "automatic-full" },
      },
    );
    await logOperation(DB, {
      operationType: "automatic",
      scope: "full",
      filename: manifestKey,
      tableCount: bundle.counts.tables,
      rowCount: bundle.counts.rows,
      fileCount: copiedFiles.length,
      includePrivate: true,
      note: "由后台自动化生成的私有 R2 全量快照",
    });
    return Response.json({
      skipped: false,
      objectKey: manifestKey,
      tableCount: bundle.counts.tables,
      rowCount: bundle.counts.rows,
      fileCount: copiedFiles.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "自动备份失败。" },
      { status: 500 },
    );
  }
}
