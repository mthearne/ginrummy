// Database-backed persistent game cache for serverless environments
import { GinRummyGame } from '@gin-rummy/common';
import { prisma } from './database';

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

    // If not in memory, try to load from database
    console.log(`Game ${gameId} not in memory, loading from database`);
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { id: true, username: true } }
        }
      });

      if (!game || !game.vsAI) {
        console.log(`Game ${gameId} not found or not AI game`);
        return null;
      }

      // If game state is stored, restore it
      if (game.gameState) {
        console.log(`Restoring game ${gameId} from stored state`);
        const gameEngine = this.restoreGameFromState(gameId, game.gameState, game);
        this.memoryCache.set(gameId, gameEngine);
        return gameEngine;
      } else {
        console.log(`Game ${gameId} has no stored state, creating new`);
        return null;
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
    
    // Store in database
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
      // Continue without failing - memory cache still works
    }
  }

  /**
   * Check if game exists in cache or database
   */
  async has(gameId: string): Promise<boolean> {
    if (this.memoryCache.has(gameId)) {
      return true;
    }

    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true, vsAI: true, gameState: true }
      });

      return !!(game?.vsAI && game.gameState);
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

    // Clear stored state from database
    try {
      await prisma.game.update({
        where: { id: gameId },
        data: { gameState: null as any }
      });
      return true;
    } catch (error) {
      console.error(`Error clearing game ${gameId} from database:`, error);
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
   * Restore game engine from stored state
   */
  private restoreGameFromState(gameId: string, storedState: any, gameRecord: any): GinRummyGame {
    // Create new game engine
    const gameEngine = new GinRummyGame(gameId, gameRecord.player1Id, 'ai-player', true);
    
    // Restore the stored state
    // Note: This is a simplified restoration - in a full implementation,
    // you'd need to properly reconstruct the entire game state including deck
    const state = gameEngine.getState();
    
    // Copy stored state properties
    Object.assign(state, storedState);
    
    // Ensure player names are correct
    if (gameRecord.player1) {
      state.players[0].username = gameRecord.player1.username;
    }
    state.players[1].username = 'AI Opponent';

    return gameEngine;
  }
}

// Create singleton instance
export const persistentGameCache = new PersistentGameCache();