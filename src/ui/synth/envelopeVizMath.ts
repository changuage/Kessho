export type EnvelopeTimeScale = {
  domainSeconds: number;
  timeToX: (seconds: number) => number;
  xToTime: (x: number) => number;
};

export function envelopeValue(t: number, attack: number, decay: number, sustain: number, hold: number, release: number): number {
  if (t < 0) return 0;
  if (t < attack) return t / Math.max(0.001, attack);
  const tAfterAttack = t - attack;
  if (tAfterAttack < decay) {
    return 1 - (1 - sustain) * (tAfterAttack / Math.max(0.001, decay));
  }
  const releaseStart = attack + decay + hold;
  if (t < releaseStart) return sustain;
  const tInRelease = t - releaseStart;
  if (tInRelease < release) return sustain * (1 - tInRelease / Math.max(0.001, release));
  return 0;
}

export function createEnvelopeTimeScale(width: number, timelineSeconds: number): EnvelopeTimeScale {
  const domainSeconds = Math.max(0.25, Number.isFinite(timelineSeconds) ? timelineSeconds : 0.25);
  const kneeSeconds = Math.max(0.05, Math.min(0.9, (domainSeconds / 24) * 1.25));
  const denominator = Math.max(0.0001, Math.log1p(domainSeconds / kneeSeconds));
  const safeWidth = Math.max(1, width);

  return {
    domainSeconds,
    timeToX: (seconds: number): number => {
      const clamped = Math.max(0, Math.min(domainSeconds, seconds));
      return (Math.log1p(clamped / kneeSeconds) / denominator) * width;
    },
    xToTime: (x: number): number => {
      const ratio = Math.max(0, Math.min(1, x / safeWidth));
      return (Math.exp(ratio * denominator) - 1) * kneeSeconds;
    },
  };
}

export function getEnvelopeTimelineSeconds(timelineSeconds: number | undefined, fallbackSeconds: number): number {
  return Math.max(0.25, timelineSeconds ?? fallbackSeconds);
}

export const quantizeEnvelopeTime = (value: number): number => (
  value < 0.1 ? parseFloat(value.toFixed(3)) : parseFloat(value.toFixed(2))
);

export function formatEnvelopeTimeLabel(value: number): string {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safeValue < 1) return `${Math.round(safeValue * 1000)}ms`;
  if (safeValue < 10) return `${safeValue.toFixed(2)}s`;
  return `${safeValue.toFixed(1)}s`;
}

export function formatEnvelopeSustainLabel(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function colorWithAlpha(color: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const trimmed = color.trim();
  if (trimmed.endsWith(',')) {
    return `${trimmed}${clampedAlpha})`;
  }
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const expanded = hex.length === 3
      ? hex.split('').map((part) => part + part).join('')
      : hex;
    const parsed = Number.parseInt(expanded, 16);
    if (expanded.length === 6 && Number.isFinite(parsed)) {
      const r = (parsed >> 16) & 255;
      const g = (parsed >> 8) & 255;
      const b = parsed & 255;
      return `rgba(${r},${g},${b},${clampedAlpha})`;
    }
  }
  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = (rgbMatch[1] ?? '').split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      if (r && g && b) {
        return `rgba(${r},${g},${b},${clampedAlpha})`;
      }
    }
  }
  return trimmed;
}
