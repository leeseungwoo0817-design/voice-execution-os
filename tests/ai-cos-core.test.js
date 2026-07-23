const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAuditLog,
  createSessionToken,
  normalizeTestSnapshot,
  verifyPassword,
  verifySessionToken,
} = require("../netlify/functions/_shared/ai-cos-core.js");

test("creates and verifies an expiring representative token", () => {
  const now = Date.parse("2026-07-21T00:00:00.000Z");
  const token = createSessionToken("test-secret", now);
  assert.equal(verifySessionToken(token, "test-secret", now + 1000).sub, "representative");
  assert.equal(verifySessionToken(token, "wrong-secret", now + 1000), null);
  assert.equal(verifySessionToken(token, "test-secret", now + 9 * 60 * 60 * 1000), null);
});

test("verifies the configured representative password", () => {
  assert.equal(verifyPassword("correct", "correct"), true);
  assert.equal(verifyPassword("wrong", "correct"), false);
});

test("normalizes only the stage3 test snapshot contract", () => {
  const snapshot = normalizeTestSnapshot({
    namespace: "stage3-test",
    projects: [{ id: "project-1", name: "Test" }],
    voice_commands: [{
      id: "voice-1",
      project_id: "project-1",
      transcript: "Create a task",
      captured_at: "2026-07-21T00:00:00.000Z",
      audio: "data:audio/webm;base64,AAAA",
    }],
    tasks: [{ id: "task-1", project_id: "project-1", title: "Test task" }],
  });

  assert.equal(snapshot.voice_commands[0].audio, undefined);
  assert.equal(snapshot.voice_commands[0].transcript, "Create a task");
  assert.equal(snapshot.tasks[0].status, "pending");
});

test("rejects operational namespaces and unknown project references", () => {
  assert.throws(() => normalizeTestSnapshot({ namespace: "production" }), /stage3-test/);
  assert.throws(() => normalizeTestSnapshot({
    namespace: "stage3-test",
    projects: [],
    voice_commands: [{
      id: "voice-1",
      project_id: "missing",
      transcript: "test",
      captured_at: "2026-07-21T00:00:00.000Z",
    }],
  }), /unknown project/);
});

test("audit logs keep counts but not transcript content", () => {
  const snapshot = normalizeTestSnapshot({
    namespace: "stage3-test",
    projects: [{ id: "project-1", name: "Test" }],
    voice_commands: [{
      id: "voice-1",
      project_id: "project-1",
      transcript: "private transcript",
      captured_at: "2026-07-21T00:00:00.000Z",
    }],
    tasks: [],
  });
  const audit = buildAuditLog("save_test_snapshot", snapshot);
  assert.equal(audit.counts.voice_commands, 1);
  assert.doesNotMatch(JSON.stringify(audit), /private transcript/);
});
