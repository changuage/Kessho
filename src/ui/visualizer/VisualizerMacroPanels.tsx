import React from 'react';
import { SliderPrimitive } from '../sliderSystem';
import type {
  VisualizerLayerMacroId,
  VisualizerLayerMacros,
  VisualizerPerformanceMacroId,
  VisualizerPerformanceMacros,
} from './visualizerControls';

const SCENE_LABELS: Record<VisualizerPerformanceMacroId, string> = {
  soft: 'Soft',
  pulse: 'Pulse',
  particles: 'Particles',
  glitch: 'Glitch',
  bright: 'Bright',
};

const SCENE_HERO: Record<VisualizerPerformanceMacroId, string> = {
  soft: '#a7d8ff',
  pulse: '#8fffd0',
  particles: '#ffdc6d',
  glitch: '#ff7adf',
  bright: '#fff47a',
};

const LAYER_LABELS: Record<VisualizerLayerMacroId, string> = {
  formation: 'Formation',
  weather: 'Weather',
  fragmentation: 'Fragmentation',
  symmetry: 'Symmetry',
  material: 'Material',
  age: 'Age',
  depth: 'Depth',
};

const LAYER_HERO: Record<VisualizerLayerMacroId, string> = {
  formation: '#d4a520',
  weather: '#5ea8a6',
  fragmentation: '#ff7adf',
  symmetry: '#a870e8',
  material: '#e8b44a',
  age: '#b0785a',
  depth: '#9ccfbd',
};

const LAYER_LEFT: Record<VisualizerLayerMacroId, string> = {
  formation: 'Minimal',
  weather: 'Nebula',
  fragmentation: 'VHS',
  symmetry: 'Fractal',
  material: 'Solid',
  age: 'Analog',
  depth: 'Deep',
};

const LAYER_RIGHT: Record<VisualizerLayerMacroId, string> = {
  formation: 'Expansive',
  weather: 'Aurora',
  fragmentation: 'Digital',
  symmetry: 'Glass',
  material: 'Cloud',
  age: 'Digital',
  depth: 'Luminous',
};

const SCENE_KEYS: VisualizerPerformanceMacroId[] = ['soft', 'pulse', 'particles', 'glitch', 'bright'];
const LAYER_KEYS: VisualizerLayerMacroId[] = ['formation', 'weather', 'fragmentation', 'symmetry', 'material', 'age', 'depth'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

function formatLayerMacro(key: VisualizerLayerMacroId, value: number): string {
  const percent = Math.round(clamp01(value) * 100);
  if (percent >= 48 && percent <= 52) {
    return key === 'weather' ? 'Clear' : key === 'fragmentation' || key === 'symmetry' || key === 'age' ? 'Off' : 'Balanced';
  }
  const amount = percent < 50 ? Math.round((50 - percent) * 2) : Math.round((percent - 50) * 2);
  return `${percent < 50 ? LAYER_LEFT[key] : LAYER_RIGHT[key]} ${amount}%`;
}

interface VisualizerMacroPanelsProps {
  sceneMacros: VisualizerPerformanceMacros;
  layerMacros: VisualizerLayerMacros;
  onSceneMacroChange: (key: VisualizerPerformanceMacroId, value: number) => void;
  onLayerMacroChange: (key: VisualizerLayerMacroId, value: number) => void;
}

export const VisualizerMacroPanels = React.memo(function VisualizerMacroPanels({
  sceneMacros,
  layerMacros,
  onSceneMacroChange,
  onLayerMacroChange,
}: VisualizerMacroPanelsProps) {
  return (
    <>
      <section className="visualizer-performance-panel" aria-label="Visualizer scene macros">
        <div className="visualizer-panel-header"><h3>Scene Macros</h3></div>
        <div className="visualizer-performance-macro-grid">
          {SCENE_KEYS.map((key) => (
            <div className="visualizer-performance-macro" key={key}>
              <SliderPrimitive
                label={SCENE_LABELS[key]}
                mode="single"
                value={sceneMacros[key] * 100}
                variant="full"
                density="compact"
                hero={SCENE_HERO[key]}
                formatValue={formatPercent}
                displayValue={formatPercent(sceneMacros[key] * 100)}
                onValueChange={(percent) => onSceneMacroChange(key, percent / 100)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="visualizer-performance-panel" aria-label="Visualizer layer macros">
        <div className="visualizer-panel-header"><h3>Layer Macros</h3><span>CPU neutral</span></div>
        <div className="visualizer-performance-macro-grid">
          {LAYER_KEYS.map((key) => (
            <div className="visualizer-performance-macro" key={key}>
              <SliderPrimitive
                label={LAYER_LABELS[key]}
                mode="single"
                value={layerMacros[key] * 100}
                variant="full"
                density="compact"
                hero={LAYER_HERO[key]}
                formatValue={formatPercent}
                displayValue={formatLayerMacro(key, layerMacros[key])}
                onValueChange={(percent) => onLayerMacroChange(key, percent / 100)}
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
});
