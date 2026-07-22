import path from 'node:path';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';

const root = process.cwd();
const files = collectSourceFiles(path.join(root, 'src'));
const violations = [];

function isProductRuntimeHook(file) {
  return /^src\/ui\/useProductRuntime[^/]*\.(ts|tsx)$/.test(file);
}

function isExplicitReferenceBoundary(file) {
  return file.startsWith('src/ui/referenceRuntime/') || file.startsWith('src/audio/reference/');
}

for (const filePath of files) {
  const file = relativeSourcePath(root, filePath);
  const specifiers = collectImportSpecifiers(filePath);
  if (isProductRuntimeHook(file) && !isExplicitReferenceBoundary(file)) {
    for (const { specifier } of specifiers) {
      if (/useSelectedAudioEngine|SelectedProductRuntime|(?:^|\/)audio\/reference(?:\/|$)/.test(specifier)) {
        violations.push(`${file}: forbidden Product runtime import ${specifier}`);
      }
    }
  }
  if (!isExplicitReferenceBoundary(file) && /(?:^|\/)audio\/product\//.test(file)) {
    for (const { specifier } of specifiers) {
      if (/(?:^|\/)audio\/reference(?:\/|$)/.test(specifier) && !specifier.endsWith('/referenceAudioRuntime')) {
        violations.push(`${file}: Product audio module imports reference audio ${specifier}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

const productHooks = files.filter((filePath) => isProductRuntimeHook(relativeSourcePath(root, filePath)));
console.log(`AST Product runtime boundary passed (${productHooks.length} Product hooks checked)`);
