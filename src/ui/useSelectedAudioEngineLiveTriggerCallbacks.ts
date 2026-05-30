import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  clearRuntimeFlashKeys,
  mergeRuntimeTriggerPositions,
  removeRuntimeTriggerPositions,
  setRuntimeFlashKeys,
} from './runtimeSliderState';
import {
  mergeRuntimeValues,
  removeRuntimeValues,
} from './runtimeValueState';
import type { SliderState } from './state';
import {
  emitVisualizerPulse,
  emitVisualizerPulses,
} from './visualizer/visualizerSignals';

type ActiveTab = 'global' | 'visualizer' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'dynamics' | 'routing';
type UiMode = 'snowflake' | 'advanced' | 'journey';

type SelectedAudioEngineLiveTriggerCallbacksOptions = {
  activeTab: ActiveTab;
  setSelectedDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setSelectedDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setSelectedGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setSelectedLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setSelectedLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => void;
  setSelectedLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setSelectedLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => void;
  setSelectedPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  stateRef: MutableRefObject<SliderState>;
  uiMode: UiMode;
};

export function useSelectedAudioEngineLiveTriggerCallbacks({
  activeTab,
  setSelectedDrumMorphTriggerCallback,
  setSelectedDrumParamSHTriggerCallback,
  setSelectedGranularSHTriggerCallback,
  setSelectedLeadDelayCallback,
  setSelectedLeadDistanceCallback,
  setSelectedLeadExpressionCallback,
  setSelectedLeadMorphCallback,
  setSelectedPad2DistanceTriggerCallback,
  setSelectedPad2MorphTriggerCallback,
  setSelectedPadDistanceTriggerCallback,
  setSelectedPadMorphTriggerCallback,
  setSelectedPianoDistanceTriggerCallback,
  stateRef,
  uiMode,
}: SelectedAudioEngineLiveTriggerCallbacksOptions): void {
  const shFlashTimerRef = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);
  const uiModeRef = useRef(uiMode);

  useEffect(() => {
    activeTabRef.current = activeTab;
    uiModeRef.current = uiMode;
  }, [activeTab, uiMode]);

  useEffect(() => {
    setSelectedLeadExpressionCallback((expression) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      if (activeTab === 'visualizer') {
        const amount = Math.max(
          expression.vibratoDepth ?? 0,
          expression.vibratoRate ?? 0,
          expression.glide ?? 0,
          expression.lead1 ?? 0,
          expression.lead2 ?? 0,
        );
        emitVisualizerPulse('lead', amount * 0.5 + 0.12);
        emitVisualizerPulse('synth', 0.08);
        return;
      }
      if (activeTab !== 'synth') return;
      mergeRuntimeTriggerPositions({
        leadVibratoDepth: expression.vibratoDepth ?? 0,
        leadVibratoRate: expression.vibratoRate ?? 0,
        leadGlide: expression.glide ?? 0,
      });
    });
    return () => {
      setSelectedLeadExpressionCallback(null);
    };
  }, [activeTab, setSelectedLeadExpressionCallback, uiMode]);

  useEffect(() => {
    let lastLeadMorph = 0;
    setSelectedLeadMorphCallback((morph) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastLeadMorph < 66) return;
      lastLeadMorph = now;
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('lead', Math.max(morph.lead1, morph.lead2, 0) * 0.55 + 0.12, now);
        emitVisualizerPulse('synth', 0.1, now);
        return;
      }
      if (activeTab !== 'synth') return;
      const triggerUpdates: Record<string, number> = {};
      if (morph.lead1 >= 0) triggerUpdates.lead1Morph = morph.lead1;
      if (morph.lead2 >= 0) triggerUpdates.lead2Morph = morph.lead2;
      if (Object.keys(triggerUpdates).length > 0) {
        mergeRuntimeTriggerPositions(triggerUpdates);
        mergeRuntimeValues(triggerUpdates);
      }
    });
    return () => {
      setSelectedLeadMorphCallback(null);
      removeRuntimeValues(['lead1Morph', 'lead2Morph']);
    };
  }, [activeTab, setSelectedLeadMorphCallback, uiMode]);

  useEffect(() => {
    let lastPad1Morph = 0;
    setSelectedPadMorphTriggerCallback((morphPosition: number) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastPad1Morph < 66) return;
      lastPad1Morph = now;
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('pad', morphPosition * 0.46 + 0.12, now);
        emitVisualizerPulse('synth', 0.08, now);
        return;
      }
      if (activeTab !== 'synth') return;
      mergeRuntimeTriggerPositions({ padMorph: morphPosition });
      mergeRuntimeValues({ padMorph: morphPosition });
    });
    return () => {
      setSelectedPadMorphTriggerCallback(null);
      removeRuntimeValues(['padMorph']);
    };
  }, [activeTab, setSelectedPadMorphTriggerCallback, uiMode]);

  useEffect(() => {
    let lastPad2Morph = 0;
    setSelectedPad2MorphTriggerCallback((morphPosition: number) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastPad2Morph < 66) return;
      lastPad2Morph = now;
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('pad', morphPosition * 0.42 + 0.1, now);
        emitVisualizerPulse('synth', 0.07, now);
        return;
      }
      if (activeTab !== 'synth') return;
      mergeRuntimeTriggerPositions({ pad2Morph: morphPosition });
      mergeRuntimeValues({ pad2Morph: morphPosition });
    });
    return () => {
      setSelectedPad2MorphTriggerCallback(null);
      removeRuntimeValues(['pad2Morph']);
    };
  }, [activeTab, setSelectedPad2MorphTriggerCallback, uiMode]);

  useEffect(() => {
    const distanceKeys = ['lead1Distance', 'lead2Distance', 'padDistance', 'pad2Distance', 'pianoDistance'] as const;
    const lastDistanceUpdate = {
      lead1Distance: 0,
      lead2Distance: 0,
      padDistance: 0,
      pad2Distance: 0,
      pianoDistance: 0,
    } as Record<typeof distanceKeys[number], number>;
    const commitDistance = (key: typeof distanceKeys[number], value: number) => {
      const currentUiMode = uiModeRef.current;
      const currentActiveTab = activeTabRef.current;
      if (currentUiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastDistanceUpdate[key] < 66) return;
      lastDistanceUpdate[key] = now;
      if (currentActiveTab === 'visualizer') {
        emitVisualizerPulse(key.startsWith('lead') || key === 'pianoDistance' ? 'lead' : 'pad', value * 0.36 + 0.08, now);
        emitVisualizerPulse('synth', 0.06, now);
        return;
      }
      if (currentActiveTab !== 'synth') return;
      mergeRuntimeTriggerPositions({ [key]: value });
      mergeRuntimeValues({ [key]: value });
    };
    setSelectedLeadDistanceCallback((distance) => {
      if (distance.lead1 >= 0) commitDistance('lead1Distance', distance.lead1);
      if (distance.lead2 >= 0) commitDistance('lead2Distance', distance.lead2);
    });
    setSelectedPadDistanceTriggerCallback((distance) => {
      commitDistance('padDistance', distance);
    });
    setSelectedPad2DistanceTriggerCallback((distance) => {
      commitDistance('pad2Distance', distance);
    });
    setSelectedPianoDistanceTriggerCallback((distance) => {
      commitDistance('pianoDistance', distance);
    });
    return () => {
      setSelectedLeadDistanceCallback(null);
      setSelectedPadDistanceTriggerCallback(null);
      setSelectedPad2DistanceTriggerCallback(null);
      setSelectedPianoDistanceTriggerCallback(null);
      removeRuntimeTriggerPositions(distanceKeys);
      removeRuntimeValues(distanceKeys);
    };
  }, [
    setSelectedLeadDistanceCallback,
    setSelectedPad2DistanceTriggerCallback,
    setSelectedPadDistanceTriggerCallback,
    setSelectedPianoDistanceTriggerCallback,
  ]);

  useEffect(() => {
    setSelectedLeadDelayCallback((delay) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      if (activeTab === 'visualizer') {
        const feedback = typeof delay.feedback === 'number' ? delay.feedback : 0;
        const mix = typeof delay.mix === 'number' ? delay.mix : 0;
        emitVisualizerPulse('delay', Math.max(feedback, mix) * 0.44 + 0.1);
        emitVisualizerPulse('lead', 0.05);
        return;
      }
      if (activeTab !== 'synth' && activeTab !== 'delay') return;
      const time = typeof delay.time === 'number' ? delay.time : 0;
      const feedback = typeof delay.feedback === 'number' ? delay.feedback : 0;
      const mix = typeof delay.mix === 'number' ? delay.mix : 0;
      mergeRuntimeTriggerPositions({
        delayATime: time,
        delayAFeedback: feedback,
        delayAMix: mix,
      });
    });
    return () => { setSelectedLeadDelayCallback(null); };
  }, [activeTab, setSelectedLeadDelayCallback, uiMode]);

  useEffect(() => {
    const lastMorphIndicator: Record<string, number> = {};
    let lastMorphState = 0;
    const voiceToMorphKey: Record<string, keyof SliderState> = {
      sub: 'drumSubMorph',
      kick: 'drumKickMorph',
      click: 'drumClickMorph',
      beepHi: 'drumBeepHiMorph',
      beepLo: 'drumBeepLoMorph',
      noise: 'drumNoiseMorph',
      membrane: 'drumMembraneMorph',
    };
    setSelectedDrumMorphTriggerCallback((voice, morphPosition) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      const voiceKey = String(voice);
      const morphKey = voiceToMorphKey[voiceKey];
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('drums', morphPosition * 0.54 + 0.12, now);
        emitVisualizerPulse('dynamics', 0.06, now);
        return;
      }
      if (activeTab !== 'drums') return;
      if (now - (lastMorphIndicator[voiceKey] || 0) >= 66) {
        lastMorphIndicator[voiceKey] = now;
        if (morphKey) {
          mergeRuntimeTriggerPositions({ [morphKey]: morphPosition });
        }
      }
      if (morphKey && stateRef.current.drumMorphSliderAnimate && now - lastMorphState >= 100) {
        lastMorphState = now;
        mergeRuntimeValues({ [morphKey]: morphPosition });
      }
    });
    return () => {
      setSelectedDrumMorphTriggerCallback(null);
      removeRuntimeValues(Object.values(voiceToMorphKey));
    };
  }, [activeTab, setSelectedDrumMorphTriggerCallback, stateRef, uiMode]);

  useEffect(() => {
    const lastSH: Record<string, number> = {};
    setSelectedDrumParamSHTriggerCallback((_voice, key, position) => {
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - (lastSH[key] || 0) < 80) return;
      lastSH[key] = now;
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('drums', position * 0.42 + 0.08, now);
        return;
      }
      if (activeTab !== 'drums') return;
      mergeRuntimeTriggerPositions({ [key]: position });
    });
    return () => {
      setSelectedDrumParamSHTriggerCallback(null);
    };
  }, [activeTab, setSelectedDrumParamSHTriggerCallback, uiMode]);

  useEffect(() => {
    setSelectedGranularSHTriggerCallback((positions: Record<string, number>) => {
      if (uiMode !== 'advanced' || (activeTab === 'synth' || activeTab === 'drums') || document.visibilityState !== 'visible') return;
      if (activeTab === 'visualizer') {
        const now = performance.now();
        let granularAmount = 0;
        let earthAmount = 0;
        let delayAmount = 0;
        let reverbAmount = 0;
        for (const [key, value] of Object.entries(positions)) {
          const amount = Math.max(0, value);
          if (key.includes('granular') || key.includes('grain')) granularAmount = Math.max(granularAmount, amount);
          if (key.includes('ocean') || key.includes('water') || key.includes('waves') || key.includes('nature') || key.includes('insects')) earthAmount = Math.max(earthAmount, amount);
          if (key.includes('delay')) delayAmount = Math.max(delayAmount, amount);
          if (key.includes('reverb')) reverbAmount = Math.max(reverbAmount, amount);
        }
        emitVisualizerPulses({
          granular: granularAmount * 0.46 + 0.08,
          earth: earthAmount * 0.4,
          delay: delayAmount * 0.34,
          reverb: reverbAmount * 0.3,
        }, now);
        return;
      }
      setRuntimeFlashKeys(Object.keys(positions));
      mergeRuntimeTriggerPositions(positions);
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      shFlashTimerRef.current = window.setTimeout(() => {
        clearRuntimeFlashKeys();
      }, 70);
    });
    return () => {
      setSelectedGranularSHTriggerCallback(null);
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      clearRuntimeFlashKeys();
    };
  }, [activeTab, setSelectedGranularSHTriggerCallback, uiMode]);
}
