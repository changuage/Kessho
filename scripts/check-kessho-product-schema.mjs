import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const before = new Map([
  ['cpp/KesshoCore/generated/KesshoProductDefaults.h', read('cpp/KesshoCore/generated/KesshoProductDefaults.h')],
  ['cpp/KesshoCore/generated/KesshoProductEventIds.h', read('cpp/KesshoCore/generated/KesshoProductEventIds.h')],
  ['cpp/KesshoCore/generated/KesshoProductParamIds.h', read('cpp/KesshoCore/generated/KesshoProductParamIds.h')],
  ['cpp/KesshoCore/generated/KesshoProductSchema.h', read('cpp/KesshoCore/generated/KesshoProductSchema.h')],
  ['cpp/KesshoCore/generated/KesshoProductSchemaHash.h', read('cpp/KesshoCore/generated/KesshoProductSchemaHash.h')],
  ['src/audio/generated/kesshoProductEvents.ts', read('src/audio/generated/kesshoProductEvents.ts')],
  ['src/audio/generated/kesshoProductParams.ts', read('src/audio/generated/kesshoProductParams.ts')],
  ['src/audio/generated/kesshoProductSchema.ts', read('src/audio/generated/kesshoProductSchema.ts')],
]);

execFileSync('node', ['scripts/generate-kessho-product-bindings.mjs'], { cwd: root, stdio: 'inherit' });

for (const [path, content] of before.entries()) {
  if (read(path) !== content) {
    throw new Error(`Generated schema drifted: ${path}`);
  }
}

const cppHash = read('cpp/KesshoCore/generated/KesshoProductSchemaHash.h');
const tsHash = read('src/audio/generated/kesshoProductSchema.ts');
const hashMatch = cppHash.match(/KESSHO_PRODUCT_SCHEMA_HASH_HEX = "([^"]+)"/);
if (!hashMatch) {
  throw new Error('Missing C++ schema hash string');
}
const hash = hashMatch[1];
if (!tsHash.includes(`KESSHO_PRODUCT_SCHEMA_HASH_HEX = '${hash}'`)) {
  throw new Error('Schema hash mismatch across C++/TypeScript generated files');
}

console.log(`Kessho Product schema is deterministic (${hash}).`);
