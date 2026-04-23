# Preset Loading And Saving Audit

Date: 2026-04-21

## Bottom line

The current preset system is functionally solid for loading and round-tripping presets, and it already has a good ownership model for individual parameters. The main strength is that every preset-owned key is assigned to a single canonical level/scope in `src/presets/ParamRegistry.ts`, and load paths consistently reconstruct compressed versions with `getVersionData()` before applying them.

It is not currently the most optimal or scalable design for higher-level saves, especially L3 source presets and L4 state presets. The system avoids overlap in ownership, but it does not avoid overlap in stored payloads. Higher levels intentionally save cascaded child data, so the same synth, drum, kit, and global data can be duplicated across many parent presets and versions. That is correct for reproducibility, but it is not normalized and it is not the best long-term storage strategy.

For the specific case "the synth is not an L1 preset but has a couple of modified parameters, and then the user saves the L4 state": yes, the current method works, but no, it is not the most optimal or scalable implementation. The current L4 save stores a full snapshot of the whole preset-owned state instead of storing references plus local overrides.

## What the system does today

### 1. Parameter ownership is mostly clean

- `PARAM_REGISTRY` is the canonical ownership map. Each key is assigned one level and one scope, which is the right foundation for a hierarchical preset system.
- Relevant files:
  - `src/presets/ParamRegistry.ts`
  - `src/presets/codec.ts:126`
  - `src/presets/codec.ts:149`

Assessment:

- This part is good.
- It gives the system a clear answer to "who owns this parameter?"
- That means overlap is mostly avoided at the model level.

### 2. Stored payloads are intentionally overlapping at higher levels

- `extractCascade()` stores child scopes inside parent presets.
- For L4, `getCascadeKeys(4)` returns the entire registry, so state presets save all preset-owned keys.
- For L3, page-level `customExtract` functions also intentionally include lower levels:
  - Drums source includes L1 `drumEuclidean` and L2 `drumKit`: `src/ui/drums/DrumPage.tsx:176`
  - Synth source includes L1 `synthEuclidean`, L1 `leadDelay`, and L2 kits: `src/ui/synth/SynthPage.tsx:835`
  - Granular scene includes L1 voices, L2 kit, and L3 source: `src/ui/granular/GranularPage.tsx:281`

Assessment:

- This is where the system stops being storage-optimal.
- There is no overlap in ownership, but there is definitely overlap in saved data.
- In other words: the system is hierarchical in concept, but snapshot-based in storage.

### 3. Save behavior is snapshot-first, not reference-first

- `usePresets.save()` extracts either the direct slice or the full cascade, then stores that extracted object as version data: `src/presets/usePresets.ts:110`
- The data is stored directly in `PresetVersion.data`, not as references to child presets: `src/presets/types.ts:33`, `src/presets/types.ts:54`
- The types already support `refs`, but I did not find any save path that actually populates them.

Assessment:

- The current implementation prioritizes reliable replay over normalized storage.
- That is a safe early-stage choice, but it leaves a lot of duplication on the table.

## Audit answers to the main questions

### Is there really "no overlap between levels"?

Short answer:

- No overlap in canonical ownership: mostly yes.
- No overlap in stored data: no.

Why:

- The registry model is clean.
- The save model is deliberately overlapping at L3 and L4.
- A state preset currently contains its own full copy of all preset-owned values, including data that already exists inside engine, kit, and source presets.

Conclusion:

- The architecture is partially hierarchical.
- The persistence model is still flattened snapshots.

### Are preset versions working in the most optimal way?

Short answer:

- Good enough for bounded local usage.
- Not optimal for cloud storage, long histories, or heavy editing.

Current behavior:

- Versions are stored inline inside each preset entry as an array: `public/presets/supabase_migration.sql:32`
- Both local and cloud stores compress versions on save: `src/presets/PresetStore.ts:75`, `src/presets/SupabasePresetStore.ts:175`
- Compression keeps at most 5 versions, preserves `v1` as a full snapshot, and stores `v2+` as deltas against `v1`: `src/presets/codec.ts:184`, `src/presets/codec.ts:211`

What is good:

- Storage is bounded.
- Restore logic is simple and deterministic.
- It avoids unbounded version growth inside the client.

What is not optimal:

- Every cloud save rewrites the full preset row, including the whole `versions` JSONB array: `src/presets/SupabasePresetStore.ts:183`, `src/presets/SupabasePresetStore.ts:222`, `src/presets/SupabasePresetStore.ts:226`
- Deltas are always computed against the original `v1`, not against the previous retained version: `src/presets/codec.ts:230`
- If a preset drifts far away from `v1`, the stored deltas get larger and less efficient.
- Keeping the original `v1` forever means the compression base can become semantically stale even when the current preset has moved far away from it.

Conclusion:

- The current versioning model is acceptable as a bounded client-side strategy.
- It is not the most efficient design for database writes, database size, or long-term preset evolution.

### If the synth is not an L1 preset but has a few manual tweaks, is saving that through L4 optimal?

Short answer:

- It is correct.
- It is not optimal.

Current behavior:

- An L4 save captures the full current state of all preset-owned keys via cascade extraction.
- That means the modified synth values are preserved even if they do not correspond to a named L1 preset.

Why that is good:

- No dependency on child preset existence.
- The saved state can fully restore what the user heard.
- The user does not need to separately save an engine preset first.

Why that is not optimal:

- A small synth tweak inside a global state save duplicates the entire synth subtree inside that L4 preset version.
- The same synth subtree may then also be duplicated in source presets and engine presets elsewhere.
- Repeated L4 saves will keep re-storing similar large snapshots instead of storing a small synth-specific override.

Conclusion:

- The current behavior is user-safe and correct.
- It is not normalized, and it will scale poorly if the preset library grows or cloud usage becomes heavier.

## Important findings

### Finding 1: L4 state saves do not fully capture all live preset-state metadata

The type system supports richer state metadata:

- `dualRanges`
- `sliderModes`
- `drumEvolveConfigs`
- `synthEvolveConfigs`
- `drumSubLaneStates`
- `synthSubLaneStates`
- `synthPitchBindingModes`

Relevant files:

- `src/presets/types.ts:33`
- `src/App.tsx:558`

However, the current `PresetFamilyTree` save path only passes `dualRanges` and `sliderModes` into the new preset system:

- `src/presets/PresetFamilyTree.tsx:605`
- `src/presets/PresetFamilyTree.tsx:651`
- `src/presets/PresetFamilyTree.tsx:725`

`usePresets.save()` preserves metadata from the existing saved version if it already exists, but it does not read the current live evolve/sub-lane/pitch-binding state on its own:

- `src/presets/usePresets.ts:129`
- `src/presets/usePresets.ts:154`

What this means:

- A brand new L4 preset created from the new UI can miss evolve configs, sub-lane states, and synth pitch binding modes.
- An existing L4 preset may keep stale metadata if the live evolve or pitch-binding state changed since the last save.

Assessment:

- This is the most important correctness gap I found.
- It is a state-capture problem, not just a storage-efficiency problem.

### Finding 2: The system already has the shape for hierarchical refs, but does not use it

The model already includes:

- `PresetRef`
- `PresetVersion.refs`

Relevant files:

- `src/presets/types.ts:54`
- `src/presets/presetUtils.ts:291`

But I did not find any save caller that writes `refs`.

What this means:

- L4 state presets cannot say "this state uses synth source preset X version Y, plus these 3 overrides."
- L3 source presets cannot say "this source uses pad kit A and lead delay preset B."
- The current system can search for refs, but it does not actually create a real preset graph.

Assessment:

- This is the main reason the current system duplicates so much data.
- The design is clearly heading toward references, but the implementation is still materialized snapshots.

### Finding 3: Factory state preset seeding flattens bundled version history

When state presets are seeded from `/public/presets/*.json`, the loader takes only the latest version data and wraps it as a new single-version factory preset:

- `src/presets/factoryPresets.ts:352`
- `src/presets/factoryPresets.ts:366`
- `src/presets/factoryPresets.ts:368`

What gets lost during that conversion:

- Existing version history
- Existing version metadata
- Any pre-authored references

Assessment:

- This is not the highest-priority issue, but it weakens the versioning story for bundled state presets.

### Finding 4: State and journey keys are not scope-aware in storage

`makePresetKey()` intentionally ignores scope for `state` and `journey`:

- `src/presets/presetUtils.ts:207`
- `src/presets/presetUtils.ts:208`

Assessment:

- This is fine for the current app because state presets are effectively global.
- It will become a limitation if you later want multiple independent L4 or journey namespaces.

## Recommended target model

The best long-term design is:

- L1 presets store only L1-owned keys.
- L2 presets store only L2-owned keys plus refs to L1 children when needed.
- L3 presets store only L3-owned keys plus refs to L1/L2 children.
- L4 presets store only true global/state keys plus refs to L3 presets.
- Overrides are stored only for the parts that differ from the referenced child preset.

For the "modified synth inside an L4 save" case, the ideal saved shape is conceptually closer to this:

```json
{
  "type": "state",
  "data": {
    "masterVolume": 0.78,
    "rootNote": 2,
    "scaleMode": "auto"
  },
  "refs": {
    "synth": { "id": "preset_synth_source_123", "version": 12 },
    "drums": { "id": "preset_drums_source_456", "version": 3 },
    "granular": { "id": "preset_granular_source_789", "version": 7 }
  },
  "overrides": {
    "synth": {
      "filterCutoffMin": 820,
      "padOscMix": 0.36
    }
  }
}
```

That model keeps reproducibility, removes most duplication, and scales much better in the database.

## Improvement roadmap

| Priority | Change | Database size impact | Implementation scope | Why |
| --- | --- | --- | --- | --- |
| P1 | Centralize live state metadata capture for L4 saves | Low | Small | Fixes the current correctness gap where new L4 saves can miss evolve configs, sub-lane states, and pitch-binding modes |
| P1 | Start writing real `refs` for L3/L4 presets, plus subtree overrides | High | Medium to large | Biggest win for reducing overlap between levels and making global state saves scalable |
| P2 | Move versions out of the inline `versions` JSONB array into a `preset_versions` table | Medium to high | Medium | Reduces row rewrite amplification and makes version queries and pruning cleaner |
| P2 | Rebase delta compression on a rolling full snapshot instead of `v1` forever | Medium | Small to medium | Makes compression more efficient after many edits and reduces stale-base behavior |
| P3 | Preserve bundled state preset version history and metadata when seeding factory presets | Low | Small | Keeps authored factory history intact |
| P3 | Make `state` and `journey` keys scope-aware if future scopes are planned | Low | Small | Avoids a future namespace collision |

## Concrete next steps

### Step 1: Fix state metadata capture first

Create a single helper for L4 state save metadata that reads the live app refs currently managed in `App.tsx`, not just slider mode metadata.

Minimum metadata to include on every L4 save:

- `dualRanges`
- `sliderModes`
- `drumEvolveConfigs`
- `synthEvolveConfigs`
- `drumSubLaneStates`
- `synthSubLaneStates`
- `synthPitchBindingModes`

Why first:

- This is the highest-value correctness fix.
- It is small in scope.
- It immediately makes state presets more truthful.

### Step 2: Introduce refs plus overrides without breaking exports

Suggested migration path:

- Keep saving full `data` for backwards compatibility at first.
- Also populate `refs` for matched child presets.
- Add a new metadata field such as `overrides` for child subtree deltas.
- Update load logic to prefer `refs + overrides` when present, then fall back to `data`.

Why this path:

- Lowest-risk transition.
- Lets you test the hierarchical model before fully removing duplicated snapshots.

### Step 3: Normalize version storage in the database

Replace:

- one preset row with a growing `versions` JSONB array

With:

- one preset identity row
- many version rows
- optional `base_version_id`
- optional `is_delta`

Why:

- Better write amplification
- Better filtering and pagination
- Better future analytics
- Easier pruning and compaction

### Step 4: Rebase deltas periodically

Instead of:

- `v1` full forever
- all later versions delta-compressed against `v1`

Use:

- full snapshot every N versions
- deltas against the closest retained full base

Why:

- Better compression for long-lived presets
- Better resilience if users keep editing the same preset for a long time

## Final verdict

The current preset loading system works, and the underlying ownership model is good. The weakest part is not loading; it is higher-level saving and version storage. The system behaves like a hierarchical preset system in the UI, but it persists like a snapshot system underneath.

If the goal is correctness for a relatively small library, the current approach is acceptable.

If the goal is long-term scalability, smaller cloud rows, less duplicated state, and cleaner "L4 with modified child preset" behavior, then the next evolution should be:

1. Fix live L4 metadata capture.
2. Implement real `refs` plus subtree overrides.
3. Move version history out of the inline JSON array.
