import type { SliderState, TransportPrimaryClock } from '../ui/state';

export const KESSHO_CORE_SCHEMA = 'kessho-core-v1' as const;
export const KESSHO_CORE_SNAPSHOT_VERSION = 1 as const;
export const KESSHO_CORE_SCHEMA_HASH = 0x4b435632; // "KCV2" scalar ABI

export type KesshoEngineSchema = typeof KESSHO_CORE_SCHEMA;

export interface KesshoSnapshotMetadata {
  presetId?: string;
  presetName?: string;
  seed?: number;
}

export interface KesshoTransportSnapshot {
  primaryClock: TransportPrimaryClock;
  bpm: number;
  barsPerPhrase: number;
  beatsPerBar: number;
  phraseLengthSec: number;
}

export interface KesshoRoutingSnapshot {
  masterGain: number;
  reverbEnabled: boolean;
  sends: Record<string, number>;
}

export interface KesshoVoiceSnapshot {
  id: string;
  engine: 'pad' | 'lead-fm' | 'granular' | 'drum' | 'soundscapes';
  enabled: boolean;
  level: number;
  morph?: number;
  presetA?: string;
  presetB?: string;
  params: Record<string, number | string | boolean>;
}

export interface KesshoFxSnapshot {
  id: string;
  engine: 'reverb' | 'delay' | 'dynamics' | 'spectral-freeze';
  enabled: boolean;
  mix: number;
  params: Record<string, number | string | boolean>;
}

export interface KesshoEngineSnapshot {
  version: typeof KESSHO_CORE_SNAPSHOT_VERSION;
  engineSchema: KesshoEngineSchema;
  metadata: KesshoSnapshotMetadata;
  transport: KesshoTransportSnapshot;
  routing: KesshoRoutingSnapshot;
  voices: KesshoVoiceSnapshot[];
  fx: KesshoFxSnapshot[];
}

export interface KesshoCoreSnapshotScalarsV1 {
  version: typeof KESSHO_CORE_SNAPSHOT_VERSION;
  schemaHash: typeof KESSHO_CORE_SCHEMA_HASH;
  bpm: number;
  masterGain: number;
  renderMode: number;
  smokeFrequencyHz: number;
  smokeAmplitude: number;
  flags: number;
  beatsPerBar: number;
  barsPerPhrase: number;
  seed: number;
  reserved0: number;
}

interface SnapshotOptions {
  presetId?: string;
  presetName?: string;
  seed?: number;
}

type StateRecord = Record<string, unknown>;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function getSharedBpm(state: StateRecord): number {
  return boundedNumber(
    state.sequencerMasterBPM ?? state.synthEuclidBaseBPM ?? state.drumEuclidBaseBPM,
    120,
    40,
    300,
  );
}

function transportPrimaryClock(value: unknown): TransportPrimaryClock {
  return value === 'bpm' || value === 'decoupled' || value === 'seconds' ? value : 'seconds';
}

function createTransportSnapshot(state: StateRecord): KesshoTransportSnapshot {
  return {
    primaryClock: transportPrimaryClock(state.transportPrimaryClock),
    bpm: getSharedBpm(state),
    barsPerPhrase: boundedNumber(state.transportBarsPerPhrase, 4, 1, 16),
    beatsPerBar: boundedNumber(state.transportBeatsPerBar, 4, 2, 12),
    phraseLengthSec: boundedNumber(state.phraseLength, 16, 1, 128),
  };
}

function createRoutingSnapshot(state: StateRecord): KesshoRoutingSnapshot {
  return {
    masterGain: boundedNumber(state.masterVolume, 1, 0, 1),
    reverbEnabled: booleanValue(state.reverbEnabled, true),
    sends: {
      drumDelayA: boundedNumber(state.drumDelayASend, 0, 0, 1),
      drumDelayB: boundedNumber(state.drumDelayBSend, 0, 0, 1),
      granularDelayA: boundedNumber(state.granularDelayASend, 0, 0, 1),
      granularDelayB: boundedNumber(state.granularDelayBSend, 0, 0, 1),
      lead1DelayA: boundedNumber(state.lead1DelayASend, 0, 0, 1),
      lead1DelayB: boundedNumber(state.lead1DelayBSend, 0, 0, 1),
      lead2DelayA: boundedNumber(state.lead2DelayASend, 0, 0, 1),
      lead2DelayB: boundedNumber(state.lead2DelayBSend, 0, 0, 1),
      pad1DelayA: boundedNumber(state.pad1DelayASend, 0, 0, 1),
      pad1DelayB: boundedNumber(state.pad1DelayBSend, 0, 0, 1),
      pad1Reverb: boundedNumber(state.pad1ReverbSend, 0, 0, 1),
      pad2DelayA: boundedNumber(state.pad2DelayASend, 0, 0, 1),
      pad2DelayB: boundedNumber(state.pad2DelayBSend, 0, 0, 1),
      pad2Reverb: boundedNumber(state.pad2ReverbSend, 0, 0, 1),
    },
  };
}

function createVoices(state: StateRecord): KesshoVoiceSnapshot[] {
  return [
    {
      id: 'pad1',
      engine: 'pad',
      enabled: booleanValue(state.padEnabled, true),
      level: boundedNumber(state.synthLevel, 0, 0, 1),
      morph: boundedNumber(state.padMorph, 0, 0, 1),
      presetA: stringValue(state.padPresetA, 'default'),
      presetB: stringValue(state.padPresetB, 'default'),
      params: {
        distance: boundedNumber(state.padDistance, 0, 0, 1),
        foldAmount: boundedNumber(state.padFoldAmount, 0, 0, 1),
        postLPF: boundedNumber(state.padPostLPF, 18000, 20, 20000),
        stereoWidth: boundedNumber(state.padStereoWidth, 0.5, 0, 1),
      },
    },
    {
      id: 'pad2',
      engine: 'pad',
      enabled: booleanValue(state.pad2Enabled, false),
      level: boundedNumber(state.pad2Level, 0, 0, 1),
      morph: boundedNumber(state.pad2Morph, 0, 0, 1),
      presetA: stringValue(state.pad2PresetA, 'default'),
      presetB: stringValue(state.pad2PresetB, 'default'),
      params: {
        distance: boundedNumber(state.pad2Distance, 0, 0, 1),
        foldAmount: boundedNumber(state.pad2FoldAmount, 0, 0, 1),
        postLPF: boundedNumber(state.pad2PostLPF, 18000, 20, 20000),
        stereoWidth: boundedNumber(state.pad2StereoWidth, 0.5, 0, 1),
      },
    },
    {
      id: 'lead1',
      engine: 'lead-fm',
      enabled: booleanValue(state.leadEnabled, true),
      level: boundedNumber(state.lead1Level ?? state.leadLevel, 0, 0, 1),
      morph: boundedNumber(state.lead1Morph, 0, 0, 1),
      presetA: stringValue(state.lead1PresetA, 'soft_rhodes'),
      presetB: stringValue(state.lead1PresetB, 'gamelan'),
      params: {
        density: boundedNumber(state.lead1Density, 1, 0, 4),
        distance: boundedNumber(state.lead1Distance, 0, 0, 1),
        octave: boundedNumber(state.lead1Octave, 0, -4, 4),
        postLPF: boundedNumber(state.lead1PostLPF, 18000, 20, 20000),
      },
    },
    {
      id: 'lead2',
      engine: 'lead-fm',
      enabled: booleanValue(state.lead2Enabled, false),
      level: boundedNumber(state.lead2Level, 0, 0, 1),
      morph: boundedNumber(state.lead2Morph, 0, 0, 1),
      presetA: stringValue(state.lead2PresetC, 'soft_rhodes'),
      presetB: stringValue(state.lead2PresetD, 'gamelan'),
      params: {
        distance: boundedNumber(state.lead2Distance, 0, 0, 1),
        postLPF: boundedNumber(state.lead2PostLPF, 18000, 20, 20000),
      },
    },
    {
      id: 'granular',
      engine: 'granular',
      enabled: booleanValue(state.granularEnabled, true),
      level: boundedNumber(state.granularLevel, 0, 0, 1),
      params: {
        density: boundedNumber(state.density, 20, 0, 120),
        feedback: boundedNumber(state.feedback, 0, 0, 1),
        maxGrains: boundedNumber(state.maxGrains, 64, 0, 128),
        pitchSpread: boundedNumber(state.pitchSpread, 0, 0, 24),
        spray: boundedNumber(state.spray, 0, 0, 1000),
        stereoSpread: boundedNumber(state.stereoSpread, 0, 0, 1),
      },
    },
    {
      id: 'drums',
      engine: 'drum',
      enabled: booleanValue(state.drumEuclidMasterEnabled, false),
      level: boundedNumber(state.drumLevel, 0.8, 0, 1),
      params: {
        delayEnabled: booleanValue(state.drumDelayEnabled, false),
        euclidTempo: boundedNumber(state.drumEuclidTempo, 1, 0.25, 4),
      },
    },
    {
      id: 'earth',
      engine: 'soundscapes',
      enabled:
        booleanValue(state.waterEnabled, false) ||
        booleanValue(state.insectsEnabled, false) ||
        booleanValue(state.insects2Enabled, false) ||
        booleanValue(state.oceanSampleEnabled, false) ||
        booleanValue(state.birdsEnabled, false) ||
        booleanValue(state.birds2Enabled, false) ||
        booleanValue(state.frogsEnabled, false) ||
        booleanValue(state.natureEnabled, false),
      level: boundedNumber(state.earthLevel, 1, 0, 1),
      params: {
        birdsLevel: boundedNumber(state.birdsLevel, 0, 0, 1),
        birds2Level: boundedNumber(state.birds2Level, 0, 0, 1),
        frogsLevel: boundedNumber(state.frogsLevel, 0, 0, 1),
        natureLevel: boundedNumber(state.natureLevel, 0, 0, 1),
        oceanSampleLevel: boundedNumber(state.oceanSampleLevel, 0, 0, 1),
        waterLevel: boundedNumber(state.waterLevel, 0, 0, 1),
      },
    },
  ];
}

function createFx(state: StateRecord): KesshoFxSnapshot[] {
  return [
    {
      id: 'reverb',
      engine: 'reverb',
      enabled: booleanValue(state.reverbEnabled, true),
      mix: boundedNumber(state.reverbLevel, 0, 0, 1),
      params: {
        decay: boundedNumber(state.reverbDecay, 0.5, 0, 1),
        quality: stringValue(state.reverbQuality, 'balanced'),
        shimmer: boundedNumber(state.reverbShimmer, 0, 0, 1),
        type: stringValue(state.reverbType, 'plate'),
        width: boundedNumber(state.width, 1, 0, 1),
      },
    },
    {
      id: 'delayA',
      engine: 'delay',
      enabled: boundedNumber(state.delayAMix, 0, 0, 1) > 0,
      mix: boundedNumber(state.delayAMix, 0, 0, 1),
      params: {
        feedback: boundedNumber(state.delayAFeedback, 0, 0, 1),
        filter: boundedNumber(state.delayAFilter, 0, 0, 20000),
        timeMs: boundedNumber(state.delayATime, 250, 1, 5000),
      },
    },
    {
      id: 'delayB',
      engine: 'delay',
      enabled: boundedNumber(state.delayBMix, 0, 0, 1) > 0,
      mix: boundedNumber(state.delayBMix, 0, 0, 1),
      params: {
        feedback: boundedNumber(state.delayBFeedback, 0, 0, 1),
        spread: boundedNumber(state.delayBSpread, 0, 0, 1),
        warpIntensity: boundedNumber(state.delayBWarpIntensity, 0, 0, 1),
      },
    },
    {
      id: 'dynamics',
      engine: 'dynamics',
      enabled: booleanValue(state.dynamicsEnabled, false),
      mix: 1,
      params: {
        saturationDrive: boundedNumber(state.dynamicsSaturationDrive, 0, 0, 1),
        sidechainAmount: boundedNumber(state.sidechainAmount, 0, 0, 1),
      },
    },
    {
      id: 'spectralFreeze',
      engine: 'spectral-freeze',
      enabled: booleanValue(state.spectralFreezeEnabled, false),
      mix: boundedNumber(state.spectralFreezeMix, 0, 0, 1),
      params: {
        active: booleanValue(state.spectralFreezeActive, false),
        mode: typeof state.spectralFreezeMode === 'string' ? state.spectralFreezeMode : 'stretch',
        captureSerial: boundedNumber(state.spectralFreezeCaptureSerial, 0, 0, 0xffffffff),
        stretchSpeed: boundedNumber(state.spectralFreezeStretchSpeed, 0.5, 0, 1),
        direction: typeof state.spectralFreezeDirection === 'string' ? state.spectralFreezeDirection : 'pingpong',
        position: boundedNumber(state.spectralFreezePosition, 0, 0, 1),
        refresh: boundedNumber(state.spectralFreezeRefresh, 0.15, 0, 1),
        inputSensitivity: boundedNumber(state.spectralFreezeInputSensitivity, 0.5, 0, 1),
        diffusion: boundedNumber(state.spectralFreezeDiffusion, 0.55, 0, 1),
        tone: boundedNumber(state.spectralFreezeTone, -0.15, -1, 1),
        width: boundedNumber(state.spectralFreezeWidth, 0.85, 0, 1),
        sustain: boundedNumber(state.spectralFreezeSustain, 1, 0, 1),
      },
    },
  ];
}

export function createKesshoEngineSnapshot(
  sliderState: Partial<SliderState>,
  options: SnapshotOptions = {},
): KesshoEngineSnapshot {
  const state = sliderState as StateRecord;
  const metadata: KesshoSnapshotMetadata = {};

  if (options.presetId) metadata.presetId = options.presetId;
  if (options.presetName) metadata.presetName = options.presetName;
  if (typeof options.seed === 'number' && Number.isFinite(options.seed)) metadata.seed = options.seed;

  return {
    version: KESSHO_CORE_SNAPSHOT_VERSION,
    engineSchema: KESSHO_CORE_SCHEMA,
    metadata,
    transport: createTransportSnapshot(state),
    routing: createRoutingSnapshot(state),
    voices: createVoices(state),
    fx: createFx(state),
  };
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }

  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableSort((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

export function stableStringifyKesshoSnapshot(snapshot: KesshoEngineSnapshot): string {
  return JSON.stringify(stableSort(snapshot));
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function visitValues(value: unknown, path: string, errors: string[]): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    errors.push(`${path} must be finite`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitValues(item, `${path}[${index}]`, errors));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visitValues(child, path ? `${path}.${key}` : key, errors);
    }
  }
}

export function validateKesshoEngineSnapshot(snapshot: Partial<KesshoEngineSnapshot>): string[] {
  const errors: string[] = [];
  if (snapshot.version !== KESSHO_CORE_SNAPSHOT_VERSION) errors.push('version must be 1');
  if (snapshot.engineSchema !== KESSHO_CORE_SCHEMA) errors.push(`engineSchema must be ${KESSHO_CORE_SCHEMA}`);
  if (!snapshot.transport) errors.push('transport is required');
  if (!snapshot.routing) errors.push('routing is required');
  if (!Array.isArray(snapshot.voices)) errors.push('voices must be an array');
  if (!Array.isArray(snapshot.fx)) errors.push('fx must be an array');
  visitValues(snapshot, '', errors);
  return errors;
}

export function toKesshoCoreSnapshotScalarsV1(
  snapshot: KesshoEngineSnapshot,
): KesshoCoreSnapshotScalarsV1 {
  return {
    version: KESSHO_CORE_SNAPSHOT_VERSION,
    schemaHash: KESSHO_CORE_SCHEMA_HASH,
    bpm: snapshot.transport.bpm,
    masterGain: snapshot.routing.masterGain,
    renderMode: 0,
    smokeFrequencyHz: 0,
    smokeAmplitude: 0,
    flags: snapshot.routing.reverbEnabled ? 1 : 0,
    beatsPerBar: boundedInteger(snapshot.transport.beatsPerBar, 4, 1, 64),
    barsPerPhrase: boundedInteger(snapshot.transport.barsPerPhrase, 4, 1, 256),
    seed: boundedInteger(snapshot.metadata.seed, 1, 1, 16777215),
    reserved0: 0,
  };
}

export function toKesshoCorePresetPreviewScalarsV1(
  snapshot: KesshoEngineSnapshot,
): KesshoCoreSnapshotScalarsV1 {
  const scalars = toKesshoCoreSnapshotScalarsV1(snapshot);
  const snapshotHash = stableHash(stableStringifyKesshoSnapshot(snapshot));
  const voiceLevel = snapshot.voices.reduce((sum, voice) => (
    voice.enabled ? sum + clamp01(voice.level) : sum
  ), 0);
  const fxLevel = snapshot.fx.reduce((sum, fx) => (
    fx.enabled ? sum + clamp01(fx.mix) * 0.25 : sum
  ), 0);
  const audibleLevel = clamp01((voiceLevel + fxLevel) / 3);
  const scaleSemitones = [0, 2, 3, 5, 7, 10, 12, 14, 15, 17];
  const semitone = scaleSemitones[snapshotHash % scaleSemitones.length] ?? 0;
  const octave = ((snapshotHash >>> 8) % 3) - 1;
  const transportAnchor = boundedNumber(snapshot.transport.bpm, 120, 40, 300) * 1.5;
  const presetTone = 220 * Math.pow(2, (semitone + octave * 12) / 12);
  const derivedSeed = (snapshotHash % 16777215) || 1;

  return {
    ...scalars,
    renderMode: audibleLevel > 0.0001 ? 1 : 0,
    smokeFrequencyHz: boundedNumber((transportAnchor + presetTone) * 0.5, 220, 80, 880),
    smokeAmplitude: audibleLevel > 0.0001 ? boundedNumber(0.04 + audibleLevel * 0.16, 0.08, 0.02, 0.22) : 0,
    seed: boundedInteger(scalars.seed === 1 ? derivedSeed : scalars.seed, 1, 1, 16777215),
  };
}
