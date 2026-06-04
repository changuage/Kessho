import type { SliderState } from '../ui/state';

type GranularSpaceMode = SliderState['granularSpaceMode'];
type GranularPresetBehavior = SliderState['granularPresetBehavior'];
type GranularTensionMode = SliderState['granularTensionMode'];

type VoiceKeys = {
  mode: keyof SliderState;
  scanRate: keyof SliderState;
  blur: keyof SliderState;
  spray: keyof SliderState;
  grainSize: keyof SliderState;
  grainOct: keyof SliderState;
  decay: keyof SliderState;
  attack: keyof SliderState;
  posLFORate: keyof SliderState;
  posLFODepth: keyof SliderState;
  panLFORate: keyof SliderState;
  reverseLFORate: keyof SliderState;
  density: keyof SliderState;
  speed: keyof SliderState;
  pitch: keyof SliderState;
};

const VOICE_KEYS: VoiceKeys[] = [1, 2, 3, 4].map((voice) => ({
  mode: `granularV${voice}Mode` as keyof SliderState,
  scanRate: `granularV${voice}ScanRate` as keyof SliderState,
  blur: `granularV${voice}Blur` as keyof SliderState,
  spray: `granularV${voice}Spray` as keyof SliderState,
  grainSize: `granularV${voice}GrainSize` as keyof SliderState,
  grainOct: `granularV${voice}GrainOct` as keyof SliderState,
  decay: `granularV${voice}Decay` as keyof SliderState,
  attack: `granularV${voice}Attack` as keyof SliderState,
  posLFORate: `granularV${voice}PosLFORate` as keyof SliderState,
  posLFODepth: `granularV${voice}PosLFODepth` as keyof SliderState,
  panLFORate: `granularV${voice}PanLFORate` as keyof SliderState,
  reverseLFORate: `granularV${voice}ReverseLFORate` as keyof SliderState,
  density: `granularV${voice}Density` as keyof SliderState,
  speed: `granularV${voice}Speed` as keyof SliderState,
  pitch: `granularV${voice}Pitch` as keyof SliderState,
}));

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function getEffectiveTension(globalTension: number, mode: GranularTensionMode, value: number): number {
  if (mode === 'bypass') return -1;
  if (mode === 'locked') return clamp(value, 0, 1);
  return clamp(globalTension + value, 0, 1);
}

export type GranularValueResolver = (key: keyof SliderState, fallback: number) => number;

export interface GranularMacroModel {
  spaceMode: GranularSpaceMode;
  presetBehavior: GranularPresetBehavior;
  isPureBehavior: boolean;
  isDiffusePure: boolean;
  smearMacro: number;
  activityMacro: number;
  busDiffusion: number;
  timingRandomness: number;
  directLevelScale: number;
  voiceBlur: number[];
  voiceSpray: number[];
  voiceGrainSize: number[];
  voiceGrainOct: number[];
  voiceDecay: number[];
  voiceAttack: number[];
  voicePosLFORate: number[];
  voicePosLFODepth: number[];
  voicePanLFORate: number[];
  voiceReverseLFORate: number[];
  voiceDensity: number[];
  voiceSpeed: number[];
  voicePitch: number[];
  voiceScanRate: number[];
  baseReverbLPF: number;
  baseOutputLPF: number;
  finalReverbLPF: number;
  finalOutputLPF: number;
  effectiveValues: Partial<Record<keyof SliderState, number>>;
}

export function computeGranularMacroModel(
  state: SliderState,
  resolveValue: GranularValueResolver = (_key, fallback) => fallback,
): GranularMacroModel {
  const spaceMode = state.granularSpaceMode ?? 'clocked';
  const presetBehavior = state.granularPresetBehavior ?? 'expressive';
  const isPureBehavior = presetBehavior === 'pure';
  const isDiffusePure = isPureBehavior && spaceMode === 'diffuse';
  const smearMacro = clamp(
    state.granularDiffusion ?? (spaceMode === 'diffuse' ? 0.62 : 0.28),
    0,
    1,
  );
  const activityMacro = clamp(
    state.granularMacroActivity ?? (spaceMode === 'diffuse' ? 0.44 : 0.28),
    0,
    1,
  );
  const chaosIntent = clamp(state.granularMacroChaos ?? 0.1, 0, 1);
  const busDiffusion = clamp(smearMacro * (spaceMode === 'diffuse' ? 1.0 : 0.72), 0, 1);
  const timingRandomness = clamp(
    0.12 + smearMacro * 0.34 + chaosIntent * 0.32 + (spaceMode === 'diffuse' ? 0.08 : 0),
    0,
    0.95,
  );
  const macroScale = isPureBehavior ? 0.42 : 0.92;
  const activityScale = isPureBehavior ? 1.0 : 1.15;
  const spreadScale = isPureBehavior ? 0.24 : 0.82;
  const tensionScale = isPureBehavior ? 0.34 : 0.9;
  const directLevelScale = isPureBehavior ? 1.08 : 1.22;
  const mActivity = activityMacro * activityScale;
  const mTexture = (state.granularMacroTexture ?? 0.3) * macroScale;
  const mMotion = (state.granularMacroComplexity ?? 0.2) * macroScale;
  const mTone = (state.granularMacroDarkness ?? 0.3) * macroScale;
  const mChaos = (state.granularMacroChaos ?? 0.1) * macroScale;
  const spreadOffsets = [-1.5 * spreadScale, -0.5 * spreadScale, 0.5 * spreadScale, 1.5 * spreadScale];

  const voiceScanRate = VOICE_KEYS.map(({ scanRate }) => resolveValue(scanRate, state[scanRate] as number));
  const rawBlur = VOICE_KEYS.map(({ blur }) => resolveValue(blur, state[blur] as number));
  const rawSpray = VOICE_KEYS.map(({ spray }) => resolveValue(spray, state[spray] as number));
  const rawGrainSize = VOICE_KEYS.map(({ grainSize }) => resolveValue(grainSize, state[grainSize] as number));
  const rawGrainOct = VOICE_KEYS.map(({ grainOct }) => resolveValue(grainOct, state[grainOct] as number));
  const rawDecay = VOICE_KEYS.map(({ decay }) => resolveValue(decay, state[decay] as number));
  const rawAttack = VOICE_KEYS.map(({ attack }) => resolveValue(attack, state[attack] as number));
  const rawPosLFORate = VOICE_KEYS.map(({ posLFORate }) => resolveValue(posLFORate, state[posLFORate] as number));
  const rawPosLFODepth = VOICE_KEYS.map(({ posLFODepth }) => resolveValue(posLFODepth, state[posLFODepth] as number));
  const rawPanLFORate = VOICE_KEYS.map(({ panLFORate }) => resolveValue(panLFORate, state[panLFORate] as number));
  const rawReverseLFORate = VOICE_KEYS.map(({ reverseLFORate }) => resolveValue(reverseLFORate, state[reverseLFORate] as number));
  const rawDensity = VOICE_KEYS.map(({ density }) => resolveValue(density, state[density] as number));
  const rawSpeed = VOICE_KEYS.map(({ speed }) => resolveValue(speed, state[speed] as number));
  const rawPitch = VOICE_KEYS.map(({ pitch }) => Math.round(resolveValue(pitch, state[pitch] as number)));

  const voiceBlur = [...rawBlur];
  const voiceSpray = [...rawSpray];
  const voiceGrainSize = [...rawGrainSize];
  const voiceGrainOct = [...rawGrainOct];
  const voiceDecay = [...rawDecay];
  const voiceAttack = [...rawAttack];
  const voicePosLFORate = [...rawPosLFORate];
  const voicePosLFODepth = [...rawPosLFODepth];
  const voicePanLFORate = [...rawPanLFORate];
  const voiceReverseLFORate = [...rawReverseLFORate];
  const voiceDensity = [...rawDensity];
  const voiceSpeed = [...rawSpeed];
  const voicePitch = [...rawPitch];
  const effectiveValues: Partial<Record<keyof SliderState, number>> = {};

  for (let voiceIndex = 0; voiceIndex < 4; voiceIndex++) {
    const keys = VOICE_KEYS[voiceIndex]!;
    const spread = spreadOffsets[voiceIndex]!;
    const rawBlurValue = rawBlur[voiceIndex]!;
    const rawSprayValue = rawSpray[voiceIndex]!;
    const rawGrainSizeValue = rawGrainSize[voiceIndex]!;
    const rawGrainOctValue = rawGrainOct[voiceIndex]!;
    const rawDecayValue = rawDecay[voiceIndex]!;
    const rawAttackValue = rawAttack[voiceIndex]!;
    const rawPosLFORateValue = rawPosLFORate[voiceIndex]!;
    const rawPosLFODepthValue = rawPosLFODepth[voiceIndex]!;
    const rawPanLFORateValue = rawPanLFORate[voiceIndex]!;
    const rawReverseLFORateValue = rawReverseLFORate[voiceIndex]!;
    const rawDensityValue = rawDensity[voiceIndex]!;
    const rawSpeedValue = rawSpeed[voiceIndex]!;
    const rawPitchValue = rawPitch[voiceIndex]!;
    const voiceMode = state[keys.mode] as SliderState['granularV1Mode'];
    const isScanMode = rawSpeedValue === 0;

    const textureQuadratic = mTexture * mTexture;
    const textureBlurScale = isScanMode ? 0.15 : 1.0;
    voiceBlur[voiceIndex] = clamp(
      rawBlurValue + (textureQuadratic * 0.72 + spread * mTexture * 0.14 * 0.72) * textureBlurScale,
      0,
      1,
    );
    voiceSpray[voiceIndex] = clamp(rawSprayValue, 0, 1);
    voiceGrainSize[voiceIndex] = clamp(rawGrainSizeValue + textureQuadratic * 72 + spread * mTexture * 0.04 * 320, 10, 500);
    voiceGrainOct[voiceIndex] = clamp(rawGrainOctValue + textureQuadratic * 0.22 + spread * mTexture * 0.08 * 0.22, 0, 1);
    voiceDecay[voiceIndex] = clamp(rawDecayValue + mTexture * 0.38 + spread * mTexture * 0.08 * 1.6, 0.01, 4);

    const activityQuadratic = mActivity * mActivity;
    const activityReach = Math.pow(activityMacro, isPureBehavior ? 0.72 : 0.64);
    if (voiceMode !== 'clean') {
      const densityTarget = 64;
      const sizeTarget = voiceMode === 'legacy' ? 300 : 380;
      const blurTarget = voiceMode === 'legacy' ? 0.42 : 0.58;
      const decayTarget = voiceMode === 'legacy' ? 1.8 : 2.5;
      const currentDecay = voiceDecay[voiceIndex] ?? rawDecayValue;
      const currentDensity = voiceDensity[voiceIndex] ?? rawDensityValue;
      const currentBlur = voiceBlur[voiceIndex] ?? rawBlurValue;
      const currentSize = voiceGrainSize[voiceIndex] ?? rawGrainSizeValue;
      voiceDecay[voiceIndex] = clamp(
        Math.max(
          currentDecay + mActivity * 0.7 + activityQuadratic * 0.85,
          currentDecay + (decayTarget - currentDecay) * activityReach * 0.72,
        ),
        0.01,
        4,
      );
      voiceDensity[voiceIndex] = clamp(
        currentDensity + mActivity * 20 + activityQuadratic * 14 + spread * mActivity * 0.05 * 24,
        1,
        64,
      );
      const activityDensity = voiceDensity[voiceIndex] ?? currentDensity;
      voiceDensity[voiceIndex] = clamp(
        activityDensity + (densityTarget - activityDensity) * activityReach * 0.94,
        1,
        64,
      );
      voiceBlur[voiceIndex] = clamp(
        Math.max(
          currentBlur + activityQuadratic * 0.08,
          currentBlur + (blurTarget - currentBlur) * activityReach * 0.34,
        ),
        0,
        1,
      );
      voiceGrainSize[voiceIndex] = clamp(currentSize + mActivity * 48 + activityQuadratic * 110, 10, 500);
      const activityGrainSize = voiceGrainSize[voiceIndex] ?? currentSize;
      voiceGrainSize[voiceIndex] = clamp(
        activityGrainSize + (sizeTarget - activityGrainSize) * activityReach * 0.58,
        10,
        500,
      );
    }

    const motionQuadratic = mMotion * mMotion;
    if (isScanMode) {
      voicePosLFORate[voiceIndex] = clamp(rawPosLFORateValue + mMotion * 0.24, 0, 1);
      voicePosLFODepth[voiceIndex] = clamp(rawPosLFODepthValue + mMotion * 0.18, 0, 1);
    } else {
      voicePosLFORate[voiceIndex] = clamp(rawPosLFORateValue + motionQuadratic * 0.82 + spread * mMotion * 0.22 * 0.82, 0, 1);
      voicePosLFODepth[voiceIndex] = clamp(rawPosLFODepthValue + mMotion * 0.92 + spread * mMotion * 0.18 * 0.92, 0, 1);
    }
    voicePanLFORate[voiceIndex] = clamp(rawPanLFORateValue + mMotion * 0.82 + spread * mMotion * 0.22 * 0.82, 0, 1);
    voiceSpeed[voiceIndex] = isScanMode ? 0 : rawSpeedValue;
    voicePitch[voiceIndex] = rawPitchValue;

    const chaosQuadratic = mChaos * mChaos;
    const currentGrainOct = voiceGrainOct[voiceIndex] ?? rawGrainOctValue;
    voiceReverseLFORate[voiceIndex] = clamp(rawReverseLFORateValue + chaosQuadratic * 1.1 + spread * mChaos * 0.72 * 1.1, 0, 1);
    voiceGrainOct[voiceIndex] = clamp(currentGrainOct + mChaos * (isPureBehavior ? 0.06 : 0.14), 0, 1);

    const tension = getEffectiveTension(
      state.tension ?? 0.3,
      state.granularTensionMode ?? 'bypass',
      state.granularTensionValue ?? 0,
    );
    if (tension >= 0) {
      const tensionInverse = 1 - tension;
      const tensionInverseScaled = tensionInverse * tensionScale;
      const tensionScaled = tension * tensionScale;
      const currentDecay = voiceDecay[voiceIndex] ?? rawDecayValue;
      const currentDensity = voiceDensity[voiceIndex] ?? rawDensityValue;
      const currentBlur = voiceBlur[voiceIndex] ?? rawBlurValue;
      const currentPitch = voicePitch[voiceIndex] ?? rawPitchValue;
      const currentGrainOctAfterTension = voiceGrainOct[voiceIndex] ?? rawGrainOctValue;
      const tensionAttack = rawAttackValue * (tensionInverseScaled * 0.4 + 0.6) + tensionInverseScaled * 0.3;
      voiceAttack[voiceIndex] = clamp(tensionAttack, 0.003, 1);
      voiceDecay[voiceIndex] = clamp(currentDecay + tensionInverseScaled * 0.8, 0.01, 4);
      voiceDensity[voiceIndex] = clamp(currentDensity * (tensionInverseScaled * 0.3 + 0.7) + tensionInverseScaled * 3, 1, 64);
      voiceBlur[voiceIndex] = clamp(
        currentBlur + tensionInverseScaled * 0.15 * (isScanMode ? 0.15 : 1.0),
        0,
        1,
      );
      voiceGrainOct[voiceIndex] = clamp(currentGrainOctAfterTension + tensionScaled * 0.1, 0, 1);
      if (!isScanMode && !isPureBehavior) {
        voicePitch[voiceIndex] = clamp(
          Math.round((currentPitch + (tension - 0.5) * spread * 6 * tensionScale) / 12) * 12,
          -24,
          24,
        );
      }
    }

    if (isDiffusePure && voiceMode === 'granular') {
      voiceAttack[voiceIndex] = Math.max(0.045, voiceAttack[voiceIndex] ?? rawAttackValue);
      voiceDecay[voiceIndex] = Math.max(0.6, voiceDecay[voiceIndex] ?? rawDecayValue);
      voiceBlur[voiceIndex] = clamp(Math.max(0.24, voiceBlur[voiceIndex] ?? rawBlurValue), 0, 0.82);
      voiceSpray[voiceIndex] = clamp(rawSprayValue, 0, 1);
      voiceGrainOct[voiceIndex] = Math.min(0.06, voiceGrainOct[voiceIndex] ?? rawGrainOctValue);
      voiceDensity[voiceIndex] = Math.max(10, voiceDensity[voiceIndex] ?? rawDensityValue);
      voiceGrainSize[voiceIndex] = Math.max(120, voiceGrainSize[voiceIndex] ?? rawGrainSizeValue);
    }

    if (voiceMode === 'granular') {
      const currentAttack = voiceAttack[voiceIndex] ?? rawAttackValue;
      const currentDecay = voiceDecay[voiceIndex] ?? rawDecayValue;
      const currentBlur = voiceBlur[voiceIndex] ?? rawBlurValue;
      const currentDensity = voiceDensity[voiceIndex] ?? rawDensityValue;
      const currentSize = voiceGrainSize[voiceIndex] ?? rawGrainSizeValue;
      voiceAttack[voiceIndex] = Math.max(currentAttack, 0.014 + smearMacro * 0.11);
      voiceDecay[voiceIndex] = Math.max(currentDecay, 0.22 + smearMacro * 1.1);
      voiceBlur[voiceIndex] = clamp(currentBlur + smearMacro * (spaceMode === 'diffuse' ? 0.42 : 0.28), 0, 1);
      voiceDensity[voiceIndex] = clamp(
        Math.max(currentDensity, currentDensity + smearMacro * (spaceMode === 'diffuse' ? 4 : 2)),
        1,
        64,
      );
      voiceGrainSize[voiceIndex] = clamp(
        Math.max(currentSize, currentSize + smearMacro * (spaceMode === 'diffuse' ? 56 : 34)),
        10,
        500,
      );
    }

    effectiveValues[keys.attack] = voiceAttack[voiceIndex];
    effectiveValues[keys.decay] = voiceDecay[voiceIndex];
    effectiveValues[keys.blur] = voiceBlur[voiceIndex];
    effectiveValues[keys.grainOct] = voiceGrainOct[voiceIndex];
    effectiveValues[keys.spray] = voiceSpray[voiceIndex];
    effectiveValues[keys.density] = voiceDensity[voiceIndex];
    effectiveValues[keys.grainSize] = voiceGrainSize[voiceIndex];
    effectiveValues[keys.posLFORate] = voicePosLFORate[voiceIndex];
    effectiveValues[keys.posLFODepth] = voicePosLFODepth[voiceIndex];
    effectiveValues[keys.panLFORate] = voicePanLFORate[voiceIndex];
    effectiveValues[keys.reverseLFORate] = voiceReverseLFORate[voiceIndex];
    effectiveValues[keys.speed] = voiceSpeed[voiceIndex];
    effectiveValues[keys.pitch] = voicePitch[voiceIndex];
  }

  const userGranularReverbLPF = state.granularReverbLPF ?? 4000;
  const userGranularOutputLPF = state.granularOutputLPF ?? 12000;
  const shapedBaseReverbLPF = isDiffusePure
    ? Math.max(220, Math.min(userGranularReverbLPF, userGranularReverbLPF * 0.62))
    : userGranularReverbLPF;
  const shapedBaseOutputLPF = isDiffusePure
    ? Math.max(300, Math.min(userGranularOutputLPF, userGranularOutputLPF * 0.68))
    : userGranularOutputLPF;
  const baseReverbLPF = Math.max(
    220,
    Math.min(shapedBaseReverbLPF, shapedBaseReverbLPF * (1 - smearMacro * (spaceMode === 'diffuse' ? 0.24 : 0.14))),
  );
  const baseOutputLPF = Math.max(
    300,
    Math.min(shapedBaseOutputLPF, shapedBaseOutputLPF * (1 - smearMacro * (spaceMode === 'diffuse' ? 0.18 : 0.1))),
  );

  let finalReverbLPF = baseReverbLPF;
  let finalOutputLPF = baseOutputLPF;
  if (mTone > 0.01) {
    const darkFilterScale = isPureBehavior
      ? Math.pow(1 - mTone * 0.58, 1.35)
      : Math.pow(1 - mTone * 0.78, 2.0);
    finalReverbLPF = Math.max(200, Math.min(baseReverbLPF, 12000 * darkFilterScale));
    finalOutputLPF = Math.max(200, Math.min(baseOutputLPF, 12000 * darkFilterScale));
  }

  effectiveValues.granularReverbLPF = finalReverbLPF;
  effectiveValues.granularOutputLPF = finalOutputLPF;

  return {
    spaceMode,
    presetBehavior,
    isPureBehavior,
    isDiffusePure,
    smearMacro,
    activityMacro,
    busDiffusion,
    timingRandomness,
    directLevelScale,
    voiceBlur,
    voiceSpray,
    voiceGrainSize,
    voiceGrainOct,
    voiceDecay,
    voiceAttack,
    voicePosLFORate,
    voicePosLFODepth,
    voicePanLFORate,
    voiceReverseLFORate,
    voiceDensity,
    voiceSpeed,
    voicePitch,
    voiceScanRate,
    baseReverbLPF,
    baseOutputLPF,
    finalReverbLPF,
    finalOutputLPF,
    effectiveValues,
  };
}
