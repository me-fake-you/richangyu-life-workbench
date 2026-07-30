import {
  analyzePhotoWithVision,
  generateProviderText,
} from "../../../lib/ai-provider";
import {
  ensureAdvancedSchema,
  parseStoredJson,
} from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function optionalText(value: unknown, max = 5000) {
  const result = text(value, max);
  return result || null;
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function coordinate(value: unknown, min: number, max: number) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null;
}

function tags(value: unknown, limit = 30) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[，,\s]+/);
  return [
    ...new Set(
      values
        .map((item) => text(item, 30))
        .filter(Boolean)
        .slice(0, limit),
    ),
  ];
}

function dateOnly(value: unknown, fallback = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value, 40);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  return fallback.toISOString().slice(0, 10);
}

function timezoneOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.round(parsed)));
}

function localDateBoundary(
  date: string,
  offsetMinutes: number,
  nextDay = false,
) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)) +
      offsetMinutes * 60000,
  ).toISOString();
}

async function findPublicPhoto(DB: D1Database, mediaId: string) {
  return DB.prepare(
    `SELECT m.id, m.event_id, m.object_key, m.filename, m.content_type,
            m.size, e.title, e.content, e.kind, e.tags, e.place, e.happened_at
     FROM media m
     JOIN life_events e ON e.id = m.event_id
     WHERE m.id = ? AND e.deleted_at IS NULL AND e.is_private = 0
       AND m.content_type LIKE 'image/%'`,
  )
    .bind(mediaId)
    .first<JsonObject>();
}

async function upsertMetadata(
  DB: D1Database,
  mediaId: string,
  payload: JsonObject,
) {
  const current = await DB.prepare(
    "SELECT * FROM photo_metadata WHERE media_id = ?",
  )
    .bind(mediaId)
    .first<JsonObject>();
  const storedTags = parseStoredJson<string[]>(
    String(current?.tags ?? "[]"),
    [],
  );
  const nextTags =
    payload.tags === undefined
      ? storedTags
      : tags(payload.tags);
  const takenAt =
    payload.takenAt === undefined
      ? current?.taken_at ?? null
      : optionalText(payload.takenAt, 60);
  const place =
    payload.place === undefined
      ? text(current?.place, 200)
      : text(payload.place, 200);
  const latitude =
    payload.latitude === undefined
      ? coordinate(current?.latitude, -90, 90)
      : coordinate(payload.latitude, -90, 90);
  const longitude =
    payload.longitude === undefined
      ? coordinate(current?.longitude, -180, 180)
      : coordinate(payload.longitude, -180, 180);
  const album =
    payload.album === undefined
      ? text(current?.album, 120)
      : text(payload.album, 120);
  const caption =
    payload.caption === undefined
      ? text(current?.caption, 1200)
      : text(payload.caption, 1200);
  const isFavorite =
    payload.isFavorite === undefined
      ? Boolean(current?.is_favorite)
      : boolean(payload.isFavorite);
  const hiddenFromMemories =
    payload.hiddenFromMemories === undefined
      ? Boolean(current?.hidden_from_memories)
      : boolean(payload.hiddenFromMemories);
  const coverDate =
    payload.coverDate === undefined
      ? current?.cover_date ?? null
      : optionalText(payload.coverDate, 10);
  const visionProvider =
    payload.visionProvider === undefined
      ? text(current?.vision_provider, 30)
      : text(payload.visionProvider, 30);
  const visionModel =
    payload.visionModel === undefined
      ? text(current?.vision_model, 120)
      : text(payload.visionModel, 120);

  await DB.prepare(
    `INSERT INTO photo_metadata
     (media_id, caption, tags, taken_at, place, latitude, longitude, album,
      is_favorite, cover_date, hidden_from_memories, vision_provider,
      vision_model, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(media_id) DO UPDATE SET
       caption = excluded.caption,
       tags = excluded.tags,
       taken_at = excluded.taken_at,
       place = excluded.place,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       album = excluded.album,
       is_favorite = excluded.is_favorite,
       cover_date = excluded.cover_date,
       hidden_from_memories = excluded.hidden_from_memories,
       vision_provider = excluded.vision_provider,
       vision_model = excluded.vision_model,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      mediaId,
      caption,
      JSON.stringify(nextTags),
      takenAt,
      place,
      latitude,
      longitude,
      album,
      isFavorite ? 1 : 0,
      coverDate,
      hiddenFromMemories ? 1 : 0,
      visionProvider,
      visionModel,
    )
    .run();
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const [photosResult, storiesResult] = await DB.batch([
      DB.prepare(
        `SELECT
           m.id, m.event_id, m.filename, m.content_type, m.size, m.created_at,
           e.title AS event_title, e.content AS event_content,
           e.kind AS event_kind, e.mood AS event_mood, e.tags AS event_tags,
           e.person AS event_person, e.place AS event_place,
           e.project AS event_project, e.happened_at AS event_happened_at,
           pm.caption, pm.tags AS photo_tags, pm.taken_at, pm.place,
           pm.latitude, pm.longitude, pm.album, pm.is_favorite,
           pm.cover_date, pm.hidden_from_memories, pm.vision_provider,
           pm.vision_model, pm.updated_at AS metadata_updated_at,
           pi.sha256, pi.perceptual_hash, pi.blur_score, pi.duplicate_of,
           pi.is_screenshot, pi.note AS insight_note, pi.exif_removed,
           pi.scanned_at
         FROM media m
         JOIN life_events e ON e.id = m.event_id
         LEFT JOIN photo_metadata pm ON pm.media_id = m.id
         LEFT JOIN photo_insights pi ON pi.media_id = m.id
         WHERE e.deleted_at IS NULL AND e.is_private = 0
           AND m.content_type LIKE 'image/%'
         ORDER BY COALESCE(pm.taken_at, e.happened_at) DESC, m.created_at DESC
         LIMIT 3000`,
      ),
      DB.prepare(
        `SELECT ps.*, m.filename AS cover_filename
         FROM photo_stories ps
         LEFT JOIN media m ON m.id = ps.cover_media_id
         ORDER BY ps.period_end DESC, ps.created_at DESC
         LIMIT 100`,
      ),
    ]);

    const photos = (photosResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      filename: row.filename,
      contentType: row.content_type,
      size: Number(row.size) || 0,
      url: `/api/media/${row.id}`,
      eventTitle: row.event_title,
      eventContent: row.event_content,
      eventKind: row.event_kind,
      eventMood: row.event_mood,
      eventTags: parseStoredJson(String(row.event_tags ?? "[]"), []),
      eventPerson: row.event_person,
      eventPlace: row.event_place,
      eventProject: row.event_project,
      eventHappenedAt: row.event_happened_at,
      caption: row.caption ?? "",
      tags: parseStoredJson(String(row.photo_tags ?? "[]"), []),
      takenAt: row.taken_at ?? row.event_happened_at,
      place: row.place || row.event_place || "",
      latitude: row.latitude,
      longitude: row.longitude,
      album: row.album ?? "",
      isFavorite: Boolean(row.is_favorite),
      coverDate: row.cover_date,
      hiddenFromMemories: Boolean(row.hidden_from_memories),
      visionProvider: row.vision_provider ?? "",
      visionModel: row.vision_model ?? "",
      sha256: row.sha256,
      perceptualHash: row.perceptual_hash,
      blurScore: row.blur_score,
      duplicateOf: row.duplicate_of,
      isScreenshot: Boolean(row.is_screenshot),
      insightNote: row.insight_note ?? "",
      exifRemoved: Boolean(row.exif_removed),
      scannedAt: row.scanned_at,
    }));
    const stories = (storiesResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      title: row.title,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      coverMediaId: row.cover_media_id,
      coverUrl: row.cover_media_id
        ? `/api/media/${row.cover_media_id}`
        : "",
      content: row.content,
      mediaIds: parseStoredJson(String(row.media_ids ?? "[]"), []),
      generatedBy: row.generated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const offset = timezoneOffset(
      new URL(request.url).searchParams.get("timezoneOffset"),
    );
    const localNow = new Date(Date.now() - offset * 60000);
    const today = localNow.toISOString().slice(0, 10);

    return Response.json({
      photos,
      stories,
      stats: {
        total: photos.length,
        screenshots: photos.filter((photo) => photo.isScreenshot).length,
        duplicates: photos.filter((photo) => photo.duplicateOf).length,
        blurry: photos.filter(
          (photo) =>
            typeof photo.blurScore === "number" && photo.blurScore < 24,
        ).length,
        favorites: photos.filter((photo) => photo.isFavorite).length,
        uncaptioned: photos.filter((photo) => !photo.caption).length,
        places: new Set(photos.map((photo) => photo.place).filter(Boolean)).size,
      },
      todayCover:
        photos.find((photo) => photo.coverDate === today) ??
        photos.find((photo) => !photo.hiddenFromMemories) ??
        null,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取照片中心失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 80);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "metadata.update") {
      const mediaId = text(payload.mediaId, 80);
      if (!mediaId || !(await findPublicPhoto(DB, mediaId))) {
        return Response.json({ error: "照片不存在或不可整理。" }, { status: 404 });
      }
      await upsertMetadata(DB, mediaId, payload);
      return Response.json({ mediaId });
    }

    if (action === "batch.update") {
      const mediaIds = Array.isArray(payload.mediaIds)
        ? [
            ...new Set(
              payload.mediaIds
                .map((id) => text(id, 80))
                .filter(Boolean)
                .slice(0, 200),
            ),
          ]
        : [];
      const validIds: string[] = [];
      for (const mediaId of mediaIds) {
        if (await findPublicPhoto(DB, mediaId)) validIds.push(mediaId);
      }
      const addTags = tags(payload.addTags);
      for (const mediaId of validIds) {
        const current = await DB.prepare(
          "SELECT tags FROM photo_metadata WHERE media_id = ?",
        )
          .bind(mediaId)
          .first<{ tags: string }>();
        const currentTags = parseStoredJson<string[]>(current?.tags ?? "[]", []);
        await upsertMetadata(DB, mediaId, {
          ...(payload.changes as JsonObject | undefined),
          ...(addTags.length
            ? { tags: [...new Set([...currentTags, ...addTags])] }
            : {}),
        });
      }
      return Response.json({ updated: validIds.length });
    }

    if (action === "cover.set") {
      const mediaId = text(payload.mediaId, 80);
      const coverDate = dateOnly(payload.coverDate);
      if (!mediaId || !(await findPublicPhoto(DB, mediaId))) {
        return Response.json({ error: "照片不存在或不可设为封面。" }, { status: 404 });
      }
      await DB.prepare(
        "UPDATE photo_metadata SET cover_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE cover_date = ?",
      )
        .bind(coverDate)
        .run();
      await upsertMetadata(DB, mediaId, { coverDate });
      return Response.json({ mediaId, coverDate });
    }

    if (action === "insights.save") {
      const items = Array.isArray(payload.items)
        ? payload.items.slice(0, 500)
        : [];
      const statements: D1PreparedStatement[] = [];
      for (const raw of items) {
        const item = raw as JsonObject;
        const mediaId = text(item.mediaId, 80);
        if (!mediaId || !(await findPublicPhoto(DB, mediaId))) continue;
        statements.push(
          DB.prepare(
            `INSERT INTO photo_insights
             (media_id, sha256, perceptual_hash, blur_score, duplicate_of,
              is_screenshot, note, exif_removed, scanned_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(media_id) DO UPDATE SET
               sha256 = excluded.sha256,
               perceptual_hash = excluded.perceptual_hash,
               blur_score = excluded.blur_score,
               duplicate_of = excluded.duplicate_of,
               is_screenshot = excluded.is_screenshot,
               note = excluded.note,
               exif_removed = excluded.exif_removed,
               scanned_at = CURRENT_TIMESTAMP`,
          ).bind(
            mediaId,
            optionalText(item.sha256, 128),
            optionalText(item.perceptualHash, 256),
            coordinate(item.blurScore, 0, 1000000),
            optionalText(item.duplicateOf, 80),
            boolean(item.isScreenshot) ? 1 : 0,
            text(item.note, 500),
            boolean(item.exifRemoved) ? 1 : 0,
          ),
        );
      }
      if (statements.length) await DB.batch(statements);
      return Response.json({ saved: statements.length });
    }

    if (action === "vision.caption") {
      const mediaId = text(payload.mediaId, 80);
      const photo = await findPublicPhoto(DB, mediaId);
      if (!photo) {
        return Response.json({ error: "照片不存在或不可分析。" }, { status: 404 });
      }
      const object = await MEDIA.get(String(photo.object_key));
      if (!object) {
        return Response.json({ error: "照片原文件不存在。" }, { status: 404 });
      }
      const analysis = await analyzePhotoWithVision({
        bytes: await new Response(object.body).arrayBuffer(),
        contentType: text(photo.content_type, 100) || "image/jpeg",
        context: [
          text(photo.title, 120),
          text(photo.content, 300),
          text(photo.kind, 30),
          text(photo.place, 120),
        ]
          .filter(Boolean)
          .join("；"),
      });
      if (!analysis) {
        return Response.json(
          { error: "尚未配置可用的视觉模型。" },
          { status: 503 },
        );
      }
      const existing = await DB.prepare(
        "SELECT tags, place FROM photo_metadata WHERE media_id = ?",
      )
        .bind(mediaId)
        .first<{ tags: string; place: string }>();
      const existingTags = parseStoredJson<string[]>(existing?.tags ?? "[]", []);
      await upsertMetadata(DB, mediaId, {
        caption: analysis.caption,
        tags: [...new Set([...existingTags, ...analysis.tags])],
        place: existing?.place || analysis.suggestedPlace,
        visionProvider: analysis.provider,
        visionModel: analysis.model,
      });
      return Response.json({ analysis });
    }

    if (action === "story.generate") {
      const startDate = dateOnly(payload.periodStart);
      const endDate = dateOnly(payload.periodEnd ?? payload.periodStart);
      const offset = timezoneOffset(payload.timezoneOffset);
      const periodStart = localDateBoundary(startDate, offset);
      const periodEnd = localDateBoundary(endDate, offset, true);
      if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
        return Response.json({ error: "照片故事的日期范围无效。" }, { status: 400 });
      }
      const result = await DB.prepare(
        `SELECT m.id, e.title, e.content, e.kind, e.mood, e.place,
                e.person, e.happened_at, pm.caption, pm.tags, pm.taken_at,
                pm.place AS photo_place, pm.album, pm.is_favorite
         FROM media m
         JOIN life_events e ON e.id = m.event_id
         LEFT JOIN photo_metadata pm ON pm.media_id = m.id
         WHERE e.deleted_at IS NULL AND e.is_private = 0
           AND m.content_type LIKE 'image/%'
           AND COALESCE(pm.hidden_from_memories, 0) = 0
           AND COALESCE(pm.taken_at, e.happened_at) >= ?
           AND COALESCE(pm.taken_at, e.happened_at) < ?
         ORDER BY COALESCE(pm.taken_at, e.happened_at) ASC
         LIMIT 120`,
      )
        .bind(periodStart, periodEnd)
        .all<JsonObject>();
      const photos = result.results;
      if (!photos.length) {
        return Response.json(
          { error: "这个时间范围还没有可用于故事的公开照片。" },
          { status: 400 },
        );
      }
      const title =
        text(payload.title, 120) ||
        `${startDate} 至 ${endDate} · 照片故事`;
      const places = [
        ...new Set(
          photos
            .map((photo) => text(photo.photo_place || photo.place, 120))
            .filter(Boolean),
        ),
      ];
      const kinds = [
        ...new Set(photos.map((photo) => text(photo.kind, 30)).filter(Boolean)),
      ];
      const localContent = [
        `这段时间留下了 ${photos.length} 张照片。`,
        places.length ? `足迹经过：${places.slice(0, 8).join("、")}。` : "",
        kinds.length ? `生活片段包括：${kinds.slice(0, 8).join("、")}。` : "",
        photos
          .slice(0, 8)
          .map(
            (photo) =>
              `• ${dateOnly(photo.taken_at || photo.happened_at)} ${text(
                photo.caption || photo.title || photo.content || "一张生活照片",
                100,
              )}`,
          )
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n");
      let content = localContent;
      let generatedBy = "local";
      try {
        const ai = await generateProviderText({
          signal: AbortSignal.timeout(45000),
          system:
            "你是私人生活相册编辑。根据结构化的真实照片资料，写一篇克制、温暖、具体的中文照片故事。不得编造资料中没有的人物、地点或事件；保留日期线索；末尾给出一句简短回望。只输出正文。",
          prompt: [
            `标题：${title}`,
            `范围：${periodStart} 至 ${periodEnd}`,
            `照片数量：${photos.length}`,
            `地点：${places.join("、") || "未填写"}`,
            `类型：${kinds.join("、") || "生活"}`,
            "照片资料：",
            ...photos.slice(0, 40).map((photo) =>
              [
                dateOnly(photo.taken_at || photo.happened_at),
                text(photo.caption || photo.title || photo.content, 180),
                text(photo.photo_place || photo.place, 80),
                text(photo.mood, 20),
              ]
                .filter(Boolean)
                .join("｜"),
            ),
          ].join("\n"),
        });
        if (ai?.text.trim()) {
          content = ai.text.trim().slice(0, 10000);
          generatedBy = `${ai.provider}:${ai.model}`;
        }
      } catch {
        generatedBy = "local";
      }
      const mediaIds = photos.map((photo) => String(photo.id));
      const favorite = photos.find((photo) => Boolean(photo.is_favorite));
      const coverMediaId = String(favorite?.id ?? photos[0].id);
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO photo_stories
         (id, title, period_start, period_end, cover_media_id, content,
          media_ids, generated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(period_start, period_end) DO UPDATE SET
           title = excluded.title,
           cover_media_id = excluded.cover_media_id,
           content = excluded.content,
           media_ids = excluded.media_ids,
           generated_by = excluded.generated_by,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(
          id,
          title,
          periodStart,
          periodEnd,
          coverMediaId,
          content,
          JSON.stringify(mediaIds),
          generatedBy,
        )
        .run();
      return Response.json({
        id,
        title,
        content,
        generatedBy,
        coverMediaId,
        mediaIds,
      });
    }

    if (action === "story.delete") {
      const id = text(payload.id, 80);
      await DB.prepare("DELETE FROM photo_stories WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "未知的照片操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "照片操作失败。",
      },
      { status: 500 },
    );
  }
}
