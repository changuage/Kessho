/**
 * Snowflake UI Component (Procedural Version)
 * 
 * Instant recursive branching snowflake - no particles, no worker.
 * Each arm's complexity is computed directly from its slider value.
 * Changes are immediate with no regeneration delay.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SliderState } from './state';

export interface SavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
}

interface SnowflakeUIProps {
  state: SliderState;
  onChange: (key: keyof SliderState, value: number) => void;
  onShowAdvanced: () => void;
  onTogglePlay: () => void;
  onLoadPreset: (preset: SavedPreset) => void;
  presets: SavedPreset[];
  isPlaying: boolean;
}

// Macro slider configuration
// 6 prongs starting from top, going clockwise: Reverb, Synth, Granular, Lead, Drum, Wave
// Length = level, Width/complexity = reverb send (except Reverb which has no send)
interface MacroSlider {
  key: keyof SliderState;           // Level parameter (controls prong length)
  reverbSendKey?: keyof SliderState; // Reverb send parameter (controls prong width/complexity)
  label: string;
  min: number;
  max: number;
  color: string;
}

const MACRO_SLIDERS: MacroSlider[] = [
  { key: 'reverbLevel', reverbSendKey: 'reverbDecay', label: 'Reverb', min: 0, max: 2, color: '#E8DCC4' },          // Warm cream - width = decay
  { key: 'synthLevel', reverbSendKey: 'synthReverbSend', label: 'Synth', min: 0, max: 1, color: '#C4724E' },        // Muted orange
  { key: 'granularLevel', reverbSendKey: 'granularReverbSend', label: 'Granular', min: 0, max: 4, color: '#7B9A6D' }, // Sage green
  { key: 'leadLevel', reverbSendKey: 'leadReverbSend', label: 'Lead', min: 0, max: 1, color: '#D4A520' },            // Mustard gold
  { key: 'drumLevel', reverbSendKey: 'drumReverbSend', label: 'Drum', min: 0, max: 1, color: '#8B5CF6' },            // Purple
  { key: 'oceanSampleLevel', reverbSendKey: 'oceanFilterCutoff', label: 'Wave', min: 0, max: 1, color: '#5A7B8A' }, // Slate blue - width = filter cutoff
];

// Logarithmic scaling: lower values get more slider space
// Uses power curve: slider position = value^(1/curve), value = slider^curve
const LOG_CURVE = 2.5; // Higher = more space for lower values

// Convert actual value (min-max) to slider position (0-1) with log scaling
function valueToSliderPosition(value: number, min: number, max: number): number {
  const normalized = (value - min) / (max - min);
  return Math.pow(normalized, 1 / LOG_CURVE);
}

// Convert slider position (0-1) to actual value (min-max) with log scaling
function sliderPositionToValue(position: number, min: number, max: number): number {
  const curved = Math.pow(position, LOG_CURVE);
  return min + curved * (max - min);
}

// Get normalized arm values (0-1) from current state - with log scaling for display
// Returns { lengths, widths } where lengths are based on level and widths on reverb send (or filter cutoff for Wave)
function getArmValues(state: SliderState): { lengths: number[], widths: number[] } {
  const lengths = MACRO_SLIDERS.map(slider => {
    const value = state[slider.key] as number;
    return Math.max(0, Math.min(1, valueToSliderPosition(value, slider.min, slider.max)));
  });
  
  const widths = MACRO_SLIDERS.map(slider => {
    if (!slider.reverbSendKey) return 0.3; // No width control, use base width
    const sendValue = state[slider.reverbSendKey] as number;
    let normalized: number;
    // Special case: oceanFilterCutoff is 40-12000 Hz, normalize to 0-1
    if (slider.reverbSendKey === 'oceanFilterCutoff') {
      normalized = Math.max(0, Math.min(1, (sendValue - 40) / (12000 - 40)));
    } else {
      normalized = Math.max(0, Math.min(1, sendValue)); // 0-1 directly for reverb send/decay
    }
    // Apply exponential curve so lower values show more complexity
    // Drum gets very aggressive curve (0.1): 1% → 63%, 5% → 78%, 10% → 79%
    // Others use sqrt curve (0.5): 25% → 50%, 50% → 71%
    const exponent = slider.reverbSendKey === 'drumReverbSend' ? 0.1 : 0.5;
    return Math.pow(normalized, exponent);
  });
  
  return { lengths, widths };
}

// Seeded random for consistent branch patterns
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Draw a single arm with recursive branching
// complexity (0-1) controls prong LENGTH (how far it extends)
// width (0-1) controls THICKNESS and branch density (reverb send amount)
// highlightColor (optional) - if provided, branches glow with this color
function drawArm(
  ctx: CanvasRenderingContext2D,
  complexity: number,  // 0-1, controls prong length and main structure
  width: number,       // 0-1, controls line thickness and branch density (reverb send)
  armIndex: number,
  maxLength: number,
  baseWidth: number,
  highlightColor?: string  // Optional highlight color for branches when dragging width
) {
  const rng = seededRandom(armIndex * 1000 + 42);
  
  // Width affects branch density and line thickness (reduced by ~20% for cleaner look)
  const widthMultiplier = 0.4 + width * 1.2; // 0.4x to 1.6x thickness
  const branchDensity = 0.2 + width * 0.6;   // 20-80% branch probability based on width
  
  // Complexity affects depth and length
  const maxDepth = Math.floor(1 + complexity * 3);  // 1-4 levels deep
  const branchProbability = branchDensity;
  
  // Main stem length scales with complexity (length)
  const stemLength = maxLength * (0.3 + complexity * 0.7);
  
  // Number of main shoots - more with higher width (reduced from 2-6 to 2-5)
  const numMainShoots = Math.floor(2 + width * 3);  // 2-5 main shoots based on width
  
  // Draw the main stem first - thickness based on width
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(stemLength, 0);
  ctx.strokeStyle = 'rgba(220, 235, 255, 0.95)';
  ctx.lineWidth = baseWidth * widthMultiplier;
  ctx.lineCap = 'round';
  ctx.stroke();
  
  // Draw main shoots along the stem
  for (let i = 0; i < numMainShoots; i++) {
    // Position along stem (evenly distributed, starting at 20%)
    const t = 0.2 + (i / numMainShoots) * 0.7;
    const shootX = stemLength * t;
    
    // Shoot length decreases toward the tip, also affected by width
    const shootLength = stemLength * (0.5 - t * 0.3) * (0.4 + width * 0.6);
    
    // Branch angle - steeper near base, flatter near tip
    const shootAngle = 0.8 - t * 0.3 + rng() * 0.2;  // ~45-30 degrees
    
    // Draw shoot on one side (mirroring happens at arm level)
    drawBranch(
      shootX, 0,
      shootAngle,
      shootLength,
      baseWidth * 0.7 * widthMultiplier,
      1
    );
  }
  
  // End crystal - size based on width (reduced by 20%)
  ctx.beginPath();
  ctx.arc(stemLength, 0, baseWidth * 0.5 * widthMultiplier, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(230, 245, 255, 0.9)';
  ctx.fill();
  
  function drawBranch(
    x: number, 
    y: number, 
    angle: number, 
    length: number, 
    branchWidth: number, 
    depth: number
  ) {
    if (depth > maxDepth || length < 4) return;
    
    // Calculate end point
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    
    // Draw the branch line - use highlight color if provided
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    if (highlightColor) {
      // Highlighted: glow with the highlight color
      ctx.strokeStyle = highlightColor;
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = `rgba(220, 235, 255, ${0.85 - depth * 0.12})`;
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = Math.max(1, branchWidth);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;  // Reset shadow
    
    // Add sub-branches based on width (reverb send controls complexity)
    if (depth < maxDepth) {
      const numBranches = Math.floor(1 + branchDensity * 2.5);  // 1-3 sub-branches based on reverb send
      
      for (let i = 0; i < numBranches; i++) {
        if (rng() > branchProbability) continue;
        
        // Position along the branch (25% to 85% of length)
        const t = 0.25 + rng() * 0.6;
        const branchX = x + Math.cos(angle) * length * t;
        const branchY = y + Math.sin(angle) * length * t;
        
        // Branch angle (40-70 degrees off parent)
        const branchAngle = 0.7 + rng() * 0.5;
        
        const subLength = length * (0.45 + rng() * 0.25);
        const subWidth = branchWidth * 0.65;
        
        // Sub-branch (same side as parent, creating feather pattern)
        drawBranch(
          branchX, branchY,
          angle + branchAngle,
          subLength,
          subWidth,
          depth + 1
        );
      }
    }
    
    // Tiny crystal at branch ends (reduced by 20%)
    if (depth >= maxDepth - 1 || length < 10) {
      ctx.beginPath();
      ctx.arc(endX, endY, branchWidth * 0.65, 0, Math.PI * 2);
      if (highlightColor) {
        ctx.fillStyle = highlightColor;
        ctx.shadowColor = highlightColor;
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = 'rgba(220, 240, 255, 0.8)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

const SnowflakeUI: React.FC<SnowflakeUIProps> = ({ state, onChange, onShowAdvanced, onTogglePlay, onLoadPreset, presets, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);  // Dragging prong handle (level)
  const [hovering, setHovering] = useState<number | null>(null);
  const [draggingWidth, setDraggingWidth] = useState<number | null>(null);  // Dragging prong body (reverb send)
  const [hoveringWidth, setHoveringWidth] = useState<number | null>(null);
  const dragStartXRef = useRef<number>(0);  // Track start X position for tangential drag
  const dragStartYRef = useRef<number>(0);  // Track start Y position for tangential drag
  const dragStartValueRef = useRef<number>(0);  // Track initial reverb send value
  // Special drag states: 'hexagon' for tension, 'ring' for master volume
  const [specialDrag, setSpecialDrag] = useState<'hexagon' | 'ring' | null>(null);
  const [specialHover, setSpecialHover] = useState<'hexagon' | 'ring' | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  
  // Auto-hide controls after inactivity
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3000); // Hide after 3 seconds of inactivity
  }, []);
  
  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);
  
  // Start the hide timer initially
  useEffect(() => {
    resetHideTimer();
  }, [resetHideTimer]);
  
  // Responsive canvas size - smaller on mobile
  const [windowSize, setWindowSize] = useState({ width: typeof window !== 'undefined' ? window.innerWidth : 800, height: typeof window !== 'undefined' ? window.innerHeight : 600 });
  console.log('windowSize:', windowSize);
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    // Set initial size
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate canvas size based on viewport - fully responsive
  // Reserve space for play button + settings icon, use 70% of smaller dimension
  const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
  const canvasSize = Math.max(200, Math.min(smallerDimension * 0.7, 550));
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  
  // Scale factors for responsive sizing
  const scaleFactor = canvasSize / 600;
  
  // Fixed base values for reference (scaled)
  const baseHexRadius = 35 * scaleFactor;
  const outerRingRadius = 250 * scaleFactor;
  // Master volume controls overall snowflake scale (0% = just hexagon, 100% = full size)
  const masterScale = state.masterVolume;
  
  // Tension controls inner hexagon size (0% = normal, 100% = 3x)
  const hexagonScale = 1 + state.tension * 2;  // 1x to 3x
  
  const baseRadius = 35 * scaleFactor * hexagonScale;
  const maxProngLength = 160 * scaleFactor * masterScale;
  const maxArmLength = 140 * scaleFactor * masterScale;

  // Draw snowflake - runs on every state change, but it's fast!
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const { lengths: armLengths, widths: armWidths } = getArmValues(state);

    // Only draw arms if master volume > 0
    if (masterScale > 0.01) {
      // Draw each arm
      ctx.save();
      ctx.translate(centerX, centerY);
    
    for (let arm = 0; arm < 6; arm++) {
      const length = armLengths[arm];    // Level controls length
      const width = armWidths[arm];       // Reverb send controls width/complexity
      const rotation = (arm * Math.PI * 2) / 6 - Math.PI / 2; // Start at top
      
      // Highlight branches when width is being dragged (tangential drag)
      const isWidthActive = draggingWidth === arm || hoveringWidth === arm;
      const highlightColor = isWidthActive ? MACRO_SLIDERS[arm].color : undefined;
      
      // Draw arm with 2-fold mirror symmetry (across the arm axis)
      for (const mirror of [1, -1]) {
        ctx.save();
        ctx.rotate(rotation);
        ctx.scale(1, mirror);
        
        // Start from edge of center hexagon
        ctx.translate(baseRadius * 0.7, 0);
        
        drawArm(ctx, length, width, arm, maxArmLength, 3, highlightColor);
        
        ctx.restore();
      }
    }
    
    ctx.restore();
    }

    // Draw center hexagon (size controlled by tension)
    ctx.save();
    ctx.translate(centerX, centerY);
    
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
      const x = Math.cos(angle) * baseRadius * 0.7;
      const y = Math.sin(angle) * baseRadius * 0.7;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(210, 230, 255, 0.95)';
    ctx.fill();

    // Center icon - scale with hexagon
    const fontSize = Math.max(14, Math.min(40, 20 * hexagonScale * scaleFactor));
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isPlaying ? '#3a70b9' : '#556';
    ctx.fillText(isPlaying ? '' : '', 0, 1);
    
    ctx.restore();

  }, [state, isPlaying, centerX, centerY, canvasSize, scaleFactor, baseRadius, maxProngLength, maxArmLength, hexagonScale, draggingWidth, hoveringWidth]);

  // Handle pointer events for prong dragging
  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(index);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Handle hexagon drag (tension)
    if (specialDrag === 'hexagon') {
      // Map distance to tension: smaller drag = 0, larger = 1
      // Hex radius ranges from baseHexRadius (tension=0) to baseHexRadius*3 (tension=1)
      const minRadius = baseHexRadius * 0.5;
      const maxRadius = baseHexRadius * 2.5;
      const normalizedTension = Math.max(0, Math.min(1, (distance - minRadius) / (maxRadius - minRadius)));
      onChange('tension', normalizedTension);
      return;
    }
    
    // Handle ring drag (master volume)
    if (specialDrag === 'ring') {
      // Map distance to master volume: closer to center = 0, edge = 1
      const minRadius = baseHexRadius * 1.5;
      const maxRadius = outerRingRadius;
      const normalizedVolume = Math.max(0, Math.min(1, (distance - minRadius) / (maxRadius - minRadius)));
      onChange('masterVolume', normalizedVolume);
      return;
    }
    
    // Handle width drag (reverb send or filter cutoff) - tangential movement
    if (draggingWidth !== null) {
      const slider = MACRO_SLIDERS[draggingWidth];
      if (slider.reverbSendKey) {
        // Calculate tangential movement (perpendicular to prong direction)
        const prongAngle = (draggingWidth * 60 - 90) * (Math.PI / 180);
        // Tangent is perpendicular to the prong direction
        const tangentX = -Math.sin(prongAngle);
        const tangentY = Math.cos(prongAngle);
        // Project movement onto tangent (using both X and Y deltas)
        const deltaX = x - dragStartXRef.current;
        const deltaY = y - dragStartYRef.current;
        const tangentMovement = deltaX * tangentX + deltaY * tangentY;
        // Scale: ~100 pixels = full range
        const sensitivity = 100;
        const normalizedValue = Math.max(0, Math.min(1, dragStartValueRef.current + tangentMovement / sensitivity));
        
        // Convert to actual value - special case for oceanFilterCutoff
        if (slider.reverbSendKey === 'oceanFilterCutoff') {
          const hzValue = 40 + normalizedValue * (12000 - 40);
          onChange(slider.reverbSendKey, hzValue);
        } else {
          onChange(slider.reverbSendKey, normalizedValue);
        }
      }
      return;
    }
    
    if (dragging === null) return;
    
    const slider = MACRO_SLIDERS[dragging];
    // Use fixed interaction radius (not scaled by master/tension)
    const interactionBaseRadius = 35;
    const interactionMaxLength = 160;
    const normalizedDistance = Math.max(0, Math.min(1, (distance - interactionBaseRadius) / interactionMaxLength));
    // Apply logarithmic curve: slider position -> actual value
    const value = sliderPositionToValue(normalizedDistance, slider.min, slider.max);
    
    onChange(slider.key, value);
  }, [dragging, draggingWidth, specialDrag, onChange, centerX, centerY, baseHexRadius, outerRingRadius]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(null);
    setDraggingWidth(null);
    setSpecialDrag(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  // Calculate prong positions (scaled for responsive display)
  const getProngPosition = (index: number, value: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180);
    const slider = MACRO_SLIDERS[index];
    // Apply logarithmic scaling: actual value -> slider position
    const normalizedValue = valueToSliderPosition(value, slider.min, slider.max);
    // Use scaled interaction radius
    const interactionBaseRadius = 35 * scaleFactor;
    const interactionMaxLength = 160 * scaleFactor;
    const prongLength = interactionBaseRadius + normalizedValue * interactionMaxLength;
    
    return {
      x: centerX + Math.cos(angle) * prongLength,
      y: centerY + Math.sin(angle) * prongLength,
      angle,
      normalizedValue,
    };
  };
  
  // Scaled sizes for touch targets - use scaleFactor for responsive sizing
  const handleRadius = 14 * scaleFactor;
  const handleRadiusActive = 18 * scaleFactor;
  const labelFontSize = Math.max(9, 11 * scaleFactor);
  const labelHeight = 20 * scaleFactor;
  
  // Calculate button positions - halfway between canvas edge and screen edge
  const canvasTop = (windowSize.height - canvasSize) / 2;
  const canvasBottom = canvasTop + canvasSize;
  const topGap = canvasTop;
  const bottomGap = windowSize.height - canvasBottom;
  const playButtonTop = topGap / 2 - 22; // Center of top gap, offset by half button height
  const advancedButtonBottom = bottomGap / 2 - 20; // Center of bottom gap

  return (
    <div style={styles.container}>
      {/* Play button - positioned between top edge and canvas */}
      <button 
        style={{
          ...(isPlaying ? styles.stopButton : styles.playButton),
          position: 'absolute',
          top: Math.max(10, playButtonTop),
          left: '50%',
          transform: 'translateX(-50%)',
        }} 
        onClick={onTogglePlay}
      >
        {isPlaying ? '■' : '▶'}
      </button>

      {/* Snowflake centered */}
      <div style={styles.snowflakeWrapper}>
      <div 
        style={styles.canvasContainer}
        onPointerMove={(e) => {
          handlePointerMove(e);
          resetHideTimer();
        }}
        onPointerUp={handlePointerUp}
        onPointerEnter={resetHideTimer}
        onPointerDown={resetHideTimer}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={styles.canvas}
        />
        
        {/* Interactive prong handles */}
        <svg 
          width={canvasSize} 
          height={canvasSize} 
          style={{
            ...styles.svgOverlay,
            opacity: showControls || dragging !== null || specialDrag !== null ? 1 : 0,
            transition: 'opacity 0.5s ease-in-out',
          }}
        >
          {/* Outer ring for Master Volume */}
          <circle
            cx={centerX}
            cy={centerY}
            r={outerRingRadius}
            fill="none"
            stroke={specialHover === 'ring' || specialDrag === 'ring' ? '#3C7181' : 'rgba(60,113,129,0.35)'}
            strokeWidth={specialHover === 'ring' || specialDrag === 'ring' ? 8 : 4}
            style={{
              cursor: 'ew-resize',
              filter: specialHover === 'ring' || specialDrag === 'ring' ? 'drop-shadow(0 0 12px rgba(60,113,129,0.7))' : 'none',
              transition: 'all 0.15s ease-out',
              pointerEvents: 'stroke',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSpecialDrag('ring');
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerEnter={() => setSpecialHover('ring')}
            onPointerLeave={() => setSpecialHover(null)}
          />
          
          {/* Master Volume label */}
          {(specialHover === 'ring' || specialDrag === 'ring') && (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={centerX - 50 * scaleFactor} y={30 * scaleFactor} width={100 * scaleFactor} height={22 * scaleFactor} rx={4} fill="rgba(0,0,0,0.85)" stroke="#3C7181" />
              <text x={centerX} y={45 * scaleFactor} textAnchor="middle" fill="white" fontSize={11 * scaleFactor} fontWeight="bold">
                Volume: {Math.round(state.masterVolume * 100)}%
              </text>
            </g>
          )}
          
          {/* Center hexagon for Tension */}
          <polygon
            points={Array.from({length: 6}, (_, i) => {
              const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
              const r = baseRadius * 0.7;
              return `${centerX + Math.cos(angle) * r},${centerY + Math.sin(angle) * r}`;
            }).join(' ')}
            fill={specialHover === 'hexagon' || specialDrag === 'hexagon' ? 'rgba(193,147,10,0.25)' : 'transparent'}
            stroke={specialHover === 'hexagon' || specialDrag === 'hexagon' ? '#C1930A' : 'rgba(244,233,213,0.4)'}
            strokeWidth={specialHover === 'hexagon' || specialDrag === 'hexagon' ? 3 : 2}
            style={{
              cursor: 'nesw-resize',
              filter: specialHover === 'hexagon' || specialDrag === 'hexagon' ? 'drop-shadow(0 0 10px rgba(193,147,10,0.7))' : 'none',
              transition: 'all 0.15s ease-out',
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSpecialDrag('hexagon');
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerEnter={() => setSpecialHover('hexagon')}
            onPointerLeave={() => setSpecialHover(null)}
          />
          
          {/* Tension label */}
          {(specialHover === 'hexagon' || specialDrag === 'hexagon') && (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={centerX - 45 * scaleFactor} y={centerY + baseRadius + 8 * scaleFactor} width={90 * scaleFactor} height={22 * scaleFactor} rx={4} fill="rgba(0,0,0,0.85)" stroke="#C1930A" />
              <text x={centerX} y={centerY + baseRadius + 22 * scaleFactor} textAnchor="middle" fill="white" fontSize={11 * scaleFactor} fontWeight="bold">
                Tension: {Math.round(state.tension * 100)}%
              </text>
            </g>
          )}
          
          {MACRO_SLIDERS.map((slider, index) => {
            const value = state[slider.key] as number;
            const pos = getProngPosition(index, value);
            const isActive = dragging === index || hovering === index;
            const isWidthActive = draggingWidth === index || hoveringWidth === index;
            const hasReverbSend = !!slider.reverbSendKey;
            const reverbSendValue = hasReverbSend ? (state[slider.reverbSendKey!] as number) : 0;
            // Normalize for drag calculation - oceanFilterCutoff is 40-12000Hz, others are 0-1
            const normalizedSendValue = slider.reverbSendKey === 'oceanFilterCutoff' 
              ? (reverbSendValue - 40) / (12000 - 40)
              : reverbSendValue;
            
            return (
              <g key={index}>
                {/* Visible prong line */}
                <line
                  x1={centerX + Math.cos(pos.angle) * baseHexRadius}
                  y1={centerY + Math.sin(pos.angle) * baseHexRadius}
                  x2={pos.x}
                  y2={pos.y}
                  stroke={isWidthActive ? slider.color : (isActive ? slider.color : 'rgba(255,255,255,0.3)')}
                  strokeWidth={isWidthActive ? 8 : (isActive ? 3 : 2)}
                  strokeLinecap="round"
                  style={{ 
                    filter: isWidthActive ? `drop-shadow(0 0 12px ${slider.color})` : (isActive ? `drop-shadow(0 0 8px ${slider.color})` : 'none'),
                    transition: 'all 0.15s ease-out',
                    pointerEvents: 'none',
                  }}
                />
                {/* Wide invisible hit area for reverb send drag (4x wider) */}
                {hasReverbSend && (
                  <line
                    x1={centerX + Math.cos(pos.angle) * baseHexRadius}
                    y1={centerY + Math.sin(pos.angle) * baseHexRadius}
                    x2={pos.x}
                    y2={pos.y}
                    stroke="transparent"
                    strokeWidth={32 * scaleFactor}
                    strokeLinecap="round"
                    style={{ 
                      cursor: 'ew-resize',
                      pointerEvents: 'stroke',
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Store relative position (matching handlePointerMove calculation)
                      const rect = (e.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect();
                      if (rect) {
                        dragStartXRef.current = e.clientX - rect.left;
                        dragStartYRef.current = e.clientY - rect.top;
                      }
                      setDraggingWidth(index);
                      dragStartValueRef.current = normalizedSendValue;
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                    onPointerEnter={() => setHoveringWidth(index)}
                    onPointerLeave={() => setHoveringWidth(null)}
                  />
                )}
                
                {/* Width label - shown when hovering or dragging prong body */}
                {hasReverbSend && (isWidthActive) && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect 
                      x={pos.x - 40 * scaleFactor} 
                      y={pos.y + (pos.y > centerY ? -40 : 20) * scaleFactor} 
                      width={80 * scaleFactor} 
                      height={22 * scaleFactor} 
                      rx={4} 
                      fill="rgba(0,0,0,0.85)" 
                      stroke={slider.color} 
                    />
                    <text 
                      x={pos.x} 
                      y={pos.y + (pos.y > centerY ? -25 : 35) * scaleFactor} 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize={10 * scaleFactor} 
                      fontWeight="bold"
                    >
                      {slider.reverbSendKey === 'oceanFilterCutoff' 
                        ? `Filter: ${Math.round(reverbSendValue / 1000)}kHz`
                        : slider.reverbSendKey === 'reverbDecay'
                        ? `Decay: ${Math.round(reverbSendValue * 100)}%`
                        : `Verb: ${Math.round(reverbSendValue * 100)}%`}
                    </text>
                  </g>
                )}
                
                {/* Handle - larger touch target on mobile */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? handleRadiusActive : handleRadius}
                  fill={slider.color}
                  stroke="white"
                  strokeWidth={2}
                  style={{ 
                    cursor: 'grab',
                    filter: isActive ? `drop-shadow(0 0 12px ${slider.color})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                    transition: 'all 0.15s ease-out',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  onPointerEnter={() => setHovering(index)}
                  onPointerLeave={() => setHovering(null)}
                />
                
                {/* Label */}
                <g style={{ pointerEvents: 'none' }}>
                  <text
                    x={pos.x}
                    y={pos.y + (pos.y > centerY ? labelHeight + labelFontSize : -labelHeight + labelFontSize * 0.3)}
                    textAnchor="middle"
                    fill="white"
                    fontSize={labelFontSize}
                    fontWeight="bold"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)' }}
                  >
                    {slider.label}: {slider.max > 1 ? value.toFixed(1) : Math.round(value * 100) + '%'}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      </div>

      {/* Preset popup - appears above bottom buttons */}
      {showPresets && (
        <div
          style={{
            position: 'absolute',
            bottom: Math.max(70, advancedButtonBottom + 60),
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 24, 0.85)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            padding: '12px 16px',
            minWidth: '160px',
            maxWidth: '240px',
            maxHeight: '200px',
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {presets.length === 0 ? (
            <p style={{ 
              color: 'rgba(255,255,255,0.5)', 
              margin: 0, 
              fontSize: '0.9rem',
              textAlign: 'center',
            }}>
              No presets available
            </p>
          ) : (
            presets.map((preset, index) => (
              <button
                key={index}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  marginBottom: index < presets.length - 1 ? '6px' : 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onClick={() => {
                  onLoadPreset(preset);
                  setShowPresets(false);
                }}
              >
                {preset.name}
              </button>
            ))
          )}
        </div>
      )}

      {/* Bottom buttons - positioned between canvas and bottom edge */}
      <div
        style={{
          position: 'absolute',
          bottom: Math.max(10, advancedButtonBottom),
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        <button 
          style={{
            ...styles.advancedButton,
            color: showPresets ? '#ED5A24' : 'rgba(255,255,255,0.6)',
          }} 
          onClick={() => setShowPresets(!showPresets)}
        >
          ⬡
        </button>
        <button style={styles.advancedButton} onClick={onShowAdvanced}>
          ✲
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    width: '100vw',
    background: 'linear-gradient(180deg, #0a0a18 0%, #101828 40%, #182040 100%)',
    backgroundAttachment: 'fixed',
    overflow: 'hidden',
    padding: '10px 5px',
    boxSizing: 'border-box',
    position: 'fixed',
    top: 0,
    left: 0,
  },
  snowflakeWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasContainer: {
    position: 'relative',
    touchAction: 'none',
  },
  canvas: {
    borderRadius: '50%',
    boxShadow: '0 0 60px rgba(100, 150, 220, 0.2), inset 0 0 40px rgba(100, 150, 220, 0.1)',
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
  playButton: {
    padding: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: '#FFFFFF',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    padding: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: '#ED5A24',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedButton: {
    padding: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default SnowflakeUI;
