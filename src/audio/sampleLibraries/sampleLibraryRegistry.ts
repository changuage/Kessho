import { SAMPLE_LIBRARY_REGISTRY_GENERATED } from './generated/sampleLibraryRegistry.generated';
import type {
  NormalizedSampleDescriptor,
  NormalizedSampleLibraryManifest,
  SampleLibraryKey,
} from './SampleLibraryTypes';

const registry = SAMPLE_LIBRARY_REGISTRY_GENERATED satisfies readonly NormalizedSampleLibraryManifest[];

export const SAMPLE_LIBRARY_REGISTRY = registry;

export function getSampleLibraryRegistry(): readonly NormalizedSampleLibraryManifest[] {
  return registry;
}

export function getSampleLibrary(libraryKey: SampleLibraryKey): NormalizedSampleLibraryManifest | null {
  return registry.find((library) => library.libraryKey === libraryKey) ?? null;
}

export function getSampleDescriptorByAssetId(assetId: number): NormalizedSampleDescriptor | null {
  for (const library of registry) {
    const sample = library.samples.find((candidate) => candidate.assetId === assetId);
    if (sample) return sample;
  }
  return null;
}
