#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js|jsx|swift)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const cpuOverlay = read('src/ui/CpuOverlay.tsx');
for (const token of [
  'const [visible, setVisible] = useState(false)',
  'setPerfMonitorEnabled(visible && documentVisible)',
  'setPerfUpdateCallback(null)',
  'PRODUCT_CPU_OVERLAY_REFRESH_MS',
]) {
  if (!cpuOverlay.includes(token)) {
    failures.push(`src/ui/CpuOverlay.tsx: CPU overlay must remain opt-in, visibility-gated, and rate-limited; missing ${token}`);
  }
}

const telemetryLimits = read('src/ui/productRuntimeTelemetryRateLimits.ts');
for (const token of [
  'PRODUCT_CPU_OVERLAY_REFRESH_MS',
  'PRODUCT_RUNTIME_TELEMETRY_INTERVAL_MS',
  'PRODUCT_VISUAL_TELEMETRY_HIDDEN_INTERVAL_MS',
]) {
  if (!telemetryLimits.includes(token)) {
    failures.push(`src/ui/productRuntimeTelemetryRateLimits.ts: missing mobile-safe telemetry constant ${token}`);
  }
}

const appSource = read('src/App.tsx');
const responsiveShell = read('src/app/useAppResponsiveShell.ts');
for (const token of [
  'useAppResponsiveShell()',
  'mobileStyleOverrides: m',
  '<AppDebugPanel',
]) {
  if (!appSource.includes(token)) {
    failures.push(`src/App.tsx: App responsive/mobile shell must stay centralized through useAppResponsiveShell; missing ${token}`);
  }
}
for (const [pattern, description] of [
  [/window\.addEventListener\(['"]resize['"]/, 'direct resize listener'],
  [/window\.innerWidth\s*<\s*768/, 'direct mobile width threshold'],
  [/useIsMobileViewport/, 'direct mobile viewport hook import/use'],
  [/className=["']app-debug-panel["']/, 'inline debug panel markup'],
]) {
  if (pattern.test(appSource)) {
    failures.push(`src/App.tsx: App must not reintroduce ${description}; use src/app/useAppResponsiveShell.ts instead`);
  }
}
for (const token of [
  'useIsMobileViewport()',
  'createMobileStyleOverrides',
  'useState<Set<string>>',
]) {
  if (!responsiveShell.includes(token)) {
    failures.push(`src/app/useAppResponsiveShell.ts: centralized mobile shell policy missing ${token}`);
  }
}
const appDebugPanel = read('src/app/AppDebugPanel.tsx');
for (const token of [
  'className="app-debug-panel"',
  'formatNativeProductStatus',
  'Product Core',
]) {
  if (!appDebugPanel.includes(token)) {
    failures.push(`src/app/AppDebugPanel.tsx: centralized debug panel missing ${token}`);
  }
}

const nativeBridgePackage = read('native/KesshoNativeBridge/Sources/KesshoNativeBridge/KesshoNativeBridge.swift');
for (const token of [
  'KesshoNativeBridgePolicy',
  'defaultKesshoPolicy',
  'KesshoNativeLifecyclePolicy',
  'throttleVisualTelemetry',
  'maxOptionsBytes',
  'KesshoMidiRouting',
  'KesshoAudioSession',
]) {
  if (!nativeBridgePackage.includes(token)) {
    failures.push(`native/KesshoNativeBridge: shared native bridge validation is missing ${token}`);
  }
}

const iosAudioSessionPackage = read('plugins/kessho-capacitor-audio-session/Package.swift');
const iosAudioSessionCoordinator = read('plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSAudioSessionCoordinator.swift');
for (const token of [
  'KesshoNativeBridge',
  'KesshoNativeLifecycleEvent.didEnterBackground.rawValue',
  'KesshoNativeLifecyclePolicy.policy(',
  'throttleVisualTelemetry',
  'nativeLifecyclePolicy',
]) {
  if (!`${iosAudioSessionPackage}\n${iosAudioSessionCoordinator}`.includes(token)) {
    failures.push(`plugins/kessho-capacitor-audio-session: iOS lifecycle policy must use shared native bridge vocabulary; missing ${token}`);
  }
}

const macosPackage = read('CapacitorMac/Package.swift');
const macosApp = read('CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift');
for (const token of [
  'KesshoNativeBridge',
  'KesshoNativeBridgePolicy.defaultKesshoPolicy.validate(body: body)',
]) {
  if (!`${macosPackage}\n${macosApp}`.includes(token)) {
    failures.push(`CapacitorMac: macOS bridge must consume shared native bridge validation; missing ${token}`);
  }
}

for (const file of [...walk('CapacitorMac'), ...walk('ios')]) {
  const source = read(file);
  if (/isInspectable\s*=\s*true/.test(source) && !/#if\s+DEBUG/.test(source)) {
    failures.push(`${file}: WebKit inspection must be DEBUG-gated`);
  }
}

for (const file of walk('src')) {
  const source = read(file);
  if (/VITE_KESSHO_.*DEBUG|DEBUG_OVERLAYS|BRIDGE_INSPECTOR/.test(source) && !/debug|diagnostic|policy|RuntimePerformancePolicy/i.test(file)) {
    failures.push(`${file}: debug env checks must stay centralized in debug/diagnostic policy modules`);
  }
}

if (failures.length) {
  console.error('Mobile/debug policy violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile/debug policy checks passed');
