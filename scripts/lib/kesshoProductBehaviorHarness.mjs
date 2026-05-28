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
    .replace(/\bexport\s+(?=(?:const|function|class|type|interface)\b)/g, '');
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
    }

    reset() {
      this.resetCount += 1;
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
    initialCoreProductCapabilityReport: {
      engineMode: 'core-product',
      unsupportedMethods: [],
      legacyFallbacks: [],
    },
    classifyCoreProductRuntimeFallback: diagnostics.classifyCoreProductRuntimeFallback,
    CORE_PRODUCT_GETTER_POLICIES: diagnostics.CORE_PRODUCT_GETTER_POLICIES,
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
    KESSHO_PRODUCT_EVENT_IDS: {
      SetSequencerLane: 8,
      ResetSequencerLaneHome: 28,
      DiceSequencerLane: 29,
    },
    CORE_PRODUCT_MODULATION_RANGE_MODE: { sampleHold: 1, randomWalk: 2 },
    CORE_PRODUCT_SEQUENCER_IDS: { synth: 1, drum: 2 },
    CORE_PRODUCT_SUBLANE_DIRECTIONS: { forward: 0, reverse: 1, pingpong: 2 },
    CORE_PRODUCT_STEP_TOGGLE_FLAGS: { active: 1, clearLane: 2, clearField: 4, rangeValue: 8 },
    CORE_PRODUCT_DICE_FLAGS: { trigger: 1, probability: 2, ratchet: 4, midiNote: 8, expression: 16, morph: 32, distance: 64, swing: 128 },
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
      event('sequencer-dice', {
        sequencer,
        laneIndex,
        intensity,
        eventKind: 29,
        targetId: sequencer === 'synth' ? 1 : 2,
        index: laneIndex,
      }),
    createCoreProductSequencerEvolveClock: () => ({ tick: () => {}, reset: () => {} }),
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
  normalizeDrumSequencerStepValueOverrides,
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
  normalizeEvolveConfigs,
});
}`, context, { filename: sequencerEvolveConfigPath });

  const sequencerEvolvePath = 'src/audio/CoreProductHostSequencerEvolve.ts';
  const sequencerEvolveSource = stripImportsAndExports(readProjectFile(sequencerEvolvePath));
  const sequencerEvolveJs = transpileForVm(sequencerEvolveSource, resolve(root, sequencerEvolvePath));
  vm.runInNewContext(`{
${sequencerEvolveJs}
Object.assign(globalThis, {
  createCoreProductSequencerEvolveClock,
});
}`, context, { filename: sequencerEvolvePath });

  const hostDiagnosticsPath = 'src/audio/product/host/CoreProductHostDiagnostics.ts';
  const hostDiagnosticsSource = stripImportsAndExports(readProjectFile(hostDiagnosticsPath)).replaceAll('import.meta.env', '__IMPORT_META_ENV__');
  const hostDiagnosticsJs = transpileForVm(hostDiagnosticsSource, resolve(root, hostDiagnosticsPath));
  vm.runInNewContext(`${hostDiagnosticsJs}
Object.assign(globalThis, {
  CoreProductHostDiagnostics,
});`, context, { filename: hostDiagnosticsPath });

  const patchClassifierPath = 'src/audio/product/host/CoreProductPatchClassifier.ts';
  const patchClassifierSource = stripImportsAndExports(readProjectFile(patchClassifierPath));
  const patchClassifierJs = transpileForVm(patchClassifierSource, resolve(root, patchClassifierPath));
  vm.runInNewContext(`${patchClassifierJs}
Object.assign(globalThis, {
  snapshotReloadReasonForProductPatch,
});`, context, { filename: patchClassifierPath });

  const leadPresetDataLoaderPath = 'src/audio/product/host/CoreProductLeadPresetDataLoader.ts';
  const leadPresetDataLoaderSource = stripImportsAndExports(readProjectFile(leadPresetDataLoaderPath));
  const leadPresetDataLoaderJs = transpileForVm(leadPresetDataLoaderSource, resolve(root, leadPresetDataLoaderPath));
  vm.runInNewContext(`${leadPresetDataLoaderJs}
Object.assign(globalThis, {
  CoreProductLeadPresetDataLoader,
});`, context, { filename: leadPresetDataLoaderPath });

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
    coreProductDrumRuntimeParamId: (paramIndex) => `DrumRuntime${paramIndex}`,
    coreProductLeadRuntimeParamId: (leadIndex, paramIndex) => `Lead${leadIndex + 1}Runtime${paramIndex}`,
    coreProductPadRuntimeParamId: (padIndex, paramIndex) => `Pad${padIndex + 1}Runtime${paramIndex}`,
    createCoreProductJourneyStateEvent: (enabled, morphPhase, morphRateBars) =>
      event('journey-state', { enabled, morphPhase, morphRateBars }),
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
