import { interpolatePresets } from '../audio/drumMorph';
import type { DrumVoiceType } from '../audio/drumPresets';
import { getPreset as getDrumPreset } from '../audio/drumPresets';
import {
  getPadPreset,
  morphPadPresets,
  PAD_PRESET_PARAM_KEYS,
  PAD1_TO_PAD2_KEY,
} from '../audio/padPresets';
import {
  morphWaterPresets,
  WATER_MORPH_PARAM_KEYS,
} from '../audio/waterPresets';
import { presetValuesEqual } from './presetUtils';
import {
  getGranularPresetData,
  isGranularDelayBStateKey,
} from '../ui/granular/granularPresets';
import type { SliderState } from '../ui/state';

type StateRecord = Partial<Record<keyof SliderState, unknown>> & Record<string, unknown>;

const DRUM_VOICE_KEYS: Record<
  DrumVoiceType,
  {
    presetA: keyof SliderState;
    presetB: keyof SliderState;
    morph: keyof SliderState;
  }
> = {
  sub: { presetA: 'drumSubPresetA', presetB: 'drumSubPresetB', morph: 'drumSubMorph' },
  kick: { presetA: 'drumKickPresetA', presetB: 'drumKickPresetB', morph: 'drumKickMorph' },
  click: { presetA: 'drumClickPresetA', presetB: 'drumClickPresetB', morph: 'drumClickMorph' },
  beepHi: { presetA: 'drumBeepHiPresetA', presetB: 'drumBeepHiPresetB', morph: 'drumBeepHiMorph' },
  beepLo: { presetA: 'drumBeepLoPresetA', presetB: 'drumBeepLoPresetB', morph: 'drumBeepLoMorph' },
  noise: { presetA: 'drumNoisePresetA', presetB: 'drumNoisePresetB', morph: 'drumNoiseMorph' },
  membrane: { presetA: 'drumMembranePresetA', presetB: 'drumMembranePresetB', morph: 'drumMembraneMorph' },
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildPadDerivedData(state: StateRecord): Record<string, unknown> {
  const derived: Record<string, unknown> = {};

  const pad1PresetA = asString(state.padPresetA);
  const pad1PresetB = asString(state.padPresetB);
  if (pad1PresetA && pad1PresetB) {
    const presetA = getPadPreset(pad1PresetA, 'pad1');
    const presetB = getPadPreset(pad1PresetB, 'pad1');
    if (presetA && presetB) {
      const morphed = morphPadPresets(presetA, presetB, asNumber(state.padMorph));
      for (const key of PAD_PRESET_PARAM_KEYS) {
        if (key in morphed) {
          derived[key] = morphed[key];
        }
      }
    }
  }

  const pad2PresetA = asString(state.pad2PresetA);
  const pad2PresetB = asString(state.pad2PresetB);
  if (pad2PresetA && pad2PresetB) {
    const presetA = getPadPreset(pad2PresetA, 'pad2');
    const presetB = getPadPreset(pad2PresetB, 'pad2');
    if (presetA && presetB) {
      const morphed = morphPadPresets(presetA, presetB, asNumber(state.pad2Morph));
      for (const key of PAD_PRESET_PARAM_KEYS) {
        const pad2Key = PAD1_TO_PAD2_KEY[key];
        if (pad2Key && key in morphed) {
          derived[pad2Key] = morphed[key];
        }
      }
    }
  }

  return derived;
}

function buildDrumDerivedData(state: StateRecord): Record<string, unknown> {
  const derived: Record<string, unknown> = {};

  for (const [voice, keys] of Object.entries(DRUM_VOICE_KEYS) as Array<[DrumVoiceType, (typeof DRUM_VOICE_KEYS)[DrumVoiceType]]>) {
    const presetAName = asString(state[keys.presetA]);
    const presetBName = asString(state[keys.presetB]);
    if (!presetAName || !presetBName) continue;

    const presetA = getDrumPreset(voice, presetAName);
    const presetB = getDrumPreset(voice, presetBName);
    if (!presetA || !presetB) continue;

    const morphed = interpolatePresets(presetA, presetB, asNumber(state[keys.morph]));
    for (const [key, value] of Object.entries(morphed)) {
      derived[key] = value;
    }
  }

  return derived;
}

function buildGranularDerivedData(state: StateRecord): Record<string, unknown> {
  const presetId = asString(state.granularPreset);
  if (!presetId) return {};

  const presetData = getGranularPresetData(presetId);
  if (!presetData) return {};

  const delayBGranularLinked = state.delayBGranularLinked !== false;
  const derived: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(presetData)) {
    if (!delayBGranularLinked && isGranularDelayBStateKey(key)) continue;
    derived[key] = value;
  }

  if (delayBGranularLinked && !('granularDelayBSend' in derived) && presetData.granularDelayEnabled === true) {
    derived.granularDelayBSend = 1;
  }
  if ((derived.granularDelayBSend as number | undefined) && Number(derived.granularDelayBSend) > 0) {
    derived.granularDelayEnabled = true;
  }

  return derived;
}

function buildWaterDerivedData(state: StateRecord): Record<string, unknown> {
  const morphA = asNumber(state.waterMorphA);
  const morphB = asNumber(state.waterMorphB);
  const morph = asNumber(state.waterMorph);
  const morphed = morphWaterPresets(morphA, morphB, morph);
  const derived: Record<string, unknown> = {};

  for (const key of WATER_MORPH_PARAM_KEYS) {
    if (key in morphed) {
      derived[key] = morphed[key];
    }
  }

  derived.waterPreset = morph < 0.5 ? morphA : morphB;
  return derived;
}

export function buildDerivedStatePresetData(state: StateRecord): Record<string, unknown> {
  return {
    ...buildPadDerivedData(state),
    ...buildDrumDerivedData(state),
    ...buildGranularDerivedData(state),
    ...buildWaterDerivedData(state),
  };
}

export function hydrateOptimizedStatePresetData(state: StateRecord): StateRecord {
  const next: StateRecord = { ...state };
  const derived = buildDerivedStatePresetData(next);

  for (const [key, value] of Object.entries(derived)) {
    if (!(key in next)) {
      next[key] = value;
    }
  }

  return next;
}

export function extractOptimizedStatePresetData(state: SliderState): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...state };
  const derived = buildDerivedStatePresetData(snapshot);

  for (const [key, value] of Object.entries(derived)) {
    if (key in snapshot && presetValuesEqual(snapshot[key], value)) {
      delete snapshot[key];
    }
  }

  return snapshot;
}
