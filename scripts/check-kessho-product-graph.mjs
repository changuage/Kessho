import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductGraphTests'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
