/**
 * Snowflake V2 — Arm Params from Macros
 *
 * Maps the 4 macro values (-1 to +1) into SnowflakeParams for the SVG generator.
 * Uses Classic Dendrite for sound engines, Fern Dendrite for FX engines.
 *
 * Macro → Param mapping:
 *   Ornament (+round, -angular): branchMotif, centerRadius, rings, angleJitter
 *   Fractal (+granular, -clean): fractal.depth, lengthDecay, fractal detail
 *   Density (+delayA, -delayB): branching.slots, probability, station template
 *   Structure (-1 off → +1 max): radius, armSegments, strokeWidth
 */

import type { SnowflakeParams, SnowflakeFamily } from '../../snowflake/types';
import type { ArmMacros } from './macros';
import type { EngineGroupDef } from './engineGroups';

/** Lerp between two values by t (0-1) */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Map a -1..+1 macro to 0..1 (absolute magnitude) */
function abs01(v: number): number {
  return Math.abs(Math.max(-1, Math.min(1, v)));
}

/** Map a -1..+1 macro to 0..1 (shifted so -1=0, +1=1) */
function shift01(v: number): number {
  return (Math.max(-1, Math.min(1, v)) + 1) / 2;
}

/**
 * Build SnowflakeParams for one arm.
 *
 * @param macros - The 4 computed macro values for this arm
 * @param engine - The engine group definition (provides family + identity)
 * @param seed - Deterministic seed for this arm slot
 */
export function buildArmParams(
  macros: ArmMacros,
  engine: EngineGroupDef,
  seed: number,
): SnowflakeParams {
  const { ornament, fractal, density, structure } = macros;

  // Absolute magnitudes (0-1)
  const ornMag = abs01(ornament);
  const fracMag = abs01(fractal);
  const densMag = abs01(density);
  const structShift = shift01(structure); // 0 = engine off, 1 = engine max

  // Direction signs
  const ornSign = ornament >= 0 ? 1 : -1; // +1 = round/diffuse, -1 = angular/decay
  const fracSign = fractal >= 0 ? 1 : -1; // +1 = granular, -1 = clean

  // Each engine uses its own family for distinct visual character
  const family: SnowflakeFamily = engine.family;

  // --- Structure → geometry/complexity ---
  // Keep reach mostly stable: level 0 is 80% length, level 1 is full length.
  // Let structure speak through internal detail, stroke behavior, and tips.
  const radius = lerp(136, 170, structShift);
  const armSegments = Math.round(lerp(2, 12, structShift));
  const strokeWidth = lerp(1.2, 4.4, structShift);

  // --- Ornament → rings (magnitude = count, direction = style) ---
  // + (round/diffuse): circular rings, organic
  // - (angular/decay): hex rings, sharp
  const rings = Math.round(lerp(0, 6, ornMag));
  const ringStyle = ornSign > 0
    ? (rings > 1 ? 'circleRing' : rings > 0 ? 'innerHexRing' : 'none')
    : (rings > 1 ? 'doubleHexRing' : rings > 0 ? 'spokeConnector' : 'none');
  const centerRadius = lerp(8, 20, ornMag);
  const centerMotif = ornMag > 0.5
    ? (ornSign > 0 ? 'ringedHexagon' : 'hexagon')
    : (ornMag > 0.2 ? 'dot' : 'none');
  const glow = lerp(0, 0.5, ornMag);

  // --- Fractal → recursive detail ---
  // + (granular): more fractal depth, wilder detail
  // - (clean): minimal/no fractal, clean lines
  const fractalDepth = fracSign > 0
    ? Math.round(lerp(0, 4, fracMag))
    : Math.round(lerp(0, 1, fracMag));
  const lengthDecay = fracSign > 0
    ? lerp(0.55, 0.65, fracMag)  // granular = longer sub-branches
    : lerp(0.55, 0.45, fracMag); // clean = shorter
  const widthDecay = fracSign > 0
    ? lerp(0.68, 0.58, fracMag)
    : lerp(0.68, 0.78, fracMag);
  const probabilityDecay = fracSign > 0
    ? lerp(0.7, 0.85, fracMag)
    : lerp(0.7, 0.55, fracMag);
  const roughness = fracSign > 0 ? lerp(0, 0.3, fracMag) : 0;
  const randomness = fracSign > 0 ? lerp(0.2, 0.5, fracMag) : lerp(0.2, 0.1, fracMag);

  // --- Density → branching density ---
  // Magnitude controls how many branch slots, probability
  const slots = Math.round(lerp(2, 10, Math.max(densMag, structShift * 0.45)));
  const probability = lerp(0.62, 0.96, Math.max(densMag, structShift * 0.55));
  const lengthRatio = lerp(0.16, 0.36, Math.max(densMag, structShift * 0.35));
  const stationTemplate = densMag > 0.7 ? 'dense' :
    densMag > 0.4 ? 'balanced' : 'sparse';
  const branchAngle = lerp(40, 60, densMag);
  const angleJitter = lerp(2, 5, densMag);
  const branchMotif = densMag > 0.6 ? 'miniDendrite' : densMag > 0.3 ? 'chevron' : 'fork';
  const tipStyle = structShift > 0.68 ? 'doubleFork' : structShift > 0.34 ? 'fork' : 'point';

  // Max segments scales with complexity
  const maxSegments = Math.round(lerp(160, 1200, Math.max(structShift * 0.9, fracMag, densMag)));

  return {
    seed,
    family,
    symmetry: {
      arms: 1,
      mirrorArm: true,
      rotationOffset: 0,
      alternateMirror: false,
    },
    geometry: {
      radius,
      centerRadius,
      innerGap: 7,
      armSegments,
      tipStyle,
      silhouette: family === 'fernDendrite' ? 'fern' : 'stellar',
    },
    branching: {
      slots,
      probability,
      angle: branchAngle,
      angleJitter,
      lengthRatio,
      lengthJitter: lerp(0.04, 0.14, densMag),
      positionJitter: lerp(0.01, 0.025, densMag),
      positionBias: 'even',
      branchStart: lerp(0.28, 0.1, structShift),
      branchEnd: 0.95,
      guaranteedInnerBranches: structShift > 0.12,
      stationTemplate: stationTemplate as any,
      branchMotif: branchMotif as any,
    },
    fractal: {
      depth: fractalDepth,
      lengthDecay,
      widthDecay,
      probabilityDecay,
      minLength: 3,
      maxSegments,
    },
    motifs: {
      center: centerMotif as any,
      tips: tipStyle as any,
      rings,
      ringStyle: ringStyle as any,
      plates: ornMag > 0.36,
      hollowCenter: false,
      sideNodes: densMag > 0.6 ? 'dots' : 'none',
    },
    style: {
      strokeWidth,
      strokeColor: 'rgba(210, 230, 255, 0.95)',
      strokeOpacity: lerp(0.42, 1, structShift),
      backgroundColor: 'transparent',
      lineCap: 'round',
      lineJoin: 'round',
      taper: lerp(0.08, 0.55, structShift),
      glow,
      roughness,
      sharpness: ornSign > 0 ? lerp(0.3, 0.2, ornMag) : lerp(0.3, 0.7, ornMag),
    },
    variation: {
      randomness,
      asymmetry: lerp(0, 0.04, fracMag),
      angleNoise: lerp(0.05, 0.15, fracMag),
      lengthNoise: lerp(0.1, 0.2, densMag),
      densityNoise: lerp(0.1, 0.3, densMag),
    },
  };
}
