import { useCallback, type MutableRefObject } from 'react';
import {
  createCoreProductSequencerClockDivisionEvents,
  createCoreProductSequencerDiceEvent,
  createCoreProductSequencerPitchBindingModeEvents,
  createCoreProductSequencerPitchSettingEvents,
  createCoreProductSequencerResetHomeEvent,
  createCoreProductSequencerSwingEvents,
} from '../audio/coreProductEvents';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductEvent } from '../audio/product/ProductEngineTypes';
import { createCoreProductSequencerEvolveConfigEvents } from '../audio/product/ProductSequencerEvolveConfigEvents';
import {
  createCoreProductSequencerLaneHomeCaptureEvent,
  createCoreProductSequencerPresetHomeCaptureEvents,
} from '../audio/product/ProductSequencerHomeCaptureEvents';
import {
  createCoreProductDrumSequencerStepOverrideEvents,
  createCoreProductSynthSequencerStepOverrideEvents,
} from '../audio/product/ProductSequencerStepOverrideEvents';
import { createCoreProductSequencerSubLaneEnabledEvents } from '../audio/product/ProductSequencerSubLaneEnabledEvents';
import type { SequencerSubLaneConfigState } from '../audio/CoreProductHostSequencerAdapter';
import { commitProductControlActionForProduct } from '../product-control';
import type { SliderState } from './state';

type ProductRuntimeSequencerPitchState = { steps?: number; direction?: string; scaleQuantize?: boolean } | null;
type ProductRuntimeSequencerLaneHomeCaptureOptions = {
  stepOverrides?: unknown;
  subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[];
};
type ProductRuntimeSequencerPresetHomeSnapshotOptions = {
  drumStepOverrides?: unknown;
  drumSubLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[];
  synthStepOverrides?: unknown;
  synthSubLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[];
};

type ProductRuntimeSequencerControls = {
  setProductDrumEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setProductSynthEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setProductDrumEuclidClockDivs: (divs: readonly unknown[]) => void;
  setProductSynthEuclidClockDivs: (divs: readonly unknown[]) => void;
  setProductDrumEuclidSwings: (swings: readonly unknown[]) => void;
  setProductSynthEuclidSwings: (swings: readonly unknown[]) => void;
  setProductDrumSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setProductSynthSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setProductDrumPitchSettings: (settings: readonly unknown[]) => void;
  setProductSynthPitchSettings: (settings: readonly unknown[]) => void;
  setProductSynthPitchBindingModes: (modes: readonly unknown[]) => void;
  setProductDrumStepOverrides: (
    overrides: unknown,
    subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
  ) => void;
  setProductSynthStepOverrides: (
    overrides: unknown,
    subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
  ) => void;
  setProductSequencerPresetHomeSnapshots: (
    drumPitchSettings?: readonly unknown[],
    drumPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
    synthPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
    options?: ProductRuntimeSequencerPresetHomeSnapshotOptions,
  ) => void;
  resetProductSynthEuclidLaneHome: (laneIndex: number) => void;
  captureProductSynthEuclidLaneHome: (
    laneIndex: number,
    pitchState?: ProductRuntimeSequencerPitchState,
    options?: ProductRuntimeSequencerLaneHomeCaptureOptions,
  ) => void;
  diceProductSynthEuclidLane: (laneIndex: number, intensity?: number) => void;
  resetProductDrumEuclidLaneHome: (laneIndex: number) => void;
  captureProductDrumEuclidLaneHome: (
    laneIndex: number,
    pitchSettings?: unknown,
    pitchState?: ProductRuntimeSequencerPitchState,
    options?: ProductRuntimeSequencerLaneHomeCaptureOptions,
  ) => void;
  diceProductDrumEuclidLane: (laneIndex: number, intensity?: number) => void;
};

type ProductRuntimeSequencerControlsOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

function cloneSequencerPatchValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSequencerPatchValue);
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) };
  return value;
}

function sequencerPatch(key: string, value: unknown): Readonly<Record<string, unknown>> {
  return { [key]: cloneSequencerPatchValue(value) };
}

function commitCoreProductSequencerEvents(
  stateRef: MutableRefObject<SliderState>,
  patch: Readonly<Record<string, unknown>>,
  events: readonly ProductEvent[],
): void {
  void commitProductControlActionForProduct(
    productEngine,
    stateRef.current,
    {
      type: 'sequencer/edit',
      patch,
      triggerCritical: true,
    },
    {
      reason: 'sequencer-control-change',
      triggerCritical: true,
      productEvents: events,
    },
  ).catch((error) => {
    console.warn('Product sequencer control commit failed:', error);
  });
}

export function useProductRuntimeSequencerControls({
  productRuntimeMode,
  stateRef,
}: ProductRuntimeSequencerControlsOptions): ProductRuntimeSequencerControls {
  const productRuntimeActive = productRuntimeMode === 'core-product';

  const setProductDrumEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidEvolveConfigs', configs),
      createCoreProductSequencerEvolveConfigEvents('drum', configs),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidEvolveConfigs', configs),
      createCoreProductSequencerEvolveConfigEvents('synth', configs),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductDrumEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidClockDivs', divs),
      createCoreProductSequencerClockDivisionEvents('drum', divs),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidClockDivs', divs),
      createCoreProductSequencerClockDivisionEvents('synth', divs),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductDrumEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidSwings', swings),
      createCoreProductSequencerSwingEvents('drum', swings),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidSwings', swings),
      createCoreProductSequencerSwingEvents('synth', swings),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductDrumSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumSubLaneEnabled', states),
      createCoreProductSequencerSubLaneEnabledEvents('drum', states),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthSubLaneEnabled', states),
      createCoreProductSequencerSubLaneEnabledEvents('synth', states),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductDrumPitchSettings = useCallback((settings: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumPitchSettings', settings),
      createCoreProductSequencerPitchSettingEvents('drum', settings),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthPitchSettings = useCallback((settings: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthPitchSettings', settings),
      createCoreProductSequencerPitchSettingEvents('synth', settings),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthPitchBindingModes = useCallback((modes: readonly unknown[]): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthPitchBindingModes', modes),
      createCoreProductSequencerPitchBindingModeEvents(modes),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductDrumStepOverrides = useCallback((
    overrides: unknown,
    subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
  ): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumStepOverrides', overrides),
      createCoreProductDrumSequencerStepOverrideEvents(overrides, subLaneStates),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSynthStepOverrides = useCallback((
    overrides: unknown,
    subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
  ): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthStepOverrides', overrides),
      createCoreProductSynthSequencerStepOverrideEvents(overrides, subLaneStates),
    );
  }, [productRuntimeActive, stateRef]);

  const setProductSequencerPresetHomeSnapshots = useCallback((
    drumPitchSettings?: readonly unknown[],
    drumPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
    synthPitchStates?: readonly (ProductRuntimeSequencerPitchState | undefined)[],
    options?: ProductRuntimeSequencerPresetHomeSnapshotOptions,
  ): void => {
    if (!productRuntimeActive) return;
    void drumPitchSettings;
    const events = [
      ...(options?.synthStepOverrides
        ? createCoreProductSynthSequencerStepOverrideEvents(options.synthStepOverrides, options.synthSubLaneStates)
        : []),
      ...(options?.drumStepOverrides
        ? createCoreProductDrumSequencerStepOverrideEvents(options.drumStepOverrides, options.drumSubLaneStates)
        : []),
      ...createCoreProductSequencerPresetHomeCaptureEvents(drumPitchStates, synthPitchStates),
    ];
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('sequencerPresetHomeSnapshots', { drumPitchStates, synthPitchStates }),
      events,
    );
  }, [productRuntimeActive, stateRef]);

  const resetProductSynthEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidLaneHomeAction', { type: 'reset', laneIndex }),
      [createCoreProductSequencerResetHomeEvent('synth', laneIndex)],
    );
  }, [productRuntimeActive, stateRef]);

  const captureProductSynthEuclidLaneHome = useCallback((
    laneIndex: number,
    pitchState?: ProductRuntimeSequencerPitchState,
    options?: ProductRuntimeSequencerLaneHomeCaptureOptions,
  ): void => {
    if (!productRuntimeActive) return;
    const events = [
      ...(options?.stepOverrides
        ? createCoreProductSynthSequencerStepOverrideEvents(options.stepOverrides, options.subLaneStates)
        : []),
      createCoreProductSequencerLaneHomeCaptureEvent('synth', laneIndex, pitchState),
    ];
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchState }),
      events,
    );
  }, [productRuntimeActive, stateRef]);

  const diceProductSynthEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('synthEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity }),
      [createCoreProductSequencerDiceEvent('synth', laneIndex, intensity)],
    );
  }, [productRuntimeActive, stateRef]);

  const resetProductDrumEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidLaneHomeAction', { type: 'reset', laneIndex }),
      [createCoreProductSequencerResetHomeEvent('drum', laneIndex)],
    );
  }, [productRuntimeActive, stateRef]);

  const captureProductDrumEuclidLaneHome = useCallback((
    laneIndex: number,
    pitchSettings?: unknown,
    pitchState?: ProductRuntimeSequencerPitchState,
    options?: ProductRuntimeSequencerLaneHomeCaptureOptions,
  ): void => {
    if (!productRuntimeActive) return;
    const events = [
      ...(options?.stepOverrides
        ? createCoreProductDrumSequencerStepOverrideEvents(options.stepOverrides, options.subLaneStates)
        : []),
      createCoreProductSequencerLaneHomeCaptureEvent('drum', laneIndex, pitchState),
    ];
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchSettings, pitchState }),
      events,
    );
  }, [productRuntimeActive, stateRef]);

  const diceProductDrumEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (!productRuntimeActive) return;
    commitCoreProductSequencerEvents(
      stateRef,
      sequencerPatch('drumEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity }),
      [createCoreProductSequencerDiceEvent('drum', laneIndex, intensity)],
    );
  }, [productRuntimeActive, stateRef]);

  return {
    setProductDrumEuclidEvolveConfigs,
    setProductSynthEuclidEvolveConfigs,
    setProductDrumEuclidClockDivs,
    setProductSynthEuclidClockDivs,
    setProductDrumEuclidSwings,
    setProductSynthEuclidSwings,
    setProductDrumSubLaneEnabled,
    setProductSynthSubLaneEnabled,
    setProductDrumPitchSettings,
    setProductSynthPitchSettings,
    setProductSynthPitchBindingModes,
    setProductDrumStepOverrides,
    setProductSynthStepOverrides,
    setProductSequencerPresetHomeSnapshots,
    resetProductSynthEuclidLaneHome,
    captureProductSynthEuclidLaneHome,
    diceProductSynthEuclidLane,
    resetProductDrumEuclidLaneHome,
    captureProductDrumEuclidLaneHome,
    diceProductDrumEuclidLane,
  };
}
