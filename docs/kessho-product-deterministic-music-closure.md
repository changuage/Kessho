# Product Core Deterministic Music Closure

This gate locks down the first deterministic music and journey ownership contracts that must hold before broader musical parity work can continue.

## Covered

- RNG call-order contract: generated event values are derived from stable lane/step/component/bar/phrase seeds, so skipping an earlier step does not perturb later step values.
- RNG transaction trace: the native test independently recomputes velocity, morph, distance, and expression seeds for a known event and compares them to generated Product Core events.
- Voicing depth: Product Core emits the first seven major scale degrees through the C++ harmony/voicing path rather than a root/third-only smoke check.
- Phrase mutation writes: evolution state and amount produce changed sequencer event values across a phrase boundary.
- Journey morph ownership: Product Core advances journey phase during render from its own transport/sample clock and reports the advanced phase through telemetry.
- Native-vs-WASM event timeline: the deterministic gate loads the committed WASM artifact, builds the same generated snapshot ABI fixture, and verifies the exact four-event 16th-note timeline against the native Product Core contract.

## Guardrail

`npm run core:product:determinism` runs the native `ProductDeterminismTests` binary and the WASM timeline fixture. The gate must run after `npm run core:build:wasm` so the committed Product Core WASM artifact is available.

## Remaining Work

- Random lead/piano phrase generation is still primarily represented in the old web host and needs Product Core-owned phrase scheduling.
- Journey preset graph/state transitions beyond morph phase/rate still need full C++ ownership.
- Native-vs-WASM timeline coverage should expand from the deterministic synth event fixture to multi-lane synth/drum timelines once the remaining source and arrangement parity probes are stable.
