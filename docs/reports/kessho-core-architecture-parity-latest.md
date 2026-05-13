# Kessho Core Architecture Parity Audit

Generated: 2026-05-13T08:37:55.552Z

Overall status: PASS

Summary: 16 pass, 0 debt, 0 surrogate, 0 fail, 16 total.

| Status | Priority | Area | ID | Description |
| --- | --- | --- | --- | --- |
| PASS | required | cpu | cpu-browser-core | Browser Core mode exposes worklet CPU telemetry and bounds host piano sample memory/CPU work to active piano paths. |
| PASS | required | cpu | cpu-native-hotpaths | Native CPU-sensitive paths are guarded by the existing mobile audio hotpath audit. |
| PASS | required | source | drum-source-core | Drum source has native Core module coverage, browser acceptance gates, Webapp control methods, and Core preview playback for clock/swing/trigger/probability/trig/ratchet/expression/morph/distance/pitch overrides. |
| PASS | required | source | earth-sample-texture-policy | Core mode now plays the same waves, birds, and frogs OGG texture assets as the Webapp through host-side sample players, with dry output and shared Core reverb, Delay A/B, and granular routing. |
| PASS | required | sequencer | lead-random-phrase-scheduler | Core mode now schedules Random Timing phrase notes for Lead 1, Lead 2, and Piano instead of only exposing Euclidean lead playback. |
| PASS | required | source | lead-source-core | Lead 1/2 use the Core Lead FM module for manual and synth-Euclid preview paths. |
| PASS | required | native | native-state-coverage | Native state and audio graph contain the current parity-critical source, sequencer, and shared-delay surfaces. |
| PASS | required | sequencer | pad-chord-live-sequencer | Core pad chord playback now advances through generated harmony tick chord sets instead of duplicating one frozen startup chord. |
| PASS | required | source | pad-source-core | Pad and Pad 2 have native Core module routing and browser acceptance coverage. |
| PASS | required | fx | piano-shared-fx-routing | Sampled host piano now keeps its dry bridge and routes wet sends through Core worklet reverb, Delay A, Delay B, and granular input buses. |
| PASS | required | source | piano-source-host | Sampled piano stays host-side for CPU and sample-decode safety, but Core mode now triggers it instead of going silent. |
| PASS | required | fx | shared-fx-core-routing | Pad, lead, drum, soundscape, Delay A/B, granular, reverb, spectral freeze, dynamics paths are covered by module and corpus gates. |
| PASS | required | source | soundscapes-source-core | Water/nature soundscape paths route through the Core soundscapes module for browser parity. |
| PASS | required | sequencer | synth-euclid-evolve-sublanes | CoreHost exposes the Webapp Synth Euclid control API, runs bar-boundary live evolve, and applies trigger, pitch, expression, probability, trig, ratchet, piano distance, and per-note lead/pad morph-distance overrides in Core preview playback. |
| PASS | required | sequencer | synth-euclid-source-map | Core mode recognizes the same synth-Euclid source family as the Webapp, including piano and pad voice lanes. |
| PASS | required | runtime | webapp-core-host-control-surface | CoreHost now owns every audioEngine method the Webapp calls, so Core mode no longer depends on runtime proxy fallbacks for app-level controls. |

## Evidence

- cpu-browser-core: Core worklet perf messages; bounded host piano sample cache; no idle piano scheduler without notes
- cpu-native-hotpaths: Native mobile hotpath audit
- drum-source-core: Core drum aux slot; drum module parity; drum corpus cases; Drum Euclid Core control API
- earth-sample-texture-policy: Core host EarthTexturePlayer bridge; Web OGG sample assets; Core worklet external FX input buses
- lead-random-phrase-scheduler: Web random lead phrase scheduler; Core lead/piano random preview sequence
- lead-source-core: Core Lead FM aux slot; Lead 1/2 manual and Euclid corpus cases
- native-state-coverage: Native SliderState; Native audio engine; Core host contract
- pad-chord-live-sequencer: Web phrase/sub-phrase harmony scheduler; Core generated harmony tick chord sets
- pad-source-core: Core pad module; Pad 1/2 corpus cases
- piano-shared-fx-routing: Host sampled piano bridge; Core worklet external FX input buses; piano wet send gain routing
- piano-source-host: Host sampled piano bridge; piano stem; manual piano corpus case
- shared-fx-core-routing: Core shared FX modules; FX slice corpus cases
- soundscapes-source-core: Core soundscapes aux slot; earth/soundscape corpus cases
- synth-euclid-evolve-sublanes: Webapp live evolve/sub-lane scheduler; Core host Synth Euclid API bridge; Core live evolve timer; per-note Core paramsOverride playback
- synth-euclid-source-map: Web/Core source enum; Core host piano Euclid scheduler
- webapp-core-host-control-surface: 58 App audioEngine call sites audited; CoreEngineHost method surface
