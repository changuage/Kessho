import {
  addEvidence,
  assert,
  loadCoreProductHostHarness,
  loadFallbackDiagnosticsHarness,
  methodBody,
  readProjectFile,
  runCheckWithReport,
} from './lib/kesshoProductBehaviorHarness.mjs';

const host = readProjectFile('src/audio/coreProductEngineHost.ts');
const fallbackDiagnostics = readProjectFile('src/audio/CoreProductFallbackDiagnostics.ts');
const appRuntime = readProjectFile('src/audio/runtime.ts');
const app = readProjectFile('src/App.tsx');
const doc = readProjectFile('docs/kessho-product-runtime-fallback-classification.md');
const getterPolicyDoc = readProjectFile('docs/kessho-product-getter-policies.md');
const uiCallsiteFiles = [
  'src/App.tsx',
  'src/ui/CpuOverlay.tsx',
  'src/ui/drums/DrumPage.tsx',
  'src/ui/synth/SynthPage.tsx',
  'src/ui/granular/GranularPage.tsx',
  'src/ui/routing/MidiRoutingPanel.tsx',
  'src/audio/sonicParityHarness.ts',
  'src/ui/presetUtils.ts',
];

function hostMethodNames() {
  const start = host.indexOf('class CoreProductEngineHost');
  const end = host.indexOf('const host = new CoreProductEngineHost');
  assert(start >= 0 && end > start, 'CoreProductEngineHost class body not found');
  const body = host.slice(start, end);
  const names = new Set();
  for (const match of body.matchAll(/^\s*(?:private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    names.add(match[1]);
  }
  return names;
}

function usedAudioEngineMethods() {
  const names = new Set();
  for (const path of uiCallsiteFiles) {
    const source = readProjectFile(path);
    for (const match of source.matchAll(/audioEngine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      names.add(match[1]);
    }
    if (path === 'src/audio/sonicParityHarness.ts') {
      for (const match of source.matchAll(/\bengine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

function assertThrowsMissingMethod(harness, method) {
  try {
    harness.coreProductEngineHost[method](0.5);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    assert(
      message === `Missing audio-critical core-product method: AudioEngine.${method}`,
      `${method} threw the wrong development fallback error`,
    );
    return message;
  }
  throw new Error(`${method} did not throw in development`);
}

function assertThrowsUnimplemented(harness, method) {
  try {
    harness.coreProductEngineHost[method](0.5);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    assert(
      message === `AudioEngine.${method} is not implemented by core-product`,
      `${method} threw the wrong strict proxy error`,
    );
    return message;
  }
  throw new Error(`${method} did not throw`);
}

function fallbackDiagnosticDetails(hostInstance) {
  return {
    unsupportedControlCount: hostInstance.unsupportedControlCount,
    unsupportedGetterCount: hostInstance.unsupportedGetterCount,
    lastUnsupportedMethod: hostInstance.lastUnsupportedMethod,
    lastUnsupportedMethodClass: hostInstance.lastUnsupportedMethodClass,
    runtimeFallbackDiagnosticCount: hostInstance.runtimeFallbackDiagnosticCount,
    audioCriticalFallbackCount: hostInstance.audioCriticalFallbackCount,
  };
}

await runCheckWithReport({
  scriptUrl: import.meta.url,
  reportName: 'kessho-product-runtime-fallbacks-latest.json',
  run: async (report) => {
    for (const token of [
      'type RuntimeFallbackClassification',
      "'safe-visual-fallback'",
      "'temporary-missing-product-telemetry'",
      "'reference-only-web-ts-behavior'",
      "'forbidden-production-fallback'",
      'reportedRuntimeFallbacks',
      'classifyCoreProductRuntimeFallback(property',
      'runtimeFallbackIsDevelopmentError(classification',
      'reportRuntimeFallback(method:',
    ]) {
      assert(`${host}\n${fallbackDiagnostics}`.includes(token), `runtime fallback classifier is missing ${token}`);
    }

    const classifyBody = methodBody(fallbackDiagnostics, 'classifyCoreProductRuntimeFallback');
    assert(classifyBody.includes("property.startsWith('get')"), 'getter fallbacks must be explicitly classified');
    assert(classifyBody.includes("'temporary-missing-product-telemetry'"), 'telemetry/debug getter fallbacks must be classified');
    assert(classifyBody.includes("'safe-visual-fallback'"), 'safe visual getter fallbacks must be classified');
    assert(classifyBody.includes('/^(set|update|reset|dice|start|stop|resume|suspend|trigger|push|load|register|ensure|audition)/'), 'audio-critical method prefixes must be forbidden');
    assert(classifyBody.includes("'reference-only-web-ts-behavior'"), 'non-critical legacy fallback classification must exist');

    const devErrorBody = methodBody(fallbackDiagnostics, 'runtimeFallbackIsDevelopmentError');
    assert(devErrorBody.includes("classification === 'forbidden-production-fallback'"), 'only forbidden production fallbacks should throw in development');

    const reportBody = methodBody(host, 'reportRuntimeFallback');
    for (const token of [
      'this.unsupportedControlCount += 1',
      'this.unsupportedGetterCount += 1',
      'this.lastUnsupportedMethod = method',
      'this.lastUnsupportedMethodClass = classification',
      'this.runtimeFallbackDiagnosticCount += 1',
      'this.audioCriticalFallbackCount += 1',
      'this.reportedRuntimeFallbacks.has(method)',
      'this.reportedRuntimeFallbacks.add(method)',
      'dev || firstReport',
      'runtimeFallbackIsDevelopmentError(classification)',
      'throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`)',
    ]) {
      assert(reportBody.includes(token), `reportRuntimeFallback() is missing ${token}`);
    }

    const proxyBody = host.slice(host.indexOf('export const coreProductEngineHost = new Proxy'));
    for (const token of [
      'const classification = classifyCoreProductRuntimeFallback(property);',
      'host.reportRuntimeFallback(property, classification);',
      "if (property.startsWith('get'))",
      'throw new Error(`AudioEngine.${property} is not implemented by core-product`)',
    ]) {
      assert(proxyBody.includes(token), `core-product proxy fallback is missing ${token}`);
    }

    const rangeBody = methodBody(host, 'reportUnsupportedRangeKey');
    assert(rangeBody.includes('forbidden-production-fallback'), 'unmapped modulation range keys must be classified as forbidden production fallbacks');
    assert(rangeBody.includes('this.unsupportedControlCount += 1'), 'unmapped modulation range keys must increment diagnostics');
    assert(rangeBody.includes('this.runtimeFallbackDiagnosticCount += 1'), 'unmapped modulation range keys must increment runtime fallback diagnostics');
    assert(rangeBody.includes('this.audioCriticalFallbackCount += 1'), 'unmapped modulation range keys must increment audio-critical diagnostics');

    const missingRequiredMethods = [...usedAudioEngineMethods()]
      .filter((name) => !hostMethodNames().has(name))
      .sort();
    assert(
      missingRequiredMethods.length === 0,
      `core-product host is missing required app-facing AudioEngine methods: ${missingRequiredMethods.join(', ')}`,
    );

    for (const token of [
      'import { isCoreProductRangeKeySupported }',
      'coreProductSupportsRuntimeRangeKey(key',
      "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(keyStr)",
      "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(key)",
      'dualModeSupported',
    ]) {
      assert(app.includes(token), `App core-product unsupported-control gating is missing ${token}`);
    }
    assert(
      app.includes('const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
      'App sliderProps must keep dual-slider UI state available for every non-single-only key',
    );
    assert(
      !app.includes('const dualModeSupported = coreProductRuntimeRangeSupported && !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
      'App sliderProps must not hide dual-slider UI state behind native Product Core range support',
    );

    for (const section of [
      '## safe-visual-fallback',
      '## temporary-missing-product-telemetry',
      '## reference-only-web-ts-behavior',
      '## forbidden-production-fallback',
      'All missing `core-product` proxy methods throw',
      'Diagnostics still increment and production logging remains once per missing method',
      '`unsupportedGetterCount`',
      '`lastUnsupportedMethod`',
      '`lastUnsupportedMethodClass`',
      '`runtimeFallbackDiagnosticCount`',
      '`audioCriticalFallbackCount`',
      'Required App callsites are statically audited against `CoreProductEngineHost`',
      'Unsupported native range keys keep the same dual-mode UI state machine in `core-product`',
    ]) {
      assert(doc.includes(section), `runtime fallback documentation is missing ${section}`);
    }

    assert(!appRuntime.includes('missingNoopMethods'), 'runtime must not keep missing-method no-op fallbacks');
    assert(!appRuntime.includes('methodCache'), 'runtime proxy must not cache generated method wrappers');
    addEvidence(report, {
      id: 'static-runtime-fallback-contract',
      summary: 'Static fallback contract, App callsite coverage, and documentation checks passed.',
      details: {
        auditedUiFiles: uiCallsiteFiles,
        appFacingMethodCount: usedAudioEngineMethods().size,
        missingRequiredMethods,
      },
    });

    const startupRangeHarness = loadCoreProductHostHarness({ dev: true });
    startupRangeHarness.host.setDualRanges({ productStartupRange: { min: 0.2, max: 0.8 } });
    startupRangeHarness.host.setRuntimeWalkRanges({ productStartupWalk: { min: 0.1, max: 0.9 } });
    assert(startupRangeHarness.runtime.events.length === 0, 'startup range setters must not post before runtime initialization');
    await startupRangeHarness.host.start({ productStartupRange: 0.5, productStartupWalk: 0.4 });
    const startupRangeEvents = startupRangeHarness.runtime.events.filter((entry) => entry.type === 'modulation-range');
    assert(startupRangeEvents.length === 2, 'startup range setters must flush once the Product Core runtime is initialized');
    assert(
      startupRangeEvents.every((entry) => entry.range && entry.valueContext && entry.valueContext.bpm === 120),
      'startup range flush must include explicit range/value context after snapshot load',
    );
    addEvidence(report, {
      id: 'startup-ranges-flush-after-runtime-ready',
      summary: 'Dual and runtime-walk ranges update host state before startup and flush only after Product Core is initialized.',
      details: {
        eventTypes: startupRangeHarness.runtime.events.map((entry) => entry.type),
        startupRangeEvents,
      },
    });

    const diagnostics = loadFallbackDiagnosticsHarness();
    const classificationCases = [
      ['setUnknownAudioCriticalParam', 'forbidden-production-fallback'],
      ['updateUnknownAudioCriticalState', 'forbidden-production-fallback'],
      ['resetUnknownAudioCriticalLane', 'forbidden-production-fallback'],
      ['diceUnknownAudioCriticalLane', 'forbidden-production-fallback'],
      ['legacyWebTsOnlyBehavior', 'reference-only-web-ts-behavior'],
      ['getOptionalVisualSurface', 'safe-visual-fallback'],
      ['getMissingProductTelemetry', 'temporary-missing-product-telemetry'],
      ['getMissingProductDebugState', 'temporary-missing-product-telemetry'],
    ];
    for (const [method, expected] of classificationCases) {
      const actual = diagnostics.classifyCoreProductRuntimeFallback(method);
      assert(actual === expected, `${method} classified as ${actual}, expected ${expected}`);
    }
    assert(
      diagnostics.runtimeFallbackIsDevelopmentError('forbidden-production-fallback') === true &&
        diagnostics.runtimeFallbackIsDevelopmentError('safe-visual-fallback') === false &&
        diagnostics.runtimeFallbackIsDevelopmentError('temporary-missing-product-telemetry') === false &&
        diagnostics.runtimeFallbackIsDevelopmentError('reference-only-web-ts-behavior') === false,
      'development error behavior must be limited to forbidden production fallbacks',
    );
    addEvidence(report, {
      id: 'classifier-behavior',
      summary: 'Actual fallback classifier maps unknown control/getter names to the expected runtime classifications.',
      details: Object.fromEntries(classificationCases),
    });

    const devHarness = loadCoreProductHostHarness({ dev: true });
    const devThrowMethods = [
      'setUnknownAudioCriticalParam',
      'updateUnknownAudioCriticalState',
      'resetUnknownAudioCriticalLane',
      'diceUnknownAudioCriticalLane',
    ];
    const thrownMessages = devThrowMethods.map((method) => assertThrowsMissingMethod(devHarness, method));
    assert(devHarness.host.unsupportedControlCount === devThrowMethods.length, 'development fallback throws must still increment unsupportedControlCount');
    assert(devHarness.host.unsupportedGetterCount === 0, 'development audio-critical fallbacks must not increment getter count');
    assert(devHarness.host.runtimeFallbackDiagnosticCount === devThrowMethods.length, 'development fallback throws must increment runtimeFallbackDiagnosticCount');
    assert(devHarness.host.audioCriticalFallbackCount === devThrowMethods.length, 'development fallback throws must increment audioCriticalFallbackCount');
    assert(devHarness.host.lastUnsupportedMethod === devThrowMethods.at(-1), 'development fallback throws must record lastUnsupportedMethod');
    assert(devHarness.host.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'development fallback throws must record lastUnsupportedMethodClass');
    assert(
      devHarness.consoleErrors.length === devThrowMethods.length &&
        devHarness.consoleErrors.every((line) => line.includes('forbidden-production-fallback')),
      'development fallback throws must emit diagnostics before throwing',
    );
    addEvidence(report, {
      id: 'dev-audio-critical-fallbacks-throw',
      summary: 'Unknown setter/update/reset/dice methods throw in development after incrementing diagnostics.',
      details: {
        methods: devThrowMethods,
        thrownMessages,
        ...fallbackDiagnosticDetails(devHarness.host),
      },
    });

    const prodHarness = loadCoreProductHostHarness({ dev: false });
    const prodThrownMessages = [
      assertThrowsUnimplemented(prodHarness, 'setUnknownProductionParam'),
      assertThrowsUnimplemented(prodHarness, 'setUnknownProductionParam'),
      assertThrowsUnimplemented(prodHarness, 'updateUnknownProductionState'),
    ];
    const setLogs = prodHarness.consoleErrors.filter((line) => line.includes('AudioEngine.setUnknownProductionParam'));
    const updateLogs = prodHarness.consoleErrors.filter((line) => line.includes('AudioEngine.updateUnknownProductionState'));
    assert(setLogs.length === 1, 'production missing method diagnostics must log once per method');
    assert(updateLogs.length === 1, 'production missing method diagnostics must log first use of each method');
    assert(prodHarness.host.unsupportedControlCount === 3, 'production fallback must increment unsupportedControlCount for every use');
    assert(prodHarness.host.unsupportedGetterCount === 0, 'production setter/update fallbacks must not increment getter count');
    assert(prodHarness.host.runtimeFallbackDiagnosticCount === 3, 'production fallback must increment runtimeFallbackDiagnosticCount for every use');
    assert(prodHarness.host.audioCriticalFallbackCount === 3, 'production fallback must increment audioCriticalFallbackCount for every use');
    assert(prodHarness.host.lastUnsupportedMethod === 'updateUnknownProductionState', 'production fallback must record lastUnsupportedMethod');
    assert(prodHarness.host.lastUnsupportedMethodClass === 'forbidden-production-fallback', 'production fallback must record lastUnsupportedMethodClass');
    addEvidence(report, {
      id: 'production-diagnostics-throw-log-once',
      summary: 'Production unknown methods throw, increment every use, and log only once per missing method.',
      details: {
        thrownMessages: prodThrownMessages,
        ...fallbackDiagnosticDetails(prodHarness.host),
        consoleErrors: prodHarness.consoleErrors,
      },
    });

    const getterHarness = loadCoreProductHostHarness({ dev: true });
    const getterThrownMessages = [
      assertThrowsUnimplemented(getterHarness, 'getOptionalVisualSurface'),
      assertThrowsUnimplemented(getterHarness, 'getMissingProductTelemetry'),
    ];
    assert(getterHarness.host.unsupportedControlCount === 2, 'getter fallbacks must be surfaced in unsupportedControlCount');
    assert(getterHarness.host.unsupportedGetterCount === 2, 'getter fallbacks must increment unsupportedGetterCount');
    assert(getterHarness.host.runtimeFallbackDiagnosticCount === 2, 'getter fallbacks must increment runtimeFallbackDiagnosticCount');
    assert(getterHarness.host.audioCriticalFallbackCount === 0, 'safe/missing telemetry getter fallbacks must not increment audioCriticalFallbackCount');
    assert(getterHarness.host.lastUnsupportedMethod === 'getMissingProductTelemetry', 'getter fallbacks must record lastUnsupportedMethod');
    assert(getterHarness.host.lastUnsupportedMethodClass === 'temporary-missing-product-telemetry', 'getter fallbacks must record lastUnsupportedMethodClass');
    assert(
      getterHarness.consoleErrors.some((line) => line.includes('safe-visual-fallback')) &&
        getterHarness.consoleErrors.some((line) => line.includes('temporary-missing-product-telemetry')),
      'getter fallbacks must emit their classifications in diagnostics',
    );
    addEvidence(report, {
      id: 'getter-fallback-behavior',
      summary: 'Safe visual and missing telemetry getters throw while surfacing classified diagnostics.',
      details: {
        thrownMessages: getterThrownMessages,
        ...fallbackDiagnosticDetails(getterHarness.host),
        consoleErrors: getterHarness.consoleErrors,
      },
    });

    const getterPolicies = diagnostics.CORE_PRODUCT_GETTER_POLICIES;
    const surfacedTelemetryBlockers = Object.entries(getterPolicies)
      .filter(([, entry]) => /telemetry|debug|exposes/i.test(entry.blocker))
      .map(([getter, entry]) => ({ getter, classification: entry.classification, blocker: entry.blocker }));
    assert(surfacedTelemetryBlockers.length >= 8, 'missing telemetry/debug getters must be surfaced with tracked blockers');
    for (const { getter, classification } of surfacedTelemetryBlockers) {
      assert(getterPolicyDoc.includes(`\`${getter}\``), `${getter} is missing from Product Core getter policy docs`);
      assert(getterPolicyDoc.includes(`\`${classification}\``), `${getter} classification ${classification} is missing from Product Core getter policy docs`);
    }
    addEvidence(report, {
      id: 'documented-telemetry-getter-blockers',
      summary: 'Product Core getter policies surface missing telemetry/debug APIs with documented blockers.',
      details: {
        surfacedTelemetryBlockers,
      },
    });

    const referenceHarness = loadCoreProductHostHarness({ dev: true });
    const referenceThrownMessage = assertThrowsUnimplemented(referenceHarness, 'legacyWebTsOnlyBehavior');
    assert(referenceHarness.host.unsupportedControlCount === 1, 'reference-only missing methods must not be treated as supported');
    assert(referenceHarness.host.unsupportedGetterCount === 0, 'reference-only non-getter fallback must not increment unsupportedGetterCount');
    assert(referenceHarness.host.runtimeFallbackDiagnosticCount === 1, 'reference-only fallback must increment runtimeFallbackDiagnosticCount');
    assert(referenceHarness.host.audioCriticalFallbackCount === 0, 'reference-only fallback must not increment audioCriticalFallbackCount');
    assert(referenceHarness.host.lastUnsupportedMethod === 'legacyWebTsOnlyBehavior', 'reference-only fallback must record lastUnsupportedMethod');
    assert(referenceHarness.host.lastUnsupportedMethodClass === 'reference-only-web-ts-behavior', 'reference-only fallback must record lastUnsupportedMethodClass');
    assert(
      referenceHarness.consoleErrors.length === 1 &&
        referenceHarness.consoleErrors[0].includes('reference-only-web-ts-behavior'),
      'reference-only missing methods must emit reference-only diagnostics',
    );
    assert(!hostMethodNames().has('legacyWebTsOnlyBehavior'), 'reference-only fixture unexpectedly exists as a host method');
    addEvidence(report, {
      id: 'reference-only-web-ts-not-supported',
      summary: 'Reference-only web-ts behavior remains a reported fallback, not a supported Product Core host method.',
      details: {
        method: 'legacyWebTsOnlyBehavior',
        thrownMessage: referenceThrownMessage,
        ...fallbackDiagnosticDetails(referenceHarness.host),
        consoleErrors: referenceHarness.consoleErrors,
      },
    });

    console.log('Kessho Product runtime fallback checks passed');
  },
});
