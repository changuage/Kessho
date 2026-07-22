import { useCallback, useMemo, useRef, type MutableRefObject } from 'react';

import type { ClockDivision, DrumStepOverrides } from '../audio/drumSeqTypes';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { sanitizeSequencerSubLaneStates } from './usePresetSequencerRestore';

type DrumPageSequencerBridgeOptions = {
  captureProductDrumEuclidLaneHome: (
    laneIdx: number,
    pitchSettings?: PitchSettings,
    pitchState?: SubLaneState | null,
    options?: { stepOverrides?: DrumStepOverrides; subLaneStates?: Record<SubLaneKind, SubLaneState>[] },
  ) => void;
  diceProductDrumEuclidLane: (laneIdx: number, intensity: number) => void;
  drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  drumEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  drumLinkedRef: MutableRefObject<boolean[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  resetProductDrumEuclidLaneHome: (laneIdx: number) => void;
  setProductDrumEuclidClockDivs: (divs: ClockDivision[]) => void;
  setProductDrumEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductDrumEuclidSwings: (swings: number[]) => void;
  setProductDrumPitchSettings: (settings: PitchSettings[]) => void;
  setProductDrumStepOverrides: (overrides: DrumStepOverrides, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  setProductDrumSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
};

function subLaneEnabledFlags(states: Record<SubLaneKind, SubLaneState>[]): Record<string, boolean>[] {
  return states.map((state) => {
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(state)) {
      out[key] = value.enabled;
    }
    out.ratchet = out.expression === true;
    return out;
  });
}

export function useDrumPageSequencerBridge({
  captureProductDrumEuclidLaneHome,
  diceProductDrumEuclidLane,
  drumClockDivsRef,
  drumEvolveConfigsRef,
  drumLinkedRef,
  drumPitchSettingsRef,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  resetProductDrumEuclidLaneHome,
  setProductDrumEuclidClockDivs,
  setProductDrumEuclidEvolveConfigs,
  setProductDrumEuclidSwings,
  setProductDrumPitchSettings,
  setProductDrumStepOverrides,
  setProductDrumSubLaneEnabled,
}: DrumPageSequencerBridgeOptions) {
  const engineStepOverridesRef = useRef<DrumStepOverrides | undefined>(undefined);

  const onEvolveConfigsChange = useCallback((configs: EvolveConfig[]) => {
    drumEvolveConfigsRef.current = configs;
    setProductDrumEuclidEvolveConfigs(configs);
  }, [drumEvolveConfigsRef, setProductDrumEuclidEvolveConfigs]);

  const onRawStepOverridesChange = useCallback((raw: StepOverrides) => {
    drumStepOverridesRef.current = raw;
  }, [drumStepOverridesRef]);

  const onStepOverridesChange = useCallback((
    overrides: DrumStepOverrides,
    subLaneStates?: Record<SubLaneKind, SubLaneState>[],
  ) => {
    engineStepOverridesRef.current = overrides;
    setProductDrumStepOverrides(overrides, subLaneStates ?? drumSubLaneStatesRef.current);
  }, [drumSubLaneStatesRef, setProductDrumStepOverrides]);

  const onPitchSettingsChange = useCallback((settings: PitchSettings[]) => {
    drumPitchSettingsRef.current = settings;
    setProductDrumPitchSettings(settings);
  }, [drumPitchSettingsRef, setProductDrumPitchSettings]);

  const onSubLaneStatesChange = useCallback((states: Record<SubLaneKind, SubLaneState>[]) => {
    const sanitized = sanitizeSequencerSubLaneStates(states) ?? states;
    drumSubLaneStatesRef.current = sanitized;
    setProductDrumSubLaneEnabled(subLaneEnabledFlags(sanitized));
  }, [drumSubLaneStatesRef, setProductDrumSubLaneEnabled]);

  const onClockDivsChange = useCallback((divs: ClockDivision[]) => {
    drumClockDivsRef.current = divs;
    setProductDrumEuclidClockDivs(divs);
  }, [drumClockDivsRef, setProductDrumEuclidClockDivs]);

  const onSwingsChange = useCallback((swings: number[]) => {
    drumSwingsRef.current = swings;
    setProductDrumEuclidSwings(swings);
  }, [drumSwingsRef, setProductDrumEuclidSwings]);

  const onLinkedChange = useCallback((linked: boolean[]) => {
    drumLinkedRef.current = linked;
  }, [drumLinkedRef]);

  const captureEvolveHome = useCallback((laneIdx: number, pitchState?: SubLaneState | null) => {
    captureProductDrumEuclidLaneHome(
      laneIdx,
      drumPitchSettingsRef.current?.[laneIdx],
      pitchState ?? drumSubLaneStatesRef.current?.[laneIdx]?.pitch,
      {
        stepOverrides: engineStepOverridesRef.current,
        subLaneStates: drumSubLaneStatesRef.current,
      },
    );
  }, [captureProductDrumEuclidLaneHome, drumPitchSettingsRef, drumSubLaneStatesRef]);

  return useMemo(() => ({
    captureEvolveHome,
    diceLane: diceProductDrumEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onSwingsChange,
    resetEvolveHome: resetProductDrumEuclidLaneHome,
  }), [
    captureEvolveHome,
    diceProductDrumEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onSwingsChange,
    resetProductDrumEuclidLaneHome,
  ]);
}
