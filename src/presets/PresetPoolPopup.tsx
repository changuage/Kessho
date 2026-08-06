import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PresetPoolCandidate } from './presetPool';
import { collectPresetPoolTags, presetPoolCandidateMatches } from './presetPool';
import { PresetRatingStars } from './PresetRatingStars';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from './sharedMode';

type PresetPoolSortMode = 'updated' | 'az';

interface PresetPoolPopupProps {
  open: boolean;
  title: string;
  candidates: PresetPoolCandidate[];
  poolIds: string[];
  accentColor?: string;
  onChange: (ids: string[]) => void;
  onReset: () => void;
  onClose: () => void;
  onAudition?: (candidate: PresetPoolCandidate) => void | Promise<void>;
  onLoad?: (candidate: PresetPoolCandidate) => void | Promise<void>;
  onDelete?: (candidate: PresetPoolCandidate) => boolean | void | Promise<boolean | void>;
  onRate?: (candidate: PresetPoolCandidate, rating: number) => boolean | void | Promise<boolean | void>;
}

const POOL_SORT_SYMBOLS = {
  updated: '◷\uFE0E',
  az: 'A↧',
} as const;

const POOL_SORT_OPTIONS: readonly [PresetPoolSortMode, string, string][] = [
  ['updated', POOL_SORT_SYMBOLS.updated, 'Sort by updated'],
  ['az', POOL_SORT_SYMBOLS.az, 'Sort alphabetically'],
];

const POOL_ACTION_ICONS = {
  audition: '▶',
  load: '↗',
  delete: '✕',
} as const;

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    padding: 12,
    background: 'rgba(0,0,0,0.66)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  panel: {
    width: 'min(880px, calc(100vw - 20px))',
    maxHeight: 'min(84dvh, 680px)',
    background: 'linear-gradient(135deg, #191815 0%, #151512 56%, #111416 100%)',
    border: '1px solid rgba(239,230,207,0.24)',
    borderRadius: 16,
    boxShadow: '0 28px 90px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.04)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '18px 22px 14px',
    borderBottom: '1px solid rgba(239,230,207,0.12)',
  },
  kicker: {
    color: '#f3ead6',
    fontSize: '0.82rem',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 8,
  },
  title: {
    color: 'rgba(244,237,228,0.76)',
    fontSize: '0.7rem',
    fontWeight: 800,
    lineHeight: 1.2,
  },
  closeButton: {
    background: 'rgba(255,255,255,0.035)',
    color: 'rgba(244,237,228,0.78)',
    border: '1px solid rgba(244,237,228,0.16)',
    borderRadius: 8,
    cursor: 'pointer',
    width: 36,
    height: 36,
    fontSize: '0.82rem',
    fontWeight: 800,
  },
  controls: {
    display: 'grid',
    gap: 8,
    padding: '13px 22px 14px',
    borderBottom: '1px solid rgba(239,230,207,0.1)',
  },
  controlTopRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 8,
    border: '1px solid rgba(239,230,207,0.18)',
    background: 'rgba(7,7,6,0.42)',
    color: '#f4ede4',
    boxSizing: 'border-box',
    fontSize: '0.78rem',
    fontWeight: 650,
    outline: 'none',
  },
  sortBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 32px)',
    gap: 4,
    padding: 2,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(239,230,207,0.14)',
  },
  sortButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '0.68rem',
    fontFamily: 'inherit',
    fontWeight: 760,
    lineHeight: 1,
  },
  tagToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid rgba(239,230,207,0.14)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(244,237,228,0.58)',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontFamily: 'inherit',
    fontWeight: 860,
    lineHeight: 1,
  },
  timeSortIcon: {
    display: 'block',
    fontSize: '0.92rem',
    lineHeight: 1,
  },
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  tagPanel: {
    flex: '0 0 178px',
    width: 178,
    overflow: 'hidden',
    borderRight: '1px solid rgba(239,230,207,0.1)',
    background: 'rgba(8,8,7,0.2)',
    transition: 'flex-basis 0.18s ease, width 0.18s ease, opacity 0.18s ease, transform 0.18s ease',
    minHeight: 0,
  },
  tagPanelInner: {
    width: 178,
    padding: '12px 10px',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    gap: 8,
    height: '100%',
  },
  tagPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    color: 'rgba(244,237,228,0.52)',
    fontSize: '0.58rem',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  tagList: {
    overflowY: 'auto',
    display: 'grid',
    alignContent: 'start',
    gap: 5,
    paddingRight: 2,
    scrollbarColor: 'rgba(244,237,228,0.4) rgba(10,10,10,0.22)',
  },
  tagButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    textAlign: 'left' as const,
    border: '1px solid rgba(239,230,207,0.14)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.035)',
    color: 'rgba(244,237,228,0.68)',
    cursor: 'pointer',
    fontSize: '0.58rem',
    fontWeight: 800,
    padding: '6px 8px',
  },
  tagCount: {
    color: 'rgba(244,237,228,0.42)',
    fontSize: '0.54rem',
    fontWeight: 850,
  },
  list: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'grid',
    alignContent: 'start',
    gridAutoRows: 'min-content',
    gap: 7,
    scrollbarColor: 'rgba(244,237,228,0.54) rgba(10,10,10,0.28)',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    minHeight: 70,
    borderRadius: 8,
    border: '1px solid rgba(239,230,207,0.1)',
    background: 'rgba(255,255,255,0.035)',
    cursor: 'pointer',
  },
  selectionButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(255,255,255,0.055)',
    border: '1px solid rgba(239,230,207,0.1)',
    cursor: 'pointer',
    padding: 0,
  },
  selectionMark: {
    width: 16,
    height: 16,
    borderRadius: 5,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(239,230,207,0.28)',
    background: 'rgba(0,0,0,0.18)',
  },
  selectionTick: {
    width: 8,
    height: 5,
    borderLeft: '2px solid currentColor',
    borderBottom: '2px solid currentColor',
    transform: 'rotate(-45deg) translate(1px, -1px)',
  },
  rowTitleLine: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    minWidth: 0,
  },
  rowTitle: {
    color: '#f5eddf',
    fontSize: '0.84rem',
    fontWeight: 850,
    lineHeight: 1.2,
  },
  rowMeta: {
    color: 'rgba(244,237,228,0.55)',
    fontSize: '0.66rem',
    fontWeight: 700,
    lineHeight: 1.2,
    marginTop: 4,
  },
  rowTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  rowTag: {
    border: '1px solid rgba(239,230,207,0.1)',
    borderRadius: 8,
    color: 'rgba(244,237,228,0.62)',
    background: 'rgba(255,255,255,0.025)',
    fontSize: '0.55rem',
    fontWeight: 800,
    padding: '2px 5px',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  actionButton: {
    border: '1px solid rgba(239,230,207,0.16)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.045)',
    color: 'rgba(244,237,228,0.78)',
    cursor: 'pointer',
    fontSize: '0.68rem',
    padding: '7px 10px',
    fontWeight: 850,
    minHeight: 34,
  },
  iconActionButton: {
    width: 38,
    minWidth: 38,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.86rem',
    lineHeight: 1,
  },
  primaryButton: {
    background: 'rgba(88,134,98,0.18)',
  },
  dangerButton: {
    background: 'rgba(196,92,92,0.12)',
    color: '#d88f8f',
    borderColor: 'rgba(196,92,92,0.28)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 22px 14px',
    borderTop: '1px solid rgba(239,230,207,0.12)',
    background: 'rgba(8,8,7,0.22)',
  },
  footerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  count: {
    color: 'rgba(244,237,228,0.56)',
    fontSize: '0.68rem',
    fontWeight: 800,
  },
  confirmOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10001,
    background: 'rgba(0,0,0,0.56)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  confirmDialog: {
    minWidth: 260,
    maxWidth: 'min(380px, calc(100vw - 28px))',
    borderRadius: 10,
    border: '1px solid rgba(239,230,207,0.16)',
    background: '#171615',
    color: 'rgba(244,237,228,0.78)',
    padding: 14,
    boxShadow: '0 24px 70px rgba(0,0,0,0.62)',
    textAlign: 'center',
    fontSize: '0.78rem',
    fontWeight: 720,
  },
  confirmButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
};

const inactiveTagColor = 'rgba(244,237,228,0.68)';
const inactiveTagBorder = 'rgba(239,230,207,0.14)';
const inactiveRowBackground = 'rgba(255,255,255,0.035)';
const selectedSortBackground = 'rgba(184,224,255,0.18)';
const inactiveSortColor = 'rgba(244,237,228,0.55)';

function matchKey(value: string): string {
  return value.trim().toLowerCase();
}

function candidateKeys(candidate: PresetPoolCandidate): string[] {
  return [
    candidate.id,
    candidate.name,
    ...(candidate.aliases ?? []),
  ].filter(Boolean).map(matchKey);
}

function getCandidateUpdatedAt(candidate: PresetPoolCandidate): number {
  return Number.isFinite(candidate.updatedAt) ? candidate.updatedAt ?? 0 : 0;
}

function getCandidateTags(candidate: PresetPoolCandidate): string[] {
  return [...new Set((candidate.tags ?? []).map(matchKey).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function getCandidateOriginalOrder(indexById: Map<string, number>, candidate: PresetPoolCandidate): number {
  return indexById.get(candidate.id) ?? Number.MAX_SAFE_INTEGER;
}

function compareByName(left: PresetPoolCandidate, right: PresetPoolCandidate): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function comparePoolCandidates(
  left: PresetPoolCandidate,
  right: PresetPoolCandidate,
  sortMode: PresetPoolSortMode,
  indexById: Map<string, number>,
): number {
  if (sortMode === 'az') return compareByName(left, right);

  const updatedDiff = getCandidateUpdatedAt(right) - getCandidateUpdatedAt(left);
  if (updatedDiff !== 0) return updatedDiff;
  return getCandidateOriginalOrder(indexById, left) - getCandidateOriginalOrder(indexById, right) || compareByName(left, right);
}

function removeCandidateFromPool(poolIds: string[], candidate: PresetPoolCandidate): string[] {
  const keys = new Set(candidateKeys(candidate));
  return poolIds.filter(id => !keys.has(matchKey(id)));
}

function toggleCandidate(poolIds: string[], candidate: PresetPoolCandidate): string[] {
  if (presetPoolCandidateMatches(candidate, poolIds)) {
    return removeCandidateFromPool(poolIds, candidate);
  }
  return [...poolIds, candidate.id];
}

function canDeleteCandidate(candidate: PresetPoolCandidate): boolean {
  return PRESET_DELETE_ENABLED && (SHARED_PRESET_TEST_MODE || candidate.library !== 'stock');
}

export function PresetPoolPopup({
  open,
  title,
  candidates,
  poolIds,
  accentColor = '#B8E0FF',
  onChange,
  onReset,
  onClose,
  onAudition,
  onLoad,
  onDelete,
  onRate,
}: PresetPoolPopupProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [sortMode, setSortMode] = useState<PresetPoolSortMode>('updated');
  const [selectedId, setSelectedId] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<PresetPoolCandidate | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const tags = useMemo(() => collectPresetPoolTags(candidates), [candidates]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      for (const tag of getCandidateTags(candidate)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [candidates]);
  const candidateOrder = useMemo(
    () => new Map(candidates.map((candidate, index) => [candidate.id, index])),
    [candidates],
  );
  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter(candidate => {
      if (activeTag && !(candidate.tags ?? []).map(matchKey).includes(activeTag)) return false;
      if (!needle) return true;
      const haystack = [
        candidate.name,
        candidate.id,
        candidate.subtitle ?? '',
        candidate.library ?? '',
        ...(candidate.tags ?? []),
        ...(candidate.aliases ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    }).sort((left, right) => comparePoolCandidates(left, right, sortMode, candidateOrder));
  }, [activeTag, candidateOrder, candidates, query, sortMode]);
  const selectedCandidate = useMemo(
    () => candidates.find(candidate => candidate.id === selectedId) ?? filteredCandidates[0] ?? null,
    [candidates, filteredCandidates, selectedId],
  );
  const selectedCount = poolIds.length;
  const displayTitle = title.replace(/^Preset Pool:\s*/i, '').trim() || title;
  const tagPanelOpen = showTagPanel && tags.length > 0;
  const selectedCanDelete = Boolean(selectedCandidate && onDelete && canDeleteCandidate(selectedCandidate));

  useEffect(() => {
    if (!open) {
      setDeleteCandidate(null);
      setSelectedId('');
    }
  }, [open]);

  const handleTagPanelToggle = () => {
    setShowTagPanel(current => {
      const next = !current;
      if (!next) setActiveTag(null);
      return next;
    });
  };
  const handleConfirmDelete = async () => {
    if (!deleteCandidate || !onDelete) return;
    const deleted = await onDelete(deleteCandidate);
    if (deleted === false) return;
    onChange(removeCandidateFromPool(poolIds, deleteCandidate));
    if (selectedId === deleteCandidate.id) setSelectedId('');
    setDeleteCandidate(null);
  };
  const handleRateCandidate = async (candidate: PresetPoolCandidate, rating: number) => {
    const previousIdRating = localRatings[candidate.id];
    const previousNameRating = localRatings[candidate.name];
    setLocalRatings(prev => ({
      ...prev,
      [candidate.id]: rating,
      [candidate.name]: rating,
    }));
    try {
      const updated = await onRate?.(candidate, rating);
      if (updated === false) throw new Error(`Rating for preset "${candidate.name}" was not updated.`);
    } catch {
      setLocalRatings(prev => {
        const next = { ...prev };
        if (next[candidate.id] === rating) {
          if (previousIdRating === undefined) delete next[candidate.id];
          else next[candidate.id] = previousIdRating;
        }
        if (next[candidate.name] === rating) {
          if (previousNameRating === undefined) delete next[candidate.name];
          else next[candidate.name] = previousNameRating;
        }
        return next;
      });
    }
  };

  if (!open) return null;

  const content = (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={event => event.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.kicker}>Preset Pool</div>
            <div style={styles.titleRow}>
              <div style={styles.title}>{displayTitle}</div>
              <div style={styles.count}>{selectedCount} / {candidates.length} selected</div>
            </div>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Close pool popup">
            x
          </button>
        </div>

        <div style={styles.controls}>
          <div style={styles.controlTopRow}>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search presets"
              style={styles.input}
              autoFocus
            />
            <div style={styles.sortBar}>
              {POOL_SORT_OPTIONS.map(([sort, symbol, label]) => (
                <button
                  key={sort}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => setSortMode(sort)}
                  style={{
                    ...styles.sortButton,
                    background: sortMode === sort ? selectedSortBackground : 'transparent',
                    color: sortMode === sort ? accentColor : inactiveSortColor,
                    fontSize: sort === 'updated' ? '0.96rem' : '0.68rem',
                  }}
                >
                  <span style={sort === 'updated' ? styles.timeSortIcon : undefined}>{symbol}</span>
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <button
                type="button"
                title={tagPanelOpen ? 'Hide tags' : 'Show tags'}
                aria-label={tagPanelOpen ? 'Hide tags' : 'Show tags'}
                aria-pressed={tagPanelOpen}
                onClick={handleTagPanelToggle}
                style={{
                  ...styles.tagToggleButton,
                  color: tagPanelOpen ? accentColor : inactiveSortColor,
                  borderColor: tagPanelOpen ? `${accentColor}66` : 'rgba(239,230,207,0.14)',
                  background: tagPanelOpen ? `${accentColor}18` : 'rgba(255,255,255,0.04)',
                }}
              >
                #
              </button>
            )}
          </div>
        </div>

        <div style={styles.body}>
          {tags.length > 0 && (
            <aside
              style={{
                ...styles.tagPanel,
                flexBasis: tagPanelOpen ? 178 : 0,
                width: tagPanelOpen ? 178 : 0,
                opacity: tagPanelOpen ? 1 : 0,
                transform: tagPanelOpen ? 'translateX(0)' : 'translateX(-12px)',
                pointerEvents: tagPanelOpen ? 'auto' : 'none',
                borderRightColor: tagPanelOpen ? 'rgba(239,230,207,0.1)' : 'transparent',
              }}
              aria-hidden={!tagPanelOpen}
            >
              {tagPanelOpen && (
                <div style={styles.tagPanelInner}>
                  <div style={styles.tagPanelHeader}>
                    <span>Tags</span>
                    <span>{activeTag ?? 'all'}</span>
                  </div>
                  <div style={styles.tagList}>
                    <button
                      type="button"
                      style={{
                        ...styles.tagButton,
                        color: activeTag === null ? accentColor : inactiveTagColor,
                        borderColor: activeTag === null ? `${accentColor}66` : inactiveTagBorder,
                        background: activeTag === null ? `${accentColor}14` : 'rgba(255,255,255,0.035)',
                      }}
                      onClick={() => setActiveTag(null)}
                    >
                      <span>all</span>
                      <span style={styles.tagCount}>{candidates.length}</span>
                    </button>
                    {tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        style={{
                          ...styles.tagButton,
                          color: activeTag === tag ? accentColor : inactiveTagColor,
                          borderColor: activeTag === tag ? `${accentColor}66` : inactiveTagBorder,
                          background: activeTag === tag ? `${accentColor}14` : 'rgba(255,255,255,0.035)',
                        }}
                        onClick={() => setActiveTag(current => current === tag ? null : tag)}
                      >
                        <span>{tag}</span>
                        <span style={styles.tagCount}>{tagCounts.get(tag) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}

          <div style={styles.list}>
            {filteredCandidates.map(candidate => {
              const inPool = presetPoolCandidateMatches(candidate, poolIds);
              const isSelected = selectedCandidate?.id === candidate.id;
              const rowCanDelete = Boolean(onDelete && canDeleteCandidate(candidate));
              const rating = localRatings[candidate.id] ?? localRatings[candidate.name] ?? candidate.rating ?? 0;
              return (
                <div
                  key={candidate.id}
                  style={{
                    ...styles.row,
                    borderColor: isSelected ? `${accentColor}66` : inPool ? 'rgba(239,230,207,0.2)' : 'rgba(239,230,207,0.1)',
                    background: isSelected
                      ? 'linear-gradient(90deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035))'
                      : inPool
                        ? 'rgba(255,255,255,0.055)'
                        : inactiveRowBackground,
                    boxShadow: isSelected ? `inset 0 0 0 1px ${accentColor}22` : 'none',
                  }}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={inPool}
                    aria-label={`Toggle ${candidate.name}`}
                    onClick={event => {
                      event.stopPropagation();
                      onChange(toggleCandidate(poolIds, candidate));
                    }}
                    style={{
                      ...styles.selectionButton,
                      borderColor: inPool ? `${accentColor}55` : 'rgba(239,230,207,0.1)',
                      background: inPool ? `${accentColor}16` : 'rgba(255,255,255,0.055)',
                      boxShadow: inPool ? `inset 0 0 0 1px ${accentColor}18` : 'none',
                    }}
                  >
                    <span
                      style={{
                        ...styles.selectionMark,
                        color: accentColor,
                        borderColor: inPool ? `${accentColor}88` : 'rgba(239,230,207,0.24)',
                        background: inPool ? `${accentColor}20` : 'rgba(0,0,0,0.18)',
                      }}
                    >
                      {inPool && <span style={styles.selectionTick} />}
                    </span>
                  </button>
                  <div>
                    <div style={styles.rowTitleLine}>
                      <div style={styles.rowTitle}>{candidate.name}</div>
                      {onRate && (
                        <PresetRatingStars
                          value={rating}
                          onChange={(nextRating) => handleRateCandidate(candidate, nextRating)}
                          color={accentColor}
                          size="0.58rem"
                          hitSize="1.28rem"
                        />
                      )}
                    </div>
                    <div style={styles.rowMeta}>
                      {[candidate.library, candidate.subtitle].filter(Boolean).join(' - ') || candidate.id}
                    </div>
                    {(candidate.tags?.length ?? 0) > 0 && (
                      <div style={styles.rowTags}>
                        {candidate.tags!.slice(0, 6).map(tag => (
                          <span key={tag} style={styles.rowTag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={styles.actions}>
                    {onAudition && (
                      <button
                        type="button"
                        style={{ ...styles.actionButton, ...styles.iconActionButton }}
                        title={`Audition ${candidate.name}`}
                        aria-label={`Audition ${candidate.name}`}
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedId(candidate.id);
                          void onAudition(candidate);
                        }}
                      >
                        <span aria-hidden="true">{POOL_ACTION_ICONS.audition}</span>
                      </button>
                    )}
                    {onLoad && (
                      <button
                        type="button"
                        style={{ ...styles.actionButton, ...styles.iconActionButton, ...styles.primaryButton, color: accentColor, borderColor: `${accentColor}55` }}
                        title={`Load ${candidate.name}`}
                        aria-label={`Load ${candidate.name}`}
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedId(candidate.id);
                          void onLoad(candidate);
                        }}
                      >
                        <span aria-hidden="true">{POOL_ACTION_ICONS.load}</span>
                      </button>
                    )}
                    {rowCanDelete && (
                      <button
                        type="button"
                        style={{ ...styles.actionButton, ...styles.iconActionButton, ...styles.dangerButton }}
                        title={`Delete ${candidate.name}`}
                        aria-label={`Delete ${candidate.name}`}
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedId(candidate.id);
                          setDeleteCandidate(candidate);
                        }}
                      >
                        <span aria-hidden="true">{POOL_ACTION_ICONS.delete}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredCandidates.length === 0 && (
              <div style={{ color: 'rgba(244,237,228,0.55)', fontSize: '0.8rem', padding: 16 }}>
              No presets match the current filters.
              </div>
            )}
          </div>
        </div>

        <div style={styles.footer}>
          <button type="button" style={styles.actionButton} onClick={onReset}>
            Reset defaults
          </button>
          <div style={styles.footerActions}>
            {selectedCandidate && onAudition && (
              <button
                type="button"
                style={{ ...styles.actionButton, ...styles.iconActionButton }}
                title="Audition selected"
                aria-label="Audition selected"
                onClick={() => void onAudition(selectedCandidate)}
              >
                <span aria-hidden="true">{POOL_ACTION_ICONS.audition}</span>
              </button>
            )}
            {selectedCandidate && onLoad && (
              <button
                type="button"
                style={{ ...styles.actionButton, ...styles.iconActionButton, ...styles.primaryButton, color: accentColor, borderColor: `${accentColor}55` }}
                title="Load selected"
                aria-label="Load selected"
                onClick={() => void onLoad(selectedCandidate)}
              >
                <span aria-hidden="true">{POOL_ACTION_ICONS.load}</span>
              </button>
            )}
            {selectedCandidate && selectedCanDelete && (
              <button
                type="button"
                style={{ ...styles.actionButton, ...styles.iconActionButton, ...styles.dangerButton }}
                title="Delete selected"
                aria-label="Delete selected"
                onClick={() => setDeleteCandidate(selectedCandidate)}
              >
                <span aria-hidden="true">{POOL_ACTION_ICONS.delete}</span>
              </button>
            )}
            <button type="button" style={styles.actionButton} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        {deleteCandidate && (
          <div
            style={styles.confirmOverlay}
            onClick={event => {
              event.stopPropagation();
              setDeleteCandidate(null);
            }}
          >
            <div style={styles.confirmDialog} onClick={event => event.stopPropagation()}>
              <div>Delete &quot;{deleteCandidate.name}&quot;?</div>
              <div style={styles.confirmButtons}>
                <button
                  type="button"
                  style={{ ...styles.actionButton, ...styles.dangerButton }}
                  onClick={() => { void handleConfirmDelete(); }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  style={styles.actionButton}
                  onClick={() => setDeleteCandidate(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
