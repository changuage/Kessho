import fs from 'node:fs';

const files = [
  'src/native/midi/midiRoutingProfile.ts',
  'src/native/midi/midiRoutingStore.ts',
  'src/native/midi/midiRoutingLearn.ts',
  'src/native/midi/midiRoutingConflicts.ts',
];

const contents = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const checks = {
  v2StorageKey: contents['src/native/midi/midiRoutingProfile.ts'].includes('kessho.capacitorMidiRouting.v2'),
  v1Migration: contents['src/native/midi/midiRoutingProfile.ts'].includes('migrateMidiRoutingProfileV1ToV2'),
  importExport: contents['src/native/midi/midiRoutingProfile.ts'].includes('exportMidiRoutingProfile') && contents['src/native/midi/midiRoutingProfile.ts'].includes('importMidiRoutingProfile'),
  persistence: contents['src/native/midi/midiRoutingStore.ts'].includes('localStorage'),
  conflicts: contents['src/native/midi/midiRoutingConflicts.ts'].includes('duplicate-source'),
  learnHelper: contents['src/native/midi/midiRoutingLearn.ts'].includes('createMidiBindingFromCapturedSourceAndSlider'),
};

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`midi routing profile check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log('midi routing profile check passed');
