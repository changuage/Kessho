import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const generatedFiles = [
  'cpp/KesshoCore/generated/KesshoProductSchema.h',
  'cpp/KesshoCore/generated/KesshoProductSchemaHash.h',
  'src/audio/generated/kesshoProductSchema.ts',
  'public/worklets/kessho-core-product.worklet.js',
];

function fileHash(relativePath) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, relativePath)))
    .digest('hex');
}

const before = new Map(generatedFiles.map((file) => [file, fileHash(file)]));

execFileSync(process.execPath, ['scripts/generate-kessho-product-bindings.mjs'], {
  cwd: root,
  stdio: 'pipe',
});

const changed = generatedFiles.filter((file) => before.get(file) !== fileHash(file));
if (changed.length > 0) {
  throw new Error(`Generated files changed after regeneration: ${changed.join(', ')}`);
}

console.log('Generated Kessho product files are deterministic and up to date');
