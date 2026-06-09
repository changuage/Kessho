import { useEffect } from 'react';

import { removeRuntimeTriggerPositions } from './runtimeSliderState';
import { removeRuntimeValues } from './runtimeValueState';

const STOPPED_RUNTIME_VALUE_KEYS = [
  'padMorph',
  'pad2Morph',
  'lead1Morph',
  'lead2Morph',
  'lead1Distance',
  'lead2Distance',
  'padDistance',
  'pad2Distance',
  'pianoDistance',
  'synthEuclid1NoteMin',
  'synthEuclid1NoteMax',
  'synthEuclid2NoteMin',
  'synthEuclid2NoteMax',
  'synthEuclid3NoteMin',
  'synthEuclid3NoteMax',
  'synthEuclid4NoteMin',
  'synthEuclid4NoteMax',
];

const STOPPED_TRIGGER_POSITION_KEYS = ['lead1Distance', 'lead2Distance', 'padDistance', 'pad2Distance', 'pianoDistance'];

export function useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning: boolean): void {
  useEffect(() => {
    if (playbackIsRunning) return;
    removeRuntimeValues(STOPPED_RUNTIME_VALUE_KEYS);
    removeRuntimeTriggerPositions(STOPPED_TRIGGER_POSITION_KEYS);
  }, [playbackIsRunning]);
}
