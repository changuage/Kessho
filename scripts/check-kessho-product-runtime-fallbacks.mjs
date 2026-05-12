import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const host = readFileSync(resolve(root, 'src/audio/coreProductEngineHost.ts'), 'utf8');
const fallbackDiagnostics = readFileSync(resolve(root, 'src/audio/CoreProductFallbackDiagnostics.ts'), 'utf8');
const appRuntime = readFileSync(resolve(root, 'src/audio/runtime.ts'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-runtime-fallback-classification.md'), 'utf8');
const uiCallsiteFiles = [
  'src/App.tsx',
  'src/ui/CpuOverlay.tsx',
  'src/ui/drums/DrumPage.tsx',
  'src/ui/synth/SynthPage.tsx',
  'src/ui/granular/GranularPage.tsx',
  'src/ui/routing/MidiRoutingPanel.tsx',
  'src/audio/sonicParityHarness.ts',
  'src/ui/presetUtils.ts',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function methodBody(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const definition = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:function\\s+)?(?:private\\s+)?(?:async\\s+)?${escaped}\\s*\\(`).exec(source);
  assert(definition, `missing ${name}()`);
  const open = source.indexOf('{', definition.index);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${name}() body was not balanced`);
}

function hostMethodNames() {
  const start = host.indexOf('class CoreProductEngineHost');
  const end = host.indexOf('const host = new CoreProductEngineHost');
  assert(start >= 0 && end > start, 'CoreProductEngineHost class body not found');
  const body = host.slice(start, end);
  const names = new Set();
  for (const match of body.matchAll(/^\s*(?:private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    names.add(match[1]);
  }
  return names;
}

function usedAudioEngineMethods() {
  const names = new Set();
  for (const path of uiCallsiteFiles) {
    const source = readFileSync(resolve(root, path), 'utf8');
    for (const match of source.matchAll(/audioEngine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      names.add(match[1]);
    }
    if (path === 'src/audio/sonicParityHarness.ts') {
      for (const match of source.matchAll(/\bengine\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

for (const token of [
  'type RuntimeFallbackClassification',
  "'safe-visual-fallback'",
  "'temporary-missing-product-telemetry'",
  "'reference-only-web-ts-behavior'",
  "'forbidden-production-fallback'",
  'reportedRuntimeFallbacks',
  'classifyCoreProductRuntimeFallback(property',
  'runtimeFallbackIsDevelopmentError(classification',
  'reportRuntimeFallback(method:',
]) {
  assert(`${host}\n${fallbackDiagnostics}`.includes(token), `runtime fallback classifier is missing ${token}`);
}

const classifyBody = methodBody(fallbackDiagnostics, 'classifyCoreProductRuntimeFallback');
assert(classifyBody.includes("property.startsWith('get')"), 'getter fallbacks must be explicitly classified');
assert(classifyBody.includes("'temporary-missing-product-telemetry'"), 'telemetry/debug getter fallbacks must be classified');
assert(classifyBody.includes("'safe-visual-fallback'"), 'safe visual getter fallbacks must be classified');
assert(classifyBody.includes('/^(set|update|reset|dice|start|stop|resume|suspend|trigger|push|load|register|ensure|audition)/'), 'audio-critical method prefixes must be forbidden');
assert(classifyBody.includes("'reference-only-web-ts-behavior'"), 'non-critical legacy fallback classification must exist');

const devErrorBody = methodBody(fallbackDiagnostics, 'runtimeFallbackIsDevelopmentError');
assert(devErrorBody.includes("classification === 'forbidden-production-fallback'"), 'only forbidden production fallbacks should throw in development');

const reportBody = methodBody(host, 'reportRuntimeFallback');
for (const token of [
  'this.unsupportedControlCount += 1',
  'this.reportedRuntimeFallbacks.has(method)',
  'this.reportedRuntimeFallbacks.add(method)',
  'dev || firstReport',
  'runtimeFallbackIsDevelopmentError(classification)',
  'throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`)',
]) {
  assert(reportBody.includes(token), `reportRuntimeFallback() is missing ${token}`);
}

const proxyBody = host.slice(host.indexOf('export const coreProductEngineHost = new Proxy'));
for (const token of [
  'const classification = classifyCoreProductRuntimeFallback(property);',
  'host.reportRuntimeFallback(property, classification);',
  "if (property.startsWith('get'))",
]) {
  assert(proxyBody.includes(token), `core-product proxy fallback is missing ${token}`);
}

const rangeBody = methodBody(host, 'reportUnsupportedRangeKey');
assert(rangeBody.includes('forbidden-production-fallback'), 'unmapped modulation range keys must be classified as forbidden production fallbacks');
assert(rangeBody.includes('this.unsupportedControlCount += 1'), 'unmapped modulation range keys must increment diagnostics');

const missingRequiredMethods = [...usedAudioEngineMethods()]
  .filter((name) => !hostMethodNames().has(name))
  .sort();
assert(
  missingRequiredMethods.length === 0,
  `core-product host is missing required app-facing AudioEngine methods: ${missingRequiredMethods.join(', ')}`,
);

for (const token of [
  'import { isCoreProductRangeKeySupported }',
  'coreProductSupportsRuntimeRangeKey(key',
  "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(keyStr)",
  "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(key)",
  'dualModeSupported',
]) {
  assert(app.includes(token), `App core-product unsupported-control gating is missing ${token}`);
}

for (const section of [
  '## safe-visual-fallback',
  '## temporary-missing-product-telemetry',
  '## reference-only-web-ts-behavior',
  '## forbidden-production-fallback',
  'In development, these throw',
  'In production, they increment `unsupportedControlCount` and log once',
  'Required App callsites are statically audited against `CoreProductEngineHost`',
  'Unsupported dual-mode slider ranges are hidden in `core-product`',
]) {
  assert(doc.includes(section), `runtime fallback documentation is missing ${section}`);
}

assert(!appRuntime.includes('missingNoopMethods'), 'runtime must not keep missing-method no-op fallbacks');

console.log('Kessho Product runtime fallback checks passed');
