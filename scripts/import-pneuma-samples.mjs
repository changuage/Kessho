import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

const DEFAULT_SOURCE = process.env.PNEUMA_SAMPLE_SOURCE || '';
const DEFAULT_OUTPUT = 'public/samples/Pneuma';
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_QUALITY = 2;
const DEFAULT_ASSET_ID_BASE = 8000;

const dynamicLayers = Object.freeze({
  pp: { rank: 1, velocityMin: 1, velocityMax: 31, label: 'pianissimo' },
  mp: { rank: 2, velocityMin: 32, velocityMax: 63, label: 'mezzo-piano' },
  mf: { rank: 3, velocityMin: 64, velocityMax: 95, label: 'mezzo-forte' },
  ff: { rank: 4, velocityMin: 96, velocityMax: 127, label: 'fortissimo' },
});

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
    sampleRate: DEFAULT_SAMPLE_RATE,
    quality: DEFAULT_QUALITY,
    assetIdBase: DEFAULT_ASSET_ID_BASE,
    force: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--source':
        options.source = argv[++index];
        break;
      case '--out':
      case '--output':
        options.output = argv[++index];
        break;
      case '--ffmpeg':
        options.ffmpeg = argv[++index];
        break;
      case '--sample-rate':
        options.sampleRate = Number(argv[++index]);
        break;
      case '--quality':
        options.quality = Number(argv[++index]);
        break;
      case '--asset-id-base':
        options.assetIdBase = Number(argv[++index]);
        break;
      case '--no-force':
        options.force = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.sampleRate) || options.sampleRate < 8000) {
    throw new Error(`Invalid --sample-rate: ${options.sampleRate}`);
  }
  if (!Number.isFinite(options.quality) || options.quality < -1 || options.quality > 10) {
    throw new Error(`Invalid --quality: ${options.quality}`);
  }
  if (!Number.isInteger(options.assetIdBase) || options.assetIdBase <= 0) {
    throw new Error(`Invalid --asset-id-base: ${options.assetIdBase}`);
  }

  return {
    ...options,
    source: options.source ? resolve(options.source) : '',
    output: resolve(options.output),
  };
}

function printHelp() {
  console.log(`Usage:
  FFMPEG_BIN=/path/to/ffmpeg node scripts/import-pneuma-samples.mjs [options]

Options:
  --source <dir>          Source Pneuma WAV sample directory
  --out <dir>             Output directory, default ${DEFAULT_OUTPUT}
  --ffmpeg <path>         ffmpeg binary, default $FFMPEG_BIN or ffmpeg
  --sample-rate <hz>      Output sample rate, default ${DEFAULT_SAMPLE_RATE}
  --quality <n>           Vorbis quality -1..10, default ${DEFAULT_QUALITY}
  --asset-id-base <id>    First manifest asset ID, default ${DEFAULT_ASSET_ID_BASE}
  --no-force              Do not overwrite existing OGG files
`);
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s-]+/g, '_')
    .toLowerCase();
}

function midiNoteName(midi) {
  if (!Number.isInteger(midi)) return null;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function parseSourceName(fileName) {
  const base = basename(fileName, extname(fileName));
  const vocalSustain = /^E_Uh_(pp|mp|mf|ff)_(\d+)$/.exec(base);
  if (vocalSustain) {
    const [, dynamic, midiText] = vocalSustain;
    const midi = Number(midiText);
    return {
      key: `pneuma.uh.${dynamic}.${pad(midi, 3)}`,
      fileName: `pneuma_uh_${dynamic}_${pad(midi, 3)}.ogg`,
      category: 'vocal',
      role: 'sustain',
      source: 'eleni',
      articulation: 'uh',
      vowel: 'uh',
      dynamic,
      dynamicRank: dynamicLayers[dynamic].rank,
      velocityRange: [dynamicLayers[dynamic].velocityMin, dynamicLayers[dynamic].velocityMax],
      rootMidi: midi,
      noteName: midiNoteName(midi),
      roundRobin: null,
      tags: ['vocal', 'sustain', 'uh', dynamic],
      description: `Eleni vocal "Uh" sustain, ${dynamic} layer, root ${midiNoteName(midi)} (${midi}).`,
    };
  }

  const vocalArticulation = /^E_Uh_ar_(\d+)$/.exec(base);
  if (vocalArticulation) {
    const midi = Number(vocalArticulation[1]);
    return {
      key: `pneuma.uh.ar.${pad(midi, 3)}`,
      fileName: `pneuma_uh_ar_${pad(midi, 3)}.ogg`,
      category: 'vocal',
      role: 'articulation',
      source: 'eleni',
      articulation: 'uh-ar',
      vowel: 'uh',
      dynamic: null,
      dynamicRank: null,
      velocityRange: null,
      rootMidi: midi,
      noteName: midiNoteName(midi),
      roundRobin: null,
      tags: ['vocal', 'articulation', 'uh', 'ar'],
      description: `Eleni vocal "Uh" articulation layer, root ${midiNoteName(midi)} (${midi}).`,
    };
  }

  const breath = /^E_br_R(\d+)_(\d+)$/.exec(base);
  if (breath) {
    const roundRobin = Number(breath[1]);
    const midi = Number(breath[2]);
    return {
      key: `pneuma.breath.r${pad(roundRobin, 2)}.${pad(midi, 3)}`,
      fileName: `pneuma_breath_r${pad(roundRobin, 2)}_${pad(midi, 3)}.ogg`,
      category: 'vocal',
      role: 'breath',
      source: 'eleni',
      articulation: 'breath',
      vowel: null,
      dynamic: null,
      dynamicRank: null,
      velocityRange: null,
      rootMidi: midi,
      noteName: midiNoteName(midi),
      roundRobin,
      tags: ['vocal', 'breath', 'round-robin'],
      description: `Eleni breath round-robin ${roundRobin}, root ${midiNoteName(midi)} (${midi}).`,
    };
  }

  if (base === 'Pneuma Pads - _10') {
    return {
      key: 'pneuma.pad.10',
      fileName: 'pneuma_pad_10.ogg',
      category: 'pad',
      role: 'texture',
      source: 'pneuma',
      articulation: 'pad',
      vowel: null,
      dynamic: null,
      dynamicRank: null,
      velocityRange: null,
      rootMidi: null,
      noteName: null,
      roundRobin: null,
      tags: ['pad', 'texture'],
      description: 'Pneuma pad texture sample.',
    };
  }

  if (base === 'Ah quiet pad breath convolution') {
    return {
      key: 'pneuma.texture.quiet_pad_breath_convolution',
      fileName: 'pneuma_quiet_pad_breath_convolution.ogg',
      category: 'texture',
      role: 'convolution',
      source: 'pneuma',
      articulation: 'breath-pad',
      vowel: 'ah',
      dynamic: 'quiet',
      dynamicRank: 0,
      velocityRange: null,
      rootMidi: null,
      noteName: null,
      roundRobin: null,
      tags: ['texture', 'pad', 'breath', 'convolution', 'quiet'],
      description: 'Quiet Ah pad breath convolution texture.',
    };
  }

  const slug = slugify(base);
  return {
    key: `pneuma.uncategorized.${slug}`,
    fileName: `${slug}.ogg`,
    category: 'uncategorized',
    role: 'unknown',
    source: 'pneuma',
    articulation: null,
    vowel: null,
    dynamic: null,
    dynamicRank: null,
    velocityRange: null,
    rootMidi: null,
    noteName: null,
    roundRobin: null,
    tags: ['uncategorized'],
    description: base,
  };
}

function parseWavInfo(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a RIFF/WAVE file`);
  }

  let offset = 12;
  let fmt = null;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) {
      throw new Error(`${path} has a truncated ${chunkId} chunk`);
    }
    if (chunkId === 'fmt ') {
      fmt = {
        formatCode: bytes.readUInt16LE(dataOffset),
        channelCount: bytes.readUInt16LE(dataOffset + 2),
        sampleRate: bytes.readUInt32LE(dataOffset + 4),
        byteRate: bytes.readUInt32LE(dataOffset + 8),
        blockAlign: bytes.readUInt16LE(dataOffset + 12),
        bitsPerSample: bytes.readUInt16LE(dataOffset + 14),
      };
    } else if (chunkId === 'data') {
      dataBytes += chunkSize;
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt) throw new Error(`${path} is missing a fmt chunk`);
  if (dataBytes <= 0) throw new Error(`${path} is missing audio data`);
  const frames = Math.floor(dataBytes / fmt.blockAlign);
  return {
    formatCode: fmt.formatCode,
    sampleRate: fmt.sampleRate,
    channelCount: fmt.channelCount,
    bitsPerSample: fmt.bitsPerSample,
    frameCount: frames,
    durationSeconds: frames / fmt.sampleRate,
    sourceBytes: bytes.length,
  };
}

function parseOggVorbisInfo(path) {
  const bytes = readFileSync(path);
  const vorbisIdPacket = Buffer.from([1, 118, 111, 114, 98, 105, 115]);
  const continuedGranule = 0xffffffffffffffffn;
  let offset = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let finalGranulePosition = 0n;

  while (offset < bytes.length) {
    if (bytes.toString('ascii', offset, offset + 4) !== 'OggS') {
      throw new Error(`${path} is not an Ogg stream at byte ${offset}`);
    }
    const segmentCount = bytes[offset + 26];
    const headerBytes = 27 + segmentCount;
    let payloadBytes = 0;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      payloadBytes += bytes[offset + 27 + segment];
    }
    const payloadOffset = offset + headerBytes;
    const granulePosition = bytes.readBigUInt64LE(offset + 6);
    if (granulePosition !== continuedGranule) {
      finalGranulePosition = granulePosition;
    }
    if (sampleRate === 0 || channelCount === 0) {
      const payload = bytes.subarray(payloadOffset, payloadOffset + payloadBytes);
      const packetOffset = payload.indexOf(vorbisIdPacket);
      if (packetOffset >= 0) {
        channelCount = payload[packetOffset + 11];
        sampleRate = payload.readUInt32LE(packetOffset + 12);
      }
    }
    offset = payloadOffset + payloadBytes;
  }

  const frameCount = Number(finalGranulePosition);
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0 || channelCount <= 0 || sampleRate <= 0) {
    throw new Error(`${path} has invalid Ogg/Vorbis stream metadata`);
  }

  return {
    sampleRate,
    channelCount,
    frameCount,
    durationSeconds: frameCount / sampleRate,
    compressedBytes: bytes.length,
    decodedBytes: frameCount * Math.min(channelCount, 2) * Float32Array.BYTES_PER_ELEMENT,
  };
}

function convertSample({ ffmpeg, sourcePath, outputPath, sampleRate, quality, force }) {
  if (!force && existsSync(outputPath)) return;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    sourcePath,
    '-map_metadata',
    '-1',
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-codec:a',
    'libvorbis',
    '-q:a',
    String(quality),
    outputPath,
  ];
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${basename(sourcePath)}:\n${result.stderr || result.stdout}`);
  }
}

function addCount(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedCountObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function cleanGeneratedOutput(output) {
  mkdirSync(output, { recursive: true });
  for (const fileName of readdirSync(output)) {
    if (fileName === 'manifest.json' || extname(fileName).toLowerCase() === '.ogg') {
      rmSync(join(output, fileName), { force: true });
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    throw new Error('Missing --source <dir> or PNEUMA_SAMPLE_SOURCE');
  }
  if (!existsSync(options.source)) {
    throw new Error(`Source directory does not exist: ${options.source}`);
  }

  const sourceFiles = readdirSync(options.source)
    .filter((fileName) => extname(fileName).toLowerCase() === '.wav')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (sourceFiles.length === 0) {
    throw new Error(`No WAV files found in ${options.source}`);
  }

  cleanGeneratedOutput(options.output);

  const byCategory = new Map();
  const byRole = new Map();
  const byDynamic = new Map();
  const byRootMidi = new Map();
  const samples = [];
  let sourceBytes = 0;
  let compressedBytes = 0;
  let decodedBytes = 0;
  let longestDurationSeconds = 0;

  sourceFiles.forEach((sourceFileName, index) => {
    const sourcePath = join(options.source, sourceFileName);
    const parsed = parseSourceName(sourceFileName);
    const outputPath = join(options.output, parsed.fileName);
    const wav = parseWavInfo(sourcePath);
    convertSample({
      ffmpeg: options.ffmpeg,
      sourcePath,
      outputPath,
      sampleRate: options.sampleRate,
      quality: options.quality,
      force: options.force,
    });
    const ogg = parseOggVorbisInfo(outputPath);

    sourceBytes += wav.sourceBytes;
    compressedBytes += ogg.compressedBytes;
    decodedBytes += ogg.decodedBytes;
    longestDurationSeconds = Math.max(longestDurationSeconds, ogg.durationSeconds);
    addCount(byCategory, parsed.category);
    addCount(byRole, parsed.role);
    addCount(byDynamic, parsed.dynamic);
    addCount(byRootMidi, parsed.rootMidi);

    samples.push({
      assetId: options.assetIdBase + index,
      key: parsed.key,
      path: `Pneuma/${parsed.fileName}`,
      fileName: parsed.fileName,
      sourceFileName,
      category: parsed.category,
      role: parsed.role,
      source: parsed.source,
      articulation: parsed.articulation,
      vowel: parsed.vowel,
      dynamic: parsed.dynamic,
      dynamicRank: parsed.dynamicRank,
      velocityRange: parsed.velocityRange,
      rootMidi: parsed.rootMidi,
      noteName: parsed.noteName,
      roundRobin: parsed.roundRobin,
      tags: parsed.tags,
      description: parsed.description,
      sourceInfo: {
        format: 'wav/pcm',
        sampleRate: wav.sampleRate,
        channelCount: wav.channelCount,
        bitsPerSample: wav.bitsPerSample,
        frameCount: wav.frameCount,
        durationSeconds: Number(wav.durationSeconds.toFixed(6)),
        bytes: wav.sourceBytes,
      },
      encodedInfo: {
        format: 'ogg/vorbis',
        sampleRate: ogg.sampleRate,
        channelCount: ogg.channelCount,
        frameCount: ogg.frameCount,
        durationSeconds: Number(ogg.durationSeconds.toFixed(6)),
        compressedBytes: ogg.compressedBytes,
        decodedBytes: ogg.decodedBytes,
      },
    });
  });

  const manifest = {
    schema: 'kessho-sample-library-v1',
    version: 1,
    library: {
      key: 'pneuma-eleni-teaser',
      name: 'Pneuma - Eleni - Pianobook (Teaser)',
      provider: 'Pianobook',
      sourceInstrument: 'Kontakt 5 and up',
      sourceLibraryDirectoryName: basename(dirname(options.source)),
      sourceSampleDirectoryName: basename(options.source),
    },
    assetBasePath: 'samples',
    sampleRoot: 'Pneuma',
    assetIdBase: options.assetIdBase,
    encoding: {
      format: 'ogg/vorbis',
      codec: 'libvorbis',
      sampleRate: options.sampleRate,
      channelCount: 1,
      quality: options.quality,
      decoder: 'BaseAudioContext.decodeAudioData',
    },
    dynamicLayers,
    categories: {
      vocal: 'Playable Eleni vocal material: Uh sustains, articulation samples, and breath round-robins.',
      pad: 'Pneuma pad texture material.',
      texture: 'Support texture or convolution-style source material.',
      uncategorized: 'Source files that did not match the known Pneuma filename patterns.',
    },
    counts: {
      total: samples.length,
      byCategory: sortedCountObject(byCategory),
      byRole: sortedCountObject(byRole),
      byDynamic: sortedCountObject(byDynamic),
      byRootMidi: sortedCountObject(byRootMidi),
    },
    byteSummary: {
      sourceBytes,
      compressedBytes,
      decodedBytes,
      compressionRatio: Number((compressedBytes / sourceBytes).toFixed(4)),
      longestDurationSeconds: Number(longestDurationSeconds.toFixed(6)),
    },
    samples,
  };

  writeFileSync(join(options.output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({
    output: options.output,
    sampleCount: samples.length,
    sourceBytes,
    compressedBytes,
    compressionRatio: manifest.byteSummary.compressionRatio,
    byCategory: manifest.counts.byCategory,
    byRole: manifest.counts.byRole,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
