import React, { type RefObject } from 'react';
import type { VisualizerFrameMode } from './visualizerFrameScheduler';

interface VisualizerCanvasSurfaceProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  wrapRef: RefObject<HTMLDivElement>;
  rendererMode: 'webgl2' | 'canvas2d';
  isPlaying: boolean;
  frameMode: VisualizerFrameMode;
  displayedFps: number;
  seedLabel: string;
}

export const VisualizerCanvasSurface = React.memo(function VisualizerCanvasSurface({
  canvasRef,
  wrapRef,
  rendererMode,
  isPlaying,
  frameMode,
  displayedFps,
  seedLabel,
}: VisualizerCanvasSurfaceProps) {
  return (
    <div ref={wrapRef} className="visualizer-canvas-wrap">
      <canvas ref={canvasRef} className="visualizer-canvas" aria-label="Reactive visualizer" />
      <div className="visualizer-status-row">
        <span>{rendererMode === 'webgl2' ? 'WebGL2' : '2D'}</span>
        <span>{isPlaying ? 'Live' : 'Idle'}</span>
        <span>{frameMode === 'parked' ? 'Parked' : `${displayedFps} FPS`}</span>
        <span>{seedLabel}</span>
      </div>
    </div>
  );
});
