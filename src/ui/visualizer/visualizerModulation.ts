import type {
  ReactiveVisualizerControls,
  ReactiveVisualizerSnapshot,
} from './ReactiveVisualizerRenderer';

export type VisualizerMode = 'auto' | 'preset';

export type VisualizerNumericControlKey = {
  [Key in keyof ReactiveVisualizerControls]: ReactiveVisualizerControls[Key] extends number ? Key : never;
}[keyof ReactiveVisualizerControls];

export type VisualizerReactiveRange = {
  min: number;
  max: number;
};

export type VisualizerReactiveRanges = Partial<Record<VisualizerNumericControlKey, VisualizerReactiveRange>>;

export type VisualizerReactionSettings = {
  reactionAmount: number;
  morphAroundPreset: number;
  afterglow: number;
  mode: VisualizerMode;
};

export type VisualBusSignal = 'level' | 'pulse' | 'phase' | 'density';
export type VisualBusId = 'geometry' | 'atmosphere' | 'fragment' | 'echo' | 'texture' | 'impact';

export type VisualBus = Record<VisualBusSignal, number>;
export type VisualBuses = Record<VisualBusId, VisualBus>;

export type VisualDriverEngine =
  | 'Synth'
  | 'Lead'
  | 'Pad'
  | 'Drums'
  | 'Granular'
  | 'Delay'
  | 'Reverb'
  | 'Earth'
  | 'Dynamics'
  | 'Harmony'
  | 'Sequencer'
  | 'Global';

export type VisualModRoute = {
  bus: VisualBusId;
  signal: VisualBusSignal;
  target: VisualizerNumericControlKey;
  amount: number;
  polarity?: 1 | -1;
  engines: VisualDriverEngine[];
  label: string;
  eventDriven?: boolean;
};

const DEFAULT_RANGE_RADIUS: Partial<Record<VisualizerNumericControlKey, number>> = {
  style: 0.48,
  kaleidoscope: 0.56,
  triggerResponse: 0.64,
  ripples: 0.58,
  motion: 0.28,
  color: 0.26,
  diffusion: 0.42,
  background: 0.28,
  shape: 0.24,
  organic: 0.32,
  edges: 0.36,
  backdropFade: 0.36,
  noiseTurbulence: 0.44,
  noiseFlow: 0.38,
  noiseSpeed: 0.42,
  noiseColor: 0.32,
  pulseSync: 0.34,
  shapeSize: 0.38,
  shapeSpread: 0.48,
  shapeCount: 0.5,
  noiseSize: 0.44,
  noiseDensity: 0.52,
  bloomSize: 0.62,
  kaleidoSize: 0.42,
  glitchIntensity: 0.72,
  glitchScale: 0.52,
  glitchChromatic: 0.5,
  glitchRate: 0.58,
  charAmount: 0.46,
  charStyle: 0.34,
  charGrain: 0.44,
  charDrift: 0.42,
  kaleidoSegments: 0.48,
  kaleidoSpin: 0.56,
  kaleidoType: 0.28,
  kaleidoReflections: 0.5,
  kaleidoPattern: 0.5,
  brightness: 0.26,
  vibrance: 0.32,
  saturation: 0.3,
  impactFlash: 0.58,
  visualLimiter: 0.24,
  pointCloudAmount: 0.46,
  pointCloudSize: 0.42,
  pointCloudDensity: 0.48,
  pointCloudScatter: 0.4,
  pointCloudColor: 0.34,
};

export const VISUAL_MOD_MATRIX: VisualModRoute[] = [
  { bus: 'geometry', signal: 'level', target: 'shapeCount', amount: 0.58, engines: ['Synth', 'Lead'], label: 'Synth/Lead level' },
  { bus: 'geometry', signal: 'pulse', target: 'shapeSize', amount: 0.42, engines: ['Lead', 'Synth', 'Sequencer'], label: 'Lead expression + synth hits', eventDriven: true },
  { bus: 'geometry', signal: 'density', target: 'shapeSpread', amount: 0.44, engines: ['Synth', 'Lead', 'Sequencer'], label: 'Synth/Lead spread' },
  { bus: 'geometry', signal: 'pulse', target: 'edges', amount: 0.38, engines: ['Lead', 'Harmony'], label: 'Lead expression + tension', eventDriven: true },
  { bus: 'geometry', signal: 'density', target: 'shape', amount: 0.26, engines: ['Synth', 'Sequencer'], label: 'Synth density' },
  { bus: 'geometry', signal: 'phase', target: 'pulseSync', amount: 0.3, engines: ['Sequencer'], label: 'Synth sequencer phase' },

  { bus: 'atmosphere', signal: 'level', target: 'style', amount: 0.34, engines: ['Pad', 'Reverb'], label: 'Pad/reverb wash' },
  { bus: 'atmosphere', signal: 'level', target: 'noiseDensity', amount: 0.64, engines: ['Pad', 'Reverb'], label: 'Pad level + reverb wet' },
  { bus: 'atmosphere', signal: 'level', target: 'diffusion', amount: 0.48, engines: ['Reverb', 'Pad'], label: 'Reverb diffusion + pad sustain' },
  { bus: 'atmosphere', signal: 'density', target: 'noiseTurbulence', amount: 0.42, engines: ['Pad', 'Reverb'], label: 'Pad motion + reverb modulation' },
  { bus: 'atmosphere', signal: 'phase', target: 'noiseFlow', amount: 0.3, engines: ['Pad', 'Earth'], label: 'Pad/Earth motion' },
  { bus: 'atmosphere', signal: 'pulse', target: 'bloomSize', amount: 0.28, engines: ['Pad', 'Reverb'], label: 'Pad/reverb swell', eventDriven: true },

  { bus: 'fragment', signal: 'pulse', target: 'glitchIntensity', amount: 0.84, engines: ['Granular'], label: 'Granular S&H triggers', eventDriven: true },
  { bus: 'fragment', signal: 'density', target: 'glitchScale', amount: 0.58, engines: ['Granular'], label: 'Grain density + active grains' },
  { bus: 'fragment', signal: 'density', target: 'glitchRate', amount: 0.66, engines: ['Granular'], label: 'Granular density' },
  { bus: 'fragment', signal: 'pulse', target: 'glitchChromatic', amount: 0.48, engines: ['Granular', 'Dynamics'], label: 'Granular spread + drive', eventDriven: true },
  { bus: 'fragment', signal: 'level', target: 'charGrain', amount: 0.24, engines: ['Granular'], label: 'Granular residue' },
  { bus: 'fragment', signal: 'density', target: 'pointCloudDensity', amount: 0.42, engines: ['Granular'], label: 'Granular point density' },
  { bus: 'fragment', signal: 'pulse', target: 'pointCloudScatter', amount: 0.36, engines: ['Granular', 'Sequencer'], label: 'Granular particle spray', eventDriven: true },

  { bus: 'echo', signal: 'level', target: 'kaleidoscope', amount: 0.68, engines: ['Delay'], label: 'Delay mix + feedback' },
  { bus: 'echo', signal: 'density', target: 'kaleidoSegments', amount: 0.46, engines: ['Delay', 'Harmony'], label: 'Delay repeats + root' },
  { bus: 'echo', signal: 'phase', target: 'kaleidoSpin', amount: 0.58, engines: ['Delay', 'Sequencer'], label: 'Delay clock phase' },
  { bus: 'echo', signal: 'level', target: 'kaleidoReflections', amount: 0.52, engines: ['Delay', 'Reverb'], label: 'Delay feedback + reverb tail' },
  { bus: 'echo', signal: 'pulse', target: 'kaleidoSize', amount: 0.3, engines: ['Delay'], label: 'Delay repeat pulse', eventDriven: true },

  { bus: 'texture', signal: 'level', target: 'charAmount', amount: 0.56, engines: ['Earth', 'Dynamics'], label: 'Earth texture + dynamics' },
  { bus: 'texture', signal: 'level', target: 'charStyle', amount: 0.32, polarity: -1, engines: ['Earth', 'Global'], label: 'Earth warmth' },
  { bus: 'texture', signal: 'density', target: 'charGrain', amount: 0.5, engines: ['Earth', 'Dynamics'], label: 'Earth texture + degrade' },
  { bus: 'texture', signal: 'pulse', target: 'charDrift', amount: 0.42, engines: ['Earth', 'Pad'], label: 'Earth/global texture bumps', eventDriven: true },
  { bus: 'texture', signal: 'phase', target: 'ripples', amount: 0.26, engines: ['Earth'], label: 'Earth ripple phase' },

  { bus: 'impact', signal: 'pulse', target: 'triggerResponse', amount: 0.86, engines: ['Drums', 'Lead'], label: 'Drum velocity + expression', eventDriven: true },
  { bus: 'impact', signal: 'pulse', target: 'ripples', amount: 0.7, engines: ['Drums', 'Earth'], label: 'Kick hits + earth pulse', eventDriven: true },
  { bus: 'impact', signal: 'pulse', target: 'bloomSize', amount: 0.74, engines: ['Drums', 'Reverb'], label: 'Kick velocity + reverb tail', eventDriven: true },
  { bus: 'impact', signal: 'pulse', target: 'pointCloudSize', amount: 0.4, engines: ['Drums', 'Lead'], label: 'Impact particle size', eventDriven: true },
  { bus: 'impact', signal: 'pulse', target: 'impactFlash', amount: 0.9, engines: ['Drums', 'Dynamics'], label: 'Drum velocity + master peak', eventDriven: true },
  { bus: 'impact', signal: 'level', target: 'brightness', amount: 0.26, engines: ['Drums', 'Global'], label: 'Impact energy' },
  { bus: 'impact', signal: 'level', target: 'visualLimiter', amount: 0.22, engines: ['Drums', 'Dynamics'], label: 'Impact safety ceiling' },

  { bus: 'geometry', signal: 'density', target: 'color', amount: 0.22, engines: ['Harmony', 'Lead'], label: 'Harmony + lead density' },
  { bus: 'atmosphere', signal: 'level', target: 'saturation', amount: 0.24, engines: ['Pad', 'Reverb'], label: 'Pad/reverb color field' },
  { bus: 'texture', signal: 'level', target: 'vibrance', amount: 0.22, engines: ['Earth', 'Global'], label: 'Earth/global texture color' },
  { bus: 'texture', signal: 'level', target: 'pointCloudColor', amount: 0.28, engines: ['Earth', 'Global'], label: 'Texture particle color' },
];

export const VISUAL_MOD_TARGETS = Array.from(
  new Set(VISUAL_MOD_MATRIX.map((route) => route.target)),
);

type CompiledVisualModTarget = {
  target: VisualizerNumericControlKey;
  routes: VisualModRoute[];
};

const VISUAL_MOD_ROUTES_BY_TARGET = new Map<VisualizerNumericControlKey, VisualModRoute[]>();
for (const route of VISUAL_MOD_MATRIX) {
  const routes = VISUAL_MOD_ROUTES_BY_TARGET.get(route.target);
  if (routes) routes.push(route);
  else VISUAL_MOD_ROUTES_BY_TARGET.set(route.target, [route]);
}

const COMPILED_VISUAL_MOD_TARGETS: CompiledVisualModTarget[] = Array.from(
  VISUAL_MOD_ROUTES_BY_TARGET,
  ([target, routes]) => ({ target, routes }),
);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function numericControlEntries(controls: ReactiveVisualizerControls): Array<[VisualizerNumericControlKey, number]> {
  return Object.entries(controls).filter(([, value]) => typeof value === 'number') as Array<[VisualizerNumericControlKey, number]>;
}

export function createDefaultReactiveRanges(controls: ReactiveVisualizerControls): VisualizerReactiveRanges {
  const ranges: VisualizerReactiveRanges = {};
  for (const [key, value] of numericControlEntries(controls)) {
    if (key === 'frameRate') continue;
    const radius = DEFAULT_RANGE_RADIUS[key] ?? 0.34;
    ranges[key] = {
      min: clamp(value - radius, -1, 1),
      max: clamp(value + radius, -1, 1),
    };
  }
  return ranges;
}

function shapedPulse(value: number, afterglow: number): number {
  const pulse = clamp01(value);
  const hold = clamp01(afterglow);
  const exponent = 1.55 - hold * 0.85;
  return clamp01(Math.pow(pulse, exponent));
}

export function buildVisualBuses(
  snapshot: ReactiveVisualizerSnapshot,
  settings: Pick<VisualizerReactionSettings, 'afterglow'>,
): VisualBuses {
  const pulses = snapshot.pulses;
  const afterglow = clamp01(settings.afterglow);
  const synthPulse = shapedPulse(Math.max(pulses.synth, pulses.lead, pulses.sequencer), afterglow);
  const padPulse = shapedPulse(Math.max(pulses.pad, pulses.reverb * 0.76), afterglow);
  const granularPulse = shapedPulse(pulses.granular, afterglow);
  const delayPulse = shapedPulse(pulses.delay, afterglow);
  const earthPulse = shapedPulse(Math.max(pulses.earth, pulses.global * 0.5), afterglow);
  const impactPulse = shapedPulse(Math.max(pulses.drums, pulses.global * 0.65, pulses.lead * 0.32), afterglow);

  return {
    geometry: {
      level: clamp01(snapshot.lead * 0.62 + snapshot.pad * 0.18 + snapshot.morph * 0.16 + snapshot.spread * 0.12),
      pulse: synthPulse,
      phase: clamp01(snapshot.pulses.synthStepPhase),
      density: clamp01(snapshot.pulses.synthHitDensity * 0.68 + snapshot.lead * 0.32),
    },
    atmosphere: {
      level: clamp01(snapshot.pad * 0.44 + snapshot.reverb * 0.38 + snapshot.earth * 0.16 + snapshot.delay * 0.08),
      pulse: padPulse,
      phase: clamp01(snapshot.morph * 0.48 + snapshot.root * 0.32 + snapshot.pulses.synthStepPhase * 0.2),
      density: clamp01(snapshot.reverb * 0.42 + snapshot.pad * 0.38 + snapshot.tension * 0.18),
    },
    fragment: {
      level: clamp01(snapshot.granular * 0.74 + snapshot.activeGrains / 128),
      pulse: granularPulse,
      phase: clamp01((snapshot.activeGrains % 32) / 32),
      density: clamp01(snapshot.granular * 0.42 + snapshot.activeGrains / 96 + pulses.granular * 0.24),
    },
    echo: {
      level: clamp01(snapshot.delay * 0.72 + snapshot.reverb * 0.16 + pulses.delay * 0.16),
      pulse: delayPulse,
      phase: clamp01(snapshot.root * 0.36 + pulses.synthStepPhase * 0.28 + pulses.drumStepPhase * 0.2 + snapshot.delay * 0.16),
      density: clamp01(snapshot.delay * 0.5 + snapshot.spread * 0.24 + snapshot.tension * 0.16),
    },
    texture: {
      level: clamp01(snapshot.earth * 0.54 + snapshot.dynamics * 0.28 + pulses.earth * 0.18),
      pulse: earthPulse,
      phase: clamp01(snapshot.root * 0.22 + snapshot.tension * 0.28 + pulses.drumStepPhase * 0.14 + snapshot.earth * 0.36),
      density: clamp01(snapshot.earth * 0.42 + snapshot.dynamics * 0.34 + snapshot.granular * 0.14),
    },
    impact: {
      level: clamp01(snapshot.drums * 0.58 + snapshot.dynamics * 0.26 + pulses.drums * 0.22),
      pulse: impactPulse,
      phase: clamp01(pulses.drumStepPhase),
      density: clamp01(pulses.drumHitDensity * 0.72 + snapshot.drums * 0.28),
    },
  };
}

export function getEffectiveReactionDepth(settings: VisualizerReactionSettings): number {
  // Morph depth is a centered sensitivity trim in every mode. At the default
  // 0.5 it is neutral; the endpoints halve or increase modulation depth.
  const morphDepth = 0.5 + clamp01(settings.morphAroundPreset);
  const depth = clamp01(settings.reactionAmount) * morphDepth;
  return Math.min(1, depth * 1.28 + 0.04);
}

export function getEffectiveReactiveRange(
  baseValue: number,
  range: VisualizerReactiveRange | undefined,
  settings: VisualizerReactionSettings,
): VisualizerReactiveRange {
  const source = range ?? { min: baseValue, max: baseValue };
  const depth = getEffectiveReactionDepth(settings);
  return {
    min: clamp(baseValue + (source.min - baseValue) * depth, -1, 1),
    max: clamp(baseValue + (source.max - baseValue) * depth, -1, 1),
  };
}

export function applyVisualizerModulation(
  baseControls: ReactiveVisualizerControls,
  ranges: VisualizerReactiveRanges,
  buses: VisualBuses,
  settings: VisualizerReactionSettings,
): ReactiveVisualizerControls {
  const next: ReactiveVisualizerControls = {
    ...baseControls,
    layerOrder: [...baseControls.layerOrder],
  };
  const depth = getEffectiveReactionDepth(settings);
  if (depth <= 0.0001 || settings.reactionAmount <= 0.0001) {
    return next;
  }

  for (const compiledTarget of COMPILED_VISUAL_MOD_TARGETS) {
    const target = compiledTarget.target;
    let rawDrive = 0;
    for (const route of compiledTarget.routes) {
      const bus = buses[route.bus];
      const signal = bus[route.signal];
      const centeredSignal = route.signal === 'phase' ? (signal - 0.5) * 2 : signal;
      rawDrive += centeredSignal * route.amount * (route.polarity ?? 1);
    }
    const baseValue = baseControls[target] as number;
    const drive = clamp(rawDrive, -1, 1);
    const range = ranges[target] ?? { min: baseValue, max: baseValue };
    let destination = drive >= 0 ? range.max : range.min;
    if (target === 'kaleidoscope' && baseValue <= -0.75) {
      destination = Math.min(destination, -0.82);
    }
    (next as Record<VisualizerNumericControlKey, number>)[target] = clamp(
      baseValue + (destination - baseValue) * Math.abs(drive) * depth,
      -1,
      1,
    );
  }

  return next;
}

export function getDriversForTarget(target: VisualizerNumericControlKey): VisualModRoute[] {
  return VISUAL_MOD_ROUTES_BY_TARGET.get(target) ?? [];
}

export function getDriverEnginesForTarget(target: VisualizerNumericControlKey): VisualDriverEngine[] {
  const engines = new Set<VisualDriverEngine>();
  for (const route of getDriversForTarget(target)) {
    for (const engine of route.engines) engines.add(engine);
  }
  return [...engines];
}
