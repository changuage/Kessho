import type { NormalizedSampleLibraryManifest, SampleLibraryKey } from './SampleLibraryTypes';

export interface SampleAssetIdRange {
  libraryKey: SampleLibraryKey;
  label: string;
  minAssetId: number;
  maxAssetId: number;
}

export const SAMPLE_ASSET_ID_RANGES = [
  { libraryKey: 'piano', label: 'Product Core Piano compatibility', minAssetId: 7201, maxAssetId: 7328 },
  { libraryKey: 'pneuma-eleni-teaser', label: 'Pneuma - Eleni teaser', minAssetId: 8000, maxAssetId: 8199 },
  { libraryKey: 'soft-string-spurs', label: 'Soft String Spurs', minAssetId: 8200, maxAssetId: 8399 },
  { libraryKey: 'archive-found-strings-001', label: 'Archive Found Strings 001', minAssetId: 8400, maxAssetId: 8599 },
  { libraryKey: 'array-mbira', label: 'Array M Bira', minAssetId: 8600, maxAssetId: 8999 },
  { libraryKey: 'the-spellsinger', label: 'The Spellsinger', minAssetId: 9000, maxAssetId: 9099 },
  { libraryKey: 'wild-percussion', label: 'Wild Percussion', minAssetId: 9100, maxAssetId: 9199 },
] as const satisfies readonly SampleAssetIdRange[];

export function getSampleAssetIdRange(libraryKey: SampleLibraryKey): SampleAssetIdRange {
  const range = SAMPLE_ASSET_ID_RANGES.find((candidate) => candidate.libraryKey === libraryKey);
  if (!range) {
    throw new Error(`No sample asset id range registered for ${libraryKey}`);
  }
  return range;
}

export function isSampleAssetIdInRange(libraryKey: SampleLibraryKey, assetId: number): boolean {
  const range = getSampleAssetIdRange(libraryKey);
  return Number.isInteger(assetId) && assetId >= range.minAssetId && assetId <= range.maxAssetId;
}

export function assertSampleAssetIdsAreUnique(libraries: readonly NormalizedSampleLibraryManifest[]): void {
  const seen = new Map<number, string>();
  for (const library of libraries) {
    for (const sample of library.samples) {
      const owner = seen.get(sample.assetId);
      if (owner) {
        throw new Error(`Duplicate sample asset id ${sample.assetId}: ${owner} and ${sample.sampleId}`);
      }
      seen.set(sample.assetId, sample.sampleId);
    }
  }
}

export function assertSampleAssetIdsAreInRanges(libraries: readonly NormalizedSampleLibraryManifest[]): void {
  for (const library of libraries) {
    for (const sample of library.samples) {
      if (!isSampleAssetIdInRange(library.libraryKey, sample.assetId)) {
        const range = getSampleAssetIdRange(library.libraryKey);
        throw new Error(
          `${library.libraryKey} sample ${sample.sampleId} asset id ${sample.assetId} ` +
          `is outside ${range.minAssetId}-${range.maxAssetId}`,
        );
      }
    }
  }
}
