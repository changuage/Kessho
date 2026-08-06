import type { ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';

export const HARMONY_AUDITION_SOURCE_STORAGE_KEY = 'kessho.harmony.audition-source.v1';
export const HARMONY_AUDITION_SOURCES = ['pad1', 'pad2', 'lead1', 'lead2', 'sample1'] as const satisfies readonly ProductManualSynthSource[];

interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function normalizeHarmonyAuditionSource(value: unknown): ProductManualSynthSource {
  return typeof value === 'string' && (HARMONY_AUDITION_SOURCES as readonly string[]).includes(value)
    ? value as ProductManualSynthSource
    : 'pad1';
}

export function readHarmonyAuditionSource(storage?: PreferenceStorage | null): ProductManualSynthSource {
  try {
    const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
    return normalizeHarmonyAuditionSource(target?.getItem(HARMONY_AUDITION_SOURCE_STORAGE_KEY));
  } catch {
    return 'pad1';
  }
}

export function writeHarmonyAuditionSource(source: ProductManualSynthSource, storage?: PreferenceStorage | null): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
    target?.setItem(HARMONY_AUDITION_SOURCE_STORAGE_KEY, normalizeHarmonyAuditionSource(source));
  } catch {
    // Storage is an optional UI preference; audio selection still works in-memory.
  }
}
