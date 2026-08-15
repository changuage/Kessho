#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const contractPath = resolve(reportDir, 'kessho-product-level-calibration-contract.json');
const jsonPath = resolve(reportDir, 'kessho-product-level-calibration-latest.json');
const markdownPath = resolve(reportDir, 'kessho-product-level-calibration-latest.md');
const binaryPath = resolve(root, 'build/kessho-core/product-tests/ProductGainStagingValidationTests');
const calibrationCommand = [process.execPath, 'scripts/run-kessho-product-cpp-test.mjs', 'ProductGainStagingValidationTests'];
// Keep checked-in evidence portable: execution uses absolute paths internally, but
// reports must be reproducible from any checkout rather than naming this host.
const calibrationDisplayCommand = 'node scripts/run-kessho-product-cpp-test.mjs ProductGainStagingValidationTests';
const repeatDisplayCommand = './build/kessho-core/product-tests/ProductGainStagingValidationTests';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return { status: result.status, output };
}

function portableOutput(output) {
  return output.replaceAll(root, '.').replaceAll(process.execPath, 'node');
}

function parseFixture(output, label) {
  const match = output.match(/KESSHO_PRODUCT_LEVEL_CALIBRATION_JSON=(\{[^\n]+\})/);
  if (!match) throw new Error(`${label} did not emit KESSHO_PRODUCT_LEVEL_CALIBRATION_JSON`);
  return JSON.parse(match[1]);
}

function finitePositive(value, label, failures) {
  if (!Number.isFinite(value) || value <= 0) failures.push(`${label} must be finite and positive (got ${value})`);
}

function rmsAt(fixture, path) {
  if (fixture.fx?.[path]) return fixture.fx[path].rms;
  const source = fixture.sources?.find((entry) => entry.name === path);
  if (source) return source.rms;
  const parts = path.split('.');
  let value = fixture;
  for (const part of parts) value = value?.[part];
  return value?.rms;
}

function hashes(fixture) {
  const entries = [];
  const add = (path, value) => entries.push([path, value]);
  for (const source of fixture.sources) add(`sources.${source.name}`, source.hash);
  for (const path of ['drums.master', 'drums.dry', 'drums.pre_limiter', 'earth.master', 'earth.water_dry', 'headroom.pre_limiter', 'headroom.output']) {
    add(path, path.split('.').reduce((value, part) => value?.[part], fixture)?.hash);
  }
  for (const name of Object.keys(fixture.fx)) add(`fx.${name}`, fixture.fx[name].hash);
  return Object.fromEntries(entries);
}

function dbDelta(actual, expected) {
  return 20 * Math.log10(actual / expected);
}

function checkRms(fixture, expected, toleranceDb, group, failures) {
  for (const [path, target] of Object.entries(expected)) {
    const actual = rmsAt(fixture, path);
    finitePositive(actual, `${group} ${path} RMS`, failures);
    finitePositive(target, `${group} ${path} contract RMS`, failures);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(target) || target <= 0) continue;
    const delta = dbDelta(actual, target);
    if (Math.abs(delta) > toleranceDb) {
      failures.push(`${group} ${path} is ${delta.toFixed(3)} dB from contract (limit ±${toleranceDb} dB)`);
    }
  }
}

function runCalibration() {
  const first = run(calibrationCommand[0], calibrationCommand.slice(1));
  if (first.status !== 0) throw new Error(`calibration fixture command failed:\n${portableOutput(first.output.slice(-12000))}`);
  const firstFixture = parseFixture(first.output, 'calibration fixture');
  if (!existsSync(binaryPath)) throw new Error(`calibration binary was not produced: ${repeatDisplayCommand}`);
  const second = run(binaryPath, []);
  if (second.status !== 0) throw new Error(`calibration repeat command failed:\n${portableOutput(second.output.slice(-12000))}`);
  return {
    fixture: firstFixture,
    repeat: parseFixture(second.output, 'calibration repeat'),
    output: first.output,
    repeatOutput: second.output,
  };
}

const failures = [];
let contract;
let calibration;
try {
  contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  calibration = runCalibration();
  const fixture = calibration.fixture;
  if (fixture.schema !== 'kessho-product-level-calibration-v1') failures.push(`unexpected fixture schema ${fixture.schema}`);
  if (fixture.sample_rate !== contract.sampleRate || fixture.block_size !== contract.blockSize) {
    failures.push(`fixture format ${fixture.sample_rate}/${fixture.block_size} does not match contract ${contract.sampleRate}/${contract.blockSize}`);
  }
  if (fixture.source_tolerance_db !== contract.sourceToleranceDb || fixture.fx_structural_tolerance_db !== contract.fxStructuralToleranceDb) {
    failures.push('fixture-declared tolerances do not match the checked-in contract');
  }
  if (fixture.pre_limiter_peak_ceiling !== contract.preLimiterPeakCeiling ||
      fixture.limiter_inactivity_epsilon_db !== contract.limiterInactivityEpsilonDb) {
    failures.push('fixture-declared headroom thresholds do not match the checked-in contract');
  }
  checkRms(fixture, contract.sourceRms, contract.sourceToleranceDb, 'source', failures);
  checkRms(fixture, contract.fxRms, contract.fxStructuralToleranceDb, 'FX structural', failures);
  const fixtureHashes = hashes(fixture);
  const repeatHashes = hashes(calibration.repeat);
  for (const [path, hash] of Object.entries(fixtureHashes)) {
    if (typeof hash !== 'string' || typeof repeatHashes[path] !== 'string') {
      failures.push(`determinism hash missing for ${path}`);
      continue;
    }
    if (repeatHashes[path] !== hash) failures.push(`determinism hash changed for ${path}`);
  }
  const headroom = fixture.headroom;
  if (!Number.isFinite(headroom.pre_limiter.peak) || headroom.pre_limiter.peak > contract.preLimiterPeakCeiling) {
    failures.push(`headroom pre-limiter peak ${headroom.pre_limiter.peak} exceeds ${contract.preLimiterPeakCeiling}`);
  }
  if (!Number.isFinite(headroom.max_limiter_gain_reduction_db) || headroom.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`headroom limiter reduction ${headroom.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
  if (!Number.isFinite(fixture.drums.pre_limiter.peak) || fixture.drums.pre_limiter.peak > contract.preLimiterPeakCeiling) {
    failures.push(`drum nominal pre-limiter peak ${fixture.drums.pre_limiter.peak} (RMS ${fixture.drums.pre_limiter.rms}, limiter GR ${fixture.drums.max_limiter_gain_reduction_db} dB) exceeds ${contract.preLimiterPeakCeiling}`);
  }
  if (!Number.isFinite(fixture.drums.max_limiter_gain_reduction_db) || fixture.drums.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`drum limiter reduction ${fixture.drums.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
  if (!Number.isFinite(fixture.earth.max_limiter_gain_reduction_db) || fixture.earth.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`Earth limiter reduction ${fixture.earth.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

const report = {
  schema: 'kessho-product-level-calibration-report-v1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  contract: contract ?? null,
  fixture: calibration?.fixture ?? null,
  repeatFixture: calibration?.repeat ?? null,
  deterministicHashes: calibration ? hashes(calibration.fixture) : null,
  commands: {
    calibration: calibrationDisplayCommand,
    repeat: repeatDisplayCommand,
  },
  failures,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const fixture = report.fixture;
const lines = [
  '# Kessho Product Level Calibration',
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  'Commands:',
  '',
  `- \`${calibrationDisplayCommand}\` (build + deterministic fixture)`,
  `- \`${repeatDisplayCommand}\` (same binary, repeat/hash check)`,
  '- CI integration: `core:product:level-calibration` is a prerequisite in `scripts/run-kessho-product-ci.mjs`, reached by `.github/workflows/product-core-ci.yml` through `npm run core:product:ci:prereqs`.',
  '',
  'Thresholds:',
  '',
  `- Source RMS tolerance: ±${contract?.sourceToleranceDb ?? '?'} dB against the checked-in representative fixtures (Pad, Lead, fixed-asset Piano, two-bar drums, and Soundscape/Earth).`,
  `- FX structural tolerance: ±${contract?.fxStructuralToleranceDb ?? '?'} dB for the measured fixed-input Delay A/B, Granular, and Reverb branches; focused FX routing tests cover the other nodes.`,
  `- Pre-limiter peak ceiling: ${contract?.preLimiterPeakCeiling ?? '?'} linear; limiter inactivity epsilon: ${contract?.limiterInactivityEpsilonDb ?? '?'} dB.`,
  '- The two-bar drum fixture is nominal-level evidence: its pre-limiter peak and limiter reduction are checked independently, so a clipped/baseline-locked drum pattern cannot pass.',
  '- CPU regression is enforced by the adjacent `core:product:cpu` prerequisite in the same Product CI graph; this standalone level gate does not duplicate that compilation/run.',
  '',
];
if (fixture) {
  lines.push('| Fixture | RMS | Peak |');
  lines.push('| --- | ---: | ---: |');
  for (const source of fixture.sources) lines.push(`| ${source.name} | ${source.rms.toExponential(6)} | ${source.peak.toExponential(6)} |`);
  for (const path of ['drums.master', 'drums.dry', 'drums.pre_limiter', 'earth.master', 'earth.water_dry']) {
    const value = path.split('.').reduce((entry, part) => entry?.[part], fixture);
    lines.push(`| ${path} | ${value.rms.toExponential(6)} | ${value.peak.toExponential(6)} |`);
  }
  lines.push('', '| FX branch | RMS | Peak |', '| --- | ---: | ---: |');
  for (const [name, value] of Object.entries(fixture.fx)) lines.push(`| ${name} | ${value.rms.toExponential(6)} | ${value.peak.toExponential(6)} |`);
  lines.push('', `Drum pre-limiter peak: ${fixture.drums.pre_limiter.peak.toExponential(6)}; drum limiter reduction: ${fixture.drums.max_limiter_gain_reduction_db.toFixed(6)} dB.`);
  lines.push(`Headroom pre-limiter peak: ${fixture.headroom.pre_limiter.peak.toExponential(6)}; limiter reduction: ${fixture.headroom.max_limiter_gain_reduction_db.toFixed(6)} dB.`);
}
if (failures.length > 0) lines.push('', 'Failures:', '', ...failures.map((failure) => `- ${failure}`));
writeFileSync(markdownPath, `${lines.join('\n')}\n`);

if (failures.length > 0) {
  console.error(`Kessho Product level calibration failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Kessho Product level calibration passed (contract, deterministic hashes, headroom, limiter epsilon)');
