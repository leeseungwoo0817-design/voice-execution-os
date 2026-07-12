const STORAGE_KEY = "voice-execution-os:v2";
const STABLE_STORAGE_KEY = "voice-execution-os:latest";
const BACKUP_REMINDER_KEY = "voice-execution-os:last-backup-reminder";
const BACKUP_REMINDER_INTERVAL = 10;
const LEGACY_STORAGE_KEYS = [
  "voice-execution-os:v1",
  "voice-execution-os",
  "voice-os",
  "voice-os:mvp",
  "voice-execution-os:mvp",
];

const starterProjects = [
  { id: "life-finance-lab", name: "생활금융연구소" },
  { id: "app-dev", name: "앱 개발" },
  { id: "personal", name: "개인 일정" },
];

const typeLabels = {
  auto: "자동",
  idea: "아이디어",
  memo: "메모",
  instruction: "작업지시",
  task: "할 일",
  schedule: "일정",
};

const targetLabels = {
  auto: "자동",
  codex: "Codex 작업지시",
  gpt: "GPT 정리요청",
  calendar: "일정화 요청",
  daily: "일일 요약",
  archive: "아이디어 보관",
};

const statusLabels = {
  today: "오늘 마무리",
  pending: "대기",
  progress: "진행중",
  hold: "보류",
  done: "완료",
};

const targetOrder = ["codex", "gpt", "calendar", "daily", "archive"];
const statusOrder = ["today", "progress", "pending", "hold", "done"];

const state = loadState();

let mediaRecorder = null;
let audioChunks = [];
let timerId = null;
let startedAt = 0;
let selectedDate = toDateKey(new Date());
let visibleMonth = new Date();
let activeView = "today";

const $ = (id) => document.getElementById(id);

const els = {
  navTabs: Array.from(document.querySelectorAll("[data-view]")),
  views: Array.from(document.querySelectorAll(".view-section")),
  todayLabel: $("todayLabel"),
  promptMode: $("promptMode"),
  exportButton: $("exportButton"),
  recordButton: $("recordButton"),
  recordButtonText: $("recordButtonText"),
  recordStatus: $("recordStatus"),
  recordTimer: $("recordTimer"),
  manualInput: $("manualInput"),
  projectSelect: $("projectSelect"),
  targetSelect: $("targetSelect"),
  noteTypeSelect: $("noteTypeSelect"),
  saveNoteButton: $("saveNoteButton"),
  todayCount: $("todayCount"),
  pendingCount: $("pendingCount"),
  finishTodayCount: $("finishTodayCount"),
  projectCount: $("projectCount"),
  scheduleCount: $("scheduleCount"),
  sideSummary: $("sideSummary"),
  dateFilter: $("dateFilter"),
  todayTimeline: $("todayTimeline"),
  commandPacketButton: $("commandPacketButton"),
  commandFocusTitle: $("commandFocusTitle"),
  commandFocusText: $("commandFocusText"),
  commandBoard: $("commandBoard"),
  prevMonth: $("prevMonth"),
  nextMonth: $("nextMonth"),
  monthLabel: $("monthLabel"),
  calendarGrid: $("calendarGrid"),
  selectedDayTitle: $("selectedDayTitle"),
  selectedDayNotes: $("selectedDayNotes"),
  typeFilter: $("typeFilter"),
  targetFilter: $("targetFilter"),
  inboxList: $("inboxList"),
  newProjectName: $("newProjectName"),
  addProjectButton: $("addProjectButton"),
  projectGrid: $("projectGrid"),
  clearCompletedButton: $("clearCompletedButton"),
  taskBoard: $("taskBoard"),
  downloadJsonButton: $("downloadJsonButton"),
  downloadTextButton: $("downloadTextButton"),
  restoreBackupButton: $("restoreBackupButton"),
  restoreBackupInput: $("restoreBackupInput"),
  backupReminder: $("backupReminder"),
  promptDialog: $("promptDialog"),
  promptOutput: $("promptOutput"),
  copyPromptButton: $("copyPromptButton"),
  closePromptButton: $("closePromptButton"),
};

init();

function init() {
  ensureDefaults();
  hydrateSelects();
  bindEvents();
  render();
}

function ensureDefaults() {
  const normalized = normalizeState(state);
  state.projects = normalized.projects;
  state.notes = normalized.notes;
  saveState();
}

function hydrateSelects() {
  els.projectSelect.innerHTML = state.projects
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
    .join("");

  if (!state.projects.some((project) => project.id === els.projectSelect.value)) {
    els.projectSelect.value = state.projects[0]?.id || "life-finance-lab";
  }

  els.dateFilter.value = selectedDate;
}

function bindEvents() {
  els.navTabs.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  els.recordButton.addEventListener("click", toggleRecording);
  els.saveNoteButton.addEventListener("click", saveManualNote);
  els.manualInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      saveManualNote();
    }
  });

  els.dateFilter.addEventListener("change", () => {
    selectedDate = els.dateFilter.value || toDateKey(new Date());
    visibleMonth = new Date(`${selectedDate}T00:00:00`);
    render();
  });

  els.prevMonth.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  els.nextMonth.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  els.typeFilter.addEventListener("change", renderInbox);
  els.targetFilter.addEventListener("change", renderInbox);

  els.addProjectButton.addEventListener("click", addProject);
  els.newProjectName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addProject();
  });

  els.clearCompletedButton.addEventListener("click", () => {
    state.notes = state.notes.filter((note) => note.status !== "done");
    saveState();
    render();
  });

  els.exportButton.addEventListener("click", () => openPromptDialog());
  if (els.commandPacketButton) {
    els.commandPacketButton.addEventListener("click", () => openPromptDialog("all", getCommandCenterNotes()));
  }
  els.closePromptButton.addEventListener("click", () => els.promptDialog.close());
  els.copyPromptButton.addEventListener("click", copyPrompt);
  els.downloadJsonButton.addEventListener("click", downloadJsonBackup);
  els.downloadTextButton.addEventListener("click", downloadTextBackup);
  if (els.restoreBackupButton && els.restoreBackupInput) {
    els.restoreBackupButton.addEventListener("click", () => els.restoreBackupInput.click());
    els.restoreBackupInput.addEventListener("change", importJsonBackup);
  }
}

function setView(viewName) {
  activeView = viewName;

  els.navTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  els.views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  render();
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      stopTimer();
      setRecordingUi(false);

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      await saveAudioNote(blob);
    });

    mediaRecorder.start();
    startedAt = Date.now();
    startTimer();
    setRecordingUi(true);
  } catch (error) {
    els.recordStatus.textContent = "마이크 권한을 확인해 주세요.";
  }
}

async function saveAudioNote(blob) {
  els.recordStatus.textContent = "음성을 텍스트로 바꾸는 중...";

  const audioUrl = await blobToDataUrl(blob);
  let transcript = "";
  let transcriptError = "";

  try {
    transcript = await transcribeAudio(audioUrl);
  } catch (error) {
    transcriptError = error?.message || "알 수 없는 오류";
    console.warn(error);
  }

  const text = transcript?.trim() || "음성 메모가 저장되었습니다. 재생해서 내용을 확인하세요.";
  addNote({ text, audioUrl });
  els.recordStatus.textContent = transcript
    ? "음성 기록이 실행 대기열에 저장되었습니다."
    : `음성은 저장됐지만 텍스트 변환은 실패했습니다. ${transcriptError}`;
}

async function transcribeAudio(audioDataUrl) {
  const response = await fetch("/.netlify/functions/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioDataUrl }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `transcribe failed: ${response.status}`);
  }

  return data.text || "";
}

function saveManualNote() {
  const text = els.manualInput.value.trim();
  if (!text) return;

  addNote({ text, audioUrl: "" });
  els.manualInput.value = "";
}

function addNote({ text, audioUrl = "" }) {
  const selectedType = els.noteTypeSelect.value;
  const selectedTarget = els.targetSelect.value;
  const type = selectedType === "auto" ? classifyType(text) : selectedType;
  const target = selectedTarget === "auto" ? classifyTarget(text, type) : selectedTarget;

  state.notes.unshift({
    id: makeId(),
    createdAt: new Date().toISOString(),
    date: toDateKey(new Date()),
    text,
    type,
    target,
    projectId: els.projectSelect.value || state.projects[0]?.id || "life-finance-lab",
    status: "pending",
    audioUrl,
  });

  saveState();
  render();
}

function classifyType(text) {
  const value = text.toLowerCase();

  if (/(일정|예약|미팅|회의|캘린더|내일|오늘|다음\s?주|오전|오후|\d{1,2}시|날짜)/i.test(value)) {
    return "schedule";
  }

  if (/(아이디어|구상|떠올랐|생각|서비스|앱|컨셉|해보면|어떨까|가능할까|사업화)/i.test(value)) {
    return "idea";
  }

  if (/(코덱스|codex|실장|개발|수정|배포|파일|서버|작업|지시|구현|만들|자동화)/i.test(value)) {
    return "instruction";
  }

  if (/(해야|확인|처리|올려|업로드|정리|진행|준비|보내|체크)/i.test(value)) {
    return "task";
  }

  return "memo";
}

function classifyTarget(text, type) {
  const value = text.toLowerCase();

  if (type === "schedule") return "calendar";
  if (/(코덱스|codex|실장|개발|수정|배포|서버|파일|구현|자동화)/i.test(value)) return "codex";
  if (/(gpt|지피티|챗지피티|정리|요약|문장|초안|검수)/i.test(value)) return "gpt";
  if (/(일일|하루|오늘 정리|오늘 요약)/i.test(value)) return "daily";
  if (type === "idea") return "archive";
  if (type === "task" || type === "instruction") return "codex";

  return "archive";
}

function render() {
  hydrateSelects();
  renderHeader();
  renderStats();
  renderToday();
  renderCalendar();
  renderInbox();
  renderProjects();
  renderPlanner();
  renderCommandCenter();
  renderBackupReminder();
}

function renderHeader() {
  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

function renderStats() {
  const todayNotes = state.notes.filter((note) => note.date === toDateKey(new Date()));
  const pendingNotes = state.notes.filter((note) => note.status !== "done");
  const finishToday = state.notes.filter((note) => note.status === "today");
  const schedules = state.notes.filter((note) => note.type === "schedule" && note.status !== "done");

  els.todayCount.textContent = todayNotes.length;
  els.pendingCount.textContent = pendingNotes.length;
  if (els.finishTodayCount) els.finishTodayCount.textContent = finishToday.length;
  els.projectCount.textContent = state.projects.length;
  els.scheduleCount.textContent = schedules.length;
  els.sideSummary.textContent = `기록 ${state.notes.length}개 · 대기 ${pendingNotes.length}개 · 오늘 ${finishToday.length}개`;
}

function renderToday() {
  const notes = state.notes.filter((note) => note.date === selectedDate);
  els.todayTimeline.innerHTML = notes.length ? notes.map(renderNoteCard).join("") : renderEmpty("이 날짜에는 아직 기록이 없습니다.");
  bindNoteActions(els.todayTimeline);
}

function renderCalendar() {
  els.monthLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(visibleMonth);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDay; i += 1) {
    cells.push(`<button class="calendar-day muted" type="button" disabled></button>`);
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const date = toDateKey(new Date(year, month, day));
    const count = state.notes.filter((note) => note.date === date).length;
    cells.push(`
      <button class="calendar-day ${date === selectedDate ? "active" : ""}" type="button" data-date="${date}">
        <strong>${day}</strong>
        ${count ? `<span>${count}개</span>` : ""}
      </button>
    `);
  }

  els.calendarGrid.innerHTML = cells.join("");
  els.calendarGrid.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDate = button.dataset.date;
      els.dateFilter.value = selectedDate;
      render();
    });
  });

  els.selectedDayTitle.textContent = `${selectedDate} 기록`;
  const notes = state.notes.filter((note) => note.date === selectedDate);
  els.selectedDayNotes.innerHTML = notes.length ? notes.map(renderNoteCard).join("") : renderEmpty("선택한 날짜 기록이 없습니다.");
  bindNoteActions(els.selectedDayNotes);
}

function renderInbox() {
  const type = els.typeFilter.value;
  const target = els.targetFilter.value;
  const notes = state.notes.filter((note) => {
    const typeOk = type === "all" || note.type === type;
    const targetOk = target === "all" || note.target === target;
    return typeOk && targetOk;
  });

  els.inboxList.innerHTML = notes.length ? notes.map(renderNoteCard).join("") : renderEmpty("조건에 맞는 기록이 없습니다.");
  bindNoteActions(els.inboxList);
}

function renderProjects() {
  els.projectGrid.innerHTML = state.projects.map((project) => {
    const notes = state.notes.filter((note) => note.projectId === project.id);
    const pending = notes.filter((note) => note.status !== "done").length;
    return `
      <article class="project-card">
        <strong>${escapeHtml(project.name)}</strong>
        <span>기록 ${notes.length}개 · 대기 ${pending}개</span>
      </article>
    `;
  }).join("");
}

function renderPlanner() {
  els.taskBoard.innerHTML = targetOrder.map((target) => {
    const notes = state.notes.filter((note) => note.target === target && note.status !== "done");
    return `
      <section class="task-column">
        <h3>${targetLabels[target]}</h3>
        ${notes.length ? notes.map(renderNoteCard).join("") : renderEmpty("대기 없음")}
      </section>
    `;
  }).join("");

  bindNoteActions(els.taskBoard);
}

function renderCommandCenter() {
  if (!els.commandBoard) return;

  const focusNotes = getCommandCenterNotes();
  const topNote = focusNotes[0]
    || state.notes.find((note) => note.status === "progress")
    || state.notes.find((note) => note.status === "pending");

  if (topNote) {
    const project = state.projects.find((item) => item.id === topNote.projectId);
    els.commandFocusTitle.textContent = `${project ? project.name : "미지정"} · ${statusLabels[topNote.status] || topNote.status}`;
    els.commandFocusText.textContent = topNote.text;
  } else {
    els.commandFocusTitle.textContent = "아직 지정된 일이 없습니다.";
    els.commandFocusText.textContent = "기록 카드에서 오늘마무리를 누르면 이곳에 올라옵니다.";
  }

  els.commandBoard.innerHTML = statusOrder.map((status) => {
    const notes = sortExecutionNotes(state.notes.filter((note) => note.status === status));
    return `
      <section class="command-column status-${status}">
        <div class="command-column-head">
          <h3>${statusLabels[status]}</h3>
          <span>${notes.length}개</span>
        </div>
        ${notes.length ? notes.map(renderNoteCard).join("") : renderEmpty("해당 항목 없음")}
      </section>
    `;
  }).join("");

  bindNoteActions(els.commandBoard);
}

function sortExecutionNotes(notes) {
  const statusRank = {
    today: 0,
    progress: 1,
    pending: 2,
    hold: 3,
    done: 4,
  };

  return [...notes].sort((a, b) => {
    const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (statusDiff) return statusDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
function renderNoteCard(note) {
  const project = state.projects.find((item) => item.id === note.projectId);
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(note.createdAt));

  return `
    <article class="note-card" data-id="${note.id}">
      <div class="note-meta">
        <span class="badge type-${note.type}">${typeLabels[note.type] || note.type}</span>
        <span class="badge target-${note.target}">${targetLabels[note.target] || note.target}</span>
        <span class="badge">${project ? escapeHtml(project.name) : "프로젝트 없음"}</span>
        <span class="badge">${time}</span>
        <span class="status-pill">${statusLabels[note.status] || note.status}</span>
      </div>
      <p>${escapeHtml(note.text)}</p>
      ${note.audioUrl ? `<audio controls src="${note.audioUrl}"></audio>` : ""}
      <div class="card-actions">
        <button type="button" data-action="today">오늘마무리</button>
        <button type="button" data-action="progress">진행중</button>
        <button type="button" data-action="pending">대기</button>
        <button type="button" data-action="done">완료</button>
        <button type="button" data-action="hold">보류</button>
        <button type="button" data-action="prompt">지시문</button>
      </div>
    </article>
  `;
}

function bindNoteActions(container) {
  container.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-id]");
      const note = state.notes.find((item) => item.id === card.dataset.id);
      if (!note) return;

      const action = button.dataset.action;
      if (action === "prompt") {
        openPromptDialog(note.target, [note]);
        return;
      }

      note.status = action;
      saveState();
      render();
    });
  });
}

function openPromptDialog(target = els.promptMode.value, notesOverride = null) {
  const notes = notesOverride || getPromptNotes(target);
  els.promptOutput.value = buildPrompt(target, notes);
  els.promptDialog.showModal();
}

function getPromptNotes(target) {
  const actionable = state.notes.filter((note) => note.status !== "done");
  if (target === "all") return actionable;
  return actionable.filter((note) => note.target === target);
}

function getCommandCenterNotes() {
  return sortExecutionNotes(state.notes.filter((note) => ["today", "progress", "pending"].includes(note.status)));
}

function buildPrompt(target, notes) {
  const title = target === "all" ? "Voice OS 전체 실행 지시문" : `${targetLabels[target] || "Voice OS"} 지시문`;
  const sortedNotes = sortExecutionNotes(notes);
  const grouped = groupBy(sortedNotes, (note) => note.target);
  const statusSummary = statusOrder
    .map((status) => `${statusLabels[status] || status}: ${sortedNotes.filter((note) => note.status === status).length}개`)
    .join(" / ");

  const lines = [
    `[${title}]`,
    "",
    "아래 내용은 모바일 Voice OS에서 수집한 실행 대기 항목입니다.",
    "이 내용을 복사해 코덱스, GPT, 관리실장에게 붙여넣으면 됩니다.",
    "오늘마무리 → 진행중 → 대기 → 보류 순서로 우선순위를 판단하고, 필요한 작업을 실행 가능한 단위로 정리해 주세요.",
    `상태 요약: ${statusSummary}`,
    "",
  ];

  const groups = target === "all" ? targetOrder : [target];
  groups.forEach((key) => {
    const items = grouped[key] || [];
    if (!items.length) return;

    lines.push(`## ${targetLabels[key] || key}`);
    items.forEach((note, index) => {
      const project = state.projects.find((item) => item.id === note.projectId);
      lines.push(`${index + 1}. 날짜: ${note.date}`);
      lines.push(`   프로젝트: ${project ? project.name : "미지정"}`);
      lines.push(`   유형: ${typeLabels[note.type] || note.type}`);
      lines.push(`   상태: ${statusLabels[note.status] || note.status}`);
      lines.push(`   내용: ${note.text}`);
      lines.push("");
    });
  });

  if (!sortedNotes.length) {
    lines.push("아직 보낼 항목이 없습니다. 먼저 녹음하거나 기록을 저장한 뒤 다시 지시문을 만들어 주세요.");
  }

  return lines.join("\n");
}
async function copyPrompt() {
  await navigator.clipboard.writeText(els.promptOutput.value);
  els.copyPromptButton.textContent = "복사 완료";
  setTimeout(() => {
    els.copyPromptButton.textContent = "지시문 복사";
  }, 1500);
}

function addProject() {
  const name = els.newProjectName.value.trim();
  if (!name) return;

  const existingProject = state.projects.find((project) => projectNameKey(project.name) === projectNameKey(name));
  if (existingProject) {
    els.projectSelect.value = existingProject.id;
    els.newProjectName.value = "";
    render();
    return;
  }

  const id = slugify(name);
  const uniqueId = state.projects.some((project) => project.id === id) ? `${id}-${Date.now()}` : id;
  state.projects.push({ id: uniqueId, name });
  els.newProjectName.value = "";
  saveState();
  render();
}

function renderBackupReminder() {
  if (!els.backupReminder) return;
  const info = getBackupReminderInfo();
  els.backupReminder.hidden = !info.shouldShow;
  els.backupReminder.textContent = info.message;
}

function getBackupReminderInfo() {
  const noteCount = state.notes.length;
  if (noteCount < BACKUP_REMINDER_INTERVAL) {
    return { shouldShow: false, message: "" };
  }

  const last = readBackupReminder();
  const lastCount = Number(last?.count || 0);
  const added = noteCount - lastCount;
  if (!last || added >= BACKUP_REMINDER_INTERVAL) {
    return {
      shouldShow: true,
      message: `기록이 ${noteCount}개 쌓였습니다. JSON 백업을 내려받아 안전하게 보관해 주세요.`,
    };
  }

  return { shouldShow: false, message: "" };
}

function readBackupReminder() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_REMINDER_KEY) || "null");
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function markBackupCompleted() {
  try {
    localStorage.setItem(BACKUP_REMINDER_KEY, JSON.stringify({
      at: new Date().toISOString(),
      count: state.notes.length,
    }));
  } catch (error) {
    console.warn(error);
  }
}
function downloadJsonBackup() {
  downloadFile(`voice-os-backup-${toDateKey(new Date())}.json`, JSON.stringify(state, null, 2), "application/json");
  markBackupCompleted();
  renderBackupReminder();
}

function downloadTextBackup() {
  const content = state.notes.map((note) => {
    const project = state.projects.find((item) => item.id === note.projectId);
    return [
      `# ${note.date} ${targetLabels[note.target] || note.target}`,
      `프로젝트: ${project ? project.name : "미지정"}`,
      `유형: ${typeLabels[note.type] || note.type}`,
      `상태: ${statusLabels[note.status] || note.status}`,
      "",
      note.text,
      "",
    ].join("\n");
  }).join("\n---\n\n");

  downloadFile(`voice-os-summary-${toDateKey(new Date())}.md`, content, "text/markdown");
}

function importJsonBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeState(JSON.parse(reader.result));
      const before = state.notes.length;
      const merged = mergeImportedState(imported);
      state.projects = merged.projects;
      state.notes = merged.notes;
      saveState();
      render();
      const added = Math.max(0, state.notes.length - before);
      alert(`백업을 불러왔습니다. 새 기록 ${added}개가 추가되었습니다.`);
    } catch (error) {
      console.warn(error);
      alert("백업 파일을 읽지 못했습니다. JSON 백업 파일인지 확인해 주세요.");
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => alert("백업 파일을 읽지 못했습니다.");
  reader.readAsText(file, "utf-8");
}

function mergeImportedState(imported) {
  const rawProjects = [...(state.projects || []), ...(imported.projects || [])];
  const projects = mergeProjects(rawProjects);
  const projectIdMap = createProjectIdMap(rawProjects, projects);
  const notes = (state.notes || [])
    .map((note) => normalizeNote(remapNoteProject(note, projectIdMap), projects))
    .filter(Boolean);
  const seen = new Set(notes.map(noteSignature));

  (imported.notes || []).forEach((note) => {
    const normalized = normalizeNote(remapNoteProject(note, projectIdMap), projects);
    if (!normalized) return;
    const signature = noteSignature(normalized);
    if (!seen.has(signature)) {
      notes.push(normalized);
      seen.add(signature);
    }
  });

  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { projects, notes };
}

function noteSignature(note) {
  return [note.createdAt, note.text, note.audioUrl || ""].join("|");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setRecordingUi(isRecording) {
  els.recordButton.classList.toggle("recording", isRecording);
  els.recordButtonText.textContent = isRecording ? "녹음 중지" : "녹음 시작";
  els.recordStatus.textContent = isRecording ? "녹음 중" : "대기 중";
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const rest = String(seconds % 60).padStart(2, "0");
    els.recordTimer.textContent = `${minutes}:${rest}`;
  }, 250);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  els.recordTimer.textContent = "00:00";
}

function loadState() {
  const keys = getStorageCandidateKeys();
  for (const key of keys) {
    const candidate = readStateCandidate(key);
    if (candidate && (candidate.notes.length || candidate.projects.length)) {
      persistState(candidate);
      return candidate;
    }
  }

  const emptyState = normalizeState({ projects: starterProjects, notes: [] });
  persistState(emptyState);
  return emptyState;
}

function saveState() {
  persistState(state);
}

function persistState(nextState) {
  const serialized = JSON.stringify(nextState);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn(error);
  }
  try {
    localStorage.setItem(STABLE_STORAGE_KEY, serialized);
  } catch (error) {
    console.warn(error);
  }
}

function getStorageCandidateKeys() {
  const keys = [STORAGE_KEY, STABLE_STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /voice|execution|record|memo|note|os/i.test(key)) {
        keys.push(key);
      }
    }
  } catch (error) {
    console.warn(error);
  }
  return [...new Set(keys)].filter(Boolean);
}

function readStateCandidate(key) {
  try {
    const rawText = localStorage.getItem(key);
    if (!rawText) return null;
    return normalizeState(JSON.parse(rawText));
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawProjects = Array.isArray(source.projects) ? source.projects : [];
  const projects = mergeProjects(rawProjects);
  const projectIdMap = createProjectIdMap(rawProjects, projects);
  const rawNotes = Array.isArray(source.notes)
    ? source.notes
    : Array.isArray(source.records)
      ? source.records
      : Array.isArray(source.entries)
        ? source.entries
        : Array.isArray(source.items)
          ? source.items
          : [];
  return {
    projects,
    notes: rawNotes.map((note) => normalizeNote(remapNoteProject(note, projectIdMap), projects)).filter(Boolean),
  };
}

function normalizeProject(project) {
  if (!project || typeof project !== "object") return null;
  const id = firstString(project.id, project.key, project.value) || makeId();
  const name = firstString(project.name, project.title, project.label) || id;
  return { id, name };
}

function mergeProjects(projects = []) {
  const byName = new Map();
  const ordered = [];

  function upsert(project) {
    const normalized = normalizeProject(project);
    if (!normalized) return;
    const key = projectNameKey(normalized.name) || normalized.id;
    if (byName.has(key)) return;
    const copy = { ...normalized };
    byName.set(key, copy);
    ordered.push(copy);
  }

  starterProjects.forEach(upsert);
  projects.forEach(upsert);
  return ordered;
}

function createProjectIdMap(projects = [], mergedProjects = []) {
  const byName = new Map();
  const byId = new Map();

  mergedProjects.forEach((project) => {
    byName.set(projectNameKey(project.name), project.id);
    byId.set(project.id, project.id);
  });

  [...starterProjects, ...projects].map(normalizeProject).filter(Boolean).forEach((project) => {
    byId.set(project.id, byName.get(projectNameKey(project.name)) || project.id);
  });

  return byId;
}

function remapNoteProject(note, projectIdMap) {
  if (!note || typeof note !== "object") return note;
  const requestedProjectId = firstString(note.projectId, note.project_id);
  const mappedProjectId = projectIdMap.get(requestedProjectId);
  return mappedProjectId ? { ...note, projectId: mappedProjectId } : note;
}

function projectNameKey(name = "") {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeNote(note, projects = starterProjects) {
  if (!note || typeof note !== "object") return null;
  const projectIds = new Set(projects.map((project) => project.id));
  const requestedProjectId = firstString(note.projectId, note.project_id);
  const createdAt = firstString(
    note.createdAt,
    note.timestamp,
    note.time,
    note.created_at,
    note.created,
  ) || new Date().toISOString();
  const text = firstString(
    note.text,
    note.transcript,
    note.content,
    note.memo,
    note.message,
    note.title,
  ) || "Audio memo saved. Play to review.";
  const type = isKnown(typeLabels, note.type) ? note.type : classifyType(text);
  const target = isKnown(targetLabels, note.target) ? note.target : classifyTarget(text, type);
  return {
    id: firstString(note.id, note.uuid) || makeId(),
    createdAt,
    date: firstString(note.date) || safeDateKey(createdAt),
    text,
    type,
    target,
    projectId: projectIds.has(requestedProjectId) ? requestedProjectId : "life-finance-lab",
    status: isKnown(statusLabels, note.status) ? note.status : "pending",
    audioUrl: firstString(note.audioUrl, note.audio, note.audio_url, note.fileUrl) || "",
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function safeDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toDateKey(new Date());
  return toDateKey(date);
}

function isKnown(map, value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(map, value);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "") || `project-${Date.now()}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function groupBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function renderEmpty(message) {
  return `<div class="empty-state">${message}</div>`;
}

