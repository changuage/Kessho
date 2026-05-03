import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertRenderUsesTryLock(relativePath) {
  const source = read(relativePath);
  const renderMatches = source.matchAll(/private func render\([^)]*\)\s*\{([\s\S]*?)(?=\n    private |\n    func |\n    var |\n    @inline|\n\})/g);
  for (const match of renderMatches) {
    const body = match[1].slice(0, 600);
    assert(
      body.includes('stateLock.try()'),
      `${relativePath} render path must use stateLock.try() instead of blocking`
    );
    assert(
      !body.includes('stateLock.lock()'),
      `${relativePath} render path must not block on stateLock.lock()`
    );
  }
}

function assertSourceNodeUsesTryLock(relativePath) {
  const source = read(relativePath);
  if (!source.includes('AVAudioSourceNode')) return;
  const sourceNodeBodies = source.matchAll(/AVAudioSourceNode\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\s*\}/g);
  for (const match of sourceNodeBodies) {
    const body = match[1].slice(0, 900);
    if (!body.includes('stateLock')) continue;
    assert(
      body.includes('stateLock.try()'),
      `${relativePath} source-node callback must use stateLock.try()`
    );
    assert(
      !body.includes('stateLock.lock()'),
      `${relativePath} source-node callback must not block on stateLock.lock()`
    );
  }
}

for (const file of [
  'KesshoiOS/Kessho/Audio/GranularProcessor.swift',
  'KesshoiOS/Kessho/Audio/ReverbProcessor.swift',
  'KesshoiOS/Kessho/Audio/SharedDelayProcessor.swift',
  'KesshoiOS/Kessho/Audio/DynamicsCharacterProcessor.swift',
  'KesshoiOS/Kessho/Audio/SpectralFreezeProcessor.swift',
]) {
  assertRenderUsesTryLock(file);
  assertSourceNodeUsesTryLock(file);
}

const audioEngine = read('KesshoiOS/Kessho/Audio/AudioEngine.swift');
const setupStart = audioEngine.indexOf('private func setupAudioGraph()');
const setupEnd = audioEngine.indexOf('private func installSignalDebugTap');
const setupGraphBody = audioEngine.slice(setupStart, setupEnd);
assert(
  !setupGraphBody.includes('setupGranularInputTap(format:') &&
    !setupGraphBody.includes('setupReverbInputTap(format:') &&
    !setupGraphBody.includes('setupDynamicsCharacterInputTap(format:'),
  'AudioEngine.setupAudioGraph must not install granular/reverb/dynamics taps unconditionally'
);
assert(
  audioEngine.includes('updateConditionalInputTaps()'),
  'AudioEngine must keep tap installation behind updateConditionalInputTaps()'
);
assert(
  audioEngine.includes('removeConditionalInputTaps()'),
  'AudioEngine must remove conditional taps on stop'
);
assert(
  audioEngine.includes('MobilePerformanceProfile') &&
    audioEngine.includes('ProcessInfo.processInfo.thermalState'),
  'AudioEngine must keep the mobile thermal/performance governor wired in'
);

const appState = read('KesshoiOS/Kessho/State/AppState.swift');
const updateParamCalls = [...appState.matchAll(/audioEngine\.updateParams\(/g)].length;
assert(
  updateParamCalls === 1 && appState.includes('scheduleAudioEngineUpdate'),
  'AppState should coalesce state changes before calling audioEngine.updateParams'
);

const dynamics = read('KesshoiOS/Kessho/Audio/DynamicsCharacterProcessor.swift');
assert(
  !dynamics.includes('var params = [Float](repeating: 0, count: paramCount)'),
  'DynamicsCharacterProcessor should reuse parameter storage instead of allocating every update'
);

console.log('iOS mobile audio hotpath checks passed');
