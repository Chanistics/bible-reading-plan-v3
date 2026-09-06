#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const context = {
  window: {},
  console,
  fetch: async () => { throw new Error('Network access is disabled in this test'); },
  Date,
  setTimeout,
  clearTimeout
};
vm.createContext(context);

function load(filename, target = context) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'), target, { filename });
}

function sundayBefore(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().split('T')[0];
}

function dayDifference(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

function loadScriptPayload(filename, globalName) {
  const isolated = { window: {} };
  vm.createContext(isolated);
  load(filename, isolated);
  return isolated.window[globalName];
}

function collectReadingVerses(reading, verseSetsByEnglishBook) {
  if (!reading) return [];
  const match = reading.match(/^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)\s+(\d+):(\d+)-(\d+):(\d+)/);
  assert(match, `Unparseable Torah reading: ${reading}`);
  const [, book, startChapter, startVerse, endChapter, endVerse] = match;
  const available = verseSetsByEnglishBook[book];
  const startKey = `${Number(startChapter)}:${Number(startVerse)}`;
  const endKey = `${Number(endChapter)}:${Number(endVerse)}`;
  assert(available.has(startKey), `Invalid Torah start coordinate: ${book} ${startKey}`);
  assert(available.has(endKey), `Invalid Torah end coordinate: ${book} ${endKey}`);

  return Array.from(available).filter(key => {
    const [chapter, verse] = key.split(':').map(Number);
    const afterStart = chapter > Number(startChapter) || (chapter === Number(startChapter) && verse >= Number(startVerse));
    const beforeEnd = chapter < Number(endChapter) || (chapter === Number(endChapter) && verse <= Number(endVerse));
    return afterStart && beforeEnd;
  }).map(key => `${book} ${key}`);
}

function expandMegillah(reading) {
  if (!reading) return [];
  const match = reading.match(/^(.+?)\s+(\d+)(?:-(\d+))?장$/);
  assert(match, `Unparseable Megillah reading: ${reading}`);
  const [, book, start, end = start] = match;
  const chapters = [];
  for (let chapter = Number(start); chapter <= Number(end); chapter++) chapters.push(`${book} ${chapter}`);
  return chapters;
}

async function main() {
  ['bible-data.js', 'parasha-data.js', 'parasha-details.js', 'calendar-data.js', 'hebcal.js', 'generator.js']
    .forEach(filename => load(filename));

  const categories = [
    ...context.window.BIBLE_DATA.TORAH_BOOKS,
    ...context.window.BIBLE_DATA.MEGILLOT_BOOKS,
    ...context.window.BIBLE_DATA.OT_OTHER_BOOKS,
    ...context.window.BIBLE_DATA.NT_BOOKS
  ];
  assert.strictEqual(categories.length, 66, 'Reading-plan categories must contain 66 books');
  assert.strictEqual(new Set(categories.map(book => book.name)).size, 66, 'Reading-plan book names must be unique');
  assert.strictEqual(categories.reduce((sum, book) => sum + book.chapters, 0), 1189, 'Reading-plan categories must contain 1,189 chapters');

  const koreanIndex = loadScriptPayload('korean-data/index.js', 'KOREAN_BIBLE_INDEX');
  assert.strictEqual(Object.keys(koreanIndex.books).length, 66, 'Korean Bible index must contain 66 books');
  let koreanChapterCount = 0;
  let koreanVerseCount = 0;
  const koreanBooksByName = {};
  Object.values(koreanIndex.books).forEach(meta => {
    const books = loadScriptPayload(`korean-data/${meta.file}`, 'KOREAN_BIBLE_BOOKS');
    const book = books[Object.keys(books)[0]];
    koreanBooksByName[book.name] = book;
    const chapterNumbers = Object.keys(book.chapters).map(Number).sort((a, b) => a - b);
    assert.deepStrictEqual(chapterNumbers, Array.from({ length: meta.chapterCount }, (_, index) => index + 1), `${book.name}: chapter sequence`);
    chapterNumbers.forEach(chapter => {
      const verses = book.chapters[chapter];
      assert(verses.length > 0, `${book.name} ${chapter}: empty chapter`);
      assert.deepStrictEqual(Array.from(verses, row => row[0]), Array.from({ length: verses.length }, (_, index) => index + 1), `${book.name} ${chapter}: verse sequence`);
      koreanVerseCount += verses.length;
    });
    koreanChapterCount += chapterNumbers.length;
  });
  assert.strictEqual(koreanChapterCount, 1189, 'Korean Bible must contain 1,189 chapters');
  assert.strictEqual(koreanVerseCount, 31102, 'Korean Bible must contain 31,102 verses');
  const koreanNameAliases = { '요한1서': '요한일서', '요한2서': '요한이서', '요한3서': '요한삼서' };
  categories.forEach(book => {
    const koreanBook = koreanBooksByName[koreanNameAliases[book.name] || book.name];
    assert(koreanBook, `Korean Bible is missing ${book.name}`);
    assert.strictEqual(Object.keys(koreanBook.chapters).length, book.chapters, `${book.name}: declared chapter count`);
  });

  const kjvIndex = loadScriptPayload('original-data/kjv1769-strong/index.js', 'KJV1769_STRONG_INDEX');
  const englishTorahNames = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];
  const verseSetsByEnglishBook = {};
  const expectedTorahVerses = new Set();
  context.window.BIBLE_DATA.TORAH_BOOKS.forEach((book, index) => {
    const meta = kjvIndex.books[book.name];
    const books = loadScriptPayload(`original-data/kjv1769-strong/${meta.file}`, 'KJV1769_STRONG_BOOKS');
    const verseSet = new Set(Object.keys(books[meta.osis].verses));
    verseSetsByEnglishBook[englishTorahNames[index]] = verseSet;
    verseSet.forEach(key => expectedTorahVerses.add(`${englishTorahNames[index]} ${key}`));
  });
  assert.strictEqual(expectedTorahVerses.size, 5852, 'KJV Torah baseline must contain 5,852 verses');

  const calendarYears = context.window.BUNDLED_HEBCAL_DATA.years;
  const allEvents = Object.values(calendarYears).flat();
  const parashaNames = Array.from(new Set(
    allEvents.filter(event => event.category === 'parashat').map(event => event.title)
  ));
  parashaNames.forEach(name => {
    const meta = context.window.getParashaMeta(name);
    assert(meta.he, `${name}: missing Hebrew title`);
    assert(meta.meaning && meta.meaning !== '의미 정보 없음', `${name}: missing meaning`);
  });

  const starts = Object.values(calendarYears).map(items => items.find(event => event.title === 'Parashat Bereshit'))
    .filter(Boolean)
    .map(event => sundayBefore(event.date))
    .sort();
  assert.strictEqual(starts.length, 5, 'Bundled calendar must expose five Bereshit anchors');

  const expectedOt = Array.from(context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.OT_OTHER_BOOKS));
  const expectedNt = Array.from(context.window.BIBLE_DATA.flattenBooks(context.window.BIBLE_DATA.NT_BOOKS));
  const expectedMegillot = new Set(context.window.BIBLE_DATA.MEGILLOT_BOOKS.flatMap(book =>
    Array.from({ length: book.chapters }, (_, index) => `${book.name} ${index + 1}`)
  ));

  for (let index = 0; index < starts.length - 1; index++) {
    const start = starts[index];
    const end = starts[index + 1];
    const plan = context.window.Generator.generateHebrewYearPlan(allEvents, start, dayDifference(start, end));
    const dates = Object.keys(plan).sort();
    assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].ot)), expectedOt, `${start}: complete OT chapter distribution`);
    assert.deepStrictEqual(Array.from(dates.flatMap(date => plan[date].nt)), expectedNt, `${start}: complete NT chapter distribution`);

    const actualMegillot = new Set(dates.flatMap(date => expandMegillah(plan[date].megillah)));
    assert.deepStrictEqual(Array.from(actualMegillot).sort(), Array.from(expectedMegillot).sort(), `${start}: complete Five Megillot distribution`);

    const actualTorah = new Set();
    dates.forEach(date => {
      collectReadingVerses(plan[date].torah, verseSetsByEnglishBook).forEach(key => actualTorah.add(key));
      collectReadingVerses(plan[date].torahCompletion, verseSetsByEnglishBook).forEach(key => actualTorah.add(key));
    });
    assert.deepStrictEqual(Array.from(actualTorah).sort(), Array.from(expectedTorahVerses).sort(), `${start}: complete Torah verse distribution`);
  }

  console.log('Coverage checks passed: 66 books, 1,189 chapters, 31,102 Korean verses, all Torah/Megillot/OT/NT readings, and every bundled parasha meaning.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
