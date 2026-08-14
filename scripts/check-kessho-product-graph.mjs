import { execFileSync } from 'node:child_process';

for (const testName of ['ProductGraphTests', 'ProductCalibrationTests']) {
  execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', testName], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
