/**
 * GranularBufferCanvas — Canvas-based buffer visualizer for the Granular FX page
 *
 * Replaces the CSS-based visualizer with a single <canvas> element that renders:
 *  1. Waveform background (peak-downsampled buffer data from WASM)
 *  2. Slice boundaries with heatmap (activity-based tinting)
 *  3. Gradient-edge bands showing each voice's motion/look-back window
 *  4. Envelope shape on band edges (attack/decay taper)
 *  5. Connection lines from anchor to current read position
 *  6. Directional arrows on voice markers (forward/reverse/scan)
 *  7. Write head with trailing glow
 *  8. Grain spawn particles (brief opacity pulses at grain positions)
 *  9. Inline badges showing mode and key parameters
 * 10. Sparkline showing grain count history
 * 11. Slice click-to-assign interaction
 * 12. Ghost waveform (dimmed previous waveform after freeze)
 * 13. Time scale ticks
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';

// ═══════════════ Types ═══════════════

interface BufferRangeSegment {
  left: number;
  width: number;
}

export interface CanvasVoiceVisual {
  index: number;
  mode: 'clean' | 'granular' | 'legacy';
  motionMode: 'scan' | 'linear' | null;
  color: string;
  slice: number;
  currentPos: number;
  markerPositions: number[];
  anchorPos: number;
  rangeSegments: BufferRangeSegment[];
  rangeHeight: number;
  rangeOpacity: number;
  bandTopOffset: number;
  tempoSync: boolean;
  tempoLabel: string | null;
  // Per-voice params for envelope/direction rendering
  attack: number;   // 0-1 (seconds mapped)
  decay: number;    // 0-1
  reverse: boolean;
  speed: number;    // clean mode speed
  scanRate: number;
}

export interface GranularBufferCanvasProps {
  height: number;
  isRunning: boolean;
  voices: CanvasVoiceVisual[];
  writeHeadPosition: number;
  activeGrainCount: number;
  bufferWaveform: Float32Array | null;
  bufferSeconds: number;
  isFrozen: boolean;
  activeSlices: Set<number>;
  numSlices: number;
  onSliceClick?: (sliceIndex: number) => void;
}

// ═══════════════ Constants ═══════════════

const VOICE_LANE_HEIGHT = 18;
const LANE_GAP = 4;
const LANES_TOP = 16;
const BOTTOM_MARGIN = 14;
const SPARKLINE_HEIGHT = 16;
const SPARKLINE_RIGHT_PAD = 6;
const SPARKLINE_WIDTH = 60;
const GRAIN_HISTORY_LEN = 80;     // ~4s at 20fps
const PARTICLE_LIFETIME = 350;    // ms
const MAX_PARTICLES = 40;
const WRITE_HEAD_TRAIL_LEN = 8;
const POS_CHANGE_THRESHOLD = 0.002; // minimum normalized position change to spawn particle

// ═══════════════ Helpers ═══════════════

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// ═══════════════ Component ═══════════════

const GranularBufferCanvas: React.FC<GranularBufferCanvasProps> = ({
  height,
  isRunning,
  voices,
  writeHeadPosition,
  activeGrainCount,
  bufferWaveform,
  bufferSeconds,
  isFrozen,
  activeSlices,
  numSlices,
  onSliceClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const grainHistoryRef = useRef<number[]>([]);
  const particlesRef = useRef<{ x: number; y: number; color: string; born: number }[]>([]);
  const prevGrainCountRef = useRef(0);
  const prevVoicePosRef = useRef<number[]>([0, 0, 0, 0]);
  const writeHeadTrailRef = useRef<number[]>([]);
  const ghostWaveformRef = useRef<Float32Array | null>(null);
  const wasFrozenRef = useRef(false);

  // Mutable refs to avoid stale closures in rAF
  const voicesRef = useRef(voices);
  const writeHeadRef = useRef(writeHeadPosition);
  const grainCountRef = useRef(activeGrainCount);
  const waveformRef = useRef(bufferWaveform);
  const frozenRef = useRef(isFrozen);
  const activeSRef = useRef(activeSlices);
  const bufSecRef = useRef(bufferSeconds);
  const isRunningRef = useRef(isRunning);

  voicesRef.current = voices;
  writeHeadRef.current = writeHeadPosition;
  grainCountRef.current = activeGrainCount;
  waveformRef.current = bufferWaveform;
  frozenRef.current = isFrozen;
  activeSRef.current = activeSlices;
  bufSecRef.current = bufferSeconds;
  isRunningRef.current = isRunning;

  // Ghost waveform: snapshot buffer on freeze transition
  useEffect(() => {
    if (isFrozen && !wasFrozenRef.current && bufferWaveform) {
      ghostWaveformRef.current = new Float32Array(bufferWaveform);
    }
    if (!isFrozen) {
      ghostWaveformRef.current = null;
    }
    wasFrozenRef.current = isFrozen;
  }, [isFrozen, bufferWaveform]);

  // Auto-measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setMeasuredWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = measuredWidth || 400;
    const h = height;

    // Ensure canvas backing store matches display size
    const needsResize = canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr);
    if (needsResize) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const now = performance.now();
    const vs = voicesRef.current;
    const wh = writeHeadRef.current;
    const gc = grainCountRef.current;
    const wf = waveformRef.current;
    const frozen = frozenRef.current;
    const activeS = activeSRef.current;
    const bSec = bufSecRef.current;
    const ghostWf = ghostWaveformRef.current;
    const sliceW = w / numSlices;

    // ── 1. Waveform background ──
    const waveformAreaTop = LANES_TOP;
    const waveformAreaBottom = h - BOTTOM_MARGIN;
    const waveformAreaH = waveformAreaBottom - waveformAreaTop;
    const waveformMidY = waveformAreaTop + waveformAreaH / 2;

    // Ghost waveform (frozen: show previous buffer state dimmed)
    if (frozen && ghostWf && ghostWf.length > 0) {
      drawWaveform(ctx, ghostWf, w, waveformMidY, waveformAreaH, 'rgba(59,130,246,0.08)');
    }

    // Live waveform
    if (wf && wf.length > 0) {
      drawWaveform(ctx, wf, w, waveformMidY, waveformAreaH,
        frozen ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.1)');
    }

    // ── 2. Slice boundaries with heatmap ──
    // Compute per-slice grain activity from voice positions
    const sliceHeat = new Float32Array(numSlices);
    for (const v of vs) {
      const sliceIdx = Math.floor(v.currentPos * numSlices) % numSlices;
      sliceHeat[sliceIdx] = (sliceHeat[sliceIdx] ?? 0) + 0.3;
      // Also heat the assigned slice
      if (v.slice >= 0 && v.slice < numSlices) {
        sliceHeat[v.slice] = (sliceHeat[v.slice] ?? 0) + 0.15;
      }
    }

    for (let i = 0; i < numSlices; i++) {
      const sx = i * sliceW;
      // Heatmap background
      const heat = Math.min(1, sliceHeat[i] ?? 0);
      if (heat > 0) {
        ctx.fillStyle = `rgba(6,182,212,${heat * 0.2})`;
        ctx.fillRect(sx, 0, sliceW, h);
      }
      // Active slice highlight
      if (activeS.has(i)) {
        ctx.fillStyle = 'rgba(6,182,212,0.12)';
        ctx.fillRect(sx, 0, sliceW, h);
      }
      // Slice border
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      // Slice number label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '7px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, sx + sliceW / 2, h - 2);
    }

    // ── 3-4. Voice lanes: gradient bands with envelope shapes ──
    const totalLaneSpace = vs.length * VOICE_LANE_HEIGHT + Math.max(0, vs.length - 1) * LANE_GAP;
    const lanesAreaH = waveformAreaH;
    const lanesStartY = LANES_TOP + Math.max(0, (lanesAreaH - totalLaneSpace) / 2);

    vs.forEach((voice, vi) => {
      const laneY = lanesStartY + vi * (VOICE_LANE_HEIGHT + LANE_GAP);
      const [r, g, b] = hexToRgb(voice.color);

      // ─ 5. Connection line: anchor → current position ─
      const anchorX = voice.anchorPos * w;
      const markerX = voice.currentPos * w;
      const laneMidY = laneY + VOICE_LANE_HEIGHT / 2;

      ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      // Handle wrap-around: draw shortest path
      const directDist = Math.abs(markerX - anchorX);
      const wrapDist = w - directDist;
      if (directDist <= wrapDist) {
        ctx.moveTo(anchorX, laneMidY);
        ctx.lineTo(markerX, laneMidY);
      } else {
        // Wrap around
        if (markerX > anchorX) {
          ctx.moveTo(anchorX, laneMidY);
          ctx.lineTo(0, laneMidY);
          ctx.moveTo(w, laneMidY);
          ctx.lineTo(markerX, laneMidY);
        } else {
          ctx.moveTo(anchorX, laneMidY);
          ctx.lineTo(w, laneMidY);
          ctx.moveTo(0, laneMidY);
          ctx.lineTo(markerX, laneMidY);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // ─ Gradient bands with envelope shape ─
      for (const seg of voice.rangeSegments) {
        const segX = seg.left * w;
        const segW = seg.width * w;
        if (segW < 1) continue;

        const bandH = voice.rangeHeight;
        const bandY = laneY + voice.bandTopOffset;

        // Create gradient with envelope shape
        const attackFrac = Math.min(0.3, voice.attack * 0.5);
        const decayFrac = Math.min(0.3, voice.decay * 0.5);

        const grad = ctx.createLinearGradient(segX, 0, segX + segW, 0);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(Math.min(attackFrac, 0.49), `rgba(${r},${g},${b},${voice.rangeOpacity})`);
        grad.addColorStop(Math.max(1 - decayFrac, 0.51), `rgba(${r},${g},${b},${voice.rangeOpacity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grad;
        // Rounded rectangle
        const cr = Math.min(bandH / 2, 6);
        ctx.beginPath();
        ctx.moveTo(segX + cr, bandY);
        ctx.lineTo(segX + segW - cr, bandY);
        ctx.quadraticCurveTo(segX + segW, bandY, segX + segW, bandY + cr);
        ctx.lineTo(segX + segW, bandY + bandH - cr);
        ctx.quadraticCurveTo(segX + segW, bandY + bandH, segX + segW - cr, bandY + bandH);
        ctx.lineTo(segX + cr, bandY + bandH);
        ctx.quadraticCurveTo(segX, bandY + bandH, segX, bandY + bandH - cr);
        ctx.lineTo(segX, bandY + cr);
        ctx.quadraticCurveTo(segX, bandY, segX + cr, bandY);
        ctx.closePath();
        ctx.fill();
      }

      // ─ Anchor marker (dashed vertical line) ─
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(anchorX, laneY - 1);
      ctx.lineTo(anchorX, laneY + VOICE_LANE_HEIGHT + 1);
      ctx.stroke();
      ctx.setLineDash([]);

      // ─ 6. Voice markers — only for clean mode (granular/legacy use particles instead) ─
      if (voice.mode === 'clean') {
        for (let mi = 0; mi < voice.markerPositions.length; mi++) {
          const mPos = voice.markerPositions[mi]!;
          const mx = mPos * w;
          const my = laneMidY;
          const markerSize = 4.5;

          // Circle marker
          ctx.fillStyle = voice.color;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(mx, my, markerSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Direction arrow on marker (only first marker)
          if (mi === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 7px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (voice.motionMode === 'scan') {
              ctx.fillText('↔', mx, my);
            } else if (voice.reverse) {
              ctx.fillText('◁', mx, my);
            } else {
              ctx.fillText('▷', mx, my);
            }

            // Voice label above marker
            ctx.fillStyle = 'rgba(255,255,255,0.72)';
            ctx.font = '6.5px system-ui';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`V${voice.index + 1}`, mx, laneY - 1);
          }
        }
      } else {
        // Granular/legacy: just show voice label at current position
        const mx = voice.currentPos * w;
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.font = '6.5px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`V${voice.index + 1}`, mx, laneY - 1);
      }

      // ─ 9. Inline badge: mode + key param ─
      const badgeText = buildBadgeText(voice);
      if (badgeText) {
        // Position badge at right end of first range segment
        const firstSeg = voice.rangeSegments[0];
        if (firstSeg) {
          const bx = Math.min((firstSeg.left + firstSeg.width) * w - 2, w - 4);
          const by = laneY + 1;
          ctx.font = '6px system-ui';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          // Background pill
          const tw = ctx.measureText(badgeText).width + 6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          roundRect(ctx, bx - tw, by, tw, 10, 3);
          ctx.fill();
          ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
          ctx.fillText(badgeText, bx - 3, by + 1.5);
        }
      }

      // ─ Tempo badge ─
      if (voice.tempoLabel) {
        const tx = w - 4;
        const ty = laneY + VOICE_LANE_HEIGHT - 12;
        ctx.font = '6px system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const tw = ctx.measureText(voice.tempoLabel).width + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(ctx, tx - tw, ty, tw, 10, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        roundRect(ctx, tx - tw, ty, tw, 10, 3);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(voice.tempoLabel, tx - 3, ty + 1.5);
      }
    });

    // ── 7. Write head with trailing glow ──
    const whTrail = writeHeadTrailRef.current;
    whTrail.push(wh);
    if (whTrail.length > WRITE_HEAD_TRAIL_LEN) whTrail.shift();

    // Trail segments
    for (let i = 0; i < whTrail.length - 1; i++) {
      const alpha = (i / whTrail.length) * 0.2;
      const tx = whTrail[i]! * w;
      ctx.strokeStyle = frozen
        ? `rgba(59,130,246,${alpha})`
        : `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      ctx.lineTo(tx, h);
      ctx.stroke();
    }

    // Main write head line
    const whX = wh * w;
    if (frozen) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(59,130,246,0.5)';
      ctx.shadowBlur = 4;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.moveTo(whX, 0);
    ctx.lineTo(whX, h);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // ── 8. Grain spawn particles ──
    // For granular/legacy: spawn white particles when voice position changes (grain spawns)
    // For clean mode: no particles (continuous read head shown by marker instead)
    const prevPositions = prevVoicePosRef.current;
    const particles = particlesRef.current;
    for (let vi = 0; vi < vs.length; vi++) {
      const v = vs[vi]!;
      if (v.mode === 'clean') continue; // clean uses marker, not particles
      if (particles.length >= MAX_PARTICLES) break;
      const prevPos = prevPositions[vi] ?? -1;
      const posDelta = Math.abs(v.currentPos - prevPos);
      if (posDelta > POS_CHANGE_THRESHOLD) {
        const py = LANES_TOP + vi * (VOICE_LANE_HEIGHT + LANE_GAP) + VOICE_LANE_HEIGHT / 2;
        particles.push({
          x: v.currentPos * w,
          y: py,
          color: '#ffffff',
          born: now,
        });
      }
    }
    prevGrainCountRef.current = gc;
    prevVoicePosRef.current = vs.map(v => v.currentPos);

    // Draw and age particles — white glow for visibility against colored bands
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      const age = now - p.born;
      if (age > PARTICLE_LIFETIME) {
        particles.splice(i, 1);
        continue;
      }
      const life = 1 - age / PARTICLE_LIFETIME;
      const radius = 2 + (1 - life) * 4;
      ctx.fillStyle = `rgba(255,255,255,${life * 0.6})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 10. Sparkline (grain count history) ──
    const grainHist = grainHistoryRef.current;
    grainHist.push(gc);
    if (grainHist.length > GRAIN_HISTORY_LEN) grainHist.shift();

    if (grainHist.length > 2) {
      const maxGrains = Math.max(1, ...grainHist);
      const sparkX = w - SPARKLINE_WIDTH - SPARKLINE_RIGHT_PAD;
      const sparkY = 1;
      const sparkH = SPARKLINE_HEIGHT - 2;
      const sparkW = SPARKLINE_WIDTH;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, sparkX - 2, sparkY - 1, sparkW + 4, sparkH + 3, 3);
      ctx.fill();

      // Line
      ctx.strokeStyle = 'rgba(6,182,212,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < grainHist.length; i++) {
        const gx = sparkX + (i / (grainHist.length - 1)) * sparkW;
        const gy = sparkY + sparkH - (grainHist[i]! / maxGrains) * sparkH;
        if (i === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      }
      ctx.stroke();

      // Fill under the line
      ctx.lineTo(sparkX + sparkW, sparkY + sparkH);
      ctx.lineTo(sparkX, sparkY + sparkH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(6,182,212,0.08)';
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '6px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${gc}g`, sparkX + sparkW, sparkY + sparkH + 1);
    }

    // ── 13. Time scale ticks ──
    const ticks = bSec <= 4 ? [0, 1, 2, 3, 4] : [0, 4, 8, 12, 16];
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '6px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const t of ticks) {
      const tx = (t / bSec) * w;
      ctx.fillText(`${t}s`, tx, h - 1);
    }

    if (isRunningRef.current && document.visibilityState === 'visible') {
      animFrameRef.current = requestAnimationFrame(draw);
    } else {
      animFrameRef.current = 0;
    }
  }, [measuredWidth, height, numSlices]);

  const requestDraw = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    requestDraw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    requestDraw,
    isRunning,
    voices,
    writeHeadPosition,
    activeGrainCount,
    bufferWaveform,
    bufferSeconds,
    isFrozen,
    activeSlices,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
        }
        return;
      }
      requestDraw();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestDraw]);

  // ── 11. Slice click-to-assign ──
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSliceClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const sliceIdx = Math.floor((x / rect.width) * numSlices);
    if (sliceIdx >= 0 && sliceIdx < numSlices) {
      onSliceClick(sliceIdx);
    }
  }, [onSliceClick, numSlices]);

  return (
    <div ref={containerRef} className="granular-buffer-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="granular-buffer-canvas"
        style={{ width: measuredWidth || '100%', height }}
        onClick={handleCanvasClick}
        title="Click a slice to assign it to the selected voice"
      />
    </div>
  );
};

// ═══════════════ Drawing Helpers ═══════════════

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  wf: Float32Array,
  w: number,
  midY: number,
  areaH: number,
  color: string,
) {
  const bins = wf.length;
  if (bins === 0) return;

  ctx.fillStyle = color;
  ctx.beginPath();

  // Top half (positive peaks)
  ctx.moveTo(0, midY);
  for (let i = 0; i < bins; i++) {
    const x = (i / bins) * w;
    const peak = Math.min(wf[i]!, 1);
    const y = midY - peak * (areaH * 0.45);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, midY);

  // Bottom half (mirror)
  for (let i = bins - 1; i >= 0; i--) {
    const x = (i / bins) * w;
    const peak = Math.min(wf[i]!, 1);
    const y = midY + peak * (areaH * 0.45);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function buildBadgeText(voice: CanvasVoiceVisual): string {
  if (voice.mode === 'clean') {
    if (voice.motionMode === 'scan') {
      return `scan ${voice.scanRate.toFixed(1)}×`;
    }
    return `${voice.speed >= 0 ? '' : '-'}${Math.abs(voice.speed).toFixed(1)}×`;
  }
  if (voice.mode === 'granular') {
    return 'grain';
  }
  return 'legacy';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default GranularBufferCanvas;
