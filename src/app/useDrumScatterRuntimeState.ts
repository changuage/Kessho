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
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  createCoreProductScatterConfigEvents,
  createCoreProductScatterEnabledEvent,
} from '../audio/coreProductEvents';
import { DRUM_VOICE_ORDER } from '../audio/drumVoiceConfig';

type UseDrumScatterRuntimeStateOptions = {
  readonly activeTab: AdvancedTab;
  readonly activeTabRef: MutableRefObject<AdvancedTab>;
  readonly playbackIsRunning: boolean;
  readonly state: SliderState;
  readonly stateRef: MutableRefObject<SliderState>;
  readonly triggerDrumVoice: (voice: DrumVoiceType, options?: ProductDrumVoiceTriggerOptions) => void;
  readonly productRuntimeMode: ProductRuntimeSelectionMode;
};

export function useDrumScatterRuntimeState({
  activeTab,
  activeTabRef,
  playbackIsRunning,
  state,
  stateRef,
  triggerDrumVoice,
  productRuntimeMode,
}: UseDrumScatterRuntimeStateOptions) {
  const productRuntimeActive = productRuntimeMode === 'core-product';
  const drumSeqSimpleStateRef = useRef<SeqSimpleState | undefined>(undefined);
  const [drumSeqScatterState, setDrumSeqScatterState] = useState<SeqScatterState>(() =>
    normalizeSeqScatterState(undefined, drumSeqSimpleStateRef.current)
  );
  const [drumScatterRuntimePulses, setDrumScatterRuntimePulses] = useState<Record<string, number>>({});
  const lastProductScatterPulseRef = useRef(0);

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
    active: drumSeqScatterState.active && !productRuntimeActive,
    isRunning: playbackIsRunning,
    state: drumSeqScatterState,
    setState: handleDrumSeqScatterStateChange,
    getBpm: getDrumScatterBpm,
    playPhrase: playDrumScatterRuntimePhrase,
    onVisualPulse: pulseDrumScatterRuntimeEngine,
  });

  useEffect(() => {
    if (!productRuntimeActive) return;
    productEngine.enqueueEvents(createCoreProductScatterConfigEvents(
      DRUM_VOICE_ORDER.map((voice) => drumSeqScatterState.engines[voice]),
    ));
    productEngine.enqueueEvent(createCoreProductScatterEnabledEvent(
      drumSeqScatterState.active && playbackIsRunning,
    ));
  }, [drumSeqScatterState, playbackIsRunning, productRuntimeActive]);

  useEffect(() => {
    if (!productRuntimeActive || activeTab !== 'drums' || !drumSeqScatterState.active) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const telemetry = productEngine.getTelemetry();
      const pulseCount = telemetry?.scatterPulseCount ?? 0;
      const voiceIndex = telemetry?.scatterCurrentVoice ?? -1;
      if (pulseCount === lastProductScatterPulseRef.current || voiceIndex < 0 || voiceIndex >= DRUM_VOICE_ORDER.length) return;
      lastProductScatterPulseRef.current = pulseCount;
      const voice = DRUM_VOICE_ORDER[voiceIndex];
      if (voice) pulseDrumScatterRuntimeEngine(voice, 'burst');
    };
    tick();
    const timer = window.setInterval(tick, 67);
    return () => window.clearInterval(timer);
  }, [activeTab, drumSeqScatterState.active, productRuntimeActive, pulseDrumScatterRuntimeEngine]);

  return {
    drumSeqSimpleStateRef,
    drumSeqScatterState,
    handleDrumSeqScatterStateChange,
    drumScatterRuntimePulses,
  };
}
