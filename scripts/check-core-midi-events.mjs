import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-core/midi');
const sourcePath = resolve(root, 'src/audio/coreMidiEvents.ts');
const outputPath = resolve(buildDir, 'coreMidiEvents.mjs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const transpiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: sourcePath,
});
writeFileSync(outputPath, transpiled.outputText);

const {
  midiSampleOffset,
  toKesshoCoreMidiEventPayload,
} = await import(pathToFileURL(outputPath).href);

const noteOn = toKesshoCoreMidiEventPayload(
  {
    timestamp: 10.01,
    kind: 'noteOn',
    status: 0x90,
    channel: 0,
    data1: 60,
    data2: 100,
    rawBytes: [0x90, 60, 100],
    endpointUniqueID: -7,
    endpointName: 'Fixture',
  },
  {
    sampleRate: 48000,
    currentTimeSeconds: 0,
    timestampOriginSeconds: 10,
  },
);

assert(noteOn.sampleOffset === 480, `expected 480-sample offset, got ${noteOn.sampleOffset}`);
assert(noteOn.sourceId === 7, 'endpoint unique ID should normalize to unsigned source id');
assert(noteOn.status === 0x90, 'note status mismatch');
assert(noteOn.channel === 0, 'note channel mismatch');
assert(noteOn.data1 === 60, 'note data1 mismatch');
assert(noteOn.data2 === 100, 'note data2 mismatch');
assert(Math.abs(noteOn.normalizedValue - 100 / 127) < 1.0e-7, 'note normalized value mismatch');
assert(noteOn.rawBytes.length === 3, 'note raw byte size mismatch');

const pitchBend = toKesshoCoreMidiEventPayload(
  {
    timestamp: 12,
    kind: 'pitchBend',
    status: 0xe2,
    channel: 2,
    data1: 0,
    data2: 64,
    rawBytes: [0xe2, 0, 64],
  },
  { sampleRate: 48000 },
);
assert(Math.abs(pitchBend.normalizedValue - 8192 / 16383) < 1.0e-7, 'pitch bend normalization mismatch');
assert(pitchBend.sampleOffset === 0, 'timestamp without origin should queue at current block');

const sysex = toKesshoCoreMidiEventPayload(
  {
    timestamp: 0,
    kind: 'systemExclusive',
    status: 0xf0,
    rawBytes: Array.from({ length: 24 }, (_, index) => index),
  },
  { sampleRate: 48000 },
);
assert(sysex.rawBytes.length === 16, 'raw bytes must be truncated to the C ABI limit');
assert(sysex.status === 0xf0, 'sysex status mismatch');

assert(
  midiSampleOffset({ timestamp: 1 }, {
    sampleRate: 48000,
    currentTimeSeconds: 2,
    timestampOriginSeconds: 0,
  }) === 0,
  'past MIDI timestamps should clamp to immediate delivery',
);

console.log('KesshoCore MIDI event normalization checks passed');
