# Preset Content-Hash Storage Baseline

## Status

Phase 0 baseline for [PRESET_SEQUENCER_CONTENT_HASH_PLAN.md](./PRESET_SEQUENCER_CONTENT_HASH_PLAN.md).

- Captured: 2026-07-11
- Repository revision: `1a6f50f2f6a06c60b24d0426750a041dc3bb3faf`
- Worktree at capture: only preset-plan documentation was modified before the baseline work began
- Database mode: direct PostgreSQL using the configured Supabase database URL

## Existing Verification

The following commands passed before implementation:

```text
npm run type-check
npm run test:preset-metadata
npm run test:preset-dedup
npm run test:preset-exact-load
npm run test:preset-hash-golden
npm run test:preset-sequencer-hash-coverage
npm run test:preset-soft-delete
npm run core:product:sequencer-lane-count
npm run audit:preset-v2
npm run audit:supabase-security
npm run audit:supabase-egress
npm run audit:supabase-api-surface
npm run audit:supabase-optimization-db-proof
```

The existing lane-count suite passed despite `src/App.tsx` saving Drum pitch settings with a hard-coded count of four. Phase 1 therefore requires a focused six-lane save-metadata regression before changing that code.

## Current V2 Corpus

The existing V2 audit reported:

| Metric | Baseline |
| --- | ---: |
| Presets | 1,158 |
| Versions | 1,627 |
| Preset refs | 1,759 |
| Payloads | 1,868 |
| Logical referenced bytes | 3.99 MB |
| Unique referenced bytes | 2.79 MB |
| Existing deduplication saving | 30.2% |
| Unreferenced payload bytes | 0 B |
| Blocking integrity issues | 0 |
| Duplicate active logical identities | 0 |
| Version storage warnings | 479 |

The warnings are existing missing-`resolved_hash` cases, primarily leaf/derived entries. They are baseline evidence and must not be attributed to the new direct-content graph without comparison.

## Structural Pool Evidence

`npm run audit:preset-content-pools` derives these counts from `ParamRegistry.ts` and the canonical Pad adapter:

| Candidate | Slot field counts | Shared canonical core | Exact schema |
| --- | --- | ---: | --- |
| Granular Voice 1-4 | 37 / 37 / 37 / 37 | 37 | Yes |
| Dynamics EQ 1/2 | 15 / 15 | 15 | Yes |
| Insects 1/2 | 8 / 8 | 8 | Yes |
| Pad 1/2 | 59 / 58 | 53 | No; explicit extensions required |
| Lead 1/2 settings | 14 / 11 | 11 | No; Lead 1 has three extensions |

Pad extensions currently outside the 53-field canonical core include destination performance/spatial fields and Pad 1 `detune`. D3 requires performance and mix fields to remain bindings; the remaining timbre extension needs a versioned capability.

## Latest-Resolved Opportunity Sample

The read-only opportunity audit examined 930 active latest presets with a resolved payload.

| Candidate | References | Unique canonical hashes | Logical canonical bytes | Duplicate bytes | Content saving |
| --- | ---: | ---: | ---: | ---: | ---: |
| Granular Voice | 71 | 71 | 29,398 | 0 | 0% |
| Dynamics EQ | 4 | 4 | 850 | 0 | 0% |
| Insects Voice | 2 | 2 | 240 | 0 | 0% |
| Pad Voice | 36 | 36 | 38,261 | 0 | 0% |
| Lead settings | 8 | 8 | 1,639 | 0 | 0% |
| Harmony chord banks | 24 | 1 | 55,560 | 53,245 | 95.83% |
| Harmony sequence banks | 24 | 1 | 24,264 | 23,253 | 95.83% |
| Harmony context | 25 | 5 | 1,294 | 1,030 | 79.60% |

Interpretation:

- Current named/derived Granular, EQ, Insect, and Pad latest payloads are all unique in this corpus. Their shared pools are still required product reuse boundaries, but the baseline does not claim immediate duplicate-byte recovery from those latest rows.
- Harmony already has strong real-corpus reuse and is the clearest measured payload saving.
- Source-level Synth resolved payloads currently contain no Sample 1/2 fields, so this report cannot estimate Sample pool savings from latest source rows. Phase 8 must measure Sample fixtures and L4 data after the ownership boundary is implemented.
- Sequencer component savings cannot be measured correctly until Phase 3 can canonicalize trigger and subsequencer components. Phase 3 must extend this report rather than projecting from the current combined Euclidean payload.

## Security And Database Baseline

- Base preset tables are blocked through REST for unauthenticated and anonymous-auth clients.
- Narrow detail/runtime RPCs are callable through their existing argument guards.
- Broad base-table `SELECT` grants reported: zero.
- Duplicate resolved payload insertion produced one physical row.
- Bad and missing hashes were rejected.
- Purge dry-run remained non-mutating.
- Orphan cleanup removed its test orphan inside a rollback transaction.
- The proof transaction rolled back successfully.

## Measurement Rules

All later before/after comparisons must:

1. rerun the same commands and opportunity audit;
2. count payload, ref, version, preset-wrapper, and index bytes where applicable;
3. separate locked semantic boundaries from optional byte-saving candidates;
4. report request count, detail payload bytes, save CPU, cold load, and warm load;
5. compare graph reconstruction with the retained resolved snapshot until Phase 11;
6. identify database evidence unavailable in the current environment rather than treating it as passing.

The opportunity audit's duplicate-byte figures are content-only. They do not subtract new direct-ref rows, indexes, authorization cost, or reconstruction CPU.
