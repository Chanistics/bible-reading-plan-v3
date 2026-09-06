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
  assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].ot)), Array.from(expectedOt));
  assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].nt)), Array.from(expectedNt));

  console.log('Plan checks passed: offline calendar, 5787 dates, Torah aliyot, and full OT/NT distribution.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
