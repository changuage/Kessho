export interface VisualizerPerformanceSnapshot {
  renderedFrames: number;
  intentBuilds: number;
  uiPublishes: number;
  parkedTransitions: number;
  totalFrameMs: number;
  totalIntentMs: number;
  totalModulationMs: number;
  maxFrameMs: number;
}

const counters: VisualizerPerformanceSnapshot = {
  renderedFrames: 0,
  intentBuilds: 0,
  uiPublishes: 0,
  parkedTransitions: 0,
  totalFrameMs: 0,
  totalIntentMs: 0,
  totalModulationMs: 0,
  maxFrameMs: 0,
};

export function visualizerPerformanceInstrumentationEnabled(): boolean {
  return import.meta.env.DEV;
}

export function recordVisualizerFramePerformance(
  frameMs: number,
  intentMs: number,
  modulationMs: number,
  intentBuilt: boolean,
  uiPublished: boolean,
): void {
  if (!import.meta.env.DEV) return;
  counters.renderedFrames += 1;
  counters.intentBuilds += intentBuilt ? 1 : 0;
  counters.uiPublishes += uiPublished ? 1 : 0;
  counters.totalFrameMs += Math.max(0, frameMs);
  counters.totalIntentMs += Math.max(0, intentMs);
  counters.totalModulationMs += Math.max(0, modulationMs);
  counters.maxFrameMs = Math.max(counters.maxFrameMs, frameMs);
}

export function recordVisualizerParkedTransition(): void {
  if (!import.meta.env.DEV) return;
  counters.parkedTransitions += 1;
}

export function getVisualizerPerformanceSnapshot(): Readonly<VisualizerPerformanceSnapshot> {
  return { ...counters };
}

export function resetVisualizerPerformanceCounters(): void {
  for (const key of Object.keys(counters) as Array<keyof VisualizerPerformanceSnapshot>) {
    counters[key] = 0;
  }
}
