import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const before = new Map([
  ['cpp/KesshoCore/generated/KesshoProductSchemaHash.h', read('cpp/KesshoCore/generated/KesshoProductSchemaHash.h')],
  ['src/audio/generated/kesshoProductSchema.ts', read('src/audio/generated/kesshoProductSchema.ts')],
  ['KesshoNativeSwift/Generated/KesshoProductSchema.swift', read('KesshoNativeSwift/Generated/KesshoProductSchema.swift')],
]);

execFileSync('node', ['scripts/generate-kessho-product-bindings.mjs'], { cwd: root, stdio: 'inherit' });

for (const [path, content] of before.entries()) {
  if (read(path) !== content) {
    throw new Error(`Generated schema drifted: ${path}`);
  }
}

const cppHash = read('cpp/KesshoCore/generated/KesshoProductSchemaHash.h');
const tsHash = read('src/audio/generated/kesshoProductSchema.ts');
const swiftHash = read('KesshoNativeSwift/Generated/KesshoProductSchema.swift');
const hashMatch = cppHash.match(/KESSHO_PRODUCT_SCHEMA_HASH_HEX = "([^"]+)"/);
if (!hashMatch) {
  throw new Error('Missing C++ schema hash string');
}
const hash = hashMatch[1];
if (!tsHash.includes(`KESSHO_PRODUCT_SCHEMA_HASH_HEX = '${hash}'`) || !swiftHash.includes(`hashHex = "${hash}"`)) {
  throw new Error('Schema hash mismatch across C++/TypeScript/Swift generated files');
}

console.log(`Kessho Product schema is deterministic (${hash}).`);
