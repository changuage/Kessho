import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readFile(root, path) {
  return readFileSync(resolve(root, path), 'utf8');
}

export function assertToken(root, path, token) {
  const source = readFile(root, path);
  if (!source.includes(token)) {
    throw new Error(`${path} is missing required token: ${token}`);
  }
}

export function assertNoToken(root, path, token) {
  const source = readFile(root, path);
  if (source.includes(token)) {
    throw new Error(`${path} contains forbidden token: ${token}`);
  }
}
