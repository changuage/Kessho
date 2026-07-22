import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../../audio/product/ProductEngineTypes';
import { referenceRuntimeAdapter } from './ReferenceRuntimeAdapter';

function register<T>(active: boolean, setter: (callback: T) => void, callback: T): void {
  if (active) setter(callback);
}

type ReferenceUnavailableCallbackSetters = {
  setProductSample1DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setProductSample2DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setProductSynthOrbitVisualStateCallback?: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setProductSynthAnchorWalkerVisualStateCallback?: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
};

export function createReferenceRuntimeCallbackSurfaces(active = true) {
  const unavailableCallbackSetters: ReferenceUnavailableCallbackSetters = active ? {} : {
    setProductSample1DistanceTriggerCallback: () => {
      throw new Error('Reference runtime capability unavailable: sample1Distance');
    },
    setProductSample2DistanceTriggerCallback: () => {
      throw new Error('Reference runtime capability unavailable: sample2Distance');
    },
    setProductSynthOrbitVisualStateCallback: () => {
      throw new Error('Reference runtime capability unavailable: synthOrbitVisualState');
    },
    setProductSynthAnchorWalkerVisualStateCallback: () => {
      throw new Error('Reference runtime capability unavailable: synthAnchorWalkerVisualState');
    },
  };

  return {
    setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => register(active, referenceRuntimeAdapter.setLeadExpressionCallback, callback),
    setProductLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => register(active, referenceRuntimeAdapter.setLeadMorphCallback, callback),
    setProductPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => register(active, referenceRuntimeAdapter.setPadMorphTriggerCallback, callback),
    setProductPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => register(active, referenceRuntimeAdapter.setPad2MorphTriggerCallback, callback),
    setProductLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => register(active, referenceRuntimeAdapter.setLeadDistanceCallback, callback),
    setProductPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => register(active, referenceRuntimeAdapter.setPadDistanceTriggerCallback, callback),
    setProductPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => register(active, referenceRuntimeAdapter.setPad2DistanceTriggerCallback, callback),
    setProductPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => register(active, referenceRuntimeAdapter.setPianoDistanceTriggerCallback, callback),
    setProductLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => register(active, referenceRuntimeAdapter.setLeadDelayCallback, callback),
    setProductDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => register(active, referenceRuntimeAdapter.setDrumMorphTriggerCallback, callback),
    setProductDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => register(active, referenceRuntimeAdapter.setDrumParamSHTriggerCallback, callback),
    setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => register(active, referenceRuntimeAdapter.setGranularSHTriggerCallback, callback),
    setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => register(active, referenceRuntimeAdapter.setDrumStepPositionCallback, callback),
    setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => register(active, referenceRuntimeAdapter.setDrumEuclidEvolveTriggerCallback, callback),
    setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => register(active, referenceRuntimeAdapter.setDrumTriggerCallback, callback),
    setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => register(active, referenceRuntimeAdapter.setSynthStepPositionCallback, callback),
    setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => register(active, referenceRuntimeAdapter.setSynthEuclidEvolveTriggerCallback, callback),
    setProductDrumEvolveOverridesChangedCallback: (callback: ((laneIndex: number, overrides: unknown) => void) | null) => register(active, referenceRuntimeAdapter.setDrumEvolveOverridesChangedCallback, callback),
    setProductSynthEvolveOverridesChangedCallback: (callback: ((laneIndex: number, overrides: unknown) => void) | null) => register(active, referenceRuntimeAdapter.setSynthEvolveOverridesChangedCallback, callback),
    setProductSynthNoteRangeEvolvedCallback: (callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null) => register(active, referenceRuntimeAdapter.setSynthNoteRangeEvolvedCallback, callback),
    ...unavailableCallbackSetters,
  };
}

export type ReferenceRuntimeCallbackSurfaces = ReturnType<typeof createReferenceRuntimeCallbackSurfaces>;
