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
 * 6 voice types:
 * 1. Sub - Low sine/triangle pulse with drive & sub-octave
 * 2. Kick - Sine with pitch envelope, body, punch, tail
 * 3. Click - Multi-mode: impulse/noise/tonal/granular
 * 4. Beep Hi - Inharmonic partials with shimmer LFO
 * 5. Beep Lo - Pitched blip with Karplus-Strong pluck option
 * 6. Noise - Filtered noise with formant, breath, filter envelope
 */

import type { SliderState } from '../ui/state';
import { getMorphedParams, DrumMorphManager } from './drumMorph';

export type DrumVoiceType = 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise';

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
  
  // Random scheduling
  private randomScheduleTimer: number | null = null;
  private lastRandomTimes: Record<DrumVoiceType, number> = {
    sub: 0, kick: 0, click: 0, beepHi: 0, beepLo: 0, noise: 0
  };
  
  // RNG for deterministic randomness
  private rng: () => number;
  
  // Morph system
  private morphManager: DrumMorphManager;
  private morphAnimationFrame: number | null = null;
  
  // Morph ranges for per-trigger randomization (like delay/expression)
  private morphRanges: Record<DrumVoiceType, { min: number; max: number } | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null
  };
  
  // Callback for UI visualization
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  
  // Callback for morph trigger visualization (per-trigger random position)
  private onMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;

  // Stereo ping-pong delay
  private delayLeftNode: DelayNode | null = null;
  private delayRightNode: DelayNode | null = null;
  private delayFeedbackL: GainNode | null = null;
  private delayFeedbackR: GainNode | null = null;
  private delayFilterL: BiquadFilterNode | null = null;
  private delayFilterR: BiquadFilterNode | null = null;
  private delayWetGain: GainNode | null = null;
  
  // Per-voice delay sends
  private delaySends: Record<DrumVoiceType, GainNode | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null
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
    const voiceTypes: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
    for (const voice of voiceTypes) {
      this.delaySends[voice] = this.ctx.createGain();
      const sendKey = `drum${voice.charAt(0).toUpperCase() + voice.slice(1)}DelaySend` as keyof SliderState;
      this.delaySends[voice]!.gain.value = (p[sendKey] as number) ?? 0;
    }
    
    // Create stereo merger for output
    const merger = this.ctx.createChannelMerger(2);
    
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
    this.delayFilterL.connect(merger, 0, 0);
    // Right delay output goes to right channel
    this.delayFilterR.connect(merger, 0, 1);
    
    // Merger -> wet gain -> master output
    merger.connect(this.delayWetGain);
    this.delayWetGain.connect(masterOutput);
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
    
    // Start/stop schedulers based on enabled state
    if (params.drumEnabled) {
      if (params.drumRandomEnabled && !this.randomScheduleTimer) {
        this.startRandomScheduler();
      } else if (!params.drumRandomEnabled && this.randomScheduleTimer) {
        this.stopRandomScheduler();
      }
      
      if (params.drumEuclidMasterEnabled && !this.euclidScheduleTimer) {
        this.startEuclidScheduler();
      } else if (!params.drumEuclidMasterEnabled && this.euclidScheduleTimer) {
        this.stopEuclidScheduler();
      }
    } else {
      this.stopRandomScheduler();
      this.stopEuclidScheduler();
    }
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
    const voiceTypes: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise'];
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
    
    if (this.params.drumRandomEnabled) {
      this.startRandomScheduler();
    }
    if (this.params.drumEuclidMasterEnabled) {
      this.startEuclidScheduler();
    }
  }
  
  stop(): void {
    this.stopRandomScheduler();
    this.stopEuclidScheduler();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE TRIGGER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  triggerVoice(voice: DrumVoiceType, velocity: number = 0.8, time?: number): void {
    const t = time ?? this.ctx.currentTime;
    
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
    if (range) {
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
    const morphed = range ? getMorphedParams(p, 'sub', morphValue) : {};
    
    // Use morphed values if available, otherwise fall back to direct params
    const freq = (morphed.drumSubFreq as number) ?? p.drumSubFreq;
    const decay = (morphed.drumSubDecay as number) ?? p.drumSubDecay;
    const level = (morphed.drumSubLevel as number) ?? p.drumSubLevel;
    const tone = (morphed.drumSubTone as number) ?? p.drumSubTone;
    const shape = (morphed.drumSubShape as number) ?? p.drumSubShape ?? 0;
    const pitchEnv = (morphed.drumSubPitchEnv as number) ?? p.drumSubPitchEnv ?? 0;
    const pitchDecayTime = (morphed.drumSubPitchDecay as number) ?? p.drumSubPitchDecay ?? 50;
    const drive = (morphed.drumSubDrive as number) ?? p.drumSubDrive ?? 0;
    const subOctave = (morphed.drumSubSub as number) ?? p.drumSubSub ?? 0;
    
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
    
    // Pitch envelope
    const startFreq = freq * Math.pow(2, pitchEnv / 12);
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + pitchDecayTime / 1000);
    
    // Add subtle harmonics based on tone parameter
    let osc2: OscillatorNode | null = null;
    let gain2: GainNode | null = null;
    if (tone > 0.05) {
      osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2; // Octave up
      gain2 = this.ctx.createGain();
      gain2.gain.value = tone * 0.3 * velocity * level;
    }
    
    // Sub-octave oscillator for extra weight
    let subOsc: OscillatorNode | null = null;
    let subGain: GainNode | null = null;
    if (subOctave > 0.05) {
      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = freq / 2; // Octave down
      subGain = this.ctx.createGain();
      subGain.gain.value = subOctave * 0.5 * velocity * level;
    }
    
    // Waveshaper for drive/saturation
    let waveshaper: WaveShaperNode | null = null;
    if (drive > 0.05) {
      waveshaper = this.ctx.createWaveShaper();
      const samples = 256;
      const curve = new Float32Array(samples);
      const driveAmount = drive * 10;
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * driveAmount) / Math.tanh(driveAmount);
      }
      waveshaper.curve = curve;
      waveshaper.oversample = '2x';
    }
    
    // Envelope: instant attack, exponential decay
    const outputLevel = velocity * level;
    const decayTime = decay / 1000;
    
    gain.gain.setValueAtTime(outputLevel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    
    // Connect chain
    if (waveshaper) {
      osc.connect(waveshaper);
      waveshaper.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    // Connect to delay send
    if (this.delaySends.sub) {
      gain.connect(this.delaySends.sub);
    }
    
    osc.start(time);
    osc.stop(time + decayTime + 0.01);
    
    if (osc2 && gain2) {
      gain2.gain.setValueAtTime(gain2.gain.value, time);
      gain2.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.7);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      // Also send harmonics to delay
      if (this.delaySends.sub) {
        gain2.connect(this.delaySends.sub);
      }
      osc2.start(time);
      osc2.stop(time + decayTime + 0.01);
    }
    
    if (subOsc && subGain) {
      subGain.gain.setValueAtTime(subGain.gain.value, time);
      subGain.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 1.2);
      subOsc.connect(subGain);
      subGain.connect(this.masterGain);
      // Also send sub-octave to delay
      if (this.delaySends.sub) {
        subGain.connect(this.delaySends.sub);
      }
      subOsc.start(time);
      subOsc.stop(time + decayTime + 0.02);
    }
  }
  
  /**
   * Voice 2: Kick - Sine with pitch envelope, body, punch, tail
   * New params: body, punch, tail, tone
   */
  private triggerKick(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.kick;
    let morphValue: number | undefined;
    if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('kick', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = range ? getMorphedParams(p, 'kick', morphValue) : {};
    
    // Use morphed values if available
    const freq = (morphed.drumKickFreq as number) ?? p.drumKickFreq;
    const pitchEnv = (morphed.drumKickPitchEnv as number) ?? p.drumKickPitchEnv;
    const pitchDecay = ((morphed.drumKickPitchDecay as number) ?? p.drumKickPitchDecay) / 1000;
    const decay = ((morphed.drumKickDecay as number) ?? p.drumKickDecay) / 1000;
    const level = (morphed.drumKickLevel as number) ?? p.drumKickLevel;
    const click = (morphed.drumKickClick as number) ?? p.drumKickClick;
    const body = (morphed.drumKickBody as number) ?? p.drumKickBody ?? 0.5;
    const punch = (morphed.drumKickPunch as number) ?? p.drumKickPunch ?? 0.5;
    const tail = (morphed.drumKickTail as number) ?? p.drumKickTail ?? 0;
    const tone = (morphed.drumKickTone as number) ?? p.drumKickTone ?? 0;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    
    // Pitch envelope: start high, sweep down to base frequency
    // Punch affects how dramatic the pitch drop is
    const punchMultiplier = 0.5 + punch * 1.5;
    const startFreq = freq * Math.pow(2, (pitchEnv * punchMultiplier) / 12);
    
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + pitchDecay);
    
    // Click transient (high-frequency burst for attack)
    let clickOsc: OscillatorNode | null = null;
    let clickGain: GainNode | null = null;
    if (click > 0.05) {
      clickOsc = this.ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.value = 3000 + punch * 2000;
      clickGain = this.ctx.createGain();
      const clickLevel = click * velocity * level * 0.5;
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
      bodyOsc.frequency.value = freq * 1.5;
      bodyFilter = this.ctx.createBiquadFilter();
      bodyFilter.type = 'lowpass';
      bodyFilter.frequency.value = freq * 4;
      bodyGain = this.ctx.createGain();
      const bodyLevel = body * velocity * level * 0.4;
      bodyGain.gain.setValueAtTime(bodyLevel, time);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.6);
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
      tailFilter.frequency.value = freq * 2;
      tailFilter.Q.value = 2;
      tailGain = this.ctx.createGain();
      const tailLevel = tail * velocity * level * 0.2;
      tailGain.gain.setValueAtTime(0, time);
      tailGain.gain.linearRampToValueAtTime(tailLevel, time + decay * 0.1);
      tailGain.gain.exponentialRampToValueAtTime(0.001, time + decay * 1.5);
    }
    
    // Tone adds harmonic distortion
    let waveshaper: WaveShaperNode | null = null;
    if (tone > 0.05) {
      waveshaper = this.ctx.createWaveShaper();
      const samples = 256;
      const curve = new Float32Array(samples);
      const driveAmount = tone * 5;
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * driveAmount) / Math.tanh(driveAmount);
      }
      waveshaper.curve = curve;
    }
    
    // Amplitude envelope
    const outputLevel = velocity * level;
    
    gain.gain.setValueAtTime(outputLevel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    // Connect main chain
    if (waveshaper) {
      osc.connect(waveshaper);
      waveshaper.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    // Connect to delay send
    if (this.delaySends.kick) {
      gain.connect(this.delaySends.kick);
    }
    
    osc.start(time);
    osc.stop(time + decay + 0.01);
    
    if (clickOsc && clickGain) {
      clickOsc.connect(clickGain);
      clickGain.connect(this.masterGain);
      if (this.delaySends.kick) {
        clickGain.connect(this.delaySends.kick);
      }
      clickOsc.start(time);
      clickOsc.stop(time + 0.01);
    }
    
    if (bodyOsc && bodyFilter && bodyGain) {
      bodyOsc.connect(bodyFilter);
      bodyFilter.connect(bodyGain);
      bodyGain.connect(this.masterGain);
      if (this.delaySends.kick) {
        bodyGain.connect(this.delaySends.kick);
      }
      bodyOsc.start(time);
      bodyOsc.stop(time + decay + 0.01);
    }
    
    if (tailSource && tailFilter && tailGain) {
      tailSource.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(this.masterGain);
      tailGain.connect(this.reverbSend);
      if (this.delaySends.kick) {
        tailGain.connect(this.delaySends.kick);
      }
      tailSource.start(time);
      tailSource.stop(time + decay * 1.5 + 0.01);
    }
  }
  
  /**
   * Voice 3: Click - Multi-mode: impulse/noise/tonal/granular
   * New params: pitch, pitchEnv, mode, grainCount, grainSpread, stereoWidth
   */
  private triggerClick(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.click;
    let morphValue: number | undefined;
    if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('click', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = range ? getMorphedParams(p, 'click', morphValue) : {};
    
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
    
    const outputLevel = velocity * level;
    
    // Different synthesis modes
    switch (mode) {
      case 'impulse':
        this.triggerClickImpulse(time, outputLevel, decay, filterFreq, resonance, tone);
        break;
      case 'noise':
        this.triggerClickNoise(time, outputLevel, decay, filterFreq, resonance, tone);
        break;
      case 'tonal':
        this.triggerClickTonal(time, outputLevel, decay, pitch, pitchEnv, filterFreq);
        break;
      case 'granular':
        this.triggerClickGranular(time, outputLevel, decay, grainCount, grainSpread, filterFreq, stereoWidth);
        break;
      default:
        this.triggerClickImpulse(time, outputLevel, decay, filterFreq, resonance, tone);
    }
  }
  
  /** Click mode: Impulse - very short sharp transient */
  private triggerClickImpulse(
    time: number, level: number, decay: number, 
    filterFreq: number, resonance: number, tone: number
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
    
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + actualDecay);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    source.start(time);
    source.stop(time + actualDecay + 0.01);
  }
  
  /** Click mode: Noise - longer filtered noise burst */
  private triggerClickNoise(
    time: number, level: number, decay: number,
    filterFreq: number, resonance: number, tone: number
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
    
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + actualDecay);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    source.start(time);
    source.stop(time + actualDecay + 0.01);
  }
  
  /** Click mode: Tonal - pitched sine click with pitch envelope */
  private triggerClickTonal(
    time: number, level: number, decay: number,
    pitch: number, pitchEnv: number, filterFreq: number
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
    
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    if (this.delaySends.click) {
      gain.connect(this.delaySends.click);
    }
    
    osc.start(time);
    osc.stop(time + decay + 0.01);
  }
  
  /** Click mode: Granular - multiple micro-hits spread in time */
  private triggerClickGranular(
    time: number, level: number, decay: number,
    grainCount: number, grainSpread: number, filterFreq: number, stereoWidth: number
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
      
      gain.gain.setValueAtTime(grainLevel, grainTime);
      gain.gain.exponentialRampToValueAtTime(0.001, grainTime + grainDecay);
      
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
      panner.connect(this.reverbSend);
      if (this.delaySends.click) {
        panner.connect(this.delaySends.click);
      }
      
      source.start(grainTime);
      source.stop(grainTime + grainDecay + 0.01);
    }
  }
  
  /**
   * Voice 4: Beep Hi - Inharmonic partials with shimmer LFO
   * New params: inharmonic, partials, shimmer, shimmerRate, brightness
   */
  private triggerBeepHi(velocity: number, time: number): void {
    const p = this.params;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.beepHi;
    let morphValue: number | undefined;
    if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('beepHi', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = range ? getMorphedParams(p, 'beepHi', morphValue) : {};
    
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
    
    const outputLevel = velocity * level;
    const numPartials = Math.max(1, Math.round(partials));
    
    // Create oscillators for each partial
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    
    // Main output gain
    const mainGain = this.ctx.createGain();
    mainGain.connect(this.masterGain);
    mainGain.connect(this.reverbSend);
    if (this.delaySends.beepHi) {
      mainGain.connect(this.delaySends.beepHi);
    }
    
    // Brightness filter
    const brightnessFilter = this.ctx.createBiquadFilter();
    brightnessFilter.type = 'lowpass';
    brightnessFilter.frequency.value = freq * (1 + brightness * 4);
    brightnessFilter.connect(mainGain);
    
    // LFO for shimmer
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (shimmer > 0.01) {
      lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = shimmerRate;
      lfoGain = this.ctx.createGain();
      lfoGain.gain.value = shimmer * 0.3 * outputLevel;
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
      const partialFreq = freq * (harmonicRatio + inharmonicOffset * inharmonic);
      
      osc.frequency.value = partialFreq;
      
      // Level falls off for higher partials
      const partialLevel = outputLevel / numPartials / Math.pow(harmonicRatio, 0.5);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(partialLevel, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
      
      osc.connect(gain);
      gain.connect(brightnessFilter);
      
      oscillators.push(osc);
      gains.push(gain);
    }
    
    // FM modulation for metallic character (from original tone param)
    let modOsc: OscillatorNode | null = null;
    let modGain: GainNode | null = null;
    if (tone > 0.1) {
      modOsc = this.ctx.createOscillator();
      modOsc.type = 'sine';
      modOsc.frequency.value = freq * 2.01;
      modGain = this.ctx.createGain();
      modGain.gain.value = tone * freq * 0.3;
      modOsc.connect(modGain);
      // Modulate the first oscillator's frequency
      if (oscillators.length > 0) {
        modGain.connect(oscillators[0].frequency);
      }
    }
    
    // Start all oscillators
    oscillators.forEach(osc => {
      osc.start(time);
      osc.stop(time + attack + decay + 0.01);
    });
    
    if (lfo) {
      lfo.start(time);
      lfo.stop(time + attack + decay + 0.01);
    }
    
    if (modOsc) {
      modOsc.start(time);
      modOsc.stop(time + attack + decay + 0.01);
    }
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
    if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('beepLo', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = range ? getMorphedParams(p, 'beepLo', morphValue) : {};
    
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
    
    const outputLevel = velocity * level;
    
    // If pluck is high, use Karplus-Strong synthesis
    if (pluck > 0.3) {
      this.triggerBeepLoPluck(time, outputLevel, freq, decay, pluck, pluckDamp, body);
      return;
    }
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Blend between sine and square based on tone
    osc.type = tone > 0.5 ? 'square' : 'sine';
    
    // Pitch envelope
    const startFreq = freq * Math.pow(2, pitchEnv / 12);
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + pitchDecayTime);
    
    // If using square, filter to soften harmonics
    let filter: BiquadFilterNode | null = null;
    if (tone > 0.5) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq * 4;
      filter.Q.value = 0.7;
    }
    
    // Body resonance filter
    let bodyFilter: BiquadFilterNode | null = null;
    if (body > 0.1) {
      bodyFilter = this.ctx.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.value = freq * 1.5;
      bodyFilter.Q.value = 2 + body * 5;
      bodyFilter.gain.value = body * 6;
    }
    
    // Attack/decay envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(outputLevel, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    
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
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      gain.connect(this.delaySends.beepLo);
    }
    
    osc.start(time);
    osc.stop(time + attack + decay + 0.01);
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
    outputGain.connect(this.masterGain);
    outputGain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      outputGain.connect(this.delaySends.beepLo);
    }
    
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    oscGain.connect(this.reverbSend);
    if (this.delaySends.beepLo) {
      oscGain.connect(this.delaySends.beepLo);
    }
    
    source.start(time);
    source.stop(time + exciteTime + 0.01);
    osc.start(time);
    osc.stop(time + decay + 0.01);
  }
  
  /**
   * Voice 6: Noise - Filtered noise with formant, breath, filter envelope
   * New params: formant, breath, filterEnv, filterEnvDecay, density, colorLFO
   */
  private triggerNoise(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    // Get random morph value within range if range is set (per-trigger randomization)
    const range = this.morphRanges.noise;
    let morphValue: number | undefined;
    if (range) {
      morphValue = range.min + Math.random() * (range.max - range.min);
      if (this.onMorphTrigger) {
        const normalizedPos = range.max > range.min
          ? (morphValue - range.min) / (range.max - range.min)
          : 0.5;
        this.onMorphTrigger('noise', normalizedPos);
      }
    }
    
    // Only use morphed params when per-trigger randomization is active
    const morphed = range ? getMorphedParams(p, 'noise', morphValue) : {};
    
    // Use morphed values if available
    const filterFreq = (morphed.drumNoiseFilterFreq as number) ?? p.drumNoiseFilterFreq;
    const filterQ = (morphed.drumNoiseFilterQ as number) ?? p.drumNoiseFilterQ;
    const filterType = (morphed.drumNoiseFilterType as BiquadFilterType) ?? p.drumNoiseFilterType;
    const decay = ((morphed.drumNoiseDecay as number) ?? p.drumNoiseDecay) / 1000;
    const level = (morphed.drumNoiseLevel as number) ?? p.drumNoiseLevel;
    const attack = ((morphed.drumNoiseAttack as number) ?? p.drumNoiseAttack) / 1000;
    const formant = (morphed.drumNoiseFormant as number) ?? p.drumNoiseFormant ?? 0;
    const breath = (morphed.drumNoiseBreath as number) ?? p.drumNoiseBreath ?? 0;
    const filterEnv = (morphed.drumNoiseFilterEnv as number) ?? p.drumNoiseFilterEnv ?? 0;
    const filterEnvDecay = ((morphed.drumNoiseFilterEnvDecay as number) ?? p.drumNoiseFilterEnvDecay ?? 100) / 1000;
    const density = (morphed.drumNoiseDensity as number) ?? p.drumNoiseDensity ?? 1;
    const colorLFO = (morphed.drumNoiseColorLFO as number) ?? p.drumNoiseColorLFO ?? 0;
    
    const outputLevel = velocity * level;
    
    // Create noise source
    const source = this.ctx.createBufferSource();
    const mainFilter = this.ctx.createBiquadFilter();
    const outputGain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    
    // Main filter with envelope
    mainFilter.type = filterType;
    mainFilter.Q.value = filterQ;
    
    // Filter envelope
    const filterEnvAmount = filterEnv * filterFreq;
    const startFilterFreq = Math.max(20, Math.min(20000, filterFreq + filterEnvAmount));
    mainFilter.frequency.setValueAtTime(startFilterFreq, time);
    mainFilter.frequency.exponentialRampToValueAtTime(
      Math.max(20, filterFreq), 
      time + filterEnvDecay
    );
    
    // Formant filter bank (vowel-like resonances)
    let formantFilters: BiquadFilterNode[] = [];
    let formantGain: GainNode | null = null;
    if (formant > 0.05) {
      formantGain = this.ctx.createGain();
      formantGain.gain.value = formant;
      
      // Simplified formant frequencies (like an "a" vowel)
      const formantFreqs = [700, 1200, 2500];
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
      colorLFOGain.gain.value = filterFreq * 0.3;
      colorLFONode.connect(colorLFOGain);
      colorLFOGain.connect(mainFilter.frequency);
    }
    
    // Amplitude envelope
    outputGain.gain.setValueAtTime(0, time);
    outputGain.gain.linearRampToValueAtTime(outputLevel, time + attack);
    outputGain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    
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
    
    outputGain.connect(this.masterGain);
    outputGain.connect(this.reverbSend);
    if (this.delaySends.noise) {
      outputGain.connect(this.delaySends.noise);
    }
    
    // Handle density (sparse noise bursts)
    if (density < 0.9) {
      // Create a gain modulation for sparse feel
      const sparseGain = this.ctx.createGain();
      const sparseOsc = this.ctx.createOscillator();
      sparseOsc.type = 'square';
      sparseOsc.frequency.value = 20 + density * 80;
      const sparseOscGain = this.ctx.createGain();
      sparseOscGain.gain.value = 0.5;
      sparseOsc.connect(sparseOscGain);
      sparseOscGain.connect(sparseGain.gain);
      sparseGain.gain.value = 0.5;
      
      // Insert into chain
      mainFilter.disconnect();
      mainFilter.connect(sparseGain);
      sparseGain.connect(outputGain);
      
      sparseOsc.start(time);
      sparseOsc.stop(time + attack + decay + 0.01);
    }
    
    source.start(time);
    source.stop(time + attack + decay + 0.01);
    
    if (breathLFO) {
      breathLFO.start(time);
      breathLFO.stop(time + attack + decay + 0.01);
    }
    
    if (colorLFONode) {
      colorLFONode.start(time);
      colorLFONode.stop(time + attack + decay + 0.01);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RANDOM SCHEDULER
  // ═══════════════════════════════════════════════════════════════════════════
  
  private startRandomScheduler(): void {
    if (this.randomScheduleTimer) return;
    
    const scheduleRandom = () => {
      if (!this.params.drumEnabled || !this.params.drumRandomEnabled) {
        this.stopRandomScheduler();
        return;
      }
      
      const now = this.ctx.currentTime;
      const density = this.params.drumRandomDensity;
      
      // Check each voice for random trigger
      const voices: { type: DrumVoiceType; prob: number }[] = [
        { type: 'sub', prob: this.params.drumRandomSubProb },
        { type: 'kick', prob: this.params.drumRandomKickProb },
        { type: 'click', prob: this.params.drumRandomClickProb },
        { type: 'beepHi', prob: this.params.drumRandomBeepHiProb },
        { type: 'beepLo', prob: this.params.drumRandomBeepLoProb },
        { type: 'noise', prob: this.params.drumRandomNoiseProb },
      ];
      
      for (const v of voices) {
        const effectiveProb = v.prob * density;
        const minInterval = this.params.drumRandomMinInterval / 1000;
        const timeSinceLast = now - this.lastRandomTimes[v.type];
        
        if (timeSinceLast >= minInterval && this.rng() < effectiveProb) {
          const velocity = 0.5 + this.rng() * 0.5;
          this.triggerVoice(v.type, velocity, now);
          this.lastRandomTimes[v.type] = now;
        }
      }
      
      // Schedule next check
      const nextInterval = this.params.drumRandomMinInterval + 
        this.rng() * (this.params.drumRandomMaxInterval - this.params.drumRandomMinInterval);
      
      this.randomScheduleTimer = window.setTimeout(scheduleRandom, nextInterval);
    };
    
    scheduleRandom();
  }
  
  private stopRandomScheduler(): void {
    if (this.randomScheduleTimer) {
      clearTimeout(this.randomScheduleTimer);
      this.randomScheduleTimer = null;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EUCLIDEAN SCHEDULER
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Generate Euclidean rhythm pattern
   * Returns array of booleans where true = hit
   */
  private generateEuclideanPattern(steps: number, hits: number, rotation: number): boolean[] {
    if (hits >= steps) return new Array(steps).fill(true);
    if (hits <= 0) return new Array(steps).fill(false);
    
    // Bresenham's line algorithm for even distribution
    const pattern: boolean[] = new Array(steps).fill(false);
    for (let i = 0; i < hits; i++) {
      const pos = Math.floor((i * steps) / hits);
      pattern[pos] = true;
    }
    
    // Apply rotation
    const rotated: boolean[] = [];
    for (let i = 0; i < steps; i++) {
      rotated.push(pattern[(i + rotation) % steps]);
    }
    
    return rotated;
  }
  
  private startEuclidScheduler(): void {
    if (this.euclidScheduleTimer) return;
    
    // Reset step counters
    this.euclidCurrentStep = [0, 0, 0, 0];
    this.lastScheduleTime = this.ctx.currentTime;
    
    const scheduleEuclid = () => {
      if (!this.params.drumEnabled || !this.params.drumEuclidMasterEnabled) {
        this.stopEuclidScheduler();
        return;
      }
      
      const now = this.ctx.currentTime;
      const tempo = this.params.drumEuclidTempo;
      const division = this.params.drumEuclidDivision;
      const swing = this.params.drumEuclidSwing / 100;
      
      // Calculate step duration based on tempo and base BPM
      // Division: 4=quarter, 8=eighth, 16=sixteenth, 32=thirty-second
      const baseBPM = this.params.drumEuclidBaseBPM ?? 120;
      const beatDuration = 60 / (baseBPM * tempo);
      const stepDuration = (beatDuration * 4) / division;
      
      // Preset pattern data (same as UI)
      const presetData: Record<string, { steps: number; hits: number; rotation: number }> = {
        sparse: { steps: 16, hits: 1, rotation: 0 },
        dense: { steps: 8, hits: 7, rotation: 0 },
        longSparse: { steps: 32, hits: 3, rotation: 0 },
        poly3v4: { steps: 12, hits: 3, rotation: 0 },
        poly4v3: { steps: 12, hits: 4, rotation: 0 },
        poly5v4: { steps: 20, hits: 5, rotation: 0 },
        lancaran: { steps: 16, hits: 4, rotation: 0 },
        ketawang: { steps: 16, hits: 2, rotation: 0 },
        ladrang: { steps: 32, hits: 8, rotation: 0 },
        gangsaran: { steps: 8, hits: 4, rotation: 0 },
        kotekan: { steps: 8, hits: 3, rotation: 1 },
        kotekan2: { steps: 8, hits: 3, rotation: 4 },
        srepegan: { steps: 16, hits: 6, rotation: 2 },
        sampak: { steps: 8, hits: 5, rotation: 0 },
        ayak: { steps: 16, hits: 3, rotation: 4 },
        bonang: { steps: 12, hits: 5, rotation: 2 },
        tresillo: { steps: 8, hits: 3, rotation: 0 },
        cinquillo: { steps: 8, hits: 5, rotation: 0 },
        rumba: { steps: 16, hits: 5, rotation: 0 },
        bossa: { steps: 16, hits: 5, rotation: 3 },
        son: { steps: 16, hits: 7, rotation: 0 },
        shiko: { steps: 16, hits: 5, rotation: 0 },
        soukous: { steps: 12, hits: 7, rotation: 0 },
        gahu: { steps: 16, hits: 7, rotation: 0 },
        bembe: { steps: 12, hits: 7, rotation: 0 },
        clapping: { steps: 12, hits: 8, rotation: 0 },
        clappingB: { steps: 12, hits: 8, rotation: 5 },
        additive7: { steps: 7, hits: 4, rotation: 0 },
        additive11: { steps: 11, hits: 5, rotation: 0 },
        additive13: { steps: 13, hits: 5, rotation: 0 },
        reich18: { steps: 12, hits: 7, rotation: 3 },
        drumming: { steps: 8, hits: 6, rotation: 1 },
      };
      
      // Helper to get effective pattern params from preset or custom
      const getPatternParams = (preset: string, steps: number, hits: number, rotation: number) => {
        if (preset === 'custom' || !presetData[preset]) {
          return { steps, hits, rotation };
        }
        const p = presetData[preset];
        return { 
          steps: p.steps, 
          hits: p.hits, 
          rotation: (p.rotation + rotation) % p.steps  // User rotation is additive
        };
      };
      
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
          ...getPatternParams(this.params.drumEuclid1Preset, this.params.drumEuclid1Steps, this.params.drumEuclid1Hits, this.params.drumEuclid1Rotation),
          voices: getEnabledVoices(1), prob: this.params.drumEuclid1Probability,
          velMin: this.params.drumEuclid1VelocityMin, velMax: this.params.drumEuclid1VelocityMax,
          level: this.params.drumEuclid1Level 
        },
        { 
          enabled: this.params.drumEuclid2Enabled, 
          ...getPatternParams(this.params.drumEuclid2Preset, this.params.drumEuclid2Steps, this.params.drumEuclid2Hits, this.params.drumEuclid2Rotation),
          voices: getEnabledVoices(2), prob: this.params.drumEuclid2Probability,
          velMin: this.params.drumEuclid2VelocityMin, velMax: this.params.drumEuclid2VelocityMax,
          level: this.params.drumEuclid2Level 
        },
        { 
          enabled: this.params.drumEuclid3Enabled, 
          ...getPatternParams(this.params.drumEuclid3Preset, this.params.drumEuclid3Steps, this.params.drumEuclid3Hits, this.params.drumEuclid3Rotation),
          voices: getEnabledVoices(3), prob: this.params.drumEuclid3Probability,
          velMin: this.params.drumEuclid3VelocityMin, velMax: this.params.drumEuclid3VelocityMax,
          level: this.params.drumEuclid3Level 
        },
        { 
          enabled: this.params.drumEuclid4Enabled, 
          ...getPatternParams(this.params.drumEuclid4Preset, this.params.drumEuclid4Steps, this.params.drumEuclid4Hits, this.params.drumEuclid4Rotation),
          voices: getEnabledVoices(4), prob: this.params.drumEuclid4Probability,
          velMin: this.params.drumEuclid4VelocityMin, velMax: this.params.drumEuclid4VelocityMax,
          level: this.params.drumEuclid4Level 
        },
      ];
      
      // Schedule ahead ~100ms for timing accuracy
      const lookAhead = 0.1;
      const scheduleUntil = now + lookAhead;
      
      while (this.lastScheduleTime < scheduleUntil) {
        let scheduleTime = this.lastScheduleTime;
        
        // Apply swing (delay every other step slightly)
        const isOffbeat = Math.floor(this.lastScheduleTime / stepDuration) % 2 === 1;
        if (isOffbeat && swing > 0) {
          scheduleTime += stepDuration * swing * 0.5;
        }
        
        // Check each lane
        lanes.forEach((lane, laneIndex) => {
          if (!lane.enabled) return;
          if (lane.voices.length === 0) return; // No voices enabled
          
          const pattern = this.generateEuclideanPattern(
            lane.steps, lane.hits, lane.rotation
          );
          
          const stepIndex = this.euclidCurrentStep[laneIndex] % lane.steps;
          
          if (pattern[stepIndex]) {
            // Probability check
            if (this.rng() <= lane.prob) {
              const velocity = lane.velMin + this.rng() * (lane.velMax - lane.velMin);
              // Randomly select one of the enabled voices
              const selectedVoice = lane.voices[Math.floor(this.rng() * lane.voices.length)];
              this.triggerVoice(selectedVoice, velocity * lane.level, scheduleTime);
            }
          }
          
          // Advance step
          this.euclidCurrentStep[laneIndex] = (this.euclidCurrentStep[laneIndex] + 1) % lane.steps;
        });
        
        this.lastScheduleTime += stepDuration;
      }
      
      // Schedule next iteration
      this.euclidScheduleTimer = window.setTimeout(scheduleEuclid, 50);
    };
    
    scheduleEuclid();
  }
  
  private stopEuclidScheduler(): void {
    if (this.euclidScheduleTimer) {
      clearTimeout(this.euclidScheduleTimer);
      this.euclidScheduleTimer = null;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════
  
  dispose(): void {
    this.stop();
    this.morphManager.reset();
    if (this.morphAnimationFrame) {
      cancelAnimationFrame(this.morphAnimationFrame);
      this.morphAnimationFrame = null;
    }
    this.masterGain.disconnect();
    this.reverbSend.disconnect();
  }
}
