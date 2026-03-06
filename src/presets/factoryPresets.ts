// src/presets/factoryPresets.ts
// Phase 1 — One-time migration of hardcoded factory presets into PresetStore.
//
// Sources:
//   Pad:    PAD_PRESETS from padPresets.ts         → 18 L1 engine presets
//   Drums:  *_PRESETS from drumPresets.ts           → 84 L1 engine presets
//   Water:  WATER_PRESETS from waterPresets.ts      → 4 L1 engine presets (index-based)
//   Reverb: REVERB_CHARACTER_PRESETS               → 8 L3 source presets
//   Lead:   Lead4opFM manifest (lazy-fetched)      → loaded on demand, not stored here
//   Looper: LOOPER_PRESET_MAP                      → 18 composite presets (stored as L1)
//   LFO:    LFO_PRESETS                            → ~20 L1 engine presets

import type { PresetEntry } from './types';
import { getPresetStore } from './PresetStore';

const FACTORY_LOADED_KEY = 'preset:factory-loaded:v1';

/** Check whether factory presets have already been loaded */
export function isFactoryLoaded(): boolean {
  return localStorage.getItem(FACTORY_LOADED_KEY) === 'true';
}

/** Create a factory PresetEntry shell */
function makeFactory(
  type: PresetEntry['type'],
  name: string,
  data: Record<string, unknown>,
  opts?: { engine?: string; source?: string; tags?: string[] },
): PresetEntry {
  const now = Date.now();
  return {
    type,
    engine: opts?.engine,
    source: opts?.source,
    name,
    author: 'factory',
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
    const { WATER_PRESETS } = await import('../audio/waterPresets');
    // WATER_PRESETS is a readonly tuple of 4 string names
    // The actual morph data is internal; we store just a marker entry
    for (let i = 0; i < WATER_PRESETS.length; i++) {
      entries.push(makeFactory('engine', WATER_PRESETS[i], { waterPresetIndex: i }, {
        engine: 'water',
        tags: ['water', 'nature'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load water factory presets:', e);
  }
  return entries;
}

// ─── LFO presets ────────────────────────────────────────────────────────────

async function loadLfoFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { LFO_PRESETS } = await import('../ui/synth/lfoPresets');
    for (const preset of LFO_PRESETS) {
      entries.push(makeFactory('engine', preset.name, {
        lfoId: preset.id,
        lfoDest: preset.dest,
        lfoWave: preset.wave,
        lfoRate: preset.rate,
        lfoDepth: preset.depth,
      }, {
        engine: 'lfo',
        tags: [preset.category],
      }));
    }
  } catch (e) {
    console.warn('Failed to load LFO factory presets:', e);
  }
  return entries;
}

// ─── Looper presets ─────────────────────────────────────────────────────────

async function loadLooperFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { getLooperPresetData } = await import('../ui/looper/looperPresets');
    // Known preset IDs from the file
    const presetIds = [
      'legacy_cloud', 'loop_forest', 'mood_slip', 'mosaic_shimmer',
      'flux_cloud', 'self_generating', 'tape_loop', 'shimmer_pad',
      'glitch_chop', 'ambient_wash', 'stutter', 'reverse_cloud',
      'drone_freeze', 'polyrhythm', 'scatter', 'warm_delay',
      'ice_crystals', 'microcosm',
    ];
    for (const id of presetIds) {
      const data = getLooperPresetData(id);
      if (data) {
        const displayName = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        entries.push(makeFactory('engine', displayName, data, {
          engine: 'looper',
          tags: ['looper', 'granular'],
        }));
      }
    }
  } catch (e) {
    console.warn('Failed to load looper factory presets:', e);
  }
  return entries;
}

// ─── State (L4) presets from /presets/*.json ─────────────────────────────────

async function loadStateFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const manifestRes = await fetch('/presets/manifest.json');
    if (!manifestRes.ok) return entries;
    const manifest = await manifestRes.json();
    for (const file of manifest.files || []) {
      try {
        const res = await fetch(`/presets/${file}`);
        if (!res.ok) continue;
        const data = await res.json();
        const name = data.name || file.replace('.json', '');
        const state = data.state || data;
        entries.push(makeFactory('state', name, state, {
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

// ─── Master loader ──────────────────────────────────────────────────────────

/**
 * Load all factory presets into PresetStore.
 * Idempotent — checks a localStorage flag to avoid re-running.
 * Returns the number of presets loaded.
 */
export async function loadFactoryPresets(): Promise<number> {
  if (isFactoryLoaded()) return 0;

  const store = getPresetStore();
  const all: PresetEntry[] = [];

  // Load all sources in parallel
  const [pad, drum, reverb, water, lfo, looper, state] = await Promise.all([
    loadPadFactory(),
    loadDrumFactory(),
    loadReverbFactory(),
    loadWaterFactory(),
    loadLfoFactory(),
    loadLooperFactory(),
    loadStateFactory(),
  ]);

  all.push(...pad, ...drum, ...reverb, ...water, ...lfo, ...looper, ...state);

  // Save all to store
  for (const entry of all) {
    await store.save(entry);
  }

  // Mark as loaded
  localStorage.setItem(FACTORY_LOADED_KEY, 'true');
  console.log(`Loaded ${all.length} factory presets`);
  return all.length;
}
