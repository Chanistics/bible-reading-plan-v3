const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'original-data');
const KJV_DIR = path.join(DATA_DIR, 'kjv1769-strong');
const SOURCE_DB = process.argv[2] || '/private/tmp/ub_trx/TRx.bible';

const NT_BOOKS = [
  [40, 'Mat', '마태복음', '마', 'Mat.js', 'Matt.js', 'Matt'],
  [41, 'Mrk', '마가복음', '막', 'Mrk.js', 'Mark.js', 'Mark'],
  [42, 'Luk', '누가복음', '눅', 'Luk.js', 'Luke.js', 'Luke'],
  [43, 'Jhn', '요한복음', '요', 'Jhn.js', 'John.js', 'John'],
  [44, 'Act', '사도행전', '행', 'Act.js', 'Acts.js', 'Acts'],
  [45, 'Rom', '로마서', '롬', 'Rom.js', 'Rom.js', 'Rom'],
  [46, '1Co', '고린도전서', '고전', '1Co.js', '1Cor.js', '1Cor'],
  [47, '2Co', '고린도후서', '고후', '2Co.js', '2Cor.js', '2Cor'],
  [48, 'Gal', '갈라디아서', '갈', 'Gal.js', 'Gal.js', 'Gal'],
  [49, 'Eph', '에베소서', '엡', 'Eph.js', 'Eph.js', 'Eph'],
  [50, 'Php', '빌립보서', '빌', 'Php.js', 'Phil.js', 'Phil'],
  [51, 'Col', '골로새서', '골', 'Col.js', 'Col.js', 'Col'],
  [52, '1Th', '데살로니가전서', '살전', '1Th.js', '1Thess.js', '1Thess'],
  [53, '2Th', '데살로니가후서', '살후', '2Th.js', '2Thess.js', '2Thess'],
  [54, '1Ti', '디모데전서', '딤전', '1Ti.js', '1Tim.js', '1Tim'],
  [55, '2Ti', '디모데후서', '딤후', '2Ti.js', '2Tim.js', '2Tim'],
  [56, 'Tit', '디도서', '딛', 'Tit.js', 'Titus.js', 'Titus'],
  [57, 'Phm', '빌레몬서', '몬', 'Phm.js', 'Phlm.js', 'Phlm'],
  [58, 'Heb', '히브리서', '히', 'Heb.js', 'Heb.js', 'Heb'],
  [59, 'Jas', '야고보서', '약', 'Jas.js', 'Jas.js', 'Jas'],
  [60, '1Pe', '베드로전서', '벧전', '1Pe.js', '1Pet.js', '1Pet'],
  [61, '2Pe', '베드로후서', '벧후', '2Pe.js', '2Pet.js', '2Pet'],
  [62, '1Jn', '요한일서', '요일', '1Jn.js', '1John.js', '1John'],
  [63, '2Jn', '요한이서', '요이', '2Jn.js', '2John.js', '2John'],
  [64, '3Jn', '요한삼서', '요삼', '3Jn.js', '3John.js', '3John'],
  [65, 'Jud', '유다서', '유', 'Jud.js', 'Jude.js', 'Jude'],
  [66, 'Rev', '요한계시록', '계', 'Rev.js', 'Rev.js', 'Rev']
];

const NT_BY_NUMBER = new Map(NT_BOOKS.map(book => [book[0], book]));

const GREEK_TRANSLITERATION = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'e', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'u', φ: 'ph', χ: 'ch', ψ: 'ps',
  ω: 'o'
};

function normalizeStrong(value) {
  const match = String(value || '').match(/^G0*(\d+)$/i);
  if (!match) return '';
  return `G${match[1].padStart(4, '0')}`;
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transliterateGreek(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .map(char => {
      const lower = char.toLowerCase();
      const mapped = GREEK_TRANSLITERATION[lower];
      if (!mapped) return /[a-z0-9\s-]/i.test(char) ? char : '';
      return char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTrxChapters() {
  const sql = 'select Book, Chapter, Scripture from Bible where Book between 40 and 66 order by Book, Chapter;';
  const output = execFileSync('sqlite3', ['-separator', '\t', SOURCE_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 220 * 1024 * 1024
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

function parseVerseHtml(verseHtml) {
  const verseNumber = Number((verseHtml.match(/<vid[^>]*>(\d+)<\/vid>/) || [])[1]);
  const words = [];
  const strongCounts = {};
  const chunks = Array.from(verseHtml.matchAll(/<wt>([\s\S]*?)(?=<wt>|<\/verse>)/g)).map(match => match[1]);

  chunks.forEach(chunk => {
    if (/<V[12]/.test(chunk.slice(0, 8))) return;
    const original = stripTags(chunk.split('<sup>')[0]);
    const strong = normalizeStrong((chunk.match(/lex\("(G\d+)"\)/) || [])[1]);
    if (!original || !strong) return;

    const rmac = chunk.match(/rmac\("([A-Z0-9-]+)\s+l="([^"]+)"/);
    const morph = rmac ? rmac[1] : '';
    const lemma = rmac ? rmac[2] : '';
    strongCounts[strong] = (strongCounts[strong] || 0) + 1;

    words.push({
      original,
      transliteration: transliterateGreek(original),
      meaningKo: '',
      gloss: '',
      strong,
      lemma,
      morph,
      morphKo: morph,
      strongOccurrence: strongCounts[strong]
    });
  });

  return verseNumber ? { verseNumber, words } : null;
}

function parseTrxChapter(row) {
  const verses = {};
  const verseMatches = Array.from(row.scripture.matchAll(/<verse>[\s\S]*?<\/verse>/g));
  verseMatches.forEach(match => {
    const parsed = parseVerseHtml(match[0]);
    if (parsed) verses[`${row.chapter}:${parsed.verseNumber}`] = parsed.words;
  });
  return verses;
}

function loadKjvBook(file, osis) {
  const fullPath = path.join(KJV_DIR, file);
  if (!fs.existsSync(fullPath)) return null;
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
  return context.window.KJV1769_STRONG_BOOKS && context.window.KJV1769_STRONG_BOOKS[osis];
}

function attachKjvPhrases(words, kjvVerse) {
  if (!kjvVerse || !Array.isArray(kjvVerse.words)) return words;
  const counts = {};
  const occurrenceMap = {};

  kjvVerse.words.forEach(item => {
    const strong = normalizeStrong(item[0]);
    if (!strong) return;
    counts[strong] = (counts[strong] || 0) + 1;
    occurrenceMap[`${strong}:${counts[strong]}`] = String(item[1] || '').trim();
  });

  return words.map(word => {
    const phrase = occurrenceMap[`${word.strong}:${word.strongOccurrence}`] || '';
    return {
      ...word,
      meaningKo: phrase,
      gloss: phrase,
      kjvText: phrase
    };
  });
}

function readIndex() {
  const indexPath = path.join(DATA_DIR, 'index.js');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(indexPath, 'utf8'), context, { filename: indexPath });
  return context.window.ORIGINAL_LANGUAGE_INDEX;
}

function writeIndex(index) {
  fs.writeFileSync(
    path.join(DATA_DIR, 'index.js'),
    `window.ORIGINAL_LANGUAGE_INDEX = ${JSON.stringify(index)};\n`,
    'utf8'
  );
}

function build() {
  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`Missing TRx SQLite database: ${SOURCE_DB}`);
  }

  const books = {};
  readTrxChapters().forEach(row => {
    const meta = NT_BY_NUMBER.get(row.book);
    if (!meta) return;
    const [, step, koName, abbr, file, kjvFile, kjvOsis] = meta;
    if (!books[step]) {
      books[step] = {
        step,
        book: koName,
        abbr,
        file,
        kjv: loadKjvBook(kjvFile, kjvOsis),
        verses: {}
      };
    }

    const parsedVerses = parseTrxChapter(row);
    Object.entries(parsedVerses).forEach(([verseKey, words]) => {
      books[step].verses[verseKey] = attachKjvPhrases(
        words,
        books[step].kjv && books[step].kjv.verses ? books[step].kjv.verses[verseKey] : null
      );
    });
  });

  const sourceNote = 'UniqueBible TRx.bible Textus Receptus/Stephanus 1550, Scrivener 1894 variants, Strong 번호, lemma, RMAC 형태분석 기반. KJV 매칭은 KJV1769x Strong occurrence 기준입니다.';
  Object.values(books).forEach(book => {
    fs.writeFileSync(
      path.join(DATA_DIR, book.file),
      `window.ORIGINAL_LANGUAGE_BOOKS = window.ORIGINAL_LANGUAGE_BOOKS || {};\nwindow.ORIGINAL_LANGUAGE_BOOKS[${JSON.stringify(book.step)}] = ${JSON.stringify({
        book: book.book,
        abbr: book.abbr,
        step: book.step,
        language: 'greek',
        languageLabel: '헬라어',
        sourceNote,
        verses: book.verses
      })};\n`,
      'utf8'
    );
  });

  const index = readIndex();
  Object.values(books).forEach(book => {
    index.books[book.book] = {
      file: book.file,
      step: book.step,
      abbr: book.abbr,
      language: 'greek',
      languageLabel: '헬라어',
      verseCount: Object.keys(book.verses).length,
      source: 'UniqueBible TRx.bible'
    };
  });
  index.version = 'mixed-stepbible-hebrew-trx-greek-v1';
  index.wordFields = ['original', 'transliteration', 'meaningKo', 'strong', 'lemma', 'morph', 'morphKo', 'gloss', 'kjvText', 'strongOccurrence'];
  writeIndex(index);

  console.log(`Wrote ${Object.keys(books).length} TRx Greek original-language book files`);
  console.log(`Verse entries: ${Object.values(books).reduce((sum, book) => sum + Object.keys(book.verses).length, 0)}`);
}

build();
