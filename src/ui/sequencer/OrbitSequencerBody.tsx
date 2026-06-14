import React, { useState } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import { formatMidiNoteName } from './anchorWalkerMath';
import { OrbitSequencerCanvas } from './OrbitSequencerCanvas';
import type { OrbitDirection, OrbitNoteConfig, OrbitPitchLayout, OrbitPitchMode, OrbitRuntimeVisualState, OrbitSequencerConfig, OrbitSpeedMode, OrbitTriggerLineCount } from './orbitSequencerTypes';
import {
  ORBIT_BLOOM_NOTE_OPTIONS,
  ORBIT_LOOP_BEAT_OPTIONS,
  ORBIT_QUANTIZED_OFFSET_OPTIONS,
  orbitHashUnit,
  loopBeatsFromBpmPercent,
  useOrbitSequencer,
} from './useOrbitSequencer';
import { TAU, wrapRadians } from './orbitSequencerMath';
import './OrbitSequencer.css';

interface OrbitSequencerBodyProps {
  config: OrbitSequencerConfig;
  laneIndex: number;
  color: string;
  harmonyState?: HarmonyState | null;
  isRunning?: boolean;
  transportBpm?: number;
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

type OrbitOffsetDraftKey = 'evenOffset' | 'freeOffset';
type OrbitOffsetDrafts = Partial<Record<OrbitOffsetDraftKey, number>>;

function draftValue(drafts: OrbitOffsetDrafts, key: OrbitOffsetDraftKey, fallback: number): number {
  const value = drafts[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function offsetPreviewConfig(config: OrbitSequencerConfig, drafts: OrbitOffsetDrafts): OrbitSequencerConfig {
  const evenOffset = draftValue(drafts, 'evenOffset', config.evenOffset);
  const freeOffset = draftValue(drafts, 'freeOffset', config.freeOffset);
  const evenDelta = evenOffset - config.evenOffset;
  const freeDelta = freeOffset - config.freeOffset;
  const hasPhasePreview = Math.abs(evenDelta) > 1e-9 || Math.abs(freeDelta) > 1e-9;
  if (!hasPhasePreview) return config;
  return {
    ...config,
    evenOffset,
    freeOffset,
    notes: config.notes.map((note, index) => {
      const jitter = orbitHashUnit(config.seed + index * 97 + 41) - 0.5;
      const phaseDelta = ((index % 2 === 1 ? evenDelta : 0) + freeDelta * jitter) * TAU;
      return {
        ...note,
        phase: wrapRadians(note.phase + phaseDelta),
      };
    }),
  };
}

export function OrbitSequencerBody({
  config,
  laneIndex,
  color,
  harmonyState,
  isRunning = false,
  transportBpm = 120,
  runtimeVisualState = null,
  captureSlot,
  onChange,
}: OrbitSequencerBodyProps) {
  const orbit = useOrbitSequencer({ config, onChange });
  const selected = orbit.selectedNote;
  const scaleLabel = harmonyState?.scaleFamily.name ?? 'Harmony';
  const loopBeats = loopBeatsFromBpmPercent(orbit.config.bpmPercent);
  const [offsetDrafts, setOffsetDrafts] = useState<OrbitOffsetDrafts>({});
  const [speedOffsetEditing, setSpeedOffsetEditing] = useState(false);
  const previewConfig = offsetPreviewConfig(orbit.config, offsetDrafts);
  const evenOffsetValue = draftValue(offsetDrafts, 'evenOffset', orbit.config.evenOffset);
  const freeOffsetValue = draftValue(offsetDrafts, 'freeOffset', orbit.config.freeOffset);
  const bloomNoteOptions = ORBIT_BLOOM_NOTE_OPTIONS.includes(orbit.config.notes.length as (typeof ORBIT_BLOOM_NOTE_OPTIONS)[number])
    ? ORBIT_BLOOM_NOTE_OPTIONS
    : [...ORBIT_BLOOM_NOTE_OPTIONS, orbit.config.notes.length].sort((left, right) => left - right);
  const setOffsetDraft = (key: OrbitOffsetDraftKey, value: number) => {
    setOffsetDrafts((current) => ({ ...current, [key]: value }));
  };
  const commitOffsetDraft = (key: OrbitOffsetDraftKey, commit: (value: number) => void) => {
    const draft = offsetDrafts[key];
    if (typeof draft !== 'number' || !Number.isFinite(draft)) return;
    setOffsetDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    commit(draft);
  };

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
          Bars
          <span className="orbit-line-count">
            {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={orbit.config.triggerLineCount === count ? 'active' : ''}
                onClick={() => orbit.setTriggerLineCount(count as OrbitTriggerLineCount)}
              >
                {count}
              </button>
            ))}
          </span>
        </label>
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
            value={loopBeats}
            onChange={(event) => orbit.setLoopBeats(updateNumeric(event.target.value, loopBeats))}
          >
            {ORBIT_LOOP_BEAT_OPTIONS.map((beats) => (
              <option key={beats} value={beats}>{beats} beat{beats === 1 ? '' : 's'}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.quantizeToHarmony ? ' on' : ''}`}
          onClick={() => orbit.updateConfig({ quantizeToHarmony: !orbit.config.quantizeToHarmony })}
        >
          Pitch Snap
        </button>
        <button type="button" className="orbit-action" onClick={orbit.randomizeOrbits}>Random</button>
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
        <button type="button" className="orbit-action" onClick={orbit.rebloomNotes}>Bloom</button>
        <button type="button" className="orbit-action" onClick={orbit.invertDirections}>Invert All</button>
        <label className="orbit-field compact">
          Speed Offset
          <input
            type="range"
            min={-0.9}
            max={1}
            step={0.01}
            value={orbit.config.speedOffset}
            onFocus={() => setSpeedOffsetEditing(true)}
            onPointerDown={() => setSpeedOffsetEditing(true)}
            onPointerUp={() => setSpeedOffsetEditing(false)}
            onPointerCancel={() => setSpeedOffsetEditing(false)}
            onKeyDown={() => setSpeedOffsetEditing(true)}
            onKeyUp={() => setSpeedOffsetEditing(false)}
            onBlur={() => setSpeedOffsetEditing(false)}
            onChange={(event) => {
              setSpeedOffsetEditing(true);
              orbit.setSpeedOffset(updateNumeric(event.target.value, orbit.config.speedOffset));
            }}
          />
        </label>
        <label className="orbit-field compact">
          Even Offset
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={evenOffsetValue}
            onChange={(event) => setOffsetDraft('evenOffset', updateNumeric(event.target.value, evenOffsetValue))}
            onPointerUp={() => commitOffsetDraft('evenOffset', orbit.setEvenOffset)}
            onPointerCancel={() => commitOffsetDraft('evenOffset', orbit.setEvenOffset)}
            onKeyUp={() => commitOffsetDraft('evenOffset', orbit.setEvenOffset)}
            onBlur={() => commitOffsetDraft('evenOffset', orbit.setEvenOffset)}
          />
        </label>
        <label className="orbit-field compact">
          Free Offset
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={freeOffsetValue}
            onChange={(event) => setOffsetDraft('freeOffset', updateNumeric(event.target.value, freeOffsetValue))}
            onPointerUp={() => commitOffsetDraft('freeOffset', orbit.setFreeOffset)}
            onPointerCancel={() => commitOffsetDraft('freeOffset', orbit.setFreeOffset)}
            onKeyUp={() => commitOffsetDraft('freeOffset', orbit.setFreeOffset)}
            onBlur={() => commitOffsetDraft('freeOffset', orbit.setFreeOffset)}
          />
        </label>
        <label className="orbit-field compact">
          Grid
          <select
            value={orbit.config.quantizedOffset}
            onChange={(event) => orbit.setQuantizedOffset(updateNumeric(event.target.value, orbit.config.quantizedOffset))}
          >
            {ORBIT_QUANTIZED_OFFSET_OPTIONS.map((division) => (
              <option key={division} value={division}>1/{division}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`orbit-toggle${orbit.config.dragQuantize ? ' on' : ''}`}
          onClick={orbit.toggleDragQuantize}
        >
          Quantize
        </button>
      </div>

      <div className="orbit-main">
        <OrbitSequencerCanvas
          config={previewConfig}
          color={color}
          selectedNoteId={orbit.selectedNoteId}
          active={isRunning}
          transportBpm={transportBpm}
          runtimeVisualState={runtimeVisualState}
          playbackEditActive={speedOffsetEditing}
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
