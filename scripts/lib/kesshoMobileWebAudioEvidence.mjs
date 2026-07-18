import { readFileSync } from 'node:fs';

export const MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA = 'kessho-mobile-web-audio-evidence-v2';

export const MOBILE_WEB_AUDIO_SCENARIOS = Object.freeze([
  'default-visible',
  'highest-cpu-visible',
  'highest-memory-visible',
  'representative-preset-cycles',
  'app-switch',
  'screen-lock',
]);

export const MOBILE_WEB_AUDIO_FEATURE_BUNDLES = Object.freeze([
  'base-autonomy',
  'base-max-cpu',
  'advanced-parity',
  'current-smoke',
  'auto-stop',
]);

export const MOBILE_WEB_AUDIO_RUNTIME_CLASSIFICATIONS = Object.freeze([
  'pass',
  'browser-policy-suspension',
  'engine-failure',
]);

export const MOBILE_WEB_AUDIO_ACCEPTANCE_MILESTONES = Object.freeze([
  'base',
  'advanced',
]);

export const MOBILE_WEB_AUDIO_REGISTERED_SOFT_BYTES = 160 * 1024 * 1024;
export const MOBILE_WEB_AUDIO_REGISTERED_HARD_BYTES = 192 * 1024 * 1024;
export const MOBILE_WEB_AUDIO_HOST_DECODED_BYTES = 16 * 1024 * 1024;

export const MOBILE_WEB_AUDIO_METRICS = Object.freeze([
  'renderCpuMean',
  'renderCpuPeak',
  'renderP95Ms',
  'renderP99Ms',
  'missedQuantumCount',
  'assetMissingCount',
  'wasmHeapBytes',
  'decodedAssetBytes',
  'assetAllocationBytes',
  'hostDecodedBytes',
  'inFlightDecodedBytes',
  'audibleGapCount',
]);

const INTEGER_METRICS = new Set([
  'missedQuantumCount',
  'assetMissingCount',
  'wasmHeapBytes',
  'decodedAssetBytes',
  'assetAllocationBytes',
  'hostDecodedBytes',
  'inFlightDecodedBytes',
  'audibleGapCount',
]);

function fail(message, source) {
  throw new Error(`${source}: ${message}`);
}

function requirePlainObject(value, path, source) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object`, source);
  }
  return value;
}

function requireNonEmptyString(value, path, source) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`, source);
  }
}

function requireBoolean(value, path, source) {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean`, source);
}

function requireFiniteNumber(value, path, source, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) {
    fail(`${path} must be a finite number >= ${minimum}`, source);
  }
}

function validateMetricSnapshot(value, path, source) {
  const snapshot = requirePlainObject(value, path, source);
  for (const metric of MOBILE_WEB_AUDIO_METRICS) {
    const metricValue = snapshot[metric];
    if (!Number.isFinite(metricValue) || metricValue < 0) {
      fail(`${path}.${metric} must be a finite non-negative number`, source);
    }
    if (INTEGER_METRICS.has(metric) && !Number.isSafeInteger(metricValue)) {
      fail(`${path}.${metric} must be a safe integer`, source);
    }
  }
  return snapshot;
}

export function validateMobileWebAudioEvidence(evidence, source = 'evidence') {
  requirePlainObject(evidence, 'root', source);
  if (evidence.schema !== MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA) {
    fail(`schema must equal ${MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA}`, source);
  }

  const device = requirePlainObject(evidence.device, 'device', source);
  requireNonEmptyString(device.model, 'device.model', source);
  if (!/^iPhone (?:1[1-9]|[2-9][0-9])(?:\s|$)/.test(device.model)) {
    fail('device.model must name a physical iPhone 11 or newer', source);
  }
  requireNonEmptyString(device.os, 'device.os', source);
  if (!/^(?:iOS\s*)?\d+(?:\.\d+){0,2}$/.test(device.os.trim())) {
    fail('device.os must be an iOS version such as 18.5', source);
  }
  if (!['safari', 'chrome', 'home-screen'].includes(device.browser)) {
    fail('device.browser must be safari, chrome, or home-screen', source);
  }

  const scenario = requirePlainObject(evidence.scenario, 'scenario', source);
  if (!MOBILE_WEB_AUDIO_SCENARIOS.includes(scenario.kind)) {
    fail(`scenario.kind must be one of ${MOBILE_WEB_AUDIO_SCENARIOS.join(', ')}`, source);
  }
  requireNonEmptyString(scenario.presetId, 'scenario.presetId', source);
  if (!['speaker', 'wired', 'bluetooth'].includes(scenario.output)) {
    fail('scenario.output must be speaker, wired, or bluetooth', source);
  }
  if (!Number.isFinite(scenario.durationMinutes) || scenario.durationMinutes < 0) {
    fail('scenario.durationMinutes must be a finite non-negative number', source);
  }
  if (!Number.isFinite(scenario.lockedMinutes) || scenario.lockedMinutes < 0) {
    fail('scenario.lockedMinutes must be a finite non-negative number', source);
  }
  if (scenario.lockedMinutes > scenario.durationMinutes) {
    fail('scenario.lockedMinutes cannot exceed scenario.durationMinutes', source);
  }
  const appSwitchedMinutes = scenario.appSwitchedMinutes ?? 0;
  if (!Number.isFinite(appSwitchedMinutes) || appSwitchedMinutes < 0) {
    fail('scenario.appSwitchedMinutes must be a finite non-negative number', source);
  }
  if (appSwitchedMinutes > scenario.durationMinutes) {
    fail('scenario.appSwitchedMinutes cannot exceed scenario.durationMinutes', source);
  }
  const minimumDuration = scenario.lockedMinutes > 0 || appSwitchedMinutes > 0 ? 3 : 10;
  if (scenario.durationMinutes < minimumDuration) {
    fail(`scenario duration must be at least ${minimumDuration} minutes`, source);
  }
  if (scenario.kind === 'screen-lock' && scenario.lockedMinutes <= 0) {
    fail('screen-lock scenarios require a positive locked interval', source);
  }
  if (scenario.kind === 'app-switch' && appSwitchedMinutes <= 0) {
    fail('app-switch scenarios require a positive app-switched interval', source);
  }
  if (scenario.kind.endsWith('-visible') && (scenario.lockedMinutes !== 0 || appSwitchedMinutes !== 0)) {
    fail('visible scenarios must not include hidden lifecycle intervals', source);
  }

  validateMetricSnapshot(evidence.before, 'before', source);
  if (evidence.after !== undefined) validateMetricSnapshot(evidence.after, 'after', source);

  return evidence;
}

export function validateMobileWebAudioAcceptanceEvidence(evidence, source = 'acceptance evidence') {
  validateMobileWebAudioEvidence(evidence, source);
  const after = validateMetricSnapshot(evidence.after, 'after', source);
  const before = evidence.before;
  const acceptance = requirePlainObject(evidence.acceptance, 'acceptance', source);
  if (!MOBILE_WEB_AUDIO_ACCEPTANCE_MILESTONES.includes(acceptance.milestone)) {
    fail(`acceptance.milestone must be one of ${MOBILE_WEB_AUDIO_ACCEPTANCE_MILESTONES.join(', ')}`, source);
  }
  if (!Array.isArray(evidence.scenario.bundles) || evidence.scenario.bundles.length === 0) {
    fail('scenario.bundles must contain at least one compact feature bundle', source);
  }
  for (const bundle of evidence.scenario.bundles) {
    if (!MOBILE_WEB_AUDIO_FEATURE_BUNDLES.includes(bundle)) {
      fail(`scenario.bundles contains unsupported bundle ${bundle}`, source);
    }
  }
  if (new Set(evidence.scenario.bundles).size !== evidence.scenario.bundles.length) {
    fail('scenario.bundles must not contain duplicates', source);
  }
  if (!MOBILE_WEB_AUDIO_RUNTIME_CLASSIFICATIONS.includes(acceptance.runtimeClassification)) {
    fail(`acceptance.runtimeClassification must be one of ${MOBILE_WEB_AUDIO_RUNTIME_CLASSIFICATIONS.join(', ')}`, source);
  }
  if (acceptance.runtimeClassification === 'engine-failure') {
    fail('acceptance.runtimeClassification reports an engine-failure', source);
  }
  const runtime = requirePlainObject(acceptance.runtime, 'acceptance.runtime', source);
  for (const key of [
    'sampleRate',
    'sampleFrameBefore',
    'sampleFrameAfter',
    'autonomyRevisionBefore',
    'autonomyRevisionAfter',
    'expectedHiddenFrames',
    'observedHiddenFrames',
  ]) {
    requireFiniteNumber(runtime[key], `acceptance.runtime.${key}`, source);
    if (!Number.isSafeInteger(runtime[key])) fail(`acceptance.runtime.${key} must be a safe integer`, source);
  }
  requireBoolean(runtime.sonicStateAdvanced, 'acceptance.runtime.sonicStateAdvanced', source);
  requireNonEmptyString(runtime.expectedTraceHash, 'acceptance.runtime.expectedTraceHash', source);
  requireNonEmptyString(runtime.observedTraceHash, 'acceptance.runtime.observedTraceHash', source);
  const policySuspension = acceptance.runtimeClassification === 'browser-policy-suspension';
  if (runtime.sampleRate < 8_000 || runtime.sampleRate > 384_000) {
    fail('acceptance.runtime.sampleRate must be between 8000 and 384000', source);
  }
  const declaredHiddenMinutes = Math.max(evidence.scenario.lockedMinutes, evidence.scenario.appSwitchedMinutes ?? 0);
  const declaredHiddenFrames = declaredHiddenMinutes * 60 * runtime.sampleRate;
  const autoStopBundle = evidence.scenario.bundles.includes('auto-stop');
  if (
    !autoStopBundle &&
    (declaredHiddenFrames <= 0 ||
      Math.abs(runtime.expectedHiddenFrames - declaredHiddenFrames) > declaredHiddenFrames * 0.05)
  ) {
    fail('acceptance.runtime.expectedHiddenFrames must match the declared hidden duration within 5%', source);
  }
  if (runtime.sampleFrameAfter - runtime.sampleFrameBefore !== runtime.observedHiddenFrames) {
    fail('acceptance.runtime.observedHiddenFrames must equal the Product Core sample-frame delta', source);
  }
  if (policySuspension) {
    if (evidence.device.browser === 'home-screen') {
      fail('home-screen cannot pass as browser-policy-suspension', source);
    }
    if (runtime.expectedHiddenFrames <= 0) {
      fail('browser-policy-suspension requires a positive hidden-frame expectation', source);
    }
    if (runtime.observedHiddenFrames > runtime.expectedHiddenFrames * 0.1) {
      fail('browser-policy-suspension requires at most 10% hidden render-frame coverage', source);
    }
    if (runtime.sonicStateAdvanced) {
      fail('browser-policy-suspension cannot report advancing sonic state', source);
    }
    if (runtime.autonomyRevisionAfter !== runtime.autonomyRevisionBefore) {
      fail('browser-policy-suspension cannot advance the autonomy revision', source);
    }
  } else {
    if (runtime.sampleFrameAfter <= runtime.sampleFrameBefore) {
      fail('pass requires the Product Core sample frame to advance', source);
    }
    if (runtime.expectedHiddenFrames <= 0 || runtime.observedHiddenFrames < runtime.expectedHiddenFrames * 0.95) {
      fail('pass requires at least 95% hidden render-frame coverage', source);
    }
    if (!runtime.sonicStateAdvanced) {
      fail('Product Core sample frame advanced while sonic state did not', source);
    }
    if (runtime.autonomyRevisionAfter <= runtime.autonomyRevisionBefore) {
      fail('Product Core sample frame advanced while the autonomy revision did not', source);
    }
    if (runtime.observedTraceHash !== runtime.expectedTraceHash) {
      fail('observed Product Core trace does not match the uninterrupted trace', source);
    }
  }
  requireBoolean(acceptance.processTerminated, 'acceptance.processTerminated', source);
  if (acceptance.processTerminated) fail('acceptance.processTerminated must be false', source);
  for (const key of [
    'maxDecodedAssetBytes',
    'maxHostDecodedBytes',
    'deferredReleaseDecodedAssetBytes',
    'warmedHeapFirstCycleBytes',
    'warmedHeapSecondCycleBytes',
    'assetAllocationFirstCycleBytes',
    'assetAllocationSecondCycleBytes',
  ]) {
    requireFiniteNumber(acceptance[key], `acceptance.${key}`, source);
    if (!Number.isSafeInteger(acceptance[key])) fail(`acceptance.${key} must be a safe integer`, source);
  }
  if (acceptance.maxDecodedAssetBytes > MOBILE_WEB_AUDIO_REGISTERED_HARD_BYTES) {
    fail(`acceptance.maxDecodedAssetBytes must be <= ${MOBILE_WEB_AUDIO_REGISTERED_HARD_BYTES}`, source);
  }
  if (acceptance.maxHostDecodedBytes > MOBILE_WEB_AUDIO_HOST_DECODED_BYTES) {
    fail(`acceptance.maxHostDecodedBytes must be <= ${MOBILE_WEB_AUDIO_HOST_DECODED_BYTES}`, source);
  }
  if (acceptance.deferredReleaseDecodedAssetBytes > MOBILE_WEB_AUDIO_REGISTERED_SOFT_BYTES) {
    fail(`acceptance.deferredReleaseDecodedAssetBytes must be <= ${MOBILE_WEB_AUDIO_REGISTERED_SOFT_BYTES}`, source);
  }
  if (acceptance.warmedHeapSecondCycleBytes > acceptance.warmedHeapFirstCycleBytes) {
    fail('acceptance warmed WASM heap high-water mark rose on the second cycle', source);
  }
  if (acceptance.assetAllocationSecondCycleBytes > acceptance.assetAllocationFirstCycleBytes) {
    fail('acceptance active asset allocation bytes rose on the second cycle', source);
  }
  if (!['nominal', 'fair', 'serious', 'critical'].includes(acceptance.thermalState)) {
    fail('acceptance.thermalState must be nominal, fair, serious, or critical', source);
  }
  requireBoolean(acceptance.sustainedThermalDropouts, 'acceptance.sustainedThermalDropouts', source);
  if (acceptance.sustainedThermalDropouts) fail('acceptance.sustainedThermalDropouts must be false', source);

  const hiddenScenario = evidence.scenario.kind === 'screen-lock' || evidence.scenario.kind === 'app-switch';
  if (hiddenScenario) {
    const hidden = requirePlainObject(acceptance.hidden, 'acceptance.hidden', source);
    requireFiniteNumber(hidden.maxAudibleGapMs, 'acceptance.hidden.maxAudibleGapMs', source);
    if (!policySuspension && hidden.maxAudibleGapMs > 20) fail('acceptance.hidden.maxAudibleGapMs must be <= 20', source);
    requireBoolean(hidden.repeatedGapPattern, 'acceptance.hidden.repeatedGapPattern', source);
    if (!policySuspension && hidden.repeatedGapPattern) fail('acceptance.hidden.repeatedGapPattern must be false', source);
    for (const key of ['hiddenUiCallbackCount', 'foregroundRefreshCount', 'staleForegroundEventCount']) {
      requireFiniteNumber(hidden[key], `acceptance.hidden.${key}`, source);
      if (!Number.isSafeInteger(hidden[key])) fail(`acceptance.hidden.${key} must be a safe integer`, source);
    }
    if (hidden.hiddenUiCallbackCount !== 0) fail('acceptance.hidden.hiddenUiCallbackCount must be 0', source);
    if (hidden.foregroundRefreshCount !== 1) fail('acceptance.hidden.foregroundRefreshCount must be 1', source);
    if (hidden.staleForegroundEventCount !== 0) fail('acceptance.hidden.staleForegroundEventCount must be 0', source);
    requireFiniteNumber(hidden.outputCorrelation, 'acceptance.hidden.outputCorrelation', source);
    if (!policySuspension && (hidden.outputCorrelation > 1 || hidden.outputCorrelation < 0.9999)) {
      fail('acceptance.hidden.outputCorrelation must be between 0.9999 and 1', source);
    }
    if (!Number.isFinite(hidden.loudnessDeltaDb) || (!policySuspension && Math.abs(hidden.loudnessDeltaDb) >= 0.1)) {
      fail('acceptance.hidden.loudnessDeltaDb absolute value must be < 0.1', source);
    }
    if (after.missedQuantumCount > before.missedQuantumCount) {
      fail('after.missedQuantumCount must not increase while hidden', source);
    }
    if (after.assetMissingCount > before.assetMissingCount) {
      fail('after.assetMissingCount must not increase while hidden', source);
    }
    requireBoolean(hidden.interruptionTested, 'acceptance.hidden.interruptionTested', source);
    requireBoolean(hidden.interruptionRecoveryPass, 'acceptance.hidden.interruptionRecoveryPass', source);
    if (hidden.interruptionTested && !hidden.interruptionRecoveryPass) {
      fail('acceptance.hidden.interruptionRecoveryPass must pass when interruptionTested is true', source);
    }
    if (evidence.scenario.kind === 'screen-lock' && evidence.device.browser === 'home-screen') {
      requireBoolean(hidden.lockScreenControlsPass, 'acceptance.hidden.lockScreenControlsPass', source);
      if (!hidden.lockScreenControlsPass) fail('acceptance.hidden.lockScreenControlsPass must be true', source);
    } else if (hidden.lockScreenControlsPass !== undefined) {
      requireBoolean(hidden.lockScreenControlsPass, 'acceptance.hidden.lockScreenControlsPass', source);
    }
  }
  if (evidence.scenario.bundles.includes('auto-stop')) {
    for (const key of ['autoStopTargetFrame', 'autoStopObservedFrame']) {
      requireFiniteNumber(runtime[key], `acceptance.runtime.${key}`, source);
      if (!Number.isSafeInteger(runtime[key])) fail(`acceptance.runtime.${key} must be a safe integer`, source);
    }
    if (!policySuspension && runtime.autoStopObservedFrame !== runtime.autoStopTargetFrame) {
      fail('Product Core auto-stop did not fire at its configured frame', source);
    }
    if (runtime.expectedHiddenFrames !== runtime.autoStopTargetFrame - runtime.sampleFrameBefore) {
      fail('auto-stop expected hidden frames must end at the configured Product Core target', source);
    }
    if (Math.abs(runtime.expectedHiddenFrames - runtime.sampleRate * 120) > 1) {
      fail('auto-stop acceptance requires the configured two-minute Product Core duration', source);
    }
    requireBoolean(runtime.autoStopFiredWhileHidden, 'acceptance.runtime.autoStopFiredWhileHidden', source);
    if (!policySuspension) {
      if (evidence.scenario.lockedMinutes < 3) {
        fail('auto-stop acceptance requires at least three locked minutes', source);
      }
      if (runtime.autoStopTargetFrame <= runtime.sampleFrameBefore ||
          runtime.autoStopTargetFrame > runtime.sampleFrameAfter) {
        fail('Product Core auto-stop target must fall inside the observed hidden render interval', source);
      }
      if (!runtime.autoStopFiredWhileHidden) {
        fail('Product Core auto-stop must fire while the host is hidden', source);
      }
    }
  }
  if (evidence.scenario.bundles.includes('advanced-parity')) {
    requireBoolean(runtime.journeyReady, 'acceptance.runtime.journeyReady', source);
    if (!runtime.journeyReady) fail('advanced parity requires a ready Journey plan', source);
    for (const key of [
      'journeyPreparedDurationSeconds',
      'journeyScheduleEntries',
      'journeyAssetBytes',
      'journeyTransitionCount',
    ]) {
      requireFiniteNumber(runtime[key], `acceptance.runtime.${key}`, source);
      if (!Number.isSafeInteger(runtime[key])) fail(`acceptance.runtime.${key} must be a safe integer`, source);
    }
    if (runtime.journeyPreparedDurationSeconds < 7_200) {
      fail('advanced Journey plan must prepare at least 7200 seconds', source);
    }
    if (runtime.journeyScheduleEntries > 512) {
      fail('advanced Journey plan must use at most 512 schedule entries', source);
    }
    if (runtime.journeyAssetBytes > MOBILE_WEB_AUDIO_REGISTERED_SOFT_BYTES) {
      fail(`advanced Journey assets must be <= ${MOBILE_WEB_AUDIO_REGISTERED_SOFT_BYTES}`, source);
    }
    if (!policySuspension && runtime.journeyTransitionCount < 1) {
      fail('advanced Journey run must execute at least one transition', source);
    }
  }
  return evidence;
}

export function readAndValidateMobileWebAudioEvidence(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  return parsed?.acceptance === undefined
    ? validateMobileWebAudioEvidence(parsed, path)
    : validateMobileWebAudioAcceptanceEvidence(parsed, path);
}

export function validateMobileWebAudioBaselineMatrix(captures, source = 'baseline matrix') {
  const models = [...new Set(captures.map((evidence) => evidence.device.model))];
  if (!models.includes('iPhone 11')) fail('requires physical iPhone 11 evidence', source);
  const currentModels = models.filter((model) => model !== 'iPhone 11');
  if (currentModels.length === 0) fail('requires evidence from one current iPhone model', source);

  const visibleKinds = [
    'default-visible',
    'highest-cpu-visible',
    'highest-memory-visible',
    'representative-preset-cycles',
  ];
  for (const model of ['iPhone 11', currentModels[0]]) {
    const modelCaptures = captures.filter((evidence) => evidence.device.model === model);
    for (const kind of visibleKinds) {
      if (!modelCaptures.some((evidence) => (
        evidence.scenario.kind === kind && evidence.scenario.durationMinutes >= 15
      ))) {
        fail(`missing ${model} ${kind} for at least 15 minutes`, source);
      }
    }
    for (const browser of ['safari', 'chrome', 'home-screen']) {
      if (!modelCaptures.some((evidence) => (
        evidence.scenario.kind === 'screen-lock' &&
        evidence.device.browser === browser &&
        evidence.scenario.output === 'speaker' &&
        evidence.scenario.lockedMinutes >= 10
      ))) {
        fail(`missing ${model} ${browser} screen-lock speaker for at least 10 minutes`, source);
      }
    }
  }
  if (!captures.some((evidence) => (
    evidence.device.model === 'iPhone 11' &&
    evidence.device.browser === 'home-screen' &&
    evidence.scenario.kind === 'screen-lock' &&
    evidence.scenario.output === 'bluetooth' &&
    evidence.scenario.lockedMinutes >= 10
  ))) {
    fail('missing iPhone 11 home-screen Bluetooth screen-lock route for at least 10 minutes', source);
  }
  return captures;
}

export function validateMobileWebAudioAcceptanceMatrix(
  captures,
  source = 'acceptance matrix',
  milestone = 'advanced',
) {
  if (!MOBILE_WEB_AUDIO_ACCEPTANCE_MILESTONES.includes(milestone)) {
    fail(`milestone must be one of ${MOBILE_WEB_AUDIO_ACCEPTANCE_MILESTONES.join(', ')}`, source);
  }
  for (const capture of captures) validateMobileWebAudioAcceptanceEvidence(capture, source);
  if (captures.some((capture) => capture.acceptance.milestone !== milestone)) {
    fail(`every capture must state acceptance.milestone=${milestone}`, source);
  }
  const models = [...new Set(captures.map((evidence) => evidence.device.model))];
  if (!models.includes('iPhone 11')) fail('requires physical iPhone 11 acceptance evidence', source);
  const currentModels = models.filter((model) => model !== 'iPhone 11');
  if (currentModels.length === 0) fail('requires acceptance evidence from one current iPhone model', source);

  const currentModel = currentModels[0];
  const hasRun = ({ model, browser, output = 'speaker', duration, bundles, appSwitch = false, interruption = false }) => captures.some((evidence) => (
    evidence.device.model === model &&
    evidence.device.browser === browser &&
    evidence.scenario.output === output &&
    evidence.scenario.durationMinutes >= duration &&
    evidence.scenario.lockedMinutes > 0 &&
    (!appSwitch || (evidence.scenario.appSwitchedMinutes ?? 0) > 0) &&
    bundles.every((bundle) => evidence.scenario.bundles.includes(bundle)) &&
    (!interruption || (
      evidence.acceptance?.hidden?.interruptionTested === true &&
      evidence.acceptance.hidden.interruptionRecoveryPass === true
    ))
  ));
  const requiredRuns = [
    { model: 'iPhone 11', browser: 'safari', duration: 15, bundles: ['base-autonomy'], appSwitch: true },
    { model: 'iPhone 11', browser: 'chrome', duration: 10, bundles: ['base-autonomy'], appSwitch: true },
    { model: 'iPhone 11', browser: 'home-screen', duration: 15, bundles: ['base-max-cpu'] },
    { model: 'iPhone 11', browser: 'home-screen', output: 'bluetooth', duration: 15, bundles: ['base-max-cpu'], interruption: true },
    { model: currentModel, browser: 'safari', duration: 10, bundles: ['current-smoke'] },
    { model: currentModel, browser: 'home-screen', duration: 10, bundles: ['current-smoke', 'auto-stop'] },
  ];
  if (milestone === 'advanced') {
    requiredRuns[2].bundles.push('advanced-parity');
    requiredRuns[3].bundles.push('advanced-parity');
  }
  for (const required of requiredRuns) {
    if (!hasRun(required)) {
      fail(`missing compact run ${required.model} ${required.browser} ${required.output ?? 'speaker'} with ${required.bundles.join('+')}`, source);
    }
  }
  return captures;
}
