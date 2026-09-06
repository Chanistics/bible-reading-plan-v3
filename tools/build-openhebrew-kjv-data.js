#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'original-data');
const DEFAULT_SOURCE_DIR = '/private/tmp/open-hebrew-audit';
const SOURCE_DIR = path.resolve(process.argv[2] || DEFAULT_SOURCE_DIR);
const INTERLINEAR_ZIP = path.join(SOURCE_DIR, '007-BHS-8-layer-interlinear', 'BHSA-8-layer-interlinear.csv.zip');
const INTERLINEAR_FILE = 'BHSA-8-layer-interlinear.csv';
const KJV_MAPPING_FILE = path.join(SOURCE_DIR, '008-BHS-mapping-KJV', 'KJV-OT-mapped-to-BHS.csv');
const KJV_VERSIFICATION_FILE = path.join(
  SOURCE_DIR,
  '001-aligning-BHS-WLC',
  'supporting-files',
  'BHSA_versification_KJV_23145.csv'
);

const BOOKS = [
  null,
  ['창세기', '창', 'Gen', 'Gen.js'],
  ['출애굽기', '출', 'Exo', 'Exo.js'],
  ['레위기', '레', 'Lev', 'Lev.js'],
  ['민수기', '민', 'Num', 'Num.js'],
  ['신명기', '신', 'Deu', 'Deu.js'],
  ['여호수아', '수', 'Jos', 'Jos.js'],
  ['사사기', '삿', 'Jdg', 'Jdg.js'],
  ['룻기', '룻', 'Rut', 'Rut.js'],
  ['사무엘상', '삼상', '1Sa', '1Sa.js'],
  ['사무엘하', '삼하', '2Sa', '2Sa.js'],
  ['열왕기상', '왕상', '1Ki', '1Ki.js'],
  ['열왕기하', '왕하', '2Ki', '2Ki.js'],
  ['역대상', '대상', '1Ch', '1Ch.js'],
  ['역대하', '대하', '2Ch', '2Ch.js'],
  ['에스라', '스', 'Ezr', 'Ezr.js'],
  ['느헤미야', '느', 'Neh', 'Neh.js'],
  ['에스더', '에', 'Est', 'Est.js'],
  ['욥기', '욥', 'Job', 'Job.js'],
  ['시편', '시', 'Psa', 'Psa.js'],
  ['잠언', '잠', 'Pro', 'Pro.js'],
  ['전도서', '전', 'Ecc', 'Ecc.js'],
  ['아가', '아', 'Sng', 'Sng.js'],
  ['이사야', '사', 'Isa', 'Isa.js'],
  ['예레미야', '렘', 'Jer', 'Jer.js'],
  ['예레미야애가', '애', 'Lam', 'Lam.js'],
  ['에스겔', '겔', 'Ezk', 'Ezk.js'],
  ['다니엘', '단', 'Dan', 'Dan.js'],
  ['호세아', '호', 'Hos', 'Hos.js'],
  ['요엘', '욜', 'Jol', 'Jol.js'],
  ['아모스', '암', 'Amo', 'Amo.js'],
  ['오바댜', '옵', 'Oba', 'Oba.js'],
  ['요나', '욘', 'Jon', 'Jon.js'],
  ['미가', '미', 'Mic', 'Mic.js'],
  ['나훔', '나', 'Nam', 'Nam.js'],
  ['하박국', '합', 'Hab', 'Hab.js'],
  ['스바냐', '습', 'Zep', 'Zep.js'],
  ['학개', '학', 'Hag', 'Hag.js'],
  ['스가랴', '슥', 'Zec', 'Zec.js'],
  ['말라기', '말', 'Mal', 'Mal.js']
];

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHebrew(value) {
  return stripHtml(value).replace(/\s+/g, ' ').trim();
}

function cleanKjvPhrase(value) {
  return stripHtml(value)
    .replace(/[()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '')
    .trim();
}

function normalizeStrong(value) {
  const match = String(value || '').match(/H0*(\d+)/i);
  return match ? `H${match[1].padStart(4, '0')}` : '';
}

function readExplicitKjvMappings() {
  const phraseByWordSort = new Map();
  const verseByWordSort = new Map();
  const lines = fs.readFileSync(KJV_MAPPING_FILE, 'utf8').split(/\r?\n/);
  let mappedMarkers = 0;

  lines.forEach(line => {
    if (!line.trim()) return;
    const fields = line.split('\t');
    if (fields.length < 5) return;
    const bookNumber = Number(fields[1]);
    const chapter = Number(fields[2]);
    const verse = Number(fields[3]);
    const annotated = fields.slice(4).join('\t');
    const markerPattern = /〈([^〉]+)〉/g;
    let previousEnd = 0;
    let match;

    while ((match = markerPattern.exec(annotated))) {
      const segment = annotated.slice(previousEnd, match.index);
      previousEnd = markerPattern.lastIndex;
      const marker = match[1];
      const markerParts = marker.split('＝');
      const details = (markerParts[1] || '').split('｜');
      const wordSort = Number(details[1]);
      if (!Number.isInteger(wordSort)) continue;
      if (BOOKS[bookNumber] && Number.isInteger(chapter) && Number.isInteger(verse)) {
        verseByWordSort.set(wordSort, { bookNumber, chapter, verse });
      }

      const phrase = cleanKjvPhrase(segment);
      if (phrase) {
        const existing = phraseByWordSort.get(wordSort) || [];
        if (!existing.includes(phrase)) existing.push(phrase);
        phraseByWordSort.set(wordSort, existing);
      }
      mappedMarkers += 1;
    }
  });

  return { phraseByWordSort, verseByWordSort, mappedMarkers };
}

function readKjvVersification() {
  const verseByWordSort = new Map();
  const lines = fs.readFileSync(KJV_VERSIFICATION_FILE, 'utf8').split(/\r?\n/);

  lines.forEach(line => {
    if (!line.trim()) return;
    const fields = line.split('\t');
    if (fields.length < 5) return;
    const bookNumber = Number(fields[1]);
    const chapter = Number(fields[2]);
    const verse = Number(fields[3]);
    if (!BOOKS[bookNumber] || !Number.isInteger(chapter) || !Number.isInteger(verse)) return;

    const wordPattern = /〔(\d+)｜/g;
    const annotated = fields.slice(4).join('\t');
    let match;
    while ((match = wordPattern.exec(annotated))) {
      verseByWordSort.set(Number(match[1]), { bookNumber, chapter, verse });
    }
  });

  return verseByWordSort;
}

async function readInterlinearWords(phraseByWordSort, verseByWordSort, explicitVerseByWordSort) {
  const books = new Map();
  let words = 0;
  let mappedWords = 0;
  const unzip = spawn('unzip', ['-p', INTERLINEAR_ZIP, INTERLINEAR_FILE], {
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const reader = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let firstLine = true;

  for await (const line of reader) {
    if (firstLine) {
      firstLine = false;
      continue;
    }
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length < 11) continue;

    const wordSort = Number(fields[0]);
    const verseParts = Array.from(String(fields[1] || '').matchAll(/\d+/g)).map(match => Number(match[0]));
    if (verseParts.length < 4 || !Number.isInteger(wordSort)) continue;
    const [, sourceBookNumber, sourceChapter, sourceVerse] = verseParts;
    // The explicit phrase mapping corrects a small number of boundary errors in
    // the broad BHSA-to-KJV versification table (for example 1 Samuel 19:2).
    const mappedReference = explicitVerseByWordSort.get(wordSort) || verseByWordSort.get(wordSort);
    const bookNumber = mappedReference ? mappedReference.bookNumber : sourceBookNumber;
    const chapter = mappedReference ? mappedReference.chapter : sourceChapter;
    const verse = mappedReference ? mappedReference.verse : sourceVerse;
    const bookMeta = BOOKS[bookNumber];
    if (!bookMeta) continue;

    const original = cleanHebrew(fields[2]);
    const transliteration = stripHtml(fields[3]);
    const lemma = cleanHebrew(fields[5]);
    const strong = normalizeStrong(fields[7]);
    const morphology = stripHtml(fields[8]);
    const gloss = stripHtml(fields[10]);
    if (!original || !strong) continue;

    const phrases = phraseByWordSort.get(wordSort) || [];
    const kjvText = phrases.join(' / ');
    if (kjvText) mappedWords += 1;

    if (!books.has(bookNumber)) books.set(bookNumber, new Map());
    const verses = books.get(bookNumber);
    const verseKey = `${chapter}:${verse}`;
    if (!verses.has(verseKey)) verses.set(verseKey, []);
    verses.get(verseKey).push({
      original,
      transliteration,
      strong,
      lemma,
      morphology,
      gloss,
      kjvText
    });
    words += 1;
  }

  const exitCode = await new Promise((resolve, reject) => {
    unzip.once('error', reject);
    unzip.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`unzip exited with code ${exitCode}`);
  return { books, words, mappedWords };
}

function loadIndex() {
  const filename = path.join(DATA_DIR, 'index.js');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.window.ORIGINAL_LANGUAGE_INDEX;
}

function writeBooks(books, index) {
  let verseTotal = 0;
  for (let bookNumber = 1; bookNumber < BOOKS.length; bookNumber += 1) {
    const [name, abbr, step, filename] = BOOKS[bookNumber];
    const verseMap = books.get(bookNumber) || new Map();
    const verses = {};

    for (const [verseKey, wordObjects] of verseMap) {
      const strongCounts = {};
      verses[verseKey] = wordObjects.map(word => {
        strongCounts[word.strong] = (strongCounts[word.strong] || 0) + 1;
        return [
          word.original,
          word.transliteration,
          '',
          word.strong,
          word.lemma,
          word.morphology,
          '',
          word.gloss,
          word.kjvText,
          strongCounts[word.strong]
        ];
      });
    }

    const payload = {
      book: name,
      abbr,
      step,
      language: 'hebrew',
      languageLabel: '히브리어',
      sourceNote: 'OpenHebrewBible BHSA 8-layer interlinear, KJV 절 대응표 및 KJV-OT mapped-to-BHS 직접 단어 매핑 기반. CC BY-NC 4.0.',
      verses
    };
    fs.writeFileSync(
      path.join(DATA_DIR, filename),
      `window.ORIGINAL_LANGUAGE_BOOKS = window.ORIGINAL_LANGUAGE_BOOKS || {};\nwindow.ORIGINAL_LANGUAGE_BOOKS[${JSON.stringify(step)}] = ${JSON.stringify(payload)};\n`,
      'utf8'
    );

    index.books[name] = {
      file: filename,
      step,
      abbr,
      language: 'hebrew',
      languageLabel: '히브리어',
      verseCount: Object.keys(verses).length,
      source: 'OpenHebrewBible BHSA 8-layer interlinear with explicit KJV mapping'
    };
    verseTotal += Object.keys(verses).length;
  }
  return verseTotal;
}

async function main() {
  for (const filename of [INTERLINEAR_ZIP, KJV_MAPPING_FILE, KJV_VERSIFICATION_FILE]) {
    if (!fs.existsSync(filename)) throw new Error(`Missing OpenHebrewBible source: ${filename}`);
  }

  const { phraseByWordSort, verseByWordSort: explicitVerseByWordSort, mappedMarkers } = readExplicitKjvMappings();
  const verseByWordSort = readKjvVersification();
  const { books, words, mappedWords } = await readInterlinearWords(
    phraseByWordSort,
    verseByWordSort,
    explicitVerseByWordSort
  );
  const index = loadIndex();
  const verseTotal = writeBooks(books, index);
  index.version = 'openhebrewbible-kjv-mapped-hebrew-trx-greek-v2';
  index.knownMissingVerses = {
    '느헤미야 7:68': 'OpenHebrewBible BHSA-to-KJV mapping marks this KJV verse as not found in BHSA.'
  };
  index.wordFields = ['original', 'transliteration', 'meaningKo', 'strong', 'lemma', 'morph', 'morphKo', 'gloss', 'kjvText', 'strongOccurrence'];
  fs.writeFileSync(
    path.join(DATA_DIR, 'index.js'),
    `window.ORIGINAL_LANGUAGE_INDEX = ${JSON.stringify(index)};\n`,
    'utf8'
  );

  if (verseTotal !== 23144) throw new Error(`Expected 23144 mapped BHSA verses, received ${verseTotal}`);
  console.log(JSON.stringify({ verseTotal, words, mappedWords, mappedMarkers }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
