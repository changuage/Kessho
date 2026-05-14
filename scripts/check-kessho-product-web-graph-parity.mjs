import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function passedCaseSet(report, label) {
  assert(report && typeof report === 'object', `${label} report must be an object`);
  assert(report.status === 'pass', `${label} report status must be pass`);
  assert(Array.isArray(report.cases), `${label} report must include cases`);
  const failed = report.cases.filter((caseResult) => caseResult?.status !== 'pass');
  assert(failed.length === 0, `${label} report contains failing cases: ${failed.map((item) => item.id).join(', ')}`);
  return new Set(report.cases.map((caseResult) => caseResult.id));
}

function validateCaseIds(caseIds, passedCases, domainId, group) {
  assert(Array.isArray(caseIds) && caseIds.length > 0, `${domainId}.${group} must list at least one case id`);
  const missing = caseIds.filter((caseId) => !passedCases.has(caseId));
  assert(missing.length === 0, `${domainId}.${group} references missing or non-passing cases: ${missing.join(', ')}`);
  return {
    count: caseIds.length,
    caseIds,
  };
}

const manifest = readJson(manifestPath);
const packageJson = readJson('package.json');
const smokeReport = readJson(smokeReportPath);
const masterReport = readJson(masterReportPath);
const passingSmokeCases = passedCaseSet(smokeReport, 'web graph capture smoke');
const passingMasterCases = passedCaseSet(masterReport, 'web master corpus');

assert(
  packageJson.scripts?.['core:product:web-graph-capture-smoke'] ===
    'node scripts/check-kessho-product-web-graph-capture-smoke.mjs',
  'package.json must expose core:product:web-graph-capture-smoke',
);
assert(
  packageJson.scripts?.['core:product:web-master-corpus'] ===
    'node scripts/check-kessho-product-web-master-corpus.mjs',
  'package.json must expose core:product:web-master-corpus',
);

assert(manifest.schema === 'kessho-product-web-audio-graph-parity-v1', 'manifest schema is unexpected');
assert(manifest.masterCorpusScript === 'npm run core:product:web-master-corpus', 'manifest must name the Web/Product master corpus script');
assert(manifest.matchedBoundaryPolicy?.requiredMasterComparison === true, 'manifest must require master comparison');
arrayIncludesAll(
  manifest.matchedBoundaryPolicy?.requiredBoundaryKinds,
  requiredBoundaryKinds,
  'matchedBoundaryPolicy.requiredBoundaryKinds',
);

const domainIds = (manifest.domains ?? []).map((domain) => domain.id);
arrayIncludesAll(domainIds, requiredDomainIds, 'manifest.domains');

const domainReports = [];
for (const id of requiredDomainIds) {
  const domain = manifest.domains.find((item) => item.id === id);
  assert(domain, `manifest is missing domain ${id}`);
  assert(typeof domain.name === 'string' && domain.name.length > 0, `${id} is missing name`);
  assert(['blocked', 'partial', 'proven'].includes(domain.status), `${id} has invalid status ${domain.status}`);
  assert(Array.isArray(domain.requiredBoundaries) && domain.requiredBoundaries.length > 0, `${id} is missing required boundaries`);
  assert(Array.isArray(domain.webEvidence) && domain.webEvidence.length > 0, `${id} is missing Web evidence`);
  assert(Array.isArray(domain.productEvidence) && domain.productEvidence.length > 0, `${id} is missing Product evidence`);
  const smokeCases = validateCaseIds(domain.smokeCaseIds, passingSmokeCases, id, 'smokeCaseIds');
  const masterCases = validateCaseIds(domain.masterCaseIds, passingMasterCases, id, 'masterCaseIds');
  if (domain.status !== 'proven') {
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
    requiredBoundaries: domain.requiredBoundaries,
    blockers: domain.blockers ?? [],
    smokeCases,
    masterCases,
    evidence,
  });
}

const provenCount = domainReports.filter((domain) => domain.status === 'proven').length;
const blockedCount = domainReports.filter((domain) => domain.status !== 'proven').length;
const report = {
  schema: 'kessho-product-web-audio-graph-parity-report-v1',
  mode: strict ? 'strict' : 'audit',
  status: blockedCount === 0 ? 'proven' : 'blocked',
  provenCount,
  blockedCount,
  requiredDomainCount: requiredDomainIds.length,
  strictGateReady: blockedCount === 0,
  smokeReport: {
    path: smokeReportPath,
    status: smokeReport.status,
    caseCount: smokeReport.cases.length,
  },
  masterReport: {
    path: masterReportPath,
    status: masterReport.status,
    caseCount: masterReport.cases.length,
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
    `${provenCount}/${requiredDomainIds.length} domains proven; report ${reportPath}`,
);
