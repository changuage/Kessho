import type { PresetLevel } from './types';
import { applyLegacyStateKeyAliases } from '../ui/state';
import { convertLegacyPadPitchFields } from '../ui/synth/padPitch';

type JsonRecord = Record<string, unknown>;

const RETIRED_INERT_STATE_KEYS = new Set([
  'airNoise',
  'filterModSpeed',
  'oscBrightness',
  'leadTimbre',
  'granularPreset',
  'granularDryWet',
  'granularVisualDetail',
  'synthArpConfigs',
  'synthChordSequencerEnabled',
  'synthChordSequencerSource',
  'synthChordSequencerVoiceCount',
  'synthChordSequencerClockDivision',
  'synthChordSequencer',
  'harmonyChordSequence',
  'harmonyChordSequenceA',
  'harmonyChordSequenceB',
  'harmonyChordSequenceEnabled',
  'harmonyChordSequenceLength',
  'harmonyChordSequenceStepIndex',
  'harmonyGenerationSeed',
  'chordProgressionEnabled',
  'chordProgressionPattern',
  'chordProgressionSteps',
  'chordProgressionHits',
  'chordProgressionRotation',
  'chordProgressionStepEnabled',
  'chordProgressionPhraseMultiplier',
  'chordProgressionClockSource',
  'drumRandomMorphUpdate',
  'drumRandomEnabled',
  'drumRandomDensity',
  'drumRandomSubProb',
  'drumRandomKickProb',
  'drumRandomClickProb',
  'drumRandomBeepHiProb',
  'drumRandomBeepLoProb',
  'drumRandomNoiseProb',
  'drumRandomMinInterval',
  'drumRandomMaxInterval',
  'spectralFreezeCaptureSerial',
]);

const RETIRED_SPECTRAL_FREEZE_KEYS = [
  'spectralFreezeSlushy',
  'spectralFreezeSpeed',
  'spectralFreezeDecay',
  'spectralFreezePhaseJitter',
] as const;

const LEGACY_PAD_CUTOFF_PAIRS = [
  ['filterCutoffMin', 'filterCutoffMax', 'filterCutoff'],
  ['pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterCutoff'],
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function canonicalizeLegacyPadCutoffs(version: JsonRecord, data: JsonRecord): void {
  for (const [minKey, maxKey, cutoffKey] of LEGACY_PAD_CUTOFF_PAIRS) {
    const min = finiteNumber(data[minKey]);
    const max = finiteNumber(data[maxKey]);
    if (min === null && max === null) continue;

    const lower = min ?? max!;
    const upper = max ?? min!;
    if (finiteNumber(data[cutoffKey]) === null) {
      data[cutoffKey] = (lower + upper) * 0.5;
    }

    if (Math.abs(upper - lower) > 1) {
      const dualRanges = isRecord(version.dualRanges) ? { ...version.dualRanges } : {};
      const sliderModes = isRecord(version.sliderModes) ? { ...version.sliderModes } : {};
      if (!isRecord(dualRanges[cutoffKey])) {
        dualRanges[cutoffKey] = { min: Math.min(lower, upper), max: Math.max(lower, upper) };
      }
      if (sliderModes[cutoffKey] !== 'walk' && sliderModes[cutoffKey] !== 'sampleHold') {
        sliderModes[cutoffKey] = 'walk';
      }
      version.dualRanges = dualRanges;
      version.sliderModes = sliderModes;
      const dualSliderConfigs = isRecord(version.dualSliderConfigs) ? { ...version.dualSliderConfigs } : {};
      if (!isRecord(dualSliderConfigs[cutoffKey])) {
        dualSliderConfigs[cutoffKey] = {
          source: 'a',
          range: [Math.min(lower, upper), Math.max(lower, upper)],
        };
      }
      version.dualSliderConfigs = dualSliderConfigs;
    }

    if (isRecord(version.dualRanges)) {
      const dualRanges = { ...version.dualRanges };
      delete dualRanges[minKey];
      delete dualRanges[maxKey];
      version.dualRanges = dualRanges;
    }
    if (isRecord(version.sliderModes)) {
      const sliderModes = { ...version.sliderModes };
      delete sliderModes[minKey];
      delete sliderModes[maxKey];
      version.sliderModes = sliderModes;
    }
    delete data[minKey];
    delete data[maxKey];
  }
}

function canonicalizeLegacyOscillatorBrightness(data: JsonRecord): void {
  const brightness = finiteNumber(data.oscBrightness);
  if (brightness === null) return;

  const waves = brightness <= 0
    ? ['sine', 'sine']
    : brightness <= 1
      ? ['triangle', 'triangle']
      : brightness <= 2
        ? ['sawtooth', 'triangle']
        : ['sawtooth', 'sawtooth'];
  if (!('padOscAWave' in data)) data.padOscAWave = waves[0];
  if (!('padOscBWave' in data)) data.padOscBWave = waves[1];
}

function canonicalizeLegacyGranularMix(data: JsonRecord): void {
  const dryWet = finiteNumber(data.granularDryWet);
  if (dryWet !== null && finiteNumber(data.granularLevel) === null) {
    data.granularLevel = dryWet;
  }
}

function discardInactiveLegacySpectralFreeze(data: JsonRecord): void {
  const hasRetiredField = RETIRED_SPECTRAL_FREEZE_KEYS.some((key) => key in data);
  if (!hasRetiredField || data.spectralFreezeEnabled === true) return;

  for (const key of RETIRED_SPECTRAL_FREEZE_KEYS) delete data[key];
  // Never arm an otherwise disabled legacy snapshot.
  delete data.spectralFreezeActive;
  delete data.spectralFreezeCaptureSerial;
}

function canonicalizeStoredVersion(
  input: unknown,
  type: PresetLevel,
): unknown {
  if (!isRecord(input) || !isRecord(input.data)) return input;

  const version: JsonRecord = { ...input };
  const data: JsonRecord = { ...input.data };
  if (type !== 'journey') {
    applyLegacyStateKeyAliases(data);
    if (isRecord(version.dualRanges)) {
      const dualRanges = { ...version.dualRanges };
      applyLegacyStateKeyAliases(dualRanges);
      version.dualRanges = dualRanges;
    }
    if (isRecord(version.sliderModes)) {
      const sliderModes = { ...version.sliderModes };
      applyLegacyStateKeyAliases(sliderModes);
      version.sliderModes = sliderModes;
    }
    if (isRecord(version.dualSliderConfigs)) {
      const dualSliderConfigs = { ...version.dualSliderConfigs };
      applyLegacyStateKeyAliases(dualSliderConfigs);
      for (const [key, rawConfig] of Object.entries(dualSliderConfigs)) {
        if (!isRecord(rawConfig) || !Array.isArray(rawConfig.range)) continue;
        dualSliderConfigs[key] = {
          source: rawConfig.source === 'b' || rawConfig.mode === 'sampleHold' ? 'b' : 'a',
          range: rawConfig.range,
        };
      }
      version.dualSliderConfigs = dualSliderConfigs;
    }
  }
  if (type === 'state') {
    canonicalizeLegacyOscillatorBrightness(data);
    canonicalizeLegacyGranularMix(data);
    for (const key of RETIRED_INERT_STATE_KEYS) delete data[key];
  }
  // Pad Octave/Detune is accepted only at this decode boundary. The current
  // state and preset layers use one continuous Pitch per oscillator.
  convertLegacyPadPitchFields(data);
  discardInactiveLegacySpectralFreeze(data);
  if (type !== 'state') delete data.spectralFreezeActive;
  delete data.spectralFreezeCaptureSerial;
  canonicalizeLegacyPadCutoffs(version, data);
  version.data = data;
  return version;
}

/**
 * Canonicalize a deliberately small set of retired storage fields before the
 * strict current-schema decoder runs. This is a read-only compatibility
 * boundary: current saves and imports still use the strict decoder directly.
 */
export function canonicalizeStoredPresetEntry(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.versions)) return input;
  const type = input.type;
  if (type !== 'engine' && type !== 'kit' && type !== 'source' && type !== 'state' && type !== 'journey') {
    return input;
  }
  return {
    ...input,
    versions: input.versions.map((version) => canonicalizeStoredVersion(version, type)),
  };
}
