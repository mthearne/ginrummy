import { EventStore, GameEventData } from './eventStore';
import { EventSourcingEngine } from '../../packages/common/src/game-engine/event-sourcing';
import { GameState } from '../../packages/common/src/types/game';
import { GameEvent } from '../../packages/common/src/types/events';

/**
 * Replay Service - Rebuilds game state from event stream
 * 
 * Handles:
 * - Full game state reconstruction from events
 * - Incremental state updates from tail events  
 * - Integration with existing EventSourcingEngine
 * - Future: Snapshot-based optimization
 */

export interface ReplayResult {
  state: GameState;
  version: number;
}

export class ReplayService {
  /**
   * Clone an existing state and apply player filtering without replaying events
   */
  static filterStateForPlayer(state: GameState, playerId: string, isSpectator: boolean = false): GameState {
    const clonedState: GameState = JSON.parse(JSON.stringify(state));

    if (isSpectator) {
      return this.applySpectatorFilter(clonedState);
    }

    return this.applyPlayerFilter(clonedState, playerId);
  }

  /**
   * Rebuild complete game state from event stream
   * 
   * @param gameId - Game to rebuild
   * @param upToVersion - Optional version limit (for point-in-time reconstruction)
   * @returns Current game state and version
   */
  static async rebuildState(gameId: string, upToVersion?: number): Promise<ReplayResult> {
    console.log(`🔄 ReplayService: Rebuilding state for game ${gameId}${upToVersion ? ` up to version ${upToVersion}` : ''}`);

    try {
      const latestSnapshot = await EventStore.getLatestSnapshot(gameId);
      let baseState: GameState | undefined;
      let startingVersion = 0;

      if (latestSnapshot && (!upToVersion || latestSnapshot.sequenceNumber <= upToVersion)) {
        baseState = latestSnapshot.state;
        startingVersion = latestSnapshot.sequenceNumber;
        console.log(`📸 ReplayService: Using snapshot at version ${startingVersion} for game ${gameId}`);
      }

      const events = upToVersion
        ? await EventStore.getEventsRange(gameId, startingVersion, upToVersion)
        : await EventStore.getEventsSince(gameId, startingVersion);

      if (!baseState && events.length === 0) {
        throw new Error(`No events found for game ${gameId}`);
      }

      console.log(`📚 ReplayService: Loaded ${events.length} events after version ${startingVersion}`);

      // Convert our EventStore format to the format expected by EventSourcingEngine
      const gameEvents: GameEvent[] = events.map(event => ({
        id: event.id,
        gameId: event.gameId,
        playerId: event.playerId || undefined, // Convert null to undefined
        eventType: event.eventType as any, // EventType enum
        sequenceNumber: event.sequenceNumber,
        eventVersion: 1,
        eventData: event.eventData,
        metadata: event.metadata || {},
        processed: true,
        processedAt: event.createdAt.toISOString(),
        createdAt: event.createdAt.toISOString()
      }));

      // Use existing event sourcing engine to rebuild state
      const engine = new EventSourcingEngine(gameId, gameEvents, baseState, startingVersion);
      const finalState = engine.replayEvents();
      
      const finalVersion = events.length > 0
        ? events[events.length - 1].sequenceNumber
        : startingVersion;

      console.log(`✅ ReplayService: Rebuilt state for game ${gameId} to version ${finalVersion}`);
      console.log(`🎯 ReplayService: Final state - Phase: ${finalState.phase}, Players: ${finalState.players.length}`);

      return {
        state: finalState,
        version: finalVersion
      };

    } catch (error) {
      console.error(`💥 ReplayService: Failed to rebuild state for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Apply tail events to existing state (incremental update)
   * 
   * @param gameId - Game identifier
   * @param baseState - Starting state
   * @param fromVersion - Version to start applying from
   * @returns Updated state and version
   */
  static async rebuildFromTail(
    gameId: string, 
    baseState: GameState, 
    fromVersion: number
  ): Promise<ReplayResult> {
    console.log(`🔄 ReplayService: Applying tail events for game ${gameId} from version ${fromVersion}`);

    try {
      // Get only the new events since fromVersion
      const tailEvents = await EventStore.getEventsSince(gameId, fromVersion);
      
      if (tailEvents.length === 0) {
        console.log(`📭 ReplayService: No new events to apply for game ${gameId}`);
        return {
          state: baseState,
          version: fromVersion
        };
      }

      console.log(`📬 ReplayService: Applying ${tailEvents.length} tail events`);

      // Convert to EventSourcingEngine format
      const gameEvents: GameEvent[] = tailEvents.map(event => ({
        id: event.id,
        gameId: event.gameId,
        playerId: event.playerId || undefined, // Convert null to undefined
        eventType: event.eventType as any,
        sequenceNumber: event.sequenceNumber,
        eventVersion: 1,
        eventData: event.eventData,
        metadata: event.metadata || {},
        processed: true,
        processedAt: event.createdAt.toISOString(),
        createdAt: event.createdAt.toISOString()
      }));

      // Apply tail events to base state  
      const engine = new EventSourcingEngine(gameId, gameEvents, baseState, fromVersion);
      const updatedState = engine.replayEvents();
      
      const finalVersion = Math.max(...tailEvents.map(e => e.sequenceNumber));

      console.log(`✅ ReplayService: Applied tail events, now at version ${finalVersion}`);

      return {
        state: updatedState,
        version: finalVersion
      };

    } catch (error) {
      console.error(`💥 ReplayService: Failed to apply tail events for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Rebuild state with player filtering (hide opponent's cards)
   * 
   * @param gameId - Game identifier
   * @param viewerId - Player who is viewing (to filter hidden information)
   * @param isSpectator - True if viewer is a spectator (hide all player hands)
   * @param upToVersion - Optional version limit
   * @returns Player-filtered game state
   */
  static async rebuildFilteredState(
    gameId: string, 
    viewerId: string,
    isSpectator: boolean = false,
    upToVersion?: number
  ): Promise<ReplayResult> {
    console.log(`👁️ ReplayService: Rebuilding filtered state for viewer ${viewerId}`);

    // First rebuild the complete state
    const result = await this.rebuildState(gameId, upToVersion);
    
    // Apply player filtering to hide opponent's cards (or all cards for spectators)
    const filteredState = isSpectator 
      ? this.applySpectatorFilter(result.state)
      : this.applyPlayerFilter(result.state, viewerId);
    
    return {
      state: filteredState,
      version: result.version
    };
  }

  /**
   * Apply player filtering to hide opponent's private information
   * 
   * @param state - Complete game state
   * @param viewerId - Player viewing the state
   * @returns Filtered state with hidden opponent information
   */
  private static applyPlayerFilter(state: GameState, viewerId: string): GameState {
    // Create a deep copy to avoid mutating original state
    const filteredState = JSON.parse(JSON.stringify(state));
    
    // Find the viewer and opponent
    const viewer = filteredState.players.find((p: any) => p.id === viewerId);
    const opponent = filteredState.players.find((p: any) => p.id !== viewerId);
    
    if (!viewer || !opponent) {
      console.warn(`⚠️ ReplayService: Could not identify viewer/opponent for filtering`);
      return filteredState;
    }

    // Hide opponent's hand (keep count but not actual cards)
    if (opponent.hand && opponent.hand.length > 0) {
      const handSize = opponent.hand.length;
      opponent.hand = Array(handSize).fill({ 
        id: 'hidden',
        rank: '?', 
        suit: '?',
        isHidden: true 
      });
      opponent.handSize = handSize;
      
      console.log(`🙈 ReplayService: Filtered opponent hand - showing ${handSize} hidden cards`);
    }

    // During layoff, round-over, or game-over phase, opponent cards should be visible
    if (state.phase === 'layoff' || state.phase === 'round_over' || state.phase === 'game_over') {
      console.log(`👀 ReplayService: ${state.phase} phase - keeping opponent cards visible`);
      return state; // Return unfiltered state
    }

    console.log(`✅ ReplayService: Applied player filtering for viewer ${viewerId}`);
    return filteredState;
  }

  /**
   * Apply spectator filtering to hide all player hands
   * 
   * @param state - Complete game state
   * @returns Filtered state with all player hands hidden
   */
  private static applySpectatorFilter(state: GameState): GameState {
    // Create a deep copy to avoid mutating original state
    const filteredState = JSON.parse(JSON.stringify(state));
    
    // Hide all player hands for spectators
    filteredState.players.forEach((player: any) => {
      if (player.hand && player.hand.length > 0) {
        const handSize = player.hand.length;
        player.hand = Array(handSize).fill({ 
          id: 'hidden',
          rank: '?', 
          suit: '?',
          isHidden: true
        });
        // Keep hand size for display purposes
        player.handSize = handSize;
      }
    });

    console.log(`👁️ ReplayService: Applied spectator filtering - all hands hidden`);
    return filteredState;
  }

  /**
   * Validate event stream integrity (for debugging/testing)
   * 
   * @param gameId - Game to validate
   * @returns True if stream is valid
   */
  static async validateEventStream(gameId: string): Promise<boolean> {
    console.log(`🔍 ReplayService: Validating event stream for game ${gameId}`);

    try {
      const events = await EventStore.getAllEvents(gameId);
      
      // Check sequence numbers are consecutive
      for (let i = 0; i < events.length; i++) {
        const expectedSequence = i + 1;
        if (events[i].sequenceNumber !== expectedSequence) {
          console.error(`❌ ReplayService: Gap in sequence - expected ${expectedSequence}, got ${events[i].sequenceNumber}`);
          return false;
        }
      }

      // Check timestamps are increasing
      for (let i = 1; i < events.length; i++) {
        if (events[i].createdAt < events[i-1].createdAt) {
          console.error(`❌ ReplayService: Timestamp ordering violation at sequence ${events[i].sequenceNumber}`);
          return false;
        }
      }

      console.log(`✅ ReplayService: Event stream is valid - ${events.length} events in correct order`);
      return true;

    } catch (error) {
      console.error(`💥 ReplayService: Validation failed:`, error);
      return false;
    }
  }
}
