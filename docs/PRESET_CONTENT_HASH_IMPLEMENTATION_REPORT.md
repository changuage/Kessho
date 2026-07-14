# Preset Content-Hash Implementation Report

## Status

Code, migrations, automated verification, and production save/load sampling completed on 2026-07-12. New L4 saves are graph-authoritative and do not write `resolved_hash`. Existing rows remain readable and are converted only when a new version is saved.

## Delivered Architecture

- Four Synth and six Drum sequencers use independent grouped direct refs for trigger, active pitch/expression/morph/distance/nudge/slice/reverse subsequencers, and lane control.
- Source selection, target/voice masks, enable, solo, level, sends, and routing stay outside portable hashes.
- Granular 1-4, EQ 1/2, Pad 1/2, and Sample 1/2 use destination-neutral shared content schemas.
- Pad, seven distinct Drum engines, Granular selection, and Water endpoints are pinned by immutable content hash. Sparse manual overrides remain authoritative.
- Harmony chord banks A/B, sequence banks A/B, and harmonic context are independent refs. Active/morphed state remains L4 binding state.
- Parameter behavior is stored in one coarse content node per ParamRegistry scope. V2 metadata no longer duplicates behavior maps or relational refs.
- `presetPool` is a versioned local user/device preference and is excluded from new L4 metadata.
- Legacy flat metadata, combined Euclidean children, expanded snapshots, and embedded refs remain readable. In-memory counters expose legacy-read frequency.
- Direct content payloads occupy one opaque global pool. Every save includes canonical bytes; arbitrary existence probes and direct browser table access are denied.

## Database Rollout

Applied through the configured PostgreSQL connection because this checkout has no linked Supabase project or migration ledger:

- `20260711214902_preset_direct_content_refs_v2.sql`
- `20260712034607_preset_graph_authority_v2.sql`
- `20260712035104_preset_derived_endpoint_refs_v2.sql`
- `20260712041004_preset_all_derived_endpoint_types_v2.sql`
- `20260712082206_preset_parameter_behavior_content_v2.sql`

The live table started empty; existing preset rows and payloads were not rewritten. Post-deployment API audits show `preset_version_content_refs_v2` returns 401 anonymously and 403 under the anonymous authenticated role. Reads occur only through parent-authorized RPCs.

## Storage And CPU Evidence

Baseline live corpus: 1,158 presets, 1,627 versions, 1,759 named refs, and 1,868 payloads. Existing V2 storage is 3.99 MB logical versus 2.79 MB unique referenced bytes, or 30.2% deduplication.

`DEFAULT_STATE` graph projection:

| Metric | Result |
|---|---:|
| Expanded runtime JSON | 50,502 B |
| Optimized sparse state JSON | 44,959 B |
| Direct component refs | 51 |
| Unique component payloads | 32 |
| Logical repeated component bytes | 18,976 B |
| Unique component bytes | 13,954 B |
| Estimated ref overhead | 6,528 B |
| One-version direct layer | -7.94% |
| Eight-version direct layer | 56.41% savings |
| Preparation CPU median | 1.55 ms |
| Preparation CPU p95 | 3.08 ms |

The first isolated version is intentionally negative because mandatory semantic refs have row overhead. Reuse crosses break-even on repeated versions; payload bytes are global while refs remain version-local. Saves canonicalize each candidate once and batch one atomic RPC. Cold graph load uses one manifest plus one payload request; warm load adds no payload request.

The final product CPU gate measured active FX at 7.71% average, 8.78% peak, 0.234 ms p99, and zero missed deadlines. `architecture:strict`, native/WASM determinism, WASM smoke, realtime safety, and sampler CPU gates pass.

## Production Sample

A temporary child state preset was saved through the normal browser application, loaded cold and warm through the morph-slot graph path, and then soft-deleted. Both loads completed without UI recovery warnings or browser console errors.

| Metric | Result |
|---|---:|
| Graph-authoritative version | 1 |
| `resolved_hash` | `null` |
| Direct content refs | 41 |
| Unique content hashes | 22 |
| Logical referenced payload bytes | 18,392 B |
| Unique referenced payload bytes | 11,377 B |
| In-version content-byte saving | 38.14% |
| Live audit blocking issues | 0 |
| Live unreferenced payload bytes | 0 B |
| Maintenance orphan candidates | 0 |

The live corpus after the sample contains 45 direct refs across graph-authoritative versions. Maintenance correctly skips 33 such versions during resolved-hash backfill. The temporary preset is soft-deleted, preserving immutable historical reachability for maintenance and recovery checks.

Harmony corpus reuse is independently strong: chord banks 95.83%, sequence banks 95.83%, and contexts 79.60% content-byte savings.

## Conditional Decisions

- Insects 1/2 remain on compatibility storage: only two current references, no duplicate bytes, and row overhead exceeds measured savings.
- Lead 1/2 common settings remain unsplit: eight references, eight unique hashes, and only 11 common fields.
- Reverb spectral freeze remains embedded because independent reuse was not demonstrated.
- Mix/routing and sequencer arrangement remain coarse L4 state because measured values are state-specific and extra children would add rows without proven reuse.
- Existing `lead4opfm` timbre pooling remains the Lead reuse boundary.

## Correctness And Recovery

- All six Drum pitch settings round-trip.
- Sound presets omit sequencer content and cannot alter sequencer bindings.
- Binding-only changes reuse identical sequencer component hashes.
- Semantic no-op graph versions are not stored.
- Graph-only L4 load succeeds with `resolved_hash = null`.
- Missing endpoint payloads emit recovery warnings and use deterministic legacy/full-state fallback.
- Cache eviction cannot change graph correctness.
- Maintenance skips resolved backfill for versions with direct refs and counts content refs as payload reachability roots.
- Cross-owner identical saves converge to one payload row without exposing whether another private owner stored the hash.

## Completion Audit

| Gate | Evidence | Status |
|---|---|---|
| D1-D8 behavior | Canonical ownership, component, graph, metadata, and shared-pool regressions | Pass |
| Six Drum pitch lanes | Ownership and metadata regressions use `DRUM_EUCLIDEAN_LANE_COUNT` | Pass |
| Sound/sequencer isolation | Sequencer component and product preset-boundary regressions | Pass |
| Independent lane/component refs | Graph-authority and sequencer-component regressions | Pass |
| Granular, Pad, Sample, EQ reuse | Shared-component-pool regression | Pass |
| Compact derived state | Graph-authority and exact-load regressions | Pass |
| Relational metadata ownership | Metadata and content-ownership regressions | Pass |
| Parameter behavior ownership | Content-node and ownership regressions | Pass |
| Graph-only L4 load | Graph-authority regression with `resolved_hash = null` and cache eviction | Pass |
| Legacy load/migration | Legacy-content-migration and exact-load suites | Pass |
| Database security/integrity | Rollback DB suite, live V2 audit, security, egress, API-surface, and maintenance audits | Pass |
| Storage/performance | Deterministic projection, CPU gates, cold/warm fake-store request evidence, and live graph save/load sample | Pass |
| Conditional exclusions | Corpus audit records Insect, Lead, reverb-freeze, mix/routing, and arrangement rejections | Pass |

All completion gates are satisfied.

## Lifecycle Follow-Up

The 2026-07-13 deletion and reachability audit found and repaired restore, hard-purge, patch-ancestry, direct-content maintenance, and scheduling defects in the original rollout. The production database now has zero blocking lifecycle issues and zero unreferenced payload bytes. Findings, migration behavior, cleanup counts, and regression evidence are recorded in [PRESET_STORAGE_LIFECYCLE_AUDIT.md](./PRESET_STORAGE_LIFECYCLE_AUDIT.md).

## Reproduction

Run:

```bash
npm run type-check
npm run test:preset-content-ownership
npm run test:preset-content-nodes
npm run test:preset-sequencer-components
npm run test:preset-shared-component-pools
npm run test:preset-graph-authority
npm run test:preset-content-refs-db
npm run test:preset-soft-delete
npm run test:preset-lifecycle-db
npm run audit:preset-v2 -- --fail-on-issues
npm run audit:preset-content-pools -- --json
npm run benchmark:preset-content-graph
npm run audit:supabase-security
npm run audit:supabase-egress
npm run audit:supabase-api-surface
npm run maintenance:preset-v2:postgres
```
