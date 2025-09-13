import { GameMove } from '@gin-rummy/common';
import { useGameStore } from '../store/game';
import { useAuthStore } from '../store/auth';
import { api, gamesAPI } from './api';
import { gameStreamingService, GameStreamEvent } from './gameStreaming';

/**
 * Simplified Socket Service - REST API Only
 * 
 * This removes Socket.IO dependency while maintaining the same API surface.
 * All functionality is handled via REST API calls.
 */
class SocketService {
  private connected: boolean = false;
  private refreshInterval: NodeJS.Timeout | null = null;
  private currentGameId: string | null = null;
  private gameStreamListener: (() => void) | null = null;

  connect(token: string) {
    console.log('Socket service initialized - Real-time streaming mode');
    this.connected = true;
    useGameStore.getState().setConnected(true);
    
    // Connect to game streaming service
    gameStreamingService.connect(token, this.currentGameId || undefined);
    
    // Set up game streaming listener
    this.gameStreamListener = gameStreamingService.addListener(this.handleGameStreamEvent.bind(this));
    
    // Set up periodic reconnection check (fallback for when streaming fails)
    this.setupPeriodicReconnection();
    
    return null; // No actual socket connection
  }
  
  private setupPeriodicReconnection() {
    // Check streaming connection every 30 seconds and reconnect if needed
    setInterval(() => {
      if (this.connected && this.currentGameId && !gameStreamingService.isConnected()) {
        console.log('🎮 Socket: Streaming connection lost, attempting reconnection');
        const token = localStorage.getItem('accessToken');
        if (token) {
          gameStreamingService.connect(token, this.currentGameId);
        }
      }
    }, 30000);
  }

  disconnect() {
    console.log('Socket service disconnected');
    this.connected = false;
    useGameStore.getState().setConnected(false);
    
    // Disconnect game streaming service
    gameStreamingService.disconnect();
    
    // Remove streaming listener
    if (this.gameStreamListener) {
      this.gameStreamListener();
      this.gameStreamListener = null;
    }
    
    // Clear periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Game actions - all via REST API
  joinGame(gameId: string) {
    console.log(`Joining game: ${gameId}`);
    this.currentGameId = gameId;
    
    // Set current game for streaming service
    gameStreamingService.setCurrentGame(gameId);
    
    this.joinGameViaAPI(gameId);
    
    // Set up periodic refresh as backup for when streaming fails
    this.setupPeriodicRefresh(gameId);
  }
  
  private setupPeriodicRefresh(gameId: string) {
    // Clear existing refresh interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Refresh game state every 15 seconds as backup
    this.refreshInterval = setInterval(() => {
      if (this.currentGameId === gameId) {
        console.log('🔄 Periodic refresh: Checking for game updates');
        this.joinGameViaAPI(gameId);
      }
    }, 15000);
  }

  // REST API for joining games
  private async joinGameViaAPI(gameId: string) {
    try {
      const response = await gamesAPI.getGameState(gameId);
      const data = response.data;
      
      // Guard against cross-game writes
      const currentGameId = useGameStore.getState().currentGameId;
      if (currentGameId !== gameId) {
        console.warn('joinGame response ignored for non-current game:', { 
          responseId: data?.state?.id || data?.waitingState?.gameId, 
          expected: currentGameId,
          received: gameId
        });
        return;
      }
      
      console.log('📊 Socket: Received game state with streamVersion:', data.streamVersion);
      
      if (data.state) {
        const gameStore = useGameStore.getState();
        const currentUserId = useAuthStore.getState().user?.id;
        
        // Check if AI thinking should be cleared (AI move completed)
        console.log('🔍 AI Detection Debug:', {
          isAIThinking: gameStore.isAIThinking,
          currentUserId,
          gameCurrentPlayerId: data.state.currentPlayerId,
          aiMoveCompleted: gameStore.isAIThinking && currentUserId && data.state.currentPlayerId === currentUserId
        });
        
        if (gameStore.isAIThinking && currentUserId && data.state.currentPlayerId === currentUserId) {
          console.log('🤖 AI move completed - clearing thinking state');
          gameStore.setAIThinking(false, []);
        }
        
        useGameStore.getState().setGameState(data.state, data.streamVersion);
        useGameStore.getState().setConnected(true);
        console.log('Game state loaded via REST API:', data.state, 'at version', data.streamVersion);
        
        // Update turn history if provided
        if (data.currentRoundTurnHistory && Array.isArray(data.currentRoundTurnHistory)) {
          console.log('📝 Socket: Updating turn history from state load:', data.currentRoundTurnHistory.length, 'entries');
          useGameStore.getState().setTurnHistory(data.currentRoundTurnHistory);
        }
      } else if (data.waitingState) {
        useGameStore.getState().setWaitingState(data.waitingState);
        useGameStore.getState().setConnected(true);
        console.log('Waiting state loaded via REST API:', data.waitingState);
      }

    } catch (error) {
      console.error('Failed to load game state via API:', error);
      useGameStore.getState().setGameError('Failed to load game');
    }
  }

  leaveGame(gameId: string) {
    console.log(`Leaving game: ${gameId}`);
    this.currentGameId = null;
    
    // Clear periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  makeMove(move: GameMove) {
    // Prevent double-moves & race conditions
    const { isSubmittingMove, setIsSubmittingMove } = useGameStore.getState();
    if (isSubmittingMove) {
      console.log('Move ignored: already submitting move');
      return; // Drop rapid double-clicks
    }
    
    console.log('Making move via REST API:', move);
    this.makeMoveViaAPI(move);
  }

  // REST API for making moves
  private async makeMoveViaAPI(move: GameMove) {
    const { setIsSubmittingMove, getCurrentStreamVersion, generateRequestId } = useGameStore.getState();
    setIsSubmittingMove(true);
    
    try {
      // Generate requestId for idempotency and get current stream version for concurrency control
      const requestId = generateRequestId();
      const expectedVersion = getCurrentStreamVersion();
      
      console.log('Making move via REST API:', move, {
        requestId,
        expectedVersion
      });
      
      const currentGameState = useGameStore.getState().gameState;
      if (currentGameState) {
        console.log('Frontend game state before move - Phase:', currentGameState.phase, 'Current player:', currentGameState.currentPlayerId);
      }

      const response = await gamesAPI.makeMove(move.gameId!, move, requestId, expectedVersion);
      const data = response.data;
      
      // Guard against cross-game writes
      const currentGameId = useGameStore.getState().currentGameId;
      if (currentGameId !== move.gameId) {
        console.warn('makeMove state ignored for non-current game:', { 
          received: data?.gameState?.id, 
          expected: currentGameId,
          moveGameId: move.gameId
        });
        return;
      }
      
      if (data.gameState) {
        console.log('Move successful, received state from backend:', {
          phase: data.gameState.phase,
          currentPlayerId: data.gameState.currentPlayerId,
          gameId: data.gameState.id,
          streamVersion: data.streamVersion
        });
        
        // Update stream version first
        if (data.streamVersion) {
          useGameStore.getState().setStreamVersion(data.streamVersion);
        }
        
        // Add turn history entry if provided
        if (data.turnHistoryEntry) {
          console.log('🔍 Socket: Adding human turn history entry:', data.turnHistoryEntry);
          
          // Fix turn number based on current history length
          const gameStore = useGameStore.getState();
          const correctedEntry = {
            ...data.turnHistoryEntry,
            turnNumber: gameStore.turnHistory.length + 1
          };
          console.log('🔍 Socket: Corrected turn number from', data.turnHistoryEntry.turnNumber, 'to', correctedEntry.turnNumber);
          
          gameStore.addTurnHistoryEntry(correctedEntry);
        } else {
          console.log('🔍 Socket: No turn history entry found in move response:', data);
        }
        
        // Handle AI thinking if needed
        console.log('🔍 AI Trigger Debug:', {
          debugExists: !!data.debug,
          aiShouldThink: data.debug?.aiShouldThink,
          hasGameId: !!move.gameId,
          willTriggerAI: !!(data.debug?.aiShouldThink && move.gameId)
        });
        
        if (data.debug?.aiShouldThink && move.gameId) {
          console.log('🤖 AI should think - backend will handle automatically via AI Queue Processor');
          console.log('🤖 Current game state before AI thinking:', {
            phase: data.gameState.phase,
            currentPlayerId: data.gameState.currentPlayerId,
            gameId: data.gameState.id
          });
          
          // Use AI thoughts from response if available, otherwise use default
          const aiThoughts = data.aiThoughts || ['Thinking...', 'Analyzing the situation...'];
          console.log('🤖 AI thoughts:', aiThoughts);
          
          // Show AI thinking immediately with thoughts
          useGameStore.getState().setAIThinking(true, aiThoughts);
          
          // Clear AI thinking after a reasonable delay (AI should complete within ~10 seconds)
          setTimeout(() => {
            console.log('🤖 AI thinking timeout - clearing thinking state and refreshing');
            useGameStore.getState().setAIThinking(false, []);
            // Refresh game state to get the AI's completed move
            this.joinGameViaAPI(move.gameId!);
          }, 10000);
        } else {
          console.log('🔍 AI polling NOT started - conditions not met');
        }
        
        if (data.debug) {
          console.log('🤖 AI Processing Debug:', data.debug);
        }
        
        useGameStore.getState().setGameState(data.gameState);
        console.log('Move completed. Current player:', data.gameState.currentPlayerId, 'Phase:', data.gameState.phase);
        
        // Immediate fresh state reload for consistency
        setTimeout(() => {
          console.log('🔄 Post-move refresh: Loading fresh state from event-sourced backend');
          this.joinGameViaAPI(move.gameId!);
        }, 500);
        
        // REMOVED: Frontend AI trigger backup for debugging
        // Let's rely entirely on backend to identify any remaining issues
        console.log('🔍 Frontend AI trigger backup DISABLED - backend-only mode for debugging');
        
        const isAIGame = data.gameState.vsAI;
        const currentUserId = useAuthStore.getState().user?.id;
        const aiPlayer = data.gameState.players?.find(p => p.id !== currentUserId);
        const isAITurn = isAIGame && currentUserId && aiPlayer && data.gameState.currentPlayerId === aiPlayer.id;
        
        console.log('🔍 AI Turn Detection Debug (backend-only mode):', {
          isAIGame,
          currentUserId,
          gameCurrentPlayerId: data.gameState.currentPlayerId,
          aiPlayerId: aiPlayer?.id,
          phase: data.gameState.phase,
          isAITurn,
          backendShouldHandle: data.debug?.aiShouldThink,
          moveType: move.type,
          note: 'Frontend backup disabled - backend must handle AI'
        });
        
        if (isAITurn && !data.debug?.aiShouldThink) {
          console.warn('⚠️ POTENTIAL ISSUE: AI turn detected but backend did not set aiShouldThink=true');
          console.warn('⚠️ This would normally be handled by frontend backup, but backup is disabled for debugging');
          console.warn('⚠️ AI may not move - this indicates a backend logic issue');
        }
      }

    } catch (error) {
      console.error('Failed to make move via API:', error);
      
      // Handle version conflict errors (409)
      if (error.response?.data?.code === 'VERSION_CONFLICT') {
        console.log('🔄 Version conflict detected - refreshing game state');
        const serverVersion = error.response.data.serverVersion;
        const clientVersion = error.response.data.clientVersion;
        
        console.log(`📊 Version mismatch - client: ${clientVersion}, server: ${serverVersion}`);
        
        // Update to server version and refresh game state
        if (typeof serverVersion === 'number') {
          useGameStore.getState().setStreamVersion(serverVersion);
        }
        
        // Refresh game state from server
        this.joinGameViaAPI(move.gameId!);
        
        useGameStore.getState().setGameError('Game state has changed. Please try your move again.');
        return;
      }
      
      // Handle duplicate request errors (409)
      if (error.response?.data?.code === 'DUPLICATE_REQUEST') {
        console.log('🔄 Duplicate request detected - refreshing game state');
        this.joinGameViaAPI(move.gameId!);
        return; // Don't show error for duplicate requests
      }
      
      // Handle specific game state errors
      if (error.response?.data?.code === 'GAME_STATE_LOST') {
        useGameStore.getState().setGameError(error.response.data.error);
        return;
      }
      
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      useGameStore.getState().setGameError('Failed to make move: ' + errorMessage);
    } finally {
      setIsSubmittingMove(false);
    }
  }

  sendChatMessage(gameId: string, message: string) {
    console.log(`Chat message not implemented: ${message}`);
    // Could implement via REST API if needed
  }

  // AI moves are now handled automatically by the backend AI Queue Processor
  // Frontend gets updates via periodic state refresh

  // Connection status
  isConnected(): boolean {
    return this.connected;
  }

  // AI moves are now handled with simple timeout approach

  // Handle real-time game streaming events
  private handleGameStreamEvent(event: GameStreamEvent) {
    console.log('🎮 Socket: Received game streaming event:', event);
    
    const gameStore = useGameStore.getState();
    const currentUserId = useAuthStore.getState().user?.id;
    
    switch (event.type) {
      case 'game_state_updated':
        console.log('🎮 Socket: Game state updated via stream - refreshing full state');
        // Refresh full game state from server to ensure consistency
        if (this.currentGameId) {
          this.joinGameViaAPI(this.currentGameId);
        }
        break;
        
      case 'player_joined':
        console.log('🎮 Socket: Player joined via stream:', event.data?.player?.username);
        // Game state will be updated by game_state_updated event
        break;
        
      case 'player_left':
        console.log('🎮 Socket: Player left via stream:', event.data?.player?.username);
        break;
        
      case 'move_made':
        console.log('🎮 Socket: Move made via stream:', event.data?.moveType, 'by', event.data?.username);
        
        // Clear AI thinking state if it was the AI that moved
        if (gameStore.isAIThinking) {
          const gameState = gameStore.gameState;
          if (gameState && currentUserId && gameState.currentPlayerId === currentUserId) {
            console.log('🤖 AI move completed via stream - clearing thinking state');
            gameStore.setAIThinking(false, []);
          }
        }
        
        // Refresh game state to show the move
        console.log('🎮 Socket: Refreshing game state after move via stream');
        if (this.currentGameId) {
          this.joinGameViaAPI(this.currentGameId);
        }
        break;
        
      case 'turn_changed':
        console.log('🎮 Socket: Turn changed via stream to:', event.data?.currentPlayer?.username);
        break;
        
      case 'game_ended':
        console.log('🎮 Socket: Game ended via stream:', event.data?.winner?.username, 'wins');
        break;
        
      case 'opponent_thinking':
        if (event.data?.aiThoughts && currentUserId && event.gameId === this.currentGameId) {
          console.log('🤖 Opponent thinking via stream');
          // This would typically be used for showing opponent AI thinking state
          // For now, we'll just log it
        }
        break;
    }
  }

  // Compatibility methods (no-ops)
  getSocket() {
    return null;
  }
}

// Create singleton instance
export const socketService = new SocketService();

// Hook for using socket in components
export const useSocket = () => {
  return socketService;
};