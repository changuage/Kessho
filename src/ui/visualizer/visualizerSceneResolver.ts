import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';
import {
  clamp01,
  clampBipolar,
  type VisualizerLayerMacros,
  type VisualizerPerformanceMacros,
} from './visualizerControls';

export function deriveSceneMacroPatch(
  macros: VisualizerPerformanceMacros,
): Partial<ReactiveVisualizerControls> {
  const soft = (clamp01(macros.soft) - 0.5) * 2;
  const pulse = (clamp01(macros.pulse) - 0.5) * 2;
  const particles = (clamp01(macros.particles) - 0.5) * 2;
  const glitch = (clamp01(macros.glitch) - 0.5) * 2;
  const bright = (clamp01(macros.bright) - 0.5) * 2;
  return {
    shapeCount: particles * 0.34 - soft * 0.22,
    noiseDensity: particles * 0.26 - soft * 0.2,
    motion: pulse * 0.34 - soft * 0.2,
    pulseSync: pulse * 0.52,
    triggerResponse: pulse * 0.58,
    ripples: pulse * 0.42,
    shapeSize: pulse * 0.24 + particles * 0.18 - soft * 0.16,
    shapeSpread: particles * 0.3 + pulse * 0.16 - soft * 0.18,
    bloomSize: pulse * 0.18 + bright * 0.24,
    pointCloudDensity: particles * 0.42,
    pointCloudScatter: particles * 0.34,
    pointCloudSize: particles * 0.2 + pulse * 0.12,
    pointCloudColor: bright * 0.36,
    glitchIntensity: glitch * 0.48 - soft * 0.18,
    glitchChromatic: glitch * 0.36,
    glitchScale: glitch * 0.28,
    kaleidoscope: glitch * 0.28,
    kaleidoSegments: glitch * 0.24,
    kaleidoSpin: glitch * 0.18,
    brightness: bright * 0.48 + pulse * 0.08 - soft * 0.28,
    vibrance: bright * 0.44,
    saturation: bright * 0.4 + particles * 0.1 - soft * 0.2,
    color: bright * 0.34,
  };
}

export function deriveLayerMacroPatch(
  macros: VisualizerLayerMacros,
): Partial<ReactiveVisualizerControls> {
  const formation = (clamp01(macros.formation) - 0.5) * 2;
  const weather = (clamp01(macros.weather) - 0.5) * 2;
  const fragmentation = (clamp01(macros.fragmentation) - 0.5) * 2;
  const symmetry = (clamp01(macros.symmetry) - 0.5) * 2;
  const material = (clamp01(macros.material) - 0.5) * 2;
  const age = (clamp01(macros.age) - 0.5) * 2;
  const depth = (clamp01(macros.depth) - 0.5) * 2;
  const ageAmount = Math.abs(age);
  return {
    shapeCount: formation * 0.46,
    shapeSize: formation * 0.3,
    shapeSpread: formation * 0.42,
    shape: formation * 0.28,
    edges: formation * 0.2,
    style: weather,
    noiseDensity: Math.abs(weather) * 0.46,
    noiseTurbulence: weather * 0.38,
    noiseFlow: weather * 0.28,
    bloomSize: Math.abs(weather) * 0.22 + depth * 0.28,
    glitchIntensity: fragmentation,
    glitchScale: fragmentation * 0.42,
    glitchChromatic: Math.max(0, fragmentation) * 0.56,
    glitchRate: Math.abs(fragmentation) * 0.48,
    kaleidoscope: symmetry,
    kaleidoSegments: Math.abs(symmetry) * 0.54,
    kaleidoSpin: symmetry * 0.34,
    kaleidoReflections: Math.abs(symmetry) * 0.42,
    kaleidoSize: Math.abs(symmetry) * 0.28,
    pointCloudAmount: material,
    pointCloudSize: material * 0.26,
    pointCloudDensity: material * 0.42,
    pointCloudScatter: material * 0.34,
    pointCloudColor: Math.max(0, material) * 0.32,
    charAmount: ageAmount * 0.82,
    charStyle: age,
    charGrain: ageAmount * 0.48,
    charDrift: Math.max(0, -age) * 0.34,
    background: depth * 0.42,
    backdropFade: depth * 0.48,
    brightness: depth * 0.24,
    saturation: depth * 0.18,
    visualLimiter: Math.abs(depth) * 0.16,
  };
}

function addControlOffsets(
  controls: ReactiveVisualizerControls,
  offsets: Partial<ReactiveVisualizerControls>,
): ReactiveVisualizerControls {
  const next = { ...controls, layerOrder: [...controls.layerOrder] };
  for (const [key, offset] of Object.entries(offsets)) {
    if (typeof offset !== 'number') continue;
    const controlKey = key as keyof ReactiveVisualizerControls;
    const baseValue = controls[controlKey];
    if (typeof baseValue !== 'number') continue;
    (next as unknown as Record<string, number>)[key] = clampBipolar(baseValue + offset);
  }
  return next;
}

export function resolveVisualizerMacroControls(
  baseControls: ReactiveVisualizerControls,
  sceneMacros: VisualizerPerformanceMacros,
  layerMacros: VisualizerLayerMacros,
): ReactiveVisualizerControls {
  return addControlOffsets(
    addControlOffsets(baseControls, deriveSceneMacroPatch(sceneMacros)),
    deriveLayerMacroPatch(layerMacros),
  );
}
