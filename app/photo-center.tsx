"use client";

/* eslint-disable @next/next/no-img-element -- Private R2 media is rendered from authenticated dynamic API routes. */

import {
  CalendarDays,
  Camera,
  Check,
  EyeOff,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Search,
  Share2,
  Sparkles,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PhotoRecord = {
  id: string;
  eventId: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  eventTitle: string;
  eventContent: string;
  eventKind: string;
  eventMood: string;
  eventTags: string[];
  eventPerson: string;
  eventPlace: string;
  eventProject: string;
  eventHappenedAt: string;
  caption: string;
  tags: string[];
  takenAt: string;
  place: string;
  latitude: number | null;
  longitude: number | null;
  album: string;
  isFavorite: boolean;
  coverDate: string | null;
  hiddenFromMemories: boolean;
  visionProvider: string;
  visionModel: string;
  sha256: string | null;
  perceptualHash: string | null;
  blurScore: number | null;
  duplicateOf: string | null;
  isScreenshot: boolean;
  insightNote: string;
  scannedAt: string | null;
};

type PhotoStory = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  coverMediaId: string | null;
  coverUrl: string;
  content: string;
  mediaIds: string[];
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
};

type PhotoPayload = {
  photos: PhotoRecord[];
  stories: PhotoStory[];
  stats: {
    total: number;
    screenshots: number;
    duplicates: number;
    blurry: number;
    favorites: number;
    uncaptioned: number;
    places: number;
  };
  todayCover: PhotoRecord | null;
  error?: string;
};

type PhotoFilter =
  | "all"
  | "ordinary"
  | "screenshot"
  | "duplicate"
  | "blurry"
  | "favorite"
  | "uncaptioned"
  | "places";

const filters: Array<{ id: PhotoFilter; label: string }> = [
  { id: "all", label: "全部照片" },
  { id: "ordinary", label: "生活照片" },
  { id: "screenshot", label: "截图" },
  { id: "duplicate", label: "重复 / 相似" },
  { id: "blurry", label: "模糊提醒" },
  { id: "favorite", label: "收藏" },
  { id: "uncaptioned", label: "待补说明" },
  { id: "places", label: "地点相册" },
];

function localDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "日期待确认"
    : parsed.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function dateInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 10);
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const format = (value: Date) => {
    const offset = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
  };
  return { start: format(start), end: format(end) };
}

function photosApiUrl() {
  return `/api/photos?timezoneOffset=${new Date().getTimezoneOffset()}`;
}

async function postPhotoAction(
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch("/api/photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(String(result.error ?? "照片操作失败。"));
  }
  return result;
}

async function imageMetrics(photo: PhotoRecord) {
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error(`读取 ${photo.filename} 失败`);
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const image = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法分析图片。");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const pixels = context.getImageData(0, 0, 64, 64).data;
  const grayscale: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    grayscale.push(
      pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114,
    );
  }
  const hashValues: number[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          sum += grayscale[(y * 4 + dy) * 64 + x * 4 + dx];
        }
      }
      hashValues.push(sum / 16);
    }
  }
  const average =
    hashValues.reduce((total, value) => total + value, 0) / hashValues.length;
  const perceptualHash = hashValues
    .map((value) => (value >= average ? "1" : "0"))
    .join("");
  const laplacian: number[] = [];
  for (let y = 1; y < 63; y += 1) {
    for (let x = 1; x < 63; x += 1) {
      const center = grayscale[y * 64 + x] * 4;
      const neighbors =
        grayscale[(y - 1) * 64 + x] +
        grayscale[(y + 1) * 64 + x] +
        grayscale[y * 64 + x - 1] +
        grayscale[y * 64 + x + 1];
      laplacian.push(center - neighbors);
    }
  }
  const laplacianMean =
    laplacian.reduce((total, value) => total + value, 0) / laplacian.length;
  const blurScore =
    laplacian.reduce(
      (total, value) => total + (value - laplacianMean) ** 2,
      0,
    ) / laplacian.length;
  const ratio = image.width / Math.max(1, image.height);
  const isScreenshot =
    /screenshot|截屏|截图/i.test(photo.filename) ||
    (image.height > 1000 &&
      (Math.abs(ratio - 9 / 16) < 0.035 ||
        Math.abs(ratio - 9 / 19.5) < 0.035));
  return { sha256, perceptualHash, blurScore, isScreenshot };
}

function hashDistance(left: string, right: string) {
  if (!left || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function PhotoCenter({
  onRecord,
  onNotice,
}: {
  onRecord: () => void;
  onNotice: (notice: string) => void;
}) {
  const [data, setData] = useState<PhotoPayload | null>(null);
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<PhotoRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [scanProgress, setScanProgress] = useState("");
  const [batchTags, setBatchTags] = useState("");
  const [batchAlbum, setBatchAlbum] = useState("");
  const [batchPlace, setBatchPlace] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [storyRange, setStoryRange] = useState(monthRange);

  async function loadPhotos() {
    const response = await fetch(photosApiUrl(), { cache: "no-store" });
    const payload = (await response.json()) as PhotoPayload;
    if (!response.ok) throw new Error(payload.error || "读取照片中心失败。");
    setData(payload);
    setActive((current) =>
      current
        ? payload.photos.find((photo) => photo.id === current.id) ?? null
        : null,
    );
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(photosApiUrl(), { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as PhotoPayload;
        if (!response.ok) {
          throw new Error(payload.error || "读取照片中心失败。");
        }
        if (!cancelled) setData(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          onNotice(error instanceof Error ? error.message : "读取照片中心失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onNotice]);

  const visiblePhotos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.photos ?? []).filter((photo) => {
      const matchesQuery =
        !normalized ||
        [
          photo.filename,
          photo.caption,
          photo.place,
          photo.album,
          photo.eventTitle,
          photo.eventContent,
          ...photo.tags,
          ...photo.eventTags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      if (!matchesQuery || photo.hiddenFromMemories) return false;
      if (filter === "ordinary") return !photo.isScreenshot;
      if (filter === "screenshot") return photo.isScreenshot;
      if (filter === "duplicate") return Boolean(photo.duplicateOf);
      if (filter === "blurry")
        return photo.blurScore !== null && photo.blurScore < 24;
      if (filter === "favorite") return photo.isFavorite;
      if (filter === "uncaptioned") return !photo.caption;
      return true;
    });
  }, [data, filter, query]);

  const placeGroups = useMemo(() => {
    const groups = new Map<string, PhotoRecord[]>();
    for (const photo of visiblePhotos) {
      const place = photo.place || "地点待补充";
      groups.set(place, [...(groups.get(place) ?? []), photo]);
    }
    return [...groups.entries()].sort((left, right) => right[1].length - left[1].length);
  }, [visiblePhotos]);

  const mapPhotos = visiblePhotos.filter(
    (photo) => photo.latitude !== null && photo.longitude !== null,
  );

  async function updatePhoto(
    photo: PhotoRecord,
    changes: Record<string, unknown>,
    success = "照片资料已保存。",
  ) {
    setBusy(`photo:${photo.id}`);
    try {
      await postPhotoAction("metadata.update", {
        mediaId: photo.id,
        ...changes,
      });
      await loadPhotos();
      onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "照片保存失败。");
    } finally {
      setBusy("");
    }
  }

  async function setCover(photo: PhotoRecord) {
    setBusy(`cover:${photo.id}`);
    try {
      await postPhotoAction("cover.set", {
        mediaId: photo.id,
        coverDate: dateInput(new Date().toISOString()),
      });
      await loadPhotos();
      onNotice("已设为今日封面。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "设置封面失败。");
    } finally {
      setBusy("");
    }
  }

  async function analyzePhoto(photo: PhotoRecord) {
    setBusy(`vision:${photo.id}`);
    try {
      const result = await postPhotoAction("vision.caption", {
        mediaId: photo.id,
      });
      await loadPhotos();
      const analysis = result.analysis as Record<string, unknown> | undefined;
      onNotice(
        analysis?.containsSensitiveInfo
          ? "AI 说明已生成；这张图可能包含敏感信息，分享前请检查。"
          : "AI 说明和标签已生成，请确认后继续编辑。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI 看图失败。");
    } finally {
      setBusy("");
    }
  }

  async function scanLibrary() {
    if (!data?.photos.length) return;
    setBusy("scan");
    try {
      const metrics: Array<
        Awaited<ReturnType<typeof imageMetrics>> & {
          mediaId: string;
          filename: string;
          duplicateOf: string | null;
          note: string;
        }
      > = [];
      const source = data.photos.slice(0, 300);
      for (let index = 0; index < source.length; index += 1) {
        const photo = source[index];
        setScanProgress(`${index + 1} / ${source.length}`);
        try {
          const result = await imageMetrics(photo);
          let duplicateOf: string | null = null;
          let note = result.blurScore < 24 ? "画面可能偏模糊" : "";
          const exact = metrics.find((item) => item.sha256 === result.sha256);
          if (exact) {
            duplicateOf = exact.mediaId;
            note = [note, "检测到完全相同的照片"].filter(Boolean).join("；");
          } else {
            const similar = metrics.find(
              (item) =>
                hashDistance(item.perceptualHash, result.perceptualHash) <= 16,
            );
            if (similar) {
              duplicateOf = similar.mediaId;
              note = [note, "检测到视觉相似的照片"].filter(Boolean).join("；");
            }
          }
          metrics.push({
            mediaId: photo.id,
            filename: photo.filename,
            duplicateOf,
            note,
            ...result,
          });
        } catch {
          // A single damaged image should not stop the library scan.
        }
      }
      await postPhotoAction("insights.save", { items: metrics });
      await loadPhotos();
      onNotice(`已整理 ${metrics.length} 张照片，完成重复、相似、截图和模糊检查。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "照片扫描失败。");
    } finally {
      setBusy("");
      setScanProgress("");
    }
  }

  async function applyBatch() {
    if (!selected.length) return;
    setBusy("batch");
    try {
      const changes: Record<string, unknown> = {};
      if (batchAlbum.trim()) changes.album = batchAlbum.trim();
      if (batchPlace.trim()) changes.place = batchPlace.trim();
      if (batchDate) changes.takenAt = `${batchDate}T12:00:00.000Z`;
      await postPhotoAction("batch.update", {
        mediaIds: selected,
        addTags: batchTags,
        changes,
      });
      setSelected([]);
      setBatchTags("");
      setBatchAlbum("");
      setBatchPlace("");
      setBatchDate("");
      await loadPhotos();
      onNotice("批量整理已保存。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "批量整理失败。");
    } finally {
      setBusy("");
    }
  }

  async function safeShare(photo: PhotoRecord) {
    setBusy(`share:${photo.id}`);
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const image = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法生成隐私副本。");
      context.drawImage(image, 0, 0);
      image.close();
      const safeBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!safeBlob) throw new Error("生成隐私副本失败。");
      const file = new File(
        [safeBlob],
        `隐私副本-${photo.filename.replace(/\.[^.]+$/, "")}.jpg`,
        { type: "image/jpeg" },
      );
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: photo.caption || photo.eventTitle || "生活照片",
        });
      } else {
        const url = URL.createObjectURL(safeBlob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      onNotice("已生成不含原始 EXIF 的隐私副本。");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      onNotice(error instanceof Error ? error.message : "分享失败。");
    } finally {
      setBusy("");
    }
  }

  async function generateStory() {
    setBusy("story");
    try {
      await postPhotoAction("story.generate", {
        periodStart: storyRange.start,
        periodEnd: storyRange.end,
        timezoneOffset: new Date().getTimezoneOffset(),
      });
      await loadPhotos();
      onNotice("照片故事已经生成，并保留了可回溯的来源照片。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "生成照片故事失败。");
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <section className="photo-loading">
        <LoaderCircle className="spin" size={26} />
        <span>正在整理照片回忆…</span>
      </section>
    );
  }

  if (!data.photos.length) {
    return (
      <section className="photo-empty">
        <div className="photo-empty-icon">
          <Camera size={34} />
        </div>
        <span className="eyebrow">PHOTO MEMORIES</span>
        <h1>从第一张照片开始，建立可以被理解的生活相册</h1>
        <p>照片会与发生时间、地点、标签和生活记录一起保存，也可以由 AI 辅助生成说明。</p>
        <button className="primary-button" onClick={onRecord}>
          <Upload size={17} /> 上传并记录
        </button>
      </section>
    );
  }

  return (
    <section className="photo-center">
      <div className="photo-heading">
        <div>
          <span className="eyebrow">PHOTO MEMORY CENTER</span>
          <h1>照片回忆中心</h1>
          <p>整理重复与截图，补上地点和故事，让每张照片都能回到真实生活。</p>
        </div>
        <div className="photo-heading-actions">
          <button className="secondary-button" onClick={() => void scanLibrary()}>
            {busy === "scan" ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Search size={17} />
            )}
            {busy === "scan" ? `整理中 ${scanProgress}` : "扫描与整理"}
          </button>
          <button className="primary-button" onClick={onRecord}>
            <Upload size={17} /> 上传照片
          </button>
        </div>
      </div>

      <div className="photo-stats">
        {[
          ["全部", data.stats.total],
          ["截图", data.stats.screenshots],
          ["重复 / 相似", data.stats.duplicates],
          ["模糊提醒", data.stats.blurry],
          ["收藏", data.stats.favorites],
          ["待补说明", data.stats.uncaptioned],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>

      {data.todayCover && (
        <article className="photo-cover">
          <img
            src={data.todayCover.url}
            alt={data.todayCover.caption || data.todayCover.filename}
            loading="lazy"
            decoding="async"
          />
          <div className="photo-cover-shade" />
          <div className="photo-cover-copy">
            <span>今日封面 · {localDate(data.todayCover.takenAt)}</span>
            <h2>
              {data.todayCover.caption ||
                data.todayCover.eventTitle ||
                "今天值得被记住"}
            </h2>
            <p>
              {[data.todayCover.place, data.todayCover.album]
                .filter(Boolean)
                .join(" · ") || "地点与相册待补充"}
            </p>
            <button onClick={() => setActive(data.todayCover)}>
              查看照片资料
            </button>
          </div>
        </article>
      )}

      <div className="photo-toolbar">
        <div className="photo-filter-list">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="photo-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索说明、标签、相册、地点"
          />
        </label>
      </div>

      {selected.length > 0 && (
        <div className="photo-batch-bar">
          <strong>已选 {selected.length} 张</strong>
          <input
            value={batchTags}
            onChange={(event) => setBatchTags(event.target.value)}
            placeholder="添加标签，用空格分隔"
          />
          <input
            value={batchAlbum}
            onChange={(event) => setBatchAlbum(event.target.value)}
            placeholder="移动到相册"
          />
          <input
            value={batchPlace}
            onChange={(event) => setBatchPlace(event.target.value)}
            placeholder="统一地点"
          />
          <input
            type="date"
            value={batchDate}
            onChange={(event) => setBatchDate(event.target.value)}
          />
          <button onClick={() => void applyBatch()} disabled={busy === "batch"}>
            {busy === "batch" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            应用
          </button>
          <button className="quiet" onClick={() => setSelected([])}>
            取消
          </button>
        </div>
      )}

      {filter === "places" ? (
        <div className="photo-place-layout">
          <div className="photo-place-map">
            <div className="photo-map-grid" />
            <div className="photo-map-copy">
              <MapPin size={21} />
              <strong>{data.stats.places} 个地点</strong>
              <span>
                {mapPhotos.length
                  ? `${mapPhotos.length} 张照片已有坐标`
                  : "在照片资料里补充经纬度后，会显示足迹分布"}
              </span>
            </div>
            {mapPhotos.map((photo) => {
              const left = ((Number(photo.longitude) + 180) / 360) * 100;
              const top = ((90 - Number(photo.latitude)) / 180) * 100;
              return (
                <button
                  key={photo.id}
                  className="photo-map-point"
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={photo.place}
                  onClick={() => setActive(photo)}
                />
              );
            })}
          </div>
          <div className="photo-place-groups">
            {placeGroups.map(([place, photos]) => (
              <button key={place} onClick={() => setActive(photos[0])}>
                <div>
                  {photos.slice(0, 3).map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
                <span>
                  <strong>{place}</strong>
                  <small>{photos.length} 张照片</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="photo-grid">
          {visiblePhotos.map((photo, index) => {
            const checked = selected.includes(photo.id);
            return (
              <article
                key={photo.id}
                className={`photo-tile photo-shape-${index % 7} ${
                  checked ? "selected" : ""
                }`}
              >
                <button
                  className="photo-tile-image"
                  onClick={() => setActive(photo)}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || photo.filename}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <button
                  className={`photo-selector ${checked ? "checked" : ""}`}
                  aria-label={checked ? "取消选择照片" : "选择照片"}
                  onClick={() =>
                    setSelected((current) =>
                      checked
                        ? current.filter((id) => id !== photo.id)
                        : [...current, photo.id],
                    )
                  }
                >
                  {checked && <Check size={13} />}
                </button>
                <div className="photo-tile-badges">
                  {photo.isFavorite && <span>♥ 收藏</span>}
                  {photo.isScreenshot && <span>截图</span>}
                  {photo.duplicateOf && <span>相似</span>}
                  {photo.blurScore !== null && photo.blurScore < 24 && (
                    <span>偏模糊</span>
                  )}
                </div>
                <div className="photo-tile-meta">
                  <strong>
                    {photo.caption ||
                      photo.eventTitle ||
                      photo.eventContent ||
                      "说明待补充"}
                  </strong>
                  <span>
                    {localDate(photo.takenAt)}
                    {photo.place ? ` · ${photo.place}` : ""}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!visiblePhotos.length && (
        <div className="photo-no-result">
          <ImageIcon size={28} />
          <strong>当前条件下没有照片</strong>
          <span>可以切换分类，或清空搜索关键词。</span>
        </div>
      )}

      <section className="photo-story-section">
        <div className="photo-section-heading">
          <div>
            <span className="eyebrow">PHOTO STORIES</span>
            <h2>照片故事</h2>
            <p>按一段真实时间生成回顾，并保留全部来源照片。</p>
          </div>
          <div className="photo-story-create">
            <input
              type="date"
              value={storyRange.start}
              onChange={(event) =>
                setStoryRange((current) => ({
                  ...current,
                  start: event.target.value,
                }))
              }
            />
            <span>至</span>
            <input
              type="date"
              value={storyRange.end}
              onChange={(event) =>
                setStoryRange((current) => ({
                  ...current,
                  end: event.target.value,
                }))
              }
            />
            <button onClick={() => void generateStory()} disabled={busy === "story"}>
              {busy === "story" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              生成故事
            </button>
          </div>
        </div>
        <div className="photo-story-list">
          {data.stories.map((story) => (
            <article key={story.id}>
              {story.coverUrl ? (
                <img
                  src={story.coverUrl}
                  alt={story.title}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="photo-story-placeholder">
                  <ImageIcon size={25} />
                </div>
              )}
              <div>
                <span>
                  {localDate(story.periodStart)} — {localDate(story.periodEnd)}
                </span>
                <h3>{story.title}</h3>
                <p>{story.content}</p>
                <small>
                  {story.mediaIds.length} 张来源照片 ·{" "}
                  {story.generatedBy === "local"
                    ? "本地整理"
                    : `AI ${story.generatedBy}`}
                </small>
              </div>
            </article>
          ))}
          {!data.stories.length && (
            <div className="photo-story-empty">
              <Sparkles size={22} />
              <span>选择一段日期，生成第一篇照片故事。</span>
            </div>
          )}
        </div>
      </section>

      {active && (
        <PhotoDetail
          key={`${active.id}:${active.caption}:${active.tags.join(",")}`}
          photo={active}
          busy={busy}
          onClose={() => setActive(null)}
          onSave={(changes) => void updatePhoto(active, changes)}
          onFavorite={() =>
            void updatePhoto(
              active,
              { isFavorite: !active.isFavorite },
              active.isFavorite ? "已取消收藏。" : "已收藏。",
            )
          }
          onHide={() =>
            void updatePhoto(
              active,
              { hiddenFromMemories: true },
              "已从普通相册和默认回顾中隐藏，可在数据导出中保留。",
            )
          }
          onCover={() => void setCover(active)}
          onAnalyze={() => void analyzePhoto(active)}
          onShare={() => void safeShare(active)}
        />
      )}
    </section>
  );
}

function PhotoDetail({
  photo,
  busy,
  onClose,
  onSave,
  onFavorite,
  onHide,
  onCover,
  onAnalyze,
  onShare,
}: {
  photo: PhotoRecord;
  busy: string;
  onClose: () => void;
  onSave: (changes: Record<string, unknown>) => void;
  onFavorite: () => void;
  onHide: () => void;
  onCover: () => void;
  onAnalyze: () => void;
  onShare: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption);
  const [tagText, setTagText] = useState(photo.tags.join(" "));
  const [takenAt, setTakenAt] = useState(dateInput(photo.takenAt));
  const [place, setPlace] = useState(photo.place);
  const [album, setAlbum] = useState(photo.album);
  const [latitude, setLatitude] = useState(
    photo.latitude === null ? "" : String(photo.latitude),
  );
  const [longitude, setLongitude] = useState(
    photo.longitude === null ? "" : String(photo.longitude),
  );

  return (
    <div className="photo-detail-backdrop" onMouseDown={onClose}>
      <aside
        className="photo-detail"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">PHOTO DETAILS</span>
            <strong>照片资料</strong>
          </div>
          <button onClick={onClose} aria-label="关闭照片资料">
            <X size={19} />
          </button>
        </header>
        <div className="photo-detail-image">
          <img
            src={photo.url}
            alt={photo.caption || photo.filename}
            loading="lazy"
            decoding="async"
          />
          <div>
            {photo.isScreenshot && <span>截图</span>}
            {photo.duplicateOf && <span>重复 / 相似</span>}
            {photo.blurScore !== null && photo.blurScore < 24 && (
              <span>可能偏模糊</span>
            )}
          </div>
        </div>
        <div className="photo-detail-actions">
          <button onClick={onFavorite}>
            <Heart
              size={16}
              fill={photo.isFavorite ? "currentColor" : "none"}
            />
            {photo.isFavorite ? "已收藏" : "收藏"}
          </button>
          <button onClick={onCover}>
            <ImageIcon size={16} /> 今日封面
          </button>
          <button onClick={onShare}>
            {busy === `share:${photo.id}` ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Share2 size={16} />
            )}
            隐私分享
          </button>
          <button onClick={onAnalyze}>
            {busy === `vision:${photo.id}` ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            AI 看图
          </button>
        </div>
        <div className="photo-detail-form">
          <label className="photo-wide-field">
            <span>照片说明</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="这张照片发生了什么？"
            />
          </label>
          <label>
            <span>
              <Tags size={14} /> 标签
            </span>
            <input
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="旅行 朋友 晚霞"
            />
          </label>
          <label>
            <span>
              <CalendarDays size={14} /> 拍摄日期
            </span>
            <input
              type="date"
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
            />
          </label>
          <label>
            <span>
              <MapPin size={14} /> 地点
            </span>
            <input
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="城市、学校或景点"
            />
          </label>
          <label>
            <span>
              <ImageIcon size={14} /> 相册
            </span>
            <input
              value={album}
              onChange={(event) => setAlbum(event.target.value)}
              placeholder="例如：毕业季"
            />
          </label>
          <label>
            <span>纬度（可选）</span>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="39.9042"
            />
          </label>
          <label>
            <span>经度（可选）</span>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="116.4074"
            />
          </label>
        </div>
        {photo.visionModel && (
          <p className="photo-ai-source">
            <Sparkles size={14} />
            说明来源：{photo.visionProvider} · {photo.visionModel}
          </p>
        )}
        {photo.insightNote && (
          <p className="photo-insight-note">{photo.insightNote}</p>
        )}
        <footer>
          <button className="photo-hide-button" onClick={onHide}>
            <EyeOff size={15} /> 从普通相册与回顾中隐藏
          </button>
          <button
            className="primary-button"
            disabled={busy === `photo:${photo.id}`}
            onClick={() =>
              onSave({
                caption,
                tags: tagText,
                takenAt: takenAt ? `${takenAt}T12:00:00.000Z` : "",
                place,
                album,
                latitude,
                longitude,
              })
            }
          >
            {busy === `photo:${photo.id}` ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            保存资料
          </button>
        </footer>
      </aside>
    </div>
  );
}
