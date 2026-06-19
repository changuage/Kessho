#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const reportJsonPath = path.resolve(root, 'docs/reports/kessho-product-ratchet-gating-latest.json');
const reportMarkdownPath = path.resolve(root, 'docs/reports/kessho-product-ratchet-gating-latest.md');

const testSource = `
import assert from 'node:assert/strict';
import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  type CoreProductEvent,
} from './src/audio/coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from './src/audio/generated/kesshoProductEvents';
import { createCoreProductSequencerCacheState } from './src/audio/product/host/CoreProductSequencerCacheBridge';
import {
  coreProductStepValueFieldEnabled,
  coreProductStepValueFieldSubLaneKey,
  syncCoreProductSequencerStepState,
} from './src/audio/product/host/CoreProductSequencerStepPostingBridge';
import { applyCoreProductSequencerSubLaneEnabledEvent } from './src/audio/product/host/CoreProductSequencerSubLaneEnabledEventBridge';

const checks: { id: string; status: 'pass' }[] = [];
function check(id: string, condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks.push({ id, status: 'pass' });
}

function isStepValueField(event: CoreProductEvent, field: number): boolean {
  const flags = event.flags ?? 0;
  const stepField = flags & 0xff00;
  return event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
    stepField !== CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig &&
    stepField === field;
}

function isConfigField(event: CoreProductEvent, field: number): boolean {
  const flags = event.flags ?? 0;
  return event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep &&
    (flags & 0xff00) === CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig &&
    event.paramId === field >> 8;
}

function subLaneEvent(field: number, enabled: boolean): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: 1,
    index: 0,
    paramId: field >> 8,
    value: enabled ? 1 : 0,
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.subLaneEnabledState | CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig,
  };
}

check(
  'ratchet-gated-by-expression-key',
  coreProductStepValueFieldSubLaneKey(CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet) === 'expression',
  'ratchet step values must be gated by the expression sublane',
);
check(
  'ratchet-disabled-when-expression-off',
  coreProductStepValueFieldEnabled([{ expression: false }], [{}], 'synth', 0, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet) === false,
  'ratchet field should be disabled when expression sublane is off',
);
check(
  'ratchet-enabled-when-expression-on',
  coreProductStepValueFieldEnabled([{ expression: true }], [{}], 'synth', 0, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet) === true,
  'ratchet field should be enabled when expression sublane is on',
);

const cache = createCoreProductSequencerCacheState();
cache.synth.toggles[0] = [{ step: 0, value: true }];
cache.synth.values[0] = [
  { step: 0, field: CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, value: 4 },
  { step: 0, field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, value: 0.75 },
];
cache.synth.configs[0] = [
  { field: CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
  { field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
];

const expressionOffEvents: CoreProductEvent[] = [];
syncCoreProductSequencerStepState({
  sequencer: 'synth',
  cache,
  forceClear: true,
  synthSubLaneEnabled: [{ expression: false }],
  drumSubLaneEnabled: [{}],
  post: (event) => expressionOffEvents.push(event),
});

check(
  'expression-off-clears-lane',
  expressionOffEvents.some((event) => ((event.flags ?? 0) & CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane) !== 0),
  'expression-off resync must clear stale Product runtime step state',
);
check(
  'expression-off-posts-no-ratchet-values',
  !expressionOffEvents.some((event) => isStepValueField(event, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet)),
  'expression-off resync must not repost ratchet step values',
);
check(
  'expression-off-posts-no-ratchet-config',
  !expressionOffEvents.some((event) => isConfigField(event, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet)),
  'expression-off resync must not repost ratchet sublane config',
);

const expressionOnEvents: CoreProductEvent[] = [];
syncCoreProductSequencerStepState({
  sequencer: 'synth',
  cache,
  forceClear: true,
  synthSubLaneEnabled: [{ expression: true }],
  drumSubLaneEnabled: [{}],
  post: (event) => expressionOnEvents.push(event),
});
check(
  'expression-on-posts-ratchet-values',
  expressionOnEvents.some((event) => isStepValueField(event, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet)),
  'expression-on resync should explicitly repost saved ratchet step values',
);
check(
  'expression-on-posts-ratchet-config',
  expressionOnEvents.some((event) => isConfigField(event, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet)),
  'expression-on resync should explicitly repost saved ratchet sublane config',
);

const expressionEventResult = applyCoreProductSequencerSubLaneEnabledEvent({
  event: subLaneEvent(CORE_PRODUCT_STEP_VALUE_FIELDS.expression, false),
  sequencer: 'synth',
  laneIndex: 0,
  synthSubLaneEnabled: [{ expression: true }],
  drumSubLaneEnabled: [{}],
});
check(
  'expression-toggle-updates-shared-gate',
  expressionEventResult.handled === true && expressionEventResult.synthSubLaneEnabled[0]?.expression === false,
  'expression sublane toggle must update the shared expression/ratchet gate',
);

const ratchetEventResult = applyCoreProductSequencerSubLaneEnabledEvent({
  event: subLaneEvent(CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, false),
  sequencer: 'synth',
  laneIndex: 0,
  synthSubLaneEnabled: [{ expression: true }],
  drumSubLaneEnabled: [{}],
});
check(
  'ratchet-toggle-updates-expression-gate',
  ratchetEventResult.handled === true && ratchetEventResult.synthSubLaneEnabled[0]?.expression === false,
  'ratchet sublane toggle must also update the expression gate for compatibility',
);

export default checks;
`;

const tempDir = await mkdtemp(path.join(tmpdir(), 'product-ratchet-gating-'));

try {
  const outfile = path.join(tempDir, 'check-kessho-product-ratchet-gating.mjs');
  await build({
    stdin: {
      contents: testSource,
      resolveDir: root,
      sourcefile: 'check-kessho-product-ratchet-gating.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });

  const imported = await import(pathToFileURL(outfile).href);
  const checks = imported.default ?? [];
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    checks,
  };
  mkdirSync(path.dirname(reportJsonPath), { recursive: true });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    reportMarkdownPath,
    [
      '# Kessho Product Ratchet Gating',
      '',
      `Status: ${report.status}`,
      '',
      ...checks.map((entry) => `- ${entry.status}: ${entry.id}`),
      '',
    ].join('\n'),
  );
  console.log(`Kessho Product ratchet gating checks passed (${checks.length} checks)`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
