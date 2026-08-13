import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  kesshoCoreIncludeArgs,
  resolveKesshoCoreSources,
} from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const testName = process.argv[2];
if (!testName) {
  throw new Error('Usage: node scripts/run-kessho-product-cpp-test.mjs <TestName>');
}
const extraSources = process.argv.slice(3);
const sanitize = process.env.KESSHO_CPP_TEST_SANITIZE === '1';

const buildDir = resolve(root, 'build/kessho-core/product-tests');
const testSource = resolve(root, `cpp/KesshoCore/tests/${testName}.cpp`);
const testBinary = resolve(buildDir, sanitize ? `${testName}-sanitize` : testName);
mkdirSync(buildDir, { recursive: true });

function run(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

run('/usr/bin/clang++', [
  '-std=c++17',
  sanitize ? '-O1' : '-O2',
  ...(sanitize ? ['-g', '-fno-omit-frame-pointer', '-fsanitize=address,undefined'] : []),
  '-Wall',
  '-Wextra',
  '-Werror',
  '-DKESSHO_PRODUCT_ENABLE_DEBUG_API=1',
  ...kesshoCoreIncludeArgs(root),
  ...resolveKesshoCoreSources(root, { includeDebugApi: true }),
  ...extraSources.map((source) => resolve(root, source)),
  testSource,
  '-o',
  testBinary,
]);

run(testBinary, []);
