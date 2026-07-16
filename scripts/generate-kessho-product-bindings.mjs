import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const schemaDir = resolve(root, 'cpp/KesshoCore/schema');
const schemaPath = resolve(schemaDir, 'kessho_product.schema.json');
const paramsPath = resolve(schemaDir, 'kessho_product_params.schema.json');
const eventsPath = resolve(schemaDir, 'kessho_product_events.schema.json');
const drumParamsPath = resolve(schemaDir, 'kessho_product_drum_params.schema.json');
const productWorkletSourcePath = resolve(
  root,
  'cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js',
);
const productWorkletOutputPath = resolve(
  root,
  'public/worklets/kessho-core-product.worklet.js',
);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeGenerated(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const productWorkletEventNames = [
  'SetParam',
  'SetTransport',
  'Start',
  'Stop',
  'ResetTransport',
  'SetSequencerStep',
  'SetSequencerLane',
  'SetSourceEnabled',
  'SetSourcePreset',
  'SetJourneyState',
  'ManualNoteOn',
  'ManualNoteOff',
  'MidiEvent',
  'TriggerDrumVoice',
  'StartJourneyMorphClock',
  'StopJourneyMorphClock',
  'SetHarmonyRoot',
  'SetScale',
  'SetSeed',
  'ResetRng',
  'SetModulationRange',
  'ResetSequencerLaneHome',
  'DiceSequencerLane',
  'SetSourceOverride',
  'AnchorWalkerPerformance',
  'GeneratedSequencerCapture',
  'SetSynthArpConfig',
  'SetSynthArpStep',
  'CommitSynthArpPattern',
];

function applyProductBindings(source, schemaHashLiteral, events) {
  const schemaHashPattern = /const EXPECTED_PRODUCT_SCHEMA_HASH = 0x[0-9a-f]+;/;
  if (!schemaHashPattern.test(source)) {
    throw new Error('Product worklet schema hash constant was not found');
  }
  const eventIds = new Map(events.map((event) => [event.name, event.id]));
  const workletEvents = productWorkletEventNames.map((name) => {
    const id = eventIds.get(name);
    if (!Number.isInteger(id)) {
      throw new Error(`Product worklet event ${name} is missing from the event schema`);
    }
    return { name, id };
  });
  const eventIdsPattern = /const PRODUCT_EVENT_IDS = Object\.freeze\(\{[\s\S]*?\n\}\);/;
  if (!eventIdsPattern.test(source)) {
    throw new Error('Product worklet event id table was not found');
  }
  const generatedEventIds = `const PRODUCT_EVENT_IDS = Object.freeze({\n${workletEvents
    .map((event) => `  ${event.name}: ${event.id},`)
    .join('\n')}\n});`;
  return source
    .replace(
      schemaHashPattern,
    `const EXPECTED_PRODUCT_SCHEMA_HASH = ${schemaHashLiteral};`,
    )
    .replace(eventIdsPattern, generatedEventIds);
}

function upperSnake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function cppStringArray(name, values) {
  return `inline constexpr const char* ${name}[] = {\n${values.map((value) => `  "${value}"`).join(',\n')}\n};`;
}

function tsConstObject(name, rows, key = 'name') {
  return `export const ${name} = Object.freeze({\n${rows.map((row) => `  ${row[key]}: ${row.id}`).join(',\n')}\n} as const);\n`;
}

function numberLiteral(value, fallback) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Number.isInteger(numeric) ? `${numeric}.0` : String(numeric);
}

const schema = readJson(schemaPath);

function requiredSourceParamLayout(source) {
  const layout = schema.sourceParamLayout?.[source];
  if (!layout || typeof layout !== 'object') {
    throw new Error(`Product source param layout is missing schema.sourceParamLayout.${source}`);
  }
  return layout;
}

function requiredIndexArray(layout, key, source) {
  const value = layout[key];
  if (!Array.isArray(value) || value.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error(`Product source param layout ${source}.${key} must be an array of non-negative integer indices`);
  }
  return value;
}

function normalizeSourceParamSpecs(source, paramCount, specs) {
  if (!Array.isArray(specs)) {
    throw new Error(`Product source param specs are missing for ${source}`);
  }
  const seen = new Set();
  return specs.map((spec) => {
    const { key, index, enumMap = null, fallback } = spec ?? {};
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`Product source param spec for ${source} is missing a string key`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= paramCount) {
      throw new Error(`Product source param spec ${source}.${key} has invalid index ${index}`);
    }
    if (seen.has(index)) {
      throw new Error(`Product source param spec ${source}.${key} duplicates index ${index}`);
    }
    seen.add(index);
    if (!Number.isFinite(Number(fallback))) {
      throw new Error(`Product source param spec ${source}.${key} has invalid fallback ${fallback}`);
    }
    if (enumMap !== null && (typeof enumMap !== 'object' || Array.isArray(enumMap))) {
      throw new Error(`Product source param spec ${source}.${key} has invalid enumMap`);
    }
    return [key, index, enumMap, fallback];
  });
}

function requiredSourceParamSpecs(source, paramCount) {
  return normalizeSourceParamSpecs(source, paramCount, schema.sourceParamSpecs?.[source]);
}

function requiredProductOutputTrim(source) {
  const value = schema.outputTrims?.[source];
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Product output trim is missing or invalid for ${source}`);
  }
  return Number(value);
}

function requiredDrumVoiceParamRanges(manifest) {
  const ranges = manifest.voiceParamRanges;
  if (!ranges || typeof ranges !== 'object' || Array.isArray(ranges)) {
    throw new Error('Product Drum voice param ranges are missing from kessho_product_drum_params.schema.json');
  }
  return Object.fromEntries(Object.entries(ranges).map(([voice, range]) => {
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !Number.isInteger(range[0]) ||
      !Number.isInteger(range[1]) ||
      range[0] < 0 ||
      range[1] < 0 ||
      range[0] + range[1] > drumParamCount
    ) {
      throw new Error(`Product Drum voice param range is invalid for ${voice}`);
    }
    return [voice, range];
  }));
}

function requiredDrumVoicePresetExportNames(manifest) {
  const exportNames = manifest.voicePresetExportNames;
  if (!exportNames || typeof exportNames !== 'object' || Array.isArray(exportNames)) {
    throw new Error('Product Drum voice preset export names are missing from kessho_product_drum_params.schema.json');
  }
  return exportNames;
}

const padParamLayout = requiredSourceParamLayout('pad');
const leadParamLayout = requiredSourceParamLayout('lead');
const drumParamLayout = requiredSourceParamLayout('drum');
const padParamCount = Number(padParamLayout.paramCount);
const leadParamCount = Number(leadParamLayout.paramCount);
const drumParamCount = Number(drumParamLayout.paramCount);
const padPresetSnapParamIndices = requiredIndexArray(padParamLayout, 'presetSnapParamIndices', 'pad');
const leadPresetSnapParamIndices = requiredIndexArray(leadParamLayout, 'presetSnapParamIndices', 'lead');
const leadPresetRoundParamIndices = requiredIndexArray(leadParamLayout, 'presetRoundParamIndices', 'lead');
const drumPresetSnapParamIndices = requiredIndexArray(drumParamLayout, 'presetSnapParamIndices', 'drum');
const padParamSpecs = requiredSourceParamSpecs('pad', padParamCount);
const leadParamSpecs = requiredSourceParamSpecs('lead', leadParamCount);
const drumParamManifest = readJson(drumParamsPath);
const drumParamSpecs = normalizeSourceParamSpecs('drum', drumParamCount, drumParamManifest.paramSpecs);
const padOutputTrim = requiredProductOutputTrim('pad');
const leadOutputTrim = requiredProductOutputTrim('lead');
const reverbOutputTrim = requiredProductOutputTrim('reverb');
const drumDefaultParams = Array.from({ length: drumParamCount }, () => 0);
for (const [, index, , fallback] of drumParamSpecs) {
  drumDefaultParams[index] = fallback;
}
for (const [indexText, value] of Object.entries(drumParamManifest.defaultParamValues ?? {})) {
  const index = Number(indexText);
  if (!Number.isInteger(index) || index < 0 || index >= drumParamCount || !Number.isFinite(Number(value))) {
    throw new Error(`Product Drum default param value has invalid entry ${indexText}: ${value}`);
  }
  drumDefaultParams[index] = value;
}
const drumVoiceParamRanges = requiredDrumVoiceParamRanges(drumParamManifest);
const drumVoicePresetExportNames = requiredDrumVoicePresetExportNames(drumParamManifest);

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function padParamValue(value, map, fallback) {
  if (typeof value === 'string' && map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return finiteNumber(value, fallback);
}

function leadParamValue(value, map, fallback) {
  if (typeof value === 'string' && map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return finiteNumber(value, fallback);
}

async function loadPadPresetModule() {
  return loadBundledTsModule('src/audio/padPresets.ts');
}

async function loadLeadPresetModule() {
  return loadBundledTsModule('src/audio/lead4opfm.ts');
}

async function loadDrumPresetModule() {
  return loadBundledTsModule('src/audio/drumPresets.ts');
}

async function loadBundledTsModule(relativePath) {
  const absolutePath = resolve(root, relativePath);
  const output = await build({
    absWorkingDir: root,
    entryPoints: [absolutePath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}

function exactPadParamsForPreset(preset, padPresetModule) {
  const exactPadParams = Array.from({ length: padParamCount }, () => 0);
  if (preset.source !== 'pad') {
    return { exactPadParamCount: 0, exactPadParams };
  }

  const padPreset = padPresetModule.getPadPreset(preset.key);
  if (!padPreset) {
    throw new Error(`Missing factory pad preset for product preset ${preset.name} (${preset.key})`);
  }

  for (const [key, index, map, fallback] of padParamSpecs) {
    exactPadParams[index] = padParamValue(padPreset.params[key], map, fallback);
  }
  exactPadParams[52] = padOutputTrim;
  return { exactPadParamCount: padParamCount, exactPadParams };
}

function productLeadPresetsFromModule(leadPresetModule) {
  return [
    leadPresetModule.DEFAULT_SOFT_RHODES,
    leadPresetModule.DEFAULT_GAMELAN,
  ].filter((candidate) => candidate && typeof candidate.id === 'string');
}

function exactLeadParamsForPreset(preset, leadPresetModule) {
  const exactLeadParams = Array.from({ length: leadParamCount }, () => 0);
  if (preset.source !== 'lead') {
    return { exactLeadParamCount: 0, exactLeadParams };
  }

  const leadPreset = productLeadPresetsFromModule(leadPresetModule)
    .find((candidate) => candidate.id === preset.key);
  if (!leadPreset) {
    throw new Error(`Missing factory Lead4opFM preset for product preset ${preset.name} (${preset.key})`);
  }
  const morphed = leadPresetModule.morphPresets(leadPreset, leadPreset, 0);
  for (const [key, index, map, fallback] of leadParamSpecs) {
    exactLeadParams[index] = leadParamValue(morphed[key], map, fallback);
  }
  return { exactLeadParamCount: leadParamCount, exactLeadParams };
}

const drumParamIndexByKey = new Map(drumParamSpecs.map(([key, index]) => [key, index]));

function applyDrumCompatibilityAliases(exactDrumParams, params) {
  const source = params ?? {};
  const excPosIndex = drumParamIndexByKey.get('drumMembraneExcPos');
  const strikePositionIndex = drumParamIndexByKey.get('drumMembraneStrikePosition');
  if (excPosIndex === undefined || strikePositionIndex === undefined) {
    return;
  }
  const hasExcPos = Object.prototype.hasOwnProperty.call(source, 'drumMembraneExcPos');
  const hasStrikePosition = Object.prototype.hasOwnProperty.call(source, 'drumMembraneStrikePosition');
  if (hasExcPos && !hasStrikePosition) {
    exactDrumParams[strikePositionIndex] = exactDrumParams[excPosIndex];
  } else if (hasStrikePosition && !hasExcPos) {
    exactDrumParams[excPosIndex] = exactDrumParams[strikePositionIndex];
  }
}

function exactDrumParamsForPreset(preset) {
  if (preset.source !== 'drum') {
    const exactDrumParams = Array.from({ length: drumParamCount }, () => 0);
    return { exactDrumParamCount: 0, exactDrumParams };
  }

  const exactDrumParams = [...drumDefaultParams];
  for (const [key, index, map, fallback] of drumParamSpecs) {
    exactDrumParams[index] = padParamValue(preset.params?.[key], map, fallback);
  }
  applyDrumCompatibilityAliases(exactDrumParams, preset.params);
  return { exactDrumParamCount: drumParamCount, exactDrumParams };
}

function drumVoicePresetParams(preset) {
  const exactDrumParams = [...drumDefaultParams];
  for (const [key, index, map, fallback] of drumParamSpecs) {
    if (Object.prototype.hasOwnProperty.call(preset.params ?? {}, key)) {
      exactDrumParams[index] = padParamValue(preset.params[key], map, fallback);
    }
  }
  applyDrumCompatibilityAliases(exactDrumParams, preset.params);
  return exactDrumParams;
}

function makeDrumVoicePresetRows(drumVoiceIds, drumPresetModule) {
  const rows = [];
  for (const voice of drumVoiceIds) {
    const exportName = drumVoicePresetExportNames[voice.name];
    const presets = drumPresetModule[exportName];
    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error(`Missing factory drum presets for ${voice.name}`);
    }
    const [paramStart, paramCount] = drumVoiceParamRanges[voice.name] ?? [0, 0];
    presets.forEach((preset, index) => {
      rows.push({
        id: 3100 + (voice.id - 1) * 100 + index + 1,
        name: preset.name,
        voice: voice.name,
        voiceIndex: voice.id - 1,
        defaultForVoice: preset.name === voice.defaultPreset,
        paramStart,
        paramCount,
        params: drumVoicePresetParams(preset),
      });
    });
  }
  return rows;
}

const params = readJson(paramsPath).params;
const events = readJson(eventsPath).events;
const sourceIds = schema.sourceIds;
const sourcePresetIds = schema.sourcePresetIds ?? [];
const drumVoiceIds = schema.drumVoiceIds ?? [];
const soundscapeParamLayout = schema.soundscapeParamLayout ?? {};
const soundscapeLayerCount = Number(soundscapeParamLayout.layerCount ?? 4);
const soundscapeLayerRouteStride = Number(soundscapeParamLayout.layerRouteStride ?? 4);
const soundscapeLayerRouteParamCount = soundscapeLayerCount * soundscapeLayerRouteStride;
const soundscapeParityFixtureParam = soundscapeLayerRouteParamCount;
const soundscapeParityParamCount = soundscapeParityFixtureParam + 1;
const soundscapeTextureParamStart = soundscapeParityParamCount;
const soundscapeTextureSlotCount = Number(soundscapeParamLayout.textureSlotCount ?? 4);
const soundscapeTextureParamStride = Number(soundscapeParamLayout.textureParamStride ?? 5);
const soundscapeTextureParamCount = soundscapeTextureParamStart + soundscapeTextureSlotCount * soundscapeTextureParamStride;
const soundscapeModuleParamCount = Number(soundscapeParamLayout.moduleParamCount ?? 96);
const soundscapeProductModuleExtraParamCount = Number(soundscapeParamLayout.productModuleExtraParamCount ?? 5);
const soundscapeProductModuleParamCount = soundscapeModuleParamCount + soundscapeProductModuleExtraParamCount;
const padPresetModule = await loadPadPresetModule();
const leadPresetModule = await loadLeadPresetModule();
const drumPresetModule = await loadDrumPresetModule();
const padParamSpecRows = padParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  pad2Key: padPresetModule.PAD1_TO_PAD2_KEY?.[key] ?? key,
  index,
  fallback,
  enumMap,
}));
const leadParamSpecRows = leadParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  index,
  fallback,
  enumMap,
}));
const drumParamSpecRows = drumParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  index,
  fallback,
  enumMap,
}));
const drumVoiceRows = drumVoiceIds.map((voice) => ({
  ...voice,
  index: voice.id - 1,
  paramStart: drumVoiceParamRanges[voice.name]?.[0] ?? 0,
  paramCount: drumVoiceParamRanges[voice.name]?.[1] ?? 0,
}));
const drumVoicePresetRows = makeDrumVoicePresetRows(drumVoiceRows, drumPresetModule);
const sourcePresetRows = sourcePresetIds.map((preset) => ({ ...preset }));
const padSourcePresetRows = sourcePresetIds
  .filter((preset) => preset.source === 'pad')
  .map((preset) => ({
    id: preset.id,
    key: preset.key,
    params: exactPadParamsForPreset(preset, padPresetModule).exactPadParams,
  }));
const leadSourcePresetRows = sourcePresetIds
  .filter((preset) => preset.source === 'lead')
  .map((preset) => ({
    id: preset.id,
    key: preset.key,
    params: exactLeadParamsForPreset(preset, leadPresetModule).exactLeadParams,
  }));
const drumSourcePresetRows = sourcePresetIds
  .filter((preset) => preset.source === 'drum')
  .map((preset) => ({
    id: preset.id,
    key: preset.key,
    params: exactDrumParamsForPreset(preset).exactDrumParams,
  }));
const groups = schema.groups;
const limits = schema.limits;
const canonical = stableStringify({
  schema,
  params,
  events,
  sourcePresetRows,
  padSourcePresetRows,
  leadSourcePresetRows,
  drumSourcePresetRows,
  drumVoiceRows,
  drumVoicePresetRows,
  padParamSpecRows,
  leadParamSpecRows,
  drumParamSpecRows,
  drumDefaultParams,
  padOutputTrim,
  leadOutputTrim,
  reverbOutputTrim,
  padPresetSnapParamIndices,
  leadPresetSnapParamIndices,
  leadPresetRoundParamIndices,
  drumPresetSnapParamIndices,
});
const hashHex = createHash('sha256').update(canonical).digest('hex');
const schemaHash = Number.parseInt(hashHex.slice(0, 8), 16) >>> 0;
const schemaHashLiteral = `0x${schemaHash.toString(16).padStart(8, '0')}u`;
const schemaHashJsLiteral = `0x${schemaHash.toString(16).padStart(8, '0')}`;

const cppPreamble = `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.\n#pragma once\n\n#include <stdint.h>\n\n#ifdef __cplusplus\nnamespace kessho::product::generated {\n`;
const cppPostamble = `\n} // namespace kessho::product::generated\n#endif\n`;

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductSchemaHash.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

#define KESSHO_PRODUCT_GENERATED_SCHEMA_VERSION ${schema.version}u
#define KESSHO_PRODUCT_GENERATED_SCHEMA_HASH ${schemaHashLiteral}

#ifdef __cplusplus
namespace kessho::product::generated {

inline constexpr uint32_t KESSHO_PRODUCT_SCHEMA_VERSION = ${schema.version}u;
inline constexpr uint32_t KESSHO_PRODUCT_SCHEMA_HASH = ${schemaHashLiteral};
inline constexpr const char* KESSHO_PRODUCT_SCHEMA_HASH_HEX = "${hashHex}";
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductSchema.h'), `${cppPreamble}
inline constexpr uint32_t KESSHO_PRODUCT_GROUP_COUNT = ${groups.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOURCE_COUNT = ${sourceIds.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOURCE_PRESET_COUNT = ${sourcePresetIds.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_PAD_SOURCE_PRESET_COUNT = ${padSourcePresetRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_LEAD_SOURCE_PRESET_COUNT = ${leadSourcePresetRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_SOURCE_PRESET_COUNT = ${drumSourcePresetRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT = ${drumVoiceRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_VOICE_PRESET_COUNT = ${drumVoicePresetRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT = ${padParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT = ${leadParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT = ${drumParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_LAYER_COUNT = ${soundscapeLayerCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_STRIDE = ${soundscapeLayerRouteStride}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT = ${soundscapeLayerRouteParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_PARITY_FIXTURE_PARAM = ${soundscapeParityFixtureParam}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_PARITY_PARAM_COUNT = ${soundscapeParityParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_START = ${soundscapeTextureParamStart}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_SLOT_COUNT = ${soundscapeTextureSlotCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_STRIDE = ${soundscapeTextureParamStride}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_TEXTURE_PARAM_COUNT = ${soundscapeTextureParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_MODULE_PARAM_COUNT = ${soundscapeModuleParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT = ${soundscapeProductModuleParamCount}u;
inline constexpr float KESSHO_PRODUCT_GENERATED_PAD_OUTPUT_TRIM = ${numberLiteral(padOutputTrim, 0.5)}f;
inline constexpr float KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM = ${numberLiteral(leadOutputTrim, 0.5)}f;
inline constexpr float KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM = ${numberLiteral(reverbOutputTrim, 2)}f;
inline constexpr uint32_t KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES[] = {${padPresetSnapParamIndices.map((index) => `${index}u`).join(', ')}};
inline constexpr uint32_t KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES[] = {${leadPresetSnapParamIndices.map((index) => `${index}u`).join(', ')}};
inline constexpr uint32_t KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES[] = {${leadPresetRoundParamIndices.map((index) => `${index}u`).join(', ')}};
inline constexpr uint32_t KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES[] = {${drumPresetSnapParamIndices.map((index) => `${index}u`).join(', ')}};
inline constexpr uint32_t KESSHO_PRODUCT_MAX_BLOCK_SIZE = ${limits.maxBlockSize}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_CONTROL_EVENTS = ${limits.maxControlEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS = ${limits.maxSequencerEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_AUTOMATION_EVENTS = ${limits.maxAutomationEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_SYNTH_LANES = ${limits.maxSynthLanes}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_DRUM_LANES = ${limits.maxDrumLanes}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_VOICES = ${limits.maxVoices}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_ASSETS = ${limits.maxAssets}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_STEM_FRAMES = ${limits.maxStemFrames}u;

${cppStringArray('KESSHO_PRODUCT_GROUPS', groups)}

enum KesshoProductGeneratedSourceId : uint32_t {
${sourceIds.map((source) => `  KESSHO_PRODUCT_SOURCE_${upperSnake(source.name)} = ${source.id}u`).join(',\n')}
};

enum KesshoProductGeneratedSourcePresetId : uint32_t {
${sourcePresetIds.map((preset) => `  KESSHO_PRODUCT_SOURCE_PRESET_${upperSnake(preset.name)} = ${preset.id}u`).join(',\n')}
};

enum KesshoProductGeneratedDrumVoiceId : uint32_t {
${drumVoiceRows.map((voice) => `  KESSHO_PRODUCT_DRUM_VOICE_${upperSnake(voice.name)} = ${voice.id}u`).join(',\n')}
};

struct KesshoProductGeneratedDrumVoice {
  const char* name;
  uint32_t id;
  uint32_t index;
  uint32_t param_start;
  uint32_t param_count;
};

inline constexpr KesshoProductGeneratedDrumVoice KESSHO_PRODUCT_DRUM_VOICES[] = {
${drumVoiceRows.map((voice) => `  {"${voice.name}", ${voice.id}u, ${voice.index}u, ${voice.paramStart}u, ${voice.paramCount}u}`).join(',\n')}
};

struct KesshoProductGeneratedDrumVoicePreset {
  const char* name;
  const char* voice;
  uint32_t voice_index;
  uint32_t id;
  uint32_t default_for_voice;
  uint32_t param_start;
  uint32_t param_count;
  float params[KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedDrumVoicePreset KESSHO_PRODUCT_DRUM_VOICE_PRESETS[] = {
${drumVoicePresetRows.map((preset) => {
  const params = preset.params.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.name}", "${preset.voice}", ${preset.voiceIndex}u, ${preset.id}u, ${preset.defaultForVoice ? 1 : 0}u, ${preset.paramStart}u, ${preset.paramCount}u, {${params}}}`;
}).join(',\n')}
};

struct KesshoProductGeneratedSourcePreset {
  const char* name;
  const char* source;
  const char* key;
  uint32_t id;
  float macro_morph;
  float macro_distance;
  float macro_expression;
};

inline constexpr KesshoProductGeneratedSourcePreset KESSHO_PRODUCT_SOURCE_PRESETS[] = {
${sourcePresetRows.map((preset) => {
  return `  {"${preset.name}", "${preset.source}", "${preset.key}", ${preset.id}u, ${numberLiteral(preset.macroMorph, 0)}f, ${numberLiteral(preset.macroDistance, 0)}f, ${numberLiteral(preset.macroExpression, 1)}f}`;
}).join(',\n')}
};

struct KesshoProductGeneratedPadSourcePreset {
  const char* key;
  uint32_t id;
  float params[KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedPadSourcePreset KESSHO_PRODUCT_PAD_SOURCE_PRESETS[] = {
${padSourcePresetRows.map((preset) => {
  const params = preset.params.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.key}", ${preset.id}u, {${params}}}`;
}).join(',\n')}
};

struct KesshoProductGeneratedLeadSourcePreset {
  const char* key;
  uint32_t id;
  float params[KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedLeadSourcePreset KESSHO_PRODUCT_LEAD_SOURCE_PRESETS[] = {
${leadSourcePresetRows.map((preset) => {
  const params = preset.params.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.key}", ${preset.id}u, {${params}}}`;
}).join(',\n')}
};

struct KesshoProductGeneratedDrumSourcePreset {
  const char* key;
  uint32_t id;
  float params[KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedDrumSourcePreset KESSHO_PRODUCT_DRUM_SOURCE_PRESETS[] = {
${drumSourcePresetRows.map((preset) => {
  const params = preset.params.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.key}", ${preset.id}u, {${params}}}`;
}).join(',\n')}
};
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductDefaults.h'), `${cppPreamble}
inline constexpr float KESSHO_PRODUCT_DEFAULT_BPM = ${schema.defaults.transport.bpm}.0f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR = ${schema.defaults.transport.beatsPerBar}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE = ${schema.defaults.transport.barsPerPhrase}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_TRANSPORT_SWING = ${schema.defaults.transport.swing}.0f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_MASTER_GAIN = ${schema.defaults.master.gain}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB = ${schema.defaults.master.limiterCeilingDb}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_LEVEL = ${schema.defaults.source.level}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION = ${schema.defaults.source.expression}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ = ${numberLiteral(schema.defaults.source.postLpfHz, 18000)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH = ${numberLiteral(schema.defaults.source.stereoWidth, 1)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING = ${numberLiteral(schema.defaults.source.postLpfKeyTracking, 0)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS = ${numberLiteral(schema.defaults.source.attackSeconds, 0.005)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS = ${numberLiteral(schema.defaults.source.decaySeconds, 0.65)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN = ${numberLiteral(schema.defaults.source.sustain, 0.72)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS = ${schema.defaults.source.holdSeconds}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS = ${numberLiteral(schema.defaults.source.releaseSeconds, 1.4)}f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_RNG_SEED = ${schema.defaults.rng.seed}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_EVOLUTION_AMOUNT = ${schema.defaults.evolution.amount}.0f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_EVOLUTION_STATE = ${schema.defaults.evolution.state}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_STEPS = ${schema.defaults.sequencerLane.stepCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_FILLS = ${schema.defaults.sequencerLane.fillCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_CLOCK_DIVISION = ${schema.defaults.sequencerLane.clockDivision}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_PROBABILITY = ${schema.defaults.sequencerLane.probability}.0f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_VELOCITY = ${schema.defaults.sequencerLane.velocity}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_HOLD_SECONDS = ${schema.defaults.sequencerLane.holdSeconds}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_INITIAL_START_DELAY_SECONDS = ${numberLiteral(schema.defaults.sequencerLane.initialStartDelaySeconds, -1)}f;
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductParamIds.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

${params.map((param) => `#define KESSHO_PRODUCT_PARAM_${upperSnake(param.name)}_ID ${param.id}u`).join('\n')}

#ifdef __cplusplus
namespace kessho::product::generated {

enum KesshoProductGeneratedParamId : uint32_t {
${params.map((param) => `  KESSHO_PRODUCT_PARAM_${upperSnake(param.name)} = ${param.id}u`).join(',\n')}
};

inline constexpr uint32_t KESSHO_PRODUCT_PARAM_COUNT = ${params.length}u;
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductEventIds.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

${events.map((event) => `#define KESSHO_PRODUCT_EVENT_${upperSnake(event.name)}_ID ${event.id}u`).join('\n')}

#ifdef __cplusplus
namespace kessho::product::generated {

enum KesshoProductGeneratedEventId : uint32_t {
${events.map((event) => `  KESSHO_PRODUCT_EVENT_${upperSnake(event.name)} = ${event.id}u`).join(',\n')}
};

inline constexpr uint32_t KESSHO_PRODUCT_EVENT_ID_COUNT = ${events.length}u;
${cppPostamble}`);

const tsPreamble = `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.\n`;

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductSchema.ts'), `${tsPreamble}
export const KESSHO_PRODUCT_SCHEMA_VERSION = ${schema.version} as const;
export const KESSHO_PRODUCT_SCHEMA_HASH = ${schemaHash} as const;
export const KESSHO_PRODUCT_SCHEMA_HASH_HEX = '${hashHex}' as const;
export const KESSHO_PRODUCT_GROUPS = Object.freeze(${JSON.stringify(groups, null, 2)}) as readonly string[];
export const KESSHO_PRODUCT_PAD_PARAM_COUNT = ${padParamCount} as const;
export const KESSHO_PRODUCT_LEAD_PARAM_COUNT = ${leadParamCount} as const;
export const KESSHO_PRODUCT_DRUM_PARAM_COUNT = ${drumParamCount} as const;
export const KESSHO_PRODUCT_DRUM_VOICE_COUNT = ${drumVoiceRows.length} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_LAYER_COUNT = ${soundscapeLayerCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_STRIDE = ${soundscapeLayerRouteStride} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT = ${soundscapeLayerRouteParamCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_PARITY_FIXTURE_PARAM = ${soundscapeParityFixtureParam} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_PARITY_PARAM_COUNT = ${soundscapeParityParamCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_START = ${soundscapeTextureParamStart} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_SLOT_COUNT = ${soundscapeTextureSlotCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_STRIDE = ${soundscapeTextureParamStride} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_COUNT = ${soundscapeTextureParamCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT = ${soundscapeModuleParamCount} as const;
export const KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT = ${soundscapeProductModuleParamCount} as const;
export const KESSHO_PRODUCT_PAD_OUTPUT_TRIM = ${numberLiteral(padOutputTrim, 0.5)} as const;
export const KESSHO_PRODUCT_LEAD_OUTPUT_TRIM = ${numberLiteral(leadOutputTrim, 0.5)} as const;
export const KESSHO_PRODUCT_REVERB_OUTPUT_TRIM = ${numberLiteral(reverbOutputTrim, 2)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ = ${numberLiteral(schema.defaults.source.postLpfHz, 18000)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH = ${numberLiteral(schema.defaults.source.stereoWidth, 1)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING = ${numberLiteral(schema.defaults.source.postLpfKeyTracking, 0)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS = ${numberLiteral(schema.defaults.source.attackSeconds, 0.005)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS = ${numberLiteral(schema.defaults.source.decaySeconds, 0.65)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN = ${numberLiteral(schema.defaults.source.sustain, 0.72)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS = ${numberLiteral(schema.defaults.source.holdSeconds, 0.5)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS = ${numberLiteral(schema.defaults.source.releaseSeconds, 1.4)} as const;
export const KESSHO_PRODUCT_PAD_PARAM_SPECS = Object.freeze(${JSON.stringify(padParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_LEAD_PARAM_SPECS = Object.freeze(${JSON.stringify(leadParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES = Object.freeze(${JSON.stringify(padPresetSnapParamIndices)} as const);
export const KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES = Object.freeze(${JSON.stringify(leadPresetSnapParamIndices)} as const);
export const KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES = Object.freeze(${JSON.stringify(leadPresetRoundParamIndices)} as const);
export const KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS = Object.freeze(${JSON.stringify(drumDefaultParams, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_PARAM_SPECS = Object.freeze(${JSON.stringify(drumParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES = Object.freeze(${JSON.stringify(drumPresetSnapParamIndices)} as const);
export const KESSHO_PRODUCT_DRUM_VOICES = Object.freeze(${JSON.stringify(drumVoiceRows, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_VOICE_PRESETS = Object.freeze(${JSON.stringify(drumVoicePresetRows.map((preset) => ({
  id: preset.id,
  name: preset.name,
  voice: preset.voice,
  voiceIndex: preset.voiceIndex,
  defaultForVoice: preset.defaultForVoice,
  paramStart: preset.paramStart,
  paramCount: preset.paramCount,
  params: preset.params,
})), null, 2)} as const);
export const KESSHO_PRODUCT_SOURCE_IDS = Object.freeze({
${sourceIds.map((source) => `  ${source.name}: ${source.id}`).join(',\n')}
} as const);
export const KESSHO_PRODUCT_SOURCE_PRESET_IDS = Object.freeze({
${sourcePresetIds.map((preset) => `  ${preset.name}: ${preset.id}`).join(',\n')}
} as const);
export const KESSHO_PRODUCT_SOURCE_PRESETS = Object.freeze(${JSON.stringify(sourcePresetRows, null, 2)} as const);
export const KESSHO_PRODUCT_LIMITS = Object.freeze(${JSON.stringify(limits, null, 2)} as const);
`);

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductParams.ts'), `${tsPreamble}
${tsConstObject('KESSHO_PRODUCT_PARAM_IDS', params)}
export const KESSHO_PRODUCT_PARAMS = Object.freeze(${JSON.stringify(params, null, 2)} as const);
export type KesshoProductParamName = keyof typeof KESSHO_PRODUCT_PARAM_IDS;
`);

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductEvents.ts'), `${tsPreamble}
${tsConstObject('KESSHO_PRODUCT_EVENT_IDS', events)}
export const KESSHO_PRODUCT_EVENTS = Object.freeze(${JSON.stringify(events, null, 2)} as const);
export type KesshoProductEventName = keyof typeof KESSHO_PRODUCT_EVENT_IDS;
`);

const productWorkletSource = readFileSync(productWorkletSourcePath, 'utf8');
writeGenerated(
  productWorkletOutputPath,
  applyProductBindings(productWorkletSource, schemaHashJsLiteral, events),
);

console.log(`Generated Kessho product bindings (${hashHex}).`);
