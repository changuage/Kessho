import React from 'react';
import {
  SliderPrimitive,
  resolveSliderPrimitiveSurface,
  resolveSliderViewport,
  type SliderPrimitiveSpec,
  type SliderViewport,
} from '../sliderSystem';
import './sliderLab.css';

const HERO_PAD = '#d7a96d';
const HERO_LEAD = '#9fc1ff';
const HERO_WATER = '#62b5ff';
const HERO_DRUMS = '#f29f78';
const HERO_GRAN = '#93d7d1';

const FULL_ROWS: SliderPrimitiveSpec[] = [
  { label: 'Pad Bloom', mode: 'single', value: 68, range: { min: 28, max: 76 }, unit: '%', hero: HERO_PAD },
  { label: 'Lead Motion', mode: 'walk', value: 54, range: { min: 26, max: 74 }, unit: '%', hero: HERO_LEAD },
  { label: 'Water Scatter', mode: 'sampleHold', value: 49, range: { min: 18, max: 83 }, unit: '%', hero: HERO_WATER },
];

const MATRIX_ROWS: Array<{ source: string; hero: string; cells: SliderPrimitiveSpec[] }> = [
  {
    source: 'Pad',
    hero: HERO_PAD,
    cells: [
      { label: 'Lvl', value: 72, mode: 'single' },
      { label: 'Rev', value: 58, mode: 'walk', range: { min: 31, max: 77 } },
      { label: 'Dly', value: 44, mode: 'sampleHold', range: { min: 14, max: 61 } },
    ],
  },
  {
    source: 'Lead',
    hero: HERO_LEAD,
    cells: [
      { label: 'Lvl', value: 62, mode: 'single' },
      { label: 'Rev', value: 39, mode: 'sampleHold', range: { min: 18, max: 73 } },
      { label: 'Dly', value: 48, mode: 'walk', range: { min: 26, max: 66 } },
    ],
  },
  {
    source: 'Water',
    hero: HERO_WATER,
    cells: [
      { label: 'Lvl', value: 79, mode: 'single' },
      { label: 'Rev', value: 56, mode: 'walk', range: { min: 21, max: 83 } },
      { label: 'Dly', value: 46, mode: 'single' },
    ],
  },
  {
    source: 'Drums',
    hero: HERO_DRUMS,
    cells: [
      { label: 'Lvl', value: 84, mode: 'single' },
      { label: 'Rev', value: 41, mode: 'sampleHold', range: { min: 22, max: 68 } },
      { label: 'Dly', value: 33, mode: 'walk', range: { min: 12, max: 54 } },
    ],
  },
  {
    source: 'Granular',
    hero: HERO_GRAN,
    cells: [
      { label: 'Lvl', value: 55, mode: 'walk', range: { min: 30, max: 70 } },
      { label: 'Rev', value: 64, mode: 'single' },
      { label: 'Dly', value: 38, mode: 'sampleHold', range: { min: 16, max: 60 } },
    ],
  },
];

const MATRIX_COLUMNS = ['Lvl', 'Rev', 'Dly'];

function surfaceDescription(viewport: SliderViewport, variant: 'full' | 'matrix'): string {
  const surface = resolveSliderPrimitiveSurface(viewport, variant);
  if (variant === 'full') {
    return `${surface.viewport} -> ${surface.variant} + ${surface.density}`;
  }
  return `${surface.viewport} -> ${surface.variant} + ${surface.density} ${surface.matrixPresentation}`;
}

function FullSurface({ viewport }: { viewport: SliderViewport }) {
  const surface = resolveSliderPrimitiveSurface(viewport, 'full');

  return (
    <div className={`sl-full sl-full--${surface.density}`}>
      {FULL_ROWS.map((spec) => (
        <SliderPrimitive
          key={`${viewport}:${spec.label}`}
          label={spec.label}
          mode={spec.mode}
          value={spec.value}
          range={spec.range}
          unit={spec.unit}
          hero={spec.hero}
          variant="full"
          density={surface.density}
        />
      ))}
    </div>
  );
}

function MatrixSurface({ viewport }: { viewport: SliderViewport }) {
  const surface = resolveSliderPrimitiveSurface(viewport, 'matrix');

  if (surface.matrixPresentation === 'cards') {
    return (
      <div className="sl-matrix-cards">
        {MATRIX_ROWS.map((row) => (
          <div key={`${viewport}:${row.source}`} className="sl-matrix-card">
            <div className="sl-matrix-card-head">{row.source}</div>
            <div className="sl-matrix-card-body">
              {row.cells.map((cell) => (
                <SliderPrimitive
                  key={`${viewport}:${row.source}:${cell.label}`}
                  label={cell.label}
                  mode={cell.mode}
                  value={cell.value}
                  range={cell.range}
                  hero={row.hero}
                  variant="matrix"
                  density={surface.density}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="sl-matrix-grid"
      style={{ gridTemplateColumns: `64px repeat(${MATRIX_COLUMNS.length}, minmax(0, 1fr))` }}
    >
      <div className="sl-matrix-corner">Src</div>
      {MATRIX_COLUMNS.map((heading) => (
        <div key={`${viewport}:${heading}`} className="sl-matrix-h">{heading}</div>
      ))}

      {MATRIX_ROWS.map((row) => (
        <React.Fragment key={`${viewport}:${row.source}:grid`}>
          <div className="sl-matrix-rowname">{row.source}</div>
          {row.cells.map((cell) => (
            <SliderPrimitive
              key={`${viewport}:${row.source}:${cell.label}`}
              label={cell.label}
              mode={cell.mode}
              value={cell.value}
              range={cell.range}
              hero={row.hero}
              variant="matrix"
              density={surface.density}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function SurfacePanel({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sl-panel">
      <div className="sl-panel-head">
        <h2>{title}</h2>
        <span>{caption}</span>
      </div>
      <div className="sl-panel-body">{children}</div>
    </section>
  );
}

export default function SliderLabPage({ isMobile = false }: { isMobile?: boolean }) {
  const currentViewport = resolveSliderViewport(isMobile);

  return (
    <div className="sl-root">
      <header className="sl-hero">
        <div className="sl-kicker">Slider System</div>
        <h1>One SliderPrimitive, one styling model, two responsive surfaces.</h1>
        <p>
          Tape Hero Bold is now the shared visual model for the unification work. The shared
          infrastructure lives in <code>src/ui/sliderSystem</code>, with explicit breakpoint rules so
          the app can choose the surface instead of each page inventing its own slider dialect.
        </p>
        <div className="sl-current-surface">
          Current app viewport: <strong>{surfaceDescription(currentViewport, 'full')}</strong> and{' '}
          <strong>{surfaceDescription(currentViewport, 'matrix')}</strong>
        </div>
      </header>

      <div className="sl-surface-grid">
        <SurfacePanel title="Desktop Web / Full" caption={surfaceDescription('desktop', 'full')}>
          <FullSurface viewport="desktop" />
        </SurfacePanel>

        <SurfacePanel title="Desktop Web / Matrix" caption={surfaceDescription('desktop', 'matrix')}>
          <MatrixSurface viewport="desktop" />
        </SurfacePanel>

        <SurfacePanel title="Mobile App-Web / Full" caption={surfaceDescription('mobile', 'full')}>
          <FullSurface viewport="mobile" />
        </SurfacePanel>

        <SurfacePanel title="Mobile App-Web / Matrix" caption={surfaceDescription('mobile', 'matrix')}>
          <MatrixSurface viewport="mobile" />
        </SurfacePanel>
      </div>
    </div>
  );
}
