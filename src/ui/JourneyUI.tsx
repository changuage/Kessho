/**
 * Journey Mode UI Component (Orbital Ring Design)
 * 
 * Visual layout:
 * - Presets arranged on a circular orbit
 * - Nodes shrink as their phrase plays
 * - Arcs connect nodes with morph duration visualization
 * - Center contains play/stop button
 * 
 * Visual feedback:
 * - Node size = play duration remaining
 * - Arc length/dots = morph duration
 * - Particle animation during morph
 * - Pulsing glow on active node
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  JourneyConfig,
  JourneyState,
  JourneyNode,
  JourneyConnection,
  JourneyPhase,
  JOURNEY_DEFAULTS,
  JOURNEY_NODE_COLORS,
  positionToAngle,
  positionToCoordinates,
  calculateNodePositions,
  createJourneyNode,
  createJourneyConnection,
  generateJourneyId,
} from '../audio/journeyTypes';
import { SavedPreset } from './state';

// ============================================================================
// CONSTANTS
// ============================================================================

const RING_RADIUS_RATIO = 0.35;  // Ring radius as ratio of container size
const NODE_BASE_SIZE = 40;       // Base node size in pixels
const NODE_MIN_SIZE = 15;        // Minimum node size when phrase almost complete
const ARC_WIDTH = 3;             // Base arc stroke width
const DOT_SIZE = 4;              // Size of dots along arc
const DOT_SPACING = 12;          // Pixels between dots
const GLOW_BLUR = 15;            // Blur radius for glow effects
const ANIMATION_FPS = 30;        // Animation frame rate

// Colors from the app's design system
const COLORS = {
  background: '#0a0a12',
  ringStroke: '#1a1a2e',
  ringGlow: 'rgba(79, 195, 247, 0.1)',
  nodeInactive: '#2a3a4a',
  nodeActive: '#4fc3f7',
  nodePlaying: '#4fc3f7',
  arcBase: 'rgba(255, 255, 255, 0.2)',
  arcActive: 'rgba(79, 195, 247, 0.6)',
  text: '#e0e0e0',
  textMuted: '#888',
  playButton: '#4fc3f7',
  stopButton: '#ff6b6b',
  connectionMode: '#ff9800',  // Orange for connection mode
};

// ============================================================================
// TYPES
// ============================================================================

interface JourneyUIProps {
  config: JourneyConfig | null;
  state: JourneyState;
  presets: SavedPreset[];
  onConfigChange: (config: JourneyConfig) => void;
  onPlay: () => void;
  onStop: () => void;
  onNodeClick?: (nodeId: string) => void;
  onArcClick?: (connectionId: string) => void;
  // Connection mode props
  isConnectionMode?: boolean;
  connectionSourceId?: string | null;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * SVG arc path between two angles on a circle
 */
function getArcPath(
  fromAngle: number,
  toAngle: number,
  centerX: number,
  centerY: number,
  radius: number
): string {
  const startX = centerX + radius * Math.cos(fromAngle);
  const startY = centerY + radius * Math.sin(fromAngle);
  const endX = centerX + radius * Math.cos(toAngle);
  const endY = centerY + radius * Math.sin(toAngle);
  
  // Determine if we should use the large arc
  let angleDiff = toAngle - fromAngle;
  if (angleDiff < 0) angleDiff += 2 * Math.PI;
  const largeArc = angleDiff > Math.PI ? 1 : 0;
  
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
}

/**
 * Generate dots along an arc path
 */
function getArcDots(
  fromAngle: number,
  toAngle: number,
  centerX: number,
  centerY: number,
  radius: number,
  count: number
): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  
  // Normalize angle difference
  let angleDiff = toAngle - fromAngle;
  if (angleDiff < 0) angleDiff += 2 * Math.PI;
  
  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0;
    const angle = fromAngle + angleDiff * t;
    dots.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  
  return dots;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface JourneyNodeComponentProps {
  node: JourneyNode;
  centerX: number;
  centerY: number;
  radius: number;
  isActive: boolean;
  isPlaying: boolean;
  phraseProgress: number; // 0-1, how much of phrase has played
  onClick?: () => void;
  // Connection mode props
  isConnectionSource?: boolean;  // This node is selected as connection source
  isConnectionTarget?: boolean;  // We're in connection mode and this could be a target
}

/**
 * A single node on the journey ring
 * Size shrinks as phrase plays (visual feedback)
 */
const JourneyNodeComponent: React.FC<JourneyNodeComponentProps> = ({
  node,
  centerX,
  centerY,
  radius,
  isActive,
  isPlaying,
  phraseProgress,
  onClick,
  isConnectionSource = false,
  isConnectionTarget = false,
}) => {
  const angle = positionToAngle(node.position);
  const x = centerX + radius * Math.cos(angle);
  const y = centerY + radius * Math.sin(angle);
  
  // Size shrinks as phrase plays - starts at full, shrinks to minimum
  const sizeProgress = isPlaying ? 1 - phraseProgress : 1;
  const currentSize = NODE_MIN_SIZE + (NODE_BASE_SIZE - NODE_MIN_SIZE) * sizeProgress;
  
  // Glow intensity based on activity - connection mode takes priority
  const glowIntensity = isConnectionSource ? 1.0 
    : isConnectionTarget ? 0.6
    : isPlaying ? 0.8 
    : (isActive ? 0.4 : 0);
  
  // Glow color - orange for connection mode, blue for normal
  const glowColor = (isConnectionSource || isConnectionTarget) 
    ? COLORS.connectionMode 
    : 'rgba(79, 195, 247, 1)';
  
  // Stroke style for connection mode
  const strokeColor = isConnectionSource ? COLORS.connectionMode
    : isConnectionTarget ? COLORS.connectionMode
    : isPlaying ? 'white' 
    : node.color;
  
  const strokeWidth = isConnectionSource ? 4 
    : isConnectionTarget ? 3
    : isPlaying ? 3 
    : 2;
  
  return (
    <g 
      className="journey-node" 
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Glow effect */}
      {glowIntensity > 0 && (
        <circle
          cx={x}
          cy={y}
          r={currentSize + GLOW_BLUR}
          fill={glowColor.replace('1)', `${glowIntensity * 0.3})`).replace('rgb', 'rgba')}
          filter="url(#nodeGlow)"
        />
      )}
      
      {/* Connection mode pulsing ring */}
      {isConnectionSource && (
        <circle
          cx={x}
          cy={y}
          r={currentSize + 8}
          fill="none"
          stroke={COLORS.connectionMode}
          strokeWidth={2}
          strokeDasharray="4 4"
          style={{
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
      )}
      
      {/* Main node circle */}
      <circle
        cx={x}
        cy={y}
        r={currentSize}
        fill={isPlaying ? node.color : (isActive ? node.color : COLORS.nodeInactive)}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          transition: isPlaying ? 'none' : 'all 0.3s ease',
        }}
      />
      
      {/* Progress ring (shows phrase progress) */}
      {isPlaying && phraseProgress > 0 && (
        <circle
          cx={x}
          cy={y}
          r={currentSize + 5}
          fill="none"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={2}
          strokeDasharray={`${(1 - phraseProgress) * 2 * Math.PI * (currentSize + 5)} ${2 * Math.PI * (currentSize + 5)}`}
          strokeDashoffset={Math.PI * (currentSize + 5) / 2}
          transform={`rotate(-90 ${x} ${y})`}
        />
      )}
      
      {/* Preset name label */}
      <text
        x={x}
        y={y + currentSize + 18}
        textAnchor="middle"
        fill={isActive ? COLORS.text : COLORS.textMuted}
        fontSize="11"
        fontFamily="monospace"
        style={{ pointerEvents: 'none' }}
      >
        {node.presetName.length > 12 
          ? node.presetName.slice(0, 10) + '...' 
          : node.presetName}
      </text>
      
      {/* Phrase length indicator */}
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill={isPlaying ? 'white' : COLORS.textMuted}
        fontSize="12"
        fontWeight="bold"
        fontFamily="monospace"
        style={{ pointerEvents: 'none' }}
      >
        {node.phraseLength}
      </text>
    </g>
  );
};

interface JourneyArcComponentProps {
  connection: JourneyConnection;
  fromNode: JourneyNode;
  toNode: JourneyNode;
  centerX: number;
  centerY: number;
  radius: number;
  isActive: boolean;
  morphProgress: number; // 0-1 if currently morphing on this arc
  useDots: boolean; // Use dots instead of solid arc
  onClick?: () => void;
}

/**
 * An arc connecting two nodes
 * Shows morph duration via arc length/spacing or dot count
 * Animates particles during active morph
 */
const JourneyArcComponent: React.FC<JourneyArcComponentProps> = ({
  connection,
  fromNode,
  toNode,
  centerX,
  centerY,
  radius,
  isActive,
  morphProgress,
  useDots,
  onClick,
}) => {
  const fromAngle = positionToAngle(fromNode.position);
  const toAngle = positionToAngle(toNode.position);
  
  // Arc path
  const arcPath = getArcPath(fromAngle, toAngle, centerX, centerY, radius);
  
  // Number of dots based on morph duration (more dots = longer morph)
  const dotCount = Math.max(3, Math.floor(connection.morphDuration * 3));
  const dots = getArcDots(fromAngle, toAngle, centerX, centerY, radius, dotCount);
  
  // Calculate which dot should be highlighted based on morph progress
  const activeDotsCount = Math.floor(morphProgress * dots.length);
  
  // Probability affects opacity
  const opacity = 0.3 + connection.probability * 0.7;
  
  return (
    <g className="journey-arc" onClick={onClick} style={{ cursor: 'pointer' }}>
      {useDots ? (
        // Dot-based visualization
        <>
          {dots.map((dot, i) => {
            const isActiveDot = isActive && i <= activeDotsCount;
            const isPastDot = isActive && i < activeDotsCount;
            return (
              <circle
                key={i}
                cx={dot.x}
                cy={dot.y}
                r={isActiveDot ? DOT_SIZE + 1 : DOT_SIZE}
                fill={isActiveDot 
                  ? (isPastDot ? COLORS.nodeActive : 'white')
                  : `rgba(255, 255, 255, ${opacity * 0.5})`}
                style={{
                  transition: 'all 0.15s ease',
                }}
              />
            );
          })}
        </>
      ) : (
        // Arc-based visualization
        <>
          {/* Background arc */}
          <path
            d={arcPath}
            fill="none"
            stroke={COLORS.arcBase}
            strokeWidth={ARC_WIDTH}
            strokeOpacity={opacity}
          />
          
          {/* Active morph progress arc */}
          {isActive && morphProgress > 0 && (
            <path
              d={arcPath}
              fill="none"
              stroke={COLORS.arcActive}
              strokeWidth={ARC_WIDTH + 1}
              strokeDasharray={`${morphProgress * 1000} 1000`}
              filter="url(#arcGlow)"
            />
          )}
        </>
      )}
      
      {/* Probability indicator (small text along arc) */}
      {connection.probability < 1 && (
        <text
          x={(dots[Math.floor(dots.length / 2)]?.x || centerX)}
          y={(dots[Math.floor(dots.length / 2)]?.y || centerY) - 10}
          textAnchor="middle"
          fill={COLORS.textMuted}
          fontSize="9"
          fontFamily="monospace"
        >
          {Math.round(connection.probability * 100)}%
        </text>
      )}
      
      {/* Morph duration indicator */}
      <text
        x={(dots[Math.floor(dots.length / 2)]?.x || centerX)}
        y={(dots[Math.floor(dots.length / 2)]?.y || centerY) + 12}
        textAnchor="middle"
        fill={isActive ? COLORS.text : COLORS.textMuted}
        fontSize="9"
        fontFamily="monospace"
      >
        {connection.morphDuration}b
      </text>
    </g>
  );
};

interface PlayButtonProps {
  isPlaying: boolean;
  centerX: number;
  centerY: number;
  onClick: () => void;
}

/**
 * Central play/stop button
 */
const PlayButton: React.FC<PlayButtonProps> = ({
  isPlaying,
  centerX,
  centerY,
  onClick,
}) => {
  const buttonRadius = 30;
  
  return (
    <g className="journey-play-button" onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Glow */}
      <circle
        cx={centerX}
        cy={centerY}
        r={buttonRadius + 10}
        fill={isPlaying 
          ? 'rgba(255, 107, 107, 0.2)' 
          : 'rgba(79, 195, 247, 0.2)'}
        filter="url(#buttonGlow)"
      />
      
      {/* Button circle */}
      <circle
        cx={centerX}
        cy={centerY}
        r={buttonRadius}
        fill={COLORS.background}
        stroke={isPlaying ? COLORS.stopButton : COLORS.playButton}
        strokeWidth={2}
      />
      
      {/* Play or Stop icon */}
      {isPlaying ? (
        // Stop icon (square)
        <rect
          x={centerX - 10}
          y={centerY - 10}
          width={20}
          height={20}
          fill={COLORS.stopButton}
          rx={2}
        />
      ) : (
        // Play icon (triangle)
        <path
          d={`M ${centerX - 8} ${centerY - 12} L ${centerX + 14} ${centerY} L ${centerX - 8} ${centerY + 12} Z`}
          fill={COLORS.playButton}
        />
      )}
    </g>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const JourneyUI: React.FC<JourneyUIProps> = ({
  config,
  state,
  presets,
  onConfigChange,
  onPlay,
  onStop,
  onNodeClick,
  onArcClick,
  isConnectionMode = false,
  connectionSourceId = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [useDots, setUseDots] = useState(true); // Toggle between arc styles
  
  // Calculate layout dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height, 500);
        setDimensions({ width: size, height: size });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const ringRadius = Math.min(dimensions.width, dimensions.height) * RING_RADIUS_RATIO;
  
  // Get nodes and connections from config
  const nodes = config?.nodes || [];
  const connections = config?.connections || [];
  
  // Determine which node/connection is active
  const currentNodeId = state.currentNodeId;
  const nextNodeId = state.nextNodeId;
  const isPlaying = state.phase === 'playing' || state.phase === 'morphing';
  const isMorphing = state.phase === 'morphing';
  
  // Find the active connection (if morphing)
  const activeConnection = isMorphing
    ? connections.find(c => c.fromNodeId === currentNodeId && c.toNodeId === nextNodeId)
    : null;
  
  // Handle play/stop toggle
  const handlePlayClick = useCallback(() => {
    if (isPlaying) {
      onStop();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onStop]);
  
  // If no config, show empty state
  if (!config || nodes.length === 0) {
    return (
      <div 
        ref={containerRef}
        className="journey-ui-container"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.background,
          borderRadius: '12px',
          border: '1px solid #1a1a2e',
        }}
      >
        <div style={{ textAlign: 'center', color: COLORS.textMuted }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>◎</div>
          <div style={{ fontFamily: 'monospace' }}>No journey configured</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            Add presets to create a journey
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className="journey-ui-container"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.background,
        borderRadius: '12px',
        border: isConnectionMode ? `2px solid ${COLORS.connectionMode}` : '1px solid #1a1a2e',
        position: 'relative',
      }}
    >
      {/* Keyframe animation for pulse effect */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
      
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{ overflow: 'visible' }}
      >
        {/* Definitions for effects */}
        <defs>
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={GLOW_BLUR} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          <filter id="arcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          <filter id="buttonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          <filter id="ringGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Orbital ring background */}
        <circle
          cx={centerX}
          cy={centerY}
          r={ringRadius}
          fill="none"
          stroke={COLORS.ringStroke}
          strokeWidth={1}
          filter="url(#ringGlow)"
        />
        
        {/* Subtle ring glow when playing */}
        {isPlaying && (
          <circle
            cx={centerX}
            cy={centerY}
            r={ringRadius}
            fill="none"
            stroke={COLORS.ringGlow}
            strokeWidth={8}
            opacity={0.5}
          />
        )}
        
        {/* Render connections/arcs first (behind nodes) */}
        {connections.map(connection => {
          const fromNode = nodes.find(n => n.id === connection.fromNodeId);
          const toNode = nodes.find(n => n.id === connection.toNodeId);
          if (!fromNode || !toNode) return null;
          
          const isActiveArc = activeConnection?.id === connection.id;
          
          return (
            <JourneyArcComponent
              key={connection.id}
              connection={connection}
              fromNode={fromNode}
              toNode={toNode}
              centerX={centerX}
              centerY={centerY}
              radius={ringRadius}
              isActive={isActiveArc}
              morphProgress={isActiveArc ? state.morphProgress : 0}
              useDots={useDots}
              onClick={() => onArcClick?.(connection.id)}
            />
          );
        })}
        
        {/* Render nodes on top */}
        {nodes.map(node => {
          const isActiveNode = node.id === currentNodeId;
          const isPlayingNode = isActiveNode && state.phase === 'playing';
          const isSource = isConnectionMode && node.id === connectionSourceId;
          const isTarget = isConnectionMode && connectionSourceId && node.id !== connectionSourceId;
          
          return (
            <JourneyNodeComponent
              key={node.id}
              node={node}
              centerX={centerX}
              centerY={centerY}
              radius={ringRadius}
              isActive={isActiveNode}
              isPlaying={isPlayingNode}
              phraseProgress={isPlayingNode ? state.phraseProgress : 0}
              onClick={() => onNodeClick?.(node.id)}
              isConnectionSource={isSource}
              isConnectionTarget={isTarget}
            />
          );
        })}
        
        {/* Central play/stop button */}
        <PlayButton
          isPlaying={isPlaying}
          centerX={centerX}
          centerY={centerY}
          onClick={handlePlayClick}
        />
        
        {/* Status text below button */}
        <text
          x={centerX}
          y={centerY + 55}
          textAnchor="middle"
          fill={COLORS.textMuted}
          fontSize="10"
          fontFamily="monospace"
        >
          {state.phase === 'idle' && 'Ready'}
          {state.phase === 'playing' && `Playing: ${nodes.find(n => n.id === currentNodeId)?.presetName || ''}`}
          {state.phase === 'morphing' && 'Morphing...'}
          {state.phase === 'ended' && 'Journey Complete'}
        </text>
      </svg>
      
      {/* Toggle for arc style */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          fontSize: '10px',
          color: COLORS.textMuted,
          fontFamily: 'monospace',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: 'rgba(255,255,255,0.05)',
        }}
        onClick={() => setUseDots(!useDots)}
      >
        {useDots ? '● Dots' : '━ Arc'}
      </div>
    </div>
  );
};

export default JourneyUI;
