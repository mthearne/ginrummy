// Fallback to simple memory cache for backwards compatibility
import { GinRummyGame } from '@gin-rummy/common';

export class FallbackGameCache {
  private memoryCache = new Map<string, GinRummyGame>();

  async get(gameId: string): Promise<GinRummyGame | null> {
    return this.memoryCache.get(gameId) || null;
  }

  async set(gameId: string, gameEngine: GinRummyGame): Promise<void> {
    this.memoryCache.set(gameId, gameEngine);
  }

  async has(gameId: string): Promise<boolean> {
    return this.memoryCache.has(gameId);
  }

  async delete(gameId: string): Promise<boolean> {
    return this.memoryCache.delete(gameId);
  }

  size(): number {
    return this.memoryCache.size;
  }
}

// Export fallback cache
export const fallbackGameCache = new FallbackGameCache();