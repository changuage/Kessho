import {
  ensureAudioEngineLoaded,
  preloadAudioEngine,
  type EngineState,
  type AudioEngine,
} from '../../audio/referenceAudioRuntime';
import type { SliderState } from '../state';

type EngineMethodArgs<K extends keyof AudioEngine> = AudioEngine[K] extends (...args: infer Args) => unknown ? Args : never;
type EngineCallback<K extends keyof AudioEngine> = EngineMethodArgs<K>[0];

/**
 * The single development-only Web TS adapter. Its surface is deliberately
 * explicit and typed; Product hooks never discover or dispatch methods by
 * string name.
 */
export type ReferenceRuntimeAdapter = {
  primeAudio: () => void;
  start: (state: SliderState) => Promise<void>;
  resume: () => Promise<void>;
  suspend: () => Promise<void>;
  preload: () => Promise<AudioEngine>;
  stop: () => void;
  fadeOutput: (target: number, durationMs: number) => Promise<void>;
  readState: () => Promise<EngineState>;
  setStateChangeCallback: (callback: ((state: EngineState) => void) | null) => void;
  updateParams: (nextState: SliderState, metadata?: unknown) => void;
  resetCofDrift: () => void;
  setLeadExpressionCallback: (callback: EngineCallback<'setLeadExpressionCallback'>) => void;
  setLeadMorphCallback: (callback: EngineCallback<'setLeadMorphCallback'>) => void;
  setPadMorphTriggerCallback: (callback: EngineCallback<'setPadMorphTriggerCallback'>) => void;
  setPad2MorphTriggerCallback: (callback: EngineCallback<'setPad2MorphTriggerCallback'>) => void;
  setLeadDistanceCallback: (callback: EngineCallback<'setLeadDistanceCallback'>) => void;
  setPadDistanceTriggerCallback: (callback: EngineCallback<'setPadDistanceTriggerCallback'>) => void;
  setPad2DistanceTriggerCallback: (callback: EngineCallback<'setPad2DistanceTriggerCallback'>) => void;
  setPianoDistanceTriggerCallback: (callback: EngineCallback<'setPianoDistanceTriggerCallback'>) => void;
  setLeadDelayCallback: (callback: EngineCallback<'setLeadDelayCallback'>) => void;
  setDrumMorphTriggerCallback: (callback: EngineCallback<'setDrumMorphTriggerCallback'>) => void;
  setDrumParamSHTriggerCallback: (callback: EngineCallback<'setDrumParamSHTriggerCallback'>) => void;
  setGranularSHTriggerCallback: (callback: EngineCallback<'setGranularSHTriggerCallback'>) => void;
  setDrumStepPositionCallback: (callback: EngineCallback<'setDrumStepPositionCallback'>) => void;
  setDrumEuclidEvolveTriggerCallback: (callback: EngineCallback<'setDrumEuclidEvolveTriggerCallback'>) => void;
  setDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
  setSynthEuclidEvolveTriggerCallback: (callback: EngineCallback<'setSynthEuclidEvolveTriggerCallback'>) => void;
  setDrumEvolveOverridesChangedCallback: (callback: EngineCallback<'setDrumEvolveOverridesChangedCallback'>) => void;
  setSynthEvolveOverridesChangedCallback: (callback: EngineCallback<'setSynthEvolveOverridesChangedCallback'>) => void;
  setSynthNoteRangeEvolvedCallback: (callback: EngineCallback<'setSynthNoteRangeEvolvedCallback'>) => void;
  setDrumEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setSynthEuclidEvolveConfigs: (configs: readonly unknown[]) => void;
  setDrumEuclidClockDivs: (divs: readonly unknown[]) => void;
  setSynthEuclidClockDivs: (divs: readonly unknown[]) => void;
  setDrumEuclidSwings: (swings: readonly unknown[]) => void;
  setSynthEuclidSwings: (swings: readonly unknown[]) => void;
  setDrumSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setSynthSubLaneEnabled: (states: Record<string, boolean>[]) => void;
  setDrumPitchSettings: (settings: readonly unknown[]) => void;
  setSynthPitchSettings: (settings: readonly unknown[]) => void;
  setSynthPitchBindingModes: (modes: readonly unknown[]) => void;
  setDrumStepOverrides: (overrides: unknown, subLaneStates?: readonly unknown[]) => void;
  setSynthStepOverrides: (overrides: unknown) => void;
  setSequencerPresetHomeSnapshots: () => void;
  resetSynthEuclidLaneHome: (laneIndex: number) => void;
  captureSynthEuclidLaneHome: (laneIndex: number, pitchState?: unknown) => void;
  diceSynthEuclidLane: (laneIndex: number, intensity?: number) => void;
  resetDrumEuclidLaneHome: (laneIndex: number) => void;
  captureDrumEuclidLaneHome: (laneIndex: number, pitchSettings?: unknown, pitchState?: unknown) => void;
  diceDrumEuclidLane: (laneIndex: number, intensity?: number) => void;
};

function withReferenceEngine(action: (engine: AudioEngine) => void): void {
  void ensureAudioEngineLoaded().then(action);
}

const referenceRuntimeAdapter: ReferenceRuntimeAdapter = {
  primeAudio: () => {
    void ensureAudioEngineLoaded();
  },
  start: async (state) => {
    const engine = await ensureAudioEngineLoaded();
    await engine.start(state);
  },
  resume: async () => {
    const engine = await ensureAudioEngineLoaded();
    engine.resume();
  },
  suspend: async () => {
    const engine = await ensureAudioEngineLoaded();
    engine.suspend();
  },
  preload: () => preloadAudioEngine(),
  stop: () => withReferenceEngine((engine) => { engine.stop(); }),
  fadeOutput: async (target, durationMs) => {
    const engine = await ensureAudioEngineLoaded();
    engine.setOutputGain(target, durationMs / 1000);
    await new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
  },
  readState: async () => (await ensureAudioEngineLoaded()).getState(),
  setStateChangeCallback: (callback) => withReferenceEngine((engine) => engine.setStateChangeCallback(callback)),
  updateParams: (nextState, metadata) => withReferenceEngine((engine) => engine.updateParams(nextState, metadata)),
  resetCofDrift: () => withReferenceEngine((engine) => engine.resetCofDrift()),
  setLeadExpressionCallback: (callback) => withReferenceEngine((engine) => engine.setLeadExpressionCallback(callback)),
  setLeadMorphCallback: (callback) => withReferenceEngine((engine) => engine.setLeadMorphCallback(callback)),
  setPadMorphTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setPadMorphTriggerCallback(callback)),
  setPad2MorphTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setPad2MorphTriggerCallback(callback)),
  setLeadDistanceCallback: (callback) => withReferenceEngine((engine) => engine.setLeadDistanceCallback(callback)),
  setPadDistanceTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setPadDistanceTriggerCallback(callback)),
  setPad2DistanceTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setPad2DistanceTriggerCallback(callback)),
  setPianoDistanceTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setPianoDistanceTriggerCallback(callback)),
  setLeadDelayCallback: (callback) => withReferenceEngine((engine) => engine.setLeadDelayCallback(callback)),
  setDrumMorphTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setDrumMorphTriggerCallback(callback)),
  setDrumParamSHTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setDrumParamSHTriggerCallback(callback)),
  setGranularSHTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setGranularSHTriggerCallback(callback)),
  setDrumStepPositionCallback: (callback) => withReferenceEngine((engine) => engine.setDrumStepPositionCallback(callback)),
  setDrumEuclidEvolveTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setDrumEuclidEvolveTriggerCallback(callback)),
  setDrumTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setDrumTriggerCallback(
    callback ? (voice, velocity) => callback(String(voice), velocity) : null,
  )),
  setSynthStepPositionCallback: (callback) => withReferenceEngine((engine) => engine.setSynthStepPositionCallback(
    callback ? (steps, hitCounts) => callback(steps, hitCounts) : null,
  )),
  setSynthEuclidEvolveTriggerCallback: (callback) => withReferenceEngine((engine) => engine.setSynthEuclidEvolveTriggerCallback(callback)),
  setDrumEvolveOverridesChangedCallback: (callback) => withReferenceEngine((engine) => engine.setDrumEvolveOverridesChangedCallback(callback)),
  setSynthEvolveOverridesChangedCallback: (callback) => withReferenceEngine((engine) => engine.setSynthEvolveOverridesChangedCallback(callback)),
  setSynthNoteRangeEvolvedCallback: (callback) => withReferenceEngine((engine) => engine.setSynthNoteRangeEvolvedCallback(callback)),
  setDrumEuclidEvolveConfigs: (configs) => withReferenceEngine((engine) => engine.setDrumEuclidEvolveConfigs(configs as EngineMethodArgs<'setDrumEuclidEvolveConfigs'>[0])),
  setSynthEuclidEvolveConfigs: (configs) => withReferenceEngine((engine) => engine.setSynthEuclidEvolveConfigs(configs as EngineMethodArgs<'setSynthEuclidEvolveConfigs'>[0])),
  setDrumEuclidClockDivs: (divs) => withReferenceEngine((engine) => engine.setDrumEuclidClockDivs(divs as EngineMethodArgs<'setDrumEuclidClockDivs'>[0])),
  setSynthEuclidClockDivs: (divs) => withReferenceEngine((engine) => engine.setSynthEuclidClockDivs(divs as EngineMethodArgs<'setSynthEuclidClockDivs'>[0])),
  setDrumEuclidSwings: (swings) => withReferenceEngine((engine) => engine.setDrumEuclidSwings(swings as EngineMethodArgs<'setDrumEuclidSwings'>[0])),
  setSynthEuclidSwings: (swings) => withReferenceEngine((engine) => engine.setSynthEuclidSwings(swings as EngineMethodArgs<'setSynthEuclidSwings'>[0])),
  setDrumSubLaneEnabled: (states) => withReferenceEngine((engine) => engine.setDrumSubLaneEnabled(states)),
  setSynthSubLaneEnabled: (states) => withReferenceEngine((engine) => engine.setSynthSubLaneEnabled(states)),
  setDrumPitchSettings: (settings) => withReferenceEngine((engine) => engine.setDrumPitchSettings(settings as EngineMethodArgs<'setDrumPitchSettings'>[0])),
  setSynthPitchSettings: (settings) => withReferenceEngine((engine) => engine.setSynthPitchSettings(settings as EngineMethodArgs<'setSynthPitchSettings'>[0])),
  setSynthPitchBindingModes: (modes) => withReferenceEngine((engine) => engine.setSynthPitchBindingModes(modes as EngineMethodArgs<'setSynthPitchBindingModes'>[0])),
  setDrumStepOverrides: (overrides, subLaneStates) => withReferenceEngine((engine) => engine.setDrumStepOverrides(
    overrides as EngineMethodArgs<'setDrumStepOverrides'>[0],
    subLaneStates as EngineMethodArgs<'setDrumStepOverrides'>[1],
  )),
  setSynthStepOverrides: (overrides) => withReferenceEngine((engine) => engine.setSynthStepOverrides(overrides as EngineMethodArgs<'setSynthStepOverrides'>[0])),
  setSequencerPresetHomeSnapshots: () => withReferenceEngine((engine) => engine.setSequencerPresetHomeSnapshots()),
  resetSynthEuclidLaneHome: (laneIndex) => withReferenceEngine((engine) => engine.resetSynthEuclidLaneHome(laneIndex)),
  captureSynthEuclidLaneHome: (laneIndex, pitchState) => withReferenceEngine((engine) => engine.captureSynthEuclidLaneHome(
    laneIndex,
    pitchState as EngineMethodArgs<'captureSynthEuclidLaneHome'>[1],
  )),
  diceSynthEuclidLane: (laneIndex, intensity) => withReferenceEngine((engine) => engine.diceSynthEuclidLane(laneIndex, intensity)),
  resetDrumEuclidLaneHome: (laneIndex) => withReferenceEngine((engine) => engine.resetDrumEuclidLaneHome(laneIndex)),
  captureDrumEuclidLaneHome: (laneIndex, pitchSettings, pitchState) => withReferenceEngine((engine) => engine.captureDrumEuclidLaneHome(
    laneIndex,
    pitchSettings as EngineMethodArgs<'captureDrumEuclidLaneHome'>[1],
    pitchState as EngineMethodArgs<'captureDrumEuclidLaneHome'>[2],
  )),
  diceDrumEuclidLane: (laneIndex, intensity) => withReferenceEngine((engine) => engine.diceDrumEuclidLane(laneIndex, intensity)),
};

export { referenceRuntimeAdapter };
export type { EngineState };
