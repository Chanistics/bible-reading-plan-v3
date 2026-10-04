const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
  window: { addEventListener() {} }, console, Date, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null },
  document: { getElementById: () => ({ addEventListener() {} }) }
};
vm.createContext(context);
const load = (file, target = context) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), target, { filename: file });
['bible-data.js', 'parasha-data.js', 'parasha-details.js', 'calendar-data.js', 'generator.js', 'app.js'].forEach(file => load(file));

const korean = { window: {} };
vm.createContext(korean);
load('korean-data/index.js', korean);
Object.values(korean.window.KOREAN_BIBLE_INDEX.books).forEach(meta => load(`korean-data/${meta.file}`, korean));
const bookNames = { '요한1서': '요한일서', '요한2서': '요한이서', '요한3서': '요한삼서' };
const books = Object.fromEntries(Object.values(korean.window.KOREAN_BIBLE_BOOKS).map(book => [book.name, book]));
const englishTorah = { Genesis: '창세기', Exodus: '출애굽기', Leviticus: '레위기', Numbers: '민수기', Deuteronomy: '신명기' };

context.window.BIBLE_DATA.TORAH_BOOKS.forEach(book => {
  const expected = Object.values(books[book.name].chapters).map(rows => Math.max(...rows.map(row => row[0])));
  assert.deepStrictEqual(Array.from(book.verseCounts), expected, `${book.name}: range boundaries must match bundled KRV`);
});

function chapterVerses(book, chapter, start = 1, end = Infinity) {
  const rows = books[bookNames[book] || book]?.chapters[chapter];
  assert(rows, `Unknown weekly chapter: ${book} ${chapter}`);
  assert(rows.some(row => row[0] === start), `Invalid start: ${book} ${chapter}:${start}`);
  if (end !== Infinity) assert(rows.some(row => row[0] === end), `Invalid end: ${book} ${chapter}:${end}`);
  return Array.from(rows).filter(([verse]) => verse >= start && verse <= end).map(([verse]) => `${book} ${chapter}:${verse}`);
}

function expectedReading(reading) {
  if (!reading) return [];
  if (Array.isArray(reading)) return Array.from(reading).flatMap(item => chapterVerses(item.book, item.chapter));
  const torah = reading.match(/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy) (\d+):(\d+)-(\d+):(\d+)(?: \|.*)?$/);
  if (torah) {
    const [, book, startCh, startVs, endCh, endVs] = torah;
    const verses = [];
    for (let ch = Number(startCh); ch <= Number(endCh); ch++) {
      verses.push(...chapterVerses(englishTorah[book], ch, ch === Number(startCh) ? Number(startVs) : 1, ch === Number(endCh) ? Number(endVs) : Infinity));
    }
    return verses;
  }
  const chapters = reading.match(/^(.+?) (\d+)(?:-(\d+))?장$/);
  assert(chapters, `Unknown reading: ${reading}`);
  const [, book, start, end = start] = chapters;
  const verses = [];
  for (let ch = Number(start); ch <= Number(end); ch++) verses.push(...chapterVerses(book, ch));
  return verses;
}

function displayedRangeVerses(text) {
  if (!text.includes(':')) return expectedReading(text);
  const match = text.match(/^(.+?) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  assert(match, `Invalid displayed range: ${text}`);
  const [, book, startCh, startVs, endCh = startCh, endVs = startVs] = match;
  const verses = [];
  for (let ch = Number(startCh); ch <= Number(endCh); ch++) {
    verses.push(...chapterVerses(book, ch, ch === Number(startCh) ? Number(startVs) : 1, ch === Number(endCh) ? Number(endVs) : Infinity));
  }
  return verses;
}

function readerPassageVerses(passage) {
  if (Array.isArray(passage)) return expectedReading(passage);
  const ref = context.parseKoreanReference(passage);
  assert(ref, `Invalid reader passage: ${passage}`);
  const verses = [];
  for (let chapter = ref.startCh; chapter <= ref.endCh; chapter++) {
    verses.push(...chapterVerses(ref.bookName, chapter, chapter === ref.startCh ? ref.startVs ?? 1 : 1, chapter === ref.endCh ? ref.endVs ?? Infinity : Infinity));
  }
  return verses;
}

function verifyWeeklyRanges(dates, plan) {
  const groups = context.getWeeklyReadingRanges(dates, plan);
  for (const field of ['torah', 'torahCompletion', 'megillah', 'ot', 'nt']) {
    const expected = [...new Set(dates.flatMap(date => expectedReading(plan[date][field])))].sort();
    const group = groups.find(item => item.type === field);
    const actual = group ? Array.from(group.ranges).flatMap(range => displayedRangeVerses(context.formatWeeklyReadingRange(range))) : [];
    assert.deepStrictEqual(actual.sort(), expected, `${dates[0]}: displayed weekly ${field} must match assigned verses with no gaps filled or duplicates`);
  }
}

const events = Object.values(context.window.BUNDLED_HEBCAL_DATA.years).flat();
const anchors = events.filter(event => event.title === 'Parashat Bereshit').map(event => {
  const date = new Date(`${event.date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
});
let daysChecked = 0;
let weeksChecked = 0;
for (let index = 0; index < anchors.length - 1; index++) {
  const plan = context.window.Generator.generateHebrewYearPlan(events, anchors[index], (new Date(anchors[index + 1]) - new Date(anchors[index])) / 86400000);
  context.window.TEST_PLAN = plan;
  vm.runInContext('currentPlan = window.TEST_PLAN;', context);
  for (const [date, day] of Object.entries(plan)) {
    const groups = context.getWeeklyReadingGroups(date, plan);
    for (const field of ['torah', 'torahCompletion', 'megillah', 'ot', 'nt']) {
      const group = groups.find(item => item.type === field);
      const actual = group ? Array.from(group.chapters).flatMap(range => chapterVerses(range.book, range.chapter, range.startVerse, range.endVerse ?? Infinity)) : [];
      assert.deepStrictEqual(actual, expectedReading(day[field]), `${date}: weekly ${field} must match the assigned verses exactly`);
      if (group) assert.deepStrictEqual(readerPassageVerses(group.passageData), actual, `${date}: clicking ${field} must open only its assigned passage`);
    }
    daysChecked++;
  }

  const dates = Object.keys(plan).sort();
  for (let offset = 0; offset < dates.length; offset += 7) {
    verifyWeeklyRanges(dates.slice(offset, offset + 7), plan);
    weeksChecked++;
  }
  context.window.TEST_WEEK_DATE = dates[3];
  context.window.TEST_OUTSIDE_DATE = dates[7];
  vm.runInContext(`
    appState = createDefaultAppState();
    appState.progress[window.TEST_OUTSIDE_DATE] = { torah: true };
    setWeekCompletion(window.TEST_WEEK_DATE, true);
  `, context);
  assert.strictEqual(vm.runInContext('getWeekSummary(window.TEST_WEEK_DATE).completedDays', context), 7);
  assert.strictEqual(vm.runInContext('getWeekSummary(window.TEST_WEEK_DATE).percentage', context), 100);
  vm.runInContext('setWeekCompletion(window.TEST_WEEK_DATE, false);', context);
  assert.strictEqual(vm.runInContext('getWeekSummary(window.TEST_WEEK_DATE).completedDays', context), 0);
  assert.strictEqual(vm.runInContext('appState.progress[window.TEST_OUTSIDE_DATE].torah', context), true, 'Other weeks must be untouched');

  context.window.TEST_LAST_DATE = dates[dates.length - 1];
  vm.runInContext('setWeekCompletion(window.TEST_LAST_DATE, true);', context);
  assert.strictEqual(vm.runInContext('getWeekSummary(window.TEST_LAST_DATE).completedDays', context), 7, 'Final-week completion must include Megillot and Torah completion');
  assert(Object.keys(vm.runInContext('appState.progress', context)).every(date => plan[date]), 'Week completion must stay within cycle bounds');
}

const gapPlan = {
  a: { torah: 'Genesis 1:1-1:5', ot: [{ book: '요나', chapter: 1 }] },
  b: { torah: 'Genesis 1:7-1:10', ot: [{ book: '요나', chapter: 3 }] },
  c: { torah: 'Genesis 1:10-1:15' }
};
verifyWeeklyRanges(Object.keys(gapPlan), gapPlan);
assert.strictEqual(context.getWeeklyReadingRanges(Object.keys(gapPlan), gapPlan)[0].ranges.length, 2, 'Do not bridge an unread verse');
assert.strictEqual(context.getWeeklyReadingRanges(Object.keys(gapPlan), gapPlan)[1].ranges.length, 2, 'Do not bridge an unread chapter');
assert.strictEqual(context.getWeeklyReadingRanges([], gapPlan).length, 0);

const index = context.buildBundledCalendarPlanIndex();
context.window.BASE_PLAN = Object.fromEntries(Object.entries(index).filter(([date]) => date >= anchors[1] && date < anchors[2]));
vm.runInContext(`
  currentPlan = window.BASE_PLAN;
  weeklyBasePlan = null;
  appState = createDefaultAppState();
  getTodayStr = () => '${anchors[1]}';
`, context);
let calendarWeeks = 0;
for (const date of Object.keys(index).filter(date => new Date(date).getUTCDay() === 3)) {
  assert(context.selectCalendarWeek(date));
  const summary = context.getWeekSummary(date);
  assert.strictEqual(summary.totalDays, 7, `${date}: calendar entry must include the complete week`);
  assert.strictEqual(vm.runInContext('activeDateStr', context), summary.dates[0]);
  assert.deepStrictEqual(Array.from(summary.dates), Array.from(context.getWeekDates(date)));
  context.restoreWeeklyBasePlan();
  assert.strictEqual(vm.runInContext('currentPlan', context), context.window.BASE_PLAN, 'Historical navigation must not replace the active annual cycle');
  calendarWeeks++;
}

const controls = new Map();
const control = id => {
  if (!controls.has(id)) controls.set(id, {
    handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; },
    focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; }
  });
  return controls.get(id);
};
context.document.getElementById = control;
context.document.querySelectorAll = () => [];
context.document.querySelector = selector => selector === '.tab-item[data-tab="weekly"]'
  ? { click: () => vm.runInContext("appState.activeTab = 'weekly';", context) } : null;
vm.runInContext('renderDashboard = () => {};', context);
context.setupScheduleViewActions();
const previousDate = anchors[0];
context.openCalendarWeek(previousDate);
assert.strictEqual(vm.runInContext('appState.activeTab', context), 'weekly');
assert(control('weekly-parasha-title').focused && control('tab-content-weekly').scrolled);
assert.strictEqual(vm.runInContext('weeklyBasePlan', context), context.window.BASE_PLAN);
control('btn-week-complete').handlers.click();
assert.strictEqual(context.getWeekSummary(previousDate).completedDays, 7, 'The actual weekly completion action must complete the opened historical week');
assert(context.getWeekDates(previousDate).every(date => context.isDayCompleted(index[date], vm.runInContext(`appState.progress['${date}']`, context))));
assert.strictEqual(context.calculateStats(context.window.BASE_PLAN).completedDays, 0, 'Current annual progress must exclude historical completions');
context.setDayCompletion(anchors[1], true);
assert.strictEqual(context.calculateStats(context.window.BASE_PLAN).completedDays, 1, 'Today can still be completed while another cycle is open');
context.setDayCompletion(anchors[1], false);
control('btn-week-complete').handlers.click();
assert.strictEqual(context.getWeekSummary(previousDate).completedDays, 0);
control('btn-week-today').handlers.click();
assert.strictEqual(vm.runInContext('currentPlan', context), context.window.BASE_PLAN);
assert.strictEqual(vm.runInContext('activeDateStr', context), anchors[1]);

const outside = '2040-01-01';
assert.strictEqual(context.selectCalendarWeek(outside), false);
assert.strictEqual(vm.runInContext('currentPlan', context), context.window.BASE_PLAN);
assert.strictEqual(vm.runInContext('activeDateStr', context), anchors[1]);

console.log(`Weekly checks passed: ${daysChecked} daily ranges, ${weeksChecked} weekly summaries, ${calendarWeeks} calendar-to-week selections; historical-week completion/undo, return to today, gaps and cycle boundaries.`);
