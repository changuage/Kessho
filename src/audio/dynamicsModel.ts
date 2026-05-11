import type { SliderState } from '../ui/state';

export type DynamicsContributionMatrix = {
  randomHold: number;
  smoothDrift: number;
  sineWow: number;
  flutterJitter: number;
  envelopeBloom: number;
  cascadedFilter: number;
  bbdColor: number;
  materialWear: number;
  aliasDamage: number;
  crossPatch: number;
};

export type DynamicsRoutingTargets = {
  characterPathActive: boolean;
  degradeWorkletActive: boolean;
  allpassStackActive: boolean;
  endChainActive: boolean;
};

export type DynamicsTargets = {
  routing: DynamicsRoutingTargets;
  mode: SliderState['characterMode'];
  modeActive: boolean;
  shallowFlavor: number;
  abyssFlavor: number;
  characterEnabled: boolean;
  degradeEnabled: boolean;
  dry: number;
  wet: number;
  characterMix: number;
  degradeMix: number;
  degradeWetRatio: number;
  rawDegradeAge: number;
  rawDegradeGeneration: number;
  rawDegradeAlias: number;
  workletAlias: number;
  rawCorrosion: number;
  rawMediaWear: number;
  damage: number;
  depth: number;
  rate: number;
  damp: number;
  randomDrift: number;
  randomHoldRateHz: number;
  randomHoldLag: number;
  randomDelayDepth: number;
  randomSpreadDelayDepth: number;
  randomFilterDepth: number;
  randomSpreadFilterDepth: number;
  stereo: number;
  baseDelay: number;
  spreadBaseDelay: number;
  noiseGain: number;
  jitterDepth: number;
  randomDriftFilterHz: number;
  randomDriftDepth: number;
  mainPan: number;
  spreadPan: number;
  mainDelayGain: number;
  spreadDelayGain: number;
  wowFrequency: number;
  flutterFrequency: number;
  flutterRandomDepth: number;
  wowDepth: number;
  flutterDepth: number;
  highpassHz: number;
  highpassQ: number;
  allpassAFrequency: number;
  allpassAQ: number;
  allpassBFrequency: number;
  allpassBQ: number;
  headBumpFrequency: number;
  headBumpQ: number;
  headBumpGain: number;
  dropoutFilterHz: number;
  dropoutDepth: number;
  dropoutGain: number;
  envFilterHz: number;
  envToLowpassGain: number;
  envToResonanceGain: number;
  envToWetGain: number;
  lowpassHz: number;
  lowpassQ: number;
  lowpassStage2Hz: number;
  lowpassStage2Q: number;
  compressorThreshold: number;
  compressorKnee: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  compressorMakeup: number;
  saturation: number;
  corrosion: number;
  masterSatActive: boolean;
  masterSatMode: number;
  masterSatDrive: number;
  masterSatTone: number;
  masterSatBias: number;
  endDry: number;
  endWet: number;
  endMakeup: number;
  endThreshold: number;
  endKnee: number;
  endRatio: number;
  endAttack: number;
  endRelease: number;
  endDetectorHpHz: number;
  endDetectorTilt: number;
  endAutoMakeup: number;
  endProgramRelease: number;
};

export const DYNAMICS_DEGRADE_LEGACY_KEY_MAP = {
  degradeWow: 'characterWow',
  degradeFlutter: 'characterFlutter',
  degradeDrift: 'characterDrift',
  degradeTone: 'characterTone',
  degradeHp: 'characterHp',
  degradeLp: 'characterLp',
  degradeNoise: 'characterNoise',
  degradeSaturation: 'characterSaturation',
  degradeCorrosion: 'characterCorrosion',
} as const satisfies Partial<Record<keyof SliderState, keyof SliderState>>;

export function normalizeDynamicsDegradeAliases(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  for (const [canonical, legacy] of Object.entries(DYNAMICS_DEGRADE_LEGACY_KEY_MAP)) {
    if (!(canonical in next) && next[legacy] !== undefined) {
      next[canonical] = next[legacy];
    }
  }
  if (!('degradeHp' in next) && next.characterWetHp !== undefined) {
    next.degradeHp = next.characterWetHp;
  }
  return next;
}

function clampUnitInterval(value: number | undefined): number {
  const safeValue = Number.isFinite(value) ? (value as number) : 0;
  if (safeValue <= 0) return 0;
  if (safeValue >= 1) return 1;
  return safeValue;
}

function mapUnitToLogFrequency(value: number, minHz: number, maxHz: number): number {
  const t = clampUnitInterval(value);
  return minHz * Math.pow(maxHz / minHz, t);
}

function mapWaterBiasFloor(value: number, minHz: number, pedalMaxHz: number, creativeMaxHz: number): number {
  const t = clampUnitInterval(value);
  const pedalZone = 0.72;
  if (t <= pedalZone) {
    const local = t / pedalZone;
    return minHz * Math.pow(pedalMaxHz / minHz, local);
  }
  const local = (t - pedalZone) / (1 - pedalZone);
  return pedalMaxHz * Math.pow(creativeMaxHz / pedalMaxHz, local);
}

function resolveDynamicsContributionMatrix(args: {
  mode: SliderState['characterMode'];
  characterEnabled: boolean;
  degradeEnabled: boolean;
  characterMix: number;
  degradeMix: number;
  degradeAge: number;
  degradeGeneration: number;
  degradeAlias: number;
  corrosion: number;
}): DynamicsContributionMatrix {
  const character = args.characterEnabled ? clampUnitInterval(args.characterMix) : 0;
  const degrade = args.degradeEnabled ? Math.sqrt(clampUnitInterval(args.degradeMix)) : 0;
  const abyss = args.mode === 'abyssWater' ? character : 0;
  const shallow = args.mode === 'shallowWater' ? character : 0;
  const clean = args.mode === 'clean' ? character : 0;
  const materialWear = clampUnitInterval((args.degradeAge * 0.72 + args.degradeGeneration * 0.58) * degrade);
  const aliasDamage = clampUnitInterval((args.degradeAlias * 0.9 + args.corrosion * 0.42) * degrade);
  const crossPatch = clampUnitInterval(aliasDamage * (0.4 + args.corrosion * 0.8));

  return {
    randomHold: clampUnitInterval(abyss * 0.88 + shallow * 0.82 + clean * 0.34 + materialWear * 0.08 + crossPatch * 0.28),
    smoothDrift: clampUnitInterval(abyss * 0.56 + shallow * 0.78 + clean * 0.3 + materialWear * 0.44 + crossPatch * 0.24),
    sineWow: clampUnitInterval(clean * 0.18 + shallow * 0.12 + abyss * 0.1 + materialWear * 0.08 + crossPatch * 0.08),
    flutterJitter: clampUnitInterval(abyss * 0.18 + shallow * 0.34 + materialWear * 0.12 + aliasDamage * (0.22 + crossPatch * 0.58)),
    envelopeBloom: clampUnitInterval(abyss * 0.72 + shallow * 0.22 + clean * 0.08),
    cascadedFilter: clampUnitInterval(abyss * 0.52 + shallow * 0.56 + clean * 0.18 + materialWear * 0.18),
    bbdColor: clampUnitInterval(shallow * 0.7 + abyss * 0.16 + materialWear * 0.1 + aliasDamage * 0.12),
    materialWear,
    aliasDamage,
    crossPatch,
  };
}

export function resolveDynamicsTargets(state: SliderState, sampleRate = 44100): DynamicsTargets {
  const characterEnabled = Boolean(state.dynamicsEnabled && state.characterEnabled);
  const degradeEnabled = Boolean(state.dynamicsEnabled && state.degradeEnabled);
  const rawMode = state.characterMode;
  const mode: SliderState['characterMode'] =
    characterEnabled && (rawMode === 'abyssWater' || rawMode === 'shallowWater') ? rawMode : 'clean';
  const modeDefaults = {
    clean: { mix: 0, age: 0, hp: 0, lp: 1, resonance: 0.2, depth: 0.12, rate: 0.2, damp: 0.5, bias: 0.78, lpgAmount: 0.08, wetHp: 0 },
    abyssWater: { mix: 0.36, age: 0.06, hp: 0, lp: 0.96, resonance: 0.18, depth: 0.33, rate: 0.08, damp: 0.33, bias: 0.38, lpgAmount: 0.84, wetHp: 0 },
    shallowWater: { mix: 0.42, age: 0.18, hp: 0, lp: 0.94, resonance: 0.24, depth: 0.82, rate: 0.16, damp: 0.65, bias: 0.44, lpgAmount: 0.68, wetHp: 0 },
  } satisfies Record<SliderState['characterMode'], Record<string, number>>;
  const defaults = modeDefaults[mode];
  const modeActive = mode !== 'clean';
  const cleanFlavor = mode === 'clean' ? 1 : 0;
  const shallowFlavor = mode === 'shallowWater' ? 1 : 0;
  const abyssFlavor = mode === 'abyssWater' ? 1 : 0;
  const characterMix = characterEnabled ? clampUnitInterval(state.characterMix) : 0;
  const characterBias = characterEnabled ? clampUnitInterval(state.characterBias ?? defaults.bias) : defaults.bias;
  const characterLpgAmount = characterEnabled ? clampUnitInterval(state.characterLpgAmount ?? defaults.lpgAmount) : defaults.lpgAmount;
  const degradeMix = degradeEnabled ? clampUnitInterval(state.degradeMix ?? 0) : 0;
  const sharedFilterActive = characterEnabled || degradeEnabled;
  const baseWet = clampUnitInterval(1 - (1 - characterMix) * (1 - degradeMix));
  const degradeInfluence = Math.sqrt(degradeMix);
  const baseDry = 1 - baseWet;
  const characterAge = characterEnabled ? Math.max(clampUnitInterval(state.characterAge), modeActive ? defaults.age : 0) : 0;
  const rawDegradeAge = degradeEnabled ? clampUnitInterval(state.degradeAge ?? 0) : 0;
  const rawDegradeGeneration = degradeEnabled ? clampUnitInterval(state.degradeGeneration ?? 0) : 0;
  const rawDegradeAlias = degradeEnabled ? clampUnitInterval(state.degradeAlias ?? 0) : 0;
  const baseDegradeWow = degradeEnabled ? clampUnitInterval(state.degradeWow) : 0;
  const baseDegradeFlutter = degradeEnabled ? clampUnitInterval(state.degradeFlutter) : 0;
  const baseDegradeDrift = degradeEnabled ? clampUnitInterval(state.degradeDrift) : 0;
  const degradeWobbleSpeed = degradeEnabled ? clampUnitInterval(state.degradeWobbleSpeed ?? 0.35) : 0.35;
  const degradeAge = rawDegradeAge * degradeInfluence;
  const degradeGeneration = rawDegradeGeneration * degradeInfluence;
  const degradeAlias = rawDegradeAlias * degradeInfluence;
  const rawMediaWear = clampUnitInterval(rawDegradeAge + rawDegradeGeneration * 0.42);
  const mediaWear = clampUnitInterval(degradeAge + degradeGeneration * 0.42);
  const rawCorrosion = degradeEnabled ? clampUnitInterval(state.degradeCorrosion) : 0;
  const contribution = resolveDynamicsContributionMatrix({
    mode,
    characterEnabled,
    degradeEnabled,
    characterMix,
    degradeMix,
    degradeAge: rawDegradeAge,
    degradeGeneration: rawDegradeGeneration,
    degradeAlias: rawDegradeAlias,
    corrosion: rawCorrosion,
  });

  const modSources = {
    slow: degradeEnabled ? degradeInfluence * clampUnitInterval(baseDegradeWow * 0.22 + baseDegradeDrift * 0.34 + rawDegradeAge * 0.2 + rawDegradeGeneration * 0.18 + contribution.smoothDrift * 0.18) : 0,
    flutter: degradeEnabled ? degradeInfluence * clampUnitInterval(baseDegradeFlutter * 0.55 + contribution.flutterJitter * 0.24 + rawDegradeGeneration * 0.08) : 0,
    random: degradeEnabled ? degradeInfluence * clampUnitInterval(baseDegradeDrift * 0.3 + contribution.randomHold * 0.44 + rawMediaWear * 0.22) : 0,
    env: degradeEnabled ? degradeInfluence * clampUnitInterval(state.characterEnvFollow ?? 0) : 0,
    noise: degradeEnabled ? degradeInfluence * clampUnitInterval((state.degradeNoise ?? 0) * 0.64 + rawCorrosion * 0.18 + rawDegradeAlias * 0.12) : 0,
  };
  const modRoute = (keys: {
    slow: keyof SliderState;
    flutter: keyof SliderState;
    random: keyof SliderState;
    env: keyof SliderState;
    noise: keyof SliderState;
  }) => clampUnitInterval(
    modSources.slow * clampUnitInterval(state[keys.slow] as number | undefined) +
    modSources.flutter * clampUnitInterval(state[keys.flutter] as number | undefined) +
    modSources.random * clampUnitInterval(state[keys.random] as number | undefined) +
    modSources.env * clampUnitInterval(state[keys.env] as number | undefined) +
    modSources.noise * clampUnitInterval(state[keys.noise] as number | undefined),
  );
  const modWow = modRoute({
    slow: 'degradeModSlowWow',
    flutter: 'degradeModFlutterWow',
    random: 'degradeModRandomWow',
    env: 'degradeModEnvWow',
    noise: 'degradeModNoiseWow',
  });
  const modFlutter = modRoute({
    slow: 'degradeModSlowFlutter',
    flutter: 'degradeModFlutterFlutter',
    random: 'degradeModRandomFlutter',
    env: 'degradeModEnvFlutter',
    noise: 'degradeModNoiseFlutter',
  });
  const modLp = modRoute({
    slow: 'degradeModSlowLp',
    flutter: 'degradeModFlutterLp',
    random: 'degradeModRandomLp',
    env: 'degradeModEnvLp',
    noise: 'degradeModNoiseLp',
  });
  const modWet = modRoute({
    slow: 'degradeModSlowWet',
    flutter: 'degradeModFlutterWet',
    random: 'degradeModRandomWet',
    env: 'degradeModEnvWet',
    noise: 'degradeModNoiseWet',
  });
  const modDropout = modRoute({
    slow: 'degradeModSlowDropout',
    flutter: 'degradeModFlutterDropout',
    random: 'degradeModRandomDropout',
    env: 'degradeModEnvDropout',
    noise: 'degradeModNoiseDropout',
  });
  const modAlias = modRoute({
    slow: 'degradeModSlowAlias',
    flutter: 'degradeModFlutterAlias',
    random: 'degradeModRandomAlias',
    env: 'degradeModEnvAlias',
    noise: 'degradeModNoiseAlias',
  });

  const workletAlias = clampUnitInterval(rawDegradeAlias + modAlias * 0.18);
  const shapedAlias = clampUnitInterval(degradeAlias + modAlias * 0.08);
  const digitalDamage = clampUnitInterval(shapedAlias * 0.46 + degradeGeneration * 0.22);
  const damage = clampUnitInterval(degradeMix * (degradeAge * 0.32 + degradeGeneration * 0.18 + shapedAlias * 0.08 + rawCorrosion * degradeInfluence * 0.12));
  const age = clampUnitInterval(Math.max(characterAge, mediaWear * (0.38 + degradeMix * 0.52)));
  const depth = characterEnabled ? Math.max(clampUnitInterval(state.characterDepth), modeActive ? defaults.depth : 0) : 0;
  const rate = characterEnabled ? Math.max(clampUnitInterval(state.characterRate), modeActive ? defaults.rate : 0) : 0;
  const damp = characterEnabled ? Math.max(clampUnitInterval(state.characterDamp), modeActive ? defaults.damp : 0.5) : 0.5;
  const stereo = characterEnabled ? clampUnitInterval(state.characterStereo ?? 0.5) : 0;
  const envFollow = characterEnabled ? clampUnitInterval(state.characterEnvFollow ?? 0) : 0;
  const lpgResponse = modeActive
    ? clampUnitInterval(characterLpgAmount * (0.4 + envFollow * 0.6))
    : clampUnitInterval(characterLpgAmount * (0.12 + envFollow * 0.4));
  const rawWow = clampUnitInterval(baseDegradeWow * degradeInfluence * (0.95 + contribution.crossPatch * 0.22) + modWow * 0.2);
  const rawFlutter = clampUnitInterval(baseDegradeFlutter * degradeInfluence * (0.38 + contribution.crossPatch * 0.18) + modFlutter * 0.08);
  const rawDrift = baseDegradeDrift * degradeInfluence;
  const waterCyclicBias = cleanFlavor ? 0.11 : shallowFlavor ? 0.026 : abyssFlavor ? 0.02 : 0.11;
  const waterSineScale = cleanFlavor ? 0.62 : shallowFlavor ? 0.24 : abyssFlavor ? 0.18 : 0.18;
  const modeWow = depth * (waterCyclicBias + contribution.sineWow * waterSineScale);
  const modeFlutter = depth * (0.02 + contribution.flutterJitter * 0.12);
  const flutterDamage = contribution.materialWear * 0.014 + contribution.aliasDamage * (0.018 + contribution.crossPatch * 0.074);
  const cyclicModeScale = cleanFlavor
    ? 1
    : shallowFlavor
      ? 0.34 + degradeMix * 0.08
      : abyssFlavor
        ? 0.28 + degradeMix * 0.07
        : modeActive
          ? 0.56 + degradeMix * 0.14
          : 1;
  const cyclicFlutterScale = cleanFlavor
    ? 1
    : shallowFlavor
      ? 0.54 + degradeMix * 0.1
      : abyssFlavor
        ? 0.42 + degradeMix * 0.08
        : modeActive
          ? 0.74 + degradeMix * 0.12
          : 1;
  const cyclicWow = clampUnitInterval(rawWow + modeWow * cyclicModeScale);
  const flutter = clampUnitInterval(rawFlutter + modeFlutter + flutterDamage);
  const cyclicFlutter = clampUnitInterval(rawFlutter + modeFlutter * cyclicFlutterScale);
  const abyssPitchMotionTrim = abyssFlavor ? 0.72 : 1;
  const drift = clampUnitInterval(rawDrift + depth * (0.06 + contribution.smoothDrift * 0.32) + contribution.materialWear * 0.22 + contribution.crossPatch * 0.12 + modWow * 0.06);
  const tapeWanderDepth = degradeEnabled
    ? rawDrift * 0.0021 + contribution.materialWear * 0.0011 + contribution.aliasDamage * 0.00032 + modWow * 0.00085
    : 0;
  const tapeFlutterDepth = degradeEnabled
    ? rawFlutter * 0.00022 + contribution.materialWear * 0.00009 + contribution.aliasDamage * 0.0001 + modFlutter * 0.0002
    : 0;
  const cleanTapePitchFocus = cleanFlavor * degradeMix * clampUnitInterval(baseDegradeWow + baseDegradeDrift * 0.15 + modWow * 0.45);
  const cleanTapeSerialWeight = clampUnitInterval(cleanTapePitchFocus * 3.2);
  const dry = baseDry * (1 - cleanTapeSerialWeight);
  const wet = clampUnitInterval(1 - dry);
  const degradeWetRatio = wet > 0.0001 ? clampUnitInterval(degradeMix / wet) : 0;
  const cyclicWowDepthScale = cleanFlavor
    ? 0.012 + depth * 0.01 + rate * 0.005 + cleanTapePitchFocus * 0.012
    : 0.006 + depth * 0.0045 + rate * 0.0018 + shallowFlavor * 0.0015 + abyssFlavor * 0.001 + degradeMix * 0.0012;
  const wowDepthBase = (
    cyclicWow * cyclicWowDepthScale +
    tapeWanderDepth
  ) * (
    0.58 +
    depth * (1.45 + shallowFlavor * 0.36 + abyssFlavor * 0.28 + cleanFlavor * 0.55) +
    contribution.crossPatch * 0.4 +
    cleanTapePitchFocus * 1.6 +
    rate * (0.14 + shallowFlavor * 0.18 + abyssFlavor * 0.12 + cleanFlavor * 0.24)
  );
  const wowCeilingBoost = 1 + baseDegradeWow;
  const wowDepth = wowDepthBase * wowCeilingBoost * abyssPitchMotionTrim;
  const flutterDepth = (
    cyclicFlutter * (0.00072 + cleanTapePitchFocus * 0.00024) +
    tapeFlutterDepth
  ) * (
    0.28 +
    depth * (0.52 + shallowFlavor * 0.18 + abyssFlavor * 0.12 + cleanFlavor * 0.28) +
    contribution.crossPatch * 0.48 +
    cleanTapePitchFocus * 0.34 +
    rate * (0.05 + shallowFlavor * 0.09 + abyssFlavor * 0.06 + cleanFlavor * 0.08)
  ) * abyssPitchMotionTrim;
  const corrosion = clampUnitInterval(rawCorrosion * degradeInfluence * 0.72 + degradeGeneration * 0.035 + shapedAlias * 0.025);
  const sharedHp = sharedFilterActive ? clampUnitInterval(state.degradeHp) : 0;
  const sharedLp = sharedFilterActive ? clampUnitInterval(state.degradeLp) : 1;
  const hp = Math.max(sharedHp, damage * 0.025 + corrosion * 0.012);
  const lpCeiling = Math.max(0.08, 1 - damage * 0.2 - corrosion * 0.1 - mediaWear * degradeMix * 0.08 - digitalDamage * 0.05 - modLp * 0.08);
  const lp = Math.max(0.08, Math.min(sharedLp, lpCeiling));
  const resonance = characterEnabled ? Math.max(clampUnitInterval(state.characterResonance), modeActive ? defaults.resonance : 0.2) : 0.2;
  const damageActivity = degradeEnabled
    ? clampUnitInterval(rawDegradeAge + rawDegradeGeneration + rawDegradeAlias + rawCorrosion + clampUnitInterval(state.degradeNoise) + clampUnitInterval(state.degradeSaturation))
    : 0;
  const noise = degradeEnabled ? clampUnitInterval(clampUnitInterval(state.degradeNoise) * degradeInfluence * 0.55 + degradeMix * (mediaWear * 0.025 + digitalDamage * 0.012)) : 0;
  const characterDrive = characterEnabled
    ? characterMix * (shallowFlavor * 0.07 + abyssFlavor * (0.06 + clampUnitInterval(state.characterEnvFollow ?? 0) * 0.04) + characterAge * 0.06)
    : 0;
  const degradeNonlinearColor = degradeEnabled
    ? clampUnitInterval(degradeGeneration * 0.015 + shapedAlias * 0.012 + corrosion * 0.018)
    : 0;
  const saturation = clampUnitInterval(
    (degradeEnabled ? clampUnitInterval(state.degradeSaturation) * degradeInfluence * 0.55 + degradeNonlinearColor : 0) +
    characterDrive,
  );
  const tone = 0.5 + ((degradeEnabled ? clampUnitInterval(state.degradeTone ?? 0.5) : 0.5) - 0.5) * degradeInfluence;
  const dropout = damageActivity > 0.0001
    ? clampUnitInterval(degradeMix * (mediaWear * 0.25 + corrosion * 0.28 + degradeGeneration * 0.06 + noise * 0.08 + rawDegradeAlias * 0.035) + modDropout * 0.16)
    : 0;
  const waterRandomDrive = cleanFlavor * 0.06 + shallowFlavor * 0.28 + abyssFlavor * 0.34;
  const randomDrift = clampUnitInterval(
    contribution.randomHold * (0.42 + stereo * 0.24) +
    contribution.smoothDrift * 0.18 +
    envFollow * contribution.envelopeBloom * 0.12 +
    contribution.crossPatch * 0.16 +
    modFlutter * 0.24 +
    waterRandomDrive,
  );
  const characterHoldRateHz = mode === 'shallowWater'
    ? 0.16 + rate * 1.75 + depth * 0.4
    : mode === 'abyssWater'
      ? 0.1 + rate * 1.15 + depth * 0.26 + envFollow * 0.04
      : 0.12 + rate * 1.05 + depth * 0.32;
  const degradeMotionWeight = degradeEnabled ? clampUnitInterval(degradeWetRatio * (0.65 + degradeInfluence * 0.35)) : 0;
  const degradeHoldRateHz = 0.02 + degradeWobbleSpeed * 0.58 + rawDrift * 0.11 + contribution.materialWear * 0.075 + contribution.aliasDamage * 0.035;
  const randomHoldRateHz = characterHoldRateHz + (degradeHoldRateHz - characterHoldRateHz) * degradeMotionWeight;
  const characterHoldLag = mode === 'shallowWater'
    ? 0.08 + damp * 0.52
    : mode === 'abyssWater'
      ? 0.12 + damp * 0.68
      : 0.1 + damp * 0.58;
  const degradeHoldLag = Math.max(0.18, 1.3 - degradeWobbleSpeed * 0.98 + rawMediaWear * (0.2 + (1 - degradeWobbleSpeed) * 0.16));
  const randomHoldLag = characterHoldLag + (degradeHoldLag - characterHoldLag) * degradeMotionWeight;
  const degradeLevelTrim = degradeEnabled
    ? Math.max(0.7, 1 - degradeWetRatio * (0.12 + rawMediaWear * 0.12 + rawCorrosion * 0.16 + rawDegradeAlias * 0.1))
    : 1;
  const cleanCombTame = cleanFlavor * clampUnitInterval(degradeMix * (0.85 + contribution.materialWear * 0.35 + contribution.aliasDamage * 0.18));
  const cleanBaseDelay = 0.00035 + age * 0.0012 + drift * 0.0006;
  const cleanTamedBaseDelay = 0.00014 + age * 0.00045 + drift * 0.00024;
  const cleanTapeDelayHeadroom = cleanFlavor * cleanTapePitchFocus * Math.min(0.085, 0.009 + wowDepth * 1.2 + flutterDepth * 3.2);
  const baseDelay = cleanFlavor
    ? Math.max(cleanBaseDelay + (cleanTamedBaseDelay - cleanBaseDelay) * cleanCombTame, cleanTapeDelayHeadroom)
    : 0.0025 + shallowFlavor * 0.0038 + abyssFlavor * 0.0012 + age * 0.009 + drift * 0.004 + contribution.bbdColor * 0.0018;
  const cleanSpreadDelay = Math.min(0.012, baseDelay + stereo * (0.0012 + depth * 0.0012) + drift * 0.0004);
  const cleanTamedSpreadDelay = Math.min(0.006, baseDelay + stereo * (0.00055 + depth * 0.00065) + drift * 0.00016);
  const spreadBaseDelay = cleanFlavor
    ? cleanSpreadDelay + (cleanTamedSpreadDelay - cleanSpreadDelay) * cleanCombTame
    : Math.min(0.095, baseDelay + 0.0012 + stereo * (0.006 + shallowFlavor * 0.006) + drift * 0.0015);
  const randomDelayDepth = cleanFlavor
    ? randomDrift * (0.00008 + depth * 0.0018 + rate * 0.00065 + modFlutter * 0.00018 + contribution.materialWear * 0.00024 + contribution.aliasDamage * 0.00011)
    : shallowFlavor
      ? randomDrift * (0.00095 + depth * 0.0104 + rate * 0.0009 + contribution.bbdColor * 0.0024)
      : randomDrift * (0.00032 + depth * 0.0042 + rate * 0.00072 + contribution.bbdColor * 0.0009);
  const randomSpreadDelayDepth = randomDelayDepth * (0.68 + stereo * 0.56 + shallowFlavor * 0.3 + abyssFlavor * 0.22);
  const randomFilterDepth = abyssFlavor
    ? randomDrift * (20 + depth * 130 + rate * 34) + modLp * 88
    : shallowFlavor
      ? randomDrift * (56 + depth * 460 + rate * 62) + modLp * 128
      : randomDrift * (18 + depth * 160 + rate * 48) + modLp * 78;
  const randomSpreadFilterDepth = randomFilterDepth * (0.55 + stereo * 0.32);
  const nyquistSafeLp = sampleRate * 0.45;
  const biasFloorHz = cleanFlavor
    ? mapUnitToLogFrequency(characterBias, 500, 12000)
    : shallowFlavor
      ? mapWaterBiasFloor(characterBias, 140, 220, 1800)
      : mapWaterBiasFloor(characterBias, 130, 205, 1200);
  const lowpassCeilingHz = Math.min(
    20000,
    nyquistSafeLp,
    mapUnitToLogFrequency(lp, 1000, 20000) * (0.82 + tone * 0.38) * (1 - contribution.bbdColor * 0.1) * (1 - modLp * 0.05),
  );
  const lowpassBaseHz = Math.min(
    20000,
    nyquistSafeLp,
    lowpassCeilingHz,
    biasFloorHz * (0.9 + tone * 0.18) * (1 - contribution.bbdColor * 0.05),
  );
  const lowpassOpenHeadroomHz = Math.max(0, lowpassCeilingHz - lowpassBaseHz);
  const lowpassHz = Math.min(
    20000,
    nyquistSafeLp,
    lowpassBaseHz,
  );
  const characterWowFrequency = cleanFlavor
    ? 0.03 + rate * 0.48 + depth * 0.12 + drift * 0.1
    : 0.052 + rate * 0.82 + depth * 0.16 + drift * 0.28;
  const degradeWowFrequency = cleanFlavor
    ? 0.012 + Math.pow(degradeWobbleSpeed, 1.35) * 0.11 + drift * 0.035 + contribution.materialWear * 0.025 + modWow * 0.018
    : 0.018 + degradeWobbleSpeed * 0.36 + drift * 0.12 + contribution.materialWear * 0.05 + modWow * 0.04;
  const wowFrequency = characterWowFrequency + (degradeWowFrequency - characterWowFrequency) * degradeMotionWeight;
  const endEnabled = Boolean(state.dynamicsEnabled && state.endCompEnabled);
  const endWet = endEnabled ? clampUnitInterval(state.endCompMix ?? 1) : 0;
  const masterSatActive = Boolean(state.dynamicsEnabled && state.dynamicsSaturationEnabled);
  const masterSatDrive = masterSatActive ? clampUnitInterval(state.dynamicsSaturationDrive ?? 0) : 0;
  const masterSatTone = clampUnitInterval(state.dynamicsSaturationTone ?? 0.5);
  const masterSatBias = clampUnitInterval(state.dynamicsSaturationBias ?? 0.5);
  const masterSatModeMap = {
    clean: 0,
    tape: 1,
    tube: 2,
    diode: 3,
    fold: 4,
  } satisfies Record<SliderState['dynamicsSaturationMode'], number>;
  const masterSatMode = masterSatModeMap[state.dynamicsSaturationMode ?? 'clean'] ?? 0;

  return {
    routing: {
      characterPathActive: wet > 0.0001 || masterSatDrive > 0.0001 || (endEnabled && endWet > 0.0001),
      degradeWorkletActive: degradeEnabled && degradeWetRatio > 0.0001,
      allpassStackActive: false,
      endChainActive: endEnabled && endWet > 0.0001,
    },
    mode,
    modeActive,
    shallowFlavor,
    abyssFlavor,
    characterEnabled,
    degradeEnabled,
    dry,
    wet,
    characterMix,
    degradeMix,
    degradeWetRatio,
    rawDegradeAge,
    rawDegradeGeneration,
    rawDegradeAlias,
    workletAlias,
    rawCorrosion,
    rawMediaWear,
    damage,
    depth,
    rate,
    damp,
    randomDrift,
    randomHoldRateHz,
    randomHoldLag,
    randomDelayDepth,
    randomSpreadDelayDepth,
    randomFilterDepth,
    randomSpreadFilterDepth,
    stereo,
    baseDelay,
    spreadBaseDelay,
    noiseGain: Math.min(0.018, wet * noise * (0.006 + age * 0.014 + corrosion * 0.012)) * degradeLevelTrim,
    jitterDepth: damageActivity > 0.0001
      ? degradeMix * (contribution.flutterJitter * 0.00008 + corrosion * 0.00006 + contribution.materialWear * 0.00005 + clampUnitInterval(contribution.aliasDamage * 0.46 + contribution.crossPatch * 0.4) * 0.00004 + modFlutter * 0.00011)
      : 0,
    randomDriftFilterHz: Math.max(0.08, randomHoldRateHz * (0.92 - damp * 0.58)),
    randomDriftDepth: randomDrift * (0.00016 + drift * 0.00225 + contribution.materialWear * 0.00215 + contribution.aliasDamage * 0.00075 + contribution.crossPatch * 0.00105 + modWow * 0.00095) * abyssPitchMotionTrim,
    mainPan: -stereo * (0.25 + shallowFlavor * 0.18),
    spreadPan: stereo * (0.58 + shallowFlavor * 0.24),
    mainDelayGain: (1 - stereo * (0.14 + shallowFlavor * 0.12)) * (1 - cleanCombTame * 0.08) * degradeLevelTrim,
    spreadDelayGain: stereo * (cleanFlavor ? (0.05 + depth * 0.12) * (1 - cleanCombTame * 0.34) : 0.16 + depth * (0.4 + shallowFlavor * 0.18)) * degradeLevelTrim,
    wowFrequency,
    flutterFrequency: 2.4 + rate * (6.2 + shallowFlavor * 4.2 + abyssFlavor * 2.2) + flutter * (4.6 + corrosion * 3),
    flutterRandomDepth: degradeMix * clampUnitInterval(0.2 + modFlutter * 1.8 + contribution.flutterJitter * 0.5 + corrosion * 0.25) * (0.00004 + flutter * 0.00082 + modFlutter * 0.00048),
    wowDepth,
    flutterDepth,
    highpassHz: mapUnitToLogFrequency(hp, 20, 2400),
    highpassQ: 0.7 + resonance * 1.5,
    allpassAFrequency: 260 + shallowFlavor * 520 + depth * 380 + age * 240,
    allpassAQ: 0.25 + contribution.bbdColor * 1.4 + shallowFlavor * 0.1 + resonance * (abyssFlavor ? 0.18 : 1.1),
    allpassBFrequency: 900 + shallowFlavor * 2100 + depth * 680 + age * 420 + contribution.bbdColor * 320,
    allpassBQ: 0.25 + contribution.bbdColor * 1.8 + shallowFlavor * 0.1 + resonance * (abyssFlavor ? 0.14 : 0.85),
    headBumpFrequency: 80 + mediaWear * 45 + corrosion * 20,
    headBumpQ: 0.55 + mediaWear * 0.55,
    headBumpGain: degradeMix * 1.1 * (0.2 + mediaWear * 0.65) * degradeLevelTrim + characterMix * (abyssFlavor * 0.28 + shallowFlavor * 0.22),
    dropoutFilterHz: 0.25 + mediaWear * 1.8 + corrosion * 4.5 + digitalDamage * 1.2 + modDropout * 2.2,
    dropoutDepth: dropout * 0.16,
    dropoutGain: 1 - dropout * 0.14,
    envFilterHz: 2.5 + envFollow * 26 + rate * 12,
    envToLowpassGain: contribution.envelopeBloom * lpgResponse * lowpassOpenHeadroomHz * (abyssFlavor ? 0.88 + depth * 0.28 + resonance * 0.1 : shallowFlavor ? 0.76 + depth * 0.26 + resonance * 0.08 : 0.18 + depth * 0.12) + modLp * 120,
    envToResonanceGain: contribution.envelopeBloom * lpgResponse * (abyssFlavor ? 0.12 + resonance * 0.24 : shallowFlavor ? 0.06 + resonance * 0.16 : 0.02),
    envToWetGain: contribution.envelopeBloom * lpgResponse * characterMix * (abyssFlavor ? 0.08 : shallowFlavor ? 0.045 : 0.012) + modWet * degradeMix * 0.03,
    lowpassHz,
    lowpassQ: 0.7 + resonance * (cleanFlavor ? 0.45 + contribution.cascadedFilter * 0.2 : abyssFlavor ? 0.5 + contribution.cascadedFilter * 0.28 : 0.9 + contribution.cascadedFilter * 0.42),
    lowpassStage2Hz: modeActive ? Math.min(20000, nyquistSafeLp) : lowpassHz,
    lowpassStage2Q: modeActive ? 0.707 : 0.7 + resonance * 0.2,
    compressorThreshold: characterEnabled ? -16 - characterMix * (shallowFlavor * 10 + abyssFlavor * 7) : -4,
    compressorKnee: 10 + shallowFlavor * 10 + abyssFlavor * 8,
    compressorRatio: 1.2 + shallowFlavor * 0.8 + abyssFlavor * 0.9 + envFollow * abyssFlavor * 0.35,
    compressorAttack: 0.004 + shallowFlavor * 0.014 + abyssFlavor * 0.003,
    compressorRelease: 0.12 + shallowFlavor * 0.1 + abyssFlavor * 0.18 + damp * 0.08,
    compressorMakeup: 1 + characterMix * (shallowFlavor * 0.05 + abyssFlavor * 0.16),
    saturation,
    corrosion,
    masterSatActive,
    masterSatMode,
    masterSatDrive,
    masterSatTone,
    masterSatBias,
    endDry: endEnabled ? 1 - endWet : 1,
    endWet,
    endMakeup: endEnabled ? Math.max(0.05, Math.min(8, state.endCompMakeup ?? 1)) : 1,
    endThreshold: state.endCompThreshold ?? -18,
    endKnee: Math.max(0, state.endCompKnee ?? 12),
    endRatio: Math.max(1, state.endCompRatio ?? 2),
    endAttack: Math.max(0.0001, (state.endCompAttackMs ?? 10) / 1000),
    endRelease: Math.max(0.02, (state.endCompReleaseMs ?? 180) / 1000),
    endDetectorHpHz: mapUnitToLogFrequency(state.endCompDetectorHp ?? 0.25, 20, 360),
    endDetectorTilt: clampUnitInterval(state.endCompDetectorTilt ?? 0.5),
    endAutoMakeup: clampUnitInterval(state.endCompAutoMakeup ?? 0),
    endProgramRelease: clampUnitInterval(state.endCompProgramRelease ?? 0),
  };
}
