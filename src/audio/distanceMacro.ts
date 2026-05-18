import { getParamInfo, type SliderState } from '../ui/state';

export type DistanceVoice = 'lead1' | 'lead2' | 'piano' | 'pad1' | 'pad2';

type EnvelopeShape = {
  attack: number;
  decay: number;
  sustain: number;
  hold?: number;
  release: number;
};

const DISTANCE_SLIGHT_POINT = 0.25;
const DISTANCE_STRENGTH = 2;
const ATTACK_DISTANCE_BASE_BOOST_SECONDS = 0.1;
const ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS = 0.005;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const scaleDistance = (distance: number): number => {
  const safeDistance = clamp(distance, 0, 1);
  if (DISTANCE_STRENGTH <= 1) return safeDistance;
  return 1 - Math.pow(1 - safeDistance, DISTANCE_STRENGTH);
};

const clampParamValue = (key: keyof SliderState, value: number): number => {
  const info = getParamInfo(key);
  if (!info) return value;
  return clamp(value, info.min, info.max);
};

const anchoredValue = (
  distance: number,
  startValue: number,
  slightValue: number,
  maxValue: number,
): number => {
  const safeDistance = scaleDistance(distance);
  if (safeDistance <= DISTANCE_SLIGHT_POINT) {
    if (DISTANCE_SLIGHT_POINT <= 0) return startValue;
    const headT = safeDistance / DISTANCE_SLIGHT_POINT;
    return startValue + headT * (slightValue - startValue);
  }
  const tailT = (safeDistance - DISTANCE_SLIGHT_POINT) / (1 - DISTANCE_SLIGHT_POINT);
  return slightValue + tailT * (maxValue - slightValue);
};

const applyAdd = (base: number, distance: number, slightDelta: number, maxDelta: number): number =>
  base + anchoredValue(distance, 0, slightDelta, maxDelta);

const applyMultiply = (base: number, distance: number, slightMul: number, maxMul: number): number =>
  base * anchoredValue(distance, 1, slightMul, maxMul);

const applyParamAdd = (
  key: keyof SliderState,
  base: number,
  distance: number,
  slightDelta: number,
  maxDelta: number,
): number => clampParamValue(key, applyAdd(base, distance, slightDelta, maxDelta));

const applyParamMultiply = (
  key: keyof SliderState,
  base: number,
  distance: number,
  slightMul: number,
  maxMul: number,
): number => clampParamValue(key, applyMultiply(base, distance, slightMul, maxMul));

const applyAttackParamMultiply = (
  key: keyof SliderState,
  base: number,
  distance: number,
  slightMul: number,
  maxMul: number,
): number => {
  if (Math.abs(distance) <= 1e-4) return clampParamValue(key, base);
  const effectiveBase = base <= ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS
    ? base + ATTACK_DISTANCE_BASE_BOOST_SECONDS
    : base;
  return clampParamValue(key, applyMultiply(effectiveBase, distance, slightMul, maxMul));
};

export const getVoiceDistanceKey = (voice: DistanceVoice): keyof SliderState => {
  switch (voice) {
    case 'lead1': return 'lead1Distance';
    case 'lead2': return 'lead2Distance';
    case 'piano': return 'pianoDistance';
    case 'pad1': return 'padDistance';
    case 'pad2': return 'pad2Distance';
  }
};

export const getVoiceDistanceValue = (state: SliderState, voice: DistanceVoice): number =>
  clamp(Number(state[getVoiceDistanceKey(voice)] ?? 0), 0, 1);

const resolvePreviewDistance = (
  state: SliderState,
  voice: DistanceVoice,
  distanceOverride?: number | null,
): number => clamp(distanceOverride ?? getVoiceDistanceValue(state, voice), 0, 1);

export const applyLeadDistanceEnvelope = (
  voice: 'lead1' | 'lead2',
  env: EnvelopeShape,
  distance: number,
): EnvelopeShape => {
  if (Math.abs(distance) <= 1e-4) return env;
  const attackKey = voice === 'lead2' ? 'lead2Attack' : 'lead1Attack';
  const decayKey = voice === 'lead2' ? 'lead2Decay' : 'lead1Decay';
  const sustainKey = voice === 'lead2' ? 'lead2Sustain' : 'lead1Sustain';
  const holdKey = voice === 'lead2' ? 'lead2Hold' : 'lead1Hold';
  const releaseKey = voice === 'lead2' ? 'lead2Release' : 'lead1Release';
  const isLead2 = voice === 'lead2';

  return {
    attack: applyAttackParamMultiply(attackKey, env.attack, distance, isLead2 ? 1.25 : 1.2, isLead2 ? 3.6 : 3.2),
    decay: applyParamMultiply(decayKey, env.decay, distance, isLead2 ? 0.94 : 0.95, isLead2 ? 0.74 : 0.78),
    sustain: applyParamAdd(sustainKey, env.sustain, distance, isLead2 ? -0.05 : -0.04, isLead2 ? -0.30 : -0.26),
    hold: env.hold == null ? undefined : applyParamAdd(holdKey, env.hold, distance, isLead2 ? -0.06 : -0.05, isLead2 ? -0.40 : -0.35),
    release: applyParamMultiply(releaseKey, env.release, distance, isLead2 ? 1.15 : 1.12, isLead2 ? 2.0 : 1.9),
  };
};

type LeadDistanceTimbreParams = {
  filterFreq: number;
  filterQ: number;
  filterEnvDepth: number;
  transientClick: number;
  transientNoise: number;
  mod1Index: number;
  mod2Index: number;
  mod3Index: number;
  mod4Index: number;
  drive: number;
  carrier2Mix: number;
  gain: number;
};

export const applyLeadDistanceTimbre = <T extends LeadDistanceTimbreParams>(
  morphed: T,
  distance: number,
): T => {
  if (distance <= 1e-4) return morphed;
  const shaped = scaleDistance(distance);
  return {
    ...morphed,
    filterFreq: Math.max(80, morphed.filterFreq * (1 - shaped * 0.72)),
    filterQ: Math.max(0.05, morphed.filterQ * (1 - shaped * 0.18)),
    filterEnvDepth: morphed.filterEnvDepth * (1 - shaped * 0.55),
    transientClick: morphed.transientClick * (1 - shaped * 0.92),
    transientNoise: morphed.transientNoise * (1 - shaped * 0.82),
    mod1Index: morphed.mod1Index * (1 - shaped * 0.34),
    mod2Index: morphed.mod2Index * (1 - shaped * 0.30),
    mod3Index: morphed.mod3Index * (1 - shaped * 0.24),
    mod4Index: morphed.mod4Index * (1 - shaped * 0.18),
    drive: morphed.drive * (1 - shaped * 0.62),
    carrier2Mix: morphed.carrier2Mix * (1 - shaped * 0.12),
    gain: morphed.gain * (1 - shaped * 0.15),
  };
};

export const applyPianoDistanceEnvelope = (env: EnvelopeShape, distance: number): EnvelopeShape => {
  if (Math.abs(distance) <= 1e-4) return env;
  return {
    attack: applyAttackParamMultiply('pianoAttack', env.attack, distance, 1.35, 4.5),
    decay: applyParamMultiply('pianoDecay', env.decay, distance, 0.96, 0.80),
    sustain: applyParamAdd('pianoSustain', env.sustain, distance, -0.04, -0.22),
    hold: env.hold == null ? undefined : applyParamAdd('pianoHold', env.hold, distance, -0.03, -0.18),
    release: applyParamMultiply('pianoRelease', env.release, distance, 1.12, 1.80),
  };
};

type VoiceDistancePreview = Partial<Record<keyof SliderState, number>>;

export const getLeadDistancePreview = (
  state: SliderState,
  voice: 'lead1' | 'lead2',
  distanceOverride?: number | null,
): VoiceDistancePreview => {
  const distance = resolvePreviewDistance(state, voice, distanceOverride);
  const isLead2 = voice === 'lead2';
  const levelKey = isLead2 ? 'lead2Level' : 'lead1Level';
  const reverbKey = isLead2 ? 'lead2ReverbSend' : 'lead1ReverbSend';
  const postLpfKey = isLead2 ? 'lead2PostLPF' : 'lead1PostLPF';
  const widthKey = isLead2 ? 'lead2StereoWidth' : 'lead1StereoWidth';
  const diffuseKey = isLead2 ? 'lead2DiffuseSend' : 'lead1DiffuseSend';
  const attackKey = isLead2 ? 'lead2Attack' : 'lead1Attack';
  const decayKey = isLead2 ? 'lead2Decay' : 'lead1Decay';
  const sustainKey = isLead2 ? 'lead2Sustain' : 'lead1Sustain';
  const holdKey = isLead2 ? 'lead2Hold' : 'lead1Hold';
  const releaseKey = isLead2 ? 'lead2Release' : 'lead1Release';

  return {
    [levelKey]: applyParamAdd(levelKey, state[levelKey], distance, isLead2 ? -0.06 : -0.05, isLead2 ? -0.30 : -0.26),
    [reverbKey]: applyParamAdd(reverbKey, state[reverbKey], distance, isLead2 ? 0.07 : 0.05, isLead2 ? 0.22 : 0.18),
    [postLpfKey]: applyParamMultiply(postLpfKey, state[postLpfKey], distance, isLead2 ? 0.84 : 0.88, isLead2 ? 0.32 : 0.38),
    [widthKey]: applyParamAdd(widthKey, state[widthKey], distance, isLead2 ? -0.10 : -0.08, isLead2 ? -0.50 : -0.42),
    [diffuseKey]: applyParamAdd(diffuseKey, state[diffuseKey], distance, isLead2 ? 0.10 : 0.08, isLead2 ? 0.40 : 0.34),
    [attackKey]: applyAttackParamMultiply(attackKey, state[attackKey], distance, isLead2 ? 1.25 : 1.2, isLead2 ? 3.6 : 3.2),
    [decayKey]: applyParamMultiply(decayKey, state[decayKey], distance, isLead2 ? 0.94 : 0.95, isLead2 ? 0.74 : 0.78),
    [sustainKey]: applyParamAdd(sustainKey, state[sustainKey], distance, isLead2 ? -0.05 : -0.04, isLead2 ? -0.30 : -0.26),
    [holdKey]: applyParamAdd(holdKey, state[holdKey], distance, isLead2 ? -0.06 : -0.05, isLead2 ? -0.40 : -0.35),
    [releaseKey]: applyParamMultiply(releaseKey, state[releaseKey], distance, isLead2 ? 1.15 : 1.12, isLead2 ? 2.0 : 1.9),
  };
};

export const getPianoDistancePreview = (
  state: SliderState,
  distanceOverride?: number | null,
): VoiceDistancePreview => {
  const distance = resolvePreviewDistance(state, 'piano', distanceOverride);
  return {
    pianoLevel: applyParamAdd('pianoLevel', state.pianoLevel, distance, -0.05, -0.24),
    pianoReverbSend: applyParamAdd('pianoReverbSend', state.pianoReverbSend, distance, 0.08, 0.24),
    pianoPostLPF: applyParamMultiply('pianoPostLPF', state.pianoPostLPF, distance, 0.82, 0.30),
    pianoStereoWidth: applyParamAdd('pianoStereoWidth', state.pianoStereoWidth, distance, -0.06, -0.28),
    pianoDiffuseSend: applyParamAdd('pianoDiffuseSend', state.pianoDiffuseSend, distance, 0.08, 0.28),
    pianoAttack: applyAttackParamMultiply('pianoAttack', state.pianoAttack, distance, 1.35, 4.5),
    pianoDecay: applyParamMultiply('pianoDecay', state.pianoDecay, distance, 0.96, 0.80),
    pianoSustain: applyParamAdd('pianoSustain', state.pianoSustain, distance, -0.04, -0.22),
    pianoHold: applyParamAdd('pianoHold', state.pianoHold, distance, -0.03, -0.18),
    pianoRelease: applyParamMultiply('pianoRelease', state.pianoRelease, distance, 1.12, 1.80),
  };
};

export const getPadDistancePreview = (
  state: SliderState,
  voice: 'pad1' | 'pad2',
  distanceOverride?: number | null,
): VoiceDistancePreview => {
  const distance = resolvePreviewDistance(state, voice, distanceOverride);
  const isPad2 = voice === 'pad2';
  const attackKey = isPad2 ? 'pad2Attack' : 'synthAttack';
  const decayKey = isPad2 ? 'pad2Decay' : 'synthDecay';
  const sustainKey = isPad2 ? 'pad2Sustain' : 'synthSustain';
  const releaseKey = isPad2 ? 'pad2Release' : 'synthRelease';
  const hardnessKey = isPad2 ? 'pad2Hardness' : 'hardness';
  const warmthKey = isPad2 ? 'pad2Warmth' : 'warmth';
  const presenceKey = isPad2 ? 'pad2Presence' : 'presence';
  const minCutoffKey = isPad2 ? 'pad2FilterCutoffMin' : 'filterCutoffMin';
  const maxCutoffKey = isPad2 ? 'pad2FilterCutoffMax' : 'filterCutoffMax';
  const levelKey = isPad2 ? 'pad2Level' : 'synthLevel';
  const reverbKey = isPad2 ? 'pad2ReverbSend' : 'pad1ReverbSend';
  const postLpfKey = isPad2 ? 'pad2PostLPF' : 'padPostLPF';
  const widthKey = isPad2 ? 'pad2StereoWidth' : 'padStereoWidth';
  const diffuseKey = isPad2 ? 'pad2DiffuseSend' : 'padDiffuseSend';

  return {
    [attackKey]: applyAttackParamMultiply(attackKey, state[attackKey], distance, 1.35, 4.0),
    [decayKey]: applyParamMultiply(decayKey, state[decayKey], distance, 1.08, 1.35),
    [sustainKey]: applyParamAdd(sustainKey, state[sustainKey], distance, -0.03, -0.18),
    [releaseKey]: applyParamMultiply(releaseKey, state[releaseKey], distance, 1.18, 2.40),
    [hardnessKey]: applyParamAdd(hardnessKey, state[hardnessKey], distance, -0.04, -0.22),
    [warmthKey]: applyParamAdd(warmthKey, state[warmthKey], distance, 0.04, 0.18),
    [presenceKey]: applyParamAdd(presenceKey, state[presenceKey], distance, -0.05, -0.30),
    [minCutoffKey]: applyParamMultiply(minCutoffKey, state[minCutoffKey], distance, 0.85, 0.45),
    [maxCutoffKey]: applyParamMultiply(maxCutoffKey, state[maxCutoffKey], distance, 0.92, 0.55),
    [levelKey]: applyParamAdd(levelKey, state[levelKey], distance, -0.04, -0.18),
    [reverbKey]: applyParamAdd(reverbKey, state[reverbKey], distance, 0.06, 0.20),
    [postLpfKey]: applyParamMultiply(postLpfKey, state[postLpfKey], distance, 0.90, 0.42),
    [widthKey]: applyParamAdd(widthKey, state[widthKey], distance, -0.06, -0.35),
    [diffuseKey]: applyParamAdd(diffuseKey, state[diffuseKey], distance, 0.12, 0.48),
  };
};

export const applyDistanceValue = (
  key: keyof SliderState,
  state: SliderState,
  voice: DistanceVoice,
  distanceOverride?: number | null,
): number => {
  const distance = clamp(distanceOverride ?? getVoiceDistanceValue(state, voice), 0, 1);
  if (distance <= 1e-4) return state[key] as number;

  switch (key) {
    case 'lead1Level':
      return applyParamAdd('lead1Level', state.lead1Level, distance, -0.05, -0.26);
    case 'lead1ReverbSend':
      return applyParamAdd('lead1ReverbSend', state.lead1ReverbSend, distance, 0.05, 0.18);
    case 'lead1PostLPF':
      return applyParamMultiply('lead1PostLPF', state.lead1PostLPF, distance, 0.88, 0.38);
    case 'lead1StereoWidth':
      return applyParamAdd('lead1StereoWidth', state.lead1StereoWidth, distance, -0.08, -0.42);
    case 'lead1DiffuseSend':
      return applyParamAdd('lead1DiffuseSend', state.lead1DiffuseSend, distance, 0.08, 0.34);
    case 'lead2Level':
      return applyParamAdd('lead2Level', state.lead2Level, distance, -0.06, -0.30);
    case 'lead2ReverbSend':
      return applyParamAdd('lead2ReverbSend', state.lead2ReverbSend, distance, 0.07, 0.22);
    case 'lead2PostLPF':
      return applyParamMultiply('lead2PostLPF', state.lead2PostLPF, distance, 0.84, 0.32);
    case 'lead2StereoWidth':
      return applyParamAdd('lead2StereoWidth', state.lead2StereoWidth, distance, -0.10, -0.50);
    case 'lead2DiffuseSend':
      return applyParamAdd('lead2DiffuseSend', state.lead2DiffuseSend, distance, 0.10, 0.40);
    case 'pianoLevel':
      return applyParamAdd('pianoLevel', state.pianoLevel, distance, -0.05, -0.24);
    case 'pianoReverbSend':
      return applyParamAdd('pianoReverbSend', state.pianoReverbSend, distance, 0.08, 0.24);
    case 'pianoPostLPF':
      return applyParamMultiply('pianoPostLPF', state.pianoPostLPF, distance, 0.82, 0.30);
    case 'pianoStereoWidth':
      return applyParamAdd('pianoStereoWidth', state.pianoStereoWidth, distance, -0.06, -0.28);
    case 'pianoDiffuseSend':
      return applyParamAdd('pianoDiffuseSend', state.pianoDiffuseSend, distance, 0.08, 0.28);
    case 'synthLevel':
      return applyParamAdd('synthLevel', state.synthLevel, distance, -0.04, -0.18);
    case 'pad1ReverbSend':
      return applyParamAdd('pad1ReverbSend', state.pad1ReverbSend, distance, 0.06, 0.20);
    case 'padPostLPF':
      return applyParamMultiply('padPostLPF', state.padPostLPF, distance, 0.90, 0.42);
    case 'padStereoWidth':
      return applyParamAdd('padStereoWidth', state.padStereoWidth, distance, -0.06, -0.35);
    case 'padDiffuseSend':
      return applyParamAdd('padDiffuseSend', state.padDiffuseSend, distance, 0.12, 0.48);
    case 'pad2Level':
      return applyParamAdd('pad2Level', state.pad2Level, distance, -0.04, -0.18);
    case 'pad2ReverbSend':
      return applyParamAdd('pad2ReverbSend', state.pad2ReverbSend, distance, 0.06, 0.20);
    case 'pad2PostLPF':
      return applyParamMultiply('pad2PostLPF', state.pad2PostLPF, distance, 0.90, 0.42);
    case 'pad2StereoWidth':
      return applyParamAdd('pad2StereoWidth', state.pad2StereoWidth, distance, -0.06, -0.35);
    case 'pad2DiffuseSend':
      return applyParamAdd('pad2DiffuseSend', state.pad2DiffuseSend, distance, 0.12, 0.48);
    default:
      return state[key] as number;
  }
};

export const applyPadDistanceToState = (
  state: SliderState,
  voice: 'pad1' | 'pad2',
  distanceOverride?: number | null,
): SliderState => {
  const distance = clamp(distanceOverride ?? getVoiceDistanceValue(state, voice), 0, 1);
  if (distance <= 1e-4) return state;
  const next = { ...state };

  if (voice === 'pad2') {
    next.pad2Attack = applyAttackParamMultiply('pad2Attack', state.pad2Attack, distance, 1.35, 4.0);
    next.pad2Decay = applyParamMultiply('pad2Decay', state.pad2Decay, distance, 1.08, 1.35);
    next.pad2Sustain = applyParamAdd('pad2Sustain', state.pad2Sustain, distance, -0.03, -0.18);
    next.pad2Release = applyParamMultiply('pad2Release', state.pad2Release, distance, 1.18, 2.40);
    next.pad2Hardness = applyParamAdd('pad2Hardness', state.pad2Hardness, distance, -0.04, -0.22);
    next.pad2Warmth = applyParamAdd('pad2Warmth', state.pad2Warmth, distance, 0.04, 0.18);
    next.pad2Presence = applyParamAdd('pad2Presence', state.pad2Presence, distance, -0.05, -0.30);
    next.pad2FilterCutoffMin = applyParamMultiply('pad2FilterCutoffMin', state.pad2FilterCutoffMin, distance, 0.85, 0.45);
    next.pad2FilterCutoffMax = applyParamMultiply('pad2FilterCutoffMax', state.pad2FilterCutoffMax, distance, 0.92, 0.55);
    next.pad2Level = applyParamAdd('pad2Level', state.pad2Level, distance, -0.04, -0.18);
    next.pad2ReverbSend = applyParamAdd('pad2ReverbSend', state.pad2ReverbSend, distance, 0.06, 0.20);
    next.pad2PostLPF = applyParamMultiply('pad2PostLPF', state.pad2PostLPF, distance, 0.90, 0.42);
    next.pad2StereoWidth = applyParamAdd('pad2StereoWidth', state.pad2StereoWidth, distance, -0.06, -0.35);
    next.pad2DiffuseSend = applyParamAdd('pad2DiffuseSend', state.pad2DiffuseSend, distance, 0.12, 0.48);
    return next;
  }

  next.synthAttack = applyAttackParamMultiply('synthAttack', state.synthAttack, distance, 1.35, 4.0);
  next.synthDecay = applyParamMultiply('synthDecay', state.synthDecay, distance, 1.08, 1.35);
  next.synthSustain = applyParamAdd('synthSustain', state.synthSustain, distance, -0.03, -0.18);
  next.synthRelease = applyParamMultiply('synthRelease', state.synthRelease, distance, 1.18, 2.40);
  next.hardness = applyParamAdd('hardness', state.hardness, distance, -0.04, -0.22);
  next.warmth = applyParamAdd('warmth', state.warmth, distance, 0.04, 0.18);
  next.presence = applyParamAdd('presence', state.presence, distance, -0.05, -0.30);
  next.filterCutoffMin = applyParamMultiply('filterCutoffMin', state.filterCutoffMin, distance, 0.85, 0.45);
  next.filterCutoffMax = applyParamMultiply('filterCutoffMax', state.filterCutoffMax, distance, 0.92, 0.55);
  next.synthLevel = applyParamAdd('synthLevel', state.synthLevel, distance, -0.04, -0.18);
  next.pad1ReverbSend = applyParamAdd('pad1ReverbSend', state.pad1ReverbSend, distance, 0.06, 0.20);
  next.padPostLPF = applyParamMultiply('padPostLPF', state.padPostLPF, distance, 0.90, 0.42);
  next.padStereoWidth = applyParamAdd('padStereoWidth', state.padStereoWidth, distance, -0.06, -0.35);
  next.padDiffuseSend = applyParamAdd('padDiffuseSend', state.padDiffuseSend, distance, 0.12, 0.48);
  return next;
};
