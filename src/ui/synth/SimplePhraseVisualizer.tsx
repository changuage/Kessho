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

type PhrasePlanState = {
  index: number;
  currentState: SliderState;
  previousState: SliderState;
};

type PhraseVisualTransition = {
  toKey: string;
  startedAtMs: number;
  durationMs: number;
  fromPhraseSeconds: number;
  fromPhraseStartWallSec?: number;
  fromNotes: Map<string, SimpleSequencerVizNote>;
};

const NOTE_FLOOR = 0.0008;
const FRAME_MS = 33;
const PHRASE_TRANSITION_MIN_MS = 480;
const PHRASE_TRANSITION_MAX_MS = 1680;
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

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function phraseTransitionDurationMs(phraseSeconds: number): number {
  return clamp(phraseSeconds * 1000 * 0.24, PHRASE_TRANSITION_MIN_MS, PHRASE_TRANSITION_MAX_MS);
}

function phraseProgress(anchor: PhaseAnchor | null, phraseSeconds: number, isRunning: boolean): number {
  if (!isRunning || !anchor) return 0;
  const now = performance.now() / 1000;
  const elapsed = anchor.elapsedSeconds + (now - anchor.wallSeconds);
  const period = Math.max(0.001, anchor.phraseSeconds || phraseSeconds);
  return ((elapsed % period) + period) % period;
}

function noteMotionKey(note: SimpleSequencerVizNote, preview: SimpleSequencerPhrasePreview): string {
  if (typeof note.triggerWallSec === 'number' && Number.isFinite(note.triggerWallSec)) {
    return `${preview.kind}:runtime:${note.id}`;
  }
  const midi = Math.round(note.midi);
  if (preview.kind === 'padChord') {
    const chordIndex = Math.floor((note.triggerSeconds + 0.0001) / Math.max(0.001, preview.triggerIntervalSeconds));
    return `${preview.kind}:${note.source}:${note.voiceIndex ?? 0}:${chordIndex}:${midi}`;
  }
  return `${preview.kind}:${note.source}:${note.voiceIndex ?? 0}:${midi}`;
}

function motionNoteMap(preview: SimpleSequencerPhrasePreview): Map<string, SimpleSequencerVizNote> {
  const map = new Map<string, SimpleSequencerVizNote>();
  for (const note of preview.notes) map.set(noteMotionKey(note, preview), note);
  return map;
}

function sequencerBoundaryIn(
  kind: SimpleSequencerVizKind,
  transportDebug: TransportDebugSnapshot | null | undefined,
): number | null {
  if (!transportDebug) return null;
  const value = kind === 'padChord'
    ? transportDebug.nextPadChordBoundaryIn ?? transportDebug.nextPhraseBoundaryIn
    : transportDebug.nextRandomTimingBoundaryIn ?? transportDebug.nextPhraseBoundaryIn;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sequencerPhraseSeconds(
  kind: SimpleSequencerVizKind,
  transportDebug: TransportDebugSnapshot | null | undefined,
  fallback: number,
): number {
  if (!transportDebug) return fallback;
  const value = kind === 'padChord'
    ? transportDebug.padChordPhraseSeconds ?? transportDebug.effectivePhraseSeconds
    : transportDebug.randomTimingPhraseSeconds ?? transportDebug.effectivePhraseSeconds;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function runtimePlanForKind(
  kind: SimpleSequencerVizKind,
  transportDebug: TransportDebugSnapshot | null | undefined,
): SimpleSequencerPhrasePreview | null {
  const plan = kind === 'padChord' ? transportDebug?.padChordPlan : transportDebug?.randomTimingPlan;
  return plan && plan.kind === kind ? plan : null;
}

function previousRuntimePlanForKind(
  kind: SimpleSequencerVizKind,
  transportDebug: TransportDebugSnapshot | null | undefined,
): SimpleSequencerPhrasePreview | null {
  const plan = kind === 'padChord' ? transportDebug?.previousPadChordPlan : transportDebug?.previousRandomTimingPlan;
  return plan && plan.kind === kind ? plan : null;
}

function rangeFor(current: SimpleSequencerPhrasePreview, previous: SimpleSequencerPhrasePreview | null): { min: number; max: number } {
  const midiValues = [
    current.minMidi,
    current.maxMidi,
    ...(previous ? [previous.minMidi, previous.maxMidi] : []),
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

function noteX(
  note: SimpleSequencerVizNote,
  phraseSeconds: number,
  x: number,
  width: number,
  phraseStartWallSec?: number | null,
): number {
  const triggerSeconds = typeof note.triggerWallSec === 'number' &&
    Number.isFinite(note.triggerWallSec) &&
    typeof phraseStartWallSec === 'number' &&
    Number.isFinite(phraseStartWallSec)
    ? note.triggerWallSec - phraseStartWallSec
    : note.triggerSeconds;
  return x + clamp(triggerSeconds / Math.max(0.001, phraseSeconds), 0, 1) * width;
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
  previous: SimpleSequencerPhrasePreview | null,
  phaseSeconds: number,
  transition: PhraseVisualTransition | null,
  nowMs: number,
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
  const transitionProgress = transition && transition.toKey === current.key
    ? clamp((nowMs - transition.startedAtMs) / Math.max(1, transition.durationMs), 0, 1)
    : 1;
  const transitionEase = easeOutCubic(transitionProgress);
  const transitionActive = Boolean(transition && transition.toKey === current.key && transitionProgress < 1);
  const currentPhraseStartWallSec = current.phraseStartWallSec ?? null;
  const currentWallSeconds = typeof currentPhraseStartWallSec === 'number' && Number.isFinite(currentPhraseStartWallSec)
    ? currentPhraseStartWallSec + phaseSeconds
    : null;

  const drawNoteSet = (preview: SimpleSequencerPhrasePreview, isPrevious: boolean) => {
    for (const note of preview.notes) {
      const fallbackAge = isPrevious
        ? phaseSeconds + current.phraseSeconds - note.triggerSeconds
        : phaseSeconds - note.triggerSeconds;
      const age = currentWallSeconds !== null &&
        typeof note.triggerWallSec === 'number' &&
        Number.isFinite(note.triggerWallSec)
        ? currentWallSeconds - note.triggerWallSec
        : fallbackAge;
      const amp = envelopeAmplitudeAt(age, note.envelope);
      if (isPrevious && age >= 0 && amp <= NOTE_FLOOR) continue;
      const future = age < 0;
      const color = sourceColor(note.source);
      let x = noteX(note, current.phraseSeconds, plotX, plotW, currentPhraseStartWallSec ?? preview.phraseStartWallSec);
      let y = noteY(note, range.min, range.max, plotY, plotH);
      const baseAlpha = future ? 0.22 : clamp(0.14 + amp * 0.86, 0, 1);
      let alpha = isPrevious ? baseAlpha * 0.72 : baseAlpha;
      let radius = future ? 3.3 : 3.2 + amp * 5.2;
      if (transitionActive && transition) {
        const fromNote = transition.fromNotes.get(noteMotionKey(note, preview));
        if (fromNote) {
          x = lerp(noteX(fromNote, transition.fromPhraseSeconds, plotX, plotW, transition.fromPhraseStartWallSec), x, transitionEase);
          y = lerp(noteY(fromNote, range.min, range.max, plotY, plotH), y, transitionEase);
        } else if (!isPrevious) {
          alpha *= transitionEase;
          radius = lerp(2.1, radius, transitionEase);
        }
      }
      drawGlowingNote(ctx, x, y, radius, color, alpha, note.label, drawLabel && !isPrevious && !future);
    }
  };

  if (previous) drawNoteSet(previous, true);
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
  const latestStateRef = useRef(state);
  const wasRunningRef = useRef(isRunning);
  const previousCurrentPreviewRef = useRef<SimpleSequencerPhrasePreview | null>(null);
  const transitionRef = useRef<PhraseVisualTransition | null>(null);
  const [phrasePlan, setPhrasePlan] = useState<PhrasePlanState>(() => ({
    index: 0,
    currentState: state,
    previousState: state,
  }));
  const anchorRef = useRef<PhaseAnchor | null>(null);

  useEffect(() => {
    latestStateRef.current = state;
    if (!isRunning) {
      setPhrasePlan({
        index: 0,
        currentState: state,
        previousState: state,
      });
    }
  }, [isRunning, state]);

  useEffect(() => {
    if (isRunning && !wasRunningRef.current) {
      const nextState = latestStateRef.current;
      setPhrasePlan({
        index: 0,
        currentState: nextState,
        previousState: nextState,
      });
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const runtimeCurrentPlan = runtimePlanForKind(kind, transportDebug);
  const runtimePreviousPlan = previousRuntimePlanForKind(kind, transportDebug);
  const currentPreview = useMemo(
    () => runtimeCurrentPlan ?? (
      kind === 'padChord'
        ? createPadChordPhrasePreview(phrasePlan.currentState, phrasePlan.index)
        : createRandomTimingPhrasePreview(phrasePlan.currentState, phrasePlan.index)
    ),
    [kind, phrasePlan, runtimeCurrentPlan?.key],
  );
  const previousPreview = useMemo(
    (): SimpleSequencerPhrasePreview | null => runtimePreviousPlan ?? (
      phrasePlan.index <= 0
        ? null
        : kind === 'padChord'
        ? createPadChordPhrasePreview(phrasePlan.previousState, Math.max(0, phrasePlan.index - 1))
        : createRandomTimingPhrasePreview(phrasePlan.previousState, Math.max(0, phrasePlan.index - 1))
    ),
    [kind, phrasePlan, runtimePreviousPlan?.key],
  );

  useEffect(() => {
    const previousCurrent = previousCurrentPreviewRef.current;
    if (
      isRunning &&
      previousCurrent &&
      previousCurrent.kind === currentPreview.kind &&
      previousCurrent.enabled &&
      currentPreview.enabled &&
      previousCurrent.key !== currentPreview.key
    ) {
      transitionRef.current = {
        toKey: currentPreview.key,
        startedAtMs: performance.now(),
        durationMs: phraseTransitionDurationMs(currentPreview.phraseSeconds),
        fromPhraseSeconds: previousCurrent.phraseSeconds,
        fromPhraseStartWallSec: previousCurrent.phraseStartWallSec,
        fromNotes: motionNoteMap(previousCurrent),
      };
    } else if (!isRunning || previousCurrent?.kind !== currentPreview.kind || !currentPreview.enabled) {
      transitionRef.current = null;
    }
    previousCurrentPreviewRef.current = currentPreview;
  }, [currentPreview, isRunning]);

  useEffect(() => {
    const phraseSeconds = sequencerPhraseSeconds(kind, transportDebug, currentPreview.phraseSeconds);
    const debugNext = sequencerBoundaryIn(kind, transportDebug);
    const elapsed = debugNext !== null
      ? clamp(phraseSeconds - Math.max(0, debugNext), 0, phraseSeconds)
      : lastPhaseRef.current;
    anchorRef.current = {
      wallSeconds: performance.now() / 1000,
      elapsedSeconds: elapsed,
      phraseSeconds,
    };
  }, [
    currentPreview.phraseSeconds,
    kind,
    transportDebug?.effectivePhraseSeconds,
    transportDebug?.nextPhraseBoundaryIn,
    transportDebug?.nextPadChordBoundaryIn,
    transportDebug?.nextRandomTimingBoundaryIn,
    transportDebug?.padChordPhraseSeconds,
    transportDebug?.randomTimingPhraseSeconds,
  ]);

  useEffect(() => {
    if (!isRunning) {
      lastPhaseRef.current = 0;
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
          setPhrasePlan((plan) => ({
            index: plan.index + 1,
            previousState: plan.currentState,
            currentState: latestStateRef.current,
          }));
        }
        lastPhaseRef.current = phase;
        const canvas = canvasRef.current;
        if (transitionRef.current && time - transitionRef.current.startedAtMs >= transitionRef.current.durationMs) {
          transitionRef.current = null;
        }
        if (canvas) drawVisualizer(canvas, currentPreview, previousPreview, phase, transitionRef.current, time);
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
