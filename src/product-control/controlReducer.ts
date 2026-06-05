import type { SliderState } from '../ui/state';
import type { ProductControlAction } from './ProductControlActions';
import { nextProductControlRevision } from './ProductStateRevision';
import {
  clampMorphPosition,
  cloneSliderState,
  createMorphEndpointState,
  createMorphState,
  type MorphEndpointName,
  type MorphEndpointState,
  type MorphState,
  type ProductControlReason,
  type ProductControlState,
  type ProductControlTarget,
} from './ProductControlState';

function targetMorph(state: ProductControlState, target: ProductControlTarget): MorphState {
  return target === 'synth' ? state.synthMorph : state.drumMorph;
}

function withTargetMorph(
  state: ProductControlState,
  target: ProductControlTarget,
  morph: MorphState,
): ProductControlState {
  return target === 'synth'
    ? { ...state, synthMorph: morph }
    : { ...state, drumMorph: morph };
}

function endpointForName(morph: MorphState, endpoint: MorphEndpointName): MorphEndpointState {
  return endpoint === 'A' ? morph.presetA : morph.presetB;
}

function withEndpoint(
  morph: MorphState,
  endpoint: MorphEndpointName,
  nextEndpoint: MorphEndpointState,
): MorphState {
  return endpoint === 'A'
    ? { ...morph, presetA: nextEndpoint }
    : { ...morph, presetB: nextEndpoint };
}

function editEndpoint(
  morph: MorphState,
  endpoint: MorphEndpointName,
  key: keyof SliderState,
  value: SliderState[keyof SliderState],
): MorphState {
  const current = endpointForName(morph, endpoint);
  return withEndpoint(morph, endpoint, {
    ...current,
    sliders: {
      ...current.sliders,
      [key]: value,
    } as SliderState,
  });
}

function commitState(
  previous: ProductControlState,
  next: ProductControlState,
  reason: ProductControlReason,
  triggerCritical: boolean,
  soundAffecting = true,
): ProductControlState {
  return {
    ...next,
    revision: soundAffecting ? nextProductControlRevision(previous.revision) : previous.revision,
    lastReason: reason,
    triggerCritical,
  };
}

function resetMorphToPreset(
  previous: MorphState,
  sliders: SliderState,
  presetId: string,
): MorphState {
  return createMorphState(sliders, {
    presetAId: presetId,
    presetBId: presetId,
    keys: previous.keys,
  });
}

function midpointEndpointForPosition(position: number): MorphEndpointName | null {
  const clamped = clampMorphPosition(position);
  if (clamped <= 0.000001) return 'A';
  if (clamped >= 0.999999) return 'B';
  return null;
}

export function reduceProductControlState(
  previous: ProductControlState,
  action: ProductControlAction,
): ProductControlState {
  switch (action.type) {
    case 'slider/edit': {
      const rawSliders = {
        ...previous.rawSliders,
        [action.key]: action.value,
      } as SliderState;
      return commitState(
        previous,
        { ...previous, rawSliders },
        'ui-control-change',
        action.triggerCritical ?? true,
      );
    }
    case 'preset/load': {
      const rawSliders = cloneSliderState(action.sliders);
      return commitState(
        previous,
        {
          ...previous,
          rawSliders,
          synthMorph: resetMorphToPreset(previous.synthMorph, rawSliders, action.presetId),
          drumMorph: resetMorphToPreset(previous.drumMorph, rawSliders, action.presetId),
          overrides: { visibleMidpoint: { synth: {}, drum: {} } },
        },
        'preset-load',
        true,
      );
    }
    case 'morph/position-set': {
      const morph = {
        ...targetMorph(previous, action.target),
        position: clampMorphPosition(action.position),
      };
      return commitState(
        previous,
        withTargetMorph(previous, action.target, morph),
        'morph-control-change',
        action.triggerCritical ?? true,
      );
    }
    case 'morph/endpoint-replace': {
      const morph = targetMorph(previous, action.target);
      const nextEndpoint = createMorphEndpointState(action.sliders, action.presetId, action.endpoint);
      return commitState(
        previous,
        withTargetMorph(previous, action.target, withEndpoint(morph, action.endpoint, nextEndpoint)),
        'morph-control-change',
        true,
      );
    }
    case 'morph/endpoint-edit': {
      const morph = targetMorph(previous, action.target);
      return commitState(
        previous,
        withTargetMorph(previous, action.target, editEndpoint(morph, action.endpoint, action.key, action.value)),
        'morph-control-change',
        true,
      );
    }
    case 'morph/midpoint-edit': {
      const morph = targetMorph(previous, action.target);
      const endpoint = midpointEndpointForPosition(morph.position);
      if (endpoint) {
        return commitState(
          previous,
          withTargetMorph(previous, action.target, editEndpoint(morph, endpoint, action.key, action.value)),
          'morph-control-change',
          true,
        );
      }
      const policy = action.policy ?? previous.midMorphEditPolicy;
      if (policy === 'disallow-midpoint-edits') {
        return commitState(previous, previous, 'morph-control-change', false, false);
      }
      const targetOverrides = {
        ...previous.overrides.visibleMidpoint[action.target],
        [action.key]: action.value,
      };
      return commitState(
        previous,
        {
          ...previous,
          overrides: {
            visibleMidpoint: {
              ...previous.overrides.visibleMidpoint,
              [action.target]: targetOverrides,
            },
          },
        },
        'morph-control-change',
        true,
      );
    }
    case 'sequencer/edit':
      return commitState(
        previous,
        { ...previous, sequencer: { patch: { ...previous.sequencer.patch, ...action.patch } } },
        'sequencer-control-change',
        action.triggerCritical ?? true,
      );
    case 'transport/edit':
      return commitState(
        previous,
        { ...previous, rawSliders: { ...previous.rawSliders, ...action.patch } as SliderState },
        'transport-change',
        action.triggerCritical ?? true,
      );
    case 'manual-trigger/request':
      return commitState(previous, previous, 'manual-trigger', true, false);
    case 'session/restore': {
      const rawSliders = cloneSliderState(action.sliders);
      return commitState(
        previous,
        {
          ...previous,
          rawSliders,
          synthMorph: action.morph?.synthMorph ?? createMorphState(rawSliders, { keys: previous.synthMorph.keys }),
          drumMorph: action.morph?.drumMorph ?? createMorphState(rawSliders, { keys: previous.drumMorph.keys }),
          overrides: action.morph?.overrides ?? previous.overrides,
        },
        'session-restore',
        true,
      );
    }
    case 'ui/view-change':
      return commitState(previous, previous, 'ui-only', false, false);
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
