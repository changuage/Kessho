# Product Core Sampler Results

## Scope
- Branch: product-core-sample-slots
- Commit: 5f3e850e
- Date: 2026-06-27T23:03:21Z
- Phases attempted: Phase 0, Phase 1, Phase 2

## Gate status
| Gate | Status | Evidence |
|---|---:|---|
| Pre-sampler hardening gate before Phase 3 | READY | `PRE_SAMPLER_HARDENING_RESULTS.md` records the final pre-render gate as ready after macOS and iOS simulator native proof. Phase 3 was not started in this pre-sampler pass. |
| Product Core sampler rendering | NOT STARTED | No Product Core sample1 renderer, schema source ID, routing entry, or UI panel was added. |
| Post-sampler hardening handoff | NOT READY | Phase 3+ remains unimplemented, so post-sampler hardening is still future work. |

## Command output

- `git checkout -b product-core-sample-slots`: created safety branch.
- Sample manifest inventory:
  - `ArchiveFoundStrings001`: `archive-found-strings-001`, 25 raw samples, assets `8400-8424`, 0 missing roots.
  - `ArrayMBira`: `array-mbira`, 336 raw samples, assets `8600-8935`, 0 missing roots.
  - `Pneuma`: `pneuma-eleni-teaser`, 142 raw samples, assets `8000-8141`, 2 missing roots.
  - `SoftStringSpurs`: `soft-string-spurs`, 99 raw samples, assets `8200-8298`, 0 missing roots.
  - `TheSpellsinger`: `the-spellsinger`, 47 raw samples, assets `9000-9046`, 1 missing root.
  - `WildPercussion`: `wild-percussion`, 23 raw samples, assets `9100-9122`, 0 missing roots.
- `node scripts/generate-sample-library-registry.mjs`: passed, generated 7 libraries and 797 rooted playable samples.
- `node scripts/generate-sample-library-registry.mjs --check`: passed, generated TS/C++ outputs are current.
- `node scripts/check-sample-asset-ids.mjs`: passed, 7 libraries and 797 samples have unique in-range asset IDs.
- `node scripts/run-sample-library-tests.mjs`: passed all focused registry, resolver, predictor, and decoded-cache tests.
- `npm run type-check`: passed after the pre-sampler hardening work.
- `npm run core:product:asset-manifest`: passed.
- `npm run core:product:assets`: passed.

## CPU notes

- No Product Core sample renderer, source ID, routing entry, or UI panel was added.
- Generated C++ sampler metadata is numeric plain data only: no heap allocation and no strings in future render-path tables.
- The host predictor caps prediction to 32 assets per slot by default and never preloads full libraries.
- `SampleDecodedAssetCache` is shared by `assetId`, deduplicates in-flight decodes, and uses byte-bound LRU eviction with 128 MiB desktop / 32 MiB mobile defaults.
- Loop frame scaling is performed in host metadata helpers once, converting encoded loop frames to decoded frame units before future registration.

## Supabase/preset safety notes

- No sampler files were wired into Supabase storage, query, or migration paths.
- Final dirty-tree check shows non-sampler Supabase/preset changes present in the worktree:
  - `src/cloud/supabase.ts`
  - `src/presets/SupabasePresetStore.ts`
  - `src/presets/presetStorageV2.ts`
  - `supabase/migrations/20260627221646_public_preset_owner_identity.sql`
- These files were left untouched by the sampler implementation. The final pre-sampler `npm run type-check` command now passes.

## Native/device notes

- Native/device proof was completed in `PRE_SAMPLER_HARDENING_RESULTS.md`.
- `npm run core:product:ios-simulator-smoke`, `npm run core:product:ios-background-audio-smoke`, and `npm run native:device-proof` pass.
- `PRE_SAMPLER_HARDENING_RESULTS.md` records the final pre-render gate as ready.

## Known issues

- The normalized playable registry excludes raw samples without a root MIDI: 2 from Pneuma and 1 from The Spellsinger. They remain in raw manifests but are not selectable by note/nearest-note resolution yet.
- Array M'Bira filename note labels are parsed into playable roots, including the 84 noise-reduced strum samples without DecentSampler mappings. The remaining M'Bira risk is DecentSampler zone fidelity: note ranges, velocity ranges, and mic/side layering can be incomplete when a sample is not referenced by `.dspreset` metadata.
- Round-robin / seeded variant selection is not implemented in Phase 0-2. The implementation plan was amended so the gated Phase 3 Product Core resolver chooses one deterministic variant from matching sample buckets without audio-thread allocation.
- Physical iOS device screen-lock/audio-route proof was not run; the pre-sampler native proof uses macOS runtime smoke plus iOS simulator foreground/background native Product Core smoke.
