// Exports engine snapshots (native KesshoProductSnapshotV2 bytes) for the
// arrangement event statistics fixture. See
// cpp/KesshoCore/tests/ProductArrangementStatisticsTests.cpp for the consumer.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Asset URL resolution touches window.location; the soundscape source is not
// relevant to arrangement statistics, so a minimal stub is enough under Node.
(globalThis as { window?: unknown }).window ??= { location: { origin: 'http://localhost' } };
// Snapshot seeds include the current UTC hour or day (getUtcBucket), so pin the
// clock to the hour the fixture was recorded in to keep the snapshots stable.
const FIXTURE_CLOCK_MS = Date.parse('2026-11-24T16:30:00Z');
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args: ConstructorParameters<DateConstructor> | []) {
    if (args.length === 0) super(FIXTURE_CLOCK_MS);
    else super(...(args as ConstructorParameters<DateConstructor>));
  }
  static now(): number {
    return FIXTURE_CLOCK_MS;
  }
} as DateConstructor;
const { completeCanonicalPresetState } = await import('../../src/presets/presetStateCompatibility');
const { createCoreProductSnapshot } = await import('../../src/audio/coreProductSnapshot');
const { encodeCoreProductSnapshot } = await import('../../src/audio/coreProductSnapshotEncoder');

// 256 phrases: an 8-phrase capture was a single noisy sample (the old engine
// failed its own fixture for every other seed); this keeps seed noise inside
// tolerance while real parameter changes still drift.
const PHRASES_TO_RENDER = 256;
const outDir = resolve(process.env.KESSHO_M1_FIXTURE_DIR ?? 'build/m1-fixtures');
const asset = JSON.parse(readFileSync(resolve('public/presets/StringWaves.json'), 'utf8')) as {
  state: Record<string, unknown>;
};
const baseState = completeCanonicalPresetState(asset.state) as Record<string, unknown>;

const cases: Array<{ name: string; overrides: Record<string, unknown> }> = [
  { name: 'string-waves', overrides: {} },
  { name: 'string-waves-chords-only', overrides: { leadRandomEnabled: false } },
  { name: 'string-waves-notes-only', overrides: { synthChordGeneratorEnabled: false } },
  { name: 'string-waves-beat-clock', overrides: { leadRandomClockSource: 'globalBeat', transportPrimaryClock: 'bpm', sequencerMasterBPM: 90 } },
];

mkdirSync(outDir, { recursive: true });
const manifest: Array<{ name: string; renderSeconds: number; phraseSeconds: number }> = [];
for (const entry of cases) {
  const snapshot = createCoreProductSnapshot({ ...baseState, ...entry.overrides });
  snapshot.transport.running = true;
  const phraseSeconds = snapshot.transport.phraseSeconds;
  const bytes = encodeCoreProductSnapshot(snapshot);
  writeFileSync(resolve(outDir, `${entry.name}.snapshot.bin`), Buffer.from(bytes));
  manifest.push({ name: entry.name, renderSeconds: phraseSeconds * PHRASES_TO_RENDER, phraseSeconds });
  const [chordLane, notesLane] = snapshot.synthLanes.slice(4, 6);
  console.log(`exported ${entry.name}: ${bytes.byteLength} bytes, phrase ${phraseSeconds}s, randomChords=${chordLane?.enabled} randomNotes=${notesLane?.enabled} notesPhrase=${notesLane?.random.phraseSeconds} bpm=${snapshot.transport.bpm}`);
}
writeFileSync(resolve(outDir, 'cases.json'), JSON.stringify({ cases: manifest }, null, 2) + '\n');
