/** Metadata about a captured voicing. This never rewrites the exact MIDI notes. */
export interface HarmonyVoicingAnalysis {
  bassMidi: number;
  inversion: number;
  doubledPitchClasses: number[];
  omittedChordTones: string[];
  spread: number;
}

const pc = (value: number): number => ((Math.round(value) % 12) + 12) % 12;

/** Analyze bass/order/doubling/omissions for a semantic candidate. */
export function analyzeChordVoicing(
  midiNotes: readonly number[],
  rootPitchClass: number,
  expectedIntervals: readonly number[],
): HarmonyVoicingAnalysis {
  const notes = midiNotes.filter(Number.isFinite).map((note) => Math.round(note));
  const sorted = [...notes].sort((a, b) => a - b);
  const bassMidi = sorted[0] ?? 0;
  const root = pc(rootPitchClass);
  const expected = expectedIntervals.map((interval) => pc(root + interval));
  const counts = new Map<number, number>();
  for (const note of notes) counts.set(pc(note), (counts.get(pc(note)) ?? 0) + 1);
  const doubledPitchClasses = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pitchClass]) => pitchClass)
    .sort((a, b) => a - b);
  const omittedChordTones = expected
    .filter((pitchClass) => !counts.has(pitchClass))
    .map((pitchClass) => {
      const interval = ((pitchClass - root) + 12) % 12;
      if (interval === 0) return 'root';
      if (interval === 3 || interval === 4) return 'third';
      if (interval === 6 || interval === 7 || interval === 8) return 'fifth';
      if (interval === 10 || interval === 11) return 'seventh';
      if (interval === 2) return 'ninth';
      if (interval === 5) return 'fourth';
      return `interval${interval}`;
    });
  const bassPc = pc(bassMidi);
  const bassIndex = expected.indexOf(bassPc);
  return {
    bassMidi,
    // Inversion counts chord-tone order, while a non-chord bass is kept as a
    // conservative 0 (the semantic candidate still carries the exact bass).
    inversion: bassIndex > 0 ? bassIndex : 0,
    doubledPitchClasses,
    omittedChordTones,
    spread: sorted.length > 1 ? (sorted[sorted.length - 1]! - sorted[0]!) : 0,
  };
}

