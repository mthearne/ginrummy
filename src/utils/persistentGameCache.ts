// Database-backed persistent game cache for serverless environments
import { GinRummyGame } from '@gin-rummy/common';
import { prisma } from './database';
import { GameEventsService } from '../services/gameEvents';

export const AI_PLAYER_ID = 'ai-player';
export const AI_USERNAME  = 'AI Assistant';

export class PersistentGameCache {
  private memoryCache = new Map<string, GinRummyGame>();
  private saveCounter = 0;

  /**
   * Get game engine from cache or database
   */
  async get(gameId: string): Promise<GinRummyGame | null> {
    // First check memory cache
    if (this.memoryCache.has(gameId)) {
      console.log(`✅ Game ${gameId} found in memory cache - using cached version`);
      const cachedGame = this.memoryCache.get(gameId)!;
      const cachedState = cachedGame.getState();
      console.log(`Cached state: phase=${cachedState.phase}, upcard=${cachedState.discardPile?.[0]?.id || 'NO UPCARD'}`);
      return cachedGame;
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
      console.log(`Database query result for ${gameId}:`);
      console.log(`  - Game found: ${!!game}`);
      console.log(`  - GameState field exists: ${gameStateData !== null && gameStateData !== undefined}`);
      console.log(`  - GameState type: ${typeof gameStateData}`);
      if (gameStateData) {
        console.log(`  - GameState has _saveTimestamp: ${!!gameStateData._saveTimestamp}`);
        console.log(`  - GameState phase: ${gameStateData.phase}`);
      }
      
      if (gameStateData) {
        // Restore from stored state (preferred path)
        console.log(`\n=== LOADING GAME STATE ===`);
        console.log(`Game ID: ${gameId}`);
        console.log(`Restored timestamp: ${gameStateData._saveTimestamp || 'NOT FOUND'}`);
        console.log(`Restored phase: ${gameStateData.phase}`);
        console.log(`Restored current player: ${gameStateData.currentPlayerId}`);
        console.log(`Restored deck size: ${gameStateData.deck?.length || 'NO DECK'}`);
        console.log(`Restored discard pile: ${gameStateData.discardPile?.length || 0} cards`);
        console.log(`Restored upcard: ${gameStateData.discardPile?.[0]?.id || 'NO UPCARD'}`);
        console.log(`Restored player 1 hand: ${gameStateData.players?.[0]?.hand?.length || 0} cards`);
        console.log(`Restored player 2 hand: ${gameStateData.players?.[1]?.hand?.length || 0} cards`);
        console.log(`Restored debug:`, gameStateData._saveDebug || 'NOT FOUND');
        const gameEngine = this.restoreGameFromState(gameId, gameStateData, game);
        
        // IMMEDIATE card count check after restoration
        const restoredState = gameEngine.getState();
        const player1HandSize = restoredState.players[0]?.hand?.length || 0;
        const player2HandSize = restoredState.players[1]?.hand?.length || 0;
        console.log(`IMMEDIATE CHECK: Player hands after restoration - P1: ${player1HandSize}, P2: ${player2HandSize}`);
        
        if (player1HandSize > 11 || player2HandSize > 11) {
          console.error(`🚨 EXCESSIVE CARDS DETECTED AFTER RESTORATION!`);
          console.error(`Player 1: ${player1HandSize} cards, Player 2: ${player2HandSize} cards`);
          console.error(`Player 1 hand:`, restoredState.players[0]?.hand?.map(c => c.id));
          console.error(`Player 2 hand:`, restoredState.players[1]?.hand?.map(c => c.id));
          throw new Error(`Excessive cards detected: P1=${player1HandSize}, P2=${player2HandSize}`);
        }
        
        this.memoryCache.set(gameId, gameEngine);
        
        // Add debug info to the game engine
        (gameEngine as any)._debugInfo = {
          restorationMethod: 'database_restore',
          hadStoredState: true,
          cardCount: gameStateData.players?.[0]?.hand?.length || 0,
          hasDeckData: !!(gameStateData.deck && Array.isArray(gameStateData.deck)),
          deckSize: gameStateData.deck?.length || 0,
          stockCount: gameStateData.stockPileCount || 0,
          lastSaveTimestamp: gameStateData._saveTimestamp || 'unknown',
          savedPhase: gameStateData._saveDebug?.phase || 'unknown',
          savedCurrentPlayer: gameStateData._saveDebug?.currentPlayerId || 'unknown',
          rawSaveDebug: gameStateData._saveDebug || null,
          fullStoredState: {
            phase: gameStateData.phase,
            currentPlayerId: gameStateData.currentPlayerId,
            hasTimestamp: !!gameStateData._saveTimestamp
          }
        };
        
        return gameEngine;
      } else {
        // Game exists in database but no gameState yet - this could be a problem
        console.warn(`Game ${gameId} found in database but no stored state - this might indicate incomplete save`);
        console.log('Game record:', {
          id: game.id,
          status: game.status,
          vsAI: game.vsAI,
          player1Id: game.player1Id,
          player2Id: game.player2Id,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt
        });
        
        // Initialize from database record - this creates a fresh game!
        console.log(`⚠️  INITIALIZING FRESH GAME FROM RECORD - THIS RESETS THE GAME!`);
        console.log(`Game record status: ${game.status}, vsAI: ${game.vsAI}, createdAt: ${game.createdAt}`);
        console.log(`This will create NEW cards and shuffle - upcard will change!`);
        const gameEngine = this.initializeGameFromRecord(gameId, game);
        
        // Add debug info to the game engine
        (gameEngine as any)._debugInfo = {
          restorationMethod: 'fresh_initialization',
          hadStoredState: false,
          reason: 'no_gameState_in_database'
        };
        
        // Cache the initialized game and save initial state to database
        this.memoryCache.set(gameId, gameEngine);
        
        // Save initial state to database immediately
        try {
          console.log(`SAVING INITIAL STATE for ${gameId}...`);
          const initialState = gameEngine.getState();
          console.log(`Initial state phase: ${initialState.phase}, currentPlayer: ${initialState.currentPlayerId}`);
          console.log(`Initial upcard: ${initialState.discardPile?.[0]?.id || 'NO UPCARD'}`);
          console.log(`Initial player hand: ${initialState.players[0]?.hand?.slice(0, 3).map(c => c.id).join(', ')}...`);
          
          await this.set(gameId, gameEngine);
          console.log(`✅ INITIAL GAME STATE SAVED SUCCESSFULLY for ${gameId}`);
      
      // Verify the save actually worked by reading it back
      try {
        const verifyGame = await prisma.game.findUnique({
          where: { id: gameId },
          select: { gameState: true }
        });
        
        if (verifyGame?.gameState) {
          console.log(`✅ Save verification: gameState exists in database for ${gameId}`);
          console.log(`Saved timestamp: ${(verifyGame.gameState as any)._saveTimestamp}`);
        } else {
          console.error(`❌ Save verification FAILED: No gameState found in database for ${gameId}`);
        }
      } catch (verifyError) {
        console.error(`❌ Save verification ERROR for ${gameId}:`, verifyError);
      }
          
          // Log game start event (don't await to avoid blocking)
          GameEventsService.logGameStart(gameId, gameEngine.getState()).catch(error => {
            console.warn(`Failed to log game start for ${gameId}:`, error);
          });
          
        } catch (error) {
          console.error(`❌ FAILED TO SAVE INITIAL GAME STATE for ${gameId}:`, error);
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
      
      // Include the internal deck state to preserve card IDs
      const stateWithDeck = {
        ...gameState,
        deck: (gameEngine as any).deck || [],
        _saveTimestamp: new Date().toISOString(),
        _saveDebug: {
          phase: gameState.phase,
          currentPlayerId: gameState.currentPlayerId,
          stockCount: gameState.stockPileCount
        }
      };
      
      this.saveCounter++;
      console.log(`\n=== SAVING GAME STATE #${this.saveCounter} ===`);
      console.log(`Game ID: ${gameId}`);
      console.log(`Save timestamp: ${stateWithDeck._saveTimestamp}`);
      console.log(`Phase: ${gameState.phase}`);
      console.log(`Current player: ${gameState.currentPlayerId}`);
      console.log(`Deck cards: ${stateWithDeck.deck.length}`);
      console.log(`Discard pile: ${gameState.discardPile?.length || 0} cards`);
      console.log(`Upcard being saved: ${gameState.discardPile?.[0]?.id || 'NO UPCARD'}`);
      console.log(`Save caller stack:`, new Error().stack?.split('\n').slice(1, 4).join(' -> '));
      console.log(`Player 1 hand size: ${gameState.players[0]?.hand?.length}, Player 2 hand size: ${gameState.players[1]?.hand?.length}`);
      console.log(`=== END SAVE #${this.saveCounter} ===\n`);
      
      // Check for concurrent updates by comparing timestamps
      const existingGame = await prisma.game.findUnique({
        where: { id: gameId },
        select: { gameState: true, updatedAt: true }
      });
      
      const existingTimestamp = (existingGame?.gameState as any)?._saveTimestamp;
      const newTimestamp = stateWithDeck._saveTimestamp;
      
      if (existingTimestamp && existingTimestamp > newTimestamp) {
        console.warn(`⚠️  Skipping save for ${gameId}: existing state is newer (${existingTimestamp} > ${newTimestamp})`);
        return; // Don't overwrite newer state with older state
      }
      
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          gameState: stateWithDeck as any,
          status: gameState.gameOver ? 'FINISHED' : 'ACTIVE'
        }
      });
      
      console.log(`✅ Game state saved to database successfully for ${gameId} at ${newTimestamp}`);
      
      // Update memory cache with the saved version to ensure consistency
      this.memoryCache.set(gameId, gameEngine);
    } catch (error) {
      console.error(`❌ CRITICAL: Database save failed for game ${gameId}:`, error);
      
      // Check if it's a schema issue (gameState field doesn't exist) vs a real database error
      if (error.message?.includes('gameState') || error.message?.includes('column')) {
        console.warn(`⚠️  Attempting fallback save (status only) due to schema incompatibility`);
        try {
          const gameState = gameEngine.getState();
          await prisma.game.update({
            where: { id: gameId },
            data: { 
              status: gameState.gameOver ? 'FINISHED' : 'ACTIVE'
            }
          });
          console.warn(`⚠️  Fallback save successful for game ${gameId} (status only) - GAME STATE NOT SAVED!`);
        } catch (fallbackError) {
          console.error(`❌ Fallback save also failed for game ${gameId}:`, fallbackError);
          throw fallbackError; // Re-throw to indicate complete failure
        }
      } else {
        console.error(`❌ Real database error - not a schema issue`);
        throw error; // Re-throw real database errors
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
    console.log(`\n!!! DELETE CALLED FOR GAME ${gameId} !!!`);
    console.log(`Delete caller stack:`, new Error().stack?.split('\n').slice(1, 5).join(' -> '));
    
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
    // For AI games, player2Id should always be set now, but fallback to error if missing
    if (gameRecord.vsAI && !gameRecord.player2Id) {
      throw new Error(`AI game ${gameId} missing player2Id - this should not happen with updated game creation`);
    }
    
    const gameEngine = gameRecord.vsAI 
      ? new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id, true)
      : new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id, false);
    
    // Set loading state to prevent AI processing during restoration
    if (typeof gameEngine.setLoadingState === 'function') {
      gameEngine.setLoadingState(true);
      console.log('Set loading state to prevent AI interference during restoration');
    }
    
    // Get the fresh state for comparison
    const freshState = gameEngine.getState();
    console.log(`Restoring from fresh state with ${freshState.stockPileCount} stock cards`);
    
    try {
      // Restore game state using proper reconstruction instead of Object.assign
      console.log(`Starting reconstruction for ${gameId} - stored phase: ${storedState.phase}, currentPlayer: ${storedState.currentPlayerId}`);
      this.reconstructGameState(gameEngine, storedState, gameRecord);
      
      // Verify the phase was actually set correctly
      const restoredState = gameEngine.getState();
      console.log(`After reconstruction - actual phase: ${restoredState.phase}, currentPlayer: ${restoredState.currentPlayerId}`);
      console.log(`Game state restored successfully for ${gameId}`);
      
      // Validate the restored state - CRITICAL for detecting duplicates
      try {
        this.validateRestoredState(gameEngine, storedState);
        console.log(`✅ Game state validation passed for ${gameId}`);
      } catch (validationError) {
        console.error(`❌ GAME STATE VALIDATION FAILED for ${gameId}:`, validationError.message);
        // Don't let the game continue with invalid state
        throw validationError;
      }
      
      // Clear loading state now that restoration is complete
      if (typeof gameEngine.setLoadingState === 'function') {
        gameEngine.setLoadingState(false);
        console.log('Cleared loading state after successful restoration');
      }
      
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
      
      // Clear loading state after fallback restoration
      if (typeof gameEngine.setLoadingState === 'function') {
        gameEngine.setLoadingState(false);
        console.log('Cleared loading state after fallback restoration');
      }
    }

    // FINAL VERIFICATION: Check if the state is correct after all restoration steps
    const finalState = gameEngine.getState();
    console.log(`FINAL STATE CHECK for ${gameId}:`);
    console.log(`  - Phase: ${finalState.phase} (expected: ${storedState.phase})`);
    console.log(`  - CurrentPlayer: ${finalState.currentPlayerId} (expected: ${storedState.currentPlayerId})`);
    console.log(`  - Phase match: ${finalState.phase === storedState.phase}`);
    console.log(`  - Player match: ${finalState.currentPlayerId === storedState.currentPlayerId}`);
    
    if (finalState.phase !== storedState.phase) {
      console.error(`PHASE MISMATCH DETECTED! Game engine reset phase from ${storedState.phase} to ${finalState.phase}`);
    }

    return gameEngine;
  }

  /**
   * Properly reconstruct game state with internal consistency
   */
  private reconstructGameState(gameEngine: any, storedState: any, gameRecord: any): void {
    const currentState = gameEngine.getState();
    
    // IMMEDIATE CHECK: Validate stored state before reconstruction
    if (storedState.players) {
      const p1Cards = storedState.players[0]?.hand?.length || 0;
      const p2Cards = storedState.players[1]?.hand?.length || 0;
      console.log(`STORED STATE VALIDATION: P1=${p1Cards} cards, P2=${p2Cards} cards`);
      
      if (p1Cards > 11 || p2Cards > 11) {
        console.error(`🚨 CORRUPTED STORED STATE DETECTED!`);
        console.error(`Stored player hands: P1=${p1Cards}, P2=${p2Cards}`);
        console.error(`P1 hand:`, storedState.players[0]?.hand?.map((c: any) => c.id));
        console.error(`P2 hand:`, storedState.players[1]?.hand?.map((c: any) => c.id));
        throw new Error(`Corrupted stored state: P1=${p1Cards}, P2=${p2Cards} cards`);
      }
    }
    
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

    // 6. Sync internal turn state to ensure consistency after restoration
    this.syncInternalTurnState(gameEngine, currentState);
  }

  /**
   * Reconstruct the internal deck based on game state
   * CRITICAL: We must preserve the original cards to avoid changing card IDs
   */
  private reconstructDeck(gameEngine: any, gameState: any): void {
    try {
      // If we have stored deck data, restore it directly
      if (gameState.deck && Array.isArray(gameState.deck)) {
        console.log('Restoring deck from stored state with', gameState.deck.length, 'cards');
        console.log('First few deck cards:', gameState.deck.slice(0, 3).map(c => c.id));
        gameEngine.deck = gameState.deck;
        gameState.stockPileCount = gameState.deck.length;
        return;
      }

      // Fallback: Don't reconstruct the deck at all to avoid changing card IDs
      // Just trust the stored stockPileCount - this prevents cards from changing
      console.log('No stored deck found, keeping existing deck to preserve card IDs');
      console.log('Stock count from stored state:', gameState.stockPileCount);
      
      // Don't modify the deck or cards - this was causing the cards to change
      // The existing deck in gameEngine will be used as-is
      
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
      console.log(`SYNC: Before sync - gameState phase: ${gameState.phase}, currentPlayer: ${gameState.currentPlayerId}`);
      
      // Use the game engine's built-in sync method if available
      if (typeof gameEngine.forceTurnStateSync === 'function') {
        gameEngine.forceTurnStateSync();
        const postSyncState = gameEngine.getState();
        console.log(`Turn state synced via forceTurnStateSync: gameState phase=${gameState.phase} -> actual phase=${postSyncState.phase}`);
        console.log(`Turn state synced via forceTurnStateSync: gameState currentPlayer=${gameState.currentPlayerId} -> actual currentPlayer=${postSyncState.currentPlayerId}`);
      } else {
        // Fallback: directly access turn state if available (this is a hack since turnState is private)
        if (gameEngine.turnState !== undefined) {
          console.log(`SYNC: Setting turnState directly - phase: ${gameState.phase}, currentPlayer: ${gameState.currentPlayerId}`);
          gameEngine.turnState.currentPlayerId = gameState.currentPlayerId;
          gameEngine.turnState.phase = gameState.phase;
          gameEngine.turnState.isProcessing = false;
          gameEngine.turnState.lockTimestamp = 0;
          gameEngine.turnState.moveQueue = [];
          gameEngine.turnState.isLoading = false; // Clear loading state
          console.log(`Turn state synced directly: currentPlayer=${gameState.currentPlayerId}, phase=${gameState.phase}`);
        }
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
    // For AI games, player2Id should always be set now, but error if missing
    if (gameRecord.vsAI && !gameRecord.player2Id) {
      throw new Error(`AI game ${gameId} missing player2Id - this should not happen with updated game creation`);
    }
    
    const gameEngine = gameRecord.vsAI 
      ? new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id, true)
      : new GinRummyGame(gameId, gameRecord.player1Id, gameRecord.player2Id || 'player2', false);
    
    // Set loading state during initialization to prevent race conditions
    if (typeof gameEngine.setLoadingState === 'function') {
      gameEngine.setLoadingState(true);
      console.log('Set loading state during fresh game initialization');
    }
    
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
    const aiPlayer = initialState.players?.find(p => p.username === AI_USERNAME);
    if (gameRecord.vsAI && initialState.currentPlayerId === aiPlayer?.id && initialState.phase === 'upcard_decision') {
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
    
    // Clear loading state after initialization is complete
    if (typeof gameEngine.setLoadingState === 'function') {
      gameEngine.setLoadingState(false);
      console.log('Cleared loading state after fresh game initialization');
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
    
    // CRITICAL: Check for duplicate cards
    const allCards: string[] = [];
    
    // Collect all cards from all sources
    const deck = (gameEngine as any).deck || [];
    const discardPile = currentState.discardPile || [];
    
    // Add deck cards
    deck.forEach((card: any) => allCards.push(card.id));
    
    // Add discard pile cards
    discardPile.forEach((card: any) => allCards.push(card.id));
    
    // Add player hand cards
    currentState.players.forEach((player: any, playerIndex: number) => {
      if (player.hand) {
        player.hand.forEach((card: any) => {
          allCards.push(card.id);
        });
      }
    });
    
    // Check for duplicates
    const uniqueCards = new Set(allCards);
    if (uniqueCards.size !== allCards.length) {
      console.error(`🚨 DUPLICATE CARDS DETECTED!`);
      console.error(`Total cards: ${allCards.length}, Unique cards: ${uniqueCards.size}`);
      
      // Find duplicates
      const cardCounts = new Map<string, number>();
      allCards.forEach(cardId => {
        cardCounts.set(cardId, (cardCounts.get(cardId) || 0) + 1);
      });
      
      const duplicates = Array.from(cardCounts.entries()).filter(([_, count]) => count > 1);
      console.error(`Duplicate cards:`, duplicates);
      
      // Log where each duplicate card appears
      duplicates.forEach(([cardId, count]) => {
        console.error(`Card ${cardId} appears ${count} times:`);
        
        // Check deck
        if (deck.some((c: any) => c.id === cardId)) {
          console.error(`  - In deck`);
        }
        
        // Check discard pile
        if (discardPile.some((c: any) => c.id === cardId)) {
          console.error(`  - In discard pile`);
        }
        
        // Check player hands
        currentState.players.forEach((player: any, playerIndex: number) => {
          if (player.hand?.some((c: any) => c.id === cardId)) {
            console.error(`  - In player ${playerIndex + 1} hand`);
          }
        });
      });
      
      throw new Error(`Duplicate cards detected: ${duplicates.map(([id]) => id).join(', ')}`);
    }
    
    // Validate total card count
    if (allCards.length !== 52) {
      console.warn(`Total card count: ${allCards.length} (expected 52)`);
      console.warn(`Deck: ${deck.length}, Discard: ${discardPile.length}, Player1: ${currentState.players[0]?.hand?.length || 0}, Player2: ${currentState.players[1]?.hand?.length || 0}`);
    }
  }
}

// Create singleton instance
export const persistentGameCache = new PersistentGameCache();