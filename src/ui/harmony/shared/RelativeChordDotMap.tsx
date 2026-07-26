import React, { useMemo } from 'react';

export interface RelativeChordDotMapProps {
  notes: readonly number[];
  axis?: readonly number[];
  label?: string;
  className?: string;
}

export const RelativeChordDotMap: React.FC<RelativeChordDotMapProps> = ({ notes, axis, label = 'Relative voicing', className }) => {
  const values = useMemo(() => {
    const source = axis?.length ? axis : notes.length ? Array.from({ length: Math.max(13, Math.max(...notes) - Math.min(...notes) + 1) }, (_, i) => Math.min(...notes) + i) : Array.from({ length: 13 }, (_, i) => 60 + i);
    const min = source[0] ?? 60;
    const max = source[source.length - 1] ?? min + 12;
    return { source, min, range: Math.max(1, max - min) };
  }, [axis, notes]);
  const noteSet = useMemo(() => new Set(notes), [notes]);
  const summary = notes.length ? `${label}: ${notes.join(', ')} MIDI; axis ${values.min}–${values.min + values.range}` : `${label}: empty; axis ${values.min}–${values.min + values.range}`;
  return <div className={`harmony-relative-dot-map ${className ?? ''}`} role="img" aria-label={summary}>
    {values.source.map((midi) => <span key={midi} className={`harmony-relative-dot${noteSet.has(midi) ? ' on' : ''}`} style={{ left: `${((midi - values.min) / values.range) * 100}%` }} title={`${midi}`} />)}
  </div>;
};

export default RelativeChordDotMap;
