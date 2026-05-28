import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { SliderState } from './state';

const SYNTH_LANE_ENABLED_KEYS = [
  'synthEuclid1Enabled',
  'synthEuclid2Enabled',
  'synthEuclid3Enabled',
  'synthEuclid4Enabled',
] as const satisfies readonly (keyof SliderState)[];

const DRUM_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
] as const satisfies readonly (keyof SliderState)[];

type SelectStateChange = <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;

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
      if (next && !currentState.leadEnabled) setPatchedSelect('leadEnabled', true);
      if (next && !currentState.padEnabled) setPatchedSelect('padEnabled', true);
      if (next && !SYNTH_LANE_ENABLED_KEYS.some((key) => Boolean(currentState[key]))) {
        setPatchedSelect(SYNTH_LANE_ENABLED_KEYS[0], true);
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
