import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const fail = process.argv.includes('--fail');
const gate = process.argv.includes('--gate');
const writeJson = process.argv.includes('--write-json');
const reportPath = resolve(root, 'docs/reports/kessho-product-unsupported-surface-latest.json');
const fallbackDiagnosticsPath = resolve(root, 'src/audio/CoreProductFallbackDiagnostics.ts');
const unsupportedSurfaceDocPath = resolve(root, 'docs/product-core/unsupported-surface.md');

const files = [
  'src/audio/coreProductEngineHost.ts',
  'src/audio/CoreProductFallbackDiagnostics.ts',
  'src/App.tsx',
  'src/audio/product/host/CoreProductHostDiagnostics.ts',
  'src/audio/product/WebProductEngine.ts',
].filter((file) => existsSync(resolve(root, file)));

const patternSpecs = [
  ['explicitlyUnsupportedGetter', /explicitlyUnsupportedGetter\(['"]([^'"]+)['"]\)/g, (source) => source],
  ['runtimeFallbackReport', /reportRuntimeFallback\(['"]([^'"]+)['"]/g, (source) => source],
  ['webAudioNodeSurface', /\b(?:AudioNode|GainNode|AnalyserNode|MediaStream|RecordableTrackSource)\b/g, maskCommentsAndStrings],
];

const findings = [];

function maskCommentsAndStrings(source) {
  let output = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') {
        output += '  ';
        index += 2;
        state = 'line-comment';
        continue;
      }
      if (char === '/' && next === '*') {
        output += '  ';
        index += 2;
        state = 'block-comment';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        output += ' ';
        index += 1;
        state = 'string';
        continue;
      }
      output += char;
      index += 1;
      continue;
    }
    if (state === 'line-comment') {
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 2;
        state = 'code';
        continue;
      }
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    if (state === 'string') {
      if (char === '\\') {
        output += next === '\n' ? ' \n' : '  ';
        index += 2;
        continue;
      }
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      if (char === quote) state = 'code';
    }
  }
  return output;
}

for (const file of files) {
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const [kind, pattern, selectSource] of patternSpecs) {
    const scannedSource = selectSource(source);
    for (const match of scannedSource.matchAll(pattern)) {
      const token = match[1] ?? match[0];
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({ file, line, kind, token });
    }
  }
}

function explicitUnsupportedGetterPolicies() {
  const source = readFileSync(fallbackDiagnosticsPath, 'utf8');
  const getters = new Set();
  for (const match of source.matchAll(/(\w+):\s*\{[^}]*classification:\s*'explicitly-unsupported-hidden'/g)) {
    getters.add(match[1]);
  }
  return getters;
}

function gateViolationsFor(findings) {
  if (!gate) return [];
  const documentedSurface = readFileSync(unsupportedSurfaceDocPath, 'utf8');
  const allowedUnsupportedGetters = explicitUnsupportedGetterPolicies();
  const violations = [];
  const observedUnsupportedGetters = new Set();

  for (const finding of findings) {
    if (finding.kind === 'webAudioNodeSurface') {
      violations.push({
        ...finding,
        reason: 'Product Core audited files must not expose Web Audio node/browser node types',
      });
      continue;
    }
    if (finding.kind === 'runtimeFallbackReport') {
      violations.push({
        ...finding,
        reason: 'Product Core audited files must not enter runtime fallback reporting paths',
      });
      continue;
    }
    if (finding.kind === 'explicitlyUnsupportedGetter') {
      observedUnsupportedGetters.add(finding.token);
      if (!allowedUnsupportedGetters.has(finding.token)) {
        violations.push({
          ...finding,
          reason: 'Explicit unsupported getter is missing from CORE_PRODUCT_GETTER_POLICIES',
        });
      }
      if (!documentedSurface.includes(`\`${finding.token}\``)) {
        violations.push({
          ...finding,
          reason: 'Explicit unsupported getter is missing from docs/product-core/unsupported-surface.md',
        });
      }
    }
  }

  for (const getter of allowedUnsupportedGetters) {
    if (!observedUnsupportedGetters.has(getter)) {
      violations.push({
        file: 'src/audio/CoreProductFallbackDiagnostics.ts',
        line: null,
        kind: 'staleUnsupportedPolicy',
        token: getter,
        reason: 'Policy lists an explicit unsupported getter that is no longer thrown by the audited host surface',
      });
    }
    if (!documentedSurface.includes(`\`${getter}\``)) {
      violations.push({
        file: 'docs/product-core/unsupported-surface.md',
        line: null,
        kind: 'undocumentedUnsupportedPolicy',
        token: getter,
        reason: 'Policy lists an explicit unsupported getter that is missing from the unsupported-surface ledger',
      });
    }
  }

  return violations;
}

const gateViolations = gateViolationsFor(findings);

const report = {
  generatedAt: new Date().toISOString(),
  failMode: fail,
  gateMode: gate,
  findingCount: findings.length,
  gateViolationCount: gateViolations.length,
  findings,
  gateViolations,
};

if (writeJson) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (findings.length) {
  console.log(JSON.stringify(report, null, 2));
  if (fail || gateViolations.length > 0) process.exitCode = 1;
} else {
  console.log('Kessho Product unsupported surface audit found no findings');
}
