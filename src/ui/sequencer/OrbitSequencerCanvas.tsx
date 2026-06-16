import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { OrbitNoteConfig, OrbitRuntimeVisualState, OrbitSequencerConfig, OrbitSplineConfig } from './orbitSequencerTypes';
import {
  ORBIT_RADIUS_SCALE,
  adjustedOrbitSpeedValue,
  cartesianToPolar,
  directionSign,
  effectiveOrbitDirection,
  lineAngleOffset,
  orbitClockedBpmPercent,
  orbitAuthoredPhaseFromVisual,
  orbitSpeedOffsetStats,
  orbitVisualPhase,
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
  clockDivision?: unknown;
  stepCount?: number;
  tempoMultiplier?: number;
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
  nativeAngle?: number;
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

function finalVisualAngleForNote(
  note: OrbitNoteConfig,
  index: number,
  config: OrbitSequencerConfig,
  runtime: RuntimeNote | undefined,
): number {
  if (typeof runtime?.nativeAngle === 'number' && Number.isFinite(runtime.nativeAngle)) {
    // Product Core sends final visual angles after global/even/free offsets.
    return runtime.nativeAngle;
  }
  return orbitVisualPhase(runtime?.angle ?? note.phase, {
    index,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
}

function authoredPhaseForVisualPlacement(
  visualPhase: number,
  index: number,
  config: OrbitSequencerConfig,
): number {
  return orbitAuthoredPhaseFromVisual(visualPhase, {
    index,
    seed: config.seed,
    globalOffset: config.globalOffset,
    evenOffset: config.evenOffset,
    freeOffset: config.freeOffset,
  });
}

function nativeRuntimeCoversNotes(
  runtime: OrbitRuntimeVisualState | null | undefined,
  config: OrbitSequencerConfig,
): runtime is OrbitRuntimeVisualState {
  return !!runtime &&
    runtime.noteCount === config.notes.length &&
    runtime.noteAngles.length >= config.notes.length;
}

function advanceFallbackRuntimeNote(
  runtime: RuntimeNote,
  note: OrbitNoteConfig,
  noteIndex: number,
  config: OrbitSequencerConfig,
  transportBpm: number,
  orbitBpmPercent: number,
  dt: number,
  speedStats = orbitSpeedOffsetStats(config.notes),
): void {
  if (!note.enabled) return;
  const speedValue = adjustedOrbitSpeedValue(
    note.speedMode,
    note.speedValue,
    note.radiusNorm,
    config.speedOffset,
    speedStats,
  );
  const direction = effectiveOrbitDirection(note.direction, noteIndex, {
    evenOffset: config.evenOffset,
    evenReverseMode: config.evenReverseMode,
  });
  runtime.angle = wrapRadians(
    runtime.angle +
    directionSign(direction) *
    resolveAngularSpeed(note.speedMode, speedValue, orbitBpmPercent, transportBpm) *
    dt,
  );
}

function noteScreenPoint(
  note: OrbitNoteConfig,
  index: number,
  config: OrbitSequencerConfig,
  runtime: RuntimeNote | undefined,
  size: number,
) {
  return polarToCartesian(note.radiusNorm, finalVisualAngleForNote(note, index, config, runtime), size);
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

function nearestNoteId(config: OrbitSequencerConfig, runtimes: Map<string, RuntimeNote>, x: number, y: number, size: number): string | null {
  let bestId: string | null = null;
  let bestDistance = NOTE_HIT_RADIUS;
  for (let index = 0; index < config.notes.length; index += 1) {
    const note = config.notes[index];
    if (!note) continue;
    const point = noteScreenPoint(note, index, config, runtimes.get(note.id), size);
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
      runtime.nativeAngle = undefined;
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

  for (let noteIndex = 0; noteIndex < config.notes.length; noteIndex += 1) {
    const note = config.notes[noteIndex];
    if (!note) continue;
    const runtime = runtimes.get(note.id);
    const angle = finalVisualAngleForNote(note, noteIndex, config, runtime);
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
  clockDivision = 8,
  stepCount = 16,
  tempoMultiplier = 1,
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
  const clockDivisionRef = useRef(clockDivision);
  const stepCountRef = useRef(stepCount);
  const tempoMultiplierRef = useRef(tempoMultiplier);
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
        runtime.nativeAngle = undefined;
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
    clockDivisionRef.current = clockDivision;
  }, [clockDivision]);

  useEffect(() => {
    stepCountRef.current = stepCount;
  }, [stepCount]);

  useEffect(() => {
    tempoMultiplierRef.current = tempoMultiplier;
  }, [tempoMultiplier]);

  useEffect(() => {
    runtimeVisualStateRef.current = runtimeVisualState;
    if (!runtimeVisualState) return;
    if (!activeRef.current) return;
    const configNow = configRef.current;
    if (!nativeRuntimeCoversNotes(runtimeVisualState, configNow)) {
      for (const note of configNow.notes) {
        const runtime = runtimeRef.current.get(note.id);
        if (runtime) runtime.nativeAngle = undefined;
      }
      return;
    }
    const now = performance.now();
    const dragState = dragStateRef.current;
    if (dragState?.type === 'handle') return;
    const ignoreAuthoredGuards = playbackEditActiveRef.current;
    const draggingNoteId = !ignoreAuthoredGuards && dragState?.type === 'note' ? dragState.id : null;
    const runtimes = runtimeRef.current;
    const noteGuards = authoredNoteGuardUntilRef.current;
    for (let index = 0; index < configNow.notes.length; index += 1) {
      const note = configNow.notes[index];
      if (!note) continue;
      if (note.id === draggingNoteId) continue;
      const noteGuardUntil = ignoreAuthoredGuards ? 0 : noteGuards.get(note.id) ?? 0;
      if (noteGuardUntil > now) {
        const runtime = runtimes.get(note.id);
        if (runtime) runtime.nativeAngle = undefined;
        continue;
      }
      if (!ignoreAuthoredGuards && noteGuardUntil > 0) noteGuards.delete(note.id);
      const angle = runtimeVisualState.noteAngles[index];
      if (typeof angle !== 'number' || !Number.isFinite(angle)) continue;
      const flash = Math.max(0, runtimeVisualState.noteFlashes[index] ?? 0);
      const runtime = runtimes.get(note.id);
      if (runtime) {
        runtime.nativeAngle = angle;
        runtime.flash = flash;
      } else {
        runtimes.set(note.id, { id: note.id, angle: note.phase, nativeAngle: angle, flash });
      }
    }
  }, [runtimeVisualState]);

  const drawStaticOrbit = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height, dpr } = sizeRef.current;
    if (!canvas || !ctx || width <= 0 || height <= 0) return;
    const configNow = configRef.current;
    const nativeRuntime = runtimeVisualStateRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrbit(ctx, {
      config: configNow,
      color,
      selectedNoteId: selectedNoteIdRef.current,
      runtimes: runtimeRef.current,
      width,
      height,
      runtimeBaseAngle: activeRef.current && nativeRuntimeCoversNotes(nativeRuntime, configNow)
        ? nativeRuntime.baseAngle
        : undefined,
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
        const orbitBpmPercent = configNow.clockMode === 'transport'
          ? orbitClockedBpmPercent(
            stepCountRef.current,
            clockDivisionRef.current,
            tempoMultiplierRef.current,
            configNow.bpmPercent / 100,
          )
          : configNow.bpmPercent;
        const nativeRuntime = runtimeVisualStateRef.current;
        const activeNativeRuntime = shouldAdvance && nativeRuntimeCoversNotes(nativeRuntime, configNow)
          ? nativeRuntime
          : null;
        const speedStats = orbitSpeedOffsetStats(configNow.notes);
        const dragState = dragStateRef.current;
        const playbackEditActiveNow = playbackEditActiveRef.current;
        const draggingNoteId = !playbackEditActiveNow && dragState?.type === 'note' ? dragState.id : null;
        const authoredVisualGuardActive = !playbackEditActiveNow && time < authoredVisualGuardUntilRef.current;
        const hasNativeRuntime = activeNativeRuntime !== null;
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
            runtime.nativeAngle = undefined;
            runtime.flash = Math.max(0, runtime.flash - decayDt * 2.5);
            continue;
          }
          if (!playbackEditActiveNow && noteGuardUntil > 0) noteGuards.delete(note.id);
          if (!hasNativeRuntime) {
            runtime.nativeAngle = undefined;
          }
          if (hasNativeRuntime) {
            const nativeAngle = activeNativeRuntime.noteAngles[noteIndex];
            if (typeof nativeAngle === 'number' && Number.isFinite(nativeAngle)) {
              runtime.nativeAngle = nativeAngle;
              runtime.flash = Math.max(0, activeNativeRuntime.noteFlashes[noteIndex] ?? runtime.flash);
            } else {
              runtime.nativeAngle = undefined;
            }
          } else if (shouldAdvance && note.enabled) {
            advanceFallbackRuntimeNote(runtime, note, noteIndex, configNow, transportBpmNow, orbitBpmPercent, dt, speedStats);
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
                resolveAngularSpeed('bpmPercent', 100, orbitBpmPercent, transportBpmNow) *
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
          runtimeBaseAngle: activeNativeRuntime && !authoredVisualGuardActive
            ? activeNativeRuntime.baseAngle
            : undefined,
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
          const nativeRuntime = runtimeVisualStateRef.current;
          const runtimeBaseAngle = activeRef.current && nativeRuntimeCoversNotes(nativeRuntime, configNow)
            ? nativeRuntime.baseAngle
            : undefined;
          const visualSpline = splineWithRuntimeBaseAngle(
            configNow.spline,
            runtimeBaseAngle,
          );
          const handleIndex = nearestHandleIndex(visualSpline, point.x, point.y, point.size);
          if (handleIndex !== null) {
            dragStateRef.current = { type: 'handle', index: handleIndex };
            onSelectNote(null);
            drawStaticOrbit();
            return;
          }
          const hitId = nearestNoteId(configNow, runtimeRef.current, point.x, point.y, point.size);
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
            const newIndex = configNow.notes.length;
            const authoredPhase = authoredPhaseForVisualPlacement(polar.angle, newIndex, configNow);
            onAddNote(polar.radiusNorm, authoredPhase);
          }
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current;
          if (!dragState) return;
          const point = canvasPointer(event);
          if (!point) return;
          if (dragState.type === 'handle') {
            const configNow = configRef.current;
            const nativeRuntime = runtimeVisualStateRef.current;
            const normalized = clampNormalizedPoint(normalizedFromCanvas(point.x, point.y, point.size));
            const visualBaseAngle = activeRef.current && nativeRuntimeCoversNotes(nativeRuntime, configNow)
              ? nativeRuntime.baseAngle
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
          const configNow = configRef.current;
          const noteIndex = configNow.notes.findIndex((note) => note.id === dragState.id);
          if (noteIndex < 0) return;
          const rawPolar = cartesianToPolar(point.x, point.y, point.size);
          const polar = snapPolarForConfig(rawPolar.radiusNorm, rawPolar.angle, configNow);
          const authoredPhase = authoredPhaseForVisualPlacement(polar.angle, noteIndex, configNow);
          configRef.current = {
            ...configNow,
            notes: configNow.notes.map((note) => (
              note.id === dragState.id
                ? { ...note, radiusNorm: polar.radiusNorm, phase: authoredPhase }
                : note
            )),
          };
          const runtime = runtimeRef.current.get(dragState.id);
          if (runtime) {
            runtime.angle = authoredPhase;
            runtime.nativeAngle = undefined;
          } else {
            runtimeRef.current.set(dragState.id, { id: dragState.id, angle: authoredPhase, flash: 0 });
          }
          commitMoveNote({
            id: dragState.id,
            radiusNorm: polar.radiusNorm,
            phase: authoredPhase,
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
