# KesshoCore Parity Completion Audit

Generated: 2026-05-07T01:11:19Z

Objective: bring the Kessho C++ core backbone to webapp parity with repeatable self-checks, covering browser web/core sonic acceptance, pad and FX parity, remaining source/routing gaps, and regression tests that prove readiness.

## Completion Criteria

| Requirement | Required evidence | Current evidence | Status |
| --- | --- | --- | --- |
| Browser web/core sonic acceptance | Browser corpus passes for pad, FX, source, and full-mix slices with no setup failures or hidden known failures. | Pad slice browser readiness passed earlier. Latest full browser readiness attempt against `http://127.0.0.1:4176/` failed before corpus cases ran because the runner's URL setup check reported `TypeError: fetch failed`; direct `curl -I -s http://127.0.0.1:4176/` returned `200 OK`, and the required escalated rerun was rejected by the app usage-limit guard. | Incomplete |
| Pad parity | Dry Pad 1, dry Pad 2, simple pad chord, and pad plus shared reverb tail pass browser corpus and module gates. | `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --slice=pad --url=http://127.0.0.1:4173/` passed before browser escalation was blocked. `pad-reverb-tail` is now expected pass in the corpus. | Complete for pad slice |
| FX parity | Dynamics, reverb, granular, spectral freeze, Delay A, and Delay B module checks pass; FX browser corpus cases pass and are promoted from `candidate` to `pass`. | Non-browser module checks pass in `node scripts/check-kessho-core-parity-readiness.mjs --skip-browser-corpus`. Core host now configures granular routing, spectral freeze pre/post reverb routing, and native Delay B routing through the C++ eight-tap diffuse/warp module. FX browser cases remain unrun and still candidate-labeled in this audit. | Incomplete |
| Remaining source/routing gaps | Lead, drums, soundscapes, MIDI events, and routed browser corpus source cases pass and are promoted from `candidate` to `pass`. | Lead/drum/soundscapes modules and MIDI contract pass in non-browser readiness. Manual `lead1`/`lead2` core host support now layers lead as an aux source instead of replacing pad/drum/soundscape sources. The core host also layers drum and soundscapes aux sources, maps drum Euclidean loop notes, maps water/insects params, arms ocean surf and deterministic nature surrogates for bird/frog states, and self-checks module types 8/9 plus aux dry/FX sends in `scripts/check-core-engine-host.mjs`. Source browser cases remain unrun and still candidate-labeled in this audit. | Incomplete |
| Regression readiness | Readiness runner fails honestly for setup/sonic failures, distinguishes skipped browser checks, cannot mark slice-limited evidence as full-objective readiness, and cannot treat candidate-labeled required cases as final proof. | `scripts/check-kessho-core-parity-readiness.mjs` now reports `sliceCoverage`, counts candidate checks, and marks full readiness incomplete unless all slices are selected, browser checks run/pass, and required cases are promoted past `candidate`. | Complete for runner semantics |
| Repeatable self-checks | Corpus/readiness/module checks can be rerun from scripts and reports include rerun commands. | `profile-kessho-core-acceptance-corpus.mjs --self-check` passes. Latest readiness report includes selected and full objective browser rerun commands. | Complete for current gates |

## Verified Commands

- `npm run type-check` passed.
- `npm run core:test` passed.
- `npm run core:host` passed.
- `npm run core:ci` passed, including native/WASM build, module parity checks, Delay A regression, Delay B regression, and web module preview.
- `npm run core:lead-fm-module-parity` passed.
- `npm run core:drum-module-parity` passed.
- `npm run core:soundscapes-module-parity` passed, including water, insects, ocean-surf surrogate, and nature-texture surrogate cases.
- `node scripts/check-kessho-core-granular-module-parity.mjs` passed.
- `node scripts/check-kessho-core-spectral-freeze-module-parity.mjs` passed.
- `node scripts/check-kessho-core-delay-b-module-regression.mjs` passed: native Delay B emitted checked main/reverb/Delay A/granular taps and muted cleanly when disabled.
- `node scripts/check-core-engine-host.mjs` passed with checked deferred granular/Delay B feed into Delay A.
- `npm run core:reverb-module-parity` passed, including `pad-reverb-chain-tail`.
- `node scripts/profile-kessho-core-acceptance-corpus.mjs --self-check` passed.
- `node scripts/check-kessho-core-parity-readiness.mjs --self-check` passed.
- `node --check scripts/check-kessho-core-parity-readiness.mjs` passed after the browser setup command reporting cleanup.
- `node scripts/check-kessho-core-parity-readiness.mjs --skip-browser-corpus` passed with full slice coverage, FX Slice `pass 6`, and readiness `INCOMPLETE` because browser corpus was skipped and FX/source/full required cases remain candidate-labeled.
- `npm run core:readiness:browser -- --url=http://127.0.0.1:4176/` failed at browser setup before any corpus cases ran. Latest readiness report records `Browser corpus URL is not reachable from Node fetch: fetch failed`, and now reports the exact Node fetch setup probe instead of a misleading curl command.
- `curl -I -s http://127.0.0.1:4176/` returned `200 OK` outside the readiness runner, so the app was live while the runner's Node setup probe was blocked.
- `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --slice=pad --url=http://127.0.0.1:4173/` passed before the browser-run blocker.
- `node scripts/clean-local-generated.mjs` removed generated `build` output after local smoke/readiness checks.
- `node scripts/clean-local-generated.mjs` found no local generated output during the repo cleanup pass.

## Current Blocker

Further browser corpus runs for FX, source, and full-mix slices are blocked by the environment rejecting escalated browser execution with a usage-limit guard. The local Vite server is currently known to answer on port `4176`; the next required command after the guard clears is:

```sh
npm run core:readiness:browser -- --url=http://127.0.0.1:4176/
```

Until that full browser corpus passes, the active goal is not complete.

## Known Remaining Backbone Gaps

- Delay B now has a native C++ eight-tap diffuse/warp module with checked main, reverb-send, Delay A cross-feed, and granular-send taps; browser corpus promotion is still pending.
- Full earth browser parity is still unproven: the core now maps ocean/waves to the soundscapes surf engine and maps birds/birds2/frogs to deterministic nature surrogates, but it does not embed or decode the webapp's OGG sample textures inside the C++ core.
- Granular output and Delay B cross-feed now return into Delay A through a deferred worklet input buffer; browser corpus promotion is still pending for routed FX cases.
- Browser corpus execution remains the only acceptable promotion path for required candidate FX/source/full-mix cases.
