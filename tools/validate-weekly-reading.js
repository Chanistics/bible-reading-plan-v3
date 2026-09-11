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

const events = Object.values(context.window.BUNDLED_HEBCAL_DATA.years).flat();
const anchors = events.filter(event => event.title === 'Parashat Bereshit').map(event => {
  const date = new Date(`${event.date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
});
let daysChecked = 0;
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
    }
    daysChecked++;
  }

  const dates = Object.keys(plan).sort();
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

console.log(`Weekly checks passed: exact verse ranges for ${daysChecked} days across four cycles; full-week completion, undo, and cycle boundaries.`);
