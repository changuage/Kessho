import React, { useEffect, useRef } from 'react';
import { getCappedCanvasDpr } from '../hooks/useAnimationVisibility';
import { sampleGeneratedFoldTransfer, type PadFoldMode } from './padOscillatorVizMath';

export interface PadPostFilterFoldVizProps {
  foldAmount: number;
  foldMode: PadFoldMode;
}

const MODE_COLORS = ['#60c0ff', '#80ff80', '#ff8060'] as const;

const PadPostFilterFoldViz: React.FC<PadPostFilterFoldVizProps> = ({ foldAmount, foldMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = getCappedCanvasDpr();
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pad = 5 * dpr;
      const plotWidth = Math.max(1, width - pad * 2);
      const plotHeight = Math.max(1, height - pad * 2);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,0.11)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(pad, pad + plotHeight / 2);
      ctx.lineTo(pad + plotWidth, pad + plotHeight / 2);
      ctx.moveTo(pad + plotWidth / 2, pad);
      ctx.lineTo(pad + plotWidth / 2, pad + plotHeight);
      ctx.stroke();
      ctx.strokeStyle = MODE_COLORS[Math.max(0, Math.min(2, foldMode | 0))] ?? MODE_COLORS[0];
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      for (let index = 0; index <= 96; index += 1) {
        const input = (index / 96) * 2 - 1;
        const output = Math.max(-1, Math.min(1, sampleGeneratedFoldTransfer(foldMode, foldAmount, input)));
        const x = pad + (index / 96) * plotWidth;
        const y = pad + (1 - (output + 1) * 0.5) * plotHeight;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [foldAmount, foldMode]);

  return (
    <div className="pad-post-filter-fold-viz" role="img" aria-label={`Post-filter Fold transfer. ${foldMode === 1 ? 'Sine' : foldMode === 2 ? 'Serge' : 'Buchla'} mode, amount ${Math.round(Math.max(0, Math.min(1, foldAmount)) * 100)} percent.`}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
};

export default PadPostFilterFoldViz;
