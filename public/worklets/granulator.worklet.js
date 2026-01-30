/**
 * Granular Synthesis AudioWorklet Processor
 */

const HARMONIC_INTERVALS = [
  0, 7, 12, -12, 19, 5, -7, 24, -5, 4, -24,
];

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
    this.grains = [];
    for (let i = 0; i < 100; i++) {
      this.grains.push({
        startSample: 0,
        position: 0,
        length: 0,
        playbackRate: 1,
        pan: 0,
        active: false,
      });
    }
    this.samplesSinceGrain = 0;
    this.samplesPerGrain = 2205;
    this.randomSequence = new Float32Array(0);
    this.randomIndex = 0;
    this.initialized = false;
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
    grain.pan = (this.nextRandom() - 0.5) * 2 * this.params.stereoSpread;
    grain.active = true;
  }

  hannWindow(position, length) {
    const phase = position / length;
    return 0.5 * (1 - Math.cos(2 * Math.PI * phase));
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
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

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
        const panAngle = (grain.pan + 1) * 0.25 * Math.PI;
        const panL = Math.cos(panAngle);
        const panR = Math.sin(panAngle);

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
