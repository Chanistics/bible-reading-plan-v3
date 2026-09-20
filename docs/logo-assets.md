# P274 Logo Assets

The app logo was reconstructed from the existing low-resolution bitmap using the built-in image generation tool on 2026-09-20. The P274 lettering, tagline, dark background and warm light lettering were retained. No external font or remote image is required at runtime.

## Files

- `logo-highres.png`: native generated master, 1254 x 1254 pixels. The request asked for 2048 x 2048 if supported; the returned image is 1254 x 1254 and has not been artificially enlarged.
- `icon-1024.png`: 1024 x 1024 installable-app icon.
- `icon-512.png`: 512 x 512 installable-app icon.
- `icon-192.png`: 192 x 192 installable-app icon and favicon.
- `apple-touch-icon.png`: 180 x 180 iOS home-screen icon.

All application sizes are Lanczos3 downscales of the same master. The original generated master retains its embedded provenance metadata. Icon URLs and the shell cache were versioned to replace the old blurred images. Already-installed home-screen icons may still need to be removed and added again, depending on the browser/OS.

## Generation Prompt

```text
Use case: precise-object-edit (logo restoration).
Asset type: P274 Bible Reading Plan app logo and installable app icon.
Input image 1 is the edit target: the current blurred 512x512 logo.
Primary request: faithfully reconstruct this EXACT logo as a crisp, pristine high-resolution 2048x2048 square PNG. This is a resolution/quality restoration, NOT a redesign. Redraw the typography at native high resolution; do not simply enlarge or sharpen the blurred pixels.
Preserve: solid near-black charcoal background (#232323), the large warm light beige P274 lettering, its tall bold condensed geometric sans-serif letterforms with squared rounded corners, original centered placement and proportions, and the smaller off-white serif tagline below.
Text verbatim, top: "P274".
Text verbatim, bottom: “To Behold His Beauty” (include the typographic opening and closing double quotation marks).
Layout on a 2048 square: main P274 spans approximately x=256 to 1792 and y=496 to 1240; tagline centered approximately y=1390 to 1518, spanning approximately x=105 to 1945. Match the reference proportions, spacing and capitalization. Keep all text comfortably within the square. No additional text, imagery, symbols, version number or borders.
Quality: perfectly clean, smooth anti-aliased outlines, uniform flat letter color, no blur, no glow, no drop shadows, no bevel, no texture or gradients, no photographic effects, no mockup framing. One flat front-facing logo only. Opaque square background. Output 2048x2048 if supported.
```

