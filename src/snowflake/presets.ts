import type { SnowflakeFamily, SnowflakeParams } from './types';

export interface SnowflakeStylePreset {
  id: string;
  name: string;
  params: SnowflakeParams;
}

export interface ColorPreset {
  id: string;
  name: string;
  strokeColor: string;
  strokeOpacity: number;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  backgroundColor: string;
  glow: number;
}

export const DEFAULT_SNOWFLAKE_PARAMS: SnowflakeParams = {
  seed: 48291,
  family: 'classicDendrite',
  symmetry: {
    arms: 6,
    mirrorArm: true,
    rotationOffset: 0,
    alternateMirror: false,
  },
  geometry: {
    radius: 160,
    centerRadius: 9,
    innerGap: 7,
    armSegments: 7,
    tipStyle: 'fork',
    silhouette: 'stellar',
  },
  branching: {
    slots: 4,
    probability: 0.88,
    angle: 45,
    angleJitter: 3,
    lengthRatio: 0.28,
    lengthJitter: 0.08,
    positionJitter: 0.018,
    positionBias: 'even',
    branchStart: 0.12,
    branchEnd: 0.95,
    guaranteedInnerBranches: true,
    stationTemplate: 'balanced',
    branchMotif: 'chevron',
  },
  fractal: {
    depth: 1,
    lengthDecay: 0.55,
    widthDecay: 0.68,
    probabilityDecay: 0.75,
    minLength: 4,
    maxSegments: 520,
  },
  motifs: {
    center: 'hexagon',
    tips: 'fork',
    rings: 1,
    ringStyle: 'innerHexRing',
    plates: false,
    hollowCenter: false,
    sideNodes: 'none',
  },
  style: {
    strokeWidth: 3,
    strokeColor: '#009ee3',
    strokeOpacity: 1,
    backgroundColor: '#ffffff',
    lineCap: 'round',
    lineJoin: 'round',
    taper: 0.25,
    glow: 0,
    roughness: 0,
    sharpness: 0.35,
  },
  variation: {
    randomness: 0.4,
    asymmetry: 0.03,
    angleNoise: 0.1,
    lengthNoise: 0.2,
    densityNoise: 0.25,
  },
};

export const SNOWFLAKE_STYLE_PRESETS: SnowflakeStylePreset[] = [
  {
    id: 'simple-blue-icon',
    name: 'Simple Blue Icon',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 1208,
      family: 'simpleSpoke',
      geometry: { radius: 150, centerRadius: 7, armSegments: 3, tipStyle: 'splitV', silhouette: 'compact' },
      branching: { slots: 3, probability: 1, angle: 45, angleJitter: 1.5, lengthRatio: 0.22, lengthJitter: 0.04, positionJitter: 0.01, positionBias: 'even', branchStart: 0.16, stationTemplate: 'sparse', branchMotif: 'shortBar' },
      fractal: { depth: 1, lengthDecay: 0.45, widthDecay: 0.74, probabilityDecay: 0.58, maxSegments: 360 },
      motifs: { center: 'smallSpokes', tips: 'splitV', rings: 0, ringStyle: 'none', plates: false, sideNodes: 'none' },
      style: { strokeWidth: 4.2, strokeColor: '#008ed2', backgroundColor: '#ffffff', glow: 0, sharpness: 0.28 },
      variation: { randomness: 0.18, asymmetry: 0, angleNoise: 0.04, lengthNoise: 0.08, densityNoise: 0.08 },
    }),
  },
  {
    id: 'classic-six-arm',
    name: 'Classic Six-Arm Snowflake',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 48291,
      family: 'classicDendrite',
      geometry: { radius: 164, centerRadius: 12, armSegments: 6, tipStyle: 'fork', silhouette: 'stellar' },
      branching: { slots: 4, probability: 0.9, angle: 45, angleJitter: 2.5, lengthRatio: 0.27, lengthJitter: 0.06, positionJitter: 0.014, positionBias: 'even', branchStart: 0.16, stationTemplate: 'balanced', branchMotif: 'chevron' },
      fractal: { depth: 0, lengthDecay: 0.52, widthDecay: 0.72, probabilityDecay: 0.62, maxSegments: 420 },
      motifs: { center: 'ringedHexagon', tips: 'splitV', rings: 1, ringStyle: 'innerHexRing', sideNodes: 'none' },
      style: { strokeWidth: 3, strokeColor: '#009ee3', backgroundColor: '#ffffff', glow: 0, sharpness: 0.36 },
    }),
  },
  {
    id: 'dense-fractal-crystal',
    name: 'Dense Fractal Crystal',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 83017,
      family: 'denseFractal',
      geometry: { radius: 170, centerRadius: 10, armSegments: 8, tipStyle: 'doubleFork', silhouette: 'round' },
      branching: { slots: 9, probability: 0.9, angle: 50, angleJitter: 5, lengthRatio: 0.34, lengthJitter: 0.16, positionJitter: 0.025, stationTemplate: 'dense', branchMotif: 'miniDendrite' },
      fractal: { depth: 4, lengthDecay: 0.58, widthDecay: 0.6, probabilityDecay: 0.82, minLength: 3, maxSegments: 1200 },
      motifs: { center: 'crystalCluster', tips: 'doubleFork', rings: 2, ringStyle: 'doubleHexRing', plates: false, sideNodes: 'dots' },
      style: { strokeWidth: 2, strokeColor: '#83d8ff', backgroundColor: '#f9fdff', glow: 0.16, taper: 0.48, sharpness: 0.62 },
      variation: { randomness: 0.42, asymmetry: 0.02, angleNoise: 0.12, lengthNoise: 0.18, densityNoise: 0.28 },
    }),
  },
  {
    id: 'hex-plate',
    name: 'Hex Plate',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 51420,
      family: 'hexPlate',
      geometry: { radius: 156, centerRadius: 16, innerGap: 10, armSegments: 3, tipStyle: 'point', silhouette: 'plate' },
      branching: { slots: 3, probability: 1, angle: 60, angleJitter: 1, lengthRatio: 0.24, lengthJitter: 0.04, positionJitter: 0.01, branchStart: 0.18, stationTemplate: 'sparse', branchMotif: 'shortBar' },
      fractal: { depth: 0, lengthDecay: 0.48, widthDecay: 0.82, probabilityDecay: 0.55, maxSegments: 380 },
      motifs: { center: 'ringedHexagon', tips: 'point', rings: 2, ringStyle: 'doubleHexRing', plates: true, sideNodes: 'diamonds' },
      style: { strokeWidth: 3.1, strokeColor: '#009ee3', backgroundColor: '#ffffff', glow: 0, sharpness: 0.58 },
      variation: { randomness: 0.12, asymmetry: 0, angleNoise: 0.02, lengthNoise: 0.06, densityNoise: 0.06 },
    }),
  },
  {
    id: 'stellar-plate',
    name: 'Stellar Plate',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 68112,
      family: 'stellarPlate',
      geometry: { radius: 162, centerRadius: 17, innerGap: 10, armSegments: 4, tipStyle: 'flatCap', silhouette: 'stellar' },
      branching: { slots: 3, probability: 0.92, angle: 45, angleJitter: 1.5, lengthRatio: 0.23, lengthJitter: 0.04, positionJitter: 0.01, stationTemplate: 'sparse', branchMotif: 'shortBar' },
      fractal: { depth: 0, lengthDecay: 0.5, widthDecay: 0.76, probabilityDecay: 0.58, maxSegments: 380 },
      motifs: { center: 'sixPointStar', tips: 'flatCap', rings: 2, ringStyle: 'spokeConnector', plates: true, sideNodes: 'none' },
      style: { strokeWidth: 3.4, strokeColor: '#008ed2', backgroundColor: '#ffffff', glow: 0, sharpness: 0.46 },
      variation: { randomness: 0.2, asymmetry: 0.01, angleNoise: 0.05, lengthNoise: 0.09, densityNoise: 0.1 },
    }),
  },
  {
    id: 'ringed-crystal',
    name: 'Ringed Crystal',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 45773,
      family: 'ringedCrystal',
      geometry: { radius: 160, centerRadius: 14, innerGap: 8, armSegments: 5, tipStyle: 'flatCap', silhouette: 'round' },
      branching: { slots: 5, probability: 0.92, angle: 50, angleJitter: 2.5, lengthRatio: 0.27, lengthJitter: 0.08, positionJitter: 0.015, stationTemplate: 'innerStar', branchMotif: 'doubleChevron' },
      fractal: { depth: 1, lengthDecay: 0.52, widthDecay: 0.76, probabilityDecay: 0.6, maxSegments: 600 },
      motifs: { center: 'ringedHexagon', tips: 'flatCap', rings: 3, ringStyle: 'circleRing', plates: false, sideNodes: 'circles' },
      style: { strokeWidth: 2.8, strokeColor: '#0aa7e7', backgroundColor: '#ffffff', glow: 0.04, sharpness: 0.34 },
      variation: { randomness: 0.22, asymmetry: 0.005, angleNoise: 0.05, lengthNoise: 0.1, densityNoise: 0.12 },
    }),
  },
  {
    id: 'icy-dark-glow',
    name: 'Icy Dark Crystal',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 60444,
      family: 'fernDendrite',
      geometry: { radius: 166, centerRadius: 13, armSegments: 8, tipStyle: 'smallStar', silhouette: 'fern' },
      branching: { slots: 8, probability: 0.86, angle: 50, angleJitter: 5, lengthRatio: 0.32, lengthJitter: 0.14, positionJitter: 0.025, stationTemplate: 'dense', branchMotif: 'comb' },
      fractal: { depth: 3, lengthDecay: 0.56, widthDecay: 0.63, probabilityDecay: 0.78, maxSegments: 1000 },
      motifs: { center: 'sixPointStar', tips: 'smallStar', rings: 2, ringStyle: 'spokeConnector', plates: true, sideNodes: 'circles' },
      style: { strokeWidth: 2.2, strokeColor: '#d8f6ff', backgroundColor: '#03111d', strokeOpacity: 0.78, glow: 0.72, taper: 0.42, sharpness: 0.55 },
      variation: { randomness: 0.4, asymmetry: 0.035, angleNoise: 0.12, lengthNoise: 0.18, densityNoise: 0.26 },
    }),
  },
  {
    id: 'ornamental-star-center',
    name: 'Ornamental Star Center',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 71906,
      family: 'ornamentalIcon',
      geometry: { radius: 158, centerRadius: 20, innerGap: 10, armSegments: 5, tipStyle: 'circle', silhouette: 'compact' },
      branching: { slots: 5, probability: 0.96, angle: 42, angleJitter: 2, lengthRatio: 0.29, lengthJitter: 0.06, positionJitter: 0.014, positionBias: 'even', stationTemplate: 'innerStar', branchMotif: 'doubleChevron' },
      fractal: { depth: 2, lengthDecay: 0.52, widthDecay: 0.7, probabilityDecay: 0.72, maxSegments: 760 },
      motifs: { center: 'sixPointStar', tips: 'circle', rings: 3, ringStyle: 'doubleHexRing', plates: true, hollowCenter: false, sideNodes: 'diamonds' },
      style: { strokeWidth: 2.8, strokeColor: '#0aa7e7', backgroundColor: '#ffffff', glow: 0.04, sharpness: 0.48 },
      variation: { randomness: 0.36, asymmetry: 0.01, angleNoise: 0.08, lengthNoise: 0.14, densityNoise: 0.2 },
    }),
  },
  {
    id: 'thin-sharp-crystal',
    name: 'Thin Sharp Crystal',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 22719,
      family: 'thinSharpCrystal',
      geometry: { radius: 176, centerRadius: 8, innerGap: 4, armSegments: 8, tipStyle: 'point', silhouette: 'spiky' },
      branching: { slots: 6, probability: 0.82, angle: 35, angleJitter: 3, lengthRatio: 0.24, lengthJitter: 0.08, positionJitter: 0.016, positionBias: 'even', stationTemplate: 'balanced', branchMotif: 'chevron' },
      fractal: { depth: 3, lengthDecay: 0.62, widthDecay: 0.58, probabilityDecay: 0.7, minLength: 3, maxSegments: 920 },
      motifs: { center: 'circle', tips: 'point', rings: 1, plates: false, sideNodes: 'none' },
      style: { strokeWidth: 1.35, strokeColor: '#bbf1ff', backgroundColor: '#06141f', strokeOpacity: 0.72, lineCap: 'butt', lineJoin: 'miter', glow: 0.52, taper: 0.82, sharpness: 0.9 },
      variation: { randomness: 0.42, asymmetry: 0.015, angleNoise: 0.16, lengthNoise: 0.22, densityNoise: 0.24 },
    }),
  },
  {
    id: 'rounded-friendly-icon',
    name: 'Rounded Friendly Icon',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 33452,
      family: 'roundedIcon',
      geometry: { radius: 148, centerRadius: 11, armSegments: 4, tipStyle: 'circle', silhouette: 'compact' },
      branching: { slots: 4, probability: 1, angle: 50, angleJitter: 2, lengthRatio: 0.28, lengthJitter: 0.05, positionJitter: 0.014, positionBias: 'even', stationTemplate: 'sparse', branchMotif: 'chevron' },
      fractal: { depth: 1, lengthDecay: 0.48, widthDecay: 0.75, probabilityDecay: 0.6, maxSegments: 420 },
      motifs: { center: 'dot', tips: 'circle', rings: 0, ringStyle: 'none', plates: false, sideNodes: 'dots' },
      style: { strokeWidth: 5.2, strokeColor: '#00a3e8', backgroundColor: '#ffffff', lineCap: 'round', lineJoin: 'round', taper: 0, sharpness: 0.08 },
      variation: { randomness: 0.2, asymmetry: 0, angleNoise: 0.04, lengthNoise: 0.08, densityNoise: 0.1 },
    }),
  },
  {
    id: 'chaotic-natural',
    name: 'Chaotic Natural Snowflake',
    params: mergeParams(DEFAULT_SNOWFLAKE_PARAMS, {
      seed: 99104,
      family: 'fernDendrite',
      geometry: { radius: 170, centerRadius: 9, armSegments: 9, tipStyle: 'fork', silhouette: 'fern' },
      branching: { slots: 8, probability: 0.78, angle: 45, angleJitter: 7, lengthRatio: 0.34, lengthJitter: 0.18, positionJitter: 0.035, positionBias: 'even', stationTemplate: 'dense', branchMotif: 'miniDendrite' },
      fractal: { depth: 3, lengthDecay: 0.57, widthDecay: 0.64, probabilityDecay: 0.76, minLength: 3, maxSegments: 1050 },
      motifs: { center: 'ringedHexagon', tips: 'fork', rings: 1, ringStyle: 'innerHexRing', plates: false, sideNodes: 'dots' },
      style: { strokeWidth: 2.4, strokeColor: '#9feaff', backgroundColor: '#06151c', strokeOpacity: 0.78, glow: 0.62, roughness: 0.5, taper: 0.55, sharpness: 0.55 },
      variation: { randomness: 0.58, asymmetry: 0.08, angleNoise: 0.18, lengthNoise: 0.24, densityNoise: 0.34 },
    }),
  },
];

export const FAMILY_PRESET_IDS: Record<SnowflakeFamily, string> = {
  simpleSpoke: 'simple-blue-icon',
  classicDendrite: 'classic-six-arm',
  fernDendrite: 'icy-dark-glow',
  hexPlate: 'hex-plate',
  stellarPlate: 'stellar-plate',
  ringedCrystal: 'ringed-crystal',
  ornamentalIcon: 'ornamental-star-center',
  denseFractal: 'dense-fractal-crystal',
  thinSharpCrystal: 'thin-sharp-crystal',
  roundedIcon: 'rounded-friendly-icon',
};

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'cyan-blue', name: 'Cyan Blue', strokeColor: '#009ee3', strokeOpacity: 1 },
  { id: 'ice-white', name: 'Ice White', strokeColor: '#e6fbff', strokeOpacity: 0.98 },
  { id: 'glacier', name: 'Glacier', strokeColor: '#83d8ff', strokeOpacity: 0.98 },
  { id: 'deep-blue', name: 'Deep Blue', strokeColor: '#0369a1', strokeOpacity: 1 },
  { id: 'silver', name: 'Silver', strokeColor: '#d7e4ec', strokeOpacity: 0.94 },
];

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'white', name: 'White', backgroundColor: '#ffffff', glow: 0 },
  { id: 'near-white', name: 'Near White', backgroundColor: '#f7fcff', glow: 0.08 },
  { id: 'polar-night', name: 'Polar Night', backgroundColor: '#03111d', glow: 0.64 },
  { id: 'black-ice', name: 'Black Ice', backgroundColor: '#01070d', glow: 0.78 },
  { id: 'transparent', name: 'Transparent', backgroundColor: 'transparent', glow: 0 },
];

export function cloneSnowflakeParams(params: SnowflakeParams): SnowflakeParams {
  return JSON.parse(JSON.stringify(params)) as SnowflakeParams;
}

export function mergeParams(base: SnowflakeParams, patch: PartialDeep<SnowflakeParams>): SnowflakeParams {
  return {
    ...base,
    ...patch,
    symmetry: { ...base.symmetry, ...patch.symmetry },
    geometry: { ...base.geometry, ...patch.geometry },
    branching: { ...base.branching, ...patch.branching },
    fractal: { ...base.fractal, ...patch.fractal },
    motifs: { ...base.motifs, ...patch.motifs },
    style: { ...base.style, ...patch.style },
    variation: { ...base.variation, ...patch.variation },
  };
}

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};
