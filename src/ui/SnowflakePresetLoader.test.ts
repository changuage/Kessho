import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const debugPanel = readFileSync(new URL('../app/AppDebugPanel.tsx', import.meta.url), 'utf8');
const snowflake = readFileSync(new URL('./SnowflakeUI.tsx', import.meta.url), 'utf8');
const globalRuntimePanel = readFileSync(new URL('./global/GlobalRuntimeComparisonPanel.tsx', import.meta.url), 'utf8');

assert.match(app, /<SnowflakePresetLoader[\s\S]*?presets=\{savedPresets\}/, 'Advanced must use the shared Snowflake preset loader');
assert.match(snowflake, /<SnowflakePresetLoader/, 'Snowflake must use the shared preset loader');
assert.match(debugPanel, /<ProductRuntimeSwitch/, 'the runtime selector must live in Debug Info');
assert.doesNotMatch(app, /<ProductRuntimeSwitch/, 'the runtime selector must not remain in the top controls');
assert.doesNotMatch(globalRuntimePanel, /<ProductRuntimeSwitch/, 'the runtime selector must have only one home');
