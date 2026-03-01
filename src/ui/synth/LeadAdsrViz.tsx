/**
 * LeadAdsrViz — Interactive canvas-based ADSR envelope visualization for the Lead synth.
 * Drag handles at A, D, S (vertical), R breakpoints to adjust envelope params.
 * Matches the look & feel of the pad synth's FilterLfoViz envelope section.
 */
import React, { useRef, useEffect, useCallback } from 'react';

interface LeadAdsrVizProps {
  attack: number;
  decay: number;
  sustain: number;  // 0..1
  hold: number;
  release: number;
  accentColor: string;   // e.g. '#f59e0b' or '#06b6d4'
  accentRgba: string;    // e.g. 'rgba(245,158,11,' (no closing paren)
  onChange?: (param: string, value: number) => void;
  disabled?: boolean;    // when true, show envelope but no drag handles
  paramPrefix?: 'lead1' | 'lead2';  // which lead's params to emit (default 'lead1')
}

type DragTarget = 'attack' | 'decay' | 'sustain' | 'hold' | 'release' | null;
const DRAG_HIT_PX = 12;

const LeadAdsrViz: React.FC<LeadAdsrVizProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ target: DragTarget; startX: number; startY: number }>({ target: null, startX: 0, startY: 0 });
  const hoverRef = useRef<DragTarget>(null);
  const layoutRef = useRef({ w: 0, h: 0 });

  // ── Draw ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    layoutRef.current = { w, h };

    ctx.clearRect(0, 0, w, h);

    const { attack: a, decay: d, sustain: s, hold, release: r, accentColor, accentRgba, disabled } = props;
    const pad = 6;         // padding from edges
    const envY = pad;
    const envH = h - pad * 2;

    // Time segments
    const totalTime = Math.max(0.01, a + d + hold + r) + 0.05; // small tail
    const ax = pad + (a / totalTime) * (w - pad * 2);
    const dx = pad + ((a + d) / totalTime) * (w - pad * 2);
    const hx = pad + ((a + d + hold) / totalTime) * (w - pad * 2);
    const endX = w - pad;

    // Y positions
    const topY = envY + 4;
    const botY = envY + envH - 4;
    const sustainLineY = botY - s * (envH - 8);

    // ── Fill ──
    ctx.beginPath();
    ctx.moveTo(pad, botY);
    ctx.lineTo(ax, topY);
    ctx.lineTo(dx, sustainLineY);
    ctx.lineTo(hx, sustainLineY);
    ctx.lineTo(endX, botY);
    ctx.lineTo(pad, botY);
    ctx.closePath();
    ctx.fillStyle = `${accentRgba}0.08)`;
    ctx.fill();

    // ── Stroke ──
    ctx.beginPath();
    ctx.moveTo(pad, botY);
    ctx.lineTo(ax, topY);
    ctx.lineTo(dx, sustainLineY);
    ctx.lineTo(hx, sustainLineY);
    ctx.lineTo(endX, botY);
    ctx.strokeStyle = `${accentRgba}0.85)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Phase divider lines ──
    ctx.strokeStyle = `${accentRgba}0.15)`;
    ctx.lineWidth = 0.5;
    for (const px of [ax, dx, hx]) {
      ctx.beginPath();
      ctx.moveTo(px, envY + 2);
      ctx.lineTo(px, envY + envH - 2);
      ctx.stroke();
    }

    // ── Phase labels ──
    ctx.font = '9px monospace';
    ctx.fillStyle = `${accentRgba}0.4)`;
    const labelY = envY + 13;
    if (ax - pad > 14) ctx.fillText('A', (pad + ax) / 2 - 3, labelY);
    if (dx - ax > 14) ctx.fillText('D', (ax + dx) / 2 - 3, labelY);
    if (hx - dx > 14) ctx.fillText('H', (dx + hx) / 2 - 3, labelY);
    if (endX - hx > 14) ctx.fillText('R', (hx + endX) / 2 - 3, labelY);

    // ── Value labels ──
    ctx.font = '8px monospace';
    ctx.fillStyle = `${accentRgba}0.5)`;
    ctx.textAlign = 'center';
    // Attack value
    if (ax - pad > 20) ctx.fillText(`${a.toFixed(a < 0.1 ? 3 : 2)}s`, (pad + ax) / 2, botY - 3);
    // Decay value
    if (dx - ax > 20) ctx.fillText(`${d.toFixed(2)}s`, (ax + dx) / 2, botY - 3);
    // Hold value
    if (hx - dx > 20) ctx.fillText(`${hold.toFixed(2)}s`, (dx + hx) / 2, botY - 3);
    // Sustain level
    const sMidX = (dx + hx) / 2;
    ctx.fillText(`${Math.round(s * 100)}%`, sMidX, sustainLineY - 6);
    // Release value
    if (endX - hx > 20) ctx.fillText(`${r.toFixed(2)}s`, (hx + endX) / 2, botY - 3);
    ctx.textAlign = 'start';

    // ── Label ──
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('ENVELOPE', 4, envY + envH - 3);

    // ── Drag handles ──
    if (!disabled && props.onChange) {
      const drawHandle = (x: number, y: number, target: DragTarget, color: string) => {
        const isHover = hoverRef.current === target;
        const isDrag = dragRef.current.target === target;
        const radius = isDrag ? 7 : isHover ? 6 : 4.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isDrag ? 0.9 : isHover ? 0.7 : 0.35;
        ctx.fill();
        if (isHover || isDrag) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      // Attack handle (top of attack peak)
      drawHandle(ax, topY, 'attack', accentColor);
      // Decay handle (end of decay at sustain level)
      drawHandle(dx, sustainLineY, 'decay', accentColor);
      // Sustain handle (middle of sustain phase, vertical drag)
      drawHandle(sMidX, sustainLineY, 'sustain', accentColor);
      // Hold handle (end of hold phase)
      drawHandle(hx, sustainLineY, 'hold', accentColor);
      // Release handle (end of release at bottom)
      drawHandle(endX, botY, 'release', accentColor);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [props]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // ── Hit test ──
  const hitTest = useCallback((cx: number, cy: number): DragTarget => {
    const { w, h } = layoutRef.current;
    if (w === 0 || props.disabled || !props.onChange) return null;

    const pad = 6;
    const envY = pad;
    const envH = h - pad * 2;
    const { attack: a, decay: d, sustain: s, hold, release: r } = props;
    const totalTime = Math.max(0.01, a + d + hold + r) + 0.05;

    const ax = pad + (a / totalTime) * (w - pad * 2);
    const dx = pad + ((a + d) / totalTime) * (w - pad * 2);
    const hx = pad + ((a + d + hold) / totalTime) * (w - pad * 2);
    const endX = w - pad;

    const topY = envY + 4;
    const botY = envY + envH - 4;
    const sustainLineY = botY - s * (envH - 8);
    const sMidX = (dx + hx) / 2;

    if (Math.abs(cx - ax) < DRAG_HIT_PX && Math.abs(cy - topY) < DRAG_HIT_PX) return 'attack';
    if (Math.abs(cx - dx) < DRAG_HIT_PX && Math.abs(cy - sustainLineY) < DRAG_HIT_PX) return 'decay';
    if (Math.abs(cx - sMidX) < DRAG_HIT_PX && cy > envY && cy < envY + envH) return 'sustain';
    if (Math.abs(cx - hx) < DRAG_HIT_PX && Math.abs(cy - sustainLineY) < DRAG_HIT_PX) return 'hold';
    if (Math.abs(cx - endX) < DRAG_HIT_PX && Math.abs(cy - botY) < DRAG_HIT_PX) return 'release';
    return null;
  }, [props]);

  // ── Coords from event ──
  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? (e as React.TouchEvent).changedTouches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Apply drag ──
  const applyDrag = useCallback((cx: number, cy: number) => {
    const { w, h } = layoutRef.current;
    if (w === 0 || !props.onChange) return;
    const target = dragRef.current.target;

    const pad = 6;
    const envY = pad;
    const envH = h - pad * 2;
    const usableW = w - pad * 2;
    const { attack: a, decay: d, sustain: _s, hold, release: r } = props;
    const totalTime = Math.max(0.01, a + d + hold + r) + 0.05;

    const xToTime = (x: number) => Math.max(0, ((x - pad) / usableW) * totalTime);
    const pfx = props.paramPrefix ?? 'lead1';

    if (target === 'attack') {
      const newA = Math.max(0.001, Math.min(2, xToTime(cx)));
      props.onChange(`${pfx}Attack`, parseFloat(newA.toFixed(3)));
    } else if (target === 'decay') {
      const tAtX = xToTime(cx);
      const newD = Math.max(0.01, Math.min(4, tAtX - a));
      props.onChange(`${pfx}Decay`, parseFloat(newD.toFixed(2)));
    } else if (target === 'sustain') {
      const relY = (cy - envY - 4) / (envH - 8);
      const newS = Math.max(0, Math.min(1, 1 - relY));
      props.onChange(`${pfx}Sustain`, parseFloat(newS.toFixed(2)));
    } else if (target === 'hold') {
      const tAtX = xToTime(cx);
      const newH = Math.max(0, Math.min(4, tAtX - a - d));
      props.onChange(`${pfx}Hold`, parseFloat(newH.toFixed(2)));
    } else if (target === 'release') {
      const tAtX = xToTime(cx);
      const sustainEnd = a + d + hold;
      const newR = Math.max(0.01, Math.min(8, tAtX - sustainEnd));
      props.onChange(`${pfx}Release`, parseFloat(newR.toFixed(2)));
    }
  }, [props]);

  // ── Pointer handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCoords(e);
    const target = hitTest(x, y);
    if (target) {
      e.preventDefault();
      dragRef.current = { target, startX: x, startY: y };
    }
  }, [getCoords, hitTest]);

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
  }, [getCoords, hitTest, applyDrag]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { target: null, startX: 0, startY: 0 };
  }, []);

  // Native non-passive touch listeners (React registers touch listeners as passive)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getXY = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0] ?? e.changedTouches[0];
      return { x: (t?.clientX ?? 0) - rect.left, y: (t?.clientY ?? 0) - rect.top };
    };
    const onTouchStart = (e: TouchEvent) => {
      const { x, y } = getXY(e);
      const target = hitTest(x, y);
      if (target) {
        e.preventDefault();
        dragRef.current = { target, startX: x, startY: y };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current.target) {
        e.preventDefault();
        const { x, y } = getXY(e);
        applyDrag(x, y);
      }
    };
    const onTouchEnd = () => {
      dragRef.current = { target: null, startX: 0, startY: 0 };
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [hitTest, applyDrag]);

  // Global mouse/touch up listener for drag release
  useEffect(() => {
    const handleGlobalUp = () => {
      dragRef.current = { target: null, startX: 0, startY: 0 };
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, []);

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
