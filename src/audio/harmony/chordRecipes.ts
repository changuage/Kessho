import type { HarmonyChordAlteration, HarmonyChordExtension, HarmonyChordQuality } from './harmonyTypes';

/** Compact, allocation-light semantic recipes used by the control-path recognizer. */
export interface HarmonyChordRecipe {
  quality: HarmonyChordQuality;
  extensions: HarmonyChordExtension[];
  alterations: HarmonyChordAlteration[];
  intervals: readonly number[];
  label: string;
}

export const HARMONY_CHORD_RECIPES: readonly HarmonyChordRecipe[] = [
  { quality: 'maj', extensions: [], alterations: [], intervals: [0, 4, 7], label: 'major' },
  { quality: 'min', extensions: [], alterations: [], intervals: [0, 3, 7], label: 'minor' },
  { quality: 'dim', extensions: [], alterations: [], intervals: [0, 3, 6], label: 'diminished' },
  { quality: 'sus', extensions: [], alterations: [], intervals: [0, 5, 7], label: 'suspended' },
  { quality: 'maj7', extensions: [], alterations: [], intervals: [0, 4, 7, 11], label: 'major seventh' },
  { quality: 'min7', extensions: [], alterations: [], intervals: [0, 3, 7, 10], label: 'minor seventh' },
  { quality: 'dom7', extensions: [], alterations: [], intervals: [0, 4, 7, 10], label: 'dominant seventh' },
  { quality: 'add9', extensions: [], alterations: [], intervals: [0, 2, 4, 7], label: 'add nine' },
  { quality: 'six', extensions: [], alterations: [], intervals: [0, 4, 7, 9], label: 'sixth' },
  { quality: 'sixNine', extensions: [], alterations: [], intervals: [0, 2, 4, 7, 9], label: 'six nine' },
  { quality: 'nine', extensions: [], alterations: [], intervals: [0, 2, 4, 7, 10], label: 'ninth' },
  { quality: 'maj7', extensions: ['9'], alterations: [], intervals: [0, 2, 4, 7, 11], label: 'major ninth' },
  { quality: 'min7', extensions: ['9'], alterations: [], intervals: [0, 2, 3, 7, 10], label: 'minor ninth' },
  { quality: 'dom7', extensions: ['13'], alterations: [], intervals: [0, 4, 7, 9, 10], label: 'dominant thirteenth' },
  { quality: 'dom7', extensions: [], alterations: ['b5'], intervals: [0, 4, 6, 10], label: 'dominant flat five' },
  { quality: 'dom7', extensions: [], alterations: ['b9'], intervals: [0, 1, 4, 7, 10], label: 'dominant flat nine' },
  { quality: 'dom7', extensions: [], alterations: ['#9'], intervals: [0, 3, 4, 7, 10], label: 'dominant sharp nine' },
  { quality: 'dom7', extensions: [], alterations: ['#11'], intervals: [0, 4, 6, 7, 10], label: 'dominant sharp eleven' },
  { quality: 'quartal', extensions: [], alterations: [], intervals: [0, 5, 10, 15], label: 'quartal' },
  { quality: 'cluster', extensions: [], alterations: [], intervals: [0, 1, 2, 4], label: 'cluster' },
] as const;

export function recipePitchClasses(recipe: HarmonyChordRecipe, rootPitchClass: number): number[] {
  const root = ((Math.round(rootPitchClass) % 12) + 12) % 12;
  const result: number[] = [];
  for (const interval of recipe.intervals) {
    const pitchClass = (root + interval) % 12;
    if (!result.includes(pitchClass)) result.push(pitchClass);
  }
  return result;
}

