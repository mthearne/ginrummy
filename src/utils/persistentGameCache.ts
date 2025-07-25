// Database-backed persistent game cache for serverless environments
import { GinRummyGame } from '@gin-rummy/common';
import { prisma } from './database';
import { GameEventsService } from '../services/gameEvents';

export class PersistentGameCache {
  private memoryCache = new Map<string, GinRummyGame>();

  /**
   * Get game engine from cache or database
   */
  async get(gameId: string): Promise<GinRummyGame | null> {
    // First check memory cache
    if (this.memoryCache.has(gameId)) {
      console.log(`Game ${gameId} found in memory cache`);
      return this.memoryCache.get(gameId)!;
    }

    // For completion keys (e.g., "gameId_ai_complete"), only check memory cache
    if (gameId.includes('_ai_complete')) {
      console.log(`Completion flag ${gameId} not found in memory cache`);
      return null;
    }

    // If not in memory, try to load from database
    console.log(`Game ${gameId} not in memory, loading from database`);
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } }
        }
      });

      if (!game) {
        console.log(`Game ${gameId} not found`);
        return null;
      }

      // Check if game state is stored in database
      const gameStateData = (game as any).gameState;
      
      if (gameStateData) {
        // Restore from stored state (preferred path)
        console.log(`Restoring game ${gameId} from stored state`);
        const gameEngine = this.restoreGameFromState(gameId, gameStateData, game);
        this.memoryCache.set(gameId, gameEngine);
        return gameEngine;
      } else {
        // Game exists in database but no gameState yet - initialize from database record
        console.log(`Game ${gameId} found in database but no stored state - initializing from record`);
        const gameEngine = this.initializeGameFromRecord(gameId, game);
        
        // Cache the initialized game and save initial state to database
        this.memoryCache.set(gameId, gameEngine);
        
        // Save initial state to database immediately
        try {
          await this.set(gameId, gameEngine);
          console.log(`Initial game state saved to database for ${gameId}`);
          
          // Log game start event (don't await to avoid blocking)
          GameEventsService.logGameStart(gameId, gameEngine.getState()).catch(error => {
            console.warn(`Failed to log game start for ${gameId}:`, error);
          });
          
        } catch (error) {
          console.warn(`Failed to save initial game state for ${gameId}:`, error);
        }
        
        return gameEngine;
      }
    } catch (error) {
      console.error(`Error loading game ${gameId} from database:`, error);
      return null;
    }
  }

  /**
   * Store game engine in cache and database
   */
  async set(gameId: string, gameEngine: GinRummyGame): Promise<void> {
    // Store in memory cache
    this.memoryCache.set(gameId, gameEngine);
    
    // For completion keys (e.g., "gameId_ai_complete"), only store in memory
    if (gameId.includes('_ai_complete')) {
      console.log(`Stored completion flag ${gameId} in memory cache only`);
      return;
    }
    
    // Store actual games in database (with backwards compatibility)
    try {
      const gameState = gameEngine.getState();
      console.log(`Saving game ${gameId} state to database`);
      
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          gameState: gameState as any,
          status: gameState.gameOver ? 'FINISHED' : 'ACTIVE'
        }
      });
    } catch (error) {
      console.error(`Error saving game ${gameId} to database:`, error);
      // If gameState field doesn't exist, just update status for backwards compatibility
      try {
        const gameState = gameEngine.getState();
        await prisma.game.update({
          where: { id: gameId },
          data: { 
            status: gameState.gameOver ? 'FINISHED' : 'ACTIVE'
          }
        });
        console.log(`Fallback save successful for game ${gameId} (status only)`);
      } catch (fallbackError) {
        console.error(`Fallback save also failed for game ${gameId}:`, fallbackError);
      }
    }
  }

  /**
   * Check if game exists in cache or database
   */
  async has(gameId: string): Promise<boolean> {
    if (this.memoryCache.has(gameId)) {
      return true;
    }

    // For completion keys, only check memory cache
    if (gameId.includes('_ai_complete')) {
      return false;
    }

    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true, vsAI: true }
      });

      return !!game;
    } catch (error) {
      console.error(`Error checking game ${gameId} existence:`, error);
      return false;
    }
  }

  /**
   * Remove game from cache and database
   */
  async delete(gameId: string): Promise<boolean> {
    // Remove from memory
    const wasInMemory = this.memoryCache.delete(gameId);

    // For completion keys (e.g., "gameId_ai_complete"), just remove from memory
    if (gameId.includes('_ai_complete')) {
      console.log(`Removed completion flag ${gameId} from memory cache`);
      return wasInMemory;
    }

    // Clear stored state from database (backwards compatible) for actual game IDs
    try {
      await prisma.game.update({
        where: { id: gameId },
        data: { gameState: null as any }
      });
      return true;
    } catch (error) {
      console.error(`Error clearing game ${gameId} from database:`, error);
      // If gameState field doesn't exist, that's fine - nothing to clear
      return wasInMemory;
    }
  }

  /**
   * Get cache size (memory only)
   */
  size(): number {
    return this.memoryCache.size;
  }

  /**
   * Restore game engine from stored state with proper internal state reconstruction
   */
  private restoreGameFromState(gameId: string, storedState: any, gameRecord: any): GinRummyGame {
    console.log(`Starting proper restoration for game ${gameId}`);
    
    // Create new game engine based on game type
    const gameEngine = gameRecord.vsAI 
      ? new GinRummyGame(gameId, gameRecord.player1Id, 'ai-player', true)
      : new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id, false);
    
    // Get the fresh state for comparison
    const freshState = gameEngine.getState();
    console.log(`Restoring from fresh state with ${freshState.stockPileCount} stock cards`);
    
    try {
      // Restore game state using proper reconstruction instead of Object.assign
      this.reconstructGameState(gameEngine, storedState, gameRecord);
      console.log(`Game state restored successfully for ${gameId}`);
      
      // Validate the restored state
      this.validateRestoredState(gameEngine, storedState);
      console.log(`Game state validation passed for ${gameId}`);
      
    } catch (error) {
      console.error(`Game restoration failed for ${gameId}:`, error);
      // Fall back to Object.assign for backwards compatibility
      console.log(`Falling back to legacy restoration for ${gameId}`);
      const state = gameEngine.getState();
      Object.assign(state, storedState);
      
      // Ensure player names are correct (legacy fallback)
      if (gameRecord.player1) {
        state.players[0].username = gameRecord.player1.username;
      }
      
      if (gameRecord.vsAI) {
        state.players[1].username = 'AI Opponent';
      } else if (gameRecord.player2) {
        state.players[1].username = gameRecord.player2.username;
      }
    }

    return gameEngine;
  }

  /**
   * Properly reconstruct game state with internal consistency
   */
  private reconstructGameState(gameEngine: any, storedState: any, gameRecord: any): void {
    const currentState = gameEngine.getState();
    
    // 1. Restore basic game properties
    currentState.id = storedState.id;
    currentState.status = storedState.status;
    currentState.phase = storedState.phase;
    currentState.currentPlayerId = storedState.currentPlayerId;
    currentState.turnTimer = storedState.turnTimer || 30;
    currentState.isPrivate = storedState.isPrivate || false;
    currentState.vsAI = storedState.vsAI;
    currentState.gameOver = storedState.gameOver || false;
    currentState.winner = storedState.winner;
    currentState.roundScores = storedState.roundScores;

    // 2. Restore players with validation
    if (storedState.players && Array.isArray(storedState.players)) {
      for (let i = 0; i < Math.min(currentState.players.length, storedState.players.length); i++) {
        const player = currentState.players[i];
        const storedPlayer = storedState.players[i];
        
        // Restore player properties
        player.id = storedPlayer.id;
        player.username = storedPlayer.username;
        player.hand = storedPlayer.hand || [];
        player.handSize = storedPlayer.handSize || player.hand.length;
        player.score = storedPlayer.score || 0;
        player.hasKnocked = storedPlayer.hasKnocked || false;
        player.hasGin = storedPlayer.hasGin || false;
        player.deadwood = storedPlayer.deadwood || 0;
        player.melds = storedPlayer.melds || [];
        player.lastDrawnCardId = storedPlayer.lastDrawnCardId;
      }
    }

    // 3. Restore discard pile and stock count
    currentState.discardPile = storedState.discardPile || [];
    currentState.stockPileCount = storedState.stockPileCount || 0;

    // 4. Reconstruct internal deck state
    this.reconstructDeck(gameEngine, currentState);

    // 5. Restore player names from database records
    if (gameRecord.player1 && currentState.players[0]) {
      currentState.players[0].username = gameRecord.player1.username;
    }
    
    if (gameRecord.vsAI && currentState.players[1]) {
      currentState.players[1].username = 'AI Opponent';
    } else if (gameRecord.player2 && currentState.players[1]) {
      currentState.players[1].username = gameRecord.player2.username;
    }

    // 6. Sync internal turn state (if accessible)
    this.syncInternalTurnState(gameEngine, currentState);
  }

  /**
   * Reconstruct the internal deck based on game state
   */
  private reconstructDeck(gameEngine: any, gameState: any): void {
    try {
      // Get all cards that should be in hands and discard pile
      const usedCards = new Set<string>();
      
      // Add cards from player hands
      for (const player of gameState.players) {
        if (player.hand && Array.isArray(player.hand)) {
          for (const card of player.hand) {
            usedCards.add(`${card.suit}-${card.rank}`);
          }
        }
      }
      
      // Add cards from discard pile
      if (gameState.discardPile && Array.isArray(gameState.discardPile)) {
        for (const card of gameState.discardPile) {
          usedCards.add(`${card.suit}-${card.rank}`);
        }
      }

      // Create full deck and remove used cards
      const { createDeck } = require('@gin-rummy/common');
      const fullDeck = createDeck();
      const remainingCards = fullDeck.filter(card => 
        !usedCards.has(`${card.suit}-${card.rank}`)
      );

      // Update internal deck (this is a hack since deck is private)
      // We access it through the game engine's private property
      if (gameEngine.deck !== undefined) {
        gameEngine.deck = remainingCards;
      }

      console.log(`Reconstructed deck with ${remainingCards.length} cards (expected: ${gameState.stockPileCount})`);
      
      // Update stock count to match actual deck
      gameState.stockPileCount = remainingCards.length;
      
    } catch (error) {
      console.warn('Failed to reconstruct deck:', error);
      // Keep the original deck if reconstruction fails
    }
  }

  /**
   * Sync internal turn state with game state
   */
  private syncInternalTurnState(gameEngine: any, gameState: any): void {
    try {
      // Access turn state if available (this is a hack since turnState is private)
      if (gameEngine.turnState !== undefined) {
        gameEngine.turnState.currentPlayerId = gameState.currentPlayerId;
        gameEngine.turnState.phase = gameState.phase;
        gameEngine.turnState.isProcessing = false;
        gameEngine.turnState.lockTimestamp = 0;
        gameEngine.turnState.moveQueue = [];
      }
    } catch (error) {
      console.warn('Failed to sync turn state:', error);
      // Continue without turn state sync if it fails
    }
  }

  /**
   * Initialize a fresh game from database record when no gameState exists yet
   */
  private initializeGameFromRecord(gameId: string, gameRecord: any): GinRummyGame {
    console.log(`Initializing fresh game ${gameId} from database record`);
    
    // Create new game engine based on game type
    const gameEngine = gameRecord.vsAI 
      ? new GinRummyGame(gameId, gameRecord.player1Id, 'ai-player', true)
      : new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id || 'player2', false);
    
    const initialState = gameEngine.getState();
    
    // Set player names from database
    if (gameRecord.player1 && initialState.players[0]) {
      initialState.players[0].username = gameRecord.player1.username;
    }
    
    if (gameRecord.vsAI && initialState.players[1]) {
      initialState.players[1].username = 'AI Opponent';
    } else if (gameRecord.player2 && initialState.players[1]) {
      initialState.players[1].username = gameRecord.player2.username;
    }
    
    // For AI games, process initial AI moves if needed
    if (gameRecord.vsAI && initialState.currentPlayerId === 'ai-player' && initialState.phase === 'upcard_decision') {
      console.log(`Processing initial AI upcard decision for newly initialized game ${gameId}`);
      try {
        // Process the initial AI upcard decision
        const aiMove = gameEngine.getAISuggestion();
        if (aiMove) {
          console.log(`AI making initial move: ${aiMove.type} for game ${gameId}`);
          const moveResult = gameEngine.makeMove(aiMove);
          if (moveResult.success) {
            console.log(`AI initial move successful for game ${gameId}, new phase: ${moveResult.state.phase}`);
          } else {
            console.error(`AI initial move failed for game ${gameId}:`, moveResult.error);
          }
        }
      } catch (error) {
        console.error(`Error processing initial AI moves for game ${gameId}:`, error);
      }
    }
    
    console.log(`Fresh game ${gameId} initialized successfully`);
    return gameEngine;
  }

  /**
   * Validate that the restored state is consistent
   */
  private validateRestoredState(gameEngine: any, storedState: any): void {
    const currentState = gameEngine.getState();
    
    // Check that basic properties match
    if (currentState.id !== storedState.id) {
      throw new Error(`Game ID mismatch: ${currentState.id} !== ${storedState.id}`);
    }
    
    // Check that stock count is reasonable
    if (currentState.stockPileCount < 0 || currentState.stockPileCount > 52) {
      throw new Error(`Invalid stock count: ${currentState.stockPileCount}`);
    }
    
    // Check that players exist
    if (!currentState.players || currentState.players.length !== 2) {
      throw new Error(`Invalid players array: ${currentState.players?.length}`);
    }
    
    // Validate card counts (optional - can be expensive)
    let totalCards = currentState.stockPileCount;
    totalCards += (currentState.discardPile?.length || 0);
    for (const player of currentState.players) {
      totalCards += (player.hand?.length || 0);
    }
    
    if (totalCards !== 52) {
      console.warn(`Card count validation failed: ${totalCards} total cards (expected 52)`);
      // Don't throw error for card count issues, just warn
    }
  }
}

// Create singleton instance
export const persistentGameCache = new PersistentGameCache();