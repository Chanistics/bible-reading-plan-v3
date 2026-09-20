(function () {
  'use strict';

  const RULES = [
    ['Rosh Hashana', '나팔절', 'rosh-hashana'],
    ['Yom Kippur', '대속죄일', 'yom-kippur'],
    ['Pesach', '유월절', 'pesach'],
    ['Shavuot', '칠칠절', 'shavuot'],
    ['Sukkot', '초막절', 'sukkot'],
    ['Shmini Atzeret', '쉐미니 아쩨렛 · 심하트 토라', 'shmini-atzeret'],
    ['Simchat Torah', '쉐미니 아쩨렛 · 심하트 토라', 'shmini-atzeret'],
    ["Tish'a B'Av", '티샤 베아브', 'tisha-bav'],
    ['Purim', '부림절', 'purim']
  ];
  const pendingYears = new Map();
  const loadedYears = new Map();

  function getRule(item) {
    if (item.type !== 'holiday') return null;
    const name = String(item.name?.en || '').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/^Erev /, '');
    return RULES.find(([prefix]) => name === prefix || name.startsWith(prefix + ' ')) || null;
  }

  function getData() {
    return window.FESTIVAL_READINGS_DATA;
  }

  function coordinate(value) {
    if (!/^\d+:\d+$/.test(value)) throw new Error(`Invalid festival coordinate: ${value}`);
    return value.split(':').map(Number);
  }

  function convertCoordinate(book, value, isEnd) {
    const [chapter, verse] = coordinate(value);
    // Keep the existing Torah conversion, including combined commandments.
    if (['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'].includes(book)) {
      return mapTorahVerse(book, chapter, verse, isEnd);
    }
    const rule = (getData().verseMappings[book] || []).find(row =>
      chapter === row[0] && verse >= row[1] && verse <= row[2]);
    return rule ? { chapter: rule[3], verse: rule[4] + verse - rule[1] } : { chapter, verse };
  }

  function convertRange(part) {
    const book = getData().books[part.k];
    if (!book) throw new Error(`Unknown festival book: ${part.k}`);
    const start = convertCoordinate(part.k, part.b, false);
    const end = convertCoordinate(part.k, part.e, true);
    const counts = book.verseCounts;
    if (start.chapter > end.chapter || (start.chapter === end.chapter && start.verse > end.verse) ||
        start.verse < 1 || end.verse < 1 || start.verse > (counts[start.chapter - 1] || 0) ||
        end.verse > (counts[end.chapter - 1] || 0)) {
      throw new Error(`Invalid converted festival range: ${JSON.stringify(part)}`);
    }
    const finish = start.chapter === end.chapter ? String(end.verse) : `${end.chapter}:${end.verse}`;
    const wholeChapters = start.verse === 1 && end.verse === counts[end.chapter - 1];
    const title = wholeChapters
      ? `${book.name} ${start.chapter === end.chapter ? start.chapter : `${start.chapter}-${end.chapter}`}장`
      : `${book.name} ${start.chapter}:${start.verse}${start.chapter === end.chapter && start.verse === end.verse ? '' : `-${finish}`}`;
    return { title, book: book.name, startCh: start.chapter, startVs: start.verse, endCh: end.chapter, endVs: end.verse };
  }

  function normalizeItem(item) {
    const rule = getRule(item);
    if (!rule) return null;
    const name = item.name.en;
    const period = name.startsWith('Erev ') ? '저녁' : name.includes('(Mincha)') ? '오후' : '낮';
    const ordinal = name.match(/\b(I|II|III|IV|V|VI|VII)\b/);
    const day = ordinal ? ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].indexOf(ordinal[1]) + 1 : null;
    let detail = name.includes('Shabbat Chol ha-Moed') ? '중간 안식일'
      : /Chol ha-Moed Day (\d+)/.test(name) ? `중간일 ${name.match(/Day (\d+)/)[1]}`
      : name.includes('Hoshana Raba') ? '호샤나 라바'
      : day ? `${day}일째` : '';
    if (name.includes("CH''M")) detail += ' · 중간일';
    const readings = [];
    const add = (kind, part) => {
      if (!part) return;
      const reading = { kind, ...convertRange(part) };
      if (!readings.some(existing => existing.kind === kind && existing.title === reading.title)) readings.push(reading);
    };
    const maftir = item.fullkriyah?.M;
    // A Mincha's final aliyah is not an extra reading; classify only separate summary parts as maftir.
    (item.summaryParts || []).filter(part =>
      ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'].includes(part.k)).forEach(part => {
      const isMaftir = maftir && ['k', 'b', 'e'].every(key => maftir[key] === part[key]);
      add(isMaftir ? 'maftir' : 'torah', part);
    });
    (Array.isArray(item.haft) ? item.haft : item.haft ? [item.haft] : []).forEach(part => add('haftarah', part));
    const scrolls = new Map();
    Object.values(item.megillah || {}).forEach(part => {
      const range = scrolls.get(part.k);
      if (range) range.e = part.e;
      else scrolls.set(part.k, { ...part });
    });
    scrolls.forEach(part => add('megillah', part));
    if (!readings.length) throw new Error(`Festival reading has no passages: ${name}`);
    return {
      id: `${item.date}:${name}`,
      date: item.date,
      name: rule[1],
      originalName: name,
      detail: [detail, period].filter(Boolean).join(' · '),
      sourceUrl: `https://www.hebcal.com/holidays/${rule[2]}-${item.date.slice(0, 4)}?i=on`,
      readings
    };
  }

  function normalizeYear(items) {
    const dates = {};
    const seen = new Set();
    items.forEach(item => {
      const event = normalizeItem(item);
      if (!event || seen.has(event.id)) return;
      seen.add(event.id);
      (dates[event.date] ||= []).push(event);
    });
    return dates;
  }

  async function fetchYear(year) {
    const items = [];
    const last = Date.UTC(year, 11, 31);
    for (let start = Date.UTC(year, 0, 1); start <= last; start += 180 * 86400000) {
      const end = Math.min(start + 179 * 86400000, last);
      const startDate = new Date(start).toISOString().slice(0, 10);
      const endDate = new Date(end).toISOString().slice(0, 10);
      const response = await fetch(`https://www.hebcal.com/leyning?cfg=json&i=on&triennial=off&start=${startDate}&end=${endDate}`, {
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Festival readings returned ${response.status}`);
      const data = await response.json();
      if (data.location !== 'Israel' || !Array.isArray(data.items)) throw new Error('Invalid festival calendar');
      items.push(...data.items.filter(getRule));
    }
    return items;
  }

  async function loadYear(year) {
    if (loadedYears.has(year)) return loadedYears.get(year);
    const bundled = getData().years[String(year)];
    if (bundled) {
      const dates = normalizeYear(bundled);
      loadedYears.set(year, dates);
      return dates;
    }
    if (pendingYears.has(year)) return pendingYears.get(year);
    const storageKey = `p274_festival_israel_v1_${year}`;
    const promise = (async () => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey));
        if (Array.isArray(stored) && stored.length && stored.every(item => item.date?.startsWith(`${year}-`))) {
          const dates = normalizeYear(stored);
          loadedYears.set(year, dates);
          return dates;
        }
      } catch (_) { /* A corrupt or unavailable cache must not prevent a fresh download. */ }
      const items = await fetchYear(year);
      const dates = normalizeYear(items);
      loadedYears.set(year, dates);
      try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch (_) { /* Storage is optional. */ }
      return dates;
    })();
    pendingYears.set(year, promise);
    try { return await promise; } finally { pendingYears.delete(year); }
  }

  async function forDates(dates) {
    const uniqueDates = [...new Set(dates)].sort();
    for (const year of new Set(uniqueDates.map(date => Number(date.slice(0, 4))))) await loadYear(year);
    return uniqueDates.flatMap(date => loadedYears.get(Number(date.slice(0, 4)))[date] || []);
  }

  window.FestivalReadings = { getRule, normalizeItem, normalizeYear, convertRange, fetchYear, forDates };
})();
