#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4209;
const VIEWPORTS = Object.freeze([
  { width: 1440, height: 1200 },
  { width: 390, height: 844 },
]);

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-synth-play-controls-ui.mjs [--url=http://127.0.0.1:5173/] [--port=4209]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  return args;
}

function assert(condition, message, details = {}) {
  if (!condition) {
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
  }
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

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function viteReadyFromOutput(output, url) {
  return output.includes(url) && /\bLocal:\s+/.test(output);
}

async function startVite(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['node_modules/.bin/vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: { ...process.env, BROWSER: 'none', KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let exited = false;
  let resolveReadyOutput = null;
  const readyOutputPromise = new Promise((resolve) => {
    resolveReadyOutput = resolve;
  });
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-20000);
    if (viteReadyFromOutput(output, url)) resolveReadyOutput?.('ready-output');
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      exited = true;
      resolve(new Error(`Vite exited before Synth Play UI proof completed (code=${code ?? 'null'}, signal=${signal ?? 'null'}):\n${output}`));
    });
  });
  const ready = await Promise.race([
    readyOutputPromise,
    exitPromise,
    delay(45000).then(() => 'timeout'),
  ]);
  if (ready instanceof Error) throw ready;
  if (ready === 'timeout') {
    killProcessTree(child);
    throw new Error(`Timed out waiting for Vite to start ${url}:\n${output}`);
  }
  await waitForHttp(url, 15000, () => output);
  return {
    url,
    stop: async () => {
      if (!exited) killProcessTree(child);
      await delay(500);
      if (!exited) killProcessTree(child, 'SIGKILL');
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
    throw new Error(`Playwright is required for Synth Play UI proof but is not available: ${detail}`);
  }
}

function appUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('engine', 'core-product');
  url.searchParams.set('engineAB', '1');
  url.searchParams.set('localPresets', '1');
  url.searchParams.set('advanced', '1');
  return url.toString();
}

function ignoredConsoleError(text) {
  return text.includes('SupabasePresetStore') ||
    text.includes('Failed to fetch') ||
    text.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED') ||
    text.includes('Failed to load resource: net::ERR_CONNECTION_RESET') ||
    text.includes('status of 429');
}

async function verifyViewport(chromium, baseUrl, viewport) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ignoredConsoleError(msg.text())) errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(appUrl(baseUrl), { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByText('Synth', { exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /^Detail$/i }).click();
    await page.waitForTimeout(1200);

    const overlayCount = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
    assert(overlayCount === 0, 'Synth Play UI proof found an error overlay', { viewport, overlayCount });
    const bodyLength = (await page.locator('body').innerText()).trim().length;
    assert(bodyLength > 500, 'Synth Play UI proof found an unexpectedly sparse page', { viewport, bodyLength });
    assert(errors.length === 0, 'Synth Play UI proof found console/page errors', { viewport, errors });

    const playStrip = page.locator('.seq-spark-strip:has-text("Play:")').first();
    await playStrip.waitFor({ state: 'visible', timeout: 10000 });
    const beforeClass = await playStrip.getAttribute('class');
    assert(beforeClass?.includes('disabled'), 'Play strip should start disabled in a fresh session', { viewport, beforeClass });
    await playStrip.click();
    await page.waitForTimeout(250);

    const modeSegment = page.locator('.seq-play-mode-segment').first();
    await modeSegment.waitFor({ state: 'visible', timeout: 10000 });
    await modeSegment.getByRole('button', { name: /^Chord$/i }).click();
    await page.waitForTimeout(600);

    const afterChordClass = await playStrip.getAttribute('class');
    assert(afterChordClass?.includes('disabled'), 'Clicking Chord mode should preserve the current off Play state', { viewport, afterChordClass });
    const activeModes = await modeSegment.locator('button.active').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    assert(activeModes.includes('Chord'), 'Chord mode did not become active', { viewport, activeModes });

    const stepCount = await page.locator('.seq-play-chord-step').count();
    const labelCount = await page.locator('.seq-play-chord-label').count();
    const mutedCount = await page.locator('.seq-play-chord-label.muted').count();
    const outCount = await page.locator('.seq-play-chord-label.out').count();
    const onDotCount = await page.locator('.seq-play-chord-dot.on').count();
    const labels = await page.locator('.seq-play-chord-label').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    const stepTexts = await page.locator('.seq-play-chord-step').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));

    assert(stepCount === 16 && labelCount === 16, 'Chord Play grid should always render 16 stored steps', { viewport, stepCount, labelCount, stepTexts });
    assert(mutedCount === 16, 'Default Chord Play steps should all be off/muted', { viewport, mutedCount, labels });
    assert(outCount === 8, 'Default Chord Play length 8 should mark steps 9-16 out of active range', { viewport, outCount });
    assert(onDotCount === 0, 'Default inactive Chord Play should not show active chord pitch dots', { viewport, onDotCount });
    assert(!labels.some((label) => label === 'FREE'), 'Chord labels should not show FREE for captured/default Harmony slots', { viewport, labels });
    assert(stepTexts.includes('16'), 'Chord Play grid is missing stored step 16', { viewport, stepTexts });

    await page.locator('.seq-play-mode-header .seq-lane-enable-btn').first().click();
    await page.waitForTimeout(300);
    const afterEnableClass = await playStrip.getAttribute('class');
    assert(!afterEnableClass?.includes('disabled'), 'Play enable button should turn Play on independently of mode selection', { viewport, afterEnableClass });

    await modeSegment.getByRole('button', { name: /^ARP$/i }).click();
    await page.waitForTimeout(450);
    const afterArpClass = await playStrip.getAttribute('class');
    const activeModesAfterArp = await modeSegment.locator('button.active').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    assert(!afterArpClass?.includes('disabled'), 'Clicking ARP mode should preserve the current on Play state', { viewport, afterArpClass });
    assert(activeModesAfterArp.includes('ARP'), 'ARP mode did not become active', { viewport, activeModesAfterArp });

    return {
      viewport,
      stepCount,
      mutedCount,
      outCount,
      chordLabels: labels.slice(0, 8),
    };
  } finally {
    await browser.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const server = args.url ? { url: args.url, stop: async () => {} } : await startVite(args.port);
try {
  const { chromium } = await loadPlaywright();
  const results = [];
  for (const viewport of VIEWPORTS) {
    results.push(await verifyViewport(chromium, server.url, viewport));
  }
  console.log(JSON.stringify({ status: 'passed', url: server.url, results }, null, 2));
} finally {
  await server.stop();
}
