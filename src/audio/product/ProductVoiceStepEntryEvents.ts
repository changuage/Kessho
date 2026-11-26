import type { CoreProductEvent } from '../coreProductEvents';
import { createCoreProductSynthSequencerLaneStepOverrideEvents } from './ProductSequencerStepOverrideEvents';

export type ProductVoiceStepEventInput = Readonly<{
  step: number;
  pitch: number;
  velocity: number;
}>;

export type ProductVoiceStepCommit = Readonly<{
  laneIndex: number;
  overrides: {
    triggerToggles: boolean[][];
    pitch: Array<Array<number | undefined>>;
    expression: Array<Array<number | undefined>>;
  };
  events: CoreProductEvent[];
}>;

/**
 * Converts a voice-entry draft into the existing Product Core synth lane
 * contract. Velocity is represented by the synth lane's per-step expression
 * value; Product Core already owns trigger and MIDI-note step semantics.
 */
export function createProductVoiceStepCommit(
  take: readonly ProductVoiceStepEventInput[],
  laneIndex = 0,
  stepCount = 16,
): ProductVoiceStepCommit {
  const safeLaneIndex = Math.max(0, Math.min(15, Math.round(laneIndex)));
  const safeStepCount = Math.max(1, Math.min(64, Math.round(stepCount)));
  const triggerLane = Array<boolean>(safeStepCount).fill(false);
  const pitchLane = Array<number | undefined>(safeStepCount).fill(undefined);
  const expressionLane = Array<number | undefined>(safeStepCount).fill(undefined);

  for (const event of take) {
    const step = Math.round(event.step);
    if (step < 0 || step >= safeStepCount) continue;
    triggerLane[step] = true;
    pitchLane[step] = Math.max(0, Math.min(127, Math.round(event.pitch)));
    expressionLane[step] = Math.max(0, Math.min(1, event.velocity / 127));
  }

  const lanePad = <T>(lane: T): T[] => Array.from({ length: safeLaneIndex + 1 }, (_, index) => (
    index === safeLaneIndex ? lane : ([] as unknown as T)
  ));
  const overrides = {
    triggerToggles: lanePad(triggerLane),
    pitch: lanePad(pitchLane),
    expression: lanePad(expressionLane),
  };
  const events = createCoreProductSynthSequencerLaneStepOverrideEvents(safeLaneIndex, overrides);
  return { laneIndex: safeLaneIndex, overrides, events };
}
