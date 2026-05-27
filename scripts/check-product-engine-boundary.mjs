import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const sourceRoots = ['src'];

const legacyEngineImportPatterns = [
  /from\s+['"](?:\.\/|\.\.\/)*audio\/engine['"]/,
  /from\s+['"](?:\.\/|\.\.\/)*engine['"]/,
  /from\s+['"]@\/audio\/engine['"]/,
  /import\s*\(\s*['"](?:\.\/|\.\.\/)*engine['"]\s*\)/,
  /src\/audio\/engine/,
];

const legacyRuntimeImportPatterns = [
  /from\s+['"](?:\.\/|\.\.\/)*audio\/runtime['"]/,
  /from\s+['"](?:\.\/|\.\.\/)*runtime['"]/,
  /from\s+['"]@\/audio\/runtime['"]/,
];

const directLegacyEngineAllowlist = new Map([
  ['src/App.tsx', 'temporary app shell compatibility while ProductEnginePort migration burns down legacy UI calls'],
  ['src/audio/coreEngineHost.ts', 'legacy core-smoke host compatibility'],
  ['src/audio/coreProductEngineHost.ts', 'temporary host compatibility until product-specific types fully replace AudioEngine types'],
  ['src/audio/runtime.ts', 'temporary legacy runtime facade'],
]);

const legacyRuntimeAllowlist = new Map([
  ['src/App.tsx', 'temporary app shell compatibility while top-level engine lifecycle migrates'],
  ['src/audio/sonicParityHarness.ts', 'parity harness can use the legacy runtime facade until web-ts reference namespace exists'],
]);

const productPortFiles = new Set([
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/ProductEngineTypes.ts',
  'src/audio/product/ProductRuntimeDiagnostics.ts',
  'src/audio/product/ProductRuntimeMode.ts',
]);

const webAudioBoundaryTypes = [
  'AudioNode',
  'GainNode',
  'AnalyserNode',
  'AudioContext',
  'AudioWorkletNode',
  'MediaStream',
  'MediaStreamAudioDestinationNode',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function hasAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

const failures = [];
const warnings = [];

for (const rootDir of sourceRoots) {
  for (const file of walk(path.join(root, rootDir))) {
    const relative = rel(file);
    const source = fs.readFileSync(file, 'utf8');

    if (relative.startsWith('src/audio/product/') && hasAny(source, legacyEngineImportPatterns)) {
      failures.push(`${relative}: product runtime boundary must not import legacy src/audio/engine.ts`);
    }

    if (productPortFiles.has(relative)) {
      for (const typeName of webAudioBoundaryTypes) {
        const pattern = new RegExp(`\\b${typeName}\\b`);
        if (pattern.test(source)) {
          failures.push(`${relative}: ProductEnginePort type surface must not expose ${typeName}`);
        }
      }
    }

    if (hasAny(source, legacyEngineImportPatterns) && !directLegacyEngineAllowlist.has(relative)) {
      failures.push(`${relative}: forbidden direct import of legacy src/audio/engine.ts`);
    } else if (hasAny(source, legacyEngineImportPatterns)) {
      warnings.push(`${relative}: legacy engine import allowed temporarily: ${directLegacyEngineAllowlist.get(relative)}`);
    }

    if (hasAny(source, legacyRuntimeImportPatterns) && !legacyRuntimeAllowlist.has(relative)) {
      failures.push(`${relative}: forbidden import of temporary src/audio/runtime.ts facade`);
    } else if (hasAny(source, legacyRuntimeImportPatterns)) {
      warnings.push(`${relative}: legacy runtime import allowed temporarily: ${legacyRuntimeAllowlist.get(relative)}`);
    }
  }
}

if (strict && warnings.length > 0) {
  failures.push(...warnings.map((warning) => `strict mode: ${warning}`));
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(warnings.join('\n'));
}
console.log('Product engine boundary checks passed');
