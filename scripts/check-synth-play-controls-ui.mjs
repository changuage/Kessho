#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4209;
const PRODUCT_RUNTIME_TELEMETRY_PROBE_SELECTOR = '[data-testid="product-runtime-telemetry-probe"]';
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
  url.searchParams.set('parity', '1');
  return url.toString();
}

function ignoredConsoleError(text) {
  return text.includes('SupabasePresetStore') ||
    text.includes('Failed to fetch') ||
    text.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED') ||
    text.includes('Failed to load resource: net::ERR_CONNECTION_RESET') ||
    text.includes('status of 429');
}

async function sampleSynthSequencerRuntime(page, sampleCount = 20) {
  return page.evaluate(async ({ count, selector }) => {
    const samples = [];
    for (let index = 0; index < count; index += 1) {
      const telemetry = JSON.parse(document.querySelector(selector)?.textContent ?? '{}');
      samples.push({
        running: telemetry.running === true,
        step: telemetry.synthStep ?? null,
        hitCount: telemetry.synthHitCount ?? null,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return samples;
  }, { count: sampleCount, selector: PRODUCT_RUNTIME_TELEMETRY_PROBE_SELECTOR });
}

async function readTransportRuntime(page) {
  return page.evaluate((selector) => {
    const telemetry = JSON.parse(document.querySelector(selector)?.textContent ?? '{}');
    return {
      running: telemetry.running === true,
      phraseSeconds: telemetry.phraseSeconds ?? null,
      pending: telemetry.transitionPending === true,
      pendingPhraseSeconds: telemetry.pendingPhraseSeconds ?? null,
      revision: telemetry.transitionRevision ?? 0,
    };
  }, PRODUCT_RUNTIME_TELEMETRY_PROBE_SELECTOR);
}

async function waitForTransportBoundary(page, baselineRevision, timeoutMs = 20000) {
  return page.evaluate(async ({ revision, selector, timeout }) => {
    const deadline = performance.now() + timeout;
    const samples = [];
    while (performance.now() < deadline) {
      const telemetry = JSON.parse(document.querySelector(selector)?.textContent ?? '{}');
      const sample = {
        running: telemetry.running === true,
        phraseSeconds: telemetry.phraseSeconds ?? null,
        pending: telemetry.transitionPending === true,
        revision: telemetry.transitionRevision ?? 0,
        step: telemetry.synthStep ?? null,
        hitCount: telemetry.synthHitCount ?? null,
      };
      samples.push(sample);
      if (sample.revision > revision) return { applied: sample, samples };
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return { applied: null, samples };
  }, { revision: baselineRevision, selector: PRODUCT_RUNTIME_TELEMETRY_PROBE_SELECTOR, timeout: timeoutMs });
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

    if (viewport.width > 760) {
      await page.getByRole('button', { name: 'Keys', exact: true }).click();
      const manualAKey = page.locator('.synth-keyboard-key').filter({
        has: page.locator('.synth-keyboard-key-shortcut', { hasText: 'A' }),
      }).first();
      await manualAKey.waitFor({ state: 'visible', timeout: 10000 });
      await page.keyboard.down('a');
      await page.waitForTimeout(50);
      assert((await manualAKey.getAttribute('class'))?.includes('active'), 'Physical keydown should activate the manual key');
      await manualAKey.evaluate((element) => {
        element.setPointerCapture = () => {};
        element.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 77,
          pointerType: 'touch',
          isPrimary: true,
        }));
      });
      await page.keyboard.up('a');
      await page.waitForTimeout(50);
      assert(
        (await manualAKey.getAttribute('class'))?.includes('active'),
        'Releasing one input must keep the key active while another input still holds it',
      );
      await manualAKey.evaluate((element) => {
        element.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 77,
          pointerType: 'touch',
          isPrimary: true,
        }));
      });
      await page.waitForTimeout(50);
      assert(!(await manualAKey.getAttribute('class'))?.includes('active'), 'The key should clear after its final input releases');
      await page.getByRole('button', { name: 'Keys', exact: true }).click();
    }

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

    const choiceLane = page.locator('.seq-chord-choice-lane').first();
    await choiceLane.waitFor({ state: 'visible', timeout: 10000 });
    const compactRows = choiceLane.locator('.harmony-compact-chord-row');
    const compactRowCount = await compactRows.count();
    const relativeMapCount = await choiceLane.locator('.harmony-relative-dot-map').count();
    const choiceLaneOverflow = await choiceLane.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    const bayCount = await page.locator('.seq-chord-interaction-bay').count();
    const keyboardCount = await page.locator('.harmony-live-keyboard').count();
    const whiteKeyCount = await page.locator('.harmony-live-white-keys .harmony-live-key.white').count();
    const blackKeyCount = await page.locator('.harmony-live-black-keys .harmony-live-key.black').count();
    const keyboardBounds = await page.locator('.harmony-live-keyboard').first().boundingBox();
    const oldGridCount = await page.locator('.seq-play-chord-grid').count();
    assert(compactRowCount === 8 && relativeMapCount === compactRowCount, 'Seq chord choice lane should render shared compact chord rows', { viewport, compactRowCount, relativeMapCount });
    assert(choiceLaneOverflow.scrollWidth <= choiceLaneOverflow.clientWidth, 'Seq chord choices should not require horizontal scrolling', { viewport, choiceLaneOverflow });
    assert(bayCount === 1 && keyboardCount === 1, 'Seq should expose one shared interaction bay and piano', { viewport, bayCount, keyboardCount });
    assert(whiteKeyCount === 7 && blackKeyCount === 5, 'Shared piano should expose seven white and five black keys', { viewport, whiteKeyCount, blackKeyCount });
    assert((keyboardBounds?.width ?? 0) > 100 && (keyboardBounds?.height ?? 0) > 50, 'Shared piano should have a visible layout bound', { viewport, keyboardBounds });
    const draftText = await page.locator('.seq-draft-controls').first().textContent();
    assert(draftText?.includes('DRAFT') && draftText?.includes('unsaved'), 'Fresh Seq draft should be explicitly unsaved', { viewport, draftText });
    const seqTabs = page.getByRole('button', { name: /^Seq [1-4]$/ });
    const seqTabCount = await seqTabs.count();
    for (let index = 0; index < Math.min(4, seqTabCount); index += 1) {
      await seqTabs.nth(index).click();
      await page.waitForTimeout(80);
      assert(await page.locator('.seq-chord-choice-lane').count() === 1, 'Each Seq tab should expose one choice lane', { viewport, index });
      assert(await page.locator('.seq-chord-interaction-bay').count() === 1, 'Each Seq tab should expose one interaction bay', { viewport, index });
      assert(await page.locator('.harmony-live-keyboard').count() === 1, 'Each Seq tab should expose one shared piano', { viewport, index });
    }
    assert(oldGridCount === 0, 'Legacy chord grid must not render after extraction', { viewport, oldGridCount });

    await page.locator('.seq-play-mode-header .seq-lane-enable-btn').first().click();
    await page.waitForTimeout(300);
    const afterEnableClass = await playStrip.getAttribute('class');
    assert(!afterEnableClass?.includes('disabled'), 'Play enable button should turn Play on independently of mode selection', { viewport, afterEnableClass });

    await page.getByText('Global', { exact: true }).click();
    await page.waitForTimeout(300);
    const offPageRuntimeSamples = await sampleSynthSequencerRuntime(page);
    const runningSamples = offPageRuntimeSamples.filter((sample) => sample.running);
    const observedSteps = new Set(runningSamples.map((sample) => sample.step).filter((step) => step !== null));
    const observedHitCounts = runningSamples.map((sample) => sample.hitCount).filter((count) => count !== null);
    const hitCountAdvanced = observedHitCounts.length > 1 && Math.max(...observedHitCounts) > Math.min(...observedHitCounts);
    assert(runningSamples.length > 0, 'Transport must remain running after navigating away from Synth', {
      viewport,
      offPageRuntimeSamples,
    });
    assert(
      observedSteps.size > 1 || hitCountAdvanced,
      'Synth sequencer runtime must continue advancing while the Synth page is unmounted',
      { viewport, offPageRuntimeSamples },
    );
    const transportSection = page.getByText('Transport & Sync', { exact: true });
    const phraseSlider = page.locator('.sl-slider').filter({ hasText: 'Phrase Seconds' }).first();
    if (!(await phraseSlider.isVisible())) await transportSection.click();
    await phraseSlider.waitFor({ state: 'visible', timeout: 10000 });
    await phraseSlider.scrollIntoViewIfNeeded();
    const phraseRail = phraseSlider.locator('.sl-slider-rail');
    const phraseSummary = page.getByText(/phrase is the master clock and derives/i).first();
    const summaryBeforeDrag = await phraseSummary.textContent();
    const sliderValueBeforeDrag = await phraseSlider.locator('.sl-slider-value').textContent();
    const transportBeforeDrag = await readTransportRuntime(page);
    const phraseRailBox = await phraseRail.boundingBox();
    const phraseThumbBox = await phraseSlider.locator('.sl-slider-thumb').boundingBox();
    assert(phraseRailBox, 'Phrase Seconds rail must have a measurable drag target', { viewport });
    assert(phraseThumbBox, 'Phrase Seconds thumb must have a measurable drag target', { viewport });
    await page.mouse.move(phraseThumbBox.x + phraseThumbBox.width / 2, phraseThumbBox.y + phraseThumbBox.height / 2);
    await page.mouse.down();
    const phrase32Percent = (32 - 4) / (128 - 4);
    await page.mouse.move(phraseRailBox.x + phraseRailBox.width * phrase32Percent, phraseRailBox.y + phraseRailBox.height / 2, { steps: 12 });
    const dragRuntimeSamples = await sampleSynthSequencerRuntime(page, 12);
    const summaryDuringDrag = await phraseSummary.textContent();
    const sliderValueDuringDrag = await phraseSlider.locator('.sl-slider-value').textContent();
    assert(summaryDuringDrag === summaryBeforeDrag, 'Phrase Seconds drag must not commit application state before pointer release', {
      viewport,
      summaryBeforeDrag,
      summaryDuringDrag,
    });
    assert(sliderValueDuringDrag !== sliderValueBeforeDrag, 'Phrase Seconds drag should preview the candidate value locally', {
      viewport,
      sliderValueBeforeDrag,
      sliderValueDuringDrag,
    });
    assert(sliderValueDuringDrag?.trim() === '32', 'Phrase Seconds drag should preview the requested 32-second phrase', {
      viewport,
      sliderValueDuringDrag,
    });
    const dragSteps = new Set(dragRuntimeSamples.filter((sample) => sample.running).map((sample) => sample.step).filter((step) => step !== null));
    const dragHitCounts = dragRuntimeSamples.map((sample) => sample.hitCount).filter((count) => count !== null);
    assert(
      dragRuntimeSamples.every((sample) => sample.running) && (dragSteps.size > 1 || Math.max(...dragHitCounts) > Math.min(...dragHitCounts)),
      'Synth sequencer playback must continue on the active clock throughout a Phrase Seconds drag',
      { viewport, dragRuntimeSamples },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);
    const summaryAfterRelease = await phraseSummary.textContent();
    assert(summaryAfterRelease !== summaryBeforeDrag, 'Phrase Seconds must commit once the pointer is released', {
      viewport,
      summaryBeforeDrag,
      summaryAfterRelease,
    });
    const transportAfterRelease = await readTransportRuntime(page);
    assert(transportAfterRelease.running, 'Transport must remain running after Phrase Seconds release', {
      viewport,
      transportAfterRelease,
    });
    if (transportAfterRelease.revision === transportBeforeDrag.revision) {
      assert(transportAfterRelease.pending, 'Released Phrase Seconds should stage one native transport transition', {
        viewport,
        transportBeforeDrag,
        transportAfterRelease,
      });
      assert(
        transportAfterRelease.phraseSeconds === transportBeforeDrag.phraseSeconds,
        'Active phrase timing must remain unchanged before the boundary',
        { viewport, transportBeforeDrag, transportAfterRelease },
      );
      assert(transportAfterRelease.pendingPhraseSeconds === 32, 'The pending native phrase should be exactly 32 seconds', {
        viewport,
        transportAfterRelease,
      });
    }
    const boundaryResult = await waitForTransportBoundary(page, transportBeforeDrag.revision);
    assert(boundaryResult.applied, 'Phrase Seconds transition did not apply at the next phrase boundary', {
      viewport,
      transportBeforeDrag,
      transportAfterRelease,
      samples: boundaryResult.samples.slice(-20),
    });
    assert(boundaryResult.samples.every((sample) => sample.running), 'Transport must not stop while waiting for the new phrase timing', {
      viewport,
      samples: boundaryResult.samples,
    });
    assert(boundaryResult.applied?.phraseSeconds === 32, 'The new phrase must begin with the staged 32-second timing', {
      viewport,
      applied: boundaryResult.applied,
    });

    await page.getByText('Synth', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Detail$/i }).click();
    const restoredPlayStrip = page.locator('.seq-spark-strip:has-text("Play:")').first();
    await restoredPlayStrip.waitFor({ state: 'visible', timeout: 10000 });
    const restoredPlayClass = await restoredPlayStrip.getAttribute('class');
    assert(!restoredPlayClass?.includes('disabled'), 'Chord Play must remain enabled after navigating away from Synth', {
      viewport,
      restoredPlayClass,
    });
    const restoredModeSegment = page.locator('.seq-play-mode-segment').first();
    const restoredModes = await restoredModeSegment.locator('button.active').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    assert(restoredModes.includes('Chord'), 'Chord Play mode must survive Synth page unmount/remount', { viewport, restoredModes });

    await restoredModeSegment.getByRole('button', { name: /^ARP$/i }).click();
    await page.waitForTimeout(450);
    const afterArpClass = await restoredPlayStrip.getAttribute('class');
    const activeModesAfterArp = await restoredModeSegment.locator('button.active').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    assert(!afterArpClass?.includes('disabled'), 'Clicking ARP mode should preserve the current on Play state', { viewport, afterArpClass });
    assert(activeModesAfterArp.includes('ARP'), 'ARP mode did not become active', { viewport, activeModesAfterArp });

    return {
      viewport,
      compactRowCount,
      relativeMapCount,
      bayCount,
      keyboardCount,
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
