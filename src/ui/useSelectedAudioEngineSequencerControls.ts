import { useCallback } from 'react';
import {
  createCoreProductSequencerClockDivisionEvents,
  createCoreProductSequencerDiceEvent,
  createCoreProductSequencerPitchBindingModeEvents,
  createCoreProductSequencerResetHomeEvent,
  createCoreProductSequencerSwingEvents,
} from '../audio/coreProductEvents';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';

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
  setSelectedSynthPitchSettings: (settings: readonly unknown[]) => void;
  setSelectedSynthPitchBindingModes: (modes: readonly unknown[]) => void;
  setSelectedDrumStepOverrides: (overrides: unknown) => void;
  setSelectedSynthStepOverrides: (overrides: unknown) => void;
  setSelectedSequencerPresetHomeSnapshots: () => void;
  resetSelectedSynthEuclidLaneHome: (laneIndex: number) => void;
  captureSelectedSynthEuclidLaneHome: (laneIndex: number, pitchState?: SequencerPitchState) => void;
  diceSelectedSynthEuclidLane: (laneIndex: number, intensity?: number) => void;
  resetSelectedDrumEuclidLaneHome: (laneIndex: number) => void;
  captureSelectedDrumEuclidLaneHome: (laneIndex: number, pitchSettings?: unknown, pitchState?: SequencerPitchState) => void;
  diceSelectedDrumEuclidLane: (laneIndex: number, intensity?: number) => void;
};

export function useSelectedAudioEngineSequencerControls(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineSequencerControls {
  const setSelectedDrumEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'drum-evolve-configs', configs });
      return;
    }
    selectedProductRuntime.setDrumEuclidEvolveConfigs(configs);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthEuclidEvolveConfigs = useCallback((configs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'synth-evolve-configs', configs });
      return;
    }
    selectedProductRuntime.setSynthEuclidEvolveConfigs(configs);
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvents(createCoreProductSequencerClockDivisionEvents('drum', divs));
      return;
    }
    selectedProductRuntime.setDrumEuclidClockDivs(divs);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthEuclidClockDivs = useCallback((divs: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvents(createCoreProductSequencerClockDivisionEvents('synth', divs));
      return;
    }
    selectedProductRuntime.setSynthEuclidClockDivs(divs);
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvents(createCoreProductSequencerSwingEvents('drum', swings));
      return;
    }
    selectedProductRuntime.setDrumEuclidSwings(swings);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthEuclidSwings = useCallback((swings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvents(createCoreProductSequencerSwingEvents('synth', swings));
      return;
    }
    selectedProductRuntime.setSynthEuclidSwings(swings);
  }, [audioEngineRuntimeMode]);

  // TODO(product-core): route sub-lane and step override edits through ProductEvents once the host can update toggle, value, config, and home caches atomically from event batches.
  const setSelectedDrumSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'drum-sub-lane-enabled', states });
      return;
    }
    selectedProductRuntime.setDrumSubLaneEnabled(states);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthSubLaneEnabled = useCallback((states: Record<string, boolean>[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'synth-sub-lane-enabled', states });
      return;
    }
    selectedProductRuntime.setSynthSubLaneEnabled(states);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthPitchSettings = useCallback((settings: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'synth-pitch-settings', settings });
      return;
    }
    selectedProductRuntime.setSynthPitchSettings(settings);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthPitchBindingModes = useCallback((modes: readonly unknown[]): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvents(createCoreProductSequencerPitchBindingModeEvents(modes));
      return;
    }
    selectedProductRuntime.setSynthPitchBindingModes(modes);
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumStepOverrides = useCallback((overrides: unknown): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'drum-step-overrides', overrides });
      return;
    }
    selectedProductRuntime.setDrumStepOverrides(overrides);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthStepOverrides = useCallback((overrides: unknown): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'synth-step-overrides', overrides });
      return;
    }
    selectedProductRuntime.setSynthStepOverrides(overrides);
  }, [audioEngineRuntimeMode]);

  const setSelectedSequencerPresetHomeSnapshots = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'preset-home-snapshots' });
      return;
    }
    selectedProductRuntime.setSequencerPresetHomeSnapshots();
  }, [audioEngineRuntimeMode]);

  const resetSelectedSynthEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvent(createCoreProductSequencerResetHomeEvent('synth', laneIndex));
      return;
    }
    selectedProductRuntime.resetSynthEuclidLaneHome(laneIndex);
  }, [audioEngineRuntimeMode]);

  const captureSelectedSynthEuclidLaneHome = useCallback((laneIndex: number, pitchState?: SequencerPitchState): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'capture-synth-lane-home', laneIndex, pitchState });
      return;
    }
    selectedProductRuntime.captureSynthEuclidLaneHome(laneIndex, pitchState);
  }, [audioEngineRuntimeMode]);

  const diceSelectedSynthEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvent(createCoreProductSequencerDiceEvent('synth', laneIndex, intensity));
      return;
    }
    selectedProductRuntime.diceSynthEuclidLane(laneIndex, intensity);
  }, [audioEngineRuntimeMode]);

  const resetSelectedDrumEuclidLaneHome = useCallback((laneIndex: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvent(createCoreProductSequencerResetHomeEvent('drum', laneIndex));
      return;
    }
    selectedProductRuntime.resetDrumEuclidLaneHome(laneIndex);
  }, [audioEngineRuntimeMode]);

  const captureSelectedDrumEuclidLaneHome = useCallback((laneIndex: number, pitchSettings?: unknown, pitchState?: SequencerPitchState): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.applySequencerUiPatch({ kind: 'capture-drum-lane-home', laneIndex, pitchSettings, pitchState });
      return;
    }
    selectedProductRuntime.captureDrumEuclidLaneHome(laneIndex, pitchSettings, pitchState);
  }, [audioEngineRuntimeMode]);

  const diceSelectedDrumEuclidLane = useCallback((laneIndex: number, intensity?: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.enqueueEvent(createCoreProductSequencerDiceEvent('drum', laneIndex, intensity));
      return;
    }
    selectedProductRuntime.diceDrumEuclidLane(laneIndex, intensity);
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedDrumEuclidEvolveConfigs,
    setSelectedSynthEuclidEvolveConfigs,
    setSelectedDrumEuclidClockDivs,
    setSelectedSynthEuclidClockDivs,
    setSelectedDrumEuclidSwings,
    setSelectedSynthEuclidSwings,
    setSelectedDrumSubLaneEnabled,
    setSelectedSynthSubLaneEnabled,
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
