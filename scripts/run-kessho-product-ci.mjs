import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const skipFinalGate = process.argv.includes('--skip-final-gate');
const reportPath = resolve(root, 'docs/reports/kessho-product-ci-latest.json');

const prerequisiteSteps = [
  'core:product:generate',
  'type-check',
  'build',
  'core:product:schema',
  'core:product:workflow',
  'core:product:architecture',
  'migration:product-boundary',
  'architecture:web-tsx-reachability',
  'architecture:budget:strict',
  'architecture:runtime-scheduler',
  'test:preset-current-schema',
  'test:preset-manager-query-ownership',
  'test:document-visibility',
  'test:live-note-input',
  'core:product:live-note-contract',
  'test:generated-sequencer-capture',
  'core:product:background-audio',
  'core:product:background-audio-docs',
  'core:product:running-sequencer-live-updates',
  'migration:docs',
  'migration:no-web-ts-bundle',
  'core:product:sequencer-lane-count',
  'core:product:sequencer-ui-lane-count',
  'core:product:sequencer-visual-lane-count',
  'core:product:sequencer-lane-count-guards',
  'test:preset-exact-load',
  'test:preset-dedup',
  'test:preset-sequencer-hash-coverage',
  'test:product-snapshot-policy',
  'core:product:patch-bridges',
  'core:product:snapshot-authority',
  'core:product:snapshot-regression',
  'core:product:host-reconciliation',
  'core:product:dirty-diff',
  'core:product:runtime-fallbacks',
  'core:product:getter-policies',
  'core:product:reference-isolation',
  'core:product:runtime-selection-isolation',
  'core:product:legacy-boundary',
  'core:product:no-temporary-runtime-compat',
  'migration:unsupported-surface:gate',
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
  'core:product:granular-artifacts',
  'core:product:reverb-tail-quality',
  'core:product:web-cpu-comparison',
  'core:product:page-cpu-before-after',
  'core:product:module-cpu',
  'core:product:cpu-scenarios',
];

const finalGateStep = 'core:product:default-gate-v3';
const expectedSteps = skipFinalGate ? prerequisiteSteps : [...prerequisiteSteps, finalGateStep];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  command: [process.execPath, 'scripts/run-kessho-product-ci.mjs', ...process.argv.slice(2)].join(' '),
  mode: skipFinalGate ? 'prerequisites-only' : 'full-with-final-gate',
  finalGateStep,
  finalGateSkipped: skipFinalGate,
  prerequisiteSteps,
  expectedSteps,
  steps: [],
  summary: {
    status: 'running',
    passed: 0,
    failed: 0,
    skippedFinalGate: skipFinalGate,
  },
};

function writeReport() {
  report.updatedAt = new Date().toISOString();
  report.summary.passed = report.steps.filter((step) => step.status === 'pass').length;
  report.summary.failed = report.steps.filter((step) => step.status === 'fail').length;
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

writeReport();

for (const step of prerequisiteSteps) {
  const label = `npm run ${step}`;
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::group::${label}`);
  }
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const result = spawnSync('npm', ['run', step], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  const finishedAt = new Date().toISOString();
  const status = result.status === 0 ? 'pass' : 'fail';
  report.steps.push({
    step,
    label,
    status,
    startedAt,
    finishedAt,
    durationMs: Math.round(performance.now() - startMs),
    exitCode: result.status,
    signal: result.signal,
  });
  report.summary.status = status === 'fail' ? 'fail' : 'running';
  writeReport();
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log('::endgroup::');
  }
  if (result.status !== 0) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(`::error title=Product Core CI failed::${label} exited with code ${result.status ?? 'unknown'}`);
    }
    process.exit(result.status ?? 1);
  }
}

report.summary.status = 'pass';
writeReport();

if (!skipFinalGate) {
  const step = finalGateStep;
  const label = `npm run ${step}`;
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::group::${label}`);
  }
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const result = spawnSync('npm', ['run', step], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  const finishedAt = new Date().toISOString();
  report.steps.push({
    step,
    label,
    status: result.status === 0 ? 'pass' : 'fail',
    startedAt,
    finishedAt,
    durationMs: Math.round(performance.now() - startMs),
    exitCode: result.status,
    signal: result.signal,
  });
  report.summary.status = result.status === 0 ? 'pass' : 'fail';
  writeReport();
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log('::endgroup::');
  }
  if (result.status !== 0) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(`::error title=Product Core final gate failed::${label} exited with code ${result.status ?? 'unknown'}`);
    }
    process.exit(result.status ?? 1);
  }
}
