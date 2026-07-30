import {
  analyzeMealWithVision,
  estimateMealFromDescription,
  type MealEstimate,
} from "../../../lib/ai-provider";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 3000) {
  return String(value ?? "").trim().slice(0, max);
}

function numeric(value: unknown, min = 0, max = 100000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function iso(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

async function replaceMealEstimate(
  DB: D1Database,
  mealId: string,
  estimate: MealEstimate,
) {
  const statements: D1PreparedStatement[] = [
    DB.prepare(
      `UPDATE meals SET
         estimated_calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
         confidence = ?, analysis_provider = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(
      estimate.calories,
      estimate.proteinG,
      estimate.carbsG,
      estimate.fatG,
      estimate.confidence,
      estimate.provider,
      mealId,
    ),
    DB.prepare("DELETE FROM meal_items WHERE meal_id = ?").bind(mealId),
  ];
  for (const item of estimate.items) {
    statements.push(
      DB.prepare(
        `INSERT INTO meal_items
         (id, meal_id, name, portion, calories, protein_g, carbs_g, fat_g)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        mealId,
        item.name,
        item.portion,
        item.calories,
        item.proteinG,
        item.carbsG,
        item.fatG,
      ),
    );
  }
  await DB.batch(statements);
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const [meals, items, media, settings, water] = await DB.batch([
      DB.prepare("SELECT * FROM meals ORDER BY eaten_at DESC LIMIT 1000"),
      DB.prepare("SELECT * FROM meal_items ORDER BY created_at ASC"),
      DB.prepare("SELECT id, meal_id, filename, content_type, size FROM meal_media"),
      DB.prepare("SELECT * FROM nutrition_settings WHERE id = 'default'"),
      DB.prepare(
        `SELECT id, glasses, logged_at FROM water_logs
         ORDER BY logged_at DESC LIMIT 1000`,
      ),
    ]);
    const itemMap = new Map<string, JsonObject[]>();
    for (const item of items.results as JsonObject[]) {
      const mealId = String(item.meal_id);
      const group = itemMap.get(mealId) ?? [];
      group.push({
        id: item.id,
        name: item.name,
        portion: item.portion,
        calories: item.calories,
        proteinG: item.protein_g,
        carbsG: item.carbs_g,
        fatG: item.fat_g,
      });
      itemMap.set(mealId, group);
    }
    const mediaMap = new Map<string, JsonObject[]>();
    for (const item of media.results as JsonObject[]) {
      const mealId = String(item.meal_id);
      const group = mediaMap.get(mealId) ?? [];
      group.push({
        id: item.id,
        filename: item.filename,
        contentType: item.content_type,
        size: item.size,
        url: `/api/nutrition/media/${item.id}`,
      });
      mediaMap.set(mealId, group);
    }
    return Response.json({
      meals: (meals.results as JsonObject[]).map((row) => ({
        id: row.id,
        mealType: row.meal_type,
        eatenAt: row.eaten_at,
        note: row.note,
        estimatedCalories: row.estimated_calories,
        proteinG: row.protein_g,
        carbsG: row.carbs_g,
        fatG: row.fat_g,
        confidence: row.confidence,
        analysisProvider: row.analysis_provider,
        items: itemMap.get(String(row.id)) ?? [],
        photos: mediaMap.get(String(row.id)) ?? [],
      })),
      settings: settings.results[0]
        ? {
            calorieTarget: (settings.results[0] as JsonObject).calorie_target,
            proteinTarget: (settings.results[0] as JsonObject).protein_target,
            carbsTarget: (settings.results[0] as JsonObject).carbs_target,
            fatTarget: (settings.results[0] as JsonObject).fat_target,
            waterTarget: (settings.results[0] as JsonObject).water_target,
          }
        : {
            calorieTarget: 2000,
            proteinTarget: 90,
            carbsTarget: 250,
            fatTarget: 65,
            waterTarget: 8,
          },
      water: water.results.map((row) => ({
        id: (row as JsonObject).id,
        glasses: (row as JsonObject).glasses,
        loggedAt: (row as JsonObject).logged_at,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取饮食记录失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const mealId = crypto.randomUUID();
      const note = text(form.get("note"));
      const mealType = text(form.get("mealType"), 20) || "午餐";
      const eatenAt = iso(form.get("eatenAt"));
      const fileValue = form.get("photo");
      const photo =
        fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
      if (photo && (!photo.type.startsWith("image/") || photo.size > 8 * 1024 * 1024)) {
        return Response.json(
          { error: "餐食照片需为不超过 8MB 的图片。" },
          { status: 400 },
        );
      }

      let estimate = estimateMealFromDescription(note);
      let photoBytes: ArrayBuffer | null = null;
      if (photo) {
        photoBytes = await photo.arrayBuffer();
        try {
          estimate =
            (await analyzeMealWithVision({
              bytes: photoBytes,
              contentType: photo.type,
              note,
            })) ?? estimate;
        } catch (error) {
          estimate = {
            ...estimate,
            summary: `${
              error instanceof Error ? error.message : "照片识别失败"
            } 已使用文字与内置食物库估算。`,
          };
        }
      }

      const manualCalories = numeric(form.get("calories"));
      if (manualCalories > 0) {
        estimate = {
          ...estimate,
          provider: "local",
          model: "手动修正",
          calories: manualCalories,
          proteinG: numeric(form.get("proteinG")),
          carbsG: numeric(form.get("carbsG")),
          fatG: numeric(form.get("fatG")),
          confidence: 1,
          summary: "使用了你手动填写的营养数据。",
        };
      }

      await DB.prepare(
        `INSERT INTO meals
         (id, meal_type, eaten_at, note, estimated_calories, protein_g,
          carbs_g, fat_g, confidence, analysis_provider)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          mealId,
          mealType,
          eatenAt,
          note || estimate.summary,
          estimate.calories,
          estimate.proteinG,
          estimate.carbsG,
          estimate.fatG,
          estimate.confidence,
          estimate.provider,
        )
        .run();
      await replaceMealEstimate(DB, mealId, estimate);

      if (photo && photoBytes) {
        const mediaId = crypto.randomUUID();
        const extension =
          photo.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
        const objectKey = `meals/${mealId}/${mediaId}.${extension}`;
        await MEDIA.put(objectKey, photoBytes, {
          httpMetadata: { contentType: photo.type },
          customMetadata: { originalName: photo.name },
        });
        await DB.prepare(
          `INSERT INTO meal_media
           (id, meal_id, object_key, filename, content_type, size)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            mediaId,
            mealId,
            objectKey,
            photo.name,
            photo.type,
            photo.size,
          )
          .run();
      }
      return Response.json({ id: mealId, estimate }, { status: 201 });
    }

    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 60);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "water.add") {
      const id = crypto.randomUUID();
      await DB.prepare(
        "INSERT INTO water_logs (id, glasses, logged_at) VALUES (?, ?, ?)",
      )
        .bind(id, numeric(payload.glasses, 1, 20), iso(payload.loggedAt))
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "settings.update") {
      await DB.prepare(
        `UPDATE nutrition_settings SET
           calorie_target = ?, protein_target = ?, carbs_target = ?,
           fat_target = ?, water_target = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 'default'`,
      )
        .bind(
          numeric(payload.calorieTarget, 800, 6000),
          numeric(payload.proteinTarget, 10, 500),
          numeric(payload.carbsTarget, 20, 1000),
          numeric(payload.fatTarget, 10, 500),
          numeric(payload.waterTarget, 1, 30),
        )
        .run();
      return Response.json({ id: "default" });
    }

    if (action === "meal.update") {
      const id = text(payload.id, 80);
      const estimate = {
        provider: "local" as const,
        model: "手动修正",
        summary: "已按手动输入修正。",
        confidence: 1,
        calories: numeric(payload.calories),
        proteinG: numeric(payload.proteinG),
        carbsG: numeric(payload.carbsG),
        fatG: numeric(payload.fatG),
        items: Array.isArray(payload.items)
          ? (payload.items as MealEstimate["items"])
          : [],
      };
      await DB.prepare(
        "UPDATE meals SET note = ?, meal_type = ? WHERE id = ?",
      )
        .bind(
          text(payload.note),
          text(payload.mealType, 20) || "餐食",
          id,
        )
        .run();
      await replaceMealEstimate(DB, id, estimate);
      return Response.json({ id });
    }

    if (action === "meal.delete") {
      const id = text(payload.id, 80);
      const mediaRows = await DB.prepare(
        "SELECT object_key FROM meal_media WHERE meal_id = ?",
      )
        .bind(id)
        .all<{ object_key: string }>();
      for (const row of mediaRows.results) {
        await MEDIA.delete(row.object_key);
      }
      await DB.prepare("DELETE FROM meals WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "不支持的饮食操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存饮食记录失败。" },
      { status: 500 },
    );
  }
}
