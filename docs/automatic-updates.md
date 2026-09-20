# Safe Updates With Approval

## User Behavior

- HTTPS deployments check on launch, foreground return and reconnection, and every five minutes while visible. Foreground checks are throttled to once a minute.
- Every page load, including refresh, checks for updates. Once a downloaded update is waiting and the page is safe, a native confirmation dialog asks whether to apply it. No pending update means no dialog. Cancellation leaves the current document in place and does not repeatedly prompt for the same release in that page session. The `새 버전 적용` button reopens confirmation; a later page load can ask again.
- Consent is bound to a specific release. Approval permits immediate safe activation/reload; if the user starts interacting again, the updater waits for 30 seconds of inactivity. Reading/commentary dialogs, all other dialogs, settings, unsaved name edits, focused inputs, selected text, app initialization and memory-only/unsaved progress block prompting, activation and reload. A successful storage snapshot is required before activation as well as reload.
- Multiple open app windows defer forced activation. Closing all old windows allows the browser's normal worker lifecycle to activate a fully installed update.
- Progress is not rewritten by the updater. A session snapshot preserves the selected date, calendar month, filters, scroll position, expanded festival readings and a closed reflection draft. Storage failures postpone reload. The existing saved active tab is reused.
- Each release is reloaded at most once within five minutes to prevent reload loops. Offline and local `file://` use never initiate automatic reloads.
- Clients still running the previous auto-update script use its old behavior until this release is loaded. Approval applies to subsequent waiting releases. The app cannot show a dialog while suspended, or retroactively gate a release the browser already activated after all old windows were closed. It never shows a fake approval after an update has already loaded.
- This is application-update consent, not permission for replacing an OS home-screen icon. The website cannot force the browser's separate app-identity review dialog. [Chrome app-identity update behavior](https://developer.chrome.com/blog/improvements-to-web-app-updates).

## Deployment and Recovery

`npm run build:release` hashes all assets in `tools/pwa-shell.json` and `assets/branding/asset-index.json`, plus the worker implementation. The resulting release ID and SHA-256 integrity values are embedded in `sw.js`. GitHub Pages builds this manifest before running the complete test suite and uploading the artifact. `npm test` rejects a stale manifest.

Installation bypasses HTTP cache and uses integrity-checked requests. All required assets must install successfully before activation is possible. A partial or mixed deployment fails installation and leaves the active release intact. This guards download/deployment failures, not every possible application bug; application tests remain required.

The worker does not call `skipWaiting()` during installation. It accepts `ACTIVATE_SAFE` only from the sole remaining window in its scope. The page rechecks its safety conditions after controller changes and before reloading. The current and preceding scoped shell caches are retained. Unrelated caches, legacy caches, existing scripture cache and all user storage are not deleted. Current-release lexicons take precedence over older runtime cache entries.

To roll back, redeploy the earlier application assets and rebuild the release. No user data reset is needed. Add new shell assets or versioned paths to `tools/pwa-shell.json` when changing HTML references; update scripture dataset paths/runtime cache version intentionally when changing lazy-loaded Bible data.

## Verification

`npm run test:update` verifies the generated manifest, installer failure, scoped cleanup, multi-window activation guard, current-release asset preference, consent/cancellation/retry, release replacement during approval, already-running installation, first-install behavior, controller changes, storage/idle/editing/offline gates and one-shot reload behavior. Browser testing must additionally exercise real worker installation, mixed-deployment rejection, draft/progress restoration and offline reopening.

The preceding automatic-update version was verified on 2026-09-20 in Chromium at a 390px viewport: real release-to-release installation, reader/editing deferral, closed draft/date/tab restoration, repeat-reload prevention, SHA-256 rejection of an altered asset, offline reopening of the preceding release and cached Bible, and multi-window deferral/resumption while preserving progress written in another window. The new approval behavior has automated VM coverage, not a new browser/device test. Native iOS/Safari device testing was not performed.

Lifecycle references: [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle), [registration.update](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update), [skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting).
