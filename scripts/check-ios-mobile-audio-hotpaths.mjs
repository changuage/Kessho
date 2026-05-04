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

const drumSynth = read('KesshoiOS/Kessho/Audio/DrumSynth.swift');
const drumNodeStart = drumSynth.indexOf('lazy var node: AVAudioSourceNode');
const drumNodeEnd = drumSynth.indexOf('// Parameters');
const drumSourceNode = drumSynth.slice(drumNodeStart, drumNodeEnd);
assert(
  drumSourceNode.includes('voiceLock.try()'),
  'DrumSynth render callback must use voiceLock.try() instead of blocking'
);
assert(
  !drumSourceNode.includes('voiceLock.lock()'),
  'DrumSynth render callback must not block on voiceLock.lock()'
);
assert(
  drumSynth.includes('DispatchSourceTimer') &&
    drumSynth.includes('DispatchSource.makeTimerSource(queue: schedulerQueue)') &&
    drumSynth.includes('schedulerSnapshot()'),
  'DrumSynth schedulers must use DispatchSourceTimer with a locked state snapshot'
);
assert(
  !drumSynth.includes('scheduledTimer') && !/:\s*Timer\??/.test(drumSynth),
  'DrumSynth must not use Foundation Timer for playback scheduling'
);

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
assert(
  !audioEngine.includes('Timer.scheduledTimer') && !/:\s*Timer\??/.test(audioEngine),
  'AudioEngine scheduling must not keep Foundation Timer playback paths'
);
const profileStart = audioEngine.indexOf('private func mobilePerformanceProfile(for params: SliderState)');
const profileEnd = audioEngine.indexOf('private func requestedReverbQuality');
const profileBody = audioEngine.slice(profileStart, profileEnd);
assert(
  profileBody.includes('var activeSources = 0') &&
    !profileBody.includes('let activeSources = [') &&
    !profileBody.includes('].filter'),
  'AudioEngine mobile performance profile must count active sources without temporary array allocation'
);
const euclideanPhraseStart = audioEngine.indexOf('private func scheduleEuclideanPhrase()');
const euclideanPhraseEnd = audioEngine.indexOf('private func startFilterModulation');
const euclideanPhraseBody = audioEngine.slice(euclideanPhraseStart, euclideanPhraseEnd);
assert(
  euclideanPhraseBody.includes('NoteRangeKey') &&
    euclideanPhraseBody.includes('noteRangeCache') &&
    euclideanPhraseBody.includes('if let cachedNotes = noteRangeCache[noteRangeKey]'),
  'AudioEngine Euclidean phrase scheduling must cache scale-note ranges per phrase'
);

const appState = read('KesshoiOS/Kessho/State/AppState.swift');
const updateParamCalls = [...appState.matchAll(/audioEngine\.updateParams\(/g)].length;
assert(
  updateParamCalls === 1 && appState.includes('scheduleAudioEngineUpdate'),
  'AppState should coalesce state changes before calling audioEngine.updateParams'
);
assert(
  appState.includes('DispatchSourceTimer') &&
    appState.includes('updateRandomWalkTimer()') &&
    appState.includes('leeway: .milliseconds(40)') &&
    appState.includes('leeway: .milliseconds(250)') &&
    !appState.includes('Timer.scheduledTimer') &&
    !/:\s*Timer\??/.test(appState),
  'AppState timers must use DispatchSourceTimer with leeway and sleep when no random-walk ranges are active'
);

const dynamics = read('KesshoiOS/Kessho/Audio/DynamicsCharacterProcessor.swift');
assert(
  !dynamics.includes('var params = [Float](repeating: 0, count: paramCount)'),
  'DynamicsCharacterProcessor should reuse parameter storage instead of allocating every update'
);

const reverb = read('KesshoiOS/Kessho/Audio/ReverbProcessor.swift');
const reverbWriteInputStart = reverb.indexOf('func writeInput(buffer: AVAudioPCMBuffer)');
const reverbHardResetStart = reverb.indexOf('func hardReset()');
const reverbWriteInputBody = reverb.slice(reverbWriteInputStart, reverbHardResetStart);
assert(
  reverb.includes('private let inputLock = NSLock()') &&
    reverb.includes('dequeueInputBlock(frameCount: Int(frameCount))') &&
    reverbWriteInputBody.includes('guard inputLock.try() else { return }') &&
    !reverbWriteInputBody.includes('stateLock.try()'),
  'ReverbProcessor live input ring must use its own non-blocking input lock instead of contending with DSP state'
);

console.log('iOS mobile audio hotpath checks passed');
