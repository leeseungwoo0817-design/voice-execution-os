(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VoiceOsCentralStorePreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function requireId(value, field) {
    const id = String(value || "").trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(id)) {
      throw new Error(`${field} 값이 올바르지 않습니다.`);
    }
    return id;
  }

  function requireText(value, field, maxLength) {
    const text = String(value || "").trim();
    if (!text || text.length > maxLength) {
      throw new Error(`${field} 값이 올바르지 않습니다.`);
    }
    return text;
  }

  function optionalText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function buildSnapshot(state) {
    const projects = Array.isArray(state?.projects) ? state.projects : [];
    const notes = Array.isArray(state?.notes) ? state.notes : [];
    const mappedProjects = projects.map((project) => ({
      id: requireId(project?.id, "project.id"),
      name: requireText(project?.name, "project.name", 120),
      status: "active",
    }));
    const projectIds = new Set(mappedProjects.map((project) => project.id));

    const voiceCommands = notes.map((note) => {
      const projectId = requireId(note?.projectId, "note.projectId");
      if (!projectIds.has(projectId)) {
        throw new Error("연결할 수 없는 프로젝트가 포함되어 있습니다.");
      }
      return {
        id: requireId(note?.id, "note.id"),
        project_id: projectId,
        transcript: requireText(note?.text, "note.text", 10000),
        captured_at: requireText(note?.createdAt, "note.createdAt", 40),
        intent: optionalText(note?.type, 40),
        status: optionalText(note?.status || "captured", 30),
      };
    });

    return {
      snapshot: {
        namespace: "stage3-test",
        projects: mappedProjects,
        voice_commands: voiceCommands,
        tasks: [],
      },
      preview: {
        projects: mappedProjects.length,
        voiceCommands: voiceCommands.length,
        tasks: 0,
        audioExcluded: notes.filter((note) => String(note?.audioUrl || "").trim()).length,
      },
    };
  }

  function compareSnapshots(expected, actual) {
    const expectedProjects = Array.isArray(expected?.projects) ? expected.projects : [];
    const expectedCommands = Array.isArray(expected?.voice_commands) ? expected.voice_commands : [];
    const actualProjects = Array.isArray(actual?.projects) ? actual.projects : [];
    const actualCommands = Array.isArray(actual?.voice_commands) ? actual.voice_commands : [];
    const actualProjectIds = new Set(actualProjects.map((item) => item.id));
    const actualCommandIds = new Set(actualCommands.map((item) => item.id));

    return {
      projectsMatch: expectedProjects.length === actualProjects.length
        && expectedProjects.every((item) => actualProjectIds.has(item.id)),
      voiceCommandsMatch: expectedCommands.length === actualCommands.length
        && expectedCommands.every((item) => actualCommandIds.has(item.id)),
      tasksMatch: (expected?.tasks || []).length === (actual?.tasks || []).length,
    };
  }

  return { buildSnapshot, compareSnapshots };
});
