import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_QUALITY = 2;

const profiles = Object.freeze({
  'soft-string-spurs': {
    key: 'soft-string-spurs',
    name: 'Soft String Spurs',
    provider: 'Pianobook',
    sourceInstrument: 'Decent Sampler',
    sampleRoot: 'SoftStringSpurs',
    envSource: 'SOFT_STRING_SPURS_SOURCE',
    assetIdBase: 8200,
    categories: {
      strings: 'Playable soft string sustain, swell, and harmonic samples.',
    },
    parseSample: parseSoftStringSpursSample,
  },
  'archive-found-strings-001': {
    key: 'archive-found-strings-001',
    name: 'Archive Found Strings 001',
    provider: 'Pianobook',
    sourceInstrument: 'Decent Sampler',
    sampleRoot: 'ArchiveFoundStrings001',
    envSource: 'ARCHIVE_FOUND_STRINGS_001_SOURCE',
    assetIdBase: 8400,
    categories: {
      strings: 'Looped found-string profile samples from the Archive Found Strings 001 Decent Sampler instrument.',
    },
    parseSample: parseArchiveFoundStringsSample,
  },
});

function parseArgs(argv) {
  const options = {
    profile: '',
    source: '',
    output: '',
    ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
    sampleRate: DEFAULT_SAMPLE_RATE,
    quality: DEFAULT_QUALITY,
    assetIdBase: null,
    force: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--profile':
        options.profile = argv[++index];
        break;
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

  const profile = profiles[options.profile];
  if (!profile) {
    throw new Error(`Missing or unknown --profile. Expected one of: ${Object.keys(profiles).join(', ')}`);
  }

  const source = options.source || process.env[profile.envSource] || '';
  if (!source) {
    throw new Error(`Missing --source <dir> or ${profile.envSource}`);
  }
  if (!Number.isInteger(options.sampleRate) || options.sampleRate < 8000) {
    throw new Error(`Invalid --sample-rate: ${options.sampleRate}`);
  }
  if (!Number.isFinite(options.quality) || options.quality < -1 || options.quality > 10) {
    throw new Error(`Invalid --quality: ${options.quality}`);
  }
  const assetIdBase = options.assetIdBase ?? profile.assetIdBase;
  if (!Number.isInteger(assetIdBase) || assetIdBase <= 0) {
    throw new Error(`Invalid --asset-id-base: ${assetIdBase}`);
  }

  return {
    ...options,
    profile,
    source: resolve(source),
    output: resolve(options.output || join('public/samples', profile.sampleRoot)),
    assetIdBase,
  };
}

function printHelp() {
  console.log(`Usage:
  FFMPEG_BIN=/path/to/ffmpeg node scripts/import-pianobook-ds-samples.mjs --profile <profile> --source <dir>

Profiles:
  ${Object.keys(profiles).join('\n  ')}

Options:
  --source <dir>          Source Decent Sampler library directory
  --out <dir>             Output directory, default public/samples/<profile-root>
  --ffmpeg <path>         ffmpeg binary, default $FFMPEG_BIN or ffmpeg
  --sample-rate <hz>      Output sample rate, default ${DEFAULT_SAMPLE_RATE}
  --quality <n>           Vorbis quality -1..10, default ${DEFAULT_QUALITY}
  --asset-id-base <id>    First manifest asset ID
  --no-force              Do not overwrite existing OGG files
`);
}

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s#-]/g, '')
    .trim()
    .replace(/#/g, 'sharp')
    .replace(/[_\s-]+/g, '_')
    .toLowerCase();
}

function midiNoteName(midi) {
  if (!Number.isInteger(midi)) return null;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function parseAttributes(text) {
  const attrs = {};
  for (const match of text.matchAll(/([A-Za-z_][\w:-]*)="([^"]*)"/g)) {
    const [, key, value] = match;
    attrs[key] = value;
  }
  return attrs;
}

function numberAttr(attrs, key) {
  const value = attrs[key];
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDecentPath(path) {
  return String(path || '').replace(/\\/g, '/');
}

function parseDecentSamplerMappings(sourceDir) {
  const mappingsByFile = new Map();
  const presetFiles = walkFiles(sourceDir)
    .filter((file) => extname(file).toLowerCase() === '.dspreset')
    .sort((a, b) => relative(sourceDir, a).localeCompare(relative(sourceDir, b), undefined, { numeric: true }));

  for (const presetPath of presetFiles) {
    const presetName = basename(presetPath);
    const text = readFileSync(presetPath, 'utf8');
    for (const groupMatch of text.matchAll(/<group\b([^>]*)>([\s\S]*?)<\/group>/g)) {
      const groupAttrs = parseAttributes(groupMatch[1]);
      const groupBody = groupMatch[2];
      const groupName = groupAttrs.name || null;
      for (const sampleMatch of groupBody.matchAll(/<sample\b([\s\S]*?)\/>/g)) {
        const attrs = parseAttributes(sampleMatch[1]);
        const decentPath = normalizeDecentPath(attrs.path);
        const mapping = {
          preset: presetName,
          groupName,
          path: decentPath,
          rootNote: numberAttr(attrs, 'rootNote'),
          noteName: midiNoteName(numberAttr(attrs, 'rootNote')),
          loNote: numberAttr(attrs, 'loNote'),
          hiNote: numberAttr(attrs, 'hiNote'),
          loVel: numberAttr(attrs, 'loVel'),
          hiVel: numberAttr(attrs, 'hiVel'),
          startFrame: numberAttr(attrs, 'start'),
          endFrame: numberAttr(attrs, 'end'),
          loopEnabled: attrs.loopEnabled === 'true',
          loopStartFrame: numberAttr(attrs, 'loopStart'),
          loopEndFrame: numberAttr(attrs, 'loopEnd'),
          loopCrossfadeFrames: numberAttr(attrs, 'loopCrossfade'),
          volume: attrs.volume ?? null,
          pan: numberAttr(attrs, 'pan'),
          tuning: numberAttr(attrs, 'tuning'),
        };
        const key = basename(decentPath);
        const list = mappingsByFile.get(key) || [];
        list.push(mapping);
        mappingsByFile.set(key, list);
      }
    }
  }

  return { mappingsByFile, presetFiles: presetFiles.map((file) => basename(file)) };
}

function firstMappingWithRoot(mappings) {
  return mappings.find((mapping) => Number.isInteger(mapping.rootNote)) || mappings[0] || null;
}

function parseSoftStringSpursSample({ sourceFileName, mappings }) {
  const base = basename(sourceFileName, extname(sourceFileName));
  const mapping = firstMappingWithRoot(mappings);
  const rootMidi = mapping?.rootNote ?? null;
  const noteName = midiNoteName(rootMidi);

  const level = /^SSS_Level(\d+)_([A-G]#?\d+)$/.exec(base);
  if (level) {
    const layer = Number(level[1]);
    const sourceNoteLabel = level[2];
    return {
      key: `soft-string-spurs.core.level-${layer}.${pad(rootMidi ?? 0, 3)}`,
      fileName: `soft_string_spurs_core_level_${layer}_${pad(rootMidi ?? 0, 3)}.ogg`,
      category: 'strings',
      role: 'sustain',
      source: 'soft-string-spurs',
      articulation: 'core',
      dynamic: `level-${layer}`,
      dynamicRank: layer,
      velocityRange: null,
      modulationLayer: layer,
      sourceNoteLabel,
      rootMidi,
      noteName,
      roundRobin: null,
      profileIndex: null,
      loop: mapping?.loopEnabled === true,
      tags: ['strings', 'sustain', 'core', `level-${layer}`],
      description: `Soft String Spurs core sustain, modulation level ${layer}, source note ${sourceNoteLabel}, mapped root ${noteName ?? 'unknown'}.`,
    };
  }

  const swell = /^SSS_Swells_([A-G]#?\d+)$/.exec(base);
  if (swell) {
    const sourceNoteLabel = swell[1];
    return {
      key: `soft-string-spurs.swells.${pad(rootMidi ?? 0, 3)}`,
      fileName: `soft_string_spurs_swells_${pad(rootMidi ?? 0, 3)}.ogg`,
      category: 'strings',
      role: 'swell',
      source: 'soft-string-spurs',
      articulation: 'swell',
      dynamic: null,
      dynamicRank: null,
      velocityRange: null,
      modulationLayer: null,
      sourceNoteLabel,
      rootMidi,
      noteName,
      roundRobin: null,
      profileIndex: null,
      loop: mapping?.loopEnabled === true,
      tags: ['strings', 'swell'],
      description: `Soft String Spurs swell, source note ${sourceNoteLabel}, mapped root ${noteName ?? 'unknown'}.`,
    };
  }

  const harmonics = /^SSS_Harmonics_([A-G]#?\d+)$/.exec(base);
  if (harmonics) {
    const sourceNoteLabel = harmonics[1];
    return {
      key: `soft-string-spurs.harmonics.${pad(rootMidi ?? 0, 3)}`,
      fileName: `soft_string_spurs_harmonics_${pad(rootMidi ?? 0, 3)}.ogg`,
      category: 'strings',
      role: 'harmonic',
      source: 'soft-string-spurs',
      articulation: 'harmonic',
      dynamic: null,
      dynamicRank: null,
      velocityRange: null,
      modulationLayer: null,
      sourceNoteLabel,
      rootMidi,
      noteName,
      roundRobin: null,
      profileIndex: null,
      loop: mapping?.loopEnabled === true,
      tags: ['strings', 'harmonic'],
      description: `Soft String Spurs harmonic, source note ${sourceNoteLabel}, mapped root ${noteName ?? 'unknown'}.`,
    };
  }

  const slug = slugify(base);
  return {
    key: `soft-string-spurs.uncategorized.${slug}`,
    fileName: `${slug}.ogg`,
    category: 'uncategorized',
    role: 'unknown',
    source: 'soft-string-spurs',
    articulation: null,
    dynamic: null,
    dynamicRank: null,
    velocityRange: null,
    modulationLayer: null,
    sourceNoteLabel: null,
    rootMidi,
    noteName,
    roundRobin: null,
    profileIndex: null,
    loop: mapping?.loopEnabled === true,
    tags: ['uncategorized'],
    description: base,
  };
}

function parseArchiveFoundStringsSample({ sourceFileName, mappings }) {
  const base = basename(sourceFileName, extname(sourceFileName));
  const mapping = firstMappingWithRoot(mappings);
  const rootMidi = mapping?.rootNote ?? null;
  const noteName = midiNoteName(rootMidi);
  const profile = /^Moods Romantic FRONT RRI PROFILE_(\d+)$/.exec(base);
  if (profile) {
    const profileIndex = Number(profile[1]);
    return {
      key: `archive-found-strings-001.profile.${pad(profileIndex, 3)}`,
      fileName: `archive_found_strings_001_profile_${pad(profileIndex, 3)}.ogg`,
      category: 'strings',
      role: 'profile',
      source: 'archive-found-strings-001',
      articulation: 'found-string-loop',
      dynamic: null,
      dynamicRank: null,
      velocityRange: mapping?.loVel != null && mapping?.hiVel != null ? [mapping.loVel, mapping.hiVel] : null,
      modulationLayer: null,
      sourceNoteLabel: null,
      rootMidi,
      noteName,
      roundRobin: null,
      profileIndex,
      loop: mapping?.loopEnabled === true,
      tags: ['strings', 'found-strings', 'profile', 'loop'],
      description: `Archive Found Strings 001 profile ${profileIndex}, mapped root ${noteName ?? 'unknown'}.`,
    };
  }

  const slug = slugify(base);
  return {
    key: `archive-found-strings-001.uncategorized.${slug}`,
    fileName: `${slug}.ogg`,
    category: 'uncategorized',
    role: 'unknown',
    source: 'archive-found-strings-001',
    articulation: null,
    dynamic: null,
    dynamicRank: null,
    velocityRange: null,
    modulationLayer: null,
    sourceNoteLabel: null,
    rootMidi,
    noteName,
    roundRobin: null,
    profileIndex: null,
    loop: mapping?.loopEnabled === true,
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
  const result = spawnSync(ffmpeg, [
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
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${basename(sourcePath)}:\n${result.stderr || result.stdout}`);
  }
}

function cleanGeneratedOutput(output) {
  mkdirSync(output, { recursive: true });
  for (const fileName of readdirSync(output)) {
    if (fileName === 'manifest.json' || extname(fileName).toLowerCase() === '.ogg') {
      rmSync(join(output, fileName), { force: true });
    }
  }
}

function addCount(map, key) {
  if (key == null || key === '') return;
  map.set(String(key), (map.get(String(key)) || 0) + 1);
}

function sortedCountObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
}

function safeMappingForManifest(mapping) {
  return Object.fromEntries(Object.entries(mapping).filter(([, value]) => value !== undefined));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.source)) {
    throw new Error(`Source directory does not exist: ${options.source}`);
  }

  const wavFiles = walkFiles(options.source)
    .filter((file) => extname(file).toLowerCase() === '.wav')
    .sort((a, b) => relative(options.source, a).localeCompare(relative(options.source, b), undefined, { numeric: true }));
  if (wavFiles.length === 0) {
    throw new Error(`No WAV files found in ${options.source}`);
  }

  const { mappingsByFile, presetFiles } = parseDecentSamplerMappings(options.source);
  cleanGeneratedOutput(options.output);

  const byCategory = new Map();
  const byRole = new Map();
  const byDynamic = new Map();
  const byRootMidi = new Map();
  const byArticulation = new Map();
  const byPreset = new Map();
  const samples = [];
  let sourceBytes = 0;
  let compressedBytes = 0;
  let decodedBytes = 0;
  let longestDurationSeconds = 0;

  wavFiles.forEach((sourcePath, index) => {
    const sourceFileName = basename(sourcePath);
    const sourceRelativePath = normalizeDecentPath(relative(options.source, sourcePath));
    const mappings = mappingsByFile.get(sourceFileName) || [];
    const parsed = options.profile.parseSample({ sourceFileName, sourceRelativePath, mappings });
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
    addCount(byArticulation, parsed.articulation);
    for (const mapping of mappings) addCount(byPreset, mapping.preset);

    samples.push({
      assetId: options.assetIdBase + index,
      key: parsed.key,
      path: `${options.profile.sampleRoot}/${parsed.fileName}`,
      fileName: parsed.fileName,
      sourceFileName,
      sourceRelativePath,
      category: parsed.category,
      role: parsed.role,
      source: parsed.source,
      articulation: parsed.articulation,
      dynamic: parsed.dynamic,
      dynamicRank: parsed.dynamicRank,
      velocityRange: parsed.velocityRange,
      modulationLayer: parsed.modulationLayer,
      sourceNoteLabel: parsed.sourceNoteLabel,
      rootMidi: parsed.rootMidi,
      noteName: parsed.noteName,
      roundRobin: parsed.roundRobin,
      profileIndex: parsed.profileIndex,
      loop: parsed.loop,
      tags: parsed.tags,
      description: parsed.description,
      decentSamplerMappings: mappings.map(safeMappingForManifest),
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
      key: options.profile.key,
      name: options.profile.name,
      provider: options.profile.provider,
      sourceInstrument: options.profile.sourceInstrument,
      sourceLibraryDirectoryName: basename(options.source),
      sourcePresetFiles: presetFiles,
    },
    assetBasePath: 'samples',
    sampleRoot: options.profile.sampleRoot,
    assetIdBase: options.assetIdBase,
    encoding: {
      format: 'ogg/vorbis',
      codec: 'libvorbis',
      sampleRate: options.sampleRate,
      channelCount: 1,
      quality: options.quality,
      decoder: 'BaseAudioContext.decodeAudioData',
    },
    categories: options.profile.categories,
    counts: {
      total: samples.length,
      byCategory: sortedCountObject(byCategory),
      byRole: sortedCountObject(byRole),
      byArticulation: sortedCountObject(byArticulation),
      byDynamic: sortedCountObject(byDynamic),
      byRootMidi: sortedCountObject(byRootMidi),
      byPreset: sortedCountObject(byPreset),
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
    profile: options.profile.key,
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
