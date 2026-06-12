export const MIN_CHORDS_PER_PHRASE = 1;
export const MAX_CHORDS_PER_PHRASE = 8;
export const DEFAULT_CHORDS_PER_PHRASE = 1;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeChordsPerPhrase(value: unknown, fallback = DEFAULT_CHORDS_PER_PHRASE): number {
  return clamp(
    Math.round(finiteNumber(value, fallback)),
    MIN_CHORDS_PER_PHRASE,
    MAX_CHORDS_PER_PHRASE,
  );
}

export function legacyChordRateSecondsToChordsPerPhrase(
  chordRateSeconds: unknown,
  phraseSeconds: number,
): number {
  const safePhraseSeconds = Math.max(0.001, finiteNumber(phraseSeconds, 16));
  const safeChordRateSeconds = clamp(finiteNumber(chordRateSeconds, 32), 0.001, 128);
  const chordsPerPhrase = safeChordRateSeconds < safePhraseSeconds
    ? Math.max(2, Math.round(safePhraseSeconds / safeChordRateSeconds))
    : 1;
  return normalizeChordsPerPhrase(chordsPerPhrase);
}

export function resolveChordsPerPhrase(value: unknown, phraseSeconds: number): number {
  const numericValue = finiteNumber(value, DEFAULT_CHORDS_PER_PHRASE);
  if (numericValue > MAX_CHORDS_PER_PHRASE) {
    return legacyChordRateSecondsToChordsPerPhrase(numericValue, phraseSeconds);
  }
  return normalizeChordsPerPhrase(numericValue);
}

export function chordIntervalSecondsForPhrase(chordsPerPhrase: unknown, phraseSeconds: number): number {
  return Math.max(0.001, finiteNumber(phraseSeconds, 16)) / normalizeChordsPerPhrase(chordsPerPhrase);
}

export function chordIntervalSecondsFromState(value: unknown, phraseSeconds: number): number {
  return Math.max(0.001, finiteNumber(phraseSeconds, 16)) / resolveChordsPerPhrase(value, phraseSeconds);
}
