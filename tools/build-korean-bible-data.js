#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'korean-data');
const SOURCE_URL = 'https://api.getbible.net/v2/korean.json';

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

async function main() {
  const sourcePath = process.argv[2];
  const sourceText = sourcePath
    ? fs.readFileSync(path.resolve(sourcePath), 'utf8')
    : await download(SOURCE_URL);
  const source = JSON.parse(sourceText);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = {
    version: 'getbible-korean-2.0.1-local-v1',
    source: 'GetBible Korean Revised Version 1952/1961 from Wikisource',
    license: 'Public Domain',
    books: {}
  };
  let chapterCount = 0;
  let verseCount = 0;

  (source.books || []).forEach(book => {
    const bookNumber = Number(book.nr);
    const chapters = {};
    (book.chapters || []).forEach(chapter => {
      const chapterNumber = Number(chapter.chapter);
      chapters[chapterNumber] = (chapter.verses || []).map(verse => [Number(verse.verse), String(verse.text || '')]);
      chapterCount += 1;
      verseCount += chapters[chapterNumber].length;
    });
    const payload = { number: bookNumber, name: book.name, chapters };
    const filename = `${bookNumber}.js`;
    fs.writeFileSync(
      path.join(OUT_DIR, filename),
      `window.KOREAN_BIBLE_BOOKS = window.KOREAN_BIBLE_BOOKS || {};\nwindow.KOREAN_BIBLE_BOOKS[${bookNumber}] = ${JSON.stringify(payload)};\n`,
      'utf8'
    );
    index.books[bookNumber] = { file: filename, name: book.name, chapterCount: Object.keys(chapters).length };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.js'),
    `window.KOREAN_BIBLE_INDEX = ${JSON.stringify(index)};\n`,
    'utf8'
  );
  if (Object.keys(index.books).length !== 66 || chapterCount !== 1189 || verseCount < 31000) {
    throw new Error(`Unexpected Korean Bible coverage: ${Object.keys(index.books).length} books, ${chapterCount} chapters, ${verseCount} verses`);
  }
  console.log(JSON.stringify({ books: 66, chapterCount, verseCount }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
