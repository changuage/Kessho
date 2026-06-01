import { conflictsForBinding } from '../../native/midi/midiRoutingConflicts';
import { formatMidiSourceLabel } from '../../native/midi/midiTypes';
import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiRoutingMatrix() {
  const {
    profile,
    conflicts,
    selectedBindingID,
    setSelectedBindingID,
    updateBinding,
    duplicateBinding,
    removeBinding,
    enableLearn,
  } = useMidiLearn();

  return (
    <section className="midi-panel midi-routing-matrix">
      <div className="midi-panel-head">
        <h3>Routing Matrix</h3>
        <span>{profile.bindings.length} mappings</span>
      </div>
      <div className="midi-matrix-table" role="table">
        <div className="midi-matrix-row header" role="row">
          <span>Source</span>
          <span>Target</span>
          <span>Range</span>
          <span>Curve</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {profile.bindings.length === 0 ? (
          <div className="midi-empty">Turn on MIDI Learn, move a control, then drag a slider.</div>
        ) : profile.bindings.map((binding) => {
          const bindingConflicts = conflictsForBinding(binding.id, conflicts);
          return (
            <div
              key={binding.id}
              className={`midi-matrix-row${selectedBindingID === binding.id ? ' selected' : ''}`}
              onClick={() => setSelectedBindingID(binding.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSelectedBindingID(binding.id);
              }}
              role="row"
              tabIndex={0}
            >
              <span>{formatMidiSourceLabel(binding.source)}</span>
              <span>{binding.target.label}</span>
              <span>{binding.transform.minimumValue} - {binding.transform.maximumValue}</span>
              <span>{binding.transform.curve}</span>
              <span>{binding.enabled ? (bindingConflicts.length ? 'Warning' : 'Active') : 'Disabled'}</span>
              <span className="midi-row-actions">
                <label onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={binding.enabled}
                    onChange={(event) => updateBinding(binding.id, (current) => ({ ...current, enabled: event.currentTarget.checked }))}
                  />
                </label>
                <button type="button" onClick={(event) => { event.stopPropagation(); void enableLearn(); }}>Relearn</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); duplicateBinding(binding.id); }}>Duplicate</button>
                <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); removeBinding(binding.id); }}>Delete</button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
