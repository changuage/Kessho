import React from 'react';
import {
  createEmptyMidiRoutingProfileV2,
  exportMidiRoutingProfile,
  importMidiRoutingProfile,
} from '../../native/midi/midiRoutingProfile';
import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiProfilePanel() {
  const { profile, setProfile } = useMidiLearn();
  const [importText, setImportText] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);

  return (
    <section className="midi-panel midi-profiles">
      <h3>Profiles</h3>
      <label>
        <span>Name</span>
        <input
          value={profile.name}
          onChange={(event) => setProfile({ ...profile, name: event.currentTarget.value })}
        />
      </label>
      <div className="midi-profile-actions">
        <button type="button" onClick={() => void navigator.clipboard?.writeText(exportMidiRoutingProfile(profile))}>Export JSON</button>
        <button type="button" onClick={() => setProfile({ ...profile, profileID: `${profile.profileID}-copy`, name: `${profile.name} Copy` })}>Duplicate</button>
        <button type="button" className="danger" onClick={() => setProfile(createEmptyMidiRoutingProfileV2())}>Reset All</button>
      </div>
      <textarea value={importText} onChange={(event) => setImportText(event.currentTarget.value)} placeholder="Paste MIDI routing profile JSON" />
      <button type="button" onClick={() => {
        const result = importMidiRoutingProfile(importText);
        if (result.ok) {
          setProfile(result.profile);
          setMessage('Imported profile.');
        } else {
          setMessage(result.error);
        }
      }}>
        Import JSON
      </button>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
