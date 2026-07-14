import { useCallback, type MutableRefObject } from 'react';
import type { SliderState } from './state';
import { useKeyboardScope } from './keyboard/useKeyboardScope';
import {
  applySequencerTransportPlan,
  planDrumSequencerTransportToggle,
  planSynthSequencerTransportToggle,
} from './sequencer/sequencerTransportPolicy';

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
  drumLaneEnableTouchedRef: MutableRefObject<boolean>;
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
  drumLaneEnableTouchedRef,
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
    const plan = target === 'synth'
      ? planSynthSequencerTransportToggle(currentState, 0)
      : planDrumSequencerTransportToggle(currentState, 0, drumLaneEnableTouchedRef.current);
    applySequencerTransportPlan(
      plan,
      handleSelectChange,
      !playbackIsRunning ? requestSequencerPlaybackStart : undefined,
    );
  }, [drumLaneEnableTouchedRef, handleSelectChange, playbackIsRunning, requestSequencerPlaybackStart, stateRef]);

  useKeyboardScope({
    priority: -100,
    onKeyDown: (event): void => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code !== 'Space') return;
      if (uiMode !== 'advanced' || (activeTab !== 'synth' && activeTab !== 'drums')) return;
      if (isEditableShortcutTarget(event.target)) return;
      event.preventDefault();
      toggleLazySequencerTransport(activeTab);
    },
  });

  return {
    requestSequencerPlaybackStart,
  };
}
