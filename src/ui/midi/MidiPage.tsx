import React from 'react';
import { MidiActivityMonitor } from './MidiActivityMonitor';
import { MidiConflictPanel } from './MidiConflictPanel';
import { MidiInputStrip } from './MidiInputStrip';
import { MidiMappingsInspector } from './MidiMappingsInspector';
import { MidiPageHeader } from './MidiPageHeader';
import { MidiProfilePanel } from './MidiProfilePanel';
import { MidiRoutingGraph } from './MidiRoutingGraph';
import { MidiRoutingMatrix } from './MidiRoutingMatrix';
import { MidiControllersPanel } from './controllers/MidiControllersPanel';
import './midi.css';

type MidiTab = 'routings' | 'controllers' | 'inputs' | 'profiles' | 'activity';

export function MidiPage() {
  const [tab, setTab] = React.useState<MidiTab>('routings');
  return (
    <section className="midi-page">
      <MidiPageHeader />
      <nav className="midi-tabs" aria-label="MIDI page tabs">
        {(['routings', 'controllers', 'inputs', 'profiles', 'activity'] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'routings' ? (
        <div className="midi-three-zone">
          <div className="midi-left">
            <MidiInputStrip />
            <MidiActivityMonitor />
          </div>
          <div className="midi-center">
            <MidiRoutingMatrix />
            <MidiRoutingGraph />
          </div>
          <div className="midi-right">
            <MidiMappingsInspector />
            <MidiConflictPanel />
          </div>
        </div>
      ) : null}
      {tab === 'controllers' ? <MidiControllersPanel /> : null}
      {tab === 'inputs' ? <MidiInputStrip /> : null}
      {tab === 'profiles' ? <MidiProfilePanel /> : null}
      {tab === 'activity' ? <MidiActivityMonitor /> : null}
    </section>
  );
}

export default MidiPage;
