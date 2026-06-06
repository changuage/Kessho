import {
  createCoreProductSequencerHomeCaptureEvent,
  type CoreProductEvent,
} from '../coreProductEvents';
import type { SequencerKind } from '../CoreProductHostSequencerAdapter';

type SequencerPitchHomeState = {
  steps?: unknown;
  direction?: unknown;
  scaleQuantize?: unknown;
} | null | undefined;

const VISIBLE_SEQUENCER_LANES = 4;

export function createCoreProductSequencerLaneHomeCaptureEvent(
  sequencer: SequencerKind,
  laneIndex: number,
  pitchState?: SequencerPitchHomeState,
): CoreProductEvent {
  return createCoreProductSequencerHomeCaptureEvent(sequencer, laneIndex, pitchState, { force: true });
}

export function createCoreProductSequencerPresetHomeCaptureEvents(
  drumPitchStates?: readonly SequencerPitchHomeState[],
  synthPitchStates?: readonly SequencerPitchHomeState[],
): CoreProductEvent[] {
  const events: CoreProductEvent[] = [];
  const synthLaneCount = visibleLaneCount(synthPitchStates);
  for (let laneIndex = 0; laneIndex < synthLaneCount; laneIndex += 1) {
    events.push(createCoreProductSequencerHomeCaptureEvent('synth', laneIndex, synthPitchStates?.[laneIndex], { force: true }));
  }
  const drumLaneCount = visibleLaneCount(drumPitchStates);
  for (let laneIndex = 0; laneIndex < drumLaneCount; laneIndex += 1) {
    events.push(createCoreProductSequencerHomeCaptureEvent('drum', laneIndex, drumPitchStates?.[laneIndex], { force: true }));
  }
  return events;
}

function visibleLaneCount(states?: readonly SequencerPitchHomeState[]): number {
  return Math.max(VISIBLE_SEQUENCER_LANES, Math.min(16, states?.length || VISIBLE_SEQUENCER_LANES));
}
