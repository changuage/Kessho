# Point Clouds: artist portfolio implementation brief

Status: implemented. See `docs/POINT_CLOUDS_PORTFOLIO_IMPLEMENTATION_REPORT.md` for verification and remaining content/device checks.
Prepared against the local source on 2026-10-28.

## Objective

Make Point Clouds feel like a clean artist business card: interactive particle artwork and optional Kessho audio, with immediately accessible current work, past projects, biography and contact details.

Execute the stages below in order. Finish and verify each stage before continuing. Do not reinterpret the visual direction or add features. Read the current file before editing because other work may have landed since this brief.

## Scope and protected behavior

- Primary file: `point-clouds/index.html`. Keep its inline CSS, JavaScript and shaders; no framework migration or new runtime dependency.
- Add only focused regression tests if needed for new dialog/lifecycle behavior. Follow the repository's existing test conventions.
- Preserve the point-cloud geometry, Poiret One particle lettering, intro timings, center-line rotation pivot, breathing, depth fading and drag inertia.
- Preserve the final title's existing 80% XY scale and the P's additional 80% Y compression, including baseline alignment.
- Preserve String Waves, the Product Core engine, engine timing/envelopes, telemetry contract, and the site-specific `reverbQuality: "lite"` override.
- Do not modify `src/audio`, `wasm`, the shared audio bridge, its inline generated copy, embedded engine assets, or alternative-a/alternative-b for this task.
- Keep direct-file support and local HTTP support. No new API keys or backend.
- No fabricated project history, contact addresses, release dates or links. Missing content is a content dependency, not permission to invent it.

## 1. Replace the visible interface

The resting page contains only four elements around the artwork:

| Position | Element | Exact behavior |
| --- | --- | --- |
| Top left | Small Point Clouds mark | Static inline SVG matching the existing horizontal logo; accessible name “Point Clouds”; not a replay control |
| Top right | Work · About | Two text buttons opening the same portfolio dialog at different sections |
| Bottom left | Contact | Opens the dialog at Contact; use a direct email link only once a real address is supplied |
| Bottom right | Audio control | Retain the real playback lifecycle; use the labels specified below |

Layout values:

- Desktop: 32px horizontal and 24px vertical page padding, respecting safe-area insets.
- At 760px and below: 20px horizontal and vertical padding, respecting safe-area insets.
- Mark: approximately 48 × 24px. No decorative status dot.
- Navigation: 13px system sans-serif, normal case, 24px visible gap; each target has at least a 44 × 44px interactive area.
- Colors: reuse `--ink`, `--paper`, and `--signal`. Reserve orange-red for active audio and focus/accent details.
- Keep the background artwork at its current composition and scale.
- Keep a visually hidden H1 “Point Clouds” for document structure.
- Page itself never scrolls. Portfolio dialog content may scroll.
- Navigation must be visible immediately, including during the intro and before any audio interaction.

Remove these elements and their unused CSS/JavaScript references:

- “Point Clouds / Helsinki” text header, coordinates and coordinate live region.
- Main-screen descriptor paragraph, `.axis`, scene number/name display and permanent `.hint`.
- Custom cursor element, all `.cursor` rules, `cursor: none`, `animateCursor()` and its requestAnimationFrame loop, plus `.action` listeners that manipulate the cursor.
- The decorative multi-bar meter and its per-frame `meterBars` style updates.
- Animated grain overlay. Keep the current static veil for this pass.

Important call sites:

- In `updatePointer()`, remove `coord-x`/`coord-y` and cursor writes. Retain pointer updates and CSS variables used by the veil.
- In `setScene()`, retain scene/morph/physics updates but remove `scene-number`/`scene-name` DOM writes and text animation.
- Change `.frame`'s default hidden state so navigation is always visible. Do not let full-width empty header/footer regions intercept canvas drags; interactive children alone should accept pointer events.
- Do not add another one-time hint in this pass.

Pass condition: no removed-element null errors; artwork remains draggable in empty space; Work and About open during the first second of loading.

## 2. Build one readable portfolio dialog

Replace the existing `<aside id="info">` with a native `<dialog id="info">`, retaining existing IDs where useful. Use `showModal()`/`close()` to get modal focus behavior and background inertness. Keep the existing iframe outside the dialog and do not remount it.

Desktop presentation:

- Centered editorial sheet, width `min(760px, calc(100vw - 64px))`.
- Maximum height `calc(100dvh - 64px)`; provide a `vh` fallback.
- Charcoal background at roughly 94% opacity, no rounded cards, gradients or ornamental panel textures.
- 40px content padding; body type 16px/1.65 in a system sans-serif; text line length at most 60ch.
- Title 36px; section headings 20px. Use the existing mono font only for small dates and metadata.
- Sticky dialog header: “Point Clouds” and a Close button with a 44px target.
- One scrollable content region below that header. Remove the current `overflow: hidden` restriction from the reading area.
- Backdrop: black at 55% opacity with a fixed 10px blur. Animate opacity for 180ms, not blur radius. Close may be immediate.

Mobile presentation (760px and below):

- Full viewport sheet, `100dvh`, safe-area padding, 24px content padding.
- Nearly opaque background (98%); omit backdrop blur on mobile.
- Same readable 16px body text, sticky Close control and natural vertical scrolling.
- No slide-in travel across the screen; use the same short fade.

Content order and anchors:

1. `#portfolio-current`: heading “Current”. Kessho title and copy: “An evolving instrument for generative ambient music, created by Point Clouds.” Add an Explore link only to a verified destination.
2. `#portfolio-selected`: heading “Selected work”. Plain rows: title, year, medium, one-sentence description and one real Listen/View link. No cards or invented examples. Hide this section if no verified entries are available.
3. `#portfolio-about`: heading “About”. Draft from facts already supplied: “Point Clouds combines generative ambient music, field recordings and rhythm. A trained jazz drummer and data scientist, he builds musical systems that explore time, space and the character of recorded places.” Include Helsinki only if confirmed as current location.
4. `#portfolio-contact`: heading “Contact”. Render only supplied or verified email/profile links. If none are available in the project, leave an implementation comment and report the missing content; do not publish placeholder addresses or an empty Contact section/button.

Work opens at Current. About opens at About. Contact opens at Contact once content exists. After opening, position the requested section below the sticky header using scroll margin and move focus to its heading (`tabindex="-1"`). Retain the actual invoking button and return focus to it on close.

Pass condition: dialog fits desktop, scrolls on a short viewport, contains no dead links, and closing returns to the same artwork state.

## 3. Fix input routing before testing the dialog

- Handle Escape through the dialog's cancel/close events, even before `introComplete`.
- While the dialog is open, the existing global wheel handler must return BEFORE `preventDefault()` so the reading surface can scroll.
- While the dialog is open, disable canvas scene hotkeys, Space playback shortcuts, pointer torque and drag updates. Let browser controls and links receive their normal keyboard behavior.
- Outside the dialog, ignore global shortcuts when the target is a link, button, input, textarea, select or editable element. This avoids Space triggering both a focused button and the global handler.
- Keep desktop wheel and arrow-key scene selection outside the dialog. Touch dragging continues to rotate the artwork; do not add a conflicting swipe-to-change gesture.
- Ensure closed dialog content is absent from keyboard navigation; native dialog should handle this.
- Navigation must still work if WebGL initialization fails. Bind portfolio behavior independently, before the early `if (!gl) return` path. The portfolio remains readable even if the artwork cannot render.

Pass condition: Tab/Shift+Tab stay inside the open dialog, Escape closes it at any intro stage, and scrolling the sheet never morphs the background cloud.

## 4. Freeze and blur the actual last frame

Opening the portfolio should pause the visual animation while previously started audio continues.

The renderer uses `preserveDrawingBuffer: false`; do not assume its drawing buffer remains valid after rendering stops.

- Add one hidden 2D snapshot canvas below the dialog and above the live WebGL canvas. Reuse it on later openings.
- Opening sets a pending capture flag. On the next normal render, immediately after `gl.drawArrays`, copy the WebGL canvas into the snapshot canvas with `drawImage` in the same callback. Reveal the snapshot and hide the live canvas only after the copy succeeds.
- Stop scheduling visual frames after that capture. Do not enable `preserveDrawingBuffer`, allocate a WebGL framebuffer, export a PNG, or create per-frame screenshots.
- Freeze the snapshot behind the desktop blur. On close, redraw the live canvas once before hiding the snapshot to prevent a black flash.
- Cancel any active drag and release pointer capture when opening.
- Exclude paused time from visual elapsed time, intro time, morph progress and release progress. Reset `lastFrame` on resume so there is no accumulated physics jump.
- Account for the current `releaseIntro()` timeout: either pause its remaining delay or replace its visual completion timeout with a check against the paused visual release clock. A dialog opened during the 1.25-second transition must not complete the transition invisibly.
- Window resize while paused may request one updated frame/snapshot; it must not restart a continuous loop.
- Coordinate dialog pause and document-hidden pause: only resume when the document is visible AND the dialog is closed. Never create two simultaneous render loops.
- Do not stop, restart, suspend or change Kessho as part of opening/closing the portfolio.

Pass condition: no blank blurred backdrop; intro resumes where it paused; audio is uninterrupted; repeated open/close cycles do not accumulate render loops or capture canvases.

## 5. Simplify audio labels without changing playback semantics

Keep the current early engine boot and existing bridge/start/stop path for this pass. Deferring audio initialization is a separate change requiring Chrome/Safari gesture testing.

Use these visible states:

| Engine state | Visible text |
| --- | --- |
| Booting | Preparing audio… |
| Ready/stopped | Listen |
| Starting | Starting… |
| Playing | Stop · String Waves |
| Stopping | Stopping… |
| Failed | Retry audio |

Use “Stop”, not “Pause”: the current action calls `controller.stop()` and resume-at-the-same-position has not been established.

- Preserve `#audio-toggle`, `#audio-label`, accessibility state and diagnostic dataset attributes used by existing tests.
- Update all status writers consistently: `markEngineReady`, `handleControllerStatus`, `setEngineFailure`, and the click handler. A loading callback must not briefly relabel the control as Listen.
- Disable repeat submission during start/stop operations; keep a visible failure and retry path.
- The footer audio control is visible during the intro. If someone deliberately presses Listen early, reuse the existing intro-skip/release behavior and start audio through the existing user-click path once. Keep navigation independent of audio.
- Keep the floating particle Play control and Space support. Do not make generic canvas clicks skip the intro.
- Keep real `uAudio` input. Removing the decorative meter must not remove telemetry or shader reactivity.

Pass condition: one click starts one engine instance; stop/start works twice; portfolio buttons never start sound; missing audio remains an explicit failure rather than simulated playback.

## 6. Apply a bounded mobile performance profile

Use fixed budgets first; defer automatic quality detection until device measurements justify it.

| Setting | Desktop | Mobile/coarse pointer |
| --- | --- | --- |
| Particle count | Keep 30,000 | 10,000 |
| Device-pixel-ratio cap | Keep 1.6 | 1.0 |
| Draw frequency cap | 60 fps | 30 fps |
| Custom cursor loop | Removed | Removed |
| Animated grain | Removed | Removed |
| Open portfolio | One captured frame | One captured frame |

- Allocate particle seeds/targets once; do not regenerate arrays every frame or change the existing shape/group distribution.
- Reuse the existing render scheduler. Gate expensive update/draw work by elapsed time; maintain only one requestAnimationFrame chain. A capped loop can still receive browser callbacks, but must not draw on every callback.
- Preserve the shared physics response with fixed simulation substeps no larger than 1/60 second when drawing at 30 fps. Keep a bounded catch-up limit after stalls.
- Make the existing audio smoothing time-based: replace the fixed `.16` per-frame blend with `1 - Math.exp(-dt / .096)` using seconds. This approximately preserves the current 60 fps response at the new draw rates.
- Continue the current bounded telemetry reads. Do not poll Product Core for every particle or introduce another audio-analysis loop.
- Trigger canvas sizing from resize/orientation changes rather than recomputing device dimensions on every draw.
- Reduced motion: show the static particle Play state immediately; after Play, draw a static first field. Redraw only on resize or an explicit scene change. Disable spin, breathing, continuous audio deformation and inertial rotation in this mode; audio controls and portfolio remain functional.
- Preserve all audio voices, sequencing, envelopes and effects. Do not add a replacement soundtrack, silent fallback or reduced-engine preset.

Pass condition: desktop intro appearance remains intact; mobile drawing stays within its 30 fps cap; no ongoing draw loop in reduced-motion mode or behind the portfolio.

## 7. Verify in a suitable preview

Use the repository's Vite dev server (`npm run dev -- --host 127.0.0.1`) and open `/point-clouds/`, or serve the built `dist` using `npm run preview -- --host 127.0.0.1`.

Do not use a plain static server over the SOURCE repository to claim audio works: the HTTP bridge opens the root app, whose TypeScript entry requires Vite transformation. Direct-file playback is a separate supported path using the embedded engine assets; test it separately.

Run once after implementation:

- `npm run test:point-clouds-bridge`
- `npm run test:point-clouds-preset-fallback`
- Focused lifecycle/accessibility regression checks added for this change, if any.
- `npm run build` (report pre-existing blockers separately; do not broaden this task into an engine migration).

Visual and interaction acceptance:

- Desktop: 1440 × 900 and 1280 × 720. Mobile: 390 × 844 and 360 × 740. Also test landscape and 200% browser zoom.
- Save screenshots of the initial navigation, completed particle title, live field, Work sheet and About section. Compare the title against a BEFORE screenshot at the same elapsed intro time and viewport.
- No clipped navigation, unintended horizontal scrolling, overlapping controls or console errors attributable to this change.
- Open/close Work during initial hold, during spin, during title hold, during release and after playback starts. Each time the artwork resumes without jumping.
- Open/close the sheet ten times; verify focus restoration and only one active rendering chain.
- Scroll the complete sheet with wheel and touch. Close remains reachable. Confirm the background scene never changes while reading.
- Test keyboard-only navigation, Escape, focused-button Space behavior, and reduced-motion mode.
- Start/stop String Waves twice in Chrome and Safari where available. Test direct `file://` separately. Report unavailable browser checks honestly.
- Simulate WebGL unavailability: Work/About and available contact content still function.
- Check that there are no fabricated addresses, placeholder links, empty headings or visible implementation notes.

Physical-device performance acceptance:

- On one older supported iPhone and one midrange Android, run String Waves plus the cloud for five minutes, then open the sheet, rotate the phone, close it and return from a background tab.
- Record device/browser, sustained frame pacing, audio glitches, and any degradation over the run. Aim for approximately 30 rendered frames per second on the chosen mobile profile with no audible dropouts.
- Responsive desktop emulation verifies layout, not phone heat, battery use or real audio stability. If physical devices are unavailable, mark this check unverified; do not claim broad mobile compatibility.

## Completion report and remaining content

Deliver the edited page, screenshots and a short test summary. List any missing project titles, years, URLs, contact address and approved bio details. Layout can be reviewed with verified Kessho content; the past-work/contact portions cannot be considered content-complete until those facts are supplied.

Defer automatic graphics quality tiers, audio lazy-loading, new audio-reactive effects, preset selectors, CMS integration and hosting changes. They are not required to complete this portfolio redesign.
