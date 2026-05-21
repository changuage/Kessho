import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const webSupabase = read('src/cloud/supabase.ts');
const webApp = read('src/App.tsx');
const nativeService = read('KesshoNativeSwift/Kessho/Services/SupabaseService.swift');
const appState = read('KesshoNativeSwift/Kessho/State/AppState.swift');
const presetList = read('KesshoNativeSwift/Kessho/Views/PresetListView.swift');
const sliderState = read('KesshoNativeSwift/Kessho/State/SliderState.swift');
const infoPlist = read('KesshoNativeSwift/Kessho/Info.plist');
const packageSwift = read('KesshoNativeSwift/Package.swift');
const xcodeProject = read('KesshoNativeSwift/Kessho.xcodeproj/project.pbxproj');

for (const token of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  assert(webSupabase.includes(token), `Web Supabase integration should still expose ${token}`);
}
assert(
  webApp.includes('signInAnonymously'),
  'Web app should still use anonymous Supabase auth for cloud preset writes'
);

for (const token of [
  'struct SupabaseConfiguration',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  '/auth/v1/signup',
  '/rest/v1/rpc/',
  '/functions/v1/',
  'fetchCloudStatePresets',
  'fetchV2StatePresets',
  'fetchLegacyStatePresets',
  'preset_payloads_v2',
  'saveLegacyStatePreset',
  'Authorization',
  'apikey',
]) {
  assert(nativeService.includes(token), `Native Supabase service must keep parity hook: ${token}`);
}

assert(
  nativeService.includes('useUserToken: false') && nativeService.includes('useUserToken: true'),
  'Native Supabase service must support both public anon-key reads and authenticated writes/calls'
);

for (const token of [
  'KesshoSupabaseURL',
  'KesshoSupabaseAnonKey',
  '$(VITE_SUPABASE_URL)',
  '$(VITE_SUPABASE_ANON_KEY)',
]) {
  assert(infoPlist.includes(token), `Info.plist must expose native Supabase config: ${token}`);
}

assert(
  packageSwift.includes('"Services"'),
  'Swift Package target must keep Services included so SupabaseService builds for macOS'
);
assert(
  xcodeProject.includes('SupabaseService.swift in Sources'),
  'Xcode project must compile SupabaseService.swift for iOS'
);

for (const token of [
  '@Published var cloudPresets',
  'let supabaseService = SupabaseService()',
  'refreshCloudPresets',
  'loadCloudPreset',
  'saveCurrentAsCloudPreset',
]) {
  assert(appState.includes(token), `AppState must wire native cloud preset parity: ${token}`);
}

for (const token of [
  'Cloud Presets',
  'refreshCloudPresetsIfNeeded',
  'loadCloudPreset',
  'icloud.and.arrow.up',
  'saveCurrentAsCloudPreset',
]) {
  assert(presetList.includes(token), `Preset UI must expose native cloud parity: ${token}`);
}

for (const token of [
  'let remoteID: String?',
  'let library: String?',
  'func jsonRecord() throws -> SliderStateJSONRecord',
]) {
  assert(sliderState.includes(token), `SavedPreset/SliderState must round-trip cloud metadata: ${token}`);
}

console.log('Native Supabase parity checks passed');
