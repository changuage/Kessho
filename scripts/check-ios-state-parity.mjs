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

const webSource = read('src/ui/state.ts');
const swiftSource = read('KesshoiOS/Kessho/State/SliderState.swift');
const appState = read('KesshoiOS/Kessho/State/AppState.swift');
const audioEngine = read('KesshoiOS/Kessho/Audio/AudioEngine.swift');
const reverbProcessor = read('KesshoiOS/Kessho/Audio/ReverbProcessor.swift');

const webKeys = new Set(extractWebSliderKeys(webSource));
const swiftKeys = new Set(extractSwiftSliderKeys(swiftSource));
const missingInIOS = [...webKeys].filter(key => !swiftKeys.has(key)).sort();
const iosOnly = [...swiftKeys].filter(key => !webKeys.has(key)).sort();

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
