import { ensureIntelligenceSchema } from "../../../../lib/intelligence-store";
import { getLifeBindings } from "../../../../lib/life-store";

const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function text(value: FormDataEntryValue | null, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: "请选择要保存的求职材料。" }, { status: 400 });
    }
    if (!allowedTypes.has(file.type) || file.size > 12 * 1024 * 1024) {
      return Response.json(
        { error: "仅支持不超过 12MB 的 PDF、Word 或图片材料。" },
        { status: 400 },
      );
    }
    const id = crypto.randomUUID();
    const objectKey = `job-materials/${id}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
    await MEDIA.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name },
    });
    try {
      await DB.prepare(
        `INSERT INTO application_documents
         (id, application_id, name, kind, version, status, last_modified_at,
          object_key, filename, content_type, size, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(form.get("applicationId"), 200) || null,
          text(form.get("name"), 300) || file.name,
          text(form.get("kind"), 80) || "简历",
          text(form.get("version"), 80) || "V1",
          text(form.get("status"), 80) || "可用",
          new Date().toISOString(),
          objectKey,
          file.name,
          file.type,
          file.size,
          text(form.get("note"), 2000),
        )
        .run();
    } catch (error) {
      await MEDIA.delete(objectKey);
      throw error;
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "求职材料上传失败。" },
      { status: 500 },
    );
  }
}
