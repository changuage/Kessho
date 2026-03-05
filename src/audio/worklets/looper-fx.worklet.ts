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

// Safe performance.now() — not all AudioWorklet scopes expose `performance`
const _perfNow: () => number = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// ═══════════════ Interfaces ═══════════════

interface LooperParams {
  // Global
  enabled: boolean;
  freeze: boolean;              // Stop write head
  freezeWithFeedback: boolean;  // Allow feedback to write when frozen
  dryWet: number;               // 0-1 output level
  feedback: number;             // 0-0.85
  feedbackLPF: number;          // Hz: lowpass in feedback path
  bufferSeconds: number;        // 4 or 16

  // Per-voice (arrays of 4)
  voiceEnabled: boolean[];
  voiceMode: VoiceMode[];       // 'clean' | 'granular' | 'legacy'
  voiceSlice: number[];         // 0-15 which slice to read
  voiceSpeed: number[];         // 0-4x playback rate (0 = LFO scan mode)
  voiceReverse: boolean[];
  voicePitch: number[];         // semitones -24 to +24
  voiceAttack: number[];        // seconds 0.001-0.5
  voiceDecay: number[];         // seconds 0.01-4.0
  voiceBlur: number[];          // 0-1 allpass diffusion
  voiceGrainOct: number[];      // 0-1 probability of +12st
  voiceSpray: number[];         // 0-1 position randomization
  voiceDensity: number[];       // 1-64 grains per second
  voiceGrainSize: number[];     // 10-500ms
  voicePan: number[];           // -1 to +1
  voiceGain: number[];          // 0-1
  voicePosLFORate: number[];    // 0-1 (0=off, 1=~20s cycle)
  voicePosLFODepth: number[];   // 0-1 (scan range)
  voicePanLFORate: number[];    // 0-1
  voiceStereoSpread: number[];  // 0-1 (for grain pan randomization)
  voiceReverseLFORate: number[];// 0-1 periodic direction flip (Phase 3)
  voiceWriteFollow: number[];   // 0-1 blend slice pos vs write head (Phase 3)
  voiceRecordLFORate: number[]; // 0-1 oscillating write-follow modulation (Phase 3)
  scaleIntervals: number[];     // e.g. [0,2,4,5,7,9,11] — empty = no quantize (Phase 2)

  // Euclidean gating (per-voice)
  euclidGated: boolean[];       // true = voice output gated by trigger envelope
  euclidMuted: boolean[];       // true = voice silenced by Euclid mute/solo (but still counted for gain comp)

  // Legacy-only (voice[0] when in legacy mode)
  legacyJitter: number;         // ms
  legacyProbability: number;    // 0-1
  legacyPitchMode: 'random' | 'harmonic';
  legacyPitchSpread: number;    // semitones
  legacyMaxGrains: number;      // 0-128
  legacyFeedback: number;       // 0-0.35 (capped)
}

type VoiceMode = 'clean' | 'granular' | 'legacy';

interface Grain {
  position: number;       // read position in buffer (fractional samples)
  startSample: number;    // samples elapsed since grain start
  length: number;         // grain length in samples
  playbackRate: number;   // pitch shift rate
  pan: number;            // -1 to 1
  active: boolean;
  attackSamples: number;  // rise time in samples (Phase 2)
  decaySamples: number;   // fall time in samples (Phase 2)
}

// ═══════════════ DSP Primitives ═══════════════

// 4-stage allpass chain for blur (micro-diffusion)
class AllpassDiffuser {
  private delays: Float32Array[];
  private writePos: number[] = [0, 0, 0, 0];
  private readonly delaySizes = [72, 110, 178, 245]; // ~1.5ms, 2.3ms, 3.7ms, 5.1ms @ 48kHz
  // Right-channel variant uses prime-ratio offsets for stereo decorrelation
  private delaysR: Float32Array[];
  private writePosR: number[] = [0, 0, 0, 0];
  private readonly delaySizesR = [83, 127, 193, 269]; // ~1.7ms, 2.6ms, 4.0ms, 5.6ms @ 48kHz
  private g = 0; // allpass coefficient (blur amount)

  constructor(sr: number) {
    const scale = sr / 48000;
    this.delays = this.delaySizes.map(s => new Float32Array(Math.ceil(s * scale) + 1));
    this.delaysR = this.delaySizesR.map(s => new Float32Array(Math.ceil(s * scale) + 1));
  }

  setBlur(blur: number) {
    this.g = blur * 0.7; // Cap at 0.7 for stability
  }

  process(input: number): number {
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
  processR(input: number): number {
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
  private z1 = 0;
  process(input: number, coeff: number): number {
    this.z1 = input * (1 - coeff) + this.z1 * coeff;
    return this.z1;
  }
}

class OnePoleHPF {
  private x1 = 0;
  private y1 = 0;
  process(input: number): number {
    // HPF at ~30Hz: y = x - x1 + 0.996 * y1
    const y = input - this.x1 + 0.996 * this.y1;
    this.x1 = input;
    this.y1 = y;
    return y;
  }
}

// 2-pole biquad lowpass for anti-aliasing pitch-up playback
class AntiAliasLPF {
  private b0 = 1; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0;
  private y1 = 0; private y2 = 0;
  private currentRate = 1;

  /** Recalculate coefficients only when playback rate changes significantly */
  update(absRate: number, _sr?: number) {
    // Only filter when pitching up (rate > 1.05)
    if (absRate <= 1.05) { this.currentRate = 1; return; }
    // Avoid recalculation if rate hasn't changed much
    if (Math.abs(absRate - this.currentRate) < 0.02) return;
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

  process(x: number): number {
    if (this.currentRate <= 1) return x; // Bypass when not pitching up
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
              - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.currentRate = 1; }
}

// ─── CPU-friendly math helpers ───

/** Fast tanh approximation: x(27+x²)/(27+9x²), max error ~0.004  */
function fastTanh(x: number): number {
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
  private phase = 0;
  private rate = 0; // Hz
  private useSine = false; // true = sine (smooth for position scanning), false = triangle

  setRate(normalized: number) {
    // 0 = off, 1 = ~0.15Hz (~6.7s cycle). Covers ZOIA Loop Forest range (0.016–0.128 Hz)
    this.rate = normalized > 0.01 ? normalized * 0.15 : 0;
  }

  /** Set initial phase offset (0..1) for decorrelating multiple voices */
  setPhase(p: number) { this.phase = p % 1; }

  /** Enable sine waveform (smoother for position scanning) */
  setSine(on: boolean) { this.useSine = on; }

  tick(sr: number): number {
    if (this.rate <= 0) return 0;
    this.phase += this.rate / sr;
    if (this.phase > 1) this.phase -= 1;
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
  0,    // Unison
  7,    // Perfect Fifth
  12,   // Octave
  -12,  // Octave down
  19,   // Twelfth
  5,    // Perfect Fourth
  -7,   // Fifth down
  24,   // Double octave
  -5,   // Fourth down
  4,    // Major Third
  -24,  // Double octave down
];

const NUM_VOICES = 4;
const NUM_SLICES = 16;
const MAX_GRAINS_PER_VOICE = 64;
const MAX_TOTAL_GRAINS = 64; // Global cap across all voices to prevent CPU overload

// ═══════════════ Main Processor ═══════════════

class LooperFXProcessor extends AudioWorkletProcessor {
  // Buffer
  private buffer: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private bufferSize = 0;
  private writePos = 0;
  private freeze = false;
  private freezeWithFeedback = false;

  // Per-voice grain pools
  private grainPools: Grain[][] = [];

  // Per-voice blur diffusers
  private blurDiffusers: AllpassDiffuser[] = [];

  // Per-voice LFOs
  private posLFOs: TriLFO[] = [];
  private panLFOs: TriLFO[] = [];
  private reverseLFOs: TriLFO[] = [];
  private recordLFOs: TriLFO[] = [];

  // Per-voice anti-alias filters (L+R per voice)
  private antiAliasL: AntiAliasLPF[] = [];
  private antiAliasR: AntiAliasLPF[] = [];

  // Feedback filters (separate per channel to avoid stereo crosstalk)
  private feedbackHPF_L = new OnePoleHPF();
  private feedbackHPF_R = new OnePoleHPF();
  private feedbackLPF_L = new OnePoleLPF();
  private feedbackLPF_R = new OnePoleLPF();
  private feedbackLPFCoeff = 0.7;

  // RMS auto-gain for feedback path
  private feedbackRMS = 0;
  private readonly RMS_ATTACK = 0.001;   // fast attack (~1ms at 48kHz)
  private readonly RMS_RELEASE = 0.05;   // slow release (~50ms)

  // Random sequence (deterministic, from main thread)
  private randomSequence: Float32Array = new Float32Array(0);
  private randomIndex = 0;
  private initialized = false;

  // Grain scheduling per voice
  private samplesSinceGrain: number[] = [0, 0, 0, 0];
  private samplesPerGrain: number[] = [2205, 2205, 2205, 2205];

  // Euclidean-driven density burst: multiplier decays from peak back to 1.0
  private trigDensityMult: number[] = [1, 1, 1, 1];
  private readonly TRIG_DENSITY_DECAY = 0.9997; // ~200ms decay at 48kHz

  // Per-voice read position (clean mode)
  private cleanReadPos: number[] = [0, 0, 0, 0];
  // Dual-head crossfade reader for LFO scan mode (speed=0)
  // Two read heads play at 1× speed (or pitchRate), crossfading when the active head
  // drifts too far from the LFO target position. This eliminates the variable-speed
  // pitch artifacts of the old slew-rate limiter — playback is always at consistent pitch.
  private scanHeadA: number[] = [0, 0, 0, 0];
  private scanHeadB: number[] = [0, 0, 0, 0];
  private scanFade: number[] = [0, 0, 0, 0];       // 0 = 100% head A, 1 = 100% head B
  private scanFading: boolean[] = [false, false, false, false];
  private scanFadeDir: number[] = [0, 0, 0, 0];    // +1 = fading toward B, -1 = toward A
  private scanHeadInit: boolean[] = [false, false, false, false];
  // Last LFO target position for smooth UI visualization (instead of snapping between heads)
  private scanLFOTarget: number[] = [0, 0, 0, 0];
  // Crossfade increment per sample: ~120ms at 48kHz for silky blending
  private readonly SCAN_XFADE_INC = 1 / 5760;
  // Drift threshold: trigger crossfade when active head is >150ms from LFO target
  private readonly SCAN_DRIFT_THRESH = 7200;
  // Per-voice representative read position for granular/legacy (most-recently-spawned grain)
  private lastGrainPos: number[] = [0, 0, 0, 0];

  // Per-voice Euclidean trigger envelope
  // Phase: samples since last trigger (-1 = no active envelope)
  private trigEnvPhase: number[] = [-1, -1, -1, -1];
  // Velocity from trigger (0-1)
  private trigEnvVelocity: number[] = [1, 1, 1, 1];
  // Cached attack/decay in samples (set on trigger, avoids per-sample multiply)
  private trigEnvAtkCache: number[] = [1, 1, 1, 1];
  private trigEnvDecCache: number[] = [1, 1, 1, 1];

  // Pre-allocated array for position report messages
  private posReportVoices: number[] = [0, 0, 0, 0];

  // Global active grain counter (across all voices) for CPU budget cap
  private totalActiveGrains = 0;

  // Per-voice Euclidean sub-lane overrides (set via euclidTrigger, -1 = no override)
  private euclidSliceOverride: number[] = [-1, -1, -1, -1];    // 0-15 slice index, -1 = use voice param
  private euclidPitchOverride: number[] = [0, 0, 0, 0];        // semitones offset from sub-lane
  private euclidPitchActive: boolean[] = [false, false, false, false];
  private euclidReverseOverride: boolean[] = [false, false, false, false];
  private euclidReverseActive: boolean[] = [false, false, false, false];

  // Hann window lookup table
  private hannTable: Float32Array;
  private readonly HANN_SIZE = 1024;

  // Pan lookup tables
  private panTableL: Float32Array;
  private panTableR: Float32Array;
  private readonly PAN_SIZE = 256;

  private silentSamples = 0;

  // Pre-allocated voice output buffers (avoid GC pressure in process())
  private voiceOutL: Float32Array = new Float32Array(128);
  private voiceOutR: Float32Array = new Float32Array(128);

  // Precomputed 1/√(n) table for grain gain compensation (indices 0..MAX_GRAINS_PER_VOICE)
  private gainCompTable: Float32Array = new Float32Array(MAX_GRAINS_PER_VOICE + 1);

  // Performance monitoring
  private perfEnabled = false;
  private perfTotalTime = 0;
  private perfCount = 0;
  private perfSamplesSinceReport = 0;
  private perfReportInterval = 48000;

  // Position reporting (~20Hz)
  private posReportCounter = 0;
  private readonly POS_REPORT_INTERVAL = Math.floor(48000 / 20); // ~50ms at 48kHz

  // Parameters
  private params: LooperParams;

  constructor() {
    super();

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
      const pool: Grain[] = [];
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
      panLFO.setPhase(v * 0.17 + 0.1); // offset from position LFO
      this.panLFOs.push(panLFO);
      const revLFO = new TriLFO();
      revLFO.setPhase(v * 0.31); // different offset pattern
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

  private defaultParams(): LooperParams {
    const arr4 = <T>(v: T): T[] => [v, v, v, v];
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
      euclidMuted: arr4(false),
      legacyJitter: 10,
      legacyProbability: 0.8,
      legacyPitchMode: 'harmonic',
      legacyPitchSpread: 2,
      legacyMaxGrains: 64,
      legacyFeedback: 0.1,
    };
  }

  // ═══════════════ Message Handling ═══════════════

  private handleMessage(data: { type: string; [key: string]: unknown }) {
    switch (data.type) {
      case 'params':
        Object.assign(this.params, data.params);
        this.applyParams();
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
      case 'euclidTrigger': {
        // Triggered by Euclidean scheduler: restart envelope for voice
        const voice = data.voice as number;
        const velocity = data.velocity as number;
        if (voice >= 0 && voice < NUM_VOICES) {
          this.trigEnvPhase[voice] = 0;
          this.trigEnvVelocity[voice] = velocity;
          // Cache attack/decay in samples so trigEnvLevel doesn't recompute per sample
          this.trigEnvAtkCache[voice] = Math.max(1, this.params.voiceAttack[voice] * sampleRate);
          this.trigEnvDecCache[voice] = Math.max(1, this.params.voiceDecay[voice] * sampleRate);

          // Apply sub-lane overrides
          if (data.sliceOverride !== undefined) {
            this.euclidSliceOverride[voice] = data.sliceOverride as number;
          }
          if (data.pitchOverride !== undefined) {
            this.euclidPitchOverride[voice] = data.pitchOverride as number;
            this.euclidPitchActive[voice] = true;
          } else {
            this.euclidPitchActive[voice] = false;
          }
          if (data.reverseOverride !== undefined) {
            this.euclidReverseOverride[voice] = data.reverseOverride as boolean;
            this.euclidReverseActive[voice] = true;
          } else {
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
        this.perfEnabled = data.enabled as boolean;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        break;
    }
  }

  private applyParams() {
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

  private resizeBuffer(newSize: number) {
    const newBuf = [new Float32Array(newSize), new Float32Array(newSize)];
    const copyLen = Math.min(this.bufferSize, newSize);
    for (let ch = 0; ch < 2; ch++) {
      newBuf[ch].set(this.buffer[ch].subarray(0, copyLen));
    }
    this.buffer = newBuf;
    this.bufferSize = newSize;
    if (this.writePos >= newSize) this.writePos = 0;
  }

  // ═══════════════ Utility ═══════════════

  /** Compute Euclidean trigger envelope level for a voice (AD envelope using voiceAttack/voiceDecay) */
  private trigEnvLevel(voiceIdx: number): number {
    const phase = this.trigEnvPhase[voiceIdx];
    if (phase < 0) return 1; // No active envelope → full level (ungated)
    const atkSamples = this.trigEnvAtkCache[voiceIdx];
    const decSamples = this.trigEnvDecCache[voiceIdx];
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
  private advanceTrigEnv(voiceIdx: number) {
    if (this.trigEnvPhase[voiceIdx] >= 0) {
      this.trigEnvPhase[voiceIdx]++;
      // Auto-expire: check if envelope is done
      if (this.trigEnvPhase[voiceIdx] > this.trigEnvAtkCache[voiceIdx] + this.trigEnvDecCache[voiceIdx]) {
        this.trigEnvPhase[voiceIdx] = -1; // Envelope done
      }
    }
  }

  private nextRandom(): number {
    if (this.randomSequence.length === 0) return Math.random();
    const v = this.randomSequence[this.randomIndex];
    this.randomIndex = (this.randomIndex + 1) % this.randomSequence.length;
    return v;
  }

  private hannWindow(position: number, length: number): number {
    const phase = position / length;
    const idx = Math.min(this.HANN_SIZE - 1, Math.max(0, Math.floor(phase * (this.HANN_SIZE - 1))));
    return this.hannTable[idx];
  }

  // Asymmetric grain envelope: cosine attack → sustain → cosine decay
  // Reuses Hann lookup table for efficiency
  private grainEnvelope(sample: number, length: number, atkSamples: number, decSamples: number): number {
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
  private quantizePitch(semitones: number): number {
    const intervals = this.params.scaleIntervals;
    if (!intervals || intervals.length === 0) return semitones;
    const octaves = Math.floor(semitones / 12);
    const remainder = ((semitones % 12) + 12) % 12;
    let bestInterval = 0;
    let bestDist = 99;
    for (let i = 0; i < intervals.length; i++) {
      const d = Math.abs(intervals[i] - remainder);
      const dist = Math.min(d, 12 - d); // wraparound
      if (dist < bestDist) { bestDist = dist; bestInterval = intervals[i]; }
    }
    return octaves * 12 + bestInterval;
  }

  /** GC-free pan lookup — writes into a reusable 2-element array */
  private readonly panOut = [0, 0]; // [L, R]
  private getPanLRFast(pan: number): void {
    const idx = Math.min(this.PAN_SIZE - 1, Math.max(0, ((pan + 1) * 0.5 * (this.PAN_SIZE - 1)) | 0));
    this.panOut[0] = this.panTableL[idx];
    this.panOut[1] = this.panTableR[idx];
  }

  // Cubic Hermite interpolation for high-quality pitch shifting
  // Optimised: reduced modulo ops, bitwise floor
  private readBufferCubic(channel: number, position: number): number {
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



  private fillNoiseBuffer(): void {
    // Start with silence — grains will only play back what's been recorded
    for (let i = 0; i < this.bufferSize; i++) {
      this.buffer[0][i] = 0;
      this.buffer[1][i] = 0;
    }
  }

  // ═══════════════ Slice System ═══════════════

  private getSliceStart(sliceIndex: number): number {
    return Math.floor((sliceIndex / NUM_SLICES) * this.bufferSize);
  }

  private getSliceLength(): number {
    return Math.floor(this.bufferSize / NUM_SLICES);
  }

  // ═══════════════ Grain Spawning ═══════════════

  private spawnGrain(voiceIdx: number) {
    const p = this.params;
    const mode = p.voiceMode[voiceIdx];
    const pool = this.grainPools[voiceIdx];

    // Global grain cap: skip spawn if total active grains across all voices exceeds budget
    if (this.totalActiveGrains >= MAX_TOTAL_GRAINS) return;

    // Find inactive grain (indexed loop avoids closure allocation of pool.find)
    let grain: typeof pool[0] | undefined;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) { grain = pool[i]; break; }
    }
    if (!grain) return;

    const grainSizeMs = p.voiceGrainSize[voiceIdx] || 80;
    const grainSamples = Math.floor((grainSizeMs / 1000) * sampleRate);

    if (mode === 'legacy') {
      // Legacy mode: replicate original granulator behavior
      if (this.nextRandom() > p.legacyProbability) return;

      const spraySamples = Math.floor((p.voiceSpray[voiceIdx] * 600 / 1000) * sampleRate);
      const jitterSamples = Math.floor((p.legacyJitter / 1000) * sampleRate);
      const basePos = (this.writePos - spraySamples + this.bufferSize) % this.bufferSize;
      const sprayOffset = Math.floor(this.nextRandom() * spraySamples);
      const jitterOffset = Math.floor((this.nextRandom() - 0.5) * 2 * jitterSamples);
      grain.position = (basePos - sprayOffset + jitterOffset + this.bufferSize) % this.bufferSize;
      this.lastGrainPos[voiceIdx] = grain.position;

      // Harmonic or random pitch
      let pitchOffset: number;
      if (p.legacyPitchMode === 'harmonic') {
        const maxIdx = Math.max(1, Math.floor((p.legacyPitchSpread / 12) * LOOPER_HARMONIC_INTERVALS.length));
        pitchOffset = LOOPER_HARMONIC_INTERVALS[Math.floor(this.nextRandom() * maxIdx)];
      } else {
        pitchOffset = (this.nextRandom() - 0.5) * 2 * p.legacyPitchSpread;
      }
      grain.playbackRate = Math.pow(2, pitchOffset / 12);
      grain.pan = (this.nextRandom() - 0.5) * 2 * (p.voiceStereoSpread[voiceIdx] || 0.5);

    } else {
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

      let basePos: number;
      if (writeFollow > 0.01) {
        // Blend between slice start and write head position (tape-delay feel)
        const writeHeadPos = (this.writePos - grainSamples * 2 + this.bufferSize) % this.bufferSize;
        basePos = Math.floor(sliceStart * (1 - writeFollow) + writeHeadPos * writeFollow);
      } else {
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
      grain.pan = Math.max(-1, Math.min(1,
        basePan + panLFO * panLFORate * 0.5 + (this.nextRandom() - 0.5) * 2 * spread
      ));
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
    this.totalActiveGrains++;
  }

  // ═══════════════ Clean Mode Voice ═══════════════

  private processCleanVoice(voiceIdx: number, outL: Float32Array, outR: Float32Array, blockSize: number) {
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
    this.getPanLRFast(modulatedPan);
    const panL = this.panOut[0];
    const panR = this.panOut[1];

    const isGated = p.euclidGated[voiceIdx];

    // Anti-alias: filter when pitching up (|rate| > 1)
    const absRate = Math.abs(effectiveRate);
    const aaL = this.antiAliasL[voiceIdx];
    const aaR = this.antiAliasR[voiceIdx];
    if (!isLFOScanMode) {
      aaL.update(absRate, sampleRate);
      aaR.update(absRate, sampleRate);
    } else {
      // In scan mode, heads play at pitchRate—only need AA if pitching up
      const absPitch = Math.abs(pitchRate);
      if (absPitch > 1.05) { aaL.update(absPitch, sampleRate); aaR.update(absPitch, sampleRate); }
    }

    // ═══ LFO Scan Mode: dual-head crossfade reader ═══
    // Two read heads both play at 1× (or pitchRate). When the active head drifts too far
    // from the LFO target, the inactive head jumps to the target and we cosine-crossfade.
    // This keeps playback at constant pitch—no variable-speed warping.
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

        // Initialize both heads on first call
        if (!this.scanHeadInit[voiceIdx]) {
          this.scanHeadA[voiceIdx] = targetPos;
          this.scanHeadB[voiceIdx] = targetPos;
          this.scanFade[voiceIdx] = 0;
          this.scanFading[voiceIdx] = false;
          this.scanHeadInit[voiceIdx] = true;
        }

        // Advance both heads at pitch rate (1× default)
        this.scanHeadA[voiceIdx] = ((this.scanHeadA[voiceIdx] + scanAdv) % this.bufferSize + this.bufferSize) % this.bufferSize;
        this.scanHeadB[voiceIdx] = ((this.scanHeadB[voiceIdx] + scanAdv) % this.bufferSize + this.bufferSize) % this.bufferSize;

        // Check drift of active head from LFO target
        const activePos = this.scanFade[voiceIdx] < 0.5
          ? this.scanHeadA[voiceIdx]
          : this.scanHeadB[voiceIdx];
        let drift = targetPos - activePos;
        if (drift > halfBuf) drift -= this.bufferSize;
        if (drift < -halfBuf) drift += this.bufferSize;

        // Trigger crossfade when drift exceeds threshold (and not already fading)
        if (!this.scanFading[voiceIdx] && Math.abs(drift) > this.SCAN_DRIFT_THRESH) {
          this.scanFading[voiceIdx] = true;
          if (this.scanFade[voiceIdx] < 0.5) {
            // Head A active → reset head B to target, fade toward B
            this.scanHeadB[voiceIdx] = targetPos;
            this.scanFadeDir[voiceIdx] = 1;
          } else {
            // Head B active → reset head A to target, fade toward A
            this.scanHeadA[voiceIdx] = targetPos;
            this.scanFadeDir[voiceIdx] = -1;
          }
        }

        // Advance crossfade
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

        // Read both heads and blend
        let sL = this.readBufferCubic(0, this.scanHeadA[voiceIdx]) * gainA
               + this.readBufferCubic(0, this.scanHeadB[voiceIdx]) * gainB;
        let sR = this.readBufferCubic(1, this.scanHeadA[voiceIdx]) * gainA
               + this.readBufferCubic(1, this.scanHeadB[voiceIdx]) * gainB;

        // Anti-alias for pitch-up
        if (Math.abs(pitchRate) > 1.05) {
          sL = aaL.process(sL);
          sR = aaR.process(sR);
        }

        // Blur
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
      return; // LFO scan mode handled above
    }

    // ═══ Normal clean voice (speed > 0) ═══
    for (let i = 0; i < blockSize; i++) {
      // Euclidean gating: if gated and no active envelope, skip sample
      let envGain = 1;
      if (isGated) {
        envGain = this.trigEnvLevel(voiceIdx);
        this.advanceTrigEnv(voiceIdx);
        if (envGain < 0.001) continue;
      }

      // LFO value
      const lfoVal = this.posLFOs[voiceIdx].tick(sampleRate);

      // Normal mode: LFO is offset added to advancing read position within slice
      const lfoOffset = lfoVal * lfoDepth * this.bufferSize;
      const readPos = (sliceStart + (this.cleanReadPos[voiceIdx] % sliceLen) + lfoOffset + this.bufferSize) % this.bufferSize;

      let sL = aaL.process(this.readBufferCubic(0, readPos));
      let sR = aaR.process(this.readBufferCubic(1, readPos));

      // Apply blur (stereo: L through main chain, R through decorrelated chain)
      if (blur > 0.01) {
        const blurredL = diffuser.process(sL);
        const blurredR = diffuser.processR(sR);
        sL = sL * (1 - blur) + blurredL * blur;
        sR = sR * (1 - blur) + blurredR * blur;
      }

      outL[i] += sL * gain * envGain * panL;
      outR[i] += sR * gain * envGain * panR;

      // Advance read position
      this.cleanReadPos[voiceIdx] += effectiveRate;
      if (this.cleanReadPos[voiceIdx] >= sliceLen) this.cleanReadPos[voiceIdx] -= sliceLen;
      if (this.cleanReadPos[voiceIdx] < 0) this.cleanReadPos[voiceIdx] += sliceLen;
    }
  }

  // ═══════════════ Granular/Legacy Mode Voice ═══════════════

  private processGranularVoice(voiceIdx: number, outL: Float32Array, outR: Float32Array, blockSize: number) {
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
        if (ar > maxAbsRate) maxAbsRate = ar;
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
        } else {
          this.trigDensityMult[voiceIdx] = 1;
        }
      }

      // Accumulate active grains
      let wetL = 0;
      let wetR = 0;
      let activeCount = 0;

      for (let g = 0; g < pool.length; g++) {
        const grain = pool[g];
        if (!grain.active) continue;
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
          this.totalActiveGrains--;
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

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
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
      } else {
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

    // Count ALL enabled voices for compensation (including Euclid-muted ones)
    // so mute/solo doesn't cause volume jumps
    let activeVoiceCount = 0;
    for (let v = 0; v < NUM_VOICES; v++) {
      if (this.params.voiceEnabled[v]) activeVoiceCount++;
    }

    for (let v = 0; v < NUM_VOICES; v++) {
      if (!this.params.voiceEnabled[v]) continue;
      if (this.params.euclidMuted[v]) continue; // silenced by Euclid mute/solo

      const mode = this.params.voiceMode[v];
      if (mode === 'clean') {
        this.processCleanVoice(v, voiceOutL, voiceOutR, blockSize);
      } else {
        // 'granular' or 'legacy'
        this.processGranularVoice(v, voiceOutL, voiceOutR, blockSize);
      }
    }

    // ── Step 2b: Voice-count gain compensation ──
    // Always scale by 1/√(NUM_VOICES) so solo/mute don't change gain of remaining voices
    {
      const voiceComp = 1 / Math.sqrt(NUM_VOICES);
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
        // Original: rmsLevel > 0.3 → autoGain = 0.3/rmsLevel
        // Squared:  feedbackRMS > 0.09 → autoGain = 0.09/feedbackRMS (applied to squared domain)
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
      for (let v = 0; v < NUM_VOICES; v++) {
        const mode = this.params.voiceMode[v];
        if (mode === 'clean') {
          const speed = this.params.voiceSpeed[v];
          if (speed === 0) {
            // Use LFO target position for smooth visualization (avoids dual-head crossfade snap)
            this.posReportVoices[v] = ((this.scanLFOTarget[v] % this.bufferSize) + this.bufferSize) % this.bufferSize / this.bufferSize;
          } else {
            const slice = this.euclidSliceOverride[v] >= 0 ? this.euclidSliceOverride[v] : (this.params.voiceSlice[v] || 0);
            const sliceStart = this.getSliceStart(slice);
            this.posReportVoices[v] = ((sliceStart + this.cleanReadPos[v]) % this.bufferSize) / this.bufferSize;
          }
        } else {
          this.posReportVoices[v] = this.lastGrainPos[v] / this.bufferSize;
        }
      }
      this.port.postMessage({
        type: 'position',
        writeHead: writeNorm,
        voices: this.posReportVoices,
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
export {};
