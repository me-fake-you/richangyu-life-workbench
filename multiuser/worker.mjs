import {
  WorkspaceRequestError,
  authenticatedSubject,
  requireSameOrigin,
  readWorkspaceInput,
  ensureWorkspaceSchema,
  ownWorkspace,
  createOwnWorkspace,
  renameOwnWorkspace,
} from "./workspace-service.mjs";

import { readContentInput, listOwnContent, changeOwnContent } from "./content-service.mjs";

const baseCapabilities = Object.freeze({
  accountWorkspace: true,
  records: false,
  checkins: false,
  schedules: false,
  ai: false,
  attachments: false,
  backup: false,
});

function configuredCapabilities(env) {
  const database = env.MULTIUSER_DB;
  const configured = env.MULTIUSER_FOUNDATION_ENABLED === "true"
    && env.MULTIUSER_AUTH_MODE === "sites-dispatch"
    && database && typeof database.prepare === "function";
  const content = Boolean(configured && env.MULTIUSER_CONTENT_ENABLED === "true"
    && typeof database.batch === "function");
  return {
    ...baseCapabilities,
    accountWorkspace: Boolean(configured),
    records: content,
    schedules: content,
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function handleFoundationRequest(request, env = {}) {
  const url = new URL(request.url);
  if ((url.pathname === "/" || url.pathname === "/health") &&
      request.method === "GET") {
    const available = configuredCapabilities(env);
    return json({
      service: "richangyu-multiuser-foundation",
      stage: available.records ? "isolated-content-foundation" : "account-workspace-only",
      configured: available.accountWorkspace,
      capabilities: available,
      nativeBindingReady: false,
      registrationOpen: false,
      fullWorkbenchReady: false,
    });
  }
  // No fallthrough to the existing single-workspace application.
  if (!["/api/account/workspace", "/api/content"].includes(url.pathname)) {
    return json({ error: "endpoint_not_available" }, 404);
  }
  if (env.MULTIUSER_FOUNDATION_ENABLED !== "true" ||
      env.MULTIUSER_AUTH_MODE !== "sites-dispatch") {
    return json({ error: "foundation_not_configured" }, 503);
  }
  const subject = authenticatedSubject(request.headers);
  if (!subject) return json({ error: "sign_in_required" }, 401);
  const content = url.pathname === "/api/content";
  if (content && env.MULTIUSER_CONTENT_ENABLED !== "true") return json({ error: "content_foundation_not_enabled" }, 503);
  const methods = content ? ["GET", "POST"] : ["GET", "POST", "PATCH"];
  if (!methods.includes(request.method)) {
    return json({ error: "method_not_allowed" }, 405, { allow: methods.join(", ") });
  }
  if (url.search) return json({ error: "workspace_selectors_rejected" }, 400);
  const database = env.MULTIUSER_DB;
  if (!database || typeof database.prepare !== "function") {
    return json({ error: "independent_database_required" }, 503);
  }

  const capabilities = configuredCapabilities(env);
  try {
    if (content) {
      if (request.method === "GET") return json({ ...await listOwnContent(database, subject), stage: "isolated-content-foundation", fullWorkbenchReady: false });
      requireSameOrigin(request);
      return json(await changeOwnContent(database, subject, await readContentInput(request)));
    }
    let input;
    if (request.method !== "GET") {
      requireSameOrigin(request);
      input = await readWorkspaceInput(request, request.method === "PATCH");
    }
    await ensureWorkspaceSchema(database);
    if (request.method === "GET") {
      return json({
        workspace: await ownWorkspace(database, subject),
        stage: "account-workspace-only",
        capabilities,
      });
    }
    if (request.method === "POST") {
      const result = await createOwnWorkspace(database, subject, input.name);
      return json({ ...result, stage: "account-workspace-only", capabilities },
        result.created ? 201 : 200);
    }
    return json({
      workspace: await renameOwnWorkspace(database, subject, input.name),
      stage: "account-workspace-only",
      capabilities,
    });
  } catch (error) {
    if (error instanceof WorkspaceRequestError) {
      return json({ error: error.code }, error.status);
    }
    // Do not echo database errors, account IDs or request contents.
    return json({ error: "workspace_operation_failed" }, 500);
  }
}

export default {
  fetch(request, env) {
    return handleFoundationRequest(request, env);
  },
};
