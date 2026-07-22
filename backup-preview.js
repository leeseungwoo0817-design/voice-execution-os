(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VoiceOsBackupPreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function noteSignature(note) {
    return [note.createdAt, note.text, note.audioUrl || ""].join("|");
  }

  function rawNotes(source) {
    if (!source || typeof source !== "object") return [];
    for (const key of ["notes", "records", "entries", "items"]) {
      if (Array.isArray(source[key])) return source[key];
    }
    return [];
  }

  function isConvertibleNote(note) {
    if (!note || typeof note !== "object") return false;
    return [
      note.text, note.transcript, note.content, note.memo, note.message,
      note.title, note.audioUrl, note.audio, note.audio_url, note.fileUrl,
    ].some((value) => typeof value === "string" && value.trim());
  }

  function containsBase64Audio(note) {
    if (!note || typeof note !== "object") return false;
    return [note.audioUrl, note.audio, note.audio_url, note.fileUrl]
      .some((value) => typeof value === "string" && /^data:audio\/[^,]+;base64,/i.test(value));
  }

  function recordId(note) {
    if (!note || typeof note !== "object") return "";
    return String(note.id || note.uuid || "").trim();
  }

  function projectId(note) {
    if (!note || typeof note !== "object") return "";
    return String(note.projectId || note.project_id || "").trim();
  }

  function countDuplicateIds(notes) {
    const seen = new Set();
    let duplicates = 0;
    notes.forEach((note) => {
      const id = recordId(note);
      if (!id) return;
      if (seen.has(id)) duplicates += 1;
      else seen.add(id);
    });
    return duplicates;
  }

  function estimatedCharacters(normalized) {
    const safe = {
      projects: Array.isArray(normalized?.projects) ? normalized.projects : [],
      notes: (Array.isArray(normalized?.notes) ? normalized.notes : []).map((note) => ({
        ...note,
        audioUrl: "",
      })),
    };
    return JSON.stringify(safe).length;
  }

  function analyze(raw, normalized, currentNotes) {
    const sourceNotes = rawNotes(raw);
    const projects = Array.isArray(normalized?.projects) ? normalized.projects : [];
    const projectIds = new Set(projects.map((project) => String(project.id || "")));
    const existing = new Set((currentNotes || []).map(noteSignature));
    const imported = Array.isArray(normalized?.notes) ? normalized.notes : [];
    let duplicates = 0;
    let additions = 0;

    imported.forEach((note) => {
      const signature = noteSignature(note);
      if (existing.has(signature)) duplicates += 1;
      else {
        additions += 1;
        existing.add(signature);
      }
    });

    return {
      projects: projects.length,
      records: sourceNotes.length,
      additions,
      duplicates,
      invalid: sourceNotes.filter((note) => !isConvertibleNote(note)).length,
      base64Audio: sourceNotes.filter(containsBase64Audio).length,
      missingIds: sourceNotes.filter((note) => !recordId(note)).length,
      duplicateIds: countDuplicateIds(sourceNotes),
      orphanProjectRefs: sourceNotes.filter((note) => {
        const id = projectId(note);
        return id && !projectIds.has(id);
      }).length,
      estimatedCharacters: estimatedCharacters(normalized),
    };
  }

  function format(preview, fileName) {
    return [
      "JSON \uBC31\uC5C5 \uBCD1\uD569 \uBBF8\uB9AC\uBCF4\uAE30",
      `\uD30C\uC77C: ${fileName || "\uC774\uB984 \uC5C6\uC74C"}`,
      `\uD504\uB85C\uC81D\uD2B8: ${preview.projects}\uAC1C`,
      `\uBC31\uC5C5 \uAE30\uB85D: ${preview.records}\uAC1C`,
      `\uCD94\uAC00 \uC608\uC815: ${preview.additions}\uAC1C`,
      `\uC911\uBCF5 \uC81C\uC678: ${preview.duplicates}\uAC1C`,
      `\uBCC0\uD658 \uBD88\uAC00: ${preview.invalid}\uAC1C`,
      `base64 \uC74C\uC131 \uD3EC\uD568: ${preview.base64Audio}\uAC1C`,
      `ID \uB204\uB77D: ${preview.missingIds}\uAC1C`,
      `\uC911\uBCF5 ID: ${preview.duplicateIds}\uAC1C`,
      `\uD504\uB85C\uC81D\uD2B8 \uC5F0\uACB0 \uC624\uB958: ${preview.orphanProjectRefs}\uAC1C`,
      `\uC74C\uC131 \uC81C\uC678 \uD6C4 \uC608\uC0C1 \uBB38\uC790 \uC218: ${preview.estimatedCharacters}\uC790`,
      "",
      "\uD655\uC778\uC744 \uB204\uB974\uBA74 \uAE30\uC874 \uB85C\uCEEC \uAE30\uB85D\uC5D0 \uBCD1\uD569\uD569\uB2C8\uB2E4. \uCDE8\uC18C\uD558\uBA74 \uC544\uBB34\uAC83\uB3C4 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    ].join("\n");
  }

  return { analyze, format };
});
