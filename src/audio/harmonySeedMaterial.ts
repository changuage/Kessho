import { getUtcBucket } from './rng';

const HARMONY_SEED_STATE_KEYS = [
  'seedWindow',
  'harmonyGenerationSeed',
] as const;

function normalizeSeedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSeedValue);
  if (!value || typeof value !== 'object') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value ?? null;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((normalized, key) => {
    normalized[key] = normalizeSeedValue(record[key]);
    return normalized;
  }, {});
}

export function harmonySeedPayloadJsonFromState(state: object | null | undefined): string {
  const source = (state ?? {}) as Record<string, unknown>;
  return JSON.stringify(HARMONY_SEED_STATE_KEYS.map((key) => [key, normalizeSeedValue(source[key])]));
}

export function harmonySeedMaterialForBucket(
  state: object | null | undefined,
  bucket: string,
): string {
  return `${bucket}|${harmonySeedPayloadJsonFromState(state)}|E_ROOT`;
}

export function harmonySeedMaterialFromState(state: object | null | undefined): string {
  const record = state as Record<string, unknown> | null | undefined;
  const seedWindow = record?.seedWindow === 'day' ? 'day' : 'hour';
  return harmonySeedMaterialForBucket(state, getUtcBucket(seedWindow));
}
