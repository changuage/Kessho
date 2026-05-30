import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertEvidenceCondition,
  backgroundAudioDeviceEvidenceIds,
  backgroundAudioDeviceEvidencePath,
  backgroundAudioDeviceEvidenceStatuses,
  backgroundAudioDevicePassEvidenceRequirements,
  parseBackgroundAudioDeviceEvidenceRows,
  validateBackgroundAudioDeviceEvidenceResult,
} from './lib/kesshoBackgroundAudioDeviceEvidence.mjs';

const root = process.cwd();
const evidencePath = backgroundAudioDeviceEvidencePath;
const recorderPath = 'scripts/record-kessho-product-background-audio-device-evidence.mjs';
const checklistPath = 'scripts/print-kessho-product-background-audio-device-checklist.mjs';
const planPath = 'docs/product-core/product-core-production-blocker-plan.md';
const capabilityPath = 'cpp/KesshoCore/src/product/KesshoProductApi.cpp';
const iosInfoPlistPath = 'ios/App/App/Info.plist';
const packagePath = 'package.json';
const reportPath = resolve(root, 'docs/reports/kessho-product-background-audio-device-evidence-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const evidence = read(evidencePath);
const plan = read(planPath);
const capabilityApi = read(capabilityPath);
const iosInfoPlist = read(iosInfoPlistPath);
const packageJson = JSON.parse(read(packagePath));

const requiredIds = backgroundAudioDeviceEvidenceIds;
const rows = parseBackgroundAudioDeviceEvidenceRows(evidence);

const reportRows = [];
for (const id of requiredIds) {
  const row = rows.get(id);
  assertEvidenceCondition(row, `${evidencePath} missing required device evidence row ${id}`);
  assertEvidenceCondition(backgroundAudioDeviceEvidenceStatuses.includes(row.status), `${evidencePath} row ${id} has unsupported status ${row.status}`);
  validateBackgroundAudioDeviceEvidenceResult(row);
  reportRows.push(row);
}

const allNativeRowsPassed = reportRows.every((row) => row.status === 'pass');
assertEvidenceCondition(
  packageJson.scripts?.['core:product:background-audio-device-evidence:record'] === 'node scripts/record-kessho-product-background-audio-device-evidence.mjs',
  `${packagePath} must expose the background audio device evidence recorder`,
);
assertEvidenceCondition(
  packageJson.scripts?.['core:product:background-audio-device-checklist'] === 'node scripts/print-kessho-product-background-audio-device-checklist.mjs',
  `${packagePath} must expose the background audio device checklist printer`,
);
assertEvidenceCondition(
  evidence.includes('npm run core:product:background-audio-device-evidence:record -- --id='),
  `${evidencePath} must document the evidence recorder command`,
);
assertEvidenceCondition(
  evidence.includes('npm run core:product:background-audio-device-checklist'),
  `${evidencePath} must document the evidence checklist command`,
);
assertEvidenceCondition(
  /<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*<string>audio<\/string>[\s\S]*<\/array>/.test(iosInfoPlist),
  `${iosInfoPlistPath} must declare UIBackgroundModes audio for native background audio device tests`,
);

execFileSync(process.execPath, [checklistPath, '--check'], {
  cwd: root,
  stdio: 'pipe',
});

execFileSync(process.execPath, [
  recorderPath,
  '--dry-run',
  '--id=ios-native-foreground',
  '--status=pass',
  '--evidence=build=self-check; peak=0.1; rms=0.01; audible=yes',
  '--tester=self-check',
  '--date=2026-05-30',
], {
  cwd: root,
  stdio: 'pipe',
});

let rejectedInvalidPass = false;
try {
  execFileSync(process.execPath, [
    recorderPath,
    '--dry-run',
    '--id=ios-native-foreground',
    '--status=pass',
    '--evidence=build=self-check; peak=0.1; rms=0.01',
    '--tester=self-check',
    '--date=2026-05-30',
  ], {
    cwd: root,
    stdio: 'pipe',
  });
} catch {
  rejectedInvalidPass = true;
}
assertEvidenceCondition(rejectedInvalidPass, `${recorderPath} must reject pass rows missing required evidence tokens`);
assertEvidenceCondition(read(evidencePath) === evidence, `${recorderPath} dry-run must not mutate ${evidencePath}`);

if (!allNativeRowsPassed) {
  assertEvidenceCondition(
    plan.includes('[ ] native iOS renderer produces audio through product-core on device'),
    `${planPath} must keep BG2 iOS device renderer exit criterion open until device evidence passes`,
  );
  assertEvidenceCondition(
    plan.includes('[ ] background audio device tests pass'),
    `${planPath} must keep BG2 background device exit criterion open until device evidence passes`,
  );
  assertEvidenceCondition(
    plan.includes('[ ] iOS screen-lock background audio test passes'),
    `${planPath} must keep BG3 device requirements open until device evidence passes`,
  );
  assertEvidenceCondition(
    capabilityApi.includes('report.supports_native_bridge = 0;'),
    `${capabilityPath} must keep supports_native_bridge disabled until device evidence passes`,
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  evidencePath,
  iosInfoPlistPath,
  requiredIds,
  passEvidenceRequirements: Object.fromEntries(backgroundAudioDevicePassEvidenceRequirements),
  checklistSelfCheck: {
    generatedFromSharedContract: true,
  },
  recorderSelfCheck: {
    validDryRunAccepted: true,
    invalidPassRejected: rejectedInvalidPass,
    dryRunPreservedLedger: true,
  },
  allNativeRowsPassed,
  summary: {
    pass: reportRows.filter((row) => row.status === 'pass').length,
    pending: reportRows.filter((row) => row.status === 'pending').length,
    manualPending: reportRows.filter((row) => row.status === 'manual-pending').length,
    fail: reportRows.filter((row) => row.status === 'fail').length,
  },
  rows: reportRows,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Kessho Product background audio device evidence check passed (allNativeRowsPassed=${allNativeRowsPassed ? 'true' : 'false'})`);
