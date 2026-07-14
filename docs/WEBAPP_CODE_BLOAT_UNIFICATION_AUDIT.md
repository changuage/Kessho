# Webapp Code-Bloat and Process-Unification Audit

Date: 2026-07-12

## Goal

Reduce the webapp's source size and CPU overhead by removing unused surfaces and making repeated feature flows share one implementation. The most important example is note input: computer keyboard, pointer, MIDI, preview audition, and sequencer capture currently overlap without sharing a complete note lifecycle.

This is an audit of the current working tree. It is intentionally read-only with respect to production code.

## Current baseline

- 693 non-generated, non-reference, non-test TypeScript/TSX files.
- 207,881 physical lines and 192,340 non-empty lines in that surface.
- 87 files exceed 500 lines; 41 exceed 1,000 lines.
- `src/ui` alone contains roughly 113,000 lines.
- `src/ui/synth/SynthPage.tsx` is 11,398 physical lines.
- `src/App.tsx` is at its current architecture no-growth ceiling: 3,545 non-empty lines.
- The runtime compatibility family contains 118 `useProductRuntime*` / `useSelectedAudioEngine*` files totaling 8,390 lines.

The realistic first program target is a net deletion of 9,000-12,000 lines, or about 5-6% of this measured surface. That target excludes generated code and does not depend on removing product behavior.

## Ranked findings

### P0: Delete zero-import React modules before creating abstractions

A TypeScript import-graph scan found 13 TSX modules with zero importers, totaling 4,872 lines:

| Module | Lines | Assessment |
|---|---:|---|
| `src/ui/earth/components/EarthSceneMixer.tsx` | 1,416 | Unused; only its own definition and planning docs refer to it. |
| `src/ui/earth/components/archive/EarthSceneMixer.tsx` | 1,414 | Unused archived copy of the same feature family. |
| `src/ui/CloudPresets.tsx` | 480 | Legacy cloud browser; current preset UI does not import it. |
| `src/ui/routing/MidiRoutingPanel.tsx` | 444 | Not imported by the app; static guard scripts still mention it. |
| `src/ui/drums/scatter/ScatterTrailField.tsx` | 205 | Unused earlier scatter UI component. |
| `src/ui/drums/scatter/EngineScatterOrb.tsx` | 147 | Unused earlier scatter UI component. |
| `src/ui/delay/DelayAlgorithmCard.tsx` | 127 | Unused. |
| `src/ui/drums/scatter/EngineScatterCard.tsx` | 127 | Unused earlier scatter UI component. |
| `src/ui/midiLearn/MidiMappingBottomSheet.tsx` | 126 | Not integrated; retained only by a static iOS guard and docs. |
| `src/ui/earth/components/EarthMixerSection.tsx` | 122 | Unused. |
| `src/ui/drums/scatter/PhraseGlyphCard.tsx` | 111 | Unused earlier scatter UI component. |
| `src/ui/delay/DelayThumbnail.tsx` | 105 | Unused. |
| `src/ui/earth/components/WaterLayersSection.tsx` | 48 | Unused. |

Recommendation:

1. Delete the modules that are neither a deliberate URL/worker entry nor required by a current product route.
2. Update or remove static guards that preserve an unmounted implementation instead of a behavior contract.
3. Add a web-entry import-graph check so new zero-import TSX files fail CI unless explicitly allowlisted.

This is the safest and largest immediate reduction. It also prevents new shared abstractions from being designed around dead components.

### P0: Replace mirrored runtime hooks with one runtime facade

The app has accumulated two parallel naming and composition trees:

- 58 `useProductRuntime*` files, 4,021 lines.
- 60 `useSelectedAudioEngine*` files, 4,369 lines.
- Combined: 118 files and 8,390 lines.

There are 31 direct suffix-matched pairs. After normalizing the product/selected names, representative overlap is:

| Pair | Normalized overlap |
|---|---:|
| Live-trigger callbacks | 92% |
| Playback surfaces | 83% |
| Sequencer controls | 72% |
| Sequencer callbacks | 62% |
| Manual triggers | 58% |

The family contains about 190 `useCallback`, 40 `useMemo`, and 23 `useEffect` call sites. Several product wrappers already contain explicit `product-fallback-retire` markers. This is migration scaffolding that has become a permanent feature layer.

Recommendation:

- Define one stable `RuntimeFacade` consumed by the app and pages. It should expose lifecycle, transport, note input, sequencer control, telemetry, recording, and platform capabilities.
- Implement Product Core as the normal facade implementation.
- Keep reference/parity engines behind one development adapter loaded only when the development runtime is requested. Do not mirror every hook at the page layer.
- Put runtime selection at the construction boundary, not inside scores of hooks.
- Collapse wrapper-only modules into a few cohesive hooks whose return values are stable by construction.

Expected result: remove 2,500-4,000 lines and dozens of modules while reducing callback creation, effect registration, and dependency-array churn in the app root. This should be done after the input and preset seams below are stabilized, because those provide smaller contracts for the facade.

### P0: Give keyboard, pointer, and MIDI one live-note lifecycle

The existing contracts almost support this but are not connected:

- `ProductLiveNoteEvent.source` already allows `midi`, `computer-keyboard`, and `ui-pad`.
- Only the MIDI adapter creates `ProductLiveNoteEvent` objects.
- `MidiLearnProvider` has an optional `onLiveNoteEvent`, but `App.tsx` does not supply it. The app supplies `onMidiMessage` and sends raw MIDI directly instead.
- The synth computer keyboard calls one-shot `onAuditionNote` with `durationMs: 180`.
- Keyboard `keyup`, pointer-up, pointer-leave, and pointer-cancel only clear visual state; they do not release the sounding note.
- Updating active keyboard codes calls React state in the 11,398-line `SynthPage`, causing the whole page component to render on note press and release.
- Preview audition, live performance, MIDI input, and sequencer capture share partial behavior but use different paths.

Recommendation:

Create two explicit processes instead of one ambiguous audition API:

1. `LiveNoteInputController`
   - `noteOn({ inputId, source, instrument, note, velocity, timestamp })`
   - `noteOff({ inputId, timestamp })`
   - `releaseAll(inputSource)` for blur, visibility loss, runtime switch, and unmount
   - adapters for computer keyboard, pointer, and MIDI
   - per-source asset/bootstrap preparation inside the runtime adapter
2. `PreviewAuditionService`
   - finite-duration, serialized preview notes for preset and harmony audition
   - not used for held keyboard or MIDI performance

Keep sequencer recording as a subscriber to canonical `noteOn` events rather than embedding capture branches inside keyboard dispatch. A note should be translated once, then independently consumed by audio and recording.

Move the visual keyboard into a memoized component that owns its active-key presentation state. The full Synth page should not render for a key highlight. Use pointer capture and `releaseAll` to prevent stuck notes.

Expected result: approximately 200-350 lines removed initially, a single correct held-note implementation, and a material CPU improvement during live keyboard performance.

### P0: Make transport start policy authoritative

Transport enable/start rules exist independently in:

- `SynthPage.toggleSynthSequencerTransport`
- `DrumPage.toggleDrumSequencerTransport`
- `useLazySequencerTransport.toggleLazySequencerTransport`
- `drumSequencerTransportPolicy.ts`

The duplicated paths have already drifted:

- The mounted Synth page enables the active lane when starting with no enabled lanes.
- The lazy Synth shortcut does not enable a lane when none is enabled.
- The mounted Drum page respects the `laneEnableTouched` policy.
- The lazy Drum shortcut always enables the first lane when none is enabled.

Recommendation:

- Create a pure `planSequencerTransportToggle(kind, state, activeLane, policy)` function returning the complete state patch and start intent.
- Use it from buttons, keyboard shortcuts, lazy-page shortcuts, overdub count-in, and remote commands.
- Keep mutation and playback start outside the planner.
- Test every caller against the same table of start/stop cases.

This is a small deletion but a high-value unification because it removes behavior differences based on whether a lazy page happens to be mounted.

### P1: Replace page-owned global key listeners with scoped commands

Keyboard handling is split between app navigation, lazy transport, Synth, Drums, harmony, overlays, debug UI, and modal surfaces. Synth alone installs one page-hotkey listener plus a second keydown/keyup/blur listener. Each owner repeats editable-target checks and modifier/repeat rules.

The Synth and Drum sequencer editors also duplicate these command families:

- mute/solo
- transport
- view cycling
- lane/sequencer cycling
- step movement
- coarse/fine value editing
- step-count editing
- trigger toggling
- copy/paste stamp modes

Recommendation:

- Add one root keyboard dispatcher with scoped command registrations, priorities, and modal blocking.
- Centralize editable-target detection using the existing `isEditableShortcutTarget` behavior.
- Express page bindings as data and callbacks, not additional window listeners.
- Extract a shared sequencer keyboard navigator for lane, sequence, step, coarse/fine, and view commands. Domain-specific value math remains in Synth/Drum adapters.
- Pre-index physical key codes instead of scanning `MANUAL_KEYBOARD_LAYOUT` for every event.

Expected result: remove 250-500 lines, make conflicts testable, and reduce listener/effect churn. The live-note controller remains separate from command dispatch so typing/navigation and musical input have clear ownership.

### P1: Merge Synth and Drum preset managers around a domain adapter

`SynthPresetManager.tsx` and `DrumPresetManager.tsx` total 1,718 physical lines. After trimming imports/comments/blank lines, 75.0% of Synth manager lines and 79.9% of Drum manager lines match a line in the other file.

They duplicate:

- preset list grouping
- selected-entry state
- save/overwrite/save-as
- rename
- rating
- delete confirmation
- tag suggestions
- version history and diffs
- almost all styles
- save and confirmation overlays

`PresetDropdown` already implements another reusable version of most CRUD actions. `SynthPage` also calls `usePresets('engine', 'pad1'/'pad2')` while each Synth preset manager calls `usePresets` for the same scope, creating duplicate list state, subscriptions, refreshes, and retry timers.

Recommendation:

- Build one `MorphPresetManager` or extend `PresetDropdown` with a morph-slot presentation.
- Supply a small domain adapter for scope, runtime conversion, stock IDs/names, apply-to-slot, preview, rating permissions, and optional variation controls.
- Move version-diff calculation, dialog state, tag aggregation, and styles into the shared component.
- Hoist each preset query to the nearest owner and pass its controller down. One scope should have one `usePresets` owner.
- Use one accessible dialog primitive for save, rename, confirmation, and other modal surfaces.

Expected result: remove 650-900 lines and avoid duplicate preset refresh/retry work.

### P1: Share document visibility and animation scheduling

The current hooks repeat browser subscriptions:

- `useDocumentVisibility` owns a `visibilitychange` listener.
- Every `useVisibleInterval` instance owns another `visibilitychange` listener.
- Every `useAnimationVisibility` instance owns another `visibilitychange` listener plus an `IntersectionObserver`.
- At least 15 UI files own requestAnimationFrame loops, with 34 requestAnimationFrame call sites in the UI scan.

Recommendation:

- Back document visibility with one `useSyncExternalStore` singleton.
- Make `useVisibleInterval` and `useAnimationVisibility` consume that store instead of registering listeners.
- Add a shared animation-frame scheduler supporting visible-only subscriptions and optional maximum update rates.
- Keep drawing callbacks local, but use one frame source per document.
- Pool `IntersectionObserver` instances by options only if profiling shows observer overhead matters.
- Use the existing central mobile query rather than independent `window.innerWidth < 768` decisions in canvas helpers.

Expected result: remove 100-250 lines and reduce browser event fan-out and idle visual work. Verify with page CPU comparisons rather than assuming a scheduler is faster.

### P1: Remove the legacy cloud-browser branch, not merely its component

`CloudPresets.tsx` is unimported, but `src/cloud/supabase.ts` still contains its list/search/save/cache implementation. Most exported browse APIs are consumed only by the unused component and static guard scripts. Current runtime use that remains valid is concentrated around:

- Supabase client/bootstrap
- anonymous session setup
- shared-preset loading by ID

The legacy list cache in `src/cloud/supabase.ts` repeats the memory/session-cache machinery in `SupabasePresetStore.ts`.

Recommendation:

- Confirm the legacy cloud browser is not a supported hidden route.
- Delete its component and browse/search/save list APIs.
- Split the survivors into a small Supabase client/session module and a preset share-link loader.
- Keep current preset listing and mutation in `SupabasePresetStore` only.
- Rewrite static guards to assert the current store/share behavior, not the presence of retired function names.

Expected result: an additional 400-700 lines beyond the already-counted dead component, one fewer cache implementation, and fewer legacy Supabase contracts to maintain. No database schema or RLS change is required.

### P2: Make repeated parameter maps canonical

Several static registries are locally recreated:

- `PAD1_TO_PAD2_KEY` is canonical in `audio/padPresets.ts` but duplicated verbatim in `SynthPage.tsx`.
- `createRuntimePadPreset` exists in both `SynthPage.tsx` and `SynthPresetManager.tsx`.
- Synth lane enabled/source keys exist in both `SynthPage.tsx` and `useLazySequencerTransport.ts`.
- Drum lane enabled keys exist in both `DrumPage.tsx` and `useLazySequencerTransport.ts`.
- Drum engine scopes and morph keys are duplicated between `DrumPresetManager.tsx` and `MorphSlider.tsx`, despite canonical voice/morph configuration existing in audio modules.
- Manual synth source-to-ID maps are duplicated in both manual-trigger hooks.

Recommendation:

- Create small canonical domain registries for pad slots, drum voices, synth lanes, and drum lanes.
- Derive inverse maps and indexed keys rather than storing both directions by hand.
- Keep runtime-independent configuration outside page components.
- Add a consistency check that disallows local redefinitions of canonical registry names.

Expected result: remove 150-300 lines now and prevent silent drift in presets, transport, routing, and input behavior.

## Recommended execution order

### Wave 1: Mechanical deletion and guard cleanup

- Delete confirmed zero-import TSX modules.
- Remove archived Earth UI.
- Remove the legacy cloud browser and unused cloud list branch after confirming it is not a hidden route.
- Delete only clearly unused zero-import TypeScript modules; workers, worklets, script-owned regression modules, and platform entry files need explicit allowlisting rather than automatic deletion.
- Add import-graph and source-size gates.

Target: 5,000-6,000 net lines removed.

### Wave 2: Input and transport authority

- Introduce `LiveNoteInputController` and `PreviewAuditionService`.
- Move keyboard UI state below `SynthPage`.
- Route keyboard, pointer, and MIDI through the canonical live-note lifecycle.
- Introduce the pure transport planner and use it from mounted and lazy controls.
- Add the scoped keyboard command dispatcher.

Target: 500-900 net lines removed plus the most direct interaction CPU improvement.

### Wave 3: Preset UI unification

- Merge Synth and Drum managers through a domain adapter.
- Reuse one dialog primitive.
- Hoist duplicate `usePresets` ownership.
- Preserve all current Supabase/store contracts.

Target: 650-900 net lines removed and fewer refresh/subscription paths.

### Wave 4: Runtime facade burn-down

- Establish the one app-facing facade.
- Move runtime choice to construction.
- Retire mirrored product/selected wrappers in vertical slices: manual input, callbacks, sequencer, playback, telemetry, lifecycle.
- Keep development parity tooling behind a development-only adapter.

Target: 2,500-4,000 net lines removed.

### Wave 5: Shared scheduling and registry cleanup

- Centralize document visibility.
- Introduce the measured shared frame source.
- Canonicalize parameter/lane/voice maps.
- Tighten budgets on `SynthPage`, `App`, and the runtime facade surface.

Target: 250-550 net lines removed, with CPU benefit validated by existing page/module CPU tooling.

## Verification gates

Every wave should keep these gates green where relevant:

- `npm run type-check`
- `npm run architecture:strict`
- `npm run core:product:production-interactions`
- `npm run core:product:page-cpu-comparison`
- `npm run core:product:module-cpu`
- `npm run core:product:live-note-contract`
- `npm run test:synth-play-controls-ui`
- `npm run test:drum-sequencer-transport-policy`
- preset metadata/content/dedup/exact-load regressions
- Supabase egress, cursor, save, API-surface, and security audits when retiring legacy cloud code

Add focused tests for:

- held keyboard note duration follows keyup
- repeated keydown does not retrigger unless configured
- blur, visibility loss, pointer cancellation, and runtime switch release all notes
- text entry never triggers musical or navigation shortcuts
- mounted and lazy transport produce identical patches
- no-lane, touched-lane, stopped, already-running, and overdub start cases
- one preset-list request owner per mounted scope
- keyboard highlighting does not render the full Synth page

## Guardrails for actual code reduction

- Measure net deleted lines per wave; moving code into more files is not a successful result.
- Do not create a generic abstraction until at least two live callers replace their local implementations.
- Prefer pure planners plus thin adapters over large context providers.
- Keep one-shot preview audition separate from held live-note input.
- Keep Product Core as production truth; development parity code should not force a mirrored production UI architecture.
- CPU validation is required for scheduler, subscription, and render-boundary changes.

