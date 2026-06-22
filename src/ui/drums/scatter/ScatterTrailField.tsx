import React from 'react';
import { resolveTriggerClip } from '../../sequencer/triggerClip';
import { DRUM_PITCH_OFFSET_LIMIT } from '../../sequencer/drumPitchSequencer';
import type { GeneratedDrumPhrase } from './scatterTypes';

interface ScatterTrailFieldProps {
  phrase: GeneratedDrumPhrase | null;
  color: string;
  activeStep?: number | null;
  activeRatchet?: number | null;
}

type StepView = {
  index: number;
  enabled: boolean;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  pitch: number;
  expression: number;
  probability: number;
  ratchet: number;
  morph: number;
  distance: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPitch(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function stepViewsForPhrase(phrase: GeneratedDrumPhrase): StepView[] {
  const pattern = resolveTriggerClip(phrase.triggerClip);
  const steps = Math.max(1, pattern.length);

  return pattern.map((enabled, index) => {
    const t = steps <= 1 ? 0 : index / (steps - 1);
    const pitch = clamp(phrase.pitch[index] ?? 0, -DRUM_PITCH_OFFSET_LIMIT, DRUM_PITCH_OFFSET_LIMIT);
    const expression = clamp(phrase.expression[index] ?? 0.78, 0, 1);
    const probability = clamp(phrase.probability[index] ?? 1, 0, 1);

    return {
      index,
      enabled,
      x: 6 + t * 88,
      y: clamp(52 - (pitch / DRUM_PITCH_OFFSET_LIMIT) * 40, 14, 82),
      radius: enabled ? 9 + expression * 9 : 5,
      opacity: enabled ? Math.max(0.28, probability) : 0.14,
      pitch,
      expression,
      probability,
      ratchet: Math.max(1, Math.min(8, Math.round(phrase.ratchet[index] ?? 1))),
      morph: clamp(phrase.morph[index] ?? 0.5, 0, 1),
      distance: clamp(phrase.distance[index] ?? 0.5, 0, 1),
    };
  });
}

const ScatterTrailField: React.FC<ScatterTrailFieldProps> = ({
  phrase,
  color,
  activeStep = null,
  activeRatchet = null,
}) => {
  if (!phrase) return <div className="scatter-trail empty" />;

  const steps = stepViewsForPhrase(phrase);
  const enabledSteps = steps.filter((step) => step.enabled);
  const connectorSegments = enabledSteps.slice(1).map((step, index) => ({
    from: enabledSteps[index],
    to: step,
  })).filter((segment): segment is { from: StepView; to: StepView } => Boolean(segment.from));
  const activeView = activeStep !== null ? steps[activeStep] : null;
  const swingPercent = Math.round((phrase.swing ?? 0) * 100);

  return (
    <div
      className="scatter-trail"
      style={{ '--engine-color': color } as React.CSSProperties}
      aria-label={phrase.label}
    >
      <div className="scatter-trail__meta">
        <span>Time</span>
        <span>{steps.length} steps</span>
        <span>{phrase.summary.hits} hits</span>
        <span>{phrase.clockDiv}</span>
        <span>{swingPercent}%</span>
      </div>

      <div className="scatter-trail__plot">
        <svg className="scatter-trail__connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {steps.map((step) => (
            <line
              key={`grid-${step.index}`}
              className={`scatter-trail__grid-line${activeStep === step.index ? ' active' : ''}`}
              x1={step.x}
              x2={step.x}
              y1="8"
              y2="92"
            />
          ))}
          <line className="scatter-trail__zero-line" x1="4" x2="96" y1="52" y2="52" />
          {connectorSegments.map((segment) => (
            <line
              key={`${segment.from.index}-${segment.to.index}`}
              className="scatter-trail__connector"
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {activeView && (
            <line
              className="scatter-trail__playhead"
              x1={activeView.x}
              x2={activeView.x}
              y1="5"
              y2="95"
            />
          )}
        </svg>
        <div className="scatter-trail__dot-map" aria-hidden="true">
          {steps.map((step) => (
            <span
              key={step.index}
              className={[
                'scatter-trail__dot',
                step.enabled ? 'on' : 'off',
                activeStep === step.index ? 'active' : '',
              ].filter(Boolean).join(' ')}
              style={{
                left: `${step.x}%`,
                top: `${step.y}%`,
                opacity: step.opacity,
                '--dot-size': `${step.radius}px`,
              } as React.CSSProperties}
            >
              {step.enabled && step.ratchet > 1 && (
                <span className="scatter-trail__ratchets">
                  {Array.from({ length: step.ratchet }, (_, ratchetIndex) => (
                    <i
                      key={ratchetIndex}
                      className={activeStep === step.index && activeRatchet === ratchetIndex ? 'active' : ''}
                    />
                  ))}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div
        className="scatter-trail__step-grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(44px, 1fr))` }}
      >
        {steps.map((step) => (
          <div
            key={step.index}
            className={[
              'scatter-trail__step',
              step.enabled ? 'on' : 'off',
              activeStep === step.index ? 'active' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="scatter-trail__step-index">{step.index + 1}</span>
            <span className="scatter-trail__step-pitch">{step.enabled ? formatPitch(step.pitch) : '·'}</span>
            <span className="scatter-trail__step-events">
              {step.enabled && step.ratchet > 1 && <b>{step.ratchet}</b>}
            </span>
            {step.enabled ? (
              <span className="scatter-trail__step-bars" aria-hidden="true">
                <span className="scatter-trail__bar-row">
                  <span>E</span>
                  <i style={{ transform: `scaleX(${step.expression})` }} />
                </span>
                <span className="scatter-trail__bar-row">
                  <span>M</span>
                  <i style={{ transform: `scaleX(${step.morph})` }} />
                </span>
                <span className="scatter-trail__bar-row">
                  <span>D</span>
                  <i style={{ transform: `scaleX(${step.distance})` }} />
                </span>
              </span>
            ) : (
              <span className="scatter-trail__step-bars empty" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScatterTrailField;
