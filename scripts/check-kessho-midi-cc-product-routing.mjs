import fs from 'node:fs';

const adapter = fs.readFileSync('src/native/midi/midiParameterEventAdapter.ts', 'utf8');
const provider = fs.readFileSync('src/ui/midiLearn/MidiLearnProvider.tsx', 'utf8');
const checks = {
  adapterExists: adapter.includes('dispatchMidiMappedParameterUpdate'),
  productPatchReason: adapter.includes('midi-cc-control-change'),
  noFullSnapshot: !adapter.includes('loadSnapshot') && !provider.includes('loadSnapshot'),
  routesBindings: provider.includes('routeMidiMessageToParameter'),
  noRealtimeBuffers: !provider.includes('audioBuffer') && !adapter.includes('audioBuffer'),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`midi cc product routing check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('midi cc product routing check passed');
