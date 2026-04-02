import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  SLIDER_HELP_CATALOG,
  type SliderHelpEntry,
  type SliderHelpSurface,
  type SliderPageId,
} from './sliderHelpCatalog';
import { BUTTON_HELP_CATALOG } from './buttonHelpCatalog';

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

export function useSliderHelp(): SliderHelpContextValue {
  return useContext(SliderHelpContext);
}

function normalizeLabel(label?: string): string | undefined {
  return label?.trim().toLowerCase();
}

function formatPage(page?: SliderPageId): string {
  switch (page) {
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

  if (page && label) {
    const exact = entry.surfaces.find((surface) => surface.page === page && normalizeLabel(surface.label) === label);
    if (exact) return exact;
  }

  if (page) {
    const pageMatch = entry.surfaces.find((surface) => surface.page === page);
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
  const tapRef = useRef<number[]>([]);

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
      <div
        onClick={handleCornerClick}
        style={styles.cornerTapTarget}
        title="Triple-click to toggle control help"
      />
      {visible && (
        <div style={styles.container}>
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
  container: {
    position: 'fixed',
    top: 8,
    right: 8,
    zIndex: 99998,
    maxWidth: 'min(360px, calc(100vw - 16px))',
    background: 'rgba(0,0,0,0.88)',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#d7d7d7',
    fontFamily: "Avenir, 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 12,
    lineHeight: 1.45,
    pointerEvents: 'none',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  },
  kicker: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#8f8f8f',
  },
  section: {
    color: '#707070',
  },
  title: {
    marginBottom: 4,
    fontSize: 15,
    fontWeight: 600,
    color: '#f4f4f4',
  },
  short: {
    marginBottom: 6,
    color: '#e8e8e8',
  },
  body: {
    color: '#b9b9b9',
  },
  note: {
    marginTop: 8,
    color: '#8fa7b4',
    fontSize: 11,
  },
};
