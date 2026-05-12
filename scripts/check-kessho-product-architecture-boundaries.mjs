import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const enginePath = 'cpp/KesshoCore/src/product/KesshoProductEngine.cpp';
const engine = read(enginePath);
const lineCount = (path) => read(path).split('\n').length;
const engineLineCount = engine.split('\n').length;
assert(
  engineLineCount <= 450,
  `Product engine glue file is too large after componentization (${engineLineCount} lines)`,
);

const internalHeaderPath = 'cpp/KesshoCore/src/product/KesshoProductEngineInternal.h';
const internalHeader = read(internalHeaderPath);
assert(
  lineCount(internalHeaderPath) <= 80,
  `Product internal aggregate header is too large (${lineCount(internalHeaderPath)} lines)`,
);
assert(
  internalHeader.includes('#include "ProductState.h"'),
  'Product internal aggregate header must delegate to focused state/contract headers',
);
for (const forbidden of [
  'struct SourceState',
  'struct FxState',
  'struct LaneState',
  'struct Voice',
  'struct KesshoProductEngine {',
  'inline float',
]) {
  assert(!internalHeader.includes(forbidden), `${internalHeaderPath} still owns catch-all content: ${forbidden}`);
}

const focusedHeaders = [
  ['cpp/KesshoCore/src/product/ProductConstants.h', 220],
  ['cpp/KesshoCore/src/product/ProductMath.h', 140],
  ['cpp/KesshoCore/src/product/ProductForwardDecls.h', 80],
  ['cpp/KesshoCore/src/product/ProductTransportState.h', 80],
  ['cpp/KesshoCore/src/product/ProductVoiceState.h', 180],
  ['cpp/KesshoCore/src/product/ProductFxState.h', 260],
  ['cpp/KesshoCore/src/product/ProductModulationState.h', 80],
  ['cpp/KesshoCore/src/product/ProductPresetBridge.h', 140],
  ['cpp/KesshoCore/src/product/ProductSequencerState.h', 120],
  ['cpp/KesshoCore/src/product/ProductBuffers.h', 80],
  ['cpp/KesshoCore/src/product/ProductState.h', 540],
];

for (const [path, maxLines] of focusedHeaders) {
  const source = read(path);
  assert(source.includes('#pragma once'), `${path} must be a focused include-guarded header`);
  assert(lineCount(path) <= maxLines, `${path} exceeds its focused header size cap (${lineCount(path)} > ${maxLines})`);
  assert(!source.includes('KesshoProductEngine::'), `${path} must not contain Product Core method implementations`);
}

const secondStageCaps = [
  ['cpp/KesshoCore/src/product/sources/ProductSources.cpp', 650],
  ['cpp/KesshoCore/src/product/fx/ProductFx.cpp', 760],
];
for (const [path, maxLines] of secondStageCaps) {
  assert(lineCount(path) <= maxLines, `${path} is becoming a second-stage monolith (${lineCount(path)} > ${maxLines})`);
}

const allowedEngineMethods = new Set([
  'KesshoProductEngine',
  'prepareProductModules',
  'setMasterLimiterCeilingDb',
  'loadDefaults',
  'reset',
]);
const engineMethods = Array.from(engine.matchAll(/KesshoProductEngine::([A-Za-z_][A-Za-z0-9_]*)\s*\(/g), (match) => match[1]);
for (const method of engineMethods) {
  assert(
    allowedEngineMethods.has(method),
    `Product engine glue file owns non-orchestration method: ${method}`,
  );
}

for (const forbidden of [
  'generateLaneEvents(',
  'applyParam(',
  'triggerVoice(',
  'renderProductModules(',
  'renderFx(',
  'renderVoiceSample(',
  'loadSnapshot(',
]) {
  assert(!engine.includes(`KesshoProductEngine::${forbidden}`), `${enginePath} still owns ${forbidden}`);
}

const componentFiles = [
  'cpp/KesshoCore/src/product/KesshoProductAssets.cpp',
  'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
  'cpp/KesshoCore/src/product/KesshoProductGraph.cpp',
  'cpp/KesshoCore/src/product/KesshoProductRender.cpp',
  'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
  'cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp',
  'cpp/KesshoCore/src/product/assets/ProductAssets.cpp',
  'cpp/KesshoCore/src/product/fx/ProductFx.cpp',
  'cpp/KesshoCore/src/product/music/CircleOfFifths.cpp',
  'cpp/KesshoCore/src/product/music/DeterministicRng.cpp',
  'cpp/KesshoCore/src/product/music/EvolutionEngine.cpp',
  'cpp/KesshoCore/src/product/music/HarmonyEngine.cpp',
  'cpp/KesshoCore/src/product/music/JourneyMorphClock.cpp',
  'cpp/KesshoCore/src/product/music/ScaleEngine.cpp',
  'cpp/KesshoCore/src/product/music/VoicingEngine.cpp',
  'cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp',
  'cpp/KesshoCore/src/product/sequencer/RatchetEngine.cpp',
  'cpp/KesshoCore/src/product/sequencer/SequencerClock.cpp',
  'cpp/KesshoCore/src/product/sequencer/SequencerEventBuffer.cpp',
  'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp',
  'cpp/KesshoCore/src/product/sequencer/TrigConditionEngine.cpp',
  'cpp/KesshoCore/src/product/sources/ProductSourcePostChain.cpp',
  'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
  'cpp/KesshoCore/src/product/transport/MusicalClock.cpp',
  'cpp/KesshoCore/src/product/transport/ProductTransport.cpp',
];

for (const path of componentFiles) {
  const source = read(path);
  const nonEmptyLines = source.split('\n').filter((line) => line.trim().length > 0);
  assert(nonEmptyLines.length > 3, `Product component file is still include-only: ${path}`);
}

const directTestContracts = [
  {
    path: 'cpp/KesshoCore/tests/ProductSequencerTests.cpp',
    tokens: [
      '../src/product/KesshoProductEngineInternal.h',
      'requireDirectSequencerCoverage',
      'direct.generateLaneEvents(',
      'direct.applySequencerLaneParamEvent(',
      'direct.setStepFieldOverride(',
    ],
  },
  {
    path: 'cpp/KesshoCore/tests/ProductHarmonyTests.cpp',
    tokens: [
      '../src/product/KesshoProductEngineInternal.h',
      'requireDirectMusicCoverage',
      'direct.updateHarmonyTelemetry(',
      'direct.resolveHarmonyMidi(',
      'hashU32(1234u)',
      'direct.evolvedLaneValue(',
      'direct.advanceJourney(',
    ],
  },
  {
    path: 'cpp/KesshoCore/tests/ProductGraphTests.cpp',
    tokens: [
      '../src/product/KesshoProductEngineInternal.h',
      'requireDirectGraphCoverage',
      'direct.mixSourceBuffer(',
      'direct.triggerVoice(',
      'direct.renderProductModules(',
    ],
  },
  {
    path: 'cpp/KesshoCore/tests/ProductFxRoutingTests.cpp',
    tokens: [
      '../src/product/KesshoProductEngineInternal.h',
      'requireDirectFxCoverage',
      'direct.dynamicsModRoute(',
      'direct.triggerSidechainDuck(',
      'direct.renderSidechainGains(',
      'direct.mixFxBuffer(',
    ],
  },
];

for (const contract of directTestContracts) {
  const source = read(contract.path);
  for (const token of contract.tokens) {
    assert(source.includes(token), `${contract.path} must directly exercise Product subsystem token: ${token}`);
  }
}

console.log('Kessho Product architecture boundary checks passed');
