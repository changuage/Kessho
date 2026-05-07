# Kessho C++ Backbone Architecture Work Plan

## Purpose

Build Kessho into a shared C++ audio backbone so one engine change can flow to:

- the web app through WASM + AudioWorklet
- the Capacitor macOS/iOS apps through the same WASM + AudioWorklet lane inside
  the packaged webapp

The product UI should remain the existing Kessho React UI unless a later product
decision says otherwise. The SwiftUI/native iOS/macOS port is paused and should
not receive new parity work during this backbone push.

## Target Architecture

```text
React Kessho UI
  -> normalized engine snapshot
  -> parameter events
  -> MIDI events
  -> preset/morph commands

KesshoCore C++
  -> transport
  -> event queues
  -> MIDI routing model
  -> sequencing/evolve
  -> modulation and smoothing
  -> mixer/routing contract
  -> DSP engines

Hosts
  Web:      AudioWorklet + WASM KesshoCore
  macOS:    Capacitor WKWebView UI + AudioWorklet/WASM KesshoCore
  iOS:      Capacitor WKWebView UI + AudioWorklet/WASM KesshoCore
  Native:   paused SwiftUI reference code, not an active product lane
```

## Current Repo Reality

Existing C++/WASM DSP islands:

- `wasm/pad`
- `wasm/lead-fm`
- `wasm/drum`
- `wasm/granular-fx`
- `wasm/reverb`
- `wasm/spectral-freeze`
- `wasm/soundscapes`
- `wasm/dynamics-character`
- `wasm/dynamics-degrade`

Current TypeScript/Web Audio conductor pieces:

- `src/audio/engine.ts`
- `src/audio/transport.ts`
- `src/audio/harmony.ts`
- `src/audio/drumSequencer.ts`
- `src/audio/*SeqEvolve.ts`
- `src/audio/delayBuses.ts`
- `src/audio/earthTexturePlayer.ts`
- `src/audio/pianoSamples.ts`
- `src/native/capacitorMidiRouting.ts`
- `src/native/capacitorMacShell.ts`

Current native shell pieces:

- `CapacitorMac/`
- `ios/App/`
- `plugins/kessho-capacitor-midi-routing/`
- `plugins/kessho-capacitor-audio-session/`

Paused native reference pieces:

- `KesshoNativeSwift/`

## CPU Optimization Priority Map

These estimates are planning ranges, not promises. Each phase must be validated with profiling because the real gain depends on preset density, sample rate, buffer size, enabled effects, UI activity, MIDI traffic, and device thermal state.

### Highest Return Moves

| Priority | System | Why Move It To C++ | Expected Web CPU Gain | Expected Capacitor CPU Gain | Notes |
| --- | --- | --- | ---: | ---: | --- |
| 1 | Mixer/routing/sends graph | Removes large Web Audio node graph overhead and gives Core WASM one render graph. | 5-15% | 8-18% | Best first large migration after the core skeleton because every source/effect touches it. |
| 2 | Delay A / Delay B | Current shared delays use Web Audio delay/filter/gain/panner/compressor nodes. | 5-12% when delay-heavy | 6-15% when delay-heavy | Also improves parity because Capacitor and Webapp share the same Core WASM behavior. |
| 3 | Transport/event queue/parameter smoothing | Removes JS scheduling dependence and makes automation sample-accurate. | 2-8% | 5-12% plus lower jitter | Bigger musical/timing win than raw CPU win. Do this before serious MIDI work. |
| 4 | MIDI event handling direct to C++ | Avoids UI/JS bridge as the musical timing path. | 1-4% | 2-8% plus much lower jitter | Critical for MPE, clock, dense CC, pressure, pitch bend, and live control feel. |
| 5 | Sidechain/master dynamics glue | Some DSP is already C++/WASM, but sidechain routing/control/fallback pieces remain Web Audio/TS. | 3-10% when dynamics-heavy | 4-12% when dynamics-heavy | Needs careful parity tests because envelope timing changes are audible. |
| 6 | Piano sampler | Current sample scheduling/playback/cache are TypeScript/Web Audio. | 3-8% when piano-active | 5-12% when piano-active | Core sampler can manage memory and resampling more predictably. |
| 7 | Earth texture sample playback | Birds/frogs/waves sample slicing and scheduling are still Web Audio/TS. | 2-6% when earth-heavy | 4-10% when earth-heavy | Soundscapes generated water/insects are already C++/WASM; this is about sampled textures. |
| 8 | Recording/stem taps | Current recording uses worklet taps, MediaRecorder, and export worker glue. | 0-5% during recording | 3-10% during recording | Mainly improves reliability and export behavior, not normal playback CPU. |

### Expected Total Impact

If C++ backbone migration reaches mixer, delays, timing, and MIDI:

- web/WASM complex-session CPU reduction target: 10-25%
- macOS Capacitor Core WASM CPU reduction target: 10-25%
- iOS Capacitor Core WASM battery improvement target: measure on device
- MIDI jitter improvement target: more important than CPU; validate with timestamp tests

If only the existing DSP islands are wrapped without moving mixer/timing/routing, expected gains will be smaller because Web Audio and TypeScript remain the conductor.

### Migration Decision Rule

Move a subsystem to shared C++ when at least one is true:

- it runs every render block
- it owns many Web Audio nodes
- it schedules musical events
- it handles MIDI or automation timing
- it is needed for Webapp/Capacitor Core WASM parity
- it causes measurable CPU, jitter, or battery cost in the baseline report

Delay a subsystem when:

- it is mostly UI-only
- it is rarely active
- it depends on file/browser APIs that need a separate native resource design
- parity cannot be tested yet
- the current bottleneck is elsewhere

## Workstream Operating Rules

Every workstream owner must:

- keep changes scoped to its assigned write set
- avoid reverting unrelated dirty files
- run the verification commands listed for its phase
- update this plan only when the plan itself changes
- leave a final handoff note with changed files, commands run, checkpoint status, risks, and next recommended step

Workstream owners must not:

- rewrite the React UI as SwiftUI
- fork DSP behavior between web and native
- add render-thread allocation, locking, logging, file IO, or JSON parsing
- move to a later phase if the checkpoint for the current phase fails
- delete the current web engine path before the replacement path has parity gates

## Suggested Workstreams

Use separate workstreams only when their write scopes are disjoint.

- **Architecture Workstream:** owns contracts, directory layout, phase gates, and cross-host API decisions.
- **Core C++ Workstream:** owns `cpp/KesshoCore/**` and shared C++ tests.
- **WASM Adapter Workstream:** owns WASM build scripts and web AudioWorklet host adapters.
- **Capacitor Services Workstream:** owns shell packaging, CoreMIDI, audio-session metadata, and platform bridge calls.
- **Parity QA Workstream:** owns golden renders, diff tooling, CPU/battery profiling scripts, and checkpoint reports.
- **Migration Workstream:** moves one audio subsystem at a time into shared C++.
- **Docs/Handoff Workstream:** keeps docs, runbooks, and workstream handoff templates current.

## How To Dispatch Workstreams

Give each workstream owner:

- the phase number
- the checkpoint target
- the write scope
- the commands it must run
- whether it is allowed to edit build scripts
- whether it is allowed to touch current app behavior

Do not give two workstreams the same write scope at the same time. If two workstreams need the same file, serialize the work.

### Dispatch Card Template

```text
Assigned phase N: <phase name>.
Checkpoint target: C<N>.
Primary goal: <one sentence>.
Write scope: <paths>.
Do not edit outside this scope unless you first report why it is necessary.
Required verification: <commands>.
Handoff required: changed files, commands run, checkpoint status, risks, next task.
```

### Initial Task Queue

Use this order until C4 passes:

1. **Architecture Workstream, C0:** produce the baseline report and golden preset list.
2. **Core C++ Workstream, C1:** create `cpp/KesshoCore` with a C ABI and native silence render test.
3. **WASM Adapter Workstream, C3:** build the same C++ into `kessho_core.wasm`.
4. **Web Adapter Workstream, C4:** create the minimal `kessho-core.worklet.js` smoke path.
5. **Parity QA Workstream, C4:** compare the C++ smoke render against the current web path.

Once C4 passes, switch to:

1. **Core C++ Workstream, C5:** implement transport, event queues, and smoothing.
2. **MIDI Workstream, C5/C9:** feed CoreMIDI and web MIDI events into the shared queue.
3. **Migration Workstream, C6:** wrap one existing C++ DSP island at a time.
4. **WASM Adapter Workstream, C7:** expose the wrapped module through the web core path.
5. **Capacitor Services Workstream, C8:** keep the packaged shells aligned with web/Core WASM and platform services.
6. **Parity QA Workstream, C11:** run render and profiling comparisons for each migrated subsystem.

## Checkpoint Index

- **C0 Baseline Captured:** current web and Capacitor builds pass, golden presets selected, CPU/audio captures recorded.
- **C1 Core Skeleton:** `KesshoCore` C ABI compiles for local tests and WASM without changing app behavior.
- **C2 State Contract:** React can produce a normalized engine snapshot and tests prove stable serialization.
- **C3 WASM Build:** same C++ core builds as WASM for webapp and Capacitor.
- **C4 Render Smoke:** a minimal C++ render lane produces audio in the web/Core WASM host.
- **C5 Timing Backbone:** transport, event queue, smoothing, and MIDI event timestamps live in C++.
- **C6 Existing DSP Wrapped:** existing C++ DSP islands are callable through the shared core facade.
- **C7 Web Core Path:** web can run via `?engine=core-wasm` beside the old path.
- **C8 Capacitor Services Path:** macOS/iOS Capacitor shells package the web/Core WASM path and expose platform services.
- **C9 MIDI Capacitor Path:** CoreMIDI can feed timestamped events into the shared event model with measurable lower jitter than UI-only handling.
- **C10 Feature Migration:** delay, mixer, piano, earth textures, routing, and recording have migration plans or completed ports.
- **C11 Parity:** selected presets render within accepted diff thresholds across legacy web and Core WASM.
- **C12 Completion:** old duplicated paths are either removed, clearly marked fallback, or documented as intentionally host-specific.

## Phase 0: Baseline And Audit

### Goal

Capture the current app behavior before architecture changes.

### Write Scope

- `docs/reports/**`
- optional test fixtures under `test-fixtures/**`
- no engine source changes

### Instructions

1. Run current checks:

   ```sh
   npm run type-check
   npm run build
   npm run cap:mac:build
   ```

2. Pick 5 to 10 representative presets:

   - low CPU ambient pad
   - dense pad + reverb
   - granular-heavy
   - drums-heavy
   - earth/water-heavy
   - delay-heavy
   - dynamics-heavy
   - journey/morph preset

3. Create a baseline report with:

   - preset names
   - enabled engines/effects
   - browser CPU notes
   - macOS Capacitor CPU notes
   - known glitches
   - current MIDI behavior
   - current background/screen-off behavior if tested

4. Record current architectural facts:

   - which worklets load which WASM modules
   - which audio paths are pure Web Audio
   - which native plugins exist
   - which state objects drive engine behavior

### Checkpoint

C0 passes when the report exists and all current build commands either pass or have documented pre-existing failures.

## Phase 1: Create KesshoCore Skeleton

### Goal

Create a shared C++ core package with a stable C ABI. Do not change app audio behavior yet.

### Write Scope

- `cpp/KesshoCore/**`
- `scripts/build-kessho-core*.mjs`
- package scripts needed to run the build
- docs for this phase

### Proposed Layout

```text
cpp/KesshoCore/
  include/KesshoCore/KesshoCore.h
  include/KesshoCore/KesshoTypes.h
  src/KesshoEngine.cpp
  src/KesshoTransport.cpp
  src/KesshoMidi.cpp
  src/KesshoParams.cpp
  src/KesshoRender.cpp
  tests/
  adapters/
    wasm/
```

### Required C ABI

Start small:

```cpp
typedef struct KesshoEngine KesshoEngine;

KesshoEngine* kessho_create(double sample_rate, int max_block_size);
void kessho_destroy(KesshoEngine* engine);
void kessho_reset(KesshoEngine* engine);
void kessho_start(KesshoEngine* engine);
void kessho_stop(KesshoEngine* engine);
int kessho_is_running(KesshoEngine* engine);
void kessho_render(KesshoEngine* engine, float* out_l, float* out_r, int frames);
```

### Implementation Rules

- no heap allocation inside `kessho_render`
- no locks inside `kessho_render`
- no JSON parsing inside `kessho_render`
- all render buffers must be caller-owned or preallocated
- keep ABI C-compatible for WASM and future host experiments

### Checkpoint

C1 passes when:

- local C++ test binary can create, render silence, and destroy
- WASM build can export the same functions
- no app behavior changes

## Phase 2: Define Shared State And Event Contract

### Goal

Create a normalized engine snapshot contract so React, WASM, and native all speak the same language.

### Write Scope

- `src/audio/coreSnapshot.ts`
- `cpp/KesshoCore/include/KesshoCore/KesshoTypes.h`
- `cpp/KesshoCore/src/KesshoParams.cpp`
- tests for serialization/validation

### Instructions

1. Define TypeScript snapshot types:

   ```text
   KesshoEngineSnapshot
   KesshoTransportSnapshot
   KesshoRoutingSnapshot
   KesshoVoiceSnapshot
   KesshoFxSnapshot
   ```

2. Build a converter:

   ```text
   SliderState + dual ranges + preset metadata -> KesshoEngineSnapshot
   ```

3. Add snapshot versioning:

   ```text
   version: 1
   engineSchema: "kessho-core-v1"
   ```

4. In C++, parse/apply the snapshot outside the render callback.

5. Create tests that prove:

   - stable key ordering
   - no `NaN`
   - no missing required fields
   - defaults are deterministic
   - same preset produces same snapshot

### Checkpoint

C2 passes when snapshots are deterministic and can be applied to `KesshoCore` without render-thread parsing.

## Phase 3: Build Targets

### Goal

Compile the exact same C++ source for the webapp and Capacitor through WASM.

### Write Scope

- `scripts/build-kessho-core-wasm.mjs`
- `cpp/KesshoCore/adapters/wasm/**`
- `package.json` scripts

### Instructions

1. Add scripts:

   ```json
   {
     "core:build:wasm": "node scripts/build-kessho-core-wasm.mjs",
     "core:test": "node scripts/test-kessho-core.mjs"
   }
   ```

2. WASM output should land in:

   ```text
   public/worklets/kessho_core.wasm
   public/worklets/kessho-core.worklet.js
   ```

3. Keep any native Apple build target out of this phase unless the native port
   resumes as an explicit product decision.

### Checkpoint

C3 passes when one command builds the Core WASM artifacts consumed by both Webapp and Capacitor.

## Phase 4: Minimal Render Lane

### Goal

Render a simple deterministic signal through `KesshoCore` in the Core WASM host.

### Write Scope

- `cpp/KesshoCore/src/KesshoRender.cpp`
- `public/worklets/kessho-core.worklet.js`
- minimal host adapter files
- tests

### Instructions

1. Add a minimal oscillator/noise render mode inside C++ only for smoke testing.
2. Web AudioWorklet loads `kessho_core.wasm` and calls `kessho_render`.
3. Add runtime switches:

   ```text
   ?engine=web
   ?engine=core-wasm
   ```

4. Do not route the full app through this path yet.

### Checkpoint

C4 passes when web and native can both produce the same test tone/noise from C++.

## Phase 5: Move Timing Backbone

### Goal

Move the conductor pieces into C++ before moving the whole sound engine.

### Write Scope

- `cpp/KesshoCore/src/KesshoTransport.cpp`
- `cpp/KesshoCore/src/KesshoEvents.cpp`
- `cpp/KesshoCore/src/KesshoMidi.cpp`
- TS adapter code that feeds events
- tests

### Required C++ Systems

- sample clock
- BPM/phrase/bar/beat tracking
- start/stop/continue
- sample-offset event queue
- parameter event queue
- MIDI event queue
- smoothing ramps
- deterministic RNG seed model

### Event Types

```cpp
enum KesshoEventType {
  KESSHO_EVENT_PARAM,
  KESSHO_EVENT_MIDI,
  KESSHO_EVENT_TRANSPORT,
  KESSHO_EVENT_PRESET,
};
```

MIDI event must support:

- source id
- timestamp/sample offset
- status
- channel
- data bytes
- normalized value
- raw bytes for future SysEx/MPE handling

### Checkpoint

C5 passes when:

- transport advances in C++ by sample count
- events are applied at sample offsets
- JS/CoreMIDI can push MIDI events without direct render-thread mutation
- tests prove deterministic event ordering

## Phase 6: Wrap Existing DSP Islands

### Goal

Bring the existing C++ DSP modules behind the `KesshoCore` facade without changing their sound.

### Write Scope

- `cpp/KesshoCore/src/modules/**`
- existing `wasm/*` only when necessary
- shared headers
- module-level tests

### Instructions

1. Wrap each existing C++ engine in a module interface:

   ```cpp
   class IKesshoModule {
   public:
     virtual void prepare(double sampleRate, int maxBlockSize) = 0;
     virtual void reset() = 0;
     virtual void process(float** inputs, float** outputs, int frames) = 0;
   };
   ```

2. Start with modules already stable in C++:

   - reverb
   - granular
   - pad
   - lead FM
   - drum
   - dynamics character/degrade
   - soundscapes
   - spectral freeze

3. Keep current WASM worklets alive until the new unified worklet passes parity.

### Checkpoint

C6 passes when `KesshoCore` can instantiate wrapped modules and render at least one existing DSP module through the shared facade.

## Phase 7: Web Core Path

### Goal

Let the web app run through `KesshoCore` WASM behind a switch.

### Write Scope

- `public/worklets/kessho-core.worklet.js`
- `src/audio/coreEngineHost.ts`
- `src/audio/engine.ts` integration seam
- tests

### Instructions

1. Add a `CoreEngineHost` beside the current `AudioEngine`.
2. Feed normalized snapshots and events into the worklet.
3. Start with a narrow render path, not all features.
4. Keep fallback:

   ```text
   ?engine=web
   ```

5. Add telemetry:

   - render CPU
   - missed block percentage
   - active modules
   - event queue depth
   - MIDI queue depth

### Checkpoint

C7 passes when a selected preset can play through `?engine=core-wasm` and the old web path still works.

## Phase 8: Future Native iOS Core Host Path

### Goal

Keep short-term Capacitor parity on the packaged webapp and Core WASM lane, but
reserve the iOS background-audio product path for a native audio host that calls
the same Kessho Core C++ backbone. Do not revive the separate Swift audio engine
or expand `KesshoNativeSwift` for this.

### Write Scope

- `CapacitorMac/**`
- `plugins/**` native bridge files
- no `KesshoNativeSwift/**` parity expansion
- native iOS C++ core build script only when this phase starts
- no React UI rewrite

### Instructions

1. Keep current Capacitor plugins focused on platform services:

   ```text
   CoreMIDI discovery/input -> web routing state
   AVAudioSession/Now Playing -> platform metadata and controls
   Web/Core WASM -> sound generation
   ```

2. Add Capacitor plugin methods only for platform state:

   ```text
   getAudioSessionStatus()
   setAudioSessionPlaybackState()
   setNowPlaying()
   startMidi()
   refreshMidiInputs()
   connectMidiInput()
   ```

3. Keep native activity optimizations:

4. For the future iOS background-audio path, add a thin native host that:

   ```text
   AVAudioEngine render callback -> Kessho Core C++ native library
   React bridge -> state snapshots, transport, MIDI events, preset changes
   Web/Core WASM -> remains the browser/foreground parity reference
   ```

   - App Nap suppression while playing
   - idle sleep prevention while playing
   - route change handling
   - interruption handling

4. Leave the paused native iOS app out of active parity work.

### Checkpoint

C8 passes when macOS/iOS Capacitor can package the same web/Core WASM lane and platform services without depending on `KesshoNativeSwift`.

## Phase 9: Native MIDI Path

### Goal

Make MIDI a musical timing layer, not just a UI-control bridge.

### Write Scope

- `cpp/KesshoCore/src/KesshoMidi.cpp`
- `src/native/capacitorMidiRouting.ts`
- native MIDI plugins
- routing UI adapter only as needed

### Instructions

1. Keep current UI mapping for compatibility.
2. Add Capacitor timestamp path:

   ```text
   CoreMIDI -> Capacitor bridge -> shared event queue -> render sample offset
   ```

3. Support:

   - note on/off
   - CC
   - pitch bend
   - channel pressure
   - poly pressure
   - clock/start/stop/continue
   - source id

4. Add jitter test:

   - send repeated MIDI clock or CC
   - measure arrival jitter through JS bridge path
   - measure arrival jitter through the Capacitor timestamp path

### Checkpoint

C9 passes when Capacitor MIDI events reach the shared event model with lower jitter than UI-only handling.

## Phase 10: Migrate Remaining Audio Systems

### Goal

Move the rest of the sound-relevant behavior into shared C++ in risk order.

### Recommended Order

1. mixer/routing/sends
2. Delay A / Delay B
3. granular multitap delay
4. master limiter/saturation
5. sidechain logic
6. piano sampler
7. earth texture sample playback
8. recording/stem taps
9. preset morph orchestration
10. journey playback timing

### Per-System Migration Template

For each subsystem:

1. Identify current files.
2. Write a one-page behavior spec.
3. Add fixture input/output tests.
4. Port the minimal version to C++.
5. Add web WASM adapter.
6. Add native adapter if host-specific resources are needed.
7. Compare output against current web behavior.
8. Enable behind a switch.
9. Roll into default only after checkpoint approval.

### Checkpoint

C10 passes when every current non-C++ audio system has either:

- been migrated
- has an accepted migration plan
- is documented as intentionally host-specific

## Phase 11: Parity And Profiling

### Goal

Prove this architecture improves native performance without accidental sonic drift.

### Write Scope

- `scripts/render-parity*.mjs`
- `scripts/profile-core*.mjs`
- `docs/reports/**`
- tests

### Required Tests

For each golden preset:

```text
same sample rate
same seed
same preset snapshot
same automation events
same MIDI events
render 30 seconds
compare RMS, peak, LUFS-like level, spectral centroid, null residual
```

### Required Profiling

Measure:

- web old path CPU
- web core WASM CPU
- macOS Capacitor Core WASM CPU
- iOS Capacitor Core WASM CPU if available
- render misses
- MIDI jitter
- memory
- screen-off battery drain where possible

### Acceptance Targets

Initial targets:

- no obvious sonic regressions
- no recurring audio dropouts
- Capacitor MIDI path lower jitter than UI-only handling
- iOS screen-off behavior documented
- CPU improvement measured or explained if neutral

### Checkpoint

C11 passes when parity and profiling reports are written and reviewed.

## Phase 12: Completion And Cleanup

### Goal

Make the shared C++ backbone the normal engine path where it is ready, while keeping intentional fallbacks clear.

### Instructions

1. Decide default paths:

   ```text
   Web default: core WASM or legacy web path
   macOS Capacitor default: core WASM or legacy web path
   iOS Capacitor default: core WASM or legacy web path
   ```

2. Remove obsolete duplicated logic only after parity approval.
3. Mark remaining fallback code clearly.
4. Update docs:

   - architecture overview
   - build instructions
   - MIDI routing
   - Capacitor profiling
   - release checklist

5. Create release checklist:

   - web build
   - macOS app build
   - iOS app sync/build
   - MIDI smoke test
   - golden preset smoke test
   - recording smoke test
   - route/interruption smoke test

### Checkpoint

C12 passes when the shared core is documented, buildable, testable, and selected as the default for at least one host.

## First Implementation Slice

Do this before any large migration:

1. Create `cpp/KesshoCore` skeleton.
2. Add C ABI.
3. Add WASM build scripts.
4. Add silence/test-tone render.
5. Add AudioWorklet host for `kessho_core.wasm`.
6. Add runtime switches.
7. Add one parity smoke test.

This slice proves the architecture without risking the existing app.

## Handoff Template

Every handoff should include:

```text
Phase:
Checkpoint:
Changed files:
Commands run:
Result:
Risks:
Next recommended task:
```

If blocked:

```text
Blocker:
Exact error:
What was tried:
Smallest next step:
```

## Completion Definition

The C++ backbone project is complete when:

- a single shared C++ core builds for WASM
- React/Kessho UI can drive that core through a stable snapshot/event contract
- macOS/iOS Capacitor can package the same web/Core WASM engine path
- CoreMIDI can feed timestamped events into the shared event model
- golden presets have parity reports
- old paths are either removed or documented as fallbacks
- engine changes are made once in C++ and picked up by Webapp and Capacitor builds
