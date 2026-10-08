import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outputDir = resolve(root, 'build/ambient-fx-cpu/tests');
const spectralDir = 'cpp/KesshoCore/src/modules/spectral_freeze';
const flags = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror'];
if (process.env.AMBIENT_CPU_SANITIZE === '1') flags.push('-fsanitize=address,undefined');
mkdirSync(outputDir, { recursive: true });

const tests = [
  { name: 'granular', args: ['cpp/KesshoCore/tests/GranularCpuOptimizationTests.cpp'] },
  { name: 'spectral', args: [
    '-DKESSHO_SPECTRAL_FREEZE_ENABLE_TEST_COUNTERS=1', `-I${spectralDir}`,
    'cpp/KesshoCore/tests/SpectralFreezeBookkeepingTests.cpp',
    ...['Engine', 'CaptureBuffer', 'Memory', 'ScanHead', 'Stft'].map(name => `${spectralDir}/SpectralFreeze${name}.cpp`),
  ] },
];
for (const test of tests) {
  const binary = resolve(outputDir, test.name);
  execFileSync(process.env.CXX ?? 'clang++', [...flags, ...test.args, '-o', binary], { cwd: root, stdio: 'inherit' });
  execFileSync(binary, [], { cwd: root, stdio: 'inherit' });
}
