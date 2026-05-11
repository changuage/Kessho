# KesshoCore Parity Completion Audit

Generated: 2026-05-11

Objective: keep the Kessho C++ core backbone at practical webapp sonic and architecture parity with repeatable self-checks, covering browser web/core sonic acceptance, module parity, source/routing coverage, host sample bridges, shared FX routing, native/web integration, CPU-sensitive paths, and regression tests that prove readiness.

## Completion Criteria

| Requirement | Required evidence | Current evidence | Status |
| --- | --- | --- | --- |
| Browser web/core sonic acceptance | Browser corpus passes for pad, FX, source, and full-mix slices with no setup failures or hidden known failures. | `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus` passes with readiness `PASS`, coverage `COMPLETE`, and zero failed checks against `http://127.0.0.1:4173/`. | Complete |
| Pad parity | Dry Pad 1, dry Pad 2, simple pad chord, dense dark pad, and pad plus shared reverb tail pass browser corpus and module gates. | Pad slice passes all 6 checks. `pad-simple-dry` is stable after Core manual pad batches were aligned with the webapp's batched audition path, and `pad-dark-dense` guards the Core worklet's Web Audio post-filter Q match. | Complete |
| FX parity | Dynamics, reverb, granular, spectral freeze, Delay A, and Delay B module checks pass; FX browser corpus cases pass as required cases. | FX slice passes all 11 checks, including Delay A/B module regressions, granular routes, and feedback-tail envelope gates. | Complete |
| Remaining source/routing gaps | Lead, piano, synth Euclidean lanes, drums, soundscapes, sampled Earth textures, MIDI events, ocean hybrid routing, and routed browser corpus source cases pass as required cases. | Source slice passes all 13 checks, including lead, piano host sample bridge, synth Euclid lead-grid, drum, soundscape modules, MIDI event contract, drum transient gates, earth/soundscape browser cases, and the ocean bed plus sparse pad probe after Web/Core host texture scheduling was moved onto matched seeded RNG. | Complete |
| Full-mix readiness | Representative full-mix presets pass without silent enabled sources or core-output failures. | Full Mix slice passes all 8 checks, including snapshot/host contracts, architecture parity audit, native/WASM render parity, web module preview, and both full-mix browser corpus cases. | Complete |
| Architecture parity | Required Core/Webapp differences are audited outside the browser corpus matrix and cannot hide as open debt or surrogates. | `node scripts/audit-kessho-core-architecture-parity.mjs` passes with 16 pass, 0 debt, 0 surrogate, and 0 fail rows. | Complete |
| Host sample texture parity | Webapp OGG piano and Earth texture sources either run through Core mode or have explicit CPU-safe host bridges into the Core graph. | Sampled piano and Earth texture players stay host-side for decode/CPU safety, feed Core dry output plus shared Core reverb, Delay A/B, and granular external input buses, and use matched seeded slice RNG so stochastic ocean/nature peaks do not hide Web/Core drift. | Complete |
| CPU-sensitive parity | Browser Core mode and native hot paths expose or guard CPU-sensitive behavior. | Architecture audit covers worklet CPU telemetry, bounded host sample cache use, no idle piano scheduler without notes, and native mobile hotpath checks. | Complete |
| Regression readiness | Readiness runner fails honestly for setup/sonic failures and cannot mark skipped or slice-limited evidence as full-objective readiness. | `node scripts/check-kessho-core-parity-readiness.mjs --self-check` passes. Latest report records runner command, coverage, slice statuses, and rerun commands. | Complete |
| Repeatable self-checks | Corpus/readiness/module checks can be rerun from scripts and reports include rerun commands. | Corpus, readiness, host, type, and browser corpus commands pass locally and write reproducible reports under `docs/reports/`. | Complete |

## Verified Commands

- `npm run type-check` passed.
- `npm run core:architecture-parity` passed with 16 pass, 0 debt, 0 surrogate, and 0 fail rows.
- `npm run core:host` passed.
- `node scripts/check-web-core-sonic-parity.mjs --self-check` passed.
- `node scripts/check-kessho-core-parity-readiness.mjs --self-check` passed.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --self-check` passed.
- `npm run core:drum-module-parity` passed.
- `npm run core:browser-sonic-parity` passed with the deterministic manual pad mix probe.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --url=http://127.0.0.1:4173/` passed all 21 browser corpus cases.
- `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus` passed with full objective readiness, complete slice coverage, and zero failed checks.

## Current Status

There is no active parity blocker for the browser Web Audio versus KesshoCore WASM objective. The current `latest` readiness and architecture reports are the source of truth:

- Markdown: `docs/reports/kessho-core-parity-readiness-latest.md`
- JSON: `docs/reports/kessho-core-parity-readiness-latest.json`
- Architecture Markdown: `docs/reports/kessho-core-architecture-parity-latest.md`
- Architecture JSON: `docs/reports/kessho-core-architecture-parity-latest.json`

## Remaining Non-Blocking Debt

- Device-specific iOS/macOS Capacitor CPU, battery, route-change, and screen-off behavior are outside the browser sonic parity gate and still need device profiling before release claims.
- The corpus is practical parity, not bit-exact parity. Stochastic earth/soundscape, drum sequencer, granular feedback, and full-mix cases intentionally use transient or envelope gates where sample correlation is not meaningful.
- Sampled piano and sampled Earth texture parity is intentionally implemented as CPU-safe host decode/playback feeding Core dry and shared FX buses, not as in-Core OGG decoding.
- Product Core migration is audited as adjacent work: web `core-product` remains selectable and its disabled-FX snapshot routing gap has been patched, but it is not the web parity default until focused Product-vs-Web sonic probes pass source level/timbre/correlation gates.
