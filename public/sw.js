const CACHE_NAME = "richangyu-safe-shell-v4";
const SAFE_ASSETS = ["/offline.html", "/favicon.svg"];
const APP_SHELL_KEY = "/";
const DEVICE_KEY = "/__richangyu_device_id__";

async function saveDeviceId(deviceId) {
  if (!deviceId) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(
    DEVICE_KEY,
    new Response(String(deviceId), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
  );
}

async function getDeviceId() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(DEVICE_KEY);
  return response ? response.text() : "";
}

async function acknowledgeNotification(deviceId, payload) {
  await fetch("/api/notifications", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId, ...payload }),
  });
}

async function pollReminders() {
  const deviceId = await getDeviceId();
  if (!deviceId || Notification.permission !== "granted") return;
  const response = await fetch(
    `/api/notifications?deviceId=${encodeURIComponent(deviceId)}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) return;
  const payload = await response.json();
  const deliveredIds = [];
  for (const message of payload.messages || []) {
    await self.registration.showNotification(message.title || "日常屿提醒", {
      body: message.body || "你有一条新的生活工作台提醒。",
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag: `richangyu-${message.id}`,
      renotify: false,
      data: {
        id: message.id,
        deviceId,
        actionTarget: message.actionTarget || "",
      },
    });
    deliveredIds.push(message.id);
  }
  if (deliveredIds.length) {
    await acknowledgeNotification(deviceId, { deliveredIds });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SAFE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/signin-with-chatgpt") ||
    url.pathname.startsWith("/signout-with-chatgpt") ||
    url.pathname.startsWith("/callback")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const contentType = response.headers.get("content-type") || "";
          if (
            response.ok &&
            !response.redirected &&
            contentType.includes("text/html") &&
            url.pathname === "/"
          ) {
            const copy = response.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(APP_SHELL_KEY, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(APP_SHELL_KEY)) ||
            (await cache.match("/offline.html"))
          );
        }),
    );
    return;
  }

  if (!["style", "script", "font", "image"].includes(request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    }),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "SET_DEVICE_ID") {
    event.waitUntil(
      saveDeviceId(message.deviceId).then(() =>
        message.poll ? pollReminders() : undefined,
      ),
    );
  }
  if (message.type === "POLL_REMINDERS") {
    event.waitUntil(pollReminders());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "richangyu-background-reminders") {
    event.waitUntil(pollReminders());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "richangyu-background-reminders") {
    event.waitUntil(pollReminders());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.actionTarget
    ? `/?view=${encodeURIComponent(data.actionTarget)}`
    : "/";
  event.waitUntil(
    Promise.all([
      data.id && data.deviceId
        ? acknowledgeNotification(data.deviceId, { openedId: data.id })
        : Promise.resolve(),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
        const existing = clients.find((client) =>
          new URL(client.url).origin === self.location.origin,
        );
          if (existing) {
            existing.navigate(target);
            return existing.focus();
          }
          return self.clients.openWindow(target);
        }),
    ]),
  );
});
