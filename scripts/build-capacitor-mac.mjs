import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const root = resolve(scriptDir, '..');
export const packageDir = resolve(root, 'CapacitorMac');
export const infoPlist = resolve(packageDir, 'Info.plist');
export const distDir = resolve(root, 'dist');
export const executableName = 'KesshoCapacitorMac';

const macOSVersion = '14.0';
const architectureTriples = {
  arm64: `arm64-apple-macosx${macOSVersion}`,
  x86_64: `x86_64-apple-macosx${macOSVersion}`,
};
const supportedArchitectures = new Set([...Object.keys(architectureTriples), 'universal']);
const defaultArchitecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null;

const optionAliases = {
  mode: 'mode',
  release: 'release',
  arch: 'arch',
  version: 'version',
  'build-number': 'buildNumber',
  'product-name': 'productName',
  'signing-identity': 'signingIdentity',
  'notary-profile': 'notaryProfile',
  notarize: 'notarize',
  archive: 'archive',
  validate: 'validateOnly',
  help: 'help',
};

const booleanOptions = new Set(['release', 'notarize', 'archive', 'validateOnly', 'help']);

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  return execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

function runCapture(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`);
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function firstEnvironmentValue(name, environment) {
  const value = environment[name];
  return value === undefined || value === '' ? null : value;
}

function readPlistValue(key) {
  return runCapture('plutil', ['-extract', key, 'raw', '-o', '-', infoPlist]);
}

export function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);

    const [rawName, inlineValue] = token.slice(2).split('=', 2);
    const name = optionAliases[rawName];
    if (!name) throw new Error(`Unknown option: --${rawName}`);

    if (booleanOptions.has(name)) {
      if (inlineValue !== undefined) throw new Error(`Option --${rawName} does not take a value`);
      parsed[name] = true;
      continue;
    }

    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Option --${rawName} requires a value`);
    parsed[name] = value;
  }

  return parsed;
}

export function validateConfig(config) {
  const errors = [];

  if (!['adhoc', 'release'].includes(config.mode)) errors.push('mode must be adhoc or release');
  if (!supportedArchitectures.has(config.arch)) errors.push('arch must be arm64, x86_64, or universal');
  if (!config.productName || !config.productName.trim() || config.productName.length > 255 || /[\\/\0-\x1f]/.test(config.productName)) {
    errors.push('product name must be non-empty, at most 255 characters, and contain no path separators');
  }
  if (!config.version || !/^\d+(?:\.\d+){0,2}$/.test(config.version)) {
    errors.push('version must be one to three dot-separated numeric components');
  }
  if (!config.buildNumber || !/^\d+(?:\.\d+){0,3}$/.test(config.buildNumber)) {
    errors.push('build number must be one to four dot-separated numeric components');
  }

  if (config.mode === 'release') {
    if (!config.versionSupplied) errors.push('release mode requires --version or MACOS_APP_VERSION');
    if (!config.buildNumberSupplied) errors.push('release mode requires --build-number or MACOS_BUILD_NUMBER');
    if (!config.signingIdentity || config.signingIdentity === '-') {
      errors.push('release mode requires a Developer ID Application signing identity');
    } else if (!config.signingIdentity.startsWith('Developer ID Application:') && !/^[0-9A-Fa-f]{40}$/.test(config.signingIdentity)) {
      errors.push('release signing identity must be a Developer ID Application name or certificate hash');
    }
  } else if (config.signingIdentity && config.signingIdentity !== '-') {
    errors.push('adhoc mode only supports the ad-hoc signing identity (-)');
  }

  if (config.notarize && config.mode !== 'release') errors.push('notarization is only available in release mode');
  if (config.notarize && !config.notaryProfile) errors.push('--notarize requires --notary-profile or MACOS_NOTARY_PROFILE');
  if (config.notaryProfile && !config.notarize) errors.push('a notary profile is only used with --notarize');

  if (errors.length > 0) throw new Error(`Invalid macOS build configuration:\n- ${errors.join('\n- ')}`);
  return config;
}

export function resolveConfig(parsed = {}, environment = process.env) {
  const templateProductName = readPlistValue('CFBundleDisplayName');
  const templateVersion = readPlistValue('CFBundleShortVersionString');
  const templateBuildNumber = readPlistValue('CFBundleVersion');
  if (parsed.mode && parsed.release && parsed.mode !== 'release') {
    throw new Error('Conflicting mode options');
  }
  const mode = parsed.mode ?? (parsed.release ? 'release' : firstEnvironmentValue('MACOS_BUILD_MODE', environment) ?? 'adhoc');
  const arch = parsed.arch ?? firstEnvironmentValue('MACOS_ARCH', environment) ?? defaultArchitecture;
  const versionValue = parsed.version ?? firstEnvironmentValue('MACOS_APP_VERSION', environment);
  const buildNumberValue = parsed.buildNumber ?? firstEnvironmentValue('MACOS_BUILD_NUMBER', environment);
  const productName = parsed.productName ?? firstEnvironmentValue('MACOS_PRODUCT_NAME', environment) ?? templateProductName;
  const signingIdentity = parsed.signingIdentity ?? firstEnvironmentValue('MACOS_SIGNING_IDENTITY', environment) ?? '-';
  const notaryProfile = parsed.notaryProfile ?? firstEnvironmentValue('MACOS_NOTARY_PROFILE', environment);
  const notarize = parsed.notarize ?? environment.MACOS_NOTARIZE === '1';
  const archive = parsed.archive === true || environment.MACOS_ARCHIVE === '1' || mode === 'release';

  const appBasename = `${productName}.app`;
  const outputDir = resolve(root, 'build/macos');
  const appDir = resolve(outputDir, appBasename);
  const artifactName = `${productName.replace(/[^A-Za-z0-9._-]+/g, '-')}-${versionValue ?? 'unversioned'}-${arch}.zip`;

  return {
    mode,
    arch,
    version: versionValue ?? (mode === 'release' ? null : templateVersion),
    buildNumber: buildNumberValue ?? (mode === 'release' ? null : templateBuildNumber),
    versionSupplied: typeof versionValue === 'string' && versionValue.length > 0,
    buildNumberSupplied: typeof buildNumberValue === 'string' && buildNumberValue.length > 0,
    productName,
    signingIdentity,
    notaryProfile,
    notarize,
    archive: archive || mode === 'release',
    outputDir,
    appDir,
    artifactPath: resolve(outputDir, artifactName),
    validateOnly: parsed.validateOnly === true,
  };
}

function parseSigningIdentities(output) {
  return [...output.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"([^"]+)"/gm)]
    .map((match) => ({ hash: match[1], name: match[2] }));
}

function validateSigningIdentity(identity) {
  const identities = parseSigningIdentities(runCapture('security', ['find-identity', '-v', '-p', 'codesigning']));
  const match = identities.find(({ hash, name }) => hash === identity || name === identity);
  if (!match || !match.name.startsWith('Developer ID Application:')) {
    throw new Error('Release signing identity must be an installed Developer ID Application certificate');
  }
  return match;
}

function createAppIcon(resourcesDir, iconsetDir) {
  const sourceIcon = resolve(root, 'public/icon-512.png');
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

function buildSwiftExecutable(arch) {
  const triple = architectureTriples[arch];
  const scratch = resolve(root, 'build/swiftpm', `kessho-capacitor-mac-${arch}`);
  mkdirSync(dirname(scratch), { recursive: true });
  const buildArgs = [
    'build',
    '--disable-build-manifest-caching',
    '--package-path',
    packageDir,
    '--scratch-path',
    scratch,
    '--triple',
    triple,
    '-c',
    'release',
  ];
  run('swift', buildArgs);
  const binPath = runCapture('swift', ['build', '--show-bin-path', '--package-path', packageDir, '--scratch-path', scratch, '--triple', triple, '-c', 'release']);
  const executablePath = resolve(binPath.split('\n').at(-1), executableName);
  if (!existsSync(executablePath)) throw new Error(`Swift build did not produce ${executablePath}`);
  const frameworkPath = resolve(dirname(executablePath), 'Sparkle.framework');
  if (!existsSync(frameworkPath)) throw new Error(`Swift build did not produce ${frameworkPath}`);
  return { executablePath, frameworkPath };
}

function mergeExecutables(executables, outputPath) {
  if (executables.length === 1) {
    cpSync(executables[0], outputPath);
  } else {
    run('lipo', ['-create', ...executables, '-output', outputPath]);
  }
  const archs = runCapture('lipo', ['-archs', outputPath]).split(/\s+/).filter(Boolean).sort();
  const expected = executables.length === 1 ? [pathArchitecture(executables[0])] : ['arm64', 'x86_64'];
  if (archs.join(',') !== expected.sort().join(',')) {
    throw new Error(`Executable architecture mismatch: expected ${expected.join(',')}, got ${archs.join(',')}`);
  }
}

function pathArchitecture(executablePath) {
  const output = runCapture('lipo', ['-archs', executablePath]);
  const archs = output.split(/\s+/).filter(Boolean);
  if (archs.length !== 1 || !supportedArchitectures.has(archs[0])) throw new Error(`Unexpected executable architecture: ${output}`);
  return archs[0];
}

function writeBundle(config, buildProducts) {
  const contentsDir = resolve(config.appDir, 'Contents');
  const macOSDir = resolve(contentsDir, 'MacOS');
  const resourcesDir = resolve(contentsDir, 'Resources');
  const frameworksDir = resolve(contentsDir, 'Frameworks');
  const iconsetDir = resolve(config.outputDir, `${config.productName}.iconset`);
  rmSync(config.appDir, { recursive: true, force: true });
  mkdirSync(macOSDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  mkdirSync(frameworksDir, { recursive: true });
  const bundledExecutable = resolve(macOSDir, executableName);
  mergeExecutables(buildProducts.map(({ executablePath }) => executablePath), bundledExecutable);
  run('install_name_tool', ['-add_rpath', '@executable_path/../Frameworks', bundledExecutable]);
  run('ditto', [buildProducts[0].frameworkPath, resolve(frameworksDir, 'Sparkle.framework')]);
  cpSync(infoPlist, resolve(contentsDir, 'Info.plist'));
  for (const [key, value] of [
    ['CFBundleDisplayName', config.productName],
    ['CFBundleName', config.productName],
    ['CFBundleShortVersionString', config.version],
    ['CFBundleVersion', config.buildNumber],
  ]) {
    run('plutil', ['-replace', key, '-string', value, resolve(contentsDir, 'Info.plist')]);
  }
  createAppIcon(resourcesDir, iconsetDir);
  cpSync(distDir, resolve(resourcesDir, 'WebApp'), {
    recursive: true,
    filter: (source) => basename(source) !== '.DS_Store',
  });
  writeFileSync(resolve(contentsDir, 'PkgInfo'), 'APPL????');
  run('chmod', ['+x', resolve(macOSDir, executableName)]);
}

function signAndVerify(config) {
  const signArgs = ['--force'];
  if (config.mode === 'release') signArgs.push('--options', 'runtime', '--timestamp');
  signArgs.push('--sign', config.signingIdentity, config.appDir);
  run('codesign', signArgs);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', config.appDir]);
}

function createZip(config) {
  rmSync(config.artifactPath, { force: true });
  run('ditto', ['-c', '-k', '--keepParent', '--sequesterRsrc', '--norsrc', config.appDir, config.artifactPath]);
}

function gatekeeperVerify(config) {
  try {
    run('spctl', ['--assess', '--type', 'execute', '--verbose=4', config.appDir]);
  } catch (error) {
    if (config.mode === 'release') throw error;
    console.warn('Gatekeeper rejected the local ad-hoc app (expected without Developer ID signing/notarization).');
  }
}

function notarizeAndStaple(config) {
  run('xcrun', ['notarytool', 'submit', config.artifactPath, '--keychain-profile', config.notaryProfile, '--wait']);
  run('xcrun', ['stapler', 'staple', config.appDir]);
  run('xcrun', ['stapler', 'validate', config.appDir]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', config.appDir]);
  createZip(config);
}

export function printHelp() {
  console.log(`Usage: node scripts/build-capacitor-mac.mjs [options]

Default mode builds an arm64/x86_64 host app with local ad-hoc signing.
Release mode requires explicit version, build number, and Developer ID identity.

Options:
  --mode adhoc|release       Build mode (default: adhoc)
  --release                  Shorthand for --mode release
  --arch arm64|x86_64|universal
  --version <value>          CFBundleShortVersionString (release: required)
  --build-number <value>     CFBundleVersion (release: required)
  --product-name <value>     Final app/bundle/artifact name
  --signing-identity <value> Developer ID identity (release); '-' is ad-hoc
  --notarize                 Submit ZIP and staple the app ticket
  --archive                  Create a ZIP (also implied by release mode)
  --notary-profile <name>    Existing notarytool keychain profile
  --validate                 Validate arguments without building
  --help

Environment equivalents use MACOS_* names (for example MACOS_APP_VERSION,
MACOS_BUILD_NUMBER, MACOS_SIGNING_IDENTITY, and MACOS_NOTARY_PROFILE).
`);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return;
  }
  if (process.platform !== 'darwin') throw new Error('The macOS app bundler must run on macOS');
  if (!defaultArchitecture) throw new Error(`Unsupported host architecture: ${process.arch}; pass --arch explicitly on a supported macOS host`);

  const config = validateConfig(resolveConfig(parsed));
  if (config.validateOnly) {
    console.log(JSON.stringify({
      mode: config.mode,
      arch: config.arch,
      productName: config.productName,
      version: config.version,
      buildNumber: config.buildNumber,
      notarize: config.notarize,
    }, null, 2));
    return;
  }
  if (config.mode === 'release') validateSigningIdentity(config.signingIdentity);

  run('npm', ['run', 'build']);
  if (!existsSync(distDir)) throw new Error('dist was not created by npm run build.');

  const architectures = config.arch === 'universal' ? ['arm64', 'x86_64'] : [config.arch];
  const executables = architectures.map(buildSwiftExecutable);
  writeBundle(config, executables);
  signAndVerify(config);
  if (config.archive) {
    createZip(config);
  }
  if (config.notarize) notarizeAndStaple(config);
  gatekeeperVerify(config);

  console.log(`\nCreated ${config.appDir}`);
  if (config.archive) console.log(`Created ${config.artifactPath}`);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) main().catch((error) => {
  console.error(`\nmacOS build failed: ${error.message}`);
  process.exitCode = 1;
});
