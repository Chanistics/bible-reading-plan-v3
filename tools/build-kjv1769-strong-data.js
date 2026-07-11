const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'original-data', 'kjv1769-strong');
const SOURCE_DB = process.argv[2] || '/private/tmp/ub_kjv1769x/KJV1769x.bible';

const BOOKS = [
  ['Gen', '창세기', 'Gen.js'], ['Exod', '출애굽기', 'Exod.js'], ['Lev', '레위기', 'Lev.js'], ['Num', '민수기', 'Num.js'], ['Deut', '신명기', 'Deut.js'],
  ['Josh', '여호수아', 'Josh.js'], ['Judg', '사사기', 'Judg.js'], ['Ruth', '룻기', 'Ruth.js'], ['1Sam', '사무엘상', '1Sam.js'], ['2Sam', '사무엘하', '2Sam.js'],
  ['1Kgs', '열왕기상', '1Kgs.js'], ['2Kgs', '열왕기하', '2Kgs.js'], ['1Chr', '역대상', '1Chr.js'], ['2Chr', '역대하', '2Chr.js'],
  ['Ezra', '에스라', 'Ezra.js'], ['Neh', '느헤미야', 'Neh.js'], ['Esth', '에스더', 'Esth.js'], ['Job', '욥기', 'Job.js'], ['Ps', '시편', 'Ps.js'],
  ['Prov', '잠언', 'Prov.js'], ['Eccl', '전도서', 'Eccl.js'], ['Song', '아가', 'Song.js'], ['Isa', '이사야', 'Isa.js'], ['Jer', '예레미야', 'Jer.js'],
  ['Lam', '예레미야애가', 'Lam.js'], ['Ezek', '에스겔', 'Ezek.js'], ['Dan', '다니엘', 'Dan.js'], ['Hos', '호세아', 'Hos.js'], ['Joel', '요엘', 'Joel.js'],
  ['Amos', '아모스', 'Amos.js'], ['Obad', '오바댜', 'Obad.js'], ['Jonah', '요나', 'Jonah.js'], ['Mic', '미가', 'Mic.js'], ['Nah', '나훔', 'Nah.js'],
  ['Hab', '하박국', 'Hab.js'], ['Zeph', '스바냐', 'Zeph.js'], ['Hag', '학개', 'Hag.js'], ['Zech', '스가랴', 'Zech.js'], ['Mal', '말라기', 'Mal.js'],
  ['Matt', '마태복음', 'Matt.js'], ['Mark', '마가복음', 'Mark.js'], ['Luke', '누가복음', 'Luke.js'], ['John', '요한복음', 'John.js'], ['Acts', '사도행전', 'Acts.js'],
  ['Rom', '로마서', 'Rom.js'], ['1Cor', '고린도전서', '1Cor.js'], ['2Cor', '고린도후서', '2Cor.js'], ['Gal', '갈라디아서', 'Gal.js'],
  ['Eph', '에베소서', 'Eph.js'], ['Phil', '빌립보서', 'Phil.js'], ['Col', '골로새서', 'Col.js'], ['1Thess', '데살로니가전서', '1Thess.js'],
  ['2Thess', '데살로니가후서', '2Thess.js'], ['1Tim', '디모데전서', '1Tim.js'], ['2Tim', '디모데후서', '2Tim.js'], ['Titus', '디도서', 'Titus.js'],
  ['Phlm', '빌레몬서', 'Phlm.js'], ['Heb', '히브리서', 'Heb.js'], ['Jas', '야고보서', 'Jas.js'], ['1Pet', '베드로전서', '1Pet.js'],
  ['2Pet', '베드로후서', '2Pet.js'], ['1John', '요한일서', '1John.js'], ['2John', '요한이서', '2John.js'],
  ['3John', '요한삼서', '3John.js'], ['Jude', '유다서', 'Jude.js'], ['Rev', '요한계시록', 'Rev.js']
];

const BOOK_BY_NUMBER = new Map(BOOKS.map((book, index) => [index + 1, book]));
const STRUCTURAL_STRONGS = new Set(['H0853']);

function normalizeStrong(value) {
  const match = String(value || '').match(/^([HG])0*(\d+)$/i);
  if (!match) return '';
  return `${match[1].toUpperCase()}${match[2].padStart(4, '0')}`;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function formatKjvText(value) {
  return decodeHtml(String(value || '')
    .replace(/<mbn>[\s\S]*?<\/mbn>/gi, ' ')
    .replace(/<vid[^>]*>[\s\S]*?<\/vid>/gi, ' ')
    .replace(/<sup>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPhrase(tokens) {
  return formatKjvText(tokens.join(' '))
    .replace(/^[,.;:!?)]\s*/, '')
    .trim();
}

function parseStrongWords(verseHtml) {
  const scripture = String(verseHtml || '')
    .replace(/<mbn>[\s\S]*?<\/mbn>/gi, ' ')
    .replace(/<vid[^>]*>[\s\S]*?<\/vid>/gi, ' ');
  const words = [];
  let cursor = 0;
  let group = 0;

  Array.from(scripture.matchAll(/<sup>([\s\S]*?)<\/sup>/gi)).forEach(match => {
    const phrase = cleanPhrase([scripture.slice(cursor, match.index).replace(/<[^>]+>/g, ' ')]);
    const strongs = Array.from(match[1].matchAll(/lex\("([HG]\d+)"\)/gi))
      .map(ref => normalizeStrong(ref[1]))
      .filter(Boolean);
    group += 1;
    strongs.forEach((strong, index) => {
      words.push([strong, index > 0 && STRUCTURAL_STRONGS.has(strong) ? '' : phrase, group]);
    });
    cursor = match.index + match[0].length;
  });

  return words;
}

function attachPhraseOffsets(text, words) {
  let cursor = 0;
  let previousGroup = -1;
  let previousStart = -1;
  let previousEnd = -1;
  const lowerText = String(text || '').toLowerCase();
  return words.map(item => {
    const [strong, phrase, group] = item;
    if (!phrase) return [strong, phrase, -1, -1];
    if (group === previousGroup) return [strong, phrase, previousStart, previousEnd];
    const start = lowerText.indexOf(String(phrase).toLowerCase(), cursor);
    if (start < 0) return [strong, phrase, -1, -1];
    const end = start + phrase.length;
    cursor = end;
    previousGroup = group;
    previousStart = start;
    previousEnd = end;
    return [strong, phrase, start, end];
  });
}

function readChapters() {
  const sql = 'select Book, Chapter, Scripture from Bible order by Book, Chapter;';
  const output = execFileSync('sqlite3', ['-separator', '\t', SOURCE_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 120 * 1024 * 1024
  });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const [book, chapter, ...rest] = line.split('\t');
      return {
        book: Number(book),
        chapter: Number(chapter),
        scripture: rest.join('\t')
      };
    });
}

function build() {
  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`Missing KJV1769x SQLite database: ${SOURCE_DB}`);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const books = {};
  readChapters().forEach(row => {
    const meta = BOOK_BY_NUMBER.get(row.book);
    if (!meta) return;
    const [osis, koName, file] = meta;
    if (!books[osis]) books[osis] = { osis, book: koName, file, verses: {} };

    Array.from(row.scripture.matchAll(/<verse>[\s\S]*?<\/verse>/gi)).forEach(match => {
      const verse = Number((match[0].match(/<vid[^>]*>(\d+)<\/vid>/i) || [])[1]);
      if (!verse) return;
      const text = formatKjvText(match[0]);
      books[osis].verses[`${row.chapter}:${verse}`] = {
        text,
        words: attachPhraseOffsets(text, parseStrongWords(match[0]))
      };
    });
  });

  const indexBooks = {};
  Object.values(books).forEach(book => {
    fs.writeFileSync(
      path.join(OUT_DIR, book.file),
      `window.KJV1769_STRONG_BOOKS = window.KJV1769_STRONG_BOOKS || {};\nwindow.KJV1769_STRONG_BOOKS[${JSON.stringify(book.osis)}] = ${JSON.stringify({
        osis: book.osis,
        book: book.book,
        verses: book.verses
      })};\n`,
      'utf8'
    );
    indexBooks[book.book] = {
      osis: book.osis,
      file: book.file,
      verseCount: Object.keys(book.verses).length
    };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.js'),
    `window.KJV1769_STRONG_INDEX = ${JSON.stringify({
      version: 'uniquebible-kjv1769x-bible-table-v2',
      source: 'UniqueBible_Bibles KJV1769x.bible, King James Version of 1611/1769 with Strong numbers',
      fieldMap: {
        text: 'KJV display text parsed from clean verse boundaries in the KJV1769x Bible table',
        words: ['strong', 'kjvText', 'startOffset', 'endOffset']
      },
      books: indexBooks
    })};\n`,
    'utf8'
  );

  console.log(`Wrote ${Object.keys(books).length} KJV1769 Strong book files to ${OUT_DIR}`);
  console.log(`Verse entries: ${Object.values(books).reduce((sum, book) => sum + Object.keys(book.verses).length, 0)}`);
}

build();
