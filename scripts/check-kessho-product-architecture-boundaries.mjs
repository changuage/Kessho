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
  ['cpp/KesshoCore/src/product/ProductDynamicsConstants.h', 120],
  ['cpp/KesshoCore/src/product/ProductMath.h', 140],
  ['cpp/KesshoCore/src/product/ProductForwardDecls.h', 80],
  ['cpp/KesshoCore/src/product/ProductGraphState.h', 180],
  ['cpp/KesshoCore/src/product/ProductTransportState.h', 80],
  ['cpp/KesshoCore/src/product/ProductFilterState.h', 120],
  ['cpp/KesshoCore/src/product/ProductVoiceState.h', 180],
  ['cpp/KesshoCore/src/product/ProductMidiRuntimeState.h', 80],
  ['cpp/KesshoCore/src/product/ProductFxState.h', 260],
  ['cpp/KesshoCore/src/product/ProductModulationState.h', 80],
  ['cpp/KesshoCore/src/product/ProductPresetBridge.h', 140],
  ['cpp/KesshoCore/src/product/ProductSourcePresetPatch.h', 620],
  ['cpp/KesshoCore/src/product/ProductSequencerState.h', 120],
  ['cpp/KesshoCore/src/product/ProductBuffers.h', 80],
  ['cpp/KesshoCore/src/product/ProductState.h', 600],
];

for (const [path, maxLines] of focusedHeaders) {
  const source = read(path);
  assert(source.includes('#pragma once'), `${path} must be a focused include-guarded header`);
  assert(lineCount(path) <= maxLines, `${path} exceeds its focused header size cap (${lineCount(path)} > ${maxLines})`);
  assert(!source.includes('KesshoProductEngine::'), `${path} must not contain Product Core method implementations`);
}

const secondStageCaps = [
  ['cpp/KesshoCore/src/product/KesshoProductApi.cpp', 420],
  ['cpp/KesshoCore/src/product/KesshoProductDebugApi.cpp', 80],
  ['cpp/KesshoCore/src/product/sources/ProductSources.cpp', 140],
  ['cpp/KesshoCore/src/product/sources/SourceTargets.cpp', 120],
  ['cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp', 140],
  ['cpp/KesshoCore/src/product/sources/SourcePresetMorphRuntime.cpp', 120],
  ['cpp/KesshoCore/src/product/sources/SourcePresetMorphSelector.cpp', 140],
  ['cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp', 220],
  ['cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp', 140],
  ['cpp/KesshoCore/src/product/sources/ProductSourcePostChain.cpp', 260],
  ['cpp/KesshoCore/src/product/sources/PadSource.cpp', 80],
  ['cpp/KesshoCore/src/product/sources/SourceEnable.cpp', 100],
  ['cpp/KesshoCore/src/product/sources/SourceGraphTaps.cpp', 140],
  ['cpp/KesshoCore/src/product/sources/SourceMix.cpp', 120],
  ['cpp/KesshoCore/src/product/sources/SourceModulation.cpp', 220],
  ['cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp', 220],
  ['cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp', 160],
  ['cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp', 80],
  ['cpp/KesshoCore/src/product/sources/SourcePresetMacros.cpp', 40],
  ['cpp/KesshoCore/src/product/sources/DrumSource.cpp', 80],
  ['cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp', 220],
  ['cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp', 340],
  ['cpp/KesshoCore/src/product/sources/SourceVoiceRuntimeRanges.cpp', 80],
  ['cpp/KesshoCore/src/product/sources/SourcePianoEnvelope.cpp', 120],
  ['cpp/KesshoCore/src/product/sources/SourceMidiRuntime.cpp', 340],
  ['cpp/KesshoCore/src/product/sources/SourceVoiceRelease.cpp', 60],
  ['cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp', 200],
  ['cpp/KesshoCore/src/product/fx/ProductFx.cpp', 80],
  ['cpp/KesshoCore/src/product/fx/ProductFxModules.cpp', 220],
  ['cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp', 540],
  ['cpp/KesshoCore/src/product/fx/ProductDelay.cpp', 120],
  ['cpp/KesshoCore/src/product/fx/ProductReverb.cpp', 220],
  ['cpp/KesshoCore/src/product/fx/ProductGranular.cpp', 160],
  ['cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp', 120],
  ['cpp/KesshoCore/src/product/fx/ProductGranularFilters.cpp', 80],
  ['cpp/KesshoCore/src/product/fx/ProductSpectralFreeze.cpp', 80],
  ['cpp/KesshoCore/src/product/fx/ProductDynamics.cpp', 260],
];
for (const [path, maxLines] of secondStageCaps) {
  assert(lineCount(path) <= maxLines, `${path} is becoming a second-stage monolith (${lineCount(path)} > ${maxLines})`);
}

const allocationFreeHotPathFiles = [
  'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
  'cpp/KesshoCore/src/product/KesshoProductRender.cpp',
  'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
  'cpp/KesshoCore/src/product/sources/SourceTargets.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetMorphRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetMorphSelector.cpp',
  'cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp',
  'cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp',
  'cpp/KesshoCore/src/product/sources/ProductSourcePostChain.cpp',
  'cpp/KesshoCore/src/product/sources/PadSource.cpp',
  'cpp/KesshoCore/src/product/sources/SourceEnable.cpp',
  'cpp/KesshoCore/src/product/sources/SourceGraphTaps.cpp',
  'cpp/KesshoCore/src/product/sources/SourceMix.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulation.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationFx.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetMacros.cpp',
  'cpp/KesshoCore/src/product/sources/DrumSource.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp',
  'cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
  'cpp/KesshoCore/src/product/sources/SourceVoiceRuntimeRanges.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePianoEnvelope.cpp',
  'cpp/KesshoCore/src/product/sources/SourceMidiRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourceVoiceRelease.cpp',
  'cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp',
  'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp',
  'cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp',
  'cpp/KesshoCore/src/product/sequencer/SequencerClock.cpp',
  'cpp/KesshoCore/src/product/sequencer/SequencerEventBuffer.cpp',
  'cpp/KesshoCore/src/product/sequencer/RatchetEngine.cpp',
  'cpp/KesshoCore/src/product/sequencer/TrigConditionEngine.cpp',
  'cpp/KesshoCore/src/product/fx/ProductDelay.cpp',
  'cpp/KesshoCore/src/product/fx/ProductReverb.cpp',
  'cpp/KesshoCore/src/product/fx/ProductGranular.cpp',
  'cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp',
  'cpp/KesshoCore/src/product/fx/ProductGranularFilters.cpp',
  'cpp/KesshoCore/src/product/fx/ProductSpectralFreeze.cpp',
  'cpp/KesshoCore/src/product/fx/ProductDynamics.cpp',
  'cpp/KesshoCore/src/product/music/DeterministicRng.cpp',
  'cpp/KesshoCore/src/product/music/ScaleEngine.cpp',
  'cpp/KesshoCore/src/product/music/HarmonyEngine.cpp',
  'cpp/KesshoCore/src/product/music/VoicingEngine.cpp',
  'cpp/KesshoCore/src/product/music/EvolutionEngine.cpp',
  'cpp/KesshoCore/src/product/music/JourneyMorphClock.cpp',
];
const hotPathAllocationPatterns = [
  [/\bstd::vector\b/, 'std::vector'],
  [/\bstd::string\b/, 'std::string'],
  [/\bstd::unordered_/, 'std::unordered_*'],
  [/\bstd::map\b/, 'std::map'],
  [/\bstd::set\b/, 'std::set'],
  [/\bnew\s/, 'new'],
  [/\bmalloc\s*\(/, 'malloc'],
  [/\bresize\s*\(/, 'resize'],
  [/\breserve\s*\(/, 'reserve'],
  [/\bpush_back\s*\(/, 'push_back'],
];
for (const path of allocationFreeHotPathFiles) {
  const source = read(path);
  for (const [pattern, label] of hotPathAllocationPatterns) {
    assert(!pattern.test(source), `${path} must stay allocation-free on Product hot paths: found ${label}`);
  }
}

{
  const sourceVoiceAllocator = read('cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp');
  for (const forbidden of ['findSourcePreset(', 'sourcePresetPatch(', 'drumVoiceMorphPatch(']) {
    assert(!sourceVoiceAllocator.includes(forbidden), `Product trigger voice path must use precompiled preset state, not ${forbidden}`);
  }
  const sourceModulation = read('cpp/KesshoCore/src/product/sources/SourceModulation.cpp');
  const sourceModulationRoutes = read('cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp');
  const sourceModulationResolve = read('cpp/KesshoCore/src/product/sources/SourceModulationResolve.cpp');
  const sourceModulationCombined = `${sourceModulation}\n${sourceModulationRoutes}\n${sourceModulationResolve}`;
  for (const token of [
    'source_modulation_route_indices',
    'drum_source_modulation_route_indices',
    'drum_runtime_modulation_route_indices',
    'route_required',
    'return fallback;',
  ]) {
    assert(sourceModulationCombined.includes(token), `Product trigger modulation must use compiled route indices: missing ${token}`);
  }
  assert(
    sourceModulationResolve.indexOf('source_modulation_route_indices') < sourceModulationResolve.indexOf('findModulationRange(target_id, param_id)'),
    'Product trigger modulation must consult compiled route indices before any fallback range scan',
  );
  const sourceModuleTrigger = read('cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp');
  const sourceVoiceState = read('cpp/KesshoCore/src/product/ProductVoiceState.h');
  for (const token of [
    'source_preset_runtime_revision',
    'applied_module_patch_ptr',
    'modulePatchAlreadyApplied',
    'recordModulePatchApplied',
  ]) {
    assert(`${sourceModuleTrigger}\n${sourceVoiceState}`.includes(token), `Product module trigger must skip already-applied stable exact patches: missing ${token}`);
  }
}

for (const forbidden of [
  'findModulationRange(',
  'findOrAllocateModulationRange(',
  'applyModulationRangeEvent(',
  'applySourcePresetMacros(',
  'drumVoiceMorphPatch(',
  'exactPadMacrosDifferFromDefaults(',
  'modulationRangeSample(',
  'resolveModulatedValue(',
  'applyRuntimeWalkValue(',
  'advanceModulationRanges(',
  'triggerModuleSource(',
  'triggerVoice(',
  'ensureSoundscapeVoice(',
  'releaseSourceVoices(',
]) {
  assert(!read('cpp/KesshoCore/src/product/sources/ProductSources.cpp').includes(`KesshoProductEngine::${forbidden}`), `ProductSources.cpp must not reclaim focused source runtime method: ${forbidden}`);
}

for (const forbidden of [
  'schedulePadVoiceRelease(',
  'clearPadVoiceReleases(',
  'advancePadVoiceReleases(',
  'mixPadSourceBuffer(',
  'mixSourceBuffer(',
]) {
  assert(!read('cpp/KesshoCore/src/product/sources/ProductSourcePostChain.cpp').includes(`KesshoProductEngine::${forbidden}`), `ProductSourcePostChain.cpp must not reclaim focused source runtime method: ${forbidden}`);
}

const focusedSourceContracts = [
  [
    'cpp/KesshoCore/src/product/sources/ProductSourcePostChain.cpp',
    [
      'KesshoProductEngine::resolveSourcePostLpfHz(',
      'KesshoProductEngine::processPadPostChain(',
      'KesshoProductEngine::processLeadPostChain(',
      'KesshoProductEngine::processVoicePostChain(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/PadSource.cpp',
    [
      'KesshoProductEngine::schedulePadVoiceRelease(',
      'KesshoProductEngine::clearPadVoiceReleases(',
      'KesshoProductEngine::advancePadVoiceReleases(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceMix.cpp',
    [
      'KesshoProductEngine::mixPadSourceBuffer(',
      'KesshoProductEngine::mixSourceBuffer(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp',
    ['KesshoProductEngine::applySourcePresetEvent('],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourcePresetMorphRuntime.cpp',
    ['KesshoProductEngine::activeSequencerMorphForPresetSource('],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp',
    [
      'KesshoProductEngine::applyStructuredSourceOverridesToModule(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceOverrideRuntimeEvents.cpp',
    [
      'KesshoProductEngine::applySourceOverrideEvent(',
      'KesshoProductEngine::applyRuntimeSourceOverrideParam(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceModulation.cpp',
    [
      'KesshoProductEngine::applyModulationRangeEvent(',
      'KesshoProductEngine::modulationRangeSample(',
      'KesshoProductEngine::applyRuntimeWalkValue(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp',
    [
      'KesshoProductEngine::resetModulationRouteCache(',
      'KesshoProductEngine::rebuildModulationRouteCache(',
      'KesshoProductEngine::findModulationRange(',
      'KesshoProductEngine::findOrAllocateModulationRange(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceModulationResolve.cpp',
    ['KesshoProductEngine::resolveModulatedValue('],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp',
    [
      'KesshoProductEngine::advanceModulationRanges(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourcePresetMacros.cpp',
    [
      'KesshoProductEngine::applySourcePresetMacros(',
      'KesshoProductEngine::sourceMacrosDifferFromDefaults(',
    ],
  ],
  ['cpp/KesshoCore/src/product/sources/DrumSource.cpp', ['KesshoProductEngine::drumVoiceMorphPatch(']],
  ['cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp', ['KesshoProductEngine::triggerModuleSource(']],
  [
    'cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
    [
      'KesshoProductEngine::triggerVoice(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceVoiceRuntimeRanges.cpp',
    ['KesshoProductEngine::applySourceExactRuntimeRanges('],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourcePianoEnvelope.cpp',
    ['KesshoProductEngine::configurePianoSampleVoiceEnvelope('],
  ],
  [
    'cpp/KesshoCore/src/product/sources/SourceMidiRuntime.cpp',
    [
      'KesshoProductEngine::resetMidiRuntimeState(',
      'KesshoProductEngine::trackMidiNoteOn(',
      'KesshoProductEngine::applyMidiPitchBendToActiveNotes(',
      'KesshoProductEngine::midiControllerVelocityScale(',
    ],
  ],
  ['cpp/KesshoCore/src/product/sources/SourceVoiceRelease.cpp', ['KesshoProductEngine::releaseSourceVoices(']],
  ['cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp', ['KesshoProductEngine::ensureSoundscapeVoice(']],
];
for (const [path, tokens] of focusedSourceContracts) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} must own focused source runtime token: ${token}`);
  }
}

for (const forbidden of [
  'resetSidechainRuntime(',
  'triggerSidechainDuck(',
  'renderSidechainGains(',
  'mixFxBuffer(',
  'renderDelayModule(',
  'renderGranular(',
  'configureGranularLowpass(',
  'processGranularLowpass(',
  'granularCompressorGainDbForLevel(',
  'renderReverb(',
  'processSpectralFreezeBranch(',
  'renderDynamics(',
  'dynamicsModRoute(',
  'configureDynamicsCharacterModule(',
]) {
  assert(!read('cpp/KesshoCore/src/product/fx/ProductFx.cpp').includes(`KesshoProductEngine::${forbidden}`), `ProductFx.cpp must not reclaim focused FX runtime method: ${forbidden}`);
}

const focusedFxContracts = [
  [
    'cpp/KesshoCore/src/product/fx/ProductFxModules.cpp',
    ['KesshoProductEngine::configureFxModules('],
  ],
  [
    'cpp/KesshoCore/src/product/fx/ProductDynamicsConfig.cpp',
    [
      'KesshoProductEngine::dynamicsModRoute(',
      'KesshoProductEngine::configureDynamicsCharacterModule(',
    ],
  ],
  ['cpp/KesshoCore/src/product/fx/ProductDelay.cpp', ['KesshoProductEngine::renderDelayModule(']],
  [
    'cpp/KesshoCore/src/product/fx/ProductReverb.cpp',
    [
      'KesshoProductEngine::reverbPreCompressorGainDbForLevel(',
      'KesshoProductEngine::processReverbPreconditioner(',
      'KesshoProductEngine::renderReverb(',
    ],
  ],
  ['cpp/KesshoCore/src/product/fx/ProductGranular.cpp', ['KesshoProductEngine::renderGranular(']],
  [
    'cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp',
    [
      'KesshoProductEngine::resetGranularPhraseRuntime(',
      'KesshoProductEngine::granularSendGainForFrame(',
      'KesshoProductEngine::advanceGranularReturnGains(',
      'KesshoProductEngine::advanceGranularPhraseReseed(',
    ],
  ],
  [
    'cpp/KesshoCore/src/product/fx/ProductGranularFilters.cpp',
    [
      'KesshoProductEngine::configureGranularLowpass(',
      'KesshoProductEngine::processGranularLowpass(',
      'KesshoProductEngine::granularCompressorGainDbForLevel(',
    ],
  ],
  ['cpp/KesshoCore/src/product/fx/ProductSpectralFreeze.cpp', ['KesshoProductEngine::processSpectralFreezeBranch(']],
  [
    'cpp/KesshoCore/src/product/fx/ProductDynamics.cpp',
    [
      'KesshoProductEngine::resetSidechainRuntime(',
      'KesshoProductEngine::triggerSidechainDuck(',
      'KesshoProductEngine::renderSidechainGains(',
      'KesshoProductEngine::mixFxBuffer(',
      'KesshoProductEngine::renderDynamics(',
    ],
  ],
];
for (const [path, tokens] of focusedFxContracts) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} must own focused FX runtime token: ${token}`);
  }
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
  'cpp/KesshoCore/src/product/KesshoProductApi.cpp',
  'cpp/KesshoCore/src/product/KesshoProductDebugApi.cpp',
  'cpp/KesshoCore/src/product/KesshoProductAssets.cpp',
  'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
  'cpp/KesshoCore/src/product/KesshoProductGraph.cpp',
  'cpp/KesshoCore/src/product/KesshoProductRender.cpp',
  'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
  'cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp',
  'cpp/KesshoCore/src/product/assets/ProductAssets.cpp',
  'cpp/KesshoCore/src/product/fx/ProductFx.cpp',
  'cpp/KesshoCore/src/product/fx/ProductDelay.cpp',
  'cpp/KesshoCore/src/product/fx/ProductReverb.cpp',
  'cpp/KesshoCore/src/product/fx/ProductGranular.cpp',
  'cpp/KesshoCore/src/product/fx/ProductSpectralFreeze.cpp',
  'cpp/KesshoCore/src/product/fx/ProductDynamics.cpp',
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
  'cpp/KesshoCore/src/product/sources/SourcePresetEvents.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetMorphRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourceOverrideEvents.cpp',
  'cpp/KesshoCore/src/product/sources/PadSource.cpp',
  'cpp/KesshoCore/src/product/sources/SourceEnable.cpp',
  'cpp/KesshoCore/src/product/sources/SourceGraphTaps.cpp',
  'cpp/KesshoCore/src/product/sources/SourceMix.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulation.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationFx.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetBridge.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePresetMacros.cpp',
  'cpp/KesshoCore/src/product/sources/DrumSource.cpp',
  'cpp/KesshoCore/src/product/sources/SourceModuleTrigger.cpp',
  'cpp/KesshoCore/src/product/sources/SourceVoiceAllocator.cpp',
  'cpp/KesshoCore/src/product/sources/SourcePianoEnvelope.cpp',
  'cpp/KesshoCore/src/product/sources/SourceMidiRuntime.cpp',
  'cpp/KesshoCore/src/product/sources/SourceVoiceRelease.cpp',
  'cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp',
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
