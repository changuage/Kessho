# Kessho C++ Backbone C0 Partial Baseline

Generated: 2026-05-06
Scope: Phase 0 partial baseline, continuation log, and audit. This report tracks
architecture discovery, golden-candidate selection, additive C++ backbone work,
and lightweight verification.

## Checkpoint Status

Partial C0 is captured with the web and macOS Capacitor builds verified.

- `npm run type-check` passed.
- `npm run build` passed in the follow-up implementation pass after the initial
  lightweight baseline capture.
- `npm run test:native-swift-shared-reverb` passed in the follow-up implementation
  pass, confirming the existing native shared reverb bridge still matches its
  layout checks.
- `npm run cap:mac:build` passed after rerunning with permission to write
  Swift/Clang caches outside the workspace. The sandboxed attempt failed before
  building the Swift package because SwiftPM tried to write
  `~/.cache/clang/ModuleCache`.
- `npm run core:ci`, `npm run core:build:apple`, and
  `npm run core:apple-source` passed for the additive KesshoCore skeleton,
  snapshot contract, smoke render lane, native/WASM event queue, MIDI adapter,
  host switch, module parity gates, planar web module-preview gate, Apple
  static-library build, and Apple `AVAudioSourceNode` smoke harness.
- Continuation pass on 2026-05-06 added the source facade ABI functions
  `kessho_module_note_off` and `kessho_module_kill_voice`. `PadModule`
  implements both through the instance-owned pad API, while modules that do not
  support per-voice release/kill retain default no-op behavior.
- After that ABI extension, `npm run core:ci`, `npm run build`,
  `npm run core:build:apple`, and an escalated `npm run core:apple-source`
  passed. The first sandboxed Apple source check failed because `swiftc` tried
  to write `~/.cache/clang/ModuleCache`; the rerun with permission to write the
  compiler cache passed.
- `npm run core:golden-profile` now renders four C11 starting-profile
  candidates for 30 seconds each through the current core WASM preview path and
  a compiled native C++ fixture, then writes
  `docs/reports/kessho-core-golden-profile-latest.json` plus
  `docs/reports/kessho-core-golden-profile-latest.md`. This covers deterministic
  sample rate, seed, snapshot-derived pad preview, empty automation/MIDI event
  streams, RMS/peak/LUFS-like level, spectral-centroid estimate, dry-module null
  residual, native/WASM residual, CPU, render misses, and RSS/WASM memory. It is
  explicitly not a replacement for live browser/macOS/iOS captures.
- `scripts/kessho-core-build-manifest.mjs` is now the single source of truth for
  KesshoCore C++ source files, include directories, and WASM exports. The WASM
  build, Apple static-library build, native/WASM smoke test, and native/WASM
  render parity gate all consume this manifest, avoiding repeated source-list
  edits as more DSP islands are wrapped.
- `npm run core:apple-source` initially failed in the workspace sandbox when
  `swiftc` tried to write `~/.cache/clang/ModuleCache`; it passed after rerun
  with permission to write the compiler module cache outside the workspace.
- `bash wasm/dynamics-character/build.sh` and
  `npm run test:dynamics-character` passed after the instance-owned DSP state
  refactor, keeping the standalone dynamics-character WASM artifact aligned with
  the shared source.
- The C5 timing slice is partial but active: C++ owns transport sample advance,
  fixed-capacity param/MIDI/transport queues, sample-offset dispatch, smoothing
  ramps, deterministic insertion ordering for equal-offset events,
  beat/bar/phrase transport reporting, and deterministic seed/RNG state.
- The render event loop now uses a sorted event cursor, so event dispatch is
  O(render frames + queued events) instead of scanning the full queue for every
  sample.
- C6 wrappers exist for the existing `dynamics-character`,
  `dynamics-degrade`, `reverb`, `granular-fx`, `spectral-freeze`, `lead-fm`,
  `pad`, `drum`, and `soundscapes` C++ DSP islands. `KesshoCore` can
  instantiate multiple
  instance-owned wrappers
  through a module facade and process interleaved or planar-stereo blocks in
  native and WASM smoke tests. Dedicated module parity gates compare the
  wrappers against the existing standalone WASM artifacts, including reverb
  FDN/Dattorro cases, granular bypass/clean/cloud/legacy-grain cases, and
  spectral-freeze dry/live/solid/slushy cases, plus lead-fm lead1/lead2/summed
  routing, release, delay isolation, unison, transient, LFO, and algorithm
  cases, plus pad main, reverb-send, prefader, postfader, filter, fold, LFO,
  note-off release, and hard kill cases, plus drum kick/click/beep/delay/layer
  cases, plus soundscapes water, insects layer 1, insects layer 2, and
  mixed-output cases.
- A narrow C7 host switch exists behind `?engine=core-wasm`. The default web
  engine remains unchanged unless that query parameter is present. The core host
  now receives selected-preset metadata from the canonical preset loader and
  maps the normalized snapshot into deterministic preview render scalars.
- A C9 adapter foundation exists for converting app/native MIDI messages into
  the `KesshoMidiEvent` C ABI and queueing them through the core WASM worklet.
- A C10 mixer/routing foundation now exists in `KesshoCore`: a fixed-capacity
  stereo mixer ABI with 16 input buses, 8 output buses, and 64 route slots. The
  smoke test covers route accumulation, sends, disabled routes, clear behavior,
  invalid route rejection, stats, and input/output alias rejection before any
  product audio path is moved onto it. The `?engine=core-wasm` worklet now
  routes its current preview output through an identity C++ mixer route before
  writing to the AudioWorklet output, and the web-module gate verifies zero
  mixer residual for both direct preview and dry-dynamics preview. `npm run
  core:ci`, `npm run core:build:apple`, and `npm run core:golden-profile`
  passed after this mixer ABI was added; `npm run build` also passed after the
  core worklet was moved onto the identity mixer route.
- The module facade now exposes a multi-output tap ABI:
  `kessho_module_get_output_tap_count` and
  `kessho_module_process_planar_stereo_taps`. `KESSHO_CORE_ABI_VERSION` is now
  `2`, `kessho_get_abi_version` is exported for dynamic hosts, and snapshot V1
  remains separately versioned as `KESSHO_CORE_SNAPSHOT_VERSION` `1`. The pad
  module exposes six taps from one render: main, reverb-send, prefader pad 1,
  prefader pad 2, postfader pad 1, and postfader pad 2.
- The first browser sonic-parity slice is now implemented behind
  `?engine=core-wasm`: shared output trims live in `src/audio/outputTrims.ts`,
  the core host no longer applies the preview-only pad timbre softening,
  artificial fallback pad level, capped pad-preview gains, capped note velocity,
  or smoke-tone fallback, and the core master gain now uses the same
  `MASTER_OUTPUT_TRIM` as the web engine. This keeps `?engine=web` as the
  reference path and makes core differences explicit instead of masking them.
- The `?engine=core-wasm` worklet now renders the C++ pad source through the
  multi-output tap ABI. Postfader pad 1 and pad 2 taps are routed through the
  C++ mixer for dry output. Prefader pad 1 and pad 2 taps are also mixed into a
  C++ reverb module with slider-derived pad send gains, then returned through
  the same mixer with `reverbLevel * ENGINE_TRIMS.reverb`. The reverb module
  remains parity-gated against the standalone reverb WASM artifact.
- Delay A now has a C++ module, explicit ABI tap names, a native/WASM smoke
  check, and an internal WASM regression check. The module uses WebAudio-style
  RBJ biquad lowpass/highpass/bandpass filters and a WebAudio-style lowpass for
  the cross-feed tap. The `?engine=core-wasm` host maps the current pad Delay A
  sends and Delay A controls into that module, and the worklet routes pad
  prefader taps into Delay A, Delay A's main tap into the mixer, and Delay A's
  reverb-send tap into the existing C++ reverb input. This is a routing/DSP
  milestone, not final sonic parity: the current C++ Delay A still differs from
  web `SharedDelayBusA` in limiter/compressor behavior and duck detector
  behavior, and its Delay B/granular taps are emitted but not consumed until
  those downstream core modules are in the browser path.
- A query-gated browser capture harness now exists:
  `src/audio/sonicParityHarness.ts` installs only for `?parity=1`, taps the
  final limiter through the existing recorder-tap worklet, and exposes
  `window.__kesshoSonicParity.capture()`. `scripts/check-web-core-sonic-parity.mjs`
  compares `?engine=web&parity=1` and `?engine=core-wasm&parity=1` captures.
  The script currently fails clearly unless Playwright and Chromium are
  installed, so it adds a real measurement lane without changing normal app
  behavior.
- Browser CPU, macOS Capacitor CPU, audio captures, MIDI hardware behavior, and
  background/screen-off behavior were not manually measured in this pass.
  Browser Use did load the in-app browser at
  `http://127.0.0.1:4173/?engine=core-wasm` after the multi-tap rebuild. The
  page title was `Deterministic Generative Music`, visible controls rendered,
  and console error count was `0`. `curl` also confirmed the rebuilt
  `kessho_core.wasm` and `kessho-core.worklet.js` were served with HTTP 200
  from the Vite dev server.
- After the pad dry/reverb and Delay A routing slices, `npm run type-check`,
  `npm run core:ci`, and `npm run build` passed. `core:ci` now includes
  `npm run core:delay-a-module-regression`. The in-app browser loaded and
  started `http://127.0.0.1:4173/?engine=core-wasm`; after the play control
  flipped to stop, console warning/error count remained `0`. `curl -I` returned
  HTTP 200 for the rebuilt `kessho_core.wasm` and `kessho-core.worklet.js`.
  Browser Use's screenshot path still timed out in this environment. `npm run
  core:browser-sonic-parity -- --duration-ms=100 --settle-ms=100 --no-fail`
  still did not complete because Playwright is not installed; the script
  reported the install commands as intended.
- The offline golden profile observed zero dry-module residual for all four
  rendered candidates and no missed render blocks. Latest WASM CPU averages in
  that harness were approximately `1.72%` for `Ethereal Ambient`, `1.71%` for
  `Dark Textures`, `1.85%` for `Wave Out`, and `1.85%` for the
  `Ethereal Ambient` -> `Dark Textures` midpoint. The matching native fixture
  averaged `1.29%`, `1.26%`, `1.37%`, and `1.29%`; native/WASM residuals ranged
  from `9.390e-8` to `9.722e-6` RMS and stayed below `4.004e-5` peak.

Full C0 remains open until CPU/audio captures are recorded for the golden
candidate set. Full 1:1 sonic parity remains open: Delay A's exact Web Audio
limiter/duck behavior and downstream Delay B/granular consumption, Delay B,
granular routing, spectral-freeze routing, lead/piano/drum/earth source
ownership, web scheduler ownership, MIDI-driven source behavior, stem taps, and
iOS/device behavior are still outside the current core browser path.

## Repository State Notes

The worktree was already dirty before this report was created. Observed
concurrent changes include source, native, package, Capacitor, and docs files,
plus the architecture plan itself. This report does not revert or depend on
those changes.

`docs/reports/` did not exist before this pass.

## Verification Commands Run

```sh
pwd
git status --short
sed -n '1,240p' docs/KESSHO_CPP_BACKBONE_WORK_PLAN.md
rg --files
sed -n '1,220p' package.json
test -d node_modules && printf 'node_modules present\n' || printf 'node_modules missing\n'
rg -n "addModule|worklet|wasm|kessho_.*\.wasm|new AudioWorkletNode|registerProcessor" src public/worklets
rg -n "factory|preset|category|tags|engines|effects|journey|morph" src/presets src/ui/* src/ui/*/*.ts src/ui/*/*.tsx
sed -n '1,220p' src/presets/factoryPresets.ts
sed -n '1,260p' src/presets/catalog.ts
sed -n '1,220p' src/ui/state.ts
sed -n '480,560p' src/audio/engine.ts
sed -n '220,520p' src/presets/factoryPresets.ts
rg -n "export const .*PRESETS|name:|tags:|description:" src/audio/padPresets.ts src/audio/drumPresets.ts src/audio/waterPresets.ts src/ui/granular/granularPresets.ts src/ui/delay/delayPresets.ts src/ui/dynamics/dynamicsPresets.ts src/ui/earth/earthPresets.ts src/ui/synth/synthSourcePresets.ts src/ui/reverb/ReverbPage.tsx
rg -n "export interface SliderState|export const defaultState|const defaultState|DEFAULT_STATE|initialState" src/ui/state.ts src/App.tsx
rg -n "Capacitor|registerPlugin|MIDI|background|screen|audio session|NowPlaying|native" src/native plugins capacitor.config.ts ios/App/App/Info.plist KesshoNativeSwift/Kessho/Services KesshoNativeSwift/Kessho/MIDI
ls docs
find docs/reports -maxdepth 2 -type f -print
sed -n '1,160p' public/presets/manifest.json
rg -n "name|tags|engine|granular|drum|water|delay|dynamics|journey|morph" public/presets KesshoNativeSwift/Kessho/Presets
rg -n "webmidi|navigator\.requestMIDIAccess|requestMIDIAccess|MIDI" src/App.tsx src/ui/routing src/native src/audio
sed -n '1,260p' scripts/build-capacitor-mac.mjs
sed -n '1,180p' scripts/check-macos.sh
sed -n '1,120p' capacitor.config.ts
npm run type-check
npm run build
npm run test:native-swift-shared-reverb
npm run cap:mac:build
npm run core:test
npm run core:build:wasm
npm run core:build:apple
npm run core:parity
npm run core:apple-source
npm run core:snapshot
PATH="/Users/panguroo/Documents/generativemusic/emsdk/python/3.13.3_64bit/bin:/Users/panguroo/Documents/generativemusic/emsdk/upstream/emscripten:/Users/panguroo/Documents/generativemusic/emsdk/node/22.16.0_64bit/bin:$PATH" bash wasm/reverb/build.sh
npm run core:reverb-module-parity
bash wasm/granular-fx/build.sh
npm run core:granular-module-parity
npm run test:native-swift-granular-parity
bash wasm/spectral-freeze/build.sh
npm run core:spectral-freeze-module-parity
bash wasm/lead-fm/build.sh
npm run core:lead-fm-module-parity
bash wasm/pad/build.sh
npm run core:pad-module-parity
bash wasm/drum/build.sh
npm run core:drum-module-parity
bash wasm/soundscapes/build.sh
npm run core:soundscapes-module-parity
npm run core:ci
npm run core:build:apple
npm run build
npm run core:apple-source
npm run core:golden-profile
npm run dev -- --host 127.0.0.1 --port 4173
curl -I -s 'http://127.0.0.1:4173/'
curl -I -s 'http://127.0.0.1:4173/?engine=core-wasm'
mkdir -p docs/reports
```

## Available Verification Commands

From `package.json`:

- `npm run type-check`: TypeScript no-emit check. Passed in this pass.
- `npm run build`: `tsc && vite build`; passed in the follow-up implementation
  pass.
- `npm run cap:mac:build`: builds web app, SwiftPM macOS shell, bundles and
  signs `build/macos/Kessho Capacitor.app`; passed when rerun outside the
  workspace sandbox.
- `npm run check:mac`: local macOS compatibility check; can chmod WASM scripts
  and node binaries, so treat as a mutating diagnostic.
- Targeted parity/hotpath scripts exist for dynamics, native reverb/granular,
  native MIDI threading, iOS mobile audio hotpaths, iOS state parity, native
  Supabase parity, and mobile web hotpaths.
- `npm run core:reverb-module-parity`: compares standalone reverb WASM against
  the KesshoCore reverb module facade across FDN and Dattorro cases.
- `npm run core:granular-module-parity`: compares standalone granular WASM
  against the KesshoCore granular module facade across bypass, clean, granular
  cloud, and legacy-grain cases.
- `npm run core:spectral-freeze-module-parity`: compares standalone spectral
  freeze WASM against the KesshoCore spectral-freeze module facade across dry
  pass-through, live resynthesis, solid freeze, and slushy freeze cases.
- `npm run core:lead-fm-module-parity`: compares standalone lead-fm WASM
  against the KesshoCore lead-fm source module facade across lead1, lead2,
  summed routing, short-release, delay-isolation, unison/transient/LFO, and
  DX17 algorithm cases.
- `npm run core:pad-module-parity`: compares standalone pad WASM against the
  KesshoCore pad source module facade across main output, reverb send,
  prefader/postfader pad taps, filter/fold/LFO shaping, and pad 2 routing
  cases.
- `npm run core:drum-module-parity`: compares standalone drum WASM against the
  KesshoCore drum source module facade across kick, click, beep, reverb-send,
  delay, layered sub/membrane, and modal beep cases.
- `npm run core:soundscapes-module-parity`: compares standalone soundscapes
  WASM against the KesshoCore soundscapes source module facade across water,
  insects layer 1, insects layer 2, and mixed-output cases.

## KesshoCore Skeleton And Smoke Evidence

The first additive C++ backbone slice exists under `cpp/KesshoCore/` and keeps
the current web/native audio paths untouched. Its public ABI is declared in
`cpp/KesshoCore/include/KesshoCore/KesshoCore.h`.

Observed checks:

- `npm run core:test`: native C++ smoke test creates, renders silence, switches
  to the deterministic smoke tone, validates reset determinism, verifies
  sample-offset param events, future queued events, MIDI event processing,
  transport stop events, deterministic same-offset ordering, beat/bar/phrase
  transport reporting, deterministic seeded RNG, and exercises the same event
  ABI through WASM.
- `npm run core:build:wasm`: builds `public/worklets/kessho_core.wasm` and
  copies `public/worklets/kessho-core.worklet.js`.
- `npm run core:build:apple`: builds
  `build/kessho-core/apple/libKesshoCore.a`.
- `npm run core:ci`: rebuilds `public/worklets/kessho_core.wasm`, then runs
  snapshot, MIDI adapter, host switch, native/WASM smoke, native/WASM render
  parity, dynamics module parity, reverb module parity, granular module parity,
  spectral-freeze module parity, lead-fm module parity, pad module parity, drum
  module parity, soundscapes module parity, Delay A module regression, and web
  module-preview gates in sequence.
- `npm run core:parity`: renders 4096 frames through native C++ and the WASM ABI
  and compares the actual float samples. The smoke residual was RMS `0.000e+0`,
  peak `0.000e+0`.
- `npm run core:apple-source`: links the Apple static library into a Swift
  `AVAudioSourceNode` harness, renders offline through `AVAudioEngine`, and
  validates the smoke signal. The observed peak was `0.2`, RMS `0.14133705`.
- `npm run core:snapshot`: checks the normalized TypeScript snapshot contract in
  `src/audio/coreSnapshot.ts`, including deterministic serialization, finite
  numeric output, required-field validation, same-preset stability, and scalar
  conversion for the C ABI. The scalar ABI hash is now `KCV2` and includes
  beats-per-bar, bars-per-phrase, and seed fields.
- `public/kessho-core-smoke.html`: browser-only smoke harness for loading
  `kessho-core.worklet.js`, starting the WASM core, and measuring muted
  AudioWorklet RMS/peak.

The C++ core now exposes `kessho_apply_snapshot_v1`, which accepts a fixed
`KesshoCoreSnapshotV1` struct outside the render call. This keeps the current
contract free of render-thread JSON parsing while giving React/WASM/native hosts
a stable scalar checkpoint to converge on.

The C++ core also exposes `kessho_push_param_event`,
`kessho_push_midi_event`, and `kessho_push_transport_event`. Events are stored
in a fixed-capacity queue, sorted by sample offset and insertion sequence, and
dispatched with a render-time cursor to avoid per-sample queue scans. This is
the current CPU-focused C5 foundation, not a full MIDI routing implementation.

C5 transport/seed additions are exposed through
`kessho_set_transport_signature`, `kessho_get_transport_info`,
`kessho_set_seed`, `kessho_get_seed`, and `kessho_next_random_float`. Native
tests verify one-beat advance at 120 BPM and deterministic seeded sequences.

The smoke AudioWorklet adapter now routes runtime render-mode, smoke-tone, and
start/stop messages through queued C param/transport events. This proves the JS
adapter shape for the C ABI, while the production `src/audio/engine.ts` graph
still runs on the existing engine path.

## C7 Web Core Host Evidence

`src/audio/coreEngineHost.ts` adds a minimal web host for `KesshoCore` and
`src/audio/runtime.ts` selects it only when the page is opened with
`?engine=core-wasm`. The existing `AudioEngine` remains the default for
`?engine=web` and for normal app loads.

- `npm run core:host` verifies the runtime switch, dynamic import fallback,
  host snapshot/scalar usage, C ABI snapshot application from the worklet,
  queued worklet event path, telemetry hooks, and source/public worklet copy
  parity.
- `npm run build` emitted a separate `coreEngineHost` chunk, confirming the
  default product engine remains independently bundled.
- The dev server served `/?engine=core-wasm`,
  `/src/audio/coreEngineHost.ts`, `/worklets/kessho-core.worklet.js`, and
  `/worklets/kessho_core.wasm` with HTTP 200 responses.
- The smoke worklet now supports `enablePerf` and reports `kessho-core` render
  CPU, missed-block percentage, active-module count, event queue depth, and MIDI
  queue depth placeholders.
- The smoke worklet accepts `applySnapshot` messages and writes the normalized
  TypeScript scalar snapshot into the `KesshoCoreSnapshotV1` C ABI before
  rendering.
- `src/audio/coreMidiEvents.ts` normalizes app/CoreMIDI-style messages into the
  `KesshoMidiEvent` layout, including sample offset, source id, status/channel,
  data bytes, normalized value, and raw byte truncation to the C ABI limit.
- `CoreEngineHost.pushMidiMessage()` posts normalized MIDI events to the
  worklet, and `MidiRoutingPanel` forwards received native MIDI messages into
  the active engine. The legacy web engine keeps a no-op method so existing MIDI
  UI routing behavior is unchanged.
- `npm run core:midi` verifies note-on, pitch-bend, SysEx/raw-byte truncation,
  timestamp-to-sample-offset conversion, and past-timestamp clamping.
- `src/ui/presetUtils.ts` now forwards loaded preset name/id metadata through
  `audioEngine.updateParams`. The default `AudioEngine` accepts the extra
  optional argument as a no-op, while `CoreEngineHost` stores it for
  `createKesshoEngineSnapshot`.
- `toKesshoCorePresetPreviewScalarsV1` derives render mode, preview pitch,
  amplitude, and seed from the normalized selected-preset snapshot. This keeps
  `?engine=core-wasm` deterministic and audibly responsive to loaded presets
  without claiming full DSP parity.
- The core WASM worklet now instantiates the wrapped `dynamics-character` module
  when the selected snapshot resolves to an active dynamics path. The core host
  uses the same `resolveDynamicsTargets` mapping as the legacy web engine and a
  shared `dynamicsCharacterParams` helper, so the 82-field dynamics parameter
  order is checked against `dynamics-character.worklet.js` instead of duplicated
  by hand.
- The web worklet uses the module facade's planar-stereo process ABI for the
  dynamics preview path. This avoids JS interleave/deinterleave loops and extra
  interleaved scratch buffers in the AudioWorklet hot path while preserving the
  existing interleaved ABI for standalone/module parity gates.
- `CoreEngineHost` caches the full dynamics module parameter vector and only
  posts `configureModule` when the selected snapshot changes the rounded module
  parameters. Regular slider/preset updates still post scalar snapshots, but
  avoid redundant unchanged 82-parameter module messages.
- `npm run core:snapshot` now verifies deterministic selected-preset preview
  scalars, finite values, audible preset output, silent-preset mute behavior,
  and explicit seed preservation.
- `npm run core:host` verifies the selected-preset metadata bridge, worklet
  module configuration message, idempotent module-config cache guard, module
  exports, and source/public worklet copy parity.
- `npm run core:web-module` instantiates `public/worklets/kessho_core.wasm`,
  renders the selected-preset preview directly, then renders the same preview
  through the wrapped dynamics module in both dry-transparent and colored
  configurations. The dry residual remains RMS `0.000e+0`, peak `0.000e+0`.
  The gate also renders direct and dry-dynamics previews through an identity
  `kessho_mixer_*` route; both mixer residuals remain RMS `0.000e+0`, peak
  `0.000e+0`. The colored configuration proves the web core path can apply
  audible dynamics-character coloration through the shared module facade; the
  latest colored residual was RMS `6.320e-2`, peak `8.937e-2`. The same gate
  renders 512 worklet-sized quanta and checks conservative realtime CPU budgets;
  the latest observed averages were direct preview `0.14%`, dry module preview
  `0.63%`, identity mixer preview `0.16%`, identity mixer dry preview `0.49%`,
  colored module preview `1.29%`, dry overhead `0.49%`, identity mixer overhead
  `0.02%`, identity mixer dry overhead `-0.15%`, and colored overhead `1.15%`.

In-app browser validation passed on 2026-05-06 at
`http://127.0.0.1:4173/?engine=core-wasm`. The initial browser play attempt
found that the core worklet still fetched `kessho_core.wasm` from
`AudioWorkletGlobalScope`, which failed in this browser because `fetch` was not
defined there. `CoreEngineHost` now fetches the WASM binary on the main thread
and passes it through `processorOptions`, with a guarded worklet fallback for
standalone harnesses. A second browser play attempt exposed missing legacy UI
callback methods after the core host was selected; the runtime proxy now keeps
using its getter/no-op fallback layer for methods absent from the narrower core
host. A third browser pass found the preview still sounded like the old proof
tone because the host was rendering `KESSHO_RENDER_SMOKE_SINE`. The browser
worklet now configures an instance-owned `KESSHO_MODULE_PAD` source from the
loaded pad state, softens the temporary browser-preview timbre away from
saw/noise/drive-heavy settings, cycles a six-voice chord every few seconds, and
disables the smoke tone whenever that source is available. After reload,
clicking the visible play button switched it to stop and fresh console logs
contained only cloud preset/media-stream informational logs, with no
start-audio, worklet fetch, missing-method, or source-module errors.

## C11 Golden Profile Evidence

`scripts/profile-kessho-core-golden-candidates.mjs` starts the C11 profiling
lane without claiming full product parity. It instantiates
`public/worklets/kessho_core.wasm`, compiles
`cpp/KesshoCore/tests/kessho_core_golden_profile_fixture.cpp` against the shared
KesshoCore source manifest, configures the same current core preview shape used
by the browser host (instance-owned pad source plus optional dry
dynamics-character module), renders each candidate for 30 seconds at 48 kHz in
both WASM and native C++, and writes:

- `docs/reports/kessho-core-golden-profile-latest.json`
- `docs/reports/kessho-core-golden-profile-latest.md`

The current candidate set is:

- `Ethereal Ambient`
- `Dark Textures`
- `Wave Out`
- a synthetic midpoint between `Ethereal Ambient` and `Dark Textures`

The report records sample rate, block size, render duration, seed, deterministic
empty automation/MIDI event streams, RMS, peak, LUFS-like level, DC offset,
spectral-centroid estimate, CPU average/peak, render misses, RSS delta, WASM
memory size, dry-dynamics null residual, and native/WASM residual. The latest
run produced no missed render blocks, dry residuals of RMS `0.000e+0`, peak
`0.000e+0` for all four profiles, WASM CPU averages of roughly `1.71%` to
`1.85%`, native CPU averages of roughly `1.26%` to `1.37%`, and native/WASM
residuals below RMS `9.722e-6`, peak `4.004e-5`. The WASM profiler now times
only the module process calls for CPU instead of including per-block metric-copy
work.

This still does not satisfy full C11 because it does not compare against the
legacy Web Audio product path, live browser AudioWorklet CPU, macOS/iOS native
device CPU, MIDI jitter, or screen-off battery.

## C10 Mixer/Routing Foundation

`cpp/KesshoCore/src/KesshoMixer.cpp` adds a fixed-capacity stereo routing
primitive for the highest-return mixer/routing migration without changing app
behavior yet. The public C ABI exposes an opaque mixer handle, route setup,
route stats, route clearing, and planar-stereo processing across up to 16 input
buses, 8 output buses, and 64 route slots. Processing uses caller-owned buffers,
zeros outputs before accumulation, returns failure for invalid route indices or
non-finite gains, and rejects exact input/output or output/output pointer
aliasing so future host adapters cannot silently erase source buffers.

The mixer source is listed in `scripts/kessho-core-build-manifest.mjs`, and the
new functions are exported from `public/worklets/kessho_core.wasm`. The
`?engine=core-wasm` worklet now allocates separate source and mixer output
buffers, configures a C++ identity route from bus 0 to bus 0, runs the route via
`kessho_mixer_process_planar_stereo`, and reports `mixerProcess` failures rather
than silently bypassing the routing contract. The legacy product Web Audio graph
remains active until more routing branches can be migrated behind parity gates.

The native and WASM smoke tests verify main-bus accumulation, send-bus routing,
stats, clear behavior, invalid route rejection, and alias rejection; the native
smoke test also covers disabled routes. `npm run core:host` asserts the source
and public worklets both use the mixer exports, separate output buffers,
identity route setup, mixer processing, and mixed-output copy path. `npm run
core:web-module` proves identity mixer routing is sample-transparent for direct
and dry-dynamics previews. The full `npm run core:ci` gate passed after the
worklet was moved onto the identity mixer route, including native/WASM smoke
parity and all existing module parity suites.

## C6 Multi-Output Tap ABI

The module facade now has a shared multi-output tap contract so source modules
can expose routing branches from a single render instead of duplicating module
instances. The public ABI adds `kessho_module_get_output_tap_count` and
`kessho_module_process_planar_stereo_taps`; the WASM manifest exports both plus
`kessho_get_abi_version`. The C wrapper rejects null arrays, null per-bus
pointers, zero frames, bus counts above `KESSHO_MODULE_MAX_OUTPUT_TAPS`, and bus
counts above the module's advertised tap count. The virtual default helper and
pad override repeat local pointer validation so direct in-process C++ callers
cannot bypass the safety contract.

`PadModule` currently advertises `KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT` `6`, tied
by static assertion to the public `KesshoModuleOutputTap` enum. It renders the
pad instance once per block and copies the requested planar taps from the
existing pad output buffers. `npm run core:test` covers the native and WASM ABI,
including ABI version export, tap count, invalid bus-count rejection, null-array
rejection, null channel-pointer rejection, finite output, and nonzero main and
reverb-send taps. `npm run core:pad-module-parity` compares one multi-tap core
render against the standalone pad output buffers for all six taps and reported
RMS `0.000e+0`, peak `0.000e+0` for each tap. `npm run core:build:apple`
also passed after the public header change.

## C6 Module Facade Evidence

The first existing DSP islands wrapped behind `KesshoCore` are
`wasm/dynamics-character/kessho_dynamics_character.cpp`,
`wasm/dynamics-degrade/kessho_dynamics_degrade.cpp`,
`wasm/reverb/kessho_reverb.cpp`,
`wasm/granular-fx/kessho_granular.cpp`, and
`wasm/spectral-freeze/kessho_spectral_freeze.cpp`, plus
`wasm/lead-fm/kessho_lead_fm.cpp`, `wasm/pad/kessho_pad.cpp`,
`wasm/drum/kessho_drum.cpp`, and `wasm/soundscapes/kessho_soundscapes.cpp`.

- `cpp/KesshoCore/src/modules/KesshoModule.h` defines the module interface.
- `cpp/KesshoCore/src/modules/KesshoModules.cpp` exposes the module C ABI:
  create, destroy, reset, param access, param commit, module
  note-on/all-notes-off/active-voice-count for source instruments,
  output tap count, interleaved process, planar-stereo process, and
  planar-stereo multi-output tap process.
- `cpp/KesshoCore/src/modules/KesshoDynamicsCharacterModule.cpp` adapts the
  existing dynamics-character DSP into the shared module facade through a new
  opaque per-instance C API. The legacy singleton-style exports remain available
  for the existing standalone WASM/iOS callers.
- `cpp/KesshoCore/src/modules/KesshoDynamicsDegradeModule.cpp` adapts the
  standalone dynamics-degrade DSP into the shared module facade through a new
  opaque per-instance C API. The legacy singleton-style exports remain available
  for the existing standalone WASM caller.
- `cpp/KesshoCore/src/modules/KesshoReverbModule.cpp` adapts the standalone
  reverb DSP into the shared module facade through a new scoped per-instance C
  API. The legacy singleton-style reverb exports remain available for the
  existing standalone WASM/native callers.
- `cpp/KesshoCore/src/modules/KesshoGranularModule.cpp` adapts the standalone
  granular DSP into the shared module facade through a scoped per-instance C
  API. The legacy singleton-style granular exports remain available for the
  existing standalone WASM/native callers.
- `cpp/KesshoCore/src/modules/KesshoSpectralFreezeModule.cpp` adapts the
  standalone spectral-freeze DSP into the shared module facade through a scoped
  per-instance C API. The legacy singleton-style spectral-freeze exports remain
  available for the existing standalone WASM caller.
- `cpp/KesshoCore/src/modules/KesshoLeadFmModule.cpp` adapts the standalone
  lead-fm source synth into the shared module facade through a scoped
  per-instance C API. The wrapper preserves the legacy singleton-style lead-fm
  exports for the existing standalone worklet, adds note-on/all-notes-off
  module controls, and uses an `outputSelect` module param for lead1, lead2, or
  summed stereo output through the existing single-output facade.
- `cpp/KesshoCore/src/modules/KesshoPadModule.cpp` adapts the standalone pad
  source synth into the shared module facade through a scoped per-instance C
  API. The wrapper preserves the legacy singleton-style pad exports for the
  existing standalone worklet, adds note-on/all-notes-off module controls, and
  uses an `outputSelect` module param for main output, reverb send, prefader pad
  taps, and postfader pad taps through the existing single-output facade.
- `cpp/KesshoCore/src/modules/KesshoDrumModule.cpp` adapts the standalone drum
  source synth into the shared module facade through a scoped per-instance C
  API. The wrapper preserves the legacy singleton-style drum exports for the
  existing standalone worklet, adds trigger/all-notes-off module controls, and
  uses an `outputSelect` module param for main output or reverb-send output.
- `cpp/KesshoCore/src/modules/KesshoSoundscapesModule.cpp` adapts the standalone
  soundscapes WASM island into the shared module facade through scoped
  per-instance water, insects, and insects2 APIs. The wrapper preserves the
  legacy singleton-style exports for the existing worklet and uses an
  `outputSelect` module param for water, insects layer 1, insects layer 2, or a
  mixed stereo output.
- `npm run core:test` now proves native and WASM can instantiate the module,
  create two concurrent dynamics-character modules and two concurrent
  dynamics-degrade modules plus two concurrent reverb, granular, and
  spectral-freeze modules plus two concurrent lead-fm, pad, drum, and
  soundscapes modules, verify distinct param storage, write params, commit
  them, process dry/silent/colored interleaved and planar-stereo blocks through
  separate module instances, trigger lead-fm/pad/drum notes through the module
  note API, render nonzero reverb tails, granular clean-mode output,
  spectral-freeze wet output, lead-fm lead1/lead2 output, pad main/pad2 output,
  drum main/reverb output, and soundscapes water/insects output through module
  paths, and verify the legacy C ABI dry/source paths.
- `npm run core:module-parity` renders bypass, clean-character, and harsh
  degrade cases through both the existing standalone
  `kessho_dynamics_character.wasm` and the new `KesshoCore` module facade. The
  same gate now renders degrade-bypass, degrade-wear, and degrade-alias cases
  through both `kessho_dynamics_degrade.wasm` and the new `KesshoCore` module
  facade. The observed residuals were RMS `0.000e+0`, peak `0.000e+0` for all
  six cases.
- `npm run core:reverb-module-parity` renders hall-lite impulse,
  plate-balanced tone, and Dattorro-wide cases through both
  `kessho_reverb.wasm` and the new `KesshoCore` module facade. The observed
  residuals were RMS `0.000e+0`, peak `0.000e+0` for all three cases.
- `npm run core:granular-module-parity` renders disabled pass-through,
  clean-voice-follow, granular-cloud, and legacy-grains cases through both
  `kessho_granular.wasm` and the new `KesshoCore` module facade. The observed
  residuals were RMS `0.000e+0`, peak `0.000e+0` for all four cases.
- `npm run core:spectral-freeze-module-parity` renders dry-pass-through,
  live-resynthesis, solid-freeze, and slushy-freeze cases through both
  `kessho_spectral_freeze.wasm` and the new `KesshoCore` module facade. The
  observed residuals were RMS `0.000e+0`, peak `0.000e+0` for all four cases.
- `npm run core:lead-fm-module-parity` renders lead1-basic, lead2-basic,
  summed routing, short hold/release, delay-enabled lead isolation, and
  DX17/unison/transient/LFO cases through both `kessho_lead_fm.wasm` and the
  new `KesshoCore` source module facade. The observed residuals were RMS
  `0.000e+0`, peak `0.000e+0` for all six cases.
- `npm run core:pad-module-parity` renders main-basic, reverb-send,
  pad2-prefader, filter-fold-LFO, pad2-postfader, note-off-release, and
  kill-voice-hard-stop cases through both `kessho_pad.wasm` and the new
  `KesshoCore` source module facade. The observed residuals were RMS
  `0.000e+0`, peak `0.000e+0` for all seven cases.
- `npm run core:drum-module-parity` renders kick-main, click-impulse,
  beep-hi-basic, kick-reverb, delay-kick, sub/membrane layering, and
  beep-lo-modal cases through both `kessho_drum.wasm` and the new `KesshoCore`
  source module facade. The observed residuals were RMS `0.000e+0`, peak
  `0.000e+0` for all seven cases.
- `npm run core:soundscapes-module-parity` renders water-waterfall,
  insects-cicada, insects2-tree-cricket, and mixed-water-insects cases through
  both `kessho_soundscapes.wasm` and the new `KesshoCore` source module facade.
  The observed residuals were RMS `0.000e+0`, peak `0.000e+0` for the first
  three cases and RMS `1.949e-9`, peak `1.490e-8` for the mixed-output case.
- `npm run test:dynamics-character` passed against the rebuilt standalone
  dynamics WASM after the instance-owned state API was added.
- `bash wasm/dynamics-degrade/build.sh` passed after the instance-owned
  dynamics-degrade state API was added, keeping the standalone degrade WASM
  artifact aligned with the shared source.
- `bash wasm/reverb/build.sh` passed after the scoped reverb state API was
  added, keeping the standalone reverb WASM artifact aligned with the shared
  source.
- `bash wasm/granular-fx/build.sh` passed after the scoped granular state API
  was added, keeping the standalone granular WASM artifact aligned with the
  shared source.
- `npm run test:native-swift-granular-parity` passed after the granular wrapper slice,
  confirming the existing native granular parity check still passes.
- `bash wasm/spectral-freeze/build.sh` passed after the scoped spectral-freeze
  state API was added, keeping the standalone spectral-freeze WASM artifact
  aligned with the shared source.
- `bash wasm/lead-fm/build.sh` passed after the scoped lead-fm state API was
  added, keeping the standalone lead-fm WASM artifact aligned with the shared
  source.
- `bash wasm/pad/build.sh` passed after the scoped pad state API was added,
  keeping the standalone pad WASM artifact aligned with the shared source. The
  first attempt failed because `emcc` was not on `PATH`; rerunning with the
  repo-local emsdk path succeeded.
- `bash wasm/drum/build.sh` passed after the scoped drum state API was added,
  keeping the standalone drum WASM artifact aligned with the shared source.
- `bash wasm/soundscapes/build.sh` passed after scoped water/insects state APIs
  were added, keeping the standalone soundscapes WASM artifact aligned with the
  shared source.

This is still a focused C6 module wrapper lane, not a full product preset
migration. The wrapped DSP islands are now instance-owned inside
`KesshoCore`, and the standalone legacy ABIs are guarded by native/WASM smoke
and parity coverage. The shared note API remains intentionally narrow; the
multi-output tap facade now exists for pad routing branches, while broader
source-bus ownership still needs to move behind explicit parity gates.

This is a C4 smoke parity gate for the shared render function, not full product
audio parity. Full C4 now has a live browser AudioWorklet play smoke for
`?engine=core-wasm`, but still needs broader golden-preset audio/CPU captures.

Browser runtime validation note: the Vite dev server served
`http://127.0.0.1:4173/?engine=core-wasm` with HTTP 200 in this run. After the
multi-tap ABI rebuild, Browser Use opened the in-app browser to that URL,
the page title loaded as `Deterministic Generative Music`, visible controls were
present, and fresh console-error inspection returned `0` errors. The rebuilt
`/worklets/kessho_core.wasm` and `/worklets/kessho-core.worklet.js` endpoints
also returned HTTP 200.

## Current Architecture Facts

The current product UI is React. `src/App.tsx` owns top-level state composition,
preset load/morph behavior, journey integration, and handoff to the web audio
engine. The core mutable audio/UI state shape is `SliderState` in
`src/ui/state.ts`; `DEFAULT_STATE` provides the normalized fallback surface.

`src/audio/engine.ts` is the main Web Audio conductor. It owns worklet loading,
WASM binary fetching, node creation, routing, transport-facing scheduling,
parameter forwarding, CPU telemetry collection, teardown, and fallback behavior.
Related TypeScript conductor modules include transport, harmony, drum sequencer,
sequence evolve modules, delay buses, earth texture playback, piano samples, and
runtime/morph helpers.

Existing C++/WASM DSP islands:

- `wasm/pad` -> `public/worklets/kessho_pad.wasm`
- `wasm/lead-fm` -> `public/worklets/kessho_lead_fm.wasm`
- `wasm/drum` -> `public/worklets/kessho_drum.wasm`
- `wasm/granular-fx` -> `public/worklets/kessho_granular.wasm`
- `wasm/reverb` -> `public/worklets/kessho_reverb.wasm`
- `wasm/spectral-freeze` -> `public/worklets/kessho_spectral_freeze.wasm`
- `wasm/soundscapes` -> `public/worklets/kessho_soundscapes.wasm`
- `wasm/dynamics-character` -> `public/worklets/kessho_dynamics_character.wasm`
- `wasm/dynamics-degrade` -> `public/worklets/kessho_dynamics_degrade.wasm`

Observed worklet/processor mapping:

- `pad-synth-wasm.worklet.js` registers `pad-synth-wasm`.
- `lead-fm-wasm.worklet.js` registers `lead-fm-wasm`.
- `drum-synth-wasm.worklet.js` registers `drum-synth-wasm`.
- `granular-fx-wasm.worklet.js` registers `granular-fx-wasm`.
- `reverb-wasm.worklet.js` registers `reverb-wasm`.
- `spectral-freeze-wasm.worklet.js` registers `spectral-freeze-wasm`.
- `soundscapes-wasm.worklet.js` registers `soundscapes-wasm`.
- `dynamics-character.worklet.js` is loaded with
  `kessho_dynamics_character.wasm` and can fall back to pass-through gain.
- `recorder-tap.worklet.js` registers `kessho-recorder-tap`.

Pure or mostly Web Audio/TypeScript paths still exist around the worklet graph:
transport, harmony/progression, sequencing and evolve logic, delay bus routing,
sample playback for piano and earth/waves assets, recording taps, state
serialization, preset/morph selection, and parameter smoothing/dirty dispatch.

Native shell pieces currently observed:

- `CapacitorMac/`: local SwiftPM macOS wrapper for the built web app.
- `ios/App/`: Capacitor iOS app shell.
- `plugins/kessho-capacitor-midi-routing/`: local Capacitor CoreMIDI bridge.
- `plugins/kessho-capacitor-audio-session/`: Capacitor iOS audio-session bridge.
- `KesshoNativeSwift/`: separate SwiftUI/native harness with native audio/DSP files.
- `src/native/capacitorMidiRouting.ts`: React-side bridge/profile helpers.
- `src/native/capacitorAudioSession.ts`: React-side audio-session diagnostic,
  Now Playing, and remote-command helpers.
- `src/native/capacitorMacShell.ts`: macOS shell status/playback bridge.

Capacitor config includes the audio-session and MIDI routing plugins for iOS.
The audio-session plugin configures `AVAudioSession` for background playback,
but this pass did not validate
screen-off behavior.

## Preset And Category Facts

Factory preset loading currently seeds several preset levels:

- L1 engine presets: pad, drum voices, water, Euclidean patterns, delay Echo
  Line, delay Clocked Space, and dynamics engines.
- L2 kit presets: delay kit, drum kit, earth kit.
- L3 source presets: reverb, granular, delay, drums, synth, dynamics.
- L4 state presets: loaded from `/presets/manifest.json`; current manifest has
  an empty `files` array.
- Journey is represented in the preset type model, but no stock journey preset
  file was found in this pass.

Native Swift harness presets exist under `KesshoNativeSwift/Kessho/Presets/`, including
`Gamelan Test`, `String Waves`, `Dark Textures`, `Wave Out`, `Bright Bells`,
`Ethereal Ambient`, and several ZoneOut variants.

## Golden Preset Candidates

These are candidates for the full C0 capture set. They are chosen to cover
different CPU and sonic-risk surfaces, not because they were rendered in this
pass.

| Scenario | Candidate | Source | Why |
| --- | --- | --- | --- |
| Low CPU ambient pad | `Ethereal Ambient` | native harness state preset | Representative ambient state with moderate granular/reverb sends. |
| Dense pad + reverb | `Dark Textures` | native harness state preset | Heavier texture/reverb candidate for parity and headroom checks. |
| Granular-heavy | `Wave Out` | native harness state preset or granular factory source preset | Explicit granular-enabled state and granular send coverage. |
| Drums-heavy | `Full Matrix` plus active drum kit/voice presets | delay kit + drum factory presets | Exercises drum WASM, delay feedback, and routing density. |
| Earth/water-heavy | `Full Nature` or `Water Only` | earth kit / water factory presets | Exercises soundscapes WASM and sample/earth bus routing. |
| Delay-heavy | `Wide Grain`, `Dual Feedback`, or `Full Matrix` | delay factory presets | Exercises delay bus routing, feedback, saturation, and granular return linkage. |
| Dynamics-heavy | `Degenerate Gain`, `Worn VHS`, `Abyss Water LPG`, `Granular Pocket` | dynamics factory presets | Exercises dynamics character/degrade/sidechain surfaces. |
| Journey/morph | two-state morph between `Ethereal Ambient` and `Dark Textures` | journey runtime | No stock journey preset observed; use runtime morph as temporary golden until a saved journey exists. |

## Current MIDI Behavior

Observed code supports a native Capacitor MIDI routing bridge rather than a
browser WebMIDI path. The bridge discovers CoreMIDI inputs, connects selected
sources, emits normalized messages into React, stores a local routing profile,
and maps CC/note/pressure/pitch-bend style values to registered parameter
targets. The separate SwiftUI harness also contains CoreMIDI manager and mapping
types.

The additive KesshoCore C ABI can now accept normalized MIDI events with source
id, sample offset, status, channel, data bytes, normalized value, and raw bytes.
Native and WASM smoke tests prove those events can be queued and consumed, but
the production hardware path has not yet been jitter-profiled.

This pass did not connect hardware or measure MIDI jitter. For the C++ backbone
goal, MIDI timestamp-domain calibration and queue ownership remain a major
parity/CPU risk until hardware captures compare the C++ event queue against the
older JS/UI bridge.

## CPU, Glitch, And Background Notes

Product browser/macOS CPU was not manually measured. The app has a `CpuOverlay`
fed by per-worklet perf messages for WASM engines and soundscape sub-engines,
which should be used for browser baseline captures. The current offline C7
module-preview gate measures the core WASM selected-preset path against the
AudioWorklet realtime budget, but this is not a replacement for browser/device
captures.

Known-risk areas from architecture shape:

- Many worklet islands have separate init, message, memory, and teardown
  contracts; shared-core migration must avoid forking behavior.
- Transport, sequencing/evolve, parameter smoothing, and routing ownership are
  still TypeScript-side and can drift from native timing if not moved carefully.
- KesshoCore event dispatch no longer scans the full queue for every sample, and
  C5 now has beat/bar/phrase reporting plus deterministic seed state. Production
  JS/CoreMIDI adapters still need to push real app events into the shared queue.
- Capacitor audio-session bridge state exists, but screen-off playback was not
  verified in this pass.
- `npm run cap:mac:build` depends on the current dirty web/native tree and can
  expose unrelated concurrent failures.

## Next Task

Continue C7/C11 by using the new pad tap ABI as the next routing migration
prerequisite, then start golden-preset render/profile captures against the
legacy Web Audio product path. The current browser core path now has a real
wrapped-pad moving source preview, dynamics-character coloration, identity C++
mixer routing, and exact pad multi-tap parity, while the deterministic smoke
preview remains in offline gates as a fallback/probe. This is still not full
preset audio parity: dynamics-degrade, reverb, granular, spectral-freeze,
lead-fm, pad, drum, and soundscapes module parity exists, but the full product
source/effect routing graph still needs to move behind the shared core. Full
C0/C9 also remains open until browser/macOS CPU/audio captures and MIDI jitter
captures are recorded for the golden candidate set above.
