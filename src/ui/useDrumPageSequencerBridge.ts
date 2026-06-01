import { useCallback, useMemo, type MutableRefObject } from 'react';

import type { ClockDivision, DrumStepOverrides } from '../audio/drumSeqTypes';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { sanitizeSequencerSubLaneStates } from './usePresetSequencerRestore';

type DrumPageSequencerBridgeOptions = {
  captureSelectedDrumEuclidLaneHome: (laneIdx: number, pitchSettings?: PitchSettings, pitchState?: SubLaneState | null) => void;
  diceSelectedDrumEuclidLane: (laneIdx: number, intensity: number) => void;
  drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  drumEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  drumLinkedRef: MutableRefObject<boolean[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  resetSelectedDrumEuclidLaneHome: (laneIdx: number) => void;
  setSelectedDrumEuclidClockDivs: (divs: ClockDivision[]) => void;
  setSelectedDrumEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setSelectedDrumEuclidSwings: (swings: number[]) => void;
  setSelectedDrumPitchSettings: (settings: PitchSettings[]) => void;
  setSelectedDrumStepOverrides: (overrides: DrumStepOverrides) => void;
  setSelectedDrumSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
};

function subLaneEnabledFlags(states: Record<SubLaneKind, SubLaneState>[]): Record<string, boolean>[] {
  return states.map((state) => {
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(state)) {
      out[key] = value.enabled;
    }
    return out;
  });
}

export function useDrumPageSequencerBridge({
  captureSelectedDrumEuclidLaneHome,
  diceSelectedDrumEuclidLane,
  drumClockDivsRef,
  drumEvolveConfigsRef,
  drumLinkedRef,
  drumPitchSettingsRef,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  resetSelectedDrumEuclidLaneHome,
  setSelectedDrumEuclidClockDivs,
  setSelectedDrumEuclidEvolveConfigs,
  setSelectedDrumEuclidSwings,
  setSelectedDrumPitchSettings,
  setSelectedDrumStepOverrides,
  setSelectedDrumSubLaneEnabled,
}: DrumPageSequencerBridgeOptions) {
  const onEvolveConfigsChange = useCallback((configs: EvolveConfig[]) => {
    drumEvolveConfigsRef.current = configs;
    setSelectedDrumEuclidEvolveConfigs(configs);
  }, [drumEvolveConfigsRef, setSelectedDrumEuclidEvolveConfigs]);

  const onRawStepOverridesChange = useCallback((raw: StepOverrides) => {
    drumStepOverridesRef.current = raw;
  }, [drumStepOverridesRef]);

  const onStepOverridesChange = useCallback((overrides: DrumStepOverrides) => {
    setSelectedDrumStepOverrides(overrides);
  }, [setSelectedDrumStepOverrides]);

  const onPitchSettingsChange = useCallback((settings: PitchSettings[]) => {
    drumPitchSettingsRef.current = settings;
    setSelectedDrumPitchSettings(settings);
  }, [drumPitchSettingsRef, setSelectedDrumPitchSettings]);

  const onSubLaneStatesChange = useCallback((states: Record<SubLaneKind, SubLaneState>[]) => {
    const sanitized = sanitizeSequencerSubLaneStates(states) ?? states;
    drumSubLaneStatesRef.current = sanitized;
    setSelectedDrumSubLaneEnabled(subLaneEnabledFlags(sanitized));
  }, [drumSubLaneStatesRef, setSelectedDrumSubLaneEnabled]);

  const onClockDivsChange = useCallback((divs: ClockDivision[]) => {
    drumClockDivsRef.current = divs;
    setSelectedDrumEuclidClockDivs(divs);
  }, [drumClockDivsRef, setSelectedDrumEuclidClockDivs]);

  const onSwingsChange = useCallback((swings: number[]) => {
    drumSwingsRef.current = swings;
    setSelectedDrumEuclidSwings(swings);
  }, [drumSwingsRef, setSelectedDrumEuclidSwings]);

  const onLinkedChange = useCallback((linked: boolean[]) => {
    drumLinkedRef.current = linked;
  }, [drumLinkedRef]);

  const captureEvolveHome = useCallback((laneIdx: number, pitchState?: SubLaneState | null) => {
    captureSelectedDrumEuclidLaneHome(
      laneIdx,
      drumPitchSettingsRef.current?.[laneIdx],
      pitchState ?? drumSubLaneStatesRef.current?.[laneIdx]?.pitch,
    );
  }, [captureSelectedDrumEuclidLaneHome, drumPitchSettingsRef, drumSubLaneStatesRef]);

  return useMemo(() => ({
    captureEvolveHome,
    diceLane: diceSelectedDrumEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onSwingsChange,
    resetEvolveHome: resetSelectedDrumEuclidLaneHome,
  }), [
    captureEvolveHome,
    diceSelectedDrumEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onSwingsChange,
    resetSelectedDrumEuclidLaneHome,
  ]);
}
