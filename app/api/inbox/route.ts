import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const content = String(form.get("content") ?? "").trim().slice(0, 5000);
    const files = form
      .getAll("attachments")
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, 4);
    if (!content && !files.length) {
      return Response.json({ error: "请输入内容或选择附件。" }, { status: 400 });
    }
    if (files.some((file) => file.size > 15 * 1024 * 1024)) {
      return Response.json(
        { error: "单个收件箱附件不能超过 15MB。" },
        { status: 400 },
      );
    }
    const id = crypto.randomUUID();
    const sourceType = files.some((file) => file.type.startsWith("audio/"))
      ? "语音"
      : files.some((file) => file.type.startsWith("image/"))
        ? "照片"
        : /^https?:\/\//i.test(content)
          ? "链接"
          : "文字";
    await DB.prepare(
      "INSERT INTO inbox_items (id, content, source_type) VALUES (?, ?, ?)",
    )
      .bind(id, content, sourceType)
      .run();
    for (const file of files) {
      const attachmentId = crypto.randomUUID();
      const extension =
        file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
      const objectKey = `inbox/${id}/${attachmentId}.${extension}`;
      await MEDIA.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { originalName: file.name },
      });
      await DB.prepare(
        `INSERT INTO inbox_attachments
         (id, inbox_id, object_key, filename, content_type, size)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          attachmentId,
          id,
          objectKey,
          file.name,
          file.type || "application/octet-stream",
          file.size,
        )
        .run();
    }
    return Response.json({ id, sourceType }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存收件箱附件失败。",
      },
      { status: 500 },
    );
  }
}
