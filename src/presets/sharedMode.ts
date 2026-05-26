// Temporary shared preset testing mode.
// When enabled, presets use the cloud store as the single source of truth,
// and all saves are public.

export const SHARED_PRESET_TEST_MODE = true;

// Shared mode still needs manual cleanup while the preset library is curated
// by one maintainer.
export const PRESET_DELETE_ENABLED = true;

export function isLocalPresetStoreOverride(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('localPresets') === '1';
}

export function isSharedPresetCloudOnlyMode(): boolean {
  return SHARED_PRESET_TEST_MODE && !isLocalPresetStoreOverride();
}
