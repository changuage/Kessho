/**
 * FilterLfoViz — Real-time canvas visualization showing:
 *   1. Filter A/B response curves driven by engine's live filter frequency
 *   2. ADSR amplitude envelope shape (from params) plus optional mod envelope overlay
 *   3. LFO strip showing the engine's real LFO output value
 *
 * Interactive: drag filter min/max markers, drag ADSR breakpoints.
 * All live data comes from the engine via props — no local simulation.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';

interface FilterLfoVizProps {
  filterAType: string;
  filterACutoff: number;      // midpoint of min/max (static reference)
  filterARes: number;
  filterAQ: number;
  filterASlope?: number;
  hardness: number;           // needed for accurate Q calculation
  filterBEnabled: boolean;
  filterBType: string;
  filterBCutoff: number;
  filterBRes: number;
  filterRouting: string;
  lfoWave: string;
  lfoRate: number;
  lfoDepth: number;
  lfoDest: string;
  filterCutoffMin: number;
  filterCutoffMax: number;
  postLpfHz?: number;
  synthAttack: number;
  synthDecay: number;
  synthSustain: number;
  synthRelease: number;
  modEnvEnabled?: boolean;
  modEnvAttack?: number;
  modEnvDecay?: number;
  modEnvSustain?: number;
  modEnvRelease?: number;
  modEnvDepth?: number;
  modEnvDest?: string;
  liveFilterFreq: number;     // real engine filter frequency
  liveLfoValue: number;       // real engine LFO output (-1..+1 after depth)
  isRunning: boolean;
  /** Callbacks for interactive dragging */
  onFilterMinChange?: (value: number) => void;
  onFilterMaxChange?: (value: number) => void;
  onAdsrChange?: (param: 'synthAttack' | 'synthDecay' | 'synthSustain' | 'synthRelease', value: number) => void;
  onModEnvChange?: (param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => void;
}

// Approximate filter magnitude response at a given frequency
// Uses the same effectiveQ formula as the audio engine
function filterGain(freq: number, cutoff: number, res: number, q: number, type: string, hardness: number, slope = 12): number {
  const ratio = freq / Math.max(1, cutoff);
  const resonanceBoost = res * (0.7 + hardness * 0.6);
  const lowCutoffBoost = cutoff < 200 ? (1 - cutoff / 200) * 4 : 0;
  const Q = Math.max(0.5, q + resonanceBoost * 8 + lowCutoffBoost);
  const denom = Math.sqrt((1 - ratio * ratio) ** 2 + (ratio / Q) ** 2);
  const baseGain = (() => {
    switch (type) {
      case 'highpass': return (ratio * ratio) / denom;
      case 'bandpass': return (ratio / Q) / denom;
      case 'notch': return Math.sqrt((1 - ratio * ratio) ** 2) / denom;
      default: return 1 / denom; // lowpass
    }
  })();
  const stages = Math.max(1, Math.min(4, Math.round(slope / 12)));
  if (stages === 1) return baseGain;
  const neutralQ = Math.min(Q, 0.707);
  const neutralDenom = Math.sqrt((1 - ratio * ratio) ** 2 + (ratio / neutralQ) ** 2);
  const neutralGain = (() => {
    switch (type) {
      case 'highpass': return (ratio * ratio) / neutralDenom;
      case 'bandpass': return (ratio / neutralQ) / neutralDenom;
      case 'notch': return Math.sqrt((1 - ratio * ratio) ** 2) / neutralDenom;
      default: return 1 / neutralDenom;
    }
  })();
  return baseGain * Math.pow(neutralGain, stages - 1);
}

// Compute LFO waveform shape for static preview (when stopped)
function lfoShapeValue(phase: number, wave: string): number {
  const p = ((phase % 1) + 1) % 1;
  switch (wave) {
    case 'sine': return Math.sin(p * Math.PI * 2);
    case 'triangle': return 1 - 4 * Math.abs(p - 0.5);
    case 'sawtooth': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    default: return Math.sin(p * Math.PI * 2);
  }
}

// Compute ADSR envelope value at time t (illustrative shape from params)
function adsrValue(t: number, a: number, d: number, s: number, r: number, noteLen: number): number {
  if (t < 0) return 0;
  if (t < a) return t / Math.max(0.001, a);
  const tAfterA = t - a;
  if (tAfterA < d) return 1 - (1 - s) * (tAfterA / Math.max(0.001, d));
  const sustainEnd = noteLen - r;
  if (t < sustainEnd) return s;
  const tInRelease = t - sustainEnd;
  if (tInRelease < r) return s * (1 - tInRelease / Math.max(0.001, r));
  return 0;
}

function loopingModEnvValue(nowSeconds: number, a: number, d: number, s: number, r: number): number {
  const noteLen = Math.max(0.5, a + d + 1 + r);
  const totalTime = noteLen + 0.1;
  const t = ((nowSeconds % totalTime) + totalTime) % totalTime;
  return adsrValue(t, a, d, s, r, noteLen);
}

// Max number of samples in the LFO history ring buffer
const LFO_HISTORY_LEN = 120; // ~2 seconds at 50ms polling + 60fps interp

// Drag target types
type DragTarget = 'filterMin' | 'filterMax' | 'adsrAttack' | 'adsrDecay' | 'adsrSustain' | 'adsrRelease' | null;
const DRAG_HIT_PX = 10; // hit zone radius for drag handles

const hasModEnvelope = (props: FilterLfoVizProps): boolean =>
  !!props.modEnvEnabled && props.modEnvDest !== 'none';

const quantizeEnvelopeTime = (value: number): number => (
  value < 0.1 ? parseFloat(value.toFixed(3)) : parseFloat(value.toFixed(2))
);

const FilterLfoViz: React.FC<FilterLfoVizProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const displayedCutoffRef = useRef<number | null>(null);
  const lastDrawMsRef = useRef<number>(0);
  // Ring buffer of real engine LFO values for trailing waveform
  const lfoHistoryRef = useRef<number[]>([]);
  // Drag interaction state
  const dragRef = useRef<{ target: DragTarget; startX: number; startY: number }>({ target: null, startX: 0, startY: 0 });
  const hoverRef = useRef<DragTarget>(null);
  // Store layout metrics for hit testing (updated each frame)
  const layoutRef = useRef({ filterH: 0, envY: 0, envH: 0, w: 0, h: 0 });
  const { canAnimate } = useAnimationVisibility(canvasRef, { rootMargin: '120px' });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getCappedCanvasDpr();
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Layout
    const filterH = h * 0.42;
    const envH = h * 0.30;
    const lfoSectionH = h * 0.22;
    const envY = filterH + 4;
    const lfoY = envY + envH + 4;

    // Section backgrounds
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (const [y, sh] of [[0, filterH], [envY, envH], [lfoY, lfoSectionH]] as [number, number][]) {
      ctx.beginPath();
      ctx.roundRect(0, y, w, sh, 4);
      ctx.fill();
    }

    // Frequency grid
    const freqToX = (f: number) => (Math.log(f / 20) / Math.log(20000 / 20)) * w;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (const f of [100, 1000, 10000]) {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, filterH);
      ctx.stroke();
    }

    const showFilterModEnv = props.isRunning && props.modEnvEnabled && props.modEnvDest === 'filterCutoff' && Math.abs(props.modEnvDepth ?? 0) > 0.0001;
    const modA = props.modEnvAttack ?? props.synthAttack;
    const modD = props.modEnvDecay ?? props.synthDecay;
    const modS = props.modEnvSustain ?? props.synthSustain;
    const modR = props.modEnvRelease ?? props.synthRelease;
    const nowMs = performance.now();
    const filterEnv = showFilterModEnv
      ? loopingModEnvValue(nowMs / 1000, modA, modD, modS, modR) * (props.modEnvDepth ?? 0)
      : 0;

    // Engine telemetry gives the LFO/base cutoff. The mod envelope is visualized
    // here so the canvas can move smoothly between engine polling ticks.
    const targetCutoff = Math.max(
      20,
      Math.min(
        20000,
        (props.liveFilterFreq || props.filterACutoff) + filterEnv * (props.filterCutoffMax - props.filterCutoffMin) * 0.5,
      ),
    );
    const previousCutoff = displayedCutoffRef.current;
    const previousDrawMs = lastDrawMsRef.current;
    const elapsedMs = previousDrawMs > 0 ? Math.min(100, Math.max(0, nowMs - previousDrawMs)) : 16.67;
    const smoothing = props.isRunning ? 1 - Math.exp(-elapsedMs / 80) : 1;
    let liveCutoff = previousCutoff === null
      ? targetCutoff
      : previousCutoff + (targetCutoff - previousCutoff) * smoothing;
    if (Math.abs(liveCutoff - targetCutoff) < 0.01) {
      liveCutoff = targetCutoff;
    }
    displayedCutoffRef.current = liveCutoff;
    lastDrawMsRef.current = nowMs;
    const postLpfCutoff = typeof props.postLpfHz === 'number' && Number.isFinite(props.postLpfHz)
      ? Math.max(20, Math.min(20000, props.postLpfHz))
      : null;
    const effectiveLowpassCutoff = postLpfCutoff === null
      ? liveCutoff
      : props.filterAType === 'lowpass'
        ? Math.min(liveCutoff, postLpfCutoff)
        : postLpfCutoff;
    const postLpfDominant = postLpfCutoff !== null && postLpfCutoff < liveCutoff - 1;

    // Store layout for hit testing
    layoutRef.current = { filterH, envY, envH, w, h };

    // ── Filter A response curve ──
    const drawFilterCurve = (
      type: string, cutoff: number, res: number, q: number, slope: number,
      color: string, alpha: number, fillAlpha: number, hard: number
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      for (let px = 0; px < w; px++) {
        const freq = 20 * Math.pow(20000 / 20, px / w);
        const g = filterGain(freq, cutoff, res, q, type, hard, slope);
        const dB = 20 * Math.log10(Math.max(0.001, Math.min(10, g)));
        const y = filterH * 0.5 - (dB / 40) * filterH * 0.4;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.globalAlpha = fillAlpha;
      ctx.lineTo(w, filterH);
      ctx.lineTo(0, filterH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawFilterCurve(props.filterAType, liveCutoff, props.filterARes, props.filterAQ, props.filterASlope ?? 12, '#10b981', 0.85, 0.08, props.hardness);

    if (props.filterBEnabled && props.filterRouting !== 'aOnly') {
      drawFilterCurve(props.filterBType, props.filterBCutoff, props.filterBRes, 1, 12, '#3b82f6', 0.6, 0.05, 0);
    }

    if (postLpfCutoff !== null && postLpfCutoff < 19950) {
      drawFilterCurve('lowpass', postLpfCutoff, 0, 0.7, 12, '#38bdf8', 0.55, 0.035, 0);
    }

    // Live cutoff marker
    const cutoffX = freqToX(liveCutoff);
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(cutoffX, 2);
    ctx.lineTo(cutoffX, filterH - 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (postLpfCutoff !== null && postLpfCutoff < 19950) {
      const postX = freqToX(postLpfCutoff);
      ctx.beginPath();
      ctx.strokeStyle = postLpfDominant ? 'rgba(56,189,248,0.8)' : 'rgba(56,189,248,0.35)';
      ctx.globalAlpha = 1;
      ctx.lineWidth = postLpfDominant ? 1.25 : 0.75;
      ctx.setLineDash([2, 3]);
      ctx.moveTo(postX, 2);
      ctx.lineTo(postX, filterH - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Filter Min / Max range markers
    const fMin = props.filterCutoffMin;
    const fMax = props.filterCutoffMax;
    const minX = freqToX(fMin);
    const maxX = freqToX(fMax);

    // Shaded range band between min and max
    ctx.fillStyle = 'rgba(16,185,129,0.06)';
    ctx.fillRect(minX, 2, maxX - minX, filterH - 4);

    // Min line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(16,185,129,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(minX, 2);
    ctx.lineTo(minX, filterH - 2);
    ctx.stroke();

    // Max line
    ctx.beginPath();
    ctx.moveTo(maxX, 2);
    ctx.lineTo(maxX, filterH - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Min / Max labels
    ctx.font = '7px monospace';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(fMin)}`, minX - 2, filterH - 3);
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(fMax)}`, maxX + 2, filterH - 3);
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;

    // Drag handles on min/max lines
    const drawHandle = (x: number, y: number, target: DragTarget, color: string) => {
      const isHover = hoverRef.current === target;
      const isDrag = dragRef.current.target === target;
      const r = isDrag ? 6 : isHover ? 5.5 : 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isDrag ? color : isHover ? color : color;
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

    if (props.onFilterMinChange) {
      drawHandle(minX, filterH * 0.5, 'filterMin', '#10b981');
    }
    if (props.onFilterMaxChange) {
      drawHandle(maxX, filterH * 0.5, 'filterMax', '#10b981');
    }

    // Frequency labels
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('100', freqToX(100) + 2, filterH - 3);
    ctx.fillText('1k', freqToX(1000) + 2, filterH - 3);
    ctx.fillText('10k', freqToX(10000) + 2, filterH - 3);

    // Live Hz readout
    if (props.isRunning) {
      ctx.font = '10px monospace';
      ctx.fillStyle = postLpfDominant ? 'rgba(56,189,248,0.86)' : 'rgba(0,255,150,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(
        postLpfDominant
          ? `${Math.round(effectiveLowpassCutoff)} Hz audible`
          : `${Math.round(liveCutoff)} Hz`,
        w / 2,
        11,
      );
      if (postLpfCutoff !== null && postLpfCutoff < 19950) {
        ctx.font = '7px monospace';
        ctx.fillStyle = 'rgba(56,189,248,0.58)';
        ctx.fillText(`post ${Math.round(postLpfCutoff)} Hz`, w / 2, 21);
      }
      ctx.textAlign = 'start';
    }

    // Routing label
    if (props.filterBEnabled) {
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const rl = props.filterRouting === 'series' ? 'A\u2192B' : props.filterRouting === 'aOnly' ? 'A' : 'B';
      ctx.fillText(rl, w - 25, 11);
    }

    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('FILTER', 4, 11);

    // ── Amp envelope shape. This is the editable ADSR shown in the main
    // envelope controls; an active modulation envelope is drawn as an overlay.
    const showModEnv = hasModEnvelope(props);
    const a = props.synthAttack;
    const d = props.synthDecay;
    const s = props.synthSustain;
    const r = props.synthRelease;
    const envDepth = props.modEnvDepth ?? 0;
    const noteLen = Math.max(0.5, a + d + 1 + r);
    const totalTime = noteLen + 0.1;

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;

    for (let px = 0; px < w; px++) {
      const t = (px / w) * totalTime;
      const env = adsrValue(t, a, d, s, r, noteLen);
      const y = envY + envH - 4 - env * (envH - 8);
      px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.06;
    ctx.lineTo(w, envY + envH);
    ctx.lineTo(0, envY + envH);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.globalAlpha = 1;

    if (showModEnv) {
      const modA = props.modEnvAttack ?? props.synthAttack;
      const modD = props.modEnvDecay ?? props.synthDecay;
      const modS = props.modEnvSustain ?? props.synthSustain;
      const modR = props.modEnvRelease ?? props.synthRelease;
      const modNoteLen = Math.max(0.5, modA + modD + 1 + modR);
      const modTotalTime = modNoteLen + 0.1;

      ctx.beginPath();
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([4, 3]);
      for (let px = 0; px < w; px++) {
        const t = (px / w) * modTotalTime;
        const env = adsrValue(t, modA, modD, modS, modR, modNoteLen);
        const displayEnv = envDepth < 0 ? 1 - env : env;
        const y = envY + envH - 4 - displayEnv * (envH - 8);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // ADSR phase labels
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(245,158,11,0.35)';
    const ax = (a / totalTime) * w;
    const dx = ((a + d) / totalTime) * w;
    const sx = ((noteLen - r) / totalTime) * w;
    if (ax > 12) ctx.fillText('A', ax / 2 - 3, envY + 10);
    if (dx - ax > 12) ctx.fillText('D', (ax + dx) / 2 - 3, envY + 10);
    if (sx - dx > 12) ctx.fillText('S', (dx + sx) / 2 - 3, envY + 10);
    ctx.fillText('R', (sx + w) / 2 - 3, envY + 10);

    ctx.strokeStyle = 'rgba(245,158,11,0.15)';
    ctx.lineWidth = 0.5;
    for (const px of [ax, dx, sx]) {
      ctx.beginPath();
      ctx.moveTo(px, envY + 2);
      ctx.lineTo(px, envY + envH - 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '8px monospace';
    ctx.fillText('AMP ENV', 4, envY + envH - 3);

    if (showModEnv) {
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(245,158,11,0.38)';
      ctx.textAlign = 'right';
      const envLabel = props.modEnvDest === 'filterCutoff' ? 'filter env'
        : props.modEnvDest === 'pitch' ? 'pitch env'
          : props.modEnvDest === 'oscBLevel' ? 'osc b env'
            : 'mod env';
      const depthLabel = props.modEnvDest === 'filterCutoff'
        ? `${envDepth >= 0 ? '+' : ''}${Math.round(envDepth * 50)}% range`
        : `${envDepth >= 0 ? '+' : ''}${envDepth.toFixed(2)}`;
      ctx.fillText(`${envLabel} ${depthLabel}`, w - 4, envY + envH - 3);
      ctx.textAlign = 'start';
    }

    // Amp ADSR drag handles (at the breakpoints A, D, S, R)
    if (props.onAdsrChange) {
      // A handle: top of attack at (ax, envY + 4)
      const aHandleY = envY + 4;
      drawHandle(ax, aHandleY, 'adsrAttack', '#f59e0b');
      // D handle: end of decay at (dx, sustainLineY)
      const sustainLineY = envY + envH - 4 - s * (envH - 8);
      drawHandle(dx, sustainLineY, 'adsrDecay', '#f59e0b');
      // S handle: sustain level (middle of sustain phase)
      const sMidX = (dx + sx) / 2;
      drawHandle(sMidX, sustainLineY, 'adsrSustain', '#f59e0b');
      // R handle: end of release at bottom right (100, envY+envH-4)
      const rHandleY = envY + envH - 4;
      drawHandle(w, rHandleY, 'adsrRelease', '#f59e0b');
    }

    // ── LFO strip — all data from engine ──
    if (props.lfoDest !== 'none') {
      const lfoVal = props.liveLfoValue; // real engine value (-1..+1 after depth)
      const depth = props.lfoDepth;
      const maxDepth = Math.max(0.001, depth); // avoid div/0
      // Normalize: lfoVal is already scaled by depth, so raw = lfoVal / depth (clamped)
      const rawLfo = depth > 0 ? Math.max(-1, Math.min(1, lfoVal / maxDepth)) : 0;

      const isRW = props.lfoWave === 'randomWalk';
      const isRandom = isRW || props.lfoWave === 'sampleHold' || props.lfoWave === 'randomSmooth';

      ctx.globalAlpha = 0.7;

      if (isRW && props.lfoDest === 'filterCutoff') {
        // Random Walk → filter: show unipolar bar with real Hz from engine
        const minF = props.filterCutoffMin;
        const maxF = props.filterCutoffMax;
        const rangeF = maxF - minF;
        const curHz = liveCutoff;
        const rwPos = rangeF > 0 ? Math.max(0, Math.min(1, (curHz - minF) / rangeF)) : 0.5;

        const topY = lfoY + 4;
        const botY = lfoY + lfoSectionH - 4;
        const rangeH = botY - topY;
        const posY = botY - rwPos * rangeH;

        // Min/Max labels
        ctx.font = '7px monospace';
        ctx.fillStyle = 'rgba(167,139,250,0.3)';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(minF)}`, 4, botY);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(maxF)}`, w - 4, topY + 7);
        ctx.textAlign = 'start';

        // Bar
        ctx.fillStyle = 'rgba(167,139,250,0.15)';
        ctx.fillRect(w * 0.15, posY, w * 0.7, botY - posY);

        // Dot
        ctx.beginPath();
        ctx.fillStyle = '#c4b5fd';
        ctx.arc(w / 2, posY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Hz label
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(196,181,253,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(curHz)} Hz filter`, w / 2, posY - 6);
        if (postLpfDominant) {
          ctx.font = '7px monospace';
          ctx.fillStyle = 'rgba(56,189,248,0.7)';
          ctx.fillText(`${Math.round(effectiveLowpassCutoff)} Hz audible`, w / 2, Math.min(botY - 2, posY + 11));
        }
        ctx.textAlign = 'start';
      } else {
        // All other LFO types: draw trailing history from engine + current value indicator
        const hist = lfoHistoryRef.current;
        const centerY = lfoY + lfoSectionH / 2;
        const ampH = lfoSectionH * 0.35;

        // Center line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(167,139,250,0.15)';
        ctx.lineWidth = 0.5;
        ctx.moveTo(0, centerY);
        ctx.lineTo(w, centerY);
        ctx.stroke();

        if (props.isRunning && hist.length > 1) {
          // Draw trailing history of real engine values
          ctx.beginPath();
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 1.2;
          for (let i = 0; i < hist.length; i++) {
            const x = (i / (LFO_HISTORY_LEN - 1)) * w;
            // hist values are already depth-scaled; normalize back to -1..+1 for display
            const norm = depth > 0 ? Math.max(-1, Math.min(1, (hist[i] ?? 0) / maxDepth)) : 0;
            const y = centerY - norm * ampH;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Current value dot at right edge
          const curY = centerY - rawLfo * ampH;
          ctx.beginPath();
          ctx.fillStyle = '#c4b5fd';
          ctx.arc(w - 4, curY, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (!props.isRunning && !isRandom) {
          // When stopped: draw one period of the waveform shape for reference
          ctx.beginPath();
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 1.2;
          for (let px = 0; px < w; px++) {
            const p = px / w;
            const v = lfoShapeValue(p, props.lfoWave);
            const y = centerY - v * ampH;
            px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
          }
          ctx.stroke();
        } else if (!props.isRunning && isRandom) {
          // Random types when stopped: just show label, no fake waveform
          ctx.font = '8px monospace';
          ctx.fillStyle = 'rgba(167,139,250,0.3)';
          ctx.textAlign = 'center';
          ctx.fillText('(play to see)', w / 2, centerY + 3);
          ctx.textAlign = 'start';
        }
      }

      ctx.globalAlpha = 1;

      // Label
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(167,139,250,0.5)';
      const waveLabel = props.lfoWave === 'randomWalk' ? 'Walk' : props.lfoWave === 'randomSmooth' ? 'Rnd' : props.lfoWave === 'sampleHold' ? 'S&H' : props.lfoWave;
      ctx.fillText(`LFO ${waveLabel} \u2192 ${props.lfoDest}`, 4, lfoY + 9);
      ctx.fillText(`${props.lfoRate.toFixed(2)}`, w - 30, lfoY + 9);

      // Depth numeric feedback — show what 0-1 depth maps to in real units
      // Engine formulas (lfoValue = rawLfo * depth, rawLfo is -1..+1):
      //   filterCutoff:  ±(maxCutoff - minCutoff) * 0.5 * depth Hz from center
      //   amplitude:     multiplier = 1 ± depth * 0.5  (so 50%-150% at depth=1)
      //   pitch:         ± depth * 200 cents
      //   filterBCutoff: ± depth * 2000 Hz
      //   oscBLevel:     ± depth * 0.5 gain
      let depthLine1 = '';
      let depthLine2 = '';
      if (props.lfoDest === 'filterCutoff') {
        const center = (props.filterCutoffMin + props.filterCutoffMax) / 2;
        const halfRange = (props.filterCutoffMax - props.filterCutoffMin) * 0.5 * depth;
        const lo = Math.max(20, Math.round(center - halfRange));
        const hi = Math.min(20000, Math.round(center + halfRange));
        depthLine1 = `depth ${(depth * 100).toFixed(0)}%: ${lo}–${hi} Hz`;
        depthLine2 = `(0%=fixed ${Math.round(center)} Hz, 100%=full ${Math.round(props.filterCutoffMin)}–${Math.round(props.filterCutoffMax)} Hz)`;
      } else if (props.lfoDest === 'filterBCutoff') {
        const mod = Math.round(2000 * depth);
        depthLine1 = `depth ${(depth * 100).toFixed(0)}%: \u00b1${mod} Hz from base`;
        depthLine2 = `(0%=none, 100%=\u00b12000 Hz)`;
      } else if (props.lfoDest === 'pitch') {
        const cents = Math.round(200 * depth);
        const semis = (200 * depth / 100).toFixed(1);
        depthLine1 = `depth ${(depth * 100).toFixed(0)}%: \u00b1${cents}\u00a2 (\u00b1${semis} semi)`;
        depthLine2 = `(0%=none, 100%=\u00b1200\u00a2 / \u00b12 semi)`;
      } else if (props.lfoDest === 'amplitude') {
        const lo = Math.round((1 - depth * 0.5) * 100);
        const hi = Math.round((1 + depth * 0.5) * 100);
        depthLine1 = `depth ${(depth * 100).toFixed(0)}%: ${lo}%–${hi}% vol`;
        depthLine2 = `(0%=steady, 100%=50%–150% vol)`;
      } else if (props.lfoDest === 'oscBLevel') {
        const mod = (0.5 * depth).toFixed(2);
        depthLine1 = `depth ${(depth * 100).toFixed(0)}%: \u00b1${mod} gain`;
        depthLine2 = `(0%=none, 100%=\u00b10.50 gain)`;
      }
      if (depthLine1) {
        ctx.fillStyle = 'rgba(167,139,250,0.7)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(depthLine1, w / 2, lfoY + lfoSectionH - 11);
        ctx.fillStyle = 'rgba(167,139,250,0.35)';
        ctx.font = '7px monospace';
        ctx.fillText(depthLine2, w / 2, lfoY + lfoSectionH - 2);
        ctx.textAlign = 'start';
      }
    } else {
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText('LFO off', 4, lfoY + lfoSectionH / 2 + 3);
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
    if (props.isRunning && props.lfoDest !== 'none') {
      const hist = lfoHistoryRef.current;
      hist.push(props.liveLfoValue);
      if (hist.length > LFO_HISTORY_LEN) hist.shift();
    }
  }, [props.isRunning, props.lfoDest, props.liveLfoValue]);

  useEffect(() => {
    if (!canAnimate) return;
    const hasAnimatedModEnv = props.isRunning
      && props.modEnvEnabled
      && props.modEnvDest === 'filterCutoff'
      && Math.abs(props.modEnvDepth ?? 0) > 0.0001;
    const hasLiveFilterMotion = props.isRunning && props.lfoDest !== 'none';
    if (!hasAnimatedModEnv && !hasLiveFilterMotion) {
      requestDraw();
      return;
    }

    let frame = 0;
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    canAnimate,
    draw,
    props.isRunning,
    props.lfoDest,
    props.modEnvDepth,
    props.modEnvDest,
    props.modEnvEnabled,
    requestDraw,
  ]);

  useEffect(() => {
    const handleResize = () => requestDraw();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [requestDraw]);

  // ── Hit test: which drag target is under (x, y) in CSS coords? ──
  const hitTest = useCallback((cx: number, cy: number): DragTarget => {
    const { filterH, envY, envH, w } = layoutRef.current;
    if (w === 0) return null;

    const freqToX = (f: number) => (Math.log(f / 20) / Math.log(20000 / 20)) * w;
    const minX = freqToX(props.filterCutoffMin);
    const maxX = freqToX(props.filterCutoffMax);
    const filterHandleY = filterH * 0.5;

    // Check filter handles first
    if (props.onFilterMinChange && Math.abs(cx - minX) < DRAG_HIT_PX && Math.abs(cy - filterHandleY) < DRAG_HIT_PX * 2) return 'filterMin';
    if (props.onFilterMaxChange && Math.abs(cx - maxX) < DRAG_HIT_PX && Math.abs(cy - filterHandleY) < DRAG_HIT_PX * 2) return 'filterMax';

    // Check amp ADSR handles. Fall back to mod-envelope editing only if there
    // is no amp ADSR callback, so the visible ADSR controls stay in sync.
    const editModEnv = !props.onAdsrChange && !!props.onModEnvChange && hasModEnvelope(props);
    if (props.onAdsrChange || editModEnv) {
      const a = editModEnv ? props.modEnvAttack ?? props.synthAttack : props.synthAttack;
      const d = editModEnv ? props.modEnvDecay ?? props.synthDecay : props.synthDecay;
      const s = editModEnv ? props.modEnvSustain ?? props.synthSustain : props.synthSustain;
      const r = editModEnv ? props.modEnvRelease ?? props.synthRelease : props.synthRelease;
      const envDepth = editModEnv ? props.modEnvDepth ?? 0 : 0;
      const noteLen = Math.max(0.5, a + d + 1 + r);
      const totalTime = noteLen + 0.1;
      const ax = (a / totalTime) * w;
      const dx = ((a + d) / totalTime) * w;
      const sx = ((noteLen - r) / totalTime) * w;
      const displaySustain = editModEnv && envDepth < 0 ? 1 - s : s;
      const sustainLineY = envY + envH - 4 - displaySustain * (envH - 8);
      const aHandleY = envY + 4;
      const sMidX = (dx + sx) / 2;

      if (Math.abs(cx - ax) < DRAG_HIT_PX && Math.abs(cy - aHandleY) < DRAG_HIT_PX) return 'adsrAttack';
      if (Math.abs(cx - dx) < DRAG_HIT_PX && Math.abs(cy - sustainLineY) < DRAG_HIT_PX) return 'adsrDecay';
      if (Math.abs(cx - sMidX) < DRAG_HIT_PX && cy > envY && cy < envY + envH) return 'adsrSustain';
      // Release handle at far right
      if (Math.abs(cx - w) < DRAG_HIT_PX && cy > envY && cy < envY + envH) return 'adsrRelease';
    }

    return null;
  }, [props]);

  // ── Get CSS coords from mouse/touch event ──
  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? (e as React.TouchEvent).changedTouches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Apply drag value ──
  const applyDrag = useCallback((cx: number, cy: number) => {
    const { envY, envH, w } = layoutRef.current;
    if (w === 0) return;
    const target = dragRef.current.target;

    if (target === 'filterMin' || target === 'filterMax') {
      // Convert x position to frequency (log scale)
      const ratio = Math.max(0, Math.min(1, cx / w));
      const freq = 20 * Math.pow(20000 / 20, ratio);
      const clamped = Math.max(20, Math.min(20000, Math.round(freq)));
      if (target === 'filterMin' && props.onFilterMinChange) {
        props.onFilterMinChange(Math.min(clamped, props.filterCutoffMax - 10));
      } else if (target === 'filterMax' && props.onFilterMaxChange) {
        props.onFilterMaxChange(Math.max(clamped, props.filterCutoffMin + 10));
      }
    } else if (target === 'adsrAttack') {
      // Attack: horizontal drag = attack time
      const editModEnv = !props.onAdsrChange && !!props.onModEnvChange && hasModEnvelope(props);
      const d = editModEnv ? props.modEnvDecay ?? props.synthDecay : props.synthDecay;
      const r = editModEnv ? props.modEnvRelease ?? props.synthRelease : props.synthRelease;
      const currentA = editModEnv ? props.modEnvAttack ?? props.synthAttack : props.synthAttack;
      const noteLen = Math.max(0.5, currentA + d + 1 + r);
      const totalTime = noteLen + 0.1;
      const newA = Math.max(0.001, Math.min(editModEnv ? 8 : 16, (cx / w) * totalTime));
      if (editModEnv && props.onModEnvChange) props.onModEnvChange('attack', quantizeEnvelopeTime(newA));
      else props.onAdsrChange?.('synthAttack', quantizeEnvelopeTime(newA));
    } else if (target === 'adsrDecay') {
      // Decay: horizontal drag from attack end
      const editModEnv = !props.onAdsrChange && !!props.onModEnvChange && hasModEnvelope(props);
      const a = editModEnv ? props.modEnvAttack ?? props.synthAttack : props.synthAttack;
      const currentD = editModEnv ? props.modEnvDecay ?? props.synthDecay : props.synthDecay;
      const r = editModEnv ? props.modEnvRelease ?? props.synthRelease : props.synthRelease;
      const noteLen = Math.max(0.5, a + currentD + 1 + r);
      const totalTime = noteLen + 0.1;
      const tAtX = (cx / w) * totalTime;
      const newD = Math.max(0.01, Math.min(8, tAtX - a));
      if (editModEnv && props.onModEnvChange) props.onModEnvChange('decay', quantizeEnvelopeTime(newD));
      else props.onAdsrChange?.('synthDecay', quantizeEnvelopeTime(newD));
    } else if (target === 'adsrSustain') {
      // Sustain: vertical drag = level
      const relY = (cy - envY - 4) / (envH - 8);
      const editModEnv = !props.onAdsrChange && !!props.onModEnvChange && hasModEnvelope(props);
      const envDepth = editModEnv ? props.modEnvDepth ?? 0 : 0;
      const rawS = Math.max(0, Math.min(1, 1 - relY));
      const newS = editModEnv && envDepth < 0 ? 1 - rawS : rawS;
      if (editModEnv && props.onModEnvChange) props.onModEnvChange('sustain', parseFloat(newS.toFixed(2)));
      else props.onAdsrChange?.('synthSustain', parseFloat(newS.toFixed(2)));
    } else if (target === 'adsrRelease') {
      // Release: horizontal drag from sustain end
      const editModEnv = !props.onAdsrChange && !!props.onModEnvChange && hasModEnvelope(props);
      const a = editModEnv ? props.modEnvAttack ?? props.synthAttack : props.synthAttack;
      const d = editModEnv ? props.modEnvDecay ?? props.synthDecay : props.synthDecay;
      const currentR = editModEnv ? props.modEnvRelease ?? props.synthRelease : props.synthRelease;
      const noteLen = Math.max(0.5, a + d + 1 + currentR);
      const totalTime = noteLen + 0.1;
      const tAtX = (cx / w) * totalTime;
      // Release extends from sustain end to end. Moving left = longer release
      const newR2 = Math.max(0.01, Math.min(editModEnv ? 16 : 30, totalTime - tAtX));
      if (editModEnv && props.onModEnvChange) props.onModEnvChange('release', quantizeEnvelopeTime(newR2));
      else props.onAdsrChange?.('synthRelease', quantizeEnvelopeTime(newR2));
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
      // Update hover cursor
      const target = hitTest(x, y);
      hoverRef.current = target;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = target ? (target.startsWith('adsr') && target !== 'adsrSustain' ? 'ew-resize' : target === 'adsrSustain' ? 'ns-resize' : 'ew-resize') : 'default';
      }
    }
    requestDraw();
  }, [getCoords, hitTest, applyDrag, requestDraw]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { target: null, startX: 0, startY: 0 };
    requestDraw();
  }, [requestDraw]);

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

  // Global mouse/touch up listener for drag release
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
        height: '155px',
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

export default FilterLfoViz;
