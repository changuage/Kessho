export type CanonicalSynthEuclidSource =
  | 'lead1'
  | 'lead2'
  | 'pad1'
  | 'pad2'
  | 'sample1'
  | 'sample2'
  | 'synth1'
  | 'synth2'
  | 'synth3'
  | 'synth4'
  | 'synth5'
  | 'synth6'
  | 'synth7'
  | 'synth8';

export function normalizeSynthEuclidSource(value: unknown): CanonicalSynthEuclidSource {
  const source = String(value ?? 'lead1').trim().toLowerCase();

  if (source === 'lead' || source === 'lead1') return 'lead1';
  if (source === 'lead2') return 'lead2';
  if (source === 'piano' || source === 'sample1') return 'sample1';
  if (source === 'sample2') return 'sample2';
  if (source === 'pad' || source === 'pad1') return 'pad1';
  if (source === 'pad2') return 'pad2';
  if (/^synth[1-8]$/.test(source)) return source as CanonicalSynthEuclidSource;

  return 'lead1';
}
