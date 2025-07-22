import {
  GinRummyGame,
  AIPlayer,
  GameMove,
  GameState,
  GameEndResult,
  calculateEloChange,
} from '@gin-rummy/common';
import { prisma } from '../utils/database.js';

/**
 * Service to manage game instances and game-related operations
 */
export class GameService {
  private static instance: GameService;
  private games = new Map<string, GinRummyGame>();
  private aiPlayers = new Map<string, AIPlayer>();

  private constructor() {}

  public static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }
    return GameService.instance;
  }

  /**
   * Create a new game instance
   */
  public createGame(gameId: string, player1Id: string, player2Id: string, vsAI: boolean): GinRummyGame {
    const game = new GinRummyGame(gameId, player1Id, player2Id, vsAI);
    this.games.set(gameId, game);

    if (vsAI) {
      this.aiPlayers.set(gameId, new AIPlayer(player2Id));
    }

    return game;
  }

  /**
   * Get game instance
   */
  public getGame(gameId: string): GinRummyGame | undefined {
    return this.games.get(gameId);
  }

  /**
   * Remove game instance
   */
  public removeGame(gameId: string): void {
    this.games.delete(gameId);
    this.aiPlayers.delete(gameId);
  }

  /**
   * Make a move in a game
   */
  public async makeMove(
    gameId: string,
    move: GameMove
  ): Promise<{
    success: boolean;
    error?: string;
    gameEnded?: boolean;
    gameResult?: GameEndResult;
  }> {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    const result = game.makeMove(move);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const state = result.state;
    
    // Check if game ended
    if (state.gameOver) {
      const gameResult = await this.createGameEndResult(gameId, state);
      return {
        success: true,
        gameEnded: true,
        gameResult,
      };
    }

    return { success: true };
  }

  /**
   * Get game state for a specific player
   */
  public getPlayerGameState(gameId: string, playerId: string): Partial<GameState> | null {
    const game = this.games.get(gameId);
    if (!game) {
      console.log(`[GAME_SERVICE] Game ${gameId} not found in games map`);
      return null;
    }

    try {
      console.log(`[GAME_SERVICE] Getting player state for ${playerId} in game ${gameId}`);
      const fullState = game.getState();
      console.log(`[GAME_SERVICE] Full game state - players: ${fullState.players.map(p => `${p.id}(${p.username})`).join(', ')}`);
      console.log(`[GAME_SERVICE] Current player: ${fullState.currentPlayerId}`);
      
      const playerState = game.getPlayerState(playerId);
      console.log(`[GAME_SERVICE] Personalized state for ${playerId} - players: ${playerState.players?.map(p => `${p.id}(${p.username}, hand:${p.hand?.length || 0})`).join(', ')}`);
      
      return playerState;
    } catch (error) {
      console.error('Error getting player state:', error);
      return null;
    }
  }

  /**
   * Get AI move suggestion
   */
  public getAIMove(gameId: string): GameMove | null {
    const game = this.games.get(gameId);
    const aiPlayer = this.aiPlayers.get(gameId);
    
    if (!game || !aiPlayer) {
      return null;
    }

    return game.getAISuggestion();
  }

  /**
   * Finish a game and update database records
   */
  public async finishGame(gameId: string, gameResult: GameEndResult): Promise<void> {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: true,
          player2: true,
        },
      });

      if (!game) {
        throw new Error('Game not found in database');
      }

      const gameInstance = this.games.get(gameId);
      const finalState = gameInstance?.getState();

      // Calculate game duration
      const duration = Math.floor((Date.now() - game.createdAt.getTime()) / 1000);

      // Determine knock type
      let knockType: 'GIN' | 'KNOCK' | 'UNDERCUT' = 'KNOCK';
      if (finalState) {
        const winner = finalState.players.find(p => p.id === gameResult.winner);
        if (winner?.hasGin) {
          knockType = 'GIN';
        } else if (gameResult.knockType === 'undercut') {
          knockType = 'UNDERCUT';
        }
      }

      // Update game record
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          winnerId: gameResult.winner,
          player1Score: gameResult.winner === game.player1Id ? gameResult.winnerScore : gameResult.loserScore,
          player2Score: gameResult.winner === game.player2Id ? gameResult.winnerScore : gameResult.loserScore,
          duration,
          knockType,
          finishedAt: new Date(),
        },
      });

      // Update user statistics (only for human players)
      if (game.player1Id !== 'ai-player') {
        await this.updateUserStats(game.player1Id, gameResult.winner === game.player1Id);
      }
      
      if (game.player2Id && game.player2Id !== 'ai-player') {
        await this.updateUserStats(game.player2Id, gameResult.winner === game.player2Id);
      }

      // Update ELO ratings (only for PvP games)
      if (!game.vsAI && game.player1 && game.player2) {
        const eloChanges = calculateEloChange(
          gameResult.winner === game.player1Id ? game.player1.elo : game.player2.elo,
          gameResult.winner === game.player1Id ? game.player2.elo : game.player1.elo
        );

        // Update winner ELO
        const winnerId = gameResult.winner;
        const loserId = gameResult.winner === game.player1Id ? game.player2Id! : game.player1Id;
        const winnerEloChange = eloChanges.winnerChange;
        const loserEloChange = eloChanges.loserChange;

        await prisma.user.update({
          where: { id: winnerId },
          data: {
            elo: { increment: winnerEloChange },
          },
        });

        await prisma.user.update({
          where: { id: loserId },
          data: {
            elo: { increment: loserEloChange },
          },
        });

        // Record ELO history
        await prisma.eloHistory.createMany({
          data: [
            {
              userId: winnerId,
              elo: (gameResult.winner === game.player1Id ? game.player1.elo : game.player2.elo) + winnerEloChange,
              change: winnerEloChange,
              gameId,
            },
            {
              userId: loserId,
              elo: (gameResult.winner === game.player1Id ? game.player2.elo : game.player1.elo) + loserEloChange,
              change: loserEloChange,
              gameId,
            },
          ],
        });
      }

      // Clean up game instance
      this.removeGame(gameId);
    } catch (error) {
      console.error('Finish game error:', error);
      throw error;
    }
  }

  /**
   * Update user game statistics
   */
  private async updateUserStats(userId: string, won: boolean): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        gamesPlayed: { increment: 1 },
        gamesWon: won ? { increment: 1 } : undefined,
      },
    });
  }

  /**
   * Create game end result from game state
   */
  private async createGameEndResult(gameId: string, state: GameState): Promise<GameEndResult> {
    const [player1, player2] = state.players;
    const winnerId = state.winner!;
    const loserId = winnerId === player1.id ? player2.id : player1.id;
    const winnerScore = winnerId === player1.id ? player1.score : player2.score;
    const loserScore = winnerId === player1.id ? player2.score : player1.score;

    // Determine knock type
    let knockType: 'gin' | 'knock' | 'undercut' = 'knock';
    const winner = state.players.find(p => p.id === winnerId);
    if (winner?.hasGin) {
      knockType = 'gin';
    } else if (state.roundScores) {
      const winnerRoundScore = state.roundScores[winnerId] || 0;
      const loserRoundScore = state.roundScores[loserId] || 0;
      if (loserRoundScore > winnerRoundScore) {
        knockType = 'undercut';
      }
    }

    // Calculate ELO changes for PvP games
    const eloChanges: { [playerId: string]: number } = {};
    
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (game && !game.vsAI && game.player1 && game.player2) {
      const winnerElo = winnerId === game.player1Id ? game.player1.elo : game.player2.elo;
      const loserElo = winnerId === game.player1Id ? game.player2.elo : game.player1.elo;
      
      const changes = calculateEloChange(winnerElo, loserElo);
      eloChanges[winnerId] = changes.winnerChange;
      eloChanges[loserId] = changes.loserChange;
    }

    return {
      winner: winnerId,
      loser: loserId,
      winnerScore,
      loserScore,
      knockType,
      eloChanges,
    };
  }

  /**
   * Get all active games count
   */
  public getActiveGamesCount(): number {
    return this.games.size;
  }

  /**
   * Cleanup inactive games (called periodically)
   */
  public cleanupInactiveGames(): void {
    // This would be called by a cron job to clean up games that have been inactive
    // for too long (e.g., players disconnected without finishing)
    // Implementation would check last activity timestamp and remove stale games
  }
}