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
import type { DrumStepOverrides } from './drumSeqTypes';
import type { SliderState } from '../ui/state';
import {
  type Lead4opFMPreset,
  type Lead4opFMMorphedParams,
  loadLead4opFMPreset,
  morphPresets,
  playLead4opFMNote,
  DEFAULT_SOFT_RHODES,
  DEFAULT_GAMELAN,
} from './lead4opfm';

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
  osc1: OscillatorNode;       // sine
  osc2: OscillatorNode;       // triangle  
  osc3: OscillatorNode;       // sawtooth (detuned)
  osc4: OscillatorNode;       // sawtooth
  osc1Gain: GainNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  osc4Gain: GainNode;
  noise?: AudioBufferSourceNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
  warmthFilter: BiquadFilterNode;    // Low shelf for warmth
  presenceFilter: BiquadFilterNode;  // Peaking EQ for presence
  gain: GainNode;
  saturation: WaveShaperNode;
  envelope: GainNode;
  active: boolean;
  targetFreq: number;
}

export interface EngineState {
  isRunning: boolean;
  harmonyState: HarmonyState | null;
  currentSeed: number;
  currentBucket: string;
  currentFilterFreq: number;
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
  private leadMelodyTimer: number | null = null;
  private leadNoteTimeouts: number[] = [];  // Track scheduled note timeouts

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

  // Temp drum synth management: debounce rapid previews and track cleanup timers
  private tempDrumSynthTimer: number | null = null;
  private tempDrumSynth: DrumSynth | null = null;
  private tempDrumGain: GainNode | null = null;
  private tempDrumReverb: GainNode | null = null;
  private rng: (() => number) | null = null;
  private isRunning = false;
  private seedLocked = false; // When true, don't recompute seed on param changes (for morphing)
  
  // Filter modulation - random walk
  private filterModValue = 0.5;  // 0-1, current random walk position
  private filterModVelocity = 0;  // Current velocity for smooth random walk
  private filterModTimer: number | null = null;
  private currentFilterFreq = 1000;  // Current filter frequency for UI display

  private onStateChange: ((state: EngineState) => void) | null = null;
  private onLeadExpressionTrigger: ((expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) | null = null;
  private onLeadMorphTrigger: ((morph: { lead1: number; lead2: number }) => void) | null = null;
  private onLeadDelayTrigger: ((delay: { time: number; feedback: number; mix: number }) => void) | null = null;
  private onOceanWaveTrigger: ((wave: { duration: number; interval: number; foam: number; depth: number }) => void) | null = null;
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  private onDrumMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;
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
        cofCurrentStep: this.cofConfig.currentStep,
      });
    }
  }

  // Getter for current filter frequency (for live UI updates)
  getCurrentFilterFreq(): number {
    return this.currentFilterFreq;
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
    if (this.isRunning) return;

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
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.error('Web Audio API not supported');
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
      throw e;
    }
    
    try {
      await this.ctx.audioWorklet.addModule(reverbWorkletUrl);
      console.log('Reverb worklet loaded');
    } catch (e) {
      console.error('Failed to load reverb worklet:', e);
      throw e;
    }
    
    try {
      await this.ctx.audioWorklet.addModule(oceanWorkletUrl);
      console.log('Ocean worklet loaded');
    } catch (e) {
      console.error('Failed to load ocean worklet:', e);
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
    
    // Start filter modulation
    this.startFilterModulation();

    // Start continuous lead random-walk updates (for live morph indicator + parity behavior)
    this.startLeadMorphRandomWalk();

    // Start lead melody if enabled
    this.startLeadMelody();

    // Start drum synth if enabled
    if (this.drumSynth) {
      this.drumSynth.start();
    }

    // Media session is now handled in App.tsx for proper iOS support

    this.isRunning = true;
    this.notifyStateChange();
  }

  stop(): void {
    if (!this.isRunning) return;

    // Stop phrase timer
    if (this.phraseTimer !== null) {
      clearTimeout(this.phraseTimer);
      this.phraseTimer = null;
    }

    // Stop lead melody timer
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    
    // Stop filter modulation timer
    if (this.filterModTimer !== null) {
      clearInterval(this.filterModTimer);
      this.filterModTimer = null;
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

    // Drum synth operates independently of master play (synchronous)
    if (sliderState.drumEnabled || sliderState.drumEuclidMasterEnabled) {
      this.ensureDrumSynth(sliderState);
    }
    if (this.drumSynth) {
      this.drumSynth.updateParams(sliderState);
    }

    // If drum is completely off and engine isn't running, tear down drum-only context
    if (!this.isRunning && !sliderState.drumEnabled && !sliderState.drumEuclidMasterEnabled) {
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
      }
    }

    // Only apply non-drum audio parameters if engine is running
    if (!this.ctx || !this.isRunning) return;

    // If synth chord sequencer was just disabled, silence all synth voices
    // BUT only if no Euclidean lanes are using synth sources
    if (sliderState.synthChordSequencerEnabled === false && this.voices.length > 0) {
      const isLeadSrc = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
      const euclideanUsesSynth = [
        sliderState.leadEuclid1Enabled && !isLeadSrc(sliderState.leadEuclid1Source),
        sliderState.leadEuclid2Enabled && !isLeadSrc(sliderState.leadEuclid2Source),
        sliderState.leadEuclid3Enabled && !isLeadSrc(sliderState.leadEuclid3Source),
        sliderState.leadEuclid4Enabled && !isLeadSrc(sliderState.leadEuclid4Source),
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

    // Apply continuous parameters immediately with smoothing
    this.applyParams(sliderState);

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
    this.synthDirect.gain.value = this.sliderState?.synthLevel ?? 0.6;

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
      voice.envelope.connect(this.synthBus);
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

    // Get initial oscillator gains based on oscBrightness
    const oscGains = this.getOscillatorGains(this.sliderState?.oscBrightness ?? 2);

    for (let i = 0; i < 6; i++) {
      // Oscillators - 4 types for morphing
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';        // Softest

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';    // Soft

      const osc3 = ctx.createOscillator();
      osc3.type = 'sawtooth';    // Bright (will be detuned)

      const osc4 = ctx.createOscillator();
      osc4.type = 'sawtooth';    // Bright

      // Per-oscillator gain nodes for mixing
      const osc1Gain = ctx.createGain();
      osc1Gain.gain.value = oscGains.sine;

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = oscGains.triangle;

      const osc3Gain = ctx.createGain();
      osc3Gain.gain.value = oscGains.sawDetuned;

      const osc4Gain = ctx.createGain();
      osc4Gain.gain.value = oscGains.saw;

      // Noise
      const noiseBuffer = this.createNoiseBuffer(ctx, 2);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = (this.sliderState?.airNoise ?? 0.1) * 0.1;

      // Filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1;

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

      // Envelope gain
      const envelope = ctx.createGain();
      envelope.gain.value = 0;

      // Connect voice chain: oscs -> oscGains -> filter -> warmth -> presence -> saturation -> gain -> envelope
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

      filter.connect(warmthFilter);
      warmthFilter.connect(presenceFilter);
      presenceFilter.connect(saturation);
      saturation.connect(gain);
      gain.connect(envelope);

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
        warmthFilter,
        presenceFilter,
        gain,
        saturation,
        envelope,
        active: false,
        targetFreq: 0,
      });
    }
  }

  /**
   * Get oscillator gain values based on oscBrightness setting
   * 0 = Sine (soft, pure)
   * 1 = Triangle (soft harmonics)
   * 2 = Saw + Triangle mix (balanced)
   * 3 = Sawtooth (bright, full harmonics)
   */
  private getOscillatorGains(oscBrightness: number): { sine: number; triangle: number; sawDetuned: number; saw: number } {
    switch (Math.round(oscBrightness)) {
      case 0: // Sine - pure, soft
        return { sine: 1.0, triangle: 0.0, sawDetuned: 0.0, saw: 0.0 };
      case 1: // Triangle - soft harmonics
        return { sine: 0.2, triangle: 0.8, sawDetuned: 0.0, saw: 0.0 };
      case 2: // Saw + Triangle mix - balanced ambient
        return { sine: 0.0, triangle: 0.4, sawDetuned: 0.3, saw: 0.3 };
      case 3: // Sawtooth - bright, full harmonics
        return { sine: 0.0, triangle: 0.0, sawDetuned: 0.5, saw: 0.5 };
      default:
        return { sine: 0.0, triangle: 0.4, sawDetuned: 0.3, saw: 0.3 };
    }
  }

  private createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    // Use deterministic noise if we have RNG, otherwise use Math.random
    const rng = this.rng || Math.random;

    // Crossfade length for seamless looping (50ms)
    const fadeLength = Math.floor(sampleRate * 0.05);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      
      // Generate noise
      for (let i = 0; i < length; i++) {
        data[i] = rng() * 2 - 1;
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

  private startFilterModulation(): void {
    // Modulate filter between min and max cutoff using random walk
    // Speed controls how fast it wanders
    const updateIntervalMs = 100; // Update every 100ms for smooth movement
    
    this.filterModTimer = window.setInterval(() => {
      if (!this.sliderState) return;
      
      // Calculate speed factor based on mod speed setting
      // Higher modSpeed = slower movement (more phrases per wander)
      // Base movement scaled so it's visible
      const baseSpeed = 0.02; // Base speed per update
      const speedFactor = this.sliderState.filterModSpeed > 0 
        ? baseSpeed / this.sliderState.filterModSpeed
        : 0;
      
      // Random walk with momentum
      // Add random acceleration
      const randomAccel = (Math.random() - 0.5) * speedFactor * 2;
      this.filterModVelocity += randomAccel;
      
      // Dampen velocity to prevent wild swings
      this.filterModVelocity *= 0.92;
      
      // Clamp velocity
      const maxVelocity = speedFactor * 4;
      this.filterModVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, this.filterModVelocity));
      
      // Apply velocity to position
      this.filterModValue += this.filterModVelocity;
      
      // Hard clamp to valid range (no soft bounce - can stay at poles)
      this.filterModValue = Math.max(0, Math.min(1, this.filterModValue));
      
      // Apply the modulated filter
      this.applyFilterModulation();
    }, updateIntervalMs);
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
  
  private applyFilterModulation(): void {
    if (!this.sliderState) return;
    
    const minCutoff = this.sliderState.filterCutoffMin;
    const maxCutoff = this.sliderState.filterCutoffMax;
    
    // Use random walk value directly (already 0 to 1 range)
    const modAmount = this.filterModValue;
    
    // Interpolate between min and max (logarithmic for more natural frequency sweep)
    const logMin = Math.log(minCutoff);
    const logMax = Math.log(maxCutoff);
    const cutoff = Math.exp(logMin + (logMax - logMin) * modAmount);
    
    // Update tracked frequency for UI (always update, even if no ctx)
    this.currentFilterFreq = cutoff;
    
    if (!this.ctx) return;
    
    // Apply Q boost at low cutoffs for more noticeable effect
    const baseQ = this.sliderState.filterQ;
    const qBoost = cutoff < 200 ? (200 - cutoff) / 200 * 4 : 0;
    const finalQ = Math.min(baseQ + qBoost, 15);
    
    // Apply to all voice filters
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.05);
      voice.filter.Q.setTargetAtTime(finalQ, now, 0.05);
    }
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

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const detune = this.sliderState.detune;
    const waveSpread = this.sliderState.waveSpread; // Max stagger time in seconds
    const rng = this.rng; // Capture for use in loop
    const voiceMask = this.sliderState.synthVoiceMask || 63; // Default to all 6 voices
    const octaveShift = this.sliderState.synthOctave || 0; // Octave shift (-2 to +2)
    const octaveMultiplier = Math.pow(2, octaveShift); // 0.25, 0.5, 1, 2, or 4

    // Apply octave shift to all frequencies
    frequencies = frequencies.map(f => f * octaveMultiplier);

    // Get ADSR from synth settings
    const attack = this.sliderState.synthAttack;
    const decay = this.sliderState.synthDecay;
    const sustain = this.sliderState.synthSustain;
    const release = this.sliderState.synthRelease;

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

      // Calculate frequency values
      const detuneOsc2 = -detune;
      const detuneOsc3 = detune;
      const freq1 = freq;  // sine - base
      const freq2 = freq * Math.pow(2, detuneOsc2 / 1200);  // triangle - detuned down
      const freq3 = freq * Math.pow(2, detuneOsc3 / 1200);  // saw - detuned up
      const freq4 = freq;  // saw - base

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

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const voice = this.voices[voiceIndex];
    
    if (!voice) return;
    
    const detune = this.sliderState.detune;

    // Get ADSR from synth settings
    const attack = this.sliderState.synthAttack;
    const decay = this.sliderState.synthDecay;
    const sustain = this.sliderState.synthSustain * velocity;
    const release = this.sliderState.synthRelease;

    // Apply octave shift if set
    const octaveShift = this.sliderState.synthOctave || 0;
    const octaveMultiplier = Math.pow(2, octaveShift);
    const freq = frequency * octaveMultiplier;

    // Calculate frequency values for 4 oscillators
    const detuneOsc2 = -detune;
    const detuneOsc3 = detune;
    const freq1 = freq;  // sine - base
    const freq2 = freq * Math.pow(2, detuneOsc2 / 1200);  // triangle - detuned down
    const freq3 = freq * Math.pow(2, detuneOsc3 / 1200);  // saw - detuned up
    const freq4 = freq;  // saw - base

    // If voice is active, crossfade; otherwise fresh attack
    if (voice.active) {
      // Crossfade - release old note, attack new
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, release / 4);
      
      const pitchChangeTime = now + release * 0.5;
      
      voice.osc1.frequency.setValueAtTime(freq1, pitchChangeTime);
      voice.osc2.frequency.setValueAtTime(freq2, pitchChangeTime);
      voice.osc3.frequency.setValueAtTime(freq3, pitchChangeTime);
      voice.osc4.frequency.setValueAtTime(freq4, pitchChangeTime);
      
      voice.envelope.gain.setTargetAtTime(1.0, pitchChangeTime, attack / 3);
      voice.envelope.gain.setTargetAtTime(sustain, pitchChangeTime + attack, decay / 3);
      
      // Schedule release if duration is specified (Euclidean sequencer notes)
      if (noteDuration !== undefined) {
        const releaseTime = now + noteDuration;
        voice.envelope.gain.setTargetAtTime(0, releaseTime, release / 3);
        setTimeout(() => {
          voice.active = false;
        }, (noteDuration + release) * 1000);
      }
    } else {
      // Fresh attack
      voice.osc1.frequency.setValueAtTime(freq1, now);
      voice.osc2.frequency.setValueAtTime(freq2, now);
      voice.osc3.frequency.setValueAtTime(freq3, now);
      voice.osc4.frequency.setValueAtTime(freq4, now);
      
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setValueAtTime(0, now);
      voice.envelope.gain.setTargetAtTime(1.0, now, attack / 3);
      voice.envelope.gain.setTargetAtTime(sustain, now + attack, decay / 3);
      
      // Schedule release if duration is specified (Euclidean sequencer notes)
      if (noteDuration !== undefined) {
        const releaseTime = now + noteDuration;
        voice.envelope.gain.setTargetAtTime(0, releaseTime, release / 3);
        // Mark voice inactive after release completes
        setTimeout(() => {
          voice.active = false;
        }, (noteDuration + release) * 1000);
      }
    }

    voice.targetFreq = freq;
    voice.active = true;
  }

  private applyParams(state: SliderState): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const smoothTime = 0.05;

    // Master volume
    this.masterGain?.gain.setTargetAtTime(state.masterVolume, now, smoothTime);

    // Voice parameters
    // Filter cutoff modulates between filterCutoffMin and filterCutoffMax
    const minCutoff = Math.min(state.filterCutoffMin, state.filterCutoffMax);
    const maxCutoff = Math.max(state.filterCutoffMin, state.filterCutoffMax);
    
    // Use current random walk value for modulated cutoff
    const modAmount = this.filterModValue;  // 0-1
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

    // Get oscillator mix based on oscBrightness
    const oscGains = this.getOscillatorGains(state.oscBrightness);

    for (const voice of this.voices) {
      // Oscillator mixing based on oscBrightness
      voice.osc1Gain.gain.setTargetAtTime(oscGains.sine, now, smoothTime);
      voice.osc2Gain.gain.setTargetAtTime(oscGains.triangle, now, smoothTime);
      voice.osc3Gain.gain.setTargetAtTime(oscGains.sawDetuned, now, smoothTime);
      voice.osc4Gain.gain.setTargetAtTime(oscGains.saw, now, smoothTime);

      // Main filter
      voice.filter.type = state.filterType;
      voice.filter.frequency.setTargetAtTime(cutoff, now, smoothTime);
      voice.filter.Q.setTargetAtTime(effectiveQ, now, smoothTime);
      
      // Warmth (low shelf)
      voice.warmthFilter.gain.setTargetAtTime(warmthGain, now, smoothTime);
      
      // Presence (peaking mid-high EQ)
      voice.presenceFilter.gain.setTargetAtTime(presenceGain, now, smoothTime);
      
      // Noise level
      voice.noiseGain.gain.setTargetAtTime(state.airNoise * 0.1, now, smoothTime);
    }

    // Only update saturation curve when hardness changes (avoid audio glitches)
    if (state.hardness !== this.lastHardness) {
      this.lastHardness = state.hardness;
      const newCurve = this.createSaturationCurve(state.hardness);
      for (const voice of this.voices) {
        voice.saturation.curve = newCurve;
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
    // synthLevel controls direct output to master
    // synthReverbSend controls how much goes to reverb (additive, not crossfade)
    // When reverbEnabled is false, mute reverb send to save CPU
    this.synthDirect?.gain.setTargetAtTime(state.synthLevel, now, smoothTime);
    this.synthReverbSend?.gain.setTargetAtTime(state.reverbEnabled ? state.synthReverbSend : 0, now, smoothTime);

    // Lead reverb send (mute if reverb disabled)
    this.leadReverbSend?.gain.setTargetAtTime(state.reverbEnabled ? state.leadReverbSend : 0, now, smoothTime);

    // Reverb parameters (only update if enabled to save CPU)
    if (this.reverbNode && state.reverbEnabled) {
      this.reverbNode.port.postMessage({
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

    // Lead synth parameters
    this.leadGain?.gain.setTargetAtTime(state.leadEnabled ? state.leadLevel : 0, now, smoothTime);
    
    // Delay parameters are now per-note (randomized in playLeadNote)
    // Only update reverb sends here (mute if reverb disabled)
    this.leadDelayReverbSend?.gain.setTargetAtTime(state.reverbEnabled ? state.leadDelayReverbSend : 0, now, smoothTime);

    // Check if Euclidean settings changed - if so, reschedule immediately
    const euclideanChanged = this.sliderState && (
      state.leadEuclideanMasterEnabled !== this.sliderState.leadEuclideanMasterEnabled ||
      state.leadEuclid1Enabled !== this.sliderState.leadEuclid1Enabled ||
      state.leadEuclid2Enabled !== this.sliderState.leadEuclid2Enabled ||
      state.leadEuclid3Enabled !== this.sliderState.leadEuclid3Enabled ||
      state.leadEuclid4Enabled !== this.sliderState.leadEuclid4Enabled ||
      state.leadEuclid1Source !== this.sliderState.leadEuclid1Source ||
      state.leadEuclid2Source !== this.sliderState.leadEuclid2Source ||
      state.leadEuclid3Source !== this.sliderState.leadEuclid3Source ||
      state.leadEuclid4Source !== this.sliderState.leadEuclid4Source
    );

    // Check if Euclidean has any synth-voice-source lanes enabled (independent of lead)
    const isLeadSrc2 = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
    const euclideanSynthLanesEnabled = state.leadEuclideanMasterEnabled && (
      (state.leadEuclid1Enabled && !isLeadSrc2(state.leadEuclid1Source)) ||
      (state.leadEuclid2Enabled && !isLeadSrc2(state.leadEuclid2Source)) ||
      (state.leadEuclid3Enabled && !isLeadSrc2(state.leadEuclid3Source)) ||
      (state.leadEuclid4Enabled && !isLeadSrc2(state.leadEuclid4Source))
    );

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

    // Start/stop lead melody based on enabled state OR Euclidean synth lanes
    const shouldSchedule = state.leadEnabled || euclideanSynthLanesEnabled;
    
    if (shouldSchedule && this.leadMelodyTimer === null) {
      this.startLeadMelody();
    } else if (!shouldSchedule && this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
      // Also clear scheduled notes
      for (const timeout of this.leadNoteTimeouts) {
        clearTimeout(timeout);
      }
      this.leadNoteTimeouts = [];
    } else if (shouldSchedule && euclideanChanged) {
      // Reschedule when Euclidean settings change
      this.startLeadMelody();
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
    }
  }

  /**
   * Play a 4-operator FM lead note using morphed preset parameters.
   * Supports lead1 (Preset A↔B) and lead2 (Preset C↔D).
   * Vibrato, glide, and delay are shared and independent of presets.
   */
  private playLeadNote(frequency: number, velocity: number = 0.8, leadSource: 'lead' | 'lead1' | 'lead2' = 'lead1'): void {
    if (!this.ctx || !this.leadGain || !this.sliderState) return;
    if (!this.sliderState.leadEnabled) return;

    // Determine which lead to use and check if enabled
    const useLead2 = leadSource === 'lead2';
    if (useLead2 && !this.sliderState.lead2Enabled) return;

    // Compute morphed FM params.
    // Random Walk (when enabled) uses smooth momentum-based motion within min/max.
    // Otherwise fall back to per-trigger random within min/max.
    const morphKey = useLead2 ? 'lead2Morph' : 'lead1Morph';
    const morphRange = this.dualRanges[morphKey];
    const rawMorphMin = morphRange ? morphRange.min : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const rawMorphMax = morphRange ? morphRange.max : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const morphMin = Math.min(rawMorphMin, rawMorphMax);
    const morphMax = Math.max(rawMorphMin, rawMorphMax);
    const randomWalkEnabled = useLead2 ? this.sliderState.lead2MorphAuto : this.sliderState.lead1MorphAuto;
    const walkState = useLead2 ? this.leadMorphWalkStates.lead2 : this.leadMorphWalkStates.lead1;
    const walkPos = walkState.initialized ? walkState.position : 0.5;
    const morphT = randomWalkEnabled
      ? (morphMin + walkPos * (morphMax - morphMin))
      : (morphMin + Math.random() * (morphMax - morphMin));
    const morphed = useLead2
      ? morphPresets(this.lead2PresetC, this.lead2PresetD, morphT, this.sliderState.lead2AlgorithmMode)
      : morphPresets(this.lead1PresetA, this.lead1PresetB, morphT, this.sliderState.lead1AlgorithmMode);
    const effectiveMorphed = this.sliderState.lead1UseCustomAdsr
      ? {
          ...morphed,
          attack: this.sliderState.lead1Attack,
          decay: this.sliderState.lead1Decay,
          sustain: this.sliderState.lead1Sustain,
          release: this.sliderState.lead1Release,
        }
      : morphed;

    // Notify UI of the triggered morph position (0-1 within the range)
    if (this.onLeadMorphTrigger) {
      const morphPos = morphMax > morphMin ? (morphT - morphMin) / (morphMax - morphMin) : 0.5;
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

    // Hold time from shared param (not in presets)
    const hold = this.sliderState.lead1Hold;

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
   * Generate a Euclidean rhythm pattern
   * Distributes N hits as evenly as possible across K steps
   * Based on Bjorklund's algorithm
   */
  private generateEuclideanPattern(steps: number, hits: number, rotation: number = 0): boolean[] {
    if (hits >= steps) {
      return new Array(steps).fill(true);
    }
    if (hits <= 0) {
      return new Array(steps).fill(false);
    }

    // Bjorklund's algorithm
    let pattern: number[][] = [];
    let remainder: number[][] = [];

    for (let i = 0; i < hits; i++) {
      pattern.push([1]);
    }
    for (let i = 0; i < steps - hits; i++) {
      remainder.push([0]);
    }

    while (remainder.length > 1) {
      const newPattern: number[][] = [];
      const minLen = Math.min(pattern.length, remainder.length);
      
      for (let i = 0; i < minLen; i++) {
        newPattern.push([...pattern[i], ...remainder[i]]);
      }
      
      if (pattern.length > remainder.length) {
        remainder = pattern.slice(minLen);
      } else {
        remainder = remainder.slice(minLen);
      }
      
      pattern = newPattern;
    }

    // Flatten and combine
    const result: boolean[] = [];
    for (const p of [...pattern, ...remainder]) {
      for (const val of p) {
        result.push(val === 1);
      }
    }

    // Apply rotation
    const rotatedResult: boolean[] = [];
    for (let i = 0; i < result.length; i++) {
      rotatedResult.push(result[(i + rotation) % result.length]);
    }

    return rotatedResult;
  }

  /**
   * Schedule sparse melody notes for the lead synth
   * Supports both random mode and multi-lane Euclidean sequencer
   */
  private scheduleLeadMelody(): void {
    if (!this.sliderState || !this.harmonyState || !this.rng) return;
    
    // Clear any previously scheduled note timeouts
    for (const timeout of this.leadNoteTimeouts) {
      clearTimeout(timeout);
    }
    this.leadNoteTimeouts = [];
    
    // Check if Euclidean has any synth-voice-source lanes enabled
    const isLeadSource = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
    const euclideanSynthLanesEnabled = this.sliderState.leadEuclideanMasterEnabled && (
      (this.sliderState.leadEuclid1Enabled && !isLeadSource(this.sliderState.leadEuclid1Source)) ||
      (this.sliderState.leadEuclid2Enabled && !isLeadSource(this.sliderState.leadEuclid2Source)) ||
      (this.sliderState.leadEuclid3Enabled && !isLeadSource(this.sliderState.leadEuclid3Source)) ||
      (this.sliderState.leadEuclid4Enabled && !isLeadSource(this.sliderState.leadEuclid4Source))
    );
    
    // Only skip if lead is disabled AND no Euclidean synth lanes are active
    if (!this.sliderState.leadEnabled && !euclideanSynthLanesEnabled) {
      // If lead is disabled and no Euclidean synth lanes, stop scheduling
      if (this.leadMelodyTimer !== null) {
        clearTimeout(this.leadMelodyTimer);
        this.leadMelodyTimer = null;
      }
      return;
    }

    const rng = this.rng;
    const scale = this.harmonyState.scaleFamily;
    const baseOctaveOffset = this.sliderState.lead1Octave;
    const octaveRange = this.sliderState.lead1OctaveRange ?? 2;
    const phraseDuration = PHRASE_LENGTH * 1000; // in ms

    // Scheduled notes with timing, note range, level, probability, and source
    interface ScheduledNote {
      timing: number;
      noteMin: number;
      noteMax: number;
      level: number;
      probability: number;
      source: 'lead' | 'lead1' | 'lead2' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
    }
    const scheduledNotes: ScheduledNote[] = [];

    // Check if Euclidean master mode is enabled
    if (this.sliderState.leadEuclideanMasterEnabled) {
      // Multi-lane Euclidean sequencer mode
      const tempo = this.sliderState.leadEuclideanTempo;

      // Process each lane
      const lanes = [
        {
          enabled: this.sliderState.leadEuclid1Enabled,
          preset: this.sliderState.leadEuclid1Preset,
          steps: this.sliderState.leadEuclid1Steps,
          hits: this.sliderState.leadEuclid1Hits,
          rotation: this.sliderState.leadEuclid1Rotation,
          noteMin: this.sliderState.leadEuclid1NoteMin,
          noteMax: this.sliderState.leadEuclid1NoteMax,
          level: this.sliderState.leadEuclid1Level,
          probability: this.sliderState.leadEuclid1Probability ?? 1.0,
          source: this.sliderState.leadEuclid1Source ?? 'lead' as const,
        },
        {
          enabled: this.sliderState.leadEuclid2Enabled,
          preset: this.sliderState.leadEuclid2Preset,
          steps: this.sliderState.leadEuclid2Steps,
          hits: this.sliderState.leadEuclid2Hits,
          rotation: this.sliderState.leadEuclid2Rotation,
          noteMin: this.sliderState.leadEuclid2NoteMin,
          noteMax: this.sliderState.leadEuclid2NoteMax,
          level: this.sliderState.leadEuclid2Level,
          probability: this.sliderState.leadEuclid2Probability ?? 1.0,
          source: this.sliderState.leadEuclid2Source ?? 'lead' as const,
        },
        {
          enabled: this.sliderState.leadEuclid3Enabled,
          preset: this.sliderState.leadEuclid3Preset,
          steps: this.sliderState.leadEuclid3Steps,
          hits: this.sliderState.leadEuclid3Hits,
          rotation: this.sliderState.leadEuclid3Rotation,
          noteMin: this.sliderState.leadEuclid3NoteMin,
          noteMax: this.sliderState.leadEuclid3NoteMax,
          level: this.sliderState.leadEuclid3Level,
          probability: this.sliderState.leadEuclid3Probability ?? 1.0,
          source: this.sliderState.leadEuclid3Source ?? 'lead' as const,
        },
        {
          enabled: this.sliderState.leadEuclid4Enabled,
          preset: this.sliderState.leadEuclid4Preset,
          steps: this.sliderState.leadEuclid4Steps,
          hits: this.sliderState.leadEuclid4Hits,
          rotation: this.sliderState.leadEuclid4Rotation,
          noteMin: this.sliderState.leadEuclid4NoteMin,
          noteMax: this.sliderState.leadEuclid4NoteMax,
          level: this.sliderState.leadEuclid4Level,
          probability: this.sliderState.leadEuclid4Probability ?? 1.0,
          source: this.sliderState.leadEuclid4Source ?? 'lead' as const,
        },
      ];

      for (const lane of lanes) {
        if (!lane.enabled) continue;

        // Get pattern parameters from preset or custom
        let steps: number, hits: number, rotation: number;
        if (lane.preset === 'custom') {
          steps = lane.steps;
          hits = lane.hits;
          rotation = lane.rotation;
        } else {
          const preset = this.EUCLIDEAN_PRESETS[lane.preset] || this.EUCLIDEAN_PRESETS.lancaran;
          steps = preset.steps;
          hits = preset.hits;
          // User rotation is additive to preset's base rotation
          rotation = (preset.rotation + lane.rotation) % steps;
        }

        // Generate pattern for this lane
        const pattern = this.generateEuclideanPattern(steps, hits, rotation);
        const patternDuration = phraseDuration / tempo;
        const stepDuration = patternDuration / steps;
        const cycles = Math.ceil(tempo);

        for (let cycle = 0; cycle < cycles; cycle++) {
          const cycleOffset = cycle * patternDuration;
          for (let i = 0; i < pattern.length; i++) {
            if (pattern[i]) {
              const timing = cycleOffset + (i * stepDuration);
              if (timing < phraseDuration) {
                scheduledNotes.push({
                  timing,
                  noteMin: lane.noteMin,
                  noteMax: lane.noteMax,
                  level: lane.level,
                  probability: lane.probability,
                  source: lane.source,
                });
              }
            }
          }
        }
      }

      // Check if any enabled lane uses a lead source
      const anyLaneUsesLead = lanes.some(lane => lane.enabled && isLeadSource(lane.source));
      
      // If no lanes use lead AND lead is enabled, add random lead notes as well
      if (!anyLaneUsesLead && this.sliderState.leadEnabled) {
        const density = this.sliderState.lead1Density;
        const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
        const baseLow = 64 + (baseOctaveOffset * 12);
        const baseHigh = baseLow + (octaveRange * 12);
        
        for (let i = 0; i < notesThisPhrase; i++) {
          const timing = rng() * phraseDuration;
          scheduledNotes.push({
            timing,
            noteMin: baseLow,
            noteMax: baseHigh,
            level: 1.0,
            probability: 1.0,
            source: 'lead',
          });
        }
      }

      // Sort by timing
      scheduledNotes.sort((a, b) => a.timing - b.timing);

    } else {
      // Original random mode - use global lead octave settings
      const density = this.sliderState.lead1Density;
      const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
      const baseLow = 64 + (baseOctaveOffset * 12);
      const baseHigh = baseLow + (octaveRange * 12);
      
      for (let i = 0; i < notesThisPhrase; i++) {
        const timing = rng() * phraseDuration;
        scheduledNotes.push({
          timing,
          noteMin: baseLow,
          noteMax: baseHigh,
          level: 1.0,
          probability: 1.0,
          source: 'lead',
        });
      }
      
      scheduledNotes.sort((a, b) => a.timing - b.timing);
    }

    // Schedule each note
    for (const note of scheduledNotes) {
      // Probability check - skip note if random value exceeds probability
      if (rng() > note.probability) continue;

      // Get available scale notes within this lane's note range (using effective root with CoF drift)
      const rootNote = this.effectiveRoot; // Uses drifted root from Circle of Fifths
      let availableNotes = getScaleNotesInRange(scale, Math.max(24, note.noteMin), Math.min(108, note.noteMax), rootNote);
      
      // If no scale notes in range, find the nearest scale note to the target range
      if (availableNotes.length === 0) {
        const midPoint = (note.noteMin + note.noteMax) / 2;
        // Get all scale notes in playable range
        const allScaleNotes = getScaleNotesInRange(scale, 24, 108, rootNote);
        if (allScaleNotes.length === 0) continue;
        
        // Find nearest note to the midpoint of the requested range
        let nearestNote = allScaleNotes[0];
        let nearestDistance = Math.abs(allScaleNotes[0] - midPoint);
        for (const scaleNote of allScaleNotes) {
          const distance = Math.abs(scaleNote - midPoint);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestNote = scaleNote;
          }
        }
        availableNotes = [nearestNote];
      }

      const noteIndex = Math.floor(rng() * availableNotes.length);
      const midiNote = availableNotes[noteIndex];
      const frequency = midiToFreq(midiNote);
      const velocity = rngFloat(rng, 0.5 * note.level, 0.9 * note.level);
      
      // Capture source for closure
      const noteSource = note.source;

      // Track the timeout so we can cancel it if state changes
      const timeoutId = window.setTimeout(() => {
        // Remove from tracking array
        const idx = this.leadNoteTimeouts.indexOf(timeoutId);
        if (idx > -1) this.leadNoteTimeouts.splice(idx, 1);
        
        // Route to appropriate sound source
        if (noteSource === 'lead' || noteSource === 'lead1') {
          this.playLeadNote(frequency, velocity, 'lead1');
        } else if (noteSource === 'lead2') {
          this.playLeadNote(frequency, velocity, 'lead2');
        } else {
          // Parse synth voice index from source (e.g., 'synth1' -> 0)
          const voiceIndex = parseInt(noteSource.replace('synth', '')) - 1;
          // Calculate note duration based on synth ADSR - note lasts through attack+decay+sustain portion
          const synthAttack = this.sliderState?.synthAttack ?? 0.1;
          const synthDecay = this.sliderState?.synthDecay ?? 0.3;
          // Give the note some sustain time before releasing (at least 0.3s or equal to attack+decay)
          const noteDuration = synthAttack + synthDecay + Math.max(0.3, synthAttack + synthDecay);
          this.triggerSynthVoice(voiceIndex, frequency, velocity, noteDuration);
        }
      }, note.timing);
      this.leadNoteTimeouts.push(timeoutId);
    }

    // Schedule next phrase
    const timeUntilNextPhrase = getTimeUntilNextPhrase() * 1000;
    this.leadMelodyTimer = window.setTimeout(() => {
      this.scheduleLeadMelody();
    }, timeUntilNextPhrase);
  }

  /**
   * Start or restart lead melody scheduling
   */
  private startLeadMelody(): void {
    // Clear existing timer
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    
    // Clear any scheduled note timeouts
    for (const timeout of this.leadNoteTimeouts) {
      clearTimeout(timeout);
    }
    this.leadNoteTimeouts = [];

    // Check if Euclidean has any synth-voice-source lanes enabled
    const isLeadSrc = (s: string) => s === 'lead' || s === 'lead1' || s === 'lead2';
    const euclideanSynthLanesEnabled = this.sliderState?.leadEuclideanMasterEnabled && (
      (this.sliderState.leadEuclid1Enabled && !isLeadSrc(this.sliderState.leadEuclid1Source)) ||
      (this.sliderState.leadEuclid2Enabled && !isLeadSrc(this.sliderState.leadEuclid2Source)) ||
      (this.sliderState.leadEuclid3Enabled && !isLeadSrc(this.sliderState.leadEuclid3Source)) ||
      (this.sliderState.leadEuclid4Enabled && !isLeadSrc(this.sliderState.leadEuclid4Source))
    );

    // Start scheduling if lead is enabled OR if Euclidean has synth lanes
    if (this.sliderState?.leadEnabled || euclideanSynthLanesEnabled) {
      this.scheduleLeadMelody();
    }
  }

  getState(): EngineState {
    return {
      isRunning: this.isRunning,
      harmonyState: this.harmonyState,
      currentSeed: this.currentSeed,
      currentBucket: this.currentBucket,
      currentFilterFreq: this.currentFilterFreq,
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
