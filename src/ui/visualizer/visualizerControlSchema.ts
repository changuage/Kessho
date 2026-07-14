import type {
  ReactiveVisualizerControls,
  VisualizerFocus,
} from './ReactiveVisualizerRenderer';
import type { VisualizerNumericControlKey } from './visualizerModulation';

export interface VisualizerControlDefinition {
  key: VisualizerNumericControlKey;
  label: string;
  left: string;
  right: string;
}

export interface VisualizerControlGroup {
  label: string;
  collapsed?: boolean;
  controls: VisualizerControlDefinition[];
}

export const DEFAULT_VISUALIZER_CONTROLS: ReactiveVisualizerControls = {
  style: 0,
  kaleidoscope: 0,
  triggerResponse: 0,
  ripples: 0,
  motion: 0,
  color: 0,
  diffusion: 0,
  background: 0,
  frameRate: 0,
  shape: 0,
  organic: 0,
  edges: 0,
  backdropFade: 0,
  noiseTurbulence: 0,
  noiseFlow: 0,
  noiseSpeed: 0,
  noiseColor: 0,
  pulseSync: 0,
  shapeSize: 0,
  shapeSpread: 0,
  shapeCount: 0,
  noiseSize: 0,
  noiseDensity: 0,
  bloomSize: 0,
  kaleidoSize: 0,
  glitchIntensity: 0,
  glitchScale: 0,
  glitchChromatic: 0,
  glitchRate: 0,
  charAmount: 0,
  charStyle: 0,
  charGrain: 0,
  charDrift: 0,
  kaleidoSegments: 0,
  kaleidoSpin: 0,
  kaleidoType: 0,
  kaleidoReflections: 0,
  kaleidoPattern: 0,
  brightness: 0,
  vibrance: 0,
  saturation: 0,
  impactFlash: 0,
  visualLimiter: 0,
  pointCloudAmount: 0,
  pointCloudSize: 0,
  pointCloudDensity: 0,
  pointCloudScatter: 0,
  pointCloudColor: 0,
  layerOrder: [0, 1, 2, 3, 4],
  focus: 'stringWaves',
};

export const VISUALIZER_FOCUS_OPTIONS: Array<{ value: VisualizerFocus; label: string }> = [
  { value: 'stringWaves', label: 'String Waves' },
  { value: 'all', label: 'All' },
  { value: 'synth', label: 'Synth' },
  { value: 'earth', label: 'Earth' },
  { value: 'granular', label: 'Granular' },
  { value: 'drums', label: 'Drums' },
  { value: 'fx', label: 'FX' },
];

export const VISUALIZER_CONTROL_GROUPS: VisualizerControlGroup[] = [
  {
    label: 'Shape',
    controls: [
      { key: 'shape', label: 'Geometry', left: 'Angular', right: 'Round' },
      { key: 'shapeCount', label: 'Count', left: 'Few', right: 'Many' },
      { key: 'shapeSize', label: 'Size', left: 'Small', right: 'Large' },
      { key: 'shapeSpread', label: 'Spread', left: 'Cluster', right: 'Wide' },
      { key: 'organic', label: 'Organic', left: 'Uniform', right: 'Irregular' },
      { key: 'edges', label: 'Edges', left: 'Amoeba', right: 'Gradient' },
      { key: 'diffusion', label: 'Opacity', left: 'Solid', right: 'Faded' },
    ],
  },
  {
    label: 'Color',
    controls: [
      { key: 'color', label: 'Palette', left: 'Electric', right: 'Pastel' },
      { key: 'brightness', label: 'Brightness', left: 'Dim', right: 'Bright' },
      { key: 'saturation', label: 'Saturation', left: 'Muted', right: 'Rich' },
      { key: 'background', label: 'Background', left: 'Indigo', right: 'Blush' },
      { key: 'backdropFade', label: 'Backdrop', left: 'Hidden', right: 'Glow' },
    ],
  },
  {
    label: 'Motion',
    controls: [
      { key: 'motion', label: 'Drift', left: 'Fast orbit', right: 'Slow breathe' },
      { key: 'ripples', label: 'Ripple', left: 'Tight', right: 'Soft' },
      { key: 'triggerResponse', label: 'Trigger', left: 'Sparks', right: 'Afterglow' },
    ],
  },
  {
    label: 'Atmosphere',
    controls: [
      { key: 'style', label: 'Type', left: 'Nebula', right: 'Aurora' },
      { key: 'noiseTurbulence', label: 'Turbulence', left: 'Smooth', right: 'Chaotic' },
      { key: 'noiseFlow', label: 'Flow', left: 'Horizontal', right: 'Vertical' },
      { key: 'noiseSpeed', label: 'Speed', left: 'Frozen', right: 'Fast' },
      { key: 'noiseColor', label: 'Color', left: 'Random', right: 'Shape sync' },
      { key: 'noiseSize', label: 'Scale', left: 'Detail', right: 'Broad' },
      { key: 'noiseDensity', label: 'Density', left: 'Sparse', right: 'Dense' },
      { key: 'bloomSize', label: 'Bloom', left: 'Tight', right: 'Wide' },
    ],
  },
  {
    label: 'Glitch',
    collapsed: true,
    controls: [
      { key: 'glitchIntensity', label: 'Mode', left: 'VHS', right: 'Digital' },
      { key: 'glitchScale', label: 'Size', left: 'Large', right: 'Fine' },
      { key: 'glitchChromatic', label: 'Chromatic', left: 'Clean', right: 'RGB split' },
      { key: 'glitchRate', label: 'Rate', left: 'Slow', right: 'Chaotic' },
    ],
  },
  {
    label: 'Kaleidoscope',
    collapsed: true,
    controls: [
      { key: 'kaleidoscope', label: 'Intensity', left: 'Fractal', right: 'Glass' },
      { key: 'kaleidoSegments', label: 'Segments', left: 'Few', right: 'Many' },
      { key: 'kaleidoSpin', label: 'Spin', left: 'Reverse', right: 'Forward' },
      { key: 'kaleidoType', label: 'Mode', left: 'Prism', right: 'Liquid' },
      { key: 'kaleidoPattern', label: 'Pattern', left: 'Radial', right: 'Repeat' },
      { key: 'kaleidoSize', label: 'Coverage', left: 'Center', right: 'Full' },
    ],
  },
  {
    label: 'Point Cloud',
    collapsed: true,
    controls: [
      { key: 'pointCloudAmount', label: 'Amount', left: 'Off', right: 'Cloud' },
      { key: 'pointCloudSize', label: 'Dot Size', left: 'Fine', right: 'Large' },
      { key: 'pointCloudDensity', label: 'Density', left: 'Sparse', right: 'Dense' },
      { key: 'pointCloudScatter', label: 'Scatter', left: 'Grid', right: 'Jitter' },
      { key: 'pointCloudColor', label: 'Color Boost', left: 'Source', right: 'Neon' },
    ],
  },
  {
    label: 'Character',
    collapsed: true,
    controls: [
      { key: 'charAmount', label: 'Amount', left: 'Clean', right: 'Heavy' },
      { key: 'charStyle', label: 'Style', left: 'Tape', right: 'Digital' },
      { key: 'charGrain', label: 'Grain', left: 'Smooth', right: 'Noisy' },
      { key: 'charDrift', label: 'Drift', left: 'Stable', right: 'Wobbly' },
    ],
  },
  {
    label: 'System',
    collapsed: true,
    controls: [
      { key: 'pulseSync', label: 'Pulse sync', left: 'Free', right: 'Locked' },
      { key: 'frameRate', label: 'Performance', left: 'Battery', right: 'Smooth' },
    ],
  },
];
