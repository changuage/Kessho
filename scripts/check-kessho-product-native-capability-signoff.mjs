import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  backgroundAudioDeviceEvidenceIds,
  backgroundAudioDeviceEvidencePath,
  parseBackgroundAudioDeviceEvidenceRows,
  validateBackgroundAudioDeviceEvidenceResult,
} from './lib/kesshoBackgroundAudioDeviceEvidence.mjs';

const root = process.cwd();
const planPath = 'docs/product-core/product-core-production-blocker-plan.md';
const capabilityApiPath = 'cpp/KesshoCore/src/product/KesshoProductApi.cpp';
const capabilityReportPath = 'src/audio/product/ProductRuntimeCapabilityReport.ts';
const reportPath = resolve(root, 'docs/reports/kessho-product-native-capability-signoff-latest.json');

const deviceRequirementByRow = new Map([
  ['ios-native-screen-lock', 'iOS screen-lock background audio test passes'],
  ['ios-native-app-background', 'iOS app-background audio test passes'],
  ['ios-native-control-center', 'iOS Control Center remote command test passes'],
  ['ios-native-route-change', 'iOS route/interruption tests pass'],
  ['macos-native-hidden', 'macOS hidden/minimized audio test passes'],
  ['macos-native-sleep-wake', 'macOS sleep/wake recovery test passes'],
]);

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasOpenCheckbox(markdown, label) {
  return markdown.includes(`[ ] ${label}`);
}

function hasCheckedCheckbox(markdown, label) {
  return markdown.includes(`[x] ${label}`);
}

const evidence = read(backgroundAudioDeviceEvidencePath);
const plan = read(planPath);
const capabilityApi = read(capabilityApiPath);
const capabilityReport = read(capabilityReportPath);
const rows = parseBackgroundAudioDeviceEvidenceRows(evidence);

const evidenceRows = [];
for (const id of backgroundAudioDeviceEvidenceIds) {
  const row = rows.get(id);
  assert(row, `${backgroundAudioDeviceEvidencePath} missing row ${id}`);
  validateBackgroundAudioDeviceEvidenceResult(row);
  evidenceRows.push(row);
}

const allDeviceRowsPassed = evidenceRows.every((row) => row.status === 'pass');
const pendingRows = evidenceRows.filter((row) => row.status !== 'pass').map((row) => row.id);
const bg3DeviceRequirements = [...deviceRequirementByRow.entries()].map(([id, requirement]) => ({
  id,
  requirement,
  passed: rows.get(id)?.status === 'pass',
  planOpen: hasOpenCheckbox(plan, requirement),
  planChecked: hasCheckedCheckbox(plan, requirement),
}));

if (!allDeviceRowsPassed) {
  for (const { id, requirement, passed, planOpen } of bg3DeviceRequirements) {
    if (!passed) {
      assert(planOpen, `${planPath} must keep BG3 requirement open while ${id} is not pass: ${requirement}`);
    }
  }
  for (const requirement of [
    'docs updated from deferred to supported',
    'set supports_native_bridge = 1',
    'expose native-product only on supported platforms/builds',
    'native-product is real and tested',
    'iOS/macOS background audio works through native product-core',
    'product-core background-audio milestone is complete',
  ]) {
    assert(hasOpenCheckbox(plan, requirement), `${planPath} must keep BG3 signoff open while device evidence is pending: ${requirement}`);
  }
  assert(capabilityApi.includes('report.supports_native_bridge = 0;'), `${capabilityApiPath} must keep supports_native_bridge disabled while BG3 is not ready`);
  assert(capabilityReport.includes('supportsNativeBridge: false'), `${capabilityReportPath} must keep supportsNativeBridge false while BG3 is not ready`);
} else {
  for (const { requirement, planChecked } of bg3DeviceRequirements) {
    assert(planChecked, `${planPath} must check BG3 requirement after evidence pass: ${requirement}`);
  }
  assert(capabilityApi.includes('report.supports_native_bridge = 1;'), `${capabilityApiPath} must enable supports_native_bridge after BG3 signoff`);
  assert(capabilityReport.includes('supportsNativeBridge: true'), `${capabilityReportPath} must report supportsNativeBridge true after BG3 signoff`);
}

const report = {
  generatedAt: new Date().toISOString(),
  ready: allDeviceRowsPassed,
  allDeviceRowsPassed,
  pendingRows,
  bg3DeviceRequirements,
  capability: allDeviceRowsPassed
    ? {
        nativeAbi: 'expected-enabled',
        productRuntimeReport: 'expected-enabled',
      }
    : {
        nativeAbi: 'disabled',
        productRuntimeReport: 'disabled',
      },
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Kessho Product native capability signoff check passed (ready=${allDeviceRowsPassed ? 'true' : 'false'})`);
