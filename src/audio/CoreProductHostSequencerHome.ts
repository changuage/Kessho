import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerLaneParamEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  type CoreProductEvent,
  type CoreProductStepValueField,
} from './coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import type {
  SequencerKind,
  SequencerStepToggleOverride,
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from './CoreProductHostSequencerAdapter';
import { coreProductSynthMidiToUiPitch } from './CoreProductHostSynthPitch';
import { addCoreProductRangePayload, applyCoreProductRangeSubLanePatch, coreProductRangeForField } from './CoreProductHostSequencerRangePayload';
import type { SequencerPitchSettings } from './sequencerPitchSettings';

export type CoreProductSequencerHomeState = { toggles: SequencerStepToggleOverride[]; values: SequencerStepValueOverride[]; configs: SequencerStepValueConfig[]; swing: number; noteRange?: { min: number; max: number } | null; pitchSettings?: SequencerPitchSettings | null; pitchScaleQuantize?: boolean | null; pitchSubLaneState?: { steps?: number; direction?: 'forward' | 'reverse' | 'pingpong'; scaleQuantize?: boolean } | null };

const STEP_VALUE_PAYLOAD_KEYS = {
  [CORE_PRODUCT_STEP_VALUE_FIELDS.probability]: 'probability',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet]: 'ratchet',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition]: 'trigCondition',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote]: 'pitch',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.expression]: 'expression',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.morph]: 'morph',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.distance]: 'distance',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.nudge]: 'nudge',
} as const satisfies Partial<Record<CoreProductStepValueField, string>>;

const DIRECTION_PAYLOAD_KEYS = {
  [CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote]: 'pitchDirection',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.expression]: 'expressionDirection',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.morph]: 'morphDirection',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.distance]: 'distanceDirection',
  [CORE_PRODUCT_STEP_VALUE_FIELDS.nudge]: 'nudgeDirection',
} as const satisfies Partial<Record<CoreProductStepValueField, string>>;

function cloneHomeState(state: CoreProductSequencerHomeState): CoreProductSequencerHomeState {
  return {
    toggles: state.toggles.map((entry) => ({ ...entry })),
    values: state.values.map((entry) => ({ ...entry })),
    configs: state.configs.map((entry) => ({ ...entry })),
    swing: state.swing,
    noteRange: state.noteRange ? { ...state.noteRange } : state.noteRange,
    pitchSettings: state.pitchSettings ? { ...state.pitchSettings } : state.pitchSettings,
    pitchScaleQuantize: state.pitchScaleQuantize == null ? state.pitchScaleQuantize : false,
    pitchSubLaneState: state.pitchSubLaneState
      ? { ...state.pitchSubLaneState, ...(typeof state.pitchSubLaneState.scaleQuantize === 'boolean' ? { scaleQuantize: false } : {}) }
      : state.pitchSubLaneState,
  };
}

function hasStepStateContent(state: CoreProductSequencerHomeState): boolean { return state.toggles.length > 0 || state.values.length > 0 || state.configs.length > 0 || state.noteRange != null; }

function hasCapturedHomeContent(state: CoreProductSequencerHomeState): boolean { return hasStepStateContent(state) || (typeof state.swing === 'number' && Number.isFinite(state.swing)); }

function homeDirectionName(direction: number): 'forward' | 'reverse' | 'pingpong' {
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return 'reverse';
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return 'pingpong';
  return 'forward';
}

function mergePitchSubLaneState(
  base: { enabled?: boolean; steps?: number; direction?: 'forward' | 'reverse' | 'pingpong'; scaleQuantize?: boolean },
  patch: { steps?: number; direction?: 'forward' | 'reverse' | 'pingpong'; scaleQuantize?: boolean },
): { enabled?: boolean; steps?: number; direction?: 'forward' | 'reverse' | 'pingpong'; scaleQuantize?: boolean } {
  const next = { ...base };
  if (typeof patch.steps === 'number' && Number.isFinite(patch.steps)) {
    next.steps = Math.max(1, Math.min(64, Math.floor(patch.steps)));
  }
  if (patch.direction === 'forward' || patch.direction === 'reverse' || patch.direction === 'pingpong') {
    next.direction = patch.direction;
  }
  if (typeof patch.scaleQuantize === 'boolean') {
    next.scaleQuantize = false;
  }
  return next;
}

function homeLaneArray<T>(value: T, laneIndex: number): (T | null)[] {
  const lanes: (T | null)[] = [null, null, null, null];
  if (laneIndex >= 0 && laneIndex < lanes.length) lanes[laneIndex] = value;
  return lanes;
}

export function createCoreProductSequencerHomeStore() {
  const homes: Record<SequencerKind, (CoreProductSequencerHomeState | null)[]> = { synth: [], drum: [] };
  const pendingManualDice: Record<SequencerKind, boolean[]> = { synth: [], drum: [] };
  const pendingManualDiceReady: Record<SequencerKind, boolean[]> = { synth: [], drum: [] };
  return {
    capture(
      sequencer: SequencerKind,
      laneIndex: number,
      state: CoreProductSequencerHomeState,
      options: { force?: boolean; requireContent?: boolean } = {},
    ): void {
      if (laneIndex < 0 || laneIndex >= 16) return;
      if (options.requireContent && !hasStepStateContent(state)) return;
      const existing = homes[sequencer][laneIndex];
      if (!options.force && existing && hasCapturedHomeContent(existing)) {
        if (existing.noteRange == null && state.noteRange != null) {
          homes[sequencer][laneIndex] = cloneHomeState({ ...existing, noteRange: state.noteRange });
        }
        return;
      }
      homes[sequencer][laneIndex] = cloneHomeState(state);
    },
    restore(sequencer: SequencerKind, laneIndex: number): CoreProductSequencerHomeState | null {
      const home = homes[sequencer][laneIndex];
      return home ? cloneHomeState(home) : null;
    },
    armManualDice(sequencer: SequencerKind, laneIndex: number): void {
      if (laneIndex < 0 || laneIndex >= 16) return;
      pendingManualDice[sequencer][laneIndex] = true;
      pendingManualDiceReady[sequencer][laneIndex] = false;
    },
    hasManualDice(sequencer: SequencerKind, laneIndex: number): boolean { return pendingManualDice[sequencer][laneIndex] === true; },
    markManualDiceReady(sequencer: SequencerKind, laneIndex: number): void {
      if (pendingManualDice[sequencer][laneIndex] === true) pendingManualDiceReady[sequencer][laneIndex] = true;
    },
    completeManualDice(sequencer: SequencerKind, laneIndex: number): void {
      pendingManualDice[sequencer][laneIndex] = false;
      pendingManualDiceReady[sequencer][laneIndex] = false;
    },
    consumeManualDiceIfReady(sequencer: SequencerKind, laneIndex: number): boolean {
      if (pendingManualDiceReady[sequencer][laneIndex] !== true) return false;
      return this.consumeManualDice(sequencer, laneIndex);
    },
    consumeManualDice(sequencer: SequencerKind, laneIndex: number): boolean {
      const pending = pendingManualDice[sequencer][laneIndex] === true;
      pendingManualDice[sequencer][laneIndex] = false;
      pendingManualDiceReady[sequencer][laneIndex] = false;
      return pending;
    },
  };
}

export function postCoreProductSequencerLaneStepState(args: {
  sequencer: SequencerKind;
  laneIndex: number;
  state: CoreProductSequencerHomeState;
  fieldEnabled: (field: CoreProductStepValueField) => boolean;
  post: (event: CoreProductEvent) => void;
}): void {
  args.post(createCoreProductSequencerClearStepsEvent(args.sequencer, args.laneIndex));
  for (const config of args.state.configs) {
    if (args.fieldEnabled(config.field)) {
      args.post(createCoreProductSequencerSubLaneConfigEvent(args.sequencer, args.laneIndex, config.field, config.steps, config.direction));
    }
  }
  for (const toggle of args.state.toggles) {
    args.post(createCoreProductSequencerStepEvent(args.sequencer, args.laneIndex, toggle.step, toggle.value));
  }
  for (const value of args.state.values) {
    if (args.fieldEnabled(value.field)) {
      args.post(createCoreProductSequencerStepValueEvent(args.sequencer, args.laneIndex, value.step, value.field, value.value, value.value2 ?? 0, value.range ? CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0));
    }
  }
  args.post(createCoreProductSequencerLaneParamEvent(args.sequencer, args.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, args.state.swing));
}

export function coreProductSequencerHomePayload(
  sequencer: SequencerKind,
  laneIndex: number,
  state: CoreProductSequencerHomeState,
  baseMidi: number,
  pitchSettings?: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { swing: state.swing };
  const homePitchSettings = state.pitchSettings ? [null, null, null, null].map((_, index) => index === laneIndex ? { ...state.pitchSettings! } : null) : null;
  if (homePitchSettings) payload.pitchSettings = homePitchSettings;
  const toggles = new Map(state.toggles.map((entry) => [entry.step, entry.value] as const));
  payload.triggerToggles = sequencer === 'synth' ? toggles : homeLaneArray(toggles, laneIndex);
  for (const field of Object.values(CORE_PRODUCT_STEP_VALUE_FIELDS) as CoreProductStepValueField[]) {
    const key = STEP_VALUE_PAYLOAD_KEYS[field];
    if (!key) continue;
    const fieldEntries = state.values
      .filter((entry) => entry.field === field && entry.range !== true)
      .sort((left, right) => left.step - right.step);
    let values = fieldEntries.map((entry) => {
      if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote) return entry.value;
      if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition) return [entry.value, entry.value2 ?? 1];
      return entry.value;
    });
    const range = coreProductRangeForField(state.values, field);
    if (range && values.length === 0) {
      const steps = state.configs.find((entry) => entry.field === field)?.steps ?? 1;
      values = Array.from({ length: Math.max(1, steps) }, () => (range.min + range.max) * 0.5);
    }
    if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote) values = sequencer === 'synth' ? coreProductSynthMidiToUiPitch(values as number[], homePitchSettings ?? pitchSettings, laneIndex, baseMidi) : (values as number[]).map((value) => Math.round(value - baseMidi));
    payload[key] = sequencer === 'synth' ? values : homeLaneArray(values, laneIndex);
  }
  const subLaneStates: Record<string, { enabled?: boolean; steps?: number; direction?: 'forward' | 'reverse' | 'pingpong'; scaleQuantize?: boolean; valueMode?: 'range'; rangeMin?: number; rangeMax?: number }> = {};
  for (const config of state.configs) {
    const directionKey = DIRECTION_PAYLOAD_KEYS[config.field];
    if (!directionKey) continue;
    const direction = homeDirectionName(config.direction);
    payload[directionKey] = sequencer === 'synth' ? direction : homeLaneArray(direction, laneIndex);
    const laneKey = directionKey.replace('Direction', '');
    subLaneStates[laneKey] = { ...(subLaneStates[laneKey] ?? {}), enabled: true, steps: config.steps, direction };
  }
  for (const key of ['pitch', 'expression', 'morph', 'distance']) subLaneStates[key] ??= { enabled: false, steps: 1, direction: 'forward' };
  if (state.pitchSubLaneState) subLaneStates.pitch = mergePitchSubLaneState(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }, state.pitchSubLaneState);
  else if (state.pitchScaleQuantize != null) subLaneStates.pitch = mergePitchSubLaneState(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }, { scaleQuantize: state.pitchScaleQuantize });
  applyCoreProductRangeSubLanePatch(subLaneStates, state.values);
  addCoreProductRangePayload(payload, sequencer, laneIndex, state.values);
  if (Object.keys(subLaneStates).length > 0) payload.subLaneStates = subLaneStates;
  return payload;
}
