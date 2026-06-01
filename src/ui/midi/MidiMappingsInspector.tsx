import { MIDI_MAPPABLE_PARAMS } from '../../native/midi/midiMappableParams';
import type { KesshoMidiValueCurve } from '../../native/midi/midiTypes';
import { formatMidiSourceLabel } from '../../native/midi/midiTypes';
import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiMappingsInspector() {
  const { profile, selectedBindingID, updateBinding, removeBinding, duplicateBinding, enableLearn } = useMidiLearn();
  const binding = profile.bindings.find((item) => item.id === selectedBindingID) ?? null;

  if (!binding) {
    return (
      <section className="midi-panel midi-inspector">
        <h3>Inspector</h3>
        <p>Select a routing, or turn on MIDI Learn and touch a control.</p>
      </section>
    );
  }

  const param = MIDI_MAPPABLE_PARAMS.find((item) => item.key === binding.target.key);
  const step = param?.step ?? 0.01;

  return (
    <section className="midi-panel midi-inspector">
      <h3>{formatMidiSourceLabel(binding.source)} -&gt; {binding.target.label}</h3>
      <label>
        <span>Target</span>
        <select
          value={binding.target.key}
          onChange={(event) => {
            const target = MIDI_MAPPABLE_PARAMS.find((item) => item.key === event.currentTarget.value);
            if (!target) return;
            updateBinding(binding.id, (current) => ({
              ...current,
              target: { key: target.key, label: target.label, group: target.group },
              transform: {
                ...current.transform,
                minimumValue: target.min,
                maximumValue: target.max,
                curve: target.defaultCurve,
              },
            }));
          }}
        >
          {MIDI_MAPPABLE_PARAMS.map((target) => (
            <option key={target.key} value={target.key}>{target.group} / {target.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Min</span>
        <input type="number" step={step} value={binding.transform.minimumValue} onChange={(event) => {
          const next = Number(event.currentTarget.value);
          updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, minimumValue: Number.isFinite(next) ? next : current.transform.minimumValue },
          }));
        }} />
      </label>
      <label>
        <span>Max</span>
        <input type="number" step={step} value={binding.transform.maximumValue} onChange={(event) => {
          const next = Number(event.currentTarget.value);
          updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, maximumValue: Number.isFinite(next) ? next : current.transform.maximumValue },
          }));
        }} />
      </label>
      <label>
        <span>Curve</span>
        <select value={binding.transform.curve} onChange={(event) => updateBinding(binding.id, (current) => ({
          ...current,
          transform: { ...current.transform, curve: event.currentTarget.value as KesshoMidiValueCurve },
        }))}>
          {['linear', 'logarithmic', 'exponential', 'stepped'].map((curve) => (
            <option key={curve} value={curve}>{curve}</option>
          ))}
        </select>
      </label>
      <label className="midi-inline-control">
        <input type="checkbox" checked={binding.transform.invert} onChange={(event) => updateBinding(binding.id, (current) => ({
          ...current,
          transform: { ...current.transform, invert: event.currentTarget.checked },
        }))} />
        <span>Invert</span>
      </label>
      <label>
        <span>Smoothing</span>
        <input type="number" min={0} max={250} step={1} value={binding.transform.smoothingMs} onChange={(event) => {
          const next = Number(event.currentTarget.value);
          updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, smoothingMs: Number.isFinite(next) ? Math.max(0, next) : current.transform.smoothingMs },
          }));
        }} />
      </label>
      <div className="midi-inspector-actions">
        <button type="button" onClick={() => void enableLearn()}>Relearn Source</button>
        <button type="button" onClick={() => duplicateBinding(binding.id)}>Duplicate</button>
        <button type="button" className="danger" onClick={() => removeBinding(binding.id)}>Delete</button>
      </div>
    </section>
  );
}
