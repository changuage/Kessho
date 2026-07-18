import { useRef } from 'react';
import type { SliderMode } from '../state';
import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';
import { createVisualBuses, type VisualBuses, type VisualizerNumericControlKey, type VisualizerReactiveRanges } from './visualizerModulation';

export interface CompiledVisualizerAutomation {
  key: VisualizerNumericControlKey;
  mode: Exclude<SliderMode, 'single'>;
  range: { min: number; max: number };
}

export function compileVisualizerAutomations(
  modes: Record<string, SliderMode>,
  ranges: VisualizerReactiveRanges,
): CompiledVisualizerAutomation[] {
  const compiled: CompiledVisualizerAutomation[] = [];
  for (const [key, mode] of Object.entries(modes)) {
    if (mode !== 'walk' && mode !== 'sampleHold') continue;
    const range = ranges[key as VisualizerNumericControlKey];
    if (range) compiled.push({ key: key as VisualizerNumericControlKey, mode, range });
  }
  return compiled;
}

type VisualizerFrameScratch = {
  automatedControls: ReactiveVisualizerControls;
  modulatedControls: ReactiveVisualizerControls;
  buses: VisualBuses;
};

export function useVisualizerFrameScratch(defaults: ReactiveVisualizerControls): VisualizerFrameScratch {
  return useRef<VisualizerFrameScratch>({
    automatedControls: { ...defaults, layerOrder: [...defaults.layerOrder] },
    modulatedControls: { ...defaults, layerOrder: [...defaults.layerOrder] },
    buses: createVisualBuses(),
  }).current;
}
