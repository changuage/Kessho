/**
 * Modal Synthesis AudioWorklet Processor
 * 
 * Efficient physical modeling using biquad resonators instead of oscillator nodes.
 * Processes exciter → resonator bank in a single DSP loop.
 * 
 * Features:
 * - Event-based triggering (no node allocation per strike)
 * - Configurable mode bank (up to 16 modes)
 * - Multiple exciter types (impulse, noise, mallet, bow, pluck)
 * - Parameter smoothing (one-pole lowpass)
 * - Micro-variation per hit for realism
 */

// One-pole smoother for parameter changes
class ParamSmoother {
  constructor(smoothingTime = 0.02, sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.setSmoothingTime(smoothingTime);
    this.currentValue = 0;
  }
  
  setSmoothingTime(time) {
    // Time constant for 63% convergence
    this.coeff = Math.exp(-1 / (time * this.sampleRate));
  }
  
  process(target) {
    this.currentValue = this.currentValue * this.coeff + target * (1 - this.coeff);
    return this.currentValue;
  }
  
  setImmediate(value) {
    this.currentValue = value;
  }
}

// 2-pole resonator (biquad bandpass) for modal synthesis
class ModalResonator {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.reset();
  }
  
  reset() {
    this.y1 = 0;
    this.y2 = 0;
    this.b0 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.active = false;
    this.amplitude = 0;
  }
  
  /**
   * Set resonator frequency and decay
   * @param {number} freq - Frequency in Hz
   * @param {number} decayTime - Time to decay to -60dB in seconds
   * @param {number} amplitude - Gain multiplier
   */
  setParams(freq, decayTime, amplitude) {
    this.active = true;
    this.amplitude = amplitude;
    
    // Clamp frequency to valid range
    const nyquist = this.sampleRate / 2;
    freq = Math.max(20, Math.min(freq, nyquist * 0.95));
    
    // Calculate normalized frequency
    const omega = 2 * Math.PI * freq / this.sampleRate;
    
    // Calculate Q from decay time
    // Decay to -60dB means amplitude reaches 0.001
    // e^(-t/tau) = 0.001 → tau = t / ln(1000) ≈ t / 6.9
    const tau = Math.max(0.001, decayTime / 6.9);
    const bandwidth = 1 / (Math.PI * tau);
    const Q = freq / bandwidth;
    
    // Bandpass biquad coefficients
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * Q);
    
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.a1 = -2 * cosOmega / a0;
    this.a2 = (1 - alpha) / a0;
  }
  
  // Process one sample
  process(input) {
    if (!this.active) return 0;
    
    // Direct Form II transposed
    const output = this.b0 * input + this.y1;
    this.y1 = -this.a1 * output + this.y2;
    this.y2 = -this.a2 * output;
    
    return output * this.amplitude;
  }
  
  // Get current energy level (for detecting silence)
  getEnergy() {
    return Math.abs(this.y1) + Math.abs(this.y2);
  }
}

// Voice class representing one triggered note
class ModalVoice {
  constructor(sampleRate, maxModes = 16) {
    this.sampleRate = sampleRate;
    this.maxModes = maxModes;
    this.modes = [];
    for (let i = 0; i < maxModes; i++) {
      this.modes.push(new ModalResonator(sampleRate));
    }
    this.reset();
  }
  
  reset() {
    this.active = false;
    this.exciterPhase = 0;
    this.exciterSamplesRemaining = 0;
    this.exciterSamplesTotal = 1; // Avoid division by zero
    this.exciterFadeoutSamples = Math.floor(0.015 * this.sampleRate);
    this.exciterType = 'impulse';
    this.noiseState = 0; // For pink/brown noise
    this.pinkB0 = this.pinkB1 = this.pinkB2 = this.pinkB3 = this.pinkB4 = this.pinkB5 = this.pinkB6 = 0;
    this.brownState = 0;
    this.shState = 0;
    this.shCounter = 0;
    this.bowPhase = 0;
    this.velocity = 1;
    this.attackSamples = 0;
    this.attackRemaining = 0;
    this.sustainSamples = 0;
    this.sustainRemaining = 0;
    this.decaySamples = 0;
    this.envGain = 0;
    this.clickSamples = 0;
    this.clickRemaining = 0;
    this.clickAmount = 0;
    this.noiseAmount = 0;
    this.filterState1 = 0;
    this.filterState2 = 0;
    this.filterCoeffs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    this.seed = Math.random();
    this.modes.forEach(m => m.reset());
  }
  
  /**
   * Trigger a new note
   */
  trigger(params) {
    this.reset();
    this.active = true;
    this.velocity = params.velocity || 1;
    this.seed = params.seed ?? Math.random();
    
    // Exciter setup
    this.exciterType = params.exciterType || 'impulse';
    this.clickAmount = params.clickAmount || 0;
    this.noiseAmount = params.noiseAmount || 0.1;
    this.noiseType = params.noiseType || 'white';
    this.clickType = params.clickType || 'spike';
    
    // Envelope
    this.attackSamples = Math.floor(params.attack * this.sampleRate);
    this.attackRemaining = this.attackSamples;
    this.sustainSamples = Math.floor((params.sustain || 0) * this.sampleRate);
    this.sustainRemaining = this.sustainSamples;
    
    // Click duration (5ms)
    this.clickSamples = Math.floor(0.005 * this.sampleRate);
    this.clickRemaining = this.clickSamples;
    
    // Noise duration
    this.exciterSamplesTotal = Math.floor(params.noiseDuration * this.sampleRate);
    this.exciterSamplesRemaining = this.exciterSamplesTotal;
    this.exciterFadeoutSamples = Math.floor(0.015 * this.sampleRate); // 15ms fadeout
    this.noiseDecayRate = params.noiseDecay || 50;
    
    // Filter setup
    this.setupFilter(params.filterType, params.filterFreq, params.filterQ);
    
    // Setup modes
    const numModes = Math.min(params.modes.length, this.maxModes);
    for (let i = 0; i < numModes; i++) {
      const mode = params.modes[i];
      // Apply micro-variation for realism
      const freqVar = 1 + (this.seededRandom() - 0.5) * params.detuneAmount * 0.02;
      const decayVar = 1 + (this.seededRandom() - 0.5) * 0.1;
      
      this.modes[i].setParams(
        mode.freq * freqVar,
        mode.decay * decayVar,
        mode.amplitude
      );
    }
  }
  
  setupFilter(type, freq, Q) {
    const omega = 2 * Math.PI * freq / this.sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * Q);
    
    let b0, b1, b2, a0, a1, a2;
    
    switch (type) {
      case 'lowpass':
        b0 = (1 - cosOmega) / 2;
        b1 = 1 - cosOmega;
        b2 = (1 - cosOmega) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cosOmega) / 2;
        b1 = -(1 + cosOmega);
        b2 = (1 + cosOmega) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
      default:
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
    }
    
    this.filterCoeffs = {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    };
  }
  
  // Seeded random for consistent micro-variation
  seededRandom() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  
  // Generate exciter signal
  generateExciter() {
    let click = 0;
    let noise = 0;
    
    // Click component
    if (this.clickRemaining > 0 && this.clickAmount > 0) {
      const t = 1 - this.clickRemaining / this.clickSamples;
      switch (this.clickType) {
        case 'spike':
          click = (1 - t * 2) * Math.exp(-t * 500);
          break;
        case 'sine':
          click = Math.sin(t * Math.PI * 8) * (1 - t);
          break;
        case 'square':
          click = (t < 0.3 ? 1 : -1) * (1 - t);
          break;
        case 'filtered':
          click = Math.sin(t * Math.PI * 4) * Math.exp(-t * 200);
          break;
        case 'bipolar':
          click = Math.sin(t * Math.PI * 16) * (1 - t * t);
          break;
        default:
          click = (1 - t * 2) * Math.exp(-t * 500);
      }
      click *= this.clickAmount;
      this.clickRemaining--;
    }
    
    // Noise component
    if (this.exciterSamplesRemaining > 0 && this.noiseAmount > 0) {
      // Calculate progress through noise duration (0 to 1)
      const noiseProgress = 1 - this.exciterSamplesRemaining / this.exciterSamplesTotal;
      const noiseEnv = Math.exp(-noiseProgress * this.noiseDecayRate);
      
      // Add fadeout to prevent click at end of excitation
      let fadeout = 1;
      if (this.exciterSamplesRemaining < this.exciterFadeoutSamples) {
        fadeout = this.exciterSamplesRemaining / this.exciterFadeoutSamples;
      }
      
      // Generate noise based on type
      let rawNoise = 0;
      switch (this.noiseType) {
        case 'white':
          rawNoise = Math.random() * 2 - 1;
          break;
        case 'pink':
          // Paul Kellet's pink noise algorithm
          const white = Math.random() * 2 - 1;
          this.pinkB0 = 0.99886 * this.pinkB0 + white * 0.0555179;
          this.pinkB1 = 0.99332 * this.pinkB1 + white * 0.0750759;
          this.pinkB2 = 0.96900 * this.pinkB2 + white * 0.1538520;
          this.pinkB3 = 0.86650 * this.pinkB3 + white * 0.3104856;
          this.pinkB4 = 0.55000 * this.pinkB4 + white * 0.5329522;
          this.pinkB5 = -0.7616 * this.pinkB5 - white * 0.0168980;
          rawNoise = (this.pinkB0 + this.pinkB1 + this.pinkB2 + this.pinkB3 + this.pinkB4 + this.pinkB5 + this.pinkB6 + white * 0.5362) * 0.11;
          this.pinkB6 = white * 0.115926;
          break;
        case 'brown':
          const whiteB = Math.random() * 2 - 1;
          this.brownState = (this.brownState + 0.02 * whiteB) / 1.02;
          rawNoise = this.brownState * 3.5;
          break;
        case 'crackle':
          if (Math.random() < 0.03) {
            rawNoise = (Math.random() * 2 - 1) * 2;
          }
          break;
        case 'samplehold':
          this.shCounter++;
          if (this.shCounter >= 50) {
            this.shState = Math.random() * 2 - 1;
            this.shCounter = 0;
          }
          rawNoise = this.shState;
          break;
        default:
          rawNoise = Math.random() * 2 - 1;
      }
      
      noise = rawNoise * this.noiseAmount * noiseEnv * fadeout;
      this.exciterSamplesRemaining--;
    }
    
    // Apply filter to combined exciter
    const exciter = click + noise;
    const c = this.filterCoeffs;
    const filtered = c.b0 * exciter + c.b1 * this.filterState1 + c.b2 * this.filterState2
                   - c.a1 * this.filterState1 - c.a2 * this.filterState2;
    this.filterState2 = this.filterState1;
    this.filterState1 = exciter;
    
    return filtered;
  }
  
  // Calculate envelope gain
  calculateEnvelope() {
    if (this.attackRemaining > 0) {
      // Attack phase
      const t = 1 - this.attackRemaining / this.attackSamples;
      this.envGain = t;
      this.attackRemaining--;
    } else if (this.sustainRemaining > 0) {
      // Sustain phase
      this.envGain = 1;
      this.sustainRemaining--;
    } else {
      // Voice will naturally decay via mode resonators
      this.envGain = 1;
    }
    return this.envGain * this.velocity;
  }
  
  // Process one sample
  process() {
    if (!this.active) return 0;
    
    const exciter = this.generateExciter();
    const envGain = this.calculateEnvelope();
    
    // Sum all modes
    let output = 0;
    let totalEnergy = 0;
    for (const mode of this.modes) {
      if (mode.active) {
        output += mode.process(exciter);
        totalEnergy += mode.getEnergy();
      }
    }
    
    // Check if voice is silent
    if (totalEnergy < 1e-10 && this.exciterSamplesRemaining <= 0 && 
        this.attackRemaining <= 0 && this.sustainRemaining <= 0) {
      this.active = false;
    }
    
    return output * envGain * 2.0;  // Boosted to match main thread gain
  }
}

// Main processor
class ModalProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    this.sampleRate = options.processorOptions?.sampleRate || 48000;
    this.maxVoices = options.processorOptions?.maxVoices || 16;
    this.maxModes = options.processorOptions?.maxModes || 16;
    
    // Voice pool
    this.voices = [];
    for (let i = 0; i < this.maxVoices; i++) {
      this.voices.push(new ModalVoice(this.sampleRate, this.maxModes));
    }
    
    // Parameter smoothers
    this.smoothers = {
      brightness: new ParamSmoother(0.02, this.sampleRate),
      damping: new ParamSmoother(0.02, this.sampleRate),
      filterFreq: new ParamSmoother(0.01, this.sampleRate),
      filterQ: new ParamSmoother(0.01, this.sampleRate),
      noiseAmount: new ParamSmoother(0.02, this.sampleRate),
      masterGain: new ParamSmoother(0.02, this.sampleRate)
    };
    this.smoothers.masterGain.setImmediate(0.6);
    
    // Initialize reverb (4-tap FDN)
    // Prime delay times for good diffusion (in samples)
    const delayTimes = [
      Math.floor(0.0297 * this.sampleRate),  // ~29.7ms
      Math.floor(0.0371 * this.sampleRate),  // ~37.1ms
      Math.floor(0.0411 * this.sampleRate),  // ~41.1ms
      Math.floor(0.0437 * this.sampleRate)   // ~43.7ms
    ];
    this.reverbDelays = delayTimes.map(len => new Float32Array(len));
    this.reverbReadIndex = [0, 0, 0, 0];
    this.reverbWriteIndex = delayTimes.map(len => Math.floor(len * 0.7));
    this.reverbLPState = [0, 0, 0, 0];
    
    // Event queue
    this.eventQueue = [];
    
    // Current parameters (updated from main thread)
    this.params = {
      brightness: 0.5,
      damping: 0.3,
      structure: 0.2,
      position: 0.3,
      decay: 3.0,
      material: 0.4,
      size: 0.5,
      attack: 0.001,
      noiseAmount: 0.1,
      noiseDuration: 0.04,
      noiseDecay: 50,
      clickAmount: 0,
      sustain: 0,
      filterFreq: 1.0,
      filterQ: 1.0,
      detuneAmount: 3,
      rolloff: 0.85,
      inharmonicity: 0,
      masterGain: 0.6,
      exciterType: 'impulse',
      noiseType: 'white',
      clickType: 'spike',
      filterType: 'bandpass',
      modes: [1, 2, 3, 4, 5, 6],
      // Effects
      reverbEnabled: true,
      reverbMix: 0.25,
      reverbDecay: 0.85,
      reverbDamping: 0.5,
      saturationEnabled: true,
      saturationDrive: 0.3
    };
    
    // Handle messages from main thread
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'trigger':
          this.queueTrigger(data);
          break;
        case 'params':
          Object.assign(this.params, data);
          break;
        case 'setParam':
          this.params[data.name] = data.value;
          break;
      }
    };
  }
  
  queueTrigger(data) {
    this.eventQueue.push({
      time: data.time || currentTime,
      frequency: data.frequency,
      velocity: data.velocity || 1,
      seed: data.seed ?? Math.random()
    });
  }
  
  processTrigger(event) {
    // Find free voice or steal oldest
    let voice = this.voices.find(v => !v.active);
    if (!voice) {
      // Voice stealing - find quietest
      let quietest = this.voices[0];
      let minEnergy = Infinity;
      for (const v of this.voices) {
        let energy = 0;
        for (const m of v.modes) {
          energy += m.getEnergy();
        }
        if (energy < minEnergy) {
          minEnergy = energy;
          quietest = v;
        }
      }
      voice = quietest;
    }
    
    // Calculate mode frequencies
    const frequency = event.frequency;
    const sizedFreq = frequency * (0.5 + this.params.size);
    const modes = this.calculateModes(sizedFreq);
    
    // Get filter frequency in Hz
    const filterFreq = Math.max(20, Math.min(sizedFreq * this.params.filterFreq * 4, this.sampleRate / 2 - 100));
    
    // Trigger voice
    voice.trigger({
      velocity: event.velocity,
      seed: event.seed,
      exciterType: this.params.exciterType,
      clickAmount: this.params.clickAmount,
      noiseAmount: this.params.noiseAmount,
      noiseType: this.params.noiseType,
      clickType: this.params.clickType,
      attack: this.params.attack,
      sustain: this.params.sustain,
      noiseDuration: this.params.noiseDuration,
      noiseDecay: this.params.noiseDecay,
      filterType: this.params.filterType,
      filterFreq: filterFreq,
      filterQ: this.params.filterQ,
      detuneAmount: this.params.detuneAmount,
      modes: modes
    });
    
    // Report voice count
    this.port.postMessage({
      type: 'voiceCount',
      count: this.voices.filter(v => v.active).length
    });
  }
  
  calculateModes(fundamental) {
    const modes = [];
    const presetModes = this.params.modes;
    const numModes = Math.min(presetModes.length, this.maxModes);
    const structure = this.params.structure;
    const brightness = this.params.brightness;
    const damping = this.params.damping;
    const decay = this.params.decay;
    const rolloff = this.params.rolloff;
    const inharmonicity = this.params.inharmonicity;
    const position = this.params.position;
    const material = this.params.material;
    
    for (let i = 0; i < numModes; i++) {
      // Base ratio from preset
      let ratio = presetModes[i];
      
      // Apply structure (mode spreading)
      if (i > 0) {
        const spread = 1 + structure * 0.3 * (ratio - 1);
        ratio = 1 + (ratio - 1) * spread;
      }
      
      // Apply inharmonicity (piano-like stretch)
      const inharmonicStretch = 1 + inharmonicity * i * i * 0.001;
      ratio *= inharmonicStretch;
      
      // Calculate frequency
      const freq = fundamental * ratio;
      
      // Mode-specific decay with rolloff
      const materialDecayMod = 1 - material * 0.5;
      const modeDecay = decay * (1 - damping * 0.7) * Math.pow(rolloff, i) * materialDecayMod;
      
      // Amplitude with brightness-based rolloff
      const brightnessWeight = Math.pow(0.5 + brightness * 0.5, i * 0.3);
      // Position affects mode amplitudes (node/antinode weighting)
      const positionWeight = Math.abs(Math.sin(Math.PI * (i + 1) * position));
      const amplitude = brightnessWeight * (0.3 + positionWeight * 0.7) / (i + 1);
      
      modes.push({
        freq: freq,
        ratio: ratio,
        decay: modeDecay,
        amplitude: amplitude
      });
    }
    
    return modes;
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channelL = output[0];
    const channelR = output[1] || output[0];
    
    // Process queued events
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      this.processTrigger(event);
    }
    
    // Process audio
    const outputGain = this.params.outputGain ?? 1.5;  // Use slider value or default
    const masterGain = this.smoothers.masterGain.process(outputGain);
    const reverbMix = this.params.reverbEnabled ? this.params.reverbMix : 0;
    const saturationEnabled = this.params.saturationEnabled;
    const saturationDrive = this.params.saturationDrive;
    
    for (let i = 0; i < channelL.length; i++) {
      let sample = 0;
      
      // Sum all active voices
      for (const voice of this.voices) {
        if (voice.active) {
          sample += voice.process();
        }
      }
      
      // Apply master gain
      sample *= masterGain;
      
      // Apply saturation (soft clip with drive)
      if (saturationEnabled) {
        const driven = sample * (1 + saturationDrive * 2);
        sample = Math.tanh(driven) / (1 + saturationDrive * 0.3); // Compensate for gain
      }
      
      // Process reverb
      let wetL = 0, wetR = 0;
      if (reverbMix > 0) {
        const reverbOut = this.processReverb(sample);
        wetL = reverbOut.left;
        wetR = reverbOut.right;
      }
      
      // Mix dry/wet
      const dry = 1 - reverbMix;
      const outL = sample * dry + wetL * reverbMix;
      const outR = sample * dry + wetR * reverbMix;
      
      // Output stereo
      channelL[i] = outL;
      if (channelR !== channelL) {
        channelR[i] = outR;
      }
    }
    
    return true;
  }
  
  // Simple 4-tap FDN reverb
  processReverb(input) {
    const decay = this.params.reverbDecay;
    const damping = this.params.reverbDamping;
    
    // Read from delay lines
    const t0 = this.reverbDelays[0][this.reverbReadIndex[0]];
    const t1 = this.reverbDelays[1][this.reverbReadIndex[1]];
    const t2 = this.reverbDelays[2][this.reverbReadIndex[2]];
    const t3 = this.reverbDelays[3][this.reverbReadIndex[3]];
    
    // Feedback matrix (Hadamard-like mixing)
    const feedback = decay * 0.7;
    const sum = (t0 + t1 + t2 + t3) * 0.5;
    const f0 = (sum - t0) * feedback;
    const f1 = (sum - t1) * feedback;
    const f2 = (sum - t2) * feedback;
    const f3 = (sum - t3) * feedback;
    
    // Apply damping (lowpass)
    this.reverbLPState[0] = this.reverbLPState[0] * damping + f0 * (1 - damping);
    this.reverbLPState[1] = this.reverbLPState[1] * damping + f1 * (1 - damping);
    this.reverbLPState[2] = this.reverbLPState[2] * damping + f2 * (1 - damping);
    this.reverbLPState[3] = this.reverbLPState[3] * damping + f3 * (1 - damping);
    
    // Write to delay lines (input + filtered feedback)
    const inputGain = 0.3;
    this.reverbDelays[0][this.reverbWriteIndex[0]] = input * inputGain + this.reverbLPState[0];
    this.reverbDelays[1][this.reverbWriteIndex[1]] = input * inputGain + this.reverbLPState[1];
    this.reverbDelays[2][this.reverbWriteIndex[2]] = input * inputGain + this.reverbLPState[2];
    this.reverbDelays[3][this.reverbWriteIndex[3]] = input * inputGain + this.reverbLPState[3];
    
    // Advance indices
    for (let d = 0; d < 4; d++) {
      this.reverbReadIndex[d] = (this.reverbReadIndex[d] + 1) % this.reverbDelays[d].length;
      this.reverbWriteIndex[d] = (this.reverbWriteIndex[d] + 1) % this.reverbDelays[d].length;
    }
    
    // Stereo output (decorrelated)
    return {
      left: (t0 + t2) * 0.5,
      right: (t1 + t3) * 0.5
    };
  }
}

registerProcessor('modal-processor', ModalProcessor);
