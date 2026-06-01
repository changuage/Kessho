import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiInputStrip() {
  const { inputs, bridgeAvailable, refreshInputs, toggleInput } = useMidiLearn();
  return (
    <section className="midi-panel midi-input-strip">
      <div className="midi-panel-head">
        <h3>Inputs</h3>
        <button type="button" onClick={() => void refreshInputs()}>Refresh</button>
      </div>
      {!bridgeAvailable ? <p>Native MIDI bridge unavailable in this shell.</p> : null}
      {inputs.length === 0 ? <p>No MIDI inputs detected.</p> : null}
      {inputs.map((input) => (
        <label key={input.uniqueID} className="midi-input-row-v2">
          <input
            type="checkbox"
            checked={input.isConnected}
            onChange={(event) => void toggleInput(input, event.currentTarget.checked)}
          />
          <span>
            <strong>{input.name}</strong>
            <small>{input.manufacturer ?? `Endpoint ${input.uniqueID}`}</small>
          </span>
        </label>
      ))}
    </section>
  );
}
