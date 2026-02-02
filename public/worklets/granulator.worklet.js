/**
 * Granular Synthesis AudioWorklet Processor
 * Optimized with lookup tables for pan and Hann window
 */

const HARMONIC_INTERVALS = [
  0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24,
];

// Pre-computed pan lookup table (256 entries for -1 to +1 pan range)
const PAN_TABLE_SIZE = 256;
const panTableL = new Float32Array(PAN_TABLE_SIZE);
const panTableR = new Float32Array(PAN_TABLE_SIZE);
for (let i = 0; i < PAN_TABLE_SIZE; i++) {
  const pan = (i / (PAN_TABLE_SIZE - 1)) * 2 - 1; // -1 to +1
  const angle = (pan + 1) * 0.25 * Math.PI;
  panTableL[i] = Math.cos(angle);
  panTableR[i] = Math.sin(angle);
}

// Pre-computed Hann window lookup table (1024 entries for 0-1 phase)
const HANN_TABLE_SIZE = 1024;
const hannTable = new Float32Array(HANN_TABLE_SIZE);
for (let i = 0; i < HANN_TABLE_SIZE; i++) {
  const phase = i / HANN_TABLE_SIZE;
  hannTable[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
}

class GranulatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [new Float32Array(0), new Float32Array(0)];
    this.bufferSize = 4 * 48000;
    this.buffer = [
      new Float32Array(this.bufferSize),
      new Float32Array(this.bufferSize),
    ];
    this.writePos = 0;
    // Reduced grain pool from 100 to 64 for efficiency
    this.grains = [];
    for (let i = 0; i < 64; i++) {
      this.grains.push({
        startSample: 0,
        position: 0,
        length: 0,
        playbackRate: 1,
        panIndex: 128, // Pre-computed pan index
        active: false,
      });
    }
    this.samplesSinceGrain = 0;
    this.samplesPerGrain = 2205;
    this.randomSequence = new Float32Array(0);
    this.randomIndex = 0;
    this.initialized = false;
    
    // Pink noise generator state (matching iOS implementation)
    this.pinkB0 = 0;
    this.pinkB1 = 0;
    this.pinkB2 = 0;
    this.pinkB3 = 0;
    this.pinkB4 = 0;
    this.pinkB5 = 0;
    this.pinkB6 = 0;
    this.silentSamples = 0;
    this.noiseBufferFilled = false;
    
    this.params = {
      grainSizeMin: 20,
      grainSizeMax: 80,
      density: 20,
      spray: 100,
      jitter: 10,
      probability: 0.8,
      pitchMode: 'harmonic',
      pitchSpread: 2,
      stereoSpread: 0.5,
      feedback: 0.1,
      wetMix: 0.3,
    };
    
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    
    // Pre-fill buffer with pink noise for initial texture
    this.fillNoiseBuffer();
  }
  
  // Generate pink noise sample (matching iOS pink noise algorithm)
  generatePinkNoise() {
    const white = Math.random() * 2 - 1;
    
    // Pink noise filter (Paul Kellet's method)
    this.pinkB0 = 0.99886 * this.pinkB0 + white * 0.0555179;
    this.pinkB1 = 0.99332 * this.pinkB1 + white * 0.0750759;
    this.pinkB2 = 0.96900 * this.pinkB2 + white * 0.1538520;
    this.pinkB3 = 0.86650 * this.pinkB3 + white * 0.3104856;
    this.pinkB4 = 0.55000 * this.pinkB4 + white * 0.5329522;
    this.pinkB5 = -0.7616 * this.pinkB5 - white * 0.0168980;
    
    const pink = this.pinkB0 + this.pinkB1 + this.pinkB2 + this.pinkB3 + 
                 this.pinkB4 + this.pinkB5 + this.pinkB6 + white * 0.5362;
    this.pinkB6 = white * 0.115926;
    
    return pink * 0.2;  // Scale down to match iOS
  }
  
  // Fill buffer with pink noise for texture when no input
  fillNoiseBuffer() {
    for (let i = 0; i < this.bufferSize; i++) {
      const sample = this.generatePinkNoise();
      this.buffer[0][i] = sample;
      this.buffer[1][i] = sample * (1 + (Math.random() - 0.5) * 0.1);  // Slight stereo variation
    }
    this.noiseBufferFilled = true;
  }

  handleMessage(data) {
    switch (data.type) {
      case 'params':
        Object.assign(this.params, data.params);
        this.updateTimings();
        break;
      case 'randomSequence':
        this.randomSequence = data.sequence;
        this.randomIndex = 0;
        this.initialized = true;
        break;
      case 'reseed':
        this.randomSequence = data.sequence;
        this.randomIndex = 0;
        break;
    }
  }

  updateTimings() {
    this.samplesPerGrain = Math.floor(sampleRate / this.params.density);
  }

  nextRandom() {
    if (this.randomSequence.length === 0) return 0.5;
    const value = this.randomSequence[this.randomIndex];
    this.randomIndex = (this.randomIndex + 1) % this.randomSequence.length;
    return value;
  }

  spawnGrain() {
    if (this.nextRandom() > this.params.probability) return;
    const grain = this.grains.find((g) => !g.active);
    if (!grain) return;

    const sizeRange = this.params.grainSizeMax - this.params.grainSizeMin;
    const randomSize = this.params.grainSizeMin + this.nextRandom() * sizeRange;
    const grainSamples = Math.floor((randomSize / 1000) * sampleRate);
    const spraySamples = Math.floor((this.params.spray / 1000) * sampleRate);
    const jitterSamples = Math.floor((this.params.jitter / 1000) * sampleRate);

    const basePos = (this.writePos - spraySamples + this.bufferSize) % this.bufferSize;
    const sprayOffset = Math.floor(this.nextRandom() * spraySamples);
    const jitterOffset = Math.floor((this.nextRandom() - 0.5) * 2 * jitterSamples);

    grain.position = (basePos - sprayOffset + jitterOffset + this.bufferSize) % this.bufferSize;
    grain.startSample = 0;
    grain.length = grainSamples;

    let pitchOffset;
    if (this.params.pitchMode === 'harmonic') {
      const maxIntervalIndex = Math.floor((this.params.pitchSpread / 12) * HARMONIC_INTERVALS.length);
      const availableIntervals = HARMONIC_INTERVALS.slice(0, Math.max(1, maxIntervalIndex));
      const intervalIndex = Math.floor(this.nextRandom() * availableIntervals.length);
      pitchOffset = availableIntervals[intervalIndex];
    } else {
      pitchOffset = (this.nextRandom() - 0.5) * 2 * this.params.pitchSpread;
    }
    grain.playbackRate = Math.pow(2, pitchOffset / 12);
    
    // Pre-compute pan table index
    const pan = (this.nextRandom() - 0.5) * 2 * this.params.stereoSpread;
    grain.panIndex = Math.floor((pan + 1) * 0.5 * (PAN_TABLE_SIZE - 1)) | 0;
    grain.panIndex = Math.max(0, Math.min(PAN_TABLE_SIZE - 1, grain.panIndex));
    grain.active = true;
  }

  // Use lookup table for Hann window
  hannWindow(position, length) {
    const phase = position / length;
    const index = (phase * HANN_TABLE_SIZE) | 0;
    return hannTable[Math.min(index, HANN_TABLE_SIZE - 1)];
  }

  readBuffer(channel, position) {
    const buf = this.buffer[channel];
    const pos = position % this.bufferSize;
    const index = Math.floor(pos);
    const frac = pos - index;
    const next = (index + 1) % this.bufferSize;
    return buf[index] * (1 - frac) + buf[next] * frac;
  }

  process(inputs, outputs, _parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || input.length < 2 || output.length < 2) {
      return true;
    }

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1];
    const blockSize = outputL.length;

    for (let i = 0; i < blockSize; i++) {
      let inL = inputL[i] || 0;
      let inR = inputR[i] || 0;
      
      // Detect silence and mix in pink noise for texture (matching iOS behavior)
      const inputLevel = Math.abs(inL) + Math.abs(inR);
      if (inputLevel < 0.001) {
        this.silentSamples++;
        // After 0.5 seconds of silence, start blending in pink noise
        if (this.silentSamples > sampleRate * 0.5) {
          const noiseL = this.generatePinkNoise();
          const noiseR = this.generatePinkNoise();
          // Gradual blend over 2 seconds
          const blendFactor = Math.min(1.0, (this.silentSamples - sampleRate * 0.5) / (sampleRate * 2));
          inL = noiseL * blendFactor * 0.3;
          inR = noiseR * blendFactor * 0.3;
        }
      } else {
        this.silentSamples = 0;
      }

      this.buffer[0][this.writePos] = inL;
      this.buffer[1][this.writePos] = inR;

      if (this.initialized) {
        this.samplesSinceGrain++;
        if (this.samplesSinceGrain >= this.samplesPerGrain) {
          this.spawnGrain();
          this.samplesSinceGrain = 0;
        }
      }

      let wetL = 0;
      let wetR = 0;

      for (const grain of this.grains) {
        if (!grain.active) continue;

        const readPos = grain.position + grain.startSample * grain.playbackRate;
        const sampleL = this.readBuffer(0, readPos);
        const sampleR = this.readBuffer(1, readPos);
        const envelope = this.hannWindow(grain.startSample, grain.length);
        // Use lookup table for pan
        const panL = panTableL[grain.panIndex];
        const panR = panTableR[grain.panIndex];

        wetL += sampleL * envelope * panL;
        wetR += sampleR * envelope * panR;

        grain.startSample++;
        if (grain.startSample >= grain.length) {
          grain.active = false;
        }
      }

      const feedbackL = Math.tanh(wetL * this.params.feedback);
      const feedbackR = Math.tanh(wetR * this.params.feedback);

      this.buffer[0][this.writePos] += feedbackL;
      this.buffer[1][this.writePos] += feedbackR;

      this.writePos = (this.writePos + 1) % this.bufferSize;

      const level = this.params.wetMix;
      outputL[i] = wetL * level;
      outputR[i] = wetR * level;
    }

    return true;
  }
}

registerProcessor('granulator', GranulatorProcessor);
