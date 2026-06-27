import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useIsMobileViewport } from '../ui/hooks/useIsMobileViewport';

export type AppMobileStyleOverrides = {
  readonly container: CSSProperties;
  readonly controls: CSSProperties;
  readonly grid: CSSProperties;
  readonly panel: CSSProperties;
  readonly panelTitle: CSSProperties;
  readonly sliderGroup: CSSProperties;
  readonly sliderLabel: CSSProperties;
  readonly select: CSSProperties;
  readonly tabBar: CSSProperties;
  readonly tab: CSSProperties;
  readonly tabIcon: CSSProperties;
  readonly iconButton: CSSProperties;
  readonly debugPanel: CSSProperties;
};

function createMobileStyleOverrides(): AppMobileStyleOverrides {
  return {
    container: {
      padding: '4px',
      maxWidth: '100%',
      overflowX: 'hidden',
    },
    controls: {
      gap: '4px',
      marginBottom: '10px',
      paddingTop: '6px',
    },
    grid: {
      gridTemplateColumns: '1fr',
      gap: '8px',
      marginBottom: '12px',
    },
    panel: {
      padding: '10px',
      borderRadius: '8px',
      maxWidth: '100%',
      overflow: 'hidden',
    },
    panelTitle: {
      fontSize: '0.9rem',
      marginBottom: '8px',
    },
    sliderGroup: {
      marginBottom: '8px',
      maxWidth: '100%',
      overflow: 'hidden',
    },
    sliderLabel: {
      fontSize: '0.75rem',
      marginBottom: '3px',
      gap: '4px',
    },
    select: {
      fontSize: '0.78rem',
      padding: '6px 8px',
      minHeight: '36px',
      maxWidth: '100%',
    },
    tabBar: {
      justifyContent: 'flex-start',
      gap: '4px',
      padding: '5px max(6px, env(safe-area-inset-left))',
      borderRadius: '8px',
      marginBottom: '8px',
      flexWrap: 'nowrap',
      overflowX: 'auto',
      overflowY: 'hidden',
      maxWidth: '100%',
      width: '100%',
      scrollSnapType: 'x proximity',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
    },
    tab: {
      flex: '0 0 58px',
      minWidth: '58px',
      minHeight: '44px',
      padding: '6px 4px',
      fontSize: '0.58rem',
      gap: '2px',
      scrollSnapAlign: 'start',
      whiteSpace: 'nowrap',
    },
    tabIcon: { fontSize: '0.9rem' },
    iconButton: {
      width: '36px',
      height: '36px',
      fontSize: '1.2rem',
      padding: '4px',
    },
    debugPanel: {
      padding: '10px',
      fontSize: '0.75rem',
      wordBreak: 'break-all',
      overflow: 'hidden',
    },
  };
}

export function useAppResponsiveShell(): {
  readonly isMobile: boolean;
  readonly isMobileViewport: boolean;
  readonly mobileStyleOverrides: AppMobileStyleOverrides | null;
  readonly expandedPanels: Set<string>;
  readonly togglePanel: (panelId: string) => void;
} {
  const isMobileViewport = useIsMobileViewport();
  const mobileStyleOverrides = useMemo(
    () => (isMobileViewport ? createMobileStyleOverrides() : null),
    [isMobileViewport],
  );
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(() => new Set());
  const togglePanel = useCallback((panelId: string) => {
    setExpandedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  return {
    isMobile: isMobileViewport,
    isMobileViewport,
    mobileStyleOverrides,
    expandedPanels,
    togglePanel,
  };
}
