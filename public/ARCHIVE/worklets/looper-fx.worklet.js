// Safe performance.now() — not all AudioWorklet scopes expose `performance`
const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

/**
 * Looper-FX Unified Granular Worklet Processor
 *
 * A unified replacement for granulator.worklet.ts that adds:
 * - 16s always-recording circular buffer (configurable)
 * - 16 equal auto-slices (Flux-style)
 * - 4 independent voices with clean/granular mode per voice
 * - Legacy mode (replicates original granulator.worklet.ts behavior)
 * - Freeze (stop write head)
 * - Per-voice blur (4-stage allpass micro-diffusion)
 * - Per-voice grain oct (probabilistic +12st shimmer)
 * - Position/pan LFOs (Loop Forest-style slow scanning)
 * - Feedback with HPF + LPF + tanh soft limiting
 * - Hann-windowed grains, cubic Hermite interpolation
 * - Pink noise fill for silence
 *
 * Inspired by: Microcosm, Mood, ZOIA Loop Forest, Fors Opal Flux
 */
/// <reference path="../../vite-env.d.ts" />
// ═══════════════ DSP Primitives ═══════════════
// 4-stage allpass chain for blur (micro-diffusion)
class AllpassDiffuser {
    constructor(sr) {
        this.writePos = [0, 0, 0, 0];
        this.delaySizes = [72, 110, 178, 245]; // ~1.5ms, 2.3ms, 3.7ms, 5.1ms @ 48kHz
        // Right-channel variant uses prime-ratio offsets for stereo decorrelation
        this.writePosR = [0, 0, 0, 0];
        this.delaySizesR = [83, 127, 193, 269]; // ~1.7ms, 2.6ms, 4.0ms, 5.6ms @ 48kHz
        this.g = 0; // allpass coefficient (blur amount)
        const scale = sr / 48000;
        this.delays = this.delaySizes.map(s => new Float32Array(Math.ceil(s * scale) + 1));
        this.delaysR = this.delaySizesR.map(s => new Float32Array(Math.ceil(s * scale) + 1));
    }
    setBlur(blur) {
        this.g = blur * 0.7; // Cap at 0.7 for stability
    }
    process(input) {
        let x = input;
        for (let i = 0; i < 4; i++) {
            const buf = this.delays[i];
            const size = buf.length;
            const readPos = (this.writePos[i] - this.delaySizes[i] + size) % size;
            const delayed = buf[readPos < 0 ? readPos + size : readPos];
            const v = x - delayed * this.g;
            buf[this.writePos[i]] = v;
            x = delayed + v * this.g;
            this.writePos[i] = (this.writePos[i] + 1) % size;
        }
        return x;
    }
    /** Process right channel through decorrelated allpass chain */
    processR(input) {
        let x = input;
        for (let i = 0; i < 4; i++) {
            const buf = this.delaysR[i];
            const size = buf.length;
            const readPos = (this.writePosR[i] - this.delaySizesR[i] + size) % size;
            const delayed = buf[readPos < 0 ? readPos + size : readPos];
            const v = x - delayed * this.g;
            buf[this.writePosR[i]] = v;
            x = delayed + v * this.g;
            this.writePosR[i] = (this.writePosR[i] + 1) % size;
        }
        return x;
    }
}
// Simple one-pole filters
class OnePoleLPF {
    constructor() {
        this.z1 = 0;
    }
    process(input, coeff) {
        this.z1 = input * (1 - coeff) + this.z1 * coeff;
        return this.z1;
    }
}
class OnePoleHPF {
    constructor() {
        this.x1 = 0;
        this.y1 = 0;
    }
    process(input) {
        // HPF at ~30Hz: y = x - x1 + 0.996 * y1
        const y = input - this.x1 + 0.996 * this.y1;
        this.x1 = input;
        this.y1 = y;
        return y;
    }
}
// 2-pole biquad lowpass for anti-aliasing pitch-up playback
class AntiAliasLPF {
    constructor() {
        this.b0 = 1;
        this.b1 = 0;
        this.b2 = 0;
        this.a1 = 0;
        this.a2 = 0;
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
        this.currentRate = 1;
    }
    /** Recalculate coefficients only when playback rate changes significantly */
    update(absRate, _sr) {
        // Only filter when pitching up (rate > 1.05)
        if (absRate <= 1.05) {
            this.currentRate = 1;
            return;
        }
        // Avoid recalculation if rate hasn't changed much
        if (Math.abs(absRate - this.currentRate) < 0.02)
            return;
        this.currentRate = absRate;
        // Cutoff at Nyquist / rate with 15% headroom
        const fc = Math.min(0.45, 0.425 / absRate);
        const w0 = 2 * Math.PI * fc;
        const cosW0 = Math.cos(w0);
        const sinW0 = Math.sin(w0);
        const alpha = sinW0 / (2 * 0.707); // Q = 0.707 (Butterworth)
        const a0 = 1 + alpha;
        this.b0 = ((1 - cosW0) / 2) / a0;
        this.b1 = (1 - cosW0) / a0;
        this.b2 = this.b0;
        this.a1 = (-2 * cosW0) / a0;
        this.a2 = (1 - alpha) / a0;
    }
    process(x) {
        if (this.currentRate <= 1)
            return x; // Bypass when not pitching up
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }
    reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.currentRate = 1; }
}
// ─── CPU-friendly math helpers ───
/** Fast tanh approximation: x(27+x²)/(27+9x²), max error ~0.004  */
function fastTanh(x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
}
// Build a 1024-entry cosine/sine crossfade table (0..1 → gainA, gainB)
const XFADE_TABLE_SIZE = 1024;
const XFADE_TABLE_A = new Float32Array(XFADE_TABLE_SIZE + 1);
const XFADE_TABLE_B = new Float32Array(XFADE_TABLE_SIZE + 1);
for (let i = 0; i <= XFADE_TABLE_SIZE; i++) {
    const angle = (i / XFADE_TABLE_SIZE) * 1.5707963; // 0..π/2
    XFADE_TABLE_A[i] = Math.cos(angle);
    XFADE_TABLE_B[i] = Math.sin(angle);
}
// Slow LFO — supports triangle (default) and sine waveforms
class TriLFO {
    constructor() {
        this.phase = 0;
        this.rate = 0; // Hz
        this.useSine = false;
    }
    setRate(normalized) {
        // 0 = off, 1 = ~0.15Hz (~6.7s cycle). Covers ZOIA Loop Forest range (0.016–0.128 Hz)
        this.rate = normalized > 0.01 ? normalized * 0.15 : 0;
    }
    /** Set initial phase offset (0..1) for decorrelating multiple voices */
    setPhase(p) { this.phase = p % 1; }
    /** Enable sine waveform (smoother for position scanning) */
    setSine(on) { this.useSine = on; }
    tick(sr) {
        if (this.rate <= 0)
            return 0;
        this.phase += this.rate / sr;
        if (this.phase > 1)
            this.phase -= 1;
        if (this.useSine) {
            // Parabolic sine approximation (avoids per-sample Math.sin)
            const p = this.phase;
            if (p <= 0.5) {
                return 4 * p * (1 - 2 * p) + 0.5; // 0..1 range approximation
            }
            return -4 * (p - 0.5) * (1 - 2 * (p - 0.5)) + 0.5;
        }
        return 1 - Math.abs(2 * this.phase - 1); // 0..1 triangle
    }
}
// ═══════════════ Constants ═══════════════
// Harmonic intervals from original granulator (for legacy mode)
// eslint-disable-next-line @typescript-eslint/no-redeclare
const LOOPER_HARMONIC_INTERVALS = [
    0, // Unison
    7, // Perfect Fifth
    12, // Octave
    -12, // Octave down
    19, // Twelfth
    5, // Perfect Fourth
    -7, // Fifth down
    24, // Double octave
    -5, // Fourth down
    4, // Major Third
    -24, // Double octave down
];
const NUM_VOICES = 4;
const NUM_SLICES = 16;
const MAX_GRAINS_PER_VOICE = 64;
// ═══════════════ Main Processor ═══════════════
class LooperFXProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Buffer
        this.buffer = [new Float32Array(0), new Float32Array(0)];
        this.bufferSize = 0;
        this.writePos = 0;
        this.freeze = false;
        this.freezeWithFeedback = false;
        // Per-voice grain pools
        this.grainPools = [];
        // Per-voice blur diffusers
        this.blurDiffusers = [];
        // Per-voice LFOs
        this.posLFOs = [];
        this.panLFOs = [];
        this.reverseLFOs = [];
        this.recordLFOs = [];
        // Per-voice anti-alias filters (L+R per voice)
        this.antiAliasL = [];
        this.antiAliasR = [];
        // Feedback filters (separate per channel to avoid stereo crosstalk)
        this.feedbackHPF_L = new OnePoleHPF();
        this.feedbackHPF_R = new OnePoleHPF();
        this.feedbackLPF_L = new OnePoleLPF();
        this.feedbackLPF_R = new OnePoleLPF();
        this.feedbackLPFCoeff = 0.7;
        // RMS auto-gain for feedback path
        this.feedbackRMS = 0;
        this.RMS_ATTACK = 0.001; // fast attack (~1ms at 48kHz)
        this.RMS_RELEASE = 0.05; // slow release (~50ms)
        // Random sequence (deterministic, from main thread)
        this.randomSequence = new Float32Array(0);
        this.randomIndex = 0;
        this.initialized = false;
        // Grain scheduling per voice
        this.samplesSinceGrain = [0, 0, 0, 0];
        this.samplesPerGrain = [2205, 2205, 2205, 2205];
        // Euclidean-driven density burst: multiplier decays from peak back to 1.0
        this.trigDensityMult = [1, 1, 1, 1];
        this.TRIG_DENSITY_DECAY = 0.9997; // ~200ms decay at 48kHz
        // Per-voice read position (clean mode)
        this.cleanReadPos = [0, 0, 0, 0];
        // Dual-head crossfade reader for LFO scan mode (speed=0)
        this.scanHeadA = [0, 0, 0, 0];
        this.scanHeadB = [0, 0, 0, 0];
        this.scanFade = [0, 0, 0, 0]; // 0 = 100% head A, 1 = 100% head B
        this.scanFading = [false, false, false, false];
        this.scanFadeDir = [0, 0, 0, 0];
        this.scanHeadInit = [false, false, false, false];
        this.scanLFOTarget = [0, 0, 0, 0]; // LFO target pos for smooth UI visualization
        this.SCAN_XFADE_SAMPLES = 5760; // ~120ms at 48kHz
        this.SCAN_XFADE_INC = 1 / 5760;
        this.SCAN_DRIFT_THRESH = 7200; // ~150ms at 48kHz
        // Per-voice representative read position for granular/legacy (most-recently-spawned grain)
        this.lastGrainPos = [0, 0, 0, 0];
        // Per-voice Euclidean trigger envelope
        // Phase: samples since last trigger (-1 = no active envelope)
        this.trigEnvPhase = [-1, -1, -1, -1];
        // Velocity from trigger (0-1)
        this.trigEnvVelocity = [1, 1, 1, 1];
        // Per-voice Euclidean sub-lane overrides (set via euclidTrigger, -1 = no override)
        this.euclidSliceOverride = [-1, -1, -1, -1]; // 0-15 slice index, -1 = use voice param
        this.euclidPitchOverride = [0, 0, 0, 0]; // semitones offset from sub-lane
        this.euclidPitchActive = [false, false, false, false];
        this.euclidReverseOverride = [false, false, false, false];
        this.euclidReverseActive = [false, false, false, false];
        this.HANN_SIZE = 1024;
        this.PAN_SIZE = 256;
        this.panOut = [0, 0]; // [L, R]
        this.silentSamples = 0;
        // Pre-allocated voice output buffers (avoid GC pressure in process())
        this.voiceOutL = new Float32Array(128);
        this.voiceOutR = new Float32Array(128);
        // Precomputed 1/√(n) table for grain gain compensation (indices 0..MAX_GRAINS_PER_VOICE)
        this.gainCompTable = new Float32Array(MAX_GRAINS_PER_VOICE + 1);
        // Performance monitoring
        this.perfEnabled = false;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        this.perfReportInterval = 48000;
        // Position reporting (~20Hz)
        this.posReportCounter = 0;
        this.POS_REPORT_INTERVAL = Math.floor(48000 / 20); // ~50ms at 48kHz
        // Default 16s stereo buffer at 48kHz
        this.bufferSize = 16 * 48000;
        this.buffer = [
            new Float32Array(this.bufferSize),
            new Float32Array(this.bufferSize),
        ];
        // Default parameters
        this.params = this.defaultParams();
        // Init per-voice structures
        for (let v = 0; v < NUM_VOICES; v++) {
            // Grain pool
            const pool = [];
            for (let g = 0; g < MAX_GRAINS_PER_VOICE; g++) {
                pool.push({ position: 0, startSample: 0, length: 0, playbackRate: 1, pan: 0, active: false, attackSamples: 0, decaySamples: 0 });
            }
            this.grainPools.push(pool);
            // Blur diffuser
            this.blurDiffusers.push(new AllpassDiffuser(sampleRate));
            // LFOs — stagger initial phases so voices don't correlate
            const posLFO = new TriLFO();
            posLFO.setPhase(v * 0.25); // 0, 0.25, 0.5, 0.75
            this.posLFOs.push(posLFO);
            const panLFO = new TriLFO();
            panLFO.setPhase(v * 0.17 + 0.1);
            this.panLFOs.push(panLFO);
            const revLFO = new TriLFO();
            revLFO.setPhase(v * 0.31);
            this.reverseLFOs.push(revLFO);
            const recLFO = new TriLFO();
            recLFO.setPhase(v * 0.23 + 0.05);
            this.recordLFOs.push(recLFO);
            // Anti-alias filters
            this.antiAliasL.push(new AntiAliasLPF());
            this.antiAliasR.push(new AntiAliasLPF());
        }
        // Pre-compute Hann window
        this.hannTable = new Float32Array(this.HANN_SIZE);
        for (let i = 0; i < this.HANN_SIZE; i++) {
            const phase = i / (this.HANN_SIZE - 1);
            this.hannTable[i] = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
        }
        // Pre-compute gain compensation table: 1/√(n)
        this.gainCompTable[0] = 1;
        this.gainCompTable[1] = 1;
        for (let i = 2; i <= MAX_GRAINS_PER_VOICE; i++) {
            this.gainCompTable[i] = 1 / Math.sqrt(i);
        }
        // Pre-compute pan tables (constant power panning)
        this.panTableL = new Float32Array(this.PAN_SIZE);
        this.panTableR = new Float32Array(this.PAN_SIZE);
        for (let i = 0; i < this.PAN_SIZE; i++) {
            const pan = (i / (this.PAN_SIZE - 1)) * 2 - 1;
            const angle = (pan + 1) * 0.25 * Math.PI;
            this.panTableL[i] = Math.cos(angle);
            this.panTableR[i] = Math.sin(angle);
        }
        // Fill buffer with pink noise for initial texture
        this.fillNoiseBuffer();
        this.port.onmessage = (event) => this.handleMessage(event.data);
    }
    defaultParams() {
        const arr4 = (v) => [v, v, v, v];
        return {
            enabled: true,
            freeze: false,
            freezeWithFeedback: false,
            dryWet: 0.3,
            feedback: 0.1,
            feedbackLPF: 8000,
            bufferSeconds: 16,
            voiceEnabled: [true, false, false, false],
            voiceMode: ['granular', 'granular', 'granular', 'granular'],
            voiceSlice: [0, 4, 8, 12],
            voiceSpeed: arr4(1),
            voiceReverse: arr4(false),
            voicePitch: arr4(0),
            voiceAttack: arr4(0.003),
            voiceDecay: arr4(0.5),
            voiceBlur: arr4(0),
            voiceGrainOct: arr4(0),
            voiceSpray: arr4(0.3),
            voiceDensity: arr4(20),
            voiceGrainSize: arr4(80),
            voicePan: arr4(0),
            voiceGain: arr4(0.5),
            voicePosLFORate: arr4(0),
            voicePosLFODepth: arr4(0),
            voicePanLFORate: arr4(0),
            voiceStereoSpread: arr4(0.5),
            voiceReverseLFORate: arr4(0),
            voiceWriteFollow: arr4(0),
            voiceRecordLFORate: arr4(0),
            scaleIntervals: [],
            euclidGated: arr4(false),
            legacyJitter: 10,
            legacyProbability: 0.8,
            legacyPitchMode: 'harmonic',
            legacyPitchSpread: 2,
            legacyMaxGrains: 64,
            legacyFeedback: 0.1,
        };
    }
    // ═══════════════ Message Handling ═══════════════
    handleMessage(data) {
        switch (data.type) {
            case 'params':
                Object.assign(this.params, data.params);
                this.applyParams();
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
            case 'euclidTrigger': {
                // Triggered by Euclidean scheduler: restart envelope for voice
                const voice = data.voice;
                const velocity = data.velocity;
                if (voice >= 0 && voice < NUM_VOICES) {
                    this.trigEnvPhase[voice] = 0;
                    this.trigEnvVelocity[voice] = velocity;
                    // Apply sub-lane overrides
                    if (data.sliceOverride !== undefined) {
                        this.euclidSliceOverride[voice] = data.sliceOverride;
                    }
                    if (data.pitchOverride !== undefined) {
                        this.euclidPitchOverride[voice] = data.pitchOverride;
                        this.euclidPitchActive[voice] = true;
                    }
                    else {
                        this.euclidPitchActive[voice] = false;
                    }
                    if (data.reverseOverride !== undefined) {
                        this.euclidReverseOverride[voice] = data.reverseOverride;
                        this.euclidReverseActive[voice] = true;
                    }
                    else {
                        this.euclidReverseActive[voice] = false;
                    }
                    // Clean mode: restart read position from slice start
                    if (this.params.voiceMode[voice] === 'clean') {
                        this.cleanReadPos[voice] = 0;
                    }
                    // Granular mode: force immediate grain spawn + density burst
                    if (this.params.voiceMode[voice] === 'granular') {
                        this.samplesSinceGrain[voice] = this.samplesPerGrain[voice];
                        // Burst: temporarily increase density by velocity-scaled factor (up to 4×)
                        this.trigDensityMult[voice] = 1 + 3 * velocity;
                    }
                }
                break;
            }
            case 'enablePerf':
                this.perfEnabled = data.enabled;
                this.perfTotalTime = 0;
                this.perfCount = 0;
                this.perfSamplesSinceReport = 0;
                break;
        }
    }
    applyParams() {
        const p = this.params;
        this.freeze = p.freeze;
        this.freezeWithFeedback = p.freezeWithFeedback;
        // Resize buffer if needed
        const targetSize = Math.floor(p.bufferSeconds * sampleRate);
        if (targetSize !== this.bufferSize) {
            this.resizeBuffer(targetSize);
        }
        // Feedback LPF coefficient
        this.feedbackLPFCoeff = Math.exp(-2 * Math.PI * p.feedbackLPF / sampleRate);
        // Invert: lower freq → higher coeff → more filtering
        this.feedbackLPFCoeff = 1 - this.feedbackLPFCoeff;
        // Per-voice updates
        for (let v = 0; v < NUM_VOICES; v++) {
            const density = p.voiceDensity[v] || 20;
            this.samplesPerGrain[v] = Math.floor(sampleRate / density);
            this.blurDiffusers[v].setBlur(p.voiceBlur[v] || 0);
            this.posLFOs[v].setRate(p.voicePosLFORate[v] || 0);
            this.panLFOs[v].setRate(p.voicePanLFORate[v] || 0);
            this.reverseLFOs[v].setRate(p.voiceReverseLFORate[v] || 0);
            this.recordLFOs[v].setRate(p.voiceRecordLFORate[v] || 0);
        }
    }
    resizeBuffer(newSize) {
        const newBuf = [new Float32Array(newSize), new Float32Array(newSize)];
        const copyLen = Math.min(this.bufferSize, newSize);
        for (let ch = 0; ch < 2; ch++) {
            newBuf[ch].set(this.buffer[ch].subarray(0, copyLen));
        }
        this.buffer = newBuf;
        this.bufferSize = newSize;
        if (this.writePos >= newSize)
            this.writePos = 0;
    }
    // ═══════════════ Utility ═══════════════
    /** Compute Euclidean trigger envelope level for a voice (AD envelope using voiceAttack/voiceDecay) */
    trigEnvLevel(voiceIdx) {
        const phase = this.trigEnvPhase[voiceIdx];
        if (phase < 0)
            return 1; // No active envelope → full level (ungated)
        const atkSamples = Math.max(1, this.params.voiceAttack[voiceIdx] * sampleRate);
        const decSamples = Math.max(1, this.params.voiceDecay[voiceIdx] * sampleRate);
        const velocity = this.trigEnvVelocity[voiceIdx];
        if (phase < atkSamples) {
            // Attack phase: ramp from 0 to velocity
            return (phase / atkSamples) * velocity;
        }
        const decPhase = phase - atkSamples;
        if (decPhase < decSamples) {
            // Decay phase: ramp from velocity to 0
            return velocity * (1 - decPhase / decSamples);
        }
        // Envelope finished
        return 0;
    }
    /** Advance Euclidean trigger envelope by 1 sample */
    advanceTrigEnv(voiceIdx) {
        if (this.trigEnvPhase[voiceIdx] >= 0) {
            this.trigEnvPhase[voiceIdx]++;
            // Auto-expire: check if envelope is done
            const atkSamples = Math.max(1, this.params.voiceAttack[voiceIdx] * sampleRate);
            const decSamples = Math.max(1, this.params.voiceDecay[voiceIdx] * sampleRate);
            if (this.trigEnvPhase[voiceIdx] > atkSamples + decSamples) {
                this.trigEnvPhase[voiceIdx] = -1; // Envelope done
            }
        }
    }
    nextRandom() {
        if (this.randomSequence.length === 0)
            return Math.random();
        const v = this.randomSequence[this.randomIndex];
        this.randomIndex = (this.randomIndex + 1) % this.randomSequence.length;
        return v;
    }
    hannWindow(position, length) {
        const phase = position / length;
        const idx = Math.min(this.HANN_SIZE - 1, Math.max(0, Math.floor(phase * (this.HANN_SIZE - 1))));
        return this.hannTable[idx];
    }
    // Asymmetric grain envelope: cosine attack → sustain → cosine decay
    // Reuses Hann lookup table for efficiency
    grainEnvelope(sample, length, atkSamples, decSamples) {
        if (atkSamples + decSamples >= length) {
            // Overlap: fall back to symmetric Hann
            return this.hannWindow(sample, length);
        }
        if (sample < atkSamples) {
            // Attack: first half of Hann(2×attack) → 0..1
            return this.hannWindow(sample, atkSamples * 2);
        }
        const decStart = length - decSamples;
        if (sample >= decStart) {
            // Decay: second half of Hann(2×decay) → 1..0
            return this.hannWindow(sample - decStart + decSamples, decSamples * 2);
        }
        return 1.0; // Sustain
    }
    // Quantize pitch offset to nearest scale interval
    quantizePitch(semitones) {
        const intervals = this.params.scaleIntervals;
        if (!intervals || intervals.length === 0)
            return semitones;
        const octaves = Math.floor(semitones / 12);
        const remainder = ((semitones % 12) + 12) % 12;
        let bestInterval = 0;
        let bestDist = 99;
        for (let i = 0; i < intervals.length; i++) {
            const d = Math.abs(intervals[i] - remainder);
            const dist = Math.min(d, 12 - d); // wraparound
            if (dist < bestDist) {
                bestDist = dist;
                bestInterval = intervals[i];
            }
        }
        return octaves * 12 + bestInterval;
    }
    getPanLR(pan) {
        const idx = Math.min(this.PAN_SIZE - 1, Math.max(0, Math.floor(((pan + 1) * 0.5) * (this.PAN_SIZE - 1))));
        return { l: this.panTableL[idx], r: this.panTableR[idx] };
    }
    /** GC-free pan lookup — writes into a reusable 2-element array */
    getPanLRFast(pan) {
        const idx = Math.min(this.PAN_SIZE - 1, Math.max(0, ((pan + 1) * 0.5 * (this.PAN_SIZE - 1)) | 0));
        this.panOut[0] = this.panTableL[idx];
        this.panOut[1] = this.panTableR[idx];
    }
    // Cubic Hermite interpolation for high-quality pitch shifting
    // Optimised: reduced modulo ops, bitwise floor
    readBufferCubic(channel, position) {
        const buf = this.buffer[channel];
        const size = this.bufferSize;
        // Single modulo to normalise position
        let pos = position % size;
        if (pos < 0) pos += size;
        const i0 = pos | 0; // bitwise floor (faster than Math.floor for positive values)
        const frac = pos - i0;
        // Avoid 3 separate modulos: compute offsets conditionally
        const im1 = i0 > 0 ? i0 - 1 : size - 1;
        const i1 = i0 < size - 1 ? i0 + 1 : 0;
        const i2 = i0 < size - 2 ? i0 + 2 : (i0 + 2) - size;
        const xm1 = buf[im1];
        const x0 = buf[i0];
        const x1 = buf[i1];
        const x2 = buf[i2];
        // Cubic Hermite
        const c1 = 0.5 * (x1 - xm1);
        const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
        const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
        return ((c3 * frac + c2) * frac + c1) * frac + x0;
    }
    fillNoiseBuffer() {
        // Start with silence — grains will only play back what's been recorded
        for (let i = 0; i < this.bufferSize; i++) {
            this.buffer[0][i] = 0;
            this.buffer[1][i] = 0;
        }
    }
    // ═══════════════ Slice System ═══════════════
    getSliceStart(sliceIndex) {
        return Math.floor((sliceIndex / NUM_SLICES) * this.bufferSize);
    }
    getSliceLength() {
        return Math.floor(this.bufferSize / NUM_SLICES);
    }
    // ═══════════════ Grain Spawning ═══════════════
    spawnGrain(voiceIdx) {
        const p = this.params;
        const mode = p.voiceMode[voiceIdx];
        const pool = this.grainPools[voiceIdx];
        // Find inactive grain (indexed loop avoids closure allocation of pool.find)
        let grain;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].active) { grain = pool[i]; break; }
        }
        if (!grain)
            return;
        const grainSizeMs = p.voiceGrainSize[voiceIdx] || 80;
        const grainSamples = Math.floor((grainSizeMs / 1000) * sampleRate);
        if (mode === 'legacy') {
            // Legacy mode: replicate original granulator behavior
            if (this.nextRandom() > p.legacyProbability)
                return;
            const spraySamples = Math.floor((p.voiceSpray[voiceIdx] * 600 / 1000) * sampleRate);
            const jitterSamples = Math.floor((p.legacyJitter / 1000) * sampleRate);
            const basePos = (this.writePos - spraySamples + this.bufferSize) % this.bufferSize;
            const sprayOffset = Math.floor(this.nextRandom() * spraySamples);
            const jitterOffset = Math.floor((this.nextRandom() - 0.5) * 2 * jitterSamples);
            grain.position = (basePos - sprayOffset + jitterOffset + this.bufferSize) % this.bufferSize;
            this.lastGrainPos[voiceIdx] = grain.position;
            // Harmonic or random pitch
            let pitchOffset;
            if (p.legacyPitchMode === 'harmonic') {
                const maxIdx = Math.floor((p.legacyPitchSpread / 12) * LOOPER_HARMONIC_INTERVALS.length);
                const avail = LOOPER_HARMONIC_INTERVALS.slice(0, Math.max(1, maxIdx));
                pitchOffset = avail[Math.floor(this.nextRandom() * avail.length)];
            }
            else {
                pitchOffset = (this.nextRandom() - 0.5) * 2 * p.legacyPitchSpread;
            }
            grain.playbackRate = Math.pow(2, pitchOffset / 12);
            grain.pan = (this.nextRandom() - 0.5) * 2 * (p.voiceStereoSpread[voiceIdx] || 0.5);
        }
        else {
            // Standard granular mode
            // Slice: use Euclidean override if active, else voice param
            const slice = this.euclidSliceOverride[voiceIdx] >= 0
                ? this.euclidSliceOverride[voiceIdx]
                : (p.voiceSlice[voiceIdx] || 0);
            const sliceStart = this.getSliceStart(slice);
            const spray = p.voiceSpray[voiceIdx] || 0;
            // Position: write-follow blends between slice position and write head
            // Record LFO modulates writeFollow: 0→1→0 oscillation enables periodic write-head tracking
            const baseWriteFollow = p.voiceWriteFollow[voiceIdx] || 0;
            const recordLFOVal = this.recordLFOs[voiceIdx].tick(sampleRate);
            const writeFollow = Math.min(1, baseWriteFollow + recordLFOVal * (1 - baseWriteFollow));
            const posLFOVal = this.posLFOs[voiceIdx].tick(sampleRate);
            const lfoDepth = p.voicePosLFODepth[voiceIdx] || 0;
            const lfoOffset = posLFOVal * lfoDepth * this.bufferSize;
            // Cross-slice spray: quadratic scaling from slice-local to full buffer
            // spray=0: exact position, spray~0.25: within slice, spray=1: anywhere in buffer
            const sprayRange = spray * spray * this.bufferSize;
            const sprayOffset = sprayRange * (this.nextRandom() - 0.5);
            let basePos;
            if (writeFollow > 0.01) {
                // Blend between slice start and write head position (tape-delay feel)
                const writeHeadPos = (this.writePos - grainSamples * 2 + this.bufferSize) % this.bufferSize;
                basePos = Math.floor(sliceStart * (1 - writeFollow) + writeHeadPos * writeFollow);
            }
            else {
                basePos = sliceStart;
            }
            grain.position = (basePos + lfoOffset + sprayOffset + this.bufferSize) % this.bufferSize;
            this.lastGrainPos[voiceIdx] = grain.position;
            // Pitch: scale-quantized + optional grain oct shimmer + Euclidean pitch sub-lane
            let pitchSemitones = this.quantizePitch(p.voicePitch[voiceIdx] || 0);
            // Add Euclidean pitch override (additive semitones)
            if (this.euclidPitchActive[voiceIdx]) {
                pitchSemitones += this.euclidPitchOverride[voiceIdx];
            }
            const grainOct = p.voiceGrainOct[voiceIdx] || 0;
            if (grainOct > 0 && this.nextRandom() < grainOct) {
                pitchSemitones += 12; // +1 octave shimmer
            }
            const speed = p.voiceSpeed[voiceIdx] ?? 1;
            // Reverse LFO: periodic direction flip (XOR with manual reverse)
            const reverseLFOVal = this.reverseLFOs[voiceIdx].tick(sampleRate);
            const lfoReverse = reverseLFOVal > 0.5;
            // Euclidean reverse sub-lane XOR with manual + LFO reverse
            let isReversed = p.voiceReverse[voiceIdx] !== lfoReverse;
            if (this.euclidReverseActive[voiceIdx]) {
                isReversed = this.euclidReverseOverride[voiceIdx] !== isReversed;
            }
            const direction = isReversed ? -1 : 1;
            grain.playbackRate = Math.pow(2, pitchSemitones / 12) * speed * direction;
            // Pan: manual + LFO + spread randomization
            const basePan = p.voicePan[voiceIdx] || 0;
            const panLFO = (this.panLFOs[voiceIdx].tick(sampleRate) - 0.5) * 2;
            const panLFORate = p.voicePanLFORate[voiceIdx] || 0;
            const spread = p.voiceStereoSpread[voiceIdx] || 0;
            grain.pan = Math.max(-1, Math.min(1, basePan + panLFO * panLFORate * 0.5 + (this.nextRandom() - 0.5) * 2 * spread));
        }
        // Compute attack/decay envelope samples with 2ms minimum fade
        const minFade = Math.floor(0.002 * sampleRate);
        let atkSmp = Math.max(minFade, Math.floor((p.voiceAttack[voiceIdx] || 0.003) * sampleRate));
        let decSmp = Math.max(minFade, Math.floor((p.voiceDecay[voiceIdx] || 0.5) * sampleRate));
        // Scale proportionally if attack + decay exceed grain length
        if (atkSmp + decSmp > grainSamples) {
            const total = atkSmp + decSmp;
            atkSmp = Math.floor(atkSmp * grainSamples / total);
            decSmp = grainSamples - atkSmp;
        }
        grain.attackSamples = atkSmp;
        grain.decaySamples = decSmp;
        grain.startSample = 0;
        grain.length = grainSamples;
        grain.active = true;
    }
    // ═══════════════ Clean Mode Voice ═══════════════
    processCleanVoice(voiceIdx, outL, outR, blockSize) {
        const p = this.params;
        // Slice: use Euclidean override if active, else voice param
        const slice = this.euclidSliceOverride[voiceIdx] >= 0
            ? this.euclidSliceOverride[voiceIdx]
            : (p.voiceSlice[voiceIdx] || 0);
        const sliceStart = this.getSliceStart(slice);
        const sliceLen = this.getSliceLength();
        const speed = p.voiceSpeed[voiceIdx]; // allow 0 = LFO-only scanning
        // Reverse: Euclidean sub-lane XOR with manual
        let reverse = p.voiceReverse[voiceIdx];
        if (this.euclidReverseActive[voiceIdx]) {
            reverse = this.euclidReverseOverride[voiceIdx] !== reverse;
        }
        // Reverse LFO: periodic direction flip (also active in clean mode)
        const reverseLFOVal = this.reverseLFOs[voiceIdx].tick(sampleRate);
        const lfoReverse = reverseLFOVal > 0.5;
        reverse = reverse !== lfoReverse; // XOR
        // Pitch: add Euclidean pitch offset, quantize to scale if set
        let pitchSemi = this.quantizePitch(p.voicePitch[voiceIdx] || 0);
        if (this.euclidPitchActive[voiceIdx]) {
            pitchSemi += this.euclidPitchOverride[voiceIdx];
        }
        const pitchRate = Math.pow(2, pitchSemi / 12);
        const effectiveRate = speed * pitchRate * (reverse ? -1 : 1);
        const gain = p.voiceGain[voiceIdx] || 0.5;
        const pan = p.voicePan[voiceIdx] || 0;
        const blur = p.voiceBlur[voiceIdx] || 0;
        const diffuser = this.blurDiffusers[voiceIdx];
        // Position LFO
        const lfoDepth = p.voicePosLFODepth[voiceIdx] || 0;
        // Speed=0 mode (ZOIA Loop Forest-style): LFO IS the position, scanning full buffer
        const isLFOScanMode = speed === 0;
        // In LFO scan mode, enable sine waveform for smooth position scanning
        if (isLFOScanMode) {
            this.posLFOs[voiceIdx].setSine(true);
        }
        // Record LFO: modulate write-follow for periodic buffer refresh
        const baseWriteFollow = p.voiceWriteFollow[voiceIdx] || 0;
        const recordLFOVal = this.recordLFOs[voiceIdx].tick(sampleRate);
        const writeFollow = Math.min(1, baseWriteFollow + recordLFOVal * (1 - baseWriteFollow));
        // Pan LFO + stereo spread
        const basePan = pan;
        const panLFOVal = (this.panLFOs[voiceIdx].tick(sampleRate) - 0.5) * 2;
        const panLFORate = p.voicePanLFORate[voiceIdx] || 0;
        const spread = p.voiceStereoSpread[voiceIdx] || 0;
        const modulatedPan = Math.max(-1, Math.min(1,
            basePan + panLFOVal * panLFORate * 0.5 + spread * (voiceIdx % 2 === 0 ? -0.3 : 0.3)
        ));
        const { l: panL, r: panR } = this.getPanLR(modulatedPan);
        const isGated = p.euclidGated[voiceIdx];
        // Anti-alias: filter when pitching up (|rate| > 1)
        const absRate = Math.abs(effectiveRate);
        const aaL = this.antiAliasL[voiceIdx];
        const aaR = this.antiAliasR[voiceIdx];
        if (!isLFOScanMode) {
            aaL.update(absRate, sampleRate);
            aaR.update(absRate, sampleRate);
        } else {
            const absPitch = Math.abs(pitchRate);
            if (absPitch > 1.05) { aaL.update(absPitch, sampleRate); aaR.update(absPitch, sampleRate); }
        }
        // ═══ LFO Scan Mode: dual-head crossfade reader ═══
        if (isLFOScanMode) {
            const halfBuf = this.bufferSize * 0.5;
            const scanAdv = pitchRate * (reverse ? -1 : 1);
            for (let i = 0; i < blockSize; i++) {
                let envGain = 1;
                if (isGated) {
                    envGain = this.trigEnvLevel(voiceIdx);
                    this.advanceTrigEnv(voiceIdx);
                    if (envGain < 0.001) continue;
                }
                const lfoVal = this.posLFOs[voiceIdx].tick(sampleRate);
                let targetPos = (lfoVal * lfoDepth * this.bufferSize) % this.bufferSize;
                if (writeFollow > 0.01) {
                    const wp = (this.writePos - 4096 + this.bufferSize) % this.bufferSize;
                    targetPos = targetPos * (1 - writeFollow) + wp * writeFollow;
                }
                if (!this.scanHeadInit[voiceIdx]) {
                    this.scanHeadA[voiceIdx] = targetPos;
                    this.scanHeadB[voiceIdx] = targetPos;
                    this.scanFade[voiceIdx] = 0;
                    this.scanFading[voiceIdx] = false;
                    this.scanHeadInit[voiceIdx] = true;
                }
                this.scanHeadA[voiceIdx] = ((this.scanHeadA[voiceIdx] + scanAdv) % this.bufferSize + this.bufferSize) % this.bufferSize;
                this.scanHeadB[voiceIdx] = ((this.scanHeadB[voiceIdx] + scanAdv) % this.bufferSize + this.bufferSize) % this.bufferSize;
                const activePos = this.scanFade[voiceIdx] < 0.5
                    ? this.scanHeadA[voiceIdx]
                    : this.scanHeadB[voiceIdx];
                let drift = targetPos - activePos;
                if (drift > halfBuf) drift -= this.bufferSize;
                if (drift < -halfBuf) drift += this.bufferSize;
                if (!this.scanFading[voiceIdx] && Math.abs(drift) > this.SCAN_DRIFT_THRESH) {
                    this.scanFading[voiceIdx] = true;
                    if (this.scanFade[voiceIdx] < 0.5) {
                        this.scanHeadB[voiceIdx] = targetPos;
                        this.scanFadeDir[voiceIdx] = 1;
                    } else {
                        this.scanHeadA[voiceIdx] = targetPos;
                        this.scanFadeDir[voiceIdx] = -1;
                    }
                }
                if (this.scanFading[voiceIdx]) {
                    this.scanFade[voiceIdx] += this.scanFadeDir[voiceIdx] * this.SCAN_XFADE_INC;
                    if (this.scanFade[voiceIdx] >= 1) {
                        this.scanFade[voiceIdx] = 1;
                        this.scanFading[voiceIdx] = false;
                    } else if (this.scanFade[voiceIdx] <= 0) {
                        this.scanFade[voiceIdx] = 0;
                        this.scanFading[voiceIdx] = false;
                    }
                }
                // Constant-power crossfade (table lookup)
                const fadeIdx = (this.scanFade[voiceIdx] * XFADE_TABLE_SIZE) | 0;
                const gainA = XFADE_TABLE_A[fadeIdx];
                const gainB = XFADE_TABLE_B[fadeIdx];
                let sL = this.readBufferCubic(0, this.scanHeadA[voiceIdx]) * gainA
                       + this.readBufferCubic(0, this.scanHeadB[voiceIdx]) * gainB;
                let sR = this.readBufferCubic(1, this.scanHeadA[voiceIdx]) * gainA
                       + this.readBufferCubic(1, this.scanHeadB[voiceIdx]) * gainB;
                if (Math.abs(pitchRate) > 1.05) {
                    sL = aaL.process(sL);
                    sR = aaR.process(sR);
                }
                if (blur > 0.01) {
                    const blurredL = diffuser.process(sL);
                    const blurredR = diffuser.processR(sR);
                    sL = sL * (1 - blur) + blurredL * blur;
                    sR = sR * (1 - blur) + blurredR * blur;
                }
                outL[i] += sL * gain * envGain * panL;
                outR[i] += sR * gain * envGain * panR;
                this.cleanReadPos[voiceIdx] = activePos;
                this.scanLFOTarget[voiceIdx] = targetPos;
            }
            return;
        }
        // ═══ Normal clean voice (speed > 0) ═══
        for (let i = 0; i < blockSize; i++) {
            let envGain = 1;
            if (isGated) {
                envGain = this.trigEnvLevel(voiceIdx);
                this.advanceTrigEnv(voiceIdx);
                if (envGain < 0.001) continue;
            }
            const lfoVal = this.posLFOs[voiceIdx].tick(sampleRate);
            const lfoOffset = lfoVal * lfoDepth * this.bufferSize;
            const readPos = (sliceStart + (this.cleanReadPos[voiceIdx] % sliceLen) + lfoOffset + this.bufferSize) % this.bufferSize;
            let sL = aaL.process(this.readBufferCubic(0, readPos));
            let sR = aaR.process(this.readBufferCubic(1, readPos));
            if (blur > 0.01) {
                const blurredL = diffuser.process(sL);
                const blurredR = diffuser.processR(sR);
                sL = sL * (1 - blur) + blurredL * blur;
                sR = sR * (1 - blur) + blurredR * blur;
            }
            outL[i] += sL * gain * envGain * panL;
            outR[i] += sR * gain * envGain * panR;
            this.cleanReadPos[voiceIdx] += effectiveRate;
            if (this.cleanReadPos[voiceIdx] >= sliceLen) this.cleanReadPos[voiceIdx] -= sliceLen;
            if (this.cleanReadPos[voiceIdx] < 0) this.cleanReadPos[voiceIdx] += sliceLen;
        }
    }
    // ═══════════════ Granular/Legacy Mode Voice ═══════════════
    processGranularVoice(voiceIdx, outL, outR, blockSize) {
        const p = this.params;
        const gain = p.voiceGain[voiceIdx] || 0.5;
        const blur = p.voiceBlur[voiceIdx] || 0;
        const diffuser = this.blurDiffusers[voiceIdx];
        const pool = this.grainPools[voiceIdx];
        const isGated = p.euclidGated[voiceIdx];
        // Anti-alias: compute max absolute rate across active grains
        let maxAbsRate = 1;
        for (let g = 0; g < pool.length; g++) {
            if (pool[g].active) {
                const ar = Math.abs(pool[g].playbackRate);
                if (ar > maxAbsRate)
                    maxAbsRate = ar;
            }
        }
        const aaL = this.antiAliasL[voiceIdx];
        const aaR = this.antiAliasR[voiceIdx];
        aaL.update(maxAbsRate, sampleRate);
        aaR.update(maxAbsRate, sampleRate);
        for (let i = 0; i < blockSize; i++) {
            // Euclidean gating envelope
            let envGain = 1;
            if (isGated) {
                envGain = this.trigEnvLevel(voiceIdx);
                this.advanceTrigEnv(voiceIdx);
            }
            // Grain scheduling (always runs so grains fire on trigger)
            if (this.initialized) {
                this.samplesSinceGrain[voiceIdx]++;
                // Apply Euclidean density burst: reduce interval by multiplier
                const densityThreshold = Math.floor(this.samplesPerGrain[voiceIdx] / this.trigDensityMult[voiceIdx]);
                if (this.samplesSinceGrain[voiceIdx] >= densityThreshold) {
                    this.spawnGrain(voiceIdx);
                    this.samplesSinceGrain[voiceIdx] = 0;
                }
                // Decay burst multiplier back toward 1.0
                if (this.trigDensityMult[voiceIdx] > 1.001) {
                    this.trigDensityMult[voiceIdx] *= this.TRIG_DENSITY_DECAY;
                }
                else {
                    this.trigDensityMult[voiceIdx] = 1;
                }
            }
            // Accumulate active grains
            let wetL = 0;
            let wetR = 0;
            let activeCount = 0;
            for (let g = 0; g < pool.length; g++) {
                const grain = pool[g];
                if (!grain.active)
                    continue;
                activeCount++;
                // Read buffer with pitch shift
                const readPos = grain.position + grain.startSample * grain.playbackRate;
                const sL = this.readBufferCubic(0, readPos);
                const sR = this.readBufferCubic(1, readPos);
                // Asymmetric attack/decay envelope (or Hann fallback)
                const env = this.grainEnvelope(grain.startSample, grain.length, grain.attackSamples, grain.decaySamples);
                // Pan (GC-free)
                this.getPanLRFast(grain.pan);
                wetL += sL * env * this.panOut[0];
                wetR += sR * env * this.panOut[1];
                // Advance grain
                grain.startSample++;
                if (grain.startSample >= grain.length) {
                    grain.active = false;
                }
            }
            // Gain compensation: 1/√(activeCount) — precomputed for common values
            if (activeCount > 1) {
                // For activeCount <= 64 (MAX_GRAINS_PER_VOICE), use cached values
                const comp = this.gainCompTable[activeCount] || (1 / Math.sqrt(activeCount));
                wetL *= comp;
                wetR *= comp;
            }
            // Anti-alias filter (applied to accumulated voice output)
            wetL = aaL.process(wetL);
            wetR = aaR.process(wetR);
            // Apply blur (stereo: L through main chain, R through decorrelated chain)
            if (blur > 0.01) {
                const blurredL = diffuser.process(wetL);
                const blurredR = diffuser.processR(wetR);
                wetL = wetL * (1 - blur) + blurredL * blur;
                wetR = wetR * (1 - blur) + blurredR * blur;
            }
            outL[i] += wetL * gain * envGain;
            outR[i] += wetR * gain * envGain;
        }
    }
    // ═══════════════ Main Process ═══════════════
    process(inputs, outputs, _parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || !output || input.length < 1 || output.length < 2) {
            return true;
        }
        const inputL = input[0];
        const inputR = input[1] || input[0]; // mono fallback
        const outputL = output[0];
        const outputR = output[1];
        const blockSize = outputL.length;
        if (!this.params.enabled) {
            // Pass-through when disabled
            for (let i = 0; i < blockSize; i++) {
                outputL[i] = inputL[i] || 0;
                outputR[i] = inputR[i] || 0;
            }
            return true;
        }
        const perfStart = this.perfEnabled ? _perfNow() : 0;
        // ── Step 1: Write input to buffer (unless frozen) ──
        for (let i = 0; i < blockSize; i++) {
            let inL = inputL[i] || 0;
            let inR = inputR[i] || 0;
            // Silence detection: if not frozen and no input for >2s, fade buffer to silence
            const level = Math.abs(inL) + Math.abs(inR);
            if (level < 0.001) {
                this.silentSamples++;
                // After 2s of silence and not frozen, fade the buffer region we're about to overwrite
                if (!this.freeze && this.silentSamples > sampleRate * 2) {
                    // Gradually decay buffer content at write position toward silence
                    const fadeRate = Math.min(1.0, (this.silentSamples - sampleRate * 2) / (sampleRate * 4));
                    const decay = 1.0 - fadeRate * 0.002; // very slow fade per sample
                    this.buffer[0][this.writePos] *= decay;
                    this.buffer[1][this.writePos] *= decay;
                }
            }
            else {
                this.silentSamples = 0;
            }
            if (!this.freeze) {
                this.buffer[0][this.writePos] = inL;
                this.buffer[1][this.writePos] = inR;
            }
            // Advance write position even when frozen (for feedback write)
            if (!this.freeze) {
                this.writePos = (this.writePos + 1) % this.bufferSize;
            }
        }
        // ── Step 2: Process voices ──
        // Accumulate voice output into pre-allocated temp arrays (zero-fill)
        const voiceOutL = this.voiceOutL;
        const voiceOutR = this.voiceOutR;
        if (voiceOutL.length < blockSize) {
            this.voiceOutL = new Float32Array(blockSize);
            this.voiceOutR = new Float32Array(blockSize);
        }
        voiceOutL.fill(0);
        voiceOutR.fill(0);
        let activeVoiceCount = 0;
        for (let v = 0; v < NUM_VOICES; v++) {
            if (!this.params.voiceEnabled[v])
                continue;
            activeVoiceCount++;
            const mode = this.params.voiceMode[v];
            if (mode === 'clean') {
                this.processCleanVoice(v, voiceOutL, voiceOutR, blockSize);
            }
            else {
                // 'granular' or 'legacy'
                this.processGranularVoice(v, voiceOutL, voiceOutR, blockSize);
            }
        }
        // ── Step 2b: Voice-count gain compensation ──
        // When multiple voices are active, scale by 1/√(n) to keep total energy constant
        if (activeVoiceCount > 1) {
            const voiceComp = 1 / Math.sqrt(activeVoiceCount);
            for (let i = 0; i < blockSize; i++) {
                voiceOutL[i] *= voiceComp;
                voiceOutR[i] *= voiceComp;
            }
        }
        // ── Step 3: Feedback ──
        const feedbackGain = this.params.voiceMode[0] === 'legacy'
            ? Math.min(this.params.legacyFeedback, 0.35)
            : Math.min(this.params.feedback, 0.85);
        if (feedbackGain > 0.001) {
            for (let i = 0; i < blockSize; i++) {
                // Apply feedback filters
                let fbL = voiceOutL[i] * feedbackGain;
                let fbR = voiceOutR[i] * feedbackGain;
                // HPF (30Hz) to prevent subsonic buildup — separate per channel
                fbL = this.feedbackHPF_L.process(fbL);
                fbR = this.feedbackHPF_R.process(fbR);
                // LPF (user-controlled darkening per cycle) — separate per channel
                fbL = this.feedbackLPF_L.process(fbL, this.feedbackLPFCoeff);
                fbR = this.feedbackLPF_R.process(fbR, this.feedbackLPFCoeff);
                // RMS auto-gain: reduce feedback when energy is high
                const energy = fbL * fbL + fbR * fbR;
                const coeff = energy > this.feedbackRMS ? this.RMS_ATTACK : this.RMS_RELEASE;
                this.feedbackRMS += coeff * (energy - this.feedbackRMS);
                // Compare squared thresholds to avoid Math.sqrt per sample
                const autoGain = this.feedbackRMS > 0.09 ? 0.3 / Math.sqrt(this.feedbackRMS) : 1.0;
                fbL *= autoGain;
                fbR *= autoGain;
                // Soft clip (fast rational approx)
                fbL = fastTanh(fbL);
                fbR = fastTanh(fbR);
                // Write feedback to buffer
                if (!this.freeze || this.freezeWithFeedback) {
                    const fbWritePos = (this.writePos - blockSize + i + this.bufferSize) % this.bufferSize;
                    this.buffer[0][fbWritePos] += fbL;
                    this.buffer[1][fbWritePos] += fbR;
                }
            }
        }
        // ── Step 4: Output ──
        const wetLevel = this.params.dryWet;
        for (let i = 0; i < blockSize; i++) {
            // Soft limit output (fast rational approx)
            outputL[i] = fastTanh(voiceOutL[i] * wetLevel);
            outputR[i] = fastTanh(voiceOutR[i] * wetLevel);
        }
        // Position reporting (~20Hz for smooth UI)
        this.posReportCounter += blockSize;
        if (this.posReportCounter >= this.POS_REPORT_INTERVAL) {
            this.posReportCounter = 0;
            const writeNorm = this.writePos / this.bufferSize;
            const voiceNorm = [];
            for (let v = 0; v < NUM_VOICES; v++) {
                const mode = this.params.voiceMode[v];
                if (mode === 'clean') {
                    // Clean mode: use the continuously advancing read cursor
                    // In speed=0 (LFO scan) mode, cleanReadPos is already the absolute position
                    const speed = this.params.voiceSpeed[v];
                    if (speed === 0) {
                        // Use LFO target position for smooth visualization (avoids dual-head crossfade snap)
                        voiceNorm.push(((this.scanLFOTarget[v] % this.bufferSize) + this.bufferSize) % this.bufferSize / this.bufferSize);
                    }
                    else {
                        const slice = this.euclidSliceOverride[v] >= 0 ? this.euclidSliceOverride[v] : (this.params.voiceSlice[v] || 0);
                        const sliceStart = this.getSliceStart(slice);
                        voiceNorm.push(((sliceStart + this.cleanReadPos[v]) % this.bufferSize) / this.bufferSize);
                    }
                }
                else {
                    // Granular/legacy: use most-recently-spawned grain's buffer position
                    voiceNorm.push(this.lastGrainPos[v] / this.bufferSize);
                }
            }
            this.port.postMessage({
                type: 'position',
                writeHead: writeNorm,
                voices: voiceNorm,
            });
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
                    name: 'looper-fx',
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
registerProcessor('looper-fx', LooperFXProcessor);
