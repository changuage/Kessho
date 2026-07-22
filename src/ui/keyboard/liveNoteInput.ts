import { useEffect, useRef } from 'react';
import type { ProductLiveNoteEvent, ProductLiveNoteInstrument } from '../../audio/product/liveNoteEvents';

export type LiveNoteInputDescriptor = {
  readonly source: ProductLiveNoteEvent['source'];
  readonly instrument: Exclude<ProductLiveNoteInstrument, 'drum'>;
  readonly note: number;
  readonly velocity: number;
  readonly channel?: number | null;
  readonly timestampMs?: number;
  readonly timestampHostTime?: number;
  readonly timestampAudioFrame?: number;
};

export type LiveNoteReleaseTiming = {
  readonly timestampMs?: number;
  readonly timestampHostTime?: number;
  readonly timestampAudioFrame?: number;
};

export type LiveNoteInputCallbacks = {
  readonly start: (event: ProductLiveNoteEvent) => Promise<void>;
  readonly stop: (event: ProductLiveNoteEvent) => void;
  readonly onStartFailure: (result: LiveNoteStartFailure) => void;
};

export type LiveNoteStartResult =
  | { readonly status: 'started'; readonly event: ProductLiveNoteEvent }
  | { readonly status: 'duplicate'; readonly event: ProductLiveNoteEvent }
  | { readonly status: 'failed'; readonly event: ProductLiveNoteEvent; readonly error: Error };

type LiveNoteStartFailure = Extract<LiveNoteStartResult, { readonly status: 'failed' }>;

type ActiveLiveNote = {
  readonly event: ProductLiveNoteEvent;
  readonly started: Promise<void>;
  readonly stop: LiveNoteInputCallbacks['stop'];
};

let nextLiveNoteEventId = 1;

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function clampVelocity(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export class LiveNoteInputController {
  private readonly active = new Map<string, ActiveLiveNote>();
  private callbacks: LiveNoteInputCallbacks;

  constructor(callbacks: LiveNoteInputCallbacks) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: LiveNoteInputCallbacks): void {
    this.callbacks = callbacks;
  }

  noteOn(inputId: string, descriptor: LiveNoteInputDescriptor): LiveNoteStartResult {
    const existing = this.active.get(inputId);
    if (existing) return { status: 'duplicate', event: existing.event };
    const event: ProductLiveNoteEvent = {
      kind: 'live-note-on',
      eventID: `live-input-${nextLiveNoteEventId++}`,
      source: descriptor.source,
      instrument: descriptor.instrument,
      channel: descriptor.channel ?? null,
      note: clampMidi(descriptor.note),
      velocity: clampVelocity(descriptor.velocity),
      timestampMs: descriptor.timestampMs ?? performance.now(),
      timestampHostTime: descriptor.timestampHostTime,
      timestampAudioFrame: descriptor.timestampAudioFrame,
    };
    const { start, stop } = this.callbacks;
    let started: Promise<void>;
    try {
      started = start(event);
    } catch (error) {
      const result: LiveNoteStartResult = { status: 'failed', event, error: toError(error) };
      this.callbacks.onStartFailure(result);
      return result;
    }
    const activeNote = { event, started, stop };
    this.active.set(inputId, activeNote);
    void started.catch((error) => {
      if (this.active.get(inputId) === activeNote) this.active.delete(inputId);
      this.callbacks.onStartFailure({ status: 'failed', event, error: toError(error) });
    });
    return { status: 'started', event };
  }

  noteOff(inputId: string, timing: number | LiveNoteReleaseTiming = performance.now()): boolean {
    const activeNote = this.active.get(inputId);
    if (!activeNote) return false;
    this.active.delete(inputId);
    const stopEvent: ProductLiveNoteEvent = {
      ...activeNote.event,
      kind: 'live-note-off',
      velocity: 0,
      timestampMs: typeof timing === 'number' ? timing : timing.timestampMs ?? performance.now(),
      timestampHostTime: typeof timing === 'number' ? undefined : timing.timestampHostTime,
      timestampAudioFrame: typeof timing === 'number' ? undefined : timing.timestampAudioFrame,
    };
    void activeNote.started
      .catch(() => undefined)
      .then(() => activeNote.stop(stopEvent))
      .catch(() => undefined);
    return true;
  }

  releaseAll(timestampMs = performance.now()): void {
    for (const inputId of this.active.keys()) this.noteOff(inputId, timestampMs);
  }

  activeCount(): number {
    return this.active.size;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useLiveNoteInput(callbacks: LiveNoteInputCallbacks): LiveNoteInputController {
  const controllerRef = useRef<LiveNoteInputController>();
  if (!controllerRef.current) controllerRef.current = new LiveNoteInputController(callbacks);
  controllerRef.current.setCallbacks(callbacks);

  useEffect(() => {
    const controller = controllerRef.current!;
    const releaseWhenHidden = () => {
      if (document.visibilityState !== 'visible') controller.releaseAll();
    };
    document.addEventListener('visibilitychange', releaseWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', releaseWhenHidden);
      controller.releaseAll();
    };
  }, []);

  return controllerRef.current;
}
