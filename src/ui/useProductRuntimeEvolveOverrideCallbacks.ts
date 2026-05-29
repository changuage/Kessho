import type { MutableRefObject } from 'react';

import { useSelectedAudioEngineEvolveOverrideCallbacks } from './useSelectedAudioEngineEvolveOverrideCallbacks';
import type { PitchSettings, StepOverrides, SubLaneKind, SubLaneState } from './sequencer/useEuclideanSequencer';

type ProductRuntimeEvolvedSubLanePatch = Partial<Record<SubLaneKind, Partial<SubLaneState>>>;

export type ProductRuntimeEvolvedOverrideState = {
  laneIndex: number;
  version: number;
  data: Partial<StepOverrides> & { pitchSettings?: (PitchSettings | null)[] };
  swing?: number;
  subLaneStates?: ProductRuntimeEvolvedSubLanePatch;
};

type ProductRuntimeEvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type ProductRuntimeSynthNoteRangeCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

export type ProductRuntimeEvolveOverrideCallbacksOptions = {
  activeTab: string;
  createDefaultPitchSettings: () => PitchSettings[];
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  setProductDrumEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthNoteRangeEvolvedCallback: (callback: ProductRuntimeSynthNoteRangeCallback | null) => void;
};

export function useProductRuntimeEvolveOverrideCallbacks({
  setProductDrumEvolveOverridesChangedCallback,
  setProductSynthEvolveOverridesChangedCallback,
  setProductSynthNoteRangeEvolvedCallback,
  ...options
}: ProductRuntimeEvolveOverrideCallbacksOptions): {
  drumEvolvedOverrides: ProductRuntimeEvolvedOverrideState | undefined;
  synthEvolvedOverrides: ProductRuntimeEvolvedOverrideState | undefined;
} {
  // TODO(product-runtime-compat-10E): selected evolve override callback processing remains
  // the compatibility implementation behind product-named callback registration.
  return useSelectedAudioEngineEvolveOverrideCallbacks({
    ...options,
    setSelectedDrumEvolveOverridesChangedCallback: setProductDrumEvolveOverridesChangedCallback,
    setSelectedSynthEvolveOverridesChangedCallback: setProductSynthEvolveOverridesChangedCallback,
    setSelectedSynthNoteRangeEvolvedCallback: setProductSynthNoteRangeEvolvedCallback,
  });
}
