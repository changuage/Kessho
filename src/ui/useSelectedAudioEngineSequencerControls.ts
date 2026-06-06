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
import { createCoreProductSequencerSubLaneEnabledEvents } from '../audio/product/ProductSequencerSubLaneEnabledEvents';
import {
  createCoreProductSequencerLaneHomeCaptureEvent,
  createCoreProductSequencerPresetHomeCaptureEvents,
} from '../audio/product/ProductSequencerHomeCaptureEvents';
import { createCoreProductSequencerEvolveConfigEvents } from '../audio/product/ProductSequencerEvolveConfigEvents';
import {
  createCoreProductDrumSequencerStepOverrideEvents,
  createCoreProductSynthSequencerStepOverrideEvents,
} from '../audio/product/ProductSequencerStepOverrideEvents';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductEvent } from '../audio/product/ProductEngineTypes';
import { commitProductControlActionForProduct } from '../product-control';
import type { SliderState } from './state';

type SequencerPitchState = { steps?: number; direction?: string; scaleQuantize?: boolean } | null;

type SelectedAudioEngineSequencerControls = {
  setSelectedDrumEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setSelectedSynthEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setSelectedDrumEuclidClockDivs: (divs: readonly unknown[]) => void;
  setSelectedSynthEuclidClockDivs: (divs: readonly unknown[]) => void;
  setSelectedDrumEuclidSwings: (swings: readonly unknown[]) => void;
  setSelectedSynthEuclidSwings: (swings: readonly unknown[]) => void;
  setSelectedDrumSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setSelectedSynthSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setSelectedDrumPitchSettings: (settings: readonly unknown[]) => void;
  setSelectedSynthPitchSettings: (settings: readonly unknown[]) => void;
  setSelectedSynthPitchBindingModes: (modes: readonly unknown[]) => void;
  setSelectedDrumStepOverrides: (overrides: unknown) => void;
  setSelectedSynthStepOverrides: (overrides: unknown) => void;
  setSelectedSequencerPresetHomeSnapshots: (
    drumPitchSettings?: readonly unknown[],
    drumPitchStates?: readonly (SequencerPitchState | undefined)[],
    synthPitchStates?: readonly (SequencerPitchState | undefined)[],
  ) => void;
  resetSelectedSynthEuclidLaneHome: (laneIndex: number) => void;
  captureSelectedSynthEuclidLaneHome: (laneIndex: number, pitchState?: SequencerPitchState) => void;
  diceSelectedSynthEuclidLane: (laneIndex: number, intensity?: number) => void;
  resetSelectedDrumEuclidLaneHome: (laneIndex: number) => void;
  captureSelectedDrumEuclidLaneHome: (laneIndex: number, pitchSettings?: unknown, pitchState?: SequencerPitchState) => void;
  diceSelectedDrumEuclidLane: (laneIndex: number, intensity?: number) => void;
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
  stateRef: MutableRefObject<SliderState> | undefined,
  patch: Readonly<Record<string, unknown>>,
  events: readonly ProductEvent[],
): void {
  if (!stateRef) {
    throw new Error('ProductControl sequencer commits require current SliderState');
  }
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

export function useSelectedAudioEngineSequencerControls(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
  stateRef?: MutableRefObject<SliderState>,
): SelectedAudioEngineSequencerControls {
  const setSelectedDrumEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidEvolveConfigs', configs),
        createCoreProductSequencerEvolveConfigEvents('drum', configs),
      );
      return;
    }
    selectedProductRuntime.setDrumEuclidEvolveConfigs(configs);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidEvolveConfigs', configs),
        createCoreProductSequencerEvolveConfigEvents('synth', configs),
      );
      return;
    }
    selectedProductRuntime.setSynthEuclidEvolveConfigs(configs);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedDrumEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidClockDivs', divs),
        createCoreProductSequencerClockDivisionEvents('drum', divs),
      );
      return;
    }
    selectedProductRuntime.setDrumEuclidClockDivs(divs);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidClockDivs', divs),
        createCoreProductSequencerClockDivisionEvents('synth', divs),
      );
      return;
    }
    selectedProductRuntime.setSynthEuclidClockDivs(divs);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedDrumEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidSwings', swings),
        createCoreProductSequencerSwingEvents('drum', swings),
      );
      return;
    }
    selectedProductRuntime.setDrumEuclidSwings(swings);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidSwings', swings),
        createCoreProductSequencerSwingEvents('synth', swings),
      );
      return;
    }
    selectedProductRuntime.setSynthEuclidSwings(swings);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedDrumSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumSubLaneEnabled', states),
        createCoreProductSequencerSubLaneEnabledEvents('drum', states),
      );
      return;
    }
    selectedProductRuntime.setDrumSubLaneEnabled(states);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthSubLaneEnabled', states),
        createCoreProductSequencerSubLaneEnabledEvents('synth', states),
      );
      return;
    }
    selectedProductRuntime.setSynthSubLaneEnabled(states);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedDrumPitchSettings = useCallback((settings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumPitchSettings', settings),
        createCoreProductSequencerPitchSettingEvents('drum', settings),
      );
      return;
    }
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthPitchSettings = useCallback((settings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthPitchSettings', settings),
        createCoreProductSequencerPitchSettingEvents('synth', settings),
      );
      return;
    }
    selectedProductRuntime.setSynthPitchSettings(settings);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthPitchBindingModes = useCallback((modes: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthPitchBindingModes', modes),
        createCoreProductSequencerPitchBindingModeEvents(modes),
      );
      return;
    }
    selectedProductRuntime.setSynthPitchBindingModes(modes);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedDrumStepOverrides = useCallback((overrides: unknown): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumStepOverrides', overrides),
        createCoreProductDrumSequencerStepOverrideEvents(overrides),
      );
      return;
    }
    selectedProductRuntime.setDrumStepOverrides(overrides);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSynthStepOverrides = useCallback((overrides: unknown): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthStepOverrides', overrides),
        createCoreProductSynthSequencerStepOverrideEvents(overrides),
      );
      return;
    }
    selectedProductRuntime.setSynthStepOverrides(overrides);
  }, [audioEngineRuntimeMode, stateRef]);

  const setSelectedSequencerPresetHomeSnapshots = useCallback((
    drumPitchSettings?: readonly unknown[],
    drumPitchStates?: readonly (SequencerPitchState | undefined)[],
    synthPitchStates?: readonly (SequencerPitchState | undefined)[],
  ): void => {
    void drumPitchSettings;
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('sequencerPresetHomeSnapshots', { drumPitchStates, synthPitchStates }),
        createCoreProductSequencerPresetHomeCaptureEvents(drumPitchStates, synthPitchStates),
      );
      return;
    }
    selectedProductRuntime.setSequencerPresetHomeSnapshots();
  }, [audioEngineRuntimeMode, stateRef]);

  const resetSelectedSynthEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidLaneHomeAction', { type: 'reset', laneIndex }),
        [createCoreProductSequencerResetHomeEvent('synth', laneIndex)],
      );
      return;
    }
    selectedProductRuntime.resetSynthEuclidLaneHome(laneIndex);
  }, [audioEngineRuntimeMode, stateRef]);

  const captureSelectedSynthEuclidLaneHome = useCallback((laneIndex: number, pitchState?: SequencerPitchState): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchState }),
        [createCoreProductSequencerLaneHomeCaptureEvent('synth', laneIndex, pitchState)],
      );
      return;
    }
    selectedProductRuntime.captureSynthEuclidLaneHome(laneIndex, pitchState);
  }, [audioEngineRuntimeMode, stateRef]);

  const diceSelectedSynthEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('synthEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity }),
        [createCoreProductSequencerDiceEvent('synth', laneIndex, intensity)],
      );
      return;
    }
    selectedProductRuntime.diceSynthEuclidLane(laneIndex, intensity);
  }, [audioEngineRuntimeMode, stateRef]);

  const resetSelectedDrumEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidLaneHomeAction', { type: 'reset', laneIndex }),
        [createCoreProductSequencerResetHomeEvent('drum', laneIndex)],
      );
      return;
    }
    selectedProductRuntime.resetDrumEuclidLaneHome(laneIndex);
  }, [audioEngineRuntimeMode, stateRef]);

  const captureSelectedDrumEuclidLaneHome = useCallback((laneIndex: number, pitchSettings?: unknown, pitchState?: SequencerPitchState): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidLaneHomeAction', { type: 'capture', laneIndex, pitchSettings, pitchState }),
        [createCoreProductSequencerLaneHomeCaptureEvent('drum', laneIndex, pitchState)],
      );
      return;
    }
    selectedProductRuntime.captureDrumEuclidLaneHome(laneIndex, pitchSettings, pitchState);
  }, [audioEngineRuntimeMode, stateRef]);

  const diceSelectedDrumEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      commitCoreProductSequencerEvents(
        stateRef,
        sequencerPatch('drumEuclidLaneHomeAction', { type: 'dice', laneIndex, intensity }),
        [createCoreProductSequencerDiceEvent('drum', laneIndex, intensity)],
      );
      return;
    }
    selectedProductRuntime.diceDrumEuclidLane(laneIndex, intensity);
  }, [audioEngineRuntimeMode, stateRef]);

  return {
    setSelectedDrumEuclidEvolveConfigs,
    setSelectedSynthEuclidEvolveConfigs,
    setSelectedDrumEuclidClockDivs,
    setSelectedSynthEuclidClockDivs,
    setSelectedDrumEuclidSwings,
    setSelectedSynthEuclidSwings,
    setSelectedDrumSubLaneEnabled,
    setSelectedSynthSubLaneEnabled,
    setSelectedDrumPitchSettings,
    setSelectedSynthPitchSettings,
    setSelectedSynthPitchBindingModes,
    setSelectedDrumStepOverrides,
    setSelectedSynthStepOverrides,
    setSelectedSequencerPresetHomeSnapshots,
    resetSelectedSynthEuclidLaneHome,
    captureSelectedSynthEuclidLaneHome,
    diceSelectedSynthEuclidLane,
    resetSelectedDrumEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome,
    diceSelectedDrumEuclidLane,
  };
}
