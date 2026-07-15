# Tech-debt clear wins implementation report

Date: 2026-07-16

## Outcome

This cleanup removes 5,114 net lines from `src` (5,232 deleted, 118 added) while preserving Product Core timing, transport control, audio-context priming, resume quantization, MIDI/live-note timing, background audio, Supabase, and visualizer rendering ownership.

## Implemented changes

- Deleted every zero-import TSX module found by the import graph, including the originally audited Earth, cloud preset, delay, scatter, and MIDI mapping components plus five compatibility leaves exposed after their parents were removed.
- Added `architecture:web-tsx-reachability`. It fails on any new zero-import TSX module and on stale allowlist entries. The current allowlist is empty.
- Removed the unused selected-runtime playback composition surface.
- Replaced parallel live-trigger registration wrappers with the existing runtime-neutral `useLiveTriggerUiCallbacks` implementation.
- Replaced the Product/selected sequencer callback implementations with one `useRuntimeSequencerProjectionCallbacks` hook. Product and reference surfaces only rename the returned display/projection callbacks.
- Added `architecture:projection-unification`. It prevents retired wrappers from returning and rejects timing, scheduling, visibility, audio-context, or resume-quantization ownership in the projection hook.
- Reimplemented document visibility as one `useSyncExternalStore` subscription. `useVisibleInterval` and `useAnimationVisibility` consume it rather than installing listeners per hook instance.
- Added a visibility-store regression test proving multiple subscribers use one browser listener and remove it after the final unsubscribe.
- Updated static guards that had preserved retired components or stale pre-cleanup/timing-architecture shapes.

## Timing and lifecycle boundaries deliberately unchanged

- `commitLiveSequencerTiming.ts` and Product event timing classification
- sequencer control mutation and transport start policy
- synchronous `primeAudioContext()` startup
- resume quantization and lane audibility transitions
- Product Core sample-frame scheduling
- background-audio, journey, morph, and live-note safety listeners
- Supabase preset code and visualizer frame/render code

## Downstream audit

- Production build and automated browser runtime checks pass.
- Manual production-browser navigation rendered Global, Synth, and Drums successfully with no cleanup-related console errors.
- A cold-runtime warning can occur when a sequencer page mounts before the Product worklet exists. The warning originates in unchanged sequencer-control code and predates this cleanup; changing it would cross the protected control/timing boundary. It remains a separate follow-up item.
- The first automated browser audio capture was silent; an immediate clean rerun passed the full runtime suite, classifying the first result as startup/capture flakiness rather than a reproducible regression.

## CPU evidence

Three complete page CPU comparison runs were measured. Median Product browser-process CPU remained lower than Web TS on every page:

| Page | Product median | Web TS median | Median saving |
|---|---:|---:|---:|
| Global | 46.693% | 56.821% | 23.90% |
| Synth | 45.651% | 55.115% | 17.35% |
| Drums | 30.524% | 42.733% | 27.95% |
| Earth | 42.985% | 45.962% | 2.86% |
| Granular | 49.531% | 59.278% | 16.44% |
| Delay | 48.854% | 56.078% | 12.24% |
| Reverb | 49.625% | 61.219% | 17.85% |
| Texture | 50.622% | 61.905% | 16.71% |
| Routing | 53.547% | 62.352% | 14.52% |

The weighted median saving is 15.78%. These comparisons verify that the cleanup retained the established Product CPU advantage; they are not attributed as a new 15.78% gain from dead-code deletion.

Three focused web CPU runs reported Product/Web savings of 27.08%, 22.74%, and 27.86% (median 27.08%). The native Product CPU budget passed at 7.76425% average with active FX, 8.805% peak, and zero missed render quanta. Granular render metrics passed at 0.794288% average CPU with 0.028125 ms p95 block time.

The same focused web benchmark was run three times from an isolated checkout of the pre-cleanup commit. Baseline Product browser CPU was 33.434%, 32.008%, and 31.012% (median 32.008%); the cleanup was 32.040%, 33.118%, and 31.556% (median 32.040%). The median change is +0.10% relative, well inside the 3% regression limit and within measurement noise.

## Verification

- `npm run type-check`
- `npm run build`
- `npm run architecture:web-tsx-reachability`
- `npm run architecture:projection-unification`
- `npm run architecture:budget`
- `npm run architecture:budget:strict`
- `npm run migration:product-boundary`
- `npm run core:product:web-host`
- `npm run core:product:running-sequencer-live-updates`
- `npm run core:product:browser-runtime` (clean rerun passed)
- `npm run core:product:ios-midi-learn-ui`
- `npm run test:document-visibility`
- `npm run test:live-note-input`
- `npm run test:slider-system`
- `npm run core:product:page-cpu-comparison` (three runs)
- `npm run core:product:web-cpu-comparison` (three runs)
- `npm run core:product:cpu`
- `npm run core:product:granular-artifacts`
- `npm run core:product:reverb-tail-quality`
- `npm run core:product:module-cpu`
