#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const pageAliases = read('src/ui/pages/pageAliases.ts');
const texturePage = read('src/ui/texture/TexturePage.tsx');
const app = read('src/App.tsx');
const dynamicsPage = read('src/ui/dynamics/DynamicsPage.tsx');
const helpCatalog = read('src/ui/sliderHelpCatalog.ts');
const helpOverlay = read('src/ui/SliderHelpOverlay.tsx');
const recordingTracks = read('src/audio/recordingTracks.ts');
const dynamicsControlSchema = read('src/ui/dynamics/dynamicsControlSchema.ts');
const buttonHelpCatalog = read('src/ui/buttonHelpCatalog.ts');

assert(
  pageAliases.includes("export type LegacySliderPageId = 'dynamics'") &&
    pageAliases.includes("return page === 'dynamics' ? 'texture' : page"),
  'normalizeSliderPageId must preserve legacy dynamics page ids and map them to texture.',
);
assert(
  texturePage.includes("export { default } from '../dynamics/DynamicsPage'"),
  'TexturePage must be a compatibility wrapper around the existing DynamicsPage implementation.',
);
assert(
  app.includes("const TexturePage = React.lazy(() => import('./ui/texture/TexturePage'))") &&
    app.includes("id: 'texture'") &&
    app.includes("label: 'Texture'") &&
    app.includes("activeTab === 'texture'"),
  'App must expose the advanced tab as Texture and render TexturePage.',
);
assert(
  !app.includes("id: 'dynamics'") &&
    !app.includes("activeTab === 'dynamics'") &&
    !app.includes("case 'dynamics'"),
  'App must not expose dynamics as an active page/tab id.',
);
assert(
  dynamicsPage.includes("page: 'texture'") &&
    dynamicsPage.includes('helpPage="texture"') &&
    !dynamicsPage.includes("page: 'dynamics'") &&
    !dynamicsPage.includes('helpPage="dynamics"'),
  'DynamicsPage must bind help surfaces to texture, not the legacy dynamics page id.',
);
assert(
  helpOverlay.includes('normalizeSliderPageId') &&
    helpOverlay.includes("case 'texture'") &&
    helpOverlay.includes("return 'Texture'"),
  'Slider help overlay must normalize legacy dynamics page ids and display Texture.',
);
assert(
  helpCatalog.includes('routingMatrixTextureColumn') &&
    helpCatalog.includes('Texture Column') &&
    helpCatalog.includes("'Opens the Texture page.'") &&
    !helpCatalog.includes('routingMatrixDynamicsColumn'),
  'Help catalog must use Texture for routing/page labels.',
);
assert(
  recordingTracks.includes("dynamics: 'Texture'"),
  'Stem recording label for the persisted dynamics tap must display Texture.',
);
assert(
  dynamicsControlSchema.includes("helpPage: 'texture'") &&
    !dynamicsControlSchema.includes("helpPage: 'dynamics'") &&
    buttonHelpCatalog.includes("surface('texture'") &&
    !buttonHelpCatalog.includes("surface('dynamics'"),
  'Help surfaces must use the Texture page id, with dynamics reserved for persisted state keys.',
);

if (failures.length > 0) {
  console.error('Texture naming audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Texture naming audit passed.');
