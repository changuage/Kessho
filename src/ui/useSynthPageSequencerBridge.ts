import { useCallback, useMemo, useRef, type MutableRefObject } from 'react';

import type { ClockDivision, PitchBindingMode } from '../audio/drumSeqTypes';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { sanitizeSequencerSubLaneStates } from './usePresetSequencerRestore';

type SynthPitchHomeState = { steps?: number; direction?: string; scaleQuantize?: boolean };

type SynthPageSequencerBridgeOptions = {
  captureSelectedSynthEuclidLaneHome: (
    laneIdx: number,
    pitchState?: SynthPitchHomeState | null,
    options?: { stepOverrides?: Partial<StepOverrides>; subLaneStates?: Record<SubLaneKind, SubLaneState>[] },
  ) => void;
  diceSelectedSynthEuclidLane: (laneIdx: number, intensity: number) => void;
  resetSelectedSynthEuclidLaneHome: (laneIdx: number) => void;
  setSelectedSynthEuclidClockDivs: (divs: ClockDivision[]) => void;
  setSelectedSynthEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setSelectedSynthEuclidSwings: (swings: number[]) => void;
  setSelectedSynthPitchBindingModes: (modes: PitchBindingMode[]) => void;
  setSelectedSynthPitchSettings: (settings: PitchSettings[]) => void;
  setSelectedSynthStepOverrides: (overrides: Partial<StepOverrides>, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  setSelectedSynthSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  synthClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  synthEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  synthLinkedRef: MutableRefObject<boolean[] | undefined>;
  synthPitchBindingModesRef: MutableRefObject<PitchBindingMode[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthArpConfigsRef: MutableRefObject<ProductPlayConfig[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

function subLaneEnabledFlags(
  states: Record<SubLaneKind, SubLaneState>[] | undefined,
  arpConfigs: ProductPlayConfig[] | undefined,
): Record<string, boolean>[] {
  return Array.from({ length: 4 }, (_, laneIndex) => {
    const state = states?.[laneIndex];
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(state ?? {})) {
      out[key] = value.enabled;
    }
    out.ratchet = out.expression === true;
    if (arpConfigs?.[laneIndex]?.enabled) {
      out.arp = true;
      out.play = true;
      out.pitch = true;
    }
    return out;
  });
}

function synthEngineStepOverrides(overrides: StepOverrides): Partial<StepOverrides> {
  return {
    pitch: overrides.pitch,
    pitchDirection: overrides.pitchDirection,
    playNotes: overrides.playNotes,
    triggerToggles: overrides.triggerToggles,
    expression: overrides.expression,
    expressionDirection: overrides.expressionDirection,
    expressionRanges: overrides.expressionRanges,
    morph: overrides.morph,
    morphDirection: overrides.morphDirection,
    morphRanges: overrides.morphRanges,
    distance: overrides.distance,
    distanceDirection: overrides.distanceDirection,
    distanceRanges: overrides.distanceRanges,
    nudge: overrides.nudge,
    nudgeDirection: overrides.nudgeDirection,
    probability: overrides.probability,
    ratchet: overrides.ratchet,
    trigCondition: overrides.trigCondition,
  };
}

export function useSynthPageSequencerBridge({
  captureSelectedSynthEuclidLaneHome,
  diceSelectedSynthEuclidLane,
  resetSelectedSynthEuclidLaneHome,
  setSelectedSynthEuclidClockDivs,
  setSelectedSynthEuclidEvolveConfigs,
  setSelectedSynthEuclidSwings,
  setSelectedSynthPitchBindingModes,
  setSelectedSynthPitchSettings,
  setSelectedSynthStepOverrides,
  setSelectedSynthSubLaneEnabled,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthArpConfigsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: SynthPageSequencerBridgeOptions) {
  const engineStepOverridesRef = useRef<Partial<StepOverrides> | undefined>(undefined);

  const onSubLaneStatesChange = useCallback((states: Record<SubLaneKind, SubLaneState>[]) => {
    const sanitized = sanitizeSequencerSubLaneStates(states) ?? states;
    synthSubLaneStatesRef.current = sanitized;
    setSelectedSynthSubLaneEnabled(subLaneEnabledFlags(sanitized, synthArpConfigsRef.current));
  }, [setSelectedSynthSubLaneEnabled, synthArpConfigsRef, synthSubLaneStatesRef]);

  const onArpConfigsChange = useCallback((configs: ProductPlayConfig[]) => {
    synthArpConfigsRef.current = configs;
    setSelectedSynthSubLaneEnabled(subLaneEnabledFlags(synthSubLaneStatesRef.current, configs));
  }, [setSelectedSynthSubLaneEnabled, synthArpConfigsRef, synthSubLaneStatesRef]);

  const onPitchSettingsChange = useCallback((settings: PitchSettings[]) => {
    synthPitchSettingsRef.current = settings;
    setSelectedSynthPitchSettings(settings);
  }, [setSelectedSynthPitchSettings, synthPitchSettingsRef]);

  const onPitchBindingModesChange = useCallback((modes: PitchBindingMode[]) => {
    synthPitchBindingModesRef.current = modes;
    setSelectedSynthPitchBindingModes(modes);
  }, [setSelectedSynthPitchBindingModes, synthPitchBindingModesRef]);

  const onRawStepOverridesChange = useCallback((raw: StepOverrides) => {
    synthStepOverridesRef.current = raw;
  }, [synthStepOverridesRef]);

  const onStepOverridesChange = useCallback((
    overrides: StepOverrides,
    subLaneStates?: Record<SubLaneKind, SubLaneState>[],
  ) => {
    const engineOverrides = synthEngineStepOverrides(overrides);
    engineStepOverridesRef.current = engineOverrides;
    setSelectedSynthStepOverrides(engineOverrides, subLaneStates ?? synthSubLaneStatesRef.current);
  }, [setSelectedSynthStepOverrides, synthSubLaneStatesRef]);

  const onClockDivsChange = useCallback((divs: ClockDivision[]) => {
    synthClockDivsRef.current = divs;
    setSelectedSynthEuclidClockDivs(divs);
  }, [setSelectedSynthEuclidClockDivs, synthClockDivsRef]);

  const onSwingsChange = useCallback((swings: number[]) => {
    synthSwingsRef.current = swings;
    setSelectedSynthEuclidSwings(swings);
  }, [setSelectedSynthEuclidSwings, synthSwingsRef]);

  const onLinkedChange = useCallback((linked: boolean[]) => {
    synthLinkedRef.current = linked;
  }, [synthLinkedRef]);

  const onEvolveConfigsChange = useCallback((configs: EvolveConfig[]) => {
    synthEvolveConfigsRef.current = configs;
    setSelectedSynthEuclidEvolveConfigs(configs);
  }, [setSelectedSynthEuclidEvolveConfigs, synthEvolveConfigsRef]);

  const captureEvolveHome = useCallback((laneIdx: number, pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null) => {
    captureSelectedSynthEuclidLaneHome(
      laneIdx,
      pitchState ?? synthSubLaneStatesRef.current?.[laneIdx]?.pitch,
      {
        stepOverrides: engineStepOverridesRef.current,
        subLaneStates: synthSubLaneStatesRef.current,
      },
    );
  }, [captureSelectedSynthEuclidLaneHome, synthSubLaneStatesRef]);

  return useMemo(() => ({
    captureEvolveHome,
    diceLane: diceSelectedSynthEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchBindingModesChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onArpConfigsChange,
    onSwingsChange,
    resetEvolveHome: resetSelectedSynthEuclidLaneHome,
  }), [
    captureEvolveHome,
    diceSelectedSynthEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchBindingModesChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onArpConfigsChange,
    onSwingsChange,
    resetSelectedSynthEuclidLaneHome,
  ]);
}
