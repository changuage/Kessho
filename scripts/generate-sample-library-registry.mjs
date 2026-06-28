import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

const sampleLibraryInputs = [
  { key: 'pneuma-eleni-teaser', manifestPath: 'public/samples/Pneuma/manifest.json' },
  { key: 'soft-string-spurs', manifestPath: 'public/samples/SoftStringSpurs/manifest.json' },
  { key: 'archive-found-strings-001', manifestPath: 'public/samples/ArchiveFoundStrings001/manifest.json' },
  { key: 'array-mbira', manifestPath: 'public/samples/ArrayMBira/manifest.json' },
  { key: 'the-spellsinger', manifestPath: 'public/samples/TheSpellsinger/manifest.json' },
  { key: 'wild-percussion', manifestPath: 'public/samples/WildPercussion/manifest.json' },
];

const outputPaths = {
  ts: 'src/audio/sampleLibraries/generated/sampleLibraryRegistry.generated.ts',
  cppHeader: 'cpp/KesshoCore/src/product/generated/SampleLibraryRegistry.generated.h',
  cppSource: 'cpp/KesshoCore/src/product/generated/SampleLibraryRegistry.generated.cpp',
};

const dynamicKeys = [
  'regular',
  'short',
  'quiet',
  'pp',
  'mp',
  'mf',
  'ff',
  'level-1',
  'level-2',
  'level-3',
  'level-4',
  'single',
  'piano',
  'forte',
  'strum-2',
  'strum-3',
  'strum-4',
  'normal',
  'wicked',
  'velocity-1',
  'velocity-2',
  'velocity-3',
];

const dynamicVelocityRanges = new Map([
  ['regular', [0, 127]],
  ['short', [0, 127]],
  ['quiet', [0, 31]],
  ['pp', [0, 39]],
  ['mp', [40, 74]],
  ['mf', [75, 104]],
  ['ff', [105, 127]],
  ['level-1', [0, 31]],
  ['level-2', [32, 63]],
  ['level-3', [64, 95]],
  ['level-4', [96, 127]],
  ['single', [0, 127]],
  ['piano', [0, 84]],
  ['forte', [85, 127]],
  ['strum-2', [0, 42]],
  ['strum-3', [43, 84]],
  ['strum-4', [85, 127]],
  ['normal', [0, 127]],
  ['wicked', [0, 127]],
  ['velocity-1', [85, 127]],
  ['velocity-2', [43, 84]],
  ['velocity-3', [0, 42]],
]);

const assetIdRanges = new Map([
  ['piano', [7201, 7328]],
  ['pneuma-eleni-teaser', [8000, 8199]],
  ['soft-string-spurs', [8200, 8399]],
  ['archive-found-strings-001', [8400, 8599]],
  ['array-mbira', [8600, 8999]],
  ['the-spellsinger', [9000, 9099]],
  ['wild-percussion', [9100, 9199]],
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function cleanString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number);
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampMidi(value) {
  return clampInt(value, 0, 127);
}

function normalizeDynamic(value) {
  const dynamic = cleanString(value, 'single').toLowerCase();
  return dynamicKeys.includes(dynamic) ? dynamic : 'single';
}

function firstMapping(sample) {
  if (!Array.isArray(sample.decentSamplerMappings)) return null;
  return sample.decentSamplerMappings.find((candidate) => candidate && typeof candidate === 'object') ?? null;
}

function velocityRangeFromSample(sample, dynamic, mapping) {
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

  return dynamicVelocityRanges.get(dynamic) ?? [0, 127];
}

function loopFromSample(sample, mapping, sourceSampleRate, encodedSampleRate) {
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

function uniqueMidi(notes) {
  const seen = new Set();
  const result = [];
  for (const note of notes) {
    const midi = clampMidi(note);
    if (seen.has(midi)) continue;
    seen.add(midi);
    result.push(midi);
  }
  return result;
}

function compareSamples(left, right) {
  return left.role.localeCompare(right.role) ||
    left.articulation.localeCompare(right.articulation) ||
    dynamicKeys.indexOf(left.dynamic) - dynamicKeys.indexOf(right.dynamic) ||
    left.rootMidi - right.rootMidi ||
    left.loMidi - right.loMidi ||
    left.hiMidi - right.hiMidi ||
    left.assetPath.localeCompare(right.assetPath) ||
    left.sampleId.localeCompare(right.sampleId);
}

function chooseDefaultMidi(samples) {
  return [...samples]
    .sort((left, right) => Math.abs(left.rootMidi - 60) - Math.abs(right.rootMidi - 60) || left.rootMidi - right.rootMidi)[0]
    ?.rootMidi ?? 60;
}

function chooseRecommendedPreloadMidi(samples, defaultMidi) {
  const roots = [...new Set(samples.map((sample) => sample.rootMidi))].sort((left, right) => left - right);
  return [
    defaultMidi,
    ...roots.filter((rootMidi) => rootMidi !== defaultMidi)
      .sort((left, right) => Math.abs(left - defaultMidi) - Math.abs(right - defaultMidi) || left - right),
  ].slice(0, 8);
}

function normalizeImportedManifest(rawManifest) {
  if (rawManifest.schema !== 'kessho-sample-library-v1') {
    throw new Error(`Unsupported sample manifest schema: ${String(rawManifest.schema)}`);
  }
  const libraryKey = rawManifest.library?.key;
  if (!assetIdRanges.has(libraryKey)) {
    throw new Error(`No sample asset range for ${String(libraryKey)}`);
  }
  if (!Array.isArray(rawManifest.samples)) {
    throw new Error(`${String(libraryKey)} manifest is missing samples`);
  }

  const samples = [];
  let firstSourceSampleRate = 0;
  let firstEncodedSampleRate = 0;
  let skippedMissingRoot = 0;
  const assetIdBase = integer(rawManifest.assetIdBase) ?? 0;
  rawManifest.samples.forEach((rawSample, index) => {
    if (!rawSample || typeof rawSample !== 'object') return;
    const mapping = firstMapping(rawSample);
    const rootMidiValue = integer(rawSample.rootMidi) ?? integer(mapping?.rootNote);
    if (rootMidiValue === null) {
      skippedMissingRoot += 1;
      return;
    }

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
    if (firstSourceSampleRate === 0) firstSourceSampleRate = sourceSampleRate;
    if (firstEncodedSampleRate === 0) firstEncodedSampleRate = encodedSampleRate;

    samples.push({
      sampleId: cleanString(rawSample.key, `${libraryKey}:${rawSample.assetId ?? assetIdBase + index}`),
      assetId: integer(rawSample.assetId) ?? assetIdBase + index,
      assetPath: cleanString(rawSample.path, ''),
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

  const sortedSamples = samples
    .filter((sample) => sample.assetPath.length > 0)
    .sort(compareSamples);
  const defaultMidi = chooseDefaultMidi(sortedSamples);
  const firstSample = sortedSamples[0] ?? null;
  return {
    manifest: {
      schema: 'kessho-normalized-sample-library-v1',
      libraryKey,
      displayName: cleanString(rawManifest.library?.name, libraryKey),
      assetBasePath: cleanString(rawManifest.assetBasePath, 'samples'),
      sourceSampleRate: firstSourceSampleRate || 44100,
      encodedSampleRate: firstEncodedSampleRate || integer(rawManifest.encoding?.sampleRate) || 24000,
      defaultRole: firstSample?.role ?? 'single',
      defaultArticulation: firstSample?.articulation ?? '',
      defaultDynamic: firstSample?.dynamic ?? 'single',
      defaultMidi,
      recommendedPreloadMidi: chooseRecommendedPreloadMidi(sortedSamples, defaultMidi),
      samples: sortedSamples,
    },
    skippedMissingRoot,
  };
}

function createPianoVirtualManifest() {
  const coreManifest = readJson('src/audio/coreProductAssetManifest.json');
  const piano = coreManifest.piano;
  const samples = [];
  const baseMidi = piano.baseMidi;
  for (let midi = baseMidi; midi < baseMidi + piano.sampleCount; midi += 1) {
    const index = midi - baseMidi + 1;
    const paddedIndex = String(index).padStart(2, '0');
    samples.push({
      sampleId: `piano:regular:${midi}`,
      assetId: piano.baseAssetId + index,
      assetPath: piano.regularSamplePathPattern.replace('{index}', paddedIndex),
      rootMidi: midi,
      loMidi: midi,
      hiMidi: midi,
      role: 'regular',
      articulation: '',
      dynamic: 'regular',
      velocityMin: 0,
      velocityMax: 127,
      loop: null,
    });
    samples.push({
      sampleId: `piano:short:${midi}`,
      assetId: piano.shortBaseAssetId + index,
      assetPath: piano.shortSamplePathPattern.replace('{index}', paddedIndex),
      rootMidi: midi,
      loMidi: midi,
      hiMidi: midi,
      role: 'short',
      articulation: '',
      dynamic: 'short',
      velocityMin: 0,
      velocityMax: 127,
      loop: null,
    });
  }

  return {
    schema: 'kessho-normalized-sample-library-v1',
    libraryKey: 'piano',
    displayName: 'Piano',
    assetBasePath: coreManifest.assetBasePath,
    sourceSampleRate: 44100,
    encodedSampleRate: 44100,
    defaultRole: '',
    defaultArticulation: '',
    defaultDynamic: 'regular',
    defaultMidi: piano.defaultMidi,
    recommendedPreloadMidi: uniqueMidi([
      piano.defaultMidi,
      ...piano.preloadMidiNotes,
    ]),
    samples,
  };
}

export function buildSampleLibraryRegistry() {
  const diagnostics = [];
  const registry = [createPianoVirtualManifest()];
  for (const input of sampleLibraryInputs) {
    const absolutePath = path.resolve(root, input.manifestPath);
    if (!existsSync(absolutePath)) {
      diagnostics.push(`${input.key}: missing ${input.manifestPath}`);
      continue;
    }
    const { manifest, skippedMissingRoot } = normalizeImportedManifest(readJson(input.manifestPath));
    registry.push(manifest);
    if (skippedMissingRoot > 0) {
      diagnostics.push(`${input.key}: skipped ${skippedMissingRoot} unrooted sample(s)`);
    }
  }
  return { registry, diagnostics };
}

export function validateSampleLibraryRegistry(registry) {
  const seenAssetIds = new Map();
  const seenSampleIds = new Set();
  for (const library of registry) {
    const range = assetIdRanges.get(library.libraryKey);
    if (!range) throw new Error(`Missing asset id range for ${library.libraryKey}`);
    for (const sample of library.samples) {
      const owner = seenAssetIds.get(sample.assetId);
      if (owner) {
        throw new Error(`Duplicate sample asset id ${sample.assetId}: ${owner} and ${sample.sampleId}`);
      }
      if (seenSampleIds.has(sample.sampleId)) {
        throw new Error(`Duplicate sample id ${sample.sampleId}`);
      }
      if (sample.assetId < range[0] || sample.assetId > range[1]) {
        throw new Error(`${sample.sampleId} asset id ${sample.assetId} is outside ${range[0]}-${range[1]}`);
      }
      if (sample.rootMidi < 0 || sample.rootMidi > 127 || sample.loMidi < 0 || sample.hiMidi > 127) {
        throw new Error(`${sample.sampleId} has invalid MIDI bounds`);
      }
      seenAssetIds.set(sample.assetId, sample.sampleId);
      seenSampleIds.add(sample.sampleId);
    }
  }
}

function generatedHeader() {
  return [
    '// Generated by scripts/generate-sample-library-registry.mjs. Do not edit by hand.',
    '',
  ].join('\n');
}

function renderTs(registry) {
  const tables = buildCppTables(registry);
  const tsMap = (name, map) => {
    const rows = [...map.entries()]
      .map(([key, value]) => `  ${JSON.stringify(key)}: ${value},`)
      .join('\n');
    return `export const ${name} = Object.freeze({\n${rows}\n} as const);\n`;
  };
  return `${generatedHeader()}import type { NormalizedSampleLibraryManifest } from '../SampleLibraryTypes';\n\n` +
    `${tsMap('SAMPLE_LIBRARY_IDS_BY_KEY', tables.libraryIds)}\n` +
    `${tsMap('SAMPLE_ROLE_IDS_BY_KEY', tables.roles)}\n` +
    `${tsMap('SAMPLE_ARTICULATION_IDS_BY_KEY', tables.articulations)}\n` +
    `${tsMap('SAMPLE_DYNAMIC_IDS_BY_KEY', tables.dynamics)}\n` +
    `export const SAMPLE_LIBRARY_REGISTRY_GENERATED = ${JSON.stringify(registry, null, 2)} as const satisfies readonly NormalizedSampleLibraryManifest[];\n`;
}

function cIdentifier(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function idMap(values, startAt = 1) {
  const result = new Map();
  [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right))).forEach((value, index) => {
    result.set(value, index + startAt);
  });
  return result;
}

function buildCppTables(registry) {
  const libraryIds = new Map(registry.map((library, index) => [library.libraryKey, index + 1]));
  const roles = idMap(registry.flatMap((library) => library.samples.map((sample) => sample.role)));
  const articulations = idMap(registry.flatMap((library) => library.samples.map((sample) => sample.articulation)), 0);
  const dynamics = idMap(dynamicKeys, 1);
  const descriptors = [];
  const libraries = [];
  for (const library of registry) {
    const firstSampleIndex = descriptors.length;
    for (const sample of library.samples) {
      const loop = sample.loop;
      descriptors.push({
        assetId: sample.assetId,
        libraryId: libraryIds.get(library.libraryKey),
        roleId: roles.get(sample.role),
        articulationId: articulations.get(sample.articulation),
        dynamicId: dynamics.get(sample.dynamic),
        rootMidi: sample.rootMidi,
        loMidi: sample.loMidi,
        hiMidi: sample.hiMidi,
        velocityMin: sample.velocityMin,
        velocityMax: sample.velocityMax,
        encodedLoopStartFrame: loop?.encodedStartFrame ?? 0,
        encodedLoopEndFrame: loop?.encodedEndFrame ?? 0,
        encodedLoopCrossfadeFrames: loop?.crossfadeFrames ?? 0,
        encodedSampleRate: loop?.encodedSampleRate ?? library.encodedSampleRate,
        hasLoop: Boolean(loop),
      });
    }
    libraries.push({
      libraryId: libraryIds.get(library.libraryKey),
      firstSampleIndex,
      sampleCount: library.samples.length,
      defaultMidi: library.defaultMidi,
      defaultDynamicId: dynamics.get(library.defaultDynamic),
    });
  }
  return { libraryIds, roles, articulations, dynamics, descriptors, libraries };
}

function renderCppHeader(registry) {
  const tables = buildCppTables(registry);
  const libraryConstants = [...tables.libraryIds.entries()]
    .map(([key, value]) => `constexpr uint8_t kSampleLibraryId${cIdentifier(key)} = ${value}u;`)
    .join('\n');
  const roleConstants = [...tables.roles.entries()]
    .map(([key, value]) => `constexpr uint8_t kSampleRoleId${cIdentifier(key || 'Any')} = ${value}u;`)
    .join('\n');
  const articulationConstants = [...tables.articulations.entries()]
    .map(([key, value]) => `constexpr uint8_t kSampleArticulationId${cIdentifier(key || 'Any')} = ${value}u;`)
    .join('\n');
  const dynamicConstants = [...tables.dynamics.entries()]
    .map(([key, value]) => `constexpr uint8_t kSampleDynamicId${cIdentifier(key)} = ${value}u;`)
    .join('\n');
  return `${generatedHeader()}#pragma once\n\n#include <cstdint>\n\nnamespace kessho::product::generated {\n\n` +
    `struct GeneratedSampleDescriptor {\n` +
    `  uint32_t assetId;\n` +
    `  uint8_t libraryId;\n` +
    `  uint8_t roleId;\n` +
    `  uint8_t articulationId;\n` +
    `  uint8_t dynamicId;\n` +
    `  uint8_t rootMidi;\n` +
    `  uint8_t loMidi;\n` +
    `  uint8_t hiMidi;\n` +
    `  uint8_t velocityMin;\n` +
    `  uint8_t velocityMax;\n` +
    `  uint32_t encodedLoopStartFrame;\n` +
    `  uint32_t encodedLoopEndFrame;\n` +
    `  uint32_t encodedLoopCrossfadeFrames;\n` +
    `  uint32_t encodedSampleRate;\n` +
    `  bool hasLoop;\n` +
    `};\n\n` +
    `struct GeneratedSampleLibrary {\n` +
    `  uint8_t libraryId;\n` +
    `  uint32_t firstSampleIndex;\n` +
    `  uint32_t sampleCount;\n` +
    `  uint8_t defaultMidi;\n` +
    `  uint8_t defaultDynamicId;\n` +
    `};\n\n` +
    `${libraryConstants}\n\n` +
    `${roleConstants}\n\n` +
    `${articulationConstants}\n\n` +
    `${dynamicConstants}\n\n` +
    `constexpr uint32_t kGeneratedSampleDescriptorCount = ${tables.descriptors.length}u;\n` +
    `constexpr uint32_t kGeneratedSampleLibraryCount = ${tables.libraries.length}u;\n\n` +
    `extern const GeneratedSampleDescriptor kGeneratedSampleDescriptors[kGeneratedSampleDescriptorCount];\n` +
    `extern const GeneratedSampleLibrary kGeneratedSampleLibraries[kGeneratedSampleLibraryCount];\n\n` +
    `} // namespace kessho::product::generated\n`;
}

function renderCppSource(registry) {
  const tables = buildCppTables(registry);
  const descriptors = tables.descriptors.map((descriptor) => (
    `  {${descriptor.assetId}u, ${descriptor.libraryId}u, ${descriptor.roleId}u, ${descriptor.articulationId}u, ` +
    `${descriptor.dynamicId}u, ${descriptor.rootMidi}u, ${descriptor.loMidi}u, ${descriptor.hiMidi}u, ` +
    `${descriptor.velocityMin}u, ${descriptor.velocityMax}u, ` +
    `${descriptor.encodedLoopStartFrame}u, ${descriptor.encodedLoopEndFrame}u, ${descriptor.encodedLoopCrossfadeFrames}u, ` +
    `${descriptor.encodedSampleRate}u, ` +
    `${descriptor.hasLoop ? 'true' : 'false'}},`
  )).join('\n');
  const libraries = tables.libraries.map((library) => (
    `  {${library.libraryId}u, ${library.firstSampleIndex}u, ${library.sampleCount}u, ` +
    `${library.defaultMidi}u, ${library.defaultDynamicId}u},`
  )).join('\n');
  return `${generatedHeader()}#include "SampleLibraryRegistry.generated.h"\n\nnamespace kessho::product::generated {\n\n` +
    `const GeneratedSampleDescriptor kGeneratedSampleDescriptors[kGeneratedSampleDescriptorCount] = {\n${descriptors}\n};\n\n` +
    `const GeneratedSampleLibrary kGeneratedSampleLibraries[kGeneratedSampleLibraryCount] = {\n${libraries}\n};\n\n` +
    `} // namespace kessho::product::generated\n`;
}

export function renderSampleLibraryRegistryOutputs(registry) {
  return {
    [outputPaths.ts]: renderTs(registry),
    [outputPaths.cppHeader]: renderCppHeader(registry),
    [outputPaths.cppSource]: renderCppSource(registry),
  };
}

function writeOrCheckOutputs(outputs, check) {
  for (const [relativePath, content] of Object.entries(outputs)) {
    const absolutePath = path.resolve(root, relativePath);
    if (check) {
      const existing = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
      if (existing !== content) {
        throw new Error(`${relativePath} is not up to date; run node scripts/generate-sample-library-registry.mjs`);
      }
    } else {
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, content);
    }
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const { registry, diagnostics } = buildSampleLibraryRegistry();
  validateSampleLibraryRegistry(registry);
  writeOrCheckOutputs(renderSampleLibraryRegistryOutputs(registry), check);
  const sampleCount = registry.reduce((total, library) => total + library.samples.length, 0);
  const action = check ? 'Checked' : 'Generated';
  console.log(`${action} sample library registry: ${registry.length} libraries, ${sampleCount} samples.`);
  for (const diagnostic of diagnostics) {
    console.log(`- ${diagnostic}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
