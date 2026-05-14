# Kessho Project Structure

This workspace currently carries two active product builds and one shared
engine track. Keep their roles separate so the C++ backbone migration can move
without blurring the production web app, Capacitor shells, and paused native
Swift work.

## Runtime Lanes

### `?engine=web`

This is the production baseline. Normal app loads and `?engine=web` must keep
using the existing React UI and TypeScript/Web Audio conductor in `src/audio`.

Ownership:

- `src/App.tsx`
- `src/audio/engine.ts`
- `src/audio/runtime.ts`
- `src/ui/**`
- `public/worklets/kessho_*.wasm`

Rules:

- Keep this path as the default until replacement parity is proven.
- Avoid changing web behavior only to satisfy an experimental host.
- Use this path as the reference for presets, routing, and UI behavior.

### `?engine=core-product`

This is the experimental shared C++ backbone running through WASM and an
AudioWorklet. It must stay opt-in behind the query parameter until golden
preset, CPU, MIDI, and browser audio parity are captured.

Ownership:

- `cpp/KesshoCore/**`
- `src/audio/coreEngineHost.ts`
- `src/audio/coreSnapshot.ts`
- `src/audio/coreMidiEvents.ts`
- `public/worklets/kessho-core.worklet.js`
- `public/worklets/kessho_core.wasm`
- `scripts/*kessho-core*.mjs`
- `scripts/check-core-*.mjs`

Rules:

- Keep the web engine switch narrow and easy to audit.
- New C++ render-thread code must avoid allocation, locking, logging, file IO,
  and JSON parsing.
- Add or update parity gates before expanding the core path's responsibility.

### Kessho Capacitor

This is the packaged webapp for iOS/macOS shells. Capacitor owns platform
services, not a separate audio product.

Ownership:

- `CapacitorMac/**`
- `ios/App/**`
- `plugins/kessho-capacitor-audio-session/**`
- `plugins/kessho-capacitor-midi-routing/**`
- `src/native/**`

Rules:

- Treat Capacitor as a product shell around the web UI.
- CoreMIDI, audio-session metadata, remote controls, app identity, and packaging
  are Capacitor concerns.
- Audio behavior should converge through the shared Kessho Core. Today that is
  the web/Core WASM lane; future iOS background audio should use a thin native
  host around the same C++ core, not the paused Swift engine.

### Paused Native iOS And macOS

This is the stopped SwiftUI/native port. Keep it separate from active
Capacitor work.

Ownership:

- `KesshoNativeSwift/**`
- `docs/kessho-native-swift/**`
- `scripts/check-native-swift-*.mjs`

Rules:

- Treat `KesshoNativeSwift` as paused native Swift port/reference code.
- Do not wire new Capacitor or C++ core work through `KesshoNativeSwift`.
- If native Swift work resumes later, split it into its own named change set.

### Dev Harnesses

Development-only browser harnesses that should not ship from Vite `public/`
live in:

- `dev/harnesses/**`

## Artifact Policy

Track source, build scripts, runtime assets, and parity fixtures. Do not track
local build output or intermediate compiler products.

Tracked runtime artifacts:

- `public/worklets/*.wasm`
- `public/worklets/*.worklet.js`

Generated and ignored artifacts:

- `build/`
- `dist/`
- `KesshoNativeSwift/.build/`
- `CapacitorMac/.build/`
- `CapacitorMac/.swiftpm/`
- `ios/App/CapApp-SPM/.swiftpm/`
- `wasm/*/*.wasm`
- `wasm/*/*.o`
- `wasm/build_out.txt`
- `wasm/*/build_log.txt`
- `tsc_*.txt`
- `wasm_build_log.txt`
- `wasm_check.txt`

The `wasm/*` directories are source islands and standalone builders. Their
module-local `.wasm` files are intermediate outputs; the web app consumes the
copied runtime binaries in `public/worklets`.

Use this command to clear local generated output without deleting dependencies,
toolchains, samples, or virtualenvs:

```sh
npm run clean:local
```

## Suggested Commit Boundaries

Use these boundaries when splitting large work:

1. Web engine host switch.
2. C++ backbone and core build/parity scripts.
3. Standalone WASM DSP source refactors.
4. Capacitor iOS/macOS shell and native plugins.
5. Paused native SwiftUI harness cleanup, only when intentionally touched.
6. Docs, generated-output cleanup, and ignore rules.

## Verification Lanes

Fast daily checks:

```sh
npm run type-check
npm run core:host
npm run core:snapshot
npm run core:midi
```

Core migration checks:

```sh
npm run core:ci
```

Release/readiness checks:

```sh
npm run build
npm run cap:mac:build
```

Use real devices for hardware MIDI, iOS screen-off/background audio, and
thermal/battery validation.
