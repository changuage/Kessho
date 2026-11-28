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

// Native runs six synth lanes (Random is a lane mode); the authored TS lane
// count stays at four until the six-slot TS state lands.
const nativeState = readFileSync(join(root, 'cpp/KesshoCore/src/product/ProductState.h'), 'utf8');
if (!/uint32_t synth_lane_count = 6;/.test(nativeState)) {
  console.error('Native synth_lane_count must be 6 (ProductState.h)');
  process.exit(1);
}
const faceState = readFileSync(join(root, 'cpp/KesshoCore/src/product/ProductSequencerFaceState.h'), 'utf8');
if (!faceState.includes('kSequencerModeRandom = 3u')) {
  console.error('Native kSequencerModeRandom = 3u declaration is missing (ProductSequencerFaceState.h)');
  process.exit(1);
}
const randomLanes = readFileSync(join(root, 'src/audio/coreProductArrangementSnapshot.ts'), 'utf8');
if (!randomLanes.includes('RANDOM_NOTES_TRANSITIONAL_LANE_INDEX = 5')) {
  console.error('Transitional Random lanes must occupy native lanes 5 and 6');
  process.exit(1);
}

console.log('Sequencer lane-count guard passed');
