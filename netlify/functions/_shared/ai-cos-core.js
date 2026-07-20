const crypto = require("node:crypto");

const AUDIENCE = "voice-os-stage3-test";
const MAX_ITEMS = 1000;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function createSessionToken(secret, now = Date.now()) {
  if (!secret) throw new Error("Session secret is not configured.");
  const payload = {
    sub: "representative",
    aud: AUDIENCE,
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [encoded, signature, extra] = String(token).split(".");
  if (!encoded || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.sub !== "representative" || payload.aud !== AUDIENCE) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyPassword(password, configuredPassword) {
  return Boolean(configuredPassword) && safeEqual(password, configuredPassword);
}

function cleanId(value, field) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(id)) {
    throw validationError(`${field} is invalid.`);
  }
  return id;
}

function cleanText(value, field, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw validationError(`${field} is invalid.`);
  return text;
}

function cleanOptionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function cleanArray(value, field) {
  if (!Array.isArray(value)) throw validationError(`${field} must be an array.`);
  if (value.length > MAX_ITEMS) throw validationError(`${field} exceeds ${MAX_ITEMS} items.`);
  return value;
}

function normalizeTestSnapshot(input, now = new Date().toISOString()) {
  const source = input && typeof input === "object" ? input : {};
  if (source.namespace !== "stage3-test") {
    throw validationError("Only the stage3-test namespace is allowed.");
  }

  const projects = cleanArray(source.projects || [], "projects").map((item) => ({
    id: cleanId(item?.id, "project.id"),
    name: cleanText(item?.name, "project.name", 120),
    status: cleanOptionalText(item?.status || "active", 30),
  }));

  const projectIds = new Set(projects.map((item) => item.id));
  const voiceCommands = cleanArray(source.voice_commands || [], "voice_commands").map((item) => {
    const projectId = cleanId(item?.project_id, "voice_command.project_id");
    if (!projectIds.has(projectId)) throw validationError("voice_command references an unknown project.");
    return {
      id: cleanId(item?.id, "voice_command.id"),
      project_id: projectId,
      transcript: cleanText(item?.transcript, "voice_command.transcript", 10000),
      captured_at: cleanText(item?.captured_at, "voice_command.captured_at", 40),
      intent: cleanOptionalText(item?.intent, 40),
      status: cleanOptionalText(item?.status || "captured", 30),
    };
  });

  const tasks = cleanArray(source.tasks || [], "tasks").map((item) => {
    const projectId = cleanId(item?.project_id, "task.project_id");
    if (!projectIds.has(projectId)) throw validationError("task references an unknown project.");
    return {
      id: cleanId(item?.id, "task.id"),
      project_id: projectId,
      title: cleanText(item?.title, "task.title", 300),
      status: cleanOptionalText(item?.status || "pending", 30),
      assignee: cleanOptionalText(item?.assignee, 100),
      due_at: cleanOptionalText(item?.due_at, 40),
    };
  });

  return {
    schema_version: "0.1",
    namespace: "stage3-test",
    updated_at: now,
    projects,
    voice_commands: voiceCommands,
    tasks,
  };
}

function buildAuditLog(action, snapshot, now = new Date().toISOString()) {
  return {
    id: `AUD-${crypto.randomUUID()}`,
    actor_id: "representative",
    action,
    target_type: "test_snapshot",
    target_id: "current",
    result: "success",
    counts: {
      projects: snapshot.projects.length,
      voice_commands: snapshot.voice_commands.length,
      tasks: snapshot.tasks.length,
    },
    created_at: now,
  };
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}

module.exports = {
  AUDIENCE,
  buildAuditLog,
  createSessionToken,
  normalizeTestSnapshot,
  verifyPassword,
  verifySessionToken,
};
