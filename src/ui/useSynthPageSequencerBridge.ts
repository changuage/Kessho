import { useCallback, useMemo, useRef, type MutableRefObject } from 'react';

import type { ClockDivision, PitchBindingMode } from '../audio/drumSeqTypes';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { sanitizeSequencerSubLaneStates } from './usePresetSequencerRestore';

type SynthPitchHomeState = { steps?: number; direction?: string; scaleQuantize?: boolean };

type SynthPageSequencerBridgeOptions = {
  captureProductSynthEuclidLaneHome: (
    laneIdx: number,
    pitchState?: SynthPitchHomeState | null,
    options?: { stepOverrides?: Partial<StepOverrides>; subLaneStates?: Record<SubLaneKind, SubLaneState>[] },
  ) => void;
  diceProductSynthEuclidLane: (laneIdx: number, intensity: number) => void;
  resetProductSynthEuclidLaneHome: (laneIdx: number) => void;
  setProductSynthEuclidClockDivs: (divs: ClockDivision[]) => void;
  setProductSynthEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductSynthEuclidSwings: (swings: number[]) => void;
  setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void;
  setProductSynthPitchSettings: (settings: PitchSettings[]) => void;
  setProductSynthStepOverrides: (overrides: Partial<StepOverrides>, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  setProductSynthSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  synthClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  synthEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  synthLinkedRef: MutableRefObject<boolean[] | undefined>;
  synthPitchBindingModesRef: MutableRefObject<PitchBindingMode[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthPlayConfigsRef: MutableRefObject<ProductPlayConfig[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

function subLaneEnabledFlags(
  states: Record<SubLaneKind, SubLaneState>[] | undefined,
  playConfigs: ProductPlayConfig[] | undefined,
): Record<string, boolean>[] {
  return Array.from({ length: 4 }, (_, laneIndex) => {
    const state = states?.[laneIndex];
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(state ?? {})) {
      out[key] = value.enabled;
    }
    out.ratchet = out.expression === true;
    if (playConfigs?.[laneIndex]?.enabled) {
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
    playArps: overrides.playArps,
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
  captureProductSynthEuclidLaneHome,
  diceProductSynthEuclidLane,
  resetProductSynthEuclidLaneHome,
  setProductSynthEuclidClockDivs,
  setProductSynthEuclidEvolveConfigs,
  setProductSynthEuclidSwings,
  setProductSynthPitchBindingModes,
  setProductSynthPitchSettings,
  setProductSynthStepOverrides,
  setProductSynthSubLaneEnabled,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthPlayConfigsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: SynthPageSequencerBridgeOptions) {
  const engineStepOverridesRef = useRef<Partial<StepOverrides> | undefined>(undefined);

  const onSubLaneStatesChange = useCallback((states: Record<SubLaneKind, SubLaneState>[]) => {
    const sanitized = sanitizeSequencerSubLaneStates(states) ?? states;
    synthSubLaneStatesRef.current = sanitized;
    setProductSynthSubLaneEnabled(subLaneEnabledFlags(sanitized, synthPlayConfigsRef.current));
  }, [setProductSynthSubLaneEnabled, synthPlayConfigsRef, synthSubLaneStatesRef]);

  const onPlayConfigsChange = useCallback((configs: ProductPlayConfig[]) => {
    synthPlayConfigsRef.current = configs;
    setProductSynthSubLaneEnabled(subLaneEnabledFlags(synthSubLaneStatesRef.current, configs));
  }, [setProductSynthSubLaneEnabled, synthPlayConfigsRef, synthSubLaneStatesRef]);

  const onPitchSettingsChange = useCallback((settings: PitchSettings[]) => {
    synthPitchSettingsRef.current = settings;
    setProductSynthPitchSettings(settings);
  }, [setProductSynthPitchSettings, synthPitchSettingsRef]);

  const onPitchBindingModesChange = useCallback((modes: PitchBindingMode[]) => {
    synthPitchBindingModesRef.current = modes;
    setProductSynthPitchBindingModes(modes);
  }, [setProductSynthPitchBindingModes, synthPitchBindingModesRef]);

  const onRawStepOverridesChange = useCallback((raw: StepOverrides) => {
    synthStepOverridesRef.current = raw;
  }, [synthStepOverridesRef]);

  const onStepOverridesChange = useCallback((
    overrides: StepOverrides,
    subLaneStates?: Record<SubLaneKind, SubLaneState>[],
  ) => {
    const engineOverrides = synthEngineStepOverrides(overrides);
    engineStepOverridesRef.current = engineOverrides;
    setProductSynthStepOverrides(engineOverrides, subLaneStates ?? synthSubLaneStatesRef.current);
  }, [setProductSynthStepOverrides, synthSubLaneStatesRef]);

  const onClockDivsChange = useCallback((divs: ClockDivision[]) => {
    synthClockDivsRef.current = divs;
    setProductSynthEuclidClockDivs(divs);
  }, [setProductSynthEuclidClockDivs, synthClockDivsRef]);

  const onSwingsChange = useCallback((swings: number[]) => {
    synthSwingsRef.current = swings;
    setProductSynthEuclidSwings(swings);
  }, [setProductSynthEuclidSwings, synthSwingsRef]);

  const onLinkedChange = useCallback((linked: boolean[]) => {
    synthLinkedRef.current = linked;
  }, [synthLinkedRef]);

  const onEvolveConfigsChange = useCallback((configs: EvolveConfig[]) => {
    synthEvolveConfigsRef.current = configs;
    setProductSynthEuclidEvolveConfigs(configs);
  }, [setProductSynthEuclidEvolveConfigs, synthEvolveConfigsRef]);

  const captureEvolveHome = useCallback((laneIdx: number, pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null) => {
    captureProductSynthEuclidLaneHome(
      laneIdx,
      pitchState ?? synthSubLaneStatesRef.current?.[laneIdx]?.pitch,
      {
        stepOverrides: engineStepOverridesRef.current,
        subLaneStates: synthSubLaneStatesRef.current,
      },
    );
  }, [captureProductSynthEuclidLaneHome, synthSubLaneStatesRef]);

  return useMemo(() => ({
    captureEvolveHome,
    diceLane: diceProductSynthEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchBindingModesChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onPlayConfigsChange,
    onSwingsChange,
    resetEvolveHome: resetProductSynthEuclidLaneHome,
  }), [
    captureEvolveHome,
    diceProductSynthEuclidLane,
    onClockDivsChange,
    onEvolveConfigsChange,
    onLinkedChange,
    onPitchBindingModesChange,
    onPitchSettingsChange,
    onRawStepOverridesChange,
    onStepOverridesChange,
    onSubLaneStatesChange,
    onPlayConfigsChange,
    onSwingsChange,
    resetProductSynthEuclidLaneHome,
  ]);
}
