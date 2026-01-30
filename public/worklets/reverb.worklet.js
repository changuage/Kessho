/**
 * Ambient Reverb AudioWorklet Processor
 * 
 * Implements a smooth Feedback Delay Network (FDN) reverb designed for ambient music.
 */

// Interpolated delay line for smooth modulation
class SmoothDelay {
  constructor(maxSamples) {
    this.size = maxSamples;
    this.buffer = new Float32Array(maxSamples);
    this.writeIndex = 0;
  }

  write(sample) {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.size;
  }

  readInterpolated(delaySamples) {
    const readPos = this.writeIndex - delaySamples;
    const readIndex = ((readPos % this.size) + this.size) % this.size;
    const frac = readIndex - Math.floor(readIndex);
    const i0 = Math.floor(readIndex) % this.size;
    const i1 = (i0 + 1) % this.size;
    const im1 = (i0 - 1 + this.size) % this.size;
    const i2 = (i0 + 2) % this.size;
    
    const y0 = this.buffer[im1];
    const y1 = this.buffer[i0];
    const y2 = this.buffer[i1];
    const y3 = this.buffer[i2];
    
    const c0 = y1;
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    
    return ((c3 * frac + c2) * frac + c1) * frac + c0;
  }

  read(delaySamples) {
    const readPos = this.writeIndex - Math.floor(delaySamples);
    return this.buffer[((readPos % this.size) + this.size) % this.size];
  }
}

// Cascaded allpass diffuser
class DiffuserChain {
  constructor(delaySamples, feedback) {
    this.stages = [];
    for (const samples of delaySamples) {
      this.stages.push({
        delay: new SmoothDelay(samples + 100),
        feedback,
        delaySamples: samples,
      });
    }
  }

  process(input) {
    let x = input;
    for (const stage of this.stages) {
      const delayed = stage.delay.read(stage.delaySamples);
      const v = x - delayed * stage.feedback;
      stage.delay.write(v);
      x = delayed + v * stage.feedback;
    }
    return x;
  }

  setFeedback(fb) {
    for (const stage of this.stages) {
      stage.feedback = fb;
    }
  }
}

// One-pole lowpass for damping
class OnePole {
  constructor() {
    this.z1 = 0;
  }

  process(input, coeff) {
    this.z1 = input * (1 - coeff) + this.z1 * coeff;
    return this.z1;
  }
}

// DC blocker
class DCBlocker {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;
  }

  process(input) {
    const y = input - this.x1 + 0.9975 * this.y1;
    this.x1 = input;
    this.y1 = y;
    return y;
  }
}

function softClip(x) {
  if (x > 1) return 1 - 1 / (x + 1);
  if (x < -1) return -1 + 1 / (-x + 1);
  return x;
}

const PRESETS = {
  plate: { decay: 0.88, damping: 0.25, diffusion: 0.8, size: 0.8, modDepth: 0.25 },
  hall: { decay: 0.92, damping: 0.2, diffusion: 0.85, size: 1.0, modDepth: 0.3 },
  cathedral: { decay: 0.96, damping: 0.12, diffusion: 0.95, size: 1.5, modDepth: 0.4 },
  darkHall: { decay: 0.94, damping: 0.45, diffusion: 0.9, size: 1.3, modDepth: 0.3 },
};

const FDN_TIMES_MS = [37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3];

const DIFFUSER_TIMES_BASE = [
  [89, 127, 179, 233, 307, 401],
  [97, 137, 191, 251, 317, 419],
  [167, 229, 313, 421],
  [173, 241, 331, 433],
  [211, 283, 367, 457, 547, 641],
  [223, 293, 379, 467, 557, 653],
];

class ReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.params = {
      type: 'hall',
      decay: 0.8,
      size: 1.5,
      modulation: 0.3,
      predelay: 20,
      damping: 0.5,
      width: 0.8,
      diffusion: 0.8,
    };

    const sr = sampleRate;
    const scale = sr / 48000;

    this.fdnDelays = [];
    this.fdnDelayTimes = [];
    this.fdnDampers = [];

    for (let i = 0; i < 8; i++) {
      const baseTime = FDN_TIMES_MS[i] * scale;
      const maxSamples = Math.ceil(baseTime * sr / 1000 * 4);
      this.fdnDelays.push(new SmoothDelay(maxSamples));
      this.fdnDelayTimes.push(baseTime * sr / 1000);
      this.fdnDampers.push(new OnePole());
    }

    this.preDiffuserL = new DiffuserChain(
      DIFFUSER_TIMES_BASE[0].map(t => Math.floor(t * scale)), 0.65
    );
    this.preDiffuserR = new DiffuserChain(
      DIFFUSER_TIMES_BASE[1].map(t => Math.floor(t * scale)), 0.65
    );
    this.midDiffuserL = new DiffuserChain(
      DIFFUSER_TIMES_BASE[2].map(t => Math.floor(t * scale)), 0.55
    );
    this.midDiffuserR = new DiffuserChain(
      DIFFUSER_TIMES_BASE[3].map(t => Math.floor(t * scale)), 0.55
    );
    this.postDiffuserL = new DiffuserChain(
      DIFFUSER_TIMES_BASE[4].map(t => Math.floor(t * scale)), 0.5
    );
    this.postDiffuserR = new DiffuserChain(
      DIFFUSER_TIMES_BASE[5].map(t => Math.floor(t * scale)), 0.5
    );

    const maxPredelay = Math.ceil(0.3 * sr);
    this.predelayL = new SmoothDelay(maxPredelay);
    this.predelayR = new SmoothDelay(maxPredelay);
    this.predelaySamples = 0;

    this.modPhase1 = 0;
    this.modPhase2 = 0.25;
    this.modPhase3 = 0.5;
    this.modPhase4 = 0.75;

    this.dcBlockerL = new DCBlocker();
    this.dcBlockerR = new DCBlocker();

    this.smoothDamping = 0.5;
    this.feedbackGain = 0.85;

    this.updatePreset();
    this.updatePredelay();

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'params') {
        Object.assign(this.params, data.params);
        this.updatePreset();
        this.updatePredelay();
      }
    };
  }

  updatePredelay() {
    this.predelaySamples = Math.floor((this.params.predelay / 1000) * sampleRate);
  }

  updatePreset() {
    const preset = PRESETS[this.params.type] || PRESETS.hall;
    const userDecay = this.params.decay;
    const userSize = this.params.size;
    const userDiffusion = this.params.diffusion;

    const baseDecay = preset.decay;
    const effectiveDecay = baseDecay + (1 - baseDecay) * userDecay * 0.9;
    this.feedbackGain = Math.min(0.995, effectiveDecay);

    const sr = sampleRate;
    const scale = sr / 48000;
    for (let i = 0; i < 8; i++) {
      this.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000 * userSize;
    }

    const baseDiff = preset.diffusion;
    const effectiveDiff = baseDiff * (0.6 + userDiffusion * 0.4);
    
    const preFb = 0.5 + effectiveDiff * 0.4;
    const midFb = 0.45 + effectiveDiff * 0.4;
    const postFb = 0.4 + effectiveDiff * 0.4;
    
    this.preDiffuserL.setFeedback(preFb);
    this.preDiffuserR.setFeedback(preFb);
    this.midDiffuserL.setFeedback(midFb);
    this.midDiffuserR.setFeedback(midFb);
    this.postDiffuserL.setFeedback(postFb);
    this.postDiffuserR.setFeedback(postFb);
  }

  mixFDN(state) {
    const s = 0.3535533905932738;
    return [
      s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7]),
      s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7]),
      s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7]),
      s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7]),
      s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7]),
      s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7]),
      s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7]),
      s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7]),
    ];
  }

  process(inputs, outputs, _parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || input.length < 1 || output.length < 2) {
      return true;
    }

    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1];
    const blockSize = outputL.length;

    const targetDamping = this.params.damping;
    const width = this.params.width;
    const modulation = this.params.modulation;
    
    const modRate1 = 0.023;
    const modRate2 = 0.031;
    const modRate3 = 0.041;
    const modRate4 = 0.053;

    const preset = PRESETS[this.params.type] || PRESETS.hall;
    const modDepth = preset.modDepth * modulation;

    for (let i = 0; i < blockSize; i++) {
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      this.smoothDamping += (targetDamping - this.smoothDamping) * 0.0001;

      this.modPhase1 += modRate1 / sampleRate;
      this.modPhase2 += modRate2 / sampleRate;
      this.modPhase3 += modRate3 / sampleRate;
      this.modPhase4 += modRate4 / sampleRate;
      if (this.modPhase1 > 1) this.modPhase1 -= 1;
      if (this.modPhase2 > 1) this.modPhase2 -= 1;
      if (this.modPhase3 > 1) this.modPhase3 -= 1;
      if (this.modPhase4 > 1) this.modPhase4 -= 1;

      const tri1 = 1 - Math.abs(2 * this.modPhase1 - 1);
      const tri2 = 1 - Math.abs(2 * this.modPhase2 - 1);
      const tri3 = 1 - Math.abs(2 * this.modPhase3 - 1);
      const tri4 = 1 - Math.abs(2 * this.modPhase4 - 1);
      
      const mod1 = (tri1 - 0.5) * modDepth;
      const mod2 = (tri2 - 0.5) * modDepth;
      const mod3 = (tri3 - 0.5) * modDepth;
      const mod4 = (tri4 - 0.5) * modDepth;

      this.predelayL.write(inL);
      this.predelayR.write(inR);
      const delayedL = this.predelaySamples > 0 ? this.predelayL.read(this.predelaySamples) : inL;
      const delayedR = this.predelaySamples > 0 ? this.predelayR.read(this.predelaySamples) : inR;

      const diffInL = this.preDiffuserL.process(delayedL);
      const diffInR = this.preDiffuserR.process(delayedR);

      const reads = [];
      for (let j = 0; j < 8; j++) {
        const modAmount = j < 2 ? mod1 : j < 4 ? mod2 : j < 6 ? mod3 : mod4;
        const modOffset = modAmount * this.fdnDelayTimes[j] * 0.015;
        const delayTime = Math.max(1, this.fdnDelayTimes[j] + modOffset);
        reads.push(this.fdnDelays[j].readInterpolated(delayTime));
      }

      const damped = [];
      for (let j = 0; j < 8; j++) {
        damped.push(this.fdnDampers[j].process(reads[j], this.smoothDamping));
      }

      const mixed = this.mixFDN(damped);

      const midL = this.midDiffuserL.process((mixed[0] + mixed[2] + mixed[4] + mixed[6]) * 0.25);
      const midR = this.midDiffuserR.process((mixed[1] + mixed[3] + mixed[5] + mixed[7]) * 0.25);

      const inputGain = 0.2;
      for (let j = 0; j < 8; j++) {
        let inject = 0;
        if (j < 4) inject = diffInL * inputGain;
        else inject = diffInR * inputGain;
        
        const value = softClip(mixed[j] * this.feedbackGain + inject);
        this.fdnDelays[j].write(value);
      }

      let rawL = (reads[0] + reads[2] + reads[4] + reads[6] + reads[1] * 0.3 + reads[3] * 0.3) * 0.5;
      let rawR = (reads[1] + reads[3] + reads[5] + reads[7] + reads[0] * 0.3 + reads[2] * 0.3) * 0.5;

      rawL = rawL * 0.7 + midL * 0.3;
      rawR = rawR * 0.7 + midR * 0.3;

      rawL = this.postDiffuserL.process(rawL);
      rawR = this.postDiffuserR.process(rawR);

      rawL = this.dcBlockerL.process(rawL);
      rawR = this.dcBlockerR.process(rawR);

      const mid = (rawL + rawR) * 0.5;
      const side = (rawL - rawR) * 0.5;
      const wetL = mid + side * width;
      const wetR = mid - side * width;

      outputL[i] = wetL;
      outputR[i] = wetR;
    }

    return true;
  }
}

registerProcessor('reverb', ReverbProcessor);
