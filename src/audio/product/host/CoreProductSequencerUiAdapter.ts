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
  coreProductStepValueOverridesFromLane,
  coreProductSynthEvolvePayloadFromLane,
} from '../../CoreProductHostSequencerUiState';
import { reconcileCoreProductSequencerSynthNoteRange } from './CoreProductSequencerNoteRangeEvolveBridge';
import { coreProductStepValueConfigsFromLaneOrPrevious } from './CoreProductSequencerSparseTelemetryBridge';

const CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE = 3;
const CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME = 4;

type SequencerLaneState = {
  toggles: SequencerStepToggleOverride[];
  values: SequencerStepValueOverride[];
  configs: SequencerStepValueConfig[];
  swing: number;
};

type CoreProductSequencerUiAdapterOptions = {
  telemetry: CoreProductTelemetrySnapshot;
  lastRevision: number;
  visibleSynthLaneCount: number;
  synthPitchSettings: unknown;
  synthBaseMidi: (laneIndex: number) => number;
  drumBaseMidi: (laneIndex: number) => number;
  hasManualSynthDice: (laneIndex: number) => boolean;
  manualSynthDiceChanged: (laneIndex: number, lane: CoreProductSequencerLaneUiState) => boolean;
  completeManualSynthDice: (laneIndex: number) => void;
  consumeManualDrumDice: (laneIndex: number) => boolean;
  ensureLaneCache: (sequencer: SequencerKind, laneIndex: number) => void;
  getLaneState: (sequencer: SequencerKind, laneIndex: number) => SequencerLaneState;
  captureLaneHome: (sequencer: SequencerKind, laneIndex: number) => void;
  setSynthLaneState: (laneIndex: number, state: SequencerLaneState) => void;
  setDrumLaneState: (laneIndex: number, state: SequencerLaneState) => void;
  setLaneSwing: (sequencer: SequencerKind, laneIndex: number, swing: number) => void;
  setSynthNoteRangeOverride: (laneIndex: number, range: { min: number; max: number } | null) => void;
  publishNoteRange: (laneIndex: number, noteMin: number, noteMax: number) => void;
  publish: (name: string, laneIndex: number, payload?: Record<string, unknown>) => void;
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
    const diceChange = state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE;
    const manualDice = options.hasManualSynthDice(laneIndex) && (diceChange || options.manualSynthDiceChanged(laneIndex, lane));
    reconcileSynthSequencerLane(options, laneIndex, lane, shouldNotify || manualDice, manualDice, state.lastChangeKind);
    if (manualDice || diceChange) {
      options.captureLaneHome('synth', laneIndex);
    }
    if (manualDice) {
      options.completeManualSynthDice(laneIndex);
    }
    return revision;
  }

  if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum) {
    const lane = state.drumLanes[laneIndex];
    if (!lane) return revision;
    const diceChange = state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE;
    const manualDice = diceChange && options.consumeManualDrumDice(laneIndex);
    reconcileDrumSequencerLane(options, laneIndex, lane, shouldNotify, diceChange);
    if (manualDice) options.captureLaneHome('drum', laneIndex);
  }

  return revision;
}

function reconcileSynthSequencerLane(
  options: CoreProductSequencerUiAdapterOptions,
  laneIndex: number,
  lane: CoreProductSequencerLaneUiState,
  notify: boolean,
  denseStepValues = false,
  changeKind = 0,
): void {
  options.ensureLaneCache('synth', laneIndex);
  const previous = options.getLaneState('synth', laneIndex);
  const includeEmpty = lane.mutationFlags === 0;
  const values = coreProductStepValueOverridesFromLane(lane, true, denseStepValues);
  options.setSynthLaneState(laneIndex, {
    toggles: lane.triggerToggles.map(([step, value]) => ({ step, value })),
    values,
    configs: coreProductStepValueConfigsFromLaneOrPrevious(lane, true, previous.configs, denseStepValues),
    swing: lane.swing,
  });
  options.setLaneSwing('synth', laneIndex, lane.swing);
  const baseMidi = laneBaseMidi(lane, options.synthBaseMidi(laneIndex));
  const payload = coreProductSynthEvolvePayloadFromLane(
    lane,
    baseMidi,
    includeEmpty,
    options.synthPitchSettings,
    laneIndex,
  );
  if (notify) {
    if (denseStepValues) payload.manualDiceHome = true;
    options.publish('synthEvolveOverrides', laneIndex, payload);
    reconcileCoreProductSequencerSynthNoteRange({ laneIndex, lane, synthPitchSettings: options.synthPitchSettings, clearOverride: changeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME, setSynthNoteRangeOverride: options.setSynthNoteRangeOverride, publishNoteRange: options.publishNoteRange });
  }
}

function reconcileDrumSequencerLane(
  options: CoreProductSequencerUiAdapterOptions,
  laneIndex: number,
  lane: CoreProductSequencerLaneUiState,
  notify: boolean,
  denseStepValues = false,
): void {
  options.ensureLaneCache('drum', laneIndex);
  const previous = options.getLaneState('drum', laneIndex);
  const includeEmpty = lane.mutationFlags === 0;
  options.setDrumLaneState(laneIndex, {
    toggles: lane.triggerToggles.map(([step, value]) => ({ step, value })),
    values: coreProductStepValueOverridesFromLane(lane, true, denseStepValues),
    configs: coreProductStepValueConfigsFromLaneOrPrevious(lane, true, previous.configs, denseStepValues),
    swing: lane.swing,
  });
  options.setLaneSwing('drum', laneIndex, lane.swing);
  const baseMidi = laneBaseMidi(lane, options.drumBaseMidi(laneIndex));
  const payload = coreProductDrumEvolvePayloadFromLane(
    lane,
    laneIndex,
    baseMidi,
    includeEmpty,
  );
  if (notify) {
    options.publish('drumEvolveOverrides', laneIndex, payload);
  }
}

function laneBaseMidi(lane: CoreProductSequencerLaneUiState, fallback: number): number {
  return typeof lane.baseMidiNote === 'number' && Number.isFinite(lane.baseMidiNote)
    ? lane.baseMidiNote
    : fallback;
}
