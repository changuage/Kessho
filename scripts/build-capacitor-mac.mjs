import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const appName = 'Kessho Capacitor.app';
const packageDir = resolve(root, 'CapacitorMac');
const distDir = resolve(root, 'dist');
const buildRoot = resolve(root, 'build/macos');
const appDir = resolve(buildRoot, appName);
const contentsDir = resolve(appDir, 'Contents');
const macOSDir = resolve(contentsDir, 'MacOS');
const resourcesDir = resolve(contentsDir, 'Resources');
const swiftScratch = resolve(root, 'build/swiftpm/kessho-capacitor-mac');
const executableName = 'KesshoCapacitorMac';
const sourceIcon = resolve(root, 'public/icon-512.png');
const iconsetDir = resolve(buildRoot, 'KesshoCapacitor.iconset');

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

function createAppIcon() {
  if (!existsSync(sourceIcon)) {
    console.warn(`Skipping macOS app icon; missing ${sourceIcon}`);
    return;
  }

  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  const entries = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
  ];

  for (const [size, filename] of entries) {
    run('sips', ['-z', String(size), String(size), sourceIcon, '--out', resolve(iconsetDir, filename)]);
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', resolve(resourcesDir, 'AppIcon.icns')]);
  rmSync(iconsetDir, { recursive: true, force: true });
}

run('npm', ['run', 'build']);

if (!existsSync(distDir)) {
  throw new Error('dist was not created by npm run build.');
}

mkdirSync(dirname(swiftScratch), { recursive: true });
run('swift', [
  'build',
  '--package-path',
  packageDir,
  '--scratch-path',
  swiftScratch,
  '-c',
  'release',
]);

const builtExecutable = resolve(swiftScratch, 'release', executableName);
if (!existsSync(builtExecutable)) {
  throw new Error(`Swift build did not produce ${builtExecutable}`);
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(macOSDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

cpSync(builtExecutable, resolve(macOSDir, executableName));
cpSync(resolve(packageDir, 'Info.plist'), resolve(contentsDir, 'Info.plist'));
createAppIcon();
cpSync(distDir, resolve(resourcesDir, 'WebApp'), {
  recursive: true,
  filter: (source) => basename(source) !== '.DS_Store',
});
writeFileSync(resolve(contentsDir, 'PkgInfo'), 'APPL????');

try {
  run('chmod', ['+x', resolve(macOSDir, executableName)]);
  run('codesign', ['--force', '--deep', '--sign', '-', appDir]);
} catch (error) {
  console.warn('Ad-hoc signing failed; the app bundle was still created.');
}

console.log(`\nCreated ${appDir}`);
