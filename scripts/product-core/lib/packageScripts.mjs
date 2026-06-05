import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readPackageScripts(root = process.cwd()) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return packageJson.scripts ?? {};
}

export function assertPackageScript(name, expectedCommandSubstring, root = process.cwd()) {
  const scripts = readPackageScripts(root);
  const command = scripts[name];
  if (typeof command !== 'string' || !command.includes(expectedCommandSubstring)) {
    throw new Error(`package.json must expose ${name}${expectedCommandSubstring ? ` with ${expectedCommandSubstring}` : ''}`);
  }
  return command;
}
