import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const now = new Date();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0, `missing start token ${startToken}`);
  assert(end > start, `missing end token ${endToken}`);
  return source.slice(start, end);
}

function parseRunCommands(workflow) {
  return workflow
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- run: '))
    .map((line) => line.slice('- run: '.length).trim());
}

function modifiedAfter(path, isoDate) {
  if (!existsSync(resolve(root, path))) return false;
  return statSync(resolve(root, path)).mtimeMs > Date.parse(isoDate) + 1000;
}

function requireFreshReport(path, generatedAt, inputs) {
  assert(existsSync(resolve(root, path)), `${path} is missing`);
  assert(Number.isFinite(Date.parse(generatedAt)), `${path} has invalid generatedAt`);
  const ageMs = now.getTime() - Date.parse(generatedAt);
  assert(ageMs >= 0, `${path} generatedAt is in the future`);
  assert(ageMs < 24 * 60 * 60 * 1000, `${path} is stale: generatedAt is older than 24 hours`);
  const staleInputs = inputs.filter((input) => modifiedAfter(input, generatedAt));
  assert(staleInputs.length === 0, `${path} is stale; rerun after changes to ${staleInputs.join(', ')}`);
}

function collectFiles(path, collected = []) {
  const fullPath = resolve(root, path);
  if (!existsSync(fullPath)) return collected;
  const stat = statSync(fullPath);
  if (stat.isFile()) {
    collected.push(relative(root, fullPath));
    return collected;
  }
  if (!stat.isDirectory()) return collected;
  for (const entry of readdirSync(fullPath, { withFileTypes: true })) {
    const child = resolve(fullPath, entry.name);
    const childRelative = relative(root, child);
    if (
      childRelative.startsWith('docs/reports') ||
      childRelative === 'dist' ||
      childRelative.startsWith('dist/') ||
      childRelative === 'build' ||
      childRelative.startsWith('build/') ||
      childRelative === 'src/audio/generated' ||
      childRelative.startsWith('src/audio/generated/') ||
      childRelative === 'cpp/KesshoCore/generated' ||
      childRelative.startsWith('cpp/KesshoCore/generated/') ||
      childRelative === 'archive' ||
      childRelative.startsWith('archive/') ||
      childRelative.includes('node_modules') ||
      childRelative.includes('/.git/')
    ) {
      continue;
    }
    if (entry.isDirectory()) collectFiles(childRelative, collected);
    else if (entry.isFile()) collected.push(childRelative);
  }
  return collected;
}

function stepByName(report, stepName) {
  return (report.steps ?? []).find((step) => step.step === stepName);
}

function assertStepPassed(report, stepName) {
  const step = stepByName(report, stepName);
  assert(step, `Product Core CI report is missing prerequisite step ${stepName}`);
  assert(step.status === 'pass', `Product Core CI prerequisite ${stepName} did not pass`);
  assert(Number.isFinite(Date.parse(step.startedAt)), `${stepName} is missing startedAt`);
  assert(Number.isFinite(Date.parse(step.finishedAt)), `${stepName} is missing finishedAt`);
  return step;
}

function writeGateReport(report) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# Kessho Product Default Gate v3',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Web default runtime: ${report.webDefaultRuntime}`,
    '',
    `Product browser runtime report: ${report.browserRuntime.report}`,
    `Sequencer behavior report: ${report.sequencerBehavior.report}`,
    '',
    '## Browser Runtime Cases',
    '',
    '| Case | RMS | Peak |',
    '| --- | ---: | ---: |',
    ...report.browserRuntime.cases.map((entry) => `| ${entry.id} | ${entry.rms.toFixed(6)} | ${entry.peak.toFixed(6)} |`),
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

const app = read('src/App.tsx');
const audioEngineRuntimeUi = read('src/ui/audioEngineRuntimeUi.ts');
const productRuntimeUiHelpers = read('src/ui/productRuntimeUi.ts');
const audioEngineRuntimeSwitch = read('src/ui/AudioEngineRuntimeSwitch.tsx');
const runtimeModeSwitch = read('src/ui/RuntimeModeSwitch.tsx');
const selectedAudioEngineRuntimeSwitch = read('src/ui/SelectedAudioEngineRuntimeSwitch.tsx');
const productRuntimeSwitch = read('src/ui/ProductRuntimeSwitch.tsx');
const audioEngineRuntimeNavigation = read('src/ui/useAudioEngineRuntimeNavigation.ts');
const productRuntimeNavigationCore = read('src/ui/useProductRuntimeNavigationCore.ts');
const productRuntimeSession = read('src/ui/useProductRuntimeSession.ts');
const productRuntimeModeSession = read('src/ui/useProductRuntimeModeSession.ts');
const productRuntimePlaybackRuntime = read('src/ui/useProductRuntimePlaybackRuntime.ts');
const productRuntimePlaybackAdapter = read('src/ui/useProductRuntimePlaybackAdapter.ts');
const productRuntimeUi = read('src/ui/useProductRuntimeUi.ts');
const selectedAudioEngineRuntimeSession = read('src/ui/useSelectedAudioEngineRuntimeSession.ts');
const selectedAudioEngineRuntimeUi = read('src/ui/useSelectedAudioEngineRuntimeUi.ts');
const selectedAudioEngineGlobalRuntimeProps = read('src/ui/useSelectedAudioEngineGlobalRuntimeProps.ts');
const productRuntimeGlobalSurface = read('src/ui/useProductRuntimeGlobalSurface.ts');
const selectedAudioEngineGlobalRuntimeSurface = read('src/ui/useSelectedAudioEngineGlobalRuntimeSurface.ts');
const productEngineProxy = read('src/audio/product/ProductEngineProxy.ts');
const productAudioEngineCompat = read('src/audio/product/ProductAudioEngineCompat.ts');
const selectedProductRuntime = read('src/audio/product/SelectedProductRuntime.ts');
const productAudioRuntimeSelection = read('src/audio/product/ProductAudioRuntimeSelection.ts');
const productRuntimeCapabilityReport = read('src/audio/product/ProductRuntimeCapabilityReport.ts');
const globalPage = read('src/ui/global/GlobalPage.tsx');
const globalRuntimeComparisonPanel = read('src/ui/global/GlobalRuntimeComparisonPanel.tsx');
const audioRecording = read('src/ui/useAudioRecording.ts');
const selectedAudioEngineMacRecovery = read('src/ui/useSelectedAudioEngineMacRecovery.ts');
const selectedAudioEngineLiveTriggerCallbacks = read('src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts');
const selectedAudioEngineEvolveOverrideCallbacks = read('src/ui/useSelectedAudioEngineEvolveOverrideCallbacks.ts');
const selectedAudioEngineRuntimeValueCleanup = read('src/ui/useSelectedAudioEngineRuntimeValueCleanup.ts');
const selectedAudioEngineRuntimeWalkSync = read('src/ui/useSelectedAudioEngineRuntimeWalkSync.ts');
const selectedAudioEngineRangeSync = read('src/ui/useSelectedAudioEngineRangeSync.ts');
const productRuntimeCoordination = read('src/ui/useProductRuntimeCoordination.ts');
const productRuntimeEvolveOverrideCallbacks = read('src/ui/useProductRuntimeEvolveOverrideCallbacks.ts');
const productRuntimeRangeSync = read('src/ui/useProductRuntimeRangeSync.ts');
const productRuntimeValueCleanup = read('src/ui/useProductRuntimeValueCleanup.ts');
const productRuntimeWalkSync = read('src/ui/useProductRuntimeWalkSync.ts');
const selectedAudioEngineRuntimeCoordination = read('src/ui/useSelectedAudioEngineRuntimeCoordination.ts');
const runtimeWalkPositionSync = read('src/ui/runtimeWalkPositionSync.ts');
const morphPositionRuntimeSurface = read('src/ui/useMorphPositionRuntimeSurface.ts');
const journeyMorphRuntimeSurface = read('src/ui/useJourneyMorphRuntimeSurface.ts');
const selectedAudioEngineRuntimeCapabilities = read('src/ui/useSelectedAudioEngineRuntimeCapabilities.ts');
const selectedAudioEngineRuntimeTelemetry = read('src/ui/useSelectedAudioEngineRuntimeTelemetry.ts');
const productRuntimeLifecycleSurface = read('src/ui/useProductRuntimeLifecycleSurface.ts');
const productRuntimeMacRecovery = read('src/ui/useProductRuntimeMacRecovery.ts');
const productRuntimeRecordingRuntime = read('src/ui/useProductRuntimeRecordingRuntime.ts');
const productRuntimeStateRuntime = read('src/ui/useProductRuntimeStateRuntime.ts');
const productRuntimeTelemetry = read('src/ui/useProductRuntimeTelemetry.ts');
const selectedAudioEngineRuntimeLifecycleSurface = read('src/ui/useSelectedAudioEngineRuntimeLifecycleSurface.ts');
const selectedAudioEngineStateReconciliation = read('src/ui/useSelectedAudioEngineStateReconciliation.ts');
const selectedAudioEngineTransportDebug = read('src/ui/useSelectedAudioEngineTransportDebug.ts');
const selectedAudioEngineStateRuntime = read('src/ui/useSelectedAudioEngineStateRuntime.ts');
const selectedAudioEngineMediaSession = read('src/ui/useSelectedAudioEngineMediaSession.ts');
const selectedAudioEnginePlaybackControls = read('src/ui/useSelectedAudioEnginePlaybackControls.ts');
const selectedAudioEnginePlaybackRuntime = read('src/ui/useSelectedAudioEnginePlaybackRuntime.ts');
const selectedAudioEngineRuntimeShell = read('src/ui/useSelectedAudioEngineRuntimeShell.ts');
const selectedAudioEngineStartAction = read('src/ui/useSelectedAudioEngineStartAction.ts');
const selectedAudioEnginePlaybackStartState = read('src/ui/useSelectedAudioEnginePlaybackStartState.ts');
const selectedAudioEngineJourneyPlaybackAction = read('src/ui/useSelectedAudioEngineJourneyPlaybackAction.ts');
const selectedAudioEngineStopAction = read('src/ui/useSelectedAudioEngineStopAction.ts');
const selectedAudioEnginePresetLoadFade = read('src/ui/useSelectedAudioEnginePresetLoadFade.ts');
const selectedAudioEnginePlaybackUiProps = read('src/ui/useSelectedAudioEnginePlaybackUiProps.ts');
const productRuntimePlaybackSurface = read('src/ui/useProductRuntimePlaybackSurface.ts');
const productRuntimeJourneyPlaybackAction = read('src/ui/useProductRuntimeJourneyPlaybackAction.ts');
const productRuntimePlaybackStartState = read('src/ui/useProductRuntimePlaybackStartState.ts');
const productRuntimePlaybackUiProps = read('src/ui/useProductRuntimePlaybackUiProps.ts');
const productRuntimePresetLoadFade = read('src/ui/useProductRuntimePresetLoadFade.ts');
const productRuntimeStartAction = read('src/ui/useProductRuntimeStartAction.ts');
const productRuntimeStopAction = read('src/ui/useProductRuntimeStopAction.ts');
const selectedAudioEnginePlaybackSurface = read('src/ui/useSelectedAudioEnginePlaybackSurface.ts');
const selectedAudioEnginePlaybackTimer = read('src/ui/useSelectedAudioEnginePlaybackTimer.ts');
const capacitorAudioSessionDiagnostics = read('src/ui/useCapacitorAudioSessionDiagnostics.ts');
const selectedAudioEngineCapacitorAudioSession = read('src/ui/useSelectedAudioEngineCapacitorAudioSession.ts');
const selectedAudioEngineRemoteCommandPlayback = read('src/ui/useSelectedAudioEngineRemoteCommandPlayback.ts');
const capacitorMacAudioStatus = read('src/ui/useCapacitorMacAudioStatus.ts');
const productRuntimePlatformSurface = read('src/ui/useProductRuntimePlatformSurface.ts');
const productRuntimeCapacitorAudioSession = read('src/ui/useProductRuntimeCapacitorAudioSession.ts');
const productRuntimeMacAudioStatus = read('src/ui/useProductRuntimeMacAudioStatus.ts');
const selectedAudioEnginePlatformRuntimeSurface = read('src/ui/useSelectedAudioEnginePlatformRuntimeSurface.ts');
const platformRuntimeCapabilities = read('src/ui/usePlatformRuntimeCapabilities.ts');
const presetBootstrapRuntimeSurface = read('src/ui/usePresetBootstrapRuntimeSurface.ts');
const cloudPresetStoreBootstrap = read('src/ui/useCloudPresetStoreBootstrap.ts');
const presetLibraryLoader = read('src/ui/usePresetLibraryLoader.ts');
const presetLibraryRuntimeSurface = read('src/ui/usePresetLibraryRuntimeSurface.ts');
const savedPresetResolver = read('src/ui/useSavedPresetResolver.ts');
const autoStartPresetResolver = read('src/ui/useAutoStartPresetResolver.ts');
const presetPlatformMaintenance = read('src/ui/usePresetPlatformMaintenance.ts');
const presetSequencerRestore = read('src/ui/usePresetSequencerRestore.ts');
const presetRestoreRuntimeSurface = read('src/ui/usePresetRestoreRuntimeSurface.ts');
const synthPageSequencerBridge = read('src/ui/useSynthPageSequencerBridge.ts');
const drumPageSequencerBridge = read('src/ui/useDrumPageSequencerBridge.ts');
const selectedPageRuntimeBridges = read('src/ui/useSelectedAudioEnginePageRuntimeBridges.ts');
const productRuntimePageSurface = read('src/ui/useProductRuntimePageSurface.ts');
const productRuntimePageBridgeOptions = read('src/ui/useProductRuntimePageBridgeOptions.ts');
const productRuntimePageRuntimeBridges = read('src/ui/useProductRuntimePageRuntimeBridges.ts');
const productRuntimePageTelemetryProps = read('src/ui/useProductRuntimePageTelemetryProps.ts');
const productRuntimePageSequencerProps = read('src/ui/useProductRuntimePageSequencerProps.ts');
const productRuntimePageControlProps = read('src/ui/useProductRuntimePageControlProps.ts');
const selectedPageRuntimeSurface = read('src/ui/useSelectedAudioEnginePageRuntimeSurface.ts');
const selectedPageRuntimeBridgeOptions = read('src/ui/useSelectedAudioEnginePageRuntimeBridgeOptions.ts');
const selectedPageTelemetryRuntimeProps = read('src/ui/useSelectedAudioEnginePageTelemetryRuntimeProps.ts');
const selectedPageSequencerRuntimeProps = read('src/ui/useSelectedAudioEnginePageSequencerRuntimeProps.ts');
const selectedPageControlRuntimeProps = read('src/ui/useSelectedAudioEnginePageControlRuntimeProps.ts');
const productRuntimeCallbackRegistrations = read('src/ui/useProductRuntimeCallbackRegistrations.ts');
const productRuntimeLiveTriggerCallbacks = read('src/ui/useProductRuntimeLiveTriggerCallbacks.ts');
const productRuntimeVisualizerCallbacks = read('src/ui/useProductRuntimeVisualizerCallbacks.ts');
const selectedAudioEngineRuntimeCallbackRegistrations = read('src/ui/useSelectedAudioEngineRuntimeCallbackRegistrations.ts');
const selectedAudioEngineVisualizerCallbacks = read('src/ui/useSelectedAudioEngineVisualizerCallbacks.ts');
const productApi = read('cpp/KesshoCore/src/product/KesshoProductApi.cpp');
const productTypesHeader = read('cpp/KesshoCore/include/KesshoCore/KesshoProductTypes.h');
const packageJson = readJson('package.json');
const workflow = read('.github/workflows/product-core-ci.yml');
const productCiRunner = read('scripts/run-kessho-product-ci.mjs');
const defaultGateDoc = read('docs/kessho-product-default-gate-v3.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const productCiReport = readJson('docs/reports/kessho-product-ci-latest.json');
const browserRuntimeReport = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const cpuReport = readJson('docs/reports/kessho-product-cpu-budget-latest.json');
const runtimeFallbackReport = readJson('docs/reports/kessho-product-runtime-fallbacks-latest.json');
const unsupportedSurfaceReport = readJson('docs/reports/kessho-product-unsupported-surface-latest.json');
const dirtyDiffReport = readJson('docs/reports/kessho-product-dirty-diff-classification-latest.json');
const hostReconciliationReport = readJson('docs/reports/kessho-product-host-reconciliation-latest.json');
const sequencerUiReport = readJson('docs/reports/kessho-product-sequencer-ui-parity-latest.json');
const patchBridgeReport = readJson('docs/reports/kessho-product-patch-bridges.json');
const assetManifestReport = readJson('docs/reports/kessho-product-asset-manifest-latest.json');

const appRuntimeModeBody = sourceSlice(productAudioRuntimeSelection, 'export function getProductRuntimeMode()', 'export function getProductRuntimeModes()');
assert(
  appRuntimeModeBody.includes('getProductionProductRuntimeMode()') && productAudioRuntimeSelection.includes('getProductEngineRuntimeMode()'),
  'ProductAudioRuntimeSelection runtime selection must default to core-product through ProductEngineProxy',
);
assert(
  appRuntimeModeBody.includes('if (!isDevRuntime()) return getProductionProductRuntimeMode();') && productAudioRuntimeSelection.includes('getProductEngineRuntimeMode()'),
  'ProductAudioRuntimeSelection runtime selection must force core-product outside dev builds through ProductEngineProxy',
);
assert(!appRuntimeModeBody.includes("return 'core-bridge';"), 'ProductAudioRuntimeSelection runtime selection must not default to the old bridge');
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeLifecycleSurface'") &&
    !app.includes('useSelectedAudioEngineRuntimeLifecycleSurface({') &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime'") &&
    productRuntimeLifecycleSurface.includes("import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery'") &&
    productRuntimeLifecycleSurface.includes('type ProductRuntimeLifecycleSurfaceOptions = {') &&
    productRuntimeLifecycleSurface.includes('productRuntimeMode: ProductRuntimeSelectionMode') &&
    productRuntimeLifecycleSurface.includes('getProductTransportDebugState: () => ProductEngineState') &&
    productRuntimeLifecycleSurface.includes('stateRef: MutableRefObject<SliderState>') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeRecordingRuntime(options.productRuntimeMode)') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeTelemetry({') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeStateRuntime({') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeMacRecovery({') &&
    !productRuntimeLifecycleSurface.includes('Parameters<typeof useProductRuntimeTelemetry>') &&
    !productRuntimeLifecycleSurface.includes('Parameters<typeof useProductRuntimeStateRuntime>') &&
    !productRuntimeLifecycleSurface.includes('Parameters<typeof useProductRuntimeMacRecovery>') &&
    !productRuntimeLifecycleSurface.includes('useSelectedAudioEngineRuntimeLifecycleSurface') &&
    !productRuntimeLifecycleSurface.includes('productEngine') &&
    !productRuntimeLifecycleSurface.includes('selectedProductRuntime') &&
    !productRuntimeLifecycleSurface.includes('referenceAudioEngineDebug'),
  'App must consume runtime lifecycle through the product-named facade while the facade composes product lifecycle wrappers',
);
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineMacRecovery'") &&
    !app.includes('useSelectedAudioEngineMacRecovery({') &&
    !app.includes('getSelectedReferenceAudioContextState') &&
    !app.includes('disposeSelectedReferenceEngine') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeMacRecovery({') &&
    productRuntimeMacRecovery.includes('type ProductRuntimeMacRecoveryOptions = {') &&
    productRuntimeMacRecovery.includes('productRuntimeMode: ProductRuntimeSelectionMode') &&
    productRuntimeMacRecovery.includes('stateRef: MutableRefObject<SliderState>') &&
    productRuntimeMacRecovery.includes('audioEngineRuntimeMode: productRuntimeMode') &&
    productRuntimeMacRecovery.includes('TODO(product-runtime-compat-10C)') &&
    !productRuntimeMacRecovery.includes('SelectedRuntimeMacRecoveryOptions') &&
    !productRuntimeMacRecovery.includes('Parameters<typeof useSelectedAudioEngineMacRecovery>') &&
    selectedAudioEngineMacRecovery.includes('getSelectedReferenceAudioContextState') &&
    selectedAudioEngineMacRecovery.includes('disposeSelectedReferenceEngine') &&
    selectedAudioEngineMacRecovery.includes('startSelectedAudioEngine(stateRef.current)'),
  'App must delegate macOS reference audio-context recovery to the selected runtime recovery hook',
);
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeTelemetry'") &&
    !app.includes('useSelectedAudioEngineRuntimeTelemetry({') &&
    app.includes('productRuntimeSupportsRangeKey') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCapabilities'") &&
    !app.includes("from './ui/useSelectedAudioEngineTelemetrySurface'") &&
    !app.includes('isCoreProductRangeKeySupported') &&
    !app.includes('coreProductSupportsRuntimeRangeKey') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeTelemetry({') &&
    productRuntimeTelemetry.includes('type ProductRuntimeTelemetryOptions = {') &&
    productRuntimeTelemetry.includes('productRuntimeMode: ProductRuntimeSelectionMode') &&
    productRuntimeTelemetry.includes('type ProductRuntimeTelemetry = {') &&
    productRuntimeTelemetry.includes('getProductDynamicsVisualTelemetry: () => ProductDynamicsVisualTelemetry') &&
    productRuntimeTelemetry.includes('pushProductMidiMessage: (message: KesshoMidiMessage) => void') &&
    productRuntimeTelemetry.includes('useSelectedAudioEngineRuntimeTelemetry({') &&
    productRuntimeTelemetry.includes('productRuntimeSupportsRangeKey: selectedRuntimeSupportsRangeKey') &&
    !productRuntimeTelemetry.includes('SelectedRuntimeTelemetryOptions') &&
    !productRuntimeTelemetry.includes('Parameters<typeof useSelectedAudioEngineRuntimeTelemetry>') &&
    selectedAudioEngineRuntimeTelemetry.includes('useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineRuntimeTelemetry.includes('useSelectedAudioEngineRuntimeCapabilities({') &&
    selectedAudioEngineRuntimeTelemetry.includes('setSelectedVisualTelemetryActive: telemetrySurface.setSelectedVisualTelemetryActive') &&
    selectedAudioEngineRuntimeCapabilities.includes("import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents'") &&
    selectedAudioEngineRuntimeCapabilities.includes("audioEngineRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key)") &&
    selectedAudioEngineRuntimeCapabilities.includes("const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced'"),
  'App must delegate Product Core range and visual telemetry support decisions to selected runtime telemetry',
);
assert(
  app.includes("from './ui/useProductRuntimeCallbackRegistrations'") &&
    app.includes('useProductRuntimeCallbackRegistrations({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCallbackRegistrations'") &&
    !app.includes('useSelectedAudioEngineRuntimeCallbackRegistrations({') &&
    productRuntimeCallbackRegistrations.includes("from './useProductRuntimeVisualizerCallbacks'") &&
    productRuntimeCallbackRegistrations.includes('useProductRuntimeVisualizerCallbacks({') &&
    productRuntimeCallbackRegistrations.includes('useProductRuntimeLiveTriggerCallbacks(options)') &&
    !productRuntimeCallbackRegistrations.includes('productEngine') &&
    !productRuntimeCallbackRegistrations.includes('selectedProductRuntime') &&
    !productRuntimeCallbackRegistrations.includes('referenceAudioEngineDebug') &&
    !productRuntimeCallbackRegistrations.includes('useSelectedAudioEngineRuntimeCallbackRegistrations') &&
    !app.includes("from './ui/useSelectedAudioEngineVisualizerCallbacks'") &&
    !app.includes('useSelectedAudioEngineVisualizerCallbacks({') &&
    !app.includes('setVisualizerSequencerState') &&
    productRuntimeVisualizerCallbacks.includes('export type ProductRuntimeVisualizerCallbacksOptions = {') &&
    productRuntimeVisualizerCallbacks.includes('setProductDrumEvolveTriggerCallback:') &&
    productRuntimeVisualizerCallbacks.includes('setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback') &&
    productRuntimeVisualizerCallbacks.includes('setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback') &&
    !productRuntimeVisualizerCallbacks.includes('Parameters<typeof useSelectedAudioEngineVisualizerCallbacks>') &&
    selectedAudioEngineVisualizerCallbacks.includes('setVisualizerSequencerState') &&
    selectedAudioEngineVisualizerCallbacks.includes("if (uiMode !== 'advanced' || activeTab !== 'visualizer') return") &&
    selectedAudioEngineVisualizerCallbacks.includes('setSelectedDrumTriggerCallback((voice: string, velocity: number) =>'),
  'App must delegate visualizer selected-runtime callback registration to the visualizer callback hook',
);
assert(
  app.includes("from './ui/useProductRuntimeCallbackRegistrations'") &&
    app.includes('useProductRuntimeCallbackRegistrations({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCallbackRegistrations'") &&
    !app.includes('useSelectedAudioEngineRuntimeCallbackRegistrations({') &&
    productRuntimeCallbackRegistrations.includes("from './useProductRuntimeLiveTriggerCallbacks'") &&
    productRuntimeCallbackRegistrations.includes('useProductRuntimeVisualizerCallbacks({') &&
    productRuntimeCallbackRegistrations.includes('useProductRuntimeLiveTriggerCallbacks(options)') &&
    !productRuntimeCallbackRegistrations.includes('productEngine') &&
    !productRuntimeCallbackRegistrations.includes('selectedProductRuntime') &&
    !productRuntimeCallbackRegistrations.includes('referenceAudioEngineDebug') &&
    !productRuntimeCallbackRegistrations.includes('useSelectedAudioEngineRuntimeCallbackRegistrations') &&
    !app.includes("from './ui/useSelectedAudioEngineLiveTriggerCallbacks'") &&
    !app.includes('useSelectedAudioEngineLiveTriggerCallbacks({') &&
    app.includes('setProductLeadExpressionCallback,') &&
    app.includes('setProductGranularSHTriggerCallback,') &&
    !app.includes('setSelectedLeadExpressionCallback,') &&
    !app.includes('setSelectedGranularSHTriggerCallback,') &&
    !app.includes('setSelectedLeadExpressionCallback((expression) =>') &&
    !app.includes('setSelectedGranularSHTriggerCallback((positions: Record<string, number>) =>') &&
    productRuntimeLiveTriggerCallbacks.includes('export type ProductRuntimeLiveTriggerCallbacksOptions = {') &&
    productRuntimeLiveTriggerCallbacks.includes('setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void') &&
    productRuntimeLiveTriggerCallbacks.includes('setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void') &&
    productRuntimeLiveTriggerCallbacks.includes('setSelectedLeadExpressionCallback: setProductLeadExpressionCallback') &&
    !productRuntimeLiveTriggerCallbacks.includes('SelectedRuntimeLiveTriggerCallbacksOptions') &&
    !productRuntimeLiveTriggerCallbacks.includes('Parameters<typeof useSelectedAudioEngineLiveTriggerCallbacks>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setSelectedLeadExpressionCallback((expression) =>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setSelectedGranularSHTriggerCallback((positions: Record<string, number>) =>') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('emitVisualizerPulses({') &&
    selectedAudioEngineLiveTriggerCallbacks.includes('setRuntimeFlashKeys(Object.keys(positions))'),
  'App must delegate live source/FX selected-runtime callback registration to the live trigger callback hook',
);
assert(
  app.includes("from './ui/useProductRuntimeCoordination'") &&
    app.includes('useProductRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCoordination'") &&
    !app.includes('useSelectedAudioEngineRuntimeCoordination({') &&
    productRuntimeCoordination.includes('useProductRuntimeEvolveOverrideCallbacks,') &&
    productRuntimeCoordination.includes('useProductRuntimeEvolveOverrideCallbacks(options)') &&
    productRuntimeCoordination.includes('useProductRuntimeRangeSync(options)') &&
    productRuntimeCoordination.includes('useProductRuntimeWalkSync(options)') &&
    productRuntimeCoordination.includes('useProductRuntimeValueCleanup(options.playbackIsRunning)') &&
    !productRuntimeCoordination.includes('productEngine') &&
    !productRuntimeCoordination.includes('selectedProductRuntime') &&
    !productRuntimeCoordination.includes('referenceAudioEngineDebug') &&
    !productRuntimeCoordination.includes('useSelectedAudioEngineRuntimeCoordination') &&
    !app.includes("from './ui/useSelectedAudioEngineEvolveOverrideCallbacks'") &&
    !app.includes('useSelectedAudioEngineEvolveOverrideCallbacks({') &&
    app.includes('drumEvolvedOverrides') &&
    app.includes('synthEvolvedOverrides') &&
    !app.includes('setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    !app.includes('setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    !app.includes('setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>') &&
    !app.includes('drumEvolvedVersionRef') &&
    !app.includes('synthEvolvedVersionRef') &&
    !app.includes('normalizeEvolvedSubLanePatch') &&
    !app.includes('mergeEvolvedSubLanePatch') &&
    productRuntimeEvolveOverrideCallbacks.includes('export type ProductRuntimeEvolvedOverrideState = {') &&
    productRuntimeEvolveOverrideCallbacks.includes('export type ProductRuntimeEvolveOverrideCallbacksOptions = {') &&
    productRuntimeEvolveOverrideCallbacks.includes('setProductDrumEvolveOverridesChangedCallback:') &&
    productRuntimeEvolveOverrideCallbacks.includes('setProductSynthEvolveOverridesChangedCallback:') &&
    productRuntimeEvolveOverrideCallbacks.includes('setProductSynthNoteRangeEvolvedCallback:') &&
    productRuntimeEvolveOverrideCallbacks.includes('setSelectedDrumEvolveOverridesChangedCallback: setProductDrumEvolveOverridesChangedCallback') &&
    !productRuntimeEvolveOverrideCallbacks.includes('SelectedEvolveOverrideCallbacksOptions') &&
    !productRuntimeEvolveOverrideCallbacks.includes('Parameters<typeof useSelectedAudioEngineEvolveOverrideCallbacks>') &&
    !productRuntimeEvolveOverrideCallbacks.includes('ReturnType<typeof useSelectedAudioEngineEvolveOverrideCallbacks>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) =>') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('normalizeEvolvedSubLanePatch(payload.subLaneStates)') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('mergeEvolvedSubLanePatch(') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('emitVisualizerPulse(') &&
    selectedAudioEngineEvolveOverrideCallbacks.includes('mergeRuntimeValues({'),
  'App must delegate evolved sequencer selected-runtime callback registration to useProductRuntimeCoordination',
);
assert(
  app.includes("from './ui/useProductRuntimeCoordination'") &&
    app.includes('useProductRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCoordination'") &&
    !app.includes('useSelectedAudioEngineRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeValueCleanup'") &&
    !app.includes('useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);') &&
    !app.includes('removeRuntimeValues([') &&
    productRuntimeCoordination.includes('useProductRuntimeValueCleanup(options.playbackIsRunning)') &&
    productRuntimeValueCleanup.includes('export function useProductRuntimeValueCleanup(playbackIsRunning: boolean): void') &&
    productRuntimeValueCleanup.includes('useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning)') &&
    !productRuntimeValueCleanup.includes('Parameters<typeof useSelectedAudioEngineRuntimeValueCleanup>') &&
    selectedAudioEngineRuntimeValueCleanup.includes('const STOPPED_RUNTIME_VALUE_KEYS = [') &&
    selectedAudioEngineRuntimeValueCleanup.includes("'synthEuclid4NoteMax'") &&
    selectedAudioEngineRuntimeValueCleanup.includes('const STOPPED_TRIGGER_POSITION_KEYS = [') &&
    selectedAudioEngineRuntimeValueCleanup.includes("'pianoDistance'") &&
    selectedAudioEngineRuntimeValueCleanup.includes('removeRuntimeValues(STOPPED_RUNTIME_VALUE_KEYS)') &&
    selectedAudioEngineRuntimeValueCleanup.includes('removeRuntimeTriggerPositions(STOPPED_TRIGGER_POSITION_KEYS)'),
  'App must delegate stopped-playback runtime value cleanup to useProductRuntimeCoordination',
);
assert(
  app.includes("from './ui/useProductRuntimeCoordination'") &&
    app.includes('useProductRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCoordination'") &&
    !app.includes('useSelectedAudioEngineRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeWalkSync'") &&
    !app.includes('useSelectedAudioEngineRuntimeWalkSync({') &&
    !app.includes('setSelectedRuntimeWalkRanges(walkRanges)') &&
    !app.includes('setSelectedRuntimeWalkPositionsCallback((positions) =>') &&
    productRuntimeCoordination.includes('useProductRuntimeWalkSync(options)') &&
    productRuntimeWalkSync.includes('export type ProductRuntimeWalkSyncOptions = {') &&
    productRuntimeWalkSync.includes('productRuntimeSupportsRangeKey: (key: string) => boolean') &&
    productRuntimeWalkSync.includes('setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void') &&
    productRuntimeWalkSync.includes('setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeWalkRange>>) => void') &&
    productRuntimeWalkSync.includes('selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey') &&
    productRuntimeWalkSync.includes('setSelectedRuntimeWalkPositionsCallback: setProductRuntimeWalkPositionsCallback') &&
    !productRuntimeWalkSync.includes('SelectedRuntimeWalkSyncOptions') &&
    !productRuntimeWalkSync.includes('Parameters<typeof useSelectedAudioEngineRuntimeWalkSync>') &&
    selectedAudioEngineRuntimeWalkSync.includes('setSelectedRuntimeWalkRanges(walkRanges)') &&
    selectedAudioEngineRuntimeWalkSync.includes('setSelectedRuntimeWalkPositionsCallback((positions) =>') &&
    selectedAudioEngineRuntimeWalkSync.includes('replaceRuntimeWalkPositions(positions)') &&
    selectedAudioEngineRuntimeWalkSync.includes("mode !== 'walk'") &&
    selectedAudioEngineRuntimeWalkSync.includes('selectedRuntimeSupportsRangeKey(key)'),
  'App must delegate selected-runtime random-walk range sync and position mirroring to useProductRuntimeCoordination',
);
assert(
  app.includes("from './ui/useProductRuntimeCoordination'") &&
    app.includes('useProductRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeCoordination'") &&
    !app.includes('useSelectedAudioEngineRuntimeCoordination({') &&
    !app.includes("from './ui/useSelectedAudioEngineRangeSync'") &&
    !app.includes('useSelectedAudioEngineRangeSync({') &&
    !app.includes('setSelectedDrumMorphRange(voice, range)') &&
    !app.includes('setSelectedDrumParamSHRange(key, range)') &&
    !app.includes('setSelectedDualRanges(engineRanges)') &&
    productRuntimeCoordination.includes('useProductRuntimeRangeSync(options)') &&
    productRuntimeRangeSync.includes('export type ProductRuntimeRangeSyncOptions = {') &&
    productRuntimeRangeSync.includes('productRuntimeSupportsRangeKey: (key: string) => boolean') &&
    productRuntimeRangeSync.includes('setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void') &&
    productRuntimeRangeSync.includes('setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void') &&
    productRuntimeRangeSync.includes('selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey') &&
    productRuntimeRangeSync.includes('setSelectedDrumMorphRange: setProductDrumMorphRange') &&
    !productRuntimeRangeSync.includes('SelectedRangeSyncOptions') &&
    !productRuntimeRangeSync.includes('Parameters<typeof useSelectedAudioEngineRangeSync>') &&
    selectedAudioEngineRangeSync.includes('setSelectedDrumMorphRange(voice, range)') &&
    selectedAudioEngineRangeSync.includes('setSelectedDrumParamSHRange(key, range)') &&
    selectedAudioEngineRangeSync.includes('setSelectedDualRanges(engineRanges)') &&
    selectedAudioEngineRangeSync.includes('DRUM_MORPH_KEYS.has(key as keyof SliderState)') &&
    selectedAudioEngineRangeSync.includes('selectedRuntimeSupportsRangeKey(key)'),
  'App must delegate selected-runtime sample-hold range sync to useProductRuntimeCoordination',
);
assert(
    app.includes("from './ui/runtimeWalkPositionSync'") &&
    !app.includes('mergeRuntimeWalkPositions') &&
    !app.includes('removeRuntimeWalkPositions') &&
    !app.includes('replaceRuntimeWalkPositions') &&
    !app.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') &&
    !app.includes('replaceRuntimeWalkPositionSnapshot({})') &&
    app.includes('usePresetRestoreRuntimeSurface({') &&
    app.includes('clearRuntimeWalkPositions([keyStr])') &&
    app.includes('seedRuntimeWalkPosition(keyStr)') &&
    app.includes('resetRuntimeWalkPositionsForKeys(') &&
    app.includes('resetRuntimeWalkPositionsForModes,') &&
    morphPositionRuntimeSurface.includes('resetRuntimeWalkPositionsForModes(morphResult.dualModes)') &&
    !app.includes('removeRuntimeWalkPositions(morphWalkKeys)') &&
    !app.includes('mergeRuntimeWalkPositions(newWalkPositions)') &&
    runtimeWalkPositionSync.includes('replaceRuntimeWalkPositionSnapshot(nextPositions:') &&
    runtimeWalkPositionSync.includes('clearRuntimeWalkPositions(keys:') &&
    runtimeWalkPositionSync.includes('seedRuntimeWalkPosition(key: string') &&
    runtimeWalkPositionSync.includes('resetRuntimeWalkPositionsForKeys(Object.keys(modes), nextPositions)') &&
    runtimeWalkPositionSync.includes("if (mode === 'single') continue"),
  'App must delegate granular/morph runtime walk indicator resets to runtimeWalkPositionSync helpers',
);
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineStateRuntime'") &&
    !app.includes('useSelectedAudioEngineStateRuntime({') &&
    !app.includes("from './ui/useSelectedAudioEngineStateReconciliation'") &&
    !app.includes("from './ui/useSelectedAudioEngineStateReconciliationSurface'") &&
    !app.includes("from './ui/useSelectedAudioEngineTransportDebug'") &&
    !app.includes('setSelectedEngineStateChangeCallback((nextState) =>') &&
    !app.includes('const fxOwnersChanged') &&
    productRuntimeLifecycleSurface.includes('useProductRuntimeStateRuntime({') &&
    productRuntimeStateRuntime.includes('type ProductRuntimeStateRuntimeOptions = {') &&
    productRuntimeStateRuntime.includes('productRuntimeMode: ProductRuntimeSelectionMode') &&
    productRuntimeStateRuntime.includes("getProductTransportDebugState: () => ProductEngineState['transportDebug']") &&
    productRuntimeStateRuntime.includes('setEngineState: Dispatch<SetStateAction<ProductEngineState>>') &&
    productRuntimeStateRuntime.includes('useSelectedAudioEngineStateRuntime({') &&
    productRuntimeStateRuntime.includes('audioEngineRuntimeMode: productRuntimeMode') &&
    productRuntimeStateRuntime.includes('getSelectedTransportDebugState: getProductTransportDebugState') &&
    !productRuntimeStateRuntime.includes('SelectedRuntimeStateRuntimeOptions') &&
    !productRuntimeStateRuntime.includes('Parameters<typeof useSelectedAudioEngineStateRuntime>') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineStateReconciliationSurface(audioEngineRuntimeMode)') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineStateReconciliation({') &&
    selectedAudioEngineStateRuntime.includes('useSelectedAudioEngineTransportDebug({') &&
    selectedAudioEngineStateRuntime.includes('setSelectedEngineStateChangeCallback,') &&
    selectedAudioEngineStateReconciliation.includes('setSelectedEngineStateChangeCallback((nextState) =>') &&
    selectedAudioEngineStateReconciliation.includes('const fxOwnersChanged') &&
    selectedAudioEngineStateReconciliation.includes('fxOwners: fxOwnersChanged ? nextState.fxOwners : prev.fxOwners'),
  'App must delegate selected engine-state callback reconciliation to the state runtime hook',
);
assert(
  app.includes("from './ui/useProductRuntimeLifecycleSurface'") &&
    app.includes('useProductRuntimeLifecycleSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineStateRuntime'") &&
    !app.includes('useSelectedAudioEngineStateRuntime({') &&
    !app.includes('useVisibleInterval(updateTransportDebug') &&
    !app.includes('const updateTransportDebug = useCallback(') &&
    productRuntimeLifecycleSurface.includes('getProductTransportDebugState: options.getProductTransportDebugState') &&
    selectedAudioEngineStateRuntime.includes('getSelectedTransportDebugState,') &&
    selectedAudioEngineTransportDebug.includes('getSelectedTransportDebugState()') &&
    selectedAudioEngineTransportDebug.includes('Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05') &&
    selectedAudioEngineTransportDebug.includes('useVisibleInterval(updateTransportDebug, 1000'),
  'App must delegate selected transport debug polling to the state runtime hook',
);
assert(
  app.includes("from './ui/useProductRuntimeSession'") &&
    app.includes('useProductRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeShell'") &&
    !app.includes('useSelectedAudioEngineRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") &&
    !app.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeUi'") &&
    !app.includes('useSelectedAudioEngineRuntimeUi({') &&
    !app.includes("from './ui/useSelectedAudioEngineMediaSession'") &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackControls'") &&
    !app.includes("from './ui/useSelectedAudioEngineLifecycle'") &&
    !app.includes("from './ui/audioEngineMediaSession'") &&
    !app.includes('connectMediaSessionToWebAudio(audioEngineRuntimeMode)') &&
    productRuntimeSession.includes("import { useProductRuntimePlaybackRuntime } from './useProductRuntimePlaybackRuntime'") &&
    productRuntimeSession.includes("import { useProductRuntimeUi } from './useProductRuntimeUi'") &&
    productRuntimeSession.includes('useProductRuntimePlaybackRuntime({') &&
    productRuntimeSession.includes('useProductRuntimeUi({') &&
    productRuntimeSession.includes('preloadProductRuntime: playbackRuntime.preloadProductRuntime') &&
    productRuntimeSession.includes('stopProductRuntime: playbackRuntime.stopProductRuntime') &&
    !productRuntimeSession.includes('useSelectedAudioEngineRuntimeShell') &&
    productRuntimePlaybackRuntime.includes('return useProductRuntimePlaybackAdapter({') &&
    productRuntimePlaybackRuntime.includes('productRuntimeMode,') &&
    productRuntimeUi.includes("import { useProductRuntimeNavigation } from './useProductRuntimeNavigation'") &&
    productRuntimeUi.includes("import { useProductRuntimePerf } from './useProductRuntimePerf'") &&
    productRuntimeUi.includes('useProductRuntimeNavigation({') &&
    productRuntimeUi.includes('useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showProductRuntimeSwitcher)') &&
    !productRuntimeUi.includes('useSelectedAudioEngineRuntimeUi') &&
    selectedAudioEnginePlaybackRuntime.includes("import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter'") &&
    selectedAudioEnginePlaybackRuntime.includes('const playbackAdapter = useProductRuntimePlaybackAdapter({') &&
    selectedAudioEnginePlaybackRuntime.includes('startSelectedPlayback: playbackAdapter.startProductPlayback') &&
    selectedAudioEnginePlaybackRuntime.includes('stopSelectedPlayback: playbackAdapter.stopProductPlayback') &&
    selectedAudioEnginePlaybackRuntime.includes('preloadSelectedAudioEngine: playbackAdapter.preloadProductRuntime') &&
    selectedAudioEnginePlaybackRuntime.includes('stopSelectedAudioEngine: playbackAdapter.stopProductRuntime') &&
    selectedAudioEnginePlaybackRuntime.includes('fadeSelectedAudioEngineOutput: playbackAdapter.fadeProductRuntimeOutput') &&
    productRuntimePlaybackAdapter.includes("import { useProductRuntimeLifecycle } from './useProductRuntimeLifecycle'") &&
    productRuntimePlaybackAdapter.includes("import { useProductRuntimeMediaSession } from './useProductRuntimeMediaSession'") &&
    productRuntimePlaybackAdapter.includes("import { useProductRuntimePlaybackControls } from './useProductRuntimePlaybackControls'") &&
    productRuntimePlaybackAdapter.includes('useProductRuntimeLifecycle(productRuntimeMode)') &&
    productRuntimePlaybackAdapter.includes('useProductRuntimeMediaSession({') &&
    productRuntimePlaybackAdapter.includes('useProductRuntimePlaybackControls({') &&
    productRuntimePlaybackAdapter.includes('startProductPlayback') &&
    productRuntimePlaybackAdapter.includes('stopProductPlayback') &&
    productRuntimePlaybackAdapter.includes('preloadProductRuntime') &&
    selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEnginePlaybackRuntime } from './useSelectedAudioEnginePlaybackRuntime'") &&
    selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi'") &&
    selectedAudioEngineRuntimeShell.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    selectedAudioEngineRuntimeShell.includes('useSelectedAudioEngineRuntimeUi({') &&
    selectedAudioEngineRuntimeShell.includes('preloadSelectedAudioEngine: playbackRuntime.preloadSelectedAudioEngine') &&
    selectedAudioEngineRuntimeShell.includes('stopSelectedAudioEngine: playbackRuntime.stopSelectedAudioEngine') &&
    selectedAudioEngineMediaSession.includes("from './audioEngineMediaSession'") &&
    selectedAudioEngineMediaSession.includes('connectMediaSessionToWebAudio(audioEngineRuntimeMode)'),
  'App must delegate selected lifecycle/media/playback composition to the playback runtime hook',
);
assert(
  app.includes("from './ui/useProductRuntimeSession'") &&
    app.includes('useProductRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeShell'") &&
    !app.includes('useSelectedAudioEngineRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackRuntime'") &&
    !app.includes('useSelectedAudioEnginePlaybackRuntime({') &&
    app.includes("from './ui/useProductRuntimePlaybackSurface'") &&
    app.includes('useProductRuntimePlaybackSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackSurface'") &&
    !app.includes('useSelectedAudioEnginePlaybackSurface({') &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimePlaybackStartState } from './useProductRuntimePlaybackStartState'") &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimeStartAction } from './useProductRuntimeStartAction'") &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimeJourneyPlaybackAction } from './useProductRuntimeJourneyPlaybackAction'") &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimeStopAction } from './useProductRuntimeStopAction'") &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimePlaybackUiProps } from './useProductRuntimePlaybackUiProps'") &&
    productRuntimePlaybackSurface.includes("import { useProductRuntimePresetLoadFade } from './useProductRuntimePresetLoadFade'") &&
    productRuntimePlaybackSurface.includes('useProductRuntimePlaybackStartState(options)') &&
    productRuntimePlaybackSurface.includes('useProductRuntimeStartAction({') &&
    productRuntimePlaybackSurface.includes('preparePlaybackStartState: prepareProductPlaybackStartState') &&
    productRuntimePlaybackSurface.includes('useProductRuntimeJourneyPlaybackAction({') &&
    productRuntimePlaybackSurface.includes('useProductRuntimeStopAction({') &&
    productRuntimePlaybackSurface.includes('useProductRuntimePresetLoadFade({') &&
    productRuntimePlaybackSurface.includes('useProductRuntimePlaybackUiProps({') &&
    !productRuntimePlaybackSurface.includes('useSelectedAudioEnginePlaybackSurface') &&
    !productRuntimePlaybackSurface.includes('productEngine') &&
    !productRuntimePlaybackSurface.includes('selectedProductRuntime') &&
    !productRuntimePlaybackSurface.includes('referenceAudioEngineDebug') &&
    !app.includes("from './ui/useSelectedAudioEngineStartAction'") &&
    !app.includes('useSelectedAudioEngineStartAction({') &&
    !app.includes('prepareSelectedPlaybackStartState') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackStartState'") &&
    !app.includes('useSelectedAudioEnginePlaybackStartState({') &&
    !app.includes('const prepareSelectedPlaybackStartState = useCallback(async') &&
    !app.includes("from './ui/useSelectedAudioEngineJourneyPlaybackAction'") &&
    !app.includes('useSelectedAudioEngineJourneyPlaybackAction({') &&
    app.includes('startJourneyPlayback,') &&
    journeyMorphRuntimeSurface.includes('startJourneyPlayback(startState, startPreset.name)') &&
    !app.includes("from './ui/useSelectedAudioEngineStopAction'") &&
    !app.includes('useSelectedAudioEngineStopAction({') &&
    app.includes('stopJourney: journey.stop') &&
    !app.includes("from './ui/useSelectedAudioEnginePresetLoadFade'") &&
    !app.includes('useSelectedAudioEnginePresetLoadFade({') &&
    app.includes('fadeProductRuntimeOutput,') &&
    !app.includes('const fadeEngineOutput = useCallback(') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackUiProps'") &&
    !app.includes('useSelectedAudioEnginePlaybackUiProps({') &&
    app.includes('{...snowflakePrototypePlaybackProps}') &&
    app.includes('{...journeyPlaybackProps}') &&
    app.includes('{...snowflakePlaybackProps}') &&
    app.includes('!advancedTransportButton.isPlaying') &&
    !app.includes('onTogglePlay={playbackIsRunning || isJourneyPlaying ? handleStop : handleStart}') &&
    !app.includes('onStopAudio={handleStop}') &&
    productRuntimePlaybackStartState.includes('export type ProductRuntimePlaybackStartStateOptions = {') &&
    productRuntimePlaybackStartState.includes('resolveDefaultAutoStartPreset: () => Promise<{') &&
    productRuntimePlaybackStartState.includes('applyDualRangesFromPreset: (') &&
    productRuntimePlaybackStartState.includes('restoreEvolveConfigs: (preset: PlaybackStartPreset) => void') &&
    !productRuntimePlaybackStartState.includes('Parameters<typeof useSelectedAudioEnginePlaybackStartState>') &&
    productRuntimePlaybackStartState.includes('useSelectedAudioEnginePlaybackStartState(options)') &&
    productRuntimeStartAction.includes('export type ProductRuntimeStartActionOptions = {') &&
    productRuntimeStartAction.includes('startProductPlayback: StartProductPlayback') &&
    !productRuntimeStartAction.includes('SelectedStartActionOptions') &&
    productRuntimeStartAction.includes('startSelectedPlayback: startProductPlayback') &&
    productRuntimeJourneyPlaybackAction.includes('export type ProductRuntimeJourneyPlaybackActionOptions = {') &&
    productRuntimeJourneyPlaybackAction.includes('startProductPlayback: StartProductPlayback') &&
    !productRuntimeJourneyPlaybackAction.includes('SelectedJourneyPlaybackActionOptions') &&
    productRuntimeJourneyPlaybackAction.includes('startSelectedPlayback: startProductPlayback') &&
    productRuntimeStopAction.includes('export type ProductRuntimeStopActionOptions = {') &&
    productRuntimeStopAction.includes('stopProductPlayback: () => void') &&
    !productRuntimeStopAction.includes('SelectedStopActionOptions') &&
    productRuntimeStopAction.includes('stopSelectedPlayback: stopProductPlayback') &&
    productRuntimePresetLoadFade.includes('export type ProductRuntimePresetLoadFadeOptions = {') &&
    productRuntimePresetLoadFade.includes('fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>') &&
    !productRuntimePresetLoadFade.includes('SelectedPresetLoadFadeOptions') &&
    productRuntimePresetLoadFade.includes('fadeSelectedAudioEngineOutput: fadeProductRuntimeOutput') &&
    productRuntimePresetLoadFade.includes('stopPlayback: stopProductPlayback') &&
    productRuntimePlaybackUiProps.includes('export type ProductRuntimePlaybackUiPropsOptions = {') &&
    productRuntimePlaybackUiProps.includes('startProductPlayback: ProductRuntimePlaybackAction') &&
    productRuntimePlaybackUiProps.includes('stopProductPlayback: () => void') &&
    productRuntimePlaybackUiProps.includes('journey: ProductRuntimeJourneyPlaybackOptions') &&
    !productRuntimePlaybackUiProps.includes('SelectedPlaybackUiPropsOptions') &&
    productRuntimePlaybackUiProps.includes('startPlayback: startProductPlayback') &&
    productRuntimePlaybackUiProps.includes('stopPlayback: stopProductPlayback') &&
    productRuntimePlaybackSurface.includes('stopJourneyMorphPlaybackRef') &&
    selectedAudioEngineStartAction.includes('preparePlaybackStartState') &&
    selectedAudioEngineStartAction.includes('startSelectedPlayback') &&
    selectedAudioEngineStartAction.includes('startArmedRecordingAfterPlaybackStart') &&
    selectedAudioEngineStartAction.includes('Failed to start audio') &&
    selectedAudioEngineStartAction.includes('Audio failed to start') &&
    selectedAudioEnginePlaybackStartState.includes('resolveDefaultAutoStartPreset') &&
    selectedAudioEnginePlaybackStartState.includes('let stateToStart = requestedState ?? stateRef.current;') &&
    selectedAudioEnginePlaybackStartState.includes('applyPreset(defaultPreset, {') &&
    selectedAudioEnginePlaybackStartState.includes('updateEngine: false') &&
    selectedAudioEnginePlaybackStartState.includes('resetCofDrift: false') &&
    selectedAudioEnginePlaybackStartState.includes('applyDualRangesFromPreset(result.preset.dualRanges, result.preset.sliderModes);') &&
    selectedAudioEnginePlaybackStartState.includes('restoreEvolveConfigs(result.preset);') &&
    selectedAudioEngineJourneyPlaybackAction.includes('startSelectedPlayback') &&
    selectedAudioEngineJourneyPlaybackAction.includes('dualRanges') &&
    selectedAudioEngineJourneyPlaybackAction.includes("console.log('[Journey] Starting audio engine')") &&
    selectedAudioEngineJourneyPlaybackAction.includes("console.error('[Journey] Failed to start audio:', err)") &&
    selectedAudioEngineStopAction.includes('stopSelectedPlayback();') &&
    selectedAudioEngineStopAction.includes('drumEuclidMasterEnabled: false') &&
    selectedAudioEngineStopAction.includes('synthEuclideanMasterEnabled: false') &&
    selectedAudioEngineStopAction.includes('stopJourneyMorphPlayback(true);') &&
    selectedAudioEngineStopAction.includes('resetPlaybackTimer();') &&
    selectedAudioEnginePresetLoadFade.includes('const PRESET_LOAD_FADE_MS = 2000') &&
    selectedAudioEnginePresetLoadFade.includes('fadeSelectedAudioEngineOutput(0, PRESET_LOAD_FADE_MS)') &&
    selectedAudioEnginePresetLoadFade.includes('stopPlayback();') &&
    selectedAudioEnginePresetLoadFade.includes('window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS)') &&
    selectedAudioEnginePresetLoadFade.includes('fadeSelectedAudioEngineOutput(1, PRESET_LOAD_RESTORE_FADE_MS)') &&
    selectedAudioEnginePlaybackUiProps.includes('advancedTransportButton') &&
    selectedAudioEnginePlaybackUiProps.includes('journeyPlaybackProps') &&
    selectedAudioEnginePlaybackUiProps.includes('snowflakePlaybackProps') &&
    selectedAudioEnginePlaybackUiProps.includes('snowflakePrototypePlaybackProps') &&
    selectedAudioEnginePlaybackUiProps.includes('toggleSnowflakePlayback') &&
    selectedAudioEnginePlaybackUiProps.includes('Journey cannot play yet') &&
    !app.includes('startCapacitorAudioSessionPlayback(') &&
    !app.includes('stopCapacitorAudioSessionPlayback();') &&
    !app.includes('await startSelectedAudioEngine(') &&
    !app.includes('setupSelectedIOSMediaSession();') &&
    !app.includes('connectSelectedMediaSessionToAudio();') &&
    !app.includes('stopSelectedIOSMediaSession();') &&
    selectedAudioEnginePlaybackControls.includes('const audioSessionDiagnosticEnabled =') &&
    selectedAudioEnginePlaybackControls.includes('await startSelectedAudioEngine(state);') &&
    selectedAudioEnginePlaybackControls.includes('await startCapacitorAudioSessionPlayback(') &&
    selectedAudioEnginePlaybackControls.includes('void stopCapacitorAudioSessionPlayback();') &&
    selectedAudioEnginePlaybackControls.includes('stopSelectedAudioEngine();'),
  'App must delegate selected playback start/stop orchestration to the playback runtime hook',
);
assert(
  app.includes("from './ui/useProductRuntimePlatformSurface'") &&
    app.includes('useProductRuntimePlatformSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePlatformRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePlatformRuntimeSurface({') &&
    productRuntimePlatformSurface.includes("import { useProductRuntimeCapacitorAudioSession } from './useProductRuntimeCapacitorAudioSession'") &&
    productRuntimePlatformSurface.includes("import { useProductRuntimeMacAudioStatus } from './useProductRuntimeMacAudioStatus'") &&
    productRuntimePlatformSurface.includes("'startProductPlayback' | 'stopProductPlayback'") &&
    productRuntimePlatformSurface.includes('useProductRuntimeMacAudioStatus(options)') &&
    productRuntimePlatformSurface.includes('const nativeProductRendererDiagnosticStatus = useProductRuntimeCapacitorAudioSession(options)') &&
    productRuntimePlatformSurface.includes('nativeProductRendererDiagnosticStatus') &&
    !productRuntimePlatformSurface.includes('useSelectedAudioEnginePlatformRuntimeSurface') &&
    !productRuntimePlatformSurface.includes('productEngine') &&
    !productRuntimePlatformSurface.includes('selectedProductRuntime') &&
    !productRuntimePlatformSurface.includes('referenceAudioEngineDebug') &&
    !app.includes("from './ui/useSelectedAudioEngineCapacitorAudioSession'") &&
    !app.includes('useSelectedAudioEngineCapacitorAudioSession({') &&
    !app.includes("from './ui/useCapacitorAudioSessionDiagnostics'") &&
    !app.includes("from './ui/useSelectedAudioEngineRemoteCommandPlayback'") &&
    !app.includes('handleCapacitorAudioSessionRemoteCommand') &&
    !app.includes('onRemoteCommand: handleCapacitorAudioSessionRemoteCommand') &&
    !app.includes("command === 'play'") &&
    !app.includes("command === 'pause'") &&
    !app.includes('addCapacitorAudioSessionRemoteCommandListener') &&
    !app.includes('getCapacitorAudioSessionStatus') &&
    !app.includes('setCapacitorAudioSessionNowPlaying') &&
    !app.includes('syncCapacitorAudioSessionState') &&
    !app.includes('capacitorAudioSessionRemoteCommandCleanupRef') &&
    capacitorAudioSessionDiagnostics.includes('addCapacitorAudioSessionRemoteCommandListener') &&
    capacitorAudioSessionDiagnostics.includes('remoteCommandHandlerRef.current(command)') &&
    capacitorAudioSessionDiagnostics.includes('setCapacitorAudioSessionNowPlaying({') &&
    capacitorAudioSessionDiagnostics.includes('syncCapacitorAudioSessionState({') &&
    capacitorAudioSessionDiagnostics.includes('NativeProductRendererDiagnosticStatus') &&
    capacitorAudioSessionDiagnostics.includes('return nativeDiagnosticStatus') &&
    productRuntimeCapacitorAudioSession.includes('type ProductRuntimeCapacitorAudioSessionOptions = {') &&
    productRuntimeCapacitorAudioSession.includes('startProductPlayback: () => void | Promise<void>') &&
    productRuntimeCapacitorAudioSession.includes('stopProductPlayback: () => void') &&
    productRuntimeCapacitorAudioSession.includes('startPlayback: startProductPlayback') &&
    productRuntimeCapacitorAudioSession.includes('stopPlayback: stopProductPlayback') &&
    productRuntimeCapacitorAudioSession.includes('TODO(product-runtime-compat-10C)') &&
    !productRuntimeCapacitorAudioSession.includes('Parameters<typeof useSelectedAudioEngineCapacitorAudioSession>') &&
    selectedAudioEngineCapacitorAudioSession.includes('useSelectedAudioEngineRemoteCommandPlayback({') &&
    selectedAudioEngineCapacitorAudioSession.includes('useCapacitorAudioSessionDiagnostics({') &&
    selectedAudioEngineCapacitorAudioSession.includes('isPlaying: playbackIsRunning || isJourneyPlaying') &&
    selectedAudioEngineCapacitorAudioSession.includes('onRemoteCommand: handleCapacitorAudioSessionRemoteCommand') &&
    productRuntimePlatformSurface.includes('const nativeProductRendererDiagnosticStatus = useProductRuntimeCapacitorAudioSession(options)') &&
    selectedAudioEngineRemoteCommandPlayback.includes("command === 'play'") &&
    selectedAudioEngineRemoteCommandPlayback.includes("command === 'pause'") &&
    selectedAudioEngineRemoteCommandPlayback.includes('if (!playbackIsRunning) void startPlayback();') &&
    selectedAudioEngineRemoteCommandPlayback.includes('if (playbackIsRunning) stopPlayback();'),
  'App must delegate Capacitor audio-session diagnostics/listener/state sync and remote-command playback routing to selected runtime hooks',
);
assert(
  app.includes("from './ui/useProductRuntimePlatformSurface'") &&
    app.includes('useProductRuntimePlatformSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePlatformRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePlatformRuntimeSurface({') &&
    !app.includes("from './ui/useCapacitorMacAudioStatus'") &&
    !app.includes('useCapacitorMacAudioStatus({') &&
    app.includes('openMacSoundSettings') &&
    app.includes('macAirPlayPerformanceActive') &&
    !app.includes('getCapacitorMacAudioOutputStatus') &&
    !app.includes('openCapacitorMacSoundSettings') &&
    !app.includes('setCapacitorMacPlaybackState') &&
    !app.includes('readMacAirPlayPerformancePinned') &&
    !app.includes('writeMacAirPlayPerformancePinned') &&
    capacitorMacAudioStatus.includes('getCapacitorMacAudioOutputStatus') &&
    capacitorMacAudioStatus.includes('openCapacitorMacSoundSettings') &&
    capacitorMacAudioStatus.includes('setCapacitorMacPlaybackState') &&
    capacitorMacAudioStatus.includes('useVisibleInterval(refreshMacAudioOutputStatus, playbackIsRunning ? 1500 : 5000') &&
    productRuntimeMacAudioStatus.includes('return useCapacitorMacAudioStatus({') &&
    productRuntimeMacAudioStatus.includes('preloadSelectedAudioEngine: preloadProductRuntime') &&
    productRuntimePlatformSurface.includes('useProductRuntimeMacAudioStatus(options)') &&
    productRuntimePlatformSurface.includes('...macAudioStatus'),
  'App must delegate macOS native output polling/playback sync to the selected platform runtime surface',
);
assert(
  app.includes("from './ui/usePlatformRuntimeCapabilities'") &&
    app.includes('usePlatformRuntimeCapabilities({') &&
    app.includes('shouldInitializeCloudPresetStore') &&
    !app.includes("from './native/capacitorAudioSession'") &&
    !app.includes("from './native/capacitorMacShell'") &&
    !app.includes('isCapacitorNativeShell()') &&
    !app.includes('isCapacitorMacShell()') &&
    !app.includes('const usesSupabaseStatePresetLibrary =') &&
    !app.includes('const usesCapacitorLocalPresetLibrary =') &&
    !app.includes('const usesCloudBackedStatePresetLibrary =') &&
    platformRuntimeCapabilities.includes('const nativeShellAvailable = isCapacitorNativeShell();') &&
    platformRuntimeCapabilities.includes('const macShellAvailable = isCapacitorMacShell();') &&
    platformRuntimeCapabilities.includes('const usesCloudBackedStatePresetLibrary = cloudPresetAllowed && !usesCapacitorLocalPresetLibrary;') &&
    platformRuntimeCapabilities.includes('const shouldInitializeCloudPresetStore = cloudPresetAllowed && (!nativeShellAvailable || macShellAvailable);'),
  'App must delegate native/mac shell classification and preset-library routing to the platform capabilities hook',
);
assert(
  app.includes("from './ui/usePresetBootstrapRuntimeSurface'") &&
    app.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') &&
    !app.includes("from './ui/useCloudPresetStoreBootstrap'") &&
    !app.includes('useCloudPresetStoreBootstrap<SavedPreset>({') &&
    app.includes('cloudPresetStoreReadyPromiseRef') &&
    app.includes('resolveDefaultAutoStartPreset') &&
    !app.includes('loadCloudAutoStartPresetRef') &&
    !app.includes('loadCloudAutoStartPresetFromBootstrap') &&
    !app.includes('const cloudPresetStoreRef = useRef(') &&
    !app.includes('const cloudAutoStartStoreInitPromiseRef = useRef(') &&
    !app.includes('const cloudPresetStoreReadyRef = useRef(') &&
    !app.includes('const markCloudPresetStoreReady =') &&
    !app.includes('const ensureCloudAutoStartPresetStore = useCallback(') &&
    !app.includes('new SupabasePresetStore(supabaseClient)') &&
    !app.includes('new HybridPresetStore(local, cloud)') &&
    cloudPresetStoreBootstrap.includes("const { getSupabase } = await import('../cloud/supabase')") &&
    cloudPresetStoreBootstrap.includes('new SupabasePresetStore(supabaseClient)') &&
    cloudPresetStoreBootstrap.includes('new HybridPresetStore(local, cloud)') &&
    cloudPresetStoreBootstrap.includes('setPresetStore(hybrid)') &&
    cloudPresetStoreBootstrap.includes('cloudAutoStartStoreInitPromiseRef.current = (async () =>') &&
    presetBootstrapRuntimeSurface.includes('useCloudPresetStoreBootstrap<TSavedPreset>({') &&
    presetBootstrapRuntimeSurface.includes('loadCloudAutoStartPresetRef.current = loadCloudAutoStartPreset'),
  'App must delegate cloud preset store bootstrap/readiness to usePresetBootstrapRuntimeSurface',
);
assert(
  app.includes("from './ui/usePresetLibraryRuntimeSurface'") &&
    app.includes('usePresetLibraryRuntimeSurface<SavedPreset>({') &&
    !app.includes("from './ui/usePresetLibraryLoader'") &&
    !app.includes('usePresetLibraryLoader<SavedPreset>({') &&
    app.includes('loadCloudBackedPresets: loadActiveStatePresetStorePresets') &&
    app.includes('onCloudSharedPresetLoaded: applyCloudSharedPreset') &&
    !app.includes('const loadPresets = async () =>') &&
    !app.includes('fetchPresetById(cloudPresetId)') &&
    !app.includes("urlParams.get('cloud')") &&
    presetLibraryLoader.includes('cloudPresetStoreReadyPromiseRef.current') &&
    presetLibraryLoader.includes('return loadCloudBackedPresets();') &&
    presetLibraryLoader.includes('return loadCapacitorLocalPresets();') &&
    presetLibraryLoader.includes('return loadBundledPresets();') &&
    presetLibraryLoader.includes("const cloudPresetId = urlParams.get('cloud');") &&
    presetLibraryLoader.includes("void import('../cloud/supabase')") &&
    presetLibraryLoader.includes('fetchPresetById(cloudPresetId)') &&
    presetLibraryLoader.includes('onCloudSharedPresetLoaded(') &&
    presetLibraryRuntimeSurface.includes('usePresetLibraryLoader<TSavedPreset>({') &&
    presetLibraryRuntimeSurface.includes('onPresetsLoaded: setSavedPresets') &&
    presetLibraryRuntimeSurface.includes('onPresetsLoadFailed: () => setSavedPresets([])'),
  'App must delegate preset library source selection and cloud share fetches to usePresetLibraryRuntimeSurface',
);
assert(
  app.includes("from './ui/usePresetLibraryRuntimeSurface'") &&
    app.includes('usePresetLibraryRuntimeSurface<SavedPreset>({') &&
    !app.includes("from './ui/useSavedPresetResolver'") &&
    !app.includes('useSavedPresetResolver<SavedPreset>({') &&
    app.includes('loadPresetByName: loadActiveStatePresetStorePresetByName') &&
    app.includes('sortPresets: sortSavedStatePresetsByFreshness') &&
    !app.includes('const resolveSavedPresetForLoad = useCallback(') &&
    !app.includes('const resolveSavedPresetByName = useCallback(') &&
    !app.includes('loadActiveStatePresetStorePresetByName(preset.name)') &&
    !app.includes('loadActiveStatePresetStorePresetByName(presetName)') &&
    savedPresetResolver.includes('if (!preset.deferred) return preset;') &&
    savedPresetResolver.includes('const loadedPreset = await loadPresetByName(preset.name);') &&
    savedPresetResolver.includes('setSavedPresets(prev => sortPresets(prev.map(item => (') &&
    savedPresetResolver.includes('const preset = savedPresets.find(item => item.name === presetName);') &&
    savedPresetResolver.includes('if (!usesCloudBackedStatePresetLibrary) return null;') &&
    savedPresetResolver.includes('const loadedPreset = await loadPresetByName(presetName);') &&
    presetLibraryRuntimeSurface.includes('return useSavedPresetResolver<TSavedPreset>({') &&
    presetLibraryRuntimeSurface.includes('loadPresetByName') &&
    presetLibraryRuntimeSurface.includes('sortPresets'),
  'App must delegate deferred/cloud saved-preset resolution to usePresetLibraryRuntimeSurface',
);
assert(
  app.includes("from './ui/usePresetBootstrapRuntimeSurface'") &&
    app.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') &&
    !app.includes("from './ui/useAutoStartPresetResolver'") &&
    !app.includes('useAutoStartPresetResolver<SavedPreset>({') &&
    !app.includes('setCloudAutoStartPreset') &&
    app.includes('resolveDefaultAutoStartPreset') &&
    app.includes('loadBundledPresetByName') &&
    !app.includes('const autoStartPresetRef = useRef(') &&
    !app.includes('const autoStartPresetSourceRef = useRef(') &&
    !app.includes('const resolveDefaultAutoStartPreset = useCallback(') &&
    !app.includes('const timedCloudPreset = await Promise.race') &&
    !app.includes('const deviceLocalPreset = savedPresets.find((preset) => preset.name === DEFAULT_AUTO_START_PRESET_NAME)') &&
    !app.includes('const bundledPreset = await loadBundledPresetByName(DEFAULT_AUTO_START_PRESET_NAME)') &&
    autoStartPresetResolver.includes('const autoStartPresetRef = useRef') &&
    autoStartPresetResolver.includes('const autoStartPresetSourceRef = useRef') &&
    autoStartPresetResolver.includes('const timedCloudPreset = await Promise.race') &&
    autoStartPresetResolver.includes('window.setTimeout(() => resolve(null), timeoutMs);') &&
    autoStartPresetResolver.includes('const deviceLocalPreset = savedPresets.find((preset) => preset.name === defaultAutoStartPresetName)') &&
    autoStartPresetResolver.includes('const bundledPreset = await loadBundledPresetByName(defaultAutoStartPresetName);') &&
    autoStartPresetResolver.includes('void loadCloudAutoStartPreset();') &&
    presetBootstrapRuntimeSurface.includes('useAutoStartPresetResolver<TSavedPreset>({') &&
    presetBootstrapRuntimeSurface.includes('loadCloudAutoStartPreset: loadCloudAutoStartPresetFromBootstrap') &&
    presetBootstrapRuntimeSurface.includes('resolveDefaultAutoStartPreset'),
  'App must delegate default auto-start preset resolution to usePresetBootstrapRuntimeSurface',
);
assert(
  app.includes("from './ui/usePresetBootstrapRuntimeSurface'") &&
    app.includes('usePresetBootstrapRuntimeSurface<SavedPreset>({') &&
    !app.includes("from './ui/usePresetPlatformMaintenance'") &&
    !app.includes('usePresetPlatformMaintenance({') &&
    app.includes('cloudPresetStoreReadyPromiseRef') &&
    !app.includes('kesshoPresetV2Migration') &&
    !app.includes('runPresetV2Migration') &&
    !app.includes('optimizeStringWavesV2') &&
    !app.includes('repairPresetChildGraphsV2') &&
    !app.includes('repairStringWavesGraphV2') &&
    !app.includes('verifyPresetV2Migration') &&
    !app.includes('loadFactoryPresets') &&
    presetPlatformMaintenance.includes('target.kesshoPresetV2Migration = {') &&
    presetPlatformMaintenance.includes("const { runPresetV2Migration } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { optimizeStringWavesV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { repairPresetChildGraphsV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { repairStringWavesGraphV2 } = await import('../presets')") &&
    presetPlatformMaintenance.includes("const { verifyPresetV2Migration } = await import('../presets')") &&
    presetPlatformMaintenance.includes('await cloudPresetStoreReadyPromiseRef.current;') &&
    presetPlatformMaintenance.includes("const { loadFactoryPresets } = await import('../presets')") &&
    presetBootstrapRuntimeSurface.includes('usePresetPlatformMaintenance({') &&
    presetBootstrapRuntimeSurface.includes('cloudPresetStoreReadyPromiseRef'),
  'App must delegate preset migration dev tools and factory seeding to usePresetBootstrapRuntimeSurface',
);
assert(
  app.includes("from './ui/usePresetRestoreRuntimeSurface'") &&
    app.includes('usePresetRestoreRuntimeSurface({') &&
    !app.includes("import { usePresetSequencerRestore") &&
    !app.includes('usePresetSequencerRestore({') &&
    !app.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') &&
    !app.includes('replaceRuntimeWalkPositionSnapshot({})') &&
    !app.includes('setSelectedSequencerPresetHomeSnapshots();') &&
    !app.includes('function drumStepOverridesForEngineRestore(') &&
    !app.includes('function synthStepOverridesForEngineRestore(') &&
    app.includes('setProductDrumEuclidClockDivs,') &&
    app.includes('setProductSequencerPresetHomeSnapshots,') &&
    !app.includes('setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs') &&
    presetRestoreRuntimeSurface.includes('type ProductPresetSequencerRestoreOptions = Omit<PresetSequencerRestoreOptions, SelectedPresetSequencerSetterKey>') &&
    presetRestoreRuntimeSurface.includes('const restoreEvolveConfigs = usePresetSequencerRestore({') &&
    presetRestoreRuntimeSurface.includes('setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs') &&
    presetRestoreRuntimeSurface.includes('setSelectedSequencerPresetHomeSnapshots: setProductSequencerPresetHomeSnapshots') &&
    presetRestoreRuntimeSurface.includes('const applyDualRangesFromPreset = useCallback(') &&
    presetRestoreRuntimeSurface.includes('replaceRuntimeWalkPositionSnapshot(newWalkPositions)') &&
    presetRestoreRuntimeSurface.includes('replaceRuntimeWalkPositionSnapshot({})') &&
    presetSequencerRestore.includes('setSelectedSequencerPresetHomeSnapshots(') &&
    presetSequencerRestore.includes('drumSubLaneStates?.map((state) => state.pitch)') &&
    presetSequencerRestore.includes('synthSubLaneStates?.map((state) => state.pitch)') &&
    presetSequencerRestore.includes('drumStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('synthStepOverridesForEngineRestore(') &&
    presetSequencerRestore.includes('normalizeSequencerEvolveConfigs(') &&
    presetSequencerRestore.includes('restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides)'),
  'App must delegate preset dual-range and sequencer selected-runtime restore sync to usePresetRestoreRuntimeSurface',
);
assert(
  app.includes("from './ui/useProductRuntimePageSurface'") &&
    app.includes('useProductRuntimePageSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePageRuntimeSurface({') &&
    productRuntimePageSurface.includes('useProductRuntimePageBridgeOptions,') &&
    productRuntimePageSurface.includes('return useProductRuntimePageRuntimeBridges(pageRuntimeBridgeOptions)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageTelemetryProps(telemetry)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageSequencerProps(sequencer)') &&
    productRuntimePageBridgeOptions.includes('useProductRuntimePageControlProps(control)') &&
    productRuntimePageBridgeOptions.includes('telemetry: ProductRuntimePageTelemetryProps') &&
    !productRuntimePageBridgeOptions.includes('useSelectedAudioEnginePageRuntimeBridgeOptions') &&
    productRuntimePageTelemetryProps.includes('export type ProductRuntimePageTelemetryProps = {') &&
    productRuntimePageTelemetryProps.includes('productRuntimeDebugAnalysers: ProductRuntimePageDebugAnalysers') &&
    !productRuntimePageTelemetryProps.includes('ProductRuntimePageTelemetryProps = SelectedAudioEnginePageTelemetryRuntimeProps') &&
    productRuntimePageTelemetryProps.includes('return useMemo(() => ({') &&
    productRuntimePageTelemetryProps.includes('getProductDynamicsVisualTelemetry,') &&
    productRuntimePageTelemetryProps.includes('getProductGranularBufferWaveform,') &&
    productRuntimePageTelemetryProps.includes('setProductGranularUiActive,') &&
    productRuntimePageSequencerProps.includes('export type ProductRuntimePageSequencerProps = {') &&
    productRuntimePageSequencerProps.includes('captureProductSynthEuclidLaneHome: (laneIdx: number, pitchState?: ProductRuntimePitchHomeState | null) => void') &&
    productRuntimePageSequencerProps.includes('drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>') &&
    productRuntimePageSequencerProps.includes('setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void') &&
    productRuntimePageSequencerProps.includes('return useMemo(() => ({') &&
    productRuntimePageSequencerProps.includes('captureProductSynthEuclidLaneHome,') &&
    productRuntimePageSequencerProps.includes('setProductDrumStepOverrides,') &&
    !productRuntimePageSequencerProps.includes('ProductRuntimePageSequencerProps = SelectedAudioEnginePageSequencerRuntimeProps') &&
    app.includes('captureProductSynthEuclidLaneHome,') &&
    app.includes('setProductSynthPitchBindingModes,') &&
    !app.includes('captureProductSynthEuclidLaneHome: captureSelectedSynthEuclidLaneHome') &&
    !app.includes('setProductSynthPitchBindingModes: setSelectedSynthPitchBindingModes') &&
    productRuntimePageControlProps.includes('export type ProductRuntimePageControlProps = {') &&
    productRuntimePageControlProps.includes('preloadProductRuntime: () => Promise<unknown>') &&
    productRuntimePageControlProps.includes('productRuntimeManualTriggers: ProductRuntimeManualTriggers') &&
    productRuntimePageControlProps.includes('setProductDrumStepPositionCallback') &&
    productRuntimePageControlProps.includes('return useMemo(() => ({') &&
    productRuntimePageControlProps.includes('setProductDrumStepPositionCallback,') &&
    app.includes('setProductDrumStepPositionCallback,') &&
    app.includes('setProductSynthEvolveTriggerCallback,') &&
    !app.includes('setSelectedDrumStepPositionCallback,') &&
    !app.includes('setSelectedSynthEvolveTriggerCallback,') &&
    !productRuntimePageControlProps.includes('ProductRuntimePageControlProps = Omit<') &&
    productRuntimePageControlProps.includes('preloadProductRuntime,') &&
    productRuntimePageRuntimeBridges.includes('const selectedOptions = {') &&
    !productRuntimePageRuntimeBridges.includes('SelectedAudioEnginePageRuntimeBridgeOptions') &&
    productRuntimePageRuntimeBridges.includes('getSelectedDynamicsVisualTelemetry: getProductDynamicsVisualTelemetry') &&
    productRuntimePageRuntimeBridges.includes('setSelectedGranularUiActive: setProductGranularUiActive') &&
    productRuntimePageRuntimeBridges.includes('captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome') &&
    productRuntimePageRuntimeBridges.includes('setSelectedDrumStepOverrides: setProductDrumStepOverrides') &&
    productRuntimePageRuntimeBridges.includes('preloadSelectedAudioEngine: preloadProductRuntime') &&
    productRuntimePageRuntimeBridges.includes('setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback') &&
    productRuntimePageRuntimeBridges.includes('useSelectedAudioEnginePageRuntimeBridges(selectedOptions)') &&
    !productRuntimePageSurface.includes('productEngine') &&
    !productRuntimePageSurface.includes('selectedProductRuntime') &&
    !productRuntimePageSurface.includes('referenceAudioEngineDebug') &&
    !productRuntimePageSurface.includes("from './useSelectedAudioEnginePageRuntimeSurface'") &&
    app.includes('telemetry: {') &&
    app.includes('sequencer: {') &&
    app.includes('control: {') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageTelemetryRuntimeProps'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") &&
    !app.includes('...pageTelemetryRuntimeProps') &&
    !app.includes('...pageSequencerRuntimeProps') &&
    !app.includes('...pageControlRuntimeProps') &&
    app.includes('onSubLaneStatesChange={productPageRuntimeSurface.synthPageSequencerBridge.onSubLaneStatesChange}') &&
    app.includes('captureEvolveHome={productPageRuntimeSurface.synthPageSequencerBridge.captureEvolveHome}') &&
    app.includes('{...productPageRuntimeSurface.synthPageRuntimeProps}') &&
    app.includes('productRuntimeManualTriggers,') &&
    app.includes('productRuntimeDebugAnalysers,') &&
    !app.includes('onAuditionNote={productRuntimeManualTriggers.auditionSynthNote}') &&
    !app.includes("from './ui/useSynthPageSequencerBridge'") &&
    !app.includes('useSynthPageSequencerBridge({') &&
    !app.includes('setSelectedSynthStepOverrides({') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedSynthEuclidLaneHome(') &&
    selectedPageRuntimeBridges.includes('useSynthPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageSequencerBridge(options)') &&
    selectedPageRuntimeBridges.includes('useDrumPageRuntimeBridge(options)') &&
    selectedPageRuntimeBridges.includes('export type SelectedAudioEnginePageRuntimeBridgeOptions') &&
    selectedPageTelemetryRuntimeProps.includes('SelectedAudioEnginePageRuntimeBridgeOptions') &&
    selectedPageTelemetryRuntimeProps.includes('getSelectedGranularBufferWaveform') &&
    selectedPageTelemetryRuntimeProps.includes('setSelectedGranularUiActive') &&
    selectedPageSequencerRuntimeProps.includes('SelectedAudioEnginePageRuntimeBridgeOptions') &&
    selectedPageSequencerRuntimeProps.includes('captureSelectedSynthEuclidLaneHome') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedDrumPitchSettings') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedSynthPitchSettings') &&
    selectedPageSequencerRuntimeProps.includes('synthStepOverridesRef') &&
    selectedPageControlRuntimeProps.includes('SelectedAudioEnginePageRuntimeBridgeOptions') &&
    selectedPageControlRuntimeProps.includes('onRequestPlaybackStart') &&
    selectedPageControlRuntimeProps.includes('productRuntimeManualTriggers') &&
    selectedPageControlRuntimeProps.includes('setSelectedSynthStepPositionCallback') &&
    selectedPageRuntimeBridgeOptions.includes('SelectedAudioEnginePageRuntimeBridgeOptionGroups') &&
    selectedPageRuntimeBridgeOptions.includes('telemetry: SelectedAudioEnginePageTelemetryRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('sequencer: SelectedAudioEnginePageSequencerRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('control: SelectedAudioEnginePageControlRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageTelemetryRuntimeProps(telemetry)') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageSequencerRuntimeProps(sequencer)') &&
    selectedPageRuntimeBridgeOptions.includes('useSelectedAudioEnginePageControlRuntimeProps(control)') &&
    selectedPageRuntimeBridgeOptions.includes('...pageTelemetryRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('...pageSequencerRuntimeProps') &&
    selectedPageRuntimeBridgeOptions.includes('...pageControlRuntimeProps') &&
    selectedPageRuntimeSurface.includes('useSelectedAudioEnginePageRuntimeBridgeOptions(options)') &&
    selectedPageRuntimeSurface.includes('useSelectedAudioEnginePageRuntimeBridges(selectedPageRuntimeBridgeOptions)') &&
    selectedPageRuntimeBridges.includes('const synthPageRuntimeProps = useMemo(() => ({') &&
    selectedPageRuntimeBridges.includes('getLeadMorphedParams: options.getSelectedLeadMorphedParams') &&
    selectedPageRuntimeBridges.includes('liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable') &&
    selectedPageRuntimeBridges.includes('liveSourceTelemetryAvailable: true') &&
    selectedPageRuntimeBridges.includes('onRequestPlaybackStart: options.onRequestPlaybackStart') &&
    selectedPageRuntimeBridges.includes('onAuditionNote: options.productRuntimeManualTriggers.auditionSynthNote') &&
    selectedPageRuntimeBridges.includes('getPadFilterFreq: options.getSelectedPadFilterFreq') &&
    selectedPageRuntimeBridges.includes('getPadLfoValue: options.getSelectedPadLfoValue') &&
    selectedPageRuntimeBridges.includes('setStepPositionCallback: options.setSelectedSynthStepPositionCallback') &&
    selectedPageRuntimeBridges.includes('setEvolveTriggerCallback: options.setSelectedSynthEvolveTriggerCallback') &&
    !app.includes('getLeadMorphedParams={getSelectedLeadMorphedParams}') &&
    !app.includes('onRequestPlaybackStart={requestSequencerPlaybackStart}') &&
    !app.includes('setStepPositionCallback={setSelectedSynthStepPositionCallback}') &&
    synthPageSequencerBridge.includes('setSelectedSynthStepOverrides(synthEngineStepOverrides(overrides))') &&
    synthPageSequencerBridge.includes('setSelectedSynthEuclidEvolveConfigs(configs)') &&
    synthPageSequencerBridge.includes('captureSelectedSynthEuclidLaneHome(laneIdx, pitchState ?? synthSubLaneStatesRef.current?.[laneIdx]?.pitch)'),
  'App must delegate Synth page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
);
assert(
    app.includes("from './ui/useProductRuntimePageSurface'") &&
    app.includes('useProductRuntimePageSurface({') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeSurface'") &&
    !app.includes('useSelectedAudioEnginePageRuntimeSurface({') &&
    app.includes('sequencer: {') &&
    app.includes('control: {') &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridges'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageRuntimeBridgeOptions'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageSequencerRuntimeProps'") &&
    !app.includes("from './ui/useSelectedAudioEnginePageControlRuntimeProps'") &&
    !app.includes('...pageSequencerRuntimeProps') &&
    !app.includes('...pageControlRuntimeProps') &&
    app.includes('onSubLaneStatesChange={productPageRuntimeSurface.drumPageSequencerBridge.onSubLaneStatesChange}') &&
    app.includes('captureEvolveHome={productPageRuntimeSurface.drumPageSequencerBridge.captureEvolveHome}') &&
    app.includes('{...productPageRuntimeSurface.drumPageRuntimeProps}') &&
    app.includes('{...productPageRuntimeSurface.dynamicsPageRuntimeProps}') &&
    !app.includes('triggerVoice={productRuntimeManualTriggers.triggerDrumVoice}') &&
    !app.includes('getAnalyserNode={productRuntimeDebugAnalysers.drumVoiceAnalyser}') &&
    !app.includes('getDynamicsAnalyser={productRuntimeDebugAnalysers.dynamicsAnalyser}') &&
    !app.includes("from './ui/useDrumPageSequencerBridge'") &&
    !app.includes('useDrumPageSequencerBridge({') &&
    !app.includes("from './ui/useDrumPageRuntimeBridge'") &&
    !app.includes('useDrumPageRuntimeBridge({') &&
    !app.includes('setSelectedDrumStepOverrides(overrides);') &&
    !app.includes('captureEvolveHome={(laneIdx) => captureSelectedDrumEuclidLaneHome(') &&
    selectedPageRuntimeBridges.includes('const drumPageRuntimeProps = useMemo(() => ({') &&
    selectedPageRuntimeBridges.includes('triggerVoice: options.productRuntimeManualTriggers.triggerDrumVoice') &&
    selectedPageRuntimeBridges.includes('getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser') &&
    selectedPageRuntimeBridges.includes('preloadAudioEngine: drumPageRuntimeBridge.preloadAudioEngine') &&
    selectedPageRuntimeBridges.includes('onRequestPlaybackStart: options.onRequestPlaybackStart') &&
    selectedPageRuntimeBridges.includes('setStepPositionCallback: options.setSelectedDrumStepPositionCallback') &&
    selectedPageRuntimeBridges.includes('setEvolveTriggerCallback: options.setSelectedDrumEvolveTriggerCallback') &&
    selectedPageRuntimeBridges.includes('setTriggerCallback: options.setSelectedDrumTriggerCallback') &&
    selectedPageSequencerRuntimeProps.includes('captureSelectedDrumEuclidLaneHome') &&
    selectedPageSequencerRuntimeProps.includes('setSelectedDrumStepOverrides') &&
    selectedPageSequencerRuntimeProps.includes('drumPitchSettingsRef') &&
    selectedPageControlRuntimeProps.includes('preloadSelectedAudioEngine') && productRuntimePageRuntimeBridges.includes('preloadSelectedAudioEngine: preloadProductRuntime') &&
    selectedPageControlRuntimeProps.includes('setSelectedDrumTriggerCallback') &&
    selectedPageControlRuntimeProps.includes('setSelectedDrumStepPositionCallback') &&
    !app.includes('setStepPositionCallback={setSelectedDrumStepPositionCallback}') &&
    !app.includes('onRequestPlaybackStart={requestSequencerPlaybackStart}') &&
    !app.includes('setTriggerCallback={setSelectedDrumTriggerCallback}') &&
    selectedPageRuntimeBridges.includes('const dynamicsPageRuntimeProps = useMemo(() => ({') &&
    selectedPageRuntimeBridges.includes('getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser') &&
    drumPageSequencerBridge.includes('setSelectedDrumStepOverrides(overrides)') &&
    drumPageSequencerBridge.includes('setSelectedDrumEuclidEvolveConfigs(configs)') &&
    drumPageSequencerBridge.includes('captureSelectedDrumEuclidLaneHome('),
  'App must delegate Drum page selected-runtime sequencer bridge wiring through useSelectedAudioEnginePageRuntimeBridges',
);
assert(
  app.includes("from './ui/useProductRuntimeGlobalSurface'") &&
    app.includes('useProductRuntimeGlobalSurface({') &&
    !app.includes("from './ui/useSelectedAudioEngineGlobalRuntimeSurface'") &&
    !app.includes('useSelectedAudioEngineGlobalRuntimeSurface({') &&
    productRuntimeGlobalSurface.includes("import { useSelectedAudioEngineGlobalRuntimeSurface } from './useSelectedAudioEngineGlobalRuntimeSurface'") &&
    productRuntimeGlobalSurface.includes("import type { GlobalPageProps } from './global/GlobalPage'") &&
    productRuntimeGlobalSurface.includes('type ProductRuntimeGlobalProps = Pick<') &&
    productRuntimeGlobalSurface.includes('type ProductRuntimeGlobalRecordingProps = Pick<') &&
    productRuntimeGlobalSurface.includes('stopProductPlayback: () => void') &&
    productRuntimeGlobalSurface.includes('recordingProps: ProductRuntimeGlobalRecordingProps') &&
    productRuntimeGlobalSurface.includes('stopSelectedPlayback: stopProductPlayback') &&
    !productRuntimeGlobalSurface.includes('SelectedAudioEngineGlobalRuntimeSurfaceOptions') &&
    !productRuntimeGlobalSurface.includes('Parameters<typeof useSelectedAudioEngineGlobalRuntimeSurface>') &&
    !productRuntimeGlobalSurface.includes('productEngine') &&
    !productRuntimeGlobalSurface.includes('selectedProductRuntime') &&
    !productRuntimeGlobalSurface.includes('referenceAudioEngineDebug') &&
    !app.includes("from './ui/useSelectedAudioEnginePlaybackTimer'") &&
    !app.includes('useSelectedAudioEnginePlaybackTimer({') &&
    !app.includes("from './ui/useSelectedAudioEngineGlobalRuntimeProps'") &&
    !app.includes('useSelectedAudioEngineGlobalRuntimeProps({') &&
    app.includes('resetPlaybackTimer,') &&
    app.includes('useProductRuntimePlaybackSurface({') &&
    !app.includes('playbackTimerTargetTimeRef') &&
    !app.includes('const updatePlaybackTimerCountdown = useCallback(') &&
    !app.includes('useVisibleInterval(updatePlaybackTimerCountdown') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('useSelectedAudioEnginePlaybackTimer({') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('useSelectedAudioEngineGlobalRuntimeProps({') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('playbackTimerProps: {') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('onTimerEnabledChange: setPlaybackTimerEnabled') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('globalRuntimeProps') &&
    selectedAudioEngineGlobalRuntimeSurface.includes('resetPlaybackTimer') &&
    selectedAudioEnginePlaybackTimer.includes('const playbackTimerTargetTimeRef = useRef<number | null>(null)') &&
    selectedAudioEnginePlaybackTimer.includes('const updatePlaybackTimerCountdown = useCallback(() =>') &&
    selectedAudioEnginePlaybackTimer.includes('stopSelectedPlayback();') &&
    selectedAudioEnginePlaybackTimer.includes('useVisibleInterval(updatePlaybackTimerCountdown, 1000'),
  'App must delegate playback timer countdown and expiry stop handling to the playback timer hook',
);
assert(
  productAudioRuntimeSelection.includes("const PRODUCT_RUNTIME_MODES = ['core-product']"),
  'ProductAudioRuntimeSelection must expose only core-product for the normal product UI mode list',
);
assert(
  productAudioRuntimeSelection.includes('return isReferenceRuntimeEnabled(params) ? REFERENCE_RUNTIME_MODES : PRODUCT_RUNTIME_MODES;'),
  'ProductAudioRuntimeSelection must expose web-ts/core-smoke only for explicit dev/reference contexts',
);
assert(
  productAudioRuntimeSelection.includes("export const AUDIO_ENGINE_SWITCHER_PARAM = 'engineAB';"),
  'ProductAudioRuntimeSelection must own the reference runtime switcher query key',
);
assert(!existsSync(resolve(root, 'src/audio/runtime.ts')), 'temporary src/audio/runtime.ts facade must be deleted');
assert(!existsSync(resolve(root, 'src/audio/engine.ts')), 'legacy web-ts engine must live under src/audio/reference/webTs/engine.ts, not the production audio root');
assert(
    app.includes("from './ui/useProductRuntimeSession'") &&
    app.includes('resolveProductRuntimeInitialState({ normalizeState: normalizePresetForWeb })') &&
    app.includes('useProductRuntimeSession()') &&
    app.includes('useProductRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeSession'") &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeShell'") &&
    !app.includes('resolveSelectedAudioEngineInitialState({ normalizeState: normalizePresetForWeb })') &&
    !app.includes('useSelectedAudioEngineRuntimeSession()') &&
    !app.includes('useSelectedAudioEngineRuntimeShell({') &&
    !app.includes("from './ui/useSelectedAudioEngineRuntimeUi'") &&
    !app.includes('useSelectedAudioEngineRuntimeUi({') &&
    !app.includes("from './ui/useAudioEngineRuntimeNavigation'") &&
    !app.includes("from './ui/useSelectedAudioEnginePerf'") &&
    !app.includes('useSelectedAudioEngineRuntimeSessionNavigation({') &&
    selectedAudioEngineRuntimeSession.includes("from './useAudioEngineRuntimeNavigation'") &&
    selectedAudioEngineRuntimeSession.includes('readAudioEngineRuntimeSwitchState()') &&
    selectedAudioEngineRuntimeSession.includes('useSelectedAudioEngineRuntimeMode()') &&
    selectedAudioEngineRuntimeSession.includes('useAudioEngineRuntimeNavigation({') &&
    productRuntimeSession.includes("from './useProductRuntimeModeSession'") &&
    productRuntimeSession.includes("import { useProductRuntimePlaybackRuntime } from './useProductRuntimePlaybackRuntime'") &&
    productRuntimeSession.includes("import { useProductRuntimeUi } from './useProductRuntimeUi'") &&
    productRuntimeSession.includes('export function resolveProductRuntimeInitialState') &&
    productRuntimeSession.includes('return resolveProductRuntimeModeInitialState(options)') &&
    productRuntimeSession.includes('return useProductRuntimeModeSession()') &&
    productRuntimeSession.includes('useProductRuntimePlaybackRuntime({') &&
    productRuntimeSession.includes('useProductRuntimeUi({') &&
    productRuntimeModeSession.includes("from './useProductRuntimeNavigationCore'") &&
    productRuntimeModeSession.includes('readProductRuntimeSwitchState()') &&
    productRuntimeModeSession.includes('useProductRuntimeMode()') &&
    productRuntimeModeSession.includes('decodeStateFromUrl(window.location.search)') &&
    !productRuntimeModeSession.includes('useSelectedAudioEngineRuntimeSession') &&
    productRuntimePlaybackRuntime.includes('return useProductRuntimePlaybackAdapter({') &&
    productRuntimePlaybackRuntime.includes('productRuntimeMode,') &&
    productRuntimeUi.includes('useProductRuntimeNavigation({') &&
    productRuntimeUi.includes('useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showProductRuntimeSwitcher)') &&
    !productRuntimeUi.includes('useSelectedAudioEngineRuntimeUi') &&
    selectedAudioEngineRuntimeUi.includes("import { useSelectedAudioEnginePerf } from './useSelectedAudioEnginePerf'") &&
    selectedAudioEngineRuntimeUi.includes("import { useSelectedAudioEngineRuntimeSessionNavigation } from './useSelectedAudioEngineRuntimeSession'") &&
    selectedAudioEngineRuntimeUi.includes('useSelectedAudioEngineRuntimeSessionNavigation({') &&
    selectedAudioEngineRuntimeUi.includes('useSelectedAudioEnginePerf(audioEngineRuntimeMode, runtimeNavigation.showAudioEngineSwitcher)') &&
    selectedAudioEngineRuntimeShell.includes("import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi'") &&
    selectedAudioEngineRuntimeShell.includes('useSelectedAudioEngineRuntimeUi({') &&
    audioEngineRuntimeNavigation.includes("from './useProductRuntimeNavigationCore'") &&
    audioEngineRuntimeNavigation.includes('useProductRuntimeNavigationCore({') &&
    productRuntimeNavigationCore.includes("from '../audio/product/ProductAudioRuntimeSelection'"),
  'App runtime-mode selection, switch-state restore, navigation, and perf UI must route through selected runtime session/UI hooks and the product-owned runtime selection module',
);
assert(
  app.includes("from './ui/ProductRuntimeSwitch'") &&
    app.includes('<ProductRuntimeSwitch') &&
    !app.includes("from './ui/SelectedAudioEngineRuntimeSwitch'") &&
    !app.includes('<SelectedAudioEngineRuntimeSwitch') &&
    !app.includes("from './ui/AudioEngineRuntimeSwitch'") &&
    !app.includes('<AudioEngineRuntimeSwitch') &&
    app.includes('{...globalRuntimeProps}') &&
    app.includes('useProductRuntimeGlobalSurface({') &&
    !app.includes('useSelectedAudioEngineGlobalRuntimeProps({') &&
    !app.includes('runtimeComparison={{') &&
    globalPage.includes("import { GlobalRuntimeComparisonPanel, type GlobalRuntimeComparisonPanelProps } from './GlobalRuntimeComparisonPanel'") &&
    globalPage.includes('runtimeComparison?: GlobalRuntimeComparisonPanelProps') &&
    globalPage.includes('<GlobalRuntimeComparisonPanel {...runtimeComparison} />') &&
    globalPage.includes('recordingAvailable: boolean') &&
    globalPage.includes('stemRecordingAvailable: boolean') &&
    !globalPage.includes("['core-product', 'web-ts'") &&
    !globalPage.includes('coreSmokeModeAvailable') &&
    !globalPage.includes("import { AudioEngineRuntimeSwitch } from '../AudioEngineRuntimeSwitch'") &&
    !globalPage.includes('audioEngineModes?: readonly AudioEngineRuntimeMode[]') &&
    !globalPage.includes('audioEngineRuntimeModeLabel') &&
    !globalPage.includes("const recordingAvailable = audioEngineMode !== 'core-product'") &&
    globalRuntimeComparisonPanel.includes("import { ProductRuntimeSwitch } from '../ProductRuntimeSwitch'") &&
    globalRuntimeComparisonPanel.includes('ProductRuntimeSelectionMode') &&
    globalRuntimeComparisonPanel.includes('export type GlobalRuntimeComparisonPanelProps') &&
    globalRuntimeComparisonPanel.includes('if (!visible || !onModeChange) return null;') &&
    globalRuntimeComparisonPanel.includes('<ProductRuntimeSwitch') &&
    globalRuntimeComparisonPanel.includes('testId="global-product-runtime-switch"') &&
    globalRuntimeComparisonPanel.includes('variant="scene"') &&
    globalRuntimeComparisonPanel.includes('productRuntimeModeLabel(mode)') &&
    selectedAudioEngineRuntimeUi.includes("import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel'") &&
    selectedAudioEngineRuntimeUi.includes('const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({') &&
    selectedAudioEngineRuntimeUi.includes('modes: runtimeNavigation.audioEngineRuntimeModes') &&
    selectedAudioEngineRuntimeUi.includes('cpuSummaries: perf.audioEngineCpuSummaries') &&
    selectedAudioEngineRuntimeUi.includes('onModeChange: runtimeNavigation.handleAudioEngineRuntimeModeChange') &&
    selectedAudioEngineRuntimeUi.includes('globalRuntimeComparison') &&
    selectedAudioEngineGlobalRuntimeProps.includes('runtimeComparison') &&
    selectedAudioEngineGlobalRuntimeProps.includes('onResetCofDrift') &&
    selectedAudioEngineGlobalRuntimeProps.includes('recordingProps: GlobalRecordingProps') &&
    selectedAudioEngineGlobalRuntimeProps.includes('playbackTimerProps: GlobalPlaybackTimerProps') &&
    selectedAudioEngineGlobalRuntimeProps.includes('...recordingProps') &&
    selectedAudioEngineGlobalRuntimeProps.includes('...playbackTimerProps') &&
    audioRecording.includes("const recordingAvailable = audioEngineRuntimeMode !== 'core-product'") &&
    audioRecording.includes('stemRecordingAvailable,') &&
    productRuntimeUiHelpers.includes('PRODUCT_RUNTIME_PARAM') &&
    productRuntimeUiHelpers.includes('PRODUCT_RUNTIME_SWITCHER_PARAM') &&
    audioEngineRuntimeUi.includes('shouldShowAudioEngineSwitcher') &&
    audioEngineRuntimeSwitch.includes("import { RuntimeModeSwitch } from './RuntimeModeSwitch'") &&
    audioEngineRuntimeSwitch.includes('<RuntimeModeSwitch') &&
    runtimeModeSwitch.includes('PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT') &&
    runtimeModeSwitch.includes('productRuntimeModeLabel(mode)') &&
    runtimeModeSwitch.includes('productRuntimeModeTitle(mode)') &&
    audioEngineRuntimeSwitch.includes("testId = 'main-audio-engine-switch'") &&
    runtimeModeSwitch.includes('data-testid={testId}') &&
    selectedAudioEngineRuntimeSwitch.includes("import { AudioEngineRuntimeSwitch } from './AudioEngineRuntimeSwitch'") &&
    selectedAudioEngineRuntimeSwitch.includes('visible: boolean') &&
    selectedAudioEngineRuntimeSwitch.includes('if (!visible) return null;') &&
    selectedAudioEngineRuntimeSwitch.includes('<AudioEngineRuntimeSwitch') &&
    productRuntimeSwitch.includes("import { RuntimeModeSwitch } from './RuntimeModeSwitch'") &&
    productRuntimeSwitch.includes('export type ProductRuntimeSwitchMode = ProductRuntimeSelectionMode') &&
    productRuntimeSwitch.includes('<RuntimeModeSwitch') &&
    !productRuntimeSwitch.includes('SelectedAudioEngineRuntimeSwitch') &&
    !productRuntimeSwitch.includes('AudioEngineRuntimeMode') &&
    productRuntimeNavigationCore.includes('buildProductRuntimeSwitchUrl(mode, stateRef.current)') &&
    selectedAudioEngineRuntimeUi.includes('preloadSelectedAudioEngine,') &&
    selectedAudioEngineRuntimeUi.includes('stopSelectedAudioEngine,'),
  'App runtime switch UI must stay behind AudioEngineRuntimeSwitch/navigation modules that consume product-owned query constants',
);
assert(
  !app.includes('getAudioEngineRuntimeMode,\n  getAudioEngineRuntimeModes,\n  preloadAudioEngine'),
  'App must not import runtime-mode selection from ProductAudioEngineCompat',
);
assert(
  !selectedProductRuntime.includes('coreProductEngineHost') && !productAudioEngineCompat.includes('coreProductEngineHost'),
  'SelectedProductRuntime/ProductAudioEngineCompat must route core-product through ProductEnginePort instead of importing coreProductEngineHost',
);
assert(selectedProductRuntime.includes('return productEngine.preload().then(() => productEngine);'), 'SelectedProductRuntime must preload core-product through ProductEngineProxy');
assert(
  productAudioEngineCompat.includes('TODO(product-core-runtime-closure)') &&
    productAudioEngineCompat.includes("from './SelectedProductRuntime'") &&
    !productAudioEngineCompat.includes("import('../referenceAudioRuntime')"),
  'ProductAudioEngineCompat must remain a deprecated alias, not a runtime owner',
);
assert(globalRuntimeComparisonPanel.includes("currentMode === 'core-product' ? 'running' : 'stopped'"), 'Global runtime comparison panel must highlight Product Core as the running product mode');
for (const token of [
  'KESSHO_PRODUCT_SCHEMA_HASH',
  'KESSHO_PRODUCT_SCHEMA_HASH_HEX',
  'KESSHO_PRODUCT_ABI_VERSION',
  "runtimeKind: 'web-worklet'",
  'supportsNativeBridge: false',
  "nativeBridge: 'deferred-for-web-default'",
  'nativeProductRuntimeGuarded: true',
  'testProductRuntimeGuarded: true',
]) {
  assert(productRuntimeCapabilityReport.includes(token), `Product runtime capability report is missing ${token}`);
}
assert(
  productRuntimeCapabilityReport.includes('export const KESSHO_PRODUCT_ABI_VERSION = 5 as const') && productTypesHeader.includes('#define KESSHO_PRODUCT_ABI_VERSION 5'),
  'Product runtime capability report ABI version must match the C++ Product ABI',
);
assert(
  productApi.includes('report.supports_native_bridge = 0;') && productRuntimeCapabilityReport.includes('supportsNativeBridge: false'),
  'Product runtime capability report must agree that native bridge is not implemented',
);
assert(
  productApi.includes('report.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;') && productRuntimeCapabilityReport.includes('KESSHO_PRODUCT_SCHEMA_HASH'),
  'Product runtime capability report must expose the generated Product schema hash',
);

assert(packageJson.scripts?.build === 'npm run core:product:wasm && tsc && vite build', 'main build must rebuild/verify Product Core WASM before Vite build');
assert(packageJson.scripts?.['core:product:browser-runtime'] === 'node scripts/check-kessho-product-browser-runtime.mjs', 'package.json must expose core:product:browser-runtime');
assert(
  packageJson.scripts?.['core:product:sequencer-evolve'] === 'node scripts/run-kessho-product-sequencer-evolve-regression.mjs',
  'package.json must expose core:product:sequencer-evolve',
);
assert(packageJson.scripts?.['core:product:sequencer-ui'] === 'node scripts/check-kessho-product-sequencer-ui-parity.mjs', 'package.json must expose core:product:sequencer-ui');
assert(packageJson.scripts?.['migration:docs'] === 'node scripts/check-product-docs-freshness.mjs', 'package.json must expose migration:docs');
assert(packageJson.scripts?.['migration:no-web-ts-bundle'] === 'node scripts/check-no-web-ts-production-bundle.mjs', 'package.json must expose migration:no-web-ts-bundle');
assert(
  packageJson.scripts?.['migration:unsupported-surface:gate'] === 'node scripts/audit-product-host-unsupported-surface.mjs --write-json --gate',
  'package.json must expose migration:unsupported-surface:gate',
);
assert(packageJson.scripts?.['core:product:default-gate-v3'] === 'node scripts/check-kessho-product-default-gate-v3.mjs', 'package.json must expose core:product:default-gate-v3');
assert(packageJson.scripts?.['core:product:ci'] === 'node scripts/run-kessho-product-ci.mjs', 'package.json must expose local Product Core CI');
assert(packageJson.scripts?.['core:product:ci:prereqs'] === 'node scripts/run-kessho-product-ci.mjs --skip-final-gate', 'package.json must expose Product Core prerequisite CI');

assert(productCiRunner.includes("'core:product:browser-runtime'"), 'Product Core CI runner must include browser-runtime proof');
assert(productCiRunner.includes("'migration:docs'"), 'Product Core CI runner must include docs freshness gate');
assert(productCiRunner.includes("'migration:no-web-ts-bundle'"), 'Product Core CI runner must include no-web-ts production bundle gate');
assert(productCiRunner.includes("'migration:unsupported-surface:gate'"), 'Product Core CI runner must include unsupported-surface gate');
assert(productCiRunner.includes("'core:product:sequencer-evolve'"), 'Product Core CI runner must include Product sequencer evolve proof');
assert(productCiRunner.includes("'core:product:harmony'"), 'Product Core CI runner must include harmony parity proof before sequencer UI parity');
assert(productCiRunner.includes("'core:product:sequencer-ui'"), 'Product Core CI runner must include sequencer behavioral regression proof');
assert(
  productCiRunner.indexOf("'core:product:harmony'") < productCiRunner.indexOf("'core:product:sequencer-ui'"),
  'Product Core CI runner must run harmony parity before sequencer behavioral regression proof',
);
assert(!productCiRunner.includes("'core:readiness:browser'"), 'Product Core CI runner must not use the legacy Web-vs-Core readiness gate for product default promotion');
const archivedNativeStepPrefix = "'core:product:" + 'native';
assert(!productCiRunner.includes(archivedNativeStepPrefix), 'Product Core CI runner must not depend on archived native Swift checks');
assert(productCiRunner.includes("const finalGateStep = 'core:product:default-gate-v3'"), 'Product Core CI runner must keep v3 final gate');

const workflowRunCommands = parseRunCommands(workflow);
assert(workflowRunCommands.at(-1) === 'npm run core:product:default-gate-v3', 'Product Default Gate v3 must be final GitHub command');
assert(workflowRunCommands.includes('npm run core:product:ci:prereqs'), 'GitHub Product Core CI must run prerequisite Product Core CI first');
assert(!workflow.includes('KESSHO_BROWSER_CORPUS_SONIC_RETRIES'), 'Product workflow must not carry the legacy browser parity retry knob');

for (const token of ['Status: PASS', 'Decision: web-default-core-product', 'Default Rule', 'core-product is the web default', 'core:product:browser-runtime']) {
  assert(defaultGateDoc.includes(token), `Product Default Gate v3 doc is missing ${token}`);
}
for (const forbidden of ['web-default-deferred', 'verified web default remains `core-bridge`', 'must remain selectable but not default']) {
  assert(!defaultGateDoc.includes(forbidden), `Product Default Gate v3 doc still contains obsolete blocker text: ${forbidden}`);
}
assert(statusDoc.includes('Web runtime default | `core-product`'), 'migration status doc must report core-product as web default');

const requiredPrerequisiteSteps = [
  'core:product:generate',
  'type-check',
  'build',
  'core:product:schema',
  'core:product:workflow',
  'core:product:architecture',
  'migration:product-boundary',
  'migration:docs',
  'migration:no-web-ts-bundle',
  'core:product:patch-bridges',
  'core:product:snapshot-authority',
  'core:product:host-reconciliation',
  'core:product:dirty-diff',
  'core:product:runtime-fallbacks',
  'core:product:getter-policies',
  'migration:unsupported-surface:gate',
  'core:product:reference-isolation',
  'core:product:param-accounting',
  'core:product:abi',
  'core:build:wasm',
  'core:product:wasm',
  'core:product:determinism',
  'core:product:sequencer',
  'core:product:sequencer-evolve',
  'core:product:harmony',
  'core:product:graph',
  'core:product:fx',
  'core:product:fx-depth',
  'core:product:asset-manifest',
  'core:product:sources',
  'core:product:assets',
  'core:product:source-parity',
  'core:product:nature-runtime',
  'core:product:web-graph-parity:audit',
  'core:product:web-graph-capture-smoke:fast',
  'core:product:web-host',
  'core:product:sequencer-ui',
  'core:product:cpu',
  'core:product:browser-runtime',
];

assert(Array.isArray(productCiReport.prerequisiteSteps), 'Product Core CI report must list prerequisiteSteps');
assert(
  JSON.stringify(productCiReport.prerequisiteSteps) === JSON.stringify(requiredPrerequisiteSteps),
  'Product Core CI prerequisite step list is stale; rerun local CI with the v3 runner',
);
for (const stepName of requiredPrerequisiteSteps) assertStepPassed(productCiReport, stepName);
assert(!stepByName(productCiReport, 'core:readiness:browser'), 'Product Core CI report must not include legacy browser readiness');
assert(!stepByName(productCiReport, 'core:product:default-gate-v2'), 'Product Core CI report must not include v2 default gate');

requireFreshReport('docs/reports/kessho-product-ci-latest.json', productCiReport.updatedAt ?? productCiReport.generatedAt, [
  'package.json',
  'scripts/run-kessho-product-ci.mjs',
  '.github/workflows/product-core-ci.yml',
  ...collectFiles('scripts'),
  ...collectFiles('src'),
  ...collectFiles('cpp/KesshoCore'),
  ...collectFiles('public/worklets'),
  'docs/kessho-product-core-migration-status.md',
  'docs/kessho-product-default-gate-v3.md',
]);
requireFreshReport('docs/reports/kessho-product-browser-runtime-latest.json', browserRuntimeReport.generatedAt, [
  'scripts/check-kessho-product-browser-runtime.mjs',
  'src/audio/product/ProductAudioRuntimeSelection.ts',
  'src/audio/product/ProductAudioEngineCompat.ts',
  'src/audio/referenceAudioRuntime.ts',
  'src/audio/sonicParityHarness.ts',
  'src/audio/coreProductEngineHost.ts',
  'public/worklets/kessho-core-product.worklet.js',
  'public/worklets/kessho_core.wasm',
]);
requireFreshReport('docs/reports/kessho-product-cpu-budget-latest.json', cpuReport.generatedAt, [
  'scripts/check-kessho-product-cpu-budget.mjs',
  'cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp',
]);
requireFreshReport('docs/reports/kessho-product-unsupported-surface-latest.json', unsupportedSurfaceReport.generatedAt, [
  'scripts/audit-product-host-unsupported-surface.mjs',
  'src/audio/coreProductEngineHost.ts',
  'src/audio/CoreProductFallbackDiagnostics.ts',
  'src/App.tsx',
  'src/audio/product/host/CoreProductHostDiagnostics.ts',
  'src/audio/product/WebProductEngine.ts',
  'docs/product-core/unsupported-surface.md',
]);
requireFreshReport('docs/reports/kessho-product-sequencer-ui-parity-latest.json', sequencerUiReport.generatedAt, [
  'scripts/check-kessho-product-sequencer-ui-parity.mjs',
  'src/ui/synth/SynthPage.tsx',
  'src/ui/drums/DrumPage.tsx',
  'src/ui/drums/SeqSparkline.tsx',
  'src/ui/sequencer/useEuclideanSequencer.ts',
  'src/ui/sequencer/sequencePresetLane.ts',
  'src/ui/useSelectedAudioEngineSequencerControls.ts',
  'src/audio/coreProductEngineHost.ts',
  'src/audio/product/host/CoreProductSequencerUiAdapter.ts',
  'src/audio/product/host/CoreProductManualSynthDiceBridge.ts',
  'public/worklets/kessho-core-product.worklet.js',
  'public/worklets/kessho_core.wasm',
]);

assert(browserRuntimeReport.status === 'pass', 'Product browser-runtime report must pass');
assert(browserRuntimeReport.defaultRuntime === 'core-product', 'Product browser-runtime report must prove core-product default');
const browserCaseIds = new Set(browserRuntimeReport.cases.map((entry) => entry.id));
for (const caseId of ['default-pad-note', 'default-lead-note', 'default-sample-and-synth', 'string-waves-arrangement']) {
  assert(browserCaseIds.has(caseId), `Product browser-runtime report is missing ${caseId}`);
}
for (const entry of browserRuntimeReport.cases) {
  assert(entry.engine === 'core-product', `${entry.id} did not run on core-product`);
  assert(entry.rms > 0.0005, `${entry.id} RMS stayed silent`);
  assert(entry.peak > 0.001, `${entry.id} peak stayed silent`);
}
const coexistCase = browserRuntimeReport.cases.find((entry) => entry.id === 'default-sample-and-synth');
assert((coexistCase?.activeAssets ?? 0) > 0, 'sample+synth browser-runtime case did not register Product Core assets');
assert((coexistCase?.workletPadStemPeak ?? 0) > 0, 'sample+synth browser-runtime case did not report Pad stem output');
const stringWavesCase = browserRuntimeReport.cases.find((entry) => entry.id === 'string-waves-arrangement');
assert((stringWavesCase?.activeAssets ?? 0) > 0, 'String Waves browser-runtime case did not register Product Core soundscape assets');
assert((stringWavesCase?.activeVoices ?? 0) > 0, 'String Waves browser-runtime case did not leave Product Core synth voices active');
assert((stringWavesCase?.workletPadStemPeak ?? 0) > 0.00001, 'String Waves browser-runtime case did not report Pad stem output');
assert((stringWavesCase?.workletLeadStemPeak ?? 0) > 0.000001, 'String Waves browser-runtime case did not report Lead stem output');

assert(cpuReport.status === 'pass' && cpuReport.cpu?.status === 'pass' && cpuReport.heap?.status === 'pass', 'CPU/heap report must pass');
assert(unsupportedSurfaceReport.gateMode === true, 'unsupported-surface report must be generated in gate mode');
assert(unsupportedSurfaceReport.findingCount === 0, 'unsupported-surface gate report must have zero findings');
assert(unsupportedSurfaceReport.gateViolationCount === 0, 'unsupported-surface gate report must have zero gate violations');
for (const [label, proofReport] of [
  ['runtime fallback', runtimeFallbackReport],
  ['dirty diff', dirtyDiffReport],
  ['host reconciliation', hostReconciliationReport],
]) {
  assert(proofReport.status === 'pass', `${label} behavioral proof report must pass`);
}
assert(sequencerUiReport.status === 'pass', 'sequencer UI behavioral report must pass');
assert(sequencerUiReport.evidenceRole === 'behavioral-regression', 'sequencer UI report must be classified as behavioral regression evidence');
assert(sequencerUiReport.referenceRuntimeRole === 'web-ts-behavioral-reference', 'sequencer UI report must classify web-ts as a behavioral reference');
assert(sequencerUiReport.architectureAuthority === false, 'sequencer UI report must not claim architecture authority');
assert(sequencerUiReport.fullRun === true && sequencerUiReport.selectedRun === false, 'sequencer UI release evidence must be the full four-case report, not a selected diagnostic run');
assert(sequencerUiReport.selection?.caseCount === 4, 'sequencer UI release evidence must cover four cases');
assert(
  JSON.stringify(sequencerUiReport.selection?.engineModes) === JSON.stringify(['core-product', 'web-ts']) &&
    JSON.stringify(sequencerUiReport.selection?.tabs) === JSON.stringify(['drums', 'synth']),
  'sequencer UI release evidence must cover core-product/web-ts drums/synth behavior',
);
for (const gate of [
  'core:product:host-reconciliation',
  'core:product:dirty-diff',
  'core:product:sequencer',
  'core:product:wasm',
  'core:product:live-note-contract',
  'core:product:cpu',
]) {
  assert(sequencerUiReport.requiredArchitectureGates?.includes(gate), `sequencer UI report must defer architecture proof to ${gate}`);
}
for (const nonProof of [
  'CPU budget',
  'allocation-free Product hot paths',
  'snapshot-free MIDI/note trigger paths',
  'Product Core architectural ownership',
]) {
  assert(sequencerUiReport.doesNotProve?.includes(nonProof), `sequencer UI report must not claim to prove ${nonProof}`);
}
assert(patchBridgeReport.status === 'pass', 'patch bridge report must pass');
assert(assetManifestReport.status === 'pass', 'asset manifest report must pass');

const report = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  status: 'pass',
  defaultPromotionReady: true,
  webDefaultRuntime: 'core-product',
  localCi: {
    report: 'docs/reports/kessho-product-ci-latest.json',
    mode: productCiReport.mode,
    prerequisiteCount: requiredPrerequisiteSteps.length,
  },
  browserRuntime: {
    report: 'docs/reports/kessho-product-browser-runtime-latest.json',
    cases: browserRuntimeReport.cases,
  },
  cpu: {
    report: 'docs/reports/kessho-product-cpu-budget-latest.json',
    disabledFx: cpuReport.cpu?.scenarios?.disabledFx,
    activeFx: cpuReport.cpu?.scenarios?.activeFx,
    heap: cpuReport.heap,
  },
  sequencerBehavior: {
    report: 'docs/reports/kessho-product-sequencer-ui-parity-latest.json',
    evidenceRole: sequencerUiReport.evidenceRole,
    architectureAuthority: sequencerUiReport.architectureAuthority,
    caseCount: sequencerUiReport.selection?.caseCount,
  },
  unsupportedSurface: {
    report: 'docs/reports/kessho-product-unsupported-surface-latest.json',
    findingCount: unsupportedSurfaceReport.findingCount,
    gateViolationCount: unsupportedSurfaceReport.gateViolationCount,
  },
};

writeGateReport(report);
console.log('Kessho Product Default Gate v3 passed: core-product is the web default runtime');
