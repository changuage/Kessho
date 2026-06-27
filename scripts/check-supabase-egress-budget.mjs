#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4195;
const DEFAULT_WAIT_MS = 10_000;
const DEFAULT_FRESH_BUDGET_BYTES = 250 * 1024;
const DEFAULT_DETAIL_BUDGET_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const args = {
    url: '',
    port: DEFAULT_PORT,
    waitMs: DEFAULT_WAIT_MS,
    idleMs: 0,
    freshBudgetBytes: DEFAULT_FRESH_BUDGET_BYTES,
    detailBudgetBytes: DEFAULT_DETAIL_BUDGET_BYTES,
    openPresets: false,
    openJourney: false,
    loadFirstPreset: false,
    presetSelector: '',
    journeySelector: '',
    loadPresetSelector: '',
    reloadCount: 0,
    requireSupabaseCalls: false,
    failSupabaseErrors: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--wait-ms=')) args.waitMs = Number(arg.slice('--wait-ms='.length));
    else if (arg.startsWith('--idle-ms=')) args.idleMs = Number(arg.slice('--idle-ms='.length));
    else if (arg.startsWith('--fresh-budget-kb=')) args.freshBudgetBytes = Number(arg.slice('--fresh-budget-kb='.length)) * 1024;
    else if (arg.startsWith('--detail-budget-kb=')) args.detailBudgetBytes = Number(arg.slice('--detail-budget-kb='.length)) * 1024;
    else if (arg === '--open-presets') args.openPresets = true;
    else if (arg === '--open-journey') args.openJourney = true;
    else if (arg === '--load-first-preset') args.loadFirstPreset = true;
    else if (arg.startsWith('--preset-selector=')) args.presetSelector = arg.slice('--preset-selector='.length);
    else if (arg.startsWith('--journey-selector=')) args.journeySelector = arg.slice('--journey-selector='.length);
    else if (arg.startsWith('--load-preset-selector=')) args.loadPresetSelector = arg.slice('--load-preset-selector='.length);
    else if (arg.startsWith('--reload-count=')) args.reloadCount = Number(arg.slice('--reload-count='.length));
    else if (arg === '--require-supabase-calls') args.requireSupabaseCalls = true;
    else if (arg === '--fail-supabase-errors') args.failSupabaseErrors = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/check-supabase-egress-budget.mjs [options]',
        '',
        'Options:',
        '  --url=http://127.0.0.1:5173/   Use an already-running app instead of starting Vite dev.',
        '  --port=4195                    Port for the temporary Vite dev server.',
        '  --wait-ms=10000                Wait per scenario after navigation/click.',
        '  --idle-ms=600000               Add an idle scenario after fresh load.',
        '  --fresh-budget-kb=250          Fresh-load Supabase response budget.',
        '  --detail-budget-kb=1024        Intentional single-preset load response budget.',
        '  --open-presets                 Click the main preset panel and measure it.',
        '  --open-journey                 Click preset panel, switch to Journey tab, and measure it.',
        '  --load-first-preset            After opening presets, load the first visible preset and measure detail reads.',
        '  --preset-selector=CSS          CSS selector for the preset panel control.',
        '  --journey-selector=CSS         CSS selector for the journey tab/control.',
        '  --load-preset-selector=CSS     CSS selector for the preset load control.',
        '  --reload-count=20              Measure average Supabase bytes across reloads. With --load-first-preset, reload and load the first preset each time.',
        '  --require-supabase-calls       Fail if no Supabase responses are observed.',
        '  --fail-supabase-errors         Fail if any Supabase response has HTTP status >= 400.',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  for (const [name, value] of Object.entries({
    port: args.port,
    waitMs: args.waitMs,
    idleMs: args.idleMs,
    freshBudgetBytes: args.freshBudgetBytes,
    detailBudgetBytes: args.detailBudgetBytes,
    reloadCount: args.reloadCount,
  })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  }

  return args;
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function getEnv() {
  return {
    ...readEnvFile(resolve(root, '.env')),
    ...readEnvFile(resolve(root, '.env.local')),
    ...process.env,
  };
}

function getSupabaseOrigin(env) {
  const raw = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isSupabaseUrl(url, supabaseOrigin) {
  if (supabaseOrigin && url.startsWith(`${supabaseOrigin}/`)) return true;
  return /^https:\/\/[^/]+\.supabase\.co\//.test(url);
}

function classifyService(url) {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  if (path.includes('/rest/v1/')) return 'rest';
  if (path.includes('/auth/v1/')) return 'auth';
  if (path.includes('/storage/v1/')) return 'storage';
  if (path.includes('/functions/v1/')) return 'functions';
  if (path.includes('/realtime/v1/')) return 'realtime';
  return 'other';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function summarizeCalls(calls) {
  const serviceBytes = new Map();
  let totalBytes = 0;
  for (const call of calls) {
    totalBytes += call.bytes;
    serviceBytes.set(call.service, (serviceBytes.get(call.service) ?? 0) + call.bytes);
  }
  return {
    calls: calls.length,
    totalBytes,
    serviceBytes: Object.fromEntries([...serviceBytes.entries()].sort()),
    largest: [...calls].sort((left, right) => right.bytes - left.bytes)[0] ?? null,
  };
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

async function startDevServer(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  try {
    await waitForHttp(url, 120_000, () => output);
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    url,
    stop: async () => {
      child.kill();
      await delay(250);
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
    throw new Error(`Playwright is required for Supabase egress budget checks: ${detail}`);
  }
}

async function collectResponseBytes(response) {
  const length = Number(response.headers()['content-length'] ?? 0);
  if (Number.isFinite(length) && length > 0) return length;
  try {
    return (await response.body()).length;
  } catch {
    return 0;
  }
}

async function clickButtonByTitleOrText(page, label, selector = '') {
  if (selector) {
    await page.locator(selector).first().click({ timeout: 5000 });
    return true;
  }

  const candidates = [
    page.locator(`button[title="${label}"]`).first(),
    page.locator(`button[aria-label="${label}"]`).first(),
    page.getByRole('button', { name: label }).first(),
    page.getByText(label, { exact: true }).first(),
  ];
  for (const candidate of candidates) {
    try {
      await candidate.click({ timeout: 1500 });
      return true;
    } catch {
      // Try the next locator shape.
    }
  }

  return page.evaluate((targetLabel) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((candidate) => (
      candidate.getAttribute('title') === targetLabel
      || candidate.getAttribute('aria-label') === targetLabel
      || candidate.textContent?.trim() === targetLabel
    ));
    if (!button) return false;
    button.click();
    return true;
  }, label);
}

async function clickFirstPresetLoadButton(page, selector = '') {
  if (selector) {
    await page.locator(selector).first().click({ timeout: 5000 });
    return true;
  }

  const clickVisibleLoadButton = () => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const isVisible = (candidate) => {
      const style = window.getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      return (
        style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
      );
    };
    const isLoadButton = (candidate) => {
      const labels = [
        candidate.textContent ?? '',
        candidate.getAttribute('title') ?? '',
        candidate.getAttribute('aria-label') ?? '',
      ];
      return labels.some((label) => /^Load(?:\s|$)/i.test(label.trim()));
    };
    const button = buttons.find((candidate) => isVisible(candidate) && isLoadButton(candidate));
    if (!button) return false;
    button.click();
    return true;
  };

  try {
    await page.waitForFunction(clickVisibleLoadButton, null, { timeout: 15_000 });
    return true;
  } catch {
    // Fall through to role-based locators for older Playwright/browser combinations.
  }

  const candidates = [
    page.getByRole('button', { name: /^Load$/ }).first(),
    page.getByRole('button', { name: /^Load\s+/ }).first(),
    page.locator('button[title="Load"]').first(),
    page.locator('button[title^="Load "]').first(),
    page.locator('button[aria-label="Load"]').first(),
    page.locator('button[aria-label^="Load "]').first(),
    page.locator('button').filter({ hasText: /^Load$/ }).first(),
  ];

  for (const candidate of candidates) {
    try {
      await candidate.click({ timeout: 1500 });
      return true;
    } catch {
      // Try the next locator shape.
    }
  }

  return page.evaluate(clickVisibleLoadButton);
}

function assertNoForbiddenCalls(calls, scenarioId) {
  const selectStarCalls = calls.filter((call) => decodeURIComponent(call.url).includes('select=*'));
  const payloadListCalls = calls.filter((call) => (
    call.url.includes('/rest/v1/preset_payloads_v2')
    && !call.url.includes('hash=in.')
  ));
  if (selectStarCalls.length) {
    throw new Error(`${scenarioId}: found Supabase select=* call: ${selectStarCalls[0].url}`);
  }
  if (payloadListCalls.length) {
    throw new Error(`${scenarioId}: found direct preset_payloads_v2 list call: ${payloadListCalls[0].url}`);
  }
}

function assertNoSupabaseErrors(calls, scenarioId) {
  const errorCalls = calls.filter((call) => call.status >= 400);
  if (errorCalls.length > 0) {
    const call = errorCalls[0];
    throw new Error(`${scenarioId}: found Supabase HTTP ${call.status} response: ${call.url}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const env = getEnv();
const supabaseOrigin = getSupabaseOrigin(env);
let server = null;

try {
  server = args.url ? { url: args.url, stop: async () => {} } : await startDevServer(args.port);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('kessho:supabaseEgressDebug', '1');
  });
  const page = await context.newPage();
  const allCalls = [];
  const pendingByteTasks = new Set();

  page.on('response', async (response) => {
    const url = response.url();
    if (!isSupabaseUrl(url, supabaseOrigin)) return;
    const call = {
      url,
      status: response.status(),
      service: classifyService(url),
      bytes: 0,
    };
    allCalls.push(call);
    const byteTask = collectResponseBytes(response)
      .then((bytes) => {
        call.bytes = bytes;
      })
      .catch(() => {
        call.bytes = 0;
      })
      .finally(() => {
        pendingByteTasks.delete(byteTask);
      });
    pendingByteTasks.add(byteTask);
  });

  const scenarioSummaries = [];
  async function flushResponseBytes() {
    if (pendingByteTasks.size > 0) {
      await Promise.all([...pendingByteTasks]);
    }
  }

  async function runScenario(id, action) {
    const startIndex = allCalls.length;
    await action();
    await page.waitForTimeout(args.waitMs);
    await flushResponseBytes();
    const calls = allCalls.slice(startIndex);
    assertNoForbiddenCalls(calls, id);
    if (args.failSupabaseErrors) assertNoSupabaseErrors(calls, id);
    const summary = summarizeCalls(calls);
    scenarioSummaries.push({ id, ...summary });
    return { calls, summary };
  }

  async function openPresetLibrary() {
    const opened = await clickButtonByTitleOrText(page, 'Presets', args.presetSelector);
    if (!opened) throw new Error('Could not find the Presets button');
  }

  async function loadFirstPreset() {
    const loaded = await clickFirstPresetLoadButton(page, args.loadPresetSelector);
    if (!loaded) throw new Error('Could not find a preset Load button');
  }

  const fresh = await runScenario('fresh-load', async () => {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  });

  if (fresh.summary.totalBytes > args.freshBudgetBytes) {
    throw new Error(`fresh-load: ${formatBytes(fresh.summary.totalBytes)} exceeds budget ${formatBytes(args.freshBudgetBytes)}`);
  }

  if (args.openPresets || args.openJourney || args.loadFirstPreset) {
    await runScenario('open-preset-library', async () => {
      await openPresetLibrary();
    });
  }

  if (args.loadFirstPreset) {
    const detail = await runScenario('load-first-preset', async () => {
      await loadFirstPreset();
    });
    if (detail.summary.totalBytes > args.detailBudgetBytes) {
      throw new Error(`load-first-preset: ${formatBytes(detail.summary.totalBytes)} exceeds budget ${formatBytes(args.detailBudgetBytes)}`);
    }
  }

  if (args.openJourney) {
    await runScenario('open-journey-library', async () => {
      const opened = await clickButtonByTitleOrText(page, 'Journey', args.journeySelector);
      if (!opened) throw new Error('Could not find the Journey tab/button');
    });
  }

  if (args.idleMs > 0) {
    const idle = await runScenario('idle', async () => {
      await page.waitForTimeout(args.idleMs);
    });
    const idleRestCalls = idle.calls.filter((call) => call.service === 'rest');
    if (idleRestCalls.length > 0) {
      throw new Error(`idle: expected 0 REST calls, observed ${idleRestCalls.length}`);
    }
  }

  if (args.reloadCount > 0) {
    const startIndex = allCalls.length;
    for (let index = 0; index < args.reloadCount; index += 1) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (args.loadFirstPreset) {
        await openPresetLibrary();
        await loadFirstPreset();
      }
      await page.waitForTimeout(args.waitMs);
    }
    await flushResponseBytes();
    const calls = allCalls.slice(startIndex);
    const scenarioId = args.loadFirstPreset ? 'reload-load-first-preset-average' : 'reload-average';
    assertNoForbiddenCalls(calls, scenarioId);
    if (args.failSupabaseErrors) assertNoSupabaseErrors(calls, scenarioId);
    const summary = summarizeCalls(calls);
    const averageBytes = summary.totalBytes / args.reloadCount;
    scenarioSummaries.push({ id: scenarioId, ...summary, averageBytes });
    const budgetBytes = args.loadFirstPreset ? args.detailBudgetBytes : args.freshBudgetBytes;
    if (averageBytes > budgetBytes) {
      throw new Error(`${scenarioId}: ${formatBytes(averageBytes)} exceeds budget ${formatBytes(budgetBytes)}`);
    }
  }

  await browser.close();

  if (args.requireSupabaseCalls && allCalls.length === 0) {
    throw new Error('No Supabase responses were observed.');
  }

  console.log('Supabase egress budget passed.');
  for (const summary of scenarioSummaries) {
    const serviceSummary = Object.entries(summary.serviceBytes)
      .map(([service, bytes]) => `${service}=${formatBytes(bytes)}`)
      .join(', ');
    const average = summary.averageBytes == null ? '' : ` avg=${formatBytes(summary.averageBytes)}`;
    const largest = summary.largest ? ` largest=${formatBytes(summary.largest.bytes)} ${summary.largest.status} ${summary.largest.url}` : '';
    console.log(`- ${summary.id}: calls=${summary.calls} total=${formatBytes(summary.totalBytes)}${average}${serviceSummary ? ` (${serviceSummary})` : ''}${largest}`);
  }
} finally {
  if (server) await server.stop();
}
