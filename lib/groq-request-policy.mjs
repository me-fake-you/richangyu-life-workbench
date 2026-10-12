// Best-effort isolate-local admission control, not a distributed account quota.
/** @param {unknown} value */
export function validGroqBaseUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.groq.com" &&
      url.pathname.replace(/\/$/, "") === "/openai/v1" &&
      (!url.port || url.port === "443") && !url.username && !url.password &&
      !url.search && !url.hash;
  } catch { return false; }
}

/** @param {unknown} value @param {number} [now] */
export function groqRetryAfterSeconds(value, now = Date.now()) {
  const raw = typeof value === "string" ? value.trim() : "";
  let seconds = 60;
  if (/^\d+(?:\.\d+)?$/.test(raw)) seconds = Number(raw);
  else if (/^[A-Za-z]{3}, /.test(raw)) {
    const parsed = Date.parse(raw);
    seconds = Number.isFinite(parsed) ? (parsed - now) / 1000 : 60;
  }
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(10, Math.ceil(seconds))) : 60;
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
export function groqCompletionBudget(value, min, max, fallback) {
  const budget = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, budget));
}

/** @param {{now?: () => number}} [options] */
export function createGroqRequestGate({ now = Date.now } = {}) {
  let inFlight = 0;
  let cooldownUntil = 0;
  return {
    enter() {
      const remaining = Math.ceil((cooldownUntil - now()) / 1000);
      if (remaining > 0) return { allowed: false, reason: "cooldown", retryAfter: remaining, release() {} };
      if (inFlight >= 2) return { allowed: false, reason: "busy", retryAfter: 2, release() {} };
      inFlight++;
      let released = false;
      return {
        allowed: true, reason: "ready", retryAfter: 0,
        release() { if (!released) { released = true; inFlight--; } },
      };
    },
    /** @param {unknown} raw */
    recordRateLimit(raw) {
      const time = now();
      const seconds = groqRetryAfterSeconds(raw, time);
      cooldownUntil = Math.max(cooldownUntil, time + seconds * 1000);
      return Math.ceil((cooldownUntil - time) / 1000);
    },
  };
}
