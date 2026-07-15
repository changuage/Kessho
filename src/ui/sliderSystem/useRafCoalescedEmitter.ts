import { useEffect, useRef } from 'react';

export interface RafCoalescedEmitter<T> {
  schedule(value: T): void;
  flush(value?: T): void;
  cancel(): void;
}

type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (frameId: number) => void;

export function createRafCoalescedEmitter<T>(
  emit: (value: T) => void,
  requestFrame: RequestFrame,
  cancelFrame: CancelFrame,
): RafCoalescedEmitter<T> {
  let pendingValue: T | undefined;
  let hasPendingValue = false;
  let frameId: number | null = null;

  const cancel = () => {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    pendingValue = undefined;
    hasPendingValue = false;
  };

  return {
    schedule(value) {
      pendingValue = value;
      hasPendingValue = true;
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        if (!hasPendingValue) return;
        const valueToEmit = pendingValue as T;
        pendingValue = undefined;
        hasPendingValue = false;
        emit(valueToEmit);
      });
    },
    flush(value) {
      const shouldEmit = arguments.length > 0 || hasPendingValue;
      const valueToEmit = arguments.length > 0 ? value as T : pendingValue as T;
      cancel();
      if (shouldEmit) emit(valueToEmit);
    },
    cancel,
  };
}

export function useRafCoalescedEmitter<T>(emit: (value: T) => void): RafCoalescedEmitter<T> {
  const emitRef = useRef(emit);
  emitRef.current = emit;
  const emitterRef = useRef<RafCoalescedEmitter<T>>();
  if (!emitterRef.current) {
    emitterRef.current = createRafCoalescedEmitter(
      (value) => emitRef.current(value),
      (callback) => requestAnimationFrame(callback),
      (frameId) => cancelAnimationFrame(frameId),
    );
  }
  useEffect(() => () => emitterRef.current?.cancel(), []);
  return emitterRef.current;
}
