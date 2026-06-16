import React from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import { formatMidiNoteName } from './anchorWalkerMath';
import { OrbitRange } from './OrbitRange';
import { OrbitSequencerCanvas } from './OrbitSequencerCanvas';
import { orbitClockedLoopBeats } from './orbitSequencerMath';
import type { OrbitConstellationMode, OrbitDirection, OrbitNoteConfig, OrbitPitchLayout, OrbitPitchMode, OrbitRuntimeVisualState, OrbitSequencerConfig, OrbitSpeedMode, OrbitTriggerLineCount } from './orbitSequencerTypes';
import {
  ORBIT_BLOOM_NOTE_OPTIONS,
  ORBIT_LOOP_BEAT_OPTIONS,
  ORBIT_QUANTIZED_OFFSET_OPTIONS,
  loopBeatsToBpmPercent,
  loopBeatsFromBpmPercent,
  useOrbitSequencer,
} from './useOrbitSequencer';
import './OrbitSequencer.css';

const ORBIT_CLOCK_RATE_OPTIONS = [25, 50, 100, 200, 400] as const;
type OrbitInvertTarget = 'all' | 'even' | 'odd';

interface OrbitSequencerBodyProps {
  config: OrbitSequencerConfig;
  laneIndex: number;
  color: string;
  harmonyState?: HarmonyState | null;
  isRunning?: boolean;
  transportBpm?: number;
  clockDivision?: unknown;
  stepCount?: number;
  tempoMultiplier?: number;
  runtimeVisualState?: OrbitRuntimeVisualState | null;
  captureSlot?: React.ReactNode;
  onChange: (config: OrbitSequencerConfig) => void;
}

function updateNumeric(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function noteLabel(note: OrbitNoteConfig): string {
  if (note.pitchMode === 'harmonyBloom') return `Bloom ${Math.round(note.radiusNorm * 100)}%`;
  if (note.pitchMode === 'fixedMidi') return formatMidiNoteName(note.midiNote);
  if (note.pitchMode === 'harmonyDegree') return `D${note.harmonyDegree + 1}`;
  return `${formatMidiNoteName(note.pitchRangeMin)}-${formatMidiNoteName(note.pitchRangeMax)}`;
}

function formatLoopBeats(beats: number): string {
  if (!Number.isFinite(beats)) return '4';
  const rounded = Math.round(beats);
  if (Math.abs(beats - rounded) < 0.001) return String(rounded);
  return beats.toFixed(2).replace(/\.?0+$/, '');
}

function formatClockRateLabel(percent: number): string {
  if (percent === 100) return 'Clock';
  if (percent === 25) return '1/4 Clock';
  if (percent === 50) return '1/2 Clock';
  if (percent < 100) return `${formatLoopBeats(percent / 100)} Clock`;
  return `${formatLoopBeats(percent / 100)}x Clock`;
}

export function OrbitSequencerBody({
  config,
  laneIndex,
  color,
  harmonyState,
  isRunning = false,
  transportBpm = 120,
  clockDivision = 8,
  stepCount = 16,
  tempoMultiplier = 1,
  runtimeVisualState = null,
  captureSlot,
  onChange,
}: OrbitSequencerBodyProps) {
  const orbit = useOrbitSequencer({ config, onChange });
  const selected = orbit.selectedNote;
  const [invertTarget, setInvertTarget] = React.useState<OrbitInvertTarget>('all');
  const scaleLabel = harmonyState?.scaleFamily.name ?? 'Harmony';
  const freeLoopBeats = loopBeatsFromBpmPercent(orbit.config.bpmPercent);
  const clockRatePercent = Math.max(1, Math.min(800, Math.round(orbit.config.bpmPercent)));
  const clockRateOptions = ORBIT_CLOCK_RATE_OPTIONS.includes(clockRatePercent as (typeof ORBIT_CLOCK_RATE_OPTIONS)[number])
    ? ORBIT_CLOCK_RATE_OPTIONS
    : [...ORBIT_CLOCK_RATE_OPTIONS, clockRatePercent].sort((left, right) => left - right);
  const loopValue = orbit.config.clockMode === 'transport' ? `clock:${clockRatePercent}` : `free:${freeLoopBeats}`;
  const bloomNoteOptions = ORBIT_BLOOM_NOTE_OPTIONS.includes(orbit.config.notes.length as (typeof ORBIT_BLOOM_NOTE_OPTIONS)[number])
    ? ORBIT_BLOOM_NOTE_OPTIONS
    : [...ORBIT_BLOOM_NOTE_OPTIONS, orbit.config.notes.length].sort((left, right) => left - right);
  const quantizedOffsetOptions = ORBIT_QUANTIZED_OFFSET_OPTIONS
    .filter((division) => division >= orbit.config.notes.length || division === orbit.config.quantizedOffset);
  const snapMode = orbit.config.dragQuantize ? 'grid' : 'off';
  const applyInvert = () => {
    if (invertTarget === 'even') {
      orbit.invertEvenDirections();
      return;
    }
    if (invertTarget === 'odd') {
      orbit.invertOddDirections();
      return;
    }
    orbit.invertDirections();
  };

  React.useEffect(() => {
    if (config.globalOffset !== 0) orbit.updateConfig({ globalOffset: 0 });
  }, [config.globalOffset, orbit.updateConfig]);

  return (
    <div
      className="orbit-sequencer-root"
      style={{ '--lane-color': color } as React.CSSProperties}
      data-lane={laneIndex + 1}
    >
      <div className="orbit-sequencer-top">
        <span className="orbit-label">{TEXT_SYMBOLS.orbit} Orbit</span>
        {captureSlot ? (
          <div className="orbit-capture-row">
            {captureSlot}
          </div>
        ) : null}
        <label className="orbit-label">
          Layout
          <select
            className="orbit-select"
            value={orbit.config.pitchLayout}
            onChange={(event) => orbit.setPitchLayout(event.target.value as OrbitPitchLayout)}
          >
            <option value="harmonyBloom">Bloom</option>
            <option value="freeOrbit">Free</option>
          </select>
        </label>
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
          Source
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
          Loop
          <select
            className="orbit-select"
            value={loopValue}
            onChange={(event) => {
              if (event.target.value.startsWith('clock:')) {
                const percent = updateNumeric(event.target.value.slice('clock:'.length), 100);
                orbit.updateConfig({
                  clockMode: 'transport',
                  bpmPercent: Math.max(1, Math.min(800, Math.round(percent))),
                });
                return;
              }
              const loopBeats = updateNumeric(event.target.value.slice('free:'.length), freeLoopBeats);
              orbit.updateConfig({
                clockMode: 'freeBpmPercent',
                bpmPercent: loopBeatsToBpmPercent(loopBeats),
              });
            }}
          >
            <optgroup label="Clock">
              {clockRateOptions.map((percent) => {
                const clockedLoopBeats = orbitClockedLoopBeats(stepCount, clockDivision, tempoMultiplier, percent / 100);
                return (
                  <option key={percent} value={`clock:${percent}`}>
                    {formatClockRateLabel(percent)} ({formatLoopBeats(clockedLoopBeats)} beats)
                  </option>
                );
              })}
            </optgroup>
            <optgroup label="Free">
              {ORBIT_LOOP_BEAT_OPTIONS.map((beats) => (
                <option key={beats} value={`free:${beats}`}>{beats} beat{beats === 1 ? '' : 's'}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="orbit-bars-control">
          <span>Bars</span>
          <strong>{orbit.config.triggerLineCount}</strong>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={orbit.config.triggerLineCount}
            onChange={(event) => orbit.setTriggerLineCount(updateNumeric(event.target.value, orbit.config.triggerLineCount) as OrbitTriggerLineCount)}
          />
        </label>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.quantizeToHarmony ? ' on' : ''}`}
          onClick={() => orbit.updateConfig({ quantizeToHarmony: !orbit.config.quantizeToHarmony })}
        >
          Pitch Snap
        </button>
        <button type="button" className="orbit-action" onClick={orbit.resetPhase}>Reset Phase</button>
      </div>

      <div className="orbit-bloom-tools">
        <label className="orbit-field compact">
          Nodes
          <select
            value={orbit.config.notes.length}
            onChange={(event) => orbit.setBloomNoteCount(updateNumeric(event.target.value, orbit.config.notes.length))}
          >
            {bloomNoteOptions.map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>
        <label className="orbit-field compact">
          Shape
          <select
            value={orbit.config.constellationMode}
            onChange={(event) => orbit.setConstellationMode(event.target.value as OrbitConstellationMode)}
          >
            <option value="auto">Curated</option>
            <option value="golden">Golden Spiral</option>
            <option value="fibonacci">Shell</option>
            <option value="pythagorean">Lattice</option>
            <option value="harmonicRose">Rose</option>
            <option value="euclidean">Star</option>
          </select>
        </label>
        <button type="button" className="orbit-action primary" onClick={() => orbit.constellateNotes()}>Constellate</button>
        <label className="orbit-field compact">
          Invert
          <select
            value={invertTarget}
            onChange={(event) => setInvertTarget(event.target.value as OrbitInvertTarget)}
          >
            <option value="all">All</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </select>
        </label>
        <button type="button" className="orbit-action" onClick={applyInvert}>Invert</button>
        <label className="orbit-field compact">
          Snap
          <select
            value={snapMode}
            onChange={(event) => {
              const enabled = event.target.value === 'grid';
              orbit.updateConfig({ dragQuantize: enabled });
            }}
          >
            <option value="off">Off</option>
            <option value="grid">Grid</option>
          </select>
        </label>
        <label className="orbit-field compact">
          Quantized Offset
          <select
            value={orbit.config.quantizedOffset}
            onChange={(event) => orbit.spaceNotesByQuantizedOffset(updateNumeric(event.target.value, orbit.config.quantizedOffset))}
          >
            {quantizedOffsetOptions.map((division) => (
              <option key={division} value={division}>1/{division}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="orbit-action"
          disabled={!orbit.config.dragQuantize}
          onClick={orbit.quantizeNotesToGrid}
        >
          Snap Nodes
        </button>
        <OrbitRange
          label="Speed Offset"
          min={-1}
          max={1}
          step={0.01}
          value={orbit.config.speedOffset}
          onChange={orbit.setSpeedOffset}
        />
        <OrbitRange
          label="Even Offset"
          min={-1}
          max={1}
          step={0.01}
          value={orbit.config.evenOffset}
          onChange={orbit.setEvenOffset}
        />
        <OrbitRange
          label="Free Offset"
          min={-1}
          max={1}
          step={0.01}
          value={orbit.config.freeOffset}
          onChange={orbit.setFreeOffset}
        />
      </div>

      <div className="orbit-main">
        <OrbitSequencerCanvas
          config={orbit.config}
          color={color}
          selectedNoteId={orbit.selectedNoteId}
          active={isRunning}
          transportBpm={transportBpm}
          clockDivision={clockDivision}
          stepCount={stepCount}
          tempoMultiplier={tempoMultiplier}
          runtimeVisualState={runtimeVisualState}
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
                    <option value="harmonyBloom">Bloom</option>
                    <option value="fixedMidi">Fixed</option>
                    <option value="rangeSnap">Range</option>
                  </select>
                </label>
                <label className="orbit-field">
                  {selected.pitchMode === 'harmonyBloom' ? 'Scale Pos' : selected.pitchMode === 'harmonyDegree' ? 'Degree' : 'Note'}
                  <input
                    type="number"
                    min={0}
                    max={selected.pitchMode === 'harmonyBloom' ? 100 : 127}
                    value={selected.pitchMode === 'harmonyBloom' ? Math.round(selected.radiusNorm * 100) : selected.pitchMode === 'harmonyDegree' ? selected.harmonyDegree + 1 : Math.round(selected.midiNote)}
                    onChange={(event) => {
                      const fallback = selected.pitchMode === 'harmonyBloom'
                        ? selected.radiusNorm * 100
                        : selected.pitchMode === 'harmonyDegree'
                          ? selected.harmonyDegree + 1
                          : selected.midiNote;
                      const value = updateNumeric(event.target.value, fallback);
                      orbit.updateNote(selected.id, selected.pitchMode === 'harmonyBloom'
                        ? { radiusNorm: Math.max(0.06, Math.min(1, value / 100)) }
                        : selected.pitchMode === 'harmonyDegree'
                          ? { harmonyDegree: Math.max(0, Math.min(6, Math.round(value - 1))) }
                          : { midiNote: Math.max(0, Math.min(127, Math.round(value))) });
                    }}
                  />
                </label>
                <div className="orbit-field">
                  <OrbitRange
                    label="Velocity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selected.velocity}
                    onChange={(value) => orbit.updateNote(selected.id, { velocity: value })}
                  />
                </div>
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
                <div className="orbit-field">
                  <OrbitRange
                    label="Prob"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selected.probability}
                    onChange={(value) => orbit.updateNote(selected.id, { probability: value })}
                  />
                </div>
                <div className="orbit-field">
                  <OrbitRange
                    label="Radius"
                    min={0.06}
                    max={1}
                    step={0.01}
                    value={selected.radiusNorm}
                    onChange={(value) => orbit.updateNote(selected.id, { radiusNorm: value })}
                  />
                </div>
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
