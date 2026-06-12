import React from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import { formatMidiNoteName } from './anchorWalkerMath';
import { OrbitSequencerCanvas } from './OrbitSequencerCanvas';
import type { OrbitDirection, OrbitNoteConfig, OrbitPitchMode, OrbitSequencerConfig, OrbitSpeedMode } from './orbitSequencerTypes';
import { useOrbitSequencer } from './useOrbitSequencer';
import './OrbitSequencer.css';

interface OrbitSequencerBodyProps {
  config: OrbitSequencerConfig;
  laneIndex: number;
  color: string;
  harmonyState?: HarmonyState | null;
  onChange: (config: OrbitSequencerConfig) => void;
}

function updateNumeric(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function noteLabel(note: OrbitNoteConfig): string {
  if (note.pitchMode === 'fixedMidi') return formatMidiNoteName(note.midiNote);
  if (note.pitchMode === 'harmonyDegree') return `D${note.harmonyDegree + 1}`;
  return `${formatMidiNoteName(note.pitchRangeMin)}-${formatMidiNoteName(note.pitchRangeMax)}`;
}

export function OrbitSequencerBody({
  config,
  laneIndex,
  color,
  harmonyState,
  onChange,
}: OrbitSequencerBodyProps) {
  const orbit = useOrbitSequencer({ config, onChange });
  const selected = orbit.selectedNote;
  const scaleLabel = harmonyState?.scaleFamily.name ?? 'Harmony';

  return (
    <div
      className="orbit-sequencer-root"
      style={{ '--lane-color': color } as React.CSSProperties}
      data-lane={laneIndex + 1}
    >
      <div className="orbit-sequencer-top">
        <span className="orbit-label">{TEXT_SYMBOLS.orbit} Orbit</span>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.spline.spinEnabled ? ' on' : ''}`}
          onClick={orbit.toggleSplineSpin}
        >
          {orbit.config.spline.spinEnabled ? 'SPIN: ON' : 'SPIN: OFF'}
        </button>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.spline.spinDirection === 'ccw' ? ' on' : ''}`}
          onClick={orbit.toggleSplineDirection}
        >
          {orbit.config.spline.spinDirection === 'ccw' ? 'DIR: CCW' : 'DIR: CW'}
        </button>
        <button type="button" className="orbit-action" onClick={orbit.straightenSpline}>STRT</button>
        <label className="orbit-label">
          Lines
          <span className="orbit-line-count">
            {([1, 2, 3, 4, 5] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={orbit.config.triggerLineCount === count ? 'active' : ''}
                onClick={() => orbit.setTriggerLineCount(count)}
              >
                {count}
              </button>
            ))}
          </span>
        </label>
        <label className="orbit-label">
          Scale
          <select
            className="orbit-select"
            value={orbit.config.snapSource}
            onChange={(event) => orbit.updateConfig({ snapSource: event.target.value as OrbitSequencerConfig['snapSource'] })}
          >
            <option value="harmonyEngine">Harmony</option>
            <option value="manualVoicing">Voicing</option>
            <option value="chordStep">Chord</option>
            <option value="customPitchClasses">Custom</option>
          </select>
        </label>
        <label className="orbit-label">
          BPM %
          <input
            className="orbit-input"
            type="number"
            min={1}
            max={800}
            value={Math.round(orbit.config.bpmPercent)}
            onChange={(event) => orbit.updateConfig({ bpmPercent: updateNumeric(event.target.value, orbit.config.bpmPercent) })}
          />
        </label>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.quantizeToHarmony ? ' on' : ''}`}
          onClick={() => orbit.updateConfig({ quantizeToHarmony: !orbit.config.quantizeToHarmony })}
        >
          Snap
        </button>
        <button type="button" className="orbit-action" onClick={orbit.randomizeOrbits}>Random</button>
        <button type="button" className="orbit-action" onClick={orbit.resetPhase}>Reset Phase</button>
      </div>

      <div className="orbit-main">
        <OrbitSequencerCanvas
          config={orbit.config}
          color={color}
          selectedNoteId={orbit.selectedNoteId}
          active
          onSelectNote={orbit.setSelectedNoteId}
          onAddNote={orbit.addNote}
          onMoveNote={orbit.moveNote}
          onUpdateSpline={orbit.updateSpline}
        />

        <div className="orbit-inspector">
          <div className="orbit-inspector-title">
            <span>Selected Node</span>
            <span>{selected ? noteLabel(selected) : scaleLabel}</span>
          </div>

          {selected ? (
            <>
              <div className="orbit-field-grid">
                <label className="orbit-field">
                  On
                  <select
                    value={selected.enabled ? 'on' : 'off'}
                    onChange={(event) => orbit.updateNote(selected.id, { enabled: event.target.value === 'on' })}
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label className="orbit-field">
                  Direction
                  <select
                    value={selected.direction}
                    onChange={(event) => orbit.updateNote(selected.id, { direction: event.target.value as OrbitDirection })}
                  >
                    <option value="cw">CW</option>
                    <option value="ccw">CCW</option>
                  </select>
                </label>
                <label className="orbit-field">
                  Speed
                  <select
                    value={selected.speedMode}
                    onChange={(event) => orbit.updateNote(selected.id, { speedMode: event.target.value as OrbitSpeedMode })}
                  >
                    <option value="syncDivisor">Divisor</option>
                    <option value="bpmPercent">BPM %</option>
                  </select>
                </label>
                <label className="orbit-field">
                  Value
                  <input
                    type="number"
                    min={selected.speedMode === 'syncDivisor' ? 0.125 : 1}
                    max={selected.speedMode === 'syncDivisor' ? 16 : 800}
                    step={selected.speedMode === 'syncDivisor' ? 0.125 : 1}
                    value={selected.speedValue}
                    onChange={(event) => orbit.updateNote(selected.id, { speedValue: updateNumeric(event.target.value, selected.speedValue) })}
                  />
                </label>
                <label className="orbit-field">
                  Pitch
                  <select
                    value={selected.pitchMode}
                    onChange={(event) => orbit.updateNote(selected.id, { pitchMode: event.target.value as OrbitPitchMode })}
                  >
                    <option value="harmonyDegree">Degree</option>
                    <option value="fixedMidi">Fixed</option>
                    <option value="rangeSnap">Range</option>
                  </select>
                </label>
                <label className="orbit-field">
                  Note
                  <input
                    type="number"
                    min={0}
                    max={127}
                    value={selected.pitchMode === 'harmonyDegree' ? selected.harmonyDegree + 1 : Math.round(selected.midiNote)}
                    onChange={(event) => {
                      const value = updateNumeric(event.target.value, selected.pitchMode === 'harmonyDegree' ? selected.harmonyDegree + 1 : selected.midiNote);
                      orbit.updateNote(selected.id, selected.pitchMode === 'harmonyDegree'
                        ? { harmonyDegree: Math.max(0, Math.min(6, Math.round(value - 1))) }
                        : { midiNote: Math.max(0, Math.min(127, Math.round(value))) });
                    }}
                  />
                </label>
                <label className="orbit-field">
                  Velocity
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selected.velocity}
                    onChange={(event) => orbit.updateNote(selected.id, { velocity: updateNumeric(event.target.value, selected.velocity) })}
                  />
                </label>
                <label className="orbit-field">
                  Gate
                  <input
                    type="number"
                    min={0.05}
                    max={8}
                    step={0.05}
                    value={selected.gateBeats}
                    onChange={(event) => orbit.updateNote(selected.id, { gateBeats: updateNumeric(event.target.value, selected.gateBeats) })}
                  />
                </label>
                <label className="orbit-field">
                  Prob
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selected.probability}
                    onChange={(event) => orbit.updateNote(selected.id, { probability: updateNumeric(event.target.value, selected.probability) })}
                  />
                </label>
                <label className="orbit-field">
                  Radius
                  <input
                    type="range"
                    min={0.06}
                    max={1}
                    step={0.01}
                    value={selected.radiusNorm}
                    onChange={(event) => orbit.updateNote(selected.id, { radiusNorm: updateNumeric(event.target.value, selected.radiusNorm) })}
                  />
                </label>
              </div>
              <div className="orbit-actions">
                <button type="button" className="orbit-action primary" onClick={orbit.duplicateSelected}>Duplicate</button>
                <button type="button" className="orbit-action" onClick={orbit.deleteSelected}>Delete</button>
              </div>
            </>
          ) : (
            <div className="orbit-field">No node</div>
          )}
        </div>
      </div>

      <div className="orbit-node-list">
        {orbit.config.notes.map((note, index) => (
          <button
            key={note.id}
            type="button"
            className={[
              'orbit-node-chip',
              note.id === orbit.selectedNoteId ? 'active' : '',
              note.enabled ? '' : 'off',
            ].filter(Boolean).join(' ')}
            onClick={() => orbit.setSelectedNoteId(note.id)}
          >
            {index + 1} {noteLabel(note)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default OrbitSequencerBody;
