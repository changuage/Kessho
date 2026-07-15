import React, { useEffect } from 'react';
import { recordSliderSystemCounter } from '../../diagnostics/sliderSystemInstrumentation';
import type { SliderMode } from '../state';
import { SliderPrimitive, type SliderPrimitiveRange } from '../sliderSystem';
import type { VisualizerControlDefinition } from './visualizerControlSchema';
import { formatVisualizerControlValue } from './visualizerControlDomains';
import type { VisualModRoute, VisualizerReactiveRange } from './visualizerModulation';
import { useVisualizerIndicator } from './visualizerIndicatorStore';

interface VisualizerControlRowProps {
  definition: VisualizerControlDefinition;
  value: number;
  mode: SliderMode;
  range?: VisualizerReactiveRange;
  drivers: VisualModRoute[];
  reactionDepth: number;
  formatValue(percent: number): string;
  onValueChange(value: number): void;
  onRangeChange?(range: VisualizerReactiveRange): void;
  onModeCycle(): void;
}

const GHOST_VISUAL_THRESHOLD = 0.005;

export const VisualizerControlRow = React.memo(function VisualizerControlRow({
  definition,
  value,
  mode,
  range,
  drivers,
  reactionDepth,
  formatValue,
  onValueChange,
  onRangeChange,
  onModeCycle,
}: VisualizerControlRowProps) {
  const indicator = useVisualizerIndicator(definition.key);
  const valuePercent = (value + 1) * 50;
  const sliderRange: SliderPrimitiveRange | undefined = range
    ? { min: (range.min + 1) * 50, max: (range.max + 1) * 50 }
    : undefined;
  const automationPercent = indicator.automationPosition === undefined
    ? valuePercent
    : indicator.automationPosition * 100;
  const modulatedPercent = indicator.modulatedPosition === undefined
    ? automationPercent
    : indicator.modulatedPosition * 100;
  const showGhost = mode !== 'single'
    && Math.abs(modulatedPercent - automationPercent) >= GHOST_VISUAL_THRESHOLD * 100;

  useEffect(() => {
    recordSliderSystemCounter('visualizerIndicatorRowCommits');
  });

  return (
    <div className="visualizer-slider-wrap">
      <SliderPrimitive
        label={definition.label}
        mode={mode}
        value={valuePercent}
        range={mode !== 'single' ? sliderRange : undefined}
        indicatorValue={mode !== 'single' ? automationPercent : undefined}
        ghostValue={showGhost ? modulatedPercent : undefined}
        variant="full"
        density="compact"
        hero="#9ccfbd"
        formatValue={formatValue}
        displayValue={formatVisualizerControlValue(
          definition.key,
          value,
          definition.left,
          definition.right,
        )}
        onValueChange={(nextPercent) => onValueChange((nextPercent / 50) - 1)}
        onRangeChange={mode !== 'single' && onRangeChange ? (nextRange) => {
          onRangeChange({
            min: (nextRange.min / 50) - 1,
            max: (nextRange.max / 50) - 1,
          });
        } : undefined}
        onModeCycle={onModeCycle}
      />
      {drivers.length > 0 && (
        <div className={`visualizer-mod-drivers${showGhost ? ' active' : ''}`}>
          {drivers.map((route) => {
            const effectivePct = Math.round(route.amount * reactionDepth * 100);
            return (
              <span
                key={route.label}
                className={`visualizer-mod-chip${route.eventDriven ? ' visualizer-mod-chip--event' : ' visualizer-mod-chip--engine'}`}
                title={`${route.label} — ${route.engines.join(', ')} → ${route.target} (${effectivePct}%)`}
              >
                <span className="visualizer-mod-chip-bar" style={{ width: `${effectivePct}%` }} />
                <span className="visualizer-mod-chip-text">
                  {route.eventDriven ? '▲ ' : '∼ '}{route.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
