type TimestampedMidiMessage = {
  readonly timestamp?: number;
};

type TimestampedLiveNoteEvent = {
  readonly timestampMs?: number;
  readonly source?: 'midi' | 'computer-keyboard' | 'ui-pad';
};

export interface CoreProductRealtimeTimestampContext {
  sampleRate: number | null;
  currentTimeSeconds: number;
  timestampOriginSeconds?: number;
}

export class CoreProductRealtimeTimestampMapper {
  private timestampOriginSeconds: number | null = null;
  private lastAudioContext: AudioContext | null = null;
  private lastCurrentTimeSeconds: number | null = null;

  midiContext(message: TimestampedMidiMessage, audioContext: AudioContext | null): CoreProductRealtimeTimestampContext {
    const currentTimeSeconds = audioContext?.currentTime ?? 0;
    this.observeAudioClock(audioContext, currentTimeSeconds);
    if (this.timestampOriginSeconds === null && typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
      this.timestampOriginSeconds = message.timestamp - currentTimeSeconds;
    }
    return this.context(audioContext, currentTimeSeconds);
  }

  liveNoteContext(event: TimestampedLiveNoteEvent, audioContext: AudioContext | null): CoreProductRealtimeTimestampContext {
    const currentTimeSeconds = audioContext?.currentTime ?? 0;
    this.observeAudioClock(audioContext, currentTimeSeconds);
    // Browser input timestamps are useful to the harmony layer, but must not
    // turn into future audio scheduling offsets. Only hardware MIDI events
    // participate in host/audio clock calibration.
    if (event.source === 'midi' && this.timestampOriginSeconds === null && typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)) {
      this.timestampOriginSeconds = event.timestampMs / 1000 - currentTimeSeconds;
    }
    return this.context(audioContext, currentTimeSeconds);
  }

  reset(): void {
    this.timestampOriginSeconds = null;
    this.lastAudioContext = null;
    this.lastCurrentTimeSeconds = null;
  }

  private observeAudioClock(audioContext: AudioContext | null, currentTimeSeconds: number): void {
    if (this.lastAudioContext !== null && this.lastAudioContext !== audioContext) {
      this.timestampOriginSeconds = null;
    }
    // A backwards jump marks a resume/recreated-context boundary. Discard the
    // previous host-time epoch instead of producing a large future offset.
    if (this.lastCurrentTimeSeconds !== null && currentTimeSeconds + 0.001 < this.lastCurrentTimeSeconds) {
      this.timestampOriginSeconds = null;
    }
    // Do not carry a running-context epoch through a suspended/closed state;
    // an input arriving at that boundary is rebased to the current clock and
    // then queued by the bootstrap gate until audio is running again.
    if (audioContext !== null && audioContext.state !== 'running') {
      this.timestampOriginSeconds = null;
    }
    this.lastAudioContext = audioContext;
    this.lastCurrentTimeSeconds = currentTimeSeconds;
  }

  private context(audioContext: AudioContext | null, currentTimeSeconds: number): CoreProductRealtimeTimestampContext {
    return {
      sampleRate: audioContext?.sampleRate ?? null,
      currentTimeSeconds,
      timestampOriginSeconds: this.timestampOriginSeconds ?? undefined,
    };
  }
}
