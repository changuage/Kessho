#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const samplesRoot = fileURLToPath(new URL('../public/samples/', import.meta.url));
const convert = promisify(execFile);
const generatorModifiedAt = (await stat(fileURLToPath(import.meta.url))).mtimeMs;

async function findSamples(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findSamples(absolute));
    else if (entry.isFile() && entry.name.endsWith('.ogg')) files.push(absolute);
  }
  return files;
}

const pending = (await findSamples(samplesRoot))[Symbol.iterator]();
let generated = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  for (const source of pending) {
    const destination = source.replace(/\.ogg$/, '.mp3');
    const existing = await stat(destination).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (existing && existing.mtimeMs >= Math.max((await stat(source)).mtimeMs, generatorModifiedAt)) continue;
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await convert(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
        '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', '2',
        '-f', 'mp3', temporary,
      ]);
      await rename(temporary, destination);
      generated += 1;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}));
console.log(`Generated ${generated} native MP3 compatibility assets`);
