import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import type { DrumVoiceType } from '../audio/drumSynth';
import type { ProductDrumVoiceTriggerOptions } from '../ui/useProductRuntimeManualTriggers';
import type { SliderState } from '../ui/state';
import type { SeqSimpleState } from '../ui/drums/SeqSimple';
import type { SeqScatterState } from '../ui/drums/scatter/scatterTypes';
import { normalizeSeqScatterState, seqSimpleStateFromScatterState } from '../ui/drums/scatter/scatterDefaults';
import {
  useScatterPhrasePlayer,
  type ScatterPreviewTriggerOptions,
  type ScatterStepVisualEvent,
} from '../ui/drums/scatter/useScatterPhrasePlayer';
import { useScatterSequencerRuntime } from '../ui/drums/scatter/useScatterSequencerRuntime';
import type { AdvancedTab } from './appNavigation';

type UseDrumScatterRuntimeStateOptions = {
  readonly activeTab: AdvancedTab;
  readonly activeTabRef: MutableRefObject<AdvancedTab>;
  readonly playbackIsRunning: boolean;
  readonly state: SliderState;
  readonly stateRef: MutableRefObject<SliderState>;
  readonly triggerDrumVoice: (voice: DrumVoiceType, options?: ProductDrumVoiceTriggerOptions) => void;
};

export function useDrumScatterRuntimeState({
  activeTab,
  activeTabRef,
  playbackIsRunning,
  state,
  stateRef,
  triggerDrumVoice,
}: UseDrumScatterRuntimeStateOptions) {
  const drumSeqSimpleStateRef = useRef<SeqSimpleState | undefined>(undefined);
  const [drumSeqScatterState, setDrumSeqScatterState] = useState<SeqScatterState>(() =>
    normalizeSeqScatterState(undefined, drumSeqSimpleStateRef.current)
  );
  const [drumScatterRuntimePulses, setDrumScatterRuntimePulses] = useState<Record<string, number>>({});

  const handleDrumSeqScatterStateChange = useCallback((next: SeqScatterState) => {
    drumSeqSimpleStateRef.current = seqSimpleStateFromScatterState(next);
    setDrumSeqScatterState(next);
  }, []);

  const getDrumScatterBpm = useCallback(() => (
    Number(stateRef.current.sequencerMasterBPM ?? stateRef.current.drumEuclidBaseBPM ?? 120)
  ), [stateRef]);

  const triggerDrumScatterRuntimeStep = useCallback((voice: DrumVoiceType, options: ScatterPreviewTriggerOptions) => {
    triggerDrumVoice(voice, options);
  }, [triggerDrumVoice]);

  const pulseDrumScatterRuntimeEngine = useCallback((voice: DrumVoiceType, kind: 'single' | 'burst') => {
    if (activeTabRef.current !== 'drums') return;
    setDrumScatterRuntimePulses((prev) => ({
      ...prev,
      [voice]: Date.now() + (kind === 'burst' ? 520 : 180),
    }));
  }, [activeTabRef]);

  const handleDrumScatterRuntimeStepVisual = useCallback((event: ScatterStepVisualEvent) => {
    pulseDrumScatterRuntimeEngine(event.phrase.engine, 'burst');
  }, [pulseDrumScatterRuntimeEngine]);

  const {
    playPhrase: playDrumScatterRuntimePhrase,
    clear: clearDrumScatterRuntimePlayback,
  } = useScatterPhrasePlayer({
    getBpm: getDrumScatterBpm,
    sliderState: state,
    trigger: triggerDrumScatterRuntimeStep,
    onStepVisual: handleDrumScatterRuntimeStepVisual,
  });

  useEffect(() => {
    if (!drumSeqScatterState.active || !playbackIsRunning) {
      clearDrumScatterRuntimePlayback();
    }
  }, [clearDrumScatterRuntimePlayback, drumSeqScatterState.active, playbackIsRunning]);

  useEffect(() => {
    if (activeTab !== 'drums') {
      setDrumScatterRuntimePulses((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    }
  }, [activeTab]);

  useScatterSequencerRuntime({
    active: drumSeqScatterState.active,
    isRunning: playbackIsRunning,
    state: drumSeqScatterState,
    setState: handleDrumSeqScatterStateChange,
    getBpm: getDrumScatterBpm,
    playPhrase: playDrumScatterRuntimePhrase,
    onVisualPulse: pulseDrumScatterRuntimeEngine,
  });

  return {
    drumSeqSimpleStateRef,
    drumSeqScatterState,
    handleDrumSeqScatterStateChange,
    drumScatterRuntimePulses,
  };
}
