import { calculateDriftedRoot } from '../audio/harmony';
import { clampMorphPosition, isAtEndpoint0, isAtEndpoint1, selectDiscreteMorphEndpoint } from '../audio/morphUtils';
import { getMorphedRootNote } from '../ui/CircleOfFifths';
import {
  DEFAULT_STATE,
  getParamInfo,
  getSliderNumericValue,
  type SliderMode,
  type SliderState,
} from '../ui/state';
import { normalizeDegradeReverbCrossfeed, normalizeDegradeReverbCrossfeedRanges } from '../ui/routing';
import { normalizePresetForWeb } from '../presets/statePresetRuntime';
import { normalizeDualSliderConfig, type DualSliderConfig } from '../ui/sliderSystem/dualConfigReducer';
import { normalizeSliderMode } from '../ui/sliderSystem/sliderCapabilities';
import type { DualSliderState } from './nativeDualRanges';
import {
  BOOLEAN_MORPH_KEYS,
  DISCRETE_MORPH_KEYS,
  DYNAMICS_FADE_BY_MODULE,
  DYNAMICS_TOGGLE_KEYS,
  ENGINE_TOGGLE_KEYS,
  NUMERIC_MORPH_KEYS,
  PARENT_CHILD_MAP,
  ROUTER_MATRIX_BY_ENGINE,
} from './morphRoutingTables';

export type MorphInterpolationPreset = {
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
  dualSliderConfigs?: Partial<Record<string, DualSliderConfig>>;
};

export type MorphInterpolationResult = {
  state: SliderState;
  endpointStateA: SliderState;
  endpointStateB: SliderState;
  dualRanges: DualSliderState;
  dualModes: Record<string, SliderMode>;
  dualConfigs: Record<string, DualSliderConfig>;
  morphCoFInfo?: {
    isMorphing: boolean;
    startRoot: number;
    effectiveRoot: number;
    targetRoot: number;
    cofStep: number;
    totalSteps: number;
  };
};

type PreparedDualMorphMetadata = {
  rangeA?: { min: number; max: number };
  rangeB?: { min: number; max: number };
  valueA: number;
  valueB: number;
  modeA?: SliderMode;
  modeB?: SliderMode;
  configA?: DualSliderConfig;
  configB?: DualSliderConfig;
};

export type PreparedMorphPair = {
  stateA: SliderState;
  stateB: SliderState;
  routerZeroSide: Map<keyof SliderState, 'A' | 'B'>;
  dynamicsZeroSide: Map<keyof SliderState, 'A' | 'B'>;
  allDualKeys: Set<string>;
  dualMetadata: Map<string, PreparedDualMorphMetadata>;
  keysToSnap: Set<keyof SliderState>;
};

export function prepareMorphPair(
  presetA: MorphInterpolationPreset,
  presetB: MorphInterpolationPreset,
): PreparedMorphPair {
  const stateA = {
    ...DEFAULT_STATE,
    ...normalizePresetForWeb(presetA.state),
  };
  const stateB = {
    ...DEFAULT_STATE,
    ...normalizePresetForWeb(presetB.state),
  };

  const routerZeroSide = new Map<keyof SliderState, 'A' | 'B'>();
  for (const entry of ROUTER_MATRIX_BY_ENGINE) {
    const onA = entry.isOn(stateA);
    const onB = entry.isOn(stateB);
    if (onA === onB) continue;
    const offSide: 'A' | 'B' = onA ? 'B' : 'A';
    for (const childKey of entry.keys) {
      if (!routerZeroSide.has(childKey)) routerZeroSide.set(childKey, offSide);
    }
  }

  const dynamicsZeroSide = new Map<keyof SliderState, 'A' | 'B'>();
  for (const entry of DYNAMICS_FADE_BY_MODULE) {
    const onA = entry.isOn(stateA);
    const onB = entry.isOn(stateB);
    if (onA === onB) continue;
    dynamicsZeroSide.set(entry.fadeKey, onA ? 'B' : 'A');
  }

  const dualRangesA = presetA.dualRanges || {};
  const dualRangesB = presetB.dualRanges || {};
  const rawModesA = presetA.sliderModes || {};
  const rawModesB = presetB.sliderModes || {};
  const rawConfigsA = presetA.dualSliderConfigs || {};
  const rawConfigsB = presetB.dualSliderConfigs || {};
  const allDualKeys = new Set([
    ...Object.keys(dualRangesA),
    ...Object.keys(dualRangesB),
    ...Object.keys(rawConfigsA),
    ...Object.keys(rawConfigsB),
  ]);

  const dualMetadata = new Map<string, PreparedDualMorphMetadata>();
  for (const keyStr of allDualKeys) {
    const key = keyStr as keyof SliderState;
    const configA = rawConfigsA[keyStr];
    const configB = rawConfigsB[keyStr];
    let rangeA = configA ? { min: configA.range[0], max: configA.range[1] } : dualRangesA[keyStr];
    let rangeB = configB ? { min: configB.range[0], max: configB.range[1] } : dualRangesB[keyStr];
    const info = getParamInfo(key);
    const fallbackValue = info ? (info.min + info.max) * 0.5 : 0;
    let valueA = getSliderNumericValue(key, stateA[key]) ?? fallbackValue;
    let valueB = getSliderNumericValue(key, stateB[key]) ?? fallbackValue;

    const offSide = routerZeroSide.get(key) ?? dynamicsZeroSide.get(key);
    if (offSide === 'A') {
      valueA = 0;
      rangeA = undefined;
    } else if (offSide === 'B') {
      valueB = 0;
      rangeB = undefined;
    }

    const configModeA = configA
      ? (configA.source === 'a' ? stateA.modulationSourceA : stateA.modulationSourceB).type
      : undefined;
    const configModeB = configB
      ? (configB.source === 'a' ? stateB.modulationSourceA : stateB.modulationSourceB).type
      : undefined;
    const modeA = normalizeSliderMode(keyStr, configModeA || rawModesA[keyStr] || (rangeA ? 'walk' : undefined));
    const modeB = normalizeSliderMode(keyStr, configModeB || rawModesB[keyStr] || (rangeB ? 'sampleHold' : undefined));
    dualMetadata.set(keyStr, { rangeA, rangeB, valueA, valueB, modeA, modeB, configA, configB });
  }

  const keysToSnap = new Set<keyof SliderState>();
  for (const [parentKey, childKeys] of Object.entries(PARENT_CHILD_MAP)) {
    const parentA = stateA[parentKey as keyof SliderState];
    const parentB = stateB[parentKey as keyof SliderState];
    if (parentA && parentB) continue;
    for (const childKey of childKeys) {
      if (!routerZeroSide.has(childKey)) keysToSnap.add(childKey);
    }
  }

  return {
    stateA,
    stateB,
    routerZeroSide,
    dynamicsZeroSide,
    allDualKeys,
    dualMetadata,
    keysToSnap,
  };
}

type MorphEndpointContentRefs = Pick<MorphInterpolationPreset, 'state' | 'dualRanges' | 'sliderModes' | 'dualSliderConfigs'>;

function endpointContentRefs(preset: MorphInterpolationPreset): MorphEndpointContentRefs {
  return {
    state: preset.state,
    dualRanges: preset.dualRanges,
    sliderModes: preset.sliderModes,
    dualSliderConfigs: preset.dualSliderConfigs,
  };
}

function sameEndpointContentRefs(left: MorphEndpointContentRefs, right: MorphEndpointContentRefs): boolean {
  return left.state === right.state
    && left.dualRanges === right.dualRanges
    && left.sliderModes === right.sliderModes
    && left.dualSliderConfigs === right.dualSliderConfigs;
}

export type MorphPairPreparer = {
  get: (
    presetA: MorphInterpolationPreset,
    presetB: MorphInterpolationPreset,
  ) => PreparedMorphPair;
};

export function createMorphPairPreparer(
  prepare: (
    presetA: MorphInterpolationPreset,
    presetB: MorphInterpolationPreset,
  ) => PreparedMorphPair = prepareMorphPair,
): MorphPairPreparer {
  let current: {
    contentA: MorphEndpointContentRefs;
    contentB: MorphEndpointContentRefs;
    prepared: PreparedMorphPair;
  } | null = null;

  return {
    get: (presetA, presetB) => {
      const contentA = endpointContentRefs(presetA);
      const contentB = endpointContentRefs(presetB);
      if (current && sameEndpointContentRefs(current.contentA, contentA) && sameEndpointContentRefs(current.contentB, contentB)) {
        return current.prepared;
      }
      const prepared = prepare(presetA, presetB);
      current = { contentA, contentB, prepared };
      return prepared;
    },
  };
}

export function evaluatePreparedMorphPair(
  prepared: PreparedMorphPair,
  t: number,
  currentCofStep = 0,
  capturedStartRoot?: number,
  direction: 'toA' | 'toB' = 'toB',
): MorphInterpolationResult {
  const {
    stateA,
    stateB,
    routerZeroSide,
    dynamicsZeroSide,
    allDualKeys,
    dualMetadata,
    keysToSnap,
  } = prepared;
  const result = { ...stateA };
  const morphPosition = clampMorphPosition(t, true);
  const tNorm = morphPosition / 100;

  let fromRoot: number;
  let toRoot: number;
  let cofMorphT: number;
  if (direction === 'toB') {
    fromRoot = capturedStartRoot !== undefined
      ? capturedStartRoot
      : stateA.cofDriftEnabled ? calculateDriftedRoot(stateA.rootNote, currentCofStep) : stateA.rootNote;
    toRoot = stateB.rootNote;
    cofMorphT = morphPosition;
  } else {
    fromRoot = capturedStartRoot !== undefined
      ? capturedStartRoot
      : stateB.cofDriftEnabled ? calculateDriftedRoot(stateB.rootNote, currentCofStep) : stateB.rootNote;
    toRoot = stateA.rootNote;
    cofMorphT = 100 - morphPosition;
  }

  const { currentRoot, cofStep, totalSteps } = getMorphedRootNote(fromRoot, toRoot, cofMorphT);
  result.rootNote = currentRoot;
  result.scaleMode = tNorm < 0.5 ? stateA.scaleMode : stateB.scaleMode;
  result.manualScale = tNorm < 0.5 ? stateA.manualScale : stateB.manualScale;
  result.modulationSourceA = selectDiscreteMorphEndpoint(stateA.modulationSourceA, stateB.modulationSourceA, tNorm);
  result.modulationSourceB = selectDiscreteMorphEndpoint(stateA.modulationSourceB, stateB.modulationSourceB, tNorm);

  const morphCoFInfo = fromRoot !== toRoot
    ? {
        isMorphing: true,
        startRoot: fromRoot,
        effectiveRoot: currentRoot,
        targetRoot: toRoot,
        cofStep,
        totalSteps,
      }
    : undefined;

  const resultDualRanges: DualSliderState = {};
  const resultDualModes: Record<string, SliderMode> = {};
  const resultDualConfigs: Record<string, DualSliderConfig> = {};
  for (const keyStr of allDualKeys) {
    const key = keyStr as keyof SliderState;
    const metadata = dualMetadata.get(keyStr);
    if (!metadata) continue;
    const {
      rangeA,
      rangeB,
      valueA: valA,
      valueB: valB,
      modeA,
      modeB,
      configA,
      configB,
    } = metadata;

    let morphedMin: number;
    let morphedMax: number;
    if (rangeA && rangeB) {
      morphedMin = rangeA.min + (rangeB.min - rangeA.min) * tNorm;
      morphedMax = rangeA.max + (rangeB.max - rangeA.max) * tNorm;
    } else if (rangeA && !rangeB) {
      morphedMin = rangeA.min + (valB - rangeA.min) * tNorm;
      morphedMax = rangeA.max + (valB - rangeA.max) * tNorm;
    } else if (!rangeA && rangeB) {
      morphedMin = valA + (rangeB.min - valA) * tNorm;
      morphedMax = valA + (rangeB.max - valA) * tNorm;
    } else {
      continue;
    }

    const isEffectivelyDual = Math.abs(morphedMax - morphedMin) > 0.001;
    if (isEffectivelyDual) {
      const selectedMode = tNorm < 0.5
        ? modeA || modeB || 'walk'
        : modeB || modeA || 'sampleHold';
      if (selectedMode === 'single') continue;
      const selectedConfig = tNorm < 0.5 ? configA : configB;
      resultDualModes[key as string] = selectedMode;
      resultDualRanges[key] = { min: morphedMin, max: morphedMax };
      resultDualConfigs[keyStr] = normalizeDualSliderConfig({
        source: selectedConfig?.source ?? (selectedMode === 'sampleHold' ? 'b' : 'a'),
        range: [morphedMin, morphedMax],
      });
    } else {
      resultDualModes[key as string] = 'single';
    }
  }

  for (const key of NUMERIC_MORPH_KEYS) {
    const valA = stateA[key];
    const valB = stateB[key];
    if (typeof valA !== 'number' || typeof valB !== 'number') continue;
    const offSide = routerZeroSide.get(key) ?? dynamicsZeroSide.get(key);
    if (offSide === 'A') {
      (result as Record<string, unknown>)[key] = valB * tNorm;
    } else if (offSide === 'B') {
      (result as Record<string, unknown>)[key] = valA * (1 - tNorm);
    } else if (keysToSnap.has(key)) {
      (result as Record<string, unknown>)[key] = tNorm < 0.5 ? valA : valB;
    } else {
      (result as Record<string, unknown>)[key] = valA + (valB - valA) * tNorm;
    }
  }

  for (const key of DISCRETE_MORPH_KEYS) {
    (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
  }
  for (const key of BOOLEAN_MORPH_KEYS) {
    (result as Record<string, unknown>)[key] = tNorm < 0.5 ? stateA[key] : stateB[key];
  }

  const atEndpointA = isAtEndpoint0(morphPosition, true);
  const atEndpointB = isAtEndpoint1(morphPosition, true);
  for (const key of ENGINE_TOGGLE_KEYS) {
    const onA = stateA[key] as boolean;
    const onB = stateB[key] as boolean;
    if (onA && onB) {
      (result as Record<string, unknown>)[key] = true;
    } else if (!onA && !onB) {
      (result as Record<string, unknown>)[key] = false;
    } else if (!onA && onB) {
      (result as Record<string, unknown>)[key] = !atEndpointA;
    } else {
      (result as Record<string, unknown>)[key] = !atEndpointB;
    }
  }

  for (const entry of DYNAMICS_TOGGLE_KEYS) {
    const onA = entry.isOn(stateA);
    const onB = entry.isOn(stateB);
    const rawA = Boolean(stateA[entry.key]);
    const rawB = Boolean(stateB[entry.key]);
    if (onA && onB) {
      (result as Record<string, unknown>)[entry.key] = true;
    } else if (!onA && !onB) {
      (result as Record<string, unknown>)[entry.key] = tNorm < 0.5 ? rawA : rawB;
    } else if (!onA && onB) {
      (result as Record<string, unknown>)[entry.key] = atEndpointA ? rawA : true;
    } else {
      (result as Record<string, unknown>)[entry.key] = atEndpointB ? rawB : true;
    }
  }

  if (atEndpointA) Object.assign(result, stateA);
  else if (atEndpointB) Object.assign(result, stateB);

  const normalizedResult = normalizeDegradeReverbCrossfeed(result);
  normalizeDegradeReverbCrossfeedRanges(normalizedResult, resultDualRanges, resultDualModes);
  for (const key of Object.keys(resultDualConfigs)) {
    const range = resultDualRanges[key as keyof SliderState];
    const mode = resultDualModes[key];
    if (!range || !mode || mode === 'single') {
      delete resultDualConfigs[key];
      continue;
    }
    resultDualConfigs[key] = normalizeDualSliderConfig({
      ...resultDualConfigs[key],
      range: [range.min, range.max],
    });
  }

  return {
    state: normalizedResult,
    endpointStateA: stateA,
    endpointStateB: stateB,
    dualRanges: resultDualRanges,
    dualModes: resultDualModes,
    dualConfigs: resultDualConfigs,
    morphCoFInfo,
  };
}
