# KesshoCore Parity Completion Audit

Generated: 2026-05-08

Objective: keep the Kessho C++ core backbone at practical webapp sonic parity with repeatable self-checks, covering browser web/core sonic acceptance, module parity, source/routing coverage, and regression tests that prove readiness.

## Completion Criteria

| Requirement | Required evidence | Current evidence | Status |
| --- | --- | --- | --- |
| Browser web/core sonic acceptance | Browser corpus passes for pad, FX, source, and full-mix slices with no setup failures or hidden known failures. | `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --url=http://127.0.0.1:4173/` passes with readiness `PASS`, coverage `COMPLETE`, and zero failed checks. | Complete |
| Pad parity | Dry Pad 1, dry Pad 2, simple pad chord, dense dark pad, and pad plus shared reverb tail pass browser corpus and module gates. | Pad slice passes all 6 checks. `pad-simple-dry` is stable after Core manual pad batches were aligned with the webapp's batched audition path, and `pad-dark-dense` guards the Core worklet's Web Audio post-filter Q match. | Complete |
| FX parity | Dynamics, reverb, granular, spectral freeze, Delay A, and Delay B module checks pass; FX browser corpus cases pass as required cases. | FX slice passes all 11 checks, including Delay A/B module regressions and the granular browser routes. | Complete |
| Remaining source/routing gaps | Lead, synth Euclidean lanes, drums, soundscapes, MIDI events, ocean hybrid routing, and routed browser corpus source cases pass as required cases. | Source slice passes 12 checks, including lead, synth Euclid lead-grid, drum, soundscape modules, MIDI event contract, drum transient gates, earth/soundscape browser cases, and the ocean bed plus sparse pad probe. | Complete |
| Full-mix readiness | Representative full-mix presets pass without silent enabled sources or core-output failures. | Full Mix slice passes all 7 checks, including snapshot/host contracts, native/WASM render parity, web module preview, and both full-mix browser corpus cases. | Complete |
| Regression readiness | Readiness runner fails honestly for setup/sonic failures and cannot mark skipped or slice-limited evidence as full-objective readiness. | `node scripts/check-kessho-core-parity-readiness.mjs --self-check` passes. Latest report records runner command, coverage, slice statuses, and rerun commands. | Complete |
| Repeatable self-checks | Corpus/readiness/module checks can be rerun from scripts and reports include rerun commands. | Corpus, readiness, host, type, and browser corpus commands pass locally and write reproducible reports under `docs/reports/`. | Complete |

## Verified Commands

- `node scripts/profile-kessho-core-acceptance-corpus.mjs --write` regenerated the acceptance corpus report.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --self-check` passed.
- `node scripts/check-kessho-core-parity-readiness.mjs --self-check` passed.
- `npm run type-check` passed.
- `npm run core:host` passed.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=synth-euclid-lead-grid --url=http://127.0.0.1:4173/ --print-transients` passed in the browser corpus and validates the recovered synth Euclidean lead-grid gap.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=drum-euclid-tight --url=http://127.0.0.1:4173/ --print-transients --no-fail` passed under the documented browser scheduler jitter gate.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-simple-dry --url=http://127.0.0.1:4173/ --print-transients --no-fail` passed twice after the Core manual pad batch fix.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-dark-dense --url=http://127.0.0.1:4173/ --print-transients` passed after aligning the Core post-chain lowpass Q with the webapp's `BiquadFilterNode`.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=soundscape-ocean-pad --url=http://127.0.0.1:4173/ --print-transients` passed after promoting the ocean hybrid probe to required source coverage with an envelope gate.
- `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --url=http://127.0.0.1:4173/` passed with full objective readiness, complete slice coverage, and zero failed checks.

## Current Status

There is no active parity blocker for the browser Web Audio versus KesshoCore WASM objective. The current `latest` readiness report is the source of truth:

- Markdown: `docs/reports/kessho-core-parity-readiness-latest.md`
- JSON: `docs/reports/kessho-core-parity-readiness-latest.json`

## Remaining Non-Blocking Debt

- Device-specific iOS/macOS Capacitor CPU, battery, route-change, and screen-off behavior are outside the browser sonic parity gate and still need device profiling before release claims.
- The corpus is practical parity, not bit-exact parity. Stochastic earth/soundscape, drum sequencer, granular feedback, and full-mix cases intentionally use transient or envelope gates where sample correlation is not meaningful.
- Earth/soundscape browser parity uses deterministic generated/surrogate coverage; embedding or decoding the webapp's sampled OGG nature textures inside the C++ core remains a separate product/performance decision.
- Synth Euclidean lead-grid coverage is now represented in the browser corpus; richer sub-lane evolve/piano-source behavior remains outside the current practical parity gate.
