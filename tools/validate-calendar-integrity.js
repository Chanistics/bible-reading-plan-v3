#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const context = {
  window: { addEventListener() {} },
  console,
  Date,
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null },
  document: { getElementById: () => ({ addEventListener() {} }) }
};
vm.createContext(context);

function load(filename) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'), context, { filename });
}

function sundayBefore(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().split('T')[0];
}

function dayDifference(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

function expandMegillah(reading) {
  if (!reading) return [];
  const match = reading.match(/^(.+?)\s+(\d+)(?:-(\d+))?장$/);
  assert(match, `Unparseable Megillah reading: ${reading}`);
  const [, book, start, end = start] = match;
  const chapters = [];
  for (let chapter = Number(start); chapter <= Number(end); chapter++) {
    chapters.push(`${book} ${chapter}`);
  }
  return chapters;
}

function getHebrewMonthAndDay(dateStr) {
  const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).formatToParts(new Date(`${dateStr}T00:00:00Z`));
  return {
    day: Number(parts.find(part => part.type === 'day').value),
    month: parts.find(part => part.type === 'month').value
  };
}

function getHolidayRule(name) {
  context.window.TEST_HOLIDAY_NAME = name;
  return vm.runInContext('getBiblicalHolidayRule(window.TEST_HOLIDAY_NAME)', context);
}

function convertTorahReading(reading) {
  context.window.TEST_TORAH_READING = reading;
  return vm.runInContext('convertHebcalTorahReading(window.TEST_TORAH_READING)', context);
}

function main() {
  ['bible-data.js', 'parasha-data.js', 'parasha-details.js', 'calendar-data.js', 'hebcal.js', 'generator.js', 'app.js']
    .forEach(load);

  const years = context.window.BUNDLED_HEBCAL_DATA.years;
  assert.strictEqual(context.window.BUNDLED_HEBCAL_DATA.calendarStandard, 'israel', 'Bundled calendar must use Israel observance');
  const allEvents = Object.values(years).flat();
  assert(!allEvents.some(item => /^(?:Pesach VIII|Shavuot II|Simchat Torah)$/.test(item.title)), 'Diaspora-only festival days must not be bundled');
  const anchors = Object.entries(years)
    .map(([gregorianYear, items]) => {
      const bereshit = items.find(item => item.category === 'parashat' && item.title === 'Parashat Bereshit');
      return bereshit ? {
        hYear: Number(gregorianYear) + 3761,
        start: sundayBefore(bereshit.date)
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start));

  assert.strictEqual(anchors.length, 5, 'Five Bereshit anchors are required for four complete offline cycles');

  const holidayDateRules = {
    'Rosh Hashana': ({ month, day }) => month === 'Tishri' && (day === 1 || day === 2),
    'Yom Kippur': ({ month, day }) => month === 'Tishri' && day === 10,
    'Sukkot': ({ month, day }) => month === 'Tishri' && day >= 15 && day <= 21,
    'Shmini Atzeret / Simchat Torah': ({ month, day }) => month === 'Tishri' && day === 22,
    'Purim': ({ month, day }) => /^Adar(?: II)?$/.test(month) && day === 14,
    'Pesach Sheni': ({ month, day }) => month === 'Iyar' && day === 14,
    'Pesach': ({ month, day }) => month === 'Nisan' && day >= 15 && day <= 21,
    'Shavuot': ({ month, day }) => month === 'Sivan' && day === 6
  };

  allEvents.filter(item => item.category === 'holiday').forEach(item => {
    const rule = getHolidayRule(item.title);
    if (!rule) return;
    assert(holidayDateRules[rule.key], `Unexpected visible holiday category: ${rule.key}`);
    assert(
      holidayDateRules[rule.key](getHebrewMonthAndDay(item.date)),
      `${item.title} is displayed on an invalid Hebrew calendar date: ${item.date}`
    );
  });

  ['Rosh Hashana LaBehemot', 'Erev Purim', 'Purim Katan', 'Shushan Purim', 'Shushan Purim Katan', 'Purim Meshulash']
    .forEach(name => assert.strictEqual(getHolidayRule(name), null, `${name} must not appear as a main festival`));

  const expectedOt = Array.from(context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.OT_OTHER_BOOKS));
  const expectedNt = Array.from(context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.NT_BOOKS));
  const expectedMegillot = new Set(context.window.BIBLE_DATA.MEGILLOT_BOOKS.flatMap(book =>
    Array.from({ length: book.chapters }, (_, index) => `${book.name} ${index + 1}`)
  ));
  const requiredCycleHolidayCategories = new Set(
    Object.keys(holidayDateRules).filter(key => key !== 'Shmini Atzeret / Simchat Torah')
  );
  const cycleReports = [];

  for (let index = 0; index < anchors.length - 1; index++) {
    const { hYear, start } = anchors[index];
    const end = anchors[index + 1].start;
    const totalDays = dayDifference(start, end);
    const plan = context.window.Generator.generateHebrewYearPlan(allEvents, start, totalDays);
    const dates = Object.keys(plan).sort();

    assert.strictEqual(totalDays % 7, 0, `${hYear}: cycle must contain complete Sunday-Saturday weeks`);
    assert.strictEqual(new Date(`${start}T00:00:00Z`).getUTCDay(), 0, `${hYear}: cycle must start on Sunday`);
    assert.strictEqual(new Date(`${dates[dates.length - 1]}T00:00:00Z`).getUTCDay(), 6, `${hYear}: cycle must end on Saturday`);

    dates.forEach((dateStr, dayIndex) => {
      const expectedDate = new Date(new Date(`${start}T00:00:00Z`).getTime() + dayIndex * 86400000)
        .toISOString().split('T')[0];
      assert.strictEqual(dateStr, expectedDate, `${hYear}: dates must be contiguous`);
      assert.strictEqual(plan[dateStr].date, dateStr, `${hYear}: embedded date mismatch`);
      assert.strictEqual(plan[dateStr].dayOfWeek, new Date(`${dateStr}T00:00:00Z`).getUTCDay(), `${hYear}: weekday mismatch`);
    });

    const chapterKey = reading => `${reading.book} ${reading.chapter}`;
    const actualOt = dates.flatMap(date => plan[date].ot);
    assert.deepStrictEqual(actualOt.map(chapterKey).sort(), expectedOt.map(chapterKey).sort(), `${hYear}: OT chapters must occur exactly once`);
    const isSequential = reading => !['요나', '오바댜'].includes(reading.book);
    assert.deepStrictEqual(actualOt.filter(isSequential), expectedOt.filter(isSequential), `${hYear}: remaining OT sequence mismatch`);
    assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].nt)), expectedNt, `${hYear}: NT sequence mismatch`);

    const jonahDates = dates.filter(date => plan[date].ot.some(reading => reading.book === '요나'));
    const obadiahDates = dates.filter(date => plan[date].ot.some(reading => reading.book === '오바댜'));
    const yomKippurDates = allEvents.filter(item => plan[item.date] && item.category === 'holiday' && item.title === 'Yom Kippur').map(item => item.date);
    const vayishlachDates = allEvents.filter(item => plan[item.date] && item.category === 'parashat' && item.title === 'Parashat Vayishlach').map(item => item.date);
    assert.strictEqual(jonahDates.length, 1, `${hYear}: Jonah must be read in full on one day`);
    assert.strictEqual(obadiahDates.length, 1, `${hYear}: Obadiah must be read on one day`);
    assert.deepStrictEqual(jonahDates, yomKippurDates, `${hYear}: Jonah belongs on Yom Kippur itself`);
    assert.deepStrictEqual(obadiahDates, vayishlachDates, `${hYear}: Obadiah belongs on Vayishlach Saturday`);
    assert.deepStrictEqual(Array.from(plan[jonahDates[0]].ot.filter(reading => reading.book === '요나'), reading => reading.chapter), [1, 2, 3, 4]);
    assert.strictEqual(plan[obadiahDates[0]].dayOfWeek, 6);

    const megillot = dates.flatMap(date => expandMegillah(plan[date].megillah));
    assert.strictEqual(megillot.length, expectedMegillot.size, `${hYear}: Megillot chapters must occur exactly once`);
    assert.deepStrictEqual(Array.from(new Set(megillot)).sort(), Array.from(expectedMegillot).sort(), `${hYear}: Megillot coverage mismatch`);

    const holidayCategories = new Set(dates.flatMap(date => plan[date].holidays)
      .map(holiday => getHolidayRule(holiday.name))
      .filter(Boolean)
      .map(rule => rule.key));
    requiredCycleHolidayCategories.forEach(key => {
      assert(holidayCategories.has(key), `${hYear}: missing main festival category ${key}`);
    });
    holidayCategories.forEach(key => assert(holidayDateRules[key], `${hYear}: unexpected festival category ${key}`));

    let parashaWeeks = 0;
    let specialWeeks = 0;
    for (let saturdayIndex = 6; saturdayIndex < dates.length; saturdayIndex += 7) {
      const saturday = dates[saturdayIndex];
      const source = allEvents.find(item => item.category === 'parashat' && item.date === saturday);
      const weekDates = dates.slice(saturdayIndex - 6, saturdayIndex + 1);
      if (!source) {
        specialWeeks++;
        weekDates.forEach(date => assert.strictEqual(plan[date].torah, null, `${hYear}: unexpected Torah portion on holiday week`));
        continue;
      }

      parashaWeeks++;
      const parashaName = source.title.replace(/^Parashat\s+|^Parashas\s+/i, '');
      weekDates.forEach((date, dayIndex) => {
        assert.strictEqual(plan[date].parasha, parashaName, `${hYear}: parasha name propagation mismatch`);
        assert.strictEqual(
          plan[date].torah,
          convertTorahReading(source.leyning[String(dayIndex + 1)] || null),
          `${hYear}: aliyah mismatch on ${date}`
        );
      });
    }

    const completionDates = dates.filter(date => plan[date].torahCompletion);
    const completionHolidayDates = dates.filter(date => plan[date].holidays.some(holiday =>
      /^(?:shmini atzeret(?: \/ simchat torah)?|simchat torah)$/i.test(holiday.name)
    ));
    const lastTorahDate = dates.filter(date => plan[date].torah).pop();
    const eligibleCompletionDate = completionHolidayDates.find(date => date >= lastTorahDate);
    assert.deepStrictEqual(completionDates, [eligibleCompletionDate || dates[dates.length - 1]], `${hYear}: complete Torah exactly once after the last aliyah`);
    assert.strictEqual(plan[completionDates[0]].torahCompletion, 'Deuteronomy 33:1-34:12');
    assert.strictEqual(
      dates.filter(date => !plan[date].torah && !plan[date].torahCompletion && !plan[date].megillah && !plan[date].ot.length && !plan[date].nt.length).length,
      0,
      `${hYear}: plan must not contain an empty reading day`
    );

    cycleReports.push(`${hYear}: ${totalDays} days, Jonah ${jonahDates[0]}, Obadiah ${obadiahDates[0]}, Torah completion ${completionDates[0]}${eligibleCompletionDate ? '' : ' (cycle-end reading)'}, ${parashaWeeks} parasha weeks, ${specialWeeks} holiday weeks`);
  }

  console.log(`Calendar integrity checks passed for ${cycleReports.length} complete offline cycles.`);
  cycleReports.forEach(report => console.log(`- ${report}`));
  console.log('Verified Israel festival dates, source aliyot, one Torah completion, 39 Megillot chapters, 698 sequential OT chapters + 5 special-book chapters, and 260 NT chapters per cycle.');
}

main();
