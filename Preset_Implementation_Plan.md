# Preset Implementation Plan

> **Reference:** [Preset_Hierarchy_Plan.md](Preset_Hierarchy_Plan.md) — the
> canonical architecture doc defining L1–L5 levels, ownership rules, and data
> formats. This document is the **build plan** — what to implement, in what
> order, with what code.

> **March 25, 2026 sync note:** the live code has moved beyond the original
> draft in a few important ways:
> `src/presets/types.ts` already includes `id`, `scope`, and structured preset
> metadata;
> `src/presets/PresetStore.ts` is snapshot-first today;
> granular factory presets are intentionally deferred;
> scope-aware store keys are already live;
> and this revision aligns the old phase notes to current `granular*`
> terminology.

---

## Table of Contents

1. [Current State Audit](#current-state-audit)
2. [Architecture Decisions](#architecture-decisions)
3. [Phase 0: Foundation Types & Registry](#phase-0-foundation-types--registry)
4. [Phase 1: PresetStore Abstraction](#phase-1-presetstore-abstraction)
5. [Phase 2: File Export / Import (All Levels)](#phase-2-file-export--import-all-levels)
6. [Phase 2.5: Shared Morph Endpoint Overrides](#phase-25-shared-morph-endpoint-overrides)
7. [Phase 3: L1 Engine Presets — User Save/Load](#phase-3-l1-engine-presets--user-saveload)
8. [Phase 4: L2 Kit Presets — User Save/Load](#phase-4-l2-kit-presets--user-saveload)
9. [Phase 5: L3 Source Presets](#phase-5-l3-source-presets)
10. [Phase 6: L4 State Presets — Restructure](#phase-6-l4-state-presets--restructure)
11. [Phase 7: L5 Journey Presets](#phase-7-l5-journey-presets)
12. [Phase 8: Versioning System](#phase-8-versioning-system)
13. [Phase 9: Modified Indicator (Dirty Flag)](#phase-9-modified-indicator-dirty-flag)
14. [Phase 10: Preset Browser](#phase-10-preset-browser)
15. [Phase 11: Migration & Cleanup](#phase-11-migration--cleanup)
16. [Phase 12: IndexedDB Migration](#phase-12-indexeddb-migration)
17. [Phase 13: Cloud Sync Enhancement](#phase-13-cloud-sync-enhancement)
18. [Dependency Graph](#dependency-graph)
19. [Risk Register](#risk-register)

---

## Current State Audit

### What Exists Today

| System | Status | Notes |
|--------|--------|-------|
| **Legacy L4 state save/load** | Exists | `SavedPreset` still stores a mostly monolithic `SliderState` shape via file export/import, URL encoding, and cloud paths. |
| **Preset foundation types** | Exists | `src/presets/types.ts` already includes `PresetVersionMetadata`, optional immutable `id`, and normalized `scope`. |
| **Param registry + codec** | Exists | `src/presets/ParamRegistry.ts` and `src/presets/codec.ts` exist and are now the live source of truth for level/scope ownership. |
| **PresetStore abstraction** | Exists | `src/presets/PresetStore.ts` provides localStorage-backed save/load/list/delete plus scope-aware key compatibility. |
| **Preset hooks + UI shell** | Partial | `usePresets.ts`, `usePresetVersioning.ts`, `PresetDropdown.tsx`, and `fileIO.ts` exist, but the whole app is not yet fully driven by them. |
| **Factory seeding** | Partial | Pad, drum, water, reverb, and state factory presets seed into the store. Granular composite presets and LFO helper presets are intentionally deferred. |
| **Water factory presets** | Updated | Water factory seeding now uses the live 8-preset set, not the earlier 4-preset assumption. |
| **Granular built-ins** | Still outside store | Current granular built-ins behave like scene presets with extra metadata and are not yet safe to round-trip through the simple store shape. |
| **Earth hierarchy** | Still exceptional | Earth has partial registry coverage, but its page/audio structure is different enough that it should be treated as a special case until audited separately. |

### What Is Still Missing

| Gap | Impact |
|-----|--------|
| Full end-to-end metadata parity | `dualRanges`, `sliderModes`, evolve configs, sub-lane state, `clockDivs`, and `stepOverrides` must survive every save/load path before broad rollout. |
| Shared live morph anchor semantics | Drum voices already remember endpoint edits at runtime, but pad/water/lead-style morphers still lean on base preset recompute. Without a shared endpoint override layer, "edit A, go to B, come back to A" will stay inconsistent across engines. |
| Composite granular preset shape | Granular built-ins cannot be safely promoted into the store until L3 scene/source behavior is modeled explicitly. |
| Final Earth normalization | Water/Ocean/Insects ownership is still under audit, so Earth should not be forced into the cleaner synth/drum model yet. |
| Complete UI integration | The preset infrastructure exists, but not every page/slot is fully wired to it yet. |
| Optional live ref-following semantics | The current store is snapshot-first. True child preset resolution should be treated as future, explicit work. |
| IndexedDB / richer browser / cloud enhancements | LocalStorage is the working baseline; the larger UX/data layer is still future work. |

### Current Priority Order

1. Keep `Preset_Hierarchy_Plan.md` and `src/presets/ParamRegistry.ts` aligned.
2. Preserve non-`SliderState` metadata end to end.
3. Land shared live morph anchor semantics before broad L1 engine preset rollout.
4. Finish scope-safe and id-safe preset loading across the app.
5. Defer granular composite factory seeding until the richer shape is settled.
6. Audit Earth separately instead of over-normalizing it too early.

### Key Files in Play

| File | Role | Current Relevance |
|------|------|-------------------|
| `src/presets/types.ts` | Preset entry/version/ref types | Already carries `id`, `scope`, and structured metadata. |
| `src/presets/ParamRegistry.ts` | Canonical level/scope ownership map | Live source of truth for placements. |
| `src/presets/codec.ts` | Slice/apply helpers | Basis for save/load at each level. |
| `src/presets/PresetStore.ts` | LocalStorage preset backend | Snapshot-first implementation with scope-aware compatibility. |
| `src/presets/factoryPresets.ts` | Factory seeding | Granular/LFO intentionally deferred; water updated to 8 built-ins. |
| `src/presets/usePresets.ts` | App-facing preset API | Needs continued integration cleanup. |
| `src/ui/state.ts` | `SliderState`, metadata, URL/state serialization | Still the legacy monolith that new presets must interoperate with. |
| `src/App.tsx` | Current save/load orchestration | Still owns a lot of legacy preset flow. |
| `src/ui/granular/granularPresets.ts` | Built-in granular scenes | Main blocker for clean composite granular rollout. |
| `src/ui/earth/EarthPage.tsx` / `src/audio/engine.ts` | Earth behavior + routing | Should be audited before the Earth hierarchy is finalized. |

---

## Architecture Decisions

### AD-1: Registry + Codec Pattern

**Decision:** Single `PARAM_REGISTRY` object maps every `SliderState` key to
`{ level: 1|2|3|4, scope: string }`. Codec functions `extractParams()` /
`applyParams()` use the registry to slice/merge state at any level.

**Why:** One source of truth for ownership. Adding a new param = one line in
the registry. No scattered if/else chains.

### AD-2: localStorage First, IndexedDB Later

**Decision:** Phase 1 uses localStorage with `async` API wrapper. Phase 12
swaps the backend to IndexedDB with zero consumer changes.

**Why:** Simpler to debug, works immediately, sufficient capacity (~3000 presets).

### AD-3: Snapshot-First, Refs as Metadata

**Decision:** `PresetVersion.data` is the primary saved payload. `refs` may be
stored for relationship tracking, migration, or future composition, but the
current implementation should assume pinned snapshot behavior by default.

**Why:** This matches the live `PresetStore`, avoids surprise child updates in a
music app, and removes ambiguity while the hierarchy is still being stabilized.

### AD-4: Immutable IDs + Normalized Scope

**Decision:** Every `PresetEntry` and `PresetRef` should carry a stable `id`
where possible, and entries should store normalized `scope` alongside display
name and legacy engine/source fields.

**Why:** Names are not stable identifiers, and slot-aware scope is required to
avoid collisions between presets that happen to share the same label.

### AD-5: Metadata Parity, Not Slider-Only

**Decision:** Preset persistence must cover structured metadata in addition to
flat slider params: `dualRanges`, `sliderModes`, evolve configs, sub-lane state,
and sequencer-related metadata.

**Why:** Otherwise the preset system introduces silent behavior loss even when
the main slider values round-trip correctly.

### AD-6: Versioning from Day One

**Decision:** Every `PresetEntry` has a `versions[]` array from the start,
even if the UI only shows "Save" initially.

**Why:** Retro-fitting versioning is painful. The data model should support it
before the UI fully exposes version stepping.

### AD-7: File Export/Import Early

**Decision:** File export/import remains an early milestone because it provides
an immediate backup path while the broader local/cloud/browser UX is still in progress.

**Why:** It gives immediate user value and keeps the emerging preset system inspectable.

### AD-8: Live Morph Anchors Are First-Class Working State

**Decision:** Any engine or page that exposes two morph endpoints (preset A/B,
state A/B, or similar) must treat those endpoints as editable runtime anchors,
not read-only snapshots. If the user tweaks endpoint A, moves to B, and later
returns to A, the edited A anchor must still be there until the user replaces,
saves, or discards it.

**Why:** This matches the instrument workflow. "Preset morph" is only the
starting point; the real value is being able to sculpt A and B as working
states, audition the space between them, and promote either side into a named
preset when it becomes a keeper.

### AD-9: Unify Dual-Slider and Morph Anchor Data, Not Trigger Execution

**Decision:** Share one dual-slider state model and one endpoint-override
schema across morph-capable engines: `single` / `walk` / `sampleHold`, range
data, and endpoint-specific override memory. Keep runtime execution specialized
per engine: drums retain per-hit/per-voice sampling and polyphony; slower
engines may continue to use generic or worklet-specific sampling paths.

**Why:** This gives consistent save/load semantics, endpoint editing behavior,
and UI affordances across pages without forcing high-trigger-rate engines into
the generic non-drum update path.

---

## Phase 0: Foundation Types & Registry

**Effort:** 2h  
**Dependencies:** None  
**Creates:** `src/presets/types.ts`, `src/presets/ParamRegistry.ts`

### 0.1 — Preset Types

```typescript
// src/presets/types.ts

export type PresetLevel = 'engine' | 'kit' | 'source' | 'state' | 'journey';

export interface PresetVersionMetadata {
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
  drumEvolveConfigs?: SerializedEvolveConfig[];
  synthEvolveConfigs?: SerializedEvolveConfig[];
  granularEvolveConfigs?: SerializedEvolveConfig[];
  drumSubLaneStates?: Record<string, SerializedSubLaneState>[];
  synthSubLaneStates?: Record<string, SerializedSubLaneState>[];
  granularSubLaneStates?: Record<string, SerializedSubLaneState>[];
}

export interface PresetVersion extends PresetVersionMetadata {
  v: number;
  note: string;
  timestamp: number;
  data: Record<string, unknown>;
  id?: string;
  refs?: Record<string, PresetRef>;
}

export interface PresetRef {
  id?: string;
  name: string;
  version: number | 'latest';
  scope?: string;
}

export interface PresetEntry {
  id?: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;        // L1: 'pad1', 'drumKick', 'lead1', etc.
  source?: string;        // L2/L3: 'synth', 'drums', 'granular', 'earth'
  name: string;
  author: 'factory' | 'user';
  tags?: string[];
  versions: PresetVersion[];
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** File export/import envelope */
export interface PresetFile {
  kesshoPreset: true;
  formatVersion: 1;
  id?: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;
  source?: string;
  name: string;
  exportedAt: string;
  appVersion: string;
  entry: PresetEntry;
}

/** Minimal preset summary for browser lists */
export interface PresetSummary {
  id?: string;
  type: PresetLevel;
  scope?: string;
  engine?: string;
  source?: string;
  name: string;
  author: 'factory' | 'user';
  tags?: string[];
  versionCount: number;
  currentVersion: number;
  updatedAt: number;
}
```

### 0.2 — Parameter Registry

```typescript
// src/presets/ParamRegistry.ts

export type ParamLevel = 1 | 2 | 3 | 4;

export const PARAM_REGISTRY: Record<string, { level: ParamLevel; scope: string }> = {
  // L4: Global + cross-page mix/routing
  masterVolume:        { level: 4, scope: 'global' },
  synthLevel:          { level: 4, scope: 'global' },
  // ... live registry also includes per-page levels, reverb sends, and granular sends ...

  // L3: Synth Source (9 params)
  leadEnabled:         { level: 3, scope: 'synth' },
  // ... all 9 synth L3 keys ...

  // L3: Drums Source (17 params)
  drumEnabled:         { level: 3, scope: 'drums' },
  // ... all 17 drums L3 keys ...

  // L3: Reverb Source (18 params)
  reverbEnabled:       { level: 3, scope: 'reverb' },
  // ... all 18 reverb L3 keys ...

  // L3: Granular Source (22 params)
  granularEnabled:     { level: 3, scope: 'granular' },
  // ... all 22 granular L3 keys ...

  // L2: Pad 1 Kit (10), Pad 2 Kit (8), Lead 1 Kit (8), Lead 2 Kit (9)
  padEnabled:          { level: 2, scope: 'pad1Kit' },
  // ... all synth L2 keys ...

  // L2: Drum Kit (56 params)
  drumSubDistance:     { level: 2, scope: 'drumKit' },
  // ... all 56 drum kit L2 keys ...

  // L2: Granular Kit, Earth Kit
  granularV1Enabled:   { level: 2, scope: 'granularKit' },
  waterEnabled:        { level: 2, scope: 'earthKit' },
  // ... all granular + earth L2 keys ...

  // L1: Engine scopes include pads, leads, leadDelay, synth/drum euclidean,
  // water, insects, granularVoice1..4, granularLegacy, and granularEuclidean.
  padOscAWave:         { level: 1, scope: 'pad1' },
  // ... live registry is the source of truth ...
};
```

> **Source of truth:** the live `src/presets/ParamRegistry.ts` file is now more
> authoritative than any static count in this document. If a later appendix
> disagrees with the code, trust the code and regenerate the docs from it.

### 0.3 — Codec Functions

```typescript
// src/presets/codec.ts

import { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

/** Extract only the params owned by a level+scope from full state */
export function extractParams(
  state: SliderState,
  level: ParamLevel,
  scope?: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!scope || info.scope === scope)) {
      if (key in state) result[key] = (state as Record<string, unknown>)[key];
    }
  }
  return result;
}

/** Apply preset params into state, only touching keys at specified level+scope */
export function applyParams(
  state: SliderState,
  presetData: Record<string, unknown>,
  level: ParamLevel,
  scope?: string
): SliderState {
  const merged = { ...state } as Record<string, unknown>;
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!scope || info.scope === scope)) {
      if (key in presetData) merged[key] = presetData[key];
    }
  }
  return merged as SliderState;
}

/** Get all keys owned by a level+scope */
export function getKeysForScope(level: ParamLevel, scope: string): string[] {
  return Object.entries(PARAM_REGISTRY)
    .filter(([, info]) => info.level === level && info.scope === scope)
    .map(([key]) => key);
}

/** Get all scopes at a given level */
export function getScopesForLevel(level: ParamLevel): string[] {
  const scopes = new Set<string>();
  for (const info of Object.values(PARAM_REGISTRY)) {
    if (info.level === level) scopes.add(info.scope);
  }
  return [...scopes];
}

/** Validate registry completeness against SliderState keys */
export function validateRegistry(stateKeys: string[]): {
  missing: string[];    // in registry but not in state
  unassigned: string[]; // in state but not in registry
} {
  const registryKeys = new Set(Object.keys(PARAM_REGISTRY));
  const stateSet = new Set(stateKeys);
  const dropped = new Set(['leadTimbre', 'granularPreset']);

  return {
    missing: [...registryKeys].filter(k => !stateSet.has(k)),
    unassigned: stateKeys.filter(k => !registryKeys.has(k) && !dropped.has(k)),
  };
}
```

### 0.4 — Deliverables

| File | Contents |
|------|----------|
| `src/presets/types.ts` | `PresetLevel`, `PresetVersion`, `PresetRef`, `PresetEntry`, `PresetFile`, `PresetSummary` |
| `src/presets/ParamRegistry.ts` | `PARAM_REGISTRY` (763 live entries), `ParamLevel` type |
| `src/presets/codec.ts` | `extractParams`, `applyParams`, `getKeysForScope`, `getScopesForLevel`, `validateRegistry` |
| `src/presets/index.ts` | Barrel export |

### 0.5 — Validation Test

```typescript
// Run once at dev startup to catch drift
import { STATE_KEYS } from '../ui/state';
import { validateRegistry } from './codec';

const { missing, unassigned } = validateRegistry(STATE_KEYS as string[]);
if (missing.length) console.warn('Registry keys not in SliderState:', missing);
if (unassigned.length) console.warn('SliderState keys not in registry:', unassigned);
```

---

## Phase 1: PresetStore Abstraction

**Effort:** 2h  
**Dependencies:** Phase 0  
**Creates:** `src/presets/PresetStore.ts`

### 1.1 — Interface

```typescript
// src/presets/PresetStore.ts

import type { PresetEntry, PresetLevel, PresetSummary } from './types';

export interface IPresetStore {
  save(entry: PresetEntry): Promise<void>;
  load(type: PresetLevel, name: string, scope?: string, version?: number): Promise<PresetEntry | null>;
  list(type: PresetLevel, scope?: string): Promise<PresetSummary[]>;
  delete(type: PresetLevel, name: string, scope?: string): Promise<void>;
  exists(type: PresetLevel, name: string, scope?: string): Promise<boolean>;
  findReferences(type: PresetLevel, name: string): Promise<string[]>;
  getStorageUsed(): Promise<{ bytes: number; count: number }>;
  exportAll(): Promise<Blob>;
  importAll(json: string): Promise<number>;
}
```

### 1.2 — localStorage Backend

```typescript
// Key generation
function makeKey(type: PresetLevel, name: string, scope?: string): string {
  if (scope) return `preset:${type}:${scope}:${name}`;
  return `preset:${type}:${name}`;
}

// All methods wrap localStorage in Promise.resolve() for async interface
// This makes the IndexedDB swap (Phase 12) transparent to consumers
```

### 1.3 — Factory Preset Loader

```typescript
// src/presets/factoryPresets.ts

// On first run, convert hardcoded factory presets into PresetEntry format
// and tag them as author: 'factory'. They are read-only (save creates a copy).
//
// Sources:
//   Pad:   PAD_PRESETS from padPresets.ts        → 18 L1 engine presets
//   Drums: *_PRESETS from drumPresets.ts          → 84 L1 engine presets
//   Lead:  manifest from Lead4opFM/              → 17 L1 engine presets
//   Water: WATER_PRESETS from waterPresets.ts     → 8 L1 engine presets
//   LFO:   UI helper presets                     → deferred; no matching ParamRegistry scope
//   Granular: composite granular scenes          → deferred until richer metadata-safe preset shape exists
//   Reverb: REVERB_CHARACTER_PRESETS             → 8 L3 source presets
//   State: /presets/*.json                        → 5 L4 state presets
//
// Factory presets are stored in localStorage with same key scheme.
// A flag `preset:factory-loaded:v1` prevents re-loading on every refresh.
```

### 1.4 — React Hook

```typescript
// src/presets/usePresets.ts

export function usePresets(type: PresetLevel, scope?: string) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Refresh list from store
  const refresh = useCallback(async () => { ... }, [type, scope]);

  // Save current state as a new preset (or new version)
  const save = useCallback(async (name: string, note?: string) => { ... }, []);

  // Load a preset by name
  const load = useCallback(async (name: string, version?: number) => { ... }, []);

  // Delete a preset
  const remove = useCallback(async (name: string) => { ... }, []);

  return { presets, loading, save, load, remove, refresh };
}
```

### 1.5 — Deliverables

| File | Contents |
|------|----------|
| `src/presets/PresetStore.ts` | `IPresetStore` interface + `LocalStoragePresetStore` class |
| `src/presets/factoryPresets.ts` | `loadFactoryPresets()` — one-time migration to store |
| `src/presets/usePresets.ts` | `usePresets()` React hook |

---

## Phase 2: File Export / Import (All Levels)

**Effort:** 2h  
**Dependencies:** Phase 0 (types + codec)  
**Creates:** `src/presets/fileIO.ts`, UI buttons per level

> This is the **interim** solution documented in `Preset_Hierarchy_Plan.md`.
> It works immediately — no PresetStore needed. Just download/upload `.json`.

### 2.1 — Core File Functions

```typescript
// src/presets/fileIO.ts

import type { PresetFile, PresetEntry, PresetLevel } from './types';
import { extractParams, type ParamLevel } from './codec';

const APP_VERSION = '1.0.0';

/** Download a preset as a .json file */
export async function exportPresetToFile(entry: PresetEntry): Promise<void> {
  const envelope: PresetFile = {
    kesshoPreset: true,
    formatVersion: 1,
    type: entry.type,
    engine: entry.engine,
    source: entry.source,
    name: entry.name,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    entry,
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });

  // Try File System Access API, fall back to <a download>
  if ('showSaveFilePicker' in window) {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `${entry.name}.json`,
      types: [{ accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Upload a .json file and return the parsed PresetEntry */
export async function importPresetFromFile(): Promise<PresetEntry | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);

        // New Kessho format
        if (parsed.kesshoPreset && parsed.entry) {
          resolve(parsed.entry as PresetEntry);
          return;
        }

        // Legacy SavedPreset format (full state)
        if (parsed.state && parsed.name) {
          resolve({
            type: 'state',
            name: parsed.name,
            author: 'user',
            versions: [{
              v: 1,
              note: 'imported from legacy format',
              timestamp: Date.now(),
              data: parsed.state,
            }],
            currentVersion: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          return;
        }

        resolve(null);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

/** Quick-export: slice current state at a given level and download */
export async function quickExport(
  state: SliderState,
  level: ParamLevel,
  scope: string,
  presetName: string
): Promise<void> {
  const params = extractParams(state, level, scope);
  const entry: PresetEntry = {
    type: levelToPresetLevel(level),
    engine: level === 1 ? scope : undefined,
    source: level >= 2 ? scope : undefined,
    name: presetName,
    author: 'user',
    versions: [{
      v: 1,
      note: '',
      timestamp: Date.now(),
      data: params,
    }],
    currentVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await exportPresetToFile(entry);
}
```

### 2.2 — Export/Import Buttons Per Level

| Level | UI Location | What Gets Exported | What Gets Imported |
|-------|------------|-------------------|-------------------|
| **L1 Engine** | Next to engine preset dropdown | Single engine's sound params (e.g. 48 pad1, 11 kick) | Replaces only that engine's params |
| **L2 Kit** | Kit section header (Drum Kit, Synth kit area) | Kit performance params (e.g. 56 drum kit) | Replaces kit params only |
| **L3 Source** | Source page tab header | All params for one tab (e.g. full Drums page) | Replaces entire page |
| **L4 State** | Top preset bar (already exists) | Full `SliderState` | Replaces everything |
| **L5 Journey** | Journey panel header | `JourneyConfig` topology | Replaces journey config |

### 2.3 — Implementation Priority

1. **L3 Source** — highest user value (share a "Drums page" or "Synth page")
2. **L1 Engine** — share individual sounds
3. **L4 State** — already exists, just wrap in new format
4. **L2 Kit** — share kit configurations
5. **L5 Journey** — lowest priority

---

## Phase 2.5: Shared Morph Endpoint Overrides

**Effort:** 3h  
**Dependencies:** Phase 0, Phase 1  
**Modifies:** Morph-capable engine controllers, shared morph helpers, save paths

### 2.5.1 — Goal

Before broad L1 preset rollout, morph-capable engines need one shared rule:

- Endpoint A and endpoint B are editable working anchors, not read-only factory snapshots.
- If the user edits A, travels to B, and comes back, A must remain the edited version.
- Transport start/stop must not wipe those endpoint edits.
- Dual slider mode/range state must follow the same rule as scalar values.

Outcome: **yes**, the new infrastructure is explicitly meant to allow "edit A,
go to B, come back to A, and still find A there."

### 2.5.2 — Shared Runtime Model

```typescript
interface MorphEndpointSnapshot {
  data: Record<string, unknown>;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
}

interface MorphEndpointContext {
  presetA?: PresetRef;
  presetB?: PresetRef;
  endpointA?: MorphEndpointSnapshot;
  endpointB?: MorphEndpointSnapshot;
  dirtyA?: boolean;
  dirtyB?: boolean;
}
```

Rules:

- `presetA` / `presetB` remain the immutable base references.
- `endpointA` / `endpointB` are live working overrides layered on top of those bases.
- Endpoint snapshots may be partial; any missing key falls back to the base preset.
- Replacing preset A clears only A's working snapshot; replacing preset B clears only B's working snapshot.
- Shared helpers should live in the common morph utility layer rather than being drum-only special cases.

### 2.5.3 — Scope and Non-Goals

Applies to:

- Pad 1 and Pad 2
- Lead 1 and Lead 2
- Drum voices
- Water and any future engine that exposes A/B-style morph anchors

Does not require:

- unifying drum polyphony or voice-pool logic
- forcing drums onto the generic 10 Hz non-drum S&H path
- flattening all engines into identical trigger semantics

The unification target is the **data model and controller behavior**, not the
audio-runtime execution strategy.

### 2.5.4 — User Workflow: Sculpt A/B, Then Save

This phase should make the following workflow first-class:

1. Choose preset A and preset B for a morph-capable engine or page.
2. Move fully to endpoint A.
3. Edit values, dual slider modes, and dual slider ranges until A sounds right.
4. Move to endpoint B and edit that side independently.
5. Return to A or B at any time and find the edited anchor restored.
6. If A or B becomes a keeper, use **Save As** while parked exactly on that endpoint.
7. The save operation resolves the current endpoint (`base preset + endpoint overrides + dual slider metadata`) into a normal named preset.

### 2.5.5 — Promotion Path Across Levels

This is how the "every page and level can be tuned and ultimately saved" vision
maps onto the hierarchy:

- **L1 Engine preset:** save a sculpted sound or exact endpoint anchor as a reusable engine preset.
- **L2 Kit preset:** save which engine presets are assigned plus morph config and kit-owned performance settings.
- **L3 Source preset:** save the whole page/tab behavior, including the currently chosen child presets and page-owned metadata.
- **L4 State preset:** save the full app-wide snapshot.
- **L5 Journey preset:** save the topology and automated motion between states.

Recommended authoring flow:

1. Sculpt endpoint A/B on the engine you are working on.
2. Promote any keeper anchor to an L1 preset with **Save As**.
3. Re-point the slot to that newly saved preset if desired.
4. Save the enclosing kit, source, state, or journey layer after the child preset references look right.

### 2.5.6 — Deliverables

- Shared endpoint-override helpers for scalar params and dual-slider metadata
- One runtime model for editable A/B anchors across morph-capable engines
- Save helpers that can resolve endpoint A or B into a standalone preset payload
- Manual verification for:
  - edit A → move to B → return to A
  - edit B → stop playback → return to B
  - dual slider mode/range recall at endpoints
  - replacing preset A without destroying B's live edits

---

## Phase 3: L1 Engine Presets — User Save/Load

**Effort:** 4h  
**Dependencies:** Phase 0, Phase 1, Phase 2.5  
**Modifies:** Drum/Pad/Lead preset dropdowns in UI

### 3.1 — What Changes

Today, engine preset dropdowns only show factory presets. After this phase:
- User can **save** current engine state as a named preset
- User presets appear in dropdown below factory presets (separated by divider)
- User presets can be **deleted** (factory presets cannot)
- User presets can be **overwritten** (pushes new version)
- Factory preset + "Save" → creates user copy with same name + " (Custom)"
- If the user is parked on morph endpoint A or B, **Save As** saves the resolved
  current anchor, not just the original base preset behind that slot

### 3.2 — Per-Engine Implementation

| Engine | Prefix | Param Count | Current Dropdown | Save Button Location |
|--------|--------|-------------|-----------------|---------------------|
| Pad 1 | `pad*` (no number) | 48 | ✅ `padPresetA/B` morph | Next to morph dropdown |
| Pad 2 | `pad2*` | 48 | ✅ `pad2PresetA/B` morph | Next to morph dropdown |
| Lead 1 | `lead1*` | 9 | ✅ `lead1PresetA/B` morph | Next to morph dropdown |
| Lead 2 | `lead2*` | 6 | ✅ `lead2PresetC/D` morph | Next to morph dropdown |
| Drum Sub | `drumSub*` | 10 | ✅ per-voice dropdown | In voice panel header |
| Drum Kick | `drumKick*` | 11 | ✅ per-voice dropdown | In voice panel header |
| Drum Click | `drumClick*` | 13 | ✅ per-voice dropdown | In voice panel header |
| Drum BeepHi | `drumBeepHi*` | 18 | ✅ per-voice dropdown | In voice panel header |
| Drum BeepLo | `drumBeepLo*` | 17 | ✅ per-voice dropdown | In voice panel header |
| Drum Noise | `drumNoise*` | 17 | ✅ per-voice dropdown | In voice panel header |
| Drum Membrane | `drumMembrane*` | 21 | ✅ per-voice dropdown | In voice panel header |
| Lead Delay | `leadDelay*` | 7 | ❌ None | New dropdown in Synth delay section |
| Synth Euclidean | `synthEuclidean*` | 44 | ❌ None | New dropdown in Synth seq section |
| Drum Euclidean | `drumEuclidean*` | 69 | ❌ None | New dropdown in Drum seq section |
| Water | `water*` | 25 | ✅ A/B morph (index-based) | Next to water morph |
| Insects 1 | `insects*` | 8 | ❌ None | New dropdown |
| Insects 2 | `insects2*` | 8 | ❌ None | New dropdown |
| Legacy Granular | `grain*` / `legacyGranular*` | 12 | ❌ None | New dropdown only if that legacy path stays exposed |
| Granular Voice ×4 | `granularV{n}*` | 20 each | ❌ None | Per-voice dropdown |
| Granular Legacy | `granularLegacy*` | 6 | ❌ None | New dropdown |
| Granular Euclidean | `granularEuclid*` | 41 | ❌ None | New dropdown in Granular seq section |

### 3.3 — Dropdown Component

```typescript
// src/presets/PresetDropdown.tsx

interface PresetDropdownProps {
  level: PresetLevel;
  scope: string;               // e.g. 'drumKick', 'pad1', 'drumKit'
  currentName: string;
  onLoad: (name: string) => void;
  onSave: (name: string) => void;
  onExport: () => void;
  onImport: () => void;
}

// Renders:
// ┌──────────────────────────┐
// │ [808 Boom ▾] [💾] [↓] [↑] │
// └──────────────────────────┘
// Dropdown groups: Factory (locked) | User | "Save As..."
```

### 3.4 — Save Flow

1. User tweaks engine params, optionally while parked exactly on morph endpoint A or B
2. If an endpoint snapshot exists, resolve the save payload from the current anchor state
3. Click save → prompt for name (default = current preset name)
4. If name matches existing user preset → push new version
5. If name matches factory preset → create user copy
6. If new name → create new `PresetEntry` with v1
7. Store via `PresetStore.save()`
8. Refresh dropdown list

### 3.5 — Load Flow

1. User picks preset from dropdown
2. `PresetStore.load('engine', name, scope)` → get `PresetEntry`
3. Get latest version data (or pinned version)
4. `applyParams(currentState, data, 1, scope)` → new state
5. Only engine params change; kit/source/global untouched

### 3.6 — Saving Edited A/B Anchors

For engines with morph slots, the intended flow is:

1. Park the morph position exactly on A or B.
2. Use **Save As** from that engine's preset control.
3. Save the resolved endpoint state as a new L1 preset.
4. Optionally assign that new preset back into slot A or slot B.
5. Save the enclosing kit/source/state preset afterward if you want the larger page to remember that slot assignment.

---

## Phase 4: L2 Kit Presets — User Save/Load

**Effort:** 3h  
**Dependencies:** Phase 0, Phase 1, Phase 3

### 4.1 — Kit Types

| Kit | Scope | Owned Params | Child L1 Refs |
|-----|-------|-------------|--------------|
| Drum Kit | `drumKit` | 56 (14 dist/var + 42 morph) | 7 × voice engine refs |
| Pad 1 Kit | `pad1Kit` | 9 | 1 × Pad 1 engine ref |
| Pad 2 Kit | `pad2Kit` | 8 | 1 × Pad 2 engine ref |
| Lead 1 Kit | `lead1Kit` | 7 | 1 × Lead 1 engine ref |
| Lead 2 Kit | `lead2Kit` | 8 | 1 × Lead 2 engine ref |
| Granular Kit | `granularKit` | 12 | 4 × Granular voice refs + optional granular legacy ref |
| Earth Kit | `earthKit` | 12 | 3 × Earth engine refs (Water, Insects 1, Insects 2) |

### 4.2 — Kit Save/Load UI

**Drum Kit** — most complex, highest value:
```
┌─ DRUM KIT ────────────────────────────────────────┐
│ [Ambient Kit ▾]  v1  [◀ ▶]  [💾] [As]  [↓] [↑]   │
├───────────────────────────────────────────────────-┤
│ ┌─ KICK ──────────────┐  ┌─ SUB ──────────────┐   │
│ │ [808 Boom ▾] [💾]    │  │ [Subterranean ▾]   │   │
│ └─────────────────────┘  └─────────────────────┘   │
```

**Synth Kits** — inline in Synth page, one row per sub-kit:
```
Pad 1: [Warm Wash ▾] [💾]    Lead 1: [Glass Bell ▾] [💾]
Pad 2: [Crystal ▾] [💾]      Lead 2: [Ethereal ▾] [💾]
```

### 4.3 — Kit Data Includes L1 References

When saving a kit, the `PresetEntry` stores:
- All owned params (extracted via `extractParams(state, 2, 'drumKit')`)
- References to current L1 engine presets by name + version

When loading a kit:
1. Apply L2 params to state
2. Resolve each L1 ref → load engine preset → apply L1 params
3. Result: all kit + engine params updated, higher levels untouched

---

## Phase 5: L3 Source Presets

**Effort:** 3h  
**Dependencies:** Phase 0, Phase 1, Phase 4

### 5.1 — Source Preset Types

| Source | L3-Owned | L2 Refs | L1 Refs |
|--------|----------|---------|---------|
| Synth | 5 (lead enable/random/vibrato/glide) | Pad 1 Kit, Pad 2 Kit, Lead 1 Kit, Lead 2 Kit | Lead Delay, Synth Euclidean |
| Drums | 15 (page behavior + delay + per-voice delay sends) | Drum Kit | Drum Euclidean |
| Reverb | 44 (all reverb + spectral-freeze params) | — | — |
| Granular | 16 live registry params + metadata payload | Granular Kit | Granular Euclidean |
| Earth | 0 (thin wrapper) | Earth Kit | — |

### 5.2 — Source Preset UI

One `PresetDropdown` per source page tab:
```
┌─ [Synth] [Drums] [Reverb] [Granular] [Earth] ─────┐
│ SOURCE: [Ambient Drums ▾] v1 [◀▶] [💾] [As] [↓][↑] │
├────────────────────────────────────────────────────-┤
│ (page content...)                                    │
```

### 5.3 — Source Save Flow

1. Extract L3 params: `extractParams(state, 3, 'drums')`
2. Capture current L2/L1 child refs as pinned metadata: `{ id, name, version, scope }`
3. Preserve metadata payload (`sliderModes`, `dualRanges`, sub-lane/evolve config) when the source owns it
4. Bundle into `PresetEntry` with `data` + optional `refs`
5. Save to store

### 5.4 — Source Load Flow (Snapshot-First)

1. Load source preset → get L3 `data` + optional `refs`
2. Apply L3 params: `applyParams(state, data, 3, 'drums')`
3. If this save path includes embedded child snapshots, apply those pinned child snapshots next
4. Use `refs` for provenance, audits, and explicit user-driven child reloads
5. Do not assume implicit "follow latest child preset" behavior by default

---

## Phase 6: L4 State Presets — Restructure

**Effort:** 2h  
**Dependencies:** Phase 5

### 6.1 — What Changes

The existing `SavedPreset` (monolithic `SliderState` blob) becomes a structured
`PresetEntry` with L4-owned params (48 live global keys) plus optional source
refs / embedded snapshots.

### 6.2 — Migration Path

```typescript
function migrateSavedPreset(old: SavedPreset): PresetEntry {
  return {
    type: 'state',
    name: old.name,
    author: 'user',
    versions: [{
      v: 1,
      note: 'migrated from legacy format',
      timestamp: Date.parse(old.timestamp) || Date.now(),
      data: extractParams(old.state, 4, 'global'),
      refs: {
        synth: { name: `${old.name}__synth`, version: 1 },
        drums: { name: `${old.name}__drums`, version: 1 },
        reverb: { name: `${old.name}__reverb`, version: 1 },
        granular: { name: `${old.name}__granular`, version: 1 },
        earth: { name: `${old.name}__earth`, version: 1 },
      },
    }],
    currentVersion: 1,
    createdAt: Date.parse(old.timestamp) || Date.now(),
    updatedAt: Date.now(),
  };
}
// Also creates the 5 L3 source presets from the same SliderState blob
```

### 6.3 — Backwards Compatibility

- Old `SavedPreset` files can still be loaded (detected by `state` key + no `kesshoPreset` marker)
- `migratePreset()` and `normalizePresetForWeb()` pipelines remain for legacy import
- Cloud presets (Supabase) continue working — they store full `SliderState`

---

## Phase 7: L5 Journey Presets

**Effort:** 2h  
**Dependencies:** Phase 6

### 7.1 — What Changes

`JourneyConfig` (currently volatile React state in `useJourney()`) becomes
saveable/loadable via PresetStore as a `PresetEntry` of type `'journey'`.

### 7.2 — Journey Data

```typescript
// Saved journey data:
{
  type: 'journey',
  name: 'Midnight Caravan',
  versions: [{
    v: 1,
    data: {
      topology: 'diamond',
      autoAdvance: true,
      loopEnabled: true,
    },
    refs: {
      node0: { name: 'Desert Night', version: 1 },  // L4 state refs
      node1: { name: 'Oasis', version: 1 },
      node2: { name: 'Sandstorm', version: 2 },
      node3: { name: 'Starlight', version: 1 },
    },
    // connections, phrase lengths, morph durations stored in data
  }],
}
```

### 7.3 — UI

Journey panel gets the same `PresetDropdown` treatment:
```
┌─ JOURNEY ──────────────────────────────────────────┐
│ [Midnight Caravan ▾]  v1  [◀ ▶]  [💾] [As] [↓] [↑] │
│          [Top]                                      │
│         ╱    ╲                                      │
│   [Left]──────[Right]                               │
│         ╲    ╱                                      │
│         [Bottom]                                    │
└─────────────────────────────────────────────────────┘
```

---

## Phase 8: Versioning System

**Effort:** 3h  
**Dependencies:** Phase 1 (PresetStore)

### 8.1 — Version Data Model

Already built into `PresetEntry.versions[]` from Phase 0. This phase adds
the **UI and logic** for version navigation.

### 8.2 — Version Stack Rules

| Rule | Detail |
|------|--------|
| Every save pushes a new version | `v: max(existing) + 1` |
| Max 20 versions per preset | FIFO eviction of oldest |
| Factory presets have exactly 1 version | Read-only |
| Saving a factory preset creates a user copy | Name + " (Custom)", starts at v1 |
| Version notes are optional | Short freeform string |
| Timestamps are epoch ms | `Date.now()` at save time |

### 8.3 — Version UI

```
[Ambient Kit ▾]  v3  [◀ ▶]  [💾] [Save As]
                 ↑    ↑  ↑
          current   step  step
          version   back  forward
```

- **◀** loads `v(current-1)` — applies that version's params
- **▶** loads `v(current+1)` — goes forward in history
- **Stepping is non-destructive** — all versions persist, you're just browsing
- **"Save"** while viewing v2 creates v4 (not v3-replacement) from current state
- Version counter shows `v3` / `v3 of 5` depending on space

### 8.4 — Version Metadata in Refs

Higher-level presets may carry version numbers in `refs` metadata:

```json
{ "id": "preset_123", "name": "808 Boom", "version": 2 }         // pinned provenance
{ "id": "preset_123", "name": "808 Boom", "version": "latest" }  // future opt-in mode
```

- Default runtime behavior is still **snapshot-first** — loading a parent preset
  uses the data saved inside that version unless explicit follow-latest child
  resolution is added later.
- `refs` are still useful for provenance, migration, audits, and optional future
  child-resolution features.
- If follow-latest is ever added, it should be opt-in, not the default.

### 8.5 — Version Diff

When stepping between versions, the system computes which params changed:

```typescript
function diffVersions(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    if (a[key] !== b[key]) changed.push(key);
  }
  return changed;
}
```

Changed parameter rows get a brief highlight (CSS animation, ~1s fade).
No modal, no diff panel — just inline flash.

---

## Phase 9: Modified Indicator (Dirty Flag)

**Effort:** 1h  
**Dependencies:** Phase 1, Phase 8

### 9.1 — How It Works

Every level's dropdown shows a dot (●) when the current `SliderState` params
differ from the last saved version of the loaded preset.

```
[Ambient Kit ● ▾]   ← modified (current state ≠ saved v3)
[Ambient Kit ▾]     ← clean
```

### 9.2 — Implementation

```typescript
function isDirty(
  state: SliderState,
  entry: PresetEntry,
  level: ParamLevel,
  scope: string
): boolean {
  const currentParams = extractParams(state, level, scope);
  const savedVersion = entry.versions.find(v => v.v === entry.currentVersion);
  if (!savedVersion) return true;

  for (const [key, value] of Object.entries(currentParams)) {
    if (savedVersion.data[key] !== value) return true;
  }
  return false;
}
```

### 9.3 — Performance

- Only recompute when relevant params change (scope-filtered)
- Debounce to 100ms (don't flash on every slider drag)
- Cache result per preset until state changes

---

## Phase 10: Preset Browser

**Effort:** 5h  
**Dependencies:** Phase 1, Phase 3–7 (all levels saveable)

### 10.1 — Overview

A modal/panel that replaces the simple dropdown with a rich browsing experience.
Think: a sound library browser like Ableton's or Logic's.

### 10.2 — Layout

```
┌─ PRESET BROWSER ─────────────────────────────────────────┐
│                                                           │
│ Level: [All ▾] [Engine] [Kit] [Source] [State] [Journey]  │
│                                                           │
│ 🔍 Search: [________________]   Tags: [ambient] [drums]   │
│                                                           │
│ ┌─ FILTERS ──┐  ┌─ RESULTS ─────────────────────────────┐│
│ │             │  │                                        ││
│ │ Source:     │  │ Name          Level  Engine  Author  v ││
│ │ ☑ Synth     │  │ ──────────── ────── ─────── ─────── ─ ││
│ │ ☑ Drums     │  │ 808 Boom     L1     Kick    factory 1 ││
│ │ ☑ Reverb    │  │ Ambient Kit  L2     Drums   user    3 ││
│ │ ☑ Granular  │  │ Desert Night L4     —       user    2 ││
│ │ ☑ Earth     │  │ Glass Bell   L1     Lead    factory 1 ││
│ │             │  │ Midnight...  L5     —       user    1 ││
│ │ Author:     │  │ Shimmer Cloud L3    Gran    user    1 ││
│ │ ○ All       │  │                                        ││
│ │ ○ Factory   │  │                                        ││
│ │ ○ User      │  │                                        ││
│ │             │  │                                        ││
│ │ Sort:       │  │                                        ││
│ │ ○ Name      │  │                                        ││
│ │ ○ Date      │  │                                        ││
│ │ ○ Level     │  │                                        ││
│ │             │  └────────────────────────────────────────┘│
│ └─────────────┘                                           │
│                                                           │
│ ┌─ PREVIEW ──────────────────────────────────────────────┐│
│ │ 808 Boom (L1 Kick Engine)                    factory   ││
│ │ Version: v1 (only)                                      ││
│ │ Tags: [deep] [808] [classic]                            ││
│ │ Params: drumKickFreq=54, drumKickDecay=0.8, ...         ││
│ │                                                         ││
│ │ Referenced by:                                          ││
│ │   • Ambient Kit (L2)                                    ││
│ │   • Glitch Kit (L2)                                     ││
│ │                                                         ││
│ │ [Load] [Load to Slot A] [Load to Slot B] [Export] [Delete]│
│ └─────────────────────────────────────────────────────────┘│
│                                                           │
│ [Import File] [Export All] [Import All]          [Close]   │
└───────────────────────────────────────────────────────────┘
```

### 10.3 — Features

| Feature | Description |
|---------|-------------|
| **Level filter** | Show only L1, L2, etc. or all |
| **Source filter** | Synth / Drums / Reverb / Granular / Earth |
| **Engine filter** | (when L1 selected) Kick / Sub / Pad 1 / etc. |
| **Author filter** | Factory / User / All |
| **Search** | Fuzzy match on name + tags |
| **Sort** | Name (alpha) / Date (newest) / Level (hierarchy) |
| **Tags** | Optional tags per preset (e.g. "ambient", "808", "glitch") |
| **Preview panel** | Shows preset details, params, version count, references |
| **Reference graph** | "Referenced by:" shows which higher-level presets use this one |
| **Bulk actions** | Export All (backup), Import All (restore), Import File |
| **Context-aware launch** | Opening browser from Drum Kit dropdown pre-filters to L2 + Drums |

### 10.4 — Browser Component

```typescript
// src/presets/PresetBrowser.tsx

interface PresetBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilter?: {
    level?: PresetLevel;
    engine?: string;
    source?: string;
  };
  onLoad: (entry: PresetEntry) => void;
  onLoadToSlot?: (entry: PresetEntry, slot: 'a' | 'b') => void;
}
```

### 10.5 — Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate preset list |
| `Enter` | Load selected preset |
| `Delete` | Delete selected preset (with confirmation) |
| `Ctrl+F` | Focus search |
| `Escape` | Close browser |

### 10.6 — Mobile Layout

On small screens, the browser becomes a full-screen modal with:
- Filters collapse to a horizontal scroll of pills
- Preview panel moves to bottom sheet
- Touch-friendly list items (larger tap targets)

---

## Phase 11: Migration & Cleanup

**Effort:** 2h  
**Dependencies:** Phase 6 (L4 restructure)

### 11.1 — What Gets Migrated

| From | To |
|------|-----|
| `SavedPreset` (monolithic) → | Structured `PresetEntry` (L4 global data + optional source refs / snapshots) |
| Hardcoded `PAD_PRESETS` → | Factory `PresetEntry` in store |
| Hardcoded drum preset arrays → | Factory `PresetEntry` in store |
| `Lead4opFM` JSON files → | Factory `PresetEntry` in store (fetched → cached) |
| `WATER_PRESETS` → | Factory `PresetEntry` in store |
| `REVERB_CHARACTER_PRESETS` → | Factory L3 Source presets in store |
| Granular built-in scene presets → | Kept outside the store until composite metadata-safe preset loading exists |

### 11.2 — Migration Strategy

1. On app startup, check `preset:migration-version` key in localStorage
2. If missing or < current version → run migration
3. Migration converts hardcoded data → `PresetEntry` objects → `PresetStore.save()`
4. Mark factory entries with `author: 'factory'`
5. Set `preset:migration-version` to current version
6. Hardcoded data remains in source (used as fallback if store is empty)

### 11.3 — Legacy Import Compatibility

- `migratePreset()` in `state.ts` continues to handle old `*Min/*Max` fields
- `normalizePresetForWeb()` in `App.tsx` continues to handle iOS reverb
- New `importPresetFromFile()` detects format by `kesshoPreset` marker
- Old `.json` files (no marker) → treated as legacy `SavedPreset` → auto-migrated

---

## Phase 12: IndexedDB Migration

**Effort:** 3h  
**Dependencies:** Phase 1 (PresetStore abstraction)

### 12.1 — Why

localStorage limit is ~5-10MB. With versioning (20 versions × many presets),
this can fill up. IndexedDB offers 50MB+ and async I/O.

### 12.2 — New Backend

```typescript
// src/presets/IndexedDBPresetStore.ts

class IndexedDBPresetStore implements IPresetStore {
  private db: IDBDatabase | null = null;
  private dbName = 'kessho-presets';
  private dbVersion = 1;

  private stores = [
    'engine-presets',    // L1
    'kit-presets',       // L2
    'source-presets',    // L3
    'state-presets',     // L4
    'journey-presets',   // L5
  ];

  async init(): Promise<void> { /* open DB, create object stores */ }
  async save(entry: PresetEntry): Promise<void> { /* put into correct store */ }
  async load(...): Promise<PresetEntry | null> { /* get by key */ }
  async list(...): Promise<PresetSummary[]> { /* getAll + map to summary */ }
  // ... etc
}
```

### 12.3 — Migration from localStorage

```typescript
async function migrateLocalStorageToIndexedDB(): Promise<void> {
  const idbStore = new IndexedDBPresetStore();
  await idbStore.init();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('preset:')) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const entry = JSON.parse(raw) as PresetEntry;
    await idbStore.save(entry);
  }

  // Clear old localStorage preset keys
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('preset:')) keysToRemove.push(key);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  // Set migration flag
  localStorage.setItem('preset:storage-backend', 'indexeddb');
}
```

### 12.4 — Auto-detect Backend

```typescript
function getPresetStore(): IPresetStore {
  const backend = localStorage.getItem('preset:storage-backend');
  if (backend === 'indexeddb') return new IndexedDBPresetStore();
  return new LocalStoragePresetStore();
}
```

---

## Phase 13: Cloud Sync Enhancement

**Effort:** 4h  
**Dependencies:** Phase 6, Phase 12

### 13.1 — Current Cloud System

`src/cloud/supabase.ts` stores full `SliderState` in a `presets` table.
Missing: `dualRanges`, `sliderModes`, structured hierarchy, versioning.

### 13.2 — Enhanced Cloud Schema

```sql
-- New table structure
CREATE TABLE preset_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,          -- 'engine' | 'kit' | 'source' | 'state' | 'journey'
  engine TEXT,                 -- null for non-engine types
  source TEXT,                 -- null for engine types
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  tags TEXT[],
  data JSONB NOT NULL,         -- full PresetEntry (with versions)
  plays INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Composite unique: type + engine + source + name + author
  UNIQUE (type, engine, source, name, author)
);

CREATE INDEX idx_preset_type ON preset_entries(type);
CREATE INDEX idx_preset_tags ON preset_entries USING GIN(tags);
```

### 13.3 — Sync Strategy

| Direction | Trigger | Conflict Resolution |
|-----------|---------|-------------------|
| Local → Cloud | Manual "Share" button | Creates a new cloud entry |
| Cloud → Local | Manual "Download" from browser | Overwrites or merges (user choice) |
| Auto-sync | Not implemented (future) | — |

---

## Dependency Graph

```
Phase 0: Types & Registry ──────┐
    │                            │
    ▼                            ▼
Phase 1: PresetStore      Phase 2: File Export/Import
    │
    ├──────────────┬─────────────┐
    │              │             │
    ▼              ▼             ▼
Phase 2.5:     Phase 9:     Phase 8:
Morph Anchors  Dirty Flag   Versioning UI
    │
    ▼
Phase 3: L1 Engine Save
    │
    ▼
Phase 4: L2 Kit Save
    │
    ▼
Phase 5: L3 Source Save
    │
    ▼
Phase 6: L4 State Restructure
    │
    ├─────────────────────────────┐
    ▼                             ▼
Phase 7: L5 Journey      Phase 11: Migration
    │                             │
    │    ┌────────────────────────┘
    ▼    ▼
Phase 10: Preset Browser
    │
    ▼
Phase 12: IndexedDB Migration
    │
    ▼
Phase 13: Cloud Sync Enhancement
```

### Parallelizable Work

| Can run in parallel | Condition |
|--------------------|-----------|
| Phase 2 + Phase 1 | Both depend only on Phase 0 |
| Phase 2.5 + Phase 8 + Phase 9 | All depend on Phase 1 and do not block one another |
| Phase 8 + Phase 9 | Both depend on Phase 1, independent of each other |
| Phase 7 + Phase 11 | Both depend on Phase 6 |

### Critical Path (Shortest Route to Full System)

```
0 → 1 → 2.5 → 3 → 4 → 5 → 6 → 7 → 10 → 12
         ↑
         2 (can happen any time after 0)
         8 (can happen any time after 1)
         9 (can happen any time after 1)
```

---

## Effort Summary

| Phase | Description | Effort | Cumulative |
|-------|------------|--------|------------|
| 0 | Types & Registry | 2h | 2h |
| 1 | PresetStore (localStorage) | 2h | 4h |
| 2 | File Export/Import | 2h | 6h |
| 2.5 | Shared morph endpoint overrides | 3h | 9h |
| 3 | L1 Engine user save/load | 4h | 13h |
| 4 | L2 Kit user save/load | 3h | 16h |
| 5 | L3 Source presets | 3h | 19h |
| 6 | L4 State restructure | 2h | 21h |
| 7 | L5 Journey presets | 2h | 23h |
| 8 | Versioning UI | 3h | 26h |
| 9 | Dirty flag | 1h | 27h |
| 10 | **Preset Browser** | **5h** | **32h** |
| 11 | Migration & cleanup | 2h | 34h |
| 12 | IndexedDB migration | 3h | 37h |
| 13 | Cloud sync enhancement | 4h | 41h |
| | **Total** | **41h** | |

### Recommended Build Order (Sprints)

| Sprint | Phases | Hours | Milestone |
|--------|--------|-------|-----------|
| **Sprint 1** | 0 + 1 + 2 + 2.5 | 9h | Foundation + file export/import + shared morph anchors working |
| **Sprint 2** | 3 + 8 | 7h | L1 engine save/load + versioning |
| **Sprint 3** | 4 + 5 + 9 | 7h | L2 + L3 save/load + dirty flag |
| **Sprint 4** | 6 + 7 + 11 | 6h | L4/L5 restructure + migration |
| **Sprint 5** | 10 | 5h | Preset Browser |
| **Sprint 6** | 12 + 13 | 7h | IndexedDB + Cloud enhancement |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| localStorage fills up before IndexedDB migration | Low | High | Phase 12 is independent; can fast-track. FIFO version eviction helps. |
| `PARAM_REGISTRY` drifts from `SliderState` | Medium | High | Validation test runs on dev startup (Phase 0.5). CI test if added. |
| Shared morph anchor semantics drift between engines | Medium | High | Land Phase 2.5 before Phase 3. Reuse one endpoint-override model and one "edit A → B → A" verification checklist across engines. |
| Factory preset migration slow on first load | Low | Medium | Lazy-load factory presets. Show loading spinner. Cache migration flag. |
| Doc/code drift on ownership or scope rules | Medium | High | Treat `ParamRegistry.ts` + preset utils as source of truth. Keep docs summary-based, not hand-enumerated. |
| Legacy `.json` import breaks with new format | Medium | Medium | Format detection by `kesshoPreset` marker. Old format always supported. |
| Large version stacks bloat storage | Medium | Low | 20-version FIFO limit. IndexedDB has room. |
| Cloud schema migration breaks existing presets | Medium | High | New table `preset_entries` — old `presets` table stays. Gradual migration. |
| Preset Browser performance with 1000+ presets | Low | Medium | Virtual scrolling. Debounced search. Summary objects (not full entries). |
