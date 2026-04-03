/**
 * Audio Engine
 * 
 * Main audio graph management with:
 * - Poly synth pad (6 voices)
 * - Granular effect (AudioWorklet)
 * - Algorithmic reverb (AudioWorklet)
 * - Rhodes/Bell lead synth with delay
 * - Ikeda-style drum synth
 * - Ocean sample player
 * - Master limiter
 * - Deterministic scheduling
 */

import {
  HarmonyState,
  createHarmonyState,
  updateHarmonyState,
  getCurrentPhraseIndex,
  getTimeUntilNextPhrase,
  CircleOfFifthsConfig,
  HarmonyParams,
  getEffectiveTension,
} from './harmony';
import { getScaleNotesInRange, midiToFreq } from './scales';
import { createRng, generateRandomSequence, getUtcBucket, computeSeed, rngFloat } from './rng';
import { DrumSynth, DrumVoiceType } from './drumSynth';
import type { DrumStepOverrides, LaneDirection, TrigCondition, ClockDivision, PitchMode, ScaleName } from './drumSeqTypes';
import { SCALES } from './drumSeqTypes';
import { seqLaneIndex, seqEuclidean } from './drumSequencer';
import { generateDiceValues, generateDicePitchOffsets, blendDiceValues, clamp as clampVal } from './seqEvolveCore';
import {
  evolveSynthLane,
  resetSynthLaneToHome,
  captureSynthHomeSnapshot,
  defaultSynthEvolveConfig,
  defaultSynthEvolveState,
} from './synthSeqEvolve';
import type { SynthEvolveConfig, SynthEvolveState, SynthLaneOverrides } from './synthSeqEvolve';
import { computeGranularMacroModel } from './granularMacroModel';
import { SharedDelayBusA, SharedDelayBusB, delayNoteToSeconds } from './delayBuses';

type PerfMetrics = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
};

type Quad<T> = [T, T, T, T];
type Hex<T> = [T, T, T, T, T, T];
type FxOwnershipBus = 'delayA' | 'delayB' | 'granular' | 'reverb';
type FxOwnershipSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'drum';
type FxOwnershipOrigin = 'padChord' | 'padEuclid' | 'leadNote' | 'drumHit';

type FxOwnershipState = {
  owner: FxOwnershipSource | null;
  strength: number;
  expiresAtMs: number;
  lastOrigin: FxOwnershipOrigin | null;
};

export type FxOwnershipDebugState = Record<
  FxOwnershipBus,
  {
    owner: FxOwnershipSource | null;
    strength: number;
    lastOrigin: FxOwnershipOrigin | null;
    active: boolean;
  }
>;

const SYNTH_LANE_INDICES = [0, 1, 2, 3] as const;

/**
 * Pick a note from availableNotes, weighted toward chord tones.
 * Chord tones get ~70% probability collectively; passing tones get ~30%.
 * Falls back to uniform if chord is empty or no overlap.
 */
function pickChordWeightedNote(
  rng: () => number,
  availableNotes: number[],
  chordMidiNotes: number[] | undefined,
  chordBias = 0.7,
): number {
  if (!chordMidiNotes || chordMidiNotes.length === 0 || availableNotes.length <= 1) {
    return availableNotes[Math.floor(rng() * availableNotes.length)]!;
  }
  // Build pitch-class set of chord tones (mod 12)
  const chordPCs = new Set(chordMidiNotes.map(n => n % 12));
  const chordTones: number[] = [];
  const passingTones: number[] = [];
  for (const n of availableNotes) {
    if (chordPCs.has(n % 12)) chordTones.push(n);
    else passingTones.push(n);
  }
  if (chordTones.length === 0) return availableNotes[Math.floor(rng() * availableNotes.length)]!;
  if (passingTones.length === 0) return chordTones[Math.floor(rng() * chordTones.length)]!;
  if (rng() < chordBias) return chordTones[Math.floor(rng() * chordTones.length)]!;
  return passingTones[Math.floor(rng() * passingTones.length)]!;
}
import { getIndexedDelayDivisionValue, type IndexedDelayDivisionKey, type SliderState } from '../ui/state';
import { getPadPreset, morphPadPresets, PAD_PRESET_PARAM_KEYS } from './padPresets';
import {
  type Lead4opFMPreset,
  type Lead4opFMMorphedParams,
  loadLead4opFMPreset,
  morphPresets,
  playLead4opFMNote,
  DEFAULT_SOFT_RHODES,
  DEFAULT_GAMELAN,
} from './lead4opfm';

type GranularVoiceMode = SliderState['granularV1Mode'];
type GranularGrainShape = NonNullable<SliderState['granularShape']>;

type GranularWorkletGlobalParams = {
  enabled: boolean;
  freeze: boolean;
  freezeWithFeedback: boolean;
  dryWet: number;
  feedback: number;
  feedbackLPF: number;
  bufferSeconds: number;
  grainShape: GranularGrainShape;
};

type GranularWorkletSpaceParams = {
  busDiffusion: number;
  timingRandomness: number;
};

type GranularWorkletVoiceParams = {
  voiceEnabled: boolean[];
  voiceMode: GranularVoiceMode[];
  voiceSlice: number[];
  voiceSpeed: number[];
  voiceScanRate: number[];
  voiceReverse: boolean[];
  voicePitch: number[];
  voiceAttack: number[];
  voiceDecay: number[];
  voiceBlur: number[];
  voiceGrainOct: number[];
  voiceSpray: number[];
  voiceDensity: number[];
  voiceGrainSize: number[];
  voicePan: number[];
  voiceGain: number[];
  voicePosLFORate: number[];
  voicePosLFODepth: number[];
  voicePanLFORate: number[];
  voiceStereoSpread: number[];
  voiceReverseLFORate: number[];
  voiceWriteFollow: number[];
  voiceRecordLFORate: number[];
  tempoGated: boolean[];
};

type GranularWorkletHarmonyParams = {
  scaleIntervals: number[];
  chordPitches: number[];
  chordBias: number;
};

type GranularWorkletLegacyParams = {
  legacyJitter: number;
  legacyProbability: number;
  legacyPitchMode: 'random' | 'harmonic';
  legacyPitchSpread: number;
  legacyMaxGrains: number;
  legacyFeedback: number;
};

type GranularWorkletUpdate = {
  global: GranularWorkletGlobalParams;
  space: GranularWorkletSpaceParams;
  voices: GranularWorkletVoiceParams;
  harmony: GranularWorkletHarmonyParams;
  legacy: GranularWorkletLegacyParams;
};

// Maps pad-preset param keys (pad1 naming) → pad2 state keys for morph override
const PAD1_TO_PAD2_ENGINE: Record<string, string> = {
  padOscAWave: 'pad2OscAWave', padOscAOctave: 'pad2OscAOctave', padOscADetune: 'pad2OscADetune', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBOctave: 'pad2OscBOctave', padOscBDetune: 'pad2OscBDetune', padOscBLevel: 'pad2OscBLevel',
  padSubEnabled: 'pad2SubEnabled', padSubOctave: 'pad2SubOctave', padSubWave: 'pad2SubWave', padSubLevel: 'pad2SubLevel',
  padNoiseType: 'pad2NoiseType', padNoiseLevel: 'pad2NoiseLevel',
  hardness: 'pad2Hardness', warmth: 'pad2Warmth', presence: 'pad2Presence',
  filterType: 'pad2FilterType', filterCutoffMin: 'pad2FilterCutoffMin', filterCutoffMax: 'pad2FilterCutoffMax',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthRelease: 'pad2Release',
  padLfo1Rate: 'pad2Lfo1Rate', padLfo1Depth: 'pad2Lfo1Depth', padLfo1Wave: 'pad2Lfo1Wave', padLfo1Dest: 'pad2Lfo1Dest',
  padLfo2Rate: 'pad2Lfo2Rate', padLfo2Depth: 'pad2Lfo2Depth', padLfo2Wave: 'pad2Lfo2Wave', padLfo2Dest: 'pad2Lfo2Dest',
  padModEnvEnabled: 'pad2ModEnvEnabled', padModEnvAttack: 'pad2ModEnvAttack', padModEnvDecay: 'pad2ModEnvDecay',
  padModEnvSustain: 'pad2ModEnvSustain', padModEnvRelease: 'pad2ModEnvRelease',
  padModEnvDepth: 'pad2ModEnvDepth', padModEnvDest: 'pad2ModEnvDest',
};

const PAD1_MORPH_HOLD_KEYS = new Set<string>(PAD_PRESET_PARAM_KEYS);
const PAD2_MORPH_HOLD_KEYS = new Set<string>(Object.values(PAD1_TO_PAD2_ENGINE));
const PAD1_TRIGGER_HOLD_KEYS = new Set<string>([
  ...PAD1_MORPH_HOLD_KEYS,
  'padMorph',
  'synthLevel',
  'synthOctave',
]);
const PAD2_TRIGGER_HOLD_KEYS = new Set<string>([
  ...PAD2_MORPH_HOLD_KEYS,
  'pad2Morph',
  'pad2Level',
  'pad2Octave',
]);

// Worklet URLs from public folder - these are plain JS files that work in production
// Use absolute URLs for Safari compatibility
const getWorkletUrl = (filename: string): string => {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/worklets/${filename}`;
};
// Reverb uses WASM path — kessho_reverb.wasm loaded at init
const reverbWasmWorkletUrl = getWorkletUrl('reverb-wasm.worklet.js');
// Waves sample uses the shared Earth filter path — no separate waves synth worklet
// Granular FX uses WASM-only path
const granularFxWasmWorkletUrl = getWorkletUrl('granular-fx-wasm.worklet.js');
const soundscapesWorkletUrl = getWorkletUrl('soundscapes-wasm.worklet.js');
const spectralFreezeWorkletUrl = getWorkletUrl('spectral-freeze-wasm.worklet.js');
const padSynthWasmWorkletUrl = getWorkletUrl('pad-synth-wasm.worklet.js');
const leadFmWasmWorkletUrl = getWorkletUrl('lead-fm-wasm.worklet.js');
const drumSynthWasmWorkletUrl = getWorkletUrl('drum-synth-wasm.worklet.js');
const GRANULAR_WORKLET_DISPATCH_INTERVAL_MS = 16;

/**
 * Single source of truth for per-engine output scaling.
 * Values < 1 attenuate; values > 1 boost.  Applied at each engine's
 * final output gain node — do NOT duplicate in QUANTIZATION or worklets.
 */
const ENGINE_TRIMS = {
  pad:      0.5,   // pad synth 1 & 2 — dense oscillator stack needs attenuation
  lead:     0.5,   // lead FM — attenuate before the master limiter so dry level behaves more linearly
  drum:     1.0,   // drum synth — unity
  granular: 2.0,   // granular FX — boost to compensate for FX processing loss
  reverb:   2.0,   // reverb return — wet signal needs headroom above unity
  earth:    1.0,   // earth bus (water + insects + waves) — unity
};

const FX_OWNERSHIP_WINDOW_MS = 140;
const FX_OWNERSHIP_STEAL_MARGIN = 0.05;
const FX_OWNERSHIP_STEAL_RATIO = 1.15;
const FX_OWNERSHIP_RECENT_ONSET_RATIO = 0.65;

const REVERB_OWNERSHIP_KEYS = new Set<string>([
  'reverbLevel',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'reverbShimmer',
  'reverbShimmerPitch',
  'reverbSlowModRate',
  'reverbSlowModDepth',
  'reverbReverse',
  'reverbReverseLength',
  'reverbChorusRate',
  'reverbChorusDepth',
  'reverbDampLow',
  'reverbDampHigh',
  'reverbCrossoverFreq',
  'reverbInputTone',
  'reverbShimmerFeedback',
  'reverbWarp',
  'reverbCrossFeed',
  'reverbEarlyReflections',
  'reverbAirAbsorption',
  'reverbTransientSmooth',
  'reverbErLpFreq',
]);

const GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS = [
  'granularPad',
  'granularLead',
  'granularDrum',
  'granularWaves',
  'granularWater',
  'granularInsects',
  'granularDelay',
] as const;

// Voice structure for poly synth
interface Voice {
  osc1: OscillatorNode;       // OscA
  osc2: OscillatorNode;       // OscA detuned
  osc3: OscillatorNode;       // OscB
  osc4: OscillatorNode;       // Sub (or OscB detuned when sub disabled)
  osc1Gain: GainNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  osc4Gain: GainNode;
  noise?: AudioBufferSourceNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
  filterB: BiquadFilterNode;         // Second filter in series
  warmthFilter: BiquadFilterNode;    // Low shelf for warmth
  presenceFilter: BiquadFilterNode;  // Peaking EQ for presence
  gain: GainNode;
  saturation: WaveShaperNode;
  envelope: GainNode;
  mixerGain: GainNode;              // Per-voice level control (pad 1 vs pad 2)
  modEnvGain: GainNode;              // Mod envelope gain for amplitude/filter/pitch modulation
  active: boolean;
  targetFreq: number;
}

export interface EngineState {
  isRunning: boolean;
  harmonyState: HarmonyState | null;
  currentSeed: number;
  currentBucket: string;
  currentFilterFreq: number;
  currentLfoValue: number;     // -1 to +1 (after depth scaling)
  currentLfo2Value: number;    // LFO 2 value for UI
  cofCurrentStep: number;
  fxOwners: FxOwnershipDebugState;
}

import type { DrumEuclidEvolveConfig } from './drumSynth';
import { defaultEvolveConfig as defaultDrumEuclidEvolveConfig } from './drumSynth';

/** Shared clock-division-to-seconds helper (used by synth + granular schedulers). */
function clockDivToSeconds(clockDiv: ClockDivision, beatDuration: number): number {
  switch (clockDiv) {
    case '1/4': return beatDuration;
    case '1/8': return beatDuration / 2;
    case '1/16': return beatDuration / 4;
    case '1/32': return beatDuration / 8;
    case '1/64': return beatDuration / 16;
    case '1/8T': return beatDuration / 3;
    default: return beatDuration / 2;
  }
}

function getSharedSequencerBpm(state?: Partial<Pick<SliderState, 'sequencerMasterBPM' | 'synthEuclidBaseBPM' | 'drumEuclidBaseBPM'>> | null): number {
  return state?.sequencerMasterBPM
    ?? state?.synthEuclidBaseBPM
    ?? state?.drumEuclidBaseBPM
    ?? 120;
}

function alignSequencerTime(now: number, stepDuration: number): number {
  if (!Number.isFinite(stepDuration) || stepDuration <= 0) return now;
  return Math.ceil(now / stepDuration) * stepDuration;
}

function makeMasterSaturationCurve(mode: 'clean' | 'tape' | 'tube', samples = 8192): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const half = (samples - 1) / 2;
  for (let i = 0; i < samples; i++) {
    const x = (i - half) / half;
    switch (mode) {
      case 'tape':
        curve[i] = Math.tanh(x * 1.5) * 0.9 + x * 0.1;
        break;
      case 'tube':
        curve[i] = x / (1 + Math.abs(x));
        break;
      case 'clean':
      default:
        curve[i] = x;
        break;
    }
  }
  return curve;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private satPreGain: GainNode | null = null;
  private satWaveshaper: WaveShaperNode | null = null;
  private satPostTone: BiquadFilterNode | null = null;
  private satPostGain: GainNode | null = null;
  private lastMasterSatMode: 'clean' | 'tape' | 'tube' | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private voices: Voice[] = [];
  private reverbNode: AudioWorkletNode | null = null;
  private reverbOutputGain: GainNode | null = null;

  // Spectral Freeze (STFT WASM)
  private spectralFreezeNode: AudioWorkletNode | null = null;
  private wasmSpectralFreezeBinary: ArrayBuffer | null = null;
  private reverbInputBus: GainNode | null = null;   // bus between all sources and reverb (gain always 1)
  private reverbDirectSend: GainNode | null = null;  // crossfade-controlled direct path to reverb (pre-mode only)

  private synthBus: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private pad1ReverbSend: GainNode | null = null;
  private pad2ReverbSend: GainNode | null = null;
  private synthDirect: GainNode | null = null;
  private sharedDelayA: SharedDelayBusA | null = null;
  private sharedDelayB: SharedDelayBusB | null = null;
  private sharedDelayGranularLinksWired = false;

  // Lead synth (4op FM)
  private leadGain: GainNode | null = null;
  private leadDry: GainNode | null = null;
  private leadFilter: BiquadFilterNode | null = null;
  private lead1ReverbSend: GainNode | null = null;
  private lead2ReverbSend: GainNode | null = null;
  private pad1DelayASend: GainNode | null = null;
  private pad1DelayBSend: GainNode | null = null;
  private pad2DelayASend: GainNode | null = null;
  private pad2DelayBSend: GainNode | null = null;
  private lead1DelayASend: GainNode | null = null;
  private lead1DelayBSend: GainNode | null = null;
  private lead2DelayASend: GainNode | null = null;
  private lead2DelayBSend: GainNode | null = null;
  private leadMelodyTimer: number | null = null;  // Random lead mode (phrase-based)
  private leadNoteTimeouts: number[] = [];  // Track scheduled random note timeouts
  private synthEuclidCurrentStep: Quad<number> = [0, 0, 0, 0];  // Step position per lane
  private onSynthStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private synthEuclidHitCounts: Quad<number> = [0, 0, 0, 0];  // Hit counts per lane

  // Continuous lead Euclidean scheduler (look-ahead, like drum sequencer)
  private synthEuclidScheduleTimer: number | null = null;
  private synthEuclidNextStepTime: Quad<number> = [0, 0, 0, 0]; // AudioContext time per lane
  private synthEuclidStepIndex: Quad<number> = [0, 0, 0, 0]; // Current step index per lane
  private synthEuclidClockDivs: Quad<ClockDivision> = ['1/8', '1/16', '1/8T', '1/4']; // Per-lane clock division
  private synthEuclidSwings: Quad<number> = [0, 0, 0, 0]; // Per-lane swing amount (0-1)
  private synthEuclidStarting = false;

  // Synth evolve state
  private synthEvolveConfigs: Quad<SynthEvolveConfig> = [
    defaultSynthEvolveConfig(), defaultSynthEvolveConfig(),
    defaultSynthEvolveConfig(), defaultSynthEvolveConfig(),
  ];
  private synthEvolveStates: Quad<SynthEvolveState> = [
    defaultSynthEvolveState(), defaultSynthEvolveState(),
    defaultSynthEvolveState(), defaultSynthEvolveState(),
  ];
  private synthEuclidTotalStepCounts: Quad<number> = [0, 0, 0, 0];
  private onSynthEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onSynthEvolveOverridesChanged: ((laneIndex: number, overrides: Partial<SynthLaneOverrides>) => void) | null = null;
  /** Per-lane pitch settings for MIDI↔offset conversion at evolve boundary */
  private synthPitchSettings: Quad<{ mode: PitchMode; root: number; scale: ScaleName }> = [
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ];
  /** Per-lane noteRange overrides from evolve (null = use sliderState) */
  private synthNoteRangeOverrides: Quad<{ min: number; max: number } | null> = [null, null, null, null];
  /** Callback fired when evolve mutates noteRange bounds → UI updates sliders */
  private onSynthNoteRangeEvolved: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null = null;
  /** Per-lane sub-lane enabled state (from UI). Keys are sub-lane names (e.g. 'expression', 'ratchet'). */
  private synthSubLaneEnabled: Quad<Record<string, boolean>> = [{}, {}, {}, {}];

  // Lead 4op FM preset slots
  private lead1PresetA: Lead4opFMPreset = DEFAULT_SOFT_RHODES;
  private lead1PresetB: Lead4opFMPreset = DEFAULT_GAMELAN;
  private lead2PresetC: Lead4opFMPreset = DEFAULT_SOFT_RHODES;
  private lead2PresetD: Lead4opFMPreset = DEFAULT_GAMELAN;
  private lead1PresetAId = 'soft_rhodes';
  private lead1PresetBId = 'gamelan';
  private lead2PresetCId = 'soft_rhodes';
  private lead2PresetDId = 'gamelan';

  // Ikeda-style drum synth
  private drumSynth: DrumSynth | null = null;
  private drumDelayASend: GainNode | null = null;
  private drumDelayBSend: GainNode | null = null;

  // Reverb (WASM)
  private wasmReverbBinary: ArrayBuffer | null = null;

  // Pad Synth (WASM — replaces Web Audio oscillator voices)
  private wasmPadBinary: ArrayBuffer | null = null;
  private padWasmNode: AudioWorkletNode | null = null;
  private padWasmReady = false;
  private padWasmModuleContext: AudioContext | null = null;

  // Lead FM Synth (WASM — replaces per-note playLead4opFMNote)
  private wasmLeadFmBinary: ArrayBuffer | null = null;
  private leadFmWasmNode: AudioWorkletNode | null = null;
  private leadFmWasmReady = false;

  // Drum Synth (WASM — replaces per-trigger Web Audio nodes)
  private wasmDrumBinary: ArrayBuffer | null = null;
  private drumWasmNode: AudioWorkletNode | null = null;
  private drumWasmReady = false;

  // Granular FX (unified granular engine — WASM only)
  private wasmGranularBinary: ArrayBuffer | null = null;
  private granularFxNode: AudioWorkletNode | null = null;
  private granularFxInputGain: GainNode | null = null;
  private granularFxReverbSend: GainNode | null = null;
  private granularFxReverbLPF: BiquadFilterNode | null = null;
  private granularFxReverbCompressor: DynamicsCompressorNode | null = null;
  private granularFxOutputLPF: BiquadFilterNode | null = null;
  private granularFxDirect: GainNode | null = null;
  private granularDelayASend: GainNode | null = null;
  private granularPad1Send: GainNode | null = null;     // pad 1 bus → granular
  private granularPad2Send: GainNode | null = null;     // pad 2 bus → granular
  private granularLead1Send: GainNode | null = null;    // lead 1 bus → granular
  private granularLead2Send: GainNode | null = null;    // lead 2 bus → granular
  private granularDrumSend: GainNode | null = null;     // drum bus → granular
  private granularWavesSend: GainNode | null = null;    // waves → granular
  // Note: granularWaterSend and granularInsectsSend are declared in the Earth section above
  private pad1Bus: GainNode | null = null;            // sum of pad 1 voices (post-fader)
  private pad2Bus: GainNode | null = null;            // sum of pad 2 voices (post-fader)
  private pad1PreFaderBus: GainNode | null = null;    // sum of pad 1 voices (pre-fader, for granular)
  private pad2PreFaderBus: GainNode | null = null;    // sum of pad 2 voices (pre-fader, for granular)
  private lead1Bus: GainNode | null = null;           // lead 1 output pre-mix
  private lead2Bus: GainNode | null = null;           // lead 2 output pre-mix
  private lead1LevelGain: GainNode | null = null;     // lead 1 dry-path level (FX sends remain independent)
  private lead2LevelGain: GainNode | null = null;     // lead 2 dry-path level (FX sends remain independent)
  private leadVoiceLevel: GainNode | null = null;     // final dry-path trim stage for lead output
  private leadWasmLevelGain: GainNode | null = null;  // WASM lead dry-path level (FX sends remain independent)
  private leadWasmLead2LevelGain: GainNode | null = null;  // WASM lead 2 dry-path level
  private lastPad2VoiceAssign = 0;                    // track for re-routing
  private granularWriteHeadPosition = 0;     // 0-1 for UI
  private granularVoicePositions = [0, 0, 0, 0]; // 0-1 per voice for UI
  private granularActiveGrainCount = 0;
  private granularBufferWaveform: Float32Array | null = null;  // downsampled buffer peaks for viz
  private granularUiActive = false;
  private pendingGranularWorkletUpdate: GranularWorkletUpdate | null = null;
  private granularWorkletDispatchTimer: number | null = null;
  private lastGranularWorkletDispatchMs = 0;

  // Granular multi-tap delay (Microcosm-style)
  private granularDelayInputNode: GainNode | null = null;
  private granularDelayTapNodes: DelayNode[] = [];
  private granularDelayTapGains: GainNode[] = [];
  private granularDelayTapPanners: StereoPannerNode[] = [];
  private granularDelayOutputGain: GainNode | null = null;
  private granularDelayDirectGain: GainNode | null = null;
  private granularDelayReverbSendGain: GainNode | null = null;
  private granularDelayFeedbackGain: GainNode | null = null;
  private granularDelayToneFilter: BiquadFilterNode | null = null;
  private granularDelaySendGain: GainNode | null = null;
  private granularDelayVibratoOscs: OscillatorNode[] = [];
  private granularDelayVibratoDepths: GainNode[] = [];
  private sharedGranularDelayBSend: GainNode | null = null;

  private granularTempoSyncTimer: number | null = null;
  private granularTempoSyncNextStepTime: Quad<number> = [0, 0, 0, 0];

  // Waves sample path
  private oceanFilter: BiquadFilterNode | null = null;  // Shared waves filter
  private oceanLevelGain: GainNode | null = null;       // Waves dry level → earthBus

  // Ocean sample player (real beach recording)
  private oceanSampleBuffer: AudioBuffer | null = null;
  private oceanSampleSource: AudioBufferSourceNode | null = null;
  private oceanSampleGain: GainNode | null = null;
  private oceanSampleLoaded = false;

  // Soundscapes WASM worklet (water + insects + fire engines)
  private soundscapesNode: AudioWorkletNode | null = null;
  private waterPreFaderBus: GainNode | null = null;     // Pre-fader bus for reverb/granular taps
  private waterLevelGain: GainNode | null = null;       // Water dry level → earthBus
  private waterReverbSend: GainNode | null = null;
  private waterDelayASend: GainNode | null = null;
  private waterDelayBSend: GainNode | null = null;
  private oceanReverbSendNode: GainNode | null = null;    // Waves reverb send (post-filter)
  private oceanDelayASend: GainNode | null = null;
  private oceanDelayBSend: GainNode | null = null;
  private insectsReverbSendNode: GainNode | null = null;  // Insects reverb send
  private insectsPreFaderBus: GainNode | null = null;     // Pre-fader bus for reverb/granular taps
  private insectsLevelGain: GainNode | null = null;       // Insects on/off gate → earthBus (level controlled by WASM-side gain)
  private insectsDelayASend: GainNode | null = null;
  private insectsDelayBSend: GainNode | null = null;
  private firePreFaderBus: GainNode | null = null;       // Pre-fader bus for fire reverb tap
  private fireLevelGain: GainNode | null = null;         // Fire dry level → earthBus
  private fireReverbSendNode: GainNode | null = null;    // Fire reverb send
  private granularWaterSend: GainNode | null = null;      // Water → granular
  private granularInsectsSend: GainNode | null = null;    // Insects → granular

  // Earth master bus (waves + water + insects + fire → earthBus → earthLevelGain → masterGain)
  private earthBus: GainNode | null = null;
  private earthLevelGain: GainNode | null = null;
  private wasmSoundscapesBinary: ArrayBuffer | null = null;
  private soundscapesWasmReady = false;
  private _scWaterStarted = false;
  private _scInsects1Started = false;
  private _scInsects2Started = false;
  private _scFireStarted = false;
  private _scInsects1Engine = -1;
  private _scInsects2Engine = -1;
  private _scWaterPreset = -1;

  private harmonyState: HarmonyState | null = null;
  private cofConfig: CircleOfFifthsConfig = {
    enabled: false,
    driftRate: 2,
    direction: 'cw',
    range: 3,
    currentStep: 0,
    phraseCounter: 0,
  };
  private phraseTimer: number | null = null;
  private chordSubTickCount = 0;    // Sub-phrase tick counter for chord rate < phraseLength
  private effectiveRoot = 4;  // Current root note including CoF drift

  // Reverb harmony coupling — transient modulation amounts
  private reverbWashBoost = 0;       // 0..1 decays after chord change
  private reverbBloomBoost = 0;      // 0..1 decays on resolution
  private prevReverbTension = 0;     // track tension for bloom trigger
  private currentSeed = 0;
  private currentBucket = '';
  private sliderState: SliderState | null = null;
  private _sliderStateJsonCache = '';
  private _sliderStateJsonDirty = true;
  private lastHardness = -1;  // Track to avoid unnecessary saturation curve updates
  private _lastPadEnabled: boolean | undefined = undefined;  // Track effective pad activity transitions
  private voiceReleaseTimers = new Set<number>();  // Track triggerSynthVoice release timeouts
  private ratchetTimers = new Set<number>();  // Track ratchet retrigger timeouts
  private synthVoiceNoteGen: Hex<number> = [0, 0, 0, 0, 0, 0];  // Per-voice WASM noteOff generation counter
  private synthVoiceNoteOffTimers: Hex<number | null> = [null, null, null, null, null, null];

  // Temp drum synth management: debounce rapid previews and track cleanup timers
  private tempDrumSynthTimer: number | null = null;
  private synthPerfTimer: ReturnType<typeof setInterval> | null = null;
  private tempDrumSynth: DrumSynth | null = null;
  private tempDrumGain: GainNode | null = null;
  private tempDrumReverb: GainNode | null = null;
  private rng: (() => number) | null = null;
  private isRunning = false;
  private isStarting = false; // true while start() is loading worklets — prevents updateParams teardown
  private _applyParamsDirty = false;  // Dirty flag for RAF-batched applyParams
  private _applyParamsRaf: number | null = null;  // RAF handle for batched applyParams
  private seedLocked = false; // When true, don't recompute seed on param changes (for morphing)
  private isMobile = false; // Detected in createAudioGraph, used for CPU-saving defaults

  // Dirty-gate caches: skip worklet postMessage when params unchanged
  private _prevReverbParams: Record<string, unknown> | null = null;
  private _prevSfFreeze = false;
  private _prevSfSlushy = false;
  private _prevSfSpeed = 0.3;
  private _prevSfMix = 1.0;
  private _prevSfDecay = 0;
  private _prevSfPhaseJitter = 0;
  private _sfParamsInitialized = false;
  private _messageSignatures = new Map<string, string>();

  private currentFilterFreq = 1000;  // Current filter frequency for UI display
  private currentLfoValue = 0;       // Current LFO 1 output (-1..+1 after depth) for UI
  private currentLfo2Value = 0;      // Current LFO 2 output (-1..+1 after depth) for UI

  private onStateChange: ((state: EngineState) => void) | null = null;
  private onLeadExpressionTrigger: ((expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) | null = null;
  private onLeadMorphTrigger: ((morph: { lead1: number; lead2: number }) => void) | null = null;
  private onLeadDelayTrigger: ((delay: { time: number; feedback: number; mix: number }) => void) | null = null;
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  private onDrumMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;
  private onDrumParamSHTrigger: ((voice: DrumVoiceType, key: string, position: number) => void) | null = null;
  private onPadMorphTrigger: ((morphPosition: number) => void) | null = null;
  private onPad2MorphTrigger: ((morphPosition: number) => void) | null = null;
  private onDrumEuclidEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onDrumStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private leadMorphTimer: number | null = null;

  // CPU performance monitoring (per-worklet % reported ~1Hz)
  private perfMonitorEnabled = false;
  private perfData: Record<string, PerfMetrics> = {};
  private onPerfUpdate: ((data: Record<string, PerfMetrics>) => void) | null = null;
  // Lead morph random walk state (per-lead, momentum-based)
  private leadMorphWalkStates: {
    lead1: { position: number; velocity: number; initialized: boolean };
    lead2: { position: number; velocity: number; initialized: boolean };
  } = {
    lead1: { position: 0.5, velocity: 0, initialized: false },
    lead2: { position: 0.5, velocity: 0, initialized: false },
  };
  
  // Pending morph ranges to apply when drumSynth is created
  private pendingMorphRanges: Record<DrumVoiceType, { min: number; max: number } | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null, membrane: null
  };
  // Pending generic S&H param ranges to apply when drumSynth is created
  private pendingParamSHRanges = new Map<string, { min: number; max: number }>();


  private pendingDrumEuclidEvolveConfigs: DrumEuclidEvolveConfig[] = [
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
  ];

  // Pending step overrides from UI (full step data per lane)
  private pendingStepOverrides: DrumStepOverrides | null = null;

  // Lead Euclidean step overrides from UI (pitch, expression, trigger toggles, etc.)
  private synthStepOverrides: {
    pitch: (number[] | null)[];
    pitchDirection: (LaneDirection | null)[];
    triggerToggles: Map<number, boolean>[];
    expression: (number[] | null)[];
    expressionDirection: (LaneDirection | null)[];
    morph: (number[] | null)[];
    morphDirection: (LaneDirection | null)[];
    distance: (number[] | null)[];
    distanceDirection: (LaneDirection | null)[];
    probability: (number[] | null)[];
    ratchet: (number[] | null)[];
    trigCondition: (TrigCondition[] | null)[];
  } = {
    pitch: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    expression: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    morph: [null, null, null, null],
    morphDirection: [null, null, null, null],
    distance: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
  };

  // Lead Euclidean trig condition counters per lane per step
  private synthTrigConditionCounters: Quad<number[]> = [[], [], [], []];

  // Temporary per-trigger overrides for lead sub-lanes (set before playLeadNote, cleared after)
  private synthMorphOverride: number | null = null;  // 0-1 morph position override
  private synthRatchetFactor: number = 1;  // ADSR scaling for ratchet (1/ratchetCount)

  // LFO per-pad state objects (Pad 1 LFO 1/2, Pad 2 LFO 1/2)
  private lfo1State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private lfo2State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2Lfo1State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2Lfo2State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2LastHardness = -1;  // Track pad2 saturation separately

  // Unified dual-range storage: key → { min, max }
  // Populated by App when a slider is in walk or sampleHold mode.
  // When absent for a key, engine uses the single-value from sliderState.
  private dualRanges: Partial<Record<string, { min: number; max: number }>> = {};

  // S&H engine-side sampling: 10Hz re-sampling for non-drum dual-range params
  private shSampledValues: Record<string, number> = {};
  private padHeldOverrides: Partial<SliderState> = {};
  private shLastSampleTime = 0;
  private onGranularSHTrigger: ((positions: Record<string, number>) => void) | null = null;
  private fxBusOwners: Record<FxOwnershipBus, FxOwnershipState> = {
    delayA: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    delayB: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    granular: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    reverb: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
  };
  private readonly drumTriggerRouter = (voice: DrumVoiceType, velocity: number) => {
    this.reportFxOnset('drum', 'drumHit');
    this.onDrumTrigger?.(voice, velocity);
  };

  constructor() {
    // Empty constructor
  }

  /**
   * Lazy accessor for sliderState JSON. Recomputes only when dirty.
   * Used for deterministic harmony seeding at phrase boundaries.
   */
  private get sliderStateJson(): string {
    if (this._sliderStateJsonDirty && this.sliderState) {
      this._sliderStateJsonCache = JSON.stringify(this.sliderState);
      this._sliderStateJsonDirty = false;
    }
    return this._sliderStateJsonCache;
  }

  /** App calls this whenever dualSliderRanges change */
  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>) {
    this.dualRanges = ranges;
    for (const key of Object.keys(this.shSampledValues)) {
      if ((key.startsWith('lead') || key.startsWith('granularLead') || this.isFxOwnershipDrivenKey(key) || this.isPadTriggerDrivenKey(key)) && !ranges[key]) {
        delete this.shSampledValues[key];
      }
    }
    this.cleanupPadHeldOverrides(ranges);
  }

  private isPadTriggerDrivenKey(key: string): boolean {
    return PAD1_TRIGGER_HOLD_KEYS.has(key) || PAD2_TRIGGER_HOLD_KEYS.has(key);
  }

  private cleanupPadHeldOverrides(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    for (const key of Object.keys(this.padHeldOverrides)) {
      const keepPad1Morph = ranges.padMorph && PAD1_MORPH_HOLD_KEYS.has(key);
      const keepPad2Morph = ranges.pad2Morph && PAD2_MORPH_HOLD_KEYS.has(key);
      if (!ranges[key] && !keepPad1Morph && !keepPad2Morph) {
        delete this.padHeldOverrides[key as keyof SliderState];
      }
    }
  }

  private getEffectivePadState(state: SliderState): SliderState {
    return Object.keys(this.padHeldOverrides).length > 0
      ? ({ ...state, ...this.padHeldOverrides } as SliderState)
      : state;
  }

  private buildPadTriggerState(
    pad: 'pad1' | 'pad2',
    baseState: SliderState,
    morphOverride: number | null = null,
  ): SliderState | null {
    const effectiveBase = this.getEffectivePadState(baseState);
    const nextState = { ...effectiveBase } as SliderState;
    const nextStateRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;
    const heldOverrideRecord = this.padHeldOverrides as Record<string, SliderState[keyof SliderState] | undefined>;
    const positions: Record<string, number> = {};
    const sampledKeys = new Set<string>();
    let changed = false;

    const morphKey = pad === 'pad2' ? 'pad2Morph' : 'padMorph';
    let effectiveMorph = morphOverride;
    if (effectiveMorph === null) {
      const sampledMorph = this.sampleDualRangeKey(morphKey, positions);
      if (sampledMorph !== null) {
        effectiveMorph = sampledMorph;
      }
    }

    if (effectiveMorph !== null) {
      const presetA = getPadPreset((pad === 'pad2' ? effectiveBase.pad2PresetA : effectiveBase.padPresetA) as string);
      const presetB = getPadPreset((pad === 'pad2' ? effectiveBase.pad2PresetB : effectiveBase.padPresetB) as string);
      if (presetA && presetB) {
        const morphed = morphPadPresets(presetA, presetB, effectiveMorph);
        for (const key of PAD_PRESET_PARAM_KEYS) {
          if (!(key in morphed)) continue;
          const targetKey = (pad === 'pad2' ? PAD1_TO_PAD2_ENGINE[key] : key) as keyof SliderState;
          const value = morphed[key] as SliderState[keyof SliderState];
          nextStateRecord[targetKey as string] = value;
          heldOverrideRecord[targetKey as string] = value;
          sampledKeys.add(targetKey as string);
          changed = true;
        }
        if (pad === 'pad2') {
          this.onPad2MorphTrigger?.(effectiveMorph);
        } else {
          this.onPadMorphTrigger?.(effectiveMorph);
        }
      }
    }

    const directKeys = pad === 'pad2'
      ? Array.from(PAD2_TRIGGER_HOLD_KEYS)
      : Array.from(PAD1_TRIGGER_HOLD_KEYS);
    for (const key of directKeys) {
      if (key === morphKey || !this.dualRanges[key]) continue;
      const sampled = this.sampleDualRangeKey(key, positions);
      if (sampled === null) continue;
      nextStateRecord[key] = sampled as SliderState[keyof SliderState];
      heldOverrideRecord[key] = sampled as SliderState[keyof SliderState];
      sampledKeys.add(key);
      changed = true;
    }

    if (sampledKeys.size > 0) {
      for (const key of Object.keys(this.padHeldOverrides)) {
        if ((pad === 'pad2' ? PAD2_TRIGGER_HOLD_KEYS : PAD1_TRIGGER_HOLD_KEYS).has(key) && !sampledKeys.has(key)) {
          const keepMorph = pad === 'pad2'
            ? !!(this.dualRanges.pad2Morph && PAD2_MORPH_HOLD_KEYS.has(key))
            : !!(this.dualRanges.padMorph && PAD1_MORPH_HOLD_KEYS.has(key));
          if (!keepMorph && !this.dualRanges[key]) {
            delete this.padHeldOverrides[key as keyof SliderState];
          }
        }
      }
    }

    this.emitOwnedSamplePositions(positions);
    if (changed) {
      this.scheduleApplyParamsRefresh();
      return nextState;
    }
    return Object.keys(this.padHeldOverrides).length > 0 ? nextState : null;
  }

  private getFxOwnershipBusForKey(key: string): FxOwnershipBus | null {
    if (key === 'drumDelayNoteL' || key === 'drumDelayNoteR') {
      return 'delayA';
    }

    if (key.startsWith('delayA')) {
      if (
        key === 'delayATime' ||
        key === 'delayASpread' ||
        key === 'delayAPingPong' ||
        key === 'delayAFilterType' ||
        key === 'delayAEnabled' ||
        key === 'delayASend'
      ) {
        return null;
      }
      return 'delayA';
    }

    if (key.startsWith('granularDelay')) {
      if (key === 'granularDelayEnabled') {
        return null;
      }
      return 'delayB';
    }

    if (
      key === 'delayBGranularSend' ||
      key === 'delayBToASend' ||
      key === 'delayBWarpIntensity' ||
      key === 'delayBSpread'
    ) {
      return 'delayB';
    }

    if (REVERB_OWNERSHIP_KEYS.has(key)) {
      return 'reverb';
    }

    if (key.startsWith('granular')) {
      if (
        GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS.some(prefix => key.startsWith(prefix)) ||
        key === 'granularEnabled' ||
        key === 'granularFreeze' ||
        key === 'granularShape' ||
        key.endsWith('Enabled') ||
        key.endsWith('Mode') ||
        key.endsWith('Slice') ||
        key.endsWith('Reverse') ||
        key.includes('TempoSync')
      ) {
        return null;
      }
      return 'granular';
    }

    return null;
  }

  private isFxOwnershipDrivenKey(key: string): boolean {
    return this.getFxOwnershipBusForKey(key) !== null;
  }

  private shv(key: string, fallback: number): number {
    return this.shSampledValues[key] ?? fallback;
  }

  private shDelayDivision<K extends IndexedDelayDivisionKey>(key: K, fallback: SliderState[K]): SliderState[K] {
    const sampled = this.shSampledValues[key];
    if (typeof sampled !== 'number') return fallback;
    return getIndexedDelayDivisionValue(key, sampled);
  }

  private getFxOwnerDebugState(): FxOwnershipDebugState {
    const nowMs = performance.now();
    return {
      delayA: {
        owner: this.fxBusOwners.delayA.owner,
        strength: this.fxBusOwners.delayA.strength,
        lastOrigin: this.fxBusOwners.delayA.lastOrigin,
        active: this.fxBusOwners.delayA.owner !== null && nowMs < this.fxBusOwners.delayA.expiresAtMs,
      },
      delayB: {
        owner: this.fxBusOwners.delayB.owner,
        strength: this.fxBusOwners.delayB.strength,
        lastOrigin: this.fxBusOwners.delayB.lastOrigin,
        active: this.fxBusOwners.delayB.owner !== null && nowMs < this.fxBusOwners.delayB.expiresAtMs,
      },
      granular: {
        owner: this.fxBusOwners.granular.owner,
        strength: this.fxBusOwners.granular.strength,
        lastOrigin: this.fxBusOwners.granular.lastOrigin,
        active: this.fxBusOwners.granular.owner !== null && nowMs < this.fxBusOwners.granular.expiresAtMs,
      },
      reverb: {
        owner: this.fxBusOwners.reverb.owner,
        strength: this.fxBusOwners.reverb.strength,
        lastOrigin: this.fxBusOwners.reverb.lastOrigin,
        active: this.fxBusOwners.reverb.owner !== null && nowMs < this.fxBusOwners.reverb.expiresAtMs,
      },
    };
  }

  private sampleDualRangeKey(key: string, positions: Record<string, number>): number | null {
    const range = this.dualRanges[key];
    if (!range) return null;
    const sampled = range.min + Math.random() * (range.max - range.min);
    this.shSampledValues[key] = sampled;
    const span = range.max - range.min;
    positions[key] = span > 0 ? (sampled - range.min) / span : 0.5;
    return sampled;
  }

  private emitOwnedSamplePositions(positions: Record<string, number>): void {
    if (Object.keys(positions).length === 0) return;
    if (this.onGranularSHTrigger) {
      this.onGranularSHTrigger(positions);
    }
    if (
      this.onLeadDelayTrigger &&
      (positions.delayAFeedback !== undefined || positions.delayAMix !== undefined)
    ) {
      this.onLeadDelayTrigger({
        time: 0.5,
        feedback: positions.delayAFeedback ?? 0.5,
        mix: positions.delayAMix ?? 0.5,
      });
    }
  }

  private getFxSourceStrength(
    bus: FxOwnershipBus,
    source: FxOwnershipSource,
    state: SliderState,
  ): number {
    const lead1WetActive = !!(state.leadEnabled || state.leadRandomEnabled || state.synthEuclideanMasterEnabled);
    const lead2WetActive = !!state.lead2Enabled;
    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = !!state.pad2Enabled;
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive);

    switch (bus) {
      case 'delayA':
        switch (source) {
          case 'pad1': return pad1Active ? (state.pad1DelayASend ?? 0) : 0;
          case 'pad2': return pad2Active ? (state.pad2DelayASend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1DelayASend', state.lead1DelayASend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2DelayASend', state.lead2DelayASend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? this.getDrumDelaySendProfile(state) * (state.drumDelayASend ?? 1) : 0;
        }
        break;
      case 'delayB':
        switch (source) {
          case 'pad1': return pad1Active ? (state.pad1DelayBSend ?? 0) : 0;
          case 'pad2': return pad2Active ? (state.pad2DelayBSend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1DelayBSend', state.lead1DelayBSend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2DelayBSend', state.lead2DelayBSend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (state.drumDelayBSend ?? 0) : 0;
        }
        break;
      case 'granular':
        if (!granularBusArmed) return 0;
        switch (source) {
          case 'pad1': return pad1Active ? (state.granularPad1Send ?? 0) : 0;
          case 'pad2': return pad2Active ? (state.granularPad2Send ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('granularLead1Send', state.granularLead1Send ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('granularLead2Send', state.granularLead2Send ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (state.granularDrumSend ?? 0) : 0;
        }
        break;
      case 'reverb':
        if (!state.reverbEnabled) return 0;
        switch (source) {
          case 'pad1': return pad1Active ? this.shv('pad1ReverbSend', state.pad1ReverbSend ?? 0) : 0;
          case 'pad2': return pad2Active ? this.shv('pad2ReverbSend', state.pad2ReverbSend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1ReverbSend', state.lead1ReverbSend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2ReverbSend', state.lead2ReverbSend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (this.shSampledValues.drumReverbSend ?? state.drumReverbSend ?? 0) : 0;
        }
        break;
    }

    return 0;
  }

  private shouldTriggerOwnedFxBus(
    bus: FxOwnershipBus,
    source: FxOwnershipSource,
    strength: number,
    nowMs: number,
  ): boolean {
    const owner = this.fxBusOwners[bus];
    if (strength <= 0.0001) return false;
    if (owner.owner === source) return true;
    if (owner.owner === null || nowMs >= owner.expiresAtMs) return true;
    if (strength >= owner.strength + FX_OWNERSHIP_STEAL_MARGIN) return true;
    if (owner.strength > 0 && strength / owner.strength >= FX_OWNERSHIP_STEAL_RATIO) return true;
    if (owner.strength > 0 && strength / owner.strength >= FX_OWNERSHIP_RECENT_ONSET_RATIO) return true;
    return false;
  }

  private scheduleApplyParamsRefresh(): void {
    if (!this.sliderState) return;
    this._applyParamsDirty = true;
    if (this._applyParamsRaf === null) {
      this._applyParamsRaf = requestAnimationFrame(() => {
        this._applyParamsRaf = null;
        if (this._applyParamsDirty && this.sliderState) {
          this._applyParamsDirty = false;
          this.applyParams(this.sliderState);
        }
      });
    }
  }

  private resampleOwnedFxBus(bus: FxOwnershipBus): boolean {
    const positions: Record<string, number> = {};
    for (const key of Object.keys(this.dualRanges)) {
      if (this.getFxOwnershipBusForKey(key) !== bus) continue;
      this.sampleDualRangeKey(key, positions);
    }
    this.emitOwnedSamplePositions(positions);
    return Object.keys(positions).length > 0;
  }

  private getSharedDelayBState(
    state: SliderState,
    pad1Active: boolean,
    pad2Active: boolean,
    lead1RoutingActive: boolean,
    lead2RoutingActive: boolean,
    granularEnabled: boolean,
  ) {
    const spaceMode = computeGranularMacroModel(state, (key, fallback) => this.shv(key as string, fallback)).spaceMode;
    const delayBGranularReturn = this.shv('delayBGranularSend', state.delayBGranularSend ?? 0);
    const granularDelaySourceLevel = (granularEnabled && delayBGranularReturn < 0.0001) ? (state.granularDelayBSend ?? 0) : 0;
    const crossFeeds = this.getSafeDelayCrossFeedLevels(state);
    const delayBExternalFeedActive =
      (pad1Active && (state.pad1DelayBSend ?? 0) > 0.0001) ||
      (pad2Active && (state.pad2DelayBSend ?? 0) > 0.0001) ||
      (lead1RoutingActive && (state.lead1DelayBSend ?? 0) > 0.0001) ||
      (lead2RoutingActive && (state.lead2DelayBSend ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.drumDelayBSend ?? 0) > 0.0001) ||
      (state.oceanSampleEnabled && (state.oceanDelayBSend ?? 0) > 0.0001) ||
      (state.waterEnabled && (state.waterDelayBSend ?? 0) > 0.0001) ||
      ((state.insectsEnabled || state.insects2Enabled) && (state.insDelayBSend ?? 0) > 0.0001) ||
      (crossFeeds.aToB > 0.0001);
    const delayBEnabled = granularDelaySourceLevel > 0.0001 || delayBExternalFeedActive;

    return {
      delayBEnabled,
      granularDelaySourceLevel,
      params: {
        enabled: delayBEnabled,
        activity: this.shv('granularDelayActivity', state.granularDelayActivity ?? 0.3),
        repeats: this.shv('granularDelayRepeats', state.granularDelayRepeats ?? 0.3),
        noteDiv: this.shDelayDivision('granularDelayTime', (state.granularDelayTime as string) ?? '1/4'),
        tone: this.shv('granularDelayFilter', state.granularDelayFilter ?? 0.5),
        vibrato: this.shv('granularDelayVibrato', state.granularDelayVibrato ?? 0),
        mix: 1.0,
        reverbSend: (delayBEnabled && state.reverbEnabled) ? this.shv('granularDelayReverbSend', state.granularDelayReverbSend ?? 0.4) : 0,
        granularSend: (delayBEnabled && granularDelaySourceLevel < 0.0001) ? this.shv('delayBGranularSend', state.delayBGranularSend ?? 0) : 0,
        toDelayA: delayBEnabled ? crossFeeds.bToA : 0,
        bpm: getSharedSequencerBpm(state),
        spaceMode,
        pattern: state.delayBPattern ?? 'cascade',
        warp: state.delayBWarp ?? 'clean',
        warpIntensity: this.shv('delayBWarpIntensity', state.delayBWarpIntensity ?? 0.5),
        spread: this.shv('delayBSpread', state.delayBSpread ?? 0.5),
      },
    };
  }

  private refreshOwnedFxBus(bus: FxOwnershipBus): void {
    if (!this.sliderState || !this.ctx) return;

    const state = this.getEffectivePadState(this.sliderState);
    const now = this.ctx.currentTime;
    const smoothTime = 0.015;
    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = state.pad2Enabled ?? false;
    const lead1WetActive = !!(state.leadEnabled || state.leadRandomEnabled || state.synthEuclideanMasterEnabled);
    const lead2WetActive = !!state.lead2Enabled;
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive);

    if (bus === 'delayB' || bus === 'delayA') {
      const delayBState = this.getSharedDelayBState(
        state,
        pad1Active,
        pad2Active,
        lead1WetActive,
        lead2WetActive,
        granularBusArmed,
      );
      if (bus === 'delayB') {
        this.sharedGranularDelayBSend?.gain.setTargetAtTime(delayBState.granularDelaySourceLevel, now, smoothTime);
        this.sharedDelayB?.update(delayBState.params, now, smoothTime);
        return;
      }

      const delayAState = this.getSharedDelayAState(
        state,
        lead1WetActive,
        lead2WetActive,
        granularBusArmed,
        delayBState.delayBEnabled,
      );
      this.sharedDelayA?.update(delayAState, now, smoothTime);
    }
  }

  private reportFxOnset(source: FxOwnershipSource, origin: FxOwnershipOrigin): void {
    if (!this.sliderState) return;

    const nowMs = performance.now();
    const buses: FxOwnershipBus[] = ['delayA', 'delayB', 'granular', 'reverb'];
    let shouldNotify = false;
    let shouldRefreshParams = false;
    for (const bus of buses) {
      const strength = this.getFxSourceStrength(bus, source, this.sliderState);
      if (!this.shouldTriggerOwnedFxBus(bus, source, strength, nowMs)) continue;
      const previous = this.fxBusOwners[bus];
      this.fxBusOwners[bus] = {
        owner: source,
        strength,
        expiresAtMs: nowMs + FX_OWNERSHIP_WINDOW_MS,
        lastOrigin: origin,
      };
      if (previous.owner !== source || previous.lastOrigin !== origin) {
        shouldNotify = true;
      }
      if (this.resampleOwnedFxBus(bus)) {
        shouldRefreshParams = true;
        this.refreshOwnedFxBus(bus);
      }
    }
    if (shouldRefreshParams) {
      this.scheduleApplyParamsRefresh();
    }
    if (shouldNotify) {
      this.notifyStateChange();
    }
  }

  private postCachedWorkletMessage(
    cacheKey: string,
    node: AudioWorkletNode | null,
    message: Record<string, unknown>,
    signatureSource: unknown = message,
  ): void {
    if (!node) return;
    const signature = JSON.stringify(signatureSource);
    if (this._messageSignatures.get(cacheKey) === signature) return;
    this._messageSignatures.set(cacheKey, signature);
    node.port.postMessage(message);
  }

  private ensureSharedDelayBuses(ctx: AudioContext): void {
    if (!this.masterGain || !this.reverbInputBus) return;

    if (!this.sharedDelayA) {
      this.sharedDelayA = new SharedDelayBusA(ctx, this.masterGain, this.reverbInputBus);
    }
    if (!this.sharedDelayB) {
      this.sharedDelayB = new SharedDelayBusB(ctx, this.masterGain, this.reverbInputBus);
      this.sharedDelayA.connectDelayBInput(this.sharedDelayB.input);
      this.sharedDelayB.connectDelayAInput(this.sharedDelayA.input);
    }
    if (this.granularFxInputGain && !this.sharedDelayGranularLinksWired) {
      this.sharedDelayA.connectGranularInput(this.granularFxInputGain);
      this.sharedDelayB.connectGranularInput(this.granularFxInputGain);
      this.sharedDelayGranularLinksWired = true;
    }
  }

  private ensureTappedSend(
    ctx: AudioContext,
    current: GainNode | null,
    connectSource: (gain: GainNode) => void,
    target: AudioNode | null,
  ): GainNode | null {
    if (!target) return current;
    if (!current) {
      current = ctx.createGain();
      current.gain.value = 0;
      connectSource(current);
      current.connect(target);
    }
    return current;
  }

  private ensurePadDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.pad1DelayASend = this.ensureTappedSend(ctx, this.pad1DelayASend, (gain) => {
        this.pad1PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 2);
      }, this.sharedDelayA.input);
      this.pad2DelayASend = this.ensureTappedSend(ctx, this.pad2DelayASend, (gain) => {
        this.pad2PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 3);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.pad1DelayBSend = this.ensureTappedSend(ctx, this.pad1DelayBSend, (gain) => {
        this.pad1PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 2);
      }, this.sharedDelayB.input);
      this.pad2DelayBSend = this.ensureTappedSend(ctx, this.pad2DelayBSend, (gain) => {
        this.pad2PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 3);
      }, this.sharedDelayB.input);
    }
  }

  private ensureLeadDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.lead1DelayASend = this.ensureTappedSend(ctx, this.lead1DelayASend, (gain) => {
        this.lead1Bus?.connect(gain);
      }, this.sharedDelayA.input);
      this.lead2DelayASend = this.ensureTappedSend(ctx, this.lead2DelayASend, (gain) => {
        this.lead2Bus?.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.lead1DelayBSend = this.ensureTappedSend(ctx, this.lead1DelayBSend, (gain) => {
        this.lead1Bus?.connect(gain);
      }, this.sharedDelayB.input);
      this.lead2DelayBSend = this.ensureTappedSend(ctx, this.lead2DelayBSend, (gain) => {
        this.lead2Bus?.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private ensureGranularDelaySends(ctx: AudioContext): void {
    const granularDelaySource = (this.granularFxOutputLPF ?? this.granularFxNode) as AudioNode | null;
    if (this.sharedDelayA && granularDelaySource) {
      this.granularDelayASend = this.ensureTappedSend(ctx, this.granularDelayASend, (gain) => {
        granularDelaySource.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB && granularDelaySource) {
      this.sharedGranularDelayBSend = this.ensureTappedSend(ctx, this.sharedGranularDelayBSend, (gain) => {
        granularDelaySource.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private ensureEarthDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.oceanDelayASend = this.ensureTappedSend(ctx, this.oceanDelayASend, (gain) => {
        this.oceanFilter?.connect(gain);
      }, this.sharedDelayA.input);
      this.waterDelayASend = this.ensureTappedSend(ctx, this.waterDelayASend, (gain) => {
        this.waterPreFaderBus?.connect(gain);
      }, this.sharedDelayA.input);
      this.insectsDelayASend = this.ensureTappedSend(ctx, this.insectsDelayASend, (gain) => {
        this.insectsPreFaderBus?.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.oceanDelayBSend = this.ensureTappedSend(ctx, this.oceanDelayBSend, (gain) => {
        this.oceanFilter?.connect(gain);
      }, this.sharedDelayB.input);
      this.waterDelayBSend = this.ensureTappedSend(ctx, this.waterDelayBSend, (gain) => {
        this.waterPreFaderBus?.connect(gain);
      }, this.sharedDelayB.input);
      this.insectsDelayBSend = this.ensureTappedSend(ctx, this.insectsDelayBSend, (gain) => {
        this.insectsPreFaderBus?.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private getDrumDelaySendProfile(state: SliderState): number {
    const sends = [
      state.drumSubDelaySend,
      state.drumKickDelaySend,
      state.drumClickDelaySend,
      state.drumBeepHiDelaySend,
      state.drumBeepLoDelaySend,
      state.drumNoiseDelaySend,
      state.drumMembraneDelaySend,
    ].map(value => Math.max(0, Math.min(1, value ?? 0)));
    const average = sends.reduce((sum, value) => sum + value, 0) / sends.length;
    const peak = Math.max(...sends, 0);
    return Math.max(0, Math.min(1, peak * 0.5 + average * 0.5));
  }

  private createMasterLimiter(ctx: AudioContext): DynamicsCompressorNode {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    return limiter;
  }

  private ensureMasterSaturationNodes(ctx: AudioContext): void {
    if (!this.satPreGain) {
      this.satPreGain = ctx.createGain();
      this.satPreGain.gain.value = 1;
    }
    if (!this.satWaveshaper) {
      this.satWaveshaper = ctx.createWaveShaper();
      this.satWaveshaper.curve = makeMasterSaturationCurve('clean');
      this.satWaveshaper.oversample = 'none';
      this.lastMasterSatMode = 'clean';
    }
    if (!this.satPostTone) {
      this.satPostTone = ctx.createBiquadFilter();
      this.satPostTone.type = 'peaking';
      this.satPostTone.frequency.value = 3000;
      this.satPostTone.Q.value = 0.5;
      this.satPostTone.gain.value = 0;
    }
    if (!this.satPostGain) {
      this.satPostGain = ctx.createGain();
      this.satPostGain.gain.value = 1;
    }
  }

  private wireMasterOutputChain(ctx: AudioContext): void {
    if (!this.masterGain || !this.limiter) return;
    this.ensureMasterSaturationNodes(ctx);
    try { this.masterGain.disconnect(); } catch { /* */ }
    try { this.satPreGain?.disconnect(); } catch { /* */ }
    try { this.satWaveshaper?.disconnect(); } catch { /* */ }
    try { this.satPostTone?.disconnect(); } catch { /* */ }
    try { this.satPostGain?.disconnect(); } catch { /* */ }
    this.masterGain.connect(this.satPreGain!);
    this.satPreGain!.connect(this.satWaveshaper!);
    this.satWaveshaper!.connect(this.satPostTone!);
    this.satPostTone!.connect(this.satPostGain!);
    this.satPostGain!.connect(this.limiter);
  }

  private applyMasterSaturation(state: SliderState, now: number): void {
    const drive = Math.max(0, Math.min(1, state.masterSatDrive ?? 0));
    const tone = Math.max(0, Math.min(1, state.masterSatTone ?? 0.5));
    const mode = (state.masterSatMode ?? 'clean') as 'clean' | 'tape' | 'tube';
    const preGainValue = 1 + drive * 3;
    const postCompensation = 1 / (1 + drive * 1.5);
    const tiltDb = (tone - 0.5) * 12;

    if (this.satWaveshaper && mode !== this.lastMasterSatMode) {
      this.satWaveshaper.curve = makeMasterSaturationCurve(mode);
      this.lastMasterSatMode = mode;
    }
    if (this.satWaveshaper) {
      this.satWaveshaper.oversample = drive > 0.1 ? '2x' : 'none';
    }
    this.satPreGain?.gain.setTargetAtTime(preGainValue, now, 0.05);
    this.satPostGain?.gain.setTargetAtTime(postCompensation, now, 0.05);
    this.satPostTone?.gain.setTargetAtTime(tiltDb, now, 0.05);
  }

  private getSafeDelayCrossFeedLevels(state: SliderState): { aToB: number; bToA: number } {
    let aToB = Math.max(0, Math.min(1, this.shv('delayAToBSend', state.delayAToBSend ?? 0)));
    let bToA = Math.max(0, Math.min(1, this.shv('delayBToASend', state.delayBToASend ?? 0)));
    const product = aToB * bToA;
    if (product > 0.4) {
      const scale = Math.sqrt(0.4 / product);
      aToB *= scale;
      bToA *= scale;
    }
    return { aToB, bToA };
  }

  private getSharedDelayATimes(state: SliderState): { leftMs: number; rightMs: number } {
    const bpm = getSharedSequencerBpm(state);
    const delayNoteL = this.shDelayDivision('drumDelayNoteL', (state.drumDelayNoteL as string) ?? '1/8d');
    const delayNoteR = this.shDelayDivision('drumDelayNoteR', (state.drumDelayNoteR as string) ?? '1/4');
    return {
      leftMs: delayNoteToSeconds(delayNoteL, bpm) * 1000,
      rightMs: delayNoteToSeconds(delayNoteR, bpm) * 1000,
    };
  }

  private isGranularBusArmed(state: SliderState, lead1WetActive: boolean, lead2WetActive: boolean): boolean {
    const hasIncomingFeed =
      ((state.padEnabled ?? true) && (state.granularPad1Send ?? 0) > 0.0001) ||
      ((state.pad2Enabled ?? false) && (state.granularPad2Send ?? 0) > 0.0001) ||
      (lead1WetActive && (state.granularLead1Send ?? 0) > 0.0001) ||
      (lead2WetActive && (state.granularLead2Send ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.granularDrumSend ?? 0) > 0.0001) ||
      (state.oceanSampleEnabled && (state.granularWavesSend ?? 0) > 0.0001) ||
      (state.waterEnabled && (state.granularWaterSend ?? 0) > 0.0001) ||
      ((state.insectsEnabled || state.insects2Enabled) && (state.granularInsectsSend ?? 0) > 0.0001) ||
      (this.shv('delayAGranularSend', state.delayAGranularSend ?? 0) > 0.0001) ||
      (this.shv('delayBGranularSend', state.delayBGranularSend ?? 0) > 0.0001);
    const hasOutgoingPath =
      this.shv('granularLevel', state.granularLevel ?? 0) > 0.0001 ||
      this.shv('granularReverbSend', state.granularReverbSend ?? 0) > 0.0001 ||
      (state.granularDelayASend ?? 0) > 0.0001 ||
      (state.granularDelayBSend ?? 0) > 0.0001;
    return !!state.granularEnabled && (hasIncomingFeed || hasOutgoingPath);
  }

  private hasAnyReverbFeed(
    state: SliderState,
    pad1Active: boolean,
    pad2Active: boolean,
    lead1WetActive: boolean,
    lead2WetActive: boolean,
    granularBusArmed: boolean,
    delayAEnabled: boolean,
    delayBEnabled: boolean,
  ): boolean {
    return (
      (pad1Active && (state.pad1ReverbSend ?? 0) > 0.0001) ||
      (pad2Active && (state.pad2ReverbSend ?? 0) > 0.0001) ||
      (lead1WetActive && (state.lead1ReverbSend ?? 0) > 0.0001) ||
      (lead2WetActive && (state.lead2ReverbSend ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.drumReverbSend ?? 0) > 0.0001) ||
      (granularBusArmed && this.shv('granularReverbSend', state.granularReverbSend ?? 0) > 0.0001) ||
      (delayAEnabled && this.shv('delayAReverbSend', state.delayAReverbSend ?? 0) > 0.0001) ||
      (delayBEnabled && this.shv('granularDelayReverbSend', state.granularDelayReverbSend ?? 0) > 0.0001) ||
      (state.oceanSampleEnabled && (state.oceanReverbSend ?? 0) > 0.0001) ||
      (state.waterEnabled && (state.waterReverbSend ?? 0) > 0.0001) ||
      ((state.insectsEnabled || state.insects2Enabled) && (state.insectsReverbSend ?? 0) > 0.0001)
    );
  }

  private getSharedDelayAState(
    state: SliderState,
    lead1WetActive: boolean,
    lead2WetActive: boolean,
    granularBusArmed: boolean,
    delayBEnabled = false,
  ) {
    const { leftMs, rightMs } = this.getSharedDelayATimes(state);
    const drumDelayProfile = this.getDrumDelaySendProfile(state);
    const crossFeeds = this.getSafeDelayCrossFeedLevels(state);
    const delayFeedback = this.shv('delayAFeedback', state.delayAFeedback ?? 0.4);
    const delayMix = this.shv('delayAMix', state.delayAMix ?? 0.35);
    const delayFilter = this.shv('delayAFilter', state.delayAFilter ?? 2000);
    const delayReverbSend = this.shv('delayAReverbSend', state.delayAReverbSend ?? 0.4);
    const delayModDepth = this.shv('delayAModDepth', state.delayAModDepth ?? 0);
    const delayModRate = this.shv('delayAModRate', state.delayAModRate ?? 0);
    const delayDuck = this.shv('delayADuck', state.delayADuck ?? 0);
    const delayWidth = this.shv('delayAWidth', state.delayAWidth ?? 0.5);
    const delayCrossFeedFilter = this.shv('delayACrossFeedFilter', state.delayACrossFeedFilter ?? 1);
    const delayGranularSend = this.shv('delayAGranularSend', state.delayAGranularSend ?? 0);
    const delayAExternalFeedActive =
      ((state.padEnabled ?? true) && (state.pad1DelayASend ?? 0) > 0.0001) ||
      ((state.pad2Enabled ?? false) && (state.pad2DelayASend ?? 0) > 0.0001) ||
      (lead1WetActive && (state.lead1DelayASend ?? 0) > 0.0001) ||
      (lead2WetActive && (state.lead2DelayASend ?? 0) > 0.0001) ||
      (state.drumEnabled && drumDelayProfile * (state.drumDelayASend ?? 0) > 0.0001) ||
      (granularBusArmed && (state.granularDelayASend ?? 0) > 0.0001) ||
      (delayBEnabled && crossFeeds.bToA > 0.0001) ||
      (state.oceanSampleEnabled && (state.oceanDelayASend ?? 0) > 0.0001) ||
      (state.waterEnabled && (state.waterDelayASend ?? 0) > 0.0001) ||
      ((state.insectsEnabled || state.insects2Enabled) && (state.insDelayASend ?? 0) > 0.0001);

    return {
      enabled: delayAExternalFeedActive,
      timeLeftMs: leftMs,
      timeRightMs: rightMs,
      feedback: delayFeedback,
      mix: delayMix,
      filterHz: delayFilter,
      filterType: state.delayAFilterType ?? 'lowpass',
      reverbSend: (state.reverbEnabled && delayAExternalFeedActive) ? delayReverbSend : 0,
      modRateHz: delayModDepth > 0 ? (0.05 + delayModRate * 4.95) : 0,
      modDepthMs: delayModDepth * 50,
      pingPong: state.delayAPingPong ?? false,
      duck: delayDuck,
      width: delayWidth,
      toDelayB: crossFeeds.aToB,
      crossFeedFilterHz: 200 * Math.pow(40, Math.max(0, Math.min(1, delayCrossFeedFilter))),
      granularSend: delayGranularSend,
    };
  }

  private wireDrumDelaySends(ctx: AudioContext): void {
    this.drumSynth?.setSharedDelayInput(this.sharedDelayA?.input ?? null);
    if (this.sharedDelayA && this.drumWasmNode && !this.drumDelayASend) {
      this.drumDelayASend = ctx.createGain();
      this.drumDelayASend.gain.value = 0;
      this.drumWasmNode.connect(this.drumDelayASend, 0);
      this.drumDelayASend.connect(this.sharedDelayA.input);
    }

    if (this.sharedDelayB && this.drumSynth && !this.drumDelayBSend) {
      this.drumDelayBSend = ctx.createGain();
      this.drumDelayBSend.gain.value = 0;
      this.drumSynth.getPreFaderBus().connect(this.drumDelayBSend);
      if (this.drumWasmNode) {
        this.drumWasmNode.connect(this.drumDelayBSend, 0);
      }
      this.drumDelayBSend.connect(this.sharedDelayB.input);
    }
  }

  private flushGranularWorkletUpdate(): void {
    if (this.granularWorkletDispatchTimer !== null) {
      clearTimeout(this.granularWorkletDispatchTimer);
      this.granularWorkletDispatchTimer = null;
    }
    if (!this.granularFxNode || !this.pendingGranularWorkletUpdate) return;

    const update = this.pendingGranularWorkletUpdate;
    this.pendingGranularWorkletUpdate = null;
    this.lastGranularWorkletDispatchMs = performance.now();

    this.postCachedWorkletMessage(
      'granular:globalParams',
      this.granularFxNode,
      { type: 'globalParams', params: update.global },
      update.global,
    );
    this.postCachedWorkletMessage(
      'granular:spaceParams',
      this.granularFxNode,
      { type: 'spaceParams', params: update.space },
      update.space,
    );
    this.postCachedWorkletMessage(
      'granular:voiceParams',
      this.granularFxNode,
      { type: 'voiceParams', params: update.voices },
      update.voices,
    );
    this.postCachedWorkletMessage(
      'granular:harmonyParams',
      this.granularFxNode,
      { type: 'harmonyParams', params: update.harmony },
      update.harmony,
    );
    this.postCachedWorkletMessage(
      'granular:legacyParams',
      this.granularFxNode,
      { type: 'legacyParams', params: update.legacy },
      update.legacy,
    );
  }

  private queueGranularWorkletUpdate(update: GranularWorkletUpdate): void {
    this.pendingGranularWorkletUpdate = update;
    if (!this.granularFxNode) return;

    const nowMs = performance.now();
    const elapsed = nowMs - this.lastGranularWorkletDispatchMs;
    if (this.lastGranularWorkletDispatchMs === 0 || elapsed >= GRANULAR_WORKLET_DISPATCH_INTERVAL_MS) {
      this.flushGranularWorkletUpdate();
      return;
    }

    if (this.granularWorkletDispatchTimer !== null) return;
    const waitMs = Math.max(1, GRANULAR_WORKLET_DISPATCH_INTERVAL_MS - elapsed);
    this.granularWorkletDispatchTimer = window.setTimeout(() => {
      this.granularWorkletDispatchTimer = null;
      this.flushGranularWorkletUpdate();
    }, waitMs);
  }

  /** Callback fired on each S&H re-sample (~10Hz) with normalized positions per key */
  setGranularSHTriggerCallback(cb: (positions: Record<string, number>) => void) {
    this.onGranularSHTrigger = cb;
  }

  /** Enable/disable CPU performance monitoring overlay. Sends enablePerf to all worklets. */
  setPerfMonitorEnabled(enabled: boolean) {
    this.perfMonitorEnabled = enabled;
    if (!enabled) {
      this.perfData = {};
    }
    this.sendEnablePerfToWorklets(enabled);
  }

  /** Send enablePerf message to all worklet nodes that have a port */
  private sendEnablePerfToWorklets(enabled: boolean) {
    const msg = { type: 'enablePerf', enabled };
    // Guard: only send to AudioWorkletNodes (which have .port), not to GainNode stand-ins
    if (this.reverbNode && 'port' in this.reverbNode) (this.reverbNode as AudioWorkletNode).port.postMessage(msg);
    if (this.granularFxNode && 'port' in this.granularFxNode) this.granularFxNode.port.postMessage(msg);
    if (this.soundscapesNode && 'port' in this.soundscapesNode) this.soundscapesNode.port.postMessage(msg);
    if (this.padWasmNode) this.padWasmNode.port.postMessage(msg);
    if (this.leadFmWasmNode) this.leadFmWasmNode.port.postMessage(msg);
    if (this.drumWasmNode) this.drumWasmNode.port.postMessage(msg);
    if (this.spectralFreezeNode) this.spectralFreezeNode.port.postMessage(msg);
  }

  setPerfUpdateCallback(callback: ((data: Record<string, PerfMetrics>) => void) | null) {
    this.onPerfUpdate = callback;
  }

  /** Handle incoming perf message from any worklet */
  private handlePerfMessage(data: Record<string, unknown>) {
    // Standard format: { name: string, cpuPercent: number }
    if (typeof data.name === 'string' && typeof data.cpuPercent === 'number') {
      this.perfData[data.name] = {
        avgPercent: Math.round(data.cpuPercent * 10) / 10,
        peakPercent: Math.round((((data.peakPercent as number) ?? data.cpuPercent) as number) * 10) / 10,
        missPercent: typeof data.missPercent === 'number'
          ? Math.round(data.missPercent * 10) / 10
          : 0,
      };
    }
    // Soundscapes format: { avgMs, budgetMs, waterMs, insectsMs, fireMs }
    if (typeof data.budgetMs === 'number' && typeof data.waterMs === 'number') {
      const budget = data.budgetMs as number;
      if (budget > 0) {
        this.perfData['water'] = {
          avgPercent: Math.round(((data.waterMs as number) / budget) * 1000) / 10,
          peakPercent: Math.round(((((data.waterPeakMs as number) ?? data.waterMs) as number) / budget) * 1000) / 10,
          missPercent: null,
        };
        this.perfData['insects'] = {
          avgPercent: Math.round((((data.insectsMs as number) || 0) / budget) * 1000) / 10,
          peakPercent: Math.round((((((data.insectsPeakMs as number) ?? data.insectsMs) as number) || 0) / budget) * 1000) / 10,
          missPercent: null,
        };
        this.perfData['fire'] = {
          avgPercent: Math.round((((data.fireMs as number) || 0) / budget) * 1000) / 10,
          peakPercent: Math.round((((((data.firePeakMs as number) ?? data.fireMs) as number) || 0) / budget) * 1000) / 10,
          missPercent: null,
        };
        delete this.perfData['ocean'];
      }
    }
    if (this.onPerfUpdate) {
      this.onPerfUpdate({ ...this.perfData });
    }
  }

  private isGranularTempoSyncVoiceActive(state: SliderState, voiceIndex: number): boolean {
    const voiceNum = voiceIndex + 1;
    const enabled = state[`granularV${voiceNum}Enabled` as keyof SliderState] as boolean;
    const mode = state[`granularV${voiceNum}Mode` as keyof SliderState] as SliderState['granularV1Mode'];
    const tempoSync = state[`granularV${voiceNum}TempoSync` as keyof SliderState] as boolean;
    return !!(state.granularEnabled && enabled && mode === 'granular' && tempoSync);
  }

  private hasGranularTempoSyncVoices(state: SliderState | null): boolean {
    if (!state) return false;
    for (let voiceIndex = 0; voiceIndex < 4; voiceIndex++) {
      if (this.isGranularTempoSyncVoiceActive(state, voiceIndex)) return true;
    }
    return false;
  }



  setStateChangeCallback(callback: (state: EngineState) => void) {
    this.onStateChange = callback;
  }

  setLeadExpressionCallback(callback: (expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) {
    this.onLeadExpressionTrigger = callback;
  }

  setLeadMorphCallback(callback: (morph: { lead1: number; lead2: number }) => void) {
    this.onLeadMorphTrigger = callback;
  }

  setLeadDelayCallback(callback: (delay: { time: number; feedback: number; mix: number }) => void) {
    this.onLeadDelayTrigger = callback;
  }

  getGranularWriteHeadPosition(): number { return this.granularWriteHeadPosition; }
  getGranularVoicePositions(): number[] { return [...this.granularVoicePositions]; }
  getGranularActiveGrainCount(): number { return this.granularActiveGrainCount; }
  getGranularBufferWaveform(): Float32Array | null { return this.granularBufferWaveform; }

  setGranularUiActive(active: boolean) {
    this.granularUiActive = active;
    if (this.granularFxNode) {
      this.granularFxNode.port.postMessage({ type: 'uiActive', active });
    }
  }

  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void) {
    this.onDrumTrigger = callback;
    // Pass through to drum synth if it exists
    if (this.drumSynth) {
      this.drumSynth.setDrumTriggerCallback(this.drumTriggerRouter);
    }
  }

  setDrumMorphTriggerCallback(callback: (voice: DrumVoiceType, morphPosition: number) => void) {
    this.onDrumMorphTrigger = callback;
    // Pass through to drum synth if it exists
    if (this.drumSynth) {
      this.drumSynth.setMorphTriggerCallback(callback);
    }
  }

  setPadMorphTriggerCallback(callback: (morphPosition: number) => void) {
    this.onPadMorphTrigger = callback;
  }

  setPad2MorphTriggerCallback(callback: (morphPosition: number) => void) {
    this.onPad2MorphTrigger = callback;
  }

  setDrumEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void) {
    this.onDrumEuclidEvolveTrigger = callback;
    if (this.drumSynth) {
      this.drumSynth.setEuclidEvolveTriggerCallback(callback);
    }
  }

  setDrumStepPositionCallback(callback: (steps: number[], hitCounts: number[]) => void) {
    this.onDrumStepPositionChange = callback;
    if (this.drumSynth) {
      this.drumSynth.setStepPositionCallback(callback);
    }
  }

  setSynthStepPositionCallback(callback: (steps: number[], hitCounts: number[]) => void) {
    this.onSynthStepPositionChange = callback;
  }

  setSynthStepOverrides(overrides: {
    pitch: (number[] | null)[];
    pitchDirection: (LaneDirection | null)[];
    triggerToggles?: Map<number, boolean>[];
    expression?: (number[] | null)[];
    expressionDirection?: (LaneDirection | null)[];
    morph?: (number[] | null)[];
    morphDirection?: (LaneDirection | null)[];
    distance?: (number[] | null)[];
    distanceDirection?: (LaneDirection | null)[];
    probability?: (number[] | null)[];
    ratchet?: (number[] | null)[];
    trigCondition?: (TrigCondition[] | null)[];
  }) {
    this.synthStepOverrides = {
      pitch: overrides.pitch,
      pitchDirection: overrides.pitchDirection,
      triggerToggles: overrides.triggerToggles ?? this.synthStepOverrides.triggerToggles,
      expression: overrides.expression ?? this.synthStepOverrides.expression,
      expressionDirection: overrides.expressionDirection ?? this.synthStepOverrides.expressionDirection,
      morph: overrides.morph ?? this.synthStepOverrides.morph,
      morphDirection: overrides.morphDirection ?? this.synthStepOverrides.morphDirection,
      distance: overrides.distance ?? this.synthStepOverrides.distance,
      distanceDirection: overrides.distanceDirection ?? this.synthStepOverrides.distanceDirection,
      probability: overrides.probability ?? this.synthStepOverrides.probability,
      ratchet: overrides.ratchet ?? this.synthStepOverrides.ratchet,
      trigCondition: overrides.trigCondition ?? this.synthStepOverrides.trigCondition,
    };
    // Continuous scheduler reads overrides each tick — no restart needed
  }

  /** Set per-lane clock divisions for the synth Euclidean sequencer. */
  setSynthEuclidClockDivs(divs: ClockDivision[]) {
    this.synthEuclidClockDivs = SYNTH_LANE_INDICES.map(i => divs[i] ?? this.synthEuclidClockDivs[i]) as Quad<ClockDivision>;
  }

  /** Set per-lane swing amounts for the synth Euclidean sequencer. */
  setSynthEuclidSwings(swings: number[]) {
    this.synthEuclidSwings = SYNTH_LANE_INDICES.map(i => swings[i] ?? this.synthEuclidSwings[i]) as Quad<number>;
  }

  /** Set evolve configs for the synth Euclidean sequencer (from UI). */
  setSynthEuclidEvolveConfigs(configs: Partial<SynthEvolveConfig>[]) {
    this.synthEvolveConfigs = this.synthEvolveConfigs.map((current, i) => ({
      ...current,
      ...(configs[i] ?? {}),
    })) as Quad<SynthEvolveConfig>;
  }

  /** Set per-lane sub-lane enabled state for synth Euclidean sequencer. */
  setSynthSubLaneEnabled(states: Record<string, boolean>[]) {
    this.synthSubLaneEnabled = SYNTH_LANE_INDICES.map(i => ({ ...(states[i] ?? {}) })) as Quad<Record<string, boolean>>;
  }

  /** Register callback for synth evolve trigger (UI flash). */
  setSynthEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void) {
    this.onSynthEvolveTrigger = callback;
  }

  /** Register callback for synth evolve overrides push-back to UI. */
  setSynthEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: Partial<SynthLaneOverrides>) => void) {
    this.onSynthEvolveOverridesChanged = callback;
  }

  /** Update per-lane pitch settings for MIDI↔offset conversion at evolve boundary. */
  setSynthPitchSettings(settings: { mode: PitchMode; root: number; scale: ScaleName }[]) {
    this.synthPitchSettings = SYNTH_LANE_INDICES.map(i => ({ ...(settings[i] ?? this.synthPitchSettings[i]) })) as Quad<{ mode: PitchMode; root: number; scale: ScaleName }>;
  }

  /** Register callback for noteRange evolve push-back to UI. */
  setSynthNoteRangeEvolvedCallback(callback: (laneIndex: number, noteMin: number, noteMax: number) => void) {
    this.onSynthNoteRangeEvolved = callback;
  }

  /** Register callback for drum evolve overrides push-back to UI. */
  setDrumEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: Partial<DrumStepOverrides>) => void) {
    if (this.drumSynth) {
      this.drumSynth.setEvolveOverridesChangedCallback(callback);
    }
    // Store for late-init
    this.pendingDrumEvolveOverridesCallback = callback;
  }
  private pendingDrumEvolveOverridesCallback: ((laneIndex: number, overrides: Partial<DrumStepOverrides>) => void) | null = null;

  /** Reset a single synth lane's overrides to its home snapshot. */
  resetSynthEuclidLaneHome(laneIndex: number) {
    const state = this.synthEvolveStates[laneIndex];
    if (!state?.home) return;
    const laneOv = this.extractSynthLaneOverrides(laneIndex);
    const restored = resetSynthLaneToHome(laneOv, state);
    // Home snapshot is in offsets — convert pitch to MIDI for engine storage
    const ps = this.synthPitchSettings[laneIndex];
    const midiRestored: SynthLaneOverrides = { ...restored };
    if (restored.pitch && ps && ps.mode !== 'noteRange') {
      midiRestored.pitch = this.offsetsToMidi(restored.pitch, ps);
    }
    this.applySynthLaneOverrides(laneIndex, midiRestored);
    // Push offsets to UI (no conversion needed)
    this.onSynthEvolveOverridesChanged?.(laneIndex, restored);
    if (state.homeSwing !== undefined) {
      this.synthEuclidSwings[laneIndex] = state.homeSwing;
    }
    // Reset noteRange override and notify UI to restore home bounds
    if (state.homeNoteRangeMin !== null && state.homeNoteRangeMax !== null) {
      this.synthNoteRangeOverrides[laneIndex] = null;
      this.onSynthNoteRangeEvolved?.(laneIndex, state.homeNoteRangeMin, state.homeNoteRangeMax);
    } else {
      this.synthNoteRangeOverrides[laneIndex] = null;
    }
  }

  /** Dice: regenerate synth lane with fresh random overrides, capture as new home. */
  diceSynthEuclidLane(laneIndex: number, intensity: number = 1) {
    const totalSteps = this.synthEuclidTotalStepCounts[laneIndex] || 16;
    const rng = Math.random;
    const inten = clampVal(intensity, 0, 1);

    const currentOv = this.extractSynthLaneOverrides(laneIndex);
    // Convert current pitch from MIDI to offsets for blending with offset-based targets
    const ps = this.synthPitchSettings[laneIndex];
    const currentPitchOffsets = (currentOv.pitch && ps && ps.mode !== 'noteRange')
      ? this.midiToOffsets(currentOv.pitch, ps) : currentOv.pitch;

    // Generate targets (in offset space), blend with current offsets by intensity
    const newPitchOffsets = blendDiceValues(currentPitchOffsets, generateDicePitchOffsets(totalSteps, 4, rng, inten), inten).map(Math.round);
    const newOv: SynthLaneOverrides = {
      pitch: newPitchOffsets,
      pitchDirection: null,
      triggerToggles: new Map<number, boolean>(),
      expression: blendDiceValues(currentOv.expression, generateDiceValues(totalSteps, rng, inten), inten),
      expressionDirection: null,
      morph: blendDiceValues(currentOv.morph, generateDiceValues(totalSteps, rng, inten), inten),
      morphDirection: null,
      distance: blendDiceValues(currentOv.distance, generateDiceValues(totalSteps, rng, inten), inten),
      distanceDirection: null,
      probability: blendDiceValues(
        currentOv.probability,
        Array.from({ length: totalSteps }, () => clampVal(0.7 + (rng() - 0.5) * 0.4, 0.3, 1.0)),
        inten,
      ),
      ratchet: blendDiceValues(
        currentOv.ratchet,
        Array.from({ length: totalSteps }, () => rng() < 0.2 ? Math.ceil(rng() * 3) + 1 : 1),
        inten,
      ).map(Math.round),
    };

    // Random trigger toggle sparse pattern (scaled by intensity)
    for (let i = 0; i < totalSteps; i++) {
      if (rng() < 0.3 * inten) newOv.triggerToggles.set(i, rng() < 0.5);
    }

    // Convert pitch back to MIDI for engine storage, and push offsets to UI
    const midiOv: SynthLaneOverrides = { ...newOv };
    if (newOv.pitch && ps && ps.mode !== 'noteRange') {
      midiOv.pitch = this.offsetsToMidi(newOv.pitch, ps);
    }
    this.applySynthLaneOverrides(laneIndex, midiOv);
    // Push offsets to UI (no conversion needed)
    this.onSynthEvolveOverridesChanged?.(laneIndex, newOv);

    // Capture offsets as new home
    const state = this.synthEvolveStates[laneIndex];
    if (state) {
      state.home = captureSynthHomeSnapshot(newOv);
      state.homeSwing = this.synthEuclidSwings[laneIndex] ?? 0;
    }
  }

  /** Extract per-lane overrides from the flat synthStepOverrides structure. */
  private extractSynthLaneOverrides(laneIndex: number): SynthLaneOverrides {
    const ov = this.synthStepOverrides;
    return {
      pitch: ov.pitch[laneIndex] ? [...ov.pitch[laneIndex]!] : null,
      pitchDirection: ov.pitchDirection[laneIndex] ?? null,
      triggerToggles: new Map(ov.triggerToggles[laneIndex]),
      expression: ov.expression[laneIndex] ? [...ov.expression[laneIndex]!] : null,
      expressionDirection: ov.expressionDirection[laneIndex] ?? null,
      morph: ov.morph[laneIndex] ? [...ov.morph[laneIndex]!] : null,
      morphDirection: ov.morphDirection[laneIndex] ?? null,
      distance: ov.distance[laneIndex] ? [...ov.distance[laneIndex]!] : null,
      distanceDirection: ov.distanceDirection[laneIndex] ?? null,
      probability: ov.probability[laneIndex] ? [...ov.probability[laneIndex]!] : null,
      ratchet: ov.ratchet[laneIndex] ? [...ov.ratchet[laneIndex]!] : null,
    };
  }

  /** Write mutated per-lane overrides back to the flat structure. */
  private applySynthLaneOverrides(laneIndex: number, ov: SynthLaneOverrides) {
    this.synthStepOverrides.pitch[laneIndex] = ov.pitch ? [...ov.pitch] : null;
    this.synthStepOverrides.pitchDirection[laneIndex] = ov.pitchDirection;
    this.synthStepOverrides.triggerToggles[laneIndex] = new Map(ov.triggerToggles);
    this.synthStepOverrides.expression[laneIndex] = ov.expression ? [...ov.expression] : null;
    this.synthStepOverrides.expressionDirection[laneIndex] = ov.expressionDirection;
    this.synthStepOverrides.morph[laneIndex] = ov.morph ? [...ov.morph] : null;
    this.synthStepOverrides.morphDirection[laneIndex] = ov.morphDirection;
    this.synthStepOverrides.distance[laneIndex] = ov.distance ? [...ov.distance] : null;
    this.synthStepOverrides.distanceDirection[laneIndex] = ov.distanceDirection;
    this.synthStepOverrides.probability[laneIndex] = ov.probability ? [...ov.probability] : null;
    this.synthStepOverrides.ratchet[laneIndex] = ov.ratchet ? [...ov.ratchet] : null;
  }

  /** Convert absolute MIDI pitch array → UI offsets (semitone offsets or scale degree indices). */
  private midiToOffsets(midi: number[], ps: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (ps.mode === 'notes') {
      const si = SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11];
      return midi.map(m => {
        const semi = m - ps.root;
        const octave = Math.floor(semi / 12);
        const rem = ((semi % 12) + 12) % 12;
        let bestDeg = 0;
        let bestDist = 99;
        for (let d = 0; d < si.length; d++) {
          const scaleDegree = si[d] ?? rem;
          const dist = Math.abs(scaleDegree - rem);
          if (dist < bestDist) { bestDist = dist; bestDeg = d; }
        }
        return octave * si.length + bestDeg;
      });
    }
    // semitones mode (and noteRange fallback): offset = midi - root
    return midi.map(m => m - ps.root);
  }

  /** Convert UI offsets (semitone offsets or scale degree indices) → absolute MIDI. */
  private offsetsToMidi(offsets: number[], ps: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (ps.mode === 'notes') {
      const si = SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11];
      return offsets.map(deg => {
        const oct = Math.floor(deg / si.length);
        const idx = ((deg % si.length) + si.length) % si.length;
        return Math.max(0, Math.min(127, ps.root + oct * 12 + (si[idx] ?? 0)));
      });
    }
    // semitones mode: midi = root + offset
    return offsets.map(off => Math.max(0, Math.min(127, ps.root + off)));
  }

  /** Set per-lane clock divisions for the drum Euclidean sequencer. */
  setDrumEuclidClockDivs(divs: ClockDivision[]) {
    if (this.drumSynth) {
      this.drumSynth.setEuclidClockDivs(divs);
    }
  }

  /** Set per-lane swing amounts for the drum Euclidean sequencer. */
  setDrumEuclidSwings(swings: number[]) {
    if (this.drumSynth) {
      this.drumSynth.setEuclidSwings(swings);
    }
  }

  setDrumMorphRange(voice: DrumVoiceType, range: { min: number; max: number } | null) {
    // Store for later if drumSynth doesn't exist yet
    this.pendingMorphRanges[voice] = range;
    if (this.drumSynth) {
      this.drumSynth.setMorphRange(voice, range);
    }
  }

  setDrumParamSHRange(key: string, range: { min: number; max: number } | null) {
    if (range) {
      this.pendingParamSHRanges.set(key, range);
    } else {
      this.pendingParamSHRanges.delete(key);
    }
    if (this.drumSynth) {
      this.drumSynth.setParamSHRange(key, range);
    }
  }

  setDrumParamSHTriggerCallback(callback: (voice: DrumVoiceType, key: string, position: number) => void) {
    this.onDrumParamSHTrigger = callback;
    if (this.drumSynth) {
      this.drumSynth.setParamSHTriggerCallback(callback);
    }
  }



  setDrumEuclidEvolveConfigs(configs: Partial<DrumEuclidEvolveConfig>[]) {
    this.pendingDrumEuclidEvolveConfigs = this.pendingDrumEuclidEvolveConfigs.map((current, laneIndex) => ({
      enabled: configs[laneIndex]?.enabled ?? current.enabled,
      everyBars: configs[laneIndex]?.everyBars ?? current.everyBars,
      evolution: configs[laneIndex]?.evolution ?? current.evolution,
      writeOffset: configs[laneIndex]?.writeOffset ?? current.writeOffset,
      mutationMode: configs[laneIndex]?.mutationMode ?? current.mutationMode,
      methods: {
        ...current.methods,
        ...(configs[laneIndex]?.methods || {}),
      },
    }));

    if (this.drumSynth) {
      this.drumSynth.setEuclidEvolveConfigs(this.pendingDrumEuclidEvolveConfigs);
    }
  }

  resetDrumEuclidLaneHome(laneIndex: number) {
    if (this.drumSynth) {
      this.drumSynth.resetEuclidLaneToHome(laneIndex);
    }
  }

  /** Dice: regenerate drum lane with fresh random pattern + values. */
  diceDrumEuclidLane(laneIndex: number, intensity: number = 1) {
    if (this.drumSynth) {
      this.drumSynth.diceEuclidLane(laneIndex, intensity);
    }
  }

  getDrumVoiceAnalyser(voice: DrumVoiceType): AnalyserNode | undefined {
    return this.drumSynth?.getVoiceAnalyser(voice);
  }

  /** Sync full step overrides from the UI sequencer to the audio engine's scheduler */
  setDrumStepOverrides(overrides: DrumStepOverrides) {
    this.pendingStepOverrides = overrides;
    if (this.drumSynth) {
      this.drumSynth.setStepOverrides(overrides);
    }
  }

  /** Set per-lane sub-lane enabled state for drum Euclidean sequencer. */
  setDrumSubLaneEnabled(states: Record<string, boolean>[]) {
    if (this.drumSynth) {
      this.drumSynth.setEuclidSubLaneEnabled(states);
    }
  }

  /**
   * Lazily create AudioContext + DrumSynth so the drum sequencer works
   * independently of the master play button. Synchronous creation;
   * context resume is fire-and-forget.
   */
  ensureDrumSynth(sliderState: SliderState): void {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }
    this.attachAudioContextMonitoring();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.drumSynth) {
      // Need a master gain for drums
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = sliderState.masterVolume ?? 0.7;
        this.limiter = this.createMasterLimiter(this.ctx);
        this.wireMasterOutputChain(this.ctx);
        this.limiter.connect(this.ctx.destination);
      }
      if (!this.reverbNode) {
        // Dummy reverb gain (real reverb is created in full start)
        this.reverbNode = this.ctx.createGain() as any;
      }

      if (!this.rng) {
        const bucket = getUtcBucket(sliderState.seedWindow as 'hour' | 'day' || 'hour');
        const seed = computeSeed(bucket, JSON.stringify(sliderState));
        this.rng = createRng(String(seed));
      }

      this.drumSynth = new DrumSynth(
        this.ctx,
        this.masterGain,
        this.reverbNode as any,
        sliderState,
        this.rng
      );
      // Forward WASM drum node to DrumSynth for trigger routing
      if (this.drumWasmNode) {
        this.drumSynth.setWasmNode(this.drumWasmNode, this.drumWasmReady);
      }
      this.wireDrumSynthCallbacks();
      this.wireDrumGranularSend();
      this.wireDrumDelaySends(this.ctx);
    }
  }

  /** Wire all pending callbacks and overrides onto a freshly-created DrumSynth. */
  private wireDrumSynthCallbacks(): void {
    if (!this.drumSynth) return;
    this.drumSynth.setDrumTriggerCallback(this.drumTriggerRouter);
    if (this.onDrumMorphTrigger) this.drumSynth.setMorphTriggerCallback(this.onDrumMorphTrigger);
    if (this.onDrumParamSHTrigger) this.drumSynth.setParamSHTriggerCallback(this.onDrumParamSHTrigger);
    if (this.onDrumEuclidEvolveTrigger) this.drumSynth.setEuclidEvolveTriggerCallback(this.onDrumEuclidEvolveTrigger);
    if (this.pendingDrumEvolveOverridesCallback) this.drumSynth.setEvolveOverridesChangedCallback(this.pendingDrumEvolveOverridesCallback);
    if (this.onDrumStepPositionChange) this.drumSynth.setStepPositionCallback(this.onDrumStepPositionChange);
    for (const voice of Object.keys(this.pendingMorphRanges) as DrumVoiceType[]) {
      const range = this.pendingMorphRanges[voice];
      if (range) this.drumSynth.setMorphRange(voice, range);
    }
    for (const [key, range] of this.pendingParamSHRanges) {
      this.drumSynth.setParamSHRange(key, range);
    }
    this.drumSynth.setEuclidEvolveConfigs(this.pendingDrumEuclidEvolveConfigs);
    if (this.pendingStepOverrides) {
      this.drumSynth.setStepOverrides(this.pendingStepOverrides);
    }
  }

  /** Connect drum synth pre-fader output to the granular engine's drum send node. */
  private wireDrumGranularSend(): void {
    if (!this.drumSynth || !this.granularDrumSend || !this.granularFxInputGain) return;
    try {
      const drumPreFader = this.drumSynth.getPreFaderBus();
      drumPreFader.connect(this.granularDrumSend);
      this.granularDrumSend.connect(this.granularFxInputGain);
    } catch (e) {
      console.warn('Failed to wire drum granular send:', e);
    }
  }

  private notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        isRunning: this.isRunning,
        harmonyState: this.harmonyState,
        currentSeed: this.currentSeed,
        currentBucket: this.currentBucket,
        currentFilterFreq: this.currentFilterFreq,
        currentLfoValue: this.currentLfoValue,
        currentLfo2Value: this.currentLfo2Value,
        cofCurrentStep: this.harmonyState?.cof.currentStep ?? this.cofConfig.currentStep,
        fxOwners: this.getFxOwnerDebugState(),
      });
    }
  }

  // Getter for current filter frequency (for live UI updates)
  getCurrentFilterFreq(): number {
    return this.currentFilterFreq;
  }

  getCurrentLfoValue(): number {
    return this.currentLfoValue;
  }

  getCurrentLfo2Value(): number {
    return this.currentLfo2Value;
  }

  // Get the MediaStream for iOS background audio (connect to HTML audio element)
  getMediaStream(): MediaStream | null {
    return this.mediaStreamDest?.stream || null;
  }

  private euclideanUsesPadSource(state: SliderState | null | undefined = this.sliderState): boolean {
    if (!state?.synthEuclideanMasterEnabled) return false;
    const isPadSource = (source: string | undefined) => typeof source === 'string' && source.startsWith('synth');
    return (
      (state.synthEuclid1Enabled && isPadSource(state.synthEuclid1Source)) ||
      (state.synthEuclid2Enabled && isPadSource(state.synthEuclid2Source)) ||
      (state.synthEuclid3Enabled && isPadSource(state.synthEuclid3Source)) ||
      (state.synthEuclid4Enabled && isPadSource(state.synthEuclid4Source))
    );
  }

  // Public resume method for iOS media session
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Public suspend method for iOS media session
  suspend(): void {
    if (this.ctx?.state === 'running') {
      this.ctx.suspend();
    }
  }

  // Reset Circle of Fifths drift to home key (step 0)
  // Call this when loading a preset or when morph completes
  resetCofDrift(): void {
    this.cofConfig.currentStep = 0;
    this.cofConfig.phraseCounter = 0;
    this.notifyStateChange();
  }

  // Trigger a drum voice manually for sound design testing
  // Works even when global play is off
  async triggerDrumVoice(voice: DrumVoiceType, velocity: number = 0.8, externalState?: SliderState): Promise<void> {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }
    
    // Resume context if suspended (iOS requirement)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    
    // Use external state if internal is not available
    const stateToUse = this.sliderState ?? externalState;
    if (!stateToUse) {
      console.warn('No slider state available for drum trigger');
      return;
    }
    
    // If we have an existing drumSynth, update its params and use it
    if (this.drumSynth) {
      if (externalState) {
        this.drumSynth.updateParams(externalState);
      }
      this.drumSynth.triggerVoice(voice, velocity);
      return;
    }
    
    // Dispose any previous temp synth immediately (debounce rapid preview taps)
    this.disposeTempDrumSynth();

    // Create a temporary drum synth for testing
    const tempGain = this.ctx.createGain();
    tempGain.gain.value = 1.0;
    tempGain.connect(this.ctx.destination);
    const tempReverb = this.ctx.createGain(); // Dummy reverb node (not connected)

    const rngSource = this.rng ?? Math.random;
    const tempSynth = new DrumSynth(this.ctx, tempGain, tempReverb, stateToUse, () => rngSource());
    tempSynth.triggerVoice(voice, velocity);

    // Store references so stop() and next preview can clean up
    this.tempDrumSynth = tempSynth;
    this.tempDrumGain = tempGain;
    this.tempDrumReverb = tempReverb;
    this.tempDrumSynthTimer = window.setTimeout(() => {
      this.disposeTempDrumSynth();
    }, 2000); // 2s is plenty for any one-shot percussion decay
  }

  /** Tear down the temporary one-shot drum synth and clear its timer */
  private disposeTempDrumSynth(): void {
    if (this.tempDrumSynthTimer !== null) {
      clearTimeout(this.tempDrumSynthTimer);
      this.tempDrumSynthTimer = null;
    }
    if (this.tempDrumSynth) {
      try { this.tempDrumSynth.dispose(); } catch { /* ignore */ }
      this.tempDrumSynth = null;
    }
    if (this.tempDrumGain) {
      try { this.tempDrumGain.disconnect(); } catch { /* ignore */ }
      this.tempDrumGain = null;
    }
    if (this.tempDrumReverb) {
      try { this.tempDrumReverb.disconnect(); } catch { /* ignore */ }
      this.tempDrumReverb = null;
    }
  }

  // Play a silent buffer to unlock iOS audio context
  private unlockAudioContext(): void {
    if (!this.ctx) return;
    
    // Create and play a silent buffer
    const buffer = this.ctx.createBuffer(1, 1, 22050);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(0);
  }

  private attachAudioContextMonitoring(): void {
    if (!this.ctx) return;
    this.ctx.onstatechange = () => {
      if (!this.ctx) return;
      const shouldResume = this.ctx.state === 'suspended' && (
        this.isRunning ||
        this.synthEuclidStarting ||
        this.synthEuclidScheduleTimer !== null ||
        this.granularTempoSyncTimer !== null ||
        this.drumSynth !== null
      );
      if (shouldResume) {
        this.ctx.resume().then(() => {
          console.log('AudioContext auto-resumed after interruption');
        }).catch(e => console.warn('Auto-resume failed:', e));
      }
    };
  }

  async start(sliderState: SliderState): Promise<void> {
    if (this.isRunning || this.isStarting) return;
    this.isStarting = true;

    this.sliderState = sliderState;
    // Eagerly compute the initial JSON snapshot (used for harmony seeding)
    this._sliderStateJsonCache = JSON.stringify(sliderState);
    this._sliderStateJsonDirty = false;

    // If a drum-only context exists from independent drum mode, tear it down.
    // We need a fresh context for the full audio graph (worklets can't be re-added).
    if (this.ctx) {
      if (this.drumSynth) {
        this.drumSynth.dispose();
        this.drumSynth = null;
      }
      if (this.padWasmNode) {
        try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
        try { this.padWasmNode.port.close(); } catch { /* */ }
        try { this.padWasmNode.disconnect(); } catch { /* */ }
      }
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.limiter = null;
      this.reverbNode = null;
      this.reverbOutputGain = null;
      this.sharedDelayA?.dispose();
      this.sharedDelayA = null;
      this.sharedDelayB?.dispose();
      this.sharedDelayB = null;
      this.sharedDelayGranularLinksWired = false;
      // Null lead chain (createAudioGraph will recreate them)
      this.leadGain = null;
      this.leadFilter = null;
      this.leadDry = null;
      this.pad1DelayASend = null;
      this.pad1DelayBSend = null;
      this.pad2DelayASend = null;
      this.pad2DelayBSend = null;
      this.lead1DelayASend = null;
      this.lead1DelayBSend = null;
      this.lead2DelayASend = null;
      this.lead2DelayBSend = null;
      this.drumDelayASend = null;
      this.drumDelayBSend = null;
      this.granularDelayASend = null;
      this.sharedGranularDelayBSend = null;
      // Null pad synth chain
      this.synthBus = null;
      this.dryBus = null;
      this.pad1ReverbSend = null;
      this.pad2ReverbSend = null;
      this.synthDirect = null;
      this.padWasmNode = null;
      this.padWasmReady = false;
      this.oceanDelayASend = null;
      this.oceanDelayBSend = null;
      this.waterDelayASend = null;
      this.waterDelayBSend = null;
      this.insectsDelayASend = null;
      this.insectsDelayBSend = null;
      this.voices = [];
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.error('Web Audio API not supported');
      this.isStarting = false;
      throw new Error('Web Audio API not supported in this browser');
    }
    // Use 'playback' latency hint on iOS to request larger audio buffers —
    // reduces underruns especially with USB audio interfaces.
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    console.log('AudioContext created, state:', this.ctx.state, 'sampleRate:', this.ctx.sampleRate, 'baseLatency:', (this.ctx as any).baseLatency);
    this.attachAudioContextMonitoring();

    // iOS Safari requires resume to be called in response to user interaction
    if (this.ctx.state === 'suspended') {
      console.log('AudioContext suspended, attempting resume...');
      await this.ctx.resume();
      console.log('AudioContext resumed, state:', this.ctx.state);
    }
    
    // iOS audio unlock with silent buffer
    this.unlockAudioContext();

    // Register worklets with error handling
    // Legacy JS granular worklet REMOVED — all granular processing now handled by Granular FX WASM engine
    console.log('Loading worklets...');
    
    // Load Reverb WASM worklet + binary
    try {
      const reverbWasmUrl = getWorkletUrl('kessho_reverb.wasm');
      const reverbWasmResp = await fetch(reverbWasmUrl);
      if (!reverbWasmResp.ok) throw new Error(`Reverb WASM fetch failed: ${reverbWasmResp.status}`);
      this.wasmReverbBinary = await reverbWasmResp.arrayBuffer();
      await this.ctx.audioWorklet.addModule(reverbWasmWorkletUrl);
      console.log('Reverb WASM worklet loaded (%d KB)', Math.round(this.wasmReverbBinary.byteLength / 1024));
    } catch (e) {
      console.warn('Reverb WASM load failed (non-fatal, reverb will be unavailable):', e);
    }

    // Spectral Freeze WASM worklet
    try {
      const sfWasmUrl = getWorkletUrl('kessho_spectral_freeze.wasm');
      const sfWasmResp = await fetch(sfWasmUrl);
      if (sfWasmResp.ok) {
        this.wasmSpectralFreezeBinary = await sfWasmResp.arrayBuffer();
        await this.ctx.audioWorklet.addModule(spectralFreezeWorkletUrl);
        console.log('Spectral Freeze WASM worklet loaded (%d KB)', Math.round(this.wasmSpectralFreezeBinary.byteLength / 1024));
      }
    } catch (e) {
      console.warn('Spectral Freeze WASM load failed (non-fatal):', e);
    }

    // Soundscapes WASM worklet (water + insects)
    try {
      await this.ctx.audioWorklet.addModule(soundscapesWorkletUrl);
      console.log('Soundscapes WASM worklet loaded');
      const scWasmUrl = getWorkletUrl('kessho_soundscapes.wasm');
      const scWasmResp = await fetch(scWasmUrl);
      if (scWasmResp.ok) {
        this.wasmSoundscapesBinary = await scWasmResp.arrayBuffer();
        console.log('Soundscapes WASM binary loaded (%d KB)', Math.round(this.wasmSoundscapesBinary.byteLength / 1024));
      } else {
        console.warn('Soundscapes WASM binary not available');
      }
    } catch (e) {
      console.warn('Soundscapes (water/insects) worklet not available:', e);
    }

    // Load WASM granular
    try {
      const wasmUrl = getWorkletUrl('kessho_granular.wasm');
      const wasmResp = await fetch(wasmUrl);
      if (!wasmResp.ok) throw new Error(`WASM fetch failed: ${wasmResp.status}`);
      this.wasmGranularBinary = await wasmResp.arrayBuffer();
      await this.ctx.audioWorklet.addModule(granularFxWasmWorkletUrl);
      console.log('Granular FX WASM worklet loaded (%d KB)', Math.round(this.wasmGranularBinary.byteLength / 1024));
    } catch (e) {
      console.error('Failed to load WASM granular:', e);
      console.warn('Granular FX will be unavailable — WASM binary could not be loaded');
    }

    // Load Pad Synth WASM worklet + binary
    try {
      const padWasmUrl = getWorkletUrl('kessho_pad.wasm');
      const padResp = await fetch(padWasmUrl);
      if (padResp.ok) {
        this.wasmPadBinary = await padResp.arrayBuffer();
        await this.ctx.audioWorklet.addModule(padSynthWasmWorkletUrl);
        console.log('Pad Synth WASM worklet loaded (%d KB)', Math.round(this.wasmPadBinary.byteLength / 1024));
      }
    } catch (e) {
      console.warn('Pad Synth WASM load failed (non-fatal, JS voices will be used):', e);
    }

    // Load Lead FM WASM worklet + binary
    try {
      const leadFmWasmUrl = getWorkletUrl('kessho_lead_fm.wasm');
      const leadFmResp = await fetch(leadFmWasmUrl);
      if (leadFmResp.ok) {
        this.wasmLeadFmBinary = await leadFmResp.arrayBuffer();
        await this.ctx.audioWorklet.addModule(leadFmWasmWorkletUrl);
        console.log('Lead FM WASM worklet loaded (%d KB)', Math.round(this.wasmLeadFmBinary.byteLength / 1024));
      }
    } catch (e) {
      console.warn('Lead FM WASM load failed (non-fatal, JS synthesis will be used):', e);
    }

    // Load Drum Synth WASM worklet + binary
    try {
      const drumWasmUrl = getWorkletUrl('kessho_drum.wasm');
      const drumResp = await fetch(drumWasmUrl);
      if (drumResp.ok) {
        this.wasmDrumBinary = await drumResp.arrayBuffer();
        await this.ctx.audioWorklet.addModule(drumSynthWasmWorkletUrl);
        console.log('Drum Synth WASM worklet loaded (%d KB)', Math.round(this.wasmDrumBinary.byteLength / 1024));
      }
    } catch (e) {
      console.warn('Drum Synth WASM load failed (non-fatal, JS synthesis will be used):', e);
    }

    // Create audio graph
    await this.createAudioGraph();

    // Initialize harmony (sets rng)
    this.initializeHarmony();

    // Create drum synth (always fresh — any prior drum-only instance was torn down above)
    if (this.ctx && this.rng && this.masterGain && this.reverbNode) {
      this.drumSynth = new DrumSynth(
        this.ctx,
        this.masterGain,
        this.reverbNode,
        this.sliderState!,
        this.rng
      );
      this.wireDrumSynthCallbacks();
      this.wireDrumGranularSend();
      this.wireDrumDelaySends(this.ctx);
    }

    // Start voices
    this.startVoices();

    // Start phrase scheduling
    this.schedulePhraseUpdates();

    // Start lead morph random-walk updates only when auto morph is actually enabled.
    this.syncLeadMorphRandomWalk();

    // Start lead Euclidean scheduler if enabled
    this.stopSynthEuclidScheduler(); // Reset if already running from independent start
    if (this.sliderState?.synthEuclideanMasterEnabled) {
      this.startSynthEuclidScheduler();
    }
    this.stopGranularTempoSyncScheduler();
    if (this.hasGranularTempoSyncVoices(this.sliderState)) {
      this.startGranularTempoSyncScheduler();
    }
    // Start random lead scheduling if enabled
    if (this.sliderState?.leadRandomEnabled) {
      this.startLeadMelody();
    }

    // Start drum synth if enabled
    if (this.drumSynth) {
      this.drumSynth.start();
    }

    // Media session is now handled in App.tsx for proper iOS support

    this.isRunning = true;
    this.isStarting = false;
    this.notifyStateChange();
  }

  stop(): void {
    if (!this.isRunning) return;

    // Stop CPU perf monitor interval (must be cleared here — survives start/stop otherwise)
    if (this.synthPerfTimer !== null) {
      clearInterval(this.synthPerfTimer);
      this.synthPerfTimer = null;
    }

    // Cancel any pending RAF-batched applyParams
    if (this._applyParamsRaf !== null) {
      cancelAnimationFrame(this._applyParamsRaf);
      this._applyParamsRaf = null;
      this._applyParamsDirty = false;
    }

    // Stop phrase timer
    if (this.phraseTimer !== null) {
      clearTimeout(this.phraseTimer);
      this.phraseTimer = null;
    }

    // Stop lead Euclidean scheduler
    this.stopSynthEuclidScheduler();
    // Stop granular tempo-sync scheduler
    this.stopGranularTempoSyncScheduler();
    this.granularWriteHeadPosition = 0;
    this.granularVoicePositions = [0, 0, 0, 0];
    this.granularActiveGrainCount = 0;
    // Stop lead random melody timer
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    // Clear tracked voice release and ratchet timers
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers.clear();
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers.clear();
    for (let i = 0; i < this.synthVoiceNoteOffTimers.length; i++) {
      const timerId = this.synthVoiceNoteOffTimers[i];
      if (timerId !== null) clearTimeout(timerId);
      this.synthVoiceNoteOffTimers[i] = null;
    }

    // Stop lead morph random-walk timer
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }

    // Stop voices
    for (const voice of this.voices) {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.osc3.stop();
        voice.osc4.stop();
        voice.noise?.stop();
      } catch {
        // Ignore
      }
    }
    this.voices = [];

    // Stop ocean sample
    try {
      this.oceanSampleSource?.stop();
    } catch {
      // Ignore
    }
    this.oceanSampleSource = null;

    if (this.oceanSampleGain) {
      try { this.oceanSampleGain.disconnect(); } catch { /* */ }
      this.oceanSampleGain = null;
    }
    if (this.oceanFilter) {
      try { this.oceanFilter.disconnect(); } catch { /* */ }
      this.oceanFilter = null;
    }
    if (this.oceanLevelGain) {
      try { this.oceanLevelGain.disconnect(); } catch { /* */ }
      this.oceanLevelGain = null;
    }

    // Disconnect soundscapes WASM worklet + gain nodes
    if (this.soundscapesNode) {
      try { this.soundscapesNode.port.close(); } catch { /* */ }
      try { this.soundscapesNode.disconnect(); } catch { /* */ }
      this.soundscapesNode = null;
    }
    this.soundscapesWasmReady = false;
    this._scWaterStarted = false;
    this._scInsects1Started = false;
    this._scInsects2Started = false;
    this._scFireStarted = false;
    this._scInsects1Engine = -1;
    this._scInsects2Engine = -1;
    this._scWaterPreset = -1;
    if (this.waterPreFaderBus) {
      try { this.waterPreFaderBus.disconnect(); } catch { /* */ }
      this.waterPreFaderBus = null;
    }
    if (this.waterLevelGain) {
      try { this.waterLevelGain.disconnect(); } catch { /* */ }
      this.waterLevelGain = null;
    }
    if (this.waterReverbSend) {
      try { this.waterReverbSend.disconnect(); } catch { /* */ }
      this.waterReverbSend = null;
    }
    if (this.insectsPreFaderBus) {
      try { this.insectsPreFaderBus.disconnect(); } catch { /* */ }
      this.insectsPreFaderBus = null;
    }
    if (this.insectsLevelGain) {
      try { this.insectsLevelGain.disconnect(); } catch { /* */ }
      this.insectsLevelGain = null;
    }
    if (this.firePreFaderBus) {
      try { this.firePreFaderBus.disconnect(); } catch { /* */ }
      this.firePreFaderBus = null;
    }
    if (this.fireLevelGain) {
      try { this.fireLevelGain.disconnect(); } catch { /* */ }
      this.fireLevelGain = null;
    }
    if (this.granularWaterSend) {
      try { this.granularWaterSend.disconnect(); } catch { /* */ }
      this.granularWaterSend = null;
    }
    if (this.granularInsectsSend) {
      try { this.granularInsectsSend.disconnect(); } catch { /* */ }
      this.granularInsectsSend = null;
    }
    if (this.oceanReverbSendNode) {
      try { this.oceanReverbSendNode.disconnect(); } catch { /* */ }
      this.oceanReverbSendNode = null;
    }
    if (this.insectsReverbSendNode) {
      try { this.insectsReverbSendNode.disconnect(); } catch { /* */ }
      this.insectsReverbSendNode = null;
    }
    if (this.fireReverbSendNode) {
      try { this.fireReverbSendNode.disconnect(); } catch { /* */ }
      this.fireReverbSendNode = null;
    }
    if (this.earthBus) {
      try { this.earthBus.disconnect(); } catch { /* */ }
      this.earthBus = null;
    }
    if (this.earthLevelGain) {
      try { this.earthLevelGain.disconnect(); } catch { /* */ }
      this.earthLevelGain = null;
    }
    this._messageSignatures.clear();

    // Tear down reverb WASM worklet (free WASM heap + close port)
    if (this.reverbNode) {
      try { (this.reverbNode as AudioWorkletNode).port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { (this.reverbNode as AudioWorkletNode).port.close(); } catch { /* */ }
      try { this.reverbNode.disconnect(); } catch { /* */ }
      this.reverbNode = null;
    }

    // Tear down spectral freeze WASM worklet
    if (this.spectralFreezeNode) {
      try { this.spectralFreezeNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.spectralFreezeNode.port.close(); } catch { /* */ }
      try { this.spectralFreezeNode.disconnect(); } catch { /* */ }
      this.spectralFreezeNode = null;
    }

    // Tear down pad synth WASM worklet
    if (this.padWasmNode) {
      try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.padWasmNode.port.close(); } catch { /* */ }
      try { this.padWasmNode.disconnect(); } catch { /* */ }
      this.padWasmNode = null;
      this.padWasmReady = false;
    }

    // Tear down lead FM WASM worklet
    if (this.leadFmWasmNode) {
      try { this.leadFmWasmNode.port.postMessage({ type: 'allNotesOff' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.close(); } catch { /* */ }
      try { this.leadFmWasmNode.disconnect(); } catch { /* */ }
      this.leadFmWasmNode = null;
      this.leadFmWasmReady = false;
    }

    // Tear down drum synth WASM worklet
    if (this.drumWasmNode) {
      try { this.drumWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.drumWasmNode.port.close(); } catch { /* */ }
      try { this.drumWasmNode.disconnect(); } catch { /* */ }
      this.drumWasmNode = null;
      this.drumWasmReady = false;
    }

    if (this.reverbOutputGain) {
      try { this.reverbOutputGain.disconnect(); } catch { /* */ }
      this.reverbOutputGain = null;
    }
    if (this.satPreGain) { try { this.satPreGain.disconnect(); } catch { /* */ } this.satPreGain = null; }
    if (this.satWaveshaper) { try { this.satWaveshaper.disconnect(); } catch { /* */ } this.satWaveshaper = null; }
    if (this.satPostTone) { try { this.satPostTone.disconnect(); } catch { /* */ } this.satPostTone = null; }
    if (this.satPostGain) { try { this.satPostGain.disconnect(); } catch { /* */ } this.satPostGain = null; }
    this.lastMasterSatMode = null;
    this.sharedDelayA?.dispose();
    this.sharedDelayA = null;
    this.sharedDelayB?.dispose();
    this.sharedDelayB = null;
    this.sharedDelayGranularLinksWired = false;

    // Disconnect synth bus chains
    if (this.synthBus) { try { this.synthBus.disconnect(); } catch { /* */ } this.synthBus = null; }
    if (this.dryBus) { try { this.dryBus.disconnect(); } catch { /* */ } this.dryBus = null; }
    if (this.pad1ReverbSend) { try { this.pad1ReverbSend.disconnect(); } catch { /* */ } this.pad1ReverbSend = null; }
    if (this.pad2ReverbSend) { try { this.pad2ReverbSend.disconnect(); } catch { /* */ } this.pad2ReverbSend = null; }
    if (this.synthDirect) { try { this.synthDirect.disconnect(); } catch { /* */ } this.synthDirect = null; }

    // Disconnect lead synth chain
    if (this.leadGain) { try { this.leadGain.disconnect(); } catch { /* */ } this.leadGain = null; }
    if (this.leadFilter) { try { this.leadFilter.disconnect(); } catch { /* */ } this.leadFilter = null; }
    if (this.leadDry) { try { this.leadDry.disconnect(); } catch { /* */ } this.leadDry = null; }
    if (this.leadWasmLevelGain) { try { this.leadWasmLevelGain.disconnect(); } catch { /* */ } this.leadWasmLevelGain = null; }
    if (this.leadWasmLead2LevelGain) { try { this.leadWasmLead2LevelGain.disconnect(); } catch { /* */ } this.leadWasmLead2LevelGain = null; }
    if (this.lead1ReverbSend) { try { this.lead1ReverbSend.disconnect(); } catch { /* */ } this.lead1ReverbSend = null; }
    if (this.lead2ReverbSend) { try { this.lead2ReverbSend.disconnect(); } catch { /* */ } this.lead2ReverbSend = null; }
    if (this.pad1DelayASend) { try { this.pad1DelayASend.disconnect(); } catch { /* */ } this.pad1DelayASend = null; }
    if (this.pad1DelayBSend) { try { this.pad1DelayBSend.disconnect(); } catch { /* */ } this.pad1DelayBSend = null; }
    if (this.pad2DelayASend) { try { this.pad2DelayASend.disconnect(); } catch { /* */ } this.pad2DelayASend = null; }
    if (this.pad2DelayBSend) { try { this.pad2DelayBSend.disconnect(); } catch { /* */ } this.pad2DelayBSend = null; }
    if (this.lead1DelayASend) { try { this.lead1DelayASend.disconnect(); } catch { /* */ } this.lead1DelayASend = null; }
    if (this.lead1DelayBSend) { try { this.lead1DelayBSend.disconnect(); } catch { /* */ } this.lead1DelayBSend = null; }
    if (this.lead2DelayASend) { try { this.lead2DelayASend.disconnect(); } catch { /* */ } this.lead2DelayASend = null; }
    if (this.lead2DelayBSend) { try { this.lead2DelayBSend.disconnect(); } catch { /* */ } this.lead2DelayBSend = null; }
    if (this.drumDelayASend) { try { this.drumDelayASend.disconnect(); } catch { /* */ } this.drumDelayASend = null; }
    if (this.drumDelayBSend) { try { this.drumDelayBSend.disconnect(); } catch { /* */ } this.drumDelayBSend = null; }

    // Tear down Granular FX node + routing gains (prevent orphan worklet processing)
    if (this.granularFxNode) {
      // Tell WASM worklet to free heap before disconnecting
      try { this.granularFxNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.granularFxNode.port.onmessage = null; } catch { /* */ }
      try { this.granularFxNode.port.close(); } catch { /* */ }
      try { this.granularFxNode.disconnect(); } catch { /* */ }
      this.granularFxNode = null;
    }
    if (this.granularFxInputGain) { try { this.granularFxInputGain.disconnect(); } catch { /* */ } this.granularFxInputGain = null; }
    if (this.granularFxReverbSend) { try { this.granularFxReverbSend.disconnect(); } catch { /* */ } this.granularFxReverbSend = null; }
    if (this.granularFxReverbLPF) { try { this.granularFxReverbLPF.disconnect(); } catch { /* */ } this.granularFxReverbLPF = null; }
    if (this.granularFxReverbCompressor) { try { this.granularFxReverbCompressor.disconnect(); } catch { /* */ } this.granularFxReverbCompressor = null; }
    if (this.granularFxOutputLPF) { try { this.granularFxOutputLPF.disconnect(); } catch { /* */ } this.granularFxOutputLPF = null; }
    if (this.granularFxDirect) { try { this.granularFxDirect.disconnect(); } catch { /* */ } this.granularFxDirect = null; }

    // Stop granular delay vibrato oscillators (prevent orphaned oscillator leak)
    for (const osc of this.granularDelayVibratoOscs) {
      try { osc.stop(); osc.disconnect(); } catch { /* */ }
    }
    this.granularDelayVibratoOscs = [];
    for (const depth of this.granularDelayVibratoDepths) {
      try { depth.disconnect(); } catch { /* */ }
    }
    this.granularDelayVibratoDepths = [];
    // Disconnect granular delay tap nodes
    for (const tap of this.granularDelayTapNodes) {
      try { tap.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapNodes = [];
    for (const gain of this.granularDelayTapGains) {
      try { gain.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapGains = [];
    for (const panner of this.granularDelayTapPanners) {
      try { panner.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapPanners = [];

    // Disconnect granular delay infrastructure nodes (input/output/feedback/tone)
    if (this.granularDelaySendGain) { try { this.granularDelaySendGain.disconnect(); } catch { /* */ } this.granularDelaySendGain = null; }
    if (this.granularDelayInputNode) { try { this.granularDelayInputNode.disconnect(); } catch { /* */ } this.granularDelayInputNode = null; }
    if (this.granularDelayOutputGain) { try { this.granularDelayOutputGain.disconnect(); } catch { /* */ } this.granularDelayOutputGain = null; }
    if (this.granularDelayDirectGain) { try { this.granularDelayDirectGain.disconnect(); } catch { /* */ } this.granularDelayDirectGain = null; }
    if (this.granularDelayReverbSendGain) { try { this.granularDelayReverbSendGain.disconnect(); } catch { /* */ } this.granularDelayReverbSendGain = null; }
    if (this.granularDelayFeedbackGain) { try { this.granularDelayFeedbackGain.disconnect(); } catch { /* */ } this.granularDelayFeedbackGain = null; }
    if (this.granularDelayToneFilter) { try { this.granularDelayToneFilter.disconnect(); } catch { /* */ } this.granularDelayToneFilter = null; }
    if (this.granularDelayASend) { try { this.granularDelayASend.disconnect(); } catch { /* */ } this.granularDelayASend = null; }
    if (this.sharedGranularDelayBSend) { try { this.sharedGranularDelayBSend.disconnect(); } catch { /* */ } this.sharedGranularDelayBSend = null; }

    // Disconnect per-source send gains
    if (this.granularPad1Send) { try { this.granularPad1Send.disconnect(); } catch { /* */ } this.granularPad1Send = null; }
    if (this.granularPad2Send) { try { this.granularPad2Send.disconnect(); } catch { /* */ } this.granularPad2Send = null; }
    if (this.granularLead1Send) { try { this.granularLead1Send.disconnect(); } catch { /* */ } this.granularLead1Send = null; }
    if (this.granularLead2Send) { try { this.granularLead2Send.disconnect(); } catch { /* */ } this.granularLead2Send = null; }
    if (this.granularDrumSend) { try { this.granularDrumSend.disconnect(); } catch { /* */ } this.granularDrumSend = null; }
    if (this.granularWavesSend) { try { this.granularWavesSend.disconnect(); } catch { /* */ } this.granularWavesSend = null; }
    if (this.oceanDelayASend) { try { this.oceanDelayASend.disconnect(); } catch { /* */ } this.oceanDelayASend = null; }
    if (this.oceanDelayBSend) { try { this.oceanDelayBSend.disconnect(); } catch { /* */ } this.oceanDelayBSend = null; }
    if (this.waterDelayASend) { try { this.waterDelayASend.disconnect(); } catch { /* */ } this.waterDelayASend = null; }
    if (this.waterDelayBSend) { try { this.waterDelayBSend.disconnect(); } catch { /* */ } this.waterDelayBSend = null; }
    if (this.insectsDelayASend) { try { this.insectsDelayASend.disconnect(); } catch { /* */ } this.insectsDelayASend = null; }
    if (this.insectsDelayBSend) { try { this.insectsDelayBSend.disconnect(); } catch { /* */ } this.insectsDelayBSend = null; }

    // Stop drum synth and close everything
    if (this.drumSynth) {
      this.drumSynth.dispose();
      this.drumSynth = null;
    }

    // Clean up any pending temp drum synth from preview tapping
    this.disposeTempDrumSynth();

    // Close AudioContext — full teardown
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.limiter = null;
    this.reverbNode = null;

    this.isRunning = false;
    this.notifyStateChange();
  }

  /** Fully tear down drum synth and audio context (for page unload, etc.) */
  dispose(): void {
    if (this.granularWorkletDispatchTimer !== null) {
      clearTimeout(this.granularWorkletDispatchTimer);
      this.granularWorkletDispatchTimer = null;
    }
    this.pendingGranularWorkletUpdate = null;
    this.stop();
  }

  updateParams(sliderState: SliderState): void {
    // Always update stored state and CoF config, even when not running
    const oldSeedWindow = this.sliderState?.seedWindow;
    this.sliderState = sliderState;
    this._sliderStateJsonDirty = true;
    this.syncLeadMorphRandomWalk();

    // Update Circle of Fifths config from slider state
    this.cofConfig.enabled = sliderState.cofDriftEnabled ?? false;
    this.cofConfig.driftRate = sliderState.cofDriftRate ?? 2;
    this.cofConfig.direction = sliderState.cofDriftDirection ?? 'cw';
    this.cofConfig.range = sliderState.cofDriftRange ?? 3;
    // Reset step if CoF is disabled
    if (!this.cofConfig.enabled) {
      this.cofConfig.currentStep = 0;
      this.cofConfig.phraseCounter = 0;
    }

    // If engine is in the middle of starting, skip all audio operations.
    // start() will apply params with the final sliderState when ready.
    if (this.isStarting) return;

    // Drum synth operates independently of master play (synchronous)
    if (sliderState.drumEnabled || sliderState.drumEuclidMasterEnabled) {
      this.ensureDrumSynth(sliderState);
    }
    if (this.drumSynth) {
      this.drumSynth.updateParams(sliderState);
    }
    // Forward drum params to WASM worklet (if active)
    this.sendDrumWasmParams(sliderState);
    this.sendDrumWasmDelay(sliderState);

    // If drum is completely off and synth sequencer is off and engine isn't running, tear down context
    if (!this.isRunning && !this.isStarting && !sliderState.drumEnabled && !sliderState.drumEuclidMasterEnabled && !sliderState.synthEuclideanMasterEnabled) {
      if (this.drumSynth) {
        this.drumSynth.dispose();
        this.drumSynth = null;
      }
      if (this.ctx) {
        if (this.padWasmNode) {
          try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
          try { this.padWasmNode.port.close(); } catch { /* */ }
          try { this.padWasmNode.disconnect(); } catch { /* */ }
        }
        this.ctx.close();
        this.ctx = null;
        this.masterGain = null;
        this.limiter = null;
        this.satPreGain = null;
        this.satWaveshaper = null;
        this.satPostTone = null;
        this.satPostGain = null;
        this.lastMasterSatMode = null;
        this.reverbNode = null;
        this.reverbOutputGain = null;
        this.sharedDelayA?.dispose();
        this.sharedDelayA = null;
        this.sharedDelayB?.dispose();
        this.sharedDelayB = null;
        this.sharedDelayGranularLinksWired = false;
        // Null lead chain so ensureSynthChain() recreates them with the new context
        this.leadGain = null;
        this.leadFilter = null;
        this.leadDry = null;
        this.pad1DelayASend = null;
        this.pad1DelayBSend = null;
        this.pad2DelayASend = null;
        this.pad2DelayBSend = null;
        this.lead1DelayASend = null;
        this.lead1DelayBSend = null;
        this.lead2DelayASend = null;
        this.lead2DelayBSend = null;
        this.drumDelayASend = null;
        this.drumDelayBSend = null;
        this.granularDelayASend = null;
        this.sharedGranularDelayBSend = null;
        // Null pad synth chain
        this.synthBus = null;
        this.dryBus = null;
        this.pad1ReverbSend = null;
        this.pad2ReverbSend = null;
        this.synthDirect = null;
        this.oceanDelayASend = null;
        this.oceanDelayBSend = null;
        this.waterDelayASend = null;
        this.waterDelayBSend = null;
        this.insectsDelayASend = null;
        this.insectsDelayBSend = null;
        this.padWasmNode = null;
        this.padWasmReady = false;
        this.voices = [];
      }
    }

    // Synth Euclidean scheduler operates independently of master play (like drum sequencer)
    if (sliderState.synthEuclideanMasterEnabled && !this.synthEuclidScheduleTimer) {
      this.startSynthEuclidScheduler();
    } else if (!sliderState.synthEuclideanMasterEnabled && this.synthEuclidScheduleTimer) {
      this.stopSynthEuclidScheduler();
    }

    if (this.isRunning && this.hasGranularTempoSyncVoices(sliderState) && !this.granularTempoSyncTimer) {
      this.startGranularTempoSyncScheduler();
    } else if ((!this.isRunning || !this.hasGranularTempoSyncVoices(sliderState)) && this.granularTempoSyncTimer) {
      this.stopGranularTempoSyncScheduler();
    }

    // Apply non-drum audio parameters if engine is running OR synth Euclidean is active
    // (Euclidean synth runs independently of master play, but needs continuous param updates)
    if (!this.ctx || (!this.isRunning && !sliderState.synthEuclideanMasterEnabled)) return;

    const padActive = sliderState.padEnabled !== false || this.euclideanUsesPadSource(sliderState);

    // If pad output just became fully inactive, release all active synth voices immediately.
    // Euclidean synth lanes can keep pad voices active even when the pad engine toggle is off.
    if (!padActive && this._lastPadEnabled !== false && this.voices.length > 0) {
      const now = this.ctx.currentTime;
      const release = Math.max(0.001, sliderState.synthRelease || 1.0);
      this.voices.forEach((voice, i) => {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
        // Always send WASM noteOff — Euclidean-owned voices may be active in WASM
        // even when JS voice.active is false
        if (this.padWasmReady && this.padWasmNode) {
          this.padWasmNode.port.postMessage({ type: 'noteOff', voiceIndex: i });
        }
      });
    }
    this._lastPadEnabled = padActive;

    // If synth chord sequencer was just disabled, silence all synth voices
    // BUT only if no Euclidean lanes are using synth sources
    if (sliderState.synthChordSequencerEnabled === false && this.voices.length > 0) {
      const isLeadSrc = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
      const euclideanUsesSynth = [
        sliderState.synthEuclid1Enabled && !isLeadSrc(sliderState.synthEuclid1Source),
        sliderState.synthEuclid2Enabled && !isLeadSrc(sliderState.synthEuclid2Source),
        sliderState.synthEuclid3Enabled && !isLeadSrc(sliderState.synthEuclid3Source),
        sliderState.synthEuclid4Enabled && !isLeadSrc(sliderState.synthEuclid4Source),
      ].some(Boolean);

      if (!euclideanUsesSynth) {
        const now = this.ctx.currentTime;
        const release = Math.max(0.001, sliderState.synthRelease || 1.0);
        this.voices.forEach((voice, i) => {
          if (voice.active) {
            voice.envelope.gain.cancelScheduledValues(now);
            voice.envelope.gain.setTargetAtTime(0, now, release / 4);
            voice.active = false;
            if (this.padWasmReady && this.padWasmNode) {
              this.padWasmNode.port.postMessage({ type: 'noteOff', voiceIndex: i });
            }
          }
        });
      }
    }

    // Schedule applyParams via RAF batching — coalesces rapid updates into 1/frame
    this._applyParamsDirty = true;
    if (this._applyParamsRaf === null) {
      this._applyParamsRaf = requestAnimationFrame(() => {
        this._applyParamsRaf = null;
        if (this._applyParamsDirty && this.sliderState) {
          this._applyParamsDirty = false;
          this.applyParams(this.sliderState);
        }
      });
    }

    // (drum synth params already updated above, before isRunning guard)

    // Only recompute seed if seedWindow setting changed (not on every param change)
    if (oldSeedWindow !== sliderState.seedWindow) {
      this.recomputeSeed();
    }
  }

  private async createAudioGraph(): Promise<void> {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // Master chain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.sliderState?.masterVolume ?? 0.7;

    // Limiter (dynamics compressor configured as limiter)
    this.limiter = this.createMasterLimiter(ctx);
    this.wireMasterOutputChain(ctx);

    // Synth bus (before granular)
    this.synthBus = ctx.createGain();

    // Dry bus (bypass granular) - just a splitter, level controlled by synthDirect
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    // Per-pad reverb sends and direct gain (independent, not crossfade)
    this.pad1ReverbSend = ctx.createGain();
    this.pad1ReverbSend.gain.value = this.sliderState?.pad1ReverbSend ?? 0.7;
    this.pad2ReverbSend = ctx.createGain();
    this.pad2ReverbSend.gain.value = this.sliderState?.pad2ReverbSend ?? 0.7;

    this.synthDirect = ctx.createGain();
    this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain

    // All granular processing is handled by the Granular FX WASM engine.
    // The synthBus → dryBus → synthDirect → masterGain path remains for dry pad signal.

    // Reverb WASM worklet
    if (this.wasmReverbBinary) {
      this.reverbNode = new AudioWorkletNode(ctx, 'reverb-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.reverbNode.port.onmessage = (e) => {
        if (e.data.type === 'perf') this.handlePerfMessage(e.data);
        else if (e.data.type === 'wasmReady') console.log('Reverb WASM engine initialized');
      };
      // Send WASM binary to reverb worklet
      const reverbBin = this.wasmReverbBinary;
      this.wasmReverbBinary = null;
      this.reverbNode.port.postMessage({ type: 'wasmBinary', binary: reverbBin }, [reverbBin]);
    } else {
      // Fallback: passthrough gain node when reverb WASM is unavailable
      this.reverbNode = ctx.createGain() as any;
      console.warn('Reverb WASM unavailable — using passthrough (no reverb)');
    }

    // Reverb output level
    this.reverbOutputGain = ctx.createGain();
    this.reverbOutputGain.gain.value = (this.sliderState?.reverbLevel ?? 0.5) * ENGINE_TRIMS.reverb;

    // Reverb input bus — collects all reverb sources (gain stays at 1.0)
    this.reverbInputBus = ctx.createGain();
    this.reverbInputBus.gain.value = 1.0;

    // Direct send — crossfade-controlled path from sources to reverb (used in pre-mode)
    this.reverbDirectSend = ctx.createGain();
    this.reverbDirectSend.gain.value = 1.0;

    // Spectral Freeze WASM worklet
    if (this.wasmSpectralFreezeBinary) {
      this.spectralFreezeNode = new AudioWorkletNode(ctx, 'spectral-freeze-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.spectralFreezeNode.port.onmessage = (e) => {
        if (e.data.type === 'perf') this.handlePerfMessage(e.data);
        else if (e.data.type === 'wasmReady') console.log('Spectral Freeze WASM engine initialized');
      };
      const sfBin = this.wasmSpectralFreezeBinary;
      this.wasmSpectralFreezeBinary = null;
      this.spectralFreezeNode.port.postMessage({ type: 'wasmBinary', binary: sfBin }, [sfBin]);
    }

    // Pad Synth WASM worklet — 4 outputs: [0]=main stereo, [1]=legacy combined reverb send,
    // [2]=Pad 1 pre-fader, [3]=Pad 2 pre-fader
    if (this.wasmPadBinary) {
      this.createPadWasmNode(ctx);
    }

    // Lead FM WASM worklet — 2 outputs: [0]=lead1 stereo, [1]=lead2 stereo (includes shared internal delay)
    if (this.wasmLeadFmBinary) {
      this.leadFmWasmNode = new AudioWorkletNode(ctx, 'lead-fm-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [2, 2],
      });
      this.leadFmWasmNode.port.onmessage = (e) => {
        if (e.data.type === 'wasmReady') {
          this.leadFmWasmReady = true;
          console.log('Lead FM WASM engine initialized');
          // Send initial morphed preset params so WASM has sane defaults
          const initMorphed = morphPresets(
            this.lead1PresetA, this.lead1PresetB,
            0.5, this.sliderState?.lead1AlgorithmMode ?? 'snap',
          );
          this.leadFmWasmNode!.port.postMessage({ type: 'params', params: initMorphed });
          // Send initial delay params
          if (this.sliderState) this.sendLeadFmWasmDelay(this.sliderState);
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        }
      };
      const leadFmBin = this.wasmLeadFmBinary;
      this.wasmLeadFmBinary = null;
      this.leadFmWasmNode.port.postMessage({ type: 'wasmBinary', binary: leadFmBin }, [leadFmBin]);
    }

    // Drum Synth WASM worklet — 2 outputs: [0]=main stereo, [1]=reverb send
    if (this.wasmDrumBinary) {
      this.drumWasmNode = new AudioWorkletNode(ctx, 'drum-synth-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [2, 2],
      });
      this.drumWasmNode.port.onmessage = (e) => {
        if (e.data.type === 'wasmReady') {
          this.drumWasmReady = true;
          console.log('Drum Synth WASM engine initialized');
          // Send initial drum params
          if (this.sliderState) this.sendDrumWasmParams(this.sliderState);
          // Notify DrumSynth that WASM is ready for triggers
          if (this.drumSynth) this.drumSynth.setWasmReady(true);
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        }
      };
      const drumBin = this.wasmDrumBinary;
      this.wasmDrumBinary = null;
      this.drumWasmNode.port.postMessage({ type: 'wasmBinary', binary: drumBin }, [drumBin]);
    }

    // Lead synth (Rhodes/Bell)
    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = (this.sliderState?.leadEnabled || this.sliderState?.leadRandomEnabled || this.sliderState?.synthEuclideanMasterEnabled) ? 1.0 : 0;

    this.leadFilter = ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.value = 4000;
    this.leadFilter.Q.value = 0.7;

    this.leadDry = ctx.createGain();
    this.leadDry.gain.value = 1.0; // Dry-path level lives on lead1/2LevelGain and WASM lead level gains

    // Per-lead reverb sends (tapped from lead1Bus/lead2Bus before shared filter)
    this.lead1ReverbSend = ctx.createGain();
    this.lead1ReverbSend.gain.value = this.sliderState?.lead1ReverbSend ?? 0.5;
    this.lead2ReverbSend = ctx.createGain();
    this.lead2ReverbSend.gain.value = this.sliderState?.lead2ReverbSend ?? 0.5;

    // Waves sample player gain (starts at 0, crossfades in when enabled)
    this.oceanSampleGain = ctx.createGain();
    this.oceanSampleGain.gain.value = 0;

    // Soundscapes WASM worklet — water + insects
    // 3 outputs: [0]=water stereo, [1]=insects dry stereo, [2]=insects pre-fader stereo
    if (this.wasmSoundscapesBinary) {
      this.soundscapesNode = new AudioWorkletNode(ctx, 'soundscapes-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
      });
      const binary = this.wasmSoundscapesBinary;
      this.wasmSoundscapesBinary = null;
      this.soundscapesNode.port.postMessage({ type: 'wasmBinary', binary }, [binary]);
      // Wait for WASM ready handshake
      await new Promise<void>((resolve) => {
        this.soundscapesNode!.port.onmessage = (e) => {
          if (e.data.type === 'wasmReady') {
            this.soundscapesWasmReady = true;
            console.log('Soundscapes WASM engine initialized');
            resolve();
          } else if (e.data.type === 'perf') {
            this.handlePerfMessage(e.data);
          }
        };
      });
      // After WASM ready, set up permanent message handler
      this.soundscapesNode.port.onmessage = (e) => {
        if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        } else if (e.data.type === 'surfTrigger' && this.onGranularSHTrigger) {
          this.onGranularSHTrigger(e.data.positions ?? {});
        }
      };
    }

    // Earth master bus: all Earth engines feed earthBus → earthLevelGain → masterGain
    this.earthBus = ctx.createGain();
    this.earthBus.gain.value = 1.0;
    this.earthLevelGain = ctx.createGain();
    this.earthLevelGain.gain.value = this.sliderState?.earthLevel ?? 1.0;

    // Soundscapes gain nodes — pre-fader buses for reverb/granular taps
    this.waterPreFaderBus = ctx.createGain();
    this.waterPreFaderBus.gain.value = 1.0;
    this.waterLevelGain = ctx.createGain();
    this.waterLevelGain.gain.value = 0;
    this.waterReverbSend = ctx.createGain();
    this.waterReverbSend.gain.value = 0;

    this.insectsPreFaderBus = ctx.createGain();
    this.insectsPreFaderBus.gain.value = 1.0;
    this.insectsLevelGain = ctx.createGain();
    this.insectsLevelGain.gain.value = 0;
    this.firePreFaderBus = ctx.createGain();
    this.firePreFaderBus.gain.value = 1.0;
    this.fireLevelGain = ctx.createGain();
    this.fireLevelGain.gain.value = 0;

    this.oceanLevelGain = ctx.createGain();
    this.oceanLevelGain.gain.value = this.sliderState?.oceanSampleLevel ?? 1.0;

    this.oceanReverbSendNode = ctx.createGain();
    this.oceanReverbSendNode.gain.value = this.sliderState?.oceanReverbSend ?? 0.2;

    this.insectsReverbSendNode = ctx.createGain();
    this.insectsReverbSendNode.gain.value = this.sliderState?.insectsReverbSend ?? 0.15;

    this.fireReverbSendNode = ctx.createGain();
    this.fireReverbSendNode.gain.value = this.sliderState?.fireReverbSend ?? 0.22;

    // Granular FX (unified granular engine)
    try {
      this.granularFxNode = new AudioWorkletNode(ctx, 'granular-fx-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',  // always deliver 2 channels even if sources are mono
      });
      // Listen for position updates and perf reports from worklet
      this.granularFxNode.port.onmessage = (e) => {
        if (e.data.type === 'position') {
          this.granularWriteHeadPosition = e.data.writeHead;
          this.granularVoicePositions = e.data.voices;
          this.granularActiveGrainCount = e.data.activeGrains ?? 0;
          if (e.data.waveform) {
            this.granularBufferWaveform = e.data.waveform;
          }
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        } else if (e.data.type === 'wasmReady') {
          console.log('Granular FX WASM engine initialized');
        }
      };

      // Send WASM binary to worklet
      if (this.wasmGranularBinary) {
        const toTransfer = this.wasmGranularBinary;
        this.wasmGranularBinary = null;
        this.granularFxNode.port.postMessage(
          { type: 'wasmBinary', binary: toTransfer },
          [toTransfer] // transfer ownership
        );
      }
      this.granularFxNode.port.postMessage({ type: 'uiActive', active: this.granularUiActive });

      // Send enablePerf immediately if monitoring is active
      if (this.perfMonitorEnabled) {
        this.granularFxNode.port.postMessage({ type: 'enablePerf', enabled: true });
      }

      this.granularFxInputGain = ctx.createGain();
      this.granularFxInputGain.gain.value = 1.0;

      this.granularFxReverbSend = ctx.createGain();
      this.granularFxReverbSend.gain.value = (this.sliderState?.granularReverbSend ?? 0.3) * ENGINE_TRIMS.granular;

      // Pre-reverb LPF (darkens reverb trail without affecting dry output)
      this.granularFxReverbLPF = ctx.createBiquadFilter();
      this.granularFxReverbLPF.type = 'lowpass';
      this.granularFxReverbLPF.frequency.value = this.sliderState?.granularReverbLPF ?? 4000;
      this.granularFxReverbLPF.Q.value = 0.7;

      // Pre-reverb compressor (tames transient peaks before they hit reverb)
      this.granularFxReverbCompressor = ctx.createDynamicsCompressor();
      this.granularFxReverbCompressor.threshold.value = -24;
      this.granularFxReverbCompressor.ratio.value = 4;
      this.granularFxReverbCompressor.attack.value = 0.003;
      this.granularFxReverbCompressor.release.value = 0.25;
      this.granularFxReverbCompressor.knee.value = 6;

      // Output LPF (tames overall brightness on dry path)
      this.granularFxOutputLPF = ctx.createBiquadFilter();
      this.granularFxOutputLPF.type = 'lowpass';
      this.granularFxOutputLPF.frequency.value = this.sliderState?.granularOutputLPF ?? 12000;
      this.granularFxOutputLPF.Q.value = 0.7;

      this.granularFxDirect = ctx.createGain();
      this.granularFxDirect.gain.value = this.sliderState?.granularEnabled
        ? (this.sliderState?.granularLevel ?? 0.5) * ENGINE_TRIMS.granular
        : 0;

      // Per-source send gain nodes (each source → granularFxInputGain)
      this.granularPad1Send = ctx.createGain();
      this.granularPad1Send.gain.value = this.sliderState?.granularPad1Send ?? 1.0;

      this.granularPad2Send = ctx.createGain();
      this.granularPad2Send.gain.value = this.sliderState?.granularPad2Send ?? 0.0;

      this.granularLead1Send = ctx.createGain();
      this.granularLead1Send.gain.value = this.sliderState?.granularLead1Send ?? 0.0;

      this.granularLead2Send = ctx.createGain();
      this.granularLead2Send.gain.value = this.sliderState?.granularLead2Send ?? 0.0;

      this.granularDrumSend = ctx.createGain();
      this.granularDrumSend.gain.value = this.sliderState?.granularDrumSend ?? 0.0;

      this.granularWavesSend = ctx.createGain();
      this.granularWavesSend.gain.value = this.sliderState?.granularWavesSend ?? 0.0;

      this.granularWaterSend = ctx.createGain();
      this.granularWaterSend.gain.value = this.sliderState?.granularWaterSend ?? 0.0;

      this.granularInsectsSend = ctx.createGain();
      this.granularInsectsSend.gain.value = this.sliderState?.granularInsectsSend ?? 0.0;

      // Note: randomSequence is sent later via sendGranularRandomSequence()
      // (rng is not yet initialized at this point)
    } catch (e) {
      console.warn('Granular FX worklet not available:', e);
    }

    // Create voices
    await this.createVoices();

    // Create pad split buses (post-fader for main mix, pre-fader for granular)
    this.pad1Bus = ctx.createGain();
    this.pad1Bus.gain.value = 1.0;
    this.pad2Bus = ctx.createGain();
    this.pad2Bus.gain.value = 1.0;
    this.pad1PreFaderBus = ctx.createGain();
    this.pad1PreFaderBus.gain.value = 1.0;
    this.pad2PreFaderBus = ctx.createGain();
    this.pad2PreFaderBus.gain.value = 1.0;
    this.lead1Bus = ctx.createGain();
    this.lead1Bus.gain.value = 1.0;
    this.lead2Bus = ctx.createGain();
    this.lead2Bus.gain.value = 1.0;
    this.lead1LevelGain = ctx.createGain();
    this.lead1LevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
    this.lead2LevelGain = ctx.createGain();
    this.lead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;

    // Connect graph:
    // Voices -> mixerGain -> Pad1Bus/Pad2Bus -> SynthBus (post-fader main mix)
    // Voices -> envelope  -> Pad1PreFaderBus/Pad2PreFaderBus -> GranularPadSend (pre-fader granular)
    // Lead notes -> Lead1Bus/Lead2Bus -> per-lead dry faders -> LeadFilter -> LeadVoiceLevel -> LeadDry

    // Route voices to pad buses based on pad2VoiceAssign
    const pad2Assign = this.sliderState?.pad2Enabled
      ? (this.sliderState?.pad2VoiceAssign ?? 0)
      : 0;
    this.lastPad2VoiceAssign = pad2Assign;
    const pad1Bus = this.pad1Bus;
    const pad2Bus = this.pad2Bus;
    const pad1PreFaderBus = this.pad1PreFaderBus;
    const pad2PreFaderBus = this.pad2PreFaderBus;
    if (!pad1Bus || !pad2Bus || !pad1PreFaderBus || !pad2PreFaderBus) return;
    this.voices.forEach((voice, i) => {
      const isPad2 = (pad2Assign & (1 << i)) !== 0;
      // Post-fader: mixerGain → pad bus (for main mix)
      voice.mixerGain.connect(isPad2 ? pad2Bus : pad1Bus);
      // Pre-fader: envelope → pre-fader bus (for granular, independent of pad level)
      voice.envelope.connect(isPad2 ? pad2PreFaderBus : pad1PreFaderBus);
    });

    // Both pad buses feed into synthBus (preserves existing downstream)
    this.pad1Bus.connect(this.synthBus);
    this.pad2Bus.connect(this.synthBus);

    // Pad WASM node outputs (parallel to JS oscillator path — JS voices silenced when WASM active)
    if (this.padWasmNode) {
      this.padWasmNode.connect(this.synthBus, 0);           // output[0] main → synthBus
      if (this.pad1ReverbSend) this.padWasmNode.connect(this.pad1ReverbSend, 2);
      if (this.pad2ReverbSend) this.padWasmNode.connect(this.pad2ReverbSend, 3);
    }

    // Lead buses feed through per-lead level gains into leadFilter.
    // Reverb + delay + granular sends tap from lead1Bus/lead2Bus before the dry-path
    // level gains so FX can still be heard with dry level at 0.
    this.lead1Bus.connect(this.lead1LevelGain);
    this.lead1LevelGain.connect(this.leadFilter);
    this.lead2Bus.connect(this.lead2LevelGain);
    this.lead2LevelGain.connect(this.leadFilter);

    // Per-lead reverb sends (tapped from lead buses before the dry path)
    this.lead1Bus.connect(this.lead1ReverbSend);
    this.lead1ReverbSend.connect(this.reverbInputBus);
    this.lead2Bus.connect(this.lead2ReverbSend);
    this.lead2ReverbSend.connect(this.reverbInputBus);
    this.ensureSharedDelayBuses(ctx);
    this.ensurePadDelaySends(ctx);
    this.ensureLeadDelaySends(ctx);

    this.synthBus.connect(this.dryBus);

    // Legacy JS granular path REMOVED — synthBus no longer feeds granulatorInputGain
    // Dry signal path preserved: synthBus → dryBus → synthDirect → masterGain

    // Granular FX signal path (now the sole granular engine):
    // Pad1PreFaderBus -> GranularPad1Send  ─┐  (pre-fader: independent of pad level)
    // Pad2PreFaderBus -> GranularPad2Send  ─┤
    // Lead1Bus        -> GranularLead1Send ─┤
    // Lead2Bus        -> GranularLead2Send ─┼─> GranularFxInput -> granularFxNode -> granularFxReverbSend -> Reverb
    // DrumMaster      -> GranularDrumSend  ─┤                                -> granularFxDirect -> Master
    // OceanFilter     -> GranularWavesSend ─┘
    if (this.granularFxNode && this.granularFxInputGain && this.granularFxReverbSend && this.granularFxDirect) {
      // Per-source sends → granular input mixer (pad sends are pre-fader)
      if (this.granularPad1Send && this.pad1PreFaderBus) {
        this.pad1PreFaderBus.connect(this.granularPad1Send);
        if (this.padWasmNode) this.padWasmNode.connect(this.granularPad1Send, 2);
        this.granularPad1Send.connect(this.granularFxInputGain);
      }
      if (this.granularPad2Send && this.pad2PreFaderBus) {
        this.pad2PreFaderBus.connect(this.granularPad2Send);
        if (this.padWasmNode) this.padWasmNode.connect(this.granularPad2Send, 3);
        this.granularPad2Send.connect(this.granularFxInputGain);
      }
      if (this.granularLead1Send && this.lead1Bus) {
        this.lead1Bus.connect(this.granularLead1Send);
        this.granularLead1Send.connect(this.granularFxInputGain);
      }
      if (this.granularLead2Send && this.lead2Bus) {
        this.lead2Bus.connect(this.granularLead2Send);
        this.granularLead2Send.connect(this.granularFxInputGain);
      }
      // DrumSynth send is connected in wireDrumGranularSend() after drumSynth creation
      // Waves send is connected below after oceanFilter creation

      this.granularFxInputGain.connect(this.granularFxNode);
      // Reverb path: node → LPF → compressor → reverbSend gain → reverb
      this.granularFxNode.connect(this.granularFxReverbLPF!);
      this.granularFxReverbLPF!.connect(this.granularFxReverbCompressor!);
      this.granularFxReverbCompressor!.connect(this.granularFxReverbSend);
      this.granularFxReverbSend.connect(this.reverbInputBus);
      // Dry path: node → output LPF → direct gain → master
      this.granularFxNode.connect(this.granularFxOutputLPF!);
      this.granularFxOutputLPF!.connect(this.granularFxDirect);
      this.granularFxDirect.connect(this.masterGain);

      // Shared delay buses — first slice keeps the current lead/granular controls as the frontend.
      this.ensureSharedDelayBuses(ctx);
      this.ensureGranularDelaySends(ctx);
    }

    // Pre-fader reverb sends: tap from per-pad buses (independent of pad level)
    if (this.pad1PreFaderBus && this.pad1ReverbSend) this.pad1PreFaderBus.connect(this.pad1ReverbSend);
    if (this.pad2PreFaderBus && this.pad2ReverbSend) this.pad2PreFaderBus.connect(this.pad2ReverbSend);
    this.dryBus.connect(this.synthDirect);
    
    this.pad1ReverbSend?.connect(this.reverbInputBus);
    this.pad2ReverbSend?.connect(this.reverbInputBus);
    this.synthDirect.connect(this.masterGain);

    // Reverb output to master (always connected)
    this.reverbOutputGain.connect(this.masterGain);

    // Spectral Freeze routing sets up reverbInputBus → reverbNode → reverbOutputGain
    // (and optionally inserts spectralFreezeNode in pre or post position)
    this.applySpectralFreezeRouting();

    // Lead synth dry path:
    // Lead1/2Bus -> per-lead level gain -> LeadFilter -> LeadVoiceLevel (final trim) -> LeadDry -> Master
    // Reverb + granular + shared Delay A/B sends tap upstream from lead1Bus/lead2Bus.
    this.leadVoiceLevel = ctx.createGain();
    this.leadVoiceLevel.gain.value = ENGINE_TRIMS.lead;
    this.leadFilter.connect(this.leadVoiceLevel);
    this.leadVoiceLevel.connect(this.leadDry);
    this.leadDry.connect(this.masterGain);

    // Lead FM WASM node outputs (parallel to JS lead path — JS lead silenced when WASM active)
    // WASM has 2 outputs: [0]=lead1 stereo, [1]=lead2 stereo.
    // Each output routes through per-lead level gain → leadVoiceLevel → master (bypassing leadFilter
    // since WASM applies its own internal filter). Send taps come directly from the WASM outputs,
    // so the FX feed remains available even when the dry fader is at 0.
    if (this.leadFmWasmNode) {
      // Lead 1 dry path: output[0] → per-lead level gain → leadVoiceLevel → leadDry → master
      this.leadWasmLevelGain = ctx.createGain();
      this.leadWasmLevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
      this.leadFmWasmNode.connect(this.leadWasmLevelGain, 0);
      this.leadWasmLevelGain.connect(this.leadVoiceLevel!);
      // Lead 1 pre-fader sends
        this.leadFmWasmNode.connect(this.lead1ReverbSend!, 0);
        if (this.granularLead1Send) {
          this.leadFmWasmNode.connect(this.granularLead1Send, 0);
        }
        if (this.lead1DelayASend) {
          this.leadFmWasmNode.connect(this.lead1DelayASend, 0);
        }
        if (this.lead1DelayBSend) {
          this.leadFmWasmNode.connect(this.lead1DelayBSend, 0);
        }

      // Lead 2 dry path: output[1] → per-lead level gain → leadVoiceLevel → leadDry → master
      this.leadWasmLead2LevelGain = ctx.createGain();
      this.leadWasmLead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
      this.leadFmWasmNode.connect(this.leadWasmLead2LevelGain, 1);
      this.leadWasmLead2LevelGain.connect(this.leadVoiceLevel!);
      // Lead 2 pre-fader sends
        this.leadFmWasmNode.connect(this.lead2ReverbSend!, 1);
        if (this.granularLead2Send) {
          this.leadFmWasmNode.connect(this.granularLead2Send, 1);
        }
        if (this.lead2DelayASend) {
          this.leadFmWasmNode.connect(this.lead2DelayASend, 1);
        }
        if (this.lead2DelayBSend) {
          this.leadFmWasmNode.connect(this.lead2DelayBSend, 1);
        }
      }

    // Drum Synth WASM node outputs (parallel to JS DrumSynth — JS drums silenced when WASM active)
    if (this.drumWasmNode) {
      this.drumWasmNode.connect(this.masterGain, 0);       // output[0] main → master
      this.drumWasmNode.connect(this.reverbInputBus, 1);   // output[1] reverb send
      // Tap main output into granular FX (post-fader; JS drums use pre-fader but WASM has no 3rd output)
      if (this.granularDrumSend && this.granularFxInputGain) {
        this.drumWasmNode.connect(this.granularDrumSend, 0);
      }
    }

    // ── Earth routing: Waves + Water + Insects → earthBus → earthLevelGain → masterGain ──
    // All Earth engine sends (reverb, granular) are pre-fader — tapped before per-engine
    // level gains so that turning a fader down doesn't kill send tails.

    // Waves: oceanSampleGain → oceanFilter → [oceanReverbSend, granularWavesSend, oceanLevelGain → earthBus]
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = this.sliderState?.oceanFilterType ?? 'lowpass';
    this.oceanFilter.frequency.value = this.sliderState?.oceanFilterCutoff ?? 8000;
    this.oceanFilter.Q.value = 0.5 + (this.sliderState?.oceanFilterResonance ?? 0.1) * 10;

    this.oceanSampleGain.connect(this.oceanFilter);
    // Reverb send (pre-fader — taps oceanFilter before oceanLevelGain)
    if (this.oceanReverbSendNode) {
      this.oceanFilter.connect(this.oceanReverbSendNode);
      this.oceanReverbSendNode.connect(this.reverbInputBus);
    }
    // Granular send (pre-fader)
    if (this.granularWavesSend && this.granularFxInputGain) {
      this.oceanFilter.connect(this.granularWavesSend);
      this.granularWavesSend.connect(this.granularFxInputGain);
    }
    // Dry path → earthBus
    this.oceanFilter.connect(this.oceanLevelGain!);
    this.oceanLevelGain!.connect(this.earthBus!);

    // Water: soundscapesNode[0] → waterPreFaderBus → [waterReverbSend, granularWaterSend, waterLevelGain → earthBus]
    this.waterPreFaderBus!.connect(this.waterLevelGain!);
    this.waterLevelGain!.connect(this.earthBus!);
    // Reverb send (pre-fader)
    this.waterPreFaderBus!.connect(this.waterReverbSend!);
    this.waterReverbSend!.connect(this.reverbInputBus);
    // Granular send (pre-fader)
    if (this.granularWaterSend && this.granularFxInputGain) {
      this.waterPreFaderBus!.connect(this.granularWaterSend);
      this.granularWaterSend.connect(this.granularFxInputGain);
    }

    // Insects: soundscapesNode[2] → insectsPreFaderBus → [insectsReverbSend, granularInsectsSend]
    //          soundscapesNode[1] → insectsLevelGain → earthBus
    this.insectsLevelGain!.connect(this.earthBus!);
    // Reverb send (pre-fader)
    if (this.insectsReverbSendNode) {
      this.insectsPreFaderBus!.connect(this.insectsReverbSendNode);
      this.insectsReverbSendNode.connect(this.reverbInputBus);
    }
    // Granular send (pre-fader)
    if (this.granularInsectsSend && this.granularFxInputGain) {
      this.insectsPreFaderBus!.connect(this.granularInsectsSend);
      this.granularInsectsSend.connect(this.granularFxInputGain);
    }

    // earthBus → earthLevelGain → masterGain
    this.earthBus!.connect(this.earthLevelGain!);
    this.earthLevelGain!.connect(this.masterGain);

    // Soundscapes WASM → pre-fader buses
    if (this.soundscapesNode) {
      this.soundscapesNode.connect(this.waterPreFaderBus!, 0);     // output[0] water
      this.soundscapesNode.connect(this.insectsLevelGain!, 1);     // output[1] insects dry
      this.soundscapesNode.connect(this.insectsPreFaderBus!, 2);   // output[2] insects pre-fader
    }
    this.ensureSharedDelayBuses(ctx);
    this.ensureEarthDelaySends(ctx);

    this.wireMasterOutputChain(ctx);
    
    // Detect iOS specifically - only iOS needs MediaStream routing for
    // lock-screen/background media session continuity.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.isMobile = isMobile || isIOS;
    
    try { this.limiter.disconnect(); } catch { /* */ }

    if (isIOS) {
      // On iOS: route through MediaStreamDestination only.
      // The HTML audio element will play this stream for lock-screen/background continuity.
      // Do NOT also connect to ctx.destination or you get double audio!
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      this.limiter.connect(this.mediaStreamDest);
      console.log('iOS detected: Audio routed through MediaStream only (for media session continuity)');
    } else {
      // Non-iOS: connect directly to destination for lowest-latency/stable output.
      this.limiter.connect(ctx.destination);
      this.mediaStreamDest = null;
      console.log('Non-iOS detected: Audio routed directly to destination');
    }

    // Load ocean sample asynchronously
    this.loadOceanSample();

    // Note: DrumSynth is created in start() after initializeHarmony() sets rng

    // Apply initial params
    this.applyParams(this.sliderState!);

    // Re-send enablePerf if CPU overlay is active (nodes were just created)
    if (this.perfMonitorEnabled) {
      this.sendEnablePerfToWorklets(true);
    }
  }

  private async createVoices(): Promise<void> {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // Clear any existing voices first (in case of restart)
    for (const voice of this.voices) {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.osc3.stop();
        voice.osc4.stop();
        voice.noise?.stop();
      } catch {
        // Already stopped or never started
      }
    }
    this.voices = [];

    // Create saturation curve
    const saturationCurve = this.createSaturationCurve(this.sliderState?.hardness ?? 0.3);

    // Read new pad params for oscillator waveforms (fall back to legacy mapping)
    const s = this.sliderState;
    const oscAWave = (s?.padOscAWave ?? 'sawtooth') as OscillatorType;
    const oscBWave = (s?.padOscBWave ?? 'triangle') as OscillatorType;
    const subWave = (s?.padSubWave ?? 'sine') as OscillatorType;
    const subEnabled = s?.padSubEnabled ?? false;
    const oscALevel = s?.padOscALevel ?? 0.6;
    const oscBLevel = s?.padOscBLevel ?? 0.4;
    const subLevel = s?.padSubLevel ?? 0.3;

    // Osc Mix crossfade: 0=A only, 0.5=both full, 1=B only
    const oscMix = s?.padOscMix ?? 0.5;
    const aMix = Math.min(1, 2 * (1 - oscMix));
    const bMix = Math.min(1, 2 * oscMix);
    const effectiveALevel = oscALevel * aMix;
    const effectiveBLevel = oscBLevel * bMix;

    for (let i = 0; i < 6; i++) {
      // Oscillators - waveforms from preset params
      const osc1 = ctx.createOscillator();
      osc1.type = oscAWave;

      const osc2 = ctx.createOscillator();
      osc2.type = oscAWave;

      const osc3 = ctx.createOscillator();
      osc3.type = oscBWave;

      const osc4 = ctx.createOscillator();
      osc4.type = subEnabled ? subWave : oscBWave;

      // Per-oscillator gain nodes for mixing
      const osc1Gain = ctx.createGain();
      osc1Gain.gain.value = effectiveALevel;

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = effectiveALevel * 0.8;

      const osc3Gain = ctx.createGain();
      osc3Gain.gain.value = effectiveBLevel;

      const osc4Gain = ctx.createGain();
      osc4Gain.gain.value = subEnabled ? subLevel : effectiveBLevel * 0.8;

      // Noise
      const noiseType = (s?.padNoiseType ?? 'white') as 'white' | 'pink';
      const noiseBuffer = this.createNoiseBuffer(ctx, 2, noiseType);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const noiseLevel = s?.padNoiseLevel ?? 0.15;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = noiseLevel * 0.1;

      // Filter A
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1;

      // Filter B (transparent when disabled: lowpass at 20kHz)
      const filterB = ctx.createBiquadFilter();
      const fbEnabled = s?.padFilterBEnabled ?? false;
      if (fbEnabled) {
        filterB.type = (s?.padFilterBType ?? 'highpass') as BiquadFilterType;
        filterB.frequency.value = s?.padFilterBCutoff ?? 200;
        filterB.Q.value = s?.padFilterBQ ?? 1;
      } else {
        filterB.type = 'lowpass';
        filterB.frequency.value = 20000;
        filterB.Q.value = 0.1;
      }

      // Warmth filter (low shelf - boosts lows for warmth)
      const warmthFilter = ctx.createBiquadFilter();
      warmthFilter.type = 'lowshelf';
      warmthFilter.frequency.value = 250;
      warmthFilter.gain.value = 0;

      // Presence filter (peaking EQ - controls mid-high presence without harshness)
      const presenceFilter = ctx.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.value = 3000;
      presenceFilter.Q.value = 0.8;
      presenceFilter.gain.value = 0;

      // Saturation
      const saturation = ctx.createWaveShaper();
      saturation.curve = saturationCurve;
      saturation.oversample = '2x';

      // Voice gain
      const gain = ctx.createGain();
      gain.gain.value = 0.15;

      // Mod envelope gain (used for amplitude modulation via mod envelope)
      const modEnvGain = ctx.createGain();
      modEnvGain.gain.value = 1.0; // unity = no modulation

      // Envelope gain
      const envelope = ctx.createGain();
      envelope.gain.value = 0;

      // Mixer gain (per-voice level: pad 1 vs pad 2)
      const mixerGain = ctx.createGain();
      mixerGain.gain.value = (s?.synthLevel ?? 0.6) * ENGINE_TRIMS.pad;

      // Connect voice chain: oscs -> oscGains -> filterA -> filterB -> warmth -> presence -> saturation -> gain -> modEnvGain -> envelope -> mixerGain
      osc1.connect(osc1Gain);
      osc2.connect(osc2Gain);
      osc3.connect(osc3Gain);
      osc4.connect(osc4Gain);
      
      osc1Gain.connect(filter);
      osc2Gain.connect(filter);
      osc3Gain.connect(filter);
      osc4Gain.connect(filter);
      
      noise.connect(noiseGain);
      noiseGain.connect(filter);

      filter.connect(filterB);
      filterB.connect(warmthFilter);
      warmthFilter.connect(presenceFilter);
      presenceFilter.connect(saturation);
      saturation.connect(gain);
      gain.connect(modEnvGain);
      modEnvGain.connect(envelope);
      envelope.connect(mixerGain);

      this.voices.push({
        osc1,
        osc2,
        osc3,
        osc4,
        osc1Gain,
        osc2Gain,
        osc3Gain,
        osc4Gain,
        noise,
        noiseGain,
        filter,
        filterB,
        warmthFilter,
        presenceFilter,
        gain,
        saturation,
        modEnvGain,
        envelope,
        mixerGain,
        active: false,
        targetFreq: 0,
      });
    }
  }

  private createNoiseBuffer(ctx: AudioContext, duration: number, type: 'white' | 'pink' = 'white'): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    // Use deterministic noise if we have RNG, otherwise use Math.random
    const rng = this.rng || Math.random;

    // Crossfade length for seamless looping (50ms)
    const fadeLength = Math.floor(sampleRate * 0.05);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      
      if (type === 'pink') {
        // Pink noise using Paul Kellet's refined method (3dB/octave rolloff)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < length; i++) {
          const white = rng() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
      } else {
        // White noise
        for (let i = 0; i < length; i++) {
          data[i] = rng() * 2 - 1;
        }
      }
      
      // Crossfade the end into the beginning for seamless loop
      for (let i = 0; i < fadeLength; i++) {
        const fadeOut = 1 - (i / fadeLength);  // 1 -> 0
        const fadeIn = i / fadeLength;          // 0 -> 1
        
        // Blend end samples with beginning samples
        const endIndex = length - fadeLength + i;
        const startIndex = i;
        
        // Mix: end fades out, start fades in
        const blended = (data[endIndex] ?? 0) * fadeOut + (data[startIndex] ?? 0) * fadeIn;
        data[endIndex] = blended;
      }
    }

    return buffer;
  }

  private createSaturationCurve(hardness: number): Float32Array<ArrayBuffer> {
    const samples = 256;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const drive = 1 + hardness * 3;

    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      // Soft clip with variable drive
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }

    return curve;
  }

  /**
   * Compute LFO value for any waveshape. Mutates `ls` in place for stateful shapes.
   * Returns scaled value in -depth..+depth (or 0 if dest is 'none').
   */
  private computeLfoValue(
    now: number, rate: number, depth: number, wave: string, dest: string,
    ls: { shValue: number; shLastPhase: number; smoothTarget: number; smoothCurrent: number; rwPos: number; rwVel: number; rwLast: number }
  ): number {
    if (dest === 'none' || depth <= 0) return 0;
    const phase = (now * rate) % 1;
    let v = 0;
    switch (wave) {
      case 'sine':
        v = Math.sin(phase * Math.PI * 2); break;
      case 'triangle':
        v = phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4; break;
      case 'sawtooth':
        v = 2 * phase - 1; break;
      case 'square':
        v = phase < 0.5 ? 1 : -1; break;
      case 'sampleHold':
        if (phase < ls.shLastPhase) ls.shValue = Math.random() * 2 - 1;
        ls.shLastPhase = phase;
        v = ls.shValue; break;
      case 'randomSmooth':
        if (phase < ls.shLastPhase) ls.smoothTarget = Math.random() * 2 - 1;
        ls.shLastPhase = phase;
        ls.smoothCurrent += (ls.smoothTarget - ls.smoothCurrent) * 0.05;
        v = ls.smoothCurrent; break;
      case 'randomWalk': {
        const rwNow = performance.now();
        if (rwNow - ls.rwLast >= 100) {
          ls.rwLast = rwNow;
          const spd = rate > 0 ? 0.02 * rate : 0;
          ls.rwVel += (Math.random() - 0.5) * spd * 2;
          ls.rwVel *= 0.92;
          const mx = spd * 4;
          ls.rwVel = Math.max(-mx, Math.min(mx, ls.rwVel));
          ls.rwPos += ls.rwVel;
          ls.rwPos = Math.max(0, Math.min(1, ls.rwPos));
        }
        v = (ls.rwPos - 0.5) * 2; break;
      }
      default:
        v = Math.sin(phase * Math.PI * 2);
    }
    return v * depth;
  }

  private startVoices(): void {
    if (!this.ctx) return;

    for (const voice of this.voices) {
      try {
        voice.osc1.start();
        voice.osc2.start();
        voice.osc3.start();
        voice.osc4.start();
        voice.noise?.start();
      } catch (e) {
        // Already started - this is OK if restarting
        console.warn('Voice already started, skipping');
      }
    }
  }

  private initializeHarmony(): void {
    if (!this.sliderState) return;

    // Compute seed based on time bucket only (not slider values)
    this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
    this.currentSeed = computeSeed(this.currentBucket, 'E_ROOT');
    this.rng = createRng(`${this.currentBucket}|E_ROOT`);

    // Create harmony state with full params (CoF + progression)
    this.harmonyState = createHarmonyState(
      `${this.currentBucket}|E_ROOT`,
      this.sliderState.tension,
      this.sliderState.chordRate,
      this.sliderState.voicingSpread,
      this.sliderState.detune,
      this.sliderState.scaleMode,
      this.sliderState.manualScale,
      this.sliderState.rootNote ?? 4,
      this.sliderState.phraseLength ?? 16,
      this.getHarmonyParams()
    );

    // Sync effective root
    this.effectiveRoot = this.harmonyState.effectiveRoot;

    if (this.sliderState.synthChordSequencerEnabled !== false) {
      this.applyChord(this.harmonyState.currentChord.frequencies);
    }

    // Send random sequence to granulator and granular
    this.sendGranulatorRandomSequence();
    this.sendGranularRandomSequence();

    this.notifyStateChange();
  }

  // Lock/unlock seed to prevent changes during morphing
  setSeedLocked(locked: boolean): void {
    this.seedLocked = locked;
  }

  private recomputeSeed(): void {
    if (!this.sliderState) return;
    if (this.seedLocked) return; // Don't recompute if locked

    this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
    this.currentSeed = computeSeed(this.currentBucket, 'E_ROOT');
    this.rng = createRng(`${this.currentBucket}|E_ROOT`);

    // Send new random sequence to granular (legacy granulator removed)
    this.sendGranularRandomSequence();

    this.notifyStateChange();
  }

  private sendGranulatorRandomSequence(): void {
    // Legacy JS granular engine removed — this is now a no-op
    // Random sequences for grain scheduling are sent via sendGranularRandomSequence()
    return;
  }

  private sendGranularRandomSequence(): void {
    if (!this.granularFxNode || !this.rng) return;

    const sequence = generateRandomSequence(this.rng, 4096);
    this.granularFxNode.port.postMessage({
      type: 'randomSequence',
      sequence,
    });
  }

  private schedulePhraseUpdates(): void {
    this.chordSubTickCount = 0;

    const scheduleNext = () => {
      const phraseLength = this.sliderState?.phraseLength ?? 16;
      const chordRate = this.sliderState?.chordRate ?? 32;

      if (chordRate < phraseLength) {
        // Sub-phrase mode: multiple chord changes per phrase
        const chordsPerPhrase = Math.max(2, Math.round(phraseLength / chordRate));
        const subInterval = phraseLength / chordsPerPhrase;

        this.phraseTimer = window.setTimeout(() => {
          this.chordSubTickCount++;
          const isPhraseBoundary = this.chordSubTickCount >= chordsPerPhrase;
          if (isPhraseBoundary) {
            this.chordSubTickCount = 0;
          }
          this.onHarmonyTick(isPhraseBoundary);
          scheduleNext();
        }, subInterval * 1000);
      } else {
        // Normal mode: timer fires at phrase boundaries
        const timeUntilNext = getTimeUntilNextPhrase(phraseLength);
        this.phraseTimer = window.setTimeout(() => {
          this.onHarmonyTick(true);
          scheduleNext();
        }, timeUntilNext * 1000);
      }
    };

    // First tick: align to next phrase boundary
    const phraseLength = this.sliderState?.phraseLength ?? 16;
    const timeUntilNext = getTimeUntilNextPhrase(phraseLength);
    this.phraseTimer = window.setTimeout(() => {
      this.chordSubTickCount = 0;
      this.onHarmonyTick(true); // First tick is always a phrase boundary
      scheduleNext();
    }, timeUntilNext * 1000);
  }

  private startLeadMorphRandomWalk(): void {
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }

    const updateIntervalMs = 100;
    this.leadMorphTimer = window.setInterval(() => {
      if (!this.sliderState) return;

      const updateLead = (lead: 1 | 2): number | null => {
        const randomWalkEnabled = lead === 1 ? this.sliderState!.lead1MorphAuto : this.sliderState!.lead2MorphAuto;
        if (!randomWalkEnabled) return null;

        const walkState = lead === 1 ? this.leadMorphWalkStates.lead1 : this.leadMorphWalkStates.lead2;
        const phr = Math.max(1, Math.min(32, Number.isFinite(lead === 1 ? this.sliderState!.lead1MorphSpeed : this.sliderState!.lead2MorphSpeed)
          ? (lead === 1 ? this.sliderState!.lead1MorphSpeed : this.sliderState!.lead2MorphSpeed)
          : 8));

        // Parity methodology: same momentum+bounce walk shape as the app-wide random walk,
        // with phrase-speed semantics (higher phrases = slower movement).
        const speedFactor = 1 / phr;

        if (!walkState.initialized) {
          walkState.position = Math.random();
          walkState.velocity = 0;
          walkState.initialized = true;
        }

        walkState.velocity += (Math.random() - 0.5) * 0.01 * speedFactor;
        walkState.velocity *= 0.98;
        walkState.velocity = Math.max(-0.05 * speedFactor, Math.min(0.05 * speedFactor, walkState.velocity));
        walkState.position += walkState.velocity;

        if (walkState.position < 0) {
          walkState.position = 0;
          walkState.velocity = Math.abs(walkState.velocity);
        } else if (walkState.position > 1) {
          walkState.position = 1;
          walkState.velocity = -Math.abs(walkState.velocity);
        }

        return walkState.position;
      };

      const lead1Pos = updateLead(1);
      const lead2Pos = updateLead(2);

      if (this.onLeadMorphTrigger && (lead1Pos !== null || lead2Pos !== null)) {
        this.onLeadMorphTrigger({
          lead1: lead1Pos ?? -1,
          lead2: lead2Pos ?? -1,
        });
      }
    }, updateIntervalMs);
  }

  private stopLeadMorphRandomWalk(): void {
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }
  }

  private syncLeadMorphRandomWalk(): void {
    const autoMorphEnabled = !!this.sliderState && (this.sliderState.lead1MorphAuto || this.sliderState.lead2MorphAuto);
    if (!this.isRunning || !autoMorphEnabled) {
      this.stopLeadMorphRandomWalk();
      return;
    }
    if (this.leadMorphTimer === null) {
      this.startLeadMorphRandomWalk();
    }
  }
  
  /** Build HarmonyParams from current sliderState */
  private getHarmonyParams(): Partial<HarmonyParams> {
    const s = this.sliderState!;
    return {
      cofDriftEnabled: s.cofDriftEnabled ?? false,
      cofDriftRate: s.cofDriftRate ?? 2,
      cofDriftDirection: s.cofDriftDirection ?? 'cw',
      cofDriftRange: s.cofDriftRange ?? 3,
      chordProgressionEnabled: s.chordProgressionEnabled ?? false,
      chordProgressionPattern: s.chordProgressionPattern ?? [0, 3, 4, 0],
      chordProgressionSteps: s.chordProgressionSteps ?? 4,
      chordProgressionHits: s.chordProgressionHits ?? 4,
      chordProgressionPhraseMultiplier: s.chordProgressionPhraseMultiplier ?? 1,
    };
  }

  /**
   * Called on every harmony tick. When isPhraseBoundary is true, also runs
   * phrase-level effects (granulator reseed, drum scale sync, reverb coupling).
   * Sub-phrase ticks only generate chord changes.
   */
  private onHarmonyTick(isPhraseBoundary: boolean): void {
    if (!this.harmonyState || !this.sliderState) return;

    const phraseIndex = getCurrentPhraseIndex(this.sliderState?.phraseLength ?? 16);
    const homeRoot = this.sliderState.rootNote ?? 4;

    // Update harmony state — CoF drift, chord progression, voice leading,
    // and resolution arcs are now handled internally by the harmony module
    const prevChord = this.harmonyState.currentChord;
    this.harmonyState = updateHarmonyState(
      this.harmonyState,
      `${this.currentBucket}|${this.sliderStateJson}|E_ROOT`,
      phraseIndex,
      this.sliderState.tension,
      this.sliderState.chordRate,
      this.sliderState.voicingSpread,
      this.sliderState.detune,
      this.sliderState.scaleMode,
      this.sliderState.manualScale,
      homeRoot,
      this.sliderState.phraseLength ?? 16,
      this.getHarmonyParams(),
      isPhraseBoundary
    );

    // Sync CoF state back to sliderState for UI
    if (this.sliderState.cofCurrentStep !== this.harmonyState.cof.currentStep) {
      this.sliderState = {
        ...this.sliderState,
        cofCurrentStep: this.harmonyState.cof.currentStep
      };
    }

    // Update effective root from harmony module
    this.effectiveRoot = this.harmonyState.effectiveRoot;

    // Sync cofConfig for backward compatibility with any code that reads it
    this.cofConfig.currentStep = this.harmonyState.cof.currentStep;
    this.cofConfig.phraseCounter = this.harmonyState.cof.phraseCounter;

    // Apply new chord with crossfade (if synth chord sequencer is enabled)
    if (this.sliderState.synthChordSequencerEnabled !== false) {
      // Only crossfade if chord actually changed
      const chordChanged = prevChord.midiNotes.join(',') !== this.harmonyState.currentChord.midiNotes.join(',');
      this.applyChord(this.harmonyState.currentChord.frequencies, chordChanged);
    }

    // Phrase-boundary-only effects: granulator reseed, scale sync, reverb coupling
    if (isPhraseBoundary) {
      this.sendGranulatorRandomSequence();
      this.sendGranularRandomSequence();

      if (this.drumSynth) {
        const intervals = this.harmonyState.scaleFamily?.intervals ?? [];
        this.drumSynth.setScaleIntervals([...intervals]);
      }

      // Reverb harmony coupling — trigger transient modulations
      {
        const chordChanged = prevChord.midiNotes.join(',') !== this.harmonyState.currentChord.midiNotes.join(',');
        if (chordChanged && this.sliderState.reverbChordWash) {
          this.reverbWashBoost = 1.0;
        }
        const curTension = this.harmonyState.chordTension ?? 0;
        if (this.sliderState.reverbResolutionBloom && curTension < this.prevReverbTension - 0.15) {
          this.reverbBloomBoost = 1.0;
        }
        this.prevReverbTension = curTension;
      }
    }

    this.notifyStateChange();
  }

  private applyChord(frequencies: number[], crossfade = false): void {
    if (!this.ctx || !this.sliderState || !this.rng) return;

    const state = this.buildPadTriggerState('pad1', this.sliderState) ?? this.getEffectivePadState(this.sliderState);

    // Build set of voice indices owned by active Euclidean synth lanes
    // so we don't overwrite their notes/envelopes
    const euclidOwnedVoices = new Set<number>();
    if (state.synthEuclideanMasterEnabled) {
      const sources = [state.synthEuclid1Source, state.synthEuclid2Source, state.synthEuclid3Source, state.synthEuclid4Source];
      const enables = [state.synthEuclid1Enabled, state.synthEuclid2Enabled, state.synthEuclid3Enabled, state.synthEuclid4Enabled];
      for (const li of SYNTH_LANE_INDICES) {
        const source = sources[li];
        if (enables[li] && source?.startsWith('synth')) {
          const vi = parseInt(source.replace('synth', ''), 10) - 1;
          if (vi >= 0 && vi < 6) euclidOwnedVoices.add(vi);
        }
      }
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const detune = state.detune;
    const waveSpread = state.waveSpread * state.chordRate; // Fraction of chordRate → seconds
    const rng = this.rng; // Capture for use in loop
    const pad2Assign = (state.pad2Enabled && state.pad2VoiceAssign) ? state.pad2VoiceAssign : 0;
    const voiceMask = (state.synthVoiceMask || 63) & ~pad2Assign; // Pad 1 only — exclude Pad 2 voices
    const octaveShift = state.synthOctave || 0; // Octave shift (-2 to +2)
    const octaveMultiplier = Math.pow(2, octaveShift); // 0.25, 0.5, 1, 2, or 4

    // Apply octave shift to all frequencies
    frequencies = frequencies.map(f => f * octaveMultiplier);

    // Per-oscillator octave offsets and Sub settings (Phase 2)
    const oscAOctave = state.padOscAOctave ?? 0;
    const oscBOctave = state.padOscBOctave ?? 0;
    const subOctave = state.padSubOctave ?? -1;
    const subEnabled = state.padSubEnabled ?? false;
    const useNewOsc = state.padOscAWave !== undefined;

    // Get ADSR from synth settings (clamp to ≥0.001 for setTargetAtTime safety)
    const attack = Math.max(0.001, state.synthAttack);
    const decay = Math.max(0.001, state.synthDecay);
    const sustain = state.synthSustain;
    const release = Math.max(0.001, state.synthRelease);

    // Filter frequencies based on voice mask - only include notes for enabled voices
    const enabledFrequencies: number[] = [];
    for (let i = 0; i < Math.min(6, frequencies.length); i++) {
      if (voiceMask & (1 << i)) {
        enabledFrequencies.push(frequencies[i] ?? frequencies[0] ?? 440);
      }
    }
    // If mask would result in no voices, use at least the first frequency
    if (enabledFrequencies.length === 0) {
      enabledFrequencies.push(frequencies[0] ?? 440);
    }

    // Generate random stagger offsets for each voice using the RNG for determinism
    const voiceOffsets: number[] = [];
    this.voices.forEach((_voice) => {
      // Use RNG to get a random offset between 0 and waveSpread
      voiceOffsets.push(rng() * waveSpread);
    });
    // Sort offsets so voices come in at staggered but consistent intervals
    voiceOffsets.sort((a, b) => a - b);

    let padChordTriggered = false;
    this.voices.forEach((voice, i) => {
      // Skip voices owned by Euclidean synth lanes — scheduler drives them
      // Also silence the JS oscillator so it doesn't conflict with WASM output
      if (euclidOwnedVoices.has(i)) {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, 0.02);
          voice.active = false;
        }
        return;
      }

      const isVoiceEnabled = (voiceMask & (1 << i)) !== 0;
      
      if (!isVoiceEnabled) {
        // Silence this voice
        if (voice.active) {
          const startTime = now;
          voice.envelope.gain.cancelScheduledValues(startTime);
          voice.envelope.gain.setTargetAtTime(0, startTime, release / 4);
          voice.active = false;
          if (this.padWasmReady && this.padWasmNode) {
            this.padWasmNode.port.postMessage({ type: 'noteOff', voiceIndex: i });
          }
        }
        return;
      }
      
      // Map enabled voice index to the filtered frequency list
      let enabledIndex = 0;
      for (let j = 0; j < i; j++) {
        if (voiceMask & (1 << j)) enabledIndex++;
      }
      const freq = enabledFrequencies[enabledIndex % enabledFrequencies.length] ?? frequencies[0] ?? 440;
      const voiceDelay = voiceOffsets[i] ?? 0; // Staggered entry time for this voice

      // Calculate frequency values with per-oscillator octave offsets
      const detuneOsc2 = useNewOsc ? -(state.padOscADetune ?? detune) : -detune;
      const detuneOsc3 = useNewOsc ? (state.padOscBDetune ?? detune) : detune;
      const freqOscA = useNewOsc ? freq * Math.pow(2, oscAOctave) : freq;
      const freqOscB = useNewOsc ? freq * Math.pow(2, oscBOctave) : freq;
      const freq1 = freqOscA;                                          // OscA - base
      const freq2 = freqOscA * Math.pow(2, detuneOsc2 / 1200);        // OscA - detuned
      const freq3 = freqOscB * Math.pow(2, detuneOsc3 / 1200);        // OscB - detuned
      const freq4 = useNewOsc
        ? (subEnabled ? freq * Math.pow(2, subOctave) : freqOscB)     // Sub at sub octave, or OscB copy
        : freq;                                                        // Legacy: base freq

      if (crossfade && voice.active) {
        padChordTriggered = true;
        // ADSR crossfade - old notes release while new attack
        const startTime = now + voiceDelay;
        
        // Cancel any scheduled values and start release on old note
        // Keep the old frequency during release!
        voice.envelope.gain.cancelScheduledValues(startTime);
        voice.envelope.gain.setTargetAtTime(0, startTime, release / 4);
        
        // After release completes, change frequency and start new attack
        // Wait for ~3 time constants (95% of release) before changing pitch
        const pitchChangeTime = startTime + release * 0.5;
        
        // Change frequencies at the same time as new attack starts
        voice.osc1.frequency.setValueAtTime(freq1, pitchChangeTime);
        voice.osc2.frequency.setValueAtTime(freq2, pitchChangeTime);
        voice.osc3.frequency.setValueAtTime(freq3, pitchChangeTime);
        voice.osc4.frequency.setValueAtTime(freq4, pitchChangeTime);
        
        // Start new attack from near-zero
        voice.envelope.gain.setTargetAtTime(1.0, pitchChangeTime, attack / 3);
        voice.envelope.gain.setTargetAtTime(sustain, pitchChangeTime + attack, decay / 3);
      } else {
        padChordTriggered = true;
        // Simple ADSR attack - fresh start
        const startTime = now + voiceDelay;
        
        // Set frequencies immediately for this voice
        voice.osc1.frequency.setValueAtTime(freq1, startTime);
        voice.osc2.frequency.setValueAtTime(freq2, startTime);
        voice.osc3.frequency.setValueAtTime(freq3, startTime);
        voice.osc4.frequency.setValueAtTime(freq4, startTime);
        
        // Start envelope from 0 with full attack time
        voice.envelope.gain.cancelScheduledValues(startTime);
        voice.envelope.gain.setValueAtTime(0, startTime);
        voice.envelope.gain.setTargetAtTime(1.0, startTime, attack / 3);
        voice.envelope.gain.setTargetAtTime(sustain, startTime + attack, decay / 3);
      }

      voice.targetFreq = freq;
      voice.active = true;
    });

    if (padChordTriggered) {
      this.reportFxOnset('pad1', 'padChord');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WASM Synth Parameter Forwarding
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create the pad WASM AudioWorkletNode, set up handlers, and send the binary. */
  private createPadWasmNode(ctx: AudioContext): void {
    if (!this.wasmPadBinary) return;
    this.padWasmNode = new AudioWorkletNode(ctx, 'pad-synth-wasm', {
      numberOfInputs: 0,
      numberOfOutputs: 4,
      outputChannelCount: [2, 2, 2, 2],
    });
    this.padWasmReady = false;
    this.padWasmNode.onprocessorerror = () => {
      console.error('[PadSynth-WASM] processorerror fired');
      this.padWasmReady = false;
    };
    this.padWasmNode.port.onmessage = (e) => {
      if (e.data.type === 'wasmReady') {
        this.padWasmReady = true;
        if (this.sliderState) {
          this.sendPadWasmParams(this.sliderState);
          const pad2Assign = (this.sliderState.pad2Enabled && this.sliderState.pad2VoiceAssign)
            ? this.sliderState.pad2VoiceAssign : 0;
          for (let i = 0; i < this.voices.length; i++) {
            const isPad2 = (pad2Assign & (1 << i)) !== 0;
            this.padWasmNode?.port.postMessage({ type: 'voicePad', voiceIndex: i, pad: isPad2 ? 1 : 0 });
          }
        }
      } else if (e.data.type === 'perf') {
        this.handlePerfMessage(e.data);
      } else if (e.data.type === 'error') {
        console.error(`[PadSynth-WASM] ${e.data.stage}: ${e.data.message}`);
      }
    };
    const padBin = this.wasmPadBinary;
    this.wasmPadBinary = null;
    this.padWasmNode.port.postMessage({ type: 'wasmBinary', binary: padBin }, [padBin]);
  }

  /** Forward pad synth params to WASM worklet. The worklet handles pad1/pad2 key extraction. */
  private sendPadWasmParams(s: SliderState): void {
    if (!this.padWasmNode || !this.padWasmReady) return;
    this.postCachedWorkletMessage(
      'pad:params',
      this.padWasmNode,
      {
        type: 'params',
        params: {
          ...s,
          synthLevel: (s.synthLevel ?? 0.6) * ENGINE_TRIMS.pad,
          pad2Level: (s.pad2Level ?? 0.6) * ENGINE_TRIMS.pad,
        },
      },
      {
        synthLevel: (s.synthLevel ?? 0.6) * ENGINE_TRIMS.pad,
        pad2Level: (s.pad2Level ?? 0.6) * ENGINE_TRIMS.pad,
        padMorph: s.padMorph,
        pad2Morph: s.pad2Morph,
        ...Object.fromEntries(PAD_PRESET_PARAM_KEYS.map((key) => [key, s[key as keyof SliderState]])),
        ...Object.fromEntries(Object.values(PAD1_TO_PAD2_ENGINE).map((key) => [key, s[key as keyof SliderState]])),
      }
    );
  }

  /** Ensure pad WASM exists when synth Euclid runs without full engine start(). */
  private async ensurePadWasmForIndependentSynth(): Promise<void> {
    if (!this.ctx || this.padWasmNode || !this.synthBus) return;

    try {
      if (this.padWasmModuleContext !== this.ctx) {
        await this.ctx.audioWorklet.addModule(padSynthWasmWorkletUrl);
        this.padWasmModuleContext = this.ctx;
      }

      if (!this.wasmPadBinary) {
        const padWasmUrl = getWorkletUrl('kessho_pad.wasm');
        const padResp = await fetch(padWasmUrl);
        if (!padResp.ok) throw new Error(`Pad WASM fetch failed: ${padResp.status}`);
        this.wasmPadBinary = await padResp.arrayBuffer();
      }

      this.createPadWasmNode(this.ctx);

      this.padWasmNode!.connect(this.synthBus, 0);
      if (this.pad1ReverbSend) {
        this.padWasmNode!.connect(this.pad1ReverbSend, 2);
      }
      if (this.pad2ReverbSend) {
        this.padWasmNode!.connect(this.pad2ReverbSend, 3);
      }
      if (this.granularPad1Send) {
        this.padWasmNode!.connect(this.granularPad1Send, 2);
      }
      if (this.granularPad2Send) {
        this.padWasmNode!.connect(this.granularPad2Send, 3);
      }
      if (this.pad1DelayASend) {
        this.padWasmNode!.connect(this.pad1DelayASend, 2);
      }
      if (this.pad2DelayASend) {
        this.padWasmNode!.connect(this.pad2DelayASend, 3);
      }
      if (this.pad1DelayBSend) {
        this.padWasmNode!.connect(this.pad1DelayBSend, 2);
      }
      if (this.pad2DelayBSend) {
        this.padWasmNode!.connect(this.pad2DelayBSend, 3);
      }
    } catch (e) {
      console.warn('Independent pad WASM init failed; using JS fallback voices:', e);
    }
  }

  /** Voice type name prefixes for drum slider state extraction. */
  private static readonly DRUM_VOICE_PREFIXES: Record<string, string> = {
    drumSub: 'sub', drumKick: 'kick', drumClick: 'click',
    drumBeepHi: 'beepHi', drumBeepLo: 'beepLo',
    drumNoise: 'noise', drumMembrane: 'membrane',
  };

  /** Forward drum params to WASM worklet. Extracts per-voice param sets from sliderState. */
  private sendDrumWasmParams(s: SliderState): void {
    if (!this.drumWasmNode || !this.drumWasmReady) return;
    const port = this.drumWasmNode.port;
    // Per-voice params: strip 'drumSub'/'drumKick'/etc. prefix, lowercase first char
    for (const [prefix, voice] of Object.entries(AudioEngine.DRUM_VOICE_PREFIXES)) {
      const voiceParams: Record<string, unknown> = {};
      for (const key of Object.keys(s)) {
        if (key.startsWith(prefix) && key.length > prefix.length) {
          const rest = key.slice(prefix.length);
          const paramName = rest.charAt(0).toLowerCase() + rest.slice(1);
          voiceParams[paramName] = (s as unknown as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(voiceParams).length > 0) {
        port.postMessage({ type: 'params', voice, params: voiceParams });
      }
    }
    // Global drum params (S&H aware for drumReverbSend)
    port.postMessage({
      type: 'params',
      params: { masterLevel: s.drumLevel, reverbSend: this.shSampledValues['drumReverbSend'] ?? s.drumReverbSend },
    });
  }

  /** Forward lead FM delay params to WASM worklet. */
  private sendLeadFmWasmDelay(s: SliderState): void {
    if (!this.leadFmWasmNode || !this.leadFmWasmReady) return;
    this.leadFmWasmNode.port.postMessage({
      type: 'delay',
      params: {
        enabled: false,
        timeL: s.delayATime ?? 375,
        timeR: (s.delayATime ?? 375) * (s.delayASpread ?? 1.5),
        feedback: 0,
        mix: 0,
        filter: s.delayAFilter ?? 2000,
        send: 0,
      },
    });
  }

  /** Forward drum delay params to WASM worklet. */
  private sendDrumWasmDelay(s: SliderState): void {
    if (!this.drumWasmNode || !this.drumWasmReady) return;
    if (this.sharedDelayA) {
      this.drumWasmNode.port.postMessage({
        type: 'delay',
        params: {
          enabled: false,
          timeL: 0,
          timeR: 0,
          feedback: 0,
          mix: 0,
          filter: 0,
        },
      });
      return;
    }
    const bpm = getSharedSequencerBpm(s);
    const noteToSec = (note: string, bpm: number) => {
      const beat = 60 / bpm;
      const map: Record<string, number> = {
        '1/4': beat, '1/8': beat / 2, '1/8d': beat * 0.75,
        '1/16': beat / 4, '1/4d': beat * 1.5, '1/2': beat * 2,
        '3/16': beat * 0.375, '1/32': beat / 8,
      };
      return map[note] ?? beat / 2;
    };
    this.drumWasmNode.port.postMessage({
      type: 'delay',
      params: {
        enabled: s.drumDelayEnabled ?? false,
        timeL: noteToSec(s.drumDelayNoteL ?? '1/8d', bpm),
        timeR: noteToSec(s.drumDelayNoteR ?? '1/4', bpm),
        feedback: s.drumDelayFeedback ?? 0.4,
        mix: s.drumDelayMix ?? 0.3,
        filter: 500 * Math.pow(32, s.drumDelayFilter ?? 0.5),
      },
    });
  }

  /**
   * Trigger a single synth voice with a specific frequency.
   * Used by Euclidean sequencer to play individual synth notes.
   * @param voiceIndex Which voice (0-5) to trigger
   * @param frequency Note frequency in Hz
   * @param velocity Volume/intensity (0-1)
   * @param noteDuration Optional duration in seconds; if provided, schedules release after this time
   */
  triggerSynthVoice(voiceIndex: number, frequency: number, velocity: number, noteDuration?: number, padParamsOverride?: SliderState): void {
    if (!this.ctx || !this.sliderState || voiceIndex < 0 || voiceIndex >= 6) return;
    // Euclidean synth lanes can target pad voices even when the pad engine toggle is off.
    if (this.sliderState.padEnabled === false && !this.euclideanUsesPadSource()) return;

    const isPad2Voice = this.sliderState.pad2Enabled && ((this.sliderState.pad2VoiceAssign ?? 0) & (1 << voiceIndex)) !== 0;
    // Don't bake pad level into velocity — WASM C++ applies level to main output only
    // (reverb and granular pre-fader outputs are independent of pad level).
    // JS voices use mixerGain for level, which is set in applyParams.
    const clampedVelocity = Math.max(0, Math.min(1, velocity));
    if (clampedVelocity < 0.001) return;
    this.reportFxOnset(isPad2Voice ? 'pad2' : 'pad1', 'padEuclid');

    // WASM path: send noteOn to pad worklet and skip JS oscillator manipulation
    if (this.padWasmReady && this.padWasmNode) {
      if (padParamsOverride) {
        this.sendPadWasmParams(padParamsOverride);
      }
      // Silence the JS oscillator voice to prevent dual output through synthBus
      if (voiceIndex < this.voices.length) {
        const jsVoice = this.voices[voiceIndex];
        if (jsVoice?.active) {
          const now = this.ctx.currentTime;
          jsVoice.envelope.gain.cancelScheduledValues(now);
          jsVoice.envelope.gain.setTargetAtTime(0, now, 0.02);
          jsVoice.active = false;
        }
      }
      // Increment generation counter — stale noteOff timers with old gen won't fire
      const gen = (this.synthVoiceNoteGen[voiceIndex] ?? 0) + 1;
      this.synthVoiceNoteGen[voiceIndex] = gen;
      this.padWasmNode.port.postMessage({
        type: 'noteOn', voiceIndex, frequency, velocity: clampedVelocity,
      });
      // Schedule noteOff if duration is specified (only fires if gen still matches)
      if (noteDuration !== undefined) {
        const existingTimer = this.synthVoiceNoteOffTimers[voiceIndex];
        if (existingTimer !== null) {
          clearTimeout(existingTimer);
        }
        const noteOffTimerId = window.setTimeout(() => {
          this.synthVoiceNoteOffTimers[voiceIndex] = null;
          if (this.synthVoiceNoteGen[voiceIndex] === gen) {
            this.padWasmNode?.port.postMessage({ type: 'noteOff', voiceIndex });
          }
        }, noteDuration * 1000);
        this.synthVoiceNoteOffTimers[voiceIndex] = noteOffTimerId;
      }
      return;
    }

    // JS fallback path — needs voices to exist
    if (voiceIndex >= this.voices.length) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const voice = this.voices[voiceIndex];
    
    if (!voice) return;
    
    const state = this.sliderState;
    const detune = state.detune;

    // Get ADSR from correct pad (scaled by ratchet factor for tighter envelope)
    // Clamp to ≥0.001 to prevent setTargetAtTime RangeError (timeConstant must be >0)
    const rf = this.synthRatchetFactor;
    const attack = Math.max(0.001, (isPad2Voice ? state.pad2Attack : state.synthAttack) * rf);
    const decay = Math.max(0.001, (isPad2Voice ? state.pad2Decay : state.synthDecay) * rf);
    const peakLevel = clampedVelocity;  // velocity scales the entire envelope amplitude
    const sustain = (isPad2Voice ? state.pad2Sustain : state.synthSustain) * clampedVelocity;
    const release = Math.max(0.001, (isPad2Voice ? state.pad2Release : state.synthRelease) * rf);

    // Apply global octave shift (from correct pad)
    const octaveShift = (isPad2Voice ? state.pad2Octave : state.synthOctave) || 0;
    const octaveMultiplier = Math.pow(2, octaveShift);
    const baseFreq = frequency * octaveMultiplier;

    // Per-oscillator octave offsets
    const oscAOctave = isPad2Voice ? (state.pad2OscAOctave ?? 0) : (state.padOscAOctave ?? 0);
    const oscBOctave = isPad2Voice ? (state.pad2OscBOctave ?? 0) : (state.padOscBOctave ?? 0);
    const subOctave = isPad2Voice ? (state.pad2SubOctave ?? -1) : (state.padSubOctave ?? -1);
    const subEnabled = isPad2Voice ? (state.pad2SubEnabled ?? false) : (state.padSubEnabled ?? false);

    const freqOscA = baseFreq * Math.pow(2, oscAOctave);
    const freqOscB = baseFreq * Math.pow(2, oscBOctave);

    // Calculate frequency values for 4 oscillators
    const detuneOsc2 = -(isPad2Voice ? (state.pad2OscADetune ?? detune) : (state.padOscADetune ?? detune));
    const detuneOsc3 = isPad2Voice ? (state.pad2OscBDetune ?? detune) : (state.padOscBDetune ?? detune);
    const freq1 = freqOscA;                                          // OscA - base
    const freq2 = freqOscA * Math.pow(2, detuneOsc2 / 1200);       // OscA - detuned
    const freq3 = freqOscB * Math.pow(2, detuneOsc3 / 1200);       // OscB - detuned
    const freq4 = subEnabled
      ? baseFreq * Math.pow(2, subOctave)                           // Sub osc at sub octave
      : freqOscB;                                                    // OscB detuned copy

    // If voice is active, crossfade; otherwise fresh attack
    // For ratchet retriggers (synthRatchetFactor < 1), force hard re-attack for distinct hits
    if (voice.active && this.synthRatchetFactor >= 1) {
      // Crossfade - release old note, attack new
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, release / 4);
      
      const pitchChangeTime = now + release * 0.5;
      
      voice.osc1.frequency.setValueAtTime(freq1, pitchChangeTime);
      voice.osc2.frequency.setValueAtTime(freq2, pitchChangeTime);
      voice.osc3.frequency.setValueAtTime(freq3, pitchChangeTime);
      voice.osc4.frequency.setValueAtTime(freq4, pitchChangeTime);
      
      voice.envelope.gain.setTargetAtTime(peakLevel, pitchChangeTime, attack / 3);
      voice.envelope.gain.setTargetAtTime(sustain, pitchChangeTime + attack, decay / 3);
      
      // Schedule release if duration is specified (Euclidean sequencer notes)
      if (noteDuration !== undefined) {
        const releaseTime = now + noteDuration;
        voice.envelope.gain.setTargetAtTime(0, releaseTime, release / 3);
        const relTimerId = window.setTimeout(() => {
          voice.active = false;
          this.voiceReleaseTimers.delete(relTimerId);
        }, (noteDuration + release) * 1000);
        this.voiceReleaseTimers.add(relTimerId);
      }
    } else {
      // Fresh attack
      voice.osc1.frequency.setValueAtTime(freq1, now);
      voice.osc2.frequency.setValueAtTime(freq2, now);
      voice.osc3.frequency.setValueAtTime(freq3, now);
      voice.osc4.frequency.setValueAtTime(freq4, now);
      
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setValueAtTime(0, now);
      voice.envelope.gain.setTargetAtTime(peakLevel, now, attack / 3);
      voice.envelope.gain.setTargetAtTime(sustain, now + attack, decay / 3);
      
      // Schedule release if duration is specified (Euclidean sequencer notes)
      if (noteDuration !== undefined) {
        const releaseTime = now + noteDuration;
        voice.envelope.gain.setTargetAtTime(0, releaseTime, release / 3);
        // Mark voice inactive after release completes
        const relTimerId = window.setTimeout(() => {
          voice.active = false;
          this.voiceReleaseTimers.delete(relTimerId);
        }, (noteDuration + release) * 1000);
        this.voiceReleaseTimers.add(relTimerId);
      }
    }

    // ── Mod Envelope (Phase 2) — per-pad params ──
    const modEnvEnabled = isPad2Voice ? (state.pad2ModEnvEnabled ?? false) : (state.padModEnvEnabled ?? false);
    const modEnvDest = isPad2Voice ? (state.pad2ModEnvDest ?? 'filterCutoff') : (state.padModEnvDest ?? 'filterCutoff');
    if (modEnvEnabled && modEnvDest === 'oscBLevel') {
      const modAttack = Math.max(0.001, isPad2Voice ? (state.pad2ModEnvAttack ?? 0.1) : (state.padModEnvAttack ?? 0.1));
      const modDecay = Math.max(0.001, isPad2Voice ? (state.pad2ModEnvDecay ?? 0.3) : (state.padModEnvDecay ?? 0.3));
      const modSustain = isPad2Voice ? (state.pad2ModEnvSustain ?? 0) : (state.padModEnvSustain ?? 0);
      const modRelease = Math.max(0.001, isPad2Voice ? (state.pad2ModEnvRelease ?? 0.5) : (state.padModEnvRelease ?? 0.5));
      const modDepth = isPad2Voice ? (state.pad2ModEnvDepth ?? 0) : (state.padModEnvDepth ?? 0);
      const rawBaseLevel = isPad2Voice ? (state.pad2OscBLevel ?? 0.4) : (state.padOscBLevel ?? 0.4);
      const mix = isPad2Voice ? (state.pad2OscMix ?? 0.5) : (state.padOscMix ?? 0.5);
      const bMixMod = Math.min(1, 2 * mix);
      const baseLevel = rawBaseLevel * bMixMod;
      
      voice.modEnvGain.gain.cancelScheduledValues(now);
      voice.modEnvGain.gain.setValueAtTime(1.0, now); // keep amplitude modEnvGain at unity for oscBLevel mode
      
      // Apply mod env to osc3Gain (OscB main)
      const peakLevel = Math.max(0, Math.min(1, baseLevel + modDepth));
      const sustainLevel = baseLevel + modDepth * modSustain;
      voice.osc3Gain.gain.cancelScheduledValues(now);
      voice.osc3Gain.gain.setValueAtTime(baseLevel, now);
      voice.osc3Gain.gain.setTargetAtTime(peakLevel, now, modAttack / 3);
      voice.osc3Gain.gain.setTargetAtTime(Math.max(0, sustainLevel), now + modAttack, modDecay / 3);
      
      if (noteDuration !== undefined) {
        voice.osc3Gain.gain.setTargetAtTime(baseLevel, now + noteDuration, modRelease / 3);
      }
    } else if (modEnvEnabled && modEnvDest === 'filterCutoff') {
      // Mod envelope → filter cutoff is handled in applyParams via time-based envelope simulation
      voice.modEnvGain.gain.setValueAtTime(1.0, now);
    } else if (modEnvEnabled && modEnvDest === 'pitch') {
      // Mod envelope → pitch: handled via frequency modulation in applyParams
      voice.modEnvGain.gain.setValueAtTime(1.0, now);
    } else {
      voice.modEnvGain.gain.setValueAtTime(1.0, now);
    }

    voice.targetFreq = baseFreq;
    voice.active = true;
  }

  // Current spectral freeze routing mode (to detect changes)
  private currentSpectralFreezeRouting: 'pre' | 'post' | null = null;

  /**
   * Wire spectral freeze node into the audio graph.
   *
   * Pre-reverb routing:
   *   reverbInputBus → spectralFreezeNode → reverbNode  (frozen/processed signal)
   *   reverbInputBus → reverbDirectSend  → reverbNode  (live signal, crossfade-controlled)
   *   reverbNode → reverbOutputGain
   *
   * Post-reverb routing:
   *   reverbInputBus → reverbNode → spectralFreezeNode → reverbOutputGain
   *
   * Disabled:
   *   reverbInputBus → reverbNode → reverbOutputGain  (direct, no spectral freeze)
   */
  private applySpectralFreezeRouting(): void {
    if (!this.reverbNode || !this.reverbOutputGain || !this.reverbInputBus || !this.reverbDirectSend) return;
    const state = this.sliderState;
    const routing = state?.spectralFreezeRouting ?? 'pre';
    const enabled = state?.spectralFreezeEnabled ?? false;

    // ── Tear down all variable connections ──
    // Disconnect spectral freeze node outputs
    if (this.spectralFreezeNode) {
      try { this.spectralFreezeNode.disconnect(); } catch (_) { /* */ }
    }
    // Disconnect reverbInputBus → spectralFreezeNode (pre-mode input)
    if (this.spectralFreezeNode) {
      try { this.reverbInputBus.disconnect(this.spectralFreezeNode); } catch (_) { /* */ }
    }
    // Disconnect reverbInputBus → reverbNode (direct path)
    try { this.reverbInputBus.disconnect(this.reverbNode); } catch (_) { /* */ }
    // Disconnect reverbInputBus → reverbDirectSend
    try { this.reverbInputBus.disconnect(this.reverbDirectSend); } catch (_) { /* */ }
    // Disconnect reverbDirectSend → reverbNode
    try { this.reverbDirectSend.disconnect(this.reverbNode); } catch (_) { /* */ }
    // Disconnect reverbNode outputs
    try { this.reverbNode.disconnect(); } catch (_) { /* */ }

    // reverbInputBus gain always stays at 1 — crossfade is on reverbDirectSend
    this.reverbInputBus.gain.value = 1.0;

    if (!enabled || !this.spectralFreezeNode) {
      // ── Disabled: direct routing ──
      // reverbInputBus → reverbNode → reverbOutputGain
      this.reverbInputBus.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbOutputGain);
      this.reverbDirectSend.gain.value = 0;  // unused
      this.currentSpectralFreezeRouting = null;
      return;
    }

    if (routing === 'pre') {
      // ── Pre-reverb ──
      // Path 1 (frozen): reverbInputBus → spectralFreezeNode → reverbNode
      this.reverbInputBus.connect(this.spectralFreezeNode);
      this.spectralFreezeNode.connect(this.reverbNode);

      // Path 2 (live crossfade): reverbInputBus → reverbDirectSend → reverbNode
      // crossfade=1 means "fully frozen" = no live bleed, crossfade=0 = full live signal
      this.reverbInputBus.connect(this.reverbDirectSend);
      this.reverbDirectSend.connect(this.reverbNode);
      const crossfade = state?.spectralFreezeReverbCrossfade ?? 0.5;
      this.reverbDirectSend.gain.value = 1.0 - crossfade;

      // Reverb output
      this.reverbNode.connect(this.reverbOutputGain);
    } else {
      // ── Post-reverb ──
      // reverbInputBus → reverbNode → spectralFreezeNode → reverbOutputGain
      this.reverbInputBus.connect(this.reverbNode);
      this.reverbNode.connect(this.spectralFreezeNode);
      this.spectralFreezeNode.connect(this.reverbOutputGain);
      this.reverbDirectSend.gain.value = 0;  // unused
    }

    this.currentSpectralFreezeRouting = routing;
  }

  private applyParams(state: SliderState): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const smoothTime = 0.05;

    // Helper: guard against NaN/Infinity in audio param values (crash prevention)
    const fin = (v: number, fallback: number): number => Number.isFinite(v) ? v : fallback;

    // ── S&H: 10Hz engine-side re-sampling for dual-range params ──
    const shNow = performance.now();
    if (shNow - this.shLastSampleTime >= 100) {
      this.shLastSampleTime = shNow;
      const shPositions: Record<string, number> = {};
      for (const key of Object.keys(this.dualRanges)) {
        if (
          this.isFxOwnershipDrivenKey(key) ||
          this.isPadTriggerDrivenKey(key) ||
          key === 'grainSize' ||
          key === 'waterSurfDuration' ||
          key === 'waterSurfInterval' ||
          key === 'waterSurfFoam' ||
          key === 'waterSurfProximity' ||
          key === 'waterSurfDepth' ||
          key === 'waterSurfBody' ||
          key === 'waterSurfSpray' ||
          key === 'waterSurfFoamBright'
        ) continue; // Surf + grainSize use worklet-side/per-wave sampling
        if (key.startsWith('lead') || key.startsWith('granularLead')) continue; // Lead keys use per-trigger sampling in playLeadNote
        const range = this.dualRanges[key];
        if (range) {
          const sampled = range.min + Math.random() * (range.max - range.min);
          this.shSampledValues[key] = sampled;
          // Normalized 0-1 position within the range
          const span = range.max - range.min;
          shPositions[key] = span > 0 ? (sampled - range.min) / span : 0.5;
        }
      }
      // Clean stale keys no longer in dualRanges
      for (const key of Object.keys(this.shSampledValues)) {
        if (key.startsWith('lead') || key.startsWith('granularLead')) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // active lead keys are managed per-trigger in playLeadNote
        }
        if (this.isPadTriggerDrivenKey(key)) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // pad keys hold their last trigger value until the next pad onset
        }
        if (this.isFxOwnershipDrivenKey(key)) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // owned FX keys hold their last value until the next qualifying onset
        }
        if (
          !this.dualRanges[key] ||
          key === 'grainSize' ||
          key === 'waterSurfDuration' ||
          key === 'waterSurfInterval' ||
          key === 'waterSurfFoam' ||
          key === 'waterSurfProximity' ||
          key === 'waterSurfDepth' ||
          key === 'waterSurfBody' ||
          key === 'waterSurfSpray' ||
          key === 'waterSurfFoamBright'
        ) {
          delete this.shSampledValues[key];
        }
      }
      if (Object.keys(shPositions).length > 0 && this.onGranularSHTrigger) {
        this.onGranularSHTrigger(shPositions);
      }
    }
    // S&H value helper: sampled value if available, else fallback to state value
    const shv = (k: string, v: number) => this.shv(k, v);
    const padState = this.getEffectivePadState(state);

    // Master volume
    this.masterGain?.gain.setTargetAtTime(fin(state.masterVolume, 0.5), now, smoothTime);
    this.applyMasterSaturation(state, now);

    // Voice parameters
    // Filter cutoff modulates between filterCutoffMin and filterCutoffMax
    const minCutoff = Math.min(
      shv('filterCutoffMin', padState.filterCutoffMin ?? 200),
      shv('filterCutoffMax', padState.filterCutoffMax ?? 8000),
    );
    const maxCutoff = Math.max(
      shv('filterCutoffMin', padState.filterCutoffMin ?? 200),
      shv('filterCutoffMax', padState.filterCutoffMax ?? 8000),
    );
    
    // ── LFO computation (Phase 2: all waveshapes, all destinations) ──
    const lfoDepth = shv('padLfo1Depth', padState.padLfo1Depth ?? 0);
    const lfoDest = padState.padLfo1Dest ?? 'none';
    const lfoRate = shv('padLfo1Rate', padState.padLfo1Rate ?? 0.5);
    const lfoWave = padState.padLfo1Wave ?? 'sine';

    // Filter cutoff sits at center of min/max range; LFO adds modulation on top
    const modAmount = 0.5;
    const cutoff = minCutoff + (maxCutoff - minCutoff) * modAmount;
    
    // Q (bandwidth/angle) is set directly from filterQ
    const filterQ = shv('filterQ', padState.filterQ);
    
    // Resonance adds a peak boost at the cutoff frequency, modulated by hardness
    const resonanceBoost = shv('filterResonance', padState.filterResonance) * (0.7 + shv('hardness', padState.hardness) * 0.6);
    
    // Combined Q: base Q plus resonance boost
    // At very low cutoffs, increase Q for more aggressive filtering
    const lowCutoffBoost = cutoff < 200 ? (1 - cutoff / 200) * 4 : 0;
    const effectiveQ = filterQ + resonanceBoost * 8 + lowCutoffBoost;
    
    // Warmth: low shelf boost (0 to +8dB)
    const warmthGain = shv('warmth', padState.warmth) * 8;
    
    // Presence: peaking EQ (-6dB to +6dB) - helps cut or boost mids
    // At 0.5 = neutral, below = cut harsh mids, above = boost presence
    const presenceGain = (shv('presence', padState.presence) - 0.5) * 12;

    // Pad oscillator params
    const oscAWave = (padState.padOscAWave ?? 'sawtooth') as OscillatorType;
    const oscBWave = (padState.padOscBWave ?? 'triangle') as OscillatorType;
    const subEnabled = padState.padSubEnabled ?? false;
    const oscALevel = shv('padOscALevel', padState.padOscALevel ?? 0.6);
    const oscBLevel = shv('padOscBLevel', padState.padOscBLevel ?? 0.4);

    // Osc Mix crossfade: 0=A only, 0.5=both full, 1=B only
    const oscMix = shv('padOscMix', padState.padOscMix ?? 0.5);
    const aMix = Math.min(1, 2 * (1 - oscMix));
    const bMix = Math.min(1, 2 * oscMix);
    const effectiveALevel = oscALevel * aMix;
    const effectiveBLevel = oscBLevel * bMix;

    // ── LFO value computation (via helper) ──
    const lfoValue = this.computeLfoValue(now, lfoRate, lfoDepth, lfoWave, lfoDest, this.lfo1State);

    // Store for UI visualization (real engine value)
    this.currentLfoValue = lfoValue;

    // ── LFO 2 value computation (via helper) ──
    const lfo2Depth = shv('padLfo2Depth', padState.padLfo2Depth ?? 0);
    const lfo2Dest = padState.padLfo2Dest ?? 'none';
    const lfo2Rate = shv('padLfo2Rate', padState.padLfo2Rate ?? 0.5);
    const lfo2Wave = padState.padLfo2Wave ?? 'sine';
    const lfo2Value = this.computeLfoValue(now, lfo2Rate, lfo2Depth, lfo2Wave, lfo2Dest, this.lfo2State);
    this.currentLfo2Value = lfo2Value;

    // ── Build Pad 1 derived param set ──
    const lfo1FiltMod = lfoDest === 'filterCutoff' ? lfoValue * (maxCutoff - minCutoff) * 0.5 : 0;
    const lfo2FiltMod = lfo2Dest === 'filterCutoff' ? lfo2Value * (maxCutoff - minCutoff) * 0.5 : 0;
    let modEnvFilterMod = 0, modEnvPitchCents = 0;
    if ((padState.padModEnvEnabled ?? false) && (shv('padModEnvDepth', padState.padModEnvDepth ?? 0)) !== 0) {
      const mDest = padState.padModEnvDest ?? 'filterCutoff';
      if (mDest === 'filterCutoff' || mDest === 'pitch') {
        const mA = shv('padModEnvAttack', padState.padModEnvAttack ?? 0.1);
        const mD = shv('padModEnvDecay', padState.padModEnvDecay ?? 0.3);
        const mS = shv('padModEnvSustain', padState.padModEnvSustain ?? 0);
        const mCycle = mA + mD + 1, mPh = (now % mCycle) / mCycle;
        const mAP = mA / mCycle, mDP = (mA + mD) / mCycle;
        let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
        mV *= shv('padModEnvDepth', padState.padModEnvDepth ?? 0);
        if (mDest === 'filterCutoff') modEnvFilterMod = mV * (maxCutoff - minCutoff);
        else modEnvPitchCents = mV * 400;
      }
    }

    const p1 = {
      oscAWave, oscBWave, subEnabled, subWave: (padState.padSubWave ?? 'sine') as OscillatorType,
      effectiveALevel: fin(effectiveALevel, 0), effectiveBLevel: fin(effectiveBLevel, 0),
      subLevel: fin(shv('padSubLevel', padState.padSubLevel ?? 0.3), 0.3), noiseLevel: fin(shv('padNoiseLevel', padState.padNoiseLevel ?? 0.15), 0.15),
      fbEnabled: padState.padFilterBEnabled ?? false,
      filterType: padState.filterType as BiquadFilterType,
      finalCutoff: fin(Math.max(20, Math.min(20000, cutoff + lfo1FiltMod + lfo2FiltMod + modEnvFilterMod)), 1000),
      effectiveQ: fin(effectiveQ, 1),
      warmthGain: fin(warmthGain, 0), presenceGain: fin(presenceGain, 0),
      lfoAmpMod: fin(1 + (lfoDest === 'amplitude' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'amplitude' ? lfo2Value * 0.5 : 0), 1),
      lfoPitchCents: fin((lfoDest === 'pitch' ? lfoValue * 200 : 0) + (lfo2Dest === 'pitch' ? lfo2Value * 200 : 0) + modEnvPitchCents, 0),
      lfoOscBMod: fin((lfoDest === 'oscBLevel' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'oscBLevel' ? lfo2Value * 0.5 : 0), 0),
      lfoFilterBMod: fin((lfoDest === 'filterBCutoff' ? lfoValue * 2000 : 0) + (lfo2Dest === 'filterBCutoff' ? lfo2Value * 2000 : 0), 0),
      lfoDest, lfo2Dest,
      modEnvEnabled: padState.padModEnvEnabled ?? false, modEnvDest: padState.padModEnvDest ?? 'filterCutoff',
      oscADetune: shv('padOscADetune', padState.padOscADetune ?? shv('detune', padState.detune)),
      oscBDetune: shv('padOscBDetune', padState.padOscBDetune ?? shv('detune', padState.detune)),
      filterBType: (padState.padFilterBType ?? 'highpass') as BiquadFilterType,
      filterBFreq: fin(shv('padFilterBCutoff', padState.padFilterBCutoff ?? 200), 200),
      filterBResBoost: fin(shv('padFilterBResonance', padState.padFilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(shv('padFilterBQ', padState.padFilterBQ ?? 1), 1),
      filterRouting: padState.padFilterRouting ?? 'series',
      hardness: fin(shv('hardness', padState.hardness), 0.5),
    };

    this.currentFilterFreq = p1.finalCutoff;

    // ── Build Pad 2 derived param set (only when enabled + voices assigned) ──
    const pad2Assign = state.pad2VoiceAssign ?? 0;
    const pad2On = state.pad2Enabled === true;
    let p2 = p1;
    if (pad2On && pad2Assign) {
      const p2l1Dest = (padState.pad2Lfo1Dest ?? 'none') as string;
      const p2l2Dest = (padState.pad2Lfo2Dest ?? 'none') as string;
      const p2l1Val = this.computeLfoValue(now, shv('pad2Lfo1Rate', padState.pad2Lfo1Rate ?? 0.5), shv('pad2Lfo1Depth', padState.pad2Lfo1Depth ?? 0), padState.pad2Lfo1Wave ?? 'sine', p2l1Dest, this.pad2Lfo1State);
      const p2l2Val = this.computeLfoValue(now, shv('pad2Lfo2Rate', padState.pad2Lfo2Rate ?? 0.5), shv('pad2Lfo2Depth', padState.pad2Lfo2Depth ?? 0), padState.pad2Lfo2Wave ?? 'sine', p2l2Dest, this.pad2Lfo2State);

      const minC2 = Math.min(shv('pad2FilterCutoffMin', padState.pad2FilterCutoffMin), shv('pad2FilterCutoffMax', padState.pad2FilterCutoffMax));
      const maxC2 = Math.max(shv('pad2FilterCutoffMin', padState.pad2FilterCutoffMin), shv('pad2FilterCutoffMax', padState.pad2FilterCutoffMax));
      const cut2 = minC2 + (maxC2 - minC2) * 0.5;
      const res2 = shv('pad2FilterResonance', padState.pad2FilterResonance) * (0.7 + shv('pad2Hardness', padState.pad2Hardness) * 0.6);
      const lcb2 = cut2 < 200 ? (1 - cut2 / 200) * 4 : 0;

      let me2FMod = 0, me2PCents = 0;
      if ((padState.pad2ModEnvEnabled ?? false) && (shv('pad2ModEnvDepth', padState.pad2ModEnvDepth ?? 0)) !== 0) {
        const md = padState.pad2ModEnvDest ?? 'filterCutoff';
        if (md === 'filterCutoff' || md === 'pitch') {
          const mA = shv('pad2ModEnvAttack', padState.pad2ModEnvAttack ?? 0.1);
          const mD = shv('pad2ModEnvDecay', padState.pad2ModEnvDecay ?? 0.3);
          const mS = shv('pad2ModEnvSustain', padState.pad2ModEnvSustain ?? 0);
          const mCy = mA + mD + 1, mPh = (now % mCy) / mCy, mAP = mA / mCy, mDP = (mA + mD) / mCy;
          let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
          mV *= shv('pad2ModEnvDepth', padState.pad2ModEnvDepth ?? 0);
          if (md === 'filterCutoff') me2FMod = mV * (maxC2 - minC2); else me2PCents = mV * 400;
        }
      }

      const oscMix2 = shv('pad2OscMix', padState.pad2OscMix ?? 0.5);
      const aMx2 = Math.min(1, 2 * (1 - oscMix2)), bMx2 = Math.min(1, 2 * oscMix2);

      p2 = {
        oscAWave: (padState.pad2OscAWave ?? 'sawtooth') as OscillatorType,
        oscBWave: (padState.pad2OscBWave ?? 'triangle') as OscillatorType,
        subEnabled: padState.pad2SubEnabled ?? false,
        subWave: (padState.pad2SubWave ?? 'sine') as OscillatorType,
        effectiveALevel: fin(shv('pad2OscALevel', padState.pad2OscALevel ?? 0.6) * aMx2, 0),
        effectiveBLevel: fin(shv('pad2OscBLevel', padState.pad2OscBLevel ?? 0.4) * bMx2, 0),
        subLevel: fin(shv('pad2SubLevel', padState.pad2SubLevel ?? 0.3), 0.3), noiseLevel: fin(shv('pad2NoiseLevel', padState.pad2NoiseLevel ?? 0.15), 0.15),
        fbEnabled: padState.pad2FilterBEnabled ?? false,
        filterType: (padState.pad2FilterType ?? 'lowpass') as BiquadFilterType,
        finalCutoff: fin(Math.max(20, Math.min(20000, cut2 + (p2l1Dest === 'filterCutoff' ? p2l1Val * (maxC2 - minC2) * 0.5 : 0) + (p2l2Dest === 'filterCutoff' ? p2l2Val * (maxC2 - minC2) * 0.5 : 0) + me2FMod)), 1000),
        effectiveQ: fin(shv('pad2FilterQ', padState.pad2FilterQ) + res2 * 8 + lcb2, 1),
        warmthGain: fin(shv('pad2Warmth', padState.pad2Warmth) * 8, 0),
        presenceGain: fin((shv('pad2Presence', padState.pad2Presence) - 0.5) * 12, 0),
        lfoAmpMod: fin(1 + (p2l1Dest === 'amplitude' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'amplitude' ? p2l2Val * 0.5 : 0), 1),
        lfoPitchCents: fin((p2l1Dest === 'pitch' ? p2l1Val * 200 : 0) + (p2l2Dest === 'pitch' ? p2l2Val * 200 : 0) + me2PCents, 0),
        lfoOscBMod: fin((p2l1Dest === 'oscBLevel' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'oscBLevel' ? p2l2Val * 0.5 : 0), 0),
        lfoFilterBMod: fin((p2l1Dest === 'filterBCutoff' ? p2l1Val * 2000 : 0) + (p2l2Dest === 'filterBCutoff' ? p2l2Val * 2000 : 0), 0),
        lfoDest: p2l1Dest as typeof p1.lfoDest, lfo2Dest: p2l2Dest as typeof p1.lfo2Dest,
        modEnvEnabled: padState.pad2ModEnvEnabled ?? false, modEnvDest: padState.pad2ModEnvDest ?? 'filterCutoff',
        oscADetune: shv('pad2OscADetune', padState.pad2OscADetune ?? shv('detune', padState.detune)),
        oscBDetune: shv('pad2OscBDetune', padState.pad2OscBDetune ?? shv('detune', padState.detune)),
        filterBType: (padState.pad2FilterBType ?? 'highpass') as BiquadFilterType,
        filterBFreq: fin(shv('pad2FilterBCutoff', padState.pad2FilterBCutoff ?? 200), 200),
        filterBResBoost: fin(shv('pad2FilterBResonance', padState.pad2FilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(shv('pad2FilterBQ', padState.pad2FilterBQ ?? 1), 1),
        filterRouting: padState.pad2FilterRouting ?? 'series',
        hardness: fin(shv('pad2Hardness', padState.pad2Hardness), 0.5),
      };
    }

    // ── Re-route voices between pad1Bus/pad2Bus when assignment changes ──
    const effectivePad2Assign = pad2On ? pad2Assign : 0;
    if (this.pad1Bus && this.pad2Bus && effectivePad2Assign !== this.lastPad2VoiceAssign) {
      const pad1Bus = this.pad1Bus;
      const pad2Bus = this.pad2Bus;
      const pad1PreFaderBus = this.pad1PreFaderBus;
      const pad2PreFaderBus = this.pad2PreFaderBus;
      this.voices.forEach((voice, i) => {
        const wasPad2 = (this.lastPad2VoiceAssign & (1 << i)) !== 0;
        const isPad2 = (effectivePad2Assign & (1 << i)) !== 0;
        if (wasPad2 !== isPad2) {
          // Re-route post-fader (mixerGain → pad bus)
          try { voice.mixerGain.disconnect(wasPad2 ? pad2Bus : pad1Bus); } catch (_e) { /* ignore */ }
          voice.mixerGain.connect(isPad2 ? pad2Bus : pad1Bus);
          // Re-route pre-fader (envelope → pre-fader bus for granular)
          if (pad1PreFaderBus && pad2PreFaderBus) {
            try { voice.envelope.disconnect(wasPad2 ? pad2PreFaderBus : pad1PreFaderBus); } catch (_e) { /* ignore */ }
            voice.envelope.connect(isPad2 ? pad2PreFaderBus : pad1PreFaderBus);
          }
          // Forward voice-pad assignment to WASM pad worklet
          if (this.padWasmReady && this.padWasmNode) {
            this.padWasmNode.port.postMessage({ type: 'voicePad', voiceIndex: i, pad: isPad2 ? 1 : 0 });
          }
        }
      });
      this.lastPad2VoiceAssign = effectivePad2Assign;
    }

    // ── Unified voice loop (per-voice pad selection) ──
    this.voices.forEach((voice, i) => {
      const p = (pad2On && (pad2Assign & (1 << i))) ? p2 : p1;

      // Waveforms
      voice.osc1.type = p.oscAWave;
      voice.osc2.type = p.oscAWave;
      voice.osc3.type = p.oscBWave;
      voice.osc4.type = p.subEnabled ? p.subWave : p.oscBWave;

      // Levels (with osc mix crossfade)
      // Use cancelAndHoldAtTime + setValueAtTime for zero targets to ensure silence
      // (setTargetAtTime asymptotically approaches zero but never reaches it)
      const osc1Target = p.effectiveALevel;
      const osc2Target = p.effectiveALevel * 0.8;
      const oscBFinal = Math.max(0, p.effectiveBLevel + p.lfoOscBMod);
      const osc4Target = p.subEnabled ? p.subLevel : oscBFinal * 0.8;
      if (osc1Target < 0.001) {
        voice.osc1Gain.gain.cancelScheduledValues(now);
        voice.osc1Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc1Gain.gain.setTargetAtTime(osc1Target, now, smoothTime);
      }
      if (osc2Target < 0.001) {
        voice.osc2Gain.gain.cancelScheduledValues(now);
        voice.osc2Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc2Gain.gain.setTargetAtTime(osc2Target, now, smoothTime);
      }
      if (oscBFinal < 0.001) {
        voice.osc3Gain.gain.cancelScheduledValues(now);
        voice.osc3Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc3Gain.gain.setTargetAtTime(oscBFinal, now, smoothTime);
      }
      if (osc4Target < 0.001) {
        voice.osc4Gain.gain.cancelScheduledValues(now);
        voice.osc4Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc4Gain.gain.setTargetAtTime(osc4Target, now, smoothTime);
      }

      // LFO → amplitude
      if (p.lfoDest === 'amplitude' || p.lfo2Dest === 'amplitude') {
        voice.modEnvGain.gain.setTargetAtTime(Math.max(0, p.lfoAmpMod), now, smoothTime);
      }

      // LFO → pitch
      if (p.lfoDest === 'pitch' || p.lfo2Dest === 'pitch' || (p.modEnvEnabled && p.modEnvDest === 'pitch')) {
        voice.osc1.detune.setTargetAtTime(p.lfoPitchCents, now, smoothTime);
        voice.osc2.detune.setTargetAtTime(p.lfoPitchCents - p.oscADetune, now, smoothTime);
        voice.osc3.detune.setTargetAtTime(p.lfoPitchCents + p.oscBDetune, now, smoothTime);
        voice.osc4.detune.setTargetAtTime(p.lfoPitchCents, now, smoothTime);
      }

      // Main filter (A)
      voice.filter.type = p.filterType;
      voice.filter.frequency.setTargetAtTime(p.finalCutoff, now, smoothTime);
      voice.filter.Q.setTargetAtTime(p.effectiveQ, now, smoothTime);

      // Filter B
      if (p.fbEnabled) {
        voice.filterB.type = p.filterBType;
        voice.filterB.frequency.setTargetAtTime(fin(Math.max(20, Math.min(20000, p.filterBFreq + p.lfoFilterBMod)), 200), now, smoothTime);
        voice.filterB.Q.setTargetAtTime(fin(p.filterBQ + p.filterBResBoost, 1), now, smoothTime);
      } else {
        voice.filterB.type = 'lowpass';
        voice.filterB.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filterB.Q.setTargetAtTime(0.1, now, smoothTime);
      }

      // Filter routing
      if (p.filterRouting === 'bOnly') {
        voice.filter.type = 'lowpass';
        voice.filter.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filter.Q.setTargetAtTime(0.1, now, smoothTime);
      } else if (p.filterRouting === 'aOnly' && p.fbEnabled) {
        voice.filterB.type = 'lowpass';
        voice.filterB.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filterB.Q.setTargetAtTime(0.1, now, smoothTime);
      }

      // EQ
      voice.warmthFilter.gain.setTargetAtTime(p.warmthGain, now, smoothTime);
      voice.presenceFilter.gain.setTargetAtTime(p.presenceGain, now, smoothTime);

      // Noise
      voice.noiseGain.gain.setTargetAtTime(p.noiseLevel * 0.1, now, smoothTime);

      // Per-voice mixer level (pad 1 = synthLevel, pad 2 = pad2Level)
      const voiceLevel = (pad2On && (pad2Assign & (1 << i)))
        ? shv('pad2Level', padState.pad2Level ?? 0.6)
        : shv('synthLevel', padState.synthLevel ?? 0.6);
      voice.mixerGain.gain.setTargetAtTime((voiceLevel ?? 0.6) * ENGINE_TRIMS.pad, now, smoothTime);
    });

    // ── Saturation curves (per-pad, only on change) ──
    const pad1Hardness = shv('hardness', padState.hardness);
    if (pad1Hardness !== this.lastHardness) {
      this.lastHardness = pad1Hardness;
      const curve1 = this.createSaturationCurve(pad1Hardness);
      this.voices.forEach((voice, i) => {
        if (!(pad2On && (pad2Assign & (1 << i)))) voice.saturation.curve = curve1;
      });
    }
    const pad2Hardness = shv('pad2Hardness', padState.pad2Hardness);
    if (pad2On && pad2Hardness !== this.pad2LastHardness) {
      this.pad2LastHardness = pad2Hardness;
      const curve2 = this.createSaturationCurve(pad2Hardness);
      this.voices.forEach((voice, i) => {
        if (pad2Assign & (1 << i)) voice.saturation.curve = curve2;
      });
    }

    // Forward pad params to WASM worklet (if active)
    this.sendPadWasmParams(padState);

    // Legacy JS granular engine REMOVED — all granular processing via Granular FX WASM engine
    // granularLevel and granularReverbSend now control the Granular FX output levels

    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = state.pad2Enabled ?? false;
    const lead1WetActive = state.leadEnabled || state.leadRandomEnabled || state.synthEuclideanMasterEnabled;
    const lead2WetActive = state.lead2Enabled;
    const lead1Lvl = shv('lead1Level', state.lead1Level ?? 0.8);
    const lead2Lvl = shv('lead2Level', state.lead2Level ?? 0.6);
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive);
    let delayBEnabled = false;

    // Granular FX (Granular) parameters
    if (this.granularFxNode) {
      const granularEnabled = granularBusArmed;
      const macroModel = computeGranularMacroModel(state, (key, fallback) => shv(key as string, fallback));
      const lead1RoutingActive = !!lead1WetActive;
      const lead2RoutingActive = !!lead2WetActive;
      // Use granularLevel as the Granular FX output level (replaces hardcoded 1.0)
      const granularOutputLevel = granularEnabled ? shv('granularLevel', state.granularLevel) * ENGINE_TRIMS.granular * macroModel.directLevelScale : 0;
      this.granularFxDirect?.gain.setTargetAtTime(granularOutputLevel, now, smoothTime);
      // Use granularReverbSend as the Granular FX reverb send level (S&H aware)
      const granularRevSend = (granularEnabled && state.reverbEnabled) ? shv('granularReverbSend', state.granularReverbSend) * ENGINE_TRIMS.granular : 0;
      this.granularFxReverbSend?.gain.setTargetAtTime(granularRevSend, now, smoothTime);
      this.granularFxReverbLPF?.frequency.setTargetAtTime(macroModel.finalReverbLPF, now, smoothTime);
      this.granularFxOutputLPF?.frequency.setTargetAtTime(macroModel.finalOutputLPF, now, smoothTime);

      // Granular now idles when the whole bus is unused, but the individual source sends
      // themselves are driven by the routing matrix rather than extra per-source gates.
      const pad1Send = (granularEnabled && pad1Active) ? (state.granularPad1Send ?? 1.0) : 0;
      const pad2Send = (granularEnabled && pad2Active) ? (state.granularPad2Send ?? 0.0) : 0;
      const lead1Send = (granularEnabled && lead1RoutingActive) ? shv('granularLead1Send', state.granularLead1Send ?? 0.0) : 0;
      const lead2Send = (granularEnabled && lead2RoutingActive) ? shv('granularLead2Send', state.granularLead2Send ?? 0.0) : 0;
      const drumSend = (granularEnabled && state.drumEnabled) ? (state.granularDrumSend ?? 0.0) : 0;
      const wavesSend = (granularEnabled && state.oceanSampleEnabled) ? (state.granularWavesSend ?? 0.0) : 0;
      const waterSend = (granularEnabled && state.waterEnabled) ? (state.granularWaterSend ?? 0.0) : 0;
      const insectsSend = (granularEnabled && (state.insectsEnabled || state.insects2Enabled)) ? (state.granularInsectsSend ?? 0.0) : 0;
      this.granularPad1Send?.gain.setTargetAtTime(pad1Send, now, smoothTime);
      this.granularPad2Send?.gain.setTargetAtTime(pad2Send, now, smoothTime);
      this.granularLead1Send?.gain.setTargetAtTime(lead1Send, now, smoothTime);
      this.granularLead2Send?.gain.setTargetAtTime(lead2Send, now, smoothTime);
      this.granularDrumSend?.gain.setTargetAtTime(drumSend, now, smoothTime);
      this.granularWavesSend?.gain.setTargetAtTime(wavesSend, now, smoothTime);
      this.granularWaterSend?.gain.setTargetAtTime(waterSend, now, smoothTime);
      this.granularInsectsSend?.gain.setTargetAtTime(insectsSend, now, smoothTime);

      const granularInternalDryWet = granularEnabled ? 1 : 0;
      const granularGlobalParams: GranularWorkletGlobalParams = {
        enabled: granularEnabled,
        freeze: state.granularFreeze,
        freezeWithFeedback: false,
        dryWet: granularInternalDryWet,
        feedback: shv('granularFeedback', state.granularFeedback),
        feedbackLPF: shv('granularFeedbackLPF', state.granularFeedbackLPF),
        bufferSeconds: shv('granularBufferSeconds', state.granularBufferSeconds),
        grainShape: state.granularShape ?? 'triangle',
      };
      const granularSpaceParams: GranularWorkletSpaceParams = {
        busDiffusion: macroModel.busDiffusion,
        timingRandomness: macroModel.timingRandomness,
      };
      const granularVoiceParams: GranularWorkletVoiceParams = {
        voiceEnabled: [state.granularV1Enabled, state.granularV2Enabled, state.granularV3Enabled, state.granularV4Enabled],
        voiceMode: [state.granularV1Mode, state.granularV2Mode, state.granularV3Mode, state.granularV4Mode],
        voiceSlice: [state.granularV1Slice, state.granularV2Slice, state.granularV3Slice, state.granularV4Slice],
        voiceSpeed: macroModel.voiceSpeed,
        voiceScanRate: macroModel.voiceScanRate,
        voiceReverse: [state.granularV1Reverse, state.granularV2Reverse, state.granularV3Reverse, state.granularV4Reverse],
        voicePitch: macroModel.voicePitch,
        voiceAttack: macroModel.voiceAttack,
        voiceDecay: macroModel.voiceDecay,
        voiceBlur: macroModel.voiceBlur,
        voiceGrainOct: macroModel.voiceGrainOct,
        voiceSpray: macroModel.voiceSpray,
        voiceDensity: macroModel.voiceDensity,
        voiceGrainSize: macroModel.voiceGrainSize,
        voicePan: [shv('granularV1Pan', state.granularV1Pan), shv('granularV2Pan', state.granularV2Pan), shv('granularV3Pan', state.granularV3Pan), shv('granularV4Pan', state.granularV4Pan)],
        voiceGain: [shv('granularV1Gain', state.granularV1Gain), shv('granularV2Gain', state.granularV2Gain), shv('granularV3Gain', state.granularV3Gain), shv('granularV4Gain', state.granularV4Gain)],
        voicePosLFORate: macroModel.voicePosLFORate,
        voicePosLFODepth: macroModel.voicePosLFODepth,
        voicePanLFORate: macroModel.voicePanLFORate,
        voiceStereoSpread: [shv('granularV1StereoSpread', state.granularV1StereoSpread), shv('granularV2StereoSpread', state.granularV2StereoSpread), shv('granularV3StereoSpread', state.granularV3StereoSpread), shv('granularV4StereoSpread', state.granularV4StereoSpread)],
        voiceReverseLFORate: macroModel.voiceReverseLFORate,
        voiceWriteFollow: [shv('granularV1WriteFollow', state.granularV1WriteFollow), shv('granularV2WriteFollow', state.granularV2WriteFollow), shv('granularV3WriteFollow', state.granularV3WriteFollow), shv('granularV4WriteFollow', state.granularV4WriteFollow)],
        voiceRecordLFORate: [shv('granularV1RecordLFORate', state.granularV1RecordLFORate), shv('granularV2RecordLFORate', state.granularV2RecordLFORate), shv('granularV3RecordLFORate', state.granularV3RecordLFORate), shv('granularV4RecordLFORate', state.granularV4RecordLFORate)],
        tempoGated: [
          this.isGranularTempoSyncVoiceActive(state, 0),
          this.isGranularTempoSyncVoiceActive(state, 1),
          this.isGranularTempoSyncVoiceActive(state, 2),
          this.isGranularTempoSyncVoiceActive(state, 3),
        ],
      };
      const granularHarmonyParams: GranularWorkletHarmonyParams = {
        scaleIntervals: this.harmonyState?.scaleFamily?.intervals ? [...this.harmonyState.scaleFamily.intervals] : [],
        chordPitches: this.harmonyState?.currentChord?.midiNotes
          ? this.harmonyState.currentChord.midiNotes.map(n => n % 12)
          : [],
        chordBias: shv('granularChordBias', state.granularChordBias ?? 0),
      };
      const granularLegacyParams: GranularWorkletLegacyParams = {
        legacyJitter: shv('granularLegacyJitter', state.granularLegacyJitter),
        legacyProbability: shv('granularLegacyProbability', state.granularLegacyProbability),
        legacyPitchMode: state.granularLegacyPitchMode,
        legacyPitchSpread: shv('granularLegacyPitchSpread', state.granularLegacyPitchSpread),
        legacyMaxGrains: shv('granularLegacyMaxGrains', state.granularLegacyMaxGrains),
        legacyFeedback: shv('granularLegacyFeedback', state.granularLegacyFeedback),
      };
      this.queueGranularWorkletUpdate({
        global: granularGlobalParams,
        space: granularSpaceParams,
        voices: granularVoiceParams,
        harmony: granularHarmonyParams,
        legacy: granularLegacyParams,
      });

      // ── Granular Multi-Tap Delay ──
      // Bidirectional mutual exclusion: only one direction can be active at a time
      const delayBState = this.getSharedDelayBState(
        state,
        pad1Active,
        pad2Active,
        lead1RoutingActive,
        lead2RoutingActive,
        granularEnabled,
      );
      delayBEnabled = delayBState.delayBEnabled;
      this.sharedGranularDelayBSend?.gain.setTargetAtTime(delayBState.granularDelaySourceLevel, now, smoothTime);
      this.sharedDelayB?.update(delayBState.params, now, smoothTime);

      // The old granular-local multitap nodes are left disconnected while the shared Delay B
      // takes over, so keep their gains pinned to zero in case a fallback path instantiated them.
      this.granularDelaySendGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayDirectGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayReverbSendGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayFeedbackGain?.gain.setTargetAtTime(0, now, smoothTime);
    }

    // Synth levels (independent: direct level and per-pad reverb sends)
    // Per-voice mixerGain controls pad 1 vs pad 2 level
    // synthDirect acts as pad-active mute gate
    // Pad reverb sends are additive, not crossfaded.
    // When reverbEnabled is false, mute reverb sends to save CPU
    const padActive = pad1Active || pad2Active;
    // When spectral freeze is active, attenuate the dry direct path so the
    // frozen pad isn't masked by the live pad signal modulating through.
    // Reverb Crossfade=1 → fully frozen → mute dry, Crossfade=0 → full dry.
    const sfEnabled = state.spectralFreezeEnabled ?? false;
    const sfActive = state.spectralFreezeActive ?? false;
    const sfCrossfade = state.spectralFreezeReverbCrossfade ?? 1.0;
    const dryGain = (sfEnabled && sfActive) ? (1.0 - sfCrossfade) : 1.0;
    this.synthDirect?.gain.setTargetAtTime(padActive ? dryGain : 0, now, smoothTime);
    this.pad1ReverbSend?.gain.setTargetAtTime((pad1Active && state.reverbEnabled) ? shv('pad1ReverbSend', state.pad1ReverbSend) : 0, now, smoothTime);
    this.pad2ReverbSend?.gain.setTargetAtTime((pad2Active && state.reverbEnabled) ? shv('pad2ReverbSend', state.pad2ReverbSend) : 0, now, smoothTime);
    this.pad1DelayASend?.gain.setTargetAtTime(pad1Active ? (state.pad1DelayASend ?? 0) : 0, now, smoothTime);
    this.pad1DelayBSend?.gain.setTargetAtTime(pad1Active ? (state.pad1DelayBSend ?? 0) : 0, now, smoothTime);
    this.pad2DelayASend?.gain.setTargetAtTime(pad2Active ? (state.pad2DelayASend ?? 0) : 0, now, smoothTime);
    this.pad2DelayBSend?.gain.setTargetAtTime(pad2Active ? (state.pad2DelayBSend ?? 0) : 0, now, smoothTime);

    const lead1Fader = lead1WetActive ? lead1Lvl : 0;
    const lead2Fader = lead2WetActive ? lead2Lvl : 0;
    this.lead1ReverbSend?.gain.setTargetAtTime((state.reverbEnabled && lead1WetActive) ? shv('lead1ReverbSend', state.lead1ReverbSend) : 0, now, smoothTime);
    this.lead2ReverbSend?.gain.setTargetAtTime((state.reverbEnabled && lead2WetActive) ? shv('lead2ReverbSend', state.lead2ReverbSend) : 0, now, smoothTime);

    const sharedDelayAState = this.getSharedDelayAState(state, lead1WetActive, lead2WetActive, granularBusArmed, delayBEnabled);
    this.sharedDelayA?.update(sharedDelayAState, now, smoothTime);
    this.lead1DelayASend?.gain.setTargetAtTime(
      lead1WetActive ? shv('lead1DelayASend', state.lead1DelayASend ?? 0) : 0,
      now,
      smoothTime,
    );
    this.lead2DelayASend?.gain.setTargetAtTime(
      lead2WetActive ? shv('lead2DelayASend', state.lead2DelayASend ?? 0) : 0,
      now,
      smoothTime,
    );
    this.lead1DelayBSend?.gain.setTargetAtTime(lead1WetActive ? shv('lead1DelayBSend', state.lead1DelayBSend ?? 0) : 0, now, smoothTime);
    this.lead2DelayBSend?.gain.setTargetAtTime(lead2WetActive ? shv('lead2DelayBSend', state.lead2DelayBSend ?? 0) : 0, now, smoothTime);
    const drumDelaySend = state.drumEnabled
      ? this.getDrumDelaySendProfile(state) * (state.drumDelayASend ?? 1)
      : 0;
    this.drumDelayASend?.gain.setTargetAtTime(drumDelaySend, now, smoothTime);
    this.drumDelayBSend?.gain.setTargetAtTime(state.drumEnabled ? (state.drumDelayBSend ?? 0) : 0, now, smoothTime);
    this.granularDelayASend?.gain.setTargetAtTime(granularBusArmed ? (state.granularDelayASend ?? 0) : 0, now, smoothTime);
    this.oceanDelayASend?.gain.setTargetAtTime(state.oceanSampleEnabled ? (state.oceanDelayASend ?? 0) : 0, now, smoothTime);
    this.oceanDelayBSend?.gain.setTargetAtTime(state.oceanSampleEnabled ? (state.oceanDelayBSend ?? 0) : 0, now, smoothTime);
    this.waterDelayASend?.gain.setTargetAtTime(state.waterEnabled ? (state.waterDelayASend ?? 0) : 0, now, smoothTime);
    this.waterDelayBSend?.gain.setTargetAtTime(state.waterEnabled ? (state.waterDelayBSend ?? 0) : 0, now, smoothTime);
    const insectsDelaySendActive = state.insectsEnabled || state.insects2Enabled;
    this.insectsDelayASend?.gain.setTargetAtTime(insectsDelaySendActive ? (state.insDelayASend ?? 0) : 0, now, smoothTime);
    this.insectsDelayBSend?.gain.setTargetAtTime(insectsDelaySendActive ? (state.insDelayBSend ?? 0) : 0, now, smoothTime);

    // Per-lead dry-path level only. FX sends stay independent so lead can be fully wet at dry level 0.
    this.lead1LevelGain?.gain.setTargetAtTime(lead1Fader, now, smoothTime);
    // WASM lead per-lead dry-path levels (separate outputs, no longer needs max)
    this.leadWasmLevelGain?.gain.setTargetAtTime(lead1Fader, now, smoothTime);
    this.leadWasmLead2LevelGain?.gain.setTargetAtTime(lead2Fader, now, smoothTime);
    this.lead2LevelGain?.gain.setTargetAtTime(lead2Fader, now, smoothTime);

    // Forward lead FM delay params to WASM worklet (if active)
    this.sendLeadFmWasmDelay(state);

    // Reverb parameters (only update if enabled to save CPU)
    // Guard: reverbNode may be a dummy GainNode (no .port) when Euclidean runs standalone
    const reverbBusActive = state.reverbEnabled && this.hasAnyReverbFeed(
      state,
      pad1Active,
      pad2Active,
      lead1WetActive,
      lead2WetActive,
      granularBusArmed,
      sharedDelayAState.enabled,
      delayBEnabled,
    );
    if (this.reverbNode && (this.reverbNode as any).port && reverbBusActive) {
      // Per-engine tension → subtle additive offsets on decay/diffusion/shimmer
      const reverbT = getEffectiveTension(
        state.tension ?? 0.3,
        state.reverbTensionMode ?? 'bypass',
        state.reverbTensionValue ?? 0,
      );
      let effectiveDecay = shv('reverbDecay', state.reverbDecay ?? 0.5);
      let effectiveDiffusion = shv('reverbDiffusion', state.reverbDiffusion ?? 0.5);
      let effectiveShimmer = shv('reverbShimmer', state.reverbShimmer ?? 0);
      if (reverbT >= 0) {
        const tInvRev = 1 - reverbT;
        effectiveDecay    = Math.min(1, effectiveDecay + tInvRev * 0.15);
        effectiveDiffusion = Math.min(1, effectiveDiffusion + tInvRev * 0.1);
        effectiveShimmer  = Math.min(1, effectiveShimmer + reverbT * 0.08);
      }

      // ── Reverb Harmony Coupling ──
      // Chord wash — boost shimmer on chord change, then decay
      if (this.reverbWashBoost > 0.001) {
        effectiveShimmer = Math.min(1, effectiveShimmer + this.reverbWashBoost * 0.15);
        this.reverbWashBoost *= 0.92; // ~180ms decay at 60fps
      }
      // Resolution bloom — boost decay+shimmer on tension resolution
      if (this.reverbBloomBoost > 0.001) {
        effectiveDecay = Math.min(1, effectiveDecay + this.reverbBloomBoost * 0.12);
        effectiveShimmer = Math.min(1, effectiveShimmer + this.reverbBloomBoost * 0.1);
        this.reverbBloomBoost *= 0.95; // ~300ms decay
      }

      // Scale-aware shimmer pitch — quantize to nearest scale interval
      let shimmerPitch = shv('reverbShimmerPitch', state.reverbShimmerPitch ?? 12);
      if (state.reverbScaleShimmer && this.harmonyState?.scaleFamily?.intervals) {
        const si = this.harmonyState.scaleFamily.intervals;
        const octaves = Math.floor(shimmerPitch / 12);
        const rem = ((shimmerPitch % 12) + 12) % 12;
        let bestInterval = 0;
        let bestDist = 99;
        for (const interval of si) {
          const d = Math.abs(interval - rem);
          const dist = Math.min(d, 12 - d);
          if (dist < bestDist) { bestDist = dist; bestInterval = interval; }
        }
        shimmerPitch = octaves * 12 + bestInterval;
      }

      const reverbParams: Record<string, unknown> = {
          type: state.reverbType,
          quality: this.isMobile ? 'balanced' : state.reverbQuality,
          decay: effectiveDecay,
          size: shv('reverbSize', state.reverbSize),
          diffusion: effectiveDiffusion,
          modulation: shv('reverbModulation', state.reverbModulation),
          predelay: shv('predelay', state.predelay),
          damping: shv('damping', state.damping),
          width: shv('width', state.width),
          shimmer: effectiveShimmer,
          shimmerPitch: shimmerPitch,
          slowModRate: shv('reverbSlowModRate', state.reverbSlowModRate ?? 0.05),
          slowModDepth: shv('reverbSlowModDepth', state.reverbSlowModDepth ?? 0),
          reverse: shv('reverbReverse', state.reverbReverse ?? 0),
          reverseLength: shv('reverbReverseLength', state.reverbReverseLength ?? 2),
          chorusRate: shv('reverbChorusRate', state.reverbChorusRate ?? 0.5),
          chorusDepth: shv('reverbChorusDepth', state.reverbChorusDepth ?? 12),
          modCharacter: state.reverbModCharacter ?? 'hybrid',
          dampLow: shv('reverbDampLow', state.reverbDampLow ?? 0.1),
          dampHigh: shv('reverbDampHigh', state.reverbDampHigh ?? 0.3),
          crossoverFreq: shv('reverbCrossoverFreq', state.reverbCrossoverFreq ?? 800),
          inputTone: shv('reverbInputTone', state.reverbInputTone ?? 0),
          shimmerFeedback: shv('reverbShimmerFeedback', state.reverbShimmerFeedback ?? 0),
          warp: shv('reverbWarp', state.reverbWarp ?? 0),
          crossFeed: shv('reverbCrossFeed', state.reverbCrossFeed ?? 0),
          earlyReflections: shv('reverbEarlyReflections', state.reverbEarlyReflections ?? 0.3),
          airAbsorption: shv('reverbAirAbsorption', state.reverbAirAbsorption ?? 0.2),
          saturationMode: state.reverbSaturationMode === 'tape' ? 1 : state.reverbSaturationMode === 'tube' ? 2 : 0,
          transientSmooth: shv('reverbTransientSmooth', state.reverbTransientSmooth ?? 0),
          erLpFreq: shv('reverbErLpFreq', state.reverbErLpFreq ?? 2500),
      };
      // Dirty-gate: skip postMessage if all params are unchanged from last frame
      let reverbDirty = !this._prevReverbParams;
      if (!reverbDirty) {
        for (const k in reverbParams) {
          if (reverbParams[k] !== this._prevReverbParams![k]) { reverbDirty = true; break; }
        }
      }
      if (reverbDirty) {
        this._prevReverbParams = reverbParams;
        (this.reverbNode as any).port.postMessage({ type: 'params', params: reverbParams });
      }
    }

    // Reverb output level (mute if disabled)
    this.reverbOutputGain?.gain.setTargetAtTime(reverbBusActive ? shv('reverbLevel', state.reverbLevel) * ENGINE_TRIMS.reverb : 0, now, smoothTime);

    // Spectral Freeze parameters
    if (this.spectralFreezeNode && (this.spectralFreezeNode as any).port) {
      const sfFreeze = state.spectralFreezeActive ?? false;
      const sfSlushy = state.spectralFreezeSlushy ?? false;
      const sfSpeed = state.spectralFreezeSpeed ?? 0.3;
      const sfMix = state.spectralFreezeMix ?? 1.0;
      const sfDecay = 1.0 - (state.spectralFreezeDecay ?? 1.0);
      const sfPhaseJitter = state.spectralFreezePhaseJitter ?? 0.0;

      // Dirty-gate: skip postMessage if all 6 params unchanged
      if (!this._sfParamsInitialized ||
          sfFreeze !== this._prevSfFreeze || sfSlushy !== this._prevSfSlushy ||
          sfSpeed !== this._prevSfSpeed || sfMix !== this._prevSfMix ||
          sfDecay !== this._prevSfDecay || sfPhaseJitter !== this._prevSfPhaseJitter) {
        this._sfParamsInitialized = true;
        this._prevSfFreeze = sfFreeze;
        this._prevSfSlushy = sfSlushy;
        this._prevSfSpeed = sfSpeed;
        this._prevSfMix = sfMix;
        this._prevSfDecay = sfDecay;
        this._prevSfPhaseJitter = sfPhaseJitter;
        (this.spectralFreezeNode as any).port.postMessage({
          type: 'params',
          params: { freeze: sfFreeze, slushy: sfSlushy, speed: sfSpeed, mix: sfMix, decay: sfDecay, phaseJitter: sfPhaseJitter },
        });
      }

      // Re-apply routing if mode changed or enabled state changed
      const routing = state.spectralFreezeRouting ?? 'pre';
      const enabled = state.spectralFreezeEnabled ?? false;
      if (routing !== this.currentSpectralFreezeRouting || enabled !== (this.currentSpectralFreezeRouting !== null)) {
        this.applySpectralFreezeRouting();
      }

      // Update crossfade in pre-mode (controls reverbDirectSend, not reverbInputBus)
      // crossfade=1 → gain=0 (no live bleed), crossfade=0 → gain=1 (full live)
      if (enabled && routing === 'pre' && this.reverbDirectSend) {
        const crossfade = state.spectralFreezeReverbCrossfade ?? 0.5;
        this.reverbDirectSend.gain.setTargetAtTime(1.0 - crossfade, now, smoothTime);
      }
    }

    // Lead synth parameters — leadDry gates active/inactive; per-lead level on lead1/2LevelGain + WASM per-lead gains
    // Keep gain active if Euclidean sequencer is driving lead
    const leadActive = state.leadEnabled || state.leadRandomEnabled || state.synthEuclideanMasterEnabled;
    this.leadDry?.gain.setTargetAtTime(leadActive ? 1.0 : 0, now, smoothTime);

    // Lead random scheduling (phrase-based, independent of Euclidean)
    if (state.leadRandomEnabled && this.leadMelodyTimer === null && this.isRunning) {
      this.startLeadMelody();
    } else if (!state.leadRandomEnabled && this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
      for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
      this.leadNoteTimeouts = [];
    }

    // Load/update lead presets when selections change
    if (state.lead1PresetA !== this.lead1PresetAId) {
      this.loadLeadPreset('A', state.lead1PresetA);
    }
    if (state.lead1PresetB !== this.lead1PresetBId) {
      this.loadLeadPreset('B', state.lead1PresetB);
    }
    if (state.lead2PresetC !== this.lead2PresetCId) {
      this.loadLeadPreset('C', state.lead2PresetC);
    }
    if (state.lead2PresetD !== this.lead2PresetDId) {
      this.loadLeadPreset('D', state.lead2PresetD);
    }

    // Waves sample volume (Ghetary recording)
    this.oceanSampleGain?.gain.setTargetAtTime(
      state.oceanSampleEnabled ? 1.0 : 0,
      now,
      smoothTime
    );

    // Ocean filter parameters
    if (this.oceanFilter) {
      this.oceanFilter.type = state.oceanFilterType;
      this.oceanFilter.frequency.setTargetAtTime(state.oceanFilterCutoff, now, smoothTime);
      // Q: 0.5 to 10.5 based on resonance 0-1
      this.oceanFilter.Q.setTargetAtTime(0.5 + state.oceanFilterResonance * 10, now, smoothTime);
    }

    // Start sample playback if enabled and not already playing
    if (state.oceanSampleEnabled && this.oceanSampleLoaded && !this.oceanSampleSource) {
      this.startOceanSamplePlayback();
    }
    
    // ── Soundscapes WASM — water + insects + fire ──
    if (this.soundscapesNode && this.soundscapesWasmReady) {
      // Water start/stop — keep running for wet-only reverb sends too
      const waterShouldRun = state.waterEnabled && (
        state.waterLevel > 0 ||
        state.waterReverbSend > 0 ||
        (state.waterDelayASend ?? 0) > 0 ||
        (state.waterDelayBSend ?? 0) > 0 ||
        (state.granularWaterSend ?? 0) > 0
      );
      if (waterShouldRun && !this._scWaterStarted) {
        this.soundscapesNode.port.postMessage({ type: 'waterStart' });
        this._scWaterStarted = true;
      } else if (!waterShouldRun && this._scWaterStarted) {
        this.soundscapesNode.port.postMessage({ type: 'waterStop' });
        this._scWaterStarted = false;
      }

      // Water preset (snap to nearest endpoint of morph)
      const waterPresetIdx = Math.round(state.waterMorph < 0.5 ? state.waterMorphA : state.waterMorphB);
      if (waterPresetIdx !== this._scWaterPreset) {
        this.soundscapesNode.port.postMessage({ type: 'waterPreset', preset: waterPresetIdx });
        this._scWaterPreset = waterPresetIdx;
      }

      // Water synthesis params (only send when water is enabled)
      if (state.waterEnabled) {
        // Water synthesis params with dualRange min/max support
        const wInt = this.dualRanges['waterIntensity'];
        const wDist = this.dualRanges['waterDistance'];
        const wBf = this.dualRanges['waterBaseFreq'];
        const wDs = this.dualRanges['waterDropSize'];
        const wHd = this.dualRanges['waterHardness'];
        const wGt = this.dualRanges['waterGlassThickness'];
        const waterParams = {
          intensityMin: wInt ? wInt.min : state.waterIntensity,
          intensityMax: wInt ? wInt.max : state.waterIntensity,
          distanceMin: wDist ? wDist.min : state.waterDistance,
          distanceMax: wDist ? wDist.max : state.waterDistance,
          baseFreqMin: wBf ? wBf.min : state.waterBaseFreq,
          baseFreqMax: wBf ? wBf.max : state.waterBaseFreq,
          dropSizeMin: wDs ? wDs.min : state.waterDropSize,
          dropSizeMax: wDs ? wDs.max : state.waterDropSize,
          hardnessMin: wHd ? wHd.min : state.waterHardness,
          hardnessMax: wHd ? wHd.max : state.waterHardness,
          glassThicknessMin: wGt ? wGt.min : state.waterGlassThickness,
          glassThicknessMax: wGt ? wGt.max : state.waterGlassThickness,
        };
        this.postCachedWorkletMessage('soundscapes:waterParams', this.soundscapesNode, {
          type: 'waterParams',
          params: waterParams,
        }, waterParams);

        const waterLayerDetailParams = {
          hardRate: shv('waterHardDropRate', state.waterHardDropRate),
          hardTone: shv('waterHardDropLPF', state.waterHardDropLPF),
          hardCharacter: shv('waterHardDropTone', state.waterHardDropTone),
          waterRate: shv('waterWaterDropRate', state.waterWaterDropRate),
          waterTone: shv('waterWaterDropLPF', state.waterWaterDropLPF),
          bubbleRate: shv('waterBubblingRate', state.waterBubblingRate),
          bubbleTone: shv('waterBubblingLPF', state.waterBubblingLPF),
        };
        this.postCachedWorkletMessage('soundscapes:waterLayerDetailParams', this.soundscapesNode, {
          type: 'waterLayerDetailParams',
          ...waterLayerDetailParams,
        }, waterLayerDetailParams);

        // Water layer mix
        const waterLayerMix = {
          hardDrops: state.waterLayerHardDrops,
          waterDrops: state.waterLayerWaterDrops,
          turbulence: state.waterLayerTurbulence,
          bubbling: state.waterLayerBubbling,
          surf: state.waterLayerSurf,
          channels: state.waterLayerChannels,
        };
        this.postCachedWorkletMessage('soundscapes:waterLayerMix', this.soundscapesNode, {
          type: 'waterLayerMix',
          ...waterLayerMix,
        }, waterLayerMix);

        // Density is not user-facing yet. Keep legacy drop/turbulence density, but
        // run surf/channels at full density so wave-oriented presets have full body.
        const waterLayerDensity = {
          hardDrops: 0.5,
          waterDrops: 0.5,
          turbulence: 0.5,
          bubbling: 0.5,
          surf: 1.0,
          channels: 1.0,
        };
        this.postCachedWorkletMessage('soundscapes:waterLayerDensity', this.soundscapesNode, {
          type: 'waterLayerDensity',
          ...waterLayerDensity,
        }, waterLayerDensity);

        // Surf params (wave-envelope driven 3-band noise)
        const sDur = this.dualRanges['waterSurfDuration'];
        const sInt = this.dualRanges['waterSurfInterval'];
        const sFoam = this.dualRanges['waterSurfFoam'];
        const sProx = this.dualRanges['waterSurfProximity'];
        const sDep = this.dualRanges['waterSurfDepth'];
        const sBody = this.dualRanges['waterSurfBody'];
        const sSpray = this.dualRanges['waterSurfSpray'];
        const sFoamBright = this.dualRanges['waterSurfFoamBright'];
        const surfParams = {
          durationMin: sDur ? sDur.min : state.waterSurfDuration,
          durationMax: sDur ? sDur.max : state.waterSurfDuration,
          intervalMin: sInt ? sInt.min : state.waterSurfInterval,
          intervalMax: sInt ? sInt.max : state.waterSurfInterval,
          foamMin: sFoam ? sFoam.min : state.waterSurfFoam,
          foamMax: sFoam ? sFoam.max : state.waterSurfFoam,
          proximityMin: sProx ? sProx.min : state.waterSurfProximity,
          proximityMax: sProx ? sProx.max : state.waterSurfProximity,
          depthMin: sDep ? sDep.min : state.waterSurfDepth,
          depthMax: sDep ? sDep.max : state.waterSurfDepth,
          bodyFreqMin: sBody ? sBody.min : state.waterSurfBody,
          bodyFreqMax: sBody ? sBody.max : state.waterSurfBody,
          sprayFreqMin: sSpray ? sSpray.min : state.waterSurfSpray,
          sprayFreqMax: sSpray ? sSpray.max : state.waterSurfSpray,
          foamBrightMin: sFoamBright ? sFoamBright.min : state.waterSurfFoamBright,
          foamBrightMax: sFoamBright ? sFoamBright.max : state.waterSurfFoamBright,
        };
        this.postCachedWorkletMessage('soundscapes:waterSurfParams', this.soundscapesNode, {
          type: 'waterSurfParams',
          ...surfParams,
        }, surfParams);

        // Channels params (stream↔wind morph)
        const cMorph = this.dualRanges['waterChannelsMorph'];
        const cSpeed = this.dualRanges['waterChannelsSpeed'];
        const channelsParams = {
          morph: cMorph ? (cMorph.min + cMorph.max) * 0.5 : state.waterChannelsMorph,
          speed: cSpeed ? (cSpeed.min + cSpeed.max) * 0.5 : state.waterChannelsSpeed,
        };
        this.postCachedWorkletMessage('soundscapes:waterChannelsParams', this.soundscapesNode, {
          type: 'waterChannelsParams',
          ...channelsParams,
        }, channelsParams);

        const densityLoopParams = {
          hardSend: shv('waterDensityHardSend', state.waterDensityHardSend),
          waterSend: shv('waterDensityWaterSend', state.waterDensityWaterSend),
          bubbleSend: shv('waterDensityBubbleSend', state.waterDensityBubbleSend),
          feedback: shv('waterDensityFeedback', state.waterDensityFeedback),
          tone: shv('waterDensityTone', state.waterDensityTone),
          ring: shv('waterDensityRing', state.waterDensityRing),
          wet: shv('waterDensityWet', state.waterDensityWet),
        };
        this.postCachedWorkletMessage('soundscapes:waterDensityLoopParams', this.soundscapesNode, {
          type: 'waterDensityLoopParams',
          ...densityLoopParams,
        }, densityLoopParams);
      }

      // Insects 1 start/stop — keep running for wet-only reverb sends too
      const insectsSharedWetActive =
        state.insectsReverbSend > 0 ||
        (state.granularInsectsSend ?? 0) > 0 ||
        (state.insDelayASend ?? 0) > 0 ||
        (state.insDelayBSend ?? 0) > 0;
      const insects1ShouldRun = state.insectsEnabled && (state.insectsLevel > 0 || insectsSharedWetActive);
      if (insects1ShouldRun && !this._scInsects1Started) {
        this.soundscapesNode.port.postMessage({ type: 'insectsStart' });
        this._scInsects1Started = true;
      } else if (!insects1ShouldRun && this._scInsects1Started) {
        this.soundscapesNode.port.postMessage({ type: 'insectsStop' });
        this._scInsects1Started = false;
      }

      // Insects 1 engine type
      if (state.insectsEngine !== this._scInsects1Engine) {
        this.soundscapesNode.port.postMessage({ type: 'insectsEngine', engine: state.insectsEngine });
        this._scInsects1Engine = state.insectsEngine;
      }

      // Insects 1 params + dry gain (only send when enabled)
      if (state.insectsEnabled) {
        // Insects 1 params with dualRange min/max support
        const iDen = this.dualRanges['insectsDensity'];
        const iTemp = this.dualRanges['insectsTemperature'];
        const iDist = this.dualRanges['insectsDistance'];
        const iProx = this.dualRanges['insectsProximity'];
        const iAnti = this.dualRanges['insectsAntiphony'];
        const iCr = this.dualRanges['insectsClickRate'];
        const iMot = this.dualRanges['insectsMotion'];
        const insectsParams = {
          densityMin: iDen ? iDen.min : state.insectsDensity,
          densityMax: iDen ? iDen.max : state.insectsDensity,
          temperatureMin: iTemp ? iTemp.min : state.insectsTemperature,
          temperatureMax: iTemp ? iTemp.max : state.insectsTemperature,
          distanceMin: iDist ? iDist.min : state.insectsDistance,
          distanceMax: iDist ? iDist.max : state.insectsDistance,
          proximityMin: iProx ? iProx.min : state.insectsProximity,
          proximityMax: iProx ? iProx.max : state.insectsProximity,
          antiphonyMin: iAnti ? iAnti.min : state.insectsAntiphony,
          antiphonyMax: iAnti ? iAnti.max : state.insectsAntiphony,
          clickRateMin: iCr ? iCr.min : state.insectsClickRate,
          clickRateMax: iCr ? iCr.max : state.insectsClickRate,
          motionMin: iMot ? iMot.min : state.insectsMotion,
          motionMax: iMot ? iMot.max : state.insectsMotion,
        };
        this.postCachedWorkletMessage('soundscapes:insects1Params', this.soundscapesNode, {
          type: 'insectsParams',
          params: insectsParams,
        }, insectsParams);
        this.postCachedWorkletMessage('soundscapes:insects1Gain', this.soundscapesNode, {
          type: 'insectsGain',
          gain: state.insectsLevel,
        }, state.insectsLevel);
      }

      // Insects 2 start/stop — keep running for wet-only reverb sends too
      const insects2ShouldRun = state.insects2Enabled && (state.insects2Level > 0 || insectsSharedWetActive);
      if (insects2ShouldRun && !this._scInsects2Started) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Start' });
        this._scInsects2Started = true;
      } else if (!insects2ShouldRun && this._scInsects2Started) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Stop' });
        this._scInsects2Started = false;
      }

      // Insects 2 engine type
      if (state.insects2Engine !== this._scInsects2Engine) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Engine', engine: state.insects2Engine });
        this._scInsects2Engine = state.insects2Engine;
      }

      // Insects 2 params + dry gain (only send when enabled)
      if (state.insects2Enabled) {
        // Insects 2 params with dualRange min/max support
        const i2Den = this.dualRanges['insects2Density'];
        const i2Temp = this.dualRanges['insects2Temperature'];
        const i2Dist = this.dualRanges['insects2Distance'];
        const i2Prox = this.dualRanges['insects2Proximity'];
        const i2Anti = this.dualRanges['insects2Antiphony'];
        const i2Cr = this.dualRanges['insects2ClickRate'];
        const i2Mot = this.dualRanges['insects2Motion'];
        const insects2Params = {
          densityMin: i2Den ? i2Den.min : state.insects2Density,
          densityMax: i2Den ? i2Den.max : state.insects2Density,
          temperatureMin: i2Temp ? i2Temp.min : state.insects2Temperature,
          temperatureMax: i2Temp ? i2Temp.max : state.insects2Temperature,
          distanceMin: i2Dist ? i2Dist.min : state.insects2Distance,
          distanceMax: i2Dist ? i2Dist.max : state.insects2Distance,
          proximityMin: i2Prox ? i2Prox.min : state.insects2Proximity,
          proximityMax: i2Prox ? i2Prox.max : state.insects2Proximity,
          antiphonyMin: i2Anti ? i2Anti.min : state.insects2Antiphony,
          antiphonyMax: i2Anti ? i2Anti.max : state.insects2Antiphony,
          clickRateMin: i2Cr ? i2Cr.min : state.insects2ClickRate,
          clickRateMax: i2Cr ? i2Cr.max : state.insects2ClickRate,
          motionMin: i2Mot ? i2Mot.min : state.insects2Motion,
          motionMax: i2Mot ? i2Mot.max : state.insects2Motion,
        };
        this.postCachedWorkletMessage('soundscapes:insects2Params', this.soundscapesNode, {
          type: 'insects2Params',
          params: insects2Params,
        }, insects2Params);
        this.postCachedWorkletMessage('soundscapes:insects2Gain', this.soundscapesNode, {
          type: 'insects2Gain',
          gain: state.insects2Level,
        }, state.insects2Level);
      }

      if (this._scFireStarted) {
        this.soundscapesNode.port.postMessage({ type: 'fireStop' });
        this._scFireStarted = false;
      }

      // ── Earth master level ──
      this.earthLevelGain?.gain.setTargetAtTime(state.earthLevel ?? 1.0, now, smoothTime);

      // ── Per-engine dry levels (these control the dry path through earthBus only) ──
      // Water dry level
      this.waterLevelGain?.gain.setTargetAtTime(
        state.waterEnabled ? state.waterLevel : 0, now, smoothTime
      );
      // Water reverb send (pre-fader — unaffected by waterLevelGain) — S&H aware
      this.waterReverbSend?.gain.setTargetAtTime(
        state.waterEnabled ? shv('waterReverbSend', state.waterReverbSend) : 0, now, smoothTime
      );

      // Insects on/off gate (level controlled by WASM-side _insects1Gain/_insects2Gain)
      this.insectsLevelGain?.gain.setTargetAtTime(
        (state.insectsEnabled || state.insects2Enabled) ? 1.0 : 0, now, smoothTime
      );

      // Waves sample dry level (oceanSampleGain is source on/off; oceanLevelGain is the dry fader)
      this.oceanLevelGain?.gain.setTargetAtTime(
        state.oceanSampleEnabled ? state.oceanSampleLevel : 0, now, smoothTime
      );

      // Waves reverb send (pre-fader) — S&H aware
      this.oceanReverbSendNode?.gain.setTargetAtTime(
        state.oceanSampleEnabled ? shv('oceanReverbSend', state.oceanReverbSend) : 0, now, smoothTime
      );

      // Insects reverb send (pre-fader) — S&H aware
      this.insectsReverbSendNode?.gain.setTargetAtTime(
        (state.insectsEnabled || state.insects2Enabled) ? shv('insectsReverbSend', state.insectsReverbSend) : 0, now, smoothTime
      );

      this.fireLevelGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.fireReverbSendNode?.gain.setTargetAtTime(0, now, smoothTime);
    }
  }

  /**
   * Load the ocean sample (Ghetary beach recording)
   */
  private async loadOceanSample(): Promise<void> {
    if (!this.ctx) return;

    try {
      // Use public folder path (works in both dev and production)
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
      const response = await fetch(`${base}/samples/Ghetary-Waves-Rocks_cl-normalized.ogg`);
      if (!response.ok) {
        console.warn('Ocean sample not found, sample playback disabled');
        return;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      this.oceanSampleBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.oceanSampleLoaded = true;
      console.log('Ocean sample loaded:', this.oceanSampleBuffer.duration.toFixed(1), 'seconds');
      
      // Start playback if sample is enabled
      if (this.sliderState?.oceanSampleEnabled) {
        this.startOceanSamplePlayback();
      }
    } catch (e) {
      console.warn('Failed to load ocean sample:', e);
    }
  }

  /**
   * Start ocean sample playback with seamless looping
   */
  private startOceanSamplePlayback(): void {
    if (!this.ctx || !this.oceanSampleBuffer || !this.oceanSampleGain) return;

    // Stop previous source if any
    try {
      this.oceanSampleSource?.stop();
    } catch {
      // Ignore
    }

    // Create new source
    this.oceanSampleSource = this.ctx.createBufferSource();
    this.oceanSampleSource.buffer = this.oceanSampleBuffer;
    this.oceanSampleSource.loop = true;
    
    // Connect and start
    this.oceanSampleSource.connect(this.oceanSampleGain);
    this.oceanSampleSource.start();
    
    console.log('Ocean sample playback started');
  }

  /**
   * Load or update a Lead 4op FM preset for a given slot.
   * Called by App.tsx when preset dropdown changes.
   */
  async loadLeadPreset(slot: 'A' | 'B' | 'C' | 'D', presetId: string): Promise<void> {
    const preset = await loadLead4opFMPreset(presetId);
    switch (slot) {
      case 'A': this.lead1PresetA = preset; this.lead1PresetAId = presetId; break;
      case 'B': this.lead1PresetB = preset; this.lead1PresetBId = presetId; break;
      case 'C': this.lead2PresetC = preset; this.lead2PresetCId = presetId; break;
      case 'D': this.lead2PresetD = preset; this.lead2PresetDId = presetId; break;
    }
  }

  /**
   * Get current morphed params for a lead (for UI ADSR display)
   */
  getLeadMorphedParams(lead: 1 | 2): Lead4opFMMorphedParams | null {
    if (!this.sliderState) return null;
    if (lead === 1) {
      const m1Range = this.dualRanges['lead1Morph'];
      const morphMid = m1Range ? (m1Range.min + m1Range.max) / 2 : (this.sliderState.lead1Morph ?? 0);
      const morphed = morphPresets(
        this.lead1PresetA,
        this.lead1PresetB,
        morphMid,
        this.sliderState.lead1AlgorithmMode,
      );
      if (this.sliderState.lead1UseCustomAdsr) {
        return {
          ...morphed,
          attack: this.sliderState.lead1Attack,
          decay: this.sliderState.lead1Decay,
          sustain: this.sliderState.lead1Sustain,
          release: this.sliderState.lead1Release,
        };
      }
      return morphed;
    } else {
      const m2Range = this.dualRanges['lead2Morph'];
      const morphMid = m2Range ? (m2Range.min + m2Range.max) / 2 : (this.sliderState.lead2Morph ?? 0);
      const morphed = morphPresets(
        this.lead2PresetC,
        this.lead2PresetD,
        morphMid,
        this.sliderState.lead2AlgorithmMode,
      );
      if (this.sliderState.lead2UseCustomAdsr) {
        return {
          ...morphed,
          attack: this.sliderState.lead2Attack,
          decay: this.sliderState.lead2Decay,
          sustain: this.sliderState.lead2Sustain,
          release: this.sliderState.lead2Release,
        };
      }
      return morphed;
    }
  }

  /**
   * Play a 4-operator FM lead note using morphed preset parameters.
   * Supports lead1 (Preset A↔B) and lead2 (Preset C↔D).
   * Vibrato, glide, and delay are shared and independent of presets.
   */
  /**
   * Play a single lead FM note.
   * `velocity` controls timbre (FM mod depth, transient energy) AND amplitude —
   * it is NOT the same as bus gain. Per-lead mix level lives on lead1LevelGain /
   * lead2LevelGain (post reverb/granular tap), so note loudness can change independently
   * of the dry mixer fader.
   */
  private playLeadNote(
    frequency: number,
    velocity: number = 0.8,
    leadSource: 'lead' | 'lead1' | 'lead2' = 'lead1',
  ): void {
    if (!this.ctx || !this.leadGain || !this.sliderState) return;
    // Determine which lead to use and check if enabled
    const useLead2 = leadSource === 'lead2';
    const lead1Playable = !!(this.sliderState.leadEnabled || this.sliderState.leadRandomEnabled || this.sliderState.synthEuclideanMasterEnabled);
    const lead2Playable = !!this.sliderState.lead2Enabled;
    if (useLead2) {
      if (!lead2Playable) return;
    } else if (!lead1Playable) {
      return;
    }

    // Compute morphed FM params.
    // Random Walk (when enabled) uses smooth momentum-based motion within min/max.
    // Otherwise fall back to per-trigger random within min/max.
    // Sub-sequencer morph override takes priority when set.
    const morphKey = useLead2 ? 'lead2Morph' : 'lead1Morph';
    const morphRange = this.dualRanges[morphKey];
    const rawMorphMin = morphRange ? morphRange.min : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const rawMorphMax = morphRange ? morphRange.max : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const morphMin = Math.min(rawMorphMin, rawMorphMax);
    const morphMax = Math.max(rawMorphMin, rawMorphMax);
    let morphT: number;
    if (this.synthMorphOverride !== null) {
      // Sub-sequencer morph: value is 0-1, used directly as preset morph position
      morphT = this.synthMorphOverride;
    } else {
      const randomWalkEnabled = useLead2 ? this.sliderState.lead2MorphAuto : this.sliderState.lead1MorphAuto;
      const walkState = useLead2 ? this.leadMorphWalkStates.lead2 : this.leadMorphWalkStates.lead1;
      const walkPos = walkState.initialized ? walkState.position : 0.5;
      morphT = randomWalkEnabled
        ? (morphMin + walkPos * (morphMax - morphMin))
        : (morphMin + Math.random() * (morphMax - morphMin));
    }
    const morphed = useLead2
      ? morphPresets(this.lead2PresetC, this.lead2PresetD, morphT, this.sliderState.lead2AlgorithmMode)
      : morphPresets(this.lead1PresetA, this.lead1PresetB, morphT, this.sliderState.lead1AlgorithmMode);
    const useCustomAdsr = useLead2 ? this.sliderState.lead2UseCustomAdsr : this.sliderState.lead1UseCustomAdsr;
    const effectiveMorphed = useCustomAdsr
      ? {
          ...morphed,
          attack: useLead2 ? this.sliderState.lead2Attack : this.sliderState.lead1Attack,
          decay: useLead2 ? this.sliderState.lead2Decay : this.sliderState.lead1Decay,
          sustain: useLead2 ? this.sliderState.lead2Sustain : this.sliderState.lead1Sustain,
          release: useLead2 ? this.sliderState.lead2Release : this.sliderState.lead1Release,
        }
      : morphed;

    // Apply ratchet factor to tighten ADSR for ratchet retrigs
    if (this.synthRatchetFactor < 1) {
      const rf = this.synthRatchetFactor;
      effectiveMorphed.attack = (effectiveMorphed.attack ?? 0.01) * rf;
      effectiveMorphed.decay = (effectiveMorphed.decay ?? 0.3) * rf;
      effectiveMorphed.release = (effectiveMorphed.release ?? 0.5) * rf;
    }

    // Notify UI of the triggered morph position (0-1 within the range)
    if (this.onLeadMorphTrigger) {
      // When sub-sequencer override is active, morphT is already 0-1 directly
      const morphPos = this.synthMorphOverride !== null
        ? morphT
        : (morphMax > morphMin ? (morphT - morphMin) / (morphMax - morphMin) : 0.5);
      if (useLead2) {
        this.onLeadMorphTrigger({ lead1: -1, lead2: morphPos }); // -1 = unchanged
      } else {
        this.onLeadMorphTrigger({ lead1: morphPos, lead2: -1 });
      }
    }

    // Per-note velocity drives both lead timbre and note loudness.

    // ── Per-trigger lead S&H: resample lead dual-range keys on each note trigger ──
    // Uses the existing dualRanges/shSampledValues system (excluded from 10Hz loop).
    const leadSHPositions: Record<string, number> = {};
    for (const key of Object.keys(this.dualRanges)) {
      if (key.startsWith('lead') || key.startsWith('granularLead')) {
        this.sampleDualRangeKey(key, leadSHPositions);
      }
    }
    this.emitOwnedSamplePositions(leadSHPositions);

    if (velocity < 0.001) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.reportFxOnset(useLead2 ? 'lead2' : 'lead1', 'leadNote');

    // ─── Shared expression: vibrato & glide (NOT from presets) ───
    const vdRange = this.dualRanges['leadVibratoDepth'];
    const vibratoDepthMin = vdRange ? vdRange.min : (this.sliderState.leadVibratoDepth ?? 0);
    const vibratoDepthMax = vdRange ? vdRange.max : (this.sliderState.leadVibratoDepth ?? 0);
    const vibratoDepthNorm = vibratoDepthMin + Math.random() * (vibratoDepthMax - vibratoDepthMin);

    const vrRange = this.dualRanges['leadVibratoRate'];
    const vibratoRateMin = vrRange ? vrRange.min : (this.sliderState.leadVibratoRate ?? 0);
    const vibratoRateMax = vrRange ? vrRange.max : (this.sliderState.leadVibratoRate ?? 0);
    const vibratoRateNorm = vibratoRateMin + Math.random() * (vibratoRateMax - vibratoRateMin);

    const glRange = this.dualRanges['leadGlide'];
    const glideMin = glRange ? glRange.min : (this.sliderState.leadGlide ?? 0);
    const glideMax = glRange ? glRange.max : (this.sliderState.leadGlide ?? 0);
    const glide = glideMin + Math.random() * (glideMax - glideMin);

    // Notify UI of the triggered expression values
    if (this.onLeadExpressionTrigger) {
      this.onLeadExpressionTrigger({
        vibratoDepth: vibratoDepthMax > vibratoDepthMin
          ? (vibratoDepthNorm - vibratoDepthMin) / (vibratoDepthMax - vibratoDepthMin)
          : 0.5,
        vibratoRate: vibratoRateMax > vibratoRateMin
          ? (vibratoRateNorm - vibratoRateMin) / (vibratoRateMax - vibratoRateMin)
          : 0.5,
        glide: glideMax > glideMin
          ? (glide - glideMin) / (glideMax - glideMin)
          : 0.5,
      });
    }

    // ─── Shared delay (NOT from presets) ───
    const lead1DelayActive = !!(this.sliderState.leadEnabled || this.sliderState.leadRandomEnabled || this.sliderState.synthEuclideanMasterEnabled);
    const lead2DelayActive = !!this.sliderState.lead2Enabled;
    const delayAState = this.getSharedDelayAState(
      this.sliderState,
      lead1DelayActive,
      lead2DelayActive,
      this.isGranularBusArmed(this.sliderState, lead1DelayActive, lead2DelayActive),
    );

    const smoothTime = 0.05;
    this.sharedDelayA?.update(delayAState, now, smoothTime);

    // ─── Apply vibrato via carrier frequency modulation ───
    // The 4op FM note function handles the core synthesis, but we need to
    // apply glide and vibrato by wrapping the frequency
    let noteFreq = frequency;
    if (glide > 0.01) {
      // Glide is handled per-note by starting at a random nearby frequency
      // The 4op FM note uses the target freq; we pre-offset and let it play
      noteFreq = frequency * (1 + (Math.random() - 0.5) * glide * 0.2);
    }

    // Hold time — per-lead custom param (not in presets)
    const hold = useLead2 ? this.sliderState.lead2Hold : this.sliderState.lead1Hold;

    // ─── Per-engine tension → timbre randomization ───
    // Higher tension adds random offsets to FM params (mod index, feedback, beat detune)
    const leadTension = getEffectiveTension(
      this.sliderState.tension ?? 0.3,
      this.sliderState.leadTensionMode ?? 'follow',
      this.sliderState.leadTensionValue ?? 0,
    );
    if (leadTension > 0.05) {
      const spread = leadTension * 0.3; // max ±30% at tension=1
      const rOff = () => (Math.random() * 2 - 1) * spread;
      effectiveMorphed.mod1Index  = Math.max(0, effectiveMorphed.mod1Index  * (1 + rOff()));
      effectiveMorphed.mod2Index  = Math.max(0, effectiveMorphed.mod2Index  * (1 + rOff()));
      effectiveMorphed.mod1Feedback = Math.max(0, Math.min(1, (effectiveMorphed.mod1Feedback ?? 0) + rOff() * 0.15));
      effectiveMorphed.beatDetune = (effectiveMorphed.beatDetune ?? 0) + rOff() * 4;
      effectiveMorphed.carrier2Mix = Math.max(0, Math.min(1, (effectiveMorphed.carrier2Mix ?? 0.5) + rOff() * 0.2));
    }

    // WASM path: send morphed params + delay + noteOn to the lead FM worklet
    // WASM has separate outputs per lead — output[0]=lead1, output[1]=lead2.
    // Each output routes through its own level gain and pre-fader sends in the Web Audio graph.
    if (this.leadFmWasmReady && this.leadFmWasmNode) {
      const port = this.leadFmWasmNode.port;
      port.postMessage({ type: 'params', params: effectiveMorphed });
      port.postMessage({
        type: 'delay',
        params: {
          enabled: false,
          timeL: 0,
          timeR: 0,
          feedback: 0,
          mix: 0,
          filter: this.sliderState.delayAFilter ?? 2000,
          send: 0,
        },
      });
      port.postMessage({ type: 'noteOn', frequency: noteFreq, velocity, hold, leadIndex: useLead2 ? 1 : 0 });
      return;
    }

    // Play the 4op FM note — outputs into lead1Bus or lead2Bus for separate granular tapping
    const leadDest = useLead2
      ? (this.lead2Bus ?? this.leadGain)
      : (this.lead1Bus ?? this.leadGain);
    playLead4opFMNote(ctx, leadDest, noteFreq, velocity, effectiveMorphed, hold);

    // If glide, schedule frequency ramp on all carriers (handled inside playLead4opFMNote is per-note)
    // Vibrato: add LFO modulation if depth > threshold
    // (Vibrato is applied at the carrier level inside the note function is not possible after
    //  creation, so for shared vibrato we'd need to modify the approach slightly.
    //  For now, the note already plays without vibrato — vibrato will be added in a future iteration
    //  when the per-note function supports passing vibrato params.)
  }

  /**
   * Euclidean rhythm presets inspired by Indonesian gamelan and Steve Reich
   * These patterns reflect traditional colotomic structures, interlocking rhythms, and phasing
   */
  private readonly EUCLIDEAN_PRESETS: Record<string, { steps: number; hits: number; rotation: number; name: string }> = {
    // === GAMELAN PATTERNS ===
    // Lancaran - 16-beat cycle, gong on beat 16, kenong on 8, kempul on 4, 12
    'lancaran': { steps: 16, hits: 4, rotation: 0, name: 'Lancaran (16-beat)' },
    // Ketawang - 16-beat with 2 kenong, sparser
    'ketawang': { steps: 16, hits: 2, rotation: 0, name: 'Ketawang (sparse)' },
    // Ladrang - 32-beat cycle with specific accents
    'ladrang': { steps: 32, hits: 8, rotation: 0, name: 'Ladrang (32-beat)' },
    // Gangsaran - fast, dense 8-beat pattern
    'gangsaran': { steps: 8, hits: 4, rotation: 0, name: 'Gangsaran (fast)' },
    // Kotekan-style interlocking - 8 steps, 3 hits (common pattern)
    'kotekan': { steps: 8, hits: 3, rotation: 1, name: 'Kotekan (interlocking)' },
    // Kotekan counterpart - interlocks with kotekan when offset
    'kotekan2': { steps: 8, hits: 3, rotation: 4, name: 'Kotekan B (counter)' },
    // Srepegan - medium tempo 16-beat
    'srepegan': { steps: 16, hits: 6, rotation: 2, name: 'Srepegan (medium)' },
    // Sampak - fast 8-beat with 5 hits
    'sampak': { steps: 8, hits: 5, rotation: 0, name: 'Sampak (dense)' },
    // Ayak-ayakan - 16-beat with 3 hits, sparse and flowing
    'ayak': { steps: 16, hits: 3, rotation: 4, name: 'Ayak-ayakan (flowing)' },
    // Bonang panerus - high density interlocking
    'bonang': { steps: 12, hits: 5, rotation: 2, name: 'Bonang (12-beat)' },
    
    // === STEVE REICH / MINIMALIST PATTERNS ===
    // Classic phasing pattern from "Clapping Music"
    'clapping': { steps: 12, hits: 8, rotation: 0, name: 'Clapping Music (12/8)' },
    // Phase shifted version for polyrhythmic layering
    'clappingB': { steps: 12, hits: 8, rotation: 5, name: 'Clapping B (phase)' },
    // 3 against 4 polyrhythm base
    'poly3v4': { steps: 12, hits: 3, rotation: 0, name: '3 vs 4 (triplet)' },
    // 4 against 3 counterpart
    'poly4v3': { steps: 12, hits: 4, rotation: 0, name: '4 vs 3 (quarter)' },
    // 5 against 4 - quintuplet feel
    'poly5v4': { steps: 20, hits: 5, rotation: 0, name: '5 vs 4 (quint)' },
    // 7 beat additive pattern
    'additive7': { steps: 7, hits: 4, rotation: 0, name: 'Additive 7' },
    // 11 beat additive - prime number creates long cycle
    'additive11': { steps: 11, hits: 5, rotation: 0, name: 'Additive 11' },
    // 13 beat additive - longer prime cycle
    'additive13': { steps: 13, hits: 5, rotation: 0, name: 'Additive 13' },
    // Music for 18 Musicians inspired - 12 beat with 7 hits
    'reich18': { steps: 12, hits: 7, rotation: 3, name: 'Reich 18 (12/7)' },
    // Drumming-inspired pattern
    'drumming': { steps: 8, hits: 6, rotation: 1, name: 'Drumming (8/6)' },
    
    // === POLYRHYTHMIC COMBINATIONS ===
    // Very sparse - creates space
    'sparse': { steps: 16, hits: 1, rotation: 0, name: 'Sparse (16/1)' },
    // Ultra-dense - machine gun
    'dense': { steps: 8, hits: 7, rotation: 0, name: 'Dense (8/7)' },
    // Long cycle sparse
    'longSparse': { steps: 32, hits: 3, rotation: 0, name: 'Long Sparse (32/3)' },
    
    // Custom - uses slider values
    'custom': { steps: 16, hits: 4, rotation: 0, name: 'Custom' },
  };

  /**
   * Schedule sparse random melody notes for the lead synth (phrase-based).
   * Euclidean patterns are now handled by the continuous scheduler (startSynthEuclidScheduler).
   */
  private scheduleLeadMelody(): void {
    if (!this.sliderState || !this.harmonyState || !this.rng) return;
    
    // Clear any previously scheduled note timeouts
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    if (!this.sliderState.leadRandomEnabled) {
      if (this.leadMelodyTimer !== null) {
        clearTimeout(this.leadMelodyTimer);
        this.leadMelodyTimer = null;
      }
      return;
    }

    // Skip random lead1 notes only if Euclidean lanes already handle lead1/generic lead.
    // Lead 2 Euclidean lanes should not suppress the independent Lead 1 random melody.
    const isLead1Source = (s: string) => s === 'lead' || s === 'lead1';
    const euclideanLead1Active = this.sliderState.synthEuclideanMasterEnabled && (
      (this.sliderState.synthEuclid1Enabled && isLead1Source(this.sliderState.synthEuclid1Source ?? 'lead')) ||
      (this.sliderState.synthEuclid2Enabled && isLead1Source(this.sliderState.synthEuclid2Source ?? 'lead')) ||
      (this.sliderState.synthEuclid3Enabled && isLead1Source(this.sliderState.synthEuclid3Source ?? 'lead')) ||
      (this.sliderState.synthEuclid4Enabled && isLead1Source(this.sliderState.synthEuclid4Source ?? 'lead'))
    );

    if (!euclideanLead1Active) {
      const rng = this.rng;
      const scale = this.harmonyState.scaleFamily;
      const rootNote = this.effectiveRoot;
      const baseOctaveOffset = this.sliderState.lead1Octave;
      const octaveRange = this.sliderState.lead1OctaveRange ?? 2;
      const phraseDuration = (this.sliderState?.phraseLength ?? 16) * 1000;
      const density = this.sliderState.lead1Density;
      const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
      const baseLow = 64 + (baseOctaveOffset * 12);
      const baseHigh = baseLow + (octaveRange * 12);

      const chordMidi = this.harmonyState.currentChord?.midiNotes;
      const leadT = getEffectiveTension(
        this.sliderState.tension ?? 0.3,
        this.sliderState.leadTensionMode ?? 'follow',
        this.sliderState.leadTensionValue ?? 0,
      );
      const leadChordBias = leadT < 0 ? 0.9 : 0.9 - leadT * 0.4;
      for (let i = 0; i < notesThisPhrase; i++) {
        const timing = rng() * phraseDuration;
        let availableNotes = getScaleNotesInRange(scale, Math.max(24, baseLow), Math.min(108, baseHigh), rootNote);
        if (availableNotes.length === 0) continue;
        const midiNote = pickChordWeightedNote(rng, availableNotes, chordMidi, leadChordBias);
        const frequency = midiToFreq(midiNote);
        const velocity = rngFloat(rng, 0.5, 0.9); // Per-note loudness + timbre; per-lead mix level still lives on lead1LevelGain
        const timeoutId = window.setTimeout(() => {
          const idx = this.leadNoteTimeouts.indexOf(timeoutId);
          if (idx > -1) this.leadNoteTimeouts.splice(idx, 1);
          this.playLeadNote(frequency, velocity, 'lead1');
        }, timing);
        this.leadNoteTimeouts.push(timeoutId);
      }
    }

    // Schedule next phrase
    const timeUntilNextPhrase = getTimeUntilNextPhrase(this.sliderState?.phraseLength ?? 16) * 1000;
    this.leadMelodyTimer = window.setTimeout(() => {
      this.scheduleLeadMelody();
    }, timeUntilNextPhrase);
  }

  /**
   * Start or restart random lead melody scheduling (phrase-based)
   */
  private startLeadMelody(): void {
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    if (this.sliderState?.leadRandomEnabled) {
      this.scheduleLeadMelody();
    }
  }

  /**
   * Ensure AudioContext, master output, and lead audio chain exist for independent operation.
   * Similar to ensureDrumSynth() — allows lead Euclidean to run without master engine start.
   */
  private ensureSynthChain(): void {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    // Create master output chain if needed
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.sliderState?.masterVolume ?? 0.7;
      this.limiter = this.createMasterLimiter(this.ctx);
      this.wireMasterOutputChain(this.ctx);
      this.limiter.connect(this.ctx.destination);
    }
    // Dummy reverb node if real reverb not created yet
    if (!this.reverbNode) {
      this.reverbNode = this.ctx.createGain() as any;
    }
    // Create RNG if needed
    if (!this.rng) {
      const bucket = getUtcBucket(this.sliderState?.seedWindow as 'hour' | 'day' || 'hour');
      const seed = computeSeed(bucket, JSON.stringify(this.sliderState));
      this.rng = createRng(String(seed));
    }
    // Create harmony state if needed (for scale/note selection)
    if (!this.harmonyState && this.sliderState) {
      this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
      this.currentSeed = computeSeed(this.currentBucket, 'E_ROOT');
      this.harmonyState = createHarmonyState(
        `${this.currentBucket}|E_ROOT`,
        this.sliderState.tension,
        this.sliderState.chordRate,
        this.sliderState.voicingSpread,
        this.sliderState.detune,
        this.sliderState.scaleMode,
        this.sliderState.manualScale,
        this.sliderState.rootNote ?? 4,
        this.sliderState.phraseLength ?? 16,
        this.getHarmonyParams()
      );
    }
    // Create lead audio chain if not exists
    if (!this.leadGain) {
      const ctx = this.ctx;
      this.leadGain = ctx.createGain();
      const leadActive = this.sliderState?.leadEnabled || this.sliderState?.leadRandomEnabled || this.sliderState?.synthEuclideanMasterEnabled;
      this.leadGain.gain.value = leadActive ? 1.0 : 0;
      this.leadFilter = ctx.createBiquadFilter();
      this.leadFilter.type = 'lowpass';
      this.leadFilter.frequency.value = 4000;
      this.leadFilter.Q.value = 0.7;
      this.leadDry = ctx.createGain();
      this.leadDry.gain.value = leadActive ? 1.0 : 0;
      // Connect lead signal path (pre-fader reverb: leadLevel is the shared master, leadVoiceLevel provides final trim)
      this.leadVoiceLevel = ctx.createGain();
      this.leadVoiceLevel.gain.value = ENGINE_TRIMS.lead;
      this.leadFilter.connect(this.leadVoiceLevel);
      this.leadVoiceLevel.connect(this.leadDry);
      this.leadDry.connect(this.masterGain);

      // Create lead split buses for separate granular tapping + per-lead reverb sends
      if (!this.lead1Bus) {
        this.lead1Bus = ctx.createGain();
        this.lead1Bus.gain.value = 1.0;
      }
      if (!this.lead1LevelGain) {
        this.lead1LevelGain = ctx.createGain();
        this.lead1LevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
      }
      this.lead1Bus.connect(this.lead1LevelGain);
      this.lead1LevelGain.connect(this.leadFilter);
      if (!this.lead2Bus) {
        this.lead2Bus = ctx.createGain();
        this.lead2Bus.gain.value = 1.0;
      }
      if (!this.lead2LevelGain) {
        this.lead2LevelGain = ctx.createGain();
        this.lead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
      }
      this.lead2Bus.connect(this.lead2LevelGain);
      this.lead2LevelGain.connect(this.leadFilter);
      // Per-lead reverb sends (bus → send → reverb)
      this.lead1ReverbSend = ctx.createGain();
      this.lead1ReverbSend.gain.value = this.sliderState?.lead1ReverbSend ?? 0.5;
      this.lead1Bus.connect(this.lead1ReverbSend);
      this.lead1ReverbSend.connect(this.reverbNode!);
      this.lead2ReverbSend = ctx.createGain();
      this.lead2ReverbSend.gain.value = this.sliderState?.lead2ReverbSend ?? 0.5;
      this.lead2Bus.connect(this.lead2ReverbSend);
      this.lead2ReverbSend.connect(this.reverbNode!);
      this.ensureLeadDelaySends(ctx);

      // WASM lead connections (if WASM node exists, per-lead output routing)
      if (this.leadFmWasmNode) {
        // Lead 1 dry: output[0] → level gain → leadVoiceLevel (bypasses leadFilter)
        this.leadWasmLevelGain = ctx.createGain();
        this.leadWasmLevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
        this.leadFmWasmNode.connect(this.leadWasmLevelGain, 0);
        this.leadWasmLevelGain.connect(this.leadVoiceLevel!);
        // Lead 1 pre-fader sends
        this.leadFmWasmNode.connect(this.lead1ReverbSend, 0);
        if (this.granularLead1Send) {
          this.leadFmWasmNode.connect(this.granularLead1Send, 0);
        }
        if (this.lead1DelayASend) {
          this.leadFmWasmNode.connect(this.lead1DelayASend, 0);
        }
        if (this.lead1DelayBSend) {
          this.leadFmWasmNode.connect(this.lead1DelayBSend, 0);
        }

        // Lead 2 dry: output[1] → level gain → leadVoiceLevel (bypasses leadFilter)
        this.leadWasmLead2LevelGain = ctx.createGain();
        this.leadWasmLead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
        this.leadFmWasmNode.connect(this.leadWasmLead2LevelGain, 1);
        this.leadWasmLead2LevelGain.connect(this.leadVoiceLevel!);
        // Lead 2 pre-fader sends
        this.leadFmWasmNode.connect(this.lead2ReverbSend, 1);
        if (this.granularLead2Send) {
          this.leadFmWasmNode.connect(this.granularLead2Send, 1);
        }
        if (this.lead2DelayASend) {
          this.leadFmWasmNode.connect(this.lead2DelayASend, 1);
        }
        if (this.lead2DelayBSend) {
          this.leadFmWasmNode.connect(this.lead2DelayBSend, 1);
        }
      }
    }

    // Create pad synth voice chain if not exists (for independent pad voice triggering)
    if (!this.synthBus && this.ctx && this.masterGain) {
      const ctx = this.ctx;
      this.synthBus = ctx.createGain();
      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 1.0;
      this.pad1ReverbSend = ctx.createGain();
      this.pad1ReverbSend.gain.value = this.sliderState?.pad1ReverbSend ?? 0.7;
      this.pad2ReverbSend = ctx.createGain();
      this.pad2ReverbSend.gain.value = this.sliderState?.pad2ReverbSend ?? 0.7;
      this.synthDirect = ctx.createGain();
      this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain
      // Create pad split buses for separate granular tapping
      if (!this.pad1Bus) {
        this.pad1Bus = ctx.createGain();
        this.pad1Bus.gain.value = 1.0;
        this.pad1Bus.connect(this.synthBus);
      }
      if (!this.pad2Bus) {
        this.pad2Bus = ctx.createGain();
        this.pad2Bus.gain.value = 1.0;
        this.pad2Bus.connect(this.synthBus);
      }
      if (!this.pad1PreFaderBus) {
        this.pad1PreFaderBus = ctx.createGain();
        this.pad1PreFaderBus.gain.value = 1.0;
      }
      if (!this.pad2PreFaderBus) {
        this.pad2PreFaderBus = ctx.createGain();
        this.pad2PreFaderBus.gain.value = 1.0;
      }
      // Connect: synthBus → dryBus → synthDirect → masterGain (skip granular for independent mode)
      this.synthBus.connect(this.dryBus);
      // Pre-fader reverb sends: tap from per-pad buses (independent of pad level)
      if (this.pad1PreFaderBus && this.pad1ReverbSend) this.pad1PreFaderBus.connect(this.pad1ReverbSend);
      if (this.pad2PreFaderBus && this.pad2ReverbSend) this.pad2PreFaderBus.connect(this.pad2ReverbSend);
      this.dryBus.connect(this.synthDirect);
      this.pad1ReverbSend?.connect(this.reverbNode!);
      this.pad2ReverbSend?.connect(this.reverbNode!);
      this.synthDirect.connect(this.masterGain);
    }

    // Create pad voices if not exists
    // createVoices() is async in signature but has no real awaits — runs synchronously.
    // Start voices and connect buses inline to prevent race with scheduler.
    if (this.voices.length === 0 && this.ctx && this.synthBus) {
      void this.createVoices().then(() => {
        // Start oscillators so they can produce sound
        this.startVoices();
        // Connect voices to pad1Bus/pad2Bus based on pad2VoiceAssign
        const pad2a = this.sliderState?.pad2Enabled
          ? (this.sliderState?.pad2VoiceAssign ?? 0)
          : 0;
        this.lastPad2VoiceAssign = pad2a;
        if (this.pad1Bus && this.pad2Bus) {
          const pad1Bus = this.pad1Bus;
          const pad2Bus = this.pad2Bus;
          const pad1PreFaderBus = this.pad1PreFaderBus;
          const pad2PreFaderBus = this.pad2PreFaderBus;
          this.voices.forEach((voice, i) => {
            const isPad2 = (pad2a & (1 << i)) !== 0;
            voice.mixerGain.connect(isPad2 ? pad2Bus : pad1Bus);
            // Pre-fader connection for granular
            if (pad1PreFaderBus && pad2PreFaderBus) {
              voice.envelope.connect(isPad2 ? pad2PreFaderBus : pad1PreFaderBus);
            }
          });
        } else if (this.synthBus) {
          for (const voice of this.voices) {
            voice.mixerGain.connect(this.synthBus);
          }
        }
      });
    }
  }

  /**
   * Start continuous lead Euclidean scheduler (look-ahead pattern, like drum sequencer).
   * Runs independently of master engine start/stop.
   */
  private startSynthEuclidScheduler(): void {
    if (this.synthEuclidScheduleTimer || this.synthEuclidStarting) return; // Already running or booting

    this.synthEuclidStarting = true;
    void (async () => {
      try {
        this.ensureSynthChain();

        if (this.ctx?.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch (e) {
            console.warn('Synth Euclid context resume failed:', e);
          }
        }
        this.attachAudioContextMonitoring();
        this.unlockAudioContext();

        const usesSynthVoices = !!this.sliderState && [
          this.sliderState.synthEuclid1Enabled && this.sliderState.synthEuclid1Source.startsWith('synth'),
          this.sliderState.synthEuclid2Enabled && this.sliderState.synthEuclid2Source.startsWith('synth'),
          this.sliderState.synthEuclid3Enabled && this.sliderState.synthEuclid3Source.startsWith('synth'),
          this.sliderState.synthEuclid4Enabled && this.sliderState.synthEuclid4Source.startsWith('synth'),
        ].some(Boolean);
        if (usesSynthVoices) {
          await this.ensurePadWasmForIndependentSynth();
        }

        if (!this.ctx || !this.sliderState || !this.sliderState.synthEuclideanMasterEnabled || this.synthEuclidScheduleTimer) {
          return;
        }

        // Reset step positions
        this.synthEuclidCurrentStep = [0, 0, 0, 0];
        this.synthEuclidHitCounts = [0, 0, 0, 0];
        this.synthEuclidStepIndex = [0, 0, 0, 0];

        this.synthEuclidNextStepTime = [0, 0, 0, 0];

        const scheduleSynthEuclid = () => {
          try {
            if (!this.ctx || !this.sliderState || !this.sliderState.synthEuclideanMasterEnabled) {
              this.stopSynthEuclidScheduler();
              return;
            }

            const now = this.ctx.currentTime;
            const lookAhead = 0.1; // 100ms look-ahead
            const scheduleUntil = now + lookAhead;

            const timeJumpThreshold = 0.5;

            const baseBPM = getSharedSequencerBpm(this.sliderState);
            const tempo = this.sliderState.synthEuclideanTempo ?? 1;
            const beatDuration = 60 / (baseBPM * tempo); // Base beat duration, scaled by tempo multiplier

            const clockDivToSec = (clockDiv: ClockDivision) => clockDivToSeconds(clockDiv, beatDuration);

            const scale = this.harmonyState?.scaleFamily;
            const rootNote = this.effectiveRoot;
            const rng = this.rng;
            if (!rng) {
              this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 50);
              return;
            }

            // Read lane params fresh each tick (so changes take effect seamlessly)
            const laneParams = [
              { enabled: this.sliderState.synthEuclid1Enabled, preset: this.sliderState.synthEuclid1Preset, steps: this.sliderState.synthEuclid1Steps, hits: this.sliderState.synthEuclid1Hits, rotation: this.sliderState.synthEuclid1Rotation, noteMin: this.sliderState.synthEuclid1NoteMin, noteMax: this.sliderState.synthEuclid1NoteMax, level: this.sliderState.synthEuclid1Level, probability: this.sliderState.synthEuclid1Probability ?? 1.0, source: (this.sliderState.synthEuclid1Source ?? 'lead') as string },
              { enabled: this.sliderState.synthEuclid2Enabled, preset: this.sliderState.synthEuclid2Preset, steps: this.sliderState.synthEuclid2Steps, hits: this.sliderState.synthEuclid2Hits, rotation: this.sliderState.synthEuclid2Rotation, noteMin: this.sliderState.synthEuclid2NoteMin, noteMax: this.sliderState.synthEuclid2NoteMax, level: this.sliderState.synthEuclid2Level, probability: this.sliderState.synthEuclid2Probability ?? 1.0, source: (this.sliderState.synthEuclid2Source ?? 'lead') as string },
              { enabled: this.sliderState.synthEuclid3Enabled, preset: this.sliderState.synthEuclid3Preset, steps: this.sliderState.synthEuclid3Steps, hits: this.sliderState.synthEuclid3Hits, rotation: this.sliderState.synthEuclid3Rotation, noteMin: this.sliderState.synthEuclid3NoteMin, noteMax: this.sliderState.synthEuclid3NoteMax, level: this.sliderState.synthEuclid3Level, probability: this.sliderState.synthEuclid3Probability ?? 1.0, source: (this.sliderState.synthEuclid3Source ?? 'lead') as string },
              { enabled: this.sliderState.synthEuclid4Enabled, preset: this.sliderState.synthEuclid4Preset, steps: this.sliderState.synthEuclid4Steps, hits: this.sliderState.synthEuclid4Hits, rotation: this.sliderState.synthEuclid4Rotation, noteMin: this.sliderState.synthEuclid4NoteMin, noteMax: this.sliderState.synthEuclid4NoteMax, level: this.sliderState.synthEuclid4Level, probability: this.sliderState.synthEuclid4Probability ?? 1.0, source: (this.sliderState.synthEuclid4Source ?? 'lead') as string },
            ] as const;

        for (const laneIndex of SYNTH_LANE_INDICES) {
          const lane = laneParams[laneIndex];
          if (!lane.enabled) continue;

          // Resolve pattern params
          let steps: number, hits: number, rotation: number;
          if (lane.preset === 'custom') {
            steps = lane.steps; hits = lane.hits; rotation = lane.rotation;
          } else {
            const preset = this.EUCLIDEAN_PRESETS[lane.preset] ?? this.EUCLIDEAN_PRESETS.lancaran!;
            steps = preset.steps; hits = preset.hits;
            rotation = (preset.rotation + lane.rotation) % steps;
          }

          // Generate pattern (recalculated each tick so changes are seamless)
          const basePattern = seqEuclidean(steps, hits, rotation);
          const toggleMap = this.synthStepOverrides.triggerToggles[laneIndex];
          const pattern = toggleMap && toggleMap.size > 0
            ? basePattern.map((hit, i) => toggleMap.has(i) ? toggleMap.get(i)! : hit)
            : basePattern;

          // Sub-lane overrides (direction state read once — stable across steps)
          const ov = this.synthStepOverrides;

          // Ensure trig condition counters are initialized for this lane
          if (this.synthTrigConditionCounters[laneIndex].length < steps) {
            this.synthTrigConditionCounters[laneIndex] = new Array(steps).fill(0);
          }

          const laneClockDiv = this.synthEuclidClockDivs[laneIndex] ?? '1/8';
          const laneStepDuration = clockDivToSec(laneClockDiv);
          if (this.synthEuclidNextStepTime[laneIndex] <= 0 || now - this.synthEuclidNextStepTime[laneIndex] > timeJumpThreshold) {
            this.synthEuclidNextStepTime[laneIndex] = alignSequencerTime(now, laneStepDuration);
          }

          // Advance while within look-ahead window
          while (this.synthEuclidNextStepTime[laneIndex] < scheduleUntil) {
            const stepInPattern = this.synthEuclidStepIndex[laneIndex] % steps;
            const scheduleTime = this.synthEuclidNextStepTime[laneIndex];
            const delayMs = Math.max(0, (scheduleTime - now) * 1000);

            // Update step position for UI (synchronous, like drum sequencer)
            this.synthEuclidCurrentStep[laneIndex] = stepInPattern;

            // Track total steps for bar-boundary detection
            this.synthEuclidTotalStepCounts[laneIndex] += 1;

            // Evolve at bar boundaries (step 0 after at least one full cycle)
            if (stepInPattern === 0 && this.synthEuclidTotalStepCounts[laneIndex] > 1) {
              const bar = Math.floor(this.synthEuclidTotalStepCounts[laneIndex] / steps);
              const evolveConfig = this.synthEvolveConfigs[laneIndex];
              if (evolveConfig?.enabled) {
                // Use pad tension when lane source is a pad voice, synth tension otherwise
                const isPadSource = lane.source.startsWith('synth');
                const evolveTension = isPadSource
                  ? getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.padTensionMode ?? 'follow',
                      this.sliderState!.padTensionValue ?? 0,
                    )
                  : getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.synthEuclidTensionMode ?? 'follow',
                      this.sliderState!.synthEuclidTensionValue ?? 0,
                    );
                const laneOv = this.extractSynthLaneOverrides(laneIndex);
                // Convert pitch from absolute MIDI → relative offsets for evolve
                const ps = this.synthPitchSettings[laneIndex];
                if (laneOv.pitch && ps && ps.mode !== 'noteRange') {
                  laneOv.pitch = this.midiToOffsets(laneOv.pitch, ps);
                }
                const si = ps?.mode === 'notes' ? (SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11]) : undefined;
                // Pass current noteRange bounds (from override or sliderState) for noteRange mode evolution
                const nrOverride = this.synthNoteRangeOverrides[laneIndex];
                const currentNoteMin = nrOverride ? nrOverride.min : lane.noteMin;
                const currentNoteMax = nrOverride ? nrOverride.max : lane.noteMax;
                // Filter evolve's enabledSubLanes by the UI sub-lane enabled state
                const uiEnabled = this.synthSubLaneEnabled[laneIndex] ?? {};
                const evolveEnabledSubs = (evolveConfig.enabledSubLanes ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'])
                  .filter(sl => uiEnabled[sl] !== false);
                const result = evolveSynthLane(
                  laneOv,
                  { ...evolveConfig, enabledSubLanes: evolveEnabledSubs },
                  this.synthEvolveStates[laneIndex],
                  bar,
                  rng,
                  { effectiveTension: Math.max(0, evolveTension), swing: this.synthEuclidSwings[laneIndex], steps, scaleIntervals: si, pitchMode: ps?.mode, noteRangeMin: currentNoteMin, noteRangeMax: currentNoteMax },
                );
                if (result.changed) {
                  // Convert pitch from relative offsets → absolute MIDI for engine storage/scheduling
                  const offsetOverrides = result.overrides;
                  const midiOverrides: SynthLaneOverrides = { ...offsetOverrides };
                  if (offsetOverrides.pitch && ps && ps.mode !== 'noteRange') {
                    midiOverrides.pitch = this.offsetsToMidi(offsetOverrides.pitch, ps);
                  }
                  this.applySynthLaneOverrides(laneIndex, midiOverrides);
                  this.synthEuclidSwings[laneIndex] = result.swing;
                  this.onSynthEvolveTrigger?.(laneIndex);
                  // Push evolved overrides back to UI as offsets (no reverse conversion needed)
                  this.onSynthEvolveOverridesChanged?.(laneIndex, offsetOverrides);
                  // Handle noteRange evolution: store overrides and notify UI
                  if (result.noteRangeMin !== undefined && result.noteRangeMax !== undefined) {
                    this.synthNoteRangeOverrides[laneIndex] = { min: result.noteRangeMin, max: result.noteRangeMax };
                    this.onSynthNoteRangeEvolved?.(laneIndex, result.noteRangeMin, result.noteRangeMax);
                  }
                }
              }
            }

            if (pattern[stepInPattern]) {
              // Read sub-lane arrays fresh each step (so evolve changes take effect immediately)
              // Gate on per-lane enabled state — disabled sub-lanes are treated as absent
              const slEnabled = this.synthSubLaneEnabled[laneIndex] ?? {};
              const pitchOffsets = (slEnabled.pitch !== false) ? ov.pitch[laneIndex] : null;
              const pitchDir = ov.pitchDirection[laneIndex] ?? 'forward';
              const pitchSteps = pitchOffsets?.length ?? 0;
              const exprArr = (slEnabled.expression !== false) ? ov.expression[laneIndex] : null;
              const exprDir = ov.expressionDirection[laneIndex] ?? 'forward';
              const exprSteps = exprArr?.length ?? 0;
              const morphArr = (slEnabled.morph !== false) ? ov.morph[laneIndex] : null;
              const morphDir = ov.morphDirection[laneIndex] ?? 'forward';
              const morphSteps = morphArr?.length ?? 0;
              const probArr = (slEnabled.expression !== false) ? ov.probability[laneIndex] : null;
              const ratchetArr = (slEnabled.expression !== false) ? ov.ratchet[laneIndex] : null;
              const trigCondArr = ov.trigCondition[laneIndex];

              // Synchronously increment hit count for sub-lane accuracy
              this.synthEuclidHitCounts[laneIndex]++;

              // Trig condition gate (Elektron-style n:N)
              const tc: [number, number] = (trigCondArr && trigCondArr[stepInPattern]) ? trigCondArr[stepInPattern] : [1, 1];
              this.synthTrigConditionCounters[laneIndex][stepInPattern] =
                (this.synthTrigConditionCounters[laneIndex][stepInPattern] ?? 0) + 1;
              const visitCount = this.synthTrigConditionCounters[laneIndex][stepInPattern] ?? 0;
              const trigCondPassed = tc[1] <= 1 || (((visitCount - 1) % tc[1]) + 1 === tc[0]);

              // Per-step probability (from sub-lane, multiplied with lane probability)
              const stepProb = Math.max(0, Math.min(1, probArr ? (probArr[stepInPattern] ?? 1) : 1));

              if (trigCondPassed && rng() <= lane.probability * stepProb) {
                // Note selection via pitch sub-lane
                let midiNote: number | undefined;
                if (pitchOffsets && pitchSteps > 0) {
                  const pitchIdx = seqLaneIndex(
                    { enabled: true, steps: pitchSteps, direction: pitchDir, _ppForward: true },
                    this.synthEuclidHitCounts[laneIndex] - 1
                  );
                  // pitchOffsets are pre-converted to absolute MIDI notes by SynthPage
                  // Use the MIDI note directly — no noteMin/Max clamp (user chose these notes explicitly)
                  midiNote = Math.max(24, Math.min(108, pitchOffsets[pitchIdx] ?? 60));
                } else if (scale) {
                  // Use evolved noteRange overrides if available, else fall back to lane params
                  const nrOv = this.synthNoteRangeOverrides[laneIndex];
                  const effNoteMin = nrOv ? nrOv.min : lane.noteMin;
                  const effNoteMax = nrOv ? nrOv.max : lane.noteMax;
                  let availableNotes = getScaleNotesInRange(scale, Math.max(24, effNoteMin), Math.min(108, effNoteMax), rootNote);
                  if (availableNotes.length === 0) {
                    const midPoint = (effNoteMin + effNoteMax) / 2;
                    const allScaleNotes = getScaleNotesInRange(scale, 24, 108, rootNote);
                    if (allScaleNotes.length > 0) {
                      let nearest = allScaleNotes[0] ?? midPoint;
                      let nearestDist = Math.abs((allScaleNotes[0] ?? midPoint) - midPoint);
                      for (const sn of allScaleNotes) {
                        const d = Math.abs(sn - midPoint);
                        if (d < nearestDist) { nearestDist = d; nearest = sn; }
                      }
                      availableNotes = [nearest];
                    }
                  }
                  if (availableNotes.length > 0) {
                    const synthLeadT = getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.synthEuclidTensionMode ?? 'follow',
                      this.sliderState!.synthEuclidTensionValue ?? 0,
                    );
                    midiNote = pickChordWeightedNote(rng, availableNotes, this.harmonyState?.currentChord?.midiNotes, 0.9 - (synthLeadT < 0 ? 0 : synthLeadT) * 0.4);
                  }
                }

                if (midiNote !== undefined) {
                  const frequency = midiToFreq(midiNote);

                  // Expression/velocity sub-lane: dynamics × lane level.
                  // This is note velocity (timbre + amplitude), NOT bus gain.
                  // Per-lead mix level lives on lead1LevelGain/lead2LevelGain nodes.
                  let velocity: number;
                  if (exprArr && exprSteps > 0) {
                    const exprIdx = seqLaneIndex(
                      { enabled: true, steps: exprSteps, direction: exprDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    velocity = Math.max(0, Math.min(1, exprArr[exprIdx] ?? 1.0)) * lane.level;
                  } else {
                    velocity = 1.0 * lane.level;
                  }

                  // Morph sub-lane: set temporary override for playLeadNote
                  if (morphArr && morphSteps > 0) {
                    const morphIdx = seqLaneIndex(
                      { enabled: true, steps: morphSteps, direction: morphDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    this.synthMorphOverride = morphArr[morphIdx % morphSteps] ?? null;
                  } else {
                    this.synthMorphOverride = null;
                  }

                  const noteSource = lane.source;

                  // Ratchet sub-lane: polyrhythmic — indexed by hit count like expression
                  const ratchetSteps = ratchetArr?.length ?? 0;
                  let ratchetRaw: number | undefined;
                  if (ratchetArr && ratchetSteps > 0) {
                    const ratchetIdx = seqLaneIndex(
                      { enabled: true, steps: ratchetSteps, direction: exprDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    ratchetRaw = ratchetArr[ratchetIdx];
                  }
                  const ratchet = Math.max(1, Math.round(ratchetRaw ?? 1));

                  const capturedMorphOverride = this.synthMorphOverride;
                  const ratchetFactor = 1 / ratchet;
                  const ratchetClockDiv = this.synthEuclidClockDivs[laneIndex] ?? '1/8';
                  const ratchetStepDuration = clockDivToSec(ratchetClockDiv);
                  const ratchetWindow = ratchetStepDuration / ratchet;

                  for (let r = 0; r < ratchet; r++) {
                    const rDelayMs = delayMs + r * ratchetWindow * 1000;
                    const ratchetTimerId = window.setTimeout(() => {
                      this.ratchetTimers.delete(ratchetTimerId);
                      this.synthMorphOverride = capturedMorphOverride;
                      this.synthRatchetFactor = ratchetFactor;
                      if (noteSource === 'lead' || noteSource === 'lead1') {
                        this.playLeadNote(frequency, velocity, 'lead1');
                      } else if (noteSource === 'lead2') {
                        this.playLeadNote(frequency, velocity, 'lead2');
                      } else if (noteSource.startsWith('synth')) {
                        const voiceIndex = parseInt(noteSource.replace('synth', '')) - 1;
                        // Determine if this voice belongs to Pad 2
                        const isPad2 = this.sliderState?.pad2Enabled &&
                          ((this.sliderState?.pad2VoiceAssign ?? 0) & (1 << voiceIndex)) !== 0;
                        const padParamsOverride = this.sliderState
                          ? (this.buildPadTriggerState(isPad2 ? 'pad2' : 'pad1', this.sliderState, capturedMorphOverride) ?? undefined)
                          : undefined;
                        const padTriggerState = padParamsOverride ?? this.sliderState;
                        // Use correct pad's ADSR for ratchet note duration
                        const rAttack = isPad2
                          ? (padTriggerState?.pad2Attack ?? 0.1)
                          : (padTriggerState?.synthAttack ?? 0.1);
                        const rDecay = isPad2
                          ? (padTriggerState?.pad2Decay ?? 0.3)
                          : (padTriggerState?.synthDecay ?? 0.3);
                        const synthAttack = rAttack * ratchetFactor;
                        const synthDecay = rDecay * ratchetFactor;
                        const noteDuration = synthAttack + synthDecay + Math.max(0.1, (synthAttack + synthDecay) * 0.5);
                        this.triggerSynthVoice(voiceIndex, frequency, velocity, noteDuration, padParamsOverride);
                      }
                      this.synthMorphOverride = null;
                      this.synthRatchetFactor = 1;
                    }, rDelayMs);
                    this.ratchetTimers.add(ratchetTimerId);
                  }
                }
              }
            }

            // Fire step position callback (synchronous, like drum sequencer)
            this.onSynthStepPositionChange?.([...this.synthEuclidCurrentStep], [...this.synthEuclidHitCounts]);

            // Advance step with per-lane clock division and swing
            const laneSwing = this.synthEuclidSwings[laneIndex] ?? 0;
            const swingOffset = (this.synthEuclidStepIndex[laneIndex] % 2 === 1) ? laneStepDuration * laneSwing * 0.5 : 0;
            this.synthEuclidStepIndex[laneIndex]++;
            this.synthEuclidNextStepTime[laneIndex] += laneStepDuration + swingOffset;
          }
        }

            // Re-schedule in 50ms
            this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 50);
          } catch (e) {
            console.error('[Lead Euclid] Scheduler error:', e);
            this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 100);
          }
        };

        scheduleSynthEuclid();
      } finally {
        this.synthEuclidStarting = false;
      }
    })();
  }

  /**
   * Stop the continuous lead Euclidean scheduler
   */
  private stopSynthEuclidScheduler(): void {
    if (this.synthEuclidScheduleTimer) {
      clearTimeout(this.synthEuclidScheduleTimer);
      this.synthEuclidScheduleTimer = null;
    }
    this.synthMorphOverride = null; // Clear morph sub-lane override so slider control resumes
    this.synthNoteRangeOverrides = [null, null, null, null]; // Clear noteRange overrides so slider control resumes
    this.synthEuclidCurrentStep = [0, 0, 0, 0];
    this.synthEuclidHitCounts = [0, 0, 0, 0];
    this.synthEuclidStepIndex = [0, 0, 0, 0];
    this.synthEuclidNextStepTime = [0, 0, 0, 0];
    this.synthTrigConditionCounters = [[], [], [], []];
    this.onSynthStepPositionChange?.([0, 0, 0, 0], [0, 0, 0, 0]);

    // Clear tracked ratchet and voice release timers (prevent firing after stop)
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers.clear();
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers.clear();
    for (let i = 0; i < this.synthVoiceNoteOffTimers.length; i++) {
      const timerId = this.synthVoiceNoteOffTimers[i];
      if (timerId !== null) clearTimeout(timerId);
      this.synthVoiceNoteOffTimers[i] = null;
    }
    // Bump all voice note generations so in-flight WASM noteOff timers are invalidated
    this.synthVoiceNoteGen = this.synthVoiceNoteGen.map(gen => gen + 1) as Hex<number>;

    // Release all active synth voices so they don't drone after sequencer stops
    if (this.ctx && this.voices.length > 0) {
      const now = this.ctx.currentTime;
      const release = Math.max(0.001, this.sliderState?.synthRelease ?? 1.0);
      this.voices.forEach((voice, i) => {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
        // Always send WASM noteOff — Euclidean-owned voices may be active in WASM
        // even when JS voice.active is false
        if (this.padWasmReady && this.padWasmNode) {
          this.padWasmNode.port.postMessage({ type: 'noteOff', voiceIndex: i });
        }
      });
    }

    // Also tell WASM lead FM to release all notes
    if (this.leadFmWasmReady && this.leadFmWasmNode) {
      this.leadFmWasmNode.port.postMessage({ type: 'allNotesOff' });
    }

  }

  private startGranularTempoSyncScheduler(): void {
    if (this.granularTempoSyncTimer) return;
    if (!this.ctx || !this.sliderState) return;

    this.granularTempoSyncNextStepTime = [0, 0, 0, 0];

    const scheduleTempoSync = () => {
      try {
        if (!this.ctx || !this.sliderState || !this.hasGranularTempoSyncVoices(this.sliderState)) {
          this.stopGranularTempoSyncScheduler();
          return;
        }

        const nowTime = this.ctx.currentTime;
        const lookAhead = 0.1;
        const scheduleUntil = nowTime + lookAhead;
        const baseBPM = getSharedSequencerBpm(this.sliderState);
        const beatDuration = 60 / baseBPM;

        for (const voiceIndex of SYNTH_LANE_INDICES) {
          if (!this.isGranularTempoSyncVoiceActive(this.sliderState, voiceIndex)) {
            this.granularTempoSyncNextStepTime[voiceIndex] = 0;
            continue;
          }

          const voiceNum = voiceIndex + 1;
          const clockDiv = (this.sliderState[`granularV${voiceNum}TempoDiv` as keyof SliderState] as ClockDivision | undefined) ?? '1/8';
          const stepDuration = clockDivToSeconds(clockDiv, beatDuration);

          if (this.granularTempoSyncNextStepTime[voiceIndex] <= 0 || nowTime - this.granularTempoSyncNextStepTime[voiceIndex] > 0.5) {
            this.granularTempoSyncNextStepTime[voiceIndex] = alignSequencerTime(nowTime, stepDuration);
          }

          while (this.granularTempoSyncNextStepTime[voiceIndex] < scheduleUntil) {
            const scheduleTime = this.granularTempoSyncNextStepTime[voiceIndex];
            const delayMs = Math.max(0, (scheduleTime - nowTime) * 1000);
            const scheduledVoice = voiceIndex;

            window.setTimeout(() => {
              if (this.granularFxNode && this.sliderState && this.isGranularTempoSyncVoiceActive(this.sliderState, scheduledVoice)) {
                this.granularFxNode.port.postMessage({
                  type: 'granularTrigger',
                  voice: scheduledVoice,
                  velocity: 1,
                });
              }
            }, delayMs);

            this.granularTempoSyncNextStepTime[voiceIndex] += stepDuration;
          }
        }

        this.granularTempoSyncTimer = window.setTimeout(scheduleTempoSync, 50);
      } catch (e) {
        console.error('[Granular Tempo Sync] Scheduler error:', e);
        this.granularTempoSyncTimer = window.setTimeout(scheduleTempoSync, 100);
      }
    };

    scheduleTempoSync();
  }

  private stopGranularTempoSyncScheduler(): void {
    if (this.granularTempoSyncTimer) {
      clearTimeout(this.granularTempoSyncTimer);
      this.granularTempoSyncTimer = null;
    }
    this.granularTempoSyncNextStepTime = [0, 0, 0, 0];
  }

  getState(): EngineState {
    return {
      isRunning: this.isRunning,
      harmonyState: this.harmonyState,
      currentSeed: this.currentSeed,
      currentBucket: this.currentBucket,
      currentFilterFreq: this.currentFilterFreq,
      currentLfoValue: this.currentLfoValue,
      currentLfo2Value: this.currentLfo2Value,
      cofCurrentStep: this.harmonyState?.cof.currentStep ?? this.cofConfig.currentStep,
      fxOwners: this.getFxOwnerDebugState(),
    };
  }

  // Recording support - get audio context
  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  // Recording support - get limiter node (final output before destination)
  getLimiterNode(): DynamicsCompressorNode | null {
    return this.limiter;
  }

  // ===== STEM RECORDING SUPPORT =====
  // Get individual bus nodes for stem recording (pre-reverb)
  
  /**
   * Get synth bus output (dry synth before reverb send)
   * This is the synthDirect node which carries the dry synth signal to master
   */
  getSynthStemNode(): GainNode | null {
    return this.synthDirect;
  }

  /**
   * Get lead bus output (dry lead before reverb send)
   * This is the leadDry node which carries the dry lead signal to master
   */
  getLeadStemNode(): GainNode | null {
    return this.leadDry;
  }

  /**
   * Get drums bus output (drum master gain, includes delay)
   * Returns the drumSynth's internal master gain
   */
  getDrumsStemNode(): GainNode | null {
    return this.drumSynth?.getMasterGain() ?? null;
  }

  /**
   * Get waves bus output (sample after the shared waves filter)
   */
  getWavesStemNode(): BiquadFilterNode | null {
    return this.oceanFilter;
  }

  /**
   * Get granular bus output (now routed through Granular FX engine)
   * Returns the granularFxDirect node carrying processed granular audio
   */
  getGranularStemNode(): GainNode | null {
    return this.granularFxDirect;
  }

  /**
   * Get reverb output (wet reverb signal)
   * This is the reverbOutputGain node carrying the reverb wet signal
   */
  getReverbStemNode(): GainNode | null {
    return this.reverbOutputGain;
  }

  /**
   * Get all stem nodes as an object for easy iteration
   */
  getAllStemNodes(): Record<string, AudioNode | null> {
    return {
      synth: this.getSynthStemNode(),
      lead: this.getLeadStemNode(),
      drums: this.getDrumsStemNode(),
      waves: this.getWavesStemNode(),
      granular: this.getGranularStemNode(),
      reverb: this.getReverbStemNode(),
    };
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();

// Expose engine for console debugging
(window as unknown as Record<string, unknown>).__engine = audioEngine;
