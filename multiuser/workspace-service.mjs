export const MAX_BODY_BYTES = 4096;
export const WORKSPACE_SCHEMA_SQL = [
  "CREATE TABLE IF NOT EXISTS multiuser_workspaces (",
  "id TEXT PRIMARY KEY NOT NULL,",
  "owner_user_id TEXT NOT NULL UNIQUE CHECK (length(owner_user_id) BETWEEN 1 AND 512),",
  "name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),",
  "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
  "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
  ")",
].join("\n");

const schemaPromises = new WeakMap();

export class WorkspaceRequestError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "WorkspaceRequestError";
    this.status = status;
    this.code = code;
  }
}

function unsafeCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || (code >= 127 && code <= 159) ||
      (code >= 0xd800 && code <= 0xdfff);
  });
}

// Only call this on headers supplied by a verified identity gateway.
// Email, display names, request bodies and workspace selectors are not identities.
export function authenticatedSubject(headers) {
  const subject = headers.get("oai-authenticated-user-id");
  if (typeof subject !== "string" || subject.length < 1 ||
      subject.length > 512 || subject !== subject.trim() ||
      unsafeCharacters(subject)) {
    return null;
  }
  return subject;
}

export function requireSameOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" ||
      request.headers.get("origin") !== url.origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    throw new WorkspaceRequestError(403, "same_origin_required");
  }
}

export async function readWorkspaceInput(request, requireName = false) {
  const contentType = (request.headers.get("content-type") || "")
    .split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new WorkspaceRequestError(415, "json_required");
  }
  if (!request.body) throw new WorkspaceRequestError(400, "invalid_json");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WorkspaceRequestError(413, "body_too_large");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof WorkspaceRequestError) throw error;
    throw new WorkspaceRequestError(400, "invalid_json");
  } finally {
    reader.releaseLock();
  }

  let input;
  try { input = JSON.parse(body); }
  catch { throw new WorkspaceRequestError(400, "invalid_json"); }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "name")) {
    throw new WorkspaceRequestError(422, "workspace_fields_rejected");
  }
  const hasName = Object.prototype.hasOwnProperty.call(input, "name");
  if (requireName && !hasName) {
    throw new WorkspaceRequestError(422, "name_required");
  }
  if (!hasName) return { name: "\u6211\u7684\u7a7a\u95f4" };
  if (typeof input.name !== "string" || unsafeCharacters(input.name)) {
    throw new WorkspaceRequestError(422, "invalid_name");
  }
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new WorkspaceRequestError(422, "invalid_name");
  }
  return { name };
}

export async function ensureWorkspaceSchema(database) {
  let pending = schemaPromises.get(database);
  if (!pending) {
    pending = database.prepare(WORKSPACE_SCHEMA_SQL).run().then((result) => {
      if (result.success === false) throw new Error("workspace_schema_failed");
    }).catch((error) => {
      schemaPromises.delete(database);
      throw error;
    });
    schemaPromises.set(database, pending);
  }
  await pending;
}

function publicWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ownWorkspace(database, subject) {
  const row = await database.prepare(
    "SELECT id, name, created_at, updated_at FROM multiuser_workspaces WHERE owner_user_id = ?",
  ).bind(subject).first();
  return publicWorkspace(row);
}

export async function createOwnWorkspace(database, subject, name) {
  const id = "ws_" + crypto.randomUUID();
  const result = await database.prepare(
    "INSERT INTO multiuser_workspaces (id, owner_user_id, name) VALUES (?, ?, ?) " +
    "ON CONFLICT(owner_user_id) DO NOTHING",
  ).bind(id, subject, name).run();
  if (result.success === false) throw new Error("workspace_insert_failed");
  const workspace = await ownWorkspace(database, subject);
  if (!workspace) throw new Error("workspace_insert_unconfirmed");
  return { workspace, created: Number(result.meta?.changes || 0) === 1 };
}

export async function renameOwnWorkspace(database, subject, name) {
  const result = await database.prepare(
    "UPDATE multiuser_workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?",
  ).bind(name, subject).run();
  if (result.success === false) throw new Error("workspace_update_failed");
  if (Number(result.meta?.changes || 0) === 0) {
    throw new WorkspaceRequestError(404, "workspace_not_found");
  }
  const workspace = await ownWorkspace(database, subject);
  if (!workspace) throw new Error("workspace_update_unconfirmed");
  return workspace;
}
