import { 
  GameEvent, 
  GameEventData, 
  EventType,
  DrawFromStockEventData,
  DrawFromDiscardEventData,
  DiscardCardEventData,
  KnockEventData,
  GinEventData,
  GameStartedEventData,
  StartNewRoundEventData,
  GameFinishedEventData,
  RoundEndedEventData,
  LayOffEventData,
  LayoffCompletedEventData,
  PlayerLeftEventData,
  GameCancelledEventData,
  AIThinkingStartedEventData,
  LayoffPhaseStartedEventData,
  isDrawFromStockEvent,
  isDrawFromDiscardEvent,
  isDiscardCardEvent,
  isKnockEvent,
  isGinEvent
} from '../types/events';
import { GameState, GameStatus, GamePhase, Card, PlayerState, Meld } from '../types/game';
import { createDeck, shuffleDeck } from '../utils/cards';
import { calculateDeadwood, findOptimalMelds } from '../utils/scoring';

/**
 * EventSourcingEngine - Rebuilds game state by replaying events
 * 
 * This is the core of our event-sourced architecture. It takes a list of events
 * and applies them in sequence to compute the current game state.
 */
export class EventSourcingEngine {
  private gameId: string;
  private events: GameEvent[] = [];
  private currentState: GameState | null = null;
  private initialState?: GameState;
  private startingSequence: number;

  constructor(gameId: string, events: GameEvent[] = [], initialState?: GameState, startingSequence: number = 0) {
    this.gameId = gameId;
    this.events = events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    this.initialState = initialState ? this.cloneState(initialState) : undefined;
    this.startingSequence = startingSequence;
  }

  /**
   * Replay all events to compute current game state - ENHANCED WITH SEQUENCE RECOVERY
   */
  public replayEvents(): GameState {
    console.log(`🔄 EventSourcing: Replaying ${this.events.length} events for game ${this.gameId}`);
    
    // EDGE CASE: Validate and recover event sequences
    const sequenceValidation = this.validateAndRecoverEventSequence();
    if (!sequenceValidation.valid) {
      console.error(`❌ EventSourcing: Event sequence validation failed: ${sequenceValidation.error}`);
      throw new Error(`Event sequence validation failed: ${sequenceValidation.error}`);
    }

    if (sequenceValidation.recovered) {
      console.log(`🔧 EventSourcing: Recovered ${sequenceValidation.recoveredCount} event sequence issues`);
    }

    if (this.events.length === 0 && this.initialState) {
      this.currentState = this.cloneState(this.initialState);
      return this.currentState;
    }

    // Start with snapshot state when available, otherwise create a fresh state
    this.currentState = this.initialState ? this.cloneState(this.initialState) : this.createInitialState();
    
    // Apply each event in sequence
    for (const event of this.events) {
      try {
        console.log(`🔄 EventSourcing: Applying event ${event.sequenceNumber}: ${event.eventType}`);
        this.applyEvent(event);
      } catch (error) {
        console.error(`❌ EventSourcing: Failed to apply event ${event.sequenceNumber}:`, error);
        
        // EDGE CASE: Attempt recovery from corrupted event
        const recoveryResult = this.attemptEventRecovery(event, error);
        if (recoveryResult.recovered) {
          console.log(`🔧 EventSourcing: Recovered from event ${event.sequenceNumber} error`);
          continue;
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Event replay failed at sequence ${event.sequenceNumber}: ${errorMessage}`);
      }
    }

    if (!this.currentState) {
      throw new Error('Failed to replay events - no state computed');
    }

    console.log(`✅ EventSourcing: Replayed to state - Phase: ${this.currentState.phase}, Current Player: ${this.currentState.currentPlayerId}`);
    return this.currentState;
  }

  /**
   * Apply a single event to the current state
   */
  public applyEvent(event: GameEvent): GameState {
    if (!this.currentState) {
      throw new Error('Cannot apply event without initial state');
    }

    console.log(`🔄 Applying ${event.eventType} event (seq: ${event.sequenceNumber})`);

    switch (event.eventType) {
      case EventType.GAME_CREATED:
        return this.applyGameCreated(event);
        
      case EventType.GAME_STARTED:
        return this.applyGameStarted(event);
        
      case EventType.PLAYER_JOINED:
        return this.applyPlayerJoined(event);
        
      case EventType.PLAYER_READY:
        return this.applyPlayerReady(event);
        
      case EventType.TAKE_UPCARD:
        return this.applyTakeUpcard(event);
        
      case EventType.PASS_UPCARD:
        return this.applyPassUpcard(event);
        
      case EventType.DRAW_FROM_STOCK:
        if (!isDrawFromStockEvent(event)) throw new Error('Invalid event data for DRAW_FROM_STOCK');
        return this.applyDrawFromStock(event);
        
      case EventType.DRAW_FROM_DISCARD:
        if (!isDrawFromDiscardEvent(event)) throw new Error('Invalid event data for DRAW_FROM_DISCARD');
        return this.applyDrawFromDiscard(event);
        
      case EventType.DISCARD_CARD:
        if (!isDiscardCardEvent(event)) throw new Error('Invalid event data for DISCARD_CARD');
        return this.applyDiscardCard(event);
        
      case EventType.KNOCK:
        if (!isKnockEvent(event)) throw new Error('Invalid event data for KNOCK');
        return this.applyKnock(event);
        
      case EventType.GIN:
        if (!isGinEvent(event)) throw new Error('Invalid event data for GIN');
        return this.applyGin(event);

      case EventType.LAY_OFF:
        return this.applyLayOff(event);
        
      case EventType.START_NEW_ROUND:
        return this.applyStartNewRound(event);
        
      case EventType.GAME_FINISHED:
        return this.applyGameFinished(event);
        
      case EventType.AI_LAYOFF_DECISION:
        return this.applyAILayoffDecision(event);
        
      case EventType.LAYOFF_COMPLETED:
        return this.applyLayoffCompleted(event);
        
      case EventType.PLAYER_READY_NEXT_ROUND:
        return this.applyPlayerReadyNextRound(event);
        
      case EventType.ROUND_STARTED:
        return this.applyRoundStarted(event);
        
      case EventType.ROUND_ENDED:
        return this.applyRoundEnded(event);
        
      case EventType.PLAYER_LEFT:
        return this.applyPlayerLeft(event);
        
      case EventType.GAME_CANCELLED:
        return this.applyGameCancelled(event);
        
      case EventType.AI_THINKING_STARTED:
        return this.applyAIThinkingStarted(event);
        
      case EventType.LAYOFF_PHASE_STARTED:
        return this.applyLayoffPhaseStarted(event);
        
      default:
        console.warn(`⚠️ EventSourcing: Unhandled event type: ${event.eventType}`);
        return this.currentState;
    }
  }

  /**
   * Get current state without replaying
   */
  public getCurrentState(): GameState | null {
    return this.currentState;
  }

  /**
   * Add a new event and apply it
   */
  public addEvent(event: GameEvent): GameState {
    this.events.push(event);
    this.events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    return this.applyEvent(event);
  }

  // Private event application methods

  private cloneState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state));
  }

  private createInitialState(): GameState {
    return {
      id: this.gameId,
      status: GameStatus.Waiting,
      phase: GamePhase.Waiting, // Games start in waiting phase, not upcard decision
      currentPlayerId: '',
      players: [],
      stockPileCount: 52,
      stockPile: [], // Will be set during GAME_STARTED event
      discardPile: [],
      turnTimer: 0,
      isPrivate: false,
      vsAI: false,
      gameOver: false,
      isProcessing: false,
      isLoading: false,
    };
  }

  private applyGameCreated(event: GameEvent): GameState {
    const data = event.eventData as any; // GameCreatedEventData
    
    this.currentState!.status = GameStatus.Waiting;
    this.currentState!.isPrivate = data.isPrivate;
    this.currentState!.vsAI = data.vsAI;
    
    // Add player 1 with username from event data
    const player1Username = data.player1Username || '';
    this.currentState!.players.push(this.createEmptyPlayerState(data.player1Id, player1Username));
    console.log(`🎮 EventSourcing: Created player 1 ${player1Username} (${data.player1Id})`);
    
    // Only add player 2 for AI games or if we have a real second player ID
    // For PvP games, create a placeholder until a real player joins
    if (data.vsAI && data.player2Id === 'ai-player') {
      const player2Username = data.player2Username || 'AI';
      this.currentState!.players.push(this.createEmptyPlayerState(data.player2Id, player2Username));
      console.log(`🎮 EventSourcing: Created AI player ${player2Username} (${data.player2Id})`);
    } else if (!data.vsAI && data.player2Id === 'waiting-for-player') {
      // PvP game - create placeholder for second player
      this.currentState!.players.push(this.createEmptyPlayerState('waiting-for-player', 'Waiting...'));
      console.log(`🎮 EventSourcing: Created waiting placeholder for PvP game`);
    } else if (!data.vsAI && data.player2Id && data.player2Id !== 'waiting-for-player') {
      // PvP game with actual second player ID (not a placeholder)
      this.currentState!.players.push(this.createEmptyPlayerState(data.player2Id, ''));
    }
    // For PvP games without a second player, keep players array with just player1

    return this.currentState!;
  }

  private applyGameStarted(event: GameEvent): GameState {
    const data = event.eventData as GameStartedEventData;
    
    this.currentState!.status = GameStatus.Active;
    this.currentState!.phase = GamePhase.UpcardDecision;
    this.currentState!.currentPlayerId = data.startingPlayerId;
    
    // Set initial hands
    const player1 = this.currentState!.players.find(p => p.id === data.player1Id);
    const player2 = this.currentState!.players.find(p => p.id === data.player2Id);
    
    if (player1) {
      player1.hand = data.initialDeal.player1Hand;
      player1.handSize = data.initialDeal.player1Hand.length;
      // Calculate initial melds and deadwood
      this.updatePlayerMeldsAndDeadwood(player1);
    }
    
    if (player2) {
      player2.hand = data.initialDeal.player2Hand;
      player2.handSize = data.initialDeal.player2Hand.length;
      // Calculate initial melds and deadwood
      this.updatePlayerMeldsAndDeadwood(player2);
    }
    
    // Set discard pile and stock
    this.currentState!.discardPile = [data.initialDeal.topDiscardCard];
    this.currentState!.stockPileCount = data.initialDeal.stockSize;
    this.currentState!.stockPile = data.initialDeal.stockPile || [];

    return this.currentState!;
  }

  private applyPlayerJoined(event: GameEvent): GameState {
    const data = event.eventData as any; // PlayerJoinedEventData
    
    // Find and replace the "waiting-for-player" placeholder
    const waitingPlayerIndex = this.currentState!.players.findIndex(p => p.id === 'waiting-for-player');
    
    if (waitingPlayerIndex !== -1) {
      // Replace the waiting player with the actual joined player
      const waitingPlayer = this.currentState!.players[waitingPlayerIndex];
      
      // Update the player info but keep the game state (hand, etc.)
      waitingPlayer.id = data.playerId;
      waitingPlayer.username = data.playerUsername;
      
      console.log(`🎮 EventSourcing: Player ${data.playerUsername} (${data.playerId}) replaced waiting slot`);
    } else if (this.currentState!.players.length === 1) {
      // Add the new player as player 2 (fallback case)
      this.currentState!.players.push(this.createEmptyPlayerState(data.playerId, data.playerUsername));
      console.log(`🎮 EventSourcing: Player ${data.playerUsername} joined as player 2`);
    }
    
    // Game should stay in WAITING status until both players are ready
    // The status will be changed to ACTIVE by the GAME_STARTED event when both players are ready
    console.log(`🎮 EventSourcing: Game now has ${this.currentState!.players.length} players, keeping WAITING status for ready system`);

    return this.currentState!;
  }

  private applyPlayerReady(event: GameEvent): GameState {
    const data = event.eventData as any; // PlayerReadyEventData
    
    // Find the player and mark them as ready
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    if (player) {
      player.isReady = true;
      console.log(`🎮 EventSourcing: Player ${player.username} (${player.id}) marked as ready`);
    }
    
    // Check if both players are ready
    const readyPlayers = this.currentState!.players.filter(p => p.isReady).length;
    const totalPlayers = this.currentState!.players.length;
    
    console.log(`🎮 EventSourcing: Ready players: ${readyPlayers}/${totalPlayers}`);
    
    // If all players are ready and we have at least 2 players, game can start
    // Note: GAME_STARTED event should be generated separately to actually start the game
    
    return this.currentState!;
  }

  private applyTakeUpcard(event: GameEvent): GameState {
    const data = event.eventData as any;
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!player) {
      throw new Error(`Player ${data.playerId} not found`);
    }

    if (!data.cardTaken) {
      throw new Error('No card taken in TAKE_UPCARD event');
    }

    // Add upcard to player's hand
    player.hand.push(data.cardTaken);
    player.handSize = player.hand.length;
    player.lastDrawnCardId = data.cardTaken.id;

    // Update player's melds and deadwood after taking upcard
    this.updatePlayerMeldsAndDeadwood(player);

    // Update discard pile (remove the upcard)
    this.currentState!.discardPile = data.discardPileAfter || this.currentState!.discardPile.slice(1);

    // Transition to discard phase
    this.currentState!.phase = GamePhase.Discard;
    // Current player stays the same as they need to discard

    return this.currentState!;
  }

  private applyPassUpcard(event: GameEvent): GameState {
    const data = event.eventData as any;
    
    // Count how many players have passed
    const passedPlayers = this.events.filter(e => 
      e.eventType === EventType.PASS_UPCARD && 
      e.sequenceNumber <= event.sequenceNumber
    ).length;

    if (passedPlayers >= 2) {
      // Both players have passed, transition to draw phase
      // Non-dealer (second player in the list) goes first in draw phase
      const nonDealerPlayer = this.currentState!.players[1];
      this.currentState!.phase = GamePhase.Draw;
      this.currentState!.currentPlayerId = nonDealerPlayer.id;
    } else {
      // First player passed, switch to the other player
      // Find the other player (not the one who just passed)
      const otherPlayer = this.currentState!.players.find(p => p.id !== data.playerId);
      if (otherPlayer) {
        this.currentState!.currentPlayerId = otherPlayer.id;
      }
      // Stay in upcard decision phase
    }

    return this.currentState!;
  }

  private applyDrawFromStock(event: GameEvent<DrawFromStockEventData>): GameState {
    const data = event.eventData;
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!player) {
      throw new Error(`Player ${data.playerId} not found`);
    }

    // Add card to player's hand
    player.hand.push(data.cardDrawn);
    player.handSize = player.hand.length;
    player.lastDrawnCardId = data.cardDrawn.id;
    
    // Update player's melds and deadwood after drawing
    this.updatePlayerMeldsAndDeadwood(player);
    
    // Update stock pile
    this.currentState!.stockPileCount = data.stockSizeAfter;
    this.currentState!.stockPile = data.newStockPile || this.currentState!.stockPile;
    
    // Move to discard phase
    this.currentState!.phase = GamePhase.Discard;

    return this.currentState!;
  }

  private applyDrawFromDiscard(event: GameEvent<DrawFromDiscardEventData>): GameState {
    const data = event.eventData;
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!player) {
      throw new Error(`Player ${data.playerId} not found`);
    }

    // Add card to player's hand
    player.hand.push(data.cardDrawn);
    player.handSize = player.hand.length;
    player.lastDrawnCardId = data.cardDrawn.id;
    
    // Update player's melds and deadwood after drawing
    this.updatePlayerMeldsAndDeadwood(player);
    
    // Update discard pile
    this.currentState!.discardPile = data.discardPileAfter;
    
    // Move to discard phase
    this.currentState!.phase = GamePhase.Discard;

    return this.currentState!;
  }

  private applyDiscardCard(event: GameEvent<DiscardCardEventData>): GameState {
    const data = event.eventData;
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!player) {
      throw new Error(`Player ${data.playerId} not found`);
    }

    // Remove card from player's hand
    player.hand = player.hand.filter(card => card.id !== data.cardDiscarded.id);
    player.handSize = player.hand.length;
    player.lastDrawnCardId = undefined;
    
    // Update player's melds and deadwood after discarding
    this.updatePlayerMeldsAndDeadwood(player);
    
    // Update discard pile
    this.currentState!.discardPile = data.discardPileAfter;
    
    // Switch to next player
    this.currentState!.currentPlayerId = data.nextPlayerId;
    this.currentState!.phase = GamePhase.Draw;

    return this.currentState!;
  }

  private applyKnock(event: GameEvent<KnockEventData>): GameState {
    const data = event.eventData;
    const knocker = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!knocker) {
      throw new Error(`Knocker ${data.playerId} not found`);
    }

    // Set knocker state  
    knocker.hasKnocked = true;
    
    // Only update hands/melds if the knock event includes this data (new format)
    // For legacy events without complete data, preserve existing state
    if (data.knockerHand !== undefined) {
      knocker.hand = data.knockerHand;
      knocker.handSize = data.knockerHand.length;
    }
    if (data.knockerMelds !== undefined) {
      knocker.melds = data.knockerMelds;
    }
    if (data.deadwoodValue !== undefined) {
      knocker.deadwood = data.deadwoodValue;
    }
    // Don't add scores to player totals yet - wait for LAYOFF_COMPLETED
    // Store initial scores for display only
    if (data.scores?.knocker !== undefined) {
      // Store for display but don't add to player total yet
      (knocker as any).initialRoundScore = data.scores.knocker;
    }
    
    // Store additional display data if available
    if (data.knockerFullHand !== undefined) {
      (knocker as any).fullHandForDisplay = data.knockerFullHand;
    }
    if (data.knockerDeadwoodCards !== undefined) {
      (knocker as any).deadwoodCardsForDisplay = data.knockerDeadwoodCards;
    }

    // Set opponent state
    const opponent = this.currentState!.players.find(p => p.id !== data.playerId);
    if (opponent) {
      // Only update opponent data if provided in the event
      if (data.opponentHand !== undefined) {
        opponent.hand = data.opponentHand; // Expose opponent's hand for round over display
        opponent.handSize = data.opponentHand.length;
      }
      if (data.opponentMelds !== undefined) {
        opponent.melds = data.opponentMelds;
      }
      if (data.scores?.opponent !== undefined) {
        // Store for display but don't add to player total yet
        (opponent as any).initialRoundScore = data.scores.opponent;
      }
    }

    // Update discard pile with knocked card
    this.currentState!.discardPile = data.discardPileAfter;

    // Set round scores
    this.currentState!.roundScores = data.scores;
    
    // Check if game should be over (player reached 100+ points)
    const playerScores = this.currentState!.players.map(p => p.score);
    const maxScore = Math.max(...playerScores);
    
    if (maxScore >= 100) {
      console.log(`🏁 EventSourcing: Game over detected after knock! Max score: ${maxScore}`);
      // Game is over - set game over state directly (skip layoff phase)
      this.currentState!.phase = GamePhase.GameOver;
      this.currentState!.gameOver = true;
      this.currentState!.status = GameStatus.Finished;
      
      // Determine winner (player with highest score)
      const winnerIndex = playerScores.indexOf(maxScore);
      this.currentState!.winner = this.currentState!.players[winnerIndex].id;
      
      console.log(`🏆 EventSourcing: Winner is ${this.currentState!.winner} with ${maxScore} points`);
    } else {
      // Set phase to layoff to allow opponent to lay off cards
      // This will be changed to RoundOver after layoff decisions are made
      this.currentState!.phase = GamePhase.Layoff;
    }

    return this.currentState!;
  }

  private applyGin(event: GameEvent<GinEventData>): GameState {
    const data = event.eventData;
    const ginner = this.currentState!.players.find(p => p.id === data.playerId);
    
    if (!ginner) {
      throw new Error(`Ginner ${data.playerId} not found`);
    }

    // Set ginner state
    ginner.hasGin = true;
    ginner.hand = data.ginnerHand; // Update ginner hand after discard
    ginner.handSize = data.ginnerHand.length;
    ginner.melds = data.ginnerMelds;
    ginner.deadwood = 0;
    console.log(`🎯 EventSourcing: GIN - Adding ${data.scores.ginner} points to ginner ${ginner.id} (was ${ginner.score})`);
    ginner.score += data.scores.ginner;
    console.log(`🎯 EventSourcing: GIN - Ginner ${ginner.id} new score: ${ginner.score}`);

    // Set opponent state
    const opponent = this.currentState!.players.find(p => p.id !== data.playerId);
    if (opponent) {
      opponent.hand = data.opponentHand; // Expose opponent's hand for round over display
      opponent.handSize = data.opponentHand.length;
      opponent.melds = data.opponentMelds;
      console.log(`🎯 EventSourcing: GIN - Adding ${data.scores.opponent} points to opponent ${opponent.id} (was ${opponent.score})`);
      opponent.score += data.scores.opponent;
      console.log(`🎯 EventSourcing: GIN - Opponent ${opponent.id} new score: ${opponent.score}`);
    }

    // Set round scores
    this.currentState!.roundScores = data.scores;
    
    // Check if game should be over (player reached 100+ points)
    const playerScores = this.currentState!.players.map(p => p.score);
    const maxScore = Math.max(...playerScores);
    
    if (maxScore >= 100) {
      console.log(`🏁 EventSourcing: Game over detected after gin! Max score: ${maxScore}`);
      // Game is over - set game over state directly (skip layoff phase)
      this.currentState!.phase = GamePhase.GameOver;
      this.currentState!.gameOver = true;
      this.currentState!.status = GameStatus.Finished;
      
      // Determine winner (player with highest score)
      const winnerIndex = playerScores.indexOf(maxScore);
      this.currentState!.winner = this.currentState!.players[winnerIndex].id;
      
      console.log(`🏆 EventSourcing: Winner is ${this.currentState!.winner} with ${maxScore} points`);
    } else {
      // Set phase to layoff to allow opponent to lay off cards
      // This will be changed to RoundOver after layoff decisions are made
      this.currentState!.phase = GamePhase.Layoff;
    }

    return this.currentState!;
  }

  private applyGameFinished(event: GameEvent): GameState {
    const data = event.eventData as any; // GameFinishedEventData
    
    this.currentState!.status = GameStatus.Finished;
    this.currentState!.phase = GamePhase.GameOver;
    this.currentState!.winner = data.winnerId;
    this.currentState!.gameOver = true;

    return this.currentState!;
  }

  private applyStartNewRound(event: GameEvent): GameState {
    const data = event.eventData as StartNewRoundEventData;
    
    // Reset game state for new round
    this.currentState!.phase = GamePhase.UpcardDecision;
    this.currentState!.roundNumber = data.roundNumber;
    
    // Clear round-specific state
    this.currentState!.lastKnocker = undefined;
    this.currentState!.lastKnockerMelds = undefined;
    this.currentState!.lastLayOffs = undefined;
    
    // Check if newDeal exists (backward compatibility for old events)
    let newDeal = data.newDeal;
    if (!newDeal) {
      console.log(`🔄 EventSourcing: Legacy START_NEW_ROUND event detected, generating new cards`);
      // For backward compatibility with old events that don't have newDeal
      const { createDeck, shuffleDeck } = require('../utils/cards');
      const deck = shuffleDeck(createDeck());
      const player1Hand = deck.splice(0, 10);
      const player2Hand = deck.splice(0, 10);
      const topDiscardCard = deck.splice(0, 1)[0];
      
      newDeal = {
        player1Hand,
        player2Hand,
        topDiscardCard,
        stockSize: deck.length,
        stockPile: deck
      };
    }
    
    // Set new hands for players
    const player1 = this.currentState!.players[0];
    const player2 = this.currentState!.players[1];
    
    if (player1) {
      player1.hand = newDeal.player1Hand;
      player1.handSize = 10;
      player1.hasKnocked = false;
      player1.hasGin = false;
      player1.deadwood = calculateDeadwood(player1.hand, []);
      player1.melds = [];
      player1.lastDrawnCardId = undefined;
    }
    
    if (player2) {
      player2.hand = newDeal.player2Hand;
      player2.handSize = 10;
      player2.hasKnocked = false;
      player2.hasGin = false;
      player2.deadwood = calculateDeadwood(player2.hand, []);
      player2.melds = [];
      player2.lastDrawnCardId = undefined;
    }
    
    // Set new discard pile and stock pile
    this.currentState!.discardPile = [newDeal.topDiscardCard];
    this.currentState!.stockPileCount = newDeal.stockSize;
    this.currentState!.stockPile = newDeal.stockPile || [];
    
    // Set starting player (alternate from previous round)
    const currentPlayer = this.currentState!.players[0];
    this.currentState!.currentPlayerId = currentPlayer.id;
    
    return this.currentState!;
  }

  private applyAILayoffDecision(event: GameEvent): GameState {
    const data = event.eventData as any; // AILayoffDecisionEventData
    
    console.log(`🤖 EventSourcing: AI layoff decision: ${data.decision} by player ${data.playerId}`);
    
    // Apply the layoffs to the game state if AI decided to lay off
    if (data.decision === 'LAYOFF' && data.selectedLayoffs && data.selectedLayoffs.length > 0) {
      console.log(`🤖 EventSourcing: Applying ${data.selectedLayoffs.length} layoffs`);
      
      // Store the layoffs in game state for UI display
      this.currentState!.lastLayOffs = data.selectedLayoffs.map((layoff: any) => ({
        cards: layoff.cards,
        targetMeld: layoff.targetMeld
      }));
    } else {
      // No layoffs made
      this.currentState!.lastLayOffs = [];
      console.log(`🤖 EventSourcing: AI chose to skip layoffs`);
    }
    
    // Check if game should be over (player reached 100+ points)
    const playerScores = this.currentState!.players.map(p => p.score);
    const maxScore = Math.max(...playerScores);
    
    if (maxScore >= 100) {
      console.log(`🏁 EventSourcing: Game over detected! Max score: ${maxScore}`);
      // Game is over - set game over state
      this.currentState!.phase = GamePhase.GameOver;
      this.currentState!.gameOver = true;
      this.currentState!.status = GameStatus.Finished;
      
      // Determine winner (player with highest score)
      const winnerIndex = playerScores.indexOf(maxScore);
      this.currentState!.winner = this.currentState!.players[winnerIndex].id;
      
      console.log(`🏆 EventSourcing: Winner is ${this.currentState!.winner} with ${maxScore} points`);
    } else {
      // Apply final scores from initialRoundScore to actual score totals
      this.currentState!.players.forEach(player => {
        const initialScore = (player as any).initialRoundScore || 0;
        if (initialScore > 0) {
          console.log(`🎯 EventSourcing: AI_LAYOFF_DECISION - Adding ${initialScore} points to player ${player.id} (was ${player.score})`);
          player.score += initialScore;
          console.log(`🎯 EventSourcing: AI_LAYOFF_DECISION - Player ${player.id} new score: ${player.score}`);
          // Clear the initial round score after applying it
          (player as any).initialRoundScore = 0;
        }
      });
      
      // Round over, but game continues
      const updatedScores = this.currentState!.players.map(p => p.score);
      console.log(`🔄 EventSourcing: Round over, scores: ${updatedScores.join(' - ')}, game continues`);
      this.currentState!.phase = GamePhase.RoundOver;
    }
    
    return this.currentState!;
  }

  private applyLayOff(event: GameEvent): GameState {
    const data = event.eventData as LayOffEventData;

    if (!this.currentState) {
      throw new Error('EventSourcing: Cannot apply layoff without current state');
    }

    if (!this.currentState.lastLayOffs) {
      this.currentState.lastLayOffs = [];
    }

    this.currentState.lastLayOffs.push({
      cards: data.cardsLayedOff,
      targetMeld: data.targetMeld
    });

    if (data.playerId) {
      const player = this.currentState.players.find(p => p.id === data.playerId);
      if (player) {
        data.cardsLayedOff.forEach(card => {
          const index = player.hand.findIndex(handCard => handCard.id === card.id);
          if (index >= 0) {
            player.hand.splice(index, 1);
          }
        });
        player.handSize = player.hand.length;
        player.deadwood = calculateDeadwood(player.hand, player.melds || []);
      }
    }

    return this.currentState!;
  }

  private applyLayoffCompleted(event: GameEvent): GameState {
    const data = event.eventData as any; // LayoffCompletedEventData
    
    console.log(`🎭 EventSourcing: Layoff completed by player ${data.playerId}`);
    
    // Apply the layoffs to the game state
    if (data.layoffs && data.layoffs.length > 0) {
      console.log(`🎭 EventSourcing: Applying ${data.layoffs.length} layoffs`);
      
      // Store the layoffs in game state for UI display
      this.currentState!.lastLayOffs = data.layoffs.map((layoff: any) => ({
        cards: layoff.cards,
        targetMeld: layoff.targetMeld
      }));
    } else {
      // No layoffs made
      this.currentState!.lastLayOffs = [];
      console.log(`🎭 EventSourcing: Player chose to skip layoffs`);
    }
    
    // Update player scores if provided
    if (data.finalScores) {
      const knocker = this.currentState!.players.find(p => p.hasKnocked);
      const opponent = this.currentState!.players.find(p => !p.hasKnocked);
      
      if (knocker && opponent) {
        console.log(`🎯 EventSourcing: Applying final scores - knocker: ${data.finalScores.knocker}, opponent: ${data.finalScores.opponent}`);
        
        // Add final scores to player totals
        knocker.score += data.finalScores.knocker;
        opponent.score += data.finalScores.opponent;
        
        // Update round scores for display
        this.currentState!.roundScores = {
          knocker: data.finalScores.knocker,
          opponent: data.finalScores.opponent
        };
        
        console.log(`🎯 EventSourcing: Updated player totals - knocker: ${knocker.score}, opponent: ${opponent.score}`);
      }
    }
    
    // Check if game should be over (player reached 100+ points)
    const playerScores = this.currentState!.players.map(p => p.score);
    const maxScore = Math.max(...playerScores);
    
    if (maxScore >= 100) {
      console.log(`🏁 EventSourcing: Game over detected! Max score: ${maxScore}`);
      // Game is over - set game over state
      this.currentState!.phase = GamePhase.GameOver;
      this.currentState!.gameOver = true;
      this.currentState!.status = GameStatus.Finished;
      
      // Determine winner (player with highest score)
      const winnerIndex = playerScores.indexOf(maxScore);
      this.currentState!.winner = this.currentState!.players[winnerIndex].id;
      
      console.log(`🏆 EventSourcing: Winner is ${this.currentState!.winner} with ${maxScore} points`);
    } else {
      // Round over, but game continues
      console.log(`🔄 EventSourcing: Round over, game continues`);
      this.currentState!.phase = GamePhase.RoundOver;
    }
    
    return this.currentState!;
  }

  private applyPlayerReadyNextRound(event: GameEvent): GameState {
    const data = event.eventData as any; // PlayerReadyNextRoundEventData
    
    console.log(`🎯 EventSourcing: Player ${data.playerId} ready for next round`);
    console.log(`🎯 EventSourcing: Current players before update:`, this.currentState!.players.map(p => ({ id: p.id, username: p.username, isReadyForNextRound: p.isReadyForNextRound })));
    
    // Mark player as ready for next round
    const player = this.currentState!.players.find(p => p.id === data.playerId);
    if (player) {
      player.isReadyForNextRound = data.ready;
      console.log(`✅ EventSourcing: Player ${data.playerId} marked as ${data.ready ? 'ready' : 'not ready'} for next round`);
      console.log(`✅ EventSourcing: Players after update:`, this.currentState!.players.map(p => ({ id: p.id, username: p.username, isReadyForNextRound: p.isReadyForNextRound })));
    } else {
      console.error(`❌ EventSourcing: Player ${data.playerId} not found in game state`);
      console.error(`❌ EventSourcing: Available players:`, this.currentState!.players.map(p => p.id));
    }
    
    return this.currentState!;
  }

  private applyRoundStarted(event: GameEvent): GameState {
    const data = event.eventData as any; // RoundStartedEventData
    
    console.log(`🚀 EventSourcing: Starting new round ${data.roundNumber}`);
    
    // Reset all player ready states
    this.currentState!.players.forEach(player => {
      player.isReadyForNextRound = false;
      player.hasKnocked = false;
      player.hasGin = false;
      player.melds = [];
    });
    
    // Update round number and reset phase
    this.currentState!.roundNumber = data.roundNumber;
    this.currentState!.phase = GamePhase.Draw; // Start new round in draw phase
    
    // Deal new cards if provided
    if (data.newDeal) {
      const { createDeck, shuffleDeck } = require('../utils/cards');
      const deck = shuffleDeck(createDeck());
      
      // Deal 10 cards to each player
      const player1Hand = deck.splice(0, 10);
      const player2Hand = deck.splice(0, 10);
      const topDiscardCard = deck.splice(0, 1)[0];
      
      this.currentState!.players[0].hand = player1Hand;
      this.currentState!.players[1].hand = player2Hand;
      this.currentState!.discardPile = [topDiscardCard];
      this.currentState!.stockPile = deck;
      this.currentState!.stockPileCount = deck.length;
      
      // Set first player as current
      this.currentState!.currentPlayerId = this.currentState!.players[0].id;
      
      console.log(`🃏 EventSourcing: New round dealt - ${player1Hand.length} cards to player 1, ${player2Hand.length} cards to player 2`);
    }
    
    // Clear round result data
    this.currentState!.lastKnocker = undefined;
    this.currentState!.lastKnockerMelds = undefined;
    this.currentState!.lastLayOffs = [];
    this.currentState!.roundScores = undefined;
    
    return this.currentState!;
  }

  private applyRoundEnded(event: GameEvent): GameState {
    const data = event.eventData as RoundEndedEventData;
    
    console.log(`🏁 EventSourcing: Round ended - ${data.endType} by ${data.knockerId}`);
    
    // ROUND_ENDED is purely for audit trail - scores are already applied by KNOCK/GIN events
    // We just store the round result information for display and history
    this.currentState!.lastKnocker = data.knockerId;
    this.currentState!.lastKnockerMelds = data.knockerMelds;
    this.currentState!.roundScores = {
      [data.knockerId]: data.scores.knocker,
      [data.opponentId]: data.scores.opponent
    };
    
    // Store round ending info without changing any game logic state
    // The actual game state transitions are handled by the underlying KNOCK/GIN events
    console.log(`📝 EventSourcing: Recorded round end details for audit trail`);
    
    return this.currentState!;
  }

  private applyPlayerLeft(event: GameEvent): GameState {
    const data = event.eventData as PlayerLeftEventData;
    
    console.log(`👋 EventSourcing: Player ${data.playerId} left game - reason: ${data.reason}`);
    
    // PLAYER_LEFT is purely for audit trail - game ending logic is handled elsewhere
    // We just record the departure for analytics and debugging
    console.log(`📝 EventSourcing: Recorded player departure for audit trail`);
    
    return this.currentState!;
  }

  private applyGameCancelled(event: GameEvent): GameState {
    const data = event.eventData as GameCancelledEventData;
    
    console.log(`🚫 EventSourcing: Game cancelled - reason: ${data.reason}${data.cancelledBy ? ` by ${data.cancelledBy}` : ''}`);
    
    // GAME_CANCELLED is purely for audit trail - game status changes are handled elsewhere
    // We just record the cancellation for analytics and debugging
    console.log(`📝 EventSourcing: Recorded game cancellation for audit trail`);
    
    return this.currentState!;
  }

  private applyAIThinkingStarted(event: GameEvent): GameState {
    const data = event.eventData as AIThinkingStartedEventData;
    
    console.log(`🤖 EventSourcing: AI ${data.playerId} started thinking - estimated ${data.estimatedDuration}ms`);
    
    // AI_THINKING_STARTED is purely for audit trail and performance monitoring
    // We just record the AI thinking process for analytics and debugging
    if (data.thoughts && data.thoughts.length > 0) {
      console.log(`💭 EventSourcing: AI thoughts: ${data.thoughts.slice(0, 2).join(', ')}${data.thoughts.length > 2 ? '...' : ''}`);
    }
    console.log(`📝 EventSourcing: Recorded AI thinking start for audit trail`);
    
    return this.currentState!;
  }

  private applyLayoffPhaseStarted(event: GameEvent): GameState {
    const data = event.eventData as LayoffPhaseStartedEventData;
    
    console.log(`🎯 EventSourcing: Layoff phase started for game ${data.gameId}`);
    console.log(`🔄 EventSourcing: Knocker: ${data.knockerId}, Opponent: ${data.opponentId}`);
    
    // LAYOFF_PHASE_STARTED is purely for audit trail - phase transitions are handled elsewhere
    // We just record the layoff phase beginning and available opportunities
    if (data.availableLayoffs && data.availableLayoffs.length > 0) {
      console.log(`📊 EventSourcing: ${data.availableLayoffs.length} layoff opportunities available`);
    } else {
      console.log(`📊 EventSourcing: No layoff opportunities available`);
    }
    this.currentState!.lastLayOffs = [];
    console.log(`📝 EventSourcing: Recorded layoff phase start for audit trail`);
    
    return this.currentState!;
  }

  private createEmptyPlayerState(playerId: string, username: string): PlayerState {
    return {
      id: playerId,
      username,
      hand: [],
      handSize: 0,
      score: 0,
      hasKnocked: false,
      hasGin: false,
      deadwood: 0,
      melds: [],
      isReady: false,
      isReadyForNextRound: false,
    };
  }

  /**
   * Update player's optimal melds and deadwood based on current hand
   * Only recalculates if player hasn't explicitly set their melds
   */
  private updatePlayerMeldsAndDeadwood(player: PlayerState, preserveExplicitMelds = false): void {
    if (player.hand.length === 0) {
      player.melds = [];
      player.deadwood = 0;
      return;
    }

    // If preserveExplicitMelds is true and player has melds, only recalculate deadwood
    if (preserveExplicitMelds && player.melds && player.melds.length > 0) {
      player.deadwood = calculateDeadwood(player.hand, player.melds);
      return;
    }
    
    const optimalResult = findOptimalMelds(player.hand);
    player.melds = optimalResult.melds;
    player.deadwood = optimalResult.deadwood;
  }

  /**
   * Validate that all 52 cards are properly distributed with no duplicates
   */
  public validateCardDistribution(state?: GameState): { valid: boolean; errors: string[] } {
    const gameState = state || this.currentState;
    if (!gameState) {
      return { valid: false, errors: ['No game state available'] };
    }
    
    const errors: string[] = [];
    const allCardIds = new Set<string>();
    
    // Collect all card IDs
    const cardSources = [
      { name: 'stockPile', cards: gameState.stockPile },
      { name: 'discardPile', cards: gameState.discardPile },
      ...gameState.players.map(p => ({ name: `player-${p.id}`, cards: p.hand }))
    ];

    let totalCards = 0;
    
    for (const source of cardSources) {
      for (const card of source.cards) {
        totalCards++;
        if (allCardIds.has(card.id)) {
          errors.push(`Duplicate card found: ${card.id} in ${source.name}`);
        }
        allCardIds.add(card.id);
      }
    }

    // Check total count
    if (totalCards !== 52) {
      errors.push(`Expected 52 cards, found ${totalCards}`);
    }

    // Check for proper card IDs (should be suit_rank format)
    for (const cardId of allCardIds) {
      if (!cardId.includes('_') || cardId.startsWith('card-')) {
        errors.push(`Invalid card ID format: ${cardId}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate that events are in correct sequence
   */
  public validateEventSequence(): boolean {
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].sequenceNumber !== i + 1) {
        console.error(`❌ Event sequence validation failed: Expected ${i + 1}, got ${this.events[i].sequenceNumber}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Get event count
   */
  public getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get events
   */
  public getEvents(): GameEvent[] {
    return [...this.events];
  }

  /**
   * Validate and recover event sequence integrity - CRITICAL EDGE CASE HANDLING
   */
  private validateAndRecoverEventSequence(): {
    valid: boolean;
    error?: string;
    recovered?: boolean;
    recoveredCount?: number;
  } {
    if (this.events.length === 0) {
      return { valid: true };
    }

    let recoveredCount = 0;
    const issues: string[] = [];

    // Check for sequence gaps or duplicates
    const sequences = this.events.map(e => e.sequenceNumber);
    const uniqueSequences = new Set(sequences);

    // EDGE CASE: Duplicate sequence numbers
    if (uniqueSequences.size !== sequences.length) {
      const duplicates = sequences.filter((seq, index, arr) => arr.indexOf(seq) !== index);
      issues.push(`Duplicate sequence numbers found: ${[...new Set(duplicates)].join(', ')}`);
    }

    // EDGE CASE: Missing sequence numbers (gaps)
    const sortedEvents = [...this.events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const offset = this.startingSequence;
    for (let i = 0; i < sortedEvents.length; i++) {
      const expectedSeq = offset + i + 1;
      const actualSeq = sortedEvents[i].sequenceNumber;
      
      if (actualSeq !== expectedSeq) {
        if (actualSeq > expectedSeq) {
          issues.push(`Gap in sequence: missing event ${expectedSeq}, found ${actualSeq}`);
        }
        break;
      }
    }

    // EDGE CASE: Invalid sequence numbers (negative, zero, or non-integer)
    const invalidSequences = this.events.filter(e => 
      !Number.isInteger(e.sequenceNumber) || 
      e.sequenceNumber <= 0
    );
    if (invalidSequences.length > 0) {
      issues.push(`Invalid sequence numbers: ${invalidSequences.map(e => e.sequenceNumber).join(', ')}`);
    }

    // Attempt recovery if possible
    if (issues.length > 0) {
      console.warn(`⚠️ EventSourcing: Found ${issues.length} sequence issues:`, issues);
      
      // Recovery attempt: Re-sequence events based on createdAt timestamp
      try {
        this.events = this.events
          .filter(e => e.sequenceNumber > 0 && Number.isInteger(e.sequenceNumber)) // Remove invalid events
          .sort((a, b) => {
            // First sort by sequence number, then by createdAt for same sequences
            if (a.sequenceNumber === b.sequenceNumber) {
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }
            return a.sequenceNumber - b.sequenceNumber;
          });

        // Remove duplicates, keeping the earliest
        const seen = new Set<number>();
        this.events = this.events.filter(event => {
          if (seen.has(event.sequenceNumber)) {
            recoveredCount++;
            return false;
          }
          seen.add(event.sequenceNumber);
          return true;
        });

        console.log(`🔧 EventSourcing: Attempted recovery, removed ${recoveredCount} duplicate/invalid events`);
        return {
          valid: true,
          recovered: true,
          recoveredCount
        };
      } catch (error) {
        return {
          valid: false,
          error: `Failed to recover event sequence: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Attempt recovery from individual event application errors - CRITICAL EDGE CASE HANDLING
   */
  private attemptEventRecovery(event: GameEvent, error: any): { recovered: boolean; message?: string } {
    console.log(`🔧 EventSourcing: Attempting recovery for event ${event.sequenceNumber}:`, error.message);

    // EDGE CASE: Corrupted event data
    if (!event.eventData || typeof event.eventData !== 'object') {
      console.log(`🔧 EventSourcing: Event ${event.sequenceNumber} has corrupted data, skipping`);
      return { recovered: true, message: 'Skipped corrupted event data' };
    }

    // EDGE CASE: Invalid event type
    if (!event.eventType || typeof event.eventType !== 'string') {
      console.log(`🔧 EventSourcing: Event ${event.sequenceNumber} has invalid type, skipping`);
      return { recovered: true, message: 'Skipped invalid event type' };
    }

    // EDGE CASE: Player not found errors
    if (error.message && error.message.includes('Player') && error.message.includes('not found')) {
      console.log(`🔧 EventSourcing: Event ${event.sequenceNumber} references missing player, skipping`);
      return { recovered: true, message: 'Skipped event with missing player reference' };
    }

    // EDGE CASE: Game state inconsistency - try to recover by creating a synthetic correction
    if (error.message && error.message.includes('phase')) {
      console.log(`🔧 EventSourcing: Event ${event.sequenceNumber} has phase error, attempting phase correction`);
      
      // Try to force state into a consistent phase for this event type
      if (this.currentState) {
        const originalPhase = this.currentState.phase;
        try {
          // Attempt to set appropriate phase based on event type
          switch (event.eventType) {
            case 'DRAW_FROM_STOCK':
            case 'DRAW_FROM_DISCARD':
              this.currentState.phase = 'draw' as any;
              break;
            case 'DISCARD_CARD':
            case 'KNOCK':
            case 'GIN':
              this.currentState.phase = 'discard' as any;
              break;
            case 'TAKE_UPCARD':
            case 'PASS_UPCARD':
              this.currentState.phase = 'upcard_decision' as any;
              break;
          }
          
          // Try applying the event again
          this.applyEvent(event);
          console.log(`🔧 EventSourcing: Successfully recovered event ${event.sequenceNumber} by correcting phase`);
          return { recovered: true, message: 'Recovered by phase correction' };
        } catch (retryError) {
          // Restore original phase if recovery failed
          this.currentState.phase = originalPhase;
        }
      }
    }

    return { recovered: false };
  }
}
