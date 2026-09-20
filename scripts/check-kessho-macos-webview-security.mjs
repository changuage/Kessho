#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'swift',
  ['run', '--package-path', 'CapacitorMac', 'KesshoCapacitorMac', '--webview-security-smoke'],
  { encoding: 'utf8' },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.status !== 0 || !result.stdout?.includes('Kessho Capacitor macOS WebView security smoke passed')) {
  process.exit(result.status && result.status > 0 ? result.status : 1);
}

console.log('macOS WebView security smoke check passed');
