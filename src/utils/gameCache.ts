// Simple in-memory cache for game engines (shared across API routes)
// In production, this would be Redis or another persistent store

const gameEngines = new Map<string, any>();

export const GameCache = {
  set(gameId: string, gameEngine: any) {
    gameEngines.set(gameId, gameEngine);
  },

  get(gameId: string) {
    return gameEngines.get(gameId);
  },

  has(gameId: string) {
    return gameEngines.has(gameId);
  },

  delete(gameId: string) {
    return gameEngines.delete(gameId);
  },

  size() {
    return gameEngines.size;
  }
};