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
    return [note.text, note.transcript, note.content, note.memo, note.message, note.title, note.audioUrl, note.audio, note.audio_url, note.fileUrl]
      .some((value) => typeof value === "string" && value.trim());
  }

  function containsBase64Audio(note) {
    if (!note || typeof note !== "object") return false;
    return [note.audioUrl, note.audio, note.audio_url, note.fileUrl]
      .some((value) => typeof value === "string" && /^data:audio\/[^,]+;base64,/i.test(value));
  }

  function analyze(raw, normalized, currentNotes) {
    const sourceNotes = rawNotes(raw);
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
      projects: Array.isArray(normalized?.projects) ? normalized.projects.length : 0,
      records: sourceNotes.length,
      additions,
      duplicates,
      invalid: sourceNotes.filter((note) => !isConvertibleNote(note)).length,
      base64Audio: sourceNotes.filter(containsBase64Audio).length,
    };
  }

  function format(preview, fileName) {
    return [
      "JSON 諛깆뾽 蹂묓빀 誘몃━蹂닿린",
      `?뚯씪: ${fileName || "?대쫫 ?놁쓬"}`,
      `?꾨줈?앺듃: ${preview.projects}媛?,
      `諛깆뾽 湲곕줉: ${preview.records}媛?,
      `異붽? ?덉젙: ${preview.additions}媛?,
      `以묐났 ?쒖쇅: ${preview.duplicates}媛?,
      `蹂??遺덇?: ${preview.invalid}媛?,
      `base64 ?뚯꽦 ?ы븿: ${preview.base64Audio}媛?,
      "",
      "?뺤씤???꾨Ⅴ硫?湲곗〈 濡쒖뺄 湲곕줉??蹂묓빀?⑸땲?? 痍⑥냼?섎㈃ ?꾨Т寃껊룄 蹂寃쏀븯吏 ?딆뒿?덈떎.",
    ].join("\n");
  }

  return { analyze, format };
});

