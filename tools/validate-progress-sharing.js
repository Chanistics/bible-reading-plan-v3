const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const nodes = new Map();
const storage = new Map();
let activeElement;
let selectedText = '';
let copiedText = '';
let copyAllowed = true;
class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.readOnly = false;
    this.disabled = false;
    this.isConnected = true;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.handlers = new Map();
    this.classes = new Set(['hidden']);
    this.classList = {
      add: value => this.classes.add(value),
      remove: value => this.classes.delete(value),
      contains: value => this.classes.has(value)
    };
  }
  addEventListener(event, handler) { this.handlers.set(event, handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector() { return null; }
  appendChild(child) { child.parent = this; }
  remove() { this.isConnected = false; }
  select() { selectedText = this.value; }
  focus() { activeElement = this; }
}
const node = id => {
  if (!nodes.has(id)) nodes.set(id, new Element());
  return nodes.get(id);
};
const document = {
  getElementById: node,
  querySelector: selector => node(selector),
  querySelectorAll: () => [],
  createElement: () => new Element(),
  get activeElement() { return activeElement; },
  body: new Element(),
  execCommand: () => { copiedText = selectedText; return copyAllowed; }
};
const fixedNow = new Date('2026-09-19T03:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow.getTime(); }
}
const context = {
  window: { addEventListener() {}, isSecureContext: true, renders: 0 },
  document, HTMLElement: Element, navigator: {}, Date: FixedDate,
  console: { ...console, error() {} }, setTimeout, clearTimeout,
  requestAnimationFrame: callback => callback(),
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  sessionStorage: { getItem: () => null }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
const run = source => vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

async function main() {
  const prior = { overrideToday: '2030-01-01', progress: { '2026-09-17': { torah: true } }, familyName: '우리 집', theme: 'light' };
  const normalized = context.normalizeAppState(prior);
  assert(!Object.hasOwn(normalized, 'overrideToday'));
  assert.deepEqual(plain(normalized.progress), prior.progress);
  assert.equal(normalized.familyName, prior.familyName);
  assert.equal(normalized.theme, prior.theme);
  run("appState = createDefaultAppState(); appState.overrideToday = '2030-01-01';");
  const realLocalDate = new Date(fixedNow);
  realLocalDate.setMinutes(realLocalDate.getMinutes() - realLocalDate.getTimezoneOffset());
  assert.equal(context.getTodayStr(), realLocalDate.toISOString().slice(0, 10));

  const past = '2026-09-17';
  const day = { torah: 'Genesis 1:1-1:5', torahCompletion: 'Deuteronomy 34:1-34:12', megillah: '룻기 1장', ot: [{ book: '요나', chapter: 1 }], nt: [{ book: '마태복음', chapter: 1 }] };
  context.window.fixture = { [past]: day, '2026-09-18': { nt: [{ book: '마태복음', chapter: 2 }] }, '2026-09-19': { torah: 'Genesis 2:1-2:3' } };
  run('currentPlan = window.fixture; appState = createDefaultAppState(); renderDashboard = () => { window.renders++; };');
  assert.equal(context.getCalendarReadingStatus(past, day, { torah: true }), 'incomplete');
  assert.equal(context.getCalendarReadingStatus('2026-09-19', day, {}), 'incomplete');
  assert.equal(context.getCalendarReadingStatus('2026-09-20', day, {}), 'upcoming');
  assert.equal(context.getCalendarReadingStatus(past, null), '');
  assert.equal(context.getCalendarReadingStatus(past, { ot: [], nt: [] }), '');
  assert.equal(context.isDayCompleted({}, {}), false);
  context.setupScheduleViewActions();
  const checkbox = { checked: true, dataset: { completionDate: past }, closest() { return this; } };
  node('weekly-schedule-container').handlers.get('change')({ target: checkbox });
  const progress = run(`appState.progress['${past}']`);
  assert.deepEqual(plain(progress), { torah: true, torahCompletion: true, megillah: true, ot: true, nt: true });
  assert.equal(context.getCalendarReadingStatus(past, day, progress), 'completed');
  assert.equal(context.getCalendarReadingStatus('2026-09-20', day, progress), 'completed');
  assert.equal(context.calculateStats().completedDays, 1);
  assert.equal(context.calculateStats().percentage, 71);
  assert.equal(run("Object.keys(appState.progress).length"), 1);
  assert.equal(context.window.renders, 1);
  assert.equal(activeElement, node(`[data-completion-date="${past}"]`));
  assert.equal(context.loadAppState().progress[past].megillah, true);
  checkbox.checked = false;
  node('weekly-schedule-container').handlers.get('change')({ target: checkbox });
  assert.equal(context.getCalendarReadingStatus(past, day, run(`appState.progress['${past}']`)), 'incomplete');
  assert.equal(context.calculateStats().completedDays, 0);
  assert.equal(context.window.renders, 2);
  context.setDayCompletion('1900-01-01', true);
  assert.equal(run("Object.keys(appState.progress).length"), 1);

  context.setupReflectionShareActions();
  const note = node('reflection-share-note');
  const modal = node('reflection-share-modal');
  const status = node('reflection-share-status');
  const submit = node('btn-submit-share');
  context.openReflectionShareModal();
  assert.equal(submit.disabled, true);
  assert.equal(modal.classList.contains('hidden'), false);
  let shared;
  context.navigator.share = async content => { shared = plain(content); };
  note.value = '   ';
  await context.shareReflection();
  assert.equal(shared, undefined);
  assert.equal(note.attributes.get('aria-invalid'), 'true');
  note.value = '  오늘 말씀에서 배운 감사\n작은 일부터 실천하기  ';
  note.handlers.get('input')({ target: note });
  assert.equal(submit.disabled, false);
  assert.deepEqual(plain(context.getReflectionShareContent()), { text: note.value.trim() });
  await context.shareReflection();
  assert.deepEqual(shared, { text: '오늘 말씀에서 배운 감사\n작은 일부터 실천하기' });
  assert.equal(modal.classList.contains('hidden'), true);
  assert.equal(note.value, '');
  assert.equal(submit.disabled, true);

  note.value = '취소해도 남을 묵상';
  context.openReflectionShareModal();
  context.navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
  await context.shareReflection();
  assert.equal(modal.classList.contains('hidden'), false);
  assert.equal(note.value, '취소해도 남을 묵상');
  assert.equal(status.textContent, '');
  assert.equal(note.readOnly, false);
  context.navigator.share = async () => { throw new Error('Unavailable'); };
  await context.shareReflection();
  assert(status.textContent.includes('공유하지 못했습니다'));
  assert.equal(note.value, '취소해도 남을 묵상');

  delete context.navigator.share;
  context.navigator.clipboard = { writeText: async text => { copiedText = text; } };
  context.openReflectionShareModal();
  assert.equal(submit.textContent, '묵상 복사');
  await context.shareReflection();
  assert.equal(copiedText, note.value);
  assert.equal(status.textContent, '묵상이 복사되었습니다.');
  context.navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  note.value = '로컬 파일에서 복사할 묵상';
  note.focus();
  await context.shareReflection();
  assert.equal(copiedText, note.value);
  assert.equal(activeElement, note);
  copyAllowed = false;
  await context.shareReflection();
  assert(status.textContent.includes('공유하지 못했습니다'));
  assert.equal(note.value, '로컬 파일에서 복사할 묵상');

  let finishShare;
  let shareCalls = 0;
  context.navigator.share = () => { shareCalls++; return new Promise(resolve => { finishShare = resolve; }); };
  const pending = context.shareReflection();
  assert.equal(note.readOnly, true);
  context.openReflectionShareModal();
  assert.equal(submit.disabled, true);
  await context.shareReflection();
  assert.equal(shareCalls, 1);
  finishShare();
  await pending;
  assert.equal(note.readOnly, false);
  assert.equal(note.value, '');

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(!html.includes('override-date'));
  assert(!html.includes('progress-share-preview'));
  assert(html.includes('reflection-share-modal'));
  assert(html.includes('calendar-reading-legend'));
  console.log('Progress and sharing checks passed: past-day completion/undo, persistence, calendar states, real dates, reflection-only sharing, cancellation, and local clipboard fallback.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
