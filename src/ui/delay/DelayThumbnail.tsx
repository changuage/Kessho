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

export interface DelayThumbnailProps {
  type: 'pattern' | 'warp';
  variant: string;
  accent: string;
}

const DelayThumbnail: React.FC<DelayThumbnailProps> = ({ type, variant, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 40 * dpr;
    canvas.height = 24 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 40, 24);

    if (type === 'pattern') {
      const preset = PATTERN_PRESETS[variant];
      if (!preset) return;
      const maxSub = Math.max(...preset.subdivisions);
      for (let i = 0; i < 8; i++) {
        const x = 4 + (preset.subdivisions[i]! / maxSub) * 32;
        const y = 12 + preset.pans[i]! * 6;
        const r = Math.max(1.5, 2.5 * preset.gains[i]!);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.7;
        ctx.fill();
      }
    } else {
      // Warp thumbnails: 8 dots in a line with warp-specific treatment
      for (let i = 0; i < 8; i++) {
        const x = 4 + (i / 7) * 32;
        let y = 12;
        ctx.globalAlpha = 0.7;

        if (variant === 'pitchDrift' && i >= 4) y -= 4;

        if (variant === 'filterSweep') {
          const hue = 20 + (i / 7) * 180;
          ctx.fillStyle = `hsl(${hue}, 70%, 65%)`;
        } else if (variant === 'pitchDrift' && i >= 4) {
          ctx.fillStyle = '#dcfffa';
        } else {
          ctx.fillStyle = accent;
        }

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);

        if (variant === 'grainCrossfade' && i >= 4) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          // Scatter dot
          ctx.beginPath();
          ctx.arc(x + 1.5, y - 1.5, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.3;
          ctx.fill();
        } else {
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [type, variant, accent]);

  return <canvas ref={canvasRef} width={40} height={24} className="delay-thumbnail" />;
};

export default DelayThumbnail;
