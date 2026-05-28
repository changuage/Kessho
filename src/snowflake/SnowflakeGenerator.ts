import type {
  GeneratedSnowflake,
  SnowflakeBranchMotif,
  SnowflakeLineCap,
  SnowflakeLineJoin,
  SnowflakeParams,
  SnowflakePathLayer,
  SnowflakeShapePath,
  SnowflakeStationTemplate,
  SnowflakeTipMotif,
} from './types';

const TAU = Math.PI * 2;
const STATION_TEMPLATES: Record<SnowflakeStationTemplate, number[]> = {
  sparse: [0.25, 0.55, 0.82],
  balanced: [0.18, 0.34, 0.5, 0.66, 0.82],
  dense: [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.94],
  outerCrown: [0.48, 0.6, 0.72, 0.84, 0.94],
  innerStar: [0.14, 0.24, 0.38, 0.58, 0.8],
};
const QUANTIZED_ANGLES = [30, 35, 45, 50, 60];

interface Point {
  x: number;
  y: number;
}

interface LocalSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

interface LocalNode {
  x: number;
  y: number;
  radius: number;
  angle: number;
  depth: number;
}

interface LocalArm {
  segments: LocalSegment[];
  nodes: LocalNode[];
}

interface SvgMarkupOptions {
  idPrefix?: string;
  includeBackground?: boolean;
  title?: string;
}

type RandomFn = () => number;

export function createSeededRandom(seed: number): RandomFn {
  let state = Number.isFinite(seed) ? seed | 0 : 1;
  if (state === 0) state = 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSnowflake(params: SnowflakeParams): GeneratedSnowflake {
  const normalized = normalizeParams(params);
  const padding = Math.ceil(
    24 + normalized.style.strokeWidth * 5 + normalized.style.glow * 8 + normalized.geometry.radius * 0.04,
  );
  const size = Math.ceil(normalized.geometry.radius * 2 + padding * 2);
  const center = { x: size / 2, y: size / 2 };
  const rng = createSeededRandom(normalized.seed);
  const arm = buildBaseArm(normalized, rng);
  const layerCommands = new Map<number, string[]>();
  const shapePaths: SnowflakeShapePath[] = [];
  const maxSegments = Math.max(24, Math.floor(normalized.fractal.maxSegments));
  let totalSegments = 0;

  for (let armIndex = 0; armIndex < normalized.symmetry.arms; armIndex += 1) {
    const transform = buildArmTransform(normalized, armIndex);
    for (const segment of arm.segments) {
      if (totalSegments >= maxSegments) break;
      const start = transformPoint(segment.x1, segment.y1, center, transform);
      const end = transformPoint(segment.x2, segment.y2, center, transform);
      const key = Math.min(5, Math.max(0, segment.depth));
      const commands = layerCommands.get(key) ?? [];
      commands.push(`M ${formatNumber(start.x)} ${formatNumber(start.y)} L ${formatNumber(end.x)} ${formatNumber(end.y)}`);
      layerCommands.set(key, commands);
      totalSegments += 1;
    }
  }

  const pathLayers = buildPathLayers(normalized, layerCommands);
  shapePaths.push(...buildRingShapes(normalized, center));
  shapePaths.push(...buildCenterShapes(normalized, center));
  shapePaths.push(...buildNodeShapes(normalized, arm, center));
  shapePaths.push(...buildTipShapes(normalized, center));

  return {
    seed: normalized.seed,
    family: normalized.family,
    size,
    viewBox: `0 0 ${size} ${size}`,
    pathLayers,
    shapePaths,
    segmentCount: totalSegments,
  };
}

export function snowflakeToSvgMarkup(
  params: SnowflakeParams,
  result: GeneratedSnowflake = generateSnowflake(params),
  options: SvgMarkupOptions = {},
): string {
  const normalized = normalizeParams(params);
  const svgId = sanitizeId(options.idPrefix ?? `snowflake-${normalized.seed}`);
  const includeBackground = options.includeBackground ?? true;
  const cap = resolveLineCap(normalized);
  const join = resolveLineJoin(normalized);
  const frostOpacity = clamp01(normalized.style.glow);
  const title = options.title ? `<title>${escapeHtml(options.title)}</title>` : '';
  const background = includeBackground
    ? `<rect width="100%" height="100%" fill="${escapeAttribute(normalized.style.backgroundColor)}"/>`
    : '';
  const frostPaths = frostOpacity > 0
    ? `<g>${result.pathLayers.map((layer) => renderPathLayer(normalized, layer, cap, join, true)).join('')}</g>`
    : '';
  const shapeMarkup = result.shapePaths.map(renderShapePath).join('');
  const pathMarkup = result.pathLayers.map((layer) => renderPathLayer(normalized, layer, cap, join, false)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" id="${svgId}" width="${result.size}" height="${result.size}" viewBox="${result.viewBox}" role="img">${title}${background}${frostPaths}<g>${shapeMarkup}${pathMarkup}</g></svg>`;
}

function normalizeParams(params: SnowflakeParams): SnowflakeParams {
  return {
    ...params,
    seed: Math.round(params.seed || 1),
    family: params.family ?? 'classicDendrite',
    symmetry: {
      ...params.symmetry,
      arms: clamp(Math.round(params.symmetry.arms), 1, 12),
      rotationOffset: Number.isFinite(params.symmetry.rotationOffset) ? params.symmetry.rotationOffset : 0,
    },
    geometry: {
      ...params.geometry,
      radius: clamp(params.geometry.radius, 48, 360),
      centerRadius: clamp(params.geometry.centerRadius, 0, 80),
      innerGap: clamp(params.geometry.innerGap, 0, 120),
      armSegments: clamp(Math.round(params.geometry.armSegments), 1, 18),
      silhouette: params.geometry.silhouette ?? 'stellar',
    },
    branching: {
      ...params.branching,
      slots: clamp(Math.round(params.branching.slots), 0, 16),
      probability: clamp01(params.branching.probability),
      angle: clamp(params.branching.angle, 5, 85),
      angleJitter: clamp(params.branching.angleJitter, 0, 45),
      lengthRatio: clamp(params.branching.lengthRatio, 0, 1),
      lengthJitter: clamp01(params.branching.lengthJitter),
      positionJitter: clamp(params.branching.positionJitter, 0, 0.12),
      branchStart: clamp(params.branching.branchStart ?? 0.12, 0.02, 0.8),
      branchEnd: clamp(params.branching.branchEnd ?? 0.95, 0.2, 0.99),
      guaranteedInnerBranches: params.branching.guaranteedInnerBranches ?? true,
      stationTemplate: params.branching.stationTemplate ?? 'balanced',
      branchMotif: params.branching.branchMotif ?? 'fork',
    },
    fractal: {
      ...params.fractal,
      depth: clamp(Math.round(params.fractal.depth), 0, 5),
      lengthDecay: clamp(params.fractal.lengthDecay, 0.25, 0.9),
      widthDecay: clamp(params.fractal.widthDecay, 0.2, 1),
      probabilityDecay: clamp(params.fractal.probabilityDecay, 0.15, 1),
      minLength: clamp(params.fractal.minLength, 1, 48),
      maxSegments: clamp(Math.round(params.fractal.maxSegments), 48, 1600),
    },
    motifs: {
      ...params.motifs,
      rings: clamp(Math.round(params.motifs.rings), 0, 6),
      ringStyle: params.motifs.ringStyle ?? 'innerHexRing',
    },
    style: {
      ...params.style,
      strokeWidth: clamp(params.style.strokeWidth, 0.4, 16),
      strokeOpacity: clamp01(params.style.strokeOpacity),
      taper: clamp01(params.style.taper),
      glow: clamp01(params.style.glow),
      roughness: clamp01(params.style.roughness),
      sharpness: clamp01(params.style.sharpness),
    },
    variation: {
      randomness: clamp01(params.variation.randomness),
      asymmetry: clamp01(params.variation.asymmetry),
      angleNoise: clamp01(params.variation.angleNoise),
      lengthNoise: clamp01(params.variation.lengthNoise),
      densityNoise: clamp01(params.variation.densityNoise),
    },
  };
}

function buildBaseArm(params: SnowflakeParams, rng: RandomFn): LocalArm {
  const segments: LocalSegment[] = [];
  const nodes: LocalNode[] = [];
  const baseLimit = Math.max(8, Math.floor(params.fractal.maxSegments / params.symmetry.arms));
  const startX = Math.max(params.geometry.innerGap, params.geometry.centerRadius * 0.72);
  const radius = params.geometry.radius;
  const armLength = Math.max(1, radius - startX);
  const roughness = params.style.roughness * params.variation.randomness * 0.45;
  const mainPoints: Point[] = [];

  for (let index = 0; index <= params.geometry.armSegments; index += 1) {
    const t = index / params.geometry.armSegments;
    const x = startX + armLength * t;
    const jitter = index === 0 || index === params.geometry.armSegments
      ? 0
      : signed(rng) * roughness * 3.8 * (0.35 + Math.sin(t * Math.PI) * 0.65);
    mainPoints.push({ x, y: jitter });
  }

  for (let index = 1; index < mainPoints.length; index += 1) {
    if (segments.length >= baseLimit) break;
    const previous = mainPoints[index - 1]!;
    const next = mainPoints[index]!;
    segments.push({ x1: previous.x, y1: previous.y, x2: next.x, y2: next.y, depth: 0 });
  }

  if (params.family === 'simpleSpoke') {
    addSimpleSpokeBars({ params, segments, nodes, baseLimit, startX, armLength });
    addTipSegments(params, segments, nodes, baseLimit);
    return { segments, nodes };
  }

  const stations = getBranchStations(params);
  for (let slot = 0; slot < stations.length; slot += 1) {
    if (segments.length >= baseLimit) break;
    const station = stations[slot]!;
    const requiredInner = params.branching.guaranteedInnerBranches && station <= 0.34;
    const densityNoise = 1 + signed(rng) * params.variation.densityNoise * 0.18;
    if (!requiredInner && rng() > params.branching.probability * densityNoise) continue;

    const t = clamp(
      station + signed(rng) * params.branching.positionJitter,
      params.branching.branchStart,
      params.branching.branchEnd,
    );
    const origin = interpolateMainPoint(mainPoints, t);
    const baseAngle = radians(chooseQuantizedAngle(params, rng, slot));
    const lengthJitter = 1 + signed(rng) * params.branching.lengthJitter * (0.35 + params.variation.lengthNoise * 0.45);
    const branchLength = armLength * params.branching.lengthRatio * branchLengthEnvelope(t, params) * lengthJitter;
    const motif = chooseBranchMotif(params, rng, slot);

    addBranchMotif({
      params,
      rng,
      segments,
      nodes,
      baseLimit,
      origin,
      station: t,
      angle: baseAngle,
      length: branchLength,
      motif,
    });
  }

  addTipSegments(params, segments, nodes, baseLimit);
  return { segments, nodes };
}

function addSimpleSpokeBars({
  params,
  segments,
  nodes,
  baseLimit,
  startX,
  armLength,
}: {
  params: SnowflakeParams;
  segments: LocalSegment[];
  nodes: LocalNode[];
  baseLimit: number;
  startX: number;
  armLength: number;
}): void {
  const stations = getBranchStations(params);
  for (const t of stations) {
    const x = startX + armLength * t;
    const length = armLength * params.branching.lengthRatio * branchLengthEnvelope(t, params);
    addPairedSegments(params, segments, baseLimit, { x, y: 0 }, radians(params.branching.angle), length, 1);
    if (params.motifs.sideNodes !== 'none' && nodes.length < 120) {
      nodes.push({ x, y: 0, radius: Math.max(2, params.style.strokeWidth * 0.5), angle: 0, depth: 1 });
    }
  }
}

function addBranchMotif({
  params,
  rng,
  segments,
  nodes,
  baseLimit,
  origin,
  station,
  angle,
  length,
  motif,
}: {
  params: SnowflakeParams;
  rng: RandomFn;
  segments: LocalSegment[];
  nodes: LocalNode[];
  baseLimit: number;
  origin: Point;
  station: number;
  angle: number;
  length: number;
  motif: SnowflakeBranchMotif;
}): void {
  const branchEnds = addPairedSegments(params, segments, baseLimit, origin, angle, length, 1);
  const innerPatternScale = innerDendritePatternScale(params, station);
  const addAt = (point: Point, branchAngle: number, branchLength: number, depth: number) => {
    if (segments.length >= baseLimit || branchLength < params.fractal.minLength) return;
    const end = {
      x: point.x + Math.cos(branchAngle) * branchLength,
      y: point.y + Math.sin(branchAngle) * branchLength,
    };
    segments.push({ x1: point.x, y1: point.y, x2: end.x, y2: end.y, depth });
  };

  if (motif === 'doubleChevron') {
    const offset = Math.max(params.style.strokeWidth * 1.8, length * 0.18);
    addPairedSegments(params, segments, baseLimit, { x: origin.x + offset, y: origin.y }, angle * 0.92, length * 0.55, 1);
  }

  if (motif === 'fork' || motif === 'miniDendrite' || motif === 'arrow') {
    for (const branch of branchEnds) {
      const forkAngle = motif === 'arrow' ? angle * 0.7 : radians(28 + station * 14);
      const forkLength = length * (motif === 'miniDendrite' ? 0.34 : 0.25) * innerPatternScale;
      addAt(branch.point, branch.angle - branch.side * forkAngle, forkLength, 2);
      addAt(branch.point, branch.angle + branch.side * forkAngle * 0.45, forkLength * 0.76, 2);
    }
  }

  if (motif === 'comb' || motif === 'miniDendrite') {
    for (const branch of branchEnds) {
      const teeth = motif === 'comb' ? 3 : 2;
      for (let index = 0; index < teeth; index += 1) {
        const t = 0.32 + index * 0.22;
        const point = {
          x: origin.x + Math.cos(branch.angle) * length * t,
          y: origin.y + Math.sin(branch.angle) * length * t,
        };
        addAt(point, branch.angle + branch.side * radians(34), length * 0.18 * innerPatternScale * (1 - index * 0.08), 2);
      }
    }
  }

  if (motif === 'shortBar') {
    const barLength = Math.max(params.style.strokeWidth * 2, length * 0.38);
    segments.push({
      x1: origin.x,
      y1: origin.y - barLength * 0.42,
      x2: origin.x,
      y2: origin.y + barLength * 0.42,
      depth: 1,
    });
  }

  if (params.fractal.depth > 0) {
    for (const branch of branchEnds) {
      addControlledFractalDetail({
        params,
        rng,
        segments,
        nodes,
        baseLimit,
        origin,
        angle: branch.angle,
        side: branch.side,
        length,
        station,
        depth: 1,
      });
    }
  }

  if (params.motifs.sideNodes !== 'none' && nodes.length < 120) {
    const nodeChance = params.motifs.sideNodes === 'plates' ? 0.5 : params.motifs.sideNodes === 'tinyStars' ? 0.38 : 0.28;
    if (rng() < nodeChance || station < 0.3) {
      const target = branchEnds[Math.floor(rng() * branchEnds.length)]?.point ?? origin;
      nodes.push({
        x: target.x,
        y: target.y,
        radius: Math.max(1.5, params.style.strokeWidth * (0.48 + station * 0.18)),
        angle,
        depth: 1,
      });
    }
  }
}

function addPairedSegments(
  params: SnowflakeParams,
  segments: LocalSegment[],
  baseLimit: number,
  origin: Point,
  angle: number,
  length: number,
  depth: number,
): Array<{ point: Point; angle: number; side: number }> {
  const sides = params.symmetry.mirrorArm ? [-1, 1] : [1];
  const ends: Array<{ point: Point; angle: number; side: number }> = [];
  for (const side of sides) {
    if (segments.length >= baseLimit) break;
    const branchAngle = angle * side;
    const end = {
      x: origin.x + Math.cos(branchAngle) * length,
      y: origin.y + Math.sin(branchAngle) * length,
    };
    segments.push({ x1: origin.x, y1: origin.y, x2: end.x, y2: end.y, depth });
    ends.push({ point: end, angle: branchAngle, side });
  }
  return ends;
}

function addControlledFractalDetail({
  params,
  rng,
  segments,
  nodes,
  baseLimit,
  origin,
  angle,
  side,
  length,
  station,
  depth,
}: {
  params: SnowflakeParams;
  rng: RandomFn;
  segments: LocalSegment[];
  nodes: LocalNode[];
  baseLimit: number;
  origin: Point;
  angle: number;
  side: number;
  length: number;
  station: number;
  depth: number;
}): void {
  const minRecursiveLength = Math.max(0.7, params.fractal.minLength * 0.22);
  if (segments.length >= baseLimit || depth > params.fractal.depth || length < minRecursiveLength) return;

  const innerScale = innerDendritePatternScale(params, station);
  const familyDetailScale = getFractalDetailScale(params);
  const childCount = depth === 1 || params.family === 'denseFractal' || (params.family === 'fernDendrite' && station < 0.42) ? 2 : 1;
  for (let index = 0; index < childCount; index += 1) {
    const firstLayer = depth === 1;
    const detailChance = firstLayer ? 1 : Math.max(0.78, params.fractal.probabilityDecay);
    if (segments.length >= baseLimit || rng() > detailChance) continue;
    const t = firstLayer
      ? 0.34 + index * 0.3 + rng() * 0.04
      : 0.38 + index * 0.22 + rng() * 0.08;
    const branchOrigin = {
      x: origin.x + Math.cos(angle) * length * t,
      y: origin.y + Math.sin(angle) * length * t,
    };
    const angleScale = firstLayer ? 0.52 : 0.62;
    const childAngle = angle + side * radians(chooseQuantizedAngle(params, rng, index) * angleScale);
    const childLength = length * params.fractal.lengthDecay * (0.68 + rng() * 0.16) * innerScale * (firstLayer ? familyDetailScale : 1);
    if (childLength < minRecursiveLength) continue;
    const childEnd = {
      x: branchOrigin.x + Math.cos(childAngle) * childLength,
      y: branchOrigin.y + Math.sin(childAngle) * childLength,
    };
    segments.push({ x1: branchOrigin.x, y1: branchOrigin.y, x2: childEnd.x, y2: childEnd.y, depth });
    if (params.motifs.sideNodes !== 'none' && rng() < 0.18) {
      nodes.push({ x: childEnd.x, y: childEnd.y, radius: Math.max(1, params.style.strokeWidth * 0.34), angle: childAngle, depth });
    }
    addControlledFractalDetail({
      params,
      rng,
      segments,
      nodes,
      baseLimit,
      origin: branchOrigin,
      angle: childAngle,
      side,
      length: childLength,
      station,
      depth: depth + 1,
    });
  }
}

function getFractalDetailScale(params: SnowflakeParams): number {
  if (params.family === 'denseFractal') return 1;
  if (params.family === 'fernDendrite') return 0.9;
  if (params.family === 'classicDendrite' || params.family === 'thinSharpCrystal') return 0.78;
  if (params.family === 'simpleSpoke' || params.family === 'roundedIcon') return 0.54;
  return 0.64;
}

function addTipSegments(
  params: SnowflakeParams,
  segments: LocalSegment[],
  nodes: LocalNode[],
  baseLimit: number,
): void {
  const tipStyle = resolveTipStyle(params);
  const radius = params.geometry.radius;
  const tipLength = Math.max(8, params.geometry.radius * 0.075);
  const forkAngle = radians(38);
  const addSegment = (angle: number, lengthScale: number, depth = 1) => {
    if (segments.length >= baseLimit) return;
    const x1 = radius - tipLength * 0.42;
    const y1 = 0;
    segments.push({
      x1,
      y1,
      x2: x1 + Math.cos(angle) * tipLength * lengthScale,
      y2: y1 + Math.sin(angle) * tipLength * lengthScale,
      depth,
    });
  };

  if (tipStyle === 'fork') {
    addSegment(forkAngle, 0.86);
    addSegment(-forkAngle, 0.86);
  } else if (tipStyle === 'doubleFork') {
    addSegment(forkAngle, 0.92);
    addSegment(-forkAngle, 0.92);
    addSegment(forkAngle * 0.55, 0.64, 2);
    addSegment(-forkAngle * 0.55, 0.64, 2);
  } else if (tipStyle === 'split' || tipStyle === 'splitV') {
    addSegment(0, 0.72);
    addSegment(forkAngle * 0.86, 0.92);
    addSegment(-forkAngle * 0.86, 0.92);
  } else if (tipStyle === 'flatCap') {
    segments.push({ x1: radius, y1: -tipLength * 0.34, x2: radius, y2: tipLength * 0.34, depth: 1 });
  } else if (tipStyle === 'circle' && nodes.length < 120) {
    nodes.push({ x: radius, y: 0, radius: Math.max(2.6, params.style.strokeWidth * 0.92), angle: 0, depth: 0 });
  }
}

function buildArmTransform(params: SnowflakeParams, armIndex: number): { angle: number; mirror: number; scale: number } {
  const armRng = createSeededRandom(params.seed + armIndex * 4099 + 913);
  const asymmetry = params.variation.asymmetry;
  const angleDrift = signed(armRng) * asymmetry * radians(9);
  const scale = 1 + signed(armRng) * asymmetry * 0.16;
  const angle = radians(params.symmetry.rotationOffset) - Math.PI / 2 + (armIndex * TAU) / params.symmetry.arms + angleDrift;
  const mirror = params.symmetry.alternateMirror && armIndex % 2 === 1 ? -1 : 1;
  return { angle, mirror, scale };
}

function transformPoint(
  x: number,
  y: number,
  center: Point,
  transform: { angle: number; mirror: number; scale: number },
): Point {
  const localY = y * transform.mirror;
  const localX = x * transform.scale;
  const cos = Math.cos(transform.angle);
  const sin = Math.sin(transform.angle);
  return {
    x: center.x + localX * cos - localY * sin,
    y: center.y + localX * sin + localY * cos,
  };
}

function buildPathLayers(params: SnowflakeParams, layerCommands: Map<number, string[]>): SnowflakePathLayer[] {
  return Array.from(layerCommands.entries())
    .sort(([a], [b]) => b - a)
    .map(([depth, commands]) => {
      const widthDecay = Math.pow(params.fractal.widthDecay, depth);
      const taper = 1 - params.style.taper * depth * 0.09;
      const strokeWidth = Math.max(0.25, params.style.strokeWidth * widthDecay * taper);
      const strokeOpacity = params.style.strokeOpacity * (depth === 0 ? 1 : Math.max(0.35, 0.93 - depth * 0.105));
      return {
        id: `depth-${depth}`,
        d: commands.join(' '),
        strokeWidth,
        strokeOpacity,
      };
    });
}

function buildRingShapes(params: SnowflakeParams, center: Point): SnowflakeShapePath[] {
  const shapes: SnowflakeShapePath[] = [];
  const rotation = radians(params.symmetry.rotationOffset) - Math.PI / 2;

  if (params.motifs.plates) {
    const circularPlates = params.motifs.ringStyle === 'circleRing';
    const allPlateRadii = circularPlates
      ? [0.28, 0.46, 0.66, 0.84]
      : params.family === 'hexPlate'
        ? [0.28, 0.44, 0.62, 0.86]
        : [0.26, 0.42, 0.62, 0.82];
    const plateCount = resolveProgressivePlateCount(params, allPlateRadii.length);
    const plateRadii = allPlateRadii.slice(0, plateCount);
    for (const t of plateRadii) {
      const radius = params.geometry.centerRadius + (params.geometry.radius - params.geometry.centerRadius) * t;
      const platePath = circularPlates
        ? circlePath(center, radius)
        : regularPolygonPath(center, params.symmetry.arms, radius, rotation);
      shapes.push({
        id: `plate-${t}`,
        d: platePath,
        fill: params.style.strokeColor,
        stroke: params.style.strokeColor,
        strokeWidth: Math.max(0.4, params.style.strokeWidth * (circularPlates ? 0.12 : 0.18)),
        opacity: circularPlates
          ? 0.025 + params.style.strokeOpacity * (0.035 + t * 0.045)
          : 0.035 + params.style.strokeOpacity * 0.065,
      });
    }
  }

  if (params.motifs.ringStyle === 'spokeConnector') {
    const t = params.motifs.rings > 1 ? 0.56 : 0.42;
    const radius = params.geometry.centerRadius + (params.geometry.radius - params.geometry.centerRadius) * t;
    const commands = Array.from({ length: params.symmetry.arms }, (_, armIndex) => {
      const inner = polar(center, rotation + (armIndex * TAU) / params.symmetry.arms, params.geometry.centerRadius * 1.25);
      const outer = polar(center, rotation + (armIndex * TAU) / params.symmetry.arms, radius);
      return `M ${formatNumber(inner.x)} ${formatNumber(inner.y)} L ${formatNumber(outer.x)} ${formatNumber(outer.y)}`;
    }).join(' ');
    shapes.push({
      id: 'spoke-connectors',
      d: commands,
      fill: 'none',
      stroke: params.style.strokeColor,
      strokeWidth: Math.max(0.45, params.style.strokeWidth * 0.22),
      opacity: params.style.strokeOpacity * 0.22,
    });
  }

  for (let index = 0; index < params.motifs.rings; index += 1) {
    const ringPosition = resolveRingPosition(params, index);
    const radius = params.geometry.centerRadius + (params.geometry.radius - params.geometry.centerRadius) * ringPosition;
    const d = params.motifs.ringStyle === 'circleRing'
      ? circlePath(center, radius)
      : params.motifs.ringStyle === 'midHexRing' && index === 0
        ? regularPolygonPath(center, params.symmetry.arms, radius * 0.74, rotation)
        : regularPolygonPath(center, params.symmetry.arms, radius, rotation);
    shapes.push({
      id: `ring-${index}`,
      d,
      fill: 'none',
      stroke: params.style.strokeColor,
      strokeWidth: Math.max(0.45, params.style.strokeWidth * (0.18 + index * 0.03)),
      opacity: params.style.strokeOpacity * (params.motifs.ringStyle === 'circleRing' ? 0.3 : 0.24 - index * 0.015),
    });
  }

  return shapes;
}

function resolveProgressivePlateCount(params: SnowflakeParams, maxCount: number): number {
  if (!params.motifs.plates) return 0;
  if (params.family === 'hexPlate' && params.motifs.rings <= 2) return maxCount;
  return clamp(Math.max(0, params.motifs.rings - 2), 0, maxCount);
}

function buildCenterShapes(params: SnowflakeParams, center: Point): SnowflakeShapePath[] {
  if (params.motifs.center === 'none') return [];

  const radius = Math.max(2, params.geometry.centerRadius);
  const fill = params.motifs.hollowCenter ? params.style.backgroundColor : params.style.strokeColor;
  const strokeWidth = Math.max(0.55, params.style.strokeWidth * 0.42);
  const common = {
    fill,
    stroke: params.style.strokeColor,
    strokeWidth,
    opacity: params.style.strokeOpacity * 0.92,
  };

  if (params.motifs.center === 'dot') {
    return [{ id: 'center-dot', d: circlePath(center, radius * 0.48), ...common }];
  }

  if (params.motifs.center === 'circle') {
    return [{
      id: 'center-circle',
      d: circlePath(center, radius),
      fill: params.motifs.hollowCenter ? params.style.backgroundColor : 'none',
      stroke: params.style.strokeColor,
      strokeWidth,
      opacity: params.style.strokeOpacity * 0.95,
    }];
  }

  if (params.motifs.center === 'star') {
    return [{
      id: 'center-star',
      d: starPath(center, Math.max(5, params.symmetry.arms), radius * 1.15, radius * 0.46, -Math.PI / 2),
      ...common,
    }];
  }

  if (params.motifs.center === 'sixPointStar') {
    return [{
      id: 'center-six-star',
      d: starPath(center, 6, radius * 1.25, radius * 0.5, -Math.PI / 2),
      ...common,
    }];
  }

  if (params.motifs.center === 'smallSpokes') {
    return [{
      id: 'center-spokes',
      d: Array.from({ length: params.symmetry.arms }, (_, index) => {
        const angle = -Math.PI / 2 + (index * TAU) / params.symmetry.arms;
        const inner = polar(center, angle, radius * 0.25);
        const outer = polar(center, angle, radius * 1.45);
        return `M ${formatNumber(inner.x)} ${formatNumber(inner.y)} L ${formatNumber(outer.x)} ${formatNumber(outer.y)}`;
      }).join(' '),
      fill: 'none',
      stroke: params.style.strokeColor,
      strokeWidth: Math.max(0.8, params.style.strokeWidth * 0.52),
      opacity: params.style.strokeOpacity * 0.9,
    }];
  }

  if (params.motifs.center === 'ringedHexagon') {
    return [
      {
        id: 'center-ringed-outer',
        d: regularPolygonPath(center, Math.max(6, params.symmetry.arms), radius * 1.25, -Math.PI / 2),
        fill: 'none',
        stroke: params.style.strokeColor,
        strokeWidth,
        opacity: params.style.strokeOpacity * 0.76,
      },
      {
        id: 'center-ringed-inner',
        d: regularPolygonPath(center, Math.max(6, params.symmetry.arms), radius * 0.62, Math.PI / 6),
        ...common,
      },
    ];
  }

  if (params.motifs.center === 'crystalCluster') {
    const cluster = [
      circlePath(center, radius * 0.38),
      regularPolygonPath(center, 6, radius * 0.92, -Math.PI / 2),
      starPath(center, 6, radius * 1.35, radius * 0.62, Math.PI / 6),
    ].join(' ');
    return [{
      id: 'center-cluster',
      d: cluster,
      ...common,
      opacity: params.style.strokeOpacity * 0.72,
    }];
  }

  return [{
    id: 'center-hexagon',
    d: regularPolygonPath(center, Math.max(3, params.symmetry.arms), radius, -Math.PI / 2),
    ...common,
  }];
}

function resolveRingPosition(params: SnowflakeParams, index: number): number {
  if (params.motifs.ringStyle === 'innerHexRing') return 0.26 + index * 0.18;
  if (params.motifs.ringStyle === 'midHexRing') return 0.44 + index * 0.16;
  if (params.motifs.ringStyle === 'doubleHexRing') return [0.32, 0.62, 0.78, 0.9][index] ?? (0.3 + index * 0.16);
  if (params.motifs.ringStyle === 'circleRing') return [0.3, 0.5, 0.7, 0.86][index] ?? (0.26 + index * 0.16);
  return 0.2 + ((index + 1) / (params.motifs.rings + 1)) * 0.68;
}

function buildNodeShapes(params: SnowflakeParams, arm: LocalArm, center: Point): SnowflakeShapePath[] {
  if (params.motifs.sideNodes === 'none' || arm.nodes.length === 0) return [];

  const commands: string[] = [];
  for (let armIndex = 0; armIndex < params.symmetry.arms; armIndex += 1) {
    const transform = buildArmTransform(params, armIndex);
    for (const node of arm.nodes) {
      const point = transformPoint(node.x, node.y, center, transform);
      if (params.motifs.sideNodes === 'diamonds') {
        commands.push(regularPolygonPath(point, 4, node.radius * 1.2, transform.angle + node.angle + Math.PI / 4));
      } else if (params.motifs.sideNodes === 'plates') {
        commands.push(regularPolygonPath(point, Math.max(5, params.symmetry.arms), node.radius * 1.4, transform.angle + Math.PI / 6));
      } else if (params.motifs.sideNodes === 'tinyStars') {
        commands.push(starPath(point, 5, node.radius * 1.5, node.radius * 0.58, transform.angle - Math.PI / 2));
      } else {
        commands.push(circlePath(point, node.radius));
      }
    }
  }

  return [{
    id: 'side-nodes',
    d: commands.join(' '),
    fill: params.style.strokeColor,
    stroke: params.style.strokeColor,
    strokeWidth: Math.max(0.25, params.style.strokeWidth * 0.12),
    opacity: params.style.strokeOpacity * 0.58,
  }];
}

function buildTipShapes(params: SnowflakeParams, center: Point): SnowflakeShapePath[] {
  const tipStyle = resolveTipStyle(params);
  if (tipStyle !== 'star' && tipStyle !== 'smallStar') return [];

  const commands: string[] = [];
  for (let armIndex = 0; armIndex < params.symmetry.arms; armIndex += 1) {
    const transform = buildArmTransform(params, armIndex);
    const point = transformPoint(params.geometry.radius, 0, center, transform);
    const outer = Math.max(4, params.style.strokeWidth * (tipStyle === 'smallStar' ? 1.15 : 1.45));
    commands.push(starPath(point, 5, outer, outer * 0.42, transform.angle - Math.PI / 2));
  }

  return [{
    id: 'tip-stars',
    d: commands.join(' '),
    fill: params.style.strokeColor,
    stroke: params.style.strokeColor,
    strokeWidth: Math.max(0.3, params.style.strokeWidth * 0.16),
    opacity: params.style.strokeOpacity * 0.82,
  }];
}

function renderPathLayer(
  params: SnowflakeParams,
  layer: SnowflakePathLayer,
  cap: SnowflakeLineCap,
  join: SnowflakeLineJoin,
  frostLayer: boolean,
): string {
  const frostOpacity = clamp01(params.style.glow);
  const strokeWidth = frostLayer ? layer.strokeWidth + frostOpacity * 4.8 : layer.strokeWidth;
  const opacity = frostLayer
    ? layer.strokeOpacity * (0.035 + frostOpacity * 0.18)
    : layer.strokeOpacity;
  return `<path d="${layer.d}" fill="none" stroke="${escapeAttribute(params.style.strokeColor)}" stroke-width="${formatNumber(strokeWidth)}" stroke-opacity="${formatNumber(opacity)}" stroke-linecap="${cap}" stroke-linejoin="${join}"/>`;
}

function renderShapePath(shape: SnowflakeShapePath): string {
  const fillRule = shape.fillRule ? ` fill-rule="${shape.fillRule}"` : '';
  return `<path d="${shape.d}" fill="${escapeAttribute(shape.fill)}" stroke="${escapeAttribute(shape.stroke)}" stroke-width="${formatNumber(shape.strokeWidth)}" opacity="${formatNumber(shape.opacity)}"${fillRule}/>`;
}

function resolveLineCap(params: SnowflakeParams): SnowflakeLineCap {
  if (params.style.sharpness > 0.72) return 'butt';
  if (params.style.sharpness < 0.28) return 'round';
  return params.style.lineCap;
}

function resolveLineJoin(params: SnowflakeParams): SnowflakeLineJoin {
  if (params.style.sharpness > 0.72) return 'miter';
  if (params.style.sharpness < 0.28) return 'round';
  return params.style.lineJoin;
}

function resolveTipStyle(params: SnowflakeParams): SnowflakeTipMotif {
  return params.motifs.tips === 'point' ? params.geometry.tipStyle : params.motifs.tips;
}

function getBranchStations(params: SnowflakeParams): number[] {
  const template = STATION_TEMPLATES[params.branching.stationTemplate] ?? STATION_TEMPLATES.balanced;
  const slots = Math.max(0, params.branching.slots);
  const selected = slots === 0 ? [] : resampleStations(template, slots);
  const start = Math.min(params.branching.branchStart, params.branching.branchEnd - 0.05);
  const end = Math.max(params.branching.branchEnd, start + 0.05);
  const stations = selected
    .map((station) => clamp(station, start, end))
    .filter((station, index, list) => index === 0 || Math.abs(station - list[index - 1]!) > 0.035);

  if (params.branching.guaranteedInnerBranches && slots > 0 && !stations.some((station) => station < 0.34)) {
    stations.unshift(clamp(0.18, start, end), clamp(0.3, start, end));
  }

  return stations.sort((a, b) => a - b);
}

function resampleStations(template: number[], slots: number): number[] {
  if (slots === template.length) return [...template];
  if (slots < template.length) {
    return Array.from({ length: slots }, (_, index) => {
      const sourceIndex = Math.round((index / Math.max(1, slots - 1)) * (template.length - 1));
      return template[sourceIndex]!;
    });
  }

  return Array.from({ length: slots }, (_, index) => {
    const t = index / Math.max(1, slots - 1);
    const scaled = t * (template.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(template.length - 1, left + 1);
    const local = scaled - left;
    return template[left]! + (template[right]! - template[left]!) * local;
  });
}

function chooseQuantizedAngle(params: SnowflakeParams, rng: RandomFn, slot: number): number {
  const target = params.branching.angle;
  const sorted = [...QUANTIZED_ANGLES].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  const base = sorted[Math.min(sorted.length - 1, Math.floor(rng() * Math.min(3, sorted.length)))] ?? 45;
  const familyBias = params.family === 'thinSharpCrystal'
    ? -6
    : params.family === 'hexPlate' || params.family === 'stellarPlate'
      ? 6
      : params.family === 'fernDendrite'
        ? 3
        : 0;
  const jitter = signed(rng) * Math.min(params.branching.angleJitter, 8) * (0.35 + params.variation.angleNoise * 0.45);
  return clamp(base + familyBias + jitter + (slot % 2 === 0 ? 0 : signed(rng) * 2), 12, 78);
}

function silhouetteEnvelope(t: number, params: SnowflakeParams): number {
  const clamped = clamp01(t);
  const type = params.geometry.silhouette;
  if (type === 'round') return 0.32 + 0.82 * Math.sin(Math.PI * clamped);
  if (type === 'spiky') return 0.18 + 0.96 * Math.pow(clamped, 1.35);
  if (type === 'compact') return 0.54 + 0.34 * Math.sin(Math.PI * clamped);
  if (type === 'fern') return 0.22 + 0.82 * clamped;
  if (type === 'plate') return 0.35 + 0.08 * Math.sin(Math.PI * clamped);
  return 0.28 + 0.52 * Math.sin(Math.PI * clamped) + 0.34 * Math.pow(clamped, 1.6);
}

function branchLengthEnvelope(t: number, params: SnowflakeParams): number {
  const base = silhouetteEnvelope(t, params);
  if (!isDendriteFamily(params)) return base;

  const innerLobe = Math.exp(-Math.pow((t - 0.24) / 0.18, 2));
  const midLobe = Math.exp(-Math.pow((t - 0.46) / 0.22, 2));
  const familyScale = params.family === 'denseFractal'
    ? 0.32
    : params.family === 'fernDendrite'
      ? 0.28
      : 0.2;

  return clamp(base + innerLobe * familyScale + midLobe * familyScale * 0.45, 0.24, 1.34);
}

function innerDendritePatternScale(params: SnowflakeParams, station: number): number {
  if (!isDendriteFamily(params)) return 1;
  const innerLobe = Math.exp(-Math.pow((station - 0.24) / 0.2, 2));
  const midLobe = Math.exp(-Math.pow((station - 0.48) / 0.22, 2));
  const scale = params.family === 'classicDendrite' ? 0.24 : params.family === 'fernDendrite' ? 0.38 : 0.45;
  return clamp(1 + innerLobe * scale + midLobe * scale * 0.42, 1, 1.52);
}

function isDendriteFamily(params: SnowflakeParams): boolean {
  return params.family === 'classicDendrite' || params.family === 'fernDendrite' || params.family === 'denseFractal';
}

function chooseBranchMotif(params: SnowflakeParams, rng: RandomFn, slot: number): SnowflakeBranchMotif {
  const primary = params.branching.branchMotif;
  if (params.family === 'classicDendrite') return slot % 2 === 0 ? 'chevron' : 'shortBar';
  if (params.family === 'stellarPlate') return slot % 2 === 0 ? 'shortBar' : 'chevron';
  if (params.family === 'hexPlate') return slot % 2 === 0 ? 'shortBar' : 'chevron';
  if (params.family === 'ornamentalIcon') return slot % 2 === 0 ? primary : 'doubleChevron';
  if (params.family === 'ringedCrystal') return slot % 2 === 0 ? 'doubleChevron' : 'chevron';
  if (params.family === 'fernDendrite') return rng() < 0.62 ? 'comb' : 'miniDendrite';
  if (params.family === 'denseFractal') return rng() < 0.7 ? 'miniDendrite' : 'fork';
  if (params.family === 'simpleSpoke' || params.family === 'roundedIcon') return slot % 2 === 0 ? primary : 'shortBar';
  return rng() < 0.72 ? primary : 'chevron';
}

function interpolateMainPoint(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(points.length - 1, index + 1);
  const localT = scaled - index;
  const a = points[index]!;
  const b = points[nextIndex]!;
  return {
    x: a.x + (b.x - a.x) * localT,
    y: a.y + (b.y - a.y) * localT,
  };
}

function regularPolygonPath(center: Point, sides: number, radius: number, rotation: number): string {
  const count = Math.max(3, Math.round(sides));
  const commands: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rotation + (index * TAU) / count;
    const point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    commands.push(`${index === 0 ? 'M' : 'L'} ${formatNumber(point.x)} ${formatNumber(point.y)}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

function starPath(center: Point, points: number, outerRadius: number, innerRadius: number, rotation: number): string {
  const count = Math.max(3, Math.round(points)) * 2;
  const commands: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rotation + (index * TAU) / count;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    commands.push(`${index === 0 ? 'M' : 'L'} ${formatNumber(point.x)} ${formatNumber(point.y)}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

function circlePath(center: Point, radius: number): string {
  const r = Math.max(0.1, radius);
  return `M ${formatNumber(center.x - r)} ${formatNumber(center.y)} A ${formatNumber(r)} ${formatNumber(r)} 0 1 0 ${formatNumber(center.x + r)} ${formatNumber(center.y)} A ${formatNumber(r)} ${formatNumber(r)} 0 1 0 ${formatNumber(center.x - r)} ${formatNumber(center.y)} Z`;
}

function polar(center: Point, angle: number, radius: number): Point {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function signed(rng: RandomFn): number {
  return rng() * 2 - 1;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
