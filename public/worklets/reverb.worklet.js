/**
 * Ambient Reverb AudioWorklet Processor
 * 
 * Implements a smooth Feedback Delay Network (FDN) reverb designed for ambient music.
 * Optimized with block-rate modulation and linear interpolation.
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

  // Optimized: Linear interpolation instead of cubic Hermite
  readInterpolated(delaySamples) {
    const readPos = this.writeIndex - delaySamples;
    const readIndex = ((readPos % this.size) + this.size) % this.size;
    const i0 = Math.floor(readIndex);
    const frac = readIndex - i0;
    const i1 = (i0 + 1) % this.size;
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
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

// Full 8-channel FDN delay times in ms (ultra/balanced mode)
const FDN_TIMES_MS = [37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3];

// Lite 4-channel FDN delay times in ms (lite mode - simpler, less CPU)
const FDN_TIMES_LITE_MS = [41.3, 59.7, 79.1, 103.7];

// Balanced diffuser times - 16 stages total (6+4+6 pattern)
const DIFFUSER_TIMES_BASE = [
  [89, 127, 179, 233, 307, 401],
  [97, 137, 191, 251, 317, 419],
  [167, 229, 313, 421],
  [173, 241, 331, 433],
  [211, 283, 367, 457, 547, 641],
  [223, 293, 379, 467, 557, 653],
];

// Ultra diffuser times - 32 stages total (10+6+6+10 pattern) for maximum smear
const DIFFUSER_TIMES_ULTRA = [
  // Pre-diffuser L - 10 stages
  [53, 79, 107, 139, 173, 211, 257, 307, 367, 431],
  // Pre-diffuser R - 10 stages  
  [59, 83, 113, 149, 181, 223, 269, 317, 379, 443],
  // Mid-diffuser L - 6 stages
  [127, 179, 233, 293, 359, 431],
  // Mid-diffuser R - 6 stages
  [137, 191, 251, 307, 373, 449],
  // Post-diffuser L - 10 stages
  [167, 211, 263, 317, 383, 449, 521, 599, 683, 773],
  // Post-diffuser R - 10 stages
  [179, 227, 277, 331, 397, 467, 541, 617, 701, 797],
];

// Lite diffuser times - fewer stages for lower CPU
const DIFFUSER_TIMES_LITE = [
  [113, 197, 293],  // Pre L
  [127, 211, 307],  // Pre R
  [179, 283],       // Post L
  [191, 307],       // Post R
];

class ReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.params = {
      type: 'hall',
      quality: 'balanced',  // ultra, balanced, lite
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

    // Full 8-channel FDN (ultra/balanced)
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

    // Lite 4-channel FDN
    this.fdnDelaysLite = [];
    this.fdnDelayTimesLite = [];
    this.fdnDampersLite = [];

    for (let i = 0; i < 4; i++) {
      const baseTime = FDN_TIMES_LITE_MS[i] * scale;
      const maxSamples = Math.ceil(baseTime * sr / 1000 * 4);
      this.fdnDelaysLite.push(new SmoothDelay(maxSamples));
      this.fdnDelayTimesLite.push(baseTime * sr / 1000);
      this.fdnDampersLite.push(new OnePole());
    }

    // Full diffusers (balanced - 16 stages)
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

    // Ultra diffusers (32 stages - maximum quality)
    this.preDiffuserLUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[0].map(t => Math.floor(t * scale)), 0.62
    );
    this.preDiffuserRUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[1].map(t => Math.floor(t * scale)), 0.62
    );
    this.midDiffuserLUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[2].map(t => Math.floor(t * scale)), 0.55
    );
    this.midDiffuserRUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[3].map(t => Math.floor(t * scale)), 0.55
    );
    this.postDiffuserLUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[4].map(t => Math.floor(t * scale)), 0.48
    );
    this.postDiffuserRUltra = new DiffuserChain(
      DIFFUSER_TIMES_ULTRA[5].map(t => Math.floor(t * scale)), 0.48
    );

    // Lite diffusers (fewer stages)
    this.preDiffuserLLite = new DiffuserChain(
      DIFFUSER_TIMES_LITE[0].map(t => Math.floor(t * scale)), 0.6
    );
    this.preDiffuserRLite = new DiffuserChain(
      DIFFUSER_TIMES_LITE[1].map(t => Math.floor(t * scale)), 0.6
    );
    this.postDiffuserLLite = new DiffuserChain(
      DIFFUSER_TIMES_LITE[2].map(t => Math.floor(t * scale)), 0.5
    );
    this.postDiffuserRLite = new DiffuserChain(
      DIFFUSER_TIMES_LITE[3].map(t => Math.floor(t * scale)), 0.5
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

    // Block-rate modulation values (computed once per block)
    this.blockMod1 = 0;
    this.blockMod2 = 0;
    this.blockMod3 = 0;
    this.blockMod4 = 0;

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
    const quality = this.params.quality || 'balanced';

    const baseDecay = preset.decay;
    const effectiveDecay = baseDecay + (1 - baseDecay) * userDecay * 0.9;
    this.feedbackGain = Math.min(0.995, effectiveDecay);

    const sr = sampleRate;
    const scale = sr / 48000;
    
    // Update full FDN delay times
    for (let i = 0; i < 8; i++) {
      this.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000 * userSize;
    }
    
    // Update lite FDN delay times
    for (let i = 0; i < 4; i++) {
      this.fdnDelayTimesLite[i] = FDN_TIMES_LITE_MS[i] * scale * sr / 1000 * userSize;
    }

    const baseDiff = preset.diffusion;
    const effectiveDiff = baseDiff * (0.6 + userDiffusion * 0.4);
    
    const preFb = 0.5 + effectiveDiff * 0.4;
    const midFb = 0.45 + effectiveDiff * 0.4;
    const postFb = 0.4 + effectiveDiff * 0.4;
    
    // Full (balanced) diffusers
    this.preDiffuserL.setFeedback(preFb);
    this.preDiffuserR.setFeedback(preFb);
    this.midDiffuserL.setFeedback(midFb);
    this.midDiffuserR.setFeedback(midFb);
    this.postDiffuserL.setFeedback(postFb);
    this.postDiffuserR.setFeedback(postFb);
    
    // Ultra diffusers - slightly lower feedback for more stages
    const ultraPreFb = preFb * 0.92;
    const ultraMidFb = midFb * 0.90;
    const ultraPostFb = postFb * 0.88;
    this.preDiffuserLUltra.setFeedback(ultraPreFb);
    this.preDiffuserRUltra.setFeedback(ultraPreFb);
    this.midDiffuserLUltra.setFeedback(ultraMidFb);
    this.midDiffuserRUltra.setFeedback(ultraMidFb);
    this.postDiffuserLUltra.setFeedback(ultraPostFb);
    this.postDiffuserRUltra.setFeedback(ultraPostFb);
    
    // Lite diffusers
    this.preDiffuserLLite.setFeedback(preFb * 0.95);
    this.preDiffuserRLite.setFeedback(preFb * 0.95);
    this.postDiffuserLLite.setFeedback(postFb);
    this.postDiffuserRLite.setFeedback(postFb);
  }

  // 4-channel Hadamard-like mixing for lite mode
  mixFDNLite(state) {
    const s = 0.5;  // 1/sqrt(4) for 4-channel
    return [
      s * (state[0] + state[1] + state[2] + state[3]),
      s * (state[0] - state[1] + state[2] - state[3]),
      s * (state[0] + state[1] - state[2] - state[3]),
      s * (state[0] - state[1] - state[2] + state[3]),
    ];
  }

  // 8-channel Hadamard mixing for full mode
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

    // Route to lite, balanced, or ultra processing based on quality setting
    const quality = this.params.quality || 'balanced';
    if (quality === 'lite') {
      return this.processLite(inputs, outputs);
    } else if (quality === 'ultra') {
      return this.processUltra(inputs, outputs);
    }
    
    return this.processFull(inputs, outputs);
  }

  // Lite 4-channel FDN processing - lower CPU usage
  processLite(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    
    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1];
    const blockSize = outputL.length;

    const targetDamping = this.params.damping;
    const width = this.params.width;
    const modulation = this.params.modulation;
    
    const modRate1 = 0.023;
    const modRate2 = 0.041;

    const preset = PRESETS[this.params.type] || PRESETS.hall;
    const modDepth = preset.modDepth * modulation;

    // Block-rate modulation (2 phases for lite)
    this.modPhase1 += modRate1 * blockSize / sampleRate;
    this.modPhase2 += modRate2 * blockSize / sampleRate;
    if (this.modPhase1 > 1) this.modPhase1 -= 1;
    if (this.modPhase2 > 1) this.modPhase2 -= 1;

    const tri1 = 1 - Math.abs(2 * this.modPhase1 - 1);
    const tri2 = 1 - Math.abs(2 * this.modPhase2 - 1);
    
    this.blockMod1 = (tri1 - 0.5) * modDepth;
    this.blockMod2 = (tri2 - 0.5) * modDepth;

    for (let i = 0; i < blockSize; i++) {
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      this.smoothDamping += (targetDamping - this.smoothDamping) * 0.0001;

      // Predelay
      this.predelayL.write(inL);
      this.predelayR.write(inR);
      const delayedL = this.predelaySamples > 0 ? this.predelayL.read(this.predelaySamples) : inL;
      const delayedR = this.predelaySamples > 0 ? this.predelayR.read(this.predelaySamples) : inR;

      // Lite pre-diffuser
      const diffInL = this.preDiffuserLLite.process(delayedL);
      const diffInR = this.preDiffuserRLite.process(delayedR);

      // 4-channel FDN reads with modulation
      const reads = [];
      for (let j = 0; j < 4; j++) {
        const modAmount = j < 2 ? this.blockMod1 : this.blockMod2;
        const modOffset = modAmount * this.fdnDelayTimesLite[j] * 0.015;
        const delayTime = Math.max(1, this.fdnDelayTimesLite[j] + modOffset);
        reads.push(this.fdnDelaysLite[j].readInterpolated(delayTime));
      }

      // Damping
      const damped = [];
      for (let j = 0; j < 4; j++) {
        damped.push(this.fdnDampersLite[j].process(reads[j], this.smoothDamping));
      }

      // 4-channel mixing
      const mixed = this.mixFDNLite(damped);

      // Inject input and write back
      const inputGain = 0.25;
      for (let j = 0; j < 4; j++) {
        const inject = j < 2 ? diffInL * inputGain : diffInR * inputGain;
        const value = softClip(mixed[j] * this.feedbackGain + inject);
        this.fdnDelaysLite[j].write(value);
      }

      // Output mixing
      let rawL = (reads[0] + reads[2] + reads[1] * 0.3) * 0.6;
      let rawR = (reads[1] + reads[3] + reads[0] * 0.3) * 0.6;

      // Lite post-diffuser
      rawL = this.postDiffuserLLite.process(rawL);
      rawR = this.postDiffuserRLite.process(rawR);

      // DC blocking
      rawL = this.dcBlockerL.process(rawL);
      rawR = this.dcBlockerR.process(rawR);

      // Stereo width
      const mid = (rawL + rawR) * 0.5;
      const side = (rawL - rawR) * 0.5;
      const wetL = mid + side * width;
      const wetR = mid - side * width;

      outputL[i] = wetL;
      outputR[i] = wetR;
    }

    return true;
  }

  // Full 8-channel FDN processing (ultra/balanced quality)
  processFull(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

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

    // OPTIMIZATION: Block-rate modulation - compute once per block instead of per sample
    this.modPhase1 += modRate1 * blockSize / sampleRate;
    this.modPhase2 += modRate2 * blockSize / sampleRate;
    this.modPhase3 += modRate3 * blockSize / sampleRate;
    this.modPhase4 += modRate4 * blockSize / sampleRate;
    if (this.modPhase1 > 1) this.modPhase1 -= 1;
    if (this.modPhase2 > 1) this.modPhase2 -= 1;
    if (this.modPhase3 > 1) this.modPhase3 -= 1;
    if (this.modPhase4 > 1) this.modPhase4 -= 1;

    const tri1 = 1 - Math.abs(2 * this.modPhase1 - 1);
    const tri2 = 1 - Math.abs(2 * this.modPhase2 - 1);
    const tri3 = 1 - Math.abs(2 * this.modPhase3 - 1);
    const tri4 = 1 - Math.abs(2 * this.modPhase4 - 1);
    
    this.blockMod1 = (tri1 - 0.5) * modDepth;
    this.blockMod2 = (tri2 - 0.5) * modDepth;
    this.blockMod3 = (tri3 - 0.5) * modDepth;
    this.blockMod4 = (tri4 - 0.5) * modDepth;

    for (let i = 0; i < blockSize; i++) {
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      this.smoothDamping += (targetDamping - this.smoothDamping) * 0.0001;
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

      // Use block-rate modulation values
      const reads = [];
      for (let j = 0; j < 8; j++) {
        const modAmount = j < 2 ? this.blockMod1 : j < 4 ? this.blockMod2 : j < 6 ? this.blockMod3 : this.blockMod4;
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

  // Ultra quality processing - 32 diffuser stages for maximum smear
  processUltra(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

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

    // OPTIMIZATION: Block-rate modulation - compute once per block instead of per sample
    this.modPhase1 += modRate1 * blockSize / sampleRate;
    this.modPhase2 += modRate2 * blockSize / sampleRate;
    this.modPhase3 += modRate3 * blockSize / sampleRate;
    this.modPhase4 += modRate4 * blockSize / sampleRate;
    if (this.modPhase1 > 1) this.modPhase1 -= 1;
    if (this.modPhase2 > 1) this.modPhase2 -= 1;
    if (this.modPhase3 > 1) this.modPhase3 -= 1;
    if (this.modPhase4 > 1) this.modPhase4 -= 1;

    const tri1 = 1 - Math.abs(2 * this.modPhase1 - 1);
    const tri2 = 1 - Math.abs(2 * this.modPhase2 - 1);
    const tri3 = 1 - Math.abs(2 * this.modPhase3 - 1);
    const tri4 = 1 - Math.abs(2 * this.modPhase4 - 1);
    
    this.blockMod1 = (tri1 - 0.5) * modDepth;
    this.blockMod2 = (tri2 - 0.5) * modDepth;
    this.blockMod3 = (tri3 - 0.5) * modDepth;
    this.blockMod4 = (tri4 - 0.5) * modDepth;

    for (let i = 0; i < blockSize; i++) {
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      this.smoothDamping += (targetDamping - this.smoothDamping) * 0.0001;
      const tri4 = 1 - Math.abs(2 * this.modPhase4 - 1);
      
      const mod1 = (tri1 - 0.5) * modDepth;
      const mod2 = (tri2 - 0.5) * modDepth;
      const mod3 = (tri3 - 0.5) * modDepth;
      const mod4 = (tri4 - 0.5) * modDepth;

      this.predelayL.write(inL);
      this.predelayR.write(inR);
      const delayedL = this.predelaySamples > 0 ? this.predelayL.read(this.predelaySamples) : inL;
      const delayedR = this.predelaySamples > 0 ? this.predelayR.read(this.predelaySamples) : inR;

      // Ultra: Use 10-stage pre-diffusers for maximum smear
      const diffInL = this.preDiffuserLUltra.process(delayedL);
      const diffInR = this.preDiffuserRUltra.process(delayedR);

      // Use block-rate modulation values
      const reads = [];
      for (let j = 0; j < 8; j++) {
        const modAmount = j < 2 ? this.blockMod1 : j < 4 ? this.blockMod2 : j < 6 ? this.blockMod3 : this.blockMod4;
        const modOffset = modAmount * this.fdnDelayTimes[j] * 0.015;
        const delayTime = Math.max(1, this.fdnDelayTimes[j] + modOffset);
        reads.push(this.fdnDelays[j].readInterpolated(delayTime));
      }

      const damped = [];
      for (let j = 0; j < 8; j++) {
        damped.push(this.fdnDampers[j].process(reads[j], this.smoothDamping));
      }

      const mixed = this.mixFDN(damped);

      // Ultra: Use 6-stage mid-diffusers for enhanced density
      const midL = this.midDiffuserLUltra.process((mixed[0] + mixed[2] + mixed[4] + mixed[6]) * 0.25);
      const midR = this.midDiffuserRUltra.process((mixed[1] + mixed[3] + mixed[5] + mixed[7]) * 0.25);

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

      // Ultra: Use 10-stage post-diffusers for maximum tail diffusion
      rawL = this.postDiffuserLUltra.process(rawL);
      rawR = this.postDiffuserRUltra.process(rawR);

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
