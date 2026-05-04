/**
 * ReverbEnvelopeCanvas — Stylised impulse-response / decay visualiser
 *
 * Layers rendered (bottom → top):
 *  1. Pre-delay gap
 *  2. Decay envelope (exponential curve, affected by decay & size)
 *  3. Early reflections (vertical bars, height = ER amount)
 *  4. Damping gradient (hue shift for low/high damping bands)
 *  5. Modulation ripple (sine displacement on envelope edge)
 *  6. Shimmer sparkle lines (upward traces when shimmer > 0)
 *  7. Reverse swell (mirrored envelope from right when reverse > 0)
 *  8. Width indicator (stereo spread bar at bottom)
 *  9. Freeze overlay (static noise + snowflake badge)
 * 10. Saturation colour tint (warm for tape, glow for tube)
 *
 * 30 fps cap, visibility-API pause, DPR-aware.
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';

export interface ReverbEnvelopeCanvasProps {
  engine: 'algorithmic' | 'convolution';
  quality: 'ultra' | 'balanced' | 'lite';
  decay: number;           // 0–1
  size: number;            // 0–10
  diffusion: number;       // 0–1
  modulation: number;      // 0–1
  predelay: number;        // ms (0–400)
  damping: number;         // 0–1
  width: number;           // 0–1
  shimmer: number;         // 0–1
  shimmerPitch: number;    // semitones
  reverse: number;         // 0–1
  reverseLength: number;   // seconds
  earlyReflections: number;// 0–1
  airAbsorption: number;   // 0–1
  dampLow: number;         // 0–1
  dampHigh: number;        // 0–1
  inputTone: number;       // -1 to 1
  warp: number;            // 0–1
  saturationMode: string;  // clean | tape | tube
  frozen: boolean;
  enabled: boolean;
  chorusDepth: number;     // 0–50
  slowModDepth: number;    // 0–1
}

/* ─── helpers ─── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ─── colours ─── */
const BG = '#0e1420';
const ENVELOPE_FILL_TOP = 'rgba(139, 92, 246, 0.45)';
const ENVELOPE_FILL_BOT = 'rgba(139, 92, 246, 0.05)';
const ENVELOPE_STROKE = 'rgba(165, 140, 255, 0.7)';
const ER_COLOR = 'rgba(96, 165, 250, 0.6)';
const MOD_COLOR = 'rgba(245, 158, 11, 0.35)';
const SHIMMER_COLOR = 'rgba(244, 114, 182, 0.55)';
const REVERSE_FILL = 'rgba(52, 211, 153, 0.2)';
const REVERSE_STROKE = 'rgba(52, 211, 153, 0.5)';
const WIDTH_COLOR = 'rgba(165, 196, 212, 0.4)';
const FREEZE_OVERLAY = 'rgba(59, 130, 246, 0.15)';
const TAPE_TINT = 'rgba(245, 158, 11, 0.06)';
const TUBE_TINT = 'rgba(239, 68, 68, 0.06)';

const ReverbEnvelopeCanvas: React.FC<ReverbEnvelopeCanvasProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const { canAnimate } = useAnimationVisibility(containerRef);

  // Memoise shimmer sparkle positions (stable across frames)
  const sparkles = useMemo(() => {
    const arr: { x: number; y: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < 12; i++) {
      arr.push({
        x: 0.15 + Math.random() * 0.7,
        y: 0.2 + Math.random() * 0.6,
        speed: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getCappedCanvasDpr();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const {
      engine, quality, decay, size, diffusion, modulation, predelay, damping, width: stereoWidth,
      shimmer, shimmerPitch, reverse, reverseLength, earlyReflections, airAbsorption,
      dampLow, dampHigh, inputTone, warp, saturationMode, frozen,
      enabled, chorusDepth, slowModDepth,
    } = props;

    const time = timeRef.current;

    /* ─── background ─── */
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    /* saturation tint */
    if (saturationMode === 'tape') {
      ctx.fillStyle = TAPE_TINT;
      ctx.fillRect(0, 0, w, h);
    } else if (saturationMode === 'tube') {
      ctx.fillStyle = TUBE_TINT;
      ctx.fillRect(0, 0, w, h);
    }

    if (!enabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = `${Math.min(14, w * 0.05)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Reverb Bypassed', w / 2, h / 2);
      return;
    }

    /* ─── parameters ─── */
    const pad = 8;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2 - 16; // leave room for width bar
    const plotY = pad;

    // Pre-delay as fraction of plot width (capped at 25%)
    const predelayFrac = clamp01((predelay / 400) * 0.25);
    const predelayPx = predelayFrac * plotW;

    // Decay time affects how quickly envelope drops
    const decayRate = lerp(6, 0.3, decay); // higher decay = slower drop
    const sizeScale = lerp(0.6, 1.4, clamp01(size / 10)) * lerp(0.94, 1.08, diffusion);
    const shimmerPitchNorm = clamp01((shimmerPitch + 12) / 24) * 2 - 1;

    /* ─── helper: envelope value at normalised x (0–1 of decay region) ─── */
    const envelopeAt = (nx: number) => {
      let v = Math.exp(-nx * decayRate / sizeScale);
      // Air absorption steepens late tail
      v *= Math.exp(-nx * airAbsorption * 1.5);
      // Damping overall
      v *= lerp(1, 0.5, damping * nx);
      // Warp distortion
      if (warp > 0) {
        v += Math.sin(nx * Math.PI * (2 + warp * 6)) * warp * 0.12 * (1 - nx);
      }
      // Modulation ripple
      if (modulation > 0 || chorusDepth > 0 || slowModDepth > 0) {
        const modAmt = modulation * 0.06 + (chorusDepth / 50) * 0.04 + slowModDepth * 0.05;
        v += Math.sin(nx * 12 + time * 2) * modAmt * (1 - nx * 0.5);
      }
      return clamp01(v);
    };

    /* ─── 7. Reverse swell ─── */
    if (reverse > 0) {
      const revRegionW = plotW * (1 - predelayFrac) * lerp(0.58, 1, clamp01(reverseLength / 4));
      const startX = pad + predelayPx;
      ctx.beginPath();
      ctx.moveTo(startX + revRegionW, plotY + plotH);
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        // Reverse envelope: grows from right
        const rv = Math.pow(nx, 2) * reverse;
        const x = startX + revRegionW - nx * revRegionW;
        const y = plotY + plotH - rv * plotH * 0.6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(startX, plotY + plotH);
      ctx.closePath();
      ctx.fillStyle = REVERSE_FILL;
      ctx.fill();
      ctx.strokeStyle = REVERSE_STROKE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    /* ─── 2. Early reflections ─── */
    if (earlyReflections > 0) {
      const erCount = Math.round(2 + earlyReflections * lerp(4, 10, diffusion));
      const erRegion = predelayPx + plotW * lerp(0.08, 0.24, diffusion);
      const erSkew = lerp(2.2, 1.0, diffusion);
      ctx.strokeStyle = ER_COLOR;
      ctx.lineWidth = lerp(1.9, 1.2, diffusion);
      for (let i = 0; i < erCount; i++) {
        const frac = Math.pow((i + 1) / (erCount + 1), erSkew);
        const x = pad + frac * erRegion;
        const barH = earlyReflections * plotH * lerp(0.24, 0.7, (1 - frac) * lerp(0.6, 1, 1 - diffusion));
        ctx.beginPath();
        ctx.moveTo(x, plotY + plotH);
        ctx.lineTo(x, plotY + plotH - barH);
        ctx.stroke();
        // small cap
        ctx.beginPath();
        ctx.arc(x, plotY + plotH - barH, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = ER_COLOR;
        ctx.fill();
      }
    }

    /* ─── 1. Pre-delay gap indicator ─── */
    if (predelayPx > 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(pad, plotY, predelayPx, plotH);
      // dashed line at boundary
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + predelayPx, plotY);
      ctx.lineTo(pad + predelayPx, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      // label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = `${Math.min(9, w * 0.03)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(predelay)}ms`, pad + predelayPx / 2, plotY + plotH - 4);
    }

    /* ─── Damping colour gradient behind envelope ─── */
    {
      const grd = ctx.createLinearGradient(pad + predelayPx, plotY, pad + plotW, plotY);
      // Input tone shifts the initial colour
      const toneHue = inputTone > 0 ? 40 : inputTone < 0 ? 250 : 260;
      const toneAlpha = Math.abs(inputTone) * 0.08;
      grd.addColorStop(0, `hsla(${toneHue}, 60%, 60%, ${toneAlpha})`);
      // Low damping in early region
      grd.addColorStop(0.3, `rgba(96, 165, 250, ${dampLow * 0.12})`);
      // High damping in late region
      grd.addColorStop(0.7, `rgba(244, 114, 182, ${dampHigh * 0.12})`);
      grd.addColorStop(1.0, `rgba(244, 114, 182, ${dampHigh * 0.06})`);
      ctx.fillStyle = grd;
      ctx.fillRect(pad + predelayPx, plotY, plotW - predelayPx, plotH);
    }

    /* ─── 2. Main decay envelope ─── */
    {
      const regionW = plotW - predelayPx;
      const startX = pad + predelayPx;
      const steps = 120;

      // Fill
      ctx.beginPath();
      ctx.moveTo(startX, plotY + plotH);
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        const v = envelopeAt(nx);
        const x = startX + nx * regionW;
        const y = plotY + plotH - v * plotH;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(startX + regionW, plotY + plotH);
      ctx.closePath();
      const grd = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
      grd.addColorStop(0, ENVELOPE_FILL_TOP);
      grd.addColorStop(1, ENVELOPE_FILL_BOT);
      ctx.fillStyle = grd;
      ctx.fill();

      // Stroke
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        const v = envelopeAt(nx);
        const x = startX + nx * regionW;
        const y = plotY + plotH - v * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ENVELOPE_STROKE;
      ctx.lineWidth = engine === 'convolution' ? 2.4 : 2;
      ctx.stroke();
    }

    /* ─── 5. Modulation ripple overlay ─── */
    if (modulation > 0.05 || chorusDepth > 3 || slowModDepth > 0.05) {
      const regionW = plotW - predelayPx;
      const startX = pad + predelayPx;
      const steps = 80;
      const modAmt = modulation * 0.08 + (chorusDepth / 50) * 0.06 + slowModDepth * 0.06;

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        const v = envelopeAt(nx);
        const ripple = Math.sin(nx * 18 + time * 3) * modAmt * (1 - nx * 0.6);
        const x = startX + nx * regionW;
        const y = plotY + plotH - (v + ripple) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = MOD_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    /* ─── 6. Shimmer sparkle lines ─── */
    if (shimmer > 0.01) {
      ctx.save();
      const regionW = plotW - predelayPx;
      const startX = pad + predelayPx;
      const alpha = clamp01(shimmer * 1.5);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = SHIMMER_COLOR;
      ctx.lineWidth = 1;

      for (const sp of sparkles) {
        const x = startX + sp.x * regionW;
        const baseY = plotY + sp.y * plotH;
        const trailLen = 8 + shimmer * 20;
        const yOff = Math.sin(time * sp.speed + sp.phase) * 6;
        const trailTilt = shimmerPitchNorm * trailLen * 0.28;
        const trailTopY = baseY + yOff - trailLen;
        ctx.beginPath();
        ctx.moveTo(x, baseY + yOff);
        ctx.lineTo(x + trailTilt, trailTopY);
        ctx.stroke();
        // sparkle dot at top
        ctx.beginPath();
        ctx.arc(x + trailTilt, trailTopY, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = SHIMMER_COLOR;
        ctx.fill();
      }
      ctx.restore();
    }

    /* ─── topology chips ─── */
    {
      const chips = [
        engine === 'convolution' ? 'IR' : 'FDN',
        quality === 'ultra' ? '16' : quality === 'balanced' ? '8' : '4',
        `ER ${Math.round(diffusion * 100)}%`,
      ];
      ctx.font = `${Math.min(8.5, w * 0.028)}px sans-serif`;
      ctx.textBaseline = 'middle';
      let chipX = pad;
      for (const chip of chips) {
        const chipWidth = ctx.measureText(chip).width + 10;
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(chipX, pad, chipWidth, 14);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(chipX + 0.5, pad + 0.5, chipWidth - 1, 13);
        ctx.fillStyle = 'rgba(245,249,255,0.75)';
        ctx.fillText(chip, chipX + 5, pad + 7.5);
        chipX += chipWidth + 5;
      }
    }

    /* ─── 8. Width indicator (bottom bar) ─── */
    {
      const barY = plotY + plotH + 6;
      const barH = 6;
      const centre = w / 2;
      const halfSpread = (stereoWidth * (w - pad * 2)) / 2;

      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(pad, barY, w - pad * 2, barH);

      ctx.fillStyle = WIDTH_COLOR;
      const bx = centre - halfSpread;
      const bw = halfSpread * 2;
      ctx.fillRect(bx, barY, bw, barH);

      // L / R labels
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = `${Math.min(7, w * 0.025)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('L', bx + 2, barY + barH - 1);
      ctx.textAlign = 'right';
      ctx.fillText('R', bx + bw - 2, barY + barH - 1);
    }

    /* ─── 9. Freeze overlay ─── */
    if (frozen) {
      ctx.fillStyle = FREEZE_OVERLAY;
      ctx.fillRect(0, 0, w, h);
      // Snowflake badge
      ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.font = `${Math.min(18, w * 0.07)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText('❄', w - 8, 18);
    }

  }, [props, sparkles]);

  /* ─── animation loop ─── */
  useEffect(() => {
    const {
      enabled,
      modulation,
      shimmer,
      chorusDepth,
      slowModDepth,
    } = props;
    const shouldAnimate = enabled && (
      modulation > 0.05 ||
      shimmer > 0.01 ||
      chorusDepth > 3 ||
      slowModDepth > 0.05
    );

    let running = true;
    const cancelLoop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    const loop = (timestamp: number) => {
      if (!running) return;
      const lastFrameTime = lastFrameTimeRef.current;
      if (lastFrameTime == null || (timestamp - lastFrameTime) >= (1000 / 30)) {
        const deltaMs = lastFrameTime == null ? (1000 / 30) : Math.min(100, timestamp - lastFrameTime);
        timeRef.current += deltaMs / 1000;
        lastFrameTimeRef.current = timestamp;
        draw();
      }
      if (canAnimate) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };
    lastFrameTimeRef.current = null;
    draw();
    if (canAnimate && shouldAnimate) {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      running = false;
      lastFrameTimeRef.current = null;
      cancelLoop();
    };
  }, [canAnimate, draw, props]);

  return (
    <div ref={containerRef} className="reverb-envelope-canvas-wrap">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default React.memo(ReverbEnvelopeCanvas);
