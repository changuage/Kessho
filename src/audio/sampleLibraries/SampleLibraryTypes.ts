export const SAMPLE_SLOT_IDS = ['sample1', 'sample2'] as const;
export type SampleSlotId = typeof SAMPLE_SLOT_IDS[number];

export const SAMPLE_LIBRARY_KEYS = [
  'piano',
  'pneuma-eleni-teaser',
  'soft-string-spurs',
  'archive-found-strings-001',
  'array-mbira',
  'the-spellsinger',
  'wild-percussion',
] as const;
export type SampleLibraryKey = typeof SAMPLE_LIBRARY_KEYS[number];

export const SAMPLE_SELECTION_MODES = ['mapped', 'nearest', 'exact'] as const;
export type SampleSelectionMode = typeof SAMPLE_SELECTION_MODES[number];

export const SAMPLE_DYNAMIC_MODES = ['velocity', 'fixed', 'legacy-piano-parity'] as const;
export type SampleDynamicMode = typeof SAMPLE_DYNAMIC_MODES[number];

export const SAMPLE_DYNAMIC_KEYS = [
  'regular',
  'short',
  'quiet',
  'pp',
  'mp',
  'mf',
  'ff',
  'level-1',
  'level-2',
  'level-3',
  'level-4',
  'single',
  'piano',
  'forte',
  'strum-2',
  'strum-3',
  'strum-4',
  'normal',
  'wicked',
  'velocity-1',
  'velocity-2',
  'velocity-3',
] as const;
export type SampleDynamicKey = typeof SAMPLE_DYNAMIC_KEYS[number];

export interface SampleSlotState {
  enabled: boolean;
  libraryKey: SampleLibraryKey;
  role: string;
  articulation: string;
  selectionMode: SampleSelectionMode;
  dynamicMode: SampleDynamicMode;
  fixedDynamic: SampleDynamicKey;
  level: number;
  attackMs: number;
  releaseMs: number;
  loopEnabled: boolean;
  maxVoices: number;
}

export interface NormalizedSampleLoop {
  sourceStartFrame: number;
  sourceEndFrame: number;
  sourceSampleRate: number;
  encodedSampleRate: number;
  encodedStartFrame: number;
  encodedEndFrame: number;
  crossfadeFrames: number;
}

export interface NormalizedSampleDescriptor {
  sampleId: string;
  assetId: number;
  assetPath: string;
  rootMidi: number;
  loMidi: number;
  hiMidi: number;
  role: string;
  articulation: string;
  dynamic: SampleDynamicKey;
  velocityMin: number;
  velocityMax: number;
  loop: NormalizedSampleLoop | null;
}

export interface NormalizedSampleLibraryManifest {
  schema: 'kessho-normalized-sample-library-v1';
  libraryKey: SampleLibraryKey;
  displayName: string;
  assetBasePath: string;
  sourceSampleRate: number;
  encodedSampleRate: number;
  defaultRole: string;
  defaultArticulation: string;
  defaultDynamic: SampleDynamicKey;
  defaultMidi: number;
  recommendedPreloadMidi: readonly number[];
  samples: readonly NormalizedSampleDescriptor[];
}

export function isSampleLibraryKey(value: unknown): value is SampleLibraryKey {
  return typeof value === 'string' && SAMPLE_LIBRARY_KEYS.includes(value as SampleLibraryKey);
}

export function isSampleDynamicKey(value: unknown): value is SampleDynamicKey {
  return typeof value === 'string' && SAMPLE_DYNAMIC_KEYS.includes(value as SampleDynamicKey);
}
