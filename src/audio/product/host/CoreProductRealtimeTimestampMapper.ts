type TimestampedMidiMessage = {
  readonly timestamp?: number;
};

type TimestampedLiveNoteEvent = {
  readonly timestampMs?: number;
};

export interface CoreProductRealtimeTimestampContext {
  sampleRate: number | null;
  currentTimeSeconds: number;
  timestampOriginSeconds?: number;
}

export class CoreProductRealtimeTimestampMapper {
  private timestampOriginSeconds: number | null = null;

  midiContext(message: TimestampedMidiMessage, audioContext: AudioContext | null): CoreProductRealtimeTimestampContext {
    const currentTimeSeconds = audioContext?.currentTime ?? 0;
    if (this.timestampOriginSeconds === null && typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
      this.timestampOriginSeconds = message.timestamp - currentTimeSeconds;
    }
    return this.context(audioContext, currentTimeSeconds);
  }

  liveNoteContext(event: TimestampedLiveNoteEvent, audioContext: AudioContext | null): CoreProductRealtimeTimestampContext {
    const currentTimeSeconds = audioContext?.currentTime ?? 0;
    if (this.timestampOriginSeconds === null && typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)) {
      this.timestampOriginSeconds = event.timestampMs / 1000 - currentTimeSeconds;
    }
    return this.context(audioContext, currentTimeSeconds);
  }

  reset(): void {
    this.timestampOriginSeconds = null;
  }

  private context(audioContext: AudioContext | null, currentTimeSeconds: number): CoreProductRealtimeTimestampContext {
    return {
      sampleRate: audioContext?.sampleRate ?? null,
      currentTimeSeconds,
      timestampOriginSeconds: this.timestampOriginSeconds ?? undefined,
    };
  }
}
