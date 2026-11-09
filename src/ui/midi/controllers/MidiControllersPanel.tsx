import React from 'react';
import { MIDI_CONTROLLER_MANIFESTS } from '../../../native/midi/controllers/controllerManifests';
import { matchMidiControllerManifests } from '../../../native/midi/controllers/controllerRegistry';
import type { MidiControllerManifest } from '../../../native/midi/controllers/controllerSurfaceTypes';
import type { KesshoMidiEndpointInfo } from '../../../native/midi/midiTypes';
import { useMidiLearn } from '../../midiLearn/useMidiLearn';
import { Lpd8WirelessSetupDialog } from './Lpd8WirelessSetupDialog';
import './midiControllers.css';

function capabilitySummary(manifest: MidiControllerManifest): string {
  const mappable = manifest.controls.filter((control) => control.policy === 'mappable' || control.policy === 'hybrid').length;
  const performance = manifest.controls.filter((control) => control.policy === 'performance').length;
  const local = manifest.controls.filter((control) => control.policy === 'device-local').length;
  return [
    `${mappable} mappable/hybrid`,
    performance > 0 ? `${performance} performance` : null,
    local > 0 ? `${local} local` : null,
  ].filter(Boolean).join(' · ');
}

function bestManifest(input: KesshoMidiEndpointInfo): MidiControllerManifest | null {
  return matchMidiControllerManifests(input)[0]?.manifest ?? null;
}

export function MidiControllersPanel() {
  const { inputs } = useMidiLearn();
  const [lpd8Open, setLpd8Open] = React.useState(false);
  const connectedInputs = inputs.filter((input) => input.isConnected);

  return (
    <section className="midi-panel midi-controller-panel">
      <div className="midi-panel-head">
        <div>
          <h3>Controller surfaces</h3>
          <span>Reusable device profiles, alternate layers, modifiers, and macros.</span>
        </div>
      </div>

      <div className="midi-controller-grid">
        {MIDI_CONTROLLER_MANIFESTS.map((manifest) => {
          const matchedInput = connectedInputs.find((input) => bestManifest(input)?.id === manifest.id) ?? null;
          const isLpd8 = manifest.id === 'akai-lpd8-wireless';
          return (
            <article className="midi-controller-card" key={manifest.id}>
              <header>
                <div>
                  <small>{manifest.vendor}</small>
                  <strong>{manifest.model}</strong>
                </div>
                <span className={matchedInput ? 'connected' : ''}>{matchedInput ? 'Detected' : 'Profile'}</span>
              </header>
              <p>{capabilitySummary(manifest)}</p>
              <p className="midi-controller-device">
                {matchedInput
                  ? `${matchedInput.displayName ?? matchedInput.name}${matchedInput.transport ? ` · ${matchedInput.transport}` : ''}`
                  : 'No matching connected input'}
              </p>
              <div className="midi-controller-feature-row">
                <span>Base mappings</span>
                <span>Shift layers</span>
                <span>Button chords</span>
              </div>
              {isLpd8 ? (
                <button type="button" className="active" onClick={() => setLpd8Open(true)}>
                  Open visual editor
                </button>
              ) : (
                <div className="midi-controller-ready-note">
                  Manifest registered · uses shared mapping/macro runtime
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="midi-controller-architecture-note">
        <strong>Logical modifiers</strong>
        <span>
          A controller does not need a hardware button named Shift. Any observable MIDI button/pad can become a Kessho modifier and activate another mapping layer. Two or more controls can also form a chord macro that dispatches a separate Kessho action.
        </span>
      </div>

      <Lpd8WirelessSetupDialog open={lpd8Open} onClose={() => setLpd8Open(false)} />
    </section>
  );
}

export default MidiControllersPanel;
