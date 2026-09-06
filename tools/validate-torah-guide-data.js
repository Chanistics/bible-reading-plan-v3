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
    /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)\s+(\d+):(\d+)-(?:((?:\d+)):)?(\d+)$/
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
      if (range.startVerse !== null) assert(range.startVerse > 0, `${stage.number}: invalid start verse`);
      if (range.endVerse !== null) assert(range.endVerse >= range.startVerse, `${stage.number}: invalid end verse`);
    });
  });

  assert.strictEqual(guide.stages[8].reference, '창세기 10-11장', 'Topic 9 must retain the PDF range');
  assert.strictEqual(guide.stages[69].reference, '출애굽기 25:10-22', 'Ark topic must have a concrete range');
  assert.strictEqual(guide.stages[117].reference, '민수기 22-24장', 'Balaam topic must have a concrete range');

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

  console.log('Torah guide data checks passed: 10 movements, 161 topics, valid Torah ranges, and full regular-parasha linkage.');
}

main();
