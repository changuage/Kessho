import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/promo-product-orbit-capture.mjs'], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`capture terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
