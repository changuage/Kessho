import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const grep = spawnSync(
  'git',
  [
    'grep',
    '-nE',
    'PRODUCT_VISIBLE_LANE_COUNT|drumVisibleLaneCount[^\\n]*4|DRUM_SEQUENCER_LANE_COUNT[^\\n]*= 4|DRUM_EUCLIDEAN_LANE_COUNT[^\\n]*= 4',
    '--',
    'src',
    'scripts',
    'cpp',
    ':!scripts/check-kessho-sequencer-lane-count-guards.mjs',
    ':!scripts/check-kessho-drum-sequencer-ui-lanes.mjs',
  ],
  {
    cwd: root,
    encoding: 'utf8',
  },
);

if (grep.status === 0 && grep.stdout.trim()) {
  console.error('Forbidden hard-coded drum 4-lane assumption found:\n');
  console.error(grep.stdout);
  process.exit(1);
}

if (grep.status !== 0 && grep.status !== 1) {
  console.error(grep.stderr || grep.stdout);
  process.exit(grep.status ?? 1);
}

const countsSource = readFileSync(join(root, 'src/audio/sequencerLaneCounts.ts'), 'utf8');
for (const required of [
  'SYNTH_EUCLIDEAN_LANE_COUNT = 4',
  'DRUM_EUCLIDEAN_LANE_COUNT = 6',
]) {
  if (!countsSource.includes(required)) {
    console.error(`Missing required sequencer lane-count declaration: ${required}`);
    process.exit(1);
  }
}

console.log('Sequencer lane-count guard passed');
