export type VisualizerFrameMode = 'parked' | 'settling' | 'ambient' | 'active';

export interface VisualizerFrameActivity {
  canAnimate: boolean;
  isPlaying: boolean;
  hasAutomation: boolean;
  pulseActivity: number;
  millisecondsSinceInteraction: number;
  requestedFps: number;
  qualityTargetFps: number;
}

export interface VisualizerFramePlan {
  mode: VisualizerFrameMode;
  fps: number;
  delayMs: number | null;
}

const ACTIVE_PULSE_THRESHOLD = 0.018;
const SETTLING_PULSE_THRESHOLD = 0.0015;
const IDLE_SETTLE_MS = 1800;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolves render cadence without reading browser state. Keeping this policy pure
 * makes hidden/idle behavior deterministic and independently testable.
 */
export function resolveVisualizerFramePlan(activity: VisualizerFrameActivity): VisualizerFramePlan {
  if (!activity.canAnimate) {
    return { mode: 'parked', fps: 0, delayMs: null };
  }

  const maxFps = clamp(activity.qualityTargetFps, 1, 120);
  const requestedFps = clamp(activity.requestedFps, 1, maxFps);
  const pulseActivity = clamp(activity.pulseActivity, 0, 1);

  if (activity.hasAutomation || pulseActivity >= ACTIVE_PULSE_THRESHOLD) {
    return {
      mode: 'active',
      fps: requestedFps,
      delayMs: 1000 / requestedFps,
    };
  }

  if (activity.isPlaying) {
    const fps = Math.min(requestedFps, 15);
    return { mode: 'ambient', fps, delayMs: 1000 / fps };
  }

  if (
    pulseActivity >= SETTLING_PULSE_THRESHOLD ||
    activity.millisecondsSinceInteraction < IDLE_SETTLE_MS
  ) {
    const fps = Math.min(requestedFps, 12);
    return { mode: 'settling', fps, delayMs: 1000 / fps };
  }

  return { mode: 'parked', fps: 0, delayMs: null };
}

export function visualizerPulseActivity(pulses: Readonly<Record<string, number>>): number {
  let activity = 0;
  for (const value of Object.values(pulses)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      activity = Math.max(activity, value);
    }
  }
  return Math.min(1, activity);
}
