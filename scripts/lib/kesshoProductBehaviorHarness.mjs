import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

export const root = process.cwd();

export function readProjectFile(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function methodBody(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:(?:async\\s+)?function\\s+|private\\s+(?:async\\s+)?|async\\s+)?${escaped}\\s*\\(`,
  ).exec(source);
  assert(definition, `missing ${name}()`);
  const open = source.indexOf('{', definition.index);
  assert(open >= 0, `${name}() has no body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${name}() body was not balanced`);
}

export function addEvidence(report, evidence) {
  report.evidence.push({
    status: 'pass',
    ...evidence,
  });
}

export async function runCheckWithReport({ scriptUrl, reportName, run }) {
  const reportState = {
    evidence: [],
    blocker: [],
    deferred: [],
  };
  const command = `node ${relative(root, fileURLToPath(scriptUrl))}`;
  try {
    await run(reportState);
    writeMachineReport({
      reportName,
      status: 'pass',
      command,
      evidence: reportState.evidence,
      blocker: reportState.blocker,
      deferred: reportState.deferred,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeMachineReport({
      reportName,
      status: 'fail',
      command,
      evidence: reportState.evidence,
      blocker: [...reportState.blocker, message],
      deferred: reportState.deferred,
    });
    throw error;
  }
}

function writeMachineReport({ reportName, status, command, evidence, blocker, deferred }) {
  const reportDir = resolve(root, 'docs/reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    status,
    generatedAt: new Date().toISOString(),
    command,
    evidence,
    blocker,
    deferred,
  };
  writeFileSync(resolve(reportDir, reportName), `${JSON.stringify(report, null, 2)}\n`);
}

function stripImportsAndExports(source) {
  return source
    .replace(/^\s*import[\s\S]*?;\s*/gm, '')
    .replace(/\bexport\s+(?=(?:const|async\s+function|function|class|type|interface)\b)/g, '');
}

function transpileForVm(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      useDefineForClassFields: false,
    },
    fileName,
  }).outputText;
}

let fallbackDiagnosticsHarness = null;

export function loadFallbackDiagnosticsHarness() {
  if (fallbackDiagnosticsHarness) return fallbackDiagnosticsHarness;
  const path = 'src/audio/CoreProductFallbackDiagnostics.ts';
  const source = stripImportsAndExports(readProjectFile(path));
  const js = transpileForVm(source, resolve(root, path));
  const context = {};
  vm.runInNewContext(`${js}
globalThis.__fallbackDiagnosticsHarness = {
  CORE_PRODUCT_GETTER_POLICIES,
  classifyCoreProductRuntimeFallback,
};`, context, { filename: path });
  fallbackDiagnosticsHarness = context.__fallbackDiagnosticsHarness;
  return fallbackDiagnosticsHarness;
}

function createConsoleCapture() {
  const errors = [];
  const warnings = [];
  const logs = [];
  return {
    errors,
    warnings,
    logs,
    console: {
      error: (...args) => errors.push(args.map(String).join(' ')),
      warn: (...args) => warnings.push(args.map(String).join(' ')),
      log: (...args) => logs.push(args.map(String).join(' ')),
    },
  };
}

function createParamIds() {
  return new Proxy({}, {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return property;
    },
  });
}

function event(type, fields = {}) {
  return { type, ...fields };
}

const HARNESS_PITCH_MODE_IDS = Object.freeze({
  semitones: 0,
  notes: 1,
  noteRange: 2,
});

const HARNESS_PITCH_SCALE_IDS = Object.freeze({
  Chromatic: 0,
  Major: 1,
  Minor: 2,
  Dorian: 3,
  Phrygian: 4,
  Lydian: 5,
  Mixolydian: 6,
  Locrian: 7,
  Pentatonic: 8,
  MinPenta: 9,
  Blues: 10,
  HarmonicMinor: 11,
  MelodicMinor: 12,
  WholeTone: 13,
  Diminished: 14,
  Augmented: 15,
  HungarianMinor: 16,
  Japanese: 17,
  Arabic: 18,
});

const HARNESS_PITCH_EXACT_SCALE_IDS = Object.freeze({
  Harmony: 0,
  Chromatic: 1,
  Major: 2,
  Minor: 3,
  Dorian: 4,
  Phrygian: 5,
  Lydian: 6,
  Mixolydian: 7,
  Locrian: 8,
  Pentatonic: 9,
  'Min Penta': 10,
  Blues: 11,
  'Harmonic Minor': 12,
  'Melodic Minor': 13,
  'Whole Tone': 14,
  Diminished: 15,
  Augmented: 16,
  'Hungarian Minor': 17,
  Japanese: 18,
  Arabic: 19,
});

function normalizeHarnessPitchSetting(value) {
  const setting = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const mode = Object.hasOwn(HARNESS_PITCH_MODE_IDS, setting.mode) ? setting.mode : 'semitones';
  const root = typeof setting.root === 'number' && Number.isFinite(setting.root)
    ? Math.max(0, Math.min(127, setting.root))
    : 60;
  const scale = Object.hasOwn(HARNESS_PITCH_SCALE_IDS, setting.scale) ? setting.scale : 'Major';
  return { mode, root, scale };
}

function createHarnessSequencerPitchSettingEvents(sequencer, settings) {
  if (!Array.isArray(settings)) return [];
  return settings.flatMap((setting, laneIndex) => {
    const pitch = normalizeHarnessPitchSetting(setting);
    return [
      event('sequencer-lane-param', {
        sequencer,
        laneIndex,
        paramId: 'SequencerLanePitchMode',
        value: HARNESS_PITCH_MODE_IDS[pitch.mode],
        eventKind: 8,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
      event('sequencer-lane-param', {
        sequencer,
        laneIndex,
        paramId: 'SequencerLanePitchRoot',
        value: pitch.root,
        eventKind: 8,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
      event('sequencer-lane-param', {
        sequencer,
        laneIndex,
        paramId: 'SequencerLanePitchScale',
        value: HARNESS_PITCH_SCALE_IDS[pitch.scale],
        value2: HARNESS_PITCH_EXACT_SCALE_IDS[pitch.scale] ?? 2,
        eventKind: 8,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
    ];
  });
}

export function loadCoreProductHostHarness(options = {}) {
  const diagnostics = loadFallbackDiagnosticsHarness();
  const consoleCapture = createConsoleCapture();
  const assetManifest = JSON.parse(readProjectFile('src/audio/coreProductAssetManifest.json'));
  const soundscapeAssets = Object.freeze(Object.fromEntries(assetManifest.soundscapes.map((asset) => [
    asset.key,
    {
      assetId: asset.assetId,
      path: asset.path,
      layer: asset.layer,
      startupPreload: asset.startupPreload,
    },
  ])));
  const runtimeInstances = [];
  let nowMs = 1000;
  const runtimeWalkConfigFromState = (state) => ({
    speed: typeof state?.randomWalkSpeed === 'number' ? state.randomWalkSpeed : 1,
    mode: state?.randomWalkMode === 'globalWalk' ? 'globalWalk' : 'localBrownian',
  });
  const harnessSourceIds = {
    pad1: 1,
    pad2: 2,
    lead1: 3,
    lead2: 4,
    drum: 5,
    piano: 6,
    soundscape: 7,
  };
  const sourceId = (source) => {
    const id = harnessSourceIds[source];
    if (id === undefined) throw new Error(`Unknown Core Product synth source: ${String(source)}`);
    return id;
  };
  const requireFiniteRange = (value, label, min, max) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Core Product ${label} must be a finite number in [${min}, ${max}]`);
    return value;
  };
  const requirePositive = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Core Product ${label} must be a positive finite number`);
    return value;
  };
  const requireManualNote = (note) => {
    const voiceIndex = note.voiceIndex;
    sourceId(note.source);
    if (voiceIndex !== undefined && (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex > 5)) throw new Error(`Core Product manual note voiceIndex must be an integer in [0, 5]: ${String(voiceIndex)}`);
    return { source: note.source, midi: requireFiniteRange(note.midi, 'manual note midi', 0, 127), velocity: requireFiniteRange(note.velocity, 'manual note velocity', 0.000001, 1), durationMs: requirePositive(note.durationMs, 'manual note durationMs'), ...(voiceIndex !== undefined ? { voiceIndex } : {}) };
  };
  const manualAuditionState = (source, state) => {
    const next = { ...(state ?? {}) };
    if (source === 'pad1') next.padEnabled = true;
    else if (source === 'pad2') next.pad2Enabled = true;
    else if (source === 'lead1') next.leadEnabled = true;
    else if (source === 'lead2') next.lead2Enabled = true;
    else if (source === 'piano') next.pianoEnabled = true;
    else sourceId(source);
    return next;
  };
  const drumVoiceIndex = (voice) => Number.isInteger(voice) ? voice : ({ snare: 2, clap: 2, hat: 5, hihat: 5, perc: 6, tom: 6 }[String(voice).toLowerCase()] ?? 0);

  class CoreProductRuntime {
    constructor() {
      this.audioContext = null;
      this.outputNode = null;
      this.error = null;
      this.events = [];
      this.snapshots = [];
      this.resetCount = 0;
      this.telemetryCallback = null;
      this.visualTelemetryCallback = null;
      this.visualTelemetryActive = false;
      runtimeInstances.push(this);
    }

    setTelemetryCallback(callback) {
      this.telemetryCallback = callback;
    }

    setVisualTelemetryCallback(callback) {
      this.visualTelemetryCallback = callback;
    }

    setVisualTelemetryActive(active) {
      this.visualTelemetryActive = active;
    }

    async ensureStarted() {}
    async resume() {}
    async suspend() {}
    dispose() {}

    postEvent(runtimeEvent) {
      this.events.push(runtimeEvent);
    }

    loadSnapshot(snapshot) {
      this.snapshots.push(snapshot);
      return Promise.resolve({ applied: true });
    }

    reset() {
      this.resetCount += 1;
    }

    startGraphTapCapture(tapId, chunkFrames) {
      this.lastStartedGraphTap = { tapId, chunkFrames };
    }

    flushGraphTapCapture(tapId) {
      this.lastFlushedGraphTap = tapId;
      return Promise.resolve([]);
    }

    stopGraphTapCapture(tapId) {
      this.lastStoppedGraphTap = tapId;
      return Promise.resolve([]);
    }

    registerAsset(asset) {
      this.lastRegisteredAsset = asset;
    }
  }

  class CoreProductAssetRegistrar {
    constructor(runtime, sliderState) {
      this.runtime = runtime;
      this.sliderState = sliderState;
      this.assets = [];
    }

    hasMissingDefaultAssetsForState() {
      return false;
    }

    async ensureDefaultAssetsForState() {}
    async ensurePianoAssetForMidi() {}
    async ensurePianoAssetForNote() {}
    clear() {
      this.assets = [];
    }
    registerAsset(asset) {
      this.assets.push(asset);
    }
    registeredDecodedAssetByteLength() {
      return 0;
    }
  }

  const context = {
    console: consoleCapture.console,
    performance: { now: () => ++nowMs },
    __IMPORT_META_ENV__: { DEV: options.dev === true },
    CoreProductRuntime,
    CoreProductAssetRegistrar,
    CORE_PRODUCT_MEMORY_BUDGETS: {
      webWorkletHeapBytes: 1,
      totalRegisteredDecodedBytes: 1,
    },
    CORE_PRODUCT_SOUNDSCAPE_ASSETS: soundscapeAssets,
    initialCoreProductCapabilityReport: {
      engineMode: 'core-product',
      unsupportedMethods: [],
      legacyFallbacks: [],
    },
    classifyCoreProductRuntimeFallback: diagnostics.classifyCoreProductRuntimeFallback,
    CORE_PRODUCT_GETTER_POLICIES: diagnostics.CORE_PRODUCT_GETTER_POLICIES,
    fnv1a32Bytes: () => 0,
    hashJson: (value) => JSON.stringify(value ?? null),
    logProductStateDebug: () => {},
    productStateDebugEnabled: () => false,
    buildCoreProductSnapshotDiff: () => ({ applied: true, events: [] }),
    shouldForwardCoreProductRngDiffs: () => false,
    CoreProductArrangementScheduler: class {
      start() {}
      update() {}
      stop() {}
    },
    createCoreProductSnapshot: () => ({
      assetRefs: [],
      assetRefLevels: [],
      sources: [],
      synthLanes: [],
      drumLanes: [],
      transport: { running: false, bpm: 120, beatsPerBar: 4, barsPerPhrase: 4, swing: 0 },
    }),
    createCoreProductDynamicsVisualTelemetry: (telemetry, contextTime) => ({
      contextTime,
      endCompHandledByWorklet: Boolean(telemetry),
      endCompReductionDb: Math.max(0, telemetry?.masterLimiterGainReductionDb ?? 0),
      worklet: telemetry ? {
        inputPeak: Math.max(0, telemetry.masterInputPeak ?? 0),
        outputPeak: Math.max(0, telemetry.masterOutputPeak ?? telemetry.masterTruePeak ?? 0),
        wetPeak: Math.max(0, telemetry.masterOutputPeak ?? telemetry.masterTruePeak ?? 0),
        characterEnv: Math.max(0, telemetry.masterOutputRms ?? 0),
        characterReductionDb: 0,
        dropoutGain: 1,
        endInputPeak: Math.max(0, telemetry.masterInputPeak ?? 0),
        endOutputPeak: Math.max(0, telemetry.masterOutputPeak ?? telemetry.masterTruePeak ?? 0),
        endReductionDb: Math.max(0, telemetry.masterLimiterGainReductionDb ?? 0),
        endDetectorDb: 0,
        timestamp: contextTime,
      } : null,
      sidechainEvents: [],
    }),
    createCoreProductSonicParityDebugState: (debug) => ({
      engineMode: debug.engineMode,
      running: debug.running,
      runtimeReady: debug.runtimeReady,
      runtimeError: debug.runtimeError,
      hasOutputNode: debug.hasOutputNode,
      snapshot: debug.latestProductSnapshot ?? null,
      latestTelemetry: debug.latestTelemetry,
      runtimeWalkDebug: debug.runtimeWalkDebug,
    }),
    createCoreProductTransportDebugState: (telemetry, transport) => telemetry && transport ? {
      effectiveBpm: Number.isFinite(transport.bpm) && transport.bpm > 0 ? transport.bpm : 120,
      effectivePhraseSeconds: 0,
      nextPhraseBoundaryIn: 0,
      nextHarmonyEventIn: null,
      nextProgressionStepIn: null,
    } : null,
    encodeCoreProductSnapshot: () => new ArrayBuffer(8),
    usesLegacyGranularRuntimeSeed: () => false,
    loadProductLead4opFMPreset: async () => ({}),
    loadProductLead4opFMPresetVerified: async () => ({}),
    publishCoreProductSequencerVisuals: (input) => {
      input.publish('synthStepPosition', [0, 0, 0, 0], [0, 0, 0, 0]);
      input.publish('drumStepPosition', [0, 0, 0, 0], [0, 0, 0, 0]);
    },
    createCoreProductHostHarmonySnapshot: (state, telemetry) => ({
      harmonyState: null,
      currentBucket: state ? 'harness' : '',
      currentSeed: 0,
      signature: state
        ? [
            'harness',
            telemetry?.harmonyRootMidi ?? '',
            telemetry?.harmonyScaleId ?? '',
            telemetry?.harmonyChordDegree ?? '',
          ].join('|')
        : 'none',
    }),
    getUtcBucket: (seedWindow) => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      if (seedWindow === 'day') return `${year}-${month}-${day}`;
      const hour = String(now.getUTCHours()).padStart(2, '0');
      return `${year}-${month}-${day}T${hour}`;
    },
    xmur3: (str) => {
      let h = 1779033703 ^ str.length;
      for (let index = 0; index < str.length; index += 1) {
        h = Math.imul(h ^ str.charCodeAt(index), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
      };
    },
    runtimeWalkConfigFromState,
    drumVoiceIndex,
    manualAuditionState,
    midiFromFrequency: (frequency) => 69 + 12 * Math.log2(frequency / 440),
    requireFiniteRange,
    requireManualNote,
    requirePositive,
    sourceId,
    runtimeWalkConfigChanged: (left, right) => Math.abs(left.speed - right.speed) > 0.0005 || left.mode !== right.mode,
    coreProductRangeValueContext: (bpm, state) => ({
      bpm: typeof bpm === 'number' && Number.isFinite(bpm) ? bpm : 120,
      ...runtimeWalkConfigFromState(state),
    }),
    mappedCoreProductRange: (target, range, valueContext) => {
      const mapValue = target.mapValue ?? ((value) => value);
      const mappedMin = mapValue(Math.min(range.min, range.max), valueContext);
      const mappedMax = mapValue(Math.max(range.min, range.max), valueContext);
      return { min: Math.min(mappedMin, mappedMax), max: Math.max(mappedMin, mappedMax) };
    },
    runtimeWalkPositionsFromTelemetry: (values, names, ranges) => {
      if (!values) return null;
      const next = {};
      for (const [idText, value] of Object.entries(values)) {
        const id = Number(idText);
        const key = names.get(id);
        const range = ranges.get(id);
        if (!key || typeof value !== 'number') continue;
        next[key] = Math.max(0, Math.min(1, range && range.max > range.min ? (value - range.min) / (range.max - range.min) : value));
      }
      return next;
    },
    isCoreProductRuntimeWalkStatePatchKey: (key) => [
      'lead1Density',
      'lead1Octave',
      'lead1OctaveRange',
      'lead1Distance',
      'lead2Distance',
      'padDistance',
      'pad2Distance',
      'pianoDistance',
    ].includes(key),
    KESSHO_PRODUCT_PARAM_IDS: createParamIds(),
    KESSHO_PRODUCT_EVENT_IDS: {
      SetSequencerStep: 7,
      SetSequencerLane: 8,
      ResetSequencerLaneHome: 28,
      DiceSequencerLane: 29,
    },
    CORE_PRODUCT_MODULATION_RANGE_MODE: { sampleHold: 1, randomWalk: 2 },
    CORE_PRODUCT_SEQUENCER_IDS: { synth: 1, drum: 2 },
    CORE_PRODUCT_SUBLANE_DIRECTIONS: { forward: 0, reverse: 1, pingpong: 2 },
    CORE_PRODUCT_STEP_TOGGLE_FLAGS: {
      active: 1,
      clearLane: 2,
      clearField: 4,
      rangeValue: 8,
      subLaneEnabledState: 1 << 24,
      stepOverrideState: 1 << 25,
      drumPitchOffsetValue: 1 << 26,
      stepOverrideCommit: 1 << 27,
      homeCaptureState: 1 << 28,
    },
    CORE_PRODUCT_HOME_CAPTURE_FLAGS: {
      force: 1,
      requireContent: 2,
      hasPitchState: 4,
      pitchScaleQuantize: 8,
      pitchScaleQuantizeSet: 16,
    },
    CORE_PRODUCT_HOST_PARAM_IDS: {
      SequencerEvolveConfig: -1000,
    },
    CORE_PRODUCT_DICE_FLAGS: { trigger: 1, probability: 2, ratchet: 4, midiNote: 8, expression: 16, morph: 32, distance: 64, swing: 128 },
    CORE_PRODUCT_EVOLVE_FLAGS: {
      rotateDrift: 1 << 8,
      swingDrift: 1 << 9,
      probDrift: 1 << 10,
      ghostNotes: 1 << 11,
      ratchetSpray: 1 << 12,
      hitDrift: 1 << 13,
      pitchWalk: 1 << 14,
      valueDrift: 1 << 15,
      valueScramble: 1 << 16,
      valueWiden: 1 << 17,
      subLaneLengthDrift: 1 << 18,
      subLaneDirectionFlip: 1 << 19,
      triggerToggle: 1 << 20,
      evolveConfigSubLaneMask: 1 << 27,
      manualCommit: 1 << 28,
      mutationStrict: 1 << 29,
      rngStream: 1 << 30,
      modeParity: 0x80000000,
    },
    CORE_PRODUCT_STEP_VALUE_FIELDS: {
      trigger: 0 << 8,
      probability: 1 << 8,
      ratchet: 2 << 8,
      trigCondition: 3 << 8,
      midiNote: 4 << 8,
      expression: 5 << 8,
      morph: 6 << 8,
      distance: 7 << 8,
      subLaneConfig: 8 << 8,
    },
    CORE_PRODUCT_SOURCE_IDS: harnessSourceIds,
    CORE_PRODUCT_GRAPH_TAP_IDS: {
      master: 1,
      pad: 2,
      lead: 3,
      piano: 4,
      granular: 5,
    },
    getEffectiveTension: (globalTension, mode, value) => {
      if (mode === 'bypass') return -1;
      if (mode === 'locked') return Math.max(0, Math.min(1, value));
      return Math.max(0, Math.min(1, globalTension + value));
    },
    midiSampleOffset: () => 0,
    createCoreProductDrumTriggerEvent: (voiceIndex, velocity) => event('drum-trigger', { voiceIndex, velocity }),
    createCoreProductJourneyEvent: (enabled) => event('journey', { enabled }),
    createCoreProductJourneyStateEvent: (enabled, morphPhase = 0, morphRateBars = 4) =>
      event('journey-state', { enabled, morphPhase, morphRateBars }),
    createCoreProductManualNoteEvent: (sourceId, midi, velocity, durationMs) =>
      event('manual-note', { sourceId, midi, velocity, durationMs }),
    createCoreProductHostMidiEvent: (message, timing) =>
      event('host-midi', { message, timing }),
    createCoreProductLiveNoteEvent: (liveNote, timing) => {
      const channel = Number.isInteger(liveNote.channel) ? Math.max(0, Math.min(15, liveNote.channel)) : 0;
      const noteOff = liveNote.kind === 'live-note-off';
      const velocity = Math.max(0, Math.min(1, liveNote.velocity ?? 0));
      return event('live-note-midi', {
        timing,
        targetId: harnessSourceIds[liveNote.instrument] ?? harnessSourceIds.piano,
        status: (noteOff ? 0x80 : 0x90) | channel,
        channel,
        data1: Math.max(0, Math.min(127, Math.round(liveNote.note ?? 60))),
        data2: noteOff ? 0 : Math.max(0, Math.min(127, Math.round(velocity * 127))),
        normalizedValue: noteOff ? 0 : velocity,
        rawSize: 3,
      });
    },
    createCoreProductMidiEvent: (payload) => event('midi', payload),
    createCoreProductModulationRangeEvent: (target, range, mode, currentValue, valueContext) =>
      event('modulation-range', { target, range, mode, currentValue, valueContext }),
    createCoreProductSequencerClearStepsEvent: (sequencer, laneIndex) =>
      event('sequencer-clear-steps', { sequencer, laneIndex }),
    createCoreProductSequencerDiceEvent: (
      sequencer,
      laneIndex,
      intensity = 1,
      seed = 0,
      flags = 0,
      writeOffset = 0,
      barIndex = 0,
      effectiveTension,
    ) =>
      event('sequencer-dice', {
        sequencer,
        laneIndex,
        intensity,
        eventKind: 29,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
        value: intensity,
        value2: seed,
        value3: writeOffset,
        value4: barIndex,
        flags,
        effectiveTension,
      }),
    createCoreProductSequencerParityEvolveState: () => ({
      synthStates: [],
      drumHomes: [],
      drumLastEvolveBars: [],
      rngKey: null,
      rng: null,
    }),
    evolveCoreProductSequencerLaneWithSharedModel: (input) => {
      input.publishOverrides(input.sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides', input.laneIndex, {
        manualDiceHome: input.sequencer === 'synth',
        harnessEvolution: input.config.evolution,
      });
      if (input.runtimeReady) {
        input.post(event('sequencer-step', {
          sequencer: input.sequencer,
          laneIndex: input.laneIndex,
          step: 0,
          value: true,
        }));
      }
      return {
        handled: true,
        changed: true,
        adapterState: {
          ...input.adapterState,
          [`${input.sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'}${input.laneIndex + 1}ManualDiceHarness`]: input.config.evolution,
        },
      };
    },
    createCoreProductSequencerEvolveClock: () => ({ tick: () => {}, reset: () => {} }),
    CoreProductSequencerEvolveRuntimeBridge: class {
      constructor(options) {
        this.options = options;
        this.resetCount = 0;
        this.tickTelemetry = [];
      }
      reset() {
        this.resetCount += 1;
      }
      tick(hostTelemetry) {
        this.tickTelemetry.push(hostTelemetry);
      }
      setEvolvedSequencerLaneSwing(sequencer, laneIndex, swing) {
        this.options.captureLaneHome(sequencer, laneIndex);
        const normalizedSwing = Math.max(0, Math.min(0.75, swing));
        this.options.setAdapterState({
          ...this.options.adapterState(),
          [`${sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'}${laneIndex + 1}Swing`]: normalizedSwing,
        });
        if (this.options.runtimeReady()) {
          this.options.post(event('sequencer-lane-param', {
            sequencer,
            laneIndex,
            paramId: 'SequencerLaneSwing',
            value: normalizedSwing,
          }));
        }
        this.options.publish(sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides', laneIndex, { swing: normalizedSwing });
      }
    },
    createCoreProductSequencerLaneParamEvent: (sequencer, laneIndex, paramId, value) =>
      event('sequencer-lane-param', {
        sequencer,
        laneIndex,
        paramId,
        value,
        eventKind: 8,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
    createCoreProductSequencerPitchSettingEvents: createHarnessSequencerPitchSettingEvents,
    createCoreProductSequencerResetHomeEvent: (sequencer, laneIndex) =>
      event('sequencer-reset-home', {
        sequencer,
        laneIndex,
        eventKind: 28,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
    createCoreProductSequencerSubLaneConfigEvent: (sequencer, laneIndex, field, steps, direction) =>
      event('sequencer-sublane-config', { sequencer, laneIndex, field, steps, direction }),
    createCoreProductSequencerStepEvent: (sequencer, laneIndex, step, value) =>
      event('sequencer-step', { sequencer, laneIndex, step, value }),
    createCoreProductSequencerStepValueEvent: (sequencer, laneIndex, step, field, value, value2, flags = 0) =>
      event('sequencer-step-value', { sequencer, laneIndex, step, field, value, value2, flags }),
    createCoreProductStartEvent: () => event('start'),
    createCoreProductStopEvent: () => event('stop'),
    getCoreProductSequencerLaneSwing: (adapterState, latestSliderState, sequencer, laneIndex) => {
      const source = latestSliderState ? { ...latestSliderState, ...adapterState } : adapterState;
      const value = source[`${sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'}${laneIndex + 1}Swing`];
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(0.75, value));
      return sequencer === 'drum' && typeof source.drumEuclidSwing === 'number'
        ? Math.max(0, Math.min(0.75, source.drumEuclidSwing / 100))
        : 0;
    },
    patchCoreProductSequencerLaneSwing: (adapterState, sequencer, laneIndex, swing) => ({
      adapterState: { ...adapterState, [`${sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'}${laneIndex + 1}Swing`]: Math.max(0, Math.min(0.75, swing)) },
      swing: Math.max(0, Math.min(0.75, swing)),
    }),
    resolveCoreProductDrumMorphRangeTarget: (voiceIndex, key) => ({ controlId: voiceIndex + 100, key }),
    resolveCoreProductDrumParamRangeTarget: (voiceIndex, key, displayKey) => ({ controlId: voiceIndex + 200, key, displayKey }),
    resolveCoreProductRangeTargets: (key) => (key === 'unsupported' ? [] : [{ controlId: 300, key }]),
  };
  Object.assign(context, options.globals ?? {});

  const clockDivisionsPath = 'src/audio/sequencerClockDivisions.ts';
  const clockDivisionsSource = stripImportsAndExports(readProjectFile(clockDivisionsPath));
  const clockDivisionsJs = transpileForVm(clockDivisionsSource, resolve(root, clockDivisionsPath));
  vm.runInNewContext(`${clockDivisionsJs}
Object.assign(globalThis, {
  sequencerClockDivisionToNumericValue,
  sequencerClockDivisionToSeconds,
  normalizeSequencerClockDivisions,
});`, context, { filename: clockDivisionsPath });

  const adapterPath = 'src/audio/CoreProductHostSequencerAdapter.ts';
  const adapterSource = stripImportsAndExports(readProjectFile(adapterPath));
  const adapterJs = transpileForVm(adapterSource, resolve(root, adapterPath));
  vm.runInNewContext(`${adapterJs}
Object.assign(globalThis, {
  normalizeClockDivisionValue,
  normalizeDrumSequencerStepOffsetOverrides,
  normalizeSequencerStepToggleOverrides,
  normalizeSequencerStepValueConfigs,
  normalizeSequencerStepValueOverrides,
  normalizeSubLaneEnabledStates,
  normalizedUnitValue,
});`, context, { filename: adapterPath });

  const drumSeqTypesPath = 'src/audio/drumSeqTypes.ts';
  const drumSeqTypesSource = stripImportsAndExports(readProjectFile(drumSeqTypesPath));
  const drumSeqTypesJs = transpileForVm(drumSeqTypesSource, resolve(root, drumSeqTypesPath));
  vm.runInNewContext(`${drumSeqTypesJs}
Object.assign(globalThis, {
  SCALES,
  scaleDegreeToSemitone,
});`, context, { filename: drumSeqTypesPath });

  const pitchSettingsPath = 'src/audio/sequencerPitchSettings.ts';
  const pitchSettingsSource = stripImportsAndExports(readProjectFile(pitchSettingsPath));
  const pitchSettingsJs = transpileForVm(pitchSettingsSource, resolve(root, pitchSettingsPath));
  vm.runInNewContext(`${pitchSettingsJs}
Object.assign(globalThis, {
  normalizeSequencerPitchMode,
  normalizeSequencerPitchRoot,
  normalizeSequencerPitchScale,
  normalizeSequencerPitchSettings,
  normalizeSequencerPitchSettingsArray,
});`, context, { filename: pitchSettingsPath });

  const synthPitchPath = 'src/audio/CoreProductHostSynthPitch.ts';
  const synthPitchSource = stripImportsAndExports(readProjectFile(synthPitchPath));
  const synthPitchJs = transpileForVm(synthPitchSource, resolve(root, synthPitchPath));
  vm.runInNewContext(`${synthPitchJs}
Object.assign(globalThis, {
  coreProductSynthMidiToUiPitch,
});`, context, { filename: synthPitchPath });

  const noteRangeEvolvePath = 'src/audio/CoreProductHostSynthNoteRangeEvolve.ts';
  const noteRangeEvolveSource = stripImportsAndExports(readProjectFile(noteRangeEvolvePath));
  const noteRangeEvolveJs = transpileForVm(noteRangeEvolveSource, resolve(root, noteRangeEvolvePath));
  vm.runInNewContext(`${noteRangeEvolveJs}
Object.assign(globalThis, {
  coreProductSynthNoteRangeHome,
  evolveCoreProductSynthNoteRange,
});`, context, { filename: noteRangeEvolvePath });

  const rangePayloadPath = 'src/audio/CoreProductHostSequencerRangePayload.ts';
  const rangePayloadSource = stripImportsAndExports(readProjectFile(rangePayloadPath));
  const rangePayloadJs = transpileForVm(rangePayloadSource, resolve(root, rangePayloadPath));
  vm.runInNewContext(`${rangePayloadJs}
Object.assign(globalThis, {
  coreProductRangeForField,
  addCoreProductRangePayload,
  applyCoreProductRangeSubLanePatch,
});`, context, { filename: rangePayloadPath });

  const subLaneEvolvePath = 'src/audio/CoreProductHostSequencerSubLaneEvolve.ts';
  const subLaneEvolveSource = stripImportsAndExports(readProjectFile(subLaneEvolvePath));
  const subLaneEvolveJs = transpileForVm(subLaneEvolveSource, resolve(root, subLaneEvolvePath));
  vm.runInNewContext(`{
${subLaneEvolveJs}
Object.assign(globalThis, {
  evolveCoreProductSequencerSubLaneConfigs,
});
}`, context, { filename: subLaneEvolvePath });

  const uiStatePath = 'src/audio/CoreProductHostSequencerUiState.ts';
  const uiStateSource = stripImportsAndExports(readProjectFile(uiStatePath));
  const uiStateJs = transpileForVm(uiStateSource, resolve(root, uiStatePath));
  vm.runInNewContext(`${uiStateJs}
	Object.assign(globalThis, {
	  coreProductStepValueOverridesFromLane,
	  coreProductStepValueConfigsFromLane,
	  coreProductSynthEvolvePayloadFromLane,
	  coreProductDrumEvolvePayloadFromLane,
	});`, context, { filename: uiStatePath });

  const sparseTelemetryBridgePath = 'src/audio/product/host/CoreProductSequencerSparseTelemetryBridge.ts';
  const sparseTelemetryBridgeSource = stripImportsAndExports(readProjectFile(sparseTelemetryBridgePath));
  const sparseTelemetryBridgeJs = transpileForVm(sparseTelemetryBridgeSource, resolve(root, sparseTelemetryBridgePath));
  vm.runInNewContext(`${sparseTelemetryBridgeJs}
Object.assign(globalThis, {
  coreProductStepValueConfigsFromLaneOrPrevious,
});`, context, { filename: sparseTelemetryBridgePath });

  const sequencerUiAdapterPath = 'src/audio/product/host/CoreProductSequencerUiAdapter.ts';
  const sequencerUiAdapterSource = stripImportsAndExports(readProjectFile(sequencerUiAdapterPath));
  const sequencerUiAdapterJs = transpileForVm(sequencerUiAdapterSource, resolve(root, sequencerUiAdapterPath));
  vm.runInNewContext(`${sequencerUiAdapterJs}
Object.assign(globalThis, {
  reconcileCoreProductSequencerUiState,
});`, context, { filename: sequencerUiAdapterPath });

  const homePath = 'src/audio/CoreProductHostSequencerHome.ts';
  const homeSource = stripImportsAndExports(readProjectFile(homePath));
  const homeJs = transpileForVm(homeSource, resolve(root, homePath));
  vm.runInNewContext(`${homeJs}
Object.assign(globalThis, {
  createCoreProductSequencerHomeStore,
  postCoreProductSequencerLaneStepState,
  coreProductSequencerHomePayload,
});`, context, { filename: homePath });

  const clockPath = 'src/audio/CoreProductHostSequencerClock.ts';
  const clockSource = stripImportsAndExports(readProjectFile(clockPath));
  const clockJs = transpileForVm(clockSource, resolve(root, clockPath));
  vm.runInNewContext(`${clockJs}
Object.assign(globalThis, {
  shouldRejoinCoreProductSequencerClocks,
  withCoreProductClockStartDelayState,
});`, context, { filename: clockPath });

  const pitchBindingPath = 'src/audio/sequencerPitchBinding.ts';
  const pitchBindingSource = stripImportsAndExports(readProjectFile(pitchBindingPath));
  const pitchBindingJs = transpileForVm(pitchBindingSource, resolve(root, pitchBindingPath));
  vm.runInNewContext(`${pitchBindingJs}
Object.assign(globalThis, {
  SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS,
  normalizeSequencerPitchBindingMode,
  normalizeSequencerPitchBindingModes,
  sequencerPitchBindingModeFromEventId,
  sequencerPitchBindingModeToEventId,
  sequencerPitchBindingModeToProductId,
});`, context, { filename: pitchBindingPath });

  const sequencerSwingPath = 'src/audio/sequencerSwing.ts';
  const sequencerSwingSource = stripImportsAndExports(readProjectFile(sequencerSwingPath));
  const sequencerSwingJs = transpileForVm(sequencerSwingSource, resolve(root, sequencerSwingPath));
  vm.runInNewContext(`${sequencerSwingJs}
Object.assign(globalThis, {
  normalizeSequencerSwing,
});`, context, { filename: sequencerSwingPath });

  const sequencerSwingEvolvePath = 'src/audio/CoreProductHostSequencerSwing.ts';
  const sequencerSwingEvolveSource = stripImportsAndExports(readProjectFile(sequencerSwingEvolvePath));
  const sequencerSwingEvolveJs = transpileForVm(sequencerSwingEvolveSource, resolve(root, sequencerSwingEvolvePath));
  vm.runInNewContext(`{
${sequencerSwingEvolveJs}
Object.assign(globalThis, {
  clampSequencerSwing,
  evolveCoreProductSequencerSwing,
  coreProductSequencerSwingKey,
  getCoreProductSequencerLaneSwing,
  patchCoreProductSequencerLaneSwing,
});
}`, context, { filename: sequencerSwingEvolvePath });

  const sequencerEvolveConfigPath = 'src/audio/CoreProductHostSequencerEvolveConfig.ts';
  const sequencerEvolveConfigSource = stripImportsAndExports(readProjectFile(sequencerEvolveConfigPath));
  const sequencerEvolveConfigJs = transpileForVm(sequencerEvolveConfigSource, resolve(root, sequencerEvolveConfigPath));
  vm.runInNewContext(`{
${sequencerEvolveConfigJs}
Object.assign(globalThis, {
  diceFlagsForEvolveConfig,
  evolveMethodFlagsForEvolveConfig,
  evolveMethodsForFlags,
  normalizeEvolveConfigs,
});
}`, context, { filename: sequencerEvolveConfigPath });

  const sequencerEvolveConfigEventBridgePath = 'src/audio/product/host/CoreProductSequencerEvolveConfigEventBridge.ts';
  const sequencerEvolveConfigEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerEvolveConfigEventBridgePath));
  const sequencerEvolveConfigEventBridgeJs = transpileForVm(sequencerEvolveConfigEventBridgeSource, resolve(root, sequencerEvolveConfigEventBridgePath));
  vm.runInNewContext(`${sequencerEvolveConfigEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerEvolveConfigEvent,
});`, context, { filename: sequencerEvolveConfigEventBridgePath });

  const sequencerEvolveConfigEventsPath = 'src/audio/product/ProductSequencerEvolveConfigEvents.ts';
  const sequencerEvolveConfigEventsSource = stripImportsAndExports(readProjectFile(sequencerEvolveConfigEventsPath));
  const sequencerEvolveConfigEventsJs = transpileForVm(sequencerEvolveConfigEventsSource, resolve(root, sequencerEvolveConfigEventsPath));
  vm.runInNewContext(`${sequencerEvolveConfigEventsJs}
Object.assign(globalThis, {
  createCoreProductSequencerEvolveConfigEvents,
});`, context, { filename: sequencerEvolveConfigEventsPath });

  const sequencerEvolveTensionPath = 'src/audio/CoreProductHostSequencerEvolveTension.ts';
  const sequencerEvolveTensionSource = stripImportsAndExports(readProjectFile(sequencerEvolveTensionPath));
  const sequencerEvolveTensionJs = transpileForVm(sequencerEvolveTensionSource, resolve(root, sequencerEvolveTensionPath));
  vm.runInNewContext(`{
${sequencerEvolveTensionJs}
Object.assign(globalThis, {
  coreProductSynthSequencerEffectiveEvolveTension,
  coreProductDrumSequencerEffectiveEvolveTension,
  coreProductSequencerEffectiveEvolveTension,
});
}`, context, { filename: sequencerEvolveTensionPath });

  const sequencerEvolvePath = 'src/audio/CoreProductHostSequencerEvolve.ts';
  const sequencerEvolveSource = stripImportsAndExports(readProjectFile(sequencerEvolvePath));
  const sequencerEvolveJs = transpileForVm(sequencerEvolveSource, resolve(root, sequencerEvolvePath));
  vm.runInNewContext(`{
${sequencerEvolveJs}
Object.assign(globalThis, {
  createCoreProductSequencerEvolveClock,
});
}`, context, { filename: sequencerEvolvePath });

  const sequencerControlEventBridgePath = 'src/audio/product/host/CoreProductSequencerControlEventBridge.ts';
  const sequencerControlEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerControlEventBridgePath));
  const sequencerControlEventBridgeJs = transpileForVm(sequencerControlEventBridgeSource, resolve(root, sequencerControlEventBridgePath));
  vm.runInNewContext(`${sequencerControlEventBridgeJs}
Object.assign(globalThis, {
  handleCoreProductSequencerControlEvent,
});`, context, { filename: sequencerControlEventBridgePath });

  const sequencerEvolveBridgePath = 'src/audio/product/host/CoreProductSequencerEvolveBridge.ts';
  const sequencerEvolveBridgeSource = stripImportsAndExports(readProjectFile(sequencerEvolveBridgePath));
  const sequencerEvolveBridgeJs = transpileForVm(sequencerEvolveBridgeSource, resolve(root, sequencerEvolveBridgePath));
  vm.runInNewContext(`${sequencerEvolveBridgeJs}
Object.assign(globalThis, {
  CoreProductSequencerEvolveBridge,
});`, context, { filename: sequencerEvolveBridgePath });

  const sequencerCacheBridgePath = 'src/audio/product/host/CoreProductSequencerCacheBridge.ts';
  const sequencerCacheBridgeSource = stripImportsAndExports(readProjectFile(sequencerCacheBridgePath));
  const sequencerCacheBridgeJs = transpileForVm(sequencerCacheBridgeSource, resolve(root, sequencerCacheBridgePath));
  vm.runInNewContext(`${sequencerCacheBridgeJs}
Object.assign(globalThis, {
  createCoreProductSequencerCacheState,
  selectCoreProductSequencerCache,
  ensureCoreProductSequencerLaneCache,
  coreProductSequencerLaneCacheCount,
  cloneCoreProductSequencerStepValueConfigs,
  cloneCoreProductSequencerStepValueOverrides,
  enabledCoreProductSequencerSubLanes,
});`, context, { filename: sequencerCacheBridgePath });

  const sequencerNativeEvolveFlagsPath = 'src/audio/product/host/CoreProductSequencerNativeEvolveFlags.ts';
  const sequencerNativeEvolveFlagsSource = stripImportsAndExports(readProjectFile(sequencerNativeEvolveFlagsPath));
  const sequencerNativeEvolveFlagsJs = transpileForVm(sequencerNativeEvolveFlagsSource, resolve(root, sequencerNativeEvolveFlagsPath));
  vm.runInNewContext(`{
${sequencerNativeEvolveFlagsJs}
Object.assign(globalThis, {
  nativeEvolveFlagsForEvolveConfig,
});
}`, context, { filename: sequencerNativeEvolveFlagsPath });

  const manualSynthDiceBridgePath = 'src/audio/product/host/CoreProductManualSynthDiceBridge.ts';
  const manualSynthDiceBridgeSource = stripImportsAndExports(readProjectFile(manualSynthDiceBridgePath));
  const manualSynthDiceBridgeJs = transpileForVm(manualSynthDiceBridgeSource, resolve(root, manualSynthDiceBridgePath));
  vm.runInNewContext(`${manualSynthDiceBridgeJs}
Object.assign(globalThis, {
  createCoreProductManualSynthDiceState,
  armCoreProductSequencerManualDice,
  coreProductManualSynthDiceChanged,
  markCoreProductManualSynthDiceReady,
  applyCoreProductManualSynthDice,
});`, context, { filename: manualSynthDiceBridgePath });

  const sequencerMorphFeedbackBridgePath = 'src/audio/product/host/CoreProductSequencerMorphFeedbackBridge.ts';
  const sequencerMorphFeedbackBridgeSource = stripImportsAndExports(readProjectFile(sequencerMorphFeedbackBridgePath));
  const sequencerMorphFeedbackBridgeJs = transpileForVm(sequencerMorphFeedbackBridgeSource, resolve(root, sequencerMorphFeedbackBridgePath));
  vm.runInNewContext(`${sequencerMorphFeedbackBridgeJs}
Object.assign(globalThis, {
  CoreProductSequencerMorphFeedbackBridge,
});`, context, { filename: sequencerMorphFeedbackBridgePath });

  const sequencerEvolvePayloadBridgePath = 'src/audio/product/host/CoreProductSequencerEvolvePayloadBridge.ts';
  const sequencerEvolvePayloadBridgeSource = stripImportsAndExports(readProjectFile(sequencerEvolvePayloadBridgePath));
  const sequencerEvolvePayloadBridgeJs = transpileForVm(sequencerEvolvePayloadBridgeSource, resolve(root, sequencerEvolvePayloadBridgePath));
  vm.runInNewContext(`${sequencerEvolvePayloadBridgeJs}
Object.assign(globalThis, {
  createCoreProductEvolvedSubLanePayload,
});`, context, { filename: sequencerEvolvePayloadBridgePath });

  const sequencerHomeCaptureBridgePath = 'src/audio/product/host/CoreProductSequencerHomeCaptureBridge.ts';
  const sequencerHomeCaptureBridgeSource = stripImportsAndExports(readProjectFile(sequencerHomeCaptureBridgePath));
  const sequencerHomeCaptureBridgeJs = transpileForVm(sequencerHomeCaptureBridgeSource, resolve(root, sequencerHomeCaptureBridgePath));
  vm.runInNewContext(`${sequencerHomeCaptureBridgeJs}
Object.assign(globalThis, {
  captureCoreProductSequencerHomeLane,
});`, context, { filename: sequencerHomeCaptureBridgePath });

  const sequencerHomeCaptureEventBridgePath = 'src/audio/product/host/CoreProductSequencerHomeCaptureEventBridge.ts';
  const sequencerHomeCaptureEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerHomeCaptureEventBridgePath));
  const sequencerHomeCaptureEventBridgeJs = transpileForVm(sequencerHomeCaptureEventBridgeSource, resolve(root, sequencerHomeCaptureEventBridgePath));
  vm.runInNewContext(`${sequencerHomeCaptureEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerHomeCaptureEvent,
});`, context, { filename: sequencerHomeCaptureEventBridgePath });

  const sequencerHomeRestoreBridgePath = 'src/audio/product/host/CoreProductSequencerHomeRestoreBridge.ts';
  const sequencerHomeRestoreBridgeSource = stripImportsAndExports(readProjectFile(sequencerHomeRestoreBridgePath));
  const sequencerHomeRestoreBridgeJs = transpileForVm(sequencerHomeRestoreBridgeSource, resolve(root, sequencerHomeRestoreBridgePath));
  vm.runInNewContext(`${sequencerHomeRestoreBridgeJs}
Object.assign(globalThis, {
  restoreCoreProductSequencerLaneHome,
});`, context, { filename: sequencerHomeRestoreBridgePath });

  const sequencerLaneParamBridgePath = 'src/audio/product/host/CoreProductSequencerLaneParamBridge.ts';
  const sequencerLaneParamBridgeSource = stripImportsAndExports(readProjectFile(sequencerLaneParamBridgePath));
  const sequencerLaneParamBridgeJs = transpileForVm(sequencerLaneParamBridgeSource, resolve(root, sequencerLaneParamBridgePath));
  vm.runInNewContext(`${sequencerLaneParamBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerLaneParamSet,
  patchCoreProductSequencerLaneAdapterParam,
  patchCoreProductSynthPitchBindingModeFromEvent,
});`, context, { filename: sequencerLaneParamBridgePath });

  const sequencerPitchSettingEventBridgePath = 'src/audio/product/host/CoreProductSequencerPitchSettingEventBridge.ts';
  const sequencerPitchSettingEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerPitchSettingEventBridgePath));
  const sequencerPitchSettingEventBridgeJs = transpileForVm(sequencerPitchSettingEventBridgeSource, resolve(root, sequencerPitchSettingEventBridgePath));
  vm.runInNewContext(`${sequencerPitchSettingEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerPitchSettingEvent,
});`, context, { filename: sequencerPitchSettingEventBridgePath });

  const sequencerNoteRangeEvolveBridgePath = 'src/audio/product/host/CoreProductSequencerNoteRangeEvolveBridge.ts';
  const sequencerNoteRangeEvolveBridgeSource = stripImportsAndExports(readProjectFile(sequencerNoteRangeEvolveBridgePath));
  const sequencerNoteRangeEvolveBridgeJs = transpileForVm(sequencerNoteRangeEvolveBridgeSource, resolve(root, sequencerNoteRangeEvolveBridgePath));
  vm.runInNewContext(`${sequencerNoteRangeEvolveBridgeJs}
Object.assign(globalThis, {
  evolveCoreProductSequencerSynthNoteRange,
});`, context, { filename: sequencerNoteRangeEvolveBridgePath });

  const sequencerStepOverrideBridgePath = 'src/audio/product/host/CoreProductSequencerStepOverrideBridge.ts';
  const sequencerStepOverrideBridgeSource = stripImportsAndExports(readProjectFile(sequencerStepOverrideBridgePath));
  const sequencerStepOverrideBridgeJs = transpileForVm(sequencerStepOverrideBridgeSource, resolve(root, sequencerStepOverrideBridgePath));
  vm.runInNewContext(`${sequencerStepOverrideBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSynthStepOverrides,
});`, context, { filename: sequencerStepOverrideBridgePath });

  const sequencerStepEventBridgePath = 'src/audio/product/host/CoreProductSequencerStepEventBridge.ts';
  const sequencerStepEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerStepEventBridgePath));
  const sequencerStepEventBridgeJs = transpileForVm(sequencerStepEventBridgeSource, resolve(root, sequencerStepEventBridgePath));
  vm.runInNewContext(`${sequencerStepEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerStepEventToCache,
});`, context, { filename: sequencerStepEventBridgePath });

  const sequencerStepOverrideEventBridgePath = 'src/audio/product/host/CoreProductSequencerStepOverrideEventBridge.ts';
  const sequencerStepOverrideEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerStepOverrideEventBridgePath));
  const sequencerStepOverrideEventBridgeJs = transpileForVm(sequencerStepOverrideEventBridgeSource, resolve(root, sequencerStepOverrideEventBridgePath));
  vm.runInNewContext(`${sequencerStepOverrideEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductDrumSequencerStepOverrideEvent,
});`, context, { filename: sequencerStepOverrideEventBridgePath });

  const sequencerSubLaneEnabledEventBridgePath = 'src/audio/product/host/CoreProductSequencerSubLaneEnabledEventBridge.ts';
  const sequencerSubLaneEnabledEventBridgeSource = stripImportsAndExports(readProjectFile(sequencerSubLaneEnabledEventBridgePath));
  const sequencerSubLaneEnabledEventBridgeJs = transpileForVm(sequencerSubLaneEnabledEventBridgeSource, resolve(root, sequencerSubLaneEnabledEventBridgePath));
  vm.runInNewContext(`${sequencerSubLaneEnabledEventBridgeJs}
Object.assign(globalThis, {
  applyCoreProductSequencerSubLaneEnabledEvent,
});`, context, { filename: sequencerSubLaneEnabledEventBridgePath });

  const sequencerStepPostingBridgePath = 'src/audio/product/host/CoreProductSequencerStepPostingBridge.ts';
  const sequencerStepPostingBridgeSource = stripImportsAndExports(readProjectFile(sequencerStepPostingBridgePath));
  const sequencerStepPostingBridgeJs = transpileForVm(sequencerStepPostingBridgeSource, resolve(root, sequencerStepPostingBridgePath));
  vm.runInNewContext(`${sequencerStepPostingBridgeJs}
Object.assign(globalThis, {
  coreProductStepValueFieldSubLaneKey,
  coreProductStepValueFieldEnabled,
  createCoreProductEvolvedStepValuePayload,
  postCoreProductSequencerStepValueOverrides,
  syncCoreProductSequencerStepState,
});`, context, { filename: sequencerStepPostingBridgePath });

  const hostDiagnosticsPath = 'src/audio/product/host/CoreProductHostDiagnostics.ts';
  const hostDiagnosticsSource = stripImportsAndExports(readProjectFile(hostDiagnosticsPath)).replaceAll('import.meta.env', '__IMPORT_META_ENV__');
  const hostDiagnosticsJs = transpileForVm(hostDiagnosticsSource, resolve(root, hostDiagnosticsPath));
  vm.runInNewContext(`${hostDiagnosticsJs}
Object.assign(globalThis, {
  CoreProductHostDiagnostics,
});`, context, { filename: hostDiagnosticsPath });

  const hostDebugSurfacePath = 'src/audio/product/host/CoreProductHostDebugSurface.ts';
  const hostDebugSurfaceSource = stripImportsAndExports(readProjectFile(hostDebugSurfacePath));
  const hostDebugSurfaceJs = transpileForVm(hostDebugSurfaceSource, resolve(root, hostDebugSurfacePath));
  vm.runInNewContext(`${hostDebugSurfaceJs}
Object.assign(globalThis, {
  CoreProductHostDebugSurface,
});`, context, { filename: hostDebugSurfacePath });

  const arrangementBridgePath = 'src/audio/product/host/CoreProductArrangementBridge.ts';
  const arrangementBridgeSource = stripImportsAndExports(readProjectFile(arrangementBridgePath));
  const arrangementBridgeJs = transpileForVm(arrangementBridgeSource, resolve(root, arrangementBridgePath));
  vm.runInNewContext(`${arrangementBridgeJs}
Object.assign(globalThis, {
  CoreProductArrangementBridge,
});`, context, { filename: arrangementBridgePath });

  const displayCallbackRegistryPath = 'src/audio/product/host/CoreProductDisplayCallbackRegistry.ts';
  const displayCallbackRegistrySource = stripImportsAndExports(readProjectFile(displayCallbackRegistryPath));
  const displayCallbackRegistryJs = transpileForVm(displayCallbackRegistrySource, resolve(root, displayCallbackRegistryPath));
  vm.runInNewContext(`${displayCallbackRegistryJs}
Object.assign(globalThis, {
  CoreProductDisplayCallbackRegistry,
});`, context, { filename: displayCallbackRegistryPath });

  const hostProxyPath = 'src/audio/product/host/CoreProductHostProxy.ts';
  const hostProxySource = stripImportsAndExports(readProjectFile(hostProxyPath));
  const hostProxyJs = transpileForVm(hostProxySource, resolve(root, hostProxyPath));
  vm.runInNewContext(`${hostProxyJs}
Object.assign(globalThis, {
  createCoreProductEngineHostProxy,
});`, context, { filename: hostProxyPath });

  const graphTapBridgePath = 'src/audio/product/host/CoreProductGraphTapBridge.ts';
  const graphTapBridgeSource = stripImportsAndExports(readProjectFile(graphTapBridgePath));
  const graphTapBridgeJs = transpileForVm(graphTapBridgeSource, resolve(root, graphTapBridgePath));
  vm.runInNewContext(`${graphTapBridgeJs}
Object.assign(globalThis, {
  CoreProductGraphTapBridge,
});`, context, { filename: graphTapBridgePath });

  const journeyMorphClockPath = 'src/audio/product/host/CoreProductJourneyMorphClock.ts';
  const journeyMorphClockSource = stripImportsAndExports(readProjectFile(journeyMorphClockPath));
  const journeyMorphClockJs = transpileForVm(journeyMorphClockSource, resolve(root, journeyMorphClockPath));
  vm.runInNewContext(`${journeyMorphClockJs}
Object.assign(globalThis, {
  CoreProductJourneyMorphClock,
});`, context, { filename: journeyMorphClockPath });

  const harmonyStateBridgePath = 'src/audio/product/host/CoreProductHarmonyStateBridge.ts';
  const harmonyStateBridgeSource = stripImportsAndExports(readProjectFile(harmonyStateBridgePath));
  const harmonyStateBridgeJs = transpileForVm(harmonyStateBridgeSource, resolve(root, harmonyStateBridgePath));
  vm.runInNewContext(`${harmonyStateBridgeJs}
Object.assign(globalThis, {
  CoreProductHarmonyStateBridge,
});`, context, { filename: harmonyStateBridgePath });

  const patchClassifierPath = 'src/audio/product/host/CoreProductPatchClassifier.ts';
  const patchClassifierSource = stripImportsAndExports(readProjectFile(patchClassifierPath));
  const patchClassifierJs = transpileForVm(patchClassifierSource, resolve(root, patchClassifierPath));
  vm.runInNewContext(`${patchClassifierJs}
Object.assign(globalThis, {
  snapshotReloadReasonForProductPatch,
});`, context, { filename: patchClassifierPath });

  const resolvedStateCommitServicePath = 'src/audio/product/host/CoreProductResolvedStateCommitService.ts';
  const resolvedStateCommitServiceSource = stripImportsAndExports(readProjectFile(resolvedStateCommitServicePath));
  const resolvedStateCommitServiceJs = transpileForVm(resolvedStateCommitServiceSource, resolve(root, resolvedStateCommitServicePath));
  vm.runInNewContext(`${resolvedStateCommitServiceJs}
Object.assign(globalThis, {
  CoreProductResolvedStateCommitService,
});`, context, { filename: resolvedStateCommitServicePath });

  const leadPresetDataLoaderPath = 'src/audio/product/host/CoreProductLeadPresetDataLoader.ts';
  const leadPresetDataLoaderSource = stripImportsAndExports(readProjectFile(leadPresetDataLoaderPath));
  const leadPresetDataLoaderJs = transpileForVm(leadPresetDataLoaderSource, resolve(root, leadPresetDataLoaderPath));
  vm.runInNewContext(`${leadPresetDataLoaderJs}
Object.assign(globalThis, {
  CoreProductLeadPresetDataLoader,
});`, context, { filename: leadPresetDataLoaderPath });

  const modulationDebugEnricherPath = 'src/audio/product/host/CoreProductModulationDebugEnricher.ts';
  const modulationDebugEnricherSource = stripImportsAndExports(readProjectFile(modulationDebugEnricherPath));
  const modulationDebugEnricherJs = transpileForVm(modulationDebugEnricherSource, resolve(root, modulationDebugEnricherPath));
  vm.runInNewContext(`${modulationDebugEnricherJs}
Object.assign(globalThis, {
  enrichCoreProductModulationDebug,
});`, context, { filename: modulationDebugEnricherPath });

  const earthTextureDebugPath = 'src/audio/product/host/CoreProductEarthTextureDebug.ts';
  const earthTextureDebugSource = stripImportsAndExports(readProjectFile(earthTextureDebugPath));
  const earthTextureDebugJs = transpileForVm(earthTextureDebugSource, resolve(root, earthTextureDebugPath));
  vm.runInNewContext(`(() => {
${earthTextureDebugJs}
Object.assign(globalThis, {
  createCoreProductEarthTextureDebugState,
});
})();`, context, { filename: earthTextureDebugPath });

  const runtimeWalkDebugPath = 'src/audio/product/host/CoreProductRuntimeWalkDebug.ts';
  const runtimeWalkDebugSource = stripImportsAndExports(readProjectFile(runtimeWalkDebugPath));
  const runtimeWalkDebugJs = transpileForVm(runtimeWalkDebugSource, resolve(root, runtimeWalkDebugPath));
  vm.runInNewContext(`${runtimeWalkDebugJs}
Object.assign(globalThis, {
  createCoreProductRuntimeWalkDebugState,
  snapshotCoreProductRuntimeWalkDebugState,
});`, context, { filename: runtimeWalkDebugPath });

  const sampleHoldFeedbackPath = 'src/audio/product/host/CoreProductSampleHoldFeedbackBridge.ts';
  const sampleHoldFeedbackSource = stripImportsAndExports(readProjectFile(sampleHoldFeedbackPath));
  const sampleHoldFeedbackJs = transpileForVm(sampleHoldFeedbackSource, resolve(root, sampleHoldFeedbackPath));
  vm.runInNewContext(`${sampleHoldFeedbackJs}
Object.assign(globalThis, {
  createCoreProductSampleHoldDebugState,
  snapshotCoreProductSampleHoldDebugState,
  updateCoreProductSampleHoldTriggerFeedback,
});`, context, { filename: sampleHoldFeedbackPath });

  const modulationRangeBridgePath = 'src/audio/product/host/CoreProductModulationRangeBridge.ts';
  const modulationRangeBridgeSource = stripImportsAndExports(readProjectFile(modulationRangeBridgePath));
  const modulationRangeBridgeJs = transpileForVm(modulationRangeBridgeSource, resolve(root, modulationRangeBridgePath));
  vm.runInNewContext(`${modulationRangeBridgeJs}
Object.assign(globalThis, {
  CoreProductModulationRangeBridge,
});`, context, { filename: modulationRangeBridgePath });

  const snapshotCoordinatorPath = 'src/audio/product/host/CoreProductSnapshotCoordinator.ts';
  const snapshotCoordinatorSource = stripImportsAndExports(readProjectFile(snapshotCoordinatorPath));
  const snapshotCoordinatorJs = transpileForVm(snapshotCoordinatorSource, resolve(root, snapshotCoordinatorPath));
  vm.runInNewContext(`${snapshotCoordinatorJs}
Object.assign(globalThis, {
  loadCoreProductSnapshot,
  applyCoreProductSnapshotUpdate,
});`, context, { filename: snapshotCoordinatorPath });

  const telemetryAdapterPath = 'src/audio/product/host/CoreProductTelemetryAdapter.ts';
  const telemetryAdapterSource = stripImportsAndExports(readProjectFile(telemetryAdapterPath));
  const telemetryAdapterJs = transpileForVm(telemetryAdapterSource, resolve(root, telemetryAdapterPath));
  vm.runInNewContext(`${telemetryAdapterJs}
Object.assign(globalThis, {
  enrichCoreProductHostTelemetry,
  createCoreProductPerfSnapshot,
  mergeCoreProductVisualTelemetry,
});`, context, { filename: telemetryAdapterPath });

  const path = 'src/audio/coreProductEngineHost.ts';
  const source = stripImportsAndExports(readProjectFile(path)).replaceAll('import.meta.env', '__IMPORT_META_ENV__');
  const js = transpileForVm(source, resolve(root, path));
  vm.runInNewContext(`${js}
globalThis.__coreProductHostHarness = {
  CoreProductEngineHost,
  host,
  coreProductEngineHost,
};`, context, { filename: path });

  const harness = context.__coreProductHostHarness;
  return {
    ...harness,
    context,
    runtime: harness.host.runtime,
    runtimeInstances,
    consoleErrors: consoleCapture.errors,
    consoleWarnings: consoleCapture.warnings,
    consoleLogs: consoleCapture.logs,
    diagnostics,
  };
}

export function loadRuntimeAdapterHarness() {
  const generatedParamsPath = 'src/audio/generated/kesshoProductParams.ts';
  const generatedParamsSource = stripImportsAndExports(readProjectFile(generatedParamsPath));
  const generatedParamsJs = transpileForVm(generatedParamsSource, resolve(root, generatedParamsPath));
  const generatedParamsContext = {};
  vm.runInNewContext(`${generatedParamsJs}
globalThis.__generatedProductParams = KESSHO_PRODUCT_PARAMS;`, generatedParamsContext, { filename: generatedParamsPath });

  const context = {
    CORE_PRODUCT_SOURCE_IDS: {
      pad1: 1,
      pad2: 2,
      lead1: 3,
      lead2: 4,
      drum: 5,
      piano: 6,
      soundscape: 7,
    },
	    KESSHO_PRODUCT_DRUM_PARAM_COUNT: 126,
	    KESSHO_PRODUCT_DRUM_VOICE_COUNT: 7,
    KESSHO_PRODUCT_DRUM_VOICES: [
      { index: 0, paramStart: 0, paramCount: 12 },
      { index: 1, paramStart: 12, paramCount: 13 },
      { index: 2, paramStart: 25, paramCount: 15 },
      { index: 3, paramStart: 40, paramCount: 19 },
      { index: 4, paramStart: 59, paramCount: 19 },
      { index: 5, paramStart: 78, paramCount: 14 },
      { index: 6, paramStart: 92, paramCount: 12 },
    ],
	    KESSHO_PRODUCT_LEAD_PARAM_COUNT: 80,
	    KESSHO_PRODUCT_PAD_PARAM_COUNT: 53,
    KESSHO_PRODUCT_PARAM_IDS: createParamIds(),
    KESSHO_PRODUCT_PARAMS: generatedParamsContext.__generatedProductParams,
    HARMONY_QUALITY_IDS: {
      auto: 0,
      dim: 1,
      min: 2,
      maj: 3,
      sus: 4,
      maj7: 5,
      min7: 6,
      dom7: 7,
      add9: 8,
      six: 9,
      sixNine: 10,
      nine: 11,
      quartal: 12,
      cluster: 13,
      custom: 14,
    },
    HARMONY_STRENGTH_IDS: { bias: 0, force: 1 },
    coreProductDrumRuntimeParamId: (paramIndex) => `DrumRuntime${paramIndex}`,
    coreProductLeadRuntimeParamId: (leadIndex, paramIndex) => `Lead${leadIndex + 1}Runtime${paramIndex}`,
    coreProductPadRuntimeParamId: (padIndex, paramIndex) => `Pad${padIndex + 1}Runtime${paramIndex}`,
    createCoreProductJourneyStateEvent: (enabled, morphPhase, morphRateBars) =>
      event('journey-state', { enabled, morphPhase, morphRateBars }),
    createCoreProductHarmonyControlSetManualIntentEvent: (args) =>
      event('harmony-manual-intent', { ...args }),
    createCoreProductHarmonyControlClearManualIntentEvent: () =>
      event('harmony-clear-manual-intent'),
    createCoreProductHarmonySequenceSetEnabledEvent: (enabled) =>
      event('harmony-sequence-enabled', { enabled }),
    createCoreProductHarmonySequenceSetStepEvent: (stepId, args) =>
      event('harmony-sequence-step', { stepId, ...args }),
    createCoreProductHarmonySlotSetEvent: (slotId, args) =>
      event('harmony-slot-set', { slotId, ...args }),
    createCoreProductParamEvent: (paramId, value, targetId = 0, index = 0) =>
      event('param', { paramId, value, targetId, index }),
	    createCoreProductSequencerLaneParamEvent: (sequencer, laneIndex, paramId, value) =>
	      event('sequencer-lane-param', { sequencer, laneIndex, paramId, value }),
	    createCoreProductSourcePresetEvent: (targetId, presetId) =>
	      event('source-preset', { targetId, presetId }),
	    createCoreProductSourcePresetEndpointEvent: (targetId, endpoint, presetId, voiceIndex = 0, morph) =>
	      event('source-preset-endpoint', {
	        targetId,
	        endpoint,
	        presetId,
	        voiceIndex,
	        ...(Number.isFinite(morph) ? { morph } : {}),
	      }),
	    createCoreProductSourceOverrideSlotEvent: (targetId, slotIndex, paramIndex, value) =>
	      event('source-override-slot', { targetId, slotIndex, paramIndex, value }),
	    createCoreProductSourceOverrideCommitEvent: (targetId, overrideCount) =>
	      event('source-override-commit', { targetId, overrideCount }),
	  };
  const sourcePresetPath = 'src/audio/CoreProductRuntimeAdapterSourcePresets.ts';
  const sourcePresetSource = stripImportsAndExports(readProjectFile(sourcePresetPath));
  const sourcePresetJs = transpileForVm(sourcePresetSource, resolve(root, sourcePresetPath));
  vm.runInNewContext(sourcePresetJs, context, { filename: sourcePresetPath });

  const path = 'src/audio/CoreProductRuntimeAdapter.ts';
  const source = stripImportsAndExports(readProjectFile(path));
  const js = transpileForVm(source, resolve(root, path));
  vm.runInNewContext(`${js}
globalThis.__runtimeAdapterHarness = {
  MAX_SNAPSHOT_DIFF_EVENTS,
  buildCoreProductSnapshotDiff,
  shouldForwardCoreProductRngDiffs,
};`, context, { filename: path });
  return {
    ...context.__runtimeAdapterHarness,
    context,
  };
}
