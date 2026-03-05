/**
 * Ambient Reverb AudioWorklet Processor
 * 
 * Implements a smooth Feedback Delay Network (FDN) reverb designed for ambient music:
 * - 8-channel FDN with Hadamard mixing matrix
 * - Multiple cascaded allpass diffusers for heavy smearing
 * - Interpolated delay lines for smooth modulation
 * - Ultra-slow modulation for subtle shimmer
 * - User-controllable diffusion amount
 * - Presets: Plate, Hall, Cathedral, Dark Hall
 */

/// <reference path="../../vite-env.d.ts" />

// Safe performance.now() — not all AudioWorklet scopes expose `performance`
const _perfNow: () => number = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

interface ReverbParams {
  type: 'plate' | 'hall' | 'cathedral' | 'darkHall';
  quality: 'ultra' | 'balanced' | 'lite';  // ultra=8-ch + mid diffusion, balanced=8-ch, lite=4-ch
  predelay: number;  // ms
  damping: number;   // 0-1
  width: number;     // 0-1
  decay: number;     // 0-1 (user control)
  size: number;      // 0.5-3.0 (user control)
  modulation: number; // 0-1 (chorus-like modulation)
  diffusion: number; // 0-1 (smear amount)
  infinite: boolean; // When true, feedback=1.0 for infinite reverb / freeze
  // Advanced: shimmer, slow modulation, reverse
  shimmer: number;        // 0-1 pitch-shifted feedback amount
  shimmerPitch: number;   // semitones (-24 to +24)
  slowModRate: number;    // Hz (0.01-0.2)
  slowModDepth: number;   // 0-1 character drift intensity
  freeze: boolean;        // infinite sustain mode
  reverse: number;        // 0-1 reverse tail blend
  reverseLength: number;  // seconds (0.5-16.0)
}

// One-pole highpass filter for removing subsonic buildup in FDN feedback
class OnePoleHP {
  private z1 = 0;

  process(input: number, coeff: number): number {
    // y[n] = x[n] - z1 + coeff * z1  → HPF via DC-blocking topology
    const y = input - this.z1 + coeff * this.z1;
    this.z1 = y;
    return y;
  }
}

// Interpolated delay line for smooth modulation
class SmoothDelay {
  private buffer: Float32Array;
  private writeIndex = 0;
  private size: number;

  constructor(maxSamples: number) {
    this.size = maxSamples;
    this.buffer = new Float32Array(maxSamples);
  }

  write(sample: number) {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.size;
  }

  // Read with linear interpolation (sufficient for slow modulation)
  readInterpolated(delaySamples: number): number {
    const readPos = this.writeIndex - delaySamples;
    const readPosWrapped = ((readPos % this.size) + this.size);
    const i0 = (readPosWrapped | 0) % this.size;
    const i1 = (i0 + 1) % this.size;
    const frac = readPosWrapped - (readPosWrapped | 0);
    
    return this.buffer[i0] + (this.buffer[i1] - this.buffer[i0]) * frac;
  }

  read(delaySamples: number): number {
    const readPos = this.writeIndex - (delaySamples | 0);
    return this.buffer[((readPos % this.size) + this.size) % this.size];
  }
}

// Cascaded allpass diffuser - multiple stages for heavy smearing
class DiffuserChain {
  private delays: SmoothDelay[];
  private feedbacks: Float32Array;
  private delaySamplesList: Float32Array;
  private stageCount: number;

  constructor(delaySamples: number[], feedback: number) {
    this.stageCount = delaySamples.length;
    this.delays = [];
    this.feedbacks = new Float32Array(this.stageCount);
    this.delaySamplesList = new Float32Array(this.stageCount);
    
    for (let i = 0; i < this.stageCount; i++) {
      this.delays.push(new SmoothDelay(delaySamples[i] + 100));
      this.feedbacks[i] = feedback;
      this.delaySamplesList[i] = delaySamples[i];
    }
  }

  process(input: number): number {
    let x = input;
    for (let i = 0; i < this.stageCount; i++) {
      const delayed = this.delays[i].read(this.delaySamplesList[i]);
      const fb = this.feedbacks[i];
      const v = x - delayed * fb;
      this.delays[i].write(v);
      x = delayed + v * fb;
    }
    return x;
  }

  setFeedback(fb: number) {
    for (let i = 0; i < this.stageCount; i++) {
      this.feedbacks[i] = fb;
    }
  }
}

// One-pole lowpass for damping
class OnePole {
  private z1 = 0;

  process(input: number, coeff: number): number {
    this.z1 = input * (1 - coeff) + this.z1 * coeff;
    return this.z1;
  }
}

// DC blocker to prevent buildup
class DCBlocker {
  private x1 = 0;
  private y1 = 0;

  process(input: number): number {
    const y = input - this.x1 + 0.9975 * this.y1;
    this.x1 = input;
    this.y1 = y;
    return y;
  }
}

// Soft clipper to prevent harsh transients
function softClip(x: number): number {
  if (x > 1) return 1 - 1 / (x + 1);
  if (x < -1) return -1 + 1 / (-x + 1);
  return x;
}

// Preset configurations
const PRESETS: Record<string, { decay: number; damping: number; diffusion: number; size: number; modDepth: number }> = {
  plate: { decay: 0.88, damping: 0.25, diffusion: 0.8, size: 0.8, modDepth: 0.25 },
  hall: { decay: 0.92, damping: 0.2, diffusion: 0.85, size: 1.0, modDepth: 0.3 },
  cathedral: { decay: 0.96, damping: 0.12, diffusion: 0.95, size: 1.5, modDepth: 0.4 },
  darkHall: { decay: 0.94, damping: 0.45, diffusion: 0.9, size: 1.3, modDepth: 0.3 },
};

// FDN delay times in ms (prime-ish for rich decay, longer for more wash)
const FDN_TIMES_MS = [37.3, 43.7, 53.1, 61.7, 71.3, 83.9, 97.1, 109.3];

// Diffuser times in samples at 48kHz - MORE stages for heavier smearing
const DIFFUSER_TIMES_BASE = [
  // Pre-diffuser L - 6 stages
  [89, 127, 179, 233, 307, 401],
  // Pre-diffuser R - 6 stages  
  [97, 137, 191, 251, 317, 419],
  // Mid-diffuser L - 4 stages
  [167, 229, 313, 421],
  // Mid-diffuser R - 4 stages
  [173, 241, 331, 433],
  // Post-diffuser L - 6 stages
  [211, 283, 367, 457, 547, 641],
  // Post-diffuser R - 6 stages
  [223, 293, 379, 467, 557, 653],
];

class ReverbProcessor extends AudioWorkletProcessor {
  private params: ReverbParams = {
    type: 'hall',
    quality: 'balanced',
    decay: 0.8,
    size: 1.5,
    modulation: 0.3,
    predelay: 20,
    damping: 0.5,
    width: 0.8,
    diffusion: 0.8,
    infinite: false,
    shimmer: 0,
    shimmerPitch: 12,
    slowModRate: 0.05,
    slowModDepth: 0,
    freeze: false,
    reverse: 0,
    reverseLength: 2,
  };

  // FDN components
  private fdnDelays: SmoothDelay[] = [];
  private fdnDelayTimes: number[] = [];
  private fdnDampers: OnePole[] = [];

  // Diffusers (pre, mid, and post FDN)
  private preDiffuserL: DiffuserChain;
  private preDiffuserR: DiffuserChain;
  private midDiffuserL: DiffuserChain;
  private midDiffuserR: DiffuserChain;
  private postDiffuserL: DiffuserChain;
  private postDiffuserR: DiffuserChain;

  // Predelay
  private predelayL: SmoothDelay;
  private predelayR: SmoothDelay;
  private predelaySamples = 0;

  // Ultra-slow modulation (multiple phases for richness)
  private modPhase1 = 0;
  private modPhase2 = 0.25;
  private modPhase3 = 0.5;
  private modPhase4 = 0.75;

  // DC blockers
  private dcBlockerL = new DCBlocker();
  private dcBlockerR = new DCBlocker();

  // HPF in FDN feedback — prevents low-end mud on long decays
  private fdnHPFs: OnePoleHP[] = [];
  private hpCoeff = 0.995; // ~35Hz at 48kHz

  // Infinite/freeze mode
  private infinite = false;

  // Smooth parameter interpolation
  private smoothDamping = 0.5;

  // Feedback gain
  private feedbackGain = 0.85;

  // Pre-allocated arrays to avoid GC during process()
  private fdnReads = new Float64Array(8);
  private fdnDamped = new Float64Array(8);
  private fdnMixed = new Float64Array(8);

  // Performance monitoring
  private perfEnabled = false;
  private perfTotalTime = 0;
  private perfCount = 0;
  private perfSamplesSinceReport = 0;
  private perfReportInterval = 48000; // ~1 second

  // Shimmer — micro-grain pitch shifter in feedback loop
  private shimmerBufL: Float32Array;
  private shimmerBufR: Float32Array;
  private shimmerBufSize = 4096;
  private shimmerWriteIdx = 0;
  private shimmerPhase0 = 0;
  private shimmerPhase1 = 0.5; // half-offset for overlap-add
  private shimmerPitchRatio = 2; // default +12 semitones = octave up

  // Slow modulation — character drift (Nightsky/Blackhole-style breathing)
  private slowModPhase1 = 0;
  private slowModPhase2 = 1.2; // secondary offset for uncorrelated modulation

  // Reverse tail — reads reverb output backwards with windowed crossfade
  private reverseBufL: Float32Array;
  private reverseBufR: Float32Array;
  private reverseBufSize: number;
  private reverseWriteIdx = 0;
  private reverseReadPhase = 0;
  private reverseEnvPhase = 0;
  private reverseCycleLen: number;

  constructor() {
    super();

    const sr = sampleRate;
    const scale = sr / 48000;

    // Initialize FDN delay lines with larger buffers
    for (let i = 0; i < 8; i++) {
      const baseTime = FDN_TIMES_MS[i] * scale;
      const maxSamples = Math.ceil(baseTime * sr / 1000 * 4); // Extra room for size + modulation
      this.fdnDelays.push(new SmoothDelay(maxSamples));
      this.fdnDelayTimes.push(baseTime * sr / 1000);
      this.fdnDampers.push(new OnePole());
      this.fdnHPFs.push(new OnePoleHP());
    }

    // HPF coefficient for ~35Hz cutoff: coeff = 1 - (2π * fc / sr)
    this.hpCoeff = 1 - (2 * Math.PI * 35 / sr);

    // Initialize diffusers with scaled times - 3 stages now
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

    // Predelay (up to 300ms)
    const maxPredelay = Math.ceil(0.3 * sr);
    this.predelayL = new SmoothDelay(maxPredelay);
    this.predelayR = new SmoothDelay(maxPredelay);

    // Shimmer buffer (fixed size, enough for grain overlap)
    this.shimmerBufL = new Float32Array(this.shimmerBufSize);
    this.shimmerBufR = new Float32Array(this.shimmerBufSize);

    // Reverse buffer (max 16 seconds at sample rate)
    this.reverseBufSize = Math.ceil(16 * sr);
    this.reverseBufL = new Float32Array(this.reverseBufSize);
    this.reverseBufR = new Float32Array(this.reverseBufSize);
    this.reverseCycleLen = Math.ceil(2 * sr); // default 2s

    this.updatePreset();
    this.updatePredelay();

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'enablePerf') {
        this.perfEnabled = data.enabled;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      } else if (data.type === 'params') {
        Object.assign(this.params, data.params);
        this.infinite = !!this.params.infinite || !!this.params.freeze;
        // Update shimmer pitch ratio
        this.shimmerPitchRatio = Math.pow(2, (this.params.shimmerPitch ?? 12) / 12);
        // Update reverse cycle length
        const revLen = this.params.reverseLength ?? 2;
        this.reverseCycleLen = Math.min(this.reverseBufSize, Math.round(revLen * sr));
        this.updatePreset();
        this.updatePredelay();
      }
    };
  }

  private updatePredelay() {
    this.predelaySamples = Math.floor((this.params.predelay / 1000) * sampleRate);
  }

  private updatePreset() {
    const preset = PRESETS[this.params.type] || PRESETS.hall;
    const userDecay = this.params.decay;
    const userSize = this.params.size;
    const userDiffusion = this.params.diffusion;

    // Calculate feedback gain for desired RT60 - allow higher for ambient wash
    const baseDecay = preset.decay;
    const effectiveDecay = baseDecay + (1 - baseDecay) * userDecay * 0.9;
    // In freeze mode, feedback = 1.0 for never-decaying reverb tail
    this.feedbackGain = (this.infinite || this.params.freeze) ? 1.0 : Math.min(0.995, effectiveDecay);

    // Update FDN delay times based on size
    const sr = sampleRate;
    const scale = sr / 48000;
    for (let i = 0; i < 8; i++) {
      this.fdnDelayTimes[i] = FDN_TIMES_MS[i] * scale * sr / 1000 * userSize;
    }

    // Update diffuser feedback based on user diffusion control
    // Higher diffusion = more smearing - boosted ranges for ambient pad
    const baseDiff = preset.diffusion;
    const effectiveDiff = baseDiff * (0.6 + userDiffusion * 0.4);
    
    // Higher base values for more wash
    const preFb = 0.5 + effectiveDiff * 0.4;   // 0.5-0.9
    const midFb = 0.45 + effectiveDiff * 0.4;  // 0.45-0.85
    const postFb = 0.4 + effectiveDiff * 0.4;  // 0.4-0.8
    
    this.preDiffuserL.setFeedback(preFb);
    this.preDiffuserR.setFeedback(preFb);
    this.midDiffuserL.setFeedback(midFb);
    this.midDiffuserR.setFeedback(midFb);
    this.postDiffuserL.setFeedback(postFb);
    this.postDiffuserR.setFeedback(postFb);
  }

  // Hadamard-like mixing for FDN (orthogonal matrix)
  // Writes to pre-allocated fdnMixed array to avoid allocations
  private mixFDN(state: Float64Array): void {
    const s = 0.3535533905932738; // 1/sqrt(8)
    this.fdnMixed[0] = s * (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + state[6] + state[7]);
    this.fdnMixed[1] = s * (state[0] - state[1] + state[2] - state[3] + state[4] - state[5] + state[6] - state[7]);
    this.fdnMixed[2] = s * (state[0] + state[1] - state[2] - state[3] + state[4] + state[5] - state[6] - state[7]);
    this.fdnMixed[3] = s * (state[0] - state[1] - state[2] + state[3] + state[4] - state[5] - state[6] + state[7]);
    this.fdnMixed[4] = s * (state[0] + state[1] + state[2] + state[3] - state[4] - state[5] - state[6] - state[7]);
    this.fdnMixed[5] = s * (state[0] - state[1] + state[2] - state[3] - state[4] + state[5] - state[6] + state[7]);
    this.fdnMixed[6] = s * (state[0] + state[1] - state[2] - state[3] - state[4] - state[5] + state[6] + state[7]);
    this.fdnMixed[7] = s * (state[0] - state[1] - state[2] + state[3] - state[4] + state[5] + state[6] - state[7]);
  }

  // 4×4 Hadamard mixing for Lite quality mode (4-channel FDN)
  private mixFDN4(state: Float64Array): void {
    const s = 0.5; // 1/sqrt(4)
    this.fdnMixed[0] = s * (state[0] + state[1] + state[2] + state[3]);
    this.fdnMixed[1] = s * (state[0] - state[1] + state[2] - state[3]);
    this.fdnMixed[2] = s * (state[0] + state[1] - state[2] - state[3]);
    this.fdnMixed[3] = s * (state[0] - state[1] - state[2] + state[3]);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parameters: Record<string, Float32Array>
  ): boolean {
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

    const preset = PRESETS[this.params.type] || PRESETS.hall;
    const modDepth = preset.modDepth * modulation;

    const perfStart = this.perfEnabled ? _perfNow() : 0;

    // Pre-compute modulation values ONCE per block (ultra-slow LFO, negligible change per 128 samples)
    // Ultra-slow LFO rates (0.02-0.06 Hz = 16-50 second cycles)
    const blockPhaseIncrement = blockSize / sampleRate;
    const modRate1 = 0.023;
    const modRate2 = 0.031;
    const modRate3 = 0.041;
    const modRate4 = 0.053;
    
    // Smooth triangle wave modulation (less harsh than sine at extremes)
    const tri1 = 1 - Math.abs(2 * this.modPhase1 - 1);
    const tri2 = 1 - Math.abs(2 * this.modPhase2 - 1);
    const tri3 = 1 - Math.abs(2 * this.modPhase3 - 1);
    const tri4 = 1 - Math.abs(2 * this.modPhase4 - 1);
    
    const mod1 = (tri1 - 0.5) * modDepth;
    const mod2 = (tri2 - 0.5) * modDepth;
    const mod3 = (tri3 - 0.5) * modDepth;
    const mod4 = (tri4 - 0.5) * modDepth;
    
    // Update phases once per block
    this.modPhase1 += modRate1 * blockPhaseIncrement;
    this.modPhase2 += modRate2 * blockPhaseIncrement;
    this.modPhase3 += modRate3 * blockPhaseIncrement;
    this.modPhase4 += modRate4 * blockPhaseIncrement;
    if (this.modPhase1 > 1) this.modPhase1 -= 1;
    if (this.modPhase2 > 1) this.modPhase2 -= 1;
    if (this.modPhase3 > 1) this.modPhase3 -= 1;
    if (this.modPhase4 > 1) this.modPhase4 -= 1;

    // Smooth damping once per block instead of per sample (128× reduction)
    this.smoothDamping += (targetDamping - this.smoothDamping) * (1 - Math.pow(1 - 0.0001, blockSize));

    // Freeze mode: override feedback/damping per block
    const isFrozen = this.params.freeze || this.infinite;
    let blockFeedback = isFrozen ? 1.0 : this.feedbackGain;
    let blockDamping = isFrozen ? 0 : this.smoothDamping;

    // Slow modulation — character drift (once per block, ultra-cheap)
    const slowModDepth = this.params.slowModDepth ?? 0;
    if (slowModDepth > 0 && !isFrozen) {
      const slowRate = this.params.slowModRate ?? 0.05;
      const TAU = 2 * Math.PI;
      this.slowModPhase1 += TAU * slowRate * blockPhaseIncrement;
      this.slowModPhase2 += TAU * slowRate * 1.37 * blockPhaseIncrement;
      if (this.slowModPhase1 > TAU) this.slowModPhase1 -= TAU;
      if (this.slowModPhase2 > TAU) this.slowModPhase2 -= TAU;

      const mod1Slow = Math.sin(this.slowModPhase1);
      const mod2Slow = Math.sin(this.slowModPhase2);

      // Modulate feedback gain ±6% (subtle decay length breathing)
      blockFeedback = Math.min(0.998, blockFeedback * (1 + mod1Slow * slowModDepth * 0.06));
      // Modulate damping ±0.15 (tone character slowly shifts bright/dark)
      blockDamping = Math.max(0, Math.min(1, blockDamping + mod2Slow * slowModDepth * 0.15));
    }

    // Shimmer setup (per-block constants)
    const shimmerAmount = this.params.shimmer ?? 0;
    const shimmerGrainSize = 1024; // ~21ms at 48kHz
    const shimmerPhaseInc = 1 / shimmerGrainSize;

    // Reverse setup (per-block constants)
    const reverseAmount = this.params.reverse ?? 0;
    const rCycleLen = this.reverseCycleLen;

    // Quality branching: lite=4-ch FDN, balanced=8-ch, ultra=8-ch + mid-diffusion
    const isLite = this.params.quality === 'lite';
    const useMidDiffusion = this.params.quality === 'ultra';
    const fdnCount = isLite ? 4 : 8;

    for (let i = 0; i < blockSize; i++) {
      const inL = inputL[i] || 0;
      const inR = inputR[i] || 0;

      // Predelay
      this.predelayL.write(inL);
      this.predelayR.write(inR);
      const delayedL = this.predelaySamples > 0 ? this.predelayL.read(this.predelaySamples) : inL;
      const delayedR = this.predelaySamples > 0 ? this.predelayR.read(this.predelaySamples) : inR;

      // Pre-diffusion (heavy smear on input)
      const diffInL = this.preDiffuserL.process(delayedL);
      const diffInR = this.preDiffuserR.process(delayedR);

      // Read from FDN delay lines with modulation
      for (let j = 0; j < fdnCount; j++) {
        const modAmount = j < 2 ? mod1 : j < 4 ? mod2 : j < 6 ? mod3 : mod4;
        const modOffset = modAmount * this.fdnDelayTimes[j] * 0.015;
        const delayTime = Math.max(1, this.fdnDelayTimes[j] + modOffset);
        this.fdnReads[j] = this.fdnDelays[j].readInterpolated(delayTime);
      }

      // Apply damping + HPF (using block-level damping, affected by freeze/slow mod)
      // When frozen, bypass HPF (coeff=1.0 → identity) to prevent energy loss in the feedback loop
      const hpC = isFrozen ? 1.0 : this.hpCoeff;
      for (let j = 0; j < fdnCount; j++) {
        const damped = this.fdnDampers[j].process(this.fdnReads[j], blockDamping);
        this.fdnDamped[j] = this.fdnHPFs[j].process(damped, hpC);
      }

      // Mix through Hadamard matrix (4×4 for lite, 8×8 for balanced/ultra)
      if (isLite) {
        this.mixFDN4(this.fdnDamped);
      } else {
        this.mixFDN(this.fdnDamped);
      }

      // Mid-diffusion on mixed signal (Ultra only — extra density)
      let midL = 0, midR = 0;
      if (useMidDiffusion) {
        midL = this.midDiffuserL.process((this.fdnMixed[0] + this.fdnMixed[2] + this.fdnMixed[4] + this.fdnMixed[6]) * 0.25);
        midR = this.midDiffuserR.process((this.fdnMixed[1] + this.fdnMixed[3] + this.fdnMixed[5] + this.fdnMixed[7]) * 0.25);
      }

      // Shimmer: read pitch-shifted samples from shimmer buffer and feed into FDN
      let shimInL = 0, shimInR = 0;
      if (shimmerAmount > 0) {
        const sBuf = this.shimmerBufSize;
        const ratio = this.shimmerPitchRatio;

        // Two overlapping grains with Hann envelope for smooth pitch shift
        // Grain 0
        const readOff0 = (this.shimmerPhase0 * shimmerGrainSize * ratio) % sBuf;
        const ri0 = ((this.shimmerWriteIdx - shimmerGrainSize + sBuf) % sBuf + readOff0) % sBuf;
        const ri0i = ri0 | 0;
        const ri0f = ri0 - ri0i;
        const ri0n = (ri0i + 1) % sBuf;
        const env0 = Math.sin(this.shimmerPhase0 * Math.PI);
        shimInL = (this.shimmerBufL[ri0i] + ri0f * (this.shimmerBufL[ri0n] - this.shimmerBufL[ri0i])) * env0;
        shimInR = (this.shimmerBufR[ri0i] + ri0f * (this.shimmerBufR[ri0n] - this.shimmerBufR[ri0i])) * env0;

        // Grain 1 (half-cycle offset)
        const readOff1 = (this.shimmerPhase1 * shimmerGrainSize * ratio) % sBuf;
        const ri1 = ((this.shimmerWriteIdx - shimmerGrainSize + sBuf) % sBuf + readOff1) % sBuf;
        const ri1i = ri1 | 0;
        const ri1f = ri1 - ri1i;
        const ri1n = (ri1i + 1) % sBuf;
        const env1 = Math.sin(this.shimmerPhase1 * Math.PI);
        shimInL += (this.shimmerBufL[ri1i] + ri1f * (this.shimmerBufL[ri1n] - this.shimmerBufL[ri1i])) * env1;
        shimInR += (this.shimmerBufR[ri1i] + ri1f * (this.shimmerBufR[ri1n] - this.shimmerBufR[ri1i])) * env1;

        shimInL *= shimmerAmount * 0.35;
        shimInR *= shimmerAmount * 0.35;

        // Advance grain phases
        this.shimmerPhase0 += shimmerPhaseInc;
        this.shimmerPhase1 += shimmerPhaseInc;
        if (this.shimmerPhase0 >= 1) this.shimmerPhase0 -= 1;
        if (this.shimmerPhase1 >= 1) this.shimmerPhase1 -= 1;
      }

      // Inject input + shimmer feedback + apply FDN feedback + write back
      const inputGain = isFrozen ? 0 : (isLite ? 0.25 : 0.2);
      const halfCount = fdnCount >> 1;
      for (let j = 0; j < fdnCount; j++) {
        const dryInject = j < halfCount ? diffInL * inputGain : diffInR * inputGain;
        const shimInject = j < halfCount ? shimInL : shimInR;
        const value = softClip(this.fdnMixed[j] * blockFeedback + dryInject + shimInject);
        this.fdnDelays[j].write(value);
      }

      // Collect outputs with cross-mixing for density
      let rawL: number, rawR: number;
      if (isLite) {
        // 4-channel output tapping
        rawL = (this.fdnReads[0] + this.fdnReads[2] + this.fdnReads[1] * 0.3) * 0.7;
        rawR = (this.fdnReads[1] + this.fdnReads[3] + this.fdnReads[0] * 0.3) * 0.7;
      } else {
        // 8-channel output tapping
        rawL = (this.fdnReads[0] + this.fdnReads[2] + this.fdnReads[4] + this.fdnReads[6] + this.fdnReads[1] * 0.3 + this.fdnReads[3] * 0.3) * 0.5;
        rawR = (this.fdnReads[1] + this.fdnReads[3] + this.fdnReads[5] + this.fdnReads[7] + this.fdnReads[0] * 0.3 + this.fdnReads[2] * 0.3) * 0.5;
      }

      // Add mid-diffused signal (Ultra only)
      if (useMidDiffusion) {
        rawL = rawL * 0.7 + midL * 0.3;
        rawR = rawR * 0.7 + midR * 0.3;
      }

      // Post-diffusion (final smearing)
      rawL = this.postDiffuserL.process(rawL);
      rawR = this.postDiffuserR.process(rawR);

      // Write to shimmer buffer (post-diffusion output feeds back via pitch shift)
      if (shimmerAmount > 0) {
        this.shimmerBufL[this.shimmerWriteIdx] = rawL;
        this.shimmerBufR[this.shimmerWriteIdx] = rawR;
        this.shimmerWriteIdx = (this.shimmerWriteIdx + 1) % this.shimmerBufSize;
      }

      // Reverse tail — reads reverb output backwards with windowed crossfade
      if (reverseAmount > 0) {
        // Write forward reverb to reverse buffer
        this.reverseBufL[this.reverseWriteIdx] = rawL;
        this.reverseBufR[this.reverseWriteIdx] = rawR;

        // Read backwards through the buffer
        const readIdx = (this.reverseWriteIdx - Math.floor(this.reverseReadPhase) + rCycleLen) % rCycleLen;

        // Smooth sine-window envelope (rise at start, fall at end of cycle)
        const envPos = this.reverseEnvPhase / rCycleLen;
        const env = Math.sin(envPos * Math.PI);

        rawL += this.reverseBufL[readIdx] * env * reverseAmount;
        rawR += this.reverseBufR[readIdx] * env * reverseAmount;

        // Advance reverse read position
        this.reverseReadPhase += 1;
        this.reverseEnvPhase += 1;
        if (this.reverseEnvPhase >= rCycleLen) {
          this.reverseEnvPhase = 0;
          this.reverseReadPhase = 0;
        }
        this.reverseWriteIdx = (this.reverseWriteIdx + 1) % rCycleLen;
      }

      // DC blocking
      rawL = this.dcBlockerL.process(rawL);
      rawR = this.dcBlockerR.process(rawR);

      // Stereo width
      const mid = (rawL + rawR) * 0.5;
      const side = (rawL - rawR) * 0.5;
      outputL[i] = mid + side * width;
      outputR[i] = mid - side * width;
    }

    // Performance reporting
    if (this.perfEnabled) {
      const elapsed = _perfNow() - perfStart;
      this.perfTotalTime += elapsed;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;
      
      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        const budgetMs = (blockSize / sampleRate) * 1000;
        this.port.postMessage({
          type: 'perf',
          name: 'reverb',
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

registerProcessor('reverb', ReverbProcessor);
export {};
