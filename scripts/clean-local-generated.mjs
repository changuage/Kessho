#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const archivedSwiftRoot = ['archive', 'native-swift', 'Kessho' + 'NativeSwift'].join('/');

const generatedPaths = [
  'build',
  'dist',
  '.swift-cache',
  `${archivedSwiftRoot}/.build`,
  `${archivedSwiftRoot}/.swiftpm-cache`,
  `${archivedSwiftRoot}/CapacitorSpike`,
  `${archivedSwiftRoot}/Kessho.xcodeproj/project.xcworkspace`,
  `${archivedSwiftRoot}/Kessho.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/configuration`,
  'CapacitorMac/.build',
  'CapacitorMac/.swiftpm',
  'ios/App/App/public',
  'ios/App/App/capacitor.config.json',
  'ios/App/App/config.xml',
  'ios/capacitor-cordova-ios-plugins',
  'ios/App/App.xcodeproj/xcuserdata',
  'ios/App/App.xcodeproj/project.xcworkspace/xcuserdata',
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/configuration',
  'ios/App/CapApp-SPM/.swiftpm',
  'plugins/kessho-capacitor-midi-routing/.swiftpm',
  'public/presets/DrumSynth',
  'public/presets/Lead4opFM',
  'src/ui/sliderLab',
  'tsc_errors.txt',
  'tsc_out.txt',
  'tsc_out2.txt',
  'tsc_s2.txt',
  'tsc_s2b.txt',
  'tscout.txt',
  'wasm_build_log.txt',
  'wasm_check.txt',
  'wasm/lead-fm/_ts1.txt',
  'wasm/lead-fm/build_log.txt',
  'wasm/soundscapes/build_log.txt',
  '.tmp_reverb_exports_check.cjs',
  '.tmp_wasm_compare.cjs',
  '.tmp_wasm_exports.cjs',
  '.DS_Store',
  'public/.DS_Store',
  'public/samples/.DS_Store',
];

let removed = 0;
let skippedTracked = 0;

function isTracked(relativePath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: root,
    stdio: 'ignore',
  });

  return result.status === 0;
}

for (const relativePath of generatedPaths) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  if (isTracked(relativePath)) {
    skippedTracked += 1;
    console.log(`skipped tracked path ${relativePath}`);
    continue;
  }

  rmSync(absolutePath, { recursive: true, force: true });
  removed += 1;
  console.log(`removed ${relativePath}`);
}

if (removed === 0) {
  console.log('No local generated output found.');
} else {
  console.log(`Removed ${removed} local generated path${removed === 1 ? '' : 's'}.`);
}

if (skippedTracked > 0) {
  console.log(`Skipped ${skippedTracked} tracked generated path${skippedTracked === 1 ? '' : 's'}; remove those with Git intentionally if they should leave the repository.`);
}
