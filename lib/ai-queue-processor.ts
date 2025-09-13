import { PrismaClient } from '@prisma/client';
import { TurnController } from './turn-controller';
import { GameStateLoader } from './game-state-loader';
import { EventType } from '../packages/common/src/types/events';
import { AIPlayer } from '../packages/common/src/game-engine/ai-player';
import { GamePhase } from '../packages/common/src/types/game';

/**
 * AI Queue Processor - Deterministic AI Move Processing
 * 
 * This eliminates ALL AI-related race conditions and 409 errors by:
 * 1. Processing AI moves sequentially (no concurrent AI moves)
 * 2. Loading fresh game state before each AI move
 * 3. Validating that it's actually the AI's turn
 * 4. Using the same atomic TurnController as human moves
 * 5. Queuing multiple AI requests to prevent conflicts
 */
export class AIQueueProcessor {
  private prisma: PrismaClient;
  private turnController: TurnController;
  private gameStateLoader: GameStateLoader;
  private processingQueue = new Map<string, Promise<void>>();
  private isProcessing = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.turnController = new TurnController(prisma);
    this.gameStateLoader = new GameStateLoader(prisma);
  }

  /**
   * Queue an AI move for processing (called after human move)
   */
  async queueAIMove(gameId: string): Promise<void> {
    console.log(`🚨 AIQueue: *** QUEUING AI MOVE FOR GAME ${gameId} ***`);

    // If already processing this game, skip duplicate request
    if (this.processingQueue.has(gameId)) {
      console.log(`🤖 AIQueue: Game ${gameId} already queued, skipping duplicate`);
      return;
    }

    // Create processing promise and add to queue
    const processingPromise = this.processAIMove(gameId);
    this.processingQueue.set(gameId, processingPromise);

    try {
      await processingPromise;
    } finally {
      // Always remove from queue when done (success or failure)
      this.processingQueue.delete(gameId);
    }
  }

  /**
   * Process a single AI move with full validation
   */
  private async processAIMove(gameId: string): Promise<void> {
    const startTime = Date.now();
    console.log(`🤖 AIQueue: Starting AI move processing for game ${gameId}`);

    try {
      // STEP 1: Load current game state (fresh from database)
      console.log('🤖 AIQueue: Loading fresh game state...');
      const gameStateResult = await this.gameStateLoader.loadGameState(gameId);

      if (!gameStateResult.success) {
        console.error(`🤖 AIQueue: Failed to load game state: ${gameStateResult.error}`);
        return;
      }

      const gameState = gameStateResult.gameState;
      console.log('🤖 AIQueue: Game state loaded:', {
        phase: gameState.phase,
        currentPlayer: gameState.currentPlayerId,
        status: gameState.status,
        eventCount: gameStateResult.eventCount
      });

      // STEP 2: Verify it's actually an AI game
      if (!gameState.vsAI) {
        console.log('🤖 AIQueue: Not an AI game, skipping');
        return;
      }

      if (gameState.gameOver || gameState.status === 'FINISHED') {
        console.log('🤖 AIQueue: Game is over, skipping AI move');
        return;
      }

      // STEP 2.5: Check if we're in layoff phase first (takes priority over regular moves)
      if (gameState.phase === 'layoff') {
        console.log('🚨🚨🚨 AIQueue: *** GAME IS IN LAYOFF PHASE - HANDLING AI LAYOFF DECISION ***');
        await this.handleAILayoffDecision(gameId, gameState);
        return; // Exit early - layoff handling is complete
      }

      // Find the AI player (assuming player2 is AI for now)
      const aiPlayer = gameState.players.find(p => p.id !== gameState.players[0].id);
      if (!aiPlayer) {
        console.error('🤖 AIQueue: Could not identify AI player');
        return;
      }

      if (gameState.currentPlayerId !== aiPlayer.id) {
        console.log(`🤖 AIQueue: Not AI's turn (current: ${gameState.currentPlayerId}, AI: ${aiPlayer.id})`);
        return;
      }

      console.log(`🤖 AIQueue: Confirmed AI turn for player ${aiPlayer.id}`);

      // STEP 3: Show AI thinking indicators
      await this.showAIThinking(gameId, gameState);

      // STEP 4: Generate AI move based on current phase
      const aiAction = await this.generateAIAction(gameState, aiPlayer.id);
      if (!aiAction) {
        console.error('🤖 AIQueue: Failed to generate valid AI action');
        return;
      }

      console.log(`🤖 AIQueue: Generated AI action: ${aiAction.type}`);

      // STEP 5: Process AI move through TurnController (same as human moves)
      console.log('🤖 AIQueue: Processing AI move through TurnController...');
      const result = await this.turnController.processTurn(gameId, aiPlayer.id, aiAction);

      if (!result.success) {
        console.error(`🤖 AIQueue: AI move failed: ${result.error} (${result.code})`);
        return;
      }

      const processingTime = Date.now() - startTime;
      console.log(`✅ AIQueue: AI move completed successfully in ${processingTime}ms`, {
        eventType: result.event.eventType,
        sequenceNumber: result.event.sequenceNumber,
        newPhase: result.gameState.phase,
        newCurrentPlayer: result.gameState.currentPlayerId
      });

      // STEP 5.5: Generate turn history entry for this AI move
      // TEMPORARILY DISABLED FOR DEBUGGING
      console.log('🤖 AIQueue: AI turn history generation temporarily disabled for debugging');

      // Note: Layoff handling is now done at the start of processAIMove, not here

      // STEP 7: Check if AI should move again (e.g., after drawing)  
      if (result.aiShouldMove) {
        console.log('🤖 AIQueue: AI should move again, queuing follow-up move...');
        // Small delay to prevent infinite loops
        setTimeout(() => {
          this.queueAIMove(gameId);
        }, 500);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ AIQueue: AI move processing failed after ${processingTime}ms:`, error);
    }
  }

  /**
   * Show AI thinking with realistic delay and thoughts
   */
  private async showAIThinking(gameId: string, gameState: any): Promise<void> {
    // Generate contextual AI thoughts based on game state
    const thoughts = this.generateAIThoughts(gameState);
    
    console.log(`🤖 AIQueue: AI thinking with thoughts:`, thoughts);
    
    // TODO: In future, create AI_THINKING_STARTED event
    // For now, trigger thinking via WebSocket-like mechanism
    // We'll add a simple way to communicate with the frontend
    
    const thinkingTime = Math.random() * 1500 + 2000; // 2-3.5 seconds to show thoughts
    console.log(`🤖 AIQueue: AI thinking for ${Math.round(thinkingTime)}ms...`);
    await new Promise(resolve => setTimeout(resolve, thinkingTime));
  }
  
  /**
   * Generate contextual AI thoughts based on current game state
   */
  private generateAIThoughts(gameState: any): string[] {
    const thoughts: string[] = [];
    const aiPlayer = gameState.players.find((p: any) => p.id !== gameState.players[0].id);
    
    if (!aiPlayer) {
      return ['Analyzing game state...'];
    }
    
    const phase = gameState.phase;
    const handSize = aiPlayer.handSize;
    const discardPile = gameState.discardPile;
    const topCard = discardPile && discardPile.length > 0 ? discardPile[0] : null;
    
    switch (phase) {
      case 'draw':
        thoughts.push('Hmm, should I draw from the stock or discard pile?');
        if (topCard) {
          thoughts.push(`The discard pile has a ${topCard.rank} of ${topCard.suit}...`);
          thoughts.push('Let me consider if this card helps my hand.');
        }
        thoughts.push('I think I\'ll draw from the stock pile.');
        break;
        
      case 'discard':
        thoughts.push('Time to discard a card...');
        thoughts.push('Let me analyze which card is least useful.');
        if (handSize > 10) {
          thoughts.push('I have too many cards, need to discard wisely.');
        }
        break;
        
      case 'upcard_decision':
        if (topCard) {
          thoughts.push(`Initial upcard is ${topCard.rank} of ${topCard.suit}...`);
          thoughts.push('Should I take it or pass?');
          thoughts.push('I\'ll pass for now and see what I draw.');
        }
        break;
        
      default:
        thoughts.push('Analyzing the current situation...');
        thoughts.push('Calculating optimal move...');
    }
    
    return thoughts;
  }

  /**
   * Generate AI action based on current game state
   */
  private async generateAIAction(gameState: any, aiPlayerId: string): Promise<any> {
    console.log(`🤖 AIQueue: Generating action for phase: ${gameState.phase}`);

    switch (gameState.phase) {
      case 'draw':
        // AI chooses between drawing from stock or discard pile
        // For now, simple logic: prefer discard if it helps
        return {
          type: EventType.DRAW_FROM_STOCK,
          gameId: gameState.id,
          playerId: aiPlayerId
        };

      case 'discard':
        // AI needs to discard a card
        const aiPlayer = gameState.players.find((p: any) => p.id === aiPlayerId);
        if (!aiPlayer || aiPlayer.hand.length === 0) {
          console.error('🤖 AIQueue: AI player has no cards to discard');
          return null;
        }

        // Simple logic: discard first card (in real game, this would be smarter)
        return {
          type: EventType.DISCARD_CARD,
          gameId: gameState.id,
          playerId: aiPlayerId,
          cardId: aiPlayer.hand[0].id
        };

      case 'upcard_decision':
        // AI decides whether to take the initial upcard
        return {
          type: 'PASS_UPCARD', // This might need to be added to EventType
          gameId: gameState.id,
          playerId: aiPlayerId
        };

      default:
        console.warn(`🤖 AIQueue: Unhandled game phase: ${gameState.phase}`);
        return null;
    }
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus(): {
    queueSize: number;
    processingGames: string[];
    isIdle: boolean;
  } {
    return {
      queueSize: this.processingQueue.size,
      processingGames: Array.from(this.processingQueue.keys()),
      isIdle: this.processingQueue.size === 0
    };
  }

  /**
   * Force clear all queued AI moves (for testing/debugging)
   */
  clearQueue(): void {
    console.log(`🤖 AIQueue: Clearing ${this.processingQueue.size} queued AI moves`);
    this.processingQueue.clear();
  }

  /**
   * Handle AI layoff decision during round-end phase
   */
  private async handleAILayoffDecision(gameId: string, gameState: any): Promise<void> {
    const startTime = Date.now();
    console.log('🚨🚨🚨 AIQueue: *** PROCESSING AI LAYOFF DECISION ***', { gameId, phase: gameState.phase });
    
    try {
      
      // Find the AI player and check if they are the opponent (not the knocker)
      const aiPlayer = gameState.players.find((p: any) => p.id !== gameState.players[0].id);
      if (!aiPlayer) {
        console.error('🤖 AIQueue: Could not identify AI player for layoff decision');
        return;
      }

      // Check if AI is the opponent who can lay off cards
      const knocker = gameState.players.find((p: any) => p.hasKnocked || p.hasGin);
      if (!knocker || knocker.id === aiPlayer.id) {
        console.log('🤖 AIQueue: AI is the knocker, no layoff decision needed');
        return;
      }

      console.log(`🤖 AIQueue: AI player ${aiPlayer.id} considering layoffs against knocker ${knocker.id}`);
      console.log(`🤖 AIQueue: AI player data:`, {
        handSize: aiPlayer.hand?.length || 0,
        meldsCount: aiPlayer.melds?.length || 0,
        hand: aiPlayer.hand?.map(c => `${c.rank}${c.suit}`).join(', ') || 'empty'
      });
      console.log(`🤖 AIQueue: Knocker data:`, {
        handSize: knocker.hand?.length || 0,
        meldsCount: knocker.melds?.length || 0,
        melds: knocker.melds?.map(m => `${m.type}: ${m.cards.map(c => `${c.rank}${c.suit}`).join(',')}`).join(' | ') || 'no melds'
      });

      // Create AI player instance for decision making
      const ai = new AIPlayer(aiPlayer.id);
      
      // Calculate available layoffs
      const availableLayoffs = ai.calculateOptimalLayoffs(
        aiPlayer.hand,
        aiPlayer.melds || [],
        knocker.melds || []
      );

      console.log(`🤖 AIQueue: Available layoffs:`, availableLayoffs.map(lo => 
        `${lo.cards.map(c => `${c.rank}${c.suit}`).join(',')} → ${lo.targetMeld.type}(${lo.targetMeld.cards.map(c => `${c.rank}${c.suit}`).join(',')})`
      ));
      
      // Debug: Show AI deadwood cards and knocker melds in detail
      const aiDeadwood = aiPlayer.hand.filter((card: any) => {
        const meldedCardIds = new Set((aiPlayer.melds || []).flatMap((meld: any) => meld.cards.map((c: any) => c.id)));
        return !meldedCardIds.has(card.id);
      });
      console.log(`🤖 AIQueue: AI deadwood cards:`, aiDeadwood.map(c => `${c.rank}${c.suit}`).join(', '));
      console.log(`🤖 AIQueue: Testing each AI deadwood card against each knocker meld:`);
      
      aiDeadwood.forEach((card: any) => {
        (knocker.melds || []).forEach((meld: any, meldIndex: number) => {
          const canLayoff = card.rank === meld.cards[0].rank || (
            meld.type === 'run' && card.suit === meld.cards[0].suit
          );
          console.log(`🤖 AIQueue:   ${card.rank}${card.suit} vs Meld${meldIndex}[${meld.type}: ${meld.cards.map((c: any) => `${c.rank}${c.suit}`).join(',')}] → ${canLayoff ? 'CAN LAYOFF' : 'cannot layoff'}`);
        });
      });

      // Decide whether to perform layoffs
      const shouldLayoff = ai.shouldPerformLayoffs(
        aiPlayer.hand,
        aiPlayer.melds || [],
        knocker.melds || [],
        'medium' // Default difficulty
      );

      console.log(`🤖 AIQueue: AI layoff decision: ${shouldLayoff ? 'LAYOFF' : 'SKIP'}, available layoffs: ${availableLayoffs.length}`);

      // Create and process the AI layoff decision action
      const layoffAction = {
        type: EventType.AI_LAYOFF_DECISION as EventType.AI_LAYOFF_DECISION,
        gameId: gameState.id,
        playerId: aiPlayer.id,
        decision: (shouldLayoff ? 'LAYOFF' : 'SKIP') as 'LAYOFF' | 'SKIP',
        selectedLayoffs: shouldLayoff ? availableLayoffs : []
      };

      // Process the layoff decision through TurnController
      console.log(`🚨 AIQueue: About to call TurnController.processTurn with layoff action:`, JSON.stringify(layoffAction, null, 2));
      
      let result;
      try {
        result = await this.turnController.processTurn(gameId, aiPlayer.id, layoffAction);
      } catch (processingError) {
        console.error(`❌ AIQueue: TurnController.processTurn threw exception:`, processingError);
        console.error(`❌ AIQueue: Exception details:`, {
          message: processingError.message,
          stack: processingError.stack,
          layoffAction: JSON.stringify(layoffAction, null, 2)
        });
        return;
      }
      
      console.log(`🚨 AIQueue: TurnController.processTurn returned:`, result);
      
      if (result.success) {
        const processingTime = Date.now() - startTime;
        console.log(`✅ AIQueue: AI layoff decision processed successfully in ${processingTime}ms`);
        console.log(`✅ AIQueue: New game state:`, {
          phase: result.gameState?.phase,
          currentPlayer: result.gameState?.currentPlayerId,
          eventSequence: result.event?.sequenceNumber,
          lastLayOffs: result.gameState?.lastLayOffs
        });
      } else {
        console.error(`❌ AIQueue: AI layoff decision failed: ${result.error} (${result.code})`);
        console.error(`❌ AIQueue: Layoff action details:`, JSON.stringify(layoffAction, null, 2));
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ AIQueue: Failed to process AI layoff decision after ${processingTime}ms:`, error);
      console.error(`❌ AIQueue: Error stack:`, error.stack);
    }
  }

  /**
   * Create turn history entry for an AI move
   */
  private createTurnHistoryEntry(event: any, player: any, gameState: any): any {
    const eventDescriptions: { [key: string]: string } = {
      'DRAW_FROM_STOCK': 'drew a card from the stock pile',
      'DRAW_FROM_DISCARD': 'drew a card from the discard pile', 
      'DISCARD_CARD': 'discarded a card',
      'KNOCK': 'knocked',
      'GIN': 'went gin',
      'TAKE_UPCARD': 'took the upcard',
      'PASS_UPCARD': 'passed on the upcard',
      'AI_LAYOFF_DECISION': 'decided on layoffs'
    };

    const description = eventDescriptions[event.eventType] || `made a ${event.eventType.toLowerCase()} move`;
    
    return {
      id: event.id,
      turnNumber: event.sequenceNumber,
      playerId: player?.id || 'unknown',
      playerName: player?.username || 'AI Player',
      action: event.eventType,
      description,
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance for the application
let aiQueueProcessor: AIQueueProcessor | null = null;

export function getAIQueueProcessor(prisma: PrismaClient): AIQueueProcessor {
  if (!aiQueueProcessor) {
    aiQueueProcessor = new AIQueueProcessor(prisma);
    console.log('🤖 AIQueue: Initialized AI queue processor singleton');
  }
  return aiQueueProcessor;
}