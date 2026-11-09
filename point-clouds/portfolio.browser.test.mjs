import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';

// Start Vite first: npm run dev -- --host 127.0.0.1 --port 5175
const baseURL = process.env.POINT_CLOUDS_TEST_URL || 'http://127.0.0.1:5175/point-clouds/';
const output = new URL('../docs/reports/point-clouds-portfolio/', import.meta.url);
let browser;
before(async () => {
  await mkdir(output, { recursive: true });
  const engine = process.env.POINT_CLOUDS_TEST_BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true });
});
after(async () => browser?.close());

async function openPage({ mobile = false, reduced = false, noWebGL = false, realAudio = false, virtualTime = false, randomValue, width, height } = {}) {
  const context = await browser.newContext({
    viewport: { width: width || (mobile ? 390 : 1440), height: height || (mobile ? 844 : 900) },
    hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  if (virtualTime) await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ noWebGL, realAudio, randomValue }) => {
    if (window !== window.top) return;
    if (typeof randomValue === 'number') Math.random = () => randomValue;
    const stats = window.__portfolioTest = { draws: 0, points: 0, uniforms: {}, starts: 0, stops: 0 };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (noWebGL && type === 'webgl2') return null;
      return originalGetContext.call(this, type, ...args);
    };
    const locations = new WeakMap();
    const proto = WebGL2RenderingContext.prototype;
    const originalLocation = proto.getUniformLocation;
    proto.getUniformLocation = function (program, name) {
      const location = originalLocation.call(this, program, name);
      if (location) locations.set(location, name);
      return location;
    };
    const originalUniform = proto.uniform1f;
    proto.uniform1f = function (location, value) {
      stats.uniforms[locations.get(location)] = value;
      return originalUniform.call(this, location, value);
    };
    const originalDraw = proto.drawArrays;
    proto.drawArrays = function (...args) {
      stats.draws++;
      stats.points = args[2];
      return originalDraw.apply(this, args);
    };
    if (realAudio) return;
    let running = false;
    // Test fixture only: exercises website lifecycle without creating an audio device.
    window.__pointCloudsKesshoBridge = {
      listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
      start: async () => {
        stats.starts++;
        await new Promise(resolve => setTimeout(resolve, 80));
        if (stats.failNextStart) { stats.failNextStart = false; throw new Error('Test engine start failure'); }
        running = true;
      },
      stop: async () => { stats.stops++; await new Promise(resolve => setTimeout(resolve, 60)); running = false; },
      setMorph: () => {},
      getStatus: () => ({
        presetId: 'string-waves', presetName: 'String Waves', isRunning: running,
        lifecycleState: running ? 'running' : 'stopped', audioContextState: running ? 'running' : 'suspended',
        telemetry: { transportRunning: running, masterOutputRms: running ? (stats.rms ?? .04) : 0, masterOutputPeak: running ? .2 : 0 },
      }),
    };
  }, { noWebGL, realAudio, randomValue });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'About', exact: true }).waitFor();
  return { context, page, errors };
}

async function screenshot(page, name) {
  await page.screenshot({ path: new URL(name + '.png', output).pathname, animations: 'disabled', scale: 'css' });
}

async function dismissPortfolio(page, virtualTime = false) {
  await page.keyboard.press('Escape');
  if (virtualTime) await page.clock.runFor(260);
  await page.locator('#info').waitFor({ state: 'hidden' });
}

test('portfolio is immediately available, captures a frame, scrolls, traps focus and restores its invoker', async () => {
  const { context, page, errors } = await openPage({ height: 520 });
  try {
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
    const frozen = await page.evaluate(() => {
      const c = document.getElementById('field-snapshot');
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 35) lit++;
      return { lit, ...window.__portfolioTest };
    });
    assert.ok(frozen.lit > 100, 'snapshot must contain the artwork');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), frozen.draws);
    assert.equal(await page.evaluate(() => window.__portfolioTest.starts), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'info-title');
    const wheelPrevented = await page.locator('.info-body').evaluate(el => {
      const e = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    assert.equal(wheelPrevented, false);
    await page.mouse.move(720, 300);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(180);
    assert.ok(await page.locator('.info-body').evaluate(el => el.scrollTop) > 0);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.getElementById('info').contains(document.activeElement)));
    }
    await screenshot(page, 'desktop-work');
    await dismissPortfolio(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'info-open');
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.__portfolioTest.draws) > frozen.draws);
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: 'About', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'info-title');
      await dismissPortfolio(page);
    }
    assert.equal(await page.locator('#field-snapshot').count(), 1);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => window.__portfolioTest.draws);
    await page.waitForTimeout(600);
    const frames = await page.evaluate(() => window.__portfolioTest.draws) - start;
    assert.ok(frames > 0 && frames <= 38, `one 60fps scheduler expected, got ${frames}`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('frosted portfolio caches a small blur, centres its text and does no ongoing visual work', async () => {
  const { context, page, errors } = await openPage({ randomValue: .1 });
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.waitForFunction(() => document.body.classList.contains('is-live'));
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => Number(document.getElementById('info-frost').dataset.builds) > 0);
    const cached = await page.evaluate(() => {
      const dialog = document.getElementById('info');
      const frost = document.getElementById('info-frost');
      const snapshot = document.getElementById('field-snapshot');
      const bounds = dialog.getBoundingClientRect();
      const raw = document.createElement('canvas');
      raw.width = frost.width; raw.height = frost.height;
      const ctx = raw.getContext('2d');
      ctx.drawImage(snapshot,
        (bounds.left + dialog.clientLeft) * snapshot.width / innerWidth,
        (bounds.top + dialog.clientTop) * snapshot.height / innerHeight,
        dialog.clientWidth * snapshot.width / innerWidth, dialog.clientHeight * snapshot.height / innerHeight,
        0, 0, raw.width, raw.height);
      const edgeEnergy = pixels => {
        let energy = 0;
        for (let y = 0; y < raw.height; y++) {
          for (let x = 1; x < raw.width; x++) {
            const i = (y * raw.width + x) * 4;
            energy += Math.abs(pixels[i] - pixels[i - 4]);
          }
        }
        return energy;
      };
      return {
        centreX: bounds.left + bounds.width / 2 - innerWidth / 2,
        centreY: bounds.top + bounds.height / 2 - innerHeight / 2,
        width: frost.width, height: frost.height,
        maxWidth: Math.ceil(dialog.clientWidth / 4), maxHeight: Math.ceil(dialog.clientHeight / 4),
        rawEnergy: edgeEnergy(ctx.getImageData(0, 0, raw.width, raw.height).data),
        blurredEnergy: edgeEnergy(frost.getContext('2d').getImageData(0, 0, frost.width, frost.height).data),
        blurFilter: getComputedStyle(dialog, '::backdrop').backdropFilter,
        textAlign: [...dialog.querySelectorAll('.info-title, .bio, .work-copy')].map(el => getComputedStyle(el).textAlign),
        draws: window.__portfolioTest.draws, builds: frost.dataset.builds,
      };
    });
    assert.ok(Math.abs(cached.centreX) < 1 && Math.abs(cached.centreY) < 1);
    assert.ok(cached.width <= cached.maxWidth && cached.height <= cached.maxHeight);
    assert.ok(cached.rawEnergy > 0 && cached.blurredEnergy < cached.rawEnergy * .5, 'the cached image is genuinely softened');
    assert.ok(!cached.blurFilter || cached.blurFilter === 'none', 'no live backdrop blur');
    assert.ok(cached.textAlign.every(value => value === 'center'));
    await page.locator('.info-body').evaluate(el => { el.scrollTop = 100; });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), cached.draws);
    assert.equal(await page.locator('#info-frost').getAttribute('data-builds'), cached.builds);
    assert.equal(await page.evaluate(() => window.__portfolioTest.stops), 0);
    await page.locator('.info-body').evaluate(el => { el.scrollTop = 0; });
    await screenshot(page, 'frosted-desktop');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(before => document.getElementById('info-frost').dataset.builds !== before, cached.builds);
    await screenshot(page, 'frosted-desktop-1280');
    await dismissPortfolio(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('portfolio fades in and out without moving and remains modal until the exit completes', async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('info')).opacity) === 1);
    const before = await page.locator('#info').boundingBox();
    assert.equal(await page.locator('#info').evaluate(el => getComputedStyle(el).transform), 'none');
    const draws = await page.evaluate(() => window.__portfolioTest.draws);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('#info').evaluate(el => el.open && el.classList.contains('is-closing')), true);
    await page.waitForTimeout(80);
    const fading = await page.locator('#info').evaluate(el => Number(getComputedStyle(el).opacity));
    assert.ok(fading > 0 && fading < 1, 'closing visibly fades instead of disappearing');
    assert.deepEqual(await page.locator('#info').boundingBox(), before);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), draws);
    await page.locator('#info').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'info-open');
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('info')).opacity) === 1);
    await page.mouse.click(10, 450);
    await page.locator('#info').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#info').evaluate(el => el.classList.contains('is-closing')), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the visual clock pauses during hold, spin and initials; final geometry is preserved', async () => {
  const { context, page, errors } = await openPage();
  try {
    await screenshot(page, 'desktop-initial');
    for (const phase of [.7, 3.9, 8.4]) {
      await page.waitForFunction(t => window.__portfolioTest.uniforms.uIntroTime >= t, phase);
      await page.getByRole('button', { name: 'About', exact: true }).click();
      await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
      const paused = await page.evaluate(() => ({ ...window.__portfolioTest.uniforms }));
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => window.__portfolioTest.uniforms), paused);
      await dismissPortfolio(page);
      await page.waitForTimeout(80);
      const resumed = await page.evaluate(() => window.__portfolioTest.uniforms.uIntroTime);
      assert.ok(resumed >= paused.uIntroTime && resumed - paused.uIntroTime < .25);
    }
    await screenshot(page, 'desktop-initials');
    await page.locator('#intro-play.is-ready').waitFor();
    await screenshot(page, 'desktop-play-ready');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('audio lifecycle, repeat clicks and release pause are independent of the dialog', async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('audio-toggle').dataset.active === 'true');
    assert.equal(await page.evaluate(() => window.__portfolioTest.starts), 1);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('is-live')), false);
    assert.equal(await page.evaluate(() => window.__portfolioTest.stops), 0);
    await dismissPortfolio(page);
    await page.waitForFunction(() => document.body.classList.contains('is-live'));
    await screenshot(page, 'desktop-live');
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).click();
    await page.getByRole('button', { name: 'Listen', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Listen', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('audio-toggle').dataset.active === 'true');
    assert.equal(await page.evaluate(() => window.__portfolioTest.starts), 2);
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).click();
    await page.getByRole('button', { name: 'Listen', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__portfolioTest.stops), 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a failed start remains explicit and can be retried without duplicate starts', async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.evaluate(() => { window.__portfolioTest.failNextStart = true; });
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.evaluate(() => document.getElementById('audio-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.getByRole('button', { name: 'Retry Kessho audio engine' }).waitFor();
    assert.equal(await page.evaluate(() => window.__portfolioTest.starts), 1);
    assert.equal(await page.locator('#audio-toggle').getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Retry Kessho audio engine' }).click();
    await page.getByRole('button', { name: 'Listen', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).waitFor();
    assert.equal(await page.evaluate(() => window.__portfolioTest.starts), 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('mobile stays at 10,000 points and 30fps, and reading surface fits narrow screens', async () => {
  const { context, page, errors } = await openPage({ mobile: true });
  try {
    await page.waitForTimeout(200);
    const start = await page.evaluate(() => window.__portfolioTest.draws);
    await page.waitForTimeout(650);
    const stats = await page.evaluate(() => ({ ...window.__portfolioTest, canvasWidth: document.getElementById('field').width }));
    assert.equal(stats.points, 10000);
    assert.equal(stats.canvasWidth, 390);
    assert.ok(stats.draws - start > 0 && stats.draws - start <= 22);
    for (const [width, height] of [[390, 844], [360, 740], [844, 390], [1280, 720], [720, 450]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'About', exact: true }).click();
      const fit = await page.locator('dialog').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth;
      });
      assert.ok(fit, `dialog fits ${width} × ${height}`);
      if (width === 390) await screenshot(page, 'mobile-about');
      await dismissPortfolio(page);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion draws only on demand, including after audio start and scene change', async () => {
  const { context, page, errors } = await openPage({ reduced: true });
  try {
    await page.waitForTimeout(400);
    const start = await page.evaluate(() => window.__portfolioTest.draws);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), start);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).waitFor();
    await page.waitForTimeout(200);
    const live = await page.evaluate(() => window.__portfolioTest.draws);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), live);
    await page.locator('#field').click({ position: { x: 100, y: 100 } });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.__portfolioTest.draws) > live);
    assert.equal(await page.evaluate(() => window.__portfolioTest.uniforms.uAudio), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Info and the concept explanation remain available without WebGL', async () => {
  const { context, page, errors } = await openPage({ noWebGL: true });
  try {
    await page.getByRole('button', { name: 'About', exact: true }).click();
    assert.equal(await page.locator('dialog').isVisible(), true);
    await dismissPortfolio(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'info-open');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('film grain stays on the artwork and pauses behind a clean reading surface', async () => {
  const { context, page, errors } = await openPage();
  try {
    const film = await page.locator('#film').evaluate(el => {
      const grain = getComputedStyle(el, '::before');
      const bounds = el.getBoundingClientRect();
      return {
        cached: grain.backgroundImage.startsWith('url("data:image/png;base64,'),
        animation: grain.animationName,
        size: grain.backgroundSize,
        opacity: Number(grain.opacity),
        interactive: getComputedStyle(el).pointerEvents !== 'none',
        fits: bounds.width === innerWidth && bounds.height === innerHeight,
        aboveControls: Number(getComputedStyle(el).zIndex) > Number(getComputedStyle(document.getElementById('frame')).zIndex),
        transform: grain.transform,
      };
    });
    assert.equal(film.cached, true);
    assert.equal(film.animation, 'film-grain');
    assert.equal(film.size, '192px 192px', 'grain uses the original fine texture scale');
    assert.ok(film.opacity > 0 && film.opacity < .1);
    assert.equal(film.interactive, false);
    assert.equal(film.fits, true);
    assert.equal(film.aboveControls, true);
    await page.waitForFunction(before => getComputedStyle(document.getElementById('film'), '::before').transform !== before, film.transform);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
    assert.equal(await page.locator('#info .film').count(), 0, 'the profile and photo have no grain overlay');
    assert.equal(await page.locator('#film').evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'paused');
    const draws = await page.evaluate(() => window.__portfolioTest.draws);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__portfolioTest.draws), draws, 'grain must not start another WebGL loop');
    await screenshot(page, 'film-desktop-work');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#film').evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'paused');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('grain is static with reduced motion and slower on mobile without blocking controls', async () => {
  for (const reduced of [false, true]) {
    const { context, page, errors } = await openPage({ mobile: true, reduced });
    try {
      const style = await page.locator('#film').evaluate(el => {
        const grain = getComputedStyle(el, '::before');
        return { animation: grain.animationName, duration: grain.animationDuration };
      });
      assert.equal(style.animation, reduced ? 'none' : 'film-grain');
      if (!reduced) assert.equal(style.duration, '2.4s');
      await screenshot(page, reduced ? 'film-reduced-motion' : 'film-mobile-home');
      await page.getByRole('button', { name: 'About', exact: true }).click();
      assert.equal(await page.locator('dialog').isVisible(), true);
      await dismissPortfolio(page);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('four equal corner labels and the portrait fit desktop and narrow mobile screens', async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [320, 740]]) {
      await page.setViewportSize({ width, height });
      const fits = await page.evaluate(() => {
        const rect = s => document.querySelector(s).getBoundingClientRect();
        const brand = rect('.brand'), nav = rect('.portfolio-nav');
        const signature = rect('.signature'), audio = rect('.audio');
        return brand.right <= nav.left && nav.right <= innerWidth && signature.right <= audio.left
          && audio.right <= innerWidth && audio.bottom <= innerHeight;
      });
      assert.ok(fits, `home controls must not collide at ${width}px`);
      const cornerFonts = await page.locator('.corner-label').evaluateAll(labels => labels.map(el => {
        const style = getComputedStyle(el);
        return [style.fontSize, style.fontWeight, style.fontFamily].join('|');
      }));
      assert.equal(cornerFonts.length, 4);
      assert.equal(new Set(cornerFonts).size, 1, 'all four corner labels have equal typography');
      if (width === 390) await screenshot(page, 'sleeve-mobile-home');
      await page.getByRole('button', { name: 'About', exact: true }).click();
      await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check('400 48px "Instrument Serif"') && document.fonts.check('400 16px "Manrope"')));
      await page.locator('.portrait img').evaluate(img => img.decode());
      const portrait = await page.locator('.portrait img').evaluate(img => ({
        width: img.naturalWidth, height: img.naturalHeight,
        source: img.currentSrc,
        filter: getComputedStyle(img).filter,
        renderedRatio: img.clientWidth / img.clientHeight,
      }));
      assert.ok(portrait.width > 0 && /performance-(640|1000)\.jpg/.test(portrait.source));
      assert.ok(Math.abs(portrait.renderedRatio - portrait.width / portrait.height) < .005, 'the full photo remains uncropped');
      assert.equal(portrait.filter, 'none');
      const imageBounds = await page.locator('.portrait img').boundingBox();
      if (width <= 760) assert.ok(imageBounds.height <= height * .6 + 2, 'the mobile portrait leaves room for profile content');
      else assert.ok(imageBounds.width <= 301, 'the desktop portrait stays proportionate to the bio');
      const sheetFits = await page.locator('.info-body').evaluate(el => el.scrollWidth <= el.clientWidth);
      assert.ok(sheetFits, `sheet content fits at ${width}px`);
      await screenshot(page, `sleeve-work-${width}`);
      await dismissPortfolio(page);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the concept explanation supports hover, keyboard and touch without intercepting reading gestures', async () => {
  for (const mobile of [false, true]) {
    const { context, page, errors } = await openPage({ mobile });
    try {
      const trigger = page.getByRole('button', { name: 'Point Clouds', exact: true });
      if (mobile) await trigger.tap();
      else await trigger.hover();
      await page.waitForFunction(() => document.getElementById('concept-popover').matches(':popover-open'));
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#concept-popover').getByRole('heading', { name: 'Point Clouds', exact: true }).isVisible(), true);
      assert.equal(await page.locator('#concept-popover').getByRole('heading', { name: 'Kessho', exact: true }).isVisible(), true);
      assert.equal(await page.locator('#concept-popover').getByText('Point Clouds is the musical moniker of Patrick Chang, exploring sound through field recordings, rhythm and guided randomness.', { exact: true }).isVisible(), true);
      const fits = await page.locator('#concept-popover').evaluate(el => {
        const r = el.getBoundingClientRect();
        const e = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
        el.dispatchEvent(e);
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && !e.defaultPrevented;
      });
      assert.ok(fits, 'the explanation fits and can scroll without changing the artwork');
      await screenshot(page, mobile ? 'profile-mobile-concept' : 'profile-desktop-concept');
      if (!mobile) await page.locator('#concept-popover').screenshot({ path: new URL('refined-kessho-panel.png', output).pathname, animations: 'disabled', scale: 'css' });
      if (mobile) {
        await trigger.tap();
        await page.waitForFunction(() => !document.getElementById('concept-popover').matches(':popover-open'));
        await trigger.tap();
        await page.touchscreen.tap(10, 300);
      } else {
        await page.locator('#concept-popover').hover();
        await page.waitForTimeout(250);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        await page.mouse.move(700, 150);
        await page.waitForFunction(() => !document.getElementById('concept-popover').matches(':popover-open'));
        await page.getByRole('button', { name: 'About', exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        await trigger.focus();
        await page.waitForFunction(() => document.getElementById('concept-popover').matches(':popover-open'));
        await page.keyboard.press('Escape');
        await trigger.hover();
        await trigger.click();
        await page.mouse.move(700, 150);
        await page.waitForTimeout(300);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'click pins the hover preview');
        await page.locator('#field').click({ position: { x: 700, y: 150 } });
      }
      await page.waitForFunction(() => !document.getElementById('concept-popover').matches(':popover-open'));
      await page.getByRole('button', { name: 'About', exact: true }).click();
      assert.equal(await page.locator('.info-body h3').allTextContents().then(labels => labels.join('|')), 'Short Bio|Past Works');
      assert.equal(await page.locator('#current-section').count(), 0);
      assert.equal(await page.locator('.work-entry').count(), 4);
      await page.locator('.portrait img').evaluate(img => img.decode());
      await screenshot(page, mobile ? 'profile-mobile-info' : 'profile-desktop-info');
      await page.locator('#portfolio-past').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await screenshot(page, mobile ? 'profile-mobile-past' : 'profile-desktop-past');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('only identity labels dim after eight idle listening seconds and interaction restores them', async () => {
  const { context, page, errors } = await openPage({ virtualTime: true, reduced: true });
  try {
    await page.clock.runFor(9000);
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.clock.runFor(500);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.mouse.move(700, 300);
    await page.clock.runFor(7500);
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.brand').evaluate(el => getComputedStyle(el).opacity), '0.6');
    assert.equal(await page.locator('#concept-toggle').evaluate(el => getComputedStyle(el).opacity), '0.6');
    for (const id of ['info-open', 'audio-toggle']) {
      assert.equal(await page.locator('#' + id).evaluate(el => getComputedStyle(el).opacity), '1');
    }
    await page.mouse.move(705, 300);
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    await page.getByRole('button', { name: 'Point Clouds', exact: true }).hover();
    await page.mouse.move(100, 500);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.clock.runFor(16000);
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    await dismissPortfolio(page);
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).click();
    await page.clock.runFor(9000);
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('touch playback dims the identity labels and tapping restores them', async () => {
  const { context, page, errors } = await openPage({ virtualTime: true, mobile: true, reduced: true });
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).tap();
    await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).waitFor();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.runFor(9000);
    assert.equal(await page.locator('.brand').evaluate(el => getComputedStyle(el).opacity), '0.6');
    await page.locator('#field').tap({ position: { x: 200, y: 120 } });
    assert.equal(await page.locator('#frame').evaluate(el => el.classList.contains('is-idle')), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('all four patterns can be selected as the random opening field', async () => {
  for (let scene = 0; scene < 4; scene++) {
    const { context, page, errors } = await openPage({ randomValue: (scene + .5) / 4 });
    try {
      await page.waitForFunction(() => Number.isFinite(window.__portfolioTest.uniforms.uTo));
      const uniforms = await page.evaluate(() => window.__portfolioTest.uniforms);
      assert.equal(uniforms.uFrom, scene);
      assert.equal(uniforms.uTo, scene);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('random field morphs over 15 seconds every 15 visible seconds, never repeats, and manual changes reset the countdown', async () => {
  const { context, page, errors } = await openPage({ virtualTime: true, randomValue: .9 });
  const current = () => page.evaluate(() => ({ ...window.__portfolioTest.uniforms }));
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.waitForFunction(() => document.body.classList.contains('is-live'));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const first = await current();
    assert.equal(first.uTo, 3);
    await page.clock.fastForward(14000);
    assert.equal((await current()).uTo, first.uTo);
    await page.clock.fastForward(1100);
    const second = await current();
    assert.equal(second.uFrom, first.uTo);
    assert.equal(second.uTo, 2);
    assert.ok(second.uMorph < .05, 'the change starts a morph rather than snapping');
    await page.clock.fastForward(7500);
    assert.ok((await current()).uMorph > .49 && (await current()).uMorph < .51, 'morph is halfway after 7.5 seconds');
    await page.clock.fastForward(7400);
    assert.ok((await current()).uMorph > .99 && (await current()).uMorph < 1, 'morph is still progressing just before 15 seconds');
    await page.clock.fastForward(100);
    assert.equal((await current()).uFrom, second.uTo, 'the next morph starts from the completed shape');
    assert.equal((await current()).uTo, 1);
    assert.ok((await current()).uMorph < .01);
    await page.clock.fastForward(15000);
    assert.equal((await current()).uTo, 0);
    await page.clock.runFor(1500);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.clock.runFor(50);
    const frozen = await current();
    await page.clock.fastForward(60000);
    assert.deepEqual(await current(), frozen, 'portfolio reading pauses the countdown');
    await dismissPortfolio(page, true);
    await page.clock.runFor(50);
    await page.clock.fastForward(10000);
    assert.equal((await current()).uTo, frozen.uTo);
    await page.evaluate(() => {
      window.__testHidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await current();
    await page.clock.fastForward(40000);
    assert.deepEqual(await current(), hidden, 'hidden tabs pause the countdown');
    await page.evaluate(() => {
      window.__testHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(50);
    assert.equal((await current()).uTo, hidden.uTo);
    await page.locator('#field').click({ position: { x: 100, y: 100 } });
    await page.keyboard.press('ArrowRight');
    await page.clock.runFor(50);
    const manual = await current();
    assert.equal(manual.uTo, (frozen.uTo + 1) % 4);
    await page.clock.fastForward(14000);
    assert.equal((await current()).uTo, manual.uTo, 'manual changes get a fresh 15 seconds');
    await page.clock.fastForward(1100);
    assert.notEqual((await current()).uTo, manual.uTo);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion keeps the random field static instead of automatically morphing', async () => {
  const { context, page, errors } = await openPage({ reduced: true, virtualTime: true, randomValue: .9 });
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page.waitForFunction(() => document.body.classList.contains('is-live'));
    await page.evaluate(() => document.fonts.ready);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.clock.runFor(100);
    const before = await page.evaluate(() => ({ ...window.__portfolioTest }));
    await page.clock.fastForward(61000);
    const after = await page.evaluate(() => ({ ...window.__portfolioTest }));
    assert.equal(after.draws, before.draws);
    assert.equal(after.uniforms.uTo, before.uniforms.uTo);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('background visibility and dialog pause share one resume clock', async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.waitForTimeout(120);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
    const paused = await page.evaluate(() => ({ ...window.__portfolioTest.uniforms }));
    await page.evaluate(() => {
      window.__testHidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await dismissPortfolio(page);
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__portfolioTest.uniforms), paused);
    await page.evaluate(() => {
      window.__testHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    const resumed = await page.evaluate(() => window.__portfolioTest.uniforms.uIntroTime);
    assert.ok(resumed > paused.uIntroTime && resumed - paused.uIntroTime < .25);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('real Product Core starts and stops twice without losing playback in the portfolio', async () => {
  const { context, page, errors } = await openPage({ realAudio: true });
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).waitFor({ timeout: 20000 });
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByRole('button', { name: 'Listen', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('audio-toggle').dataset.active === 'true', null, { timeout: 20000 }).catch(async error => {
        const status = await page.locator('#audio-toggle').evaluate(el => ({ label: el.getAttribute('aria-label'), ...el.dataset }));
        throw new Error(`Real playback did not start: ${JSON.stringify(status)}`, { cause: error });
      });
      await page.waitForFunction(() => Number(document.getElementById('audio-toggle').dataset.rms) > .000001, null, { timeout: 15000 });
      await page.getByRole('button', { name: 'About', exact: true }).click();
      await page.waitForTimeout(200);
      const running = await page.evaluate(() => window.__pointCloudsKesshoBridge.getStatus());
      assert.equal(running.isRunning, true);
      assert.equal(running.telemetry.transportRunning, true);
      await dismissPortfolio(page);
      await page.getByRole('button', { name: 'Stop Kessho String Waves preset' }).click();
      await page.getByRole('button', { name: 'Listen', exact: true }).waitFor({ timeout: 10000 });
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('save original title reference at matching viewport and animation time', async () => {
  const { context, page } = await openPage();
  try {
    const original = execFileSync('git', ['show', 'HEAD:point-clouds/index.html'], { encoding: 'utf8' });
    await page.route('**/point-clouds/?original-reference', route => route.fulfill({ contentType: 'text/html', body: original }));
    await page.goto(baseURL + '?original-reference');
    await page.waitForFunction(() => window.__portfolioTest.uniforms.uIntroTime >= 12.5);
    await screenshot(page, 'desktop-title-before');
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('field-snapshot').hidden);
    await screenshot(page, 'desktop-work');
    await dismissPortfolio(page);
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await screenshot(page, 'desktop-about');
  } finally { await context.close(); }
});
