import fs from 'node:fs';

const source = fs.readFileSync('src/native/midi/midiMappableParams.ts', 'utf8');
const report = {
  generatedAt: new Date().toISOString(),
  checks: {
    derivesFromDefaultState: source.includes('Object.keys(DEFAULT_STATE)'),
    usesParamInfo: source.includes('getParamInfo(key)'),
    exportsCatalog: source.includes('MIDI_MAPPABLE_PARAMS'),
    excludesStructural: source.includes('EXCLUDED_KEY_PATTERNS'),
  },
};

const failed = Object.entries(report.checks).filter(([, ok]) => !ok);
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/kessho-midi-mappable-params-latest.json', `${JSON.stringify(report, null, 2)}\n`);

if (failed.length) {
  console.error(`midi mappable params check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log('midi mappable params check passed');
