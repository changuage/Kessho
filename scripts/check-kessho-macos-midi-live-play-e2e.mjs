import fs from 'node:fs';

const files = [
  'src/ui/midiLearn/MidiLearnProvider.tsx',
  'src/native/midi/midiRoutingLearn.ts',
  'src/native/midi/midiParameterEventAdapter.ts',
  'src/native/midi/midiLiveNoteAdapter.ts',
];
const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const checks = {
  learnCcToSlider: text.includes('createMidiBindingFromCapturedSourceAndSlider') && text.includes('notifySliderDrag'),
  ccParameterPath: text.includes('dispatchMidiMappedParameterUpdate'),
  liveNotePath: text.includes('midiMessageToProductLiveNoteEvent'),
  noFullSnapshot: !text.includes('loadSnapshot') && !text.includes('applySnapshot'),
  noAudioBuffersBridge: !text.includes('audioBuffer'),
};
const report = { generatedAt: new Date().toISOString(), evidenceMode: 'static-e2e-architecture', checks };
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/kessho-macos-midi-live-play-e2e-latest.json', `${JSON.stringify(report, null, 2)}\n`);

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`macos midi live-play e2e prep failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('macos midi live-play e2e prep passed');
