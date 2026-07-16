import { readFileSync } from 'node:fs';

const source = readFileSync('src/ui/drums/DrumPage.tsx', 'utf8');
const laneCountsSource = readFileSync('src/audio/sequencerLaneCounts.ts', 'utf8');
const transportPolicySource = readFileSync('src/ui/sequencer/sequencerTransportPolicy.ts', 'utf8');

if (!laneCountsSource.includes('DRUM_EUCLIDEAN_LANE_COUNT = 6')) {
  console.error('Shared drum sequencer lane count must remain six');
  process.exit(1);
}

for (const key of [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
]) {
  if (!transportPolicySource.includes(key)) {
    console.error(`Missing drum lane key in sequencer transport policy: ${key}`);
    process.exit(1);
  }
}

if (source.includes('DRUM_SEQUENCER_LANE_COUNT = 4') || source.includes('DRUM_EUCLIDEAN_LANE_COUNT = 4')) {
  console.error('DrumPage contains a 4-lane drum sequencer assumption');
  process.exit(1);
}

if (!source.includes("from '../../audio/sequencerLaneCounts'")) {
  console.error('DrumPage must import the shared drum lane count');
  process.exit(1);
}

if (!source.includes('Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }')) {
  console.error('DrumPage must derive its lane arrays from the shared drum lane count');
  process.exit(1);
}

if (!source.includes('DRUM_LANE_ENABLED_KEYS')) {
  console.error('DrumPage must use the canonical drum lane enable keys');
  process.exit(1);
}

console.log('Drum sequencer UI lane guard passed');
