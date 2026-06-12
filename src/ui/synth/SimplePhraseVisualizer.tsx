import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPadChordPhrasePreview,
  createRandomTimingPhrasePreview,
  envelopeAmplitudeAt,
  type SimpleSequencerPhrasePreview,
  type SimpleSequencerVizKind,
  type SimpleSequencerVizNote,
} from '../../audio/simpleSequencerPhrasePreview';
import type { TransportDebugSnapshot } from '../../audio/transport';
import type { SliderState } from '../state';
import { SOURCE_COLORS } from '../../designSystem/colors';

interface SimplePhraseVisualizerProps {
  kind: SimpleSequencerVizKind;
  state: SliderState;
  isRunning: boolean;
  transportDebug?: TransportDebugSnapshot | null;
}

type PhaseAnchor = {
  wallSeconds: number;
  elapsedSeconds: number;
  phraseSeconds: number;
};

const NOTE_FLOOR = 0.0008;
const FRAME_MS = 33;
const PLOT_PAD_X = 30;
const PLOT_PAD_TOP = 14;
const PLOT_PAD_BOTTOM = 20;

function sourceColor(source: string): string {
  if (source === 'pad2') return SOURCE_COLORS.pad2;
  if (source === 'lead1') return SOURCE_COLORS.lead1;
  if (source === 'lead2') return SOURCE_COLORS.lead2;
  if (source === 'piano') return SOURCE_COLORS.piano;
  return SOURCE_COLORS.pad1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function phraseProgress(anchor: PhaseAnchor | null, phraseSeconds: number, isRunning: boolean): number {
  if (!isRunning || !anchor) return 0;
  const now = performance.now() / 1000;
  const elapsed = anchor.elapsedSeconds + (now - anchor.wallSeconds);
  const period = Math.max(0.001, anchor.phraseSeconds || phraseSeconds);
  return ((elapsed % period) + period) % period;
}

function rangeFor(current: SimpleSequencerPhrasePreview, previous: SimpleSequencerPhrasePreview): { min: number; max: number } {
  const midiValues = [
    current.minMidi,
    current.maxMidi,
    previous.minMidi,
    previous.maxMidi,
    ...(current.rangeMinMidi != null ? [current.rangeMinMidi] : []),
    ...(current.rangeMaxMidi != null ? [current.rangeMaxMidi] : []),
  ].filter((value) => Number.isFinite(value));
  const min = Math.min(...midiValues);
  const max = Math.max(...midiValues);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { min: 48, max: 72 };
  return { min, max };
}

function noteY(note: SimpleSequencerVizNote, minMidi: number, maxMidi: number, y: number, height: number): number {
  const denom = Math.max(1, maxMidi - minMidi);
  return y + (1 - clamp((note.midi - minMidi) / denom, 0, 1)) * height;
}

function noteX(note: SimpleSequencerVizNote, phraseSeconds: number, x: number, width: number): number {
  return x + clamp(note.triggerSeconds / Math.max(0.001, phraseSeconds), 0, 1) * width;
}

function drawGlowingNote(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
  label: string,
  drawLabel: boolean,
): void {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.8);
  glow.addColorStop(0, color);
  glow.addColorStop(0.28, `${color}${Math.round(180 * alpha).toString(16).padStart(2, '0')}`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = clamp(alpha + 0.08, 0, 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = clamp(alpha * 0.8, 0, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2);
  ctx.stroke();

  if (drawLabel) {
    ctx.globalAlpha = clamp(alpha + 0.22, 0, 1);
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,245,255,0.9)';
    ctx.fillText(label, x, y - radius - 9);
  }
  ctx.globalAlpha = 1;
}

function drawVisualizer(
  canvas: HTMLCanvasElement,
  current: SimpleSequencerPhrasePreview,
  previous: SimpleSequencerPhrasePreview,
  phaseSeconds: number,
): void {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const nextWidth = Math.floor(cssWidth * dpr);
  const nextHeight = Math.floor(cssHeight * dpr);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const plotX = PLOT_PAD_X;
  const plotY = PLOT_PAD_TOP;
  const plotW = Math.max(1, cssWidth - PLOT_PAD_X - 14);
  const plotH = Math.max(1, cssHeight - PLOT_PAD_TOP - PLOT_PAD_BOTTOM);

  ctx.fillStyle = 'rgba(3,7,18,0.72)';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = plotX + (i / 4) * plotW;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, plotY);
    ctx.lineTo(Math.round(x) + 0.5, plotY + plotH);
    ctx.stroke();
  }
  for (let i = 0; i <= 3; i += 1) {
    const y = plotY + (i / 3) * plotH;
    ctx.beginPath();
    ctx.moveTo(plotX, Math.round(y) + 0.5);
    ctx.lineTo(plotX + plotW, Math.round(y) + 0.5);
    ctx.stroke();
  }

  if (current.kind === 'randomTiming' && current.rangeMinMidi != null && current.rangeMaxMidi != null) {
    const range = rangeFor(current, previous);
    const top = noteY({ midi: current.rangeMaxMidi } as SimpleSequencerVizNote, range.min, range.max, plotY, plotH);
    const bottom = noteY({ midi: current.rangeMinMidi } as SimpleSequencerVizNote, range.min, range.max, plotY, plotH);
    ctx.fillStyle = 'rgba(96,165,250,0.08)';
    ctx.fillRect(plotX, top, plotW, Math.max(2, bottom - top));
    ctx.strokeStyle = 'rgba(96,165,250,0.18)';
    ctx.strokeRect(plotX, top, plotW, Math.max(2, bottom - top));
  }

  const range = rangeFor(current, previous);
  const drawLabel = current.notes.length <= 24 && cssWidth > 260;

  const drawNoteSet = (preview: SimpleSequencerPhrasePreview, isPrevious: boolean) => {
    for (const note of preview.notes) {
      const age = isPrevious
        ? phaseSeconds + current.phraseSeconds - note.triggerSeconds
        : phaseSeconds - note.triggerSeconds;
      const amp = envelopeAmplitudeAt(age, note.envelope);
      if (isPrevious && amp <= NOTE_FLOOR) continue;
      const future = age < 0;
      const color = sourceColor(note.source);
      const x = noteX(note, preview.phraseSeconds, plotX, plotW);
      const y = noteY(note, range.min, range.max, plotY, plotH);
      const baseAlpha = future ? 0.22 : clamp(0.14 + amp * 0.86, 0, 1);
      const alpha = isPrevious ? baseAlpha * 0.72 : baseAlpha;
      const radius = future ? 3.3 : 3.2 + amp * 5.2;
      drawGlowingNote(ctx, x, y, radius, color, alpha, note.label, drawLabel && (!future || !isPrevious));
    }
  };

  drawNoteSet(previous, true);
  drawNoteSet(current, false);

  const playheadX = plotX + clamp(phaseSeconds / Math.max(0.001, current.phraseSeconds), 0, 1) * plotW;
  ctx.strokeStyle = 'rgba(232,240,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, plotY - 2);
  ctx.lineTo(playheadX, plotY + plotH + 2);
  ctx.stroke();

  const untilNext = Math.max(0, current.phraseSeconds - phaseSeconds);
  ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.72)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${untilNext.toFixed(untilNext < 10 ? 1 : 0)}s`, plotX, cssHeight - 5);
  ctx.textAlign = 'right';
  ctx.fillText(`${current.phraseSeconds.toFixed(0)}s phrase`, plotX + plotW, cssHeight - 5);

  if (!current.enabled) {
    ctx.fillStyle = 'rgba(2,6,23,0.62)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = 'rgba(226,232,240,0.48)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Off', cssWidth / 2, cssHeight / 2);
  }

  ctx.restore();
}

export const SimplePhraseVisualizer: React.FC<SimplePhraseVisualizerProps> = ({
  kind,
  state,
  isRunning,
  transportDebug,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastPhaseRef = useRef(0);
  const [phraseCounter, setPhraseCounter] = useState(0);
  const anchorRef = useRef<PhaseAnchor | null>(null);

  const currentPreview = useMemo(
    () => kind === 'padChord'
      ? createPadChordPhrasePreview(state, phraseCounter)
      : createRandomTimingPhrasePreview(state, phraseCounter),
    [kind, phraseCounter, state],
  );
  const previousPreview = useMemo(
    () => kind === 'padChord'
      ? createPadChordPhrasePreview(state, Math.max(0, phraseCounter - 1))
      : createRandomTimingPhrasePreview(state, Math.max(0, phraseCounter - 1)),
    [kind, phraseCounter, state],
  );

  useEffect(() => {
    const phraseSeconds = currentPreview.phraseSeconds;
    const debugNext = transportDebug?.nextPhraseBoundaryIn;
    const elapsed = Number.isFinite(debugNext)
      ? clamp(phraseSeconds - Math.max(0, debugNext ?? phraseSeconds), 0, phraseSeconds)
      : lastPhaseRef.current;
    anchorRef.current = {
      wallSeconds: performance.now() / 1000,
      elapsedSeconds: elapsed,
      phraseSeconds,
    };
  }, [currentPreview.phraseSeconds, transportDebug?.nextPhraseBoundaryIn]);

  useEffect(() => {
    if (!isRunning) {
      lastPhaseRef.current = 0;
      setPhraseCounter(0);
      anchorRef.current = {
        wallSeconds: performance.now() / 1000,
        elapsedSeconds: 0,
        phraseSeconds: currentPreview.phraseSeconds,
      };
    }
  }, [currentPreview.phraseSeconds, isRunning]);

  useEffect(() => {
    const tick = (time: number) => {
      if (time - lastFrameRef.current >= FRAME_MS) {
        lastFrameRef.current = time;
        const phase = phraseProgress(anchorRef.current, currentPreview.phraseSeconds, isRunning);
        if (isRunning && lastPhaseRef.current > currentPreview.phraseSeconds * 0.75 && phase < currentPreview.phraseSeconds * 0.25) {
          setPhraseCounter((value) => value + 1);
        }
        lastPhaseRef.current = phase;
        const canvas = canvasRef.current;
        if (canvas) drawVisualizer(canvas, currentPreview, previousPreview, phase);
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };

    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [currentPreview, isRunning, previousPreview]);

  return (
    <div className="simple-phrase-viz" aria-label={kind === 'padChord' ? 'Pad chord phrase visualizer' : 'Random timing phrase visualizer'}>
      <canvas ref={canvasRef} />
    </div>
  );
};
