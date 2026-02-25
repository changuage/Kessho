/**
 * Ikeda-Style Drum Synthesizer - Enhanced with Morphable Voices
 * 
 * Minimalist percussion synthesizer inspired by Ryoji Ikeda's aesthetic,
 * expanded with deep sound design parameters and preset morphing:
 * - Sharp digital impulses and clicks
 * - Pure sine beeps at frequency extremes
 * - Sub-bass pulses with waveshaping
 * - Filtered noise bursts with formant control
 * - Karplus-Strong pluck synthesis
 * - Granular micro-hit textures
 * - Mathematical precision with probability-based triggering
 * 
 * 7 voice types:
 * 1. Sub - Low sine/triangle pulse with drive & sub-octave
 * 2. Kick - Sine with pitch envelope, body, punch, tail
 * 3. Click - Multi-mode: impulse/noise/tonal/granular
 * 4. Beep Hi - Inharmonic partials with shimmer LFO
 * 5. Beep Lo - Pitched blip with Karplus-Strong pluck option
 * 6. Noise - Filtered noise with formant, breath, filter envelope
 * 7. Membrane - Physical modeled head with wire buzz and material model
 */

import type { SliderState } from '../ui/state';
import { getMorphedParams, DrumMorphManager } from './drumMorph';
import type { DrumStepOverrides, SequencerState } from './drumSeqTypes';
import { createSequencer, resolveDrumEuclidPatternParams, seqEuclidean, seqLaneIndex, seqPickVoice } from './drumSequencer';
import { captureHomeSnapshot, evolveSequencer, resetSequencerToHome } from './drumSeqEvolve';

export type DrumVoiceType = 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise' | 'membrane';

export type DrumEvolveMethod =
  | 'rotateDrift'
  | 'velocityBreath'
  | 'swingDrift'
  | 'probDrift'
  | 'morphDrift'
  | 'ghostNotes'
  | 'ratchetSpray'
  | 'hitDrift'
  | 'pitchWalk';

export type DrumEuclidEvolveConfig = {
  enabled: boolean;
  everyBars: number;
  intensity: number;
  methods: Record<DrumEvolveMethod, boolean>;
};

const defaultEvolveMethods = (): Record<DrumEvolveMethod, boolean> => ({
  rotateDrift: true,
  velocityBreath: true,
  swingDrift: true,
  probDrift: true,
  morphDrift: true,
  ghostNotes: true,
  ratchetSpray: true,
  hitDrift: true,
  pitchWalk: true,
});

const defaultEvolveConfig = (): DrumEuclidEvolveConfig => ({
  enabled: false,
  everyBars: 4,
  intensity: 0.5,
  methods: defaultEvolveMethods(),
});

// Note division to beat fraction mapping
const NOTE_DIVISIONS: Record<string, number> = {
  '1/1': 4,       // Whole note (4 beats)
  '1/2': 2,       // Half note
  '1/2d': 3,      // Dotted half
  '1/4': 1,       // Quarter note
  '1/4d': 1.5,    // Dotted quarter
  '1/4t': 2/3,    // Quarter triplet
  '1/8': 0.5,     // Eighth note
  '1/8d': 0.75,   // Dotted eighth
  '1/8t': 1/3,    // Eighth triplet
  '1/16': 0.25,   // Sixteenth
  '1/16d': 0.375, // Dotted sixteenth
  '1/16t': 1/6,   // Sixteenth triplet
  '1/32': 0.125,  // Thirty-second
};

/**
 * Convert note division string to time in seconds based on BPM
 */
export function noteToSeconds(note: string, bpm: number): number {
  const beats = NOTE_DIVISIONS[note] ?? 0.5; // Default to 1/8
  return (60 / bpm) * beats;
}

export class DrumSynth {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private reverbSend: GainNode;
  private params: SliderState;
  
  // Noise buffer for click and noise voices
  private noiseBuffer: AudioBuffer | null = null;
  
  // Euclidean scheduling
  private euclidScheduleTimer: number | null = null;
  private euclidCurrentStep: number[] = [0, 0, 0, 0]; // Step position per lane
  private lastScheduleTime = 0;
  private euclidGlobalStepCount = 0;
  private euclidBarCount = 0;
  private euclidSequencers: SequencerState[] = [];
  // Per-lane, per-step visit counters for Elektron-style trig conditions [n:N]
  private trigConditionCounters: number[][] = [[], [], [], []];
  private euclidEvolveConfigs: DrumEuclidEvolveConfig[] = [
    defaultEvolveConfig(),
    defaultEvolveConfig(),
    defaultEvolveConfig(),
    defaultEvolveConfig(),
  ];
  
  // RNG for deterministic randomness
  private rng: () => number;
  
  // Morph system
  private morphManager: DrumMorphManager;
  private morphAnimationFrame: number | null = null;
  
  // Morph ranges for per-trigger randomization (like delay/expression)
  private morphRanges: Record<DrumVoiceType, { min: number; max: number } | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null, membrane: null
  };
  
  // Callback for UI visualization
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  
  // Callback for morph trigger visualization (per-trigger random position)
  private onMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;

  // Callback for Euclidean lane evolve visualization
  private onEuclidEvolveTrigger: ((laneIndex: number) => void) | null = null;

  // Callback for step position updates (UI playhead)
  private onStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;

  // Stereo ping-pong delay
  private delayLeftNode: DelayNode | null = null;
  private delayRightNode: DelayNode | null = null;
  private delayFeedbackL: GainNode | null = null;
  private delayFeedbackR: GainNode | null = null;
  private delayFilterL: BiquadFilterNode | null = null;
  private delayFilterR: BiquadFilterNode | null = null;
  private delayWetGain: GainNode | null = null;
  private delayMerger: ChannelMergerNode | null = null;
  
  // Per-voice delay sends
  private delaySends: Record<DrumVoiceType, GainNode | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null, membrane: null
  };

  // Cache distortion curves to avoid per-trigger Float32Array allocation
  private waveshaperCurveCache = new Map<string, Float32Array<ArrayBuffer>>();

  // Cache generated Euclidean patterns (keyed by steps|hits|rotation)
  private euclidPatternCache = new Map<string, boolean[]>();

  // Step toggle overrides from UI (per-lane Set of toggled step indices)
  private stepOverrides: DrumStepOverrides = {
    triggerToggles: [new Set(), new Set(), new Set(), new Set()],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
    expression: [null, null, null, null],
    morph: [null, null, null, null],
    distance: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    morphDirection: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    pitchDirection: [null, null, null, null],
  };

  // Per-trigger override values set by the scheduler from sub-lane data.
  // Checked by voice trigger methods before falling back to global params.
  private triggerMorphOverride: number | null = null;
  private triggerDistanceOverride: number | null = null;
  // Max decay time (seconds) for ratchet hits — voices clamp their decay to fit the ratchet window
  private triggerRatchetDecayCap: number = Infinity;

  // Track per-trigger transient audio nodes for explicit cleanup on dispose.
  // Each group has an expiry time (ctx.currentTime when all envelopes have ended).
  // cleanupTransientNodes() only disconnects groups whose expiresAt has passed.
  private transientNodeGroups: { nodes: AudioNode[]; expiresAt: number }[] = [];
  private transientCleanupTimer: number | null = null;

  // Per-voice bus gain nodes (intermediate routing for analyser isolation)
  private voiceBusGains: Record<DrumVoiceType, GainNode> = {} as Record<DrumVoiceType, GainNode>;
  // Currently-active voice output target (set in triggerVoice before dispatch)
  private triggerTarget!: GainNode;
  // Per-voice analyser nodes for envelope visualizer
  private voiceAnalysers: Partial<Record<DrumVoiceType, AnalyserNode>> = {};

  // Voice pool: per-voice max polyphony + active voice tracking (oldest-first stealing)
  private static readonly VOICE_POOL_MAX: Record<DrumVoiceType, number> = {
    sub: 2, kick: 2, click: 4, beepHi: 3, beepLo: 3, noise: 2, membrane: 2,
  };
  private voicePools: Record<DrumVoiceType, { outGain: GainNode; endTime: number }[]> = {
    sub: [], kick: [], click: [], beepHi: [], beepLo: [], noise: [], membrane: [],
  };

  constructor(
    ctx: AudioContext,
    masterOutput: AudioNode,
    reverbNode: AudioNode,
    params: SliderState,
    rng: () => number
  ) {
    this.ctx = ctx;
    this.params = params;
    this.rng = rng;
    
    // Create master output chain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = params.drumLevel;
    
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = params.drumReverbSend;
    
    // Connect to outputs
    this.masterGain.connect(masterOutput);
    this.reverbSend.connect(reverbNode);
    
    // Initialize morph manager
    this.morphManager = new DrumMorphManager();
    
    // Pre-generate noise buffer
    this.createNoiseBuffer();
    
    // Create stereo ping-pong delay
    this.createDelayEffect(masterOutput);

    // Create per-voice bus gain nodes + analyser nodes
    const voices: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    for (const v of voices) {
      // Bus gain: voice triggers â†’ bus â†’ masterGain (unity gain pass-through)
      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(this.masterGain);
      this.voiceBusGains[v] = bus;

      // Analyser taps the per-voice bus (not master) for isolated FFT
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      bus.connect(analyser);
      this.voiceAnalysers[v] = analyser;
    }
    // Default triggerTarget to masterGain (overridden per-trigger in triggerVoice)
    this.triggerTarget = this.masterGain;

    // Start periodic transient node cleanup (every 2s)
    this.transientCleanupTimer = window.setInterval(() => this.cleanupTransientNodes(), 2000);
  }
  
  /**
   * Create stereo ping-pong delay effect
   * Left and right channels have independent delay times for ping-pong feel
   */
  private createDelayEffect(masterOutput: AudioNode): void {
    const p = this.params;
    
    // Create delay nodes (max 2 seconds)
    const bpm = p.drumEuclidBaseBPM ?? 120;
    
    this.delayLeftNode = this.ctx.createDelay(4);  // Max 4 seconds for slow tempos
    this.delayRightNode = this.ctx.createDelay(4);
    this.delayLeftNode.delayTime.value = noteToSeconds(p.drumDelayNoteL ?? '1/8d', bpm);
    this.delayRightNode.delayTime.value = noteToSeconds(p.drumDelayNoteR ?? '1/4', bpm);
    
    // Create feedback gain nodes
    this.delayFeedbackL = this.ctx.createGain();
    this.delayFeedbackR = this.ctx.createGain();
    const feedback = p.drumDelayFeedback ?? 0.4;
    this.delayFeedbackL.gain.value = feedback;
    this.delayFeedbackR.gain.value = feedback;
    
    // Create low-pass filters for each channel (delay darkening)
    this.delayFilterL = this.ctx.createBiquadFilter();
    this.delayFilterR = this.ctx.createBiquadFilter();
    this.delayFilterL.type = 'lowpass';
    this.delayFilterR.type = 'lowpass';
    const filterFreq = this.calculateDelayFilterFreq(p.drumDelayFilter ?? 0.5);
    this.delayFilterL.frequency.value = filterFreq;
    this.delayFilterR.frequency.value = filterFreq;
    this.delayFilterL.Q.value = 0.7;
    this.delayFilterR.Q.value = 0.7;
    
    // Create wet level gain
    this.delayWetGain = this.ctx.createGain();
    this.delayWetGain.gain.value = (p.drumDelayEnabled ?? false) ? (p.drumDelayMix ?? 0.3) : 0;
    
    // Create per-voice delay send nodes
    const voiceTypes: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    for (const voice of voiceTypes) {
      this.delaySends[voice] = this.ctx.createGain();
      const sendKey = `drum${voice.charAt(0).toUpperCase() + voice.slice(1)}DelaySend` as keyof SliderState;
      this.delaySends[voice]!.gain.value = (p[sendKey] as number) ?? 0;
    }
    
    // Create stereo merger for output
    this.delayMerger = this.ctx.createChannelMerger(2);
    
    // Connect per-voice sends to both delay lines
    for (const voice of voiceTypes) {
      const sendNode = this.delaySends[voice]!;
      sendNode.connect(this.delayLeftNode);
      sendNode.connect(this.delayRightNode);
    }
    
    // Left delay chain: delay -> filter -> feedback -> right delay (ping-pong)
    this.delayLeftNode.connect(this.delayFilterL);
    this.delayFilterL.connect(this.delayFeedbackL);
    this.delayFeedbackL.connect(this.delayRightNode); // Cross-feed for ping-pong
    
    // Right delay chain: delay -> filter -> feedback -> left delay (ping-pong)
    this.delayRightNode.connect(this.delayFilterR);
    this.delayFilterR.connect(this.delayFeedbackR);
    this.delayFeedbackR.connect(this.delayLeftNode); // Cross-feed for ping-pong
    
    // Output: both filtered signals to stereo output
    // Left delay output goes to left channel
    this.delayFilterL.connect(this.delayMerger, 0, 0);
    // Right delay output goes to right channel
    this.delayFilterR.connect(this.delayMerger, 0, 1);
    
    // Merger -> wet gain -> master output
    this.delayMerger.connect(this.delayWetGain);
    this.delayWetGain.connect(masterOutput);
  }

  private getWaveshaperCurve(driveAmount: number): Float32Array<ArrayBuffer> {
    // Guard against near-zero drive producing NaN via division by tanh(0)â†’0
    if (driveAmount < 0.001) {
      const cacheKey = '0.000';
      const cached = this.waveshaperCurveCache.get(cacheKey);
      if (cached) return cached;
      // Identity curve (linear pass-through)
      const samples = 256;
      const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
      for (let i = 0; i < samples; i++) {
        curve[i] = (i * 2) / samples - 1;
      }
      this.waveshaperCurveCache.set(cacheKey, curve);
      return curve;
    }

    const cacheKey = driveAmount.toFixed(3);
    const cached = this.waveshaperCurveCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const samples = 256;
    const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
    const denominator = Math.tanh(driveAmount);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * driveAmount) / denominator;
    }

    this.waveshaperCurveCache.set(cacheKey, curve);
    if (this.waveshaperCurveCache.size > 64) {
      const oldestKey = this.waveshaperCurveCache.keys().next().value;
      if (oldestKey) {
        this.waveshaperCurveCache.delete(oldestKey);
      }
    }

    return curve;
  }

  private getCachedEuclideanPattern(steps: number, hits: number, rotation: number): boolean[] {
    const normalizedRotation = ((rotation % steps) + steps) % steps;
    const key = `${steps}|${hits}|${normalizedRotation}`;
    const cached = this.euclidPatternCache.get(key);
    if (cached) {
      return cached;
    }

    const generated = seqEuclidean(steps, hits, normalizedRotation);
    this.euclidPatternCache.set(key, generated);
    if (this.euclidPatternCache.size > 256) {
      const oldestKey = this.euclidPatternCache.keys().next().value;
      if (oldestKey) {
        this.euclidPatternCache.delete(oldestKey);
      }
    }
    return generated;
  }

  /**
   * Register transient audio nodes created during a voice trigger for later cleanup.
   * @param lifetimeSec - how long (in seconds) these nodes will be active from now.
   *   Cleanup will not disconnect them until ctx.currentTime >= expiresAt.
   */
  private trackTransientNodes(lifetimeSec: number, ...nodes: (AudioNode | null | undefined)[]): void {
    const filtered: AudioNode[] = [];
    for (const node of nodes) {
      if (node) filtered.push(node);
    }
    if (filtered.length > 0) {
      this.transientNodeGroups.push({
        nodes: filtered,
        expiresAt: this.ctx.currentTime + lifetimeSec,
      });
    }
  }

  /**
   * Periodic cleanup: disconnect transient node groups whose expiry time has passed.
   * Called every 2s by the cleanup timer.  Only groups whose lifetime has fully
   * elapsed (ctx.currentTime >= expiresAt) are disconnected -- long-decay sounds
   * like 8x ambient tails are never cut short.
   */
  private cleanupTransientNodes(): void {
    if (this.transientNodeGroups.length === 0) return;
    const now = this.ctx.currentTime;
    const ctxClosed = this.ctx.state === 'closed';
    const surviving: { nodes: AudioNode[]; expiresAt: number }[] = [];
    for (const group of this.transientNodeGroups) {
      if (ctxClosed || now >= group.expiresAt) {
        for (const node of group.nodes) {
          try { node.disconnect(); } catch { /* ignore */ }
        }
      } else {
        surviving.push(group);
      }
    }
    this.transientNodeGroups = surviving;
  }

  /**
   * Force-disconnect all tracked transient nodes.
   * Called from dispose() for guaranteed cleanup.
   */
  private forceDisconnectAllTransientNodes(): void {
    for (const group of this.transientNodeGroups) {
      for (const node of group.nodes) {
        try { node.disconnect(); } catch { /* ignore */ }
      }
    }
    this.transientNodeGroups = [];
  }
  
  /**
   * Calculate delay filter frequency from 0-1 parameter
   * 0 = dark (500Hz), 0.5 = medium (4kHz), 1 = bright (16kHz)
   */
  private calculateDelayFilterFreq(filterParam: number): number {
    // Exponential curve from 500Hz to 16000Hz
    return 500 * Math.pow(32, filterParam);
  }
  
  /**
   * Get the delay send node for a specific voice
   * Used by voice triggers to route audio to delay
   */
  getDelaySend(voice: DrumVoiceType): GainNode | null {
    return this.delaySends[voice];
  }

  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void): void {
    this.onDrumTrigger = callback;
  }
  
  setMorphTriggerCallback(callback: (voice: DrumVoiceType, morphPosition: number) => void): void {
    this.onMorphTrigger = callback;
  }

  setEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void): void {
    this.onEuclidEvolveTrigger = callback;
  }

  setStepPositionCallback(callback: (steps: number[], hitCounts: number[]) => void): void {
    this.onStepPositionChange = callback;
  }

  getEuclidCurrentStep(): number[] {
    return [...this.euclidCurrentStep];
  }

  getVoiceAnalyser(voice: DrumVoiceType): AnalyserNode | undefined {
    return this.voiceAnalysers[voice];
  }
  
  setMorphRange(voice: DrumVoiceType, range: { min: number; max: number } | null): void {
    this.morphRanges[voice] = range;
  }

  private createNoiseBuffer(): void {
    // Create 1 second of white noise
    const length = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  /**
   * Get the master gain node for stem recording
   * This captures all drum output before it goes to the engine's master
   */
  getMasterGain(): GainNode {
    return this.masterGain;
  }
  
  updateParams(params: SliderState): void {
    this.params = params;
    
    const now = this.ctx.currentTime;
    const smoothTime = 0.05;
    
    // Update master levels
    this.masterGain.gain.setTargetAtTime(
      params.drumEnabled ? params.drumLevel : 0,
      now,
      smoothTime
    );
    this.reverbSend.gain.setTargetAtTime(
      params.drumEnabled ? params.drumReverbSend : 0,
      now,
      smoothTime
    );
    
    // Update delay parameters
    this.updateDelayParams(params, now, smoothTime);
    
    // Start/stop sequencer scheduler based on enabled state
    if (params.drumEnabled) {
      if (params.drumEuclidMasterEnabled && !this.euclidScheduleTimer) {
        this.startEuclidScheduler();
      } else if (!params.drumEuclidMasterEnabled && this.euclidScheduleTimer) {
        this.stopEuclidScheduler();
      }
    } else {
      this.stopEuclidScheduler();
    }
  }

  setEuclidEvolveConfigs(configs: Partial<DrumEuclidEvolveConfig>[]): void {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    this.euclidEvolveConfigs = this.euclidEvolveConfigs.map((current, laneIndex) => {
      const incoming = configs[laneIndex] || {};
      return {
        enabled: incoming.enabled ?? current.enabled,
        everyBars: Math.max(1, Math.round(incoming.everyBars ?? current.everyBars)),
        intensity: clamp(incoming.intensity ?? current.intensity, 0, 1),
        methods: {
          ...current.methods,
          ...(incoming.methods || {}),
        },
      };
    });

    this.euclidSequencers = this.euclidSequencers.map((sequencer, laneIndex) => {
      const config = this.euclidEvolveConfigs[laneIndex] || defaultEvolveConfig();
      return {
        ...sequencer,
        evolve: {
          ...sequencer.evolve,
          enabled: config.enabled,
          everyBars: config.everyBars,
          intensity: config.intensity,
          methods: { ...config.methods },
          home: sequencer.evolve.home ?? captureHomeSnapshot(sequencer),
        },
      };
    });
  }

  resetEuclidLaneToHome(laneIndex: number): void {
    if (laneIndex < 0 || laneIndex >= this.euclidSequencers.length) return;
    const sequencer = this.euclidSequencers[laneIndex];
    if (!sequencer) return;
    this.euclidSequencers[laneIndex] = resetSequencerToHome(sequencer);
  }

  /** Receive full step overrides from the UI (trigger toggles, probability, ratchet, expression, morph, distance). */
  setStepOverrides(overrides: DrumStepOverrides): void {
    this.stepOverrides = {
      triggerToggles: overrides.triggerToggles.map(s => new Set(s)),
      probability: overrides.probability,
      ratchet: overrides.ratchet,
      trigCondition: overrides.trigCondition ?? [null, null, null, null],
      expression: overrides.expression,
      morph: overrides.morph,
      distance: overrides.distance,
      expressionDirection: overrides.expressionDirection ?? [null, null, null, null],
      morphDirection: overrides.morphDirection ?? [null, null, null, null],
      distanceDirection: overrides.distanceDirection ?? [null, null, null, null],
      pitchDirection: overrides.pitchDirection ?? [null, null, null, null],
    };
  }
  
  /**
   * Update all delay-related parameters
   */
  private updateDelayParams(params: SliderState, now: number, smoothTime: number): void {
    const bpm = params.drumEuclidBaseBPM ?? 120;
    
    // Update delay times based on note divisions and BPM
    if (this.delayLeftNode) {
      const timeL = noteToSeconds(params.drumDelayNoteL ?? '1/8d', bpm);
      this.delayLeftNode.delayTime.setTargetAtTime(timeL, now, smoothTime);
    }
    if (this.delayRightNode) {
      const timeR = noteToSeconds(params.drumDelayNoteR ?? '1/4', bpm);
      this.delayRightNode.delayTime.setTargetAtTime(timeR, now, smoothTime);
    }
    
    // Update feedback
    const feedback = params.drumDelayFeedback ?? 0.4;
    if (this.delayFeedbackL) {
      this.delayFeedbackL.gain.setTargetAtTime(feedback, now, smoothTime);
    }
    if (this.delayFeedbackR) {
      this.delayFeedbackR.gain.setTargetAtTime(feedback, now, smoothTime);
    }
    
    // Update filter
    const filterFreq = this.calculateDelayFilterFreq(params.drumDelayFilter ?? 0.5);
    if (this.delayFilterL) {
      this.delayFilterL.frequency.setTargetAtTime(filterFreq, now, smoothTime);
    }
    if (this.delayFilterR) {
      this.delayFilterR.frequency.setTargetAtTime(filterFreq, now, smoothTime);
    }
    
    // Update wet level (mute if delay disabled)
    if (this.delayWetGain) {
      const wetLevel = (params.drumDelayEnabled ?? false) ? (params.drumDelayMix ?? 0.3) : 0;
      this.delayWetGain.gain.setTargetAtTime(wetLevel, now, smoothTime);
    }
    
    // Update per-voice delay sends
    const voiceTypes: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    for (const voice of voiceTypes) {
      const sendNode = this.delaySends[voice];
      if (sendNode) {
        const sendKey = `drum${voice.charAt(0).toUpperCase() + voice.slice(1)}DelaySend` as keyof SliderState;
        const sendLevel = (params[sendKey] as number) ?? 0;
        sendNode.gain.setTargetAtTime(sendLevel, now, smoothTime);
      }
    }
  }

  start(): void {
    if (!this.params.drumEnabled) return;

    if (this.params.drumEuclidMasterEnabled) {
      this.startEuclidScheduler();
    }
  }
  
  stop(): void {
    this.stopEuclidScheduler();
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PER-HIT VARIATION & DISTANCE HELPERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Compute correlated per-hit micro-variation jitter multipliers.
   * Uses triangular distribution (rng()+rng()-1) so most hits cluster near nominal
   * with occasional larger deviations, mimicking natural percussion.
   * A single bipolar offset drives all multipliers in a correlated "distance" model:
   * positive = closer/brighter/snappier, negative = farther/darker/softer.
   */
  private computeVariation(variation: number): {
    vLevel: number; vDecay: number; vPitch: number;
    vBright: number; vAttack: number; vExcite: number;
  } {
    if (variation < 0.001) {
      return { vLevel: 1, vDecay: 1, vPitch: 1, vBright: 1, vAttack: 1, vExcite: 1 };
    }
    const offset = (this.rng() + this.rng() - 1) * variation;
    return {
      vLevel:   1 + offset * 0.60,         // ±60% amplitude
      vDecay:   1 + offset * 0.40,         // ±40% decay time
      vPitch:   1 + offset * 0.02,         // ±2% (~32 cents)
      vBright:  1 + offset * 0.80,         // ±80% filter cutoff / Q
      vAttack:  1 / (1 + offset * 0.60),   // inverse — louder hits = shorter attack
      vExcite:  1 + offset * 0.80,         // ±80% excitation burst length
    };
  }

  /**
   * Apply "distance" macro â€” a static dampening that darkens, softens, and smooths
   * Strike-position macro: 0.0 = dead center, 0.5 = neutral, 1.0 = edge of head.
   * Bipolar model matching prototype option2:
   * Center: more body/fundamental, longer decay, darker, rounder attack
   * Edge:   thinner, shorter decay, brighter, sharper attack, more overtones
   * Returns multiplier struct that stacks with the voice's existing parameters.
   */
  private computeDistance(distance: number): {
    dLevel: number; dDecay: number; dBright: number;
    dAttack: number; dTransient: number; dBody: number; t: number;
  } {
    const t = (distance - 0.5) * 2;  // -1 (center) to +1 (edge), 0 = neutral
    if (Math.abs(t) < 0.01) {
      return { dLevel: 1, dDecay: 1, dBright: 1, dAttack: 1, dTransient: 1, dBody: 1, t: 0 };
    }

    // Logarithmic brightness curve: log-compression prevents runaway
    const dBright = t >= 0
      ? 1 + Math.log2(1 + t) * 1.1
      : 1 / (1 + Math.log2(1 + Math.abs(t)) * 3.5);

    return {
      dLevel:     1 - t * 0.4,
      dDecay:     t >= 0 ? 1 - t * 0.8 : 1 + Math.abs(t) * 7.0,
      dBright,
      dAttack:    t >= 0 ? 1 - t * 0.55 : 1 + Math.abs(t) * 1.0,
      dTransient: 1 + t * 0.85,
      dBody:      t >= 0 ? 1 - t * 0.6 : 1 + Math.abs(t) * 1.2,
      t,
    };
  }

  // ── Centralized cl/ed (center-loosen / edge-dampen) coefficients ──
  // Per-voice parameter modifiers for strike-position Distance macro.
  private static readonly CL_ED: Record<string, Record<string, [number, number, 'mul' | 'add']>> = {
    sub:      { drive: [-0.6, 0.4, 'mul'] },
    kick:     { pitchDecay: [0.8, -0.35, 'mul'], tail: [0.3, -0.15, 'add'] },
    click:    { resonance: [0.8, -0.5, 'mul'] },
    beepHi:   { bright: [0.6, 0.4, 'add'], shimmer: [0.4, 0, 'add'], feedback: [0.3, 0, 'add'] },
    beepLo:   { modalQ: [0.7, -0.5, 'mul'], modalGain: [0.5, 0, 'mul'] },
    noise:    { bright: [0.7, -0.7, 'add'], formant: [0.35, 0, 'add'], density: [0.4, -0.5, 'mul'] },
    membrane: { tension: [0.3, 0, 'add'], wireMix: [0.3, -0.2, 'add'], wireDecay: [0.35, 0, 'add'] },
  };

  /** Apply center-loosen / edge-dampen modifier to a value based on distance t. */
  private clEd(val: number, t: number, cfg: [number, number, 'mul' | 'add']): number {
    const cl = Math.max(0, -t), ed = Math.max(0, t);
    const [c, e, mode] = cfg;
    return mode === 'mul' ? val * (1 + cl * c) * (1 + ed * e) : val + cl * c + ed * e;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VOICE TRIGGER METHODS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  triggerVoice(voice: DrumVoiceType, velocity: number = 0.8, time?: number): void {
    const t = time ?? this.ctx.currentTime;

    // ── Voice pool management: evict expired, steal oldest if at capacity ──
    const pool = this.voicePools[voice];
    const maxPoly = DrumSynth.VOICE_POOL_MAX[voice];
    const now = this.ctx.currentTime;

    // Remove expired entries
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].endTime <= now) {
        try { pool[i].outGain.disconnect(); } catch { /* already disconnected */ }
        pool.splice(i, 1);
      }
    }

    // Steal oldest if at capacity — fast-fade to avoid click
    while (pool.length >= maxPoly) {
      const oldest = pool.shift();
      if (oldest?.outGain) {
        try {
          oldest.outGain.gain.cancelScheduledValues(now);
          oldest.outGain.gain.setValueAtTime(oldest.outGain.gain.value, now);
          oldest.outGain.gain.linearRampToValueAtTime(0, now + 0.005);
          // Schedule disconnect after fade completes
          const g = oldest.outGain;
          setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, 50);
        } catch { /* ok */ }
      }
    }

    // Create wrapper gain for pool tracking (trigger outputs connect to this)
    const poolGain = this.ctx.createGain();
    poolGain.gain.value = 1;
    poolGain.connect(this.voiceBusGains[voice] ?? this.masterGain);
    this.triggerTarget = poolGain;

    const entry = { outGain: poolGain, endTime: now + 12 }; // default 12s, updated below
    pool.push(entry);

    switch (voice) {
      case 'sub':
        this.triggerSub(velocity, t);
        break;
      case 'kick':
        this.triggerKick(velocity, t);
        break;
      case 'click':
        this.triggerClick(velocity, t);
        break;
      case 'beepHi':
        this.triggerBeepHi(velocity, t);
        break;
      case 'beepLo':
        this.triggerBeepLo(velocity, t);
        break;
      case 'noise':
        this.triggerNoise(velocity, t);
        break;
      case 'membrane':
        this.triggerMembrane(velocity, t);
        break;
    }

    // Update pool entry endTime from the latest transient node group (just registered by the trigger method)
    const lastGroup = this.transientNodeGroups[this.transientNodeGroups.length - 1];
    if (lastGroup) {
      entry.endTime = lastGroup.expiresAt;
    }
    
    // Notify UI
    if (this.onDrumTrigger) {
      this.onDrumTrigger(voice, velocity);
    }
  }
  
  /**
   * Voice 1: Sub - Deep sine/triangle pulse with drive and sub-octave
   * New params: shape, pitchEnv, pitchDecay, drive, sub
   */
  private triggerSub(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.sub;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      // Notify UI of triggered morph position (normalized 0-1 within range)
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('sub', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    // Otherwise use slider values directly (which already have morph applied in UI)
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'sub', morphValue) : {};
    
    // Use morphed values if available, otherwise fall back to direct params
    const freq = (morphed.drumSubFreq as number) ?? p.drumSubFreq;
    const decay = (morphed.drumSubDecay as number) ?? p.drumSubDecay;
    const level = (morphed.drumSubLevel as number) ?? p.drumSubLevel;
    const tone = (morphed.drumSubTone as number) ?? p.drumSubTone;
    const shape = (morphed.drumSubShape as number) ?? p.drumSubShape ?? 0;
    const pitchEnv = (morphed.drumSubPitchEnv as number) ?? p.drumSubPitchEnv ?? 0;
    const pitchDecayTime = (morphed.drumSubPitchDecay as number) ?? p.drumSubPitchDecay ?? 50;
    const driveRaw = (morphed.drumSubDrive as number) ?? p.drumSubDrive ?? 0;
    const subOctave = (morphed.drumSubSub as number) ?? p.drumSubSub ?? 0;
    const attack = ((morphed.drumSubAttack as number) ?? p.drumSubAttack ?? 0) / 1000;
    const variation = (morphed.drumSubVariation as number) ?? p.drumSubVariation ?? 0;
    const distance = this.triggerDistanceOverride ?? ((morphed.drumSubDistance as number) ?? p.drumSubDistance ?? 0.5);
    
    // Per-hit micro-variation (correlated jitter) + distance macro (strike-position)
    const v = this.computeVariation(variation);
    const d = this.computeDistance(distance);
    // Center: less drive saturation; Edge: more drive harmonics
    const drive = this.clEd(driveRaw, d.t, DrumSynth.CL_ED.sub.drive);
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Wave shape: 0 = sine, 0.5 = triangle, 1 = saw-like
    if (shape < 0.33) {
      osc.type = 'sine';
    } else if (shape < 0.66) {
      osc.type = 'triangle';
    } else {
      osc.type = 'sawtooth';
    }
    
    // Pitch envelope (variation: slight pitch jitter)
    const effFreq = freq * v.vPitch;
    const startFreq = effFreq * Math.pow(2, pitchEnv / 12);
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(effFreq, time + pitchDecayTime / 1000);
    
    // Add subtle harmonics based on tone parameter
    // Distance reduces tone brightness
    const effTone = tone * d.dBright;
    let osc2: OscillatorNode | null = null;
    let gain2: GainNode | null = null;
    if (effTone > 0.05) {
      osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = effFreq * 2; // Octave up
      gain2 = this.ctx.createGain();
      gain2.gain.value = effTone * 0.3 * velocity * level * v.vLevel * d.dLevel;
    }
    
    // Sub-octave oscillator for extra weight
    let subOsc: OscillatorNode | null = null;
    let subGain: GainNode | null = null;
    if (subOctave > 0.05) {
      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = effFreq / 2; // Octave down
      subGain = this.ctx.createGain();
      subGain.gain.value = subOctave * 0.5 * velocity * level * v.vLevel * d.dLevel;
    }
    
    // Waveshaper for drive/saturation
    const effDrive = drive;
    let waveshaper: WaveShaperNode | null = null;
    if (effDrive > 0.05) {
      waveshaper = this.ctx.createWaveShaper();
      const driveAmount = effDrive * 10;
      waveshaper.curve = this.getWaveshaperCurve(driveAmount);
      waveshaper.oversample = '2x';
    }
    
    // Envelope: attack ramp + exponential decay
    // Variation and distance affect level, decay time, and attack softness
    const outputLevel = velocity * level * v.vLevel * d.dLevel;
    const decayTime = Math.min((decay / 1000) * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const effAttack = Math.max(0.0001, attack * v.vAttack * d.dAttack);
    
    if (effAttack > 0.0005) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(outputLevel, time + effAttack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + effAttack + decayTime);
    } else {
      gain.gain.setValueAtTime(outputLevel, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    }
    
    const envDuration = effAttack + decayTime;
    
    // Connect chain
    if (waveshaper) {
      osc.connect(waveshaper);
      waveshaper.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    // Connect to delay send
    if (this.delaySends.sub) {
      gain.connect(this.delaySends.sub);
    }
    
    osc.start(time);
    osc.stop(time + envDuration + 0.01);
    
    if (osc2 && gain2) {
      if (effAttack > 0.0005) {
        gain2.gain.setValueAtTime(0, time);
        gain2.gain.linearRampToValueAtTime(effTone * 0.3 * velocity * level * v.vLevel * d.dLevel, time + effAttack);
        gain2.gain.exponentialRampToValueAtTime(0.001, time + effAttack + decayTime * 0.7);
      } else {
        gain2.gain.setValueAtTime(gain2.gain.value, time);
        gain2.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.7);
      }
      osc2.connect(gain2);
      gain2.connect(this.triggerTarget);
      // Also send harmonics to delay
      if (this.delaySends.sub) {
        gain2.connect(this.delaySends.sub);
      }
      osc2.start(time);
      osc2.stop(time + envDuration + 0.01);
    }
    
    if (subOsc && subGain) {
      if (effAttack > 0.0005) {
        subGain.gain.setValueAtTime(0, time);
        subGain.gain.linearRampToValueAtTime(subOctave * 0.5 * velocity * level * v.vLevel * d.dLevel, time + effAttack);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + effAttack + decayTime * 1.2);
      } else {
        subGain.gain.setValueAtTime(subGain.gain.value, time);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 1.2);
      }
      subOsc.connect(subGain);
      subGain.connect(this.triggerTarget);
      // Also send sub-octave to delay
      if (this.delaySends.sub) {
        subGain.connect(this.delaySends.sub);
      }
      subOsc.start(time);
      subOsc.stop(time + envDuration + 0.02);
    }

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(envDuration + 0.5, osc, gain, waveshaper, osc2, gain2, subOsc, subGain);
  }

  /**
   * New params: body, punch, tail, tone
   */
  private triggerKick(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.kick;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('kick', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'kick', morphValue) : {};
    
    // Use morphed values if available
    const freq = (morphed.drumKickFreq as number) ?? p.drumKickFreq;
    const pitchEnv = (morphed.drumKickPitchEnv as number) ?? p.drumKickPitchEnv;
    const pitchDecayRaw = ((morphed.drumKickPitchDecay as number) ?? p.drumKickPitchDecay) / 1000;
    const decay = ((morphed.drumKickDecay as number) ?? p.drumKickDecay) / 1000;
    const level = (morphed.drumKickLevel as number) ?? p.drumKickLevel;
    const click = (morphed.drumKickClick as number) ?? p.drumKickClick;
    const bodyRaw = (morphed.drumKickBody as number) ?? p.drumKickBody ?? 0.5;
    const punch = (morphed.drumKickPunch as number) ?? p.drumKickPunch ?? 0.5;
    const tailRaw = (morphed.drumKickTail as number) ?? p.drumKickTail ?? 0;
    const tone = (morphed.drumKickTone as number) ?? p.drumKickTone ?? 0;
    const attack = ((morphed.drumKickAttack as number) ?? p.drumKickAttack ?? 0) / 1000;
    const variation = (morphed.drumKickVariation as number) ?? p.drumKickVariation ?? 0;
    const distance = this.triggerDistanceOverride ?? ((morphed.drumKickDistance as number) ?? p.drumKickDistance ?? 0.5);
    
    // Per-hit micro-variation + distance macro (strike-position)
    const v = this.computeVariation(variation);
    const d = this.computeDistance(distance);
    // Center: pitch sweep extends; Edge: tighter sweep
    const pitchDecay = Math.min(0.5, this.clEd(Math.max(0.01, pitchDecayRaw), d.t, DrumSynth.CL_ED.kick.pitchDecay));
    // Center: more body resonance; Edge: thinner
    const body = bodyRaw * d.dBody;
    // Center: more sub sustain tail; Edge: tighter
    const tail = Math.max(0, this.clEd(tailRaw, d.t, DrumSynth.CL_ED.kick.tail));
    const effAttack = Math.max(0.0001, attack * v.vAttack * d.dAttack);
    const effDecay = Math.min(decay * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const effFreq = freq * v.vPitch;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    
    // Pitch envelope: start high, sweep down to base frequency
    const effPunch = punch * d.dTransient;
    const punchMultiplier = 0.5 + effPunch * 1.5;
    const startFreq = effFreq * Math.pow(2, (pitchEnv * punchMultiplier) / 12);
    
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(effFreq, time + pitchDecay);
    
    // Click transient (high-frequency burst for attack) â€” distance reduces click
    const effClick = click * d.dTransient * v.vBright;
    let clickOsc: OscillatorNode | null = null;
    let clickGain: GainNode | null = null;
    if (effClick > 0.05) {
      clickOsc = this.ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.value = (3000 + effPunch * 2000) * d.dBright;
      clickGain = this.ctx.createGain();
      const clickLevel = effClick * velocity * level * 0.5 * v.vLevel * d.dLevel;
      clickGain.gain.setValueAtTime(clickLevel, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.005);
    }
    
    // Body layer - adds mid-frequency content
    let bodyOsc: OscillatorNode | null = null;
    let bodyGain: GainNode | null = null;
    let bodyFilter: BiquadFilterNode | null = null;
    if (body > 0.1) {
      bodyOsc = this.ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.value = effFreq * 1.5;
      bodyFilter = this.ctx.createBiquadFilter();
      bodyFilter.type = 'lowpass';
      bodyFilter.frequency.value = effFreq * 4 * d.dBright;
      bodyGain = this.ctx.createGain();
      const bodyLevel = body * velocity * level * 0.4 * v.vLevel * d.dLevel;
      bodyGain.gain.setValueAtTime(bodyLevel, time);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, time + effDecay * 0.6);
    }
    
    // Tail layer - adds sustain/room feel
    let tailSource: AudioBufferSourceNode | null = null;
    let tailFilter: BiquadFilterNode | null = null;
    let tailGain: GainNode | null = null;
    if (tail > 0.1 && this.noiseBuffer) {
      tailSource = this.ctx.createBufferSource();
      tailSource.buffer = this.noiseBuffer;
      tailFilter = this.ctx.createBiquadFilter();
      tailFilter.type = 'lowpass';
      tailFilter.frequency.value = effFreq * 2 * d.dBright;
      tailFilter.Q.value = 2;
      tailGain = this.ctx.createGain();
      const tailLevel = tail * velocity * level * 0.2 * v.vLevel * d.dLevel;
      tailGain.gain.setValueAtTime(0, time);
      tailGain.gain.linearRampToValueAtTime(tailLevel, time + effDecay * 0.1);
      tailGain.gain.exponentialRampToValueAtTime(0.001, time + effDecay * 1.5);
    }
    
    // Tone adds harmonic distortion (distance reduces)
    const effTone = tone * d.dBright;
    let waveshaper: WaveShaperNode | null = null;
    if (effTone > 0.05) {
      waveshaper = this.ctx.createWaveShaper();
      const driveAmount = effTone * 5;
      waveshaper.curve = this.getWaveshaperCurve(driveAmount);
    }
    
    // Amplitude envelope
    const outputLevel = velocity * level * v.vLevel * d.dLevel;
    
    if (effAttack > 0.0005) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(outputLevel, time + effAttack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + effAttack + effDecay);
    } else {
      gain.gain.setValueAtTime(outputLevel, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + effDecay);
    }
    
    const kickEnvDuration = effAttack + effDecay;
    
    // Connect main chain
    if (waveshaper) {
      osc.connect(waveshaper);
      waveshaper.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    // Connect to delay send
    if (this.delaySends.kick) {
      gain.connect(this.delaySends.kick);
    }
    
    osc.start(time);
    osc.stop(time + kickEnvDuration + 0.01);
    
    if (clickOsc && clickGain) {
      clickOsc.connect(clickGain);
      clickGain.connect(this.triggerTarget);
      if (this.delaySends.kick) {
        clickGain.connect(this.delaySends.kick);
      }
      clickOsc.start(time);
      clickOsc.stop(time + 0.01);
    }
    
    if (bodyOsc && bodyFilter && bodyGain) {
      bodyOsc.connect(bodyFilter);
      bodyFilter.connect(bodyGain);
      bodyGain.connect(this.triggerTarget);
      if (this.delaySends.kick) {
        bodyGain.connect(this.delaySends.kick);
      }
      bodyOsc.start(time);
      bodyOsc.stop(time + kickEnvDuration + 0.01);
    }
    
    if (tailSource && tailFilter && tailGain) {
      tailSource.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(this.triggerTarget);
      tailGain.connect(this.reverbSend);
      if (this.delaySends.kick) {
        tailGain.connect(this.delaySends.kick);
      }
      tailSource.start(time);
      tailSource.stop(time + kickEnvDuration * 1.5 + 0.01);
    }

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(kickEnvDuration * 1.5 + 0.5, osc, gain, waveshaper, clickOsc, clickGain, bodyOsc, bodyFilter, bodyGain, tailSource, tailFilter, tailGain);
  }

  /**
   * New params: pitch, pitchEnv, mode, grainCount, grainSpread, stereoWidth
   */
  private triggerClick(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.click;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('click', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'click', morphValue) : {};
    
    // Use morphed values if available
    const decay = ((morphed.drumClickDecay as number) ?? p.drumClickDecay) / 1000;
    const filterFreq = (morphed.drumClickFilter as number) ?? p.drumClickFilter;
    const tone = (morphed.drumClickTone as number) ?? p.drumClickTone;
    const level = (morphed.drumClickLevel as number) ?? p.drumClickLevel;
    const resonance = (morphed.drumClickResonance as number) ?? p.drumClickResonance;
    const pitch = (morphed.drumClickPitch as number) ?? p.drumClickPitch ?? 2000;
    const pitchEnv = (morphed.drumClickPitchEnv as number) ?? p.drumClickPitchEnv ?? 0;
    const mode = (morphed.drumClickMode as string) ?? p.drumClickMode ?? 'impulse';
    const grainCount = (morphed.drumClickGrainCount as number) ?? p.drumClickGrainCount ?? 1;
    const grainSpread = (morphed.drumClickGrainSpread as number) ?? p.drumClickGrainSpread ?? 0;
    const stereoWidth = (morphed.drumClickStereoWidth as number) ?? p.drumClickStereoWidth ?? 0;
    const exciterColor = (morphed.drumClickExciterColor as number) ?? p.drumClickExciterColor ?? 0;
    const attack = ((morphed.drumClickAttack as number) ?? p.drumClickAttack ?? 0) / 1000;
    const variation = (morphed.drumClickVariation as number) ?? p.drumClickVariation ?? 0;
    const distance = this.triggerDistanceOverride ?? ((morphed.drumClickDistance as number) ?? p.drumClickDistance ?? 0.5);
    
    // Per-hit micro-variation + distance macro (strike-position)
    const v = this.computeVariation(variation);
    const d = this.computeDistance(distance);
    
    const outputLevel = Math.min(1, velocity * level * v.vLevel * d.dLevel);
    const effDecay = Math.min(decay * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const effFilterFreq = filterFreq * v.vBright * d.dBright;
    const effResonance = this.clEd(resonance * v.vBright, d.t, DrumSynth.CL_ED.click.resonance);
    const effAttack = Math.max(0.0001, attack * v.vAttack * d.dAttack);
    const effTone = tone * d.dBright;
    const effPitch = pitch * v.vPitch;
    
    // Continuous exciter color mode: crossfade between impulse (0) and noise (1)
    // This overrides the discrete mode switch when exciterColor is active
    if (exciterColor > 0.01 && mode !== 'granular') {
      this.triggerClickContinuous(time, outputLevel, effDecay, effFilterFreq, effResonance, effTone, effPitch, pitchEnv, exciterColor, effAttack);
      return;
    }
    
    // Different synthesis modes (discrete, original behavior)
    switch (mode) {
      case 'impulse':
        this.triggerClickImpulse(time, outputLevel, effDecay, effFilterFreq, effResonance, effTone, effAttack);
        break;
      case 'noise':
        this.triggerClickNoise(time, outputLevel, effDecay, effFilterFreq, effResonance, effTone, effAttack);
        break;
      case 'tonal':
        this.triggerClickTonal(time, outputLevel, effDecay, effPitch, pitchEnv, effFilterFreq, effAttack);
        break;
      case 'granular':
        this.triggerClickGranular(time, outputLevel, effDecay, grainCount, grainSpread, effFilterFreq, stereoWidth, effAttack);
        break;
      default:
        this.triggerClickImpulse(time, outputLevel, effDecay, effFilterFreq, effResonance, effTone, effAttack);
    }
  }
  
  /** Click mode: Impulse - very short sharp transient */
  private triggerClickImpulse(
    time: number, level: number, decay: number, 
    filterFreq: number, resonance: number, tone: number, attack: number
  ): void {
    if (!this.noiseBuffer) return;
    
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    
    // Highpass filter for sharp digital character
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.5 + resonance * 15;
    
    // Shorter decay for impulse feel
    const actualDecay = decay * (0.1 + tone * 0.2);
    
    if (attack > 0.0005) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + attack + actualDecay);
    } else {
      gain.gain.setValueAtTime(level, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + actualDecay);
    }
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    source.start(time);
    source.stop(time + attack + actualDecay + 0.01);

    this.trackTransientNodes(attack + actualDecay + 0.5, source, filter, gain);
  }
  
  /** Click mode: Noise - longer filtered noise burst */
  private triggerClickNoise(
    time: number, level: number, decay: number,
    filterFreq: number, resonance: number, tone: number, attack: number
  ): void {
    if (!this.noiseBuffer) return;
    
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1 + resonance * 10;
    
    const actualDecay = decay * (0.5 + tone * 0.5);
    
    if (attack > 0.0005) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + attack + actualDecay);
    } else {
      gain.gain.setValueAtTime(level, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + actualDecay);
    }
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    source.start(time);
    source.stop(time + attack + actualDecay + 0.01);

    this.trackTransientNodes(attack + actualDecay + 0.5, source, filter, gain);
  }
  
  /** Click mode: Tonal - pitched sine click with pitch envelope */
  private triggerClickTonal(
    time: number, level: number, decay: number,
    pitch: number, pitchEnv: number, filterFreq: number, attack: number
  ): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    
    // Apply pitch envelope
    const startPitch = pitch * Math.pow(2, pitchEnv / 12);
    osc.frequency.setValueAtTime(startPitch, time);
    osc.frequency.exponentialRampToValueAtTime(pitch, time + decay * 0.3);
    
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    
    if (attack > 0.0005) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    } else {
      gain.gain.setValueAtTime(level, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    }
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    osc.start(time);
    osc.stop(time + attack + decay + 0.01);

    this.trackTransientNodes(attack + decay + 0.5, osc, filter, gain);
  }
  
  /** Click mode: Granular - multiple micro-hits spread in time */
  private triggerClickGranular(
    time: number, level: number, decay: number,
    grainCount: number, grainSpread: number, filterFreq: number, stereoWidth: number, attack: number
  ): void {
    if (!this.noiseBuffer) return;
    
    const spreadTime = grainSpread / 1000;
    const grainLevel = level / Math.sqrt(grainCount);
    
    for (let i = 0; i < grainCount; i++) {
      const grainTime = time + this.rng() * spreadTime;
      const grainDecay = decay * (0.5 + this.rng() * 0.5);
      
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();
      
      source.buffer = this.noiseBuffer;
      
      filter.type = 'highpass';
      filter.frequency.value = filterFreq * (0.8 + this.rng() * 0.4);
      filter.Q.value = 2;
      
      // Stereo spread
      panner.pan.value = (this.rng() * 2 - 1) * stereoWidth;
      
      if (attack > 0.0005) {
        gain.gain.setValueAtTime(0, grainTime);
        gain.gain.linearRampToValueAtTime(grainLevel, grainTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, grainTime + attack + grainDecay);
      } else {
        gain.gain.setValueAtTime(grainLevel, grainTime);
        gain.gain.exponentialRampToValueAtTime(0.001, grainTime + grainDecay);
      }
      
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.triggerTarget);
      panner.connect(this.reverbSend);
      if (this.delaySends.click) {
        panner.connect(this.delaySends.click);
      }
      
      source.start(grainTime);
      source.stop(grainTime + attack + grainDecay + 0.01);

      this.trackTransientNodes(spreadTime + attack + decay + 0.5, source, filter, gain, panner);
    }
  }

  /**
   * Click mode: Continuous exciter â€” crossfades between impulse noise (0)
   * through tonal click (0.5) to filtered noise burst (1.0).
   * Replaces discrete mode switching with a single continuous control.
   */
  private triggerClickContinuous(
    time: number, level: number, decay: number,
    filterFreq: number, resonance: number, tone: number,
    pitch: number, pitchEnv: number, color: number, attack: number
  ): void {
    if (!this.noiseBuffer) return;
    
    // Impulse layer (sharp transient noise, dominant when color ~0)
    const impulseLevel = Math.max(0, 1 - color * 2); // 1â†’0 over color 0â†’0.5
    
    // Tonal layer (pitched sine click, peaks at color ~0.5)
    const tonalLevel = 1 - Math.abs(color - 0.5) * 2; // peaks at 0.5
    
    // Noise layer (filtered noise burst, dominant when color ~1)
    const noiseLevel = Math.max(0, (color - 0.5) * 2); // 0â†’1 over color 0.5â†’1
    
    // === Impulse component ===
    if (impulseLevel > 0.01) {
      const src = this.ctx.createBufferSource();
      const hp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      hp.type = 'highpass';
      hp.frequency.value = filterFreq;
      hp.Q.value = 0.5 + resonance * 15;
      const impDecay = decay * (0.1 + tone * 0.2);
      if (attack > 0.0005) {
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(level * impulseLevel, time + attack);
        g.gain.exponentialRampToValueAtTime(0.001, time + attack + impDecay);
      } else {
        g.gain.setValueAtTime(level * impulseLevel, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + impDecay);
      }
      src.connect(hp);
      hp.connect(g);
      g.connect(this.triggerTarget);
      g.connect(this.reverbSend);
      if (this.delaySends.click) g.connect(this.delaySends.click);
      src.start(time);
      src.stop(time + attack + impDecay + 0.01);
      this.trackTransientNodes(attack + impDecay + 0.5, src, hp, g);
    }
    
    // === Tonal component ===
    if (tonalLevel > 0.01) {
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const startPitch = pitch * Math.pow(2, pitchEnv / 12);
      osc.frequency.setValueAtTime(startPitch, time);
      osc.frequency.exponentialRampToValueAtTime(pitch, time + decay * 0.3);
      lp.type = 'lowpass';
      lp.frequency.value = filterFreq;
      if (attack > 0.0005) {
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(level * tonalLevel, time + attack);
        g.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
      } else {
        g.gain.setValueAtTime(level * tonalLevel, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + decay);
      }
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.triggerTarget);
      g.connect(this.reverbSend);
      if (this.delaySends.click) g.connect(this.delaySends.click);
      osc.start(time);
      osc.stop(time + attack + decay + 0.01);
      this.trackTransientNodes(attack + decay + 0.5, osc, lp, g);
    }
    
    // === Noise component ===
    if (noiseLevel > 0.01) {
      const src = this.ctx.createBufferSource();
      const bp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      bp.type = 'bandpass';
      bp.frequency.value = filterFreq;
      bp.Q.value = 1 + resonance * 10;
      const nDecay = decay * (0.5 + tone * 0.5);
      if (attack > 0.0005) {
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(level * noiseLevel, time + attack);
        g.gain.exponentialRampToValueAtTime(0.001, time + attack + nDecay);
      } else {
        g.gain.setValueAtTime(level * noiseLevel, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + nDecay);
      }
      src.connect(bp);
      bp.connect(g);
      g.connect(this.triggerTarget);
      g.connect(this.reverbSend);
      if (this.delaySends.click) g.connect(this.delaySends.click);
      src.start(time);
      src.stop(time + attack + nDecay + 0.01);
      this.trackTransientNodes(attack + nDecay + 0.5, src, bp, g);
    }
  }

  /**
   * New params: inharmonic, partials, shimmer, shimmerRate, brightness
   */
  private triggerBeepHi(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.beepHi;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('beepHi', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'beepHi', morphValue) : {};
    
    // Use morphed values if available
    const freq = (morphed.drumBeepHiFreq as number) ?? p.drumBeepHiFreq;
    const attack = ((morphed.drumBeepHiAttack as number) ?? p.drumBeepHiAttack) / 1000;
    const decay = ((morphed.drumBeepHiDecay as number) ?? p.drumBeepHiDecay) / 1000;
    const level = (morphed.drumBeepHiLevel as number) ?? p.drumBeepHiLevel;
    const tone = (morphed.drumBeepHiTone as number) ?? p.drumBeepHiTone;
    const inharmonic = (morphed.drumBeepHiInharmonic as number) ?? p.drumBeepHiInharmonic ?? 0;
    const partials = (morphed.drumBeepHiPartials as number) ?? p.drumBeepHiPartials ?? 1;
    const shimmer = (morphed.drumBeepHiShimmer as number) ?? p.drumBeepHiShimmer ?? 0;
    const shimmerRate = (morphed.drumBeepHiShimmerRate as number) ?? p.drumBeepHiShimmerRate ?? 4;
    const brightness = (morphed.drumBeepHiBrightness as number) ?? p.drumBeepHiBrightness ?? 0.5;
    const feedback = (morphed.drumBeepHiFeedback as number) ?? p.drumBeepHiFeedback ?? 0;
    const modEnvDecay = (morphed.drumBeepHiModEnvDecay as number) ?? p.drumBeepHiModEnvDecay ?? 0;
    const noiseInMod = (morphed.drumBeepHiNoiseInMod as number) ?? p.drumBeepHiNoiseInMod ?? 0;
    const modRatio = (morphed.drumBeepHiModRatio as number) ?? p.drumBeepHiModRatio ?? 2;
    const modRatioFine = (morphed.drumBeepHiModRatioFine as number) ?? p.drumBeepHiModRatioFine ?? 0.01;
    const modPhase = (morphed.drumBeepHiModPhase as number) ?? p.drumBeepHiModPhase ?? 0;
    const modEnvEnd = (morphed.drumBeepHiModEnvEnd as number) ?? p.drumBeepHiModEnvEnd ?? 0.2;
    const noiseDecay = (morphed.drumBeepHiNoiseDecay as number) ?? p.drumBeepHiNoiseDecay ?? 0;
    const variation = (morphed.drumBeepHiVariation as number) ?? p.drumBeepHiVariation ?? 0;
    const distance = this.triggerDistanceOverride ?? ((morphed.drumBeepHiDistance as number) ?? p.drumBeepHiDistance ?? 0.5);
    
    // Per-hit micro-variation + distance macro
    // BeepHi is high-frequency/metallic â€” distance affects it more aggressively
    // than lower voices (HF content rolls off faster with distance in real acoustics)
    const v = this.computeVariation(variation);
    const d = this.computeDistance(distance);
    // CL_ED brightness: center=warmer, edge=brighter
    const dBrightHi = this.clEd(1, d.t, DrumSynth.CL_ED.beepHi.bright);
    const dLevelHi = d.dLevel * d.dBody;
    const effFreq = freq * v.vPitch;
    const effDecay = Math.min(decay * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const effAttack = Math.max(0.0001, attack * v.vAttack * d.dAttack);
    const effBrightness = brightness * dBrightHi;
    // CL_ED shimmer + feedback
    const effShimmer = this.clEd(shimmer, d.t, DrumSynth.CL_ED.beepHi.shimmer);
    const effFeedback = this.clEd(feedback, d.t, DrumSynth.CL_ED.beepHi.feedback);
    
    const outputLevel = Math.min(1, velocity * level * v.vLevel * dLevelHi);
    const numPartials = Math.max(1, Math.round(partials));
    
    // Create oscillators for each partial
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    
    // Main output gain
    const mainGain = this.ctx.createGain();
    mainGain.connect(this.triggerTarget);
    mainGain.connect(this.reverbSend);
    if (this.delaySends.beepHi) {
      mainGain.connect(this.delaySends.beepHi);
    }
    
    // Brightness filter (distance applies)
    const brightnessFilter = this.ctx.createBiquadFilter();
    brightnessFilter.type = 'lowpass';
    brightnessFilter.frequency.value = effFreq * (1 + effBrightness * 4);
    brightnessFilter.connect(mainGain);
    
    // LFO for shimmer (variation jitters rate)
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (shimmer > 0.01) {
      lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = shimmerRate * v.vBright; // subtle rate jitter
      lfoGain = this.ctx.createGain();
      lfoGain.gain.value = effShimmer * 0.3 * outputLevel;
      lfo.connect(lfoGain);
      lfoGain.connect(mainGain.gain);
    }
    
    for (let i = 0; i < numPartials; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      
      // Calculate partial frequency with inharmonicity
      // Inharmonic = 0: harmonic series (1, 2, 3, 4...)
      // Inharmonic = 1: detuned/bell-like (1, 2.1, 3.3, 4.7...)
      const harmonicRatio = i + 1;
      const inharmonicOffset = Math.pow(harmonicRatio, 1 + inharmonic * 0.5) - harmonicRatio;
      const partialFreq = effFreq * (harmonicRatio + inharmonicOffset * inharmonic);
      
      osc.frequency.value = partialFreq;
      
      // Level falls off for higher partials
      const partialLevel = outputLevel / numPartials / Math.pow(harmonicRatio, 0.5);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, partialLevel), time + effAttack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + effAttack + effDecay);
      
      osc.connect(gain);
      gain.connect(brightnessFilter);
      
      oscillators.push(osc);
      gains.push(gain);
    }
    
    // FM modulation for metallic character (from original tone param)
    // Enhanced with: feedback, mod index envelope, noise injection
    // Distance reduces FM depth aggressively (less metallic at distance)
    const effTone = tone * dBrightHi;
    let modOsc: OscillatorNode | null = null;
    let modGain: GainNode | null = null;
    let feedbackDelay: DelayNode | null = null;
    let feedbackGain: GainNode | null = null;
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseGain: GainNode | null = null;
    let modEnvGain: GainNode | null = null;
    if (effTone > 0.1) {
      modOsc = this.ctx.createOscillator();
      // User-controlled FM ratio (coarse integer + fine detune)
      const effectiveRatio = modRatio + modRatioFine;
      modOsc.frequency.value = effFreq * effectiveRatio;
      
      // Mod phase: apply start phase offset via custom PeriodicWave
      // Phase rotation: sin(x + phi) = cos(phi)*sin(x) + sin(phi)*cos(x)
      if (modPhase > 0.001) {
        const phi = modPhase * 2 * Math.PI;
        // PeriodicWave: real[] = cosine coefficients, imag[] = sine coefficients
        const real = new Float32Array([0, Math.sin(phi)]);
        const imag = new Float32Array([0, Math.cos(phi)]);
        const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        modOsc.setPeriodicWave(wave);
      } else {
        modOsc.type = 'sine';
      }
      
      // FM feedback: modulator output feeds back into its own frequency
      // Bipolar: positive = saw-like harmonics, negative = square-like
      if (Math.abs(feedback) > 0.01) {
        feedbackDelay = this.ctx.createDelay(0.01);
        feedbackDelay.delayTime.value = 1 / (effFreq * effectiveRatio); // One cycle delay
        feedbackGain = this.ctx.createGain();
        feedbackGain.gain.value = effFeedback * effFreq * 0.5;
        modOsc.connect(feedbackDelay);
        feedbackDelay.connect(feedbackGain);
        feedbackGain.connect(modOsc.frequency);
      }
      
      // Base mod gain (static level)
      const baseModDepth = effTone * effFreq * 0.3;
      
      // Mod index envelope: controls how mod depth decays over time
      // ADE contour: Attackâ†’peak, then Decayâ†’End level (modEnvEnd controls sustain)
      if (modEnvDecay > 0.01) {
        // modEnvDecay 0..1 maps to fast (5ms) to slow (300ms) envelope
        const envDuration = 0.005 + modEnvDecay * 0.295;
        modEnvGain = this.ctx.createGain();
        // Start at full mod depth, decay to end level (ADE sustain)
        const peakMod = baseModDepth * (1 + modEnvDecay * 4);
        const sustainMod = Math.max(baseModDepth * modEnvEnd, 0.01);
        modEnvGain.gain.setValueAtTime(peakMod, time);
        modEnvGain.gain.exponentialRampToValueAtTime(
          sustainMod, time + envDuration
        );
        modOsc.connect(modEnvGain);
        if (oscillators.length > 0) {
          modEnvGain.connect(oscillators[0].frequency);
        }
      } else {
        // Static mod depth (original behavior)
        modGain = this.ctx.createGain();
        modGain.gain.value = baseModDepth;
        modOsc.connect(modGain);
        if (oscillators.length > 0) {
          modGain.connect(oscillators[0].frequency);
        }
      }
      
      // Noise injection into FM modulator path
      // Separate noiseDecay param: 0=instant snap, 1=slow fade matching note decay
      if (noiseInMod > 0.01 && oscillators.length > 0) {
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
          noiseData[i] = (Math.random() * 2 - 1);
        }
        noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseGain = this.ctx.createGain();
        // Noise adds to carrier frequency modulation
        const noiseDepth = noiseInMod * effFreq * 0.5;
        // noiseDecay: 0 = instant snap to 0, 1 = full note decay
        const noiseDur = 0.005 + noiseDecay * (effAttack + effDecay * 0.8);
        noiseGain.gain.setValueAtTime(noiseDepth, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + noiseDur);
        noiseSource.connect(noiseGain);
        noiseGain.connect(oscillators[0].frequency);
      }
    }
    
    // Start all oscillators
    oscillators.forEach(osc => {
      osc.start(time);
      osc.stop(time + effAttack + effDecay + 0.01);
    });
    
    if (lfo) {
      lfo.start(time);
      lfo.stop(time + effAttack + effDecay + 0.01);
    }
    
    if (modOsc) {
      modOsc.start(time);
      modOsc.stop(time + effAttack + effDecay + 0.01);
    }
    
    if (noiseSource) {
      noiseSource.start(time);
      noiseSource.stop(time + effAttack + effDecay + 0.01);
    }

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(effAttack + effDecay + 0.5, mainGain, brightnessFilter, lfo, lfoGain, modOsc, modGain, modEnvGain, feedbackDelay, feedbackGain, noiseSource, noiseGain, ...oscillators, ...gains);
  }
  
  /**
   * Voice 5: Beep Lo - Pitched blip with Karplus-Strong pluck option
   * New params: pitchEnv, pitchDecay, body, pluck, pluckDamp
   */
  private triggerBeepLo(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.beepLo;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('beepLo', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'beepLo', morphValue) : {};
    
    // Use morphed values if available
    const freq = (morphed.drumBeepLoFreq as number) ?? p.drumBeepLoFreq;
    const attack = ((morphed.drumBeepLoAttack as number) ?? p.drumBeepLoAttack) / 1000;
    const decay = ((morphed.drumBeepLoDecay as number) ?? p.drumBeepLoDecay) / 1000;
    const level = (morphed.drumBeepLoLevel as number) ?? p.drumBeepLoLevel;
    const tone = (morphed.drumBeepLoTone as number) ?? p.drumBeepLoTone;
    const pitchEnv = (morphed.drumBeepLoPitchEnv as number) ?? p.drumBeepLoPitchEnv ?? 0;
    const pitchDecayTime = ((morphed.drumBeepLoPitchDecay as number) ?? p.drumBeepLoPitchDecay ?? 50) / 1000;
    const body = (morphed.drumBeepLoBody as number) ?? p.drumBeepLoBody ?? 0.3;
    const pluck = (morphed.drumBeepLoPluck as number) ?? p.drumBeepLoPluck ?? 0;
    const pluckDamp = (morphed.drumBeepLoPluckDamp as number) ?? p.drumBeepLoPluckDamp ?? 0.5;
    const modal = (morphed.drumBeepLoModal as number) ?? p.drumBeepLoModal ?? 0;
    const modalQ = (morphed.drumBeepLoModalQ as number) ?? p.drumBeepLoModalQ ?? 10;
    const modalInharmonic = (morphed.drumBeepLoModalInharmonic as number) ?? p.drumBeepLoModalInharmonic ?? 0;
    const modalSpread = (morphed.drumBeepLoModalSpread as number) ?? p.drumBeepLoModalSpread ?? 0;
    const modalCut = (morphed.drumBeepLoModalCut as number) ?? p.drumBeepLoModalCut ?? 0;
    const oscGainTrim = (morphed.drumBeepLoOscGain as number) ?? p.drumBeepLoOscGain ?? 1;
    const modalGainTrim = (morphed.drumBeepLoModalGain as number) ?? p.drumBeepLoModalGain ?? 1;
    const variation = (morphed.drumBeepLoVariation as number) ?? p.drumBeepLoVariation ?? 0;
    const distance = this.triggerDistanceOverride ?? ((morphed.drumBeepLoDistance as number) ?? p.drumBeepLoDistance ?? 0.5);
    
    // Per-hit micro-variation + distance macro (strike-position)
    const v = this.computeVariation(variation);
    const d = this.computeDistance(distance);
    const effFreq = freq * v.vPitch;
    const effDecay = Math.min(decay * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const effAttack = Math.max(0.0001, attack * v.vAttack * d.dAttack);
    // CL_ED: modalQ and modalGain
    const effModalQ = this.clEd(modalQ, d.t, DrumSynth.CL_ED.beepLo.modalQ);
    const effModalGainTrim = this.clEd(modalGainTrim, d.t, DrumSynth.CL_ED.beepLo.modalGain);
    
    const outputLevel = Math.min(1, velocity * level * v.vLevel * d.dLevel);
    
    // Equal-power crossfade between oscillator/pluck and modal resonator engines.
    const oscAmp = Math.cos(modal * Math.PI / 2) * oscGainTrim;
    const modalAmp = Math.sin(modal * Math.PI / 2) * effModalGainTrim;
    
    // â”€â”€ Modal resonator engine (when modal > 0) â”€â”€
    if (modalAmp > 0.01) {
      // Pass variation excite jitter for burst length variation, and distance brightness
      this.triggerBeepLoModal(time, outputLevel * modalAmp, effFreq, effAttack, effDecay, effModalQ, modalInharmonic, body, modalSpread, modalCut, v.vExcite, d.dBright);
    }
    
    // â”€â”€ Oscillator / Pluck engine (when modal < 1) â”€â”€
    if (oscAmp < 0.01) return; // fully modal, skip osc path
    
    const oscLevel = outputLevel * oscAmp;
    
    // If pluck is high, use Karplus-Strong synthesis
    if (pluck > 0.3) {
      this.triggerBeepLoPluck(time, oscLevel, effFreq, effDecay, pluck, pluckDamp * d.dBright, body);
      return;
    }
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Blend between sine and square based on tone (distance darkens)
    const effTone = tone * d.dBright;
    osc.type = effTone > 0.5 ? 'square' : 'sine';
    
    // Pitch envelope
    const startFreq = effFreq * Math.pow(2, pitchEnv / 12);
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(effFreq, time + pitchDecayTime);
    
    // If using square, filter to soften harmonics (distance reduces filter cutoff)
    let filter: BiquadFilterNode | null = null;
    if (effTone > 0.5) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = effFreq * 4 * d.dBright;
      filter.Q.value = 0.7;
    }
    
    // Body resonance filter (variation jitters Q)
    let bodyFilter: BiquadFilterNode | null = null;
    if (body > 0.1) {
      bodyFilter = this.ctx.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.value = effFreq * 1.5;
      bodyFilter.Q.value = (2 + body * 5) * v.vBright;
      bodyFilter.gain.value = body * 6;
    }
    
    // Attack/decay envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(oscLevel, time + effAttack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + effAttack + effDecay);
    
    // Connect chain
    let lastNode: AudioNode = osc;
    if (filter) {
      lastNode.connect(filter);
      lastNode = filter;
    }
    if (bodyFilter) {
      lastNode.connect(bodyFilter);
      lastNode = bodyFilter;
    }
    lastNode.connect(gain);
    gain.connect(this.triggerTarget);
    gain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      gain.connect(this.delaySends.beepLo);
    }
    
    osc.start(time);
    osc.stop(time + effAttack + effDecay + 0.01);

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(effAttack + effDecay + 0.5, osc, gain, filter, bodyFilter);
  }
  
  /**
   * Karplus-Strong pluck synthesis for BeepLo
   * Creates string-like tones using filtered noise delay
   */
  private triggerBeepLoPluck(
    time: number, level: number, freq: number,
    decay: number, pluck: number, pluckDamp: number, body: number
  ): void {
    if (!this.noiseBuffer) return;
    
    // For Web Audio Karplus-Strong, we create a short noise burst
    // followed by a filtered delay line. Since Web Audio doesn't
    // have feedback delays easily, we'll approximate with filtered noise
    // and resonant filter combination.
    
    const source = this.ctx.createBufferSource();
    const exciteGain = this.ctx.createGain();
    const bodyFilter = this.ctx.createBiquadFilter();
    const dampFilter = this.ctx.createBiquadFilter();
    const outputGain = this.ctx.createGain();
    
    // Short noise burst as excitation
    source.buffer = this.noiseBuffer;
    
    // Very short burst
    const exciteTime = 0.005;
    exciteGain.gain.setValueAtTime(level * pluck, time);
    exciteGain.gain.exponentialRampToValueAtTime(0.001, time + exciteTime);
    
    // Body resonance - creates the pitched character
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.value = freq;
    bodyFilter.Q.value = 50 + body * 150; // High Q for resonance
    
    // Damping filter - controls how quickly highs die out
    dampFilter.type = 'lowpass';
    dampFilter.frequency.value = freq * (2 + (1 - pluckDamp) * 4);
    
    // Output envelope
    outputGain.gain.setValueAtTime(level, time);
    outputGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    // Add a sine oscillator at the fundamental for purity
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    oscGain.gain.setValueAtTime(level * (1 - pluck) * 0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    // Connect
    source.connect(exciteGain);
    exciteGain.connect(bodyFilter);
    bodyFilter.connect(dampFilter);
    dampFilter.connect(outputGain);
    outputGain.connect(this.triggerTarget);
    outputGain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      outputGain.connect(this.delaySends.beepLo);
    }
    
    osc.connect(oscGain);
    oscGain.connect(this.triggerTarget);
    oscGain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      oscGain.connect(this.delaySends.beepLo);
    }
    
    source.start(time);
    source.stop(time + exciteTime + 0.01);
    osc.start(time);
    osc.stop(time + decay + 0.01);

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(decay + 0.5, source, exciteGain, bodyFilter, dampFilter, outputGain, osc, oscGain);
  }
  
  /**
   * Modal resonator bank synthesis for BeepLo
   * Excites a bank of tuned bandpass resonators with noise burst â€”
   * like physical modelling of struck bars, bells, or plates.
   * @param inharmonic - 0: harmonic series, 1: metallic/bell-like ratios
   */
  private triggerBeepLoModal(
    time: number, level: number, freq: number,
    _attack: number, decay: number,
    modalQ: number, inharmonic: number, body: number,
    spread: number, cut: number,
    exciteJitter: number = 1, brightnessMult: number = 1
  ): void {
    if (!this.noiseBuffer) return;
    
    const numModes = 6; // Number of resonant modes
    const outputGain = this.ctx.createGain();
    // Modal synthesis is impulse-excited â€” the burst IS the attack.
    // No attack ramp: envelope starts at peak and decays immediately.
    // Level is pre-scaled by equal-power crossfade + gain trim in caller.
    const modalLevel = level;
    outputGain.gain.setValueAtTime(modalLevel, time);
    outputGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    outputGain.connect(this.triggerTarget);
    outputGain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      outputGain.connect(this.delaySends.beepLo);
    }
    
    // Short noise burst excitation â€” amplitude boosted to compensate for
    // bandpass resonators only passing narrow frequency bands of broadband noise.
    // Without this, the modal bank is ~30-40 dB quieter than a direct oscillator.
    // exciteJitter scales burst duration (variation randomness), brightnessMult dampens HF (distance)
    const exciteBoost = 40;
    const burstLength = 0.005 * exciteJitter;
    const exciteBuffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * burstLength), this.ctx.sampleRate);
    const exciteData = exciteBuffer.getChannelData(0);
    for (let i = 0; i < exciteData.length; i++) {
      const t = i / exciteData.length;
      exciteData[i] = (Math.random() * 2 - 1) * (1 - t) * exciteBoost;
    }
    const exciteSource = this.ctx.createBufferSource();
    exciteSource.buffer = exciteBuffer;
    
    const resonators: BiquadFilterNode[] = [];
    const modeGains: GainNode[] = [];
    
    // Bell/metallic partial ratios (approximation of common inharmonic patterns)
    // Harmonic: 1, 2, 3, 4, 5, 6
    // Bell-like: 1, 2.0, 3.0, 4.2, 5.4, 6.8 (Chladni-inspired)
    const harmonicRatios = [1, 2, 3, 4, 5, 6];
    const bellRatios = [1, 2.0, 3.0, 4.2, 5.4, 6.8];
    
    for (let i = 0; i < numModes; i++) {
      const harmonic = harmonicRatios[i];
      const bell = bellRatios[i];
      const baseRatio = harmonic + (bell - harmonic) * inharmonic;
      
      // Spread/warp: distort partial distribution
      // spread < 0 = compress (logarithmic), spread > 0 = expand (exponential)
      let ratio: number;
      if (Math.abs(spread) > 0.01) {
        const normalized = baseRatio / harmonicRatios[numModes - 1]; // 0..1
        if (spread > 0) {
          // Exponential expansion â€” push partials apart
          ratio = harmonicRatios[numModes - 1] * Math.pow(normalized, 1 - spread * 0.7);
        } else {
          // Logarithmic compression â€” pull partials together
          ratio = harmonicRatios[numModes - 1] * Math.pow(normalized, 1 + Math.abs(spread) * 2);
        }
        ratio = Math.max(ratio, 0.5); // Don't allow sub-fundamental
      } else {
        ratio = baseRatio;
      }
      
      const modeFreq = Math.min(freq * ratio, 18000); // Cap at Nyquist-ish
      
      const resonator = this.ctx.createBiquadFilter();
      resonator.type = 'bandpass';
      resonator.frequency.value = modeFreq;
      // Higher modes get less Q (decay faster) like real metal
      // brightnessMult dampens upper modes more aggressively (distance effect)
      const modeQScale = i === 0 ? 1 : brightnessMult;
      resonator.Q.value = modalQ * (1 - i * 0.1) * modeQScale;
      
      const modeGain = this.ctx.createGain();
      // Higher modes are quieter, shaped by body
      // brightnessMult reduces upper mode amplitudes (distance HF roll-off)
      const brightAtten = i === 0 ? 1 : Math.pow(brightnessMult, 0.5 + i * 0.3);
      let modeLevel = brightAtten / (numModes * Math.pow(i + 1, 0.3 + body * 0.5));
      
      // Cut/tilt: attenuate upper or lower partials
      // cut > 0: reduce LOW partials (accentuate highs), cut < 0: reduce HIGH partials
      if (Math.abs(cut) > 0.01) {
        const normalizedIdx = i / (numModes - 1); // 0..1
        if (cut > 0) {
          // Cut lows â€” attenuate early partials
          modeLevel *= Math.pow(normalizedIdx, cut * 1.5);
        } else {
          // Cut highs â€” attenuate later partials  
          modeLevel *= Math.pow(1 - normalizedIdx, Math.abs(cut) * 1.5);
        }
      }
      
      modeGain.gain.value = modeLevel;
      
      exciteSource.connect(resonator);
      resonator.connect(modeGain);
      modeGain.connect(outputGain);
      
      resonators.push(resonator);
      modeGains.push(modeGain);
    }
    
    exciteSource.start(time);
    exciteSource.stop(time + burstLength + 0.001);
    
    this.trackTransientNodes(decay + 0.5, exciteSource, outputGain, ...resonators, ...modeGains);
  }
  
  /**
   * Voice 6: Noise - Filtered noise with formant, breath, filter envelope
   * New params: formant, breath, filterEnv, filterEnvDecay, density, colorLFO
   */
  private triggerNoise(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    // Per-hit variation & distance (strike-position)
    const v = this.computeVariation(p.drumNoiseVariation ?? 0);
    const d = this.computeDistance(this.triggerDistanceOverride ?? (p.drumNoiseDistance ?? 0.5));
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.noise;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('noise', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'noise', morphValue) : {};
    
    // Use morphed values if available, then apply variation/distance
    // CL_ED brightness modifier for noise filter
    const noiseBright = this.clEd(1, d.t, DrumSynth.CL_ED.noise.bright);
    const filterFreqBase = (morphed.drumNoiseFilterFreq as number) ?? p.drumNoiseFilterFreq;
    const filterFreq = Math.max(20, Math.min(20000, filterFreqBase * v.vBright * d.dBright * noiseBright));
    const filterQBase = (morphed.drumNoiseFilterQ as number) ?? p.drumNoiseFilterQ;
    const filterQ = filterQBase * v.vBright;
    const filterType = (morphed.drumNoiseFilterType as BiquadFilterType) ?? p.drumNoiseFilterType;
    const decay = Math.min(((morphed.drumNoiseDecay as number) ?? p.drumNoiseDecay) / 1000 * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const level = (morphed.drumNoiseLevel as number) ?? p.drumNoiseLevel;
    const attack = ((morphed.drumNoiseAttack as number) ?? p.drumNoiseAttack) / 1000 * v.vAttack * d.dAttack;
    const formantRaw = (morphed.drumNoiseFormant as number) ?? p.drumNoiseFormant ?? 0;
    const formant = this.clEd(formantRaw, d.t, DrumSynth.CL_ED.noise.formant);
    const breath = (morphed.drumNoiseBreath as number) ?? p.drumNoiseBreath ?? 0;
    const filterEnv = (morphed.drumNoiseFilterEnv as number) ?? p.drumNoiseFilterEnv ?? 0;
    const filterEnvDecay = ((morphed.drumNoiseFilterEnvDecay as number) ?? p.drumNoiseFilterEnvDecay ?? 100) / 1000;
    const densityRaw = ((morphed.drumNoiseDensity as number) ?? p.drumNoiseDensity ?? 1) * d.dTransient;
    const density = this.clEd(densityRaw, d.t, DrumSynth.CL_ED.noise.density);
    const colorLFO = (morphed.drumNoiseColorLFO as number) ?? p.drumNoiseColorLFO ?? 0;
    const particleSize = ((morphed.drumNoiseParticleSize as number) ?? p.drumNoiseParticleSize ?? 5) / 1000;
    const particleRandom = (morphed.drumNoiseParticleRandom as number) ?? p.drumNoiseParticleRandom ?? 0;
    const particleRandomRate = (morphed.drumNoiseParticleRandomRate as number) ?? p.drumNoiseParticleRandomRate ?? 0.5;
    const ratchetCount = Math.round((morphed.drumNoiseRatchetCount as number) ?? p.drumNoiseRatchetCount ?? 0);
    const ratchetTime = ((morphed.drumNoiseRatchetTime as number) ?? p.drumNoiseRatchetTime ?? 30) / 1000;
    
    const outputLevel = Math.min(1, velocity * level * v.vLevel * d.dLevel);
    
    // Create noise source
    const source = this.ctx.createBufferSource();
    const mainFilter = this.ctx.createBiquadFilter();
    const outputGain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    source.loop = true; // Loop the noise buffer for long attack/decay times
    
    // Main filter with envelope
    mainFilter.type = filterType;
    mainFilter.Q.value = filterQ;
    
    // Filter envelope (will be re-scheduled at mainTime if ratcheting)
    let filterEnvAmount = filterEnv * filterFreq;
    let startFilterFreq = Math.max(20, Math.min(20000, filterFreq + filterEnvAmount));
    // Temporarily set; will be overridden after ratchet timing is resolved
    mainFilter.frequency.value = filterFreq;
    mainFilter.Q.value = filterQ;
    
    // Formant filter bank (vowel-like resonances)
    let formantFilters: BiquadFilterNode[] = [];
    let formantGain: GainNode | null = null;
    if (formant > 0.05) {
      formantGain = this.ctx.createGain();
      formantGain.gain.value = formant;
      
      // Simplified formant frequencies (like an "a" vowel), darkened by distance
      const formantFreqs = [700, 1200, 2500].map(f => Math.min(20000, f * d.dBright));
      formantFilters = formantFreqs.map((freq) => {
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq;
        f.Q.value = 5 + formant * 10;
        return f;
      });
    }
    
    // Breath texture (modulated amplitude)
    let breathLFO: OscillatorNode | null = null;
    let breathLFOGain: GainNode | null = null;
    if (breath > 0.05) {
      breathLFO = this.ctx.createOscillator();
      breathLFO.type = 'sine';
      breathLFO.frequency.value = 8 + Math.random() * 4;
      breathLFOGain = this.ctx.createGain();
      breathLFOGain.gain.value = breath * 0.3 * outputLevel;
      breathLFO.connect(breathLFOGain);
      breathLFOGain.connect(outputGain.gain);
    }
    
    // Color LFO (filter modulation)
    let colorLFONode: OscillatorNode | null = null;
    let colorLFOGain: GainNode | null = null;
    if (colorLFO > 0.01) {
      colorLFONode = this.ctx.createOscillator();
      colorLFONode.type = 'sine';
      colorLFONode.frequency.value = colorLFO;
      colorLFOGain = this.ctx.createGain();
      colorLFOGain.gain.value = filterFreq * 0.3; // filterFreq already dampened by distance
      colorLFONode.connect(colorLFOGain);
      colorLFOGain.connect(mainFilter.frequency);
    }
    
    // Ratchet envelope (clap-like repeated bursts before main envelope)
    const ratchetAllNodes: AudioNode[] = [];
    if (ratchetCount > 0) {
      for (let r = 0; r < ratchetCount; r++) {
        const rSrc = this.ctx.createBufferSource();
        rSrc.buffer = this.noiseBuffer;
        rSrc.loop = true;
        
        // Each ratchet gets own filter for isolation (uses already-dampened filterFreq)
        const rFilter = this.ctx.createBiquadFilter();
        rFilter.type = filterType;
        rFilter.frequency.value = filterFreq;
        rFilter.Q.value = filterQ;
        
        const rGain = this.ctx.createGain();
        const rTime = time + r * ratchetTime;
        const rLevel = outputLevel * Math.pow(0.65, ratchetCount - r); // crescendo into main hit
        const rDur = Math.min(ratchetTime * 0.8, 0.03); // short burst, leave gap
        
        rGain.gain.setValueAtTime(0, rTime);
        rGain.gain.linearRampToValueAtTime(rLevel, rTime + 0.001);
        rGain.gain.exponentialRampToValueAtTime(0.001, rTime + rDur);
        
        rSrc.connect(rFilter);
        rFilter.connect(rGain);
        rGain.connect(this.triggerTarget);
        rGain.connect(this.reverbSend);
        if (this.delaySends.noise) rGain.connect(this.delaySends.noise);
        
        rSrc.start(rTime);
        rSrc.stop(rTime + rDur + 0.002);
        ratchetAllNodes.push(rSrc, rFilter, rGain);
      }
    }
    
    // Offset main hit by ratchet duration
    const mainTime = ratchetCount > 0 ? time + ratchetCount * ratchetTime : time;
    const totalEndTime = mainTime + attack + decay;
    
    // Apply filter envelope at mainTime
    mainFilter.frequency.setValueAtTime(startFilterFreq, mainTime);
    mainFilter.frequency.exponentialRampToValueAtTime(
      Math.max(20, filterFreq), 
      mainTime + filterEnvDecay
    );
    
    // Amplitude envelope
    outputGain.gain.setValueAtTime(0, mainTime);
    outputGain.gain.linearRampToValueAtTime(Math.max(0.0001, outputLevel), mainTime + attack);
    outputGain.gain.exponentialRampToValueAtTime(0.001, totalEndTime);
    
    // Connect main chain
    source.connect(mainFilter);
    mainFilter.connect(outputGain);
    
    // Add formant layer
    if (formantFilters.length > 0 && formantGain) {
      const formantMix = this.ctx.createGain();
      formantMix.gain.value = 1 / formantFilters.length;
      
      formantFilters.forEach(f => {
        source.connect(f);
        f.connect(formantMix);
      });
      formantMix.connect(formantGain);
      formantGain.connect(outputGain);
    }
    
    outputGain.connect(this.triggerTarget);
    outputGain.connect(this.reverbSend);
    if (this.delaySends.noise) {
      outputGain.connect(this.delaySends.noise);
    }
    
    // Handle density â€” pulsar particle mode for sparse textures
    let sparseOsc: OscillatorNode | null = null;
    let sparseOscGain: GainNode | null = null;
    let sparseGain: GainNode | null = null;
    const particleGrains: AudioBufferSourceNode[] = [];
    const particleGainNodes: GainNode[] = [];
    if (density < 0.9) {
      if (density < 0.4) {
        // Pulsar particle mode: schedule individual noise grains
        // Low density = fewer particles, high particle size = longer grains
        const totalDuration = attack + decay;
        const baseGrainDur = Math.max(0.001, particleSize);
        const numGrains = Math.max(1, Math.round(density * 40 * totalDuration / baseGrainDur));
        
        // Disconnect the continuous source from outputGain (we'll use grains instead)
        mainFilter.disconnect();
        
        // Particle randomization: randomRate controls how often randomization resets
        // particleRandom controls the intensity of pitch/time jitter
        const randResetInterval = particleRandomRate > 0.01 ? (1.0 - particleRandomRate) * 0.5 + 0.01 : 999;
        let lastRandPitch = 1.0;
        let lastRandTime = 0;
        
        for (let g = 0; g < numGrains; g++) {
          // Apply particle randomization to grain duration
          let grainDuration = baseGrainDur;
          if (particleRandom > 0.01) {
            const grainProgress = g / numGrains;
            // Reset random values periodically based on randomRate
            if (grainProgress - lastRandTime >= randResetInterval || g === 0) {
              lastRandPitch = 1.0 + (Math.random() * 2 - 1) * particleRandom * 0.5;
              lastRandTime = grainProgress;
            }
            // Jitter grain duration
            grainDuration = baseGrainDur * (1 + (Math.random() * 2 - 1) * particleRandom * 0.3);
            grainDuration = Math.max(0.001, grainDuration);
          }
          
          // Create per-grain Hann-windowed noise buffer
          const grainBuffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * grainDuration), this.ctx.sampleRate);
          const grainData = grainBuffer.getChannelData(0);
          for (let i = 0; i < grainData.length; i++) {
            const t = i / grainData.length;
            const win = 0.5 * (1 - Math.cos(2 * Math.PI * t));
            grainData[i] = (Math.random() * 2 - 1) * win;
          }
          
          // Time scatter: base position + random jitter influenced by particleRandom
          const baseTime = mainTime + (g / numGrains) * totalDuration;
          const timeJitter = particleRandom > 0.01
            ? (Math.random() * 2 - 1) * particleRandom * grainDuration * 2
            : Math.random() * grainDuration;
          const grainTime = Math.max(mainTime, Math.min(baseTime + timeJitter, mainTime + totalDuration - grainDuration));
          
          const grain = this.ctx.createBufferSource();
          grain.buffer = grainBuffer;
          // Apply pitch randomization via playback rate
          if (particleRandom > 0.01) {
            grain.playbackRate.value = lastRandPitch;
          }
          
          const gGain = this.ctx.createGain();
          // Envelope follows main envelope at grain time
          const envPos = (grainTime - mainTime) / totalDuration;
          const envLevel = envPos < (attack / totalDuration)
            ? envPos / (attack / totalDuration) * outputLevel
            : outputLevel * Math.exp(-3 * (envPos - attack / totalDuration));
          gGain.gain.value = envLevel;
          
          grain.connect(mainFilter);
          mainFilter.connect(gGain);
          gGain.connect(this.triggerTarget);
          gGain.connect(this.reverbSend);
          if (this.delaySends.noise) {
            gGain.connect(this.delaySends.noise);
          }
          
          grain.start(grainTime);
          grain.stop(grainTime + grainDuration + 0.001);
          particleGrains.push(grain);
          particleGainNodes.push(gGain);
        }
      } else {
        // Medium density: square-wave gating (original behavior)
        sparseGain = this.ctx.createGain();
        sparseOsc = this.ctx.createOscillator();
        sparseOsc.type = 'square';
        sparseOsc.frequency.value = 20 + density * 80;
        sparseOscGain = this.ctx.createGain();
        sparseOscGain.gain.value = 0.5;
        sparseOsc.connect(sparseOscGain);
        sparseOscGain.connect(sparseGain.gain);
        sparseGain.gain.value = 0.5;
        
        // Insert into chain
        mainFilter.disconnect();
        mainFilter.connect(sparseGain);
        sparseGain.connect(outputGain);
        
        sparseOsc.start(mainTime);
        sparseOsc.stop(totalEndTime + 0.01);
      }
    }
    
    source.start(mainTime);
    source.stop(totalEndTime + 0.01);
    
    if (breathLFO) {
      breathLFO.start(mainTime);
      breathLFO.stop(totalEndTime + 0.01);
    }
    
    if (colorLFONode) {
      colorLFONode.start(mainTime);
      colorLFONode.stop(totalEndTime + 0.01);
    }

    // Track all transient nodes for cleanup on dispose
    this.trackTransientNodes(totalEndTime - time + 0.5, source, mainFilter, outputGain, formantGain, breathLFO, breathLFOGain, colorLFONode, colorLFOGain, sparseOsc, sparseOscGain, sparseGain, ...formantFilters, ...particleGrains, ...particleGainNodes, ...ratchetAllNodes);
  }

  /**
   * Voice 7: Membrane - physical modeled drum head with optional wire buzz
   */
  private triggerMembrane(velocity: number, time: number): void {
    const p = this.params;
    if (!this.noiseBuffer) return;

    const v = this.computeVariation(p.drumMembraneVariation ?? 0);
    const d = this.computeDistance(this.triggerDistanceOverride ?? (p.drumMembraneDistance ?? 0.5));

    const range = this.morphRanges.membrane;
    let morphValue: number | undefined;
    if (this.triggerMorphOverride !== null) {
      morphValue = this.triggerMorphOverride;
    } else if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('membrane', normalizedPos);
      }
    }

    const morphed = (morphValue !== undefined) ? getMorphedParams(p, 'membrane', morphValue) : {};

    const excType = (morphed.drumMembraneExciter as SliderState['drumMembraneExciter']) ?? p.drumMembraneExciter;
    const excPos = (morphed.drumMembraneExcPos as number) ?? p.drumMembraneExcPos;
    const excBright = ((morphed.drumMembraneExcBright as number) ?? p.drumMembraneExcBright) * v.vBright * d.dBright;
    const excDur = Math.max(0.0005, (((morphed.drumMembraneExcDur as number) ?? p.drumMembraneExcDur) / 1000));
    const sizeHz = Math.max(30, ((morphed.drumMembraneSize as number) ?? p.drumMembraneSize) * v.vPitch);
    const tensionRaw = Math.min(1, Math.max(0, (morphed.drumMembraneTension as number) ?? p.drumMembraneTension));
    const tension = Math.min(1, this.clEd(tensionRaw, d.t, DrumSynth.CL_ED.membrane.tension));
    const damping = Math.min(1, Math.max(0, (morphed.drumMembraneDamping as number) ?? p.drumMembraneDamping));
    const material = (morphed.drumMembraneMaterial as SliderState['drumMembraneMaterial']) ?? p.drumMembraneMaterial;
    const nonlin = Math.min(1, Math.max(0, (morphed.drumMembraneNonlin as number) ?? p.drumMembraneNonlin));
    const wireMixRaw = Math.max(0, Math.min(1, (morphed.drumMembraneWireMix as number) ?? p.drumMembraneWireMix));
    const wireMix = Math.max(0, this.clEd(wireMixRaw, d.t, DrumSynth.CL_ED.membrane.wireMix));
    const wireDens = Math.max(0, Math.min(1, (morphed.drumMembraneWireDensity as number) ?? p.drumMembraneWireDensity));
    const wireTone = Math.max(0, Math.min(1, (morphed.drumMembraneWireTone as number) ?? p.drumMembraneWireTone));
    const wireDecayRaw = Math.max(0, Math.min(1, (morphed.drumMembraneWireDecay as number) ?? p.drumMembraneWireDecay));
    const wireDecay = Math.min(1, this.clEd(wireDecayRaw, d.t, DrumSynth.CL_ED.membrane.wireDecay));
    const body = Math.max(0, Math.min(1, (morphed.drumMembraneBody as number) ?? p.drumMembraneBody));
    const ring = Math.max(0, Math.min(1, (morphed.drumMembraneRing as number) ?? p.drumMembraneRing));
    const overtones = Math.max(1, Math.min(8, Math.round((morphed.drumMembraneOvertones as number) ?? p.drumMembraneOvertones)));
    const pitchEnvSt = (morphed.drumMembranePitchEnv as number) ?? p.drumMembranePitchEnv;
    const pitchDecay = Math.max(0.005, (((morphed.drumMembranePitchDecay as number) ?? p.drumMembranePitchDecay) / 1000));
    const attack = (((morphed.drumMembraneAttack as number) ?? p.drumMembraneAttack) / 1000) * v.vAttack * d.dAttack;
    const decay = Math.min(12, (((morphed.drumMembraneDecay as number) ?? p.drumMembraneDecay) / 1000) * v.vDecay * d.dDecay, this.triggerRatchetDecayCap);
    const level = Math.min(1, ((morphed.drumMembraneLevel as number) ?? p.drumMembraneLevel) * velocity * v.vLevel * d.dLevel);

    const materialTable: Record<SliderState['drumMembraneMaterial'], { inharm: number; damp: number; bright: number }> = {
      skin: { inharm: 0, damp: 1.0, bright: 1.0 },
      metal: { inharm: 0.3, damp: 0.5, bright: 1.5 },
      wood: { inharm: 0.15, damp: 1.3, bright: 0.7 },
      glass: { inharm: 0.4, damp: 0.3, bright: 2.0 },
      plastic: { inharm: 0.1, damp: 0.8, bright: 1.2 },
    };
    const materialMod = materialTable[material];
    const envDur = attack + decay;

    // Master output (no global amp envelope or saturation — per-mode envelopes handle amplitude)
    const masterOut = this.ctx.createGain();
    masterOut.gain.value = 1.0;
    masterOut.connect(this.triggerTarget);
    masterOut.connect(this.reverbSend);
    if (this.delaySends.membrane) masterOut.connect(this.delaySends.membrane);

    // ── Exciter signal ──
    const excGain = this.ctx.createGain();
    excGain.gain.setValueAtTime(Math.max(0.0001, level * (0.5 + excBright * 0.5)), time);
    excGain.gain.exponentialRampToValueAtTime(0.001, time + excDur);

    const exciters: AudioNode[] = [excGain];

    if (excType === 'noise' || excType === 'brush') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = false;
      const ef = this.ctx.createBiquadFilter();
      ef.type = 'lowpass';
      ef.frequency.value = 2000 + excBright * 12000;
      if (excType === 'brush') { ef.frequency.value *= 0.6; ef.Q.value = 2; }
      src.connect(ef);
      ef.connect(excGain);
      src.start(time);
      src.stop(time + excDur + 0.01);
      exciters.push(src, ef);
    } else if (excType === 'mallet') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = sizeHz * 2;
      osc.connect(excGain);
      osc.start(time);
      osc.stop(time + excDur + 0.01);
      exciters.push(osc);
    } else if (excType === 'stick') {
      // Short bright click: triangle osc + noise click
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 3000 + excBright * 5000;
      osc.connect(excGain);
      osc.start(time);
      osc.stop(time + excDur + 0.01);
      exciters.push(osc);
      // Plus noise click
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(Math.max(0.0001, level * 0.3), time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + Math.min(excDur, 0.003));
      ns.connect(ng);
      ng.connect(excGain);
      ns.start(time);
      ns.stop(time + 0.005);
      exciters.push(ns, ng);
    } else {
      // impulse (default) — single-sample-ish click via very short noise
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hpf = this.ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 1000 + excBright * 8000;
      src.connect(hpf);
      hpf.connect(excGain);
      src.start(time);
      src.stop(time + excDur + 0.01);
      exciters.push(src, hpf);
    }

    // ── Membrane modes (bank of resonant bandpass filters simulating circular membrane) ──
    const modeRatios = [1.0, 1.59, 2.14, 2.30, 2.65, 2.92, 3.16, 3.50];
    const numModes = Math.min(overtones, modeRatios.length);
    const inharm = materialMod.inharm + nonlin * 0.2;
    const resonators: BiquadFilterNode[] = [];
    const modeGains: GainNode[] = [];

    for (let m = 0; m < numModes; m++) {
      const ratio = modeRatios[m] + inharm * (m * 0.08) * (Math.random() * 0.4 + 0.8);
      // Position affects which modes are excited (center excites odd modes more)
      const posAmp = m === 0 ? 1.0 : (1.0 - Math.abs(excPos - 0.5) * (m % 2 === 0 ? 1.5 : 0.3));
      const modeFreq = sizeHz * ratio * (0.5 + tension * 1.0);
      const modeQ = (5 + ring * 40 + (1 - damping) * 30) * materialMod.damp / (1 + m * 0.3);
      const modeLevel = level * Math.max(0.05, posAmp) * body / (1 + m * 0.4) * materialMod.bright;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(Math.min(18000, modeFreq * Math.pow(2, pitchEnvSt / 12)), time);
      bp.frequency.exponentialRampToValueAtTime(Math.max(20, modeFreq), time + pitchDecay);
      bp.Q.value = Math.max(1, modeQ);

      const mGain = this.ctx.createGain();
      if (attack > 0.0005) {
        mGain.gain.setValueAtTime(0, time);
        mGain.gain.linearRampToValueAtTime(Math.max(0.0001, modeLevel), time + attack);
        mGain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay / (1 + m * 0.15));
      } else {
        mGain.gain.setValueAtTime(Math.max(0.0001, modeLevel), time);
        mGain.gain.exponentialRampToValueAtTime(0.001, time + decay / (1 + m * 0.15));
      }

      excGain.connect(bp);
      bp.connect(mGain);
      mGain.connect(masterOut);
      resonators.push(bp);
      modeGains.push(mGain);
    }

    // ── Fundamental oscillator for body ──
    if (body > 0.1) {
      const bodyOsc = this.ctx.createOscillator();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(sizeHz * Math.pow(2, pitchEnvSt / 12), time);
      bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(20, sizeHz), time + pitchDecay);
      const bodyGain = this.ctx.createGain();
      if (attack > 0.0005) {
        bodyGain.gain.setValueAtTime(0, time);
        bodyGain.gain.linearRampToValueAtTime(Math.max(0.0001, level * body * 0.4), time + attack);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
      } else {
        bodyGain.gain.setValueAtTime(Math.max(0.0001, level * body * 0.4), time);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      }
      bodyOsc.connect(bodyGain);
      bodyGain.connect(masterOut);
      bodyOsc.start(time);
      bodyOsc.stop(time + envDur + 0.05);
      exciters.push(bodyOsc, bodyGain);
    }

    // ── Wire Buzz (snare wires / rattle simulation) ──
    const wireNodes: AudioNode[] = [];
    if (wireMix > 0.01) {
      const wireNoise = this.ctx.createBufferSource();
      wireNoise.buffer = this.noiseBuffer;
      wireNoise.loop = true;

      // High-pass + bandpass to shape wire spectrum
      const wireHP = this.ctx.createBiquadFilter();
      wireHP.type = 'highpass';
      wireHP.frequency.value = 1500 + wireTone * 4000;

      const wireBP = this.ctx.createBiquadFilter();
      wireBP.type = 'bandpass';
      wireBP.frequency.value = 3000 + wireTone * 6000;
      wireBP.Q.value = 1 + wireDens * 4;

      // Modulate wire amplitude to simulate sympathetic buzzing
      const wireAmpGain = this.ctx.createGain();
      const wireLevel = level * wireMix * 0.5;
      const wireDec = decay * (0.3 + wireDecay * 1.4);
      if (attack > 0.0005) {
        wireAmpGain.gain.setValueAtTime(0, time);
        wireAmpGain.gain.linearRampToValueAtTime(Math.max(0.0001, wireLevel), time + attack + 0.002);
        wireAmpGain.gain.exponentialRampToValueAtTime(0.001, time + attack + wireDec);
      } else {
        wireAmpGain.gain.setValueAtTime(Math.max(0.0001, wireLevel), time + 0.001);
        wireAmpGain.gain.exponentialRampToValueAtTime(0.001, time + wireDec);
      }

      // Density: add AM modulation to create rattle texture
      if (wireDens > 0.3) {
        const rattleLfo = this.ctx.createOscillator();
        rattleLfo.type = 'square';
        rattleLfo.frequency.value = 100 + wireDens * 400;
        const rattleDepth = this.ctx.createGain();
        rattleDepth.gain.value = wireLevel * wireDens * 0.3;
        rattleLfo.connect(rattleDepth);
        rattleDepth.connect(wireAmpGain.gain);
        rattleLfo.start(time);
        rattleLfo.stop(time + envDur + 0.05);
        wireNodes.push(rattleLfo, rattleDepth);
      }

      wireNoise.connect(wireHP);
      wireHP.connect(wireBP);
      wireBP.connect(wireAmpGain);
      wireAmpGain.connect(masterOut);
      wireNoise.start(time);
      wireNoise.stop(time + envDur + 0.05);
      wireNodes.push(wireNoise, wireHP, wireBP, wireAmpGain);
    }

    this.trackTransientNodes(envDur + 0.5, masterOut, excGain, ...exciters, ...resonators, ...modeGains, ...wireNodes);
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EUCLIDEAN SCHEDULER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  private startEuclidScheduler(): void {
    if (this.euclidScheduleTimer) return;
    
    // Reset step counters
    this.euclidCurrentStep = [0, 0, 0, 0];
    this.euclidGlobalStepCount = 0;
    this.euclidBarCount = 0;
    this.trigConditionCounters = [[], [], [], []];
    this.lastScheduleTime = this.ctx.currentTime;

    const startTime = this.ctx.currentTime;
    this.euclidSequencers = [0, 1, 2, 3].map((id) => {
      const sequencer = createSequencer(id, `drum-euclid-${id}`);
      sequencer.nextTime = startTime; // Start scheduling from now
      const evolveConfig = this.euclidEvolveConfigs[id] || defaultEvolveConfig();
      sequencer.evolve.enabled = evolveConfig.enabled;
      sequencer.evolve.everyBars = evolveConfig.everyBars;
      sequencer.evolve.intensity = evolveConfig.intensity;
      sequencer.evolve.methods = { ...evolveConfig.methods };
      sequencer.evolve.home = captureHomeSnapshot(sequencer);
      return sequencer;
    });
    
    const scheduleEuclid = () => {
      try {
      if (!this.params.drumEnabled || !this.params.drumEuclidMasterEnabled) {
        this.stopEuclidScheduler();
        return;
      }
      
      const now = this.ctx.currentTime;
      
      // Calculate base beat duration from BPM
      const baseBPM = this.params.drumEuclidBaseBPM ?? 120;
      const tempo = this.params.drumEuclidTempo;
      const beatDuration = 60 / (baseBPM * tempo);

      // Helper: convert per-sequencer clock division to seconds
      const clockDivToSec = (clockDiv: string): number => {
        switch (clockDiv) {
          case '1/4': return beatDuration;
          case '1/8': return beatDuration / 2;
          case '1/16': return beatDuration / 4;
          case '1/8T': return beatDuration / 3;
          default: return beatDuration / 2;
        }
      };

      // Global division (fallback for bar counting)
      const globalDivision = this.params.drumEuclidDivision;
      const globalStepDuration = (beatDuration * 4) / globalDivision;
      
      // Helper to build array of enabled voices for a lane
      // Supports both new boolean toggles and legacy single-target property
      const getEnabledVoices = (laneNum: 1 | 2 | 3 | 4): DrumVoiceType[] => {
        const voices: DrumVoiceType[] = [];
        const p = this.params as any; // Allow access to legacy properties
        
        // Check if new boolean properties exist, otherwise fall back to legacy Target
        const prefix = `drumEuclid${laneNum}Target`;
        const hasBooleanProps = p[`${prefix}Sub`] !== undefined;
        
        if (hasBooleanProps) {
          // New format: check each boolean toggle
          if (p[`${prefix}Sub`]) voices.push('sub');
          if (p[`${prefix}Kick`]) voices.push('kick');
          if (p[`${prefix}Click`]) voices.push('click');
          if (p[`${prefix}BeepHi`]) voices.push('beepHi');
          if (p[`${prefix}BeepLo`]) voices.push('beepLo');
          if (p[`${prefix}Noise`]) voices.push('noise');
          if (p[`${prefix}Membrane`]) voices.push('membrane');
        } else {
          // Legacy format: single target string
          const legacyTarget = p[`drumEuclid${laneNum}Target`] as DrumVoiceType | undefined;
          if (legacyTarget) voices.push(legacyTarget);
        }
        
        return voices;
      };

      // Get lane parameters with preset resolution
      const lanes = [
        { 
          enabled: this.params.drumEuclid1Enabled, 
          ...resolveDrumEuclidPatternParams(this.params.drumEuclid1Preset, this.params.drumEuclid1Steps, this.params.drumEuclid1Hits, this.params.drumEuclid1Rotation),
          voices: getEnabledVoices(1), prob: this.params.drumEuclid1Probability,
          velMin: this.params.drumEuclid1VelocityMin, velMax: this.params.drumEuclid1VelocityMax,
          level: this.params.drumEuclid1Level 
        },
        { 
          enabled: this.params.drumEuclid2Enabled, 
          ...resolveDrumEuclidPatternParams(this.params.drumEuclid2Preset, this.params.drumEuclid2Steps, this.params.drumEuclid2Hits, this.params.drumEuclid2Rotation),
          voices: getEnabledVoices(2), prob: this.params.drumEuclid2Probability,
          velMin: this.params.drumEuclid2VelocityMin, velMax: this.params.drumEuclid2VelocityMax,
          level: this.params.drumEuclid2Level 
        },
        { 
          enabled: this.params.drumEuclid3Enabled, 
          ...resolveDrumEuclidPatternParams(this.params.drumEuclid3Preset, this.params.drumEuclid3Steps, this.params.drumEuclid3Hits, this.params.drumEuclid3Rotation),
          voices: getEnabledVoices(3), prob: this.params.drumEuclid3Probability,
          velMin: this.params.drumEuclid3VelocityMin, velMax: this.params.drumEuclid3VelocityMax,
          level: this.params.drumEuclid3Level 
        },
        { 
          enabled: this.params.drumEuclid4Enabled, 
          ...resolveDrumEuclidPatternParams(this.params.drumEuclid4Preset, this.params.drumEuclid4Steps, this.params.drumEuclid4Hits, this.params.drumEuclid4Rotation),
          voices: getEnabledVoices(4), prob: this.params.drumEuclid4Probability,
          velMin: this.params.drumEuclid4VelocityMin, velMax: this.params.drumEuclid4VelocityMax,
          level: this.params.drumEuclid4Level 
        },
      ];
      
      // Schedule ahead ~100ms for timing accuracy
      const lookAhead = 0.1;
      const scheduleUntil = now + lookAhead;

      // Per-lane independent scheduling (supports polyrhythmic clock divisions)
      lanes.forEach((lane, laneIndex) => {
        if (!lane.enabled) return;
        if (lane.voices.length === 0) return;

        const sequencer = this.euclidSequencers[laneIndex];
        if (!sequencer) return;

        // Per-sequencer step duration from its own clock division
        const laneStepDuration = clockDivToSec(sequencer.clockDiv);
        const laneSwing = sequencer.swing;

        sequencer.trigger.steps = lane.steps;
        sequencer.trigger.hits = lane.hits;
        sequencer.trigger.rotation = lane.rotation;

        const laneMidVelocity = Math.max(0, Math.min(1, (lane.velMin + lane.velMax) * 0.5));
        if (sequencer.expression.velocities.length !== lane.steps) {
          sequencer.expression.velocities = new Array(lane.steps).fill(laneMidVelocity);
        }
        if (sequencer.trigger.probability.length !== lane.steps) {
          sequencer.trigger.probability = new Array(lane.steps).fill(1);
        }
        if (sequencer.trigger.ratchet.length !== lane.steps) {
          sequencer.trigger.ratchet = new Array(lane.steps).fill(1);
        }

        // Apply step override data from UI sub-lanes into sequencer model
        const ov = this.stepOverrides;
        if (ov.probability[laneIndex]) {
          sequencer.trigger.probability = ov.probability[laneIndex]!;
        }
        if (ov.ratchet[laneIndex]) {
          sequencer.trigger.ratchet = ov.ratchet[laneIndex]!;
        }
        if (ov.expression[laneIndex]) {
          const exprArr = ov.expression[laneIndex]!;
          sequencer.expression.velocities = exprArr;
          sequencer.expression.steps = exprArr.length;
          sequencer.expression.enabled = true;
        }
        if (ov.expressionDirection[laneIndex]) {
          sequencer.expression.direction = ov.expressionDirection[laneIndex]!;
        }
        if (ov.morph[laneIndex]) {
          sequencer.morph.values = ov.morph[laneIndex]!;
          sequencer.morph.steps = ov.morph[laneIndex]!.length;
          sequencer.morph.enabled = true;
        }
        if (ov.morphDirection[laneIndex]) {
          sequencer.morph.direction = ov.morphDirection[laneIndex]!;
        }
        if (ov.distance[laneIndex]) {
          sequencer.distance.values = ov.distance[laneIndex]!;
          sequencer.distance.steps = ov.distance[laneIndex]!.length;
          sequencer.distance.enabled = true;
        }
        if (ov.distanceDirection[laneIndex]) {
          sequencer.distance.direction = ov.distanceDirection[laneIndex]!;
        }
        if (ov.pitchDirection[laneIndex]) {
          sequencer.pitch.direction = ov.pitchDirection[laneIndex]!;
        }

        const sourceFlags: Record<DrumVoiceType, boolean> = {
          sub: false, kick: false, click: false,
          beepHi: false, beepLo: false, noise: false, membrane: false,
        };
        lane.voices.forEach((voice) => { sourceFlags[voice] = true; });
        sequencer.sources = sourceFlags;

        const basePattern = this.getCachedEuclideanPattern(lane.steps, lane.hits, lane.rotation);
        const toggles = this.stepOverrides.triggerToggles[laneIndex];
        const pattern = (toggles && toggles.size > 0)
          ? basePattern.map((v, i) => toggles.has(i) ? !v : v)
          : basePattern;
        sequencer.trigger.pattern = pattern;

        // Advance this lane independently based on its own nextTime
        while (sequencer.nextTime < scheduleUntil) {
          const laneStep = sequencer.stepIndex % lane.steps;

          // Apply per-sequencer swing (delay offbeat steps)
          const swingOff = (sequencer.stepIndex % 2 === 1) ? laneStepDuration * laneSwing * 0.5 : 0;
          const scheduleTime = sequencer.nextTime + swingOff;

          // Evolve at bar boundaries
          sequencer.totalStepCount++;
          if (sequencer.stepIndex === 0 && sequencer.totalStepCount > 1) {
            const bar = Math.floor(sequencer.totalStepCount / lane.steps);
            const evolved = evolveSequencer(sequencer, bar);
            if (evolved !== sequencer) {
              Object.assign(sequencer, evolved);
              this.onEuclidEvolveTrigger?.(laneIndex);
            }
          }

          // Check trigger pattern at the current trigger step
          if (pattern[laneStep]) {
            // Trig condition gate (Elektron-style n:N)
            const tcArr = ov.trigCondition?.[laneIndex] ?? null;
            const tc: [number, number] = (tcArr && tcArr[laneStep]) ? tcArr[laneStep] : [1, 1];
            // Ensure counter array is initialized for this lane
            if (this.trigConditionCounters[laneIndex].length < lane.steps) {
              this.trigConditionCounters[laneIndex] = new Array(lane.steps).fill(0);
            }
            // Increment visit counter for this step
            this.trigConditionCounters[laneIndex][laneStep] += 1;
            const visitCount = this.trigConditionCounters[laneIndex][laneStep];
            // Gate: fire only when ((visitCount - 1) % N) + 1 === n
            const trigCondPassed = tc[1] <= 1 || (((visitCount - 1) % tc[1]) + 1 === tc[0]);

            const stepProbability = Math.max(0, Math.min(1, sequencer.trigger.probability[laneStep] ?? 1));
            if (trigCondPassed && this.rng() <= lane.prob * stepProbability) {
              // Velocity: use expression sub-lane when enabled, otherwise constant 1.0
              // (matches prototype — no random velocity jitter when expression is off)
              const exprIndex = seqLaneIndex(sequencer.expression, sequencer.hitCount);
              const velocity = (sequencer.expression.enabled
                ? Math.max(0, Math.min(1, sequencer.expression.velocities[exprIndex] ?? 1.0))
                : 1.0) * lane.level;
              const selectedVoice = seqPickVoice(sequencer) ?? lane.voices[Math.floor(this.rng() * lane.voices.length)];

              // Compute per-trigger morph override from sub-lane data
              if (ov.morph[laneIndex] && sequencer.morph.values.length > 0) {
                const morphIndex = seqLaneIndex(sequencer.morph, sequencer.hitCount);
                this.triggerMorphOverride = sequencer.morph.values[morphIndex % sequencer.morph.values.length] ?? null;
              } else {
                this.triggerMorphOverride = null;
              }

              // Compute per-trigger distance override from sub-lane data
              if (ov.distance[laneIndex] && sequencer.distance.values.length > 0) {
                const distIndex = seqLaneIndex(sequencer.distance, sequencer.hitCount);
                this.triggerDistanceOverride = sequencer.distance.values[distIndex % sequencer.distance.values.length] ?? null;
              } else {
                this.triggerDistanceOverride = null;
              }

              const ratchet = Math.max(1, Math.round(sequencer.trigger.ratchet[laneStep] ?? 1));
              const ratchetStepOffset = Math.min(laneStepDuration * 0.45, laneStepDuration / ratchet);
              // Cap voice decay to fit within the ratchet window (90% for clean separation)
              this.triggerRatchetDecayCap = ratchet > 1 ? ratchetStepOffset * 0.9 : Infinity;
              for (let r = 0; r < ratchet; r++) {
                const rv = velocity * (r === 0 ? 1.0 : Math.pow(0.7, r));
                this.triggerVoice(selectedVoice, rv, scheduleTime + (r * ratchetStepOffset));
              }
              this.triggerRatchetDecayCap = Infinity;

              this.triggerMorphOverride = null;
              this.triggerDistanceOverride = null;
              sequencer.hitCount += 1;
            }
          }

          // Advance trigger step
          sequencer.stepIndex = (sequencer.stepIndex + 1) % lane.steps;
          this.euclidCurrentStep[laneIndex] = sequencer.stepIndex;
          sequencer.nextTime += laneStepDuration;
        }
      });

      // Global bar counter (use shortest lane step duration as reference)
      this.euclidGlobalStepCount += 1;
      // Keep lastScheduleTime advancing for compatibility
      this.lastScheduleTime = now;

      // Notify UI of step positions + hit counts (for sub-lane playheads)
      const hitCounts = this.euclidSequencers.map(s => s.hitCount);
      this.onStepPositionChange?.([...this.euclidCurrentStep], hitCounts);
      
      // Schedule next iteration
      this.euclidScheduleTimer = window.setTimeout(scheduleEuclid, 50);
      } catch (err) {
        console.error('[DrumSynth] Scheduler error:', err);
        // Recover by rescheduling
        this.euclidScheduleTimer = window.setTimeout(scheduleEuclid, 100);
      }
    };
    
    scheduleEuclid();
  }
  
  private stopEuclidScheduler(): void {
    if (this.euclidScheduleTimer) {
      clearTimeout(this.euclidScheduleTimer);
      this.euclidScheduleTimer = null;
    }
    this.euclidSequencers = [];
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CLEANUP
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  dispose(): void {
    this.stop();
    this.morphManager.reset();
    if (this.morphAnimationFrame) {
      cancelAnimationFrame(this.morphAnimationFrame);
      this.morphAnimationFrame = null;
    }

    // Stop transient node cleanup timer
    if (this.transientCleanupTimer !== null) {
      clearInterval(this.transientCleanupTimer);
      this.transientCleanupTimer = null;
    }

    // Force-disconnect all per-trigger transient nodes (oscillators, gains, filters, etc.)
    this.forceDisconnectAllTransientNodes();

    // Clear voice pools
    const voiceTypes: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];
    for (const v of voiceTypes) {
      for (const entry of this.voicePools[v]) {
        try { entry.outGain.disconnect(); } catch { /* ok */ }
      }
      this.voicePools[v] = [];
    }

    this.euclidPatternCache.clear();
    this.waveshaperCurveCache.clear();

    for (const voice of voiceTypes) {
      const sendNode = this.delaySends[voice];
      if (sendNode) {
        try {
          sendNode.disconnect();
        } catch {
          // ignore disconnect errors during dispose
        }
        this.delaySends[voice] = null;
      }
    }

    try { this.delayLeftNode?.disconnect(); } catch {}
    try { this.delayRightNode?.disconnect(); } catch {}
    try { this.delayFeedbackL?.disconnect(); } catch {}
    try { this.delayFeedbackR?.disconnect(); } catch {}
    try { this.delayFilterL?.disconnect(); } catch {}
    try { this.delayFilterR?.disconnect(); } catch {}
    try { this.delayMerger?.disconnect(); } catch {}
    try { this.delayWetGain?.disconnect(); } catch {}

    this.delayLeftNode = null;
    this.delayRightNode = null;
    this.delayFeedbackL = null;
    this.delayFeedbackR = null;
    this.delayFilterL = null;
    this.delayFilterR = null;
    this.delayMerger = null;
    this.delayWetGain = null;
    this.noiseBuffer = null;
    this.onDrumTrigger = null;
    this.onMorphTrigger = null;

    this.masterGain.disconnect();
    this.reverbSend.disconnect();
  }
}
