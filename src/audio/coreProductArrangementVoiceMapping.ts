import { SYNTH_EUCLIDEAN_LANE_NUMBERS } from './sequencerLaneCounts';

export const PAD_VOICE_COUNT = 8;
export const PAD_VOICE_MASK_ALL = (1 << PAD_VOICE_COUNT) - 1;
export const PAD_VOICE_DEFAULT_MASK = 1 << (PAD_VOICE_COUNT - 1);

const ARRANGEMENT_RESTART_KEYS = [
  'harmonyClockSource',
  'chordRate', 'seedWindow', 'scaleMode', 'manualScale', 'rootNote',
  'cofDriftEnabled', 'voicingSpread', 'synthEuclideanMasterEnabled',
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
  for (const laneNumber of SYNTH_EUCLIDEAN_LANE_NUMBERS) {
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
