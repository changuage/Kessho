import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICE_ORDER } from '../../../audio/drumVoiceConfig';
import type { EngineScatterState, GeneratedDrumPhrase, ScatterRuleState, SeqScatterState } from './scatterTypes';
import type { SeqSimpleState } from '../SeqSimple';

export const DEFAULT_SCATTER_RULES: ScatterRuleState = {
  anchor: 0.65,
  breath: 0.6,
  memory: 0.35,
  motion: 0.45,
  fracture: 0.2,
  spread: 0.1,
};

const ENGINE_DEFAULTS: Record<DrumVoiceType, Omit<EngineScatterState, 'rules'>> = {
  sub: { enabled: true, triggerProbability: 0.08, burstProbability: 0.1, randomWalk: 0.12, feelX: -0.25, feelY: -0.75 },
  kick: { enabled: true, triggerProbability: 0.14, burstProbability: 0.15, randomWalk: 0.14, feelX: 0.05, feelY: -0.68 },
  click: { enabled: true, triggerProbability: 0.18, burstProbability: 0.25, randomWalk: 0.28, feelX: 0.25, feelY: -0.1 },
  beepHi: { enabled: false, triggerProbability: 0.12, burstProbability: 0.3, randomWalk: 0.34, feelX: 0.45, feelY: 0.1 },
  beepLo: { enabled: false, triggerProbability: 0.1, burstProbability: 0.25, randomWalk: 0.24, feelX: -0.5, feelY: 0.05 },
  noise: { enabled: true, triggerProbability: 0.12, burstProbability: 0.45, randomWalk: 0.42, feelX: 0.15, feelY: 0.65 },
  membrane: { enabled: true, triggerProbability: 0.12, burstProbability: 0.3, randomWalk: 0.3, feelX: 0.25, feelY: 0.2 },
};

function cloneRules(rules: ScatterRuleState): ScatterRuleState {
  return { ...rules };
}

export function createDefaultEngineScatterState(voice: DrumVoiceType): EngineScatterState {
  const defaults = ENGINE_DEFAULTS[voice];
  return {
    ...defaults,
    rules: cloneRules(DEFAULT_SCATTER_RULES),
  };
}

export function createDefaultSeqScatterState(simple?: SeqSimpleState): SeqScatterState {
  const engines = Object.fromEntries(DRUM_VOICE_ORDER.map((voice) => {
    const base = createDefaultEngineScatterState(voice);
    const migrated = simple?.voices?.[voice];
    return [voice, migrated ? {
      ...base,
      enabled: migrated.enabled,
      triggerProbability: Math.max(0, Math.min(1, migrated.density)),
    } : base];
  })) as Record<DrumVoiceType, EngineScatterState>;

  return {
    active: simple?.active ?? false,
    selectedEngine: 'kick',
    engines,
    recentPhrasesByEngine: Object.fromEntries(DRUM_VOICE_ORDER.map((voice) => [voice, [] as GeneratedDrumPhrase[]])) as Record<DrumVoiceType, GeneratedDrumPhrase[]>,
  };
}

export function normalizeSeqScatterState(state: SeqScatterState | undefined, simple?: SeqSimpleState): SeqScatterState {
  const fallback = createDefaultSeqScatterState(simple);
  if (!state) return fallback;
  return {
    active: state.active ?? fallback.active,
    selectedEngine: state.selectedEngine && DRUM_VOICE_ORDER.includes(state.selectedEngine)
      ? state.selectedEngine
      : fallback.selectedEngine,
    engines: Object.fromEntries(DRUM_VOICE_ORDER.map((voice) => [
      voice,
      {
        ...fallback.engines[voice],
        ...(state.engines?.[voice] ?? {}),
        rules: {
          ...fallback.engines[voice].rules,
          ...(state.engines?.[voice]?.rules ?? {}),
        },
      },
    ])) as Record<DrumVoiceType, EngineScatterState>,
    recentPhrasesByEngine: Object.fromEntries(DRUM_VOICE_ORDER.map((voice) => [
      voice,
      (state.recentPhrasesByEngine?.[voice] ?? []).slice(0, 3),
    ])) as Record<DrumVoiceType, GeneratedDrumPhrase[]>,
  };
}

export function seqSimpleStateFromScatterState(state: SeqScatterState): SeqSimpleState {
  return {
    active: state.active,
    speed: 0.25,
    voices: Object.fromEntries(DRUM_VOICE_ORDER.map((voice) => [
      voice,
      {
        enabled: state.engines[voice].enabled,
        density: state.engines[voice].triggerProbability,
      },
    ])) as SeqSimpleState['voices'],
  };
}

export function pushRecentPhrase(
  state: SeqScatterState,
  engine: DrumVoiceType,
  phrase: GeneratedDrumPhrase,
): SeqScatterState {
  const prev = state.recentPhrasesByEngine[engine] ?? [];
  return {
    ...state,
    recentPhrasesByEngine: {
      ...state.recentPhrasesByEngine,
      [engine]: [phrase, ...prev].slice(0, 3),
    },
  };
}
