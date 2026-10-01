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

function foodMemoryKey(name: string, portion: string) {
  return `${name}::${portion}`
    .toLowerCase()
    .replace(/[\s，,。.;；:：、（）()]+/g, "")
    .slice(0, 180);
}

function withRecalculatedTotals(estimate: MealEstimate): MealEstimate {
  if (!estimate.items.length) return estimate;
  return {
    ...estimate,
    calories: estimate.items.reduce((sum, item) => sum + item.calories, 0),
    proteinG: estimate.items.reduce((sum, item) => sum + item.proteinG, 0),
    carbsG: estimate.items.reduce((sum, item) => sum + item.carbsG, 0),
    fatG: estimate.items.reduce((sum, item) => sum + item.fatG, 0),
  };
}

async function applyFoodMemory(DB: D1Database, estimate: MealEstimate) {
  if (!estimate.items.length) return estimate;
  let matched = 0;
  const items = await Promise.all(
    estimate.items.map(async (item) => {
      const memory = await DB.prepare(
        `SELECT calories, protein_g, carbs_g, fat_g
         FROM nutrition_food_memory WHERE key = ?`,
      )
        .bind(foodMemoryKey(item.name, item.portion))
        .first<{
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
        }>();
      if (!memory) return item;
      matched += 1;
      return {
        ...item,
        calories: memory.calories,
        proteinG: memory.protein_g,
        carbsG: memory.carbs_g,
        fatG: memory.fat_g,
      };
    }),
  );
  if (!matched) return estimate;
  return withRecalculatedTotals({
    ...estimate,
    provider: "local",
    model: "个人食物记忆",
    confidence: Math.max(estimate.confidence, 0.82),
    summary: `${estimate.summary} 已参考 ${matched} 条你曾经修正过的同类食物。`,
    items,
  });
}

function scaledItems(
  items: MealEstimate["items"],
  totals: Pick<MealEstimate, "calories" | "proteinG" | "carbsG" | "fatG">,
  fallbackName: string,
) {
  if (!items.length) {
    return [
      {
        name: fallbackName || "这餐",
        portion: "本次记录",
        ...totals,
      },
    ];
  }
  const current = {
    calories: items.reduce((sum, item) => sum + item.calories, 0),
    proteinG: items.reduce((sum, item) => sum + item.proteinG, 0),
    carbsG: items.reduce((sum, item) => sum + item.carbsG, 0),
    fatG: items.reduce((sum, item) => sum + item.fatG, 0),
  };
  return items.map((item, index) => {
    const last = index === items.length - 1;
    const ratio = (value: number, total: number, target: number) =>
      total > 0 ? (value / total) * target : target / items.length;
    return {
      ...item,
      calories: ratio(item.calories, current.calories, totals.calories),
      proteinG: ratio(item.proteinG, current.proteinG, totals.proteinG),
      carbsG: ratio(item.carbsG, current.carbsG, totals.carbsG),
      fatG: ratio(item.fatG, current.fatG, totals.fatG),
      portion: item.portion || (last ? "本次修正份量" : "估算份量"),
    };
  });
}

async function learnFoodMemory(DB: D1Database, estimate: MealEstimate) {
  if (!estimate.items.length) return;
  await DB.batch(
    estimate.items.map((item) =>
      DB.prepare(
        `INSERT INTO nutrition_food_memory
         (key, name, portion, calories, protein_g, carbs_g, fat_g,
          correction_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           calories = (
             nutrition_food_memory.calories * nutrition_food_memory.correction_count
             + excluded.calories
           ) / (nutrition_food_memory.correction_count + 1),
           protein_g = (
             nutrition_food_memory.protein_g * nutrition_food_memory.correction_count
             + excluded.protein_g
           ) / (nutrition_food_memory.correction_count + 1),
           carbs_g = (
             nutrition_food_memory.carbs_g * nutrition_food_memory.correction_count
             + excluded.carbs_g
           ) / (nutrition_food_memory.correction_count + 1),
           fat_g = (
             nutrition_food_memory.fat_g * nutrition_food_memory.correction_count
             + excluded.fat_g
           ) / (nutrition_food_memory.correction_count + 1),
           correction_count = nutrition_food_memory.correction_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        foodMemoryKey(item.name, item.portion),
        item.name,
        item.portion,
        item.calories,
        item.proteinG,
        item.carbsG,
        item.fatG,
      ),
    ),
  );
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
    const [meals, items, media, settings, water, corrections, memory] =
      await DB.batch([
      DB.prepare("SELECT * FROM meals ORDER BY eaten_at DESC LIMIT 1000"),
      DB.prepare("SELECT * FROM meal_items ORDER BY created_at ASC"),
      DB.prepare("SELECT id, meal_id, filename, content_type, size FROM meal_media"),
      DB.prepare("SELECT * FROM nutrition_settings WHERE id = 'default'"),
      DB.prepare(
        `SELECT id, glasses, logged_at FROM water_logs
         ORDER BY logged_at DESC LIMIT 1000`,
      ),
        DB.prepare(
          `SELECT meal_id, COUNT(*) AS correction_count,
                  MAX(created_at) AS last_corrected_at
           FROM meal_corrections GROUP BY meal_id`,
        ),
        DB.prepare("SELECT COUNT(*) AS value FROM nutrition_food_memory"),
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
    const correctionMap = new Map(
      (corrections.results as JsonObject[]).map((row) => [
        String(row.meal_id),
        {
          correctionCount: Number(row.correction_count) || 0,
          lastCorrectedAt: row.last_corrected_at,
        },
      ]),
    );
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
        correctionCount:
          correctionMap.get(String(row.id))?.correctionCount ?? 0,
        lastCorrectedAt:
          correctionMap.get(String(row.id))?.lastCorrectedAt ?? null,
      })),
      memoryCount:
        Number((memory.results[0] as JsonObject | undefined)?.value) || 0,
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
      let manualOverride = false;
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
        manualOverride = true;
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
      if (!manualOverride) {
        estimate = await applyFoodMemory(DB, estimate);
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
      const currentMeal = await DB.prepare(
        `SELECT meal_type, note, estimated_calories, protein_g, carbs_g, fat_g,
                confidence, analysis_provider
         FROM meals WHERE id = ?`,
      )
        .bind(id)
        .first<JsonObject>();
      if (!currentMeal) {
        return Response.json({ error: "没有找到这条餐食记录。" }, { status: 404 });
      }
      const currentItems = await DB.prepare(
        `SELECT name, portion, calories, protein_g, carbs_g, fat_g
         FROM meal_items WHERE meal_id = ? ORDER BY created_at ASC`,
      )
        .bind(id)
        .all<JsonObject>();
      const totals = {
        calories: numeric(payload.calories),
        proteinG: numeric(payload.proteinG),
        carbsG: numeric(payload.carbsG),
        fatG: numeric(payload.fatG),
      };
      const sourceItems = Array.isArray(payload.items)
        ? (payload.items as MealEstimate["items"])
        : currentItems.results.map((row) => ({
            name: text(row.name, 200),
            portion: text(row.portion, 200),
            calories: numeric(row.calories),
            proteinG: numeric(row.protein_g),
            carbsG: numeric(row.carbs_g),
            fatG: numeric(row.fat_g),
          }));
      const estimate: MealEstimate = {
        provider: "local" as const,
        model: "手动修正",
        summary: "已按手动输入修正。",
        confidence: 1,
        ...totals,
        items: scaledItems(
          sourceItems,
          totals,
          text(payload.note, 200) || text(payload.mealType, 20) || "这餐",
        ),
      };
      await DB.prepare(
        `INSERT INTO meal_corrections
         (id, meal_id, previous_values_json, corrected_values_json, reason)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          id,
          JSON.stringify({
            meal: currentMeal,
            items: currentItems.results,
          }),
          JSON.stringify({
            mealType: text(payload.mealType, 20),
            note: text(payload.note),
            estimate,
          }),
          text(payload.reason, 500) || "用户手动修正",
        )
        .run();
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
      await learnFoodMemory(DB, estimate);
      return Response.json({
        id,
        learnedItems: estimate.items.length,
        correctionSaved: true,
      });
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
