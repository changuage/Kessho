import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ADVANCED_TAB_COLORS,
  ADVANCED_TAB_SHORTCUTS,
  TOP_LEVEL_SHORTCUTS,
  getAdvancedTabActiveStyle,
  isEditableShortcutTarget,
  type AdvancedTab,
} from './appNavigation';
import { useKeyboardScope } from '../ui/keyboard/useKeyboardScope';

type AppUiMode = 'snowflake' | 'advanced' | 'journey';

type UseAdvancedEditorNavigationOptions = {
  readonly uiMode: AppUiMode;
  readonly setUiMode: Dispatch<SetStateAction<AppUiMode>>;
  readonly snowflakeActivated: boolean;
  readonly setSnowflakeActivated: Dispatch<SetStateAction<boolean>>;
  readonly preloadAdvancedEditorRuntime: () => void;
};

export function useAdvancedEditorNavigation({
  uiMode,
  setUiMode,
  snowflakeActivated,
  setSnowflakeActivated,
  preloadAdvancedEditorRuntime,
}: UseAdvancedEditorNavigationOptions) {
  const [activeTab, setActiveTab] = useState<AdvancedTab>('routing');
  const activePageAccent = ADVANCED_TAB_COLORS[activeTab];
  const activeTabStyle = useMemo(() => getAdvancedTabActiveStyle(activePageAccent), [activePageAccent]);
  const activeTabRef = useRef(activeTab);
  const activePageAccentStyle = useMemo(
    () =>
      ({
        '--page-accent': activePageAccent,
      }) as CSSProperties,
    [activePageAccent],
  );

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (uiMode === 'advanced') preloadAdvancedEditorRuntime();
  }, [preloadAdvancedEditorRuntime, uiMode]);

  const openAdvancedTab = useCallback(
    (tab: AdvancedTab) => {
      if (uiMode === 'snowflake' && !snowflakeActivated) {
        setSnowflakeActivated(true);
      }
      preloadAdvancedEditorRuntime();
      setActiveTab(tab);
      setUiMode('advanced');
    },
    [preloadAdvancedEditorRuntime, setSnowflakeActivated, setUiMode, uiMode, snowflakeActivated],
  );

  useKeyboardScope({
    priority: 100,
    onKeyDown: (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableShortcutTarget(event.target)) return;

      const shortcutTarget = TOP_LEVEL_SHORTCUTS[event.key] ?? (!event.shiftKey ? TOP_LEVEL_SHORTCUTS[event.code] : undefined) ?? ADVANCED_TAB_SHORTCUTS[event.key];

      if (!shortcutTarget) return;

      event.preventDefault();
      if (shortcutTarget === 'snowflake') {
        setUiMode('snowflake');
        return;
      }
      if (shortcutTarget === 'journey') {
        setSnowflakeActivated(true);
        setUiMode('journey');
        return;
      }

      openAdvancedTab(shortcutTarget);
    },
  });

  return {
    activeTab,
    activeTabRef,
    activeTabStyle,
    activePageAccentStyle,
    setActiveTab,
    openAdvancedTab,
    isEditableShortcutTarget,
  };
}
