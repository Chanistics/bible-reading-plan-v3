# Icons and Launch Screens

## Changes

- Existing P274 identity, app name, start URL and installed-app identity remain unchanged.
- Icon URLs now contain a content hash. Manifest icons are 192, 512 and 1024 pixels; separate padded maskable icons are 512 and 1024 pixels. Apple touch icons are 152, 167 and 180 pixels. All derive from the existing 1254-pixel `logo-highres.png` master without enlargement.
- The manifest stays at `manifest.json?v=2`. Its explicit `id` matches the previous implicit identity (`./index.html`). Do not change this URL to force icon updates.
- Nineteen screen-size/density profiles have separate portrait and landscape PNG launch screens: 38 images at actual display pixel dimensions. The logo occupies at most 220 CSS pixels, avoiding enlargement of a small icon across the screen. These files are palette-optimized to keep offline downloads smaller.
- Returning readers see a resolution-appropriate P274 loading mark instead of a flash of the welcome screen. Initialization success and failure both dismiss it, with a 10-second fallback if application scripts fail.
- The welcome scene uses separate landscape and portrait assets. Built-in image generation returned native 1672x941 and 941x1672 PNG masters, not the requested 3840x2160/2160x3840. Neither is artificially enlarged. WebP delivery assets preserve these dimensions; they do not claim 4K detail.

## Files and Rebuild

`assets/branding/asset-index.json` lists every delivered file and its dimensions. The generated `branding.css` chooses the background orientation. Master photographs are `assets/branding/welcome-landscape-source.png` and `assets/branding/welcome-portrait-source.png`. `hero.png` and old root icons remain for compatibility but are no longer selected by the current UI.

`npm run build:branding` requires the Sharp image library (available in the bundled Codex Node runtime via `NODE_PATH`). It generates assets, updates manifest icons and the marked icon/launch blocks in `index.html`, and writes the asset index. Run `npm run build:release` afterward. Ordinary deployment and tests consume the committed images and do not need Sharp. Do not delete earlier published content-hashed assets while old clients might reference them.

The release manifest includes all delivered branding assets for offline use and verifies their hashes. `npm run test:branding` checks image headers, sizes, content hashes, manifest identity, launch media queries, release coverage and loading-screen recovery.

## Platform Limits

Updating page files is not the same as replacing an OS home-screen icon. The app supplies new icon URLs but cannot approve an identity-change prompt on the user's behalf. Chrome 144 detects icon metadata/URL changes; significant identity changes can require user review, while small visual differences may apply automatically. Safari gives `apple-touch-icon` precedence over manifest icons. Existing installed icons and native launch snapshots can remain cached by the OS. Do not delete an installed app or its site data merely to refresh an icon without protecting local reading progress first.

Sources: [Chrome update behavior, January 2026](https://developer.chrome.com/blog/improvements-to-web-app-updates), [WebKit icon precedence](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple launch images](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

Real iOS/Android installed-icon replacement and native launch behavior require device testing; metadata and pixel validation do not prove that an OS has replaced a cached icon.

## Generation Prompts

Both backgrounds used the built-in image generation tool, with the previous `hero.png` as the edit target. No API/CLI fallback was used.

Landscape: "Use case: precise-object-edit. Asset type: high-resolution welcome background for the existing P274 Bible Reading Plan app. Input image 1 is the edit target and composition reference. Reconstruct this existing photograph at native 3840 by 2160 landscape resolution, or the highest supported landscape resolution, with much clearer genuine fine detail, not a blurred upscale. Preserve the scene and quiet mood: the open aged Bible with fine paper and a burgundy bookmark resting on a linen-covered wooden desk, daylight through a window, a modest vase in the distant background. Keep the open Bible clearly in focus and unobstructed in the center-right/lower-right so the left side has usable space for the app's existing text overlay. Neutral daylight, balanced natural wood and paper colors; avoid a strong yellow filter. Keep the real book legible as a book, crisp page edges, fine linen texture and faithful book proportions. No logos, no large text, no UI, no decorative orbs, no dark overlay, no added frame. This is a faithful resolution/format improvement of the existing backdrop, not a new theme."

Portrait: "Use case: precise-object-edit. Asset type: portrait mobile welcome background for P274 Bible Reading Plan. Image 1 is the edit target. Reconstruct the same quiet Bible-on-a-desk scene for a tall phone screen at native 2160x3840 or the highest supported portrait resolution, improving genuine detail rather than blurring or mechanically enlarging the old image. Open aged Bible, burgundy ribbon, natural linen and wooden desk, window daylight, modest background vase. Keep the ENTIRE open Bible clearly focused and fully inside the middle of the portrait image, with breathing room at the top and darker natural desk/linen space below where app UI can overlay. Preserve the existing scene, neutral natural daylight, restrained colors, crisp book/page edges, detailed textile, faithful proportions. No logos, no added text or typography, no interface, no frame, no artificial orbs, no dark overlay, no fake UI. This is a faithful high-resolution portrait derivative of the current backdrop."
