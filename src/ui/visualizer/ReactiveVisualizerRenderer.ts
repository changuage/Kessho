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
uniform vec4 u_environment;
uniform vec4 u_pulseA;
uniform vec4 u_pulseB;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

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
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p, float detail) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) > detail) break;
    value += amp * noise(p * freq);
    freq *= 2.04;
    amp *= 0.52;
  }
  return value;
}

vec3 kesshoColor(float index) {
  float i = mod(index, 8.0);
  if (i < 1.0) return vec3(0.88, 0.48, 0.52);
  if (i < 2.0) return vec3(0.49, 0.61, 0.43);
  if (i < 3.0) return vec3(0.83, 0.65, 0.13);
  if (i < 4.0) return vec3(0.55, 0.36, 0.96);
  if (i < 5.0) return vec3(0.35, 0.48, 0.54);
  if (i < 6.0) return vec3(0.23, 0.44, 0.51);
  if (i < 7.0) return vec3(0.89, 0.78, 0.62);
  return vec3(0.62, 0.81, 0.74);
}

vec3 palette(float t, float colorBias) {
  vec3 muted = mix(kesshoColor(floor(t * 8.0)), kesshoColor(floor(t * 8.0) + 1.0), smoothstep(0.0, 1.0, fract(t * 8.0)));
  vec3 saturated = 0.5 + 0.5 * cos(TAU * (vec3(0.84, 0.62, 0.48) * t + vec3(0.02, 0.31, 0.56)));
  vec3 pastel = mix(muted, vec3(0.96, 0.9, 0.84), 0.34);
  vec3 color = mix(muted, saturated, max(-colorBias, 0.0) * 0.78);
  return mix(color, pastel, max(colorBias, 0.0) * 0.66);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float softBox(vec2 p, vec2 center, vec2 size, float blur) {
  float d = sdBox(p - center, size);
  return smoothstep(blur, -blur, d);
}

float softCircle(vec2 p, vec2 center, float radius, float blur) {
  float d = length(p - center) - radius;
  return smoothstep(blur, -blur, d);
}

float softDiamond(vec2 p, vec2 center, vec2 size, float blur) {
  vec2 q = abs(p - center) / max(size, vec2(0.001));
  float d = (q.x + q.y - 1.0) * min(size.x, size.y);
  return smoothstep(blur, -blur, d);
}

float softTriangle(vec2 p, vec2 center, float size, float blur) {
  vec2 q = p - center;
  q.y += size * 0.28;
  q.x = abs(q.x);
  float d = max(q.x * 0.866 + q.y * 0.5, -q.y) - size * 0.5;
  return smoothstep(blur, -blur, d);
}

float shapeWeight(float selector, float target) {
  float d = abs(fract(selector - target + 0.5) - 0.5);
  return smoothstep(0.36, 0.0, d);
}

float softPrimaryShape(vec2 p, vec2 center, vec2 size, float selector, float blur) {
  float rectShape = softBox(p, center, size, blur);
  float squareSize = max(size.x, size.y) * 0.72;
  float squareShape = softBox(p, center, vec2(squareSize), blur);
  float circleShape = softCircle(p, center, max(size.x, size.y) * 0.72, blur);
  float diamondShape = softDiamond(p, center, size * 0.94, blur);
  float triangleShape = softTriangle(p, center, max(size.x, size.y) * 1.25, blur);
  float w0 = shapeWeight(selector, 0.0);
  float w1 = shapeWeight(selector, 0.22);
  float w2 = shapeWeight(selector, 0.45);
  float w3 = shapeWeight(selector, 0.68);
  float w4 = shapeWeight(selector, 0.88);
  float total = max(0.001, w0 + w1 + w2 + w3 + w4);
  return (rectShape * w0 + squareShape * w1 + circleShape * w2 + diamondShape * w3 + triangleShape * w4) / total;
}

float boxHalo(vec2 p, vec2 center, vec2 size, float radius) {
  float d = max(0.0, sdBox(p - center, size));
  return exp(-d * radius);
}

float lineField(float value, float width) {
  return smoothstep(width, 0.0, abs(value));
}

float ripple(vec2 p, vec2 center, float phase, float sharpness, float softness) {
  float d = length(p - center);
  float wave = sin(d * (18.0 + sharpness * 44.0) - phase);
  float ring = lineField(wave, mix(0.035, 0.16, softness));
  return ring * exp(-d * (1.4 + softness * 2.4));
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect * 2.0;

  float pad = clamp(u_engineA.x + u_pulseA.y * 0.35, 0.0, 1.0);
  float lead = clamp(u_engineA.y + u_pulseA.z * 0.5, 0.0, 1.0);
  float drums = clamp(u_engineA.z + u_pulseA.w * 0.7, 0.0, 1.0);
  float earth = clamp(u_engineA.w + u_pulseB.x * 0.45, 0.0, 1.0);
  float granular = clamp(u_engineB.x + u_pulseB.y * 0.48, 0.0, 1.0);
  float delay = clamp(u_engineB.y + u_pulseB.z * 0.42, 0.0, 1.0);
  float reverb = clamp(u_engineB.z + u_pulseB.w * 0.36, 0.0, 1.0);
  float dynamics = clamp(u_engineB.w, 0.0, 1.0);

  float style = clamp(u_controlA.x, -1.0, 1.0);
  float kaleidoControl = clamp(u_controlA.y, -1.0, 1.0);
  float triggerControl = clamp(u_controlA.z, -1.0, 1.0);
  float rippleControl = clamp(u_controlA.w, -1.0, 1.0);
  float motionControl = clamp(u_controlB.x, -1.0, 1.0);
  float colorControl = clamp(u_controlB.y, -1.0, 1.0);
  float diffusionControl = clamp(u_controlB.z, -1.0, 1.0);
  float densityControl = clamp(u_controlB.w, -1.0, 1.0);
  float seed = max(0.001, u_environment.x) * 104729.0;
  float backgroundControl = clamp(u_environment.y, -1.0, 1.0);

  float geometricStyle = max(-style, 0.0);
  float lightBoxStyle = max(style, 0.0);
  float crispRipple = max(-rippleControl, 0.0);
  float softRipple = max(rippleControl, 0.0);
  float sharpness = max(-diffusionControl, 0.0);
  float diffusion = max(diffusionControl, 0.0);
  float geometryDensity = max(-densityControl, 0.0);
  float panelDensity = max(densityControl, 0.0);

  float root = u_harmony.x;
  float tension = u_harmony.y;
  float spread = u_harmony.z;
  float detune = u_harmony.w;
  float globalPulse = u_reactive.x;
  float seqPulse = u_reactive.y;
  float synthStepPhase = u_reactive.z;
  float drumStepPhase = u_reactive.w;

  float hitEnergy = clamp(
    globalPulse * 0.36 + u_pulseA.y * 0.2 + u_pulseA.z * 0.26 + u_pulseA.w * 0.32 +
    u_pulseB.x * 0.24 + u_pulseB.y * 0.18 + seqPulse * 0.16,
    0.0,
    1.0
  );
  float severityWander = mix(0.62, 1.08, noise(vec2(seed * 0.007 + u_time * 0.035, root * 6.0 + tension)));
  float triggerBloom = (
    hitEnergy * mix(0.58, 1.18, max(triggerControl, 0.0)) +
    hitEnergy * max(-triggerControl, 0.0) * 0.34
  ) * severityWander;
  float motionSpeed = 0.016 + max(motionControl, 0.0) * 0.045 + max(-motionControl, 0.0) * 0.13;
  float t = u_time * motionSpeed;
  float screenAngle = atan(p.y, p.x);
  float screenRadius = length(p);
  float granularFold = clamp(granular * 0.78 + u_pulseB.y * 0.6 + abs(kaleidoControl) * 0.46, 0.0, 1.0);
  float foldAmount = smoothstep(0.1, 0.78, granularFold);
  float foldSegments = floor(mix(4.0, 14.0, clamp(granularFold + geometryDensity * 0.34 + max(-kaleidoControl, 0.0) * 0.44, 0.0, 1.0)));
  float foldSector = TAU / max(3.0, foldSegments);
  float foldSpin = root * TAU * 0.08 + seed * 0.001 + t * (0.55 + max(-motionControl, 0.0) * 1.8);
  float foldedAngle = abs(mod(screenAngle + foldSpin + foldSector * 0.5, foldSector) - foldSector * 0.5);
  float foldedRadius = screenRadius * (1.0 + sin(screenRadius * (9.0 + granularFold * 8.0) - u_time * 0.1) * max(kaleidoControl, 0.0) * 0.018);
  vec2 foldedP = vec2(cos(foldedAngle - foldSpin * 0.35), sin(foldedAngle - foldSpin * 0.35)) * foldedRadius;
  vec2 drawP = mix(p, foldedP, foldAmount);
  vec2 drawUv = drawP / max(aspect * 2.0, vec2(0.001)) + 0.5;
  float angle = atan(drawP.y, drawP.x);
  float radius = length(drawP);
  vec2 drift = vec2(sin(t * 0.73 + root * TAU + seed * 0.011), cos(t * 0.61 + tension * 2.0 + seed * 0.017)) * (0.012 + abs(motionControl) * 0.022);
  float grainNoise = fbm(mix(uv, drawUv, foldAmount * 0.55) * (2.0 + panelDensity * 1.6) + vec2(t * 0.12 + seed * 0.003, -t * 0.08), 3.0);

  vec3 bg = mix(vec3(0.054, 0.048, 0.042), vec3(0.025, 0.031, 0.032), smoothstep(-0.35, 0.9, p.y));
  bg = mix(bg, vec3(0.063, 0.056, 0.048), grainNoise * 0.18);
  vec3 litBg = mix(vec3(0.28, 0.24, 0.21), vec3(0.48, 0.56, 0.52), smoothstep(-0.42, 0.98, p.y));
  litBg = mix(litBg, vec3(0.58, 0.5, 0.44), grainNoise * 0.12);
  bg = mix(bg, bg * 0.38, max(-backgroundControl, 0.0) * 0.86);
  bg = mix(bg, litBg, max(backgroundControl, 0.0) * 0.76);

  vec3 field = bg;
  float panelBlur = 0.045 + diffusion * 0.12 + lightBoxStyle * 0.08 - geometricStyle * 0.016;
  vec2 p1 = drawP + drift;
  float facetSymmetry = mix(5.0, 15.0, clamp(geometryDensity * 0.48 + geometricStyle * 0.7 + granularFold * 0.26, 0.0, 1.0));
  float facetPattern = lineField(
    sin(angle * facetSymmetry + radius * (5.5 + geometryDensity * 8.0) - t * (5.0 + max(-motionControl, 0.0) * 8.0)),
    0.08 + diffusion * 0.1
  );
  float geometricMod = mix(1.0, 0.78 + facetPattern * 0.42, geometricStyle);
  vec3 panelField = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float id = fi + seed * 0.013;
    float baseX = hash(vec2(id, 2.1)) * 1.82 - 0.91;
    float baseY = hash(vec2(id, 7.4)) * 1.46 - 0.73;
    float speedA = 0.04 + hash(vec2(id, 12.2)) * 0.1;
    float speedB = 0.025 + hash(vec2(id, 14.9)) * 0.075;
    float orbit = u_time * speedA + hash(vec2(id, 19.3)) * TAU + root * TAU * 0.12;
    vec2 center = vec2(baseX, baseY);
    center += vec2(
      sin(orbit * (0.76 + hash(vec2(id, 21.1)) * 0.52) + fi),
      cos(orbit * (0.58 + hash(vec2(id, 23.5)) * 0.42) + tension * TAU)
    ) * (0.045 + abs(motionControl) * 0.12 + panelDensity * 0.055);
    center.x += (spread - 0.5) * 0.14;
    center.y += (detune - 0.5) * 0.08;
    float radialSlot = fi / 7.0 * TAU + root * TAU * 0.2 + t * (0.42 + geometryDensity * 0.4);
    float radialDistance = 0.22 + hash(vec2(id, 28.2)) * 0.54 + geometryDensity * 0.14;
    vec2 geometricCenter = vec2(cos(radialSlot), sin(radialSlot)) * radialDistance;
    geometricCenter += vec2(cos(radialSlot * 2.0 + tension * TAU), sin(radialSlot * 3.0 + detune * TAU)) * 0.035;
    center = mix(center, geometricCenter, geometricStyle * (0.64 + geometryDensity * 0.26));

    float wide = 0.11 + hash(vec2(id, 31.7)) * 0.32 + panelDensity * 0.1;
    float tall = 0.1 + hash(vec2(id, 35.2)) * 0.38 + panelDensity * 0.08 + reverb * 0.04;
    float squareBias = smoothstep(0.28, 0.92, hash(vec2(id, 38.4)));
    vec2 size = mix(vec2(max(wide, tall) * 0.7), vec2(wide, tall), squareBias);
    vec2 geometricSize = vec2(0.09 + geometryDensity * 0.05, 0.19 + hash(vec2(id, 39.6)) * 0.18);
    size = mix(size, geometricSize, geometricStyle * 0.56);
    float selector = fract(hash(vec2(id, 41.8)) + u_time * speedB + sin(u_time * (speedB * 0.9) + id) * 0.08);
    selector = mix(selector, fract(0.64 + fi * 0.19 + sin(u_time * speedB + id) * 0.035), geometricStyle * 0.76);
    float shape = softPrimaryShape(p1, center, size, selector, panelBlur * (0.8 + hash(vec2(id, 43.9)) * 0.55));
    float halo = softPrimaryShape(p1, center, size + vec2(0.12 + diffusion * 0.1), selector, panelBlur * (3.2 + diffusion * 2.0));

    float fade = 0.5 + 0.5 * sin(u_time * (0.024 + speedB * 0.42) + seed * 0.002 + fi * 1.71);
    fade = smoothstep(0.12, 0.94, fade);
    float engineLift = (
      pad * hash(vec2(id, 51.0)) +
      lead * hash(vec2(id, 52.0)) +
      drums * hash(vec2(id, 53.0)) +
      earth * hash(vec2(id, 54.0)) +
      granular * hash(vec2(id, 55.0)) +
      delay * hash(vec2(id, 56.0)) +
      reverb * hash(vec2(id, 57.0))
    ) * 0.24;
    float pulseLift = triggerBloom * (0.1 + hash(vec2(id, 58.0)) * 0.28);
    float panelGate = smoothstep(fi - 0.8, fi + 1.4, 3.2 + panelDensity * 3.2 + geometricStyle * 2.1 - geometryDensity * 0.4);
    float energy = panelGate * (0.05 + fade * (0.36 + lightBoxStyle * 0.3) + engineLift + pulseLift);
    vec3 panelColor = palette(root + hash(vec2(id, 64.0)) + sin(u_time * (0.018 + speedB) + id) * 0.09, colorControl);
    panelField += panelColor * (shape * energy * geometricMod + halo * energy * (0.14 + diffusion * 0.08 + lightBoxStyle * 0.12) * mix(1.0, 0.82, geometricStyle));
  }
  field += panelField * (0.74 + lightBoxStyle * 0.36 - geometricStyle * 0.06);

  float innerGlow = softPrimaryShape(drawP, vec2(0.0, -0.04), vec2(0.16 + pad * 0.06, 0.14 + lead * 0.05), mix(0.18, 0.66, geometricStyle), panelBlur * 0.8);
  field += palette(root + 0.18 + synthStepPhase * 0.2, colorControl) * innerGlow * (0.32 + triggerBloom * 0.22);

  float bloom = exp(-radius * radius * (2.4 - reverb * 0.8 - diffusion * 0.5)) * (0.09 + reverb * 0.18 + triggerBloom * 0.26);
  field += palette(root + 0.62 + drumStepPhase * 0.2, colorControl) * bloom;

  float rippleAmount = clamp((abs(rippleControl) * 0.62 + earth * 0.22 + u_pulseB.x * 0.34) * severityWander, 0.0, 1.18);
  float rippleSoftness = clamp(0.38 + softRipple * 0.46 + diffusion * 0.16 - crispRipple * 0.28, 0.0, 1.0);
  float rippleSharpness = crispRipple + max(-triggerControl, 0.0) * 0.3;
  float rip = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float epoch = floor(u_time * (0.09 + earth * 0.07 + hash(vec2(seed, fi)) * 0.05) + fi * 17.0 + seed * 0.01);
    vec2 center = vec2(hash(vec2(fi * 12.7 + seed * 0.003, epoch + 2.1)), hash(vec2(epoch + 5.4, fi * 9.3 + seed * 0.004)));
    center = (center - 0.5) * aspect * 2.0;
    float phase = fract(u_time * (0.075 + earth * 0.2 + hash(vec2(fi, seed)) * 0.08) + fi * 0.17) * TAU * (1.7 + crispRipple * 1.45);
    rip += ripple(drawP, center, phase, rippleSharpness, rippleSoftness) * (0.18 + 0.12 * hash(vec2(fi + seed * 0.006, epoch)));
  }
  field += mix(vec3(0.42, 0.68, 0.62), vec3(0.82, 0.88, 0.78), softRipple) * rip * rippleAmount;

  float waveform = sin((drawP.x * (4.0 + spread * 7.0) + drawP.y * (2.0 + detune * 5.0)) + t * 8.0 + root * TAU);
  float sonicPresence = 0.34 + abs(triggerControl) * 0.36 + max(-kaleidoControl, 0.0) * 0.3 + geometricStyle * 0.18;
  float sonicBand = lineField(waveform, 0.16 + diffusion * 0.19) * (pad * 0.026 + lead * 0.03 + granular * 0.022) * sonicPresence;
  field += palette(root + 0.46, colorControl) * sonicBand;

  vec2 hitCenter = vec2(sin(root * TAU + t * 2.0 + seed * 0.009), cos(t * 1.4 + tension * 3.0 + seed * 0.006)) * 0.18;
  float hitGlow = exp(-length(drawP - hitCenter) * (2.2 + max(-triggerControl, 0.0) * 5.0)) * triggerBloom;
  field += palette(root + 0.7 + hitEnergy * 0.2, colorControl) * hitGlow * (0.24 + max(triggerControl, 0.0) * 0.28);

  float vignette = smoothstep(1.56, 0.08, screenRadius);
  vec3 finalColor = field * vignette;
  finalColor = mix(finalColor, smoothstep(vec3(0.0), vec3(1.0), finalColor), sharpness * 0.32);
  finalColor = mix(finalColor, sqrt(max(finalColor, vec3(0.0))), diffusion * 0.44 + lightBoxStyle * 0.18);
  finalColor += grainNoise * 0.012;

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
    this.fallbackPhase += 0.012 + Math.max(0, controls.motion) * 0.024 + Math.max(0, -controls.motion) * 0.045;

    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    const litBackground = Math.max(0, controls.background);
    const darkBackground = Math.max(0, -controls.background);
    const bgR = Math.round(13 + litBackground * 58);
    const bgG = Math.round(12 + litBackground * 64);
    const bgB = Math.round(11 + litBackground * 54);
    ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${0.2 + darkBackground * 0.18 + litBackground * 0.12 + Math.max(0, controls.diffusion) * 0.16})`;
    ctx.fillRect(0, 0, width, height);

    const symmetry = Math.max(4, Math.round(8 + Math.max(0, -controls.density) * 8 + Math.abs(controls.kaleidoscope) * 4));
    const engines = [
      ['rgba(224, 122, 132, 0.62)', snapshot.pad + pulses.pad],
      ['rgba(212, 165, 32, 0.6)', snapshot.lead + pulses.lead],
      ['rgba(168, 112, 232, 0.58)', snapshot.drums + pulses.drums],
      ['rgba(106, 174, 130, 0.56)', snapshot.earth + pulses.earth],
      ['rgba(232, 180, 74, 0.58)', snapshot.granular + pulses.granular],
      ['rgba(94, 168, 166, 0.52)', snapshot.delay + pulses.delay],
      ['rgba(176, 120, 90, 0.56)', snapshot.reverb + pulses.reverb],
    ] as const;

    ctx.globalCompositeOperation = 'lighter';
    for (let ring = 0; ring < engines.length; ring += 1) {
      const engine = engines[ring];
      if (!engine) continue;
      const [color, amount] = engine;
      const amp = clamp(amount + pulses.global * 0.3, 0, 1.4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 + amp * 3 * (1 + Math.abs(controls.triggerResponse));
      ctx.beginPath();
      for (let i = 0; i <= symmetry * 48; i += 1) {
        const unit = i / Math.max(1, symmetry * 48);
        const angle = unit * Math.PI * 2;
        const wave = Math.sin(unit * Math.PI * 2 * symmetry + this.fallbackPhase * (ring + 1));
        const r = radius * (0.16 + ring * 0.09 + wave * 0.024 * (1 + amp + Math.abs(controls.kaleidoscope)));
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
