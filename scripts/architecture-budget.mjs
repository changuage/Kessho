#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function nonEmptyLoc(rel) {
  return read(rel).split('\n').filter((line) => line.trim().length > 0).length;
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git', '.temp'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js|jsx|mjs|swift)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const futureBudgets = [
  { file: 'src/App.tsx', maxLoc: 300, phase: 'after-app-shell-refactor' },
  { file: 'src/audio/coreProductEngineHost.ts', maxLoc: 500, phase: 'after-core-host-split' },
];

for (const budget of futureBudgets) {
  if (!exists(budget.file)) continue;
  const current = nonEmptyLoc(budget.file);
  const message = `${budget.file} has ${current} non-empty LOC; future budget is ${budget.maxLoc} (${budget.phase})`;
  if (process.env.KESSHO_ENFORCE_ARCH_BUDGETS === '1' && current > budget.maxLoc) {
    failures.push(message);
  } else {
    console.log(`architecture-budget: ${message}`);
  }
}

for (const file of [...walk('src'), ...walk('CapacitorMac'), ...walk('ios')]) {
  const source = read(file);
  const isReference = file.includes('/reference/') || file.includes('/referenceAudioRuntime.ts');
  const isExplicitReferenceLoader = file === 'src/audio/coreEngineHost.ts' || file === 'src/audio/referenceAudioRuntime.ts';
  const isTest = /(__tests__|\.test\.|\.spec\.)/.test(file);
  if (!isReference && !isExplicitReferenceLoader && !isTest && /from ['"].*audio\/reference\/webTs|from ['"].*reference\/webTs/.test(source)) {
    failures.push(`${file}: production-facing source imports the web-ts reference runtime`);
  }
  if (file.endsWith('.swift') && /webView\.isInspectable\s*=\s*true/.test(source) && !/#if\s+DEBUG/.test(source)) {
    failures.push(`${file}: WKWebView inspection must be DEBUG-gated`);
  }
}

if (failures.length) {
  console.error('Architecture budget violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
