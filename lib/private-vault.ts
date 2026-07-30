const encoder = new TextEncoder();
const COOKIE_NAME = "richangyu_private_vault";

type VaultSettings = {
  credential_hash: string;
  salt: string;
  lock_timeout_minutes: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function derivePinHash(pin: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations: 160_000,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function tokenSignature(hash: string, expiresAt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(hash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`private-vault:${expiresAt}`),
  );
  return bytesToBase64(new Uint8Array(signature))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function ensurePrivateVaultSchema(DB: D1Database) {
  await DB.prepare(
    `CREATE TABLE IF NOT EXISTS private_vault_settings (
       id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
       credential_hash TEXT NOT NULL,
       salt TEXT NOT NULL,
       lock_timeout_minutes INTEGER NOT NULL DEFAULT 30,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  ).run();
}

export async function getVaultSettings(DB: D1Database) {
  await ensurePrivateVaultSchema(DB);
  return DB.prepare(
    `SELECT credential_hash, salt, lock_timeout_minutes
     FROM private_vault_settings WHERE id = 'default'`,
  ).first<VaultSettings>();
}

export async function setVaultPin(
  DB: D1Database,
  pin: string,
  lockTimeoutMinutes = 30,
) {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error("独立密码需要使用 6—12 位数字。");
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const hash = await derivePinHash(pin, salt);
  await DB.prepare(
    `INSERT INTO private_vault_settings
     (id, credential_hash, salt, lock_timeout_minutes)
     VALUES ('default', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       credential_hash = excluded.credential_hash,
       salt = excluded.salt,
       lock_timeout_minutes = excluded.lock_timeout_minutes,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      hash,
      salt,
      Math.max(5, Math.min(1440, Math.round(lockTimeoutMinutes) || 30)),
    )
    .run();
  return { hash, lockTimeoutMinutes };
}

export async function verifyVaultPin(DB: D1Database, pin: string) {
  const settings = await getVaultSettings(DB);
  if (!settings) return null;
  const candidate = await derivePinHash(pin, settings.salt);
  return timingSafeEqual(candidate, settings.credential_hash)
    ? settings
    : null;
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export async function isPrivateVaultUnlocked(
  request: Request,
  DB: D1Database,
) {
  const settings = await getVaultSettings(DB);
  if (!settings) return false;
  const [expiresAt, signature] = cookieValue(request).split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const expected = await tokenSignature(settings.credential_hash, expiresAt);
  return timingSafeEqual(signature, expected);
}

export async function unlockedCookie(
  settings: VaultSettings,
  secure = true,
) {
  const seconds = Math.max(
    300,
    Math.min(86_400, Number(settings.lock_timeout_minutes) * 60),
  );
  const expiresAt = String(Date.now() + seconds * 1000);
  const signature = await tokenSignature(settings.credential_hash, expiresAt);
  return `${COOKIE_NAME}=${encodeURIComponent(
    `${expiresAt}.${signature}`,
  )}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${
    secure ? "; Secure" : ""
  }`;
}

export function lockedCookie(secure = true) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}
