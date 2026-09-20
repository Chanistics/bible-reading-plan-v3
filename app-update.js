(function () {
  'use strict';
  if (!['http:', 'https:'].includes(location.protocol) || !('serviceWorker' in navigator)) return;

  const IDLE_MS = 30000;
  const CHECK_MS = 5 * 60000;
  const RELOAD_KEY = 'p274_update_last_reload';
  let lastActivity = Date.now();
  let lastCheck = 0;
  let registration;
  let controller = navigator.serviceWorker.controller;
  let pendingReload = false;
  let working = false;
  let reloading = false;
  let approvedRelease = null;
  let approvalActivity = null;

  function safeToApply(requireIdle = false) {
    const focused = document.activeElement;
    return document.visibilityState === 'visible' && navigator.onLine &&
      (!requireIdle || lastActivity === approvalActivity || Date.now() - lastActivity >= IDLE_MS) &&
      !focused?.matches('input, textarea, select, [contenteditable="true"]') &&
      !window.getSelection()?.toString() && window.AppUpdateBridge?.isSafe() === true;
  }

  function message(worker, type) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Update worker timed out')); }, 4000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  function showReady(visible, label = '새 버전 적용') {
    const button = document.getElementById('app-update-status');
    if (!button) return;
    button.textContent = label;
    button.classList.toggle('hidden', !visible);
  }

  function candidateWorker() {
    return pendingReload ? navigator.serviceWorker.controller : registration?.waiting;
  }

  async function applyWhenSafe({ manual = false } = {}) {
    if (working || reloading || !safeToApply()) return;
    const worker = candidateWorker();
    if (!worker || !controller) return;
    working = true;
    try {
      const { release } = await message(worker, 'GET_RELEASE');
      if (!release || candidateWorker() !== worker || !safeToApply()) return;
      if (approvedRelease !== release) {
        window.alert('새 버전으로 업데이트합니다.\n\n확인을 누르면 업데이트가 진행됩니다.\n저장된 통독 기록은 유지됩니다.');
        // Acknowledgement applies only to the announced release.
        approvedRelease = release;
        approvalActivity = lastActivity;
      }
      if (candidateWorker() !== worker || !safeToApply(!manual)) return;
      if (pendingReload && navigator.serviceWorker.controller) {
        const previous = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null');
        if (previous?.release === release && Date.now() - previous.at < 5 * 60000) return;
        if (!window.AppUpdateBridge.prepareReload()) {
          showReady(true, '기록 저장 후 업데이트 다시 확인');
          return;
        }
        sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ release, at: Date.now() }));
        reloading = true;
        location.reload();
      } else if (registration?.waiting) {
        if (!window.AppUpdateBridge.prepareReload()) {
          showReady(true, '기록 저장 후 업데이트 다시 확인');
          return;
        }
        const result = await message(worker, 'ACTIVATE_SAFE');
        if (!result.activated) showReady(true, '다른 앱 창을 닫은 뒤 업데이트 확인');
      }
    } catch (error) {
      // Offline, quota and worker failures leave the current document and user data intact.
      showReady(true, '업데이트 다시 확인');
      console.warn('Approved update postponed:', error);
    } finally { working = false; }
  }

  async function checkForUpdate() {
    if (!registration || !navigator.onLine || document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    try { await registration.update(); } catch (_) { /* Retry on the next foreground/online check. */ }
    showReady(Boolean(registration.waiting) || pendingReload);
    await applyWhenSafe();
  }

  ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'].forEach(type => {
    window.addEventListener(type, () => { lastActivity = Date.now(); }, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lastActivity = Date.now(); checkForUpdate(); }
  });
  window.addEventListener('focus', () => { lastActivity = Date.now(); checkForUpdate(); });
  window.addEventListener('online', checkForUpdate);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controller) pendingReload = true;
    controller = navigator.serviceWorker.controller;
    showReady(pendingReload);
    applyWhenSafe();
  });
  document.getElementById('app-update-status')?.addEventListener('click', () => applyWhenSafe({ manual: true }));

  function watchInstalling(worker) {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        showReady(Boolean(registration.waiting));
        applyWhenSafe();
      }
    });
  }

  async function start() {
    try {
      registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => watchInstalling(registration.installing));
      watchInstalling(registration.installing);
      showReady(Boolean(registration.waiting));
      await checkForUpdate();
      setInterval(checkForUpdate, CHECK_MS);
      setInterval(applyWhenSafe, 5000);
    } catch (error) { console.warn('Automatic update registration unavailable:', error); }
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
