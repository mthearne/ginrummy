import { prisma } from '../utils/database';
import { GameMove } from '@gin-rummy/common';
import { EventType } from '../../packages/common/src/types/events';

/**
 * Game events service for logging and retrieving game moves
 */
export class GameEventsService {
  
  /**
   * Log a game move to the database
   */
  static async logMove(gameId: string, userId: string | null, move: GameMove, gameStateBefore: any, gameStateAfter: any): Promise<void> {
    try {
      console.log(`Logging move for game ${gameId}: ${move.type} by ${userId || 'AI'}`);
      
      await prisma.gameEvent.create({
        data: {
          gameId,
          playerId: userId,
          eventType: 'DRAW_FROM_STOCK' as any, // Legacy compatibility
          sequenceNumber: 1, // Default sequence number
          eventData: {
            move: move as any,
            gameStateBefore: {
              phase: gameStateBefore.phase,
              currentPlayerId: gameStateBefore.currentPlayerId,
              stockPileCount: gameStateBefore.stockPileCount,
              discardPileTop: gameStateBefore.discardPile?.[gameStateBefore.discardPile.length - 1],
              playerStates: gameStateBefore.players?.map((p: any) => ({
                id: p.id,
                handSize: p.handSize,
                score: p.score,
                deadwood: p.deadwood,
                hasKnocked: p.hasKnocked,
                hasGin: p.hasGin
              }))
            },
            gameStateAfter: {
              phase: gameStateAfter.phase,
              currentPlayerId: gameStateAfter.currentPlayerId,
              stockPileCount: gameStateAfter.stockPileCount,
              discardPileTop: gameStateAfter.discardPile?.[gameStateAfter.discardPile.length - 1],
              playerStates: gameStateAfter.players?.map((p: any) => ({
                id: p.id,
                handSize: p.handSize,
                score: p.score,
                deadwood: p.deadwood,
                hasKnocked: p.hasKnocked,
                hasGin: p.hasGin
              }))
            }
          }
        }
      });
      
      console.log(`Move logged successfully for game ${gameId}`);
    } catch (error) {
      console.error(`Failed to log move for game ${gameId}:`, error);
      // Don't throw error - logging failure shouldn't break the game
    }
  }

  /**
   * Log a game start event
   */
  static async logGameStart(gameId: string, initialGameState: any): Promise<void> {
    try {
      console.log(`Logging game start for ${gameId}`);
      
      await prisma.gameEvent.create({
        data: {
          gameId,
          playerId: null, // System event
          sequenceNumber: 1, // Default sequence number
          eventType: EventType.GAME_STARTED,
          eventData: {
            initialState: {
              phase: initialGameState.phase,
              currentPlayerId: initialGameState.currentPlayerId,
              vsAI: initialGameState.vsAI,
              players: initialGameState.players?.map((p: any) => ({
                id: p.id,
                username: p.username,
                handSize: p.handSize,
                score: p.score
              }))
            }
          }
        }
      });
      
      console.log(`Game start logged successfully for ${gameId}`);
    } catch (error) {
      console.error(`Failed to log game start for ${gameId}:`, error);
    }
  }

  /**
   * Log a round end event
   */
  static async logRoundEnd(gameId: string, roundResult: any): Promise<void> {
    try {
      console.log(`Logging round end for game ${gameId}`);
      
      await prisma.gameEvent.create({
        data: {
          gameId,
          playerId: null, // System event
          sequenceNumber: 1, // Default sequence number
          eventType: EventType.ROUND_ENDED,
          eventData: {
            winner: roundResult.winner,
            knockType: roundResult.knockType,
            scores: roundResult.scores,
            finalHands: roundResult.finalHands
          }
        }
      });
      
      console.log(`Round end logged successfully for game ${gameId}`);
    } catch (error) {
      console.error(`Failed to log round end for ${gameId}:`, error);
    }
  }

  /**
   * Log a game end event
   */
  static async logGameEnd(gameId: string, finalGameState: any): Promise<void> {
    try {
      console.log(`Logging game end for ${gameId}`);
      
      await prisma.gameEvent.create({
        data: {
          gameId,
          playerId: null, // System event
          sequenceNumber: 1, // Default sequence number
          eventType: EventType.GAME_FINISHED,
          eventData: {
            winner: finalGameState.winner,
            finalScores: finalGameState.players?.map((p: any) => ({
              playerId: p.id,
              username: p.username,
              score: p.score
            })),
            gameOver: finalGameState.gameOver
          }
        }
      });
      
      console.log(`Game end logged successfully for ${gameId}`);
    } catch (error) {
      console.error(`Failed to log game end for ${gameId}:`, error);
    }
  }

  /**
   * Get all events for a game (for replay functionality)
   */
  static async getGameEvents(gameId: string): Promise<any[]> {
    try {
      const events = await prisma.gameEvent.findMany({
        where: { gameId },
        orderBy: { createdAt: 'asc' },
        include: {
          player: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
      
      return events;
    } catch (error) {
      console.error(`Failed to get events for game ${gameId}:`, error);
      return [];
    }
  }

  /**
   * Get recent moves for a game (for debugging)
   */
  static async getRecentMoves(gameId: string, limit: number = 10): Promise<any[]> {
    try {
      const events = await prisma.gameEvent.findMany({
        where: { 
          gameId,
          eventType: 'DISCARD_CARD' as any
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          player: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
      
      return events.reverse(); // Return in chronological order
    } catch (error) {
      console.error(`Failed to get recent moves for game ${gameId}:`, error);
      return [];
    }
  }

  /**
   * Count total moves in a game
   */
  static async getMoveCount(gameId: string): Promise<number> {
    try {
      const count = await prisma.gameEvent.count({
        where: { 
          gameId,
          eventType: 'DISCARD_CARD' as any
        }
      });
      
      return count;
    } catch (error) {
      console.error(`Failed to count moves for game ${gameId}:`, error);
      return 0;
    }
  }
}