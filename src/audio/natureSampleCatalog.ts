import { AUDIO_ASSET_PCM_METADATA } from './generated/audioAssetPcmMetadata';

export type NatureSampleId = 'ghetary-waves' | 'birds-alps' | 'birds-fujian' | 'frogs-fujian';
export type NatureFilterType = 'lowpass' | 'bandpass' | 'highpass' | 'notch';
export type NatureSlotNumber = 1 | 2 | 3 | 4;

export type NatureSampleDefinition = Readonly<{
  id: NatureSampleId;
  displayName: string;
  assetKey: 'ocean' | 'birds' | 'birds2' | 'frogs';
  assetId: number;
  assetPath: string;
  durationSeconds: number;
  defaultSliceDuration: number;
  defaultSliceDensity: number;
  defaultFilterType: NatureFilterType;
  defaultFilterCutoff: number;
  defaultFilterResonance: number;
}>;

const durationSeconds = (assetPath: string): number => {
  const metadata = AUDIO_ASSET_PCM_METADATA[assetPath as keyof typeof AUDIO_ASSET_PCM_METADATA];
  if (!metadata || metadata.sampleRate <= 0) return 0;
  return metadata.frames / metadata.sampleRate;
};

const sample = (definition: Omit<NatureSampleDefinition, 'durationSeconds'>): NatureSampleDefinition =>
  Object.freeze({ ...definition, durationSeconds: durationSeconds(definition.assetPath) });

export const NATURE_SAMPLE_CATALOG = Object.freeze([
  sample({
    id: 'ghetary-waves', displayName: 'Waves Ghetary', assetKey: 'ocean', assetId: 7101,
    assetPath: 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
    defaultSliceDuration: 22, defaultSliceDensity: 0.38,
    defaultFilterType: 'lowpass', defaultFilterCutoff: 8000, defaultFilterResonance: 0.1,
  }),
  sample({
    id: 'birds-alps', displayName: 'Birds Alps', assetKey: 'birds', assetId: 7102,
    assetPath: 'Alps Birds 2_noiseremoval_441_m.ogg',
    defaultSliceDuration: 20, defaultSliceDensity: 0.45,
    defaultFilterType: 'lowpass', defaultFilterCutoff: 12000, defaultFilterResonance: 0.05,
  }),
  sample({
    id: 'birds-fujian', displayName: 'Birds Fujian', assetKey: 'birds2', assetId: 7105,
    assetPath: 'Fujian Birds 2_441_m_normalized.ogg',
    defaultSliceDuration: 20, defaultSliceDensity: 0.48,
    defaultFilterType: 'lowpass', defaultFilterCutoff: 12000, defaultFilterResonance: 0.05,
  }),
  sample({
    id: 'frogs-fujian', displayName: 'Frogs Fujian', assetKey: 'frogs', assetId: 7103,
    assetPath: 'Fujian_Frogs_m_441_normalized.ogg',
    defaultSliceDuration: 18, defaultSliceDensity: 0.52,
    defaultFilterType: 'lowpass', defaultFilterCutoff: 9000, defaultFilterResonance: 0.08,
  }),
] as const satisfies readonly NatureSampleDefinition[]);

export const NATURE_SAMPLE_BY_ID = new Map<NatureSampleId, NatureSampleDefinition>(
  NATURE_SAMPLE_CATALOG.map((entry) => [entry.id, entry]),
);

export const DEFAULT_NATURE_SAMPLE_IDS = Object.freeze([
  'ghetary-waves', 'birds-alps', 'birds-fujian', 'frogs-fujian',
] as const satisfies readonly NatureSampleId[]);

export function isNatureSampleId(value: unknown): value is NatureSampleId {
  return typeof value === 'string' && NATURE_SAMPLE_BY_ID.has(value as NatureSampleId);
}

export function natureSampleDefinition(value: unknown, slot: NatureSlotNumber = 1): NatureSampleDefinition {
  const fallbackId = DEFAULT_NATURE_SAMPLE_IDS[slot - 1] ?? DEFAULT_NATURE_SAMPLE_IDS[0];
  return (isNatureSampleId(value) ? NATURE_SAMPLE_BY_ID.get(value) : undefined)
    ?? NATURE_SAMPLE_BY_ID.get(fallbackId)
    ?? NATURE_SAMPLE_CATALOG[0];
}

export function natureSampleLabel(value: unknown, slot: NatureSlotNumber): string {
  return natureSampleDefinition(value, slot).displayName;
}

export function natureSlotTitle(value: unknown, slot: NatureSlotNumber): string {
  return `${natureSampleLabel(value, slot)} — Nature ${slot}`;
}
