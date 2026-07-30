import { ensureIntelligenceSchema } from "../../../../../lib/intelligence-store";
import { getLifeBindings } from "../../../../../lib/life-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureIntelligenceSchema();
    const { id } = await context.params;
    const { DB, MEDIA } = getLifeBindings();
    const document = await DB.prepare(
      `SELECT object_key, filename, content_type
       FROM application_documents WHERE id = ?`,
    )
      .bind(id)
      .first<{
        object_key: string | null;
        filename: string | null;
        content_type: string | null;
      }>();
    if (!document?.object_key) {
      return Response.json({ error: "没有找到这份材料。" }, { status: 404 });
    }
    const object = await MEDIA.get(document.object_key);
    if (!object) {
      return Response.json({ error: "材料文件不存在。" }, { status: 404 });
    }
    return new Response(object.body, {
      headers: {
        "content-type": document.content_type || "application/octet-stream",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          document.filename || "document",
        )}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "材料读取失败。" },
      { status: 500 },
    );
  }
}
