# KesshoNativeSwift Parity Sweep Historical Handoff

## Mission

This was a handoff prompt for the native Swift port of Kessho. Work on that port
is currently paused; preserve this as historical parity context unless the
product direction changes again.

Your goal is to push the native iOS implementation as close as possible to the **current web app audio behavior** in one focused sweep.

Prioritize:

1. Audio-path parity
2. State/preset compatibility
3. Native correctness and real-time safety
4. UI only when needed to support audio/state parity

Do not spend this sweep on cosmetic cleanup.

## Very Important Constraints

- The git worktree is dirty.
- Do **not** revert unrelated user changes.
- Ignore these unrelated dirty files unless your task absolutely requires them:
  - `src/App.tsx`
  - `src/presets/factoryPresets.ts`
  - `src/presets/index.ts`
  - `docs/PRESET_V2_MIGRATION_RUNBOOK.md`
  - `src/presets/presetV2Migration.ts`
- Use `apply_patch` for file edits.
- Prefer changing files under:
  - `KesshoNativeSwift/Kessho/Audio/`
  - `KesshoNativeSwift/Kessho/State/`
  - `plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/`
- Preserve the current parity-bridge work already in progress.

## Current State Of The Port

### Already improved in this branch

These changes are already present and should be preserved:

- Native state decoding now normalizes more web-style payloads before decoding:
  - `KesshoNativeSwift/Kessho/State/SliderState.swift`
- Native preset loading/import now goes through the same normalization path:
  - `KesshoNativeSwift/Kessho/State/PresetManager.swift`
- Capacitor/native background-audio payload decoding now uses the same normalization path:
  - `plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift`
- Native mixer debug taps are now `#if DEBUG` only:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift`
- Granular synth input no longer reloads a 4-second shadow buffer every ~100 ms.
  It now stages incoming synth blocks directly into the granular ring buffer:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift`
  - `KesshoNativeSwift/Kessho/Audio/GranularProcessor.swift`
- Reverb is now much closer to the web graph:
  - the custom FDN in `KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift` is the default live path
  - Apple reverb is still present only as the explicit `lite` fallback
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift` now uses dedicated per-source reverb send mixers instead of dead send math
  - the reverb return is now a real mixer node, so reverb stems can be tapped post-return
- Dry source levels for synth / granular / lead / drums now live on dedicated post-source mixers so the aux sends are no longer tied to the dry fader shape:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift`

### Current biggest parity blockers

#### 1. The new reverb path needs listening validation, not a second architectural rewrite

- The custom FDN path is now live by default through a source-node return fed from the shared reverb send bus.
- Apple reverb is still wired for `lite` mode only.
- The next pass should verify this path audibly and structurally, not replace it again unless a concrete bug is found.

Focus on:

- confirming the custom return behaves correctly across `balanced`, `ultra`, and `lite`
- checking that `reverbLevel` behaves like a return level rather than an insert wet/dry blend
- verifying reverb tails reset or persist intentionally when `reverbEnabled` changes

#### 2. The send graph is now real; keep guarding the water/ocean path

- Synth / granular / lead / drum sends now have explicit send mixers.
- Ocean and shared nature/water now have dedicated reverb-send mixers feeding the shared custom reverb send bus.
- There are still web-only routing nuances that are broader than this sweep.
- `npm run test:native-swift-state-parity` now guards the critical reverb/water fields and reports broader state drift.

#### 3. State parity is better, but still incomplete

- Web state is much larger and more current than the iOS prototype state.
- The current bridge handles a useful subset, but not the entire current web surface.
- Focus on the subset required to make the native audio engine behave more like the web app now.

#### 4. Granular and reverb real-time safety are improved, but not fully solved

- The worst full-buffer reload was removed.
- `GranularProcessor` still uses `NSLock` around render-sensitive paths.
- `ReverbProcessor` now also uses a lock-backed live input bridge for the custom return path.
- Do not undo the new direct-write path.
- If you can improve lock behavior safely, do it without destabilizing the now-working live routing.

#### 5. Explicit remaining gaps to carry forward

- ocean/water dedicated reverb-send parity is now structurally wired and guarded
- first-pass shimmer/warp/cross-feed/transient smoothing fields are wired; remaining advanced web-only reverb fields still need deliberate native meanings
- the new reverb and granular live bridges are still lock-backed, not lock-free
- web-only engines like spectral freeze and fuller soundscapes are still outside this sweep

### How to implement these remaining gaps

#### A. Ocean / water reverb-send parity

##### Implementation direction

Status: structurally wired. `AudioEngine` has dedicated `oceanReverbSendMixer` and `natureReverbSendMixer` paths into `reverbSend`, with `oceanReverbSend`, `natureReverbSend`, and `waterReverbSend` bridged through `SliderState`/`AppState`.

Next work should be validation and refinement:

1. Confirm the dry ocean/water balance does not change when only send fields move.
2. Capture a physical-device listening pass for sample waves, wave synth, water drops, bubbles, surf, birds/frogs, and insects.
3. If the web path needs separate sample-vs-wave sends, add that deliberately and document the audible reason.
4. Keep the send pre-fader unless a measured parity issue proves otherwise.

##### Watch out for

- Do not reuse `oceanFilterCutoff` as a fake reverb-send parameter just because it is already surfaced in iOS UI
- Do not accidentally double-scale the ocean signal by applying both source level and return level where only one should apply
- Keep ocean sample playback level, ocean synth level, and reverb send level as separate concepts
- If the web path uses multiple nature layers, do not collapse them blindly without documenting the audible tradeoff

##### Preferred outcome

- native ocean/water audio has its own real reverb-send control path
- the bridge maps the relevant web water/nature send fields into that path
- the audible wetness changes without altering the dry ocean balance

#### B. Advanced web reverb fields: shimmer / warp / transient smoothing

##### Implementation direction

Status: first-pass native modifiers are wired for `reverbShimmer`, `reverbShimmerPitch`, `reverbShimmerFeedback`, `reverbWarp`, `reverbCrossFeed`, and `reverbTransientSmooth`.

Treat further reverb fields as advanced modifiers, not as excuses to swap the whole reverb engine:

1. Add decode/bridge support only after deciding the native meaning of each field
2. Implement them as optional modifiers on top of the current custom FDN path
3. Keep them behind the current parity-oriented reverb path, not the Apple fallback

Suggested native interpretations if you need a first pass:

- `reverbShimmer`
  - add a restrained high-octave or harmonic-lift component in the reverb return path
  - prefer a subtle feedback-path lift or pitch-shift-style coloration over a bright EQ hack
- `reverbWarp`
  - treat as a macro that bends delay scaling, modulation depth, diffusion, or tank irregularity
  - keep it continuous and smooth, not preset-jumping
- `reverbTransientSmooth`
  - treat as pre-tank transient softening
  - implement as lightweight pre-reverb smoothing, compression, or envelope softening before the signal enters the tank

##### Watch out for

- Do not map these fields to random Apple presets
- Do not fake shimmer with a static treble boost if the audible result is not close
- Do not introduce zipper noise when these values change
- Keep CPU under control: these are modifiers, not an invitation to build a second full effects chain
- If you cannot implement them faithfully in this sweep, decode and document them explicitly instead of pretending they are supported

#### C. Lock-free reverb and granular live bridges

##### Implementation direction

The next architectural win should be replacing lock-backed audio handoff with SPSC lock-free buffers:

1. Keep one writer and one reader per bridge
2. Preallocate fixed-size `Float` buffers
3. Use atomic read/write indices
4. Decide explicit overflow behavior:
   - drop oldest
   - drop newest
   - or overwrite oldest
5. Keep parameter/state mutation separate from audio-buffer transport where possible

##### Watch out for

- No `NSLock`, `DispatchQueue.sync`, allocations, logging, or array resizing in render callbacks
- Keep the buffer ownership model simple; do not create multiple writers for one ring buffer unless you redesign the whole path
- Make sure the bridge still preserves ordering between captured input and render consumption
- Be explicit about whether the bridge is sample-accurate or block-accurate
- If you use atomics, audit memory ordering instead of guessing

##### Preferred outcome

- granular input bridge is lock-free
- reverb input bridge is lock-free
- the sonic behavior stays the same as the current direct-write and live-return architecture

#### D. Spectral freeze and fuller soundscapes

##### Implementation direction

Do not start by inventing brand new Swift DSP for these if the web engine already has the real sound:

1. Audit the existing web/WASM/C++ implementation first
2. Prefer reusing the shared DSP core or porting the same algorithm instead of designing a lookalike Swift version
3. Add only the minimum native state and routing needed to host the feature
4. Keep seeding, modulation, and routing behavior aligned with the web app before polishing UI

For spectral freeze specifically:

1. identify the real analysis / hold / resynthesis architecture used by web
2. preserve routing and freeze gating semantics
3. keep CPU budgeting in mind before enabling it by default on iOS

For fuller soundscapes:

1. identify which web layers are essential to the perceived result
2. port the highest-impact layers first
3. preserve their send/delay/reverb behavior before adding every control

##### Watch out for

- Do not let this become a parallel "similar but different" native engine family
- Soundscapes can hide a lot of complexity in routing; match the routing, not just the oscillator list
- Spectral freeze can become the new top CPU consumer if implemented casually
- Avoid feature sprawl before the core synth / granular / reverb parity path is truly stable

## Files You Must Understand Before Editing

### Web parity reference

- `src/ui/state.ts`
- `src/audio/engine.ts`
- `public/worklets/granular-fx-wasm.worklet.js`
- `public/worklets/reverb-wasm.worklet.js`
- `wasm/granular-fx/kessho_granular.cpp`

### Native iOS implementation

- `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift`
- `KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift`
- `KesshoNativeSwift/Kessho/Audio/GranularProcessor.swift`
- `KesshoNativeSwift/Kessho/State/SliderState.swift`
- `KesshoNativeSwift/Kessho/State/PresetManager.swift`
- `plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift`

## Exact Problems To Fix In This Sweep

## 1. Validate and refine the live custom reverb path

### Why

The architectural swap has already been made.
The highest-value next step is to confirm it behaves like the web graph and tighten any audible mismatches.

### What to do

- Inspect the new routing in:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift`
  - `KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift`
- Confirm the default path stays on the custom FDN reverb.
- Keep Apple reverb as `lite` fallback only unless you find a concrete correctness issue.
- If you find an actual bug in the ring-buffer-fed return path, fix it directly instead of replacing the entire design.

### Acceptable implementation directions

The current implementation already uses the preferred "good enough for this sweep" direction:

1. `AVAudioSourceNode`-driven wet return
2. internal input ring buffer fed from the reverb send bus
3. Apple reverb retained only as explicit `lite` fallback

Do not replace this unless it is provably broken.

### Must preserve

- `reverbEnabled`
- `reverbType`
- `reverbQuality`
- `reverbDecay`
- `reverbSize`
- `reverbDiffusion`
- `reverbModulation`
- `predelay`
- `width`
- `damping`

### If possible in this sweep

Also preserve or stub/document handling for newer web reverb fields that matter to sound:

- `reverbShimmer`
- `reverbWarp`
- `reverbTransientSmooth`
- pre-comp / pre-tank dynamics style behavior

If you cannot fully implement those, do not fake full parity.
Instead:

- keep the core reverb engine correct first
- document unsupported advanced fields in the final summary

## 2. Verify and extend per-source reverb send control only where it materially helps

### Why

The dead-send problem has already been fixed for the main native sources.
What remains is validation and selective extension.

### What to do

- Confirm that the current dedicated send mixers behave correctly for:
  - synth / pad
  - granular
  - lead
  - drums
- If you can add ocean / water reverb parity safely, do it.
- Preserve the separation between:
  - dry source level
  - wet send level
  - reverb return level

### Result

The native graph should continue to clearly distinguish dry level, send level, and return level.

## 3. Extend the parity bridge only where it helps live audio behavior

The bridge work already started in `SliderState.decodeStateRecord(...)`.

Keep extending it, but only for fields that materially improve parity in this sweep.

### Important mappings to preserve or improve

- `lead1*` / `lead2*` collapse into the current single native lead engine in a predictable way
- `delayA*` maps into the native lead delay path where appropriate
- `pad2*` can drive the native synth when it is the dominant pad source
- `water*` maps into the current native ocean/wave path where possible
- `synthEuclid*Source` values like `lead1`, `lead2`, `piano` are normalized safely for iOS routing

### Do not do

- Do not explode the native state model into a full 1:1 web mirror if that blocks the audio work
- Do not add dozens of fields that are unused by the native engine

## 4. Preserve and refine the new granular direct-write path

### Current requirement

Do not reintroduce:

- periodic 4-second buffer copies
- `loadSample(...)` snapshots from the synth tap

### If time allows

Improve real-time safety:

- reduce how long `NSLock` is held in `GranularProcessor`
- separate control updates from audio-buffer staging if you can do it safely
- do not introduce allocations in render-sensitive code

### Important note

The current direct-write path stages incoming audio into future ring-buffer positions while the render callback advances the write head.
If you change this behavior, keep the relationship between live input staging and render-time head movement coherent.

## 5. Do not get trapped by feature sprawl

There are larger missing web features:

- spectral freeze
- full soundscapes parity
- complete `pad2` engine parity
- dual independent lead engines

You are **not** expected to finish all of those in one sweep.

If you have time after reverb/send fixes, then:

1. improve state compatibility for the current native engines
2. document the highest remaining gaps

## 6. Native iOS Optimization Components To Include In Your Thinking

This port is not just a web clone.
It should preserve the web sound where possible, but it is allowed to use a better native architecture when that improves CPU, latency, or runtime stability.

Prioritize optimizations that:

1. preserve or improve sonic parity
2. remove browser-style overhead that does not need to exist on iOS
3. reduce real-time contention on the audio thread
4. avoid adding feature drift

### A. Replace tap-plus-lock bridges with lock-free native audio handoff where practical

The current branch is better than before, but still not ideal:

- `GranularProcessor` uses a direct-write path but still has lock pressure
- `ReverbProcessor` now uses a live input bridge but it is also lock-backed

If you can improve this safely, prefer:

- single-producer / single-consumer ring buffers
- fixed-size preallocated buffers
- atomic read/write indices
- no allocations inside render callbacks

This is a native optimization that the web app cannot do as cleanly because it crosses JS / worklet / WASM boundaries.

### B. Treat `reverbLevel` as a return gain, not an insert wet/dry blend

The web app behaves like a routed aux-return architecture.
Keep the iOS graph in that shape:

- per-source dry path
- per-source send path
- reverb return level

Do not regress back to insert-style wet/dry behavior just because `AVAudioUnitReverb` makes that convenient.

### C. Use dedicated native buses only where they buy something

On the web side, extra buses often exist because of browser/worklet routing constraints.
On iOS, keep buses when they provide one of these benefits:

- independent stem recording
- true pre-fader send behavior
- reusable wet/dry routing
- simplified scheduling

If a bus exists only because the web graph needed indirection, consider collapsing it after confirming parity and recording behavior.

### D. Prefer block-rate parameter updates over per-sample control churn

The native engine should snapshot slow-moving parameters once per block where possible:

- send levels
- return levels
- diffusion / damping / width / modulation targets
- granular control values that do not need per-sample resolution

Keep truly audio-rate modulation only where the sound depends on it.

### E. Move hot DSP data structures toward native-friendly memory layout

If you touch hot loops, prefer:

- contiguous `Float` storage
- preallocated arrays
- `UnsafeMutableBufferPointer` only when it materially helps and stays safe
- struct layouts that minimize per-sample branching

In particular:

- granular grain pools
- reverb input ring buffers
- delay lines
- diffuser state

This is where native iOS can beat the web app without changing the musical result.

### F. Use Apple/native acceleration only when it does not change the sound

Acceptable examples:

- `Accelerate` / vDSP for bulk buffer ops, mixing, windowing, or simple vector math
- native SIMD-friendly loops
- lower-overhead native routing compared with JS/WASM wrapper layers

Do not silently swap in Apple DSP that materially changes the sound just because it is cheaper.

### G. Keep fallback modes, but do not let them become the main path

Fallbacks are good for product robustness:

- Apple reverb for `lite`
- simpler routing for constrained devices if explicitly mode-gated

But the parity path should remain the default target.
Do not let the fast fallback become the unofficial implementation of record.

### H. Push non-real-time work off the audio thread

Move or keep these out of render callbacks:

- preset normalization
- JSON decoding
- parameter migration
- seeded random sequence generation
- debug logging
- large state resets when they can be staged safely

### I. If you reuse shared DSP cores, prefer that over maintaining two different synth engines

If this sweep reaches the point where a Swift DSP path is clearly diverging from the web sound, the preferred long-term optimization is:

1. share the existing C++ DSP cores where feasible
2. keep Swift for graph/routing/state/orchestration
3. avoid maintaining parallel "same idea but different sound" engines forever

That is a better native architecture than reproducing browser overhead in Swift.

## Suggested Order Of Work

1. Read the current native audio graph and reverb path
2. Validate the custom reverb return path against the web behavior
3. Confirm the current per-source reverb send controls behave correctly, then extend them only if needed
4. Look for the highest-value native optimization opportunities that do not compromise parity
5. Re-run or extend state mappings needed for the new audio behavior
6. Verify granular direct-write path still compiles and still feeds the engine correctly
7. Run focused native typechecks
8. Summarize exactly what reached parity, what got faster architecturally, and what still differs

## Concrete Anchors

Use these as your starting points:

- iOS direct source-to-reverb wiring:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift` around the reverb setup section
- dead send computations:
  - `KesshoNativeSwift/Kessho/Audio/AudioEngine.swift` inside `applyParams()`
- current Apple reverb node creation:
  - `KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift`
- custom FDN processing function that is currently not the live graph:
  - `KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift`
- web reverb node wiring:
  - `src/audio/engine.ts`
- current state bridge:
  - `KesshoNativeSwift/Kessho/State/SliderState.swift`

## Validation You Should Run

At minimum run:

```sh
/bin/zsh -lc 'MODULE_CACHE=/tmp/swift-module-cache-audio && mkdir -p "$MODULE_CACHE" && /usr/bin/xcrun swiftc -typecheck -module-cache-path "$MODULE_CACHE" -sdk "$(xcrun --sdk iphoneos --show-sdk-path)" -target arm64-apple-ios17.0 $(find KesshoNativeSwift/Kessho/Audio KesshoNativeSwift/Kessho/Harmony KesshoNativeSwift/Kessho/Services -name "*.swift" | sort) KesshoNativeSwift/Kessho/State/SliderState.swift'
```

If you touch the plugin again, also sanity-check the plugin file for compilation-level correctness with the shared state decode path.

If you can run a broader Xcode build cleanly, do it, but do not block the sweep on that if the focused typecheck is already useful.

## Acceptance Criteria

The sweep is successful if all of the following are true:

- iOS no longer uses Apple reverb as the default parity path
- per-source reverb send controls are real, not dead values
- the existing state bridge still works and supports the new audio path
- granular direct-write ingestion remains in place
- the final architecture notes explicitly call out native-only CPU/runtime wins that are now possible on iOS
- focused Swift typechecks pass
- unrelated dirty files remain untouched

## Final Deliverable Format

When you finish, report:

1. What you changed
2. Which files changed
3. What parity improved
4. Which native architectural changes improve CPU/runtime compared with the web app
5. What still differs from the web app
6. What you validated
7. Any remaining high-risk technical debt

## If You Have Extra Time

Only after the core parity tasks above:

1. clean up remaining granular lock pressure
2. clean up reverb lock pressure
3. improve ocean/water routing parity
4. extend the bridge for the next most impactful web fields

Do not spend extra time on UI polish.
