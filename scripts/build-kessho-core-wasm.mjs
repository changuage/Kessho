import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  formatEmscriptenExportedFunctions,
  kesshoCoreIncludeArgs,
  resolveKesshoCoreSources,
} from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const parityBuild = process.argv.includes('--parity');
const outputDir = parityBuild
  ? resolve(root, 'build/kessho-core/parity')
  : resolve(root, 'public/worklets');
const wasmOutput = resolve(outputDir, parityBuild ? 'kessho_core_parity.wasm' : 'kessho_core.wasm');
const workletSource = resolve(root, 'cpp/KesshoCore/adapters/wasm/kessho-core.worklet.js');
const workletOutput = resolve(outputDir, 'kessho-core.worklet.js');
const sources = resolveKesshoCoreSources(root, { includeDebugApi: parityBuild });

function findCompiler() {
  const candidates = [
    process.env.EMCXX,
    resolve(root, 'emsdk/upstream/emscripten/em++'),
    'em++',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('/') && existsSync(candidate)) {
      return candidate;
    }

    if (!candidate.includes('/')) {
      try {
        execFileSync('/usr/bin/which', [candidate], { stdio: 'ignore' });
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }
  }

  throw new Error('Could not find em++. Install/activate emsdk or set EMCXX.');
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function buildEnv() {
  const emsdkRoot = resolve(root, 'emsdk');
  const localEmscriptenBin = resolve(emsdkRoot, 'upstream/emscripten');
  const env = {
    ...process.env,
    EMCC_SKIP_SANITY_CHECK: '1',
    EMCC_CORES: '1',
  };

  if (!existsSync(localEmscriptenBin)) {
    return env;
  }

  const pythonBin = firstExisting([
    resolve(root, 'emsdk/python/3.13.3_64bit/bin'),
    resolve(root, '.python312/bin'),
  ]);
  const nodeBin = firstExisting([
    resolve(root, 'emsdk/node/22.16.0_64bit/bin'),
  ]);
  const pathPrefix = [pythonBin, nodeBin, localEmscriptenBin]
    .filter(Boolean)
    .join(':');

  return {
    ...env,
    EMSDK: emsdkRoot,
    EM_CONFIG: resolve(emsdkRoot, '.emscripten'),
    PATH: `${pathPrefix}:${process.env.PATH || ''}`,
  };
}

function run(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: buildEnv() });
}

mkdirSync(outputDir, { recursive: true });

run(findCompiler(), [
  '-std=c++17',
  '-O3',
  '-flto',
  '-DNDEBUG',
  '-fno-math-errno',
  '-freciprocal-math',
  '-fno-trapping-math',
  '-Wall',
  '-Wextra',
  '-Werror',
  ...(parityBuild ? ['-DKESSHO_PRODUCT_ENABLE_DEBUG_API=1'] : []),
  ...kesshoCoreIncludeArgs(root),
  ...sources,
  '--no-entry',
  '-sSTANDALONE_WASM=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sINITIAL_MEMORY=67108864',
  '-sMAXIMUM_MEMORY=402653184',
  formatEmscriptenExportedFunctions({ includeDebugApi: parityBuild }),
  '-o',
  wasmOutput,
]);

console.log(`Created ${wasmOutput}`);
if (!parityBuild) {
  copyFileSync(workletSource, workletOutput);
  console.log(`Created ${workletOutput}`);
}
