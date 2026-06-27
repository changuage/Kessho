#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const checklistPath = 'cpp/KesshoCore/REALTIME_SAFETY.md';
const sourceRoots = ['cpp/KesshoCore/src', 'cpp/KesshoCore/include'];
const sourceExtensions = new Set(['.cpp', '.h', '.hpp', '.mm']);
const failures = [];
let scannedFunctionCount = 0;

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function walk(dir, out = []) {
  const absolute = resolve(root, dir);
  if (!existsSync(absolute)) return out;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'build' || entry.name === '.build') continue;
    const full = join(absolute, entry.name);
    const rel = relative(root, full);
    if (entry.isDirectory()) walk(rel, out);
    else if (sourceExtensions.has(extname(entry.name))) out.push(rel);
  }
  return out;
}

function lineForOffset(source, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function previousBoundary(source, openIndex) {
  let index = openIndex - 1;
  while (index >= 0) {
    const char = source[index];
    if (char === ';' || char === '}' || char === '{') return index + 1;
    index -= 1;
  }
  return 0;
}

function isFunctionSignature(signature) {
  const normalized = signature.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('(') || !normalized.includes(')')) return false;
  if (/^(if|for|while|switch|catch|namespace|class|struct|enum|union)\b/.test(normalized)) return false;
  if (/^(do|else|try)\b/.test(normalized)) return false;
  return true;
}

function signatureName(signature) {
  const normalized = signature.replace(/\s+/g, ' ').trim();
  const beforeArgs = normalized.slice(0, normalized.lastIndexOf('(')).trim();
  const match = beforeArgs.match(/([~A-Za-z_][A-Za-z0-9_:~]*)$/);
  return match?.[1] ?? normalized;
}

function isRenderCandidate(name, signature, relPath) {
  const lowerName = name.toLowerCase();
  const haystack = `${name} ${signature}`;
  void relPath;
  if (/(^|_|::)(prepare|create|destroy|reset|load|set|apply|register|unregister|constructor)(_|$|::)/i.test(lowerName) ||
      /(?:^|::|_)operator=/.test(lowerName)) {
    return false;
  }
  return /\b(render|process|mix|tick|generate|consume|drain|route|schedule|voice|sequencer|telemetry)\w*/i.test(haystack);
}

function functionBodies(source, relPath) {
  const bodies = [];
  for (let openIndex = source.indexOf('{'); openIndex >= 0; openIndex = source.indexOf('{', openIndex + 1)) {
    const signatureStart = previousBoundary(source, openIndex);
    const signature = source.slice(signatureStart, openIndex);
    if (!isFunctionSignature(signature)) continue;
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) continue;
    const name = signatureName(signature);
    if (!isRenderCandidate(name, signature, relPath)) continue;
    bodies.push({
      name,
      signature: signature.replace(/\s+/g, ' ').trim(),
      body: source.slice(openIndex + 1, closeIndex),
      line: lineForOffset(source, openIndex),
    });
  }
  return bodies;
}

const disallowedRenderPatterns = [
  { label: 'heap allocation', pattern: /\bnew\s*(?:\(|[A-Za-z_])|delete\s+|malloc\s*\(|calloc\s*\(|realloc\s*\(|free\s*\(/ },
  { label: 'container growth', pattern: /\.(?:push_back|emplace_back|resize|reserve)\s*\(|std::vector\s*</ },
  { label: 'string formatting', pattern: /std::string|std::ostringstream|std::stringstream|snprintf\s*\(|sprintf\s*\(/ },
  { label: 'lock or blocking sync', pattern: /std::mutex|std::lock_guard|std::unique_lock|std::condition_variable/ },
  { label: 'stdout/stderr/platform logging', pattern: /std::cout|std::cerr|printf\s*\(|fprintf\s*\(|NSLog\s*\(/ },
  { label: 'exception throw', pattern: /\bthrow\b/ },
  { label: 'native or JS bridge call', pattern: /WKWebView|evaluateJavaScript|Capacitor|objc_msgSend|JSObject|Swift/ },
];

function checkChecklist() {
  assert(existsSync(resolve(root, checklistPath)), `${checklistPath} is missing`);
  if (!existsSync(resolve(root, checklistPath))) return;
  const checklist = read(checklistPath);
  for (const token of [
    'Heap allocation or deallocation',
    'Container growth or string formatting',
    'Locks and blocking synchronization',
    'JS, Swift, Objective-C, WebKit, or Capacitor bridge calls',
    'Preallocate voices, events, buffers, delay lines, and scratch memory',
    'fixed-capacity event queues',
    'double-buffered parameter snapshots',
    'diagnostics to fixed-size counters',
    'npm run core:product:realtime-safety',
  ]) {
    assert(checklist.includes(token), `${checklistPath} is missing checklist token: ${token}`);
  }
}

function checkPackageScript() {
  const packageJson = JSON.parse(read('package.json'));
  assert(
    packageJson.scripts?.['core:product:realtime-safety'] === 'node scripts/check-kessho-product-realtime-safety.mjs',
    'package.json must expose core:product:realtime-safety',
  );
  assert(
    typeof packageJson.scripts?.['architecture:strict'] === 'string' &&
      packageJson.scripts['architecture:strict'].includes('npm run core:product:realtime-safety'),
    'architecture:strict must include core:product:realtime-safety',
  );
}

function checkRenderSources() {
  const files = sourceRoots.flatMap((dir) => walk(dir));
  for (const relPath of files) {
    if (relPath.includes('/tests/')) continue;
    const source = read(relPath);
    const bodies = functionBodies(source, relPath);
    scannedFunctionCount += bodies.length;
    for (const body of bodies) {
      for (const { label, pattern } of disallowedRenderPatterns) {
        if (pattern.test(body.body)) {
          failures.push(`${relPath}:${body.line}: render-path ${body.name} uses disallowed ${label}`);
        }
      }
    }
  }
  assert(scannedFunctionCount > 0, 'realtime-safety guard did not scan any render/process functions');
}

function checkRequiredRuntimeArtifacts() {
  const productRender = read('cpp/KesshoCore/src/product/KesshoProductRender.cpp');
  const productApi = read('cpp/KesshoCore/src/product/KesshoProductApi.cpp');
  const cpuBudget = read('cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp');
  assert(productRender.includes('KesshoProductEngine::render('), 'Product render entry point is missing');
  assert(productApi.includes('kessho_product_render('), 'Product C ABI render entry point is missing');
  assert(cpuBudget.includes('missed_quantums') || cpuBudget.includes('missedQuantum'), 'CPU budget test must track missed render quantums');
}

checkChecklist();
checkPackageScript();
checkRenderSources();
checkRequiredRuntimeArtifacts();

if (failures.length > 0) {
  console.error('KesshoCore realtime-safety violations:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`KesshoCore realtime-safety checks passed (${scannedFunctionCount} render/process functions scanned)`);
