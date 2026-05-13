export type SnowflakePositionBias = 'inner' | 'even' | 'outer';
export type SnowflakeFamily =
  | 'simpleSpoke'
  | 'classicDendrite'
  | 'fernDendrite'
  | 'hexPlate'
  | 'stellarPlate'
  | 'ringedCrystal'
  | 'ornamentalIcon'
  | 'denseFractal'
  | 'thinSharpCrystal'
  | 'roundedIcon';
export type SnowflakeStationTemplate = 'sparse' | 'balanced' | 'dense' | 'outerCrown' | 'innerStar';
export type SnowflakeSilhouette = 'round' | 'compact' | 'spiky' | 'fern' | 'stellar' | 'plate';
export type SnowflakeBranchMotif =
  | 'singleLine'
  | 'chevron'
  | 'doubleChevron'
  | 'fork'
  | 'comb'
  | 'miniDendrite'
  | 'shortBar'
  | 'arrow';
export type SnowflakeRingStyle = 'none' | 'innerHexRing' | 'midHexRing' | 'doubleHexRing' | 'circleRing' | 'spokeConnector';
export type SnowflakeCenterMotif =
  | 'none'
  | 'dot'
  | 'circle'
  | 'hexagon'
  | 'star'
  | 'sixPointStar'
  | 'smallSpokes'
  | 'ringedHexagon'
  | 'crystalCluster';
export type SnowflakeTipMotif =
  | 'point'
  | 'fork'
  | 'doubleFork'
  | 'circle'
  | 'split'
  | 'star'
  | 'smallStar'
  | 'flatCap'
  | 'splitV';
export type SnowflakeSideNodes = 'none' | 'dots' | 'circles' | 'diamonds' | 'plates' | 'tinyStars';
export type SnowflakeLineCap = 'butt' | 'round' | 'square';
export type SnowflakeLineJoin = 'miter' | 'round' | 'bevel';

export interface SnowflakeSymmetryParams {
  arms: number;
  mirrorArm: boolean;
  rotationOffset: number;
  alternateMirror: boolean;
}

export interface SnowflakeGeometryParams {
  radius: number;
  centerRadius: number;
  innerGap: number;
  armSegments: number;
  tipStyle: SnowflakeTipMotif;
  silhouette: SnowflakeSilhouette;
}

export interface SnowflakeBranchingParams {
  slots: number;
  probability: number;
  angle: number;
  angleJitter: number;
  lengthRatio: number;
  lengthJitter: number;
  positionJitter: number;
  positionBias: SnowflakePositionBias;
  branchStart: number;
  branchEnd: number;
  guaranteedInnerBranches: boolean;
  stationTemplate: SnowflakeStationTemplate;
  branchMotif: SnowflakeBranchMotif;
}

export interface SnowflakeFractalParams {
  depth: number;
  lengthDecay: number;
  widthDecay: number;
  probabilityDecay: number;
  minLength: number;
  maxSegments: number;
}

export interface SnowflakeMotifParams {
  center: SnowflakeCenterMotif;
  tips: SnowflakeTipMotif;
  rings: number;
  ringStyle: SnowflakeRingStyle;
  plates: boolean;
  hollowCenter: boolean;
  sideNodes: SnowflakeSideNodes;
}

export interface SnowflakeStyleParams {
  strokeWidth: number;
  strokeColor: string;
  strokeOpacity: number;
  backgroundColor: string;
  lineCap: SnowflakeLineCap;
  lineJoin: SnowflakeLineJoin;
  taper: number;
  glow: number;
  roughness: number;
  sharpness: number;
}

export interface SnowflakeVariationParams {
  randomness: number;
  asymmetry: number;
  angleNoise: number;
  lengthNoise: number;
  densityNoise: number;
}

export interface SnowflakeParams {
  seed: number;
  family: SnowflakeFamily;
  symmetry: SnowflakeSymmetryParams;
  geometry: SnowflakeGeometryParams;
  branching: SnowflakeBranchingParams;
  fractal: SnowflakeFractalParams;
  motifs: SnowflakeMotifParams;
  style: SnowflakeStyleParams;
  variation: SnowflakeVariationParams;
}

export interface SnowflakePathLayer {
  id: string;
  d: string;
  strokeWidth: number;
  strokeOpacity: number;
}

export interface SnowflakeShapePath {
  id: string;
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillRule?: 'evenodd' | 'nonzero';
}

export interface GeneratedSnowflake {
  seed: number;
  family: SnowflakeFamily;
  size: number;
  viewBox: string;
  pathLayers: SnowflakePathLayer[];
  shapePaths: SnowflakeShapePath[];
  segmentCount: number;
}
