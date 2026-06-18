import type { VisualizerPulseSnapshot } from './visualizerSignals';
import type { VisualizerQualitySettings } from './visualizerQuality';

export type VisualizerFocus =
  | 'all'
  | 'stringWaves'
  | 'synth'
  | 'earth'
  | 'granular'
  | 'drums'
  | 'fx';

export interface ReactiveVisualizerControls {
  style: number;
  kaleidoscope: number;
  triggerResponse: number;
  ripples: number;
  motion: number;
  color: number;
  diffusion: number;
  background: number;
  frameRate: number;
  shape: number;
  organic: number;
  edges: number;
  backdropFade: number;
  noiseTurbulence: number;
  noiseFlow: number;
  noiseSpeed: number;
  noiseColor: number;
  pulseSync: number;
  shapeSize: number;
  shapeCount: number;
  noiseSize: number;
  noiseDensity: number;
  bloomSize: number;
  kaleidoSize: number;
  glitchIntensity: number;
  glitchScale: number;
  glitchChromatic: number;
  glitchRate: number;
  charAmount: number;
  charStyle: number;
  charGrain: number;
  charDrift: number;
  kaleidoSegments: number;
  kaleidoSpin: number;
  kaleidoType: number;
  kaleidoReflections: number;
  kaleidoPattern: number;
  brightness: number;
  vibrance: number;
  saturation: number;
  impactFlash: number;
  visualLimiter: number;
  pointCloudAmount: number;
  pointCloudSize: number;
  pointCloudDensity: number;
  pointCloudScatter: number;
  pointCloudColor: number;
  layerOrder: number[];  // [shapesPos, atmosPos, glitchPos, kaleidoPos, pointCloudPos] each 0-4
  focus: VisualizerFocus;
}

export interface ReactiveVisualizerSnapshot {
  pad: number;
  lead: number;
  drums: number;
  earth: number;
  granular: number;
  delay: number;
  reverb: number;
  dynamics: number;
  root: number;
  tension: number;
  spread: number;
  detune: number;
  morph: number;
  brightness: number;
  activeGrains: number;
  pulses: VisualizerPulseSnapshot;
}

export interface ReactiveVisualizerFrame {
  timeMs: number;
  width: number;
  height: number;
  dpr: number;
  snapshot: ReactiveVisualizerSnapshot;
  controls: ReactiveVisualizerControls;
  seed: number;
  quality: VisualizerQualitySettings;
}

type UniformName =
  | 'u_resolution'
  | 'u_time'
  | 'u_engineA'
  | 'u_engineB'
  | 'u_harmony'
  | 'u_reactive'
  | 'u_controlA'
  | 'u_controlB'
  | 'u_controlC'
  | 'u_controlD'
  | 'u_controlE'
  | 'u_controlF'
  | 'u_controlG'
  | 'u_controlH'
  | 'u_kaleidoPattern'
  | 'u_post'
  | 'u_layerOrder'
  | 'u_pointCloudA'
  | 'u_pointCloudB'
  | 'u_quality'
  | 'u_environment'
  | 'u_pulseA'
  | 'u_pulseB';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_engineA;
uniform vec4 u_engineB;
uniform vec4 u_harmony;
uniform vec4 u_reactive;
uniform vec4 u_controlA;
uniform vec4 u_controlB;
uniform vec4 u_controlC;
uniform vec4 u_controlD;
uniform vec4 u_controlE;
uniform vec4 u_controlF;
uniform vec4 u_controlG;
uniform vec4 u_controlH;
uniform float u_kaleidoPattern;
uniform vec4 u_post;
uniform vec4 u_layerOrder;
uniform vec4 u_pointCloudA;
uniform vec4 u_pointCloudB;
uniform vec4 u_quality;
uniform vec4 u_environment;
uniform vec4 u_pulseA;
uniform vec4 u_pulseB;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

/* ─── Noise primitives ─── */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // quintic interpolation — eliminates grid-line aliasing
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p, float octaves) {
  float v = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= octaves) break;
    v += a * noise(p * f);
    f *= 2.03;
    a *= 0.52;
  }
  return v;
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

/* ─── Kessho neon/pastel palette ─── */
vec3 kesshoNeonPastel(float t) {
  vec3 cyan = vec3(0.00, 0.92, 1.00);
  vec3 mint = vec3(0.32, 1.00, 0.72);
  vec3 lemon = vec3(1.00, 0.96, 0.30);
  vec3 peach = vec3(1.00, 0.64, 0.48);
  vec3 coral = vec3(1.00, 0.34, 0.46);
  vec3 bubblegum = vec3(1.00, 0.44, 0.86);
  vec3 lavender = vec3(0.76, 0.58, 1.00);
  vec3 periwinkle = vec3(0.48, 0.70, 1.00);
  vec3 electricBlue = vec3(0.10, 0.28, 1.00);
  vec3 lime = vec3(0.60, 1.00, 0.20);

  float s = fract(t) * 10.0;
  if (s < 1.0) return mix(cyan, mint, s);
  if (s < 2.0) return mix(mint, lemon, s - 1.0);
  if (s < 3.0) return mix(lemon, peach, s - 2.0);
  if (s < 4.0) return mix(peach, coral, s - 3.0);
  if (s < 5.0) return mix(coral, bubblegum, s - 4.0);
  if (s < 6.0) return mix(bubblegum, lavender, s - 5.0);
  if (s < 7.0) return mix(lavender, periwinkle, s - 6.0);
  if (s < 8.0) return mix(periwinkle, electricBlue, s - 7.0);
  if (s < 9.0) return mix(electricBlue, lime, s - 8.0);
  return mix(lime, cyan, s - 9.0);
}

vec3 palette(float t, float bias) {
  vec3 base = kesshoNeonPastel(t);
  base = pow(base, vec3(0.72)) * 1.12;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 neon = clamp(lum + (base - lum) * 2.8, 0.0, 1.0) * 1.24;
  vec3 pastel = mix(vec3(1.0), clamp(base, 0.0, 1.0), 0.58) * 1.06;
  pastel = clamp(pastel, 0.0, 1.0);
  vec3 color = mix(base, neon, max(-bias, 0.0));
  return clamp(mix(color, pastel, max(bias, 0.0)), 0.0, 1.35);
}

/* ─── SDF primitives ─── */
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdTriangle(vec2 p, float r) {
  p.y += r * 0.2;
  p.x = abs(p.x);
  float d = max(p.x * 0.866 + p.y * 0.5, -p.y) - r * 0.5;
  return d;
}

float sdPentagon(vec2 p, float r) {
  p.x = abs(p.x);
  float angle = TAU / 5.0;
  vec2 n1 = vec2(cos(angle * 0.5), sin(angle * 0.5));
  vec2 n2 = vec2(cos(angle), sin(angle));
  float d = max(dot(p, n1), dot(p, vec2(n2.x, -n2.y)));
  return d - r * 0.48;
}

/* morphable shape SDF:
   shapeSelector -1..1: -1=triangle, 0=square, +1=circle
   organicAmount 0..1: deforms proportions / angles
   p should be relative to shape center */
float morphShape(vec2 p, float size, float shapeSelector, float organicAmount, float blobAmount, float noiseSeed, float time) {
  // organic deformation: stretch axes unevenly
  float stretchX = 1.0 + organicAmount * (sin(noiseSeed * 3.7 + time * 0.3) * 0.4);
  float stretchY = 1.0 + organicAmount * (cos(noiseSeed * 5.1 + time * 0.25) * 0.35);
  float skew = organicAmount * sin(noiseSeed * 7.3 + time * 0.18) * 0.3;
  vec2 q = vec2(p.x * stretchX + p.y * skew, p.y * stretchY);

  // blob/amoeba: add noise-based radial displacement
  if (blobAmount > 0.01) {
    float angle = atan(q.y, q.x);
    float blobWarp = (
      sin(angle * 3.0 + noiseSeed * 2.1 + time * 0.4) * 0.3 +
      sin(angle * 5.0 + noiseSeed * 4.7 - time * 0.3) * 0.2 +
      sin(angle * 7.0 + noiseSeed * 1.3 + time * 0.2) * 0.12
    );
    float r = length(q);
    q = q * (1.0 + blobWarp * blobAmount * 0.35);
  }

  // SDF for each shape
  float dTri = sdTriangle(q, size);
  float dBox = sdBox(q, vec2(size * 0.7));
  float dPent = sdPentagon(q, size);
  float dCircle = sdCircle(q, size * 0.72);

  // blend: -1 = triangle, -0.33 = square, +0.33 = pentagon, +1 = circle
  float s = shapeSelector * 0.5 + 0.5; // remap to 0..1
  float d;
  if (s < 0.33) {
    d = mix(dTri, dBox, s / 0.33);
  } else if (s < 0.66) {
    d = mix(dBox, dPent, (s - 0.33) / 0.33);
  } else {
    d = mix(dPent, dCircle, (s - 0.66) / 0.34);
  }

  return d;
}

/* shape to intensity:
   edgesControl: -1 = amoeba blobs, 0 = hard cut (new neutral), +1 = gradient wash (splash-style) */
float shapeIntensity(float sdf, float size, float edgesControl) {
  float amoebaBlob = max(-edgesControl, 0.0); // 0..1 (left side)
  float gradWash = max(edgesControl, 0.0);    // 0..1 (right side)

  // hard edge: sharp step (the new neutral at center)
  float hard = smoothstep(size * 0.02, -size * 0.01, sdf);
  // amoeba: wide soft quadratic falloff
  float amoeba = exp(-max(sdf, 0.0) * max(sdf, 0.0) / max(0.001, size * size * 0.8));
  // gradient wash: splash-page style — solid core with short tight fade at edge
  // More core saturation retained, fade only at the very edge
  float edgeDist = max(sdf, 0.0) / max(size, 0.01);  // normalized distance from edge
  float fadeStart = 0.15 + gradWash * 0.1;  // solid core extends further
  float fadeEnd = fadeStart + 0.2 + gradWash * 0.15;  // tight fade band after core
  float gradient = 1.0 - smoothstep(fadeStart, fadeEnd, edgeDist);

  float result = hard;
  result = mix(result, amoeba, amoebaBlob);
  // gradWash replaces hard completely (not blend) — smoothstep ensures no hard edge visible
  if (gradWash > 0.01) {
    result = mix(hard, gradient, min(gradWash * 2.0, 1.0));
  }
  return result;
}

vec2 kaleidoFoldCoord(vec2 point, float spin, float sector) {
  float radius = length(point);
  if (radius < 0.0001) return vec2(0.0);
  float angle = atan(point.y, point.x) + spin;
  float sectorAngle = mod(angle, sector);
  float foldedAngle = min(sectorAngle, sector - sectorAngle);
  return vec2(cos(foldedAngle - spin), sin(foldedAngle - spin)) * radius;
}

vec2 kaleidoChamberCoord(vec2 point, float spin, float sector, float depth) {
  vec2 folded = kaleidoFoldCoord(point, spin, sector);
  float radius = length(folded);
  if (radius < 0.0001) return vec2(0.0);

  float ringCount = mix(2.0, 7.0, depth);
  float ringCoord = radius * ringCount;
  float ringIndex = floor(ringCoord);
  float ringPhase = fract(ringCoord);
  float ringMirror = mix(ringPhase, 1.0 - ringPhase, mod(ringIndex, 2.0));
  float ringRadius = (ringIndex + ringMirror) / ringCount;

  float localSector = sector * mix(1.0, 0.48, depth);
  float ringSpin = spin * mix(0.18, -0.34, depth) + ringIndex * sector * 0.5;
  float angle = atan(folded.y, folded.x) + ringSpin;
  float sectorAngle = mod(angle, localSector);
  float foldedAngle = min(sectorAngle, localSector - sectorAngle);

  return vec2(cos(foldedAngle - ringSpin), sin(foldedAngle - ringSpin)) * ringRadius;
}

vec2 kaleidoMandalaCoord(vec2 point, float spin, float sector, float amount) {
  vec2 folded = kaleidoFoldCoord(point, spin, sector);
  float radius = length(folded);
  if (radius < 0.0001) return vec2(0.0);
  float angle = atan(folded.y, folded.x);
  float ringCount = mix(3.0, 9.0, amount);
  float ringCoord = radius * ringCount;
  float ringIndex = floor(ringCoord);
  float ringPhase = fract(ringCoord);
  float ringMirror = mix(ringPhase, 1.0 - ringPhase, mod(ringIndex, 2.0));
  float ringRadius = (ringIndex + ringMirror) / ringCount;
  float ringTurn = mod(ringIndex, 2.0) * sector * 0.5 * amount;
  return kaleidoFoldCoord(vec2(cos(angle + ringTurn), sin(angle + ringTurn)) * ringRadius, spin * 0.2, sector);
}

vec2 kaleidoCrystalCoord(vec2 point, float spin, float sector, float amount) {
  float crystalSector = sector * mix(1.0, 0.52, amount);
  vec2 folded = kaleidoFoldCoord(point, spin + sector * 0.25 * amount, crystalSector);
  float radius = length(folded);
  if (radius < 0.0001) return vec2(0.0);
  float angle = atan(folded.y, folded.x);
  float facetCount = mix(3.0, 8.0, amount);
  float bandCoord = radius * facetCount;
  float bandIndex = floor(bandCoord);
  float bandPhase = fract(bandCoord);
  float bandMirror = mix(bandPhase, 1.0 - bandPhase, mod(bandIndex, 2.0));
  float facetRadius = (bandIndex + bandMirror) / facetCount;
  float angularFacet = abs(fract(angle / max(crystalSector, 0.001) * facetCount + bandIndex * 0.37) - 0.5);
  facetRadius += (angularFacet - 0.25) * 0.12 * amount;
  return vec2(cos(angle), sin(angle)) * facetRadius;
}

vec2 kaleidoOrganicCoord(vec2 point, float spin, float sector, float amount, float time, float seed) {
  vec2 folded = kaleidoFoldCoord(point, spin, sector * mix(1.0, 1.18, amount));
  float radius = length(folded);
  vec2 noiseP = folded * mix(1.3, 2.8, amount) + vec2(seed * 0.002, -seed * 0.001);
  float n1 = fbm(noiseP + vec2(time * 0.05, time * -0.035), 3.0);
  float n2 = fbm(noiseP.yx + vec2(time * -0.04, time * 0.045) + 4.7, 3.0);
  vec2 warp = (vec2(n1, n2) - 0.5) * amount * (0.18 + radius * 0.12);
  return kaleidoFoldCoord(folded + warp, spin + (n1 - n2) * amount * 0.35, sector * mix(1.0, 1.12, amount));
}

vec2 kaleidoTypeCoord(vec2 point, float spin, float sector, float typeControl, float amount, float time, float seed) {
  float track = clamp((typeControl + 1.0) * 1.5, 0.0, 3.0);
  float classicW = max(1.0 - abs(track - 0.0), 0.0);
  float mandalaW = max(1.0 - abs(track - 1.0), 0.0);
  float crystalW = max(1.0 - abs(track - 2.0), 0.0);
  float organicW = max(1.0 - abs(track - 3.0), 0.0);
  float weightSum = max(classicW + mandalaW + crystalW + organicW, 0.001);

  vec2 classicP = kaleidoFoldCoord(point, spin, sector);
  vec2 mandalaP = kaleidoMandalaCoord(point, spin, sector, amount);
  vec2 crystalP = kaleidoCrystalCoord(point, spin, sector, amount);
  vec2 organicP = kaleidoOrganicCoord(point, spin, sector, amount, time, seed);

  return (classicP * classicW + mandalaP * mandalaW + crystalP * crystalW + organicP * organicW) / weightSum;
}

vec2 pointToUv(vec2 point, vec2 aspect) {
  return point / max(aspect * 2.0, vec2(0.0001)) + 0.5;
}

vec2 kaleidoRepeatingPatternCoord(
  vec2 point,
  float spin,
  float sector,
  float segments,
  float amount,
  float time,
  float seed
) {
  float pattern = clamp(amount, 0.0, 1.0);
  float tileCount = mix(1.4, 4.8 + segments * 0.08, pattern);
  vec2 rotated = rotate2d(spin * 0.28 + seed * 0.00007) * point;

  // Skew into a triangular/hex-like lattice, mirror each cell, then unskew it.
  vec2 lattice = vec2(rotated.x + rotated.y * 0.577350269, rotated.y * 1.154700538);
  vec2 grid = lattice * tileCount + vec2(0.5);
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  vec2 mirrored = abs(local * 2.0 - 1.0);
  float parity = mod(cell.x + cell.y, 2.0);
  if (parity > 0.5) mirrored.x = 1.0 - mirrored.x;

  vec2 centered = mirrored - 0.5;
  vec2 tiled = vec2(centered.x - centered.y * 0.5, centered.y * 0.866025404);
  tiled *= mix(1.75, 2.45, pattern) / max(tileCount, 0.001);

  float cellHash = hash(cell + vec2(seed * 0.001, 23.7));
  float cellSpin = floor(cellHash * max(segments, 3.0)) * sector
    + (parity - 0.5) * sector * mix(0.45, 1.35, pattern);
  vec2 cellPoint = rotate2d(cellSpin + spin * 0.12) * tiled;
  vec2 folded = kaleidoFoldCoord(
    cellPoint,
    spin * 0.2 + cellHash * sector,
    sector * mix(0.95, 0.42, pattern)
  );

  float radius = length(folded);
  if (radius < 0.0001) return folded;
  float angle = atan(folded.y, folded.x);
  float ringCount = mix(2.0, 7.0, pattern);
  float ringCoord = radius * ringCount;
  float ringIndex = floor(ringCoord);
  float ringPhase = fract(ringCoord);
  float ringMirror = mix(ringPhase, 1.0 - ringPhase, mod(ringIndex + parity, 2.0));
  float ringRadius = (ringIndex + ringMirror) / ringCount;
  float ringTurn = (ringIndex + cellHash * 2.0) * sector * 0.5 * pattern + time * 0.015 * pattern;
  return kaleidoFoldCoord(
    vec2(cos(angle + ringTurn), sin(angle + ringTurn)) * ringRadius,
    spin * 0.08,
    sector * mix(0.9, 0.36, pattern)
  );
}

vec2 kaleidoTriangleCopyCoord(
  vec2 point,
  float spin,
  float sector,
  float segments,
  float amount,
  float patternAmount,
  float seed
) {
  float depth = clamp(amount, 0.0, 1.0);
  float pattern = clamp(patternAmount, 0.0, 1.0);
  float copyScale = mix(4.2, 15.0 + segments * 0.36, depth) * mix(1.0, 1.55, pattern);
  vec2 rotated = rotate2d(spin * 0.18 + seed * 0.00005) * point * copyScale;

  // Equilateral-triangle lattice. Each cell is reflected back into one
  // central seed triangle, matching the reflected/translated-copy model of
  // physical kaleidoscope generators.
  vec2 lattice = vec2(rotated.x - rotated.y * 0.577350269, rotated.y * 1.154700538);
  vec2 cell = floor(lattice);
  vec2 local = fract(lattice);

  float upperTriangle = step(1.0, local.x + local.y);
  local = mix(local, 1.0 - local.yx, upperTriangle);

  float xParity = mod(cell.x, 2.0);
  float yParity = mod(cell.y, 2.0);
  local.x = mix(local.x, 1.0 - local.x, xParity);
  local.y = mix(local.y, 1.0 - local.y, yParity);
  if (mod(cell.x + cell.y + upperTriangle, 2.0) > 0.5) {
    local = local.yx;
  }

  vec2 trianglePoint = vec2(local.x + local.y * 0.5, local.y * 0.866025404);
  trianglePoint -= vec2(0.5, 0.288675135);

  float rowTurn = (cell.x - cell.y + upperTriangle) * sector * 0.5;
  float mirrorTurn = (xParity - yParity) * sector * mix(0.35, 1.15, depth);
  vec2 seedTriangle = rotate2d(rowTurn + mirrorTurn + spin * 0.06) * trianglePoint;

  return seedTriangle / mix(0.68, 1.42, depth);
}

vec2 kaleidoFractalMirrorCoord(
  vec2 point,
  float spin,
  float sector,
  float segments,
  float amount,
  float patternAmount,
  float time,
  float seed
) {
  float depth = clamp(amount, 0.0, 1.0);
  float pattern = clamp(patternAmount, 0.0, 1.0);
  float radius = length(point);
  if (radius < 0.0001) return vec2(0.0);

  float localSector = sector * mix(1.0, 0.64, pattern * depth);
  float angle = atan(point.y, point.x) + spin;
  float sectorAngle = mod(angle + localSector * 0.5, localSector);
  float foldedAngle = abs(sectorAngle - localSector * 0.5);

  float radialMirrorAmount = depth * mix(0.28, 0.92, pattern);
  float ringCount = mix(1.0, 3.0 + segments * 0.34, radialMirrorAmount);
  float radialCoord = radius * ringCount;
  float ringIndex = floor(radialCoord);
  float ringPhase = fract(radialCoord);
  float mirroredPhase = mix(ringPhase, 1.0 - ringPhase, mod(ringIndex, 2.0));
  float mirroredRadius = (ringIndex + mirroredPhase) / max(ringCount, 0.001);
  float ringRadius = mix(radius, mirroredRadius, radialMirrorAmount);

  float symmetricRipple = sin(ringIndex * 1.7 + foldedAngle / max(localSector, 0.001) * PI * 2.0 + time * 0.025);
  ringRadius += symmetricRipple * 0.012 * depth * (0.25 + pattern * 0.75);

  return vec2(cos(foldedAngle - spin), sin(foldedAngle - spin)) * ringRadius;
}

vec2 applyKaleidoLayerCoord(
  vec2 point,
  float foldSpin,
  float foldSector,
  float foldSegments,
  float kaleidoTypeControl,
  float foldAmount,
  float kaleidoScale,
  float kaleidoGate,
  float sharpMirrorAmount,
  float softGlassAmount,
  float delayMod,
  float reflectionSlider,
  float patternSlider,
  float time,
  float seed
) {
  if (foldAmount <= 0.001) return point;

  float pointAngle = atan(point.y, point.x);
  float pointRadius = length(point);
  float rotatedAngle = pointAngle + foldSpin;
  float sectorAngle = mod(rotatedAngle, foldSector);
  float foldedAngle = min(sectorAngle, foldSector - sectorAngle);
  float trueKaleidoAmount = clamp(sharpMirrorAmount * mix(0.35, 1.0, foldAmount), 0.0, 1.0);
  float prismAmount = sharpMirrorAmount * 0.9 * (1.0 - trueKaleidoAmount);
  float liquidAmount = softGlassAmount * 0.9;

  float prismWarp = sin(foldedAngle * foldSegments * 2.0) * prismAmount * 0.04
    + sin(foldedAngle * foldSegments * 4.0 + time * 0.1) * prismAmount * 0.02;
  float radialWarp = sin(pointRadius * (8.0 + delayMod * 8.0 + liquidAmount * 14.0) - time * (0.12 + liquidAmount * 0.2))
    * liquidAmount * 0.1;
  float radialWarp2 = sin(pointRadius * 3.5 + foldedAngle * 2.0 - time * 0.07) * liquidAmount * 0.04;
  float flowWarp = sin(foldedAngle * 3.0 + time * 0.12 + pointRadius * 5.0) * liquidAmount * 0.06 * (0.4 + delayMod * 0.6)
    + cos(foldedAngle * 5.0 - time * 0.09 + pointRadius * 3.0) * liquidAmount * 0.03;

  float shardFacet = sharpMirrorAmount * foldAmount * (1.0 - trueKaleidoAmount);
  float angularFacet = abs(fract((foldedAngle / max(foldSector, 0.001)) * mix(2.0, 5.0, sharpMirrorAmount) + pointRadius * 0.35) - 0.5);
  float radialFacet = abs(fract(pointRadius * (2.5 + foldSegments * 0.22)) - 0.5);
  float shardWarp = ((angularFacet - 0.25) * 0.18 + (radialFacet - 0.25) * 0.1) * shardFacet;

  float centerMask = smoothstep(kaleidoScale * 2.0, kaleidoScale * 0.1, pointRadius);
  float fullFoldCoverage = smoothstep(0.55, 0.95, kaleidoGate);
  float patternAmount = smoothstep(0.02, 1.0, max(patternSlider, 0.0));
  float kaleidoMask = mix(centerMask, 1.0, max(fullFoldCoverage, patternAmount * 0.95));
  vec2 typedP = kaleidoTypeCoord(point, foldSpin, foldSector, kaleidoTypeControl, foldAmount * kaleidoMask, time, seed);
  float typedRadius = length(typedP);
  float typedAngle = atan(typedP.y, typedP.x);
  float foldedRadius = typedRadius * (1.0 + radialWarp + radialWarp2 + prismWarp + shardWarp) + flowWarp;
  vec2 foldedP = vec2(cos(typedAngle), sin(typedAngle)) * foldedRadius;

  float reflectionDepth = clamp(reflectionSlider * foldAmount * kaleidoMask, 0.0, 1.0);
  vec2 reflectedP = foldedP;
  if (reflectionDepth > 0.001) {
    float reflectionScale = mix(1.0, 1.24, reflectionDepth);
    vec2 chamberP = kaleidoChamberCoord(
      point * reflectionScale,
      foldSpin + seed * 0.00013,
      foldSector,
      reflectionDepth
    ) / reflectionScale;
    reflectedP = mix(foldedP, chamberP, reflectionDepth);
  }
  if (trueKaleidoAmount > 0.001) {
    vec2 treeP = kaleidoFractalMirrorCoord(
      point,
      foldSpin + seed * 0.00017,
      foldSector,
      foldSegments,
      trueKaleidoAmount,
      patternAmount,
      time,
      seed
    );
    vec2 treeTypedP = kaleidoTypeCoord(
      treeP,
      foldSpin * 0.24 + seed * 0.00019,
      foldSector * mix(0.72, 0.42, trueKaleidoAmount),
      mix(-1.0, kaleidoTypeControl, max(patternAmount, 0.18)),
      clamp(0.65 + trueKaleidoAmount * 0.35 + patternAmount * 0.2, 0.0, 1.0),
      time,
      seed + 67.0
    );
    reflectedP = mix(reflectedP, mix(treeP, treeTypedP, patternAmount * 0.35), trueKaleidoAmount);
  }
  if (patternAmount > 0.001) {
    vec2 repeatP = kaleidoRepeatingPatternCoord(
      point,
      foldSpin + seed * 0.00009,
      foldSector,
      foldSegments,
      patternAmount,
      time,
      seed
    );
    vec2 repeatTypedP = kaleidoTypeCoord(
      repeatP,
      foldSpin * 0.42 + seed * 0.00011,
      foldSector * mix(1.0, 0.62, patternAmount),
      kaleidoTypeControl,
      clamp(foldAmount * kaleidoMask + patternAmount * 0.35, 0.0, 1.0),
      time,
      seed + 31.0
    );
    reflectedP = mix(reflectedP, repeatTypedP, patternAmount);
  }
  return mix(point, reflectedP, foldAmount * kaleidoMask);
}

vec2 applyGlitchLayerCoord(
  vec2 point,
  vec2 aspect,
  float seed,
  float glitchTime,
  float glitchActive,
  float glitchDigital,
  float glitchDisplaceAmount,
  float glitchAnalog,
  float glitchScale,
  float glitchRate,
  float time
) {
  if (glitchActive <= 0.001) return point;

  vec2 coord = point;
  float blockSize = mix(0.08, 0.02, (glitchScale + 1.0) * 0.5);
  float displaceAmount = glitchDigital * glitchDisplaceAmount;

  if (displaceAmount > 0.001) {
    vec2 blockId = floor(coord / blockSize);
    float blockRand = hash(blockId + vec2(glitchTime * 0.1, seed * 0.003));
    float blockOn = step(1.0 - glitchActive * 0.6, blockRand);
    float dx = (hash(blockId + vec2(glitchTime * 0.17, 43.7)) - 0.5) * 2.0;
    float dy = (hash(blockId + vec2(glitchTime * 0.23, 67.3)) - 0.5) * 2.0;
    coord += vec2(dx, dy) * displaceAmount * blockOn;
  }

  float scanActive = glitchAnalog * glitchActive;
  if (scanActive > 0.01) {
    vec2 coordUv = pointToUv(coord, aspect);
    float bandHeight = mix(0.06, 0.012, (glitchScale + 1.0) * 0.5);
    float scanSpeed = mix(0.4, 6.0, (glitchRate + 1.0) * 0.5);
    float rollPhase = time * scanSpeed * 0.3 + seed * 0.01;
    float rollY = fract(rollPhase) * 2.2 - 0.1;
    float bandId = floor((coordUv.y + rollPhase * 0.1) / bandHeight);
    float bandRand = hash(vec2(bandId, glitchTime * 0.13 + seed * 0.007));
    float bandOn = step(1.0 - scanActive * 0.7, bandRand);
    float hOffset = (hash(vec2(bandId + glitchTime * 0.09, 91.3)) - 0.5) * scanActive * 0.3;
    float trackingDist = abs(coordUv.y - rollY);
    float trackingBoost = exp(-trackingDist * 8.0) * scanActive * 0.15;
    hOffset += trackingBoost * sign(hOffset + 0.001);
    float vJitter = (hash(vec2(bandId + glitchTime * 0.21, 53.7)) - 0.5) * scanActive * 0.008;
    coord += vec2(hOffset, vJitter) * bandOn;
  }

  return coord;
}

vec2 applyLayerEffectStack(
  vec2 point,
  int contentPos,
  int glitchPos,
  int kaleidoPos,
  vec2 aspect,
  float foldSpin,
  float foldSector,
  float foldSegments,
  float kaleidoTypeControl,
  float foldAmount,
  float kaleidoScale,
  float kaleidoGate,
  float sharpMirrorAmount,
  float softGlassAmount,
  float delayMod,
  float reflectionSlider,
  float patternSlider,
  float seed,
  float glitchTime,
  float glitchActive,
  float glitchDigital,
  float glitchDisplaceAmount,
  float glitchAnalog,
  float glitchScale,
  float glitchRate,
  float time
) {
  vec2 coord = point;
  bool glitchAbove = contentPos < glitchPos;
  bool kaleidoAbove = contentPos < kaleidoPos;

  if (glitchAbove && kaleidoAbove) {
    if (glitchPos > kaleidoPos) {
      coord = applyGlitchLayerCoord(coord, aspect, seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, time);
      coord = applyKaleidoLayerCoord(coord, foldSpin, foldSector, foldSegments, kaleidoTypeControl, foldAmount, kaleidoScale, kaleidoGate, sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, patternSlider, time, seed);
    } else {
      coord = applyKaleidoLayerCoord(coord, foldSpin, foldSector, foldSegments, kaleidoTypeControl, foldAmount, kaleidoScale, kaleidoGate, sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, patternSlider, time, seed);
      coord = applyGlitchLayerCoord(coord, aspect, seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, time);
    }
  } else if (glitchAbove) {
    coord = applyGlitchLayerCoord(coord, aspect, seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, time);
  } else if (kaleidoAbove) {
    coord = applyKaleidoLayerCoord(coord, foldSpin, foldSector, foldSegments, kaleidoTypeControl, foldAmount, kaleidoScale, kaleidoGate, sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, patternSlider, time, seed);
  }

  return coord;
}

float pointCloudMask(
  vec2 coord,
  float amount,
  float sizeControl,
  float densityControl,
  float scatterControl,
  float seed,
  float time,
  float pulse
) {
  if (amount <= 0.001) return 1.0;

  float densityNorm = clamp((densityControl + 1.0) * 0.5, 0.0, 1.0);
  float sizeNorm = clamp((sizeControl + 1.0) * 0.5, 0.0, 1.0);
  float scatterNorm = clamp((scatterControl + 1.0) * 0.5, 0.0, 1.0);

  float maxGrid = max(18.0, u_quality.y);
  float densityScale = clamp(u_quality.z, 0.25, 1.0);
  float grid = mix(18.0, maxGrid, densityNorm * densityScale);

  vec2 gridCoord = coord * grid;
  vec2 cell = floor(gridCoord);
  vec2 local = fract(gridCoord) - 0.5;

  vec2 jitter = vec2(
    hash(cell + vec2(seed * 0.011, 12.7)),
    hash(cell + vec2(91.3, seed * 0.017))
  ) - 0.5;

  float breathing = 1.0 + pulse * 0.22 + sin(time * 1.7 + hash(cell) * TAU) * 0.04;
  local -= jitter * scatterNorm * 0.62;

  float radius = mix(0.07, 0.34, sizeNorm) * breathing;
  float softness = mix(0.025, 0.085, sizeNorm);
  float dotShape = 1.0 - smoothstep(radius, radius + softness, length(local));

  float keepChance = mix(0.38, 0.96, densityNorm * densityScale);
  float keep = step(hash(cell + vec2(37.0, 73.0) + seed * 0.001), keepChance);
  float twinkle = mix(0.82, 1.16, hash(cell + floor(time * mix(2.0, 4.0, u_quality.x)) + seed));
  float cloud = clamp(dotShape * keep * twinkle, 0.0, 1.0);
  return mix(1.0, cloud, amount);
}

vec3 applyPointCloudToComposite(
  vec3 sourceColor,
  vec2 coord,
  float amountControl,
  float sizeControl,
  float densityControl,
  float scatterControl,
  float colorControl,
  float seed,
  float time,
  float pulse
) {
  float amount = clamp((amountControl + 1.0) * 0.5, 0.0, 1.0);
  if (amount <= 0.001) return sourceColor;

  float mask = pointCloudMask(coord, amount, sizeControl, densityControl, scatterControl, seed, time, pulse);
  vec3 boosted = sourceColor;
  float colorBoost = clamp((colorControl + 1.0) * 0.5, 0.0, 1.0);
  float lum = dot(boosted, vec3(0.299, 0.587, 0.114));
  boosted = mix(boosted, lum + (boosted - lum) * 1.85, colorBoost);
  boosted *= mix(1.0, 1.32, colorBoost);
  return mix(sourceColor, boosted * mask + sourceColor * 0.08 * amount, amount);
}

vec3 kaleidoFractalDetailColor(
  vec2 point,
  vec2 sourcePoint,
  vec3 sourceColor,
  float sourceEdge,
  float amount,
  float patternAmount,
  float foldSpin,
  float foldSector,
  float foldSegments,
  float root,
  float colorControl,
  float seed,
  float time,
  float pulse
) {
  float strength = clamp(amount, 0.0, 1.0);
  if (strength <= 0.001) return vec3(0.0);

  float pattern = clamp(patternAmount, 0.0, 1.0);
  float symmetry = clamp(foldSegments + mix(0.0, 6.0, pattern), 6.0, 28.0);
  float sector = TAU / symmetry;
  float radius = length(point);
  float angle = atan(point.y, point.x) + foldSpin * 0.035 + seed * 0.00001;
  float sectorAngle = mod(angle + sector * 0.5, sector);
  float foldedAngle = abs(sectorAngle - sector * 0.5);
  float wedgeNorm = foldedAngle / max(sector * 0.5, 0.0001);
  vec2 canonical = vec2(cos(foldedAngle), sin(foldedAngle)) * radius;
  float sourceLuma = dot(sourceColor, vec3(0.299, 0.587, 0.114));
  vec2 sourceFlow = sourcePoint * (3.0 + pattern * 5.5) + vec2(time * 0.055, -time * 0.043);
  float sourceMotion = fbm(sourceFlow + vec2(seed * 0.0013, root * 2.0), 3.0);
  float sourceThread = smoothstep(0.4, 0.82, sourceMotion + sourceLuma * 0.36 + sourceEdge * 0.22);

  float visibleDisc = smoothstep(1.72, 0.04, radius);
  float radialRepeats = mix(4.4, 8.8, pattern);
  float radialCoord = radius * radialRepeats + (sourceMotion - 0.5) * strength * mix(0.18, 0.48, pattern);
  float ringId = floor(radialCoord);
  float ringPhase = fract(radialCoord);
  float mirroredRing = abs(ringPhase * 2.0 - 1.0);
  float ringSeed = hash(vec2(ringId, seed * 0.001));

  float centerBloom = exp(-radius * radius * 22.0);
  float axisLine = 1.0 - smoothstep(0.014, 0.09, wedgeNorm);
  float mirrorLine = 1.0 - smoothstep(0.018, 0.1, abs(1.0 - wedgeNorm));
  float ringLine = 1.0 - smoothstep(0.035, 0.12, min(ringPhase, 1.0 - ringPhase));
  float ringCore = 1.0 - smoothstep(0.06, 0.28, abs(ringPhase - 0.5));

  float petalCenter = 0.31 + 0.11 * cos(wedgeNorm * PI);
  float petal = (1.0 - smoothstep(0.028, 0.11, abs(mirroredRing - petalCenter)))
    * smoothstep(0.96, 0.18, wedgeNorm);
  float scallop = 1.0 - smoothstep(0.02, 0.075, abs(mirroredRing - (0.74 + 0.09 * sin(wedgeNorm * PI))));
  float nestedStar = smoothstep(0.72, 1.0, abs(sin((radius * radialRepeats + wedgeNorm * 2.0) * PI)));

  vec2 beadCell = fract(vec2(radialCoord * mix(1.4, 2.3, pattern), wedgeNorm * mix(4.0, 7.0, pattern))) - 0.5;
  float beads = (1.0 - smoothstep(0.1, 0.28, length(beadCell))) * smoothstep(0.98, 0.05, wedgeNorm);

  float lace = fbm(
    canonical * (5.0 + pattern * 6.0) +
    sourcePoint * (1.2 + pattern * 1.9) +
    vec2(ringId * 0.31 + time * 0.018, seed * 0.001),
    3.0
  );
  float laceMask = smoothstep(0.55, 0.82, lace + sourceThread * 0.16) * ringCore;

  float rosette = clamp(
    centerBloom * 1.08 +
    axisLine * 0.7 +
    mirrorLine * 0.48 +
    ringLine * 0.56 +
    petal * 0.98 +
    scallop * 0.58 +
    nestedStar * ringCore * 0.38 +
    beads * 0.34 +
    laceMask * 0.34 +
    sourceThread * ringCore * 0.26 +
    sourceEdge * (ringLine + petal) * 0.28,
    0.0,
    1.0
  ) * visibleDisc;

  vec3 colorA = palette(root + ringSeed * 0.34 + ringId * 0.055, colorControl);
  vec3 colorB = palette(root + 0.44 + wedgeNorm * 0.12 + ringId * 0.035, mix(colorControl, -0.7, 0.38));
  vec3 color = mix(colorA, colorB, smoothstep(0.1, 0.95, ringCore + petal * 0.35));
  vec3 sourceTint = normalize(max(sourceColor, vec3(0.025)) + vec3(0.08));
  color = mix(color, color * sourceTint * 1.8, clamp(0.18 + sourceLuma * 1.1 + sourceEdge * 0.25, 0.0, 0.62));
  float fill = visibleDisc * (centerBloom * 0.18 + ringCore * 0.055 + lace * 0.045);
  float glow = (rosette * 1.36 + fill) * (0.58 + sourceLuma * 0.72 + sourceEdge * 0.28 + pulse * 0.28 + strength * 0.42);
  return color * glow * strength;
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect * 2.0;

  /* ─── Unpack engine levels ─── */
  float pad = clamp(u_engineA.x + u_pulseA.y * 0.35, 0.0, 1.0);
  float lead = clamp(u_engineA.y + u_pulseA.z * 0.5, 0.0, 1.0);
  float drums = clamp(u_engineA.z + u_pulseA.w * 0.7, 0.0, 1.0);
  float earth = clamp(u_engineA.w + u_pulseB.x * 0.45, 0.0, 1.0);
  float granular = clamp(u_engineB.x + u_pulseB.y * 0.48, 0.0, 1.0);
  float delaySig = clamp(u_engineB.y + u_pulseB.z * 0.42, 0.0, 1.0);
  float reverb = clamp(u_engineB.z + u_pulseB.w * 0.36, 0.0, 1.0);
  float dynamics = clamp(u_engineB.w, 0.0, 1.0);

  /* ─── Unpack controls (all bipolar -1..1, center=neutral) ─── */
  float styleControl = clamp(u_controlA.x, -1.0, 1.0);       // -1 noise fields, +1 gradient orbs
  float kaleidoControl = clamp(u_controlA.y, -1.0, 1.0);     // -1 sharp shards, +1 soft glass
  float triggerControl = clamp(u_controlA.z, -1.0, 1.0);     // -1 short sparks, +1 long afterglow
  float rippleControl = clamp(u_controlA.w, -1.0, 1.0);      // -1 crisp rings, +1 soft pond
  float motionControl = clamp(u_controlB.x, -1.0, 1.0);      // -1 fast orbit, +1 slow breathe
  float colorControl = clamp(u_controlB.y, -1.0, 1.0);       // -1 vivid, +1 pastel
  float shapeOpacityCtrl = clamp(u_controlB.z, -1.0, 1.0);  // -1 fully opaque, 0 normal, +1 more transparent
  float backdropFade = clamp(u_controlB.w, -1.0, 1.0);        // -1 invisible, 0 normal, +1 edge-affected
  float seed = max(0.001, u_environment.x) * 104729.0;
  float backgroundControl = clamp(u_environment.y, -1.0, 1.0);
  float shapeCountControl = clamp(u_environment.z, -1.0, 1.0);  // -1 few, +1 many
  float noiseDensityControl = clamp(u_environment.w, -1.0, 1.0); // -1 sparse, +1 dense
  float shapeControl = clamp(u_controlC.x, -1.0, 1.0);       // -1 triangles, 0 squares, +1 circles
  float organicControl = clamp(u_controlC.y, -1.0, 1.0);      // -1 equal sided, +1 irregular
  float edgesControl = clamp(u_controlC.z, -1.0, 1.0);        // -1 amoeba blobs, +1 hard cut
  float pulseSyncControl = clamp(u_controlC.w, -1.0, 1.0);    // -1 free drift, +1 music-synced
  float noiseTurbulence = clamp(u_controlD.x, -1.0, 1.0);     // -1 laminar, +1 chaotic swirl
  float noiseFlowDir = clamp(u_controlD.y, -1.0, 1.0);        // -1 horizontal, +1 vertical
  float noiseSpeedControl = clamp(u_controlD.z, -1.0, 1.0);   // -1 frozen, +1 fast streaming
  float noiseColorControl = clamp(u_controlD.w, -1.0, 1.0);    // -1 random, 0 palette, +1 underlying
  float shapeSizeControl = clamp(u_controlE.x, -1.0, 1.0);    // -1 small, +1 large
  float noiseSizeControl = clamp(u_controlE.y, -1.0, 1.0);    // -1 tight, +1 broad
  float bloomSizeControl = clamp(u_controlE.z, -1.0, 1.0);    // -1 tight, +1 wide
  float kaleidoSizeControl = clamp(u_controlE.w, -1.0, 1.0);  // -1 center only, +1 full screen
  float glitchIntensity = clamp(u_controlF.x, -1.0, 1.0);     // 0 off, -1 subtle, +1 heavy
  float glitchScale = clamp(u_controlF.y, -1.0, 1.0);         // -1 big blocks, +1 tiny grains
  float glitchChromatic = clamp(u_controlF.z, -1.0, 1.0);     // -1 clean displacement, +1 heavy RGB split
  float glitchRate = clamp(u_controlF.w, -1.0, 1.0);          // -1 slow deliberate, +1 fast chaotic
  float charAmount = clamp(u_controlG.x, -1.0, 1.0);          // 0 clean, +1 heavy character
  float charStyle = clamp(u_controlG.y, -1.0, 1.0);           // -1 warm/tape, +1 digital/bitcrush
  float charGrain = clamp(u_controlG.z, -1.0, 1.0);           // -1 smooth, +1 heavy grain
  float charDrift = clamp(u_controlG.w, -1.0, 1.0);           // -1 stable, +1 wobbly
  float kaleidoSegments = clamp(u_controlH.x, -1.0, 1.0);    // -1 few (3), +1 many (16)
  float kaleidoSpin = clamp(u_controlH.y, -1.0, 1.0);        // -1 reverse fast, +1 forward fast
  float kaleidoType = clamp(u_controlH.z, -1.0, 1.0);        // -1 classic, -0.33 mandala, +0.33 crystal, +1 organic
  float kaleidoReflections = clamp(u_controlH.w, -1.0, 1.0); // -1 current, +1 nested mirror chamber
  float kaleidoPattern = clamp(u_kaleidoPattern, -1.0, 1.0);  // <=0 radial/glass, +1 repeating mandala
  float brightnessControl = clamp(u_post.x, -1.0, 1.0);
  float vibranceControl = clamp(u_post.y, -1.0, 1.0);
  float saturationControl = clamp(u_post.z, -1.0, 1.0);
  float limiterControl = clamp(u_post.w, -1.0, 1.0);

  /* ─── Derived ─── */
  // shape opacity: -1 = full solid, 0 = normal, +1 = faded/transparent
  float shapeOpacity = mix(1.0, 0.3, (shapeOpacityCtrl + 1.0) * 0.5);  // 1.0x at -1, 0.65x at 0, 0.3x at +1
  // neutral (0) = shapes only; -1 nebula noise; +1 aurora noise
  float noiseBlend = abs(styleControl);           // noise intensity (either direction)
  float nebulaMix = max(-styleControl, 0.0);      // 0..1 how much nebula
  float auroraMix = max(styleControl, 0.0);       // 0..1 how much aurora
  float orbBlend = 1.0 - noiseBlend * 0.5;       // shapes always visible, dim slightly when noise dominates

  // per-layer size: maps -1..+1 to a scale multiplier
  float shapeScale = mix(0.5, 2.0, (shapeSizeControl + 1.0) * 0.5);   // 0.5x..2x
  float noiseScale = mix(0.5, 2.0, (noiseSizeControl + 1.0) * 0.5);
  float bloomScale = mix(0.5, 2.5, (bloomSizeControl + 1.0) * 0.5);
  float kaleidoScale = mix(0.3, 1.0, (kaleidoSizeControl + 1.0) * 0.5);
  // per-layer density
  float shapeSparse = max(-shapeCountControl, 0.0);
  float shapeDense = max(shapeCountControl, 0.0);
  float noiseSparse = max(-noiseDensityControl, 0.0);
  float noiseDense = max(noiseDensityControl, 0.0);

  /* ─── Harmony & reactive ─── */
  float root = u_harmony.x;
  float tension = u_harmony.y;
  float spread = u_harmony.z;
  float detune = u_harmony.w;
  float globalPulse = u_reactive.x;
  float seqPulse = u_reactive.y;
  float synthStepPhase = u_reactive.z;
  float drumStepPhase = u_reactive.w;

  float hitEnergy = clamp(
    globalPulse * 0.48 + u_pulseA.y * 0.3 + u_pulseA.z * 0.34 + u_pulseA.w * 0.44 +
    u_pulseB.x * 0.28 + u_pulseB.y * 0.24 + seqPulse * 0.2,
    0.0, 1.0
  );
  float triggerLift = hitEnergy * mix(0.95, 1.72, max(triggerControl, 0.0));
  triggerLift += hitEnergy * max(-triggerControl, 0.0) * 0.62;

  /* ─── Time & motion ─── */
  float motionSpeed = 0.014 + max(motionControl, 0.0) * 0.035 + max(-motionControl, 0.0) * 0.1;
  float t = u_time * motionSpeed;
  float screenRadius = length(p);

  /* ═══════════════════════════════════════════════════════════
     KALEIDOSCOPE FOLD — intensity, type, reflections, and tube lens
     Driven by delay engine signal + controls
     ═══════════════════════════════════════════════════════════ */
  float kaleidoGate = abs(kaleidoControl);
  float sharpMirrorAmount = max(-kaleidoControl, 0.0);
  float softGlassAmount = max(kaleidoControl, 0.0);
  float delayMod = clamp(delaySig * 0.5 + u_pulseB.z * 0.4, 0.0, 1.0);
  // Fold reaches 1.0 at full intensity; delay adds motion variation
  float foldAmount = kaleidoGate * kaleidoGate + delayMod * kaleidoGate * (1.0 - kaleidoGate * kaleidoGate) * 0.5;
  foldAmount = clamp(foldAmount, 0.0, 1.0);

  // Segments: slider controls base count, delay signal modulates
  float segBase = floor(mix(3.0, 16.0, (kaleidoSegments + 1.0) * 0.5));
  float segMod = floor(delayMod * 4.0);  // delay adds up to 4 extra segments
  float foldSegments = clamp(segBase + segMod, 3.0, 20.0);

  float foldSector = TAU / foldSegments;

  // Spin: dedicated control + motion influence
  float spinSpeed = kaleidoSpin * 2.5 + max(-motionControl, 0.0) * 1.2;
  float foldSpin = root * TAU * 0.1 + seed * 0.001 + t * spinSpeed;

  float reflectionSlider = smoothstep(0.0, 1.0, (kaleidoReflections + 1.0) * 0.5);

  /* ═══════════════════════════════════════════════════════════
     LAYER ORDER — bottom=0, top=4
     u_layerOrder: (shapesPos, atmosPos, glitchPos, kaleidoPos)
     u_pointCloudA.x: pointCloudPos
     Effect layers process visual content below them in stack order.
     ═══════════════════════════════════════════════════════════ */
  int shapesPos = int(u_layerOrder.x);
  int atmosPos = int(u_layerOrder.y);
  int glitchPos = int(u_layerOrder.z);
  int kaleidoPos = int(u_layerOrder.w);
  int pointCloudPos = int(u_pointCloudA.x);
  float pointCloudAmount = clamp(u_pointCloudA.y, -1.0, 1.0);
  float pointCloudSize = clamp(u_pointCloudA.z, -1.0, 1.0);
  float pointCloudDensity = clamp(u_pointCloudA.w, -1.0, 1.0);
  float pointCloudScatter = clamp(u_pointCloudB.x, -1.0, 1.0);
  float pointCloudColor = clamp(u_pointCloudB.y, -1.0, 1.0);

  /* ═══════════════════════════════════════════════════════════
     GLITCH LAYER — two modes driven by granular engine
     +intensity = BLOCK DISPLACEMENT (digital, rectangular chunks shift)
     -intensity = SCAN LINE SLICE (analog, horizontal bands slide like VHS)
     ═══════════════════════════════════════════════════════════ */
  float glitchGate = abs(glitchIntensity);
  float glitchGranularDrive = clamp(granular * 0.8 + u_pulseB.y * 0.6, 0.0, 1.0);
  float glitchActive = glitchGate * (0.3 + glitchGranularDrive * 0.7);
  float glitchDigital = max(glitchIntensity, 0.0);   // block mode amount
  float glitchAnalog = max(-glitchIntensity, 0.0);   // scanline mode amount

  float glitchTime = floor(u_time * mix(2.0, 24.0, (glitchRate + 1.0) * 0.5));
  float glitchDisplaceAmount = glitchActive * 0.15 * (0.3 + glitchGranularDrive * 0.7);

  vec2 shapesUV = applyLayerEffectStack(
    p, shapesPos, glitchPos, kaleidoPos, aspect,
    foldSpin, foldSector, foldSegments, kaleidoType, foldAmount, kaleidoScale, kaleidoGate,
    sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, kaleidoPattern,
    seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, u_time
  );
  bool sameSourceEffectStack =
    (shapesPos < glitchPos) == (atmosPos < glitchPos) &&
    (shapesPos < kaleidoPos) == (atmosPos < kaleidoPos);
  vec2 atmosUV = shapesUV;
  if (!sameSourceEffectStack) {
    atmosUV = applyLayerEffectStack(
      p, atmosPos, glitchPos, kaleidoPos, aspect,
      foldSpin, foldSector, foldSegments, kaleidoType, foldAmount, kaleidoScale, kaleidoGate,
      sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, kaleidoPattern,
      seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, u_time
    );
  }
  vec2 pointCloudUV = applyLayerEffectStack(
    p, pointCloudPos, glitchPos, kaleidoPos, aspect,
    foldSpin, foldSector, foldSegments, kaleidoType, foldAmount, kaleidoScale, kaleidoGate,
    sharpMirrorAmount, softGlassAmount, delayMod, reflectionSlider, kaleidoPattern,
    seed, glitchTime, glitchActive, glitchDigital, glitchDisplaceAmount, glitchAnalog, glitchScale, glitchRate, u_time
  );

  /* ═══════════════════════════════════════════════════════════
     BACKGROUND — colored, not just grey
     -1 = deep indigo/navy,  0 = near-black,  +1 = warm blush/cream
     ═══════════════════════════════════════════════════════════ */
  // Cool deep background (indigo/navy tones, tinted by harmony)
  vec3 deepCool = mix(
    vec3(0.02, 0.02, 0.07),  // deep indigo
    vec3(0.04, 0.02, 0.06),  // deep purple
    smoothstep(-0.3, 0.7, p.y)
  );
  deepCool += vec3(0.01, 0.005, 0.02) * sin(root * TAU + 1.0); // subtle hue shift with harmony
  // Warm bright background (cream/blush/peach tones)
  vec3 warmBright = mix(
    vec3(0.14, 0.09, 0.08),  // warm dark blush
    vec3(0.22, 0.17, 0.14),  // cream highlight
    smoothstep(-0.2, 0.9, p.y)
  );
  warmBright += vec3(0.03, 0.01, 0.005) * cos(root * TAU * 0.5 + 0.5); // harmony tint
  // Near-black center default
  vec3 neutralBg = mix(vec3(0.035, 0.032, 0.03), vec3(0.025, 0.028, 0.03), smoothstep(-0.3, 0.8, p.y));
  // Blend: left = deep cool, center = neutral dark, right = warm bright
  vec3 bg = neutralBg;
  bg = mix(bg, deepCool, max(-backgroundControl, 0.0));
  bg = mix(bg, warmBright, max(backgroundControl, 0.0));
  vec3 field = bg;

  /* ═══════════════════════════════════════════════════════════
     SHAPES LAYER
     ═══════════════════════════════════════════════════════════ */
  float crispRipple = max(-rippleControl, 0.0);
  float softRipple = max(rippleControl, 0.0);
  float rippleGate = abs(rippleControl);
  float rippleStrength = clamp(rippleGate * (0.5 + earth * 0.3 + u_pulseB.x * 0.28), 0.0, 1.0);

  float orbLayerMix = orbBlend;
  vec3 orbField = vec3(0.0);
  float organicAmount = max(organicControl, 0.0);
  float amoebaBlob = max(-edgesControl, 0.0);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float id = fi + seed * 0.013;

    float orbitSpeed = 0.03 + hash(vec2(id, 11.3)) * 0.06;
    float orbit = u_time * orbitSpeed + hash(vec2(id, 17.4)) * TAU + root * TAU * 0.15;
    // shapeSizeControl: -1 = tight cluster in center, +1 = fill entire screen
    float spreadMul = mix(0.3, 1.2, (shapeSizeControl + 1.0) * 0.5);
    float baseDistance = (0.25 + hash(vec2(id, 22.1)) * 0.75 + shapeDense * 0.15 - shapeSparse * 0.1) * spreadMul;
    vec2 center = vec2(
      cos(orbit * (0.7 + hash(vec2(id, 25.6)) * 0.4)),
      sin(orbit * (0.55 + hash(vec2(id, 28.2)) * 0.35) + tension * TAU)
	    ) * baseDistance;
	    center.x += sin(u_time * 0.02 + fi * 2.1) * 0.08;
	    center.y += cos(u_time * 0.018 + fi * 1.7) * 0.07;

    float shapeAngle = u_time * (0.015 + hash(vec2(id, 29.5)) * 0.03) + hash(vec2(id, 30.1)) * TAU;
    float ca = cos(shapeAngle), sa = sin(shapeAngle);
    vec2 localP = shapesUV - center;
    localP = vec2(localP.x * ca + localP.y * sa, -localP.x * sa + localP.y * ca);

    float pulseMod = mix(0.3, 1.0, max(pulseSyncControl, 0.0));
    float freeDrift = max(-pulseSyncControl, 0.0);
    // Shapes biased toward synth/lead engines
    float engineAffinity = (
      lead * 0.9 +
      pad * 0.4 * hash(vec2(id, 31.0)) +
      drums * 0.3 * hash(vec2(id, 33.0)) +
      earth * 0.2 * hash(vec2(id, 34.0)) +
      granular * 0.15 * hash(vec2(id, 35.0)) +
      delaySig * 0.1 * hash(vec2(id, 36.0)) +
      reverb * 0.1 * hash(vec2(id, 37.0))
    ) * pulseMod;
    engineAffinity += sin(u_time * (0.3 + hash(vec2(id, 38.0)) * 0.5) + id * 2.3) * 0.3 * freeDrift;
    float baseRadius = (0.18 + hash(vec2(id, 40.5)) * 0.28 + shapeDense * 0.08) * shapeScale;
    float size = baseRadius + engineAffinity * 0.075 + triggerLift * 0.06 * pulseMod;

    float perShapeOffset = (hash(vec2(id, 42.3)) - 0.5) * 0.3;
    float shapeSel = clamp(shapeControl + perShapeOffset, -1.0, 1.0);

    vec2 rippleP = localP;
    if (rippleStrength > 0.001) {
      float ripD = length(localP);
      float ripFreq = mix(8.0, 20.0, crispRipple);
      float ripSpeed = u_time * (1.2 + earth * 2.0);
      float ripPhase = ripD * ripFreq - ripSpeed + fi * 1.7;
      float ripWave = sin(ripPhase) * exp(-ripD * mix(2.0, 0.8, softRipple));
      float ripAmount = rippleStrength * mix(0.04, 0.09, crispRipple + softRipple * 0.5);
      vec2 ripDir = ripD > 0.001 ? localP / ripD : vec2(0.0, 1.0);
      rippleP += ripDir * ripWave * ripAmount;
    }

    float sdf = morphShape(rippleP, size, shapeSel, organicAmount, amoebaBlob, id, u_time);
    float intensity = shapeIntensity(sdf, size, edgesControl);

    float fade = 0.5 + 0.5 * sin(u_time * (0.02 + orbitSpeed * 0.4) + seed * 0.002 + fi * 1.9);
    fade = smoothstep(0.15 + shapeSparse * 0.2, 0.85, fade);
    float densityGate = smoothstep(fi - 0.5, fi + 1.2, 4.0 + shapeDense * 8.0 - shapeSparse * 3.0);
    float energy = fade * densityGate * (0.30 + engineAffinity * 0.62 + triggerLift * 0.52) * shapeOpacity;
    energy = clamp(energy, 0.0, 1.0);

    vec3 shapeColor = palette(
      root + hash(vec2(id, 44.0)) + sin(u_time * (0.015 + orbitSpeed) + id) * 0.08,
      colorControl
    );
    // Alpha-over compositing: at high opacity shapes occlude rather than additive blow-out
    float rawAlpha = intensity * energy;
    // At full solid (-1), sharpen alpha so shapes are binary opaque/transparent
    float solidify = clamp(-shapeOpacityCtrl, 0.0, 1.0);
    // At full solid, desaturate and dim for matte opaque look; neutral keeps full vivid color
    float luma = dot(shapeColor, vec3(0.299, 0.587, 0.114));
    vec3 muted = mix(vec3(luma), shapeColor, 0.7) * 0.4;
    shapeColor = mix(shapeColor, muted, solidify);
    float alpha = clamp(mix(rawAlpha, step(0.02, rawAlpha), solidify), 0.0, 1.0);
    orbField = mix(orbField, shapeColor, alpha);
  }

  // Glitch RGB split on shapes if glitch is above shapes
  if (shapesPos < glitchPos && glitchActive > 0.01) {
    float chromatic = max(glitchChromatic, 0.0) * glitchActive * 0.04;
    // Shift red and blue channels in opposite directions
    orbField.r *= 1.0 + chromatic * sin(glitchTime * 3.7 + shapesUV.x * 40.0);
    orbField.b *= 1.0 + chromatic * cos(glitchTime * 2.3 + shapesUV.y * 35.0);
  }
  vec3 shapeLayerColor = orbField * orbLayerMix;
  vec3 underlyingColor = bg + ((shapesPos < atmosPos) ? shapeLayerColor : vec3(0.0));

  /* ═══════════════════════════════════════════════════════════
     ATMOSPHERE LAYER (was Noise)
     styleControl < 0 → Space nebula   styleControl > 0 → Northern lights
     ═══════════════════════════════════════════════════════════ */
  float atmosLayerMix = noiseBlend;
  vec3 atmosField = vec3(0.0);

  if (atmosLayerMix > 0.001) {
    // Atmosphere biased toward pad/reverb engines
    float engineGlow = pad * 0.48 + reverb * 0.38 + delaySig * 0.22 + earth * 0.16 + lead * 0.1 + granular * 0.06 + drums * 0.04;

    float noiseSpeed = mix(0.002, 0.12, (noiseSpeedControl + 1.0) * 0.5);
    float turbulenceAmt = max(noiseTurbulence, 0.0);
    float laminarAmt = max(-noiseTurbulence, 0.0);
    float flowH = max(-noiseFlowDir, 0.0);
    float flowV = max(noiseFlowDir, 0.0);
    float pulseReact = max(pulseSyncControl, 0.0);
    float pulseFree = max(-pulseSyncControl, 0.0);

    float musicPulse = engineGlow * pulseReact * 2.0;
    float nt = u_time * noiseSpeed + musicPulse * 0.3;

    vec2 flowDir = normalize(vec2(1.0 - flowV, 1.0 - flowH) + 0.01);
    float warpStrength = mix(0.14, 0.55, turbulenceAmt) + reverb * 0.08;
    warpStrength = mix(warpStrength, warpStrength * 0.4, laminarAmt);
    vec2 warpedP = atmosUV * (1.3 + noiseDense * 0.5) / noiseScale;

    float warpOctaves = 3.0 + turbulenceAmt * 2.0;
    float n1 = fbm(warpedP + flowDir * nt * 1.4, warpOctaves);
    float n2 = fbm(warpedP + flowDir.yx * nt * -1.1 + 4.2, warpOctaves);

    float swirlAngle = (n1 - 0.5) * turbulenceAmt * 2.5;
    float sc = sin(swirlAngle), cc = cos(swirlAngle);
    vec2 swirlOffset = vec2(n1 * cc - n2 * sc, n1 * sc + n2 * cc) * warpStrength;
    vec2 wP = warpedP + swirlOffset;

    // NEBULA
    vec3 nebulaField = vec3(0.0);
    if (nebulaMix > 0.01) {
      vec2 nebP = wP * (2.8 + noiseDense * 1.2);
      float neb1 = fbm(nebP + flowDir * nt * 0.5 + vec2(seed * 0.003, 0.0), 4.0);
      float neb2 = fbm(nebP * 0.6 + vec2(neb1 * 0.8, nt * -0.3) + 7.3, 3.0);

      float gasDensity = neb1 * neb2;
      float gasThreshold = mix(0.12, 0.06, turbulenceAmt);
      float gasCloud = smoothstep(gasThreshold, 0.35, gasDensity);

      vec3 nebColor1 = palette(root + neb1 * 0.5 + nt * 0.8, -1.0);
      vec3 nebColor2 = palette(root + 0.45 + neb2 * 0.4 + tension * 0.2, -1.0);
      float reactiveGlow = mix(0.18, 0.18 + engineGlow * 0.8, pulseReact) + triggerLift * 0.3;
      vec3 darkGas = nebColor1 * gasCloud * reactiveGlow;
      darkGas += nebColor2 * smoothstep(0.2, 0.55, neb2) * (0.1 + reverb * 0.14);

      float starMix = smoothstep(0.5, 1.0, nebulaMix);
      if (starMix > 0.01) {
        vec2 starGrid = atmosUV * 45.0;
        vec2 starCell = floor(starGrid);
        vec2 starF = fract(starGrid) - 0.5;
        float starId = hash(starCell + seed * 0.007);
        float starPresent = step(0.82, starId);
        vec2 starOffset = vec2(
          hash(starCell + vec2(1.1, 2.3)) - 0.5,
          hash(starCell + vec2(3.7, 5.1)) - 0.5
        ) * 0.6;
        vec2 starPos = starF - starOffset;
        float starDist = length(starPos);
        float starSize = 0.06 + hash(starCell + vec2(7.3, 11.2)) * 0.1;
        float starShape = 1.0 - smoothstep(0.0, starSize, starDist);
        float blinkPhase = hash(starCell + vec2(13.7, 17.9)) * TAU;
        float blinkSpeed = 0.3 + hash(starCell + vec2(19.1, 23.3)) * 0.7;
        float blink = sin(u_time * blinkSpeed + blinkPhase) * 0.5 + 0.5;
        blink = smoothstep(0.2, 0.8, blink);
        float starBrightness = starShape * starPresent * blink * 0.9;
        vec3 starColor = mix(vec3(0.9, 0.92, 1.0), vec3(1.0, 0.85, 0.7), hash(starCell + vec2(29.0, 31.0)));
        darkGas += starColor * starBrightness * starMix;
      }
      nebulaField = darkGas;
    }

    // AURORA
    vec3 auroraField = vec3(0.0);
    if (auroraMix > 0.01) {
      vec2 aurStretch = mix(vec2(1.8, 0.5), vec2(0.5, 1.8), flowV);
      vec2 aurP = atmosUV * aurStretch + flowDir * nt * 0.6;
      float ribbonOctaves = 3.0 + turbulenceAmt * 1.5;
      float ribbon1 = fbm(vec2(aurP.x * 3.0 + nt * 1.5, aurP.y * 0.8), ribbonOctaves);
      float ribbon2 = fbm(vec2(aurP.x * 2.2 + ribbon1 * (0.6 + turbulenceAmt * 0.8), aurP.y * 1.2 + nt * 1.0) + 5.5, ribbonOctaves);
      float curtainAxis = mix(atmosUV.y, atmosUV.x, flowH * 0.7);
      float curtainFade = smoothstep(-0.8, 0.6, curtainAxis) * smoothstep(1.2, 0.3, curtainAxis);
      float curtain = smoothstep(0.3, 0.7, ribbon2) * curtainFade;
      float waveSpeed = mix(0.2, 1.4, (noiseSpeedControl + 1.0) * 0.5);
      float wave = sin(aurP.x * 6.0 + ribbon1 * 4.0 + u_time * waveSpeed) * 0.5 + 0.5;
      curtain *= 0.6 + wave * 0.4;
      vec3 aurGreen = vec3(0.2, 0.9, 0.4);
      vec3 aurTeal = vec3(0.15, 0.75, 0.7);
      vec3 aurViolet = vec3(0.6, 0.2, 0.85);
      vec3 aurColor = mix(aurGreen, aurTeal, smoothstep(0.3, 0.7, ribbon1));
      aurColor = mix(aurColor, aurViolet, smoothstep(0.6, 0.9, ribbon2) * 0.4);
      float aurReactive = mix(0.18, 0.18 + engineGlow * 0.8, pulseReact) + triggerLift * 0.35;
      float aurGlow = smoothstep(0.15, 0.5, ribbon2) * curtainFade * 0.07;
      auroraField = aurColor * curtain * aurReactive + aurColor * aurGlow;
    }

    atmosField = nebulaField * nebulaMix + auroraField * auroraMix;

    // Color control
    vec3 tint = max(underlyingColor, vec3(0.05));
    float underlyBlend = max(noiseColorControl, 0.0);
    float randomBlend = max(-noiseColorControl, 0.0);
    vec3 randomColor = palette(hash(atmosUV * 3.7 + seed) + u_time * 0.03, -0.8);
    vec3 tinted = atmosField * normalize(tint + 0.1) * 1.8;
    vec3 randomized = atmosField * normalize(randomColor + 0.1) * 1.6;
    atmosField = mix(atmosField, tinted, underlyBlend);
    atmosField = mix(atmosField, randomized, randomBlend);
  }

  // Glitch RGB split on atmosphere if glitch is above atmosphere
  if (atmosPos < glitchPos && glitchActive > 0.01) {
    float chromatic = max(glitchChromatic, 0.0) * glitchActive * 0.04;
    atmosField.r *= 1.0 + chromatic * sin(glitchTime * 2.9 + atmosUV.x * 30.0);
    atmosField.b *= 1.0 + chromatic * cos(glitchTime * 1.7 + atmosUV.y * 25.0);
  }
  vec3 atmosLayerColor = atmosField * atmosLayerMix;
  if (shapesPos < pointCloudPos) {
    shapeLayerColor = applyPointCloudToComposite(
      shapeLayerColor,
      pointCloudUV,
      pointCloudAmount,
      pointCloudSize,
      pointCloudDensity,
      pointCloudScatter,
      pointCloudColor,
      seed,
      u_time,
      triggerLift
    );
  }
  if (atmosPos < pointCloudPos) {
    atmosLayerColor = applyPointCloudToComposite(
      atmosLayerColor,
      pointCloudUV,
      pointCloudAmount,
      pointCloudSize,
      pointCloudDensity,
      pointCloudScatter,
      pointCloudColor,
      seed + 17.0,
      u_time,
      triggerLift
    );
  }
  if (shapesPos < atmosPos) {
    field += shapeLayerColor;
    field += atmosLayerColor;
  } else {
    field += atmosLayerColor;
    field += shapeLayerColor;
  }

  float fractalKaleidoAmount = clamp(sharpMirrorAmount * mix(0.35, 1.0, foldAmount), 0.0, 1.0);
  bool kaleidoHasSourceBelow = shapesPos < kaleidoPos || atmosPos < kaleidoPos || pointCloudPos < kaleidoPos;
  if (fractalKaleidoAmount > 0.001 && kaleidoHasSourceBelow) {
    float patternAmount = smoothstep(0.02, 1.0, max(kaleidoPattern, 0.0));
    float sourceLuma = dot(field, vec3(0.299, 0.587, 0.114));
    float sourceLift = smoothstep(0.015, 0.52, sourceLuma);
    float sourceEdge = clamp(length(vec2(dFdx(sourceLuma), dFdy(sourceLuma))) * 12.0, 0.0, 1.0);
    vec2 detailSourcePoint = mix(shapesUV, atmosUV, 0.58);
    vec3 fractalDetail = kaleidoFractalDetailColor(
      p,
      detailSourcePoint,
      field,
      sourceEdge,
      fractalKaleidoAmount,
      patternAmount,
      foldSpin,
      foldSector,
      foldSegments,
      root,
      colorControl,
      seed,
      u_time,
      triggerLift
    );
    float generatedGuideAmount = 1.0 - smoothstep(0.72, 0.98, fractalKaleidoAmount);
    generatedGuideAmount *= mix(0.28, 0.42, patternAmount);
    float detailBlend = fractalKaleidoAmount * generatedGuideAmount * (0.72 + sourceLift * 0.62 + sourceEdge * 0.34);
    vec3 reactiveDetail = fractalDetail * (1.24 + sourceLift * 1.28 + sourceEdge * 0.82);
    field = mix(field, max(field, reactiveDetail), clamp(detailBlend * 0.38, 0.0, 0.32));
    field += reactiveDetail * detailBlend * (0.22 + sourceLift * 0.42 + sourceEdge * 0.28);
  }

  /* ═══════════════════════════════════════════════════════════
     BLOOM (always on top — subtle atmospheric halo)
     backdropFade: -1 = invisible, 0 = normal, +1 = affected by edge setting
     ═══════════════════════════════════════════════════════════ */
  float bloomD = length(p) / bloomScale;
  // At +1 backdropFade: widen/soften bloom based on edgesControl
  float bloomFalloff = 2.6 - reverb * 0.8;
  if (backdropFade > 0.0) {
    // gradient wash (edgesControl > 0) makes bloom wider; amoeba makes it blobby
    float washWiden = max(edgesControl, 0.0) * backdropFade * 1.8;
    bloomFalloff = max(0.3, bloomFalloff - washWiden);
  }
  float bloom = exp(-bloomD * bloomD * bloomFalloff);
  bloom *= (0.10 + drums * 0.34 + reverb * 0.16 + triggerLift * 0.44);
  // backdropFade: -1 = hide completely, 0 = normal, +1 = full (edge-affected)
  float bloomVisibility = clamp(1.0 + backdropFade, 0.0, 1.0);  // -1→0, 0→1, +1→1
  bloom *= bloomVisibility;
  field += palette(root + 0.55 + drumStepPhase * 0.14, colorControl) * bloom;

  /* ─── Hit flash ─── */
  vec2 hitDrift = vec2(
    sin(root * TAU + t * 1.8 + seed * 0.008),
    cos(t * 1.2 + tension * 2.8 + seed * 0.005)
  ) * 0.15;
  float hitGlow = exp(-length(p - hitDrift) * (2.4 + max(-triggerControl, 0.0) * 4.0));
  hitGlow *= triggerLift * mix(0.25, 0.55, max(triggerControl, 0.0));
  hitGlow *= bloomVisibility;  // also hide hit flash when backdrop is hidden
  field += palette(root + 0.72 + hitEnergy * 0.16, colorControl) * hitGlow;

  /* ═══════════════════════════════════════════════════════════
     POST-PROCESSING: character + vignette + contrast + grain
     ═══════════════════════════════════════════════════════════ */
  float vignette = smoothstep(2.2, 0.4, screenRadius);  // much wider — fills the screen
  vec3 finalColor = field * vignette;

  /* ─── Character post-process (driven by earth engine) ─── */
  float charGate = abs(charAmount);
  float charEarthDrive = clamp(earth * 0.5 + u_pulseB.x * 0.3, 0.0, 1.0);
  float charActive = charGate * (0.4 + charEarthDrive * 0.6);

  if (charActive > 0.01) {
    float warmth = max(-charStyle, 0.0);   // tape/warm direction
    float digital = max(charStyle, 0.0);    // bitcrush/digital direction

    // Tape warmth: amber shift + soft bloom bleed + saturation
    if (warmth > 0.01) {
      float tapeAmt = warmth * charActive;
      // Warm color shift (toward amber)
      vec3 warmTint = vec3(1.04, 0.97, 0.88);
      finalColor *= mix(vec3(1.0), warmTint, tapeAmt * 0.6);
      // Soft saturation boost (tube-like)
      float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = mix(finalColor, vec3(lum) + (finalColor - vec3(lum)) * 1.3, tapeAmt * 0.4);
      // Gentle highlight bloom (soft clip like tape compression)
      finalColor = mix(finalColor, 1.0 - exp(-finalColor * 2.0), tapeAmt * 0.3);
    }

    // Digital: pixel quantization + reduced color depth + harsh edges
    if (digital > 0.01) {
      float digiAmt = digital * charActive;
      // Pixel quantization (reduce spatial resolution)
      float pixelSize = mix(1.0, 6.0, digiAmt);
      vec2 pixelUV = floor(uv * u_resolution / pixelSize) * pixelSize / u_resolution;
      float pixelMix = smoothstep(0.0, 0.5, digiAmt);
      // sample from quantized position (approximate by snapping color)
      float snapLevels = mix(256.0, 8.0, digiAmt * 0.7);
      vec3 quantized = floor(finalColor * snapLevels + 0.5) / snapLevels;
      finalColor = mix(finalColor, quantized, pixelMix * 0.7);
      // Harsh contrast (digital clipping)
      finalColor = mix(finalColor, smoothstep(vec3(0.0), vec3(0.8), finalColor), digiAmt * 0.3);
    }

    // Wow/flutter drift (analog wobble)
    float driftAmt = max(charDrift, 0.0) * charActive;
    if (driftAmt > 0.01) {
      float wobble = sin(u_time * 1.7 + uv.y * 12.0) * sin(u_time * 0.7 + 2.3) * driftAmt * 0.008;
      float vertWob = sin(u_time * 0.9 + uv.x * 8.0) * cos(u_time * 1.3) * driftAmt * 0.004;
      // chromatic aberration from drift
      finalColor.r *= 1.0 + wobble * 3.0;
      finalColor.b *= 1.0 - wobble * 2.5;
      finalColor.g *= 1.0 + vertWob * 2.0;
    }
  }

  // Film grain (enhanced by character grain control)
  float grainAmt = max(charGrain, 0.0) * abs(charAmount);
  float baseGrain = 0.013 + grainAmt * 0.04;
  float grain = (hash(uv * u_resolution + vec2(u_time * 61.0, u_time * 37.0)) - 0.5) * baseGrain * 2.0;
  finalColor += grain;

  // User-facing post color controls. These are single-pass math only.
  finalColor *= 1.0 + brightnessControl * 0.36;
  float postLuma = dot(finalColor, vec3(0.299, 0.587, 0.114));
  float saturationMul = max(0.0, 1.0 + saturationControl * 0.62);
  finalColor = mix(vec3(postLuma), finalColor, saturationMul);
  float chroma = clamp(max(max(finalColor.r, finalColor.g), finalColor.b) - min(min(finalColor.r, finalColor.g), finalColor.b), 0.0, 1.0);
  float vibranceLift = vibranceControl >= 0.0
    ? vibranceControl * (1.0 - chroma) * 0.82
    : vibranceControl * 0.52;
  finalColor = mix(vec3(postLuma), finalColor, max(0.0, 1.0 + vibranceLift));

  float limiterCeiling = mix(2.8, 1.15, (limiterControl + 1.0) * 0.5);
  finalColor = finalColor / (1.0 + finalColor / max(limiterCeiling, 0.001));

  outColor = vec4(max(finalColor, vec3(0.0)), 1.0);
}
`;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to allocate visualizer shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to allocate visualizer program');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown visualizer link error';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

export class ReactiveVisualizerRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private uniforms = new Map<UniformName, WebGLUniformLocation>();
  private fallbackPhase = 0;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.gl = gl;
    if (gl) {
      try {
        this.initGl(gl);
      } catch (error) {
        console.warn('Reactive visualizer WebGL2 init failed; using 2D fallback.', error);
        this.destroyGl();
      }
    }
  }

  get mode(): 'webgl2' | 'canvas2d' {
    return this.gl && this.program ? 'webgl2' : 'canvas2d';
  }

  resize(width: number, height: number, dpr: number): void {
    const safeWidth = Math.max(1, Math.floor(width * dpr));
    const safeHeight = Math.max(1, Math.floor(height * dpr));
    const canvasSizeChanged = this.canvas.width !== safeWidth || this.canvas.height !== safeHeight;
    if (canvasSizeChanged) {
      this.canvas.width = safeWidth;
      this.canvas.height = safeHeight;
    }
    const cssWidth = Math.max(1, Math.floor(width));
    const cssHeight = Math.max(1, Math.floor(height));
    if (this.cssWidth !== cssWidth) {
      this.canvas.style.width = `${cssWidth}px`;
      this.cssWidth = cssWidth;
    }
    if (this.cssHeight !== cssHeight) {
      this.canvas.style.height = `${cssHeight}px`;
      this.cssHeight = cssHeight;
    }
    if (this.gl && canvasSizeChanged) {
      this.gl.viewport(0, 0, safeWidth, safeHeight);
    }
  }

  render(frame: ReactiveVisualizerFrame): void {
    if (this.gl && this.program) {
      this.renderGl(this.gl, frame);
      return;
    }
    this.renderFallback(frame);
  }

  destroy(): void {
    this.destroyGl();
  }

  private initGl(gl: WebGL2RenderingContext): void {
    this.program = createProgram(gl);
    this.vertexBuffer = gl.createBuffer();
    this.vertexArray = gl.createVertexArray();
    if (!this.vertexBuffer || !this.vertexArray) {
      throw new Error('Failed to allocate visualizer geometry');
    }

    gl.bindVertexArray(this.vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const uniformNames: UniformName[] = [
      'u_resolution',
      'u_time',
      'u_engineA',
      'u_engineB',
      'u_harmony',
      'u_reactive',
      'u_controlA',
      'u_controlB',
      'u_controlC',
      'u_controlD',
      'u_controlE',
      'u_controlF',
      'u_controlG',
      'u_controlH',
      'u_kaleidoPattern',
      'u_post',
      'u_layerOrder',
      'u_pointCloudA',
      'u_pointCloudB',
      'u_quality',
      'u_environment',
      'u_pulseA',
      'u_pulseB',
    ];
    for (const name of uniformNames) {
      const location = gl.getUniformLocation(this.program, name);
      if (location) this.uniforms.set(name, location);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  private destroyGl(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.vertexArray) gl.deleteVertexArray(this.vertexArray);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.vertexArray = null;
    this.vertexBuffer = null;
    this.program = null;
    this.uniforms.clear();
  }

  private uniform(name: UniformName): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }

  private renderGl(gl: WebGL2RenderingContext, frame: ReactiveVisualizerFrame): void {
    const snapshot = frame.snapshot;
    const controls = frame.controls;
    const quality = frame.quality;
    const pulses = snapshot.pulses;
    const width = Math.max(1, Math.floor(frame.width * frame.dpr));
    const height = Math.max(1, Math.floor(frame.height * frame.dpr));
    const triggerGain = 1.3
      + Math.max(0, controls.triggerResponse) * 0.72
      + Math.max(0, -controls.triggerResponse) * 0.36
      + Math.max(0, controls.impactFlash) * 0.66;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vertexArray);
    gl.viewport(0, 0, width, height);

    gl.uniform2f(this.uniform('u_resolution'), width, height);
    gl.uniform1f(this.uniform('u_time'), frame.timeMs / 1000);
    gl.uniform4f(
      this.uniform('u_engineA'),
      clamp(snapshot.pad, 0, 1),
      clamp(snapshot.lead, 0, 1),
      clamp(snapshot.drums, 0, 1),
      clamp(snapshot.earth, 0, 1),
    );
    gl.uniform4f(
      this.uniform('u_engineB'),
      clamp(snapshot.granular, 0, 1),
      clamp(snapshot.delay, 0, 1),
      clamp(snapshot.reverb, 0, 1),
      clamp(snapshot.dynamics, 0, 1),
    );
    gl.uniform4f(
      this.uniform('u_harmony'),
      clamp(snapshot.root, 0, 1),
      clamp(snapshot.tension, 0, 1),
      clamp(snapshot.spread, 0, 1),
      clamp(snapshot.detune, 0, 1),
    );
    gl.uniform4f(
      this.uniform('u_reactive'),
      clamp(pulses.global * triggerGain, 0, 1),
      clamp(pulses.sequencer * triggerGain, 0, 1),
      clamp(pulses.synthStepPhase, 0, 1),
      clamp(pulses.drumStepPhase, 0, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlA'),
      clamp(controls.style, -1, 1),
      clamp(controls.kaleidoscope + Math.max(0, controls.kaleidoscope) * snapshot.activeGrains * 0.0015, -1, 1),
      clamp(controls.triggerResponse, -1, 1),
      clamp(controls.ripples, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlB'),
      clamp(controls.motion, -1, 1),
      clamp(controls.color + snapshot.brightness * 0.08, -1, 1),
      clamp(controls.diffusion, -1, 1),
      clamp(controls.backdropFade, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlC'),
      clamp(controls.shape, -1, 1),
      clamp(controls.organic, -1, 1),
      clamp(controls.edges, -1, 1),
      clamp(controls.pulseSync, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlD'),
      clamp(controls.noiseTurbulence, -1, 1),
      clamp(controls.noiseFlow, -1, 1),
      clamp(controls.noiseSpeed, -1, 1),
      clamp(controls.noiseColor, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlE'),
      clamp(controls.shapeSize, -1, 1),
      clamp(controls.noiseSize, -1, 1),
      clamp(controls.bloomSize, -1, 1),
      clamp(controls.kaleidoSize, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlF'),
      clamp(controls.glitchIntensity, -1, 1),
      clamp(controls.glitchScale, -1, 1),
      clamp(controls.glitchChromatic, -1, 1),
      clamp(controls.glitchRate, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlG'),
      clamp(controls.charAmount, -1, 1),
      clamp(controls.charStyle, -1, 1),
      clamp(controls.charGrain, -1, 1),
      clamp(controls.charDrift, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlH'),
      clamp(controls.kaleidoSegments ?? 0, -1, 1),
      clamp(controls.kaleidoSpin ?? 0, -1, 1),
      clamp(controls.kaleidoType ?? -1, -1, 1),
      clamp(controls.kaleidoReflections ?? -1, -1, 1),
    );
    gl.uniform1f(
      this.uniform('u_kaleidoPattern'),
      clamp(controls.kaleidoPattern ?? 0, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_post'),
      clamp(controls.brightness ?? 0, -1, 1),
      clamp(controls.vibrance ?? 0, -1, 1),
      clamp(controls.saturation ?? 0, -1, 1),
      clamp(controls.visualLimiter ?? 0, -1, 1),
    );
    const rawOrder = controls.layerOrder?.length >= 5
      ? controls.layerOrder
      : [
          controls.layerOrder?.[0] ?? 0,
          controls.layerOrder?.[1] ?? 1,
          controls.layerOrder?.[2] ?? 2,
          controls.layerOrder?.[3] ?? 3,
          4,
        ];
    gl.uniform4f(
      this.uniform('u_layerOrder'),
      clamp(Math.round(rawOrder[0] ?? 0), 0, 4),
      clamp(Math.round(rawOrder[1] ?? 1), 0, 4),
      clamp(Math.round(rawOrder[2] ?? 2), 0, 4),
      clamp(Math.round(rawOrder[3] ?? 3), 0, 4),
    );
    gl.uniform4f(
      this.uniform('u_pointCloudA'),
      clamp(Math.round(rawOrder[4] ?? 4), 0, 4),
      clamp(controls.pointCloudAmount ?? -1, -1, 1),
      clamp(controls.pointCloudSize ?? 0, -1, 1),
      clamp(controls.pointCloudDensity ?? 0, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_pointCloudB'),
      clamp(controls.pointCloudScatter ?? 0, -1, 1),
      clamp(controls.pointCloudColor ?? 0, -1, 1),
      0,
      0,
    );
    gl.uniform4f(
      this.uniform('u_quality'),
      quality.shaderDetail,
      quality.maxPointCloudGrid,
      quality.pointCloudDensityScale,
      0,
    );
    gl.uniform4f(
      this.uniform('u_environment'),
      clamp(frame.seed, 0.001, 0.999999),
      clamp(controls.background, -1, 1),
      clamp(controls.shapeCount * quality.shapeCountScale, -1, 1),
      clamp(controls.noiseDensity * quality.noiseDensityScale, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_pulseA'),
      clamp(pulses.synth * triggerGain, 0, 1),
      clamp(pulses.pad * triggerGain, 0, 1),
      clamp(pulses.lead * triggerGain, 0, 1),
      clamp(pulses.drums * triggerGain, 0, 1),
    );
    gl.uniform4f(
      this.uniform('u_pulseB'),
      clamp(pulses.earth * triggerGain, 0, 1),
      clamp(pulses.granular * triggerGain, 0, 1),
      clamp(pulses.delay * triggerGain, 0, 1),
      clamp(pulses.reverb * triggerGain, 0, 1),
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private renderFallback(frame: ReactiveVisualizerFrame): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const snapshot = frame.snapshot;
    const controls = frame.controls;
    const pulses = snapshot.pulses;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.42;
    this.fallbackPhase += 0.008 + Math.max(0, controls.motion) * 0.018 + Math.max(0, -controls.motion) * 0.035;

    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    // atmospheric dark background with fade trail
    const litBackground = Math.max(0, controls.background);
    const darkBackground = Math.max(0, -controls.background);
    const bgR = Math.round(16 + litBackground * 30);
    const bgG = Math.round(15 + litBackground * 28);
    const bgB = Math.round(14 + litBackground * 24);
    ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${0.12 + darkBackground * 0.14 + litBackground * 0.08 + Math.max(0, controls.diffusion) * 0.1})`;
    ctx.fillRect(0, 0, width, height);

    // kaleidoscope symmetry from control
    const symmetry = Math.max(4, Math.round(6 + Math.max(0, -controls.kaleidoscope) * 10 + Math.abs(controls.kaleidoscope) * 4));
    const engines = [
      ['rgba(232, 220, 196, 0.45)', snapshot.pad + pulses.pad],       // cream
      ['rgba(212, 165, 32, 0.42)', snapshot.lead + pulses.lead],       // gold
      ['rgba(139, 92, 246, 0.38)', snapshot.drums + pulses.drums],     // violet
      ['rgba(123, 154, 109, 0.4)', snapshot.earth + pulses.earth],     // sage
      ['rgba(232, 180, 74, 0.4)', snapshot.granular + pulses.granular],// granular
      ['rgba(94, 168, 166, 0.36)', snapshot.delay + pulses.delay],     // teal
      ['rgba(176, 120, 90, 0.38)', snapshot.reverb + pulses.reverb],   // clay
    ] as const;

    ctx.globalCompositeOperation = 'lighter';
    // shape control affects polygon sides: -1=3 sides (tri), 0=4, +1=high (circle-like)
    const shapeSides = Math.max(3, Math.round(4 + controls.shape * (controls.shape > 0 ? 20 : 1)));
    const organicWarp = Math.max(0, controls.organic);
    const blobWarp = Math.max(0, -controls.edges);
    for (let ring = 0; ring < engines.length; ring += 1) {
      const engine = engines[ring];
      if (!engine) continue;
      const [color, amount] = engine;
      const amp = clamp(amount + pulses.global * 0.25, 0, 1.2);
      if (amp < 0.02) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8 + amp * 2.4;
      ctx.beginPath();
      const sides = Math.max(3, shapeSides + Math.round((ring - 3) * 0.3));
      const pointsPerSide = Math.max(6, Math.round(40 / sides * symmetry));
      const totalPoints = sides * pointsPerSide;
      for (let i = 0; i <= totalPoints; i += 1) {
        const unit = i / Math.max(1, totalPoints);
        const angle = unit * Math.PI * 2;
        const warp = Math.sin(unit * Math.PI * 2 * symmetry + this.fallbackPhase * (ring * 0.7 + 1))
          + Math.sin(unit * Math.PI * 4 * symmetry * 0.5 + this.fallbackPhase * 0.6 + ring) * 0.4;
        const breathe = Math.sin(this.fallbackPhase * 0.3 + ring * 0.9) * 0.02;
        // polygon shape: modulate radius by angular distance to nearest vertex
        const sectorAngle = Math.PI * 2 / sides;
        const withinSector = ((angle % sectorAngle) + sectorAngle) % sectorAngle;
        const polyMod = Math.cos(withinSector - sectorAngle / 2);
        const stretchMod = 1 + organicWarp * Math.sin(angle * 2 + ring * 1.3 + this.fallbackPhase * 0.2) * 0.15;
        const blobMod = 1 + blobWarp * (Math.sin(angle * 3 + ring * 2.1 + this.fallbackPhase * 0.4) * 0.12
          + Math.sin(angle * 5 + ring * 1.3 - this.fallbackPhase * 0.3) * 0.08);
        const baseR = radius * (0.18 + ring * 0.088 + warp * 0.02 * (1 + amp) + breathe);
        const r = baseR / Math.max(0.5, polyMod) * stretchMod * blobMod;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
