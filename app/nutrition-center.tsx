"use client";

import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Edit3,
  Flame,
  Info,
  LoaderCircle,
  Plus,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type MealItem = {
  id: string;
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type MealPhoto = {
  id: string;
  filename: string;
  url: string;
};

type Meal = {
  id: string;
  mealType: string;
  eatenAt: string;
  note: string;
  estimatedCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  analysisProvider: string;
  items: MealItem[];
  photos: MealPhoto[];
};

type NutritionData = {
  meals: Meal[];
  settings: {
    calorieTarget: number;
    proteinTarget: number;
    carbsTarget: number;
    fatTarget: number;
    waterTarget: number;
  };
  water: Array<{ id: string; glasses: number; loggedAt: string }>;
};

const emptyNutrition: NutritionData = {
  meals: [],
  settings: {
    calorieTarget: 2000,
    proteinTarget: 90,
    carbsTarget: 250,
    fatTarget: 65,
    waterTarget: 8,
  },
  water: [],
};

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

async function prepareMealPhoto(file: File) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= 1600 && file.size <= 3.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, 1600 / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84),
    );
    return blob
      ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: file.lastModified,
        })
      : file;
  } catch {
    return file;
  }
}

function mealIcon(type: string) {
  if (type === "早餐") return "朝";
  if (type === "午餐") return "昼";
  if (type === "晚餐") return "暮";
  return "加";
}

function ProgressMetric({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
}) {
  const percent = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="nutrition-metric">
      <header>
        <span>{label}</span>
        <strong>
          {Math.round(value)}
          <small>/{target}{unit}</small>
        </strong>
      </header>
      <div>
        <span style={{ width: `${percent}%`, background: color }} />
      </div>
      <small>{percent}%</small>
    </div>
  );
}

export function NutritionCenter({
  onNotice,
  initialPhoto,
  onInitialPhotoConsumed,
}: {
  onNotice: (notice: string) => void;
  initialPhoto?: File | null;
  onInitialPhotoConsumed?: () => void;
}) {
  const [data, setData] = useState<NutritionData>(emptyNutrition);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [manual, setManual] = useState(false);
  const [lastEstimate, setLastEstimate] = useState<{
    summary: string;
    provider: string;
    confidence: number;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/nutrition", { cache: "no-store" });
      const payload = (await response.json()) as NutritionData & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "读取饮食记录失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The initial nutrition request runs only when the center is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialPhoto) return;
    const timer = window.setTimeout(async () => {
      const prepared = await prepareMealPhoto(initialPhoto);
      setPhoto(prepared);
      setModalOpen(true);
      onInitialPhotoConsumed?.();
      if (prepared.size < initialPhoto.size) {
        onNotice("餐食照片已在本机压缩，原图不会被修改。");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialPhoto, onInitialPhotoConsumed, onNotice]);

  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : "";
    const timer = window.setTimeout(() => setPreview(url), 0);
    return () => {
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const dayMeals = data.meals.filter(
    (meal) => dateKey(meal.eatenAt) === dateKey(selectedDate),
  );
  const totals = dayMeals.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.estimatedCalories,
      protein: sum.protein + meal.proteinG,
      carbs: sum.carbs + meal.carbsG,
      fat: sum.fat + meal.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const waterGlasses = data.water
    .filter((item) => dateKey(item.loggedAt) === dateKey(selectedDate))
    .reduce((sum, item) => sum + item.glasses, 0);

  const sevenDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 6)).map(
        (date) => {
          const meals = data.meals.filter(
            (meal) => dateKey(meal.eatenAt) === dateKey(date),
          );
          return {
            date,
            calories: meals.reduce(
              (sum, meal) => sum + meal.estimatedCalories,
              0,
            ),
          };
        },
      ),
    [data.meals],
  );
  const chartMax = Math.max(
    data.settings.calorieTarget,
    ...sevenDays.map((item) => item.calories),
  );

  async function saveMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      if (photo) form.set("photo", photo);
      const response = await fetch("/api/nutrition", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        error?: string;
        estimate?: {
          summary: string;
          provider: string;
          confidence: number;
        };
      };
      if (!response.ok) throw new Error(result.error || "保存失败。");
      setLastEstimate(result.estimate ?? null);
      setModalOpen(false);
      setPhoto(null);
      setManual(false);
      await load();
      onNotice(
        result.estimate?.provider === "local"
          ? "餐食已记录；当前使用文字或手动估算。"
          : "餐食照片识别完成，热量已加入今日摄入。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存餐食失败。");
    } finally {
      setSaving(false);
    }
  }

  async function nutritionAction(
    action: string,
    payload: Record<string, unknown>,
  ) {
    const response = await fetch("/api/nutrition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error || "操作失败。");
    }
  }

  async function addWater() {
    try {
      await nutritionAction("water.add", {
        glasses: 1,
        loggedAt: selectedDate.toISOString(),
      });
      await load();
      onNotice("已记录一杯水。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "记录饮水失败。");
    }
  }

  async function deleteMeal(meal: Meal) {
    if (!window.confirm(`删除这条${meal.mealType}记录？`)) return;
    await nutritionAction("meal.delete", { id: meal.id });
    await load();
    onNotice("餐食记录已删除。");
  }

  async function editMeal(meal: Meal) {
    const calories = window.prompt(
      "修正总热量（千卡）",
      String(Math.round(meal.estimatedCalories)),
    );
    if (calories === null) return;
    const protein = window.prompt("修正蛋白质（克）", String(meal.proteinG));
    if (protein === null) return;
    const carbs = window.prompt("修正碳水（克）", String(meal.carbsG));
    if (carbs === null) return;
    const fat = window.prompt("修正脂肪（克）", String(meal.fatG));
    if (fat === null) return;
    await nutritionAction("meal.update", {
      id: meal.id,
      mealType: meal.mealType,
      note: meal.note,
      calories,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
      items: meal.items,
    });
    await load();
    onNotice("营养数据已按你的输入修正。");
  }

  async function editTargets() {
    const calorieTarget = window.prompt(
      "每日热量目标（千卡）",
      String(data.settings.calorieTarget),
    );
    if (calorieTarget === null) return;
    const proteinTarget = window.prompt(
      "每日蛋白质目标（克）",
      String(data.settings.proteinTarget),
    );
    if (proteinTarget === null) return;
    const carbsTarget = window.prompt(
      "每日碳水目标（克）",
      String(data.settings.carbsTarget),
    );
    if (carbsTarget === null) return;
    const fatTarget = window.prompt(
      "每日脂肪目标（克）",
      String(data.settings.fatTarget),
    );
    if (fatTarget === null) return;
    const waterTarget = window.prompt(
      "每日饮水目标（杯）",
      String(data.settings.waterTarget),
    );
    if (waterTarget === null) return;
    try {
      await nutritionAction("settings.update", {
        calorieTarget,
        proteinTarget,
        carbsTarget,
        fatTarget,
        waterTarget,
      });
      await load();
      onNotice("每日营养目标已更新。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "更新目标失败。");
    }
  }

  if (loading) {
    return (
      <div className="advanced-loading">
        <LoaderCircle className="spin" size={22} />
        正在读取饮食与营养…
      </div>
    );
  }

  return (
    <section className="standard-page nutrition-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">MEALS & NUTRITION</span>
          <h1>记录一日三餐，也看见身体需要什么</h1>
          <p>上传餐食照片、确认份量，追踪每日热量和三大营养素。</p>
        </div>
        <button className="primary-button" onClick={() => setModalOpen(true)}>
          <Camera size={17} /> 拍照记录一餐
        </button>
      </div>

      <div className="nutrition-datebar">
        <button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
          <ChevronLeft size={17} />
        </button>
        <div>
          <strong>
            {dateKey(selectedDate) === dateKey(new Date())
              ? "今天"
              : selectedDate.toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                })}
          </strong>
          <span>
            {selectedDate.toLocaleDateString("zh-CN", { weekday: "long" })}
          </span>
        </div>
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          disabled={dateKey(selectedDate) === dateKey(new Date())}
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="nutrition-summary">
        <article className="calorie-orbit">
          <div
            style={{
              background: `conic-gradient(#76528b ${Math.min(
                100,
                (totals.calories / data.settings.calorieTarget) * 100,
              )}%, #eee7df 0)`,
            }}
          >
            <span>
              <Flame size={21} />
              <strong>{Math.round(totals.calories)}</strong>
              <small>千卡</small>
            </span>
          </div>
          <p>
            目标 {data.settings.calorieTarget} 千卡 · 剩余{" "}
            {Math.max(0, Math.round(data.settings.calorieTarget - totals.calories))}
          </p>
        </article>
        <section className="macro-panel">
          <ProgressMetric
            label="蛋白质"
            value={totals.protein}
            target={data.settings.proteinTarget}
            unit="g"
            color="#a65d68"
          />
          <ProgressMetric
            label="碳水"
            value={totals.carbs}
            target={data.settings.carbsTarget}
            unit="g"
            color="#d49a45"
          />
          <ProgressMetric
            label="脂肪"
            value={totals.fat}
            target={data.settings.fatTarget}
            unit="g"
            color="#6d9480"
          />
        </section>
        <article className="water-card">
          <Droplets size={24} />
          <strong>{waterGlasses}/{data.settings.waterTarget}</strong>
          <span>今日饮水（杯）</span>
          <button onClick={addWater}>
            <Plus size={14} /> 喝一杯
          </button>
        </article>
      </div>

      {lastEstimate && (
        <div className="estimate-notice">
          <Sparkles size={17} />
          <div>
            <strong>
              {lastEstimate.provider === "local"
                ? "本地估算"
                : `${lastEstimate.provider.toUpperCase()} 照片识别`}
            </strong>
            <p>{lastEstimate.summary}</p>
          </div>
          <em>可信度 {Math.round(lastEstimate.confidence * 100)}%</em>
          <button onClick={() => setLastEstimate(null)} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="nutrition-layout">
        <section className="meal-timeline">
          <header>
            <div>
              <span className="eyebrow">MEAL TIMELINE</span>
              <h2>今天吃了什么</h2>
            </div>
            <em>{dayMeals.length} 餐</em>
          </header>
          {dayMeals.length ? (
            dayMeals.map((meal) => (
              <article className="meal-card" key={meal.id}>
                <span className="meal-mark">{mealIcon(meal.mealType)}</span>
                <div className="meal-content">
                  <header>
                    <div>
                      <strong>{meal.mealType}</strong>
                      <time>
                        {new Date(meal.eatenAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <span className={`provider-${meal.analysisProvider}`}>
                      {meal.analysisProvider === "local"
                        ? "本地/手动"
                        : `${meal.analysisProvider.toUpperCase()} 识别`}
                    </span>
                  </header>
                  {meal.photos[0] && (
                    <img
                      src={meal.photos[0].url}
                      alt={meal.photos[0].filename}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <p>{meal.note || "已根据照片估算餐食内容。"}</p>
                  <div className="meal-items">
                    {meal.items.map((item) => (
                      <span key={item.id}>
                        <strong>{item.name}</strong>
                        <small>
                          {item.portion} · {Math.round(item.calories)} 千卡
                        </small>
                      </span>
                    ))}
                  </div>
                  <div className="meal-macros">
                    <strong>{Math.round(meal.estimatedCalories)} 千卡</strong>
                    <span>蛋白 {Math.round(meal.proteinG)}g</span>
                    <span>碳水 {Math.round(meal.carbsG)}g</span>
                    <span>脂肪 {Math.round(meal.fatG)}g</span>
                  </div>
                </div>
                <div className="meal-actions">
                  <button onClick={() => editMeal(meal)} aria-label="修正营养">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => deleteMeal(meal)} aria-label="删除餐食">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <button className="meal-empty" onClick={() => setModalOpen(true)}>
              <Utensils size={28} />
              <strong>还没有记录这一天的餐食</strong>
              <span>拍一张照片，或者输入吃了什么</span>
            </button>
          )}
        </section>

        <aside className="nutrition-aside">
          <section className="weekly-calories">
            <header>
              <div>
                <span className="eyebrow">7 DAY TREND</span>
                <h2>近七日热量</h2>
              </div>
              <button
                className="nutrition-settings"
                onClick={editTargets}
                title="设置营养目标"
              >
                <Settings2 size={15} /> 目标
              </button>
            </header>
            <div className="calorie-chart">
              {sevenDays.map((item) => (
                <div key={dateKey(item.date)}>
                  <span>
                    <i
                      style={{
                        height: `${Math.max(
                          3,
                          (item.calories / chartMax) * 100,
                        )}%`,
                      }}
                    />
                  </span>
                  <strong>
                    {item.calories ? Math.round(item.calories) : "—"}
                  </strong>
                  <small>
                    {item.date.toLocaleDateString("zh-CN", { weekday: "narrow" })}
                  </small>
                </div>
              ))}
            </div>
            <div className="target-line">
              <Target size={14} />
              每日目标 {data.settings.calorieTarget} 千卡
            </div>
          </section>
          <section className="nutrition-disclaimer">
            <Info size={18} />
            <div>
              <strong>关于热量估算</strong>
              <p>
                照片无法精确判断油、调味料和隐藏食材，结果只用于日常记录。请根据实际份量修正，不作为医疗、营养治疗或进食障碍建议。
              </p>
            </div>
          </section>
        </aside>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card meal-modal" role="dialog" aria-modal="true">
            <header className="modal-head">
              <div>
                <span className="eyebrow">NEW MEAL</span>
                <h2>记录一餐</h2>
                <p>照片与文字越清楚，份量估算越可靠。</p>
              </div>
              <button onClick={() => setModalOpen(false)} aria-label="关闭">
                <X size={19} />
              </button>
            </header>
            <form onSubmit={saveMeal}>
              <div className="meal-type-picker">
                {["早餐", "午餐", "晚餐", "加餐"].map((type) => (
                  <label key={type}>
                    <input
                      type="radio"
                      name="mealType"
                      value={type}
                      defaultChecked={
                        type ===
                        (new Date().getHours() < 10
                          ? "早餐"
                          : new Date().getHours() < 15
                            ? "午餐"
                            : "晚餐")
                      }
                    />
                    <span>{mealIcon(type)}</span>
                    {type}
                  </label>
                ))}
              </div>
              <label className={`meal-photo-drop ${preview ? "has-photo" : ""}`}>
                {preview ? (
                  <img src={preview} alt="餐食照片预览" />
                ) : (
                  <>
                    <Camera size={27} />
                    <strong>上传餐食照片</strong>
                    <span>支持手机拍照或从相册选择</span>
                  </>
                )}
                <input
                  type="file"
                  name="photo"
                  accept="image/*"
                  capture="environment"
                  onChange={async (event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) {
                      setPhoto(null);
                      return;
                    }
                    const prepared = await prepareMealPhoto(selected);
                    setPhoto(prepared);
                    if (prepared.size < selected.size) {
                      onNotice("照片已在本机压缩，原图不会被修改。");
                    }
                  }}
                />
              </label>
              <label>
                <span>吃了什么、份量大约多少</span>
                <textarea
                  name="note"
                  placeholder="例如：一碗米饭、番茄炒蛋和一小盘青菜。即使上传照片，也建议补充看不清的食材。"
                />
              </label>
              <label>
                <span>用餐时间</span>
                <input
                  name="eatenAt"
                  type="datetime-local"
                  defaultValue={localDateTime(selectedDate)}
                />
              </label>
              <button
                type="button"
                className="manual-toggle"
                onClick={() => setManual(!manual)}
              >
                <Edit3 size={14} />
                {manual ? "收起手动营养数据" : "我知道热量，手动填写"}
              </button>
              {manual && (
                <div className="manual-nutrition-grid">
                  <label>
                    <span>热量 kcal</span>
                    <input name="calories" type="number" min="0" />
                  </label>
                  <label>
                    <span>蛋白质 g</span>
                    <input name="proteinG" type="number" min="0" step="0.1" />
                  </label>
                  <label>
                    <span>碳水 g</span>
                    <input name="carbsG" type="number" min="0" step="0.1" />
                  </label>
                  <label>
                    <span>脂肪 g</span>
                    <input name="fatG" type="number" min="0" step="0.1" />
                  </label>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModalOpen(false)}
                >
                  取消
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {saving ? "正在识别与估算…" : "保存并估算营养"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
