const assert = require("node:assert/strict");
const test = require("node:test");
const { analyze, format } = require("../backup-preview.js");

test("counts additions, duplicates, invalid records, and base64 audio", () => {
  const current = [{ createdAt: "2026-07-21T00:00:00.000Z", text: "same", audioUrl: "" }];
  const raw = {
    notes: [
      { createdAt: "2026-07-21T00:00:00.000Z", text: "same" },
      { createdAt: "2026-07-21T01:00:00.000Z", text: "new", audioUrl: "data:audio/webm;base64,AAAA" },
      { unexpected: true },
    ],
  };
  const normalized = {
    projects: [{ id: "one", name: "One" }],
    notes: [
      current[0],
      { createdAt: "2026-07-21T01:00:00.000Z", text: "new", audioUrl: "data:audio/webm;base64,AAAA" },
    ],
  };

  const preview = analyze(raw, normalized, current);
  assert.equal(preview.projects, 1);
  assert.equal(preview.records, 3);
  assert.equal(preview.additions, 1);
  assert.equal(preview.duplicates, 1);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.base64Audio, 1);
  assert.equal(preview.missingIds, 3);
  assert.equal(preview.duplicateIds, 0);
  assert.equal(preview.orphanProjectRefs, 0);
  assert.ok(preview.estimatedCharacters > 0);
});

test("reports missing, duplicate, and orphaned legacy identifiers without writing data", () => {
  const raw = {
    projects: [{ id: "known", name: "Known" }],
    notes: [
      { id: "same", projectId: "known", text: "one" },
      { id: "same", projectId: "missing", text: "two" },
      { projectId: "known", text: "three" },
    ],
  };
  const normalized = {
    projects: [{ id: "known", name: "Known" }],
    notes: raw.notes.map((note) => ({
      ...note,
      createdAt: "2026-07-22T00:00:00.000Z",
      audioUrl: "",
    })),
  };

  const preview = analyze(raw, normalized, []);
  assert.equal(preview.missingIds, 1);
  assert.equal(preview.duplicateIds, 1);
  assert.equal(preview.orphanProjectRefs, 1);
  assert.ok(preview.estimatedCharacters > 0);
});

test("supports legacy record arrays and produces a confirmation message", () => {
  const preview = analyze({ records: [{ transcript: "legacy" }] }, { projects: [], notes: [] }, []);
  assert.equal(preview.records, 1);
  assert.match(format(preview, "backup.json"), /backup\.json/);
  assert.match(format(preview, "backup.json"), /0\uAC1C/);
});
