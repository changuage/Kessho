import type { DrumVoiceType } from '../../audio/drumSynth';
import type { SliderState } from '../state';

export type DrumVoiceParamRoute = {
  voice: DrumVoiceType;
  prefix: string;
  morphKey: keyof SliderState;
  presetAKey: keyof SliderState;
  presetBKey: keyof SliderState;
};

export const DRUM_VOICE_PARAM_ROUTES: readonly DrumVoiceParamRoute[] = [
  {
    voice: 'sub',
    prefix: 'drumSub',
    morphKey: 'drumSubMorph',
    presetAKey: 'drumSubPresetA',
    presetBKey: 'drumSubPresetB',
  },
  {
    voice: 'kick',
    prefix: 'drumKick',
    morphKey: 'drumKickMorph',
    presetAKey: 'drumKickPresetA',
    presetBKey: 'drumKickPresetB',
  },
  {
    voice: 'click',
    prefix: 'drumClick',
    morphKey: 'drumClickMorph',
    presetAKey: 'drumClickPresetA',
    presetBKey: 'drumClickPresetB',
  },
  {
    voice: 'beepHi',
    prefix: 'drumBeepHi',
    morphKey: 'drumBeepHiMorph',
    presetAKey: 'drumBeepHiPresetA',
    presetBKey: 'drumBeepHiPresetB',
  },
  {
    voice: 'beepLo',
    prefix: 'drumBeepLo',
    morphKey: 'drumBeepLoMorph',
    presetAKey: 'drumBeepLoPresetA',
    presetBKey: 'drumBeepLoPresetB',
  },
  {
    voice: 'noise',
    prefix: 'drumNoise',
    morphKey: 'drumNoiseMorph',
    presetAKey: 'drumNoisePresetA',
    presetBKey: 'drumNoisePresetB',
  },
  {
    voice: 'membrane',
    prefix: 'drumMembrane',
    morphKey: 'drumMembraneMorph',
    presetAKey: 'drumMembranePresetA',
    presetBKey: 'drumMembranePresetB',
  },
] as const;

const DRUM_VOICE_PARAM_ROUTES_BY_MORPH_KEY = new Map<string, DrumVoiceParamRoute>(
  DRUM_VOICE_PARAM_ROUTES.map((route) => [String(route.morphKey), route]),
);

const DRUM_VOICE_PARAM_ROUTES_BY_PRESET_KEY = new Map<string, DrumVoiceParamRoute>(
  DRUM_VOICE_PARAM_ROUTES.flatMap((route) => [
    [String(route.presetAKey), route] as const,
    [String(route.presetBKey), route] as const,
  ]),
);

export function getDrumVoiceParamRoute(key: string | keyof SliderState): DrumVoiceParamRoute | null {
  const keyStr = String(key);
  if (keyStr.includes('Morph') || keyStr.includes('Preset')) return null;
  return DRUM_VOICE_PARAM_ROUTES.find((route) => keyStr.startsWith(route.prefix)) ?? null;
}

export function isDrumVoiceParamKey(key: string | keyof SliderState): boolean {
  return getDrumVoiceParamRoute(key) !== null;
}

export function getDrumVoiceMorphRoute(key: string | keyof SliderState): DrumVoiceParamRoute | null {
  return DRUM_VOICE_PARAM_ROUTES_BY_MORPH_KEY.get(String(key)) ?? null;
}

export function getDrumVoicePresetRoute(key: string | keyof SliderState): DrumVoiceParamRoute | null {
  return DRUM_VOICE_PARAM_ROUTES_BY_PRESET_KEY.get(String(key)) ?? null;
}

export function getDrumVoiceRoute(voice: DrumVoiceType): DrumVoiceParamRoute {
  const route = DRUM_VOICE_PARAM_ROUTES.find((item) => item.voice === voice);
  if (!route) throw new Error(`Unknown drum voice route: ${voice}`);
  return route;
}
