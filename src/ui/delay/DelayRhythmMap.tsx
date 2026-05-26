import React, { useRef, useEffect, useCallback } from 'react';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';

/* ── Pattern presets (mirrored from delayBuses.ts for drawing) ── */
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

const TAPE_HEAD_RATIOS: Record<string, [number, number, number, number]> = {
  even: [0.25, 0.5, 0.75, 1],
  triplet: [1 / 6, 1 / 3, 2 / 3, 1],
  golden: [0.2360679, 0.381966, 0.618034, 1],
  silver: [0.3535534, 0.5, 0.7071068, 1],
};

function computeTapGain(tapIndex: number, activity: number): number {
  const configs = [
    { rampStart: 0.0, threshold: 0.0, maxGain: 1.0 },
    { rampStart: 0.1, threshold: 0.15, maxGain: 0.85 },
    { rampStart: 0.2, threshold: 0.3, maxGain: 0.75 },
    { rampStart: 0.3, threshold: 0.4, maxGain: 0.7 },
    { rampStart: 0.45, threshold: 0.55, maxGain: 0.65 },
    { rampStart: 0.55, threshold: 0.65, maxGain: 0.6 },
    { rampStart: 0.7, threshold: 0.8, maxGain: 0.55 },
    { rampStart: 0.85, threshold: 0.9, maxGain: 0.5 },
  ];
  const cfg = configs[tapIndex] ?? configs[0]!;
  if (activity < cfg.rampStart) return 0;
  if (activity >= cfg.threshold) {
    const intensity = Math.min(1, (activity - cfg.threshold) / Math.max(0.01, 1 - cfg.threshold));
    return cfg.maxGain * (0.4 + 0.6 * intensity);
  }
  const fade = (activity - cfg.rampStart) / Math.max(0.01, cfg.threshold - cfg.rampStart);
  return cfg.maxGain * fade * 0.4;
}

// Warp-specific color helpers
function warpColor(warp: string, i: number, baseColor: string, alpha: number): string {
  if (warp === 'filterSweep') {
    const hue = 20 + (i / 7) * 180; // warm→cool
    return `hsla(${hue}, 70%, 65%, ${alpha})`;
  }
  if (warp === 'pitchDrift' && i >= 4) {
    return `rgba(220, 255, 250, ${alpha})`;
  }
  // Default / clean / grainCrossfade: use base
  return baseColor.replace(/[\d.]+\)$/, `${alpha})`);
}

export interface DelayRhythmMapProps {
  bpm: number;
  echoTimeL: number;
  echoTimeR: number;
  echoFeedback: number;
  echoPingPong: boolean;
  echoWidth: number;
  clockedPattern: string;
  clockedWarp: string;
  clockedActivity: number;
  clockedBaseTime: number;
  clockedSpread: number;
  delayBAlgorithm: string;
  tapeSpacing: string;
  tapeHeadEnabled: readonly boolean[];
  tapeHeadLevels: readonly number[];
  tapeHeadPans: readonly number[];
  aToBSend: number;
  bToASend: number;
}

const ECHO_COLOR = 'rgba(185, 201, 255, 1)';
const CLOCKED_COLOR = 'rgba(159, 229, 240, 1)';

const DelayRhythmMap: React.FC<DelayRhythmMapProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const playheadRef = useRef(0);
  const { canAnimate } = useAnimationVisibility(containerRef);
  const hasAnimatedContent =
    props.echoFeedback > 0.01 ||
    props.clockedActivity > 0.01 ||
    props.aToBSend > 0.01 ||
    props.bToASend > 0.01;
  const shouldAnimate = canAnimate && hasAnimatedContent;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getCappedCanvasDpr();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const backingWidth = Math.round(w * dpr);
    const backingHeight = Math.round(h * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const halfH = h / 2;
    const secPerCycle = 240 / Math.max(30, props.bpm); // 4 beats in seconds
    const pxPerSec = w / secPerCycle;

    // ── Echo Line (top half) ──
    const maxBarH = halfH * 0.7;
    const maxRepeats = Math.min(12, Math.ceil(1 / Math.max(0.05, 1 - props.echoFeedback)));
    const barW = 2 + props.echoWidth * 6;
    const panOffset = 8;

    // Label
    ctx.fillStyle = 'rgba(185, 201, 255, 0.5)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('ECHO LINE', 6, 4);

    for (let r = 0; r < maxRepeats; r++) {
      const decay = Math.pow(props.echoFeedback, r);
      if (decay < 0.02) break;
      const barH = maxBarH * decay;
      const alpha = Math.max(0.15, decay);

      if (props.echoPingPong) {
        // Ping-pong: alternate L/R
        const isLeft = r % 2 === 0;
        const time = isLeft ? props.echoTimeL * (r + 1) : props.echoTimeR * (r + 1);
        const x = time * pxPerSec;
        if (x > w) break;
        const y = halfH * 0.5 - barH / 2 + (isLeft ? -panOffset : panOffset);
        ctx.fillStyle = ECHO_COLOR.replace('1)', `${alpha})`);
        ctx.fillRect(x - barW / 2, y, barW, barH);
      } else {
        // Dual independent
        const xL = props.echoTimeL * (r + 1) * pxPerSec;
        const xR = props.echoTimeR * (r + 1) * pxPerSec;
        if (xL <= w) {
          const yL = halfH * 0.5 - barH / 2 - panOffset;
          ctx.fillStyle = ECHO_COLOR.replace('1)', `${alpha})`);
          ctx.fillRect(xL - barW / 2, yL, barW, barH);
        }
        if (xR <= w) {
          const yR = halfH * 0.5 - barH / 2 + panOffset;
          ctx.fillStyle = ECHO_COLOR.replace('1)', `${alpha * 0.8})`);
          ctx.fillRect(xR - barW / 2, yR, barW, barH);
        }
      }
    }

    // ── Delay B (bottom half) ──
    const bottomTop = halfH;
    const bottomCenter = halfH + halfH * 0.48;
    const panScaleY = halfH * 0.24;
    ctx.fillStyle = 'rgba(159, 229, 240, 0.55)';
    ctx.fillText(props.delayBAlgorithm === 'tapeHeads' ? 'TAPE HEADS' : 'CLOCKED SPACE', 6, bottomTop + 4);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let beat = 1; beat <= 3; beat++) {
      const x = (w / 4) * beat;
      ctx.beginPath();
      ctx.moveTo(x, bottomTop + 18);
      ctx.lineTo(x, h - 6);
      ctx.stroke();
    }

    if (props.delayBAlgorithm === 'tapeHeads') {
      const ratios = TAPE_HEAD_RATIOS[props.tapeSpacing] ?? TAPE_HEAD_RATIOS.even!;
      const padX = 18;
      const usableW = Math.max(1, w - padX * 2);
      ctx.strokeStyle = 'rgba(159, 229, 240, 0.18)';
      ctx.beginPath();
      ctx.moveTo(padX, bottomCenter);
      ctx.lineTo(w - padX, bottomCenter);
      ctx.stroke();

      for (let repeat = 0; repeat < 3; repeat++) {
        for (let i = 0; i < 4; i++) {
          if (props.tapeHeadEnabled[i] === false) continue;
          const level = Math.max(0, Math.min(1, props.tapeHeadLevels[i] ?? 1));
          const pan = ((props.tapeHeadPans[i] ?? 0.5) - 0.5) * 2;
          const phase = (repeat + ratios[i]!) / 3;
          const x = padX + phase * usableW;
          const gain = level * Math.pow(Math.max(0.08, props.echoFeedback || props.clockedActivity || 0.35), repeat * 0.7);
          const barH = halfH * 0.52 * gain;
          const y = bottomCenter - barH / 2 + pan * panScaleY * props.clockedSpread * 2;
          const alpha = Math.max(0.12, 0.85 - repeat * 0.25) * (0.45 + level * 0.55);
          ctx.fillStyle = `rgba(159, 229, 240, ${alpha})`;
          ctx.fillRect(x - 2.5, y, 5, barH);
          if (repeat === 0) {
            ctx.fillStyle = `rgba(185, 201, 255, ${0.45 + level * 0.45})`;
            ctx.beginPath();
            ctx.arc(x, bottomCenter - halfH * 0.34, 3 + level * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.42)';
            ctx.fillText(`H${i + 1}`, x - 6, h - 16);
          }
        }
      }
    } else {
      const pattern = PATTERN_PRESETS[props.clockedPattern] ?? PATTERN_PRESETS.cascade!;
      const maxSub = Math.max(...pattern.subdivisions);
      const tapBarW = 2 + props.clockedSpread * 4;
      const tapMaxH = halfH * 0.6;

      for (let i = 0; i < 8; i++) {
        const gain = computeTapGain(i, props.clockedActivity) * pattern.gains[i]!;
        if (gain < 0.01) continue;
        const timeSec = (pattern.subdivisions[i]! / maxSub) * props.clockedBaseTime * 4;
        const x = timeSec * pxPerSec;
        if (x > w) continue;
        const barH = tapMaxH * gain;
        const panY = pattern.pans[i]! * panScaleY;
        let yOffset = 0;
        if (props.clockedWarp === 'pitchDrift' && i >= 4) yOffset = -8;

        const y = bottomCenter - barH / 2 + panY + yOffset;
        const alpha = 0.3 + gain * 0.7;
        ctx.fillStyle = warpColor(props.clockedWarp, i, CLOCKED_COLOR, alpha);

        if (props.clockedWarp === 'grainCrossfade' && i >= 4) {
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = warpColor(props.clockedWarp, i, CLOCKED_COLOR, alpha);
          ctx.lineWidth = 1;
          ctx.strokeRect(x - tapBarW / 2, y, tapBarW, barH);
          ctx.setLineDash([]);
        } else {
          ctx.fillRect(x - tapBarW / 2, y, tapBarW, barH);
        }
      }
    }

    // ── Divider ──
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, halfH);
    ctx.lineTo(w, halfH);
    ctx.stroke();

    // ── Cross-feed arcs ──
    if (props.aToBSend > 0.01) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(196, 168, 224, ${props.aToBSend * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, halfH * 0.65);
      ctx.quadraticCurveTo(w * 0.08, halfH, w * 0.15, halfH + halfH * 0.35);
      ctx.stroke();
      ctx.restore();
    }
    if (props.bToASend > 0.01) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(196, 168, 224, ${props.bToASend * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.85, halfH + halfH * 0.35);
      ctx.quadraticCurveTo(w * 0.92, halfH, w * 0.85, halfH * 0.65);
      ctx.stroke();
      ctx.restore();
    }

    // ── Playhead ──
    const now = performance.now();
    const cycleDuration = secPerCycle * 1000;
    playheadRef.current = (now % cycleDuration) / cycleDuration;
    const px = playheadRef.current * w;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }, [props]);

  useEffect(() => {
    let frame = 0;
    let running = true;
    const cancelLoop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    const loop = () => {
      if (!running) return;
      frame++;
      if (frame % 2 === 0) draw(); // 30fps cap
      if (shouldAnimate) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };
    draw();
    if (shouldAnimate) {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      running = false;
      cancelLoop();
    };
  }, [draw, shouldAnimate]);

  return (
    <div ref={containerRef} className="delay-rhythm-map">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default DelayRhythmMap;
