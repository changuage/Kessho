import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, token, label) {
  assert(source.includes(token), `${label} must include ${token}`);
}

const requirementsPath = 'docs/product-core/background-audio.md';
const matrixPath = 'docs/product-core/background-audio-test-matrix.md';
const evidencePath = 'docs/product-core/background-audio-device-evidence.md';
const requirements = read(requirementsPath);
const matrix = read(matrixPath);
const evidence = read(evidencePath);

for (const token of [
  'best-effort only',
  'not guaranteed',
  'Foreground playback',
  'Wake Lock',
  'Media Session metadata',
  'Media Session play/pause/stop actions',
  'Page Visibility diagnostics',
  'Page Lifecycle diagnostics',
  'graceful resume after suspension',
  'Do not promise guaranteed browser/mobile background playback',
]) {
  assertIncludes(requirements, token, requirementsPath);
}

for (const token of [
  'NativeProductRuntime',
  'native C++ Product Core library/framework',
  'kessho_product_render',
  'No realtime audio buffers pass through JS or the Capacitor bridge',
  'lock-free event queue',
  'telemetry double buffer',
  'Native asset registration happens off the audio thread',
  'AVAudioSession',
  'Now Playing',
  'remote commands',
  'Route change and interruption handling',
  'Device tests',
  'supports_native_bridge` stays `0`',
  'supportsNativeBridge: false',
]) {
  assertIncludes(requirements, token, requirementsPath);
}

const requiredRows = [
  ['iOS Safari', 'foreground', 'best-effort pass'],
  ['iOS Safari', 'screen lock', 'best-effort / not guaranteed'],
  ['iOS Safari', 'app switch', 'best-effort / not guaranteed'],
  ['Android Chrome', 'foreground', 'best-effort pass'],
  ['Android Chrome', 'screen lock', 'best-effort / not guaranteed'],
  ['Capacitor iOS native', 'screen lock', 'guaranteed if native renderer active'],
  ['Capacitor iOS native', 'app background', 'guaranteed within iOS background audio rules'],
  ['Capacitor iOS native', 'Control Center play/pause', 'pass'],
  ['Capacitor iOS native', 'AirPods route change', 'pass'],
  ['macOS native', 'app hidden/minimized', 'pass'],
  ['macOS native', 'sleep/wake', 'safe recovery'],
];

for (const [platform, scenario, expected] of requiredRows) {
  assert(
    matrix.includes(`| ${platform} | ${scenario} | ${expected} | todo |`),
    `${matrixPath} must include ${platform} ${scenario} row with expected "${expected}"`,
  );
}

for (const line of matrix.split('\n')) {
  if (!line.startsWith('|')) continue;
  const isBrowserRow = line.includes('| iOS Safari |') || line.includes('| Android Chrome |');
  if (!isBrowserRow) continue;
  const hasGuaranteeWord = /\bguaranteed\b/i.test(line);
  const isExplicitlyNotGuaranteed = /\bnot guaranteed\b/i.test(line);
  assert(!hasGuaranteeWord || isExplicitlyNotGuaranteed, `${matrixPath} browser row must not imply a guarantee: ${line}`);
}

for (const token of [
  'manual/ear test',
  'first flaky or expensive failure',
  'Browser rows are not product guarantees',
]) {
  assertIncludes(matrix, token, matrixPath);
}

for (const token of [
  '?audioSession=debug&nativeProduct=diagnostic',
  'ios-native-foreground',
  'ios-native-screen-lock',
  'ios-native-app-background',
  'ios-native-control-center',
  'ios-native-route-change',
  'macos-native-hidden',
  'macos-native-sleep-wake',
  '`supports_native_bridge` must remain `0`',
]) {
  assertIncludes(evidence, token, evidencePath);
}

console.log('Kessho Product background audio docs checks passed');
