import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const productWorkletSource = 'cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js';
const productGenerator = readFileSync(resolve(root, 'scripts/generate-kessho-product-bindings.mjs'), 'utf8');
if (!existsSync(resolve(root, productWorkletSource))) {
  throw new Error(`Authoritative Product worklet source is missing: ${productWorkletSource}`);
}
for (const token of ['productWorkletSourcePath', 'productWorkletOutputPath', 'applyProductBindings']) {
  if (!productGenerator.includes(token)) {
    throw new Error(`Product binding generator must use ${token}`);
  }
}
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

function normalizeProductBindings(source) {
  return source
    .replace(/const EXPECTED_PRODUCT_SCHEMA_HASH = 0x[0-9a-f]+;/, 'const EXPECTED_PRODUCT_SCHEMA_HASH = <generated>;')
    .replace(
      /const PRODUCT_EVENT_IDS = Object\.freeze\(\{[\s\S]*?\n\}\);/,
      'const PRODUCT_EVENT_IDS = Object.freeze({<generated>});',
    );
}

const before = new Map(generatedFiles.map((file) => [file, fileHash(file)]));
const sourceHashBefore = fileHash(productWorkletSource);

execFileSync(process.execPath, ['scripts/generate-kessho-product-bindings.mjs'], {
  cwd: root,
  stdio: 'pipe',
});

const changed = generatedFiles.filter((file) => before.get(file) !== fileHash(file));
if (changed.length > 0) {
  throw new Error(`Generated files changed after regeneration: ${changed.join(', ')}`);
}
if (sourceHashBefore !== fileHash(productWorkletSource)) {
  throw new Error('Product binding generation modified the authoritative worklet source');
}
const normalizedSource = normalizeProductBindings(readFileSync(resolve(root, productWorkletSource), 'utf8'));
const normalizedOutput = normalizeProductBindings(
  readFileSync(resolve(root, 'public/worklets/kessho-core-product.worklet.js'), 'utf8'),
);
if (normalizedSource !== normalizedOutput) {
  throw new Error('Generated Product worklet behavior differs from the authoritative adapter source');
}

console.log('Generated Kessho product files are deterministic and up to date');
