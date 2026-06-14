import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { OrbitNoteConfig, OrbitRuntimeVisualState, OrbitSequencerConfig, OrbitSplineConfig } from './orbitSequencerTypes';
import {
  ORBIT_RADIUS_SCALE,
  adjustedOrbitSpeedValue,
  cartesianToPolar,
  directionSign,
  lineAngleOffset,
  polarToCartesian,
  resolveAngularSpeed,
  rotateOrbitPoint,
  sampleBezierSpline,
  snapOrbitPhase,
  splineAngleAtRadius,
  wrapRadians,
  type OrbitPoint,
  type OrbitSplineSample,
} from './orbitSequencerMath';

interface OrbitSequencerCanvasProps {
  config: OrbitSequencerConfig;
  color: string;
  selectedNoteId: string | null;
  active: boolean;
  transportBpm?: number;
  runtimeVisualState?: OrbitRuntimeVisualState | null;
  playbackEditActive?: boolean;
  onSelectNote: (id: string | null) => void;
  onAddNote: (radiusNorm: number, phase: number) => void;
  onMoveNote: (id: string, radiusNorm: number, phase: number) => void;
  onUpdateSpline: (patch: Partial<OrbitSplineConfig>) => void;
}

interface RuntimeNote {
  id: string;
  angle: number;
  flash: number;
}

type DragState =
  | { type: 'note'; id: string }
  | { type: 'handle'; index: 0 | 1 | 2 }
  | null;

const HANDLE_KEYS = ['handle1', 'handle2', 'tip'] as const;
const HANDLE_HIT_RADIUS = 14;
const NOTE_HIT_RADIUS = 18;
const MAX_SPLINE_SAMPLE_CACHE_SIZE = 96;
const AUTHORED_VISUAL_GUARD_MS = 900;

type SplineSampleCacheKey = string;

const splineSampleCache = new Map<SplineSampleCacheKey, OrbitSplineSample[]>();

function splineCacheKey(
  spline: OrbitSplineConfig,
  steps: number,
  angle: number,
): SplineSampleCacheKey {
  return [
    steps,
    spline.handle1.x.toFixed(4),
    spline.handle1.y.toFixed(4),
    spline.handle2.x.toFixed(4),
    spline.handle2.y.toFixed(4),
    spline.tip.x.toFixed(4),
    spline.tip.y.toFixed(4),
    angle.toFixed(4),
  ].join(':');
}

function cachedSampleBezierSpline(
  spline: OrbitSplineConfig,
  steps: number,
  angle: number,
): OrbitSplineSample[] {
  const key = splineCacheKey(spline, steps, angle);
  const cached = splineSampleCache.get(key);
  if (cached) return cached;

  const samples = sampleBezierSpline(spline, steps, angle);
  splineSampleCache.set(key, samples);
  if (splineSampleCache.size > MAX_SPLINE_SAMPLE_CACHE_SIZE) {
    const firstKey = splineSampleCache.keys().next().value;
    if (firstKey) splineSampleCache.delete(firstKey);
  }
  return samples;
}

function splineVisualSignature(spline: OrbitSplineConfig): string {
  return [
    spline.handle1.x.toFixed(4),
    spline.handle1.y.toFixed(4),
    spline.handle2.x.toFixed(4),
    spline.handle2.y.toFixed(4),
    spline.tip.x.toFixed(4),
    spline.tip.y.toFixed(4),
    spline.baseAngle.toFixed(4),
    spline.spinEnabled ? 1 : 0,
    spline.spinDirection,
  ].join('|');
}

function noteVisualSignature(note: OrbitNoteConfig): string {
  return [
    note.enabled ? 1 : 0,
    note.radiusNorm.toFixed(4),
    note.phase.toFixed(4),
  ].join('|');
}

function useRafCommit<T>(commit: (value: T) => void): [(value: T) => void, () => void] {
  const commitRef = useRef(commit);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef<T | null>(null);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const schedule = useCallback((value: T) => {
    latestRef.current = value;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const latest = latestRef.current;
      latestRef.current = null;
      if (latest !== null) commitRef.current(latest);
    });
  }, []);

  const flush = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const latest = latestRef.current;
    latestRef.current = null;
    if (latest !== null) commitRef.current(latest);
  }, []);

  return [schedule, flush];
}

function canvasRadius(size: number) {
  return size * ORBIT_RADIUS_SCALE;
}

function noteScreenPoint(note: OrbitNoteConfig, runtime: RuntimeNote | undefined, size: number) {
  return polarToCartesian(note.radiusNorm, runtime?.angle ?? note.phase, size);
}

function normalizedFromCanvas(x: number, y: number, size: number): OrbitPoint {
  const radius = canvasRadius(size);
  return {
    x: (x - size * 0.5) / radius,
    y: (y - size * 0.5) / radius,
  };
}

function normalizedToCanvas(point: OrbitPoint, size: number): OrbitPoint {
  const radius = canvasRadius(size);
  return {
    x: size * 0.5 + point.x * radius,
    y: size * 0.5 + point.y * radius,
  };
}

function clampNormalizedPoint(point: OrbitPoint): OrbitPoint {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= 1) return point;
  return {
    x: point.x / distance,
    y: point.y / distance,
  };
}

function rotatedHandlePoints(spline: OrbitSplineConfig): OrbitPoint[] {
  return [
    rotateOrbitPoint(spline.handle1, spline.baseAngle),
    rotateOrbitPoint(spline.handle2, spline.baseAngle),
    rotateOrbitPoint(spline.tip, spline.baseAngle),
  ];
}

function splineWithRuntimeBaseAngle(
  spline: OrbitSplineConfig,
  runtimeBaseAngle: number | undefined,
): OrbitSplineConfig {
  return typeof runtimeBaseAngle === 'number' && Number.isFinite(runtimeBaseAngle)
    ? { ...spline, baseAngle: runtimeBaseAngle }
    : spline;
}

function nearestHandleIndex(spline: OrbitSplineConfig, x: number, y: number, size: number): 0 | 1 | 2 | null {
  const handles = rotatedHandlePoints(spline);
  for (let index = 0; index < handles.length; index += 1) {
    const point = normalizedToCanvas(handles[index]!, size);
    if (Math.hypot(point.x - x, point.y - y) <= HANDLE_HIT_RADIUS) {
      return index as 0 | 1 | 2;
    }
  }
  return null;
}

function nearestNoteId(notes: readonly OrbitNoteConfig[], runtimes: Map<string, RuntimeNote>, x: number, y: number, size: number): string | null {
  let bestId: string | null = null;
  let bestDistance = NOTE_HIT_RADIUS;
  for (const note of notes) {
    const point = noteScreenPoint(note, runtimes.get(note.id), size);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = note.id;
    }
  }
  return bestId;
}

function snapPolarForConfig(radiusNorm: number, angle: number, config: OrbitSequencerConfig) {
  return {
    radiusNorm,
    angle: config.dragQuantize ? snapOrbitPhase(angle, config.quantizedOffset) : angle,
  };
}

function syncRuntimeToAuthoredNotes(
  runtimes: Map<string, RuntimeNote>,
  notes: readonly OrbitNoteConfig[],
): void {
  for (const note of notes) {
    const runtime = runtimes.get(note.id);
    if (runtime) {
      runtime.angle = note.phase;
    } else {
      runtimes.set(note.id, { id: note.id, angle: note.phase, flash: 0 });
    }
  }
}

function drawControlHandles(ctx: CanvasRenderingContext2D, spline: OrbitSplineConfig, radius: number, color: string) {
  const handles = rotatedHandlePoints(spline);
  const points = [{ x: 0, y: 0 }, ...handles];
  ctx.save();
  ctx.strokeStyle = 'rgba(232,220,196,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * radius;
    const y = point.y * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  handles.forEach((point, index) => {
    const x = point.x * radius;
    const y = point.y * radius;
    ctx.shadowColor = color;
    ctx.shadowBlur = index === 2 ? 12 : 7;
    ctx.strokeStyle = color;
    ctx.fillStyle = index === 2 ? 'rgba(232,220,196,0.92)' : 'rgba(16,15,14,0.92)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, index === 2 ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawOrbit(ctx: CanvasRenderingContext2D, args: {
  config: OrbitSequencerConfig;
  color: string;
  selectedNoteId: string | null;
  runtimes: Map<string, RuntimeNote>;
  width: number;
  height: number;
  runtimeBaseAngle?: number;
}) {
  const { config, color, selectedNoteId, runtimes, width, height, runtimeBaseAngle } = args;
  const size = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = canvasRadius(size);
  const spline = splineWithRuntimeBaseAngle(config.spline, runtimeBaseAngle);
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = 'rgba(232,220,196,0.08)';
  ctx.lineWidth = 1;
  for (const ring of [0.28, 0.46, 0.64, 0.82, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  const baseSamples = cachedSampleBezierSpline(spline, 64, spline.baseAngle);
  for (let line = 0; line < config.triggerLineCount; line += 1) {
    const offset = lineAngleOffset(line, config.triggerLineCount);
    const samples = cachedSampleBezierSpline(spline, 64, spline.baseAngle + offset);
    ctx.beginPath();
    samples.forEach((sample, index) => {
      const x = sample.x * radius;
      const y = sample.y * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = line === 0 ? color : 'rgba(184,224,255,0.34)';
    ctx.lineWidth = line === 0 ? 2 : 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = line === 0 ? 8 : 0;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  drawControlHandles(ctx, spline, radius, color);

  for (const note of config.notes) {
    const runtime = runtimes.get(note.id);
    const angle = runtime?.angle ?? note.phase;
    const point = polarToCartesian(note.radiusNorm, angle, size);
    const x = point.x - size * 0.5;
    const y = point.y - size * 0.5;
    const lineAngle = splineAngleAtRadius(note.radiusNorm, baseSamples);
    const radial = radius * note.radiusNorm;
    const flash = runtime?.flash ?? 0;

    ctx.strokeStyle = note.enabled ? 'rgba(232,220,196,0.16)' : 'rgba(232,220,196,0.06)';
    ctx.beginPath();
    ctx.arc(0, 0, radial, angle - 0.06, angle + 0.06);
    ctx.stroke();

    ctx.fillStyle = note.id === selectedNoteId ? color : note.enabled ? 'rgba(232,220,196,0.86)' : 'rgba(232,220,196,0.32)';
    ctx.strokeStyle = note.enabled ? color : 'rgba(232,220,196,0.16)';
    ctx.lineWidth = note.id === selectedNoteId ? 2 : 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = note.id === selectedNoteId || flash > 0.05 ? 12 + flash * 10 : 0;
    ctx.beginPath();
    ctx.arc(x, y, note.id === selectedNoteId ? 7 : 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(232,220,196,0.25)';
    ctx.beginPath();
    ctx.arc(Math.cos(lineAngle) * radial, Math.sin(lineAngle) * radial, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function OrbitSequencerCanvas({
  config,
  color,
  selectedNoteId,
  active,
  transportBpm = 120,
  runtimeVisualState = null,
  playbackEditActive = false,
  onSelectNote,
  onAddNote,
  onMoveNote,
  onUpdateSpline,
}: OrbitSequencerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef(config);
  const selectedNoteIdRef = useRef(selectedNoteId);
  const activeRef = useRef(active);
  const playbackEditActiveRef = useRef(playbackEditActive);
  const transportBpmRef = useRef(transportBpm);
  const runtimeVisualStateRef = useRef<OrbitRuntimeVisualState | null>(runtimeVisualState);
  const runtimeRef = useRef<Map<string, RuntimeNote>>(new Map());
  const phaseRef = useRef<Map<string, number>>(new Map());
  const speedOffsetRef = useRef(config.speedOffset);
  const dragStateRef = useRef<DragState>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const splineVisualSignatureRef = useRef<string | null>(null);
  const noteVisualSignatureRef = useRef<Map<string, string>>(new Map());
  const authoredNoteGuardUntilRef = useRef<Map<string, number>>(new Map());
  const authoredVisualGuardUntilRef = useRef(0);
  const [commitMoveNote, flushMoveNote] = useRafCommit<{
    id: string;
    radiusNorm: number;
    phase: number;
  }>(({ id, radiusNorm, phase }) => onMoveNote(id, radiusNorm, phase));
  const [commitUpdateSpline, flushUpdateSpline] = useRafCommit<Partial<OrbitSplineConfig>>(onUpdateSpline);

  useLayoutEffect(() => {
    configRef.current = config;
    const now = performance.now();
    const speedOffsetChanged = Math.abs(config.speedOffset - speedOffsetRef.current) > 1e-6;
    speedOffsetRef.current = config.speedOffset;
    if (speedOffsetChanged) {
      authoredNoteGuardUntilRef.current.clear();
      authoredVisualGuardUntilRef.current = 0;
      dragStateRef.current = null;
    }
    const nextVisualSignature = splineVisualSignature(config.spline);
    if (
      splineVisualSignatureRef.current !== null &&
      splineVisualSignatureRef.current !== nextVisualSignature
    ) {
      authoredVisualGuardUntilRef.current = now + AUTHORED_VISUAL_GUARD_MS;
    }
    splineVisualSignatureRef.current = nextVisualSignature;
    const runtimes = runtimeRef.current;
    const phases = phaseRef.current;
    const noteSignatures = noteVisualSignatureRef.current;
    const noteGuards = authoredNoteGuardUntilRef.current;
    const hadPreviousNotes = noteSignatures.size > 0;
    const nextNoteIds = new Set<string>();
    for (const note of config.notes) {
      nextNoteIds.add(note.id);
      const nextNoteSignature = noteVisualSignature(note);
      const previousNoteSignature = noteSignatures.get(note.id);
      if (
        (previousNoteSignature !== undefined && previousNoteSignature !== nextNoteSignature) ||
        (previousNoteSignature === undefined && hadPreviousNotes)
      ) {
        noteGuards.set(note.id, now + AUTHORED_VISUAL_GUARD_MS);
      }
      noteSignatures.set(note.id, nextNoteSignature);
      const previousPhase = phases.get(note.id);
      const runtime = runtimes.get(note.id);
      if (!runtime) {
        runtimes.set(note.id, { id: note.id, angle: note.phase, flash: 0 });
      } else if (previousPhase === undefined || Math.abs(note.phase - previousPhase) > 1e-6) {
        runtime.angle = note.phase;
      }
      phases.set(note.id, note.phase);
    }
    for (const id of Array.from(runtimes.keys())) {
      if (!config.notes.some((note) => note.id === id)) {
        runtimes.delete(id);
        phases.delete(id);
        noteSignatures.delete(id);
        noteGuards.delete(id);
      }
    }
    for (const id of Array.from(noteSignatures.keys())) {
      if (!nextNoteIds.has(id)) noteSignatures.delete(id);
    }
  }, [config]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      syncRuntimeToAuthoredNotes(runtimeRef.current, configRef.current.notes);
    }
  }, [active]);

  useEffect(() => {
    playbackEditActiveRef.current = playbackEditActive;
    if (playbackEditActive) {
      authoredNoteGuardUntilRef.current.clear();
      authoredVisualGuardUntilRef.current = 0;
      dragStateRef.current = null;
    }
  }, [playbackEditActive]);

  useEffect(() => {
    transportBpmRef.current = transportBpm;
  }, [transportBpm]);

  useEffect(() => {
    runtimeVisualStateRef.current = runtimeVisualState;
    if (!runtimeVisualState) return;
    if (!activeRef.current) return;
    const now = performance.now();
    const dragState = dragStateRef.current;
    if (dragState?.type === 'handle') return;
    const ignoreAuthoredGuards = playbackEditActiveRef.current;
    const draggingNoteId = !ignoreAuthoredGuards && dragState?.type === 'note' ? dragState.id : null;
    const runtimes = runtimeRef.current;
    const noteGuards = authoredNoteGuardUntilRef.current;
    for (let index = 0; index < configRef.current.notes.length; index += 1) {
      const note = configRef.current.notes[index];
      if (!note) continue;
      if (note.id === draggingNoteId) continue;
      const noteGuardUntil = ignoreAuthoredGuards ? 0 : noteGuards.get(note.id) ?? 0;
      if (noteGuardUntil > now) continue;
      if (!ignoreAuthoredGuards && noteGuardUntil > 0) noteGuards.delete(note.id);
      const angle = runtimeVisualState.noteAngles[index];
      if (typeof angle !== 'number' || !Number.isFinite(angle)) continue;
      const flash = Math.max(0, runtimeVisualState.noteFlashes[index] ?? 0);
      const runtime = runtimes.get(note.id);
      if (runtime) {
        runtime.angle = angle;
        runtime.flash = flash;
      } else {
        runtimes.set(note.id, { id: note.id, angle, flash });
      }
    }
  }, [runtimeVisualState]);

  const drawStaticOrbit = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height, dpr } = sizeRef.current;
    if (!canvas || !ctx || width <= 0 || height <= 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrbit(ctx, {
      config: configRef.current,
      color,
      selectedNoteId: selectedNoteIdRef.current,
      runtimes: runtimeRef.current,
      width,
      height,
      runtimeBaseAngle: activeRef.current ? runtimeVisualStateRef.current?.baseAngle : undefined,
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      sizeRef.current = { width, height, dpr };
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let idleTimer = 0;
    let lastTime = performance.now();

    const scheduleNext = () => {
      if (activeRef.current || dragStateRef.current) {
        raf = requestAnimationFrame(loop);
        return;
      }
      idleTimer = window.setTimeout(() => {
        loop(performance.now());
      }, 180);
    };

    const loop = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height, dpr } = sizeRef.current;
      if (canvas && ctx && width > 0 && height > 0) {
        const configNow = configRef.current;
        const dt = Math.max(0, (time - lastTime) / 1000);
        const decayDt = Math.min(0.05, dt);
        const shouldAdvance = activeRef.current;
        const transportBpmNow = transportBpmRef.current;
        const nativeRuntime = runtimeVisualStateRef.current;
        const dragState = dragStateRef.current;
        const playbackEditActiveNow = playbackEditActiveRef.current;
        const draggingNoteId = !playbackEditActiveNow && dragState?.type === 'note' ? dragState.id : null;
        const authoredVisualGuardActive = !playbackEditActiveNow && time < authoredVisualGuardUntilRef.current;
        const hasNativeRuntime = shouldAdvance && nativeRuntime !== null && nativeRuntime.noteAngles.length > 0;
        const noteGuards = authoredNoteGuardUntilRef.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (let noteIndex = 0; noteIndex < configNow.notes.length; noteIndex += 1) {
          const note = configNow.notes[noteIndex];
          if (!note) continue;
          const runtime = runtimeRef.current.get(note.id);
          if (!runtime) continue;
          const noteGuardUntil = playbackEditActiveNow ? 0 : noteGuards.get(note.id) ?? 0;
          const noteAuthoredActive = !shouldAdvance || note.id === draggingNoteId || noteGuardUntil > time;
          if (noteAuthoredActive) {
            runtime.angle = note.phase;
            runtime.flash = Math.max(0, runtime.flash - decayDt * 2.5);
            continue;
          }
          if (!playbackEditActiveNow && noteGuardUntil > 0) noteGuards.delete(note.id);
          if (hasNativeRuntime) {
            const nativeAngle = nativeRuntime.noteAngles[noteIndex];
            if (typeof nativeAngle === 'number' && Number.isFinite(nativeAngle)) {
              runtime.angle = nativeAngle;
              runtime.flash = Math.max(0, nativeRuntime.noteFlashes[noteIndex] ?? runtime.flash);
            }
          } else if (shouldAdvance && note.enabled) {
            const speedValue = adjustedOrbitSpeedValue(
              note.speedMode,
              note.speedValue,
              note.radiusNorm,
              configNow.speedOffset,
            );
            runtime.angle = wrapRadians(
              runtime.angle +
              directionSign(note.direction) *
              resolveAngularSpeed(note.speedMode, speedValue, configNow.bpmPercent, transportBpmNow) *
              dt,
            );
          }
          if (!hasNativeRuntime) {
            runtime.flash = Math.max(0, runtime.flash - decayDt * 2.5);
          }
        }
        if (
          shouldAdvance &&
          configNow.spline.spinEnabled &&
          !hasNativeRuntime &&
          !authoredVisualGuardActive
        ) {
          configRef.current = {
            ...configNow,
            spline: {
              ...configNow.spline,
              baseAngle: wrapRadians(
                configNow.spline.baseAngle +
                directionSign(configNow.spline.spinDirection) *
                resolveAngularSpeed('bpmPercent', 100, configNow.bpmPercent, transportBpmNow) *
                dt,
              ),
            },
          };
        }
        drawOrbit(ctx, {
          config: configRef.current,
          color,
          selectedNoteId: selectedNoteIdRef.current,
          runtimes: runtimeRef.current,
          width,
          height,
          runtimeBaseAngle: hasNativeRuntime && !authoredVisualGuardActive ? nativeRuntime.baseAngle : undefined,
        });
      }
      lastTime = time;
      scheduleNext();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
    };
  }, [color]);

  const canvasPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return null;
    const size = Math.min(rect.width, rect.height);
    const x = event.clientX - rect.left - (rect.width - size) * 0.5;
    const y = event.clientY - rect.top - (rect.height - size) * 0.5;
    return { x, y, size };
  };

  return (
    <div className="orbit-canvas-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => {
          const point = canvasPointer(event);
          if (!point) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const configNow = configRef.current;
          if (!activeRef.current) {
            syncRuntimeToAuthoredNotes(runtimeRef.current, configNow.notes);
          }
          const visualSpline = splineWithRuntimeBaseAngle(
            configNow.spline,
            activeRef.current ? runtimeVisualStateRef.current?.baseAngle : undefined,
          );
          const handleIndex = nearestHandleIndex(visualSpline, point.x, point.y, point.size);
          if (handleIndex !== null) {
            dragStateRef.current = { type: 'handle', index: handleIndex };
            onSelectNote(null);
            drawStaticOrbit();
            return;
          }
          const hitId = nearestNoteId(configNow.notes, runtimeRef.current, point.x, point.y, point.size);
          if (hitId) {
            dragStateRef.current = { type: 'note', id: hitId };
            onSelectNote(hitId);
            drawStaticOrbit();
            return;
          }
          if (selectedNoteIdRef.current) {
            onSelectNote(null);
            drawStaticOrbit();
            return;
          }
          const normalized = normalizedFromCanvas(point.x, point.y, point.size);
          if (Math.hypot(normalized.x, normalized.y) <= 1.1) {
            const rawPolar = cartesianToPolar(point.x, point.y, point.size);
            const polar = snapPolarForConfig(rawPolar.radiusNorm, rawPolar.angle, configNow);
            onAddNote(polar.radiusNorm, polar.angle);
          }
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current;
          if (!dragState) return;
          const point = canvasPointer(event);
          if (!point) return;
          if (dragState.type === 'handle') {
            const configNow = configRef.current;
            const normalized = clampNormalizedPoint(normalizedFromCanvas(point.x, point.y, point.size));
            const visualBaseAngle = activeRef.current
              ? runtimeVisualStateRef.current?.baseAngle ?? configNow.spline.baseAngle
              : configNow.spline.baseAngle;
            const basePoint = configNow.spline.spinEnabled
              ? rotateOrbitPoint(normalized, -visualBaseAngle)
              : normalized;
            const key = HANDLE_KEYS[dragState.index];
            const spline = {
              ...configNow.spline,
              [key]: basePoint,
            };
            configRef.current = {
              ...configNow,
              spline,
            };
            commitUpdateSpline({ [key]: basePoint } as Partial<OrbitSplineConfig>);
            drawStaticOrbit();
            return;
          }
          const rawPolar = cartesianToPolar(point.x, point.y, point.size);
          const polar = snapPolarForConfig(rawPolar.radiusNorm, rawPolar.angle, configRef.current);
          configRef.current = {
            ...configRef.current,
            notes: configRef.current.notes.map((note) => (
              note.id === dragState.id
                ? { ...note, radiusNorm: polar.radiusNorm, phase: polar.angle }
                : note
            )),
          };
          const runtime = runtimeRef.current.get(dragState.id);
          if (runtime) {
            runtime.angle = polar.angle;
          } else {
            runtimeRef.current.set(dragState.id, { id: dragState.id, angle: polar.angle, flash: 0 });
          }
          commitMoveNote({
            id: dragState.id,
            radiusNorm: polar.radiusNorm,
            phase: polar.angle,
          });
          drawStaticOrbit();
        }}
        onPointerUp={(event) => {
          const dragState = dragStateRef.current;
          if (dragState?.type === 'note') {
            flushMoveNote();
          } else if (dragState?.type === 'handle') {
            flushUpdateSpline();
          }
          dragStateRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          const dragState = dragStateRef.current;
          if (dragState?.type === 'note') {
            flushMoveNote();
          } else if (dragState?.type === 'handle') {
            flushUpdateSpline();
          }
          dragStateRef.current = null;
        }}
        onLostPointerCapture={() => {
          const dragState = dragStateRef.current;
          if (dragState?.type === 'note') {
            flushMoveNote();
          } else if (dragState?.type === 'handle') {
            flushUpdateSpline();
          }
          dragStateRef.current = null;
        }}
      />
      <div className="orbit-canvas-meta">
        <span>{config.notes.length} nodes</span>
        <span>{config.spline.spinEnabled ? 'spin' : 'still'}</span>
      </div>
    </div>
  );
}

export default OrbitSequencerCanvas;
