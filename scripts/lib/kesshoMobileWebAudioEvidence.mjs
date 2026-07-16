import { readFileSync } from 'node:fs';

export const MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA = 'kessho-mobile-web-audio-evidence-v1';

export const MOBILE_WEB_AUDIO_SCENARIOS = Object.freeze([
  'default-visible',
  'highest-cpu-visible',
  'highest-memory-visible',
  'representative-preset-cycles',
  'app-switch',
  'screen-lock',
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
  const minimumDuration = scenario.lockedMinutes > 0 || appSwitchedMinutes > 0 ? 60 : 15;
  if (scenario.durationMinutes < minimumDuration) {
    fail(`scenario duration must be at least ${minimumDuration} minutes`, source);
  }
  if (scenario.lockedMinutes > 0 && scenario.lockedMinutes < 60) {
    fail('locked playback evidence must include at least 60 locked minutes', source);
  }
  if (scenario.kind === 'screen-lock' && scenario.lockedMinutes < 60) {
    fail('screen-lock scenarios require at least 60 locked minutes', source);
  }
  if (scenario.kind === 'app-switch' && appSwitchedMinutes < 60) {
    fail('app-switch scenarios require at least 60 app-switched minutes', source);
  }
  if (scenario.kind !== 'screen-lock' && scenario.lockedMinutes !== 0) {
    fail('visible scenarios must set scenario.lockedMinutes to 0', source);
  }
  if (scenario.kind !== 'app-switch' && appSwitchedMinutes !== 0) {
    fail('non-app-switch scenarios must set scenario.appSwitchedMinutes to 0 or omit it', source);
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
    if (hidden.maxAudibleGapMs > 20) fail('acceptance.hidden.maxAudibleGapMs must be <= 20', source);
    requireBoolean(hidden.repeatedGapPattern, 'acceptance.hidden.repeatedGapPattern', source);
    if (hidden.repeatedGapPattern) fail('acceptance.hidden.repeatedGapPattern must be false', source);
    for (const key of ['hiddenUiCallbackCount', 'foregroundRefreshCount', 'staleForegroundEventCount']) {
      requireFiniteNumber(hidden[key], `acceptance.hidden.${key}`, source);
      if (!Number.isSafeInteger(hidden[key])) fail(`acceptance.hidden.${key} must be a safe integer`, source);
    }
    if (hidden.hiddenUiCallbackCount !== 0) fail('acceptance.hidden.hiddenUiCallbackCount must be 0', source);
    if (hidden.foregroundRefreshCount !== 1) fail('acceptance.hidden.foregroundRefreshCount must be 1', source);
    if (hidden.staleForegroundEventCount !== 0) fail('acceptance.hidden.staleForegroundEventCount must be 0', source);
    requireFiniteNumber(hidden.outputCorrelation, 'acceptance.hidden.outputCorrelation', source);
    if (hidden.outputCorrelation > 1 || hidden.outputCorrelation < 0.9999) {
      fail('acceptance.hidden.outputCorrelation must be between 0.9999 and 1', source);
    }
    if (!Number.isFinite(hidden.loudnessDeltaDb) || Math.abs(hidden.loudnessDeltaDb) >= 0.1) {
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
    if (evidence.scenario.kind === 'screen-lock') {
      requireBoolean(hidden.lockScreenControlsPass, 'acceptance.hidden.lockScreenControlsPass', source);
      if (!hidden.lockScreenControlsPass) fail('acceptance.hidden.lockScreenControlsPass must be true', source);
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
  return validateMobileWebAudioEvidence(parsed, path);
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
      for (const output of ['speaker', 'wired', 'bluetooth']) {
        if (!modelCaptures.some((evidence) => (
          evidence.scenario.kind === 'screen-lock' &&
          evidence.device.browser === browser &&
          evidence.scenario.output === output &&
          evidence.scenario.lockedMinutes >= 60
        ))) {
          fail(`missing ${model} ${browser} screen-lock ${output} for at least 60 minutes`, source);
        }
      }
    }
  }
  return captures;
}

export function validateMobileWebAudioAcceptanceMatrix(captures, source = 'acceptance matrix') {
  for (const capture of captures) validateMobileWebAudioAcceptanceEvidence(capture, source);
  const models = [...new Set(captures.map((evidence) => evidence.device.model))];
  if (!models.includes('iPhone 11')) fail('requires physical iPhone 11 acceptance evidence', source);
  const currentModels = models.filter((model) => model !== 'iPhone 11');
  if (currentModels.length === 0) fail('requires acceptance evidence from one current iPhone model', source);

  for (const model of ['iPhone 11', currentModels[0]]) {
    const modelCaptures = captures.filter((evidence) => evidence.device.model === model);
    for (const browser of ['safari', 'chrome', 'home-screen']) {
      const surfaceCaptures = modelCaptures.filter((evidence) => evidence.device.browser === browser);
      if (!surfaceCaptures.some((evidence) => (
        evidence.scenario.kind.endsWith('-visible') && evidence.scenario.durationMinutes >= 60
      ))) {
        fail(`missing ${model} ${browser} visible acceptance run for at least 60 minutes`, source);
      }
      if (!surfaceCaptures.some((evidence) => (
        evidence.scenario.kind === 'app-switch' && (evidence.scenario.appSwitchedMinutes ?? 0) >= 60
      ))) {
        fail(`missing ${model} ${browser} app-switch acceptance run for at least 60 minutes`, source);
      }
      for (const output of ['speaker', 'bluetooth']) {
        if (!surfaceCaptures.some((evidence) => (
          evidence.scenario.kind === 'screen-lock' &&
          evidence.scenario.output === output &&
          evidence.scenario.lockedMinutes >= 60
        ))) {
          fail(`missing ${model} ${browser} screen-lock ${output} acceptance run for at least 60 minutes`, source);
        }
      }
    }
    if (!modelCaptures.some((evidence) => (
      evidence.scenario.kind === 'screen-lock' &&
      evidence.acceptance?.hidden?.interruptionTested === true &&
      evidence.acceptance.hidden.interruptionRecoveryPass === true
    ))) {
      fail(`missing ${model} successful interruption recovery evidence`, source);
    }
  }
  if (!captures.some((evidence) => (
    evidence.device.model === 'iPhone 11' &&
    evidence.scenario.kind === 'highest-cpu-visible' &&
    evidence.scenario.durationMinutes >= 60 &&
    evidence.acceptance?.sustainedThermalDropouts === false
  ))) {
    fail('missing iPhone 11 60-minute highest-CPU thermal acceptance evidence', source);
  }
  return captures;
}
