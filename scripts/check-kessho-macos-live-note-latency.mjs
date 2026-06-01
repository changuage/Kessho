import fs from 'node:fs';

const report = {
  platform: 'macos',
  evidenceMode: 'static',
  generatedAt: new Date().toISOString(),
  sampleRate: 48000,
  bufferSizeFrames: 128,
  actualBufferDurationMs: 0,
  eventCount: 0,
  medianEventToRenderMs: 0,
  p95EventToRenderMs: 0,
  maxEventToRenderMs: 0,
  droppedMidiEventCount: 0,
  underrunCount: 0,
  notes: [
    'Static architecture gate only. Physical/controller latency evidence remains pending.',
    'Realtime audio buffers are not sent over the JavaScript bridge.',
  ],
};

const swift = fs.readFileSync('CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift', 'utf8');
const adapter = fs.readFileSync('src/native/midi/midiLiveNoteAdapter.ts', 'utf8');
const checks = {
  noBridgeAudioBuffers: !swift.includes('audioBuffer') && !adapter.includes('audioBuffer'),
  liveNoteAdapter: adapter.includes('ProductLiveNoteEvent'),
  hostTimestamp: swift.includes('timestampHostTime') || swift.includes('timeStamp'),
};
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/kessho-macos-live-note-latency-latest.json', `${JSON.stringify({ ...report, checks }, null, 2)}\n`);

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`macos live note latency prep failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('macos live note latency prep passed');
