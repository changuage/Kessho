import { AUDIO_ASSET_PCM_METADATA } from '../../generated/audioAssetPcmMetadata';

type PcmMetadata = { channels: number; sampleRate: number; frames: number };

function normalizeAssetPath(path: string): string {
  return decodeURIComponent(path).replace(/^.*\/samples\//, '').replace(/^\/+/, '');
}

export function predictedDecodedAssetBytes(assetPath: string, outputSampleRate: number): number | null {
  const metadata = (AUDIO_ASSET_PCM_METADATA as Readonly<Record<string, PcmMetadata>>)[normalizeAssetPath(assetPath)];
  if (!metadata || !(outputSampleRate > 0)) return null;
  const outputFrames = Math.ceil(metadata.frames * outputSampleRate / metadata.sampleRate);
  return outputFrames * metadata.channels * Float32Array.BYTES_PER_ELEMENT;
}
