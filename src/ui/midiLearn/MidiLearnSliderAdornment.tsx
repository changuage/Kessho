import React from 'react';
import type { SliderState } from '../state';
import { conflictsForBinding } from '../../native/midi/midiRoutingConflicts';
import { useMidiLearn } from './useMidiLearn';
import { MidiMappingPopover } from './MidiMappingPopover';

export interface MidiLearnSliderAdornmentProps {
  paramKey: keyof SliderState;
  label: string;
}

export function MidiLearnSliderAdornment({ paramKey, label }: MidiLearnSliderAdornmentProps) {
  const {
    learnState,
    profile,
    conflicts,
    selectedBindingID,
    setSelectedBindingID,
  } = useMidiLearn();
  const [open, setOpen] = React.useState(false);
  const bindings = profile.bindings.filter((binding) => binding.target.key === paramKey);
  const activeBinding = bindings.find((binding) => binding.id === selectedBindingID) ?? bindings[0] ?? null;
  const conflictCount = bindings.reduce((count, binding) => count + conflictsForBinding(binding.id, conflicts).length, 0);

  const chip = (() => {
    if (conflictCount > 0) return '! MIDI';
    if (bindings.length > 1) return `${bindings.length} MIDI`;
    if (bindings.length === 1) {
      const binding = bindings[0];
      if (!binding) return null;
      const number = typeof binding.source.number === 'number' ? binding.source.number : '';
      const pickup = binding.transform.pickupMode === 'soft-takeover';
      return pickup ? `CC ${number} · pickup` : `CC ${number}`;
    }
    if (learnState.mode === 'captured') {
      return `+ MAP CC ${learnState.message.data1 ?? '?'}`;
    }
    if (learnState.mode !== 'off') return 'MIDI';
    return null;
  })();

  if (!chip) return null;

  return (
    <span className="midi-slider-adornment">
      <button
        type="button"
        className={`midi-slider-chip${conflictCount > 0 ? ' conflict' : ''}${bindings.length > 0 ? ' mapped' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (activeBinding) setSelectedBindingID(activeBinding.id);
          setOpen((current) => !current);
        }}
        title={`${label} MIDI mapping`}
      >
        {chip}
      </button>
      {open && activeBinding ? (
        <MidiMappingPopover binding={activeBinding} onClose={() => setOpen(false)} />
      ) : null}
    </span>
  );
}
