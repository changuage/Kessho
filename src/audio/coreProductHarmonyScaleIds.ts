export const PRODUCT_HARMONY_SCALE_IDS = new Map<string, number>([
  ['Major (Ionian)', 1],
  ['Aeolian', 2],
  ['Major Pentatonic', 3],
  ['Octatonic Half-Whole', 4],
  ['Lydian', 5],
  ['Mixolydian', 6],
  ['Minor Pentatonic', 7],
  ['Dorian', 8],
  ['Harmonic Minor', 9],
  ['Melodic Minor', 10],
  ['Phrygian Dominant', 11],
]);

export function productHarmonyScaleIdFromName(name: string | undefined): number {
  if (!name) return 1;
  const exact = PRODUCT_HARMONY_SCALE_IDS.get(name);
  if (exact) return exact;
  const normalized = name.toLowerCase();
  if (normalized.includes('major pentatonic')) return 3;
  if (normalized.includes('minor pentatonic')) return 7;
  if (normalized.includes('harmonic minor')) return 9;
  if (normalized.includes('melodic minor')) return 10;
  if (normalized.includes('phrygian')) return 11;
  if (normalized.includes('octatonic') || normalized.includes('hirajoshi')) return 4;
  if (normalized.includes('mixolydian')) return 6;
  if (normalized.includes('lydian')) return 5;
  if (normalized.includes('dorian')) return 8;
  if (normalized.includes('minor') || normalized.includes('aeolian')) return 2;
  return 1;
}
