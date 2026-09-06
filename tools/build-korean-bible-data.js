#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'korean-data');
const SOURCE_URL = 'https://raw.githubusercontent.com/bluesaurel/Korean-Bible-1961-KRV/65cdce887b141581b45097163b4b224de4a332fa/bible_1961_krv.json';

const BOOKS = [
  ['Genesis', '창세기'], ['Exodus', '출애굽기'], ['Leviticus', '레위기'], ['Numbers', '민수기'], ['Deuteronomy', '신명기'],
  ['Joshua', '여호수아'], ['Judges', '사사기'], ['Ruth', '룻기'], ['1Samuel', '사무엘상'], ['2Samuel', '사무엘하'],
  ['1Kings', '열왕기상'], ['2Kings', '열왕기하'], ['1Chronicles', '역대상'], ['2Chronicles', '역대하'], ['Ezra', '에스라'],
  ['Nehemiah', '느헤미야'], ['Esther', '에스더'], ['Job', '욥기'], ['Psalms', '시편'], ['Proverbs', '잠언'],
  ['Ecclesiastes', '전도서'], ['SongofSolomon', '아가'], ['Isaiah', '이사야'], ['Jeremiah', '예레미야'], ['Lamentations', '예레미야 애가'],
  ['Ezekiel', '에스겔'], ['Daniel', '다니엘'], ['Hosea', '호세아'], ['Joel', '요엘'], ['Amos', '아모스'],
  ['Obadiah', '오바댜'], ['Jonah', '요나'], ['Micah', '미가'], ['Nahum', '나훔'], ['Habakkuk', '하박국'],
  ['Zephaniah', '스바냐'], ['Haggai', '학개'], ['Zechariah', '스가랴'], ['Malachi', '말라기'], ['Matthew', '마태복음'],
  ['Mark', '마가복음'], ['Luke', '누가복음'], ['John', '요한복음'], ['Acts', '사도행전'], ['Romans', '로마서'],
  ['1Corinthians', '고린도전서'], ['2Corinthians', '고린도후서'], ['Galatians', '갈라디아서'], ['Ephesians', '에베소서'], ['Philippians', '빌립보서'],
  ['Colossians', '골로새서'], ['1Thessalonians', '데살로니가전서'], ['2Thessalonians', '데살로니가후서'], ['1Timothy', '디모데전서'], ['2Timothy', '디모데후서'],
  ['Titus', '디도서'], ['Philemon', '빌레몬서'], ['Hebrews', '히브리서'], ['James', '야고보서'], ['1Peter', '베드로전서'],
  ['2Peter', '베드로후서'], ['1John', '요한일서'], ['2John', '요한이서'], ['3John', '요한삼서'], ['Jude', '유다서'],
  ['Revelation', '요한계시록']
];

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(response.headers.location).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        response.resume();
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function assertSequential(items, label, field) {
  items.forEach((item, index) => {
    if (Number(item[field]) !== index + 1) {
      throw new Error(`${label}: expected ${field} ${index + 1}, received ${item[field]}`);
    }
  });
}

async function main() {
  const sourcePath = process.argv[2];
  const sourceText = sourcePath
    ? fs.readFileSync(path.resolve(sourcePath), 'utf8')
    : await download(SOURCE_URL);
  const source = JSON.parse(sourceText);
  if (!Array.isArray(source)) throw new Error('Expected the KRV source to be an array of books');

  const sourceBooks = Object.fromEntries(source.map(book => [book.book, book]));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outputIndex = {
    version: 'korean-bible-1961-krv-65cdce8-local-v2',
    source: 'Korean-Bible-1961-KRV, 1961 Korean Revised Version',
    sourceUrl: 'https://github.com/bluesaurel/Korean-Bible-1961-KRV',
    attribution: '대한성서공회 성경전서 개역한글판',
    license: 'Public Domain; preserve attribution and textual integrity',
    books: {}
  };
  let chapterCount = 0;
  let verseCount = 0;

  BOOKS.forEach(([sourceName, koreanName], indexPosition) => {
    const bookNumber = indexPosition + 1;
    const book = sourceBooks[sourceName];
    if (!book || !Array.isArray(book.chapters)) throw new Error(`Missing source book: ${sourceName}`);
    assertSequential(book.chapters, sourceName, 'chapter');

    const chapters = {};
    book.chapters.forEach(chapter => {
      if (!Array.isArray(chapter.verses) || chapter.verses.length === 0) {
        throw new Error(`${sourceName} ${chapter.chapter}: no verses`);
      }
      assertSequential(chapter.verses, `${sourceName} ${chapter.chapter}`, 'verse');
      chapters[chapter.chapter] = chapter.verses.map(verse => [Number(verse.verse), String(verse.text || '')]);
      chapterCount += 1;
      verseCount += chapter.verses.length;
    });

    const payload = { number: bookNumber, name: koreanName, chapters };
    const filename = `${bookNumber}.js`;
    fs.writeFileSync(
      path.join(OUT_DIR, filename),
      `window.KOREAN_BIBLE_BOOKS = window.KOREAN_BIBLE_BOOKS || {};\nwindow.KOREAN_BIBLE_BOOKS[${bookNumber}] = ${JSON.stringify(payload)};\n`,
      'utf8'
    );
    outputIndex.books[bookNumber] = { file: filename, name: koreanName, chapterCount: book.chapters.length };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.js'),
    `window.KOREAN_BIBLE_INDEX = ${JSON.stringify(outputIndex)};\n`,
    'utf8'
  );
  if (Object.keys(outputIndex.books).length !== 66 || chapterCount !== 1189 || verseCount !== 31102) {
    throw new Error(`Unexpected Korean Bible coverage: ${Object.keys(outputIndex.books).length} books, ${chapterCount} chapters, ${verseCount} verses`);
  }
  console.log(JSON.stringify({ books: 66, chapterCount, verseCount }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
