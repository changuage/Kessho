import { spawnSync } from 'node:child_process';

const steps = [
  'core:product:generate',
  'core:product:schema',
  'core:product:workflow',
  'core:product:architecture',
  'core:product:patch-bridges',
  'core:product:snapshot-authority',
  'core:product:host-reconciliation',
  'core:product:dirty-diff',
  'core:product:runtime-fallbacks',
  'core:product:placeholder-getters',
  'core:product:reference-isolation',
  'core:product:abi',
  'core:build:wasm',
  'core:product:wasm',
  'core:product:determinism',
  'core:product:sequencer',
  'core:product:harmony',
  'core:product:graph',
  'core:product:fx',
  'core:product:fx-depth',
  'core:product:asset-manifest',
  'core:product:sources',
  'core:product:assets',
  'core:product:source-parity',
  'core:product:web-host',
  'core:product:native',
  'core:product:native-release',
  'core:product:default-gate-v2',
  'core:product:cpu',
];

for (const step of steps) {
  const label = `npm run ${step}`;
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::group::${label}`);
  }
  const result = spawnSync('npm', ['run', step], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
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
