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

export type ScatterStepVisualEvent = {
  phrase: GeneratedDrumPhrase;
  stepIndex: number;
  hitIndex: number;
  ratchetIndex: number;
  ratchetCount: number;
  scheduledMs: number;
};

type UseScatterPhrasePlayerArgs = {
  getBpm: () => number;
  sliderState?: SliderState;
  trigger: (voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => void;
  onStepVisual?: (event: ScatterStepVisualEvent) => void;
};

type ScheduledScatterTimeout = {
  id: number;
  voice: DrumVoiceType;
};

export function useScatterPhrasePlayer({
  getBpm,
  sliderState,
  trigger,
  onStepVisual,
}: UseScatterPhrasePlayerArgs): {
  playPhrase: (phrase: GeneratedDrumPhrase) => void;
  clear: () => void;
} {
  const timeoutIdsRef = useRef<ScheduledScatterTimeout[]>([]);
  const sliderStateRef = useRef(sliderState);

  useEffect(() => {
    sliderStateRef.current = sliderState;
  }, [sliderState]);

  const clear = useCallback(() => {
    for (const timeout of timeoutIdsRef.current) {
      window.clearTimeout(timeout.id);
    }
    timeoutIdsRef.current = [];
  }, []);

  const clearVoice = useCallback((voice: DrumVoiceType) => {
    const remaining: ScheduledScatterTimeout[] = [];
    for (const timeout of timeoutIdsRef.current) {
      if (timeout.voice === voice) {
        window.clearTimeout(timeout.id);
      } else {
        remaining.push(timeout);
      }
    }
    timeoutIdsRef.current = remaining;
  }, []);

  const playPhrase = useCallback((phrase: GeneratedDrumPhrase) => {
    clearVoice(phrase.engine);
    const bpm = Math.max(1, getBpm());
    const stepMs = Math.max(16, sequencerClockDivisionToSeconds(phrase.clockDiv, 60 / bpm) * 1000);
    const pattern = resolveTriggerClip(phrase.triggerClip);

    let hitIndex = -1;
    pattern.forEach((enabled, stepIndex) => {
      if (!enabled) return;
      hitIndex += 1;
      const currentHitIndex = hitIndex;
      const probability = Math.max(0, Math.min(1, phrase.probability[stepIndex] ?? 1));
      if (Math.random() > probability) return;

      const ratchetCount = Math.max(1, Math.min(8, Math.round(phrase.ratchet[stepIndex] ?? 1)));
      const ratchetMs = ratchetCount > 1 ? stepMs / ratchetCount : 0;

      for (let ratchetIndex = 0; ratchetIndex < ratchetCount; ratchetIndex += 1) {
        const delayMs = Math.max(0, stepIndex * stepMs + ratchetIndex * ratchetMs);
        const timeoutId = window.setTimeout(() => {
          timeoutIdsRef.current = timeoutIdsRef.current.filter((timeout) => timeout.id !== timeoutId);
          trigger(phrase.engine, {
            velocity: velocityForScatterStep(phrase, stepIndex) * (ratchetIndex === 0 ? 1 : 0.82),
            statePatch: statePatchForScatterStep(phrase, stepIndex, sliderStateRef.current),
            triggerCritical: false,
          });
          onStepVisual?.({
            phrase,
            stepIndex,
            hitIndex: currentHitIndex,
            ratchetIndex,
            ratchetCount,
            scheduledMs: delayMs,
          });
        }, delayMs);
        timeoutIdsRef.current.push({ id: timeoutId, voice: phrase.engine });
      }
    });
  }, [clearVoice, getBpm, onStepVisual, trigger]);

  useEffect(() => clear, [clear]);

  return { playPhrase, clear };
}
