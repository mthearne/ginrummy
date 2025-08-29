import { GameMove } from '@gin-rummy/common';
import { useGameStore } from '../store/game';

/**
 * Simplified Socket Service - REST API Only
 * 
 * This removes Socket.IO dependency while maintaining the same API surface.
 * All functionality is handled via REST API calls.
 */
class SocketService {
  private connected: boolean = false;

  connect(token: string) {
    console.log('Socket service initialized - REST API only mode');
    this.connected = true;
    useGameStore.getState().setConnected(true);
    return null; // No actual socket connection
  }

  disconnect() {
    console.log('Socket service disconnected');
    this.connected = false;
    useGameStore.getState().setConnected(false);
  }

  // Game actions - all via REST API
  joinGame(gameId: string) {
    console.log(`Joining game: ${gameId}`);
    this.joinGameViaAPI(gameId);
  }

  // REST API for joining games
  private async joinGameViaAPI(gameId: string) {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('No access token found');
        return;
      }

      const response = await fetch(`/api/games/${gameId}/state`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.gameState) {
        useGameStore.getState().setGameState(data.gameState);
        useGameStore.getState().setConnected(true);
        console.log('Game state loaded via REST API:', data.gameState);
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
    // Could implement via REST API if needed
  }

  makeMove(move: GameMove) {
    console.log('Making move via REST API:', move);
    this.makeMoveViaAPI(move);
  }

  // REST API for making moves
  private async makeMoveViaAPI(move: GameMove) {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('No access token found');
        return;
      }

      console.log('Making move via REST API:', move);
      
      const currentGameState = useGameStore.getState().gameState;
      if (currentGameState) {
        console.log('Frontend game state before move - Phase:', currentGameState.phase, 'Current player:', currentGameState.currentPlayerId);
      }

      const response = await fetch(`/api/games/${move.gameId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(move)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.code === 'GAME_STATE_LOST') {
          useGameStore.getState().setGameError(errorData.error);
          return;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (data.gameState) {
        console.log('Move successful, received state from backend:', {
          phase: data.gameState.phase,
          currentPlayerId: data.gameState.currentPlayerId,
          gameId: data.gameState.id
        });
        
        // Add turn history entry if provided
        if (data.turnHistoryEntry) {
          console.log('🔍 Socket: Adding human turn history entry:', data.turnHistoryEntry);
          useGameStore.getState().addTurnHistoryEntry(data.turnHistoryEntry);
        } else {
          console.log('🔍 Socket: No turn history entry found in move response:', data);
        }
        
        // Handle AI thinking if needed
        if (data.debug?.aiShouldThink && move.gameId) {
          console.log('🤖 AI should think, starting thinking process');
          this.handleAIThinking(move.gameId);
        }
        
        if (data.debug) {
          console.log('🤖 AI Processing Debug:', data.debug);
        }
        
        useGameStore.getState().setGameState(data.gameState);
        console.log('Move completed. Current player:', data.gameState.currentPlayerId, 'Phase:', data.gameState.phase);
        
        // If it's now AI's turn, wait a bit then refresh to see AI moves
        const isAIGame = data.gameState.vsAI;
        const currentUserId = localStorage.getItem('userId'); // Assuming this exists
        const isAITurn = isAIGame && data.gameState.currentPlayerId !== currentUserId;
        
        if (isAITurn) {
          console.log('🤖 AI turn detected, triggering AI thinking process to capture turn history');
          // Trigger AI thinking process to capture turn history entries
          this.handleAIThinking(move.gameId!);
        }
      }

    } catch (error) {
      console.error('Failed to make move via API:', error);
      useGameStore.getState().setGameError('Failed to make move: ' + error.message);
    }
  }

  sendChatMessage(gameId: string, message: string) {
    console.log(`Chat message not implemented: ${message}`);
    // Could implement via REST API if needed
  }

  // Handle AI thinking process with visual feedback
  private async handleAIThinking(gameId: string) {
    try {
      console.log('Starting AI thinking process for game:', gameId);
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('No access token for AI thoughts');
        return;
      }

      const thoughtsResponse = await fetch(`/api/games/${gameId}/ai-thoughts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!thoughtsResponse.ok) {
        console.error('Failed to get AI thoughts:', thoughtsResponse.status);
        return;
      }

      const thoughtsData = await thoughtsResponse.json();
      const thoughts = thoughtsData.thoughts || ['Thinking...'];
      
      console.log('AI thoughts:', thoughts);
      useGameStore.getState().setAIThinking(true, thoughts);
      
      const thinkingDelay = Math.random() * 2000 + 2000;
      console.log(`AI will think for ${Math.round(thinkingDelay)}ms`);
      
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));
      
      const aiMoveResponse = await fetch(`/api/games/${gameId}/ai-move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ thoughts })
      });

      if (!aiMoveResponse.ok) {
        console.error('AI move failed:', aiMoveResponse.status);
        useGameStore.getState().setAIThinking(false, []);
        return;
      }

      const aiMoveData = await aiMoveResponse.json();
      console.log('AI move completed:', aiMoveData);
      
      useGameStore.getState().setAIThinking(false, []);
      if (aiMoveData.gameState) {
        useGameStore.getState().setGameState(aiMoveData.gameState);
      }
      
      // Add AI turn history entries if provided
      if (aiMoveData.aiTurnHistoryEntries && Array.isArray(aiMoveData.aiTurnHistoryEntries)) {
        console.log('🔍 Socket: Adding AI turn history entries:', aiMoveData.aiTurnHistoryEntries);
        aiMoveData.aiTurnHistoryEntries.forEach((entry: any) => {
          console.log('🔍 Socket: Adding AI turn history entry:', entry);
          useGameStore.getState().addTurnHistoryEntry(entry);
        });
      } else {
        console.log('🔍 Socket: No AI turn history entries found in response:', aiMoveData);
      }
      
    } catch (error) {
      console.error('AI thinking process failed:', error);
      useGameStore.getState().setAIThinking(false, []);
    }
  }

  // Connection status
  isConnected(): boolean {
    return this.connected;
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