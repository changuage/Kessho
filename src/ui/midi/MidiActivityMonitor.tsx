import React from 'react';
import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiActivityMonitor() {
  const { activity } = useMidiLearn();
  const [kindFilter, setKindFilter] = React.useState('all');
  const filtered = kindFilter === 'all' ? activity : activity.filter((entry) => entry.message.kind === kindFilter);

  return (
    <section className="midi-panel midi-activity">
      <div className="midi-panel-head">
        <h3>Activity</h3>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value)}>
          <option value="all">All</option>
          <option value="controlChange">CC</option>
          <option value="noteOn">Note On</option>
          <option value="noteOff">Note Off</option>
          <option value="pitchBend">Pitch</option>
        </select>
      </div>
      {filtered.length === 0 ? <p>No MIDI activity.</p> : null}
      {filtered.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="midi-activity-row"
          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(entry.message))}
        >
          <span>{entry.label}</span>
          <small>{new Date(entry.receivedAt).toLocaleTimeString()}</small>
        </button>
      ))}
    </section>
  );
}
