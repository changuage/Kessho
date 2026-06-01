import { useMidiLearn } from '../midiLearn/useMidiLearn';

export function MidiConflictPanel() {
  const { conflicts } = useMidiLearn();
  return (
    <section className="midi-panel midi-conflicts">
      <div className="midi-panel-head">
        <h3>Conflicts</h3>
        <span>{conflicts.length}</span>
      </div>
      {conflicts.length === 0 ? <p>No routing conflicts.</p> : null}
      {conflicts.map((conflict) => (
        <div key={`${conflict.kind}:${conflict.bindingIDs.join('-')}`} className={`midi-conflict ${conflict.severity}`}>
          {conflict.message}
        </div>
      ))}
    </section>
  );
}
