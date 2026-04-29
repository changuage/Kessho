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
  rawCorrosion: number;
  rawMediaWear: number;
  damage: number;
  depth: number;
  rate: number;
  damp: number;
  randomDrift: number;
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
  endDry: number;
  endWet: number;
  endMakeup: number;
  endThreshold: number;
  endKnee: number;
  endRatio: number;
  endAttack: number;
  endRelease: number;
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
    randomHold: clampUnitInterval(abyss * 0.86 + shallow * 0.52 + clean * 0.08 + materialWear * 0.08 + crossPatch * 0.28),
    smoothDrift: clampUnitInterval(abyss * 0.48 + shallow * 0.54 + clean * 0.12 + materialWear * 0.44 + crossPatch * 0.24),
    sineWow: clampUnitInterval(abyss * 0.1 + shallow * 0.42 + materialWear * 0.16 + crossPatch * 0.2),
    flutterJitter: clampUnitInterval(abyss * 0.08 + shallow * 0.24 + materialWear * 0.12 + aliasDamage * (0.22 + crossPatch * 0.58)),
    envelopeBloom: clampUnitInterval(abyss * 0.92 + shallow * 0.16 + clean * 0.04),
    cascadedFilter: clampUnitInterval(abyss * 0.9 + shallow * 0.44 + clean * 0.08 + materialWear * 0.18),
    bbdColor: clampUnitInterval(shallow * 0.58 + abyss * 0.08 + materialWear * 0.1 + aliasDamage * 0.12),
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
    clean: { mix: 0, age: 0, hp: 0, lp: 1, resonance: 0.2, depth: 0.12, rate: 0.2, damp: 0.5 },
    abyssWater: { mix: 0.36, age: 0.12, hp: 0.03, lp: 0.58, resonance: 0.68, depth: 0.72, rate: 0.18, damp: 0.8 },
    shallowWater: { mix: 0.42, age: 0.18, hp: 0.02, lp: 0.78, resonance: 0.48, depth: 0.82, rate: 0.16, damp: 0.65 },
  } satisfies Record<SliderState['characterMode'], Record<string, number>>;
  const defaults = modeDefaults[mode];
  const modeActive = mode !== 'clean';
  const shallowFlavor = mode === 'shallowWater' ? 1 : 0;
  const abyssFlavor = mode === 'abyssWater' ? 1 : 0;
  const characterMix = characterEnabled ? clampUnitInterval(state.characterMix) : 0;
  const degradeMix = degradeEnabled ? clampUnitInterval(state.degradeMix ?? 0) : 0;
  const wet = clampUnitInterval(1 - (1 - characterMix) * (1 - degradeMix));
  const degradeWetRatio = wet > 0.0001 ? clampUnitInterval(degradeMix / wet) : 0;
  const degradeInfluence = Math.sqrt(degradeMix);
  const dry = 1 - wet;
  const characterAge = characterEnabled ? Math.max(clampUnitInterval(state.characterAge), modeActive ? defaults.age : 0) : 0;
  const rawDegradeAge = degradeEnabled ? clampUnitInterval(state.degradeAge ?? 0) : 0;
  const rawDegradeGeneration = degradeEnabled ? clampUnitInterval(state.degradeGeneration ?? 0) : 0;
  const rawDegradeAlias = degradeEnabled ? clampUnitInterval(state.degradeAlias ?? 0) : 0;
  const degradeAge = rawDegradeAge * degradeInfluence;
  const degradeGeneration = rawDegradeGeneration * degradeInfluence;
  const degradeAlias = rawDegradeAlias * degradeInfluence;
  const rawMediaWear = clampUnitInterval(rawDegradeAge + rawDegradeGeneration * 0.42);
  const mediaWear = clampUnitInterval(degradeAge + degradeGeneration * 0.42);
  const digitalDamage = clampUnitInterval(degradeAlias * 0.46 + degradeGeneration * 0.22);
  const damage = clampUnitInterval(degradeMix * (0.1 + degradeAge * 0.32 + degradeGeneration * 0.18 + degradeAlias * 0.08));
  const age = clampUnitInterval(Math.max(characterAge, mediaWear * (0.38 + degradeMix * 0.52)));
  const depth = characterEnabled ? Math.max(clampUnitInterval(state.characterDepth), modeActive ? defaults.depth : 0) : 0;
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
  const rawWow = (degradeEnabled ? clampUnitInterval(state.degradeWow) : 0) * degradeInfluence * (0.54 + contribution.crossPatch * 0.28);
  const rawFlutter = (degradeEnabled ? clampUnitInterval(state.degradeFlutter) : 0) * degradeInfluence * (0.5 + contribution.crossPatch * 0.36);
  const rawDrift = (degradeEnabled ? clampUnitInterval(state.degradeDrift) : 0) * degradeInfluence;
  const modeWow = depth * (0.08 + contribution.sineWow * 0.5);
  const modeFlutter = depth * (0.02 + contribution.flutterJitter * 0.12);
  const wowDamage = contribution.materialWear * 0.025 + contribution.aliasDamage * 0.018;
  const flutterDamage = contribution.materialWear * 0.014 + contribution.aliasDamage * (0.018 + contribution.crossPatch * 0.074);
  const cyclicModeScale = modeActive ? 0.38 + degradeMix * 0.12 : 1;
  const cyclicWow = clampUnitInterval(rawWow + modeWow * cyclicModeScale + wowDamage);
  const flutter = clampUnitInterval(rawFlutter + modeFlutter + flutterDamage);
  const cyclicFlutter = clampUnitInterval(rawFlutter + modeFlutter * (modeActive ? 0.55 + degradeMix * 0.1 : 1) + flutterDamage);
  const drift = clampUnitInterval(rawDrift + depth * (0.06 + contribution.smoothDrift * 0.32) + contribution.materialWear * 0.22 + contribution.crossPatch * 0.12);
  const corrosion = clampUnitInterval(rawCorrosion * degradeInfluence * 0.72 + damage * 0.09 + degradeGeneration * 0.035);
  const degradeHp = (degradeEnabled ? clampUnitInterval(state.degradeHp) : 0) * degradeInfluence;
  const degradeLp = 1 - (1 - (degradeEnabled ? clampUnitInterval(state.degradeLp) : 1)) * degradeInfluence;
  const hp = Math.max(degradeHp, modeActive ? defaults.hp : 0, damage * 0.08 + corrosion * 0.03);
  const lpCeiling = Math.max(0.08, 1 - damage * 0.2 - corrosion * 0.1 - mediaWear * degradeMix * 0.08 - digitalDamage * 0.05);
  const lp = Math.max(0.08, Math.min(degradeLp, modeActive ? defaults.lp : 1, lpCeiling));
  const resonance = characterEnabled ? Math.max(clampUnitInterval(state.characterResonance), modeActive ? defaults.resonance : 0.2) : 0.2;
  const noise = degradeEnabled ? clampUnitInterval(clampUnitInterval(state.degradeNoise) * degradeInfluence * 0.55 + degradeMix * (mediaWear * 0.025 + digitalDamage * 0.012)) : 0;
  const characterDrive = characterEnabled
    ? characterMix * (shallowFlavor * 0.07 + abyssFlavor * (0.14 + clampUnitInterval(state.characterEnvFollow ?? 0) * 0.08) + characterAge * 0.06)
    : 0;
  const saturation = clampUnitInterval(
    (degradeEnabled ? clampUnitInterval(state.degradeSaturation) * degradeInfluence * 0.55 + damage * 0.06 + degradeGeneration * 0.015 : 0) +
    characterDrive,
  );
  const rate = characterEnabled ? Math.max(clampUnitInterval(state.characterRate), modeActive ? defaults.rate : 0) : 0;
  const damp = characterEnabled ? Math.max(clampUnitInterval(state.characterDamp), modeActive ? defaults.damp : 0.5) : 0.5;
  const tone = 0.5 + ((degradeEnabled ? clampUnitInterval(state.degradeTone ?? 0.5) : 0.5) - 0.5) * degradeInfluence;
  const stereo = characterEnabled ? clampUnitInterval(state.characterStereo ?? 0.5) : 0;
  const envFollow = characterEnabled ? clampUnitInterval(state.characterEnvFollow ?? 0) : 0;
  const dropout = clampUnitInterval(degradeMix * (mediaWear * 0.17 + corrosion * 0.22 + degradeGeneration * 0.035 + noise * 0.06));
  const randomDrift = clampUnitInterval(
    contribution.randomHold * (0.42 + stereo * 0.24) +
    contribution.smoothDrift * 0.18 +
    envFollow * contribution.envelopeBloom * 0.12 +
    contribution.crossPatch * 0.16,
  );
  const baseDelay = 0.0025 + shallowFlavor * 0.0038 + abyssFlavor * 0.0012 + age * 0.009 + drift * 0.004 + contribution.bbdColor * 0.0018;
  const spreadBaseDelay = Math.min(0.095, baseDelay + 0.0012 + stereo * (0.006 + shallowFlavor * 0.006) + drift * 0.0015);
  const nyquistSafeLp = sampleRate * 0.45;
  const lowpassHz = Math.min(
    20000,
    nyquistSafeLp,
    mapUnitToLogFrequency(lp, 700, 20000) * (0.72 + tone * 0.56) * (1 - damp * 0.12),
  );
  const endEnabled = Boolean(state.dynamicsEnabled && state.endCompEnabled);
  const endWet = endEnabled ? clampUnitInterval(state.endCompMix ?? 1) : 0;

  return {
    routing: {
      characterPathActive: wet > 0.0001,
      degradeWorkletActive: degradeEnabled && degradeWetRatio > 0.0001,
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
    rawCorrosion,
    rawMediaWear,
    damage,
    depth,
    rate,
    damp,
    randomDrift,
    stereo,
    baseDelay,
    spreadBaseDelay,
    noiseGain: Math.min(0.018, wet * noise * (0.006 + age * 0.014 + corrosion * 0.012)),
    jitterDepth: degradeMix * (0.00001 + contribution.flutterJitter * 0.00007 + corrosion * 0.00006 + contribution.materialWear * 0.000045 + clampUnitInterval(contribution.aliasDamage * 0.46 + contribution.crossPatch * 0.4) * 0.000035),
    randomDriftFilterHz: 0.04 + drift * 0.45 + rate * 0.18 + contribution.smoothDrift * 0.32 + contribution.crossPatch * 0.18,
    randomDriftDepth: randomDrift * (0.00014 + drift * 0.0012 + contribution.materialWear * 0.0007 + contribution.crossPatch * 0.0009),
    mainPan: -stereo * (0.25 + shallowFlavor * 0.18),
    spreadPan: stereo * (0.58 + shallowFlavor * 0.24),
    mainDelayGain: 1 - stereo * (0.14 + shallowFlavor * 0.12),
    spreadDelayGain: stereo * (0.16 + depth * (0.4 + shallowFlavor * 0.18)),
    wowFrequency: 0.03 + rate * 0.45 + drift * 0.18 + contribution.materialWear * 0.08,
    flutterFrequency: 2.8 + rate * (7 + shallowFlavor * 4 + abyssFlavor * 1.5) + flutter * (6 + corrosion * 4),
    wowDepth: (0.00016 + cyclicWow * 0.0062 + drift * 0.0022 + age * 0.0009) * (0.38 + depth * (0.78 + shallowFlavor * 0.18 + abyssFlavor * 0.06) + contribution.crossPatch * 0.34),
    flutterDepth: (0.000012 + cyclicFlutter * 0.00115 + corrosion * 0.0002) * (0.28 + depth * (0.42 + shallowFlavor * 0.12) + contribution.crossPatch * 0.68),
    highpassHz: mapUnitToLogFrequency(hp, 20, 2400),
    highpassQ: 0.7 + resonance * 1.5,
    allpassAFrequency: 260 + shallowFlavor * 520 + abyssFlavor * 180 + depth * 380 + age * 240,
    allpassAQ: 0.35 + contribution.bbdColor * 1.4 + abyssFlavor * 0.5 + resonance * 1.1,
    allpassBFrequency: 900 + shallowFlavor * 2100 + abyssFlavor * 520 + depth * 680 + age * 420 + contribution.bbdColor * 320,
    allpassBQ: 0.35 + contribution.bbdColor * 1.8 + abyssFlavor * 0.45 + resonance * 0.85,
    headBumpFrequency: 80 + mediaWear * 45 + corrosion * 20,
    headBumpQ: 0.55 + mediaWear * 0.55,
    headBumpGain: degradeMix * 1.8 * (0.2 + mediaWear * 0.65) + characterMix * (abyssFlavor * 1.15 + shallowFlavor * 0.22),
    dropoutFilterHz: 0.8 + mediaWear * 8 + corrosion * 18 + digitalDamage * 2,
    dropoutDepth: dropout * 0.08,
    dropoutGain: 1 - dropout * 0.07,
    envFilterHz: 2.5 + envFollow * 26 + rate * 12,
    envToLowpassGain: envFollow * contribution.envelopeBloom * (900 + depth * 3400 + resonance * 2200),
    envToWetGain: envFollow * contribution.envelopeBloom * characterMix * 0.09,
    lowpassHz,
    lowpassQ: 0.7 + resonance * (3.2 + contribution.cascadedFilter * 2.6),
    lowpassStage2Hz: lowpassHz * (0.92 - abyssFlavor * 0.12 - contribution.materialWear * 0.08 + shallowFlavor * 0.04),
    lowpassStage2Q: 0.7 + resonance * (1.1 + contribution.cascadedFilter * 1.7),
    compressorThreshold: characterEnabled ? -16 - characterMix * (shallowFlavor * 10 + abyssFlavor * 18) : -4,
    compressorKnee: 10 + shallowFlavor * 10 + abyssFlavor * 16,
    compressorRatio: 1.2 + shallowFlavor * 0.8 + abyssFlavor * 2.2 + envFollow * abyssFlavor * 0.8,
    compressorAttack: 0.004 + shallowFlavor * 0.014 + abyssFlavor * 0.003,
    compressorRelease: 0.12 + shallowFlavor * 0.1 + abyssFlavor * 0.18 + damp * 0.08,
    compressorMakeup: 1 + characterMix * (shallowFlavor * 0.05 + abyssFlavor * 0.16),
    saturation,
    corrosion,
    endDry: endEnabled ? 1 - endWet : 1,
    endWet,
    endMakeup: endEnabled ? Math.max(0.05, Math.min(8, state.endCompMakeup ?? 1)) : 1,
    endThreshold: state.endCompThreshold ?? -18,
    endKnee: Math.max(0, state.endCompKnee ?? 12),
    endRatio: Math.max(1, state.endCompRatio ?? 2),
    endAttack: Math.max(0.0001, (state.endCompAttackMs ?? 10) / 1000),
    endRelease: Math.max(0.02, (state.endCompReleaseMs ?? 180) / 1000),
  };
}
