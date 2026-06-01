import { formatMidiSourceLabel } from '../../native/midi/midiTypes';
import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiRoutingGraph() {
  const { profile } = useMidiLearn();
  const byEndpoint = new Map<string, typeof profile.bindings>();
  for (const binding of profile.bindings) {
    const endpoint = binding.source.endpointName ?? 'Any MIDI Input';
    byEndpoint.set(endpoint, [...(byEndpoint.get(endpoint) ?? []), binding]);
  }

  return (
    <section className="midi-panel midi-routing-graph">
      <div className="midi-panel-head">
        <h3>Graph</h3>
      </div>
      {byEndpoint.size === 0 ? <p>No graph yet.</p> : null}
      {[...byEndpoint.entries()].map(([endpoint, bindings]) => (
        <div key={endpoint} className="midi-graph-device">
          <strong>{endpoint}</strong>
          {bindings.map((binding) => (
            <div key={binding.id} className="midi-graph-edge">
              <span>{formatMidiSourceLabel(binding.source)}</span>
              <span aria-hidden="true">-&gt;</span>
              <span>{binding.target.label}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
