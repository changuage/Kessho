/**
 * Diamond Matrix Journey UI Component
 * 
 * Visual layout - Diamond shape with presets at cardinal positions:
 *                    ◎ P2 (top/12:00)
 *                   ╱    ╲
 *       ◎ P1 ────  ◉ START ────  ◎ P3
 *      (left)       ╲    ╱      (right)
 *                    ◎ P4 (bottom/6:00)
 * 
 * Features:
 * - Drag-to-connect between nodes
 * - Curved Bezier paths around center
 * - Inline editing popups (no side panel)
 * - Visual feedback: node shrinking, morph dots, probability thickness
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  JourneyConfig,
  JourneyState,
  JourneyNode,
  JourneyConnection,
  DiamondPosition,
  JOURNEY_DEFAULTS,
  JOURNEY_NODE_COLORS,
  getDiamondCoordinates,
  calculateCurvedPath,
  generateJourneyId,
} from '../audio/journeyTypes';
import { SavedPreset } from './state';
import { PHRASE_LENGTH } from '../audio/harmony';

// ============================================================================
// CONSTANTS
// ============================================================================

const DIAMOND_RADIUS_RATIO = 0.27;  // Diamond radius as ratio of container size (reduced for nav spacing)
const NODE_BASE_SIZE = 52;          // Base node size in pixels (slightly larger)
const NODE_MIN_SIZE = 20;           // Minimum node size when phrase almost complete
const CENTER_NODE_SIZE = 64;        // Center START/END node size (larger for prominence)
const DOT_SIZE = 4;                 // Size of dots along arc
const GLOW_BLUR = 12;               // Blur radius for glow effects

// Refined color palette - warm, organic tones inspired by Snowflake UI
const COLORS = {
  background: '#0a0a12',
  // Node colors
  emptySlot: 'rgba(255, 255, 255, 0.08)',
  emptySlotBorder: 'rgba(255, 255, 255, 0.2)',
  filledNode: '#7B9A6D',            // Sage green - matches Snowflake
  filledNodeGlow: 'rgba(123, 154, 109, 0.4)',
  activeNode: 'rgba(220, 235, 255, 0.95)',  // Exact snowflake color from SnowflakeUI
  activeNodeGlow: 'rgba(220, 235, 255, 0.5)',
  playingGlow: 'rgba(220, 235, 255, 0.4)',
  // Connection colors
  connection: 'rgba(232, 220, 196, 0.5)',  // Warm cream
  connectionActive: '#E8DCC4',
  morphingConnection: '#B8E0FF',     // Icy snowflake blue for morphing
  startConnection: '#7B9A6D',        // Sage green for START
  endConnection: 'rgba(220, 235, 255, 0.7)',  // Icy blue for END - matches snowflake
  endingConnection: 'rgba(220, 235, 255, 0.8)', // Icy blue for fadeout
  // UI elements
  dragGhost: '#B8E0FF',              // Icy snowflake blue
  endGlow: 'rgba(220, 235, 255, 0.6)',  // Icy blue glow
  text: '#E8DCC4',                   // Warm cream text
  textMuted: 'rgba(232, 220, 196, 0.5)',
  textDark: '#1a1a2e',
  // Center node
  centerNode: 'rgba(184, 224, 255, 0.9)',  // Icy snowflake blue
  centerNodeBorder: '#B8E0FF',             // Icy snowflake blue
  centerNodePlaying: '#B8E0FF',            // Icy snowflake blue
  // Popups
  popup: 'rgba(20, 20, 35, 0.5)',
  popupBorder: 'rgba(232, 220, 196, 0.3)',
  popupGlow: 'rgba(232, 220, 196, 0.1)',
  // Diamond frame
  diamondFrame: 'rgba(232, 220, 196, 0.08)',
  diamondFrameGlow: 'rgba(232, 220, 196, 0.15)',
};

// ============================================================================
// TYPES
// ============================================================================

interface DiamondJourneyUIProps {
  config: JourneyConfig | null;
  state: JourneyState;
  presets: SavedPreset[];
  onConfigChange: (config: JourneyConfig) => void;
  onPlay: () => void;
  onStop: () => void;
  onSelectPreset?: (position: DiamondPosition) => void;
}

interface PopupState {
  type: 'node' | 'connection' | 'addPreset' | null;
  nodeId?: string;
  connectionId?: string;
  position?: DiamondPosition;
  x: number;
  y: number;
}

interface DragState {
  isDragging: boolean;
  fromNodeId: string | null;
  fromPosition: DiamondPosition | null;
  currentX: number;
  currentY: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNodeInitial(name: string): string {
  if (!name) return '+';
  const words = name.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getProbabilityWidth(probability: number): number {
  // Scale line width from 1.5 to 4 based on probability (thinner for elegance)
  return 1.5 + probability * 2.5;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface DiamondNodeProps {
  node: JourneyNode;
  x: number;
  y: number;
  size: number;
  isPlaying: boolean;
  isMorphingTo: boolean;
  phraseProgress: number;
  isEmpty: boolean;
  isValidDropTarget: boolean;
  isDragSource: boolean;
  onClick: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onPhraseChange?: (nodeId: string, phrases: number, isMax?: boolean) => void;
}

const DiamondNode: React.FC<DiamondNodeProps> = ({
  node,
  x,
  y,
  size,
  isPlaying,
  isMorphingTo,
  phraseProgress,
  isEmpty,
  isValidDropTarget: _isValidDropTarget,
  isDragSource,
  onClick,
  onDragStart,
  onPhraseChange,
}) => {
  // Track spike drag state
  const [draggingSpike, setDraggingSpike] = useState<number | null>(null);
  const [hoveringSpike, setHoveringSpike] = useState<number | null>(null);
  const spikeStartRef = useRef<{ phraseLength: number; phraseMax?: number; clientX: number; clientY: number } | null>(null);
  // Shrink node as phrase progresses
  const effectiveSize = isPlaying 
    ? NODE_MIN_SIZE + (size - NODE_MIN_SIZE) * (1 - phraseProgress)
    : size;
  
  // Track if this was a drag or a click
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const pendingEvent = useRef<React.MouseEvent | React.TouchEvent | null>(null);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;
    pendingEvent.current = e;
    // Don't start drag yet - wait for mouse move
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current && !dragStarted.current && !isEmpty) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Start drag after 5px of movement
      if (distance >= 5 && pendingEvent.current) {
        dragStarted.current = true;
        onDragStart(pendingEvent.current);
      }
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragStartPos.current && !dragStarted.current) {
      // Didn't move enough - treat as click
      e.stopPropagation();
      onClick();
    }
    dragStartPos.current = null;
    dragStarted.current = false;
    pendingEvent.current = null;
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragStarted.current = false;
    pendingEvent.current = e;
    // Don't start drag yet - wait for touch move
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartPos.current && !dragStarted.current && !isEmpty && e.touches[0]) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartPos.current.x;
      const dy = touch.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Start drag after 10px of movement
      if (distance >= 10 && pendingEvent.current) {
        dragStarted.current = true;
        onDragStart(pendingEvent.current);
      }
    }
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartPos.current && !dragStarted.current) {
      // Didn't move enough - treat as tap
      e.stopPropagation();
      onClick();
    }
    dragStartPos.current = null;
    dragStarted.current = false;
    pendingEvent.current = null;
  };
  
  return (
    <g 
      style={{ cursor: isEmpty ? 'pointer' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Outer glow ring for playing/morphing nodes */}
      {(isPlaying || isMorphingTo) && (
        <>
          <circle
            cx={x}
            cy={y}
            r={effectiveSize / 2 + 12}
            fill="none"
            stroke={isPlaying ? COLORS.activeNodeGlow : `${COLORS.morphingConnection}88`}
            strokeWidth={2}
            filter="url(#glow)"
            style={{ opacity: 0.6 }}
          />
          <circle
            cx={x}
            cy={y}
            r={effectiveSize / 2 + 6}
            fill="none"
            stroke={isPlaying ? COLORS.activeNode : COLORS.morphingConnection}
            strokeWidth={1.5}
            style={{
              animation: isPlaying ? 'pulse 2s ease-in-out infinite' : undefined,
            }}
          />
        </>
      )}
      
      {/* Node background glow - hexagon for filled, circle for empty */}
      {!isEmpty && (
        <polygon
          points={[0, 1, 2, 3, 4, 5].map(i => {
            const angle = (i * 60 - 90) * Math.PI / 180;
            const r = effectiveSize / 2 - 4;
            return `${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`;
          }).join(' ')}
          fill="none"
          stroke={node.color || COLORS.filledNode}
          strokeWidth={1}
          style={{
            opacity: isDragSource ? 0.3 : 0.4,
            filter: 'blur(3px)',
          }}
        />
      )}
      
      {/* Node shape - hexagon for filled presets, circle for empty slots */}
      {isEmpty ? (
        <circle
          cx={x}
          cy={y}
          r={effectiveSize / 2 - 8}
          fill={COLORS.emptySlot}
          stroke={COLORS.emptySlotBorder}
          strokeWidth={1.5}
          strokeDasharray="3,5"
          style={{
            transition: 'all 0.2s ease-out',
            opacity: isDragSource ? 0.5 : 1,
          }}
        />
      ) : (
        <polygon
          points={[0, 1, 2, 3, 4, 5].map(i => {
            const angle = (i * 60 - 90) * Math.PI / 180;
            const r = effectiveSize / 2 - 8;
            return `${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`;
          }).join(' ')}
          fill={`${node.color || COLORS.filledNode}22`}
          stroke={isPlaying ? COLORS.activeNode : node.color || COLORS.filledNode}
          strokeWidth={isPlaying ? 2 : 1.5}
          style={{
            transition: 'all 0.2s ease-out',
            opacity: isDragSource ? 0.5 : 1,
          }}
        />
      )}
      
      {/* Crystalline hexagonal inner pattern - smaller */}
      {!isEmpty && (
        <polygon
          points={[0, 1, 2, 3, 4, 5].map(i => {
            const angle = (i * 60 - 90) * Math.PI / 180;
            const r = effectiveSize / 2 - 12;
            return `${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`;
          }).join(' ')}
          fill="none"
          stroke={isPlaying ? COLORS.activeNode : node.color || COLORS.filledNode}
          strokeWidth={0.5}
          style={{ opacity: 0.35 }}
        />
      )}
      
      {/* Snowflake-style frost branches - like SnowflakeUI with recursive sub-branches */}
      {!isEmpty && (() => {
        const nodeColor = isPlaying ? COLORS.activeNode : node.color || COLORS.filledNode;
        const phraseMin = node.phraseLength;
        const phraseMax = node.phraseLengthMax ?? node.phraseLength;
        const isDualMode = node.phraseLengthMax !== undefined;
        
        // When playing, shrink branches based on phraseProgress (1 -> 0 as progress goes 0 -> 1)
        const playScale = isPlaying ? (1 - phraseProgress * 0.7) : 1; // Shrink to 30% at end of phrase
        
        // Main spike (stem) length based on phrase count (10-40 pixels for 1-100 phrases)
        const minSpikeLen = (10 + ((phraseMin - 1) / 99) * 30) * playScale;
        const maxSpikeLen = (10 + ((phraseMax - 1) / 99) * 30) * playScale;
        const innerR = effectiveSize / 2 - 8; // Start from hexagon edge (already shrinks with effectiveSize)
        
        // Complexity based on spike length - scaled to allow sub-branches at all lengths
        // Use original (unscaled) spike length for complexity so branch count stays consistent
        const originalMaxSpikeLen = 10 + ((phraseMax - 1) / 63) * 30;
        const complexity = 0.5 + (originalMaxSpikeLen - 10) / 60; // 0.5 to 1.0
        const maxDepth = Math.floor(1.5 + complexity); // 2-3 depth levels (always has some sub-branches)
        
        // Generate branches for each of 6 directions
        return [0, 1, 2, 3, 4, 5].map(i => {
          const baseAngle = (i * 60 - 90) * Math.PI / 180;
          const isHighlighted = hoveringSpike === i || draggingSpike === i;
          
          // Start point on node edge
          const startX = x + innerR * Math.cos(baseAngle);
          const startY = y + innerR * Math.sin(baseAngle);
          
          // End point of main spike (use max for dual mode)
          const spikeLen = isDualMode ? maxSpikeLen : minSpikeLen;
          const endX = startX + spikeLen * Math.cos(baseAngle);
          const endY = startY + spikeLen * Math.sin(baseAngle);
          
          // Min end point for dual mode
          const minEndX = startX + minSpikeLen * Math.cos(baseAngle);
          const minEndY = startY + minSpikeLen * Math.sin(baseAngle);
          
          // Generate recursive sub-branches (true fractal snowflake pattern)
          const numMainShoots = Math.max(1, Math.floor(complexity * 3)); // 1-3 main shoots
          const allBranches: JSX.Element[] = [];
          
          // Recursive function to generate DOUBLE-SIDED branch hierarchy
          const generateBranch = (
            bx: number, by: number, 
            angle: number, 
            length: number, 
            width: number, 
            depth: number,
            keyPrefix: string
          ) => {
            if (depth > maxDepth || length < 2) return;
            
            const bendX = bx + Math.cos(angle) * length;
            const bendY = by + Math.sin(angle) * length;
            
            // Draw branch line
            allBranches.push(
              <line
                key={`${keyPrefix}-line`}
                x1={bx} y1={by} x2={bendX} y2={bendY}
                stroke={isHighlighted ? nodeColor : nodeColor}
                strokeWidth={Math.max(0.5, width)}
                strokeLinecap="round"
                style={{ 
                  opacity: isHighlighted ? 0.9 - depth * 0.12 : 0.7 - depth * 0.12,
                  pointerEvents: 'none',
                  filter: isHighlighted ? `drop-shadow(0 0 2px ${nodeColor})` : undefined,
                }}
              />
            );
            
            // Add DOUBLE-SIDED sub-branches (reduced density - 30% fewer)
            if (depth < maxDepth) {
              const numSub = Math.floor(1 + complexity); // Reduced from 2 + complexity*1.5
              for (let s = 0; s < numSub; s++) {
                const t = 0.35 + (s / Math.max(1, numSub)) * 0.4; // Position at 35%-75% of branch (more spread)
                const subX = bx + Math.cos(angle) * length * t;
                const subY = by + Math.sin(angle) * length * t;
                const subLen = length * (0.65 - s * 0.08); // Longer sub-branches
                const subAngle = 0.85 + s * 0.1; // ~50-60 degrees (wider spread)
                
                // Branch on BOTH sides for true fractal symmetry
                generateBranch(
                  subX, subY,
                  angle + subAngle,
                  subLen,
                  width * 0.55,
                  depth + 1,
                  `${keyPrefix}-subR${s}`
                );
                generateBranch(
                  subX, subY,
                  angle - subAngle,
                  subLen,
                  width * 0.55,
                  depth + 1,
                  `${keyPrefix}-subL${s}`
                );
              }
            }
          };
          
          // Generate main shoots along the stem - BOTH SIDES (spread from near hexagon to tip)
          for (let m = 0; m < numMainShoots; m++) {
            const t = 0.15 + (m / Math.max(1, numMainShoots - 1)) * 0.7; // 15%-85% of stem (wider spread, starts closer to hexagon)
            const shootX = startX + spikeLen * t * Math.cos(baseAngle);
            const shootY = startY + spikeLen * t * Math.sin(baseAngle);
            const shootLen = spikeLen * (0.55 - m * 0.06); // Longer shoots
            const shootAngle = 0.9 + m * 0.06; // ~52-58 degrees
            
            // Right side shoot with double-sided sub-branches
            generateBranch(shootX, shootY, baseAngle + shootAngle, shootLen, 1.0, 1, `${i}-mr-${m}`);
            // Left side shoot with double-sided sub-branches  
            generateBranch(shootX, shootY, baseAngle - shootAngle, shootLen, 1.0, 1, `${i}-ml-${m}`);
          }
          
          return (
            <g key={i}>
              {/* Main stem */}
              <line
                x1={startX} y1={startY} x2={endX} y2={endY}
                stroke={nodeColor}
                strokeWidth={isHighlighted ? 2.5 : 1.8}
                strokeLinecap="round"
                style={{ 
                  opacity: isHighlighted ? 1 : 0.8,
                  pointerEvents: 'none',
                  filter: isHighlighted ? `drop-shadow(0 0 3px ${nodeColor})` : undefined,
                }}
              />
              
              {/* Dual mode: show min marker as thicker inner stem */}
              {isDualMode && (
                <line
                  x1={startX} y1={startY}
                  x2={minEndX}
                  y2={minEndY}
                  stroke={nodeColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{ opacity: 0.95, pointerEvents: 'none' }}
                />
              )}
              
              {/* All sub-branches */}
              {allBranches}
            </g>
          );
        });
      })()}
      
      {/* Invisible interaction wedges for spike dragging - covers area outside circle */}
      {!isEmpty && (() => {
        const innerR = effectiveSize / 2 - 8;
        const outerR = effectiveSize / 2 + 45; // Generous interaction area
        
        // Handler functions for spike dragging
        const handleWedgePointerDown = (spikeIndex: number, e: React.PointerEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDraggingSpike(spikeIndex);
          setHoveringSpike(null);
          spikeStartRef.current = {
            phraseLength: node.phraseLength,
            phraseMax: node.phraseLengthMax,
            clientX: e.clientX,
            clientY: e.clientY,
          };
          (e.target as Element).setPointerCapture(e.pointerId);
        };
        
        const handleWedgePointerMove = (spikeIndex: number, e: React.PointerEvent) => {
          if (draggingSpike !== spikeIndex || !spikeStartRef.current || !onPhraseChange) return;
          
          const baseAngle = (spikeIndex * 60 - 90) * Math.PI / 180;
          const dx = e.clientX - spikeStartRef.current.clientX;
          const dy = e.clientY - spikeStartRef.current.clientY;
          
          // Project movement onto spike direction
          const projectedDist = dx * Math.cos(baseAngle) + dy * Math.sin(baseAngle);
          
          // Convert to phrase change: 2 pixels per phrase (more sensitive)
          const phraseDelta = Math.round(projectedDist / 2);
          const phraseMin = node.phraseLength;
          const isDualMode = node.phraseLengthMax !== undefined;
          
          if (isDualMode) {
            // In dual mode, dragging changes the max value
            const newMax = Math.max(1, Math.min(100, (spikeStartRef.current.phraseMax ?? phraseMin) + phraseDelta));
            if (newMax >= spikeStartRef.current.phraseLength) {
              onPhraseChange(node.id, newMax, true);
            }
          } else {
            // Single mode: change the value
            const newValue = Math.max(1, Math.min(100, spikeStartRef.current.phraseLength + phraseDelta));
            onPhraseChange(node.id, newValue, false);
          }
        };
        
        const handleWedgePointerUp = (e: React.PointerEvent) => {
          setDraggingSpike(null);
          (e.target as Element).releasePointerCapture(e.pointerId);
          spikeStartRef.current = null;
        };
        
        // Create 6 wedge-shaped interaction areas
        return [0, 1, 2, 3, 4, 5].map(i => {
          const angle1 = ((i * 60 - 90) - 30) * Math.PI / 180;
          const angle2 = ((i * 60 - 90) + 30) * Math.PI / 180;
          
          // Create wedge path
          const path = `
            M ${x + innerR * Math.cos(angle1)} ${y + innerR * Math.sin(angle1)}
            L ${x + outerR * Math.cos(angle1)} ${y + outerR * Math.sin(angle1)}
            A ${outerR} ${outerR} 0 0 1 ${x + outerR * Math.cos(angle2)} ${y + outerR * Math.sin(angle2)}
            L ${x + innerR * Math.cos(angle2)} ${y + innerR * Math.sin(angle2)}
            A ${innerR} ${innerR} 0 0 0 ${x + innerR * Math.cos(angle1)} ${y + innerR * Math.sin(angle1)}
            Z
          `;
          
          return (
            <path
              key={`wedge-${i}`}
              d={path}
              fill="transparent"
              style={{ cursor: draggingSpike === i ? 'grabbing' : 'grab' }}
              onPointerEnter={() => setHoveringSpike(i)}
              onPointerLeave={() => { if (draggingSpike === null) setHoveringSpike(null); }}
              onPointerDown={(e) => handleWedgePointerDown(i, e)}
              onPointerMove={(e) => handleWedgePointerMove(i, e)}
              onPointerUp={handleWedgePointerUp}
              onPointerCancel={handleWedgePointerUp}
            />
          );
        });
      })()}
      
      {/* Node label - shows phrase count when dragging spikes */}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isEmpty ? COLORS.textMuted : (draggingSpike !== null ? node.color || COLORS.filledNode : COLORS.text)}
        fontSize={isEmpty ? 18 : (draggingSpike !== null ? 16 : 13)}
        fontFamily="'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {draggingSpike !== null 
          ? (node.phraseLengthMax !== undefined ? node.phraseLengthMax : node.phraseLength)
          : getNodeInitial(node.presetName)}
      </text>
    </g>
  );
};

interface CenterNodeProps {
  x: number;
  y: number;
  size: number;
  isPlaying: boolean;
  isEnding: boolean;
  isMorphing: boolean;  // True during active lerping - disables CSS transitions
  isValidDropTarget: boolean;
  isDragSource: boolean;
  nodeColor?: string;  // Current node color for dynamic theming
  isMobile?: boolean;  // Hide outer rings on mobile
  onClick: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onLongHover?: (show: boolean, screenX: number, screenY: number) => void;  // Long hover callback for tracker
}

const CenterNode: React.FC<CenterNodeProps> = ({
  x,
  y,
  size,
  isPlaying,
  isEnding,
  isMorphing,
  isValidDropTarget: _isValidDropTarget,
  isDragSource,
  nodeColor,
  isMobile,
  onClick,
  onDragStart,
  onLongHover,
}) => {
  // Track if this was a drag or a click
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const pendingEvent = useRef<React.MouseEvent | React.TouchEvent | null>(null);
  const longHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShowingTracker = useRef(false);
  
  // Long hover handler - show tracker after 600ms hover when playing
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!isPlaying && !isEnding) return; // Only show tracker when playing
    
    // Get screen coordinates for the popup
    const svgEl = (e.currentTarget as SVGGElement).ownerSVGElement;
    const svgRect = svgEl?.getBoundingClientRect();
    const screenX = svgRect ? svgRect.left + x : e.clientX;
    const screenY = svgRect ? svgRect.top + y : e.clientY;
    
    longHoverTimer.current = setTimeout(() => {
      isShowingTracker.current = true;
      onLongHover?.(true, screenX, screenY);
    }, 600);
  };
  
  const handleMouseLeaveForHover = () => {
    if (longHoverTimer.current) {
      clearTimeout(longHoverTimer.current);
      longHoverTimer.current = null;
    }
    if (isShowingTracker.current) {
      isShowingTracker.current = false;
      onLongHover?.(false, 0, 0);
    }
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;
    pendingEvent.current = e;
    // Don't start drag yet - wait for mouse move
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current && !dragStarted.current) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Start drag after 5px of movement
      if (distance >= 5 && pendingEvent.current) {
        dragStarted.current = true;
        onDragStart(pendingEvent.current);
      }
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragStartPos.current && !dragStarted.current) {
      // Didn't move enough - treat as click
      e.stopPropagation();
      onClick();
    }
    dragStartPos.current = null;
    dragStarted.current = false;
    pendingEvent.current = null;
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragStarted.current = false;
    pendingEvent.current = e;
    // Don't start drag yet - wait for touch move
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartPos.current && !dragStarted.current && e.touches[0]) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartPos.current.x;
      const dy = touch.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Start drag after 10px of movement
      if (distance >= 10 && pendingEvent.current) {
        dragStarted.current = true;
        onDragStart(pendingEvent.current);
      }
    }
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartPos.current && !dragStarted.current) {
      // Didn't move enough - treat as tap
      e.stopPropagation();
      e.preventDefault(); // Prevent synthetic click event on touch devices
      onClick();
    }
    dragStartPos.current = null;
    dragStarted.current = false;
    pendingEvent.current = null;
  };
  
  // Prevent click events that might fire after touch (synthetic clicks)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // On touch devices, we already handled the tap in handleTouchEnd
    // On mouse devices, we handle click in handleMouseUp
    // So this handler just prevents bubbling
  };
  
  return (
    <g 
      style={{ cursor: 'pointer' }} 
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={(e) => {
        handleMouseUp(e as unknown as React.MouseEvent);
        handleMouseLeaveForHover();
      }}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Center node uses circles (not hexagon like preset nodes) */}
      {(() => {
        const outerR = size / 2;
        const middleR = size / 2 - 6;
        const innerR = size / 2 - 12;
        const glowR = size / 2 + 16;
        
        // Compute dynamic color based on nodeColor or fallback
        const dynamicColor = nodeColor || COLORS.centerNode;
        const dynamicGlow = nodeColor 
          ? `${nodeColor}88`  // Add transparency
          : COLORS.activeNodeGlow;
        
        return (
          <>
            {/* Outer ambient glow circle - hidden on mobile */}
            {!isMobile && (
              <circle
                cx={x}
                cy={y}
                r={glowR}
                fill="none"
                stroke={isPlaying ? dynamicGlow : 'rgba(232, 220, 196, 0.1)'}
                strokeWidth={1}
                filter="url(#glow)"
                style={{ opacity: isPlaying ? 0.8 : 0.4, transition: isMorphing ? 'none' : 'stroke 0.3s ease-out, opacity 0.3s ease-out' }}
              />
            )}
            
            {/* Background fill circle */}
            <circle
              cx={x}
              cy={y}
              r={outerR}
              fill={isPlaying ? `${dynamicColor}15` : 'rgba(232, 220, 196, 0.04)'}
              stroke="none"
              style={{ transition: isMorphing ? 'none' : 'fill 0.3s ease-out' }}
            />
            
            {/* Outer circle ring - hidden on mobile */}
            {!isMobile && (
              <circle
                cx={x}
                cy={y}
                r={outerR}
                fill="none"
                stroke={isPlaying ? dynamicColor : COLORS.centerNodeBorder}
                strokeWidth={1.5}
                style={{ 
                  opacity: isDragSource ? 0.5 : 1,
                  transition: isMorphing ? 'none' : 'all 0.3s ease-out, stroke 0.3s ease-out',
                }}
              />
            )}
            
            {/* Middle circle ring */}
            <circle
              cx={x}
              cy={y}
              r={middleR}
              fill="none"
              stroke={isPlaying ? dynamicColor : COLORS.centerNode}
              strokeWidth={0.75}
              style={{ opacity: 0.5, transition: isMorphing ? 'none' : 'stroke 0.3s ease-out' }}
            />
            
            {/* Inner circle ring */}
            <circle
              cx={x}
              cy={y}
              r={innerR}
              fill="none"
              stroke={isPlaying ? dynamicColor : COLORS.centerNode}
              strokeWidth={1}
              style={{
                animation: isPlaying ? 'pulse 2s ease-in-out infinite' : undefined,
                opacity: isPlaying ? 1 : 0.7,
                transition: isMorphing ? 'none' : 'stroke 0.3s ease-out, opacity 0.3s ease-out',
              }}
            />
          </>
        );
      })()}
      
      {/* Play/Stop icon */}
      {isPlaying ? (
        // Stop icon (rounded square)
        <rect
          x={x - 7}
          y={y - 7}
          width={14}
          height={14}
          rx={2}
          fill={nodeColor || COLORS.centerNodePlaying}
          style={{ transition: isMorphing ? 'none' : 'fill 0.2s ease' }}
        />
      ) : (
        // Play icon (triangle)
        <polygon
          points={`${x - 5},${y - 9} ${x - 5},${y + 9} ${x + 9},${y}`}
          fill={COLORS.centerNode}
        />
      )}
      
      {/* End glow when journey is about to end */}
      {isEnding && (
        <>
          <circle
            cx={x}
            cy={y}
            r={size / 2 + 18}
            fill="none"
            stroke={COLORS.endGlow}
            strokeWidth={1}
            filter="url(#glow)"
            style={{ opacity: 0.6, animation: 'pulse 1.5s ease-in-out infinite' }}
          />
          <circle
            cx={x}
            cy={y}
            r={size / 2 + 10}
            fill="none"
            stroke={COLORS.endGlow}
            strokeWidth={2}
            filter="url(#glow)"
            style={{ opacity: 0.8 }}
          />
        </>
      )}
    </g>
  );
};

interface ConnectionArcProps {
  connection: JourneyConnection;
  fromNode: JourneyNode;
  toNode: JourneyNode;
  centerX: number;
  centerY: number;
  radius: number;
  isMorphing: boolean;
  isEnding: boolean;  // fadeout phase
  morphProgress: number;
  onClick: () => void;
  onDurationChange?: (connId: string, duration: number, isMax?: boolean) => void;
}

const ConnectionArc: React.FC<ConnectionArcProps> = ({
  connection,
  fromNode,
  toNode,
  centerX,
  centerY,
  radius,
  isMorphing,
  isEnding,
  morphProgress,
  onClick,
  onDurationChange,
}) => {
  const pathD = calculateCurvedPath(
    fromNode.position,
    toNode.position,
    centerX,
    centerY,
    radius
  );
  
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  
  // Hover and drag state for adjusting morph duration
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragStartRef = useRef<{ startY: number; startValue: number } | null>(null);
  
  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [pathD]);
  
  // Determine connection type and color
  const isStartConnection = fromNode.position === 'center' || fromNode.presetId === '__CENTER__';
  const isEndConnection = toNode.position === 'center' || toNode.presetId === '__CENTER__';
  
  let connectionColor = COLORS.connection;
  if (isEnding) {
    connectionColor = COLORS.endingConnection;
  } else if (isMorphing) {
    connectionColor = COLORS.morphingConnection;
  } else if (isStartConnection) {
    connectionColor = COLORS.startConnection;
  } else if (isEndConnection) {
    connectionColor = COLORS.endConnection;
  }
  
  // START connections: no interaction, just visual indicator
  if (isStartConnection) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <path
          d={pathD}
          fill="none"
          stroke={connectionColor}
          strokeWidth={1.5}
          strokeDasharray="3,8"
          strokeLinecap="round"
          style={{ opacity: 0.35 }}
        />
      </g>
    );
  }
  
  // For END connections and normal connections, use probability-based width
  const lineWidth = getProbabilityWidth(connection.probability);
  
  // Average morph duration for branch complexity - use drag value if dragging
  const avgMorph = dragValue ?? ((connection.morphDuration + (connection.morphDurationMax ?? connection.morphDuration)) / 2);
  
  // Drag handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const isDualMode = connection.morphDurationMax !== undefined;
    const startValue = isDualMode 
      ? Math.round((connection.morphDuration + connection.morphDurationMax!) / 2)
      : connection.morphDuration;
    dragStartRef.current = { startY: clientY, startValue };
    setIsDragging(true);
    setDragValue(startValue);
    
    let currentDragValue = startValue;
    
    const handleMove = (moveE: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const moveY = 'touches' in moveE ? moveE.touches[0].clientY : moveE.clientY;
      // Moving up/away = more phrases, down/towards = fewer
      const delta = (dragStartRef.current.startY - moveY) / 4;
      const newValue = Math.max(1, Math.min(100, Math.round(dragStartRef.current.startValue + delta)));
      currentDragValue = newValue;
      setDragValue(newValue);
    };
    
    const handleEnd = () => {
      if (dragStartRef.current && onDurationChange) {
        onDurationChange(connection.id, currentDragValue);
      }
      setIsDragging(false);
      setIsHovering(false);
      setDragValue(null);
      dragStartRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
  };
  
  return (
    <g style={{ cursor: isDragging ? 'ns-resize' : 'pointer' }} onClick={isDragging ? undefined : onClick}>
      {/* Invisible wider path for clicking and dragging - extra wide for mobile touch */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={48}
        style={{ cursor: 'ns-resize' }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => !isDragging && setIsHovering(false)}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      />
      
      {/* Hover highlight - subtle indicator of which connection is targeted */}
      <path
        d={pathD}
        fill="none"
        stroke="rgba(140, 200, 255, 0.35)"
        strokeWidth={lineWidth + 6}
        strokeLinecap="round"
        style={{ 
          opacity: (isHovering || isDragging) && !isMorphing && !isEnding ? 0.6 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.25s ease-in-out',
        }}
      />
      
      {/* Subtle glow behind active connections */}
      {(isMorphing || isEnding) && (
        <path
          d={pathD}
          fill="none"
          stroke={connectionColor}
          strokeWidth={lineWidth + 4}
          strokeLinecap="round"
          filter="url(#glow)"
          style={{ opacity: 0.3 }}
        />
      )}
      
      {/* Main connection path - solid line, no dashes */}
      <path
        ref={pathRef}
        d={pathD}
        fill="none"
        stroke={connectionColor}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        style={{
          opacity: (isMorphing || isEnding) ? 0.9 : 0.5,
          transition: 'opacity 0.3s ease',
        }}
      />
      
      {/* Snowflake-style frost branches along the path - complexity based on morph duration */}
      {pathLength > 0 && pathRef.current && (() => {
        // Number of branch points based on morph duration (more = longer morph)
        // 1-100 phrases maps to 2-6 branch points
        const numBranchPoints = Math.max(2, Math.min(6, Math.floor(avgMorph / 10) + 2));
        const complexity = avgMorph / 100; // 0 to 1
        const maxDepth = Math.floor(1 + complexity * 2); // 1-3 depth levels
        const branchElements: JSX.Element[] = [];
        
        for (let i = 0; i < numBranchPoints; i++) {
          // Distribute along 15%-85% of path
          const t = numBranchPoints === 1 ? 0.5 : 0.15 + (i / (numBranchPoints - 1)) * 0.7;
          const point = pathRef.current!.getPointAtLength(pathLength * t);
          
          // Get direction perpendicular to path
          const t2 = Math.min(1, t + 0.01);
          const point2 = pathRef.current!.getPointAtLength(pathLength * t2);
          const dx = point2.x - point.x;
          const dy = point2.y - point.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const perpX = -dy / len;
          const perpY = dx / len;
          
          // Main spike length based on morph duration (6-18 pixels)
          const spikeLen = 6 + complexity * 12;
          const branchOpacity = (isMorphing || isEnding) ? 0.75 : 0.45;
          
          // Path direction (normalized) - branches angle backward from flow direction
          const pathDirX = dx / len;
          const pathDirY = dy / len;
          
          // Recursive branch generator
          const generateBranch = (
            bx: number, by: number,
            dirX: number, dirY: number,
            length: number,
            width: number,
            depth: number,
            keyPrefix: string
          ) => {
            if (depth > maxDepth || length < 2) return;
            
            const endX = bx + dirX * length;
            const endY = by + dirY * length;
            
            // Draw branch line
            branchElements.push(
              <line
                key={`${keyPrefix}-line`}
                x1={bx} y1={by} x2={endX} y2={endY}
                stroke={connectionColor}
                strokeWidth={Math.max(0.4, width)}
                strokeLinecap="round"
                style={{ opacity: branchOpacity - depth * 0.15 }}
              />
            );
            
            // Add sub-branches on BOTH sides (true snowflake fractal pattern)
            if (depth < maxDepth) {
              const numSub = Math.floor(1 + complexity * 2); // 1-3 sub-branches per side
              for (let s = 0; s < numSub; s++) {
                const subT = 0.3 + (s / Math.max(1, numSub)) * 0.45;
                const subX = bx + dirX * length * subT;
                const subY = by + dirY * length * subT;
                const subLen = length * (0.55 - s * 0.12);
                const subAngle = 0.5 + s * 0.15; // ~30-45 degrees
                
                // Rotate direction for sub-branch - LEFT side
                const cosA = Math.cos(subAngle);
                const sinA = Math.sin(subAngle);
                const subDirLeftX = dirX * cosA - dirY * sinA;
                const subDirLeftY = dirY * cosA + dirX * sinA;
                
                generateBranch(
                  subX, subY,
                  subDirLeftX, subDirLeftY,
                  subLen,
                  width * 0.6,
                  depth + 1,
                  `${keyPrefix}-L${s}`
                );
                
                // RIGHT side (mirror angle)
                const subDirRightX = dirX * cosA + dirY * sinA;
                const subDirRightY = dirY * cosA - dirX * sinA;
                
                generateBranch(
                  subX, subY,
                  subDirRightX, subDirRightY,
                  subLen,
                  width * 0.6,
                  depth + 1,
                  `${keyPrefix}-R${s}`
                );
              }
            }
          };
          
          // Angle branches backward from flow direction (~45 degrees)
          // This creates an arrow-like pattern showing morph direction
          const branchAngle = 0.7; // ~40 degrees from perpendicular
          const cosB = Math.cos(branchAngle);
          const sinB = Math.sin(branchAngle);
          
          // Right side - angle backward (against flow)
          const rightDirX = perpX * cosB - pathDirX * sinB;
          const rightDirY = perpY * cosB - pathDirY * sinB;
          generateBranch(point.x, point.y, rightDirX, rightDirY, spikeLen, 0.9, 1, `${i}-r`);
          
          // Left side - also angled backward (against flow)
          const leftDirX = -perpX * cosB - pathDirX * sinB;
          const leftDirY = -perpY * cosB - pathDirY * sinB;
          generateBranch(point.x, point.y, leftDirX, leftDirY, spikeLen, 0.9, 1, `${i}-l`);
        }
        
        return branchElements;
      })()}
      
      {/* Drag label - show phrase count while dragging */}
      {isDragging && dragValue !== null && pathLength > 0 && pathRef.current && (() => {
        const midpoint = pathRef.current!.getPointAtLength(pathLength * 0.5);
        return (
          <g>
            {/* Ice-transparent background */}
            <circle
              cx={midpoint.x}
              cy={midpoint.y}
              r={18}
              fill="rgba(140, 200, 255, 0.4)"
              stroke="rgba(180, 220, 255, 0.6)"
              strokeWidth={1}
              filter="url(#glow)"
            />
            <text
              x={midpoint.x}
              y={midpoint.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize="16"
              fontWeight="bold"
              style={{ pointerEvents: 'none', textShadow: '0 0 4px rgba(100, 180, 255, 0.8)' }}
            >
              {dragValue}
            </text>
          </g>
        );
      })()}
      
      {/* Morph progress indicator - traveling dot */}
      {isMorphing && pathLength > 0 && pathRef.current && (() => {
        const point = pathRef.current!.getPointAtLength(pathLength * morphProgress);
        return (
          <circle
            cx={point.x}
            cy={point.y}
            r={DOT_SIZE + 1}
            fill={COLORS.morphingConnection}
            filter="url(#glow)"
          />
        );
      })()}
    </g>
  );
};

// Self-loop arc component - curved loop going outward from a node
interface SelfLoopArcProps {
  connection: JourneyConnection;
  node: JourneyNode;
  centerX: number;
  centerY: number;
  radius: number;
  isMorphing: boolean;
  isEnding: boolean;
  morphProgress: number;
  onClick: () => void;
}

const SelfLoopArc: React.FC<SelfLoopArcProps> = ({
  connection,
  node,
  centerX,
  centerY,
  radius,
  isMorphing,
  isEnding,
  morphProgress,
  onClick,
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  
  // Calculate position and direction for the loop
  const coords = getDiamondCoordinates(node.position, centerX, centerY, radius);
  
  // Direction away from center for the loop bulge
  const dx = coords.x - centerX;
  const dy = coords.y - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const normalX = dist > 0 ? dx / dist : 0;
  const normalY = dist > 0 ? dy / dist : -1;
  
  // Perpendicular direction
  const perpX = -normalY;
  const perpY = normalX;
  
  // Node radius and loop circle radius (1.2x node size)
  const nodeRadius = NODE_BASE_SIZE * 0.5;
  const loopRadius = NODE_BASE_SIZE * 0.6; // 1.2x the node radius
  
  // Start and end points at ±60 degrees from the outward direction on the node perimeter
  const angle60 = Math.PI / 3; // 60 degrees in radians
  const startAngleX = normalX * Math.cos(angle60) + perpX * Math.sin(angle60);
  const startAngleY = normalY * Math.cos(angle60) + perpY * Math.sin(angle60);
  const endAngleX = normalX * Math.cos(angle60) - perpX * Math.sin(angle60);
  const endAngleY = normalY * Math.cos(angle60) - perpY * Math.sin(angle60);
  
  const startX = coords.x + startAngleX * nodeRadius;
  const startY = coords.y + startAngleY * nodeRadius;
  const endX = coords.x + endAngleX * nodeRadius;
  const endY = coords.y + endAngleY * nodeRadius;
  
  // Use SVG arc command for a proper circular arc
  // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  // large-arc-flag = 1 (we want the larger arc going outward, ~240 degrees)
  // sweep-flag = 0 (counterclockwise from start to end)
  const pathD = `M ${startX} ${startY} A ${loopRadius} ${loopRadius} 0 1 0 ${endX} ${endY}`;

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [pathD]);

  // Fade logic during ending phase
  const endingOpacity = isEnding ? Math.max(0, 1 - morphProgress * 1.5) : 1;

  // Calculate morph duration for branch complexity (same as ConnectionArc)
  const minMorph = connection.morphDuration;
  const maxMorph = connection.morphDurationMax ?? connection.morphDuration;
  const avgMorph = (minMorph + maxMorph) / 2;
  const lineWidth = getProbabilityWidth(connection.probability);
  const connectionColor = (isMorphing || isEnding) ? COLORS.morphingConnection : COLORS.connection;

  return (
    <g style={{ cursor: 'pointer', opacity: endingOpacity }} onClick={onClick}>
      {/* Invisible hit area */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={48}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />
      
      {/* Hover highlight - same style as ConnectionArc */}
      <path
        d={pathD}
        fill="none"
        stroke="rgba(140, 200, 255, 0.35)"
        strokeWidth={lineWidth + 6}
        strokeLinecap="round"
        style={{ 
          opacity: isHovering && !isMorphing && !isEnding ? 0.6 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.25s ease-in-out',
        }}
      />
      
      {/* Subtle glow behind active connections */}
      {(isMorphing || isEnding) && (
        <path
          d={pathD}
          fill="none"
          stroke={connectionColor}
          strokeWidth={lineWidth + 4}
          strokeLinecap="round"
          filter="url(#glow)"
          style={{ opacity: 0.3 }}
        />
      )}
      
      {/* Main connection path */}
      <path
        ref={pathRef}
        d={pathD}
        fill="none"
        stroke={connectionColor}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        style={{
          opacity: (isMorphing || isEnding) ? 0.9 : 0.5,
          transition: 'opacity 0.3s ease',
        }}
      />
      
      {/* Snowflake-style frost branches along the path */}
      {pathLength > 0 && pathRef.current && (() => {
        const numBranchPoints = Math.max(2, Math.min(5, Math.floor(avgMorph / 12) + 2));
        const complexity = avgMorph / 100;
        const maxDepth = Math.floor(1 + complexity * 2);
        const branchElements: JSX.Element[] = [];
        
        for (let i = 0; i < numBranchPoints; i++) {
          const t = numBranchPoints === 1 ? 0.5 : 0.15 + (i / (numBranchPoints - 1)) * 0.7;
          const point = pathRef.current!.getPointAtLength(pathLength * t);
          
          const t2 = Math.min(1, t + 0.01);
          const point2 = pathRef.current!.getPointAtLength(pathLength * t2);
          const pdx = point2.x - point.x;
          const pdy = point2.y - point.y;
          const plen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
          const bperpX = -pdy / plen;
          const bperpY = pdx / plen;
          
          const spikeLen = 5 + complexity * 10;
          const branchOpacity = (isMorphing || isEnding) ? 0.75 : 0.45;
          
          const generateBranch = (
            ox: number, oy: number,
            dirX: number, dirY: number,
            length: number,
            depth: number,
            side: number
          ): JSX.Element[] => {
            if (depth > maxDepth || length < 3) return [];
            
            const angleOffset = side * 0.7;
            const bDx = Math.cos(Math.atan2(dirY, dirX) + angleOffset);
            const bDy = Math.sin(Math.atan2(dirY, dirX) + angleOffset);
            
            const ex = ox + bDx * length;
            const ey = oy + bDy * length;
            const elements: JSX.Element[] = [
              <line
                key={`branch-${i}-${depth}-${side}-${ox.toFixed(1)}`}
                x1={ox} y1={oy} x2={ex} y2={ey}
                stroke={connectionColor}
                strokeWidth={Math.max(0.5, 1.5 - depth * 0.4)}
                strokeLinecap="round"
                style={{ opacity: branchOpacity * (1 - depth * 0.2), pointerEvents: 'none' }}
              />
            ];
            
            if (depth < maxDepth) {
              elements.push(...generateBranch(ex, ey, bDx, bDy, length * 0.55, depth + 1, 1));
              elements.push(...generateBranch(ex, ey, bDx, bDy, length * 0.55, depth + 1, -1));
            }
            return elements;
          };
          
          branchElements.push(...generateBranch(point.x, point.y, bperpX, bperpY, spikeLen, 0, 1));
          branchElements.push(...generateBranch(point.x, point.y, bperpX, bperpY, spikeLen, 0, -1));
        }
        
        return branchElements;
      })()}
      
      {/* Morph progress indicator */}
      {isMorphing && pathLength > 0 && pathRef.current && (() => {
        const point = pathRef.current!.getPointAtLength(pathLength * morphProgress);
        return (
          <circle
            cx={point.x}
            cy={point.y}
            r={DOT_SIZE + 1}
            fill={COLORS.morphingConnection}
            filter="url(#glow)"
          />
        );
      })()}
    </g>
  );
};

interface DragLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const DragLine: React.FC<DragLineProps> = ({ fromX, fromY, toX, toY }) => {
  return (
    <>
      {/* Glow behind drag line */}
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={COLORS.dragGhost}
        strokeWidth={4}
        strokeLinecap="round"
        filter="url(#glow)"
        style={{ pointerEvents: 'none', opacity: 0.25 }}
      />
      {/* Dotted line */}
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={COLORS.dragGhost}
        strokeWidth={2}
        strokeDasharray="4,6"
        strokeLinecap="round"
        style={{ pointerEvents: 'none', opacity: 0.8 }}
      />
      {/* End dot */}
      <circle
        cx={toX}
        cy={toY}
        r={5}
        fill={COLORS.dragGhost}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
};

// Ghost connection lines showing possible connections from a source node
interface GhostConnectionLinesProps {
  fromPosition: DiamondPosition;
  fromNodeId: string;
  centerX: number;
  centerY: number;
  radius: number;
  filledPositions: DiamondPosition[]; // Only show lines to filled nodes
  existingConnections: JourneyConnection[]; // Existing connections to exclude
  nodes: JourneyNode[]; // All nodes to map positions to IDs
}

const GhostConnectionLines: React.FC<GhostConnectionLinesProps> = ({
  fromPosition,
  fromNodeId,
  centerX,
  centerY,
  radius,
  filledPositions,
  existingConnections,
  nodes,
}) => {
  const allPositions: DiamondPosition[] = ['left', 'top', 'right', 'bottom', 'center'];
  
  // Get valid target positions (different from source, filled, and no existing connection)
  const targetPositions = allPositions.filter(pos => {
    if (pos === fromPosition) return false;
    if (pos !== 'center' && !filledPositions.includes(pos)) return false;
    
    // Check if connection already exists from source to this target
    const targetNode = nodes.find(n => n.position === pos);
    if (!targetNode) return false;
    
    const connectionExists = existingConnections.some(
      c => c.fromNodeId === fromNodeId && c.toNodeId === targetNode.id
    );
    return !connectionExists;
  });
  
  return (
    <g style={{ pointerEvents: 'none' }}>
      {targetPositions.map(targetPos => {
        // Use the same path calculation as the actual connections
        const pathD = calculateCurvedPath(
          fromPosition,
          targetPos,
          centerX,
          centerY,
          radius
        );
        
        const toCoords = getDiamondCoordinates(targetPos, centerX, centerY, radius);
        
        return (
          <g key={targetPos}>
            {/* Faint glow */}
            <path
              d={pathD}
              fill="none"
              stroke={COLORS.dragGhost}
              strokeWidth={3}
              filter="url(#glow)"
              opacity={0.1}
            />
            {/* Dotted ghost line */}
            <path
              d={pathD}
              fill="none"
              stroke={COLORS.dragGhost}
              strokeWidth={1.5}
              strokeDasharray="6,8"
              strokeLinecap="round"
              opacity={0.25}
            />
            {/* Small target indicator */}
            <circle
              cx={toCoords.x}
              cy={toCoords.y}
              r={targetPos === 'center' ? CENTER_NODE_SIZE / 2 + 8 : NODE_BASE_SIZE / 2 + 6}
              fill="none"
              stroke={COLORS.dragGhost}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              opacity={0.2}
            />
          </g>
        );
      })}
    </g>
  );
};

// ============================================================================
// POPUP COMPONENTS
// ============================================================================

interface NodePopupProps {
  node: JourneyNode;
  outgoingConnections: Array<{ connection: JourneyConnection; targetName: string; targetColor: string; normalizedProbability: number }>;
  x: number;
  y: number;
  isMobile?: boolean;
  onChangePhraseMin: (phrases: number) => void;
  onChangePhraseMax: (phrases: number) => void;
  onTogglePhraseDual: () => void;
  onChangePreset: () => void;
  onRemove: () => void;
  onConnectionClick?: (connection: JourneyConnection, screenX: number, screenY: number) => void;
  onRectChange?: (rect: DOMRect) => void;
}

const NodePopup: React.FC<NodePopupProps> = ({
  node,
  outgoingConnections,
  x,
  y,
  isMobile = false,
  onChangePhraseMin,
  onChangePhraseMax,
  onTogglePhraseDual,
  onChangePreset,
  onRemove,
  onConnectionClick,
  onRectChange,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  
  // Dual mode is active when phraseLengthMax is defined and different from phraseLength
  const isDualMode = node.phraseLengthMax !== undefined;
  const minValue = node.phraseLength;
  const maxValue = node.phraseLengthMax ?? node.phraseLength;
  
  // Long press detection for mobile (toggle dual mode)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const LONG_PRESS_DURATION = 400; // ms
  
  const handleLongPressStart = () => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      onTogglePhraseDual();
    }, LONG_PRESS_DURATION);
  };
  
  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  const handleLongPressMove = () => {
    // Cancel long press if finger moves (user is dragging, not pressing)
    handleLongPressEnd();
  };
  
  // Calculate time from phrases using PHRASE_LENGTH constant
  const phrasesToTime = (phrases: number): string => {
    const seconds = phrases * PHRASE_LENGTH;
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
  };
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x, y });
  
  // Adjust position to keep popup within viewport
  useEffect(() => {
    if (!popupRef.current) return;
    
    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const padding = 10;
    
    let newX = x;
    let newY = y;
    
    // Check right edge
    if (rect.right > window.innerWidth - padding) {
      newX = x - (rect.right - window.innerWidth + padding);
    }
    // Check left edge
    if (rect.left < padding) {
      newX = x + (padding - rect.left);
    }
    // Check top edge
    if (rect.top < padding) {
      newY = y + rect.height + 20;
    }
    
    // Always update adjustedPos when x,y props change
    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);
  
  // Report bounding rect to parent after position adjustments
  useEffect(() => {
    if (!popupRef.current || !onRectChange) return;
    // Use a small delay to ensure the popup has rendered with final position
    const timer = setTimeout(() => {
      if (popupRef.current) {
        onRectChange(popupRef.current.getBoundingClientRect());
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [adjustedPos, onRectChange]);
  
  return (
    <div
      ref={popupRef}
      data-popup="true"
      style={{
        position: 'fixed',
        left: isMobile ? '50%' : adjustedPos.x,
        top: isMobile ? 12 : adjustedPos.y,
        transform: isMobile ? 'translateX(-50%)' : 'translate(-50%, -100%) translateY(-12px)',
        background: COLORS.popup,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        border: `1px solid ${COLORS.popupBorder}`,
        borderRadius: 12,
        padding: isMobile ? '10px 14px' : '14px 18px',
        minWidth: isMobile ? 200 : 180,
        maxWidth: isMobile ? 260 : 220,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 1px ${COLORS.popupGlow}, inset 0 1px 0 ${COLORS.popupGlow}`,
        fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: COLORS.text,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>
        {`
          @keyframes scrollText {
            0%, 20% { transform: translateX(0); }
            80%, 100% { transform: translateX(-50%); }
          }
        `}
      </style>
      <div style={{ 
        fontWeight: '500', 
        marginBottom: isMobile ? 8 : 14, 
        color: node.color || COLORS.filledNode,
        fontSize: 11,
        letterSpacing: '0.02em',
      }}>
        {node.presetName}
      </div>
      
      <div style={{ marginBottom: isMobile ? 8 : 14 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          fontSize: 9, 
          color: COLORS.textMuted, 
          marginBottom: isMobile ? 4 : 8, 
          textTransform: 'uppercase', 
          letterSpacing: '0.1em' 
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Phrase</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              Length
              {isDualMode && (
                <span style={{ 
                  marginLeft: 6, 
                  fontSize: 7, 
                  padding: '1px 4px', 
                  background: 'rgba(139, 92, 246, 0.2)', 
                  color: '#8b5cf6', 
                  borderRadius: 3,
                  textTransform: 'none',
                }}>
                  ⟷
                </span>
              )}
            </span>
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            color: node.color || COLORS.filledNode, 
            fontWeight: '600',
            fontSize: 10,
            textTransform: 'none',
          }}>
            <span>
              {isDualMode 
                ? `${minValue}-${maxValue} phrases`
                : `${minValue} ${minValue === 1 ? 'phrase' : 'phrases'}`
              }
            </span>
            <span style={{ opacity: 0.7 }}>
              {isDualMode 
                ? `${phrasesToTime(minValue)}-${phrasesToTime(maxValue)}`
                : phrasesToTime(minValue)
              }
            </span>
          </div>
        </div>
        
        {isDualMode ? (
          // Dual mode - range slider with two thumbs
          <div
            ref={sliderContainerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: 20,
              cursor: 'pointer',
            }}
            onDoubleClick={onTogglePhraseDual}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onTouchMove={handleLongPressMove}
            title="Double-click or long-press for single value mode"
          >
            {/* Track background */}
            <div style={{
              position: 'absolute',
              top: 7,
              left: 0,
              right: 0,
              height: 6,
              borderRadius: 3,
              background: 'rgba(255,255,255,0.1)',
            }} />
            {/* Active range track */}
            <div style={{
              position: 'absolute',
              top: 7,
              left: `${((minValue - 1) / 63) * 100}%`,
              width: `${((maxValue - minValue) / 63) * 100}%`,
              height: 6,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${node.color || COLORS.filledNode}, rgba(139, 92, 246, 0.8))`,
            }} />
            {/* Min thumb */}
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: `${((minValue - 1) / 63) * 100}%`,
                transform: 'translateX(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: node.color || COLORS.filledNode,
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                cursor: 'grab',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (me: MouseEvent) => {
                  const rect = container.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangePhraseMin(Math.min(newVal, maxValue));
                };
                const up = () => { 
                  window.removeEventListener('mousemove', move); 
                  window.removeEventListener('mouseup', up); 
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleLongPressEnd(); // Cancel long press when dragging thumb
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (te: TouchEvent) => {
                  const rect = container.getBoundingClientRect();
                  const touch = te.touches[0];
                  const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangePhraseMin(Math.min(newVal, maxValue));
                };
                const up = () => { 
                  window.removeEventListener('touchmove', move); 
                  window.removeEventListener('touchend', up); 
                };
                window.addEventListener('touchmove', move);
                window.addEventListener('touchend', up);
              }}
            />
            {/* Max thumb */}
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: `${((maxValue - 1) / 63) * 100}%`,
                transform: 'translateX(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#8b5cf6',
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                cursor: 'grab',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (me: MouseEvent) => {
                  const rect = container.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangePhraseMax(Math.max(newVal, minValue));
                };
                const up = () => { 
                  window.removeEventListener('mousemove', move); 
                  window.removeEventListener('mouseup', up); 
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleLongPressEnd(); // Cancel long press when dragging thumb
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (te: TouchEvent) => {
                  const rect = container.getBoundingClientRect();
                  const touch = te.touches[0];
                  const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangePhraseMax(Math.max(newVal, minValue));
                };
                const up = () => { 
                  window.removeEventListener('touchmove', move); 
                  window.removeEventListener('touchend', up); 
                };
                window.addEventListener('touchmove', move);
                window.addEventListener('touchend', up);
              }}
            />
          </div>
        ) : (
          // Single mode - regular slider
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={node.phraseLength}
            onChange={(e) => onChangePhraseMin(parseInt(e.target.value, 10))}
            onDoubleClick={onTogglePhraseDual}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onTouchMove={handleLongPressMove}
            title="Double-click or long-press for range mode"
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              background: `linear-gradient(to right, ${node.color || COLORS.filledNode} 0%, ${node.color || COLORS.filledNode} ${((node.phraseLength - 1) / 99) * 100}%, rgba(255,255,255,0.1) ${((node.phraseLength - 1) / 99) * 100}%, rgba(255,255,255,0.1) 100%)`,
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          />
        )}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginTop: 4,
          fontSize: 9, 
          color: COLORS.textMuted,
          opacity: 0.6,
        }}>
          <span>1</span>
          <span>25</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      
      {/* Outgoing Connections Section */}
      {outgoingConnections.length > 0 && (
        <div style={{ marginBottom: isMobile ? 8 : 14 }}>
          <div style={{ 
            fontSize: 10, 
            color: COLORS.textMuted, 
            marginBottom: isMobile ? 4 : 8, 
            textTransform: 'uppercase', 
            letterSpacing: '0.1em' 
          }}>
            Outgoing Connections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
            {outgoingConnections.map(({ connection, targetName, targetColor, normalizedProbability }) => (
              <div 
                key={connection.id}
                onClick={(e) => {
                  if (onConnectionClick) {
                    // Position the new popup to the right of the current one
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onConnectionClick(connection, rect.right + 10, rect.top);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)',
                  gap: 8,
                  cursor: onConnectionClick ? 'pointer' : 'default',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (onConnectionClick) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(140, 200, 255, 0.1)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(140, 200, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}>
                  <div 
                    style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: targetColor || COLORS.filledNode,
                      flexShrink: 0,
                    }} 
                  />
                  <div 
                    style={{ 
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <span 
                      style={{ 
                        fontSize: 12, 
                        color: COLORS.text,
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        animation: targetName.length > 12 ? 'scrollText 12s linear infinite' : 'none',
                        paddingRight: targetName.length > 12 ? '2em' : 0,
                      }}
                    >
                      {targetName}
                      {targetName.length > 12 && <span style={{ paddingLeft: '2em' }}>{targetName}</span>}
                    </span>
                  </div>
                </div>
                {/* Arrow indicator to show this is clickable */}
                <div style={{ 
                  fontSize: 11, 
                  color: COLORS.textMuted,
                  fontWeight: '500',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span>{Math.round(normalizedProbability * 100)}%</span>
                  {onConnectionClick && <span style={{ opacity: 0.5 }}>›</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <button
          onClick={onChangePreset}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.05)',
            color: COLORS.text,
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            transition: 'all 0.15s ease',
          }}
        >
          Change
        </button>
        <button
          onClick={onRemove}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'rgba(196, 114, 78, 0.15)',
            color: '#C4724E',
            border: '1px solid rgba(196, 114, 78, 0.4)',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            transition: 'all 0.15s ease',
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

interface ConnectionPopupProps {
  connection: JourneyConnection;
  fromName: string;
  toName: string;
  x: number;
  y: number;
  onChangeDurationMin: (duration: number) => void;
  onChangeDurationMax: (duration: number) => void;
  onToggleDurationDual: () => void;
  onChangeProbability: (probability: number) => void;
  onDelete: () => void;
  adjacentRect?: DOMRect | null; // Position adjacent to this rect (right edge touching, same top)
  isSelfLoop?: boolean; // Hide morph duration for self-loops
}

const ConnectionPopup: React.FC<ConnectionPopupProps> = ({
  connection,
  fromName,
  toName,
  x,
  y,
  onChangeDurationMin,
  onChangeDurationMax,
  onToggleDurationDual,
  onChangeProbability,
  onDelete,
  adjacentRect,
  isSelfLoop,
}) => {
  const probabilities = [0.2, 0.4, 0.6, 0.8, 1.0];
  const popupRef = useRef<HTMLDivElement>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  
  // If adjacentRect is provided, position adjacent to it (right edge touching, same top)
  // Otherwise use x,y with normal centering transform
  const initialPos = adjacentRect 
    ? { x: adjacentRect.right, y: adjacentRect.top }
    : { x, y };
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>(initialPos);
  
  // Dual mode is active when morphDurationMax is defined
  const isDualMode = connection.morphDurationMax !== undefined;
  const minValue = connection.morphDuration;
  const maxValue = connection.morphDurationMax ?? connection.morphDuration;
  
  // Long press detection for mobile (toggle dual mode)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const LONG_PRESS_DURATION = 400; // ms
  
  const handleLongPressStart = () => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      onToggleDurationDual();
    }, LONG_PRESS_DURATION);
  };
  
  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  const handleLongPressMove = () => {
    // Cancel long press if finger moves (user is dragging, not pressing)
    handleLongPressEnd();
  };
  
  // Calculate time from phrases using PHRASE_LENGTH constant
  const phrasesToTime = (phrases: number): string => {
    const seconds = phrases * PHRASE_LENGTH;
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
  };
  
  // Adjust position to keep popup within viewport
  useEffect(() => {
    if (!popupRef.current) return;
    
    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const padding = 10;
    
    // If adjacent to another popup, position at right edge with same top
    if (adjacentRect) {
      let newX = adjacentRect.right;
      let newY = adjacentRect.top;
      
      // Check right edge - if it would overflow, flip to left side
      if (newX + rect.width > window.innerWidth - padding) {
        newX = adjacentRect.left - rect.width;
      }
      // Check left edge
      if (newX < padding) {
        newX = padding;
      }
      // Check bottom edge
      if (newY + rect.height > window.innerHeight - padding) {
        newY = window.innerHeight - rect.height - padding;
      }
      
      setAdjustedPos({ x: newX, y: newY });
      return;
    }
    
    let newX = x;
    let newY = y;
    
    // Check right edge
    if (rect.right > window.innerWidth - padding) {
      newX = x - (rect.right - window.innerWidth + padding);
    }
    // Check left edge
    if (rect.left < padding) {
      newX = x + (padding - rect.left);
    }
    // Check top edge
    if (rect.top < padding) {
      newY = y + rect.height + 20;
    }
    
    // Always update adjustedPos when x,y props change
    setAdjustedPos({ x: newX, y: newY });
  }, [x, y, adjacentRect]);
  
  return (
    <div
      ref={popupRef}
      data-popup="true"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        // Only apply centering transform when not adjacent to another popup
        transform: adjacentRect ? 'none' : 'translate(-50%, -100%) translateY(-12px)',
        background: COLORS.popup,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        border: `1px solid ${COLORS.popupBorder}`,
        borderRadius: 12,
        padding: '14px 18px',
        minWidth: 200,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 1px ${COLORS.popupGlow}, inset 0 1px 0 ${COLORS.popupGlow}`,
        fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: COLORS.text,
        zIndex: 1001, // Higher than primary popup when adjacent
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ 
        fontWeight: '500', 
        marginBottom: 14, 
        color: COLORS.connectionActive,
        fontSize: 10,
        letterSpacing: '0.02em',
      }}>
        {fromName} → {toName}
      </div>
      
      {!isSelfLoop && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          fontSize: 9, 
          color: COLORS.textMuted, 
          marginBottom: 8, 
          textTransform: 'uppercase', 
          letterSpacing: '0.1em' 
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Morph</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              Duration
              {isDualMode && (
                <span style={{ 
                  marginLeft: 6, 
                  fontSize: 7, 
                  padding: '1px 4px', 
                  background: 'rgba(139, 92, 246, 0.2)', 
                  color: '#8b5cf6', 
                  borderRadius: 3,
                  textTransform: 'none',
                }}>
                  ⟷
                </span>
              )}
            </span>
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            color: COLORS.connectionActive, 
            fontWeight: '600',
            fontSize: 10,
            textTransform: 'none',
          }}>
            <span>
              {isDualMode 
                ? `${minValue}-${maxValue} phrases`
                : `${minValue} ${minValue === 1 ? 'phrase' : 'phrases'}`
              }
            </span>
            <span style={{ opacity: 0.7 }}>
              {isDualMode 
                ? `${phrasesToTime(minValue)}-${phrasesToTime(maxValue)}`
                : phrasesToTime(minValue)
              }
            </span>
          </div>
        </div>
        
        {isDualMode ? (
          // Dual mode - range slider with two thumbs
          <div
            ref={sliderContainerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: 20,
              cursor: 'pointer',
            }}
            onDoubleClick={onToggleDurationDual}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onTouchMove={handleLongPressMove}
            title="Double-click or long-press for single value mode"
          >
            {/* Track background */}
            <div style={{
              position: 'absolute',
              top: 7,
              left: 0,
              right: 0,
              height: 6,
              borderRadius: 3,
              background: 'rgba(255,255,255,0.1)',
            }} />
            {/* Active range track */}
            <div style={{
              position: 'absolute',
              top: 7,
              left: `${((minValue - 1) / 63) * 100}%`,
              width: `${((maxValue - minValue) / 63) * 100}%`,
              height: 6,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${COLORS.connectionActive}, rgba(139, 92, 246, 0.8))`,
            }} />
            {/* Min thumb */}
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: `${((minValue - 1) / 63) * 100}%`,
                transform: 'translateX(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: COLORS.connectionActive,
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                cursor: 'grab',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (me: MouseEvent) => {
                  const rect = container.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangeDurationMin(Math.min(newVal, maxValue));
                };
                const up = () => { 
                  window.removeEventListener('mousemove', move); 
                  window.removeEventListener('mouseup', up); 
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleLongPressEnd(); // Cancel long press when dragging thumb
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (te: TouchEvent) => {
                  const rect = container.getBoundingClientRect();
                  const touch = te.touches[0];
                  const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangeDurationMin(Math.min(newVal, maxValue));
                };
                const up = () => { 
                  window.removeEventListener('touchmove', move); 
                  window.removeEventListener('touchend', up); 
                };
                window.addEventListener('touchmove', move);
                window.addEventListener('touchend', up);
              }}
            />
            {/* Max thumb */}
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: `${((maxValue - 1) / 63) * 100}%`,
                transform: 'translateX(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#8b5cf6',
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                cursor: 'grab',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (me: MouseEvent) => {
                  const rect = container.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangeDurationMax(Math.max(newVal, minValue));
                };
                const up = () => { 
                  window.removeEventListener('mousemove', move); 
                  window.removeEventListener('mouseup', up); 
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleLongPressEnd(); // Cancel long press when dragging thumb
                const container = sliderContainerRef.current;
                if (!container) return;
                const move = (te: TouchEvent) => {
                  const rect = container.getBoundingClientRect();
                  const touch = te.touches[0];
                  const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                  const newVal = Math.round(1 + pct * 63);
                  onChangeDurationMax(Math.max(newVal, minValue));
                };
                const up = () => { 
                  window.removeEventListener('touchmove', move); 
                  window.removeEventListener('touchend', up); 
                };
                window.addEventListener('touchmove', move);
                window.addEventListener('touchend', up);
              }}
            />
          </div>
        ) : (
          // Single mode - regular slider
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={connection.morphDuration}
            onChange={(e) => onChangeDurationMin(parseInt(e.target.value, 10))}
            onDoubleClick={onToggleDurationDual}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onTouchMove={handleLongPressMove}
            title="Double-click or long-press for range mode"
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              background: `linear-gradient(to right, ${COLORS.connectionActive} 0%, ${COLORS.connectionActive} ${((connection.morphDuration - 1) / 99) * 100}%, rgba(255,255,255,0.1) ${((connection.morphDuration - 1) / 99) * 100}%, rgba(255,255,255,0.1) 100%)`,
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          />
        )}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginTop: 4,
          fontSize: 9, 
          color: COLORS.textMuted,
          opacity: 0.6,
        }}>
          <span>1</span>
          <span>25</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      )}
      
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Probability
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {probabilities.map((prob, i) => {
            const isActive = connection.probability >= prob;
            return (
              <button
                key={prob}
                onClick={() => onChangeProbability(prob)}
                style={{
                  width: 26,
                  height: 26,
                  background: isActive ? COLORS.connectionActive : 'rgba(255,255,255,0.05)',
                  color: isActive ? COLORS.textDark : COLORS.textMuted,
                  border: `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
      
      <button
        onClick={onDelete}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'rgba(196, 114, 78, 0.15)',
          color: '#C4724E',
          border: '1px solid rgba(196, 114, 78, 0.4)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12,
          transition: 'all 0.15s ease',
        }}
      >
        Delete Connection
      </button>
    </div>
  );
};

interface AddPresetPopupProps {
  presets: SavedPreset[];
  x: number;
  y: number;
  isMobile?: boolean;
  onSelectPreset: (preset: SavedPreset) => void;
}

const AddPresetPopup: React.FC<AddPresetPopupProps> = ({
  presets,
  x,
  y,
  isMobile = false,
  onSelectPreset,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x, y });
  
  // Adjust position to keep popup within viewport
  useEffect(() => {
    if (!popupRef.current) return;
    
    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const padding = 10;
    
    let newX = x;
    let newY = y;
    
    // Check right edge
    if (rect.right > window.innerWidth - padding) {
      newX = x - (rect.right - window.innerWidth + padding);
    }
    // Check left edge
    if (rect.left < padding) {
      newX = x + (padding - rect.left);
    }
    // Check top edge (popup appears above by default)
    if (rect.top < padding) {
      newY = y + rect.height + 20; // Move below instead
    }
    
    // Always update adjustedPos when x,y props change
    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);
  
  return (
    <div
      ref={popupRef}
      data-popup="true"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        transform: isMobile ? 'translate(-50%, 0)' : 'translate(-50%, -100%) translateY(-12px)',
        background: COLORS.popup,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        border: `1px solid ${COLORS.popupBorder}`,
        borderRadius: 12,
        padding: '14px 18px',
        minWidth: 200,
        maxHeight: 350,
        overflowY: 'auto',
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 1px ${COLORS.popupGlow}, inset 0 1px 0 ${COLORS.popupGlow}`,
        fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: COLORS.text,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ 
        fontWeight: '500', 
        marginBottom: 12, 
        color: COLORS.filledNode,
        fontSize: 11,
        letterSpacing: '0.02em',
      }}>
        Select a Preset
      </div>
      
      {presets.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                console.log('[AddPresetPopup] Selecting preset:', preset.name);
                onSelectPreset(preset);
              }}
              style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.05)',
                color: COLORS.text,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                textAlign: 'left',
                transition: 'all 0.15s ease',
                position: 'relative',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '8px 0' }}>
          No presets saved yet. Create presets in the Snowflake or Advanced UI first.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Convert hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  // Fallback to a neutral color
  return { r: 120, g: 120, b: 120 };
}

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Lerp between two hex colors using HSL for perceptually smooth transitions
function lerpColor(colorA: string, colorB: string, t: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const clampedT = Math.max(0, Math.min(1, t));
  
  // Convert to HSL for perceptually smooth color transitions
  const hslA = rgbToHsl(a.r, a.g, a.b);
  const hslB = rgbToHsl(b.r, b.g, b.b);
  
  // Handle hue interpolation - take the shortest path around the color wheel
  let hueDiff = hslB.h - hslA.h;
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;
  
  const h = (hslA.h + hueDiff * clampedT + 360) % 360;
  const s = hslA.s + (hslB.s - hslA.s) * clampedT;
  const l = hslA.l + (hslB.l - hslA.l) * clampedT;
  
  // Convert HSL back to RGB
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360;
  s = s / 100;
  l = l / 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Generate halo colors from a base color - muted like the intro splash
function generateHaloFromColor(baseColor: string): { inner: string; mid: string; outer: string } {
  const rgb = hexToRgb(baseColor);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  // Match intro splash screen's muted, desaturated aesthetic:
  // Inner: slightly brighter but still muted (saturation 30-45%, lightness 40-52%)
  const inner = `hsl(${hsl.h}, ${Math.min(45, hsl.s * 0.5 + 15)}%, ${Math.min(48, hsl.l * 0.6 + 20)}%)`;
  
  // Mid: desaturated and dimmer (saturation 35-47%, lightness 30-38%)
  const mid = `hsl(${hsl.h}, ${Math.min(42, hsl.s * 0.45 + 12)}%, ${Math.min(36, hsl.l * 0.45 + 15)}%)`;
  
  // Outer: very muted and dark (saturation 25-35%, lightness 15-21%)
  const outer = `hsl(${hsl.h - 10}, ${Math.min(32, hsl.s * 0.35 + 8)}%, ${Math.min(20, hsl.l * 0.25 + 8)}%)`;
  
  return { inner, mid, outer };
}

// Default neutral halo for when no preset is playing
const DEFAULT_HALO_COLOR = '#5A7B8A'; // Slate color

export const DiamondJourneyUI: React.FC<DiamondJourneyUIProps> = ({
  config,
  state,
  presets,
  onConfigChange,
  onPlay,
  onStop,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSelectPreset: _onSelectPreset, // Not used - preset selection handled internally via handleAddPreset
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [popup, setPopup] = useState<PopupState>({ type: null, x: 0, y: 0 });
  // Secondary popup for connection details when accessed from node popup
  const [secondaryPopup, setSecondaryPopup] = useState<PopupState>({ type: null, x: 0, y: 0 });
  // Track the node popup's bounding rect for positioning secondary popup adjacent to it
  const [nodePopupRect, setNodePopupRect] = useState<DOMRect | null>(null);
  // Journey tracker popup (long hover on center node, or tap on mobile)
  const [trackerPopup, setTrackerPopup] = useState<{show: boolean, x: number, y: number}>({show: false, x: 0, y: 0});
  // Track if device is touch-capable (for mobile-specific behaviors)
  // Detect true mobile (touch + small screen) vs desktop with touch capability
  const isTouchDevice = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);
  const isMobileDevice = useMemo(() => isTouchDevice && window.innerWidth < 1024, [isTouchDevice]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    fromNodeId: null,
    fromPosition: null,
    currentX: 0,
    currentY: 0,
  });
  
  // Compute dynamic halo color based on playing state
  const haloGradient = useMemo(() => {
    // Get current and next node colors
    const currentNode = config?.nodes.find(n => n.id === state.currentNodeId);
    const nextNode = config?.nodes.find(n => n.id === state.nextNodeId);
    
    const currentColor = currentNode?.color || DEFAULT_HALO_COLOR;
    const nextColor = nextNode?.color || currentColor;
    
    // Determine the base color based on phase
    let baseColor: string;
    
    if (state.phase === 'idle' || state.phase === 'ended' || !currentNode) {
      // Use default neutral color when not playing
      baseColor = DEFAULT_HALO_COLOR;
    } else if (state.phase === 'morphing' && nextNode) {
      // Lerp between current and next preset colors during morph
      baseColor = lerpColor(currentColor, nextColor, state.morphProgress);
    } else {
      // Use current preset's color
      baseColor = currentColor;
    }
    
    return generateHaloFromColor(baseColor);
  }, [config?.nodes, state.currentNodeId, state.nextNodeId, state.phase, state.morphProgress]);
  
  // Compute the active node color for center node (same logic as halo)
  const activeNodeColor = useMemo(() => {
    const currentNode = config?.nodes.find(n => n.id === state.currentNodeId);
    const nextNode = config?.nodes.find(n => n.id === state.nextNodeId);
    
    const currentColor = currentNode?.color || COLORS.filledNode;
    const nextColor = nextNode?.color || currentColor;
    
    if (state.phase === 'idle' || state.phase === 'ended' || !currentNode) {
      return undefined; // Use default center node color
    } else if (state.phase === 'morphing' && nextNode) {
      return lerpColor(currentColor, nextColor, state.morphProgress);
    } else if (state.phase === 'playing' || state.phase === 'self-loop') {
      return currentColor;
    }
    return undefined;
  }, [config?.nodes, state.currentNodeId, state.nextNodeId, state.phase, state.morphProgress]);
  
  // Measure container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        setDimensions({ width: size, height: size });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Calculate layout
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const radius = Math.min(dimensions.width, dimensions.height) * DIAMOND_RADIUS_RATIO;
  
  // Get nodes by position
  const getNodeByPosition = useCallback((position: DiamondPosition): JourneyNode | null => {
    return config?.nodes.find(n => n.position === position) ?? null;
  }, [config]);
  
  // Close popup when clicking outside (with delay to prevent immediate closing)
  useEffect(() => {
    if (!popup.type && !secondaryPopup.type) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside popup
      const target = e.target as HTMLElement;
      if (!target.closest('[data-popup]')) {
        setPopup({ type: null, x: 0, y: 0 });
        setSecondaryPopup({ type: null, x: 0, y: 0 });
      }
    };
    
    // Add listener with slight delay to prevent immediate closing
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [popup.type, secondaryPopup.type]);
  
  // Handle drag events
  const handleDragStart = useCallback((nodeId: string, position: DiamondPosition, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragState({
      isDragging: true,
      fromNodeId: nodeId,
      fromPosition: position,
      currentX: clientX,
      currentY: clientY,
    });
  }, []);
  
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragState.isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragState(prev => ({
      ...prev,
      currentX: clientX,
      currentY: clientY,
    }));
  }, [dragState.isDragging]);
  
  const handleDragEnd = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragState.isDragging || !dragState.fromNodeId || !config || !svgRef.current) {
      setDragState({
        isDragging: false,
        fromNodeId: null,
        fromPosition: null,
        currentX: 0,
        currentY: 0,
      });
      return;
    }
    
    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
    
    // Find which node we dropped on
    const svgRect = svgRef.current.getBoundingClientRect();
    const dropX = clientX - svgRect.left;
    const dropY = clientY - svgRect.top;
    
    // Check each node position
    const positions: DiamondPosition[] = ['left', 'top', 'right', 'bottom', 'center'];
    let targetPosition: DiamondPosition | null = null;
    
    console.log('Drag end at:', dropX, dropY);
    
    for (const pos of positions) {
      const coords = getDiamondCoordinates(pos, centerX, centerY, radius);
      const dist = Math.sqrt((dropX - coords.x) ** 2 + (dropY - coords.y) ** 2);
      const hitRadius = pos === 'center' ? CENTER_NODE_SIZE : NODE_BASE_SIZE * 1.5; // Increased hit radius
      console.log(`  ${pos}: dist=${dist.toFixed(1)}, hitRadius=${hitRadius}`);
      if (dist < hitRadius) {
        targetPosition = pos;
        break;
      }
    }
    
    console.log('Target position:', targetPosition, 'from:', dragState.fromPosition);
    
    // Check if this is a self-loop (dropping on the same node)
    if (targetPosition && targetPosition === dragState.fromPosition && targetPosition !== 'center') {
      const fromNode = config.nodes.find(n => n.id === dragState.fromNodeId);
      if (fromNode && fromNode.presetId && fromNode.presetId !== '__CENTER__') {
        console.log('Creating self-loop connection for', fromNode.presetName);
        const newConnection: JourneyConnection = {
          id: generateJourneyId(),
          fromNodeId: dragState.fromNodeId,
          toNodeId: dragState.fromNodeId, // Same node - self-loop
          morphDuration: JOURNEY_DEFAULTS.morphDuration,
          probability: JOURNEY_DEFAULTS.probability,
        };
        
        // Check if self-loop already exists
        const exists = config.connections.some(
          c => c.fromNodeId === dragState.fromNodeId && c.toNodeId === dragState.fromNodeId
        );
        
        if (!exists) {
          onConfigChange({
            ...config,
            connections: [...config.connections, newConnection],
          });
        }
      }
    } else if (targetPosition && targetPosition !== dragState.fromPosition) {
      const targetNode = getNodeByPosition(targetPosition);
      const fromNode = config.nodes.find(n => n.id === dragState.fromNodeId);
      console.log('Target node:', targetNode?.presetName, 'presetId:', targetNode?.presetId);
      console.log('From node:', fromNode?.presetName, 'presetId:', fromNode?.presetId);
      
      // Handle connections involving the center (START/END)
      if (targetPosition === 'center' && targetNode) {
        // Connection TO center = end connection
        if (fromNode && fromNode.presetId && fromNode.presetId !== '__CENTER__') {
          console.log('Creating connection to END from', dragState.fromNodeId);
          const newConnection: JourneyConnection = {
            id: generateJourneyId(),
            fromNodeId: dragState.fromNodeId,
            toNodeId: targetNode.id,
            morphDuration: JOURNEY_DEFAULTS.morphDuration,
            probability: JOURNEY_DEFAULTS.probability,
          };
          
          const exists = config.connections.some(
            c => c.fromNodeId === dragState.fromNodeId && c.toNodeId === targetNode.id
          );
          
          if (!exists) {
            onConfigChange({
              ...config,
              connections: [...config.connections, newConnection],
            });
          }
        }
      } else if (dragState.fromPosition === 'center' && fromNode) {
        // Connection FROM center = start connection
        // Only allow ONE start connection from center - replace existing if present
        if (targetNode && targetNode.presetId && targetNode.presetId !== '__CENTER__') {
          // Remove any existing start connection from center
          const filteredConnections = config.connections.filter(
            c => c.fromNodeId !== fromNode.id
          );
          
          console.log('Creating connection from START to', targetNode.id);
          const newConnection: JourneyConnection = {
            id: generateJourneyId(),
            fromNodeId: fromNode.id,
            toNodeId: targetNode.id,
            morphDuration: JOURNEY_DEFAULTS.morphDuration,
            probability: JOURNEY_DEFAULTS.probability,
          };
          
          onConfigChange({
            ...config,
            connections: [...filteredConnections, newConnection],
          });
        }
      } else if (targetNode && targetNode.presetId && targetNode.presetId !== '__CENTER__') {
        // Regular preset to preset connection
        console.log('Creating connection from', dragState.fromNodeId, 'to', targetNode.id);
        const newConnection: JourneyConnection = {
          id: generateJourneyId(),
          fromNodeId: dragState.fromNodeId,
          toNodeId: targetNode.id,
          morphDuration: JOURNEY_DEFAULTS.morphDuration,
          probability: JOURNEY_DEFAULTS.probability,
        };
        
        // Check if connection already exists
        const exists = config.connections.some(
          c => c.fromNodeId === dragState.fromNodeId && c.toNodeId === targetNode.id
        );
        
        if (!exists) {
          onConfigChange({
            ...config,
            connections: [...config.connections, newConnection],
          });
        }
      }
    }
    
    setDragState({
      isDragging: false,
      fromNodeId: null,
      fromPosition: null,
      currentX: 0,
      currentY: 0,
    });
  }, [dragState, config, onConfigChange, centerX, centerY, radius, getNodeByPosition]);
  
  // Add global drag listeners
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);
  
  // Handle node click
  const handleNodeClick = useCallback((node: JourneyNode, screenX: number, screenY: number) => {
    if (dragState.isDragging) return;
    
    console.log('Node clicked:', node.position, 'isEmpty:', !node.presetId, 'at', screenX, screenY);
    
    // If a node popup is already open, clicking another node creates a connection (if valid)
    // In ALL cases when popup is open and different node clicked, close popup and don't open new one
    if (popup.type === 'node' && popup.nodeId && popup.nodeId !== node.id && config) {
      const fromNode = config.nodes.find(n => n.id === popup.nodeId);
      
      // Only create connection if target has a preset (not empty or center)
      if (fromNode && node.presetId && node.presetId !== '__CENTER__') {
        console.log('Creating connection from popup node to clicked node:', fromNode.presetName, '->', node.presetName);
        
        // Check if connection already exists
        const exists = config.connections.some(
          c => c.fromNodeId === fromNode.id && c.toNodeId === node.id
        );
        
        if (!exists) {
          const newConnection: JourneyConnection = {
            id: generateJourneyId(),
            fromNodeId: fromNode.id,
            toNodeId: node.id,
            morphDuration: JOURNEY_DEFAULTS.morphDuration,
            probability: JOURNEY_DEFAULTS.probability,
          };
          
          onConfigChange({
            ...config,
            connections: [...config.connections, newConnection],
          });
        }
      }
      
      // Always close the popup when clicking another node during connection mode
      // Don't open the target node's popup
      setPopup({ type: null, x: 0, y: 0 });
      return;
    }
    
    // For mobile (touch + small screen), position popup at the very top of the screen
    // For desktop (even with touch), position near the clicked node
    let popupX = screenX;
    let popupY = screenY;
    const isMobile = isTouchDevice && window.innerWidth < 1024;
    if (isMobile) {
      // Position popup centered at top of viewport
      popupX = window.innerWidth / 2;
      popupY = 12; // Same as status bar position
    }
    
    if (!node.presetId) {
      // Empty slot - show add preset popup
      setPopup({
        type: 'addPreset',
        position: node.position,
        x: popupX,
        y: popupY,
      });
    } else {
      // Filled node - show edit popup
      setPopup({
        type: 'node',
        nodeId: node.id,
        x: popupX,
        y: popupY,
      });
    }
  }, [dragState.isDragging, popup.type, popup.nodeId, config, onConfigChange, isTouchDevice]);
  
  // Handle connection click
  const handleConnectionClick = useCallback((connection: JourneyConnection, screenX: number, screenY: number) => {
    setPopup({
      type: 'connection',
      connectionId: connection.id,
      x: screenX,
      y: screenY,
    });
  }, []);
  
  // Handle center play/stop
  const handleCenterClick = useCallback(() => {
    // If a node popup is open, clicking center creates connection to END
    if (popup.type === 'node' && popup.nodeId && config) {
      const fromNode = config.nodes.find(n => n.id === popup.nodeId);
      const centerNode = config.nodes.find(n => n.position === 'center');
      
      if (fromNode && centerNode && fromNode.presetId && fromNode.presetId !== '__CENTER__') {
        console.log('Creating connection from popup node to END:', fromNode.presetName);
        
        // Check if connection already exists
        const exists = config.connections.some(
          c => c.fromNodeId === fromNode.id && c.toNodeId === centerNode.id
        );
        
        if (!exists) {
          const newConnection: JourneyConnection = {
            id: generateJourneyId(),
            fromNodeId: fromNode.id,
            toNodeId: centerNode.id,
            morphDuration: JOURNEY_DEFAULTS.morphDuration,
            probability: JOURNEY_DEFAULTS.probability,
          };
          
          onConfigChange({
            ...config,
            connections: [...config.connections, newConnection],
          });
        }
        
        // Close the popup after creating connection
        setPopup({ type: null, x: 0, y: 0 });
        return;
      }
    }
    
    if (state.phase === 'idle' || state.phase === 'ended') {
      onPlay();
    } else {
      onStop();
    }
  }, [state.phase, onPlay, onStop, popup.type, popup.nodeId, config, onConfigChange]);
  
  // Handle long hover on center node for tracker popup (desktop)
  const handleTrackerLongHover = useCallback((show: boolean, screenX: number, screenY: number) => {
    setTrackerPopup({ show, x: screenX, y: screenY });
  }, []);
  
  // Debounce ref to prevent double-firing on touch (touchend + click both fire)
  const lastBackgroundTapTime = useRef(0);
  
  // Handle background tap to toggle tracker popup (mobile)
  const handleBackgroundTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // Only on touch devices
    if (!isTouchDevice) return;
    
    // Debounce - ignore if triggered within 300ms of last tap
    const now = Date.now();
    if (now - lastBackgroundTapTime.current < 300) return;
    lastBackgroundTapTime.current = now;
    
    // Only when journey is playing
    if (state.phase !== 'playing' && state.phase !== 'morphing' && state.phase !== 'self-loop' && state.phase !== 'ending') return;
    
    // Check if tap was on an interactive element
    const target = e.target as HTMLElement;
    const tagName = target.tagName?.toLowerCase();
    if (target.closest('[data-popup]') || 
        target.closest('button') || 
        tagName === 'circle' || 
        tagName === 'path' ||
        tagName === 'g' ||
        tagName === 'svg' ||
        target.closest('g[style*="cursor: pointer"]') ||
        target.closest('svg')) {
      return;
    }
    
    // Toggle the tracker popup at top-center of screen
    // y=160 positions popup nicely near top (popup appears above this point due to transform)
    setTrackerPopup(prev => ({
      show: !prev.show,
      x: window.innerWidth / 2,
      y: 160,
    }));
  }, [isTouchDevice, state.phase]);

  // Handle popup actions - phrase length with dual mode support
  const handleChangePhraseMin = useCallback((nodeId: string, phrases: number) => {
    if (!config) return;
    onConfigChange({
      ...config,
      nodes: config.nodes.map(n => {
        if (n.id !== nodeId) return n;
        // Ensure min doesn't exceed max if in dual mode
        const newMin = n.phraseLengthMax !== undefined 
          ? Math.min(phrases, n.phraseLengthMax) 
          : phrases;
        return { ...n, phraseLength: newMin };
      }),
    });
  }, [config, onConfigChange]);
  
  const handleChangePhraseMax = useCallback((nodeId: string, phrases: number) => {
    if (!config) return;
    onConfigChange({
      ...config,
      nodes: config.nodes.map(n => {
        if (n.id !== nodeId) return n;
        // Ensure max doesn't go below min
        const newMax = Math.max(phrases, n.phraseLength);
        return { ...n, phraseLengthMax: newMax };
      }),
    });
  }, [config, onConfigChange]);
  
  const handleTogglePhraseDual = useCallback((nodeId: string) => {
    if (!config) return;
    onConfigChange({
      ...config,
      nodes: config.nodes.map(n => {
        if (n.id !== nodeId) return n;
        if (n.phraseLengthMax !== undefined) {
          // Dual -> Single: use midpoint value
          const midpoint = Math.round((n.phraseLength + n.phraseLengthMax) / 2);
          return { ...n, phraseLength: midpoint, phraseLengthMax: undefined };
        } else {
          // Single -> Dual: set max = min (will expand from here)
          return { ...n, phraseLengthMax: n.phraseLength };
        }
      }),
    });
  }, [config, onConfigChange]);
  
  const handleRemoveNode = useCallback((nodeId: string) => {
    if (!config) return;
    const node = config.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Clear the node but keep position
    onConfigChange({
      ...config,
      nodes: config.nodes.map(n => 
        n.id === nodeId ? { ...n, presetId: '', presetName: '', color: '#444' } : n
      ),
      connections: config.connections.filter(
        c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      ),
    });
    setPopup({ type: null, x: 0, y: 0 });
    setSecondaryPopup({ type: null, x: 0, y: 0 });
  }, [config, onConfigChange]);
  
  const handleChangeDurationMin = useCallback((connId: string, duration: number) => {
    if (!config) return;
    onConfigChange({
      ...config,
      connections: config.connections.map(c => {
        if (c.id !== connId) return c;
        // Ensure min doesn't exceed max if in dual mode
        const newMin = c.morphDurationMax !== undefined 
          ? Math.min(duration, c.morphDurationMax) 
          : duration;
        return { ...c, morphDuration: newMin };
      }),
    });
  }, [config, onConfigChange]);
  
  const handleChangeDurationMax = useCallback((connId: string, duration: number) => {
    if (!config) return;
    onConfigChange({
      ...config,
      connections: config.connections.map(c => {
        if (c.id !== connId) return c;
        // Ensure max doesn't go below min
        const newMax = Math.max(duration, c.morphDuration);
        return { ...c, morphDurationMax: newMax };
      }),
    });
  }, [config, onConfigChange]);
  
  const handleToggleDurationDual = useCallback((connId: string) => {
    if (!config) return;
    onConfigChange({
      ...config,
      connections: config.connections.map(c => {
        if (c.id !== connId) return c;
        if (c.morphDurationMax !== undefined) {
          // Dual -> Single: use midpoint value
          const midpoint = Math.round((c.morphDuration + c.morphDurationMax) / 2);
          return { ...c, morphDuration: midpoint, morphDurationMax: undefined };
        } else {
          // Single -> Dual: set max = min (will expand from here)
          return { ...c, morphDurationMax: c.morphDuration };
        }
      }),
    });
  }, [config, onConfigChange]);
  
  const handleChangeProbability = useCallback((connId: string, probability: number) => {
    if (!config) return;
    onConfigChange({
      ...config,
      connections: config.connections.map(c => 
        c.id === connId ? { ...c, probability } : c
      ),
    });
  }, [config, onConfigChange]);
  
  const handleDeleteConnection = useCallback((connId: string) => {
    if (!config) return;
    onConfigChange({
      ...config,
      connections: config.connections.filter(c => c.id !== connId),
    });
    setPopup({ type: null, x: 0, y: 0 });
    setSecondaryPopup({ type: null, x: 0, y: 0 });
  }, [config, onConfigChange]);
  
  const handleAddPreset = useCallback((preset: SavedPreset, position: DiamondPosition) => {
    console.log('[DiamondJourneyUI] handleAddPreset called:', preset.name, 'at position:', position);
    if (!config) {
      console.log('[DiamondJourneyUI] No config, returning');
      return;
    }
    
    // Map position to color index for consistent coloring
    const positionToColorIndex: Record<DiamondPosition, number> = {
      'left': 0,   // P1 - Cyan
      'top': 1,    // P2 - Orange  
      'right': 2,  // P3 - Green
      'bottom': 3, // P4 - Gold
      'center': 4, // Center - Purple
    };
    
    // Find existing empty node at this position or create new one
    const existingNode = config.nodes.find(n => n.position === position);
    console.log('[DiamondJourneyUI] Existing node:', existingNode);
    
    if (existingNode) {
      const colorIndex = positionToColorIndex[position] ?? 0;
      const newConfig = {
        ...config,
        nodes: config.nodes.map(n => 
          n.id === existingNode.id 
            ? { 
                ...n, 
                presetId: preset.name, 
                presetName: preset.name,
                color: JOURNEY_NODE_COLORS[colorIndex % JOURNEY_NODE_COLORS.length]
              } 
            : n
        ),
      };
      console.log('[DiamondJourneyUI] New config:', newConfig);
      onConfigChange(newConfig);
    }
    setPopup({ type: null, x: 0, y: 0 });
    setSecondaryPopup({ type: null, x: 0, y: 0 });
  }, [config, onConfigChange]);
  
  // Get drag line coordinates
  const getDragLineCoords = useCallback(() => {
    if (!dragState.isDragging || !dragState.fromPosition || !svgRef.current) {
      return null;
    }
    
    const from = getDiamondCoordinates(dragState.fromPosition, centerX, centerY, radius);
    const svgRect = svgRef.current.getBoundingClientRect();
    const toX = dragState.currentX - svgRect.left;
    const toY = dragState.currentY - svgRect.top;
    
    return { fromX: from.x, fromY: from.y, toX, toY };
  }, [dragState, centerX, centerY, radius]);
  
  const dragLineCoords = getDragLineCoords();
  
  // Find popup target data
  const popupNode = popup.nodeId ? config?.nodes.find(n => n.id === popup.nodeId) : null;
  const popupConnection = popup.connectionId ? config?.connections.find(c => c.id === popup.connectionId) : null;
  const secondaryPopupConnection = secondaryPopup.connectionId ? config?.connections.find(c => c.id === secondaryPopup.connectionId) : null;
  
  // Compute filled positions for ghost connection lines
  const filledPositions = useMemo(() => {
    if (!config) return [] as DiamondPosition[];
    return (['left', 'top', 'right', 'bottom'] as DiamondPosition[]).filter(pos => {
      const node = config.nodes.find(n => n.position === pos);
      return node && node.presetId && node.presetId !== '__CENTER__';
    });
  }, [config]);
  
  // Determine if ghost lines should be shown and from which position
  const ghostLinesSource = useMemo((): DiamondPosition | null => {
    // Show ghost lines when dragging (center can always drag to replace start connection)
    if (dragState.isDragging && dragState.fromPosition) {
      return dragState.fromPosition;
    }
    // Show ghost lines when node popup is open
    if (popup.type === 'node' && popupNode?.position) {
      return popupNode.position;
    }
    return null;
  }, [dragState.isDragging, dragState.fromPosition, popup.type, popupNode?.position]);
  
  // Get current and next node for mobile status bar
  const currentPlayingNode = config?.nodes.find(n => n.id === state.currentNodeId);
  const nextPlayingNode = config?.nodes.find(n => n.id === state.nextNodeId);
  const isPlaying = state.phase === 'playing' || state.phase === 'morphing' || state.phase === 'self-loop' || state.phase === 'ending';
  
  return (
    <div 
      ref={containerRef}
      onClick={handleBackgroundTap}
      onTouchEnd={handleBackgroundTap}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Expandable status bar at top of screen (both mobile and desktop) */}
      {isPlaying && (() => {
        // Calculate time remaining
        const phraseDuration = state.resolvedPhraseDuration || currentPlayingNode?.phraseLength || 1;
        const morphDuration = state.resolvedMorphDuration || 2;
        const phraseTimeTotal = phraseDuration * PHRASE_LENGTH;
        const phraseTimeRemaining = phraseTimeTotal * (1 - state.phraseProgress);
        const morphTimeTotal = morphDuration * PHRASE_LENGTH;
        const morphTimeRemaining = morphTimeTotal * (1 - state.morphProgress);
        
        const formatTime = (seconds: number) => {
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          if (mins > 0) {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
          }
          return `${secs}s`;
        };
        
        const isExpanded = trackerPopup.show;
        
        // Get planned next node for expanded view
        const plannedNode = config?.nodes.find(n => n.id === state.plannedNextNodeId);
        const isNextEnd = plannedNode?.position === 'center' || plannedNode?.presetId === '__CENTER__';
        const isNextSelf = plannedNode?.id === state.currentNodeId;
        
        const getPhaseDisplay = () => {
          switch (state.phase) {
            case 'playing': return 'Playing';
            case 'morphing': return 'Morphing';
            case 'self-loop': return 'Looping';
            case 'ending': return 'Ending';
            default: return state.phase;
          }
        };
        
        return (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setTrackerPopup(prev => ({ ...prev, show: !prev.show }));
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: COLORS.popup,
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: `1px solid ${COLORS.popupBorder}`,
              borderRadius: isExpanded ? 12 : 20,
              padding: isExpanded ? '12px 16px' : '6px 14px',
              display: 'flex',
              flexDirection: isExpanded ? 'column' : 'row',
              alignItems: isExpanded ? 'stretch' : 'center',
              gap: isExpanded ? 10 : 10,
              boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
              fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              color: COLORS.text,
              pointerEvents: 'auto',
              cursor: 'pointer',
              minWidth: isExpanded ? 180 : undefined,
              transition: 'all 0.2s ease',
            }}
          >
              {isExpanded ? (
                // === EXPANDED VIEW ===
                <>
                  {/* Phase indicator header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: state.phase === 'morphing' 
                        ? COLORS.morphingConnection 
                        : state.phase === 'ending' 
                          ? COLORS.endConnection 
                          : (currentPlayingNode?.color || COLORS.filledNode),
                      boxShadow: `0 0 8px ${state.phase === 'morphing' 
                        ? COLORS.morphingConnection 
                        : state.phase === 'ending' 
                          ? COLORS.endConnection 
                          : (currentPlayingNode?.color || COLORS.filledNode)}`,
                    }} />
                    <span style={{ 
                      fontSize: 11, 
                      fontWeight: 600, 
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: state.phase === 'morphing' 
                        ? COLORS.morphingConnection 
                        : state.phase === 'ending' 
                          ? COLORS.endConnection 
                          : (currentPlayingNode?.color || COLORS.filledNode),
                    }}>
                      {getPhaseDisplay()}
                    </span>
                  </div>
                  
                  {/* Current preset */}
                  {currentPlayingNode?.presetName && (
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Current
                      </div>
                      <div style={{ 
                        fontSize: 12, 
                        fontWeight: 500,
                        color: currentPlayingNode.color || COLORS.filledNode,
                      }}>
                        {currentPlayingNode.presetName}
                      </div>
                    </div>
                  )}
                  
                  {/* Phrase progress (playing/self-loop) */}
                  {(state.phase === 'playing' || state.phase === 'self-loop') && (
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Phrase ({Math.round(state.phraseProgress * 100)}%)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          flex: 1,
                          height: 4, 
                          background: 'rgba(255,255,255,0.1)', 
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{ 
                            width: `${state.phraseProgress * 100}%`, 
                            height: '100%', 
                            background: currentPlayingNode?.color || COLORS.filledNode,
                            borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: COLORS.text, minWidth: 35, textAlign: 'right' }}>
                          {formatTime(phraseTimeRemaining)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Morph progress */}
                  {state.phase === 'morphing' && nextPlayingNode && (
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Morphing to
                      </div>
                      <div style={{ 
                        fontSize: 11, 
                        color: nextPlayingNode.color || COLORS.filledNode,
                        marginBottom: 4,
                      }}>
                        {nextPlayingNode.presetName}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          flex: 1, 
                          height: 4, 
                          background: 'rgba(255,255,255,0.1)', 
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{ 
                            width: `${state.morphProgress * 100}%`, 
                            height: '100%', 
                            background: COLORS.morphingConnection,
                            borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: COLORS.text, minWidth: 35, textAlign: 'right' }}>
                          {formatTime(morphTimeRemaining)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Ending progress */}
                  {state.phase === 'ending' && (
                    <div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Fading out
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          flex: 1, 
                          height: 4, 
                          background: 'rgba(255,255,255,0.1)', 
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{ 
                            width: `${state.morphProgress * 100}%`, 
                            height: '100%', 
                            background: COLORS.endConnection,
                            borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: COLORS.text, minWidth: 35, textAlign: 'right' }}>
                          {formatTime(morphTimeRemaining)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Next stop */}
                  {(state.phase === 'playing' || state.phase === 'self-loop') && plannedNode && (
                    <div style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${COLORS.popupBorder}` }}>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Next
                      </div>
                      <div style={{ 
                        fontSize: 11, 
                        color: isNextEnd ? COLORS.endConnection : (isNextSelf ? currentPlayingNode?.color : plannedNode.color) || COLORS.filledNode,
                      }}>
                        {isNextEnd ? '⬡ End' : (isNextSelf ? '↺ Self-loop' : plannedNode.presetName)}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // === COMPACT VIEW ===
                <>
                  {/* Phase dot */}
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: state.phase === 'morphing' 
                      ? COLORS.morphingConnection 
                      : state.phase === 'ending' 
                        ? COLORS.endConnection 
                        : (currentPlayingNode?.color || COLORS.filledNode),
                    boxShadow: `0 0 6px ${state.phase === 'morphing' 
                      ? COLORS.morphingConnection 
                      : state.phase === 'ending' 
                        ? COLORS.endConnection 
                        : (currentPlayingNode?.color || COLORS.filledNode)}`,
                  }} />
                  
                  {/* Current/Morphing info with progress */}
                  {state.phase === 'morphing' && nextPlayingNode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ 
                        fontSize: 10, 
                        color: currentPlayingNode?.color || COLORS.textMuted,
                        maxWidth: 60,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {currentPlayingNode?.presetName || '?'}
                      </span>
                      <span style={{ fontSize: 9, color: COLORS.textMuted }}>→</span>
                      <span style={{ 
                        fontSize: 10, 
                        color: nextPlayingNode.color || COLORS.filledNode,
                        maxWidth: 60,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {nextPlayingNode.presetName || 'END'}
                      </span>
                      <div style={{ 
                        width: 40, 
                        height: 3, 
                        background: 'rgba(255,255,255,0.15)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${state.morphProgress * 100}%`, 
                          height: '100%', 
                          background: COLORS.morphingConnection,
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  ) : state.phase === 'ending' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: COLORS.endConnection }}>Ending</span>
                      <div style={{ 
                        width: 40, 
                        height: 3, 
                        background: 'rgba(255,255,255,0.15)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${state.morphProgress * 100}%`, 
                          height: '100%', 
                          background: COLORS.endConnection,
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ 
                        fontSize: 10, 
                        color: currentPlayingNode?.color || COLORS.filledNode,
                        maxWidth: 80,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                      }}>
                        {currentPlayingNode?.presetName || '?'}
                      </span>
                      <div style={{ 
                        width: 40, 
                        height: 3, 
                        background: 'rgba(255,255,255,0.15)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${state.phraseProgress * 100}%`, 
                          height: '100%', 
                          background: currentPlayingNode?.color || COLORS.filledNode,
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  )}
                </>
              )}
          </div>
        );
      })()}
      
      {/* Ambient halo gradient background */}
      <div
        style={{
          position: 'absolute',
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: '50%',
          background: `radial-gradient(circle at center, 
            ${haloGradient.inner} 0%, 
            ${haloGradient.mid} 25%, 
            ${haloGradient.outer} 45%,
            rgba(24, 32, 64, 0.4) 60%,
            rgba(16, 24, 40, 0.2) 75%,
            rgba(10, 10, 24, 0.1) 85%,
            transparent 100%)`,
          filter: 'blur(25px)',
          opacity: state.phase === 'playing' || state.phase === 'morphing' || state.phase === 'self-loop' ? 0.8 : 0.4,
          transition: (state.phase === 'morphing' || state.phase === 'ending') ? 'opacity 1.5s ease-in-out' : 'opacity 1.5s ease-in-out, background 2s ease-in-out',
          pointerEvents: 'none',
        }}
      />
      
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ 
          overflow: 'visible', 
          position: 'relative', 
          zIndex: 1,
          touchAction: 'none',
          overscrollBehavior: 'contain'
        }}
      >
        {/* Definitions */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={GLOW_BLUR / 3} result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          {/* Soft glow for subtle elements */}
          <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          {/* Gradient for diamond frame */}
          <linearGradient id="diamondGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.diamondFrameGlow} />
            <stop offset="50%" stopColor={COLORS.diamondFrame} />
            <stop offset="100%" stopColor={COLORS.diamondFrameGlow} />
          </linearGradient>
          
          {/* Radial gradient for center halo in SVG */}
          <radialGradient id="centerHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={haloGradient.inner} stopOpacity="0.3" />
            <stop offset="50%" stopColor={haloGradient.mid} stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          
          {/* Animations */}
          <style>
            {`
              @keyframes pulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
              }
              @keyframes breathe {
                0%, 100% { transform: scale(1); opacity: 0.3; }
                50% { transform: scale(1.02); opacity: 0.5; }
              }
              @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </defs>
        
        {/* Outer decorative ring */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius * 1.35}
          fill="none"
          stroke={COLORS.diamondFrame}
          strokeWidth={0.5}
          strokeDasharray="2,8"
          style={{ opacity: 0.3 }}
        />
        
        {/* Diamond outline with glow */}
        <path
          d={`M ${centerX} ${centerY - radius} L ${centerX + radius} ${centerY} L ${centerX} ${centerY + radius} L ${centerX - radius} ${centerY} Z`}
          fill="none"
          stroke="url(#diamondGradient)"
          strokeWidth={1}
          filter="url(#softGlow)"
          style={{ opacity: 0.5 }}
        />
        
        {/* Inner diamond */}
        <path
          d={`M ${centerX} ${centerY - radius * 0.3} L ${centerX + radius * 0.3} ${centerY} L ${centerX} ${centerY + radius * 0.3} L ${centerX - radius * 0.3} ${centerY} Z`}
          fill="none"
          stroke={COLORS.diamondFrame}
          strokeWidth={0.5}
          style={{ opacity: 0.25 }}
        />
        
        {/* Corner accent dots */}
        {[
          { x: centerX, y: centerY - radius },
          { x: centerX + radius, y: centerY },
          { x: centerX, y: centerY + radius },
          { x: centerX - radius, y: centerY },
        ].map((pos, i) => (
          <circle
            key={i}
            cx={pos.x}
            cy={pos.y}
            r={2}
            fill={COLORS.diamondFrameGlow}
            style={{ opacity: 0.4 }}
          />
        ))}
        
        {/* Center halo - subtle glow behind center node */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius * 0.5}
          fill="url(#centerHalo)"
          style={{ 
            opacity: state.phase === 'playing' || state.phase === 'morphing' || state.phase === 'self-loop' ? 0.8 : 0.4,
            transition: 'opacity 1s ease-in-out',
          }}
        />
        
        {/* Connection arcs */}
        {config?.connections.map((conn, index) => {
          const fromNode = config.nodes.find(n => n.id === conn.fromNodeId);
          const toNode = config.nodes.find(n => n.id === conn.toNodeId);
          if (!fromNode || !toNode) return null;
          
          console.log(`Rendering connection ${index}: ${fromNode.position} → ${toNode.position}`);
          
          const isMorphing = state.phase === 'morphing' && 
            state.currentNodeId === conn.fromNodeId && 
            state.nextNodeId === conn.toNodeId;
          
          const isEnding = state.phase === 'ending' && 
            state.currentNodeId === conn.fromNodeId && 
            state.nextNodeId === conn.toNodeId;
          
          // Self-loop: animate when in 'self-loop' phase for this node
          const isSelfLooping = state.phase === 'self-loop' && 
            state.currentNodeId === conn.fromNodeId && 
            conn.fromNodeId === conn.toNodeId;
          
          // Self-loop connection (same from and to node)
          if (fromNode.id === toNode.id) {
            return (
              <SelfLoopArc
                key={conn.id}
                connection={conn}
                node={fromNode}
                centerX={centerX}
                centerY={centerY}
                radius={radius}
                isMorphing={isSelfLooping}
                isEnding={false}
                morphProgress={isSelfLooping ? state.morphProgress : 0}
                onClick={() => {
                  // Position popup at the loop's peak
                  const coords = getDiamondCoordinates(fromNode.position, centerX, centerY, radius);
                  const dx = coords.x - centerX;
                  const dy = coords.y - centerY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const normalX = dist > 0 ? dx / dist : 0;
                  const normalY = dist > 0 ? dy / dist : -1;
                  const loopSize = NODE_BASE_SIZE * 1.8;
                  const peakX = coords.x + normalX * loopSize * 0.75;
                  const peakY = coords.y + normalY * loopSize * 0.75;
                  const svgRect = svgRef.current?.getBoundingClientRect();
                  const screenX = svgRect ? svgRect.left + peakX : peakX;
                  const screenY = svgRect ? svgRect.top + peakY : peakY;
                  handleConnectionClick(conn, screenX, screenY);
                }}
              />
            );
          }
          
          return (
            <ConnectionArc
              key={conn.id}
              connection={conn}
              fromNode={fromNode}
              toNode={toNode}
              centerX={centerX}
              centerY={centerY}
              radius={radius}
              isMorphing={isMorphing}
              isEnding={isEnding}
              morphProgress={(isMorphing || isEnding) ? state.morphProgress : 0}
              onClick={() => {
                // Calculate midpoint between from and to nodes for popup positioning
                const fromCoords = getDiamondCoordinates(fromNode.position, centerX, centerY, radius);
                const toCoords = getDiamondCoordinates(toNode.position, centerX, centerY, radius);
                const midX = (fromCoords.x + toCoords.x) / 2;
                const midY = (fromCoords.y + toCoords.y) / 2;
                // Get SVG bounding rect to convert to screen coordinates
                const svgRect = svgRef.current?.getBoundingClientRect();
                const screenX = svgRect ? svgRect.left + midX : midX;
                const screenY = svgRect ? svgRect.top + midY : midY;
                handleConnectionClick(conn, screenX, screenY);
              }}
              onDurationChange={(connId, duration) => {
                // Update both min and max to the same value when dragging (simple mode)
                handleChangeDurationMin(connId, duration);
                // If in dual mode, also update max to match
                if (conn.morphDurationMax !== undefined) {
                  handleChangeDurationMax(connId, duration);
                }
              }}
            />
          );
        })}
        
        {/* Drag line */}
        {dragLineCoords && (
          <DragLine {...dragLineCoords} />
        )}
        
        {/* Ghost connection lines showing possible connections */}
        {ghostLinesSource && config && (() => {
          // Find the source node ID for the ghost lines
          const sourceNode = config.nodes.find(n => n.position === ghostLinesSource);
          if (!sourceNode) return null;
          
          return (
            <GhostConnectionLines
              fromPosition={ghostLinesSource}
              fromNodeId={sourceNode.id}
              centerX={centerX}
              centerY={centerY}
              radius={radius}
              filledPositions={filledPositions}
              existingConnections={config.connections}
              nodes={config.nodes}
            />
          );
        })()}
        
        {/* Preset nodes at cardinal positions */}
        {(['left', 'top', 'right', 'bottom'] as DiamondPosition[]).map((position) => {
          const node = getNodeByPosition(position);
          if (!node) return null;
          
          const coords = getDiamondCoordinates(position, centerX, centerY, radius);
          const isEmpty = !node.presetId;
          // Node is "playing" during playing phase OR during self-loop (same preset continues)
          const isPlaying = state.currentNodeId === node.id && 
            (state.phase === 'playing' || state.phase === 'self-loop');
          const isMorphingTo = state.nextNodeId === node.id && state.phase === 'morphing';
          const isValidDropTarget = dragState.isDragging && 
            dragState.fromPosition !== position && 
            !isEmpty;
          const isDragSource = dragState.fromNodeId === node.id;
          
          return (
            <DiamondNode
              key={node.id}
              node={node}
              x={coords.x}
              y={coords.y}
              size={NODE_BASE_SIZE}
              isPlaying={isPlaying}
              isMorphingTo={isMorphingTo}
              phraseProgress={isPlaying ? state.phraseProgress : 0}
              isEmpty={isEmpty}
              isValidDropTarget={isValidDropTarget}
              isDragSource={isDragSource}
              onClick={() => {
                const rect = svgRef.current?.getBoundingClientRect();
                const screenX = (rect?.left || 0) + coords.x;
                const screenY = (rect?.top || 0) + coords.y;
                handleNodeClick(node, screenX, screenY);
              }}
              onDragStart={(e) => handleDragStart(node.id, position, e)}
              onPhraseChange={(nodeId, phrases, isMax) => {
                if (isMax) {
                  handleChangePhraseMax(nodeId, phrases);
                } else {
                  handleChangePhraseMin(nodeId, phrases);
                }
              }}
            />
          );
        })}
        
        {/* Center node (START/END) */}
        {config && (
          <CenterNode
            x={centerX}
            y={centerY}
            size={CENTER_NODE_SIZE}
            isPlaying={state.phase === 'playing' || state.phase === 'morphing' || state.phase === 'self-loop'}
            isEnding={state.phase === 'ending' || state.phase === 'ended'}
            isMorphing={state.phase === 'morphing' || state.phase === 'ending'}
            isValidDropTarget={dragState.isDragging && dragState.fromPosition !== 'center'}
            isDragSource={dragState.isDragging && dragState.fromPosition === 'center'}
            nodeColor={activeNodeColor}
            isMobile={isMobileDevice}
            onClick={handleCenterClick}
            onLongHover={isTouchDevice ? undefined : handleTrackerLongHover}
            onDragStart={(e) => {
                const centerNode = config.nodes.find(n => n.position === 'center');
                if (centerNode) {
                  handleDragStart(centerNode.id, 'center', e);
                }
              }}
          />
        )}
      </svg>
      
      {/* Popups */}
      {popup.type === 'node' && popupNode && (() => {
        const outgoing = config?.connections.filter(c => c.fromNodeId === popupNode.id) || [];
        const totalProbability = outgoing.reduce((sum, c) => sum + c.probability, 0);
        
        return (
          <NodePopup
            node={popupNode}
            outgoingConnections={
              outgoing.map(c => {
                const targetNode = config?.nodes.find(n => n.id === c.toNodeId);
                const isSelfLoop = c.fromNodeId === c.toNodeId;
                return {
                  connection: c,
                  targetName: isSelfLoop 
                    ? '↻ (self)' 
                    : (targetNode?.presetName || (targetNode?.position === 'center' ? 'END' : '?')),
                  targetColor: targetNode?.color || COLORS.filledNode,
                  normalizedProbability: totalProbability > 0 ? c.probability / totalProbability : 0,
                };
              })
            }
            x={popup.x}
            y={popup.y}
            isMobile={isMobileDevice}
            onChangePhraseMin={(phrases) => handleChangePhraseMin(popupNode.id, phrases)}
            onChangePhraseMax={(phrases) => handleChangePhraseMax(popupNode.id, phrases)}
            onTogglePhraseDual={() => handleTogglePhraseDual(popupNode.id)}
            onChangePreset={() => {
              // Close node popup and open preset picker at same position
              const currentX = popup.x;
              const currentY = popup.y;
              setSecondaryPopup({ type: null, x: 0, y: 0 });
              setPopup({ 
                type: 'addPreset', 
                position: popupNode.position,
                x: currentX, 
                y: currentY 
              });
            }}
            onRemove={() => handleRemoveNode(popupNode.id)}
            onConnectionClick={(connection) => {
              // Open connection popup as secondary (keeps node popup open)
              // Position will be set based on nodePopupRect
              setSecondaryPopup({
                type: 'connection',
                connectionId: connection.id,
                x: 0, // Will be positioned based on nodePopupRect
                y: 0,
              });
            }}
            onRectChange={setNodePopupRect}
          />
        );
      })()}
      
      {popup.type === 'connection' && popupConnection && (
        <ConnectionPopup
          connection={popupConnection}
          fromName={config?.nodes.find(n => n.id === popupConnection.fromNodeId)?.presetName || '?'}
          toName={config?.nodes.find(n => n.id === popupConnection.toNodeId)?.presetName || '?'}
          x={popup.x}
          y={popup.y}
          onChangeDurationMin={(dur) => handleChangeDurationMin(popupConnection.id, dur)}
          onChangeDurationMax={(dur) => handleChangeDurationMax(popupConnection.id, dur)}
          onToggleDurationDual={() => handleToggleDurationDual(popupConnection.id)}
          onChangeProbability={(prob) => handleChangeProbability(popupConnection.id, prob)}
          onDelete={() => handleDeleteConnection(popupConnection.id)}
          isSelfLoop={popupConnection.fromNodeId === popupConnection.toNodeId}
        />
      )}
      
      {/* Secondary popup for connection when accessed from node popup */}
      {secondaryPopup.type === 'connection' && secondaryPopupConnection && nodePopupRect && (
        <ConnectionPopup
          connection={secondaryPopupConnection}
          fromName={config?.nodes.find(n => n.id === secondaryPopupConnection.fromNodeId)?.presetName || '?'}
          toName={config?.nodes.find(n => n.id === secondaryPopupConnection.toNodeId)?.presetName || '?'}
          x={secondaryPopup.x}
          y={secondaryPopup.y}
          adjacentRect={nodePopupRect}
          onChangeDurationMin={(dur) => handleChangeDurationMin(secondaryPopupConnection.id, dur)}
          onChangeDurationMax={(dur) => handleChangeDurationMax(secondaryPopupConnection.id, dur)}
          onToggleDurationDual={() => handleToggleDurationDual(secondaryPopupConnection.id)}
          onChangeProbability={(prob) => handleChangeProbability(secondaryPopupConnection.id, prob)}
          onDelete={() => handleDeleteConnection(secondaryPopupConnection.id)}
          isSelfLoop={secondaryPopupConnection.fromNodeId === secondaryPopupConnection.toNodeId}
        />
      )}
      
      {popup.type === 'addPreset' && popup.position && (
        <AddPresetPopup
          presets={presets}
          x={popup.x}
          y={popup.y}
          isMobile={isMobileDevice}
          onSelectPreset={(preset) => handleAddPreset(preset, popup.position!)}
        />
      )}
    </div>
  );
};

export default DiamondJourneyUI;
