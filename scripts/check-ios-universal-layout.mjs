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

const project = read('KesshoiOS/Kessho.xcodeproj/project.pbxproj');
const infoPlist = read('KesshoiOS/Kessho/Info.plist');
const mainView = read('KesshoiOS/Kessho/Views/MainView.swift');
const macComponents = read('KesshoiOS/Kessho/Platform/KesshoMacComponents.swift');

const targetFamilyMatches = project.match(/TARGETED_DEVICE_FAMILY = "?1,2"?/g) ?? [];
assert(
  targetFamilyMatches.length >= 2,
  'Kessho target must stay universal with TARGETED_DEVICE_FAMILY = 1,2 for Debug and Release'
);

assert(
  infoPlist.includes('UISupportedInterfaceOrientations') &&
    infoPlist.includes('UISupportedInterfaceOrientations~ipad'),
  'Info.plist must keep both iPhone and iPad orientation declarations'
);

assert(
  infoPlist.includes('<string>audio</string>'),
  'Info.plist must keep background audio mode enabled'
);

for (const token of [
  'horizontalSizeClass',
  'usesWideLayout',
  'compactContent',
  'wideContent',
  'HStack(spacing: 0)',
  'SliderControlsView()',
]) {
  assert(mainView.includes(token), `MainView must keep adaptive iPhone/iPad layout token: ${token}`);
}

assert(
  mainView.includes('.tabViewStyle(.page(indexDisplayMode: .always))'),
  'MainView must keep the compact iPhone page flow'
);

for (const token of [
  'GeometryReader',
  'var pages: [KesshoMacPage] = KesshoMacPage.allCases',
  'let tabWidth = min(112, max(82, fittedWidth))',
]) {
  assert(macComponents.includes(token), `Mac/iOS native page tabs must stay adaptive and expose all web-parity pages: ${token}`);
}

console.log('iOS universal target and adaptive layout checks passed');
