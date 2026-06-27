import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const mode = parseMode(process.argv.slice(2));
const buildRoot = resolve(root, 'build/ios-sim-smoke');
const appPath = resolve(buildRoot, 'Build/Products/Debug-iphonesimulator/App.app');
const reportPath = resolve(root, `docs/reports/kessho-ios-simulator-${mode}-smoke-latest.json`);
const bundleId = 'app.kessho.capacitor';

function parseMode(args) {
  const arg = args.find((value) => value.startsWith('--mode='));
  const parsed = arg ? arg.slice('--mode='.length) : 'foreground';
  if (!['foreground', 'background'].includes(parsed)) {
    throw new Error(`Unsupported mode ${parsed}`);
  }
  return parsed;
}

function run(command, args, options = {}) {
  return new Promise((resolveProcess) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
        }, options.timeoutMs)
      : null;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => {
      if (timeout) clearTimeout(timeout);
      resolveProcess({ code, signal, stdout, stderr });
    });
  });
}

function requireSuccess(result, label) {
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(`${label} failed with code ${result.code}${result.signal ? ` signal ${result.signal}` : ''}\n${tail(output, 80)}`);
  }
}

function tail(text, lines) {
  const parts = String(text || '').split('\n');
  return parts.slice(Math.max(0, parts.length - lines)).join('\n');
}

async function chooseSimulator() {
  if (process.env.KESSHO_IOS_SIMULATOR_UDID) {
    return {
      udid: process.env.KESSHO_IOS_SIMULATOR_UDID,
      name: process.env.KESSHO_IOS_SIMULATOR_NAME || process.env.KESSHO_IOS_SIMULATOR_UDID,
      runtime: 'env',
    };
  }
  const result = await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { timeoutMs: 30_000 });
  requireSuccess(result, 'xcrun simctl list devices');
  const parsed = JSON.parse(result.stdout);
  const devices = Object.entries(parsed.devices ?? {})
    .flatMap(([runtime, list]) => (list ?? []).map((device) => ({ ...device, runtime })))
    .filter((device) => device.isAvailable !== false && /iPhone/.test(device.name));
  const preferred = devices.find((device) => device.name === 'iPhone 17')
    ?? devices.find((device) => /iPhone/.test(device.name))
    ?? null;
  if (!preferred) {
    throw new Error('No available iPhone simulator found');
  }
  return {
    udid: preferred.udid,
    name: preferred.name,
    runtime: preferred.runtime,
  };
}

async function main() {
  const simulator = await chooseSimulator();
  const build = await run('xcodebuild', [
    '-project', 'ios/App/App.xcodeproj',
    '-scheme', 'App',
    '-configuration', 'Debug',
    '-destination', `id=${simulator.udid}`,
    '-derivedDataPath', buildRoot,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ], { timeoutMs: 180_000 });
  requireSuccess(build, 'xcodebuild iOS simulator build');

  const boot = await run('xcrun', ['simctl', 'boot', simulator.udid], { timeoutMs: 30_000 });
  if (boot.code !== 0 && !/Unable to boot device in current state: Booted|already booted/i.test(`${boot.stdout}\n${boot.stderr}`)) {
    requireSuccess(boot, 'xcrun simctl boot');
  }
  requireSuccess(await run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], { timeoutMs: 60_000 }), 'xcrun simctl bootstatus');
  requireSuccess(await run('xcrun', ['simctl', 'install', simulator.udid, appPath], { timeoutMs: 60_000 }), 'xcrun simctl install');

  const launchArg = mode === 'background'
    ? '--kessho-ios-background-audio-smoke'
    : '--kessho-ios-simulator-smoke';
  const launch = await run('xcrun', [
    'simctl',
    'launch',
    '--console',
    '--terminate-running-process',
    simulator.udid,
    bundleId,
    launchArg,
  ], { timeoutMs: 90_000 });
  requireSuccess(launch, 'xcrun simctl launch smoke app');

  const output = `${launch.stdout}\n${launch.stderr}`;
  const passLine = output.split('\n').find((line) => line.includes('Kessho iOS simulator Product Core smoke passed'));
  if (!passLine) {
    throw new Error(`iOS simulator smoke did not emit pass line\n${tail(output, 80)}`);
  }

  const requiredTokens = [
    `mode=${mode}`,
    'peak=',
    'rms=',
    'renderedFrames=',
    'rendererStartCount=1',
    'routeChangeCount=1',
    'interruptionBeginCount=1',
    'interruptionEndCount=1',
  ];
  if (mode === 'background') {
    requiredTokens.push(
      'backgroundCount=1',
      'foregroundCount=1',
      'protectedDataUnavailableCount=1',
      'protectedDataAvailableCount=1',
    );
  }
  const missing = requiredTokens.filter((token) => !passLine.includes(token));
  if (missing.length > 0) {
    throw new Error(`iOS simulator smoke pass line missing tokens: ${missing.join(', ')}\n${passLine}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    mode,
    simulator,
    bundleId,
    appPath,
    passLine,
    buildTail: tail(`${build.stdout}\n${build.stderr}`, 24),
  };
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Kessho iOS simulator ${mode} smoke passed (${reportPath})`);
  console.log(passLine);
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    mode,
    error: error?.stack || String(error),
  };
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error?.stack || String(error));
  process.exit(1);
});
