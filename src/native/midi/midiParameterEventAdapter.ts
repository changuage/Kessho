import type { SliderState } from '../../ui/state';
import { getMidiMappableParam } from './midiMappableParams';
import type { KesshoMidiBindingV2 } from './midiRoutingProfile';
import type { KesshoMidiControlSource } from './midiTypes';

export type MidiMappedParameterUpdate = {
  key: keyof SliderState;
  value: number | boolean | string;
  bindingID: string;
  source: KesshoMidiControlSource;
  timestamp: number;
};

export type MidiParameterDispatchResult =
  | { mode: 'product-event'; key: keyof SliderState }
  | { mode: 'product-patch'; key: keyof SliderState; reason: 'midi-cc-control-change' }
  | { mode: 'unsupported'; key: keyof SliderState; reason: string };

export type MidiParameterDispatchOptions = {
  dispatchProductEvent?: (update: MidiMappedParameterUpdate) => void;
  dispatchProductPatch?: (key: keyof SliderState, value: MidiMappedParameterUpdate['value'], reason: 'midi-cc-control-change') => void;
  applyUiValue: (key: keyof SliderState, value: number) => void;
};

export function dispatchMidiMappedParameterUpdate(
  update: MidiMappedParameterUpdate,
  options: MidiParameterDispatchOptions,
): MidiParameterDispatchResult {
  const param = getMidiMappableParam(update.key);
  if (!param) {
    return { mode: 'unsupported', key: update.key, reason: 'Parameter is not MIDI mappable.' };
  }

  if (typeof update.value !== 'number') {
    return { mode: 'unsupported', key: update.key, reason: 'Only scalar numeric MIDI updates are currently routed.' };
  }

  if (options.dispatchProductEvent) {
    options.dispatchProductEvent(update);
    return { mode: 'product-event', key: update.key };
  }

  options.applyUiValue(update.key, update.value);
  options.dispatchProductPatch?.(update.key, update.value, 'midi-cc-control-change');
  return { mode: 'product-patch', key: update.key, reason: 'midi-cc-control-change' };
}

export function midiUpdateFromBinding(
  binding: KesshoMidiBindingV2,
  value: number,
  timestamp: number,
): MidiMappedParameterUpdate {
  return {
    key: binding.target.key,
    value,
    bindingID: binding.id,
    source: binding.source,
    timestamp,
  };
}
