// app.js

const STATE_KEY = 'parashat_tracker_state';
const PLAN_KEY_PREFIX = 'parashat_plan_v8_'; // 캐시 갱신 및 베레시트 주기 맞춤 동적 배분 수정을 반영한 v8 접두사
const DEFAULT_FAMILY_NAME = "P274 v3";
const LEGACY_DEFAULT_NAMES = new Set([
  "P274 Bible Reading Plan",
  "P274 Reading Plan 2.5",
  "P274 2.5"
]);

let appState = {
  progress: {}, // { 'YYYY-MM-DD': { torah: true, megillah: false, ot: false... } }
  familyName: DEFAULT_FAMILY_NAME,
  theme: "dark",
  overrideToday: null, // 테스트용 임의 오늘 날짜 (YYYY-MM-DD)
  customEvents: [],
  events: []
};

let currentPlan = null;
let activeDateStr = null; // 선택된 날짜 (기본: 오늘)

function createDefaultAppState() {
  return {
    progress: {},
    familyName: DEFAULT_FAMILY_NAME,
    theme: "dark",
    overrideToday: null,
    customEvents: [],
    events: [],
    hasEntered: false,
    activeTab: "dashboard"
  };
}

function makeEventId() {
  return `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeAppState(rawState = {}) {
  const state = {
    ...createDefaultAppState(),
    ...(rawState && typeof rawState === 'object' ? rawState : {})
  };

  if (!state.progress || typeof state.progress !== 'object' || Array.isArray(state.progress)) {
    state.progress = {};
  }
  if (!state.familyName || LEGACY_DEFAULT_NAMES.has(state.familyName)) {
    state.familyName = DEFAULT_FAMILY_NAME;
  }
  if (state.theme !== 'light') {
    state.theme = 'dark';
  }

  const existingEvents = Array.isArray(state.events) ? state.events : [];
  if (state.customEvents && !Array.isArray(state.customEvents)) {
    const migratedEvents = [];
    for (const [dateStr, list] of Object.entries(state.customEvents)) {
      if (Array.isArray(list)) {
        list.forEach(title => {
          migratedEvents.push({
            id: makeEventId(),
            title,
            startDate: dateStr,
            endDate: dateStr,
            color: 'gold'
          });
        });
      }
    }
    state.events = [...migratedEvents, ...existingEvents];
  } else {
    state.events = existingEvents;
  }
  state.customEvents = [];
  state.events = state.events
    .filter(evt => evt && evt.title && evt.startDate && evt.endDate)
    .map(evt => ({
      id: evt.id || makeEventId(),
      title: String(evt.title),
      startDate: evt.startDate,
      endDate: evt.endDate,
      color: evt.color || 'gold'
    }));

  return state;
}

function loadAppState() {
  const savedState = localStorage.getItem(STATE_KEY);
  if (!savedState) return createDefaultAppState();

  try {
    return normalizeAppState(JSON.parse(savedState));
  } catch (e) {
    console.warn('Saved state could not be parsed. Falling back to defaults.', e);
    return createDefaultAppState();
  }
}

function saveAppState() {
  appState = normalizeAppState(appState);
  localStorage.setItem(STATE_KEY, JSON.stringify(appState));
}

function getPlanDates(plan = currentPlan) {
  return plan ? Object.keys(plan).sort() : [];
}

function getPlanTotalDays(plan = currentPlan) {
  return getPlanDates(plan).length;
}

function getEventsForDate(dateStr) {
  return (appState.events || []).filter(e => dateStr >= e.startDate && dateStr <= e.endDate);
}

function getEventsForWeek(weekDateStrs) {
  const visibleDates = weekDateStrs.filter(Boolean);
  if (visibleDates.length === 0) return [];

  const firstVisibleDate = visibleDates[0];
  const lastVisibleDate = visibleDates[visibleDates.length - 1];
  return (appState.events || [])
    .filter(evt => evt.startDate <= lastVisibleDate && evt.endDate >= firstVisibleDate)
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      if (a.endDate !== b.endDate) return b.endDate.localeCompare(a.endDate);
      return a.title.localeCompare(b.title);
    });
}

function buildCalendarWeekEventBars(weekDateStrs, weekGridRow) {
  const bars = [];
  const slotUsage = [];

  getEventsForWeek(weekDateStrs).forEach(evt => {
    const visibleCols = weekDateStrs
      .map((dateStr, col) => (dateStr && dateStr >= evt.startDate && dateStr <= evt.endDate ? col : null))
      .filter(col => col !== null);
    if (visibleCols.length === 0) return;

    const slotIndex = slotUsage.findIndex(usedCols => visibleCols.every(col => !usedCols[col]));
    const resolvedSlot = slotIndex === -1 ? slotUsage.length : slotIndex;
    if (!slotUsage[resolvedSlot]) {
      slotUsage[resolvedSlot] = Array(7).fill(false);
    }
    visibleCols.forEach(col => {
      slotUsage[resolvedSlot][col] = true;
    });

    const firstVisibleCol = visibleCols[0];
    const lastVisibleCol = visibleCols[visibleCols.length - 1];
    const bar = document.createElement('div');
    const colorClass = evt.color ? `color-${evt.color}` : 'color-gold';
    bar.className = `calendar-row-event ${colorClass}`;
    bar.textContent = evt.title;
    bar.title = evt.title;
    bar.style.gridColumn = `${firstVisibleCol + 1} / ${lastVisibleCol + 2}`;
    bar.style.gridRow = `${weekGridRow}`;
    bar.style.setProperty('--event-slot', resolvedSlot);

    if (weekDateStrs[firstVisibleCol] > evt.startDate) {
      bar.classList.add('continues-left');
    }
    if (weekDateStrs[lastVisibleCol] < evt.endDate) {
      bar.classList.add('continues-right');
    }
    bars.push(bar);
  });

  return bars;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 성경 약어 사전 (대시보드 일정 표시용)
const BIBLE_ABBR_MAP = {
  '창세기': '창', '출애굽기': '출', '레위기': '레', '민수기': '민', '신명기': '신',
  '여호수아': '수', '사사기': '삿', '룻기': '룻', '사무엘상': '삼상', '사무엘하': '삼하',
  '열왕기상': '왕상', '열왕기하': '왕하', '역대상': '대상', '역대하': '대하',
  '에스라': '스', '느헤미야': '느', '에스더': '에', '욥기': '욥', '시편': '시',
  '잠언': '잠', '전도서': '전', '아가': '아', '이사야': '사', '예레미야': '렘',
  '예레미야 애가': '애', '에스겔': '겔', '다니엘': '단', '호세아': '호', '요엘': '욜',
  '아모스': '암', '오바댜': '옵', '요나': '욘', '미가': '미', '나훔': '나',
  '하박국': '합', '스바냐': '습', '학개': '학', '스가랴': '슥', '말라기': '말',
  '마태복음': '마', '마가복음': '막', '누가복음': '눅', '요한복음': '요', '사도행전': '행',
  '로마서': '롬', '고린도전서': '고전', '고린도후서': '고후', '갈라디아서': '갈',
  '에베소서': '엡', '빌립보서': '빌', '골로새서': '골', '데살로니가전서': '살전',
  '데살로니가후서': '살후', '디모데전서': '딤전', '디모데후서': '딤후', '디도서': '딛',
  '빌레몬서': '몬', '히브리서': '히', '야고보서': '야', '베드로전서': '벧전',
  '베드로후서': '벧후', '요한1서': '요일', '요한2서': '요이', '요한3서': '요삼',
  '유다서': '유', '요한계시록': '계'
};

function abbreviateReading(str) {
  if (!str) return '';
  let result = str;
  for (const [fullName, abbr] of Object.entries(BIBLE_ABBR_MAP)) {
    result = result.replace(new RegExp(fullName, 'g'), abbr);
  }
  result = result.replace(/장\s*~\s*/g, '-');
  result = result.replace(/장/g, '');
  return result;
}

// 여러 성경 장이 섞여 있을 때 (특히 책이 바뀔 때) 자연스러운 한글 범위 표기 생성
function formatReadingRange(chapters, useShortStyle = false) {
  if (!chapters || chapters.length === 0) return '';
  
  const groups = [];
  let currentGroup = null;
  
  chapters.forEach(c => {
    if (!currentGroup || currentGroup.book !== c.book) {
      currentGroup = { book: c.book, chapters: [] };
      groups.push(currentGroup);
    }
    currentGroup.chapters.push(c.chapter);
  });
  
  const groupStrings = groups.map(g => {
    if (g.chapters.length === 1) {
      return useShortStyle ? `${g.book} ${g.chapters[0]}` : `${g.book} ${g.chapters[0]}장`;
    } else {
      const start = g.chapters[0];
      const end = g.chapters[g.chapters.length - 1];
      return useShortStyle ? `${g.book} ${start}-${end}` : `${g.book} ${start}장 ~ ${end}장`;
    }
  });
  
  return groupStrings.join(', ');
}

// 성경에 기록된 절기 (레위기 23장 절기 + 에스더 부림절 + 심하트 토라)
const BIBLICAL_HOLIDAYS_MAP = {
  'rosh hashana': '나팔절 (Rosh Hashana)',
  'yom kippur': '대속죄일 (Yom Kippur)',
  'sukkot': '초막절 (Sukkot)',
  'shmini atzeret': '쉐미니 아쩨렛 (Shmini Atzeret)',
  'simchat torah': '심하트 토라 (Simchat Torah)',
  'purim': '부림절 (Purim)',
  'pesach': '유월절 (Pesach)',
  'passover': '유월절 (Pesach)',
  'shavuot': '칠칠절 (Shavuot)'
};

const HOLIDAY_DATE_OVERRIDES = {
  '나팔절 (Rosh Hashana)': {
    '2026': '2026-09-12'
  }
};

function getBiblicalHolidayName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes('rosh chodesh') || lower.includes('shabbat')) return null;
  if (lower.includes('erev') && !lower.includes('erev purim')) return null;
  
  for (const [key, value] of Object.entries(BIBLICAL_HOLIDAYS_MAP)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  return null;
}

function normalizeHolidayDateForDisplay(name, dateStr) {
  const year = String(dateStr || '').slice(0, 4);
  return (HOLIDAY_DATE_OVERRIDES[name] && HOLIDAY_DATE_OVERRIDES[name][year]) || dateStr;
}

// 상세 파라샤 설명 매핑 및 더블 포션 처리 지원
function getParashaDetail(name) {
  if (!name) return null;
  const cleanName = name.replace(/^Parashat\s+|^Parashas\s+/i, '').trim();
  
  // 스펠링 예외 매핑
  const lookupName = cleanName === "Sh'lach" ? "Shelach" :
                     (cleanName === "V'Zot HaBerachah" || cleanName === "Vezot Haberakhah") ? "Vezot Haberakhah" :
                     cleanName;

  if (window.PARASHA_DETAILS && window.PARASHA_DETAILS[lookupName]) {
    return window.PARASHA_DETAILS[lookupName];
  }

  // 더블 포션인 경우 하이픈(-)으로 나누어 각각의 배경 설명을 합산
  if (lookupName.includes('-')) {
    const parts = lookupName.split('-');
    const details = [];
    for (const part of parts) {
      const pDetail = getParashaDetail(part.trim());
      if (pDetail) {
        details.push(`<div style="margin-bottom: 0.5rem;"><strong>${part.trim()}:</strong> ${pDetail}</div>`);
      }
    }
    return details.length > 0 ? details.join('') : null;
  }

  return null;
}

// 유틸: 오늘 날짜 YYYY-MM-DD
function getTodayStr() {
  if (appState && appState.overrideToday) {
    return appState.overrideToday;
  }
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

// 오늘 기준 현재 유대력 연도(hy)를 API로 구합니다.
async function getCurrentHebrewYear() {
  const todayStr = getTodayStr();
  const res = await fetch(`https://www.hebcal.com/converter?cfg=json&date=${todayStr}&g2h=1`);
  const data = await res.json();
  return data.hy.toString();
}

// 주어진 유대력 연도 기준, 창조의 첫째 주(Bereshit / 창세기 1주차)의 시작 일요일(Gregorian) 날짜를 찾습니다.
async function findBereshitSunday(hYear) {
  const gYear = Number(hYear) - 3761; // 예: 5786 -> 2025
  const items = await window.HebcalAPI.fetchHebcalYearData(gYear.toString());
  const bereshitItem = items.find(item => item.category === 'parashat' && item.title === 'Parashat Bereshit');
  if (bereshitItem) {
    const satParts = bereshitItem.date.split('-');
    const satDate = new Date(Date.UTC(parseInt(satParts[0]), parseInt(satParts[1])-1, parseInt(satParts[2])));
    const sunDate = new Date(satDate);
    sunDate.setUTCDate(satDate.getUTCDate() - 6); // 토요일에서 6일 전 = 일요일
    return sunDate.toISOString().split('T')[0];
  }
  return `${gYear}-10-12`; // fallback 기본값
}

// 유대력 첫날(플랜 시작일)로부터 경과 일수 구하기 - 타임존 영향 없음
function getPlanDayNumber(dateStr) {
  const dates = getPlanDates();
  const idx = dates.indexOf(dateStr);
  return idx !== -1 ? idx + 1 : 1;
}

// 1년 플랜 중 몇 주차(1~52)인지 계산 (타임존 영향 최소화된 UTC 기준 계산)
function getPlanWeekNumber(dateStr) {
  const dates = getPlanDates();
  if (dates.length === 0) return 1;
  const firstDate = dates[0];
  
  const p1 = firstDate.split('-');
  const dFirst = new Date(Date.UTC(parseInt(p1[0]), parseInt(p1[1])-1, parseInt(p1[2])));
  
  const p2 = dateStr.split('-');
  const dCurrent = new Date(Date.UTC(parseInt(p2[0]), parseInt(p2[1])-1, parseInt(p2[2])));
  
  const firstSunday = new Date(dFirst);
  firstSunday.setUTCDate(dFirst.getUTCDate() - dFirst.getUTCDay());
  
  const currentSunday = new Date(dCurrent);
  currentSunday.setUTCDate(dCurrent.getUTCDate() - dCurrent.getUTCDay());
  
  const diffMs = currentSunday - firstSunday;
  const diffWeeks = Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
  return diffWeeks + 1;
}

// 선택한 날짜가 포함된 주(일~토)의 7일간의 날짜 스트링 구하기 (타임존 영향 없는 UTC 기준 계산)
function getWeekDates(dateStr) {
  const p = dateStr.split('-');
  const d = new Date(Date.UTC(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])));
  const day = d.getUTCDay(); // 0: Sun, 6: Sat
  
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);
  
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const temp = new Date(sunday);
    temp.setUTCDate(sunday.getUTCDate() + i);
    const tempStr = temp.toISOString().split('T')[0];
    dates.push(tempStr);
  }
  return dates;
}

function formatDateWithWeekday(dateStr) {
  const p = dateStr.split('-');
  const d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  const days = ['일','월','화','수','목','금','토'];
  return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}(${days[d.getUTCDay()]})`;
}

// 하루치 일정이 전부 다 읽었는지 체크
function isDayCompleted(dayData, progressDay) {
  if (dayData.torah && !progressDay.torah) return false;
  if (dayData.megillah && !progressDay.megillah) return false;
  if (dayData.ot && dayData.ot.length > 0 && !progressDay.ot) return false;
  if (dayData.nt && dayData.nt.length > 0 && !progressDay.nt) return false;
  return true;
}

// 전체 통계 계산 (전체 체크항목 개수 기준 진율 + 완료 일수)
function calculateStats() {
  let totalReadings = 0;
  let completedReadings = 0;
  let completedDays = 0;
  let totalDays = 0;

  Object.keys(currentPlan).forEach(date => {
    const dayData = currentPlan[date];
    const progressDay = appState.progress[date] || {};
    
    let dayReadingsCount = 0;
    let dayCompletedCount = 0;

    if (dayData.torah) {
      totalReadings++;
      dayReadingsCount++;
      if (progressDay.torah) {
        completedReadings++;
        dayCompletedCount++;
      }
    }
    if (dayData.megillah) {
      totalReadings++;
      dayReadingsCount++;
      if (progressDay.megillah) {
        completedReadings++;
        dayCompletedCount++;
      }
    }
    if (dayData.ot && dayData.ot.length > 0) {
      totalReadings++;
      dayReadingsCount++;
      if (progressDay.ot) {
        completedReadings++;
        dayCompletedCount++;
      }
    }
    if (dayData.nt && dayData.nt.length > 0) {
      totalReadings++;
      dayReadingsCount++;
      if (progressDay.nt) {
        completedReadings++;
        dayCompletedCount++;
      }
    }

    if (dayReadingsCount > 0) {
      totalDays++;
      if (dayReadingsCount === dayCompletedCount) {
        completedDays++;
      }
    }
  });

  const percentage = totalReadings ? Math.round((completedReadings / totalReadings) * 100) : 0;
  return {
    percentage,
    completedDays,
    totalDays
  };
}

// 1. 초기화
async function initApp() {
  appState = loadAppState();
  saveAppState();

  // 테마 적용
  const savedMode = appState.theme || 'dark';
  document.body.classList.toggle('light-mode', savedMode === 'light');

  // 현재 유대력 연도 기준 플랜 생성 (Bereshit 시작주간 기준 연도 판정)
  let hYear = "5786";
  try {
    const calendarHYear = await getCurrentHebrewYear();
    let bereshitSunday = await findBereshitSunday(calendarHYear);
    
    // 5787 베레시트 특별 대응 (토요일 시작 적용)
    if (calendarHYear === "5787") {
      bereshitSunday = "2026-10-10";
    }
    
    const todayStr = getTodayStr();
    
    // 오늘 날짜가 해당 유대력 연도의 Bereshit 시작일 이전이면, 아직 이전 연도의 독서 주기입니다.
    if (todayStr < bereshitSunday) {
      hYear = (Number(calendarHYear) - 1).toString();
    } else {
      hYear = calendarHYear;
    }
    
    // 앱 개발 시작 연도인 5786년 미만으로 내려가지 않도록 가드 설정
    if (Number(hYear) < 5786) {
      hYear = "5786";
    }
  } catch (e) {
    console.error("Failed to get Hebrew year dynamically, fallback to 5786", e);
    hYear = "5786";
  }

  const planKey = PLAN_KEY_PREFIX + hYear;
  let plan = localStorage.getItem(planKey);

  if (!plan) {
    document.getElementById('generating-overlay').classList.remove('hidden');
    
    // 유대력 첫날(Bereshit 주간 일요일) 산출
    let startDateStr = "2025-10-12";
    try {
      startDateStr = await findBereshitSunday(hYear);
    } catch (e) {
      console.error("Failed to find Bereshit Sunday, using fallback", e);
    }
    
    // 5787 베레시트 시작일 특별 대응 (토요일 시작 적용)
    if (hYear === "5787") {
      startDateStr = "2026-10-10";
    }
    
    // 다음 유대력 연도의 Bereshit 주간 일요일 산출하여 총 일수 계산 (베레시트 주기에 맞춘 유연한 사이클 일수)
    const nextHYear = (Number(hYear) + 1).toString();
    let nextStartDateStr = "2026-10-04";
    try {
      nextStartDateStr = await findBereshitSunday(nextHYear);
    } catch (e) {
      console.error("Failed to find next Bereshit Sunday", e);
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + 365);
      nextStartDateStr = d.toISOString().split('T')[0];
    }
    
    // 5786 -> 5787 베레시트 전환일 특별 대응 (토요일 시작 적용)
    if (hYear === "5786") {
      nextStartDateStr = "2026-10-10";
    }
    
    const dStart = new Date(startDateStr);
    const dNextStart = new Date(nextStartDateStr);
    const totalDays = Math.round((dNextStart - dStart) / (1000 * 60 * 60 * 24));
    console.log(`Plan for ${hYear}: ${startDateStr} ~ ${nextStartDateStr} (${totalDays} days)`);
    
    // 유대력 사이클에 걸쳐있는 양력 연도 2년분 Hebcal 데이터 획득
    const startGYear = dStart.getFullYear();
    const endGYear = startGYear + 1;
    
    const items1 = await window.HebcalAPI.fetchHebcalYearData(startGYear.toString());
    const items2 = await window.HebcalAPI.fetchHebcalYearData(endGYear.toString());
    const hebcalItems = [...items1, ...items2];
    
    const newPlan = window.Generator.generateHebrewYearPlan(hebcalItems, startDateStr, totalDays);
    localStorage.setItem(planKey, JSON.stringify(newPlan));
    plan = newPlan;
    document.getElementById('generating-overlay').classList.add('hidden');
  } else {
    plan = JSON.parse(plan);
  }
  
  currentPlan = plan;

  // 오늘 날짜가 플랜 범위 내에 있으면 오늘을 선택, 없으면 플랜 첫날 선택
  const todayStr = getTodayStr();
  if (currentPlan[todayStr]) {
    activeDateStr = todayStr;
  } else {
    activeDateStr = getPlanDates()[0];
  }

  // Tab Setup
  setupTabs();
  setupModalEventActions();
  setupParashaModalActions();

  // 화면 렌더링 (이전 활성화된 탭 복원)
  const tabToActivate = appState.activeTab || 'dashboard';
  const tabBtn = document.querySelector(`.tab-item[data-tab="${tabToActivate}"]`);
  if (tabBtn) {
    tabBtn.click();
  } else {
    await renderDashboard();
  }
  restoreBibleReaderAfterReturn();
  
  // 실시간 자정 타이머 개시
  setupMidnightTimer();
}

// 실시간 날짜 변경 감지 및 자동 갱신
let lastCheckedDateStr = getTodayStr();
let midnightTimer = null;

function checkDateTransition() {
  const currentTodayStr = getTodayStr();
  if (currentTodayStr !== lastCheckedDateStr) {
    console.log("Real-time date transition detected. Refreshing app date from " + lastCheckedDateStr + " to " + currentTodayStr);
    lastCheckedDateStr = currentTodayStr;
    
    if (!appState || !appState.overrideToday) {
      activeDateStr = currentTodayStr;
    }
    
    renderDashboard();
    setupMidnightTimer();
  }
}

function setupMidnightTimer() {
  if (midnightTimer) clearTimeout(midnightTimer);
  
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  const msToMidnight = tomorrow - now;
  
  midnightTimer = setTimeout(() => {
    checkDateTransition();
  }, msToMidnight);
}

// 화면이 포커스를 얻거나 백그라운드에서 복귀할 때 날짜 변경 감지
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkDateTransition();
  }
});
window.addEventListener('focus', () => {
  checkDateTransition();
});

// 탭 전환 핸들러 설정
function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      const pane = document.getElementById(`tab-content-${targetTab}`);
      if (pane) {
        pane.classList.add('active');
      }
      
      // 활성 탭 상태 저장
      appState.activeTab = targetTab;
      saveAppState();
      
      if (targetTab === 'dashboard' || targetTab === 'reading' || targetTab === 'weekly') {
        renderDashboard();
      } else if (targetTab === 'annual') {
        renderAnnualView();
      } else if (targetTab === 'settings') {
        renderSettingsView();
      }
    });
  });

  // 캘린더 월 이동 버튼 리스너
  document.getElementById('btn-cal-prev').addEventListener('click', () => {
    if (calendarCurrentDate) {
      calendarCurrentDate.setUTCMonth(calendarCurrentDate.getUTCMonth() - 1);
      renderCalendar();
    }
  });

  document.getElementById('btn-cal-next').addEventListener('click', () => {
    if (calendarCurrentDate) {
      calendarCurrentDate.setUTCMonth(calendarCurrentDate.getUTCMonth() + 1);
      renderCalendar();
    }
  });

  // 설정 저장 버튼
  document.getElementById('btn-save-family-name').addEventListener('click', () => {
    const val = document.getElementById('input-family-name').value.trim();
    appState.familyName = val || DEFAULT_FAMILY_NAME;
    saveAppState();
    alert('성경읽기표 이름이 저장되었습니다.');
    renderDashboard();
  });

  // 테마 설정 변경 리스너
  document.querySelectorAll('input[name="theme-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      appState.theme = mode;
      saveAppState();
      document.body.classList.toggle('light-mode', mode === 'light');
    });
  });

  // 데이터 초기화 버튼
  document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('모든 통독 진행 상황을 초기화하고 새로 시작하겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      appState.progress = {};
      saveAppState();
      alert('초기화되었습니다.');
      renderDashboard();
    }
  });

  // 날짜 설정 버튼 리스너
  document.getElementById('btn-save-override-date').addEventListener('click', () => {
    const val = document.getElementById('input-override-date').value;
    if (val) {
      appState.overrideToday = val;
      activeDateStr = val; // 대시보드 활성 날짜도 변경
      calendarCurrentDate = null; // 달력 월 초기화
      saveAppState();
      alert(`오늘 날짜가 ${val}로 지정되었습니다.`);
      renderDashboard();
    }
  });

  document.getElementById('btn-reset-override-date').addEventListener('click', () => {
    appState.overrideToday = null;
    calendarCurrentDate = null; // 달력 월 초기화
    
    // 실제 오늘 날짜 구하기
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const realToday = d.toISOString().split('T')[0];
    
    activeDateStr = realToday;
    saveAppState();
    
    document.getElementById('input-override-date').value = realToday;
    alert(`실제 오늘 날짜(${realToday})로 리셋되었습니다.`);
    renderDashboard();
  });

  // Ticker 일괄 완료 체크 버튼
  document.getElementById('btn-ticker-check').addEventListener('click', () => {
    const todayStr = getTodayStr();
    const todayData = currentPlan[todayStr];
    if (!todayData) return;
    const progressDay = appState.progress[todayStr] || {};
    const isCompleted = isDayCompleted(todayData, progressDay);
    toggleDayCompletion(todayStr, !isCompleted);
  });

  // 파라샤 의미 아코디언 토글 (대시보드 내)
  document.getElementById('btn-toggle-meaning-new').addEventListener('click', (e) => {
    const box = document.getElementById('parasha-meaning-box-new');
    const btn = e.currentTarget;
    if (box.style.display === 'none') {
      box.style.display = 'block';
      btn.textContent = '▲';
    } else {
      box.style.display = 'none';
      btn.textContent = '▼';
    }
  });

  // 본문 읽기 창 닫기 버튼 리스너
  document.getElementById('btn-close-reader').addEventListener('click', () => {
    document.getElementById('bible-reader-modal').classList.add('hidden');
  });

  // 본문 읽기 창 바깥 클릭 시 닫기
  document.getElementById('bible-reader-modal').addEventListener('click', (e) => {
    if (e.target.id === 'bible-reader-modal') {
      document.getElementById('bible-reader-modal').classList.add('hidden');
    }
  });
}

// 특정 일자의 모든 통독 항목 일괄 토글
function toggleDayCompletion(dateStr, markComplete) {
  const dayData = currentPlan[dateStr];
  if (!dayData) return;
  
  if (!appState.progress[dateStr]) appState.progress[dateStr] = {};
  
  if (markComplete) {
    if (dayData.torah) appState.progress[dateStr].torah = true;
    if (dayData.megillah) appState.progress[dateStr].megillah = true;
    if (dayData.ot && dayData.ot.length > 0) appState.progress[dateStr].ot = true;
    if (dayData.nt && dayData.nt.length > 0) appState.progress[dateStr].nt = true;
  } else {
    if (dayData.torah) appState.progress[dateStr].torah = false;
    if (dayData.megillah) appState.progress[dateStr].megillah = false;
    if (dayData.ot && dayData.ot.length > 0) appState.progress[dateStr].ot = false;
    if (dayData.nt && dayData.nt.length > 0) appState.progress[dateStr].nt = false;
  }
  
  saveAppState();
  renderDashboard();
}

// 2. 대시보드 (오늘 읽기) 렌더링
async function renderDashboard() {
  const todayStr = getTodayStr();
  
  if (!activeDateStr || !currentPlan[activeDateStr]) {
    activeDateStr = todayStr;
  }
  
  const todayData = currentPlan[activeDateStr];
  const gParts = activeDateStr.split('-');
  const gDate = new Date(Date.UTC(parseInt(gParts[0]), parseInt(gParts[1])-1, parseInt(gParts[2])));
  const days = ['일','월','화','수','목','금','토'];
  const dayStr = days[gDate.getUTCDay()];
  const dayOfYear = getPlanDayNumber(activeDateStr); // 유대력 첫날 기준 카운팅

  // 1. 헤더 유저 정보
  document.getElementById('family-title-text').textContent = appState.familyName || DEFAULT_FAMILY_NAME;

  // 2. Stat Box 데이터 계산
  const todayPlan = currentPlan[todayStr];
  const nowDayOfYear = todayPlan ? getPlanDayNumber(todayStr) : getPlanDayNumber(activeDateStr);
  
  // 오늘 날짜 뱃지 (UTC 기준으로 파싱하여 표시)
  let todayDisplayDate = gDate;
  if (todayPlan) {
    const tParts = todayStr.split('-');
    todayDisplayDate = new Date(Date.UTC(parseInt(tParts[0]), parseInt(tParts[1])-1, parseInt(tParts[2])));
  }
  document.getElementById('stat-today-val').textContent = `${nowDayOfYear}일차`;

  const stats = calculateStats();
  document.getElementById('stat-progress-val').textContent = `${stats.percentage}%`;
  document.getElementById('stat-completed-val').textContent = `${stats.completedDays} / ${stats.totalDays || getPlanTotalDays()}`;

  // 3. 유대력 및 절기 정보 헤더 영역 동적 로드
  const hebDateObj = await window.HebcalAPI.convertToHebrewDate(todayStr);
  const tParts = todayStr.split('-');
  const gYr = parseInt(tParts[0], 10);
  const gMon = parseInt(tParts[1], 10);
  const gDay = parseInt(tParts[2], 10);
  const gregorianKOR = `${gYr}년 ${gMon}월 ${gDay}일`;

  let bannerText = `${gregorianKOR}`;
  if (hebDateObj && hebDateObj.hm) {
    bannerText += ` | ${hebDateObj.hd} ${hebDateObj.hm} ${hebDateObj.hy} / ${hebDateObj.hebrew}`;
  }
  if (todayPlan && todayPlan.holidays && todayPlan.holidays.length > 0) {
    let biblicalHol = null;
    for (const h of todayPlan.holidays) {
      const name = getBiblicalHolidayName(h.name);
      if (name) {
        biblicalHol = name;
        break;
      }
    }
    if (biblicalHol) {
      bannerText += ` | ✨ ${biblicalHol}`;
    }
  }
  document.getElementById('header-hebcal-banner').textContent = bannerText;

  // 4. Ticker Bar 정보 (오늘 기준)
  if (todayPlan) {
    const rawPName = todayPlan.parasha || "Special Week";
    const pName = rawPName.replace(/^Parashat\s+|^Parashas\s+/i, '');
    const meta = window.getParashaMeta(pName);
    const weekNum = getPlanWeekNumber(todayStr);
    const torahTranslated = window.BIBLE_DATA.translateTorahReading(todayPlan.torah);
    const megillahText = todayPlan.megillah ? ` | ${todayPlan.megillah}` : '';
    let otText = '';
    if (todayPlan.ot && todayPlan.ot.length > 0) {
      otText = ` | 구약: ${formatReadingRange(todayPlan.ot)}`;
    }
    let ntText = '';
    if (todayPlan.nt && todayPlan.nt.length > 0) {
      ntText = ` | 신약: ${formatReadingRange(todayPlan.nt)}`;
    }
    const pTitle = pName === "Special Week" 
      ? `절기 주간`
      : pName.includes("샬롬")
      ? `${weekNum}주차 샬롬 (Shalom)`
      : `${weekNum}주차 ${pName} (${meta.ko})`;
    const pBody = `${torahTranslated || '일정 없음'}${megillahText}${otText}${ntText}`;

    document.getElementById('ticker-reading-text').innerHTML = 
      `<div class="ticker-title-sub">${pTitle}</div>` +
      `<div class="ticker-body-sub">${pBody}</div>`;
  }

  // 5. 왼쪽 카드: 금주의 파라샤 정보
  if (todayPlan) {
    const rawPName = todayPlan.parasha || "Special Week";
    const pName = rawPName.replace(/^Parashat\s+|^Parashas\s+/i, '');
    const meta = window.getParashaMeta(pName);
    const weekNum = getPlanWeekNumber(todayStr);

    const torahTranslated = window.BIBLE_DATA.translateTorahReading(todayPlan.torah);
    let bookName = '토라';
    if (torahTranslated) {
      const match = torahTranslated.match(/^([가-힣a-zA-Z0-9\s]+?)\s+\d+/);
      if (match) {
        bookName = match[1].trim();
      }
    }
    const TORAH_BOOK_HEB_MAP = {
      '창세기': '베레시트',
      '출애굽기': '쉐모트',
      '레위기': '바이크라',
      '민수기': '바미드바르',
      '신명기': '데바림'
    };
    const bookHeb = TORAH_BOOK_HEB_MAP[bookName] || '토라';
    
    document.getElementById('parasha-badge-text').textContent = 
      pName === "Special Week" ? "절기 주간" : 
      pName.includes("샬롬") ? `${weekNum}주차 ㆍ 샬롬 (Shalom)` :
      `${weekNum}주차 ㆍ ${bookName} (${bookHeb})`;
    document.getElementById('parasha-title-text').textContent = pName;
    document.getElementById('parasha-meaning-text-dashboard').textContent = pName === "Special Week" ? "절기 특별 본문" : meta.meaning;
    
    // 상세 문화/성경 설명 바인딩
    const detailBox = document.getElementById('parasha-meaning-box-new');
    let detailHtml = '';

    detailHtml += `<div style="margin-bottom: 0.75rem;">
      <strong style="color: var(--gold);">히브리어: </strong>
      <span style="font-size: 1.1rem; font-family: 'Noto Sans KR', sans-serif; font-weight: 500;">${meta.he || '-'}</span>
    </div>`;

    const pDetail = getParashaDetail(pName);
    if (pDetail) {
      detailHtml += `<div style="margin-bottom: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem;">
        <strong style="color: var(--gold); display: block; margin-bottom: 0.25rem;">📖 파라샤 배경과 의미</strong>
        <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text-muted); margin: 0; word-break: keep-all;">${pDetail}</div>
      </div>`;
    }

    let activeBiblicalHoliday = null;
    if (todayPlan.holidays && todayPlan.holidays.length > 0) {
      for (const h of todayPlan.holidays) {
        if (getBiblicalHolidayName(h.name)) {
          activeBiblicalHoliday = h.name;
          break;
        }
      }
    }

    if (activeBiblicalHoliday) {
      const lower = activeBiblicalHoliday.toLowerCase();
      let holidayKey = null;
      if (lower.includes('pesach') || lower.includes('passover')) holidayKey = 'Pesach';
      else if (lower.includes('shavuot')) holidayKey = 'Shavuot';
      else if (lower.includes('rosh hashana')) holidayKey = 'Rosh Hashana';
      else if (lower.includes('yom kippur')) holidayKey = 'Yom Kippur';
      else if (lower.includes('sukkot')) holidayKey = 'Sukkot';
      else if (lower.includes('shmini atzeret')) holidayKey = 'Shmini Atzeret';
      else if (lower.includes('simchat torah')) holidayKey = 'Simchat Torah';
      else if (lower.includes('purim')) holidayKey = 'Purim';

      const BIBLICAL_HOLIDAYS_DETAIL = {
        'Pesach': {
          name: '유월절 (Pesach / Passover)',
          desc: '<strong>성경적 배경:</strong> 애굽의 종살이에서 이스라엘을 구원하기 위해 열 번째 재앙(장자의 죽음)을 내리실 때, 어린 양의 피를 문설주에 바른 집은 죽음의 재앙이 "넘어갔던(Passover)" 것에서 유래합니다(출 12장).<br><br><strong>문화와 의미:</strong> 누룩 없는 빵인 무교병을 먹으며 고난을 기억하고 자유의 기쁨을 선포합니다. 신약 성경에서는 예수 그리스도를 세상 죄를 지고 가는 유월절 어린 양의 실체로 해석합니다(고전 5:7).'
        },
        'Shavuot': {
          name: '칠칠절 / 오순절 (Shavuot / Pentecost)',
          desc: '<strong>성경적 배경:</strong> 유월절 다음 날부터 7주를 센 후(49일) 50일째 되는 날에 드리는 절기입니다(레 23:15-21). 시내산에서 모세가 토라(율법)를 받은 날로 전통적으로 기억됩니다.<br><br><strong>문화와 의미:</strong> 첫 열매를 바치는 수확의 기쁨과 토라의 계시를 축하합니다. 신약 시대에는 바로 이 날에 사도들에게 성령이 임하여(행 2장) 신약 교회의 탄생을 알리는 성령 강림의 날로 완성되었습니다.'
        },
        'Rosh Hashana': {
          name: '나팔절 (Rosh Hashana / Yom Teruah)',
          desc: '<strong>성경적 배경:</strong> 유대 종교력 7월 1일에 숫양의 뿔나팔(쇼파르)을 크게 불어 회중을 소집하는 날입니다(레 23:23-25).<br><br><strong>문화와 의미:</strong> 창조주 하나님의 왕권을 선포하고 한 해 동안 지은 죄를 돌아보는 회개의 10일을 시작하는 신호입니다. 영적으로는 마지막 날 주님의 재림과 심판, 그리고 성도의 부활을 알리는 나팔 소리를 예표합니다.'
        },
        'Yom Kippur': {
          name: '대속죄일 (Yom Kippur / Day of Atonement)',
          desc: '<strong>성경적 배경:</strong> 일 년 중 단 하루, 대제사장이 이스라엘 온 회중의 죄를 속하기 위해 지성소에 들어가는 날입니다(레 16장, 23:26-32).<br><br><strong>문화와 의미:</strong> 하루 동안 금식하며 스스로를 괴롭게 하여 온전한 회개와 죄 사함을 간구합니다. 히브리서에서는 단번에 자기 피로 하늘의 참 지성소에 들어가 영원한 속죄를 이루신 예수 그리스도의 구속 사역으로 설명합니다.'
        },
        'Sukkot': {
          name: '초막절 / 장막절 (Sukkot / Tabernacles)',
          desc: '<strong>성경적 배경:</strong> 출애굽 후 40년간 광야 생활을 하는 동안 하나님께서 이스라엘을 초막 속에서 보호하시고 인도하셨음을 기억하며 지키는 가을 절기입니다(레 23:33-43).<br><br><strong>문화와 의미:</strong> 나뭇가지로 야외에 초막을 지어 거주하며 수확물(수장절)을 주신 하나님께 감사하고, 장차 하나님의 장막이 이 땅에 임하여 만국이 주님과 함께 영원히 거하게 될 메시아 왕국의 완성(계 21:3)을 상징합니다.'
        },
        'Shmini Atzeret': {
          name: '쉐미니 아쩨렛 (Shmini Atzeret)',
          desc: '<strong>성경적 배경:</strong> 초막절 7일 축제가 끝난 바로 다음 날인 8일째에 따로 모이는 거룩한 성회입니다(레 23:36).<br><br><strong>문화와 의미:</strong> 랍비들은 7일간의 초막절이 온 인류를 위한 축제라면, 8일째의 쉐미니 아쩨렛은 하나님께서 이스라엘 자녀들만 따로 조용히 머무르도록 독대하시는 친밀한 시간이라고 설명합니다.'
        },
        'Simchat Torah': {
          name: '심하트 토라 (Simchat Torah)',
          desc: '<strong>성경적 배경:</strong> 모세오경(토라)의 마지막 신명기 구절을 완독하고, 즉시 다시 창세기 1장 1절을 읽어 새 주기를 시작하는 절기입니다.<br><br><strong>문화와 의미:</strong> 회당에서 모든 토라 두루마리를 꺼내 들고 원을 그리며 춤을 추고(하카포트), 말씀 주신 하나님을 향한 무한한 감사와 기쁨을 선포하며 메시아 그리스도의 영접을 노래합니다.'
        },
        'Purim': {
          name: '부림절 (Purim)',
          desc: '<strong>성경적 배경:</strong> 페르시아 제국 시절, 유대 민족을 말살하려던 악한 하만의 음모에 맞서 에스더 왕비의 믿음의 결단과 모르드개의 지혜로 인해 구원을 얻은 날을 기념합니다(에스더 9장).<br><br><strong>문화와 의미:</strong> 하만이 제비(부르)를 던졌던 것에서 이름이 유래했습니다. 에스더서를 낭독하며 하만의 이름이 나올 때마다 소리를 지르고, 가난한 자들을 구제하며 기쁨을 나눕니다.'
        }
      };

      const holDetail = BIBLICAL_HOLIDAYS_DETAIL[holidayKey];
      if (holDetail) {
        detailHtml += `<div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem;">
          <strong style="color: var(--gold); display: block; margin-bottom: 0.25rem;">✨ 절기 배경: ${holDetail.name}</strong>
          <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-muted); margin: 0; word-break: keep-all;">${holDetail.desc}</p>
        </div>`;
      }
    }

    detailBox.innerHTML = detailHtml;
  }

  // 6. 왼쪽 카드: 오늘의 통독 목록
  const realTodayDayOfYear = getPlanDayNumber(todayStr);
  document.getElementById('checklist-date-title').textContent = `오늘의 통독 (${realTodayDayOfYear}일차)`;

  const checklistContainer = document.getElementById('reading-checklist-container');
  checklistContainer.innerHTML = '';

  if (todayPlan) {
    const progressToday = appState.progress[todayStr] || {};
    
    if (todayPlan.torah) {
      const title = window.BIBLE_DATA.translateTorahReading(todayPlan.torah);
      checklistContainer.appendChild(createChecklistItem('torah', '토라포션', title, progressToday.torah, todayStr));
    }
    if (todayPlan.megillah) {
      checklistContainer.appendChild(createChecklistItem('megillah', '메길롯', todayPlan.megillah, progressToday.megillah, todayStr));
    }
    if (todayPlan.ot && todayPlan.ot.length > 0) {
      const title = formatReadingRange(todayPlan.ot);
      checklistContainer.appendChild(createChecklistItem('ot', '구약 성경', title, progressToday.ot, todayStr, todayPlan.ot));
    }
    if (todayPlan.nt && todayPlan.nt.length > 0) {
      const title = formatReadingRange(todayPlan.nt);
      checklistContainer.appendChild(createChecklistItem('nt', '신약 성경', title, progressToday.nt, todayStr, todayPlan.nt));
    }
  }

  // 7. 오른쪽 카드: 이번 주 (7일) 일정
  const scheduleContainer = document.getElementById('weekly-schedule-container');
  scheduleContainer.innerHTML = '';
  const weekDates = getWeekDates(activeDateStr);

  weekDates.forEach(dateStr => {
    const dayData = currentPlan[dateStr];
    if (!dayData) return;

    const dParts = dateStr.split('-');
    const d = new Date(Date.UTC(parseInt(dParts[0]), parseInt(dParts[1])-1, parseInt(dParts[2])));
    const dayName = days[d.getUTCDay()];
    const dOfYear = getPlanDayNumber(dateStr);

    const isToday = dateStr === todayStr;
    const isActive = dateStr === activeDateStr;
    
    const progressDay = appState.progress[dateStr] || {};
    const isCompleted = isDayCompleted(dayData, progressDay);

    const readings = [];
    if (dayData.torah) {
      readings.push(`<span class="sched-tag torah">${abbreviateReading(window.BIBLE_DATA.translateTorahReading(dayData.torah))}</span>`);
    }
    if (dayData.megillah) {
      readings.push(`<span class="sched-tag megillah">${abbreviateReading(dayData.megillah)}</span>`);
    }
    if (dayData.ot && dayData.ot.length > 0) {
      const title = formatReadingRange(dayData.ot);
      readings.push(`<span class="sched-tag ot">${abbreviateReading(title)}</span>`);
    }
    if (dayData.nt && dayData.nt.length > 0) {
      const title = formatReadingRange(dayData.nt);
      readings.push(`<span class="sched-tag nt">${abbreviateReading(title)}</span>`);
    }

    const row = document.createElement('div');
    row.className = `schedule-day-row ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
    row.innerHTML = `
      <div class="sched-chk-box"></div>
      <div class="sched-info">
        <div class="sched-day-title">
          <span>${dOfYear}일차 - ${d.getUTCMonth()+1}/${d.getUTCDate()}(${dayName})</span>
          ${isToday ? '<span class="sched-day-badge">오늘</span>' : ''}
        </div>
        <div class="sched-day-readings">
          ${readings.join(' ')}
        </div>
      </div>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('sched-chk-box')) {
        e.stopPropagation();
        toggleDayCompletion(dateStr, !isCompleted);
      } else {
        activeDateStr = dateStr;
        renderDashboard();
      }
    });

    scheduleContainer.appendChild(row);
  });

  // 캘린더 및 다가오는 절기 업데이트
  renderCalendar();
  renderUpcomingHolidays();
  renderSelectedDateEvents();
}

function createChecklistItem(type, label, title, isDone, dateStr, passageData) {
  const div = document.createElement('div');
  div.className = `reading-item ${isDone ? 'done' : ''}`;
  div.innerHTML = `
    <div class="chk-box"></div>
    <div class="rd-info">
      <div class="rd-type type-${type}">${label}</div>
      <div class="rd-title">${title}</div>
    </div>
    <button class="btn-read-passage" title="본문 읽기">
      📖 본문 읽기
    </button>
  `;
  
  // 체크박스 클릭 시 통독 완료 토글
  div.querySelector('.chk-box').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!appState.progress[dateStr]) appState.progress[dateStr] = {};
    appState.progress[dateStr][type] = !appState.progress[dateStr][type];
    saveAppState();
    renderDashboard();
  });
  
  // 본문 읽기 버튼 클릭 시 getBible API 본문 읽기 열기
  div.querySelector('.btn-read-passage').addEventListener('click', (e) => {
    e.stopPropagation();
    openBibleReader(title, passageData);
  });
  
  return div;
}

// 랜딩 페이지 -> 진입
document.getElementById('btn-enter').addEventListener('click', () => {
  document.getElementById('landing-page').classList.remove('active');
  document.getElementById('dashboard-page').classList.add('active');
  
  // 기기 진입 여부 및 활성 탭 상태 기록
  appState = loadAppState();
  appState.hasEntered = true;
  appState.activeTab = 'dashboard';
  saveAppState();
  
  initApp();
});

// 3. 연간 뷰 렌더링 (주별 보기 탭) - 연간 주차(1~53주차)별 정렬
function renderAnnualView() {
  const container = document.getElementById('annual-container');
  container.innerHTML = '';
  
  const dates = getPlanDates();
  
  // 주차별로 날짜 그룹핑 (1~53주차)
  const groups = {}; // { weekNum: [dateStr, ...] }
  dates.forEach(dateStr => {
    const weekNum = getPlanWeekNumber(dateStr);
    if (!groups[weekNum]) {
      groups[weekNum] = [];
    }
    groups[weekNum].push(dateStr);
  });

  // 주차 오름차순 정렬
  const sortedWeeks = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
  
  const daysOfWeekKOR = ['일','월','화','수','목','금','토'];
  let html = '';

  sortedWeeks.forEach(weekNum => {
    const groupDates = groups[weekNum].sort();
    
    // 이 주간의 파라샤 및 절기 정보 수집
    let weekParasha = null;
    const holidaysInWeek = [];

    groupDates.forEach(dateStr => {
      const data = currentPlan[dateStr];
      if (data.parasha && !weekParasha) {
        weekParasha = data.parasha;
      }
      if (data.holidays && data.holidays.length > 0) {
        data.holidays.forEach(h => {
          const rawName = h.name.replace(/^Holiday:\s*/i, '');
          const normName = getBiblicalHolidayName(rawName);
          if (normName && !holidaysInWeek.includes(normName)) {
            holidaysInWeek.push(normName);
          }
        });
      }
    });

    let displayTitle = '';
    let meaningText = '';
    
    if (weekParasha) {
      const meta = window.getParashaMeta(weekParasha);
      displayTitle = weekParasha.includes("샬롬")
        ? `${weekNum}주차: 샬롬 (Shalom)`
        : `${weekNum}주차: ${weekParasha} (${meta.ko})`;
      if (holidaysInWeek.length > 0) {
        displayTitle += ` [절기: ${holidaysInWeek.join(', ')}]`;
      }
      meaningText = `<div class="annual-week-meaning">의미: ${meta.meaning}</div>`;
    } else {
      displayTitle = `${weekNum}주차: 절기 주간 / Special Week`;
      if (holidaysInWeek.length > 0) {
        displayTitle = `${weekNum}주차: 절기 주간 (${holidaysInWeek.join(', ')})`;
      }
      meaningText = `<div class="annual-week-meaning">의미: 유대력 절기 특별 주간</div>`;
    }

    html += `
      <div class="annual-week-card">
        <div class="annual-week-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div>
            <div class="annual-week-title">${displayTitle}</div>
            ${meaningText}
          </div>
          <div class="annual-week-icon">▼</div>
        </div>
        <div class="annual-week-body">
    `;

    groupDates.forEach(dateStr => {
      const data = currentPlan[dateStr];
      const dParts = dateStr.split('-');
      const d = new Date(Date.UTC(parseInt(dParts[0]), parseInt(dParts[1])-1, parseInt(dParts[2])));
      const dayName = daysOfWeekKOR[d.getUTCDay()];
      const prog = appState.progress[dateStr] || {};
      
      html += `<div class="annual-day-row">
                 <div class="annual-day-date">${dateStr} (${dayName})</div>
                 <div class="annual-day-content">`;
      
      if (data.torah) {
        const torahTitle = window.BIBLE_DATA.translateTorahReading(data.torah);
        html += `<div class="rd-tag type-torah ${prog.torah?'done':''}">${torahTitle}</div>`;
      }
      if (data.megillah) {
        html += `<div class="rd-tag type-megillah ${prog.megillah?'done':''}">${data.megillah}</div>`;
      }
      if (data.ot && data.ot.length > 0) {
        const title = formatReadingRange(data.ot, true);
        html += `<div class="rd-tag type-ot ${prog.ot?'done':''}">${title}</div>`;
      }
      if (data.nt && data.nt.length > 0) {
        const title = formatReadingRange(data.nt, true);
        html += `<div class="rd-tag type-nt ${prog.nt?'done':''}">${title}</div>`;
      }
      
      html += `</div></div>`;
    });

    html += `</div></div>`;
  });
  
  container.innerHTML = html;
}

// 6. 설정 탭 렌더링
function renderSettingsView() {
  document.getElementById('input-family-name').value = appState.familyName || DEFAULT_FAMILY_NAME;
  // 라디오 상태 업데이트
  const savedMode = appState.theme || 'dark';
  const radio = document.querySelector(`input[name="theme-mode"][value="${savedMode}"]`);
  if (radio) {
    radio.checked = true;
  }
  // 기준일 인풋값 로드
  const todayVal = appState.overrideToday || getTodayStr();
  document.getElementById('input-override-date').value = todayVal;
}

// 브라우저 내장 Intl API를 이용한 유대력 날짜 변환 (캘린더 셀 렌더링용)
function getHebrewDateNatively(dateStr) {
  try {
    const parts = dateStr.split('-');
    const dateObj = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    
    // 일자 숫자
    const dayFormatter = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', timeZone: 'UTC' });
    const dayVal = dayFormatter.format(dateObj);
    
    // 월 영어 표기
    const monthFormatter = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'short', timeZone: 'UTC' });
    const monthVal = monthFormatter.format(dateObj);
    
    // 히브리어 표기
    const hebFormatter = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
    const hebVal = hebFormatter.format(dateObj);
    
    return {
      hd: dayVal,
      hm: monthVal,
      hebrew: hebVal
    };
  } catch (e) {
    console.error("Intl Hebrew translation failed, fallback", e);
    return { hd: '', hm: '', hebrew: '' };
  }
}

let calendarCurrentDate = null; // 캘린더에서 보고 있는 현재 월 기준일

// 대시보드 캘린더 렌더링
function renderCalendar() {
  if (!calendarCurrentDate) {
    const p = activeDateStr.split('-');
    calendarCurrentDate = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1));
  }
  
  const year = calendarCurrentDate.getUTCFullYear();
  const month = calendarCurrentDate.getUTCMonth();
  
  document.getElementById('calendar-month-title').textContent = `${year}년 ${month + 1}월`;
  
  const gridCells = document.getElementById('calendar-grid-cells');
  gridCells.innerHTML = '';
  
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startDayOfWeek = firstDay.getUTCDay();
  const numDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  
  const todayStr = getTodayStr();
  let d = 1;
  let weekGridRow = 1;
  
  // 8열 그리드 구현을 위해 주별로 루프를 돕니다. (일~토 + 토라포션)
  while (d <= numDays) {
    let weekParasha = null;
    let weekParashaFull = null;
    const weekCells = [];
    const weekDateStrs = [];
    
    // 일(0)부터 토(6)까지 7일 분량의 셀 생성
    for (let col = 0; col < 7; col++) {
      if (d === 1 && col < startDayOfWeek) {
        // 첫 주의 시작일 이전 공백 셀
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        emptyCell.style.gridColumn = String(col + 1);
        emptyCell.style.gridRow = String(weekGridRow);
        weekCells.push(emptyCell);
        weekDateStrs.push(null);
      } else if (d > numDays) {
        // 마지막 주의 종료일 이후 공백 셀
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        emptyCell.style.gridColumn = String(col + 1);
        emptyCell.style.gridRow = String(weekGridRow);
        weekCells.push(emptyCell);
        weekDateStrs.push(null);
      } else {
        // 정상 날짜 셀 생성
        const dayStr = String(d).padStart(2, '0');
        const monthStr = String(month + 1).padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}`;
        weekDateStrs.push(dateStr);
        
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = String(weekGridRow);
        
        const dayPlan = currentPlan[dateStr];
        let isCompleted = false;
        let holidayName = '';
        
        if (dayPlan) {
          const progressDay = appState.progress[dateStr] || {};
          isCompleted = isDayCompleted(dayPlan, progressDay);
          
          if (dayPlan.holidays && dayPlan.holidays.length > 0) {
            for (const h of dayPlan.holidays) {
              const name = getBiblicalHolidayName(h.name);
              if (name) {
                const match = name.match(/^([가-힣a-zA-Z0-9\s]+?)\s*\(/);
                holidayName = match ? match[1].trim() : name;
                break;
              }
            }
          }
          
          // 해당 주간의 파라샤 명칭 수집
          if (dayPlan.parasha) {
            weekParashaFull = dayPlan.parasha;
            weekParasha = dayPlan.parasha.replace(/^Parashat\s+|^Parashas\s+/i, '').trim();
          }
        }
        
        if (isCompleted) cell.classList.add('completed');
        if (dateStr === todayStr) cell.classList.add('today-highlight');
        if (dateStr === activeDateStr) cell.classList.add('active-highlight');
        
        const hebDate = getHebrewDateNatively(dateStr);
        cell.dataset.dateStr = dateStr;
        
        cell.innerHTML = `
          <span class="calendar-cell-greg">${d}</span>
          ${holidayName ? `<span class="calendar-cell-holiday" title="${holidayName}">${holidayName}</span>` : ''}
          <span class="calendar-cell-heb">${hebDate.hd || ''}</span>
        `;
        
        // 클릭 시 날짜 선택 및 팝업 모달창 띄우기
        const cellDateStr = dateStr;
        cell.addEventListener('click', () => {
          activeDateStr = cellDateStr;
          document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('active-highlight'));
          cell.classList.add('active-highlight');
          
          renderDashboard();
          openEventModal(cellDateStr);
        });
        
        weekCells.push(cell);
        d++;
      }
    }
    
    // 7일 분량의 셀을 그리드에 순서대로 삽입
    weekCells.forEach(c => gridCells.appendChild(c));
    
    // 8번째 열: 이번주 토라포션 셀 생성 및 삽입
    const torahCell = document.createElement('div');
    torahCell.className = 'calendar-cell torah-column-cell';
    torahCell.style.gridColumn = '8';
    torahCell.style.gridRow = String(weekGridRow);
    if (weekParasha) {
      torahCell.innerHTML = `<span class="calendar-cell-parasha" title="Weekly Torah Portion: ${weekParashaFull}">${weekParasha}</span>`;
    } else {
      torahCell.innerHTML = `<span style="color: var(--text-dim); font-size: 0.7rem;">-</span>`;
    }
    torahCell.setAttribute('role', 'button');
    torahCell.setAttribute('tabindex', '0');
    torahCell.title = '파라샤 상세 보기';
    torahCell.addEventListener('click', () => {
      openParashaDetailModal(weekDateStrs, weekParashaFull || weekParasha);
    });
    torahCell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openParashaDetailModal(weekDateStrs, weekParashaFull || weekParasha);
      }
    });
    gridCells.appendChild(torahCell);
    buildCalendarWeekEventBars(weekDateStrs, weekGridRow).forEach(bar => gridCells.appendChild(bar));
    weekGridRow++;
  }
}

function openParashaDetailModal(weekDateStrs, weekParashaName) {
  const modal = document.getElementById('parasha-detail-modal');
  const titleEl = document.getElementById('parasha-modal-title');
  const bodyEl = document.getElementById('parasha-modal-body');
  if (!modal || !titleEl || !bodyEl) return;

  const cleanName = (weekParashaName || 'Special Week').replace(/^Parashat\s+|^Parashas\s+/i, '').trim();
  const meta = window.getParashaMeta(cleanName);
  const detail = getParashaDetail(cleanName);
  const isSpecialWeek = cleanName === 'Special Week' || !weekParashaName;
  const titleText = isSpecialWeek
    ? '절기 주간'
    : cleanName.includes('샬롬')
      ? '샬롬 (Shalom)'
      : `${cleanName} (${meta.ko})`;

  titleEl.textContent = titleText;

  const visibleDates = weekDateStrs.filter(Boolean);
  const weekRange = visibleDates.length > 0
    ? `${formatDateWithWeekday(visibleDates[0])} - ${formatDateWithWeekday(visibleDates[visibleDates.length - 1])}`
    : '';

  const readingRows = visibleDates.map(dateStr => {
    const dayData = currentPlan[dateStr];
    if (!dayData) return '';

    const tags = [];
    if (dayData.torah) {
      tags.push(`<div class="parasha-reading-tag torah"><strong>토라</strong><span>${escapeHtml(window.BIBLE_DATA.translateTorahReading(dayData.torah))}</span></div>`);
    }
    if (dayData.megillah) {
      tags.push(`<div class="parasha-reading-tag megillah"><strong>메길롯</strong><span>${escapeHtml(dayData.megillah)}</span></div>`);
    }
    if (dayData.ot && dayData.ot.length > 0) {
      tags.push(`<div class="parasha-reading-tag ot"><strong>구약</strong><span>${escapeHtml(formatReadingRange(dayData.ot))}</span></div>`);
    }
    if (dayData.nt && dayData.nt.length > 0) {
      tags.push(`<div class="parasha-reading-tag nt"><strong>신약</strong><span>${escapeHtml(formatReadingRange(dayData.nt))}</span></div>`);
    }

    return `
      <div class="parasha-reading-row">
        <div class="parasha-reading-date">${escapeHtml(formatDateWithWeekday(dateStr))}</div>
        <div class="parasha-reading-list">
          ${tags.length > 0 ? tags.join('') : '<div class="parasha-reading-empty">읽기 본문 없음</div>'}
        </div>
      </div>
    `;
  }).join('');

  bodyEl.innerHTML = `
    <section class="parasha-modal-section">
      <div class="parasha-modal-kicker">${escapeHtml(weekRange)}</div>
      <div class="parasha-modal-title-block">
        <div>
          <div class="parasha-modal-name">${escapeHtml(titleText)}</div>
          <div class="parasha-modal-meaning">${escapeHtml(isSpecialWeek ? '절기 특별 주간' : meta.meaning)}</div>
        </div>
        ${meta.he ? `<div class="parasha-modal-hebrew">${escapeHtml(meta.he)}</div>` : ''}
      </div>
    </section>

    <section class="parasha-modal-section">
      <h4 class="parasha-modal-subtitle">배경과 뜻</h4>
      <div class="parasha-modal-description">
        ${detail ? detail : '<p>이 주간은 절기 또는 특별 편성으로, 별도 파라샤 배경 설명이 없습니다.</p>'}
      </div>
    </section>

    <section class="parasha-modal-section">
      <h4 class="parasha-modal-subtitle">읽어야 하는 말씀</h4>
      <div class="parasha-reading-table">
        ${readingRows}
      </div>
    </section>
  `;

  modal.classList.remove('hidden');
}

function closeParashaDetailModal() {
  const modal = document.getElementById('parasha-detail-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function setupParashaModalActions() {
  const modal = document.getElementById('parasha-detail-modal');
  const btnClose = document.getElementById('btn-close-parasha-modal');

  if (btnClose) {
    btnClose.addEventListener('click', closeParashaDetailModal);
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'parasha-detail-modal') {
        closeParashaDetailModal();
      }
    });
  }
}

// 다가오는 절기 리스트 렌더링
function renderUpcomingHolidays() {
  const container = document.getElementById('upcoming-holidays-container');
  container.innerHTML = '';
  
  const todayStr = getTodayStr();
  const dates = getPlanDates();
  const todayIdx = dates.indexOf(todayStr);
  const startIdx = todayIdx !== -1 ? todayIdx : 0;
  
  const upcomingHols = [];
  
  for (let i = startIdx; i < dates.length; i++) {
    const dateStr = dates[i];
    const dayData = currentPlan[dateStr];
    if (dayData.holidays && dayData.holidays.length > 0) {
      for (const h of dayData.holidays) {
        const normName = getBiblicalHolidayName(h.name);
        if (normName) {
          const alreadyAdded = upcomingHols.some(item => item.name === normName);
          if (!alreadyAdded) {
            const displayDateStr = normalizeHolidayDateForDisplay(normName, dateStr);
            const d1 = new Date(todayStr);
            const d2 = new Date(displayDateStr);
            const diffTime = d2 - d1;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            upcomingHols.push({
              name: normName,
              dateStr: displayDateStr,
              dday: diffDays
            });
            break;
          }
        }
      }
    }
    
    if (upcomingHols.length >= 4) break;
  }
  
  if (upcomingHols.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.9rem; text-align: center; padding: 1rem;">다가오는 절기가 없습니다.</div>';
    return;
  }
  
  upcomingHols.forEach(item => {
    const parts = item.dateStr.split('-');
    const gDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10)-1, parseInt(parts[2], 10)));
    const daysName = ['일','월','화','수','목','금','토'];
    const gDayOfWeek = daysName[gDate.getUTCDay()];
    
    const formattedGregorian = `${parts[0]}년 ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일(${gDayOfWeek})`;
    
    const hebDate = getHebrewDateNatively(item.dateStr);
    const formattedHebrew = hebDate.hm ? `${hebDate.hd} ${hebDate.hm} / ${hebDate.hebrew}` : '';
    
    let ddayText = '';
    if (item.dday === 0) {
      ddayText = '오늘!';
    } else if (item.dday > 0) {
      ddayText = `D-${item.dday}`;
    } else {
      ddayText = `D+${Math.abs(item.dday)}`;
    }
    
    const row = document.createElement('div');
    row.className = 'holiday-item-row';
    row.innerHTML = `
      <div class="holiday-item-left">
        <div class="holiday-item-title">${item.name}</div>
        <div class="holiday-item-date-greg">📅 ${formattedGregorian}</div>
        ${formattedHebrew ? `<div class="holiday-item-date-heb">✡️ ${formattedHebrew}</div>` : ''}
      </div>
      <div class="holiday-item-dday">${ddayText}</div>
    `;
    
    row.addEventListener('click', () => {
      activeDateStr = item.dateStr;
      const p = item.dateStr.split('-');
      calendarCurrentDate = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1));
      
      // 주간 보기 탭으로 스위칭
      const weeklyTabBtn = document.querySelector('.tab-item[data-tab="weekly"]');
      if (weeklyTabBtn) {
        weeklyTabBtn.click();
      } else {
        renderDashboard();
      }
    });
    
    container.appendChild(row);
  });
}

// 한글 성경책 이름 순서 정의 (getBible API v2 대응용 1-based 인덱스 계산)
const BIBLE_BOOKS_ORDER = [
  '창세기', '출애굽기', '레위기', '민수기', '신명기',
  '여호수아', '사사기', '룻기', '사무엘상', '사무엘하',
  '열왕기상', '열왕기하', '역대상', '역대하',
  '에스라', '느헤미야', '에스더', '욥기', '시편',
  '잠언', '전도서', '아가', '이사야', '예레미야',
  '예레미야 애가', '에스겔', '다니엘', '호세아', '요엘',
  '아모스', '오바댜', '요나', '미가', '나훔',
  '하박국', '스바냐', '학개', '스가랴', '말라기',
  '마태복음', '마가복음', '누가복음', '요한복음', '사도행전',
  '로마서', '고린도전서', '고린도후서', '갈라디아서',
  '에베소서', '빌립보서', '골로새서', '데살로니가전서',
  '데살로니가후서', '디모데전서', '디모데후서', '디도서',
  '빌레몬서', '히브리서', '야고보서', '베드로전서',
  '베드로후서', '요한1서', '요한2서', '요한3서',
  '유다서', '요한계시록'
];

function getBookNumber(bookNameKOR) {
  const idx = BIBLE_BOOKS_ORDER.indexOf(bookNameKOR);
  return idx !== -1 ? idx + 1 : null;
}

const ORIGINAL_DATA_BASE = 'original-data';
let originalLanguageIndexPromise = null;
let hebrewLexiconPromise = null;
let greekLexiconPromise = null;
let kjv1769StrongIndexPromise = null;
const originalLanguageBookCache = {};
const kjv1769StrongBookCache = {};
const originalLanguageScriptPromises = {};
const ORIGINAL_BOOK_NAME_ALIASES = {
  '예레미야 애가': '예레미야애가',
  '요한1서': '요한일서',
  '요한2서': '요한이서',
  '요한3서': '요한삼서',
  '욥': '욥기',
  '애가': '예레미야애가',
  '요일': '요한일서',
  '요이': '요한이서',
  '요삼': '요한삼서'
};

const KJV1769_STRONG_BOOK_NAME_ALIASES = {
  ...ORIGINAL_BOOK_NAME_ALIASES,
  '예레미야 애가': '예레미야애가'
};

let bibleReaderRestoreState = null;

function normalizeVerseRefKey(bookName, chapter, verse) {
  if (!bookName || !chapter || !verse) return '';
  return `${String(bookName).trim()} ${Number(chapter)}:${Number(verse)}`;
}

function normalizeOriginalWord(row) {
  if (Array.isArray(row)) {
    return {
      original: row[0] || '',
      transliteration: row[1] || '',
      meaningKo: row[2] || row[3] || '',
      strong: row[3] || '',
      lemma: row[4] || '',
      morph: row[5] || '',
      morphKo: row[6] || ''
    };
  }
  return row || {};
}

const ORIGINAL_ENGLISH_GLOSS_KO = {
  all: '모든, 전체',
  every: '모든, 각각의',
  everyone: '모든 사람',
  any: '어떤, 아무',
  each: '각각',
  which: '~하는, 관계를 잇는 말',
  who: '~하는 사람',
  that: '~하는, 그것',
  what: '무엇',
  where: '어디',
  when: '언제',
  why: '왜',
  how: '어떻게',
  city: '성읍, 도시',
  cities: '성읍들, 도시들',
  town: '마을',
  towns: '마을들',
  land: '땅, 땅의 영역',
  earth: '땅, 세계',
  heaven: '하늘',
  heavens: '하늘들',
  god: '하나님',
  lord: '주, 여호와',
  people: '백성',
  israel: '이스라엘',
  son: '아들',
  sons: '아들들, 자손',
  father: '아버지',
  house: '집, 가문',
  tent: '장막',
  priest: '제사장',
  levite: '레위인',
  levites: '레위인들',
  give: '주다',
  gave: '주었다',
  take: '취하다, 가져가다',
  took: '취했다',
  speak: '말하다',
  said: '말했다',
  say: '말하다',
  command: '명령하다',
  commanded: '명령했다',
  go: '가다',
  went: '갔다',
  come: '오다',
  came: '왔다',
  see: '보다',
  saw: '보았다',
  hear: '듣다',
  heard: '들었다',
  says: '말한다',
  saying: '말함, 말하기',
  make: '만들다, 행하다',
  made: '만들었다, 행했다',
  do: '하다',
  did: '했다',
  be: '있다, 되다',
  was: '있었다, 되었다',
  become: '되다',
  became: '되었다',
  holy: '거룩한',
  sanctuary: '성소',
  tabernacle: '성막',
  altar: '제단',
  offering: '제물, 예물',
  sacrifice: '제사, 희생제물',
  sin: '죄',
  righteousness: '의',
  justice: '정의, 재판',
  judgment: '심판, 판결',
  covenant: '언약',
  law: '율법, 가르침',
  word: '말씀, 말',
  words: '말씀들, 말들',
  heart: '마음',
  soul: '생명, 영혼',
  spirit: '영, 바람',
  life: '생명',
  death: '죽음',
  king: '왕',
  kingdom: '왕국, 나라',
  seed: '씨, 후손',
  name: '이름',
  day: '날',
  days: '날들',
  year: '해, 년',
  years: '해들, 년들',
  water: '물',
  waters: '물들',
  bread: '빵, 양식',
  mountain: '산',
  wilderness: '광야',
  servant: '종',
  man: '사람, 남자',
  woman: '여자',
  good: '좋은, 선한',
  evil: '악, 나쁜',
  great: '큰, 위대한',
  small: '작은',
  many: '많은',
  few: '적은',
  between: '사이에',
  before: '~앞에, 이전에',
  after: '~후에',
  with: '~와 함께',
  against: '~을 향하여, ~에 맞서',
  just: '바로, 꼭',
  as: '~처럼, ~같이',
  whom: '~하는 사람',
  nights: '밤들',
  from: '~로부터',
  to: '~에게, ~로',
  in: '~안에',
  on: '~위에',
  and: '그리고',
  but: '그러나',
  for: '왜냐하면, ~을 위하여',
  not: '아니다, 하지 않다',
  '<obj.>': '목적격 표지',
  '<the>': '정관사',
  of: '~의',
  into: '~안으로',
  among: '~가운데',
  over: '~위에, 다스려',
  under: '~아래에',
  by: '~에 의해, ~곁에',
  through: '~을 통하여',
  there: '거기, 그곳',
  these: '이것들',
  those: '저것들',
  this: '이것, 이',
  another: '다른',
  other: '다른',
  one: '하나',
  two: '둘',
  three: '셋',
  four: '넷',
  five: '다섯',
  six: '여섯',
  seven: '일곱',
  eight: '여덟',
  forty: '사십',
  inheritance: '기업, 상속 재산',
  possession: '소유, 기업',
  pasture: '목초지, 들판',
  field: '들, 밭',
  fields: '들, 밭들',
  cattle: '가축',
  beast: '짐승',
  beasts: '짐승들',
  refuge: '피난처, 도피처',
  killer: '살인자',
  slayer: '살인자',
  boundary: '경계',
  border: '경계',
  measure: '측량하다, 재다',
  number: '수, 숫자',
  according: '~에 따라',
  therefore: '그러므로',
  because: '왜냐하면',
  sojourn: '거류하다',
  stranger: '거류민, 나그네',
  assembly: '회중, 모임',
  congregation: '회중',
  tribe: '지파',
  tribes: '지파들',
  family: '가족, 족속',
  families: '가족들, 족속들',
  alpha: '알파',
  omega: '오메가',
  abba: '아바, 아버지',
  abaddon: '아바돈',
  abyss: '무저갱, 깊은 곳',
  aaron: '아론',
  abel: '아벨',
  abijah: '아비야',
  abiathar: '아비아달',
  abiud: '아비웃',
  adam: '아담',
  hagar: '하갈',
  agabus: '아가보',
  agrippa: '아그립바',
  hades: '음부, 하데스',
  jesus: '예수',
  christ: '그리스도',
  gospel: '복음',
  faith: '믿음',
  grace: '은혜',
  truth: '진리',
  disciple: '제자',
  disciples: '제자들',
  apostle: '사도',
  apostles: '사도들',
  angel: '천사, 사자',
  angels: '천사들, 사자들',
  messenger: '사자, 전령',
  message: '소식, 전갈',
  holiness: '거룩함',
  sanctification: '거룩하게 됨, 성화',
  sanctified: '거룩하게 된',
  hallowed: '거룩하게 된',
  sanctifying: '거룩하게 하는',
  saints: '성도들',
  saint: '성도',
  mother: '어머니',
  brother: '형제',
  brothers: '형제들',
  sister: '자매',
  sisters: '자매들',
  beloved: '사랑받는 자, 사랑하는',
  goodness: '선함',
  generous: '너그러운, 후한',
  gladness: '기쁨',
  joy: '기쁨',
  exultation: '크게 기뻐함',
  indignation: '분노',
  purity: '깨끗함, 순결',
  pure: '깨끗한, 순결한',
  innocent: '죄 없는, 순전한',
  ignorance: '무지',
  ignorant: '알지 못하는, 무지한',
  righteous: '의로운',
  marketplace: '시장',
  marketplaces: '시장들',
  market: '시장',
  country: '지방, 시골',
  vessels: '그릇들, 기구들',
  vessel: '그릇, 기구',
  herd: '떼, 무리',
  genealogy: '족보',
  unmarried: '혼인하지 않은',
  arms: '팔들, 무기들',
  hook: '갈고리',
  anchor: '닻',
  anchors: '닻들',
  buy: '사다',
  buying: '사는 것',
  bought: '샀다',
  rejoice: '기뻐하다',
  rejoiced: '기뻐했다',
  exulting: '크게 기뻐하는',
  compel: '억지로 시키다',
  compelled: '억지로 시켰다',
  catch: '붙잡다',
  watch: '깨어 지키다, 보다',
  watching: '깨어 지킴',
  brought: '데려왔다, 가져왔다',
  conduct: '행실, 처신',
  conflict: '갈등, 싸움',
  fight: '싸움',
  race: '경주',
  struggle: '싸움, 분투',
  strive: '힘쓰다, 싸우다',
  striving: '힘쓰는, 싸우는',
  agony: '고통, 고뇌',
  unschooled: '배우지 못한',
  unceasingly: '끊임없이',
  unceasing: '끊임없는',
  uncertainly: '불확실하게',
  uncertainty: '불확실함',
  impartial: '공평한',
  distressed: '괴로워하는',
  burden: '짐, 부담',
  unburdensome: '짐이 되지 않는',
  account: '설명, 이야기, 셈',
  loving: '사랑하는',
  lowborn: '낮은 신분의',
  purified: '깨끗하게 된',
  purification: '정결, 깨끗하게 함'
};

const HEBREW_LEXICAL_NOTES = {
  H3605: {
    meaning: '전체, 모두, 빠짐없는 전부',
    root: 'כֹּל/כָּלַל 계열로 보며, 어떤 범위 안의 모든 구성원을 포괄하는 말입니다.',
    usage: '율법·명령·분배 문맥에서 “남김없이/전부”를 강조할 때 자주 쓰입니다.',
    nuance: '이 절에서는 레위인에게 줄 성읍의 범위를 일부가 아니라 전체 수량으로 묶어 줍니다.'
  },
  H5892: {
    meaning: '성읍, 도시, 사람이 거주하는 방어된 거처',
    root: 'עִיר는 거주지와 공동체를 뜻하는 명사입니다. 어근 설명은 논쟁이 있으나 성벽·문·주민이 있는 정착지를 가리킵니다.',
    usage: '여호수아·민수기·열왕기에서 땅 분배, 피난처, 방어 거점, 공동체 생활 단위로 반복됩니다.',
    nuance: '민수기 35장에서는 레위인의 생활 기반이자 도피성 제도와 연결되는 공간입니다.'
  },
  H0834: {
    meaning: '~하는, ~인, 관계를 이어 주는 말',
    root: 'אֲשֶׁר는 히브리어 관계사로, 앞의 명사나 절을 뒤 설명과 연결합니다.',
    usage: '서술을 길게 이어 조건·설명·소유·목적을 붙일 때 매우 자주 쓰입니다.',
    nuance: '이 절에서는 앞에서 말한 성읍들을 뒤의 설명과 연결해 범위를 분명히 합니다.'
  },
  H5414: {
    meaning: '주다, 넘겨주다, 맡기다, 세우다',
    root: 'נָתַן은 단순 증여뿐 아니라 배정, 임명, 허락, 설치까지 폭넓게 쓰이는 기본 동사입니다.',
    usage: '땅을 주다, 명령을 주다, 사람을 맡기다, 권한을 세우다 같은 언약·분배 문맥에서 자주 나옵니다.',
    nuance: '민수기 35장에서는 레위인에게 성읍을 “배정하여 주는” 제도적 행위를 나타냅니다.'
  },
  H3881: {
    meaning: '레위, 레위인',
    root: 'לֵוִי는 야곱의 아들 레위와 그 지파를 가리키며, 이름은 “연합하다/붙다”라는 의미와 연결해 설명되곤 합니다.',
    usage: '성막 봉사, 제사장 보조, 성전 예배, 이스라엘의 예배 질서와 관련해 반복됩니다.',
    nuance: '땅을 지파별 기업으로 받지 않는 레위인이 성읍을 통해 거주 기반을 얻는 문맥입니다.'
  },
  H5159: {
    meaning: '기업, 상속 재산, 분깃',
    root: 'נַחֲלָה는 물려받은 몫, 하나님이 맡기신 분깃을 뜻합니다.',
    usage: '가나안 땅 분배, 지파별 몫, 하나님의 백성이 받은 유산을 말할 때 쓰입니다.',
    nuance: '성읍 제공이 단순 편의가 아니라 이스라엘 기업 구조 안의 질서임을 보여 줍니다.'
  },
  H4054: {
    meaning: '목초지, 들판, 성읍 주변의 방목지',
    root: 'מִגְרָשׁ는 성읍 밖 주변 공간, 특히 가축을 위한 목초지를 가리킵니다.',
    usage: '레위 성읍 규정에서 성읍과 함께 주어지는 주변 토지를 말할 때 중요하게 쓰입니다.',
    nuance: '레위인의 거주뿐 아니라 가축과 생활 유지까지 포함한 실제적 공급을 뜻합니다.'
  },
  H7225: {
    meaning: '처음, 시작, 으뜸',
    root: 'רֵאשִׁית는 “머리/첫머리” 계열 의미에서 시작과 첫 부분을 가리킵니다.',
    usage: '창조의 시작, 첫 열매, 지혜의 근본처럼 출발점과 우선성을 말할 때 쓰입니다.',
    nuance: '문맥에서 시간의 출발점이나 우선되는 원리를 세우는 단어입니다.'
  },
  H1254: {
    meaning: '창조하다',
    root: 'בָּרָא는 성경에서 하나님이 주어로 나오는 창조 행위를 표현할 때 두드러집니다.',
    usage: '창세기 1장, 시편, 이사야에서 하나님의 주권적 새 창조를 말할 때 반복됩니다.',
    nuance: '인간의 제작보다 하나님의 주권적 창조 행위를 강조합니다.'
  },
  H0430: {
    meaning: '하나님, 신',
    root: 'אֱלֹהִים은 형태상 복수형이나, 이스라엘의 하나님을 가리킬 때 단수 동사와 함께 쓰입니다.',
    usage: '창조주, 언약의 주권자, 심판자, 예배 대상 하나님을 가리키는 핵심 명칭입니다.',
    nuance: '본문의 행위 주체가 인간이나 자연이 아니라 하나님임을 분명히 합니다.'
  },
  H0776: {
    meaning: '땅, 땅의 영역, 나라',
    root: 'אֶרֶץ는 물리적 땅, 특정 지역, 온 세계, 한 나라를 문맥에 따라 가리킵니다.',
    usage: '창조 세계, 약속의 땅, 이스라엘 땅, 열방의 땅을 말할 때 반복됩니다.',
    nuance: '문맥상 공간적 범위와 하나님이 다루시는 삶의 터전을 보여 줍니다.'
  },
  H3068: {
    meaning: '여호와, 언약의 하나님 이름',
    root: 'יהוה는 이스라엘의 하나님을 가리키는 고유한 언약 이름입니다.',
    usage: '출애굽, 율법, 예언서에서 하나님의 신실한 언약 주체를 나타냅니다.',
    nuance: '명령이나 약속의 권위가 여호와께 있음을 드러냅니다.'
  },
  H1697: {
    meaning: '말, 말씀, 일, 사건',
    root: 'דָּבָר는 발화된 말과 실제로 일어난 일을 모두 가리킬 수 있습니다.',
    usage: '여호와의 말씀, 명령, 사건, 문제를 표현하는 매우 넓은 핵심어입니다.',
    nuance: '말씀은 단순 정보가 아니라 현실을 움직이는 하나님의 발화로 읽힐 수 있습니다.'
  },
  H8451: {
    meaning: '토라, 가르침, 율법',
    root: 'תּוֹרָה는 “가르치다/지시하다”의 의미권과 연결됩니다.',
    usage: '모세오경, 하나님의 교훈, 언약 백성의 삶을 이끄는 가르침을 말합니다.',
    nuance: '법 조항만이 아니라 하나님 백성을 형성하는 지시와 가르침입니다.'
  },
  H7965: {
    meaning: '평안, 온전함, 샬롬',
    root: 'שָׁלוֹם은 온전함, 안전, 관계의 회복, 번영을 포함합니다.',
    usage: '인사, 언약의 복, 전쟁 반대 상태, 하나님이 주시는 온전함을 말할 때 쓰입니다.',
    nuance: '단순한 감정적 평온보다 하나님 안에서 회복된 질서를 가리킵니다.'
  },
  H2617: {
    meaning: '인애, 언약적 사랑, 신실한 자비',
    root: 'חֶסֶד는 관계 안에서 지속되는 사랑과 충성, 자비를 함께 담습니다.',
    usage: '시편과 예언서에서 하나님의 언약적 신실함을 말할 때 자주 나옵니다.',
    nuance: '감정보다 언약을 지키는 신실한 행동의 사랑에 가깝습니다.'
  }
};

const STRUCTURAL_HEBREW_STRONGS = new Set([
  'H9001', 'H9002', 'H9003', 'H9004', 'H9005', 'H9006', 'H9007', 'H9008',
  'H9009', 'H9010', 'H9011', 'H9012', 'H9013', 'H9014', 'H9015', 'H9016',
  'H9017', 'H9018', 'H9019', 'H9020', 'H9021', 'H9022', 'H9023', 'H9024',
  'H9025', 'H9026', 'H9027', 'H9028', 'H9029', 'H9030', 'H9031', 'H9032',
  'H9033', 'H9034', 'H9035', 'H9036', 'H9037', 'H9038', 'H9039'
]);

const KOREAN_ALIGNMENT_SYNONYMS = {
  '모든': ['모든', '모두', '온', '전부'],
  '전체': ['전체', '모두', '전부', '온'],
  '성읍': ['성읍', '성', '도시'],
  '도시': ['성읍', '도시'],
  '모아브': ['모압', '모아브'],
  '레위': ['레위', '레위인'],
  '레위인': ['레위인', '레위'],
  '기업': ['기업', '분깃', '상속'],
  '상속': ['상속', '기업', '분깃'],
  '목초지': ['들', '목초지', '들판'],
  '들판': ['들', '들판', '목초지'],
  '주다': ['주', '주고', '주어', '줄', '주라', '주니'],
  '말하다': ['말씀', '말하', '이르', '가라사대', '고하'],
  '말했다': ['말씀', '말하', '이르', '가라사대', '고하'],
  '말한다': ['말씀', '말하', '이르', '가라사대', '고하'],
  '땅': ['땅', '토지', '지면'],
  '여호와': ['여호와', '주'],
  '하나님': ['하나님', '신'],
  '아버지': ['아비', '아버지', '조상'],
  '조상': ['조상', '아비', '아버지'],
  '아들': ['아들', '자손'],
  '백성': ['백성', '자손'],
  '지파': ['지파'],
  '밤': ['밤'],
  '경고': ['경고', '말씀', '묵시'],
  '예언': ['예언', '말씀', '묵시']
};

async function loadOriginalLanguageIndex() {
  if (window.ORIGINAL_LANGUAGE_INDEX) return window.ORIGINAL_LANGUAGE_INDEX;
  if (!originalLanguageIndexPromise) {
    originalLanguageIndexPromise = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/index.js`, 'original-language-index')
      .then(() => window.ORIGINAL_LANGUAGE_INDEX || null)
      .catch(err => {
        console.warn('Original language index unavailable.', err);
        return null;
      });
  }
  return originalLanguageIndexPromise;
}

async function loadOriginalBookData(bookName) {
  const index = await loadOriginalLanguageIndex();
  const lookupName = index && index.books && index.books[bookName]
    ? bookName
    : ORIGINAL_BOOK_NAME_ALIASES[bookName] || bookName;
  const bookMeta = index && index.books ? index.books[lookupName] : null;
  if (!bookMeta || !bookMeta.file) return null;

  if (!originalLanguageBookCache[bookMeta.file]) {
    originalLanguageBookCache[bookMeta.file] = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/${bookMeta.file}`, `original-language-${bookMeta.step}`)
      .then(() => {
        const books = window.ORIGINAL_LANGUAGE_BOOKS || {};
        return books[bookMeta.step] || null;
      })
      .catch(err => {
        console.warn(`Original language book unavailable: ${bookName}`, err);
        return null;
      });
  }
  return originalLanguageBookCache[bookMeta.file];
}

async function loadHebrewLexicon() {
  if (window.HEBREW_LEXICON) return window.HEBREW_LEXICON;
  if (!hebrewLexiconPromise) {
    hebrewLexiconPromise = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/hebrew-lexicon.js`, 'hebrew-lexicon')
      .then(() => window.HEBREW_LEXICON || null)
      .catch(err => {
        console.warn('Hebrew lexicon unavailable.', err);
        return null;
      });
  }
  return hebrewLexiconPromise;
}

async function loadGreekLexicon() {
  if (window.GREEK_LEXICON) return window.GREEK_LEXICON;
  if (!greekLexiconPromise) {
    greekLexiconPromise = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/greek-lexicon.js`, 'greek-lexicon')
      .then(() => window.GREEK_LEXICON || null)
      .catch(err => {
        console.warn('Greek lexicon unavailable.', err);
        return null;
      });
  }
  return greekLexiconPromise;
}

async function loadKjv1769StrongIndex() {
  if (window.KJV1769_STRONG_INDEX) return window.KJV1769_STRONG_INDEX;
  if (!kjv1769StrongIndexPromise) {
    kjv1769StrongIndexPromise = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/kjv1769-strong/index.js`, 'kjv1769-strong-index')
      .then(() => window.KJV1769_STRONG_INDEX || null)
      .catch(err => {
        console.warn('KJV1769 Strong index unavailable.', err);
        return null;
      });
  }
  return kjv1769StrongIndexPromise;
}

async function loadKjv1769StrongBookData(bookName) {
  const index = await loadKjv1769StrongIndex();
  const lookupName = index && index.books && index.books[bookName]
    ? bookName
    : KJV1769_STRONG_BOOK_NAME_ALIASES[bookName] || bookName;
  const bookMeta = index && index.books ? index.books[lookupName] : null;
  if (!bookMeta || !bookMeta.file) return null;

  if (!kjv1769StrongBookCache[bookMeta.file]) {
    kjv1769StrongBookCache[bookMeta.file] = loadOriginalLanguageScript(`${ORIGINAL_DATA_BASE}/kjv1769-strong/${bookMeta.file}`, `kjv1769-strong-${bookMeta.osis}`)
      .then(() => {
        const books = window.KJV1769_STRONG_BOOKS || {};
        return books[bookMeta.osis] || null;
      })
      .catch(err => {
        console.warn(`KJV1769 Strong book unavailable: ${bookName}`, err);
        return null;
      });
  }
  return kjv1769StrongBookCache[bookMeta.file];
}

function loadOriginalLanguageScript(src, id) {
  if (originalLanguageScriptPromises[src]) return originalLanguageScriptPromises[src];

  originalLanguageScriptPromises[src] = new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Script load failed: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(script);
  });

  return originalLanguageScriptPromises[src];
}

function hasHangul(value) {
  return /[가-힣]/.test(String(value || ''));
}

function extractStrongKeys(value) {
  return Array.from(String(value || '').matchAll(/([HG])0*(\d+)/gi))
    .map(match => `${match[1].toUpperCase()}${match[2].padStart(4, '0')}`);
}

function normalizeStrongKey(value) {
  const keys = extractStrongKeys(value);
  return keys.find(key => !STRUCTURAL_HEBREW_STRONGS.has(key)) || keys[0] || '';
}

function translateGlossToKo(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (hasHangul(raw) && !/[A-Za-z]/.test(raw)) return raw;

  const cleaned = raw
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[“”"'.;:!?]/g, '')
    .trim();
  const lower = cleaned.toLowerCase();
  const subjectless = lower
    .replace(/^(he|she|they|we|you|it|i)\s+(will\s+|shall\s+|had\s+|has\s+|have\s+|was\s+|were\s+)?/, '')
    .trim();

  if (subjectless && ORIGINAL_ENGLISH_GLOSS_KO[subjectless]) return ORIGINAL_ENGLISH_GLOSS_KO[subjectless];

  if (ORIGINAL_ENGLISH_GLOSS_KO[lower]) return ORIGINAL_ENGLISH_GLOSS_KO[lower];

  if (lower.includes('/')) {
    return lower
      .split('/')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => ORIGINAL_ENGLISH_GLOSS_KO[part] || part)
      .join(' / ');
  }

  const normalizedWords = subjectless
    .split(/\s+/)
    .filter(word => word && !['he', 'she', 'they', 'we', 'you', 'it', 'i', 'will', 'shall', 'may', 'might', 'should', 'would', 'could', 'can', 'had', 'has', 'have', 'was', 'were'].includes(word));
  if (normalizedWords.length > 1) {
    const translated = normalizedWords.map(word => ORIGINAL_ENGLISH_GLOSS_KO[word] || word);
    if (translated.some((word, index) => word !== normalizedWords[index])) {
      return translated.join(' ');
    }
  }

  return raw;
}

function getWordMeaningKo(word) {
  const strongKey = normalizeStrongKey(word.strong);
  if (strongKey && HEBREW_LEXICAL_NOTES[strongKey]) {
    return HEBREW_LEXICAL_NOTES[strongKey].meaning;
  }
  const lexicon = getOriginalLexiconEntry(word);
  const lexiconMeaning = getLexiconMeaning(lexicon);
  if (lexiconMeaning) return lexiconMeaning;
  return translateGlossToKo(word.meaningKo || word.gloss || '');
}

function getHebrewLexiconEntry(word) {
  return getOriginalLexiconEntry(word);
}

function getOriginalLexiconEntry(word) {
  const strongKey = normalizeStrongKey(word && word.strong);
  if (!strongKey) return null;
  const hebrewEntries = window.HEBREW_LEXICON && window.HEBREW_LEXICON.entries;
  const greekEntries = window.GREEK_LEXICON && window.GREEK_LEXICON.entries;
  if (strongKey.startsWith('H') && hebrewEntries) return hebrewEntries[strongKey] || null;
  if (strongKey.startsWith('G') && greekEntries) return greekEntries[strongKey] || null;
  return null;
}

function getLexiconMeaning(entry) {
  const meanings = entry && Array.isArray(entry.m) ? entry.m : [];
  const clean = meanings
    .filter(meaning => !/\b(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kin|Chr|Ezra|Neh|Est|Job|Psa|Prov|Eccl|Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Mt|Mk|Lk|Jn|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Titus|Phlm|Heb|Jas|Pet|Jude|Rev)\.?\s*\d/i.test(String(meaning || '')))
    .filter(meaning => String(meaning || '').length <= 48)
    .map(meaning => translateGlossToKo(meaning))
    .map(meaning => String(meaning || '').trim())
    .filter(Boolean)
    .filter(meaning => meaning !== '-' && !['정관사', '목적격 표지'].includes(meaning));
  return clean.find(meaning => hasHangul(meaning) && !/[A-Za-z]/.test(meaning)) ||
    clean.find(meaning => hasHangul(meaning)) ||
    clean[0] ||
    '';
}

function getLexiconPronunciationEn(entry, word) {
  const pronunciations = entry && Array.isArray(entry.p) ? entry.p.filter(Boolean) : [];
  const preferred = pronunciations.find(value => !String(value).includes('/')) || pronunciations[0] || (word && word.transliteration) || '';
  return String(preferred || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLexiconRefs(entry, limit = 8) {
  const refs = entry && Array.isArray(entry.r) ? entry.r : [];
  return refs.slice(0, limit);
}

function getBibleHubStrongUrl(strongKey) {
  const match = String(strongKey || '').match(/^([HG])0*(\d+)$/i);
  if (!match) return '';
  const section = match[1].toUpperCase() === 'H' ? 'hebrew' : 'greek';
  return `https://biblehub.com/${section}/${Number(match[2])}.htm`;
}

function renderStrongCodeLink(strongKey) {
  const url = getBibleHubStrongUrl(strongKey);
  const label = strongKey || '-';
  if (!url) return `<span>${escapeHtml(label)}</span>`;
  return `<a class="original-strong-link" href="${escapeHtml(url)}" title="Bible Hub에서 ${escapeHtml(label)} 보기" data-strong-link="true">${escapeHtml(label)}</a>`;
}

function getVerseTextForKey(refKey) {
  const row = getVerseRowByRefKey(refKey);
  if (!row) return '';
  if (row.dataset.verseText) return row.dataset.verseText;
  const textEl = row.querySelector('.bible-verse-text');
  return textEl ? textEl.textContent.trim() : '';
}

function getKjvTextForKey(refKey) {
  const row = getVerseRowByRefKey(refKey);
  if (!row) return '';
  if (row.dataset.kjvText) return row.dataset.kjvText;
  const textEl = row.querySelector('.bible-verse-kjv');
  return textEl ? textEl.textContent.trim() : '';
}

function getVerseRowByRefKey(refKey) {
  return Array.from(document.querySelectorAll('.bible-verse-row'))
    .find(row => row.dataset.refKey === refKey) || null;
}

function getAlignmentCandidates(word, lexiconEntry, verseText = '') {
  const rawParts = [
    getLexiconMeaning(lexiconEntry),
    getWordMeaningKo(word),
    word.meaningKo,
    word.gloss
  ].filter(Boolean);
  const terms = new Set();

  rawParts.forEach(part => {
    String(part)
      .split(/[,\s/·]+/)
      .map(value => value.replace(/[~"'.;:!?()[\]{}]/g, '').trim())
      .filter(value => /[가-힣]/.test(value))
      .forEach(value => {
        if (value.length >= 2) terms.add(value);
        (KOREAN_ALIGNMENT_SYNONYMS[value] || []).forEach(item => terms.add(item));
      });
  });

  const verse = String(verseText || '');
  return Array.from(terms)
    .filter(term => term.length >= 1)
    .filter(term => !['하는', '관계', '표지', '정관사', '목적격', '의미', '단어'].includes(term))
    .filter(term => verse.includes(term))
    .slice(0, 5);
}

function getKjvAlignmentCandidates(word, kjvStrongItems = []) {
  const strongKey = normalizeStrongKey(word && word.strong);
  if (!strongKey) return [];
  if (word && word.strongOccurrence) {
    let occurrence = 0;
    for (const item of (kjvStrongItems || [])) {
      if (!item || item[0] !== strongKey) continue;
      occurrence += 1;
      if (occurrence === Number(word.strongOccurrence)) {
        return [String(item[1] || '').trim()].filter(Boolean);
      }
    }
  }
  if (word && word.kjvText) return [String(word.kjvText).trim()].filter(Boolean);
  return Array.from(new Set(
    (kjvStrongItems || [])
      .filter(item => item && item[0] === strongKey)
      .map(item => String(item[1] || '').trim())
      .filter(Boolean)
  )).slice(0, 8);
}

function getKjvAlignmentMatch(word, kjvStrongItems = []) {
  const strongKey = normalizeStrongKey(word && word.strong);
  const targetOccurrence = Number(word && word.strongOccurrence) || 1;
  if (!strongKey) return null;
  let occurrence = 0;
  for (const item of (kjvStrongItems || [])) {
    if (!item || item[0] !== strongKey) continue;
    occurrence += 1;
    if (occurrence !== targetOccurrence) continue;
    return {
      phrase: String(item[1] || '').trim(),
      start: Number(item[2]),
      end: Number(item[3])
    };
  }
  return null;
}

function cleanShortEnglishMeaning(value) {
  let text = String(value || '')
    .replace(/[¿~<>\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (hasHangul(text)) text = text.replace(/[가-힣]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (/[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff]/u.test(text)) return '';
  if (/\b(?:pluperfect|aorist|optative|subjunctive|infinitive|participle|imperative|deponent|deriv(?:ative|ation|ed|atives?)|lexical form|conjugation|lemma)\b/i.test(text)) return '';

  const scriptureRef = text.match(/\b(?:[123]\s*)?(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kin|Chr|Ezra|Neh|Est|Job|Psa|Prov|Eccl|Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Mt|Mk|Lk|Jn|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Titus|Phlm|Heb|Jas|Pet|Jude|Rev)\.?\s*\d/i);
  if (scriptureRef) text = text.slice(0, scriptureRef.index);

  return text.replace(/[\s,;:]+$/, '').trim();
}

function getShortEnglishMeanings(entry) {
  const meanings = entry && Array.isArray(entry.m) ? entry.m : [];
  return Array.from(new Set(meanings
    .map(cleanShortEnglishMeaning)
    .filter(value => value && /[A-Za-z]/.test(value) && value !== '-')))
    .slice(0, 4);
}

function getLexiconLemma(entry, word) {
  const lemmas = entry && Array.isArray(entry.l) ? entry.l.filter(Boolean) : [];
  return String(lemmas[0] || (word && word.lemma) || (word && word.original) || '').trim();
}

function getLexiconExplanationParts(entry) {
  const text = String((entry && entry.d) || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];

  const parts = [];
  text.split(/;\s+/).forEach(clause => {
    const words = clause.trim().split(/\s+/).filter(Boolean);
    let chunk = '';
    words.forEach(word => {
      const next = chunk ? `${chunk} ${word}` : word;
      if (next.length > 320 && chunk) {
        parts.push(chunk);
        chunk = word;
      } else {
        chunk = next;
      }
    });
    if (chunk) parts.push(chunk);
  });
  return parts;
}

function getKjvHighlightTerms(candidates = []) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'by',
    'with', 'from', 'into', 'unto', 'upon', 'at', 'as', 'is', 'are', 'was',
    'were', 'be', 'been', 'being', 'he', 'she', 'they', 'we', 'you', 'i', 'it',
    'his', 'her', 'their', 'my', 'our', 'your', 'me', 'him', 'them', 'us'
  ]);
  const terms = [];

  (candidates || []).forEach(candidate => {
    const phrase = String(candidate || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
    if (!phrase) return;
    terms.push(phrase);
    phrase
      .replace(/[^A-Za-z0-9'\-\s]/g, ' ')
      .split(/\s+/)
      .map(word => word.trim())
      .filter(Boolean)
      .filter(word => word.length >= 3 && !stopWords.has(word.toLowerCase()))
      .forEach(word => terms.push(word));
  });

  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length).slice(0, 16);
}

function buildHighlightedKjvRange(text, start, end) {
  const originalText = String(text || '');
  const safeStart = Math.max(0, Math.min(Number(start), originalText.length));
  const safeEnd = Math.max(safeStart, Math.min(Number(end), originalText.length));
  return `${escapeHtml(originalText.slice(0, safeStart))}<mark class="bible-word-link bible-word-link-kjv">${escapeHtml(originalText.slice(safeStart, safeEnd))}</mark>${escapeHtml(originalText.slice(safeEnd))}`;
}

function buildHighlightedKjvOccurrence(text, phrase, occurrence = 1) {
  const originalText = String(text || '');
  const target = String(phrase || '').trim();
  if (!target) return escapeHtml(originalText);

  const escaped = escapeRegExp(target);
  const pattern = new RegExp(`\\b(${escaped})\\b`, 'gi');
  let count = 0;
  let matched = false;
  const highlighted = escapeHtml(originalText).replace(pattern, match => {
    count += 1;
    if (count !== Number(occurrence)) return match;
    matched = true;
    return `<mark class="bible-word-link bible-word-link-kjv">${match}</mark>`;
  });

  if (matched) return highlighted;
  return buildHighlightedText(originalText, getKjvHighlightTerms([target]), 'bible-word-link bible-word-link-kjv');
}

function buildHighlightedText(text, terms, className) {
  const originalText = String(text || '');
  const cleanTerms = Array.from(new Set((terms || []).filter(Boolean)))
    .map(term => String(term).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (cleanTerms.length === 0) {
    return escapeHtml(originalText);
  }

  const useWordBoundary = className.includes('kjv');
  const pattern = new RegExp(`${useWordBoundary ? '\\b' : ''}(${cleanTerms.map(escapeRegExp).join('|')})${useWordBoundary ? '\\b' : ''}`, useWordBoundary ? 'gi' : 'g');
  return escapeHtml(originalText).replace(pattern, `<mark class="${className}">$1</mark>`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFunctionWord(word) {
  const strongKey = normalizeStrongKey(word.strong);
  return ['H0853', 'H0834', 'H9001', 'H9002', 'H9003', 'H9005', 'H9009', 'G3588', 'G2532', 'G1722'].includes(strongKey);
}

async function getOriginalLanguageEntry(bookName, chapter, verse) {
  const key = normalizeVerseRefKey(bookName, chapter, verse);
  const verseKey = `${Number(chapter)}:${Number(verse)}`;
  const bookData = await loadOriginalBookData(bookName);

  if (bookData && bookData.verses && bookData.verses[verseKey]) {
    return {
      key,
      entry: {
        language: bookData.language,
        languageLabel: bookData.languageLabel,
        sourceNote: bookData.sourceNote,
        words: bookData.verses[verseKey].map(normalizeOriginalWord)
      }
    };
  }

  const seed = window.ORIGINAL_LANGUAGE_SEED_DATA || {};
  if (seed[key]) {
    return {
      key,
      entry: {
        ...seed[key],
        words: (seed[key].words || []).map(normalizeOriginalWord)
      }
    };
  }

  return { key, entry: null };
}

function renderOriginalLexiconDetails(word, lexiconEntry) {
  if (!lexiconEntry) return '';
  const strongKey = normalizeStrongKey(word && word.strong);
  const lemma = getLexiconLemma(lexiconEntry, word) || '-';
  const englishMeanings = getShortEnglishMeanings(lexiconEntry);
  const englishMeaning = englishMeanings.length ? englishMeanings.join('; ') : '영어 의미 없음';
  const explanationParts = getLexiconExplanationParts(lexiconEntry);
  const source = lexiconEntry.source || '-';
  const isHebrew = strongKey.startsWith('H');

  return `
    <div class="original-lexicon-detail">
      <div class="original-lexicon-row">
        <strong>원형</strong>
        <span class="original-lexicon-lemma ${isHebrew ? 'rtl' : ''}" dir="${isHebrew ? 'rtl' : 'ltr'}">${escapeHtml(lemma)}</span>
      </div>
      <div class="original-lexicon-row">
        <strong>영어 의미</strong>
        <span>${escapeHtml(englishMeaning)}</span>
      </div>
      <div class="original-lexicon-row">
        <strong>출처</strong>
        <span>${escapeHtml(source)}</span>
      </div>
      ${explanationParts.length ? `
      <details class="original-lexicon-explanation">
        <summary>사전적 해설</summary>
        <div class="original-lexicon-explanation-content">
          ${explanationParts.map(part => `<p>${escapeHtml(part)}</p>`).join('')}
        </div>
      </details>
      ` : ''}
    </div>
  `;
}

function rememberBibleReaderForReturn() {
  const modal = document.getElementById('bible-reader-modal');
  const activeVerse = document.querySelector('.bible-verse-row.active');
  if (!modal || modal.classList.contains('hidden') || !activeVerse) return;

  bibleReaderRestoreState = {
    title: document.getElementById('bible-reader-title')?.textContent || '',
    html: document.getElementById('bible-text-container')?.innerHTML || '',
    ref: {
      book: activeVerse.dataset.book,
      chapter: activeVerse.dataset.chapter,
      verse: activeVerse.dataset.verse
    }
  };

  try {
    sessionStorage.setItem('bibleReaderRestoreState', JSON.stringify(bibleReaderRestoreState));
    sessionStorage.setItem('returnToBibleReader', '1');
  } catch (err) {
    console.warn('Unable to persist Bible reader state.', err);
  }
}

function restoreBibleReaderAfterReturn() {
  let restoreState = bibleReaderRestoreState;
  try {
    if (!restoreState && sessionStorage.getItem('returnToBibleReader') === '1') {
      restoreState = JSON.parse(sessionStorage.getItem('bibleReaderRestoreState') || 'null');
    }
  } catch (err) {
    restoreState = null;
  }
  if (!restoreState || !restoreState.html || !restoreState.ref) return;

  const landingPage = document.getElementById('landing-page');
  const dashboardPage = document.getElementById('dashboard-page');
  if (landingPage && dashboardPage) {
    landingPage.classList.remove('active');
    dashboardPage.classList.add('active');
  }

  const modal = document.getElementById('bible-reader-modal');
  const modalTitle = document.getElementById('bible-reader-title');
  const textContainer = document.getElementById('bible-text-container');
  const loading = modal ? modal.querySelector('.bible-loading') : null;
  const errorContainer = document.getElementById('bible-error-container');
  if (!modal || !textContainer) return;

  if (modalTitle && restoreState.title) modalTitle.textContent = restoreState.title;
  modal.classList.remove('hidden');
  if (loading) loading.classList.add('hidden');
  if (errorContainer) errorContainer.classList.add('hidden');
  textContainer.innerHTML = restoreState.html;
  textContainer.classList.remove('hidden');

  textContainer.querySelectorAll('.bible-verse-row').forEach(row => {
    row.addEventListener('click', () => {
      renderOriginalLanguagePanel(row.dataset.book, row.dataset.chapter, row.dataset.verse);
    });
  });

  renderOriginalLanguagePanel(restoreState.ref.book, restoreState.ref.chapter, restoreState.ref.verse);

  try {
    sessionStorage.removeItem('returnToBibleReader');
  } catch (err) {
    console.warn('Unable to clear Bible reader return flag.', err);
  }
}

async function renderOriginalLanguagePanel(bookName, chapter, verse) {
  const panel = document.getElementById('original-language-panel');
  if (!panel) return;

  const key = normalizeVerseRefKey(bookName, chapter, verse);
  document.querySelectorAll('.bible-verse-row').forEach(row => {
    const koreanText = row.querySelector('.bible-verse-text');
    const kjvText = row.querySelector('.bible-verse-kjv');
    if (koreanText && row.dataset.verseText) koreanText.textContent = row.dataset.verseText;
    if (kjvText && row.dataset.kjvText) kjvText.textContent = row.dataset.kjvText;
    row.classList.toggle('active', row.dataset.refKey === key);
  });

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="original-panel-loading">
      <div class="spinner"></div>
      <div>원어 데이터를 불러오고 있습니다...</div>
    </div>
  `;

  const result = await getOriginalLanguageEntry(bookName, chapter, verse);
  const entry = result.entry;

  if (!entry || !entry.words || entry.words.length === 0) {
    panel.innerHTML = `
      <div class="original-panel-header">
        <div>
          <div class="original-panel-kicker">원어 해설</div>
          <h4>${escapeHtml(key)}</h4>
        </div>
      </div>
      <div class="original-panel-missing">
        <strong>원어 데이터 없음</strong>
        <p>이 절의 원어 데이터가 아직 로드되지 않았습니다. 앱 폴더 안의 <code>original-data</code> 폴더가 함께 있는지 확인해주세요.</p>
        <span>구약은 히브리어 원어 데이터, 신약은 TRx/KJV1769x 기준 헬라어 데이터로 표시됩니다.</span>
      </div>
    `;
    return;
  }

  const languageLabel = entry.languageLabel || (entry.language === 'hebrew' ? '히브리어' : '헬라어');
  if (entry.language === 'hebrew') {
    await loadHebrewLexicon();
  } else if (entry.language === 'greek') {
    await loadGreekLexicon();
  }
  const kjv1769StrongBookData = await loadKjv1769StrongBookData(bookName);
  const kjvVerseData = kjv1769StrongBookData && kjv1769StrongBookData.verses
    ? (kjv1769StrongBookData.verses[`${Number(chapter)}:${Number(verse)}`] || null)
    : null;
  const kjvStrongItems = Array.isArray(kjvVerseData)
    ? kjvVerseData
    : (kjvVerseData && Array.isArray(kjvVerseData.words) ? kjvVerseData.words : []);
  const verseStrongOccurrences = {};
  const sentenceKjvPhrases = [];
  const wordCards = entry.words.map((word, index) => {
    const lexiconEntry = ['hebrew', 'greek'].includes(entry.language) ? getOriginalLexiconEntry(word) : null;
    const displayStrong = normalizeStrongKey(word.strong) || word.strong || '-';
    const normalizedStrong = normalizeStrongKey(word.strong);
    if (normalizedStrong) verseStrongOccurrences[normalizedStrong] = (verseStrongOccurrences[normalizedStrong] || 0) + 1;
    const alignmentWord = {
      ...word,
      strongOccurrence: Number(word.strongOccurrence) || verseStrongOccurrences[normalizedStrong] || 1
    };
    const pronunciation = ['hebrew', 'greek'].includes(entry.language)
      ? getLexiconPronunciationEn(lexiconEntry, word)
      : word.transliteration;
    const kjvMatch = getKjvAlignmentMatch(alignmentWord, kjvStrongItems);
    const kjvCandidates = getKjvAlignmentCandidates(alignmentWord, kjvStrongItems);
    const exactKjvPhrase = (kjvMatch && kjvMatch.phrase) || word.kjvText || kjvCandidates[0] || '';
    sentenceKjvPhrases[index] = exactKjvPhrase;
    return `
      <div class="original-word-card" tabindex="0">
        <div class="original-word-main">
          <span class="original-script ${entry.language === 'hebrew' ? 'rtl' : ''}" dir="${entry.language === 'hebrew' ? 'rtl' : 'ltr'}">${escapeHtml(word.original)}</span>
          <span class="original-word-head-right">
            ${renderStrongCodeLink(displayStrong)}
          </span>
        </div>
        <div class="original-word-meta">
          <span><strong>발음:</strong> ${escapeHtml(pronunciation || '-')}</span>
        </div>
        ${renderOriginalLexiconDetails(word, lexiconEntry)}
      </div>
    `;
  }).join('');
  const sentenceDirection = entry.language === 'hebrew' ? 'rtl' : 'ltr';
  const sentenceTokens = entry.words.map((word, index) => {
    const kjvPhrase = sentenceKjvPhrases[index] || '';
    const accessibleKjv = kjvPhrase || 'KJV 직접 대응 없음';
    return `
      <button type="button" class="original-sentence-token ${entry.language === 'hebrew' ? 'rtl' : ''}" data-word-index="${index}" aria-label="${escapeHtml(`${word.original}, KJV ${accessibleKjv}, 단어 해설 보기`)}">
        <span class="original-sentence-word" dir="${sentenceDirection}">${escapeHtml(word.original)}</span>
        <span class="original-sentence-english" dir="ltr" title="${escapeHtml(accessibleKjv)}">${escapeHtml(kjvPhrase || '—')}</span>
      </button>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="original-panel-header">
      <div>
        <div class="original-panel-kicker">${escapeHtml(languageLabel)} 해설</div>
        <h4>${escapeHtml(key)}</h4>
      </div>
      <span class="original-lang-badge">${escapeHtml(languageLabel)}</span>
    </div>

    <section class="original-sentence-section" aria-label="${escapeHtml(`${languageLabel} 원어 문장`)}">
      <div class="original-sentence-heading">
        <div class="original-sentence-label">원어 문장</div>
        <div class="original-sentence-source">KJV 1769 대응</div>
      </div>
      <div class="original-sentence-line ${entry.language === 'hebrew' ? 'rtl' : ''}" dir="${sentenceDirection}">
        ${sentenceTokens}
      </div>
    </section>

    <section class="original-panel-section">
      <div class="original-section-title"><span>1</span> 단어와 의미</div>
      <div class="original-word-list">${wordCards}</div>
    </section>

    <div class="original-source-note">${escapeHtml(entry.sourceNote || '원어 데이터 기반')}</div>
  `;

  const renderedWordCards = Array.from(panel.querySelectorAll('.original-word-card'));
  const renderedSentenceTokens = Array.from(panel.querySelectorAll('.original-sentence-token'));

  renderedWordCards.forEach((card, index) => {
    const activate = () => {
      renderedWordCards.forEach(item => item.classList.remove('linked'));
      renderedSentenceTokens.forEach(item => item.classList.remove('linked'));
      card.classList.add('linked');
      if (renderedSentenceTokens[index]) renderedSentenceTokens[index].classList.add('linked');
    };
    card.addEventListener('mouseenter', activate);
    card.addEventListener('focus', activate);
    card.addEventListener('click', activate);
  });

  renderedSentenceTokens.forEach((token, index) => {
    token.addEventListener('click', event => {
      event.stopPropagation();
      const card = renderedWordCards[index];
      if (!card) return;
      card.click();
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  panel.querySelectorAll('[data-strong-link="true"]').forEach(link => {
    link.addEventListener('click', () => {
      rememberBibleReaderForReturn();
    });
  });
}

// 한글 본문 구절 파싱 함수
function parseKoreanReference(korRef) {
  if (!korRef) return null;
  
  // 공백 및 물결표 정규화
  let clean = korRef.replace(/\s+/g, ' ').trim();
  
  // 긴 도서명부터 매칭
  const sortedKorBooks = [...BIBLE_BOOKS_ORDER].sort((a, b) => b.length - a.length);
  let foundKorBook = null;
  for (const korBook of sortedKorBooks) {
    if (clean.startsWith(korBook)) {
      foundKorBook = korBook;
      break;
    }
  }
  
  if (!foundKorBook) return null;
  
  const bookNum = getBookNumber(foundKorBook);
  if (!bookNum) return null;
  
  let rest = clean.substring(foundKorBook.length).trim();
  
  // Case 1: 절 범위가 포함된 경우 (콜론 ':' 이 있는 경우)
  // 예: "1:1 ~ 2:3", "33:12-33:16", "33:12-16"
  if (rest.includes(':')) {
    let parts = rest.replace(/~/g, '-').split('-').map(s => s.trim());
    let startCh, startVs, endCh, endVs;
    
    let startMatch = parts[0].match(/(\d+)\s*:\s*(\d+)/);
    if (startMatch) {
      startCh = parseInt(startMatch[1], 10);
      startVs = parseInt(startMatch[2], 10);
    }
    
    if (parts.length > 1) {
      let endMatch = parts[1].match(/(\d+)\s*:\s*(\d+)/);
      if (endMatch) {
        endCh = parseInt(endMatch[1], 10);
        endVs = parseInt(endMatch[2], 10);
      } else {
        let onlyVerseMatch = parts[1].match(/(\d+)/);
        if (onlyVerseMatch) {
          endCh = startCh;
          endVs = parseInt(onlyVerseMatch[1], 10);
        }
      }
    } else {
      endCh = startCh;
      endVs = startVs;
    }
    
    return {
      bookName: foundKorBook,
      bookNumber: bookNum,
      startCh,
      startVs,
      endCh,
      endVs
    };
  }
  
  // Case 2: 장 범위만 있는 경우 (콜론 ':' 이 없는 경우)
  // 예: "1장", "1-2장", "1장 ~ 3장"
  let cleanRest = rest.replace(/장/g, '').replace(/편/g, '').replace(/~/g, '-').trim();
  let parts = cleanRest.split('-').map(s => s.trim());
  let startCh = parseInt(parts[0], 10);
  let endCh = parts.length > 1 ? parseInt(parts[1], 10) : startCh;
  
  if (isNaN(startCh)) return null;
  
  return {
    bookName: foundKorBook,
    bookNumber: bookNum,
    startCh,
    startVs: undefined,
    endCh,
    endVs: undefined
  };
}

async function fetchBibleChapterPair(bookNumber, chapter, bookNameKOR) {
  const koreanUrl = `https://api.getbible.net/v2/korean/${bookNumber}/${chapter}.json`;

  const koreanPromise = fetch(koreanUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Korean API returned status ${res.status}`);
      return res.json();
    });

  const kjvPromise = loadKjv1769StrongBookData(bookNameKOR)
    .catch(err => {
      console.warn(`KJV1769 chapter unavailable: ${bookNameKOR} ${chapter}`, err);
      return null;
    });

  const [koreanData, kjvBookData] = await Promise.all([koreanPromise, kjvPromise]);
  const kjvVersesByNumber = {};
  if (kjvBookData && kjvBookData.verses) {
    Object.entries(kjvBookData.verses).forEach(([verseKey, verseData]) => {
      const [chapterKey, verseNumber] = verseKey.split(':').map(Number);
      if (chapterKey !== Number(chapter)) return;
      kjvVersesByNumber[verseNumber] = Array.isArray(verseData)
        ? verseData.map(item => item[1]).filter(Boolean).join(' ')
        : (verseData && verseData.text ? verseData.text : '');
    });
  }

  return {
    ...koreanData,
    __bookNameKOR: bookNameKOR,
    __chapter: chapter,
    __kjvVersesByNumber: kjvVersesByNumber
  };
}

// getBible API v2를 호출하여 성경 구절을 가져온 뒤 모달 창에 시각화
async function openBibleReader(title, passageData) {
  const modal = document.getElementById('bible-reader-modal');
  const modalTitle = document.getElementById('bible-reader-title');
  const loading = modal.querySelector('.bible-loading');
  const textContainer = document.getElementById('bible-text-container');
  const errorContainer = document.getElementById('bible-error-container');
  const originalPanel = document.getElementById('original-language-panel');
  
  // 모달 타이틀 설정
  modalTitle.innerHTML = `${title} <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted); margin-left: 0.5rem; vertical-align: middle;">(개역한글 · KJV)</span>`;
  
  // 모달을 표시하고 로딩 상태 시작
  modal.classList.remove('hidden');
  loading.classList.remove('hidden');
  textContainer.classList.add('hidden');
  errorContainer.classList.add('hidden');
  textContainer.innerHTML = '';
  if (originalPanel) {
    originalPanel.classList.add('hidden');
    originalPanel.innerHTML = '<div class="original-panel-empty">절을 선택하면 원어 해설이 열립니다.</div>';
  }
  
  try {
    const fetchPromises = [];
    let parsedRef = null;
    
    if (Array.isArray(passageData) && passageData.length > 0) {
      // 1. passageData가 배열인 경우 (구약/신약 범위 통독)
      passageData.forEach(item => {
        const bookNum = getBookNumber(item.book);
        if (bookNum) {
          fetchPromises.push(fetchBibleChapterPair(bookNum, item.chapter, item.book));
        }
      });
    } else {
      // 2. passageData가 제공되지 않거나 배열이 아닌 경우 (텍스트 레퍼런스 파싱)
      const refToParse = (typeof passageData === 'string') ? passageData : title;
      parsedRef = parseKoreanReference(refToParse);
      if (!parsedRef) {
        loading.classList.add('hidden');
        errorContainer.textContent = "본문 구절을 파싱할 수 없습니다. (지원되지 않는 형식)";
        errorContainer.classList.remove('hidden');
        return;
      }
      
      for (let ch = parsedRef.startCh; ch <= parsedRef.endCh; ch++) {
        fetchPromises.push(fetchBibleChapterPair(parsedRef.bookNumber, ch, parsedRef.bookName));
      }
    }
    
    if (fetchPromises.length === 0) {
      throw new Error("가져올 본문 구절이 없습니다.");
    }
    
    const chaptersData = await Promise.all(fetchPromises);
    
    loading.classList.add('hidden');
    
    let html = '';
    chaptersData.forEach(chapterData => {
      const chNum = Number(chapterData.__chapter || chapterData.chapter);
      const bookNameKOR = chapterData.__bookNameKOR || chapterData.book_name || (parsedRef ? parsedRef.bookName : '');
      
      let versesToShow = chapterData.verses || [];
      
      // 구절 범위가 지정된 경우 필터링 (텍스트 파싱을 거쳤고 startVs가 있을 때만)
      if (parsedRef && parsedRef.startVs !== undefined) {
        versesToShow = versesToShow.filter(v => {
          const vNum = v.verse;
          if (chNum === parsedRef.startCh && chNum === parsedRef.endCh) {
            return vNum >= parsedRef.startVs && vNum <= parsedRef.endVs;
          } else if (chNum === parsedRef.startCh) {
            return vNum >= parsedRef.startVs;
          } else if (chNum === parsedRef.endCh) {
            return vNum <= parsedRef.endVs;
          }
          return true;
        });
      }
      
      html += `<h4 style="color: var(--gold); font-size: 1.15rem; margin-top: 1.5rem; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.35rem; font-family: 'Noto Serif KR', serif; font-weight: 700;">${bookNameKOR} ${chNum}장</h4>`;
      
      if (versesToShow.length > 0) {
        versesToShow.forEach(v => {
          const refKey = normalizeVerseRefKey(bookNameKOR, chNum, v.verse);
          const kjvText = (chapterData.__kjvVersesByNumber || {})[Number(v.verse)] || '';
          const kjvLine = kjvText
            ? `<span class="bible-verse-kjv">${escapeHtml(kjvText)}</span>`
            : '';
          html += `
            <button class="bible-verse-row" data-book="${escapeHtml(bookNameKOR)}" data-chapter="${chNum}" data-verse="${v.verse}" data-ref-key="${escapeHtml(refKey)}" data-verse-text="${escapeHtml(v.text)}" data-kjv-text="${escapeHtml(kjvText)}">
              <span class="bible-verse-num">${v.verse}</span>
              <span class="bible-verse-lines">
                <span class="bible-verse-text">${escapeHtml(v.text)}</span>
                ${kjvLine}
              </span>
            </button>
          `;
        });
      } else {
        html += `<div style="color: var(--text-muted); padding: 0.5rem 0; font-size: 0.95rem;">본문 구절이 없습니다.</div>`;
      }
    });
    
    textContainer.innerHTML = html;
    textContainer.classList.remove('hidden');
    textContainer.querySelectorAll('.bible-verse-row').forEach(row => {
      row.addEventListener('click', () => {
        renderOriginalLanguagePanel(row.dataset.book, row.dataset.chapter, row.dataset.verse);
      });
    });
    
  } catch (err) {
    console.error("Error loading scripture: ", err);
    loading.classList.add('hidden');
    errorContainer.textContent = "본문을 불러오는 데 실패했습니다. 네트워크 연결을 확인하거나 나중에 다시 시도해주세요.";
    errorContainer.classList.remove('hidden');
  }
}

// 개인 일정 모달 팝업 추가/삭제/렌더링 기능 추가
function setupModalEventActions() {
  const btnClose = document.getElementById('btn-close-event-modal');
  const btnAdd = document.getElementById('btn-modal-add-event');
  const inputEvent = document.getElementById('input-modal-event-text');
  const modalOverlay = document.getElementById('event-manager-modal');
  const btnOpenModal = document.getElementById('btn-open-add-event-modal');
  
  if (btnClose) {
    btnClose.addEventListener('click', closeEventModal);
  }
  
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'event-manager-modal') {
        closeEventModal();
      }
    });
  }
  
  // 12가지 색상 선택 버튼들 이벤트 연결
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  if (btnAdd && inputEvent) {
    if (!btnAdd.dataset.listenerAdded) {
      btnAdd.addEventListener('click', addModalEvent);
      inputEvent.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addModalEvent();
        }
      });
      btnAdd.dataset.listenerAdded = "true";
    }
  }

  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      openEventModal(activeDateStr || getTodayStr());
    });
  }
}

function openEventModal(dateStr) {
  const modal = document.getElementById('event-manager-modal');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  // 시작일, 종료일 기본값으로 선택된 날짜 지정
  const startDateInput = document.getElementById('input-modal-start-date');
  const endDateInput = document.getElementById('input-modal-end-date');
  if (startDateInput) startDateInput.value = dateStr;
  if (endDateInput) endDateInput.value = dateStr;

  // 기본 색상을 골드(gold)로 활성화
  const defaultColorDot = document.querySelector('.color-dot[data-color="gold"]');
  if (defaultColorDot) {
    defaultColorDot.click();
  }
  
  renderEventModalList(dateStr);
  
  const inputEvent = document.getElementById('input-modal-event-text');
  if (inputEvent) {
    inputEvent.value = '';
    inputEvent.focus();
  }
}

function closeEventModal() {
  const modal = document.getElementById('event-manager-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function renderEventModalList(dateStr) {
  const dateTitle = document.getElementById('event-modal-title');
  const listContainer = document.getElementById('event-modal-list');
  
  if (!dateTitle || !listContainer) return;
  
  const p = dateStr.split('-');
  const m = parseInt(p[1], 10);
  const d = parseInt(p[2], 10);
  
  dateTitle.textContent = `${m}월 ${d}일 일정 관리`;
  listContainer.innerHTML = '';
  
  // 해당 날짜 범위에 포함되는 일정들 필터링
  const dayEvents = getEventsForDate(dateStr);
  
  if (dayEvents.length === 0) {
    listContainer.innerHTML = `<div style="color: var(--text-dim); font-size: 0.9rem; text-align: center; padding: 1.5rem 0;">등록된 일정이 없습니다.</div>`;
    return;
  }
  
  dayEvents.forEach((evt) => {
    const item = document.createElement('div');
    const colorClass = evt.color ? `color-${evt.color}` : 'color-gold';
    item.className = `event-item ${colorClass}`;
    
    const isMultiDay = evt.startDate !== evt.endDate;
    const dateRangeInfo = isMultiDay ? `<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">(${evt.startDate} ~ ${evt.endDate})</span>` : '';
    
    item.innerHTML = `
      <span><strong>${escapeHtml(evt.title)}</strong>${dateRangeInfo}</span>
      <button class="btn-delete-event" title="삭제">&times;</button>
    `;
    
    item.querySelector('.btn-delete-event').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteModalEvent(evt.id);
    });
    
    listContainer.appendChild(item);
  });
}

function addModalEvent() {
  const inputEvent = document.getElementById('input-modal-event-text');
  const startDateInput = document.getElementById('input-modal-start-date');
  const endDateInput = document.getElementById('input-modal-end-date');
  const activeColorDot = document.querySelector('.color-dot.active');
  
  if (!inputEvent || !startDateInput || !endDateInput) return;
  
  const text = inputEvent.value.trim();
  if (!text) return;
  
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;
  if (!startDate || !endDate) return;
  
  if (startDate > endDate) {
    alert("시작일은 종료일보다 이전 날짜여야 합니다.");
    return;
  }
  
  const color = activeColorDot ? activeColorDot.getAttribute('data-color') : 'gold';
  
  if (!appState.events) {
    appState.events = [];
  }
  
  appState.events.push({
    id: makeEventId(),
    title: text,
    startDate: startDate,
    endDate: endDate,
    color: color
  });
  
  saveAppState();
  
  inputEvent.value = '';
  
  // 모달 목록 및 캘린더 갱신
  renderEventModalList(activeDateStr);
  renderDashboard();
}

function deleteModalEvent(eventId) {
  if (appState.events) {
    appState.events = appState.events.filter(e => e.id !== eventId);
    saveAppState();
    
    // 모달 목록 및 캘린더 갱신
    renderEventModalList(activeDateStr);
    renderDashboard();
  }
}

// 달력 하단 선택된 날짜 상세 일정 렌더링
function renderSelectedDateEvents() {
  const titleEl = document.getElementById('selected-date-events-title');
  const listEl = document.getElementById('selected-date-events-list');
  if (!titleEl || !listEl) return;
  
  const targetDate = activeDateStr || getTodayStr();
  const p = targetDate.split('-');
  const m = parseInt(p[1], 10);
  const d = parseInt(p[2], 10);
  
  titleEl.textContent = `📅 ${m}월 ${d}일 상세 일정`;
  listEl.innerHTML = '';
  
  const dayEvents = getEventsForDate(targetDate);
  
  if (dayEvents.length === 0) {
    listEl.innerHTML = `<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.25rem 0;">등록된 일정이 없습니다. (달력 날짜를 클릭하여 일정 추가 가능)</div>`;
    return;
  }
  
  dayEvents.forEach(evt => {
    const div = document.createElement('div');
    const colorClass = evt.color ? `color-${evt.color}` : 'color-gold';
    div.className = `event-item ${colorClass}`;
    
    const isMultiDay = evt.startDate !== evt.endDate;
    const dateRangeInfo = isMultiDay ? `<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">(${evt.startDate} ~ ${evt.endDate})</span>` : '';
    
    div.innerHTML = `
      <div style="flex: 1;">
        <span style="font-weight: 500;">${escapeHtml(evt.title)}</span>${dateRangeInfo}
      </div>
    `;
    listEl.appendChild(div);
  });
}
