import type { OrbitDirection, OrbitSplineConfig } from './orbitSequencerTypes';

export const TAU = Math.PI * 2;
export const ORBIT_RADIUS_SCALE = 0.44;

export interface OrbitPoint {
  x: number;
  y: number;
}

export interface OrbitPolar {
  radiusNorm: number;
  angle: number;
}

export interface OrbitSplineSample extends OrbitPoint {
  radiusNorm: number;
  angle: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrapRadians(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

export function signedRadians(angle: number): number {
  const wrapped = wrapRadians(angle + Math.PI) - Math.PI;
  return wrapped <= -Math.PI ? wrapped + TAU : wrapped;
}

export function lineAngleOffset(index: number, count: number): number {
  const safeCount = Math.max(1, Math.min(5, Math.round(count)));
  return TAU * Math.max(0, Math.round(index)) / safeCount;
}

export function polarToCartesian(radiusNorm: number, angle: number, size: number): OrbitPoint {
  const radius = clamp(radiusNorm, 0, 1) * size * ORBIT_RADIUS_SCALE;
  return {
    x: size * 0.5 + Math.cos(angle) * radius,
    y: size * 0.5 + Math.sin(angle) * radius,
  };
}

export function cartesianToPolar(x: number, y: number, size: number): OrbitPolar {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const dx = x - cx;
  const dy = y - cy;
  return {
    radiusNorm: clamp(Math.hypot(dx, dy) / (size * ORBIT_RADIUS_SCALE), 0.04, 1),
    angle: wrapRadians(Math.atan2(dy, dx)),
  };
}

export function crossedZero(prevRelative: number, currRelative: number): boolean {
  const prev = signedRadians(prevRelative);
  const delta = signedRadians(currRelative - prevRelative);
  const curr = prev + delta;
  if (Math.abs(prev) < 1e-6 || Math.abs(curr) < 1e-6) return true;
  return (prev < 0 && curr > 0) || (prev > 0 && curr < 0);
}

export function rotateOrbitPoint(point: OrbitPoint, angle: number): OrbitPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function cubicBezier(p0: OrbitPoint, p1: OrbitPoint, p2: OrbitPoint, p3: OrbitPoint, t: number): OrbitPoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

export function sampleBezierSpline(spline: OrbitSplineConfig, count = 32, rotation = 0): OrbitSplineSample[] {
  const sampleCount = Math.max(2, Math.round(count));
  const samples: OrbitSplineSample[] = [];
  const p0 = { x: 0, y: 0 };
  const p1 = spline.handle1;
  const p2 = spline.handle2;
  const p3 = spline.tip;
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const point = rotateOrbitPoint(cubicBezier(p0, p1, p2, p3, t), rotation);
    const radiusNorm = clamp(Math.hypot(point.x, point.y), 0, 1.5);
    samples.push({
      x: point.x,
      y: point.y,
      radiusNorm,
      angle: wrapRadians(Math.atan2(point.y, point.x)),
    });
  }
  return samples.sort((left, right) => left.radiusNorm - right.radiusNorm);
}

export function splineAngleAtRadius(radiusNorm: number, samples: readonly OrbitSplineSample[]): number {
  if (samples.length === 0) return -Math.PI / 2;
  const radius = clamp(radiusNorm, 0, 1);
  let bestAngle = samples[0]!.angle;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const distance = Math.abs(sample.radiusNorm - radius);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAngle = sample.angle;
    }
  }
  return bestAngle;
}

export function directionSign(direction: OrbitDirection): number {
  return direction === 'ccw' ? -1 : 1;
}

export function resolveAngularSpeed(speedMode: 'bpmPercent' | 'syncDivisor', speedValue: number, bpmPercent: number): number {
  const base = (TAU / 2) * clamp(bpmPercent, 1, 800) / 100;
  if (speedMode === 'bpmPercent') {
    return base * clamp(speedValue, 1, 800) / 100;
  }
  return base / Math.max(0.125, speedValue);
}

export function lineAngles(baseAngle: number, count: number): number[] {
  const safeCount = Math.max(1, Math.min(5, Math.round(count)));
  return Array.from({ length: safeCount }, (_, index) => wrapRadians(baseAngle + lineAngleOffset(index, safeCount)));
}
