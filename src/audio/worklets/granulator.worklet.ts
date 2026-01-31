/**
 * Granular Synthesis AudioWorklet Processor
 * 
 * Implements a deterministic granular synthesis effect.
 * Uses a circular buffer and Hann-windowed grains.
 * All randomization uses pre-seeded random sequences.
 */

/// <reference path="../../vite-env.d.ts" />

// This file runs in AudioWorklet context
interface GranulatorParams {
  grainSizeMin: number;   // ms - minimum grain size
  grainSizeMax: number;   // ms - maximum grain size
  density: number;        // grains/sec
  spray: number;          // ms
  jitter: number;         // ms
  probability: number;    // 0-1, chance each grain triggers
  pitchMode: 'random' | 'harmonic';
  pitchSpread: number;    // semitones (for random mode)
  stereoSpread: number;   // 0-1
  feedback: number;       // 0-0.35
  wetMix: number;         // 0-1 (output level)
}

// Harmonic intervals in semitones (pleasant sounding)
const HARMONIC_INTERVALS = [
  0,    // Unison
  7,    // Perfect Fifth
  12,   // Octave
  -12,  // Octave down
  19,   // Twelfth (octave + fifth)
  5,    // Perfect Fourth
  -7,   // Fifth down
  24,   // Double octave
  -5,   // Fourth down
  4,    // Major Third
  -24,  // Double octave down
];

interface Grain {
  startSample: number;
  position: number;       // read position in buffer
  length: number;         // grain length in samples
  playbackRate: number;   // pitch shift
  pan: number;            // -1 to 1
  active: boolean;
}

class GranulatorProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private bufferSize = 0;
  private writePos = 0;
  private grains: Grain[] = [];
  private samplesSinceGrain = 0;
  private samplesPerGrain = 2205; // will be updated
  private randomSequence: Float32Array = new Float32Array(0);
  private randomIndex = 0;
  private initialized = false;

  // Performance monitoring
  private perfEnabled = false;
  private perfTotalTime = 0;
  private perfCount = 0;
  private perfSamplesSinceReport = 0;
  private perfReportInterval = 48000; // ~1 second

  // Pre-computed pan lookup table (avoid Math.cos/sin per grain per sample)
  private panTableL: Float32Array;
  private panTableR: Float32Array;
  private readonly PAN_TABLE_SIZE = 256;

  // Pre-computed Hann window lookup table
  private hannTable: Float32Array;
  private readonly HANN_TABLE_SIZE = 1024;

  // Parameters with defaults
  private params: GranulatorParams = {
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

  constructor() {
    super();

    // 4 seconds stereo circular buffer at 44.1kHz (will resize if needed)
    this.bufferSize = 4 * 48000;
    this.buffer = [
      new Float32Array(this.bufferSize),
      new Float32Array(this.bufferSize),
    ];

    // Pre-compute pan lookup table (constant power panning)
    this.panTableL = new Float32Array(this.PAN_TABLE_SIZE);
    this.panTableR = new Float32Array(this.PAN_TABLE_SIZE);
    for (let i = 0; i < this.PAN_TABLE_SIZE; i++) {
      // Map index to pan value -1 to 1
      const pan = (i / (this.PAN_TABLE_SIZE - 1)) * 2 - 1;
      const panAngle = (pan + 1) * 0.25 * Math.PI;
      this.panTableL[i] = Math.cos(panAngle);
      this.panTableR[i] = Math.sin(panAngle);
    }

    // Pre-compute Hann window lookup table
    this.hannTable = new Float32Array(this.HANN_TABLE_SIZE);
    for (let i = 0; i < this.HANN_TABLE_SIZE; i++) {
      const phase = i / (this.HANN_TABLE_SIZE - 1);
      this.hannTable[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    }

    // Pre-allocate grain pool
    this.grains = [];
    for (let i = 0; i < 64; i++) {  // Reduced from 100 to 64 max grains
      this.grains.push({
        startSample: 0,
        position: 0,
        length: 0,
        playbackRate: 1,
        pan: 0,
        active: false,
      });
    }

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  // Fast pan lookup (avoids trig per sample)
  private getPan(pan: number): { l: number; r: number } {
    const index = Math.floor(((pan + 1) * 0.5) * (this.PAN_TABLE_SIZE - 1));
    const clampedIndex = Math.max(0, Math.min(this.PAN_TABLE_SIZE - 1, index));
    return { l: this.panTableL[clampedIndex], r: this.panTableR[clampedIndex] };
  }

  private handleMessage(data: { type: string; [key: string]: unknown }) {
    switch (data.type) {
      case 'enablePerf':
        this.perfEnabled = data.enabled as boolean;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        break;
      case 'params':
        Object.assign(this.params, data.params);
        this.updateTimings();
        break;
      case 'randomSequence':
        this.randomSequence = data.sequence as Float32Array;
        this.randomIndex = 0;
        this.initialized = true;
        break;
      case 'reseed':
        this.randomSequence = data.sequence as Float32Array;
        this.randomIndex = 0;
        break;
    }
  }

  private updateTimings() {
    // Samples between grains based on density
    this.samplesPerGrain = Math.floor(sampleRate / this.params.density);
  }

  private nextRandom(): number {
    if (this.randomSequence.length === 0) return 0.5;
    const value = this.randomSequence[this.randomIndex];
    this.randomIndex = (this.randomIndex + 1) % this.randomSequence.length;
    return value;
  }

  private spawnGrain() {
    // Probability check - skip grain based on probability
    if (this.nextRandom() > this.params.probability) {
      return;
    }

    // Find inactive grain
    const grain = this.grains.find((g) => !g.active);
    if (!grain) return;

    // Random grain size between min and max
    const sizeRange = this.params.grainSizeMax - this.params.grainSizeMin;
    const randomSize = this.params.grainSizeMin + this.nextRandom() * sizeRange;
    const grainSamples = Math.floor((randomSize / 1000) * sampleRate);
    const spraySamples = Math.floor((this.params.spray / 1000) * sampleRate);
    const jitterSamples = Math.floor((this.params.jitter / 1000) * sampleRate);

    // Random position in buffer (with spray)
    const basePos = (this.writePos - spraySamples + this.bufferSize) % this.bufferSize;
    const sprayOffset = Math.floor(this.nextRandom() * spraySamples);
    const jitterOffset = Math.floor((this.nextRandom() - 0.5) * 2 * jitterSamples);

    grain.position = (basePos - sprayOffset + jitterOffset + this.bufferSize) % this.bufferSize;
    grain.startSample = 0;
    grain.length = grainSamples;

    // Pitch: either random spread or harmonic intervals
    let pitchOffset: number;
    if (this.params.pitchMode === 'harmonic') {
      // Pick a random harmonic interval, weighted by pitch spread
      // pitchSpread controls how many intervals we can use (0 = unison only, 12 = all)
      const maxIntervalIndex = Math.floor((this.params.pitchSpread / 12) * HARMONIC_INTERVALS.length);
      const availableIntervals = HARMONIC_INTERVALS.slice(0, Math.max(1, maxIntervalIndex));
      const intervalIndex = Math.floor(this.nextRandom() * availableIntervals.length);
      pitchOffset = availableIntervals[intervalIndex];
    } else {
      // Random pitch spread in semitones
      pitchOffset = (this.nextRandom() - 0.5) * 2 * this.params.pitchSpread;
    }
    grain.playbackRate = Math.pow(2, pitchOffset / 12);

    // Stereo spread
    grain.pan = (this.nextRandom() - 0.5) * 2 * this.params.stereoSpread;

    grain.active = true;
  }

  // Hann window using lookup table (avoids Math.cos per sample)
  private hannWindow(position: number, length: number): number {
    const phase = position / length;
    const index = Math.floor(phase * (this.HANN_TABLE_SIZE - 1));
    const clampedIndex = Math.max(0, Math.min(this.HANN_TABLE_SIZE - 1, index));
    return this.hannTable[clampedIndex];
  }

  // Linear interpolation for buffer read
  private readBuffer(channel: number, position: number): number {
    const buf = this.buffer[channel];
    const pos = position % this.bufferSize;
    const index = Math.floor(pos);
    const frac = pos - index;
    const next = (index + 1) % this.bufferSize;
    return buf[index] * (1 - frac) + buf[next] * frac;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parameters: Record<string, Float32Array>
  ): boolean {
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

    const perfStart = this.perfEnabled ? performance.now() : 0;

    // Process each sample
    for (let i = 0; i < blockSize; i++) {
      // Write input to circular buffer
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      this.buffer[0][this.writePos] = inL;
      this.buffer[1][this.writePos] = inR;

      // Grain spawning
      if (this.initialized) {
        this.samplesSinceGrain++;
        if (this.samplesSinceGrain >= this.samplesPerGrain) {
          this.spawnGrain();
          this.samplesSinceGrain = 0;
        }
      }

      // Accumulate grain output
      let wetL = 0;
      let wetR = 0;

      for (let g = 0; g < this.grains.length; g++) {
        const grain = this.grains[g];
        if (!grain.active) continue;

        // Read from buffer with pitch shift
        const readPos = grain.position + grain.startSample * grain.playbackRate;
        const sampleL = this.readBuffer(0, readPos);
        const sampleR = this.readBuffer(1, readPos);

        // Apply Hann window envelope
        const envelope = this.hannWindow(grain.startSample, grain.length);

        // Apply panning using lookup table (avoids trig per grain per sample)
        const pan = this.getPan(grain.pan);

        wetL += sampleL * envelope * pan.l;
        wetR += sampleR * envelope * pan.r;

        // Advance grain
        grain.startSample++;
        if (grain.startSample >= grain.length) {
          grain.active = false;
        }
      }

      // Soft clip feedback to prevent runaway
      const feedbackL = Math.tanh(wetL * this.params.feedback);
      const feedbackR = Math.tanh(wetR * this.params.feedback);

      // Add feedback to buffer
      this.buffer[0][this.writePos] += feedbackL;
      this.buffer[1][this.writePos] += feedbackR;

      // Advance write position
      this.writePos = (this.writePos + 1) % this.bufferSize;

      // Output ONLY the wet granular signal (wetMix controls level)
      const level = this.params.wetMix;
      outputL[i] = wetL * level;
      outputR[i] = wetR * level;
    }

    // Performance reporting
    if (this.perfEnabled) {
      const elapsed = performance.now() - perfStart;
      this.perfTotalTime += elapsed;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;
      
      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        const budgetMs = (blockSize / sampleRate) * 1000;
        this.port.postMessage({
          type: 'perf',
          name: 'granulator',
          cpuPercent: (avgMs / budgetMs) * 100,
          avgTimeMs: avgMs,
        });
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
    }

    return true;
  }
}

registerProcessor('granulator', GranulatorProcessor);
