const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'original-data');
const BDB_JSON = process.argv[2] || '/private/tmp/DictBDB.json';
const TRX_DB = process.argv[3] || '/private/tmp/ub_trx/TRx.bible';
const MOUNCE_CSV = process.argv[4] || '/private/tmp/MounceGithubTouched.csv';
const HEBREW_STRONG_JS = process.argv[5] || path.join(ROOT, 'tools', 'sources', 'openscriptures', 'strongs-hebrew-dictionary.js');
const GREEK_STRONG_JS = process.argv[6] || path.join(ROOT, 'tools', 'sources', 'openscriptures', 'strongs-greek-dictionary.js');
const HEBREW_LEXICAL_INDEX = process.argv[7] || path.join(ROOT, 'tools', 'sources', 'openscriptures', 'LexicalIndex.xml');
const { execFileSync } = require('child_process');

const HEBREW_OUT = path.join(DATA_DIR, 'hebrew-lexicon.js');
const GREEK_OUT = path.join(DATA_DIR, 'greek-lexicon.js');

const PARTS_OF_SPEECH = [
  'verb',
  'noun',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'pronoun',
  'proper name',
  'proper noun',
  'interjection',
  'article',
  'particle',
  'numeral'
];

const SCRIPTURE_REF_PATTERN = /\b(?:[123]\s*)?(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kgs?|Kin|Chr|Ezra|Neh|Esth?|Job|Ps|Psa|Prov|Eccl|Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Mt|Mk|Lk|Jn|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Titus|Phlm|Heb|Jas|Pet|Jude|Rev)\.?\s*\d/i;
const ORIGINAL_SCRIPT_PATTERN = /[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff]/u;
const ORIGINAL_SCRIPT_SEQUENCE_PATTERN = /[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff\u0300-\u036f]+/gu;
const GRAMMAR_META_PATTERN = /\b(?:pluperfect|aorist|optative|subjunctive|infinitive|participle|imperative|deponent|deriv(?:ative|ation|ed|atives?)|lexical form|conjugation)\b/i;
const BDB_GRAMMAR_PATTERN = /\b(?:verb|noun|adjective|adverb|preposition|conjunction|pronoun|proper name|proper noun|interjection|article|particle|numeral|masculine|feminine|common|plural|singular|construct|absolute|qal|niph|hiph|hithp|pi`?el|po`?el|pual|hophal|passive|active|imperfect|perfect|infinitive|participle|denominative)\b/i;
const STRUCTURAL_HEBREW_MEANINGS = { H9003: 'in' };

function normalizeStrong(prefix, value) {
  const match = String(value || '').match(/(\d{1,5})/);
  if (!match) return '';
  return `${prefix}${match[1].padStart(4, '0')}`;
}

function unique(values, limit = 12) {
  return Array.from(new Set((values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean))).slice(0, limit);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x200E;/g, ' ')
    .replace(/&#8212;/g, '-')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function truncate(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const sliced = text.slice(0, limit);
  const boundary = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('; '), sliced.lastIndexOf(', '));
  return `${sliced.slice(0, boundary > limit * 0.65 ? boundary + 1 : limit).trim()} ...`;
}

function stripScriptureReferences(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = text.match(SCRIPTURE_REF_PATTERN);
  return (match ? text.slice(0, match.index) : text)
    .replace(/[\s,;:]+$/, '')
    .trim();
}

function loadDictionaryModule(file) {
  if (!fs.existsSync(file)) return {};
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  return require(resolved);
}

function normalizeDictionaryKeys(prefix, dictionary) {
  const normalized = {};
  Object.entries(dictionary || {}).forEach(([key, value]) => {
    const strong = normalizeStrong(prefix, key);
    if (strong) normalized[strong] = value;
  });
  return normalized;
}

function loadHebrewLexicalIndex(file) {
  if (!fs.existsSync(file)) return {};
  execFileSync('xmllint', ['--noout', file], { stdio: 'pipe' });
  const xml = fs.readFileSync(file, 'utf8');
  const entries = {};

  Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)).forEach(match => {
    const block = match[1];
    const strongAttribute = (block.match(/<xref\b[^>]*\bstrong="([^"]+)"/i) || [])[1] || '';
    const definition = stripHtml((block.match(/<def>([\s\S]*?)<\/def>/i) || [])[1] || '');
    const partOfSpeech = stripHtml((block.match(/<pos>([\s\S]*?)<\/pos>/i) || [])[1] || '');
    const word = stripHtml((block.match(/<w\b[^>]*>([\s\S]*?)<\/w>/i) || [])[1] || '');
    const transliteration = (block.match(/<w\b[^>]*\bxlit="([^"]+)"/i) || [])[1] || '';

    (strongAttribute.match(/\d+/g) || []).forEach(number => {
      const strong = normalizeStrong('H', number);
      if (!strong || entries[strong] && entries[strong].definition) return;
      entries[strong] = { definition, partOfSpeech, word, transliteration };
    });
  });

  return entries;
}

function isMeaningUncertain(definition) {
  return /\b(?:meaning (?:dubious|doubtful|uncertain|unknown)|doubtful (?:word|meaning)|meaning unknown|of uncertain meaning)\b/i.test(String(definition || ''));
}

function cleanStrongShortMeaning(value) {
  const text = String(value || '')
    .replace(/\[(?:idiom|phrase)\]/gi, ' ')
    .replace(/[{}]/g, '')
    .replace(ORIGINAL_SCRIPT_SEQUENCE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .trim();
  if (!text || ORIGINAL_SCRIPT_PATTERN.test(text) || GRAMMAR_META_PATTERN.test(text)) return '';
  return truncate(stripScriptureReferences(text), 150);
}

function startsWithUppercaseLetter(value) {
  const firstLetter = Array.from(String(value || '')).find(char => /[A-Za-z\u0370-\u03ff\u1f00-\u1fff]/u.test(char));
  return Boolean(firstLetter && firstLetter === firstLetter.toUpperCase() && firstLetter !== firstLetter.toLowerCase());
}

function buildStrongExplanation(entry) {
  if (!entry) return '';
  const parts = [];
  if (entry.strongs_def) parts.push(`Definition: ${String(entry.strongs_def).trim()}.`);
  if (entry.derivation) parts.push(`Derivation: ${String(entry.derivation).trim()}`);
  if (entry.kjv_def) parts.push(`KJV usage: ${String(entry.kjv_def).trim()}`);
  return truncate(parts.join(' '), 2600);
}

function getBoldLabels(definition) {
  return Array.from(String(definition || '').matchAll(/<b>([\s\S]*?)<\/b>/gi))
    .map(match => stripHtml(match[1]))
    .filter(Boolean);
}

function isBdbGrammarLabel(value) {
  const text = String(value || '').trim();
  if (!text || !/[A-Za-z]/.test(text) || ORIGINAL_SCRIPT_PATTERN.test(text)) return true;
  if (/^H\d+\./i.test(text) || /^\d+[a-z.]?$/i.test(text) || /^[a-z]\.$/i.test(text)) return true;
  return BDB_GRAMMAR_PATTERN.test(text) || GRAMMAR_META_PATTERN.test(text) || text.length > 180;
}

function extractBdbShortMeaning(definition) {
  const labels = getBoldLabels(definition);
  const partOfSpeechIndex = labels.findIndex((label, index) => index > 0 && PARTS_OF_SPEECH.some(part => new RegExp(`\\b${part.replace(/\s+/g, '\\s+')}\\b`, 'i').test(label)));
  const start = partOfSpeechIndex >= 0 ? partOfSpeechIndex + 1 : 1;
  const end = Math.min(labels.length, start + 4);

  for (let index = start; index < end; index += 1) {
    const candidate = stripScriptureReferences(labels[index]);
    if (!isBdbGrammarLabel(candidate)) return candidate;
  }
  return '';
}

function extractHebrewHeading(definition) {
  const plain = stripHtml(definition);
  const head = plain.slice(0, 700);
  const strong = (head.match(/H\d+\.\s*([^\s\[]+)/) || [])[1] || '';
  const hebrew = (definition.match(/entry="([^"]+)"/) || [])[1] || '';
  const speech = PARTS_OF_SPEECH.find(part => new RegExp(`\\b${part}\\b`, 'i').test(head)) || '';
  const meaning = extractBdbShortMeaning(definition);

  const etymologyMatch = head.match(/\((.*)\)\s+[-—]\s+/);
  return {
    transliteration: strong,
    hebrew,
    partOfSpeech: speech,
    meaning,
    etymology: etymologyMatch ? truncate(etymologyMatch[1], 900) : ''
  };
}

function buildHebrewLexicon() {
  const source = JSON.parse(fs.readFileSync(BDB_JSON, 'utf8'));
  const strongDictionary = normalizeDictionaryKeys('H', loadDictionaryModule(HEBREW_STRONG_JS));
  const lexicalIndex = loadHebrewLexicalIndex(HEBREW_LEXICAL_INDEX);
  const entries = {};

  source.forEach(item => {
    const strong = normalizeStrong('H', item.top);
    if (!strong || !item.def || strong === 'H0000') return;
    const heading = extractHebrewHeading(item.def);
    const definition = truncate(stripHtml(item.def), 3600);
    const lexical = lexicalIndex[strong] || null;
    const strongEntry = strongDictionary[strong] || null;
    const isProperName = Boolean(lexical && lexical.partOfSpeech === 'Np');
    let meaning = heading.meaning;
    let meaningSource = meaning ? 'BDB' : '';

    if (isProperName && lexical.definition) {
      meaning = lexical.definition;
      meaningSource = 'OpenScriptures LexicalIndex';
    } else if (!meaning && isMeaningUncertain(definition)) {
      meaning = 'meaning uncertain';
      meaningSource = 'BDB uncertainty note';
    } else if (!meaning && lexical && lexical.definition) {
      meaning = cleanStrongShortMeaning(lexical.definition);
      meaningSource = meaning ? 'OpenScriptures LexicalIndex' : '';
    } else if (!meaning && strongEntry) {
      meaning = cleanStrongShortMeaning(strongEntry.strongs_def) || cleanStrongShortMeaning(strongEntry.kjv_def);
      meaningSource = meaning ? 'OpenScriptures Strong' : '';
    }
    if (!meaning && STRUCTURAL_HEBREW_MEANINGS[strong]) {
      meaning = STRUCTURAL_HEBREW_MEANINGS[strong];
      meaningSource = 'BDB';
    }

    const fallbackUsed = meaningSource && meaningSource !== 'BDB';
    entries[strong] = {
      s: strong,
      h: unique([heading.hebrew, lexical && lexical.word, strongEntry && strongEntry.lemma]),
      l: unique([heading.hebrew, lexical && lexical.word, strongEntry && strongEntry.lemma]),
      p: unique([heading.transliteration, lexical && lexical.transliteration, strongEntry && (strongEntry.xlit || strongEntry.pron)]),
      m: unique([meaning]),
      e: heading.etymology,
      d: definition,
      pos: isProperName ? 'proper name' : heading.partOfSpeech,
      meaningSource,
      source: fallbackUsed ? 'BDB + OpenScriptures Hebrew Lexicon' : 'BDB'
    };
  });

  Object.entries(strongDictionary).forEach(([strong, strongEntry]) => {
    if (entries[strong]) return;
    const lexical = lexicalIndex[strong] || null;
    const isProperName = Boolean(lexical && lexical.partOfSpeech === 'Np');
    const meaning = cleanStrongShortMeaning(
      isProperName && lexical && lexical.definition
        ? lexical.definition
        : (lexical && lexical.definition) || strongEntry.strongs_def || strongEntry.kjv_def
    );
    entries[strong] = {
      s: strong,
      h: unique([lexical && lexical.word, strongEntry.lemma]),
      l: unique([lexical && lexical.word, strongEntry.lemma]),
      p: unique([lexical && lexical.transliteration, strongEntry.xlit || strongEntry.pron]),
      m: unique([meaning]),
      e: strongEntry.derivation || '',
      d: buildStrongExplanation(strongEntry),
      pos: isProperName ? 'proper name' : '',
      meaningSource: meaning ? (lexical && lexical.definition ? 'OpenScriptures LexicalIndex' : 'OpenScriptures Strong') : '',
      source: 'OpenScriptures Hebrew Lexicon'
    };
  });

  const output = {
    version: 'uniquebible-bdb-openscriptures-hebrew-v2',
    source: 'eliranwong/unabridged-BDB-Hebrew-lexicon DictBDB.json; OpenScriptures Hebrew Lexicon LexicalIndex.xml and Strong dictionary fallback',
    generatedAt: new Date().toISOString(),
    fieldMap: {
      s: 'strong',
      h: 'hebrewForms',
      l: 'lemmas',
      p: 'transliteration',
      m: 'englishMeanings',
      e: 'etymologyOrOriginNote',
      d: 'definition',
      pos: 'partOfSpeech',
      meaningSource: 'shortMeaningSource'
    },
    entries
  };

  fs.writeFileSync(HEBREW_OUT, `window.HEBREW_LEXICON = ${JSON.stringify(output)};\n`);
  return Object.keys(entries).length;
}

function parseMouncePayload(payload) {
  const jsonLike = `{${payload}}`
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(jsonLike);
}

function buildMounceEntries() {
  if (!fs.existsSync(MOUNCE_CSV)) return {};
  const rows = fs.readFileSync(MOUNCE_CSV, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean);
  const entries = {};

  rows.forEach(row => {
    const columns = row.split('\t');
    if (columns.length < 3) return;
    let parsed;
    try {
      parsed = parseMouncePayload(columns.slice(2).join('\t'));
    } catch (err) {
      return;
    }
    (parsed.strongs || []).forEach(strongNumber => {
      const strong = normalizeStrong('G', strongNumber);
      if (!strong) return;
      entries[strong] = {
        s: strong,
        h: unique([parsed.lemma]),
        l: unique([parsed.lemma]),
        p: unique([parsed.transliteration]),
        m: unique([extractDefinitionLead(parsed.definition)]),
        d: truncate(parsed.definition || '', 2600),
        c: parsed.frequencyCount || 0,
        source: 'Mounce'
      };
    });
  });

  return entries;
}

function extractDefinitionLead(definition) {
  let text = String(definition || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(';')[0]
    .replace(/\s+/g, ' ')
    .trim();

  if (GRAMMAR_META_PATTERN.test(text) || /\b(?:also spelled|variant spellings?|some list|obsolete present|consult a grammar)\b/i.test(text)) {
    let lastScriptIndex = -1;
    Array.from(text).forEach((char, index) => {
      if (ORIGINAL_SCRIPT_PATTERN.test(char)) lastScriptIndex = index;
    });
    const tail = lastScriptIndex >= 0 ? text.slice(lastScriptIndex + 1) : text;
    const lexicalStart = tail.match(/\bto\s+[A-Za-z]/i);
    text = lexicalStart ? tail.slice(lexicalStart.index) : tail;
  }

  text = text
    .replace(ORIGINAL_SCRIPT_SEQUENCE_PATTERN, ' ')
    .replace(/\b(?:Hebrew|Greek)\s+is\s+[^.]+\.?\s*/gi, ' ')
    .replace(/(?:alternate spelling:?|also spelled|variant spellings? of)[^,;]*,?\s*/gi, ' ')
    .replace(/^\s*(?:used as an interjection|also formed as|also spelled|variant spellings? of|some list[^,]*|strictly)\s*,?\s*/i, '')
    .replace(/,?\s*(?:opposed to|alternate spelling:?|also spelled)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  text = stripScriptureReferences(text);

  if (!text || ORIGINAL_SCRIPT_PATTERN.test(text) || GRAMMAR_META_PATTERN.test(text)) return '';
  return truncate(text, 150);
}

function parseTrxWordsFromChapter(scripture) {
  const words = [];
  const verseMatches = Array.from(String(scripture || '').matchAll(/<verse>[\s\S]*?<\/verse>/g));
  verseMatches.forEach(verseMatch => {
    const chunks = Array.from(verseMatch[0].matchAll(/<wt>([\s\S]*?)(?=<wt>|<\/verse>)/g)).map(match => match[1]);
    chunks.forEach(chunk => {
      if (/<V[12]/.test(chunk.slice(0, 8))) return;
      const original = stripHtml(chunk.split('<sup>')[0]);
      const strong = normalizeStrong('G', (chunk.match(/lex\("G(\d+)"\)/) || [])[1]);
      if (!original || !strong) return;
      const rmac = chunk.match(/rmac\("([A-Z0-9-]+)\s+l="([^"]+)"/);
      words.push({
        strong,
        original,
        morph: rmac ? rmac[1] : '',
        lemma: rmac ? rmac[2] : ''
      });
    });
  });
  return words;
}

function buildTrxEntries(entries) {
  if (!fs.existsSync(TRX_DB)) return;
  const sql = 'select Scripture from Bible where Book between 40 and 66 order by Book, Chapter;';
  const output = execFileSync('sqlite3', ['-separator', '\t', TRX_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 220 * 1024 * 1024
  });
  const seen = new Set();

  output.split(/\r?\n/).filter(Boolean).forEach(scripture => {
    parseTrxWordsFromChapter(scripture).forEach(word => {
      const forms = [word.original];
      const morphs = word.morph ? [`${word.morph}${word.lemma ? ` lemma ${word.lemma}` : ''}`] : [];
      const entry = entries[word.strong] || {
        s: word.strong,
        h: [],
        l: [],
        p: [],
        m: [],
        d: '',
        source: 'TRx'
      };
      entry.h = unique([...(entry.h || []), ...forms], 20);
      entry.l = unique([...(entry.l || []), word.lemma || forms[0]], 8);
      if (morphs.length) {
        const key = `${word.strong}:${morphs[0]}`;
        if (!seen.has(key)) {
          entry.t = unique([...(entry.t || []), ...morphs], 12);
          seen.add(key);
        }
      }
      if (!entry.d && entry.t && entry.t.length) entry.d = truncate(entry.t.join('; '), 1400);
      if (!entry.source) {
        entry.source = 'TRx';
      } else if (!String(entry.source).includes('TRx')) {
        entry.source = `${entry.source} + TRx`;
      }
      entries[word.strong] = entry;
    });
  });
}

function buildGreekLexicon() {
  const entries = buildMounceEntries();
  buildTrxEntries(entries);
  const strongDictionary = normalizeDictionaryKeys('G', loadDictionaryModule(GREEK_STRONG_JS));

  Object.entries(strongDictionary).forEach(([strong, strongEntry]) => {
    if (entries[strong]) return;
    const isProperName = startsWithUppercaseLetter(strongEntry.lemma);
    const meaning = isProperName
      ? (cleanStrongShortMeaning(strongEntry.kjv_def) || cleanStrongShortMeaning(strongEntry.strongs_def))
      : (cleanStrongShortMeaning(strongEntry.strongs_def) || cleanStrongShortMeaning(strongEntry.kjv_def));
    entries[strong] = {
      s: strong,
      h: unique([strongEntry.lemma]),
      l: unique([strongEntry.lemma]),
      p: unique([strongEntry.translit]),
      m: unique([meaning]),
      d: buildStrongExplanation(strongEntry),
      c: 0,
      pos: isProperName ? 'proper name' : '',
      source: 'OpenScriptures Strong',
      meaningSource: meaning ? 'OpenScriptures Strong' : ''
    };
  });

  Object.entries(entries).forEach(([strong, entry]) => {
    const strongEntry = strongDictionary[strong];
    const isProperName = Boolean(strongEntry && startsWithUppercaseLetter(strongEntry.lemma));
    if (isProperName) {
      const englishName = cleanStrongShortMeaning(strongEntry.kjv_def) || cleanStrongShortMeaning(strongEntry.strongs_def);
      if (englishName) {
        entry.m = unique([englishName]);
        entry.pos = 'proper name';
        entry.meaningSource = 'OpenScriptures Strong';
        if (!String(entry.source || '').includes('OpenScriptures Strong')) {
          entry.source = `${entry.source ? `${entry.source} + ` : ''}OpenScriptures Strong`;
        }
        return;
      }
    }
    if (entry.m && entry.m.length) {
      entry.meaningSource = 'Mounce';
      return;
    }
    if (!strongEntry) return;
    const wasTrxOnly = entry.source === 'TRx';
    const meaning = cleanStrongShortMeaning(strongEntry.strongs_def) || cleanStrongShortMeaning(strongEntry.kjv_def);
    if (!meaning) return;
    entry.m = unique([meaning]);
    entry.h = unique([strongEntry.lemma, ...(entry.h || [])], 20);
    entry.l = unique([strongEntry.lemma, ...(entry.l || [])], 8);
    entry.p = unique([strongEntry.translit, ...(entry.p || [])], 8);
    if (wasTrxOnly || !entry.d || /^\s*(?:[A-Z]-[A-Z0-9-]+|[A-Z]{2,})\s+lemma\b/.test(entry.d)) {
      entry.d = buildStrongExplanation(strongEntry);
    }
    entry.meaningSource = 'OpenScriptures Strong';
    entry.source = String(entry.source || '').includes('Mounce')
      ? 'Mounce + OpenScriptures Strong + TRx'
      : 'OpenScriptures Strong + TRx';
  });

  const output = {
    version: 'uniquebible-trx-mounce-openscriptures-greek-v2',
    source: 'UniqueBible TRx.bible Textus Receptus/Stephanus 1550 with Scrivener 1894 variants, Strong numbers, parsing info, lemmas; Mounce definitions; OpenScriptures Strong dictionary fallback',
    generatedAt: new Date().toISOString(),
    fieldMap: {
      s: 'strong',
      h: 'greekForms',
      l: 'lemmas',
      p: 'transliteration',
      m: 'englishMeanings',
      d: 'definition',
      c: 'frequencyCount',
      t: 'morphSamples',
      meaningSource: 'shortMeaningSource'
    },
    entries
  };

  fs.writeFileSync(GREEK_OUT, `window.GREEK_LEXICON = ${JSON.stringify(output)};\n`);
  return Object.keys(entries).length;
}

if (!fs.existsSync(BDB_JSON)) {
  throw new Error(`Missing BDB source file: ${BDB_JSON}`);
}
if (!fs.existsSync(TRX_DB) && !fs.existsSync(MOUNCE_CSV)) {
  throw new Error(`Missing Greek source files: ${TRX_DB}, ${MOUNCE_CSV}`);
}
if (!fs.existsSync(HEBREW_STRONG_JS) || !fs.existsSync(GREEK_STRONG_JS) || !fs.existsSync(HEBREW_LEXICAL_INDEX)) {
  throw new Error(`Missing OpenScriptures fallback sources: ${HEBREW_STRONG_JS}, ${GREEK_STRONG_JS}, ${HEBREW_LEXICAL_INDEX}`);
}

const hebrewCount = buildHebrewLexicon();
const greekCount = buildGreekLexicon();
console.log(`Built Hebrew BDB/OpenScriptures lexicon: ${hebrewCount} entries`);
console.log(`Built Greek TRx/Mounce/OpenScriptures lexicon: ${greekCount} entries`);
