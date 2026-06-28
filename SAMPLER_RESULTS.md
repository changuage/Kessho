# Product Core Sampler Results

## Scope
- Branch: product-core-sample-slots
- Commit: ff480eb79a1f75a59cd2b0e15154d7b15d783b04
- Date: 2026-06-28T07:35:10Z
- Phases attempted: Phase 0, Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7

## Gate status
| Gate | Status | Evidence |
|---|---:|---|
| Pre-sampler hardening gate before Phase 3 | READY | `PRE_SAMPLER_HARDENING_RESULTS.md` exists and records the pre-render gate as ready. |
| Product Core sampler rendering | COMPLETE | Product Core source IDs/schema include `sample1` and `sample2`; C++ resolver/render path uses generated sample metadata; host only predicts/fetches/decodes/registers assets. |
| Post-sampler hardening handoff | READY | Phase 7 cleanup/guardrails are implemented and the post-sampler hardening plan is now in progress. |

## Command output

- `node scripts/generate-sample-library-registry.mjs --check`: pass, generated 7 libraries and 797 playable samples.
- `node scripts/check-sample-asset-ids.mjs`: pass, all generated sample asset IDs are unique and in range.
- `node scripts/run-sample-library-tests.mjs`: pass, registry/resolver/predictor/cache tests passed.
- `npm run type-check`: pass.
- `npm run core:product:asset-manifest`: pass.
- `npm run core:product:assets`: pass.
- `npm run core:product:graph`: pass.
- `npm run core:product:sources`: pass.
- `npm run audit:routing-registry`: pass.
- `npm run audit:product-triggers`: pass.
- `npm run migration:product-boundary`: pass.
- `npm run core:product:runtime-fallbacks`: pass.
- `npm run core:product:web-host`: pass.
- `npm run core:product:realtime-safety`: pass.
- `npm run core:product:cpu`: pass.
- `npm run core:product:cpu-scenarios`: pass.
- `npm run core:product:fx-depth`: pass.
- `npm run core:product:wasm`: pass.
- `npm run architecture:product-core-truth`: pass.
- `npm run architecture:adapter-burndown`: pass.
- `npm run architecture:mobile-debug-policy`: pass.
- `npm run architecture:budget:strict`: pass with existing large-file warnings.
- `npm run architecture:runtime-scheduler`: pass.
- `npm run architecture:strict`: pass before post-sampler hardening additions.
- `npm run test:preset-dedup`: pass.
- `npm run test:preset-soft-delete`: pass.
- `npm run test:preset-hash-golden`: pass.
- `npm run audit:preset-v2 -- --fail-on-issues`: pass with existing non-blocking warnings.
- `npm run audit:supabase-egress`: pass.
- `npm run audit:cloud-pagination`: pass.
- `npm run audit:cloud-save-v2`: pass.
- `npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables`: pass.
- `npm run audit:supabase-security`: pass.
- `npm run audit:supabase-revoke-readiness`: pass.
- `npm run audit:supabase-egress:runtime`: pass.
- `npm run audit:supabase-egress:runtime:detail:strict`: pass.
- `npm run audit:supabase-egress:runtime:detail:repeat`: pass.
- `npm run maintenance:preset-v2:postgres`: pass dry run with existing maintenance warnings.

## CPU notes

- Latest general Product Core CPU report: disabled FX 4.87765% avg / p99 0.1426 ms / missed 0; active FX 7.9032% avg / p99 0.2544 ms / missed 0.
- Latest sampler CPU report: pass across 10 sampler scenarios; worst case was `loop-boundary-wrap-stress` at 5.3734% avg / p99 0.15349 ms / missed 0.
- Product Core telemetry ABI was updated to 8 source slots so `sample2` does not overflow telemetry/debug source arrays.
- The shared decoded sample cache is byte-bounded and dedupes by `assetId`; desktop cap is 128 MiB and mobile cap is 32 MiB.

## Supabase/preset safety notes

- Sampler fields were added to preset parameter accounting.
- No Supabase storage/query/migration file redesign was made for sampler implementation.
- Supabase/preset validation gates listed above passed after sampler fields were added.

## Native/device notes

- Pre-sampler native proof exists in `PRE_SAMPLER_HARDENING_RESULTS.md`.
- Post-sampler native sampler proof is owned by `POST_SAMPLER_HARDENING_RESULTS.md`; physical iOS device proof remains documented as not run locally.

## Known issues

- The normalized playable registry skips raw samples without root MIDI: 2 from Pneuma and 1 from The Spellsinger.
- Piano compatibility aliases remain for old presets and virtual Piano library metadata; visible source UI now uses Sample 1 / Sample 2 where post-sampler cleanup guards cover it.
- Physical iOS device screen-lock/audio-route proof has not been run in this local pass; simulator/native smoke and sampler-specific guards cover the available environment.
