import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import {
  kesshoCoreIncludeArgs,
  resolveKesshoCoreSources,
} from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-core-golden-profile-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-core-golden-profile-latest.md');
const buildDir = resolve(root, 'build/kessho-core/golden-profile');
const nativeFixtureSource = resolve(root, 'cpp/KesshoCore/tests/kessho_core_golden_profile_fixture.cpp');
const nativeFixtureBinary = resolve(buildDir, 'kessho_core_golden_profile_fixture');
const coreSources = resolveKesshoCoreSources(root);

const sampleRate = 48000;
const blockSize = 128;
const renderSeconds = 30;
const totalFrames = sampleRate * renderSeconds;
const realtimeBlockBudgetMs = (blockSize / sampleRate) * 1000;
const totalSamples = totalFrames * 2;

const moduleTypeDynamicsCharacter = 1;
const moduleTypePad = 7;
const padNumVoices = 6;
const padParamCount = 108;
const padParamsPerPad = 53;
const padEngineTrim = 0.5;
const defaultMasterVolume = 0.85;
const masterOutputTrim = 1.18;
const centroidWindowSize = 2048;
const centroidHopFrames = sampleRate / 2;
const centroidMaxWindows = Math.floor(renderSeconds * 2);
const fixtureInputMagic = 0x3150474b;
const fixtureOutputMagic = 0x314f474b;
const fixtureOutputHeaderBytes = 28;
const nativeWasmResidualRmsFloor = 2.0e-5;
const nativeWasmResidualRatioLimit = 5.0e-4;
const nativeWasmResidualPeakFloor = 2.0e-4;
const nativeWasmResidualPeakRatioLimit = 1.0e-3;

const padIndex = {
  oscAWave: 0,
  oscAOctave: 1,
  oscADetune: 2,
  oscALevel: 3,
  oscBWave: 4,
  oscBOctave: 5,
  oscBDetune: 6,
  oscBLevel: 7,
  oscMix: 8,
  subEnabled: 9,
  subOctave: 10,
  subWave: 11,
  subLevel: 12,
  noiseType: 13,
  noiseLevel: 14,
  hardness: 15,
  warmth: 16,
  presence: 17,
  foldAmount: 18,
  foldMode: 19,
  filterType: 20,
  filterCutoffMin: 21,
  filterCutoffMax: 22,
  filterResonance: 23,
  filterQ: 24,
  filterSlope: 25,
  filterKeyTracking: 26,
  filterBEnabled: 27,
  filterBType: 28,
  filterBCutoff: 29,
  filterBResonance: 30,
  filterBQ: 31,
  filterRouting: 32,
  attack: 33,
  decay: 34,
  sustain: 35,
  release: 36,
  lfo1Rate: 37,
  lfo1Depth: 38,
  lfo1Wave: 39,
  lfo1Dest: 40,
  lfo2Rate: 41,
  lfo2Depth: 42,
  lfo2Wave: 43,
  lfo2Dest: 44,
  modEnvEnabled: 45,
  modEnvAttack: 46,
  modEnvDecay: 47,
  modEnvSustain: 48,
  modEnvRelease: 49,
  modEnvDepth: 50,
  modEnvDest: 51,
  level: 52,
};

const waveValues = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
const filterValues = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3 };
const lfoWaveValues = {
  sine: 0,
  triangle: 1,
  sawtooth: 2,
  square: 3,
  sampleHold: 4,
  randomSmooth: 5,
  randomWalk: 6,
};
const destValues = {
  none: 0,
  filterCutoff: 1,
  filterB: 2,
  filterBCutoff: 2,
  amplitude: 3,
  pitch: 4,
  oscBLevel: 5,
  foldAmount: 6,
};
const noiseValues = { white: 0, pink: 1 };
const routeValues = { series: 0, aOnly: 1, bOnly: 2 };

const padParamSpecs = [
  ['padOscAWave', padIndex.oscAWave, waveValues, 1],
  ['padOscAOctave', padIndex.oscAOctave, null, 0],
  ['padOscADetune', padIndex.oscADetune, null, 0],
  ['padOscALevel', padIndex.oscALevel, null, 0.38],
  ['padOscBWave', padIndex.oscBWave, waveValues, 0],
  ['padOscBOctave', padIndex.oscBOctave, null, 0],
  ['padOscBDetune', padIndex.oscBDetune, null, 4],
  ['padOscBLevel', padIndex.oscBLevel, null, 0.25],
  ['padOscMix', padIndex.oscMix, null, 0.5],
  ['padSubEnabled', padIndex.subEnabled, null, 1],
  ['padSubOctave', padIndex.subOctave, null, -1],
  ['padSubWave', padIndex.subWave, waveValues, 0],
  ['padSubLevel', padIndex.subLevel, null, 0.13],
  ['padNoiseType', padIndex.noiseType, noiseValues, 0],
  ['padNoiseLevel', padIndex.noiseLevel, null, 0.01],
  ['hardness', padIndex.hardness, null, 0.04],
  ['warmth', padIndex.warmth, null, 0.7],
  ['presence', padIndex.presence, null, 0.18],
  ['padFoldAmount', padIndex.foldAmount, null, 0],
  ['padFoldMode', padIndex.foldMode, null, 0],
  ['filterType', padIndex.filterType, filterValues, 0],
  ['filterCutoffMin', padIndex.filterCutoffMin, null, 140],
  ['filterCutoffMax', padIndex.filterCutoffMax, null, 1000],
  ['filterResonance', padIndex.filterResonance, null, 0.14],
  ['filterQ', padIndex.filterQ, null, 1],
  ['filterSlope', padIndex.filterSlope, null, 12],
  ['filterKeyTracking', padIndex.filterKeyTracking, null, 0],
  ['padFilterBEnabled', padIndex.filterBEnabled, null, 0],
  ['padFilterBType', padIndex.filterBType, filterValues, 2],
  ['padFilterBCutoff', padIndex.filterBCutoff, null, 200],
  ['padFilterBResonance', padIndex.filterBResonance, null, 0.2],
  ['padFilterBQ', padIndex.filterBQ, null, 1],
  ['padFilterRouting', padIndex.filterRouting, routeValues, 0],
  ['synthAttack', padIndex.attack, null, 0.55],
  ['synthDecay', padIndex.decay, null, 1],
  ['synthSustain', padIndex.sustain, null, 0.8],
  ['synthRelease', padIndex.release, null, 8],
  ['padLfo1Rate', padIndex.lfo1Rate, null, 0.08],
  ['padLfo1Depth', padIndex.lfo1Depth, null, 0.32],
  ['padLfo1Wave', padIndex.lfo1Wave, lfoWaveValues, 6],
  ['padLfo1Dest', padIndex.lfo1Dest, destValues, 1],
  ['padLfo2Rate', padIndex.lfo2Rate, null, 0.5],
  ['padLfo2Depth', padIndex.lfo2Depth, null, 0],
  ['padLfo2Wave', padIndex.lfo2Wave, lfoWaveValues, 0],
  ['padLfo2Dest', padIndex.lfo2Dest, destValues, 0],
  ['padModEnvEnabled', padIndex.modEnvEnabled, null, 0],
  ['padModEnvAttack', padIndex.modEnvAttack, null, 0.5],
  ['padModEnvDecay', padIndex.modEnvDecay, null, 2],
  ['padModEnvSustain', padIndex.modEnvSustain, null, 0],
  ['padModEnvRelease', padIndex.modEnvRelease, null, 4],
  ['padModEnvDepth', padIndex.modEnvDepth, null, 0.5],
  ['padModEnvDest', padIndex.modEnvDest, destValues, 1],
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  return execFileSync(command, args, { cwd: root, ...options });
}

function compileNativeFixture() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });
  run('/usr/bin/clang++', [
    '-std=c++17',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    ...kesshoCoreIncludeArgs(root),
    ...coreSources,
    nativeFixtureSource,
    '-o',
    nativeFixtureBinary,
  ], { stdio: 'inherit' });
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function boundedInteger(value, fallback, min, max) {
  return Math.round(clamp(finiteNumber(value, fallback), min, max));
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function enumParam(value, map, fallback) {
  if (typeof value === 'string' && map && Object.hasOwn(map, value)) return map[value];
  if (typeof value === 'boolean') return value ? 1 : 0;
  return finiteNumber(value, fallback);
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
  }
  return value;
}

function loadPresetState(file) {
  const absolutePath = resolve(root, file);
  const source = readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(source.replace(/,\s*([}\]])/g, '$1'));
  return {
    id: file.replace(/^.*\//, '').replace(/\.json$/, ''),
    name: parsed.name ?? file,
    source: file,
    state: parsed.state ?? {},
  };
}

function blendStates(a, b, amount) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const blended = {};
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (typeof left === 'number' && typeof right === 'number') {
      blended[key] = left + (right - left) * amount;
    } else {
      blended[key] = amount < 0.5 ? left ?? right : right ?? left;
    }
  }
  return blended;
}

function goldenCandidates() {
  const ethereal = loadPresetState('KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json');
  const dark = loadPresetState('KesshoNativeSwift/Kessho/Presets/Dark_Textures.json');
  return [
    {
      scenario: 'low-cpu-ambient-pad',
      ...ethereal,
    },
    {
      scenario: 'dense-pad-reverb',
      ...dark,
    },
    {
      id: 'journey_ethereal_to_dark_midpoint',
      name: 'Journey Midpoint: Ethereal Ambient to Dark Textures',
      scenario: 'journey-morph',
      source: 'synthetic blend of KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json and Dark_Textures.json',
      state: blendStates(ethereal.state, dark.state, 0.5),
    },
  ];
}

function deriveScalars(candidate) {
  const state = candidate.state;
  const serialized = JSON.stringify(stableSort({ id: candidate.id, state }));
  const hash = stableHash(serialized);
  const synthLevel = booleanValue(state.padEnabled, true) ? finiteNumber(state.synthLevel, 0.6) : 0;
  const pad2Level = booleanValue(state.pad2Enabled, false) ? finiteNumber(state.pad2Level, 0) : 0;
  const leadLevel = booleanValue(state.leadEnabled, true) ? finiteNumber(state.leadLevel ?? state.lead1Level, 0) : 0;
  const granularLevel = booleanValue(state.granularEnabled, true) ? finiteNumber(state.granularLevel, 0) : 0;
  const audibleLevel = clamp((synthLevel + pad2Level + leadLevel + granularLevel * 0.5) / 3, 0, 1);
  const seed = hash % 16777215 || 1;
  const bpm = clamp(finiteNumber(state.sequencerMasterBPM ?? state.synthEuclidBaseBPM ?? state.drumEuclidBaseBPM, 120), 40, 300);
  return {
    sampleRate,
    blockSize,
    renderSeconds,
    seed,
    bpm,
    masterGain: clamp(finiteNumber(state.masterVolume, defaultMasterVolume) * masterOutputTrim, 0, 1.5),
    smokeAmplitude: audibleLevel > 0.0001 ? clamp(0.04 + audibleLevel * 0.16, 0.02, 0.22) : 0,
    beatsPerBar: boundedInteger(state.transportBeatsPerBar, 4, 1, 64),
    barsPerPhrase: boundedInteger(state.transportBarsPerPhrase, 4, 1, 256),
    automationEvents: 0,
    midiEvents: 0,
  };
}

function padStateKey(baseKey, pad) {
  if (pad === 0) return baseKey;
  const explicit = {
    hardness: 'pad2Hardness',
    warmth: 'pad2Warmth',
    presence: 'pad2Presence',
    filterType: 'pad2FilterType',
    filterCutoffMin: 'pad2FilterCutoffMin',
    filterCutoffMax: 'pad2FilterCutoffMax',
    filterResonance: 'pad2FilterResonance',
    filterQ: 'pad2FilterQ',
    filterSlope: 'pad2FilterSlope',
    synthAttack: 'pad2Attack',
    synthDecay: 'pad2Decay',
    synthSustain: 'pad2Sustain',
    synthRelease: 'pad2Release',
  };
  if (explicit[baseKey]) return explicit[baseKey];
  if (baseKey.startsWith('pad')) {
    return `pad2${baseKey.slice(3)}`;
  }
  return baseKey;
}

function writePadParams(params, state, pad, level) {
  const base = pad * padParamsPerPad;
  for (const [baseKey, index, enumMap, fallback] of padParamSpecs) {
    const stateKey = padStateKey(baseKey, pad);
    const raw = state[stateKey] ?? state[baseKey] ?? fallback;
    params[base + index] = enumParam(raw, enumMap, fallback);
  }

  const legacyCutoff = finiteNumber(state[padStateKey('filterCutoff', pad)] ?? state.filterCutoff, NaN);
  if (Number.isFinite(legacyCutoff)) {
    params[base + padIndex.filterCutoffMin] = Math.min(params[base + padIndex.filterCutoffMin], Math.max(40, legacyCutoff * 0.08));
    params[base + padIndex.filterCutoffMax] = legacyCutoff;
  }

  params[base + padIndex.subEnabled] = params[base + padIndex.subEnabled] > 0.5 ? 1 : 0;
  params[base + padIndex.filterBEnabled] = params[base + padIndex.filterBEnabled] > 0.5 ? 1 : 0;
  params[base + padIndex.modEnvEnabled] = params[base + padIndex.modEnvEnabled] > 0.5 ? 1 : 0;
  params[base + padIndex.level] = clamp(level, 0, 1);
}

function midiToFrequency(midiNote) {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function createPadPreviewChords(state, velocity) {
  const root = boundedInteger(state.rootNote, 0, 0, 11);
  const rootMidi = 48 + root;
  const chordIntervals = [
    [0, 7, 10, 14, 17, 24],
    [-2, 5, 9, 12, 16, 21],
    [3, 10, 14, 17, 21, 27],
    [5, 12, 15, 19, 22, 29],
  ];
  return chordIntervals.map((intervals) => intervals.map((interval, route) => ({
    frequency: midiToFrequency(rootMidi + interval),
    velocity: clamp(velocity, 0.05, 1),
    route,
  })));
}

function createPadPreviewConfig(candidate) {
  const state = candidate.state;
  const scalars = deriveScalars(candidate);
  const params = Array.from({ length: padParamCount }, () => 0);
  const pad1Level = booleanValue(state.padEnabled, true) ? finiteNumber(state.synthLevel, 0.6) * padEngineTrim : 0;
  const pad2Level = booleanValue(state.pad2Enabled, false) ? finiteNumber(state.pad2Level, 0.6) * padEngineTrim : 0;
  const hasPadLevel = pad1Level > 0.001 || pad2Level > 0.001;
  assert(hasPadLevel, `${candidate.name} profile has no pad source level`);

  writePadParams(params, state, 0, pad1Level);
  writePadParams(params, state, 1, pad2Level);
  params[padParamsPerPad * 2] = clamp(finiteNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.1), 0, 1);
  params[padParamsPerPad * 2 + 1] = 0;

  return {
    params,
    chords: createPadPreviewChords(state, 1),
    chordFrames: Math.round(3.5 * sampleRate),
    scalars,
  };
}

function fixtureInput(config, withDryDynamics) {
  const noteCount = config.chords.reduce((sum, chord) => sum + chord.length, 0);
  const bytes =
    4 * 4 +
    padParamCount * Float32Array.BYTES_PER_ELEMENT +
    config.chords.length * 4 +
    noteCount * (Float32Array.BYTES_PER_ELEMENT * 2 + Int32Array.BYTES_PER_ELEMENT);
  const buffer = Buffer.alloc(bytes);
  let offset = 0;
  buffer.writeUInt32LE(fixtureInputMagic, offset);
  offset += 4;
  buffer.writeUInt32LE(withDryDynamics ? 1 : 0, offset);
  offset += 4;
  buffer.writeUInt32LE(config.chordFrames, offset);
  offset += 4;
  buffer.writeUInt32LE(config.chords.length, offset);
  offset += 4;

  for (const value of config.params) {
    buffer.writeFloatLE(value, offset);
    offset += 4;
  }

  for (const chord of config.chords) {
    buffer.writeUInt32LE(chord.length, offset);
    offset += 4;
    for (const note of chord) {
      buffer.writeFloatLE(note.frequency, offset);
      offset += 4;
      buffer.writeFloatLE(note.velocity, offset);
      offset += 4;
      buffer.writeInt32LE(note.route, offset);
      offset += 4;
    }
  }

  return buffer;
}

function makeDryDynamicsParams() {
  const params = new Float32Array(82);
  params[0] = 1;
  params[1] = 0;
  params[2] = 1;
  params[3] = 0;
  return params;
}

function wasmImports() {
  return {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => {},
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  };
}

async function instantiateCore() {
  if (!existsSync(wasmPath)) {
    throw new Error('Missing public/worklets/kessho_core.wasm. Run `npm run core:build:wasm` first.');
  }
  const module = await WebAssembly.compile(readFileSync(wasmPath));
  return WebAssembly.instantiate(module, wasmImports());
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function writeModuleParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function configureModule(api, heap, module, params) {
  const ptr = api.moduleGetParamsPtr(module);
  assert(ptr !== 0, 'module params pointer was null');
  writeModuleParams(heap, ptr, params);
  api.moduleCommitParams(module);
}

function createApi(wasm) {
  return {
    malloc: requireExport(wasm, 'malloc'),
    free: requireExport(wasm, 'free'),
    moduleCreate: requireExport(wasm, 'kessho_module_create'),
    moduleDestroy: requireExport(wasm, 'kessho_module_destroy'),
    moduleGetParamsPtr: requireExport(wasm, 'kessho_module_get_params_ptr'),
    moduleCommitParams: requireExport(wasm, 'kessho_module_commit_params'),
    moduleNoteOn: requireExport(wasm, 'kessho_module_note_on'),
    moduleAllNotesOff: requireExport(wasm, 'kessho_module_all_notes_off'),
    moduleProcessPlanarStereo: requireExport(wasm, 'kessho_module_process_planar_stereo'),
  };
}

function dftCentroid(samples) {
  const freqs = [];
  for (let i = 0; i < 48; i += 1) {
    const t = i / 47;
    freqs.push(40 * (12000 / 40) ** t);
  }

  let weighted = 0;
  let magnitudeSum = 0;
  for (const freq of freqs) {
    const bin = Math.max(1, Math.round((freq * samples.length) / sampleRate));
    const omega = (2 * Math.PI * bin) / samples.length;
    let real = 0;
    let imag = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1));
      const value = samples[i] * window;
      real += value * Math.cos(omega * i);
      imag -= value * Math.sin(omega * i);
    }
    const magnitude = Math.hypot(real, imag);
    const binFreq = (bin * sampleRate) / samples.length;
    weighted += binFreq * magnitude;
    magnitudeSum += magnitude;
  }
  return magnitudeSum > 0 ? weighted / magnitudeSum : 0;
}

class Metrics {
  constructor() {
    this.samples = 0;
    this.sumSq = 0;
    this.peak = 0;
    this.diffSumSq = 0;
    this.diffPeak = 0;
    this.leftSum = 0;
    this.rightSum = 0;
    this.centroidWindows = [];
    this.centroidBuffer = new Float32Array(centroidWindowSize);
    this.centroidFill = 0;
    this.nextCentroidStart = 0;
  }

  addFrame(frameIndex, left, right, referenceLeft = left, referenceRight = right) {
    assert(Number.isFinite(left) && Number.isFinite(right), 'profile render produced non-finite samples');
    const mono = (left + right) * 0.5;
    const diffLeft = left - referenceLeft;
    const diffRight = right - referenceRight;
    this.samples += 2;
    this.sumSq += left * left + right * right;
    this.peak = Math.max(this.peak, Math.abs(left), Math.abs(right));
    this.diffSumSq += diffLeft * diffLeft + diffRight * diffRight;
    this.diffPeak = Math.max(this.diffPeak, Math.abs(diffLeft), Math.abs(diffRight));
    this.leftSum += left;
    this.rightSum += right;

    if (
      this.centroidWindows.length < centroidMaxWindows &&
      frameIndex >= this.nextCentroidStart &&
      frameIndex < this.nextCentroidStart + centroidWindowSize
    ) {
      this.centroidBuffer[this.centroidFill] = mono;
      this.centroidFill += 1;
      if (this.centroidFill === centroidWindowSize) {
        this.centroidWindows.push(dftCentroid(this.centroidBuffer));
        this.centroidFill = 0;
        this.nextCentroidStart += centroidHopFrames;
      }
    }
  }

  finish(cpu, rssBefore, rssAfter, wasmMemoryBytes) {
    const rms = Math.sqrt(this.sumSq / Math.max(1, this.samples));
    const residualRms = Math.sqrt(this.diffSumSq / Math.max(1, this.samples));
    const centroidAverage = this.centroidWindows.reduce((sum, value) => sum + value, 0) /
      Math.max(1, this.centroidWindows.length);
    return {
      peak: this.peak,
      rms,
      lufsLikeDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
      dcOffsetLeft: this.leftSum / Math.max(1, this.samples / 2),
      dcOffsetRight: this.rightSum / Math.max(1, this.samples / 2),
      spectralCentroidHz: centroidAverage,
      spectralCentroidWindows: this.centroidWindows.length,
      nullResidualRms: residualRms,
      nullResidualPeak: this.diffPeak,
      cpu,
      memory: rssBefore == null || rssAfter == null
        ? {
            rssBeforeBytes: null,
            rssAfterBytes: null,
            rssDeltaBytes: null,
            wasmMemoryBytes,
          }
        : {
            rssBeforeBytes: rssBefore,
            rssAfterBytes: rssAfter,
            rssDeltaBytes: rssAfter - rssBefore,
            wasmMemoryBytes,
          },
    };
  }
}

function triggerChord(api, module, chord) {
  api.moduleAllNotesOff(module);
  for (const note of chord) {
    assert(
      api.moduleNoteOn(module, note.frequency, note.velocity, 0, note.route % padNumVoices) === 1,
      'failed to trigger pad preview note',
    );
  }
}

async function renderCandidateWasm(config, withDryDynamics) {
  const { exports: wasm } = await instantiateCore();
  const api = createApi(wasm);
  const heap = new Float32Array(wasm.memory.buffer);
  const leftPtr = api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const rightPtr = api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  assert(leftPtr !== 0 && rightPtr !== 0, 'profile buffer allocation failed');
  const leftOffset = leftPtr >> 2;
  const rightOffset = rightPtr >> 2;

  const sourceModule = api.moduleCreate(moduleTypePad, sampleRate, blockSize);
  assert(sourceModule !== 0, 'failed to create pad source module');
  configureModule(api, heap, sourceModule, config.params);

  let dynamicsModule = 0;
  if (withDryDynamics) {
    dynamicsModule = api.moduleCreate(moduleTypeDynamicsCharacter, sampleRate, blockSize);
    assert(dynamicsModule !== 0, 'failed to create dry dynamics module');
    configureModule(api, heap, dynamicsModule, makeDryDynamicsParams());
  }

  const rssBefore = process.memoryUsage().rss;
  const metrics = new Metrics();
  const output = new Float32Array(totalSamples);
  const referenceLeft = withDryDynamics ? new Float32Array(blockSize) : null;
  const referenceRight = withDryDynamics ? new Float32Array(blockSize) : null;
  let framesWritten = 0;
  let nextChordFrame = 0;
  let chordIndex = 0;
  let elapsedMs = 0;
  let peakBlockMs = 0;
  let missedBlocks = 0;
  let blocks = 0;

  while (framesWritten < totalFrames) {
    if (framesWritten >= nextChordFrame) {
      triggerChord(api, sourceModule, config.chords[chordIndex % config.chords.length]);
      chordIndex += 1;
      nextChordFrame += config.chordFrames;
    }

    const frames = Math.min(blockSize, totalFrames - framesWritten);
    heap.fill(0, leftOffset, leftOffset + frames);
    heap.fill(0, rightOffset, rightOffset + frames);
    const start = performance.now();
    assert(
      api.moduleProcessPlanarStereo(sourceModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
      'source module render failed',
    );
    let blockElapsedMs = performance.now() - start;
    if (dynamicsModule) {
      referenceLeft.set(heap.subarray(leftOffset, leftOffset + frames));
      referenceRight.set(heap.subarray(rightOffset, rightOffset + frames));
      const dynamicsStart = performance.now();
      assert(
        api.moduleProcessPlanarStereo(dynamicsModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
        'dry dynamics module render failed',
      );
      blockElapsedMs += performance.now() - dynamicsStart;
    }
    elapsedMs += blockElapsedMs;
    peakBlockMs = Math.max(peakBlockMs, blockElapsedMs);
    if (blockElapsedMs > realtimeBlockBudgetMs) missedBlocks += 1;
    blocks += 1;

    for (let frame = 0; frame < frames; frame += 1) {
      output[(framesWritten + frame) * 2] = heap[leftOffset + frame];
      output[(framesWritten + frame) * 2 + 1] = heap[rightOffset + frame];
      metrics.addFrame(
        framesWritten + frame,
        heap[leftOffset + frame],
        heap[rightOffset + frame],
        referenceLeft ? referenceLeft[frame] : heap[leftOffset + frame],
        referenceRight ? referenceRight[frame] : heap[rightOffset + frame],
      );
    }
    framesWritten += frames;
  }

  if (dynamicsModule) api.moduleDestroy(dynamicsModule);
  api.moduleDestroy(sourceModule);
  api.free(leftPtr);
  api.free(rightPtr);
  const rssAfter = process.memoryUsage().rss;
  const cpu = {
    elapsedMs,
    avgPercent: (elapsedMs / (renderSeconds * 1000)) * 100,
    peakBlockPercent: (peakBlockMs / realtimeBlockBudgetMs) * 100,
    missedBlocks,
    missedBlockPercent: (missedBlocks / Math.max(1, blocks)) * 100,
    blocks,
  };
  return {
    scalars: config.scalars,
    metrics: metrics.finish(cpu, rssBefore, rssAfter, wasm.memory.buffer.byteLength),
    output,
  };
}

function renderCandidateNative(config, withDryDynamics) {
  const stdout = run(nativeFixtureBinary, [], {
    input: fixtureInput(config, withDryDynamics),
    maxBuffer: fixtureOutputHeaderBytes + totalSamples * Float32Array.BYTES_PER_ELEMENT + 1024,
  });
  const view = new DataView(stdout.buffer, stdout.byteOffset, stdout.byteLength);
  assert(view.getUint32(0, true) === fixtureOutputMagic, 'native profile fixture returned invalid output magic');
  const elapsedMs = view.getFloat64(4, true);
  const peakBlockMs = view.getFloat64(12, true);
  const blocks = view.getUint32(20, true);
  const missedBlocks = view.getUint32(24, true);
  const expectedBytes = fixtureOutputHeaderBytes + totalSamples * Float32Array.BYTES_PER_ELEMENT;
  assert(stdout.byteLength === expectedBytes, `native profile fixture output size mismatch: ${stdout.byteLength}`);

  const output = new Float32Array(totalSamples);
  let offset = fixtureOutputHeaderBytes;
  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getFloat32(offset, true);
    offset += 4;
  }

  return {
    output,
    cpu: {
      elapsedMs,
      avgPercent: (elapsedMs / (renderSeconds * 1000)) * 100,
      peakBlockPercent: (peakBlockMs / realtimeBlockBudgetMs) * 100,
      missedBlocks,
      missedBlockPercent: (missedBlocks / Math.max(1, blocks)) * 100,
      blocks,
    },
  };
}

function metricsFromOutput(output, referenceOutput, cpu) {
  assert(output.length === totalSamples, 'profile output length mismatch');
  if (referenceOutput) {
    assert(referenceOutput.length === output.length, 'profile reference output length mismatch');
  }
  const metrics = new Metrics();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const left = output[frame * 2];
    const right = output[frame * 2 + 1];
    const referenceLeft = referenceOutput ? referenceOutput[frame * 2] : left;
    const referenceRight = referenceOutput ? referenceOutput[frame * 2 + 1] : right;
    metrics.addFrame(frame, left, right, referenceLeft, referenceRight);
  }
  return metrics.finish(cpu, null, null, 0);
}

function diffStats(a, b) {
  assert(a.length === b.length, 'profile output lengths differ');
  let sumSq = 0;
  let peak = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diff = a[index] - b[index];
    sumSq += diff * diff;
    peak = Math.max(peak, Math.abs(diff));
  }
  return {
    rms: Math.sqrt(sumSq / Math.max(1, a.length)),
    peak,
  };
}

function formatNumber(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function markdownReport(report) {
  const rows = report.candidates.map((candidate) => (
    `| ${candidate.scenario} | ${candidate.name} | ${formatNumber(candidate.sourceOnly.rms, 5)} | ` +
    `${formatNumber(candidate.sourceOnly.peak, 5)} | ${formatNumber(candidate.sourceOnly.spectralCentroidHz, 1)} | ` +
    `${formatNumber(candidate.sourceOnly.cpu.avgPercent, 2)}% | ${formatNumber(candidate.native.sourceOnly.cpu.avgPercent, 2)}% | ` +
    `${candidate.native.sourceResidual.rms.toExponential(3)} / ${candidate.native.sourceResidual.peak.toExponential(3)} | ` +
    `${formatNumber(candidate.dryDynamics.nullResidualRms, 3)} / ${formatNumber(candidate.dryDynamics.nullResidualPeak, 3)} |`
  )).join('\n');

  return `# KesshoCore Golden Candidate Profile\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `Scope: offline C11 starting profile for the current core WASM preview path. ` +
    `This is not a replacement for browser/macOS/iOS device captures.\n\n` +
    `Render contract: ${sampleRate} Hz, ${blockSize}-frame blocks, ${renderSeconds} seconds, deterministic empty automation and MIDI event streams.\n\n` +
    `| Scenario | Candidate | WASM RMS | WASM Peak | Centroid Hz | WASM CPU Avg | Native CPU Avg | Native/WASM RMS / Peak | Dry Null RMS / Peak |\n` +
    `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
    `${rows}\n\n` +
    `## Coverage Notes\n\n` +
    `- Renders the current web-core preview shape: instance-owned pad source module plus optional dry dynamics-character module.\n` +
    `- Compiles and runs a native C++ fixture for the same pad params and chord schedule, then compares native/WASM residuals.\n` +
    `- Keeps this golden profile to pad-active presets; lead, granular, soundscape, and full-mix route coverage lives in the browser/core acceptance corpus.\n` +
    `- Computes RMS, peak, LUFS-like level, DC offset, spectral-centroid estimate, CPU, render misses, RSS delta, memory, dry-module null residual, and native/WASM residual.\n` +
    `- Missing by design: legacy Web Audio old-path render comparison, live browser AudioWorklet CPU, macOS/iOS device CPU, MIDI jitter, and screen-off battery. Those remain required before C11 can pass.\n`;
}

const report = {
  generatedAt: new Date().toISOString(),
  wasm: 'public/worklets/kessho_core.wasm',
  nativeFixture: 'cpp/KesshoCore/tests/kessho_core_golden_profile_fixture.cpp',
  renderContract: {
    sampleRate,
    blockSize,
    renderSeconds,
    automationEvents: 0,
    midiEvents: 0,
  },
  candidates: [],
};

compileNativeFixture();

for (const candidate of goldenCandidates()) {
  const config = createPadPreviewConfig(candidate);
  const sourceOnly = await renderCandidateWasm(config, false);
  const dryDynamics = await renderCandidateWasm(config, true);
  const nativeSource = renderCandidateNative(config, false);
  const nativeDry = renderCandidateNative(config, true);
  const nativeSourceMetrics = metricsFromOutput(nativeSource.output, null, nativeSource.cpu);
  const nativeDryMetrics = metricsFromOutput(nativeDry.output, nativeSource.output, nativeDry.cpu);
  const sourceResidual = diffStats(sourceOnly.output, nativeSource.output);
  const dryResidual = diffStats(dryDynamics.output, nativeDry.output);
  const sourceResidualRmsLimit = Math.max(
    nativeWasmResidualRmsFloor,
    sourceOnly.metrics.rms * nativeWasmResidualRatioLimit,
  );
  const dryResidualRmsLimit = Math.max(
    nativeWasmResidualRmsFloor,
    dryDynamics.metrics.rms * nativeWasmResidualRatioLimit,
  );
  const sourceResidualPeakLimit = Math.max(
    nativeWasmResidualPeakFloor,
    sourceOnly.metrics.peak * nativeWasmResidualPeakRatioLimit,
  );
  const dryResidualPeakLimit = Math.max(
    nativeWasmResidualPeakFloor,
    dryDynamics.metrics.peak * nativeWasmResidualPeakRatioLimit,
  );

  assert(sourceOnly.metrics.peak > 1.0e-5, `${candidate.name} profile rendered silence`);
  assert(
    dryDynamics.metrics.nullResidualRms <= 1.0e-7 && dryDynamics.metrics.nullResidualPeak <= 1.0e-6,
    `${candidate.name} dry dynamics null residual too high: RMS ${dryDynamics.metrics.nullResidualRms}, peak ${dryDynamics.metrics.nullResidualPeak}`,
  );
  assert(
    nativeDryMetrics.nullResidualRms <= 1.0e-7 && nativeDryMetrics.nullResidualPeak <= 1.0e-6,
    `${candidate.name} native dry dynamics null residual too high: RMS ${nativeDryMetrics.nullResidualRms}, peak ${nativeDryMetrics.nullResidualPeak}`,
  );
  assert(
    sourceResidual.rms <= sourceResidualRmsLimit && sourceResidual.peak <= sourceResidualPeakLimit,
    `${candidate.name} native/WASM source residual too high: RMS ${sourceResidual.rms} ` +
      `(limit ${sourceResidualRmsLimit}), peak ${sourceResidual.peak} ` +
      `(limit ${sourceResidualPeakLimit})`,
  );
  assert(
    dryResidual.rms <= dryResidualRmsLimit && dryResidual.peak <= dryResidualPeakLimit,
    `${candidate.name} native/WASM dry residual too high: RMS ${dryResidual.rms} ` +
      `(limit ${dryResidualRmsLimit}), peak ${dryResidual.peak} ` +
      `(limit ${dryResidualPeakLimit})`,
  );

  report.candidates.push({
    id: candidate.id,
    name: candidate.name,
    scenario: candidate.scenario,
    source: candidate.source,
    scalars: sourceOnly.scalars,
    sourceOnly: sourceOnly.metrics,
    dryDynamics: dryDynamics.metrics,
    native: {
      sourceOnly: nativeSourceMetrics,
      dryDynamics: nativeDryMetrics,
      sourceResidual,
      dryResidual,
    },
  });
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownReportPath, markdownReport(report));

console.log(
  `KesshoCore golden profile wrote ${jsonReportPath} and ${markdownReportPath}; ` +
  `${report.candidates.length} candidates rendered for ${renderSeconds}s each`,
);
