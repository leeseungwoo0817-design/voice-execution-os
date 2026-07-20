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

  assert.deepEqual(analyze(raw, normalized, current), {
    projects: 1,
    records: 3,
    additions: 1,
    duplicates: 1,
    invalid: 1,
    base64Audio: 1,
  });
});

test("supports legacy record arrays and produces a confirmation message", () => {
  const preview = analyze({ records: [{ transcript: "legacy" }] }, { projects: [], notes: [] }, []);
  assert.equal(preview.records, 1);
  assert.match(format(preview, "backup.json"), /backup\.json/);
  assert.match(format(preview, "backup.json"), /痍⑥냼?섎㈃ ?꾨Т寃껊룄 蹂寃쏀븯吏 ?딆뒿?덈떎/);
});

