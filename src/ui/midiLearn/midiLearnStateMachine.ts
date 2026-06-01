import type { SliderState } from '../state';
import type { KesshoMidiMessage } from '../../native/midi/midiTypes';

export type MidiLearnGlobalState =
  | { mode: 'off' }
  | { mode: 'listening' }
  | { mode: 'captured'; message: KesshoMidiMessage; sourceLabel: string }
  | { mode: 'assigning'; message: KesshoMidiMessage; targetKey: keyof SliderState; targetLabel: string }
  | { mode: 'assigned'; bindingID: string; targetKey: keyof SliderState; sourceLabel: string }
  | { mode: 'error'; message: string };

export type MidiLearnEvent =
  | { type: 'TOGGLE_LEARN' }
  | { type: 'ENABLE_LEARN' }
  | { type: 'DISABLE_LEARN' }
  | { type: 'MIDI_MESSAGE_CAPTURED'; message: KesshoMidiMessage; sourceLabel: string }
  | { type: 'SLIDER_DRAGGED'; targetKey: keyof SliderState; targetLabel: string }
  | { type: 'ASSIGNMENT_CREATED'; bindingID: string; targetKey: keyof SliderState }
  | { type: 'CANCEL_CAPTURED_SOURCE' }
  | { type: 'ERROR'; message: string };

export function midiLearnReducer(
  state: MidiLearnGlobalState,
  event: MidiLearnEvent,
): MidiLearnGlobalState {
  switch (event.type) {
    case 'TOGGLE_LEARN':
      return state.mode === 'off' ? { mode: 'listening' } : { mode: 'off' };
    case 'ENABLE_LEARN':
      return { mode: 'listening' };
    case 'DISABLE_LEARN':
      return { mode: 'off' };
    case 'MIDI_MESSAGE_CAPTURED':
      if (state.mode === 'off') return state;
      return { mode: 'captured', message: event.message, sourceLabel: event.sourceLabel };
    case 'SLIDER_DRAGGED':
      if (state.mode !== 'captured') return state;
      return {
        mode: 'assigning',
        message: state.message,
        targetKey: event.targetKey,
        targetLabel: event.targetLabel,
      };
    case 'ASSIGNMENT_CREATED':
      if (state.mode !== 'assigning') return { mode: 'listening' };
      return {
        mode: 'assigned',
        bindingID: event.bindingID,
        targetKey: event.targetKey,
        sourceLabel: state.message.endpointName ?? 'MIDI control',
      };
    case 'CANCEL_CAPTURED_SOURCE':
      return state.mode === 'captured' || state.mode === 'assigning' || state.mode === 'assigned'
        ? { mode: 'listening' }
        : state;
    case 'ERROR':
      return { mode: 'error', message: event.message };
    default:
      return state;
  }
}
