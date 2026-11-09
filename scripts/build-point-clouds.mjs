#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'dist-point-clouds');
const engineOutput = join(output, 'shared/embedded');

// Reuse the self-contained Product Core engine without rebuilding the DSP
// or copying the main application, preset library and sample collection.
await promisify(execFile)(process.execPath, [
  join(root, 'scripts/generate-point-clouds-embedded-engine.mjs'),
  '--output-dir', engineOutput,
], { cwd: root });

const [page, bridge] = await Promise.all([
  readFile(join(root, 'point-clouds/index.html'), 'utf8'),
  readFile(join(root, 'point-clouds/shared/kessho-site-bridge.js'), 'utf8'),
]);
const bridgeTag = '<script src="./shared/kessho-site-bridge.js"></script>';
const fallbackMarker = /(<script data-point-clouds-bridge-fallback>)[\s\S]*?(<\/script>)/;
if (!page.includes(bridgeTag) || !fallbackMarker.test(page)) {
  throw new Error('Point Clouds page is missing its shared bridge or fallback marker.');
}
const { code: minifiedBridge } = await transform(bridge, {
  minify: true, target: 'es2020', legalComments: 'none',
});
const html = page
  .replace(bridgeTag, `<script>window.__pointCloudsStandalone = true;</script>\n  ${bridgeTag}`)
  .replace(fallbackMarker, (_match, start, end) => `${start}\nif (!window.PointCloudsKessho) {\n${minifiedBridge}\n}\n${end}`);

await mkdir(join(output, 'images'), { recursive: true });
await Promise.all([
  writeFile(join(output, 'index.html'), html),
  writeFile(join(output, 'shared/kessho-site-bridge.js'), minifiedBridge),
  ...['patrick-chang-performance-640.jpg', 'patrick-chang-performance-1000.jpg'].map(name =>
    copyFile(join(root, 'point-clouds/images', name), join(output, 'images', name))),
]);

console.log('Built Point Clouds in dist-point-clouds/ (7 files).');
console.log('Upload the folder contents to your website root. Preview: npm run preview:point-clouds');
