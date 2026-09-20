/**
 * Canonical control vocabulary for the Transport Field renderer.
 *
 * This file deliberately contains data only.  It does not know about React,
 * audio signal plumbing, persistence, DOM elements, or a rendering context.
 */

export const TRANSPORT_CONTROL_KEYS = [
  'medium', 'hybrid', 'motion', 'react',
  'fieldScale', 'octaves', 'churn', 'drift', 'hierarchy', 'flutter', 'aniso',
  'direction', 'dirSpread', 'coverage', 'layers', 'parallax', 'swell', 'capillary',
  'leafAmount', 'gapAmount', 'focusBreath', 'clusterSway', 'leafTiers', 'leafDepth',
  'leafCount', 'leafSize', 'leafSoft', 'leafOpacity', 'leafStretch', 'leafSway', 'leafVary',
  'apShape', 'apW', 'apH', 'apX', 'apY', 'apRot', 'apRadius', 'apSoft', 'apBars', 'apBarW', 'apSpill',
  'sunAngle', 'sunTaps', 'throwZ', 'ior', 'focusGain', 'waterBrilliance', 'waterLayering',
  'causticCoherence', 'causticScale', 'causticDetail', 'foldClamp', 'dispersion', 'exposure',
  'substrate', 'subScale', 'albedo', 'skyFill', 'warmth', 'tilt', 'fresnel',
  'foldType', 'foldBlend', 'segments', 'spin', 'foldZoom', 'foldOffX', 'foldOffY', 'foldTwist',
  'bloom', 'bloomThr', 'chroma', 'grain', 'vignette', 'contrast', 'saturation',
] as const;

export type TransportControlKey = typeof TRANSPORT_CONTROL_KEYS[number];

export type TransportControls = {
  [K in TransportControlKey]: number;
};

export type ReadonlyTransportControls = Readonly<TransportControls>;

export interface TransportControlDefinition {
  readonly key: TransportControlKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly step?: number;
  readonly options?: readonly string[];
  readonly poles?: readonly [string, string];
}

export interface TransportControlGroup {
  readonly id: string;
  readonly label: string;
  readonly tag?: string;
  readonly open?: boolean;
  readonly note?: string;
  readonly controls: readonly TransportControlDefinition[];
}

export const TRANSPORT_MASTER_CONTROLS: readonly TransportControlDefinition[] = [
  { key: 'medium', label: 'Medium', min: -1, max: 1, defaultValue: -1, poles: ['komorebi · occlude', 'water · refract'] },
  { key: 'hybrid', label: 'Both', min: 0, max: 1, defaultValue: 0, poles: ['crossfade', 'stacked'] },
  { key: 'motion', label: 'Motion', min: 0, max: 1.5, defaultValue: 0.34 },
  { key: 'react', label: 'Audio intensity', min: 0, max: 2, defaultValue: 0.55 },
];

export const TRANSPORT_CONTROL_GROUPS: readonly TransportControlGroup[] = [
  {
    id: 'field',
    label: 'A · Field',
    tag: 'the matter',
    open: true,
    note: 'Shared multi-scale matter field. Existing topology-changing behaviour remains available.',
    controls: [
      { key: 'fieldScale', label: 'Scale', min: 1, max: 14, defaultValue: 5.5, poles: ['coarse', 'fine'] },
      { key: 'octaves', label: 'Octaves', min: 1, max: 4, defaultValue: 3, step: 1 },
      { key: 'churn', label: 'Churn', min: 0, max: 1, defaultValue: 0.34, poles: ['frozen', 'topology'] },
      { key: 'drift', label: 'Drift', min: 0, max: 1, defaultValue: 0.26, poles: ['still', 'wind'] },
      { key: 'hierarchy', label: 'Hierarchy', min: 0, max: 1, defaultValue: 0.58 },
      { key: 'flutter', label: 'Flutter', min: 0, max: 1, defaultValue: 0.38 },
      { key: 'aniso', label: 'Anisotropy', min: 0, max: 1, defaultValue: 0.26 },
      { key: 'direction', label: 'Direction', min: 0, max: 6.283, defaultValue: 0.7 },
      { key: 'dirSpread', label: 'Dir spread', min: 0, max: 2, defaultValue: 0.55 },
      { key: 'coverage', label: 'Coverage', min: 0, max: 0.9, defaultValue: 0.55 },
      { key: 'layers', label: 'Depth layers', min: 1, max: 3, defaultValue: 2, step: 1 },
      { key: 'parallax', label: 'Parallax', min: 0, max: 1, defaultValue: 0.45 },
      { key: 'swell', label: 'Swell', min: 0, max: 1, defaultValue: 0, poles: ['flat', 'wave trains'] },
      { key: 'capillary', label: 'Capillary', min: 0, max: 1, defaultValue: 0.24, poles: ['smooth', 'shimmer'] },
    ],
  },
  {
    id: 'canopy',
    label: 'A2 · Projected Canopy',
    tag: 'shadows + solar gaps',
    note: 'The existing leaf-disc primitive is generalized: legacy dark foliage stays intact, while the same persistent geometry can also create bright projected solar discs, correlated cluster sway, and focus breathing.',
    controls: [
      { key: 'leafAmount', label: 'Shadow amount', min: 0, max: 1, defaultValue: 0 },
      { key: 'gapAmount', label: 'Solar gaps', min: 0, max: 1, defaultValue: 0, poles: ['off', 'projected discs'] },
      { key: 'focusBreath', label: 'Focus breath', min: 0, max: 1, defaultValue: 0, poles: ['fixed', 'in / out'] },
      { key: 'clusterSway', label: 'Cluster sway', min: 0, max: 1, defaultValue: 0, poles: ['independent', 'branch-like'] },
      { key: 'leafTiers', label: 'Depth tiers', min: 1, max: 3, defaultValue: 2, step: 1 },
      { key: 'leafDepth', label: 'Depth spread', min: 0, max: 1, defaultValue: 0.62 },
      { key: 'leafCount', label: 'Count', min: 0.4, max: 9, defaultValue: 1.6 },
      { key: 'leafSize', label: 'Size', min: 0.08, max: 0.85, defaultValue: 0.55 },
      { key: 'leafSoft', label: 'Penumbra', min: 0.01, max: 1, defaultValue: 0.34 },
      { key: 'leafOpacity', label: 'Opacity', min: 0.05, max: 1, defaultValue: 0.45 },
      { key: 'leafStretch', label: 'Elongation', min: 0, max: 1, defaultValue: 0.2 },
      { key: 'leafSway', label: 'Local sway', min: 0, max: 1, defaultValue: 0.22 },
      { key: 'leafVary', label: 'Variation', min: 0, max: 1, defaultValue: 0.6 },
    ],
  },
  {
    id: 'aperture',
    label: 'Aperture',
    tag: 'the window',
    controls: [
      { key: 'apShape', label: 'Shape', min: 0, max: 3, defaultValue: 0, step: 1, options: ['none', 'rect', 'oval', 'arch'] },
      { key: 'apW', label: 'Width', min: 0.04, max: 2.2, defaultValue: 0.5 },
      { key: 'apH', label: 'Height', min: 0.04, max: 2.2, defaultValue: 0.62 },
      { key: 'apX', label: 'Offset X', min: -1.6, max: 1.6, defaultValue: 0 },
      { key: 'apY', label: 'Offset Y', min: -1.6, max: 1.6, defaultValue: 0 },
      { key: 'apRot', label: 'Rotation', min: -0.7, max: 0.7, defaultValue: 0 },
      { key: 'apRadius', label: 'Corner', min: 0, max: 0.6, defaultValue: 0.02 },
      { key: 'apSoft', label: 'Edge penumbra', min: 0.002, max: 0.35, defaultValue: 0.02 },
      { key: 'apBars', label: 'Mullions', min: 0, max: 4, defaultValue: 0, step: 1 },
      { key: 'apBarW', label: 'Mullion width', min: 0, max: 0.1, defaultValue: 0.03 },
      { key: 'apSpill', label: 'Spill', min: 0, max: 1, defaultValue: 0.1 },
    ],
  },
  {
    id: 'transport',
    label: 'B · Transport',
    tag: 'the optics',
    open: true,
    note: 'Caustic Structure biases the spectral hierarchy of the existing field. Water layering separates macro lensing, primary cells, secondary folds and micro shimmer at the optical stage instead of summing them into one displacement. Water brilliance controls reflected/focused intensity.',
    controls: [
      { key: 'sunAngle', label: 'Sun angle θ', min: 0.002, max: 0.05, defaultValue: 0.014 },
      { key: 'sunTaps', label: 'Disc taps', min: 3, max: 12, defaultValue: 8, step: 1 },
      { key: 'throwZ', label: 'Throw / depth', min: 0.05, max: 1.4, defaultValue: 0.55 },
      { key: 'ior', label: 'Index η', min: 1, max: 1.7, defaultValue: 1.33 },
      { key: 'focusGain', label: 'Focus gain', min: 0, max: 2.5, defaultValue: 0.95 },
      { key: 'waterBrilliance', label: 'Water brilliance', min: 0, max: 1, defaultValue: 1, poles: ['muted', 'reflective'] },
      { key: 'waterLayering', label: 'Water layering', min: 0, max: 1, defaultValue: 0, poles: ['single field', 'multi-layer'] },
      { key: 'causticCoherence', label: 'Caustic structure', min: 0, max: 1, defaultValue: 0, poles: ['micro field', 'broad cells'] },
      { key: 'causticScale', label: 'Caustic scale', min: 0.25, max: 1.25, defaultValue: 0.6, poles: ['broad', 'fine'] },
      { key: 'causticDetail', label: 'Caustic detail', min: 0, max: 1, defaultValue: 0.15, poles: ['clean folds', 'micro folds'] },
      { key: 'foldClamp', label: 'Fold clamp', min: 0.02, max: 1, defaultValue: 0.3 },
      { key: 'dispersion', label: 'Dispersion', min: 0, max: 1, defaultValue: 0.22 },
      { key: 'exposure', label: 'Exposure', min: 0, max: 4, defaultValue: 2.1 },
    ],
  },
  {
    id: 'receiver',
    label: 'Receiver',
    tag: 'wall / bed',
    controls: [
      { key: 'substrate', label: 'Substrate', min: 0, max: 1, defaultValue: 0, poles: ['plaster', 'sand'] },
      { key: 'subScale', label: 'Grain scale', min: 0.3, max: 3, defaultValue: 1 },
      { key: 'albedo', label: 'Albedo', min: 0.1, max: 1, defaultValue: 0.82 },
      { key: 'skyFill', label: 'Sky fill', min: 0, max: 1, defaultValue: 0.3 },
      { key: 'warmth', label: 'Warmth', min: 0, max: 1, defaultValue: 0.42 },
      { key: 'tilt', label: 'Perspective', min: 0, max: 1, defaultValue: 0 },
      { key: 'fresnel', label: 'Surface sheen', min: 0, max: 1, defaultValue: 0.16 },
    ],
  },
  {
    id: 'fold',
    label: 'C · Fold',
    tag: 'prism / symmetry',
    controls: [
      { key: 'foldType', label: 'Fold', min: 0, max: 4, defaultValue: 0, step: 1, options: ['none', 'mirror', 'rotate', 'droste', 'invert'] },
      { key: 'foldBlend', label: 'Fold amount', min: 0, max: 1, defaultValue: 0 },
      { key: 'segments', label: 'Segments', min: 2, max: 24, defaultValue: 6 },
      { key: 'spin', label: 'Spin', min: -1, max: 1, defaultValue: 0.12 },
      { key: 'foldZoom', label: 'Zoom', min: 0.3, max: 2.4, defaultValue: 1 },
      { key: 'foldOffX', label: 'Centre X', min: -1, max: 1, defaultValue: 0 },
      { key: 'foldOffY', label: 'Centre Y', min: -1, max: 1, defaultValue: 0 },
      { key: 'foldTwist', label: 'Twist', min: 0, max: 1, defaultValue: 0.4 },
    ],
  },
  {
    id: 'post',
    label: 'Post',
    tag: 'grade',
    controls: [
      { key: 'bloom', label: 'Bloom', min: 0, max: 1.6, defaultValue: 0.5 },
      { key: 'bloomThr', label: 'Bloom thresh', min: 0.1, max: 2, defaultValue: 1 },
      { key: 'chroma', label: 'Aberration', min: 0, max: 1, defaultValue: 0.13 },
      { key: 'grain', label: 'Grain', min: 0, max: 1, defaultValue: 0.32 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 1, defaultValue: 0.42 },
      { key: 'contrast', label: 'Contrast', min: 0, max: 1, defaultValue: 0.5 },
      { key: 'saturation', label: 'Saturation', min: 0, max: 1.6, defaultValue: 1 },
    ],
  },
];

export const TRANSPORT_CONTROL_DEFINITIONS: readonly TransportControlDefinition[] = Object.freeze([
  ...TRANSPORT_MASTER_CONTROLS,
  ...TRANSPORT_CONTROL_GROUPS.flatMap(group => group.controls),
]);

export const TRANSPORT_CONTROL_COUNT = TRANSPORT_CONTROL_DEFINITIONS.length;

const CONTROL_BY_KEY = new Map<TransportControlKey, TransportControlDefinition>(
  TRANSPORT_CONTROL_DEFINITIONS.map(definition => [definition.key, definition]),
);

export const TRANSPORT_DEFAULT_CONTROLS: ReadonlyTransportControls = Object.freeze(
  TRANSPORT_CONTROL_DEFINITIONS.reduce((controls, definition) => {
    controls[definition.key] = definition.defaultValue;
    return controls;
  }, {} as TransportControls),
);

export interface TransportPresetDefinition {
  readonly id: string;
  readonly name: string;
  readonly values: Readonly<Partial<TransportControls>>;
}

export const TRANSPORT_PRESETS: readonly TransportPresetDefinition[] = [
  {
    id: 'window-soft-leaf-shadows',
    name: 'window · soft leaf shadows',
    values: { medium: -1, hybrid: 0, motion: 0.26, react: 0.45, coverage: 0, layers: 1, fieldScale: 4, sunAngle: 0.014, sunTaps: 3, throwZ: 0.5, exposure: 2.8, leafAmount: 1, leafTiers: 3, leafDepth: 0.7, leafCount: 1.25, leafSize: 0.5, leafSoft: 0.26, leafOpacity: 0.9, leafStretch: 0.15, leafSway: 0.2, leafVary: 0.55, apShape: 1, apW: 0.5, apH: 0.64, apX: 0.06, apY: 0.02, apRot: 0.04, apRadius: 0.02, apSoft: 0.018, apBars: 0, apBarW: 0.03, apSpill: 0.12, substrate: 0, subScale: 1.2, albedo: 0.92, skyFill: 0.5, warmth: 0.62, tilt: 0, fresnel: 0, foldType: 0, foldBlend: 0, bloom: 0.18, bloomThr: 1, chroma: 0.03, grain: 0.18, vignette: 0.16, contrast: 0.3, saturation: 0.3 },
  },
  {
    id: 'shoji-foliage-shadows',
    name: 'shoji · foliage shadows',
    values: { medium: -1, hybrid: 0, motion: 0.3, react: 0.5, coverage: 0.34, layers: 1, fieldScale: 7, churn: 0.34, drift: 0.24, hierarchy: 0.5, flutter: 0.36, aniso: 0.2, sunAngle: 0.012, sunTaps: 6, throwZ: 0.5, exposure: 2.5, leafAmount: 0.85, leafTiers: 2, leafDepth: 0.7, leafCount: 2, leafSize: 0.4, leafSoft: 0.22, leafOpacity: 0.6, leafStretch: 0.3, leafSway: 0.26, leafVary: 0.6, apShape: 1, apW: 0.72, apH: 0.78, apX: 0, apY: 0, apRot: 0, apRadius: 0.01, apSoft: 0.012, apBars: 3, apBarW: 0.035, apSpill: 0.08, substrate: 0, subScale: 1.1, albedo: 0.9, skyFill: 0.6, warmth: 0.55, bloom: 0.3, bloomThr: 1, grain: 0.2, vignette: 0.2, contrast: 0.2, saturation: 0.45 },
  },
  {
    id: 'canopy-diffuse-noon',
    name: 'canopy · diffuse noon',
    values: { medium: -1, hybrid: 0, motion: 0.3, react: 0.5, coverage: 0.6, fieldScale: 6, aniso: 0.28, dirSpread: 0.5, churn: 0.3, drift: 0.22, hierarchy: 0.6, flutter: 0.3, layers: 2, parallax: 0.5, swell: 0, capillary: 0.18, sunAngle: 0.014, sunTaps: 8, throwZ: 0.55, focusGain: 0.9, dispersion: 0.1, exposure: 2.6, substrate: 0, subScale: 1, albedo: 0.86, skyFill: 0.34, warmth: 0.36, tilt: 0, fresnel: 0, foldType: 0, foldBlend: 0, bloom: 0.42, bloomThr: 0.9, grain: 0.3, vignette: 0.4, contrast: 0.5, saturation: 0.95 },
  },
  {
    id: 'canopy-turbulent-wind',
    name: 'canopy · turbulent wind',
    values: { medium: -0.86, hybrid: 0, motion: 0.62, react: 0.9, coverage: 0.56, fieldScale: 7.2, aniso: 0.42, dirSpread: 0.8, churn: 0.62, drift: 0.56, hierarchy: 0.78, flutter: 0.72, layers: 2, parallax: 0.7, swell: 0, capillary: 0.3, sunAngle: 0.022, sunTaps: 6, throwZ: 0.62, focusGain: 0.85, dispersion: 0.14, exposure: 2.6, substrate: 0.1, skyFill: 0.42, warmth: 0.5, tilt: 0, fresnel: 0, foldType: 1, foldBlend: 0.12, segments: 5, spin: 0.08, bloom: 0.55, grain: 0.34, vignette: 0.44, saturation: 1 },
  },
  {
    id: 'wet-canopy-filament-mesh',
    name: 'wet canopy · filament mesh',
    values: { waterBrilliance: 1, medium: -0.18, hybrid: 0.4, motion: 0.38, react: 0.6, coverage: 0.5, fieldScale: 5.4, aniso: 0.34, dirSpread: 0.62, churn: 0.42, drift: 0.34, hierarchy: 0.6, flutter: 0.44, layers: 2, parallax: 0.45, swell: 0.34, capillary: 0.4, sunAngle: 0.016, sunTaps: 6, throwZ: 0.62, ior: 1.33, focusGain: 0.95, foldClamp: 0.3, dispersion: 0.3, exposure: 2.6, substrate: 0.5, subScale: 1.1, albedo: 0.78, skyFill: 0.36, warmth: 0.4, tilt: 0.22, fresnel: 0.2, foldType: 1, foldBlend: 0.18, segments: 6, spin: 0.1, bloom: 0.6, grain: 0.32, vignette: 0.42, saturation: 1.05 },
  },
  {
    id: 'tide-pool-fine-shimmer',
    name: 'tide pool · fine shimmer',
    values: { waterBrilliance: 1, medium: 0.62, hybrid: 0.16, motion: 0.42, react: 0.6, coverage: 0.26, fieldScale: 6.4, aniso: 0.5, dirSpread: 0.9, churn: 0.36, drift: 0.3, hierarchy: 0.44, flutter: 0.3, layers: 2, parallax: 0.3, swell: 0.44, capillary: 0.5, sunAngle: 0.0085, sunTaps: 5, throwZ: 0.72, ior: 1.33, focusGain: 1.15, foldClamp: 0.22, dispersion: 0.22, exposure: 2.5, substrate: 0.85, subScale: 1.3, albedo: 0.8, skyFill: 0.3, warmth: 0.4, tilt: 0.38, fresnel: 0.28, foldType: 0, foldBlend: 0, bloom: 0.6, bloomThr: 0.85, grain: 0.3, vignette: 0.4, saturation: 1.05 },
  },
  {
    id: 'water-micro-caustics',
    name: 'water · micro caustics',
    values: { waterBrilliance: 1, medium: 1, hybrid: 0, motion: 0.5, react: 0.7, coverage: 0.2, fieldScale: 7.6, aniso: 0.6, dirSpread: 1.1, churn: 0.34, drift: 0.34, hierarchy: 0.4, flutter: 0.34, layers: 1, parallax: 0.2, swell: 0.6, capillary: 0.56, sunAngle: 0.006, sunTaps: 4, throwZ: 0.8, ior: 1.34, focusGain: 1.25, foldClamp: 0.16, dispersion: 0.2, exposure: 2.3, substrate: 1, subScale: 1.4, albedo: 0.82, skyFill: 0.26, warmth: 0.34, tilt: 0.5, fresnel: 0.34, foldType: 0, foldBlend: 0, bloom: 0.72, bloomThr: 0.8, grain: 0.28, vignette: 0.38, saturation: 1.08 },
  },
  {
    id: 'prism-cathedral',
    name: 'prism cathedral',
    values: { waterBrilliance: 1, medium: 0.88, hybrid: 0.3, motion: 0.34, react: 0.7, coverage: 0.4, fieldScale: 6, aniso: 0.2, dirSpread: 0.5, churn: 0.3, drift: 0.2, hierarchy: 0.5, flutter: 0.3, layers: 2, parallax: 0.4, swell: 0.4, capillary: 0.4, sunAngle: 0.006, sunTaps: 5, throwZ: 0.7, ior: 1.42, focusGain: 1.05, foldClamp: 0.18, dispersion: 0.85, exposure: 2.3, substrate: 0.3, subScale: 0.9, albedo: 0.8, skyFill: 0.24, warmth: 0.2, tilt: 0.1, fresnel: 0.2, foldType: 1, foldBlend: 0.85, segments: 10, spin: 0.16, foldZoom: 1.1, foldTwist: 0.5, bloom: 0.95, bloomThr: 0.7, chroma: 0.3, grain: 0.26, vignette: 0.46, saturation: 1.15 },
  },
  {
    id: 'both-stacked',
    name: 'both · stacked',
    values: { waterBrilliance: 1, medium: 0, hybrid: 1, motion: 0.4, react: 0.65, coverage: 0.5, fieldScale: 6, aniso: 0.36, dirSpread: 0.7, churn: 0.44, drift: 0.36, hierarchy: 0.62, flutter: 0.48, layers: 2, parallax: 0.5, swell: 0.42, capillary: 0.42, sunAngle: 0.013, sunTaps: 6, throwZ: 0.66, ior: 1.36, focusGain: 1, foldClamp: 0.24, dispersion: 0.34, exposure: 2.7, substrate: 0.55, subScale: 1.1, albedo: 0.8, skyFill: 0.32, warmth: 0.4, tilt: 0.24, fresnel: 0.22, foldType: 2, foldBlend: 0.28, segments: 8, spin: -0.12, bloom: 0.68, grain: 0.3, vignette: 0.42, saturation: 1.05 },
  },
  {
    id: 'window-projected-komorebi',
    name: 'window · projected komorebi',
    values: { medium: -1, hybrid: 0, motion: 0.48, react: 0, fieldScale: 3.3, octaves: 2, churn: 0.1, drift: 0.22, hierarchy: 0.42, flutter: 0.08, coverage: 0.67, layers: 3, parallax: 0.72, capillary: 0, leafAmount: 0.2, gapAmount: 1, focusBreath: 0.78, clusterSway: 0.62, leafTiers: 3, leafDepth: 0.82, leafCount: 1.25, leafSize: 0.48, leafSoft: 0.28, leafOpacity: 0.28, leafSway: 0.28, leafVary: 0.55, apShape: 1, apW: 0.53, apH: 0.68, apX: 0.04, apY: 0.02, apRot: 0.025, apSoft: 0.018, apSpill: 0.01, sunAngle: 0.032, sunTaps: 12, throwZ: 0.92, exposure: 2.15, substrate: 0, subScale: 0.85, albedo: 0.88, skyFill: 0.34, warmth: 0.46, bloom: 0.18, grain: 0.06, vignette: 0.12, contrast: 0.26, saturation: 0.72 },
  },
  {
    id: 'komorebi-layered-breeze',
    name: 'komorebi · layered breeze',
    values: { medium: -1, hybrid: 0, motion: 0.62, react: 0.45, fieldScale: 3.7, octaves: 2, churn: 0.12, drift: 0.3, hierarchy: 0.48, flutter: 0.12, coverage: 0.64, layers: 3, parallax: 0.82, leafAmount: 0.28, gapAmount: 0.85, focusBreath: 0.62, clusterSway: 0.82, leafTiers: 3, leafDepth: 0.85, leafCount: 1.45, leafSize: 0.44, leafSoft: 0.24, leafOpacity: 0.32, leafSway: 0.42, leafVary: 0.6, sunAngle: 0.028, sunTaps: 12, throwZ: 0.88, exposure: 2.2, substrate: 0, albedo: 0.88, skyFill: 0.36, warmth: 0.5, bloom: 0.22, grain: 0.08, vignette: 0.16, contrast: 0.3, saturation: 0.8 },
  },
  {
    id: 'water-broad-caustics',
    name: 'water · broad caustics',
    values: { waterBrilliance: 0.58, medium: 1, hybrid: 0, motion: 0.42, react: 0, fieldScale: 3.2, octaves: 2, churn: 0.07, drift: 0.11, hierarchy: 0.35, flutter: 0.035, aniso: 0.12, dirSpread: 1.1, swell: 0.28, capillary: 0.045, causticCoherence: 1, causticScale: 0.55, causticDetail: 0.11, sunAngle: 0.0055, sunTaps: 7, throwZ: 1, ior: 1.33, focusGain: 0.34, foldClamp: 0.15, dispersion: 0.01, exposure: 1.35, substrate: 0.4, subScale: 0.65, albedo: 0.8, skyFill: 0.22, warmth: 0.72, tilt: 0.18, fresnel: 0.03, bloom: 0.015, bloomThr: 1, chroma: 0, grain: 0.01, vignette: 0.12, contrast: 0.12, saturation: 0.72 },
  },
  {
    id: 'water-slow-shallows',
    name: 'water · slow shallows',
    values: { waterBrilliance: 0.42, medium: 1, hybrid: 0, motion: 0.28, react: 0.35, fieldScale: 2.9, octaves: 2, churn: 0.045, drift: 0.08, hierarchy: 0.12, flutter: 0.025, aniso: 0.2, dirSpread: 0.68, swell: 0.78, capillary: 0.03, causticCoherence: 1, causticScale: 0.4, causticDetail: 0.045, sunAngle: 0.007, sunTaps: 8, throwZ: 0.96, ior: 1.33, focusGain: 0.5, foldClamp: 0.2, dispersion: 0.008, exposure: 1.62, substrate: 0.25, subScale: 0.58, albedo: 0.84, skyFill: 0.07, warmth: 0.5, tilt: 0.12, fresnel: 0.05, bloom: 0.05, grain: 0.015, vignette: 0.1, contrast: 0.3, saturation: 0.8 },
  },
  {
    id: 'water-muted-shallows',
    name: 'water · muted shallows',
    values: { waterBrilliance: 0.22, medium: 1, hybrid: 0, motion: 0.3, react: 0.2, fieldScale: 3.05, octaves: 2, churn: 0.05, drift: 0.09, hierarchy: 0.14, flutter: 0.025, aniso: 0.2, dirSpread: 0.72, swell: 0.72, capillary: 0.025, causticCoherence: 1, causticScale: 0.42, causticDetail: 0.05, sunAngle: 0.008, sunTaps: 8, throwZ: 0.92, ior: 1.33, focusGain: 0.46, foldClamp: 0.22, dispersion: 0.004, exposure: 1.7, substrate: 0.22, subScale: 0.58, albedo: 0.84, skyFill: 0.09, warmth: 0.52, tilt: 0.12, fresnel: 0.07, bloom: 0.025, grain: 0.01, vignette: 0.08, contrast: 0.24, saturation: 0.76 },
  },
  {
    id: 'water-layered-shallows',
    name: 'water · layered shallows',
    values: { waterBrilliance: 0.24, waterLayering: 0.94, medium: 1, hybrid: 0, motion: 0.36, react: 0.12, fieldScale: 3.55, octaves: 3, churn: 0.035, drift: 0.055, hierarchy: 0.1, flutter: 0.012, aniso: 0.04, direction: 0.51, dirSpread: 1.31, swell: 0.16, capillary: 0.1, causticCoherence: 0.96, causticScale: 0.6, causticDetail: 0.31, sunAngle: 0.0068, sunTaps: 8, throwZ: 0.98, ior: 1.33, focusGain: 0.57, foldClamp: 0.2, dispersion: 0.002, exposure: 1.68, substrate: 0.14, subScale: 0.43, albedo: 0.87, skyFill: 0.07, warmth: 0.5, tilt: 0.07, fresnel: 0.035, bloom: 0.022, bloomThr: 1.08, chroma: 0, grain: 0.004, vignette: 0.07, contrast: 0.24, saturation: 0.77 },
  },
] satisfies readonly TransportPresetDefinition[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeControlValue(definition: TransportControlDefinition, value: unknown): number {
  const numericValue = typeof value === 'number' && Number.isFinite(value)
    ? value
    : definition.defaultValue;
  const clamped = clamp(numericValue, definition.min, definition.max);
  return definition.step === 1 ? Math.round(clamped) : clamped;
}

export function normalizeTransportControls(value: unknown): TransportControls {
  const source = isRecord(value) ? value : {};
  const result = {} as TransportControls;
  for (const definition of TRANSPORT_CONTROL_DEFINITIONS) {
    result[definition.key] = normalizeControlValue(definition, source[definition.key]);
  }
  return result;
}

export function getTransportControlDefinition(key: TransportControlKey): TransportControlDefinition {
  return CONTROL_BY_KEY.get(key) as TransportControlDefinition;
}

export function getTransportPreset(idOrName: string): TransportPresetDefinition | undefined {
  return TRANSPORT_PRESETS.find(preset => preset.id === idOrName || preset.name === idOrName);
}

export function expandTransportPreset(preset: TransportPresetDefinition): TransportControls;
export function expandTransportPreset(idOrName: string): TransportControls | null;
export function expandTransportPreset(presetOrId: TransportPresetDefinition | string): TransportControls | null {
  const preset = typeof presetOrId === 'string' ? getTransportPreset(presetOrId) : presetOrId;
  return preset ? normalizeTransportControls(preset.values) : null;
}
