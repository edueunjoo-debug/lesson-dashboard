/* ===========================================================
   수업 단계향상목표 대시보드
   - 읽기: 누구나 data.json을 불러와서 봄 (인증 불필요)
   - 쓰기: 강사 모드에서 GitHub 개인 액세스 토큰(PAT)으로
           GitHub Contents API를 통해 data.json을 직접 커밋
   =========================================================== */

const DEFAULT_DAY_LABELS = ["일", "월", "수", "금"];
const FIELD_DEFS = [
  { key: "title", label: "수업 제목" },
  { key: "learningGoal", label: "학습목표" },
  { key: "stepGoal", label: "단계향상목표" },
  { key: "classGoal", label: "분반 목표" },
  { key: "character", label: "인성 교육" },
  { key: "preClass", label: "수업전 분반" },
  { key: "video", label: "보조 영상" },
  { key: "specialProgram", label: "특별 프로그램" },
  { key: "activity", label: "수강생 활동 및 숙제" },
];

// 화면 보기 방식: "day"(하루씩, 스마트폰에 적합) / "week"(일주일 전체, PC에 적합)
// 한 번 고르면 이 브라우저에 기억되고, 처음 방문 시에는 화면 너비로 자동 추정합니다.
function initialViewMode() {
  const saved = localStorage.getItem("lesson_dashboard_viewmode");
  if (saved === "day" || saved === "week") return saved;
  return window.matchMedia("(max-width: 700px)").matches ? "day" : "week";
}

const state = {
  data: { courseName: "OO과정", weeks: [] },
  token: localStorage.getItem("lesson_dashboard_pat") || "",
  adminMode: false,
  editingWeekId: null,
  activeDayIndex: 0,
  viewMode: initialViewMode(),
  dayViewIndex: {}, // { [weekId]: 현재 보고 있는 요일 인덱스 }
};

const $ = (sel) => document.querySelector(sel);
const weeksContainer = $("#weeks-container");
const syncStatus = $("#sync-status");
const toastEl = $("#toast");

function showToast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------------- 데이터 불러오기 (읽기 전용, 인증 불필요) ---------------- */
async function loadData() {
  syncStatus.textContent = "불러오는 중...";
  try {
    const res = await fetch(`./data.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("data.json을 찾을 수 없습니다.");
    state.data = await res.json();
    if (!Array.isArray(state.data.weeks)) state.data.weeks = [];
    syncStatus.textContent = `마지막 갱신: ${new Date().toLocaleString("ko-KR")}`;
    $("#course-title").textContent = `${state.data.courseName || "과정"} 수업 단계향상목표 대시보드`;
    render();
  } catch (err) {
    syncStatus.textContent = "불러오기 실패";
    weeksContainer.innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다. (${err.message})</div>`;
  }
}

/* ---------------- 렌더링 ---------------- */
function render() {
  document.body.classList.toggle("admin-on", state.adminMode);
  $("#course-title").textContent = `${state.data.courseName || "과정"} 수업 단계향상목표 대시보드`;
  const weeks = [...state.data.weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  if (weeks.length === 0) {
    weeksContainer.innerHTML = `<div class="empty-state">등록된 주차가 없습니다.${state.adminMode ? " '주차 추가' 버튼으로 첫 주차를 등록하세요." : ""}</div>`;
    return;
  }

  weeksContainer.innerHTML = weeks.map(weekCardHtml).join("");

  weeks.forEach((w) => {
    const editBtn = document.getElementById(`edit-${w.id}`);
    if (editBtn) editBtn.addEventListener("click", () => openWeekModal(w.id));
  });
}

function weekCardHtml(week) {
  const days = week.days && week.days.length ? week.days : [];
  const tableHtml = state.viewMode === "day" ? dayModeTableHtml(week, days) : weekModeTableHtml(days);

  return `
  <section class="week-card" id="week-${week.id}">
    <div class="week-head">
      <div class="week-title">&lt;${escapeHtml(state.data.courseName || "OO과정")} ${week.weekNumber}주차&gt; 수업 단계향상목표</div>
      ${week.focus ? `<div class="focus-line">중점: [ ${escapeHtml(week.focus)} ]</div>` : ""}
      ${week.officialGoal ? `<div class="goal-line">&lt;${week.weekNumber}주차 공식 목표&gt; [ ${escapeHtml(week.officialGoal)} ]</div>` : ""}
      <div class="week-actions">
        <button class="btn-outline" id="edit-${week.id}">수정 / 삭제</button>
      </div>
    </div>
    ${tableHtml}
  </section>`;
}

function weekModeTableHtml(days) {
  const headerCells = days
    .map((d) => `<th>${d.sessionNo || "0"}차시 [${d.date || "날짜"}] ${d.label || ""}</th>`)
    .join("");

  const rows = FIELD_DEFS.map((f) => {
    const cells = days
      .map((d) => `<td${f.key === "title" ? ' class="title-cell"' : ""}>${cellContentHtml(d[f.key])}</td>`)
      .join("");
    return `<tr><td class="row-label">${f.label}</td>${cells}</tr>`;
  }).join("");

  return `
    <table class="week-table">
      <thead><tr><th class="row-label">차시</th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function dayModeTableHtml(week, days) {
  if (days.length === 0) return `<div class="empty-state">등록된 요일이 없습니다.</div>`;
  const savedIdx = state.dayViewIndex[week.id] ?? 0;
  const idx = savedIdx < days.length ? savedIdx : 0;
  const activeDay = days[idx];

  const tabs = days
    .map(
      (d, i) =>
        `<button class="day-tab-btn mini-day-tab${i === idx ? " active" : ""}" data-week="${week.id}" data-idx="${i}">${escapeHtml(d.label || `${i + 1}`)}</button>`
    )
    .join("");

  const rows = FIELD_DEFS.map(
    (f) => `<tr><td class="row-label">${f.label}</td><td${f.key === "title" ? ' class="title-cell"' : ""}>${cellContentHtml(activeDay[f.key])}</td></tr>`
  ).join("");

  return `
    <div class="day-tabs mobile-day-tabs">${tabs}</div>
    <div class="day-session-label">${activeDay.sessionNo || "0"}차시 · [${activeDay.date || "날짜"}] ${activeDay.label || ""}</div>
    <table class="week-table day-mode-table">
      <tbody>${rows}</tbody>
    </table>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// 셀 내용을 줄바꿈 기준으로 나눠서 각 줄에 매다는 들여쓰기(행잉 인덴트)를 적용.
// "1. ~~~" 처럼 번호를 붙이고 줄바꿈하면, 내용이 길어 두 줄로 표시될 때
// 두 번째 줄이 번호가 아니라 텍스트 시작 위치에 맞춰 정렬됩니다.
function cellContentHtml(text) {
  const val = (text || "").toString();
  if (!val.trim()) return "";
  return val
    .split(/\r?\n/)
    .map((line) => `<div class="num-line">${escapeHtml(line)}</div>`)
    .join("");
}

/* ---------------- 보기 방식 토글 (하루씩 / 일주일 전체) ---------------- */
function updateViewToggleLabel() {
  $("#btn-view-toggle").textContent = state.viewMode === "day" ? "보기: 하루씩" : "보기: 일주일 전체";
}

$("#btn-view-toggle").addEventListener("click", () => {
  state.viewMode = state.viewMode === "day" ? "week" : "day";
  localStorage.setItem("lesson_dashboard_viewmode", state.viewMode);
  updateViewToggleLabel();
  render();
});

// 하루씩 보기에서 각 주차 카드의 요일 탭 클릭 처리 (카드가 다시 그려져도 동작하도록 이벤트 위임 사용)
weeksContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".mini-day-tab");
  if (!btn) return;
  const weekId = btn.dataset.week;
  const idx = parseInt(btn.dataset.idx, 10);
  state.dayViewIndex[weekId] = idx;
  render();
});

updateViewToggleLabel();

/* ---------------- 강사 모드 (토큰) ---------------- */
$("#btn-admin-toggle").addEventListener("click", () => {
  if (state.adminMode) {
    state.adminMode = false;
    render();
    return;
  }
  if (state.token) {
    state.adminMode = true;
    render();
    showToast("강사 모드로 전환되었습니다.");
    ensureAddButton();
    ensureCourseNameButton();
  } else {
    $("#token-modal").style.display = "flex";
  }
});

$("#token-cancel").addEventListener("click", () => {
  $("#token-modal").style.display = "none";
});

$("#token-save").addEventListener("click", () => {
  const val = $("#token-input").value.trim();
  if (!val) {
    showToast("토큰을 입력하세요.");
    return;
  }
  state.token = val;
  localStorage.setItem("lesson_dashboard_pat", val);
  $("#token-modal").style.display = "none";
  $("#token-input").value = "";
  state.adminMode = true;
  render();
  ensureAddButton();
  ensureCourseNameButton();
  showToast("강사 모드로 전환되었습니다.");
});

function ensureAddButton() {
  if ($("#btn-add-week")) return;
  const btn = document.createElement("button");
  btn.id = "btn-add-week";
  btn.className = "btn-primary";
  btn.textContent = "+ 주차 추가";
  btn.addEventListener("click", () => openWeekModal(null));
  $(".controls").insertBefore(btn, $("#btn-admin-toggle"));
}

// 상단 "OO과정" 과정명을 강사 모드에서 바로 바꿀 수 있는 버튼
function ensureCourseNameButton() {
  if ($("#btn-edit-coursename")) return;
  const btn = document.createElement("button");
  btn.id = "btn-edit-coursename";
  btn.className = "btn-outline";
  btn.textContent = "과정명 수정";
  btn.addEventListener("click", async () => {
    const current = state.data.courseName || "";
    const next = window.prompt("과정 이름을 입력하세요 (예: 초등 논술반 A반)", current);
    if (next === null) return; // 취소
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    const newData = { ...state.data, courseName: trimmed };
    await saveToGitHub(newData, `과정명 변경: ${trimmed}`);
  });
  $(".controls").insertBefore(btn, $("#btn-admin-toggle"));
}
if (state.token) {
  state.adminMode = false; // 새로고침 시엔 다시 켜야 하지만 버튼은 미리 준비
}

/* ---------------- 주차 추가/수정 모달 ---------------- */
function openWeekModal(weekId) {
  state.editingWeekId = weekId;
  state.activeDayIndex = 0;
  const week = weekId ? state.data.weeks.find((w) => w.id === weekId) : null;

  $("#week-modal-title").textContent = week ? `${week.weekNumber}주차 수정` : "주차 추가";
  $("#f-weekNumber").value = week ? week.weekNumber : (nextWeekNumber());
  $("#f-focus").value = week ? week.focus || "" : "";
  $("#f-officialGoal").value = week ? week.officialGoal || "" : "";
  $("#week-delete").style.display = week ? "inline-block" : "none";

  const days = week && week.days && week.days.length
    ? week.days
    : DEFAULT_DAY_LABELS.map((label) => emptyDay(label));

  buildDayTabs(days);
  $("#week-modal").style.display = "flex";
}

function nextWeekNumber() {
  const nums = state.data.weeks.map((w) => w.weekNumber);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function emptyDay(label) {
  return {
    label,
    date: "",
    sessionNo: "",
    title: "",
    learningGoal: "",
    stepGoal: "",
    classGoal: "",
    character: "",
    preClass: "",
    video: "",
    specialProgram: "",
    activity: "",
  };
}

function buildDayTabs(days) {
  const tabsEl = $("#day-tabs");
  const panesEl = $("#day-panes");
  tabsEl.innerHTML = "";
  panesEl.innerHTML = "";

  days.forEach((day, i) => {
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "day-tab-btn" + (i === state.activeDayIndex ? " active" : "");
    tabBtn.textContent = day.label || `일차${i + 1}`;
    tabBtn.addEventListener("click", () => {
      state.activeDayIndex = i;
      tabsEl.querySelectorAll(".day-tab-btn").forEach((b, bi) => b.classList.toggle("active", bi === i));
      panesEl.querySelectorAll(".day-pane").forEach((p, pi) => p.classList.toggle("active", pi === i));
    });
    tabsEl.appendChild(tabBtn);

    const pane = document.createElement("div");
    pane.className = "day-pane" + (i === state.activeDayIndex ? " active" : "");
    pane.dataset.index = i;
    pane.innerHTML = dayFieldsHtml(day, i);
    panesEl.appendChild(pane);
  });
}

// 여러 개의 목표/내용을 "1. ~~~\n2. ~~~" 처럼 줄바꿈해서 입력할 수 있는 항목들.
// 표에 표시될 때 각 줄에 매다는 들여쓰기(행잉 인덴트)가 자동으로 적용됩니다.
const MULTILINE_KEYS = new Set([
  "learningGoal", "stepGoal", "classGoal", "character",
  "preClass", "video", "specialProgram", "activity",
]);

function dayFieldsHtml(day, i) {
  const rows = [
    ["label", "요일 라벨", day.label],
    ["date", "날짜 (예: 2026-08-23)", day.date],
    ["sessionNo", "차시 번호", day.sessionNo],
    ["title", "수업 제목", day.title],
    ["learningGoal", "학습목표", day.learningGoal],
    ["stepGoal", "단계향상목표", day.stepGoal],
    ["classGoal", "분반 목표", day.classGoal],
    ["character", "인성 교육", day.character],
    ["preClass", "수업전 분반", day.preClass],
    ["video", "보조 영상", day.video],
    ["specialProgram", "특별 프로그램", day.specialProgram],
    ["activity", "수강생 활동 및 숙제", day.activity],
  ];
  return rows
    .map(([key, label, val]) => {
      if (MULTILINE_KEYS.has(key)) {
        return `
    <div class="field-row textarea-row">
      <label>${label}<div class="hint">여러 개면 줄바꿈(Enter)으로<br/>1. ~~~<br/>2. ~~~</div></label>
      <textarea rows="3" data-day-index="${i}" data-key="${key}" placeholder="1. 목표 내용&#10;2. 목표 내용">${escapeHtml(val || "")}</textarea>
    </div>`;
      }
      return `
    <div class="field-row">
      <label>${label}</label>
      <input type="text" data-day-index="${i}" data-key="${key}" value="${escapeAttr(val || "")}" />
    </div>`;
    })
    .join("");
}

function escapeAttr(str) {
  return String(str).replaceAll('"', "&quot;");
}

$("#week-cancel").addEventListener("click", () => {
  $("#week-modal").style.display = "none";
});

$("#week-delete").addEventListener("click", async () => {
  if (!state.editingWeekId) return;
  if (!confirm("이 주차를 삭제하시겠습니까? GitHub에 즉시 반영됩니다.")) return;
  const newData = {
    ...state.data,
    weeks: state.data.weeks.filter((w) => w.id !== state.editingWeekId),
  };
  await saveToGitHub(newData, `주차 삭제: ${state.editingWeekId}`);
  $("#week-modal").style.display = "none";
});

$("#week-save").addEventListener("click", async () => {
  const weekNumber = parseInt($("#f-weekNumber").value, 10);
  if (!weekNumber) {
    showToast("주차 번호를 입력하세요.");
    return;
  }
  const focus = $("#f-focus").value.trim();
  const officialGoal = $("#f-officialGoal").value.trim();

  const days = [...document.querySelectorAll(".day-pane")].map((pane) => {
    const day = {};
    pane.querySelectorAll("input, textarea").forEach((inp) => {
      day[inp.dataset.key] = inp.value.trim();
    });
    return day;
  });

  const id = state.editingWeekId || `w${weekNumber}-${Date.now()}`;
  const weekObj = { id, weekNumber, focus, officialGoal, days };

  let weeks;
  if (state.editingWeekId) {
    weeks = state.data.weeks.map((w) => (w.id === state.editingWeekId ? weekObj : w));
  } else {
    weeks = [...state.data.weeks, weekObj];
  }
  const newData = { ...state.data, weeks };

  await saveToGitHub(newData, `${weekNumber}주차 ${state.editingWeekId ? "수정" : "추가"}`);
  $("#week-modal").style.display = "none";
});

/* ---------------- GitHub Contents API 저장 ---------------- */
async function saveToGitHub(newData, commitMessage) {
  if (!state.token) {
    showToast("강사 모드 토큰이 없습니다.");
    return;
  }
  if (GITHUB_OWNER === "YOUR_GITHUB_USERNAME" || GITHUB_REPO === "YOUR_REPO_NAME") {
    showToast("config.js에 GitHub 사용자명/저장소를 먼저 설정하세요.");
    return;
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data.json`;
  const headers = {
    Authorization: `Bearer ${state.token}`,
    Accept: "application/vnd.github+json",
  };

  showToast("저장 중...");
  try {
    // 1) 최신 sha 조회 (충돌 방지)
    const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}&_=${Date.now()}`, { headers });
    if (!getRes.ok) {
      if (getRes.status === 401 || getRes.status === 403) {
        showToast("토큰이 유효하지 않거나 권한이 없습니다. 다시 로그인하세요.");
        state.token = "";
        localStorage.removeItem("lesson_dashboard_pat");
      } else {
        showToast(`불러오기 실패 (${getRes.status})`);
      }
      return;
    }
    const getJson = await getRes.json();
    const sha = getJson.sha;

    // 2) 새 내용 커밋
    const content = utf8ToBase64(JSON.stringify(newData, null, 2));
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage || "데이터 업데이트",
        content,
        sha,
        branch: GITHUB_BRANCH,
      }),
    });

    if (!putRes.ok) {
      const errJson = await putRes.json().catch(() => ({}));
      showToast(`저장 실패: ${errJson.message || putRes.status}`);
      return;
    }

    state.data = newData;
    render();
    showToast("저장 완료! GitHub Pages에 반영까지 최대 1분 정도 걸릴 수 있습니다.");
  } catch (err) {
    showToast(`오류: ${err.message}`);
  }
}

/* ---------------- 초기화 ---------------- */
$("#btn-refresh").addEventListener("click", loadData);
if (state.token) {
  ensureAddButton();
  ensureCourseNameButton();
}

loadData();
