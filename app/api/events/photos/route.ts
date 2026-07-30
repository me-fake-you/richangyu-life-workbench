import { ensureAdvancedSchema } from "../../../../lib/advanced-store";
import {
  addAuditLog,
  addLifeEventVersion,
  readLifeEvent,
} from "../../../../lib/event-history";
import { getLifeBindings } from "../../../../lib/life-store";
import { isPrivateVaultUnlocked } from "../../../../lib/private-vault";

const MAX_FILES = 9;
const MAX_FILE_SIZE = 12 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const eventId = String(form.get("eventId") ?? "").trim().slice(0, 120);
    const files = form
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (!eventId || !files.length) {
      return Response.json(
        { error: "缺少记录编号或照片。" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return Response.json(
        { error: `一次最多上传 ${MAX_FILES} 张照片。` },
        { status: 400 },
      );
    }
    const current = await readLifeEvent(DB, eventId);
    if (!current) {
      return Response.json({ error: "没有找到照片所属记录。" }, { status: 404 });
    }
    if (
      current.is_private &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return Response.json(
        { error: "请先解锁私密空间。" },
        { status: 403 },
      );
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: "仅支持不超过 12MB 的图片文件。" },
          { status: 400 },
        );
      }
    }
    for (const file of files) {
      const mediaId = crypto.randomUUID();
      const extension =
        file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
      const objectKey = `events/${eventId}/${mediaId}.${extension}`;
      const bytes = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const duplicate = await DB.prepare(
        `SELECT media_id FROM photo_insights
         WHERE sha256 = ? ORDER BY scanned_at ASC LIMIT 1`,
      )
        .bind(sha256)
        .first<{ media_id: string }>();
      await MEDIA.put(objectKey, bytes, {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name.slice(0, 300) },
      });
      await DB.batch([
        DB.prepare(
          `INSERT INTO media
           (id, event_id, object_key, filename, content_type, size)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          mediaId,
          eventId,
          objectKey,
          file.name.slice(0, 300),
          file.type,
          file.size,
        ),
        DB.prepare(
          `INSERT INTO photo_insights
           (media_id, sha256, duplicate_of, is_screenshot, note)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(
          mediaId,
          sha256,
          duplicate?.media_id ?? null,
          /screenshot|截图|截屏/i.test(file.name) ? 1 : 0,
          duplicate ? "检测到完全相同的照片" : "",
        ),
      ]);
    }
    await DB.prepare(
      `UPDATE life_events
       SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(eventId)
      .run();
    const updated = await readLifeEvent(DB, eventId);
    if (updated) {
      await addLifeEventVersion(DB, updated, {
        changeNote: `新增 ${files.length} 张照片`,
      });
      await addAuditLog(DB, {
        action: "event.photos.add",
        entityType: "life_event",
        entityId: eventId,
        detail: { photoCount: files.length, revision: updated.revision },
      });
    }
    return Response.json({
      eventId,
      uploaded: files.length,
      revision: updated?.revision ?? current.revision,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "照片上传失败。" },
      { status: 500 },
    );
  }
}
