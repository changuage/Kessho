import React, { useMemo } from 'react';
import {
  formatMidiNoteName,
  pitchClass,
} from './anchorWalkerMath';
import type { AnchorWalkerBoundaryEvent, WalkerVisualizerRange } from './anchorWalkerTypes';

export interface AnchorWalkerKeyboardVisualizerProps {
  anchorMidi: number | null;
  cursorMidi: number | null;
  previousCursorMidi: number | null;
  snapPitchClasses: readonly number[];
  layerOutputMidis: readonly number[];
  linkedOutputMidis?: readonly { slotIndex: number; midi: number; velocity?: number }[];
  outputRangeMin: number;
  outputRangeMax: number;
  range: WalkerVisualizerRange;
  direction: 'up' | 'down' | 'none';
  boundaryEvent?: AnchorWalkerBoundaryEvent;
  color: string;
  onAnchorSelect?: (midi: number) => void;
  onCustomSnapToggle?: (pitchClass: number) => void;
}

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

interface VisibleKeyboardKey {
  midi: number;
  whiteIndex: number;
  isBlack: boolean;
}

type RelativeOutputDirection = 'above' | 'below' | 'root';

interface RelativeOutputIndicator {
  direction: RelativeOutputDirection;
  label: string;
  midi: number;
  title: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function visibleKeys(anchorMidi: number | null, minMidi: number, maxMidi: number, range: WalkerVisualizerRange): number[] {
  const count = range === 'twoOctaves' ? 24 : 12;
  const anchor = clamp(Math.round(anchorMidi ?? 60), 0, 127);
  const octaveStart = Math.floor(anchor / 12) * 12;
  const centeredStart = range === 'twoOctaves' ? octaveStart - 6 : octaveStart;
  const start = clamp(centeredStart, 0, Math.max(0, 127 - count + 1));
  const boundedStart = clamp(start, Math.floor(Math.min(minMidi, maxMidi)), Math.max(Math.ceil(Math.max(minMidi, maxMidi)) - count + 1, 0));
  return Array.from({ length: count }, (_, index) => clamp(boundedStart + index, 0, 127));
}

function overviewKeys(minMidi: number, maxMidi: number): number[] {
  const low = clamp(Math.floor(Math.min(minMidi, maxMidi)), 0, 127);
  const high = clamp(Math.ceil(Math.max(minMidi, maxMidi)), low, 127);
  const octaveStart = Math.floor(low / 12) * 12;
  const octaveEnd = clamp(Math.ceil(high / 12) * 12, octaveStart, 127);
  return Array.from({ length: octaveEnd - octaveStart + 1 }, (_, index) => octaveStart + index);
}

function nearestVisiblePitchClassMidi(midi: number, visibleMidis: readonly number[]): number | null {
  const pc = pitchClass(midi);
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const visibleMidi of visibleMidis) {
    if (pitchClass(visibleMidi) !== pc) continue;
    const distance = Math.abs(visibleMidi - midi);
    if (distance < bestDistance) {
      best = visibleMidi;
      bestDistance = distance;
    }
  }
  return best;
}

function relativeOutputDirection(midi: number, rootMidi: number): RelativeOutputDirection {
  if (midi > rootMidi) return 'above';
  if (midi < rootMidi) return 'below';
  return 'root';
}

function relativeOutputLabel(direction: RelativeOutputDirection): string {
  if (direction === 'above') return '\u2191\uFE0E';
  if (direction === 'below') return '\u2193\uFE0E';
  return '\u2022\uFE0E';
}

export function AnchorWalkerKeyboardVisualizer({
  anchorMidi,
  cursorMidi,
  previousCursorMidi,
  snapPitchClasses,
  layerOutputMidis,
  linkedOutputMidis = [],
  outputRangeMin,
  outputRangeMax,
  range,
  direction,
  boundaryEvent = 'none',
  color,
  onAnchorSelect,
  onCustomSnapToggle,
}: AnchorWalkerKeyboardVisualizerProps) {
  const snapSet = useMemo(() => new Set(snapPitchClasses.map(pitchClass)), [snapPitchClasses]);
  const layerSet = useMemo(() => new Set(layerOutputMidis.map((midi) => Math.round(midi))), [layerOutputMidis]);
  const linkedByMidi = useMemo(() => {
    const map = new Map<number, Array<{ slotIndex: number; velocity?: number }>>();
    for (const output of linkedOutputMidis) {
      const midi = Math.round(output.midi);
      const list = map.get(midi) ?? [];
      list.push({ slotIndex: output.slotIndex, velocity: output.velocity });
      map.set(midi, list);
    }
    return map;
  }, [linkedOutputMidis]);
  const keys = useMemo(
    () => visibleKeys(anchorMidi, outputRangeMin, outputRangeMax, range),
    [anchorMidi, outputRangeMax, outputRangeMin, range],
  );
  const microKeys = useMemo(
    () => overviewKeys(outputRangeMin, outputRangeMax),
    [outputRangeMax, outputRangeMin],
  );
  const keyRows = useMemo(() => {
    const natural: VisibleKeyboardKey[] = [];
    const accidental: VisibleKeyboardKey[] = [];
    for (const midi of keys) {
      const isBlack = BLACK_KEY_PITCH_CLASSES.has(pitchClass(midi));
      if (isBlack) {
        accidental.push({
          midi,
          whiteIndex: Math.max(0, natural.length - 1),
          isBlack,
        });
      } else {
        natural.push({
          midi,
          whiteIndex: natural.length,
          isBlack,
        });
      }
    }
    return {
      natural,
      accidental,
      whiteKeyCount: Math.max(1, natural.length),
    };
  }, [keys]);
  const relativeOutputsByMidi = useMemo(() => {
    const map = new Map<number, RelativeOutputIndicator[]>();
    const rootMidi = Math.round(anchorMidi ?? 60);
    const pushOutput = (midiValue: number, sourceLabel: string) => {
      if (!Number.isFinite(midiValue)) return;
      const midi = Math.round(midiValue);
      const targetMidi = nearestVisiblePitchClassMidi(midi, keys);
      if (targetMidi == null) return;
      const direction = relativeOutputDirection(midi, rootMidi);
      const list = map.get(targetMidi) ?? [];
      if (list.some((item) => item.midi === midi && item.direction === direction)) return;
      list.push({
        direction,
        label: relativeOutputLabel(direction),
        midi,
        title: `${sourceLabel} ${formatMidiNoteName(midi)} ${direction === 'root' ? 'at' : direction} root`,
      });
      map.set(targetMidi, list);
    };
    if (cursorMidi != null) {
      pushOutput(cursorMidi, 'Cursor');
    }
    layerOutputMidis.forEach((midi, index) => {
      pushOutput(midi, `Layer ${index + 1}`);
    });
    linkedOutputMidis.forEach((output) => {
      pushOutput(output.midi, `Seq ${output.slotIndex + 1}`);
    });
    return map;
  }, [anchorMidi, cursorMidi, keys, layerOutputMidis, linkedOutputMidis]);
  const directionSymbol = direction === 'up' ? '\u2191\uFE0E' : direction === 'down' ? '\u2193\uFE0E' : '\u2022\uFE0E';
  const visibleStart = keys[0] ?? null;
  const visibleEnd = keys[keys.length - 1] ?? null;
  const renderKey = (key: VisibleKeyboardKey) => {
    const midi = key.midi;
    const pc = pitchClass(midi);
    const isAnchor = anchorMidi != null && Math.round(anchorMidi) === midi;
    const isCursor = cursorMidi != null && Math.round(cursorMidi) === midi;
    const isPrevious = previousCursorMidi != null && Math.round(previousCursorMidi) === midi && !isCursor;
    const linkedOutputs = linkedByMidi.get(midi) ?? [];
    const isLayered = layerSet.has(midi);
    const isSnap = snapSet.has(pc);
    const relativeOutputs = relativeOutputsByMidi.get(midi) ?? [];
    return (
      <button
        key={midi}
        type="button"
        className={[
          'anchor-walker-keyboard-key',
          key.isBlack ? 'accidental black' : 'natural white',
          isSnap ? 'snap' : 'outside',
          isAnchor ? 'anchor' : '',
          isCursor ? 'cursor' : '',
          isPrevious ? 'previous' : '',
          isLayered ? 'layered' : '',
          relativeOutputs.length > 0 ? 'relative-output' : '',
        ].filter(Boolean).join(' ')}
        style={key.isBlack ? { gridColumn: `${key.whiteIndex + 1} / span 1` } : undefined}
        title={formatMidiNoteName(midi)}
        onClick={(event) => {
          if (event.shiftKey) {
            onCustomSnapToggle?.(pc);
            return;
          }
          onAnchorSelect?.(midi);
        }}
      >
        <span className="anchor-walker-keyboard-key-note">{formatMidiNoteName(midi)}</span>
        {isAnchor ? <span className="anchor-walker-keyboard-anchor-marker" /> : null}
        {isCursor ? <span className="anchor-walker-keyboard-cursor-marker" /> : null}
        {isPrevious ? <span className="anchor-walker-keyboard-previous-marker" /> : null}
        {isLayered ? <span className="anchor-walker-keyboard-output-marker" /> : null}
        {relativeOutputs.length > 0 ? (
          <span className="anchor-walker-keyboard-relative-stack">
            {relativeOutputs.slice(0, 4).map((output) => (
              <span
                key={`${output.midi}-${output.direction}`}
                className={`anchor-walker-keyboard-relative-marker ${output.direction}`}
                title={output.title}
              >
                {output.label}
              </span>
            ))}
          </span>
        ) : null}
        {linkedOutputs.length > 0 ? (
          <span className="anchor-walker-keyboard-linked-marker">
            {linkedOutputs.slice(0, 4).map((output) => output.slotIndex + 1).join('')}
          </span>
        ) : null}
      </button>
    );
  };
  const renderMicroKey = (midi: number) => {
    const pc = pitchClass(midi);
    const isBlack = BLACK_KEY_PITCH_CLASSES.has(pc);
    const isAnchor = anchorMidi != null && Math.round(anchorMidi) === midi;
    const isCursor = cursorMidi != null && Math.round(cursorMidi) === midi;
    const isLayered = layerSet.has(midi);
    const isVisible = visibleStart != null && visibleEnd != null && midi >= visibleStart && midi <= visibleEnd;
    const isRangeEdge = midi === Math.round(outputRangeMin) || midi === Math.round(outputRangeMax);
    const isOctave = pc === 0;
    return (
      <button
        key={midi}
        type="button"
        className={[
          'anchor-walker-micro-key',
          isBlack ? 'black' : 'white',
          snapSet.has(pc) ? 'snap' : '',
          isVisible ? 'visible-window' : '',
          isAnchor ? 'anchor' : '',
          isCursor ? 'cursor' : '',
          isLayered ? 'layered' : '',
          isRangeEdge ? 'range-edge' : '',
          isOctave ? 'octave' : '',
        ].filter(Boolean).join(' ')}
        title={formatMidiNoteName(midi)}
        onClick={() => onAnchorSelect?.(midi)}
      >
        {isOctave ? <span>{formatMidiNoteName(midi)}</span> : null}
      </button>
    );
  };

  return (
    <div
      className={`anchor-walker-keyboard range-${range}`}
      style={{ '--lane-color': color } as React.CSSProperties}
    >
      <div className="anchor-walker-keyboard-meta">
        <span>{anchorMidi == null ? 'Anchor' : formatMidiNoteName(anchorMidi)}</span>
        <span className="anchor-walker-direction-trail">{directionSymbol}</span>
        <span>{cursorMidi == null ? 'Cursor' : formatMidiNoteName(cursorMidi)}</span>
      </div>
      <div
        className="anchor-walker-keyboard-grid"
        style={{ '--white-key-count': keyRows.whiteKeyCount } as React.CSSProperties}
      >
        <div className="anchor-walker-keyboard-natural-row">
          {keyRows.natural.map(renderKey)}
        </div>
        <div className="anchor-walker-keyboard-accidental-row">
          {keyRows.accidental.map(renderKey)}
        </div>
      </div>
      <div className="anchor-walker-micro-keyboard" aria-label="Walker octave overview">
        <div
          className="anchor-walker-micro-keyboard-strip"
          style={{ '--micro-key-count': microKeys.length } as React.CSSProperties}
        >
          {microKeys.map(renderMicroKey)}
        </div>
      </div>
      {boundaryEvent !== 'none' ? (
        <div className="anchor-walker-boundary-badge">{boundaryEvent.replace(/([A-Z])/g, ' $1')}</div>
      ) : null}
    </div>
  );
}

export default AnchorWalkerKeyboardVisualizer;
