import type { VisualizerPulseSnapshot } from './visualizerSignals';

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
  density: number;
  background: number;
  frameRate: number;
  shape: number;
  organic: number;
  edges: number;
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
uniform vec4 u_environment;
uniform vec4 u_pulseA;
uniform vec4 u_pulseB;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

/* ─── Noise primitives ─── */
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
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

/* ─── Kessho palette ─── */
vec3 kesshoWarm(float t) {
  vec3 b = vec3(0.91, 0.86, 0.77);   // cream
  vec3 c = vec3(0.48, 0.60, 0.43);   // sage
  vec3 d = vec3(0.77, 0.45, 0.31);   // clay
  vec3 e = vec3(0.83, 0.65, 0.13);   // gold
  vec3 f = vec3(0.72, 0.88, 0.99);   // icy
  vec3 g = vec3(0.55, 0.36, 0.96);   // violet
  vec3 h = vec3(0.62, 0.81, 0.74);   // visualizer green

  float s = fract(t) * 7.0;
  if (s < 1.0) return mix(b, c, s);
  if (s < 2.0) return mix(c, d, s - 1.0);
  if (s < 3.0) return mix(d, e, s - 2.0);
  if (s < 4.0) return mix(e, f, s - 3.0);
  if (s < 5.0) return mix(f, g, s - 4.0);
  if (s < 6.0) return mix(g, h, s - 5.0);
  return mix(h, b, s - 6.0);
}

vec3 palette(float t, float bias) {
  vec3 base = kesshoWarm(t);
  vec3 vivid = base * 1.3;
  vec3 pastel = mix(base, vec3(0.94, 0.89, 0.82), 0.42);
  vec3 color = mix(base, vivid, max(-bias, 0.0) * 0.7);
  return mix(color, pastel, max(bias, 0.0) * 0.6);
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

/* shape to intensity: hard edge → soft halo → amoeba blob
   edgesControl: -1 = amoeba blobs, +1 = hard cut */
float shapeIntensity(float sdf, float size, float edgesControl) {
  float hardCut = max(edgesControl, 0.0);    // 0..1
  float amoebaBlob = max(-edgesControl, 0.0); // 0..1

  // hard edge: sharp step
  float hard = smoothstep(size * 0.02, -size * 0.01, sdf);
  // neutral: smooth gradient falloff
  float neutral = exp(-max(sdf, 0.0) * (3.0 / max(size, 0.01)));
  // amoeba: very wide soft falloff
  float amoeba = exp(-max(sdf, 0.0) * max(sdf, 0.0) / max(0.001, size * size * 0.8));

  float result = neutral;
  result = mix(result, hard, hardCut);
  result = mix(result, amoeba, amoebaBlob);
  return result;
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
  float diffusionControl = clamp(u_controlB.z, -1.0, 1.0);   // -1 hard edge, +1 soft halo
  float densityControl = clamp(u_controlB.w, -1.0, 1.0);     // -1 sparse, +1 layered
  float seed = max(0.001, u_environment.x) * 104729.0;
  float backgroundControl = clamp(u_environment.y, -1.0, 1.0);
  float shapeControl = clamp(u_controlC.x, -1.0, 1.0);       // -1 triangles, 0 squares, +1 circles
  float organicControl = clamp(u_controlC.y, -1.0, 1.0);      // -1 equal sided, +1 irregular
  float edgesControl = clamp(u_controlC.z, -1.0, 1.0);        // -1 amoeba blobs, +1 hard cut

  /* ─── Derived ─── */
  float hardEdge = max(-diffusionControl, 0.0);  // 0..1 how hard the edges are
  float softHalo = max(diffusionControl, 0.0);   // 0..1 how soft/bloomy
  float noiseBlend = max(-styleControl, 0.0);    // fade in noise fields
  float orbBlend = max(styleControl, 0.0);       // fade in gradient orbs
  float bothPresent = 1.0 - abs(styleControl);   // neutral = both layers visible
  float sparse = max(-densityControl, 0.0);
  float dense = max(densityControl, 0.0);

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
    globalPulse * 0.36 + u_pulseA.y * 0.22 + u_pulseA.z * 0.26 + u_pulseA.w * 0.34 +
    u_pulseB.x * 0.22 + u_pulseB.y * 0.18 + seqPulse * 0.14,
    0.0, 1.0
  );
  float triggerLift = hitEnergy * mix(0.5, 1.2, max(triggerControl, 0.0));
  triggerLift += hitEnergy * max(-triggerControl, 0.0) * 0.3;

  /* ─── Time & motion ─── */
  float motionSpeed = 0.014 + max(motionControl, 0.0) * 0.035 + max(-motionControl, 0.0) * 0.1;
  float t = u_time * motionSpeed;
  float screenAngle = atan(p.y, p.x);
  float screenRadius = length(p);

  /* ═══════════════════════════════════════════════════════════
     KALEIDOSCOPE FOLD — applied on top of everything
     kaleidoControl < 0 → more mirror segments (sharp shards)
     kaleidoControl > 0 → fewer segments, soft radial warp (glass)
     granular activity drives fold intensity
     ═══════════════════════════════════════════════════════════ */
  float granularFold = clamp(granular * 0.72 + u_pulseB.y * 0.55 + abs(kaleidoControl) * 0.5, 0.0, 1.0);
  float foldAmount = smoothstep(0.08, 0.72, granularFold);
  float foldSegments = floor(mix(4.0, 16.0, clamp(
    granularFold * 0.6 + max(-kaleidoControl, 0.0) * 0.5 + sparse * 0.15,
    0.0, 1.0
  )));
  float foldSector = TAU / max(3.0, foldSegments);
  float foldSpin = root * TAU * 0.1 + seed * 0.001 + t * (0.5 + max(-motionControl, 0.0) * 1.6);
  float foldedAngle = abs(mod(screenAngle + foldSpin + foldSector * 0.5, foldSector) - foldSector * 0.5);
  float radialWarp = sin(screenRadius * (8.0 + granularFold * 6.0) - u_time * 0.08) * max(kaleidoControl, 0.0) * 0.022;
  float foldedRadius = screenRadius * (1.0 + radialWarp);
  vec2 foldedP = vec2(cos(foldedAngle - foldSpin * 0.3), sin(foldedAngle - foldSpin * 0.3)) * foldedRadius;
  vec2 drawP = mix(p, foldedP, foldAmount);

  /* ═══════════════════════════════════════════════════════════
     BACKGROUND
     ═══════════════════════════════════════════════════════════ */
  vec3 darkBg = mix(vec3(0.047, 0.043, 0.038), vec3(0.028, 0.032, 0.034), smoothstep(-0.4, 0.8, p.y));
  vec3 litBg = mix(vec3(0.12, 0.10, 0.09), vec3(0.07, 0.085, 0.09), smoothstep(-0.3, 0.9, p.y));
  vec3 bg = mix(darkBg, darkBg * 0.4, max(-backgroundControl, 0.0) * 0.8);
  bg = mix(bg, litBg, max(backgroundControl, 0.0) * 0.7);
  vec3 field = bg;

  /* ═══════════════════════════════════════════════════════════
     LAYER A: GRADIENT LIGHT SHAPES
     Shape morphs between triangle/square/pentagon/circle.
     Organic deforms proportions. Edges controls hard-cut vs amoeba-blob.
     Fades in with styleControl > 0 (or always partially present at neutral)
     ═══════════════════════════════════════════════════════════ */
  float orbLayerMix = orbBlend + bothPresent * 0.55;
  vec3 orbField = vec3(0.0);
  float organicAmount = max(organicControl, 0.0);     // 0..1 irregular
  float amoebaBlob = max(-edgesControl, 0.0);          // for shape SDF

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float id = fi + seed * 0.013;

    // slow orbital drift
    float orbitSpeed = 0.03 + hash(vec2(id, 11.3)) * 0.06;
    float orbit = u_time * orbitSpeed + hash(vec2(id, 17.4)) * TAU + root * TAU * 0.15;
    float baseDistance = 0.2 + hash(vec2(id, 22.1)) * 0.55 + dense * 0.12 - sparse * 0.1;
    vec2 center = vec2(
      cos(orbit * (0.7 + hash(vec2(id, 25.6)) * 0.4)),
      sin(orbit * (0.55 + hash(vec2(id, 28.2)) * 0.35) + tension * TAU)
    ) * baseDistance;
    center.x += sin(u_time * 0.02 + fi * 2.1) * 0.06;
    center.y += cos(u_time * 0.018 + fi * 1.7) * 0.05;

    // per-shape rotation
    float shapeAngle = u_time * (0.015 + hash(vec2(id, 29.5)) * 0.03) + hash(vec2(id, 30.1)) * TAU;
    float ca = cos(shapeAngle), sa = sin(shapeAngle);
    vec2 localP = drawP - center;
    localP = vec2(localP.x * ca + localP.y * sa, -localP.x * sa + localP.y * ca);

    // radius breathes with engine state
    float engineAffinity = (
      pad * hash(vec2(id, 31.0)) +
      lead * hash(vec2(id, 32.0)) +
      drums * hash(vec2(id, 33.0)) +
      earth * hash(vec2(id, 34.0)) +
      granular * hash(vec2(id, 35.0)) +
      delaySig * hash(vec2(id, 36.0)) +
      reverb * hash(vec2(id, 37.0))
    );
    float baseRadius = 0.18 + hash(vec2(id, 40.5)) * 0.28 + dense * 0.08;
    float size = baseRadius + engineAffinity * 0.06 + triggerLift * 0.04;

    // per-shape selector varies slightly around the global shapeControl
    float perShapeOffset = (hash(vec2(id, 42.3)) - 0.5) * 0.3;
    float shapeSel = clamp(shapeControl + perShapeOffset, -1.0, 1.0);

    // SDF
    float sdf = morphShape(localP, size, shapeSel, organicAmount, amoebaBlob, id, u_time);
    float intensity = shapeIntensity(sdf, size, edgesControl);

    // fade in/out over time
    float fade = 0.5 + 0.5 * sin(u_time * (0.02 + orbitSpeed * 0.4) + seed * 0.002 + fi * 1.9);
    fade = smoothstep(0.15 + sparse * 0.2, 0.85, fade);

    // density gate
    float densityGate = smoothstep(fi - 0.5, fi + 1.2, 3.0 + dense * 3.0 - sparse * 1.5);

    float energy = fade * densityGate * (0.14 + engineAffinity * 0.16 + triggerLift * 0.12);

    // color from palette, slowly cycling per shape
    vec3 shapeColor = palette(
      root + hash(vec2(id, 44.0)) + sin(u_time * (0.015 + orbitSpeed) + id) * 0.08,
      colorControl
    );

    orbField += shapeColor * intensity * energy;
  }
  field += orbField * orbLayerMix;

  /* ═══════════════════════════════════════════════════════════
     LAYER B: NOISE FIELDS (flowing aurora / domain-warped FBM)
     Fades in with styleControl < 0 (or partially at neutral)
     ═══════════════════════════════════════════════════════════ */
  float noiseLayerMix = noiseBlend + bothPresent * 0.4;
  float warpStrength = 0.24 + noiseBlend * 0.18 + reverb * 0.12;
  vec2 warpedP = drawP * (1.3 + dense * 0.5);
  float n1 = fbm(warpedP + vec2(t * 0.07, t * -0.05), 3.0);
  float n2 = fbm(warpedP + vec2(t * -0.06, t * 0.08) + 4.2, 3.0);
  vec2 wP = warpedP + vec2(n1, n2) * warpStrength;

  float noiseScale = 2.2 + dense * 1.0;
  float flow1 = fbm(wP * noiseScale + vec2(seed * 0.004, 0.0), 3.0 + dense);
  float flow2 = fbm(wP * noiseScale * 1.3 + vec2(flow1 * 0.5, n1 * 0.4), min(4.0, 3.0 + dense));

  float engineGlow = pad * 0.16 + lead * 0.14 + earth * 0.1 + granular * 0.12 + delaySig * 0.09 + reverb * 0.11;
  float colorPhase = root + t * 0.16 + flow1 * 0.3 + seed * 0.0001;
  vec3 noiseColor = palette(colorPhase, colorControl);

  // band structure: hard edge = sharp iso-lines, soft = smooth gradient
  float rawBand = flow2;
  float sharpBand = smoothstep(0.38, 0.42, rawBand) - smoothstep(0.58, 0.62, rawBand);
  float softBand = smoothstep(0.2, 0.75, rawBand);
  float band = mix(softBand, softBand + sharpBand * 0.6, hardEdge);
  band = mix(band, sqrt(max(band, 0.0)), softHalo * 0.4);

  float noiseIntensity = band * (0.1 + engineGlow * 0.55 + triggerLift * 0.25);
  vec3 noiseField = noiseColor * noiseIntensity;

  // second color layer for depth
  float flow3 = fbm(wP * noiseScale * 0.5 + vec2(-t * 0.5, t * 0.35) + 9.1, 3.0);
  vec3 noise2Color = palette(root + 0.4 + flow3 * 0.25 + tension * 0.3, colorControl);
  float noise2Band = smoothstep(0.35, 0.65, flow3);
  noiseField += noise2Color * noise2Band * (0.05 + pad * 0.06 + delaySig * 0.08 + triggerLift * 0.1);

  field += noiseField * noiseLayerMix;

  /* ═══════════════════════════════════════════════════════════
     LAYER C: RIPPLES (water rings)
     Always available, strength from rippleControl + earth activity
     ═══════════════════════════════════════════════════════════ */
  float crispRipple = max(-rippleControl, 0.0);
  float softRipple = max(rippleControl, 0.0);
  float rippleStrength = clamp(abs(rippleControl) * 0.5 + earth * 0.18 + u_pulseB.x * 0.28, 0.0, 1.0);
  float rip = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float epoch = floor(u_time * (0.07 + earth * 0.05 + hash(vec2(seed, fi)) * 0.04) + fi * 13.0 + seed * 0.01);
    vec2 rc = vec2(hash(vec2(fi * 11.3 + seed * 0.003, epoch + 1.7)), hash(vec2(epoch + 4.2, fi * 8.1 + seed * 0.004)));
    rc = (rc - 0.5) * aspect * 1.7;
    float phase = fract(u_time * (0.06 + earth * 0.14 + hash(vec2(fi, seed)) * 0.05) + fi * 0.2) * TAU * (1.4 + crispRipple * 1.2);
    float d = length(drawP - rc);
    float sharpFactor = 16.0 + crispRipple * 38.0;
    float softFactor = mix(0.04, 0.16, softRipple + softHalo * 0.25);
    float wave = sin(d * sharpFactor - phase);
    float ring = smoothstep(softFactor, 0.0, abs(wave));
    rip += ring * exp(-d * (1.5 + softRipple * 2.0)) * (0.15 + 0.1 * hash(vec2(fi + seed * 0.005, epoch)));
  }
  vec3 rippleColor = mix(vec3(0.37, 0.62, 0.57), vec3(0.72, 0.88, 0.99), softRipple);
  field += rippleColor * rip * rippleStrength;

  /* ═══════════════════════════════════════════════════════════
     LAYER D: CENTRAL BLOOM (reverb/delay atmosphere halo)
     ═══════════════════════════════════════════════════════════ */
  float bloomD = length(drawP);
  float bloom = exp(-bloomD * bloomD * (2.6 - reverb * 0.8 - softHalo * 0.5));
  bloom *= (0.06 + reverb * 0.14 + delaySig * 0.1 + triggerLift * 0.2);
  field += palette(root + 0.55 + drumStepPhase * 0.14, colorControl) * bloom;

  /* ─── Hit flash ─── */
  vec2 hitDrift = vec2(
    sin(root * TAU + t * 1.8 + seed * 0.008),
    cos(t * 1.2 + tension * 2.8 + seed * 0.005)
  ) * 0.15;
  float hitGlow = exp(-length(drawP - hitDrift) * (2.4 + max(-triggerControl, 0.0) * 4.0));
  hitGlow *= triggerLift * mix(0.18, 0.45, max(triggerControl, 0.0));
  field += palette(root + 0.72 + hitEnergy * 0.16, colorControl) * hitGlow;

  /* ═══════════════════════════════════════════════════════════
     POST-PROCESSING: vignette, edge/bloom contrast, film grain
     ═══════════════════════════════════════════════════════════ */
  float vignette = smoothstep(1.5, 0.1, screenRadius);
  vec3 finalColor = field * vignette;

  // hard edge tightens contrast, soft halo lifts shadows
  finalColor = mix(finalColor, smoothstep(vec3(0.0), vec3(1.0), finalColor), hardEdge * 0.3);
  finalColor = mix(finalColor, sqrt(max(finalColor, vec3(0.0))), softHalo * 0.38);

  // film grain
  float grain = hash(uv * u_resolution + vec2(u_time * 61.0, u_time * 37.0)) * 0.013;
  finalColor += grain;

  outColor = vec4(finalColor, 1.0);
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
    if (this.canvas.width !== safeWidth || this.canvas.height !== safeHeight) {
      this.canvas.width = safeWidth;
      this.canvas.height = safeHeight;
    }
    this.canvas.style.width = `${Math.max(1, Math.floor(width))}px`;
    this.canvas.style.height = `${Math.max(1, Math.floor(height))}px`;
    if (this.gl) {
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
    const pulses = snapshot.pulses;
    const width = Math.max(1, Math.floor(frame.width * frame.dpr));
    const height = Math.max(1, Math.floor(frame.height * frame.dpr));
    const triggerGain = 1 + Math.max(0, controls.triggerResponse) * 0.72 + Math.max(0, -controls.triggerResponse) * 0.36;

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
      clamp(controls.kaleidoscope + snapshot.activeGrains * 0.0015, -1, 1),
      clamp(controls.triggerResponse, -1, 1),
      clamp(controls.ripples, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlB'),
      clamp(controls.motion, -1, 1),
      clamp(controls.color + snapshot.brightness * 0.08, -1, 1),
      clamp(controls.diffusion, -1, 1),
      clamp(controls.density, -1, 1),
    );
    gl.uniform4f(
      this.uniform('u_controlC'),
      clamp(controls.shape, -1, 1),
      clamp(controls.organic, -1, 1),
      clamp(controls.edges, -1, 1),
      0,
    );
    gl.uniform4f(
      this.uniform('u_environment'),
      clamp(frame.seed, 0.001, 0.999999),
      clamp(controls.background, -1, 1),
      0,
      0,
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
