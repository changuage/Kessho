# KesshoCore Parity Readiness

Generated: 2026-05-07T04:53:59.211Z

Run command: `node scripts/check-kessho-core-parity-readiness.mjs --url=http://127.0.0.1:4176/ --slice=all`

Overall check status: **PASS**

Full objective readiness status: **PASS**

Objective slice coverage: **COMPLETE** (pad, fx, source, full)

Browser corpus: run against http://127.0.0.1:4176/

## Rerun Commands

Non-browser backbone: `npm run core:readiness -- --skip-browser-corpus`

Selected browser corpus: `npm run core:readiness:browser -- --url=http://127.0.0.1:4176/`

Full objective browser corpus: `npm run core:readiness:browser -- --url=http://127.0.0.1:4176/`

## Slice Status

| Slice | Check Status | Full Readiness | Passed | Failed | Known Failed | Candidate | Skipped |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Pad Slice | PASS | PASS | 5 | 0 | 0 | 0 | 0 |
| FX Slice | PASS | PASS | 11 | 0 | 0 | 0 | 0 |
| Source Slice | PASS | PASS | 10 | 0 | 0 | 0 | 0 |
| Full Mix Slice | PASS | PASS | 7 | 0 | 0 | 0 | 0 |

## Setup Checks

| Status | Check | Duration | Rerun / Reason |
| --- | --- | ---: | --- |
| PASS | Acceptance corpus contract | 30ms | `node scripts/profile-kessho-core-acceptance-corpus.mjs --json` |
| PASS | Browser corpus URL | 13ms | `node -e 'fetch(process.argv[1]).then((response)=>{console.log("HTTP " + response.status); process.exit(response.ok ? 0 : 1);}).catch((error)=>{console.error(error); process.exit(1);})' http://127.0.0.1:4176/` |

## Corpus Contract

Status: **PASS**

Command: `node scripts/profile-kessho-core-acceptance-corpus.mjs --json`

Cases available: 19

## Pad Slice

Target: Core pad source is close enough for migration of pad-only playback.

Pass definition: Dry pad, Pad 2, and shared reverb-tail gates pass with shared-start manual pad notes and no page errors.

Boundary definition: No open pad-slice boundary case remains after deterministic pre-reverb conditioning and input-synchronous reverb reset.

| Status | Kind | Check | Duration | Rerun / Reason |
| --- | --- | --- | ---: | --- |
| PASS | module | Pad module parity | 41ms | `node scripts/check-kessho-core-pad-module-parity.mjs` |
| PASS | corpus (required) | default-pad-dry: Default pad dry | 14.1s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=default-pad-dry --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | default-pad2-dry: Default Pad 2 dry | 14.1s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=default-pad2-dry --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | pad-simple-dry: Simple dry pad | 14.5s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-simple-dry --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | pad-reverb-tail: Pad plus long reverb tail | 21.9s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-reverb-tail --url=http://127.0.0.1:4176/` |

## FX Slice

Target: Core shared FX and master chain are close enough when fed by pad/manual deterministic input.

Pass definition: All required close/perceptual cases pass, using envelope gates for feedback-heavy tails where sample correlation is not meaningful.

| Status | Kind | Check | Duration | Rerun / Reason |
| --- | --- | --- | ---: | --- |
| PASS | module | Dynamics module parity | 55ms | `node scripts/check-kessho-core-dynamics-module-parity.mjs` |
| PASS | module | Reverb module parity | 138ms | `node scripts/check-kessho-core-reverb-module-parity.mjs` |
| PASS | module | Granular module parity | 49ms | `node scripts/check-kessho-core-granular-module-parity.mjs` |
| PASS | module | Spectral freeze module parity | 52ms | `node scripts/check-kessho-core-spectral-freeze-module-parity.mjs` |
| PASS | module | Delay A module regression | 46ms | `node scripts/check-kessho-core-delay-a-module-regression.mjs` |
| PASS | module | Delay B module regression | 33ms | `node scripts/check-kessho-core-delay-b-module-regression.mjs` |
| PASS | corpus (required) | pad-delay-pingpong: Pad into ping-pong Delay A | 17.9s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-delay-pingpong --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | pad-delay-reverb-bloom: Pad delay into reverb bloom | 22.1s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-delay-reverb-bloom --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | granular-pad-cloud: Pad-fed granular cloud | 24.8s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=granular-pad-cloud --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | granular-delay-return: Delay returns through granular | 24.7s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=granular-delay-return --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | dynamics-master-chain: Pad through dynamics and master chain | 22.0s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=dynamics-master-chain --url=http://127.0.0.1:4176/` |

## Source Slice

Target: Core non-pad sources are close enough for lead, drums, and earth/soundscape migration.

Pass definition: All deterministic source cases pass; stochastic drum and earth cases pass documented transient/envelope gates.

| Status | Kind | Check | Duration | Rerun / Reason |
| --- | --- | --- | ---: | --- |
| PASS | module | Lead FM module parity | 43ms | `node scripts/check-kessho-core-lead-fm-module-parity.mjs` |
| PASS | module | Drum module parity | 41ms | `node scripts/check-kessho-core-drum-module-parity.mjs` |
| PASS | module | Soundscapes module parity | 163ms | `node scripts/check-kessho-core-soundscapes-module-parity.mjs` |
| PASS | module | Core MIDI event contract | 138ms | `node scripts/check-core-midi-events.mjs` |
| PASS | corpus (required) | lead-manual-dry: Manual dry lead | 13.0s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=lead-manual-dry --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | lead-delay-heavy: Lead into heavy Delay A | 19.2s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=lead-delay-heavy --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | drum-euclid-tight: Tight Euclidean drum kit | 18.8s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=drum-euclid-tight --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | drum-delay-dub: Dubbed-out drum delay | 21.2s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=drum-delay-dub --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | earth-water-only: Water-only earth bed | 27.2s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=earth-water-only --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | earth-full-nature: Full nature earth kit | 32.6s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=earth-full-nature --url=http://127.0.0.1:4176/` |

## Full Mix Slice

Target: Core is close enough for representative webapp states and migration can proceed.

Pass definition: Full-mix cases have no block failures, no silent enabled sources, and pass scoped perceptual/manual-review scoring.

| Status | Kind | Check | Duration | Rerun / Reason |
| --- | --- | --- | ---: | --- |
| PASS | module | Core snapshot contract | 156ms | `node scripts/check-core-snapshot-contract.mjs` |
| PASS | module | Core engine host contract | 42ms | `node scripts/check-core-engine-host.mjs` |
| PASS | module | Core smoke test | 5.1s | `node scripts/test-kessho-core.mjs` |
| PASS | module | Native/WASM render parity | 4.5s | `node scripts/check-kessho-core-render-parity.mjs` |
| PASS | module | Core web module preview | 83ms | `node scripts/check-kessho-core-web-module-preview.mjs` |
| PASS | corpus (required) | full-mix-gamelan: Gamelan full mix | 32.0s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=full-mix-gamelan --url=http://127.0.0.1:4176/` |
| PASS | corpus (required) | full-mix-dark-ambient: Dark ambient full mix | 32.4s | `node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=full-mix-dark-ambient --url=http://127.0.0.1:4176/` |

## Machine-Readable Pair

JSON: `docs/reports/kessho-core-parity-readiness-latest.json`
