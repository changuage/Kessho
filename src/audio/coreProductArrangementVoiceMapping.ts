export const PAD_VOICE_COUNT = 8;
export const PAD_VOICE_MASK_ALL = (1 << PAD_VOICE_COUNT) - 1;
export const PAD_VOICE_DEFAULT_MASK = 1 << (PAD_VOICE_COUNT - 1);

const ARRANGEMENT_RESTART_KEYS = [
  'harmonyClockSource', 'chordProgressionClockSource', 'chordProgressionPhraseMultiplier',
  'chordRate', 'seedWindow', 'scaleMode', 'manualScale', 'rootNote',
  'chordProgressionEnabled', 'chordProgressionPattern', 'chordProgressionSteps',
  'chordProgressionStepEnabled', 'cofDriftEnabled', 'voicingSpread', 'synthEuclideanMasterEnabled',
  'synthEuclid1Enabled', 'synthEuclid1Source', 'synthEuclid1VoiceMask',
  'synthEuclid2Enabled', 'synthEuclid2Source', 'synthEuclid2VoiceMask',
  'synthEuclid3Enabled', 'synthEuclid3Source', 'synthEuclid3VoiceMask',
  'synthEuclid4Enabled', 'synthEuclid4Source', 'synthEuclid4VoiceMask',
  'padEnabled', 'pad2Enabled', 'synthVoiceMask', 'pad2VoiceAssign', 'synthOctave',
  'waveSpread', 'leadRandomEnabled', 'leadRandomSource', 'leadRandomClockSource',
  'leadRandomSyncPolicy', 'leadEnabled', 'lead2Enabled', 'sample1Enabled', 'sample2Enabled',
] as const;

export const ARRANGEMENT_TRANSPORT_TIMING_KEYS = [
  'phraseLength',
  'transportPrimaryClock',
  'transportBeatsPerBar',
  'transportBarsPerPhrase',
  'sequencerMasterBPM',
  'synthEuclidBaseBPM',
  'drumEuclidBaseBPM',
] as const;

// Timing owned by the host scheduler has no native transport transition revision,
// so it is committed by the arrangement scheduler at its next phrase boundary.
export const ARRANGEMENT_HOST_NEXT_PHRASE_TIMING_KEYS = [] as const;

const ARRANGEMENT_RESTART_STATE_KEY = '__arrangementRestartState';

function booleanFromState(state: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function arrangementRestartKey(state: Record<string, unknown>): string {
  const restartState = state[ARRANGEMENT_RESTART_STATE_KEY];
  const source = restartState && typeof restartState === 'object'
    ? restartState as Record<string, unknown>
    : state;
  return JSON.stringify(ARRANGEMENT_RESTART_KEYS.map((key) => [key, source[key]]));
}

export function padEuclidOwnedVoiceMask(state: Record<string, unknown>): number {
  if (!booleanFromState(state, 'synthEuclideanMasterEnabled', false)) return 0;
  let mask = 0;
  for (const laneNumber of [1, 2, 3, 4]) {
    const prefix = `synthEuclid${laneNumber}`;
    if (!booleanFromState(state, `${prefix}Enabled`, laneNumber === 1)) continue;
    const source = String(state[`${prefix}Source`] ?? 'lead').toLowerCase();
    if (source === 'pad1' || source === 'pad2') {
      const voiceMask = Math.round(Number(state[`${prefix}VoiceMask`] ?? PAD_VOICE_DEFAULT_MASK)) & PAD_VOICE_MASK_ALL;
      mask |= voiceMask;
      continue;
    }
    if (!source.startsWith('synth')) continue;
    const voiceIndex = Number.parseInt(source.replace('synth', ''), 10) - 1;
    if (voiceIndex >= 0 && voiceIndex < PAD_VOICE_COUNT) mask |= 1 << voiceIndex;
  }
  return mask;
}

export function enabledChordMidiForMask(chordMidi: number[], voiceMask: number): number[] {
  const enabledMidi: number[] = [];
  const mappedVoiceCount = Math.min(PAD_VOICE_COUNT, chordMidi.length);
  for (let voiceIndex = 0; voiceIndex < mappedVoiceCount; voiceIndex += 1) {
    const midi = chordMidi[voiceIndex];
    if ((voiceMask & (1 << voiceIndex)) !== 0 && midi !== undefined) enabledMidi.push(midi);
  }
  if (enabledMidi.length === 0 && chordMidi.length > 0) enabledMidi.push(chordMidi[0]!);
  return enabledMidi;
}

export function enabledVoiceRank(voiceMask: number, voiceIndex: number): number {
  let rank = 0;
  for (let index = 0; index < voiceIndex; index += 1) {
    if ((voiceMask & (1 << index)) !== 0) rank += 1;
  }
  return rank;
}

export function limitVoiceMaskByCount(mask: number, count: number): number {
  let limited = 0;
  let selected = 0;
  for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT && selected < count; voiceIndex += 1) {
    const bit = 1 << voiceIndex;
    if ((mask & bit) === 0) continue;
    limited |= bit;
    selected += 1;
  }
  return limited;
}

export function padChordVoiceMasksForSource(
  source: string,
  availablePadMask: number,
  pad2Assign: number,
  voiceCount: number,
): { pad1Mask: number; pad2Mask: number } {
  if (source === 'pad1' || source === 'pad') {
    const eligible = availablePadMask & ~pad2Assign;
    return { pad1Mask: limitVoiceMaskByCount(eligible !== 0 ? eligible : availablePadMask, voiceCount), pad2Mask: 0 };
  }
  if (source === 'pad2') {
    const eligible = availablePadMask & pad2Assign;
    return { pad1Mask: 0, pad2Mask: limitVoiceMaskByCount(eligible !== 0 ? eligible : availablePadMask, voiceCount) };
  }
  const selected = limitVoiceMaskByCount(availablePadMask, voiceCount);
  return { pad1Mask: selected & ~pad2Assign, pad2Mask: selected & pad2Assign };
}
