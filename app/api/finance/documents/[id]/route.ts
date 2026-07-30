import { ensureFinanceSchema } from "../../../../../lib/finance-store";
import { getLifeBindings } from "../../../../../lib/life-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureFinanceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const { id } = await context.params;
    const document = await DB.prepare(
      `SELECT object_key, filename, content_type
       FROM finance_documents WHERE id = ?`,
    )
      .bind(id)
      .first<{
        object_key: string;
        filename: string;
        content_type: string;
      }>();
    if (!document) return new Response("Not found", { status: 404 });
    const object = await MEDIA.get(document.object_key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": document.content_type,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          document.filename,
        )}`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
