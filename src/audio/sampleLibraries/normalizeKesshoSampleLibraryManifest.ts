import {
  SAMPLE_DYNAMIC_KEYS,
  isSampleDynamicKey,
  isSampleLibraryKey,
  type NormalizedSampleDescriptor,
  type NormalizedSampleLibraryManifest,
  type NormalizedSampleLoop,
  type SampleDynamicKey,
  type SampleLibraryKey,
} from './SampleLibraryTypes';

type RawMapping = {
  rootNote?: unknown;
  loNote?: unknown;
  hiNote?: unknown;
  loVel?: unknown;
  hiVel?: unknown;
  loopEnabled?: unknown;
  loopStartFrame?: unknown;
  loopEndFrame?: unknown;
  loopCrossfadeFrames?: unknown;
};

type RawSample = {
  assetId?: unknown;
  key?: unknown;
  path?: unknown;
  role?: unknown;
  articulation?: unknown;
  dynamic?: unknown;
  velocityRange?: unknown;
  rootMidi?: unknown;
  loop?: unknown;
  sourceInfo?: {
    sampleRate?: unknown;
  };
  encodedInfo?: {
    sampleRate?: unknown;
  };
  decentSamplerMappings?: unknown;
};

type RawKesshoSampleLibraryManifest = {
  schema?: unknown;
  library?: {
    key?: unknown;
    name?: unknown;
  };
  assetBasePath?: unknown;
  assetIdBase?: unknown;
  encoding?: {
    sampleRate?: unknown;
  };
  samples?: unknown;
};

const DYNAMIC_VELOCITY_RANGES: Readonly<Record<SampleDynamicKey, readonly [number, number]>> = {
  regular: [0, 127],
  short: [0, 127],
  quiet: [0, 31],
  pp: [0, 39],
  mp: [40, 74],
  mf: [75, 104],
  ff: [105, 127],
  'level-1': [0, 31],
  'level-2': [32, 63],
  'level-3': [64, 95],
  'level-4': [96, 127],
  single: [0, 127],
  piano: [0, 84],
  forte: [85, 127],
  'strum-2': [0, 42],
  'strum-3': [43, 84],
  'strum-4': [85, 127],
  normal: [0, 127],
  wicked: [0, 127],
  'velocity-1': [85, 127],
  'velocity-2': [43, 84],
  'velocity-3': [0, 42],
};

function assertRecord(value: unknown, label: string): asserts value is RawKesshoSampleLibraryManifest {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampMidi(value: number): number {
  return clampInt(value, 0, 127);
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeDynamic(value: unknown): SampleDynamicKey {
  const dynamic = cleanString(value, 'single').toLowerCase();
  if (isSampleDynamicKey(dynamic)) return dynamic;
  return 'single';
}

function firstMapping(sample: RawSample): RawMapping | null {
  if (!Array.isArray(sample.decentSamplerMappings)) return null;
  const mapping = sample.decentSamplerMappings.find((candidate) => (
    candidate !== null && typeof candidate === 'object'
  ));
  return mapping ? mapping as RawMapping : null;
}

function velocityRangeFromSample(sample: RawSample, dynamic: SampleDynamicKey, mapping: RawMapping | null): readonly [number, number] {
  if (Array.isArray(sample.velocityRange) && sample.velocityRange.length >= 2) {
    const low = integer(sample.velocityRange[0]);
    const high = integer(sample.velocityRange[1]);
    if (low !== null && high !== null) {
      return [clampInt(Math.min(low, high), 0, 127), clampInt(Math.max(low, high), 0, 127)];
    }
  }

  const loVel = integer(mapping?.loVel);
  const hiVel = integer(mapping?.hiVel);
  if (loVel !== null || hiVel !== null) {
    return [
      clampInt(loVel ?? 0, 0, 127),
      clampInt(hiVel ?? 127, 0, 127),
    ];
  }

  return DYNAMIC_VELOCITY_RANGES[dynamic];
}

function loopFromSample(
  sample: RawSample,
  mapping: RawMapping | null,
  sourceSampleRate: number,
  encodedSampleRate: number,
): NormalizedSampleLoop | null {
  const loopEnabled = sample.loop === true || mapping?.loopEnabled === true;
  if (!loopEnabled) return null;

  const sourceStartFrame = integer(mapping?.loopStartFrame);
  const sourceEndFrame = integer(mapping?.loopEndFrame);
  if (sourceStartFrame === null || sourceEndFrame === null || sourceEndFrame <= sourceStartFrame + 8) {
    return null;
  }

  const sourceCrossfadeFrames = Math.max(0, integer(mapping?.loopCrossfadeFrames) ?? 0);
  const encodedStartFrame = Math.round(sourceStartFrame * encodedSampleRate / sourceSampleRate);
  const encodedEndFrame = Math.round(sourceEndFrame * encodedSampleRate / sourceSampleRate);
  const crossfadeFrames = Math.round(sourceCrossfadeFrames * encodedSampleRate / sourceSampleRate);
  if (encodedEndFrame <= encodedStartFrame + 8) return null;

  return {
    sourceStartFrame,
    sourceEndFrame,
    sourceSampleRate,
    encodedSampleRate,
    encodedStartFrame,
    encodedEndFrame,
    crossfadeFrames,
  };
}

function chooseDefaultMidi(samples: readonly NormalizedSampleDescriptor[]): number {
  if (samples.length === 0) return 60;
  return [...samples]
    .sort((left, right) => Math.abs(left.rootMidi - 60) - Math.abs(right.rootMidi - 60) || left.rootMidi - right.rootMidi)[0]
    ?.rootMidi ?? 60;
}

function chooseRecommendedPreloadMidi(samples: readonly NormalizedSampleDescriptor[], defaultMidi: number): number[] {
  const roots = [...new Set(samples.map((sample) => sample.rootMidi))].sort((left, right) => left - right);
  const ordered = [
    defaultMidi,
    ...roots.filter((root) => root !== defaultMidi)
      .sort((left, right) => Math.abs(left - defaultMidi) - Math.abs(right - defaultMidi) || left - right),
  ];
  return ordered.slice(0, 8);
}

function compareSamples(left: NormalizedSampleDescriptor, right: NormalizedSampleDescriptor): number {
  return left.role.localeCompare(right.role) ||
    left.articulation.localeCompare(right.articulation) ||
    SAMPLE_DYNAMIC_KEYS.indexOf(left.dynamic) - SAMPLE_DYNAMIC_KEYS.indexOf(right.dynamic) ||
    left.rootMidi - right.rootMidi ||
    left.loMidi - right.loMidi ||
    left.hiMidi - right.hiMidi ||
    left.assetPath.localeCompare(right.assetPath) ||
    left.sampleId.localeCompare(right.sampleId);
}

export function normalizeKesshoSampleLibraryManifest(
  rawManifest: unknown,
): NormalizedSampleLibraryManifest {
  assertRecord(rawManifest, 'sample manifest');
  if (rawManifest.schema !== 'kessho-sample-library-v1') {
    throw new Error(`Unsupported sample manifest schema: ${String(rawManifest.schema)}`);
  }
  if (!isSampleLibraryKey(rawManifest.library?.key)) {
    throw new Error(`Unsupported sample library key: ${String(rawManifest.library?.key)}`);
  }
  if (!Array.isArray(rawManifest.samples)) {
    throw new Error(`${String(rawManifest.library.key)} manifest is missing samples`);
  }

  const libraryKey: SampleLibraryKey = rawManifest.library.key;
  const assetIdBase = integer(rawManifest.assetIdBase) ?? 0;
  const normalizedSamples: NormalizedSampleDescriptor[] = [];

  rawManifest.samples.forEach((rawSampleValue, index) => {
    if (rawSampleValue === null || typeof rawSampleValue !== 'object') return;
    const rawSample = rawSampleValue as RawSample;
    const mapping = firstMapping(rawSample);
    const rootMidiValue = integer(rawSample.rootMidi) ?? integer(mapping?.rootNote);
    if (rootMidiValue === null) return;

    const rootMidi = clampMidi(rootMidiValue);
    const loMidi = clampMidi(integer(mapping?.loNote) ?? rootMidi);
    const hiMidi = clampMidi(integer(mapping?.hiNote) ?? rootMidi);
    const dynamic = normalizeDynamic(rawSample.dynamic);
    const [velocityMin, velocityMax] = velocityRangeFromSample(rawSample, dynamic, mapping);
    const sourceSampleRate = Math.max(1, integer(rawSample.sourceInfo?.sampleRate) ?? 44100);
    const encodedSampleRate = Math.max(
      1,
      integer(rawSample.encodedInfo?.sampleRate) ??
        integer(rawManifest.encoding?.sampleRate) ??
        sourceSampleRate,
    );
    const assetId = integer(rawSample.assetId) ?? assetIdBase + index;
    const sampleId = cleanString(rawSample.key, `${libraryKey}:${assetId}`);
    const assetPath = cleanString(rawSample.path, '');
    if (assetPath.length === 0) return;

    normalizedSamples.push({
      sampleId,
      assetId,
      assetPath,
      rootMidi,
      loMidi: Math.min(loMidi, hiMidi),
      hiMidi: Math.max(loMidi, hiMidi),
      role: cleanString(rawSample.role, 'single'),
      articulation: cleanString(rawSample.articulation, ''),
      dynamic,
      velocityMin,
      velocityMax,
      loop: loopFromSample(rawSample, mapping, sourceSampleRate, encodedSampleRate),
    });
  });

  const samples = normalizedSamples.sort(compareSamples);
  const firstSample = samples[0];
  const defaultMidi = chooseDefaultMidi(samples);
  return {
    schema: 'kessho-normalized-sample-library-v1',
    libraryKey,
    displayName: cleanString(rawManifest.library.name, libraryKey),
    assetBasePath: cleanString(rawManifest.assetBasePath, 'samples'),
    sourceSampleRate: firstSample?.loop?.sourceSampleRate ?? 44100,
    encodedSampleRate: firstSample?.loop?.encodedSampleRate ?? integer(rawManifest.encoding?.sampleRate) ?? 24000,
    defaultRole: firstSample?.role ?? 'single',
    defaultArticulation: firstSample?.articulation ?? '',
    defaultDynamic: firstSample?.dynamic ?? 'single',
    defaultMidi,
    recommendedPreloadMidi: chooseRecommendedPreloadMidi(samples, defaultMidi),
    samples,
  };
}
