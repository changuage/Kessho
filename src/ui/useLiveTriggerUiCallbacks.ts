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

export type LiveTriggerActiveTab =
  | 'global'
  | 'visualizer'
  | 'synth'
  | 'drums'
  | 'reverb'
  | 'granular'
  | 'earth'
  | 'delay'
  | 'texture'
  | 'routing';

export type LiveTriggerUiMode = 'snowflake' | 'advanced' | 'journey';

export type LiveTriggerUiCallbacksOptions = {
  activeTab: LiveTriggerActiveTab;
  setDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => void;
  setLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => void;
  setPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSample1DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  setSample2DistanceTriggerCallback?: (callback: ((distance: number) => void) | null) => void;
  stateRef: MutableRefObject<SliderState>;
  uiMode: LiveTriggerUiMode;
};

export function useLiveTriggerUiCallbacks({
  activeTab,
  setDrumMorphTriggerCallback,
  setDrumParamSHTriggerCallback,
  setGranularSHTriggerCallback,
  setLeadDelayCallback,
  setLeadDistanceCallback,
  setLeadExpressionCallback,
  setLeadMorphCallback,
  setPad2DistanceTriggerCallback,
  setPad2MorphTriggerCallback,
  setPadDistanceTriggerCallback,
  setPadMorphTriggerCallback,
  setPianoDistanceTriggerCallback,
  setSample1DistanceTriggerCallback,
  setSample2DistanceTriggerCallback,
  stateRef,
  uiMode,
}: LiveTriggerUiCallbacksOptions): void {
  const shFlashTimerRef = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);
  const uiModeRef = useRef(uiMode);

  useEffect(() => {
    activeTabRef.current = activeTab;
    uiModeRef.current = uiMode;
  }, [activeTab, uiMode]);

  useEffect(() => {
    setLeadExpressionCallback((expression) => {
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
      setLeadExpressionCallback(null);
    };
  }, [activeTab, setLeadExpressionCallback, uiMode]);

  useEffect(() => {
    let lastLeadMorph = 0;
    setLeadMorphCallback((morph) => {
      if (morph.lead1 < 0 && morph.lead2 < 0) return;
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
      setLeadMorphCallback(null);
      removeRuntimeValues(['lead1Morph', 'lead2Morph']);
    };
  }, [activeTab, setLeadMorphCallback, uiMode]);

  useEffect(() => {
    let lastPad1Morph = 0;
    setPadMorphTriggerCallback((morphPosition: number) => {
      if (morphPosition < 0) return;
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
      setPadMorphTriggerCallback(null);
      removeRuntimeValues(['padMorph']);
    };
  }, [activeTab, setPadMorphTriggerCallback, uiMode]);

  useEffect(() => {
    let lastPad2Morph = 0;
    setPad2MorphTriggerCallback((morphPosition: number) => {
      if (morphPosition < 0) return;
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
      setPad2MorphTriggerCallback(null);
      removeRuntimeValues(['pad2Morph']);
    };
  }, [activeTab, setPad2MorphTriggerCallback, uiMode]);

  useEffect(() => {
    const distanceKeys = ['lead1Distance', 'lead2Distance', 'padDistance', 'pad2Distance', 'pianoDistance', 'sample1Distance', 'sample2Distance'] as const;
    const lastDistanceUpdate = {
      lead1Distance: 0,
      lead2Distance: 0,
      padDistance: 0,
      pad2Distance: 0,
      pianoDistance: 0,
      sample1Distance: 0,
      sample2Distance: 0,
    } as Record<typeof distanceKeys[number], number>;
    const commitDistance = (key: typeof distanceKeys[number], value: number) => {
      const currentUiMode = uiModeRef.current;
      const currentActiveTab = activeTabRef.current;
      if (currentUiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastDistanceUpdate[key] < 66) return;
      lastDistanceUpdate[key] = now;
      if (currentActiveTab === 'visualizer') {
        emitVisualizerPulse(key.startsWith('lead') || key.startsWith('sample') || key === 'pianoDistance' ? 'lead' : 'pad', value * 0.36 + 0.08, now);
        emitVisualizerPulse('synth', 0.06, now);
        return;
      }
      if (currentActiveTab !== 'synth') return;
      mergeRuntimeTriggerPositions({ [key]: value });
      mergeRuntimeValues({ [key]: value });
    };
    setLeadDistanceCallback((distance) => {
      if (distance.lead1 >= 0) commitDistance('lead1Distance', distance.lead1);
      if (distance.lead2 >= 0) commitDistance('lead2Distance', distance.lead2);
    });
    setPadDistanceTriggerCallback((distance) => {
      commitDistance('padDistance', distance);
    });
    setPad2DistanceTriggerCallback((distance) => {
      commitDistance('pad2Distance', distance);
    });
    setPianoDistanceTriggerCallback((distance) => {
      commitDistance('pianoDistance', distance);
    });
    setSample1DistanceTriggerCallback?.((distance) => {
      commitDistance('sample1Distance', distance);
    });
    setSample2DistanceTriggerCallback?.((distance) => {
      commitDistance('sample2Distance', distance);
    });
    return () => {
      setLeadDistanceCallback(null);
      setPadDistanceTriggerCallback(null);
      setPad2DistanceTriggerCallback(null);
      setPianoDistanceTriggerCallback(null);
      setSample1DistanceTriggerCallback?.(null);
      setSample2DistanceTriggerCallback?.(null);
      removeRuntimeTriggerPositions(distanceKeys);
      removeRuntimeValues(distanceKeys);
    };
  }, [
    setLeadDistanceCallback,
    setPad2DistanceTriggerCallback,
    setPadDistanceTriggerCallback,
    setPianoDistanceTriggerCallback,
    setSample1DistanceTriggerCallback,
    setSample2DistanceTriggerCallback,
  ]);

  useEffect(() => {
    setLeadDelayCallback((delay) => {
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
    return () => { setLeadDelayCallback(null); };
  }, [activeTab, setLeadDelayCallback, uiMode]);

  useEffect(() => {
    const lastMorphIndicator: Record<string, number> = {};
    const lastMorphValue: Record<string, number> = {};
    const voiceToMorphKey: Record<string, keyof SliderState> = {
      0: 'drumSubMorph',
      1: 'drumKickMorph',
      2: 'drumClickMorph',
      3: 'drumBeepHiMorph',
      4: 'drumBeepLoMorph',
      5: 'drumNoiseMorph',
      6: 'drumMembraneMorph',
      sub: 'drumSubMorph',
      kick: 'drumKickMorph',
      click: 'drumClickMorph',
      beepHi: 'drumBeepHiMorph',
      beepLo: 'drumBeepLoMorph',
      noise: 'drumNoiseMorph',
      membrane: 'drumMembraneMorph',
    };
    const morphKeys = Array.from(new Set(Object.values(voiceToMorphKey)));
    setDrumMorphTriggerCallback((voice, morphPosition) => {
      const voiceKey = String(voice);
      const morphKey = voiceToMorphKey[voiceKey];
      if (morphPosition < 0) return;
      if (uiMode !== 'advanced' || document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (activeTab === 'visualizer') {
        emitVisualizerPulse('drums', morphPosition * 0.54 + 0.12, now);
        emitVisualizerPulse('dynamics', 0.06, now);
        return;
      }
      if (activeTab !== 'drums') return;
      if (now - (lastMorphIndicator[voiceKey] || 0) >= 66) {
        lastMorphIndicator[voiceKey] = now;
        if (morphKey) mergeRuntimeTriggerPositions({ [morphKey]: morphPosition });
      }
      if (morphKey && stateRef.current.drumMorphSliderAnimate && now - (lastMorphValue[morphKey] || 0) >= 100) {
        lastMorphValue[morphKey] = now;
        mergeRuntimeValues({ [morphKey]: morphPosition });
      }
    });
    return () => {
      setDrumMorphTriggerCallback(null);
      removeRuntimeTriggerPositions(morphKeys);
      removeRuntimeValues(morphKeys);
    };
  }, [activeTab, setDrumMorphTriggerCallback, stateRef, uiMode]);

  useEffect(() => {
    const lastSH: Record<string, number> = {};
    setDrumParamSHTriggerCallback((_voice, key, position) => {
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
      setDrumParamSHTriggerCallback(null);
    };
  }, [activeTab, setDrumParamSHTriggerCallback, uiMode]);

  useEffect(() => {
    setGranularSHTriggerCallback((positions: Record<string, number>) => {
      if (uiMode !== 'advanced' || activeTab === 'synth' || activeTab === 'drums' || document.visibilityState !== 'visible') return;
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
      setGranularSHTriggerCallback(null);
      if (shFlashTimerRef.current) window.clearTimeout(shFlashTimerRef.current);
      clearRuntimeFlashKeys();
    };
  }, [activeTab, setGranularSHTriggerCallback, uiMode]);
}
