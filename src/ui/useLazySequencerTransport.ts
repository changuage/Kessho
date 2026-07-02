import { useCallback, useEffect, type MutableRefObject } from 'react';
import { normalizeSynthEuclidSource } from '../audio/coreProductSourceMapping';
import type { SliderState } from './state';

const SYNTH_LANE_ENABLED_KEYS = [
  'synthEuclid1Enabled',
  'synthEuclid2Enabled',
  'synthEuclid3Enabled',
  'synthEuclid4Enabled',
] as const satisfies readonly (keyof SliderState)[];

const SYNTH_LANE_SOURCE_KEYS = [
  'synthEuclid1Source',
  'synthEuclid2Source',
  'synthEuclid3Source',
  'synthEuclid4Source',
] as const satisfies readonly (keyof SliderState)[];

const DRUM_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
] as const satisfies readonly (keyof SliderState)[];

type SelectStateChange = <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
type SequencerSynthSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'sample1' | 'sample2';

type UseLazySequencerTransportOptions = {
  activeTab: string;
  uiMode: string;
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  stateRef: MutableRefObject<SliderState>;
  handleSelectChange: SelectStateChange;
  startPlayback: (state?: SliderState) => void | Promise<void>;
  isEditableShortcutTarget: (target: EventTarget | null) => boolean;
};

type LazySequencerTransportControls = {
  requestSequencerPlaybackStart: (statePatch?: Partial<SliderState>) => void;
};

function lazyManualSourceForLaneSource(source: unknown, pad2VoiceAssign: unknown): SequencerSynthSource {
  const sourceName = normalizeSynthEuclidSource(source);
  if (sourceName === 'lead2') return 'lead2';
  if (sourceName === 'sample1') return 'sample1';
  if (sourceName === 'sample2') return 'sample2';
  if (sourceName === 'pad1') return 'pad1';
  if (sourceName === 'pad2') return 'pad2';
  if (sourceName.startsWith('synth')) {
    const voiceIndex = Number.parseInt(sourceName.replace('synth', ''), 10) - 1;
    if (Number.isFinite(voiceIndex) && voiceIndex >= 0) {
      const pad2Mask = typeof pad2VoiceAssign === 'number' && Number.isFinite(pad2VoiceAssign) ? pad2VoiceAssign : 0;
      return (pad2Mask & (1 << voiceIndex)) !== 0 ? 'pad2' : 'pad1';
    }
    return 'pad1';
  }
  return 'lead1';
}

export function useLazySequencerTransport({
  activeTab,
  uiMode,
  playbackIsRunning,
  isJourneyPlaying,
  stateRef,
  handleSelectChange,
  startPlayback,
  isEditableShortcutTarget,
}: UseLazySequencerTransportOptions): LazySequencerTransportControls {
  const requestSequencerPlaybackStart = useCallback((statePatch?: Partial<SliderState>): void => {
    if (playbackIsRunning || isJourneyPlaying) return;
    const patchedState = statePatch && Object.keys(statePatch).length > 0
      ? { ...stateRef.current, ...statePatch }
      : undefined;
    void startPlayback(patchedState);
  }, [isJourneyPlaying, playbackIsRunning, startPlayback, stateRef]);

  const toggleLazySequencerTransport = useCallback((target: 'synth' | 'drums'): void => {
    const currentState = stateRef.current;
    const patch: Partial<SliderState> = {};
    const setPatchedSelect: SelectStateChange = (key, value) => {
      handleSelectChange(key, value);
      patch[key] = value;
    };

    if (target === 'synth') {
      const next = !currentState.synthEuclideanMasterEnabled;
      setPatchedSelect('synthEuclideanMasterEnabled', next);
      const enableSynthSequencerSource = (source: SequencerSynthSource) => {
        if (source === 'pad1' && !currentState.padEnabled) {
          setPatchedSelect('padEnabled', true);
        } else if (source === 'pad2' && !currentState.pad2Enabled) {
          setPatchedSelect('pad2Enabled', true);
        } else if (source === 'lead1' && !currentState.leadEnabled) {
          setPatchedSelect('leadEnabled', true);
        } else if (source === 'lead2' && !currentState.lead2Enabled) {
          setPatchedSelect('lead2Enabled', true);
        } else if (source === 'sample1' && !currentState.sample1Enabled) {
          setPatchedSelect('sample1Enabled', true);
        } else if (source === 'sample2' && !currentState.sample2Enabled) {
          setPatchedSelect('sample2Enabled', true);
        }
      };
      if (next) {
        SYNTH_LANE_SOURCE_KEYS.forEach((sourceKey, laneIndex) => {
          const enabledKey = SYNTH_LANE_ENABLED_KEYS[laneIndex];
          if (!enabledKey || !Boolean(currentState[enabledKey])) return;
          enableSynthSequencerSource(lazyManualSourceForLaneSource(currentState[sourceKey], currentState.pad2VoiceAssign));
        });
      }
      if (next && !playbackIsRunning) requestSequencerPlaybackStart(patch);
      return;
    }

    const next = !currentState.drumEuclidMasterEnabled;
    setPatchedSelect('drumEuclidMasterEnabled', next);
    if (next && !currentState.drumEnabled) setPatchedSelect('drumEnabled', true);
    if (next && !DRUM_LANE_ENABLED_KEYS.some((key) => Boolean(currentState[key]))) {
      setPatchedSelect(DRUM_LANE_ENABLED_KEYS[0], true);
    }
    if (next && !playbackIsRunning) requestSequencerPlaybackStart(patch);
  }, [handleSelectChange, playbackIsRunning, requestSequencerPlaybackStart, stateRef]);

  useEffect(() => {
    const handleLazySequencerTransportShortcut = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code !== 'Space') return;
      if (uiMode !== 'advanced' || (activeTab !== 'synth' && activeTab !== 'drums')) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (document.querySelector(`.seq-play-btn[data-sequencer-transport="${activeTab}"]`)) return;
      event.preventDefault();
      toggleLazySequencerTransport(activeTab);
    };
    window.addEventListener('keydown', handleLazySequencerTransportShortcut, true);
    return () => window.removeEventListener('keydown', handleLazySequencerTransportShortcut, true);
  }, [activeTab, isEditableShortcutTarget, toggleLazySequencerTransport, uiMode]);

  return {
    requestSequencerPlaybackStart,
  };
}
