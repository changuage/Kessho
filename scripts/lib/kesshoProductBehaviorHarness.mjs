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
  const definition = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:function\\s+)?(?:private\\s+)?(?:async\\s+)?${escaped}\\s*\\(`).exec(source);
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
    .replace(/\bexport\s+(?=(?:const|function|class|type)\b)/g, '');
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
  runtimeFallbackIsDevelopmentError,
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

export function loadCoreProductHostHarness(options = {}) {
  const diagnostics = loadFallbackDiagnosticsHarness();
  const consoleCapture = createConsoleCapture();
  const runtimeInstances = [];
  let nowMs = 1000;
  const runtimeWalkConfigFromState = (state) => ({
    speed: typeof state?.randomWalkSpeed === 'number' ? state.randomWalkSpeed : 1,
    mode: state?.randomWalkMode === 'globalWalk' ? 'globalWalk' : 'localBrownian',
  });

  class CoreProductRuntime {
    constructor() {
      this.audioContext = null;
      this.outputNode = null;
      this.error = null;
      this.events = [];
      this.snapshots = [];
      this.resetCount = 0;
      this.telemetryCallback = null;
      runtimeInstances.push(this);
    }

    setTelemetryCallback(callback) {
      this.telemetryCallback = callback;
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
    }

    reset() {
      this.resetCount += 1;
    }

    registerAsset(asset) {
      this.lastRegisteredAsset = asset;
    }
  }

  class CoreProductAssetAdapter {
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
    CoreProductAssetAdapter,
    CORE_PRODUCT_MEMORY_BUDGETS: {
      webWorkletHeapBytes: 1,
      totalRegisteredDecodedBytes: 1,
    },
    initialCoreProductCapabilityReport: {
      engineMode: 'core-product',
      unsupportedMethods: [],
      legacyFallbacks: [],
    },
    classifyCoreProductRuntimeFallback: diagnostics.classifyCoreProductRuntimeFallback,
    runtimeFallbackIsDevelopmentError: diagnostics.runtimeFallbackIsDevelopmentError,
    buildCoreProductSnapshotDiff: () => ({ applied: true, events: [] }),
    shouldForwardCoreProductRngDiffs: () => false,
    CoreProductArrangementScheduler: class {
      start() {}
      update() {}
      stop() {}
    },
    createCoreProductSnapshot: () => ({ transport: { bpm: 120 } }),
    encodeCoreProductSnapshot: () => new ArrayBuffer(8),
    usesLegacyGranularRuntimeSeed: () => false,
    loadProductLead4opFMPreset: async () => ({}),
    runtimeWalkConfigFromState,
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
    KESSHO_PRODUCT_PARAM_IDS: createParamIds(),
    CORE_PRODUCT_MODULATION_RANGE_MODE: { sampleHold: 1, randomWalk: 2 },
    CORE_PRODUCT_SEQUENCER_IDS: { synth: 1, drum: 2 },
    CORE_PRODUCT_SUBLANE_DIRECTIONS: { forward: 0, reverse: 1, pingpong: 2 },
    CORE_PRODUCT_STEP_VALUE_FIELDS: {
      probability: 1,
      ratchet: 2,
      midiNote: 3,
      expression: 4,
      morph: 5,
      distance: 6,
      trigCondition: 7,
    },
    CORE_PRODUCT_SOURCE_IDS: {
      pad1: 1,
      pad2: 2,
      lead1: 3,
      lead2: 4,
      piano: 5,
      granular: 6,
    },
    midiSampleOffset: () => 0,
    createCoreProductDrumTriggerEvent: (voiceIndex, velocity) => event('drum-trigger', { voiceIndex, velocity }),
    createCoreProductJourneyEvent: (enabled) => event('journey', { enabled }),
    createCoreProductJourneyStateEvent: (enabled, morphPhase = 0, morphRateBars = 4) =>
      event('journey-state', { enabled, morphPhase, morphRateBars }),
    createCoreProductManualNoteEvent: (sourceId, midi, velocity, durationMs) =>
      event('manual-note', { sourceId, midi, velocity, durationMs }),
    createCoreProductMidiEvent: (payload) => event('midi', payload),
    createCoreProductModulationRangeEvent: (target, range, mode, currentValue, valueContext) =>
      event('modulation-range', { target, range, mode, currentValue, valueContext }),
    createCoreProductSequencerClearStepsEvent: (sequencer, laneIndex) =>
      event('sequencer-clear-steps', { sequencer, laneIndex }),
    createCoreProductSequencerDiceEvent: (sequencer, laneIndex, intensity) =>
      event('sequencer-dice', { sequencer, laneIndex, intensity }),
    createCoreProductSequencerLaneParamEvent: (sequencer, laneIndex, paramId, value) =>
      event('sequencer-lane-param', { sequencer, laneIndex, paramId, value }),
    createCoreProductSequencerResetHomeEvent: (sequencer, laneIndex) =>
      event('sequencer-reset-home', { sequencer, laneIndex }),
    createCoreProductSequencerSubLaneConfigEvent: (sequencer, laneIndex, field, steps, direction) =>
      event('sequencer-sublane-config', { sequencer, laneIndex, field, steps, direction }),
    createCoreProductSequencerStepEvent: (sequencer, laneIndex, step, value) =>
      event('sequencer-step', { sequencer, laneIndex, step, value }),
    createCoreProductSequencerStepValueEvent: (sequencer, laneIndex, step, field, value, value2) =>
      event('sequencer-step-value', { sequencer, laneIndex, step, field, value, value2 }),
    createCoreProductStartEvent: () => event('start'),
    createCoreProductStopEvent: () => event('stop'),
    resolveCoreProductDrumMorphRangeTarget: (voiceIndex, key) => ({ controlId: voiceIndex + 100, key }),
    resolveCoreProductDrumParamRangeTarget: (voiceIndex, key, displayKey) => ({ controlId: voiceIndex + 200, key, displayKey }),
    resolveCoreProductRangeTargets: (key) => (key === 'unsupported' ? [] : [{ controlId: 300, key }]),
  };
  Object.assign(context, options.globals ?? {});

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
  const context = {
    KESSHO_PRODUCT_PARAM_IDS: createParamIds(),
    createCoreProductJourneyStateEvent: (enabled, morphPhase, morphRateBars) =>
      event('journey-state', { enabled, morphPhase, morphRateBars }),
    createCoreProductParamEvent: (paramId, value, targetId = 0, index = 0) =>
      event('param', { paramId, value, targetId, index }),
    createCoreProductSequencerLaneParamEvent: (sequencer, laneIndex, paramId, value) =>
      event('sequencer-lane-param', { sequencer, laneIndex, paramId, value }),
    createCoreProductSourcePresetEvent: (targetId, presetId) =>
      event('source-preset', { targetId, presetId }),
  };
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
