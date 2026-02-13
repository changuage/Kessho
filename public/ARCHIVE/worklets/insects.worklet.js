/**
 * Insects Synthesis AudioWorklet Processor
 * 
 * High-quality procedural insect chorus synthesis with:
 * - Cricket: Pulse train stridulation with chirps
 * - Katydid: Pulse width changes + antiphonal chorus
 * - Cicada: Tymbal click train with cavity resonance
 * - Fly/Bee: Wingbeat harmonics with Doppler motion
 * 
 * Quality-first: Band-limited tones, behavioral structure, spatial distribution
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

// Biquad filter
class BiquadFilter {
  constructor() {
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
  }
  
  setLowpass(freq, q, sampleRate) {
    const w0 = 2 * Math.PI * Math.min(freq, sampleRate * 0.45) / sampleRate;
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
    const w0 = 2 * Math.PI * Math.min(freq, sampleRate * 0.45) / sampleRate;
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
    const w0 = 2 * Math.PI * Math.min(freq, sampleRate * 0.45) / sampleRate;
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

// Band-limited oscillator using polynomial anti-aliasing (polyBLEP)
class BandLimitedOsc {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.phase = 0;
    this.frequency = 440;
    this.phaseIncrement = 0;
  }
  
  setFrequency(freq) {
    this.frequency = Math.min(freq, this.sampleRate * 0.45);
    this.phaseIncrement = this.frequency / this.sampleRate;
  }
  
  // PolyBLEP correction for aliasing near discontinuities
  polyBlep(t) {
    const dt = this.phaseIncrement;
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    } else if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  }
  
  // Sine wave (no anti-aliasing needed)
  sine() {
    const out = Math.sin(this.phase * 2 * Math.PI);
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= 1;
    return out;
  }
  
  // Band-limited square wave
  square() {
    const raw = this.phase < 0.5 ? 1 : -1;
    let out = raw;
    out -= this.polyBlep(this.phase);
    out += this.polyBlep((this.phase + 0.5) % 1);
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= 1;
    return out;
  }
  
  // Band-limited pulse with variable width
  pulse(width) {
    const w = Math.max(0.01, Math.min(0.99, width));
    const raw = this.phase < w ? 1 : -1;
    let out = raw;
    out -= this.polyBlep(this.phase);
    out += this.polyBlep((this.phase + (1 - w)) % 1);
    this.phase += this.phaseIncrement;
    if (this.phase >= 1) this.phase -= 1;
    return out;
  }
  
  reset() {
    this.phase = 0;
  }
}

// ============================================
// CRICKET ENGINE
// Research-based: Exciter (tooth strikes) → Resonator (wing harp)
// Tooth-strike rate ~5000/sec ≈ 5 kHz carrier frequency
// Temperature affects chirp rate (Dolbear's law)
// ============================================
class CricketVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Wing harp resonator (the main tone-producing structure)
    // Research: wing resonances shape tonal purity
    this.wingResonator = new BiquadFilter();
    this.wingResonator2 = new BiquadFilter(); // Second formant
    
    // Tooth-strike exciter (pulse train at carrier frequency)
    this.toothPhase = 0;
    this.toothFreq = 5000; // Fundamental from tooth-strike rate
    
    // State machine: chirp / silence
    this.state = 'chirping';
    this.stateTimer = 0;
    this.chirpDuration = sampleRate * 0.4;
    this.silenceDuration = sampleRate * 0.2;
    
    // Within-chirp pulse grouping (syllables)
    this.pulsePhase = 0;
    this.pulseRate = 30; // syllables per second
    this.pulseEnv = 0;
    
    // Per-voice variation
    this.baseFreq = 5000;
    this.freqOffset = 0;
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
    
    // Temperature-based rate
    this.temperature = 0.5;
    
    // Micro-timing jitter for naturalism
    this.jitterAmount = 0;
    this.freqMod = 0;
    
    // Exciter noise component (scraper friction)
    this.noiseState = 0;
  }
  
  setParams(params, rng) {
    this.temperature = params.temperature || 0.5;
    
    // Dolbear's law: chirps/sec ≈ (T-40)/4 for tree crickets
    // Higher temp = faster chirping
    const chirpRate = 0.6 + this.temperature * 2.0;
    this.chirpDuration = Math.floor(this.sampleRate * (0.25 + rng() * 0.4) / chirpRate);
    this.silenceDuration = Math.floor(this.sampleRate * (0.15 + rng() * 0.25) / chirpRate);
    
    // Pulse/syllable rate within chirp
    this.pulseRate = 20 + this.temperature * 15 + rng() * 8;
    
    // Carrier frequency from tooth-strike rate (~5 kHz typical)
    this.baseFreq = 4500 + rng() * 800;
    this.toothFreq = this.baseFreq;
    this.freqOffset = (rng() - 0.5) * 150;
    
    // Configure wing harp resonators (high Q for tonal purity)
    this.wingResonator.setBandpass(this.baseFreq + this.freqOffset, 12, this.sampleRate);
    // Second formant slightly higher
    this.wingResonator2.setBandpass((this.baseFreq + this.freqOffset) * 1.5, 8, this.sampleRate);
    
    // Spatial position
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.8;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.7;
    this.volume = 1 - this.distance * 0.6;
    
    // Jitter for naturalism
    this.jitterAmount = 0.02 + rng() * 0.03;
  }
  
  process(rng) {
    this.stateTimer++;
    
    if (this.state === 'silence') {
      if (this.stateTimer >= this.silenceDuration) {
        this.state = 'chirping';
        this.stateTimer = 0;
        this.pulsePhase = 0;
        // Timing jitter between chirps
        this.silenceDuration = Math.floor(
          this.sampleRate * (0.15 + rng() * 0.25) / (0.6 + this.temperature * 2.0)
        );
      }
      return [0, 0];
    }
    
    if (this.stateTimer >= this.chirpDuration) {
      this.state = 'silence';
      this.stateTimer = 0;
      this.chirpDuration = Math.floor(
        this.sampleRate * (0.25 + rng() * 0.4) / (0.6 + this.temperature * 2.0)
      );
      return [0, 0];
    }
    
    // Syllable/pulse envelope
    this.pulsePhase += this.pulseRate / this.sampleRate;
    if (this.pulsePhase >= 1) {
      this.pulsePhase -= 1;
      // Subtle frequency variation per syllable
      this.freqMod = (rng() - 0.5) * 80;
    }
    
    // Pulse envelope shape (fast attack, medium decay like real stridulation)
    const syllablePos = this.pulsePhase;
    const pulseEnvTarget = syllablePos < 0.15 ? syllablePos / 0.15 : 
                           syllablePos < 0.4 ? 1 : 
                           Math.max(0, 1 - (syllablePos - 0.4) * 2.5);
    this.pulseEnv += (pulseEnvTarget - this.pulseEnv) * 0.15;
    
    // Tooth-strike exciter: rapid impulse train at carrier frequency
    // Plus small noise for scraper friction
    const currentFreq = this.toothFreq + this.freqOffset + this.freqMod;
    this.toothPhase += currentFreq / this.sampleRate;
    if (this.toothPhase >= 1) this.toothPhase -= 1;
    
    // Exciter: narrow pulse + tiny noise (tooth impacts + friction)
    const toothPulse = this.toothPhase < 0.1 ? 1 : 0;
    this.noiseState = this.noiseState * 0.7 + (rng() * 2 - 1) * 0.3;
    const exciter = (toothPulse * 0.8 + this.noiseState * 0.15) * this.pulseEnv;
    
    // Wing harp resonators (creates the pure tone character)
    const resonated1 = this.wingResonator.process(exciter);
    const resonated2 = this.wingResonator2.process(exciter);
    
    const sample = (resonated1 * 0.7 + resonated2 * 0.2) * this.volume * 1.2;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
}

// ============================================
// KATYDID ENGINE
// Research-based: Broadband/harsh calls (not pure tones)
// Energy 3-5 kHz extending to 20+ kHz
// Two-group antiphonal alternation in choruses
// Temperature slows tempo
// ============================================
class KatydidVoice {
  constructor(sampleRate, id, group) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.group = group; // 0 or 1 for antiphonal alternation
    this.active = true;
    
    // Noise-based broadband exciter (katydids are harsh, not pure)
    this.noiseState = 0;
    this.noiseState2 = 0;
    
    // Multiple bandpass filters for broadband spectral shaping
    // Research: 3-5 kHz emphasis, extending to 20+ kHz
    this.bandpass1 = new BiquadFilter(); // Low band ~3 kHz
    this.bandpass2 = new BiquadFilter(); // Mid band ~5 kHz  
    this.bandpass3 = new BiquadFilter(); // High band ~8 kHz
    this.bandpass4 = new BiquadFilter(); // Ultra high ~12 kHz
    
    // Harshness filter (adds "rasp")
    this.raspFilter = new BiquadFilter();
    
    // State machine for chirp timing
    this.state = 'chirping'; // Start immediately
    this.stateTimer = 0;
    this.chirpDuration = 0;
    this.silenceDuration = 0;
    
    // Within-chirp pulse timing (the repeated "ka-ty-did" phrase)
    this.pulsePhase = 0;
    this.pulseRate = 15; // Slower than crickets
    this.pulseEnv = 0;
    
    // Voice variation
    this.baseFreq = 4000;
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
    
    this.temperature = 0.5;
    this.antiphonyDelay = 0;
  }
  
  setParams(params, rng) {
    this.temperature = params.temperature || 0.5;
    this.antiphonyDelay = Math.floor(this.sampleRate * (params.antiphony || 0.35));
    
    // Temperature slows tempo (research finding)
    const chirpRate = 0.4 + this.temperature * 1.0;
    this.chirpDuration = Math.floor(this.sampleRate * (0.3 + rng() * 0.3) / chirpRate);
    this.silenceDuration = Math.floor(this.sampleRate * (0.25 + rng() * 0.35) / chirpRate);
    
    // Add antiphony offset for group 1 (alternating groups)
    if (this.group === 1) {
      this.stateTimer = -this.antiphonyDelay;
      this.state = 'silence';
    }
    
    // Pulse rate for internal rhythm
    this.pulseRate = 12 + this.temperature * 8 + rng() * 5;
    
    // Base frequency with variation
    this.baseFreq = 3500 + rng() * 600;
    
    // Configure broadband filters (research: 3-5 kHz emphasis, extends to 20+ kHz)
    this.bandpass1.setBandpass(this.baseFreq * 0.85 + rng() * 200, 3, this.sampleRate);
    this.bandpass2.setBandpass(this.baseFreq * 1.2 + rng() * 300, 2.5, this.sampleRate);
    this.bandpass3.setBandpass(this.baseFreq * 2.0 + rng() * 500, 2, this.sampleRate);
    this.bandpass4.setBandpass(Math.min(this.baseFreq * 3.0, this.sampleRate * 0.4), 1.5, this.sampleRate);
    
    // Rasp/harshness emphasis
    this.raspFilter.setHighpass(2000, 0.5, this.sampleRate);
    
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.6;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.6;
    this.volume = 1 - this.distance * 0.5;
  }
  
  process(rng) {
    this.stateTimer++;
    
    if (this.state === 'silence') {
      if (this.stateTimer >= this.silenceDuration) {
        this.state = 'chirping';
        this.stateTimer = 0;
        this.pulsePhase = 0;
      }
      return [0, 0];
    }
    
    if (this.stateTimer >= this.chirpDuration) {
      this.state = 'silence';
      this.stateTimer = 0;
      this.chirpDuration = Math.floor(
        this.sampleRate * (0.3 + rng() * 0.3) / (0.4 + this.temperature * 1.0)
      );
      return [0, 0];
    }
    
    // Pulse envelope (harsh bursts)
    this.pulsePhase += this.pulseRate / this.sampleRate;
    if (this.pulsePhase >= 1) {
      this.pulsePhase -= 1;
    }
    
    // Sharp attack, quick decay for each pulse (harsh character)
    const pulsePos = this.pulsePhase;
    const pulseEnvTarget = pulsePos < 0.08 ? pulsePos / 0.08 : 
                           pulsePos < 0.25 ? 1 : 
                           Math.max(0, 1 - (pulsePos - 0.25) * 3);
    this.pulseEnv += (pulseEnvTarget - this.pulseEnv) * 0.2;
    
    // Broadband noise excitation (NOT pure tone - research finding)
    const noise1 = rng() * 2 - 1;
    const noise2 = rng() * 2 - 1;
    this.noiseState = this.noiseState * 0.3 + noise1 * 0.7;
    this.noiseState2 = this.noiseState2 * 0.5 + noise2 * 0.5;
    
    const exciter = (this.noiseState * 0.6 + this.noiseState2 * 0.4) * this.pulseEnv;
    
    // Multi-band filtering (creates broadband spectral shape)
    const band1 = this.bandpass1.process(exciter) * 0.5;
    const band2 = this.bandpass2.process(exciter) * 0.7;
    const band3 = this.bandpass3.process(exciter) * 0.4;
    const band4 = this.bandpass4.process(exciter) * 0.25;
    
    // Add harshness
    const rasp = this.raspFilter.process(exciter) * 0.15;
    
    const sample = (band1 + band2 + band3 + band4 + rasp) * this.volume * 0.6;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
}

// ============================================
// CICADA ENGINE  
// Research-based: Continuous buzzing drone
// Amplitude-modulated noise through resonant cavity
// At high rates becomes continuous buzz, not discrete clicks
// ============================================
class CicadaVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Amplitude modulation (tymbal muscle rate)
    this.modPhase = 0;
    this.modRate = 80; // Hz - creates the buzzing texture
    
    // Noise source for excitation
    this.noiseState = 0;
    
    // Resonant cavity filters (bandpass)
    this.bp1 = new BiquadFilter();
    this.bp2 = new BiquadFilter();
    this.bp3 = new BiquadFilter();
    
    // Voice parameters
    this.baseFreq = 4500;
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
    this.temperature = 0.5;
    
    // Slow amplitude drift (breathing/pulsing)
    this.breathPhase = 0;
    this.breathRate = 0.3;
  }
  
  setParams(params, rng) {
    this.temperature = params.temperature || 0.5;
    
    // Modulation rate: 40-200 Hz creates different buzz textures
    const baseRate = 40 + (params.clickRate || 0.5) * 160;
    this.modRate = baseRate * (0.6 + this.temperature * 0.8);
    
    // Base resonant frequency
    this.baseFreq = 3500 + rng() * 1500 + this.temperature * 500;
    
    // Configure resonant filters for abdominal cavity
    // Multiple peaks create the characteristic cicada timbre
    this.bp1.setBandpass(this.baseFreq * (0.95 + rng() * 0.1), 8, this.sampleRate);
    this.bp2.setBandpass(this.baseFreq * 1.5 * (0.9 + rng() * 0.2), 6, this.sampleRate);  
    this.bp3.setBandpass(this.baseFreq * 2.2 * (0.85 + rng() * 0.3), 4, this.sampleRate);
    
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.8;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.8;
    this.volume = 1 - this.distance * 0.4;
    
    this.breathPhase = rng();
    this.breathRate = 0.15 + rng() * 0.3;
  }
  
  process(rng) {
    // Modulation oscillator (creates the buzzing)
    this.modPhase += this.modRate / this.sampleRate;
    if (this.modPhase >= 1) this.modPhase -= 1;
    
    // Buzz envelope - not a clean sine, more like rectified
    const modWave = Math.sin(this.modPhase * 2 * Math.PI);
    const buzzEnv = 0.5 + 0.5 * Math.abs(modWave); // Always positive, pulses
    
    // Slow breathing modulation
    this.breathPhase += this.breathRate / this.sampleRate;
    if (this.breathPhase >= 1) this.breathPhase -= 1;
    const breathMod = 0.7 + 0.3 * Math.sin(this.breathPhase * 2 * Math.PI);
    
    // Noise excitation
    this.noiseState = this.noiseState * 0.3 + (rng() * 2 - 1) * 0.7;
    const exciter = this.noiseState * buzzEnv * breathMod;
    
    // Filter through resonant cavity
    const r1 = this.bp1.process(exciter);
    const r2 = this.bp2.process(exciter);
    const r3 = this.bp3.process(exciter);
    
    // Sum with decreasing levels for higher modes
    const resonance = r1 * 1.0 + r2 * 0.6 + r3 * 0.3;
    
    // Output
    const sample = resonance * this.volume * 0.35;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
}

// ============================================
// FLY/BEE ENGINE
// Research-based: Wingbeat fundamental as harmonic series
// Fly: ~190 Hz, Bee: ~230 Hz
// Amplitude/spectral instability from micro-movements
// Swarm: dense bed + foreground individuals with motion/Doppler
// ============================================
class FlyBeeVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Wingbeat fundamental oscillator
    this.wingPhase = 0;
    this.wingFreq = 190; // Research: ~190 Hz for fly
    
    // Harmonic amplitudes (research: harmonics from wing oscillation)
    // Amplitude instability modeled with per-harmonic jitter
    this.harmonicAmps = [1.0, 0.7, 0.45, 0.3, 0.4, 0.2];
    this.harmonicJitter = [0, 0, 0, 0, 0, 0];
    
    // Spectral notch filter (radiation pattern changes)
    this.notchFilter = new BiquadFilter();
    this.notchFreq = 500;
    this.notchTarget = 500;
    this.notchUpdateCounter = 0;
    
    // Amplitude modulation (wing beat variation)
    this.slowLfoPhase = 0;
    this.fastLfoPhase = 0;
    this.slowLfoRate = 0.25; // Slow flight pattern changes
    this.fastLfoRate = 7; // Flutter/instability
    
    // Motion state for Doppler
    this.position = { x: 0, y: 0, z: 1 };
    this.velocity = { x: 0, y: 0, z: 0 };
    
    // Parameters
    this.pan = 0;
    this.distance = 0.5;
    this.volume = 1;
    this.motionEnabled = false;
    this.isClose = false;
    this.isBee = false;
  }
  
  setParams(params, rng) {
    this.isBee = params.isBee || false;
    
    // Research: Fly ~190 Hz, Bee ~230 Hz fundamental
    this.wingFreq = this.isBee ? (225 + rng() * 20) : (185 + rng() * 15);
    
    // Harmonic balance differs between fly and bee
    // Research: bee has stronger 5th harmonic
    if (this.isBee) {
      this.harmonicAmps = [1.0, 0.38, 0.18, 0.1, 0.22, 0.08];
    } else {
      this.harmonicAmps = [1.0, 0.46, 0.22, 0.12, 0.1, 0.05];
    }
    
    // Initialize jitter for each harmonic
    for (let i = 0; i < 6; i++) {
      this.harmonicJitter[i] = rng() * 0.3;
    }
    
    // Position and motion
    this.isClose = params.isClose || false;
    this.motionEnabled = this.isClose && (params.motion || false);
    
    if (this.isClose) {
      this.distance = 0.1 + rng() * 0.25;
      this.position = {
        x: (rng() - 0.5) * 1.5,
        y: (rng() - 0.5) * 1.5,
        z: this.distance
      };
    } else {
      this.distance = 0.5 + rng() * 0.4;
      this.position = {
        x: (rng() - 0.5) * 3,
        y: (rng() - 0.5) * 2,
        z: this.distance
      };
    }
    
    this.velocity = {
      x: (rng() - 0.5) * 0.0015,
      y: (rng() - 0.5) * 0.001,
      z: (rng() - 0.5) * 0.0005
    };
    
    // LFO rates for amplitude instability
    this.slowLfoPhase = rng();
    this.fastLfoPhase = rng();
    this.slowLfoRate = 0.12 + rng() * 0.2;
    this.fastLfoRate = 4 + rng() * 5;
    
    this.volume = 1 - this.distance * 0.5;
    
    // Notch frequency (spectral notch from radiation pattern)
    this.notchFreq = 400 + rng() * 500;
    this.notchTarget = this.notchFreq;
    this.notchFilter.setBandpass(this.notchFreq, 3, this.sampleRate);
  }
  
  process(rng) {
    // Motion update for Doppler effect
    if (this.motionEnabled) {
      // Random walk acceleration
      this.velocity.x += (rng() - 0.5) * 0.00003;
      this.velocity.y += (rng() - 0.5) * 0.00002;
      this.velocity.z += (rng() - 0.5) * 0.00001;
      
      // Damping
      this.velocity.x *= 0.9998;
      this.velocity.y *= 0.9998;
      this.velocity.z *= 0.9999;
      
      // Update position
      this.position.x += this.velocity.x;
      this.position.y += this.velocity.y;
      this.position.z += this.velocity.z;
      
      // Bounds
      this.position.x = Math.max(-2, Math.min(2, this.position.x));
      this.position.y = Math.max(-1.5, Math.min(1.5, this.position.y));
      this.position.z = Math.max(0.08, Math.min(1.2, this.position.z));
      
      this.distance = this.position.z;
    }
    
    // Amplitude modulation (flight instability)
    this.slowLfoPhase += this.slowLfoRate / this.sampleRate;
    if (this.slowLfoPhase >= 1) this.slowLfoPhase -= 1;
    this.fastLfoPhase += this.fastLfoRate / this.sampleRate;
    if (this.fastLfoPhase >= 1) this.fastLfoPhase -= 1;
    
    const slowMod = Math.sin(this.slowLfoPhase * 2 * Math.PI);
    const fastMod = Math.sin(this.fastLfoPhase * 2 * Math.PI);
    const ampMod = 0.88 + slowMod * 0.08 + fastMod * 0.04;
    
    // Doppler shift from velocity (approaching = higher pitch)
    let dopplerShift = 1;
    if (this.motionEnabled) {
      // Radial velocity affects pitch
      dopplerShift = 1 + this.velocity.x * 140;
    }
    
    // Generate harmonics (wingbeat as harmonic series)
    this.wingPhase += (this.wingFreq * dopplerShift) / this.sampleRate;
    if (this.wingPhase >= 1) this.wingPhase -= 1;
    
    let sample = 0;
    const basePhase = this.wingPhase * 2 * Math.PI;
    
    for (let i = 0; i < 6; i++) {
      // Per-harmonic amplitude jitter (instability)
      this.harmonicJitter[i] += (rng() - 0.5) * 0.02;
      this.harmonicJitter[i] *= 0.98;
      
      const jitteredAmp = this.harmonicAmps[i] * (1 + this.harmonicJitter[i]);
      sample += Math.sin(basePhase * (i + 1)) * jitteredAmp;
    }
    
    // Apply amplitude modulation
    sample *= ampMod;
    
    // Moving spectral notch (updated sparsely to avoid zipper artifacts)
    this.notchUpdateCounter++;
    if (this.notchUpdateCounter >= 64) {
      this.notchUpdateCounter = 0;
      this.notchTarget += (rng() - 0.5) * 5;
      this.notchTarget = Math.max(320, Math.min(1200, this.notchTarget));
      this.notchFreq += (this.notchTarget - this.notchFreq) * 0.08;
      this.notchFilter.setBandpass(this.notchFreq, 2.4, this.sampleRate);
    }
    
    // Apply notch via subtraction
    const notched = sample - this.notchFilter.process(sample) * 0.35;
    
    // Volume based on distance
    this.volume = 1 - this.distance * 0.5;
    const output = notched * this.volume * 0.14;
    
    // Pan from position
    this.pan = Math.max(-1, Math.min(1, this.position.x * 0.8));
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    
    // High frequency rolloff with distance
    const distanceFilter = 1 - this.distance * 0.25;
    
    return [
      output * Math.cos(panAngle) * distanceFilter,
      output * Math.sin(panAngle) * distanceFilter
    ];
  }
}

// ============================================
// TREE CRICKET (Oecanthus) ENGINE
// "Snowy Tree Cricket" - extremely pure continuous trill
// Almost a pure sine wave at ~2-3 kHz
// Very peaceful, metronomic quality
// ============================================
class TreeCricketVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Main oscillator - nearly pure tone
    this.phase = 0;
    this.freq = 2500; // ~2-3 kHz typical
    
    // Very subtle amplitude modulation (wing stroke rate)
    this.ampModPhase = 0;
    this.ampModRate = 36; // Wing strokes per second
    
    // Slight frequency wobble (natural variation)
    this.freqLfoPhase = 0;
    this.freqLfoRate = 0.15;
    this.freqLfoDepth = 2; // Hz variation

    // Trill phrasing for less pure-tone fatigue
    this.trillPhase = 0;
    this.trillRate = 24;

    // Phrase breaks (on/off) so it is not a continuous tone
    this.isResting = false;
    this.phaseTimer = 0;
    this.onSamples = Math.floor(this.sampleRate * 1.4);
    this.offSamples = Math.floor(this.sampleRate * 0.95);
    this.phraseGain = 1;
    this.phraseTarget = 1;
    this.attackSlew = 0.002;
    this.releaseSlew = 0.00045;
    
    // Voice parameters
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
    this.temperature = 0.5;
  }
  
  setParams(params, rng) {
    this.temperature = params.temperature || 0.5;
    
    // Frequency varies with temperature (thermometer cricket!)
    // Research: chirp rate correlates with temperature
    // Approx: T(°F) = 40 + (chirps in 13 sec)
    this.freq = 2300 + this.temperature * 550 + (rng() - 0.5) * 120;
    
    // Wing stroke rate also temperature-dependent
    this.ampModRate = 28 + this.temperature * 18;
    
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.8;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.8;
    this.volume = 1 - this.distance * 0.45;
    
    this.freqLfoPhase = rng();
    this.freqLfoRate = 0.08 + rng() * 0.12;
    this.freqLfoDepth = 1.2 + rng() * 1.6;
    this.trillRate = 18 + this.temperature * 10;
    this.onSamples = Math.floor(this.sampleRate * (0.9 + rng() * 0.8));
    this.offSamples = Math.floor(this.sampleRate * (0.8 + rng() * 0.9));
    this.phaseTimer = 0;
    this.isResting = false;
    this.phraseGain = 1;
    this.phraseTarget = 1;
  }
  
  process(rng) {
    this.phaseTimer++;
    if (this.isResting && this.phaseTimer >= this.offSamples) {
      this.isResting = false;
      this.phaseTimer = 0;
      this.phraseTarget = 1;
    } else if (!this.isResting && this.phaseTimer >= this.onSamples) {
      this.isResting = true;
      this.phaseTimer = 0;
      this.phraseTarget = 0;
    }

    const slew = this.phraseTarget > this.phraseGain ? this.attackSlew : this.releaseSlew;
    this.phraseGain += (this.phraseTarget - this.phraseGain) * slew;
    if (this.isResting && this.phraseGain < 0.00005) {
      return [0, 0];
    }

    // Slow frequency drift
    this.freqLfoPhase += this.freqLfoRate / this.sampleRate;
    if (this.freqLfoPhase >= 1) this.freqLfoPhase -= 1;
    const freqMod = Math.sin(this.freqLfoPhase * 2 * Math.PI) * this.freqLfoDepth;
    
    // Main oscillator - very pure tone
    const currentFreq = this.freq + freqMod;
    this.phase += currentFreq / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;
    
    // Nearly pure sine with tiny bit of 2nd harmonic for warmth
    let sample = Math.sin(this.phase * 2 * Math.PI);
    sample += Math.sin(this.phase * 4 * Math.PI) * 0.02;
    
    // Subtle amplitude modulation from wing strokes
    this.ampModPhase += this.ampModRate / this.sampleRate;
    if (this.ampModPhase >= 1) this.ampModPhase -= 1;
    const ampMod = 0.9 + 0.1 * Math.sin(this.ampModPhase * 2 * Math.PI);

    // Gentle trill pulse to avoid constant piercing tone
    this.trillPhase += this.trillRate / this.sampleRate;
    if (this.trillPhase >= 1) this.trillPhase -= 1;
    const trillEnv = 0.65 + 0.35 * Math.max(0, Math.sin(this.trillPhase * 2 * Math.PI));
    
    sample *= ampMod * trillEnv * this.volume * 0.14 * this.phraseGain;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      sample * Math.cos(panAngle),
      sample * Math.sin(panAngle)
    ];
  }
}

// ============================================
// GRASSHOPPER ENGINE
// Leg-against-wing stridulation (comb-and-file)
// Scratchy, rasping quality with rhythmic pulses
// Different from cricket's wing-to-wing mechanism
// ============================================
class GrasshopperVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Leg stroke timing
    this.strokePhase = 0;
    this.strokeRate = 15; // Strokes per second
    this.strokeEnv = 0;
    
    // Within each stroke: rapid tooth impacts
    this.toothPhase = 0;
    this.toothRate = 800; // Teeth hitting per second during stroke
    
    // Noise + filtered resonance
    this.noiseState = 0;
    this.resonator = new BiquadFilter();
    this.hpf = new BiquadFilter();
    
    // Voice parameters
    this.baseFreq = 8000;
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
  }
  
  setParams(params, rng) {
    const temperature = params.temperature || 0.5;
    
    // Stroke rate: 10-25 per second
    this.strokeRate = 10 + temperature * 15 + (rng() - 0.5) * 5;
    
    // Tooth rate varies
    this.toothRate = 600 + rng() * 400;
    
    // Resonant frequency (leg/wing resonance)
    this.baseFreq = 6000 + rng() * 4000;
    this.resonator.setBandpass(this.baseFreq, 3, this.sampleRate);
    this.hpf.setHighpass(2000, 0.7, this.sampleRate);
    
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.8;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.8;
    this.volume = 1 - this.distance * 0.4;
    
    this.strokePhase = rng(); // Desync individuals
  }
  
  process(rng) {
    // Leg stroke envelope (on-off rhythm)
    this.strokePhase += this.strokeRate / this.sampleRate;
    if (this.strokePhase >= 1) this.strokePhase -= 1;
    
    // Active during first ~60% of stroke cycle
    const strokeActive = this.strokePhase < 0.6;
    const targetEnv = strokeActive ? 1 : 0;
    this.strokeEnv = this.strokeEnv * 0.995 + targetEnv * 0.005;
    
    // Tooth impacts during active stroke
    this.toothPhase += this.toothRate / this.sampleRate;
    let toothImpulse = 0;
    if (this.toothPhase >= 1) {
      this.toothPhase -= 1;
      toothImpulse = 0.5 + rng() * 0.5; // Variable tooth contact
    }
    
    // Generate scratchy sound: impulses + noise
    this.noiseState = this.noiseState * 0.4 + (rng() * 2 - 1) * 0.6;
    const exciter = (toothImpulse * 0.6 + this.noiseState * 0.4) * this.strokeEnv;
    
    // Filter through leg/wing resonance
    let sample = this.resonator.process(exciter);
    sample = this.hpf.process(sample); // Remove low rumble
    
    const output = sample * this.volume * 0.3;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      output * Math.cos(panAngle),
      output * Math.sin(panAngle)
    ];
  }
}

// ============================================
// MOSQUITO ENGINE
// High-pitched whine from wingbeat (~350-600 Hz female)
// Natural pitch wobble and Doppler from flight path
// Distinctive annoying "eeeeee" quality
// ============================================
class MosquitoVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Wing oscillator
    this.phase = 0;
    this.freq = 450; // ~400-600 Hz typical female
    
    // Flight path (circular/erratic motion for Doppler)
    this.flightPhase = 0;
    this.flightRate = 0.3; // Slow circling
    this.flightRadius = 0.5;
    
    // Pitch instability (natural variation)
    this.pitchWobblePhase = 0;
    this.pitchWobbleRate = 8; // Fast micro-variations
    this.pitchWobbleDepth = 7; // Hz
    
    // Harmonics
    this.harmonicAmps = [1.0, 0.22, 0.08, 0.03];
    
    // Voice parameters
    this.pan = 0;
    this.distance = 0.5;
    this.volume = 1;
    this.isClose = false;
  }
  
  setParams(params, rng) {
    // Female mosquitoes: 350-600 Hz
    this.freq = 420 + rng() * 140;
    
    this.isClose = params.isClose || (rng() < 0.3);
    
    if (this.isClose) {
      this.distance = 0.1 + rng() * 0.2;
      this.flightRadius = 0.22 + rng() * 0.22;
      this.flightRate = 0.26 + rng() * 0.2; // Faster when close
    } else {
      this.distance = 0.5 + rng() * 0.4;
      this.flightRadius = 0.8 + rng() * 0.5;
      this.flightRate = 0.1 + rng() * 0.14;
    }
    
    this.pan = (rng() - 0.5) * 1.6;
    this.volume = 1 - this.distance * 0.5;
    
    this.flightPhase = rng();
    this.pitchWobblePhase = rng();
  }
  
  process(rng) {
    // Flight path (affects pan and Doppler)
    this.flightPhase += this.flightRate / this.sampleRate;
    if (this.flightPhase >= 1) this.flightPhase -= 1;
    
    const flightX = Math.sin(this.flightPhase * 2 * Math.PI) * this.flightRadius;
    const flightY = Math.cos(this.flightPhase * 2 * Math.PI) * this.flightRadius * 0.5;
    
    // Doppler shift from lateral flight velocity
    const flightVelX = Math.cos(this.flightPhase * 2 * Math.PI) * this.flightRadius * this.flightRate * 2 * Math.PI;
    const dopplerShift = 1 + flightVelX * 0.0012;
    
    // Pitch wobble (wing beat instability)
    this.pitchWobblePhase += this.pitchWobbleRate / this.sampleRate;
    if (this.pitchWobblePhase >= 1) this.pitchWobblePhase -= 1;
    const wobble = Math.sin(this.pitchWobblePhase * 2 * Math.PI) * this.pitchWobbleDepth;
    
    // Main oscillator with Doppler and wobble
    const currentFreq = (this.freq + wobble) * dopplerShift;
    this.phase += currentFreq / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;
    
    // Generate harmonics (thin, whiny quality)
    let sample = 0;
    for (let i = 0; i < this.harmonicAmps.length; i++) {
      sample += Math.sin(this.phase * (i + 1) * 2 * Math.PI) * this.harmonicAmps[i];
    }
    
    // Pan follows flight path
    this.pan = Math.max(-1, Math.min(1, flightX * 1.5));
    
    // Volume varies with flight path (closer when flightY is negative)
    const proximityMod = 1 - flightY * 0.15;
    const output = sample * this.volume * proximityMod * 0.08;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      output * Math.cos(panAngle),
      output * Math.sin(panAngle)
    ];
  }
}

// ============================================
// MOLE CRICKET ENGINE
// Burrow acts as exponential horn amplifier
// Creates pulsed trills, deeper than field cricket
// Rich, resonant quality from earth coupling
// ============================================
class MoleCricketVoice {
  constructor(sampleRate, id) {
    this.sampleRate = sampleRate;
    this.id = id;
    this.active = true;
    
    // Trill timing
    this.trillPhase = 0;
    this.trillRate = 50; // Pulses per second in trill
    this.trillOn = true;
    
    // Trill on/off cycling
    this.cyclePhase = 0;
    this.cycleRate = 0.8; // Trills per second
    
    // Main tone oscillator
    this.oscPhase = 0;
    this.freq = 2000; // Lower than field cricket
    
    // Burrow resonance (horn-like amplification)
    this.resonator1 = new BiquadFilter();
    this.resonator2 = new BiquadFilter();
    this.lpf = new BiquadFilter();
    
    // Voice parameters
    this.pan = 0;
    this.distance = 0;
    this.volume = 1;
  }
  
  setParams(params, rng) {
    const temperature = params.temperature || 0.5;
    
    // Frequency: 1.5-3 kHz (lower than field cricket)
    this.freq = 1500 + temperature * 1000 + (rng() - 0.5) * 400;
    
    // Trill rate varies with temperature
    this.trillRate = 35 + temperature * 40;
    this.cycleRate = 0.5 + temperature * 0.6;
    
    // Burrow resonance - emphasizes fundamental
    this.resonator1.setBandpass(this.freq, 10, this.sampleRate);
    this.resonator2.setBandpass(this.freq * 2.0, 6, this.sampleRate);
    this.lpf.setLowpass(this.freq * 3, 1, this.sampleRate);
    
    this.pan = params.pan !== undefined ? params.pan : (rng() - 0.5) * 1.8;
    this.distance = params.distance !== undefined ? params.distance : rng() * 0.8;
    this.volume = 1 - this.distance * 0.35;
    
    this.cyclePhase = rng();
  }
  
  process(rng) {
    // Trill on/off cycling (mole crickets trill in bursts)
    this.cyclePhase += this.cycleRate / this.sampleRate;
    if (this.cyclePhase >= 1) this.cyclePhase -= 1;
    this.trillOn = this.cyclePhase < 0.7; // 70% duty cycle
    
    // Trill pulse envelope
    this.trillPhase += this.trillRate / this.sampleRate;
    if (this.trillPhase >= 1) this.trillPhase -= 1;
    
    // Smoother envelope than field cricket
    const trillEnv = this.trillOn ? (0.5 + 0.5 * Math.sin(this.trillPhase * 2 * Math.PI)) : 0;
    
    // Generate tone (richer than field cricket due to burrow)
    this.oscPhase += this.freq / this.sampleRate;
    if (this.oscPhase >= 1) this.oscPhase -= 1;
    
    // Multiple harmonics for richness
    let tone = Math.sin(this.oscPhase * 2 * Math.PI);
    tone += Math.sin(this.oscPhase * 4 * Math.PI) * 0.3;
    tone += Math.sin(this.oscPhase * 6 * Math.PI) * 0.1;
    
    const exciter = tone * trillEnv;
    
    // Burrow resonance (horn amplification effect)
    let resonated = this.resonator1.process(exciter) * 0.7;
    resonated += this.resonator2.process(exciter) * 0.3;
    resonated = this.lpf.process(resonated);
    
    const output = resonated * this.volume * 0.3;
    
    const panAngle = (this.pan + 1) * 0.25 * Math.PI;
    return [
      output * Math.cos(panAngle),
      output * Math.sin(panAngle)
    ];
  }
}

// ============================================
// MAIN PROCESSOR
// ============================================
class InsectsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    try {
      console.log('InsectsProcessor: starting constructor');
      
      this.sampleRate = sampleRate || 48000;
      this.rng = mulberry32(Date.now());
      
      // Current engine type
      this.engineType = 'cricket'; // cricket, katydid, cicada, flyBee, treeCricket, grasshopper, moleCricket
      
      // Voice pools
      this.crickets = [];
      this.katydids = [];
      this.cicadas = [];
      this.flyBees = [];
      this.treeCrickets = [];
      this.grasshoppers = [];
      this.moleCrickets = [];
      
      this.maxVoices = {
        cricket: 12,
        katydid: 10,
        cicada: 8,
        flyBee: 10,
        treeCricket: 10,
        grasshopper: 8,
        moleCricket: 8
      };
      
      console.log('InsectsProcessor: creating voice pools');
      
      // Initialize pools
      for (let i = 0; i < this.maxVoices.cricket; i++) {
        this.crickets.push(new CricketVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: crickets created');
      
      for (let i = 0; i < this.maxVoices.katydid; i++) {
        const group = i < this.maxVoices.katydid / 2 ? 0 : 1;
        this.katydids.push(new KatydidVoice(this.sampleRate, i, group));
      }
      console.log('InsectsProcessor: katydids created');
      
      for (let i = 0; i < this.maxVoices.cicada; i++) {
        this.cicadas.push(new CicadaVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: cicadas created');
      
      for (let i = 0; i < this.maxVoices.flyBee; i++) {
        this.flyBees.push(new FlyBeeVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: flyBees created');
      
      for (let i = 0; i < this.maxVoices.treeCricket; i++) {
        this.treeCrickets.push(new TreeCricketVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: treeCrickets created');
      
      for (let i = 0; i < this.maxVoices.grasshopper; i++) {
        this.grasshoppers.push(new GrasshopperVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: grasshoppers created');
      
      for (let i = 0; i < this.maxVoices.moleCricket; i++) {
        this.moleCrickets.push(new MoleCricketVoice(this.sampleRate, i));
      }
      console.log('InsectsProcessor: moleCrickets created');
    
    // Parameters
    this.density = 0.5; // How many voices active
    this.temperature = 0.5;
    this.distance = 0.3;
    this.space = 0.3;
    
    // Engine-specific
    this.antiphony = 0.3;
    this.clickRate = 0.3;
    this.proximity = 0.5;
    this.motion = 0.5;
    
    // Smoothed params
    this.smoothedDensity = 0.5;
    this.smoothedTemp = 0.5;
    this.smoothedDistance = 0.3;
    
    // Distance filtering
    this.distanceFilterL = new OnePole();
    this.distanceFilterR = new OnePole();
    
    // DC blocking
    this.dcBlockL = { x1: 0, y1: 0 };
    this.dcBlockR = { x1: 0, y1: 0 };
    
    // Fade envelope
    // Start immediately for testing
    this.fadeGain = 0;
    this.fadeTarget = 0;  // Start silent until explicit start
    this.fadeRate = 0.001; // ~20ms fade at 48kHz
    
    // Stats
    this.stats = {
      activeVoices: 0,
    };
    
    // Initialize with defaults
    this.updateVoices();
    
    this.port.onmessage = (e) => this.handleMessage(e.data);
    
    console.log('InsectsProcessor: constructor complete!');
    } catch (err) {
      console.error('InsectsProcessor constructor error:', err);
    }
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'setEngine':
        {
          const allowed = ['cricket', 'katydid', 'cicada', 'flyBee', 'treeCricket', 'grasshopper', 'moleCricket'];
          this.engineType = allowed.includes(data.engine) ? data.engine : 'cricket';
        }
        this.updateVoices();
        break;
      case 'setParams':
        if (data.density !== undefined) this.density = data.density;
        if (data.temperature !== undefined) this.temperature = data.temperature;
        if (data.distance !== undefined) this.distance = data.distance;
        if (data.space !== undefined) this.space = data.space;
        if (data.antiphony !== undefined) this.antiphony = data.antiphony;
        if (data.clickRate !== undefined) this.clickRate = data.clickRate;
        if (data.proximity !== undefined) this.proximity = data.proximity;
        if (data.motion !== undefined) this.motion = data.motion;
        this.updateVoices();
        break;
      case 'setSeed':
        this.rng = mulberry32(data.seed);
        this.updateVoices();
        break;
      case 'start':
        console.log('InsectsProcessor: received start message');
        this.fadeTarget = 1;
        this.fadeRate = 0.0001; // ~200ms fade at 48kHz
        break;
      case 'stop':
        console.log('InsectsProcessor: received stop message');
        this.fadeTarget = 0;
        this.fadeRate = 0.0001;
        break;
      case 'getStats':
        this.port.postMessage({
          type: 'stats',
          activeVoices: this.stats.activeVoices,
          engineType: this.engineType,
        });
        break;
    }
  }
  
  updateVoices() {
    const params = {
      temperature: this.smoothedTemp,
      distance: this.smoothedDistance,
      antiphony: this.antiphony,
      clickRate: this.clickRate,
      proximity: this.proximity,
      motion: this.motion > 0.5,
    };
    
    // Determine active count based on density
    const getActiveCount = (max) => Math.max(1, Math.floor(this.smoothedDensity * max));
    
    switch (this.engineType) {
      case 'cricket':
        const cricketCount = getActiveCount(this.maxVoices.cricket);
        this.crickets.forEach((v, i) => {
          v.active = i < cricketCount;
          if (v.active) {
            // Proximity affects synchronization
            if (this.proximity > 0.7 && i > 0) {
              // Synchronized timing (copy timing from first voice)
              params.syncWith = this.crickets[0];
            }
            v.setParams(params, this.rng);
          }
        });
        break;
        
      case 'katydid':
        const katydidCount = getActiveCount(this.maxVoices.katydid);
        this.katydids.forEach((v, i) => {
          v.active = i < katydidCount;
          if (v.active) {
            v.setParams(params, this.rng);
          }
        });
        break;
        
      case 'cicada':
        const cicadaCount = getActiveCount(this.maxVoices.cicada);
        this.cicadas.forEach((v, i) => {
          v.active = i < cicadaCount;
          if (v.active) {
            // First 2 are "near", rest are distant mass
            if (i < 2) {
              params.distance = 0.1 + this.rng() * 0.2;
            } else {
              params.distance = 0.4 + this.rng() * 0.5;
            }
            v.setParams(params, this.rng);
          }
        });
        break;
        
      case 'flyBee':
        const flyBeeCount = getActiveCount(this.maxVoices.flyBee);
        this.flyBees.forEach((v, i) => {
          v.active = i < flyBeeCount;
          if (v.active) {
            // First 2-3 are close with motion
            params.isClose = i < 3;
            params.isBee = this.rng() > 0.5;
            v.setParams(params, this.rng);
          }
        });
        break;

      case 'treeCricket':
        const treeCricketCount = getActiveCount(this.maxVoices.treeCricket);
        this.treeCrickets.forEach((v, i) => {
          v.active = i < treeCricketCount;
          if (v.active) {
            v.setParams(params, this.rng);
          }
        });
        break;
        
      case 'grasshopper':
        const grasshopperCount = getActiveCount(this.maxVoices.grasshopper);
        this.grasshoppers.forEach((v, i) => {
          v.active = i < grasshopperCount;
          if (v.active) {
            v.setParams(params, this.rng);
          }
        });
        break;
        
      case 'moleCricket':
        const moleCricketCount = getActiveCount(this.maxVoices.moleCricket);
        this.moleCrickets.forEach((v, i) => {
          v.active = i < moleCricketCount;
          if (v.active) {
            v.setParams(params, this.rng);
          }
        });
        break;
    }
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
      console.log('InsectsProcessor: process() running, fadeTarget:', this.fadeTarget);
      this.processLogged = true;
    }
    
    // Block-level parameter smoothing
    this.smoothedDensity += (this.density - this.smoothedDensity) * 0.001;
    this.smoothedTemp += (this.temperature - this.smoothedTemp) * 0.001;
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
      
      // Sum active voices for current engine
      let sumL = 0;
      let sumR = 0;
      let activeCount = 0;
      
      switch (this.engineType) {
        case 'cricket':
          for (const voice of this.crickets) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'katydid':
          for (const voice of this.katydids) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'cicada':
          for (const voice of this.cicadas) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'flyBee':
          for (const voice of this.flyBees) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'treeCricket':
          for (const voice of this.treeCrickets) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'grasshopper':
          for (const voice of this.grasshoppers) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
          
        case 'moleCricket':
          for (const voice of this.moleCrickets) {
            if (voice.active) {
              const [vL, vR] = voice.process(this.rng);
              sumL += vL;
              sumR += vR;
              activeCount++;
            }
          }
          break;
      }
      
      // Normalize by voice count (prevent clipping with many voices)
      const voiceScale = activeCount > 0 ? Math.sqrt(1 / activeCount) : 0;
      sumL *= voiceScale;
      sumR *= voiceScale;
      
      // Distance filtering (lowpass)
      sumL = this.distanceFilterL.process(sumL, distCoeff);
      sumR = this.distanceFilterR.process(sumR, distCoeff);
      
      // DC blocking
      sumL = this.dcBlock(sumL, this.dcBlockL);
      sumR = this.dcBlock(sumR, this.dcBlockR);
      
      // Apply fade envelope and output (boost gain for audibility)
      outL[i] = sumL * this.fadeGain * 1.2;
      outR[i] = sumR * this.fadeGain * 1.2;
      
      // Update stats
      this.stats.activeVoices = activeCount;
    }
    
    return true;
  }
}

registerProcessor('insects-processor', InsectsProcessor);
