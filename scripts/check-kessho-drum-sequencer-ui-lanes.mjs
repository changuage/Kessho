import { readFileSync } from 'node:fs';

const source = readFileSync('src/ui/drums/DrumPage.tsx', 'utf8');

for (const key of [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
  'drumEuclid5Enabled',
  'drumEuclid6Enabled',
]) {
  if (!source.includes(key)) {
    console.error(`Missing drum lane key in DrumPage: ${key}`);
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

console.log('Drum sequencer UI lane guard passed');
