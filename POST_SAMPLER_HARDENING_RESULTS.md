# Post-Sampler Hardening Results

## Baseline
- Git commit: ff480eb79a1f75a59cd2b0e15154d7b15d783b04
- Date: 2026-06-28T07:47:59Z
- Sampler branch/PR: product-core-sample-slots
- Device/OS availability: macOS native smoke and iOS simulator foreground/background smoke available and passed; physical iOS device lock-screen proof not run locally.
- Supabase env availability: configured; runtime egress, DB proof, security, API surface, and V2 maintenance dry run passed.

## Sampler baseline metrics
| Metric | Before hardening | After hardening | Target |
|---|---:|---:|---:|
| Product Core disabled FX CPU avg | 4.87765% | 4.9564% | <= previous baseline + 5% |
| Product Core active FX CPU avg | 7.9032% | 7.85915% | <= previous baseline + 5% |
| Sample1 Piano CPU avg | 0.279258% | 0.279258% | documented budget: <= 10% |
| Sample1+Sample2 shared asset CPU avg | 0.1425% | 0.1425% | documented budget: <= 15% |
| Looped string sample CPU avg | 2.56559% sample1 / 2.48004% sample2 | 2.56559% sample1 / 2.48004% sample2 | documented budget: <= 15% |
| p99 render block time | 0.15349 ms sampler baseline / 0.2544 ms active FX baseline | 0.1528 ms sampler worst / 0.234 ms active FX | no regression > 5% without owner approval |
| missed deadlines | 0 | 0 | 0 |
| sample cache decoded bytes desktop | 134217728 | 134217728 | <= configured cap |
| sample cache decoded bytes mobile | 33554432 | 33554432 | <= configured cap |
| first cloud preset detail bytes with sample fields | 98.1 KB | 98.1 KB | under strict budget |
| repeat cloud preset detail bytes with sample fields | 28.3 KB average | 28.3 KB average | under repeat budget |

## Phase Results
| Phase | Status | Commands | Notes |
|---|---:|---|---|
| Phase A - native/device sampler proof | PASS | `npm run native:sampler-device-proof`, `npm run native:device-proof`, `npm run core:product:macos-app-native-smoke`, `npm run core:product:macos-app-background-smoke`, `npm run core:product:ios-simulator-smoke`, `npm run core:product:ios-background-audio-smoke` | Added sampler proof template, latest proof, and guard. Fixed the native diagnostic snapshot helper to initialize all 8 Product sources, then macOS and iOS simulator smokes passed. |
| Phase B - sampler CPU budgets | PASS | `npm run core:product:sampler-cpu`, `npm run architecture:strict` | Added native C++ sampler CPU scenarios and budget/report scripts. Latest worst sampler scenario is `loop-boundary-wrap-stress`: 5.33051% avg, 0.1528 ms p99, 0 missed deadlines. |
| Phase C - sampler runtime scheduling | PASS | `npm run test:product-diagnostics-scheduler`, `npm run architecture:runtime-scheduler`, `npm run architecture:strict` | Added scheduler-owned sampler cache, asset-miss, decode-progress, and voice-telemetry channels with visibility/debug throttling. |
| Phase D - sampler adapter burn-down | PASS | `npm run architecture:sampler-adapter-burndown`, `npm run architecture:adapter-burndown`, `npm run architecture:adapter-burndown:strict` | Added guard proving WebProductEngine does not own sample resolution/fetch/decode and legacy Piano aliases stay in explicit compatibility paths. |
| Phase E - post-sampler size budgets | PASS | `npm run architecture:budget:strict`, `npm run architecture:strict` | Added strict budgets for sampler resolver, predictor, decoded cache, Product host resolver/registrar, and C++ sampler CPU test. Existing non-blocking large-file warnings remain. |
| Phase F - Supabase/preset sampler edge proof | PASS | `npm run audit:sampler-preset-payload`, `npm run test:preset-dedup`, `npm run test:preset-soft-delete`, `npm run test:preset-hash-golden`, `npm run audit:preset-v2 -- --fail-on-issues`, `npm run audit:supabase-egress`, `npm run audit:cloud-pagination`, `npm run audit:cloud-save-v2`, `npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables`, `npm run audit:supabase-security`, `npm run audit:supabase-revoke-readiness`, `npm run audit:supabase-egress:runtime:detail:strict`, `npm run audit:supabase-egress:runtime:detail:repeat`, `npm run audit:supabase-optimization-db-proof`, `npm run maintenance:preset-v2:postgres` | Added sampler preset payload guard. Supabase V2/detail/repeat/security gates passed without redesigning storage/query/migration semantics. |
| Phase G - decoded sample cache memory hardening | PASS | `node scripts/run-sample-library-tests.mjs`, `npm run architecture:strict` | Added byte-targeted `prune()` API with required asset protection, active voice deferred eviction, memory-warning cap reduction, and diagnostics. |
| Phase H - Piano source cleanup | PASS | `npm run audit:piano-source-cleanup`, `npm run architecture:strict` | Visible UI source labels now use Sample 1 / Sample 2; old Piano aliases remain only for migration/virtual-library compatibility. |
| Phase I - tech-debt concentration | PASS WITH DEFERRED BROAD SPLITS | `npm run architecture:budget:strict`, `npm run architecture:sampler-adapter-burndown`, `npm run audit:piano-source-cleanup`, `npm run audit:sampler-preset-payload` | CPU-focused sampler splits/guards landed. Broad Supabase file decomposition was deferred to avoid changing V2 storage/query semantics in this sampler hardening pass. Existing large-file warnings remain non-blocking. |

## Commands run
- `npm ci`: pass; npm audit reports 9 existing vulnerabilities.
- `npm run type-check`: pass.
- `npm run core:product:asset-manifest`: pass; startup compressed 7928481 bytes, startup decoded 185875176 bytes, registered decoded 245432084 bytes, WASM heap 246677504 bytes.
- `npm run core:product:assets`: pass.
- `npm run core:product:sources`: pass.
- `npm run core:product:graph`: pass.
- `npm run audit:routing-registry`: pass.
- `npm run audit:product-triggers`: pass.
- `npm run migration:product-boundary`: pass with existing allowed legacy import notes.
- `npm run core:product:runtime-fallbacks`: pass.
- `npm run core:product:web-host`: pass.
- `npm run core:product:realtime-safety`: pass.
- `npm run core:product:cpu`: pass; disabled FX 4.9564% avg / 0.1476 ms p99 / 0 missed, active FX 7.85915% avg / 0.234 ms p99 / 0 missed.
- `npm run core:product:cpu-scenarios`: pass.
- `npm run core:product:sampler-cpu`: pass.
- `npm run architecture:product-core-truth`: pass.
- `npm run architecture:adapter-burndown`: pass.
- `npm run architecture:adapter-burndown:strict`: pass.
- `npm run architecture:sampler-adapter-burndown`: pass.
- `npm run architecture:mobile-debug-policy`: pass.
- `npm run architecture:budget:strict`: pass with existing large-file warnings.
- `npm run architecture:runtime-scheduler`: pass.
- `npm run architecture:strict`: pass.
- `npm run native:device-proof`: pass.
- `npm run native:sampler-device-proof`: pass.
- `npm run core:product:macos-app-native-smoke`: pass.
- `npm run core:product:macos-app-background-smoke`: pass.
- `npm run core:product:ios-simulator-smoke`: pass.
- `npm run core:product:ios-background-audio-smoke`: pass.
- `npm run audit:piano-source-cleanup`: pass.
- `npm run audit:sampler-preset-payload`: pass.
- `node scripts/run-sample-library-tests.mjs`: pass.
- `npm run test:preset-dedup`: pass.
- `npm run test:preset-soft-delete`: pass.
- `npm run test:preset-hash-golden`: pass.
- `npm run audit:preset-v2 -- --fail-on-issues`: pass; 0 blocking integrity issues, existing V2 warnings documented.
- `npm run audit:supabase-egress`: pass.
- `npm run audit:cloud-pagination`: pass.
- `npm run audit:cloud-save-v2`: pass.
- `npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables`: pass.
- `npm run audit:supabase-security`: pass.
- `npm run audit:supabase-revoke-readiness`: pass.
- `npm run audit:supabase-egress:runtime:detail:strict`: pass; fresh load 15.3 KB, first preset detail 98.1 KB.
- `npm run audit:supabase-egress:runtime:detail:repeat`: pass; repeat load-first-preset average 28.3 KB.
- `npm run audit:supabase-optimization-db-proof`: pass.
- `npm run maintenance:preset-v2:postgres`: pass dry run.

## Metrics
- Sampler CPU avg/p99/missed deadlines: worst avg `loop-boundary-wrap-stress` 5.33051%; worst p99 0.1528 ms; missed deadlines 0 across all sampler scenarios.
- Product Core CPU avg/p99/missed deadlines: disabled FX 4.9564% / 0.1476 ms / 0; active FX 7.85915% / 0.234 ms / 0.
- Sample decoded bytes: startup decoded 185875176; total registered decoded 245432084; max Piano asset decoded 1078488; max soundscape asset decoded 110592000.
- Sample cache caps: desktop 134217728 bytes; mobile 33554432 bytes.
- Supabase first/repeat detail bytes: first preset detail 98.1 KB; repeat average 28.3 KB.

## Known issues
- `npm ci` still reports 9 audit vulnerabilities; this pass did not change dependency policy.
- `architecture:budget:strict` still reports existing non-blocking large-file warnings for `src/App.tsx`, `src/audio/coreProductEngineHost.ts`, `src/presets/SupabasePresetStore.ts`, `src/cloud/supabase.ts`, and `src/presets/presetStorageV2.ts`.
- Preset V2 audit still reports non-blocking version storage and duplicate-latest maintenance warnings; maintenance dry run passed.
- Physical iOS device lock-screen proof was not run locally; simulator foreground/background and macOS native smokes passed.
- The playable sample registry still skips raw samples without root MIDI: 2 from Pneuma and 1 from The Spellsinger.
- Broad Supabase module splitting is deferred to a separate behavior-preserving tech-debt pass to avoid changing storage/query semantics during sampler hardening.

## Final status
Post-sampler hardening is: PASS

Reason: native sampler proof exists, sampler CPU proof passes, runtime scheduling and adapter guards are in `architecture:strict`, Supabase/preset gates pass, cache pruning is memory-pressure aware, Piano cleanup guard passes, and native macOS/iOS simulator smokes pass after the diagnostic snapshot helper was updated for all 8 Product sources.
