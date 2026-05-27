#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4197;
const reportPath = resolve(root, 'docs/reports/kessho-product-sequencer-ui-parity-latest.json');
const selectedReportPath = resolve(root, 'docs/reports/kessho-product-sequencer-ui-parity-selected-latest.json');
const SUB_LANE_SPARK_INDEX = Object.freeze({
  pitch: 0,
  expression: 1,
  morph: 2,
  distance: 3,
});
const VISIBLE_SUB_LANE_ORDER = Object.freeze(Object.keys(SUB_LANE_SPARK_INDEX));
const VISIBLE_SUB_LANE_LABELS = Object.freeze({
  p: 'pitch',
  pitch: 'pitch',
  e: 'expression',
  expression: 'expression',
  m: 'morph',
  morph: 'morph',
  d: 'distance',
  distance: 'distance',
});
const RANGE_SUB_LANE_SPARK_INDEX = Object.freeze({
  expression: SUB_LANE_SPARK_INDEX.expression,
  morph: SUB_LANE_SPARK_INDEX.morph,
  distance: SUB_LANE_SPARK_INDEX.distance,
});
const PITCH_SUB_LANE_SPARK_INDEX = SUB_LANE_SPARK_INDEX.pitch;
const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT, engine: '', tab: '' };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--engine=')) args.engine = arg.slice('--engine='.length);
    else if (arg.startsWith('--tab=')) args.tab = arg.slice('--tab='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-sequencer-ui-parity.mjs [--url=http://127.0.0.1:5173/] [--port=4197] [--engine=core-product|web-ts] [--tab=drums|synth]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (args.engine && !['core-product', 'web-ts'].includes(args.engine)) throw new Error('--engine must be core-product or web-ts');
  if (args.tab && !['drums', 'synth'].includes(args.tab)) throw new Error('--tab must be drums or synth');
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signatureDiffSummary(left, right) {
  const leftParts = String(left).split('|');
  const rightParts = String(right).split('|');
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return `step ${index}: expected ${leftParts[index] ?? '<missing>'} got ${rightParts[index] ?? '<missing>'}`;
    }
  }
  return 'no segment diff';
}

function midiToName(midi) {
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return '';
  return `${MIDI_NOTE_NAMES[midi % 12] ?? ''}${Math.floor(midi / 12) - 1}`;
}

function midiToNoteRangePercent(midi) {
  return ((Math.max(36, Math.min(96, midi)) - 36) / 60) * 100;
}

async function waitForHttp(url, timeoutMs, outputProvider = () => '') {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${url}: ${detail}\n${outputProvider()}`);
}

function killProcessTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

async function startSharedVite(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let exited = false;
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('exit', () => {
    exited = true;
  });
  try {
    await waitForHttp(url, 45000, () => output);
  } catch (error) {
    killProcessTree(child);
    throw error;
  }
  return {
    url,
    stop: async () => {
      if (!exited) killProcessTree(child);
      await delay(500);
    },
  };
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    if (!mod.chromium) throw new Error('The playwright package did not expose chromium.');
    return mod;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright is required for sequencer UI parity proof but is not available: ${detail}`);
  }
}

function withEngine(baseUrl, engineMode) {
  const url = new URL(baseUrl);
  url.searchParams.set('engine', engineMode);
  url.searchParams.set('engineAB', '1');
  url.searchParams.set('localPresets', '1');
  return url.toString();
}

function ignoredConsoleError(text) {
  return text.includes('SupabasePresetStore') ||
    text.includes('Failed to fetch') ||
    text.includes('status of 429');
}

async function activeTriggerCells(page) {
  return page.locator('.seq-trigger-always .seq-step-cell').evaluateAll((cells) =>
    cells
      .map((el, index) => String(el.className).includes('playing') ? index : -1)
      .filter((index) => index >= 0),
  );
}

async function sparkPlayheadX(page, sparkIndex) {
  const playhead = page.locator('.seq-spark-strip').nth(sparkIndex).locator('.spark-playhead').first();
  if ((await playhead.count()) === 0) return null;
  return playhead.getAttribute('x');
}

async function sampleSubLanePlayheads(page) {
  const samples = {};
  for (const [lane, sparkIndex] of Object.entries(SUB_LANE_SPARK_INDEX)) {
    samples[lane] = await sparkPlayheadX(page, sparkIndex);
  }
  return samples;
}

function normalizeVisibleSubLaneLabel(label) {
  const key = String(label ?? '').trim().replace(/:$/, '').toLowerCase();
  return VISIBLE_SUB_LANE_LABELS[key] ?? key;
}

async function proofVisibleSubLaneCoverage(page, engineMode, tab) {
  const labels = await page.locator('.seq-spark-strip:visible .seq-spark-badge-label').evaluateAll((nodes) =>
    nodes.map((node) => String(node.textContent ?? '').trim()).filter(Boolean)
  );
  const lanes = labels.map(normalizeVisibleSubLaneLabel);
  assert(
    lanes.length === VISIBLE_SUB_LANE_ORDER.length,
    `${engineMode}/${tab}: visible sub-lane count changed without parity coverage (${lanes.join(',') || 'none'})`,
  );
  assert(
    lanes.every((lane, index) => lane === VISIBLE_SUB_LANE_ORDER[index]),
    `${engineMode}/${tab}: visible sub-lanes diverged from audited order (${lanes.join(',') || 'none'} !== ${VISIBLE_SUB_LANE_ORDER.join(',')})`,
  );
  return { labels, lanes, audited: [...VISIBLE_SUB_LANE_ORDER] };
}

function assertSubLanePlayheadMovement(samples, engineMode, tab) {
  for (const lane of Object.keys(SUB_LANE_SPARK_INDEX)) {
    const values = samples.map((sample) => sample[lane]).filter((value) => value != null);
    const movement = new Set(values);
    assert(
      movement.size > 1,
      `${engineMode}/${tab}: ${lane} sub-lane cursor did not move (${values.join(' | ') || 'no samples'})`,
    );
  }
}

async function sampleSequencerPlayheads(page, count = 6, intervalMs = 250) {
  const triggerSamples = [];
  const subLaneSparkSamples = [];
  for (let index = 0; index < count; index += 1) {
    triggerSamples.push((await activeTriggerCells(page)).join(','));
    subLaneSparkSamples.push(await sampleSubLanePlayheads(page));
    await page.waitForTimeout(intervalMs);
  }
  return { triggerSamples, subLaneSparkSamples };
}

function assertStoppedPlayheadsFrozen(samples, engineMode, tab) {
  const triggerTransitions = countPlayheadTransitions(samples.triggerSamples);
  assert(
    triggerTransitions === 0,
    `${engineMode}/${tab}: stopped trigger playhead kept moving (${samples.triggerSamples.join(' | ')})`,
  );
  const subLaneTransitions = {};
  for (const lane of Object.keys(SUB_LANE_SPARK_INDEX)) {
    const values = samples.subLaneSparkSamples.map((sample) => sample[lane] ?? '<none>');
    const transitions = countPlayheadTransitions(values);
    subLaneTransitions[lane] = transitions;
    assert(
      transitions === 0,
      `${engineMode}/${tab}: stopped ${lane} sub-lane cursor kept moving (${values.join(' | ')})`,
    );
  }
  return { triggerTransitions, subLaneTransitions };
}

function triggerCadenceMoved(cadence) {
  return cadence.uniquePositions >= 2 || cadence.transitions >= 1;
}

async function selectedStepIndexes(page, scopeSelector) {
  return page.locator(scopeSelector).evaluateAll((steps) =>
    steps
      .map((step, index) => step.querySelector('.selected') ? index : -1)
      .filter((index) => index >= 0),
  );
}

async function selectedTriggerStep(page) {
  const indexes = await selectedStepIndexes(page, '.seq-trigger-always .seq-step');
  assert(indexes.length === 1, `Expected one selected trigger step, got ${indexes.join(',') || 'none'}`);
  return indexes[0];
}

async function selectedEditorStep(page) {
  const indexes = await selectedStepIndexes(page, '.seq-lane-editor-wrap .seq-step');
  assert(indexes.length === 1, `Expected one selected editor step, got ${indexes.join(',') || 'none'}`);
  return indexes[0];
}

async function setSelectedEditorStep(page, desiredStep, engineMode, tab, label) {
  const step = page.locator('.seq-lane-editor-wrap .seq-step').nth(desiredStep);
  if ((await step.count()) > 0) {
    const target = step.locator('.seq-pitch-bar-wrap, .seq-vel-bar-wrap').first();
    if ((await target.count()) > 0) {
      await target.click({ timeout: 5000 });
      await page.waitForTimeout(250);
      if ((await selectedEditorStep(page)) === desiredStep) return;
    }
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await selectedEditorStep(page);
    if (current === desiredStep) return;
    await page.keyboard.press(current < desiredStep ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(150);
  }
  const current = await selectedEditorStep(page);
  assert(
    current === desiredStep,
    `${engineMode}/${tab}: ${label} editor cursor did not reach step ${desiredStep}; got ${current}`,
  );
}

async function triggerStepActive(page, stepIndex) {
  return page.locator('.seq-trigger-always .seq-step-cell').nth(stepIndex).evaluate((cell) =>
    String(cell.className).includes('active') && !String(cell.className).includes('inactive'),
  );
}

async function triggerProbabilityPercent(page, stepIndex) {
  const text = String(await page.locator('.seq-trigger-always .prob-label').nth(stepIndex).textContent());
  const value = Number.parseInt(text.trim().replace('%', ''), 10);
  assert(Number.isFinite(value), `Could not read trigger probability for step ${stepIndex} from ${text}`);
  return value;
}

async function triggerConditionText(page, stepIndex) {
  const text = String(await page.locator('.seq-trigger-always .seq-trig-cond').nth(stepIndex).textContent()).trim();
  assert(/^\d+:\d+$/.test(text), `Could not read trigger condition for step ${stepIndex} from ${text}`);
  return text;
}

async function setTriggerProbabilityPercent(page, stepIndex, desired, engineMode, tab) {
  await setSelectedTriggerStep(page, stepIndex, engineMode, tab);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await triggerProbabilityPercent(page, stepIndex);
    if (current === desired) return;
    await page.keyboard.press(current < desired ? 'ArrowUp' : 'ArrowDown');
    await page.waitForTimeout(180);
  }
  assert(
    (await triggerProbabilityPercent(page, stepIndex)) === desired,
    `${engineMode}/${tab}: trigger probability for step ${stepIndex} did not reach ${desired}%`,
  );
}

async function setTriggerConditionToText(page, stepIndex, desired, engineMode, tab) {
  const conditionButton = page.locator('.seq-trigger-always .seq-trig-cond').nth(stepIndex);
  await conditionButton.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await triggerConditionText(page, stepIndex);
    if (current === desired) return;
    await conditionButton.click({ timeout: 5000 });
    await page.waitForTimeout(150);
  }
  assert(
    (await triggerConditionText(page, stepIndex)) === desired,
    `${engineMode}/${tab}: trigger condition for step ${stepIndex} did not reach ${desired}`,
  );
}

async function proofTriggerStepControls(page, engineMode, tab, stepIndex) {
  const beforeProbability = await triggerProbabilityPercent(page, stepIndex);
  const probabilityKey = beforeProbability > 0 ? 'ArrowDown' : 'ArrowUp';
  const restoreProbabilityKey = probabilityKey === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';
  await page.keyboard.press(probabilityKey);
  await page.waitForTimeout(250);
  const changedProbability = await triggerProbabilityPercent(page, stepIndex);
  assert(
    changedProbability !== beforeProbability,
    `${engineMode}/${tab}: trigger probability did not change for step ${stepIndex} (${beforeProbability})`,
  );
  await page.keyboard.press(restoreProbabilityKey);
  await page.waitForTimeout(250);
  const restoredProbability = await triggerProbabilityPercent(page, stepIndex);
  assert(
    restoredProbability === beforeProbability,
    `${engineMode}/${tab}: trigger probability did not restore for step ${stepIndex} (${beforeProbability} -> ${changedProbability} -> ${restoredProbability})`,
  );

  const conditionButton = page.locator('.seq-trigger-always .seq-trig-cond').nth(stepIndex);
  const beforeCondition = await triggerConditionText(page, stepIndex);
  await conditionButton.click({ timeout: 5000 });
  await page.waitForTimeout(250);
  const changedCondition = await triggerConditionText(page, stepIndex);
  assert(
    changedCondition !== beforeCondition,
    `${engineMode}/${tab}: trigger condition did not change for step ${stepIndex} (${beforeCondition})`,
  );
  for (let attempt = 0; attempt < 9 && (await triggerConditionText(page, stepIndex)) !== beforeCondition; attempt += 1) {
    await conditionButton.click({ timeout: 5000 });
    await page.waitForTimeout(120);
  }
  const restoredCondition = await triggerConditionText(page, stepIndex);
  assert(
    restoredCondition === beforeCondition,
    `${engineMode}/${tab}: trigger condition did not restore for step ${stepIndex} (${beforeCondition} -> ${changedCondition} -> ${restoredCondition})`,
  );

  return {
    stepIndex,
    probability: {
      before: beforeProbability,
      changed: changedProbability,
      restored: restoredProbability,
    },
    trigCondition: {
      before: beforeCondition,
      changed: changedCondition,
      restored: restoredCondition,
    },
  };
}

async function triggerPatternState(page) {
  return page.locator('.seq-trigger-always .seq-step-cell').evaluateAll((cells) =>
    cells.map((cell, index) => {
      const className = String(cell.className);
      return {
        index,
        active: className.includes('active') && !className.includes('inactive'),
        inactive: className.includes('inactive'),
      };
    }),
  );
}

async function readTriggerControlNumber(page, controlIndex) {
  const text = String(await page.locator('.seq-trigger-always .seq-drag-num').nth(controlIndex).textContent());
  const value = Number.parseInt(text.trim(), 10);
  assert(Number.isFinite(value), `Could not read trigger control ${controlIndex} from ${text}`);
  return value;
}

async function setTriggerControlViaDrag(page, controlIndex, desiredValue, engineMode, tab, label) {
  const control = page.locator('.seq-trigger-always .seq-drag-num').nth(controlIndex);
  await control.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await readTriggerControlNumber(page, controlIndex);
    if (current === desiredValue) return;
    const box = await control.boundingBox();
    assert(box, `${engineMode}/${tab}: could not locate ${label} control for drag`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const delta = desiredValue - current;
    const dragPixels = Math.max(80, Math.abs(delta) * 90);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - Math.sign(delta) * dragPixels, { steps: Math.max(4, Math.abs(delta) * 3) });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  assert(
    (await readTriggerControlNumber(page, controlIndex)) === desiredValue,
    `${engineMode}/${tab}: ${label} control did not reach ${desiredValue}`,
  );
}

async function readTriggerRotation(page) {
  const text = String(await page.locator('.seq-trigger-always .seq-rotation-val').first().textContent());
  const value = Number.parseInt(text.trim(), 10);
  assert(Number.isFinite(value), `Could not read trigger rotation from ${text}`);
  return value;
}

async function setTriggerRotation(page, desiredRotation) {
  const rotation = page.locator('.seq-trigger-always .seq-rotation-control').first();
  await rotation.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await readTriggerRotation(page);
    if (current === desiredRotation) return;
    await rotation.locator('button').nth(current < desiredRotation ? 1 : 0).click({ timeout: 5000 });
    await page.waitForTimeout(200);
  }
  assert((await readTriggerRotation(page)) === desiredRotation, `Trigger rotation did not reach ${desiredRotation}`);
}

async function selectedSparkX(page, sparkIndex) {
  const selected = page.locator('.seq-spark-strip').nth(sparkIndex).locator('.spark-selected-step').first();
  if ((await selected.count()) === 0) return null;
  return selected.getAttribute('x');
}

async function pressLeftShiftChord(page, key) {
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.press(key);
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(250);
}

async function ensureSequencerDetailMode(page, engineMode, tab) {
  const clockSelect = page.locator('.seq-clock-select').first();
  if ((await clockSelect.count()) > 0 && await clockSelect.isVisible().catch(() => false)) return;

  const detailLocators = [
    page.locator('.seq-view-btn').filter({ hasText: /^Detail$/ }),
    page.locator('button').filter({ hasText: /^Detail$/ }),
  ];
  for (const locator of detailLocators) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const button = locator.nth(index);
      if (!await button.isVisible().catch(() => false)) continue;
      await button.click({ timeout: 10000 });
      await page.waitForTimeout(700);
      if ((await clockSelect.count()) > 0 && await clockSelect.isVisible().catch(() => false)) return;
    }
  }
  throw new Error(`${engineMode}/${tab}: could not open sequencer Detail view for timing controls`);
}

async function ensureTriggerKeyboardLane(page, engineMode, tab) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const indexes = await selectedStepIndexes(page, '.seq-trigger-always .seq-step');
    if (indexes.length === 1) return indexes[0];
    await pressLeftShiftChord(page, 'ArrowUp');
  }
  throw new Error(`${engineMode}/${tab}: could not return keyboard focus to the trigger lane`);
}

async function setTriggerStepsViaKeyboard(page, desiredSteps, engineMode, tab) {
  await ensureTriggerKeyboardLane(page, engineMode, tab);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await readTriggerControlNumber(page, 0);
    if (current === desiredSteps) return;
    try {
      await page.keyboard.down('KeyZ');
      await page.keyboard.press(current < desiredSteps ? 'ArrowRight' : 'ArrowLeft');
    } finally {
      await page.keyboard.up('KeyZ');
    }
    await page.waitForTimeout(250);
  }
  assert((await readTriggerControlNumber(page, 0)) === desiredSteps, `${engineMode}/${tab}: trigger steps did not reach ${desiredSteps}`);
}

async function setSelectedTriggerStep(page, desiredStep, engineMode, tab) {
  await ensureTriggerKeyboardLane(page, engineMode, tab);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await selectedTriggerStep(page);
    if (current === desiredStep) return;
    await page.keyboard.press(current < desiredStep ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(150);
  }
  assert((await selectedTriggerStep(page)) === desiredStep, `${engineMode}/${tab}: trigger cursor did not reach step ${desiredStep}`);
}

async function ensureSparklineEnabled(page, sparkIndex) {
  const strip = page.locator('.seq-spark-strip').nth(sparkIndex);
  await strip.waitFor({ timeout: 10000 });
  const className = String(await strip.getAttribute('class'));
  if (className.includes('disabled')) {
    await strip.locator('.seq-spark-badge').click({ timeout: 5000 });
    await page.waitForTimeout(250);
  }
  const updatedClassName = String(await strip.getAttribute('class'));
  if (!updatedClassName.includes('expanded')) {
    await strip.click({ timeout: 5000 });
    await page.waitForTimeout(250);
  }
}

async function readSubLaneEnabled(page, sparkIndex) {
  const strip = page.locator('.seq-spark-strip').nth(sparkIndex);
  await strip.waitFor({ timeout: 10000 });
  return !String(await strip.getAttribute('class')).includes('disabled');
}

async function setSubLaneEnabled(page, sparkIndex, desired, engineMode, tab, label) {
  const strip = page.locator('.seq-spark-strip').nth(sparkIndex);
  await strip.waitFor({ timeout: 10000 });
  const before = await readSubLaneEnabled(page, sparkIndex);
  if (before !== desired) {
    await strip.locator('.seq-spark-badge').click({ timeout: 5000 });
    await page.waitForTimeout(400);
  }
  const after = await readSubLaneEnabled(page, sparkIndex);
  assert(after === desired, `${engineMode}/${tab}: ${label} sub-lane did not become ${desired ? 'enabled' : 'disabled'}`);
  return after;
}

async function ensureExpressionSparklineEnabled(page) {
  await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX.expression);
}

async function ensurePitchSparklineEnabled(page) {
  await ensureSparklineEnabled(page, PITCH_SUB_LANE_SPARK_INDEX);
}

async function ensureAuditedSubLaneSparklinesEnabled(page) {
  for (const sparkIndex of Object.values(SUB_LANE_SPARK_INDEX)) {
    await ensureSparklineEnabled(page, sparkIndex);
  }
}

async function editorSteps(page) {
  const button = page.locator('.seq-lane-editor-wrap .seq-drag-num').first();
  await button.waitFor({ timeout: 5000 });
  const text = String(await button.textContent());
  const value = Number.parseInt(text.trim(), 10);
  assert(Number.isFinite(value), `Could not read editor step count from ${text}`);
  return value;
}

async function readEditorDragNumber(page, controlIndex, label) {
  const text = String(await page.locator('.seq-lane-editor-wrap .seq-drag-num').nth(controlIndex).textContent());
  const value = Number.parseInt(text.trim(), 10);
  assert(Number.isFinite(value), `Could not read ${label} editor control from ${text}`);
  return value;
}

async function setEditorControlViaDrag(page, controlIndex, desiredValue, engineMode, tab, label) {
  const control = page.locator('.seq-lane-editor-wrap .seq-drag-num').nth(controlIndex);
  await control.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await readEditorDragNumber(page, controlIndex, label);
    if (current === desiredValue) return;
    const box = await control.boundingBox();
    assert(box, `${engineMode}/${tab}: could not locate ${label} control for drag`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const delta = desiredValue - current;
    const dragPixels = Math.min(36, Math.max(8, Math.abs(delta) * 7));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - Math.sign(delta) * dragPixels, { steps: Math.max(4, Math.abs(delta)) });
    await page.mouse.up();
    await page.waitForTimeout(220);
  }
  const finalValue = await readEditorDragNumber(page, controlIndex, label);
  assert(
    finalValue === desiredValue,
    `${engineMode}/${tab}: ${label} control did not reach ${desiredValue}; got ${finalValue}`,
  );
}

async function setEditorSteps(page, desiredSteps) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await editorSteps(page);
    if (current === desiredSteps) return;
    await page.keyboard.down('KeyZ');
    await page.keyboard.press(current < desiredSteps ? 'ArrowRight' : 'ArrowLeft');
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(200);
  }
  assert((await editorSteps(page)) === desiredSteps, `Editor steps did not reach ${desiredSteps}`);
}

async function setEditorDirection(page, targetSymbol) {
  const button = page.locator('.seq-lane-editor-wrap .seq-spark-ctrl-btn').first();
  await button.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = String(await button.textContent()).trim();
    if (current === targetSymbol) return;
    await button.click({ timeout: 5000 });
    await page.waitForTimeout(200);
  }
  assert(String(await button.textContent()).trim() === targetSymbol, `Editor direction did not reach ${targetSymbol}`);
}

async function setRangeSubLaneValueMode(page, mode) {
  const select = page.locator('.seq-lane-editor-wrap select.seq-pitch-mode').first();
  await select.waitFor({ timeout: 5000 });
  await select.selectOption(mode);
  await page.waitForTimeout(300);
  assert(await select.inputValue() === mode, `Range sub-lane value mode did not reach ${mode}`);
}

async function setPitchSubLaneMode(page, mode) {
  const select = page.locator('.seq-lane-editor-wrap select.seq-pitch-mode').first();
  await select.waitFor({ timeout: 5000 });
  await select.selectOption(mode);
  await page.waitForTimeout(300);
  assert(await select.inputValue() === mode, `Pitch mode did not reach ${mode}`);
}

async function setPitchBindingMode(page, mode) {
  const selects = page.locator('.seq-lane-editor-wrap select.seq-pitch-mode');
  if ((await selects.count()) < 2) return;
  await selects.nth(1).selectOption(mode);
  await page.waitForTimeout(450);
  assert(await selects.nth(1).inputValue() === mode, `Pitch binding mode did not reach ${mode}`);
}

async function setPitchScale(page, scale) {
  const select = page.locator('.seq-lane-editor-wrap select.seq-pitch-scale').first();
  await select.waitFor({ timeout: 5000 });
  await select.selectOption(scale);
  await page.waitForTimeout(250);
  assert(await select.inputValue() === scale, `Pitch scale did not reach ${scale}`);
}

async function setPitchScaleQuantize(page, enabled) {
  const checkbox = page.locator('.seq-lane-editor-wrap .seq-scale-quantize input').first();
  await checkbox.waitFor({ timeout: 5000 });
  if ((await checkbox.isChecked()) !== enabled) {
    await checkbox.click({ timeout: 5000 });
    await page.waitForTimeout(250);
  }
  assert((await checkbox.isChecked()) === enabled, `Pitch scale quantize did not reach ${enabled}`);
}

async function setPitchRoot(page, root, engineMode, tab) {
  await setEditorControlViaDrag(page, 1, root, engineMode, tab, 'pitch root');
}

async function setPitchNoteRange(page, minMidi, maxMidi, engineMode, tab) {
  const rails = page.locator('.seq-lane-editor-wrap .seq-note-range-slider .sl-slider-rail');
  await rails.first().waitFor({ timeout: 5000 });
  assert(await rails.count() >= 2, `${engineMode}/${tab}: noteRange controls were not visible`);
  const values = [minMidi, maxMidi];
  for (const index of [1, 0]) {
    const rail = rails.nth(index);
    const box = await rail.boundingBox();
    assert(box, `${engineMode}/${tab}: could not locate noteRange ${index === 0 ? 'low' : 'high'} rail`);
    const percent = midiToNoteRangePercent(values[index]);
    await page.mouse.click(box.x + (box.width * percent) / 100, box.y + box.height / 2);
    await page.waitForTimeout(300);
  }
}

async function setExpressionValueMode(page, mode) {
  await setRangeSubLaneValueMode(page, mode);
}

async function setRangeSubLaneRange(page, min, max) {
  await setRangeSubLaneValueMode(page, 'range');
  const inputs = page.locator('.seq-lane-editor-wrap input[type="range"]');
  await inputs.first().waitFor({ timeout: 5000 });
  assert(await inputs.count() >= 2, 'Range sub-lane mode did not expose low/high range sliders');
  await inputs.nth(0).evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, String(value));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, min);
  await page.waitForTimeout(150);
  await inputs.nth(1).evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, String(value));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, max);
  await page.waitForTimeout(300);
}

async function setExpressionRange(page, min, max) {
  await setRangeSubLaneRange(page, min, max);
}

async function readRangeSubLaneEditorState(page, lane) {
  const sparkIndex = RANGE_SUB_LANE_SPARK_INDEX[lane];
  assert(Number.isInteger(sparkIndex), `Unknown range sub-lane ${lane}`);
  await ensureSparklineEnabled(page, sparkIndex);
  const modeSelect = page.locator('.seq-lane-editor-wrap select.seq-pitch-mode').first();
  const steps = await editorSteps(page);
  const direction = String(await page.locator('.seq-lane-editor-wrap .seq-spark-ctrl-btn').first().textContent()).trim();
  const mode = await modeSelect.inputValue();
  const bodyText = String(await page.locator('.seq-lane-editor-wrap').textContent());
  const badgeSteps = String(await page.locator('.seq-spark-strip').nth(sparkIndex).locator('.seq-spark-badge-steps').first().textContent()).trim();
  return { lane, steps, direction, mode, bodyText, badgeSteps };
}

async function readPitchSubLaneEditorState(page) {
  await ensurePitchSparklineEnabled(page);
  const modeSelects = page.locator('.seq-lane-editor-wrap select.seq-pitch-mode');
  const mode = await modeSelects.first().inputValue();
  const bindingMode = (await modeSelects.count()) >= 2 ? await modeSelects.nth(1).inputValue() : undefined;
  const scaleSelect = page.locator('.seq-lane-editor-wrap select.seq-pitch-scale').first();
  const scale = (await scaleSelect.count()) > 0 ? await scaleSelect.inputValue() : undefined;
  const quantizeInput = page.locator('.seq-lane-editor-wrap .seq-scale-quantize input').first();
  const scaleQuantize = (await quantizeInput.count()) > 0 ? await quantizeInput.isChecked() : undefined;
  const steps = await editorSteps(page);
  const rootControlCount = await page.locator('.seq-lane-editor-wrap .seq-drag-num').count();
  const root = rootControlCount >= 2 ? await readEditorDragNumber(page, 1, 'pitch root') : undefined;
  const direction = String(await page.locator('.seq-lane-editor-wrap .seq-spark-ctrl-btn').first().textContent()).trim();
  const bodyText = String(await page.locator('.seq-lane-editor-wrap').textContent());
  const badgeSteps = String(await page.locator('.seq-spark-strip').nth(PITCH_SUB_LANE_SPARK_INDEX).locator('.seq-spark-badge-steps').first().textContent()).trim();
  const stripClass = String(await page.locator('.seq-spark-strip').nth(PITCH_SUB_LANE_SPARK_INDEX).getAttribute('class'));
  const noteRangeLabels = mode === 'noteRange'
    ? await page.locator('.seq-lane-editor-wrap .seq-note-range-slider .app-slider-value').evaluateAll((nodes) =>
      nodes.slice(0, 2).map((node) => String(node.textContent ?? '').trim())
    )
    : [];
  return {
    lane: 'pitch',
    steps,
    direction,
    mode,
    bindingMode,
    root,
    scale,
    scaleQuantize,
    noteMinLabel: noteRangeLabels[0],
    noteMaxLabel: noteRangeLabels[1],
    bodyText,
    badgeSteps,
    enabled: !stripClass.includes('disabled'),
  };
}

async function readExpressionEditorState(page) {
  return readRangeSubLaneEditorState(page, 'expression');
}

function assertRangeSubLaneState(actual, expected, context) {
  const label = actual.lane ?? 'range sub-lane';
  assert(actual.steps === expected.steps, `${context}: expected ${label} steps ${expected.steps}, got ${actual.steps}`);
  assert(actual.badgeSteps === String(expected.steps), `${context}: ${label} badge did not show ${expected.steps}, got ${actual.badgeSteps}`);
  assert(actual.direction === expected.direction, `${context}: expected ${label} direction ${expected.direction}, got ${actual.direction}`);
  assert(actual.mode === expected.mode, `${context}: expected ${label} mode ${expected.mode}, got ${actual.mode}`);
  if (expected.mode === 'range') {
    assert(actual.bodyText.includes(expected.lowLabel), `${context}: missing range low label ${expected.lowLabel}`);
    assert(actual.bodyText.includes(expected.highLabel), `${context}: missing range high label ${expected.highLabel}`);
  }
}

function assertPitchSubLaneState(actual, expected, context) {
  assert(actual.enabled === true, `${context}: pitch sub-lane was not enabled`);
  assert(actual.steps === expected.steps, `${context}: expected pitch steps ${expected.steps}, got ${actual.steps}`);
  assert(actual.badgeSteps === String(expected.steps), `${context}: pitch badge did not show ${expected.steps}, got ${actual.badgeSteps}`);
  assert(actual.direction === expected.direction, `${context}: expected pitch direction ${expected.direction}, got ${actual.direction}`);
  assert(actual.mode === expected.mode, `${context}: expected pitch mode ${expected.mode}, got ${actual.mode}`);
  if (expected.bindingMode) {
    assert(actual.bindingMode === expected.bindingMode, `${context}: expected pitch binding ${expected.bindingMode}, got ${actual.bindingMode}`);
  }
  if (expected.root !== undefined) {
    assert(actual.root === expected.root, `${context}: expected pitch root ${expected.root}, got ${actual.root}`);
  }
  if (expected.scale) {
    assert(actual.scale === expected.scale, `${context}: expected pitch scale ${expected.scale}, got ${actual.scale}`);
  }
  if (expected.scaleQuantize !== undefined) {
    assert(actual.scaleQuantize === expected.scaleQuantize, `${context}: expected pitch quantize ${expected.scaleQuantize}, got ${actual.scaleQuantize}`);
  }
  if (expected.noteMin !== undefined) {
    const label = midiToName(expected.noteMin);
    assert(actual.noteMinLabel === label, `${context}: expected noteRange low ${label}, got ${actual.noteMinLabel}`);
  }
  if (expected.noteMax !== undefined) {
    const label = midiToName(expected.noteMax);
    assert(actual.noteMaxLabel === label, `${context}: expected noteRange high ${label}, got ${actual.noteMaxLabel}`);
  }
}

function assertExpressionState(actual, expected, context) {
  assertRangeSubLaneState(actual, expected, context);
}

async function setRangeSubLaneState(page, lane, options) {
  const sparkIndex = RANGE_SUB_LANE_SPARK_INDEX[lane];
  assert(Number.isInteger(sparkIndex), `Unknown range sub-lane ${lane}`);
  await ensureSparklineEnabled(page, sparkIndex);
  await setRangeSubLaneValueMode(page, options.mode);
  await setEditorSteps(page, options.steps);
  await setEditorDirection(page, options.direction);
  if (options.mode === 'range') await setRangeSubLaneRange(page, options.rangeMin, options.rangeMax);
  await page.waitForTimeout(300);
}

async function setPitchSubLaneState(page, engineMode, tab, options) {
  await ensurePitchSparklineEnabled(page);
  if (tab === 'synth') await setPitchBindingMode(page, 'polyrhythmic');
  await setPitchSubLaneMode(page, options.mode);
  await setEditorSteps(page, options.steps);
  await setEditorDirection(page, options.direction);
  if (options.root !== undefined) await setPitchRoot(page, options.root, engineMode, tab);
  if (options.scale) await setPitchScale(page, options.scale);
  if (options.scaleQuantize !== undefined) await setPitchScaleQuantize(page, options.scaleQuantize);
  if (options.mode === 'noteRange' && options.noteMin !== undefined && options.noteMax !== undefined) {
    await setPitchNoteRange(page, options.noteMin, options.noteMax, engineMode, tab);
  }
  if (tab === 'synth' && options.bindingMode) await setPitchBindingMode(page, options.bindingMode);
  await page.waitForTimeout(350);
}

async function setExpressionSequenceState(page, options) {
  await setRangeSubLaneState(page, 'expression', options);
}

async function ratchetLineCount(page, stepIndex) {
  const ratchet = page.locator('.seq-lane-editor-wrap .seq-step-ratchet').nth(stepIndex);
  await ratchet.waitFor({ timeout: 5000 });
  return ratchet.locator('.ratch-line').count();
}

async function setExpressionRatchetLineCount(page, stepIndex, desired, engineMode, tab) {
  const ratchet = page.locator('.seq-lane-editor-wrap .seq-step-ratchet').nth(stepIndex);
  await ratchet.waitFor({ timeout: 5000 });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const current = await ratchetLineCount(page, stepIndex);
    if (current === desired) return;
    await ratchet.click({ timeout: 5000 });
    await page.waitForTimeout(150);
  }
  assert(
    (await ratchetLineCount(page, stepIndex)) === desired,
    `${engineMode}/${tab}: expression ratchet for step ${stepIndex} did not reach ${desired}`,
  );
}

async function editorStepValueSignature(page) {
  const editor = page.locator('.seq-lane-editor-wrap').first();
  await editor.waitFor({ timeout: 5000 });
  return editor.evaluate((node) => Array.from(node.querySelectorAll('.seq-step')).map((step) => {
    const valueNode = step.querySelector('.seq-vel-label, .pitch-val, .seq-morph-label, .seq-distance-label, .prob-label');
    const barNode = step.querySelector('.seq-vel-bar, .pitch-bar, .seq-morph-fill, .distance-fill, .prob-fill');
    const ratchet = step.querySelector('.seq-step-ratchet');
    return [
      String(valueNode?.textContent ?? step.textContent ?? '').trim().replace(/\s+/g, ' '),
      String(barNode?.getAttribute('style') ?? ''),
      String(ratchet?.className ?? ''),
      String(step.querySelector('.seq-step-cell, .seq-vel-bar-wrap')?.className ?? ''),
    ].join('~');
  }).join('|'));
}

async function editorStepValueOnlySignature(page) {
  const editor = page.locator('.seq-lane-editor-wrap').first();
  await editor.waitFor({ timeout: 5000 });
  return editor.evaluate((node) => Array.from(node.querySelectorAll('.seq-step')).map((step) => {
    const valueNode = step.querySelector('.seq-vel-label, .pitch-val, .seq-morph-label, .seq-distance-label, .prob-label');
    const barNode = step.querySelector('.seq-vel-bar, .pitch-bar, .seq-morph-fill, .distance-fill, .prob-fill');
    const noteNode = step.querySelector('.seq-pitch-note-name');
    return [
      String(valueNode?.textContent ?? step.textContent ?? '').trim().replace(/\s+/g, ' '),
      String(noteNode?.textContent ?? '').trim(),
      String(barNode?.getAttribute('style') ?? ''),
    ].join('~');
  }).join('|'));
}

async function nudgeSelectedEditorValue(page, direction, times = 1) {
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.press(direction > 0 ? 'ArrowUp' : 'ArrowDown');
    await page.waitForTimeout(180);
  }
}

async function nudgeSelectedEditorValueUntilChanged(page, preferredDirection) {
  const directions = [preferredDirection, -preferredDirection];
  for (const direction of directions) {
    const before = await editorStepValueOnlySignature(page);
    await nudgeSelectedEditorValue(page, direction, 1);
    const after = await editorStepValueOnlySignature(page);
    if (after !== before) return { direction, before, after };
  }
  throw new Error(`Selected editor value did not change with keyboard nudge (${preferredDirection})`);
}

async function writeRangeSubLaneStepValues(page, engineMode, tab, lane, state, moves) {
  await setRangeSubLaneState(page, lane, state);
  for (const move of moves) {
    await setSelectedEditorStep(page, move.step, engineMode, tab, `${lane} value`);
    await nudgeSelectedEditorValue(page, move.direction, move.times);
  }
  return editorStepValueOnlySignature(page);
}

async function proofExpressionRatchetControl(page, engineMode, tab) {
  await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX.expression);
  await setRangeSubLaneValueMode(page, 'sequence');
  await setEditorSteps(page, 4);
  const stepIndex = 0;
  const ratchet = page.locator('.seq-lane-editor-wrap .seq-step-ratchet').nth(stepIndex);
  const before = await ratchetLineCount(page, stepIndex);
  await ratchet.click({ timeout: 5000 });
  await page.waitForTimeout(250);
  const changed = await ratchetLineCount(page, stepIndex);
  assert(changed !== before, `${engineMode}/${tab}: expression ratchet did not change for step ${stepIndex} (${before})`);
  for (let attempt = 0; attempt < 3 && (await ratchetLineCount(page, stepIndex)) !== before; attempt += 1) {
    await ratchet.click({ timeout: 5000 });
    await page.waitForTimeout(150);
  }
  const restored = await ratchetLineCount(page, stepIndex);
  assert(restored === before, `${engineMode}/${tab}: expression ratchet did not restore for step ${stepIndex} (${before} -> ${changed} -> ${restored})`);
  return { stepIndex, before, changed, restored };
}

async function prepareSubLaneCursorAnimationProof(page, engineMode, tab) {
  await setPitchSubLaneState(page, engineMode, tab, {
    steps: 4,
    direction: '\u2192',
    mode: 'semitones',
    root: 60,
    scale: 'Major',
    scaleQuantize: false,
    ...(tab === 'synth' ? { bindingMode: 'polyrhythmic' } : {}),
  });
  for (const lane of Object.keys(RANGE_SUB_LANE_SPARK_INDEX)) {
    await setRangeSubLaneState(page, lane, {
      steps: 4,
      direction: '\u2192',
      mode: 'sequence',
    });
  }
}

async function proofEvolveDiceMutatesState(page, engineMode, tab) {
  await ensureEvolvePanelOpen(page, engineMode, tab);
  await setRangeSubLaneState(page, 'expression', {
    steps: 8,
    direction: '\u2192',
    mode: 'sequence',
  });
  const before = await editorStepValueOnlySignature(page);
  await page.locator('.seq-evolve-dice').first().click({ timeout: 5000 });
  let after = before;
  for (let attempt = 0; attempt < 12 && after === before; attempt += 1) {
    await page.waitForTimeout(250);
    await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX.expression);
    after = await editorStepValueOnlySignature(page);
  }
  assert(after !== before, `${engineMode}/${tab}: evolve dice did not mutate expression lane state`);
  await page.locator('.seq-evolve-reset').first().click({ timeout: 5000 });
  let reset = '';
  for (let attempt = 0; attempt < 12 && reset !== after; attempt += 1) {
    await page.waitForTimeout(250);
    await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX.expression);
    reset = await editorStepValueOnlySignature(page);
  }
  assert(reset === after, `${engineMode}/${tab}: evolve reset did not restore diced home state (${signatureDiffSummary(after, reset)})`);
  return { before, after, reset };
}

async function ensureEvolveAdvancedOpen(page, engineMode, tab) {
  await ensureEvolvePanelOpen(page, engineMode, tab);
  const advancedBody = page.locator('.seq-evolve-advanced-body').first();
  await advancedBody.waitFor({ state: 'attached', timeout: 5000 });
  if (!String(await advancedBody.getAttribute('class')).includes(' open')) {
    await page.locator('.seq-evolve-advanced-toggle').first().click({ timeout: 5000 });
    await page.waitForTimeout(300);
  }
  assert(
    String(await advancedBody.getAttribute('class')).includes(' open'),
    `${engineMode}/${tab}: evolve advanced panel did not open`,
  );
}

async function setRangeInputValue(input, value) {
  await input.evaluate((node, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, String(nextValue));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function setNamedCheckboxState(page, containerSelector, label, checked) {
  const labels = page.locator(`${containerSelector} label`);
  const count = await labels.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = labels.nth(index);
    if (String(await candidate.textContent()).trim() !== label) continue;
    const input = candidate.locator('input').first();
    if ((await input.isChecked()) !== checked) {
      await input.click({ timeout: 5000 });
      await page.waitForTimeout(150);
    }
    assert((await input.isChecked()) === checked, `${containerSelector} ${label} checkbox did not reach ${checked}`);
    return;
  }
  throw new Error(`${containerSelector} checkbox ${label} was not found`);
}

async function activeModeButtonText(row) {
  const text = await row.locator('.seq-evolve-mode-btn').evaluateAll((buttons) => {
    const active = buttons.find((button) => String(button.className).includes(' active'));
    return active ? String(active.textContent ?? '').trim() : '';
  });
  assert(text, 'Could not find active evolve mode button');
  return text;
}

async function readNamedCheckboxStates(page, containerSelector) {
  const container = page.locator(containerSelector).first();
  if ((await container.count()) === 0) return undefined;
  return container.locator('label').evaluateAll((labels) => Object.fromEntries(
    labels.map((label) => {
      const input = label.querySelector('input');
      const text = String(label.textContent ?? '').trim();
      return [text, Boolean(input?.checked)];
    }).filter(([text]) => Boolean(text)),
  ));
}

async function readEvolveEditorState(page, engineMode, tab) {
  await ensureEvolveAdvancedOpen(page, engineMode, tab);
  const everyBars = Number.parseInt(String(await page.locator('.seq-evolve-row .seq-drag-num').first().textContent()).trim(), 10);
  const evolutionPercent = Number(await page.locator('.seq-evolve-zone-wrap input[type="range"]').first().inputValue());
  const writeRow = page.locator('.seq-evolve-advanced-row').nth(0);
  const writeMode = await activeModeButtonText(writeRow);
  const writeOffsetInput = writeRow.locator('input[type="range"]').first();
  const writeOffset = writeMode === 'Manual' && (await writeOffsetInput.count()) > 0
    ? Number(await writeOffsetInput.inputValue())
    : 'auto';
  const mutationMode = await activeModeButtonText(page.locator('.seq-evolve-advanced-row').nth(1));
  const methods = await readNamedCheckboxStates(page, '.seq-evolve-checks');
  const subLanes = await readNamedCheckboxStates(page, '.seq-evolve-sublanes');
  return {
    enabled: String(await page.locator('.seq-evolve-btn').first().getAttribute('class')).includes(' on'),
    everyBars,
    evolutionPercent,
    writeOffset,
    mutationMode: mutationMode.toLowerCase(),
    methods,
    subLanes,
  };
}

async function setEvolveEditorState(page, engineMode, tab, expected) {
  await ensureEvolveAdvancedOpen(page, engineMode, tab);
  await setRangeInputValue(page.locator('.seq-evolve-zone-wrap input[type="range"]').first(), expected.evolutionPercent);
  await page.waitForTimeout(250);

  const writeRow = page.locator('.seq-evolve-advanced-row').nth(0);
  if (expected.writeOffset === 'auto') {
    await writeRow.locator('.seq-evolve-mode-btn').filter({ hasText: /^Auto$/ }).first().click({ timeout: 5000 });
  } else {
    await writeRow.locator('.seq-evolve-mode-btn').filter({ hasText: /^Manual$/ }).first().click({ timeout: 5000 });
    await page.waitForTimeout(200);
    await setRangeInputValue(writeRow.locator('input[type="range"]').first(), expected.writeOffset);
  }
  await page.waitForTimeout(250);

  const mutationRow = page.locator('.seq-evolve-advanced-row').nth(1);
  await mutationRow
    .locator('.seq-evolve-mode-btn')
    .filter({ hasText: expected.mutationMode === 'strict' ? /^Strict$/ : /^Biased$/ })
    .first()
    .click({ timeout: 5000 });
  await page.waitForTimeout(200);

  for (const [method, enabled] of Object.entries(expected.methods ?? {})) {
    await setNamedCheckboxState(page, '.seq-evolve-checks', method, enabled);
  }
  if (tab === 'synth') {
    for (const [subLane, enabled] of Object.entries(expected.subLanes ?? {})) {
      await setNamedCheckboxState(page, '.seq-evolve-sublanes', subLane, enabled);
    }
  }
  await page.waitForTimeout(350);
}

function assertEvolveEditorState(actual, expected, context) {
  assert(actual.enabled === true, `${context}: evolve was not enabled`);
  assert(actual.everyBars === expected.everyBars, `${context}: expected evolve every ${expected.everyBars}, got ${actual.everyBars}`);
  assert(actual.evolutionPercent === expected.evolutionPercent, `${context}: expected evolution ${expected.evolutionPercent}, got ${actual.evolutionPercent}`);
  assert(actual.writeOffset === expected.writeOffset, `${context}: expected write offset ${expected.writeOffset}, got ${actual.writeOffset}`);
  assert(actual.mutationMode === expected.mutationMode, `${context}: expected mutation ${expected.mutationMode}, got ${actual.mutationMode}`);
  for (const [method, enabled] of Object.entries(expected.methods ?? {})) {
    assert(actual.methods?.[method] === enabled, `${context}: expected method ${method}=${enabled}, got ${actual.methods?.[method]}`);
  }
  for (const [subLane, enabled] of Object.entries(expected.subLanes ?? {})) {
    assert(actual.subLanes?.[subLane] === enabled, `${context}: expected evolve sub-lane ${subLane}=${enabled}, got ${actual.subLanes?.[subLane]}`);
  }
}

async function readLaneTimingEditorState(page) {
  const clockDiv = await page.locator('.seq-clock-select').first().inputValue();
  const swing = Number(await page.locator('.seq-swing-range').first().inputValue());
  const swingLabel = String(await page.locator('.seq-swing-val').first().textContent()).trim();
  return { clockDiv, swing, swingLabel };
}

async function setLaneTimingEditorState(page, expected) {
  await page.locator('.seq-clock-select').first().waitFor({ timeout: 10000 });
  await page.locator('.seq-clock-select').first().selectOption(expected.clockDiv);
  await page.waitForTimeout(250);
  await setRangeInputValue(page.locator('.seq-swing-range').first(), expected.swing);
  await page.waitForTimeout(250);
}

function assertLaneTimingEditorState(actual, expected, context) {
  assert(actual.clockDiv === expected.clockDiv, `${context}: expected clock ${expected.clockDiv}, got ${actual.clockDiv}`);
  assert(Math.abs(actual.swing - expected.swing) < 0.001, `${context}: expected swing ${expected.swing}, got ${actual.swing}`);
  assert(actual.swingLabel === `${Math.round(expected.swing * 100)}%`, `${context}: expected swing label ${Math.round(expected.swing * 100)}%, got ${actual.swingLabel}`);
}

function countPlayheadTransitions(samples) {
  let previous = null;
  let transitions = 0;
  for (const sample of samples) {
    if (!sample) continue;
    if (previous !== null && sample !== previous) transitions += 1;
    previous = sample;
  }
  return transitions;
}

async function sampleTriggerPlayheadCadence(page, durationMs = 2200, intervalMs = 85) {
  const samples = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    samples.push((await activeTriggerCells(page)).join(','));
    await page.waitForTimeout(intervalMs);
  }
  const activeSamples = samples.filter(Boolean);
  return {
    samples,
    transitions: countPlayheadTransitions(samples),
    uniquePositions: new Set(activeSamples).size,
  };
}

async function proofClockDivisionAffectsTriggerCadence(page, engineMode, tab) {
  await setTriggerControlViaDrag(page, 0, 16, engineMode, tab, 'timing proof trigger steps');

  await setLaneTimingEditorState(page, { clockDiv: '1/4', swing: 0 });
  await page.waitForTimeout(650);
  const slow = await sampleTriggerPlayheadCadence(page);

  await setLaneTimingEditorState(page, { clockDiv: '1/16', swing: 0 });
  await page.waitForTimeout(650);
  const fast = await sampleTriggerPlayheadCadence(page);

  assert(slow.uniquePositions >= 2, `${engineMode}/${tab}: slow clock did not advance enough to measure timing (${slow.samples.join(' | ')})`);
  assert(
    fast.transitions >= slow.transitions + 2,
    `${engineMode}/${tab}: fast clock did not increase trigger playhead cadence (slow ${slow.transitions}/${slow.uniquePositions}, fast ${fast.transitions}/${fast.uniquePositions})`,
  );

  return {
    slowClock: '1/4',
    fastClock: '1/16',
    slow,
    fast,
    restoredTiming: await readLaneTimingEditorState(page),
  };
}

async function saveActiveSequencePreset(page, name) {
  const control = page.locator('.seq-sequence-preset-dropdown').first();
  await control.waitFor({ timeout: 10000 });
  await control.locator('button').filter({ hasText: /^Save Sequence$/ }).first().click({ timeout: 5000 });
  const nameInput = page.locator('input[placeholder="Preset name"]').first();
  await nameInput.waitFor({ timeout: 5000 });
  await nameInput.fill(name);
  const noteInput = page.locator('input[placeholder="Version note (optional)"]').first();
  if ((await noteInput.count()) > 0) await noteInput.fill('sequencer parity audit');
  await page.locator('button').filter({ hasText: /^Save$/ }).last().click({ timeout: 5000 });
  await nameInput.waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForFunction((presetName) => (
    Array.from(document.querySelectorAll('.seq-sequence-preset-dropdown select option'))
      .some((option) => option.value === presetName)
  ), name, { timeout: 30000 });
  await page.waitForTimeout(500);
}

async function loadActiveSequencePreset(page, name) {
  const select = page.locator('.seq-sequence-preset-dropdown select').first();
  await select.waitFor({ timeout: 10000 });
  await select.selectOption(name);
  await page.waitForTimeout(1000);
}

async function proofSequencePresetRoundTrip(page, engineMode, tab) {
  if (tab === 'drums') await setDrumLinkedState(page, false, engineMode);
  const savedName = `__sequencer_audit_${engineMode}_${tab}_a`;
  const changedName = `__sequencer_audit_${engineMode}_${tab}_b`;
  const disabledSubLane = 'distance';
  const changedPitchSteps = tab === 'synth' ? await expectedVisibleHits(page) : 4;
  const savedPitchState = {
    steps: 8,
    direction: '\u2194',
    mode: 'notes',
    root: 57,
    scale: 'Minor',
    scaleQuantize: true,
    ...(tab === 'synth' ? { bindingMode: 'polyrhythmic' } : {}),
  };
  const changedPitchState = {
    steps: changedPitchSteps,
    direction: '\u2192',
    mode: 'semitones',
    root: 66,
    scale: 'Major',
    scaleQuantize: false,
    ...(tab === 'synth' ? { bindingMode: 'linked' } : {}),
  };
  const savedEvolveState = {
    everyBars: 4,
    evolutionPercent: 75,
    writeOffset: 2,
    mutationMode: 'strict',
    methods: {
      probDrift: false,
      valueScramble: true,
    },
    ...(tab === 'synth' ? { subLanes: { probability: false, ratchet: true } } : {}),
  };
  const changedEvolveState = {
    everyBars: 4,
    evolutionPercent: 35,
    writeOffset: 'auto',
    mutationMode: 'biased',
    methods: {
      probDrift: true,
      valueScramble: false,
    },
    ...(tab === 'synth' ? { subLanes: { probability: true, ratchet: false } } : {}),
  };
  const savedTimingState = {
    clockDiv: '1/16T',
    swing: 0.35,
  };
  const changedTimingState = {
    clockDiv: '1/4',
    swing: 0.1,
  };
  const savedStates = {
    expression: {
      steps: 6,
      direction: '\u2190',
      mode: 'range',
      rangeMin: 0.25,
      rangeMax: 0.85,
      lowLabel: 'Low: 25%',
      highLabel: 'High: 85%',
    },
    morph: {
      steps: 5,
      direction: '\u2194',
      mode: 'range',
      rangeMin: 0.25,
      rangeMax: 0.75,
      lowLabel: 'Low: 50% A',
      highLabel: 'High: 50% B',
    },
    distance: {
      steps: 7,
      direction: '\u2190',
      mode: 'range',
      rangeMin: 0.1,
      rangeMax: 0.9,
      lowLabel: 'Low: 10%',
      highLabel: 'High: 90%',
    },
  };
  const changedStates = {
    expression: {
      steps: 3,
      direction: '\u2194',
      mode: 'sequence',
    },
    morph: {
      steps: 4,
      direction: '\u2192',
      mode: 'sequence',
    },
    distance: {
      steps: 2,
      direction: '\u2194',
      mode: 'sequence',
    },
  };

  await setPitchSubLaneState(page, engineMode, tab, savedPitchState);
  assertPitchSubLaneState(await readPitchSubLaneEditorState(page), savedPitchState, `${engineMode}/${tab}: pre-save pitch sequence state`);
  await setLaneTimingEditorState(page, savedTimingState);
  assertLaneTimingEditorState(await readLaneTimingEditorState(page), savedTimingState, `${engineMode}/${tab}: pre-save timing config`);
  await setEvolveEditorState(page, engineMode, tab, savedEvolveState);
  assertEvolveEditorState(await readEvolveEditorState(page, engineMode, tab), savedEvolveState, `${engineMode}/${tab}: pre-save evolve config`);
  for (const [lane, expected] of Object.entries(savedStates)) {
    await setRangeSubLaneState(page, lane, expected);
    assertRangeSubLaneState(await readRangeSubLaneEditorState(page, lane), expected, `${engineMode}/${tab}: pre-save ${lane} sequence state`);
  }
  await setSubLaneEnabled(page, RANGE_SUB_LANE_SPARK_INDEX[disabledSubLane], false, engineMode, tab, disabledSubLane);
  assert(
    await readSubLaneEnabled(page, RANGE_SUB_LANE_SPARK_INDEX[disabledSubLane]) === false,
    `${engineMode}/${tab}: pre-save ${disabledSubLane} sub-lane did not remain disabled`,
  );
  await saveActiveSequencePreset(page, savedName);

  await setPitchSubLaneState(page, engineMode, tab, changedPitchState);
  assertPitchSubLaneState(await readPitchSubLaneEditorState(page), changedPitchState, `${engineMode}/${tab}: changed pitch sequence state`);
  await setLaneTimingEditorState(page, changedTimingState);
  assertLaneTimingEditorState(await readLaneTimingEditorState(page), changedTimingState, `${engineMode}/${tab}: changed timing config`);
  await setEvolveEditorState(page, engineMode, tab, changedEvolveState);
  assertEvolveEditorState(await readEvolveEditorState(page, engineMode, tab), changedEvolveState, `${engineMode}/${tab}: changed evolve config`);
  for (const [lane, expected] of Object.entries(changedStates)) {
    await setRangeSubLaneState(page, lane, expected);
    assertRangeSubLaneState(await readRangeSubLaneEditorState(page, lane), expected, `${engineMode}/${tab}: changed ${lane} sequence state`);
  }
  await saveActiveSequencePreset(page, changedName);

  await loadActiveSequencePreset(page, savedName);
  const restoredDisabledSubLaneEnabled = await readSubLaneEnabled(page, RANGE_SUB_LANE_SPARK_INDEX[disabledSubLane]);
  assert(
    restoredDisabledSubLaneEnabled === false,
    `${engineMode}/${tab}: loaded sequence preset did not restore disabled ${disabledSubLane} sub-lane`,
  );
  const restored = {
    pitch: await readPitchSubLaneEditorState(page),
    timing: await readLaneTimingEditorState(page),
    evolve: await readEvolveEditorState(page, engineMode, tab),
    disabledSubLane: { lane: disabledSubLane, enabled: restoredDisabledSubLaneEnabled },
  };
  assertPitchSubLaneState(restored.pitch, savedPitchState, `${engineMode}/${tab}: loaded pitch sequence preset`);
  assertLaneTimingEditorState(restored.timing, savedTimingState, `${engineMode}/${tab}: loaded timing sequence preset`);
  assertEvolveEditorState(restored.evolve, savedEvolveState, `${engineMode}/${tab}: loaded evolve sequence preset`);
  for (const [lane, expected] of Object.entries(savedStates)) {
    const actual = await readRangeSubLaneEditorState(page, lane);
    assertRangeSubLaneState(actual, expected, `${engineMode}/${tab}: loaded ${lane} sequence preset`);
    restored[lane] = actual;
  }

  await setPitchSubLaneState(page, engineMode, tab, changedPitchState);
  await setRangeSubLaneState(page, 'expression', changedStates.expression);
  await ensureEvolvePanelOpen(page, engineMode, tab);
  await page.locator('.seq-evolve-reset').first().click({ timeout: 5000 });
  await page.waitForTimeout(900);
  const resetRestored = {
    pitch: await readPitchSubLaneEditorState(page),
    expression: await readRangeSubLaneEditorState(page, 'expression'),
  };
  assertPitchSubLaneState(resetRestored.pitch, savedPitchState, `${engineMode}/${tab}: reset after sequence load pitch home`);
  assertRangeSubLaneState(resetRestored.expression, savedStates.expression, `${engineMode}/${tab}: reset after sequence load expression home`);

  return { savedName, changedName, restoredSubLanes: restored, resetRestored };
}

async function proofEuclideanTriggerPatternControls(page, engineMode, tab) {
  const targetSteps = 12;
  await setTriggerStepsViaKeyboard(page, targetSteps, engineMode, tab);
  const initialHits = await readTriggerControlNumber(page, 1);
  assert(initialHits > 0 && initialHits <= targetSteps, `${engineMode}/${tab}: trigger hits ${initialHits} are outside 1..${targetSteps}`);
  const targetHits = initialHits === 5 ? 3 : 5;
  await setTriggerControlViaDrag(page, 1, targetHits, engineMode, tab, 'trigger hits');
  await setTriggerRotation(page, 0);
  await page.waitForTimeout(350);
  const basePattern = await triggerPatternState(page);
  const baseActive = basePattern.filter((entry) => entry.active).map((entry) => entry.index);
  const baseOutOfRange = basePattern.filter((entry) => entry.inactive).map((entry) => entry.index);
  assert(baseActive.length === targetHits, `${engineMode}/${tab}: expected ${targetHits} Euclidean hits, got ${baseActive.join(',')}`);
  assert(baseOutOfRange.every((index) => index >= targetSteps), `${engineMode}/${tab}: trigger inactive cells did not start at step ${targetSteps}: ${baseOutOfRange.join(',')}`);

  await setTriggerRotation(page, 2);
  await page.waitForTimeout(350);
  const rotatedPattern = await triggerPatternState(page);
  const rotatedActive = rotatedPattern.filter((entry) => entry.active).map((entry) => entry.index);
  assert(rotatedActive.length === targetHits, `${engineMode}/${tab}: rotation changed hit count ${baseActive.join(',')} -> ${rotatedActive.join(',')}`);
  assert(
    rotatedActive.join(',') !== baseActive.join(','),
    `${engineMode}/${tab}: rotation did not move the visible Euclidean pattern (${baseActive.join(',')})`,
  );

  return {
    steps: targetSteps,
    initialHits,
    hits: targetHits,
    rotation: await readTriggerRotation(page),
    baseActive,
    rotatedActive,
  };
}

async function ensureEvolvePanelOpen(page, engineMode, tab) {
  const evolveButton = page.locator('.seq-evolve-btn').first();
  await evolveButton.waitFor({ timeout: 15000 });
  if (!String(await evolveButton.getAttribute('class')).includes(' on')) {
    await evolveButton.click({ timeout: 5000 });
  }
  await page.locator('.seq-evolve-panel.open').first().waitFor({ timeout: 5000 });
  const diceButton = page.locator('.seq-evolve-dice').first();
  const resetButton = page.locator('.seq-evolve-reset').first();
  await diceButton.waitFor({ timeout: 5000 });
  await resetButton.waitFor({ timeout: 5000 });
  assert(await diceButton.isVisible(), `${engineMode}/${tab}: evolve dice control is not visible`);
  assert(await resetButton.isVisible(), `${engineMode}/${tab}: evolve reset control is not visible`);
}

async function captureEvolveFlash(page, engineMode, tab, phase) {
  await ensureEvolvePanelOpen(page, engineMode, tab);
  const before = await page.locator('.seq-evolve-flash').count();
  await page.locator('.seq-evolve-dice').first().click({ timeout: 5000 });
  const counts = [];
  for (let index = 0; index < 20; index += 1) {
    await page.waitForTimeout(50);
    counts.push(await page.locator('.seq-evolve-flash').count());
  }
  const peak = Math.max(...counts);
  await page.waitForTimeout(350);
  const cleared = await page.locator('.seq-evolve-flash').count();
  assert(peak > 0, `${engineMode}/${tab}: ${phase} dice did not show evolve flash (${counts.join(',')})`);
  assert(cleared === 0, `${engineMode}/${tab}: ${phase} evolve flash did not clear (${cleared})`);
  return { phase, before, peak, cleared, samples: counts };
}

async function exerciseEvolveReset(page, engineMode, tab, phase) {
  await ensureEvolvePanelOpen(page, engineMode, tab);
  await page.locator('.seq-evolve-reset').first().click({ timeout: 5000 });
  await page.waitForTimeout(350);
  assert(
    await page.locator('.seq-evolve-panel.open').first().isVisible(),
    `${engineMode}/${tab}: ${phase} evolve reset closed or broke the evolve panel`,
  );
  return { phase, status: 'clicked' };
}

async function expectedVisibleHits(page) {
  const expectedHits = await page.locator('.seq-trigger-always .seq-step-cell').evaluateAll((cells) =>
    cells.filter((el) =>
      String(el.className).includes('active') &&
      !String(el.className).includes('inactive')
    ).length,
  );
  assert(expectedHits > 0, `Could not derive active hit count from trigger lane: ${expectedHits}`);
  return expectedHits;
}

async function readLinkedBadgeSteps(page, count) {
  const badgeSteps = await page.locator('.seq-spark-badge-steps').evaluateAll((nodes, limit) =>
    nodes.slice(0, limit).map((node) => String(node.textContent ?? '').trim()),
  count);
  assert(badgeSteps.length >= count, `Expected ${count} linked badge values, got ${badgeSteps.length}`);
  return badgeSteps;
}

async function assertLinkedBadgeSteps(page, count, expectedHits, engineMode, tab, phase) {
  const expectedText = String(expectedHits);
  let badgeSteps = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    badgeSteps = await readLinkedBadgeSteps(page, count);
    if (badgeSteps.every((text) => text === expectedText)) {
      return badgeSteps;
    }
    await page.waitForTimeout(100);
  }
  assert(
    badgeSteps.every((text) => text === expectedText),
    `${engineMode}/${tab}: ${phase} linked badge steps did not match ${expectedHits} active hits: ${badgeSteps.join(',')}`,
  );
  return badgeSteps;
}

async function setDrumLinkedState(page, desired, engineMode = 'sequencer') {
  const linkButton = page.locator('.seq-link-btn').first();
  await linkButton.waitFor({ timeout: 10000 });
  const before = String(await linkButton.getAttribute('class')).includes('on');
  if (before !== desired) {
    await linkButton.click({ timeout: 5000 });
    await page.waitForTimeout(450);
  }
  const after = String(await linkButton.getAttribute('class')).includes('on');
  assert(after === desired, `${engineMode}/drums: link button did not enter ${desired ? 'linked' : 'unlinked'} state`);
  return after;
}

async function readDrumLinkedState(page) {
  const linkButton = page.locator('.seq-link-btn').first();
  await linkButton.waitFor({ timeout: 10000 });
  return String(await linkButton.getAttribute('class')).includes('on');
}

async function ensureDrumLinkedBadges(page, engineMode = 'sequencer') {
  const expectedHits = await expectedVisibleHits(page);
  await setDrumLinkedState(page, true, engineMode);
  const badgeSteps = await assertLinkedBadgeSteps(page, 4, expectedHits, engineMode, 'drums', 'drum');
  return { expectedHits, badgeSteps };
}

async function ensureSynthLinkedPitchBadge(page, engineMode = 'sequencer') {
  const expectedHits = await expectedVisibleHits(page);
  const pitchStrip = page.locator('.seq-spark-strip').nth(0);
  await pitchStrip.waitFor({ timeout: 10000 });
  if (String(await pitchStrip.getAttribute('class')).includes('disabled')) {
    await pitchStrip.locator('.seq-spark-badge').click({ timeout: 5000 });
    await page.waitForTimeout(250);
  }
  if (!String(await pitchStrip.getAttribute('class')).includes('expanded')) {
    await pitchStrip.click({ timeout: 5000 });
    await page.waitForTimeout(250);
  }
  const changed = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select.seq-pitch-mode'));
    const binding = selects.find((select) =>
      Array.from(select.options).some((option) => option.value === 'linked')
    );
    if (!binding) return false;
    binding.value = 'linked';
    binding.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  assert(changed, 'Synth pitch binding mode selector with Linked option was not found');
  await page.waitForTimeout(450);
  const badgeSteps = await assertLinkedBadgeSteps(page, 1, expectedHits, engineMode, 'synth', 'synth pitch');
  return { expectedHits, badgeSteps };
}

async function proofLinkedHitCountBadgeTracksHits(page, engineMode, tab) {
  await setTriggerStepsViaKeyboard(page, 12, engineMode, tab);
  const initial = tab === 'drums'
    ? await ensureDrumLinkedBadges(page, engineMode)
    : await ensureSynthLinkedPitchBadge(page, engineMode);
  const initialHits = await readTriggerControlNumber(page, 1);
  const firstHits = initialHits === 4 ? 6 : 4;
  const secondHits = firstHits === 6 ? 3 : 6;
  const badgeCount = tab === 'drums' ? 4 : 1;

  await setTriggerControlViaDrag(page, 1, firstHits, engineMode, tab, 'linked trigger hits');
  await page.waitForTimeout(450);
  const firstExpectedHits = await expectedVisibleHits(page);
  assert(firstExpectedHits === firstHits, `${engineMode}/${tab}: linked trigger hits did not reach ${firstHits}`);
  const firstBadges = await assertLinkedBadgeSteps(page, badgeCount, firstHits, engineMode, tab, 'first hit-count update');

  await setTriggerControlViaDrag(page, 1, secondHits, engineMode, tab, 'linked trigger hits update');
  await page.waitForTimeout(450);
  const secondExpectedHits = await expectedVisibleHits(page);
  assert(secondExpectedHits === secondHits, `${engineMode}/${tab}: linked trigger hits update did not reach ${secondHits}`);
  const secondBadges = await assertLinkedBadgeSteps(page, badgeCount, secondHits, engineMode, tab, 'second hit-count update');

  return {
    initialHits,
    initialBadges: initial.badgeSteps,
    firstHits,
    firstBadges,
    secondHits,
    secondBadges,
  };
}

async function proofLinkedHitCountBadgeTracksTriggerToggle(page, engineMode, tab) {
  await setTriggerStepsViaKeyboard(page, 12, engineMode, tab);
  if (tab === 'drums') await ensureDrumLinkedBadges(page, engineMode);
  else await ensureSynthLinkedPitchBadge(page, engineMode);
  const badgeCount = tab === 'drums' ? 4 : 1;
  const beforeHits = await expectedVisibleHits(page);
  const beforeBadges = await assertLinkedBadgeSteps(page, badgeCount, beforeHits, engineMode, tab, 'before keyboard toggle');
  const pattern = await triggerPatternState(page);
  const toggleTarget = pattern.find((entry) => entry.index < 12 && entry.active);
  assert(toggleTarget, `${engineMode}/${tab}: could not find an active trigger step to toggle for linked badge proof`);
  await setSelectedTriggerStep(page, toggleTarget.index, engineMode, tab);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(650);
  const afterActive = await triggerStepActive(page, toggleTarget.index);
  assert(afterActive === false, `${engineMode}/${tab}: KeyX did not disable linked trigger step ${toggleTarget.index}`);
  const afterHits = await expectedVisibleHits(page);
  assert(afterHits === beforeHits - 1, `${engineMode}/${tab}: linked trigger toggle changed hits ${beforeHits} -> ${afterHits}`);
  const afterBadges = await assertLinkedBadgeSteps(page, badgeCount, afterHits, engineMode, tab, 'after keyboard toggle');

  await page.keyboard.press('KeyX');
  await page.waitForTimeout(650);
  const restoredActive = await triggerStepActive(page, toggleTarget.index);
  assert(restoredActive === true, `${engineMode}/${tab}: second KeyX did not restore linked trigger step ${toggleTarget.index}`);
  const restoredHits = await expectedVisibleHits(page);
  assert(restoredHits === beforeHits, `${engineMode}/${tab}: linked trigger toggle restore changed hits ${beforeHits} -> ${restoredHits}`);
  const restoredBadges = await assertLinkedBadgeSteps(page, badgeCount, beforeHits, engineMode, tab, 'after keyboard toggle restore');

  return {
    stepIndex: toggleTarget.index,
    beforeHits,
    beforeBadges,
    afterHits,
    afterBadges,
    restoredHits,
    restoredBadges,
  };
}

async function proofLinkedSequencePresetRoundTrip(page, engineMode, tab) {
  const presetName = `__sequencer_audit_${engineMode}_${tab}_linked`;
  await setTriggerStepsViaKeyboard(page, 12, engineMode, tab);
  if (tab === 'drums') {
    const before = await ensureDrumLinkedBadges(page, engineMode);
    await saveActiveSequencePreset(page, presetName);
    await setDrumLinkedState(page, false, engineMode);
    await loadActiveSequencePreset(page, presetName);
    const restoredLinked = await readDrumLinkedState(page);
    assert(restoredLinked === true, `${engineMode}/drums: linked sequence preset did not restore drum link state`);
    const restoredHits = await expectedVisibleHits(page);
    const restoredBadges = await assertLinkedBadgeSteps(page, 4, restoredHits, engineMode, tab, 'loaded linked sequence preset');
    return {
      presetName,
      beforeHits: before.expectedHits,
      beforeBadges: before.badgeSteps,
      restoredLinked,
      restoredHits,
      restoredBadges,
    };
  }

  const before = await ensureSynthLinkedPitchBadge(page, engineMode);
  await saveActiveSequencePreset(page, presetName);
  await ensurePitchSparklineEnabled(page);
  await setPitchBindingMode(page, 'polyrhythmic');
  const changed = await readPitchSubLaneEditorState(page);
  assert(changed.bindingMode === 'polyrhythmic', `${engineMode}/synth: pitch binding did not change before linked preset load`);
  await loadActiveSequencePreset(page, presetName);
  const restored = await readPitchSubLaneEditorState(page);
  assert(restored.bindingMode === 'linked', `${engineMode}/synth: linked sequence preset did not restore pitch binding`);
  const restoredHits = await expectedVisibleHits(page);
  const restoredBadges = await assertLinkedBadgeSteps(page, 1, restoredHits, engineMode, tab, 'loaded linked pitch preset');
  return {
    presetName,
    beforeHits: before.expectedHits,
    beforeBadges: before.badgeSteps,
    changedBinding: changed.bindingMode,
    restoredBinding: restored.bindingMode,
    restoredHits,
    restoredBadges,
  };
}

async function proofSynthNoteRangeSequencePresetRoundTrip(page, engineMode) {
  const presetName = `__sequencer_audit_${engineMode}_synth_note_range`;
  const savedPitchState = {
    steps: 6,
    direction: '\u2194',
    mode: 'noteRange',
    noteMin: 48,
    noteMax: 67,
    bindingMode: 'polyrhythmic',
  };
  const changedPitchState = {
    steps: 5,
    direction: '\u2192',
    mode: 'noteRange',
    noteMin: 72,
    noteMax: 84,
    bindingMode: 'polyrhythmic',
  };

  await setPitchSubLaneState(page, engineMode, 'synth', savedPitchState);
  const saved = await readPitchSubLaneEditorState(page);
  assertPitchSubLaneState(saved, savedPitchState, `${engineMode}/synth: pre-save noteRange pitch state`);
  await saveActiveSequencePreset(page, presetName);

  await setPitchSubLaneState(page, engineMode, 'synth', changedPitchState);
  assertPitchSubLaneState(await readPitchSubLaneEditorState(page), changedPitchState, `${engineMode}/synth: changed noteRange pitch state`);
  await loadActiveSequencePreset(page, presetName);
  const restored = await readPitchSubLaneEditorState(page);
  assertPitchSubLaneState(restored, savedPitchState, `${engineMode}/synth: loaded noteRange sequence preset`);

  return {
    presetName,
    saved: {
      noteMinLabel: saved.noteMinLabel,
      noteMaxLabel: saved.noteMaxLabel,
    },
    changed: {
      noteMin: changedPitchState.noteMin,
      noteMax: changedPitchState.noteMax,
    },
    restored: {
      noteMinLabel: restored.noteMinLabel,
      noteMaxLabel: restored.noteMaxLabel,
      mode: restored.mode,
    },
  };
}

async function proofSequencePresetStepValueRoundTrip(page, engineMode, tab) {
  const presetName = `__sequencer_audit_${engineMode}_${tab}_step_values`;
  const pitchState = {
    steps: 4,
    direction: '\u2192',
    mode: 'semitones',
    root: 60,
    scale: 'Major',
    scaleQuantize: false,
    ...(tab === 'synth' ? { bindingMode: 'polyrhythmic' } : {}),
  };
  const expressionState = {
    steps: 4,
    direction: '\u2192',
    mode: 'sequence',
  };
  const rangeStepValueStates = {
    expression: expressionState,
    morph: {
      steps: 4,
      direction: '\u2192',
      mode: 'sequence',
    },
    distance: {
      steps: 4,
      direction: '\u2192',
      mode: 'sequence',
    },
  };
  const savedRangeMoves = {
    expression: [{ step: 0, direction: -1, times: 1 }, { step: 1, direction: -1, times: 2 }],
    morph: [{ step: 0, direction: 1, times: 1 }, { step: 1, direction: 1, times: 2 }],
    distance: [{ step: 0, direction: -1, times: 1 }, { step: 1, direction: 1, times: 2 }],
  };
  const changedRangeMoves = {
    expression: [{ step: 0, direction: 1, times: 1 }, { step: 1, direction: 1, times: 1 }],
    morph: [{ step: 0, direction: -1, times: 1 }, { step: 1, direction: -1, times: 1 }],
    distance: [{ step: 0, direction: 1, times: 2 }, { step: 1, direction: -1, times: 1 }],
  };

  await setPitchSubLaneState(page, engineMode, tab, pitchState);
  await setSelectedEditorStep(page, 0, engineMode, tab, 'pitch value');
  await nudgeSelectedEditorValue(page, 1, 1);
  await setSelectedEditorStep(page, 1, engineMode, tab, 'pitch value');
  await nudgeSelectedEditorValue(page, 1, 2);
  const savedPitchSignature = await editorStepValueOnlySignature(page);

  const savedRangeSignatures = {};
  for (const [lane, state] of Object.entries(rangeStepValueStates)) {
    savedRangeSignatures[lane] = await writeRangeSubLaneStepValues(page, engineMode, tab, lane, state, savedRangeMoves[lane]);
  }
  const savedExpressionSignature = savedRangeSignatures.expression;
  const triggerStepIndex = 1;
  await setTriggerProbabilityPercent(page, triggerStepIndex, 80, engineMode, tab);
  await setTriggerConditionToText(page, triggerStepIndex, '1:2', engineMode, tab);
  const savedTriggerStep = {
    stepIndex: triggerStepIndex,
    probability: await triggerProbabilityPercent(page, triggerStepIndex),
    trigCondition: await triggerConditionText(page, triggerStepIndex),
  };
  await setExpressionSequenceState(page, expressionState);
  await setExpressionRatchetLineCount(page, triggerStepIndex, 2, engineMode, tab);
  const savedExpressionRatchet = await ratchetLineCount(page, triggerStepIndex);

  await saveActiveSequencePreset(page, presetName);

  await setTriggerProbabilityPercent(page, triggerStepIndex, 60, engineMode, tab);
  await setTriggerConditionToText(page, triggerStepIndex, '1:1', engineMode, tab);
  const changedTriggerStep = {
    stepIndex: triggerStepIndex,
    probability: await triggerProbabilityPercent(page, triggerStepIndex),
    trigCondition: await triggerConditionText(page, triggerStepIndex),
  };
  assert(
    changedTriggerStep.probability !== savedTriggerStep.probability &&
      changedTriggerStep.trigCondition !== savedTriggerStep.trigCondition,
    `${engineMode}/${tab}: trigger step fields did not dirty before sequence preset reload`,
  );

  await setPitchSubLaneState(page, engineMode, tab, pitchState);
  await setSelectedEditorStep(page, 0, engineMode, tab, 'changed pitch value');
  await nudgeSelectedEditorValue(page, -1, 1);
  await setSelectedEditorStep(page, 1, engineMode, tab, 'changed pitch value');
  await nudgeSelectedEditorValue(page, -1, 1);
  const changedPitchSignature = await editorStepValueOnlySignature(page);
  assert(changedPitchSignature !== savedPitchSignature, `${engineMode}/${tab}: pitch step values did not dirty before sequence preset reload`);

  const changedRangeSignatures = {};
  for (const [lane, state] of Object.entries(rangeStepValueStates)) {
    changedRangeSignatures[lane] = await writeRangeSubLaneStepValues(page, engineMode, tab, lane, state, changedRangeMoves[lane]);
    assert(
      changedRangeSignatures[lane] !== savedRangeSignatures[lane],
      `${engineMode}/${tab}: ${lane} step values did not dirty before sequence preset reload`,
    );
  }
  const changedExpressionSignature = changedRangeSignatures.expression;
  await setExpressionSequenceState(page, expressionState);
  await setExpressionRatchetLineCount(page, triggerStepIndex, 3, engineMode, tab);
  const changedExpressionRatchet = await ratchetLineCount(page, triggerStepIndex);
  assert(
    changedExpressionRatchet !== savedExpressionRatchet,
    `${engineMode}/${tab}: expression ratchet did not dirty before sequence preset reload`,
  );

  await loadActiveSequencePreset(page, presetName);
  const restoredTriggerStep = {
    stepIndex: triggerStepIndex,
    probability: await triggerProbabilityPercent(page, triggerStepIndex),
    trigCondition: await triggerConditionText(page, triggerStepIndex),
  };
  assert(
    restoredTriggerStep.probability === savedTriggerStep.probability &&
      restoredTriggerStep.trigCondition === savedTriggerStep.trigCondition,
    `${engineMode}/${tab}: sequence preset did not restore trigger probability/trig condition (${JSON.stringify(savedTriggerStep)} -> ${JSON.stringify(changedTriggerStep)} -> ${JSON.stringify(restoredTriggerStep)})`,
  );
  await ensurePitchSparklineEnabled(page);
  const restoredPitchSignature = await editorStepValueOnlySignature(page);
  assert(
    restoredPitchSignature === savedPitchSignature,
      `${engineMode}/${tab}: sequence preset did not restore pitch step values`,
  );
  const restoredRangeSignatures = {};
  for (const lane of Object.keys(rangeStepValueStates)) {
    await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX[lane]);
    restoredRangeSignatures[lane] = await editorStepValueOnlySignature(page);
    assert(
      restoredRangeSignatures[lane] === savedRangeSignatures[lane],
      `${engineMode}/${tab}: sequence preset did not restore ${lane} step values`,
    );
  }
  const restoredExpressionSignature = restoredRangeSignatures.expression;
  await ensureSparklineEnabled(page, RANGE_SUB_LANE_SPARK_INDEX.expression);
  const restoredExpressionRatchet = await ratchetLineCount(page, triggerStepIndex);
  assert(
    restoredExpressionRatchet === savedExpressionRatchet,
    `${engineMode}/${tab}: sequence preset did not restore expression ratchet (${savedExpressionRatchet} -> ${changedExpressionRatchet} -> ${restoredExpressionRatchet})`,
  );

  return {
    presetName,
    savedTriggerStep,
    changedTriggerStep,
    restoredTriggerStep,
    savedPitchSignature,
    changedPitchSignature,
    restoredPitchSignature,
    savedExpressionSignature,
    changedExpressionSignature,
    restoredExpressionSignature,
    savedExpressionRatchet,
    changedExpressionRatchet,
    restoredExpressionRatchet,
    savedRangeSignatures,
    changedRangeSignatures,
    restoredRangeSignatures,
  };
}

async function proofRangeSubLaneKeyboardControls(page, engineMode, tab) {
  const results = {};
  const lanes = [
    { lane: 'expression', preferredDirection: -1 },
    { lane: 'morph', preferredDirection: 1 },
    { lane: 'distance', preferredDirection: 1 },
  ];
  for (const { lane, preferredDirection } of lanes) {
    const sparkIndex = RANGE_SUB_LANE_SPARK_INDEX[lane];
    await pressLeftShiftChord(page, 'ArrowDown');
    const strip = page.locator('.seq-spark-strip').nth(sparkIndex);
    const stripClass = String(await strip.getAttribute('class'));
    assert(stripClass.includes('expanded'), `${engineMode}/${tab}: Shift+ArrowDown did not open ${lane} lane`);
    if (await readSubLaneEnabled(page, sparkIndex) === false) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
    }
    assert(await readSubLaneEnabled(page, sparkIndex), `${engineMode}/${tab}: Tab did not enable ${lane} keyboard lane`);
    await setRangeSubLaneValueMode(page, 'sequence');

    const steps = await editorSteps(page);
    const selectedX = await selectedSparkX(page, sparkIndex);
    assert(selectedX != null, `${engineMode}/${tab}: ${lane} lane did not show keyboard cursor`);
    const initialStep = await selectedEditorStep(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const movedStep = await selectedEditorStep(page);
    assert(
      movedStep === (initialStep + 1) % steps,
      `${engineMode}/${tab}: ArrowRight did not move ${lane} cursor (${initialStep} -> ${movedStep}, steps ${steps})`,
    );
    const valueMutation = await nudgeSelectedEditorValueUntilChanged(page, preferredDirection);
    results[lane] = {
      steps,
      movedStep,
      valueDirection: valueMutation.direction,
      beforeValueSignature: valueMutation.before,
      afterValueSignature: valueMutation.after,
    };
  }
  return results;
}

async function proofDrumKeyboard(page, engineMode) {
  await ensureTriggerKeyboardLane(page, engineMode, 'drums');
  const initialTrigger = await selectedTriggerStep(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const movedTrigger = await selectedTriggerStep(page);
  assert(movedTrigger === (initialTrigger + 1) % 16, `${engineMode}/drums: ArrowRight did not move trigger cursor (${initialTrigger} -> ${movedTrigger})`);

  const beforeToggle = await triggerStepActive(page, movedTrigger);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(250);
  const afterToggle = await triggerStepActive(page, movedTrigger);
  assert(afterToggle !== beforeToggle, `${engineMode}/drums: KeyX did not toggle selected trigger step ${movedTrigger}`);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(250);
  assert(
    await triggerStepActive(page, movedTrigger) === beforeToggle,
    `${engineMode}/drums: second KeyX did not restore selected trigger step ${movedTrigger}`,
  );
  const triggerStepControls = await proofTriggerStepControls(page, engineMode, 'drums', movedTrigger);

  await pressLeftShiftChord(page, 'ArrowDown');
  const pitchStripClass = String(await page.locator('.seq-spark-strip').nth(0).getAttribute('class'));
  assert(pitchStripClass.includes('expanded'), `${engineMode}/drums: Shift+ArrowDown did not open pitch lane`);
  const pitchSelectedX = await selectedSparkX(page, 0);
  assert(pitchSelectedX != null, `${engineMode}/drums: pitch lane did not show keyboard cursor`);

  const initialPitch = await selectedEditorStep(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const movedPitch = await selectedEditorStep(page);
  assert(movedPitch === (initialPitch + 1) % 5, `${engineMode}/drums: ArrowRight did not move pitch cursor (${initialPitch} -> ${movedPitch})`);
  const rangeSubLaneKeyboardControls = await proofRangeSubLaneKeyboardControls(page, engineMode, 'drums');
  return { movedTrigger, movedPitch, triggerStepControls, rangeSubLaneKeyboardControls };
}

async function proofSynthKeyboard(page, engineMode) {
  const keyboardToggle = page.locator('.synth-keyboard-toggle').first();
  await keyboardToggle.waitFor({ timeout: 10000 });
  if (!String(await keyboardToggle.getAttribute('class')).includes('active')) {
    await keyboardToggle.click({ timeout: 5000 });
    await page.waitForTimeout(350);
  }
  const sequenceButton = page.locator('.synth-keyboard-mode-btn').filter({ hasText: /^Sequence$/ }).first();
  await sequenceButton.waitFor({ timeout: 10000 });
  if (!String(await sequenceButton.getAttribute('class')).includes('active')) {
    await sequenceButton.click({ timeout: 5000 });
    await page.waitForTimeout(500);
  }

  await ensureTriggerKeyboardLane(page, engineMode, 'synth');
  const initialTrigger = await selectedTriggerStep(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const movedTrigger = await selectedTriggerStep(page);
  assert(movedTrigger === (initialTrigger + 1) % 16, `${engineMode}/synth: ArrowRight did not move trigger cursor (${initialTrigger} -> ${movedTrigger})`);

  const beforeToggle = await triggerStepActive(page, movedTrigger);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(250);
  const afterToggle = await triggerStepActive(page, movedTrigger);
  assert(afterToggle !== beforeToggle, `${engineMode}/synth: KeyX did not toggle selected trigger step ${movedTrigger}`);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(250);
  assert(
    await triggerStepActive(page, movedTrigger) === beforeToggle,
    `${engineMode}/synth: second KeyX did not restore selected trigger step ${movedTrigger}`,
  );
  const triggerStepControls = await proofTriggerStepControls(page, engineMode, 'synth', movedTrigger);

  await pressLeftShiftChord(page, 'ArrowDown');
  const pitchStripClass = String(await page.locator('.seq-spark-strip').nth(0).getAttribute('class'));
  assert(pitchStripClass.includes('expanded'), `${engineMode}/synth: Shift+ArrowDown did not open pitch lane`);
  const pitchSelectedX = await selectedSparkX(page, 0);
  assert(pitchSelectedX != null, `${engineMode}/synth: pitch lane did not show keyboard cursor`);

  const initialPitch = await selectedEditorStep(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const movedPitch = await selectedEditorStep(page);
  assert(movedPitch === (initialPitch + 1) % 16, `${engineMode}/synth: ArrowRight did not move pitch cursor (${initialPitch} -> ${movedPitch})`);

  await page.keyboard.press('KeyA');
  await page.waitForTimeout(300);
  const afterNoteWrite = await selectedEditorStep(page);
  assert(afterNoteWrite === (movedPitch + 1) % 16, `${engineMode}/synth: typing a note did not write and advance pitch cursor (${movedPitch} -> ${afterNoteWrite})`);
  const rangeSubLaneKeyboardControls = await proofRangeSubLaneKeyboardControls(page, engineMode, 'synth');
  return { movedTrigger, movedPitch, afterNoteWrite, triggerStepControls, rangeSubLaneKeyboardControls };
}

async function proofSynthKeyboardHarmonyContext(page, engineMode, phase) {
  const metas = await page.locator('.synth-keyboard-meta').evaluateAll((nodes) =>
    nodes.map((node) => String(node.textContent ?? '').trim()).filter(Boolean)
  );
  const harmonyMeta = metas.find((text) => text.startsWith('Harmony:')) ?? '';
  assert(harmonyMeta, `${engineMode}/synth: ${phase} keyboard did not use harmony context (${metas.join(' | ')})`);
  const classifiedKeys = await page.locator('.synth-keyboard-key.harmony-root, .synth-keyboard-key.harmony-chord, .synth-keyboard-key.harmony-scale').count();
  assert(classifiedKeys > 0, `${engineMode}/synth: ${phase} keyboard did not classify any harmony keys`);
  return { harmonyMeta, classifiedKeys };
}

async function proofKeyboardOnlyTransportStartStop(page, engineMode, tab) {
  const transportName = tab === 'drums' ? 'drums' : 'synth';
  const transport = page.locator(`.seq-play-btn[data-sequencer-transport="${transportName}"]`).first();
  await transport.waitFor({ timeout: 15000 });
  if ((await transport.textContent())?.trim() === '\u25a0') {
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
  }
  assert((await transport.textContent())?.trim() === '\u25b6', `${engineMode}/${tab}: keyboard transport proof did not start from stopped state`);
  await setLaneTimingEditorState(page, { clockDiv: '1/16', swing: 0 });

  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  const startedGlyph = (await transport.textContent())?.trim();
  assert(startedGlyph === '\u25a0', `${engineMode}/${tab}: keyboard-only Space did not start transport`);
  const cadenceAttempts = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cadence = await sampleTriggerPlayheadCadence(page, 1600, 90);
    cadenceAttempts.push(cadence);
    if (triggerCadenceMoved(cadence)) break;
    await page.waitForTimeout(500);
  }
  const cadence = cadenceAttempts[cadenceAttempts.length - 1];
  assert(
    triggerCadenceMoved(cadence),
    `${engineMode}/${tab}: keyboard-only transport start did not move trigger playhead (${cadenceAttempts.map((entry) => entry.samples.join(' | ')).join(' || ')})`,
  );

  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const stoppedGlyph = (await transport.textContent())?.trim();
  assert(stoppedGlyph === '\u25b6', `${engineMode}/${tab}: keyboard-only Space did not stop transport`);
  return {
    clockDiv: '1/16',
    startedGlyph,
    stoppedGlyph,
    movementObserved: true,
  };
}

async function proofRuntime(browser, baseUrl, engineMode, tab) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !ignoredConsoleError(text)) {
      consoleErrors.push(text.slice(0, 300));
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300));
  });

  try {
    await page.goto(withEngine(baseUrl, engineMode), {
      timeout: 45000,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('.app-tab-bar', { timeout: 45000 });
    await page.waitForTimeout(800);

    await page
      .locator('.app-tab-bar button')
      .filter({ hasText: tab === 'drums' ? 'Drums' : 'Synth' })
      .first()
      .click({ timeout: 10000 });
    await page.waitForTimeout(900);

	    await ensureSequencerDetailMode(page, engineMode, tab);
	    await page.waitForTimeout(600);
	
	    const keyboardTransport = await proofKeyboardOnlyTransportStartStop(page, engineMode, tab);
	    const visibleSubLaneCoverage = await proofVisibleSubLaneCoverage(page, engineMode, tab);
	    const keyboardControls = tab === 'drums'
	      ? await proofDrumKeyboard(page, engineMode)
      : await proofSynthKeyboard(page, engineMode);
    const initialSynthKeyboardHarmonyContext = tab === 'synth'
      ? await proofSynthKeyboardHarmonyContext(page, engineMode, 'stopped')
      : null;

    const euclideanPatternControls = await proofEuclideanTriggerPatternControls(page, engineMode, tab);
    const linkedHitCountBadge = await proofLinkedHitCountBadgeTracksHits(page, engineMode, tab);
    const linkedTriggerToggleBadge = await proofLinkedHitCountBadgeTracksTriggerToggle(page, engineMode, tab);
    const linkedSequencePresetRoundTrip = await proofLinkedSequencePresetRoundTrip(page, engineMode, tab);
    const synthNoteRangeSequencePresetRoundTrip = tab === 'synth'
      ? await proofSynthNoteRangeSequencePresetRoundTrip(page, engineMode)
      : null;
    const expressionRatchetControl = await proofExpressionRatchetControl(page, engineMode, tab);
    const sequencePresetRoundTrip = await proofSequencePresetRoundTrip(page, engineMode, tab);
    const sequencePresetStepValueRoundTrip = await proofSequencePresetStepValueRoundTrip(page, engineMode, tab);
    const evolveDiceMutation = await proofEvolveDiceMutatesState(page, engineMode, tab);

    const evolveFeedback = [];
    evolveFeedback.push(await captureEvolveFlash(page, engineMode, tab, 'stopped'));
    evolveFeedback.push(await exerciseEvolveReset(page, engineMode, tab, 'stopped'));

    const transportName = tab === 'drums' ? 'drums' : 'synth';
    const transport = page.locator(`.seq-play-btn[data-sequencer-transport="${transportName}"]`).first();
    await transport.waitFor({ timeout: 15000 });
    if ((await transport.textContent())?.trim() !== '\u25a0') {
      await transport.click({ timeout: 10000 });
    }
    await page.waitForTimeout(1000);
    assert((await transport.textContent())?.trim() === '\u25a0', `${engineMode}/${tab}: click did not start transport`);
    const synthKeyboardHarmonyContext = tab === 'synth'
      ? await proofSynthKeyboardHarmonyContext(page, engineMode, 'running')
      : null;

    evolveFeedback.push(await captureEvolveFlash(page, engineMode, tab, 'running'));
    evolveFeedback.push(await exerciseEvolveReset(page, engineMode, tab, 'running'));

    const clockDivisionTiming = await proofClockDivisionAffectsTriggerCadence(page, engineMode, tab);
    await prepareSubLaneCursorAnimationProof(page, engineMode, tab);
    if (tab === 'drums') await ensureDrumLinkedBadges(page, engineMode);
    else await ensureSynthLinkedPitchBadge(page, engineMode);
    await ensureAuditedSubLaneSparklinesEnabled(page);

    const triggerSamples = [];
    const subLaneSparkSamples = [];
    for (let index = 0; index < 12; index += 1) {
      await page.waitForTimeout(375);
      triggerSamples.push((await activeTriggerCells(page)).join(','));
      subLaneSparkSamples.push(await sampleSubLanePlayheads(page));
    }

	    const triggerMovement = new Set(triggerSamples.filter(Boolean));
	    assert(triggerMovement.size > 1, `${engineMode}/${tab}: trigger playhead did not move (${triggerSamples.join(' | ')})`);
	    assertSubLanePlayheadMovement(subLaneSparkSamples, engineMode, tab);
	
	    await page.keyboard.press('Space');
	    await page.waitForTimeout(600);
	    assert((await transport.textContent())?.trim() === '\u25b6', `${engineMode}/${tab}: Space did not stop transport`);
	    const stoppedPlayheadSamples = await sampleSequencerPlayheads(page);
	    const stoppedPlayheadFreeze = assertStoppedPlayheadsFrozen(stoppedPlayheadSamples, engineMode, tab);
	
	    await page.keyboard.press('Space');
	    await page.waitForTimeout(800);
	    assert((await transport.textContent())?.trim() === '\u25a0', `${engineMode}/${tab}: Space did not restart transport`);
	    assert(consoleErrors.length === 0, `${engineMode}/${tab}: console errors: ${consoleErrors.join(' | ')}`);

    return {
      engineMode,
      tab,
      status: 'pass',
      triggerSamples,
      sparkSamples: subLaneSparkSamples.map((sample) => sample.expression),
	      subLaneSparkSamples,
	      keyboardTransport,
	      keyboardControls,
      expressionRatchetControl,
      visibleSubLaneCoverage,
      clockDivisionTiming,
      evolveDiceMutation,
      evolveFeedback,
      euclideanPatternControls,
      linkedHitCountBadge,
      linkedTriggerToggleBadge,
	      linkedSequencePresetRoundTrip,
	      synthNoteRangeSequencePresetRoundTrip,
	      initialSynthKeyboardHarmonyContext,
	      synthKeyboardHarmonyContext,
	      stoppedPlayheadFreeze,
	      sequencePresetRoundTrip,
	      sequencePresetStepValueRoundTrip,
	    };
  } catch (error) {
    if (consoleErrors.length > 0) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}; console/page errors: ${consoleErrors.join(' | ')}`);
    }
    throw error;
  } finally {
    await page.close();
  }
}

function writeReport(report, path = reportPath) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

function stripReportRunNames(value) {
  if (Array.isArray(value)) return value.map(stripReportRunNames);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['presetName', 'savedName', 'changedName'].includes(key))
      .map(([key, entry]) => [key, stripReportRunNames(entry)]),
  );
}

function assertParityValueEqual(productValue, webValue, context) {
  const productJson = JSON.stringify(stripReportRunNames(productValue));
  const webJson = JSON.stringify(stripReportRunNames(webValue));
  assert(productJson === webJson, `${context} mismatch: Product ${productJson} vs web-ts ${webJson}`);
}

function assertSequencerDeterministicControlParity(results) {
  const stableKeys = [
	    'visibleSubLaneCoverage',
	    'keyboardTransport',
	    'keyboardControls',
    'expressionRatchetControl',
    'euclideanPatternControls',
    'linkedHitCountBadge',
    'linkedTriggerToggleBadge',
	    'linkedSequencePresetRoundTrip',
	    'synthNoteRangeSequencePresetRoundTrip',
	    'stoppedPlayheadFreeze',
	    'sequencePresetRoundTrip',
	    'sequencePresetStepValueRoundTrip',
	  ];

  for (const tab of ['drums', 'synth']) {
    const product = results.find((result) => result.engineMode === 'core-product' && result.tab === tab);
    const web = results.find((result) => result.engineMode === 'web-ts' && result.tab === tab);
    if (!product || !web) continue;

    for (const key of stableKeys) {
      assertParityValueEqual(product[key], web[key], `${tab} ${key}`);
    }

    assertParityValueEqual(
      {
        slowClock: product.clockDivisionTiming?.slowClock,
        fastClock: product.clockDivisionTiming?.fastClock,
        restoredTiming: product.clockDivisionTiming?.restoredTiming,
      },
      {
        slowClock: web.clockDivisionTiming?.slowClock,
        fastClock: web.clockDivisionTiming?.fastClock,
        restoredTiming: web.clockDivisionTiming?.restoredTiming,
      },
      `${tab} clock-division controls`,
    );
  }
}

function assertSynthHarmonyContextParity(results) {
  const synthCases = new Map(results.filter((result) => result.tab === 'synth').map((result) => [result.engineMode, result]));
  const product = synthCases.get('core-product');
  const web = synthCases.get('web-ts');
  if (!product || !web) return;

  for (const key of ['initialSynthKeyboardHarmonyContext', 'synthKeyboardHarmonyContext']) {
    assert(product[key], `synth harmony parity missing Product ${key}`);
    assert(web[key], `synth harmony parity missing web-ts ${key}`);
  }

  const keys = ['initialSynthKeyboardHarmonyContext', 'synthKeyboardHarmonyContext'];
  const harmonyRoot = (meta) => String(meta).match(/^Harmony:\s+([A-G]#?)/)?.[1] ?? '';
  const productRoots = keys.map((key) => harmonyRoot(product[key].harmonyMeta)).sort();
  const webRoots = keys.map((key) => harmonyRoot(web[key].harmonyMeta)).sort();
  assert(
    productRoots.join('|') === webRoots.join('|'),
    `synth harmony root set mismatch: Product ${productRoots.join(' | ')} vs web-ts ${webRoots.join(' | ')}`,
  );
}

const args = parseArgs(process.argv.slice(2));
let sharedVite = null;
let browser = null;
const results = [];
try {
  sharedVite = args.url ? null : await startSharedVite(args.port);
  const baseUrl = args.url || sharedVite?.url || '';
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const engineModes = args.engine ? [args.engine] : ['core-product', 'web-ts'];
  const tabs = args.tab ? [args.tab] : ['drums', 'synth'];
  const totalCases = engineModes.length * tabs.length;
  const selectedRun = totalCases !== 4;
  const activeReportPath = selectedRun ? selectedReportPath : reportPath;
  for (const engineMode of engineModes) {
    for (const tab of tabs) {
      process.stderr.write(`[${results.length + 1}/${totalCases}] ${engineMode}/${tab}\n`);
      const result = await proofRuntime(browser, baseUrl, engineMode, tab);
      results.push(result);
      process.stderr.write(`[${results.length}/${totalCases}] ${engineMode}/${tab}: pass\n`);
    }
  }
  assertSequencerDeterministicControlParity(results);
  assertSynthHarmonyContextParity(results);
  const report = {
    schema: 'kessho-product-sequencer-ui-parity-v1',
    generatedAt: new Date().toISOString(),
    status: 'pass',
    baseUrl,
    cases: results,
  };
  writeReport(report, activeReportPath);
  console.log(`Kessho Product/Web sequencer UI parity passed (${results.length} cases, report: ${activeReportPath})`);
} catch (error) {
  const engineModes = args.engine ? [args.engine] : ['core-product', 'web-ts'];
  const tabs = args.tab ? [args.tab] : ['drums', 'synth'];
  const activeReportPath = engineModes.length * tabs.length !== 4 ? selectedReportPath : reportPath;
  const report = {
    schema: 'kessho-product-sequencer-ui-parity-v1',
    generatedAt: new Date().toISOString(),
    status: 'fail',
    blocker: [error instanceof Error ? error.message : String(error)],
    cases: results,
  };
  writeReport(report, activeReportPath);
  throw error;
} finally {
  if (browser) await browser.close();
  if (sharedVite) await sharedVite.stop();
}
