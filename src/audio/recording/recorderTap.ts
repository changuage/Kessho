import {
  STEM_RECORD_TRACK_IDS,
  type RecordTrackId,
  type StemRecordTrackId,
} from '../recordingTracks';

export type RecorderTapSession = {
  trackId: RecordTrackId;
  sourceNode: AudioNode;
  tapNode: AudioWorkletNode;
  sinkNode: GainNode;
  flushPromise: Promise<void>;
  resolveFlush: () => void;
  handleMessage: (event: MessageEvent<unknown>) => void;
};

export type RecorderTapSessions = Record<RecordTrackId, RecorderTapSession | null>;
export type RecordingStreamDestination = MediaStreamAudioDestinationNode;

export type RecorderWorkerFinalizedMessage = {
  type: 'finalized';
  files: Array<{
    trackId: RecordTrackId;
    totalFrames: number;
    blob: Blob;
  }>;
};

export function createEmptyRecorderTapSessions(): RecorderTapSessions {
  return {
    mix: null,
    ...Object.fromEntries(STEM_RECORD_TRACK_IDS.map((trackId) => [trackId, null])) as Record<StemRecordTrackId, null>,
  };
}

export function attachRecorderTap(options: {
  ctx: AudioContext;
  trackId: RecordTrackId;
  sourceNode: AudioNode;
  worker: Worker;
  sessions: RecorderTapSessions;
  outputIndex?: number;
}): void {
  const {
    ctx,
    trackId,
    sourceNode,
    worker,
    sessions,
    outputIndex = 0,
  } = options;
  let resolveFlush = () => {};
  const flushPromise = new Promise<void>((resolve) => {
    resolveFlush = resolve;
  });

  const tapNode = new AudioWorkletNode(ctx, 'kessho-recorder-tap', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    processorOptions: {
      trackId,
      chunkFrames: 4096,
    },
  });
  const sinkNode = ctx.createGain();
  sinkNode.gain.value = 0;

  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as {
      type?: string;
      trackId?: RecordTrackId;
      frameCount?: number;
      left?: Float32Array;
      right?: Float32Array;
    };
    if (message.type === 'chunk' && message.left && message.right && typeof message.frameCount === 'number') {
      worker.postMessage(
        {
          type: 'chunk',
          trackId,
          frameCount: message.frameCount,
          left: message.left,
          right: message.right,
        },
        [message.left.buffer, message.right.buffer],
      );
      return;
    }
    if (message.type === 'flushed') {
      resolveFlush();
    }
  };

  tapNode.port.addEventListener('message', handleMessage as EventListener);
  tapNode.port.start?.();
  sourceNode.connect(tapNode, outputIndex);
  tapNode.connect(sinkNode);
  sinkNode.connect(ctx.destination);

  sessions[trackId] = {
    trackId,
    sourceNode,
    tapNode,
    sinkNode,
    flushPromise,
    resolveFlush,
    handleMessage,
  };
}

export async function flushAndDetachRecorderTapSessions(
  sessionsByTrack: RecorderTapSessions,
): Promise<void> {
  const sessions = Object.values(sessionsByTrack).filter((session): session is RecorderTapSession => Boolean(session));
  if (sessions.length === 0) return;

  for (const session of sessions) {
    session.tapNode.port.postMessage({ type: 'flush' });
  }

  await Promise.all(sessions.map((session) => session.flushPromise));

  for (const session of sessions) {
    try {
      session.sourceNode.disconnect(session.tapNode);
    } catch { /* noop */ }
    session.tapNode.port.removeEventListener('message', session.handleMessage as EventListener);
    try {
      session.tapNode.port.postMessage({ type: 'destroy' });
    } catch { /* noop */ }
    try {
      session.tapNode.disconnect();
    } catch { /* noop */ }
    try {
      session.sinkNode.disconnect();
    } catch { /* noop */ }
    sessionsByTrack[session.trackId] = null;
  }
}

export function disposeRecorderTapSessions(sessionsByTrack: RecorderTapSessions): void {
  for (const session of Object.values(sessionsByTrack)) {
    if (!session) continue;
    try {
      session.sourceNode.disconnect(session.tapNode);
    } catch { /* noop */ }
    try {
      session.tapNode.disconnect();
    } catch { /* noop */ }
    try {
      session.sinkNode.disconnect();
    } catch { /* noop */ }
    sessionsByTrack[session.trackId] = null;
  }
}
