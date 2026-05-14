# Kessho Project Structure

This workspace carries the Product Core runtime, an explicit Web TS reference
runtime, Capacitor shells, and a paused native Swift line. Keep their roles
separate so cleanup does not blur product code, reference code, and packaging
code.

## Runtime Lanes

### `core-product`

This is the default product runtime. Normal app loads use Product Core unless a
query parameter explicitly selects another runtime.

Ownership:

- `src/App.tsx`
- `src/audio/runtime.ts`
- `src/audio/coreProduct*.ts`
- `src/audio/CoreProduct*.ts`
- `src/audio/generated/**`
- `cpp/KesshoCore/**`
- `public/worklets/kessho-core-product.worklet.js`
- `public/worklets/kessho_core.wasm`
- `scripts/check-kessho-product*.mjs`
- `scripts/run-kessho-product-ci.mjs`

Rules:

- Keep Product Core as the default browser runtime.
- Keep musical behavior in Product Core, not in host-side fallback code.
- Product checks should guard runtime ownership, CPU budget, generated schema,
  assets, native bridge, and browser default behavior.

### `web-ts`

This is the explicit TypeScript/Web Audio reference runtime. It remains useful
for comparison and preserving the original webapp line, but it is not the
default product path.

Ownership:

- `src/audio/engine.ts`
- `src/audio/drumSynth.ts`
- `src/audio/lead4opfm.ts`
- `src/audio/drumSequencer.ts`
- `src/audio/earthTexturePlayer.ts`
- `src/ui/**`
- `public/worklets/kessho_*.wasm`

Rules:

- Do not change Web TS behavior as a side effect of Product Core cleanup.
- Keep this runtime explicit and auditable.
- Reference-only scripts and docs should not become Product Core gates.

### `core-smoke`

This is a development smoke renderer for the old bridge path.

Rules:

- Keep it explicit and development-only.
- Do not let smoke-renderer behavior stand in for Product Core product behavior.

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
- Audio behavior should converge through Product Core. iOS background audio
  should use a thin native host around the same C++ core, not the paused Swift
  engine.

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
- `docs/reports/`
- `docs/ui-audit/`
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
2. Product Core build and runtime contract scripts.
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

Product Core checks:

```sh
npm run core:product:ci
```

Release/readiness checks:

```sh
npm run build
npm run cap:mac:build
```

Use real devices for hardware MIDI, iOS screen-off/background audio, and
thermal/battery validation.
