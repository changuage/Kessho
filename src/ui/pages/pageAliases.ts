export type CanonicalSliderPageId =
  | 'app'
  | 'global'
  | 'synth'
  | 'drums'
  | 'reverb'
  | 'granular'
  | 'earth'
  | 'delay'
  | 'texture'
  | 'routing';

export type LegacySliderPageId = 'dynamics';
export type SliderPageId = CanonicalSliderPageId | LegacySliderPageId;

export function normalizeSliderPageId(page: SliderPageId): CanonicalSliderPageId {
  return page === 'dynamics' ? 'texture' : page;
}

