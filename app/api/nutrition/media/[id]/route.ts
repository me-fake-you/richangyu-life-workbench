import { ensureAdvancedSchema } from "../../../../../lib/advanced-store";
import { getLifeBindings } from "../../../../../lib/life-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdvancedSchema();
    const { id } = await context.params;
    const { DB, MEDIA } = getLifeBindings();
    const row = await DB.prepare(
      `SELECT object_key, filename, content_type
       FROM meal_media WHERE id = ?`,
    )
      .bind(id)
      .first<{
        object_key: string;
        filename: string;
        content_type: string;
      }>();
    if (!row) return new Response("Not found", { status: 404 });
    const object = await MEDIA.get(row.object_key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "content-type": row.content_type,
      "cache-control": "private, max-age=3600",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        row.filename,
      )}`,
    });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  } catch {
    return new Response("Unable to read meal photo", { status: 500 });
  }
}
