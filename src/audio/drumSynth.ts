/**
 * Ikeda-Style Drum Synthesizer
 * 
 * Minimalist percussion synthesizer inspired by Ryoji Ikeda's aesthetic:
 * - Sharp digital impulses and clicks
 * - Pure sine beeps at frequency extremes
 * - Sub-bass pulses
 * - Filtered noise bursts
 * - Mathematical precision with probability-based triggering
 * 
 * 6 voice types:
 * 1. Sub - Low sine pulse (30-100Hz), felt more than heard
 * 2. Kick - Sine with pitch envelope for punch
 * 3. Click - Impulse/noise burst, the "data" sound
 * 4. Beep Hi - High frequency sine ping (2-12kHz)
 * 5. Beep Lo - Lower pitched blip (150-2000Hz)
 * 6. Noise - Filtered noise burst (hi-hat/texture)
 */

import type { SliderState } from '../ui/state';

export type DrumVoiceType = 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise';

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
  
  // Callback for UI visualization
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;

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
    
    // Pre-generate noise buffer
    this.createNoiseBuffer();
  }
  
  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void): void {
    this.onDrumTrigger = callback;
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
   * Voice 1: Sub - Deep sine pulse, felt more than heard
   */
  private triggerSub(velocity: number, time: number): void {
    const p = this.params;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = p.drumSubFreq;
    
    // Add subtle harmonics based on tone parameter
    let osc2: OscillatorNode | null = null;
    let gain2: GainNode | null = null;
    if (p.drumSubTone > 0.05) {
      osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = p.drumSubFreq * 2; // Octave up
      gain2 = this.ctx.createGain();
      gain2.gain.value = p.drumSubTone * 0.3 * velocity * p.drumSubLevel;
    }
    
    // Envelope: instant attack, exponential decay
    const level = velocity * p.drumSubLevel;
    const decayTime = p.drumSubDecay / 1000;
    
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    
    // Connect and schedule
    osc.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    osc.start(time);
    osc.stop(time + decayTime + 0.01);
    
    if (osc2 && gain2) {
      gain2.gain.setValueAtTime(gain2.gain.value, time);
      gain2.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.7);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(time);
      osc2.stop(time + decayTime + 0.01);
    }
  }
  
  /**
   * Voice 2: Kick - Sine with pitch envelope for punch
   */
  private triggerKick(velocity: number, time: number): void {
    const p = this.params;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    
    // Pitch envelope: start high, sweep down to base frequency
    const startFreq = p.drumKickFreq * Math.pow(2, p.drumKickPitchEnv / 12);
    const pitchDecay = p.drumKickPitchDecay / 1000;
    
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(p.drumKickFreq, time + pitchDecay);
    
    // Click transient (optional high-frequency burst)
    let clickOsc: OscillatorNode | null = null;
    let clickGain: GainNode | null = null;
    if (p.drumKickClick > 0.05) {
      clickOsc = this.ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.value = 3000;
      clickGain = this.ctx.createGain();
      const clickLevel = p.drumKickClick * velocity * p.drumKickLevel * 0.5;
      clickGain.gain.setValueAtTime(clickLevel, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.005);
    }
    
    // Amplitude envelope
    const level = velocity * p.drumKickLevel;
    const decayTime = p.drumKickDecay / 1000;
    
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    
    // Connect
    osc.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    osc.start(time);
    osc.stop(time + decayTime + 0.01);
    
    if (clickOsc && clickGain) {
      clickOsc.connect(clickGain);
      clickGain.connect(this.masterGain);
      clickOsc.start(time);
      clickOsc.stop(time + 0.01);
    }
  }
  
  /**
   * Voice 3: Click - Impulse/noise burst, the signature "data" sound
   */
  private triggerClick(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    
    // Highpass filter for that sharp digital character
    filter.type = 'highpass';
    filter.frequency.value = p.drumClickFilter;
    filter.Q.value = 0.5 + p.drumClickResonance * 15; // Resonance for metallic ring
    
    // Mix between impulse (very short) and noise burst based on tone
    const decayTime = p.drumClickDecay / 1000;
    const actualDecay = decayTime * (0.2 + p.drumClickTone * 0.8); // Shorter for impulse
    
    const level = velocity * p.drumClickLevel;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + actualDecay);
    
    // Connect
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    source.start(time);
    source.stop(time + actualDecay + 0.01);
  }
  
  /**
   * Voice 4: Beep Hi - High frequency sine ping
   */
  private triggerBeepHi(velocity: number, time: number): void {
    const p = this.params;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = p.drumBeepHiFreq;
    
    // FM modulation for metallic character (optional)
    let modOsc: OscillatorNode | null = null;
    let modGain: GainNode | null = null;
    if (p.drumBeepHiTone > 0.1) {
      modOsc = this.ctx.createOscillator();
      modOsc.type = 'sine';
      modOsc.frequency.value = p.drumBeepHiFreq * 2.01; // Slight detune for FM
      modGain = this.ctx.createGain();
      modGain.gain.value = p.drumBeepHiTone * p.drumBeepHiFreq * 0.3;
      modOsc.connect(modGain);
      modGain.connect(osc.frequency);
    }
    
    // Attack/decay envelope
    const attack = p.drumBeepHiAttack / 1000;
    const decay = p.drumBeepHiDecay / 1000;
    const level = velocity * p.drumBeepHiLevel;
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    
    // Connect
    osc.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    osc.start(time);
    osc.stop(time + attack + decay + 0.01);
    
    if (modOsc) {
      modOsc.start(time);
      modOsc.stop(time + attack + decay + 0.01);
    }
  }
  
  /**
   * Voice 5: Beep Lo - Lower pitched blip/ping
   */
  private triggerBeepLo(velocity: number, time: number): void {
    const p = this.params;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Blend between sine and square based on tone
    osc.type = p.drumBeepLoTone > 0.5 ? 'square' : 'sine';
    osc.frequency.value = p.drumBeepLoFreq;
    
    // If using square, filter to soften harmonics
    let filter: BiquadFilterNode | null = null;
    if (p.drumBeepLoTone > 0.5) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = p.drumBeepLoFreq * 4;
      filter.Q.value = 0.7;
    }
    
    // Attack/decay envelope
    const attack = p.drumBeepLoAttack / 1000;
    const decay = p.drumBeepLoDecay / 1000;
    const level = velocity * p.drumBeepLoLevel;
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    
    // Connect
    if (filter) {
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    osc.start(time);
    osc.stop(time + attack + decay + 0.01);
  }
  
  /**
   * Voice 6: Noise - Filtered noise burst (hi-hat/texture)
   */
  private triggerNoise(velocity: number, time: number): void {
    const p = this.params;
    
    if (!this.noiseBuffer) return;
    
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    source.buffer = this.noiseBuffer;
    
    // Filter type and settings
    filter.type = p.drumNoiseFilterType;
    filter.frequency.value = p.drumNoiseFilterFreq;
    filter.Q.value = p.drumNoiseFilterQ;
    
    // Attack/decay envelope
    const attack = p.drumNoiseAttack / 1000;
    const decay = p.drumNoiseDecay / 1000;
    const level = velocity * p.drumNoiseLevel;
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
    
    // Connect
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbSend);
    
    source.start(time);
    source.stop(time + attack + decay + 0.01);
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
    this.masterGain.disconnect();
    this.reverbSend.disconnect();
  }
}
