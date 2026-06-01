import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-audio-session-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(source, token, label, failures) {
  if (!source.includes(token)) failures.push(`${label} missing ${token}`);
}

const failures = [];
const pluginPath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift';
const coordinatorPath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSAudioSessionCoordinator.swift';
const rendererPath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSProductAudioRenderer.swift';
const infoPlistPath = 'ios/App/App/Info.plist';
const plugin = read(pluginPath);
const coordinator = read(coordinatorPath);
const renderer = read(rendererPath);
const infoPlist = read(infoPlistPath);

for (const token of [
  'IOSAudioSessionCoordinator',
  'IOSProductAudioRenderer',
  'getIOSAudioSessionTelemetry',
  'AVAudioSession.routeChangeNotification',
  'AVAudioSession.interruptionNotification',
  'AVAudioSession.mediaServicesWereResetNotification',
  'iosAudioSessionTelemetry',
]) {
  assertIncludes(plugin, token, pluginPath, failures);
}

for (const token of [
  'setCategory(.playback',
  'setPreferredSampleRate',
  'setPreferredIOBufferDuration',
  'actualSampleRate',
  'actualBufferDurationMs',
  'routeSummary',
  'silentSwitchPolicy',
  'UIApplication.didEnterBackgroundNotification',
  'UIApplication.willEnterForegroundNotification',
  'protectedDataWillBecomeUnavailableNotification',
]) {
  assertIncludes(coordinator, token, coordinatorPath, failures);
}

for (const token of [
  'final class IOSProductAudioRenderer',
  'configure(sampleRate:',
  'enqueueProductEvent',
  'handleInterruptionBegan',
  'handleInterruptionEnded',
  'handleRouteChange',
  'NativeRendererTelemetry',
]) {
  assertIncludes(renderer, token, rendererPath, failures);
}

if (!/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*<string>audio<\/string>[\s\S]*<\/array>/.test(infoPlist)) {
  failures.push(`${infoPlistPath} missing UIBackgroundModes audio`);
}

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  evidenceMode: 'static',
  physicalDeviceEvidenceClaimed: false,
  checkedFiles: [pluginPath, coordinatorPath, rendererPath, infoPlistPath],
  requestedPolicy: {
    category: 'playback',
    preferredSampleRate: 48000,
    preferredBufferFrames: 128,
    actualValuesRequireDeviceRuntime: true,
  },
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS audio session check passed (static)');
