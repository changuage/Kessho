export type PointCloudsPresetCandidate = {
  name: string;
};

/**
 * Resolve the Point Clouds startup preset without making the bundled runtime
 * depend on a cloud read. Direct-file embeds are authoritative; HTTP builds
 * prefer the latest cloud snapshot and then use the local materialized asset
 * when cloud configuration/auth/network access is unavailable.
 */
export async function resolvePointCloudsStartPreset<TPreset extends PointCloudsPresetCandidate>(options: {
  embeddedPreset?: TPreset;
  presetName: string;
  loadCloudPreset: () => Promise<TPreset | null>;
  loadBundledPreset: (name: string) => Promise<TPreset | null>;
}): Promise<TPreset | null> {
  if (options.embeddedPreset) return options.embeddedPreset;

  let cloudPreset: TPreset | null = null;
  try {
    cloudPreset = await options.loadCloudPreset();
  } catch {
    // Cloud startup is opportunistic for Point Clouds HTTP builds. A failed
    // cloud read must still leave the local materialized String Waves asset
    // available for offline/local computer testing.
  }
  if (cloudPreset) return cloudPreset;

  try {
    return await options.loadBundledPreset(options.presetName);
  } catch {
    return null;
  }
}
