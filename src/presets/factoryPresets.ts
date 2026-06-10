// src/presets/factoryPresets.ts
// Phase 1 — One-time migration of hardcoded factory presets into PresetStore.
//
// Sources:
//   Pad:     PAD_PRESETS from padPresets.ts         → 24 L1 engine presets
//   Drums:   *_PRESETS from drumPresets.ts           → 161 L1 engine presets
//   Water:   WATER_PRESETS from waterPresets.ts      → 8 L1 engine presets
//   Euclid:  shared pattern bank                     → 32 L1 engine presets
//   Reverb:  REVERB_CHARACTER_PRESETS               → 8 L3 source presets
//   Lead:    Lead4opFM manifest (lazy-fetched)      → loaded on demand, not stored here
//   Granular: composite granular presets             → deferred; current store cannot round-trip them safely
//   LFO:     UI helper presets                      → deferred; no matching ParamRegistry scope

import type { PresetEntry } from './types';
import { getVersionData } from './codec';
import { getPresetStore } from './PresetStore';
import { morphWaterPresets, WATER_PRESETS } from '../audio/waterPresets';
import { SHARED_PRESET_TEST_MODE } from './sharedMode';
import { normalizeResolvedVersionData } from './presetStorageV2';
import { getPresetScope, presetValuesEqual } from './presetUtils';
import {
  buildEuclideanPatternPresetData,
  EUCLIDEAN_PATTERN_LABELS,
} from './euclideanPatternBank';

const FACTORY_LOADED_KEY = 'preset:factory-loaded:v26';

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readFactoryLoadedFlag(): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    return localStorage.getItem(FACTORY_LOADED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeFactoryLoadedFlag(): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(FACTORY_LOADED_KEY, 'true');
  } catch {
    // Ignore storage failures; factory seeding can still proceed for the session.
  }
}

function getFactoryKey(entry: PresetEntry): string {
  return [entry.type, entry.engine || '', entry.source || '', entry.name].join(':');
}

function addFactoryEntry(
  entries: PresetEntry[],
  seen: Set<string>,
  entry: PresetEntry,
): void {
  const key = getFactoryKey(entry);
  if (seen.has(key)) {
    console.warn('Skipping duplicate factory preset:', key);
    return;
  }
  seen.add(key);
  entries.push(entry);
}

/** Check whether factory presets have already been loaded */
export function isFactoryLoaded(): boolean {
  // In shared cloud mode, Supabase is the source of truth. Do not let a local
  // browser flag suppress seeding/checking newly added factory presets.
  if (SHARED_PRESET_TEST_MODE) return false;
  return readFactoryLoadedFlag();
}

export interface FactoryPresetV2Phases {
  l1: PresetEntry[];
  l2: PresetEntry[];
  l3: PresetEntry[];
  l4: PresetEntry[];
  all: PresetEntry[];
}

/** Create a factory PresetEntry shell */
function makeFactory(
  type: PresetEntry['type'],
  name: string,
  data: Record<string, unknown>,
  opts?: { engine?: string; source?: string; scope?: string; tags?: string[] },
): PresetEntry {
  const now = Date.now();
  return {
    type,
    scope: opts?.scope,
    engine: opts?.engine,
    source: opts?.source,
    name,
    author: 'factory',
    library: 'stock',
    visibility: 'featured',
    creator: 'Kessho',
    familyName: name,
    variantName: name,
    tags: opts?.tags,
    versions: [{
      v: 1,
      note: 'factory preset',
      timestamp: now,
      data,
    }],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function getLatestVersionData(entry: PresetEntry): Record<string, unknown> | null {
  const current = entry.versions.find(v => v.v === entry.currentVersion);
  const version = current || entry.versions[entry.versions.length - 1];
  if (!version || !version.data || typeof version.data !== 'object') return null;
  return version.data;
}

function isDynamicsFactoryScope(entry: PresetEntry): boolean {
  const scope = entry.scope ?? entry.engine ?? entry.source;
  return scope === 'dynamicsSidechain' ||
    scope === 'dynamicsBus' ||
    scope === 'dynamicsEq1' ||
    scope === 'dynamicsEq2' ||
    scope === 'degrade' ||
    scope === 'degradeDrift' ||
    scope === 'degradeErosion' ||
    scope === 'dynamicsDrift' ||
    scope === 'dynamicsErosion' ||
    scope === 'masterFx' ||
    scope === 'dynamicsSaturation' ||
    scope === 'dynamicsEndChain';
}

function shouldRefreshBundledFactoryEntry(existing: PresetEntry, next: PresetEntry): boolean {
  return (SHARED_PRESET_TEST_MODE || isDynamicsFactoryScope(next)) &&
    existing.library === 'stock' &&
    existing.author === 'factory';
}

function shouldAppendBundledFactoryVersion(existing: PresetEntry, next: PresetEntry): boolean {
  if (!SHARED_PRESET_TEST_MODE && !isDynamicsFactoryScope(next)) return false;
  if (existing.library !== 'stock' || existing.author !== 'factory') return false;

  const existingData = getVersionData(existing);
  const nextData = getLatestVersionData(next);
  if (!existingData || !nextData) return false;

  const existingScope = getPresetScope(existing, existing.type);
  const nextScope = getPresetScope(next, next.type);
  const normalizedExisting = normalizeResolvedVersionData(existing.type, existingScope, existingData);
  const normalizedNext = normalizeResolvedVersionData(next.type, nextScope, nextData);
  return !presetValuesEqual(normalizedExisting, normalizedNext);
}

async function appendBundledFactoryVersion(existing: PresetEntry, next: PresetEntry): Promise<PresetEntry | null> {
  const data = getLatestVersionData(next);
  if (!data) return null;

  const timestamp = Date.now();
  const nextVersion = Math.max(0, ...existing.versions.map(version => version.v)) + 1;
  return {
    ...existing,
    library: 'stock',
    author: 'factory',
    visibility: 'featured',
    versions: [
      ...existing.versions,
      {
        v: nextVersion,
        note: 'factory preset cloud refresh',
        timestamp,
        data,
      },
    ],
    currentVersion: nextVersion,
    updatedAt: timestamp,
  };
}

// ─── Pad factory presets ────────────────────────────────────────────────────

async function loadPadFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { PAD_PRESETS } = await import('../audio/padPresets');
    for (const [id, preset] of Object.entries(PAD_PRESETS)) {
      entries.push(makeFactory('engine', preset.name || id, preset.params as Record<string, unknown>, {
        engine: 'pad1',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load pad factory presets:', e);
  }
  return entries;
}

// ─── Drum factory presets ───────────────────────────────────────────────────

async function loadDrumFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { DRUM_VOICE_PRESETS } = await import('../audio/drumPresets');
    for (const [voice, presets] of Object.entries(DRUM_VOICE_PRESETS)) {
      const engineScope = `drum${voice.charAt(0).toUpperCase()}${voice.slice(1)}`;
      for (const preset of presets) {
        entries.push(makeFactory('engine', preset.name, preset.params as Record<string, unknown>, {
          engine: engineScope,
          tags: preset.tags,
        }));
      }
    }
  } catch (e) {
    console.warn('Failed to load drum factory presets:', e);
  }
  return entries;
}

// ─── Reverb character presets ───────────────────────────────────────────────

async function loadReverbFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { REVERB_CHARACTER_PRESETS } = await import('../ui/reverb/ReverbPage');
    for (const [id, preset] of Object.entries(REVERB_CHARACTER_PRESETS)) {
      entries.push(makeFactory('source', preset.label || id, preset.params as Record<string, unknown>, {
        source: 'reverb',
        tags: ['reverb'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load reverb factory presets:', e);
  }
  return entries;
}

// ─── Water presets (index-based → named) ────────────────────────────────────

async function loadWaterFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    // The live water engine exposes eight named presets and current-state water keys.
    // Seed the real current-engine data so the store can round-trip it meaningfully.
    for (const [index, name] of WATER_PRESETS.entries()) {
      const presetData = morphWaterPresets(index, index, 0);
      entries.push(makeFactory('engine', name, {
        ...presetData,
        waterPreset: index,
        waterMorphA: index,
        waterMorphB: index,
        waterMorph: 0,
        waterReverbSend: 0.3,
      }, {
        engine: 'water',
        tags: ['water', 'nature'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load water factory presets:', e);
  }
  return entries;
}

// ─── Delay presets (Echo Line + Clocked Space) ─────────────────────────────

async function loadDelayFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { ECHO_LINE_PRESETS, CLOCKED_SPACE_PRESETS, DELAY_KIT_PRESETS, DELAY_SOURCE_PRESETS } = await import('../ui/delay/delayPresets');
    for (const [, preset] of Object.entries(ECHO_LINE_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params as unknown as Record<string, unknown>, {
        engine: 'echoLine',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(CLOCKED_SPACE_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params as unknown as Record<string, unknown>, {
        engine: 'clockedSpace',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DELAY_KIT_PRESETS)) {
      entries.push(makeFactory('kit', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'delayKit',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DELAY_SOURCE_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'delay',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load delay factory presets:', e);
  }
  return entries;
}

// ─── Dynamics / Degrade presets ───────────────────────────────────────────

async function loadDynamicsFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const {
      DYNAMICS_DRIFT_PRESETS,
      DYNAMICS_BUS_PRESETS,
      DYNAMICS_EQ1_PRESETS,
      DYNAMICS_EQ2_PRESETS,
      DYNAMICS_EROSION_PRESETS,
      DYNAMICS_END_CHAIN_PRESETS,
      DYNAMICS_MASTER_FX_PRESETS,
      DYNAMICS_SATURATION_PRESETS,
      DYNAMICS_SIDECHAIN_PRESETS,
      DYNAMICS_DEGRADE_PRESETS,
    } = await import('../ui/dynamics/dynamicsPresets');

    for (const [, preset] of Object.entries(DYNAMICS_SIDECHAIN_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params, {
        engine: 'dynamicsSidechain',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_EQ1_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params, {
        engine: 'dynamicsEq1',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_EQ2_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params, {
        engine: 'dynamicsEq2',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_BUS_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params, {
        source: 'dynamicsBus',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_DRIFT_PRESETS)) {
      entries.push(makeFactory('kit', preset.name, preset.params, {
        source: 'degradeDrift',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_EROSION_PRESETS)) {
      entries.push(makeFactory('kit', preset.name, preset.params, {
        source: 'degradeErosion',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_SATURATION_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params, {
        engine: 'dynamicsSaturation',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_END_CHAIN_PRESETS)) {
      entries.push(makeFactory('engine', preset.name, preset.params, {
        engine: 'dynamicsEndChain',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_MASTER_FX_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params, {
        source: 'masterFx',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DYNAMICS_DEGRADE_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params, {
        source: 'degrade',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load dynamics factory presets:', e);
  }
  return entries;
}

// ─── Drums source presets (L2 drumKit + L3 drums) ──────────────────────────

async function loadDrumsSourceFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { DRUMS_SOURCE_PRESETS, DRUM_KIT_PRESETS } = await import('../ui/drums/drumSourcePresets');
    for (const [, preset] of Object.entries(DRUMS_SOURCE_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'drums',
        tags: preset.tags,
      }));
    }
    for (const [, preset] of Object.entries(DRUM_KIT_PRESETS)) {
      entries.push(makeFactory('kit', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'drumKit',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load drums source factory presets:', e);
  }
  return entries;
}

// ─── Synth source presets (L3 synth) ────────────────────────────────────────

async function loadSynthSourceFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { SYNTH_SOURCE_PRESETS } = await import('../ui/synth/synthSourcePresets');
    for (const [, preset] of Object.entries(SYNTH_SOURCE_PRESETS)) {
      entries.push(makeFactory('source', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'synth',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load synth source factory presets:', e);
  }
  return entries;
}



// ─── Earth presets (L2 earthKit) ────────────────────────────────────────────

async function loadEarthFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { EARTH_KIT_PRESETS } = await import('../ui/earth/earthPresets');
    for (const [, preset] of Object.entries(EARTH_KIT_PRESETS)) {
      entries.push(makeFactory('kit', preset.name, preset.params as unknown as Record<string, unknown>, {
        source: 'earthKit',
        tags: preset.tags,
      }));
    }
  } catch (e) {
    console.warn('Failed to load earth factory presets:', e);
  }
  return entries;
}

// ─── LFO presets ────────────────────────────────────────────────────────────

async function loadLfoFactory(): Promise<PresetEntry[]> {
  // Deferred intentionally: these are UI helper presets, not a real registry-backed
  // preset scope, so seeding them would create entries that cannot round-trip cleanly.
  console.info('Skipping LFO factory seeding for now; no matching ParamRegistry scope exists.');
  return [];
}

// ─── Granular presets ─────────────────────────────────────────────────────────

async function loadGranularFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const {
      GRANULAR_PRESET_OPTIONS,
      getGranularPresetData,
      getGranularPresetSliderModes,
    } = await import('../ui/granular/granularPresets');

    for (const option of GRANULAR_PRESET_OPTIONS) {
      if (option.id === 'init') continue; // Skip init — it's a no-op
      const data = getGranularPresetData(option.id);
      if (!data) continue;

      const sliderModes = getGranularPresetSliderModes(option.id);
      const now = Date.now();
      const entry: PresetEntry = {
        type: 'source',
        source: 'granular',
        scope: 'granular',
        name: option.name,
        author: 'factory',
        library: 'stock',
        visibility: 'featured',
        creator: 'Kessho',
        description: option.description,
        familyName: option.name,
        variantName: option.name,
        tags: option.tags,
        versions: [{
          v: 1,
          note: 'factory preset',
          timestamp: now,
          data,
          ...(sliderModes ? { sliderModes: sliderModes as Record<string, 'single' | 'walk' | 'sampleHold'> } : {}),
        }],
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(entry);
    }
  } catch (e) {
    console.warn('Failed to load granular factory presets:', e);
  }
  return entries;
}

// ─── State (L4) presets from /presets/*.json ─────────────────────────────────

async function loadStateFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  const seen = new Set<string>();
  try {
    const manifestRes = await fetch('/presets/manifest.json');
    if (!manifestRes.ok) return entries;
    const manifest = await manifestRes.json();
    for (const file of manifest.files || []) {
      try {
        const res = await fetch(`/presets/${file}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.kesshoPreset && data?.entry?.type === 'state') {
          const entry = data.entry as PresetEntry;
          const latest = getLatestVersionData(entry);
          if (!latest) continue;
          addFactoryEntry(entries, seen, makeFactory('state', entry.name || file.replace('.json', ''), latest, {
            scope: 'global',
            tags: entry.tags?.length ? entry.tags : ['factory'],
          }));
          continue;
        }

        const name = data.name || file.replace('.json', '');
        const state = data.state || data;
        if (!state || typeof state !== 'object') continue;
        addFactoryEntry(entries, seen, makeFactory('state', name, state as Record<string, unknown>, {
          scope: 'global',
          tags: ['factory'],
        }));
      } catch {
        // Skip
      }
    }
  } catch (e) {
    console.warn('Failed to load state factory presets:', e);
  }
  return entries;
}

// ─── Shared Euclidean pattern bank (L1 euclideanPattern) ────────────────────

async function loadEuclideanPatternFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { DRUM_EUCLID_PRESET_DATA } = await import('../audio/drumSequencer');
    for (const [id, pattern] of Object.entries(DRUM_EUCLID_PRESET_DATA)) {
      const label = EUCLIDEAN_PATTERN_LABELS[id] ?? id;
      entries.push(makeFactory('engine', label, buildEuclideanPatternPresetData(id, pattern), {
        engine: 'euclideanPattern',
        tags: ['rhythm', 'euclidean', 'shared-pattern'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load shared euclidean pattern presets:', e);
  }
  return entries;
}

// ─── Master loader ──────────────────────────────────────────────────────────

async function loadAllFactoryEntries(): Promise<PresetEntry[]> {
  const all: PresetEntry[] = [];
  const seen = new Set<string>();

  // Load all sources in parallel
  const [pad, drum, reverb, water, delay, dynamics, drumsSource, synthSource, earth, lfo, granular, euclideanPattern, state] = await Promise.all([
    loadPadFactory(),
    loadDrumFactory(),
    loadReverbFactory(),
    loadWaterFactory(),
    loadDelayFactory(),
    loadDynamicsFactory(),
    loadDrumsSourceFactory(),
    loadSynthSourceFactory(),
    loadEarthFactory(),
    loadLfoFactory(),
    loadGranularFactory(),
    loadEuclideanPatternFactory(),
    loadStateFactory(),
  ]);

  for (const entry of [...pad, ...drum, ...reverb, ...water, ...delay, ...dynamics, ...drumsSource, ...synthSource, ...earth, ...lfo, ...granular, ...euclideanPattern, ...state]) {
    addFactoryEntry(all, seen, entry);
  }

  return all;
}

export async function loadFactoryPresetV2Phases(): Promise<FactoryPresetV2Phases> {
  const all = await loadAllFactoryEntries();
  return {
    l1: all.filter(entry => entry.type === 'engine'),
    l2: all.filter(entry => entry.type === 'kit'),
    l3: all.filter(entry => entry.type === 'source'),
    l4: all.filter(entry => entry.type === 'state'),
    all,
  };
}

/**
 * Load all factory presets into PresetStore.
 * Idempotent — checks a localStorage flag to avoid re-running.
 * Returns the number of presets loaded.
 */
export async function loadFactoryPresets(): Promise<number> {
  if (isFactoryLoaded()) return 0;

  const store = getPresetStore();
  const all = await loadAllFactoryEntries();

  let savedCount = 0;

  // Save all to store.
  // In shared testing mode, seed missing entries and refresh bundled stock
  // dynamics presets; never overwrite user/cloud presets with the same name.
  for (const entry of all) {
    const scope = entry.scope ?? entry.engine ?? entry.source;
    if (SHARED_PRESET_TEST_MODE || entry.library === 'stock') {
      const existing = await store.load(entry.type, entry.name, scope);
      if (existing) {
        if (shouldRefreshBundledFactoryEntry(existing, entry)) {
          const refreshed = shouldAppendBundledFactoryVersion(existing, entry)
            ? await appendBundledFactoryVersion(existing, entry)
            : null;
          if (refreshed) {
            await store.save(refreshed);
            savedCount += 1;
          }
        }
        continue;
      }
    }

    await store.save(entry);
    savedCount += 1;
  }

  // Mark as loaded
  writeFactoryLoadedFlag();
  console.log(`Loaded ${savedCount} factory presets`);
  return savedCount;
}
