import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const files = execFileSync('git', ['ls-files', 'src/**/*.ts', 'src/**/*.tsx'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((path) => existsSync(join(root, path)))
  .filter((path) => !path.startsWith('src/audio/reference/'))
  .filter((path) => !path.startsWith('src/ui/referenceRuntime/'))
  .filter((path) => !path.includes('.test.'));

const legacyVoiceTokens = ['snare', 'clap', 'hat', 'hihat', 'perc', 'tom'];
const legacyVoiceFieldPattern = (token) => new RegExp(`["'](?:voice|drumVoice|targetVoice)["']\\s*:\\s*["']${token}["']`);
const allowedFiles = new Set([
  'src/audio/CoreProductLegacyCompatibility.ts',
  'src/ui/state.ts',
  'src/ui/presetUtils.ts',
]);

let failed = false;
for (const path of files) {
  if (allowedFiles.has(path)) continue;
  const text = readFileSync(join(root, path), 'utf8');
  for (const token of legacyVoiceTokens) {
    if (legacyVoiceFieldPattern(token).test(text)) {
      console.error(`legacy boundary violation: ${path} contains legacy drum voice alias ${token}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('legacy boundary guard passed');
