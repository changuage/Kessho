import { useCallback, useEffect, useRef } from 'react';
import { sequencerClockDivisionToSeconds } from '../../../audio/sequencerClockDivisions';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import type { SliderState } from '../../state';
import {
  statePatchForScatterStep,
  velocityForScatterStep,
} from './scatterPreviewState';
import type { GeneratedDrumPhrase } from './scatterTypes';

export type ScatterPreviewTriggerOptions = {
  velocity: number;
  statePatch?: Partial<SliderState>;
  triggerCritical?: boolean;
};

type UseScatterPhrasePlayerArgs = {
  getBpm: () => number;
  trigger: (voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => void;
  onStepVisual?: (phrase: GeneratedDrumPhrase, stepIndex: number) => void;
};

export function useScatterPhrasePlayer({
  getBpm,
  trigger,
  onStepVisual,
}: UseScatterPhrasePlayerArgs): {
  playPhrase: (phrase: GeneratedDrumPhrase) => void;
  clear: () => void;
} {
  const timeoutIdsRef = useRef<number[]>([]);

  const clear = useCallback(() => {
    for (const timeoutId of timeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    timeoutIdsRef.current = [];
  }, []);

  const playPhrase = useCallback((phrase: GeneratedDrumPhrase) => {
    const bpm = Math.max(1, getBpm());
    const stepMs = Math.max(16, sequencerClockDivisionToSeconds(phrase.clockDiv, 60 / bpm) * 1000);
    const pattern = resolveTriggerClip(phrase.triggerClip);

    pattern.forEach((enabled, stepIndex) => {
      if (!enabled) return;
      const probability = Math.max(0, Math.min(1, phrase.probability[stepIndex] ?? 1));
      if (Math.random() > probability) return;

      const ratchetCount = Math.max(1, Math.min(8, Math.round(phrase.ratchet[stepIndex] ?? 1)));
      const ratchetMs = ratchetCount > 1 ? stepMs / ratchetCount : 0;

      for (let ratchetIndex = 0; ratchetIndex < ratchetCount; ratchetIndex += 1) {
        const delayMs = Math.max(0, stepIndex * stepMs + ratchetIndex * ratchetMs);
        const timeoutId = window.setTimeout(() => {
          timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
          trigger(phrase.engine, {
            velocity: velocityForScatterStep(phrase, stepIndex) * (ratchetIndex === 0 ? 1 : 0.82),
            statePatch: statePatchForScatterStep(phrase, stepIndex),
            triggerCritical: false,
          });
          onStepVisual?.(phrase, stepIndex);
        }, delayMs);
        timeoutIdsRef.current.push(timeoutId);
      }
    });
  }, [getBpm, onStepVisual, trigger]);

  useEffect(() => clear, [clear]);

  return { playPhrase, clear };
}
