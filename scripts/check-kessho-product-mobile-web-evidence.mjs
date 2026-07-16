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
      durationMinutes: 60,
      lockedMinutes: 60,
      appSwitchedMinutes: 0,
    },
    before: Object.fromEntries(MOBILE_WEB_AUDIO_METRICS.map((metric) => [metric, 0])),
  };
}

function acceptanceFixture() {
  const fixture = validFixture();
  fixture.after = structuredClone(fixture.before);
  fixture.acceptance = {
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
  fixture.scenario.durationMinutes = 59;
  fixture.scenario.lockedMinutes = 59;
}, '60');
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
assertAcceptanceRejected((fixture) => { fixture.acceptance.hidden.hiddenUiCallbackCount = 1; }, 'hiddenUiCallbackCount');
assertAcceptanceRejected((fixture) => { fixture.acceptance.warmedHeapSecondCycleBytes += 1; }, 'high-water mark');
assertAcceptanceRejected((fixture) => { fixture.after.assetMissingCount = 1; }, 'assetMissingCount');

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
      for (const output of ['speaker', 'wired', 'bluetooth']) {
        const fixture = validFixture();
        fixture.device.model = model;
        fixture.device.browser = browser;
        fixture.scenario.output = output;
        fixtures.push(fixture);
      }
    }
  }
  return fixtures;
}

const completeFixtures = completeBaselineFixtures();
for (const fixture of completeFixtures) validateMobileWebAudioEvidence(fixture, 'matrix self-test');
validateMobileWebAudioBaselineMatrix(completeFixtures, 'matrix self-test');
let incompleteMatrixRejected = false;
try {
  validateMobileWebAudioBaselineMatrix(completeFixtures.slice(0, -1), 'matrix self-test');
} catch (error) {
  incompleteMatrixRejected = String(error).includes('bluetooth');
}
assert(incompleteMatrixRejected, 'strict matrix must reject a missing browser/output capture');

function completeAcceptanceFixtures() {
  const fixtures = [];
  for (const model of ['iPhone 11', 'iPhone 17 Pro']) {
    for (const browser of ['safari', 'chrome', 'home-screen']) {
      const visible = acceptanceFixture();
      visible.device.model = model;
      visible.device.browser = browser;
      visible.scenario.kind = model === 'iPhone 11' ? 'highest-cpu-visible' : 'default-visible';
      visible.scenario.durationMinutes = 60;
      visible.scenario.lockedMinutes = 0;
      delete visible.acceptance.hidden;
      fixtures.push(visible);

      const appSwitch = acceptanceFixture();
      appSwitch.device.model = model;
      appSwitch.device.browser = browser;
      appSwitch.scenario.kind = 'app-switch';
      appSwitch.scenario.durationMinutes = 60;
      appSwitch.scenario.lockedMinutes = 0;
      appSwitch.scenario.appSwitchedMinutes = 60;
      fixtures.push(appSwitch);

      for (const output of ['speaker', 'bluetooth']) {
        const locked = acceptanceFixture();
        locked.device.model = model;
        locked.device.browser = browser;
        locked.scenario.output = output;
        fixtures.push(locked);
      }
    }
  }
  return fixtures;
}

const completeAcceptance = completeAcceptanceFixtures();
validateMobileWebAudioAcceptanceMatrix(completeAcceptance, 'acceptance matrix self-test');
let incompleteAcceptanceRejected = false;
try {
  validateMobileWebAudioAcceptanceMatrix(completeAcceptance.slice(0, -1), 'acceptance matrix self-test');
} catch (error) {
  incompleteAcceptanceRejected = String(error).includes('bluetooth');
}
assert(incompleteAcceptanceRejected, 'acceptance matrix must reject a missing physical row');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence'] ===
    'node scripts/check-kessho-product-mobile-web-evidence.mjs',
  'package.json must expose core:product:mobile-web-evidence',
);
assert(
  packageJson.scripts?.['core:product:mobile-web-evidence:acceptance'] ===
    'node scripts/check-kessho-product-mobile-web-evidence.mjs --require-acceptance',
  'package.json must expose core:product:mobile-web-evidence:acceptance',
);

const telemetryTypes = readFileSync(resolve(root, 'src/audio/coreProductTelemetry.ts'), 'utf8');
const assetRegistrar = readFileSync(resolve(root, 'src/audio/product/host/CoreProductAssetRegistrar.ts'), 'utf8');
assert(telemetryTypes.includes('hostDecodedBytes?: number'), 'runtime telemetry must expose hostDecodedBytes');
assert(telemetryTypes.includes('inFlightDecodedBytes?: number'), 'runtime telemetry must expose inFlightDecodedBytes');
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
  );
}

console.log(
  `Kessho mobile web audio evidence checker passed ` +
  `(${paths.length} physical-device capture${paths.length === 1 ? '' : 's'} validated` +
  `${requireBaseline ? '; strict two-device baseline complete' : ''}` +
  `${requireAcceptance ? '; strict phase 9 acceptance complete' : ''})`,
);
