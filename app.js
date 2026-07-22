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

const meetingModeLabels = {
  lite: "Lite - 단순 확인",
  full: "Full - 구조 검토",
  emergency: "Emergency - 장애 대응",
};

const meetingAudienceLabels = {
  all: "전체 회의실",
  management: "경영실장",
  pmo: "관리실장",
  codex: "기술실장",
  content: "콘텐츠본부장",
  designer: "연구소디자이너",
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
let promptCopyButtonLabel = "지시문 복사";

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
  meetingAgendaInput: $("meetingAgendaInput"),
  meetingModeSelect: $("meetingModeSelect"),
  meetingAudienceSelect: $("meetingAudienceSelect"),
  meetingPacketButton: $("meetingPacketButton"),
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
  centralStoreTrialButton: $("centralStoreTrialButton"),
  centralStoreDialog: $("centralStoreDialog"),
  centralStorePreview: $("centralStorePreview"),
  centralStorePassword: $("centralStorePassword"),
  centralStoreStatus: $("centralStoreStatus"),
  startCentralStoreTrialButton: $("startCentralStoreTrialButton"),
  closeCentralStoreDialogButton: $("closeCentralStoreDialogButton"),
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

  if (els.meetingPacketButton) {
    els.meetingPacketButton.addEventListener("click", openMeetingPacketDialog);
  }
  els.closePromptButton.addEventListener("click", () => els.promptDialog.close());
  els.copyPromptButton.addEventListener("click", copyPrompt);
  els.downloadJsonButton.addEventListener("click", downloadJsonBackup);
  els.downloadTextButton.addEventListener("click", downloadTextBackup);
  if (els.restoreBackupButton && els.restoreBackupInput) {
    els.restoreBackupButton.addEventListener("click", () => els.restoreBackupInput.click());
    els.restoreBackupInput.addEventListener("change", importJsonBackup);
  }
  if (els.centralStoreTrialButton) {
    els.centralStoreTrialButton.addEventListener("click", openCentralStoreTrial);
    els.startCentralStoreTrialButton.addEventListener("click", runCentralStoreTrial);
    els.closeCentralStoreDialogButton.addEventListener("click", closeCentralStoreTrial);
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

  if (activeView === "meeting") {
    if (transcript?.trim()) {
      appendMeetingAgenda(transcript.trim());
      els.recordStatus.textContent = "회의 안건에 음성 내용이 입력되었습니다.";
      return;
    }

    addNote({ text: "회의 안건 음성 변환에 실패했습니다. 재생해서 내용을 확인하세요.", audioUrl });
    els.recordStatus.textContent = `회의 안건 변환은 실패했고, 음성은 기록함에 저장했습니다. ${transcriptError}`;
    return;
  }

  const text = transcript?.trim() || "음성 메모가 저장되었습니다. 재생해서 내용을 확인하세요.";
  addNote({ text, audioUrl });
  els.recordStatus.textContent = transcript
    ? "음성 기록이 실행 대기열에 저장되었습니다."
    : `음성은 저장됐지만 텍스트 변환은 실패했습니다. ${transcriptError}`;
}

function appendMeetingAgenda(text) {
  if (!els.meetingAgendaInput) return;

  const current = els.meetingAgendaInput.value.trim();
  els.meetingAgendaInput.value = current ? `${current}\n${text}` : text;
  els.meetingAgendaInput.focus();
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
  setPromptDialogMeta(
    "코덱스/GPT에게 보낼 지시문",
    "아래 내용을 복사해서 코덱스, GPT, 관리실장에게 붙여넣으면 됩니다.",
    "지시문 복사"
  );
  const notes = notesOverride || getPromptNotes(target);
  els.promptOutput.value = buildPrompt(target, notes);
  els.promptDialog.showModal();
}

function setPromptDialogMeta(title, helpText, copyLabel) {
  promptCopyButtonLabel = copyLabel;
  if (els.promptDialogTitle) els.promptDialogTitle.textContent = title;
  if (els.promptDialogHelp) els.promptDialogHelp.textContent = helpText;
  if (els.copyPromptButton) els.copyPromptButton.textContent = copyLabel;
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
async function openMeetingPacketDialog() {
  setPromptDialogMeta("AI 회의실 인계 패킷", getMeetingNextStepGuide(), "인계 패킷 복사");
  els.promptOutput.value = buildMeetingPacket();
  els.promptDialog.showModal();
}

function getMeetingNextStepGuide() {
  const audience = els.meetingAudienceSelect?.value || "all";
  const targetName = meetingAudienceLabels[audience] || "선택한 AI";
  if (audience === "all") {
    return "다음 처리: 1) 인계 패킷 복사 2) 관리실장에게 먼저 붙여넣기 3) 관리실장이 경영실장·기술실장·콘텐츠/디자인 검토 순서를 잡게 하기 4) 회신 결과를 Voice OS 기록으로 다시 저장하세요.";
  }
  return `다음 처리: 1) 인계 패킷 복사 2) ${targetName} 채팅창에 붙여넣기 3) 받은 답변을 Voice OS 기록 또는 회의 안건으로 다시 저장하세요.`;
}

function buildMeetingPacket() {
  const agenda = (els.meetingAgendaInput?.value || "").trim() || "(회의 안건 미입력)";
  const mode = els.meetingModeSelect?.value || "lite";
  const audience = els.meetingAudienceSelect?.value || "all";
  const notes = sortExecutionNotes(getCommandCenterNotes());
  const counts = getStatusCounts();
  const noteLines = formatMeetingNoteLines(notes);
  const modeGuide = getMeetingModeGuide(mode);
  const audienceGuide = getMeetingAudienceGuide(audience);

  return [
    "[Voice OS AI 회의실 인계 패킷]",
    "",
    `생성 시각: ${new Date().toLocaleString("ko-KR")}`,
    `회의 모드: ${meetingModeLabels[mode] || mode}`,
    `전달 대상: ${meetingAudienceLabels[audience] || audience}`,
    "",
    "[회의 안건]",
    agenda,
    "",
    "[회의 방식]",
    modeGuide,
    "",
    "[전달 대상별 검토 기준]",
    audienceGuide,
    "",
    "[현재 실행대기 요약]",
    `오늘 마무리: ${counts.today}개`,
    `진행중: ${counts.progress}개`,
    `대기: ${counts.pending}개`,
    `보류: ${counts.hold}개`,
    `완료: ${counts.done}개`,
    "",
    "[참고 실행대기 항목]",
    noteLines.length ? noteLines.join("\n") : "현재 전달할 실행대기 항목이 없습니다.",
    "",
    "[요청]",
    "1. 위 안건을 기준으로 이미 합의된 기준과 충돌하는지 먼저 확인해 주세요.",
    "2. 새 문서나 새 기능을 만들기 전에 기존 Voice OS 구조와 재사용 가능한 자산을 먼저 확인해 주세요.",
    "3. 결론은 설명이 아니라 실행 가능한 액션아이템으로 정리해 주세요.",
    "",
    "[출력 형식]",
    "- 확인된 사실:",
    "- 판단:",
    "- 필요한 작업:",
    "- 담당:",
    "- 다음 액션:",
    "- 대표 승인 필요 여부:",
  ].join("\n");
}

function getMeetingModeGuide(mode) {
  const guides = {
    lite: "단순 확인 또는 경미한 수정 안건입니다. 결론만 짧게 정리하고, 불필요한 추가 회의는 만들지 않습니다.",
    full: "구조, 우선순위, 운영 방식 변경 가능성이 있는 안건입니다. 독립 의견, 교차 검토, 관리실장 종합, 대표 승인 흐름을 기준으로 검토합니다.",
    emergency: "장애, 배포 실패, 데이터 손실 가능성이 있는 긴급 안건입니다. 자산 대조보다 원인 파악과 복구 조치를 우선하고, 종료 후 회고를 남깁니다.",
  };
  return guides[mode] || guides.lite;
}

function getMeetingAudienceGuide(audience) {
  const guides = {
    all: [
      "경영실장: 전략, 우선순위, 대표 시간 보호 관점에서 검토합니다.",
      "관리실장: 중복, 실현가능성, 기존 자산과의 충돌 여부를 검토합니다.",
      "기술실장: 구현 난이도, 영향 범위, 배포 안정성을 검토합니다.",
      "콘텐츠/디자인: 콘텐츠 품질, 브랜드 일관성, 산출물 형태를 검토합니다.",
    ],
    management: ["전략 방향, 우선순위, 대표 의사결정 부담 감소 여부를 중심으로 검토합니다."],
    pmo: ["기존 자산 중복, 회의 필요성, 역할별 인계 가능성, 누락 위험을 중심으로 검토합니다."],
    codex: ["기존 코드 구조, 최소 수정 가능성, 영향 범위, 테스트 방법을 중심으로 검토합니다."],
    content: ["콘텐츠 목적, 독자 흐름, 발행패키지 기준, 운영원칙 일치 여부를 중심으로 검토합니다."],
    designer: ["브랜드 자산, 루키/루나 역할, 이미지 산출물 형태, 모바일 가독성을 중심으로 검토합니다."],
  };
  return (guides[audience] || guides.all).map((line) => `- ${line}`).join("\n");
}

function formatMeetingNoteLines(notes) {
  return notes.slice(0, 10).map((note, index) => {
    const project = state.projects.find((item) => item.id === note.projectId)?.name || "미지정";
    return `${index + 1}. [${statusLabels[note.status] || note.status}] ${note.text} / 대상: ${targetLabels[note.target] || note.target} / 프로젝트: ${project}`;
  });
}
function getStatusCounts() {
  return state.notes.reduce(
    (acc, note) => {
      if (acc[note.status] !== undefined) acc[note.status] += 1;
      return acc;
    },
    { today: 0, progress: 0, pending: 0, hold: 0, done: 0 }
  );
}
async function copyPrompt() {
  await navigator.clipboard.writeText(els.promptOutput.value);
  els.copyPromptButton.textContent = "복사 완료";
  setTimeout(() => {
    els.copyPromptButton.textContent = promptCopyButtonLabel;
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

function openCentralStoreTrial() {
  try {
    const api = globalThis.VoiceOsCentralStorePreview;
    if (!api) throw new Error("중앙 저장소 미리보기 모듈을 불러오지 못했습니다.");
    const { preview } = api.buildSnapshot(state);
    els.centralStorePreview.textContent = [
      `프로젝트: ${preview.projects}개`,
      `VoiceCommand 후보: ${preview.voiceCommands}개`,
      `Task 자동 생성: ${preview.tasks}개`,
      `제외되는 음성: ${preview.audioExcluded}개`,
      "",
      "승인하면 운영 저장소가 아닌 stage3-test 저장소에만 시험 복사합니다.",
    ].join("\n");
    els.centralStoreStatus.textContent = "";
    els.centralStorePassword.value = "";
    els.centralStoreDialog.showModal();
    els.centralStorePassword.focus();
  } catch (error) {
    alert(error.message || "시험 복사 미리보기를 만들지 못했습니다.");
  }
}

function closeCentralStoreTrial() {
  els.centralStorePassword.value = "";
  els.centralStoreStatus.textContent = "";
  els.centralStoreDialog.close();
}

async function runCentralStoreTrial() {
  const password = els.centralStorePassword.value;
  if (!password) {
    els.centralStoreStatus.textContent = "테스트 비밀번호를 입력해 주세요.";
    return;
  }

  const api = globalThis.VoiceOsCentralStorePreview;
  const base = "/.netlify/functions/ai-cos";
  els.startCentralStoreTrialButton.disabled = true;
  els.centralStoreStatus.textContent = "시험 복사 및 재대조 중...";

  try {
    const { snapshot } = api.buildSnapshot(state);
    const loginResponse = await fetch(`${base}?action=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const login = await loginResponse.json();
    if (!loginResponse.ok || !login.token) {
      throw new Error(login.error_code === "INVALID_CREDENTIALS"
        ? "비밀번호가 일치하지 않습니다."
        : "인증에 실패했습니다.");
    }

    const headers = {
      Authorization: `Bearer ${login.token}`,
      "Content-Type": "application/json",
    };
    const saveResponse = await fetch(`${base}?action=snapshot`, {
      method: "POST",
      headers,
      body: JSON.stringify(snapshot),
    });
    const saved = await saveResponse.json();
    if (!saveResponse.ok || !saved.ok) throw new Error("시험 복사에 실패했습니다.");

    await new Promise((resolve) => setTimeout(resolve, 5000));
    const readResponse = await fetch(`${base}?action=snapshot`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const read = await readResponse.json();
    if (!readResponse.ok || !read.ok) throw new Error("시험 복사 결과를 다시 읽지 못했습니다.");

    const compared = api.compareSnapshots(snapshot, read.snapshot);
    if (!compared.projectsMatch || !compared.voiceCommandsMatch || !compared.tasksMatch) {
      throw new Error("원본과 시험 복사본의 건수가 일치하지 않습니다.");
    }

    els.centralStoreStatus.textContent = "시험 복사와 재대조가 완료되었습니다.";
  } catch (error) {
    els.centralStoreStatus.textContent = error.message || "시험 복사 중 오류가 발생했습니다.";
  } finally {
    els.centralStorePassword.value = "";
    els.startCentralStoreTrialButton.disabled = false;
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
      const rawBackup = JSON.parse(reader.result);
      const imported = normalizeState(rawBackup);
      const previewApi = globalThis.VoiceOsBackupPreview;
      if (!previewApi) throw new Error("백업 미리보기 모듈을 불러오지 못했습니다.");

      const preview = previewApi.analyze(rawBackup, imported, state.notes);
      const approved = confirm(previewApi.format(preview, file.name));
      if (!approved) return;
      if (preview.invalid > 0) {
        alert(`변환 불가 기록이 ${preview.invalid}개 있어 병합하지 않았습니다. 백업 파일을 확인해 주세요.`);
        return;
      }

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

