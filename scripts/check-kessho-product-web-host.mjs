import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => { if (!condition) failures.push(message); };

function collectSourceFiles(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

function sourceImports(relativePath) {
  const source = ts.createSourceFile(
    relativePath,
    read(relativePath),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) imports.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

const requiredFiles = [
  'src/audio/coreProductEngineHost.ts',
  'src/audio/coreProductRuntime.ts',
  'src/audio/product/WebProductEngine.ts',
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/ProductEngineProxy.ts',
  'src/audio/product/host/CoreProductAssetRegistrar.ts',
  'src/audio/product/host/CoreProductAssetReadiness.ts',
  'src/audio/product/host/CoreProductHostLifecycleCoordinator.ts',
  'src/audio/product/host/CoreProductSequencerVisualBridge.ts',
  'src/audio/product/host/CoreProductGeneratedSequencerCaptureTelemetryHistory.ts',
  'src/ui/useProductRuntimePageBridgesCore.ts',
  'src/ui/useProductRuntimePageRuntimeBridges.ts',
  'src/ui/useProductRuntimeCallbackSurfaces.ts',
  'src/ui/useProductRuntimeLifecycleSurface.ts',
  'src/ui/keyboard/useKeyboardScope.ts',
  'src/ui/useLazySequencerTransport.ts',
  'src/ui/sequencer/sequencerTransportPolicy.ts',
];
for (const file of requiredFiles) assert(fs.existsSync(path.join(root, file)), `${file} must exist`);

const host = read('src/audio/coreProductEngineHost.ts');
const runtime = read('src/audio/coreProductRuntime.ts');
const webProductEngine = read('src/audio/product/WebProductEngine.ts');
const productPort = [
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/ports/ProductLifecyclePort.ts',
  'src/audio/product/ports/ProductCommandPort.ts',
  'src/audio/product/ports/ProductControlPort.ts',
  'src/audio/product/ports/ProductAssetPort.ts',
  'src/audio/product/ports/ProductTelemetryPort.ts',
  'src/audio/product/ports/ProductSequencerPort.ts',
  'src/audio/product/ports/ProductModulationPort.ts',
  'src/audio/product/ports/ProductDiagnosticsPort.ts',
  'src/audio/product/ports/ProductEnginePorts.ts',
].map(read).join('\n');
const viteConfig = read('vite.config.ts');
const app = read('src/App.tsx');
const productPageBridges = read('src/ui/useProductRuntimePageRuntimeBridges.ts');
const productCallbacks = read('src/ui/useProductRuntimeCallbackSurfaces.ts');
const assetRegistrar = read('src/audio/product/host/CoreProductAssetRegistrar.ts');

assert(host.includes('export const coreProductEngineHost = createCoreProductEngineHostProxy(host)'), 'Product host must expose the structured host proxy');
assert(host.includes('latestProductSnapshot'), 'Product host must retain the latest authoritative snapshot for lifecycle callbacks');
assert(runtime.includes('document.visibilityState'), 'Product runtime polling must respect document visibility');
assert(runtime.includes('setVisualTelemetryActive'), 'Product runtime must park visual telemetry independently from audio transport');
assert(webProductEngine.includes('coreProductRuntimeHostPort'), 'WebProductEngine must route through Core Product host');
assert(productPageBridges.includes('useProductRuntimePageBridgesCore'), 'Product page runtime must use the neutral bridge composition');
assert(productCallbacks.includes('useRuntimeSequencerProjectionCallbacks()'), 'Product callback surfaces must use canonical sequencer projections');
assert(assetRegistrar.includes('hasMissingAssetsForStates'), 'Product assets must fail readiness explicitly instead of silently fabricating playback');
assert(viteConfig.includes('referenceAudioRuntime.unavailable'), 'Production builds must swap the reference runtime for the unavailable module');
assert(app.includes('React.lazy'), 'Development CPU diagnostics must remain lazy-loaded');
assert(!/:\s*(AudioNode|AudioContext|AudioWorkletNode|MediaStream)\b/.test(productPort), 'ProductEnginePort must not expose raw browser audio objects');

for (const file of collectSourceFiles('src/ui')) {
  if (file.startsWith('src/ui/referenceRuntime/')) continue;
  for (const specifier of sourceImports(file)) {
    assert(!/useSelectedAudioEngine|SelectedProductRuntime/.test(specifier), `${file} imports a retired runtime wrapper: ${specifier}`);
  }
}

if (failures.length > 0) {
  console.error(`Kessho Product web-host checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log('Kessho Product web-host checks passed');
