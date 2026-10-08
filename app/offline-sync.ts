"use client";

export type OfflineMutation = {
  id: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  action: "event.create" | "event.update" | "inbox.create";
  baseRevision: number;
  payload: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "conflict" | "failed";
  error: string;
  serverCurrent?: Record<string, unknown> | null;
};

const databaseName = "richangyu-offline-v1";
const storeName = "mutations";
const assetStoreName = "assets";
const changeEvent = "richangyu-sync-change";

type OfflineAsset = {
  id: string;
  mutationId: string;
  filename: string;
  contentType: string;
  blob: Blob;
};

export type OfflineDiagnostics = {
  deviceId: string;
  deviceName: string;
  platform: string;
  standalone: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  mutationCount: number;
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
  assetCount: number;
  assetBytes: number;
  oldestQueuedAt: string | null;
  lastSyncedAt: string | null;
  network: {
    online: boolean;
    effectiveType: string;
    downlinkMbps: number | null;
    saveData: boolean;
  };
};

export function getDeviceId() {
  const key = "richangyu-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function detectPlatform() {
  const agent = window.navigator.userAgent;
  if (/Android/i.test(agent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(agent)) return "iOS";
  if (/Windows/i.test(agent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "macOS";
  if (/Linux/i.test(agent)) return "Linux";
  return "网页设备";
}

export function getDeviceName() {
  const key = "richangyu-device-name";
  const saved = window.localStorage.getItem(key)?.trim();
  if (saved) return saved;
  const platform = detectPlatform();
  const mobile = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  const created = `${mobile ? "手机" : "电脑"} · ${platform}`;
  window.localStorage.setItem(key, created);
  return created;
}

export function setDeviceName(name: string) {
  const normalized = name.trim().slice(0, 40);
  if (!normalized) throw new Error("设备名称不能为空。");
  window.localStorage.setItem("richangyu-device-name", normalized);
  notifyChange();
  return normalized;
}

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("status", "status");
      }
      if (!database.objectStoreNames.contains(assetStoreName)) {
        const assets = database.createObjectStore(assetStoreName, {
          keyPath: "id",
        });
        assets.createIndex("mutationId", "mutationId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withAssetStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(assetStoreName, mode);
    const request = operation(transaction.objectStore(assetStoreName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent(changeEvent));
}

export async function listOfflineMutations() {
  const rows = await withStore<OfflineMutation[]>("readonly", (store) =>
    store.getAll(),
  );
  return [...rows].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export async function getOfflineDiagnostics(): Promise<OfflineDiagnostics> {
  const [mutations, assets] = await Promise.all([
    listOfflineMutations(),
    withAssetStore<OfflineAsset[]>("readonly", (store) => store.getAll()),
  ]);
  const connection = (
    window.navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        saveData?: boolean;
      };
    }
  ).connection;
  return {
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    platform: detectPlatform(),
    standalone: isStandalone(),
    notificationPermission:
      "Notification" in window ? Notification.permission : "unsupported",
    mutationCount: mutations.length,
    pendingCount: mutations.filter((item) => item.status === "pending").length,
    conflictCount: mutations.filter((item) => item.status === "conflict").length,
    failedCount: mutations.filter((item) => item.status === "failed").length,
    assetCount: assets.length,
    assetBytes: assets.reduce((sum, asset) => sum + asset.blob.size, 0),
    oldestQueuedAt: mutations[0]?.createdAt ?? null,
    lastSyncedAt: window.localStorage.getItem("richangyu-last-synced-at"),
    network: {
      online: window.navigator.onLine,
      effectiveType: connection?.effectiveType || "未知",
      downlinkMbps:
        typeof connection?.downlink === "number" ? connection.downlink : null,
      saveData: Boolean(connection?.saveData),
    },
  };
}

export async function updateDeviceSession(
  diagnostics?: OfflineDiagnostics,
) {
  const state = diagnostics ?? (await getOfflineDiagnostics());
  const response = await fetch("/api/sync", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: state.deviceId,
      name: state.deviceName,
      platform: state.platform,
      appVersion: "1.6.0",
      standalone: state.standalone,
      notificationPermission: state.notificationPermission,
      pendingCount: state.pendingCount,
      conflictCount: state.conflictCount,
      failedCount: state.failedCount,
      lastSyncedAt: state.lastSyncedAt,
    }),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || "设备状态登记失败。");
  return result;
}

export async function exportOfflineQueue() {
  const [mutations, assets] = await Promise.all([
    listOfflineMutations(),
    withAssetStore<OfflineAsset[]>("readonly", (store) => store.getAll()),
  ]);
  return {
    format: "richangyu-offline-diagnostics",
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    mutations,
    assets: assets.map((asset) => ({
      id: asset.id,
      mutationId: asset.mutationId,
      filename: asset.filename,
      contentType: asset.contentType,
      size: asset.blob.size,
    })),
  };
}

export async function enqueueOfflineMutation({
  action,
  entityId = crypto.randomUUID(),
  baseRevision = 0,
  payload,
}: {
  action: OfflineMutation["action"];
  entityId?: string;
  baseRevision?: number;
  payload: Record<string, unknown>;
}) {
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    deviceId: getDeviceId(),
    entityType: action.split(".")[0],
    entityId,
    action,
    baseRevision,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    error: "",
  };
  await withStore<IDBValidKey>("readwrite", (store) => store.put(mutation));
  notifyChange();
  return mutation;
}

export async function enqueueOfflineEventWithPhotos(
  payload: Record<string, unknown>,
  files: File[],
) {
  const mutation = await enqueueOfflineMutation({
    action: "event.create",
    entityId: crypto.randomUUID(),
    payload,
  });
  for (const file of files.slice(0, 9)) {
    await withAssetStore<IDBValidKey>("readwrite", (store) =>
      store.put({
        id: crypto.randomUUID(),
        mutationId: mutation.id,
        filename: file.name,
        contentType: file.type,
        blob: file,
      } satisfies OfflineAsset),
    );
  }
  notifyChange();
  return mutation;
}

export async function enqueueOfflineEventUpdateWithPhotos(
  entityId: string,
  baseRevision: number,
  payload: Record<string, unknown>,
  files: File[],
) {
  const mutation = await enqueueOfflineMutation({
    action: "event.update",
    entityId,
    baseRevision,
    payload,
  });
  for (const file of files.slice(0, 9)) {
    await withAssetStore<IDBValidKey>("readwrite", (store) =>
      store.put({
        id: crypto.randomUUID(),
        mutationId: mutation.id,
        filename: file.name,
        contentType: file.type,
        blob: file,
      } satisfies OfflineAsset),
    );
  }
  notifyChange();
  return mutation;
}

async function queuedAssets(mutationId: string) {
  return withAssetStore<OfflineAsset[]>("readonly", (store) =>
    store.index("mutationId").getAll(mutationId),
  );
}

async function deleteQueuedAssets(mutationId: string) {
  const assets = await queuedAssets(mutationId);
  for (const asset of assets) {
    await withAssetStore<undefined>("readwrite", (store) =>
      store.delete(asset.id),
    );
  }
}

async function uploadQueuedAssets(mutation: OfflineMutation) {
  const assets = await queuedAssets(mutation.id);
  if (!assets.length) return;
  const form = new FormData();
  form.set("eventId", mutation.entityId);
  for (const asset of assets) {
    form.append(
      "photos",
      new File([asset.blob], asset.filename, { type: asset.contentType }),
    );
  }
  const response = await fetch("/api/events/photos", {
    method: "POST",
    body: form,
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || "离线照片上传失败。");
  await deleteQueuedAssets(mutation.id);
}

async function deleteMutation(id: string) {
  await deleteQueuedAssets(id);
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}

async function updateMutation(
  mutation: OfflineMutation,
  patch: Partial<OfflineMutation>,
) {
  await withStore<IDBValidKey>("readwrite", (store) =>
    store.put({ ...mutation, ...patch }),
  );
}

export async function discardOfflineMutation(id: string) {
  await deleteMutation(id);
  notifyChange();
}

export async function retryOfflineMutation(id: string) {
  const rows = await listOfflineMutations();
  const mutation = rows.find((item) => item.id === id);
  if (!mutation) return;
  await updateMutation(mutation, {
    status: "pending",
    error: "",
    serverCurrent: null,
  });
  notifyChange();
}

export async function duplicateConflictAsNew(id: string) {
  const rows = await listOfflineMutations();
  const mutation = rows.find((item) => item.id === id);
  if (!mutation || mutation.action !== "event.update") {
    throw new Error("这条冲突不能另存为新记录。");
  }
  const title = String(mutation.payload.title ?? "").trim();
  await enqueueOfflineMutation({
    action: "event.create",
    entityId: crypto.randomUUID(),
    payload: {
      ...mutation.payload,
      title: title ? `${title}（本机副本）` : "跨设备冲突的本机副本",
    },
  });
  await deleteMutation(id);
  notifyChange();
}

export async function flushOfflineMutations() {
  if (!window.navigator.onLine) {
    return { processed: 0, conflicts: 0, failed: 0 };
  }
  const rows = (await listOfflineMutations()).filter(
    (mutation) => mutation.status === "pending",
  );
  if (!rows.length) return { processed: 0, conflicts: 0, failed: 0 };
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mutations: rows }),
  });
  const result = (await response.json()) as {
    error?: string;
    processed?: number;
    conflicts?: number;
    failed?: number;
    results?: Array<{
      id: string;
      status: "processed" | "conflict" | "failed";
      error?: string;
      current?: Record<string, unknown> | null;
    }>;
  };
  if (!response.ok) throw new Error(result.error || "离线队列同步失败。");
  let uploadFailures = 0;
  for (const item of result.results ?? []) {
    const mutation = rows.find((row) => row.id === item.id);
    if (!mutation) continue;
    if (item.status === "processed") {
      try {
        await uploadQueuedAssets(mutation);
        await deleteMutation(item.id);
      } catch (error) {
        uploadFailures += 1;
        await updateMutation(mutation, {
          status: "failed",
          error:
            error instanceof Error
              ? `文字已同步，${error.message}`
              : "文字已同步，但照片上传失败。",
        });
      }
    } else {
      await updateMutation(mutation, {
        status: item.status,
        error:
          item.status === "conflict"
            ? "服务器上已有更新，需要手动确认。"
            : item.error || "同步失败。",
        serverCurrent: item.current ?? null,
      });
    }
  }
  window.localStorage.setItem(
    "richangyu-last-synced-at",
    new Date().toISOString(),
  );
  notifyChange();
  return {
    processed: Number(result.processed) || 0,
    conflicts: Number(result.conflicts) || 0,
    failed: (Number(result.failed) || 0) + uploadFailures,
  };
}

export function subscribeToSyncChanges(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}
