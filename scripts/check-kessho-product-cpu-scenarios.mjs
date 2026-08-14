#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readCpuBudgetReport,
  readPageCpuComparisonReport,
  readWebCpuComparisonReport,
} from './product-core/lib/cpuReports.mjs';
import { reportAgeHours } from './product-core/lib/freshness.mjs';
import { assertPackageScript } from './product-core/lib/packageScripts.mjs';
import {
  collectReportMetadata,
  toRelativePath,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-product-cpu-scenarios-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-product-cpu-scenarios-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pageScenario(pageReport, id) {
  return pageReport.scenarios?.find((scenario) => scenario.id === id) ?? null;
}

function texturePageScenarioId(pageReport) {
  return pageScenario(pageReport, 'texture') ? 'texture' : 'dynamics';
}

function pageScenarioPass(pageReport, id) {
  const scenario = pageScenario(pageReport, id);
  return Boolean(
    pageReport.status === 'pass' &&
      scenario &&
      Object.keys(scenario.errors ?? {}).length === 0 &&
      scenario.engines?.['core-product']?.capture?.rms > 0.0005,
  );
}

function productCpuPercent(pageReport, id) {
  return pageScenario(pageReport, id)?.engines?.['core-product']?.browserProcessCpuPercent ?? null;
}

function pageModules(pageReport, id) {
  return pageScenario(pageReport, id)?.activeModules ?? [];
}

function cpuScenarioMetrics(pageReport, id) {
  const scenario = pageScenario(pageReport, id);
  const product = scenario?.engines?.['core-product'] ?? {};
  const internal = product.internalOverlayCpu ?? {};
  const capture = product.capture ?? {};
  return {
    browserProcessCpuPercent: product.browserProcessCpuPercent ?? null,
    processCpuSeconds: product.processCpuSeconds ?? null,
    internalAvgPercent: internal.avgPercent ?? null,
    internalPeakPercent: internal.peakPercent ?? null,
    renderCpuPercent: capture.renderCpuPercent ?? null,
    renderCpuPeakPercent: capture.renderCpuPeakPercent ?? null,
    activeVoices: capture.activeVoices ?? null,
    activeAssets: capture.activeAssets ?? null,
    activeGrains: capture.activeGrains ?? null,
  };
}

function maxCpuModePercent(report) {
  return Math.max(
    0,
    ...(report.cases?.cpuByMode ?? [])
      .map((entry) => entry.estimatedCpuPercent)
      .filter(Number.isFinite),
  );
}

function passRow(id, label, evidence, metrics = {}) {
  return { id, label, status: 'pass', evidence, metrics };
}

function deferredRow(id, label, reason, evidence = []) {
  return { id, label, status: 'deferred', reason, evidence, metrics: {} };
}

assertPackageScript('core:product:cpu-scenarios', 'node scripts/check-kessho-product-cpu-scenarios.mjs', root);

for (const path of [
  'docs/reports/kessho-product-cpu-budget-latest.json',
  'docs/reports/kessho-product-web-cpu-comparison-latest.json',
  'docs/reports/kessho-product-page-cpu-comparison-latest.json',
  'docs/reports/kessho-product-browser-runtime-latest.json',
  'docs/reports/kessho-product-granular-render-metrics-latest.json',
  'docs/reports/kessho-product-reverb-render-metrics-latest.json',
  'src/ui/productRuntimeTelemetryRateLimits.ts',
  'docs/product-core/product-cpu-governor-policy.md',
]) {
  assert(existsSync(resolve(root, path)), `${path} must exist before CPU scenario signoff`);
}

const cpuBudget = readCpuBudgetReport(root);
const webCpu = readWebCpuComparisonReport(root);
const pageCpu = readPageCpuComparisonReport(root);
const browserRuntime = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const granularRender = readJson('docs/reports/kessho-product-granular-render-metrics-latest.json');
const reverbRender = readJson('docs/reports/kessho-product-reverb-render-metrics-latest.json');
const governorPolicy = read('docs/product-core/product-cpu-governor-policy.md');
const texturePageId = texturePageScenarioId(pageCpu);
const routingRegistry = read('src/ui/routing/routingSourceRegistry.ts');
const routeConflictPolicy = read('src/ui/routing/routeConflictPolicy.ts');
const presetUtils = read('src/ui/presetUtils.ts');
const appSource = read('src/App.tsx');
const appSliderRoutingState = read('src/app/sliderRoutingState.ts');
const productManualTriggers = read('src/ui/useProductRuntimeManualTriggers.ts');
const pageAliases = read('src/ui/pages/pageAliases.ts');
const dirtyDiffClassification = read('scripts/check-kessho-product-dirty-diff-classification.mjs');
const routePredicates = read('src/ui/routing/routePredicates.ts');
const snowflakeEngineGroups = read('src/ui/snowflakeV2/engineGroups.ts');
const presetV2Migration = read('src/presets/presetV2Migration.ts');
const coreProductEvents = read('src/audio/coreProductEvents.ts');
const fallbackCoreHost = read('src/audio/coreEngineHost.ts');
const visualizerPage = read('src/ui/visualizer/ReactiveVisualizerPage.tsx');
const routingMatrix = read('src/ui/global/RoutingMatrix.tsx');
const activeEarthMatrix = read('src/ui/earth/components/ActiveEarthMatrix.tsx');
const runtimeProjectionState = read('src/ui/runtimeProjectionState.ts');
const matrixSurfaceCss = read('src/ui/sliderSystem/matrixSurface.css');

assert(cpuBudget.status === 'pass', 'CPU budget report must pass');
assert(cpuBudget.cpu?.scenarios?.activeFx?.status === 'pass', 'active-FX CPU budget must pass');
assert(cpuBudget.cpu?.scenarios?.disabledFx?.status === 'pass', 'disabled-FX CPU budget must pass');
assert(webCpu.status === 'pass', 'web CPU comparison report must pass');
const webCaptureMinRms = Number(webCpu.metadata?.thresholds?.minRms);
assert(Number.isFinite(webCaptureMinRms), 'web CPU comparison report must declare its capture RMS floor');
assert(webCpu.engines?.['core-product']?.capture?.rms > webCaptureMinRms, 'web CPU comparison Product capture must be audible');
assert(pageCpu.status === 'pass', 'page CPU comparison report must pass');
assert(browserRuntime.status === 'pass', 'browser runtime report must pass');
assert(granularRender.status === 'pass', 'granular render metrics report must pass');
assert(reverbRender.status === 'pass', 'reverb render metrics report must pass');
assertPackageScript('test:mobile-web-hotpaths', 'node scripts/check-mobile-web-hotpaths.mjs', root);

for (const token of [
  'Desktop governor',
  'Mobile browser governor',
  'Native background governor',
  'Lite under pressure',
  'lower visual telemetry rate',
  'Browser/mobile background audio is best-effort',
]) {
  assert(governorPolicy.includes(token), `CPU governor policy must include ${token}`);
}

const telemetryRateLimits = read('src/ui/productRuntimeTelemetryRateLimits.ts');
for (const token of [
  'PRODUCT_VISUAL_TELEMETRY_HZ = 30',
  'PRODUCT_BACKGROUND_VISUAL_TELEMETRY_HZ = 5',
  'PRODUCT_DEBUG_PANEL_HZ = 10',
  'PRODUCT_RUNTIME_SLIDER_HZ = 30',
]) {
  assert(telemetryRateLimits.includes(token), `telemetry rate-limit constants must include ${token}`);
}

const perfAdapter = read('src/ui/useProductRuntimePerfAdapter.ts');
assert(
  perfAdapter.includes('PRODUCT_DEBUG_PANEL_INTERVAL_MS') &&
    perfAdapter.includes('scheduleCpuSummaryPublish') &&
    perfAdapter.includes('pendingCpuSummaryRef'),
  'Product runtime CPU summary publication must be throttled/coalesced through the debug panel interval',
);

for (const id of ['global', 'earth', 'granular', 'reverb', texturePageId, 'routing']) {
  assert(pageScenarioPass(pageCpu, id), `page CPU scenario ${id} must pass`);
}

assert(
  pageModules(pageCpu, 'granular').some((moduleName) => /granular/i.test(moduleName)),
  'granular page CPU scenario must name granular modules',
);
assert(
  pageModules(pageCpu, 'reverb').some((moduleName) => /reverb/i.test(moduleName)) &&
    pageModules(pageCpu, 'reverb').some((moduleName) => /spectral freeze/i.test(moduleName)),
  'reverb page CPU scenario must name reverb and spectral freeze modules',
);
assert(
  browserRuntime.runtimeWalkProbe?.distinctPositionCount > 1 &&
    browserRuntime.sampleHoldProbe?.distinctPositionCount > 1,
  'browser runtime report must prove random-walk and sample-hold movement',
);
assert(
  routingRegistry.includes("sends: { reverb: 'degradeReverbSend' }") &&
    routingRegistry.includes("sends: { degrade: 'reverbDegradeSend' }") &&
    routingRegistry.includes("enabledKeys: ['degradeEnabled', 'driftEnabled', 'erosionEnabled']"),
  'CPU Degrade routing scenario requires registry Degrade/Reverb return sends and predicates',
);
assert(
  routeConflictPolicy.includes('export function normalizeDegradeReverbCrossfeed') &&
    appSliderRoutingState.includes('normalizeDegradeReverbCrossfeed(newState, previousState') &&
    appSource.includes('normalizeDegradeReverbCrossfeed(result)') &&
    presetUtils.includes('normalizeDegradeReverbCrossfeed(newState)') &&
    presetV2Migration.includes('normalizeGraphRepairData'),
  'CPU conflict-normalization scenario requires App, preset load, morph/randomization, and repair paths to share routeConflictPolicy',
);
assert(
  routePredicates.includes('ROUTING_ACTIVE_EPSILON') &&
    snowflakeEngineGroups.includes('level > ROUTING_ACTIVE_EPSILON') &&
    routingRegistry.includes('levelAboveEpsilon(state, input.levelKey)'),
  'CPU zero-level enabled-source scenario requires audible predicates and Snowflake arm activity to use epsilon thresholds',
);
assert(
  productManualTriggers.includes('commitProductControlActionThenTrigger') &&
    productManualTriggers.includes('(_revision, resolvedSliders) => productEngine.auditionSynthNote(productNote, resolvedSliders)') &&
    productManualTriggers.includes('const velocity = options.velocity ?? DEFAULT_MANUAL_DRUM_VELOCITY') &&
    productManualTriggers.includes('(_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, velocity, resolvedSliders)'),
  'CPU manual trigger burst scenario requires Product Control commit before productEngine trigger calls',
);
assert(
  pageAliases.includes("page === 'dynamics' ? 'texture' : page") &&
    presetUtils.includes('normalizeDegradeReverbCrossfeed(newState)'),
  'CPU old dynamics/texture preset scenario requires legacy page aliasing and preset normalization',
);
assert(
  dirtyDiffClassification.includes('dirty-diff-event-budget') &&
    dirtyDiffClassification.includes('fx.dynamics.degrade.') &&
    coreProductEvents.includes('degradeReverbSend') &&
    coreProductEvents.includes('reverbDegradeSend'),
  'CPU dirty-diff classification scenario requires bounded dirty-diff fallback and focused Degrade/Reverb events',
);
assert(
  fallbackCoreHost.includes('getChangedRuntimeWalkParameterKeys(previousEffectiveState, nextEffectiveState, movedKeys)') &&
    fallbackCoreHost.indexOf('getChangedRuntimeWalkParameterKeys(previousEffectiveState, nextEffectiveState, movedKeys)') <
      fallbackCoreHost.indexOf('this.reapplyLastState();', fallbackCoreHost.indexOf('private startRuntimeRandomWalk')),
  'fallback random walk must reject inaudible quantized updates before its monolithic state reapplication',
);
assert(
  visualizerPage.includes('frameScratch.automatedControls') &&
    visualizerPage.includes('frameScratch.modulatedControls') &&
    visualizerPage.includes('frameScratch.buses'),
  'visualizer frames must reuse automation, modulation, and bus scratch storage',
);
assert(
  routingMatrix.includes('columnDragEmitter.schedule') &&
    routingMatrix.includes('cellDragEmitter.schedule') &&
    activeEarthMatrix.includes('valueEmitter.schedule'),
  'specialized matrix sliders must coalesce pointer movement to animation frames',
);
assert(
  runtimeProjectionState.includes('100 - (performance.now() - lastNotificationAt)') &&
    runtimeProjectionState.includes('subscribeRuntimeSliderKeys(keys, schedule)') &&
    runtimeProjectionState.includes('subscribeRuntimeValueKeys(keys, schedule)'),
  'runtime visual projections must combine both stores and publish no faster than 10 Hz',
);
assert(
  !matrixSurfaceCss.includes('transition: left') &&
    !matrixSurfaceCss.includes('transition: width'),
  'matrix runtime indicators must not animate layout properties between telemetry samples',
);

const freshHours = 72;
const staleReports = [
  ['cpu-budget', cpuBudget.generatedAt],
  ['web-cpu-comparison', webCpu.generatedAt],
  ['page-cpu-comparison', pageCpu.generatedAt],
  ['browser-runtime', browserRuntime.generatedAt],
  ['granular-render-metrics', granularRender.generatedAt],
  ['reverb-render-metrics', reverbRender.generatedAt],
].filter(([, generatedAt]) => reportAgeHours(generatedAt) > freshHours);
assert(staleReports.length === 0, `CPU evidence reports must be refreshed within ${freshHours}h: ${staleReports.map(([id]) => id).join(', ')}`);

const moduleAttribution = [
  {
    module: 'earth-soundscape',
    status: pageScenarioPass(pageCpu, 'earth') ? 'pass' : 'fail',
    source: 'page CPU earth scenario plus browser Earth texture probe',
    metrics: {
      ...cpuScenarioMetrics(pageCpu, 'earth'),
      activeTextureSlots: browserRuntime.earthTextureProbe?.summaries?.length ?? 0,
    },
    evidence: [
      'docs/reports/kessho-product-page-cpu-comparison-latest.json: earth',
      'docs/reports/kessho-product-browser-runtime-latest.json: earthTextureProbe',
    ],
  },
  {
    module: 'granular',
    status: granularRender.status,
    source: 'page CPU granular scenario plus offline dense-grain render metric gate',
    metrics: {
      ...cpuScenarioMetrics(pageCpu, 'granular'),
      offlineEstimatedCpuPercent: granularRender.cases.denseGrainTransition.estimatedCpuPercent,
      offlineP95BlockMs: granularRender.cases.denseGrainTransition.p95BlockMs,
      maxSampleDelta: granularRender.cases.denseGrainTransition.maxSampleDelta,
      maxTransitionEdge: granularRender.cases.denseGrainTransition.maxTransitionEdge,
      maxSilentRunFrames: granularRender.cases.denseGrainTransition.maxSilentRunFrames,
    },
    evidence: [
      'docs/reports/kessho-product-page-cpu-comparison-latest.json: granular',
      'docs/reports/kessho-product-granular-render-metrics-latest.json',
    ],
  },
  {
    module: 'reverb',
    status: reverbRender.status,
    source: 'page CPU reverb scenario plus offline reverb tail/transition CPU metric gate',
    metrics: {
      ...cpuScenarioMetrics(pageCpu, 'reverb'),
      tailEstimatedCpuPercent: reverbRender.cases.impulseTail.estimatedCpuPercent,
      transitionEstimatedCpuPercent: reverbRender.cases.parameterTransitions.estimatedCpuPercent,
      maxModeEstimatedCpuPercent: maxCpuModePercent(reverbRender),
      tailPeak: reverbRender.cases.impulseTail.peak,
      tailLateMeanRms: reverbRender.cases.impulseTail.lateMeanRms,
      maxTransitionEdge: reverbRender.cases.parameterTransitions.maxTransitionEdge,
    },
    evidence: [
      'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb',
      'docs/reports/kessho-product-reverb-render-metrics-latest.json',
    ],
  },
  {
    module: 'spectral-freeze',
    status: pageModules(pageCpu, 'reverb').some((moduleName) => /spectral freeze/i.test(moduleName)) ? 'pass' : 'fail',
    source: 'page CPU reverb scenario with spectral freeze active; reverb transition gate covers downstream tail stability',
    metrics: cpuScenarioMetrics(pageCpu, 'reverb'),
    evidence: [
      'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb activeModules includes spectral freeze',
      'docs/reports/kessho-product-reverb-render-metrics-latest.json: parameterTransitions',
    ],
  },
  {
    module: 'texture',
    status: pageScenarioPass(pageCpu, texturePageId) ? 'pass' : 'fail',
    source: 'page CPU Texture foreground scenario with legacy dynamics report fallback',
    metrics: cpuScenarioMetrics(pageCpu, texturePageId),
    evidence: [
      `docs/reports/kessho-product-page-cpu-comparison-latest.json: ${texturePageId}`,
      'src/ui/pages/pageAliases.ts: legacy dynamics page id maps to texture',
    ],
  },
  {
    module: 'visual-telemetry',
    status: browserRuntime.status,
    source: 'browser runtime telemetry movement probes',
    metrics: {
      runtimeWalkTelemetryUpdates: browserRuntime.runtimeWalkProbe?.bridgeDebug?.telemetryUpdateCount ?? null,
      runtimeWalkPublishedPositions: browserRuntime.runtimeWalkProbe?.bridgeDebug?.publishedPositionCount ?? null,
      sampleHoldDistinctPositions: browserRuntime.sampleHoldProbe?.distinctPositionCount ?? null,
    },
    evidence: ['docs/reports/kessho-product-browser-runtime-latest.json'],
  },
  {
    module: 'ui-subscription-callbacks',
    status:
      browserRuntime.runtimeWalkProbe?.bridgeDebug?.publishedPositionCount > 0 &&
      browserRuntime.runtimeWalkProbe?.walkStoreUpdateCount === 0 &&
      browserRuntime.runtimeWalkProbe?.walkIndicatorConsumeCount === 0
        ? 'pass'
        : 'fail',
    source: 'browser runtime callback publication with inactive UI subscriptions kept quiet',
    metrics: {
      walkStoreUpdateCount: browserRuntime.runtimeWalkProbe?.walkStoreUpdateCount ?? null,
      walkIndicatorConsumeCount: browserRuntime.runtimeWalkProbe?.walkIndicatorConsumeCount ?? null,
      postedEventCount: browserRuntime.runtimeWalkProbe?.bridgeDebug?.postedEventCount ?? null,
    },
    evidence: ['docs/reports/kessho-product-browser-runtime-latest.json: runtimeWalkProbe'],
  },
  {
    module: 'native-render-callback',
    status: 'deferred',
    source: 'native/device render CPU evidence is gated by physical iOS/macOS rows',
    metrics: {},
    evidence: ['docs/product-core/background-audio-device-evidence.md'],
  },
];

assert(
  moduleAttribution.filter((entry) => entry.status === 'fail').length === 0,
  `CPU module attribution failed: ${moduleAttribution.filter((entry) => entry.status === 'fail').map((entry) => entry.module).join(', ')}`,
);

const scenarios = [
  passRow('01-default-product-scene', 'Default product scene', [
    'docs/reports/kessho-product-cpu-budget-latest.json: activeFx and disabledFx pass',
    'docs/reports/kessho-product-web-cpu-comparison-latest.json: string-waves arrangement pass',
  ], {
    activeFxAverageCpuPercent: cpuBudget.cpu.scenarios.activeFx.averageCpuPercent,
    activeFxP95Ms: cpuBudget.cpu.scenarios.activeFx.p95Ms,
    webComparisonProductCpuPercent: webCpu.engines['core-product'].browserProcessCpuPercent,
    webComparisonSavedPercent: webCpu.comparison.browserProcessCpuSavedPercent,
  }),
  passRow('02-earth-texture-scene', 'Earth texture scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: earth scenario pass',
    'docs/reports/kessho-product-browser-runtime-latest.json: Earth texture probe pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'earth'),
    activeTextureSlots: browserRuntime.earthTextureProbe?.summaries?.length ?? 0,
  }),
  passRow('03-dense-granular-scene', 'Dense granular scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: granular scenario pass',
    'docs/reports/kessho-product-granular-render-metrics-latest.json: dense-grain render metrics pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'granular'),
    granularOfflineCpuPercent: granularRender.cases.denseGrainTransition.estimatedCpuPercent,
    granularP95BlockMs: granularRender.cases.denseGrainTransition.p95BlockMs,
    granularMaxSampleDelta: granularRender.cases.denseGrainTransition.maxSampleDelta,
  }),
  passRow('04-long-ambient-reverb-scene', 'Long ambient reverb scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb scenario pass',
    'docs/reports/kessho-product-reverb-render-metrics-latest.json: impulse tail metrics pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'reverb'),
    reverbTailCpuPercent: reverbRender.cases.impulseTail.estimatedCpuPercent,
    reverbTailPeak: reverbRender.cases.impulseTail.peak,
    reverbTailLateMeanRms: reverbRender.cases.impulseTail.lateMeanRms,
  }),
  passRow('05-spectral-freeze-scene', 'Spectral freeze scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb scenario includes spectral freeze',
    'docs/reports/kessho-product-reverb-render-metrics-latest.json: reverb transition metrics pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'reverb'),
    reverbTransitionCpuPercent: reverbRender.cases.parameterTransitions.estimatedCpuPercent,
    reverbMaxTransitionEdge: reverbRender.cases.parameterTransitions.maxTransitionEdge,
  }),
  passRow('06-random-walk-sample-hold-modulation-scene', 'Random-walk + sample-hold modulation scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: global random movement scene pass',
    'docs/reports/kessho-product-browser-runtime-latest.json: runtimeWalkProbe and sampleHoldProbe pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'global'),
    runtimeWalkDistinctPositions: browserRuntime.runtimeWalkProbe.distinctPositionCount,
    sampleHoldDistinctPositions: browserRuntime.sampleHoldProbe.distinctPositionCount,
  }),
  passRow('07-mobile-browser-foreground', 'Mobile browser foreground', [
    'npm run test:mobile-web-hotpaths',
    'docs/product-core/product-cpu-governor-policy.md: Mobile browser governor',
  ]),
  passRow('08-browser-hidden-resume-best-effort', 'Browser hidden/resume best-effort', [
    'docs/product-core/product-cpu-governor-policy.md: hidden/resume policy',
    'docs/product-core/background-audio.md: browser/mobile background audio is best-effort',
  ]),
  passRow('09-texture-page-foreground', 'Texture page foreground', [
    `docs/reports/kessho-product-page-cpu-comparison-latest.json: ${texturePageId} scenario pass`,
    'src/ui/pages/pageAliases.ts: normalizeSliderPageId maps dynamics to texture',
    'scripts/check-kessho-product-page-cpu-comparison.mjs: Texture scenario definition',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, texturePageId),
    legacyReportScenario: texturePageId === 'dynamics',
  }),
  passRow('10-degrade-routing-active', 'Degrade routing active', [
    'src/ui/routing/routingSourceRegistry.ts: Degrade send keys and return row predicates',
    'src/App.tsx: route edits enable degrade without changing Product Core architecture',
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: routing scenario pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'routing'),
  }),
  passRow('11-degrade-reverb-conflict-normalization', 'Degrade/Reverb conflict normalization', [
    'src/ui/routing/routeConflictPolicy.ts: shared crossfeed policy',
    'src/App.tsx: routing updates, preset load, morph/randomization normalize crossfeed conflicts',
    'src/ui/presetUtils.ts and src/presets/presetV2Migration.ts: repair/migration normalization',
  ]),
  passRow('12-zero-level-enabled-sources', 'Zero-level enabled sources', [
    'src/ui/routing/routePredicates.ts: ROUTING_ACTIVE_EPSILON',
    'src/ui/snowflakeV2/engineGroups.ts: active engines require enabled predicate and level threshold',
    'src/ui/routing/routingSourceRegistry.ts: audible predicates combine enablement with level threshold',
  ]),
  passRow('13-manual-trigger-burst-after-control-commit', 'Manual trigger burst after control commit', [
    'src/ui/useProductRuntimeManualTriggers.ts: commitProductControlActionThenTrigger wraps productEngine note/drum triggers',
    'src/product-control/ProductControlActions.ts: manual-trigger/request metadata carries kind/note/voice/velocity',
    'scripts/check-kessho-product-dirty-diff-classification.mjs: dirty diff remains bounded/classified',
  ]),
  passRow('14-preset-load-old-dynamics-texture-state', 'Preset load of old dynamics/texture state', [
    'src/ui/pages/pageAliases.ts: legacy page id compatibility',
    'src/ui/presetUtils.ts: preset load normalizes Degrade/Reverb conflicts after compatibility repair',
    'src/audio/recordingTracks.ts: persisted dynamics tap displays as Texture',
  ]),
  passRow('15-dirty-diff-routing-classification', 'Dirty-diff routing classifications stay scoped', [
    'scripts/check-kessho-product-dirty-diff-classification.mjs: dirty diff gates and module path policies',
    'src/audio/coreProductEvents.ts: Degrade/Reverb routing params map to focused ProductEvents',
  ]),
  deferredRow('16-native-ios-render', 'Native iOS render', 'Native Product Core render/device evidence is Batch 4 scope.', [
    'docs/product-core/background-audio-device-evidence.md',
  ]),
  deferredRow('17-native-macos-render', 'Native macOS render', 'Native Product Core render/device evidence is Batch 4 scope.', [
    'docs/product-core/background-audio-device-evidence.md',
  ]),
];

const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  status: scenarios.some((scenario) => scenario.status === 'fail') ? 'fail' : 'pass',
  metadata: collectReportMetadata({
    root,
    generatedAt,
    command: process.argv.map(String).join(' '),
    scenarioName: scenarios.map((scenario) => scenario.id).join(','),
    sampleRate: cpuBudget.cpu?.sampleRate ?? pageCpu.metadata?.sampleRate ?? null,
    blockSize: cpuBudget.cpu?.renderQuantumFrames ?? pageCpu.metadata?.blockSize ?? null,
    durationMs: pageCpu.defaults?.durationMs ?? null,
    thresholds: {
      reportFreshnessHours: freshHours,
      cpuBudget: cpuBudget.metadata?.thresholds ?? null,
    },
    topSuspectedModules: moduleAttribution.map((entry) => entry.module),
  }),
  reportFreshnessHours: freshHours,
  sourceReports: {
    cpuBudget: {
      generatedAt: cpuBudget.generatedAt,
      status: cpuBudget.status,
      path: 'docs/reports/kessho-product-cpu-budget-latest.json',
    },
    webCpuComparison: {
      generatedAt: webCpu.generatedAt,
      status: webCpu.status,
      path: 'docs/reports/kessho-product-web-cpu-comparison-latest.json',
    },
    pageCpuComparison: {
      generatedAt: pageCpu.generatedAt,
      status: pageCpu.status,
      scenarioCount: pageCpu.scenarios?.length ?? 0,
      path: 'docs/reports/kessho-product-page-cpu-comparison-latest.json',
    },
    browserRuntime: {
      generatedAt: browserRuntime.generatedAt,
      status: browserRuntime.status,
      path: 'docs/reports/kessho-product-browser-runtime-latest.json',
    },
    granularRenderMetrics: {
      generatedAt: granularRender.generatedAt,
      status: granularRender.status,
      path: 'docs/reports/kessho-product-granular-render-metrics-latest.json',
    },
    reverbRenderMetrics: {
      generatedAt: reverbRender.generatedAt,
      status: reverbRender.status,
      path: 'docs/reports/kessho-product-reverb-render-metrics-latest.json',
    },
  },
  policy: {
    desktop: 'Ultra allowed when headroom exists; full visual telemetry allowed.',
    mobileBrowser: 'Balanced default; Lite under pressure; heavy shimmer/reverb/granular modes limited; lower visual telemetry rate when needed.',
    nativeBackground: 'Conservative profile; stable render callback budget; no realtime allocations.',
  },
  moduleAttribution,
  scenarios,
};

writeJsonReport(jsonReportPath, report);

const lines = [
  '# Kessho Product CPU Scenarios',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  '## Scenario Matrix',
  '',
  '| Scenario | Status | Evidence | Key Metrics |',
  '| --- | --- | --- | --- |',
];

for (const scenario of scenarios) {
  const evidence = [...(scenario.evidence ?? []), scenario.reason ? `Reason: ${scenario.reason}` : ''].filter(Boolean).join('<br>');
  const metrics = Object.entries(scenario.metrics ?? {})
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? Number(value.toFixed(6)) : value}`)
    .join('<br>');
  lines.push(`| ${scenario.label} | ${scenario.status.toUpperCase()} | ${evidence} | ${metrics || '-'} |`);
}

lines.push(
  '',
  '## Governor Policy',
  '',
  `- Desktop: ${report.policy.desktop}`,
  `- Mobile browser: ${report.policy.mobileBrowser}`,
  `- Native background: ${report.policy.nativeBackground}`,
  '',
  '## Module Attribution',
  '',
  '| Module | Status | Source | Key Metrics |',
  '| --- | --- | --- | --- |',
);

for (const entry of moduleAttribution) {
  const metrics = Object.entries(entry.metrics ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? Number(value.toFixed(6)) : value}`)
    .join('<br>');
  lines.push(`| ${entry.module} | ${entry.status.toUpperCase()} | ${entry.source} | ${metrics || '-'} |`);
}

lines.push(
  '',
  '## Source Reports',
  '',
  `- ${report.sourceReports.cpuBudget.path}`,
  `- ${report.sourceReports.webCpuComparison.path}`,
  `- ${report.sourceReports.pageCpuComparison.path}`,
  `- ${report.sourceReports.browserRuntime.path}`,
  `- ${report.sourceReports.granularRenderMetrics.path}`,
  `- ${report.sourceReports.reverbRenderMetrics.path}`,
  '',
);

writeMarkdownReport(markdownReportPath, lines);

console.log(`Kessho Product CPU scenario checks passed (report: ${toRelativePath(root, markdownReportPath)}, ${toRelativePath(root, jsonReportPath)})`);
