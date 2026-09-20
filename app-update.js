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

  function safeToApply() {
    const focused = document.activeElement;
    return document.visibilityState === 'visible' && navigator.onLine &&
      Date.now() - lastActivity >= IDLE_MS &&
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

  function showReady(visible) {
    document.getElementById('app-update-status')?.classList.toggle('hidden', !visible);
  }

  async function applyWhenSafe() {
    if (working || reloading || !safeToApply()) return;
    working = true;
    try {
      if (pendingReload && navigator.serviceWorker.controller) {
        const { release } = await message(navigator.serviceWorker.controller, 'GET_RELEASE');
        if (!release || !safeToApply()) return;
        const previous = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null');
        if (previous?.release === release && Date.now() - previous.at < 5 * 60000) return;
        if (!window.AppUpdateBridge.prepareReload()) return;
        sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ release, at: Date.now() }));
        reloading = true;
        location.reload();
      } else if (registration?.waiting) {
        await message(registration.waiting, 'ACTIVATE_SAFE');
      }
    } catch (error) {
      // Offline, quota and worker failures leave the current document and user data intact.
      console.warn('Automatic update postponed:', error);
    } finally { working = false; }
  }

  async function checkForUpdate() {
    if (!registration || !navigator.onLine || document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    try { await registration.update(); } catch (_) { /* Retry on the next foreground/online check. */ }
    showReady(Boolean(registration.waiting) || pendingReload);
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
  });

  async function start() {
    try {
      registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') showReady(Boolean(registration.waiting));
        });
      });
      showReady(Boolean(registration.waiting));
      await checkForUpdate();
      setInterval(checkForUpdate, CHECK_MS);
      setInterval(applyWhenSafe, 5000);
    } catch (error) { console.warn('Automatic update registration unavailable:', error); }
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
