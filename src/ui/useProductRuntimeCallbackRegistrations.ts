import {
  useLiveTriggerUiCallbacks,
  type LiveTriggerUiCallbacksOptions,
} from './useLiveTriggerUiCallbacks';
import { useEffect } from 'react';
import { emitVisualizerPulse, setVisualizerSequencerState } from './visualizer/visualizerSignals';

type ProductRuntimeCallbackRegistrationsOptions = {
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumMorphTriggerCallback: LiveTriggerUiCallbacksOptions['setDrumMorphTriggerCallback'];
  setProductDrumParamSHTriggerCallback: LiveTriggerUiCallbacksOptions['setDrumParamSHTriggerCallback'];
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductGranularSHTriggerCallback: LiveTriggerUiCallbacksOptions['setGranularSHTriggerCallback'];
  setProductLeadDelayCallback: LiveTriggerUiCallbacksOptions['setLeadDelayCallback'];
  setProductLeadDistanceCallback: LiveTriggerUiCallbacksOptions['setLeadDistanceCallback'];
  setProductLeadExpressionCallback: LiveTriggerUiCallbacksOptions['setLeadExpressionCallback'];
  setProductLeadMorphCallback: LiveTriggerUiCallbacksOptions['setLeadMorphCallback'];
  setProductPad2DistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPad2DistanceTriggerCallback'];
  setProductPad2MorphTriggerCallback: LiveTriggerUiCallbacksOptions['setPad2MorphTriggerCallback'];
  setProductPadDistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPadDistanceTriggerCallback'];
  setProductPadMorphTriggerCallback: LiveTriggerUiCallbacksOptions['setPadMorphTriggerCallback'];
  setProductPianoDistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPianoDistanceTriggerCallback'];
  setProductSample1DistanceTriggerCallback?: LiveTriggerUiCallbacksOptions['setSample1DistanceTriggerCallback'];
  setProductSample2DistanceTriggerCallback?: LiveTriggerUiCallbacksOptions['setSample2DistanceTriggerCallback'];
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
} & Pick<LiveTriggerUiCallbacksOptions, 'activeTab' | 'stateRef' | 'uiMode'>;

export function useProductRuntimeCallbackRegistrations({
  setProductDrumEvolveTriggerCallback,
  setProductDrumMorphTriggerCallback,
  setProductDrumParamSHTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductGranularSHTriggerCallback,
  setProductLeadDelayCallback,
  setProductLeadDistanceCallback,
  setProductLeadExpressionCallback,
  setProductLeadMorphCallback,
  setProductPad2DistanceTriggerCallback,
  setProductPad2MorphTriggerCallback,
  setProductPadDistanceTriggerCallback,
  setProductPadMorphTriggerCallback,
  setProductPianoDistanceTriggerCallback,
  setProductSample1DistanceTriggerCallback,
  setProductSample2DistanceTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimeCallbackRegistrationsOptions): void {
  useEffect(() => {
    if (options.uiMode !== 'advanced' || options.activeTab !== 'visualizer') return;
    setProductDrumTriggerCallback((voice, velocity) => {
      if (document.visibilityState !== 'visible') return;
      const amount = Math.max(0.08, Math.min(1, velocity || 0.4));
      emitVisualizerPulse('drums', amount);
      emitVisualizerPulse('dynamics', amount * 0.12);
      if (voice.toLowerCase().includes('kick')) emitVisualizerPulse('global', amount * 0.18);
    });
    setProductDrumStepPositionCallback((steps, hitCounts) => {
      if (document.visibilityState !== 'visible') return;
      setVisualizerSequencerState('drum', steps, hitCounts);
    });
    setProductSynthStepPositionCallback((steps, hitCounts) => {
      if (document.visibilityState !== 'visible') return;
      setVisualizerSequencerState('synth', steps, hitCounts);
    });
    setProductDrumEvolveTriggerCallback((laneIndex) => {
      if (document.visibilityState !== 'visible') return;
      emitVisualizerPulse('drums', 0.22 + Math.min(0.24, laneIndex * 0.04));
      emitVisualizerPulse('sequencer', 0.18);
    });
    setProductSynthEvolveTriggerCallback((laneIndex) => {
      if (document.visibilityState !== 'visible') return;
      emitVisualizerPulse('synth', 0.2 + Math.min(0.24, laneIndex * 0.04));
      emitVisualizerPulse('sequencer', 0.18);
    });

    return () => {
      setProductDrumTriggerCallback(null);
      setProductDrumStepPositionCallback(null);
      setProductSynthStepPositionCallback(null);
      setProductDrumEvolveTriggerCallback(null);
      setProductSynthEvolveTriggerCallback(null);
    };
  }, [
    options.activeTab,
    options.uiMode,
    setProductDrumEvolveTriggerCallback,
    setProductDrumStepPositionCallback,
    setProductDrumTriggerCallback,
    setProductSynthEvolveTriggerCallback,
    setProductSynthStepPositionCallback,
  ]);
  useLiveTriggerUiCallbacks({
    ...options,
    setDrumMorphTriggerCallback: setProductDrumMorphTriggerCallback,
    setDrumParamSHTriggerCallback: setProductDrumParamSHTriggerCallback,
    setGranularSHTriggerCallback: setProductGranularSHTriggerCallback,
    setLeadDelayCallback: setProductLeadDelayCallback,
    setLeadDistanceCallback: setProductLeadDistanceCallback,
    setLeadExpressionCallback: setProductLeadExpressionCallback,
    setLeadMorphCallback: setProductLeadMorphCallback,
    setPad2DistanceTriggerCallback: setProductPad2DistanceTriggerCallback,
    setPad2MorphTriggerCallback: setProductPad2MorphTriggerCallback,
    setPadDistanceTriggerCallback: setProductPadDistanceTriggerCallback,
    setPadMorphTriggerCallback: setProductPadMorphTriggerCallback,
    setPianoDistanceTriggerCallback: setProductPianoDistanceTriggerCallback,
    setSample1DistanceTriggerCallback: setProductSample1DistanceTriggerCallback,
    setSample2DistanceTriggerCallback: setProductSample2DistanceTriggerCallback,
  });
}
