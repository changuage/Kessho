const PRODUCT_SEQUENCER_MIN_SOURCE_ID = 1;
const PRODUCT_SEQUENCER_MAX_SOURCE_ID = 8;

function sourceIdFromAlias(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (source === 'pad' || source === 'pad1') return 1;
  if (source === 'pad2') return 2;
  if (source === 'lead' || source === 'lead1') return 3;
  if (source === 'lead2') return 4;
  if (source === 'sample1') return 6;
  if (source === 'sample2') return 8;
  return null;
}

export function normalizeSequencerProductSourceId(value: unknown, fallback: number): number {
  const aliasSourceId = sourceIdFromAlias(value);
  if (aliasSourceId != null) return aliasSourceId;
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.max(
    PRODUCT_SEQUENCER_MIN_SOURCE_ID,
    Math.min(PRODUCT_SEQUENCER_MAX_SOURCE_ID, numericValue),
  ));
}
