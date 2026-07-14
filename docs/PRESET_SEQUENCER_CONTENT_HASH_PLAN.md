# Preset Content-Hash Storage Execution Plan

> Implementation and production save/load sampling completed on 2026-07-12. Evidence, deployed migrations, measurements, and conditional rejections are recorded in [PRESET_CONTENT_HASH_IMPLEMENTATION_REPORT.md](./PRESET_CONTENT_HASH_IMPLEMENTATION_REPORT.md).

## Status And Authority

Completed execution and acceptance artifact. D1-D8 are approved and locked to Option A.

This is the single authoritative plan for:

- source-independent per-subsequencer hashes grouped by sequencer slot;
- reusable content pools across equivalent Pad, Sample, Granular, EQ, and Insect slots;
- compact derived Pad, Drum, Granular, and Water state;
- metadata ownership and deduplication;
- harmony and optional routing children;
- graph-first L4 persistence and expanded-snapshot reduction;
- the six-lane Drum pitch-settings correctness fix.

It incorporates the findings in [PRESET_REUSABLE_HASH_POOL_AUDIT.md](./PRESET_REUSABLE_HASH_POOL_AUDIT.md). That document remains supporting evidence; this document controls implementation order and acceptance.

## Goal

Refactor preset persistence so independently reusable musical and sound concepts are immutable, canonical, content-addressed payloads referenced by destination-specific slots.

The completed system must provide all of the following:

- every Synth and Drum sequencer lane is an independent content-ref group;
- each active subsequencer in that group has its own source-independent component hash;
- all semantically compatible trigger and subsequencer components draw from shared physical pools;
- equivalent Granular 1-4, Pad 1/2, Sample 1/2, EQ 1/2, and optionally Insect 1/2 content shares canonical pools;
- selected sound source, slot identity, gain, enablement, and routing never enter a portable content hash;
- endpoint hashes, morph positions, and sparse edits replace duplicated derived runtime values where deterministic reconstruction is possible;
- metadata follows the content node that owns its behavior;
- L4 graph data becomes authoritative and a full resolved snapshot becomes optional cache data;
- saves and loads use coarse nodes, bulk database access, and bounded CPU;
- legacy presets remain readable and migrate naturally on their next save.

The target is minimum total cost, not the maximum number of hashes:

```text
payload bytes
+ payload/ref/version/index row overhead
+ canonicalization and hashing CPU
+ graph fetch and reconstruction CPU
+ authorization and maintenance complexity
```

## Non-Goals

- Do not change audio playback, scheduling, generation, or DSP semantics.
- Do not redesign the Synth, Drum, Granular, Global, or preset-browser UI.
- Do not expose internal content nodes as user-visible preset entries.
- Do not hash individual scalar fields, cells, steps, routes, tape heads, or slider ranges. Independently cycling subsequencers are the smallest allowed sequencer payload boundary.
- Do not merge Drum engines whose fields or DSP semantics differ.
- Do not force incompatible Synth and Drum data to share a hash because their current JSON looks similar.
- Do not bulk-rewrite all cloud presets during rollout.
- Do not make sound presets load, clear, or mutate sequencer patterns.
- Do not remove legacy readers before production data no longer needs them.

## Product Invariants

These constraints are non-negotiable unless this plan is explicitly revised:

1. Loading a sound preset such as `Saturated Drift` changes sound content only.
2. Loading a Drum sound or kit preset changes sound content only.
3. Loading a saved sequence group or one of its subsequencers changes only the targeted sequencer content and preserves the slot's selected source, target mask, enabled state, gain, and routing.
4. Changing slot identity, selected source, source preset, gain, mute, solo, or routing does not change a portable content hash.
5. The same content may be referenced independently by multiple compatible destination slots.
6. Four Granular lanes remain four independent refs even when all four refs point to one hash.
7. Every sequencer remains independently replaceable; there is no combined all-sequencer content hash.
8. Pitch and every other independently cycling subsequencer can be independently hashed and reused without loading a different trigger pattern.
9. L4 restores sound refs, sequencer component groups, slot bindings, arrangement state, global state, and metadata as independently composed state.
10. Refs pin immutable content at save time and never silently follow later edits to a named preset.
11. New L3 Synth and Drum presets contain no sequencer content and never call sequencer restore behavior.
12. Old presets remain readable without an eager migration.
13. Hash equality means canonical semantic equality, not merely similar slot-prefixed JSON.

## Locked Product Decisions

All decisions are confirmed. Changing one requires an explicit plan revision and corresponding regression updates.

### D1. Private-content deduplication realm

**Decision status: Option A selected by owner.**

**Option A: one global opaque payload pool. Recommended.**

Pros:

- maximizes deduplication across users, factory content, forks, and public/private presets;
- keeps one canonical hash identity for the same content;
- simplifies content pinning and factory-to-user reuse.

Cons:

- hash existence can become a privacy side channel if clients can probe arbitrary hashes;
- RLS and RPCs must permit payload reads only through an authorized parent ref;
- save APIs must not expose whether another user already stored a private hash.

**Option B: deduplicate within each owner or authorization realm.**

Pros:

- stronger isolation and simpler privacy reasoning;
- avoids cross-owner existence leakage.

Cons:

- stores the same factory and musical content repeatedly;
- identical content no longer has one physical identity;
- transfers and forks may require payload copies.

Locked decision: use A with opaque, non-enumerable payload access and parent-authorized detail/save RPCs. If those guarantees cannot be proven, stop the database phase and report the security blocker; do not silently fall back to per-owner hashes.

### D2. Manual edits after selecting presets or morph endpoints

**Decision status: Option A selected by owner.**

**Option A: endpoint hashes plus sparse authoritative overrides. Recommended.**

Pros:

- removes duplicated Pad, Drum, Granular, and Water resolved values;
- preserves manual edits without saving the entire expanded engine;
- maximizes endpoint content reuse.

Cons:

- requires deterministic reconstruction and precise diffing;
- endpoint content must be immutable and historically resolvable;
- sparse override migrations are more complex than full snapshots.

**Option B: always save full resolved engine content after any manual edit.**

Pros:

- simplest recovery and exact-load reasoning;
- independent of future morph implementation changes.

Cons:

- loses most derived-state storage savings;
- produces high-cardinality payloads for morph positions;
- duplicates content already identified by endpoint refs.

Recommendation: A, with a full canonical fallback only when an endpoint cannot be pinned or reconstruction is not deterministic.

### D3. Sound content versus slot mix/routing

**Decision status: Option A selected by owner.**

**Option A: all enable, level, gain, send, and bus-routing fields are slot binding. Recommended.**

Pros:

- sound content is portable across slots and sequencers;
- changing a mix does not create a new sound hash;
- Sample 1/2 and Pad 1/2 reuse improves substantially.

Cons:

- loading a sound preset does not restore an artist-authored effect-send balance;
- a separate command would be needed for a combined sound-and-mix preset.

**Option B: selected sends such as reverb/diffuse are part of sound content.**

Pros:

- a named sound can preserve its intended ambience;
- closer to some traditional synthesizer preset behavior.

Cons:

- reduces portability and deduplication;
- creates exceptions that are difficult to explain consistently;
- can alter an existing mix when loading a sound.

Recommendation: A. Future combined channel-strip presets can explicitly compose sound content with a mix binding instead of contaminating the sound hash.

### D4. `presetPool` ownership

**Decision status: Option A selected by owner.**

**Option A: user/library preference, not L4 musical state. Recommended.**

Pros:

- removes repeated preset ID arrays from every L4 version;
- changing a browsing/randomization catalog does not churn state hashes;
- matches its current app-level active-pool behavior.

Cons:

- loading an old L4 state does not restore the exact catalog used when it was created;
- state evolution may see a newer user pool.

**Option B: intentional state behavior stored by content hash.**

Pros:

- exact reproducibility when pool membership affects evolution/randomization;
- sharing a state can include its allowed preset catalog.

Cons:

- preset IDs may be unavailable to another user;
- larger manifests and more compatibility behavior;
- catalog edits create new state content.

Locked decision: A. Remove `presetPool` from new L4 persistence and treat it as user/device preference. Before removal, add a regression proving deterministic playback and generation do not depend on restoring state-specific pool membership. If that regression cannot be established, stop and revise D4 rather than silently retaining dual ownership.

### D5. Harmony content-ref grouping

**Decision status: Option A selected by owner.**

**Option A: independently hash chord banks, sequence banks, and harmonic context. Recommended.**

The `harmony.program` group contains component refs such as:

```text
harmony.program.chord-bank-a       -> harmonyChordBank hash
harmony.program.chord-bank-b       -> harmonyChordBank hash
harmony.program.sequence-bank-a    -> harmonySequenceBank hash
harmony.program.sequence-bank-b    -> harmonySequenceBank hash
harmony.program.context            -> harmonyContext hash
```

`harmonyContext` contains root, scale, tension, and voicing controls as one cohesive component. Enabled state, current bank selection, morph position, current step, transport, and generated output remain L4 binding/runtime state.

Pros:

- chord banks can be reused with different sequence banks and harmonic contexts;
- the same sequence structure can be transposed or voiced without duplicating bank payloads;
- root/scale/tension/voicing can be saved and reused together without contaminating bank hashes;
- changing one component invalidates only that component hash and the lightweight group signature.

Cons:

- more direct ref rows than one coarse harmony payload;
- root/scale/tension/voicing are small, so their separate row may cost more bytes unless contexts repeat;
- load and garbage collection must understand grouped refs.

**Option B: one coarse `harmonyProgram` hash.**

Pros:

- fewer rows and the simplest exact-load path;
- efficient when all harmony fields usually change together.

Cons:

- duplicates banks that are reused under another context;
- any root, scale, tension, or voicing change churns the entire program hash;
- prevents independent bank reuse.

Locked decision: A. Store `harmonyContext` as its own content hash and direct ref even when its isolated row is not a net byte saving. This is a product-level independent reuse boundary; measurements still determine indexing, caching, and batching strategy.

### D6. Per-subsequencer hashes, including pitch

**Decision status: Option A selected by owner.**

The current runtime already models `pitch`, `expression`, `morph`, `distance`, `nudge`, `slice`, and `reverse` as per-sequencer sub-lanes with independent lengths and directions. Pitch also has mode, root, and scale settings. Therefore pitch is an independently reusable subsequencer, not merely a field inside one monolithic lane hash.

**Option A: one content-ref group per sequencer, with one hash per active subsequencer. Recommended.**

The group contains:

- one trigger component hash containing the trigger clip and trigger-indexed probability, ratchet, and trigger-condition data;
- one pitch component hash containing pitch values, steps, direction, indexing behavior, mode, root, scale, and source-independent pitch-binding semantics;
- separate hashes for each active expression, morph, distance, nudge, slice, and reverse subsequencer;
- compact lane control containing clock division, swing, linked behavior, evolve configuration, and capability/play configuration.

Pros:

- the same pitch sequence can be reused with different trigger rhythms or sounds;
- changing pitch does not duplicate trigger, expression, or morph content;
- disabled/default subsequencers can omit refs entirely;
- reflects the actual product model of independently cycling sub-lanes.

Cons:

- increases worst-case refs from one per sequencer to one per active component;
- requires grouped ref-slot conventions and a group signature for no-op detection;
- tiny sub-lanes may cost more row/index bytes than their JSON payload;
- loading must batch all component hashes to avoid N+1 behavior.

**Option B: one monolithic hash per complete sequencer lane.**

Pros:

- fewer rows and simpler hydration;
- efficient when trigger and every sub-lane are always saved/loaded as one unit.

Cons:

- changing one pitch value creates a new copy of every other lane component;
- prevents independent pitch and modulation reuse;
- does not reflect the independent sub-lane clocks already present in the runtime.

Recommendation: A, using a hybrid granularity: hash independently cycling subsequencers, but keep tightly trigger-indexed probability, ratchet, and trigger conditions with the trigger component. The selected sound source, slot voice mask, gain, and routing remain outside every component hash. A source-relative pitch component stores an explicit representation, never a source ID.

Each sequencer therefore has an overall **group signature hash**, while every active subsequencer has its own reusable **payload hash**. The group signature is derived from the sorted component refs and is not another copy of their data.

Do not conflate the global `harmonyContext` root/scale with a pitch subsequencer's local pitch settings. Local mode/root/scale belong to the pitch hash when they define its note mapping. If a future or existing mode semantically follows the global harmony context, store that binding mode in the pitch component and resolve the separate `harmonyContext` at composition time; do not duplicate the global context values into the pitch payload.

### D7. Cross-page Synth/Drum sequencer-component pools

**Decision status: Option A selected by owner.**

**Option A: one physical pool with versioned capability fields. Recommended.**

Pros:

- maximum reuse when musical semantics are genuinely identical;
- one canonical trigger/subsequencer model and hashing path;
- optional Synth/Drum behavior remains explicit.

Cons:

- adapters and capability validation are more demanding;
- unsupported fields require deterministic ignore/reject rules.

**Option B: separate Synth and Drum physical pools.**

Pros:

- simpler validation and fewer cross-engine assumptions;
- lower risk of accidentally reinterpreting a field.

Cons:

- duplicates common patterns;
- creates two schemas and migration paths.

Recommendation: A. Add a page discriminator only when semantics cannot be represented portably, not merely because the source page differs.

### D8. Slider modes and dual ranges

**Decision status: Option A selected by owner.**

**Option A: behavior travels with the coarse content node that owns the parameter. Recommended.**

Pros:

- a saved sound/pattern restores how its parameter evolves;
- changing behavior invalidates only the relevant child hash;
- removes one high-churn global metadata map.

Cons:

- identical values with different generative behavior produce different hashes;
- adapters must translate canonical parameter keys.

**Option B: all behavior remains one L4 metadata map.**

Pros:

- simpler initial migration;
- value hashes remain independent of behavior.

Cons:

- lower-level preset loads can lose behavior;
- one small behavior change churns the entire metadata hash;
- ownership remains ambiguous.

Recommendation: A. Represent mode and range together, and never create a per-parameter child hash.

### Decision Summary

| ID | Locked implementation rule |
| --- | --- |
| D1 | One global opaque payload pool; payload access only through authorized parent refs |
| D2 | Immutable endpoint hashes plus sparse authoritative overrides; full payload only as deterministic fallback |
| D3 | Enable, level, gain, sends, and routing are binding state, never portable sound content |
| D4 | `presetPool` is user/device preference and is removed from new L4 writes |
| D5 | Harmony uses independently hashed chord banks, sequence banks, and harmonic context |
| D6 | Every active independently cycling subsequencer has its own payload hash within a sequencer ref group |
| D7 | Synth and Drum share physical component pools whenever canonical semantics match |
| D8 | Slider mode and range travel together with the coarse component that owns the parameter |

## Engineering Defaults That Do Not Need Product Input

### E1. Direct content refs

Use generic direct content refs for internal nodes instead of hidden `presets_v2` and `preset_versions_v2` wrappers. Named user presets retain identity/version rows; internal immutable nodes do not acquire user-visible identity.

Why: fewer rows, less graph depth, clearer garbage collection, and one mechanism for sequencers and shared sound components.

### E2. Graph authority and resolved cache

The compact graph is authoritative. Historical L4 versions stop storing expanded resolved snapshots after graph-first loading is proven. A flattened latest snapshot may remain only as a measured, evictable cache.

### E3. Empty/default content

Omit refs for semantically empty/default slots when deterministic hydration supplies the same default. Do not store a default payload ref for every untouched lane.

### E4. Hash granularity threshold

Do not add an optional child unless corpus measurements show positive net savings after row, index, query, and CPU overhead. D5 harmony components and D6 active subsequencers are locked product reuse boundaries even when an isolated component is small; optimize their batching and row representation instead of collapsing them. Prefer optional changes that reuse existing ref slots without increasing graph fanout.

### E5. Migration policy

Read legacy formats indefinitely during rollout and migrate on next save. Do not perform an eager destructive rewrite.

## Current-State Facts To Re-Verify

- `src/presets/presetStorageV2.ts` creates scope-specific Pad 1/2, Lead 1/2, EQ 1/2, Granular 1-4, and Insect 1/2 children.
- V2 dedup lookup is constrained by `(type, scope, resolvedHash)`, preventing cross-scope reuse.
- child payload JSON uses slot-prefixed keys, so equal suffix values still hash differently.
- V2 creates hidden derived preset wrappers and also persists full resolved payloads.
- `PresetVersionMetadata` stores flat Synth/Drum sequencer arrays and maps.
- source-level Synth and Drum children currently include one combined `euclideanPattern` child.
- `src/audio/padPresets.ts` already defines one canonical Pad schema and a Pad 1-to-2 adapter.
- `src/presets/statePresetOptimization.ts` removes reconstructable Pad, Drum, Granular, and Water values from flat state saves.
- `normalizeResolvedVersionData()` rehydrates compact state before V2 child extraction, potentially storing those derived values again.
- Granular Voice 1-4 match on 37 of 37 normalized fields.
- Dynamics EQ 1/2 match on 15 of 15 normalized fields.
- Insects 1/2 match on 8 of 8 normalized fields.
- Sample 1/2 match on 23 of 23 normalized fields before semantic binding separation.
- Pad 1/2 share a canonical core; Pad 1 has an unmapped `detune` extension.
- Lead 1/2 share 11 fields, while Lead 1 has density, octave, and octave-range extensions; primary timbre is already shared through `lead4opfm`.
- Drum engines do not have one equivalent normalized schema.
- `extractPresetVersionMetadata()` copies `version.refs` into metadata while V2 also stores relational refs.
- `src/App.tsx` currently normalizes Drum pitch settings with `4`, although `DRUM_EUCLIDEAN_LANE_COUNT` is `6`.

## Target Ownership Model

### Portable content

Portable content contains only state that should travel when assigned to another compatible destination:

- sequencer trigger, timing, sub-lane, pitch, evolve, and capability-specific behavior;
- Pad timbre;
- Sample instrument/articulation/envelope/playback policy;
- Granular voice processing content;
- EQ coefficients and gains;
- Insect voice content when measurements justify pooling;
- harmony chord-slot banks, sequence banks, and reusable harmonic context;
- parameter behavior belonging to those canonical keys.

### Slot and state binding

Bindings stay outside portable hashes:

- destination slot/page/lane identity;
- selected Synth source or Drum target mask;
- source preset identity/hash relation;
- enabled, mute, solo, level, and gain;
- delay, reverb, diffuse, degrade, granular, dynamics, and bus sends/routes;
- Synth voice mask;
- current editor selection, playhead, hit counters, gestures, and generated output;
- active harmony bank selection, morph position, current step, and transport context;
- sequencer chains and face placement that coordinate multiple sequencer component groups.

### Named identity

Preset name, description, tags, author, visibility, timestamps, colors, ratings, and browser organization never participate in portable content hashes.

### Derived runtime cache

Resolved morphed Pad, Drum, Granular, and Water values are runtime cache data when they can be deterministically reconstructed from immutable endpoints plus morph and sparse overrides. They are not separately authoritative state.

## Target Content Types And Ref Slots

| Content type | Canonical ref-slot examples | Reuse boundary |
| --- | --- | --- |
| `sequencerTrigger/v1` | `sequencer.synth.0.trigger`, `sequencer.drums.5.trigger` | Trigger clip plus probability/ratchet/conditions |
| `sequencerSubLane/v1` | `sequencer.synth.0.pitch`, `.expression`, `.morph` | One pool per semantic sub-lane kind across compatible slots |
| `sequencerLaneControl/v1` | `sequencer.synth.0.control` | Clock/swing/link/evolve/play capability for one group |
| `granularVoice/v1` | `granular.voice.0` through `.3` | One pool for modern Granular lanes |
| `padVoice/v1` | `pad.voice.0`, `pad.voice.1` | One canonical Pad core plus versioned optional extension |
| `sampleVoice/v1` | `sample.voice.0`, `sample.voice.1` | One pool excluding slot mix/routing |
| `dynamicsEq/v1` | `dynamics.eq.0`, `dynamics.eq.1` | One EQ pool |
| `insectsVoice/v1` | `earth.insects.0`, `earth.insects.1` | Conditional on measured net savings |
| `harmonyChordBank/v1` | `harmony.program.chord-bank-a`, `-b` | Reusable ordered chord-slot bank |
| `harmonySequenceBank/v1` | `harmony.program.sequence-bank-a`, `-b` | Reusable ordered sequence bank |
| `harmonyContext/v1` | `harmony.program.context` | Root, scale, tension, and voicing as one group component |
| `sequencerArrangement/v1` | `sequencer.arrangement.synth`, `.drums` | Chains/faces only if large enough to justify a child |
| `mixRouting/v1` | `mix.routing` | Conditional single coarse matrix; never per route |

Destination ref slots remain independent even when they point to the same content hash.

## Canonical Schema Requirements

Every content type must have a dedicated persisted schema. Do not hash arbitrary subsets of `SliderState` or metadata.

Each envelope must:

1. include a stable content type and schema version;
2. use slot-independent canonical keys;
3. normalize omitted/default/undefined values to one representation;
4. normalize numeric edge cases and clamp once before hashing;
5. sort object keys and serialized map entries through the canonical JSON path;
6. preserve ordered arrays where order is musical meaning;
7. remove trailing data that cannot affect playback or editor round trips;
8. reject or explicitly namespace unknown extensions;
9. exclude bindings, UI identity, timestamps, labels, and preset names;
10. produce golden canonical JSON and golden hash fixtures.

A canonical JSON change requires a new schema version. Existing hashes must never silently change meaning.

### Sequencer content-ref group

One sequencer slot is a ref-slot namespace, not one monolithic payload. Its active components are:

- `trigger`: effective steps, hits, rotation, trigger clip, manual edits, probability, ratchet, and trigger conditions;
- `pitch`: enabled state, independent length/direction/indexing, values, explicit portable pitch representation, mode, root, scale, and source-independent binding mode;
- `expression`, `morph`, `distance`, `nudge`, `slice`, and `reverse`: each active subsequencer's length, direction, indexing/range mode, and values;
- `control`: clock division, swing, intrinsic linked behavior, evolve configuration, and optional play/arp capability configuration.

Disabled/default subsequencers omit their component refs when deterministic defaults are sufficient. A canonical group signature is computed from sorted `(component slot, content type, content hash)` tuples for no-op detection, but it does not require another stored payload row.

Every component excludes lane number, page, selected source, target mask, voice mask, lane enabled/mute/solo, output level, routing, source preset, and transient playback position.

### Shared slot adapters

Canonical content is translated at the runtime boundary:

- Pad canonical keys to Pad 1 or Pad 2 keys;
- Granular canonical keys to Voice 1-4 prefixes;
- Sample canonical keys to Sample 1 or Sample 2 prefixes;
- EQ canonical keys to EQ 1 or EQ 2 prefixes;
- trigger and subsequencer content to Synth or Drum runtime arrays with capability validation.

Adapters must not reinterpret unsupported fields. They either apply supported semantics, ignore explicitly optional unsupported capabilities, or return a structured recovery warning.

## Generic Direct Content-Ref Model

Prefer a generic table rather than a pattern-only table:

```sql
create table public.preset_version_content_refs_v2 (
  version_id uuid not null references public.preset_versions_v2(id) on delete cascade,
  ref_slot text not null,
  content_hash text not null references public.preset_payloads_v2(hash),
  content_type text not null,
  created_at timestamptz not null default now(),
  primary key (version_id, ref_slot)
);
```

This is a target concept, not migration SQL to copy blindly. Inspect the live schema, migration conventions, grants, RPCs, and query plans first.

`ref_slot` is a hierarchical group/component path. The prefix identifies the destination group and the final segment identifies its component. No extra group row or monolithic group payload is required. Save/no-op logic derives a group signature by hashing the canonical sorted component-ref tuples plus any explicitly inline group state.

Required database behavior:

- content refs and payloads save atomically with identity/version/preset refs;
- detail reads return all refs and unique payloads in one bounded response;
- `(version_id, ref_slot)` and hash-maintenance access are indexed;
- foreign-key columns are indexed where PostgreSQL does not provide an equivalent index;
- payload access is authorized through visible parent versions;
- clients cannot enumerate or probe arbitrary private hashes;
- orphan detection counts direct content refs before deleting payloads;
- no N+1 query or one-RPC-per-child path is introduced.

## General Save Pipeline

1. Resolve and normalize the runtime snapshot once.
2. Extract named sound refs and compact L4 binding/global state.
3. Build canonical candidate payloads from the ownership registry.
4. Preserve endpoint hashes/morph/sparse overrides without hydrating derived runtime values into storage candidates.
5. Canonicalize each unique candidate once and memoize by canonical string.
6. Hash unique canonical strings in parallel through the existing Web Crypto path.
7. Bulk-probe payload existence without exposing cross-owner existence to clients.
8. Insert missing payloads and direct refs in batches.
9. Strip child-owned values and relocated metadata from parent hashes.
10. Include direct refs in semantic no-op/version signatures.
11. Save identity, version, preset refs, content refs, metadata, and payloads atomically.

## General Load Pipeline

1. Load the target identity/version, compact override, metadata, preset refs, and direct content refs.
2. Collect unique hashes required by the complete graph.
3. Fetch missing payloads in one detail RPC and use the local hash cache.
4. Validate content type and schema version before applying any node.
5. Hydrate sound content without mutating sequencers.
6. Hydrate pattern and reusable voice content through destination adapters.
7. Reconstruct derived endpoint/morph state at the runtime boundary.
8. Apply slot bindings after portable content so routing cannot be overwritten.
9. Apply arrangement, harmony, remaining metadata, and global state.
10. Emit structured recovery warnings and use deterministic silent/empty/default fallbacks for missing or unauthorized nodes.

Loading a named leaf preset targets only the requested sound, pattern, or module. It never applies unrelated L4 bindings.

## Coding Execution Contract

### Phase discipline

1. Implement phases in dependency order. Do not start a dependent phase until the preceding exit gate is automated and green.
2. Keep schema/domain work separate from React integration and database transport.
3. Make every database migration additive and backward-readable on first deployment.
4. Deploy readers for both legacy and new formats before enabling new-format writes.
5. Retain the expanded resolved snapshot during graph rollout; remove it only in Phase 11.
6. Do not dual-write obsolete source-coupled sequencer children after the new write path is enabled.
7. Do not combine storage work with DSP, generated product bindings, UI redesign, or unrelated cleanup.
8. Record measured bytes, rows, requests, and CPU after every phase that changes persistence shape.
9. Stop on semantic mismatch, authorization ambiguity, or non-deterministic reconstruction. Do not mask those failures with default hydration.

### Dependency order

| Phase | Depends on | Primary deliverable |
| --- | --- | --- |
| 0 | None | Baseline fixtures and corpus/storage report |
| 1 | 0 | Six-lane fix and authoritative ownership registry |
| 2 | 1 | Database-independent canonical content domain |
| 3 | 2 | Sequencer component extraction, grouping, and adapters |
| 4 | 3 | Generic direct-ref schema, RPCs, RLS, and maintenance |
| 5 | 4 | Graph-first sequencer save/load behind the existing resolved fallback |
| 6 | 5 | Granular/EQ exact shared pools and measured Insect decision |
| 7 | 5 | Compact endpoint/morph/override persistence |
| 8 | 6 and 7 | Shared Pad and Sample pools |
| 9 | 5 and 8 | Metadata relocation and grouped harmony refs |
| 10 | 6-9 | Complete legacy migration-on-save behavior |
| 11 | 10 | Expanded snapshot reduction |
| 12 | 11 | Optional candidates supported by measurements |
| 13 | 12 | Dead-path cleanup and final evidence |

Phases 6 and 7 may be developed independently after Phase 5, but Phase 8 requires both.

### Required verification suites

Run the narrow phase tests during development and the following repository suites at every phase exit where their domain is affected:

```bash
npm run type-check
npm run test:preset-metadata
npm run test:preset-dedup
npm run test:preset-exact-load
npm run test:preset-hash-golden
npm run test:preset-sequencer-hash-coverage
npm run test:preset-soft-delete
npm run core:product:sequencer-lane-count
```

For database phases, also run:

```bash
npm run audit:preset-v2
npm run audit:supabase-security
npm run audit:supabase-egress
npm run audit:supabase-api-surface
npm run audit:supabase-optimization-db-proof
```

Do not treat an unavailable credentialed database suite as passing. Record it as an unresolved rollout gate.

Add these focused suites as part of the indicated phases and expose them as npm scripts:

| New suite | Added in | Required coverage |
| --- | --- | --- |
| `test:preset-content-ownership` | Phase 1 | Exactly one owner per moved key; six-lane count coverage |
| `test:preset-content-nodes` | Phase 2 | Canonical JSON, schema versions, adapters, group signatures, golden hashes |
| `test:preset-sequencer-components` | Phase 3 | Trigger/subsequencer isolation, cross-page compatibility, source independence |
| `test:preset-direct-content-refs` | Phase 4 | Atomic refs, RLS visibility, bulk reads, rollback, orphan reachability |
| `test:preset-graph-authority` | Phase 5 | Graph versus resolved parity, missing component recovery, binding order |
| `test:preset-shared-component-pools` | Phases 6 and 8 | Granular, EQ, Pad, Sample, and measured Insect cross-slot hashes |
| `test:preset-derived-compaction` | Phase 7 | Endpoint/morph/sparse override exact hydration and fallback |
| `test:preset-metadata-ownership` | Phase 9 | Modes/ranges, refs, `presetPool`, harmony groups, summaries, mute groups |
| `test:preset-legacy-content-migration` | Phase 10 | Legacy reads and canonical migration-on-save |

Every new npm script must run deterministically without network access unless its name explicitly denotes a database integration suite.

### Rollout sequence

1. Add canonical readers/writers and tests without changing production writes.
2. Apply additive direct-ref schema/RPC/RLS changes.
3. Deploy readers that understand both direct refs and all legacy representations.
4. Enable new direct-ref writes while retaining expanded resolved snapshots.
5. Compare graph reconstruction against resolved snapshots and emit mismatch diagnostics without silently preferring graph data.
6. Make graph reconstruction authoritative only after mismatch rate is zero for the regression corpus and production sampling window.
7. Stop obsolete writes, migrate naturally on next save, then reduce resolved snapshots in Phase 11.

### Global stop conditions

Stop the rollout and do not advance phases when any of the following occurs:

- canonical V1 JSON or a golden hash changes without an intentional schema-version increment;
- graph reconstruction differs from the retained resolved snapshot for any supported fixture;
- a sound-only load mutates sequencer or binding state;
- a subsequencer load mutates trigger, another subsequencer, or selected sound source;
- a private payload can be read or its existence probed without an authorized parent ref;
- atomic failure leaves a version, ref, or payload graph partially committed;
- detail/save request count becomes proportional to component count;
- orphan cleanup marks a directly referenced payload as unreachable;
- total representative storage increases after mandatory product-boundary rows are included, unless the increase is explicitly attributable to a locked semantic boundary such as `harmonyContext` and the overall program still meets its storage budget;
- save CPU, cold load, warm load, or egress exceeds the recorded budget without an approved mitigation.

## Implementation Phases

### Phase 0: Baseline And Corpus Measurement

- [x] Verify the D1-D8 decision summary is reflected in every fixture expectation.
- [x] Re-verify every current-state fact against the implementation and live schema.
- [x] Run the existing preset metadata, dedup, exact-load, hash, soft-delete, and sequencer regression suites.
- [x] Measure representative L4 resolved bytes, metadata bytes, payload/ref/version row counts, detail-RPC bytes, query count, save CPU, cold load, and warm load.
- [x] Add a read-only corpus report for total refs, unique normalized hashes, median/p95 payload size, and projected net savings by candidate.
- [x] Implement that report as `scripts/audit-preset-content-pool-opportunities.mjs` with deterministic JSON output and no writes unless an explicit output path is supplied.
- [x] Record the reviewed baseline in `docs/PRESET_CONTENT_HASH_BASELINE.md`, including fixture/corpus provenance and unavailable database evidence.
- [x] Capture fixtures for Synth/Drum patterns, Pad morphs and edits, all Drum voice morphs, Granular, Water, Samples, EQ, harmony, routing mute groups, and legacy L4 versions.

Exit gate: D1-D8 fixture expectations are locked, existing suites are green, and the baseline report is reviewed and stored.

### Phase 1: Correctness Fix And Ownership Registry

- [x] Replace the hard-coded Drum pitch-settings count in `src/App.tsx` with `DRUM_EUCLIDEAN_LANE_COUNT`.
- [x] Add a regression proving all six Drum pitch settings save and restore.
- [x] Audit other sequencer save paths for four-lane assumptions and use shared lane-count constants.
- [x] Add one ownership registry classifying every moved key as portable content, slot binding, arrangement/global state, identity metadata, or derived runtime cache.
- [x] Make ownership overlap and unowned-key checks fail tests.

Exit gate: `test:preset-content-ownership` passes, six-lane Drum metadata round-trips, and every affected key has exactly one owner.

### Phase 2: Canonical Content Foundation

- [x] Add focused content-envelope types, canonicalizers, validators, and adapter interfaces.
- [x] Add shared canonical hashing that performs normalization once.
- [x] Add canonical parameter-behavior representation combining slider mode and optional range.
- [x] Add golden JSON/hash fixtures and schema-versioning tests.
- [x] Add in-save memoization for duplicate canonical payloads.
- [x] Keep this domain logic outside `SupabasePresetStore.ts`.

Suggested modules:

- `src/presets/contentNodes.ts`
- `src/presets/contentOwnership.ts`
- `src/presets/contentCanonicalization.ts`

Exit gate: `test:preset-content-nodes` passes without database or React dependencies and golden hashes are committed.

### Phase 3: Sequencer Component Groups And Sound Decoupling

- [x] Add `sequencerTrigger/v1`, `sequencerSubLane/v1`, and `sequencerLaneControl/v1` extraction and validation.
- [x] Implement Synth and Drum component adapters with explicit pitch representation.
- [x] Partition flat sequencer metadata into each slot's trigger, active subsequencers, and lane-control component.
- [x] Keep probability, ratchet, and trigger conditions in the trigger component because they are indexed to trigger steps.
- [x] Put pitch settings and source-independent pitch-binding mode in the pitch subsequencer component.
- [x] Compute a canonical sequencer-group signature from sorted component refs for no-op detection without storing a duplicate monolithic payload.
- [x] Keep source, target/voice masks, enabled/mute/solo, gain, and routing in L4 bindings.
- [x] Remove sequencer fields from new L3 Synth/Drum child extraction.
- [x] Stop writing the combined source-level `euclideanPattern` child on new saves.
- [x] Ensure direct L3 loads never call sequencer restore paths.
- [x] Add sound-only, full-sequence, and single-subsequencer load regressions.

Exit gate: `test:preset-sequencer-components` passes; source/binding changes do not alter component hashes, changing pitch does not alter trigger/modulation hashes, and sound loads do not mutate sequencers.

### Phase 4: Generic Direct Content Refs

- [x] Verify current official Supabase guidance, installed CLI behavior, live policies, grants, and atomic RPCs.
- [x] Create the migration through the repository's Supabase migration workflow.
- [x] Add the generic content-ref table, constraints, indexes, RLS, and grants.
- [x] Authorize refs through indexed parent version/preset visibility predicates, not merely `TO authenticated`.
- [x] Prefer security-invoker behavior; do not add a broadly callable `SECURITY DEFINER` bypass for permission failures.
- [x] Validate hierarchical `ref_slot` and `content_type` combinations at the domain boundary and reject duplicate component slots in one version.
- [x] Preserve one immutable payload row per hash under concurrent saves using the existing conflict-safe insert convention.
- [x] Extend atomic save RPC input for batched direct refs and payloads.
- [x] Extend detail/read RPC output to return direct refs and unique payloads in bulk.
- [x] Extend maintenance, reachability, orphan cleanup, export/import, and integrity audits.
- [x] Revoke browser table access that would permit arbitrary payload/hash probing; expose content only through narrow parent-authorized RPCs.
- [x] Verify authenticated private/public reads, cross-owner dedup writes, conflicts, rollbacks, and non-enumerability.
- [x] Prove a caller cannot distinguish whether an unreferenced private hash already exists.
- [x] Run database advisors and explain representative query plans.

Exit gate: `test:preset-direct-content-refs` and credentialed database audits pass; an atomic transaction stores and loads generic direct refs without hidden derived preset wrappers.

### Phase 5: Graph-First Sequencer Save And Load

- [x] Extract four Synth and six Drum lanes through data-driven counts.
- [x] Write deterministic grouped refs such as `sequencer.synth.N.trigger`, `.pitch`, and `.expression` for active components.
- [x] Omit disabled/default subsequencer refs when canonical default hydration is unambiguous.
- [x] Include each group's sorted component signature in semantic no-op detection.
- [x] Strip lane-owned fields from L4 overrides and metadata.
- [x] Bulk fetch every unique trigger/subsequencer/control payload and hydrate through slot adapters.
- [x] Apply bindings after component-group hydration.
- [x] Add missing/corrupt/unauthorized payload recovery warnings.
- [x] Make L4 load pass with `resolved_hash = null`.
- [x] Adapt existing named Euclidean sequence presets to V1 on read and emit V1 on next save.

Exit gate: `test:preset-graph-authority` passes; reused components produce one payload and multiple refs, and graph-only load exactly matches the retained resolved snapshot.

### Phase 6: Exact Existing Cross-Slot Pools

- [x] Convert Granular Voice 1-4 to one `granularVoice/v1` canonical pool while retaining four refs and lane enable/gain in the kit binding.
- [x] Convert Dynamics EQ 1/2 to one `dynamicsEq/v1` pool while retaining two refs and parent bypass/enable state.
- [x] Convert Insect 1/2 only if direct refs or existing graph shape make measured net savings positive.
- [x] Add canonical key adapters and cross-slot golden hashes.
- [x] Remove new writes to obsolete scope-specific internal payload identities after compatibility tests pass.

Exit gate: the Phase 6 cases in `test:preset-shared-component-pools` pass and equivalent content shares hashes without increasing request count.

### Phase 7: Preserve Compact Derived State Through V2

- [x] Stop rehydrating optimized state before storage decomposition.
- [x] Represent selected/end-point presets by immutable versioned content hashes rather than mutable names alone.
- [x] Store morph position and sparse authoritative overrides.
- [x] Implement deterministic hydration for Pad 1/2, each separate Drum engine, Granular, and Water.
- [x] Preserve a full canonical fallback when an endpoint is missing or derivation is not stable.
- [x] Add exact-load tests for no edits, one edit, many edits, missing endpoint, historical factory content, and legacy expanded data.
- [x] Prove this change does not create one generic Drum schema or pool.

Exit gate: `test:preset-derived-compaction` passes; V2 no longer re-expands omitted values and hydrated runtime state remains exact.

### Phase 8: Pad And Sample Shared Pools

- [x] Add `padVoice/v1` using canonical Pad 1 keys and destination adapters.
- [x] Define the Pad 1-only `detune` field as a versioned optional extension or explicit destination capability.
- [x] Store Pad A/B endpoint hashes, morph, and sparse overrides according to D2.
- [x] Add `sampleVoice/v1` from the shared Sample 1/2 schema.
- [x] Exclude enable, level, Delay A/B, reverb, diffuse, and bus routing according to D3.
- [x] Preserve Sample library, role, articulation, selection, dynamics, variant, envelope, looping, voice limit, distance, post-filter, and stereo width in content.
- [x] Add cross-slot, binding-isolation, and legacy tests.

Exit gate: all `test:preset-shared-component-pools` cases pass and Pad/Sample slots independently reference shared hashes.

### Phase 9: Metadata And Structured L4 Allocation

- [x] Move parameter behavior maps to their owning coarse content nodes; keep one compact L4 map for global-only controls.
- [x] Remove `refs` from new V2 metadata payloads and reconstruct the legacy in-memory field from relational refs.
- [x] Apply D4: persist the active `presetPool` through the existing user/device preference boundary and remove it from new L4 metadata writes.
- [x] Ensure loading a legacy L4 `presetPool` does not overwrite the current user/device preference.
- [x] Add a deterministic-generation regression proving state playback does not depend on legacy `presetPool` restoration.
- [x] Add grouped `harmonyChordBank/v1`, `harmonySequenceBank/v1`, and `harmonyContext/v1` refs according to D5.
- [x] Keep active bank, morph position, enabled state, current step, transport, and generated output outside harmony content hashes.
- [x] Keep `journeyPreview` inline as a small denormalized summary.
- [x] Keep routing mute groups on their existing content-addressed scene model.
- [x] Classify Synth sequencer faces and Synth/Drum chains as arrangement state; add one coarse arrangement child only if measurements justify it.
- [x] Evaluate one coarse `mixRouting/v1` node; do not split it by source or route.

Exit gate: `test:preset-metadata-ownership` passes; metadata has one source of truth per field and no duplicated relational refs.

### Phase 10: Legacy Migration-On-Save

- [x] Read existing flat sequencer metadata, combined Euclidean children, scope-prefixed voices, expanded derived state, and embedded refs.
- [x] Load legacy versions without writing or mutating them.
- [x] Convert to canonical direct refs only when a new version is saved.
- [x] Preserve immutable content versions for endpoint refs.
- [x] Verify old and migrated versions reconstruct equivalent runtime state.
- [x] Add telemetry/audit counters for legacy-read frequency before removing any reader.

Exit gate: `test:preset-legacy-content-migration` passes; migration requires no bulk rewrite and produces no audible or musical changes.

### Phase 11: Expanded Snapshot Reduction

- [x] Make compact graph checkpoints authoritative for all new L4 versions.
- [x] Stop writing expanded resolved payloads for historical L4 versions.
- [x] Measure graph-first cold and warm load latency.
- [x] Retain a flattened latest cache only if measured latency justifies its bytes and invalidation cost.
- [x] Make cache eviction and deletion safe.
- [x] Update maintenance reports with removable resolved bytes and cache hit rates.

Exit gate: `test:preset-graph-authority`, exact-load, maintenance, and soft-delete suites pass with historical `resolved_hash` absent; cache deletion cannot change correctness or recoverability.

### Phase 12: Conditional Low-Value Candidates

- [x] Evaluate common Lead 1/2 settings without duplicating the existing `lead4opfm` timbre pool.
- [x] Evaluate Reverb spectral-freeze extraction only if independent reuse is demonstrated.
- [x] Evaluate coarse mix/routing and sequencer-arrangement children against net savings.
- [x] Reject candidates whose payload savings do not exceed row/index/query/CPU cost.
- [x] Record rejected candidates and measurements so they are not repeatedly reconsidered without new evidence.

Exit gate: every optional child has measured positive net value.

### Phase 13: Cleanup, Evidence, And Documentation

- [x] Remove dead source-coupled and hidden-derived write paths after rollout gates pass.
- [x] Keep compatibility readers behind measured deprecation criteria.
- [x] Update migration, rollout, maintenance, export/import, and canonical-schema documentation.
- [x] Record before/after database bytes, row counts, request counts, save CPU, cold load, warm load, and cache behavior.
- [x] Run the full preset, architecture, Supabase security, egress, and product CPU gates.

Exit gate: production evidence demonstrates lower total storage with bounded CPU and request count.

## Candidates Explicitly Excluded From Fine-Grained Hashing

- one unified Drum voice pool;
- one child for each Drum morph-control strip;
- one child per Clocked Space tape head;
- one shared pool across Lead Delay, Echo Line, and Clocked Space;
- merging legacy and modern Granular engines;
- per-field, per-slider, per-range, per-route, per-send, per-chord, or per-step payload rows;
- further splitting small Dynamics End Chain, saturation, drift, or erosion submodules without evidence;
- a child for `journeyPreview`;
- a combined hash containing all sequencer lanes.

Arrays and canonical compact objects may still replace repeated prefixed scalar keys without creating extra database children.

## Required Regression Matrix

| Scenario | Required result |
| --- | --- |
| Drum pitch settings lanes 1-6 save/load | All six round-trip |
| Same trigger in two Synth slots | One trigger hash, two grouped refs |
| Same compatible trigger/subsequencer in Synth and Drum | One component hash when canonical semantics match |
| Same sequencer group with different source, gain, enabled state, or routing | Same component hashes and group signature |
| Pitch/register changes | Pitch hash and group signature change; trigger and unrelated sub-lane hashes do not |
| Same pitch with a different trigger | Same pitch hash in two sequence groups |
| Single expression/morph sub-lane changes | Only that component hash and group signature change |
| Synth capability data differs | Hash changes only when supported behavior differs |
| Load sound preset | No pattern or binding change |
| Load named sequence group | Its component refs change; source binding does not |
| Load named pitch subsequencer | Pitch changes; trigger and other subsequencers do not |
| Granular Voice 1 and 4 equivalent | One content hash, independent refs |
| EQ 1 and EQ 2 equivalent | One content hash, independent bypass bindings |
| Pad 1 and Pad 2 equivalent | One canonical content hash |
| Sample 1 and Sample 2 equivalent | One content hash; mix remains unchanged |
| Derived endpoint state with no edits | Endpoint refs/morph only; exact hydration |
| Derived endpoint state with manual edits | Sparse overrides; exact hydration |
| Missing historical endpoint | Full fallback or explicit recovery warning |
| Parameter behavior differs | Owning content hash changes; unrelated hashes do not |
| Relational refs reconstructed | No duplicate V2 metadata copy required |
| Load legacy L4 | Existing runtime result preserved |
| Save legacy L4 as new version | Canonical direct refs emitted |
| Missing content payload | Deterministic fallback; unrelated binding preserved |
| Deleted flattened cache | Graph load succeeds |
| Repeated semantic no-op save | No new version or payload rows |
| Atomic save failure | No partial version/ref/payload graph |

## Performance And Storage Gates

- no per-child, per-lane, or per-subsequencer network round trips;
- no per-field, per-cell, or per-step hashes below the subsequencer boundary;
- canonicalization once per candidate per save;
- duplicate canonical candidates hash and probe once per save;
- payload existence and insertion are batched;
- detail load returns unique hashes in one bounded response;
- cold request count does not grow linearly with child count;
- warm loads use the existing hash cache;
- no long patch-replay chain for L4 reconstruction;
- no material save CPU or load-latency regression;
- representative total bytes decrease after payload, refs, versions, indexes, and caches are counted;
- orphan cleanup remains bounded and cannot delete reachable direct content;
- authorization checks use indexed parent-ownership predicates;
- egress and CPU budgets are recorded before and after each rollout group.

## Expected Code Areas

The implementation must confirm the exact edit set, but likely areas include:

- `src/App.tsx`
- `src/presets/types.ts`
- `src/presets/codec.ts`
- `src/presets/presetStorageV2.ts`
- `src/presets/SupabasePresetStore.ts`
- `src/presets/presetUtils.ts`
- `src/presets/statePresetOptimization.ts`
- `src/presets/euclideanPatternBank.ts`
- `src/presets/routingMuteGroupPresetStorage.ts`
- `src/presets/presetPool.ts`
- `src/audio/padPresets.ts`
- `src/audio/sequencerLaneCounts.ts`
- `src/audio/sequencerChain.ts`
- `src/ui/sequencer/sequencePresetLane.ts`
- `src/ui/sequencer/stepOverrideSerialization.ts`
- `src/ui/usePresetSequencerRestore.ts`
- `src/ui/synth/SynthPage.tsx`
- `src/ui/drums/DrumPage.tsx`
- preset metadata, dedup, exact-load, hash, migration, recovery, and soft-delete tests;
- Supabase migrations, atomic save/read RPCs, RLS, maintenance, and audit scripts;
- `docs/PRESET_SUPABASE_V2_MIGRATION_PLAN.md`;
- `docs/PRESET_STORAGE_V2_SUPABASE_ROLLOUT.md`.

Prefer focused domain modules over adding more serialization and ownership logic to `SupabasePresetStore.ts`.

## Completion Gates

The work is complete only when:

1. D1-D8 are documented and automated behavior matches those decisions.
2. All six Drum pitch settings round-trip.
3. Sound preset loads never mutate sequencers or slot bindings.
4. Every sequencer lane has an independent ref group, with one direct content ref for each active trigger/subsequencer/control component.
5. Equivalent Granular, Pad, Sample, and EQ content shares canonical hashes across compatible slots.
6. Derived Pad, Drum, Granular, and Water state does not duplicate deterministically reconstructable values.
7. V2 metadata no longer duplicates relational refs.
8. Parameter behavior has one clear owner.
9. Graph-only L4 load succeeds without an expanded resolved snapshot.
10. Legacy presets load and migrate on save without data loss.
11. RLS, grants, atomic rollback, orphan cleanup, and database advisors are clean.
12. Before/after evidence shows lower total bytes without material CPU, latency, request-count, or egress regressions.
13. Rejected fine-grained candidates remain excluded unless new measurements overturn the decision.

## Recommended Commit Boundaries

1. six-lane Drum fix, ownership registry, and tests;
2. canonical content foundation and golden fixtures;
3. sequencer schema/adapters and sound decoupling;
4. generic direct content-ref schema, RLS, RPC, and maintenance;
5. graph-first sequencer save/load and recovery;
6. Granular/EQ exact shared pools;
7. compact derived-state persistence;
8. Pad/Sample shared pools;
9. metadata, harmony, and catalog-pool allocation;
10. legacy migration-on-save;
11. resolved-snapshot reduction and performance evidence;
12. conditional measured candidates and cleanup.

Do not combine unrelated audio-engine artifacts, UI redesign, or generated runtime changes with this storage program.
