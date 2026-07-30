import { ensureFinanceSchema } from "../../../../lib/finance-store";
import { getLifeBindings } from "../../../../lib/life-store";

export async function POST(request: Request) {
  try {
    await ensureFinanceSchema();
    const { DB, MEDIA } = getLifeBindings();
    const form = await request.formData();
    const file = form.get("file");
    const transactionId = String(form.get("transactionId") ?? "").trim();
    const settlementId = String(form.get("settlementId") ?? "").trim();
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: "请选择票据文件。" }, { status: 400 });
    }
    if (
      (!file.type.startsWith("image/") && file.type !== "application/pdf") ||
      file.size > 12 * 1024 * 1024
    ) {
      return Response.json(
        { error: "仅支持不超过 12MB 的图片或 PDF 票据。" },
        { status: 400 },
      );
    }
    if (!transactionId && !settlementId) {
      return Response.json({ error: "票据需要关联账目或结算。" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const extension =
      file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const objectKey = `finance/${transactionId || settlementId}/${id}.${extension}`;
    await MEDIA.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name },
    });
    await DB.prepare(
      `INSERT INTO finance_documents
       (id, transaction_id, settlement_id, kind, object_key, filename,
        content_type, size)
       VALUES (?, ?, ?, '票据', ?, ?, ?, ?)`,
    )
      .bind(
        id,
        transactionId || null,
        settlementId || null,
        objectKey,
        file.name,
        file.type,
        file.size,
      )
      .run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "票据上传失败。" },
      { status: 500 },
    );
  }
}
