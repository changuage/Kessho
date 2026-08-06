import { createRafCoalescedEmitter, type RafCoalescedEmitter } from './sliderSystem/useRafCoalescedEmitter';

export type MorphPositionSchedulerMetrics = {
  frameRequests: number;
  commits: number;
  duplicatePositions: number;
};

export type MorphPositionScheduler = {
  schedule(position: number): void;
  flush(position?: number): void;
  cancel(): void;
  metrics(): MorphPositionSchedulerMetrics;
};

type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (frameId: number) => void;

/**
 * Coalesces high-frequency morph input to one Product update per animation frame.
 * `flush` is used by pointer/key release and endpoints so the final position is
 * committed synchronously. Duplicate positions are discarded before interpolation.
 */
export function createMorphPositionScheduler(
  commit: (position: number) => void,
  requestFrame: RequestFrame,
  cancelFrame: CancelFrame,
): MorphPositionScheduler {
  let lastCommitted: number | null = null;
  const counters: MorphPositionSchedulerMetrics = {
    frameRequests: 0,
    commits: 0,
    duplicatePositions: 0,
  };
  let emitter: RafCoalescedEmitter<number>;
  emitter = createRafCoalescedEmitter(
    (position) => {
      if (lastCommitted === position) {
        counters.duplicatePositions += 1;
        return;
      }
      lastCommitted = position;
      counters.commits += 1;
      commit(position);
    },
    (callback) => {
      counters.frameRequests += 1;
      return requestFrame(callback);
    },
    cancelFrame,
  );

  return {
    schedule: (position) => emitter.schedule(position),
    flush: (position?: number) => {
      if (position === undefined) emitter.flush();
      else emitter.flush(position);
    },
    cancel: () => emitter.cancel(),
    metrics: () => ({ ...counters }),
  };
}
