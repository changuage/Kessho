import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { smokeCases } from './lib/kesshoProductWebGraphSmokeCases.mjs';
import { masterCases } from './lib/kesshoProductWebMasterCases.mjs';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const manifestPath = 'docs/kessho-product-web-audio-graph-parity.manifest.json';
const reportPath = 'docs/reports/kessho-product-web-audio-graph-parity-latest.json';
const smokeReportPath = 'docs/reports/kessho-product-web-graph-capture-smoke-latest.json';
const masterReportPath = 'docs/reports/kessho-product-web-master-corpus-latest.json';

const requiredDomainIds = [
  'granular',
  'spectralFreeze',
  'diffuseSourceSpatial',
  'soundscapeLayers',
  'delayAB',
  'reverbMacro',
  'drumSourceSends',
  'dynamicsSidechainMaster',
];

const validDomainStatuses = ['blocked', 'partial', 'proven', 'deferred'];

const requiredBoundaryKinds = [
  'sourceDry',
  'sourceReverbSend',
  'sourceDelayASend',
  'sourceDelayBSend',
  'sourceGranularSend',
  'fxInput',
  'fxOutput',
  'fxSend',
  'dynamicsInput',
  'dynamicsOutput',
  'masterPreLimiter',
  'masterPostLimiter',
];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function readJsonIfExists(path) {
  try {
    return readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function arrayIncludesAll(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  for (const item of expected) {
    assert(actual.includes(item), `${label} is missing ${item}`);
  }
}

function validateEvidence(entry, domainId, group) {
  assert(entry && typeof entry === 'object', `${domainId}.${group} evidence entry must be an object`);
  assert(typeof entry.file === 'string' && entry.file.length > 0, `${domainId}.${group} evidence is missing file`);
  assert(Array.isArray(entry.tokens) && entry.tokens.length > 0, `${domainId}.${group} evidence for ${entry.file} is missing tokens`);
  const source = read(entry.file);
  const missing = [];
  for (const token of entry.tokens) {
    if (!source.includes(token)) {
      missing.push(token);
    }
  }
  return {
    file: entry.file,
    tokenCount: entry.tokens.length,
    missing,
  };
}

function auditedCaseSets(report, label, fallbackCases, ignoredFailedCaseIds = new Set(), options = {}) {
  if (report == null) {
    assert(!strict, `${label} report must exist for strict parity`);
    const definedCaseIds = fallbackCases.map((caseDef) => caseDef.id);
    return {
      source: 'case-inventory',
      status: 'not-run',
      all: new Set(definedCaseIds),
      passed: new Set(definedCaseIds),
      caseCount: definedCaseIds.length,
      ignoredFailedCaseIds: [],
    };
  }
  assert(report && typeof report === 'object', `${label} report must be an object`);
  assert(Array.isArray(report.cases), `${label} report must include cases`);
  const failed = report.cases.filter((caseResult) => caseResult?.status !== 'pass');
  const blockingFailed = failed.filter((caseResult) => !ignoredFailedCaseIds.has(caseResult.id));
  if (!options.allowFailedActiveCases) {
    assert(
      blockingFailed.length === 0,
      `${label} report contains failing active cases: ${blockingFailed.map((item) => item.id).join(', ')}`,
    );
  }
  const reportCaseIds = new Set(report.cases.map((caseResult) => caseResult.id));
  const missingInventoryCaseIds = strict
    ? []
    : fallbackCases.map((caseDef) => caseDef.id).filter((caseId) => !reportCaseIds.has(caseId));
  return {
    source: missingInventoryCaseIds.length > 0 ? 'report+case-inventory' : 'report',
    status: report.status,
    all: new Set([...reportCaseIds, ...missingInventoryCaseIds]),
    passed: new Set([
      ...report.cases.filter((caseResult) => caseResult.status === 'pass').map((caseResult) => caseResult.id),
      ...missingInventoryCaseIds,
    ]),
    caseCount: report.cases.length,
    blockingFailedCaseIds: blockingFailed.map((caseResult) => caseResult.id),
    ignoredFailedCaseIds: failed.filter((caseResult) => ignoredFailedCaseIds.has(caseResult.id)).map((caseResult) => caseResult.id),
    inventoryOnlyCaseIds: missingInventoryCaseIds,
  };
}

function validateCaseIds(caseIds, allowedCases, domainId, group, requirement = 'passing') {
  assert(Array.isArray(caseIds) && caseIds.length > 0, `${domainId}.${group} must list at least one case id`);
  const missing = caseIds.filter((caseId) => !allowedCases.has(caseId));
  assert(missing.length === 0, `${domainId}.${group} references missing or non-${requirement} cases: ${missing.join(', ')}`);
  return {
    count: caseIds.length,
    caseIds,
  };
}

const manifest = readJson(manifestPath);
const packageJson = readJson('package.json');
const smokeReport = readJsonIfExists(smokeReportPath);
const masterReport = readJsonIfExists(masterReportPath);

assert(
  packageJson.scripts?.['core:product:web-graph-capture-smoke'] ===
    'node scripts/check-kessho-product-web-graph-capture-smoke.mjs',
  'package.json must expose core:product:web-graph-capture-smoke',
);
assert(
  packageJson.scripts?.['core:product:web-graph-capture-smoke:fast'] ===
    'node scripts/check-kessho-product-web-graph-capture-smoke.mjs --tier=fast',
  'package.json must expose core:product:web-graph-capture-smoke:fast',
);
assert(
  packageJson.scripts?.['core:product:web-graph-capture-smoke:full'] ===
    'node scripts/check-kessho-product-web-graph-capture-smoke.mjs',
  'package.json must expose core:product:web-graph-capture-smoke:full',
);
assert(
  packageJson.scripts?.['core:product:web-master-corpus'] ===
    'node scripts/check-kessho-product-web-master-corpus.mjs',
  'package.json must expose core:product:web-master-corpus',
);
assert(
  packageJson.scripts?.['core:product:web-master-corpus:full'] ===
    'node scripts/check-kessho-product-web-master-corpus.mjs',
  'package.json must expose core:product:web-master-corpus:full',
);

assert(manifest.schema === 'kessho-product-web-audio-graph-parity-v1', 'manifest schema is unexpected');
assert(manifest.masterCorpusScript === 'npm run core:product:web-master-corpus', 'manifest must name the Web/Product master corpus script');
assert(manifest.smokeFastScript === 'npm run core:product:web-graph-capture-smoke:fast', 'manifest must name the fast Web/Product smoke script');
assert(manifest.smokeFullScript === 'npm run core:product:web-graph-capture-smoke:full', 'manifest must name the full Web/Product smoke script');
assert(manifest.masterCorpusFullScript === 'npm run core:product:web-master-corpus:full', 'manifest must name the full Web/Product master corpus script');
assert(manifest.matchedBoundaryPolicy?.requiredMasterComparison === true, 'manifest must require master comparison');
arrayIncludesAll(
  manifest.matchedBoundaryPolicy?.requiredBoundaryKinds,
  requiredBoundaryKinds,
  'matchedBoundaryPolicy.requiredBoundaryKinds',
);

const domainIds = (manifest.domains ?? []).map((domain) => domain.id);
arrayIncludesAll(domainIds, requiredDomainIds, 'manifest.domains');

const deferredDomains = (manifest.domains ?? []).filter((domain) => domain.status === 'deferred');
const deferredSmokeCaseIds = new Set(deferredDomains.flatMap((domain) => domain.smokeCaseIds ?? []));
const deferredMasterCaseIds = new Set(deferredDomains.flatMap((domain) => domain.masterCaseIds ?? []));
const smokeCaseSets = auditedCaseSets(smokeReport, 'web graph capture smoke', smokeCases, deferredSmokeCaseIds);
const masterCaseSets = auditedCaseSets(masterReport, 'web master corpus', masterCases, deferredMasterCaseIds, {
  allowFailedActiveCases: !strict,
});

const domainReports = [];
for (const id of requiredDomainIds) {
  const domain = manifest.domains.find((item) => item.id === id);
  assert(domain, `manifest is missing domain ${id}`);
  assert(typeof domain.name === 'string' && domain.name.length > 0, `${id} is missing name`);
  assert(validDomainStatuses.includes(domain.status), `${id} has invalid status ${domain.status}`);
  assert(Array.isArray(domain.requiredBoundaries) && domain.requiredBoundaries.length > 0, `${id} is missing required boundaries`);
  assert(Array.isArray(domain.webEvidence) && domain.webEvidence.length > 0, `${id} is missing Web evidence`);
  assert(Array.isArray(domain.productEvidence) && domain.productEvidence.length > 0, `${id} is missing Product evidence`);
  const deferred = domain.status === 'deferred';
  const smokeRequirement = smokeCaseSets.source === 'report'
    ? deferred ? 'listed' : 'passing'
    : 'defined';
  const masterRequirement = masterCaseSets.source === 'report'
    ? deferred || !strict ? 'listed' : 'passing'
    : 'defined';
  const smokeCases = validateCaseIds(
    domain.smokeCaseIds,
    deferred ? smokeCaseSets.all : smokeCaseSets.passed,
    id,
    'smokeCaseIds',
    smokeRequirement,
  );
  const masterCases = validateCaseIds(
    domain.masterCaseIds,
    deferred || !strict ? masterCaseSets.all : masterCaseSets.passed,
    id,
    'masterCaseIds',
    masterRequirement,
  );
  if (deferred) {
    assert(
      typeof domain.deferredReason === 'string' && domain.deferredReason.length > 0,
      `${id} must explain why it is deferred`,
    );
    assert(!domain.blockers || domain.blockers.length === 0, `${id} cannot carry active blockers while deferred`);
  } else if (domain.status !== 'proven') {
    assert(Array.isArray(domain.blockers) && domain.blockers.length > 0, `${id} must list blockers until proven`);
  }
  if (domain.status === 'proven') {
    assert(!domain.blockers || domain.blockers.length === 0, `${id} cannot be proven while blockers remain`);
    assert(
      domain.requiredBoundaries.includes('masterPostLimiter'),
      `${id} proven status requires a masterPostLimiter boundary`,
    );
  }

  const evidence = [
    ...domain.webEvidence.map((entry) => validateEvidence(entry, id, 'webEvidence')),
    ...domain.productEvidence.map((entry) => validateEvidence(entry, id, 'productEvidence')),
  ];
  const missingEvidence = evidence.flatMap((entry) =>
    entry.missing.map((token) => ({ file: entry.file, token })),
  );
  assert(missingEvidence.length === 0, `${id} evidence tokens are missing: ${JSON.stringify(missingEvidence)}`);
  domainReports.push({
    id,
    status: domain.status,
    deferredReason: domain.deferredReason,
    requiredBoundaries: domain.requiredBoundaries,
    blockers: domain.blockers ?? [],
    smokeCases,
    masterCases,
    evidence,
  });
}

const activeDomainReports = domainReports.filter((domain) => domain.status !== 'deferred');
const deferredDomainReports = domainReports.filter((domain) => domain.status === 'deferred');
const provenCount = activeDomainReports.filter((domain) => domain.status === 'proven').length;
const blockedCount = activeDomainReports.filter((domain) => domain.status !== 'proven').length;
const strictGateReady =
  blockedCount === 0 &&
  (smokeCaseSets.blockingFailedCaseIds?.length ?? 0) === 0 &&
  (masterCaseSets.blockingFailedCaseIds?.length ?? 0) === 0;
const report = {
  schema: 'kessho-product-web-audio-graph-parity-report-v1',
  mode: strict ? 'strict' : 'audit',
  status: blockedCount === 0 ? 'proven' : 'blocked',
  provenCount,
  blockedCount,
  requiredDomainCount: requiredDomainIds.length,
  activeDomainCount: activeDomainReports.length,
  deferredCount: deferredDomainReports.length,
  deferredDomainIds: deferredDomainReports.map((domain) => domain.id),
  strictGateReady,
  smokeReport: {
    path: smokeReportPath,
    source: smokeCaseSets.source,
    status: smokeCaseSets.status,
    caseCount: smokeCaseSets.caseCount,
    blockingFailedCaseIds: smokeCaseSets.blockingFailedCaseIds,
    ignoredFailedCaseIds: smokeCaseSets.ignoredFailedCaseIds,
  },
  masterReport: {
    path: masterReportPath,
    source: masterCaseSets.source,
    status: masterCaseSets.status,
    caseCount: masterCaseSets.caseCount,
    blockingFailedCaseIds: masterCaseSets.blockingFailedCaseIds,
    ignoredFailedCaseIds: masterCaseSets.ignoredFailedCaseIds,
  },
  generatedAt: new Date().toISOString(),
  domains: domainReports,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(resolve(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);

if (strict && blockedCount > 0) {
  throw new Error(`Web graph parity strict gate blocked: ${blockedCount} domains are not proven. See ${reportPath}`);
}

console.log(
  `Kessho Product Web graph parity ${strict ? 'strict' : 'audit'}: ${report.status}; ` +
    `${provenCount}/${activeDomainReports.length} active domains proven; ` +
    `${deferredDomainReports.length} deferred; report ${reportPath}`,
);
