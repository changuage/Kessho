export const PAD_PITCH_MIN = -24;
export const PAD_PITCH_MAX = 24;

export function clampPadPitch(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Number(Math.min(PAD_PITCH_MAX, Math.max(PAD_PITCH_MIN, safe)).toFixed(2));
}

/** Shared display formatter for both Pad oscillators. */
export function formatPadPitch(pitchSemitones: number): string {
  const pitch = clampPadPitch(pitchSemitones);
  const sign = pitch < 0 ? '-' : pitch > 0 ? '+' : '';
  const absolute = Math.abs(pitch);
  let semitones = Math.floor(absolute + 1e-7);
  let cents = Math.round((absolute - semitones) * 100);
  if (cents >= 100) {
    semitones += 1;
    cents = 0;
  }
  if (semitones === 0 && cents === 0) return '0 st';
  if (semitones === 0) return `${sign}${cents} ct`;
  if (cents === 0) return `${sign}${semitones} st`;
  return `${sign}${semitones} st ${sign}${cents} ct`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Decode-only compatibility for the 52-value Pad state. Current state never
 * stores or reads Octave/Detune after this boundary.
 */
export function convertLegacyPadPitchFields(data: Record<string, unknown>): boolean {
  let converted = false;
  const pairs = [
    ['padOscAPitch', 'padOscAOctave', 'padOscADetune'],
    ['padOscBPitch', 'padOscBOctave', 'padOscBDetune'],
    ['pad2OscAPitch', 'pad2OscAOctave', 'pad2OscADetune'],
    ['pad2OscBPitch', 'pad2OscBOctave', 'pad2OscBDetune'],
  ] as const;
  for (const [pitchKey, octaveKey, detuneKey] of pairs) {
    if (finiteNumber(data[pitchKey]) === null) {
      const octave = finiteNumber(data[octaveKey]);
      const detune = finiteNumber(data[detuneKey]);
      if (octave !== null || detune !== null) {
        data[pitchKey] = clampPadPitch((octave ?? 0) * 12 + (detune ?? 0) / 100);
        converted = true;
      }
    }
    delete data[octaveKey];
    delete data[detuneKey];
  }
  return converted;
}

export function convertLegacyPadParamArray(oldParams: readonly number[]): number[] {
  if (oldParams.length !== 52) return [...oldParams];
  const next = new Array<number>(58).fill(0);
  next[0] = oldParams[0] ?? 2;
  next[1] = clampPadPitch((oldParams[1] ?? 0) * 12 + (oldParams[2] ?? 0) / 100);
  next[2] = 0;
  next[3] = oldParams[3] ?? 0.6;
  next[4] = oldParams[4] ?? 1;
  next[5] = clampPadPitch((oldParams[5] ?? 0) * 12 + (oldParams[6] ?? 0) / 100);
  next[6] = 0;
  next[7] = oldParams[7] ?? 0.4;
  for (let index = 8; index <= 50; index += 1) next[index] = oldParams[index] ?? 0;
  next[51] = 0;
  next[52] = 0;
  next[53] = 0;
  next[54] = 0;
  next[55] = Math.min(1, Math.max(0, 0.2 + (oldParams[16] ?? 0) * 0.55 + (oldParams[2] ?? 0) * 0.0025));
  next[56] = 2;
  next[57] = oldParams[51] ?? 0.8;
  return next;
}
