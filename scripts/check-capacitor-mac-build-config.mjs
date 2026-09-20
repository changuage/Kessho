import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, resolveConfig, validateConfig } from './build-capacitor-mac.mjs';

const bundlerSource = readFileSync(resolve('scripts/build-capacitor-mac.mjs'), 'utf8');
assert.match(bundlerSource, /@executable_path\/\.\.\/Frameworks/);

const releaseArgs = parseArgs([
  '--release',
  '--arch',
  'universal',
  '--version',
  '1.2.3',
  '--build-number',
  '42',
  '--product-name',
  'Kessho',
  '--signing-identity',
  'Developer ID Application: Example',
  '--notarize',
  '--notary-profile',
  'release-profile',
]);
const release = resolveConfig(releaseArgs, { MACOS_BUILD_MODE: 'adhoc' });
assert.equal(release.mode, 'release');
assert.equal(release.arch, 'universal');
assert.equal(release.version, '1.2.3');
assert.equal(release.buildNumber, '42');
assert.equal(release.versionSupplied, true);
assert.equal(release.buildNumberSupplied, true);
assert.equal(release.notarize, true);
assert.doesNotThrow(() => validateConfig(release));

const adhoc = resolveConfig(parseArgs(['--mode', 'adhoc', '--arch', 'arm64']), {
  MACOS_BUILD_MODE: 'release',
});
assert.equal(adhoc.mode, 'adhoc');
assert.equal(adhoc.versionSupplied, false);
assert.equal(adhoc.buildNumberSupplied, false);
assert.doesNotThrow(() => validateConfig(adhoc));

assert.throws(() => validateConfig({
  ...adhoc,
  mode: 'release',
  version: '1.0.0',
  buildNumber: '1',
  versionSupplied: true,
  buildNumberSupplied: true,
  signingIdentity: '-',
}), /signing identity/);
assert.throws(() => validateConfig({ ...adhoc, arch: 'i386' }), /arch/);
assert.throws(() => validateConfig({
  ...release,
  notarize: true,
  notaryProfile: null,
}), /notary-profile/);

console.log('Capacitor macOS build configuration checks passed');
