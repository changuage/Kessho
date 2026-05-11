# Kessho Complete C++ Product Core Migration Plan

**Decision locked:** Complete C++ Product Core. Thin web/iOS/macOS hosts. Old web engine retained only for comparison.

**Plan status:** Execution plan for a coding agent.

**Primary goal:** Replace the current hybrid TypeScript/CoreHost + C++ module bridge with one shared C++ Product Core that owns the Kessho musical engine across web, iOS, and macOS.

**Secondary goal:** Preserve the old web engine as a reference/comparison path while making `core-product` the eventual default production engine.

---

## 0. Non-negotiable target architecture

The final architecture must be:

```text
React Web UI                         Swift iOS/macOS UI
     |                                      |
     | controls/events/assets/telemetry     | controls/events/assets/telemetry
     v                                      v
Thin Web CoreProductHost             Thin Swift/ObjC++ CoreProductHost
     |                                      |
     | WASM AudioWorklet bridge             | native AVAudioEngine/AudioUnit bridge
     v                                      v
             Shared C++ Kessho Product Core
                 - product snapshot/schema
                 - transport
                 - sequencers
                 - harmony/scale/RNG/evolution
                 - source scheduling
                 - Pad 1 / Pad 2
                 - Lead 1 / Lead 2
                 - Drum source
                 - Piano source using host-decoded buffers
                 - Soundscape/earth source using host-decoded buffers
                 - granular
                 - Delay A / Delay B
                 - reverb
                 - spectral freeze
                 - dynamics/master chain
                 - routing matrix
                 - stems/meters/telemetry
```

The final architecture must **not** be:

```text
React UI
  -> TypeScript CoreHost musical brain
  -> C++ modules
  -> Worklet adapter
```

The C++ Product Core owns all deterministic sound-producing behavior. Hosts own UI, platform I/O, asset fetching/decoding, persistence, permissions, and display.

---

## 1. Repo evidence motivating this plan

This plan is based on the public Kessho repo state visible on `main`.

Observed issues to address:

1. `src/audio/runtime.ts` still selects Core only through `?engine=core-wasm`, otherwise it loads the existing TypeScript web engine.
2. `src/audio/runtime.ts` includes no-op fallback behavior for critical methods such as `startJourneyMorphClock`, `stopJourneyMorphClock`, and `triggerDrumVoice`.
3. `cpp/KesshoCore/include/KesshoCore/KesshoCore.h` exposes a useful low-level C/C++ engine and module API, but it does not expose a complete product-level API for loading Kessho app state and rendering the entire product graph.
4. `cpp/KesshoCore/include/KesshoCore/KesshoTypes.h` shows top-level render modes of only `KESSHO_RENDER_SILENCE` and `KESSHO_RENDER_SMOKE_SINE`; current top-level Core state is much smaller than the real app state.
5. `src/audio/coreSnapshot.ts` contains richer web snapshot concepts, but the actual Core scalar snapshot is only a small transport/smoke/master subset.
6. `src/audio/coreEngineHost.ts` is still a large product-behavior bridge: it imports TypeScript music/DSP helpers, hardcodes module param counts, owns source preview configs, sequencing-related structures, scheduling metadata, and manual mappings.
7. `KesshoNativeSwift/README.md` describes the Swift tree as a paused native prototype rather than a completed shared C++ Product Core path.

The migration is complete only when the C++ Product Core becomes the canonical engine and the web/native hosts become thin adapters.

---

## 2. Engine modes to preserve during migration

Implement and preserve these explicit modes:

```text
web-ts
  Old TypeScript/Web Audio engine.
  Purpose: reference/comparison only.

core-bridge
  Current TypeScript CoreHost + C++ module bridge path.
  Purpose: transitional reference for existing Core mode.

core-product
  New full C++ Product Core.
  Purpose: final production engine.
```

Rules:

1. Only one engine may run at a time in live playback.
2. `web-ts` must remain available for A/B comparison until the migration is accepted.
3. `core-bridge` may remain available during migration but should be deleted or frozen after `core-product` is complete.
4. `core-product` becomes the production default after all acceptance gates pass.
5. Offline comparison harnesses may render multiple engines sequentially, but live playback must not run multiple engines simultaneously.

Recommended runtime query format:

```text
?engine=web-ts
?engine=core-bridge
?engine=core-product
```

Recommended runtime selection order:

```ts
const engineMode =
  new URLSearchParams(location.search).get('engine')
  ?? localStorage.getItem('kesshoEngine')
  ?? 'core-product';
```

During migration, default may remain `web-ts` or `core-bridge`. At final acceptance, default must become `core-product`.

---

## 3. Coding agent rules

The coding agent must follow these rules for every phase.

### 3.1 Real-time audio rules

1. No allocations in audio render callbacks.
2. No JSON parsing in audio render callbacks.
3. No locks/mutex waits in audio render callbacks.
4. No file/network access in audio render callbacks.
5. No dynamic graph construction in audio render callbacks.
6. No per-sample JS/WASM boundary calls.
7. No full snapshot copy every render quantum.
8. No WebAudio timers for musical scheduling in `core-product`.
9. No host-side sequencer timers in `core-product`.
10. Use fixed-size buffers, ring buffers, preallocated voices, dirty diffs, and bounded processing.

### 3.2 Architecture rules

1. TypeScript must not own production sequencer logic in `core-product`.
2. TypeScript must not own production harmony/RNG/evolution logic in `core-product`.
3. TypeScript must not manually maintain production module param index maps for `core-product`.
4. Swift must not own separate production DSP or generative logic for native parity.
5. Hosts may fetch/decode/cache assets, but C++ must schedule and render asset voices.
6. The old web engine may remain only as `web-ts` reference.
7. `core-bridge` must not become the final architecture.

### 3.3 Acceptance rules

A phase is not accepted until:

1. It builds for web/WASM.
2. It builds for native C++ where applicable.
3. It has tests for its new behavior.
4. It does not regress existing `web-ts` reference mode.
5. It does not add audio-critical no-op fallbacks.
6. It updates the capability report and CI gates.

---

## 4. Definition of done for the full migration

The migration is complete when all of these are true:

1. `core-product` renders the full Kessho graph through C++ Product Core.
2. C++ owns Synth Euclid and Drum Euclid sequencing.
3. C++ owns transport, bar/phrase clocks, swing, ratchets, probability, trig conditions, and note/event sample offsets.
4. C++ owns harmony, scale, RNG, chord/voicing generation, and evolution.
5. C++ owns source scheduling for pads, leads, drums, piano, and soundscapes.
6. C++ owns routing, dry/wet sends, granular, Delay A, Delay B, reverb, spectral freeze, dynamics, and master chain.
7. Piano and nature textures are host-decoded but C++-scheduled and C++-rendered.
8. TypeScript no longer contains production musical decision logic for `core-product`.
9. Swift no longer contains production duplicate DSP/generative logic for native parity.
10. Web and iOS/macOS load the same product snapshot schema.
11. Web and iOS/macOS use the same C++ Product Core source.
12. Runtime defaults to `core-product`.
13. `web-ts` remains available only as reference/comparison.
14. `core-bridge` is deleted or frozen behind an explicit legacy flag.
15. CI fails on product-core, sequencer, snapshot, build, WASM, native, CPU, or contract regressions.

---

## 5. Proposed file layout

Create the following new product-core structure.

```text
cpp/KesshoCore/include/KesshoCore/
  KesshoProductCore.h
  KesshoProductTypes.h
  KesshoProductSnapshot.h
  KesshoProductEvents.h
  KesshoProductTelemetry.h
  KesshoProductAssets.h

cpp/KesshoCore/schema/
  kessho_product.schema.json
  kessho_product_params.schema.json
  kessho_product_events.schema.json

cpp/KesshoCore/generated/
  KesshoProductSchema.h
  KesshoProductDefaults.h
  KesshoProductParamIds.h
  KesshoProductEventIds.h
  KesshoProductSchemaHash.h

cpp/KesshoCore/src/product/
  KesshoProductEngine.cpp
  KesshoProductGraph.cpp
  KesshoProductRender.cpp
  KesshoProductSnapshot.cpp
  KesshoProductEvents.cpp
  KesshoProductTelemetry.cpp
  KesshoProductAssets.cpp

cpp/KesshoCore/src/product/transport/
  ProductTransport.cpp
  MusicalClock.cpp

cpp/KesshoCore/src/product/sequencer/
  SynthEuclidSequencer.cpp
  DrumEuclidSequencer.cpp
  SequencerClock.cpp
  SequencerEventBuffer.cpp
  RatchetEngine.cpp
  TrigConditionEngine.cpp

cpp/KesshoCore/src/product/music/
  DeterministicRng.cpp
  ScaleEngine.cpp
  HarmonyEngine.cpp
  VoicingEngine.cpp
  EvolutionEngine.cpp
  JourneyMorphClock.cpp
  CircleOfFifths.cpp

cpp/KesshoCore/src/product/sources/
  PadSource.cpp
  LeadSource.cpp
  DrumSource.cpp
  PianoSource.cpp
  SoundscapeSource.cpp
  SourceVoiceAllocator.cpp

cpp/KesshoCore/src/product/assets/
  AssetRegistry.cpp
  SampleBuffer.cpp
  SampleVoice.cpp
  LoopCrossfade.cpp

cpp/KesshoCore/src/product/graph/
  RoutingMatrix.cpp
  BusMixer.cpp
  FxGraph.cpp
  MasterChain.cpp
  StemOutputs.cpp

src/audio/generated/
  kesshoProductSchema.ts
  kesshoProductParams.ts
  kesshoProductEvents.ts

src/audio/
  coreProductEngineHost.ts
  coreProductRuntime.ts
  coreProductAssets.ts
  coreProductTelemetry.ts

public/worklets/
  kessho-core-product.worklet.js

KesshoNativeSwift/CoreBridge/
  KesshoCoreBridge.h
  KesshoCoreBridge.mm
  KesshoCoreEngine.swift
  KesshoCoreAssetProvider.swift
```

Existing C++ modules under `cpp/KesshoCore/src/modules` should remain as DSP building blocks and be wrapped by product sources/graph.

---

## 6. Phase 0 — Baseline inventory and guardrails

### Objective

Create a precise baseline so the coding agent does not accidentally regress or delete the current comparison paths.

### Tasks

1. Add a migration status document:

```text
docs/kessho-product-core-migration-status.md
```

2. Add a capability report generated at app startup for each engine mode:

```text
engineMode
supportsFullProductGraph
supportsSynthSequencer
supportsDrumSequencer
supportsJourneyMorphClock
supportsHarmonyCore
supportsCoreAssetRendering
supportsNativeBridge
supportsRecordableStems
supportsCpuTelemetry
unsupportedMethods[]
legacyFallbacks[]
```

3. Add a test or script that asserts current modes are resolvable:

```text
web-ts
core-bridge
core-product
```

4. In `runtime.ts`, stop using ambiguous `core-wasm` naming for the new final path. Map legacy `?engine=core-wasm` to `core-bridge` for backward compatibility.

5. Record all existing audio-critical fallback/no-op methods and classify them:

```text
allowed visual fallback
allowed diagnostic fallback
audio-critical fallback requiring implementation
```

6. Mark `triggerDrumVoice`, `startJourneyMorphClock`, and `stopJourneyMorphClock` as audio-critical for `core-product`.

### Acceptance criteria

1. App still launches in `web-ts`.
2. App still launches in existing Core bridge mode.
3. New `core-product` mode can be selected, even if it initially renders silence or smoke during Phase 0 only.
4. Capability report clearly says what is missing.
5. Audio-critical no-ops are not silently accepted in `core-product` development mode.

### Failure conditions

1. `web-ts` reference path breaks.
2. Existing Core bridge comparison path disappears.
3. Missing audio-critical functionality is silently ignored in `core-product`.

---

## 7. Phase 1 — Schema and generated bindings

### Objective

Stop hand-maintaining production param IDs, param counts, event IDs, defaults, ranges, and enum values in TypeScript/Swift. Establish a single schema source of truth.

### Tasks

1. Create schema files:

```text
cpp/KesshoCore/schema/kessho_product.schema.json
cpp/KesshoCore/schema/kessho_product_params.schema.json
cpp/KesshoCore/schema/kessho_product_events.schema.json
```

2. Create code generator:

```text
scripts/generate-kessho-product-bindings.mjs
```

3. Generate C++:

```text
cpp/KesshoCore/generated/KesshoProductSchema.h
cpp/KesshoCore/generated/KesshoProductDefaults.h
cpp/KesshoCore/generated/KesshoProductParamIds.h
cpp/KesshoCore/generated/KesshoProductEventIds.h
cpp/KesshoCore/generated/KesshoProductSchemaHash.h
```

4. Generate TypeScript:

```text
src/audio/generated/kesshoProductSchema.ts
src/audio/generated/kesshoProductParams.ts
src/audio/generated/kesshoProductEvents.ts
```

5. Generate Swift:

```text
KesshoNativeSwift/Generated/KesshoProductSchema.swift
KesshoNativeSwift/Generated/KesshoProductParams.swift
KesshoNativeSwift/Generated/KesshoProductEvents.swift
```

6. Include at minimum these schema groups:

```text
transport
harmony
sources.pad1
sources.pad2
sources.lead1
sources.lead2
sources.drum
sources.piano
sources.soundscape
sequencers.synthEuclid
sequencers.drumEuclid
journey
fx.granular
fx.delayA
fx.delayB
fx.reverb
fx.spectralFreeze
fx.dynamics
routing
master
assets
telemetry
```

7. Add generated param count assertions for every source/module/product component.

8. Add schema hash checks to C++/TS/Swift. App must refuse to load a product snapshot when schema hashes are incompatible unless a migration function exists.

### Acceptance criteria

1. `npm run generate:kessho-product-bindings` or equivalent generates all files deterministically.
2. Generated files are stable across repeated runs.
3. Generated C++ compiles.
4. Generated TypeScript typechecks.
5. Generated Swift compiles once native target is built.
6. No production `core-product` code relies on hand-maintained param counts.

### Failure conditions

1. A production path still hardcodes product param counts in TypeScript.
2. TS/Swift/C++ enum values can drift.
3. Snapshot schema has no version or hash.

---

## 8. Phase 2 — C++ Product Core public API

### Objective

Create a product-level C++ API distinct from the existing low-level smoke/module API.

### Files to create

```text
cpp/KesshoCore/include/KesshoCore/KesshoProductCore.h
cpp/KesshoCore/include/KesshoCore/KesshoProductTypes.h
cpp/KesshoCore/include/KesshoCore/KesshoProductSnapshot.h
cpp/KesshoCore/include/KesshoCore/KesshoProductEvents.h
cpp/KesshoCore/include/KesshoCore/KesshoProductTelemetry.h
cpp/KesshoCore/include/KesshoCore/KesshoProductAssets.h

cpp/KesshoCore/src/product/KesshoProductEngine.cpp
cpp/KesshoCore/src/product/KesshoProductGraph.cpp
cpp/KesshoCore/src/product/KesshoProductRender.cpp
cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp
cpp/KesshoCore/src/product/KesshoProductEvents.cpp
cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp
cpp/KesshoCore/src/product/KesshoProductAssets.cpp
```

### API shape

Add a C-compatible API suitable for WASM and native Swift/ObjC++:

```cpp
#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoProductEngine KesshoProductEngine;

KesshoProductEngine* kessho_product_create(
  double sampleRate,
  uint32_t maxBlockSize,
  uint32_t flags
);

void kessho_product_destroy(KesshoProductEngine* engine);
void kessho_product_reset(KesshoProductEngine* engine);

int32_t kessho_product_load_snapshot_v2(
  KesshoProductEngine* engine,
  const void* snapshotBytes,
  uint32_t snapshotByteCount
);

int32_t kessho_product_enqueue_event(
  KesshoProductEngine* engine,
  const KesshoProductEvent* event
);

int32_t kessho_product_enqueue_events(
  KesshoProductEngine* engine,
  const KesshoProductEvent* events,
  uint32_t eventCount
);

void kessho_product_render(
  KesshoProductEngine* engine,
  float* outL,
  float* outR,
  uint32_t frames
);

int32_t kessho_product_get_stem(
  KesshoProductEngine* engine,
  uint32_t stemId,
  float* outL,
  float* outR,
  uint32_t frames
);

KesshoProductTelemetry kessho_product_get_telemetry(
  KesshoProductEngine* engine
);

int32_t kessho_product_register_asset_buffer(
  KesshoProductEngine* engine,
  uint32_t assetId,
  const float* const* channels,
  uint32_t channelCount,
  uint32_t frameCount,
  double assetSampleRate,
  uint32_t flags
);

int32_t kessho_product_unregister_asset_buffer(
  KesshoProductEngine* engine,
  uint32_t assetId
);

#ifdef __cplusplus
}
#endif
```

### Implementation requirements

1. `KesshoProductEngine` must own preallocated internal buffers.
2. `kessho_product_render` must never allocate.
3. Product render initially may render a simple internal non-smoke source, but by Phase 5 it must render real sources.
4. Existing low-level `kessho_render` can remain for smoke tests but must not be treated as the final product engine.
5. WASM exports must include the product API.
6. Native build must expose the same product API.

### Acceptance criteria

1. C++ product API builds.
2. WASM build exports product API symbols.
3. Native C++ build exports product API symbols.
4. `core-product` mode can instantiate `KesshoProductEngine`.
5. Render callback pulls audio from `kessho_product_render`.
6. No low-level smoke-sine render mode is required for `core-product` operation.

### Failure conditions

1. `core-product` uses old smoke/silence render as the app engine.
2. Product API cannot be called from WASM.
3. Product render allocates or locks.

---

## 9. Phase 3 — Product snapshot V2 and realtime event/diff contract

### Objective

Replace the scalar snapshot boundary with a full product snapshot and realtime diff/event contract.

### Snapshot contents

Implement `KesshoProductSnapshotV2` with at least:

```text
version
schemaHash
transport
harmony
sources
  pad1
  pad2
  lead1
  lead2
  drum
  piano
  soundscape
sequencers
  synthEuclid
  drumEuclid
journey
fx
  granular
  delayA
  delayB
  reverb
  spectralFreeze
  dynamics
routing
master
assets
rngState
evolutionState
```

### Event contract

Implement product events:

```text
SetParam
SetTransport
Start
Stop
ResetTransport
LoadSnapshot
SetSequencerStep
SetSequencerLane
SetSequencerPattern
SetRoutingSend
SetSourceEnabled
SetSourcePreset
SetJourneyState
ManualNoteOn
ManualNoteOff
MidiEvent
TriggerDrumVoice
RegisterAsset
UnregisterAsset
RequestTelemetry
```

### Snapshot application rules

1. Full snapshots may be parsed/applied outside the audio callback.
2. Audio-thread state must be compact and preallocated.
3. Realtime updates must use events/diffs through a ring buffer.
4. Snapshot application must produce deterministic C++ internal state.
5. Missing fields must use generated defaults, not ad hoc host defaults.
6. Snapshot migration must be explicit and versioned.

### Web adapter requirements

Create:

```text
src/audio/coreProductSnapshot.ts
src/audio/coreProductEvents.ts
```

These may convert current web app state into `KesshoProductSnapshotV2`, but they must not perform production sequencer/harmony decisions once later phases are complete.

### Acceptance criteria

1. A full product snapshot can be constructed in TypeScript.
2. A full product snapshot can be loaded by C++ Product Core.
3. Schema hash is validated.
4. Dirty param/event updates work without full snapshot reload.
5. No JSON parsing occurs in `kessho_product_render`.
6. Snapshot load failures return explicit error codes.

### Failure conditions

1. Product state is reduced to smoke/scalar preview state.
2. TypeScript retains hidden default mapping not generated from schema.
3. Snapshot updates are copied wholesale every render block.

---

## 10. Phase 4 — Product transport and clock

### Objective

Move transport timing, beat/bar/phrase tracking, swing timing, and sample-accurate event offsets into C++.

### Files to create

```text
cpp/KesshoCore/src/product/transport/ProductTransport.cpp
cpp/KesshoCore/src/product/transport/MusicalClock.cpp
```

### Required behavior

C++ must own:

```text
sample rate
block size
absolute sample time
BPM
beats per bar
bars per phrase
beat position
bar index
phrase index
transport running/stopped state
reset/continue mode
swing grid reference
clock division conversions
sample offset generation inside each block
```

### API/data requirements

Expose telemetry:

```text
sampleTime
beatPosition
barIndex
phraseIndex
isRunning
bpm
currentBlockFrames
```

### Acceptance criteria

1. C++ transport advances sample-accurately inside render.
2. Start/stop/reset events work.
3. BPM changes apply deterministically.
4. Bar and phrase boundaries are reported correctly.
5. Sequencer phases can query transport without involving TypeScript.

### Failure conditions

1. TypeScript timers drive product transport in `core-product`.
2. Bar/phrase state is inferred by the host.
3. Event sample offsets are generated outside C++.

---

## 11. Phase 5 — C++ sequencers

### Objective

Move Synth Euclid and Drum Euclid sequencing into C++ Product Core. This is the most important functional migration because current Core mode sequencers are not fully working.

### Files to create

```text
cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp
cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp
cpp/KesshoCore/src/product/sequencer/SequencerClock.cpp
cpp/KesshoCore/src/product/sequencer/SequencerEventBuffer.cpp
cpp/KesshoCore/src/product/sequencer/RatchetEngine.cpp
cpp/KesshoCore/src/product/sequencer/TrigConditionEngine.cpp
```

### Synth Euclid state to implement

Each synth lane must support:

```text
enabled
source target: pad1, pad2, lead1, lead2, piano, or other allowed source
step count
fill count
rotation
manual step toggles
clock division
swing
probability per step/lane
ratchet count per step/lane
trig condition per step/lane
pitch override per step/lane
pitch direction
expression override per step/lane
expression direction
morph override per step/lane
morph direction
distance override per step/lane
distance direction
sub-lane enablement
bar reset behavior
phrase reset behavior
evolve amount/mode
lane seed/RNG state
```

### Drum Euclid state to implement

Each drum lane must support:

```text
enabled
drum voice target
step count
fill count
rotation
manual step toggles
clock division
swing
probability
ratchet
trig condition
accent/expression
morph value
velocity
FX send overrides
bar reset behavior
phrase reset behavior
evolve amount/mode
lane seed/RNG state
```

### Sequencer output event

Implement sample-offset events:

```cpp
struct KesshoSequencerEvent {
  uint32_t sampleOffset;
  uint16_t sourceId;
  uint16_t laneId;
  uint16_t stepId;
  uint16_t eventKind;
  float frequencyHz;
  float midiNote;
  float velocity;
  float holdSeconds;
  float morph;
  float distance;
  float expression;
  float sendReverb;
  float sendDelayA;
  float sendDelayB;
  float sendGranular;
  uint32_t flags;
};
```

### Render integration

Product render loop must be structured as:

```cpp
void KesshoProductEngine::render(float* outL, float* outR, uint32_t frames) {
  processControlEvents();
  transport.prepareBlock(frames);
  sequencerEvents.clear();
  synthSequencer.generate(transport, frames, sequencerEvents);
  drumSequencer.generate(transport, frames, sequencerEvents);
  journey.generateAutomation(transport, frames, automationEvents);
  graph.render(frames, sequencerEvents, automationEvents, outL, outR);
  transport.commitBlock(frames);
}
```

### Tests to add

Add event-level tests before audio tests:

```text
scripts/check-kessho-product-sequencer-events.mjs
cpp/KesshoCore/tests/ProductSequencerTests.cpp
```

Test cases:

```text
basic 4/4 lane
Euclidean 5 in 16
rotation
swing
probability 0%
probability 100%
ratchet 2/3/4
trig every 2 bars
trig first bar only
bar reset
phrase reset
BPM change mid-run
manual step override
pitch override
morph override
distance override
expression override
drum voice lane mapping
```

### Acceptance criteria

1. `core-product` sequencers generate events without TypeScript note scheduling.
2. Synth Euclid can trigger pad/lead/piano routes.
3. Drum Euclid can trigger drum routes.
4. Ratchets generate multiple sample-accurate events.
5. Probability/trig conditions are deterministic with seed state.
6. Bar/phrase reset works.
7. No TypeScript timer or preview note loop drives `core-product` sequencing.
8. `triggerDrumVoice` is implemented for `core-product`.

### Failure conditions

1. `core-product` relies on `coreEngineHost.ts` to generate production sequencer events.
2. Sequencer timing is quantized to JS timer callbacks.
3. Ratchets/probability/trig conditions are missing.
4. Drum manual trigger remains a no-op.

---

## 12. Phase 6 — Harmony, scale, RNG, evolution, and journey morph

### Objective

Move deterministic musical decision logic into C++.

### Files to create

```text
cpp/KesshoCore/src/product/music/DeterministicRng.cpp
cpp/KesshoCore/src/product/music/ScaleEngine.cpp
cpp/KesshoCore/src/product/music/HarmonyEngine.cpp
cpp/KesshoCore/src/product/music/VoicingEngine.cpp
cpp/KesshoCore/src/product/music/EvolutionEngine.cpp
cpp/KesshoCore/src/product/music/JourneyMorphClock.cpp
cpp/KesshoCore/src/product/music/CircleOfFifths.cpp
```

### C++ must own

```text
root note
scale/mode
manual scale masks
tension
chord mode
voicing mode
circle-of-fifths drift
chord progression state
phrase mutation state
random walk state
seed state
RNG call ordering for product behavior
synth sequencer evolution
drum sequencer evolution
granular evolution
journey morph clock
bar/phrase-aligned morph transitions
```

### Event/API requirements

Implement events:

```text
SetHarmonyRoot
SetScale
SetTension
SetChordMode
SetSeed
ResetRng
SetEvolutionAmount
SetJourneyEnabled
StartJourneyMorphClock
StopJourneyMorphClock
SetJourneyTarget
```

### Acceptance criteria

1. TypeScript no longer decides production chords/voicings for `core-product`.
2. TypeScript no longer decides production sequencer evolution for `core-product`.
3. Journey morph clock methods are implemented and not no-op.
4. Same seed + same snapshot produces deterministic event streams.
5. Harmony state is present in C++ snapshot and telemetry.

### Failure conditions

1. `core-product` calls TypeScript `harmony.ts`, `rng.ts`, or evolution helpers for production decisions.
2. Journey morph is hidden behind no-op fallback.
3. Seed state cannot be snapshotted/restored.

---

## 13. Phase 7 — Source wrappers and source scheduling

### Objective

Move source ownership into the C++ Product Graph. Existing C++ DSP modules become internal implementation details.

### Files to create

```text
cpp/KesshoCore/src/product/sources/PadSource.cpp
cpp/KesshoCore/src/product/sources/LeadSource.cpp
cpp/KesshoCore/src/product/sources/DrumSource.cpp
cpp/KesshoCore/src/product/sources/PianoSource.cpp
cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp
cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp
```

### Each source wrapper must own

```text
enabled state
source preset state
morph state
distance/expression state
voice allocation
manual note handling
MIDI note handling
sequencer event handling
source-level smoothing
source-level envelopes
source-level routing sends
source-level post controls
module parameter translation inside C++
```

### Pad source requirements

Support:

```text
Pad 1
Pad 2
oscillator state
filter state
envelope state
LFO state
modulation destinations
preset morph
manual notes
sequenced notes
MIDI notes
distance macro
routing sends
```

### Lead source requirements

Support:

```text
Lead 1
Lead 2
FM preset state
operator ratios/indexes/envelopes
morph/tension state
manual notes
sequenced notes
MIDI notes
routing sends
```

### Drum source requirements

Support:

```text
drum voices
manual trigger
sequencer trigger
audio-critical triggerDrumVoice API
velocity/accent
morph
per-voice routing sends
```

### Piano source requirements

Support:

```text
host-registered decoded sample buffers
voice allocation
sample selection
velocity mapping
release envelopes
playback rate/resampling
voice stealing
manual/sequenced/MIDI notes
routing sends
```

### Soundscape source requirements

Support:

```text
host-registered decoded texture buffers
deterministic texture selection
looping/crossfade
envelope/gain/pan
randomized placement using C++ RNG
routing sends
```

### Acceptance criteria

1. Source events generated by C++ sequencers are consumed inside C++.
2. Manual note and MIDI events are routed inside C++.
3. TypeScript does not build production `PreviewNote[]` or `PreviewSourceConfig` for `core-product`.
4. TypeScript does not manually map product source state to raw module params for `core-product`.
5. Pad, lead, drum, piano, and soundscape sources can render non-silent audio through C++ graph.

### Failure conditions

1. Product source scheduling still lives in `coreEngineHost.ts`.
2. Source wrappers only expose raw module param buffers back to TypeScript.
3. Piano or soundscape remains an independent host playback engine.

---

## 14. Phase 8 — Routing matrix, FX graph, stems, and master chain

### Objective

Move routing, sends, FX order, bus summing, stems, and master chain into C++.

### Files to create

```text
cpp/KesshoCore/src/product/graph/RoutingMatrix.cpp
cpp/KesshoCore/src/product/graph/BusMixer.cpp
cpp/KesshoCore/src/product/graph/FxGraph.cpp
cpp/KesshoCore/src/product/graph/MasterChain.cpp
cpp/KesshoCore/src/product/graph/StemOutputs.cpp
```

### Graph order

Implement a stable graph order:

```text
1. process control events
2. generate sequencer events
3. render sources into source stems
4. apply source post controls
5. accumulate dry bus and FX sends
6. process Delay A
7. process Delay B
8. process granular
9. process spectral freeze
10. process reverb
11. sum dry/wet buses
12. apply dynamics/character/degrade
13. apply master gain/limiter
14. output stereo
15. update telemetry/meters/stems
```

### Internal buses

Use preallocated internal buses:

```text
Dry
ReverbIn
ReverbOut
DelayAIn
DelayAOut
DelayBIn
DelayBOut
GranularIn
GranularOut
SpectralFreezeIn
SpectralFreezeOut
MasterIn
MasterOut
```

### Routing matrix must support

```text
per-source dry gain
per-source reverb send
per-source Delay A send
per-source Delay B send
per-source granular send
Delay A to Delay B send
Delay B to Delay A send
Delay to reverb send
granular to reverb/delay policy
spectral freeze input selection
source stem output
FX stem output
master output
```

### FX ownership

C++ graph must own:

```text
granular macro/evolution target application
Delay A/B tempo sync and feedback routing
reverb send/tail policy
spectral freeze capture/routing policy
dynamics/character/degrade/master chain ordering
limiter/master telemetry
```

### Acceptance criteria

1. All source sends are represented in C++ snapshot/routing state.
2. All source sends are applied inside C++.
3. Web host no longer decides production dry/wet routing for `core-product`.
4. Recordable stems can be read from C++.
5. Meter telemetry comes from C++.
6. Inactive modules are skipped or cheap.

### Failure conditions

1. Product routing remains a TypeScript send map.
2. Reverb/delay/granular routing differs by platform host.
3. Stems depend on Web Audio node graph instead of C++ product graph.

---

## 15. Phase 9 — Host asset provider with C++ rendering

### Objective

Resolve piano and nature texture parity without forcing C++/WASM to fetch/decode assets. Hosts decode assets; C++ schedules and renders them.

### Files to create

```text
cpp/KesshoCore/src/product/assets/AssetRegistry.cpp
cpp/KesshoCore/src/product/assets/SampleBuffer.cpp
cpp/KesshoCore/src/product/assets/SampleVoice.cpp
cpp/KesshoCore/src/product/assets/LoopCrossfade.cpp

src/audio/coreProductAssets.ts
KesshoNativeSwift/CoreBridge/KesshoCoreAssetProvider.swift
```

### Host responsibilities

Web host:

```text
fetch assets
decode with browser APIs
resample only if required
register decoded PCM buffers with C++ WASM
cache decoded buffers
unregister buffers when no longer needed
```

Native host:

```text
load assets
decode with AVFoundation or native APIs
register decoded PCM buffers with C++ native core
cache decoded buffers
unregister buffers when no longer needed
```

### C++ responsibilities

```text
asset registry
asset ID lookup
sample voice allocation
sample selection
playback position
playback rate
resampling/interpolation
looping
crossfading
release envelopes
voice stealing
texture randomization
texture scheduling
routing sends
telemetry
```

### Asset API

```cpp
int32_t kessho_product_register_asset_buffer(
  KesshoProductEngine* engine,
  uint32_t assetId,
  const float* const* channels,
  uint32_t channelCount,
  uint32_t frameCount,
  double assetSampleRate,
  uint32_t flags
);
```

### Acceptance criteria

1. Piano source renders through C++ using host-decoded samples.
2. Soundscape/nature textures render through C++ using host-decoded buffers.
3. Host does not independently schedule piano/nature playback in `core-product`.
4. Missing assets degrade explicitly with telemetry/errors, not silent fake parity.
5. Asset registration is not performed in audio render.
6. Asset playback is deterministic where seeded behavior is expected.

### Failure conditions

1. Piano remains host-played and only sends wet signal to Core.
2. Earth/nature texture remains a generated surrogate when real assets are required.
3. C++ attempts to fetch/decode files inside real-time rendering.

---

## 16. Phase 10 — Web `core-product` host and worklet

### Objective

Replace the product-behavior-heavy CoreHost with a thin web adapter for the C++ Product Core.

### Files to create

```text
src/audio/coreProductEngineHost.ts
src/audio/coreProductRuntime.ts
src/audio/coreProductAssets.ts
src/audio/coreProductTelemetry.ts
public/worklets/kessho-core-product.worklet.js
```

### Host responsibilities

The web host may:

```text
load WASM
instantiate AudioWorklet
create/destroy product engine
send snapshots/events to Core
load/decode/register assets
forward MIDI/manual UI events to Core
receive telemetry/meters/stems
expose AudioEngine-compatible facade to UI
```

The web host must not:

```text
generate production sequencer events
decide production harmony/chords
decide production RNG/evolution
do production source scheduling
map product state to raw module param arrays manually
decide production FX routing
render piano/nature playback independently
hide missing audio-critical methods behind no-ops
```

### Runtime mode behavior

Implement:

```text
web-ts -> existing ./engine
core-bridge -> current ./coreEngineHost
core-product -> new ./coreProductEngineHost
```

### Capability behavior

For `core-product`, missing audio-critical methods must throw in development and be reported in capability telemetry.

Audio-critical methods include at minimum:

```text
start
resume
suspend
set/update methods used by UI
manual synth note methods
triggerDrumVoice
startJourneyMorphClock
stopJourneyMorphClock
sequencer update methods
preset load methods
asset registration methods
```

### Acceptance criteria

1. `?engine=core-product` loads C++ Product Core.
2. `?engine=web-ts` still loads old web engine.
3. `?engine=core-bridge` still loads current bridge until retired.
4. `coreProductEngineHost.ts` remains a thin adapter.
5. No production sequencer/harmony/routing logic is copied from `coreEngineHost.ts` into the new host.
6. The worklet pulls audio from `kessho_product_render`.

### Failure conditions

1. The agent recreates another giant TypeScript CoreHost.
2. `core-product` silently falls back to `core-bridge` behavior.
3. Audio-critical methods no-op in `core-product`.

---

## 17. Phase 11 — Native iOS/macOS C++ bridge

### Objective

Make iOS/macOS use the same C++ Product Core natively. Swift remains UI/platform host, not production DSP engine.

### Files to create

```text
KesshoNativeSwift/CoreBridge/KesshoCoreBridge.h
KesshoNativeSwift/CoreBridge/KesshoCoreBridge.mm
KesshoNativeSwift/CoreBridge/KesshoCoreEngine.swift
KesshoNativeSwift/CoreBridge/KesshoCoreAssetProvider.swift
```

### Native host responsibilities

Swift/ObjC++ may own:

```text
SwiftUI views
audio session setup
AVAudioEngine/AudioUnit setup
MIDI device access
asset loading/decoding
preset browsing
settings/persistence
telemetry display
```

C++ Product Core must own:

```text
rendering
sequencers
harmony/RNG/evolution
source scheduling
source voices
routing
FX/master
asset voice playback
```

### Render bridge

Use one of:

```text
AVAudioSourceNode -> C++ kessho_product_render
AudioUnit render callback -> C++ kessho_product_render
```

Requirements:

1. No heap allocation in render callback.
2. No Swift object allocation in render callback.
3. No locks in render callback.
4. Convert buffers efficiently.
5. Use native sample rate from audio session.
6. Register decoded assets outside render callback.

### Legacy Swift DSP policy

Move independent Swift DSP classes to reference/legacy status:

```text
AudioEngine.swift
SynthVoice.swift
GranularProcessor.swift
ReverbProcessor.swift
LeadSynth.swift
OceanSynth.swift
Swift harmony/RNG files
```

Do not delete immediately. Remove from production path after native C++ render works.

### Acceptance criteria

1. Native target can instantiate `KesshoProductEngine`.
2. Native target can render audio through C++ Product Core.
3. Native target can load/register decoded assets.
4. Native target can load the same product snapshot schema as web.
5. Native target can forward MIDI/manual events to C++.
6. Native render path does not call duplicate Swift DSP.

### Failure conditions

1. Swift keeps a separate production sequencer/DSP engine.
2. Native renders a different product graph from web.
3. Native bridge copies large buffers unnecessarily inside the render callback.

---

## 18. Phase 12 — Tests, parity harnesses, and CPU gates

### Objective

Make correctness and performance enforceable. Do not rely on reports that only check presence of code or representative cases.

### Test categories

#### 18.1 Build tests

```text
npm run build
npm run core:build:wasm
native C++ build
native Swift build where available
```

#### 18.2 Schema tests

```text
schema generation is deterministic
schema hash matches across C++/TS/Swift
snapshot migration tests pass
param IDs/counts match generated assertions
```

#### 18.3 Sequencer event tests

Compare generated event streams:

```text
sampleOffset
bar/beat position
laneId
stepId
sourceId
midi/frequency
velocity
ratchet index
probability result
trig condition result
morph
expression
distance
sends
```

#### 18.4 Audio smoke tests

```text
core-product renders non-silence for basic snapshot
pad source renders
lead source renders
drum source renders
piano source renders with registered asset
soundscape source renders with registered asset
delay/reverb/granular/spectral/dynamics are audible when enabled
```

#### 18.5 Product graph tests

```text
source dry-only routing
source reverb-only routing
source Delay A routing
source Delay B routing
source granular routing
Delay A/B cross-send routing
master chain ordering
stem outputs
meter telemetry
```

#### 18.6 CPU tests

Add CPU budget tests:

```text
p95 render quantum duration
p99 render quantum duration
max render quantum duration
underrun count
WASM heap growth
active voice count
active grain count
asset voice count
JS scheduling overhead
```

#### 18.7 Long-run tests

```text
30-second render
2-minute render
5-minute render
journey morph run
sequencer evolution run
asset texture run
BPM change run
preset transition run
```

#### 18.8 Cross-engine comparison tests

Use old engines as references, not blockers for every early step:

```text
web-ts render
core-bridge render
core-product render
```

Compare:

```text
loudness
RMS
peak
spectral centroid
spectral flux
transient positions
tail length
event timeline
CPU metrics
```

### Scripts to add

```text
scripts/check-kessho-product-schema.mjs
scripts/check-kessho-product-sequencer-events.mjs
scripts/check-kessho-product-graph.mjs
scripts/check-kessho-product-assets.mjs
scripts/check-kessho-product-cpu-budget.mjs
scripts/render-kessho-product-offline.mjs
scripts/compare-kessho-engines-offline.mjs
```

### CI requirements

Add or modify CI so changes to these paths trigger product-core checks:

```text
cpp/KesshoCore/**
src/audio/coreProduct*.ts
src/audio/generated/**
public/worklets/kessho-core-product.worklet.js
scripts/check-kessho-product-*.mjs
scripts/generate-kessho-product-bindings.mjs
KesshoNativeSwift/CoreBridge/**
```

Minimum CI command set:

```text
npm run build
npm run core:build:wasm
npm run core:ci
npm run core:product:schema
npm run core:product:sequencer
npm run core:product:graph
npm run core:product:assets
npm run core:product:cpu
```

### Acceptance criteria

1. Product Core tests are part of CI.
2. Sequencer event tests fail on timing drift.
3. CPU budget tests fail on real-time regressions.
4. Schema tests fail on drift.
5. Product graph tests fail on missing source/routing behavior.
6. Reports distinguish `web-ts`, `core-bridge`, and `core-product`.

### Failure conditions

1. Product Core checks remain optional/manual only.
2. Tests only check source-code token presence.
3. CPU telemetry exists but has no failing thresholds.

---

## 19. Phase 13 — Migrate UI calls to product events

### Objective

Make React UI communicate with `core-product` through product-level events and snapshots instead of old TypeScript musical logic.

### Tasks

1. Audit UI calls into `AudioEngine`.
2. Classify each call:

```text
transport
source param
sequencer param
harmony param
routing param
FX param
preset load
manual note
MIDI
asset load
telemetry request
visual-only
legacy-only
```

3. Add product-event wrappers:

```text
setProductParam(path, value)
setSequencerLane(...)
setSequencerStep(...)
loadProductSnapshot(...)
sendManualNoteOn(...)
sendManualNoteOff(...)
triggerDrumVoice(...)
setRoutingSend(...)
```

4. In `core-product`, route UI calls to C++ events.
5. In `web-ts`, route UI calls to legacy engine behavior.
6. Avoid leaking C++ raw module param IDs into UI components.

### Acceptance criteria

1. UI can control `core-product` through product-level events.
2. UI can still control `web-ts` for comparison.
3. UI does not call TypeScript sequencer/harmony code for `core-product`.
4. Missing `core-product` methods are reported explicitly.

### Failure conditions

1. UI components must know low-level C++ module param IDs.
2. UI calls duplicate product behavior by engine mode.
3. Core mode falls back to no-op instead of product event implementation.

---

## 20. Phase 14 — Default flip and legacy retirement

### Objective

Make `core-product` the default and freeze/delete bridge behavior after acceptance.

### Preconditions

All previous phases must pass.

### Tasks

1. Change default engine mode to `core-product`.
2. Keep `?engine=web-ts` for reference/comparison.
3. Freeze `core-bridge` or remove it from production bundle.
4. Remove `core-product` audio-critical no-op fallbacks.
5. Mark old TypeScript music/DSP files as reference-only or delete from production import graph:

```text
src/audio/engine.ts
src/audio/coreEngineHost.ts
src/audio/harmony.ts
src/audio/rng.ts
src/audio/scales.ts
src/audio/transport.ts
src/audio/drumSequencer.ts
src/audio/drumSeqEvolve.ts
src/audio/synthSeqEvolve.ts
src/audio/granularSeqEvolve.ts
src/audio/granularMacroModel.ts
src/audio/distanceMacro.ts
src/audio/delayBuses.ts
src/audio/lead4opfm.ts
src/audio/earthTexturePlayer.ts
src/audio/pianoSamples.ts
```

Do not delete files that are still required by `web-ts` reference mode. Instead isolate them under a reference/legacy import boundary if needed.

6. Update docs:

```text
README.md
docs/kessho-product-core-architecture.md
docs/kessho-product-core-migration-status.md
docs/kessho-engine-modes.md
```

### Acceptance criteria

1. App launches by default in `core-product`.
2. `web-ts` is selectable for comparison.
3. `core-product` does not import production musical decision logic from TypeScript.
4. `core-product` is fully tested in CI.
5. Legacy path is clearly documented as reference-only.

### Failure conditions

1. Default engine remains TypeScript without explicit reason.
2. `core-product` still depends on `coreEngineHost.ts` product behavior.
3. Legacy bridge remains the hidden production path.

---

## 21. Work breakdown by subsystem

Use this checklist to assign tasks to coding agents.

### 21.1 Product Core API

- [ ] Add `KesshoProductCore.h`.
- [ ] Add product engine create/destroy/reset/render.
- [ ] Add product snapshot load.
- [ ] Add product event queue.
- [ ] Add product telemetry.
- [ ] Add product asset registration.
- [ ] Export through WASM.
- [ ] Export through native C++.

### 21.2 Schema/codegen

- [ ] Create schema files.
- [ ] Generate C++ bindings.
- [ ] Generate TS bindings.
- [ ] Generate Swift bindings.
- [ ] Add schema hash.
- [ ] Add param count assertions.
- [ ] Add generated defaults.

### 21.3 Transport

- [ ] Product transport.
- [ ] Musical clock.
- [ ] Bar/phrase tracking.
- [ ] BPM changes.
- [ ] Sample-offset block events.
- [ ] Telemetry.

### 21.4 Sequencers

- [ ] Synth Euclid.
- [ ] Drum Euclid.
- [ ] Step overrides.
- [ ] Probability.
- [ ] Ratchets.
- [ ] Trig conditions.
- [ ] Pitch/morph/distance/expression lanes.
- [ ] Bar/phrase reset.
- [ ] Event buffer.
- [ ] Event tests.

### 21.5 Harmony/RNG/evolution

- [ ] Deterministic RNG.
- [ ] Scale engine.
- [ ] Harmony engine.
- [ ] Voicing engine.
- [ ] Circle-of-fifths.
- [ ] Evolution engine.
- [ ] Journey morph clock.
- [ ] Seed snapshot/restore.

### 21.6 Sources

- [ ] Pad source.
- [ ] Pad 2 source.
- [ ] Lead 1 source.
- [ ] Lead 2 source.
- [ ] Drum source.
- [ ] Piano source.
- [ ] Soundscape source.
- [ ] Voice allocators.
- [ ] Manual note handling.
- [ ] MIDI handling.

### 21.7 FX/routing/master

- [ ] Routing matrix.
- [ ] Bus mixer.
- [ ] Granular bus.
- [ ] Delay A.
- [ ] Delay B.
- [ ] Reverb.
- [ ] Spectral freeze.
- [ ] Dynamics/character/degrade.
- [ ] Master limiter/gain.
- [ ] Stems/meters.

### 21.8 Asset provider

- [ ] Web asset decoder/registrar.
- [ ] Native asset decoder/registrar.
- [ ] C++ asset registry.
- [ ] Sample buffer model.
- [ ] Sample voice engine.
- [ ] Piano playback.
- [ ] Nature texture playback.
- [ ] Missing asset telemetry.

### 21.9 Web host

- [ ] Add `coreProductEngineHost.ts`.
- [ ] Add product worklet.
- [ ] Add runtime modes.
- [ ] Add capability report.
- [ ] Remove audio-critical no-ops for `core-product`.
- [ ] Preserve `web-ts`.
- [ ] Preserve/freeze `core-bridge`.

### 21.10 Native host

- [ ] ObjC++ bridge.
- [ ] Swift wrapper.
- [ ] AVAudioSourceNode or AudioUnit render callback.
- [ ] Asset provider.
- [ ] MIDI event bridge.
- [ ] Product snapshot loading.
- [ ] Remove Swift DSP from production path.

### 21.11 Tests/CI

- [ ] Product schema tests.
- [ ] Product sequencer event tests.
- [ ] Product graph tests.
- [ ] Product asset tests.
- [ ] Product CPU budget tests.
- [ ] Offline render harness.
- [ ] Engine comparison harness.
- [ ] CI workflow triggers.

---

## 22. Agent instructions for sequencing the work

The coding agent must not start by polishing FX or master chain. Start with the engine boundary and sequencer, because broken sequencing is the clearest symptom of the incomplete architecture.

Recommended execution order:

```text
1. Runtime modes and capability report
2. Schema/codegen
3. C++ Product Core API
4. Product snapshot/event contract
5. Product transport
6. C++ Synth/Drum sequencers
7. Source wrappers for pad/lead/drum
8. Routing matrix and dry graph
9. Harmony/RNG/evolution
10. FX graph
11. Host-decoded/C++-rendered piano and soundscape assets
12. Web core-product adapter shrink
13. Native bridge
14. CI and CPU gates
15. Default flip
16. Legacy freeze/delete
```

Reasoning:

1. Without runtime modes, comparison becomes confusing.
2. Without schema/codegen, TS/C++/Swift drift continues.
3. Without Product Core API, work keeps landing in bridge code.
4. Without sequencers, Core mode cannot behave like Kessho.
5. Without source wrappers/routing, sequencer events have no canonical destination.
6. Without harmony/RNG/evolution, generative behavior cannot be cross-platform deterministic.
7. Without asset policy, piano/nature remain split-brain sources.
8. Without CI/CPU gates, regressions will reappear.

---

## 23. Explicit anti-patterns to avoid

The coding agent must not do these:

1. Add more production sequencer logic to `coreEngineHost.ts`.
2. Add another large TypeScript bridge file that owns musical behavior.
3. Keep C++ as only a bag of DSP modules.
4. Keep Swift as a separate production DSP implementation.
5. Hide missing Core methods behind silent no-ops.
6. Treat source-code token audits as proof of product parity.
7. Add JSON parsing or asset decoding to the render callback.
8. Run `web-ts` and `core-product` simultaneously in live mode.
9. Let UI components know raw C++ module param indices.
10. Implement piano/nature as independent host playback engines for `core-product`.
11. Make `core-bridge` the final default.
12. Delete `web-ts` before `core-product` has accepted comparison coverage.

---

## 24. Suggested package scripts

Add scripts similar to:

```json
{
  "scripts": {
    "core:product:generate": "node scripts/generate-kessho-product-bindings.mjs",
    "core:product:schema": "node scripts/check-kessho-product-schema.mjs",
    "core:product:sequencer": "node scripts/check-kessho-product-sequencer-events.mjs",
    "core:product:graph": "node scripts/check-kessho-product-graph.mjs",
    "core:product:assets": "node scripts/check-kessho-product-assets.mjs",
    "core:product:cpu": "node scripts/check-kessho-product-cpu-budget.mjs",
    "core:product:offline": "node scripts/render-kessho-product-offline.mjs",
    "core:product:compare": "node scripts/compare-kessho-engines-offline.mjs",
    "core:product:ci": "npm run core:product:generate && npm run core:product:schema && npm run core:build:wasm && npm run core:product:sequencer && npm run core:product:graph && npm run core:product:assets && npm run core:product:cpu"
  }
}
```

Final CI must include `core:product:ci` plus the normal web build.

---

## 25. Minimum C++ internal design

### 25.1 Product engine

```cpp
class KesshoProductEngine {
public:
  KesshoProductEngine(double sampleRate, uint32_t maxBlockSize, uint32_t flags);
  ~KesshoProductEngine();

  void reset();
  int loadSnapshot(const KesshoProductSnapshotV2& snapshot);
  int enqueueEvent(const KesshoProductEvent& event);
  void render(float* outL, float* outR, uint32_t frames);
  KesshoProductTelemetry telemetry() const;

private:
  ProductTransport transport_;
  HarmonyEngine harmony_;
  EvolutionEngine evolution_;
  JourneyMorphClock journey_;
  SynthEuclidSequencer synthSequencer_;
  DrumEuclidSequencer drumSequencer_;
  KesshoProductGraph graph_;
  AssetRegistry assets_;
  EventRing controlEvents_;
  SequencerEventBuffer sequencerEvents_;
  AutomationEventBuffer automationEvents_;
  KesshoProductTelemetry telemetry_;
};
```

### 25.2 Product graph

```cpp
class KesshoProductGraph {
public:
  void prepare(double sampleRate, uint32_t maxBlockSize);
  void loadSnapshot(const GraphSnapshot& snapshot);
  void processEvents(const SequencerEventBuffer& events);
  void render(uint32_t frames, float* outL, float* outR);
  void reset();

private:
  PadSource pad1_;
  PadSource pad2_;
  LeadSource lead1_;
  LeadSource lead2_;
  DrumSource drum_;
  PianoSource piano_;
  SoundscapeSource soundscape_;
  RoutingMatrix routing_;
  FxGraph fx_;
  MasterChain master_;
  StemOutputs stems_;
};
```

### 25.3 Sequencer engine

```cpp
class SynthEuclidSequencer {
public:
  void loadSnapshot(const SynthEuclidSnapshot& snapshot);
  void applyEvent(const KesshoProductEvent& event);
  void generate(const ProductTransport& transport, uint32_t frames, SequencerEventBuffer& out);
  void reset();
};
```

---

## 26. Minimum telemetry model

Expose:

```text
engineMode
schemaHash
sampleRate
blockSize
transportRunning
absoluteSampleTime
beatPosition
barIndex
phraseIndex
activeSources
activeVoices
activeGrains
activeAssets
renderCpuPercent
renderCpuPeakPercent
renderP95Ms
renderP99Ms
missedQuantumCount
wasmHeapBytes
sequencerEventCount
controlQueueDepth
assetMissingCount
lastErrorCode
```

Telemetry must be available to web and native hosts.

---

## 27. Minimum error model

Return explicit error codes for:

```text
InvalidEngine
InvalidSnapshot
UnsupportedSnapshotVersion
SchemaHashMismatch
SnapshotTooLarge
EventQueueFull
InvalidEvent
InvalidParam
InvalidSource
InvalidSequencerLane
InvalidAssetId
MissingAsset
AssetFormatUnsupported
RenderBlockTooLarge
AllocationFailure
```

No silent failure for audio-critical product behavior.

---

## 28. Final handoff checklist for coding agent

Before marking the project complete, the coding agent must provide:

1. List of files created.
2. List of files modified.
3. List of legacy files still used by `web-ts` only.
4. Proof that `core-product` no longer imports production musical logic from TypeScript.
5. Proof that native path uses C++ Product Core.
6. Passing command output for:

```text
npm run build
npm run core:build:wasm
npm run core:product:ci
```

7. Product capability report showing all major systems implemented.
8. CPU budget report.
9. Sequencer event test report.
10. Offline render comparison report.
11. Known remaining issues, if any, explicitly marked as non-blocking or blocking.

---

## 29. Final outcome

After this plan is complete, Kessho should have:

```text
One canonical C++ Product Core.
A thin web host.
A thin iOS/macOS host.
A generated shared schema.
C++-owned sequencers.
C++-owned harmony/RNG/evolution.
C++-owned source scheduling.
C++-owned routing/FX/master graph.
Host-decoded but C++-rendered piano and nature textures.
Old web engine preserved only for comparison.
Core bridge frozen or deleted.
CI gates that prevent regression.
```

That is the complete fix for the architecture goal.
