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
}

export interface Lead4opFMTransient {
  click: number;
  noise: number;
  duration: number;
  decay: number;
  filter: number;
  type: 'white' | 'pink' | 'brown' | 'filtered';
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
  mod2Ratio: number;
  mod2Index: number;
  mod2Decay: number;
  mod3Ratio: number;
  mod3Index: number;
  mod3Decay: number;
  mod4Ratio: number;
  mod4Index: number;
  mod4Decay: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterFreq: number;
  filterQ: number;
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

  return {
    algorithm,
    beatDetune: lerp(a.beatDetune, b.beatDetune, t),
    carrier2Mix: lerp(a.carrier2Mix, b.carrier2Mix, t),

    mod1Ratio: lerp(a.mod1.ratio, b.mod1.ratio, t),
    mod1Index: lerp(a.mod1.index, b.mod1.index, t),
    mod1Decay: lerp(a.mod1.decay, b.mod1.decay, t),
    mod1Sustain: lerp(a.mod1.sustain ?? 0.1, b.mod1.sustain ?? 0.1, t),

    mod2Ratio: lerp(a.mod2.ratio, b.mod2.ratio, t),
    mod2Index: lerp(a.mod2.index, b.mod2.index, t),
    mod2Decay: lerp(a.mod2.decay, b.mod2.decay, t),

    mod3Ratio: lerp(a.mod3.ratio, b.mod3.ratio, t),
    mod3Index: lerp(a.mod3.index, b.mod3.index, t),
    mod3Decay: lerp(a.mod3.decay, b.mod3.decay, t),

    mod4Ratio: lerp(a.mod4.ratio, b.mod4.ratio, t),
    mod4Index: lerp(a.mod4.index, b.mod4.index, t),
    mod4Decay: lerp(a.mod4.decay, b.mod4.decay, t),

    attack: lerp(a.envelope.attack, b.envelope.attack, t),
    decay: lerp(a.envelope.decay, b.envelope.decay, t),
    sustain: lerp(a.envelope.sustain, b.envelope.sustain, t),
    release: lerp(a.envelope.release, b.envelope.release, t),

    filterFreq: lerp(a.filter.freq, b.filter.freq, t),
    filterQ: lerp(a.filter.q, b.filter.q, t),

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
 * This is the core synthesis function, ported from the Lead4opFM preset editor.
 * It creates all oscillators/gains per note, applies FM routing based on algorithm,
 * XY stereo panning, transient layer, and envelope shaping.
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

  // ─── Carriers ───
  const carrier1 = ctx.createOscillator();
  carrier1.type = 'sine';
  carrier1.frequency.value = frequency;

  const carrier2 = ctx.createOscillator();
  carrier2.type = 'sine';
  carrier2.frequency.value = frequency * Math.pow(2, morphed.beatDetune / 1200);

  const carrier2Gain = ctx.createGain();
  carrier2Gain.gain.value = morphed.carrier2Mix;

  // ─── Modulators ───
  const modulator1 = ctx.createOscillator();
  modulator1.type = 'sine';
  modulator1.frequency.value = frequency * morphed.mod1Ratio;
  const modGain1 = ctx.createGain();
  const modIndex1 = frequency * morphed.mod1Index * velocity;
  modGain1.gain.value = modIndex1;

  const modulator2 = ctx.createOscillator();
  modulator2.type = 'sine';
  modulator2.frequency.value = frequency * morphed.mod2Ratio;
  const modGain2 = ctx.createGain();
  modGain2.gain.value = frequency * morphed.mod2Index;

  const modulator3 = ctx.createOscillator();
  modulator3.type = 'sine';
  modulator3.frequency.value = frequency * morphed.mod3Ratio;
  const modGain3 = ctx.createGain();
  modGain3.gain.value = frequency * morphed.mod3Index;

  const modulator4 = ctx.createOscillator();
  modulator4.type = 'sine';
  modulator4.frequency.value = frequency * morphed.mod4Ratio;
  const modGain4 = ctx.createGain();
  modGain4.gain.value = frequency * morphed.mod4Index;

  // ─── Envelopes ───
  const envelope1 = ctx.createGain();
  envelope1.gain.value = 0;
  const envelope2 = ctx.createGain();
  envelope2.gain.value = 0;

  // ─── Output ───
  const output = ctx.createGain();
  output.gain.value = velocity * morphed.gain;

  // ─── Transient Layer ───
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

  // ─── FM Algorithm Routing ───
  modulator1.connect(modGain1);
  modulator2.connect(modGain2);
  modulator3.connect(modGain3);
  modulator4.connect(modGain4);

  const connectToCarriers = (gainNode: GainNode, left: boolean = true, right: boolean = true) => {
    if (left) gainNode.connect(carrier1.frequency);
    if (right) gainNode.connect(carrier2.frequency);
  };

  if (morphed.algorithm === 'stack') {
    modGain4.connect(modulator3.frequency);
    modGain3.connect(modulator2.frequency);
    modGain2.connect(modulator1.frequency);
    connectToCarriers(modGain1, true, true);
  } else if (morphed.algorithm === 'split') {
    modGain1.connect(carrier1.frequency);
    modGain2.connect(carrier2.frequency);
    modGain3.connect(carrier1.frequency);
    modGain4.connect(carrier2.frequency);
  } else if (morphed.algorithm === 'cross') {
    connectToCarriers(modGain1, true, false);
    connectToCarriers(modGain2, true, false);
    connectToCarriers(modGain3, false, true);
    connectToCarriers(modGain4, false, true);
  } else if (morphed.algorithm === 'dx17') {
    carrier2Gain.gain.value = 0;
    connectToCarriers(modGain3, true, false);
    modGain4.connect(modulator3.frequency);
    modGain2.connect(modulator3.frequency);
    connectToCarriers(modGain1, true, false);
  } else {
    // parallel: all → both carriers
    connectToCarriers(modGain1, true, true);
    connectToCarriers(modGain2, true, true);
    connectToCarriers(modGain3, true, true);
    connectToCarriers(modGain4, true, true);
  }

  carrier1.connect(envelope1);
  carrier2.connect(carrier2Gain);
  carrier2Gain.connect(envelope2);

  // ─── XY Stereo Routing with Filter ───
  const filterX = ctx.createBiquadFilter();
  filterX.type = 'lowpass';
  filterX.frequency.value = morphed.filterFreq;
  filterX.Q.value = morphed.filterQ;

  const filterY = ctx.createBiquadFilter();
  filterY.type = 'lowpass';
  filterY.frequency.value = morphed.filterFreq;
  filterY.Q.value = morphed.filterQ;

  const xGainNode = ctx.createGain();
  xGainNode.gain.value = morphed.xLevel;
  const yGainNode = ctx.createGain();
  yGainNode.gain.value = morphed.yLevel;

  const xPanNode = ctx.createStereoPanner();
  xPanNode.pan.value = morphed.xPan;
  const yPanNode = ctx.createStereoPanner();
  yPanNode.pan.value = morphed.yPan;

  envelope1.connect(filterX);
  filterX.connect(xGainNode);
  xGainNode.connect(xPanNode);
  xPanNode.connect(output);

  envelope2.connect(filterY);
  filterY.connect(yGainNode);
  yGainNode.connect(yPanNode);
  yPanNode.connect(output);

  output.connect(destination);

  // ─── Start Oscillators ───
  carrier1.start(now);
  carrier2.start(now);
  modulator1.start(now);
  modulator2.start(now);
  modulator3.start(now);
  modulator4.start(now);
  if (noiseBufferSource) noiseBufferSource.start(now);

  // ─── Transient Envelope ───
  if (transientGain) {
    const noiseDur = morphed.transientDuration / 1000;
    const totalTransient = (morphed.transientClick + morphed.transientNoise) * velocity * 0.8;
    transientGain.gain.setValueAtTime(totalTransient, now);
    transientGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur + 0.01);
  }

  // ─── Amplitude Envelopes ───
  const attack = morphed.attack;
  const decay = morphed.decay;
  const sustain = morphed.sustain;
  const release = morphed.release;

  envelope1.gain.setValueAtTime(0, now);
  envelope1.gain.linearRampToValueAtTime(1.0, now + attack);
  envelope1.gain.linearRampToValueAtTime(sustain, now + attack + decay);

  envelope2.gain.setValueAtTime(0, now);
  envelope2.gain.linearRampToValueAtTime(0.8, now + attack * 1.2);
  envelope2.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);

  // ─── Modulation Envelopes ───
  modGain1.gain.setValueAtTime(modIndex1, now);
  modGain1.gain.exponentialRampToValueAtTime(
    Math.max(0.001, modIndex1 * (morphed.mod1Sustain || 0.1)),
    now + attack + morphed.mod1Decay
  );

  const mod2Start = frequency * morphed.mod2Index;
  modGain2.gain.setValueAtTime(mod2Start, now);
  modGain2.gain.exponentialRampToValueAtTime(
    Math.max(0.001, mod2Start * 0.05),
    now + attack + morphed.mod2Decay
  );

  const mod3Start = frequency * morphed.mod3Index;
  modGain3.gain.setValueAtTime(mod3Start, now);
  modGain3.gain.exponentialRampToValueAtTime(
    Math.max(0.001, mod3Start * 0.02),
    now + attack + morphed.mod3Decay
  );

  const mod4Start = frequency * morphed.mod4Index;
  modGain4.gain.setValueAtTime(mod4Start, now);
  modGain4.gain.exponentialRampToValueAtTime(
    Math.max(0.001, mod4Start * 0.1),
    now + attack + morphed.mod4Decay
  );

  // ─── Hold & Release ───
  const noteEnd = now + attack + decay + hold;
  const stopTime = noteEnd + release;

  envelope1.gain.setValueAtTime(sustain, noteEnd);
  envelope1.gain.exponentialRampToValueAtTime(0.001, stopTime);

  envelope2.gain.setValueAtTime(sustain * 0.8, noteEnd);
  envelope2.gain.exponentialRampToValueAtTime(0.001, stopTime);

  // ─── Stop Oscillators ───
  const cleanupTime = stopTime + 0.1;
  carrier1.stop(cleanupTime);
  carrier2.stop(cleanupTime);
  modulator1.stop(cleanupTime);
  modulator2.stop(cleanupTime);
  modulator3.stop(cleanupTime);
  modulator4.stop(cleanupTime);

  // ─── Cleanup ───
  setTimeout(() => {
    try {
      carrier1.disconnect(); carrier2.disconnect(); carrier2Gain.disconnect();
      modulator1.disconnect(); modulator2.disconnect(); modulator3.disconnect(); modulator4.disconnect();
      modGain1.disconnect(); modGain2.disconnect(); modGain3.disconnect(); modGain4.disconnect();
      envelope1.disconnect(); envelope2.disconnect();
      filterX.disconnect(); filterY.disconnect();
      xGainNode.disconnect(); yGainNode.disconnect();
      xPanNode.disconnect(); yPanNode.disconnect();
      output.disconnect();
      if (transientGain) transientGain.disconnect();
      if (transientFilter) transientFilter.disconnect();
      if (noiseBufferSource) noiseBufferSource.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }, (cleanupTime - now + 0.2) * 1000);

  return stopTime;
}
