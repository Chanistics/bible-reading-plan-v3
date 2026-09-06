#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);

function load(filename) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'), context, { filename });
}

function rangeBounds(range) {
  return {
    start: range.startChapter * 1000 + (range.startVerse || 1),
    end: range.endChapter * 1000 + (range.endVerse || 999)
  };
}

function rangesOverlap(first, second) {
  if (first.book !== second.book) return false;
  const firstBounds = rangeBounds(first);
  const secondBounds = rangeBounds(second);
  return firstBounds.start <= secondBounds.end && secondBounds.start <= firstBounds.end;
}

function parseReading(reading) {
  const books = {
    Genesis: '창세기', Exodus: '출애굽기', Leviticus: '레위기',
    Numbers: '민수기', Deuteronomy: '신명기'
  };
  const match = String(reading || '').match(
    /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)\s+(\d+):(\d+)-(?:((?:\d+)):)?(\d+)/
  );
  if (!match) return null;
  return {
    book: books[match[1]],
    startChapter: Number(match[2]),
    startVerse: Number(match[3]),
    endChapter: Number(match[4] || match[2]),
    endVerse: Number(match[5])
  };
}

function main() {
  load('bible-data.js');
  load('torah-guide-data.js');
  load('calendar-data.js');
  load('generator.js');

  const guide = context.window.TORAH_GUIDE;
  assert(guide, 'TORAH_GUIDE must be available');
  assert.strictEqual(guide.calendarStandard, 'israel');
  assert.strictEqual(guide.movements.length, 10, 'The guide must contain 10 movements');
  assert.strictEqual(guide.stages.length, 161, 'The guide must contain exactly the 161 PDF topics');
  assert.deepStrictEqual(
    Array.from(guide.stages, stage => stage.number),
    Array.from({ length: 161 }, (_, index) => index + 1),
    'Topic numbering must be continuous from 1 to 161'
  );

  const books = new Map(context.window.BIBLE_DATA.TORAH_BOOKS.map(book => [book.name, book]));
  load('original-data/kjv1769-strong/index.js');
  const verseCoordinates = new Map();
  context.window.BIBLE_DATA.TORAH_BOOKS.forEach(book => {
    const meta = context.window.KJV1769_STRONG_INDEX.books[book.name];
    assert(meta, `${book.name}: missing KJV1769x index entry`);
    load(`original-data/kjv1769-strong/${meta.file}`);
    const payload = context.window.KJV1769_STRONG_BOOKS[meta.osis];
    verseCoordinates.set(book.name, new Set(Object.keys(payload.verses)));
  });
  const movementIds = new Set(guide.movements.map(movement => movement.id));
  guide.stages.forEach(stage => {
    assert(stage.id === `torah-${String(stage.number).padStart(3, '0')}`, `${stage.number}: invalid id`);
    assert(stage.title && stage.reference, `${stage.number}: title and reference are required`);
    assert(movementIds.has(stage.movementId), `${stage.number}: unknown movement`);
    assert(Array.isArray(stage.threads) && stage.threads.length > 0, `${stage.number}: threads are required`);
    assert(Array.isArray(stage.ranges) && stage.ranges.length > 0, `${stage.number}: ranges are required`);
    stage.ranges.forEach(range => {
      const book = books.get(range.book);
      assert(book, `${stage.number}: unknown Torah book ${range.book}`);
      assert(range.startChapter >= 1 && range.startChapter <= book.chapters, `${stage.number}: invalid start chapter`);
      assert(range.endChapter >= range.startChapter && range.endChapter <= book.chapters, `${stage.number}: invalid end chapter`);
      if (range.startVerse !== null) {
        assert(range.startVerse > 0, `${stage.number}: invalid start verse`);
        assert(
          verseCoordinates.get(range.book).has(`${range.startChapter}:${range.startVerse}`),
          `${stage.number}: start verse does not exist in KJV1769x`
        );
      }
      if (range.endVerse !== null) {
        assert(range.endVerse >= range.startVerse, `${stage.number}: invalid end verse`);
        assert(
          verseCoordinates.get(range.book).has(`${range.endChapter}:${range.endVerse}`),
          `${stage.number}: end verse does not exist in KJV1769x`
        );
      }
    });
  });

  assert.strictEqual(guide.stages[8].reference, '창세기 10-11장', 'Topic 9 must retain the PDF range');
  assert.strictEqual(guide.stages[69].reference, '출애굽기 25:10-22', 'Ark topic must have a concrete range');
  assert.strictEqual(guide.stages[117].reference, '민수기 22-24장', 'Balaam topic must have a concrete range');

  let totalTorahVerses = 0;
  let guideCoveredVerses = 0;
  verseCoordinates.forEach((coordinates, bookName) => {
    coordinates.forEach(coordinate => {
      const [chapter, verse] = coordinate.split(':').map(Number);
      const point = {
        book: bookName,
        startChapter: chapter,
        startVerse: verse,
        endChapter: chapter,
        endVerse: verse
      };
      totalTorahVerses++;
      if (guide.stages.some(stage => stage.ranges.some(range => rangesOverlap(range, point)))) {
        guideCoveredVerses++;
      }
    });
  });
  const directVerseCoverage = guideCoveredVerses / totalTorahVerses;
  assert(directVerseCoverage >= 0.9, 'The PDF topics must retain at least 90% direct Torah verse coverage');

  const allEvents = Object.values(context.window.BUNDLED_HEBCAL_DATA.years).flat();
  const uncoveredParashot = new Set();
  allEvents.filter(item => item.category === 'parashat' && item.leyning).forEach(item => {
    const ranges = Object.entries(item.leyning)
      .filter(([key]) => /^\d+$/.test(key))
      .map(([, reading]) => parseReading(reading))
      .filter(Boolean);
    if (!ranges.some(range => guide.stages.some(stage =>
      stage.ranges.some(stageRange => rangesOverlap(stageRange, range))
    ))) {
      uncoveredParashot.add(item.title);
    }
  });
  assert.deepStrictEqual(Array.from(uncoveredParashot), [], 'Every regular parasha must connect to at least one guide topic');

  const anchors = Object.entries(context.window.BUNDLED_HEBCAL_DATA.years)
    .map(([year, items]) => {
      const bereshit = items.find(item => item.category === 'parashat' && item.title === 'Parashat Bereshit');
      if (!bereshit) return null;
      const sunday = new Date(`${bereshit.date}T00:00:00Z`);
      sunday.setUTCDate(sunday.getUTCDate() - 6);
      return { year, start: sunday.toISOString().split('T')[0] };
    })
    .filter(Boolean)
    .sort((first, second) => first.start.localeCompare(second.start));
  const matchedStageNumbers = new Set();
  for (let index = 0; index < anchors.length - 1; index++) {
    const start = anchors[index].start;
    const end = anchors[index + 1].start;
    const totalDays = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
    const plan = context.window.Generator.generateHebrewYearPlan(allEvents, start, totalDays);
    Object.values(plan).forEach(day => {
      [day.torah, day.torahCompletion].filter(Boolean).forEach(reading => {
        const range = parseReading(reading);
        assert(range, `Every generated Torah reading must be guide-addressable: ${reading}`);
        guide.stages.forEach(stage => {
          if (stage.ranges.some(stageRange => rangesOverlap(stageRange, range))) {
            matchedStageNumbers.add(stage.number);
          }
        });
      });
    });
  }
  assert.deepStrictEqual(
    Array.from(guide.stages.filter(stage => !matchedStageNumbers.has(stage.number))),
    [],
    'Every guide topic must connect to at least one generated Torah reading, including Torah completion'
  );

  console.log(`Torah guide data checks passed: 10 movements, 161 topics, ${guideCoveredVerses}/${totalTorahVerses} directly covered verses, complete generated-reading parsing, and bidirectional linkage.`);
}

main();
