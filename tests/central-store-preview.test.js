const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSnapshot, compareSnapshots } = require("../central-store-preview.js");

test("maps local records to stage3 VoiceCommand candidates without audio or automatic tasks", () => {
  const result = buildSnapshot({
    projects: [{ id: "project-1", name: "Test" }],
    notes: [{
      id: "note-1",
      projectId: "project-1",
      text: "Create a task",
      createdAt: "2026-07-22T00:00:00.000Z",
      type: "task",
      status: "pending",
      audioUrl: "data:audio/webm;base64,AAAA",
    }],
  });

  assert.equal(result.snapshot.namespace, "stage3-test");
  assert.equal(result.snapshot.voice_commands.length, 1);
  assert.equal(result.snapshot.voice_commands[0].transcript, "Create a task");
  assert.equal(result.snapshot.voice_commands[0].audioUrl, undefined);
  assert.equal(result.snapshot.tasks.length, 0);
  assert.equal(result.preview.audioExcluded, 1);
});

test("rejects invalid identifiers and unknown project references before copying", () => {
  assert.throws(() => buildSnapshot({
    projects: [{ id: "project-1", name: "Test" }],
    notes: [{ id: "bad id", projectId: "project-1", text: "x", createdAt: "2026-07-22" }],
  }), /note.id/);

  assert.throws(() => buildSnapshot({
    projects: [{ id: "project-1", name: "Test" }],
    notes: [{ id: "note-1", projectId: "missing", text: "x", createdAt: "2026-07-22" }],
  }), /프로젝트/);
});

test("reconciles copied project and VoiceCommand identifiers", () => {
  const expected = {
    projects: [{ id: "project-1" }],
    voice_commands: [{ id: "note-1" }],
    tasks: [],
  };
  assert.deepEqual(compareSnapshots(expected, {
    projects: [{ id: "project-1" }],
    voice_commands: [{ id: "note-1" }],
    tasks: [],
  }), {
    projectsMatch: true,
    voiceCommandsMatch: true,
    tasksMatch: true,
  });
});
