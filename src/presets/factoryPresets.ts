// src/presets/factoryPresets.ts
// Phase 1 — One-time migration of hardcoded factory presets into PresetStore.
//
// Sources:
//   Pad:     PAD_PRESETS from padPresets.ts         → 18 L1 engine presets
//   Drums:   *_PRESETS from drumPresets.ts           → 84 L1 engine presets
//   Water:   WATER_PRESETS from waterPresets.ts      → 8 L1 engine presets
//   Reverb:  REVERB_CHARACTER_PRESETS               → 8 L3 source presets
//   Lead:    Lead4opFM manifest (lazy-fetched)      → loaded on demand, not stored here
//   Granular: composite granular presets             → deferred; current store cannot round-trip them safely
//   LFO:     UI helper presets                      → deferred; no matching ParamRegistry scope

import type { PresetEntry } from './types';
import { getPresetStore } from './PresetStore';
import { morphWaterPresets, WATER_PRESETS } from '../audio/waterPresets';

const FACTORY_LOADED_KEY = 'preset:factory-loaded:v9';

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
  return readFactoryLoadedFlag();
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

// ─── Drum Euclidean presets (L1 drumEuclidean) ──────────────────────────────

async function loadDrumEuclideanFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { DRUM_EUCLID_PRESET_DATA } = await import('../audio/drumSequencer');

    // Human-readable labels for the pattern IDs
    const LABELS: Record<string, string> = {
      sparse: 'Sparse', dense: 'Dense', longSparse: 'Long Sparse',
      poly3v4: 'Poly 3v4', poly4v3: 'Poly 4v3', poly5v4: 'Poly 5v4',
      lancaran: 'Lancaran', ketawang: 'Ketawang', ladrang: 'Ladrang',
      gangsaran: 'Gangsaran', kotekan: 'Kotekan', kotekan2: 'Kotekan B',
      srepegan: 'Srepegan', sampak: 'Sampak', ayak: 'Ayak', bonang: 'Bonang',
      tresillo: 'Tresillo', cinquillo: 'Cinquillo', rumba: 'Rumba',
      bossa: 'Bossa Nova', son: 'Son Clave', shiko: 'Shiko',
      soukous: 'Soukous', gahu: 'Gahu', bembe: 'Bembé',
      clapping: 'Clapping', clappingB: 'Clapping B',
      additive7: 'Additive 7', additive11: 'Additive 11', additive13: 'Additive 13',
      reich18: 'Reich 18', drumming: 'Drumming',
    };

    for (const [id, pattern] of Object.entries(DRUM_EUCLID_PRESET_DATA)) {
      const label = LABELS[id] ?? id;
      // Build a full 69-param snapshot: lane 1 uses the pattern, lanes 2-4 disabled
      const data: Record<string, unknown> = {
        drumEuclidMasterEnabled: true,
        drumEuclidBaseBPM: 120,
        drumEuclidTempo: 120,
        drumEuclidSwing: 0,
        drumEuclidDivision: '1/16',
      };

      // Lane 1: active with the pattern
      Object.assign(data, {
        drumEuclid1Enabled: true,
        drumEuclid1Preset: id,
        drumEuclid1Steps: pattern.steps,
        drumEuclid1Hits: pattern.hits,
        drumEuclid1Rotation: pattern.rotation,
        drumEuclid1TargetSub: false,
        drumEuclid1TargetKick: true,
        drumEuclid1TargetClick: true,
        drumEuclid1TargetBeepHi: false,
        drumEuclid1TargetBeepLo: false,
        drumEuclid1TargetNoise: false,
        drumEuclid1TargetMembrane: false,
        drumEuclid1Probability: 1,
        drumEuclid1VelocityMin: 0.5,
        drumEuclid1VelocityMax: 1,
        drumEuclid1Level: 0.8,
      });

      // Lanes 2-4: disabled with neutral defaults
      for (const n of [2, 3, 4]) {
        Object.assign(data, {
          [`drumEuclid${n}Enabled`]: false,
          [`drumEuclid${n}Preset`]: 'custom',
          [`drumEuclid${n}Steps`]: 16,
          [`drumEuclid${n}Hits`]: 4,
          [`drumEuclid${n}Rotation`]: 0,
          [`drumEuclid${n}TargetSub`]: false,
          [`drumEuclid${n}TargetKick`]: false,
          [`drumEuclid${n}TargetClick`]: false,
          [`drumEuclid${n}TargetBeepHi`]: n === 2,
          [`drumEuclid${n}TargetBeepLo`]: n === 3,
          [`drumEuclid${n}TargetNoise`]: n === 4,
          [`drumEuclid${n}TargetMembrane`]: false,
          [`drumEuclid${n}Probability`]: 1,
          [`drumEuclid${n}VelocityMin`]: 0.5,
          [`drumEuclid${n}VelocityMax`]: 1,
          [`drumEuclid${n}Level`]: 0.7,
        });
      }

      entries.push(makeFactory('engine', label, data, {
        engine: 'drumEuclidean',
        tags: ['rhythm', 'euclidean'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load drum euclidean factory presets:', e);
  }
  return entries;
}

// ─── Synth Euclidean presets (L1 synthEuclidean) ────────────────────────────

async function loadSynthEuclideanFactory(): Promise<PresetEntry[]> {
  const entries: PresetEntry[] = [];
  try {
    const { DRUM_EUCLID_PRESET_DATA } = await import('../audio/drumSequencer');

    // Reuse the same 32 named rhythmic patterns from the drum sequencer.
    // Synth lanes target lead/pad sources instead of drum voices.
    const LABELS: Record<string, string> = {
      sparse: 'Sparse', dense: 'Dense', longSparse: 'Long Sparse',
      poly3v4: 'Poly 3v4', poly4v3: 'Poly 4v3', poly5v4: 'Poly 5v4',
      lancaran: 'Lancaran', ketawang: 'Ketawang', ladrang: 'Ladrang',
      gangsaran: 'Gangsaran', kotekan: 'Kotekan', kotekan2: 'Kotekan B',
      srepegan: 'Srepegan', sampak: 'Sampak', ayak: 'Ayak', bonang: 'Bonang',
      tresillo: 'Tresillo', cinquillo: 'Cinquillo', rumba: 'Rumba',
      bossa: 'Bossa Nova', son: 'Son Clave', shiko: 'Shiko',
      soukous: 'Soukous', gahu: 'Gahu', bembe: 'Bembé',
      clapping: 'Clapping', clappingB: 'Clapping B',
      additive7: 'Additive 7', additive11: 'Additive 11', additive13: 'Additive 13',
      reich18: 'Reich 18', drumming: 'Drumming',
    };

    for (const [id, pattern] of Object.entries(DRUM_EUCLID_PRESET_DATA)) {
      const label = LABELS[id] ?? id;
      const data: Record<string, unknown> = {
        synthEuclideanMasterEnabled: true,
        synthEuclideanTempo: 1,
        synthEuclidBaseBPM: 120,
        synthChordSequencerEnabled: false,
      };

      // Lane 1: active with the pattern, targeting lead
      Object.assign(data, {
        synthEuclid1Enabled: true,
        synthEuclid1Preset: id,
        synthEuclid1Steps: pattern.steps,
        synthEuclid1Hits: pattern.hits,
        synthEuclid1Rotation: pattern.rotation,
        synthEuclid1NoteMin: 64,
        synthEuclid1NoteMax: 76,
        synthEuclid1Level: 0.8,
        synthEuclid1Probability: 1,
        synthEuclid1Source: 'lead',
      });

      // Lanes 2-4: disabled with defaults
      const LANE_DEFAULTS: Array<{ noteMin: number; noteMax: number; level: number; source: string }> = [
        { noteMin: 76, noteMax: 88, level: 0.6, source: 'lead' },
        { noteMin: 52, noteMax: 64, level: 0.9, source: 'lead' },
        { noteMin: 88, noteMax: 96, level: 0.5, source: 'lead' },
      ];
      for (let i = 0; i < 3; i++) {
        const n = i + 2;
        const d = LANE_DEFAULTS[i] ?? LANE_DEFAULTS[0]!;
        Object.assign(data, {
          [`synthEuclid${n}Enabled`]: false,
          [`synthEuclid${n}Preset`]: 'custom',
          [`synthEuclid${n}Steps`]: [8, 16, 16][i],
          [`synthEuclid${n}Hits`]: [3, 2, 6][i],
          [`synthEuclid${n}Rotation`]: 0,
          [`synthEuclid${n}NoteMin`]: d.noteMin,
          [`synthEuclid${n}NoteMax`]: d.noteMax,
          [`synthEuclid${n}Level`]: d.level,
          [`synthEuclid${n}Probability`]: 1,
          [`synthEuclid${n}Source`]: d.source,
        });
      }

      entries.push(makeFactory('engine', label, data, {
        engine: 'synthEuclidean',
        tags: ['rhythm', 'euclidean', 'melodic'],
      }));
    }
  } catch (e) {
    console.warn('Failed to load synth euclidean factory presets:', e);
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
  const seen = new Set<string>();

  // Load all sources in parallel
  const [pad, drum, reverb, water, delay, drumsSource, synthSource, earth, lfo, granular, drumEuclid, synthEuclid, state] = await Promise.all([
    loadPadFactory(),
    loadDrumFactory(),
    loadReverbFactory(),
    loadWaterFactory(),
    loadDelayFactory(),
    loadDrumsSourceFactory(),
    loadSynthSourceFactory(),
    loadEarthFactory(),
    loadLfoFactory(),
    loadGranularFactory(),
    loadDrumEuclideanFactory(),
    loadSynthEuclideanFactory(),
    loadStateFactory(),
  ]);

  for (const entry of [...pad, ...drum, ...reverb, ...water, ...delay, ...drumsSource, ...synthSource, ...earth, ...lfo, ...granular, ...drumEuclid, ...synthEuclid, ...state]) {
    addFactoryEntry(all, seen, entry);
  }

  // Save all to store
  for (const entry of all) {
    await store.save(entry);
  }

  // Mark as loaded
  writeFactoryLoadedFlag();
  console.log(`Loaded ${all.length} factory presets`);
  return all.length;
}
