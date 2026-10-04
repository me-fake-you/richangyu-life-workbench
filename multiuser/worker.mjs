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

const capabilities = Object.freeze({
  accountWorkspace: true,
  records: false,
  checkins: false,
  schedules: false,
  ai: false,
  attachments: false,
  backup: false,
});

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
    return json({
      service: "richangyu-multiuser-foundation",
      stage: "account-workspace-only",
      registrationOpen: false,
      fullWorkbenchReady: false,
    });
  }
  // No fallthrough to the existing single-workspace application.
  if (url.pathname !== "/api/account/workspace") {
    return json({ error: "endpoint_not_available" }, 404);
  }
  if (env.MULTIUSER_FOUNDATION_ENABLED !== "true" ||
      env.MULTIUSER_AUTH_MODE !== "sites-dispatch") {
    return json({ error: "foundation_not_configured" }, 503);
  }
  const subject = authenticatedSubject(request.headers);
  if (!subject) return json({ error: "sign_in_required" }, 401);
  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST, PATCH" });
  }
  if (url.search) return json({ error: "workspace_selectors_rejected" }, 400);
  const database = env.MULTIUSER_DB;
  if (!database || typeof database.prepare !== "function") {
    return json({ error: "independent_database_required" }, 503);
  }

  try {
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
