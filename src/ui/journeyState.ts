/**
 * Journey Mode State Management
 * 
 * React hooks and state management for Journey Mode.
 * Handles playback timing, state transitions, and UI updates.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  JourneyConfig,
  JourneyState,
  JourneyNode,
  JourneyConnection,
  DiamondPosition,
  createSimpleJourney,
  createDiamondJourney,
  createJourneyConnection,
  JOURNEY_NODE_COLORS,
} from '../audio/journeyTypes';
import { SavedPreset } from './state';

// ============================================================================
// INITIAL STATE
// ============================================================================

const INITIAL_JOURNEY_STATE: JourneyState = {
  phase: 'idle',
  currentNodeId: null,
  nextNodeId: null,  plannedNextNodeId: null,  morphProgress: 0,
  phraseProgress: 0,
  elapsedTime: 0,
  phraseStartTime: 0,
  morphStartTime: 0,
  resolvedPhraseDuration: 0,
  resolvedMorphDuration: 0,
};

// ============================================================================
// MAIN HOOK
// ============================================================================

export interface UseJourneyResult {
  // State
  config: JourneyConfig | null;
  state: JourneyState;
  setConfig: React.Dispatch<React.SetStateAction<JourneyConfig | null>>;
  
  // Actions
  createFromMorph: (presetA: SavedPreset, presetB: SavedPreset) => void;
  createEmptyDiamond: () => void;
  addNode: (preset: SavedPreset) => void;
  addNodeAtPosition: (preset: SavedPreset, position: DiamondPosition) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<JourneyNode>) => void;
  addConnection: (fromNodeId: string, toNodeId: string) => void;
  removeConnection: (connectionId: string) => void;
  updateConnection: (connectionId: string, updates: Partial<JourneyConnection>) => void;
  
  // Playback
  play: () => void;
  stop: () => void;
  
  // Simulation (for demo/testing)
  simulatePhraseProgress: (progress: number) => void;
  simulateMorphProgress: (progress: number) => void;
  simulateNextPhase: () => void;
}

/**
 * Main hook for Journey Mode state management
 * @param phraseSeconds - Duration of one phrase in seconds (default 16s)
 */
export function useJourney(
  phraseSeconds: number = 16,
  onMorphTo?: (presetName: string, duration: number) => void,
  onLoadPreset?: (presetName: string) => void
): UseJourneyResult {
  // Configuration state
  const [config, setConfig] = useState<JourneyConfig | null>(null);
  
  // Runtime state
  const [state, setState] = useState<JourneyState>(INITIAL_JOURNEY_STATE);
  
  // Animation frame ref for smooth updates
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  // Keep refs to avoid stale closures in animation loop
  const configRef = useRef<JourneyConfig | null>(null);
  configRef.current = config;
  
  const onMorphToRef = useRef(onMorphTo);
  onMorphToRef.current = onMorphTo;
  
  const onLoadPresetRef = useRef(onLoadPreset);
  onLoadPresetRef.current = onLoadPreset;
  
  // Calculate milliseconds per phrase (1 phrase = phraseSeconds, default 16s)
  const msPerPhrase = phraseSeconds * 1000;
  
  // ========================================================================
  // CONFIGURATION ACTIONS
  // ========================================================================
  
  /**
   * Create a journey from the current morph setup (2 presets)
   */
  const createFromMorph = useCallback((presetA: SavedPreset, presetB: SavedPreset) => {
    const journey = createSimpleJourney(presetA, presetB);
    setConfig(journey);
    setState(INITIAL_JOURNEY_STATE);
  }, []);
  
  /**
   * Create an empty diamond journey with 4 slots
   */
  const createEmptyDiamond = useCallback(() => {
    const journey = createDiamondJourney([]);
    setConfig(journey);
    setState(INITIAL_JOURNEY_STATE);
  }, []);
  
  /**
   * Add a preset to a specific diamond position
   */
  const addNodeAtPosition = useCallback((preset: SavedPreset, position: DiamondPosition) => {
    setConfig(prev => {
      if (!prev) {
        // Create new diamond journey with this preset at position
        const journey = createDiamondJourney([]);
        return {
          ...journey,
          nodes: journey.nodes.map(n => 
            n.position === position 
              ? { 
                  ...n, 
                  presetId: preset.name, 
                  presetName: preset.name,
                  color: JOURNEY_NODE_COLORS[0]
                }
              : n
          ),
        };
      }
      
      // Update existing node at position
      const colorIndex = prev.nodes.filter(n => n.presetId).length;
      return {
        ...prev,
        nodes: prev.nodes.map(n => 
          n.position === position 
            ? { 
                ...n, 
                presetId: preset.name, 
                presetName: preset.name,
                color: JOURNEY_NODE_COLORS[colorIndex % JOURNEY_NODE_COLORS.length]
              }
            : n
        ),
      };
    });
  }, []);
  
  /**
   * Add a preset as a new node (legacy - finds first empty slot)
   */
  const addNode = useCallback((preset: SavedPreset) => {
    setConfig(prev => {
      if (!prev) {
        // Create new diamond config with first slot filled
        const journey = createDiamondJourney([preset]);
        return journey;
      }
      
      // Find first empty slot
      const positions: DiamondPosition[] = ['left', 'top', 'right', 'bottom'];
      const emptyPosition = positions.find(pos => 
        !prev.nodes.find(n => n.position === pos && n.presetId)
      );
      
      if (!emptyPosition) {
        console.warn('All slots are filled');
        return prev;
      }
      
      const colorIndex = prev.nodes.filter(n => n.presetId).length;
      return {
        ...prev,
        nodes: prev.nodes.map(n => 
          n.position === emptyPosition 
            ? { 
                ...n, 
                presetId: preset.name, 
                presetName: preset.name,
                color: JOURNEY_NODE_COLORS[colorIndex % JOURNEY_NODE_COLORS.length]
              }
            : n
        ),
      };
    });
  }, []);
  
  /**
   * Remove a node and its connections (clears the slot but keeps position)
   */
  const removeNode = useCallback((nodeId: string) => {
    setConfig(prev => {
      if (!prev) return null;
      
      const node = prev.nodes.find(n => n.id === nodeId);
      if (!node) return prev;
      
      // Clear the node's preset but keep the slot
      const clearedNode: JourneyNode = {
        ...node,
        presetId: '',
        presetName: '',
        color: '#444',
      };
      
      // Remove connections involving this node
      const newConnections = prev.connections.filter(
        c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      );
      
      return { 
        ...prev, 
        nodes: prev.nodes.map(n => n.id === nodeId ? clearedNode : n),
        connections: newConnections,
      };
    });
  }, []);
  
  /**
   * Update a node's properties
   */
  const updateNode = useCallback((nodeId: string, updates: Partial<JourneyNode>) => {
    setConfig(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        nodes: prev.nodes.map(node =>
          node.id === nodeId ? { ...node, ...updates } : node
        ),
      };
    });
  }, []);
  
  /**
   * Add a connection between two nodes
   */
  const addConnection = useCallback((fromNodeId: string, toNodeId: string) => {
    setConfig(prev => {
      if (!prev) return null;
      
      // Check if connection already exists
      const exists = prev.connections.some(
        c => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId
      );
      if (exists) return prev;
      
      const newConnection = createJourneyConnection(fromNodeId, toNodeId);
      return {
        ...prev,
        connections: [...prev.connections, newConnection],
      };
    });
  }, []);
  
  /**
   * Remove a connection
   */
  const removeConnection = useCallback((connectionId: string) => {
    setConfig(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        connections: prev.connections.filter(c => c.id !== connectionId),
      };
    });
  }, []);
  
  /**
   * Update a connection's properties
   */
  const updateConnection = useCallback((
    connectionId: string,
    updates: Partial<JourneyConnection>
  ) => {
    setConfig(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        connections: prev.connections.map(conn =>
          conn.id === connectionId ? { ...conn, ...updates } : conn
        ),
      };
    });
  }, []);
  
  // ========================================================================
  // PLAYBACK LOGIC
  // ========================================================================
  
  /**
   * Select next node based on probability weights
   * Uses configRef to avoid stale closures
   */
  const selectNextNode = useCallback((currentNodeId: string): string | null => {
    const currentConfig = configRef.current;
    if (!currentConfig) return null;
    
    // Get all outgoing connections from current node
    const outgoing = currentConfig.connections.filter(c => c.fromNodeId === currentNodeId);
    if (outgoing.length === 0) return null;
    
    // Weight-based random selection
    const totalWeight = outgoing.reduce((sum, c) => sum + c.probability, 0);
    let random = Math.random() * totalWeight;
    
    for (const conn of outgoing) {
      random -= conn.probability;
      if (random <= 0) {
        return conn.toNodeId;
      }
    }
    
    return outgoing[0].toNodeId;
  }, []); // No dependencies - uses configRef
  
  /**
   * Animation loop for updating progress
   * Uses configRef to avoid stale closures
   */
  const animate = useCallback((timestamp: number) => {
    const currentConfig = configRef.current;
    if (!currentConfig) {
      animationRef.current = null;
      return;
    }
    
    // On first frame, just record the timestamp without advancing time
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
      animationRef.current = requestAnimationFrame(animate);
      return;
    }
    
    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    
    let shouldContinue = true;
    
    setState(prev => {
      if (prev.phase === 'idle' || prev.phase === 'ended') {
        shouldContinue = false;
        return prev;
      }
      
      const newState = { ...prev };
      newState.elapsedTime += deltaTime;
      
      if (prev.phase === 'playing') {
        // Update phrase progress
        const currentNode = currentConfig.nodes.find(n => n.id === prev.currentNodeId);
        if (currentNode) {
          // Use resolved duration (already randomized when phase started)
          const phraseDuration = prev.resolvedPhraseDuration * msPerPhrase;
          const phraseElapsed = newState.elapsedTime - prev.phraseStartTime;
          newState.phraseProgress = Math.min(1, phraseElapsed / phraseDuration);
          
          // Check if phrase is complete
          if (newState.phraseProgress >= 1) {
            // Use the pre-selected next node (determined at start of playing phase)
            const nextId = prev.plannedNextNodeId;
            if (nextId) {
              const nextNode = currentConfig.nodes.find(n => n.id === nextId);
              const connection = currentConfig.connections.find(
                c => c.fromNodeId === prev.currentNodeId && c.toNodeId === nextId
              );
              
              // Calculate morph duration with dual mode support
              const minMorph = connection?.morphDuration ?? 2;
              const maxMorph = connection?.morphDurationMax ?? minMorph;
              const resolvedMorph = minMorph + Math.random() * (maxMorph - minMorph);
              
              // Check if next node is center (END) - use 'ending' phase for fadeout
              if (nextNode && (nextNode.position === 'center' || nextNode.presetId === '__CENTER__')) {
                newState.phase = 'ending';
                newState.nextNodeId = nextId;
                newState.plannedNextNodeId = null; // No next after ending
                newState.morphStartTime = newState.elapsedTime;
                newState.morphProgress = 0;
                newState.resolvedMorphDuration = resolvedMorph;
                // Note: We could trigger a fadeout callback here if needed
              } else if (nextId === prev.currentNodeId) {
                // Self-loop - start new phrase and arc animation together
                // Calculate new phrase duration for the self-loop
                const minPhrase = currentNode.phraseLength;
                const maxPhrase = currentNode.phraseLengthMax ?? minPhrase;
                const resolvedPhrase = minPhrase + Math.random() * (maxPhrase - minPhrase);
                
                // Pre-select next node for after this self-loop
                const plannedAfterLoop = selectNextNode(prev.currentNodeId!);
                
                newState.phase = 'self-loop';
                newState.nextNodeId = nextId; // Same as current
                newState.plannedNextNodeId = plannedAfterLoop;
                newState.morphStartTime = newState.elapsedTime;
                newState.morphProgress = 0;
                newState.phraseStartTime = newState.elapsedTime; // Reset phrase for new round
                newState.phraseProgress = 0;
                newState.resolvedPhraseDuration = resolvedPhrase;
                // No onMorphTo callback for self-loops - same preset continues
              } else {
                newState.phase = 'morphing';
                newState.nextNodeId = nextId;
                newState.plannedNextNodeId = null; // Will be set when morph completes
                newState.morphStartTime = newState.elapsedTime;
                newState.morphProgress = 0;
                newState.resolvedMorphDuration = resolvedMorph;
                
                // Trigger morph callback for normal morph
                if (nextNode && connection && onMorphToRef.current) {
                  onMorphToRef.current(nextNode.presetName, resolvedMorph);
                }
              }
            } else {
              // No next node - journey ends immediately
              newState.phase = 'ended';
              shouldContinue = false;
            }
          }
        }
      } else if (prev.phase === 'self-loop') {
        // Self-loop: phrase plays while loop arc animates (same duration, synchronized)
        const currentNode = currentConfig.nodes.find(n => n.id === prev.currentNodeId);
        if (currentNode) {
          // Use resolved duration (already randomized when phase started)
          const phraseDuration = prev.resolvedPhraseDuration * msPerPhrase;
          const elapsed = newState.elapsedTime - prev.phraseStartTime;
          // Both progress values update together
          newState.phraseProgress = Math.min(1, elapsed / phraseDuration);
          newState.morphProgress = newState.phraseProgress; // Arc animation matches phrase
          
          // Check if self-loop phrase is complete
          if (newState.phraseProgress >= 1) {
            // Self-loop complete, use the pre-selected next node
            const nextId = prev.plannedNextNodeId;
            if (nextId) {
              const nextNode = currentConfig.nodes.find(n => n.id === nextId);
              const connection = currentConfig.connections.find(
                c => c.fromNodeId === prev.currentNodeId && c.toNodeId === nextId
              );
              
              // Reset for next phase
              newState.morphProgress = 0;
              newState.phraseProgress = 0;
              newState.phraseStartTime = newState.elapsedTime;
              newState.morphStartTime = newState.elapsedTime;
              
              // Calculate morph duration with dual mode support
              const minMorph = connection?.morphDuration ?? 2;
              const maxMorph = connection?.morphDurationMax ?? minMorph;
              const resolvedMorph = minMorph + Math.random() * (maxMorph - minMorph);
              
              if (nextNode && (nextNode.position === 'center' || nextNode.presetId === '__CENTER__')) {
                // Going to center (END)
                newState.phase = 'ending';
                newState.nextNodeId = nextId;
                newState.plannedNextNodeId = null; // No next after ending
                newState.resolvedMorphDuration = resolvedMorph;
              } else if (nextId === prev.currentNodeId) {
                // Another self-loop - stay in self-loop phase
                // Calculate new phrase duration for the next self-loop
                const minPhrase = currentNode.phraseLength;
                const maxPhrase = currentNode.phraseLengthMax ?? minPhrase;
                const resolvedPhrase = minPhrase + Math.random() * (maxPhrase - minPhrase);
                
                // Pre-select next node for after this self-loop
                const plannedAfterLoop = selectNextNode(prev.currentNodeId!);
                
                newState.phase = 'self-loop';
                newState.nextNodeId = nextId;
                newState.plannedNextNodeId = plannedAfterLoop;
                newState.resolvedPhraseDuration = resolvedPhrase;
              } else {
                // Normal morph to different node
                newState.phase = 'morphing';
                newState.nextNodeId = nextId;
                newState.plannedNextNodeId = null; // Will be set when morph completes
                newState.resolvedMorphDuration = resolvedMorph;
                if (nextNode && connection && onMorphToRef.current) {
                  onMorphToRef.current(nextNode.presetName, resolvedMorph);
                }
              }
            } else {
              // No next node - journey ends
              newState.phase = 'ended';
              shouldContinue = false;
            }
          }
        }
      } else if (prev.phase === 'morphing') {
        // Update morph progress
        const connection = currentConfig.connections.find(
          c => c.fromNodeId === prev.currentNodeId && c.toNodeId === prev.nextNodeId
        );
        if (connection) {
          // Use resolved duration (already randomized when phase started)
          const morphDuration = prev.resolvedMorphDuration * msPerPhrase;
          const morphElapsed = newState.elapsedTime - prev.morphStartTime;
          newState.morphProgress = Math.min(1, morphElapsed / morphDuration);
          
          // Check if morph is complete
          if (newState.morphProgress >= 1) {
            // Morph complete, start playing next node
            const nextNode = currentConfig.nodes.find(n => n.id === prev.nextNodeId);
            
            // Calculate phrase duration for next node with dual mode support
            const minPhrase = nextNode?.phraseLength ?? 4;
            const maxPhrase = nextNode?.phraseLengthMax ?? minPhrase;
            const resolvedPhrase = minPhrase + Math.random() * (maxPhrase - minPhrase);
            
            // Pre-select the next node from the new current node
            const plannedNext = prev.nextNodeId ? selectNextNode(prev.nextNodeId) : null;
            
            newState.phase = 'playing';
            newState.currentNodeId = prev.nextNodeId;
            newState.nextNodeId = null;
            newState.plannedNextNodeId = plannedNext;
            newState.morphProgress = 0;
            newState.phraseProgress = 0;
            newState.phraseStartTime = newState.elapsedTime;
            newState.resolvedPhraseDuration = resolvedPhrase;
          }
        }
      } else if (prev.phase === 'ending') {
        // Update fadeout progress (same timing as morph)
        // Use resolved duration (already randomized when phase started)
        const fadeoutDuration = prev.resolvedMorphDuration * msPerPhrase;
        const fadeoutElapsed = newState.elapsedTime - prev.morphStartTime;
        newState.morphProgress = Math.min(1, fadeoutElapsed / fadeoutDuration);
        
        // Check if fadeout is complete
        if (newState.morphProgress >= 1) {
          // Fadeout complete - journey ends
          newState.phase = 'ended';
          newState.currentNodeId = null;
          newState.nextNodeId = null;
          newState.plannedNextNodeId = null;
          newState.morphProgress = 0;
          newState.phraseProgress = 0;
          shouldContinue = false;
        }
      }
      
      return newState;
    });
    
    // Continue animation loop only if still playing
    if (shouldContinue) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      animationRef.current = null;
    }
  }, [msPerPhrase, selectNextNode]); // Uses refs to avoid stale closures
  
  /**
   * Start journey playback
   */
  const play = useCallback(() => {
    if (!config || config.nodes.length === 0) return;
    
    // Find the center node
    const centerNode = config.nodes.find(n => n.position === 'center');
    
    // Find connections FROM the center (START connections)
    let startConnections: typeof config.connections = [];
    if (centerNode) {
      startConnections = config.connections.filter(c => c.fromNodeId === centerNode.id);
    }
    
    // Determine which node to start with
    let firstNode: typeof config.nodes[0] | undefined;
    
    if (startConnections.length > 0) {
      // Pick a start connection based on probability (or random if multiple)
      // For now, pick randomly weighted by probability
      const totalProb = startConnections.reduce((sum, c) => sum + c.probability, 0);
      let roll = Math.random() * totalProb;
      for (const conn of startConnections) {
        roll -= conn.probability;
        if (roll <= 0) {
          firstNode = config.nodes.find(n => n.id === conn.toNodeId);
          break;
        }
      }
      // Fallback to first connection if loop didn't find one
      if (!firstNode) {
        firstNode = config.nodes.find(n => n.id === startConnections[0].toNodeId);
      }
    }
    
    // Fallback: pick first preset node (not center, not empty)
    if (!firstNode) {
      firstNode = config.nodes.find(n => 
        n.position !== 'center' && 
        n.presetId && 
        n.presetId !== '__CENTER__'
      );
    }
    
    if (!firstNode) {
      console.warn('No valid start node found');
      return;
    }
    
    const firstNodeId = firstNode.id;
    
    // Load first preset
    if (onLoadPresetRef.current) {
      onLoadPresetRef.current(firstNode.presetName);
    }
    
    // Calculate initial phrase duration (with dual mode support)
    const minPhrase = firstNode.phraseLength;
    const maxPhrase = firstNode.phraseLengthMax ?? minPhrase;
    const initialPhraseDuration = minPhrase + Math.random() * (maxPhrase - minPhrase);
    
    // Pre-select the next node so the tracker can show it
    const plannedNext = selectNextNode(firstNodeId);
    
    // Reset state and start playing
    setState({
      phase: 'playing',
      currentNodeId: firstNodeId,
      nextNodeId: null,
      plannedNextNodeId: plannedNext,
      morphProgress: 0,
      phraseProgress: 0,
      elapsedTime: 0,
      phraseStartTime: 0,
      morphStartTime: 0,
      resolvedPhraseDuration: initialPhraseDuration,
      resolvedMorphDuration: 0,
    });
    
    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);
  }, [config, animate]); // Uses onLoadPresetRef to avoid stale closures
  
  /**
   * Stop journey playback
   */
  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      phase: 'idle',
    }));
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  // ========================================================================
  // SIMULATION (for demo/testing)
  // ========================================================================
  
  const simulatePhraseProgress = useCallback((progress: number) => {
    setState(prev => ({ ...prev, phraseProgress: Math.max(0, Math.min(1, progress)) }));
  }, []);
  
  const simulateMorphProgress = useCallback((progress: number) => {
    setState(prev => ({ ...prev, morphProgress: Math.max(0, Math.min(1, progress)) }));
  }, []);
  
  const simulateNextPhase = useCallback(() => {
    setState(prev => {
      if (!config) return prev;
      
      if (prev.phase === 'idle') {
        return {
          ...prev,
          phase: 'playing',
          currentNodeId: config.nodes[0]?.id || null,
          phraseProgress: 0,
        };
      }
      
      if (prev.phase === 'playing') {
        const nextId = selectNextNode(prev.currentNodeId!);
        return {
          ...prev,
          phase: 'morphing',
          nextNodeId: nextId,
          morphProgress: 0,
        };
      }
      
      if (prev.phase === 'morphing') {
        return {
          ...prev,
          phase: 'playing',
          currentNodeId: prev.nextNodeId,
          nextNodeId: null,
          morphProgress: 0,
          phraseProgress: 0,
        };
      }
      
      return prev;
    });
  }, [config, selectNextNode]);
  
  return {
    config,
    state,
    setConfig,
    createFromMorph,
    createEmptyDiamond,
    addNode,
    addNodeAtPosition,
    removeNode,
    updateNode,
    addConnection,
    removeConnection,
    updateConnection,
    play,
    stop,
    simulatePhraseProgress,
    simulateMorphProgress,
    simulateNextPhase,
  };
}
