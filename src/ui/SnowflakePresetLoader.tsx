import { useMemo, useState, type CSSProperties } from 'react';
import type { PresetSummary } from '../presets/types';
import { TEXT_SYMBOLS } from '../designSystem/textSymbols';
import { JourneyPresetGlyph } from './JourneyPresetGlyph';
import type { SavedPreset } from './state';
import './snowflakePresetLoader.css';

type PresetPanelTab = 'state' | 'journey';
type PresetSortMode = 'updated' | 'az' | 'children';

type StatePresetFamily = {
  familyId: string;
  familyName: string;
  updatedAt: number;
  variants: SavedPreset[];
};

type SnowflakePresetLoaderProps = {
  presets: SavedPreset[];
  journeyPresets?: PresetSummary[];
  onLoadPreset: (preset: SavedPreset) => boolean | void | Promise<boolean | void>;
  onLoadJourneyPreset?: (name: string) => void | Promise<void>;
  buttonStyle?: CSSProperties;
  popupTop?: CSSProperties['top'];
  disableBlur?: boolean;
};

const SYMBOLS = {
  state: TEXT_SYMBOLS.hexagon,
  journey: '⟡\uFE0E',
  search: '⌕',
  updated: '◷\uFE0E',
  az: 'A↧',
  children: '⧉',
  expand: '›',
  collapse: '⌄',
  load: '↗\uFE0E',
  empty: '∅',
} as const;

const CHILD_COLORS = ['#C4724E', '#8B5CF6', '#7B9A6D', '#D4A520', '#5A7B8A', '#B8E0FF'];

function accentColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  return CHILD_COLORS[Math.abs(hash) % CHILD_COLORS.length] ?? CHILD_COLORS[0]!;
}

function familyId(preset: SavedPreset): string {
  const name = preset.familyName || preset.name;
  return preset.familyId || `state:${name.toLocaleLowerCase()}`;
}

function familyName(preset: SavedPreset): string {
  return preset.familyName || preset.name;
}

function variantName(preset: SavedPreset): string {
  return preset.variantName || preset.name;
}

function familyPrimary(family: StatePresetFamily): SavedPreset | undefined {
  return family.variants.find((preset) => preset.name === family.familyName)
    ?? family.variants.find((preset) => variantName(preset) === family.familyName)
    ?? family.variants.find((preset) => preset.variantRank === 0)
    ?? family.variants[0];
}

function updatedAt(preset: SavedPreset): number {
  const timestamp = new Date(preset.timestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sourceLabel(source: SavedPreset['source'] | PresetSummary['library'] | undefined): string {
  if (source === 'cloud') return 'Cloud';
  if (source === 'stock' || source === 'bundled') return 'Stock';
  if (source === 'user' || source === 'device-local') return 'Local';
  return 'Preset';
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function stateMatches(preset: SavedPreset, query: string): boolean {
  return !query || [preset.name, preset.familyName, preset.variantName, preset.source]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
}

function journeyMatches(preset: PresetSummary, query: string): boolean {
  return !query || [preset.name, preset.familyName, preset.variantName, preset.library, preset.description]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
}

function compareVariants(left: SavedPreset, right: SavedPreset): number {
  return (left.variantRank ?? Number.MAX_SAFE_INTEGER) - (right.variantRank ?? Number.MAX_SAFE_INTEGER)
    || variantName(left).localeCompare(variantName(right));
}

export function SnowflakePresetLoader({
  presets,
  journeyPresets = [],
  onLoadPreset,
  onLoadJourneyPreset,
  buttonStyle,
  popupTop = 'calc(66px + env(safe-area-inset-top))',
  disableBlur = false,
}: SnowflakePresetLoaderProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PresetPanelTab>('state');
  const [sort, setSort] = useState<PresetSortMode>('updated');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const query = useMemo(() => search.trim().toLocaleLowerCase(), [search]);

  const families = useMemo(() => {
    const grouped = new Map<string, StatePresetFamily>();
    for (const preset of presets) {
      const id = familyId(preset);
      const existing = grouped.get(id);
      if (existing) {
        existing.updatedAt = Math.max(existing.updatedAt, updatedAt(preset));
        existing.variants.push(preset);
      } else {
        grouped.set(id, { familyId: id, familyName: familyName(preset), updatedAt: updatedAt(preset), variants: [preset] });
      }
    }
    return Array.from(grouped.values())
      .map((family) => ({ ...family, variants: family.variants.sort(compareVariants) }))
      .filter((family) => !query || family.familyName.toLocaleLowerCase().includes(query) || family.variants.some((preset) => stateMatches(preset, query)))
      .sort((left, right) => {
        if (sort === 'children') return right.variants.length - left.variants.length || left.familyName.localeCompare(right.familyName);
        if (sort === 'az') return left.familyName.localeCompare(right.familyName);
        return right.updatedAt - left.updatedAt || left.familyName.localeCompare(right.familyName);
      });
  }, [presets, query, sort]);

  const journeys = useMemo(() => journeyPresets
    .filter((preset) => journeyMatches(preset, query))
    .sort((left, right) => {
      if (sort === 'children') return right.versionCount - left.versionCount || left.name.localeCompare(right.name);
      if (sort === 'az') return left.name.localeCompare(right.name);
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);
    }), [journeyPresets, query, sort]);

  const closeAfterStateLoad = async (preset: SavedPreset) => {
    if (await onLoadPreset(preset) !== false) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        style={{ ...buttonStyle, color: open ? '#ED5A24' : buttonStyle?.color }}
        onClick={() => setOpen((value) => !value)}
        title="Presets"
        aria-label="Presets"
        aria-expanded={open}
      >
        {TEXT_SYMBOLS.hexagon}
      </button>

      {open && (
        <div
          className={`snowflake-preset-loader${disableBlur ? ' snowflake-preset-loader--opaque' : ''}`}
          style={{ top: popupTop }}
          role="dialog"
          aria-label="Snowflake preset loader"
        >
          <header className="snowflake-preset-loader__header">
            <div className="snowflake-preset-loader__title-row">
              <strong>Snowflake Load</strong>
              <span>{tab === 'state' ? 'State' : 'Journey'}</span>
            </div>

            <div className="snowflake-preset-loader__tabs-row">
              <div className="snowflake-preset-loader__tabs">
                {(['state', 'journey'] as const).map((nextTab) => (
                  <button key={nextTab} type="button" className={tab === nextTab ? 'active' : ''} onClick={() => setTab(nextTab)}>
                    <span>{nextTab === 'state' ? SYMBOLS.state : SYMBOLS.journey}</span>
                    {nextTab === 'state' ? 'State' : 'Journey'}
                  </button>
                ))}
              </div>
              <span className="snowflake-preset-loader__count">{tab === 'state' ? families.length : journeys.length}</span>
            </div>

            <div className="snowflake-preset-loader__tools">
              <label className="snowflake-preset-loader__search">
                <span>{SYMBOLS.search}</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
                {search && <button type="button" onClick={() => setSearch('')} title="Clear search">×</button>}
              </label>
              <div className="snowflake-preset-loader__sorts">
                {([
                  ['updated', SYMBOLS.updated, 'Sort by updated'],
                  ['az', SYMBOLS.az, 'Sort alphabetically'],
                  ['children', SYMBOLS.children, 'Sort by children'],
                ] as const).map(([mode, symbol, title]) => (
                  <button key={mode} type="button" title={title} className={sort === mode ? 'active' : ''} onClick={() => setSort(mode)}>{symbol}</button>
                ))}
              </div>
            </div>
          </header>

          <div className="snowflake-preset-loader__list">
            {tab === 'state' && families.length === 0 && <div className="snowflake-preset-loader__empty">{SYMBOLS.empty}</div>}
            {tab === 'state' && families.map((family) => {
              const primary = familyPrimary(family);
              const hasChildren = family.variants.length > 1;
              const isExpanded = Boolean(expanded[family.familyId]) || Boolean(query && hasChildren);
              const familyMatchesQuery = family.familyName.toLocaleLowerCase().includes(query);
              const children = (query && !familyMatchesQuery ? family.variants.filter((preset) => stateMatches(preset, query)) : family.variants)
                .filter((preset) => preset !== primary);
              const toggle = () => setExpanded((value) => ({ ...value, [family.familyId]: !value[family.familyId] }));
              return (
                <div className="snowflake-preset-loader__family" key={family.familyId}>
                  <div className="snowflake-preset-loader__family-row">
                    <button type="button" className="snowflake-preset-loader__family-main" onClick={hasChildren ? toggle : () => primary && void closeAfterStateLoad(primary)}>
                      <span className="snowflake-preset-loader__glyph">{SYMBOLS.state}</span>
                      <span className="snowflake-preset-loader__copy">
                        <strong>{family.familyName}</strong>
                        <small><span>{sourceLabel(primary?.source)}</span>{hasChildren && <span>{SYMBOLS.children} {family.variants.length - 1}</span>}{family.updatedAt > 0 && <span>{formatDate(family.updatedAt)}</span>}</small>
                      </span>
                    </button>
                    {hasChildren && <button type="button" className="snowflake-preset-loader__mini" onClick={toggle} title={isExpanded ? 'Hide child states' : 'Show child states'}>{isExpanded ? SYMBOLS.collapse : SYMBOLS.expand}</button>}
                    <button type="button" className="snowflake-preset-loader__mini snowflake-preset-loader__load" disabled={!primary} onClick={() => primary && void closeAfterStateLoad(primary)} title={`Load ${family.familyName}`}>{SYMBOLS.load}</button>
                  </div>
                  {hasChildren && isExpanded && (
                    <div className="snowflake-preset-loader__children">
                      {children.map((preset) => (
                        <button key={`${preset.name}:${preset.variantName ?? ''}`} type="button" onClick={() => void closeAfterStateLoad(preset)}>
                          <span className="snowflake-preset-loader__dot" style={{ background: accentColor(preset.name), boxShadow: `0 0 8px ${accentColor(preset.name)}99` }} />
                          <span className="snowflake-preset-loader__copy"><strong>{variantName(preset)}</strong><small>{preset.name}</small></span>
                          <span>{SYMBOLS.load}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {tab === 'journey' && journeys.length === 0 && <div className="snowflake-preset-loader__empty">{SYMBOLS.empty}</div>}
            {tab === 'journey' && journeys.map((preset) => (
              <button
                className="snowflake-preset-loader__journey"
                key={`${preset.library}:${preset.name}`}
                type="button"
                title={preset.description ? `Load journey: ${preset.name}\n${preset.description}` : `Load journey: ${preset.name}`}
                onClick={() => { void onLoadJourneyPreset?.(preset.name); setOpen(false); }}
              >
                <span className="snowflake-preset-loader__glyph snowflake-preset-loader__glyph--journey"><JourneyPresetGlyph preview={preset.journeyPreview} color="#B8E0FF" mutedColor="rgba(184,224,255,0.36)" /></span>
                <span className="snowflake-preset-loader__copy"><strong>{preset.name}</strong><small><span>{sourceLabel(preset.library)}</span>{preset.versionCount > 1 && <span>{SYMBOLS.children} {preset.versionCount}</span>}{preset.updatedAt > 0 && <span>{formatDate(preset.updatedAt)}</span>}</small></span>
                <span className="snowflake-preset-loader__load-symbol">{SYMBOLS.load}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
