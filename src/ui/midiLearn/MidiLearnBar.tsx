import { useMidiLearn } from './useMidiLearn';

export function MidiLearnBar() {
  const {
    learnState,
    inputs,
    bridgeAvailable,
    cancelCapturedSource,
    disableLearn,
    openMidiPage,
  } = useMidiLearn();

  if (learnState.mode === 'off') return null;

  const connectedCount = inputs.filter((input) => input.isConnected).length;
  const copy = (() => {
    if (!bridgeAvailable || connectedCount === 0) return 'No MIDI input connected';
    if (learnState.mode === 'captured') {
      const cc = learnState.message.data1 ?? '?';
      const ch = typeof learnState.message.channel === 'number' ? learnState.message.channel + 1 : '?';
      const from = learnState.message.endpointName ? ` from ${learnState.message.endpointName}` : '';
      return `Captured CC ${cc} Ch ${ch}${from} · Drag any slider to assign`;
    }
    if (learnState.mode === 'assigned') return 'Mapped · Move another controller or drag another slider';
    if (learnState.mode === 'error') return learnState.message;
    return 'Move a controller · Drag a slider to map';
  })();

  return (
    <div className="midi-learn-bar" role="status">
      <span className="midi-learn-bar-title">MIDI LEARN ON</span>
      <span className="midi-learn-bar-copy">{copy}</span>
      <div className="midi-learn-bar-actions">
        {learnState.mode === 'captured' ? (
          <button type="button" onClick={cancelCapturedSource}>Cancel CC</button>
        ) : null}
        <button type="button" onClick={openMidiPage}>Open MIDI Page</button>
        <button type="button" onClick={disableLearn}>Done</button>
      </div>
    </div>
  );
}
