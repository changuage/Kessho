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

function extractWebSliderKeys(source) {
  const interfaceStart = source.indexOf('export interface SliderState');
  const defaultsStart = source.indexOf('export const DEFAULT_STATE');
  assert(interfaceStart >= 0 && defaultsStart > interfaceStart, 'Could not locate web SliderState interface');
  const body = source.slice(interfaceStart, defaultsStart);
  return [...body.matchAll(/^\s{2}([A-Za-z_]\w+)\??:/gm)].map(match => match[1]);
}

function extractSwiftSliderKeys(source) {
  const structStart = source.indexOf('public struct SliderState');
  assert(structStart >= 0, 'Could not locate iOS SliderState struct');
  return [...source.slice(structStart).matchAll(/^\s{4}var\s+([A-Za-z_]\w+)\??\s*:/gm)].map(match => match[1]);
}

function extractSwiftSliderTypes(source) {
  const structStart = source.indexOf('public struct SliderState');
  const defaultsStart = source.indexOf('static let `default`');
  assert(structStart >= 0 && defaultsStart > structStart, 'Could not locate iOS SliderState body');
  return new Map(
    [...source.slice(structStart, defaultsStart).matchAll(/^\s{4}var\s+([A-Za-z_]\w+)\??\s*:\s*([A-Za-z0-9_<>?]+)/gm)]
      .map(match => [match[1], match[2]])
  );
}

function extractBalancedCalls(source, callee) {
  const calls = [];
  let index = 0;
  const needle = `${callee}(`;

  while ((index = source.indexOf(needle, index)) >= 0) {
    let position = index + needle.length;
    let depth = 1;
    let inString = false;
    let escaped = false;

    while (position < source.length && depth > 0) {
      const char = source[position];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      }
      position += 1;
    }

    calls.push(source.slice(index, position));
    index = position;
  }

  return calls;
}

function extractUpdateSliderKeys(source) {
  const updateStart = source.indexOf('private func updateSliderStateValue');
  const updateEnd = source.indexOf('    private func loadPresets');
  assert(updateStart >= 0 && updateEnd > updateStart, 'Could not locate AppState.updateSliderStateValue');
  return new Set(
    [...source.slice(updateStart, updateEnd).matchAll(/case ([^:\n]+):/g)]
      .flatMap(match => [...match[1].matchAll(/"([^"]+)"/g)].map(keyMatch => keyMatch[1]))
  );
}

const webSource = read('src/ui/state.ts');
const swiftSource = read('KesshoNativeSwift/Kessho/State/SliderState.swift');
const appState = read('KesshoNativeSwift/Kessho/State/AppState.swift');
const audioEngine = read('KesshoNativeSwift/Kessho/Audio/AudioEngine.swift');
const reverbProcessor = read('KesshoNativeSwift/Kessho/Audio/ReverbProcessor.swift');
const sliderControls = read('KesshoNativeSwift/Kessho/Views/SliderControlsView.swift');

const webKeys = new Set(extractWebSliderKeys(webSource));
const swiftKeys = new Set(extractSwiftSliderKeys(swiftSource));
const swiftTypes = extractSwiftSliderTypes(swiftSource);
const updateSliderKeys = extractUpdateSliderKeys(appState);
const missingInIOS = [...webKeys].filter(key => !swiftKeys.has(key)).sort();
const iosOnly = [...swiftKeys].filter(key => !webKeys.has(key)).sort();

assert(
  missingInIOS.length === 0,
  `iOS SliderState must include every web SliderState key; missing ${missingInIOS.length}: ${missingInIOS.slice(0, 40).join(', ')}`
);

assert(
  swiftSource.includes('public init() {}'),
  'SliderState must keep an explicit empty initializer so Swift does not synthesize an enormous memberwise initializer'
);

const parameterSliderCalls = extractBalancedCalls(sliderControls, 'ParameterSlider');
const labelDerivedSliders = parameterSliderCalls.filter(call => !/\bkey:\s*(?:"|[A-Za-z_]\w*)/.test(call));
assert(
  labelDerivedSliders.length === 0,
  `iOS ParameterSlider calls must pass explicit state keys; missing ${labelDerivedSliders.length}`
);

const sliderLiteralKeys = new Set([...sliderControls.matchAll(/\bkey:\s*"([^"]+)"/g)].map(match => match[1]));
for (const match of sliderControls.matchAll(/\bdelay[AB]Key:\s*"([^"]+)"/g)) {
  sliderLiteralKeys.add(match[1]);
}

const missingSliderSetters = [...sliderLiteralKeys]
  .filter(key => ['Double', 'Int'].includes(swiftTypes.get(key)) && !updateSliderKeys.has(key))
  .sort();
assert(
  missingSliderSetters.length === 0,
  `iOS numeric sliders must be mutable through AppState.setSliderValue; missing ${missingSliderSetters.length}: ${missingSliderSetters.join(', ')}`
);

const criticalParityKeys = [
  'reverbEnabled',
  'reverbQuality',
  'reverbLevel',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'reverbShimmer',
  'reverbShimmerPitch',
  'reverbShimmerFeedback',
  'reverbWarp',
  'reverbCrossFeed',
  'reverbTransientSmooth',
  'earthLevel',
  'oceanSampleEnabled',
  'oceanSampleLevel',
  'oceanReverbSend',
  'oceanDelayASend',
  'oceanDelayBSend',
  'natureLevel',
  'natureReverbSend',
  'natureDelayASend',
  'natureDelayBSend',
  'waterEnabled',
  'waterLevel',
  'waterReverbSend',
  'waterDelayASend',
  'waterDelayBSend',
  'insectsReverbSend',
];

for (const key of criticalParityKeys) {
  assert(webKeys.has(key), `Critical parity key missing from web SliderState: ${key}`);
  assert(swiftKeys.has(key), `Critical parity key missing from iOS SliderState: ${key}`);
}

for (const key of [
  'oceanReverbSend',
  'natureReverbSend',
  'waterReverbSend',
  'reverbShimmerFeedback',
  'reverbWarp',
  'reverbCrossFeed',
  'reverbTransientSmooth',
]) {
  assert(appState.includes(`case "${key}"`), `AppState.updateParameter must bridge ${key}`);
}

assert(
  audioEngine.includes('engine.connect(oceanMixer, to: oceanReverbSendMixer') &&
    audioEngine.includes('engine.connect(oceanReverbSendMixer, to: reverbSend') &&
    audioEngine.includes('engine.connect(natureMixer, to: natureReverbSendMixer') &&
    audioEngine.includes('engine.connect(natureReverbSendMixer, to: reverbSend'),
  'AudioEngine must keep dedicated ocean/nature reverb send buses'
);

assert(
  audioEngine.includes('currentParams.oceanReverbSend * reverbSendScale') &&
    audioEngine.includes('currentParams.waterReverbSend') &&
    audioEngine.includes('currentParams.natureReverbSend'),
  'AudioEngine must derive ocean/water/nature reverb-send volumes from real send fields'
);

assert(
  reverbProcessor.includes('shimmerFeedback: Float = 0') &&
    reverbProcessor.includes('warp: Float = 0') &&
    reverbProcessor.includes('transientSmooth: Float = 0') &&
    reverbProcessor.includes('if shimmer > 0.0001') &&
    reverbProcessor.includes('if warp > 0.0001') &&
    reverbProcessor.includes('if transientSmooth > 0.0001'),
  'ReverbProcessor must keep advanced web reverb modifiers wired'
);

console.log(`Web SliderState keys: ${webKeys.size}`);
console.log(`iOS SliderState keys: ${swiftKeys.size}`);
console.log(`Missing in iOS: ${missingInIOS.length}${missingInIOS.length ? ` (${missingInIOS.slice(0, 40).join(', ')}${missingInIOS.length > 40 ? ', ...' : ''})` : ''}`);
console.log(`iOS-only keys: ${iosOnly.length}${iosOnly.length ? ` (${iosOnly.slice(0, 20).join(', ')}${iosOnly.length > 20 ? ', ...' : ''})` : ''}`);
console.log('iOS state parity checks passed for critical reverb/water fields');
