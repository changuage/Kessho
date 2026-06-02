export const PAD_VOICE_COUNT = 6;

const ARRANGEMENT_RESTART_KEYS = [
  'phraseLength', 'transportPrimaryClock', 'transportBeatsPerBar', 'transportBarsPerPhrase',
  'sequencerMasterBPM', 'synthEuclidBaseBPM', 'drumEuclidBaseBPM',
  'harmonyClockSource', 'chordProgressionClockSource', 'chordProgressionPhraseMultiplier',
  'chordRate', 'seedWindow', 'scaleMode', 'manualScale', 'rootNote',
  'chordProgressionEnabled', 'chordProgressionPattern', 'chordProgressionSteps',
  'chordProgressionStepEnabled', 'cofDriftEnabled', 'cofDriftRate', 'cofDriftDirection',
  'cofDriftRange', 'voicingSpread', 'synthChordSequencerEnabled', 'synthEuclideanMasterEnabled',
  'synthEuclid1Enabled', 'synthEuclid1Source', 'synthEuclid2Enabled', 'synthEuclid2Source',
  'synthEuclid3Enabled', 'synthEuclid3Source', 'synthEuclid4Enabled', 'synthEuclid4Source',
  'padEnabled', 'pad2Enabled', 'synthVoiceMask', 'pad2VoiceAssign', 'synthOctave',
  'waveSpread', 'leadRandomEnabled', 'leadRandomSource', 'leadRandomClockSource',
  'leadRandomSyncPolicy', 'leadEnabled', 'lead2Enabled', 'pianoEnabled',
] as const;

function booleanFromState(state: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = state[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function arrangementRestartKey(state: Record<string, unknown>): string {
  return JSON.stringify(ARRANGEMENT_RESTART_KEYS.map((key) => [key, state[key]]));
}

export function padEuclidOwnedVoiceMask(state: Record<string, unknown>): number {
  if (!booleanFromState(state, 'synthEuclideanMasterEnabled', false)) return 0;
  let mask = 0;
  for (const laneNumber of [1, 2, 3, 4]) {
    const prefix = `synthEuclid${laneNumber}`;
    if (!booleanFromState(state, `${prefix}Enabled`, laneNumber === 1)) continue;
    const source = String(state[`${prefix}Source`] ?? 'lead').toLowerCase();
    if (!source.startsWith('synth')) continue;
    const voiceIndex = Number.parseInt(source.replace('synth', ''), 10) - 1;
    if (voiceIndex >= 0 && voiceIndex < PAD_VOICE_COUNT) mask |= 1 << voiceIndex;
  }
  return mask;
}

export function enabledChordMidiForMask(chordMidi: number[], voiceMask: number): number[] {
  const enabledMidi: number[] = [];
  for (let voiceIndex = 0; voiceIndex < Math.min(PAD_VOICE_COUNT, chordMidi.length); voiceIndex += 1) {
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
