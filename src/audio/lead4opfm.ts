/**
 * Lead4opFM — 4-operator FM synthesis engine with preset morphing
 * 
 * Replaces the old timbre-interpolated Rhodes/Gamelan lead synth with a
 * full 4-op FM engine driven by loadable JSON presets.
 * 
 * Key design:
 * - Lead 1 morphs between Preset A ↔ B
 * - Lead 2 morphs between Preset C ↔ D
 * - ADSR, mod params, XY routing, filter, transient, gain all come from presets
 * - Vibrato, glide, delay are SEPARATE (not in presets)
 * - Algorithm is discrete: either snap at 50% morph or always use first preset's
 */

// ─── Active note tracking for CPU overlay ───
let activeLeadNoteCount = 0;

/** Get the number of currently-sounding lead notes (for CPU monitoring). */
export function getActiveLeadNoteCount(): number {
  return activeLeadNoteCount;
}

// ─── Preset Data Types ───

export interface Lead4opFMPresetXY {
  xLevel: number;
  xPan: number;
  yLevel: number;
  yPan: number;
}

export interface Lead4opFMModulator {
  ratio: number;
  index: number;
  decay: number;
  sustain?: number; // only mod1 has sustain in some presets
  level?: number;   // per-operator output level 0..1 (default 1)
  feedback?: number; // per-operator self-feedback 0..1 (default 0)
  detune?: number;  // per-operator detune in cents -50..+50 (default 0)
  envRate?: number;  // envelope rate multiplier 0.1..8 (default 1) — scales global ADSR per operator
  modAttack?: number;  // operator mod envelope attack in seconds (default 0 = instant)
  modDelay?: number;   // operator mod envelope delay in seconds (default 0 = no delay)
}

export interface Lead4opFMEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Lead4opFMFilter {
  freq: number;
  q: number;
  type?: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking'; // default 'lowpass'
  envAttack?: number;   // filter envelope attack in seconds (default 0)
  envDecay?: number;    // filter envelope decay in seconds (default 0)
  envSustain?: number;  // filter envelope sustain 0..1 (default 1 = no sweep)
  envRelease?: number;  // filter envelope release in seconds (default 0)
  envDepth?: number;    // filter envelope depth in Hz (-8000..+8000, default 0)
}

export interface Lead4opFMTransient {
  click: number;
  noise: number;
  duration: number;
  decay: number;
  filter: number;
  type: 'white' | 'pink' | 'brown' | 'filtered';
}

export interface Lead4opFMLFO {
  rate?: number;    // LFO rate in Hz (0.05..20, default 0)
  depth?: number;   // LFO depth 0..1 — modulates FM index (default 0)
  target?: 'all' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'filter' | 'pitch' | 'detune' | 'none'; // modulation destination
}

export interface Lead4opFMParams {
  beatDetune: number;
  carrier2Mix: number;
  mod1: Lead4opFMModulator;
  mod2: Lead4opFMModulator;
  mod3: Lead4opFMModulator;
  mod4: Lead4opFMModulator;
  envelope: Lead4opFMEnvelope;
  filter: Lead4opFMFilter;
  transient: Lead4opFMTransient;
  gain: number;
  lfo?: Lead4opFMLFO;
  unisonVoices?: number;   // 1..4 unison voice count (default 1)
  unisonDetune?: number;   // unison spread in cents 0..50 (default 0)
  drive?: number;           // drive/saturation amount 0..1 (default 0, no drive)
}

export interface Lead4opFMPreset {
  id: string;
  name: string;
  engine: string;
  method?: string;
  operators?: number;
  algorithm: 'parallel' | 'stack' | 'split' | 'cross' | 'dx17';
  source?: string;
  xy: Lead4opFMPresetXY;
  params: Lead4opFMParams;
}

export type Lead4opFMAlgorithm = 'parallel' | 'stack' | 'split' | 'cross' | 'dx17';

// ─── Manifest Type ───

export interface Lead4opFMManifestEntry {
  id: string;
  name: string;
  file: string;
  algorithm: string;
}

export interface Lead4opFMManifest {
  engine: string;
  version: number;
  presets: Lead4opFMManifestEntry[];
}

// ─── Morphed Params (fully interpolated, ready for synthesis) ───

export interface Lead4opFMMorphedParams {
  algorithm: Lead4opFMAlgorithm;
  beatDetune: number;
  carrier2Mix: number;
  mod1Ratio: number;
  mod1Index: number;
  mod1Decay: number;
  mod1Sustain: number;
  mod1Level: number;
  mod1Feedback: number;
  mod1Detune: number;
  mod1EnvRate: number;
  mod1ModAttack: number;
  mod1ModDelay: number;
  mod2Ratio: number;
  mod2Index: number;
  mod2Decay: number;
  mod2Sustain: number;
  mod2Level: number;
  mod2Feedback: number;
  mod2Detune: number;
  mod2EnvRate: number;
  mod2ModAttack: number;
  mod2ModDelay: number;
  mod3Ratio: number;
  mod3Index: number;
  mod3Decay: number;
  mod3Sustain: number;
  mod3Level: number;
  mod3Feedback: number;
  mod3Detune: number;
  mod3EnvRate: number;
  mod3ModAttack: number;
  mod3ModDelay: number;
  mod4Ratio: number;
  mod4Index: number;
  mod4Decay: number;
  mod4Sustain: number;
  mod4Level: number;
  mod4Feedback: number;
  mod4Detune: number;
  mod4EnvRate: number;
  mod4ModAttack: number;
  mod4ModDelay: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterFreq: number;
  filterQ: number;
  filterType: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';
  filterEnvAttack: number;
  filterEnvDecay: number;
  filterEnvSustain: number;
  filterEnvRelease: number;
  filterEnvDepth: number;
  drive: number;
  transientClick: number;
  transientNoise: number;
  transientDuration: number;
  transientDecay: number;
  transientFilter: number;
  transientType: 'white' | 'pink' | 'brown' | 'filtered';
  gain: number;
  xLevel: number;
  xPan: number;
  yLevel: number;
  yPan: number;
  lfoRate: number;
  lfoDepth: number;
  lfoTarget: 'all' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'filter' | 'pitch' | 'detune' | 'none';
  unisonVoices: number;
  unisonDetune: number;
}

// ─── Interpolation ───

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two Lead4opFM presets at morph position t (0..1).
 * Algorithm is handled discretely based on algorithmMode.
 */
export function morphPresets(
  presetA: Lead4opFMPreset,
  presetB: Lead4opFMPreset,
  t: number,
  algorithmMode: 'snap' | 'presetA' = 'snap'
): Lead4opFMMorphedParams {
  const a = presetA.params;
  const b = presetB.params;
  const aXY = presetA.xy;
  const bXY = presetB.xy;

  // Algorithm: snap at 50% or always use preset A's
  let algorithm: Lead4opFMAlgorithm;
  if (algorithmMode === 'presetA') {
    algorithm = presetA.algorithm;
  } else {
    algorithm = t < 0.5 ? presetA.algorithm : presetB.algorithm;
  }

  // Transient type: snap at 50% (discrete, can't interpolate)
  const transientType = t < 0.5
    ? (a.transient?.type ?? 'white')
    : (b.transient?.type ?? 'white');

  // LFO target: snap at 50% (discrete)
  const lfoTargetA = a.lfo?.target ?? 'all';
  const lfoTargetB = b.lfo?.target ?? 'all';
  const lfoTarget = t < 0.5 ? lfoTargetA : lfoTargetB;

  return {
    algorithm,
    beatDetune: lerp(a.beatDetune, b.beatDetune, t),
    carrier2Mix: lerp(a.carrier2Mix, b.carrier2Mix, t),

    mod1Ratio: lerp(a.mod1.ratio, b.mod1.ratio, t),
    mod1Index: lerp(a.mod1.index, b.mod1.index, t),
    mod1Decay: lerp(a.mod1.decay, b.mod1.decay, t),
    mod1Sustain: lerp(a.mod1.sustain ?? 0.1, b.mod1.sustain ?? 0.1, t),
    mod1Level: lerp(a.mod1.level ?? 1, b.mod1.level ?? 1, t),
    mod1Feedback: lerp(a.mod1.feedback ?? 0, b.mod1.feedback ?? 0, t),
    mod1Detune: lerp(a.mod1.detune ?? 0, b.mod1.detune ?? 0, t),
    mod1EnvRate: lerp(a.mod1.envRate ?? 1, b.mod1.envRate ?? 1, t),
    mod1ModAttack: lerp(a.mod1.modAttack ?? 0, b.mod1.modAttack ?? 0, t),
    mod1ModDelay: lerp(a.mod1.modDelay ?? 0, b.mod1.modDelay ?? 0, t),

    mod2Ratio: lerp(a.mod2.ratio, b.mod2.ratio, t),
    mod2Index: lerp(a.mod2.index, b.mod2.index, t),
    mod2Decay: lerp(a.mod2.decay, b.mod2.decay, t),
    mod2Sustain: lerp(a.mod2.sustain ?? 0.05, b.mod2.sustain ?? 0.05, t),
    mod2Level: lerp(a.mod2.level ?? 1, b.mod2.level ?? 1, t),
    mod2Feedback: lerp(a.mod2.feedback ?? 0, b.mod2.feedback ?? 0, t),
    mod2Detune: lerp(a.mod2.detune ?? 0, b.mod2.detune ?? 0, t),
    mod2EnvRate: lerp(a.mod2.envRate ?? 1, b.mod2.envRate ?? 1, t),
    mod2ModAttack: lerp(a.mod2.modAttack ?? 0, b.mod2.modAttack ?? 0, t),
    mod2ModDelay: lerp(a.mod2.modDelay ?? 0, b.mod2.modDelay ?? 0, t),

    mod3Ratio: lerp(a.mod3.ratio, b.mod3.ratio, t),
    mod3Index: lerp(a.mod3.index, b.mod3.index, t),
    mod3Decay: lerp(a.mod3.decay, b.mod3.decay, t),
    mod3Sustain: lerp(a.mod3.sustain ?? 0.02, b.mod3.sustain ?? 0.02, t),
    mod3Level: lerp(a.mod3.level ?? 1, b.mod3.level ?? 1, t),
    mod3Feedback: lerp(a.mod3.feedback ?? 0, b.mod3.feedback ?? 0, t),
    mod3Detune: lerp(a.mod3.detune ?? 0, b.mod3.detune ?? 0, t),
    mod3EnvRate: lerp(a.mod3.envRate ?? 1, b.mod3.envRate ?? 1, t),
    mod3ModAttack: lerp(a.mod3.modAttack ?? 0, b.mod3.modAttack ?? 0, t),
    mod3ModDelay: lerp(a.mod3.modDelay ?? 0, b.mod3.modDelay ?? 0, t),

    mod4Ratio: lerp(a.mod4.ratio, b.mod4.ratio, t),
    mod4Index: lerp(a.mod4.index, b.mod4.index, t),
    mod4Decay: lerp(a.mod4.decay, b.mod4.decay, t),
    mod4Sustain: lerp(a.mod4.sustain ?? 0.1, b.mod4.sustain ?? 0.1, t),
    mod4Level: lerp(a.mod4.level ?? 1, b.mod4.level ?? 1, t),
    mod4Feedback: lerp(a.mod4.feedback ?? 0, b.mod4.feedback ?? 0, t),
    mod4Detune: lerp(a.mod4.detune ?? 0, b.mod4.detune ?? 0, t),
    mod4EnvRate: lerp(a.mod4.envRate ?? 1, b.mod4.envRate ?? 1, t),
    mod4ModAttack: lerp(a.mod4.modAttack ?? 0, b.mod4.modAttack ?? 0, t),
    mod4ModDelay: lerp(a.mod4.modDelay ?? 0, b.mod4.modDelay ?? 0, t),

    attack: lerp(a.envelope.attack, b.envelope.attack, t),
    decay: lerp(a.envelope.decay, b.envelope.decay, t),
    sustain: lerp(a.envelope.sustain, b.envelope.sustain, t),
    release: lerp(a.envelope.release, b.envelope.release, t),

    filterFreq: lerp(a.filter.freq, b.filter.freq, t),
    filterQ: lerp(a.filter.q, b.filter.q, t),
    filterType: t < 0.5 ? (a.filter.type ?? 'lowpass') : (b.filter.type ?? 'lowpass'),
    filterEnvAttack: lerp(a.filter.envAttack ?? 0, b.filter.envAttack ?? 0, t),
    filterEnvDecay: lerp(a.filter.envDecay ?? 0, b.filter.envDecay ?? 0, t),
    filterEnvSustain: lerp(a.filter.envSustain ?? 1, b.filter.envSustain ?? 1, t),
    filterEnvRelease: lerp(a.filter.envRelease ?? 0, b.filter.envRelease ?? 0, t),
    filterEnvDepth: lerp(a.filter.envDepth ?? 0, b.filter.envDepth ?? 0, t),
    drive: lerp(a.drive ?? 0, b.drive ?? 0, t),

    transientClick: lerp(a.transient?.click ?? 0, b.transient?.click ?? 0, t),
    transientNoise: lerp(a.transient?.noise ?? 0, b.transient?.noise ?? 0, t),
    transientDuration: lerp(a.transient?.duration ?? 20, b.transient?.duration ?? 20, t),
    transientDecay: lerp(a.transient?.decay ?? 50, b.transient?.decay ?? 50, t),
    transientFilter: lerp(a.transient?.filter ?? 4000, b.transient?.filter ?? 4000, t),
    transientType,

    gain: lerp(a.gain, b.gain, t),

    xLevel: lerp(aXY.xLevel, bXY.xLevel, t),
    xPan: lerp(aXY.xPan, bXY.xPan, t),
    yLevel: lerp(aXY.yLevel, bXY.yLevel, t),
    yPan: lerp(aXY.yPan, bXY.yPan, t),

    lfoRate: lerp(a.lfo?.rate ?? 0, b.lfo?.rate ?? 0, t),
    lfoDepth: lerp(a.lfo?.depth ?? 0, b.lfo?.depth ?? 0, t),
    lfoTarget,
    unisonVoices: Math.round(lerp(a.unisonVoices ?? 1, b.unisonVoices ?? 1, t)),
    unisonDetune: lerp(a.unisonDetune ?? 0, b.unisonDetune ?? 0, t),
  };
}

// ─── Default Presets (embedded fallbacks if JSON fetch fails) ───

export const DEFAULT_SOFT_RHODES: Lead4opFMPreset = {
  id: 'soft_rhodes',
  name: 'Soft Rhodes',
  engine: 'Lead4opFM',
  algorithm: 'parallel',
  xy: { xLevel: 1, xPan: -0.2, yLevel: 0.9, yPan: 0.2 },
  params: {
    beatDetune: 0,
    carrier2Mix: 0,
    mod1: { ratio: 1, index: 0.25, decay: 0.8, sustain: 0.23 },
    mod2: { ratio: 2, index: 0.08, decay: 0.72 },
    mod3: { ratio: 3, index: 0, decay: 0.3 },
    mod4: { ratio: 0.5, index: 0, decay: 0.3 },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0.3, release: 2 },
    filter: { freq: 4000, q: 0.7 },
    transient: { click: 0.08, noise: 0.02, duration: 12, decay: 130, filter: 4200, type: 'filtered' },
    gain: 0.34,
  },
};

export const DEFAULT_GAMELAN: Lead4opFMPreset = {
  id: 'gamelan',
  name: 'Gamelan',
  engine: 'Lead4opFM',
  algorithm: 'cross',
  xy: { xLevel: 0.95, xPan: -0.35, yLevel: 1.05, yPan: 0.35 },
  params: {
    beatDetune: 25,
    carrier2Mix: 0.65,
    mod1: { ratio: 2.4, index: 2, decay: 0.45, sustain: 0.08 },
    mod2: { ratio: 4, index: 0.8, decay: 0.35 },
    mod3: { ratio: 5.5, index: 0.5, decay: 0.2 },
    mod4: { ratio: 0.65, index: 0.3, decay: 0.6 },
    envelope: { attack: 0.002, decay: 0.35, sustain: 0.3, release: 6 },
    filter: { freq: 7000, q: 1 },
    transient: { click: 0.5, noise: 0.15, duration: 25, decay: 80, filter: 5000, type: 'filtered' },
    gain: 0.7,
  },
};

// ─── Preset Cache & Loader ───

const presetCache: Map<string, Lead4opFMPreset> = new Map();
let manifestCache: Lead4opFMManifest | null = null;

/**
 * Load the Lead4opFM preset manifest (cached after first fetch)
 */
export async function loadLead4opFMManifest(): Promise<Lead4opFMManifest> {
  if (manifestCache) return manifestCache;
  try {
    const resp = await fetch('/presets/Lead4opFM/manifest.json');
    const data = await resp.json();
    manifestCache = data as Lead4opFMManifest;
    return manifestCache;
  } catch (e) {
    console.warn('Failed to load Lead4opFM manifest:', e);
    // Return minimal manifest with embedded defaults
    return {
      engine: 'Lead4opFM',
      version: 1,
      presets: [
        { id: 'soft_rhodes', name: 'Soft Rhodes', file: 'soft_rhodes.json', algorithm: 'parallel' },
        { id: 'gamelan', name: 'Gamelan', file: 'gamelan.json', algorithm: 'cross' },
      ],
    };
  }
}

/**
 * Load a preset by ID (cached after first fetch). Falls back to embedded defaults.
 */
export async function loadLead4opFMPreset(presetId: string): Promise<Lead4opFMPreset> {
  // Check cache
  const cached = presetCache.get(presetId);
  if (cached) return cached;

  // Embedded fallbacks
  if (presetId === 'soft_rhodes') {
    presetCache.set(presetId, DEFAULT_SOFT_RHODES);
    return DEFAULT_SOFT_RHODES;
  }
  if (presetId === 'gamelan') {
    presetCache.set(presetId, DEFAULT_GAMELAN);
    return DEFAULT_GAMELAN;
  }

  // Fetch from manifest
  try {
    const manifest = await loadLead4opFMManifest();
    const entry = manifest.presets.find(p => p.id === presetId);
    if (!entry) {
      console.warn(`Lead4opFM preset not found: ${presetId}, falling back to soft_rhodes`);
      return DEFAULT_SOFT_RHODES;
    }
    const resp = await fetch(`/presets/Lead4opFM/${entry.file}`);
    const data = await resp.json() as Lead4opFMPreset;
    presetCache.set(presetId, data);
    return data;
  } catch (e) {
    console.warn(`Failed to load Lead4opFM preset ${presetId}:`, e);
    return DEFAULT_SOFT_RHODES;
  }
}

/**
 * Get all available preset IDs and names from manifest
 */
export async function getLead4opFMPresetList(): Promise<{ id: string; name: string }[]> {
  const manifest = await loadLead4opFMManifest();
  return manifest.presets.map(p => ({ id: p.id, name: p.name }));
}

/**
 * Play a single 4op FM note into an AudioContext.
 * 
 * This is the core synthesis function with full Digitone-style features:
 * - Per-operator level, feedback, detune, envelope rate
 * - LFO → FM depth modulation
 * - Unison voice stacking
 * - XY stereo panning, transient layer, and envelope shaping
 * 
 * @param ctx - AudioContext
 * @param destination - GainNode to connect output to (the shared lead bus)
 * @param frequency - Note frequency in Hz
 * @param velocity - Note velocity 0..1
 * @param morphed - Pre-computed morphed params from morphPresets()
 * @param hold - Hold time in seconds (from shared leadHold param)
 * @returns stopTime (seconds) for cleanup scheduling
 */
export function playLead4opFMNote(
  ctx: AudioContext,
  destination: GainNode,
  frequency: number,
  velocity: number,
  morphed: Lead4opFMMorphedParams,
  hold: number,
): number {
  const now = ctx.currentTime;
  const unisonCount = Math.max(1, Math.min(4, morphed.unisonVoices || 1));
  const unisonSpread = morphed.unisonDetune || 0; // cents

  // Scale gain by 1/sqrt(unisonCount) to avoid volume increase
  const unisonGainScale = 1 / Math.sqrt(unisonCount);

  // ─── Output ───
  const output = ctx.createGain();
  output.gain.value = velocity * morphed.gain * unisonGainScale;

  // ─── Transient Layer (shared across unison voices) ───
  let transientGain: GainNode | null = null;
  let noiseBufferSource: AudioBufferSourceNode | null = null;
  let transientFilter: BiquadFilterNode | null = null;

  if (morphed.transientClick > 0 || morphed.transientNoise > 0) {
    transientGain = ctx.createGain();
    transientGain.gain.value = 0;

    transientFilter = ctx.createBiquadFilter();
    transientFilter.type = morphed.transientType === 'filtered' ? 'bandpass' : 'lowpass';
    transientFilter.frequency.value = morphed.transientFilter;
    transientFilter.Q.value = morphed.transientType === 'filtered' ? 2.0 : 0.7;

    const noiseDur = morphed.transientDuration / 1000;
    const bufferSize = Math.ceil(ctx.sampleRate * Math.max(0.1, noiseDur + 0.05));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      let sample = 0;
      switch (morphed.transientType) {
        case 'pink':
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
          break;
        case 'brown':
          brown = (brown + 0.02 * white) / 1.02;
          sample = brown * 3.5;
          break;
        case 'filtered':
          sample = white;
          break;
        default:
          sample = white;
      }
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * morphed.transientDecay);
      noiseData[i] = sample * env;
    }

    noiseBufferSource = ctx.createBufferSource();
    noiseBufferSource.buffer = noiseBuffer;
    noiseBufferSource.connect(transientFilter);
    transientFilter.connect(transientGain);
    transientGain.connect(output);
  }

  // ─── Per-operator params ───
  const opParams = [
    { ratio: morphed.mod1Ratio, index: morphed.mod1Index, decay: morphed.mod1Decay, sustain: morphed.mod1Sustain, level: morphed.mod1Level, feedback: morphed.mod1Feedback, detune: morphed.mod1Detune, envRate: morphed.mod1EnvRate, modAttack: morphed.mod1ModAttack, modDelay: morphed.mod1ModDelay },
    { ratio: morphed.mod2Ratio, index: morphed.mod2Index, decay: morphed.mod2Decay, sustain: morphed.mod2Sustain, level: morphed.mod2Level, feedback: morphed.mod2Feedback, detune: morphed.mod2Detune, envRate: morphed.mod2EnvRate, modAttack: morphed.mod2ModAttack, modDelay: morphed.mod2ModDelay },
    { ratio: morphed.mod3Ratio, index: morphed.mod3Index, decay: morphed.mod3Decay, sustain: morphed.mod3Sustain, level: morphed.mod3Level, feedback: morphed.mod3Feedback, detune: morphed.mod3Detune, envRate: morphed.mod3EnvRate, modAttack: morphed.mod3ModAttack, modDelay: morphed.mod3ModDelay },
    { ratio: morphed.mod4Ratio, index: morphed.mod4Index, decay: morphed.mod4Decay, sustain: morphed.mod4Sustain, level: morphed.mod4Level, feedback: morphed.mod4Feedback, detune: morphed.mod4Detune, envRate: morphed.mod4EnvRate, modAttack: morphed.mod4ModAttack, modDelay: morphed.mod4ModDelay },
  ];

  // Track active notes for CPU overlay
  activeLeadNoteCount++;

  // Collect all nodes for cleanup
  const allNodes: AudioNode[] = [output];
  const allOscillators: OscillatorNode[] = [];

  // ─── Global ADSR (base values, scaled per-op by envRate) ───
  const baseAttack = morphed.attack;
  const baseDecay = morphed.decay;
  const baseSustain = morphed.sustain;
  const baseRelease = morphed.release;

  // Track longest release for stop time
  let maxStopTime = 0;

  // ─── Unison Loop ───
  for (let u = 0; u < unisonCount; u++) {
    // Compute unison detune offset: spread voices symmetrically
    let unisonCents = 0;
    if (unisonCount > 1) {
      unisonCents = unisonSpread * ((u / (unisonCount - 1)) * 2 - 1); // -spread..+spread
    }
    const unisonFreq = frequency * Math.pow(2, unisonCents / 1200);

    // ─── Carriers ───
    const carrier1 = ctx.createOscillator();
    carrier1.type = 'sine';
    carrier1.frequency.value = unisonFreq;

    const carrier2 = ctx.createOscillator();
    carrier2.type = 'sine';
    carrier2.frequency.value = unisonFreq * Math.pow(2, morphed.beatDetune / 1200);

    const carrier2GainNode = ctx.createGain();
    carrier2GainNode.gain.value = morphed.carrier2Mix;

    // ─── Modulators with per-op detune, level, feedback ───
    const modulators: OscillatorNode[] = [];
    const modGains: GainNode[] = [];
    const modLevelGains: GainNode[] = []; // per-op output level
    const fbGains: GainNode[] = []; // per-op self-feedback

    for (let opIdx = 0; opIdx < 4; opIdx++) {
      const op = opParams[opIdx];
      const opFreq = unisonFreq * op.ratio * Math.pow(2, op.detune / 1200);

      const modulator = ctx.createOscillator();
      modulator.type = 'sine';
      modulator.frequency.value = opFreq;

      const modGain = ctx.createGain();
      const modIdxVal = opIdx === 0
        ? unisonFreq * op.index * velocity
        : unisonFreq * op.index;
      modGain.gain.value = modIdxVal;

      // Per-operator level gain
      const levelGain = ctx.createGain();
      levelGain.gain.value = op.level;

      // Connect: modulator → levelGain → modGain
      modulator.connect(levelGain);
      levelGain.connect(modGain);

      // Self-feedback: modulator → feedbackGain → modulator.frequency
      let fbGain: GainNode | null = null;
      if (op.feedback > 0) {
        fbGain = ctx.createGain();
        fbGain.gain.value = unisonFreq * op.feedback * 0.5; // scale feedback to audible range
        modulator.connect(fbGain);
        fbGain.connect(modulator.frequency);
        allNodes.push(fbGain);
      }

      modulators.push(modulator);
      modGains.push(modGain);
      modLevelGains.push(levelGain);
      fbGains.push(fbGain!);
      allOscillators.push(modulator);
      allNodes.push(modGain, levelGain);
    }

    // ─── LFO → Modulation (target-dependent routing) ───
    let lfo: OscillatorNode | null = null;
    const lfoModGains: GainNode[] = [];
    const lfoTarget = morphed.lfoTarget || 'all';

    if (morphed.lfoDepth > 0 && morphed.lfoRate > 0 && lfoTarget !== 'none') {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = morphed.lfoRate;

      if (lfoTarget === 'all' || lfoTarget === 'mod1' || lfoTarget === 'mod2' ||
          lfoTarget === 'mod3' || lfoTarget === 'mod4') {
        // FM depth modulation (original behavior)
        for (let opIdx = 0; opIdx < 4; opIdx++) {
          const shouldModulate = lfoTarget === 'all' ||
            (lfoTarget === 'mod1' && opIdx === 0) ||
            (lfoTarget === 'mod2' && opIdx === 1) ||
            (lfoTarget === 'mod3' && opIdx === 2) ||
            (lfoTarget === 'mod4' && opIdx === 3);

          if (shouldModulate) {
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = unisonFreq * opParams[opIdx].index * morphed.lfoDepth;
            lfo.connect(lfoGain);
            lfoGain.connect(modGains[opIdx].gain);
            lfoModGains.push(lfoGain);
            allNodes.push(lfoGain);
          }
        }
      } else if (lfoTarget === 'pitch') {
        // LFO → carrier pitch (vibrato)
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = unisonFreq * morphed.lfoDepth * 0.02; // ±2% pitch = subtle vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(carrier1.frequency);
        lfoGain.connect(carrier2.frequency);
        lfoModGains.push(lfoGain);
        allNodes.push(lfoGain);
      } else if (lfoTarget === 'detune') {
        // LFO → carrier2 detune (movement/chorus effect)
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = unisonFreq * morphed.lfoDepth * 0.01; // subtle detuning
        lfo.connect(lfoGain);
        lfoGain.connect(carrier2.frequency);
        lfoModGains.push(lfoGain);
        allNodes.push(lfoGain);
      }
      // 'filter' target is connected later after filter nodes are created

      lfo.start(now);
      allOscillators.push(lfo);
      allNodes.push(lfo);
    }

    // ─── Envelopes (per-carrier, modulated by operator envRate) ───
    const envelope1 = ctx.createGain();
    envelope1.gain.value = 0;
    const envelope2 = ctx.createGain();
    envelope2.gain.value = 0;

    // ─── FM Algorithm Routing ───
    const connectToCarriers = (gainNode: GainNode, left: boolean = true, right: boolean = true) => {
      if (left) gainNode.connect(carrier1.frequency);
      if (right) gainNode.connect(carrier2.frequency);
    };

    if (morphed.algorithm === 'stack') {
      modGains[3].connect(modulators[2].frequency);
      modGains[2].connect(modulators[1].frequency);
      modGains[1].connect(modulators[0].frequency);
      connectToCarriers(modGains[0], true, true);
    } else if (morphed.algorithm === 'split') {
      modGains[0].connect(carrier1.frequency);
      modGains[1].connect(carrier2.frequency);
      modGains[2].connect(carrier1.frequency);
      modGains[3].connect(carrier2.frequency);
    } else if (morphed.algorithm === 'cross') {
      connectToCarriers(modGains[0], true, false);
      connectToCarriers(modGains[1], true, false);
      connectToCarriers(modGains[2], false, true);
      connectToCarriers(modGains[3], false, true);
    } else if (morphed.algorithm === 'dx17') {
      carrier2GainNode.gain.value = 0;
      connectToCarriers(modGains[2], true, false);
      modGains[3].connect(modulators[2].frequency);
      modGains[1].connect(modulators[2].frequency);
      connectToCarriers(modGains[0], true, false);
    } else {
      // parallel: all → both carriers
      connectToCarriers(modGains[0], true, true);
      connectToCarriers(modGains[1], true, true);
      connectToCarriers(modGains[2], true, true);
      connectToCarriers(modGains[3], true, true);
    }

    carrier1.connect(envelope1);
    carrier2.connect(carrier2GainNode);
    carrier2GainNode.connect(envelope2);

    // ─── Drive / Waveshaper ───
    let driveNodeX: WaveShaperNode | null = null;
    let driveNodeY: WaveShaperNode | null = null;
    if (morphed.drive > 0.01) {
      // Pre-compute tanh soft-clip curve, drive 0..1 maps to gain 1..20
      const driveAmount = 1 + morphed.drive * 19;
      const nSamples = 1024;
      const curve = new Float32Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = Math.tanh(x * driveAmount);
      }
      driveNodeX = ctx.createWaveShaper();
      driveNodeX.curve = curve;
      driveNodeX.oversample = '2x';
      driveNodeY = ctx.createWaveShaper();
      driveNodeY.curve = curve;
      driveNodeY.oversample = '2x';
      allNodes.push(driveNodeX, driveNodeY);
    }

    // ─── XY Stereo Routing with Filter ───
    const filterX = ctx.createBiquadFilter();
    filterX.type = morphed.filterType;
    filterX.frequency.value = morphed.filterFreq;
    filterX.Q.value = morphed.filterQ;

    const filterY = ctx.createBiquadFilter();
    filterY.type = morphed.filterType;
    filterY.frequency.value = morphed.filterFreq;
    filterY.Q.value = morphed.filterQ;

    // ─── Filter Envelope ───
    if (Math.abs(morphed.filterEnvDepth) > 1) {
      const fBase = morphed.filterFreq;
      const fPeak = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth));
      const fSustain = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth * morphed.filterEnvSustain));
      const fEnvAtt = Math.max(0.001, morphed.filterEnvAttack);
      const fEnvDec = Math.max(0.001, morphed.filterEnvDecay);
      // fEnvRel reserved for future release-phase filter envelope
      // const fEnvRel = Math.max(0.001, morphed.filterEnvRelease);

      // Attack: base → peak
      filterX.frequency.setValueAtTime(fBase, now);
      filterX.frequency.linearRampToValueAtTime(fPeak, now + fEnvAtt);
      // Decay: peak → sustain
      filterX.frequency.linearRampToValueAtTime(fSustain, now + fEnvAtt + fEnvDec);

      filterY.frequency.setValueAtTime(fBase, now);
      filterY.frequency.linearRampToValueAtTime(fPeak, now + fEnvAtt);
      filterY.frequency.linearRampToValueAtTime(fSustain, now + fEnvAtt + fEnvDec);
    }

    // ─── LFO → Filter Frequency (connected here after filter nodes exist) ───
    if (lfo && lfoTarget === 'filter') {
      const lfoFilterGain = ctx.createGain();
      // LFO depth modulates filter cutoff: ±depth * baseFreq * 0.5
      lfoFilterGain.gain.value = morphed.filterFreq * morphed.lfoDepth * 0.5;
      lfo.connect(lfoFilterGain);
      lfoFilterGain.connect(filterX.frequency);
      lfoFilterGain.connect(filterY.frequency);
      lfoModGains.push(lfoFilterGain);
      allNodes.push(lfoFilterGain);
    }

    const xGainNode = ctx.createGain();
    xGainNode.gain.value = morphed.xLevel;
    const yGainNode = ctx.createGain();
    yGainNode.gain.value = morphed.yLevel;

    const xPanNode = ctx.createStereoPanner();
    xPanNode.pan.value = morphed.xPan;
    const yPanNode = ctx.createStereoPanner();
    yPanNode.pan.value = morphed.yPan;

    // Signal chain: envelope → [drive] → filter → gain → pan → output
    if (driveNodeX && driveNodeY) {
      envelope1.connect(driveNodeX);
      driveNodeX.connect(filterX);
      envelope2.connect(driveNodeY);
      driveNodeY.connect(filterY);
    } else {
      envelope1.connect(filterX);
      envelope2.connect(filterY);
    }
    filterX.connect(xGainNode);
    xGainNode.connect(xPanNode);
    xPanNode.connect(output);

    filterY.connect(yGainNode);
    yGainNode.connect(yPanNode);
    yPanNode.connect(output);

    // ─── Start Oscillators ───
    carrier1.start(now);
    carrier2.start(now);
    for (const mod of modulators) mod.start(now);
    allOscillators.push(carrier1, carrier2);
    allNodes.push(carrier1, carrier2, carrier2GainNode, envelope1, envelope2,
      filterX, filterY, xGainNode, yGainNode, xPanNode, yPanNode);

    // ─── Amplitude Envelopes (per-op envRate on carrier envelopes) ───
    // Carrier 1 uses mod1's envRate, carrier 2 uses mod2's envRate (as primary modulators)
    const env1Rate = opParams[0].envRate;
    const env2Rate = opParams[1].envRate;
    const att1 = baseAttack * env1Rate;
    const dec1 = baseDecay * env1Rate;
    const rel1 = baseRelease * env1Rate;
    const att2 = baseAttack * env2Rate;
    const dec2 = baseDecay * env2Rate;
    const rel2 = baseRelease * env2Rate;

    envelope1.gain.setValueAtTime(0, now);
    envelope1.gain.linearRampToValueAtTime(1.0, now + att1);
    envelope1.gain.linearRampToValueAtTime(baseSustain, now + att1 + dec1);

    envelope2.gain.setValueAtTime(0, now);
    envelope2.gain.linearRampToValueAtTime(0.8, now + att2 * 1.2);
    envelope2.gain.linearRampToValueAtTime(baseSustain * 0.8, now + att2 + dec2);

    // ─── Modulation Envelopes: Digitone-style ADE (Delay → Attack → Decay → End) ───
    for (let opIdx = 0; opIdx < 4; opIdx++) {
      const op = opParams[opIdx];
      const modPeakVal = opIdx === 0
        ? unisonFreq * op.index * velocity
        : unisonFreq * op.index;
      const modEndVal = Math.max(0.001, modPeakVal * op.sustain);
      const modDelay = op.modDelay || 0;  // delay before attack starts
      const modAttack = op.modAttack || 0;  // attack ramp time

      if (modDelay > 0 || modAttack > 0) {
        // Digitone ADE: start silent → delay → ramp up → decay to end level
        modGains[opIdx].gain.setValueAtTime(0.001, now);
        if (modDelay > 0) {
          modGains[opIdx].gain.setValueAtTime(0.001, now + modDelay);
        }
        modGains[opIdx].gain.exponentialRampToValueAtTime(
          Math.max(0.001, modPeakVal),
          now + modDelay + Math.max(0.001, modAttack)
        );
        modGains[opIdx].gain.exponentialRampToValueAtTime(
          modEndVal,
          now + modDelay + modAttack + op.decay
        );
      } else {
        // Legacy behavior: instant peak → decay to end (for presets without modAttack)
        modGains[opIdx].gain.setValueAtTime(Math.max(0.001, modPeakVal), now);
        modGains[opIdx].gain.exponentialRampToValueAtTime(
          modEndVal,
          now + op.decay
        );
      }
    }

    // ─── Hold & Release ───
    const longestAtt = Math.max(att1, att2);
    const longestDec = Math.max(dec1, dec2);
    const noteEnd = now + longestAtt + longestDec + hold;
    const longestRel = Math.max(rel1, rel2);
    const voiceStopTime = noteEnd + longestRel;

    envelope1.gain.setValueAtTime(baseSustain, noteEnd);
    envelope1.gain.exponentialRampToValueAtTime(0.001, noteEnd + rel1);

    envelope2.gain.setValueAtTime(baseSustain * 0.8, noteEnd);
    envelope2.gain.exponentialRampToValueAtTime(0.001, noteEnd + rel2);

    // ─── Filter Envelope Release ───
    if (Math.abs(morphed.filterEnvDepth) > 1) {
      const fBase = morphed.filterFreq;
      const fSustain = Math.max(20, Math.min(20000, fBase + morphed.filterEnvDepth * morphed.filterEnvSustain));
      const fEnvRel = Math.max(0.001, morphed.filterEnvRelease);
      filterX.frequency.setValueAtTime(fSustain, noteEnd);
      filterX.frequency.linearRampToValueAtTime(fBase, noteEnd + fEnvRel);
      filterY.frequency.setValueAtTime(fSustain, noteEnd);
      filterY.frequency.linearRampToValueAtTime(fBase, noteEnd + fEnvRel);
    }

    // ─── Stop Oscillators ───
    const cleanupTime = voiceStopTime + 0.1;
    for (const osc of allOscillators) {
      try { osc.stop(cleanupTime); } catch { /* already stopped */ }
    }

    if (voiceStopTime > maxStopTime) maxStopTime = voiceStopTime;
  }

  output.connect(destination);

  // ─── Start transient (shared) ───
  if (noiseBufferSource) noiseBufferSource.start(now);
  if (transientGain) {
    const noiseDur = morphed.transientDuration / 1000;
    const totalTransient = (morphed.transientClick + morphed.transientNoise) * velocity * 0.8;
    transientGain.gain.setValueAtTime(totalTransient, now);
    transientGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur + 0.01);
    allNodes.push(transientGain);
    if (transientFilter) allNodes.push(transientFilter);
    if (noiseBufferSource) allNodes.push(noiseBufferSource);
  }

  const stopTime = maxStopTime;

  // ─── Cleanup ───
  setTimeout(() => {
    try {
      for (const node of allNodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    } catch {
      // Ignore cleanup errors
    }
    activeLeadNoteCount = Math.max(0, activeLeadNoteCount - 1);
  }, (stopTime - now + 0.3) * 1000);

  return stopTime;
}
