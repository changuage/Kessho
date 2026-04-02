import React, { useRef, useEffect } from 'react';

const PATTERN_PRESETS: Record<string, { subdivisions: number[]; gains: number[]; pans: number[] }> = {
  cascade: {
    subdivisions: [1.0, 0.5, 0.75, 0.25, 1 / 3, 1 / 6, 0.375, 0.125],
    gains: [1.0, 0.85, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    pans: [-0.7, 0.7, -0.5, 0.5, -0.8, 0.8, -0.3, 0.3],
  },
  golden: {
    subdivisions: [1.0, 0.618, 0.382, 0.236, 0.146, 0.09, 0.056, 0.034],
    gains: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
    pans: [-0.3, 0.5, -0.7, 0.2, -0.5, 0.8, -0.2, 0.6],
  },
  mirror: {
    subdivisions: [0.5, 0.5, 0.75, 0.75, 1.0, 1.0, 0.25, 0.25],
    gains: [1.0, 1.0, 0.8, 0.8, 0.65, 0.65, 0.5, 0.5],
    pans: [-0.8, 0.8, -0.6, 0.6, -0.4, 0.4, -0.9, 0.9],
  },
  dotted: {
    subdivisions: [1.5, 0.75, 0.375, 1.125, 0.5625, 0.28125, 0.1875, 0.09375],
    gains: [1.0, 0.88, 0.76, 0.68, 0.58, 0.48, 0.4, 0.32],
    pans: [-0.6, 0.6, -0.4, 0.4, -0.7, 0.7, -0.5, 0.5],
  },
};

export interface AlgorithmCardProps {
  pattern: string;
  warp: string;
  accent: string;
}

const DelayAlgorithmCard: React.FC<AlgorithmCardProps> = ({ pattern, warp, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 260;
    const h = 60;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const preset = PATTERN_PRESETS[pattern] ?? PATTERN_PRESETS.cascade!;
    const maxSub = Math.max(...preset.subdivisions);
    const centerY = h / 2;

    // Filter sweep: background gradient arc
    if (warp === 'filterSweep') {
      const grad = ctx.createLinearGradient(10, 0, w - 10, 0);
      grad.addColorStop(0, 'rgba(255, 136, 102, 0.12)');
      grad.addColorStop(1, 'rgba(102, 187, 255, 0.12)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(w / 2, centerY, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 8; i++) {
      const x = 14 + (preset.subdivisions[i]! / maxSub) * (w - 28);
      let y = centerY + preset.pans[i]! * 16;
      const r = Math.max(2, 4 * preset.gains[i]!);

      // Pitch drift: shift later taps up
      if (warp === 'pitchDrift' && i >= 4) y -= 8;

      // Color per warp
      let fillColor = accent;
      if (warp === 'filterSweep') {
        const hue = 20 + (i / 7) * 180;
        fillColor = `hsl(${hue}, 70%, 65%)`;
      } else if (warp === 'pitchDrift' && i >= 4) {
        fillColor = '#dcfffa';
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      if (warp === 'grainCrossfade' && i >= 4) {
        // Dashed outline + scatter dots
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Scatter dots
        for (let d = 0; d < 3; d++) {
          const dx = x + (Math.random() - 0.5) * 10;
          const dy = y + (Math.random() - 0.5) * 8;
          ctx.beginPath();
          ctx.arc(dx, dy, 1, 0, Math.PI * 2);
          ctx.fillStyle = `${fillColor}`;
          ctx.globalAlpha = 0.4;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Pitch drift: tiny arrow
      if (warp === 'pitchDrift' && i >= 4) {
        ctx.fillStyle = 'rgba(220, 255, 250, 0.6)';
        ctx.font = '7px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('↑', x, y - r - 2);
      }
    }
  }, [pattern, warp, accent]);

  return (
    <div className="delay-algorithm-card">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default DelayAlgorithmCard;
