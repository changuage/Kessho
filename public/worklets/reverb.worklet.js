// Safe performance.now() — not all AudioWorklet scopes expose `performance`
const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

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
// One-pole highpass filter for removing subsonic buildup in FDN feedback
class OnePoleHP {
    constructor() {
        this.z1 = 0;
    }
    process(input, coeff) {
        // y[n] = x[n] - z1 + coeff * z1  → HPF via DC-blocking topology
        const y = input - this.z1 + coeff * this.z1;
        this.z1 = y;
        return y;
    }
}
// Interpolated delay line for smooth modulation
class SmoothDelay {
    constructor(maxSamples) {
        this.writeIndex = 0;
        this.size = maxSamples;
        this.buffer = new Float32Array(maxSamples);
    }
    write(sample) {
        this.buffer[this.writeIndex] = sample;
        this.writeIndex = (this.writeIndex + 1) % this.size;
    }
    // Read with linear interpolation (sufficient for slow modulation)
    readInterpolated(delaySamples) {
        const readPos = this.writeIndex - delaySamples;
        const readPosWrapped = ((readPos % this.size) + this.size);
        const i0 = Math.floor(readPosWrapped) % this.size;
        const i1 = (i0 + 1) % this.size;
        const frac = readPosWrapped - Math.floor(readPosWrapped);
        return this.buffer[i0] + (this.buffer[i1] - this.buffer[i0]) * frac;
    }
    read(delaySamples) {
        const readPos = this.writeIndex - Math.floor(delaySamples);
        return this.buffer[((readPos % this.size) + this.size) % this.size];
    }
}
// Cascaded allpass diffuser - multiple stages for heavy smearing
class DiffuserChain {
    constructor(delaySamples, feedback) {
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
    process(input) {
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
    setFeedback(fb) {
        for (let i = 0; i < this.stageCount; i++) {
            this.feedbacks[i] = fb;
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
// DC blocker to prevent buildup
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
// Soft clipper to prevent harsh transients
function softClip(x) {
    if (x > 1)
        return 1 - 1 / (x + 1);
    if (x < -1)
        return -1 + 1 / (-x + 1);
    return x;
}
// Preset configurations
const PRESETS = {
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
    constructor() {
        super();
        this.params = {
            type: 'hall',
            quality: 'balanced', // ultra, balanced, lite
            decay: 0.8,
            size: 1.5,
            modulation: 0.3,
            predelay: 20,
            damping: 0.5,
            width: 0.8,
            diffusion: 0.8,
            infinite: false,
        };
        // FDN components
        this.fdnDelays = [];
        this.fdnDelayTimes = [];
        this.fdnDampers = [];
        this.predelaySamples = 0;
        // Ultra-slow modulation (multiple phases for richness)
        this.modPhase1 = 0;
        this.modPhase2 = 0.25;
        this.modPhase3 = 0.5;
        this.modPhase4 = 0.75;
        // DC blockers
        this.dcBlockerL = new DCBlocker();
        this.dcBlockerR = new DCBlocker();
        // HPF in FDN feedback — prevents low-end mud on long decays
        this.fdnHPFs = [];
        this.hpCoeff = 0.995; // ~35Hz at 48kHz
        // Infinite/freeze mode
        this.infinite = false;
        // Smooth parameter interpolation
        this.smoothDamping = 0.5;
        // Feedback gain
        this.feedbackGain = 0.85;
        // Pre-allocated arrays to avoid GC during process()
        this.fdnReads = new Float64Array(8);
        this.fdnDamped = new Float64Array(8);
        this.fdnMixed = new Float64Array(8);
        // Performance monitoring
        this.perfEnabled = false;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        this.perfReportInterval = 48000; // ~1 second
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
        this.preDiffuserL = new DiffuserChain(DIFFUSER_TIMES_BASE[0].map(t => Math.floor(t * scale)), 0.65);
        this.preDiffuserR = new DiffuserChain(DIFFUSER_TIMES_BASE[1].map(t => Math.floor(t * scale)), 0.65);
        this.midDiffuserL = new DiffuserChain(DIFFUSER_TIMES_BASE[2].map(t => Math.floor(t * scale)), 0.55);
        this.midDiffuserR = new DiffuserChain(DIFFUSER_TIMES_BASE[3].map(t => Math.floor(t * scale)), 0.55);
        this.postDiffuserL = new DiffuserChain(DIFFUSER_TIMES_BASE[4].map(t => Math.floor(t * scale)), 0.5);
        this.postDiffuserR = new DiffuserChain(DIFFUSER_TIMES_BASE[5].map(t => Math.floor(t * scale)), 0.5);
        // Predelay (up to 300ms)
        const maxPredelay = Math.ceil(0.3 * sr);
        this.predelayL = new SmoothDelay(maxPredelay);
        this.predelayR = new SmoothDelay(maxPredelay);
        this.updatePreset();
        this.updatePredelay();
        this.port.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'enablePerf') {
                this.perfEnabled = data.enabled;
                this.perfTotalTime = 0;
                this.perfCount = 0;
                this.perfSamplesSinceReport = 0;
            }
            else if (data.type === 'params') {
                Object.assign(this.params, data.params);
                this.infinite = !!this.params.infinite;
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
        // Calculate feedback gain for desired RT60 - allow higher for ambient wash
        const baseDecay = preset.decay;
        const effectiveDecay = baseDecay + (1 - baseDecay) * userDecay * 0.9;
        // In infinite mode, feedback = 1.0 for never-decaying reverb tail
        this.feedbackGain = this.infinite ? 1.0 : Math.min(0.995, effectiveDecay);
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
        const preFb = 0.5 + effectiveDiff * 0.4; // 0.5-0.9
        const midFb = 0.45 + effectiveDiff * 0.4; // 0.45-0.85
        const postFb = 0.4 + effectiveDiff * 0.4; // 0.4-0.8
        this.preDiffuserL.setFeedback(preFb);
        this.preDiffuserR.setFeedback(preFb);
        this.midDiffuserL.setFeedback(midFb);
        this.midDiffuserR.setFeedback(midFb);
        this.postDiffuserL.setFeedback(postFb);
        this.postDiffuserR.setFeedback(postFb);
    }
    // Hadamard-like mixing for FDN (orthogonal matrix)
    // Writes to pre-allocated fdnMixed array to avoid allocations
    mixFDN(state) {
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
    process(inputs, outputs, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parameters) {
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
        if (this.modPhase1 > 1)
            this.modPhase1 -= 1;
        if (this.modPhase2 > 1)
            this.modPhase2 -= 1;
        if (this.modPhase3 > 1)
            this.modPhase3 -= 1;
        if (this.modPhase4 > 1)
            this.modPhase4 -= 1;
        for (let i = 0; i < blockSize; i++) {
            const inL = inputL[i] || 0;
            const inR = inputR[i] || 0;
            // Smooth parameter changes
            this.smoothDamping += (targetDamping - this.smoothDamping) * 0.0001;
            // Predelay
            this.predelayL.write(inL);
            this.predelayR.write(inR);
            const delayedL = this.predelaySamples > 0 ? this.predelayL.read(this.predelaySamples) : inL;
            const delayedR = this.predelaySamples > 0 ? this.predelayR.read(this.predelaySamples) : inR;
            // Pre-diffusion (heavy smear on input)
            const diffInL = this.preDiffuserL.process(delayedL);
            const diffInR = this.preDiffuserR.process(delayedR);
            // Read from FDN delay lines with modulation (using pre-allocated array)
            for (let j = 0; j < 8; j++) {
                // Different modulation per delay line for richness
                const modAmount = j < 2 ? mod1 : j < 4 ? mod2 : j < 6 ? mod3 : mod4;
                const modOffset = modAmount * this.fdnDelayTimes[j] * 0.015;
                const delayTime = Math.max(1, this.fdnDelayTimes[j] + modOffset);
                this.fdnReads[j] = this.fdnDelays[j].readInterpolated(delayTime);
            }
            // Apply damping + HPF (using pre-allocated array)
            for (let j = 0; j < 8; j++) {
                const damped = this.fdnDampers[j].process(this.fdnReads[j], this.smoothDamping);
                this.fdnDamped[j] = this.fdnHPFs[j].process(damped, this.hpCoeff);
            }
            // Mix through Hadamard matrix (writes to this.fdnMixed)
            this.mixFDN(this.fdnDamped);
            // Mid-diffusion on mixed signal
            const midL = this.midDiffuserL.process((this.fdnMixed[0] + this.fdnMixed[2] + this.fdnMixed[4] + this.fdnMixed[6]) * 0.25);
            const midR = this.midDiffuserR.process((this.fdnMixed[1] + this.fdnMixed[3] + this.fdnMixed[5] + this.fdnMixed[7]) * 0.25);
            // Inject input to first channels, apply feedback, write back
            // In infinite mode, mute input so the tail truly freezes
            const inputGain = this.infinite ? 0 : 0.2;
            for (let j = 0; j < 8; j++) {
                let inject = 0;
                if (j < 4)
                    inject = diffInL * inputGain;
                else
                    inject = diffInR * inputGain;
                // Soft clip to prevent runaway
                const value = softClip(this.fdnMixed[j] * this.feedbackGain + inject);
                this.fdnDelays[j].write(value);
            }
            // Collect outputs with cross-mixing for more density
            let rawL = (this.fdnReads[0] + this.fdnReads[2] + this.fdnReads[4] + this.fdnReads[6] + this.fdnReads[1] * 0.3 + this.fdnReads[3] * 0.3) * 0.5;
            let rawR = (this.fdnReads[1] + this.fdnReads[3] + this.fdnReads[5] + this.fdnReads[7] + this.fdnReads[0] * 0.3 + this.fdnReads[2] * 0.3) * 0.5;
            // Add mid-diffused signal
            rawL = rawL * 0.7 + midL * 0.3;
            rawR = rawR * 0.7 + midR * 0.3;
            // Post-diffusion (final smearing)
            rawL = this.postDiffuserL.process(rawL);
            rawR = this.postDiffuserR.process(rawR);
            // DC blocking
            rawL = this.dcBlockerL.process(rawL);
            rawR = this.dcBlockerR.process(rawR);
            // Stereo width
            const mid = (rawL + rawR) * 0.5;
            const side = (rawL - rawR) * 0.5;
            const wetL = mid + side * width;
            const wetR = mid - side * width;
            // Output 100% wet (level controlled externally by reverbOutputGain)
            outputL[i] = wetL;
            outputR[i] = wetR;
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
