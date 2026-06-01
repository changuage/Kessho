import React from 'react';
import { useMidiLearn } from './useMidiLearn';

export function MidiLearnButton() {
  const { learnState, toggleLearn } = useMidiLearn();

  const label = React.useMemo(() => {
    switch (learnState.mode) {
      case 'listening':
        return 'LEARNING... MOVE A CONTROL';
      case 'captured': {
        const number = learnState.message.data1 ?? '';
        const channel = typeof learnState.message.channel === 'number' ? learnState.message.channel + 1 : '';
        return `CC ${number} CH ${channel} -> DRAG A SLIDER`;
      }
      case 'assigned':
        return 'MAPPED';
      case 'error':
        return 'MIDI NOT AVAILABLE';
      default:
        return 'MIDI LEARN';
    }
  }, [learnState]);

  return (
    <button
      type="button"
      className={`midi-learn-global-button midi-learn-global-button--${learnState.mode}`}
      onClick={toggleLearn}
      aria-pressed={learnState.mode !== 'off'}
      title="MIDI Learn"
    >
      {label}
    </button>
  );
}
