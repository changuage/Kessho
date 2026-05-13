import React, { useCallback, useMemo, useState } from 'react';
import {
  createSeededRandom,
  generateSnowflake,
  snowflakeToSvgMarkup,
} from '../../snowflake/SnowflakeGenerator';
import {
  BACKGROUND_PRESETS,
  cloneSnowflakeParams,
  COLOR_PRESETS,
  DEFAULT_SNOWFLAKE_PARAMS,
  mergeParams,
  SNOWFLAKE_STYLE_PRESETS,
  type SnowflakeStylePreset,
} from '../../snowflake/presets';
import type {
  GeneratedSnowflake,
  SnowflakeBranchMotif,
  SnowflakeCenterMotif,
  SnowflakeFamily,
  SnowflakeLineCap,
  SnowflakeLineJoin,
  SnowflakeParams,
  SnowflakePositionBias,
  SnowflakeRingStyle,
  SnowflakeSideNodes,
  SnowflakeSilhouette,
  SnowflakeStationTemplate,
  SnowflakeTipMotif,
} from '../../snowflake/types';
import './SnowflakeGeneratorPage.css';

interface SnowflakeGeneratorPageProps {
  onBack?: () => void;
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface MacroAxes {
  structure: number;
  density: number;
  reach: number;
  fractal: number;
  ornament: number;
}

const CUSTOM_PRESETS_KEY = 'kessho:snowflake-generator-presets:v1';
const GALLERY_SIZE = 48;

const centerOptions: SelectOption<SnowflakeCenterMotif>[] = [
  { value: 'none', label: 'None' },
  { value: 'dot', label: 'Dot' },
  { value: 'circle', label: 'Circle' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'star', label: 'Star' },
  { value: 'sixPointStar', label: 'Six-point star' },
  { value: 'smallSpokes', label: 'Small spokes' },
  { value: 'ringedHexagon', label: 'Ringed hexagon' },
  { value: 'crystalCluster', label: 'Crystal cluster' },
];

const tipOptions: SelectOption<SnowflakeTipMotif>[] = [
  { value: 'point', label: 'Point' },
  { value: 'fork', label: 'Fork' },
  { value: 'doubleFork', label: 'Double fork' },
  { value: 'circle', label: 'Circle' },
  { value: 'split', label: 'Split' },
  { value: 'star', label: 'Star' },
  { value: 'smallStar', label: 'Small star' },
  { value: 'flatCap', label: 'Flat cap' },
  { value: 'splitV', label: 'Split V' },
];

const sideNodeOptions: SelectOption<SnowflakeSideNodes>[] = [
  { value: 'none', label: 'None' },
  { value: 'dots', label: 'Dots' },
  { value: 'circles', label: 'Circles' },
  { value: 'diamonds', label: 'Diamonds' },
  { value: 'plates', label: 'Plates' },
  { value: 'tinyStars', label: 'Tiny stars' },
];

const familyOptions: SelectOption<SnowflakeFamily>[] = [
  { value: 'simpleSpoke', label: 'Simple spoke' },
  { value: 'classicDendrite', label: 'Classic dendrite' },
  { value: 'fernDendrite', label: 'Fern dendrite' },
  { value: 'hexPlate', label: 'Hex plate' },
  { value: 'stellarPlate', label: 'Stellar plate' },
  { value: 'ringedCrystal', label: 'Ringed crystal' },
  { value: 'ornamentalIcon', label: 'Ornamental icon' },
  { value: 'denseFractal', label: 'Dense fractal' },
  { value: 'thinSharpCrystal', label: 'Thin sharp crystal' },
  { value: 'roundedIcon', label: 'Rounded icon' },
];

const stationTemplateOptions: SelectOption<SnowflakeStationTemplate>[] = [
  { value: 'sparse', label: 'Sparse' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'dense', label: 'Dense' },
  { value: 'outerCrown', label: 'Outer crown' },
  { value: 'innerStar', label: 'Inner star' },
];

const silhouetteOptions: SelectOption<SnowflakeSilhouette>[] = [
  { value: 'round', label: 'Round' },
  { value: 'compact', label: 'Compact' },
  { value: 'spiky', label: 'Spiky' },
  { value: 'fern', label: 'Fern' },
  { value: 'stellar', label: 'Stellar' },
  { value: 'plate', label: 'Plate' },
];

const branchMotifOptions: SelectOption<SnowflakeBranchMotif>[] = [
  { value: 'singleLine', label: 'Single line' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'doubleChevron', label: 'Double chevron' },
  { value: 'fork', label: 'Fork' },
  { value: 'comb', label: 'Comb' },
  { value: 'miniDendrite', label: 'Mini dendrite' },
  { value: 'shortBar', label: 'Short bar' },
  { value: 'arrow', label: 'Arrow' },
];

const ringStyleOptions: SelectOption<SnowflakeRingStyle>[] = [
  { value: 'none', label: 'None' },
  { value: 'innerHexRing', label: 'Inner hex' },
  { value: 'midHexRing', label: 'Mid hex' },
  { value: 'doubleHexRing', label: 'Double hex' },
  { value: 'circleRing', label: 'Circle' },
  { value: 'spokeConnector', label: 'Spoke connector' },
];

const positionBiasOptions: SelectOption<SnowflakePositionBias>[] = [
  { value: 'inner', label: 'Inner' },
  { value: 'even', label: 'Even' },
  { value: 'outer', label: 'Outer' },
];

const silhouetteAxisScores: Record<SnowflakeSilhouette, number> = {
  plate: -1,
  compact: -0.72,
  round: -0.18,
  stellar: 0,
  fern: 0.68,
  spiky: 1,
};

const stationTemplateAxisScores: Record<SnowflakeStationTemplate, number> = {
  sparse: -0.78,
  innerStar: -0.24,
  balanced: 0,
  outerCrown: 0.54,
  dense: 1,
};

const branchMotifAxisScores: Record<SnowflakeBranchMotif, number> = {
  shortBar: -1,
  chevron: -0.78,
  doubleChevron: -1,
  arrow: -0.42,
  singleLine: 0,
  fork: 0.34,
  comb: 0.72,
  miniDendrite: 1,
};

const centerMotifAxisScores: Record<SnowflakeCenterMotif, number> = {
  none: 0,
  dot: 0.52,
  circle: 0.86,
  hexagon: -0.8,
  star: -0.42,
  sixPointStar: -0.66,
  smallSpokes: -0.18,
  ringedHexagon: -1,
  crystalCluster: 0.34,
};

const tipMotifAxisScores: Record<SnowflakeTipMotif, number> = {
  point: 0,
  flatCap: -0.48,
  fork: 0.16,
  split: -0.34,
  splitV: -0.58,
  circle: 1,
  doubleFork: 0.26,
  smallStar: 0.72,
  star: 0.84,
};

const sideNodeAxisScores: Record<SnowflakeSideNodes, number> = {
  none: 0,
  dots: 0.62,
  circles: 1,
  diamonds: -1,
  plates: -0.72,
  tinyStars: 0.72,
};

const ringStyleAxisScores: Record<SnowflakeRingStyle, number> = {
  none: 0,
  innerHexRing: -0.7,
  midHexRing: -0.52,
  doubleHexRing: -1,
  circleRing: 1,
  spokeConnector: 0.34,
};

const lineCapOptions: SelectOption<SnowflakeLineCap>[] = [
  { value: 'butt', label: 'Butt' },
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
];

const lineJoinOptions: SelectOption<SnowflakeLineJoin>[] = [
  { value: 'miter', label: 'Miter' },
  { value: 'round', label: 'Round' },
  { value: 'bevel', label: 'Bevel' },
];

const SnowflakeGeneratorPage: React.FC<SnowflakeGeneratorPageProps> = ({ onBack }) => {
  const initialPreset = SNOWFLAKE_STYLE_PRESETS[1] ?? { id: 'default', name: 'Default', params: DEFAULT_SNOWFLAKE_PARAMS };
  const [params, setParams] = useState<SnowflakeParams>(() => cloneSnowflakeParams(initialPreset.params));
  const [macroAxes, setMacroAxes] = useState<MacroAxes>(() => deriveMacroAxes(initialPreset.params));
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id);
  const [gallerySeeds, setGallerySeeds] = useState<number[]>(() => createGallerySeeds(initialPreset.params.seed));
  const [savedPresets, setSavedPresets] = useState<SnowflakeStylePreset[]>(() => loadSavedPresets());
  const [status, setStatus] = useState('Ready');

  const allPresets = useMemo(() => [...SNOWFLAKE_STYLE_PRESETS, ...savedPresets], [savedPresets]);
  const result = useMemo(() => generateSnowflake(params), [params]);
  const svgMarkup = useMemo(
    () => snowflakeToSvgMarkup(params, result, { idPrefix: `preview-${params.seed}`, title: 'Procedural snowflake' }),
    [params, result],
  );
  const galleryItems = useMemo(
    () => gallerySeeds.map((seed) => {
      const galleryParams = createGallerySnowflakeParams(seed, params);
      return {
        seed,
        params: galleryParams,
        result: generateSnowflake(galleryParams),
      };
    }),
    [gallerySeeds, params],
  );
  const simpleOrganicness = useMemo(() => clamp01(
    params.variation.randomness * 0.42 +
    params.style.roughness * 0.22 +
    params.variation.angleNoise * 0.18 +
    params.variation.lengthNoise * 0.18,
  ), [params.style.roughness, params.variation.angleNoise, params.variation.lengthNoise, params.variation.randomness]);
  const activeColorPreset = COLOR_PRESETS.find(
    (preset) => preset.strokeColor.toLowerCase() === params.style.strokeColor.toLowerCase(),
  )?.id ?? 'custom';
  const activeBackgroundPreset = BACKGROUND_PRESETS.find(
    (preset) => preset.backgroundColor.toLowerCase() === params.style.backgroundColor.toLowerCase(),
  )?.id ?? 'custom';

  const updateGroup = useCallback(<Group extends keyof SnowflakeParams>(
    group: Group,
    patch: Partial<SnowflakeParams[Group]>,
  ) => {
    setSelectedPresetId('custom');
    setParams((current) => ({
      ...current,
      [group]: {
        ...(current[group] as object),
        ...patch,
      },
    } as SnowflakeParams));
  }, []);

  const updateSeed = useCallback((seed: number) => {
    setSelectedPresetId('custom');
    setParams((current) => ({ ...current, seed: Math.max(1, Math.round(seed || 1)) }));
  }, []);

  const randomizeSeed = useCallback(() => {
    const seed = Math.floor(Math.random() * 999999) + 1;
    updateSeed(seed);
    setStatus(`Seed ${seed}`);
  }, [updateSeed]);

  const generateGallery = useCallback(() => {
    const seeds = createGallerySeeds(params.seed);
    setGallerySeeds(seeds);
    setStatus(`Gallery regenerated from seed ${params.seed}`);
  }, [params.seed]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = allPresets.find((entry) => entry.id === presetId);
    if (!preset) return;
    const nextParams = cloneSnowflakeParams(preset.params);
    setParams(nextParams);
    setMacroAxes(deriveMacroAxes(nextParams));
    setSelectedPresetId(preset.id);
    setGallerySeeds(createGallerySeeds(preset.params.seed));
    setStatus(preset.name);
  }, [allPresets]);

  const applyFamily = useCallback((family: SnowflakeFamily) => {
    setParams((current) => ({ ...current, family }));
    setSelectedPresetId('custom');
    setStatus(formatFamilyLabel(family));
  }, []);

  const savePreset = useCallback(() => {
    const fallbackName = `Custom ${params.seed}`;
    const name = typeof window === 'undefined'
      ? fallbackName
      : window.prompt('Preset name', fallbackName)?.trim();
    if (!name) return;
    const nextPreset: SnowflakeStylePreset = {
      id: `custom-${Date.now().toString(36)}`,
      name,
      params: cloneSnowflakeParams(params),
    };
    const nextPresets = [...savedPresets, nextPreset];
    setSavedPresets(nextPresets);
    setSelectedPresetId(nextPreset.id);
    saveCustomPresets(nextPresets);
    setStatus(`Saved ${name}`);
  }, [params, savedPresets]);

  const resetParams = useCallback(() => {
    const preset = SNOWFLAKE_STYLE_PRESETS[1] ?? SNOWFLAKE_STYLE_PRESETS[0]!;
    const nextParams = cloneSnowflakeParams(preset.params);
    setParams(nextParams);
    setMacroAxes(deriveMacroAxes(nextParams));
    setSelectedPresetId(preset.id);
    setGallerySeeds(createGallerySeeds(preset.params.seed));
    setStatus('Reset');
  }, []);

  const exportSvg = useCallback(() => {
    downloadBlob(`snowflake-${params.seed}.svg`, svgMarkup, 'image/svg+xml;charset=utf-8');
    setStatus('SVG exported');
  }, [params.seed, svgMarkup]);

  const copySvg = useCallback(async () => {
    try {
      await copyText(svgMarkup);
      setStatus('SVG copied');
    } catch {
      setStatus('Clipboard unavailable');
    }
  }, [svgMarkup]);

  const exportPng = useCallback(async () => {
    try {
      await exportSvgAsPng(svgMarkup, result.size, `snowflake-${params.seed}.png`);
      setStatus('PNG exported');
    } catch {
      setStatus('PNG export failed');
    }
  }, [params.seed, result.size, svgMarkup]);

  const setStructureMacro = useCallback((value: number) => {
    const axis = clamp(value, -1, 1);
    const amount = Math.abs(axis);
    setSelectedPresetId('custom');
    setMacroAxes((current) => ({ ...current, structure: axis }));
    setParams((current) => mergeParams(current, {
      geometry: {
        armSegments: axis < 0 ? Math.round(5 - amount * 2) : Math.round(5 + amount * 8),
        centerRadius: axis < 0 ? Math.round(8 + amount * 16) : Math.round(8 - amount * 3),
        innerGap: axis < 0 ? Math.round(7 + amount * 8) : Math.round(7 - amount * 3),
        silhouette: chooseSilhouetteForStructureAxis(axis),
      },
      branching: {
        stationTemplate: chooseStationTemplateForStructureAxis(axis),
      },
    }));
  }, []);

  const setDensityMacro = useCallback((value: number) => {
    const axis = clamp(value, -1, 1);
    const amount = Math.abs(axis);
    setSelectedPresetId('custom');
    setMacroAxes((current) => ({ ...current, density: axis }));
    setParams((current) => mergeParams(current, {
      branching: {
        slots: axis < 0 ? Math.round(4 + amount * 2) : Math.round(4 + amount * 9),
        probability: axis < 0 ? 0.72 - amount * 0.26 : 0.72 + amount * 0.25,
      },
      variation: {
        densityNoise: axis < 0 ? 0.18 + amount * 0.38 : 0.08 + amount * 0.32,
      },
      style: {
        strokeWidth: axis < 0 ? 3 + amount * 2.2 : 3 - amount * 1.45,
      },
    }));
  }, []);

  const setReachMacro = useCallback((value: number) => {
    const axis = clamp(value, -1, 1);
    const amount = Math.abs(axis);
    setSelectedPresetId('custom');
    setMacroAxes((current) => ({ ...current, reach: axis }));
    setParams((current) => mergeParams(current, {
      branching: {
        lengthRatio: 0.25 + amount * (axis < 0 ? 0.12 : 0.16),
        branchStart: axis < 0 ? 0.18 - amount * 0.1 : 0.18 + amount * 0.26,
        branchEnd: axis < 0 ? 0.86 - amount * 0.24 : 0.86 + amount * 0.12,
        positionBias: axis < -0.12 ? 'inner' : axis > 0.12 ? 'outer' : 'even',
      },
    }));
  }, []);

  const setFractalMacro = useCallback((value: number) => {
    const axis = clamp(value, -1, 1);
    const amount = Math.abs(axis);
    setSelectedPresetId('custom');
    setMacroAxes((current) => ({ ...current, fractal: axis }));
    setParams((current) => mergeParams(current, {
      branching: {
        branchMotif: chooseBranchMotifForFractalAxis(axis),
        angleJitter: axis < 0 ? 1 + amount * 2.5 : 2 + amount * 5,
        lengthJitter: axis < 0 ? 0.04 + amount * 0.05 : 0.08 + amount * 0.16,
      },
      fractal: {
        depth: Math.round(amount * 5),
        lengthDecay: axis < 0 ? 0.44 + amount * 0.14 : 0.46 + amount * 0.26,
        widthDecay: axis < 0 ? 0.82 - amount * 0.16 : 0.76 - amount * 0.28,
        probabilityDecay: axis < 0 ? 0.52 + amount * 0.22 : 0.58 + amount * 0.38,
        minLength: Math.round(8 - amount * 5),
        maxSegments: Math.round(260 + amount * 1040),
      },
      variation: {
        randomness: axis < 0 ? 0.1 + amount * 0.08 : 0.22 + amount * 0.36,
        angleNoise: axis < 0 ? 0.03 + amount * 0.04 : 0.08 + amount * 0.16,
        lengthNoise: axis < 0 ? 0.06 + amount * 0.06 : 0.1 + amount * 0.18,
      },
      style: {
        roughness: axis < 0 ? 0 : amount * 0.42,
      },
    }));
  }, []);

  const setOrnamentMacro = useCallback((value: number) => {
    const axis = clamp(value, -1, 1);
    const amount = Math.abs(axis);
    setSelectedPresetId('custom');
    setMacroAxes((current) => ({ ...current, ornament: axis }));
    setParams((current) => mergeParams(current, {
      motifs: {
        center: chooseCenterMotifForOrnamentAxis(axis),
        tips: chooseTipMotifForOrnamentAxis(axis),
        rings: Math.round(amount * 6),
        ringStyle: chooseRingStyleForOrnamentAxis(axis),
        plates: amount > 0.36,
        hollowCenter: axis < -0.82,
        sideNodes: chooseSideNodesForOrnamentAxis(axis),
      },
    }));
  }, []);

  const setOrganicness = useCallback((value: number) => {
    const normalized = clamp01(value);
    setSelectedPresetId('custom');
    setParams((current) => mergeParams(current, {
      style: {
        roughness: normalized * 0.72,
      },
      variation: {
        randomness: normalized,
        asymmetry: normalized * 0.12,
        angleNoise: normalized * 0.48,
        lengthNoise: normalized * 0.5,
        densityNoise: 0.14 + normalized * 0.42,
      },
    }));
  }, []);

  const applyColorPreset = useCallback((presetId: string) => {
    const preset = COLOR_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    updateGroup('style', {
      strokeColor: preset.strokeColor,
      strokeOpacity: preset.strokeOpacity,
    });
  }, [updateGroup]);

  const applyBackgroundPreset = useCallback((presetId: string) => {
    const preset = BACKGROUND_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    updateGroup('style', {
      backgroundColor: preset.backgroundColor,
      glow: preset.glow,
    });
  }, [updateGroup]);

  return (
    <div className="snowflake-generator-page">
      <header className="snowflake-generator-topbar">
        <div>
          <h1>Procedural Snowflake Generator</h1>
          <div className="snowflake-generator-meta">
            Seed {params.seed} · {formatFamilyLabel(params.family)} · {result.segmentCount} segments · 6-fold symmetry
          </div>
        </div>
        <div className="snowflake-generator-top-actions">
          <select
            className="snowflake-generator-select"
            value={selectedPresetId}
            onChange={(event) => applyPreset(event.target.value)}
            aria-label="Style preset"
          >
            {allPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
            {selectedPresetId === 'custom' && <option value="custom">Custom</option>}
          </select>
          {onBack && (
            <button type="button" className="snowflake-generator-button secondary" onClick={onBack}>
              Back
            </button>
          )}
        </div>
      </header>

      <main className="snowflake-generator-layout">
        <aside className="snowflake-generator-controls" aria-label="Snowflake controls">
          <section className="snowflake-generator-control-section">
            <h2>Simple Controls</h2>
            <div className="snowflake-generator-action-grid">
              <button type="button" className="snowflake-generator-button" onClick={randomizeSeed}>Randomize seed</button>
              <button type="button" className="snowflake-generator-button" onClick={generateGallery}>Generate gallery</button>
              <button type="button" className="snowflake-generator-button" onClick={savePreset}>Save preset</button>
              <button type="button" className="snowflake-generator-button secondary" onClick={resetParams}>Reset parameters</button>
              <button type="button" className="snowflake-generator-button" onClick={exportSvg}>Export SVG</button>
              <button type="button" className="snowflake-generator-button" onClick={exportPng}>Export PNG</button>
              <button type="button" className="snowflake-generator-button wide" onClick={copySvg}>Copy SVG code</button>
            </div>

            <NumberControl
              label="Seed"
              value={params.seed}
              min={1}
              max={999999}
              step={1}
              onChange={updateSeed}
            />
            <SliderControl label="Branch angle" value={params.branching.angle} min={10} max={80} step={1} suffix="deg" onChange={(value) => updateGroup('branching', { angle: value })} />
            <SliderControl label="Thickness" value={params.style.strokeWidth} min={0.5} max={10} step={0.1} onChange={(value) => updateGroup('style', { strokeWidth: value })} />
            <SliderControl label="Sharpness" value={params.style.sharpness} min={0} max={1} step={0.01} onChange={(value) => updateGroup('style', { sharpness: value })} />
            <SliderControl label="Organicness" value={simpleOrganicness} min={0} max={1} step={0.01} onChange={setOrganicness} />
            <SelectControl
              label="Color preset"
              value={activeColorPreset}
              options={[
                ...COLOR_PRESETS.map((preset) => ({ value: preset.id, label: preset.name })),
                { value: 'custom', label: 'Custom' },
              ]}
              onChange={applyColorPreset}
            />
            <SelectControl
              label="Background preset"
              value={activeBackgroundPreset}
              options={[
                ...BACKGROUND_PRESETS.map((preset) => ({ value: preset.id, label: preset.name })),
                { value: 'custom', label: 'Custom' },
              ]}
              onChange={applyBackgroundPreset}
            />
            <SelectControl
              label="Family"
              value={params.family}
              options={familyOptions}
              onChange={applyFamily}
            />
          </section>

          <details className="snowflake-generator-advanced" open>
            <summary>Advanced Controls</summary>
            <ControlGroup title="Symmetry">
              <ToggleControl label="Mirror arm" checked={params.symmetry.mirrorArm} onChange={(value) => updateGroup('symmetry', { mirrorArm: value })} />
              <ToggleControl label="Alternate mirror" checked={params.symmetry.alternateMirror} onChange={(value) => updateGroup('symmetry', { alternateMirror: value })} />
            </ControlGroup>

            <ControlGroup title="Geometry">
              <SliderControl label="Radius" value={params.geometry.radius} min={60} max={260} step={1} onChange={(value) => updateGroup('geometry', { radius: value })} />
              <SliderControl label="Center radius" value={params.geometry.centerRadius} min={0} max={48} step={1} onChange={(value) => updateGroup('geometry', { centerRadius: value })} />
              <SliderControl label="Inner gap" value={params.geometry.innerGap} min={0} max={48} step={1} onChange={(value) => updateGroup('geometry', { innerGap: value })} />
              <SliderControl label="Arm segments" value={params.geometry.armSegments} min={1} max={16} step={1} onChange={(value) => updateGroup('geometry', { armSegments: value })} />
              <SelectControl label="Tip style" value={params.geometry.tipStyle} options={tipOptions} onChange={(value) => updateGroup('geometry', { tipStyle: value })} />
              <SelectControl label="Silhouette" value={params.geometry.silhouette} options={silhouetteOptions} onChange={(value) => updateGroup('geometry', { silhouette: value })} />
            </ControlGroup>

            <ControlGroup title="Branching">
              <SliderControl label="Slots" value={params.branching.slots} min={0} max={16} step={1} onChange={(value) => updateGroup('branching', { slots: value })} />
              <SliderControl label="Probability" value={params.branching.probability} min={0} max={1} step={0.01} onChange={(value) => updateGroup('branching', { probability: value })} />
              <SliderControl label="Angle" value={params.branching.angle} min={5} max={85} step={1} suffix="deg" onChange={(value) => updateGroup('branching', { angle: value })} />
              <SliderControl label="Angle jitter" value={params.branching.angleJitter} min={0} max={45} step={1} suffix="deg" onChange={(value) => updateGroup('branching', { angleJitter: value })} />
              <SliderControl label="Length ratio" value={params.branching.lengthRatio} min={0.05} max={0.8} step={0.01} onChange={(value) => updateGroup('branching', { lengthRatio: value })} />
              <SliderControl label="Length jitter" value={params.branching.lengthJitter} min={0} max={1} step={0.01} onChange={(value) => updateGroup('branching', { lengthJitter: value })} />
              <SliderControl label="Position jitter" value={params.branching.positionJitter} min={0} max={0.3} step={0.01} onChange={(value) => updateGroup('branching', { positionJitter: value })} />
              <SelectControl label="Position bias" value={params.branching.positionBias} options={positionBiasOptions} onChange={(value) => updateGroup('branching', { positionBias: value })} />
              <SliderControl label="Branch start" value={params.branching.branchStart} min={0.02} max={0.5} step={0.01} onChange={(value) => updateGroup('branching', { branchStart: value })} />
              <SliderControl label="Branch end" value={params.branching.branchEnd} min={0.45} max={0.99} step={0.01} onChange={(value) => updateGroup('branching', { branchEnd: value })} />
              <ToggleControl label="Guaranteed inner branches" checked={params.branching.guaranteedInnerBranches} onChange={(value) => updateGroup('branching', { guaranteedInnerBranches: value })} />
              <SelectControl label="Station template" value={params.branching.stationTemplate} options={stationTemplateOptions} onChange={(value) => updateGroup('branching', { stationTemplate: value })} />
              <SelectControl label="Branch motif" value={params.branching.branchMotif} options={branchMotifOptions} onChange={(value) => updateGroup('branching', { branchMotif: value })} />
            </ControlGroup>

            <ControlGroup title="Fractal">
              <SliderControl label="Depth" value={params.fractal.depth} min={0} max={5} step={1} onChange={(value) => updateGroup('fractal', { depth: value })} />
              <SliderControl label="Length decay" value={params.fractal.lengthDecay} min={0.25} max={0.9} step={0.01} onChange={(value) => updateGroup('fractal', { lengthDecay: value })} />
              <SliderControl label="Width decay" value={params.fractal.widthDecay} min={0.25} max={1} step={0.01} onChange={(value) => updateGroup('fractal', { widthDecay: value })} />
              <SliderControl label="Probability decay" value={params.fractal.probabilityDecay} min={0.2} max={1} step={0.01} onChange={(value) => updateGroup('fractal', { probabilityDecay: value })} />
              <SliderControl label="Min length" value={params.fractal.minLength} min={1} max={24} step={1} onChange={(value) => updateGroup('fractal', { minLength: value })} />
              <SliderControl label="Max segments" value={params.fractal.maxSegments} min={80} max={1600} step={20} onChange={(value) => updateGroup('fractal', { maxSegments: value })} />
            </ControlGroup>

            <ControlGroup title="Motifs">
              <SelectControl label="Center motif" value={params.motifs.center} options={centerOptions} onChange={(value) => updateGroup('motifs', { center: value })} />
              <SelectControl label="Tip motif" value={params.motifs.tips} options={tipOptions} onChange={(value) => updateGroup('motifs', { tips: value })} />
              <SliderControl label="Rings" value={params.motifs.rings} min={0} max={6} step={1} onChange={(value) => updateGroup('motifs', { rings: value })} />
              <SelectControl label="Ring style" value={params.motifs.ringStyle} options={ringStyleOptions} onChange={(value) => updateGroup('motifs', { ringStyle: value })} />
              <ToggleControl label="Plates" checked={params.motifs.plates} onChange={(value) => updateGroup('motifs', { plates: value })} />
              <ToggleControl label="Hollow center" checked={params.motifs.hollowCenter} onChange={(value) => updateGroup('motifs', { hollowCenter: value })} />
              <SelectControl label="Side nodes" value={params.motifs.sideNodes} options={sideNodeOptions} onChange={(value) => updateGroup('motifs', { sideNodes: value })} />
            </ControlGroup>

            <ControlGroup title="Style">
              <ColorControl label="Stroke color" value={params.style.strokeColor} onChange={(value) => updateGroup('style', { strokeColor: value })} />
              <ColorControl label="Background color" value={params.style.backgroundColor === 'transparent' ? '#ffffff' : params.style.backgroundColor} onChange={(value) => updateGroup('style', { backgroundColor: value })} />
              <SliderControl label="Stroke width" value={params.style.strokeWidth} min={0.4} max={16} step={0.1} onChange={(value) => updateGroup('style', { strokeWidth: value })} />
              <SliderControl label="Stroke opacity" value={params.style.strokeOpacity} min={0} max={1} step={0.01} onChange={(value) => updateGroup('style', { strokeOpacity: value })} />
              <SelectControl label="Line cap" value={params.style.lineCap} options={lineCapOptions} onChange={(value) => updateGroup('style', { lineCap: value })} />
              <SelectControl label="Line join" value={params.style.lineJoin} options={lineJoinOptions} onChange={(value) => updateGroup('style', { lineJoin: value })} />
              <SliderControl label="Taper" value={params.style.taper} min={0} max={1} step={0.01} onChange={(value) => updateGroup('style', { taper: value })} />
              <SliderControl label="Frost opacity" value={params.style.glow} min={0} max={1} step={0.01} onChange={(value) => updateGroup('style', { glow: value })} />
              <SliderControl label="Roughness" value={params.style.roughness} min={0} max={1} step={0.01} onChange={(value) => updateGroup('style', { roughness: value })} />
            </ControlGroup>

            <ControlGroup title="Variation">
              <SliderControl label="Randomness" value={params.variation.randomness} min={0} max={1} step={0.01} onChange={(value) => updateGroup('variation', { randomness: value })} />
              <SliderControl label="Asymmetry" value={params.variation.asymmetry} min={0} max={0.35} step={0.01} onChange={(value) => updateGroup('variation', { asymmetry: value })} />
              <SliderControl label="Angle noise" value={params.variation.angleNoise} min={0} max={1} step={0.01} onChange={(value) => updateGroup('variation', { angleNoise: value })} />
              <SliderControl label="Length noise" value={params.variation.lengthNoise} min={0} max={1} step={0.01} onChange={(value) => updateGroup('variation', { lengthNoise: value })} />
              <SliderControl label="Density noise" value={params.variation.densityNoise} min={0} max={1} step={0.01} onChange={(value) => updateGroup('variation', { densityNoise: value })} />
            </ControlGroup>
          </details>
        </aside>

        <section className="snowflake-generator-workbench">
          <div className="snowflake-generator-preview-shell">
            <div className="snowflake-generator-live-controls" aria-label="Live snowflake controls">
              <div className="snowflake-generator-live-family">
                <SelectControl
                  label="Family"
                  value={params.family}
                  options={familyOptions}
                  onChange={applyFamily}
                />
              </div>
              <MacroSliderControl label="Structure" leftLabel="Hex plate" rightLabel="Dendrite" value={macroAxes.structure} onChange={setStructureMacro} />
              <MacroSliderControl label="Density" leftLabel="Clustered" rightLabel="Fine lace" value={macroAxes.density} onChange={setDensityMacro} />
              <MacroSliderControl label="Reach" leftLabel="Inner" rightLabel="Outer" value={macroAxes.reach} onChange={setReachMacro} />
              <MacroSliderControl label="Fractal" leftLabel="Geometric" rightLabel="Organic" value={macroAxes.fractal} onChange={setFractalMacro} />
              <MacroSliderControl label="Ornament" leftLabel="Hex/diamond" rightLabel="Circle/dot" value={macroAxes.ornament} onChange={setOrnamentMacro} />
            </div>
            <SnowflakeSvg
              params={params}
              result={result}
              idPrefix="main-snowflake"
              className="snowflake-generator-preview"
            />
            <div className="snowflake-generator-status">{status}</div>
          </div>

          <div className="snowflake-generator-gallery" aria-label="Generated snowflake gallery">
            {galleryItems.map((item) => (
              <button
                type="button"
                key={item.seed}
                className={`snowflake-generator-tile${item.seed === params.seed ? ' active' : ''}`}
                onClick={() => {
                  const nextParams = cloneSnowflakeParams(item.params);
                  setParams(nextParams);
                  setMacroAxes(deriveMacroAxes(nextParams));
                  setSelectedPresetId('custom');
                  setStatus(`${formatFamilyLabel(item.params.family)} seed ${item.seed}`);
                }}
                aria-label={`Open snowflake seed ${item.seed}`}
              >
                <SnowflakeSvg
                  params={item.params}
                  result={item.result}
                  idPrefix={`tile-${item.seed}`}
                  className="snowflake-generator-thumb"
                />
                <span>{item.seed}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

interface SnowflakeSvgProps {
  params: SnowflakeParams;
  result: GeneratedSnowflake;
  idPrefix: string;
  className?: string;
}

const SnowflakeSvg: React.FC<SnowflakeSvgProps> = ({ params, result, idPrefix, className }) => {
  const frostOpacity = clamp01(params.style.glow);
  const lineCap = params.style.sharpness > 0.72 ? 'butt' : params.style.sharpness < 0.28 ? 'round' : params.style.lineCap;
  const lineJoin = params.style.sharpness > 0.72 ? 'miter' : params.style.sharpness < 0.28 ? 'round' : params.style.lineJoin;

  return (
    <svg
      className={className}
      viewBox={result.viewBox}
      role="img"
      aria-label={`Procedural snowflake seed ${params.seed}`}
      data-snowflake-id={idPrefix}
      style={{ backgroundColor: params.style.backgroundColor }}
    >
      <rect width="100%" height="100%" fill={params.style.backgroundColor} />
      {frostOpacity > 0 && (
        <g>
          {result.pathLayers.map((layer) => (
            <path
              key={`frost-${layer.id}`}
              d={layer.d}
              fill="none"
              stroke={params.style.strokeColor}
              strokeWidth={layer.strokeWidth + frostOpacity * 4.8}
              strokeOpacity={layer.strokeOpacity * (0.035 + frostOpacity * 0.18)}
              strokeLinecap={lineCap}
              strokeLinejoin={lineJoin}
            />
          ))}
        </g>
      )}
      {result.shapePaths.map((shape) => (
        <path
          key={shape.id}
          d={shape.d}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity}
          fillRule={shape.fillRule}
        />
      ))}
      {result.pathLayers.map((layer) => (
        <path
          key={layer.id}
          d={layer.d}
          fill="none"
          stroke={params.style.strokeColor}
          strokeWidth={layer.strokeWidth}
          strokeOpacity={layer.strokeOpacity}
          strokeLinecap={lineCap}
          strokeLinejoin={lineJoin}
        />
      ))}
    </svg>
  );
};

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}

interface MacroSliderControlProps {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (value: number) => void;
}

const MacroSliderControl: React.FC<MacroSliderControlProps> = ({ label, leftLabel, rightLabel, value, onChange }) => (
  <label className="snowflake-generator-control snowflake-generator-macro-control">
    <span>{label}</span>
    <div className="snowflake-generator-axis-labels" aria-hidden="true">
      <span>{leftLabel}</span>
      <span>Bare</span>
      <span>{rightLabel}</span>
    </div>
    <div className="snowflake-generator-control-row">
      <input
        type="range"
        min={-1}
        max={1}
        step={0.005}
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{formatMacroControlValue(value)}</output>
    </div>
  </label>
);

const SliderControl: React.FC<SliderControlProps> = ({ label, value, min, max, step, suffix, onChange }) => (
  <label className="snowflake-generator-control">
    <span>{label}</span>
    <div className="snowflake-generator-control-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{formatControlValue(value, step)}{suffix ?? ''}</output>
    </div>
  </label>
);

interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const NumberControl: React.FC<NumberControlProps> = ({ label, value, min, max, step, onChange }) => (
  <label className="snowflake-generator-control">
    <span>{label}</span>
    <input
      className="snowflake-generator-number"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

interface SelectControlProps<T extends string> {
  label: string;
  value: T | string;
  options: SelectOption<T | string>[];
  onChange: (value: T) => void;
}

const SelectControl = <T extends string,>({ label, value, options, onChange }: SelectControlProps<T>) => (
  <label className="snowflake-generator-control">
    <span>{label}</span>
    <select
      className="snowflake-generator-select full"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorControl: React.FC<ColorControlProps> = ({ label, value, onChange }) => (
  <label className="snowflake-generator-control">
    <span>{label}</span>
    <input
      className="snowflake-generator-color"
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

interface ToggleControlProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const ToggleControl: React.FC<ToggleControlProps> = ({ label, checked, onChange }) => (
  <label className="snowflake-generator-toggle">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

interface ControlGroupProps {
  title: string;
  children: React.ReactNode;
}

const ControlGroup: React.FC<ControlGroupProps> = ({ title, children }) => (
  <fieldset className="snowflake-generator-group">
    <legend>{title}</legend>
    {children}
  </fieldset>
);

function createGallerySeeds(seed: number): number[] {
  const rng = createSeededRandom(seed + 371);
  return Array.from({ length: GALLERY_SIZE }, (_, index) => {
    return Math.floor(rng() * 900000) + 10000 + index;
  });
}

function createGallerySnowflakeParams(seed: number, source: SnowflakeParams): SnowflakeParams {
  const rng = createSeededRandom(seed + 7919);
  const family = weightedChoice(rng, [
    ['simpleSpoke', 0.12],
    ['classicDendrite', 0.16],
    ['fernDendrite', 0.12],
    ['hexPlate', 0.12],
    ['stellarPlate', 0.13],
    ['ringedCrystal', 0.12],
    ['ornamentalIcon', 0.13],
    ['denseFractal', 0.06],
    ['thinSharpCrystal', 0.08],
    ['roundedIcon', 0.06],
  ]);
  const base = SNOWFLAKE_STYLE_PRESETS.find((preset) => preset.params.family === family)?.params ?? DEFAULT_SNOWFLAKE_PARAMS;
  const stationTemplates: SnowflakeStationTemplate[] = ['sparse', 'balanced', 'dense', 'outerCrown', 'innerStar'];
  const branchMotifs: SnowflakeBranchMotif[] = ['chevron', 'doubleChevron', 'fork', 'comb', 'miniDendrite', 'shortBar', 'arrow'];
  const centers: SnowflakeCenterMotif[] = ['dot', 'hexagon', 'sixPointStar', 'smallSpokes', 'ringedHexagon', 'crystalCluster'];
  const tips: SnowflakeTipMotif[] = ['point', 'fork', 'doubleFork', 'circle', 'smallStar', 'flatCap', 'splitV'];
  const sideNodes: SnowflakeSideNodes[] = ['none', 'dots', 'circles', 'diamonds', 'tinyStars'];
  const ringStyles: SnowflakeRingStyle[] = ['none', 'innerHexRing', 'midHexRing', 'doubleHexRing', 'circleRing', 'spokeConnector'];
  const isDark = source.style.backgroundColor !== 'transparent' && relativeLuminance(source.style.backgroundColor) < 0.22;
  const baseGlow = isDark ? Math.max(source.style.glow, base.style.glow, 0.45) : Math.min(Math.max(source.style.glow, base.style.glow * 0.4), 0.2);
  const familyKeepsTemplate = family === 'hexPlate' || family === 'simpleSpoke' || family === 'roundedIcon';

  return mergeParams(base, {
    seed,
    family,
    symmetry: {
      arms: 6,
      mirrorArm: true,
      alternateMirror: rng() < 0.12,
      rotationOffset: 0,
    },
    geometry: {
      radius: source.geometry.radius,
      centerRadius: clamp(base.geometry.centerRadius * randomRange(rng, 0.82, 1.25), 5, 26),
      armSegments: clamp(Math.round(base.geometry.armSegments + randomRange(rng, -1, 2)), 2, 12),
      silhouette: rng() < 0.72 ? base.geometry.silhouette : choose(rng, silhouetteOptions.map((option) => option.value)),
    },
    branching: {
      slots: clamp(Math.round(base.branching.slots + randomRange(rng, -1, 2)), 2, 10),
      probability: clamp(base.branching.probability + randomRange(rng, -0.08, 0.08), 0.58, 1),
      angle: choose(rng, [30, 35, 45, 50, 60]),
      angleJitter: clamp(base.branching.angleJitter + randomRange(rng, -1, 2), 0, 7),
      lengthRatio: clamp(base.branching.lengthRatio * randomRange(rng, 0.82, 1.18), 0.16, 0.48),
      lengthJitter: clamp(base.branching.lengthJitter * randomRange(rng, 0.7, 1.25), 0.02, 0.18),
      positionJitter: clamp(base.branching.positionJitter * randomRange(rng, 0.65, 1.25), 0.005, 0.04),
      branchStart: clamp(base.branching.branchStart + randomRange(rng, -0.03, 0.02), 0.08, 0.2),
      branchEnd: clamp(base.branching.branchEnd + randomRange(rng, -0.04, 0.02), 0.82, 0.98),
      stationTemplate: familyKeepsTemplate ? base.branching.stationTemplate : choose(rng, stationTemplates),
      branchMotif: rng() < 0.68 ? base.branching.branchMotif : choose(rng, branchMotifs),
      guaranteedInnerBranches: true,
    },
    fractal: {
      depth: clamp(Math.round(base.fractal.depth + randomRange(rng, -1, 1)), 0, family === 'denseFractal' ? 4 : 3),
      maxSegments: Math.min(source.fractal.maxSegments, family === 'denseFractal' ? 920 : 720),
    },
    motifs: {
      center: rng() < 0.78 ? base.motifs.center : choose(rng, centers),
      tips: rng() < 0.72 ? base.motifs.tips : choose(rng, tips),
      rings: clamp(Math.round(base.motifs.rings + randomRange(rng, -1, 2)), 0, 4),
      ringStyle: rng() < 0.72 ? base.motifs.ringStyle : choose(rng, ringStyles),
      plates: base.motifs.plates || rng() < 0.14,
      sideNodes: rng() < 0.7 ? base.motifs.sideNodes : choose(rng, sideNodes),
    },
    style: {
      strokeColor: source.style.strokeColor,
      strokeOpacity: source.style.strokeOpacity,
      backgroundColor: source.style.backgroundColor,
      strokeWidth: clamp(base.style.strokeWidth * randomRange(rng, 0.82, 1.16), 1, 6),
      glow: baseGlow,
      sharpness: clamp(base.style.sharpness + randomRange(rng, -0.12, 0.12), 0.05, 0.95),
    },
    variation: {
      randomness: clamp(base.variation.randomness * randomRange(rng, 0.65, 1.18), 0.08, 0.62),
      asymmetry: clamp(base.variation.asymmetry * randomRange(rng, 0.4, 1.15), 0, 0.08),
      angleNoise: clamp(base.variation.angleNoise * randomRange(rng, 0.65, 1.15), 0.02, 0.18),
      lengthNoise: clamp(base.variation.lengthNoise * randomRange(rng, 0.65, 1.15), 0.04, 0.24),
      densityNoise: clamp(base.variation.densityNoise * randomRange(rng, 0.65, 1.15), 0.04, 0.34),
    },
  });
}

function weightedChoice<T extends string>(rng: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng() * total;
  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

function choose<T>(rng: () => number, values: T[]): T {
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))]!;
}

function randomRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function deriveMacroAxes(params: SnowflakeParams): MacroAxes {
  const structure = clamp(
    signedScale(params.geometry.armSegments, 5, 3, 13) * 0.34 +
    (silhouetteAxisScores[params.geometry.silhouette] ?? 0) * 0.38 +
    (stationTemplateAxisScores[params.branching.stationTemplate] ?? 0) * 0.28,
    -1,
    1,
  );

  const density = params.branching.probability < 0.72
    ? -clamp01(
      ((0.72 - params.branching.probability) / 0.26) * 0.58 +
      ((params.variation.densityNoise - 0.18) / 0.38) * 0.42,
    )
    : clamp01(
      ((params.branching.slots - 4) / 9) * 0.58 +
      ((params.branching.probability - 0.72) / 0.25) * 0.42,
    );

  const reach = clamp(
    signedScale(params.branching.branchStart, 0.18, 0.08, 0.44) * 0.42 +
    signedScale(params.branching.branchEnd, 0.86, 0.62, 0.98) * 0.28 +
    (params.branching.positionBias === 'inner' ? -0.8 : params.branching.positionBias === 'outer' ? 0.8 : 0) * 0.3,
    -1,
    1,
  );

  const fractal = params.fractal.depth <= 0
    ? 0
    : clamp(
      (branchMotifAxisScores[params.branching.branchMotif] ?? 0) *
      (0.42 + clamp01(params.fractal.depth / 5) * 0.58),
      -1,
      1,
    );

  const ornamentAmount = clamp01(
    (params.motifs.rings / 6) * 0.34 +
    (params.motifs.center === 'none' ? 0 : 0.22) +
    (params.motifs.tips === 'point' ? 0 : 0.18) +
    (params.motifs.sideNodes === 'none' ? 0 : 0.16) +
    (params.motifs.plates ? 0.1 : 0),
  );
  const ornament = ornamentAmount <= 0.02
    ? 0
    : clamp(
      clamp(
        (centerMotifAxisScores[params.motifs.center] ?? 0) * 0.36 +
        (tipMotifAxisScores[params.motifs.tips] ?? 0) * 0.24 +
        (sideNodeAxisScores[params.motifs.sideNodes] ?? 0) * 0.24 +
        (ringStyleAxisScores[params.motifs.ringStyle] ?? 0) * 0.16 +
        (params.motifs.plates ? (params.motifs.ringStyle === 'circleRing' ? 0.16 : -0.16) : 0),
        -1,
        1,
      ) * Math.max(0.28, ornamentAmount),
      -1,
      1,
    );

  return { structure, density, reach, fractal, ornament };
}

function chooseStationTemplateForStructureAxis(value: number): SnowflakeStationTemplate {
  if (value < -0.52) return 'sparse';
  if (value < -0.16) return 'innerStar';
  if (value < 0.28) return 'balanced';
  if (value < 0.66) return 'outerCrown';
  return 'dense';
}

function chooseSilhouetteForStructureAxis(value: number): SnowflakeSilhouette {
  if (value < -0.66) return 'plate';
  if (value < -0.18) return 'compact';
  if (value < 0.28) return 'stellar';
  if (value < 0.66) return 'fern';
  return 'spiky';
}

function chooseBranchMotifForFractalAxis(value: number): SnowflakeBranchMotif {
  if (Math.abs(value) < 0.06) return 'singleLine';
  if (value < -0.72) return 'doubleChevron';
  if (value < -0.34) return 'chevron';
  if (value < 0) return 'shortBar';
  if (value < 0.36) return 'fork';
  if (value < 0.74) return 'comb';
  return 'miniDendrite';
}

function chooseCenterMotifForOrnamentAxis(value: number): SnowflakeCenterMotif {
  if (Math.abs(value) < 0.08) return 'none';
  if (value < -0.74) return 'ringedHexagon';
  if (value < -0.46) return 'sixPointStar';
  if (value < 0) return 'hexagon';
  if (value < 0.36) return 'dot';
  return 'circle';
}

function chooseTipMotifForOrnamentAxis(value: number): SnowflakeTipMotif {
  if (Math.abs(value) < 0.08) return 'point';
  if (value < -0.62) return 'splitV';
  if (value < -0.28) return 'flatCap';
  if (value < 0) return 'split';
  if (value < 0.42) return 'fork';
  return 'circle';
}

function chooseRingStyleForOrnamentAxis(value: number): SnowflakeRingStyle {
  if (Math.abs(value) < 0.08) return 'none';
  if (value < -0.62) return 'doubleHexRing';
  if (value < 0) return 'innerHexRing';
  return 'circleRing';
}

function chooseSideNodesForOrnamentAxis(value: number): SnowflakeSideNodes {
  if (Math.abs(value) < 0.18) return 'none';
  if (value < -0.68) return 'diamonds';
  if (value < 0) return 'plates';
  if (value < 0.58) return 'dots';
  return 'circles';
}

function signedScale(value: number, center: number, min: number, max: number): number {
  if (value >= center) return clamp((value - center) / Math.max(1e-9, max - center), 0, 1);
  return -clamp((center - value) / Math.max(1e-9, center - min), 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatFamilyLabel(family: SnowflakeFamily): string {
  return familyOptions.find((option) => option.value === family)?.label ?? family;
}

function relativeLuminance(color: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return 1;
  const r = Number.parseInt(color.slice(1, 3), 16) / 255;
  const g = Number.parseInt(color.slice(3, 5), 16) / 255;
  const b = Number.parseInt(color.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function loadSavedPresets(): SnowflakeStylePreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: SnowflakeStylePreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Local storage is optional for this tool.
  }
}

function downloadBlob(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy failed');
}

async function exportSvgAsPng(svgMarkup: string, size: number, filename: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = size * scale;
    canvas.height = size * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG unavailable');
    const pngUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = url;
  });
}

function formatControlValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  return value.toFixed(step < 0.01 ? 3 : 2).replace(/\.?0+$/, '');
}

function formatMacroControlValue(value: number): string {
  if (Math.abs(value) < 0.005) return '0';
  return `${value > 0 ? '+' : ''}${value.toFixed(2).replace(/\.?0+$/, '')}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export default SnowflakeGeneratorPage;
