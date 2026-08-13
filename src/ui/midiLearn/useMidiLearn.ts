import React from 'react';
import type { SliderState } from '../state';
import type { MidiRoutingConflict } from '../../native/midi/midiRoutingConflicts';
import type { KesshoMidiBindingV2, KesshoMidiRoutingProfileV2 } from '../../native/midi/midiRoutingProfile';
import type { KesshoMidiEndpointInfo, KesshoMidiMessage, KesshoMidiStatus } from '../../native/midi/midiTypes';
import type { MidiLearnGlobalState } from './midiLearnStateMachine';

export type MidiActivityEntry = {
  id: string;
  message: KesshoMidiMessage;
  label: string;
  receivedAt: number;
};

export type MidiLearnContextValue = {
  learnState: MidiLearnGlobalState;
  profile: KesshoMidiRoutingProfileV2;
  inputs: KesshoMidiEndpointInfo[];
  status: KesshoMidiStatus | null;
  activity: MidiActivityEntry[];
  conflicts: MidiRoutingConflict[];
  selectedBindingID: string | null;
  bridgeAvailable: boolean;
  globalButtonVisible: boolean;
  setGlobalButtonVisible: (visible: boolean) => void;
  toggleLearn: () => void;
  enableLearn: () => Promise<void>;
  disableLearn: () => void;
  cancelCapturedSource: () => void;
  openMidiPage: () => void;
  setSelectedBindingID: (id: string | null) => void;
  setProfile: (profile: KesshoMidiRoutingProfileV2) => void;
  refreshInputs: () => Promise<void>;
  toggleInput: (input: KesshoMidiEndpointInfo, enabled: boolean) => Promise<void>;
  assignCapturedToSlider: (targetKey: keyof SliderState, targetLabel: string) => KesshoMidiBindingV2 | null;
  notifySliderDrag: (targetKey: keyof SliderState, targetLabel: string) => void;
  updateBinding: (bindingID: string, updater: (binding: KesshoMidiBindingV2) => KesshoMidiBindingV2) => void;
  removeBinding: (bindingID: string) => void;
  duplicateBinding: (bindingID: string) => void;
};

const noopAsync = async () => undefined;

export const MidiLearnContext = React.createContext<MidiLearnContextValue>({
  learnState: { mode: 'off' },
  profile: {
    version: 2,
    profileID: 'unavailable',
    name: 'Unavailable',
    createdAt: '',
    updatedAt: '',
    connectedInputIDs: [],
    bindings: [],
  },
  inputs: [],
  status: null,
  activity: [],
  conflicts: [],
  selectedBindingID: null,
  bridgeAvailable: false,
  globalButtonVisible: false,
  setGlobalButtonVisible: () => undefined,
  toggleLearn: () => undefined,
  enableLearn: noopAsync,
  disableLearn: () => undefined,
  cancelCapturedSource: () => undefined,
  openMidiPage: () => undefined,
  setSelectedBindingID: () => undefined,
  setProfile: () => undefined,
  refreshInputs: noopAsync,
  toggleInput: noopAsync,
  assignCapturedToSlider: () => null,
  notifySliderDrag: () => undefined,
  updateBinding: () => undefined,
  removeBinding: () => undefined,
  duplicateBinding: () => undefined,
});

export function useMidiLearn(): MidiLearnContextValue {
  return React.useContext(MidiLearnContext);
}
