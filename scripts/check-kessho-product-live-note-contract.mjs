import fs from 'node:fs';

const contract = fs.readFileSync('src/audio/product/liveNoteEvents.ts', 'utf8');
const adapter = fs.readFileSync('src/native/midi/midiLiveNoteAdapter.ts', 'utf8');
const port = fs.readFileSync('src/audio/product/ProductEnginePort.ts', 'utf8');
const checks = {
  contract: contract.includes('ProductLiveNoteEvent') && contract.includes('live-note-on') && contract.includes('live-note-off'),
  adapter: adapter.includes('midiMessageToProductLiveNoteEvent'),
  port: port.includes('enqueueLiveNoteEvent?'),
  noSnapshot: !adapter.includes('Snapshot') && !contract.includes('Snapshot'),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`live note contract check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('live note contract check passed');
