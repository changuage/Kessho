import type { VisualizerNumericControlKey } from './visualizerModulation';

export type VisualizerControlDomain =
  | 'bipolar'
  | 'bipolarOffCenter'
  | 'unipolarRemapped'
  | 'performance';

export type VisualizerControlLayer =
  | 'shape'
  | 'atmosphere'
  | 'glitch'
  | 'kaleidoscope'
  | 'pointCloud'
  | 'character'
  | 'post'
  | 'system';

export interface VisualizerControlMetadata {
  domain: VisualizerControlDomain;
  layer: VisualizerControlLayer;
  neutral: number;
  off: number | null;
  cost: 'constant' | 'scalable';
}

const bipolar = (
  layer: VisualizerControlLayer,
  cost: VisualizerControlMetadata['cost'] = 'constant',
): VisualizerControlMetadata => ({ domain: 'bipolar', layer, neutral: 0, off: null, cost });

const offCenter = (
  layer: VisualizerControlLayer,
  cost: VisualizerControlMetadata['cost'] = 'scalable',
): VisualizerControlMetadata => ({ domain: 'bipolarOffCenter', layer, neutral: 0, off: 0, cost });

export const VISUALIZER_CONTROL_METADATA = {
  style: offCenter('atmosphere'),
  kaleidoscope: offCenter('kaleidoscope'),
  triggerResponse: bipolar('post'),
  ripples: offCenter('shape'),
  motion: bipolar('shape'),
  color: bipolar('post'),
  diffusion: bipolar('shape'),
  background: bipolar('post'),
  frameRate: { domain: 'performance', layer: 'system', neutral: 0, off: null, cost: 'scalable' },
  shape: bipolar('shape'),
  organic: bipolar('shape'),
  edges: bipolar('shape'),
  backdropFade: bipolar('post'),
  noiseTurbulence: bipolar('atmosphere'),
  noiseFlow: bipolar('atmosphere'),
  noiseSpeed: bipolar('atmosphere'),
  noiseColor: bipolar('atmosphere'),
  pulseSync: bipolar('system'),
  shapeSize: bipolar('shape'),
  shapeSpread: bipolar('shape'),
  shapeCount: bipolar('shape', 'scalable'),
  noiseSize: bipolar('atmosphere'),
  noiseDensity: bipolar('atmosphere', 'scalable'),
  bloomSize: bipolar('post'),
  kaleidoSize: bipolar('kaleidoscope'),
  glitchIntensity: offCenter('glitch'),
  glitchScale: bipolar('glitch'),
  glitchChromatic: bipolar('glitch'),
  glitchRate: bipolar('glitch'),
  charAmount: offCenter('character'),
  charStyle: bipolar('character'),
  charGrain: bipolar('character'),
  charDrift: bipolar('character'),
  kaleidoSegments: bipolar('kaleidoscope'),
  kaleidoSpin: bipolar('kaleidoscope'),
  kaleidoType: bipolar('kaleidoscope'),
  kaleidoReflections: bipolar('kaleidoscope'),
  kaleidoPattern: bipolar('kaleidoscope'),
  brightness: bipolar('post'),
  vibrance: bipolar('post'),
  saturation: bipolar('post'),
  impactFlash: offCenter('post'),
  visualLimiter: bipolar('post'),
  pointCloudAmount: {
    domain: 'unipolarRemapped',
    layer: 'pointCloud',
    neutral: 0,
    off: -1,
    cost: 'scalable',
  },
  pointCloudSize: bipolar('pointCloud'),
  pointCloudDensity: bipolar('pointCloud', 'scalable'),
  pointCloudScatter: bipolar('pointCloud'),
  pointCloudColor: bipolar('pointCloud'),
} satisfies Record<VisualizerNumericControlKey, VisualizerControlMetadata>;

export function formatVisualizerControlValue(
  key: VisualizerNumericControlKey,
  value: number,
  leftLabel: string,
  rightLabel: string,
): string {
  const metadata = VISUALIZER_CONTROL_METADATA[key];
  if (metadata.off !== null && Math.abs(value - metadata.off) < 0.01) return 'Off';
  if (metadata.domain === 'unipolarRemapped') {
    return `${rightLabel} ${Math.round((value + 1) * 50)}%`;
  }
  if (Math.abs(value - metadata.neutral) < 0.01) return '—';
  return value < 0
    ? `${leftLabel} ${Math.round(Math.abs(value) * 100)}%`
    : `${rightLabel} ${Math.round(value * 100)}%`;
}
