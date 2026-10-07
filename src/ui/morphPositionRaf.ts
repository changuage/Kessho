import { createRafCoalescedEmitter, type RafCoalescedEmitter } from './sliderSystem/useRafCoalescedEmitter';

export type MorphPositionSchedulerMetrics = {
  frameRequests: number;
  commits: number;
  duplicatePositions: number;
};

export type MorphPositionCommitOptions = {
  flush?: boolean;
};

export type MorphPositionScheduler = {
  schedule(position: number): void;
  flush(position?: number): void;
  cancel(): void;
  reset(): void;
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
  commit: (position: number, options?: MorphPositionCommitOptions) => void,
  requestFrame: RequestFrame,
  cancelFrame: CancelFrame,
): MorphPositionScheduler {
  let lastCommitted: number | null = null;
  let commitOptions: MorphPositionCommitOptions | undefined;
  let cancellationGeneration = 0;
  const counters: MorphPositionSchedulerMetrics = {
    frameRequests: 0,
    commits: 0,
    duplicatePositions: 0,
  };
  let emitter: RafCoalescedEmitter<number>;
  emitter = createRafCoalescedEmitter(
    (position) => {
      const options = commitOptions;
      commitOptions = undefined;
      if (lastCommitted === position && !options?.flush) {
        counters.duplicatePositions += 1;
        return;
      }
      lastCommitted = position;
      counters.commits += 1;
      commit(position, options);
    },
    (callback) => {
      counters.frameRequests += 1;
      const generation = cancellationGeneration;
      return requestFrame((timestamp) => {
        if (generation !== cancellationGeneration) return;
        callback(timestamp);
      });
    },
    cancelFrame,
  );

  return {
    schedule: (position) => emitter.schedule(position),
    flush: (position?: number) => {
      cancellationGeneration += 1;
      commitOptions = { flush: true };
      if (position === undefined) emitter.flush();
      else emitter.flush(position);
      commitOptions = undefined;
    },
    cancel: () => {
      cancellationGeneration += 1;
      emitter.cancel();
    },
    reset: () => {
      cancellationGeneration += 1;
      emitter.cancel();
      commitOptions = undefined;
      lastCommitted = null;
    },
    metrics: () => ({ ...counters }),
  };
}
