import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readDeviceEvidenceTable(root = process.cwd(), path = 'docs/product-core/background-audio-device-evidence.md') {
  return readFileSync(resolve(root, path), 'utf8');
}

export function assertRequiredRowsPass(root = process.cwd(), path = 'docs/product-core/background-audio-device-evidence.md') {
  const table = readDeviceEvidenceTable(root, path);
  const failedRows = table
    .split('\n')
    .filter((line) => line.includes('|'))
    .filter((line) => /\brequired\b/i.test(line) && !/\bpass\b/i.test(line));
  if (failedRows.length > 0) {
    throw new Error(`${path} has required device-evidence rows that are not pass`);
  }
}
