#!/usr/bin/env node
import fs from 'node:fs';

const text = fs.readFileSync('src/cloud/supabase.ts', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');

const required = [
  'export const CLOUD_PRESET_PAGE_SIZE = 24',
  'export const CLOUD_SEARCH_PAGE_SIZE = 20',
  'export const CLOUD_FEATURED_PAGE_SIZE = 10',
  'fetchCloudPresetPage(options?:',
  'fetchFeaturedPresetPage(options?:',
  'searchCloudPresetPage(query:',
  'parseCloudCreatedCursor(pageOptions.cursor)',
  'parseCloudPlaysCursor(pageOptions.cursor)',
  'getCloudPresetPlaysCursorFilter(cursor)',
  'plays.is.null',
  'writeCloudPresetListCache(cacheKey, page)',
  'nextCursor: page.nextCursor',
];

const forbidden = [
  'fetchCloudPresets(limit = 50)',
  '.limit(50)',
  '.limit(100)',
  '.limit(200)',
];

const failures = [];
for (const token of required) {
  if (!text.includes(token) && !packageJson.includes(token)) failures.push(`missing ${token}`);
}
for (const token of forbidden) {
  if (text.includes(token)) failures.push(`remove or justify ${token}`);
}

if (failures.length) {
  console.error('Cloud pagination guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud pagination guard passed.');
