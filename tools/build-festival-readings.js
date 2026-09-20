#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(__dirname, 'sources', 'hebcal-festivals');
const mappingUrl = 'https://raw.githubusercontent.com/Copenhagen-Alliance/versification-specification/56c093e/versification-mappings/standard-mappings/eng.json';
const books = [
  ['Genesis', 'GEN'], ['Exodus', 'EXO'], ['Leviticus', 'LEV'], ['Numbers', 'NUM'], ['Deuteronomy', 'DEU'],
  ['Joshua', 'JOS'], ['Judges', 'JDG'], ['Ruth', 'RUT'], ['I Samuel', '1SA'], ['II Samuel', '2SA'],
  ['I Kings', '1KI'], ['II Kings', '2KI'], ['I Chronicles', '1CH'], ['II Chronicles', '2CH'],
  ['Ezra', 'EZR'], ['Nehemiah', 'NEH'], ['Esther', 'EST'], ['Job', 'JOB'], ['Psalms', 'PSA'], ['Proverbs', 'PRO'],
  ['Ecclesiastes', 'ECC'], ['Song of Songs', 'SNG'], ['Isaiah', 'ISA'], ['Jeremiah', 'JER'],
  ['Lamentations', 'LAM'], ['Ezekiel', 'EZK'], ['Daniel', 'DAN'], ['Hosea', 'HOS'], ['Joel', 'JOL'],
  ['Amos', 'AMO'], ['Obadiah', 'OBA'], ['Jonah', 'JON'], ['Micah', 'MIC'], ['Nahum', 'NAM'],
  ['Habakkuk', 'HAB'], ['Zephaniah', 'ZEP'], ['Haggai', 'HAG'], ['Zechariah', 'ZEC'], ['Malachi', 'MAL']
];

async function main() {
  fs.mkdirSync(SOURCES, { recursive: true });
  const context = { window: {}, console, fetch, AbortSignal, Date };
  vm.createContext(context);
  for (const file of ['bible-data.js', 'generator.js', 'korean-data/index.js', 'festival-readings.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
  }
  const bookMetadata = {};
  // The local reader's canonical numbering is authoritative, not Tanakh book order.
  const index = context.window.KOREAN_BIBLE_INDEX;
  for (const [english, code] of books) {
    const number = books.findIndex(([name]) => name === english) + 1;
    const meta = index.books[number];
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'korean-data', meta.file), 'utf8'), context);
    const book = context.window.KOREAN_BIBLE_BOOKS[number];
    bookMetadata[english] = { code, name: book.name, verseCounts: Object.values(book.chapters).map(chapter => chapter.length) };
  }
  const mappingFile = path.join(SOURCES, 'eng-versification.json');
  if (!fs.existsSync(mappingFile)) {
    const response = await fetch(mappingUrl);
    if (!response.ok) throw new Error(`Versification: ${response.status}`);
    fs.writeFileSync(mappingFile, JSON.stringify(await response.json(), null, 2) + '\n');
  }
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  const verseMappings = {};
  const parse = ref => ref.match(/^(\w+) (\d+):(\d+)(?:-(\d+))?$/);
  for (const [english, source] of Object.entries(mapping.mappedVerses)) {
    const from = parse(source), to = parse(english);
    if (!from || !to || from[1] !== to[1]) continue;
    const book = books.find(([, code]) => code === from[1]);
    if (!book || Number(to[3]) === 0) continue;
    (verseMappings[book[0]] ||= []).push([+from[2], +from[3], +(from[4] || from[3]), +to[2], +to[3]]);
  }
  const years = {};
  for (const year of [2025, 2026, 2027, 2028, 2029]) {
    const file = path.join(SOURCES, `${year}.json`);
    if (!fs.existsSync(file)) {
      const items = await context.window.FestivalReadings.fetchYear(year);
      fs.writeFileSync(file, JSON.stringify(items, null, 2) + '\n');
    }
    years[year] = JSON.parse(fs.readFileSync(file, 'utf8')).filter(context.window.FestivalReadings.getRule);
    console.log(`${year}: ${years[year].length} festival services`);
  }
  const data = { source: 'Hebcal Leyning API', calendarStandard: 'israel', sourceUrl: 'https://www.hebcal.com/home/4277/leyning-torah-reading-api', books: bookMetadata, verseMappings, years };
  context.window.FESTIVAL_READINGS_DATA = data;
  Object.values(years).forEach(items => context.window.FestivalReadings.normalizeYear(items));
  fs.writeFileSync(path.join(ROOT, 'festival-readings-data.js'), `window.FESTIVAL_READINGS_DATA = ${JSON.stringify(data)};\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
