#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = ['bible-data.js', 'calendar-data.js', 'generator.js', 'festival-readings-data.js', 'festival-readings.js', 'korean-data/index.js'];
const storage = new Map();
const context = {
  window: { addEventListener() {} }, console, Date, AbortSignal, setTimeout, clearTimeout,
  document: { getElementById: () => ({ addEventListener() {} }) },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  sessionStorage: { getItem: () => null },
  fetch: () => { throw new Error('Bundled festival readings must work offline'); }
};
vm.createContext(context);
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
files.forEach(load);
load('app.js');
const run = source => vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));
const api = context.window.FestivalReadings;
const data = context.window.FESTIVAL_READINGS_DATA;
const baseline = {
  5786: '0521e993544ca8102b89a1d306cd7c8e3b50ce8d0f5d3517ad38f5d53cfd4b70',
  5787: '042d51efa5f2025eedbb80ded8387b9ca96089034a2d8a2aa7c2d87357cc253f',
  5788: '686fa0ff825424dd4d1a684193263a3f20954479dca4af96dbe2de45139350d3',
  5789: '2bb396408058ffefbba1164ad1e21cd91d4dfb1bae7bdb8ed1abe0d418d20edb'
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  assert.equal(data.calendarStandard, 'israel');
  assert.deepEqual(Object.keys(data.years), ['2025', '2026', '2027', '2028', '2029']);
  let serviceCount = 0, passageCount = 0;
  const books = {};
  Object.values(context.window.KOREAN_BIBLE_INDEX.books).forEach(meta => {
    load(`korean-data/${meta.file}`);
  });
  Object.values(context.window.KOREAN_BIBLE_BOOKS).forEach(book => { books[book.name] = book; });
  for (const [year, items] of Object.entries(data.years)) {
    const raw = JSON.stringify(items);
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources', 'hebcal-festivals', `${year}.json`), 'utf8')).filter(api.getRule);
    assert.deepEqual(plain(items), source, 'Bundled records must match the captured official data');
    const dates = Object.keys(api.normalizeYear(items)).sort();
    const events = await api.forDates(dates);
    assert.equal(events.length, source.length);
    assert.equal(new Set(events.map(event => event.id)).size, events.length);
    assert.equal(JSON.stringify(items), raw, 'Source data must not be mutated');
    for (const event of events) {
      assert(event.date.startsWith(year));
      assert(!/^(?:Pesach VIII|Shavuot II|Shushan Purim)/.test(event.originalName), 'Use Israel general-region readings');
      assert(event.readings.length);
      serviceCount++;
      for (const reading of event.readings) {
        passageCount++;
        const parsed = context.parseKoreanReference(reading.title);
        assert(parsed, `Reader cannot parse ${reading.title}`);
        assert.equal(parsed.bookName, reading.book);
        assert.equal(parsed.startCh, reading.startCh);
        assert.equal(parsed.endCh, reading.endCh);
        if (reading.title.endsWith('장')) {
          assert.equal(reading.startVs, 1);
          assert.equal(reading.endVs, books[reading.book].chapters[reading.endCh].length);
        } else {
          assert.equal(parsed.startVs, reading.startVs);
          assert.equal(parsed.endVs, reading.endVs);
        }
        for (let chapter = reading.startCh; chapter <= reading.endCh; chapter++) {
          const verses = books[reading.book].chapters[chapter];
          const first = chapter === reading.startCh ? reading.startVs : 1;
          const last = chapter === reading.endCh ? reading.endVs : verses.length;
          assert(first <= last);
          for (let verse = first; verse <= last; verse++) assert.equal(verses[verse - 1]?.[0], verse, `${reading.title}: missing verse`);
        }
      }
    }
    // Every source Torah part and every haftarah segment is represented; no text-based splitting.
    source.forEach(item => {
      const event = events.find(candidate => candidate.id === `${item.date}:${item.name.en}`);
      const refs = event.readings.map(reading => reading.title);
      const torah = (item.summaryParts || []).filter(part => ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'].includes(part.k));
      const haft = Array.isArray(item.haft) ? item.haft : item.haft ? [item.haft] : [];
      [...torah, ...haft].forEach(part => assert(refs.includes(api.convertRange(part).title)));
      if (item.megillah) {
        const scroll = Object.values(item.megillah)[0].k;
        const book = data.books[scroll];
        const reading = event.readings.find(reading => reading.kind === 'megillah');
        assert.equal(reading.startCh, 1);
        assert.equal(reading.startVs, 1);
        assert.equal(reading.endCh, book.verseCounts.length);
        assert.equal(reading.endVs, book.verseCounts.at(-1));
      }
    });
  }

  const on = async date => (await api.forDates([date])).flatMap(event => event.readings.map(reading => reading.title));
  assert((await on('2026-05-22')).includes('룻기 1-4장'));
  assert((await on('2026-05-22')).includes('출애굽기 19-20장'));
  assert((await on('2026-04-04')).includes('아가 1-8장'));
  assert((await on('2026-07-22')).includes('예레미야 애가 1-5장'));
  assert((await on('2026-07-23')).includes('예레미야 8:13-9:24'));
  assert((await on('2026-03-02')).includes('에스더 1-10장'));
  assert((await on('2026-03-03')).includes('에스더 1-10장'));
  assert((await on('2026-09-21')).includes('레위기 18장'));
  assert((await on('2026-09-21')).includes('미가 7:18-20'));
  assert((await on('2026-10-03')).includes('민수기 29:35-40'));
  assert((await on('2028-10-12')).includes('신명기 33-34장'));
  assert((await on('2029-10-01')).includes('신명기 33-34장'));
  assert((await on('2029-07-21')).includes('예레미야 애가 1-5장'));
  assert((await on('2029-07-22')).includes('예레미야 애가 1-5장'));
  for (const [year, date] of [[2026, '2026-10-03'], [2027, '2027-10-23'], [2028, '2028-10-07'], [2029, '2029-09-29']]) {
    const normalized = api.normalizeYear(data.years[year]);
    const scrollDates = Object.values(normalized).flat().filter(event => event.readings.some(reading => reading.book === '전도서'));
    assert.deepEqual(plain(scrollDates.map(event => event.date)), [date], 'Ecclesiastes must follow the actual festival, not reading-cycle boundaries');
  }

  const years = context.window.BUNDLED_HEBCAL_DATA.years;
  const all = Object.values(years).flat();
  const anchors = Object.entries(years).map(([year, events]) => {
    const date = new Date(events.find(event => event.title === 'Parashat Bereshit').date + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - 6);
    return { year: Number(year) + 3761, date: date.toISOString().slice(0, 10) };
  });
  for (let index = 0; index < anchors.length - 1; index++) {
    const anchor = anchors[index];
    const count = (new Date(anchors[index + 1].date) - new Date(anchor.date)) / 86400000;
    const plan = context.window.Generator.generateHebrewYearPlan(all, anchor.date, count);
    assert.equal(digest(plan), baseline[anchor.year], `${anchor.year}: annual assignments changed`);
    context.window.testPlan = plan;
    run('currentPlan = window.testPlan; appState = createDefaultAppState();');
    const before = plain(context.calculateStats());
    const events = await api.forDates(Object.keys(plan));
    const expectedIds = Object.values(data.years).flat()
      .filter(item => api.getRule(item) && Object.hasOwn(plan, item.date))
      .map(item => `${item.date}:${item.name.en}`).sort();
    assert.deepEqual(plain(events.map(event => event.id).sort()), expectedIds);
    assert.deepEqual(plain(context.calculateStats()), before);
    for (const [index, date] of Object.keys(plan).entries()) if (index % 2 === 0) context.setDayCompletion(date, true);
    const halfway = plain(context.calculateStats());
    // Even accidental supplemental flags cannot change the annual denominator or numerator.
    for (const event of events) run(`(appState.progress[${JSON.stringify(event.date)}] ||= {}).festival = true;`);
    assert.deepEqual(plain(context.calculateStats()), halfway);
    for (const date of Object.keys(plan)) context.setDayCompletion(date, true);
    assert.equal(context.calculateStats().percentage, 100);
    assert.equal(context.calculateStats().completedDays, count);
    assert.equal(digest(plan), baseline[anchor.year]);
  }

  // Exercise post-bundle downloads, request coalescing, retry and cache persistence without network access.
  const makeFuture = () => {
    const future = { window: {}, console, Date, AbortSignal, localStorage: context.localStorage };
    vm.createContext(future);
    for (const file of files.slice(0, 5)) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), future);
    return future;
  };
  const future = makeFuture();
  let calls = 0;
  const fixture = plain(data.years[2026].find(item => item.name.en === 'Shavuot'));
  fixture.date = '2030-06-07';
  future.fetch = async url => {
    calls++;
    const params = new URL(url).searchParams;
    assert.equal(params.get('i'), 'on');
    assert((new Date(params.get('end')) - new Date(params.get('start'))) / 86400000 < 180);
    return { ok: true, json: async () => ({ location: 'Israel', items: fixture.date >= params.get('start') && fixture.date <= params.get('end') ? [fixture] : [] }) };
  };
  const first = future.window.FestivalReadings.forDates([fixture.date]);
  const second = future.window.FestivalReadings.forDates([fixture.date]);
  assert.equal((await first).length, 1);
  assert.equal((await second).length, 1);
  assert.equal(calls, 3);
  const cached = makeFuture();
  cached.fetch = () => { throw new Error('Expected cached future-year data'); };
  assert.equal((await cached.window.FestivalReadings.forDates([fixture.date])).length, 1);
  const failing = makeFuture();
  failing.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(failing.window.FestivalReadings.forDates(['2031-06-07']), /503/);
  failing.fetch = async () => ({ ok: true, json: async () => ({ location: 'Diaspora', items: [] }) });
  await assert.rejects(failing.window.FestivalReadings.forDates(['2031-06-07']), /Invalid festival/);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const file of ['festival-readings.js?v=1', 'festival-readings-data.js?v=1']) {
    assert(html.includes(file));
    assert(sw.includes(file));
  }
  assert(html.includes('today-festival-readings') && html.includes('weekly-festival-readings'));
  console.log(`Festival checks passed: ${serviceCount} services, ${passageCount} readable ranges, 5 years offline; exact annual-plan baselines and progress unchanged; future-year cache/retry verified.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
