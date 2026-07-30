import { ensureLifeSchema, getLifeBindings } from "../../../../lib/life-store";
import { isPrivateVaultUnlocked } from "../../../../lib/private-vault";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureLifeSchema();
    const { id } = await context.params;
    const { DB, MEDIA } = getLifeBindings();
    const row = await DB.prepare(
      `SELECT m.object_key, m.filename, m.content_type, e.is_private
       FROM media m
       JOIN life_events e ON e.id = m.event_id
       WHERE m.id = ?`,
    )
      .bind(id)
      .first<{
        object_key: string;
        filename: string;
        content_type: string;
        is_private: number;
      }>();
    if (!row) return new Response("未找到照片", { status: 404 });
    if (
      row.is_private &&
      !(await isPrivateVaultUnlocked(request, DB))
    ) {
      return new Response("未找到照片", { status: 404 });
    }
    const object = await MEDIA.get(row.object_key);
    if (!object) return new Response("照片文件不存在", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", row.content_type);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    headers.set(
      "content-disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    );
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch {
    return new Response("读取照片失败", { status: 500 });
  }
}
