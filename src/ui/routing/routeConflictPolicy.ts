import type { SliderMode, SliderState } from '../state';
import type { DualSliderRange } from '../DualSlider';
import { numericStateValue, ROUTING_ACTIVE_EPSILON } from './routePredicates';

export type DegradeReverbDirection = 'degrade-to-reverb' | 'reverb-to-degrade';

export interface RouteConflictOptions {
  preserveActiveDirection?: DegradeReverbDirection | 'largest' | 'last-edited';
  lastEditedDirection?: DegradeReverbDirection;
  allowDualRange?: boolean;
}

type CrossfeedPatch = Partial<Pick<SliderState, 'degradeReverbSend' | 'reverbDegradeSend'>>;

function activeDirectionFromState(state: SliderState | undefined): DegradeReverbDirection | null {
  if (!state) return null;
  const degradeToReverb = numericStateValue(state, 'degradeReverbSend');
  const reverbToDegrade = numericStateValue(state, 'reverbDegradeSend');
  if (degradeToReverb > ROUTING_ACTIVE_EPSILON && reverbToDegrade <= ROUTING_ACTIVE_EPSILON) return 'degrade-to-reverb';
  if (reverbToDegrade > ROUTING_ACTIVE_EPSILON && degradeToReverb <= ROUTING_ACTIVE_EPSILON) return 'reverb-to-degrade';
  return null;
}

function preferredConflictDirection(
  degradeToReverb: number,
  reverbToDegrade: number,
  previousState: SliderState | undefined,
  options: RouteConflictOptions,
): DegradeReverbDirection {
  if (options.preserveActiveDirection === 'last-edited' && options.lastEditedDirection) {
    return options.lastEditedDirection;
  }
  if (options.preserveActiveDirection === 'degrade-to-reverb' || options.preserveActiveDirection === 'reverb-to-degrade') {
    return options.preserveActiveDirection;
  }
  if (degradeToReverb > reverbToDegrade) return 'degrade-to-reverb';
  if (reverbToDegrade > degradeToReverb) return 'reverb-to-degrade';
  return activeDirectionFromState(previousState) ?? 'degrade-to-reverb';
}

export function normalizeDegradeReverbCrossfeed<T extends CrossfeedPatch>(
  patch: T,
  previousState?: SliderState,
  options: RouteConflictOptions = {},
): T {
  if (options.allowDualRange) return patch;

  const degradeToReverb = Number(
    patch.degradeReverbSend ?? previousState?.degradeReverbSend ?? 0,
  );
  const reverbToDegrade = Number(
    patch.reverbDegradeSend ?? previousState?.reverbDegradeSend ?? 0,
  );

  if (!Number.isFinite(degradeToReverb) || !Number.isFinite(reverbToDegrade)) return patch;
  if (degradeToReverb <= ROUTING_ACTIVE_EPSILON || reverbToDegrade <= ROUTING_ACTIVE_EPSILON) return patch;

  const next = { ...patch } as CrossfeedPatch;
  const keep = preferredConflictDirection(degradeToReverb, reverbToDegrade, previousState, options);
  if (keep === 'degrade-to-reverb') next.reverbDegradeSend = 0;
  else next.degradeReverbSend = 0;
  return next as T;
}

export function normalizeDegradeReverbCrossfeedRanges(
  state: SliderState,
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
  dualModes: Record<string, SliderMode>,
): void {
  if (numericStateValue(state, 'degradeReverbSend') > ROUTING_ACTIVE_EPSILON) {
    delete dualRanges.reverbDegradeSend;
    dualModes.reverbDegradeSend = 'single';
  } else if (numericStateValue(state, 'reverbDegradeSend') > ROUTING_ACTIVE_EPSILON) {
    delete dualRanges.degradeReverbSend;
    dualModes.degradeReverbSend = 'single';
  }
}

