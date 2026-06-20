import { useEffect, useRef } from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICE_ORDER } from '../../../audio/drumVoiceConfig';
import { sequencerClockDivisionToSeconds } from '../../../audio/sequencerClockDivisions';
import { generateScatterPhrase } from './scatterPhraseGenerator';
import { pushRecentPhrase } from './scatterDefaults';
import type { GeneratedDrumPhrase, SeqScatterState } from './scatterTypes';

type ScatterPulseKind = 'single' | 'burst';

type UseScatterSequencerRuntimeArgs = {
  active: boolean;
  isRunning: boolean;
  state: SeqScatterState;
  setState: (state: SeqScatterState) => void;
  getBpm: () => number;
  playPhrase: (phrase: GeneratedDrumPhrase) => void;
  onVisualPulse?: (voice: DrumVoiceType, kind: ScatterPulseKind) => void;
};

function nextSeed(voice: DrumVoiceType): number {
  const voiceOffset = DRUM_VOICE_ORDER.indexOf(voice) + 1;
  return Math.floor((Date.now() + Math.random() * 100000 + voiceOffset * 997) % 2147483647);
}

export function scatterPhraseStepMs(phrase: GeneratedDrumPhrase, bpm: number): number {
  const safeBpm = Math.max(1, bpm);
  return Math.max(16, sequencerClockDivisionToSeconds(phrase.clockDiv, 60 / safeBpm) * 1000);
}

export function scatterPhraseCooldownMs(phrase: GeneratedDrumPhrase, bpm: number): number {
  const stepMs = scatterPhraseStepMs(phrase, bpm);
  return Math.max(120, phrase.triggerClip.steps * stepMs + stepMs);
}

export function useScatterSequencerRuntime(args: UseScatterSequencerRuntimeArgs): void {
  const stateRef = useRef(args.state);
  const cooldownRef = useRef<Partial<Record<DrumVoiceType, number>>>({});
  const phraseCooldownRef = useRef(0);

  useEffect(() => {
    stateRef.current = args.state;
  }, [args.state]);

  useEffect(() => {
    if (!args.active || !args.isRunning) return;

    let cancelled = false;
    let timer: number | null = null;

    const tick = () => {
      if (cancelled) return;

      const now = performance.now();
      let nextState = stateRef.current;
      let changed = false;
      const phraseCandidates: DrumVoiceType[] = [];

      if (phraseCooldownRef.current <= now) {
        for (const voice of DRUM_VOICE_ORDER) {
          const engine = nextState.engines[voice];
          if (!engine?.enabled) continue;
          if ((cooldownRef.current[voice] ?? 0) > now) continue;
          if (Math.random() > Math.max(0, Math.min(1, engine.triggerProbability))) continue;
          if (Math.random() > Math.max(0, Math.min(1, engine.burstProbability))) continue;
          phraseCandidates.push(voice);
        }

        const voice = phraseCandidates.length > 0
          ? phraseCandidates[Math.floor(Math.random() * phraseCandidates.length)]
          : null;

        if (voice) {
          const engine = nextState.engines[voice];
          const phrase = generateScatterPhrase({
            engine: voice,
            engineState: engine,
            previousPhrases: nextState.recentPhrasesByEngine[voice] ?? [],
            seed: nextSeed(voice),
          });

          nextState = pushRecentPhrase(nextState, voice, phrase);
          changed = true;
          args.playPhrase(phrase);
          args.onVisualPulse?.(voice, 'burst');

          const bpm = args.getBpm();
          const cooldownMs = scatterPhraseCooldownMs(phrase, bpm);
          cooldownRef.current[voice] = now + cooldownMs;
          phraseCooldownRef.current = now + cooldownMs;
        }
      }

      if (changed) {
        stateRef.current = nextState;
        args.setState(nextState);
      }

      const bpm = args.getBpm();
      const sixteenthMs = 60000 / Math.max(1, bpm) / 4;
      timer = window.setTimeout(tick, Math.max(45, sixteenthMs));
    };

    timer = window.setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    args.active,
    args.isRunning,
    args.getBpm,
    args.playPhrase,
    args.setState,
    args.onVisualPulse,
  ]);
}
