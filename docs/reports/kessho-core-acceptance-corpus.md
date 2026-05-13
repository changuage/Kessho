# KesshoCore Acceptance Corpus

Generated: 2026-05-12T23:58:14.075Z

Scope: practical browser parity acceptance corpus for the core migration. This is intentionally representative, not exhaustive perfect-parity coverage.

## How to Run

With the app dev server running:

1. Start the app dev server, for example `npm run dev -- --host 127.0.0.1 --port 4173`.
2. Run the corpus wrapper against that server:

```sh
node scripts/profile-kessho-core-acceptance-corpus.mjs --run --url=http://127.0.0.1:4173/
```

For an exploratory run before enforcing thresholds, add `--no-fail`. To inspect the direct browser parity commands without running them:

```sh
node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --url=http://127.0.0.1:4173/
```

Staged slice examples:

```sh
node scripts/profile-kessho-core-acceptance-corpus.mjs --run --slice=pad-dry --url=http://127.0.0.1:4173/
node scripts/profile-kessho-core-acceptance-corpus.mjs --run --slice=pad --url=http://127.0.0.1:4173/
node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-reverb-tail --track=reverb --no-fail --url=http://127.0.0.1:4173/
```

Focused probes for closing a single boundary can capture a specific recordable bus and apply a temporary state override without changing the corpus report or case hashes:

```sh
node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --case=pad-reverb-tail --track=reverb --state-override='{"reverbLevel":0.45}' --url=http://127.0.0.1:4173/
```

Known-failure allowance applies only to the default mix/default corpus state. A run with `--track` or `--state-override` is treated as a fresh probe, even when the selected case has a known-failure label.

Example direct browser parity command:

```sh
node 'scripts/check-web-core-sonic-parity.mjs' '--url=http://127.0.0.1:4173/' '--duration-ms=5000' '--settle-ms=700' '--rms-tolerance=0.04' '--peak-tolerance=0.22' '--min-signal-rms=0.0001' '--state-patch={"birds2Enabled":false,"birdsEnabled":false,"characterEnabled":false,"delayAEnabled":false,"delayAFeedback":0,"delayAGranularSend":0,"delayAMix":0,"delayAToBSend":0,"delayBGranularSend":0,"delayBToASend":0,"drumEnabled":false,"drumEuclidMasterEnabled":false,"dynamicsEnabled":false,"frogsEnabled":false,"granularEnabled":false,"granularFreeze":false,"insects2Enabled":false,"insectsEnabled":false,"lead2Enabled":false,"leadEnabled":false,"leadRandomEnabled":false,"masterSatDrive":0,"masterVolume":0.85,"oceanSampleEnabled":false,"oceanWaveSynthEnabled":false,"pad1DelayASend":0,"pad1ReverbSend":0,"pad2Enabled":false,"padEnabled":true,"pianoEnabled":false,"reverbEnabled":false,"sidechainEnabled":false,"spectralFreezeEnabled":false,"synthEuclideanMasterEnabled":false,"synthLevel":0.6,"synthReverbSend":0,"waterEnabled":false}' '--core-engine=core-wasm' '--manual-note=pad1:60:0.78:5200' '--manual-no-warmup'
```

Corpus manual-note commands pass `--manual-no-warmup` so long-release sources are not contaminated by a hidden pre-capture note.

## Staged Definition

### Pad Slice

Target: Core pad source is close enough for migration of pad-only playback.

Required cases: default-pad-dry, default-pad2-dry, pad-simple-dry, pad-reverb-tail, pad-dark-dense

Pass definition: Dry pad, Pad 2, and shared reverb-tail gates pass with shared-start manual pad notes and no page errors.

### FX Slice

Target: Core shared FX and master chain are close enough when fed by pad/manual deterministic input.

Required cases: pad-delay-pingpong, pad-delay-reverb-bloom, granular-pad-cloud, granular-delay-return, dynamics-master-chain

Pass definition: All required close/perceptual cases pass, using envelope gates for feedback-heavy tails where sample correlation is not meaningful.

### Source Slice

Target: Core non-pad sources are close enough for lead, drums, and earth/soundscape migration.

Required cases: lead-manual-dry, lead-delay-heavy, piano-manual-dry, synth-euclid-lead-grid, drum-euclid-tight, drum-delay-dub, earth-water-only, earth-full-nature, soundscape-ocean-pad

Pass definition: All deterministic source cases pass; stochastic drum and earth cases pass documented transient/envelope gates.

### Full Mix Slice

Target: Core is close enough for representative webapp states and migration can proceed.

Required cases: full-mix-gamelan, full-mix-dark-ambient

Pass definition: Full-mix cases have no block failures, no silent enabled sources, and pass scoped perceptual/manual-review scoring.

## Scoring

- Pass: every required pass case exits 0 from `scripts/check-web-core-sonic-parity.mjs`, meets the case RMS/peak/min-signal thresholds, and has no page errors or unexpected silent captures.
- Review: best-lag magnitude above 50 ms, deterministic-case correlation below 0.85, or stochastic earth/granular metrics that do not repeat within the same broad band.
- Known sonic failure: a checkable case that currently fails thresholds for a known audio boundary in the default mix/default corpus state. It is still run by slice commands, and setup/capture failures are never masked.
- Block: silent reference source, non-finite samples, browser harness/core-host errors, or a deterministic expected-pass case above threshold.

Threshold classes:

- exact: Deterministic dry or nearly dry source. Expect tight RMS/peak thresholds and stable correlation.
- close: Deterministic source through FX. Some phase/tail drift is acceptable within thresholds.
- perceptual: Complex, stochastic, or feedback-heavy path. Thresholds catch gross drift; reviewer checks lag, level, and obvious character.
- manual-review: Acceptance requires listening or repeated-run judgement even if numeric thresholds pass.

## Coverage

| Case | Group | Class | Expected | Source | Trigger | Duration | Thresholds |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| pad-simple-dry | simple pad | exact | pass | KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 5000 ms | rms 0.04, peak 0.22, min RMS 0.0001 |
| default-pad-dry | default pad dry | exact | pass | src/ui/state.ts#DEFAULT_STATE | pad1:60:0.78:5200 | 5000 ms | rms 0.04, peak 0.22, min RMS 0.0001 |
| default-pad2-dry | default pad dry | exact | pass | src/ui/state.ts#DEFAULT_STATE | pad2:60:0.78:5200 | 5000 ms | rms 0.04, peak 0.22, min RMS 0.0001 |
| pad-reverb-tail | pad+reverb | close | pass | KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 8000 ms | rms 0.055, peak 0.28, min RMS 0.0001 |
| pad-dark-dense | pad+reverb | close | pass | KesshoNativeSwift/Kessho/Presets/Dark_Textures.json | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 8000 ms | rms 0.065, peak 0.3, min RMS 0.0001 |
| lead-manual-dry | lead | close | pass | KesshoNativeSwift/Kessho/Presets/Bright_Bells.json | lead1:72:0.82:700, lead1:76:0.75:650 | 4500 ms | rms 0.05, peak 0.26, min RMS 0.0001 |
| lead-delay-heavy | delay-heavy | perceptual | pass | KesshoNativeSwift/Kessho/Presets/StringWaves.json | lead1:72:0.82:700, lead1:76:0.75:650 | 7000 ms | rms 0.07, peak 0.32, min RMS 0.0001 |
| piano-manual-dry | piano | perceptual | pass | src/ui/state.ts#DEFAULT_STATE | piano:60:0.78:900, piano:64:0.72:850 | 4500 ms | rms 0.2, peak 0.55, min RMS 0.00004 |
| synth-euclid-lead-grid | lead | perceptual | pass | src/ui/state.ts | self-running | 3500 ms | rms 0.04, peak 0.25, min RMS 0.00003 |
| pad-delay-pingpong | delay-heavy | perceptual | pass | src/ui/delay/delayPresets.ts#pingPongClean | pad1:60:0.78:900 | 6500 ms | rms 0.06, peak 0.3, min RMS 0.0001 |
| pad-delay-reverb-bloom | delay+reverb | perceptual | pass | src/ui/delay/delayPresets.ts#chorusWash | pad1:60:0.78:900 | 8000 ms | rms 0.075, peak 0.34, min RMS 0.0001 |
| granular-pad-cloud | granular routing | perceptual | pass | src/ui/granular/granularPresets.ts#classic_cloud | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 9000 ms | rms 0.09, peak 0.35, min RMS 0.00008 |
| granular-delay-return | granular routing | perceptual | pass | KesshoNativeSwift/Kessho/Presets/WaveOut.json | pad1:60:0.78:900 | 9000 ms | rms 0.1, peak 0.38, min RMS 0.00008 |
| drum-euclid-tight | drum | close | pass | src/ui/state.ts#DEFAULT_STATE | self-running | 7000 ms | rms 0.075, peak 0.35, min RMS 0.00008 |
| drum-delay-dub | drum | perceptual | pass | src/ui/drums/drumSourcePresets.ts#dubbedOut | self-running | 8000 ms | rms 0.09, peak 0.38, min RMS 0.00008 |
| earth-water-only | soundscape/earth | perceptual | pass | src/ui/earth/earthPresets.ts#waterOnly | self-running | 10000 ms | rms 0.1, peak 0.4, min RMS 0.00005 |
| earth-full-nature | soundscape/earth | manual-review | pass | src/ui/earth/earthPresets.ts#fullNature | self-running | 12000 ms | rms 0.12, peak 0.42, min RMS 0.00005 |
| soundscape-ocean-pad | soundscape/earth | perceptual | pass | KesshoNativeSwift/Kessho/Presets/WaveOut.json | pad1:60:0.78:900 | 10000 ms | rms 0.11, peak 0.4, min RMS 0.00005 |
| dynamics-master-chain | dynamics/master chain | perceptual | pass | src/ui/dynamics/dynamicsPresets.ts#ambientWaterGlue | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 8000 ms | rms 0.08, peak 0.34, min RMS 0.0001 |
| full-mix-gamelan | full mix | manual-review | pass | KesshoNativeSwift/Kessho/Presets/Gamelantest.json | lead1:72:0.82:700, lead1:76:0.75:650, pad1:60:0.78:900 | 12000 ms | rms 0.12, peak 0.42, min RMS 0.0001 |
| full-mix-dark-ambient | full mix | manual-review | pass | KesshoNativeSwift/Kessho/Presets/Dark_Textures.json | pad1:48:0.72:1800, pad1:55:0.68:1800, pad1:62:0.62:1800 | 12000 ms | rms 0.13, peak 0.45, min RMS 0.00008 |

## Case Notes

### pad-simple-dry

Title: Simple dry pad

Intent: Small deterministic pad chord with no shared FX; this stays a waveform parity sentinel for the richer pad blend.

Ready when: pad manual notes work in both engines

Threshold class: exact

Expected outcome: pass

State patch keys: 114

State patch SHA-256: `015f7ece27ed4bedf2b99a0d1d40e9c1c67d22586155dc39713a751f28f7bb82`

### default-pad-dry

Title: Default pad dry

Intent: The unadorned app-default pad sustain path, dried out so it is a stable migration gate without conflating the 12s release tail.

Ready when: pad manual notes work in both engines

Threshold class: exact

Expected outcome: pass

State patch keys: 37

State patch SHA-256: `f340137abbbb0f9c751dce2c382c07c4b602cb9f8653602b192c8670325aa796`

### default-pad2-dry

Title: Default Pad 2 dry

Intent: The same dry sustain gate through Pad 2 voice assignment and route selection.

Ready when: pad2 manual notes route to the assigned Pad 2 voice in both engines

Threshold class: exact

Expected outcome: pass

State patch keys: 39

State patch SHA-256: `73fc2297f098ca31a627dd143c4cdb8e9f39644d28e2679dcdedf6e6aefa7f6c`

### pad-reverb-tail

Title: Pad plus long reverb tail

Intent: Same musical role as the dry pad, but with the shared reverb return and tail behavior active.

Ready when: shared reverb return is represented in the core host

Threshold class: close

Expected outcome: pass

State patch keys: 108

State patch SHA-256: `fa2db7b738fdd028a5037e696ca1128e9730c2c4447459acbb02a147b4594c34`

### pad-dark-dense

Title: Dense dark pad

Intent: Represents the darker, slower stock state used by the existing golden profile.

Ready when: pad source and reverb path are stable

Threshold class: close

Expected outcome: pass

State patch keys: 88

State patch SHA-256: `6ac5e25ed32174ab5eee9826f60539f646022e5ce895c8b8e6dc2bed2b9488fb`

### lead-manual-dry

Title: Manual dry lead

Intent: Single-source 4-op lead timbre without pad, delay, or reverb masking.

Ready when: manual lead1 trigger support exists for core-wasm parity capture

Threshold class: close

Expected outcome: pass

State patch keys: 115

State patch SHA-256: `e0a5d50803c07c881e17e3b6adac4d2c569840302bce33db42683234f9dd6869`

### lead-delay-heavy

Title: Lead into heavy Delay A

Intent: High-feedback shared Delay A with a lead source, including ping-pong width and reverb send.

Ready when: manual lead1 trigger support exists; Delay A module is represented in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 121

State patch SHA-256: `22f530fcf53e49c7decd130586c346dac512e32cddf7461d7a5b1ca26743c2f1`

### piano-manual-dry

Title: Manual dry piano

Intent: Sampled piano dry source parity. Core mode uses a bounded host-side sample bridge so piano no longer goes silent while keeping idle Core CPU unchanged.

Ready when: manual piano trigger support exists for core-wasm parity capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 43

State patch SHA-256: `db41c098429d47ba95a0c74c6f06ba9b3f5efa06c8f3b7e4db6aae80ef533cc2`

### synth-euclid-lead-grid

Title: Synth Euclid lead grid

Intent: Self-running synth Euclidean lead route, verifying Core turns the sequencer lanes into repeating lead note events with web-style grid alignment.

Ready when: Core host generates synth Euclidean notes and the worklet honors the initial join-grid delay

Threshold class: perceptual

Expected outcome: pass

State patch keys: 66

State patch SHA-256: `a1684d5c4ed3aa5d99c1aa167e028c94807a65e92573167e9fed31ae22e2a980`

### pad-delay-pingpong

Title: Pad into ping-pong Delay A

Intent: Delay-heavy case that still uses current pad manual trigger support.

Ready when: pad Delay A send and Delay A return are represented in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 41

State patch SHA-256: `91255f6d072445165ede42ac908f7a93243d3f418cdaedf8bc3c1531660b704f`

### pad-delay-reverb-bloom

Title: Pad delay into reverb bloom

Intent: Representative combined FX case: pad excites Delay A, the delay return feeds shared reverb, and both tails must stay sane.

Ready when: Delay A and shared reverb return are both represented in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 48

State patch SHA-256: `e907022eab065f71ca4ef54d86f183b49cc9b278ef617f772c204a60ca314241`

### granular-pad-cloud

Title: Pad-fed granular cloud

Intent: Pad source routed through the granular bus with a modest reverb return.

Ready when: granular bus routing is available in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 42

State patch SHA-256: `9229c650c33c5c1500fea4e86f666087d8d8e74b6dab840509421d5a9428f7e9`

### granular-delay-return

Title: Delay returns through granular

Intent: Exercises cross-routing where the delay path becomes a granular input rather than only a wet return.

Ready when: Delay A to granular and granular return routing are represented in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 161

State patch SHA-256: `df7f0c982b23b257a13e99558e19c02e2f1364888417737f644c984fe4bfec12`

### drum-euclid-tight

Title: Tight Euclidean drum kit

Intent: Self-running drum source without delay masking; catches transient timing and level drift.

Ready when: shared-start capture aligns self-running drum sequencer between engines

Threshold class: close

Expected outcome: pass

State patch keys: 61

State patch SHA-256: `76568fd8fe31c269204d1a6d162e19dbf7c4a5e7f3afb5b4bdf8885bc37d45db`

### drum-delay-dub

Title: Dubbed-out drum delay

Intent: Representative drum transients plus feedback delay smear.

Ready when: shared-start capture aligns self-running drum sequencer; drum delay path is represented

Threshold class: perceptual

Expected outcome: pass

State patch keys: 72

State patch SHA-256: `73c82f4729e3e0172756bf4287aab19b0c4c009ebbd76a430bf715cbcd641056`

### earth-water-only

Title: Water-only earth bed

Intent: Simple self-running earth layer with only water enabled.

Ready when: shared-start capture seeds earth texture scheduling consistently

Threshold class: perceptual

Expected outcome: pass

State patch keys: 38

State patch SHA-256: `7073755a1f17d4aafeab2dd4f8c2163a3661166ab595bcd8fae927f8aab917ba`

### earth-full-nature

Title: Full nature earth kit

Intent: The broadest earth/soundscape state in the corpus, with multiple stochastic layers.

Ready when: shared-start capture seeds earth texture scheduling consistently

Threshold class: manual-review

Expected outcome: pass

State patch keys: 45

State patch SHA-256: `053aa7145f91d064c80c6b1fd3e355ed83c6cbdab82f9d6f39ace7c89aadad11`

### soundscape-ocean-pad

Title: Ocean bed plus sparse pad

Intent: Hybrid musical pad and soundscape layer based on an existing full-state preset.

Ready when: shared-start capture handles pad manual trigger and ocean sample scheduling

Threshold class: perceptual

Expected outcome: pass

State patch keys: 158

State patch SHA-256: `8c215f3d64f84e0dddec4b67a918360d64a6f1170be8a6c1f910205cf20f40c3`

### dynamics-master-chain

Title: Pad through dynamics and master chain

Intent: Master-chain acceptance case covering Dynamics page character/degrade/saturation/end compressor plus master saturation.

Ready when: dynamics and master-chain routing are represented in core-wasm capture

Threshold class: perceptual

Expected outcome: pass

State patch keys: 63

State patch SHA-256: `34bd22999df568fc9090c754c1f6d13f0429fec4738ce2a909854ccd450cbb05`

### full-mix-gamelan

Title: Gamelan full mix

Intent: Mixed melodic, lead, drum, delay, and reverb state from an existing preset, scoped to manual synth triggers plus the represented drum backbone.

Ready when: shared-start capture covers manual pad/lead notes, drum sequencer output, delay, and reverb

Threshold class: manual-review

Expected outcome: pass

State patch keys: 132

State patch SHA-256: `1dc35f8017c5379848ce63c771cf9ee06b56dd44a29e5dffc8980699fb4a8652`

### full-mix-dark-ambient

Title: Dark ambient full mix

Intent: Dense acceptance endpoint: pad, granular, drum pulse, earth bed, and reverb all active.

Ready when: shared-start capture covers sequencers, granular routing, earth scheduling, and reverb

Threshold class: manual-review

Expected outcome: pass

State patch keys: 92

State patch SHA-256: `06ea0d40f5276baa8eb869e66172bb9f9a4d43a4ae345bf051ab1a81bae3bce6`

## Notes

- The JSON report includes fully resolved `statePatch` objects. For JSON state sources, the source preset state is merged first and the case patch is applied last.
- Lead, drum, earth, granular, and full-mix cases are acceptance targets for the ready harness. They may fail against today's partial core host if the corresponding source or routing path is not exposed yet.
- Keep this corpus at 10 to 20 cases. Add a new case only when it covers a materially different source, route, or failure mode.

## Known Exclusions And Debt

- This is browser Web Audio versus core-wasm acceptance only; macOS/iOS device CPU, battery, route-change, and screen-off behavior stay outside this gate.
- The corpus does not require bit-exact parity. It is meant to decide when core-wasm is close enough for migration.
- Earth/soundscape, drum sequencer, granular feedback, and full-mix cases use envelope or transient gates instead of bit-exact waveform correlation.
- Lead manual-note cases require core-wasm lead trigger support in the parity harness.
- Preset storage/cloud round-trip validation is out of scope here; cases use local states and local factory preset references.
