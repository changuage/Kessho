#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const webGranularPage = read('src/ui/granular/GranularPage.tsx');
const webMacroModel = read('src/audio/granularMacroModel.ts');
const iosAudioEngine = read('KesshoNativeSwift/Kessho/Audio/AudioEngine.swift');
const iosMacPages = read('KesshoNativeSwift/Kessho/Platform/KesshoMacPages.swift');
const iosAppState = read('KesshoNativeSwift/Kessho/State/AppState.swift');
const iosSliderState = read('KesshoNativeSwift/Kessho/State/SliderState.swift');

for (const token of [
  'computeGranularMacroModel',
  'granularMacroActivity',
  'granularPresetBehavior',
  'granularDiffusion',
  'voiceDensity',
  'voiceGrainSize',
  'voiceSpray',
]) {
  assert(webMacroModel.includes(token), `Web granular macro model must still expose ${token}`);
}

for (const token of [
  'Modes & Macros',
  'granularSpaceMode',
  'granularPresetBehavior',
  'granularShape',
  'GranularBufferCanvas',
  'VOICE_KEYS.map',
]) {
  assert(webGranularPage.includes(token), `Web granular page must still expose ${token}`);
}

for (const token of [
  'NativeGranularVoiceBridge',
  'NativeGranularVoiceSnapshot',
  'granularVoiceBridge()',
  'let granularBridge = granularVoiceBridge()',
  'granularPresetBehavior',
  'granularDiffusion',
  'granularMacroActivity',
  'granularMacroTexture',
  'granularMacroComplexity',
  'granularMacroDarkness',
  'granularMacroChaos',
  'granularOutputLPF',
  'granularProcessor?.setFeedback(Float(granularBridge.feedback))',
  'granularProcessor?.setWetFilters(',
]) {
  assert(iosAudioEngine.includes(token), `Native AudioEngine granular bridge must include ${token}`);
}

const granularUpdateStart = iosAudioEngine.indexOf('// Update granular with the web-style four voice/macro surface');
const granularUpdateEnd = iosAudioEngine.indexOf('// Update synth voices with all parameters');
assert(granularUpdateStart >= 0 && granularUpdateEnd > granularUpdateStart, 'Could not locate native granular update block');
const granularUpdateBlock = iosAudioEngine.slice(granularUpdateStart, granularUpdateEnd);
for (const bridgeToken of [
  'granularBridge.density',
  'granularBridge.grainSizeMin',
  'granularBridge.grainSizeMax',
  'granularBridge.spray',
  'granularBridge.jitter',
  'granularBridge.probability',
  'granularBridge.stereoSpread',
  'granularBridge.pitchSpread',
  'granularBridge.wetHPF',
  'granularBridge.wetLPF',
]) {
  assert(granularUpdateBlock.includes(bridgeToken), `Native granular update must consume ${bridgeToken}`);
}
assert(!granularUpdateBlock.includes('currentParams.feedback'), 'Native granular update must use granularFeedback through the bridge, not legacy feedback');

for (const token of [
  'private var macroCard',
  'private var voicesCard',
  'private func granularVoiceSection',
  'Modes + Macros',
  'Four Voices',
  'granularSpaceMode',
  'granularPresetBehavior',
  'granularShape',
  'granularDiffusion',
  'granularFeedback',
  'granularReverbLPF',
  'granularOutputLPF',
]) {
  assert(iosMacPages.includes(token), `macOS Granular page must expose ${token}`);
}

const macroKeys = [
  'granularDiffusion',
  'granularMacroActivity',
  'granularMacroTexture',
  'granularMacroComplexity',
  'granularMacroDarkness',
  'granularMacroChaos',
  'granularChordBias',
  'granularFeedback',
  'granularReverbLPF',
  'granularOutputLPF',
];

const voiceSuffixes = [
  'Slice',
  'Speed',
  'ScanRate',
  'Pitch',
  'Attack',
  'Decay',
  'Blur',
  'GrainOct',
  'Spray',
  'Density',
  'GrainSize',
  'Pan',
  'Gain',
  'PosLFORate',
  'PosLFODepth',
  'PanLFORate',
  'StereoSpread',
  'ReverseLFORate',
  'WriteFollow',
  'RecordLFORate',
];

const voiceKeys = [];
for (let voice = 1; voice <= 4; voice += 1) {
  for (const suffix of voiceSuffixes) {
    voiceKeys.push(`granularV${voice}${suffix}`);
  }
}

for (const key of [...macroKeys, ...voiceKeys]) {
  assert(iosSliderState.includes(`var ${key}:`), `SliderState must define ${key}`);
  assert(iosAppState.includes(`case "${key}"`), `AppState.setSliderValue must mutate ${key}`);
  assert(iosMacPages.includes(`key: "${key}"`), `macOS Granular page must include a slider for ${key}`);
}

for (const key of ['granularV1Mode', 'granularV2Mode', 'granularV3Mode', 'granularV4Mode']) {
  assert(iosSliderState.includes(`var ${key}: String`), `SliderState must define mode key ${key}`);
  assert(iosMacPages.includes(key), `macOS Granular page must expose mode key ${key}`);
  assert(iosAudioEngine.includes(`currentParams.${key}`), `AudioEngine bridge must consume mode key ${key}`);
}

console.log('Native granular parity checks passed');
