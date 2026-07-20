const {
  buildAuditLog,
  createSessionToken,
  normalizeTestSnapshot,
  verifyPassword,
  verifySessionToken,
} = require("./_shared/ai-cos-core.js");

const STORE_NAME = "voice-os-stage3-test";
const SNAPSHOT_KEY = "stage3-test/snapshots/current";

exports.handler = async (event) => {
  const headers = headersFor(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: isAllowedOrigin(event) ? 204 : 403, headers, body: "" };
  }
  if (!isAllowedOrigin(event)) return json(event, 403, { ok: false, error_code: "FORBIDDEN" });

  const action = getAction(event);
  if (action === "health" && event.httpMethod === "GET") {
    return json(event, 200, {
      ok: true,
      service: "voice-os-stage3-test",
      auth_configured: Boolean(process.env.VOICE_OS_ADMIN_PASSWORD && process.env.VOICE_OS_SESSION_SECRET),
      storage: "netlify-blobs",
      operational_data_connected: false,
    });
  }

  if (action === "login" && event.httpMethod === "POST") {
    const body = parseJson(event);
    if (!body.ok) return json(event, 400, body.error);
    if (!process.env.VOICE_OS_ADMIN_PASSWORD || !process.env.VOICE_OS_SESSION_SECRET) {
      return json(event, 503, { ok: false, error_code: "AUTH_NOT_CONFIGURED" });
    }
    if (!verifyPassword(body.value.password, process.env.VOICE_OS_ADMIN_PASSWORD)) {
      return json(event, 401, { ok: false, error_code: "INVALID_CREDENTIALS" });
    }
    return json(event, 200, {
      ok: true,
      token: createSessionToken(process.env.VOICE_OS_SESSION_SECRET),
      expires_in: 8 * 60 * 60,
    });
  }

  const actor = authenticate(event);
  if (!actor) return json(event, 401, { ok: false, error_code: "UNAUTHORIZED" });

  if (action === "snapshot" && event.httpMethod === "GET") {
    try {
      const store = await openStore();
      const snapshot = await store.get(SNAPSHOT_KEY, { type: "json", consistency: "strong" });
      return json(event, 200, { ok: true, snapshot });
    } catch (error) {
      return storageError(event, error);
    }
  }

  if (action === "snapshot" && event.httpMethod === "POST") {
    const body = parseJson(event);
    if (!body.ok) return json(event, 400, body.error);

    try {
      const snapshot = normalizeTestSnapshot(body.value);
      const audit = buildAuditLog("save_test_snapshot", snapshot);
      const store = await openStore();
      await store.setJSON(SNAPSHOT_KEY, snapshot);
      await store.setJSON(`stage3-test/audit/${audit.id}`, audit);
      return json(event, 200, { ok: true, snapshot, audit });
    } catch (error) {
      if (error.code === "VALIDATION_ERROR") {
        return json(event, 400, {
          ok: false,
          error_code: error.code,
          message: error.message,
        });
      }
      return storageError(event, error);
    }
  }

  return json(event, 405, { ok: false, error_code: "METHOD_NOT_ALLOWED" });
};

async function openStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function authenticate(event) {
  const authorization = getHeader(event, "authorization", false);
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? verifySessionToken(match[1], process.env.VOICE_OS_SESSION_SECRET) : null;
}

function getAction(event) {
  return String(event.queryStringParameters?.action || "health").trim().toLowerCase();
}

function parseJson(event) {
  if (!getHeader(event, "content-type").includes("application/json")) {
    return { ok: false, error: { ok: false, error_code: "JSON_REQUIRED" } };
  }
  try {
    return { ok: true, value: JSON.parse(event.body || "{}") };
  } catch {
    return { ok: false, error: { ok: false, error_code: "INVALID_JSON" } };
  }
}

function allowedOrigins() {
  return new Set([
    "https://voice-execution-os.netlify.app",
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
  ].filter(Boolean));
}

function isAllowedOrigin(event) {
  const origin = getHeader(event, "origin", false);
  return !origin || allowedOrigins().has(origin);
}

function headersFor(event) {
  const origin = getHeader(event, "origin", false);
  const allowed = allowedOrigins();
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://voice-execution-os.netlify.app",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function getHeader(event, name, lower = true) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (key.toLowerCase() === target) {
      const text = String(value || "");
      return lower ? text.toLowerCase() : text;
    }
  }
  return "";
}

function storageError(event, error) {
  const errorType = String(error?.name || "Error").slice(0, 80);
  const errorMessage = String(error?.message || "Unknown storage error").slice(0, 300);
  console.error("AI_COS_STORAGE_ERROR", { errorType, errorMessage });
  return json(event, 500, {
    ok: false,
    error_code: "STORE_ERROR",
    error_type: errorType,
    message: errorMessage,
  });
}

function json(event, statusCode, body) {
  return { statusCode, headers: headersFor(event), body: JSON.stringify(body) };
}
