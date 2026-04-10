import type { RecordTrackId } from '../recordingTracks';

type TrackState = {
  parts: ArrayBuffer[];
  dataBytes: number;
  totalFrames: number;
};

type InitMessage = {
  type: 'init';
  sampleRate: number;
  trackIds: RecordTrackId[];
};

type ChunkMessage = {
  type: 'chunk';
  trackId: RecordTrackId;
  frameCount: number;
  left: Float32Array;
  right: Float32Array;
};

type FinalizeMessage = {
  type: 'finalize';
};

type ResetMessage = {
  type: 'reset';
};

type WorkerMessage = InitMessage | ChunkMessage | FinalizeMessage | ResetMessage;

const BYTES_PER_SAMPLE = 3;
const NUM_CHANNELS = 2;
const tracks = new Map<RecordTrackId, TrackState>();
let sampleRate = 48000;

function clamp24Bit(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 8388608) : Math.round(clamped * 8388607);
}

function encodeStereoChunk24Bit(left: Float32Array, right: Float32Array, frameCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(frameCount * NUM_CHANNELS * BYTES_PER_SAMPLE);
  const view = new DataView(buffer);
  let offset = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const leftValue = clamp24Bit(left[frame] ?? 0);
    const rightValue = clamp24Bit(right[frame] ?? 0);
    view.setUint8(offset, leftValue & 0xff);
    view.setUint8(offset + 1, (leftValue >> 8) & 0xff);
    view.setUint8(offset + 2, (leftValue >> 16) & 0xff);
    view.setUint8(offset + 3, rightValue & 0xff);
    view.setUint8(offset + 4, (rightValue >> 8) & 0xff);
    view.setUint8(offset + 5, (rightValue >> 16) & 0xff);
    offset += NUM_CHANNELS * BYTES_PER_SAMPLE;
  }

  return buffer;
}

function createWavHeader(dataBytes: number): ArrayBuffer {
  const blockAlign = NUM_CHANNELS * BYTES_PER_SAMPLE;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);

  return buffer;
}

function resetTracks(): void {
  tracks.clear();
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'init': {
      sampleRate = message.sampleRate;
      resetTracks();
      for (const trackId of message.trackIds) {
        tracks.set(trackId, {
          parts: [],
          dataBytes: 0,
          totalFrames: 0,
        });
      }
      break;
    }
    case 'chunk': {
      const track = tracks.get(message.trackId);
      if (!track || message.frameCount <= 0) break;
      const encoded = encodeStereoChunk24Bit(message.left, message.right, message.frameCount);
      track.parts.push(encoded);
      track.dataBytes += encoded.byteLength;
      track.totalFrames += message.frameCount;
      break;
    }
    case 'finalize': {
      const files = Array.from(tracks.entries())
        .filter(([, track]) => track.totalFrames > 0)
        .map(([trackId, track]) => ({
          trackId,
          totalFrames: track.totalFrames,
          blob: new Blob([createWavHeader(track.dataBytes), ...track.parts], { type: 'audio/wav' }),
        }));
      self.postMessage({ type: 'finalized', files });
      break;
    }
    case 'reset': {
      resetTracks();
      break;
    }
  }
};
