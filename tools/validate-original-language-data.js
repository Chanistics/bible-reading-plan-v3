const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'original-data');
const KJV_DIR = path.join(DATA_DIR, 'kjv1769-strong');
const ORIGINAL_SCRIPT_PATTERN = /[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff]/u;
const GRAMMAR_META_PATTERN = /\b(?:pluperfect|aorist|optative|subjunctive|infinitive|participle|imperative|deponent|deriv(?:ative|ation|ed|atives?)|lexical form|conjugation|lemma)\b/i;
const SCRIPTURE_REF_PATTERN = /\b(?:[123]\s*)?(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kgs?|Kin|Chr|Ezra|Neh|Esth?|Job|Ps|Psa|Prov|Eccl|Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Mt|Mk|Lk|Jn|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Titus|Phlm|Heb|Jas|Pet|Jude|Rev)\.?\s*\d/i;
const SHORT_MEANING_META_PATTERN = /(?:[,;]\s*[123]$|\b(?:alternate spelling|also spelled|variant spellings?|Hebrew is|Greek is)\b)/i;
const STRUCTURAL_HEBREW_STRONGS = new Set(Array.from({ length: 39 }, (_, index) => `H${String(index + 9001).padStart(4, '0')}`));

function loadWindowScript(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.window;
}

function normalizeStrong(value) {
  const keys = Array.from(String(value || '').matchAll(/([HG])0*(\d+)/gi))
    .map(match => `${match[1].toUpperCase()}${match[2].padStart(4, '0')}`);
  return keys.find(key => !STRUCTURAL_HEBREW_STRONGS.has(key)) || keys[0] || '';
}

function hasOnlyStructuralHebrewStrongs(value) {
  const keys = Array.from(String(value || '').matchAll(/([HG])0*(\d+)/gi))
    .map(match => `${match[1].toUpperCase()}${match[2].padStart(4, '0')}`);
  return keys.length > 0 && keys.every(key => STRUCTURAL_HEBREW_STRONGS.has(key));
}

function validateLexicon(file, globalName) {
  const lexicon = loadWindowScript(file)[globalName];
  const invalid = [];
  let meanings = 0;
  let emptyMeanings = 0;

  Object.entries(lexicon.entries || {}).forEach(([strong, entry]) => {
    const values = Array.isArray(entry.m) ? entry.m : [];
    if (!values.length) emptyMeanings += 1;
    values.forEach(value => {
      meanings += 1;
      const text = String(value || '');
      const reasons = [];
      if (ORIGINAL_SCRIPT_PATTERN.test(text)) reasons.push('original-script');
      if (GRAMMAR_META_PATTERN.test(text)) reasons.push('grammar-metadata');
      if (SCRIPTURE_REF_PATTERN.test(text)) reasons.push('scripture-reference');
      if (SHORT_MEANING_META_PATTERN.test(text)) reasons.push('short-meaning-metadata');
      if (entry.pos === 'proper name' && /\bpr\.\s*name\b/i.test(text)) reasons.push('proper-name-metadata');
      if (text.length > 180) reasons.push('too-long');
      if (reasons.length) invalid.push({ strong, value: text, reasons });
    });
  });

  return {
    entries: Object.keys(lexicon.entries || {}).length,
    meanings,
    emptyMeanings,
    invalidCount: invalid.length,
    invalidSamples: invalid.slice(0, 12)
  };
}

function validateKjvOffsets(index) {
  let taggedItems = 0;
  let phrasesWithOffsets = 0;
  let invalidOffsets = 0;
  const samples = [];

  Object.values(index.books || {}).forEach(meta => {
    const book = loadWindowScript(path.join(KJV_DIR, meta.file)).KJV1769_STRONG_BOOKS[meta.osis];
    Object.entries(book.verses || {}).forEach(([verseKey, verse]) => {
      (verse.words || []).forEach(item => {
        taggedItems += 1;
        const phrase = String(item[1] || '');
        if (!phrase) return;
        const start = Number(item[2]);
        const end = Number(item[3]);
        phrasesWithOffsets += 1;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || verse.text.slice(start, end) !== phrase) {
          invalidOffsets += 1;
          if (samples.length < 12) samples.push({ book: meta.osis, verse: verseKey, item, text: verse.text });
        }
      });
    });
  });

  return { taggedItems, phrasesWithOffsets, invalidOffsets, invalidSamples: samples };
}

function validateAlignment(originalIndex, kjvIndex) {
  const stats = {
    hebrew: { verses: 0, missingKjvVerses: 0, words: 0, structuralOnlyWords: 0, occurrenceMatched: 0, nonEmptyPhrase: 0, storedCompared: 0, storedMismatch: 0, unmatchedStrongCounts: {} },
    greek: { verses: 0, missingKjvVerses: 0, words: 0, structuralOnlyWords: 0, occurrenceMatched: 0, nonEmptyPhrase: 0, storedCompared: 0, storedMismatch: 0, unmatchedStrongCounts: {} }
  };

  Object.entries(originalIndex.books || {}).forEach(([bookName, originalMeta]) => {
    const kjvMeta = kjvIndex.books && kjvIndex.books[bookName];
    if (!kjvMeta) return;
    const originalWindow = loadWindowScript(path.join(DATA_DIR, originalMeta.file));
    const originalBook = originalWindow.ORIGINAL_LANGUAGE_BOOKS[originalMeta.step];
    const kjvBook = loadWindowScript(path.join(KJV_DIR, kjvMeta.file)).KJV1769_STRONG_BOOKS[kjvMeta.osis];
    const languageStats = stats[originalMeta.language];

    Object.entries(originalBook.verses || {}).forEach(([verseKey, rows]) => {
      languageStats.verses += 1;
      const kjvVerse = kjvBook.verses && kjvBook.verses[verseKey];
      if (!kjvVerse) {
        languageStats.missingKjvVerses += 1;
        return;
      }

      const originalCounts = {};
      (rows || []).forEach(row => {
        const rawStrong = Array.isArray(row) ? row[3] : row.strong;
        const strong = normalizeStrong(rawStrong);
        if (!strong) return;
        languageStats.words += 1;
        if (hasOnlyStructuralHebrewStrongs(rawStrong)) languageStats.structuralOnlyWords += 1;
        originalCounts[strong] = (originalCounts[strong] || 0) + 1;
        const occurrence = Number(!Array.isArray(row) && row.strongOccurrence) || originalCounts[strong];
        let seen = 0;
        const match = (kjvVerse.words || []).find(item => {
          if (item[0] !== strong) return false;
          seen += 1;
          return seen === occurrence;
        });
        if (!match) {
          languageStats.unmatchedStrongCounts[strong] = (languageStats.unmatchedStrongCounts[strong] || 0) + 1;
          return;
        }
        languageStats.occurrenceMatched += 1;
        if (String(match[1] || '').trim()) languageStats.nonEmptyPhrase += 1;

        if (!Array.isArray(row) && Object.prototype.hasOwnProperty.call(row, 'kjvText')) {
          languageStats.storedCompared += 1;
          if (String(row.kjvText || '').trim() !== String(match[1] || '').trim()) languageStats.storedMismatch += 1;
        }
      });
    });
  });

  Object.values(stats).forEach(item => {
    const lexicalWords = item.words - item.structuralOnlyWords;
    item.occurrenceMatchRate = item.words ? Number((item.occurrenceMatched * 100 / item.words).toFixed(2)) : 0;
    item.nonEmptyPhraseRate = item.words ? Number((item.nonEmptyPhrase * 100 / item.words).toFixed(2)) : 0;
    item.lexicalOccurrenceMatchRate = lexicalWords ? Number((item.occurrenceMatched * 100 / lexicalWords).toFixed(2)) : 0;
    item.topUnmatchedStrongs = Object.entries(item.unmatchedStrongCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([strong, count]) => ({ strong, count }));
    delete item.unmatchedStrongCounts;
  });
  return stats;
}

const originalIndex = loadWindowScript(path.join(DATA_DIR, 'index.js')).ORIGINAL_LANGUAGE_INDEX;
const kjvIndex = loadWindowScript(path.join(KJV_DIR, 'index.js')).KJV1769_STRONG_INDEX;
const report = {
  lexicons: {
    hebrew: validateLexicon(path.join(DATA_DIR, 'hebrew-lexicon.js'), 'HEBREW_LEXICON'),
    greek: validateLexicon(path.join(DATA_DIR, 'greek-lexicon.js'), 'GREEK_LEXICON')
  },
  kjvOffsets: validateKjvOffsets(kjvIndex),
  alignment: validateAlignment(originalIndex, kjvIndex)
};

console.log(JSON.stringify(report, null, 2));

const hasIntegrityFailure = report.lexicons.hebrew.invalidCount > 0 ||
  report.lexicons.hebrew.emptyMeanings > 0 ||
  report.lexicons.greek.invalidCount > 0 ||
  report.lexicons.greek.emptyMeanings > 0 ||
  report.kjvOffsets.invalidOffsets > 0 ||
  report.alignment.greek.storedMismatch > 0;
if (hasIntegrityFailure) process.exitCode = 1;
