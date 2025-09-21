import { GameState } from '@gin-rummy/common';

export interface GameStreamEvent {
  type: 'game_state_updated' | 'player_state_updated' | 'player_joined' | 'player_left' | 'move_made' | 'turn_changed' | 'game_ended' | 'opponent_thinking' | 'game_connected' | 'ping';
  gameId?: string;
  data?: any;
  message?: string;
}

export interface GameStreamListener {
  (event: GameStreamEvent): void;
}

/**
 * Game Streaming Service - Real-time game updates via Server-Sent Events (SSE)
 */
export class GameStreamingService {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: GameStreamListener[] = [];
  private currentGameId: string | null = null;

  /**
   * Connect to game streaming service
   */
  connect(token: string, gameId?: string) {
    console.log('🎮 [STREAMING] Connecting to game streaming service');
    this.currentGameId = gameId || null;
    
    try {
      // Close existing connection
      this.disconnect();

      // Create new EventSource connection
      const streamUrl = `/api/games/stream?token=${encodeURIComponent(token)}`;
      this.eventSource = new EventSource(streamUrl);

      // Handle connection opened
      this.eventSource.onopen = () => {
        console.log('🎮 [STREAMING] Game streaming connection established');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };

      // Handle incoming messages
      this.eventSource.onmessage = (event) => {
        try {
          const gameEvent: GameStreamEvent = JSON.parse(event.data);
          console.log('🎮 [STREAMING] Received game event:', gameEvent);
          this.handleGameEvent(gameEvent);
        } catch (error) {
          console.error('🎮 [STREAMING] Failed to parse game event:', error);
        }
      };

      // Handle connection errors
      this.eventSource.onerror = (error) => {
        console.error('🎮 [STREAMING] Connection error:', error);
        this.handleConnectionError();
      };

    } catch (error) {
      console.error('🎮 [STREAMING] Failed to connect:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Disconnect from game streaming service
   */
  disconnect() {
    if (this.eventSource) {
      console.log('🎮 [STREAMING] Disconnecting from game streaming service');
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
    this.currentGameId = null;
  }

  /**
   * Set current game ID for filtering events
   */
  setCurrentGame(gameId: string | null) {
    this.currentGameId = gameId;
    console.log('🎮 [STREAMING] Current game set to:', gameId);
  }

  /**
   * Handle incoming game events
   */
  private handleGameEvent(event: GameStreamEvent) {
    // Filter events by current game (if set)
    if (this.currentGameId && event.gameId && event.gameId !== this.currentGameId) {
      console.log('🎮 [STREAMING] Ignoring event for different game:', event.gameId, 'vs', this.currentGameId);
      return;
    }

    // Skip ping events
    if (event.type === 'ping' || event.type === 'game_connected') {
      return;
    }

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('🎮 [STREAMING] Error in event listener:', error);
      }
    });
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  private handleConnectionError() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('🎮 [STREAMING] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🎮 [STREAMING] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);

    setTimeout(() => {
      if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
        // Get fresh token and reconnect
        const token = localStorage.getItem('accessToken');
        if (token) {
          console.log('🎮 [STREAMING] Reconnecting with fresh token');
          this.connect(token, this.currentGameId || undefined);
        } else {
          console.log('🎮 [STREAMING] No token available for reconnection');
        }
      }
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  /**
   * Add event listener
   */
  addListener(listener: GameStreamListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if streaming is connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Create singleton instance
export const gameStreamingService = new GameStreamingService();
