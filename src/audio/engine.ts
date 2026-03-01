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
  PHRASE_LENGTH,
  CircleOfFifthsConfig,
  updateCircleOfFifthsDrift,
  calculateDriftedRoot,
} from './harmony';
import { getScaleNotesInRange, midiToFreq } from './scales';
import { createRng, generateRandomSequence, getUtcBucket, computeSeed, rngFloat } from './rng';
import { DrumSynth, DrumVoiceType } from './drumSynth';
import type { DrumStepOverrides, LaneDirection, TrigCondition, ClockDivision } from './drumSeqTypes';
import { seqLaneIndex, seqEuclidean } from './drumSequencer';
import type { SliderState } from '../ui/state';
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

// Worklet URLs from public folder - these are plain JS files that work in production
// Use absolute URLs for Safari compatibility
const getWorkletUrl = (filename: string): string => {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/ARCHIVE/worklets/${filename}`;
};
const granulatorWorkletUrl = getWorkletUrl('granulator.worklet.js');
const reverbWorkletUrl = getWorkletUrl('reverb.worklet.js');
const oceanWorkletUrl = getWorkletUrl('ocean.worklet.js');

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
}

import type { DrumEuclidEvolveConfig } from './drumSynth';

const defaultDrumEuclidEvolveConfig = (): DrumEuclidEvolveConfig => ({
  enabled: false,
  everyBars: 4,
  intensity: 0.5,
  methods: {
    rotateDrift: true,
    velocityBreath: true,
    swingDrift: true,
    probDrift: true,
    morphDrift: true,
    ghostNotes: true,
    ratchetSpray: true,
    hitDrift: true,
    pitchWalk: true,
  },
});

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private voices: Voice[] = [];
  private granulatorNode: AudioWorkletNode | null = null;
  private reverbNode: AudioWorkletNode | null = null;
  private reverbOutputGain: GainNode | null = null;
  private granulatorInputGain: GainNode | null = null;
  private granularWetHPF: BiquadFilterNode | null = null;
  private granularWetLPF: BiquadFilterNode | null = null;
  private granularReverbSend: GainNode | null = null;
  private granularDirect: GainNode | null = null;

  private synthBus: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private synthReverbSend: GainNode | null = null;
  private synthDirect: GainNode | null = null;

  // Lead synth (4op FM) with delay
  private leadGain: GainNode | null = null;
  private leadDelayL: DelayNode | null = null;
  private leadDelayR: DelayNode | null = null;
  private leadDelayFeedbackL: GainNode | null = null;
  private leadDelayFeedbackR: GainNode | null = null;
  private leadDelayMix: GainNode | null = null;
  private leadDry: GainNode | null = null;
  private leadMerger: ChannelMergerNode | null = null;
  private leadFilter: BiquadFilterNode | null = null;
  private leadReverbSend: GainNode | null = null;
  private leadDelayReverbSend: GainNode | null = null;
  private leadMelodyTimer: number | null = null;  // Random lead mode (phrase-based)
  private leadNoteTimeouts: number[] = [];  // Track scheduled random note timeouts
  private synthEuclidCurrentStep: number[] = [0, 0, 0, 0];  // Step position per lane
  private onSynthStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private synthEuclidHitCounts: number[] = [0, 0, 0, 0];  // Hit counts per lane

  // Continuous lead Euclidean scheduler (look-ahead, like drum sequencer)
  private synthEuclidScheduleTimer: number | null = null;
  private synthEuclidNextStepTime: number[] = [0, 0, 0, 0]; // AudioContext time per lane
  private synthEuclidStepIndex: number[] = [0, 0, 0, 0]; // Current step index per lane
  private synthEuclidClockDivs: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4']; // Per-lane clock division
  private synthEuclidSwings: number[] = [0, 0, 0, 0]; // Per-lane swing amount (0-1)

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

  // Ocean waves worklet
  private oceanNode: AudioWorkletNode | null = null;
  private oceanGain: GainNode | null = null;
  private oceanFilter: BiquadFilterNode | null = null;  // Shared filter for all ocean sources

  // Ocean sample player (real beach recording)
  private oceanSampleBuffer: AudioBuffer | null = null;
  private oceanSampleSource: AudioBufferSourceNode | null = null;
  private oceanSampleGain: GainNode | null = null;
  private oceanSampleLoaded = false;

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
  private effectiveRoot = 4;  // Current root note including CoF drift
  private currentSeed = 0;
  private currentBucket = '';
  private sliderState: SliderState | null = null;
  private _sliderStateJsonCache = '';
  private _sliderStateJsonDirty = true;
  private lastHardness = -1;  // Track to avoid unnecessary saturation curve updates
  private _lastPadEnabled: boolean | undefined = undefined;  // Track padEnabled transitions
  private voiceReleaseTimers: number[] = [];  // Track triggerSynthVoice release timeouts
  private ratchetTimers: number[] = [];  // Track ratchet retrigger timeouts

  // Temp drum synth management: debounce rapid previews and track cleanup timers
  private tempDrumSynthTimer: number | null = null;
  private tempDrumSynth: DrumSynth | null = null;
  private tempDrumGain: GainNode | null = null;
  private tempDrumReverb: GainNode | null = null;
  private rng: (() => number) | null = null;
  private isRunning = false;
  private isStarting = false; // true while start() is loading worklets — prevents updateParams teardown
  private _applyParamsDirty = false;  // Dirty flag for RAF-batched applyParams
  private _applyParamsRaf: number | null = null;  // RAF handle for batched applyParams
  private seedLocked = false; // When true, don't recompute seed on param changes (for morphing)

  private currentFilterFreq = 1000;  // Current filter frequency for UI display
  private currentLfoValue = 0;       // Current LFO 1 output (-1..+1 after depth) for UI
  private currentLfo2Value = 0;      // Current LFO 2 output (-1..+1 after depth) for UI

  private onStateChange: ((state: EngineState) => void) | null = null;
  private onLeadExpressionTrigger: ((expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) | null = null;
  private onLeadMorphTrigger: ((morph: { lead1: number; lead2: number }) => void) | null = null;
  private onLeadDelayTrigger: ((delay: { time: number; feedback: number; mix: number }) => void) | null = null;
  private onOceanWaveTrigger: ((wave: { duration: number; interval: number; foam: number; depth: number }) => void) | null = null;
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  private onDrumMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;
  private onPadMorphTrigger: ((morphPosition: number) => void) | null = null;
  private onPad2MorphTrigger: ((morphPosition: number) => void) | null = null;
  private onDrumEuclidEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onDrumStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private leadMorphTimer: number | null = null;

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
  private synthTrigConditionCounters: number[][] = [[], [], [], []];

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

  setOceanWaveCallback(callback: (wave: { duration: number; interval: number; foam: number; depth: number }) => void) {
    this.onOceanWaveTrigger = callback;
  }

  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void) {
    this.onDrumTrigger = callback;
    // Pass through to drum synth if it exists
    if (this.drumSynth) {
      this.drumSynth.setDrumTriggerCallback(callback);
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
    // Continuous scheduler reads overrides each tick — no restart needed
  }

  /** Set per-lane clock divisions for the synth Euclidean sequencer. */
  setSynthEuclidClockDivs(divs: ClockDivision[]) {
    this.synthEuclidClockDivs = [...divs];
  }

  /** Set per-lane swing amounts for the synth Euclidean sequencer. */
  setSynthEuclidSwings(swings: number[]) {
    this.synthEuclidSwings = [...swings];
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

  setDrumEuclidEvolveConfigs(configs: Partial<DrumEuclidEvolveConfig>[]) {
    this.pendingDrumEuclidEvolveConfigs = this.pendingDrumEuclidEvolveConfigs.map((current, laneIndex) => ({
      enabled: configs[laneIndex]?.enabled ?? current.enabled,
      everyBars: configs[laneIndex]?.everyBars ?? current.everyBars,
      intensity: configs[laneIndex]?.intensity ?? current.intensity,
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

  /**
   * Lazily create AudioContext + DrumSynth so the drum sequencer works
   * independently of the master play button. Synchronous creation;
   * context resume is fire-and-forget.
   */
  ensureDrumSynth(sliderState: SliderState): void {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.drumSynth) {
      // Need a master gain for drums
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = sliderState.masterVolume ?? 0.7;
        // Create limiter
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.001;
        this.limiter.release.value = 0.1;
        this.masterGain.connect(this.limiter);
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
      this.wireDrumSynthCallbacks();
    }
  }

  /** Wire all pending callbacks and overrides onto a freshly-created DrumSynth. */
  private wireDrumSynthCallbacks(): void {
    if (!this.drumSynth) return;
    if (this.onDrumTrigger) this.drumSynth.setDrumTriggerCallback(this.onDrumTrigger);
    if (this.onDrumMorphTrigger) this.drumSynth.setMorphTriggerCallback(this.onDrumMorphTrigger);
    if (this.onDrumEuclidEvolveTrigger) this.drumSynth.setEuclidEvolveTriggerCallback(this.onDrumEuclidEvolveTrigger);
    if (this.onDrumStepPositionChange) this.drumSynth.setStepPositionCallback(this.onDrumStepPositionChange);
    for (const voice of Object.keys(this.pendingMorphRanges) as DrumVoiceType[]) {
      const range = this.pendingMorphRanges[voice];
      if (range) this.drumSynth.setMorphRange(voice, range);
    }
    this.drumSynth.setEuclidEvolveConfigs(this.pendingDrumEuclidEvolveConfigs);
    if (this.pendingStepOverrides) {
      this.drumSynth.setStepOverrides(this.pendingStepOverrides);
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
        cofCurrentStep: this.cofConfig.currentStep,
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
      this.ctx = new AudioContextClass();
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
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.limiter = null;
      this.reverbNode = null;
      this.reverbOutputGain = null;
      // Null lead chain (createAudioGraph will recreate them)
      this.leadGain = null;
      this.leadFilter = null;
      this.leadDelayL = null;
      this.leadDelayR = null;
      this.leadDelayFeedbackL = null;
      this.leadDelayFeedbackR = null;
      this.leadDelayMix = null;
      this.leadDry = null;
      this.leadMerger = null;
      this.leadReverbSend = null;
      this.leadDelayReverbSend = null;
      // Null pad synth chain
      this.synthBus = null;
      this.dryBus = null;
      this.synthReverbSend = null;
      this.synthDirect = null;
      this.voices = [];
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.error('Web Audio API not supported');
      this.isStarting = false;
      throw new Error('Web Audio API not supported in this browser');
    }
    this.ctx = new AudioContextClass();
    console.log('AudioContext created, state:', this.ctx.state);
    
    // iOS Safari requires resume to be called in response to user interaction
    if (this.ctx.state === 'suspended') {
      console.log('AudioContext suspended, attempting resume...');
      await this.ctx.resume();
      console.log('AudioContext resumed, state:', this.ctx.state);
    }
    
    // iOS audio unlock with silent buffer
    this.unlockAudioContext();

    // Register worklets with error handling
    console.log('Loading worklets from:', granulatorWorkletUrl);
    try {
      await this.ctx.audioWorklet.addModule(granulatorWorkletUrl);
      console.log('Granulator worklet loaded');
    } catch (e) {
      console.error('Failed to load granulator worklet:', e);
      this.isStarting = false;
      throw e;
    }
    
    try {
      await this.ctx.audioWorklet.addModule(reverbWorkletUrl);
      console.log('Reverb worklet loaded');
    } catch (e) {
      console.error('Failed to load reverb worklet:', e);
      this.isStarting = false;
      throw e;
    }
    
    try {
      await this.ctx.audioWorklet.addModule(oceanWorkletUrl);
      console.log('Ocean worklet loaded');
    } catch (e) {
      console.error('Failed to load ocean worklet:', e);
      this.isStarting = false;
      throw e;
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
    }

    // Start voices
    this.startVoices();

    // Start phrase scheduling
    this.schedulePhraseUpdates();

    // Start continuous lead random-walk updates (for live morph indicator + parity behavior)
    this.startLeadMorphRandomWalk();

    // Start lead Euclidean scheduler if enabled
    this.stopSynthEuclidScheduler(); // Reset if already running from independent start
    if (this.sliderState?.synthEuclideanMasterEnabled) {
      this.startSynthEuclidScheduler();
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
    // Stop lead random melody timer
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    // Clear tracked voice release and ratchet timers
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers = [];
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers = [];

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

    // Disconnect and silence ocean worklet so waves stop
    if (this.oceanNode) {
      try { this.oceanNode.disconnect(); } catch { /* */ }
      this.oceanNode = null;
    }
    if (this.oceanGain) {
      try { this.oceanGain.disconnect(); } catch { /* */ }
      this.oceanGain = null;
    }
    if (this.oceanSampleGain) {
      try { this.oceanSampleGain.disconnect(); } catch { /* */ }
      this.oceanSampleGain = null;
    }
    if (this.oceanFilter) {
      try { this.oceanFilter.disconnect(); } catch { /* */ }
      this.oceanFilter = null;
    }

    // Disconnect granular and reverb worklets
    if (this.granulatorNode) {
      try { this.granulatorNode.disconnect(); } catch { /* */ }
      this.granulatorNode = null;
    }
    if (this.reverbNode) {
      try { this.reverbNode.disconnect(); } catch { /* */ }
      this.reverbNode = null;
    }
    if (this.reverbOutputGain) {
      try { this.reverbOutputGain.disconnect(); } catch { /* */ }
      this.reverbOutputGain = null;
    }

    // Disconnect synth bus chains
    if (this.synthBus) { try { this.synthBus.disconnect(); } catch { /* */ } this.synthBus = null; }
    if (this.dryBus) { try { this.dryBus.disconnect(); } catch { /* */ } this.dryBus = null; }
    if (this.synthReverbSend) { try { this.synthReverbSend.disconnect(); } catch { /* */ } this.synthReverbSend = null; }
    if (this.synthDirect) { try { this.synthDirect.disconnect(); } catch { /* */ } this.synthDirect = null; }

    // Disconnect lead synth chain
    if (this.leadGain) { try { this.leadGain.disconnect(); } catch { /* */ } this.leadGain = null; }
    if (this.leadFilter) { try { this.leadFilter.disconnect(); } catch { /* */ } this.leadFilter = null; }
    if (this.leadDelayFeedbackL) { try { this.leadDelayFeedbackL.disconnect(); } catch { /* */ } this.leadDelayFeedbackL = null; }
    if (this.leadDelayFeedbackR) { try { this.leadDelayFeedbackR.disconnect(); } catch { /* */ } this.leadDelayFeedbackR = null; }
    if (this.leadDelayL) { try { this.leadDelayL.disconnect(); } catch { /* */ } this.leadDelayL = null; }
    if (this.leadDelayR) { try { this.leadDelayR.disconnect(); } catch { /* */ } this.leadDelayR = null; }
    if (this.leadDelayMix) { try { this.leadDelayMix.disconnect(); } catch { /* */ } this.leadDelayMix = null; }
    if (this.leadDry) { try { this.leadDry.disconnect(); } catch { /* */ } this.leadDry = null; }
    if (this.leadMerger) { try { this.leadMerger.disconnect(); } catch { /* */ } this.leadMerger = null; }
    if (this.leadReverbSend) { try { this.leadReverbSend.disconnect(); } catch { /* */ } this.leadReverbSend = null; }
    if (this.leadDelayReverbSend) { try { this.leadDelayReverbSend.disconnect(); } catch { /* */ } this.leadDelayReverbSend = null; }

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
    this.stop();
  }

  updateParams(sliderState: SliderState): void {
    // Always update stored state and CoF config, even when not running
    const oldSeedWindow = this.sliderState?.seedWindow;
    this.sliderState = sliderState;
    this._sliderStateJsonDirty = true;

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

    // If drum is completely off and synth sequencer is off and engine isn't running, tear down context
    if (!this.isRunning && !this.isStarting && !sliderState.drumEnabled && !sliderState.drumEuclidMasterEnabled && !sliderState.synthEuclideanMasterEnabled) {
      if (this.drumSynth) {
        this.drumSynth.dispose();
        this.drumSynth = null;
      }
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
        this.masterGain = null;
        this.limiter = null;
        this.reverbNode = null;
        this.reverbOutputGain = null;
        // Null lead chain so ensureSynthChain() recreates them with the new context
        this.leadGain = null;
        this.leadFilter = null;
        this.leadDelayL = null;
        this.leadDelayR = null;
        this.leadDelayFeedbackL = null;
        this.leadDelayFeedbackR = null;
        this.leadDelayMix = null;
        this.leadDry = null;
        this.leadMerger = null;
        this.leadReverbSend = null;
        this.leadDelayReverbSend = null;
        // Null pad synth chain
        this.synthBus = null;
        this.dryBus = null;
        this.synthReverbSend = null;
        this.synthDirect = null;
        this.voices = [];
      }
    }

    // Synth Euclidean scheduler operates independently of master play (like drum sequencer)
    if (sliderState.synthEuclideanMasterEnabled && !this.synthEuclidScheduleTimer) {
      this.startSynthEuclidScheduler();
    } else if (!sliderState.synthEuclideanMasterEnabled && this.synthEuclidScheduleTimer) {
      this.stopSynthEuclidScheduler();
    }

    // Apply non-drum audio parameters if engine is running OR synth Euclidean is active
    // (Euclidean synth runs independently of master play, but needs continuous param updates)
    if (!this.ctx || (!this.isRunning && !sliderState.synthEuclideanMasterEnabled)) return;

    // If pad synth was just turned off, release all active synth voices immediately
    if (sliderState.padEnabled === false && this._lastPadEnabled !== false && this.voices.length > 0) {
      const now = this.ctx.currentTime;
      const release = sliderState.synthRelease || 1.0;
      for (const voice of this.voices) {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
      }
    }
    this._lastPadEnabled = sliderState.padEnabled;

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
        const release = sliderState.synthRelease || 1.0;
        for (const voice of this.voices) {
          if (voice.active) {
            voice.envelope.gain.cancelScheduledValues(now);
            voice.envelope.gain.setTargetAtTime(0, now, release / 4);
            voice.active = false;
          }
        }
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
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    // Synth bus (before granular)
    this.synthBus = ctx.createGain();

    // Dry bus (bypass granular) - just a splitter, level controlled by synthDirect
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    // Synth reverb send and direct gain (independent, not crossfade)
    this.synthReverbSend = ctx.createGain();
    this.synthReverbSend.gain.value = this.sliderState?.synthReverbSend ?? 0.7;

    this.synthDirect = ctx.createGain();
    this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain

    // Granular worklet
    this.granulatorNode = new AudioWorkletNode(ctx, 'granulator', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Granular input gain (for feedback control)
    this.granulatorInputGain = ctx.createGain();

    // Granular wet filters
    this.granularWetHPF = ctx.createBiquadFilter();
    this.granularWetHPF.type = 'highpass';
    this.granularWetHPF.frequency.value = this.sliderState?.wetHPF ?? 500;

    this.granularWetLPF = ctx.createBiquadFilter();
    this.granularWetLPF.type = 'lowpass';
    this.granularWetLPF.frequency.value = this.sliderState?.wetLPF ?? 8000;

    // Granular reverb send and direct gain (independent, not crossfade)
    this.granularReverbSend = ctx.createGain();
    this.granularReverbSend.gain.value = this.sliderState?.granularReverbSend ?? 0.8;

    this.granularDirect = ctx.createGain();
    this.granularDirect.gain.value = this.sliderState?.granularLevel ?? 0.4;

    // Reverb worklet
    this.reverbNode = new AudioWorkletNode(ctx, 'reverb', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Reverb output level
    this.reverbOutputGain = ctx.createGain();
    this.reverbOutputGain.gain.value = this.sliderState?.reverbLevel ?? 1.0;

    // Lead synth (Rhodes/Bell) with stereo ping-pong delay
    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = this.sliderState?.leadLevel ?? 0.4;

    this.leadFilter = ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.value = 4000;
    this.leadFilter.Q.value = 0.7;

    // Stereo ping-pong delay
    this.leadDelayL = ctx.createDelay(2);
    this.leadDelayR = ctx.createDelay(2);
    const delayTime = (this.sliderState?.leadDelayTime ?? 375) / 1000;
    this.leadDelayL.delayTime.value = delayTime;
    this.leadDelayR.delayTime.value = delayTime * 0.75; // Offset for stereo effect

    this.leadDelayFeedbackL = ctx.createGain();
    this.leadDelayFeedbackR = ctx.createGain();
    const feedback = this.sliderState?.leadDelayFeedback ?? 0.4;
    this.leadDelayFeedbackL.gain.value = feedback;
    this.leadDelayFeedbackR.gain.value = feedback;

    this.leadDelayMix = ctx.createGain();
    this.leadDelayMix.gain.value = this.sliderState?.leadDelayMix ?? 0.35;

    this.leadDry = ctx.createGain();
    this.leadDry.gain.value = 1.0;

    this.leadMerger = ctx.createChannelMerger(2);

    this.leadReverbSend = ctx.createGain();
    this.leadReverbSend.gain.value = this.sliderState?.leadReverbSend ?? 0.5;

    this.leadDelayReverbSend = ctx.createGain();
    this.leadDelayReverbSend.gain.value = this.sliderState?.leadDelayReverbSend ?? 0.4;

    // Ocean waves worklet (stereo output, no input)
    this.oceanNode = new AudioWorkletNode(ctx, 'ocean-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    // Send sample rate to ocean processor
    this.oceanNode.port.postMessage({ type: 'setSampleRate', sampleRate: ctx.sampleRate });
    // Send seed for deterministic randomness
    this.oceanNode.port.postMessage({ type: 'setSeed', seed: this.currentSeed });
    // Listen for wave trigger messages from worklet for UI updates
    this.oceanNode.port.onmessage = (e) => {
      if (e.data.type === 'waveStarted' && this.onOceanWaveTrigger) {
        this.onOceanWaveTrigger({
          duration: e.data.duration,
          interval: e.data.interval,
          foam: e.data.foam,
          depth: e.data.depth,
        });
      }
    };

    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = this.sliderState?.oceanWaveSynthEnabled ? (this.sliderState?.oceanWaveSynthLevel ?? 0.4) : 0;

    // Ocean sample player gain (starts at 0, crossfades in when enabled)
    this.oceanSampleGain = ctx.createGain();
    this.oceanSampleGain.gain.value = 0;

    // Create voices
    await this.createVoices();

    // Connect graph:
    // Voices -> SynthBus -> GranulatorInput -> Granulator -> WetHPF -> WetLPF -> GranularReverbSend -> Reverb -> Master
    //                                                                         -> GranularDirect -----------------> Master
    //                    -> DryBus --------------------------------------------------------> Reverb

    for (const voice of this.voices) {
      voice.mixerGain.connect(this.synthBus);
    }

    this.synthBus.connect(this.granulatorInputGain);
    this.synthBus.connect(this.dryBus);

    this.granulatorInputGain.connect(this.granulatorNode);
    this.granulatorNode.connect(this.granularWetHPF);
    this.granularWetHPF.connect(this.granularWetLPF);
    
    // Split granular output: reverb send and direct to master
    this.granularWetLPF.connect(this.granularReverbSend);
    this.granularWetLPF.connect(this.granularDirect);
    
    this.granularReverbSend.connect(this.reverbNode);
    this.granularDirect.connect(this.masterGain);

    // Split dry synth output: reverb send and direct to master
    this.dryBus.connect(this.synthReverbSend);
    this.dryBus.connect(this.synthDirect);
    
    this.synthReverbSend.connect(this.reverbNode);
    this.synthDirect.connect(this.masterGain);

    this.reverbNode.connect(this.reverbOutputGain);
    this.reverbOutputGain.connect(this.masterGain);

    // Lead synth signal path:
    // LeadGain -> LeadFilter -> LeadDry -----------------> Master
    //                       -> LeadDelayL -> LeadDelayFeedbackL -> LeadDelayR -> LeadDelayFeedbackR -> LeadDelayL (ping-pong)
    //                                     -> Merger(L)           -> Merger(R)
    //                       -> LeadReverbSend -> Reverb
    this.leadGain.connect(this.leadFilter);
    this.leadFilter.connect(this.leadDry);
    this.leadDry.connect(this.masterGain);

    // Ping-pong delay routing
    this.leadFilter.connect(this.leadDelayL);
    this.leadDelayL.connect(this.leadDelayFeedbackL);
    this.leadDelayFeedbackL.connect(this.leadDelayR);
    this.leadDelayR.connect(this.leadDelayFeedbackR);
    this.leadDelayFeedbackR.connect(this.leadDelayL); // Ping-pong feedback

    // Merge delays to stereo
    this.leadDelayL.connect(this.leadMerger, 0, 0); // Left channel
    this.leadDelayR.connect(this.leadMerger, 0, 1); // Right channel
    this.leadMerger.connect(this.leadDelayMix);
    this.leadDelayMix.connect(this.masterGain);

    // Lead delay reverb send (delay output also feeds reverb)
    this.leadDelayMix.connect(this.leadDelayReverbSend);
    this.leadDelayReverbSend.connect(this.reverbNode);

    // Lead reverb send (dry lead to reverb)
    this.leadFilter.connect(this.leadReverbSend);
    this.leadReverbSend.connect(this.reverbNode);

    // Ocean waves -> OceanGain -> OceanFilter -> Master
    // Ocean sample -> OceanSampleGain -> OceanFilter -> Master
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = this.sliderState?.oceanFilterType ?? 'lowpass';
    this.oceanFilter.frequency.value = this.sliderState?.oceanFilterCutoff ?? 8000;
    this.oceanFilter.Q.value = 0.5 + (this.sliderState?.oceanFilterResonance ?? 0.1) * 10;

    this.oceanNode.connect(this.oceanGain);
    this.oceanGain.connect(this.oceanFilter);
    this.oceanSampleGain.connect(this.oceanFilter);
    this.oceanFilter.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    
    // Detect iOS/mobile - these need MediaStream for background audio
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isIOS || isMobile) {
      // On mobile: ONLY connect to MediaStreamDestination
      // The HTML audio element will play this stream
      // Do NOT also connect to ctx.destination or you get double audio!
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      this.limiter.connect(this.mediaStreamDest);
      console.log('Mobile detected: Audio routed through MediaStream only (no double audio)');
    } else {
      // On desktop: Connect directly to destination (no MediaStream needed)
      this.limiter.connect(ctx.destination);
      this.mediaStreamDest = null;
      console.log('Desktop detected: Audio routed directly to destination');
    }

    // Load ocean sample asynchronously
    this.loadOceanSample();

    // Note: DrumSynth is created in start() after initializeHarmony() sets rng

    // Apply initial params
    this.applyParams(this.sliderState!);
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
      mixerGain.gain.value = s?.synthLevel ?? 0.6;

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
        const blended = data[endIndex] * fadeOut + data[startIndex] * fadeIn;
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

    // Create harmony state
    this.harmonyState = createHarmonyState(
      `${this.currentBucket}|E_ROOT`,
      this.sliderState.tension,
      this.sliderState.chordRate,
      this.sliderState.voicingSpread,
      this.sliderState.detune,
      this.sliderState.scaleMode,
      this.sliderState.manualScale,
      this.sliderState.rootNote ?? 4
    );

    // Apply initial chord (if synth chord sequencer is enabled)
    if (this.sliderState.synthChordSequencerEnabled !== false) {
      this.applyChord(this.harmonyState.currentChord.frequencies);
    }

    // Send random sequence to granulator
    this.sendGranulatorRandomSequence();

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

    // Send new random sequence to granulator
    this.sendGranulatorRandomSequence();

    this.notifyStateChange();
  }

  private sendGranulatorRandomSequence(): void {
    if (!this.granulatorNode || !this.rng) return;

    // Generate 10000 random values for grain scheduling
    const sequence = generateRandomSequence(this.rng, 10000);
    this.granulatorNode.port.postMessage({
      type: 'randomSequence',
      sequence,
    });
  }

  private schedulePhraseUpdates(): void {
    const scheduleNext = () => {
      const timeUntilNext = getTimeUntilNextPhrase();
      this.phraseTimer = window.setTimeout(() => {
        this.onPhraseBoundary();
        scheduleNext();
      }, timeUntilNext * 1000);
    };

    scheduleNext();
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
  
  private onPhraseBoundary(): void {
    if (!this.harmonyState || !this.sliderState) return;

    // sliderStateJson getter handles lazy refresh automatically

    const phraseIndex = getCurrentPhraseIndex();
    const homeRoot = this.sliderState.rootNote ?? 4;
    let forceNewChord = false;

    // Update Circle of Fifths drift
    if (this.cofConfig.enabled && this.rng) {
      const driftResult = updateCircleOfFifthsDrift(
        this.cofConfig,
        this.rng
      );
      
      // Force new chord if we drifted to a new key
      if (driftResult.didDrift) {
        forceNewChord = true;
      }
      
      this.cofConfig.currentStep = driftResult.newStep;
      this.cofConfig.phraseCounter = driftResult.newCounter;
      
      // Update slider state to reflect the current step (for UI sync)
      if (this.sliderState.cofCurrentStep !== driftResult.newStep) {
        this.sliderState = {
          ...this.sliderState,
          cofCurrentStep: driftResult.newStep
        };
      }
    }

    // Calculate effective root note (home + drift offset)
    const effectiveRoot = this.cofConfig.enabled 
      ? calculateDriftedRoot(homeRoot, this.cofConfig.currentStep)
      : homeRoot;
    
    // Store for use by lead synth and other components
    this.effectiveRoot = effectiveRoot;

    // If we drifted, force the harmony state to generate a new chord immediately
    if (forceNewChord) {
      // Reset phrasesUntilChange to 1 to force new chord generation
      this.harmonyState = {
        ...this.harmonyState,
        phrasesUntilChange: 1
      };
    }

    // Update harmony state with effective root
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
      effectiveRoot
    );

    // Apply new chord with crossfade (if synth chord sequencer is enabled)
    if (this.sliderState.synthChordSequencerEnabled !== false) {
      this.applyChord(this.harmonyState.currentChord.frequencies, true);
    }

    // Reseed granulator at phrase boundary
    this.sendGranulatorRandomSequence();

    this.notifyStateChange();
  }

  private applyChord(frequencies: number[], crossfade = false): void {
    if (!this.ctx || !this.sliderState || !this.rng) return;

    const state = this.sliderState;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const detune = state.detune;
    const waveSpread = state.waveSpread; // Max stagger time in seconds
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

    // Get ADSR from synth settings
    const attack = state.synthAttack;
    const decay = state.synthDecay;
    const sustain = state.synthSustain;
    const release = state.synthRelease;

    // Filter frequencies based on voice mask - only include notes for enabled voices
    const enabledFrequencies: number[] = [];
    for (let i = 0; i < Math.min(6, frequencies.length); i++) {
      if (voiceMask & (1 << i)) {
        enabledFrequencies.push(frequencies[i]);
      }
    }
    // If mask would result in no voices, use at least the first frequency
    if (enabledFrequencies.length === 0) {
      enabledFrequencies.push(frequencies[0]);
    }

    // Generate random stagger offsets for each voice using the RNG for determinism
    const voiceOffsets: number[] = [];
    for (let i = 0; i < this.voices.length; i++) {
      // Use RNG to get a random offset between 0 and waveSpread
      voiceOffsets.push(rng() * waveSpread);
    }
    // Sort offsets so voices come in at staggered but consistent intervals
    voiceOffsets.sort((a, b) => a - b);

    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      const isVoiceEnabled = (voiceMask & (1 << i)) !== 0;
      
      if (!isVoiceEnabled) {
        // Silence this voice
        if (voice.active) {
          const startTime = now;
          voice.envelope.gain.cancelScheduledValues(startTime);
          voice.envelope.gain.setTargetAtTime(0, startTime, release / 4);
          voice.active = false;
        }
        continue;
      }
      
      // Map enabled voice index to the filtered frequency list
      let enabledIndex = 0;
      for (let j = 0; j < i; j++) {
        if (voiceMask & (1 << j)) enabledIndex++;
      }
      const freq = enabledFrequencies[enabledIndex % enabledFrequencies.length] || frequencies[0];
      const voiceDelay = voiceOffsets[i]; // Staggered entry time for this voice

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
    }
  }

  /**
   * Trigger a single synth voice with a specific frequency.
   * Used by Euclidean sequencer to play individual synth notes.
   * @param voiceIndex Which voice (0-5) to trigger
   * @param frequency Note frequency in Hz
   * @param velocity Volume/intensity (0-1)
   * @param noteDuration Optional duration in seconds; if provided, schedules release after this time
   */
  triggerSynthVoice(voiceIndex: number, frequency: number, velocity: number, noteDuration?: number): void {
    if (!this.ctx || !this.sliderState || voiceIndex < 0 || voiceIndex >= this.voices.length) return;
    // Check padEnabled — if pad synth is off, don't trigger pad voices
    if (this.sliderState.padEnabled === false) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const voice = this.voices[voiceIndex];
    
    if (!voice) return;
    
    const state = this.sliderState;
    const isPad2Voice = state.pad2Enabled && ((state.pad2VoiceAssign ?? 0) & (1 << voiceIndex)) !== 0;
    const detune = state.detune;

    // Get ADSR from correct pad (scaled by ratchet factor for tighter envelope)
    const rf = this.synthRatchetFactor;
    const attack = (isPad2Voice ? state.pad2Attack : state.synthAttack) * rf;
    const decay = (isPad2Voice ? state.pad2Decay : state.synthDecay) * rf;
    const peakLevel = velocity;  // velocity scales the entire envelope amplitude
    const sustain = (isPad2Voice ? state.pad2Sustain : state.synthSustain) * velocity;
    const release = (isPad2Voice ? state.pad2Release : state.synthRelease) * rf;

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
          const idx = this.voiceReleaseTimers.indexOf(relTimerId);
          if (idx > -1) this.voiceReleaseTimers.splice(idx, 1);
        }, (noteDuration + release) * 1000);
        this.voiceReleaseTimers.push(relTimerId);
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
          const idx = this.voiceReleaseTimers.indexOf(relTimerId);
          if (idx > -1) this.voiceReleaseTimers.splice(idx, 1);
        }, (noteDuration + release) * 1000);
        this.voiceReleaseTimers.push(relTimerId);
      }
    }

    // ── Mod Envelope (Phase 2) — per-pad params ──
    const modEnvEnabled = isPad2Voice ? (state.pad2ModEnvEnabled ?? false) : (state.padModEnvEnabled ?? false);
    const modEnvDest = isPad2Voice ? (state.pad2ModEnvDest ?? 'filterCutoff') : (state.padModEnvDest ?? 'filterCutoff');
    if (modEnvEnabled && modEnvDest === 'oscBLevel') {
      const modAttack = isPad2Voice ? (state.pad2ModEnvAttack ?? 0.1) : (state.padModEnvAttack ?? 0.1);
      const modDecay = isPad2Voice ? (state.pad2ModEnvDecay ?? 0.3) : (state.padModEnvDecay ?? 0.3);
      const modSustain = isPad2Voice ? (state.pad2ModEnvSustain ?? 0) : (state.padModEnvSustain ?? 0);
      const modRelease = isPad2Voice ? (state.pad2ModEnvRelease ?? 0.5) : (state.padModEnvRelease ?? 0.5);
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

  private applyParams(state: SliderState): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const smoothTime = 0.05;

    // Helper: guard against NaN/Infinity in audio param values (crash prevention)
    const fin = (v: number, fallback: number): number => Number.isFinite(v) ? v : fallback;

    // Master volume
    this.masterGain?.gain.setTargetAtTime(fin(state.masterVolume, 0.5), now, smoothTime);

    // Voice parameters
    // Filter cutoff modulates between filterCutoffMin and filterCutoffMax
    const minCutoff = Math.min(state.filterCutoffMin ?? 200, state.filterCutoffMax ?? 8000);
    const maxCutoff = Math.max(state.filterCutoffMin ?? 200, state.filterCutoffMax ?? 8000);
    
    // ── LFO computation (Phase 2: all waveshapes, all destinations) ──
    const lfoDepth = state.padLfo1Depth ?? 0;
    const lfoDest = state.padLfo1Dest ?? 'none';
    const lfoRate = state.padLfo1Rate ?? 0.5;
    const lfoWave = state.padLfo1Wave ?? 'sine';

    // Filter cutoff sits at center of min/max range; LFO adds modulation on top
    const modAmount = 0.5;
    const cutoff = minCutoff + (maxCutoff - minCutoff) * modAmount;
    
    // Q (bandwidth/angle) is set directly from filterQ
    const filterQ = state.filterQ;
    
    // Resonance adds a peak boost at the cutoff frequency, modulated by hardness
    const resonanceBoost = state.filterResonance * (0.7 + state.hardness * 0.6);
    
    // Combined Q: base Q plus resonance boost
    // At very low cutoffs, increase Q for more aggressive filtering
    const lowCutoffBoost = cutoff < 200 ? (1 - cutoff / 200) * 4 : 0;
    const effectiveQ = filterQ + resonanceBoost * 8 + lowCutoffBoost;
    
    // Warmth: low shelf boost (0 to +8dB)
    const warmthGain = state.warmth * 8;
    
    // Presence: peaking EQ (-6dB to +6dB) - helps cut or boost mids
    // At 0.5 = neutral, below = cut harsh mids, above = boost presence
    const presenceGain = (state.presence - 0.5) * 12;

    // Pad oscillator params
    const oscAWave = (state.padOscAWave ?? 'sawtooth') as OscillatorType;
    const oscBWave = (state.padOscBWave ?? 'triangle') as OscillatorType;
    const subEnabled = state.padSubEnabled ?? false;
    const oscALevel = state.padOscALevel ?? 0.6;
    const oscBLevel = state.padOscBLevel ?? 0.4;

    // Osc Mix crossfade: 0=A only, 0.5=both full, 1=B only
    const oscMix = state.padOscMix ?? 0.5;
    const aMix = Math.min(1, 2 * (1 - oscMix));
    const bMix = Math.min(1, 2 * oscMix);
    const effectiveALevel = oscALevel * aMix;
    const effectiveBLevel = oscBLevel * bMix;

    // ── LFO value computation (via helper) ──
    const lfoValue = this.computeLfoValue(now, lfoRate, lfoDepth, lfoWave, lfoDest, this.lfo1State);

    // Store for UI visualization (real engine value)
    this.currentLfoValue = lfoValue;

    // ── LFO 2 value computation (via helper) ──
    const lfo2Depth = state.padLfo2Depth ?? 0;
    const lfo2Dest = state.padLfo2Dest ?? 'none';
    const lfo2Rate = state.padLfo2Rate ?? 0.5;
    const lfo2Wave = state.padLfo2Wave ?? 'sine';
    const lfo2Value = this.computeLfoValue(now, lfo2Rate, lfo2Depth, lfo2Wave, lfo2Dest, this.lfo2State);
    this.currentLfo2Value = lfo2Value;

    // ── Build Pad 1 derived param set ──
    const lfo1FiltMod = lfoDest === 'filterCutoff' ? lfoValue * (maxCutoff - minCutoff) * 0.5 : 0;
    const lfo2FiltMod = lfo2Dest === 'filterCutoff' ? lfo2Value * (maxCutoff - minCutoff) * 0.5 : 0;
    let modEnvFilterMod = 0, modEnvPitchCents = 0;
    if ((state.padModEnvEnabled ?? false) && (state.padModEnvDepth ?? 0) !== 0) {
      const mDest = state.padModEnvDest ?? 'filterCutoff';
      if (mDest === 'filterCutoff' || mDest === 'pitch') {
        const mA = state.padModEnvAttack ?? 0.1, mD = state.padModEnvDecay ?? 0.3, mS = state.padModEnvSustain ?? 0;
        const mCycle = mA + mD + 1, mPh = (now % mCycle) / mCycle;
        const mAP = mA / mCycle, mDP = (mA + mD) / mCycle;
        let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
        mV *= state.padModEnvDepth ?? 0;
        if (mDest === 'filterCutoff') modEnvFilterMod = mV * (maxCutoff - minCutoff);
        else modEnvPitchCents = mV * 400;
      }
    }

    const p1 = {
      oscAWave, oscBWave, subEnabled, subWave: (state.padSubWave ?? 'sine') as OscillatorType,
      effectiveALevel: fin(effectiveALevel, 0), effectiveBLevel: fin(effectiveBLevel, 0),
      subLevel: fin(state.padSubLevel ?? 0.3, 0.3), noiseLevel: fin(state.padNoiseLevel ?? 0.15, 0.15),
      fbEnabled: state.padFilterBEnabled ?? false,
      filterType: state.filterType as BiquadFilterType,
      finalCutoff: fin(Math.max(20, Math.min(20000, cutoff + lfo1FiltMod + lfo2FiltMod + modEnvFilterMod)), 1000),
      effectiveQ: fin(effectiveQ, 1),
      warmthGain: fin(warmthGain, 0), presenceGain: fin(presenceGain, 0),
      lfoAmpMod: fin(1 + (lfoDest === 'amplitude' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'amplitude' ? lfo2Value * 0.5 : 0), 1),
      lfoPitchCents: fin((lfoDest === 'pitch' ? lfoValue * 200 : 0) + (lfo2Dest === 'pitch' ? lfo2Value * 200 : 0) + modEnvPitchCents, 0),
      lfoOscBMod: fin((lfoDest === 'oscBLevel' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'oscBLevel' ? lfo2Value * 0.5 : 0), 0),
      lfoFilterBMod: fin((lfoDest === 'filterBCutoff' ? lfoValue * 2000 : 0) + (lfo2Dest === 'filterBCutoff' ? lfo2Value * 2000 : 0), 0),
      lfoDest, lfo2Dest,
      modEnvEnabled: state.padModEnvEnabled ?? false, modEnvDest: state.padModEnvDest ?? 'filterCutoff',
      oscADetune: state.padOscADetune ?? state.detune, oscBDetune: state.padOscBDetune ?? state.detune,
      filterBType: (state.padFilterBType ?? 'highpass') as BiquadFilterType,
      filterBFreq: fin(state.padFilterBCutoff ?? 200, 200),
      filterBResBoost: fin((state.padFilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(state.padFilterBQ ?? 1, 1),
      filterRouting: state.padFilterRouting ?? 'series',
      hardness: fin(state.hardness, 0.5),
    };

    this.currentFilterFreq = p1.finalCutoff;

    // ── Build Pad 2 derived param set (only when enabled + voices assigned) ──
    const pad2Assign = state.pad2VoiceAssign ?? 0;
    const pad2On = state.pad2Enabled === true;
    let p2 = p1;
    if (pad2On && pad2Assign) {
      const p2l1Dest = (state.pad2Lfo1Dest ?? 'none') as string;
      const p2l2Dest = (state.pad2Lfo2Dest ?? 'none') as string;
      const p2l1Val = this.computeLfoValue(now, state.pad2Lfo1Rate ?? 0.5, state.pad2Lfo1Depth ?? 0, state.pad2Lfo1Wave ?? 'sine', p2l1Dest, this.pad2Lfo1State);
      const p2l2Val = this.computeLfoValue(now, state.pad2Lfo2Rate ?? 0.5, state.pad2Lfo2Depth ?? 0, state.pad2Lfo2Wave ?? 'sine', p2l2Dest, this.pad2Lfo2State);

      const minC2 = Math.min(state.pad2FilterCutoffMin, state.pad2FilterCutoffMax);
      const maxC2 = Math.max(state.pad2FilterCutoffMin, state.pad2FilterCutoffMax);
      const tgtFilt2 = (p2l1Dest === 'filterCutoff' && (state.pad2Lfo1Depth ?? 0) > 0) || (p2l2Dest === 'filterCutoff' && (state.pad2Lfo2Depth ?? 0) > 0);
      void tgtFilt2; // LFO targeting info used implicitly via p2l1Val/p2l2Val filter mods below
      const cut2 = minC2 + (maxC2 - minC2) * 0.5;
      const res2 = state.pad2FilterResonance * (0.7 + state.pad2Hardness * 0.6);
      const lcb2 = cut2 < 200 ? (1 - cut2 / 200) * 4 : 0;

      let me2FMod = 0, me2PCents = 0;
      if ((state.pad2ModEnvEnabled ?? false) && (state.pad2ModEnvDepth ?? 0) !== 0) {
        const md = state.pad2ModEnvDest ?? 'filterCutoff';
        if (md === 'filterCutoff' || md === 'pitch') {
          const mA = state.pad2ModEnvAttack ?? 0.1, mD = state.pad2ModEnvDecay ?? 0.3, mS = state.pad2ModEnvSustain ?? 0;
          const mCy = mA + mD + 1, mPh = (now % mCy) / mCy, mAP = mA / mCy, mDP = (mA + mD) / mCy;
          let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
          mV *= state.pad2ModEnvDepth ?? 0;
          if (md === 'filterCutoff') me2FMod = mV * (maxC2 - minC2); else me2PCents = mV * 400;
        }
      }

      const oscMix2 = state.pad2OscMix ?? 0.5;
      const aMx2 = Math.min(1, 2 * (1 - oscMix2)), bMx2 = Math.min(1, 2 * oscMix2);

      p2 = {
        oscAWave: (state.pad2OscAWave ?? 'sawtooth') as OscillatorType,
        oscBWave: (state.pad2OscBWave ?? 'triangle') as OscillatorType,
        subEnabled: state.pad2SubEnabled ?? false,
        subWave: (state.pad2SubWave ?? 'sine') as OscillatorType,
        effectiveALevel: fin((state.pad2OscALevel ?? 0.6) * aMx2, 0),
        effectiveBLevel: fin((state.pad2OscBLevel ?? 0.4) * bMx2, 0),
        subLevel: fin(state.pad2SubLevel ?? 0.3, 0.3), noiseLevel: fin(state.pad2NoiseLevel ?? 0.15, 0.15),
        fbEnabled: state.pad2FilterBEnabled ?? false,
        filterType: (state.pad2FilterType ?? 'lowpass') as BiquadFilterType,
        finalCutoff: fin(Math.max(20, Math.min(20000, cut2 + (p2l1Dest === 'filterCutoff' ? p2l1Val * (maxC2 - minC2) * 0.5 : 0) + (p2l2Dest === 'filterCutoff' ? p2l2Val * (maxC2 - minC2) * 0.5 : 0) + me2FMod)), 1000),
        effectiveQ: fin(state.pad2FilterQ + res2 * 8 + lcb2, 1),
        warmthGain: fin(state.pad2Warmth * 8, 0),
        presenceGain: fin((state.pad2Presence - 0.5) * 12, 0),
        lfoAmpMod: fin(1 + (p2l1Dest === 'amplitude' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'amplitude' ? p2l2Val * 0.5 : 0), 1),
        lfoPitchCents: fin((p2l1Dest === 'pitch' ? p2l1Val * 200 : 0) + (p2l2Dest === 'pitch' ? p2l2Val * 200 : 0) + me2PCents, 0),
        lfoOscBMod: fin((p2l1Dest === 'oscBLevel' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'oscBLevel' ? p2l2Val * 0.5 : 0), 0),
        lfoFilterBMod: fin((p2l1Dest === 'filterBCutoff' ? p2l1Val * 2000 : 0) + (p2l2Dest === 'filterBCutoff' ? p2l2Val * 2000 : 0), 0),
        lfoDest: p2l1Dest as typeof p1.lfoDest, lfo2Dest: p2l2Dest as typeof p1.lfo2Dest,
        modEnvEnabled: state.pad2ModEnvEnabled ?? false, modEnvDest: state.pad2ModEnvDest ?? 'filterCutoff',
        oscADetune: state.pad2OscADetune ?? state.detune, oscBDetune: state.pad2OscBDetune ?? state.detune,
        filterBType: (state.pad2FilterBType ?? 'highpass') as BiquadFilterType,
        filterBFreq: fin(state.pad2FilterBCutoff ?? 200, 200),
        filterBResBoost: fin((state.pad2FilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(state.pad2FilterBQ ?? 1, 1),
        filterRouting: state.pad2FilterRouting ?? 'series',
        hardness: fin(state.pad2Hardness, 0.5),
      };
    }

    // ── Unified voice loop (per-voice pad selection) ──
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
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
      const voiceLevel = (pad2On && (pad2Assign & (1 << i))) ? (state.pad2Level ?? 0.6) : state.synthLevel;
      voice.mixerGain.gain.setTargetAtTime(voiceLevel, now, smoothTime);
    }

    // ── Saturation curves (per-pad, only on change) ──
    if (state.hardness !== this.lastHardness) {
      this.lastHardness = state.hardness;
      const curve1 = this.createSaturationCurve(state.hardness);
      for (let i = 0; i < this.voices.length; i++) {
        if (!(pad2On && (pad2Assign & (1 << i)))) this.voices[i].saturation.curve = curve1;
      }
    }
    if (pad2On && state.pad2Hardness !== this.pad2LastHardness) {
      this.pad2LastHardness = state.pad2Hardness;
      const curve2 = this.createSaturationCurve(state.pad2Hardness);
      for (let i = 0; i < this.voices.length; i++) {
        if (pad2Assign & (1 << i)) this.voices[i].saturation.curve = curve2;
      }
    }

    // Granular parameters
    if (this.granulatorNode) {
      // grainSize: use dualRanges if available (walk/sampleHold), else single value for both
      const grainSizeRange = this.dualRanges['grainSize'];
      const grainSizeMin = grainSizeRange ? grainSizeRange.min : state.grainSize;
      const grainSizeMax = grainSizeRange ? grainSizeRange.max : state.grainSize;
      this.granulatorNode.port.postMessage({
        type: 'params',
        params: {
          maxGrains: state.maxGrains,
          grainSizeMin,
          grainSizeMax,
          density: state.density,
          spray: state.spray,
          jitter: state.jitter,
          probability: state.grainProbability,
          pitchMode: state.grainPitchMode,
          pitchSpread: state.pitchSpread,
          stereoSpread: state.stereoSpread,
          feedback: Math.min(state.feedback, 0.35),
          level: state.granularLevel,
        },
      });
    }

    // Granular filters
    this.granularWetHPF?.frequency.setTargetAtTime(state.wetHPF, now, smoothTime);
    this.granularWetLPF?.frequency.setTargetAtTime(state.wetLPF, now, smoothTime);

    // Granular levels (independent: direct level and reverb send)
    // When granularEnabled is false, mute the output
    // When reverbEnabled is false, mute reverb send to save CPU
    const granularLevel = state.granularEnabled ? state.granularLevel : 0;
    const granularReverbSend = (state.granularEnabled && state.reverbEnabled) ? state.granularReverbSend : 0;
    this.granularDirect?.gain.setTargetAtTime(granularLevel, now, smoothTime);
    this.granularReverbSend?.gain.setTargetAtTime(granularReverbSend, now, smoothTime);

    // Synth levels (independent: direct level and reverb send)
    // Per-voice mixerGain controls pad 1 vs pad 2 level
    // synthDirect acts as pad-active mute gate
    // synthReverbSend controls how much goes to reverb (additive, not crossfade)
    // When reverbEnabled is false, mute reverb send to save CPU
    const padActive = state.padEnabled !== false;
    this.synthDirect?.gain.setTargetAtTime(padActive ? 1.0 : 0, now, smoothTime);
    this.synthReverbSend?.gain.setTargetAtTime(padActive && state.reverbEnabled ? state.synthReverbSend : 0, now, smoothTime);

    // Lead reverb send (mute if reverb disabled)
    this.leadReverbSend?.gain.setTargetAtTime(state.reverbEnabled ? state.leadReverbSend : 0, now, smoothTime);

    // Reverb parameters (only update if enabled to save CPU)
    // Guard: reverbNode may be a dummy GainNode (no .port) when Euclidean runs standalone
    if (this.reverbNode && (this.reverbNode as any).port && state.reverbEnabled) {
      (this.reverbNode as any).port.postMessage({
        type: 'params',
        params: {
          type: state.reverbType,
          quality: state.reverbQuality,  // ultra, balanced, lite
          decay: state.reverbDecay,
          size: state.reverbSize,
          diffusion: state.reverbDiffusion,
          modulation: state.reverbModulation,
          predelay: state.predelay,
          damping: state.damping,
          width: state.width,
        },
      });
    }

    // Reverb output level (mute if disabled)
    this.reverbOutputGain?.gain.setTargetAtTime(state.reverbEnabled ? state.reverbLevel : 0, now, smoothTime);

    // Lead synth parameters — keep gain active if Euclidean sequencer is driving lead
    const leadActive = state.leadEnabled || state.synthEuclideanMasterEnabled;
    this.leadGain?.gain.setTargetAtTime(leadActive ? state.leadLevel : 0, now, smoothTime);
    
    // Lead delay base time (per-note randomization in playLeadNote further adjusts this)
    const delayTime = fin((state.leadDelayTime ?? 375) / 1000, 0.375);
    this.leadDelayL?.delayTime.setTargetAtTime(delayTime, now, smoothTime);
    this.leadDelayR?.delayTime.setTargetAtTime(delayTime * 0.75, now, smoothTime);
    
    // Delay reverb send (mute if reverb disabled)
    this.leadDelayReverbSend?.gain.setTargetAtTime(state.reverbEnabled ? state.leadDelayReverbSend : 0, now, smoothTime);

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

    // Ocean waves parameters
    // Wave synth volume (crossfades based on enabled state)
    this.oceanGain?.gain.setTargetAtTime(
      state.oceanWaveSynthEnabled ? state.oceanWaveSynthLevel : 0, 
      now, 
      smoothTime
    );
    
    // Ocean sample volume (crossfades based on enabled state)
    this.oceanSampleGain?.gain.setTargetAtTime(
      state.oceanSampleEnabled ? state.oceanSampleLevel : 0, 
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
    
    // Ocean worklet parameters (wave synthesis)
    if (this.oceanNode) {
      const oceanParams = this.oceanNode.parameters;
      const setParam = (name: string, value: number) => {
        const param = oceanParams.get(name);
        if (param) param.setTargetAtTime(value, now, smoothTime);
      };
      
      setParam('intensity', state.oceanWaveSynthLevel);
      const durR = this.dualRanges['oceanDuration'];
      setParam('waveDurationMin', durR ? durR.min : state.oceanDuration);
      setParam('waveDurationMax', durR ? durR.max : state.oceanDuration);
      const intR = this.dualRanges['oceanInterval'];
      setParam('waveIntervalMin', intR ? intR.min : state.oceanInterval);
      setParam('waveIntervalMax', intR ? intR.max : state.oceanInterval);
      const foamR = this.dualRanges['oceanFoam'];
      setParam('foamMin', foamR ? foamR.min : state.oceanFoam);
      setParam('foamMax', foamR ? foamR.max : state.oceanFoam);
      const depR = this.dualRanges['oceanDepth'];
      setParam('depthMin', depR ? depR.min : state.oceanDepth);
      setParam('depthMax', depR ? depR.max : state.oceanDepth);
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
  private playLeadNote(frequency: number, velocity: number = 0.8, leadSource: 'lead' | 'lead1' | 'lead2' = 'lead1'): void {
    if (!this.ctx || !this.leadGain || !this.sliderState) return;
    // Allow playback if leadEnabled OR if Euclidean master is driving lead lanes
    if (!this.sliderState.leadEnabled && !this.sliderState.synthEuclideanMasterEnabled) return;

    // Determine which lead to use and check if enabled
    const useLead2 = leadSource === 'lead2';
    if (useLead2 && !this.sliderState.lead2Enabled) return;

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

    // Per-lead level
    const leadLevel = useLead2 ? this.sliderState.lead2Level : this.sliderState.lead1Level;
    const effectiveVelocity = velocity * leadLevel;
    if (effectiveVelocity < 0.001) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

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
    const dtRange = this.dualRanges['leadDelayTime'];
    const delayTimeMin = dtRange ? dtRange.min : (this.sliderState.leadDelayTime ?? 375);
    const delayTimeMax = dtRange ? dtRange.max : (this.sliderState.leadDelayTime ?? 375);
    const delayTime = delayTimeMin + Math.random() * (delayTimeMax - delayTimeMin);

    const dfRange = this.dualRanges['leadDelayFeedback'];
    const delayFeedbackMin = dfRange ? dfRange.min : (this.sliderState.leadDelayFeedback ?? 0.4);
    const delayFeedbackMax = dfRange ? dfRange.max : (this.sliderState.leadDelayFeedback ?? 0.4);
    const delayFeedback = delayFeedbackMin + Math.random() * (delayFeedbackMax - delayFeedbackMin);

    const dmRange = this.dualRanges['leadDelayMix'];
    const delayMixMin = dmRange ? dmRange.min : (this.sliderState.leadDelayMix ?? 0.35);
    const delayMixMax = dmRange ? dmRange.max : (this.sliderState.leadDelayMix ?? 0.35);
    const delayMix = delayMixMin + Math.random() * (delayMixMax - delayMixMin);

    const smoothTime = 0.05;
    this.leadDelayL?.delayTime.setTargetAtTime(delayTime / 1000, now, smoothTime);
    this.leadDelayR?.delayTime.setTargetAtTime((delayTime / 1000) * 0.75, now, smoothTime);
    this.leadDelayFeedbackL?.gain.setTargetAtTime(delayFeedback, now, smoothTime);
    this.leadDelayFeedbackR?.gain.setTargetAtTime(delayFeedback, now, smoothTime);
    this.leadDelayMix?.gain.setTargetAtTime(delayMix, now, smoothTime);

    if (this.onLeadDelayTrigger) {
      this.onLeadDelayTrigger({
        time: delayTimeMax > delayTimeMin
          ? (delayTime - delayTimeMin) / (delayTimeMax - delayTimeMin)
          : 0.5,
        feedback: delayFeedbackMax > delayFeedbackMin
          ? (delayFeedback - delayFeedbackMin) / (delayFeedbackMax - delayFeedbackMin)
          : 0.5,
        mix: delayMixMax > delayMixMin
          ? (delayMix - delayMixMin) / (delayMixMax - delayMixMin)
          : 0.5,
      });
    }

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

    // Play the 4op FM note — outputs into this.leadGain (shared bus)
    playLead4opFMNote(ctx, this.leadGain, noteFreq, effectiveVelocity, effectiveMorphed, hold);

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

    // Skip random lead notes if Euclidean lanes already handle lead sounds
    const isLeadSource = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
    const euclideanLeadActive = this.sliderState.synthEuclideanMasterEnabled && (
      (this.sliderState.synthEuclid1Enabled && isLeadSource(this.sliderState.synthEuclid1Source ?? 'lead')) ||
      (this.sliderState.synthEuclid2Enabled && isLeadSource(this.sliderState.synthEuclid2Source ?? 'lead')) ||
      (this.sliderState.synthEuclid3Enabled && isLeadSource(this.sliderState.synthEuclid3Source ?? 'lead')) ||
      (this.sliderState.synthEuclid4Enabled && isLeadSource(this.sliderState.synthEuclid4Source ?? 'lead'))
    );

    if (!euclideanLeadActive) {
      const rng = this.rng;
      const scale = this.harmonyState.scaleFamily;
      const rootNote = this.effectiveRoot;
      const baseOctaveOffset = this.sliderState.lead1Octave;
      const octaveRange = this.sliderState.lead1OctaveRange ?? 2;
      const phraseDuration = PHRASE_LENGTH * 1000;
      const density = this.sliderState.lead1Density;
      const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
      const baseLow = 64 + (baseOctaveOffset * 12);
      const baseHigh = baseLow + (octaveRange * 12);

      for (let i = 0; i < notesThisPhrase; i++) {
        const timing = rng() * phraseDuration;
        let availableNotes = getScaleNotesInRange(scale, Math.max(24, baseLow), Math.min(108, baseHigh), rootNote);
        if (availableNotes.length === 0) continue;
        const midiNote = availableNotes[Math.floor(rng() * availableNotes.length)];
        const frequency = midiToFreq(midiNote);
        const velocity = rngFloat(rng, 0.5, 0.9);
        const timeoutId = window.setTimeout(() => {
          const idx = this.leadNoteTimeouts.indexOf(timeoutId);
          if (idx > -1) this.leadNoteTimeouts.splice(idx, 1);
          this.playLeadNote(frequency, velocity, 'lead1');
        }, timing);
        this.leadNoteTimeouts.push(timeoutId);
      }
    }

    // Schedule next phrase
    const timeUntilNextPhrase = getTimeUntilNextPhrase() * 1000;
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
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    // Create master output chain if needed
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.sliderState?.masterVolume ?? 0.7;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.1;
      this.masterGain.connect(this.limiter);
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
        this.sliderState.rootNote ?? 4
      );
    }
    // Create lead audio chain if not exists
    if (!this.leadGain) {
      const ctx = this.ctx;
      this.leadGain = ctx.createGain();
      const leadActive = this.sliderState?.leadEnabled || this.sliderState?.synthEuclideanMasterEnabled;
      this.leadGain.gain.value = leadActive ? (this.sliderState?.leadLevel ?? 0.4) : 0;
      this.leadFilter = ctx.createBiquadFilter();
      this.leadFilter.type = 'lowpass';
      this.leadFilter.frequency.value = 4000;
      this.leadFilter.Q.value = 0.7;
      this.leadDelayL = ctx.createDelay(2);
      this.leadDelayR = ctx.createDelay(2);
      const delayTime = (this.sliderState?.leadDelayTime ?? 375) / 1000;
      this.leadDelayL.delayTime.value = delayTime;
      this.leadDelayR.delayTime.value = delayTime * 0.75;
      this.leadDelayFeedbackL = ctx.createGain();
      this.leadDelayFeedbackR = ctx.createGain();
      const feedback = this.sliderState?.leadDelayFeedback ?? 0.4;
      this.leadDelayFeedbackL.gain.value = feedback;
      this.leadDelayFeedbackR.gain.value = feedback;
      this.leadDelayMix = ctx.createGain();
      this.leadDelayMix.gain.value = this.sliderState?.leadDelayMix ?? 0.35;
      this.leadDry = ctx.createGain();
      this.leadDry.gain.value = 1.0;
      this.leadMerger = ctx.createChannelMerger(2);
      this.leadReverbSend = ctx.createGain();
      this.leadReverbSend.gain.value = this.sliderState?.leadReverbSend ?? 0.5;
      this.leadDelayReverbSend = ctx.createGain();
      this.leadDelayReverbSend.gain.value = this.sliderState?.leadDelayReverbSend ?? 0.4;
      // Connect lead signal path
      this.leadGain.connect(this.leadFilter);
      this.leadFilter.connect(this.leadDry);
      this.leadDry.connect(this.masterGain);
      // Ping-pong delay
      this.leadFilter.connect(this.leadDelayL);
      this.leadDelayL.connect(this.leadDelayFeedbackL);
      this.leadDelayFeedbackL.connect(this.leadDelayR);
      this.leadDelayR.connect(this.leadDelayFeedbackR);
      this.leadDelayFeedbackR.connect(this.leadDelayL);
      this.leadDelayL.connect(this.leadMerger, 0, 0);
      this.leadDelayR.connect(this.leadMerger, 0, 1);
      this.leadMerger.connect(this.leadDelayMix);
      this.leadDelayMix.connect(this.masterGain);
      this.leadDelayMix.connect(this.leadDelayReverbSend);
      this.leadDelayReverbSend.connect(this.reverbNode!);
      this.leadFilter.connect(this.leadReverbSend);
      this.leadReverbSend.connect(this.reverbNode!);
    }

    // Create pad synth voice chain if not exists (for independent pad voice triggering)
    if (!this.synthBus && this.ctx && this.masterGain) {
      const ctx = this.ctx;
      this.synthBus = ctx.createGain();
      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 1.0;
      this.synthReverbSend = ctx.createGain();
      this.synthReverbSend.gain.value = this.sliderState?.synthReverbSend ?? 0.7;
      this.synthDirect = ctx.createGain();
      this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain
      // Connect: synthBus → dryBus → synthDirect → masterGain (skip granular for independent mode)
      this.synthBus.connect(this.dryBus);
      this.dryBus.connect(this.synthReverbSend);
      this.dryBus.connect(this.synthDirect);
      this.synthReverbSend.connect(this.reverbNode!);
      this.synthDirect.connect(this.masterGain);
    }

    // Create pad voices if not exists
    if (this.voices.length === 0 && this.ctx && this.synthBus) {
      // Use synchronous voice creation (createVoices is async but only for the await keyword)
      void this.createVoices().then(() => {
        // Start oscillators so they can produce sound
        this.startVoices();
        // Connect voices to synthBus
        if (this.synthBus) {
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
    if (this.synthEuclidScheduleTimer) return; // Already running

    this.ensureSynthChain();

    // Restore delay feedback gains (may have been zeroed by stopSynthEuclidScheduler)
    const feedback = this.sliderState?.leadDelayFeedback ?? 0.4;
    const delayMixLevel = this.sliderState?.leadDelayMix ?? 0.35;
    const restoreNow = this.ctx?.currentTime ?? 0;
    this.leadDelayFeedbackL?.gain.setTargetAtTime(feedback, restoreNow, 0.02);
    this.leadDelayFeedbackR?.gain.setTargetAtTime(feedback, restoreNow, 0.02);
    this.leadDelayMix?.gain.setTargetAtTime(delayMixLevel, restoreNow, 0.02);

    // Reset step positions
    this.synthEuclidCurrentStep = [0, 0, 0, 0];
    this.synthEuclidHitCounts = [0, 0, 0, 0];
    this.synthEuclidStepIndex = [0, 0, 0, 0];

    const now = this.ctx!.currentTime;
    this.synthEuclidNextStepTime = [now, now, now, now];

    const scheduleSynthEuclid = () => {
      try {
        if (!this.ctx || !this.sliderState || !this.sliderState.synthEuclideanMasterEnabled) {
          this.stopSynthEuclidScheduler();
          return;
        }

        const now = this.ctx.currentTime;
        const lookAhead = 0.1; // 100ms look-ahead
        const scheduleUntil = now + lookAhead;

        const baseBPM = this.sliderState.drumEuclidBaseBPM ?? 120;
        const tempo = this.sliderState.synthEuclideanTempo ?? 1;
        const beatDuration = 60 / (baseBPM * tempo); // Base beat duration, scaled by tempo multiplier

        // Helper: convert per-lane clock division to seconds (same as drum scheduler)
        const clockDivToSec = (clockDiv: ClockDivision): number => {
          switch (clockDiv) {
            case '1/4': return beatDuration;
            case '1/8': return beatDuration / 2;
            case '1/16': return beatDuration / 4;
            case '1/8T': return beatDuration / 3;
            default: return beatDuration / 2;
          }
        };

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
        ];

        for (let laneIndex = 0; laneIndex < 4; laneIndex++) {
          const lane = laneParams[laneIndex];
          if (!lane.enabled) continue;

          // Resolve pattern params
          let steps: number, hits: number, rotation: number;
          if (lane.preset === 'custom') {
            steps = lane.steps; hits = lane.hits; rotation = lane.rotation;
          } else {
            const preset = this.EUCLIDEAN_PRESETS[lane.preset] || this.EUCLIDEAN_PRESETS.lancaran;
            steps = preset.steps; hits = preset.hits;
            rotation = (preset.rotation + lane.rotation) % steps;
          }

          // Generate pattern (recalculated each tick so changes are seamless)
          const basePattern = seqEuclidean(steps, hits, rotation);
          const toggleMap = this.synthStepOverrides.triggerToggles[laneIndex];
          const pattern = toggleMap && toggleMap.size > 0
            ? basePattern.map((hit, i) => toggleMap.has(i) ? toggleMap.get(i)! : hit)
            : basePattern;

          // Sub-lane overrides
          const ov = this.synthStepOverrides;
          const pitchOffsets = ov.pitch[laneIndex];
          const pitchDir = ov.pitchDirection[laneIndex] ?? 'forward';
          const pitchSteps = pitchOffsets?.length ?? 0;

          const exprArr = ov.expression[laneIndex];
          const exprDir = ov.expressionDirection[laneIndex] ?? 'forward';
          const exprSteps = exprArr?.length ?? 0;

          const morphArr = ov.morph[laneIndex];
          const morphDir = ov.morphDirection[laneIndex] ?? 'forward';
          const morphSteps = morphArr?.length ?? 0;

          const probArr = ov.probability[laneIndex];
          const ratchetArr = ov.ratchet[laneIndex];
          const trigCondArr = ov.trigCondition[laneIndex];


          // Ensure trig condition counters are initialized for this lane
          if (this.synthTrigConditionCounters[laneIndex].length < steps) {
            this.synthTrigConditionCounters[laneIndex] = new Array(steps).fill(0);
          }

          // Advance while within look-ahead window
          while (this.synthEuclidNextStepTime[laneIndex] < scheduleUntil) {
            const stepInPattern = this.synthEuclidStepIndex[laneIndex] % steps;
            const scheduleTime = this.synthEuclidNextStepTime[laneIndex];
            const delayMs = Math.max(0, (scheduleTime - now) * 1000);

            // Update step position for UI (synchronous, like drum sequencer)
            this.synthEuclidCurrentStep[laneIndex] = stepInPattern;

            if (pattern[stepInPattern]) {
              // Synchronously increment hit count for sub-lane accuracy
              this.synthEuclidHitCounts[laneIndex]++;

              // Trig condition gate (Elektron-style n:N)
              const tc: [number, number] = (trigCondArr && trigCondArr[stepInPattern]) ? trigCondArr[stepInPattern] : [1, 1];
              this.synthTrigConditionCounters[laneIndex][stepInPattern] += 1;
              const visitCount = this.synthTrigConditionCounters[laneIndex][stepInPattern];
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
                  let availableNotes = getScaleNotesInRange(scale, Math.max(24, lane.noteMin), Math.min(108, lane.noteMax), rootNote);
                  if (availableNotes.length === 0) {
                    const midPoint = (lane.noteMin + lane.noteMax) / 2;
                    const allScaleNotes = getScaleNotesInRange(scale, 24, 108, rootNote);
                    if (allScaleNotes.length > 0) {
                      let nearest = allScaleNotes[0];
                      let nearestDist = Math.abs(allScaleNotes[0] - midPoint);
                      for (const sn of allScaleNotes) {
                        const d = Math.abs(sn - midPoint);
                        if (d < nearestDist) { nearestDist = d; nearest = sn; }
                      }
                      availableNotes = [nearest];
                    }
                  }
                  if (availableNotes.length > 0) {
                    midiNote = availableNotes[Math.floor(rng() * availableNotes.length)];
                  }
                }

                if (midiNote !== undefined) {
                  const frequency = midiToFreq(midiNote);

                  // Expression/velocity sub-lane: use expression value as velocity multiplier when enabled
                  // (matches drum scheduler: constant 1.0 when expression is off)
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
                      const rIdx = this.ratchetTimers.indexOf(ratchetTimerId);
                      if (rIdx > -1) this.ratchetTimers.splice(rIdx, 1);
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

                        // Resolve effective morph position:
                        // 1) Sub-sequencer morph override takes priority
                        // 2) S&H dual range on padMorph/pad2Morph → per-trigger random
                        // 3) Fall back to current slider value (no override)
                        let effectiveMorph = capturedMorphOverride;
                        if (effectiveMorph === null) {
                          const morphKey = isPad2 ? 'pad2Morph' : 'padMorph';
                          const morphRange = this.dualRanges[morphKey];
                          if (morphRange) {
                            // S&H or walk mode — generate random within range
                            effectiveMorph = morphRange.min + Math.random() * (morphRange.max - morphRange.min);
                          }
                        }

                        // Apply pad morph override: temporarily set morphed preset params on sliderState
                        const savedPadParams: Record<string, unknown> = {};
                        if (effectiveMorph !== null && this.sliderState) {
                          if (isPad2) {
                            // Pad 2 voice — morph pad2 presets onto pad2 state keys
                            const presetA = getPadPreset(this.sliderState.pad2PresetA as string);
                            const presetB = getPadPreset(this.sliderState.pad2PresetB as string);
                            if (presetA && presetB) {
                              const morphed = morphPadPresets(presetA, presetB, effectiveMorph);
                              const st = this.sliderState as unknown as Record<string, unknown>;
                              for (const k of PAD_PRESET_PARAM_KEYS) {
                                if (k in morphed) {
                                  const p2k = PAD1_TO_PAD2_ENGINE[k];
                                  if (p2k) {
                                    savedPadParams[p2k] = st[p2k];
                                    st[p2k] = morphed[k];
                                  }
                                }
                              }
                            }
                          } else {
                            // Pad 1 voice — morph pad1 presets onto pad1 state keys
                            const presetA = getPadPreset(this.sliderState.padPresetA as string);
                            const presetB = getPadPreset(this.sliderState.padPresetB as string);
                            if (presetA && presetB) {
                              const morphed = morphPadPresets(presetA, presetB, effectiveMorph);
                              const st = this.sliderState as unknown as Record<string, unknown>;
                              for (const k of PAD_PRESET_PARAM_KEYS) {
                                if (k in morphed) {
                                  savedPadParams[k] = st[k];
                                  st[k] = morphed[k];
                                }
                              }
                            }
                          }
                        }
                        // Use correct pad's ADSR for ratchet note duration
                        const rAttack = isPad2
                          ? (this.sliderState?.pad2Attack ?? 0.1)
                          : (this.sliderState?.synthAttack ?? 0.1);
                        const rDecay = isPad2
                          ? (this.sliderState?.pad2Decay ?? 0.3)
                          : (this.sliderState?.synthDecay ?? 0.3);
                        const synthAttack = rAttack * ratchetFactor;
                        const synthDecay = rDecay * ratchetFactor;
                        const noteDuration = synthAttack + synthDecay + Math.max(0.1, (synthAttack + synthDecay) * 0.5);
                        this.triggerSynthVoice(voiceIndex, frequency, velocity, noteDuration);
                        // Notify UI of correct pad's morph position so the slider moves
                        if (effectiveMorph !== null) {
                          if (isPad2) {
                            this.onPad2MorphTrigger?.(effectiveMorph);
                          } else {
                            this.onPadMorphTrigger?.(effectiveMorph);
                          }
                        }
                        // Restore original pad params
                        if (Object.keys(savedPadParams).length > 0 && this.sliderState) {
                          const st = this.sliderState as unknown as Record<string, unknown>;
                          for (const [k, v] of Object.entries(savedPadParams)) {
                            st[k] = v;
                          }
                        }
                      }
                      this.synthMorphOverride = null;
                      this.synthRatchetFactor = 1;
                    }, rDelayMs);
                    this.ratchetTimers.push(ratchetTimerId);
                  }
                }
              }
            }

            // Fire step position callback (synchronous, like drum sequencer)
            this.onSynthStepPositionChange?.([...this.synthEuclidCurrentStep], [...this.synthEuclidHitCounts]);

            // Advance step with per-lane clock division and swing
            const laneClockDiv = this.synthEuclidClockDivs[laneIndex] ?? '1/8';
            const laneStepDuration = clockDivToSec(laneClockDiv);
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
    this.synthEuclidCurrentStep = [0, 0, 0, 0];
    this.synthEuclidHitCounts = [0, 0, 0, 0];
    this.synthEuclidStepIndex = [0, 0, 0, 0];
    this.synthEuclidNextStepTime = [0, 0, 0, 0];
    this.synthTrigConditionCounters = [[], [], [], []];
    this.onSynthStepPositionChange?.([0, 0, 0, 0], [0, 0, 0, 0]);

    // Clear tracked ratchet and voice release timers (prevent firing after stop)
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers = [];
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers = [];

    // Release all active synth voices so they don't drone after sequencer stops
    if (this.ctx && this.voices.length > 0) {
      const now = this.ctx.currentTime;
      const release = this.sliderState?.synthRelease ?? 1.0;
      for (const voice of this.voices) {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
      }
    }

    // Silence the delay feedback loop immediately so it doesn't keep circulating
    const now = this.ctx?.currentTime ?? 0;
    const fadeTime = 0.05; // 50ms fade to avoid click
    this.leadDelayFeedbackL?.gain.setTargetAtTime(0, now, fadeTime);
    this.leadDelayFeedbackR?.gain.setTargetAtTime(0, now, fadeTime);
    // Also fade the delay mix output to silence the tail
    this.leadDelayMix?.gain.setTargetAtTime(0, now, fadeTime);
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
      cofCurrentStep: this.cofConfig.currentStep,
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
   * Get waves/ocean bus output (ocean sample + ocean synth after filter)
   * This is the oceanFilter node which receives both ocean sources
   */
  getWavesStemNode(): BiquadFilterNode | null {
    return this.oceanFilter;
  }

  /**
   * Get granular bus output (granular direct to master)
   * This is the granularDirect node carrying processed granular audio
   */
  getGranularStemNode(): GainNode | null {
    return this.granularDirect;
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
