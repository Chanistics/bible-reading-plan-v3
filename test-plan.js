const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = {
  window: {},
  console,
  fetch: async () => { throw new Error('Network access is disabled in this test'); },
  Date,
  setTimeout,
  clearTimeout
};
vm.createContext(context);

function load(filename) {
  const file = path.join(__dirname, filename);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function sundayBefore(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().split('T')[0];
}

function dayDifference(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

async function main() {
  load('bible-data.js');
  load('parasha-data.js');
  load('calendar-data.js');
  load('hebcal.js');
  load('generator.js');

  const years = context.window.BUNDLED_HEBCAL_DATA.years;
  assert.deepStrictEqual(Object.keys(years), ['2025', '2026', '2027', '2028', '2029']);
  assert.strictEqual(
    years['2026'].find(item => item.title === 'Rosh Hashana 5787').date,
    '2026-09-12',
    'Rosh Hashana 5787 must begin in September'
  );

  const items2026 = await context.window.HebcalAPI.fetchHebcalYearData('2026');
  assert.strictEqual(items2026, years['2026'], 'bundled calendar must work without network access');

  const bereshit2026 = years['2026'].find(item => item.title === 'Parashat Bereshit');
  const bereshit2027 = years['2027'].find(item => item.title === 'Parashat Bereshit');
  const start = sundayBefore(bereshit2026.date);
  const nextStart = sundayBefore(bereshit2027.date);
  assert.strictEqual(start, '2026-10-04');

  const plan = context.window.Generator.generateHebrewYearPlan(
    [...years['2026'], ...years['2027']],
    start,
    dayDifference(start, nextStart)
  );
  const dates = Object.keys(plan).sort();
  assert.strictEqual(dates.length, 385);
  assert.strictEqual(dates[0], '2026-10-04');
  assert.strictEqual(plan['2026-10-04'].parasha, 'Bereshit');
  assert.strictEqual(plan['2026-10-04'].torah, bereshit2026.leyning['1']);
  assert.strictEqual(plan['2026-10-10'].torah, bereshit2026.leyning['7']);
  assert(!dates.some(date => plan[date].parasha === 'Shalom'), 'synthetic Shalom week must not exist');

  context.window.addEventListener = () => {};
  context.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  context.sessionStorage = { getItem: () => null };
  context.document = { getElementById: () => ({ addEventListener: () => {} }) };
  load('app.js');
  assert.strictEqual(
    vm.runInContext("getBiblicalHolidayName('Pesach Sheni')", context),
    '두 번째 유월절 (Pesach Sheni)',
    'Pesach Sheni must not be labeled as the regular Passover festival'
  );
  assert.strictEqual(
    vm.runInContext("getBiblicalHolidayName('Rosh Hashana LaBehemot')", context),
    null,
    'Rosh Hashana LaBehemot must not be labeled as the Feast of Trumpets'
  );
  ['Erev Purim', 'Purim Katan', 'Shushan Purim Katan', 'Purim Meshulash'].forEach(name => {
    context.window.TEST_HOLIDAY_NAME = name;
    assert.strictEqual(
      vm.runInContext('getBiblicalHolidayName(window.TEST_HOLIDAY_NAME)', context),
      null,
      `${name} must not be labeled as the main Purim festival`
    );
  });
  assert.strictEqual(context.window.Generator.getMegillahTypeForHolidayName('Pesach Sheni'), null);
  assert.strictEqual(context.window.Generator.getMegillahTypeForHolidayName('Purim Katan'), null);
  assert.strictEqual(context.window.Generator.getMegillahTypeForHolidayName('Pesach I'), 'Song');
  assert.strictEqual(context.window.Generator.getMegillahTypeForHolidayName('Purim'), 'Esth');
  context.window.TEST_CURRENT_PLAN = context.window.Generator.generateHebrewYearPlan(
    [...years['2025'], ...years['2026']],
    sundayBefore(years['2025'].find(item => item.title === 'Parashat Bereshit').date),
    dayDifference(sundayBefore(years['2025'].find(item => item.title === 'Parashat Bereshit').date), start)
  );
  vm.runInContext('currentPlan = window.TEST_CURRENT_PLAN;', context);
  assert.strictEqual(
    vm.runInContext("getCalendarDayPlan('2026-10-04').parasha", context),
    'Bereshit',
    'dashboard calendar must cross from the 5786 plan into the bundled 5787 cycle'
  );

  const expectedOt = context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.OT_OTHER_BOOKS);
  const expectedNt = context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.NT_BOOKS);
  const chapterKey = reading => `${reading.book} ${reading.chapter}`;
  assert.deepStrictEqual(dates.flatMap(date => plan[date].ot).map(chapterKey).sort(), Array.from(expectedOt, chapterKey).sort());
  assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].nt)), Array.from(expectedNt));

  assert.deepStrictEqual(Array.from(plan['2027-10-11'].ot, chapterKey), ['요나 1', '요나 2', '요나 3', '요나 4']);
  assert(plan['2026-11-28'].ot.some(reading => chapterKey(reading) === '오바댜 1'));
  assert.strictEqual(plan['2026-11-28'].parasha, 'Vayishlach');
  assert.throws(() => context.window.Generator.generateHebrewYearPlan(
    [...years['2026'], ...years['2027']].filter(item => item.title !== 'Yom Kippur'),
    start,
    dayDifference(start, nextStart)
  ), /Jonah: expected one annual reading date/, 'Missing holiday data must not silently omit or misplace Jonah');

  context.window.TEST_PREVIOUS_PLAN = {
    '2026-01-01': { ot: [{ book: '요나', chapter: 1 }, { book: '요나', chapter: 2 }] },
    '2026-01-02': { ot: [{ book: '요나', chapter: 3 }, { book: '요나', chapter: 4 }, { book: '미가', chapter: 1 }] },
    '2026-01-03': { ot: [{ book: '열왕기하', chapter: 18 }] },
    '2026-01-04': { ot: [{ book: '오바댜', chapter: 1 }] },
    '2026-09-21': { ot: [] },
    '2026-10-03': { ot: [], torahCompletion: 'Deuteronomy 33:1-34:12' },
    '2025-10-14': { ot: [], torahCompletion: 'Deuteronomy 33:1-34:12' }
  };
  context.window.TEST_REVISED_PLAN = {
    '2026-01-01': { ot: [] },
    '2026-01-02': { ot: [{ book: '미가', chapter: 1 }] },
    '2026-01-03': { ot: [{ book: '열왕기하', chapter: 18 }, { book: '오바댜', chapter: 1 }] },
    '2026-01-04': { ot: [] },
    '2026-09-21': { ot: [1, 2, 3, 4].map(chapter => ({ book: '요나', chapter })) },
    '2026-10-03': { ot: [], torahCompletion: 'Deuteronomy 33:1-34:12' },
    '2025-10-14': { ot: [] }
  };
  const migrated = vm.runInContext(`
    appState = createDefaultAppState();
    appState.progress = {
      '2026-01-01': { ot: true, torah: true },
      '2026-01-02': { ot: true },
      '2026-01-03': { ot: true },
      '2026-09-21': { nt: true },
      '2025-10-14': { torahCompletion: true }
    };
    const migrationSourceProgress = JSON.parse(JSON.stringify(appState.progress));
    migrateProgressToUpdatedPlan('5786', window.TEST_REVISED_PLAN, JSON.stringify(window.TEST_PREVIOUS_PLAN), migrationSourceProgress);
    JSON.parse(JSON.stringify(appState.progress));
  `, context);
  assert.strictEqual(migrated['2026-09-21'].ot, true, 'Completed Jonah chapters must follow their new date');
  assert.strictEqual(migrated['2026-09-21'].nt, true, 'NT progress must survive migration');
  assert.strictEqual(migrated['2026-01-01'].torah, true, 'Torah progress must survive migration');
  assert.strictEqual(migrated['2026-01-01'].ot, undefined, 'Removed readings must not retain stale progress');
  assert.strictEqual(migrated['2026-01-02'].ot, true, 'Remaining completed chapters must stay completed');
  assert.strictEqual(migrated['2026-01-03'].ot, undefined, 'An added unread Obadiah must not inherit a completed checkbox');
  assert.strictEqual(migrated['2025-10-14'].torahCompletion, undefined, 'Removed duplicate completion must not retain its checkbox');
  assert.strictEqual(migrated['2026-10-03'].torahCompletion, true, 'Previously completed Torah ending must remain completed');
  assert(vm.runInContext("memoryStorage.has('parashat_progress_before_v13_5786')", context), 'Original progress must be backed up');
  vm.runInContext(`
    appState.progress['2026-09-21'].ot = false;
    migrateProgressToUpdatedPlan('5786', window.TEST_REVISED_PLAN, JSON.stringify(window.TEST_PREVIOUS_PLAN), migrationSourceProgress);
  `, context);
  assert.strictEqual(vm.runInContext("appState.progress['2026-09-21'].ot", context), false, 'Migration must not overwrite later user edits');

  console.log('Plan checks passed: offline calendar, special book dates, complete OT/NT distribution, and progress migration.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
