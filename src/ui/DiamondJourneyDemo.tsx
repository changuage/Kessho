/**
 * Diamond Journey Mode Demo Page
 * 
 * A standalone page to test and demonstrate the Diamond Journey UI
 * with presets at cardinal positions and curved connections.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { DiamondJourneyUI } from './DiamondJourneyUI';
import { useJourney } from './journeyState';
import { 
  JourneyConfig, 
  DiamondPosition,
} from '../audio/journeyTypes';
import { SavedPreset, DEFAULT_STATE } from './state';

// ============================================================================
// DEMO PRESETS
// ============================================================================

const DEMO_PRESETS: SavedPreset[] = [
  { name: 'Ethereal Ambient', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
  { name: 'Dark Textures', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
  { name: 'Bright Bells', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
  { name: 'Ocean Waves', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
  { name: 'Cosmic Drift', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
  { name: 'Forest Rain', timestamp: new Date().toISOString(), state: DEFAULT_STATE },
];

// ============================================================================
// DEMO COMPONENT
// ============================================================================

export const DiamondJourneyDemo: React.FC = () => {
  const journey = useJourney(120);
  const [presetBrowserOpen, setPresetBrowserOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<DiamondPosition | null>(null);
  
  // Create empty diamond config on mount
  // Create empty diamond config on mount
  useEffect(() => {
    if (!journey.config) {
      journey.createEmptyDiamond();
    }
  }, [journey.config]);
  
  // Handle selecting a preset for a position
  const handleSelectPreset = useCallback((position: DiamondPosition) => {
    setSelectedPosition(position);
    setPresetBrowserOpen(true);
  }, []);
  
  const handlePresetChosen = useCallback((preset: SavedPreset) => {
    if (selectedPosition) {
      journey.addNodeAtPosition(preset, selectedPosition);
    }
    setPresetBrowserOpen(false);
    setSelectedPosition(null);
  }, [selectedPosition, journey]);
  
  // Handle config changes from the UI
  const handleConfigChange = useCallback((newConfig: JourneyConfig) => {
    journey.setConfig(newConfig);
  }, [journey]);
  
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0a0a12 0%, #1a1a2e 50%, #0f1a2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      color: '#e0e0e0',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(79, 195, 247, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: '20px', color: '#4fc3f7' }}>
            ◇ Journey Mode
          </h1>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Diamond Matrix
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ 
            fontSize: '11px', 
            color: '#888',
            padding: '4px 8px',
            background: 'rgba(79, 195, 247, 0.1)',
            borderRadius: 4,
          }}>
            {journey.state.phase === 'idle' ? 'Ready' :
             journey.state.phase === 'playing' ? '▶ Playing' :
             journey.state.phase === 'morphing' ? '↻ Morphing' : 
             '■ Ended'}
          </div>
        </div>
      </div>
      
      {/* Instructions (show when no presets are added) */}
      {journey.config && journey.config.nodes.every(n => !n.presetId) && (
        <div style={{
          padding: '12px 24px',
          background: 'rgba(79, 195, 247, 0.1)',
          borderBottom: '1px solid rgba(79, 195, 247, 0.2)',
          fontSize: '12px',
          color: '#81d4fa',
        }}>
          <strong>Getting Started:</strong> Tap the + circles to add presets, then drag between nodes to create connections.
        </div>
      )}
      
      {/* Main Journey UI */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 500,
          aspectRatio: '1',
        }}>
          <DiamondJourneyUI
            config={journey.config}
            state={journey.state}
            presets={DEMO_PRESETS}
            onConfigChange={handleConfigChange}
            onPlay={journey.play}
            onStop={journey.stop}
            onSelectPreset={handleSelectPreset}
          />
        </div>
      </div>
      
      {/* Footer with simulation controls (for demo) */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid rgba(79, 195, 247, 0.2)',
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
      }}>
        <button
          onClick={journey.simulateNextPhase}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            color: '#4fc3f7',
            border: '1px solid #4fc3f7',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          Simulate Next Phase
        </button>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          fontSize: '11px',
          color: '#888',
        }}>
          <span>Phrase:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={journey.state.phraseProgress * 100}
            onChange={(e) => journey.simulatePhraseProgress(parseInt(e.target.value) / 100)}
            style={{ width: 80 }}
          />
          <span>{Math.round(journey.state.phraseProgress * 100)}%</span>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          fontSize: '11px',
          color: '#888',
        }}>
          <span>Morph:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={journey.state.morphProgress * 100}
            onChange={(e) => journey.simulateMorphProgress(parseInt(e.target.value) / 100)}
            style={{ width: 80 }}
          />
          <span>{Math.round(journey.state.morphProgress * 100)}%</span>
        </div>
      </div>
      
      {/* Preset Browser Modal */}
      {presetBrowserOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => {
            setPresetBrowserOpen(false);
            setSelectedPosition(null);
          }}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: '1px solid #4fc3f7',
              borderRadius: 12,
              padding: 24,
              minWidth: 280,
              maxWidth: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', color: '#4fc3f7', fontSize: '16px' }}>
              Choose Preset for {selectedPosition?.toUpperCase()}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetChosen(preset)}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(79, 195, 247, 0.1)',
                    color: '#e0e0e0',
                    border: '1px solid rgba(79, 195, 247, 0.3)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(79, 195, 247, 0.2)';
                    e.currentTarget.style.borderColor = '#4fc3f7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(79, 195, 247, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(79, 195, 247, 0.3)';
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setPresetBrowserOpen(false);
                setSelectedPosition(null);
              }}
              style={{
                marginTop: 16,
                padding: '10px 16px',
                width: '100%',
                background: 'transparent',
                color: '#888',
                border: '1px solid #444',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiamondJourneyDemo;
