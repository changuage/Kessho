/**
 * Journey Mode View
 * 
 * Wraps DiamondJourneyUI with audio integration and navigation.
 * This is the production Journey Mode (not demo) that connects to
 * the actual audio engine for preset loading and morphing.
 * 
 * The journey state is managed at App level so it persists when
 * switching between UI modes (Snowflake, Advanced, Journey).
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { DiamondJourneyUI } from './DiamondJourneyUI';
import { UseJourneyResult } from './journeyState';
import { JourneyConfig, DiamondPosition } from '../audio/journeyTypes';
import { SavedPreset } from './state';

// Unicode symbols with text variation selector (U+FE0E) to prevent emoji rendering
const TEXT_SYMBOLS = {
  snowflake: '❄\uFE0E',
  sparkle: '✲\uFE0E',
  diamond: '◇\uFE0E',
} as const;

interface JourneyModeViewProps {
  // Presets from app state
  presets: SavedPreset[];
  
  // Journey state from App (managed at app level for persistence)
  journey: UseJourneyResult;
  
  // Lifecycle callbacks
  onJourneyEnd: () => void;
  onStopAudio: () => void;
  
  // Navigation
  onShowSnowflake: () => void;
  onShowAdvanced: () => void;
  
  // Audio state
  isPlaying: boolean;
}

export const JourneyModeView: React.FC<JourneyModeViewProps> = ({
  presets,
  journey,
  onJourneyEnd,
  onStopAudio,
  onShowSnowflake,
  onShowAdvanced,
  isPlaying: _isPlaying, // Reserved for future use
}) => {
  // Track window size for responsive layout
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate nav position to match SnowflakeUI canvas sizing
  const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
  const isMobile = windowSize.width < 1024;
  const canvasSize = isMobile 
    ? Math.max(250, Math.min(smallerDimension * 0.875, 650))
    : Math.max(200, Math.min(smallerDimension * 0.7, 550));
  
  // Calculate button position to match SnowflakeUI
  const canvasTop = (windowSize.height - canvasSize) / 2;
  const canvasBottom = canvasTop + canvasSize;
  const bottomGap = windowSize.height - canvasBottom;
  const navBottom = Math.max(10, bottomGap / 2 - 20);
  
  // Track if we're in an active journey
  const journeyActiveRef = useRef(false);
  
  // Create empty diamond config on mount if needed
  useEffect(() => {
    if (!journey.config) {
      journey.createEmptyDiamond();
    }
  }, [journey.config, journey.createEmptyDiamond]);
  
  // Track journey active state
  useEffect(() => {
    const wasActive = journeyActiveRef.current;
    const isActive = journey.state.phase !== 'idle' && journey.state.phase !== 'ended';
    journeyActiveRef.current = isActive;
    
    // Journey just ended
    if (wasActive && !isActive && journey.state.phase === 'ended') {
      console.log('[JourneyMode] Journey ended');
      onJourneyEnd();
    }
  }, [journey.state.phase, onJourneyEnd]);
  
  // Handle config changes from the UI
  const handleConfigChange = useCallback((newConfig: JourneyConfig) => {
    journey.setConfig(newConfig);
  }, [journey]);
  
  // Handle preset selection from popup
  const handleSelectPreset = useCallback((_position: DiamondPosition) => {
    // The DiamondJourneyUI handles the popup internally
    // This callback is for when we need external preset browser
  }, []);
  
  // Handle stop - stop both journey animation and audio
  const handleStop = useCallback(() => {
    console.log('[JourneyMode] Stopping journey and audio');
    journey.stop();
    onStopAudio();
  }, [journey, onStopAudio]);
  
  return (
    <div style={styles.container}>
      {/* Main Journey UI */}
      <div style={styles.journeyContainer}>
        <DiamondJourneyUI
          config={journey.config}
          state={journey.state}
          presets={presets}
          onConfigChange={handleConfigChange}
          onPlay={journey.play}
          onStop={handleStop}
          onSelectPreset={handleSelectPreset}
        />
      </div>
      
      {/* Bottom navigation icons - positioned to match SnowflakeUI */}
      <div style={{
        ...styles.bottomNav,
        bottom: navBottom,
      }}>
        <button style={styles.navButton} onClick={onShowSnowflake}>
          {TEXT_SYMBOLS.snowflake}
        </button>
        <button style={styles.navButton} onClick={onShowAdvanced}>
          {TEXT_SYMBOLS.sparkle}
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100vw',
    height: '100dvh',
    // Match SnowflakeUI background gradient
    background: 'linear-gradient(180deg, #0a0a18 0%, #101828 40%, #182040 100%)',
    backgroundAttachment: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#e0e0e0',
    overflow: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0,
  },
  journeyContainer: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  bottomNav: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 24,
    alignItems: 'center',
    zIndex: 10,
  },
  navButton: {
    padding: 8,
    fontSize: '1.58rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.6)',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
    width: 46,
    height: 46,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondIndicator: {
    fontSize: '1.5rem',
    color: 'rgba(184, 224, 255, 0.8)',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
  },
};

export default JourneyModeView;
