/**
 * Water Synthesis AudioWorklet Processor
 * 
 * High-quality procedural water synthesis with:
 * - Modal resonator-based droplet voices
 * - Multi-band turbulence bed
 * - 4 preset families: Tap Drips, Stream, Waterfall, Rain-on-window
 * 
 * Quality-first: No obvious looping, proper resonance modeling, distance filtering
 */

// Seeded PRNG for deterministic randomness
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One-pole lowpass filter
class OnePole {
  constructor() {
    this.z1 = 0;
  }
  process(input, coeff) {
    this.z1 = input * (1 - coeff) + this.z1 * coeff;
    return this.z1;
  }
  reset() {
    this.z1 = 0;
  }
}

// Biquad filter for more precise filtering
class BiquadFilter {
  constructor() {
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
  }
  
  setLowpass(freq, q, sampleRate) {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosw0) / 2) / a0;
    this.b1 = (1 - cosw0) / a0;
    this.b2 = ((1 - cosw0) / 2) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  
  setBandpass(freq, q, sampleRate) {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  
  setHighpass(freq, q, sampleRate) {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cosw0) / 2) / a0;
    this.b1 = (-(1 + cosw0)) / a0;
    this.b2 = ((1 + cosw0) / 2) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  
  process(input) {
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2
                   - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
  
  reset() {
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }
}

// Basic modal resonator for glass pane and sink modes
class ModalResonator {
  constructor() {
    this.phase = 0;
    this.amplitude = 0;
    this.frequency = 440;
    this.decay = 0.999;
    this.phaseIncrement = 0;
  }
  
  trigger(freq, amp, decayTime, sampleRate) {
    this.frequency = freq;
    this.amplitude = amp;
    this.phase = 0;
    this.phaseIncrement = (2 * Math.PI * freq) / sampleRate;
    this.decay = Math.exp(-1 / (decayTime * sampleRate));
  }
  
  process() {
    if (this.amplitude < 0.00001) return 0;
    const out = Math.sin(this.phase) * this.amplitude;
    this.phase += this.phaseIncrement;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    this.amplitude *= this.decay;
    return out;
  }
  
  isActive() {
    return this.amplitude > 0.00001;
  }
}

// Modal resonator with frequency drift capability
// Phillips et al. (2018): Sound is from entrapped air BUBBLE oscillating
// As bubble shrinks rapidly after entrainment, frequency RISES
// Rankin (2005): f = 1/(2πr) * sqrt(3γP₀/ρ) - smaller bubble = higher freq
class DriftingResonator {
  constructor() {
    this.phase = 0;
    this.amplitude = 0;
    this.frequency = 440;
    this.targetFreq = 440;
    this.driftRate = 0; // Hz per sample
    this.driftSamples = 0; // remaining drift samples
    this.totalDriftSamples = 0;
    this.startFreq = 440;
    this.driftMode = 'linear'; // linear | exp
    this.driftExponent = 2.2;
    this.decay = 0.999;
    this.sampleRate = 48000;
  }
  
  trigger(freq, amp, decayTime, sampleRate, driftAmount, driftDuration, driftMode = 'linear', driftExponent = 2.2) {
    this.sampleRate = sampleRate;
    // PHYSICS: Bubble shrinks → frequency RISES
    // Start at base freq, drift UP by driftAmount (bubble shrinking)
    this.frequency = freq;
    this.startFreq = freq;
    this.targetFreq = freq * (1 + driftAmount); // End HIGHER (bubble shrinks)
    this.amplitude = amp;
    this.phase = 0;
    this.driftMode = driftMode;
    this.driftExponent = driftExponent;
    
    // Calculate drift (upward)
    this.driftSamples = Math.floor(driftDuration * sampleRate);
    this.totalDriftSamples = this.driftSamples;
    if (this.driftSamples > 0) {
      this.driftRate = (this.targetFreq - this.frequency) / this.driftSamples;
    } else {
      this.driftRate = 0;
    }
    
    // Convert decay time to per-sample multiplier
    this.decay = Math.exp(-1 / (decayTime * sampleRate));
  }
  
  process() {
    if (this.amplitude < 0.00001) return 0;
    
    // Frequency drift
    if (this.driftSamples > 0) {
      const prevFreq = this.frequency;
      if (this.driftMode === 'exp' && this.totalDriftSamples > 0) {
        const elapsed = this.totalDriftSamples - this.driftSamples + 1;
        const t = elapsed / this.totalDriftSamples;
        const shaped = Math.pow(Math.max(0, Math.min(1, t)), this.driftExponent);
        this.frequency = this.startFreq + (this.targetFreq - this.startFreq) * shaped;
      } else {
        this.frequency += this.driftRate;
      }
      // Keep drift strictly non-decreasing to avoid any audible glide-back
      this.frequency = Math.max(prevFreq, this.frequency);
      this.driftSamples--;
    }
    
    const phaseInc = (2 * Math.PI * this.frequency) / this.sampleRate;
    const out = Math.sin(this.phase) * this.amplitude;
    this.phase += phaseInc;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    this.amplitude *= this.decay;
    return out;
  }
  
  isActive() {
    return this.amplitude > 0.00001;
  }
}

// ============================================
// DROPLET VOICE - Research-based realistic water drop
// ============================================
// Key insight: A droplet is NOT a pure tone with envelope.
// It's: impact transient (2-10ms) + brief damped resonance (multi-mode) + broadband tail
//
// The transient dominates perceptually, the "pitch" is just the salient part
// of a richer event that includes splash energy and multiple resonant modes.
// ============================================
class DropletVoice {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.active = false;
    this.age = 0;
    
    // MULTI-MODE RESONATOR BANK
    // Research: 2-5 modes with slightly different frequencies and decay times
    // - Main mode (dominant)
    // - 1-2 neighbor modes (±3-7% detune)
    // - Optional higher mode (2-3x)
    this.modes = [];
    for (let i = 0; i < 5; i++) {
      this.modes.push(new DriftingResonator());
    }
    
    // IMPACT TRANSIENT
    // Research: bandlimited noise burst, 0-1ms attack, 2-10ms decay
    // Should dominate the first few ms - this is the "tick/plink"
    this.impactEnv = 0;
    this.impactDecay = 0.9; // Fast decay
    this.impactNoise = 0;
    this.impactNoiseState = 0;
    this.impactDelayCounter = 0; // 0-3ms delay before ring onset
    
    // Impact filter (shapes the "tick" character)
    this.impactHPF = new BiquadFilter(); // High pass for click
    this.impactBPF = new BiquadFilter(); // Bandpass for tonal tick
    
    // BROADBAND TAIL
    // Research: fast-decaying noise under the ring (splash microturbulence)
    // Breaks the purity of the tone
    this.tailEnv = 0;
    this.tailDecay = 0.995;
    this.tailNoise = 0;
    this.tailFilter = new BiquadFilter(); // Bandpass around expected energy
    
    // Voice characteristics (randomized per drop)
    this.pan = 0;
    this.impactBrightness = 0.5; // Filter cutoff/tilt for impact
    this.modalSpread = 0.05; // How far modes are apart (3-7%)
    this.impactToRingBalance = 0.5; // How tonal vs ticky
    this.impactTonalMix = 0.1; // Keep tonal click component low
    this.ringDelayMs = 0; // Micro-delay before ring onset
    this.ringToneEnv = 1;
    this.ringToneDecay = 0.995;

    // Resonant HPF around main note (randomly moving for plink character)
    this.plinkHPF = new BiquadFilter();
    this.plinkHPFBaseFreq = 1200;
    this.plinkHPFFreq = 1200;
    this.plinkHPFQ = 1.2;
    this.plinkHPFLfoPhase = 0;
    this.plinkHPFLfoRate = 1.5;
    this.plinkHPFLfoDepth = 0.15;
    this.plinkHPFJitter = 0.03;
  }
  
  trigger(params, rng) {
    this.active = true;
    this.age = 0;
    
    const { baseFreq, dropSize, hardness, decayTime, sinkMaterial } = params;
    
    // ===== RANDOMIZE THE RIGHT PARAMETERS =====
    // (Not just pitch - that creates "random notes")
    
    // Impact brightness (filter cutoff/tilt)
    this.impactBrightness = 0.3 + rng() * 0.6;
    
    // Modal detune spread (how far modes are apart: 3-7%)
    this.modalSpread = 0.03 + rng() * 0.04;
    
    // Impact-to-ring balance (how tonal vs ticky)
    // Higher = more tick, less ring
    this.impactToRingBalance = 0.4 + rng() * 0.4;
    this.impactTonalMix = 0.05 + rng() * 0.08;
    
    // Micro-delay between impact and ring onset (0-3ms)
    this.ringDelayMs = rng() * 0.003;
    this.impactDelayCounter = Math.floor(this.ringDelayMs * this.sampleRate);

    // Fast ring damping to avoid long tonal tails
    const ringToneMs = 0.018 + rng() * 0.05;
    this.ringToneEnv = 1;
    this.ringToneDecay = Math.exp(-1 / (ringToneMs * this.sampleRate));
    
    // ===== MODAL RESONATOR BANK =====
    // Base frequency with size scaling
    const freqScale = 1 - dropSize * 0.6;
    // Plink tuning: shift to a higher resonant center
    const fundamentalFreq = baseFreq * freqScale * (1.05 + rng() * 0.85);
    
    // Very short base decay (research: 60-200ms main, neighbors shorter)
    const baseDecayMs = decayTime * 0.12 * (0.4 + dropSize * 0.6);
    
    // Plink glide: clear upward pitch motion after impact
    // Requirement: ~80ms increase in pitch after impact
    const driftAmount = 0.08 + rng() * 0.08; // +8% to +16%
    const driftDuration = 0.08; // 80ms
    
    // Mode 0: Main dominant mode
    const mainDecay = baseDecayMs * (0.7 + rng() * 0.6); // 60-200ms range
    this.modes[0].trigger(
      fundamentalFreq,
      0.25 * (1 - this.impactToRingBalance * 0.7), // Lower if ticky
      mainDecay,
      this.sampleRate,
      driftAmount,
      driftDuration
    );
    
    // Mode 1: Neighbor mode (-spread detune)
    const neighbor1Detune = 1 - this.modalSpread * (0.5 + rng() * 0.5);
    const neighbor1Decay = baseDecayMs * (0.5 + rng() * 0.4); // 30-120ms
    this.modes[1].trigger(
      fundamentalFreq * neighbor1Detune,
      0.12 * (1 - this.impactToRingBalance * 0.5),
      neighbor1Decay,
      this.sampleRate,
      driftAmount * 0.7,
      driftDuration * 0.8
    );
    
    // Mode 2: Neighbor mode (+spread detune)
    const neighbor2Detune = 1 + this.modalSpread * (0.5 + rng() * 0.5);
    const neighbor2Decay = baseDecayMs * (0.4 + rng() * 0.4);
    this.modes[2].trigger(
      fundamentalFreq * neighbor2Detune,
      0.10 * (1 - this.impactToRingBalance * 0.5),
      neighbor2Decay,
      this.sampleRate,
      driftAmount * 0.5,
      driftDuration * 0.6
    );
    
    // Mode 3: Higher partial (2-3x, low level, short decay: 10-60ms)
    const higherRatio = 2 + rng() * 1;
    const higherDecay = baseDecayMs * (0.15 + rng() * 0.25);
    this.modes[3].trigger(
      fundamentalFreq * higherRatio,
      0.04 * (0.5 + rng() * 0.5),
      higherDecay,
      this.sampleRate,
      0, // No drift for higher
      0
    );
    
    // Mode 4: Optional very high partial
    if (rng() > 0.5) {
      this.modes[4].trigger(
        fundamentalFreq * (3 + rng() * 1),
        0.02,
        baseDecayMs * 0.1,
        this.sampleRate,
        0,
        0
      );
    } else {
      this.modes[4].amplitude = 0;
    }
    
    // ===== IMPACT TRANSIENT =====
    // Research: bandlimited noise burst, attack 0-1ms, decay 2-10ms
    this.impactEnv = hardness * (0.8 + rng() * 0.4);
    // Decay rate: higher = faster (2-10ms window)
    // At 48kHz: 2ms = 96 samples, 10ms = 480 samples
    // decay^96 = 0.01 means decay = 0.952
    // decay^480 = 0.01 means decay = 0.9904
    const impactDecayMs = 0.002 + (1 - hardness) * 0.008; // 2-10ms
    this.impactDecay = Math.exp(-1 / (impactDecayMs * this.sampleRate));
    
    // Impact HPF frequency (glass/ceramic = 2-8kHz)
    const impactHPFFreq = 2000 + this.impactBrightness * 6000 + rng() * 2000;
    this.impactHPF.setHighpass(Math.min(impactHPFFreq, this.sampleRate * 0.4), 1.0, this.sampleRate);
    
    // Keep impact band component broad and less tied to a pitch center
    const impactBPFFreq = 1400 + rng() * 5200;
    this.impactBPF.setBandpass(impactBPFFreq, 0.6 + rng() * 1.0, this.sampleRate);
    
    // ===== BROADBAND TAIL =====
    // Research: 10-80ms decay, filtered around expected energy
    this.tailEnv = dropSize * 0.4 * (0.6 + rng() * 0.8);
    const tailDecayMs = 0.01 + dropSize * 0.07; // 10-80ms
    this.tailDecay = Math.exp(-1 / (tailDecayMs * this.sampleRate));
    
    // Tail filter: smaller drops = higher (4-10kHz), bigger = lower (1-5kHz)
    const tailFreq = 1000 + (1 - dropSize) * 6000 + rng() * 2000;
    this.tailFilter.setBandpass(tailFreq, 1.5, this.sampleRate);

    // ===== MOVING RESONANT HPF AROUND MAIN NOTE =====
    this.plinkHPFBaseFreq = Math.max(180, Math.min(this.sampleRate * 0.42, fundamentalFreq * (0.85 + rng() * 0.5)));
    this.plinkHPFFreq = this.plinkHPFBaseFreq;
    this.plinkHPFQ = 1.3 + rng() * 2.0;
    this.plinkHPFLfoPhase = rng();
    this.plinkHPFLfoRate = 0.7 + rng() * 2.2;
    this.plinkHPFLfoDepth = 0.10 + rng() * 0.22;
    this.plinkHPFJitter = 0.01 + rng() * 0.05;
    this.plinkHPF.setHighpass(this.plinkHPFFreq, this.plinkHPFQ, this.sampleRate);
    
    // Pan position
    this.pan = (rng() - 0.5) * 1.6;
    
    // Reset noise states
    this.impactNoiseState = 0;
    this.tailNoise = 0;
  }
  
  process() {
    if (!this.active) return [0, 0];
    
    this.age++;
    
    // ===== IMPACT TRANSIENT (dominates first 2-10ms) =====
    let impact = 0;
    if (this.impactEnv > 0.0005) {
      // Generate band-limited noise
      const noise = Math.random() * 2 - 1;
      this.impactNoiseState = this.impactNoiseState * 0.3 + noise * 0.7;
      
      // Shape with HPF (tick character) + add BPF for slight tonal quality
      const hpfOut = this.impactHPF.process(this.impactNoiseState);
      const bpfOut = this.impactBPF.process(this.impactNoiseState);
      impact = (hpfOut * (1 - this.impactTonalMix) + bpfOut * this.impactTonalMix) * this.impactEnv;
      
      this.impactEnv *= this.impactDecay;
    }
    
    // ===== MODAL RESONANCE (with micro-delay) =====
    let modalSum = 0;
    let anyModeActive = false;
    
    // Micro-delay before ring onset (0-3ms)
    if (this.impactDelayCounter > 0) {
      this.impactDelayCounter--;
    } else {
      for (const mode of this.modes) {
        if (mode.isActive()) {
          modalSum += mode.process();
          anyModeActive = true;
        }
      }
      modalSum *= this.ringToneEnv;
      this.ringToneEnv *= this.ringToneDecay;
    }
    
    // ===== BROADBAND TAIL (under the ring) =====
    let tail = 0;
    if (this.tailEnv > 0.001) {
      const tailNoiseIn = Math.random() * 2 - 1;
      this.tailNoise = this.tailNoise * 0.4 + tailNoiseIn * 0.6;
      tail = this.tailFilter.process(this.tailNoise) * this.tailEnv;
      this.tailEnv *= this.tailDecay;
    }

    // Randomly moving resonant HPF around the main note (plink emphasis)
    this.plinkHPFLfoPhase += this.plinkHPFLfoRate / this.sampleRate;
    if (this.plinkHPFLfoPhase > 1) this.plinkHPFLfoPhase -= 1;
    const lfo = Math.sin(this.plinkHPFLfoPhase * 2 * Math.PI) * this.plinkHPFLfoDepth;
    const jitter = (Math.random() * 2 - 1) * this.plinkHPFJitter;
    const targetHPFFreq = this.plinkHPFBaseFreq * (1 + lfo + jitter);
    this.plinkHPFFreq = Math.max(120, Math.min(this.sampleRate * 0.45, targetHPFFreq));
    this.plinkHPF.setHighpass(this.plinkHPFFreq, this.plinkHPFQ, this.sampleRate);
    const modalShaped = this.plinkHPF.process(modalSum);
    
    // ===== MIX =====
    // Research: impact should dominate early, then ring + tail
    // Ring level reduced significantly - impact dominates perceptually
    const sample = impact * 0.9 + modalShaped * 0.08 + tail * 0.24;
    
    // Check if voice is done
    if (!anyModeActive && this.impactEnv < 0.0005 && this.tailEnv < 0.001) {
      this.active = false;
    }
    
    // Pan to stereo
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
  
  isActive() {
    return this.active;
  }
}

// Turbulence bed generator - multi-band noise with slow modulation
class TurbulenceBed {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    
    // Decorrelated noise states per band
    this.noiseStates = [
      { l: 0, r: 0 }, // Low
      { l: 0, r: 0 }, // Mid
      { l: 0, r: 0 }, // High
    ];
    
    // Filters for each band
    this.lowFilterL = new BiquadFilter();
    this.lowFilterR = new BiquadFilter();
    this.midFilterL = new BiquadFilter();
    this.midFilterR = new BiquadFilter();
    this.highFilterL = new BiquadFilter();
    this.highFilterR = new BiquadFilter();
    
    // Configure band filters
    this.lowFilterL.setLowpass(250, 0.7, sampleRate);
    this.lowFilterR.setLowpass(250, 0.7, sampleRate);
    this.midFilterL.setBandpass(800, 1.2, sampleRate);
    this.midFilterR.setBandpass(800, 1.2, sampleRate);
    this.highFilterL.setBandpass(5000, 2.0, sampleRate);
    this.highFilterR.setBandpass(5000, 2.0, sampleRate);
    
    // Modulation LFOs (very slow)
    this.lfoPhases = [0, 0.33, 0.67];
    this.lfoRates = [0.07, 0.11, 0.17]; // Hz
    
    // Band gains
    this.bandGains = [0.5, 0.5, 0.3];
  }
  
  setParams(params) {
    const { lowGain, midGain, highGain, roughness, spectralTilt } = params;
    
    // Apply spectral tilt (negative = darker)
    const tiltFactor = Math.pow(10, spectralTilt * 0.5);
    this.bandGains[0] = lowGain / tiltFactor;
    this.bandGains[1] = midGain;
    this.bandGains[2] = highGain * tiltFactor;
    
    // Roughness affects mid-band filter Q
    const midQ = 0.7 + roughness * 1.5;
    this.midFilterL.setBandpass(600 + roughness * 400, midQ, this.sampleRate);
    this.midFilterR.setBandpass(600 + roughness * 400, midQ, this.sampleRate);
  }
  
  process(rng) {
    // Generate decorrelated noise for each band
    const noiseL = rng() * 2 - 1;
    const noiseR = rng() * 2 - 1;
    const noiseMidL = rng() * 2 - 1;
    const noiseMidR = rng() * 2 - 1;
    const noiseHighL = rng() * 2 - 1;
    const noiseHighR = rng() * 2 - 1;
    
    // Update LFO modulation
    const lfoMods = [];
    for (let i = 0; i < 3; i++) {
      this.lfoPhases[i] += this.lfoRates[i] / this.sampleRate;
      if (this.lfoPhases[i] > 1) this.lfoPhases[i] -= 1;
      lfoMods.push(0.7 + 0.3 * Math.sin(this.lfoPhases[i] * 2 * Math.PI));
    }
    
    // Filter each band
    const lowL = this.lowFilterL.process(noiseL) * this.bandGains[0] * lfoMods[0];
    const lowR = this.lowFilterR.process(noiseR) * this.bandGains[0] * lfoMods[0];
    const midL = this.midFilterL.process(noiseMidL) * this.bandGains[1] * lfoMods[1];
    const midR = this.midFilterR.process(noiseMidR) * this.bandGains[1] * lfoMods[1];
    const highL = this.highFilterL.process(noiseHighL) * this.bandGains[2] * lfoMods[2];
    const highR = this.highFilterR.process(noiseHighR) * this.bandGains[2] * lfoMods[2];
    
    return [
      lowL + midL + highL,
      lowR + midR + highR
    ];
  }
}

// Glass pane resonator for rain-on-window
class GlassPaneResonator {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.modes = [];
    for (let i = 0; i < 4; i++) {
      this.modes.push(new ModalResonator());
    }
    this.exciteDecay = 0;
    this.inputScale = 0.3;
    
    // Configure glass modes
    this.setThickness(0.5);
  }
  
  setThickness(thickness) {
    // Thicker glass = lower frequencies, more damped
    const baseFreq = 400 + (1 - thickness) * 300;
    const ratios = [1.0, 1.58, 2.22, 2.92];
    
    for (let i = 0; i < this.modes.length; i++) {
      this.modes[i].frequency = baseFreq * ratios[i];
      this.modes[i].decay = Math.exp(-1 / ((0.05 + thickness * 0.1) * this.sampleRate));
    }
  }
  
  excite(amount) {
    for (let i = 0; i < this.modes.length; i++) {
      const amp = amount * (1 - i * 0.2);
      this.modes[i].trigger(
        this.modes[i].frequency,
        amp,
        0.05 + i * 0.02,
        this.sampleRate
      );
    }
  }
  
  process(input) {
    // Excite from input
    if (Math.abs(input) > 0.1) {
      this.excite(Math.abs(input) * this.inputScale);
    }
    
    let sum = 0;
    for (const mode of this.modes) {
      sum += mode.process();
    }
    
    return sum * 0.3;
  }
}

// ==============================================
// WATER-INTO-WATER DROP VOICE
// ==============================================
// Different from hard surface drops:
// - Softer impact (less click)
// - More pronounced bubble resonance  
// - Lower frequencies (underwater cavity)
// - Longer, softer decay
class WaterIntoWaterVoice {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.active = false;
    this.age = 0;

    // Oscillator A excitation source (Operator-style)
    this.oscPhase = 0;
    this.oscBaseFreq = 79.8;
    this.oscFreq = 79.8;

    // Pitch env amount at 100% (used as subtle settling/jitter depth)
    this.pitchEnv = 0;
    this.pitchEnvDecay = 0.995;
    this.pitchEnvDecayBase = 0.995;

    // Amp envelope: A=0ms, D=600ms, S=0, final release shape ~50ms
    this.ampEnv = 0;
    this.ampDecay = 0.995;
    this.ampDecayBase = 0.995;
    this.releaseEnv = 1;
    this.releaseDecay = 0.999;
    this.releaseDecayBase = 0.999;

    // Excitation noise burst
    this.noiseEnv = 0;
    this.noiseDecay = 0.97;
    this.noiseDecayBase = 0.97;
    this.noiseState = 0;
    this.noiseFilter = new BiquadFilter();

    // 24dB/oct resonant high-pass: two cascaded biquads
    this.resHpf1 = new BiquadFilter();
    this.resHpf2 = new BiquadFilter();
    this.cutoffBase = 2170;
    this.cutoffStart = 1800;
    this.cutoffEnd = 2600;
    this.cutoffQ = 10;
    this.cutoffQStart = 8.5;
    this.cutoffQEnd = 12.5;

    // S&H LFO (audio-rate style)
    this.shRateHz = 127;
    this.shSamples = 1;
    this.shCounter = 1;
    this.shValue = 0;
    this.shAmount = 0.64;

    this.filterUpdateCounter = 0;
    this.filterUpdateInterval = 8;
    this.currentCutoff = this.cutoffBase;
    this.currentQ = this.cutoffQ;

    // Output tone smoothing
    this.bodyLPF = new OnePole();
    
    this.pan = 0;
    this.maxLifetimeSamples = Math.floor(this.sampleRate * 1.2);
  }
  
  trigger(params, rng) {
    this.active = true;
    this.age = 0;
    
    const { baseFreq, dropSize } = params;

    // Oscillator A around 79.8Hz, slightly varied per event
    this.oscBaseFreq = 79.8 * (0.95 + rng() * 0.1);
    this.oscFreq = this.oscBaseFreq;
    this.oscPhase = rng() * Math.PI * 2;

    // Pitch env = 100% style settling over short window
    this.pitchEnv = 1;
    const pitchSettleMs = 0.06 + rng() * 0.03;
    this.pitchEnvDecayBase = Math.exp(-1 / (pitchSettleMs * this.sampleRate));
    this.pitchEnvDecay = this.pitchEnvDecayBase;

    // Amp envelope one-shot: decay to silence around 600ms
    this.ampEnv = 1.0;
    this.ampDecayBase = Math.exp(-1 / (0.6 * this.sampleRate));
    this.ampDecay = this.ampDecayBase;
    this.releaseEnv = 1.0;
    this.releaseDecayBase = Math.exp(-1 / (0.05 * this.sampleRate));
    this.releaseDecay = this.releaseDecayBase;

    // Short filtered noise burst as exciter
    this.noiseEnv = 0.18 * (0.75 + rng() * 0.35);
    const noiseMs = 0.006 + rng() * 0.01;
    this.noiseDecayBase = Math.exp(-1 / (noiseMs * this.sampleRate));
    this.noiseDecay = this.noiseDecayBase;
    this.noiseState = 0;
    this.noiseFilter.setBandpass(
      Math.min(this.sampleRate * 0.42, 1800 + (1 - dropSize) * 2200 + rng() * 800),
      0.9,
      this.sampleRate
    );

    // Resonant high-pass filter is the audible "drop pitch"
    this.cutoffBase = baseFreq * (0.86 + rng() * 0.22);
    this.cutoffBase = Math.max(1200, Math.min(4200, this.cutoffBase));
    this.cutoffStart = this.cutoffBase * (0.76 + rng() * 0.06);
    this.cutoffEnd = this.cutoffBase * (1.12 + rng() * 0.16);
    this.cutoffQStart = 7.8 + rng() * 2.0;
    this.cutoffQEnd = this.cutoffQStart + 2.8 + rng() * 2.4;
    this.cutoffQ = this.cutoffQStart;
    this.resHpf1.setHighpass(this.cutoffStart, this.cutoffQStart, this.sampleRate);
    this.resHpf2.setHighpass(this.cutoffStart, this.cutoffQStart, this.sampleRate);

    // S&H LFO setup
    this.shRateHz = 127;
    this.shSamples = Math.max(1, Math.floor(this.sampleRate / this.shRateHz));
    this.shCounter = 0;
    this.shValue = 0;
    this.shAmount = 0.64;
    this.filterUpdateCounter = 0;
    
    this.pan = (rng() - 0.5) * 1.4;
  }
  
  process() {
    if (!this.active) return [0, 0];
    
    this.age++;

    // Update S&H value at ~127Hz
    this.shCounter--;
    if (this.shCounter <= 0) {
      this.shCounter = this.shSamples;
      this.shValue = Math.random() * 2 - 1;
    }

    // LFO affects envelope timing as well as filter
    const timeMod = Math.max(0.55, Math.min(1.75, 1 + this.shValue * this.shAmount * 0.6));
    this.pitchEnvDecay = Math.pow(this.pitchEnvDecayBase, 1 / timeMod);
    this.ampDecay = Math.pow(this.ampDecayBase, 1 / timeMod);
    this.noiseDecay = Math.pow(this.noiseDecayBase, 1 / timeMod);
    this.releaseDecay = Math.pow(this.releaseDecayBase, 1 / timeMod);

    // Pitch env (100%) contributes to mild settling/jitter depth
    this.pitchEnv *= this.pitchEnvDecay;
    const sweepProgress = 1 - this.pitchEnv;
    const pitchJitter = 1 + this.shValue * this.shAmount * 0.08 * this.pitchEnv;
    this.oscFreq = this.oscBaseFreq * pitchJitter;

    // Oscillator A
    this.oscPhase += (2 * Math.PI * this.oscFreq) / this.sampleRate;
    if (this.oscPhase > 2 * Math.PI) this.oscPhase -= 2 * Math.PI;
    const osc = Math.sin(this.oscPhase);

    // Noise exciter burst
    let noiseExciter = 0;
    if (this.noiseEnv > 0.0005) {
      const white = Math.random() * 2 - 1;
      this.noiseState = this.noiseState * 0.45 + white * 0.55;
      noiseExciter = this.noiseFilter.process(this.noiseState) * this.noiseEnv;
      this.noiseEnv *= this.noiseDecay;
    }

    // Amp decay then quick release shape
    this.ampEnv *= this.ampDecay;
    if (this.ampEnv < 0.12) {
      this.releaseEnv *= this.releaseDecay;
    }

    // Excitation signal sent into resonant HPF pair
    const excitation = (osc * 0.28 + noiseExciter * 0.46) * this.ampEnv;

    // Filter sweeps up over time; resonance also rises with the sweep
    const sweepCutoff = this.cutoffStart + (this.cutoffEnd - this.cutoffStart) * sweepProgress;
    const cutoffJitter = 1 + this.shValue * this.shAmount * 0.14 * (0.45 + this.pitchEnv * 0.55);
    this.currentCutoff = Math.max(700, Math.min(this.sampleRate * 0.46, sweepCutoff * cutoffJitter));
    this.currentQ = this.cutoffQStart + (this.cutoffQEnd - this.cutoffQStart) * sweepProgress;

    this.filterUpdateCounter++;
    if (this.filterUpdateCounter >= this.filterUpdateInterval) {
      this.filterUpdateCounter = 0;
      this.resHpf1.setHighpass(this.currentCutoff, this.currentQ, this.sampleRate);
      this.resHpf2.setHighpass(this.currentCutoff, this.currentQ, this.sampleRate);
    }

    let sample = this.resHpf2.process(this.resHpf1.process(excitation));
    sample *= this.releaseEnv;
    sample = this.bodyLPF.process(sample, 0.68);

    if (!Number.isFinite(sample)) {
      this.active = false;
      return [0, 0];
    }
    
    // Check if done
    if (this.age > this.maxLifetimeSamples || (this.ampEnv < 0.0004 && this.releaseEnv < 0.0004 && this.noiseEnv < 0.0004)) {
      this.active = false;
    }
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
  
  isActive() {
    return this.active;
  }
}

// ==============================================
// BUBBLING/GURGLING LAYER (for streams)
// ==============================================
// Continuous bubbling sounds at varying rates
class BubblingLayer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;

    this.smoothL = new OnePole();
    this.smoothR = new OnePole();
    
    // Multiple bubble voices at different rates
    this.bubbles = [];
    for (let i = 0; i < 6; i++) {
      this.bubbles.push({
        resonatorA: new DriftingResonator(),
        resonatorB: new DriftingResonator(),
        noiseFilter: new BiquadFilter(),
        noiseState: 0,
        noiseEnv: 0,
        noiseDecay: 0.995,
        toneEnv: 1,
        toneDecay: 0.995,
        nextTrigger: 0,
        baseRate: 0.5 + i * 0.3, // Different rates
        pan: (i / 5) - 0.5,
      });
    }
    
    this.gain = 0.5;
    this.rate = 1.0;
    this.density = 1.0;
  }
  
  setParams(gain, rate, density = 1.0) {
    this.gain = gain;
    this.rate = rate;
    this.density = density;
  }
  
  process(rng) {
    let sumL = 0;
    let sumR = 0;
    
    for (const bubble of this.bubbles) {
      bubble.nextTrigger--;
      
      // Trigger new bubble
      if (bubble.nextTrigger <= 0 && rng() < 0.26 * this.rate * this.density) {
        // Log-randomized center frequency to avoid clusters of obvious notes
        const freq = 110 * Math.pow(2, rng() * 1.88); // ~110-406Hz (max reduced by ~30%)
        const decay = 0.02 + rng() * 0.05;
        const drift = 2.0;
        
        bubble.resonatorA.trigger(
          freq * (0.88 + rng() * 0.20),
          0.09 * (0.45 + rng() * 0.8),
          decay,
          this.sampleRate,
          drift,
          0.08,
          'exp',
          0.75
        );

        bubble.resonatorB.trigger(
          freq * (1.1 + rng() * 0.2),
          0.045 * (0.5 + rng() * 0.75),
          decay * (0.55 + rng() * 0.35),
          this.sampleRate,
          drift,
          0.08,
          'exp',
          0.8
        );

        bubble.noiseEnv = 0.17 * (0.5 + rng() * 0.8);
        const noiseMs = 0.025 + rng() * 0.08;
        bubble.noiseDecay = Math.exp(-1 / (noiseMs * this.sampleRate));
        const noiseFreq = Math.min(1100, Math.max(130, freq * (0.75 + rng() * 0.55)));
        bubble.noiseFilter.setBandpass(noiseFreq, 0.45 + rng() * 0.45, this.sampleRate);

        const toneMs = 0.03 + rng() * 0.06;
        bubble.toneEnv = 1;
        bubble.toneDecay = Math.exp(-1 / (toneMs * this.sampleRate));
        
        // Random interval until next
        const baseInterval = this.sampleRate / (bubble.baseRate * this.rate * Math.max(0.2, this.density));
        bubble.nextTrigger = Math.floor(baseInterval * (0.2 + rng() * 1.9));
      }
      
      // Process
      let tone = 0;
      let active = false;
      if (bubble.resonatorA.isActive()) {
        tone += bubble.resonatorA.process();
        active = true;
      }
      if (bubble.resonatorB.isActive()) {
        tone += bubble.resonatorB.process();
        active = true;
      }
      tone *= bubble.toneEnv;
      bubble.toneEnv *= bubble.toneDecay;

      let noiseOut = 0;
      if (bubble.noiseEnv > 0.001) {
        const noise = rng() * 2 - 1;
        bubble.noiseState = bubble.noiseState * 0.62 + noise * 0.38;
        noiseOut = bubble.noiseFilter.process(bubble.noiseState) * bubble.noiseEnv;
        bubble.noiseEnv *= bubble.noiseDecay;
        active = true;
      }

      if (active) {
        const out = tone * 0.42 + noiseOut * 0.58;
        sumL += out * (0.5 - bubble.pan * 0.35);
        sumR += out * (0.5 + bubble.pan * 0.35);
      }
    }

    // Gently darken/smear bubbling tail to avoid metallic edge
    const smL = this.smoothL.process(sumL, 0.62);
    const smR = this.smoothR.process(sumR, 0.62);
    return [smL * this.gain, smR * this.gain];
  }
}

// ==============================================
// ROAR LAYER (for waterfalls)
// ==============================================
// Shaped noise with low rumble and presence
class RoarLayer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    
    // Low rumble (subsonic to 150Hz)
    this.rumbleFilterL = new BiquadFilter();
    this.rumbleFilterR = new BiquadFilter();
    this.rumbleFilterL.setLowpass(80, 0.5, sampleRate);
    this.rumbleFilterR.setLowpass(80, 0.5, sampleRate);
    
    // Body (150-600Hz)
    this.bodyFilterL = new BiquadFilter();
    this.bodyFilterR = new BiquadFilter();
    this.bodyFilterL.setBandpass(300, 0.8, sampleRate);
    this.bodyFilterR.setBandpass(300, 0.8, sampleRate);
    
    // Presence/spray (2-6kHz)
    this.sprayFilterL = new BiquadFilter();
    this.sprayFilterR = new BiquadFilter();
    this.sprayFilterL.setBandpass(4000, 1.5, sampleRate);
    this.sprayFilterR.setBandpass(4000, 1.5, sampleRate);
    
    // Noise states (decorrelated)
    this.noiseL = 0;
    this.noiseR = 0;
    
    // Slow modulation
    this.lfoPhase = 0;
    this.lfoRate = 0.08; // Very slow
    
    this.gain = 0.5;
    this.rumbleAmount = 0.7;
    this.sprayAmount = 0.4;
    this.density = 1.0;
  }
  
  setParams(gain, distance, density = 1.0) {
    this.gain = gain;
    this.density = density;
    // Distance reduces high frequencies
    this.sprayAmount = 0.5 * (1 - distance * 0.7);
    this.rumbleAmount = 0.7 * (1 + distance * 0.3); // Rumble travels farther
  }
  
  process(rng) {
    // Generate decorrelated pink-ish noise
    const whiteL = rng() * 2 - 1;
    const whiteR = rng() * 2 - 1;
    this.noiseL = this.noiseL * 0.7 + whiteL * 0.3;
    this.noiseR = this.noiseR * 0.7 + whiteR * 0.3;
    
    // LFO modulation
    this.lfoPhase += this.lfoRate / this.sampleRate;
    if (this.lfoPhase > 1) this.lfoPhase -= 1;
    const lfo = 0.85 + 0.15 * Math.sin(this.lfoPhase * 2 * Math.PI);
    
    // Process each band
    const rumbleL = this.rumbleFilterL.process(this.noiseL) * this.rumbleAmount;
    const rumbleR = this.rumbleFilterR.process(this.noiseR) * this.rumbleAmount;
    
    const bodyL = this.bodyFilterL.process(this.noiseL) * 0.6;
    const bodyR = this.bodyFilterR.process(this.noiseR) * 0.6;
    
    const sprayL = this.sprayFilterL.process(whiteL) * this.sprayAmount;
    const sprayR = this.sprayFilterR.process(whiteR) * this.sprayAmount;
    
    const densityScale = 0.25 + this.density * 0.75;
    const outL = (rumbleL + bodyL + sprayL) * lfo * this.gain * densityScale;
    const outR = (rumbleR + bodyR + sprayR) * lfo * this.gain * densityScale;
    
    return [outL, outR];
  }
}

// ==============================================
// RIVULET LAYER (for rain on window)
// ==============================================
// Continuous running/trickling water sound
class RivuletLayer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    
    // Multiple "streams" at different frequencies
    this.streams = [];
    for (let i = 0; i < 4; i++) {
      this.streams.push({
        filter: new BiquadFilter(),
        noise: 0,
        pan: (i / 3) - 0.5,
        gain: 0.3 - i * 0.05,
      });
    }
    
    // Configure stream filters (high-ish frequencies for trickling)
    this.streams[0].filter.setBandpass(2500, 3, sampleRate);
    this.streams[1].filter.setBandpass(3500, 2.5, sampleRate);
    this.streams[2].filter.setBandpass(4500, 2, sampleRate);
    this.streams[3].filter.setBandpass(6000, 1.5, sampleRate);
    
    // Slow modulation per stream
    this.lfoPhases = [0, 0.25, 0.5, 0.75];
    this.lfoRates = [0.15, 0.22, 0.31, 0.18];
    
    this.gain = 0.3;
    this.density = 1.0;
  }
  
  setParams(gain, density = 1.0) {
    this.gain = gain;
    this.density = density;
  }
  
  process(rng) {
    let sumL = 0;
    let sumR = 0;
    
    for (let i = 0; i < this.streams.length; i++) {
      const stream = this.streams[i];
      
      // Update LFO
      this.lfoPhases[i] += this.lfoRates[i] / this.sampleRate;
      if (this.lfoPhases[i] > 1) this.lfoPhases[i] -= 1;
      const lfo = 0.25 + 0.75 * Math.pow(Math.sin(this.lfoPhases[i] * Math.PI), 2);
      
      // Generate noise and filter
      const noise = rng() * 2 - 1;
      stream.noise = stream.noise * 0.6 + noise * 0.4;
      const densityScale = 0.25 + this.density * 0.75;
      const filtered = stream.filter.process(stream.noise) * stream.gain * lfo * densityScale;
      
      // Pan
      sumL += filtered * (0.5 - stream.pan * 0.4);
      sumR += filtered * (0.5 + stream.pan * 0.4);
    }
    
    return [sumL * this.gain, sumR * this.gain];
  }
}

// Preset definitions - with layer mix levels for distinct character
const WATER_PRESETS = {
  tapDrips: {
    eventRate: { min: 0.5, max: 2 },
    dropSize: { min: 0.5, max: 0.9 },
    hardness: 0.8,
    decayTime: 0.05,
    sinkMaterial: 0.3,
    turbulence: { low: 0.4, mid: 0.3, high: 0.15 },
    baseFreq: 2500,
    burstProbability: 0.08,
    burstCount: { min: 2, max: 3 },
    useSinkResonator: false,
    useGlassPane: false,
    // LAYER MIX - tap drips focus on hard drops + water-into-water
    layers: {
      hardDrops: 0.7,      // Drops on hard surface
      waterDrops: 0.5,     // Drops into water (sink basin)
      turbulence: 0.3,     // Background noise
      bubbling: 0.0,       // No bubbling for tap
      roar: 0.0,           // No roar
      rivulets: 0.0,       // No rivulets
    }
  },
  stream: {
    eventRate: { min: 3.5, max: 10 },
    dropSize: { min: 0.28, max: 0.62 },
    hardness: 0.2,
    decayTime: 0.06,
    sinkMaterial: 0,
    turbulence: { low: 0.7, mid: 0.55, high: 0.18 },
    baseFreq: 2300,
    burstProbability: 0.1,
    burstCount: { min: 2, max: 3 },
    useSinkResonator: false,
    useGlassPane: false,
    // LAYER MIX - stream is bubbling + water drops + turbulence
    layers: {
      hardDrops: 0.08,     // Very few hard impacts
      waterDrops: 0.82,    // Water-on-water drops dominate
      turbulence: 0.56,    // Softer broadband bed
      bubbling: 0.92,      // Primary stream character
      roar: 0.0,           // No roar
      rivulets: 0.0,       // No rivulets
    }
  },
  waterfall: {
    eventRate: { min: 20, max: 50 },
    dropSize: { min: 0.1, max: 0.3 },
    hardness: 0.2,
    decayTime: 0.02,
    sinkMaterial: 0,
    turbulence: { low: 0.5, mid: 0.6, high: 0.3 },
    baseFreq: 4500,
    burstProbability: 0.15,
    burstCount: { min: 3, max: 6 },
    useSinkResonator: false,
    useGlassPane: false,
    // LAYER MIX - waterfall is ROAR dominant + some drops
    layers: {
      hardDrops: 0.1,      // Minimal discrete drops
      waterDrops: 0.3,     // Some splashing
      turbulence: 0.4,     // Background turbulence
      bubbling: 0.4,       // Some bubbling at base
      roar: 1.0,           // DOMINANT - the waterfall roar
      rivulets: 0.0,       // No rivulets
    }
  },
  rainWindow: {
    eventRate: { min: 2, max: 8 },
    dropSize: { min: 0.28, max: 0.82 },
    hardness: 0.58,
    decayTime: 0.04,
    sinkMaterial: 0.5,
    turbulence: { low: 0.26, mid: 0.22, high: 0.06 },
    baseFreq: 2100,
    burstProbability: 0.06,
    burstCount: { min: 2, max: 3 },
    useSinkResonator: false,
    useGlassPane: true,
    // LAYER MIX - rain is hard drops + rivulets running down
    layers: {
      hardDrops: 0.32,     // Softer impacts on glass
      waterDrops: 0.42,    // More water-on-water pooling/plops
      turbulence: 0.18,    // Quiet broadband bed
      bubbling: 0.0,       // No bubbling
      roar: 0.0,           // No roar
      rivulets: 0.92,      // Running glass rivulets dominate
    }
  }
};

class WaterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    try {
      console.log('WaterProcessor: starting constructor');
      
      this.sampleRate = sampleRate || 48000;
      this.rng = mulberry32(Date.now());
      
      // Voice pool for droplets (hard surface)
      this.voicePool = [];
      this.maxVoices = 24;
      for (let i = 0; i < this.maxVoices; i++) {
        this.voicePool.push(new DropletVoice(this.sampleRate));
      }
      console.log('WaterProcessor: voice pool created');
      
      // Voice pool for water-into-water drops
      this.waterDropPool = [];
      this.maxWaterDropVoices = 24;
      for (let i = 0; i < this.maxWaterDropVoices; i++) {
        this.waterDropPool.push(new WaterIntoWaterVoice(this.sampleRate));
      }
      console.log('WaterProcessor: water drop pool created');
      
      // Turbulence bed
      this.turbulenceBed = new TurbulenceBed(this.sampleRate);
      console.log('WaterProcessor: turbulence bed created');
      
      // NEW LAYERS
      this.bubblingLayer = new BubblingLayer(this.sampleRate);
      this.roarLayer = new RoarLayer(this.sampleRate);
      this.rivuletLayer = new RivuletLayer(this.sampleRate);
      console.log('WaterProcessor: new layers created');

      // Layer band filters
      // Water drops: 2kHz - 16kHz
      this.waterDropHPFL = new BiquadFilter();
      this.waterDropHPFR = new BiquadFilter();
      this.waterDropLPFL = new BiquadFilter();
      this.waterDropLPFR = new BiquadFilter();
      this.waterDropHPFL.setHighpass(1000, 0.707, this.sampleRate);
      this.waterDropHPFR.setHighpass(1000, 0.707, this.sampleRate);
      this.waterDropLPFL.setLowpass(16000, 0.707, this.sampleRate);
      this.waterDropLPFR.setLowpass(16000, 0.707, this.sampleRate);

      // Bubbling: 250Hz - 2kHz
      this.bubblingHPFL = new BiquadFilter();
      this.bubblingHPFR = new BiquadFilter();
      this.bubblingLPFL = new BiquadFilter();
      this.bubblingLPFR = new BiquadFilter();
      this.bubblingHPFL.setHighpass(250, 0.707, this.sampleRate);
      this.bubblingHPFR.setHighpass(250, 0.707, this.sampleRate);
      this.bubblingLPFL.setLowpass(1500, 0.707, this.sampleRate);
      this.bubblingLPFR.setLowpass(1500, 0.707, this.sampleRate);
      
      // Glass pane resonator
      this.glassPane = new GlassPaneResonator(this.sampleRate);
      console.log('WaterProcessor: glass pane created');
      
      // Sink resonator (low modal ringing from sink basin)
      this.sinkModes = [];
      for (let i = 0; i < 3; i++) {
        this.sinkModes.push(new ModalResonator());
      }
    
      // Event scheduling
      this.samplesUntilNextEvent = 0;
      this.eventRate = 2; // events per second
      this.burstRemaining = 0;
      this.burstInterval = 0;
    
      // Current preset
      this.preset = 'tapDrips';
      this.presetParams = { ...WATER_PRESETS.tapDrips };
    
      // User-adjustable parameters
      this.intensity = 0.5;
      this.distance = 0.3;
      this.space = 0.3;
      this.dropSizeMacro = 0.5;
      this.hardnessMacro = 0.5;
      
      // Layer mix levels (user-adjustable)
      this.layerMix = {
        hardDrops: 0.7,
        waterDrops: 0.5,
        turbulence: 0.3,
        bubbling: 0.0,
        roar: 0.0,
        rivulets: 0.0,
      };

      // Layer density/activity controls
      this.layerDensity = {
        hardDrops: 0.5,
        waterDrops: 0.5,
        turbulence: 0.5,
        bubbling: 0.5,
        roar: 0.5,
        rivulets: 0.5,
      };

      // Hard bypass flags for continuous sources (CPU savings)
      this.layerBypass = {
        turbulence: false,
        bubbling: true,
        roar: true,
        rivulets: true,
      };
      
      // Water drop scheduling
      this.waterDropSamplesUntilNext = 0;
    
      // Distance filtering
      this.distanceFilterL = new OnePole();
      this.distanceFilterR = new OnePole();
    
      // Output smoothing
      this.outputSmoothL = new OnePole();
      this.outputSmoothR = new OnePole();
    
      // DC blocking
      this.dcBlockL = { x1: 0, y1: 0 };
      this.dcBlockR = { x1: 0, y1: 0 };
    
      // Parameter smoothing
      this.smoothedIntensity = 0.5;
      this.smoothedDistance = 0.3;
    
      // Debug stats
      this.stats = {
        activeVoices: 0,
        eventsPerSec: 0,
        eventCounter: 0,
        lastStatTime: 0,
      };
    
      // Fade envelope for start/stop
      // Start immediately for testing
      this.fadeGain = 0;
      this.fadeTarget = 1;  // Start playing immediately!
      this.fadeRate = 0.001; // ~20ms fade at 48kHz
    
      this.port.onmessage = (e) => this.handleMessage(e.data);
    
      // Initialize turbulence with preset values
      this.updateTurbulenceParams();
      this.updateBypassFlags();
    
      console.log('WaterProcessor: constructor complete!');
    } catch (err) {
      console.error('WaterProcessor constructor error:', err);
    }
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'setPreset':
        this.preset = data.preset;
        if (WATER_PRESETS[data.preset]) {
          this.presetParams = { ...WATER_PRESETS[data.preset] };
          // Copy layer mix from preset
          if (this.presetParams.layers) {
            this.layerMix = { ...this.presetParams.layers };
          }
          this.updateTurbulenceParams();
          this.updateLayerParams();
          this.updateBypassFlags();
        }
        break;
      case 'setParams':
        if (data.intensity !== undefined) this.intensity = data.intensity;
        if (data.distance !== undefined) this.distance = data.distance;
        if (data.space !== undefined) this.space = data.space;
        if (data.baseFreq !== undefined) this.presetParams.baseFreq = data.baseFreq;
        if (data.dropSize !== undefined) this.dropSizeMacro = data.dropSize;
        if (data.hardness !== undefined) this.hardnessMacro = data.hardness;
        if (data.rate !== undefined) {
          // Scale event rate based on macro
          const preset = this.presetParams;
          this.eventRate = preset.eventRate.min + data.rate * (preset.eventRate.max - preset.eventRate.min);
        }
        if (data.glassThickness !== undefined) {
          this.glassPane.setThickness(data.glassThickness);
        }
        this.updateTurbulenceParams();
        this.updateLayerParams();
        this.updateBypassFlags();
        break;
      case 'setLayerMix':
        // Individual layer mix controls
        if (data.hardDrops !== undefined) this.layerMix.hardDrops = data.hardDrops;
        if (data.waterDrops !== undefined) this.layerMix.waterDrops = data.waterDrops;
        if (data.turbulence !== undefined) this.layerMix.turbulence = data.turbulence;
        if (data.bubbling !== undefined) this.layerMix.bubbling = data.bubbling;
        if (data.roar !== undefined) this.layerMix.roar = data.roar;
        if (data.rivulets !== undefined) this.layerMix.rivulets = data.rivulets;
        this.updateLayerParams();
        this.updateBypassFlags();
        break;
      case 'setLayerDensity':
        if (data.hardDrops !== undefined) this.layerDensity.hardDrops = data.hardDrops;
        if (data.waterDrops !== undefined) this.layerDensity.waterDrops = data.waterDrops;
        if (data.turbulence !== undefined) this.layerDensity.turbulence = data.turbulence;
        if (data.bubbling !== undefined) this.layerDensity.bubbling = data.bubbling;
        if (data.roar !== undefined) this.layerDensity.roar = data.roar;
        if (data.rivulets !== undefined) this.layerDensity.rivulets = data.rivulets;
        this.updateLayerParams();
        this.updateBypassFlags();
        break;
      case 'setSeed':
        this.rng = mulberry32(data.seed);
        break;
      case 'start':
        console.log('WaterProcessor: received start message');
        this.fadeTarget = 1;
        this.fadeRate = 0.0001; // ~200ms fade at 48kHz
        break;
      case 'stop':
        console.log('WaterProcessor: received stop message');
        this.fadeTarget = 0;
        this.fadeRate = 0.0001;
        break;
      case 'getStats':
        this.port.postMessage({
          type: 'stats',
          activeVoices: this.stats.activeVoices,
          eventsPerSecLow: this.stats.eventsPerSec,
          eventsPerSecMid: this.stats.eventsPerSec,
          eventsPerSecHigh: this.stats.eventsPerSec,
        });
        break;
    }
  }
  
  updateLayerParams() {
    // Update layer-specific parameters based on current settings
    this.bubblingLayer.setParams(
      this.layerMix.bubbling * (0.5 + this.smoothedIntensity),
      0.5 + this.smoothedIntensity * 0.5,
      this.layerDensity.bubbling
    );
    this.roarLayer.setParams(
      this.layerMix.roar * (0.5 + this.smoothedIntensity),
      this.smoothedDistance,
      this.layerDensity.roar
    );
    this.rivuletLayer.setParams(
      this.layerMix.rivulets * (0.3 + this.smoothedIntensity * 0.7),
      this.layerDensity.rivulets
    );
  }

  updateBypassFlags() {
    const epsilon = 0.0001;
    this.layerBypass.turbulence = this.layerMix.turbulence <= epsilon || this.layerDensity.turbulence <= epsilon;
    this.layerBypass.bubbling = this.layerMix.bubbling <= epsilon || this.layerDensity.bubbling <= epsilon;
    this.layerBypass.roar = this.layerMix.roar <= epsilon || this.layerDensity.roar <= epsilon;
    this.layerBypass.rivulets = this.layerMix.rivulets <= epsilon || this.layerDensity.rivulets <= epsilon;
  }
  
  updateTurbulenceParams() {
    const turb = this.presetParams.turbulence;
    const intensityScale = 0.3 + this.smoothedIntensity * 1.4;
    
    // Distance affects spectral tilt (farther = darker)
    const tilt = -this.smoothedDistance * 0.5;
    
    this.turbulenceBed.setParams({
      lowGain: turb.low * intensityScale,
      midGain: turb.mid * intensityScale,
      highGain: turb.high * intensityScale * (1 - this.smoothedDistance * 0.5),
      roughness: 0.5,
      spectralTilt: tilt,
    });
  }
  
  scheduleDropletEvent() {
    const preset = this.presetParams;
    
    // Intensity affects rate (reduced scaling for sparser drops)
    const rateScale = 0.2 + this.smoothedIntensity * 0.8;
    const currentRate = this.eventRate * rateScale * this.layerDensity.hardDrops;
    
    // MINIMUM SPACING - real drips are sparse, not machine-gun
    // Research: real dripping tap has 100-500ms between drops typically
    const minSpacingMs = 100; // At least 100ms between drops for drips
    const minSpacingSamples = Math.floor(minSpacingMs * 0.001 * this.sampleRate);
    
    // Check for burst (clustering: pairs/triples then pause)
    if (this.burstRemaining > 0) {
      this.burstRemaining--;
      // Varied spacing within burst (not perfectly regular)
      const burstJitter = this.burstInterval * (0.3 + this.rng() * 0.7);
      this.samplesUntilNextEvent = Math.max(minSpacingSamples, Math.floor(burstJitter));
    } else {
      // Normal scheduling with MORE jitter variety
      // Research: regularity creates tonal feel
      const baseInterval = this.sampleRate / currentRate;
      
      // Non-uniform jitter distribution - more natural, more pauses
      // Research: regularity creates synthetic/tonal feel
      let jitterFactor;
      const jitterRand = this.rng();
      if (jitterRand < 0.4) {
        // Normal variation (40%)
        jitterFactor = 0.6 + this.rng() * 0.6;
      } else if (jitterRand < 0.6) {
        // Slightly quicker (20%)
        jitterFactor = 0.4 + this.rng() * 0.4;
      } else if (jitterRand < 0.85) {
        // Longer pause (25%)
        jitterFactor = 1.5 + this.rng() * 1.5;
      } else {
        // Much longer pause (15%) - natural silence
        jitterFactor = 3.0 + this.rng() * 3.0;
      }
      
      this.samplesUntilNextEvent = Math.max(
        minSpacingSamples, 
        Math.floor(baseInterval * jitterFactor)
      );
      
      // Maybe start a burst (clustering)
      // Research: drops come in pairs/triples, then a pause
      if (this.rng() < preset.burstProbability) {
        this.burstRemaining = Math.floor(
          preset.burstCount.min + this.rng() * (preset.burstCount.max - preset.burstCount.min)
        );
        // Tighter spacing within bursts
        this.burstInterval = this.sampleRate * (0.025 + this.rng() * 0.06);
      }
    }
    
    // Find free voice
    const voice = this.voicePool.find(v => !v.isActive());
    if (!voice) return;
    
    // Build trigger params with BETTER RANDOMIZATION
    // Research: randomize the right parameters, not just pitch
    const dropSize = preset.dropSize.min + 
      this.dropSizeMacro * (preset.dropSize.max - preset.dropSize.min);
    
    // Per-drop variations that affect character, not just pitch
    const dropSizeVar = dropSize + (this.rng() - 0.5) * 0.25;
    const hardnessVar = preset.hardness * this.hardnessMacro * (0.7 + this.rng() * 0.6);
    const decayVar = preset.decayTime * (0.5 + this.rng() * 1.0); // Wider decay range
    
    const triggerParams = {
      baseFreq: preset.baseFreq * (0.75 + this.rng() * 0.5), 
      dropSize: Math.max(0, Math.min(1, dropSizeVar)),
      hardness: hardnessVar,
      decayTime: decayVar,
      sinkMaterial: preset.sinkMaterial,
    };
    
    voice.trigger(triggerParams, this.rng);
    
    // Excite sink resonator if enabled
    if (preset.useSinkResonator && this.rng() > 0.7) {
      this.exciteSinkResonator(triggerParams.dropSize);
    }
    
    this.stats.eventCounter++;
  }
  
  exciteSinkResonator(amount) {
    const baseFreq = 180 + this.rng() * 40;
    const ratios = [1.0, 1.47, 2.09];
    
    for (let i = 0; i < this.sinkModes.length; i++) {
      this.sinkModes[i].trigger(
        baseFreq * ratios[i],
        amount * 0.15 * (1 - i * 0.25),
        0.3 + this.rng() * 0.2,
        this.sampleRate
      );
    }
  }
  
  scheduleWaterDropEvent() {
    const preset = this.presetParams;
    
    // Water drops are slightly slower rate than hard drops
    const rateScale = 0.15 + this.smoothedIntensity * 0.6;
    const requestedRate = this.eventRate * rateScale * 0.7 * this.layerDensity.waterDrops;
    const currentRate = Math.min(26, requestedRate);
    
    // Longer minimum spacing for water drops (softer, need more space)
    const minSpacingMs = 150;
    const minSpacingSamples = Math.floor(minSpacingMs * 0.001 * this.sampleRate);
    
    // Schedule next
    const baseInterval = this.sampleRate / Math.max(0.5, currentRate);
    
    // Non-uniform jitter - water drops are irregular
    let jitterFactor;
    const jitterRand = this.rng();
    if (jitterRand < 0.5) {
      jitterFactor = 0.7 + this.rng() * 0.6;
    } else if (jitterRand < 0.8) {
      jitterFactor = 1.5 + this.rng() * 1.5;
    } else {
      jitterFactor = 3.0 + this.rng() * 4.0; // Long pause
    }
    
    const activeWaterVoices = this.waterDropPool.reduce((count, voice) => count + (voice.isActive() ? 1 : 0), 0);
    const voicePressure = activeWaterVoices / this.maxWaterDropVoices;
    const pressureScale = voicePressure > 0.85 ? 1.6 : 1.0;

    this.waterDropSamplesUntilNext = Math.max(
      minSpacingSamples,
      Math.floor(baseInterval * jitterFactor * pressureScale)
    );
    
    // Find free voice (or steal oldest active voice if pool is full)
    let voice = this.waterDropPool.find(v => !v.isActive());
    if (!voice) {
      voice = this.waterDropPool.reduce((oldest, current) => {
        if (!oldest) return current;
        return current.age > oldest.age ? current : oldest;
      }, null);
    }
    if (!voice) return;
    
    // Water drops params - lower frequencies, longer decay, softer
    const dropSize = preset.dropSize.min + 
      this.dropSizeMacro * (preset.dropSize.max - preset.dropSize.min);
    
    const triggerParams = {
      baseFreq: preset.baseFreq * 0.5 * (0.6 + this.rng() * 0.8), // Lower freq
      dropSize: dropSize + (this.rng() - 0.5) * 0.3,
      decayTime: preset.decayTime * 1.5 * (0.7 + this.rng() * 0.6), // Longer decay
    };
    
    voice.trigger(triggerParams, this.rng);
  }
  
  dcBlock(input, state) {
    const y = input - state.x1 + 0.9975 * state.y1;
    state.x1 = input;
    state.y1 = y;
    return y;
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    
    const outL = output[0];
    const outR = output[1];
    const blockSize = outL.length;
    
    // Log once to verify process is called
    if (!this.processLogged) {
      console.log('WaterProcessor: process() running, fadeTarget:', this.fadeTarget);
      this.processLogged = true;
    }
    
    // Block-level parameter smoothing
    this.smoothedIntensity += (this.intensity - this.smoothedIntensity) * 0.001;
    this.smoothedDistance += (this.distance - this.smoothedDistance) * 0.001;
    
    // Distance filter coefficient (higher = more filtering)
    const distCoeff = 0.1 + this.smoothedDistance * 0.85;
    
    for (let i = 0; i < blockSize; i++) {
      // Fade envelope - linear for faster response
      if (this.fadeGain < this.fadeTarget) {
        this.fadeGain = Math.min(this.fadeGain + this.fadeRate, this.fadeTarget);
      } else if (this.fadeGain > this.fadeTarget) {
        this.fadeGain = Math.max(this.fadeGain - this.fadeRate, this.fadeTarget);
      }
      
      // Skip processing if faded out
      if (this.fadeGain < 0.0001) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      
      // Schedule droplet events (hard surface)
      if (this.layerMix.hardDrops > 0.01 && this.layerDensity.hardDrops > 0.01) {
        this.samplesUntilNextEvent--;
        if (this.samplesUntilNextEvent <= 0) {
          this.scheduleDropletEvent();
        }
      }
      
      // Schedule water-into-water drops
      if (this.layerMix.waterDrops > 0.01 && this.layerDensity.waterDrops > 0.01) {
        this.waterDropSamplesUntilNext--;
        if (this.waterDropSamplesUntilNext <= 0) {
          this.scheduleWaterDropEvent();
        }
      }
      
      // Process all active hard droplet voices
      let dropletSumL = 0;
      let dropletSumR = 0;
      let activeCount = 0;
      
      for (const voice of this.voicePool) {
        if (voice.isActive()) {
          const [vL, vR] = voice.process();
          dropletSumL += vL;
          dropletSumR += vR;
          activeCount++;
        }
      }
      
      // Process water-into-water drops
      let waterDropL = 0;
      let waterDropR = 0;
      
      for (const voice of this.waterDropPool) {
        if (voice.isActive()) {
          const [vL, vR] = voice.process();
          waterDropL += vL;
          waterDropR += vR;
          activeCount++;
        }
      }

      // Water drop bandpass: 2kHz - 16kHz
      waterDropL = this.waterDropLPFL.process(this.waterDropHPFL.process(waterDropL));
      waterDropR = this.waterDropLPFR.process(this.waterDropHPFR.process(waterDropR));
      
      // Process sink resonator modes
      let sinkSum = 0;
      for (const mode of this.sinkModes) {
        sinkSum += mode.process();
      }
      
      // Add sink resonator to both channels (reduced)
      dropletSumL += sinkSum * 0.1;
      dropletSumR += sinkSum * 0.1;
      
      // Process turbulence bed (hard bypass when mix/volume is zero)
      let turbL = 0;
      let turbR = 0;
      if (!this.layerBypass.turbulence) {
        [turbL, turbR] = this.turbulenceBed.process(this.rng);
      }
      
      // Process glass pane if enabled
      let glassOut = 0;
      if (this.presetParams.useGlassPane) {
        glassOut = this.glassPane.process((dropletSumL + dropletSumR) * 0.5);
      }
      
      // Process NEW LAYERS (hard bypass when mix/volume is zero)
      let bubbleL = 0;
      let bubbleR = 0;
      if (!this.layerBypass.bubbling) {
        [bubbleL, bubbleR] = this.bubblingLayer.process(this.rng);
      }

      let roarL = 0;
      let roarR = 0;
      if (!this.layerBypass.roar) {
        [roarL, roarR] = this.roarLayer.process(this.rng);
      }

      let rivuletL = 0;
      let rivuletR = 0;
      if (!this.layerBypass.rivulets) {
        [rivuletL, rivuletR] = this.rivuletLayer.process(this.rng);
      }

      // Bubbling bandpass: 250Hz - 2kHz
      const bubblingL = this.bubblingLPFL.process(this.bubblingHPFL.process(bubbleL));
      const bubblingR = this.bubblingLPFR.process(this.bubblingHPFR.process(bubbleR));
      
      // Mix all sources with layer levels
      const intensityScale = 0.5 + this.smoothedIntensity * 1.0;
      let mixL = (
        dropletSumL * this.layerMix.hardDrops * 0.6 +
        waterDropL * this.layerMix.waterDrops * 0.75 +
        turbL * this.layerMix.turbulence * this.layerDensity.turbulence * 0.7 +
        bubblingL * 0.75 +
        roarL * 0.8 +
        rivuletL * 0.4 +
        glassOut * 0.2
      ) * intensityScale;
      
      let mixR = (
        dropletSumR * this.layerMix.hardDrops * 0.6 +
        waterDropR * this.layerMix.waterDrops * 0.75 +
        turbR * this.layerMix.turbulence * this.layerDensity.turbulence * 0.7 +
        bubblingR * 0.75 +
        roarR * 0.8 +
        rivuletR * 0.4 +
        glassOut * 0.2
      ) * intensityScale;
      
      // Distance filtering (lowpass)
      mixL = this.distanceFilterL.process(mixL, distCoeff);
      mixR = this.distanceFilterR.process(mixR, distCoeff);

      if (!Number.isFinite(mixL) || !Number.isFinite(mixR)) {
        mixL = 0;
        mixR = 0;
      }
      
      // DC blocking
      mixL = this.dcBlock(mixL, this.dcBlockL);
      mixR = this.dcBlock(mixR, this.dcBlockR);
      
      // Apply fade envelope and output (boosted gain)
      outL[i] = mixL * this.fadeGain * 0.8;
      outR[i] = mixR * this.fadeGain * 0.8;
      
      // Update stats
      this.stats.activeVoices = activeCount;
    }
    
    // Update events per second stat
    const now = currentTime;
    if (now - this.stats.lastStatTime >= 1.0) {
      this.stats.eventsPerSec = this.stats.eventCounter;
      this.stats.eventCounter = 0;
      this.stats.lastStatTime = now;
    }
    
    return true;
  }
}

registerProcessor('water-processor', WaterProcessor);
