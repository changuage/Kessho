import type { VisualizerQualityMode } from './visualizerControls';

export interface VisualizerQualitySettings {
  mode: VisualizerQualityMode;
  effectiveMode: 'mobileSafe' | 'desktopBeauty';
  maxDpr: number;
  targetFps: number;
  shapeCountScale: number;
  noiseDensityScale: number;
  pointCloudDensityScale: number;
  maxPointCloudGrid: number;
  shaderDetail: number;
}

export function resolveVisualizerQualityMode(params: {
  requestedMode: VisualizerQualityMode;
  isMobileReducedVisuals: boolean;
  isCoarsePointer: boolean;
  devicePixelRatio: number;
}): VisualizerQualitySettings {
  const autoMode = params.isMobileReducedVisuals || params.isCoarsePointer
    ? 'mobileSafe'
    : 'desktopBeauty';
  const effectiveMode = params.requestedMode === 'auto'
    ? autoMode
    : params.requestedMode;

  if (effectiveMode === 'mobileSafe') {
    return {
      mode: params.requestedMode,
      effectiveMode,
      maxDpr: Math.min(1.25, params.devicePixelRatio || 1),
      targetFps: 30,
      shapeCountScale: 0.78,
      noiseDensityScale: 0.72,
      pointCloudDensityScale: 0.66,
      maxPointCloudGrid: 56,
      shaderDetail: 0,
    };
  }

  return {
    mode: params.requestedMode,
    effectiveMode,
    maxDpr: Math.min(2, params.devicePixelRatio || 1),
    targetFps: 60,
    shapeCountScale: 1,
    noiseDensityScale: 1,
    pointCloudDensityScale: 1,
    maxPointCloudGrid: 96,
    shaderDetail: 1,
  };
}
