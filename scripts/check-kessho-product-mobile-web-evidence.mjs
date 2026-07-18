import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA,
  MOBILE_WEB_AUDIO_METRICS,
  readAndValidateMobileWebAudioEvidence,
  validateMobileWebAudioAcceptanceEvidence,
  validateMobileWebAudioAcceptanceMatrix,
  validateMobileWebAudioBaselineMatrix,
  validateMobileWebAudioEvidence,
} from './lib/kesshoMobileWebAudioEvidence.mjs';

const root = process.cwd();
const reportDirectory = resolve(root, 'docs/reports');
const SELF_TEST_SAMPLE_RATE = 48_000;
const SELF_TEST_HIDDEN_FRAMES = SELF_TEST_SAMPLE_RATE * 60 * 10;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validFixture() {
  return {
    schema: MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA,
    device: { model: 'iPhone 11', os: '18.5', browser: 'safari' },
    scenario: {
      kind: 'screen-lock',
      presetId: 'default',
      output: 'speaker',
      durationMinutes: 15,
      lockedMinutes: 10,
      appSwitchedMinutes: 0,
      bundles: ['base-autonomy'],
    },
    before: Object.fromEntries(MOBILE_WEB_AUDIO_METRICS.map((metric) => [metric, 0])),
  };
}

function acceptanceFixture() {
  const fixture = validFixture();
  fixture.after = structuredClone(fixture.before);
  fixture.acceptance = {
    milestone: 'advanced',
    runtimeClassification: 'pass',
    runtime: {
      sampleRate: SELF_TEST_SAMPLE_RATE,
      sampleFrameBefore: 1000,
      sampleFrameAfter: 1000 + SELF_TEST_HIDDEN_FRAMES,
      autonomyRevisionBefore: 10,
      autonomyRevisionAfter: 20,
      expectedHiddenFrames: SELF_TEST_HIDDEN_FRAMES,
      observedHiddenFrames: SELF_TEST_HIDDEN_FRAMES,
      sonicStateAdvanced: true,
      expectedTraceHash: 'trace-ok',
      observedTraceHash: 'trace-ok',
    },
    processTerminated: false,
    maxDecodedAssetBytes: 180 * 1024 * 1024,
    maxHostDecodedBytes: 8 * 1024 * 1024,
    deferredReleaseDecodedAssetBytes: 150 * 1024 * 1024,
    warmedHeapFirstCycleBytes: 220 * 1024 * 1024,
    warmedHeapSecondCycleBytes: 220 * 1024 * 1024,
    assetAllocationFirstCycleBytes: 150 * 1024 * 1024,
    assetAllocationSecondCycleBytes: 150 * 1024 * 1024,
    thermalState: 'fair',
    sustainedThermalDropouts: false,
    hidden: {
      maxAudibleGapMs: 0,
      repeatedGapPattern: false,
      hiddenUiCallbackCount: 0,
      foregroundRefreshCount: 1,
      staleForegroundEventCount: 0,
      outputCorrelation: 1,
      loudnessDeltaDb: 0,
      interruptionTested: true,
      interruptionRecoveryPass: true,
      lockScreenControlsPass: true,
    },
  };
  return fixture;
}

function assertRejected(mutator, expectedToken) {
  const fixture = validFixture();
  mutator(fixture);
  let message = '';
  try {
    validateMobileWebAudioEvidence(fixture, 'self-test');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(expectedToken), `validator did not reject invalid fixture with ${expectedToken}`);
}

validateMobileWebAudioEvidence(validFixture(), 'self-test');
assertRejected((fixture) => { delete fixture.before.hostDecodedBytes; }, 'hostDecodedBytes');
assertRejected((fixture) => { fixture.before.renderCpuMean = Number.NaN; }, 'renderCpuMean');
assertRejected((fixture) => { fixture.device.model = 'iPad Pro'; }, 'device.model');
assertRejected((fixture) => { fixture.device.browser = 'firefox'; }, 'device.browser');
assertRejected((fixture) => { fixture.scenario.kind = 'warmup'; }, 'scenario.kind');
assertRejected((fixture) => {
  fixture.scenario.durationMinutes = 2;
  fixture.scenario.lockedMinutes = 2;
}, '3');
validateMobileWebAudioAcceptanceEvidence(acceptanceFixture(), 'acceptance self-test');

function assertAcceptanceRejected(mutator, expectedToken) {
  const fixture = acceptanceFixture();
  mutator(fixture);
  let message = '';
  try {
    validateMobileWebAudioAcceptanceEvidence(fixture, 'acceptance self-test');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(expectedToken), `acceptance validator did not reject invalid fixture with ${expectedToken}`);
}

assertAcceptanceRejected((fixture) => { fixture.acceptance.hidden.maxAudibleGapMs = 21; }, 'maxAudibleGapMs');
assertAcceptanceRejected((fixture) => { delete fixture.acceptance.milestone; }, 'acceptance.milestone');
assertAcceptanceRejected((fixture) => { fixture.acceptance.hidden.hiddenUiCallbackCount = 1; }, 'hiddenUiCallbackCount');
assertAcceptanceRejected((fixture) => { fixture.acceptance.warmedHeapSecondCycleBytes += 1; }, 'high-water mark');
assertAcceptanceRejected((fixture) => { fixture.after.assetMissingCount = 1; }, 'assetMissingCount');
assertAcceptanceRejected((fixture) => {
  fixture.acceptance.runtime.sonicStateAdvanced = false;
}, 'sonic state');
assertAcceptanceRejected((fixture) => { fixture.acceptance.runtime.observedTraceHash = 'wrong'; }, 'uninterrupted trace');
assertAcceptanceRejected((fixture) => {
  const observed = Math.floor(fixture.acceptance.runtime.expectedHiddenFrames * 0.9);
  fixture.acceptance.runtime.sampleFrameAfter = fixture.acceptance.runtime.sampleFrameBefore + observed;
  fixture.acceptance.runtime.observedHiddenFrames = observed;
}, '95%');
assertAcceptanceRejected((fixture) => {
  fixture.acceptance.runtime.observedHiddenFrames -= 1;
}, 'sample-frame delta');
assertAcceptanceRejected((fixture) => {
  fixture.scenario.bundles = ['auto-stop'];
  const autoStopFrames = fixture.acceptance.runtime.sampleRate * 120;
  fixture.acceptance.runtime.expectedHiddenFrames = autoStopFrames;
  fixture.acceptance.runtime.observedHiddenFrames = autoStopFrames;
  fixture.acceptance.runtime.sampleFrameAfter = fixture.acceptance.runtime.sampleFrameBefore + autoStopFrames;
  fixture.acceptance.runtime.autoStopTargetFrame = fixture.acceptance.runtime.sampleFrameAfter;
  fixture.acceptance.runtime.autoStopObservedFrame = fixture.acceptance.runtime.sampleFrameAfter;
  fixture.acceptance.runtime.autoStopFiredWhileHidden = false;
}, 'must fire while the host is hidden');
const policyFixture = acceptanceFixture();
policyFixture.acceptance.runtimeClassification = 'browser-policy-suspension';
policyFixture.acceptance.runtime.sampleFrameAfter = policyFixture.acceptance.runtime.sampleFrameBefore + 32;
policyFixture.acceptance.runtime.observedHiddenFrames = 32;
policyFixture.acceptance.runtime.sonicStateAdvanced = false;
policyFixture.acceptance.runtime.autonomyRevisionAfter = policyFixture.acceptance.runtime.autonomyRevisionBefore;
policyFixture.acceptance.hidden.maxAudibleGapMs = 10_000;
policyFixture.acceptance.hidden.repeatedGapPattern = true;
validateMobileWebAudioAcceptanceEvidence(policyFixture, 'policy suspension self-test');
assertAcceptanceRejected((fixture) => {
  fixture.acceptance.runtimeClassification = 'browser-policy-suspension';
  const observed = Math.ceil(fixture.acceptance.runtime.expectedHiddenFrames * 0.11);
  fixture.acceptance.runtime.sampleFrameAfter = fixture.acceptance.runtime.sampleFrameBefore + observed;
  fixture.acceptance.runtime.observedHiddenFrames = observed;
  fixture.acceptance.runtime.sonicStateAdvanced = false;
  fixture.acceptance.runtime.autonomyRevisionAfter = fixture.acceptance.runtime.autonomyRevisionBefore;
}, '10%');
assertAcceptanceRejected((fixture) => {
  fixture.device.browser = 'home-screen';
  fixture.acceptance.runtimeClassification = 'browser-policy-suspension';
  fixture.acceptance.runtime.sampleFrameAfter = fixture.acceptance.runtime.sampleFrameBefore + 32;
  fixture.acceptance.runtime.observedHiddenFrames = 32;
  fixture.acceptance.runtime.sonicStateAdvanced = false;
  fixture.acceptance.runtime.autonomyRevisionAfter = fixture.acceptance.runtime.autonomyRevisionBefore;
}, 'home-screen');

function completeBaselineFixtures() {
  const fixtures = [];
  for (const model of ['iPhone 11', 'iPhone 17 Pro']) {
    for (const kind of [
      'default-visible',
      'highest-cpu-visible',
      'highest-memory-visible',
      'representative-preset-cycles',
    ]) {
      const fixture = validFixture();
      fixture.device.model = model;
      fixture.scenario.kind = kind;
      fixture.scenario.durationMinutes = 15;
      fixture.scenario.lockedMinutes = 0;
      fixtures.push(fixture);
    }
    for (const browser of ['safari', 'chrome', 'home-screen']) {
      const fixture = validFixture();
      fixture.device.model = model;
      fixture.device.browser = browser;
      fixture.scenario.output = 'speaker';
      fixture.scenario.durationMinutes = 10;
      fixture.scenario.lockedMinutes = 10;
      fixtures.push(fixture);
    }
  }
  const bluetooth = validFixture();
  bluetooth.device.model = 'iPhone 11';
  bluetooth.device.browser = 'home-screen';
  bluetooth.scenario.output = 'bluetooth';
  bluetooth.scenario.durationMinutes = 10;
  bluetooth.scenario.lockedMinutes = 10;
  fixtures.push(bluetooth);
  return fixtures;
}

const completeFixtures = completeBaselineFixtures();
for (const fixture of completeFixtures) validateMobileWebAudioEvidence(fixture, 'matrix self-test');
validateMobileWebAudioBaselineMatrix(completeFixtures, 'matrix self-test');
let incompleteMatrixRejected = false;
try {
  validateMobileWebAudioBaselineMatrix(completeFixtures.slice(0, -1), 'matrix self-test');
} catch (error) {
  incompleteMatrixRejected = String(error).includes('Bluetooth');
}
assert(incompleteMatrixRejected, 'strict matrix must reject a missing browser/output capture');

function completeAcceptanceFixtures(milestone) {
  const run = ({ model, browser, output = 'speaker', duration, bundles, appSwitch = false, interruption = false }) => {
    const fixture = acceptanceFixture();
    fixture.device.model = model;
    fixture.device.browser = browser;
    fixture.scenario.output = output;
    fixture.scenario.durationMinutes = duration;
    fixture.scenario.lockedMinutes = Math.min(5, duration);
    fixture.scenario.appSwitchedMinutes = appSwitch ? Math.min(2, duration) : 0;
    fixture.scenario.bundles = bundles;
    fixture.acceptance.milestone = milestone;
    const expectedHiddenFrames = Math.max(
      fixture.scenario.lockedMinutes,
      fixture.scenario.appSwitchedMinutes,
    ) * 60 * fixture.acceptance.runtime.sampleRate;
    fixture.acceptance.runtime.expectedHiddenFrames = expectedHiddenFrames;
    fixture.acceptance.runtime.observedHiddenFrames = expectedHiddenFrames;
    fixture.acceptance.runtime.sampleFrameAfter =
      fixture.acceptance.runtime.sampleFrameBefore + expectedHiddenFrames;
    fixture.acceptance.hidden.interruptionTested = interruption;
    fixture.acceptance.hidden.interruptionRecoveryPass = interruption;
    if (bundles.includes('auto-stop')) {
      const autoStopFrames = fixture.acceptance.runtime.sampleRate * 60 * 2;
      fixture.acceptance.runtime.expectedHiddenFrames = autoStopFrames;
      fixture.acceptance.runtime.observedHiddenFrames = autoStopFrames;
      fixture.acceptance.runtime.sampleFrameAfter =
        fixture.acceptance.runtime.sampleFrameBefore + autoStopFrames;
      fixture.acceptance.runtime.autoStopTargetFrame = fixture.acceptance.runtime.sampleFrameAfter;
      fixture.acceptance.runtime.autoStopObservedFrame = fixture.acceptance.runtime.sampleFrameAfter;
      fixture.acceptance.runtime.autoStopFiredWhileHidden = true;
    }
    if (bundles.includes('advanced-parity')) {
      Object.assign(fixture.acceptance.runtime, {
        journeyReady: true,
        journeyPreparedDurationSeconds: 7_200,
        journeyScheduleEntries: 300,
        journeyAssetBytes: 150 * 1024 * 1024,
        journeyTransitionCount: 8,
      });
    }
    return fixture;
  };
  const advancedBundles = milestone === 'advanced' ? ['advanced-parity'] : [];
  return [
    run({ model: 'iPhone 11', browser: 'safari', duration: 15, bundles: ['base-autonomy'], appSwitch: true }),
    run({ model: 'iPhone 11', browser: 'chrome', duration: 10, bundles: ['base-autonomy'], appSwitch: true }),
    run({ model: 'iPhone 11', browser: 'home-screen', duration: 15, bundles: ['base-max-cpu', ...advancedBundles] }),
    run({ model: 'iPhone 11', browser: 'home-screen', output: 'bluetooth', duration: 15, bundles: ['base-max-cpu', ...advancedBundles], interruption: true }),
    run({ model: 'iPhone 17 Pro', browser: 'safari', duration: 10, bundles: ['current-smoke'] }),
    run({ model: 'iPhone 17 Pro', browser: 'home-screen', duration: 10, bundles: ['current-smoke', 'auto-stop'] }),
  ];
}

const completeBaseAcceptance = completeAcceptanceFixtures('base');
validateMobileWebAudioAcceptanceMatrix(completeBaseAcceptance, 'base acceptance matrix self-test', 'base');
const completeAcceptance = completeAcceptanceFixtures('advanced');
validateMobileWebAudioAcceptanceMatrix(completeAcceptance, 'acceptance matrix self-test', 'advanced');
const policyAcceptance = structuredClone(completeAcceptance);
policyAcceptance[0].acceptance.runtimeClassification = 'browser-policy-suspension';
policyAcceptance[0].acceptance.runtime.sampleFrameAfter = policyAcceptance[0].acceptance.runtime.sampleFrameBefore + 32;
policyAcceptance[0].acceptance.runtime.observedHiddenFrames = 32;
policyAcceptance[0].acceptance.runtime.sonicStateAdvanced = false;
policyAcceptance[0].acceptance.runtime.autonomyRevisionAfter = policyAcceptance[0].acceptance.runtime.autonomyRevisionBefore;
policyAcceptance[0].acceptance.hidden.maxAudibleGapMs = 10_000;
policyAcceptance[0].acceptance.hidden.repeatedGapPattern = true;
validateMobileWebAudioAcceptanceMatrix(policyAcceptance, 'policy-classified acceptance matrix self-test', 'advanced');
let incompleteAcceptanceRejected = false;
try {
  validateMobileWebAudioAcceptanceMatrix(completeAcceptance.slice(0, -1), 'acceptance matrix self-test', 'advanced');
} catch (error) {
  incompleteAcceptanceRejected = String(error).includes('auto-stop');
}
assert(incompleteAcceptanceRejected, 'acceptance matrix must reject a missing physical row');
let wrongMilestoneRejected = false;
try {
  validateMobileWebAudioAcceptanceMatrix(completeBaseAcceptance, 'milestone self-test', 'advanced');
} catch (error) {
  wrongMilestoneRejected = String(error).includes('milestone=advanced');
}
assert(wrongMilestoneRejected, 'acceptance matrix must reject evidence for the wrong milestone');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const evidenceTestCommand =
  'tsx --test src/audio/product/host/CoreProductTelemetryAdapter.test.ts src/audio/product/host/CoreProductMobileWebEvidenceCapture.test.ts';
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence'] ===
    `${evidenceTestCommand} && node scripts/check-kessho-product-mobile-web-evidence.mjs`,
  'package.json must expose core:product:mobile-web-evidence',
);
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence:acceptance'] ===
    `${evidenceTestCommand} && node scripts/check-kessho-product-mobile-web-evidence.mjs --require-acceptance`,
  'package.json must expose core:product:mobile-web-evidence:acceptance',
);
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence:acceptance:base'] ===
    `${evidenceTestCommand} && node scripts/check-kessho-product-mobile-web-evidence.mjs --require-acceptance --milestone=base`,
  'package.json must expose base milestone acceptance',
);
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence:acceptance:advanced'] ===
    `${evidenceTestCommand} && node scripts/check-kessho-product-mobile-web-evidence.mjs --require-acceptance --milestone=advanced`,
  'package.json must expose advanced milestone acceptance',
);

const telemetryTypes = readFileSync(resolve(root, 'src/audio/coreProductTelemetry.ts'), 'utf8');
const coreRuntime = readFileSync(resolve(root, 'src/audio/coreProductRuntime.ts'), 'utf8');
const telemetryAdapter = readFileSync(resolve(root, 'src/audio/product/host/CoreProductTelemetryAdapter.ts'), 'utf8');
const autonomyFingerprint = readFileSync(resolve(root, 'src/audio/product/host/CoreProductSonicAutonomyFingerprint.ts'), 'utf8');
const assetRegistrar = readFileSync(resolve(root, 'src/audio/product/host/CoreProductAssetRegistrar.ts'), 'utf8');
assert(telemetryTypes.includes('hostDecodedBytes?: number'), 'runtime telemetry must expose hostDecodedBytes');
assert(telemetryTypes.includes('inFlightDecodedBytes?: number'), 'runtime telemetry must expose inFlightDecodedBytes');
assert(telemetryTypes.includes('sonicAutonomyRevision?: number'), 'runtime telemetry must expose sonicAutonomyRevision');
assert(telemetryTypes.includes('sonicAutonomyFingerprint?: string'), 'runtime telemetry must expose sonicAutonomyFingerprint');
assert(
  (coreRuntime.match(/if \(!this\.isDocumentVisible\(\)\) return;/g) ?? []).length >= 2,
  'runtime must suppress in-flight telemetry and visual telemetry messages after the page hides',
);
assert(telemetryAdapter.includes('sonicAutonomyRevision'), 'host telemetry adapter must derive sonicAutonomyRevision');
assert(telemetryAdapter.includes('autonomyTracker.observe(telemetry)'), 'host telemetry adapter must track autonomy observations');
assert(telemetryAdapter.includes('sonicAutonomyFingerprint: autonomy.fingerprint'), 'host telemetry adapter must attach the autonomy fingerprint');
assert(autonomyFingerprint.includes('export function deriveCoreProductSonicAutonomyFingerprint'), 'host telemetry must derive the autonomy fingerprint');
assert(autonomyFingerprint.includes('export class CoreProductSonicAutonomyTracker'), 'host telemetry must retain a monotonic autonomy tracker');
assert(assetRegistrar.includes('hostDecodedBytes()'), 'asset registrar must expose retained host decoded bytes');
assert(assetRegistrar.includes('inFlightDecodedByteLength()'), 'asset registrar must expose in-flight decoded bytes');

const recorderFixtureDirectory = mkdtempSync(resolve(tmpdir(), 'kessho-mobile-evidence-'));
try {
  const fixturePath = resolve(recorderFixtureDirectory, 'valid.json');
  writeFileSync(fixturePath, `${JSON.stringify(validFixture())}\n`);
  execFileSync(process.execPath, [
    resolve(root, 'scripts/record-kessho-product-mobile-web-evidence.mjs'),
    `--input=${fixturePath}`,
    '--dry-run',
  ], { cwd: root, stdio: 'pipe' });

  writeFileSync(fixturePath, `${JSON.stringify(acceptanceFixture())}\n`);
  execFileSync(process.execPath, [
    resolve(root, 'scripts/record-kessho-product-mobile-web-evidence.mjs'),
    `--input=${fixturePath}`,
    '--dry-run',
  ], { cwd: root, stdio: 'pipe' });

  const invalidAcceptance = acceptanceFixture();
  invalidAcceptance.acceptance.hidden.maxAudibleGapMs = 21;
  writeFileSync(fixturePath, `${JSON.stringify(invalidAcceptance)}\n`);
  let invalidAcceptanceRecorderInputRejected = false;
  try {
    execFileSync(process.execPath, [
      resolve(root, 'scripts/record-kessho-product-mobile-web-evidence.mjs'),
      `--input=${fixturePath}`,
      '--dry-run',
    ], { cwd: root, stdio: 'pipe' });
  } catch {
    invalidAcceptanceRecorderInputRejected = true;
  }
  assert(invalidAcceptanceRecorderInputRejected, 'evidence recorder must reject failed Phase 9 hard gates before writing');

  let invalidAcceptanceCheckerInputRejected = false;
  try {
    readAndValidateMobileWebAudioEvidence(fixturePath);
  } catch {
    invalidAcceptanceCheckerInputRejected = true;
  }
  assert(invalidAcceptanceCheckerInputRejected, 'evidence checker must reject malformed acceptance data in non-strict mode');

  const invalidFixture = validFixture();
  invalidFixture.before.inFlightDecodedBytes = Number.POSITIVE_INFINITY;
  writeFileSync(fixturePath, `${JSON.stringify(invalidFixture)}\n`);
  let invalidRecorderInputRejected = false;
  try {
    execFileSync(process.execPath, [
      resolve(root, 'scripts/record-kessho-product-mobile-web-evidence.mjs'),
      `--input=${fixturePath}`,
      '--dry-run',
    ], { cwd: root, stdio: 'pipe' });
  } catch {
    invalidRecorderInputRejected = true;
  }
  assert(invalidRecorderInputRejected, 'evidence recorder must reject invalid input before writing');
} finally {
  rmSync(recorderFixtureDirectory, { recursive: true, force: true });
}
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence:record'] ===
    'node scripts/record-kessho-product-mobile-web-evidence.mjs',
  'package.json must expose core:product:mobile-web-evidence:record',
);

const requireBaseline = process.argv.includes('--require-baseline');
const requireAcceptance = process.argv.includes('--require-acceptance');
const milestoneArgument = process.argv.find((arg) => arg.startsWith('--milestone='));
const acceptanceMilestone = milestoneArgument?.slice('--milestone='.length) ?? 'advanced';
const requestedPaths = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const discoveredPaths = existsSync(reportDirectory)
  ? readdirSync(reportDirectory)
      .filter((name) => /^kessho-mobile-web-audio-evidence-(?!latest\.json$).+\.json$/.test(name))
      .map((name) => resolve(reportDirectory, name))
  : [];
const paths = requestedPaths.length > 0
  ? requestedPaths.map((path) => resolve(root, path))
  : discoveredPaths;

const captures = paths.map((path) => ({
  path,
  evidence: readAndValidateMobileWebAudioEvidence(path),
}));

if (requireBaseline) {
  validateMobileWebAudioBaselineMatrix(
    captures.map(({ evidence }) => evidence),
    'strict baseline',
  );
}
if (requireAcceptance) {
  validateMobileWebAudioAcceptanceMatrix(
    captures.filter(({ evidence }) => evidence.acceptance !== undefined).map(({ evidence }) => evidence),
    'strict phase 9 acceptance',
    acceptanceMilestone,
  );
}

console.log(
  `Kessho mobile web audio evidence checker passed ` +
  `(${paths.length} physical-device capture${paths.length === 1 ? '' : 's'} validated` +
  `${requireBaseline ? '; strict two-device baseline complete' : ''}` +
  `${requireAcceptance ? `; strict ${acceptanceMilestone} phase 9 acceptance complete` : ''})`,
);
