import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { DynamicsAnalyserKey, DynamicsVisualTelemetrySnapshot } from '../../audio/engineSharedTypes';
import { resolveDynamicsTargets } from '../../audio/dynamicsModel';
import { DYNAMICS_ENGINE_COLORS } from '../../designSystem/colors';
import { getCappedCanvasDpr, useAnimationVisibility } from '../hooks/useAnimationVisibility';
import { useRuntimeProjectionVersion } from '../runtimeProjectionState';
import { getRuntimeValue } from '../runtimeValueState';
import type { SliderRuntimeRendererProps } from '../sliderSystem';
import { resolveEffectiveSliderValue } from '../sliderSystem/effectiveValue';
import { getParamInfo, type SliderState } from '../state';

type DynamicsParamChange = (key: keyof SliderState, value: number) => void;

type CanvasDrawArgs = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  frame: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Point = {
  x: number;
  y: number;
};

type DynamicsAnalyserGetter = (key: DynamicsAnalyserKey) => AnalyserNode | null;
type DynamicsTelemetryGetter = () => DynamicsVisualTelemetrySnapshot;
type FloatBuffer = Float32Array<ArrayBuffer>;
type AnalyserDataRef = MutableRefObject<FloatBuffer | null>;

type AnalyserSample = {
  peak: number;
  rms: number;
  db: number;
  hasSignal: boolean;
  data: FloatBuffer | null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const roundStep = (value: number, step: number): number => Math.round(value / step) * step;
const easeOut = (value: number): number => 1 - Math.pow(1 - clamp01(value), 2);
const gainToDb = (gain: number): number => 20 * Math.log10(Math.max(0.000001, gain));
const dbToLevel = (db: number): number => clamp01((db + 72) / 72);

const EMPTY_DYNAMICS_TELEMETRY: DynamicsVisualTelemetrySnapshot = {
  contextTime: 0,
  endCompHandledByWorklet: false,
  endCompReductionDb: 0,
  worklet: null,
  sidechainEvents: [],
};

const BG_TOP = '#12110f';
const BG = '#080807';
const BG_LOW = '#050505';
const GRID_SOFT = 'rgba(232, 220, 196, 0.045)';
const GRID_STRONG = 'rgba(232, 220, 196, 0.095)';
const TEXT = 'rgba(247, 250, 252, 0.88)';
const MUTED = 'rgba(232, 220, 196, 0.54)';
const PANEL_FILL = 'rgba(232, 220, 196, 0.018)';
const PANEL_STROKE = 'rgba(232, 220, 196, 0.075)';
const HOT_TEXT = 'rgba(247, 250, 252, 0.92)';
const CYAN = DYNAMICS_ENGINE_COLORS.sidechain;
const GREEN = DYNAMICS_ENGINE_COLORS.drift;
const PURPLE = DYNAMICS_ENGINE_COLORS.erosion;
const AMBER = DYNAMICS_ENGINE_COLORS.endChain;
const YELLOW = DYNAMICS_ENGINE_COLORS.saturation;
const ROSE = '#fb7185';

function sampleAnalyser(analyser: AnalyserNode | null | undefined, dataRef: AnalyserDataRef): AnalyserSample {
  if (!analyser) {
    return { peak: 0, rms: 0, db: -90, hasSignal: false, data: null };
  }
  if (!dataRef.current || dataRef.current.length !== analyser.fftSize) {
    dataRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
  }
  const data = dataRef.current as FloatBuffer;
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i += 1) {
    const sample = data[i] ?? 0;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, data.length));
  return {
    peak,
    rms,
    db: gainToDb(Math.max(rms, peak * 0.42)),
    hasSignal: peak > 0.0005,
    data,
  };
}

function waveformSample(data: FloatBuffer | null, unit: number): number {
  if (!data || data.length === 0) return 0;
  const index = clamp(Math.round(unit * (data.length - 1)), 0, data.length - 1);
  return data[index] ?? 0;
}

function getLiveTelemetry(getDynamicsTelemetry?: DynamicsTelemetryGetter): DynamicsVisualTelemetrySnapshot {
  return getDynamicsTelemetry?.() ?? EMPTY_DYNAMICS_TELEMETRY;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, rect.w / 2, rect.h / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.w - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + r);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h - r);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - r, rect.y + rect.h);
  ctx.lineTo(rect.x + r, rect.y + rect.h);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number, fillStyle: string | CanvasGradient): void {
  drawRoundedRect(ctx, rect, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number, strokeStyle: string, lineWidth = 1): void {
  drawRoundedRect(ctx, rect, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawBase(ctx: CanvasRenderingContext2D, width: number, height: number, accent: string): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, BG_TOP);
  gradient.addColorStop(0.68, BG);
  gradient.addColorStop(1, BG_LOW);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = GRID_SOFT;
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i += 1) {
    const x = (width * i) / 8;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i += 1) {
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = `${accent}0f`;
  ctx.fillRect(0, 0, width, 2);
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = MUTED,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = '700 9px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = TEXT,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = '700 11px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawLinePath(ctx: CanvasRenderingContext2D, points: readonly Point[], close = false): void {
  if (points.length === 0) return;
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (point) ctx.lineTo(point.x, point.y);
  }
  if (close) ctx.closePath();
}

function getPointerPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function dbToUnit(db: number): number {
  return clamp01((db + 60) / 60);
}

function unitToDb(unit: number): number {
  return -60 + clamp01(unit) * 60;
}

function logNorm(value: number, min: number, max: number): number {
  const safeMin = Math.max(0.0001, min);
  const safeValue = clamp(value, safeMin, max);
  return clamp01((Math.log(safeValue) - Math.log(safeMin)) / (Math.log(max) - Math.log(safeMin)));
}

function fromLogNorm(unit: number, min: number, max: number): number {
  const safeMin = Math.max(0.0001, min);
  return Math.exp(Math.log(safeMin) + clamp01(unit) * (Math.log(max) - Math.log(safeMin)));
}

function compressionReductionDb(inputDb: number, thresholdDb: number, kneeDb: number, ratio: number): number {
  const safeRatio = Math.max(1, ratio);
  const knee = Math.max(0, kneeDb);
  const overDb = inputDb - thresholdDb;
  const kneeOverDb = knee > 0 && overDb > -knee && overDb < knee
    ? ((overDb + knee) * (overDb + knee)) / (4 * knee)
    : Math.max(0, overDb);
  return Math.max(0, kneeOverDb * (1 - 1 / safeRatio));
}

/** Format a raw DSP value for display with compact units. */
function fmtDsp(raw: number, unit: string): string {
  if (unit === 'Hz') return raw >= 1000 ? `${(raw / 1000).toFixed(1)}k` : raw >= 100 ? `${Math.round(raw)}` : `${raw.toFixed(1)}`;
  if (unit === '%') return `${Math.round(raw * 100)}%`;
  if (unit === 'ct') return `${(raw * 1200).toFixed(0)}c`;  // semitone cents from ratio
  if (unit === 'ms') return raw >= 1 ? `${raw.toFixed(0)}ms` : `${(raw * 1000).toFixed(1)}µs`;
  if (unit === 'dB') return `${raw >= 0 ? '+' : ''}${raw.toFixed(1)}`;
  if (unit === 'x') return raw >= 10 ? `${Math.round(raw)}x` : `${raw.toFixed(1)}x`;
  return raw >= 100 ? `${Math.round(raw)}` : raw >= 1 ? `${raw.toFixed(1)}` : raw >= 0.01 ? `${raw.toFixed(3)}` : `${raw.toFixed(4)}`;
}

function drawSplitLine(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  ctx.strokeStyle = GRID_STRONG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, y);
  ctx.lineTo(Math.round(x) + 0.5, y + height);
  ctx.stroke();
}

function drawBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = '800 9px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const width = Math.max(28, ctx.measureText(text).width + 13);
  const drawX = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const rect: Rect = { x: drawX, y, w: width, h: 15 };
  fillRoundedRect(ctx, rect, 5, `${color}26`);
  strokeRoundedRect(ctx, rect, 5, `${color}7a`, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT;
  ctx.fillText(text, drawX + width / 2, y + rect.h / 2 + 0.2);
}

function drawMiniMetric(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  value: number,
  color: string,
  valueText?: string,
): void {
  const safeValue = clamp01(value);
  fillRoundedRect(ctx, rect, 4, 'rgba(232, 220, 196, 0.032)');
  fillRoundedRect(ctx, { ...rect, w: Math.max(1, rect.w * safeValue) }, 4, `${color}88`);
  drawCaption(ctx, label, rect.x + 4, rect.y + rect.h / 2 + 0.3, TEXT);
  if (valueText) drawCaption(ctx, valueText, rect.x + rect.w - 4, rect.y + rect.h / 2 + 0.3, TEXT, 'right');
}

function driftQualityLabel(quality: SliderState['driftQuality']): string {
  if (quality === 'eco') return 'ECO';
  if (quality === 'hq') return 'HQ';
  return 'BAL';
}

function erosionQualityLabel(quality: SliderState['erosionQuality']): string {
  if (quality === 'classic') return 'CLASSIC';
  if (quality === 'hq') return 'HQ';
  return 'MEDIA';
}

function endCompModeLabel(mode: SliderState['endCompMode']): string {
  if (mode === 'clarity') return 'CLARITY';
  if (mode === 'glue') return 'GLUE';
  if (mode === 'punch') return 'PUNCH';
  if (mode === 'twoBand') return '2-BAND';
  return 'STUDIO';
}

function saturationQualityLabel(quality: SliderState['dynamicsSaturationQuality']): string {
  if (quality === 'eco') return 'ECO';
  if (quality === 'hq') return 'HQ';
  return 'SMOOTH';
}

interface DynamicsCanvasSurfaceProps {
  ariaLabel: string;
  className?: string;
  draw: (args: CanvasDrawArgs) => void;
  enabled?: boolean;
  interactive?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
}

function DynamicsCanvasSurface({
  enabled = true,
  ...props
}: DynamicsCanvasSurfaceProps) {
  if (!enabled) {
    return null;
  }

  return <DynamicsCanvasSurfaceInner {...props} />;
}

function DynamicsCanvasSurfaceInner({
  ariaLabel,
  className = '',
  draw,
  interactive = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Omit<DynamicsCanvasSurfaceProps, 'enabled'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const { canAnimate } = useAnimationVisibility(containerRef);

  const drawFrame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const dpr = getCappedCanvasDpr(1.15, 1.35);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw({
      ctx,
      width,
      height,
      time,
      frame: frameRef.current,
    });
  }, [draw]);

  useEffect(() => {
    if (canAnimate) {
      drawFrame(typeof performance === 'undefined' ? 0 : performance.now() / 1000);
    }
  }, [canAnimate, drawFrame]);

  useEffect(() => {
    if (!canAnimate) {
      return undefined;
    }

    let rafId = 0;
    let lastDraw = 0;
    let disposed = false;

    const tick = (now: number) => {
      if (disposed) return;
      if (lastDraw === 0 || now - lastDraw >= 33) {
        lastDraw = now;
        frameRef.current += 1;
        drawFrame(now / 1000);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [canAnimate, drawFrame]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    onPointerUp?.(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [onPointerUp]);

  return (
    <div
      ref={containerRef}
      className={`dynamics-viz-frame${interactive ? ' dynamics-viz-frame-interactive' : ''}${className ? ` ${className}` : ''}`}
    >
      <canvas
        ref={canvasRef}
        aria-label={ariaLabel}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}

type VisualizerProps = {
  state: SliderState;
  getDynamicsAnalyser?: DynamicsAnalyserGetter;
  getDynamicsTelemetry?: DynamicsTelemetryGetter;
};

type EditableVisualizerProps = VisualizerProps & {
  onParamChange: DynamicsParamChange;
};

export function DynamicsCompressorVisualizer({ state, getDynamicsAnalyser, getDynamicsTelemetry }: VisualizerProps) {
  const inputDataRef = useRef<FloatBuffer | null>(null);
  const outputDataRef = useRef<FloatBuffer | null>(null);
  const reductionHistoryRef = useRef<number[]>(Array.from({ length: 91 }, () => 0));

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    drawBase(ctx, width, height, AMBER);

    const threshold = state.endCompThreshold ?? -18;
    const knee = Math.max(0, state.endCompKnee ?? 12);
    const ratio = Math.max(1, state.endCompRatio ?? 2);
    const mix = clamp01(state.endCompMix ?? 1);
    const makeup = clamp((state.endCompMakeup ?? 1) / 4, 0, 1);
    const attack = logNorm(state.endCompAttackMs ?? 10, 0.1, 100);
    const release = logNorm(state.endCompReleaseMs ?? 180, 20, 1500);

    const pad = 11;
    const gap = 12;
    const innerW = width - pad * 2;
    const left: Rect = { x: pad, y: pad, w: innerW * 0.49, h: height - pad * 2 };
    const right: Rect = { x: left.x + left.w + gap, y: left.y, w: width - pad - (left.x + left.w + gap), h: left.h };

    const telemetry = getLiveTelemetry(getDynamicsTelemetry);
    const inputSample = sampleAnalyser(getDynamicsAnalyser?.('endInput'), inputDataRef);
    const outputSample = sampleAnalyser(getDynamicsAnalyser?.('endOutput'), outputDataRef);
    const workletEnd = telemetry.endCompHandledByWorklet ? telemetry.worklet : null;
    const endMode = state.endCompMode ?? 'studioClear';
    const peakBlend = clamp01(state.endCompPeakBlend ?? 0.25);
    const clarityBoostDb = Math.max(0, workletEnd?.endClarityBoostDb ?? (state.endCompClarity ?? 0.22) * 3.2);
    const bandSplitHz = Math.max(1, workletEnd?.endBandSplitHz ?? fromLogNorm(state.endCompBandSplit ?? 0.5, 90, 320));
    const lowReductionDb = Math.max(0, workletEnd?.endLowReductionDb ?? 0);
    const highReductionDb = Math.max(0, workletEnd?.endHighReductionDb ?? 0);
    const workletLive = Boolean(workletEnd && workletEnd.timestamp > 0 && workletEnd.endInputPeak > 0.0005);
    const liveInputDb = workletLive ? gainToDb(workletEnd!.endInputPeak) : inputSample.db;
    const liveOutputDb = workletLive ? gainToDb(Math.max(workletEnd!.endOutputPeak, outputSample.peak)) : outputSample.db;
    const hasLiveSignal = workletLive || inputSample.hasSignal || outputSample.hasSignal;
    const currentInput = clamp(hasLiveSignal ? liveInputDb : -90, -90, 6);
    const currentOutput = clamp(hasLiveSignal ? liveOutputDb : -90, -90, 6);
    const currentReduction = hasLiveSignal ? clamp(telemetry.endCompReductionDb, 0, 48) * mix : 0;
    const history = reductionHistoryRef.current;
    history.push(currentReduction);
    if (history.length > 91) history.shift();

    fillRoundedRect(ctx, left, 7, PANEL_FILL);
    strokeRoundedRect(ctx, left, 7, PANEL_STROKE);
    fillRoundedRect(ctx, right, 7, PANEL_FILL);
    strokeRoundedRect(ctx, right, 7, PANEL_STROKE);
    drawSplitLine(ctx, left.x + left.w + gap / 2, left.y, left.h);

    const dbX = (db: number) => left.x + dbToUnit(db) * left.w;
    const dbY = (db: number) => left.y + (1 - dbToUnit(db)) * left.h;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left.x, dbY(-60));
    ctx.lineTo(left.x + left.w, dbY(0));
    ctx.stroke();

    const transferPoints: Point[] = [];
    const inputPoints: Point[] = [];
    for (let i = 0; i <= 96; i += 1) {
      const unit = i / 96;
      const inputDb = unitToDb(unit);
      const reduction = compressionReductionDb(inputDb, threshold, knee, ratio);
      transferPoints.push({ x: dbX(inputDb), y: dbY(inputDb - reduction) });
      inputPoints.push({ x: dbX(inputDb), y: dbY(inputDb) });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(left.x, left.y, left.w, left.h);
    ctx.clip();
    drawLinePath(ctx, inputPoints);
    for (let i = transferPoints.length - 1; i >= 0; i -= 1) {
      const point = transferPoints[i];
      if (point) ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    const reductionFill = ctx.createLinearGradient(left.x, left.y, left.x, left.y + left.h);
    reductionFill.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    reductionFill.addColorStop(1, 'rgba(245, 158, 11, 0.04)');
    ctx.fillStyle = reductionFill;
    ctx.fill();

    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2;
    drawLinePath(ctx, transferPoints);
    ctx.stroke();

    const thresholdX = dbX(threshold);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, left.y + 3);
    ctx.lineTo(thresholdX, left.y + left.h - 3);
    ctx.stroke();
    ctx.setLineDash([]);

    const markerInputDb = clamp(currentInput, -60, 0);
    const markerOutputDb = clamp(hasLiveSignal ? currentOutput : currentInput - currentReduction, -60, 0);
    const markerX = dbX(markerInputDb);
    const markerY = dbY(markerOutputDb);
    ctx.fillStyle = HOT_TEXT;
    ctx.beginPath();
    ctx.arc(markerX, markerY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const timeline: Rect = { x: right.x + 8, y: right.y + 9, w: right.w - 16, h: right.h - 46 };
    const baselineY = timeline.y + 2;
    const grPoints = history.map((reduction, i) => {
      const smoothedReduction = reduction * lerp(0.65, 1.08, release) * lerp(1.1, 0.78, attack);
      const x = timeline.x + (i / 90) * timeline.w;
      const y = baselineY + clamp(smoothedReduction / 24, 0, 1) * timeline.h;
      return { x, y };
    });
    ctx.beginPath();
    ctx.moveTo(timeline.x, baselineY);
    for (const point of grPoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(timeline.x + timeline.w, baselineY);
    ctx.closePath();
    const grFill = ctx.createLinearGradient(0, timeline.y, 0, timeline.y + timeline.h);
    grFill.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
    grFill.addColorStop(1, 'rgba(245, 158, 11, 0.42)');
    ctx.fillStyle = grFill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.92)';
    ctx.lineWidth = 1.7;
    drawLinePath(ctx, grPoints);
    ctx.stroke();

    drawBadge(ctx, endCompModeLabel(endMode), right.x + right.w - 8, right.y + 8, AMBER, 'right');
    if (endMode === 'twoBand') {
      const splitX = timeline.x + logNorm(bandSplitHz, 90, 320) * timeline.w;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(splitX, timeline.y + 2);
      ctx.lineTo(splitX, timeline.y + timeline.h - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCaption(ctx, `SPLIT ${Math.round(bandSplitHz)}Hz`, splitX, timeline.y + 10, TEXT, 'center');

      const bandY = timeline.y + timeline.h - 22;
      const bandW = Math.max(30, (timeline.w - 8) / 2);
      drawMiniMetric(ctx, { x: timeline.x, y: bandY, w: bandW, h: 13 }, 'LOW GR', clamp01(lowReductionDb / 18), AMBER, `${lowReductionDb.toFixed(1)}`);
      drawMiniMetric(ctx, { x: timeline.x + bandW + 8, y: bandY, w: bandW, h: 13 }, 'HIGH GR', clamp01(highReductionDb / 18), ROSE, `${highReductionDb.toFixed(1)}`);
      drawMiniMetric(
        ctx,
        { x: timeline.x, y: bandY - 17, w: timeline.w, h: 12 },
        '2-BAND',
        clamp01(state.endCompTwoBandAmount ?? 0),
        CYAN,
        `${Math.round(clamp01(state.endCompTwoBandAmount ?? 0) * 100)}%`,
      );
    } else {
      drawMiniMetric(
        ctx,
        { x: timeline.x, y: timeline.y + timeline.h - 18, w: Math.max(42, timeline.w * 0.48), h: 13 },
        'PEAK',
        peakBlend,
        CYAN,
        `${Math.round(peakBlend * 100)}%`,
      );
      drawMiniMetric(
        ctx,
        { x: timeline.x + Math.max(46, timeline.w * 0.52), y: timeline.y + timeline.h - 18, w: Math.max(42, timeline.w * 0.48), h: 13 },
        'CLARITY',
        clamp01(clarityBoostDb / 6),
        GREEN,
        `+${clarityBoostDb.toFixed(1)}`,
      );
    }

    const metersY = right.y + right.h - 29;
    const meterW = (right.w - 22) / 3;
    const meterValues = [
      { value: dbToLevel(currentInput), color: CYAN },
      { value: clamp01(currentReduction / 18), color: AMBER },
      { value: clamp01(dbToLevel(currentOutput) + makeup * 0.06), color: GREEN },
    ];
    meterValues.forEach((meter, index) => {
      const x = right.x + 7 + index * (meterW + 4);
      const rect: Rect = { x, y: metersY, w: meterW, h: 18 };
      fillRoundedRect(ctx, rect, 4, 'rgba(255, 255, 255, 0.045)');
      fillRoundedRect(ctx, { ...rect, w: rect.w * meter.value }, 4, `${meter.color}88`);
    });
  }, [
    getDynamicsAnalyser,
    getDynamicsTelemetry,
    state.endCompAttackMs,
    state.endCompBandSplit,
    state.endCompClarity,
    state.endCompKnee,
    state.endCompMakeup,
    state.endCompMix,
    state.endCompMode,
    state.endCompPeakBlend,
    state.endCompRatio,
    state.endCompReleaseMs,
    state.endCompThreshold,
    state.endCompTwoBandAmount,
  ]);

  return (
    <DynamicsCanvasSurface
      ariaLabel="End chain compression visualizer"
      className="dynamics-viz-compressor"
      draw={draw}
    />
  );
}

function saturateSample(input: number, mode: SliderState['dynamicsSaturationMode'], drive: number, tone: number, bias: number): number {
  const driven = input * (1 + drive * 5.5) + (bias - 0.5) * 0.55;
  let output = driven;
  if (mode === 'tape') {
    output = Math.tanh(driven * (1.1 + drive * 1.5)) / Math.tanh(1.1 + drive * 1.5);
  } else if (mode === 'tube') {
    const curved = driven + driven * driven * (0.18 + drive * 0.22);
    output = Math.tanh(curved * (1.15 + drive * 2.2));
  } else if (mode === 'diode') {
    const positive = Math.tanh(Math.max(0, driven) * (1.4 + drive * 3.6));
    const negative = Math.tanh(Math.max(0, -driven) * (0.85 + drive * 2.6)) * (0.74 + tone * 0.2);
    output = positive - negative;
  } else if (mode === 'fold') {
    let folded = driven * (1.05 + drive * 1.8);
    for (let i = 0; i < 3; i += 1) {
      if (folded > 1) folded = 2 - folded;
      if (folded < -1) folded = -2 - folded;
    }
    output = Math.tanh(folded * (1.2 + drive * 0.9));
  }
  const air = lerp(0.82, 1.1, tone);
  return clamp(output * air, -1.08, 1.08);
}

type SaturationVisualizerProps = VisualizerProps & { variant?: 'modular' | 'master' };

export function DynamicsSaturationVisualizer({
  state,
  getDynamicsAnalyser,
  getDynamicsTelemetry,
  variant = 'modular',
}: SaturationVisualizerProps) {
  const preDataRef = useRef<FloatBuffer | null>(null);
  const postDataRef = useRef<FloatBuffer | null>(null);

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    drawBase(ctx, width, height, YELLOW);

    const drive = clamp01(variant === 'master' ? state.masterSaturationDrive : state.dynamicsSaturationDrive);
    const tone = clamp01(variant === 'master' ? state.masterSaturationTone : state.dynamicsSaturationTone);
    const bias = clamp01(variant === 'master' ? state.masterSaturationBias : state.dynamicsSaturationBias);
    const mode = variant === 'master' ? state.masterSaturationMode : state.dynamicsSaturationMode;
    const preSample = sampleAnalyser(getDynamicsAnalyser?.('preSaturation'), preDataRef);
    const postSample = sampleAnalyser(getDynamicsAnalyser?.('postSaturation'), postDataRef);
    const telemetry = getLiveTelemetry(getDynamicsTelemetry);
    const quality = variant === 'master' ? state.masterSaturationQuality : state.dynamicsSaturationQuality;
    const oversamplingFactor = Math.max(1, telemetry.worklet?.masterSatOversamplingFactor ?? 1);

    const pad = 11;
    const split = width * 0.58;
    const curve: Rect = { x: pad, y: pad, w: split - pad * 1.5, h: height - pad * 2 };
    const harmonic: Rect = { x: split + 8, y: curve.y, w: width - split - pad - 8, h: curve.h };

    fillRoundedRect(ctx, curve, 7, PANEL_FILL);
    strokeRoundedRect(ctx, curve, 7, PANEL_STROKE);
    fillRoundedRect(ctx, harmonic, 7, PANEL_FILL);
    strokeRoundedRect(ctx, harmonic, 7, PANEL_STROKE);
    drawSplitLine(ctx, split, curve.y, curve.h);

    const curveX = (value: number) => curve.x + ((value + 1) / 2) * curve.w;
    const curveY = (value: number) => curve.y + (1 - ((value + 1.08) / 2.16)) * curve.h;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(curveX(-1), curveY(-1));
    ctx.lineTo(curveX(1), curveY(1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(curveX(0), curve.y + 4);
    ctx.lineTo(curveX(0), curve.y + curve.h - 4);
    ctx.moveTo(curve.x + 4, curveY(0));
    ctx.lineTo(curve.x + curve.w - 4, curveY(0));
    ctx.stroke();

    const shapedPoints: Point[] = [];
    const dryPoints: Point[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const unit = i / 120;
      const x = -1 + unit * 2;
      shapedPoints.push({ x: curveX(x), y: curveY(saturateSample(x, mode, drive, tone, bias)) });
      dryPoints.push({ x: curveX(x), y: curveY(x) });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(curve.x, curve.y, curve.w, curve.h);
    ctx.clip();
    drawLinePath(ctx, dryPoints);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawLinePath(ctx, shapedPoints);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const waveformIn: Point[] = [];
    const waveformOut: Point[] = [];
    for (let i = 0; i <= 90; i += 1) {
      const unit = i / 90;
      const sample = waveformSample(preSample.data, unit);
      const outputSample = postSample.hasSignal ? waveformSample(postSample.data, unit) : 0;
      const x = curve.x + unit * curve.w;
      waveformIn.push({ x, y: curve.y + curve.h * 0.78 - sample * curve.h * 0.1 });
      waveformOut.push({ x, y: curve.y + curve.h * 0.78 - outputSample * curve.h * 0.1 });
    }
    drawLinePath(ctx, waveformIn);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawLinePath(ctx, waveformOut);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const asymmetry = Math.abs(
      saturateSample(0.72, mode, drive, tone, bias) + saturateSample(-0.72, mode, drive, tone, bias),
    );
    const harmonicValues = [
      { label: 'H2', value: clamp01(asymmetry * 0.85 + drive * (mode === 'diode' ? 0.35 : 0.16)), color: ROSE },
      { label: 'H3', value: clamp01(drive * (mode === 'tube' ? 0.9 : mode === 'tape' ? 0.62 : 0.46) + tone * 0.08), color: YELLOW },
      { label: 'H5', value: clamp01(drive * (mode === 'fold' ? 0.96 : mode === 'diode' ? 0.52 : 0.28)), color: AMBER },
      { label: 'H7', value: clamp01(drive * (mode === 'fold' ? 0.78 : 0.2) + Math.max(0, tone - 0.55) * 0.25), color: CYAN },
    ];
    const barGap = 5;
    const barW = (harmonic.w - 18 - barGap * (harmonicValues.length - 1)) / harmonicValues.length;
    const barTop = harmonic.y + 26;
    const barBottomPad = 10;
    const barMaxH = harmonic.h - (barTop - harmonic.y) - barBottomPad;
    harmonicValues.forEach((bar, index) => {
      const x = harmonic.x + 9 + index * (barW + barGap);
      const h = Math.max(3, barMaxH * easeOut(bar.value));
      const y = harmonic.y + harmonic.h - barBottomPad - h;
      fillRoundedRect(ctx, { x, y: barTop, w: barW, h: barMaxH }, 4, 'rgba(255, 255, 255, 0.04)');
      fillRoundedRect(ctx, { x, y, w: barW, h }, 4, `${bar.color}99`);
    });

    const meter: Rect = { x: harmonic.x + 12, y: harmonic.y + 10, w: harmonic.w - 24, h: 6 };
    fillRoundedRect(ctx, meter, 3, 'rgba(232, 220, 196, 0.065)');
    const centerX = meter.x + meter.w / 2;
    const offset = clamp(asymmetry * 0.5 + Math.abs(bias - 0.5) * 0.9, 0, 0.48) * meter.w;
    fillRoundedRect(ctx, { x: centerX - offset, y: meter.y, w: offset * 2, h: meter.h }, 3, 'rgba(251, 191, 36, 0.62)');
    drawBadge(ctx, `${saturationQualityLabel(quality)} ${Math.round(oversamplingFactor)}x`, harmonic.x + harmonic.w - 8, harmonic.y + harmonic.h - 22, YELLOW, 'right');
  }, [
    getDynamicsAnalyser,
    getDynamicsTelemetry,
    state.dynamicsSaturationBias,
    state.dynamicsSaturationDrive,
    state.dynamicsSaturationMode,
    state.dynamicsSaturationQuality,
    state.dynamicsSaturationTone,
    state.masterSaturationBias,
    state.masterSaturationDrive,
    state.masterSaturationMode,
    state.masterSaturationQuality,
    state.masterSaturationTone,
    variant,
  ]);

  return (
    <DynamicsCanvasSurface
      ariaLabel={variant === 'master' ? 'Master saturation visualizer' : 'Dynamics saturation visualizer'}
      className="dynamics-viz-saturation"
      draw={draw}
    />
  );
}

export function DynamicsErosionVisualizer({ state, getDynamicsAnalyser, getDynamicsTelemetry }: VisualizerProps) {
  const targets = useMemo(() => resolveDynamicsTargets(state), [state]);
  const postDegradeDataRef = useRef<FloatBuffer | null>(null);

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    drawBase(ctx, width, height, PURPLE);
    const liveTelemetry = getLiveTelemetry(getDynamicsTelemetry);
    const postDegrade = sampleAnalyser(getDynamicsAnalyser?.('postDegrade'), postDegradeDataRef);
    const workletWetPeak = liveTelemetry.worklet?.wetPeak ?? 0;
    const livePulse = clamp01(Math.max(postDegrade.peak, workletWetPeak) * 2.8);
    const eventEnv = clamp01(liveTelemetry.worklet?.erosionEventEnv ?? 0);
    const eventGainDb = liveTelemetry.worklet?.erosionEventGainDb ?? 0;
    const profileAmount = clamp01(liveTelemetry.worklet?.erosionProfileAmount ?? state.erosionProfileAmount ?? 0.65);
    const ditherAmount = clamp01(state.erosionDitherAmount ?? 0.55);
    const quality = state.erosionQuality ?? 'media';

    const pad = 11;
    const header = 17;
    const footerH = 30;
    const mapRect: Rect = { x: pad, y: pad + header, w: width - pad * 2, h: height - pad * 2 - header - footerH - 8 };
    const footer: Rect = { x: pad, y: mapRect.y + mapRect.h + 8, w: width - pad * 2, h: footerH };
    drawValue(ctx, 'DAMAGE MAP', mapRect.x, pad + 8, PURPLE);
    drawBadge(ctx, erosionQualityLabel(quality), mapRect.x + mapRect.w, pad + 1, PURPLE, 'right');

    fillRoundedRect(ctx, mapRect, 7, PANEL_FILL);
    strokeRoundedRect(ctx, mapRect, 7, PANEL_STROKE);

    const lpLoss = 1 - logNorm(targets.lowpassHz, 450, 16000);
    const hpLift = logNorm(targets.highpassHz, 20, 1600);
    const cells = [
      { label: 'Wet',     norm: targets.erosionMix,                           raw: targets.erosionMix,                unit: '%',  color: CYAN },
      { label: 'Wear',    norm: targets.rawMediaWear,                          raw: targets.rawMediaWear,              unit: '%',  color: PURPLE },
      { label: 'Damage',  norm: targets.damage,                                raw: targets.damage,                    unit: '%',  color: ROSE },
      { label: 'Alias',   norm: targets.workletAlias,                           raw: targets.workletAlias,              unit: '%',  color: YELLOW },
      { label: 'Drop',    norm: clamp01(targets.dropoutDepth / 0.16),           raw: targets.dropoutDepth,              unit: '',   color: ROSE },
      { label: 'Noise',   norm: clamp01(targets.noiseGain / 0.018),             raw: targets.noiseGain,                 unit: '',   color: CYAN },
      { label: 'Jitter',  norm: clamp01(targets.jitterDepth / 0.0012),          raw: targets.jitterDepth * 1200,        unit: 'ct', color: AMBER },
      { label: 'Wow',     norm: clamp01(targets.wowDepth / 0.018),              raw: targets.wowDepth * 1200,           unit: 'ct', color: GREEN },
      { label: 'Flutter', norm: clamp01(targets.flutterDepth / 0.0018),          raw: targets.flutterDepth * 1200,       unit: 'ct', color: GREEN },
      { label: 'Wobble',  norm: clamp01(state.erosionWobbleSpeed ?? 0.35),       raw: state.erosionWobbleSpeed ?? 0.35,  unit: '%',  color: GREEN },
      { label: 'LP Cut',  norm: lpLoss,                                         raw: targets.lowpassHz,                 unit: 'Hz', color: YELLOW },
      { label: 'Corrode', norm: targets.corrosion,                               raw: targets.corrosion,                 unit: '%',  color: ROSE },
    ];

    const columns = width < 380 ? 3 : 4;
    const rows = Math.ceil(cells.length / columns);
    const gap = 5;
    const cellW = (mapRect.w - gap * (columns + 1)) / columns;
    const cellH = (mapRect.h - gap * (rows + 1)) / rows;
    cells.forEach((cell, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = mapRect.x + gap + column * (cellW + gap);
      const y = mapRect.y + gap + row * (cellH + gap);
      const intensity = easeOut(clamp01(cell.norm));
      const scan = livePulse * (0.03 + (index % 3) * 0.012);
      const rect: Rect = { x, y, w: cellW, h: cellH };
      fillRoundedRect(ctx, rect, 5, 'rgba(255, 255, 255, 0.04)');
      fillRoundedRect(ctx, rect, 5, `${cell.color}${Math.round(clamp(18 + intensity * 96 + scan * 80, 14, 136)).toString(16).padStart(2, '0')}`);
      const innerPad = 5;
      const bar: Rect = { x: x + innerPad, y: y + cellH - 9, w: (cellW - innerPad * 2) * intensity, h: 3 };
      fillRoundedRect(ctx, { x: x + innerPad, y: y + cellH - 9, w: cellW - innerPad * 2, h: 3 }, 2, 'rgba(255, 255, 255, 0.12)');
      fillRoundedRect(ctx, bar, 2, 'rgba(255, 255, 255, 0.76)');
      drawCaption(ctx, cell.label, x + innerPad, y + 10, TEXT);
      drawCaption(ctx, fmtDsp(cell.raw, cell.unit), x + cellW - innerPad, y + 10, TEXT, 'right');
    });

    fillRoundedRect(ctx, footer, 5, 'rgba(255, 255, 255, 0.04)');
    const eventW = Math.max(66, footer.w * 0.3);
    drawMiniMetric(
      ctx,
      { x: footer.x + 5, y: footer.y + 4, w: eventW, h: 10 },
      'EVENT',
      eventEnv,
      ROSE,
      `${Math.round(eventEnv * 100)}%`,
    );
    drawMiniMetric(
      ctx,
      { x: footer.x + eventW + 10, y: footer.y + 4, w: eventW, h: 10 },
      'DIP',
      clamp01(Math.abs(eventGainDb) / 18),
      AMBER,
      `${eventGainDb.toFixed(1)}`,
    );
    const profileRect: Rect = {
      x: footer.x + eventW * 2 + 15,
      y: footer.y + 4,
      w: Math.max(40, footer.w - eventW * 2 - 20),
      h: 10,
    };
    fillRoundedRect(ctx, profileRect, 4, 'rgba(255, 255, 255, 0.045)');
    const profilePoints: Point[] = [];
    for (let i = 0; i <= 32; i += 1) {
      const unit = i / 32;
      const body = Math.exp(-((unit - 0.24) ** 2) / 0.018);
      const notch = Math.exp(-((unit - 0.74) ** 2) / 0.012);
      const tilt = (unit - 0.5) * 0.14;
      const shaped = (body * 0.45 - notch * 0.72 - tilt) * profileAmount;
      profilePoints.push({
        x: profileRect.x + unit * profileRect.w,
        y: profileRect.y + profileRect.h * 0.55 - shaped * profileRect.h * 0.45,
      });
    }
    drawLinePath(ctx, profilePoints);
    ctx.strokeStyle = `${PURPLE}cc`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    drawCaption(ctx, `PROFILE ${Math.round(profileAmount * 100)}%`, profileRect.x + 4, profileRect.y + profileRect.h / 2 + 0.2, TEXT);
    drawCaption(ctx, `DITHER ${Math.round(ditherAmount * 100)}%`, profileRect.x + profileRect.w - 4, profileRect.y + profileRect.h / 2 + 0.2, TEXT, 'right');

    const bandRect: Rect = { x: footer.x, y: footer.y + 15, w: footer.w, h: footer.h - 15 };
    const hpX = bandRect.x + clamp01(hpLift) * bandRect.w * 0.28;
    const lpX = bandRect.x + bandRect.w - clamp01(lpLoss) * bandRect.w * 0.46;
    const usable: Rect = { x: hpX, y: bandRect.y + 4, w: Math.max(8, lpX - hpX), h: bandRect.h - 8 };
    fillRoundedRect(ctx, usable, 4, 'rgba(139, 92, 246, 0.48)');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    for (let i = 0; i < 18; i += 1) {
      const unit = (i + 0.5) / 18;
      const wave = waveformSample(postDegrade.data, unit);
      const x = bandRect.x + unit * bandRect.w + wave * targets.dropoutDepth * 90;
      const stripeH = (bandRect.h - 6) * clamp01(0.35 + Math.abs(wave) * 1.8 + livePulse * 0.3);
      ctx.fillRect(x, bandRect.y + 3 + (bandRect.h - 6 - stripeH) * 0.5, 1, stripeH);
    }
    drawCaption(ctx, 'HP', bandRect.x + 5, bandRect.y + bandRect.h / 2 + 0.5, MUTED);
    drawCaption(ctx, 'LP', bandRect.x + bandRect.w - 5, bandRect.y + bandRect.h / 2 + 0.5, MUTED, 'right');
  }, [
    getDynamicsAnalyser,
    getDynamicsTelemetry,
    state.erosionDitherAmount,
    state.erosionProfileAmount,
    state.erosionQuality,
    targets,
  ]);

  return (
    <DynamicsCanvasSurface
      ariaLabel="Erosion damage map based on resolved engine targets"
      className="dynamics-viz-erosion"
      draw={draw}
    />
  );
}

function driftAccent(mode: SliderState['driftMode']): string {
  if (mode === 'abyssWater') return CYAN;
  if (mode === 'shallowWater') return GREEN;
  return PURPLE;
}

function biquadLpMag(f: number, fc: number, q: number): number {
  const r = f / fc;
  const r2 = r * r;
  return 1 / Math.sqrt((1 - r2) ** 2 + (r / q) ** 2);
}

function biquadHpMag(f: number, fc: number, q: number): number {
  const r = f / fc;
  const r2 = r * r;
  return r2 / Math.sqrt((1 - r2) ** 2 + (r / q) ** 2);
}

export function DynamicsDriftVisualizer({ state, getDynamicsAnalyser, getDynamicsTelemetry }: EditableVisualizerProps) {
  const outputDataRef = useRef<FloatBuffer | null>(null);
  const targets = useMemo(() => resolveDynamicsTargets(state), [state]);

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    const accent = driftAccent(state.driftMode);
    drawBase(ctx, width, height, accent);
    const liveTelemetry = getLiveTelemetry(getDynamicsTelemetry);
    const outputSample = sampleAnalyser(getDynamicsAnalyser?.('postDegrade'), outputDataRef);

    const pad = 11;
    const gap = 12;
    const split = Math.round(width * 0.42);
    const motion: Rect = { x: pad, y: pad, w: split - pad - gap / 2, h: height - pad * 2 };
    const filt: Rect = { x: split + gap / 2, y: pad, w: width - split - pad - gap / 2, h: height - pad * 2 };

    fillRoundedRect(ctx, motion, 7, PANEL_FILL);
    strokeRoundedRect(ctx, motion, 7, PANEL_STROKE);
    fillRoundedRect(ctx, filt, 7, PANEL_FILL);
    strokeRoundedRect(ctx, filt, 7, PANEL_STROKE);
    drawSplitLine(ctx, split, motion.y, motion.h);

    const envFollow = clamp01(state.driftEnvFollow ?? 0);
    const liveEnv = clamp01(Math.max(outputSample.peak, liveTelemetry.worklet?.driftEnv ?? 0) * (1 + envFollow * 2.2));
    const antiComb = clamp01(state.driftAntiComb ?? 1);
    const mix = clamp01(state.driftMix ?? 0);
    const mixedDelayGuard = mix < 0.985 ? antiComb : 0;
    const fallbackMinDelayMs = lerp(3, 10.5, mixedDelayGuard);
    const minDelayMs = Math.max(0, liveTelemetry.worklet?.driftMinDelayMs ?? fallbackMinDelayMs);
    const combRisk = clamp01(liveTelemetry.worklet?.driftCombRisk ?? mixedDelayGuard * (state.driftMode === 'shallowWater' ? 0.95 : 0.45));
    const diffusion = clamp01(liveTelemetry.worklet?.driftDiffusion ?? state.driftDiffusion ?? 0.55);
    const quality = state.driftQuality ?? 'balanced';

    // ── Motion panel (left) ──
    const motionBars = [
      { label: 'Wow',     norm: clamp01(targets.wowDepth / 0.018),          raw: targets.wowDepth * 1200,        unit: 'ct', color: accent },
      { label: 'Flutter', norm: clamp01(targets.flutterDepth / 0.0018),     raw: targets.flutterDepth * 1200,    unit: 'ct', color: accent },
      { label: 'Drift',   norm: clamp01(targets.randomDriftDepth / 0.006),  raw: targets.randomDriftDepth * 1200, unit: 'ct', color: CYAN },
      { label: 'Delay',   norm: clamp01(targets.randomDelayDepth / 0.012),  raw: targets.randomDelayDepth * 1000, unit: 'ms', color: CYAN },
      { label: 'Hold Hz', norm: clamp01(targets.randomHoldRateHz / 3.5),    raw: targets.randomHoldRateHz,       unit: 'Hz', color: AMBER },
      { label: 'Stereo',  norm: clamp01(targets.stereo),                    raw: targets.stereo,                 unit: '%',  color: GREEN },
      { label: 'Mix',     norm: clamp01(targets.wet),                       raw: targets.wet,                    unit: '%',  color: ROSE },
    ];

    const barPad = 6;
    const titleH = 14;
    const envStripH = 7;
    const stereoFieldH = 22;
    const barsAvailH = motion.h - titleH - envStripH - stereoFieldH - 14;
    const barH = Math.min(14, (barsAvailH - (motionBars.length - 1) * 3) / motionBars.length);
    const barGap = Math.min(3, (barsAvailH - barH * motionBars.length) / Math.max(1, motionBars.length - 1));

    drawCaption(ctx, 'MOTION', motion.x + barPad, motion.y + titleH * 0.7, accent);
    drawBadge(ctx, driftQualityLabel(quality), motion.x + motion.w - barPad, motion.y + 4, accent, 'right');

    motionBars.forEach((bar, i) => {
      const y = motion.y + titleH + 4 + i * (barH + barGap);
      const trackW = motion.w - barPad * 2;
      const labelW = 38;
      const bW = trackW - labelW - 4;
      const bX = motion.x + barPad + labelW + 4;
      const pulse = 1 + liveEnv * 0.3;
      const fillW = bW * clamp01(bar.norm * pulse);

      drawCaption(ctx, bar.label, motion.x + barPad, y + barH * 0.55, MUTED);

      // track background
      const trackRect: Rect = { x: bX, y, w: bW, h: barH };
      fillRoundedRect(ctx, trackRect, 3, 'rgba(255, 255, 255, 0.04)');

      // filled bar
      if (fillW > 1) {
        const intensity = Math.round(clamp(60 + bar.norm * 140 + liveEnv * 40, 40, 200));
        fillRoundedRect(ctx, { x: bX, y, w: fillW, h: barH }, 3, `${bar.color}${intensity.toString(16).padStart(2, '0')}`);
      }

      // value readout — actual resolved value with unit
      drawCaption(ctx, fmtDsp(bar.raw, bar.unit), bX + bW + 1, y + barH * 0.55, `${bar.color}88`, 'right');
    });

    // stereo field indicator
    const sfY = motion.y + motion.h - envStripH - stereoFieldH - 6;
    const sfCx = motion.x + motion.w / 2;
    const sfMaxR = (motion.w - barPad * 4) / 2;
    // background circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sfCx, sfY + stereoFieldH / 2, sfMaxR, 0, Math.PI * 2);
    ctx.stroke();
    // center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.moveTo(sfCx, sfY + 2);
    ctx.lineTo(sfCx, sfY + stereoFieldH - 2);
    ctx.stroke();
    // stereo dots: main and spread
    const mainPanX = sfCx + targets.mainPan * sfMaxR;
    const spreadPanX = sfCx + targets.spreadPan * sfMaxR;
    const mainGain = clamp01(targets.mainDelayGain);
    const spreadGain = clamp01(targets.spreadDelayGain);
    // spread channel
    if (spreadGain > 0.01) {
      ctx.fillStyle = `${accent}55`;
      ctx.beginPath();
      ctx.arc(spreadPanX, sfY + stereoFieldH / 2, 2.5 + spreadGain * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // main channel
    ctx.fillStyle = `${accent}cc`;
    ctx.beginPath();
    ctx.arc(mainPanX, sfY + stereoFieldH / 2, 2.5 + mainGain * 2, 0, Math.PI * 2);
    ctx.fill();
    // labels
    drawCaption(ctx, 'L', motion.x + barPad, sfY + stereoFieldH / 2 + 0.5, 'rgba(255, 255, 255, 0.2)');
    drawCaption(ctx, 'R', motion.x + motion.w - barPad, sfY + stereoFieldH / 2 + 0.5, 'rgba(255, 255, 255, 0.2)', 'right');

    // env follower meter strip (bottom)
    const envY = motion.y + motion.h - envStripH - 2;
    const envRect: Rect = { x: motion.x + barPad, y: envY, w: motion.w - barPad * 2, h: envStripH };
    fillRoundedRect(ctx, envRect, 3, 'rgba(255, 255, 255, 0.055)');
    fillRoundedRect(ctx, { ...envRect, w: envRect.w * liveEnv }, 3, `${accent}55`);
    drawCaption(ctx, 'ENV', motion.x + motion.w - barPad, envY - 2, MUTED, 'right');

    // ── Filter response panel (right) ──
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const logSpan = logMax - logMin;
    const minDb = -36;
    const maxDb = 9;
    const dbSpan = maxDb - minDb;
    const plotPad = 6;
    const labelH = 16;
    const plotX = filt.x + plotPad;
    const plotW = filt.w - plotPad * 2;
    const plotY = filt.y + plotPad;
    const plotH = filt.h - plotPad - labelH - 4;
    const freqToX = (f: number) => plotX + clamp01((Math.log10(clamp(f, 20, 20000)) - logMin) / logSpan) * plotW;
    const dbToFiltY = (db: number) => plotY + clamp01(1 - (clamp(db, minDb, maxDb) - minDb) / dbSpan) * plotH;

    // frequency grid
    const gridFreqs = [50, 100, 500, 1000, 5000, 10000];
    const labelFreqs = [100, 1000, 10000];
    for (const gf of gridFreqs) {
      const gx = freqToX(gf);
      ctx.strokeStyle = labelFreqs.includes(gf) ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, plotY);
      ctx.lineTo(gx, plotY + plotH);
      ctx.stroke();
    }
    for (const lf of labelFreqs) {
      drawCaption(ctx, lf >= 1000 ? `${lf / 1000}k` : `${lf}`, freqToX(lf), plotY + plotH + labelH * 0.6, MUTED, 'center');
    }
    // 0 dB reference line
    const zeroY = dbToFiltY(0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);
    ctx.lineTo(plotX + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // resolved filter targets
    const hpHz = targets.highpassHz;
    const hpQ = targets.highpassQ;
    const lpHz = targets.lowpassHz;
    const lpQ = targets.lowpassQ;
    const lp2Hz = targets.lowpassStage2Hz;
    const lp2Q = targets.lowpassStage2Q;

    // envelope-opened LP
    const envLpHz = clamp(lpHz + targets.envToLowpassGain * liveEnv, lpHz, 20000);
    const envLp2Hz = clamp(lp2Hz + targets.envToLowpassGain * liveEnv * 0.9, lp2Hz, 20000);
    const envLpQ = clamp(lpQ + targets.envToResonanceGain * liveEnv, lpQ, 14);

    // compute response curves
    const numPts = 112;
    const staticCurve: Point[] = [];
    const liveCurve: Point[] = [];
    for (let i = 0; i <= numPts; i += 1) {
      const u = i / numPts;
      const f = Math.pow(10, logMin + u * logSpan);
      const x = plotX + u * plotW;
      // static
      const sHp = Math.min(4, biquadHpMag(f, hpHz, hpQ));
      const sLp = Math.min(4, biquadLpMag(f, lpHz, lpQ));
      const sLp2 = Math.min(4, biquadLpMag(f, lp2Hz, lp2Q));
      const sDb = clamp(20 * Math.log10(Math.max(0.0005, sHp * sLp * sLp2)), minDb, maxDb);
      staticCurve.push({ x, y: dbToFiltY(sDb) });
      // live (envelope-opened)
      const eLp = Math.min(4, biquadLpMag(f, envLpHz, envLpQ));
      const eLp2 = Math.min(4, biquadLpMag(f, envLp2Hz, lp2Q));
      const eDb = clamp(20 * Math.log10(Math.max(0.0005, sHp * eLp * eLp2)), minDb, maxDb);
      liveCurve.push({ x, y: dbToFiltY(eDb) });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(filt.x + 1, plotY - 1, filt.w - 2, plotH + 2);
    ctx.clip();

    // fill passband under live curve
    const bottomY = dbToFiltY(minDb);
    ctx.beginPath();
    ctx.moveTo(liveCurve[0]!.x, bottomY);
    for (const p of liveCurve) ctx.lineTo(p.x, p.y);
    ctx.lineTo(liveCurve[liveCurve.length - 1]!.x, bottomY);
    ctx.closePath();
    const passFill = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    passFill.addColorStop(0, `${accent}1a`);
    passFill.addColorStop(1, `${accent}05`);
    ctx.fillStyle = passFill;
    ctx.fill();

    // fill LPG opening region (between static and live)
    const hasOpening = liveEnv > 0.005 && targets.envToLowpassGain > 1;
    if (hasOpening) {
      ctx.beginPath();
      for (let i = 0; i <= numPts; i += 1) ctx.lineTo(liveCurve[i]!.x, Math.min(liveCurve[i]!.y, staticCurve[i]!.y));
      for (let i = numPts; i >= 0; i -= 1) ctx.lineTo(staticCurve[i]!.x, Math.max(staticCurve[i]!.y, liveCurve[i]!.y));
      ctx.closePath();
      ctx.fillStyle = `${accent}20`;
      ctx.fill();
    }

    // static curve
    drawLinePath(ctx, staticCurve);
    ctx.strokeStyle = `${accent}50`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // live curve
    drawLinePath(ctx, liveCurve);
    ctx.strokeStyle = `${accent}dd`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // bias floor marker
    const biasX = freqToX(lpHz);
    ctx.strokeStyle = `${accent}55`;
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(biasX, plotY);
    ctx.lineTo(biasX, plotY + plotH);
    ctx.stroke();

    // HP cutoff marker
    if (hpHz > 25) {
      const hpX = freqToX(hpHz);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
      ctx.beginPath();
      ctx.moveTo(hpX, plotY);
      ctx.lineTo(hpX, plotY + plotH);
      ctx.stroke();
    }

    // live LP dot (env-opened position at 0 dB crossing)
    if (hasOpening) {
      const envX = freqToX(envLpHz);
      ctx.strokeStyle = `${accent}44`;
      ctx.beginPath();
      ctx.moveTo(envX, plotY);
      ctx.lineTo(envX, plotY + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // live dot at the envelope-opened LP cutoff
    const dotX = freqToX(hasOpening ? envLpHz : lpHz);
    const dotY = dbToFiltY(0);
    ctx.fillStyle = HOT_TEXT;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // panel labels
    drawCaption(ctx, 'BIAS', biasX, plotY + plotH + labelH * 0.6, `${accent}77`, 'center');
    if (hpHz > 25) drawCaption(ctx, 'HP', freqToX(hpHz), plotY + plotH + labelH * 0.6, 'rgba(251, 191, 36, 0.5)', 'center');

    const overlayW = Math.max(76, Math.min(112, plotW * 0.42));
    drawMiniMetric(
      ctx,
      { x: plotX + 4, y: plotY + 4, w: overlayW, h: 12 },
      'PROTECT',
      combRisk,
      ROSE,
      `${Math.round(combRisk * 100)}%`,
    );
    drawMiniMetric(
      ctx,
      { x: plotX + 4, y: plotY + 19, w: overlayW, h: 12 },
      'DIFFUSE',
      diffusion,
      CYAN,
      `${Math.round(diffusion * 100)}%`,
    );
    drawCaption(ctx, `MIN ${minDelayMs.toFixed(1)}ms`, plotX + plotW - 4, plotY + 10, TEXT, 'right');
  }, [
    getDynamicsAnalyser,
    getDynamicsTelemetry,
    state.driftAntiComb,
    state.driftDiffusion,
    state.driftEnvFollow,
    state.driftMix,
    state.driftMode,
    state.driftQuality,
    targets,
  ]);

  return (
    <DynamicsCanvasSurface
      ariaLabel="Drift visualizer"
      className="dynamics-viz-drift"
      draw={draw}
    />
  );
}

type DynamicsEqId = 'eq1' | 'eq2';
type DynamicsEqBandId = 'low' | 'mid' | 'high';
type DynamicsEqHandleKind = 'node' | 'q';
type DynamicsEqSliderProps = (key: keyof SliderState) => SliderRuntimeRendererProps<keyof SliderState>;

const DYNAMICS_EQ_RUNTIME_KEYS: Record<DynamicsEqId, readonly string[]> = {
  eq1: [
    'dynamicsEq1InputGain', 'dynamicsEq1OutputGain',
    'dynamicsEq1LowFreq', 'dynamicsEq1LowGain', 'dynamicsEq1LowQ', 'dynamicsEq1LowSlope',
    'dynamicsEq1MidFreq', 'dynamicsEq1MidGain', 'dynamicsEq1MidQ',
    'dynamicsEq1HighFreq', 'dynamicsEq1HighGain', 'dynamicsEq1HighQ', 'dynamicsEq1HighSlope',
  ],
  eq2: [
    'dynamicsEq2InputGain', 'dynamicsEq2OutputGain',
    'dynamicsEq2LowFreq', 'dynamicsEq2LowGain', 'dynamicsEq2LowQ', 'dynamicsEq2LowSlope',
    'dynamicsEq2MidFreq', 'dynamicsEq2MidGain', 'dynamicsEq2MidQ',
    'dynamicsEq2HighFreq', 'dynamicsEq2HighGain', 'dynamicsEq2HighQ', 'dynamicsEq2HighSlope',
  ],
};

type DynamicsEqHandle = {
  band: DynamicsEqBandId;
  kind: DynamicsEqHandleKind;
  x: number;
  y: number;
  radius: number;
  plot: Rect;
};

type DynamicsEqLayout = {
  handles: DynamicsEqHandle[];
};

type DynamicsEqBandState = {
  band: DynamicsEqBandId;
  label: string;
  freqKey: keyof SliderState;
  gainKey: keyof SliderState;
  qKey: keyof SliderState;
  slopeKey?: keyof SliderState;
  typeKey?: keyof SliderState;
  edge: 'low' | 'high' | null;
  color: string;
  freq: number;
  gain: number;
  q: number;
  slope: number;
  type: SliderState['dynamicsEq1LowType'];
};

const EQ_FREQ_MIN = 20;
const EQ_FREQ_MAX = 20000;
const EQ_GAIN_MIN = -18;
const EQ_GAIN_MAX = 18;
const EQ_Q_MIN = 0.1;
const EQ_Q_MAX = 18;

function formatEqHz(freq: number): string {
  if (freq >= 10000) return `${Math.round(freq / 1000)}k`;
  if (freq >= 1000) return `${(freq / 1000).toFixed(1)}k`;
  return `${Math.round(freq)}`;
}

function readEqNumber(
  state: SliderState,
  key: keyof SliderState,
  fallback: number,
  sliderProps: DynamicsEqSliderProps,
): number {
  const value = state[key];
  const authoredValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const runtime = sliderProps(key);
  return resolveEffectiveSliderValue({
    authoredValue,
    mode: runtime.mode,
    range: runtime.dualRange ? [runtime.dualRange.min, runtime.dualRange.max] : undefined,
    runtimePosition: runtime.walkPosition,
    runtimeValue: getRuntimeValue(String(key)),
    domain: getParamInfo(key) ?? undefined,
  });
}

function readEqBandType(state: SliderState, key: keyof SliderState | undefined): SliderState['dynamicsEq1LowType'] {
  if (!key) return 'bell';
  const value = state[key];
  return value === 'bell' || value === 'highpass' || value === 'lowpass' ? value : 'shelf';
}

function getEqBandStates(
  state: SliderState,
  eqId: DynamicsEqId,
  sliderProps: DynamicsEqSliderProps,
): DynamicsEqBandState[] {
  const prefix = eqId === 'eq1' ? 'dynamicsEq1' : 'dynamicsEq2';
  const key = (suffix: string) => `${prefix}${suffix}` as keyof SliderState;
  const lowType = readEqBandType(state, key('LowType'));
  const highType = readEqBandType(state, key('HighType'));
  return [
    {
      band: 'low',
      label: 'LOW',
      freqKey: key('LowFreq'),
      gainKey: key('LowGain'),
      qKey: key('LowQ'),
      slopeKey: key('LowSlope'),
      typeKey: key('LowType'),
      edge: 'low',
      color: CYAN,
      freq: readEqNumber(state, key('LowFreq'), eqId === 'eq1' ? 120 : 90, sliderProps),
      gain: lowType === 'highpass' || lowType === 'lowpass' ? 0 : readEqNumber(state, key('LowGain'), 0, sliderProps),
      q: readEqNumber(state, key('LowQ'), 0.7, sliderProps),
      slope: readEqNumber(state, key('LowSlope'), 1, sliderProps),
      type: lowType,
    },
    {
      band: 'mid',
      label: 'MID',
      freqKey: key('MidFreq'),
      gainKey: key('MidGain'),
      qKey: key('MidQ'),
      edge: null,
      color: AMBER,
      freq: readEqNumber(state, key('MidFreq'), eqId === 'eq1' ? 1000 : 2200, sliderProps),
      gain: readEqNumber(state, key('MidGain'), 0, sliderProps),
      q: readEqNumber(state, key('MidQ'), 0.9, sliderProps),
      slope: 1,
      type: 'bell',
    },
    {
      band: 'high',
      label: 'HIGH',
      freqKey: key('HighFreq'),
      gainKey: key('HighGain'),
      qKey: key('HighQ'),
      slopeKey: key('HighSlope'),
      typeKey: key('HighType'),
      edge: 'high',
      color: ROSE,
      freq: readEqNumber(state, key('HighFreq'), eqId === 'eq1' ? 8000 : 10000, sliderProps),
      gain: highType === 'highpass' || highType === 'lowpass' ? 0 : readEqNumber(state, key('HighGain'), 0, sliderProps),
      q: readEqNumber(state, key('HighQ'), 0.7, sliderProps),
      slope: readEqNumber(state, key('HighSlope'), 1, sliderProps),
      type: highType,
    },
  ];
}

function bellResponseDb(freq: number, center: number, gain: number, q: number): number {
  const octaveDistance = Math.log2(Math.max(0.001, freq / Math.max(1, center)));
  const width = Math.max(0.12, 1.45 / Math.max(EQ_Q_MIN, q));
  return gain * Math.exp(-(octaveDistance * octaveDistance) / (2 * width * width));
}

function shelfResponseDb(freq: number, center: number, gain: number, slope: number, edge: 'low' | 'high'): number {
  const steepness = Math.max(0.25, slope) * 2.15;
  const ratio = edge === 'low'
    ? Math.max(0.0001, freq / Math.max(1, center))
    : Math.max(0.0001, Math.max(1, center) / freq);
  return gain / (1 + Math.pow(ratio, steepness));
}

function eqBandResponseDb(freq: number, band: DynamicsEqBandState): number {
  if (band.type === 'highpass' || band.type === 'lowpass') {
    const ratio = Math.max(0.000001, freq / Math.max(1, band.freq));
    const denominator = (1 - ratio * ratio) ** 2 + (ratio / Math.max(EQ_Q_MIN, band.q)) ** 2;
    const numerator = band.type === 'highpass' ? ratio ** 4 : 1;
    return 10 * Math.log10(Math.max(0.000001, numerator / Math.max(0.000001, denominator)));
  }
  if (band.edge && band.type === 'shelf') {
    return shelfResponseDb(freq, band.freq, band.gain, band.slope, band.edge);
  }
  return bellResponseDb(freq, band.freq, band.gain, band.q);
}

function getEqTrimDb(state: SliderState, eqId: DynamicsEqId, sliderProps: DynamicsEqSliderProps): number {
  const prefix = eqId === 'eq1' ? 'dynamicsEq1' : 'dynamicsEq2';
  return readEqNumber(state, `${prefix}InputGain` as keyof SliderState, 0, sliderProps) +
    readEqNumber(state, `${prefix}OutputGain` as keyof SliderState, 0, sliderProps);
}

type DynamicsEqVisualizerProps = EditableVisualizerProps & {
  eqId: DynamicsEqId;
  sliderProps: DynamicsEqSliderProps;
};

export function DynamicsEqVisualizer({ state, eqId, onParamChange, sliderProps }: DynamicsEqVisualizerProps) {
  const layoutRef = useRef<DynamicsEqLayout | null>(null);
  const activeHandleRef = useRef<DynamicsEqHandle | null>(null);
  const runtimeProjectionVersion = useRuntimeProjectionVersion(DYNAMICS_EQ_RUNTIME_KEYS[eqId]);
  const bands = useMemo(
    () => getEqBandStates(state, eqId, sliderProps),
    [eqId, runtimeProjectionVersion, sliderProps, state],
  );
  const trimDb = getEqTrimDb(state, eqId, sliderProps);
  const enabled = Boolean(state[eqId === 'eq1' ? 'dynamicsEq1Enabled' : 'dynamicsEq2Enabled']);
  const accent = eqId === 'eq1' ? CYAN : GREEN;

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    drawBase(ctx, width, height, accent);

    const pad = 12;
    const headerH = 18;
    const footerH = 20;
    const plot: Rect = {
      x: pad,
      y: pad + headerH,
      w: width - pad * 2,
      h: height - pad * 2 - headerH - footerH,
    };
    const freqToX = (freq: number) => plot.x + logNorm(freq, EQ_FREQ_MIN, EQ_FREQ_MAX) * plot.w;
    const dbToY = (db: number) => plot.y + (1 - clamp01((db - EQ_GAIN_MIN) / (EQ_GAIN_MAX - EQ_GAIN_MIN))) * plot.h;

    fillRoundedRect(ctx, plot, 7, PANEL_FILL);
    strokeRoundedRect(ctx, plot, 7, PANEL_STROKE);
    drawValue(ctx, `${eqId === 'eq1' ? 'EQ 1' : 'EQ 2'} RESPONSE`, plot.x, pad + 9, accent);
    drawBadge(ctx, enabled ? 'ACTIVE' : 'BYPASS', plot.x + plot.w, pad + 1, accent, 'right');

    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const labelFreqs = [50, 100, 1000, 10000];
    for (const freq of gridFreqs) {
      const x = freqToX(freq);
      ctx.strokeStyle = labelFreqs.includes(freq) ? GRID_STRONG : GRID_SOFT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, plot.y + 2);
      ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.h - 2);
      ctx.stroke();
    }
    for (const db of [-12, 0, 12]) {
      const y = dbToY(db);
      ctx.strokeStyle = db === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.06)';
      ctx.setLineDash(db === 0 ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(plot.x + 2, Math.round(y) + 0.5);
      ctx.lineTo(plot.x + plot.w - 2, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      drawCaption(ctx, `${db > 0 ? '+' : ''}${db}`, plot.x + 4, y - 5, MUTED);
    }

    const response: Point[] = [];
    const zeroY = dbToY(0);
    for (let i = 0; i <= 160; i += 1) {
      const unit = i / 160;
      const freq = fromLogNorm(unit, EQ_FREQ_MIN, EQ_FREQ_MAX);
      const bandDb = bands.reduce((sum, band) => sum + eqBandResponseDb(freq, band), trimDb);
      response.push({ x: plot.x + unit * plot.w, y: dbToY(clamp(bandDb, EQ_GAIN_MIN, EQ_GAIN_MAX)) });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    for (const point of response) ctx.lineTo(point.x, point.y);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
    fill.addColorStop(0, `${accent}28`);
    fill.addColorStop(0.5, `${accent}08`);
    fill.addColorStop(1, `${accent}20`);
    ctx.fillStyle = fill;
    ctx.fill();
    drawLinePath(ctx, response);
    ctx.strokeStyle = enabled ? `${accent}f2` : `${accent}76`;
    ctx.lineWidth = 2;
    ctx.stroke();

    const handles: DynamicsEqHandle[] = [];
    for (const band of bands) {
      const nodeX = freqToX(band.freq);
      const nodeY = dbToY(band.gain);
      const qOctaves = clamp(1 / Math.max(EQ_Q_MIN, band.q), 0.055, 2.4);
      const qFreq = clamp(band.freq * Math.pow(2, qOctaves), EQ_FREQ_MIN, EQ_FREQ_MAX);
      const qX = Math.max(nodeX + 9, freqToX(qFreq));
      const qY = nodeY;

      ctx.strokeStyle = `${band.color}5c`;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(nodeX, plot.y + 3);
      ctx.lineTo(nodeX, plot.y + plot.h - 3);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = `${band.color}70`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nodeX, nodeY);
      ctx.lineTo(qX, qY);
      ctx.stroke();

      ctx.fillStyle = activeHandleRef.current?.band === band.band && activeHandleRef.current.kind === 'q'
        ? HOT_TEXT
        : `${band.color}cc`;
      ctx.beginPath();
      ctx.arc(qX, qY, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = activeHandleRef.current?.band === band.band && activeHandleRef.current.kind === 'node'
        ? HOT_TEXT
        : band.color;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const passLabel = band.type === 'highpass' ? 'HP' : band.type === 'lowpass' ? 'LP' : null;
      const badgeText = passLabel
        ? `${passLabel} ${formatEqHz(band.freq)} Q${band.q.toFixed(1)}`
        : `${band.label} ${formatEqHz(band.freq)} ${band.gain >= 0 ? '+' : ''}${band.gain.toFixed(1)}`;
      const badgeY = clamp(nodeY - 21, plot.y + 4, plot.y + plot.h - 21);
      drawBadge(ctx, badgeText, nodeX, badgeY, band.color, 'center');

      handles.push({ band: band.band, kind: 'node', x: nodeX, y: nodeY, radius: 14, plot });
      handles.push({ band: band.band, kind: 'q', x: qX, y: qY, radius: 12, plot });
    }
    layoutRef.current = { handles };
    ctx.restore();

    for (const freq of labelFreqs) {
      drawCaption(ctx, formatEqHz(freq), freqToX(freq), plot.y + plot.h + 11, MUTED, 'center');
    }
    drawCaption(ctx, `TRIM ${trimDb >= 0 ? '+' : ''}${trimDb.toFixed(1)} dB`, plot.x + plot.w - 4, plot.y + plot.h + 11, TEXT, 'right');
  }, [accent, bands, enabled, eqId, trimDb]);

  const updateHandle = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeHandleRef.current;
    if (!active) return;
    const band = bands.find((candidate) => candidate.band === active.band);
    if (!band) return;
    const point = getPointerPoint(event);
    const xUnit = clamp01((point.x - active.plot.x) / active.plot.w);
    const freq = clamp(fromLogNorm(xUnit, EQ_FREQ_MIN, EQ_FREQ_MAX), EQ_FREQ_MIN, EQ_FREQ_MAX);
    if (active.kind === 'node') {
      onParamChange(band.freqKey, roundStep(freq, 1));
      if (band.type !== 'highpass' && band.type !== 'lowpass') {
        const gainUnit = 1 - clamp01((point.y - active.plot.y) / active.plot.h);
        const gain = EQ_GAIN_MIN + gainUnit * (EQ_GAIN_MAX - EQ_GAIN_MIN);
        onParamChange(band.gainKey, roundStep(clamp(gain, EQ_GAIN_MIN, EQ_GAIN_MAX), 0.1));
      }
      return;
    }
    const octaves = Math.abs(Math.log2(Math.max(0.001, freq / Math.max(1, band.freq))));
    const q = clamp(1 / Math.max(0.055, octaves), EQ_Q_MIN, EQ_Q_MAX);
    onParamChange(band.qKey, roundStep(q, 0.1));
  }, [bands, onParamChange]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const point = getPointerPoint(event);
    let nearest: DynamicsEqHandle | null = null;
    let nearestDistance = Infinity;
    for (const handle of layout.handles) {
      const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
      if (distance < nearestDistance) {
        nearest = handle;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance > nearest.radius) return;
    activeHandleRef.current = nearest;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(event);
  }, [updateHandle]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeHandleRef.current) updateHandle(event);
  }, [updateHandle]);

  const handlePointerUp = useCallback(() => {
    activeHandleRef.current = null;
  }, []);

  return (
    <DynamicsCanvasSurface
      ariaLabel={`${eqId === 'eq1' ? 'EQ 1' : 'EQ 2'} editable response visualizer`}
      className="dynamics-viz-eq"
      draw={draw}
      interactive
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

type SidechainHandleId = 'threshold' | 'attack' | 'hold' | 'release';

type SidechainHandle = {
  id: SidechainHandleId;
  x: number;
  y: number;
  radius: number;
  track: Rect;
};

type SidechainLayout = {
  handles: SidechainHandle[];
};

export function DynamicsSidechainVisualizer({ state, onParamChange, getDynamicsTelemetry }: EditableVisualizerProps) {
  const layoutRef = useRef<SidechainLayout | null>(null);
  const activeHandleRef = useRef<SidechainHandleId | null>(null);

  const draw = useCallback(({ ctx, width, height }: CanvasDrawArgs) => {
    drawBase(ctx, width, height, CYAN);

    const pad = 11;
    const split = width * 0.49;
    const timeline: Rect = { x: pad, y: pad, w: split - pad * 1.5, h: height - pad * 2 };
    const detector: Rect = { x: split + 8, y: timeline.y, w: width - split - pad - 8, h: timeline.h };
    const transfer: Rect = { x: detector.x + 8, y: detector.y + 9, w: detector.w - 16, h: detector.h * 0.56 };
    const envelope: Rect = { x: detector.x + 8, y: transfer.y + transfer.h + 13, w: detector.w - 16, h: detector.y + detector.h - (transfer.y + transfer.h + 20) };

    fillRoundedRect(ctx, timeline, 7, PANEL_FILL);
    strokeRoundedRect(ctx, timeline, 7, PANEL_STROKE);
    fillRoundedRect(ctx, detector, 7, PANEL_FILL);
    strokeRoundedRect(ctx, detector, 7, PANEL_STROKE);
    drawSplitLine(ctx, split, timeline.y, timeline.h);

    const liveTelemetry = getLiveTelemetry(getDynamicsTelemetry);
    const now = liveTelemetry.contextTime;
    const eventWindowSeconds = 5.5;
    const liveEvents = liveTelemetry.sidechainEvents.filter((event) => now - event.time <= eventWindowSeconds + event.release * 3);
    const duckPoints: Point[] = [];
    for (let i = 0; i <= 100; i += 1) {
      const unit = i / 100;
      const sampleTime = now - eventWindowSeconds * (1 - unit);
      let duck = 0;
      for (const event of liveEvents) {
        const elapsed = sampleTime - event.time;
        if (elapsed < 0) continue;
        let shape = 0;
        if (elapsed <= event.attack) {
          shape = event.attack <= 0.0001 ? 1 : elapsed / event.attack;
        } else if (elapsed <= event.attack + event.hold) {
          shape = 1;
        } else {
          shape = Math.exp(-(elapsed - event.attack - event.hold) / Math.max(0.02, event.release / 3));
        }
        duck = Math.max(duck, clamp01(shape) * event.amount);
      }
      duckPoints.push({
        x: timeline.x + 8 + unit * (timeline.w - 16),
        y: timeline.y + 12 + duck * (timeline.h - 28),
      });
    }

    ctx.beginPath();
    ctx.moveTo(timeline.x + 8, timeline.y + 12);
    for (const point of duckPoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(timeline.x + timeline.w - 8, timeline.y + 12);
    ctx.closePath();
    const duckFill = ctx.createLinearGradient(0, timeline.y, 0, timeline.y + timeline.h);
    duckFill.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
    duckFill.addColorStop(1, 'rgba(6, 182, 212, 0.46)');
    ctx.fillStyle = duckFill;
    ctx.fill();
    drawLinePath(ctx, duckPoints);
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.92)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    for (const event of liveEvents) {
      const age = now - event.time;
      if (age < 0 || age > eventWindowSeconds) continue;
      const x = timeline.x + 8 + (1 - age / eventWindowSeconds) * (timeline.w - 16);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
      ctx.beginPath();
      ctx.moveTo(x, timeline.y + 7);
      ctx.lineTo(x, timeline.y + timeline.h - 7);
      ctx.stroke();
    }
    fillRoundedRect(ctx, transfer, 5, 'rgba(255, 255, 255, 0.028)');
    const transferPoints: Point[] = [];
    for (let i = 0; i <= 82; i += 1) {
      const unit = i / 82;
      const detectorDb = unitToDb(unit);
      const gr = compressionReductionDb(
        detectorDb,
        state.sidechainThreshold ?? -24,
        Math.max(0, state.sidechainKnee ?? 6),
        Math.max(1, state.sidechainRatio ?? 4),
      );
      transferPoints.push({
        x: transfer.x + unit * transfer.w,
        y: transfer.y + transfer.h - clamp01(gr / 32) * transfer.h,
      });
    }
    drawLinePath(ctx, transferPoints);
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const thresholdX = transfer.x + dbToUnit(state.sidechainThreshold ?? -24) * transfer.w;
    ctx.strokeStyle = activeHandleRef.current === 'threshold' ? HOT_TEXT : 'rgba(184, 224, 255, 0.62)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, transfer.y + 2);
    ctx.lineTo(thresholdX, transfer.y + transfer.h - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const handles: SidechainHandle[] = [
      {
        id: 'threshold',
        x: thresholdX,
        y: transfer.y + transfer.h / 2,
        radius: 10,
        track: transfer,
      },
    ];

    const tracks = [
      { id: 'attack' as const, value: logNorm(state.sidechainAttackMs ?? 5, 0.1, 100), color: GREEN },
      { id: 'hold' as const, value: clamp01((state.sidechainHoldMs ?? 20) / 250), color: AMBER },
      { id: 'release' as const, value: logNorm(state.sidechainReleaseMs ?? 180, 20, 1500), color: ROSE },
    ];
    tracks.forEach((track, index) => {
      const y = envelope.y + 8 + index * Math.max(13, envelope.h / 3);
      const trackRect: Rect = { x: envelope.x + 8, y: y - 2, w: envelope.w - 16, h: 4 };
      fillRoundedRect(ctx, trackRect, 2, 'rgba(255, 255, 255, 0.12)');
      fillRoundedRect(ctx, { ...trackRect, w: trackRect.w * track.value }, 2, `${track.color}90`);
      const handleX = trackRect.x + track.value * trackRect.w;
      ctx.fillStyle = activeHandleRef.current === track.id ? HOT_TEXT : track.color;
      ctx.beginPath();
      ctx.arc(handleX, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      handles.push({ id: track.id, x: handleX, y, radius: 10, track: trackRect });
    });
    layoutRef.current = { handles };
  }, [
    getDynamicsTelemetry,
    state.sidechainAttackMs,
    state.sidechainHoldMs,
    state.sidechainKnee,
    state.sidechainRatio,
    state.sidechainReleaseMs,
    state.sidechainThreshold,
  ]);

  const updateDetector = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const id = activeHandleRef.current;
    const layout = layoutRef.current;
    if (!id || !layout) return;
    const handle = layout.handles.find((candidate) => candidate.id === id);
    if (!handle) return;
    const point = getPointerPoint(event);
    const unit = clamp01((point.x - handle.track.x) / handle.track.w);
    if (id === 'threshold') {
      onParamChange('sidechainThreshold', roundStep(unitToDb(unit), 1));
    } else if (id === 'attack') {
      onParamChange('sidechainAttackMs', roundStep(clamp(fromLogNorm(unit, 0.1, 100), 0.1, 100), 0.1));
    } else if (id === 'hold') {
      onParamChange('sidechainHoldMs', roundStep(unit * 250, 1));
    } else {
      onParamChange('sidechainReleaseMs', roundStep(clamp(fromLogNorm(unit, 20, 1500), 20, 1500), 5));
    }
  }, [onParamChange]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const point = getPointerPoint(event);
    let nearest: SidechainHandle | null = null;
    let nearestDistance = Infinity;
    for (const handle of layout.handles) {
      const distance = handle.id === 'threshold'
        ? Math.abs(point.x - handle.x) + Math.max(0, Math.abs(point.y - handle.y) - handle.track.h / 2)
        : Math.hypot(point.x - handle.x, point.y - handle.y);
      if (distance < nearestDistance) {
        nearest = handle;
        nearestDistance = distance;
      }
    }
    if (!nearest || nearestDistance > nearest.radius) return;
    activeHandleRef.current = nearest.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDetector(event);
  }, [updateDetector]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeHandleRef.current) updateDetector(event);
  }, [updateDetector]);

  const handlePointerUp = useCallback(() => {
    activeHandleRef.current = null;
  }, []);

  return (
    <DynamicsCanvasSurface
      ariaLabel="Sidechain visualizer"
      className="dynamics-viz-sidechain"
      draw={draw}
      interactive
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
