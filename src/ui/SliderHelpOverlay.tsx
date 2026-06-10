import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  SLIDER_HELP_CATALOG,
  type SliderHelpEntry,
  type SliderHelpSurface,
  type SliderPageId,
} from './sliderHelpCatalog';
import { BUTTON_HELP_CATALOG } from './buttonHelpCatalog';
import { normalizeSliderPageId } from './pages/pageAliases';

type SliderHelpTarget = {
  paramKey: string;
  label?: string;
  page?: SliderPageId;
};

type SliderHelpAnnounceOptions = Omit<SliderHelpTarget, 'paramKey'>;

type SliderHelpContextValue = {
  visible: boolean;
  announceHelp: (paramKey: string, options?: SliderHelpAnnounceOptions) => void;
  announceSlider: (paramKey: string, options?: SliderHelpAnnounceOptions) => void;
};
type HelpViewport = 'desktop' | 'mobile' | 'tiny';

const noopAnnounce = (_paramKey: string, _options?: SliderHelpAnnounceOptions) => {};
const HELP_CATALOG: Record<string, SliderHelpEntry> = {
  ...SLIDER_HELP_CATALOG,
  ...BUTTON_HELP_CATALOG,
};

const SliderHelpContext = createContext<SliderHelpContextValue>({
  visible: false,
  announceHelp: noopAnnounce,
  announceSlider: noopAnnounce,
});

function getHelpViewport(): HelpViewport {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia('(max-width: 420px)').matches) return 'tiny';
  if (window.matchMedia('(max-width: 600px)').matches) return 'mobile';
  return 'desktop';
}

function listenToMediaQuery(query: MediaQueryList, callback: () => void): () => void {
  const modernQuery = query as MediaQueryList & {
    addEventListener?: (type: 'change', listener: () => void) => void;
    removeEventListener?: (type: 'change', listener: () => void) => void;
  };
  if (typeof modernQuery.addEventListener === 'function') {
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
  }

  const legacyQuery = query as MediaQueryList & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };
  legacyQuery.addListener?.(callback);
  return () => legacyQuery.removeListener?.(callback);
}

export function useSliderHelp(): SliderHelpContextValue {
  return useContext(SliderHelpContext);
}

function normalizeLabel(label?: string): string | undefined {
  return label?.trim().toLowerCase();
}

function formatPage(page?: SliderPageId): string {
  switch (page ? normalizeSliderPageId(page) : page) {
    case 'app':
      return 'App';
    case 'global':
      return 'Global';
    case 'synth':
      return 'Synth';
    case 'drums':
      return 'Drums';
    case 'reverb':
      return 'Reverb';
    case 'granular':
      return 'Granular';
    case 'earth':
      return 'Earth';
    case 'delay':
      return 'Delay';
    case 'texture':
      return 'Texture';
    case 'routing':
      return 'Routing';
    default:
      return 'Control Help';
  }
}

function resolveSurface(
  entry: SliderHelpEntry,
  target: SliderHelpTarget | null,
  activePage?: SliderPageId,
): SliderHelpSurface | null {
  if (!target) return null;
  const label = normalizeLabel(target.label);
  const page = target.page ?? activePage;
  const canonicalPage = page ? normalizeSliderPageId(page) : page;

  if (canonicalPage && label) {
    const exact = entry.surfaces.find((surface) => normalizeSliderPageId(surface.page) === canonicalPage && normalizeLabel(surface.label) === label);
    if (exact) return exact;
  }

  if (canonicalPage) {
    const pageMatch = entry.surfaces.find((surface) => normalizeSliderPageId(surface.page) === canonicalPage);
    if (pageMatch) return pageMatch;
  }

  if (label) {
    const labelMatch = entry.surfaces.find((surface) => normalizeLabel(surface.label) === label);
    if (labelMatch) return labelMatch;
  }

  return entry.surfaces[0] ?? null;
}

export const SliderHelpProvider: React.FC<{
  activePage?: SliderPageId;
  children: React.ReactNode;
}> = ({ activePage, children }) => {
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<SliderHelpTarget | null>(null);
  const [helpViewport, setHelpViewport] = useState<HelpViewport>(() => getHelpViewport());
  const tapRef = useRef<number[]>([]);
  const isMobileHelp = helpViewport !== 'desktop';
  const isTinyHelp = helpViewport === 'tiny';

  useEffect(() => {
    const tinyQuery = window.matchMedia('(max-width: 420px)');
    const mobileQuery = window.matchMedia('(max-width: 600px)');
    const updateViewport = () => {
      setHelpViewport((previous) => {
        const next = getHelpViewport();
        return previous === next ? previous : next;
      });
    };

    updateViewport();
    const stopTinyListener = listenToMediaQuery(tinyQuery, updateViewport);
    const stopMobileListener = listenToMediaQuery(mobileQuery, updateViewport);
    return () => {
      stopTinyListener();
      stopMobileListener();
    };
  }, []);

  const toggle = useCallback(() => {
    setVisible((prev) => !prev);
  }, []);

  const handleCornerClick = useCallback(() => {
    const now = Date.now();
    tapRef.current.push(now);
    if (tapRef.current.length > 3) tapRef.current.shift();
    if (tapRef.current.length === 3 && now - (tapRef.current[0] ?? now) < 800) {
      tapRef.current = [];
      toggle();
    }
  }, [toggle]);

  const announceHelp = useCallback((paramKey: string, options: SliderHelpAnnounceOptions = {}) => {
    if (!HELP_CATALOG[paramKey]) return;
    setTarget((prev) => {
      if (
        prev?.paramKey === paramKey &&
        prev.label === options.label &&
        prev.page === options.page
      ) {
        return prev;
      }
      return {
        paramKey,
        label: options.label,
        page: options.page,
      };
    });
  }, []);
  const announceSlider = useCallback((paramKey: string, options: SliderHelpAnnounceOptions = {}) => {
    announceHelp(paramKey, options);
  }, [announceHelp]);

  const entry = target ? HELP_CATALOG[target.paramKey] ?? null : null;
  const surface = entry ? resolveSurface(entry, target, activePage) : null;
  const note = surface?.audit[0];
  const title = surface?.label ?? target?.label ?? target?.paramKey ?? 'Control Help';
  const section = surface?.section;
  const pageLabel = formatPage(surface?.page ?? target?.page ?? activePage);

  const contextValue = useMemo(
    () => ({
      visible,
      announceHelp,
      announceSlider,
    }),
    [visible, announceHelp, announceSlider],
  );

  return (
    <>
      <SliderHelpContext.Provider value={contextValue}>
        {children}
      </SliderHelpContext.Provider>
      <button
        type="button"
        onClick={toggle}
        style={{
          ...styles.toggleButton,
          ...(isMobileHelp ? styles.toggleButtonMobile : null),
          ...(isTinyHelp ? styles.toggleButtonTiny : null),
          ...(visible ? styles.toggleButtonActive : null),
        }}
        title="Toggle control help"
        aria-label={visible ? 'Hide control help' : 'Show control help'}
        aria-pressed={visible}
      >
        {isTinyHelp ? (visible ? '×' : '?') : (visible ? 'Hide Help' : 'Show Help')}
      </button>
      <div
        onClick={handleCornerClick}
        style={styles.cornerTapTarget}
        title="Triple-click to toggle control help"
      />
      {visible && (
        <div
          style={{
            ...styles.container,
            ...(isMobileHelp ? styles.containerMobile : null),
          }}
        >
          <button
            type="button"
            onClick={toggle}
            style={styles.closeButton}
            aria-label="Dismiss control help"
            title="Dismiss control help"
          >
            ×
          </button>
          <div style={styles.kicker}>
            <span>{pageLabel}</span>
            {section && <span style={styles.section}>{section}</span>}
          </div>
          {entry ? (
            <>
              <div style={styles.title}>{title}</div>
              <div style={styles.short}>{entry.short}</div>
              <div style={styles.body}>{entry.long}</div>
              {note && <div style={styles.note}>Note: {note}</div>}
            </>
          ) : (
            <>
              <div style={styles.title}>Control Help</div>
              <div style={styles.body}>Hover or adjust a control to see what it does.</div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  cornerTapTarget: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    zIndex: 99999,
    cursor: 'default',
  },
  toggleButton: {
    position: 'fixed',
    top: 8,
    right: 8,
    zIndex: 100000,
    minHeight: 28,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.55)',
    color: '#d7d7d7',
    fontFamily: "Avenir, 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
  },
  toggleButtonMobile: {
    top: 'auto',
    right: 'calc(env(safe-area-inset-right) + 10px)',
    bottom: 'calc(env(safe-area-inset-bottom) + 10px)',
    minHeight: 34,
    padding: '0 9px',
    fontSize: 10,
  },
  toggleButtonTiny: {
    width: 36,
    minWidth: 36,
    minHeight: 36,
    padding: 0,
    borderRadius: 999,
    fontSize: 17,
    lineHeight: 1,
  },
  toggleButtonActive: {
    background: 'rgba(29, 39, 56, 0.88)',
    border: '1px solid rgba(165,196,212,0.32)',
    color: '#eef6ff',
  },
  container: {
    position: 'fixed',
    left: '50%',
    right: 'auto',
    top: 'auto',
    bottom: 18,
    transform: 'translateX(-50%)',
    zIndex: 99998,
    width: 'min(640px, calc(100vw - 32px))',
    maxWidth: 'min(640px, calc(100vw - 32px))',
    background: 'rgba(20, 20, 35, 0.62)',
    border: '1px solid rgba(247, 250, 252, 0.2)',
    borderRadius: 8,
    padding: '10px 40px 12px 14px',
    color: '#F7FAFC',
    fontFamily: "Avenir, 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 12,
    lineHeight: 1.45,
    pointerEvents: 'auto',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 14px 36px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  containerMobile: {
    top: 'auto',
    right: 'auto',
    left: '50%',
    bottom: 'calc(env(safe-area-inset-bottom) + 56px)',
    width: 'min(340px, calc(100vw - 16px))',
    maxWidth: 'min(340px, calc(100vw - 16px))',
    maxHeight: 'min(46vh, 320px)',
    overflow: 'auto',
    pointerEvents: 'auto',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    WebkitOverflowScrolling: 'touch',
  },
  closeButton: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 999,
    border: '1px solid rgba(247, 250, 252, 0.16)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(247, 250, 252, 0.72)',
    cursor: 'pointer',
    lineHeight: 1,
    fontSize: 16,
  },
  kicker: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'rgba(247, 250, 252, 0.52)',
  },
  section: {
    color: 'rgba(184, 224, 255, 0.56)',
  },
  title: {
    marginBottom: 4,
    fontSize: 15,
    fontWeight: 600,
    color: '#F7FAFC',
  },
  short: {
    marginBottom: 6,
    color: 'rgba(247, 250, 252, 0.9)',
  },
  body: {
    color: 'rgba(247, 250, 252, 0.7)',
  },
  note: {
    marginTop: 8,
    color: 'rgba(184, 224, 255, 0.68)',
    fontSize: 11,
  },
};
