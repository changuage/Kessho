const clampMidi = (midi: number) => Math.max(0, Math.min(127, Math.round(midi)));

/**
 * Content-bounded pitch axis shared by Overview and Seq chord rows.
 * Only notes projected by the visible rows participate; unused bank slots do
 * not widen the viewport.
 */
export function deriveHarmonyPitchAxis(
  noteGroups: readonly (readonly number[])[],
  marginSemitones = 2,
): number[] {
  const notes = noteGroups
    .flatMap((group) => group)
    .filter(Number.isFinite)
    .map(clampMidi);
  if (notes.length === 0) return [];
  const margin = Math.max(0, Math.round(marginSemitones));
  const low = Math.max(0, Math.min(...notes) - margin);
  const high = Math.min(127, Math.max(...notes) + margin);
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}
