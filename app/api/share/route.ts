import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

const MAX_FILES = 8;
const MAX_FILE_SIZE = 12 * 1024 * 1024;

function text(value: FormDataEntryValue | null, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, MAX_FILES);
    const content = [
      text(form.get("title"), 500),
      text(form.get("text"), 4000),
      text(form.get("url"), 1000),
    ]
      .filter(Boolean)
      .join("\n");
    if (!content && !files.length) {
      return Response.json({ error: "分享内容为空。" }, { status: 400 });
    }
    const inboxId = crypto.randomUUID();
    const sourceType = files.some((file) => file.type.startsWith("image/"))
      ? "图片"
      : files.some((file) => file.type.startsWith("audio/"))
        ? "语音"
        : content.includes("http")
          ? "链接"
          : "文字";
    await DB.prepare(
      `INSERT INTO inbox_items (id, content, source_type, status)
       VALUES (?, ?, ?, '待整理')`,
    )
      .bind(
        inboxId,
        content || `从手机分享了 ${files.length} 个文件`,
        sourceType,
      )
      .run();
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) continue;
      const allowed =
        file.type.startsWith("image/") ||
        file.type.startsWith("audio/") ||
        file.type === "application/pdf";
      if (!allowed) continue;
      const id = crypto.randomUUID();
      const extension =
        file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
      const objectKey = `inbox/${inboxId}/${id}.${extension}`;
      await MEDIA.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { originalName: file.name.slice(0, 300) },
      });
      await DB.prepare(
        `INSERT INTO inbox_attachments
         (id, inbox_id, object_key, filename, content_type, size)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          inboxId,
          objectKey,
          file.name.slice(0, 300),
          file.type || "application/octet-stream",
          file.size,
        )
        .run();
    }
    return Response.redirect(new URL("/?shared=1", request.url), 303);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存分享内容失败。" },
      { status: 500 },
    );
  }
}
