/**
 * Journey Mode Demo Page
 * 
 * A standalone page to test and demonstrate the Journey UI
 * with simulated presets and state transitions.
 */

import React, { useState, useCallback } from 'react';
import { JourneyUI } from './JourneyUI';
import { useJourney } from './journeyState';
import { 
  JOURNEY_NODE_COLORS,
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
];

// ============================================================================
// DEMO COMPONENT
// ============================================================================

export const JourneyDemo: React.FC = () => {
  const journey = useJourney(120);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  
  // CONNECTION MODE: For creating connections between nodes
  // When a node is selected as "connection source", clicking another node creates a connection
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [isConnectionMode, setIsConnectionMode] = useState(false);
  
  // Create demo config on mount
  React.useEffect(() => {
    if (!journey.config) {
      // Create a 2-preset journey with NO initial connections
      // User will build their own connection graph
      journey.createFromMorph(DEMO_PRESETS[0], DEMO_PRESETS[1]);
    }
  }, []);
  
  // Handle adding a preset (now without auto-connect)
  const handleAddPreset = useCallback((preset: SavedPreset) => {
    journey.addNode(preset);
    // No auto-connect - user will manually create connections
  }, [journey]);
  
  // Handle node click - depends on connection mode
  const handleNodeClick = useCallback((nodeId: string) => {
    if (isConnectionMode) {
      if (!connectionSourceId) {
        // First click: select source node
        setConnectionSourceId(nodeId);
      } else if (connectionSourceId !== nodeId) {
        // Second click on different node: create connection
        journey.addConnection(connectionSourceId, nodeId);
        setConnectionSourceId(null); // Reset for next connection
      } else {
        // Clicked same node: deselect
        setConnectionSourceId(null);
      }
    } else {
      // Normal mode: just select for editing
      setSelectedNodeId(nodeId);
      setSelectedArcId(null);
    }
  }, [isConnectionMode, connectionSourceId, journey]);
  
  // Handle arc click
  const handleArcClick = useCallback((connectionId: string) => {
    if (!isConnectionMode) {
      setSelectedArcId(connectionId);
      setSelectedNodeId(null);
    }
  }, [isConnectionMode]);
  
  // Toggle connection mode
  const toggleConnectionMode = useCallback(() => {
    setIsConnectionMode(prev => !prev);
    setConnectionSourceId(null);
    setSelectedNodeId(null);
    setSelectedArcId(null);
  }, []);
  
  // Find selected items
  const selectedNode = journey.config?.nodes.find(n => n.id === selectedNodeId);
  const selectedConnection = journey.config?.connections.find(c => c.id === selectedArcId);
  const connectionSourceNode = journey.config?.nodes.find(n => n.id === connectionSourceId);
  
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px',
      boxSizing: 'border-box',
      fontFamily: 'monospace',
      color: '#e0e0e0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#4fc3f7' }}>
          Journey Mode Demo
        </h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* Connection Mode Toggle */}
          <button
            onClick={toggleConnectionMode}
            style={{
              padding: '8px 16px',
              background: isConnectionMode ? '#ff9800' : '#4fc3f7',
              color: isConnectionMode ? 'black' : '#0a0a12',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
          >
            {isConnectionMode ? '🔗 CONNECTION MODE (click to exit)' : '🔗 Add Connections'}
          </button>
          <div style={{ fontSize: '12px', color: '#888' }}>
            Phase: <span style={{ color: '#4fc3f7' }}>{journey.state.phase}</span>
          </div>
        </div>
      </div>
      
      {/* Connection Mode Instructions */}
      {isConnectionMode && (
        <div style={{
          background: 'rgba(255, 152, 0, 0.2)',
          border: '1px solid #ff9800',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            {connectionSourceId ? (
              <>
                <strong style={{ color: '#ff9800' }}>Source: {connectionSourceNode?.presetName}</strong>
                <span style={{ marginLeft: '10px' }}>→ Now click the destination preset</span>
              </>
            ) : (
              <span>Click a preset node to select it as the <strong>source</strong> of a new connection</span>
            )}
          </div>
          {connectionSourceId && (
            <button
              onClick={() => setConnectionSourceId(null)}
              style={{
                padding: '4px 10px',
                background: 'transparent',
                color: '#ff9800',
                border: '1px solid #ff9800',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      
      {/* Main content */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '20px',
        minHeight: 0,
      }}>
        {/* Journey UI */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <JourneyUI
            config={journey.config}
            state={journey.state}
            presets={DEMO_PRESETS}
            onConfigChange={() => {}}
            onPlay={journey.play}
            onStop={journey.stop}
            onNodeClick={handleNodeClick}
            onArcClick={handleArcClick}
            isConnectionMode={isConnectionMode}
            connectionSourceId={connectionSourceId}
          />
        </div>
        
        {/* Side panel */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          minWidth: '250px',
        }}>
          {/* Add presets */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '15px',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Add Preset</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {DEMO_PRESETS.map((preset, i) => (
                <button
                  key={preset.name}
                  onClick={() => handleAddPreset(preset)}
                  disabled={journey.config ? journey.config.nodes.length >= 4 : false}
                  style={{
                    padding: '8px 12px',
                    background: journey.config?.nodes.some(n => n.presetName === preset.name)
                      ? '#1a1a2e'
                      : JOURNEY_NODE_COLORS[i % JOURNEY_NODE_COLORS.length],
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: journey.config && journey.config.nodes.length >= 4 ? 'not-allowed' : 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    opacity: journey.config?.nodes.some(n => n.presetName === preset.name) ? 0.5 : 1,
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Simulation controls */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '15px',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Simulate Progress</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                Phrase Progress: {Math.round(journey.state.phraseProgress * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={journey.state.phraseProgress * 100}
                onChange={(e) => journey.simulatePhraseProgress(Number(e.target.value) / 100)}
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                Morph Progress: {Math.round(journey.state.morphProgress * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={journey.state.morphProgress * 100}
                onChange={(e) => journey.simulateMorphProgress(Number(e.target.value) / 100)}
                style={{ width: '100%' }}
              />
            </div>
            
            <button
              onClick={journey.simulateNextPhase}
              style={{
                width: '100%',
                padding: '10px',
                background: '#4fc3f7',
                color: '#0a0a12',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
              }}
            >
              Next Phase →
            </button>
          </div>
          
          {/* Selected node editor */}
          {selectedNode && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              padding: '15px',
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                Edit: {selectedNode.presetName}
              </h3>
              
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  Phrase Length: {selectedNode.phraseLength} bars
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={selectedNode.phraseLength}
                  onChange={(e) => journey.updateNode(selectedNode.id, { 
                    phraseLength: Number(e.target.value) 
                  })}
                  style={{ width: '100%' }}
                />
              </div>
              
              <button
                onClick={() => journey.removeNode(selectedNode.id)}
                                disabled={journey.config ? journey.config.nodes.length <= 2 : false}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#ff6b6b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: journey.config && journey.config.nodes.length <= 2 ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  opacity: journey.config && journey.config.nodes.length <= 2 ? 0.5 : 1,
                }}
              >
                Remove Node
              </button>
            </div>
          )}
          
          {/* Selected connection editor */}
          {selectedConnection && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              padding: '15px',
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                Edit Connection
              </h3>
              
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  Morph Duration: {selectedConnection.morphDuration} bars
                </label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={selectedConnection.morphDuration}
                  onChange={(e) => journey.updateConnection(selectedConnection.id, { 
                    morphDuration: Number(e.target.value) 
                  })}
                  style={{ width: '100%' }}
                />
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  Probability: {Math.round(selectedConnection.probability * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedConnection.probability * 100}
                  onChange={(e) => journey.updateConnection(selectedConnection.id, { 
                    probability: Number(e.target.value) / 100 
                  })}
                  style={{ width: '100%' }}
                />
              </div>
              
              <button
                onClick={() => journey.removeConnection(selectedConnection.id)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#ff6b6b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                Remove Connection
              </button>
            </div>
          )}
          
          {/* State debug */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '15px',
            fontSize: '10px',
            fontFamily: 'monospace',
            overflow: 'auto',
            flex: 1,
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Debug State</h3>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify({
                phase: journey.state.phase,
                currentNode: journey.config?.nodes.find(n => n.id === journey.state.currentNodeId)?.presetName,
                nextNode: journey.config?.nodes.find(n => n.id === journey.state.nextNodeId)?.presetName,
                phraseProgress: Math.round(journey.state.phraseProgress * 100) + '%',
                morphProgress: Math.round(journey.state.morphProgress * 100) + '%',
                nodeCount: journey.config?.nodes.length,
                connectionCount: journey.config?.connections.length,
              }, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JourneyDemo;
