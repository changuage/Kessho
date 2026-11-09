# Point Clouds portfolio implementation

Implemented locally on 2026-10-28 in `point-clouds/index.html`.

## Latest refinement — 2026-10-31

- Centred smoked-glass profile with centre-aligned headings, biography, dates, project descriptions, portrait and contact information. Existing profile content, photo and links are preserved.
- Opening and closing use a 240ms opacity-only fade. Close, outside click and Escape keep the native modal active until fade-out finishes, then restore focus and resume the visual clock. Reduced motion and hidden-page dismissal close immediately.
- Opening captures the current WebGL frame and pauses rendering as before. A quarter-resolution copy, capped at 512 pixels on its longest side, receives three sliding box-blur passes approximating Gaussian blur. Only the cached bitmap beneath the panel is softened; surrounding artwork remains sharper and dimmed. A warm translucent tint and lifted cached highlights retain cloud visibility without filtering text or the portrait.
- The blur uses the same portable pixel implementation in Chromium and WebKit, rather than relying on Canvas 2D `filter`, which is unavailable in the tested WebKit build. Scratch storage is reused, no live backdrop filter is applied, and the cache rebuilds only on opening or resize—not while reading or scrolling. The existing background grain remains paused during reading.
- Particle shaders, spatial physics and audio lifecycle code hashes are unchanged. No engine, timing, preset, reverb or playback source changes were made.

### Refinement verification

- All 21 Chromium HTTP browser tests pass for the frosted implementation before the final cache-resolution/image-size tuning. Seven focused direct-file Chromium tests pass on the final version, including cached blur, fade lifecycle, mobile bounds, portrait layout, morph-clock pause/reset, reduced motion and real Product Core start/stop through repeated popup opens.
- Four final direct-file WebKit visual/accessibility tests pass. WebKit HTTP real Product Core playback starts/stops twice and continues while the profile is open.
- WebKit direct-file audio startup fails before opening the profile with `Kessho Product runtime did not enter the running state.` This occurs with zero popup interactions and the audio code is unchanged. It remains a separate runtime/startup limitation; no audio workaround was added.
- `npm run test:point-clouds-bridge`: all 9 pass. `npm run build:point-clouds` succeeds and updates the seven-file `dist-point-clouds/` artifact. `git diff --check` passes.
- Screenshots: `frosted-desktop.png`, `frosted-desktop-1280.png`, `mobile-about.png`, and the existing responsive profile screenshots under `docs/reports/point-clouds-portfolio/`.
- Physical-phone battery, heat and audio endurance were not tested. Headless WebKit is not a test of the installed Safari application.

## Earlier portfolio iterations

- Immediately visible artist mark and serif wordmark, Work/About navigation, and a quiet artist descriptor, including during the intro. Instrument Serif and Manrope replace the plain Arial presentation; the Poiret One particle lettering is unchanged.
- Native, keyboard-accessible ivory portfolio sheet with Kessho and the supplied biographical facts; an offset desktop composition and a full-screen mobile reading surface. A cached still is rendered once from the existing point-cloud shader, and the project listening action reuses the existing playback control.
- Fixed desktop backdrop blur over a captured particle frame. Opening the dialog freezes the visual timeline, rotation and release transition; closing resumes them. Existing audio keeps playing.
- Clear audio lifecycle labels, prevention of duplicate start/stop requests, explicit error/retry handling, and working footer Listen control during the intro.
- Removed coordinates, scene labels, central descriptor, crosshair, custom cursor and synthetic bar meter, including their unused update paths.
- 10,000 mobile particles, 1× rendering resolution cap and 30fps draw cap; desktop retains 30,000 particles and a 60fps cap. Physics uses bounded substeps, audio smoothing uses elapsed time, and reduced motion renders on demand.
- Portfolio access remains available when WebGL is unavailable.
- The protected logo/title geometry, relative letter sizing, Z depth, rotation pivot, shader breathing and Kessho engine assets were preserved.
- A miniature logo in the playback control responds to existing master-output telemetry, with no extra analysis or animation loop. Reduced motion disables this movement.
- The first live field is randomly selected from all four original patterns. Every 15 visible seconds it starts a 15-second morph to a different random pattern, producing continuous transitions with no settled pause between them. Manual scroll/arrow changes restart the countdown; opening the portfolio or hiding the tab pauses it. The intro and audio engine remain independent, and reduced motion keeps the field static with manual switching available.
- A higher-contrast photographic vignette combines soft corner falloff, warm amber/bronze edge tones and darker header/footer zones. A single procedural 192×192 PNG tile at its original fine 192×192 CSS-pixel scale supplies low-opacity monochrome texture over the artwork and controls, with faint stationary scanlines; a quieter, clipped grain layer covers the ivory portfolio sheet. CSS moves the cached tile in low-rate steps (slower on mobile), without a new JavaScript loop or per-frame noise generation. Background grain freezes while the sheet is open, all grain pauses when hidden, and reduced motion makes it static. Removed the old pointer-driven vignette style writes.

## Verification

Completed:

- `npm run build`: passes. The existing non-module bridge-script and large-chunk build warnings remain.
- `npm run test:point-clouds-bridge`: 9 tests pass.
- `node --import tsx --test src/ui/pointCloudsPresetFallback.test.ts`: 3 tests pass. This invokes the same test file as the npm command without tsx CLI's sandbox-blocked IPC listener.
- `node --test point-clouds/portfolio.browser.test.mjs`: all 17 Chromium browser tests pass, including random selection across all four patterns, 20-second cadence, smooth interpolation, non-repetition, manual reset, dialog/hidden-tab pause, reduced-motion behavior, grain-layer clipping, input pass-through and cached grain animation.
- WebKit checks for dialog capture/focus/scrolling, mobile layout, WebGL-unavailable access and real Product Core playback: all 4 selected tests pass.
- Chromium direct `file://` playback: real Product Core start/stop twice, nonzero output telemetry and uninterrupted playback in the dialog pass.
- The four focused random-pattern/reduced-motion/real-playback tests also pass in WebKit and Chromium direct `file://` mode.
- After the film treatment, four focused mobile/grain/reduced-motion/real-playback tests pass in WebKit; three grain/reduced-motion/real-playback tests pass in Chromium direct `file://` mode. The existing shader, shared physics and embedded bridge hashes remain unchanged.
- The latest 10-second-morph/warm-vignette/larger-grain adjustment passes six focused Chromium checks and four WebKit checks, including a half-complete morph at five seconds, completion at ten seconds, unchanged 20-second cadence, enlarged cached grain, mobile layout and reduced motion.
- Subsequent tuning restores fine grain and sets both morph duration and cadence to 15 seconds. Three focused direct-file Chromium checks pass, including halfway progression at 7.5 seconds, transition handoff at 15 seconds, non-repetition, countdown pause/reset and reduced motion.
- Latest record-sleeve and random-morph refinements pass `node node_modules/vite/bin/vite.js build` and `git diff --check`; the existing build warnings remain.
- Actual audio-engine HTTP playback starts and stops twice in both Chromium and WebKit. The lifecycle tests also use an explicitly isolated test fixture to check failure/retry and duplicate submissions; production contains no replacement audio or simulated telemetry.
- Protected particle geometry functions compare unchanged against the previous tracked page.
- Layouts checked at 1440×900, 1280×720, 390×844, 360×740 and 844×390, plus a 720×450 viewport corresponding to a smaller desktop CSS viewport at 200% zoom. Dialogs fit without horizontal overflow.
- Verified intro pause at the opening hold, spin and title; pause during the release; ten repeated open/close cycles; keyboard focus and Escape; window visibility pause/resume; and on-demand reduced-motion drawing.

Browser suite requires a running Vite server:

```sh
npm run dev -- --host 127.0.0.1 --port 5175
node --test point-clouds/portfolio.browser.test.mjs
```

Optional browser/URL overrides:

```sh
POINT_CLOUDS_TEST_BROWSER=webkit node --test --test-name-pattern='portfolio is immediately|mobile stays|real Product|without WebGL' point-clouds/portfolio.browser.test.mjs
POINT_CLOUDS_TEST_URL=file:///absolute/path/to/point-clouds/index.html node --test --test-name-pattern='real Product' point-clouds/portfolio.browser.test.mjs
```

Screenshots saved locally under `docs/reports/point-clouds-portfolio/`:

- `desktop-initial.png`
- `desktop-title-before.png` and `desktop-title.png`
- `desktop-live.png`
- `desktop-work.png` and `desktop-about.png`
- `mobile-about.png`
- `film-desktop-work.png`, `film-mobile-home.png` and `film-reduced-motion.png`

## Content still needed

Past-project titles, dates, short descriptions and public links; an artist contact email or public profile; and a preferred public Kessho destination. These were not present in the inspected project material. Selected work and Contact are omitted rather than exposing empty sections or invented information. The current Work section and bio are usable now.

## Verification limits

No physical iPhone or Android heat/battery/audio endurance test was available. WebKit tests are not a test of the installed Safari application. Desktop responsive emulation does not establish performance on real phones, and the smaller CSS viewport check is not a physical browser-toolbar zoom test.

No audio engine/asset changes, lazy-loading migration, hosting changes or deployment were made. The miniature signal mark uses existing telemetry; automatic pattern changes use the existing visual scheduler; grain uses one cached procedural texture and CSS transforms. Existing unrelated work in the repository was preserved.
