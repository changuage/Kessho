import type { DecodedCoreProductAsset } from '../coreProductAssets';
import type {
  NormalizedSampleDescriptor,
  NormalizedSampleLibraryManifest,
  NormalizedSampleLoop,
  SampleLibraryKey,
} from './SampleLibraryTypes';

export interface SampleAssetDescriptor {
  assetId: number;
  url: string;
  assetPath: string;
  libraryKey: SampleLibraryKey;
  sampleId: string;
  rootMidi: number;
  encodedSampleRate: number;
  loop?: {
    encodedStartFrame: number;
    encodedEndFrame: number;
    sourceSampleRate: number;
    encodedSampleRate: number;
    crossfadeFrames: number;
  };
}

export function resolveSampleAssetUrl(assetBasePath: string, assetPath: string): string {
  const normalizedBasePath = assetBasePath.replace(/^\/+|\/+$/g, '');
  const normalizedAssetPath = assetPath.replace(/^\/+/g, '');
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  if (typeof window !== 'undefined' && window.location?.origin) {
    const base = new URL(baseUrl, window.location.origin);
    return new URL(`${normalizedBasePath}/${normalizedAssetPath}`, base).toString();
  }
  const normalizedBaseUrl = String(baseUrl || '/').replace(/\/+$/g, '');
  const prefix = normalizedBaseUrl.length > 0 ? normalizedBaseUrl : '';
  return `${prefix}/${normalizedBasePath}/${normalizedAssetPath}`;
}

export function toSampleAssetDescriptor(
  library: NormalizedSampleLibraryManifest,
  sample: NormalizedSampleDescriptor,
): SampleAssetDescriptor {
  return {
    assetId: sample.assetId,
    url: resolveSampleAssetUrl(library.assetBasePath, sample.assetPath),
    assetPath: sample.assetPath,
    libraryKey: library.libraryKey,
    sampleId: sample.sampleId,
    rootMidi: sample.rootMidi,
    encodedSampleRate: sample.loop?.encodedSampleRate ?? library.encodedSampleRate,
    loop: sample.loop ? {
      encodedStartFrame: sample.loop.encodedStartFrame,
      encodedEndFrame: sample.loop.encodedEndFrame,
      sourceSampleRate: sample.loop.sourceSampleRate,
      encodedSampleRate: sample.loop.encodedSampleRate,
      crossfadeFrames: sample.loop.crossfadeFrames,
    } : undefined,
  };
}

export function toDecodedLoopFrames(
  loop: SampleAssetDescriptor['loop'] | NormalizedSampleLoop | null | undefined,
  decodedSampleRate: number,
): { start: number; end: number; crossfadeFrames: number } | null {
  if (!loop || !Number.isFinite(decodedSampleRate) || decodedSampleRate <= 0) return null;

  const start = Math.round(loop.encodedStartFrame * decodedSampleRate / loop.encodedSampleRate);
  const end = Math.round(loop.encodedEndFrame * decodedSampleRate / loop.encodedSampleRate);
  const crossfadeFrames = Math.max(
    0,
    Math.round(loop.crossfadeFrames * decodedSampleRate / loop.encodedSampleRate),
  );

  if (end <= start + 8) return null;
  return { start, end, crossfadeFrames };
}

export function withSampleAssetMetadata(
  asset: DecodedCoreProductAsset,
  descriptor: SampleAssetDescriptor,
): DecodedCoreProductAsset {
  const decodedLoop = toDecodedLoopFrames(descriptor.loop, asset.sampleRate);
  return {
    ...asset,
    sampleLibraryKey: descriptor.libraryKey,
    sampleId: descriptor.sampleId,
    rootMidi: descriptor.rootMidi,
    decodedLoopStartFrame: decodedLoop?.start,
    decodedLoopEndFrame: decodedLoop?.end,
    loopCrossfadeFrames: decodedLoop?.crossfadeFrames,
  };
}
