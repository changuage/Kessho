import type { SliderState } from '../ui/state';

type DelayAFilterType = SliderState['delayAFilterType'];
type DelayBAlgorithm = SliderState['delayBAlgorithm'];
type DelayBPattern = SliderState['delayBPattern'];
type DelayBTapeSpacing = SliderState['delayBTapeSpacing'];
type DelayBWarp = SliderState['delayBWarp'];

export const DELAY_NOTE_DIVISIONS: Record<string, number> = {
  '1/1': 4,
  '1/2': 2,
  '1/2d': 3,
  '1/4': 1,
  '1/4d': 1.5,
  '1/4t': 2 / 3,
  '1/8': 0.5,
  '1/8d': 0.75,
  '1/8t': 1 / 3,
  '1/16': 0.25,
  '1/16d': 0.375,
  '1/16t': 1 / 6,
  '1/32': 0.125,
};

export function delayNoteToSeconds(note: string, bpm: number): number {
  const beats = DELAY_NOTE_DIVISIONS[note] ?? 0.5;
  return (60 / bpm) * beats;
}

interface PatternPreset {
  subdivisions: [number, number, number, number, number, number, number, number];
  gains: [number, number, number, number, number, number, number, number];
  pans: [number, number, number, number, number, number, number, number];
}

const DIFFUSE_TAP_FACTORS = [0.78, 1.07, 1.41, 1.86, 2.34, 2.93, 3.58, 4.26] as const;
const DIFFUSE_TAP_WEIGHTS = [1.0, 0.86, 0.76, 0.64, 0.55, 0.47, 0.39, 0.32] as const;
const TAP_PANS = [-0.7, 0.7, -0.5, 0.5, -0.8, 0.8, -0.3, 0.3] as const;
const TAP_VIBRATO_RATES = [0.7, 1.1, 0.9, 1.3, 0.8, 1.2, 1.0, 0.6] as const;
const MAX_VIBRATO_DEPTH = 0.008;
const WARP_FILTER_FREQS = [200, 380, 720, 1360, 2580, 3800, 4900, 6000] as const;
const WARP_PITCH_TILT_FREQS = [1200, 1500, 1800, 2200, 2800, 3600, 4800, 6400] as const;
const WARP_PITCH_TILT_GAINS = [0, 0, 0, 0, 3.5, 3.5, 8, 8] as const;
const WARP_GRAIN_CENTER_FREQS = [650, 900, 1200, 1600, 2100, 2800, 3600, 4600] as const;
const TAPE_HEAD_DEFAULT_LEVELS = [0.72, 0.8, 0.88, 1] as const;
const TAPE_HEAD_DEFAULT_PANS = [0.28, 0.72, 0.38, 0.62] as const;
export const DELAY_B_TAPE_HEAD_SPACING_RATIOS: Record<DelayBTapeSpacing, [number, number, number, number]> = {
  even: [0.25, 0.5, 0.75, 1],
  triplet: [1 / 6, 1 / 3, 2 / 3, 1],
  golden: [0.2360679, 0.381966, 0.618034, 1],
  silver: [0.3535534, 0.5, 0.7071068, 1],
};

const PATTERN_PRESETS: Record<DelayBPattern, PatternPreset> = {
  cascade: {
    subdivisions: [1.0, 0.5, 0.75, 0.25, 1 / 3, 1 / 6, 0.375, 0.125],
    gains: [1.0, 0.85, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    pans: [-0.7, 0.7, -0.5, 0.5, -0.8, 0.8, -0.3, 0.3],
  },
  golden: {
    subdivisions: [1.0, 0.618, 0.382, 0.236, 0.146, 0.09, 0.056, 0.034],
    gains: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
    pans: [-0.3, 0.5, -0.7, 0.2, -0.5, 0.8, -0.2, 0.6],
  },
  mirror: {
    subdivisions: [0.5, 0.5, 0.75, 0.75, 1.0, 1.0, 0.25, 0.25],
    gains: [1.0, 1.0, 0.8, 0.8, 0.65, 0.65, 0.5, 0.5],
    pans: [-0.8, 0.8, -0.6, 0.6, -0.4, 0.4, -0.9, 0.9],
  },
  dotted: {
    subdivisions: [1.5, 0.75, 0.375, 1.125, 0.5625, 0.28125, 0.1875, 0.09375],
    gains: [1.0, 0.88, 0.76, 0.68, 0.58, 0.48, 0.4, 0.32],
    pans: [-0.6, 0.6, -0.4, 0.4, -0.7, 0.7, -0.5, 0.5],
  },
};

const TAP_ACTIVITY_CONFIG = [
  { rampStart: 0.0, threshold: 0.0, maxGain: 1.0 },
  { rampStart: 0.1, threshold: 0.15, maxGain: 0.85 },
  { rampStart: 0.2, threshold: 0.3, maxGain: 0.75 },
  { rampStart: 0.3, threshold: 0.4, maxGain: 0.7 },
  { rampStart: 0.45, threshold: 0.55, maxGain: 0.65 },
  { rampStart: 0.55, threshold: 0.65, maxGain: 0.6 },
  { rampStart: 0.7, threshold: 0.8, maxGain: 0.55 },
  { rampStart: 0.85, threshold: 0.9, maxGain: 0.5 },
] as const;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function computeTapGain(tapIndex: number, activity: number): number {
  const cfg = TAP_ACTIVITY_CONFIG[tapIndex]!;
  if (activity < cfg.rampStart) return 0;
  if (activity >= cfg.threshold) {
    const intensity = Math.min(1, (activity - cfg.threshold) / Math.max(0.01, 1 - cfg.threshold));
    return cfg.maxGain * (0.4 + 0.6 * intensity);
  }
  const fade = (activity - cfg.rampStart) / Math.max(0.01, cfg.threshold - cfg.rampStart);
  return cfg.maxGain * fade * 0.4;
}

function computeDiffuseTapGain(tapIndex: number, activity: number): number {
  const onset = tapIndex * 0.08;
  const fill = Math.min(1, Math.max(0, (activity - onset) / 0.55));
  if (fill <= 0) return 0;
  const curve = Math.pow(fill, 0.85);
  return DIFFUSE_TAP_WEIGHTS[tapIndex]! * curve * (0.15 + 0.85 * fill);
}

function createLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  return limiter;
}

function filterQForType(type: DelayAFilterType): number {
  return type === 'bandpass' ? 2.0 : 0.7;
}

export interface DelayBusAParams {
  enabled: boolean;
  timeLeftMs: number;
  timeRightMs: number;
  feedback: number;
  mix: number;
  filterHz: number;
  filterType: DelayAFilterType;
  reverbSend: number;
  modRateHz: number;
  modDepthMs: number;
  pingPong: boolean;
  duck: number;
  width: number;
  toDelayB: number;
  crossFeedFilterHz: number;
  granularSend: number;
}

export interface DelayBusBParams {
  enabled: boolean;
  algorithm: DelayBAlgorithm;
  activity: number;
  repeats: number;
  noteDiv: string;
  tone: number;
  vibrato: number;
  mix: number;
  reverbSend: number;
  granularSend: number;
  toDelayA: number;
  bpm: number;
  spaceMode: SliderState['granularSpaceMode'];
  pattern: DelayBPattern;
  warp: DelayBWarp;
  warpIntensity: number;
  spread: number;
  tapeSpacing: DelayBTapeSpacing;
  tapeHeadEnabled: readonly boolean[];
  tapeHeadLevels: readonly number[];
  tapeHeadPans: readonly number[];
}

export class SharedDelayBusA {
  readonly input: GainNode;

  private readonly delayL: DelayNode;
  private readonly delayR: DelayNode;
  private readonly feedbackL: GainNode;
  private readonly feedbackR: GainNode;
  private readonly crossFeedbackLToR: GainNode;
  private readonly crossFeedbackRToL: GainNode;
  private readonly filterL: BiquadFilterNode;
  private readonly filterR: BiquadFilterNode;
  private readonly merger: ChannelMergerNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly duckGain: GainNode;
  private readonly directGain: GainNode;
  private readonly reverbSendGain: GainNode;
  private readonly delayBSendGain: GainNode;
  private readonly crossFeedFilter: BiquadFilterNode;
  private readonly granularSendGain: GainNode;
  private readonly modOsc: OscillatorNode;
  private readonly modDepthL: GainNode;
  private readonly modDepthR: GainNode;
  private readonly inputAnalyser: AnalyserNode;
  private readonly analyserBuffer: Float32Array<ArrayBuffer>;
  private duckEnvelope = 0;

  constructor(ctx: AudioContext, masterOutput: AudioNode, reverbInput: AudioNode) {
    this.input = ctx.createGain();
    this.input.gain.value = 1;

    this.delayL = ctx.createDelay(5);
    this.delayR = ctx.createDelay(5);
    this.feedbackL = ctx.createGain();
    this.feedbackR = ctx.createGain();
    this.crossFeedbackLToR = ctx.createGain();
    this.crossFeedbackRToL = ctx.createGain();
    this.filterL = ctx.createBiquadFilter();
    this.filterR = ctx.createBiquadFilter();
    this.filterL.type = 'lowpass';
    this.filterR.type = 'lowpass';
    this.filterL.Q.value = 0.7;
    this.filterR.Q.value = 0.7;

    this.merger = ctx.createChannelMerger(2);
    this.limiter = createLimiter(ctx);
    this.duckGain = ctx.createGain();
    this.directGain = ctx.createGain();
    this.reverbSendGain = ctx.createGain();
    this.delayBSendGain = ctx.createGain();
    this.crossFeedFilter = ctx.createBiquadFilter();
    this.granularSendGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.directGain.gain.value = 0;
    this.reverbSendGain.gain.value = 0;
    this.delayBSendGain.gain.value = 0;
    this.granularSendGain.gain.value = 0;
    this.crossFeedFilter.type = 'lowpass';
    this.crossFeedFilter.Q.value = 0.7;
    this.crossFeedFilter.frequency.value = 8000;

    this.modOsc = ctx.createOscillator();
    this.modOsc.type = 'sine';
    this.modOsc.frequency.value = 0.01;
    this.modDepthL = ctx.createGain();
    this.modDepthR = ctx.createGain();
    this.modDepthL.gain.value = 0;
    this.modDepthR.gain.value = 0;
    this.modOsc.connect(this.modDepthL);
    this.modOsc.connect(this.modDepthR);
    this.modDepthL.connect(this.delayL.delayTime);
    this.modDepthR.connect(this.delayR.delayTime);
    this.modOsc.start();

    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.15;
    this.analyserBuffer = new Float32Array(
      new ArrayBuffer(this.inputAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );

    this.input.connect(this.inputAnalyser);
    this.input.connect(this.delayL);
    this.input.connect(this.delayR);

    this.delayL.connect(this.filterL);
    this.filterL.connect(this.feedbackL);
    this.feedbackL.connect(this.delayL);
    this.filterL.connect(this.crossFeedbackLToR);
    this.crossFeedbackLToR.connect(this.delayR);

    this.delayR.connect(this.filterR);
    this.filterR.connect(this.feedbackR);
    this.feedbackR.connect(this.delayR);
    this.filterR.connect(this.crossFeedbackRToL);
    this.crossFeedbackRToL.connect(this.delayL);

    this.filterL.connect(this.merger, 0, 0);
    this.filterR.connect(this.merger, 0, 1);
    this.merger.connect(this.limiter);

    this.limiter.connect(this.duckGain);
    this.duckGain.connect(this.directGain);
    this.directGain.connect(masterOutput);

    this.limiter.connect(this.reverbSendGain);
    this.reverbSendGain.connect(reverbInput);

    this.limiter.connect(this.delayBSendGain);
    this.delayBSendGain.connect(this.crossFeedFilter);

    this.limiter.connect(this.granularSendGain);
  }

  connectDelayBInput(target: AudioNode): void {
    this.crossFeedFilter.connect(target);
  }

  connectGranularInput(target: AudioNode): void {
    this.granularSendGain.connect(target);
  }

  getDirectOutputNode(): GainNode {
    return this.directGain;
  }

  getReverbSendNode(): GainNode {
    return this.reverbSendGain;
  }

  getDelayBSendNode(): BiquadFilterNode {
    return this.crossFeedFilter;
  }

  getGranularSendNode(): GainNode {
    return this.granularSendGain;
  }

  private sampleInputEnvelope(): number {
    this.inputAnalyser.getFloatTimeDomainData(this.analyserBuffer);
    let peak = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const magnitude = Math.abs(this.analyserBuffer[i] ?? 0);
      if (magnitude > peak) peak = magnitude;
    }
    const normalized = clamp((peak - 0.01) * 4.5, 0, 1);
    if (normalized > this.duckEnvelope) {
      this.duckEnvelope += (normalized - this.duckEnvelope) * 0.4;
    } else {
      this.duckEnvelope = this.duckEnvelope * 0.9 + normalized * 0.1;
    }
    return this.duckEnvelope;
  }

  update(params: DelayBusAParams, now: number, smoothTime: number): void {
    const enabled = params.enabled;
    const baseTimeL = clamp(params.timeLeftMs / 1000, 0.01, 5);
    const baseTimeR = clamp(params.timeRightMs / 1000, 0.01, 5);
    const width = clamp(params.width, 0, 1);
    const monoBlend = Math.max(0, 1 - width * 2);
    const avgTime = (baseTimeL + baseTimeR) * 0.5;
    let finalTimeL = baseTimeL * (1 - monoBlend) + avgTime * monoBlend;
    let finalTimeR = baseTimeR * (1 - monoBlend) + avgTime * monoBlend;
    if (width > 0.5) {
      const haasOffset = (width - 0.5) * 2 * 0.015;
      finalTimeR = clamp(finalTimeR + haasOffset, 0.01, 5);
    }

    const modRate = Math.max(0.01, clamp(params.modRateHz, 0, 5));
    const modDepthL = enabled ? Math.min(finalTimeL * 0.8, clamp(params.modDepthMs, 0, 50) / 1000) : 0;
    const modDepthR = enabled ? Math.min(finalTimeR * 0.8, clamp(params.modDepthMs, 0, 50) / 1000) : 0;
    const feedback = enabled ? clamp(params.feedback, 0, 0.95) : 0;
    const wetMix = enabled ? clamp(params.mix, 0, 1) : 0;
    const reverbSend = enabled ? clamp(params.reverbSend, 0, 1) : 0;
    const delayBSend = enabled ? clamp(params.toDelayB, 0, 1) : 0;
    const granularSend = enabled ? clamp(params.granularSend, 0, 1) : 0;
    const filterHz = clamp(params.filterHz, 200, 12000);
    const filterType = params.filterType;
    const selfFeedback = params.pingPong ? 0 : feedback;
    const crossFeedback = params.pingPong ? feedback : 0;
    const duckAmount = enabled ? clamp(params.duck, 0, 1) : 0;
    const duckEnv = duckAmount > 0.0001 ? this.sampleInputEnvelope() : 0;
    const duckGain = 1 - clamp(duckEnv * duckAmount, 0, 0.92);

    if (this.filterL.type !== filterType) this.filterL.type = filterType;
    if (this.filterR.type !== filterType) this.filterR.type = filterType;
    const filterQ = filterQForType(filterType);

    this.delayL.delayTime.setTargetAtTime(finalTimeL, now, 0.05);
    this.delayR.delayTime.setTargetAtTime(finalTimeR, now, 0.05);
    this.feedbackL.gain.setTargetAtTime(selfFeedback, now, smoothTime);
    this.feedbackR.gain.setTargetAtTime(selfFeedback, now, smoothTime);
    this.crossFeedbackLToR.gain.setTargetAtTime(crossFeedback, now, smoothTime);
    this.crossFeedbackRToL.gain.setTargetAtTime(crossFeedback, now, smoothTime);
    this.filterL.frequency.setTargetAtTime(filterHz, now, 0.05);
    this.filterR.frequency.setTargetAtTime(filterHz, now, 0.05);
    this.filterL.Q.setTargetAtTime(filterQ, now, 0.05);
    this.filterR.Q.setTargetAtTime(filterQ, now, 0.05);
    this.duckGain.gain.setTargetAtTime(enabled ? duckGain : 1, now, 0.05);
    this.directGain.gain.setTargetAtTime(wetMix, now, smoothTime);
    this.reverbSendGain.gain.setTargetAtTime(reverbSend, now, smoothTime);
    this.delayBSendGain.gain.setTargetAtTime(delayBSend, now, smoothTime);
    this.crossFeedFilter.frequency.setTargetAtTime(clamp(params.crossFeedFilterHz, 200, 12000), now, 0.05);
    this.granularSendGain.gain.setTargetAtTime(granularSend, now, smoothTime);
    this.modOsc.frequency.setTargetAtTime(modRate, now, 0.05);
    this.modDepthL.gain.setTargetAtTime(modDepthL, now, 0.05);
    this.modDepthR.gain.setTargetAtTime(modDepthR, now, 0.05);
  }

  dispose(): void {
    try { this.modOsc.stop(); } catch {}
    try { this.modOsc.disconnect(); } catch {}
    try { this.modDepthL.disconnect(); } catch {}
    try { this.modDepthR.disconnect(); } catch {}
    try { this.input.disconnect(); } catch {}
    try { this.inputAnalyser.disconnect(); } catch {}
    try { this.delayL.disconnect(); } catch {}
    try { this.delayR.disconnect(); } catch {}
    try { this.feedbackL.disconnect(); } catch {}
    try { this.feedbackR.disconnect(); } catch {}
    try { this.crossFeedbackLToR.disconnect(); } catch {}
    try { this.crossFeedbackRToL.disconnect(); } catch {}
    try { this.filterL.disconnect(); } catch {}
    try { this.filterR.disconnect(); } catch {}
    try { this.merger.disconnect(); } catch {}
    try { this.limiter.disconnect(); } catch {}
    try { this.duckGain.disconnect(); } catch {}
    try { this.directGain.disconnect(); } catch {}
    try { this.reverbSendGain.disconnect(); } catch {}
    try { this.delayBSendGain.disconnect(); } catch {}
    try { this.crossFeedFilter.disconnect(); } catch {}
    try { this.granularSendGain.disconnect(); } catch {}
  }
}

export class SharedDelayBusB {
  readonly input: GainNode;

  private readonly outputGain: GainNode;
  private readonly feedbackGain: GainNode;
  private readonly highCutFilter: BiquadFilterNode;
  private readonly lowCutFilter: BiquadFilterNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly directGain: GainNode;
  private readonly reverbSendGain: GainNode;
  private readonly granularSendGain: GainNode;
  private readonly delayASendGain: GainNode;
  private readonly tapNodes: DelayNode[] = [];
  private readonly tapGains: GainNode[] = [];
  private readonly tapPanners: StereoPannerNode[] = [];
  private readonly vibratoOscs: OscillatorNode[] = [];
  private readonly vibratoDepths: GainNode[] = [];
  private readonly warpFilters: BiquadFilterNode[] = [];
  private readonly warpOffsetDelays: DelayNode[] = [];
  private readonly warpDryGains: GainNode[] = [];
  private readonly warpWetGains: GainNode[] = [];

  constructor(ctx: AudioContext, masterOutput: AudioNode, reverbInput: AudioNode) {
    this.input = ctx.createGain();
    this.input.gain.value = 1;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0;
    this.highCutFilter = ctx.createBiquadFilter();
    this.highCutFilter.type = 'lowpass';
    this.highCutFilter.Q.value = 0.7;
    this.lowCutFilter = ctx.createBiquadFilter();
    this.lowCutFilter.type = 'highpass';
    this.lowCutFilter.Q.value = 0.7;
    this.limiter = createLimiter(ctx);
    this.directGain = ctx.createGain();
    this.reverbSendGain = ctx.createGain();
    this.granularSendGain = ctx.createGain();
    this.delayASendGain = ctx.createGain();
    this.directGain.gain.value = 0;
    this.reverbSendGain.gain.value = 0;
    this.granularSendGain.gain.value = 0;
    this.delayASendGain.gain.value = 0;

    for (let i = 0; i < 8; i++) {
      const tapDelay = ctx.createDelay(5);
      const tapGain = ctx.createGain();
      const tapPanner = ctx.createStereoPanner();
      const vibratoOsc = ctx.createOscillator();
      const vibratoDepth = ctx.createGain();
      const warpFilter = ctx.createBiquadFilter();
      const warpOffsetDelay = ctx.createDelay(0.25);
      const warpDryGain = ctx.createGain();
      const warpWetGain = ctx.createGain();

      tapGain.gain.value = 0;
      tapPanner.pan.value = TAP_PANS[i]!;
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.value = TAP_VIBRATO_RATES[i]!;
      vibratoDepth.gain.value = 0;
      warpOffsetDelay.delayTime.value = 0;
      warpDryGain.gain.value = 1;
      warpWetGain.gain.value = 0;
      warpFilter.type = 'bandpass';
      warpFilter.frequency.value = WARP_FILTER_FREQS[i]!;
      warpFilter.Q.value = 3;
      warpFilter.gain.value = 0;

      this.input.connect(tapDelay);
      tapDelay.connect(tapGain);
      tapGain.connect(warpDryGain);
      warpDryGain.connect(tapPanner);
      tapGain.connect(warpFilter);
      warpFilter.connect(warpOffsetDelay);
      warpOffsetDelay.connect(warpWetGain);
      warpWetGain.connect(tapPanner);
      tapPanner.connect(this.outputGain);

      vibratoOsc.connect(vibratoDepth);
      vibratoDepth.connect(tapDelay.delayTime);
      vibratoOsc.start();

      this.tapNodes.push(tapDelay);
      this.tapGains.push(tapGain);
      this.tapPanners.push(tapPanner);
      this.vibratoOscs.push(vibratoOsc);
      this.vibratoDepths.push(vibratoDepth);
      this.warpFilters.push(warpFilter);
      this.warpOffsetDelays.push(warpOffsetDelay);
      this.warpDryGains.push(warpDryGain);
      this.warpWetGains.push(warpWetGain);
    }

    this.outputGain.connect(this.feedbackGain);
    this.feedbackGain.connect(this.highCutFilter);
    this.highCutFilter.connect(this.lowCutFilter);
    this.lowCutFilter.connect(this.input);

    this.outputGain.connect(this.limiter);
    this.limiter.connect(this.directGain);
    this.limiter.connect(this.reverbSendGain);
    this.limiter.connect(this.granularSendGain);
    this.limiter.connect(this.delayASendGain);
    this.directGain.connect(masterOutput);
    this.reverbSendGain.connect(reverbInput);
  }

  connectGranularInput(target: AudioNode): void {
    this.granularSendGain.connect(target);
  }

  connectDelayAInput(target: AudioNode): void {
    this.delayASendGain.connect(target);
  }

  getDirectOutputNode(): GainNode {
    return this.directGain;
  }

  getReverbSendNode(): GainNode {
    return this.reverbSendGain;
  }

  getDelayASendNode(): GainNode {
    return this.delayASendGain;
  }

  getGranularSendNode(): GainNode {
    return this.granularSendGain;
  }

  update(params: DelayBusBParams, now: number, smoothTime: number): void {
    const enabled = params.enabled;
    const activity = clamp(params.activity, 0, 1);
    const tapeMode = params.algorithm === 'tapeHeads';
    const baseTimeSec = delayNoteToSeconds(params.noteDiv, clamp(params.bpm, 20, 400));
    const diffuseBaseTimeSec = Math.max(0.08, baseTimeSec * 0.85);
    const spread = clamp(params.spread, 0, 1);
    const warpIntensity = clamp(params.warpIntensity, 0, 1);
    const pattern = PATTERN_PRESETS[params.pattern] ?? PATTERN_PRESETS.cascade;
    const tapeRatios = DELAY_B_TAPE_HEAD_SPACING_RATIOS[params.tapeSpacing] ?? DELAY_B_TAPE_HEAD_SPACING_RATIOS.even;

    let sumTapGains = 0;
    for (let i = 0; i < 8; i++) {
      const tapeHeadIndex = i as 0 | 1 | 2 | 3;
      const tapeHeadActive = tapeMode && i < 4 && (params.tapeHeadEnabled[tapeHeadIndex] ?? true);
      const patternGain = params.spaceMode === 'diffuse' ? 1 : pattern.gains[i]!;
      const gain = enabled
        ? (tapeMode
            ? (tapeHeadActive
                ? clamp(params.tapeHeadLevels[tapeHeadIndex] ?? TAPE_HEAD_DEFAULT_LEVELS[tapeHeadIndex]!, 0, 1) * (0.75 + activity * 0.25)
                : 0)
            : params.spaceMode === 'diffuse'
            ? computeDiffuseTapGain(i, activity)
            : computeTapGain(i, activity) * patternGain)
        : 0;
      sumTapGains += gain;

      const timeFactor = tapeMode && i < 4
        ? tapeRatios[tapeHeadIndex]
        : params.spaceMode === 'diffuse'
        ? DIFFUSE_TAP_FACTORS[i]!
        : pattern.subdivisions[i]!;
      const baseTime = tapeMode ? baseTimeSec : params.spaceMode === 'diffuse' ? diffuseBaseTimeSec : baseTimeSec;

      let warpOffset = 0;
      if (tapeMode && i < 4) {
        warpOffset = (0.0015 + i * 0.0012) * warpIntensity;
      } else if (params.warp === 'grainCrossfade' && i >= 4) {
        const normalizedIndex = (i - 3) / 4;
        warpOffset = (0.006 + normalizedIndex * 0.042) * warpIntensity;
      }

      const delayTime = clamp(baseTime * timeFactor, 0.001, 5);
      const vibratoMultiplier =
        tapeMode
          ? 0.45 + i * 0.12
          : params.warp === 'pitchDrift' && i >= 4
          ? 1 + warpIntensity * (i >= 6 ? 3 : 1.7)
          : params.warp === 'grainCrossfade' && i >= 4
            ? 1 + warpIntensity * 1.4
            : 1;
      const vibratoDepth = enabled
        ? tapeMode
          ? (clamp(params.vibrato, 0, 1) * 0.004 + warpIntensity * 0.0018) * vibratoMultiplier
          : clamp(params.vibrato, 0, 1) * MAX_VIBRATO_DEPTH * (params.spaceMode === 'diffuse' ? 0.55 : 1) * vibratoMultiplier
        : 0;

      const basePan = tapeMode && i < 4
        ? (clamp(params.tapeHeadPans[tapeHeadIndex] ?? TAPE_HEAD_DEFAULT_PANS[tapeHeadIndex]!, 0, 1) - 0.5) * 2
        : params.spaceMode === 'diffuse' ? TAP_PANS[i]! : pattern.pans[i]!;
      const spreadPan = clamp(basePan * spread * 2, -1, 1);

      let warpDry = 1;
      let warpWet = 0;
      const warpFilter = this.warpFilters[i]!;
      const warpOffsetDelay = this.warpOffsetDelays[i]!;

      if (enabled) {
        if (tapeMode) {
          warpFilter.type = 'allpass';
          warpFilter.frequency.setTargetAtTime(520 + i * 230 + warpIntensity * 520, now, 0.05);
          warpFilter.Q.setTargetAtTime(0.55 + warpIntensity * 1.6, now, 0.05);
          warpFilter.gain.setTargetAtTime(0, now, 0.05);
          warpDry = 1 - (i < 4 ? warpIntensity * 0.28 : 0);
          warpWet = i < 4 ? warpIntensity * 0.28 : 0;
        } else {
        switch (params.warp) {
          case 'filterSweep':
            warpFilter.type = 'bandpass';
            warpFilter.frequency.setTargetAtTime(WARP_FILTER_FREQS[i]!, now, 0.05);
            warpFilter.Q.setTargetAtTime(3, now, 0.05);
            warpFilter.gain.setTargetAtTime(0, now, 0.05);
            warpDry = 1 - warpIntensity;
            warpWet = warpIntensity;
            warpOffset = 0;
            break;
          case 'pitchDrift':
            if (i >= 4) {
              warpFilter.type = 'highshelf';
              warpFilter.frequency.setTargetAtTime(WARP_PITCH_TILT_FREQS[i]!, now, 0.05);
              warpFilter.gain.setTargetAtTime(WARP_PITCH_TILT_GAINS[i]! * warpIntensity, now, 0.05);
              warpDry = 1 - warpIntensity;
              warpWet = warpIntensity;
            }
            warpOffset = 0;
            break;
          case 'grainCrossfade':
            if (i >= 4) {
              warpFilter.type = 'allpass';
              warpFilter.frequency.setTargetAtTime(WARP_GRAIN_CENTER_FREQS[i]!, now, 0.05);
              warpFilter.Q.setTargetAtTime(0.65 + warpIntensity * 2.2, now, 0.05);
              warpFilter.gain.setTargetAtTime(0, now, 0.05);
              warpDry = 1 - warpIntensity;
              warpWet = warpIntensity;
            }
            break;
          case 'clean':
          default:
            warpFilter.type = 'bandpass';
            warpFilter.frequency.setTargetAtTime(WARP_FILTER_FREQS[i]!, now, 0.05);
            warpFilter.Q.setTargetAtTime(3, now, 0.05);
            warpFilter.gain.setTargetAtTime(0, now, 0.05);
            warpOffset = 0;
            break;
        }
        }
      } else {
        warpOffset = 0;
        warpDry = 1;
        warpWet = 0;
      }

      this.tapGains[i]?.gain.setTargetAtTime(gain, now, smoothTime);
      this.tapNodes[i]?.delayTime.setTargetAtTime(delayTime, now, 0.05);
      this.vibratoDepths[i]?.gain.setTargetAtTime(vibratoDepth, now, 0.05);
      this.tapPanners[i]?.pan.setTargetAtTime(spreadPan, now, smoothTime);
      warpOffsetDelay.delayTime.setTargetAtTime(enabled ? warpOffset : 0, now, 0.05);
      this.warpDryGains[i]?.gain.setTargetAtTime(warpDry, now, smoothTime);
      this.warpWetGains[i]?.gain.setTargetAtTime(warpWet, now, smoothTime);
    }

    const rawRepeats = enabled ? clamp(params.repeats, 0, 0.85) : 0;
    const feedbackTarget = tapeMode ? rawRepeats * 0.84 : params.spaceMode === 'diffuse' ? rawRepeats * 0.9 : rawRepeats;
    const normalizedFeedback = sumTapGains > 1 ? feedbackTarget / sumTapGains : feedbackTarget;
    const tone = clamp(params.tone, 0, 1);
    const highCutHz = tapeMode
      ? clamp(11000 - tone * 7600 - warpIntensity * 1400, 1200, 12000)
      : 600 + tone * 11400;
    const lowCutHz = tapeMode
      ? 45 + tone * 260
      : 60 + Math.max(0, tone - 0.5) * 680;

    this.feedbackGain.gain.setTargetAtTime(normalizedFeedback, now, smoothTime);
    this.highCutFilter.frequency.setTargetAtTime(highCutHz, now, 0.05);
    this.lowCutFilter.frequency.setTargetAtTime(lowCutHz, now, 0.05);
    this.directGain.gain.setTargetAtTime(enabled ? clamp(params.mix, 0, 1) : 0, now, smoothTime);
    this.reverbSendGain.gain.setTargetAtTime(enabled ? clamp(params.reverbSend, 0, 1) : 0, now, smoothTime);
    this.granularSendGain.gain.setTargetAtTime(enabled ? clamp(params.granularSend, 0, 1) : 0, now, smoothTime);
    this.delayASendGain.gain.setTargetAtTime(enabled ? clamp(params.toDelayA, 0, 1) : 0, now, smoothTime);
  }

  dispose(): void {
    for (const osc of this.vibratoOscs) {
      try { osc.stop(); } catch {}
      try { osc.disconnect(); } catch {}
    }
    for (const depth of this.vibratoDepths) {
      try { depth.disconnect(); } catch {}
    }
    for (const tap of this.tapNodes) {
      try { tap.disconnect(); } catch {}
    }
    for (const gain of this.tapGains) {
      try { gain.disconnect(); } catch {}
    }
    for (const panner of this.tapPanners) {
      try { panner.disconnect(); } catch {}
    }
    for (const filter of this.warpFilters) {
      try { filter.disconnect(); } catch {}
    }
    for (const delay of this.warpOffsetDelays) {
      try { delay.disconnect(); } catch {}
    }
    for (const gain of this.warpDryGains) {
      try { gain.disconnect(); } catch {}
    }
    for (const gain of this.warpWetGains) {
      try { gain.disconnect(); } catch {}
    }
    try { this.input.disconnect(); } catch {}
    try { this.outputGain.disconnect(); } catch {}
    try { this.feedbackGain.disconnect(); } catch {}
    try { this.highCutFilter.disconnect(); } catch {}
    try { this.lowCutFilter.disconnect(); } catch {}
    try { this.limiter.disconnect(); } catch {}
    try { this.directGain.disconnect(); } catch {}
    try { this.reverbSendGain.disconnect(); } catch {}
    try { this.granularSendGain.disconnect(); } catch {}
    try { this.delayASendGain.disconnect(); } catch {}
  }
}
