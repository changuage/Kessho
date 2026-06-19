import React from 'react';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import type { GeneratedDrumPhrase } from './scatterTypes';

interface ScatterTrailFieldProps {
  phrase: GeneratedDrumPhrase | null;
  color: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const ScatterTrailField: React.FC<ScatterTrailFieldProps> = ({ phrase, color }) => {
  if (!phrase) return <div className="scatter-trail empty" />;

  const pattern = resolveTriggerClip(phrase.triggerClip);
  const steps = Math.max(1, pattern.length);
  const points = pattern.map((enabled, index) => {
    const t = steps <= 1 ? 0 : index / (steps - 1);
    const pitch = clamp(phrase.pitch[index] ?? 0, -12, 12);
    const expr = clamp(phrase.expression[index] ?? 0.75, 0, 1);
    const distance = clamp(phrase.distance[index] ?? 0.5, 0, 1);
    const x = 8 + t * 84;
    const y = clamp(50 - pitch * 2.2 + Math.sin(t * Math.PI * 2) * 8, 8, 92);
    return {
      enabled,
      x,
      y,
      r: enabled ? 2.8 + expr * 3.2 : 1.4,
      opacity: enabled ? Math.max(0.22, phrase.probability[index] ?? 1) : 0.08,
      blur: distance * 1.5,
      ratchet: phrase.ratchet[index] ?? 1,
      reverse: phrase.reverse[index] ?? 0,
      slice: phrase.slice[index] ?? 0,
    };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <svg
      className="scatter-trail"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ '--engine-color': color } as React.CSSProperties}
      aria-hidden="true"
    >
      <path className="scatter-trail__line" d={path} />
      {points.map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y})`}>
          <circle
            className={[
              'scatter-trail__bead',
              point.enabled ? 'on' : 'off',
              point.ratchet > 1 ? 'ratchet' : '',
              point.slice > 0 ? 'slice' : '',
              point.reverse > 0 ? 'reverse' : '',
            ].filter(Boolean).join(' ')}
            r={point.r}
            style={{ opacity: point.opacity, filter: `blur(${point.blur}px)` }}
          />
          {point.ratchet > 1 && <circle className="scatter-trail__split" cx={point.r + 2} r="1.2" />}
        </g>
      ))}
    </svg>
  );
};

export default ScatterTrailField;
