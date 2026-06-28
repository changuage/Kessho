/**
 * LeadAdsrViz - interactive canvas-based ADSR envelope visualization for lead sources.
 * Drag handles at A, D, S, H, and R breakpoints to adjust envelope params.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';
import {
  colorWithAlpha,
  createEnvelopeTimeScale,
  envelopeValue,
  formatEnvelopeSustainLabel,
  formatEnvelopeTimeLabel,
  getEnvelopeTimelineSeconds,
  quantizeEnvelopeTime,
} from './envelopeVizMath';

interface LeadAdsrVizProps {
  attack: number;
  decay: number;
  sustain: number;
  hold: number;
  release: number;
  accentColor: string;
  accentRgba?: string;
  envelopeTimelineSeconds?: number;
  onChange?: (param: string, value: number) => void;
  disabled?: boolean;
  paramPrefix?: 'lead1' | 'lead2' | 'piano' | 'sample1' | 'sample2';
}

type DragTarget = 'attack' | 'decay' | 'sustain' | 'hold' | 'release' | null;

type EnvelopeGeometry = {
  envY: number;
  envH: number;
  topY: number;
  botY: number;
  ax: number;
  dx: number;
  hx: number;
  rx: number;
  sustainLineY: number;
  sustainMidX: number;
  xToTime: (x: number) => number;
};

const DRAG_HIT_PX = 10;
const PAD_ENVELOPE_LIMITS = {
  attack: { min: 0.001, max: 16 },
  decay: { min: 0.01, max: 8 },
  hold: { min: 0, max: 20 },
  release: { min: 0.01, max: 30 },
} as const;
const PIANO_ENVELOPE_LIMITS = {
  attack: { min: 0.001, max: 2 },
  decay: { min: 0.01, max: 4 },
  hold: { min: 0, max: 4 },
  release: { min: 0.01, max: 8 },
} as const;

function getEnvelopeGeometry(
  width: number,
  height: number,
  props: Pick<LeadAdsrVizProps, 'attack' | 'decay' | 'sustain' | 'hold' | 'release' | 'envelopeTimelineSeconds'>,
): EnvelopeGeometry {
  const envY = 0;
  const envH = height;
  const topY = envY + 4;
  const botY = envY + envH - 4;
  const envEndTime = Math.max(0.001, props.attack + props.decay + props.hold + props.release);
  const envelopeScale = createEnvelopeTimeScale(
    width,
    getEnvelopeTimelineSeconds(props.envelopeTimelineSeconds, envEndTime + 0.1),
  );
  const ax = envelopeScale.timeToX(props.attack);
  const dx = envelopeScale.timeToX(props.attack + props.decay);
  const hx = envelopeScale.timeToX(props.attack + props.decay + props.hold);
  const rx = envelopeScale.timeToX(props.attack + props.decay + props.hold + props.release);
  const sustainLineY = botY - props.sustain * (envH - 8);
  return {
    envY,
    envH,
    topY,
    botY,
    ax,
    dx,
    hx,
    rx,
    sustainLineY,
    sustainMidX: (dx + hx) * 0.5,
    xToTime: envelopeScale.xToTime,
  };
}

const LeadAdsrViz: React.FC<LeadAdsrVizProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ target: DragTarget; startX: number; startY: number }>({ target: null, startX: 0, startY: 0 });
  const hoverRef = useRef<DragTarget>(null);
  const layoutRef = useRef({ w: 0, h: 0 });
  const { canAnimate } = useAnimationVisibility(canvasRef, { rootMargin: '120px' });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getCappedCanvasDpr();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const bitmapW = Math.round(w * dpr);
    const bitmapH = Math.round(h * dpr);
    if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
      canvas.width = bitmapW;
      canvas.height = bitmapH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutRef.current = { w, h };

    ctx.clearRect(0, 0, w, h);

    const { attack: a, decay: d, sustain: s, hold, release: r, accentColor, accentRgba, disabled } = props;
    const accent = (alpha: number) => colorWithAlpha(accentRgba ?? accentColor, alpha);
    const geometry = getEnvelopeGeometry(w, h, props);
    const { envY, envH, topY, botY, ax, dx, hx, rx, sustainLineY, sustainMidX, xToTime } = geometry;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.roundRect(0, envY, w, envH, 4);
    ctx.fill();

    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const t = xToTime(px);
      const env = envelopeValue(t, a, d, s, hold, r);
      const y = botY - env * (envH - 8);
      px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 0.06;
    ctx.lineTo(w, envY + envH);
    ctx.lineTo(0, envY + envH);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = accent(0.15);
    ctx.lineWidth = 0.5;
    for (const px of [ax, dx, hx, rx]) {
      ctx.beginPath();
      ctx.moveTo(px, envY + 2);
      ctx.lineTo(px, envY + envH - 2);
      ctx.stroke();
    }

    ctx.font = '7px monospace';
    const labelBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const drawEnvelopeLabel = (label: string, x: number, baselineY: number, color: string) => {
      ctx.font = '7px monospace';
      const paddingX = 3;
      const labelH = 9;
      const labelW = ctx.measureText(label).width + paddingX * 2;
      const clampedLeft = Math.max(2, Math.min(w - labelW - 2, x - labelW * 0.5));
      const baseTop = Math.max(envY + 2, Math.min(envY + envH - labelH - 6, baselineY - labelH + 1));
      let top = baseTop;
      for (let row = 0; row < 3; row++) {
        const candidateTop = Math.min(envY + envH - labelH - 6, baseTop + row * (labelH + 1));
        const candidate = {
          left: clampedLeft,
          top: candidateTop,
          right: clampedLeft + labelW,
          bottom: candidateTop + labelH,
        };
        const overlaps = labelBoxes.some((box) => !(
          candidate.right < box.left ||
          candidate.left > box.right ||
          candidate.bottom < box.top ||
          candidate.top > box.bottom
        ));
        if (!overlaps || row === 2) {
          top = candidateTop;
          labelBoxes.push(candidate);
          break;
        }
      }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.roundRect(clampedLeft, top, labelW, labelH, 3);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, clampedLeft + paddingX, top + labelH - 2);
    };

    const activeDragTarget = dragRef.current.target;
    if (activeDragTarget === 'decay') {
      drawEnvelopeLabel(`D=${formatEnvelopeTimeLabel(a + d)}`, dx, sustainLineY - 4, 'rgba(255,255,255,0.62)');
    } else if (activeDragTarget === 'hold') {
      drawEnvelopeLabel(`H=${formatEnvelopeTimeLabel(a + d + hold)}`, hx, sustainLineY - 4, 'rgba(255,255,255,0.62)');
    } else if (activeDragTarget === 'release') {
      drawEnvelopeLabel(`R=${formatEnvelopeTimeLabel(a + d + hold + r)}`, rx, botY - 4, 'rgba(255,255,255,0.62)');
    }
    drawEnvelopeLabel(`A ${formatEnvelopeTimeLabel(a)}`, ax * 0.5, envY + 12, accent(0.72));
    drawEnvelopeLabel(`D ${formatEnvelopeTimeLabel(d)}`, (ax + dx) * 0.5, envY + 12, accent(0.66));
    drawEnvelopeLabel(`H ${formatEnvelopeTimeLabel(hold)}`, (dx + hx) * 0.5, envY + 12, accent(0.66));
    drawEnvelopeLabel(`R ${formatEnvelopeTimeLabel(r)}`, (hx + rx) * 0.5, envY + 12, accent(0.66));
    drawEnvelopeLabel(
      `S ${formatEnvelopeSustainLabel(s)}`,
      sustainMidX,
      sustainLineY - 2,
      'rgba(255,255,255,0.54)',
    );

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '8px monospace';
    ctx.fillText('AMP ENV', 4, envY + envH - 3);

    if (!disabled && props.onChange) {
      const drawHandle = (x: number, y: number, target: DragTarget) => {
        const isHover = hoverRef.current === target;
        const isDrag = dragRef.current.target === target;
        const radius = isDrag ? 6 : isHover ? 5.5 : 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = isDrag ? 0.9 : isHover ? 0.7 : 0.35;
        ctx.fill();
        if (isHover || isDrag) {
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      drawHandle(ax, topY, 'attack');
      drawHandle(dx, sustainLineY, 'decay');
      drawHandle(sustainMidX, sustainLineY, 'sustain');
      drawHandle(hx, sustainLineY, 'hold');
      drawHandle(rx, botY, 'release');
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [props]);

  const requestDraw = useCallback(() => {
    if (!canAnimate) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(() => {
      animRef.current = 0;
      draw();
    });
  }, [canAnimate, draw]);

  useEffect(() => {
    requestDraw();
  }, [requestDraw, canAnimate]);

  useEffect(() => {
    const handleResize = () => requestDraw();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [requestDraw]);

  const hitTest = useCallback((cx: number, cy: number): DragTarget => {
    const { w, h } = layoutRef.current;
    if (w === 0 || props.disabled || !props.onChange) return null;

    const { envY, envH, topY, botY, ax, dx, hx, rx, sustainLineY, sustainMidX } = getEnvelopeGeometry(w, h, props);
    const inEnvelopeY = cy > envY && cy < envY + envH;

    if (Math.abs(cx - ax) < DRAG_HIT_PX && (inEnvelopeY || Math.abs(cy - topY) < DRAG_HIT_PX)) return 'attack';
    if (Math.abs(cx - dx) < DRAG_HIT_PX && (inEnvelopeY || Math.abs(cy - sustainLineY) < DRAG_HIT_PX)) return 'decay';
    if (Math.abs(cx - hx) < DRAG_HIT_PX && inEnvelopeY) return 'hold';
    if (Math.abs(cx - rx) < DRAG_HIT_PX && (inEnvelopeY || Math.abs(cy - botY) < DRAG_HIT_PX)) return 'release';
    if (Math.abs(cx - sustainMidX) < DRAG_HIT_PX && inEnvelopeY) return 'sustain';
    return null;
  }, [props]);

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? (e as React.TouchEvent).changedTouches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const applyDrag = useCallback((cx: number, cy: number) => {
    const { w, h } = layoutRef.current;
    if (w === 0 || !props.onChange) return;
    const target = dragRef.current.target;
    const { envY, envH, xToTime } = getEnvelopeGeometry(w, h, props);
    const { attack: a, decay: d, hold } = props;
    const tAtX = xToTime(cx);
    const paramPrefix = props.paramPrefix ?? 'lead1';
    const samplePrefix = paramPrefix === 'sample1' || paramPrefix === 'sample2';
    const limits = paramPrefix === 'piano' || samplePrefix ? PIANO_ENVELOPE_LIMITS : PAD_ENVELOPE_LIMITS;
    const emitEnvelopeChange = (suffix: 'Attack' | 'Decay' | 'Sustain' | 'Hold' | 'Release', value: number) => {
      if (samplePrefix) {
        const key = suffix === 'Sustain' ? `${paramPrefix}${suffix}` : `${paramPrefix}${suffix}Ms`;
        props.onChange?.(key, suffix === 'Sustain' ? value : Math.round(value * 1000));
        return;
      }
      props.onChange?.(`${paramPrefix}${suffix}`, value);
    };

    if (target === 'attack') {
      const newAttack = Math.max(limits.attack.min, Math.min(limits.attack.max, tAtX));
      emitEnvelopeChange('Attack', quantizeEnvelopeTime(newAttack));
    } else if (target === 'decay') {
      const newDecay = Math.max(limits.decay.min, Math.min(limits.decay.max, tAtX - a));
      emitEnvelopeChange('Decay', quantizeEnvelopeTime(newDecay));
    } else if (target === 'sustain') {
      const relY = (cy - envY - 4) / (envH - 8);
      const newSustain = Math.max(0, Math.min(1, 1 - relY));
      emitEnvelopeChange('Sustain', parseFloat(newSustain.toFixed(2)));
    } else if (target === 'hold') {
      const newHold = Math.max(limits.hold.min, Math.min(limits.hold.max, tAtX - a - d));
      emitEnvelopeChange('Hold', quantizeEnvelopeTime(newHold));
    } else if (target === 'release') {
      const releaseStart = a + d + hold;
      const newRelease = Math.max(limits.release.min, Math.min(limits.release.max, tAtX - releaseStart));
      emitEnvelopeChange('Release', quantizeEnvelopeTime(newRelease));
    }
  }, [props]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCoords(e);
    const target = hitTest(x, y);
    if (target) {
      e.preventDefault();
      dragRef.current = { target, startX: x, startY: y };
      requestDraw();
    }
  }, [getCoords, hitTest, requestDraw]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCoords(e);
    if (dragRef.current.target) {
      e.preventDefault();
      applyDrag(x, y);
    } else {
      const target = hitTest(x, y);
      hoverRef.current = target;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = target
          ? (target === 'sustain' ? 'ns-resize' : 'ew-resize')
          : 'default';
      }
    }
    requestDraw();
  }, [getCoords, hitTest, applyDrag, requestDraw]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { target: null, startX: 0, startY: 0 };
    requestDraw();
  }, [requestDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getXY = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0] ?? e.changedTouches[0];
      return { x: (touch?.clientX ?? 0) - rect.left, y: (touch?.clientY ?? 0) - rect.top };
    };
    const onTouchStart = (e: TouchEvent) => {
      const { x, y } = getXY(e);
      const target = hitTest(x, y);
      if (target) {
        e.preventDefault();
        dragRef.current = { target, startX: x, startY: y };
        requestDraw();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current.target) {
        e.preventDefault();
        const { x, y } = getXY(e);
        applyDrag(x, y);
        requestDraw();
      }
    };
    const onTouchEnd = () => {
      dragRef.current = { target: null, startX: 0, startY: 0 };
      requestDraw();
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [hitTest, applyDrag, requestDraw]);

  useEffect(() => {
    const handleGlobalUp = () => {
      dragRef.current = { target: null, startX: 0, startY: 0 };
      requestDraw();
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [requestDraw]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { hoverRef.current = null; handleMouseUp(); }}
      style={{
        width: '100%',
        height: '90px',
        borderRadius: '8px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'block',
        marginTop: '8px',
        touchAction: 'none',
      }}
    />
  );
};

export default LeadAdsrViz;
