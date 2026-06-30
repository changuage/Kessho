/**
 * Snowflake V2 — Arm Params from Macros
 *
 * Maps macro values into SnowflakeParams for the SVG generator.
 * Uses Classic Dendrite for sound engines, Fern Dendrite for FX engines.
 *
 * Macro → Param mapping:
 *   Ornament (+round, -angular): branchMotif, centerRadius, rings, angleJitter
 *   Fractal (+granular, -clean): fractal.depth, lengthDecay, fractal detail
 *   Density (+delayA, -delayB): branching.slots, probability, station template
 *   Structure (-1 off → +1 max): radius, armSegments, strokeWidth
 *   Aura (reverb send): glow/frost, bloom nodes, opacity
 *   Erosion (degrade send): roughness, taper, sharpness, noisy variation
 */

import type {
  SnowflakeBranchMotif,
  SnowflakeCenterMotif,
  SnowflakeFamily,
  SnowflakeParams,
  SnowflakePositionBias,
  SnowflakeRingStyle,
  SnowflakeSideNodes,
  SnowflakeStationTemplate,
  SnowflakeTipMotif,
} from '../../snowflake/types';
import type { ArmMacros } from './macros';
import type { EngineGroupDef } from './engineGroups';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01Value(value: number): number {
  return clamp(value, 0, 1);
}

/** Lerp between two values by t (0-1) */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01Value(t);
}

/** Map a -1..+1 macro to 0..1 (absolute magnitude) */
function abs01(v: number): number {
  return Math.abs(clamp(v, -1, 1));
}

/** Map a -1..+1 macro to 0..1 (shifted so -1=0, +1=1) */
function shift01(v: number): number {
  return (clamp(v, -1, 1) + 1) / 2;
}

/**
 * Build SnowflakeParams for one arm.
 *
 * @param macros - The computed macro values for this arm
 * @param engine - The engine group definition (provides family + identity)
 * @param seed - Deterministic seed for this arm slot
 */
export function buildArmParams(
  macros: ArmMacros,
  engine: EngineGroupDef,
  seed: number,
): SnowflakeParams {
  const { ornament, fractal, density, structure, aura, erosion } = macros;

  // Absolute magnitudes (0-1)
  const ornMag = abs01(ornament);
  const fracMag = abs01(fractal);
  const densMag = abs01(density);
  const structShift = shift01(structure); // 0 = engine off, 1 = engine max
  const auraMag = clamp01Value(aura);
  const erosionMag = clamp01Value(erosion);

  // Direction signs
  const ornSign = ornament >= 0 ? 1 : -1; // +1 = round/diffuse, -1 = angular/decay
  const fracSign = fractal >= 0 ? 1 : -1; // +1 = granular, -1 = clean

  // Each engine uses its own family for distinct visual character
  const family: SnowflakeFamily = engine.family;

  // --- Structure → geometry/complexity ---
  // Keep reach mostly stable: level 0 is 80% length, level 1 is full length.
  // Let structure speak through internal detail, stroke behavior, and tips.
  const radius = lerp(136, 170, structShift);
  const armSegments = Math.round(lerp(2, 12, Math.max(structShift, erosionMag * 0.32)));
  const strokeWidth = clamp(lerp(1.2, 4.4, structShift) + auraMag * 0.45 - erosionMag * 0.22, 1, 5.1);

  // --- Ornament → rings (magnitude = count, direction = style) ---
  // + (round/diffuse): circular rings, organic
  // - (angular/decay): hex rings, sharp
  const rings = Math.round(lerp(0, 6, ornMag));
  const ringStyle: SnowflakeRingStyle = ornSign > 0
    ? (rings > 1 ? 'circleRing' : rings > 0 ? 'innerHexRing' : 'none')
    : (rings > 1 ? 'doubleHexRing' : rings > 0 ? 'spokeConnector' : 'none');
  const centerRadius = lerp(8, 20, ornMag);
  const centerMotif: SnowflakeCenterMotif = ornMag > 0.5
    ? (ornSign > 0 ? 'ringedHexagon' : 'hexagon')
    : (ornMag > 0.2 ? 'dot' : 'none');
  const glow = Math.max(lerp(0, 0.38, ornMag), lerp(0, 0.68, auraMag));

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
  const fractalRoughness = fracSign > 0 ? lerp(0, 0.3, fracMag) : 0;
  const roughness = Math.max(fractalRoughness, lerp(0, 0.72, erosionMag));
  const randomness = clamp01Value((fracSign > 0 ? lerp(0.2, 0.5, fracMag) : lerp(0.2, 0.1, fracMag)) + erosionMag * 0.22);

  // --- Density → branching density ---
  // Magnitude controls how many branch slots, probability
  const densityDriver = Math.max(densMag, structShift * 0.55, auraMag * 0.18, erosionMag * 0.16);
  const slots = Math.round(lerp(2, 10, densityDriver));
  const probability = lerp(0.62, 0.96, densityDriver);
  const lengthRatio = clamp(lerp(0.16, 0.36, Math.max(densMag, structShift * 0.35)) + auraMag * 0.03 - erosionMag * 0.035, 0.12, 0.38);
  const stationTemplate: SnowflakeStationTemplate = densMag > 0.7 ? 'dense' :
    densMag > 0.4 ? 'balanced' : 'sparse';
  const branchAngle = clamp(lerp(40, 60, densMag) + auraMag * 4 - erosionMag * 9, 28, 68);
  const angleJitter = clamp(lerp(2, 5, densMag) + erosionMag * 8, 0, 12);
  const lengthJitter = clamp(lerp(0.04, 0.14, densMag) + erosionMag * 0.2, 0.02, 0.36);
  const positionJitter = clamp(lerp(0.01, 0.025, densMag) + erosionMag * 0.055, 0, 0.1);
  const branchMotif: SnowflakeBranchMotif = erosionMag > 0.72 ? 'comb' :
    erosionMag > 0.44 ? 'arrow' :
      densMag > 0.6 ? 'miniDendrite' : densMag > 0.3 ? 'chevron' : 'fork';
  const structureTipStyle: SnowflakeTipMotif = structShift > 0.68 ? 'doubleFork' : structShift > 0.34 ? 'fork' : 'point';
  const tipStyle: SnowflakeTipMotif = erosionMag > 0.76 ? 'smallStar' :
    erosionMag > 0.52 ? 'splitV' :
      auraMag > 0.72 ? 'circle' : structureTipStyle;
  const sideNodes: SnowflakeSideNodes = erosionMag > 0.7 ? 'tinyStars' :
    erosionMag > 0.4 ? 'diamonds' :
      auraMag > 0.55 ? 'circles' :
        auraMag > 0.24 ? 'dots' :
          densMag > 0.6 ? 'dots' : 'none';
  const positionBias: SnowflakePositionBias = erosionMag > 0.55 ? 'outer' : auraMag > 0.5 ? 'inner' : 'even';
  const sharpnessBase = ornSign > 0 ? lerp(0.3, 0.2, ornMag) : lerp(0.3, 0.7, ornMag);
  const sharpness = clamp(Math.max(sharpnessBase, lerp(0.34, 0.92, erosionMag)) - auraMag * 0.12, 0.08, 0.95);
  const strokeOpacity = clamp(lerp(0.42, 1, structShift) + auraMag * 0.16 - erosionMag * 0.08, 0.36, 1);
  const taper = clamp(lerp(0.08, 0.55, structShift) + erosionMag * 0.3 - auraMag * 0.06, 0, 1);

  // Max segments scales with complexity
  const maxSegments = Math.round(lerp(160, 1200, Math.max(structShift * 0.9, fracMag, densMag, erosionMag * 0.45)));

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
      lengthJitter,
      positionJitter,
      positionBias,
      branchStart: lerp(0.28, 0.1, structShift),
      branchEnd: 0.95,
      guaranteedInnerBranches: structShift > 0.12,
      stationTemplate,
      branchMotif,
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
      center: centerMotif,
      tips: tipStyle,
      rings,
      ringStyle,
      plates: ornMag > 0.36 || auraMag > 0.72,
      hollowCenter: false,
      sideNodes,
    },
    style: {
      strokeWidth,
      strokeColor: 'rgba(210, 230, 255, 0.95)',
      strokeOpacity,
      backgroundColor: 'transparent',
      lineCap: 'round',
      lineJoin: 'round',
      taper,
      glow,
      roughness,
      sharpness,
    },
    variation: {
      randomness,
      asymmetry: clamp(lerp(0, 0.04, fracMag) + erosionMag * 0.12, 0, 0.18),
      angleNoise: clamp(lerp(0.05, 0.15, fracMag) + erosionMag * 0.34, 0.02, 0.5),
      lengthNoise: clamp(lerp(0.1, 0.2, densMag) + erosionMag * 0.28, 0.04, 0.48),
      densityNoise: clamp(lerp(0.1, 0.3, densMag) + erosionMag * 0.42, 0.04, 0.65),
    },
  };
}
