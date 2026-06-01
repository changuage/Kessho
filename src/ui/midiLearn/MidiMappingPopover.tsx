import { MIDI_MAPPABLE_PARAMS } from '../../native/midi/midiMappableParams';
import type { KesshoMidiBindingV2, MidiPickupMode } from '../../native/midi/midiRoutingProfile';
import type { KesshoMidiValueCurve } from '../../native/midi/midiTypes';
import { formatMidiSourceLabel } from '../../native/midi/midiTypes';
import { useMidiLearn } from './useMidiLearn';

const CURVES: readonly KesshoMidiValueCurve[] = ['linear', 'logarithmic', 'exponential', 'stepped'];
const PICKUP_MODES: readonly MidiPickupMode[] = ['soft-takeover', 'none'];

export function MidiMappingPopover({
  binding,
  onClose,
}: {
  binding: KesshoMidiBindingV2;
  onClose: () => void;
}) {
  const { updateBinding, removeBinding, enableLearn } = useMidiLearn();
  const param = MIDI_MAPPABLE_PARAMS.find((item) => item.key === binding.target.key);
  const min = param?.min ?? 0;
  const max = param?.max ?? 1;

  return (
    <div className="midi-mapping-popover" role="dialog" aria-label={`${binding.target.label} MIDI mapping`}>
      <div className="midi-mapping-popover-head">
        <strong>{binding.target.label}</strong>
        <button type="button" onClick={onClose} aria-label="Close MIDI mapping">x</button>
      </div>
      <label>
        <span>Source</span>
        <output>{formatMidiSourceLabel(binding.source)}</output>
      </label>
      <label>
        <span>Range Min</span>
        <input
          type="number"
          min={min}
          max={max}
          step={param?.step ?? 0.01}
          value={binding.transform.minimumValue}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            updateBinding(binding.id, (current) => ({
              ...current,
              transform: { ...current.transform, minimumValue: Number.isFinite(next) ? next : min },
            }));
          }}
        />
      </label>
      <label>
        <span>Range Max</span>
        <input
          type="number"
          min={min}
          max={max}
          step={param?.step ?? 0.01}
          value={binding.transform.maximumValue}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            updateBinding(binding.id, (current) => ({
              ...current,
              transform: { ...current.transform, maximumValue: Number.isFinite(next) ? next : max },
            }));
          }}
        />
      </label>
      <label>
        <span>Curve</span>
        <select
          value={binding.transform.curve}
          onChange={(event) => updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, curve: event.currentTarget.value as KesshoMidiValueCurve },
          }))}
        >
          {CURVES.map((curve) => <option key={curve} value={curve}>{curve}</option>)}
        </select>
      </label>
      <label>
        <span>Pickup</span>
        <select
          value={binding.transform.pickupMode}
          onChange={(event) => updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, pickupMode: event.currentTarget.value as MidiPickupMode },
          }))}
        >
          {PICKUP_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>
      <label className="midi-mapping-inline">
        <input
          type="checkbox"
          checked={binding.transform.invert}
          onChange={(event) => updateBinding(binding.id, (current) => ({
            ...current,
            transform: { ...current.transform, invert: event.currentTarget.checked },
          }))}
        />
        <span>Invert</span>
      </label>
      <label className="midi-mapping-inline">
        <input
          type="checkbox"
          checked={binding.enabled}
          onChange={(event) => updateBinding(binding.id, (current) => ({
            ...current,
            enabled: event.currentTarget.checked,
          }))}
        />
        <span>Enabled</span>
      </label>
      <div className="midi-mapping-actions">
        <button type="button" onClick={() => void enableLearn()}>Relearn</button>
        <button type="button" className="danger" onClick={() => removeBinding(binding.id)}>Delete</button>
      </div>
    </div>
  );
}
