import type { PresetEntry, PresetLevel, PresetVersion } from './types';
import { PARAM_REGISTRY } from './ParamRegistry';
import {
  EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY,
} from './euclideanPatternBank';
import {
  isLead4opFMPresetData,
  isLegacyLead4opFMPresetData,
  LEAD4OPFM_PRESET_SCOPE,
} from './lead4opPresetPayload';
import {
  canonicalizePresetScope,
  EQUALIZER_SCOPE,
  SATURATOR_SCOPE,
} from './presetScopeAliases';

export const CURRENT_PRESET_SCHEMA = 'preset-entry-v2';

export class UnsupportedPresetVersionError extends Error {
  readonly code = 'UNSUPPORTED_PRESET_VERSION';
  readonly schema = CURRENT_PRESET_SCHEMA;

  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedPresetVersionError';
  }
}

const PRESET_LEVELS = new Set<PresetLevel>(['engine', 'kit', 'source', 'state', 'journey']);
const AUTHORS = new Set<PresetEntry['author']>(['factory', 'user', 'cloud']);
const CURRENT_PARAMETER_KEYS = new Set([
  ...Object.keys(PARAM_REGISTRY),
  // The lane preset editor stores one canonical, lane-relative payload rather
  // than leaking the backing `synthEuclidN*`/`drumEuclidN*` state keys into
  // every engine preset. These are current contract keys, not migration
  // aliases.
  'euclideanPatternEnabled',
  'euclideanPatternPreset',
  'euclideanPatternSteps',
  'euclideanPatternHits',
  'euclideanPatternRotation',
  'euclideanPatternNoteMin',
  'euclideanPatternNoteMax',
  'euclideanPatternVoiceMask',
  EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_SOURCE_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY,
]);
const CURRENT_SPECIAL_DATA_KEYS = new Set([
  'format',
  'formatVersion',
  'controls',
  'qualityMode',
  'seed',
  'renderer',
  'assignments',
  'lead1PresetAData',
  'lead1PresetBData',
  'lead2PresetCData',
  'lead2PresetDData',
]);
const CURRENT_JOURNEY_DATA_KEYS = new Set([
  'formatVersion',
  'name',
  'autoAdvance',
  'loopEnabled',
  'nodes',
  'connections',
]);
const CURRENT_COMPONENT_DATA_KEYS = new Map<string, ReadonlySet<string>>([
  [EQUALIZER_SCOPE, new Set([
    'inputGain', 'outputGain', 'mix',
    'lowType', 'lowFreq', 'lowGain', 'lowQ', 'lowSlope',
    'midFreq', 'midGain', 'midQ',
    'highType', 'highFreq', 'highGain', 'highQ', 'highSlope',
  ])],
  [SATURATOR_SCOPE, new Set(['mode', 'quality', 'drive', 'tone', 'bias'])],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fail(path: string, message: string): never {
  throw new UnsupportedPresetVersionError(`Unsupported current preset entry at ${path}: ${message}`);
}

function validateJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    fail(path, 'number must be finite');
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => validateJsonValue(child, `${path}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) validateJsonValue(child, `${path}.${key}`);
    return;
  }
  fail(path, 'value must be JSON-compatible');
}

function validateVersionData(value: Record<string, unknown>, index: number, type: PresetLevel, scope?: string): void {
  if (type === 'engine' && scope === LEAD4OPFM_PRESET_SCOPE) {
    if (!isLead4opFMPresetData(value) && !isLegacyLead4opFMPresetData(value)) {
      fail(
        `versions[${index}].data`,
        'Lead4opFM data must use the current allowlisted lead4opfm preset envelope or a supported legacy payload',
      );
    }
    return;
  }

  const isJourneyData = type === 'journey';
  const componentDataKeys = type === 'engine'
    ? CURRENT_COMPONENT_DATA_KEYS.get(canonicalizePresetScope(scope) ?? '')
    : undefined;
  for (const [key, child] of Object.entries(value)) {
    const allowed = isJourneyData
      ? CURRENT_JOURNEY_DATA_KEYS.has(key)
      : CURRENT_PARAMETER_KEYS.has(key) || CURRENT_SPECIAL_DATA_KEYS.has(key) || componentDataKeys?.has(key) === true;
    if (!allowed) {
      fail(`versions[${index}].data.${key}`, 'key is not part of the current preset contract');
    }
    validateJsonValue(child, `versions[${index}].data.${key}`);
  }

  if (isJourneyData) {
    if (value.formatVersion !== 1 || typeof value.name !== 'string' ||
        typeof value.autoAdvance !== 'boolean' || typeof value.loopEnabled !== 'boolean' ||
        !Array.isArray(value.nodes) || !Array.isArray(value.connections)) {
      fail(`versions[${index}].data`, 'journey data does not match the current format');
    }
  }
  if (type === 'source' && scope === 'visualizer') {
    const transportAssignments = Array.isArray(value.assignments) ? value.assignments : null;
    const isTransportVisualizer = value.formatVersion === 3
      && value.renderer === 'transport'
      && isRecord(value.controls)
      && transportAssignments !== null
      && (value.qualityMode === 'auto' || value.qualityMode === 'mobileSafe' || value.qualityMode === 'desktopBeauty')
      && isFiniteNumber(value.seed);
    if (value.format !== 'kessho-visualizer-preset' || !isTransportVisualizer) {
      fail(`versions[${index}].data`, 'visualizer data does not match the current format');
    }
    if (isTransportVisualizer && transportAssignments) {
      for (const [assignmentIndex, assignment] of transportAssignments.entries()) {
        if (!isRecord(assignment)
            || typeof assignment.id !== 'string'
            || typeof assignment.source !== 'string'
            || typeof assignment.signal !== 'string'
            || typeof assignment.target !== 'string'
            || !isFiniteNumber(assignment.amount)
            || (assignment.polarity !== 'unipolar' && assignment.polarity !== 'bipolar')
            || typeof assignment.enabled !== 'boolean') {
          fail(`versions[${index}].data.assignments[${assignmentIndex}]`, 'Transport assignment is invalid');
        }
      }
    }
  }
}

function validateParameterBehaviorMetadata(value: Record<string, unknown>, index: number): void {
  if (value.sliderModes !== undefined) {
    if (!isRecord(value.sliderModes)) fail(`versions[${index}].sliderModes`, 'slider modes must be an object');
    for (const [key, mode] of Object.entries(value.sliderModes)) {
      if (mode !== 'single' && mode !== 'walk' && mode !== 'sampleHold' && mode !== 'shape') {
        fail(`versions[${index}].sliderModes.${key}`, 'slider mode is invalid');
      }
    }
  }
  if (value.dualRanges !== undefined) {
    if (!isRecord(value.dualRanges)) fail(`versions[${index}].dualRanges`, 'dual ranges must be an object');
    for (const [key, range] of Object.entries(value.dualRanges)) {
      if (!isRecord(range) || !isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
        fail(`versions[${index}].dualRanges.${key}`, 'dual range must contain finite min and max');
      }
    }
  }
  if (value.dualSliderConfigs === undefined) return;
  if (!isRecord(value.dualSliderConfigs)) fail(`versions[${index}].dualSliderConfigs`, 'canonical configs must be an object');
  for (const [key, rawConfig] of Object.entries(value.dualSliderConfigs)) {
    if (!isRecord(rawConfig) || (rawConfig.source !== 'a' && rawConfig.source !== 'b')) {
      fail(`versions[${index}].dualSliderConfigs.${key}.source`, 'canonical source must be a or b');
    }
    if (!Array.isArray(rawConfig.range) || rawConfig.range.length !== 2
        || !isFiniteNumber(rawConfig.range[0]) || !isFiniteNumber(rawConfig.range[1])) {
      fail(`versions[${index}].dualSliderConfigs.${key}.range`, 'canonical range must contain two finite values');
    }
  }
}

function validateVersion(value: unknown, index: number, type: PresetLevel, scope?: string): asserts value is PresetVersion {
  if (!isRecord(value)) fail(`versions[${index}]`, 'version must be an object');
  if (!isFiniteInteger(value.v) || value.v < 1) fail(`versions[${index}].v`, 'version number must be a positive integer');
  if (typeof value.note !== 'string') fail(`versions[${index}].note`, 'note must be a string');
  if (!isFiniteNumber(value.timestamp)) fail(`versions[${index}].timestamp`, 'timestamp must be finite');
  if (!isRecord(value.data)) fail(`versions[${index}].data`, 'data must be an object');
  validateVersionData(value.data, index, type, scope);
  validateParameterBehaviorMetadata(value, index);
  if (value._isDelta !== undefined && typeof value._isDelta !== 'boolean') {
    fail(`versions[${index}]._isDelta`, 'delta marker must be boolean');
  }
  if (value.id !== undefined && typeof value.id !== 'string') fail(`versions[${index}].id`, 'id must be a string');
  if (value.refs !== undefined && !isRecord(value.refs)) fail(`versions[${index}].refs`, 'refs must be an object');
}

/**
 * Decode only the current storage contract. This function intentionally does
 * not add defaults, canonicalize aliases, synthesize ids, or repair versions.
 */
export function decodeCurrentPresetEntry(input: unknown): PresetEntry {
  if (!isRecord(input)) fail('$', 'entry must be an object');
  if (!PRESET_LEVELS.has(input.type as PresetLevel)) fail('type', 'unknown preset level');
  if (typeof input.name !== 'string' || input.name.trim() === '') fail('name', 'name must be a non-empty string');
  if (!AUTHORS.has(input.author as PresetEntry['author'])) fail('author', 'author must be factory, user, or cloud');
  if (!Array.isArray(input.versions) || input.versions.length === 0) fail('versions', 'at least one version is required');

  const entryScope = typeof input.scope === 'string'
    ? input.scope
    : input.type === 'engine' && typeof input.engine === 'string'
      ? input.engine
      : input.type !== 'engine' && typeof input.source === 'string'
        ? input.source
        : undefined;
  input.versions.forEach((version, index) => validateVersion(version, index, input.type as PresetLevel, entryScope));
  const versionNumbers = new Set<number>();
  for (const [index, version] of input.versions.entries()) {
    if (versionNumbers.has(version.v)) fail(`versions[${index}].v`, 'version numbers must be unique');
    versionNumbers.add(version.v);
    if (index > 0 && input.versions[index - 1]!.v >= version.v) {
      fail('versions', 'versions must be sorted in ascending order');
    }
  }

  if (!isFiniteInteger(input.currentVersion) || !versionNumbers.has(input.currentVersion)) {
    fail('currentVersion', 'currentVersion must select an existing version');
  }
  if (!isFiniteNumber(input.createdAt) || !isFiniteNumber(input.updatedAt)) {
    fail('timestamps', 'createdAt and updatedAt must be finite numbers');
  }

  for (const key of ['id', 'scope', 'engine', 'source', 'creator', 'description', 'familyId', 'familyName', 'variantId', 'variantName', 'remoteId'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'string') fail(key, 'value must be a string');
    if ((key === 'scope' || key === 'engine' || key === 'source') &&
        typeof input[key] === 'string' && canonicalizePresetScope(input[key]) !== input[key]) {
      fail(key, 'legacy preset scope aliases are not accepted by the current schema');
    }
  }
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string'))) {
    fail('tags', 'tags must be an array of strings');
  }
  if (input.library !== undefined && !['stock', 'user', 'cloud'].includes(String(input.library))) {
    fail('library', 'library is not supported by the current schema');
  }
  if (input.visibility !== undefined && !['private', 'public', 'featured'].includes(String(input.visibility))) {
    fail('visibility', 'visibility is not supported by the current schema');
  }

  return input as unknown as PresetEntry;
}

export function isCurrentPresetEntry(input: unknown): input is PresetEntry {
  try {
    decodeCurrentPresetEntry(input);
    return true;
  } catch (error) {
    if (error instanceof UnsupportedPresetVersionError) return false;
    throw error;
  }
}
