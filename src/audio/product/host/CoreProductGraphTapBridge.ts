import { getCoreProductGraphTapId } from '../../coreProductGraphTaps';
import type { CoreProductGraphTapCaptureChunk, CoreProductRuntime } from '../../coreProductRuntime';

export class CoreProductGraphTapBridge {
  constructor(private readonly runtime: CoreProductRuntime) {}

  getTapId(trackId: string): number | null {
    return getCoreProductGraphTapId(trackId.startsWith('graph:') ? trackId.slice('graph:'.length) : trackId);
  }

  startCapture(trackId: string, chunkFrames: number): number {
    const tapId = this.getTapId(trackId);
    if (tapId === null) {
      throw new Error(`Unknown Core Product sonic parity graph tap: ${trackId}`);
    }
    this.runtime.startGraphTapCapture(tapId, chunkFrames);
    return tapId;
  }

  flushCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.runtime.flushGraphTapCapture(tapId);
  }

  stopCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.runtime.stopGraphTapCapture(tapId);
  }
}
