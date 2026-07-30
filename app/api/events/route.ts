import { getLifeBindings } from "../../../lib/life-store";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import {
  addAuditLog,
  addLifeEventVersion,
  eventSnapshot,
  readLifeEvent,
} from "../../../lib/event-history";
import { isPrivateVaultUnlocked } from "../../../lib/private-vault";

const MAX_FILES = 8;
const MAX_FILE_SIZE = 12 * 1024 * 1024;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function eventDate(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function normalizedTags(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[，,\s]+/);
  return values
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const id = new URL(request.url).searchParams.get("id")?.slice(0, 120);
    if (!id) {
      return Response.json({ error: "缺少记录编号。" }, { status: 400 });
    }
    const event = await readLifeEvent(DB, id);
    if (!event) {
      return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
    }
    if (
      event.is_private &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
    }
    const versions = await DB.prepare(
      `SELECT id, revision, snapshot_json, change_note, device_id, created_at
       FROM life_event_versions
       WHERE event_id = ?
       ORDER BY revision DESC LIMIT 100`,
    )
      .bind(id)
      .all<{
        id: string;
        revision: number;
        snapshot_json: string;
        change_note: string;
        device_id: string;
        created_at: string;
      }>();
    return Response.json({
      event: eventSnapshot(event),
      versions: versions.results.map((version) => ({
        id: version.id,
        revision: version.revision,
        snapshot: JSON.parse(version.snapshot_json),
        changeNote: version.change_note,
        deviceId: version.device_id,
        createdAt: version.created_at,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取记录历史失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const content = String(form.get("content") ?? "").trim().slice(0, 5000);
    const title = String(form.get("title") ?? "").trim().slice(0, 200);
    const files = form
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!content && !title && files.length === 0) {
      return Response.json(
        { error: "写一点内容，或至少选择一张照片。" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return Response.json(
        { error: `一次最多上传 ${MAX_FILES} 张照片。` },
        { status: 400 },
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

    const happenedValue = String(form.get("happenedAt") ?? "");
    const happenedDate = new Date(happenedValue);
    const happenedAt = Number.isNaN(happenedDate.getTime())
      ? new Date().toISOString()
      : happenedDate.toISOString();
    const tags = String(form.get("tags") ?? "")
      .split(/[，,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    const eventId = crypto.randomUUID();
    const deviceId = text(form.get("deviceId"), 120);
    if (
      String(form.get("isPrivate") ?? "") === "true" &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return Response.json(
        { error: "请先解锁私密空间再保存私密记录。" },
        { status: 403 },
      );
    }

    await DB.prepare(
      `INSERT INTO life_events
       (id, title, content, kind, mood, energy, tags, person, place, project,
        is_private, happened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        eventId,
        title,
        content,
        String(form.get("kind") ?? "生活").slice(0, 30),
        String(form.get("mood") ?? "平静").slice(0, 20),
        Math.min(5, Math.max(1, Number(form.get("energy") ?? 3))),
        JSON.stringify(tags),
        String(form.get("person") ?? "").slice(0, 200),
        String(form.get("place") ?? "").slice(0, 200),
        String(form.get("project") ?? "").slice(0, 200),
        String(form.get("isPrivate") ?? "") === "true" ? 1 : 0,
        happenedAt,
      )
      .run();

    const createdEvent = await readLifeEvent(DB, eventId);
    if (createdEvent) {
      await addLifeEventVersion(DB, createdEvent, {
        changeNote: "创建记录",
        deviceId,
      });
      await addAuditLog(DB, {
        action: "event.create",
        entityType: "life_event",
        entityId: eventId,
        deviceId,
        detail: { revision: 1, photoCount: files.length },
      });
    }

    const relation = String(form.get("relation") ?? "").trim().slice(0, 300);
    if (relation) {
      await DB.prepare(
        `INSERT INTO life_relations
         (id, from_event_id, to_type, to_id, label)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          eventId,
          "text",
          relation,
          "记录关联",
        )
        .run();
    }

    for (const file of files) {
      const mediaId = crypto.randomUUID();
      const extension = file.name.includes(".")
        ? file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img"
        : "img";
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
        customMetadata: { originalName: file.name },
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
          file.name,
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

    return Response.json({ id: eventId }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "记录保存失败了。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as Record<string, unknown>;
    const id = text(body.id, 120);
    const deviceId = text(body.deviceId, 120);
    const expectedRevision = Math.max(1, Number(body.expectedRevision) || 1);
    if (!id) {
      return Response.json({ error: "缺少记录编号。" }, { status: 400 });
    }
    const current = await readLifeEvent(DB, id);
    if (!current) {
      return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
    }
    if (
      (current.is_private || body.isPrivate === true) &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return Response.json(
        { error: "请先解锁私密空间。" },
        { status: 403 },
      );
    }
    if (current.revision !== expectedRevision) {
      return Response.json(
        {
          error: "这条记录已经在另一台设备上更新，请先查看新版本。",
          conflict: true,
          current: eventSnapshot(current),
        },
        { status: 409 },
      );
    }
    await addLifeEventVersion(DB, current, {
      changeNote: "编辑前版本",
      deviceId,
    });
    const title = text(body.title, 200);
    const content = text(body.content, 5000);
    if (!title && !content && body.allowEmpty !== true) {
      return Response.json(
        { error: "标题和正文不能同时为空。" },
        { status: 400 },
      );
    }
    const nextRevision = current.revision + 1;
    const updated = await DB.prepare(
      `UPDATE life_events
       SET title = ?, content = ?, kind = ?, mood = ?, energy = ?, tags = ?,
           person = ?, place = ?, project = ?, is_private = ?,
           record_status = 'published', happened_at = ?,
           revision = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND revision = ?`,
    )
      .bind(
        title,
        content,
        text(body.kind, 30) || "生活",
        text(body.mood, 20) || "平静",
        Math.min(5, Math.max(1, Number(body.energy) || 3)),
        JSON.stringify(normalizedTags(body.tags)),
        text(body.person, 200),
        text(body.place, 200),
        text(body.project, 200),
        body.isPrivate === true ? 1 : 0,
        eventDate(body.happenedAt, new Date(current.happened_at)),
        nextRevision,
        id,
        expectedRevision,
      )
      .run();
    if ((updated.meta.changes ?? 0) === 0) {
      const latest = await readLifeEvent(DB, id);
      return Response.json(
        {
          error: "保存时检测到另一台设备的新修改。",
          conflict: true,
          current: latest ? eventSnapshot(latest) : null,
        },
        { status: 409 },
      );
    }
    const next = await readLifeEvent(DB, id);
    if (!next) throw new Error("记录更新后无法重新读取。");
    await addLifeEventVersion(DB, next, {
      changeNote: text(body.changeNote, 500) || "编辑记录",
      deviceId,
    });
    await addAuditLog(DB, {
      action: "event.update",
      entityType: "life_event",
      entityId: id,
      deviceId,
      detail: {
        previousRevision: expectedRevision,
        revision: nextRevision,
      },
    });
    return Response.json({
      event: eventSnapshot(next),
      revision: nextRevision,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "记录更新失败。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "缺少记录编号。" }, { status: 400 });
    const current = await readLifeEvent(DB, id);
    if (!current) {
      return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
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
    await addLifeEventVersion(DB, current, {
      changeNote: "移入回收站前版本",
    });
    await DB.prepare(
      `UPDATE life_events
       SET deleted_at = CURRENT_TIMESTAMP, revision = revision + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(id)
      .run();
    const deleted = await readLifeEvent(DB, id);
    if (deleted) {
      await addLifeEventVersion(DB, deleted, { changeNote: "移入回收站" });
      await addAuditLog(DB, {
        action: "event.delete",
        entityType: "life_event",
        entityId: id,
        detail: { revision: deleted.revision },
      });
    }
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "移入回收站失败。" }, { status: 500 });
  }
}
