import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function functionBody(text, name) {
  const marker = text.indexOf(`${name}(`);
  if (marker < 0) return '';
  const brace = text.indexOf('{', marker);
  if (brace < 0) return '';
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(brace, index + 1);
    }
  }
  return '';
}

const cloud = read('src/cloud/supabase.ts');
const store = read('src/presets/SupabasePresetStore.ts');
const failures = [];

for (const token of [
  'parseCloudCreatedCursor',
  'parseCloudPlaysCursor',
  'UUID_RE',
  'Date.parse(parsed.created_at)',
  'Math.max(0, Math.floor(parsed.plays))',
]) {
  if (!cloud.includes(token)) failures.push(`missing ${token}`);
}

const browseBody = functionBody(cloud, 'fetchCloudPresetPage');
if (!browseBody.includes('parseCloudCreatedCursor(pageOptions.cursor)')) {
  failures.push('fetchCloudPresetPage must parse created_at cursors through parseCloudCreatedCursor');
}
for (const name of ['fetchFeaturedPresetPage', 'searchCloudPresetPage']) {
  const body = functionBody(cloud, name);
  if (!body.includes('parseCloudPlaysCursor(pageOptions.cursor)')) {
    failures.push(`${name} must parse plays cursors through parseCloudPlaysCursor`);
  }
}

for (const forbidden of [
  'decodeCloudPresetCursor(pageOptions.cursor)',
  'JSON.parse(atob(cursor))',
  'JSON.parse(globalThis.atob(cursor))',
]) {
  if (cloud.includes(forbidden)) failures.push(`forbidden raw cursor path: ${forbidden}`);
}

for (const token of [
  'const PRESET_LIBRARY_INITIAL_PAGE_SIZE = 24',
  'export const PRESET_LIBRARY_MANAGEMENT_PAGE_SIZE = 50',
]) {
  if (!store.includes(token)) failures.push(`missing list budget token: ${token}`);
}
for (const name of ['listLegacy', 'listV2']) {
  const body = functionBody(store, name);
  if (!body.includes('.limit(PRESET_LIBRARY_INITIAL_PAGE_SIZE)')) {
    failures.push(`${name} must use PRESET_LIBRARY_INITIAL_PAGE_SIZE for runtime fresh-load list queries`);
  }
  if (body.includes('.limit(PRESET_LIBRARY_MANAGEMENT_PAGE_SIZE)') || body.includes('.limit(50)')) {
    failures.push(`${name} must not use a 50-row management/admin budget for runtime fresh-load list queries`);
  }
}

if (failures.length) {
  console.error('Cloud cursor/list budget guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud cursor/list budget guard passed.');
