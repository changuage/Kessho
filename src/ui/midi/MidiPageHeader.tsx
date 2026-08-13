import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiPageHeader() {
  const { learnState, toggleLearn, activity, inputs, globalButtonVisible, setGlobalButtonVisible } = useMidiLearn();
  const connected = inputs.filter((input) => input.isConnected);
  return (
    <header className="midi-page-header">
      <div>
        <h2>MIDI</h2>
        <span>{connected[0]?.name ?? 'No input selected'}</span>
      </div>
      <button type="button" className={learnState.mode === 'off' ? '' : 'active'} onClick={toggleLearn}>
        {learnState.mode === 'off' ? 'Learn Off' : 'Learn On'}
      </button>
      <button type="button" className={globalButtonVisible ? 'active' : ''}
        aria-pressed={globalButtonVisible} onClick={() => setGlobalButtonVisible(!globalButtonVisible)}>
        Floating Learn {globalButtonVisible ? 'On' : 'Off'}
      </button>
      <output>{activity[0]?.label ?? 'No activity'}</output>
    </header>
  );
}
