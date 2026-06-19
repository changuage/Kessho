import type { DrumVoiceType } from './drumSynth';

const DRUM_VOICE_ORDER: readonly DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];

export const DRUM_VOICE_BASE_MIDI: Record<DrumVoiceType, number> = {
  sub: 35,
  kick: 36,
  click: 37,
  beepHi: 51,
  beepLo: 50,
  noise: 42,
  membrane: 38,
};

export function drumVoiceBaseMidiFromIndex(voiceIndex: number, fallback: DrumVoiceType = 'kick'): number {
  const voice = DRUM_VOICE_ORDER[Math.max(0, Math.min(DRUM_VOICE_ORDER.length - 1, Math.round(voiceIndex)))] ?? fallback;
  return DRUM_VOICE_BASE_MIDI[voice] ?? DRUM_VOICE_BASE_MIDI[fallback];
}

export function drumVoiceBaseMidi(voice: DrumVoiceType): number {
  return DRUM_VOICE_BASE_MIDI[voice] ?? DRUM_VOICE_BASE_MIDI.kick;
}
