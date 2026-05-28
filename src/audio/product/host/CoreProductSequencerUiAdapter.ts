import { CORE_PRODUCT_SEQUENCER_IDS } from '../../coreProductEvents';
import {
  type CoreProductTelemetrySnapshot,
  type CoreProductSequencerLaneUiState,
} from '../../coreProductTelemetry';
import {
  type SequencerKind,
  type SequencerStepToggleOverride,
  type SequencerStepValueConfig,
  type SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';
import {
  coreProductDrumEvolvePayloadFromLane,
  coreProductStepValueConfigsFromLane,
  coreProductStepValueOverridesFromLane,
  coreProductSynthEvolvePayloadFromLane,
} from '../../CoreProductHostSequencerUiState';

const CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE = 3;
const CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME = 4;

type SequencerLaneState = {
  toggles: SequencerStepToggleOverride[];
  values: SequencerStepValueOverride[];
  configs: SequencerStepValueConfig[];
};

type CoreProductSequencerUiAdapterOptions = {
  telemetry: CoreProductTelemetrySnapshot;
  lastRevision: number;
  visibleSynthLaneCount: number;
  synthPitchSettings: unknown;
  synthBaseMidi: (laneIndex: number) => number;
  drumBaseMidi: (laneIndex: number) => number;
  hasManualSynthDice: (laneIndex: number) => boolean;
  consumeManualDrumDice: (laneIndex: number) => boolean;
  ensureLaneCache: (sequencer: SequencerKind, laneIndex: number) => void;
  captureLaneHome: (sequencer: SequencerKind, laneIndex: number) => void;
  setSynthLaneState: (laneIndex: number, state: SequencerLaneState) => void;
  setDrumLaneState: (laneIndex: number, state: SequencerLaneState) => void;
  publish: (name: 'synthEvolveOverrides' | 'drumEvolveOverrides', laneIndex: number, payload: Record<string, unknown>) => void;
};

export function reconcileCoreProductSequencerUiState(options: CoreProductSequencerUiAdapterOptions): number {
  const state = options.telemetry.sequencerUiState;
  const revision = options.telemetry.sequencerUiStateRevision ?? state?.revision ?? 0;
  if (!state || revision === 0 || revision === options.lastRevision) return options.lastRevision;

  const laneIndex = state.lastChangedLaneIndex;
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= 16) return revision;

  const shouldNotify =
    state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE ||
    state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME;

  if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.synth) {
    if (laneIndex >= options.visibleSynthLaneCount) return revision;
    const lane = state.synthLanes[laneIndex];
    if (!lane) return revision;
    const manualDice =
      state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE &&
      options.hasManualSynthDice(laneIndex);
    reconcileSynthSequencerLane(options, laneIndex, lane, shouldNotify, manualDice);
    if (manualDice) options.captureLaneHome('synth', laneIndex);
    return revision;
  }

  if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum) {
    const lane = state.drumLanes[laneIndex];
    if (!lane) return revision;
    reconcileDrumSequencerLane(options, laneIndex, lane, shouldNotify);
    if (
      state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE &&
      options.consumeManualDrumDice(laneIndex)
    ) {
      options.captureLaneHome('drum', laneIndex);
    }
  }

  return revision;
}

function reconcileSynthSequencerLane(
  options: CoreProductSequencerUiAdapterOptions,
  laneIndex: number,
  lane: CoreProductSequencerLaneUiState,
  notify: boolean,
  denseStepValues = false,
): void {
  options.ensureLaneCache('synth', laneIndex);
  const includeEmpty = lane.mutationFlags === 0;
  const values = coreProductStepValueOverridesFromLane(lane, true, denseStepValues);
  options.setSynthLaneState(laneIndex, {
    toggles: lane.triggerToggles.map(([step, value]) => ({ step, value })),
    values,
    configs: coreProductStepValueConfigsFromLane(lane, true),
  });
  const payload = coreProductSynthEvolvePayloadFromLane(
    lane,
    options.synthBaseMidi(laneIndex),
    includeEmpty,
    options.synthPitchSettings,
    laneIndex,
  );
  if (notify) {
    options.publish('synthEvolveOverrides', laneIndex, payload);
  }
}

function reconcileDrumSequencerLane(
  options: CoreProductSequencerUiAdapterOptions,
  laneIndex: number,
  lane: CoreProductSequencerLaneUiState,
  notify: boolean,
): void {
  options.ensureLaneCache('drum', laneIndex);
  const includeEmpty = lane.mutationFlags === 0;
  options.setDrumLaneState(laneIndex, {
    toggles: lane.triggerToggles.map(([step, value]) => ({ step, value })),
    values: coreProductStepValueOverridesFromLane(lane, true),
    configs: coreProductStepValueConfigsFromLane(lane, true),
  });
  const payload = coreProductDrumEvolvePayloadFromLane(
    lane,
    laneIndex,
    options.drumBaseMidi(laneIndex),
    includeEmpty,
  );
  if (notify) {
    options.publish('drumEvolveOverrides', laneIndex, payload);
  }
}
