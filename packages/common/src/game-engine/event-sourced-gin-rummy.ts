import {
  Card,
  GameState,
  GameStatus,
  GamePhase,
  PlayerState,
  Meld,
} from '../types/game';
import {
  GameEvent,
  EventType,
  DrawFromStockEventData,
  DrawFromDiscardEventData,
  DiscardCardEventData,
  KnockEventData,
  GinEventData,
  GameStartedEventData,
  StartNewRoundEventData,
  createGameEvent,
} from '../types/events';
import {
  createDeck,
  shuffleDeck,
  sortCards,
} from '../utils/cards';
import {
  calculateDeadwood,
  findOptimalMelds,
  calculateKnockScore,
  hasGin,
} from '../utils/scoring';
import { isValidMove, validateMelds } from '../utils/validation';

/**
 * Event-Sourced Gin Rummy Game Engine
 * 
 * This is the new game engine that works entirely with events.
 * Instead of mutating state directly, it validates actions and creates events.
 * The EventSourcingEngine handles replaying events to compute state.
 */
export class EventSourcedGinRummyGame {
  private gameId: string;
  private deck: Card[];

  constructor(gameId: string) {
    this.gameId = gameId;
    this.deck = shuffleDeck(createDeck());
  }

  /**
   * Validate an action against current game state and create event if valid
   */
  validateAndCreateEvent(
    currentState: GameState,
    action: {
      type: EventType;
      playerId: string;
      cardId?: string;
      melds?: Meld[];
    },
    sequenceNumber: number
  ): GameEvent | { error: string } {

    // Basic validations
    if (currentState.gameOver) {
      return { error: 'Game is over' };
    }

    // Special case: AI_LAYOFF_DECISION can be made during layoff phase regardless of current player
    if (currentState.currentPlayerId !== action.playerId && action.type !== 'AI_LAYOFF_DECISION') {
      return { error: 'Not your turn' };
    }

    const player = currentState.players.find(p => p.id === action.playerId);
    if (!player) {
      return { error: 'Player not found' };
    }

    switch (action.type) {
      case EventType.TAKE_UPCARD:
        return this.validateTakeUpcard(currentState, action, sequenceNumber);
        
      case EventType.PASS_UPCARD:
        return this.validatePassUpcard(currentState, action, sequenceNumber);
        
      case EventType.DRAW_FROM_STOCK:
        return this.validateDrawFromStock(currentState, action, sequenceNumber);
        
      case EventType.DRAW_FROM_DISCARD:
        return this.validateDrawFromDiscard(currentState, action, sequenceNumber);
        
      case EventType.DISCARD_CARD:
        return this.validateDiscardCard(currentState, action, sequenceNumber);
        
      case EventType.KNOCK:
        return this.validateKnock(currentState, action, sequenceNumber);
        
      case EventType.GIN:
        return this.validateGin(currentState, action, sequenceNumber);
        
      case EventType.START_NEW_ROUND:
        return this.validateStartNewRound(currentState, action, sequenceNumber);
        
      case EventType.AI_LAYOFF_DECISION:
        return this.validateAILayoffDecision(currentState, action, sequenceNumber);
        
      default:
        return { error: `Unsupported action type: ${action.type}` };
    }
  }

  /**
   * Create initial game events for a new game
   */
  createInitialGameEvents(player1Id: string, player2Id: string, vsAI: boolean, player1Username?: string, player2Username?: string): GameEvent[] {
    console.log('🎮 EventSourcedGame: createInitialGameEvents called with:', { player1Id, player2Id, vsAI, player1Username, player2Username });
    const events: GameEvent[] = [];
    
    // Create GAME_CREATED event
    const gameCreatedEvent = createGameEvent(
      this.gameId,
      EventType.GAME_CREATED,
      {
        gameId: this.gameId,
        gameType: 'STANDARD',
        player1Id,
        player2Id,
        player1Username,
        player2Username,
        isPrivate: false,
        vsAI,
        maxPlayers: 2,
      },
      player1Id,
      1
    );
    events.push(gameCreatedEvent);
    console.log('🎮 EventSourcedGame: Added GAME_CREATED event. Events count:', events.length);

    // Only start the game immediately for AI games
    // For PvP games, wait for second player to join
    console.log('🎮 EventSourcedGame: Checking vsAI condition:', vsAI);
    if (vsAI) {
      // Deal initial cards
      const player1Hand = this.deck.splice(0, 10);
      const player2Hand = this.deck.splice(0, 10);
      const topDiscardCard = this.deck.splice(0, 1)[0];

      // Create GAME_STARTED event for AI games
      const gameStartedEvent = createGameEvent(
        this.gameId,
        EventType.GAME_STARTED,
        {
          gameId: this.gameId,
          player1Id,
          player2Id,
          startingPlayerId: player1Id,
          initialDeal: {
            player1Hand,
            player2Hand,
            topDiscardCard,
            stockSize: this.deck.length,
            stockPile: [...this.deck], // Include remaining stock pile cards
          },
        },
        player1Id,
        2
      );
      events.push(gameStartedEvent);
      console.log('🎮 EventSourcedGame: Added GAME_STARTED event for AI game. Events count:', events.length);
    } else {
      console.log('🎮 EventSourcedGame: Skipped GAME_STARTED for PvP game (vsAI=false)');
    }
    // For PvP games, only return GAME_CREATED event
    // GAME_STARTED will be created when second player joins

    console.log('🎮 EventSourcedGame: Returning', events.length, 'events');
    return events;
  }

  // Private validation methods

  private validateTakeUpcard(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.UpcardDecision) {
      return { error: 'Cannot take upcard outside of upcard decision phase' };
    }

    if (state.discardPile.length === 0) {
      return { error: 'No upcard available' };
    }

    const upcard = state.discardPile[0];

    return createGameEvent(
      this.gameId,
      EventType.TAKE_UPCARD,
      {
        playerId: action.playerId,
        cardTaken: upcard,
        discardPileAfter: state.discardPile.slice(1), // Remove upcard from discard pile
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validatePassUpcard(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.UpcardDecision) {
      return { error: 'Cannot pass upcard outside of upcard decision phase' };
    }

    // Find the next player who should get upcard decision
    const nextPlayer = state.players.find(p => p.id !== action.playerId);
    
    return createGameEvent(
      this.gameId,
      EventType.PASS_UPCARD,
      {
        playerId: action.playerId,
        nextPlayerId: nextPlayer?.id || action.playerId,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateDrawFromStock(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Draw && state.phase !== GamePhase.UpcardDecision) {
      return { error: 'Cannot draw from stock in current phase' };
    }

    if (state.stockPileCount <= 0 || state.stockPile.length === 0) {
      return { error: 'Stock pile is empty' };
    }

    // Draw a card from stock pile
    const { card: drawnCard, newStockPile } = this.drawCardFromStock(state);

    return createGameEvent(
      this.gameId,
      EventType.DRAW_FROM_STOCK,
      {
        playerId: action.playerId,
        cardDrawn: drawnCard,
        stockSizeAfter: newStockPile.length,
        newStockPile,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateDrawFromDiscard(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Draw && state.phase !== GamePhase.UpcardDecision) {
      return { error: 'Cannot draw from discard in current phase' };
    }

    if (state.discardPile.length === 0) {
      return { error: 'Discard pile is empty' };
    }

    const topCard = state.discardPile[0];
    const remainingDiscardPile = state.discardPile.slice(1);

    return createGameEvent(
      this.gameId,
      EventType.DRAW_FROM_DISCARD,
      {
        playerId: action.playerId,
        cardDrawn: topCard,
        discardPileAfter: remainingDiscardPile,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateDiscardCard(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Discard) {
      return { error: 'Cannot discard in current phase' };
    }

    if (!action.cardId) {
      return { error: 'Card ID is required for discard' };
    }

    const player = state.players.find(p => p.id === action.playerId);
    if (!player) {
      return { error: 'Player not found' };
    }

    const cardToDiscard = player.hand.find(card => card.id === action.cardId);
    if (!cardToDiscard) {
      return { error: 'Card not found in hand' };
    }

    // Determine next player
    const nextPlayer = this.getNextPlayer(state, action.playerId);
    const newDiscardPile = [cardToDiscard, ...state.discardPile];

    return createGameEvent(
      this.gameId,
      EventType.DISCARD_CARD,
      {
        playerId: action.playerId,
        cardDiscarded: cardToDiscard,
        discardPileAfter: newDiscardPile,
        nextPlayerId: nextPlayer.id,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateKnock(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Discard) {
      return { error: 'Can only knock during discard phase' };
    }

    if (!action.melds || !Array.isArray(action.melds)) {
      return { error: 'Melds are required for knock' };
    }

    const player = state.players.find(p => p.id === action.playerId);
    if (!player) {
      return { error: 'Player not found' };
    }

    // Validate that player has the card to discard
    const cardToDiscard = player.hand.find(card => card.id === action.cardToDiscard);
    if (!cardToDiscard) {
      return { error: 'Card to discard not found in hand' };
    }

    // Calculate hand after discarding
    const handAfterDiscard = player.hand.filter(card => card.id !== action.cardToDiscard);

    // Validate melds against the hand after discarding
    const validationResult = validateMelds(action.melds, handAfterDiscard);
    if (!validationResult.valid) {
      return { error: `Invalid melds: ${validationResult.error}` };
    }

    const deadwoodValue = calculateDeadwood(handAfterDiscard, action.melds);
    if (deadwoodValue > 10) {
      return { error: `Cannot knock with ${deadwoodValue} deadwood (maximum 10)` };
    }

    // Get opponent
    const opponent = state.players.find(p => p.id !== action.playerId);
    if (!opponent) {
      return { error: 'Opponent not found' };
    }

    // Calculate opponent's best melds and potential lay-offs
    const opponentMelds = findOptimalMelds(opponent.hand);
    const layOffs = this.calculateLayOffs(opponent.hand, action.melds, opponentMelds.melds);
    
    // Calculate scores using hand after discarding
    const scores = calculateKnockScore(
      handAfterDiscard,
      action.melds,
      opponent.hand,
      opponentMelds.melds
    );

    // Update discard pile with the knocked card
    const newDiscardPile = [cardToDiscard, ...state.discardPile];

    return createGameEvent(
      this.gameId,
      EventType.KNOCK,
      {
        playerId: action.playerId,
        knockerHand: handAfterDiscard, // Use hand after discarding
        knockerMelds: action.melds,
        deadwoodValue,
        cardDiscarded: cardToDiscard,
        discardPileAfter: newDiscardPile,
        opponentHand: opponent.hand,
        opponentMelds: opponentMelds.melds,
        layOffs,
        scores: {
          knocker: scores.knockerScore,
          opponent: scores.opponentScore,
        },
        roundResult: scores.knockerScore > scores.opponentScore ? 'KNOCK' : 'UNDERCUT',
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateGin(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Discard) {
      return { error: 'Can only gin during discard phase' };
    }

    if (!action.melds || !Array.isArray(action.melds)) {
      return { error: 'Melds are required for gin' };
    }

    const player = state.players.find(p => p.id === action.playerId);
    if (!player) {
      return { error: 'Player not found' };
    }

    // Validate that player has the card to discard
    const cardToDiscard = player.hand.find(card => card.id === action.cardToDiscard);
    if (!cardToDiscard) {
      return { error: 'Card to discard not found in hand' };
    }

    // Calculate hand after discarding
    const handAfterDiscard = player.hand.filter(card => card.id !== action.cardToDiscard);

    // Validate melds against the hand after discarding
    const validationResult = validateMelds(action.melds, handAfterDiscard);
    if (!validationResult.valid) {
      return { error: `Invalid melds: ${validationResult.error}` };
    }

    // Check deadwood AFTER discarding (must be 0 for gin)
    const deadwoodValue = calculateDeadwood(handAfterDiscard, action.melds);
    if (deadwoodValue !== 0) {
      return { error: `Cannot gin with ${deadwoodValue} deadwood (must be 0)` };
    }

    // Get opponent
    const opponent = state.players.find(p => p.id !== action.playerId);
    if (!opponent) {
      return { error: 'Opponent not found' };
    }

    const opponentMelds = findOptimalMelds(opponent.hand);
    
    // Calculate gin scores (no lay-offs allowed)
    const ginBonus = 25;
    const opponentDeadwood = calculateDeadwood(opponent.hand, opponentMelds.melds);
    const scores = {
      ginner: ginBonus + opponentDeadwood,
      opponent: 0,
    };

    return createGameEvent(
      this.gameId,
      EventType.GIN,
      {
        playerId: action.playerId,
        ginnerHand: handAfterDiscard, // Use hand after discard
        ginnerMelds: action.melds,
        opponentHand: opponent.hand,
        opponentMelds: opponentMelds.melds,
        scores,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private validateAILayoffDecision(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    if (state.phase !== GamePhase.Layoff) {
      return { error: 'Can only make layoff decisions during layoff phase' };
    }

    const player = state.players.find(p => p.id === action.playerId);
    if (!player) {
      return { error: 'Player not found' };
    }

    // Validate decision type
    if (!['LAYOFF', 'SKIP'].includes(action.decision)) {
      return { error: 'Invalid layoff decision - must be LAYOFF or SKIP' };
    }

    // If laying off, validate the layoffs
    if (action.decision === 'LAYOFF' && action.selectedLayoffs) {
      // Basic validation - could add more detailed validation here
      for (const layoff of action.selectedLayoffs) {
        if (!layoff.cards || !layoff.targetMeld) {
          return { error: 'Invalid layoff format' };
        }
      }
    }

    // Calculate total value of cards being laid off
    const totalValueLaidOff = action.decision === 'LAYOFF' ? 
      action.selectedLayoffs.reduce((total: number, layoff: any) => 
        total + layoff.cards.reduce((cardTotal: number, card: any) => cardTotal + this.getCardValue(card), 0), 0
      ) : 0;

    // Create AI layoff decision event
    return createGameEvent(
      this.gameId,
      EventType.AI_LAYOFF_DECISION,
      {
        gameId: this.gameId,
        playerId: action.playerId,
        decision: action.decision,
        selectedLayoffs: action.selectedLayoffs || [],
        totalValueLaidOff,
      },
      action.playerId,
      sequenceNumber
    );
  }

  private getCardValue(card: Card): number {
    if (card.rank === 'A') return 1;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank);
  }

  // Helper methods

  private getNextPlayer(state: GameState, currentPlayerId: string): PlayerState {
    const currentIndex = state.players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % state.players.length;
    return state.players[nextIndex];
  }

  private drawCardFromStock(state: GameState): { card: Card; newStockPile: Card[] } {
    if (state.stockPile.length === 0) {
      throw new Error('Cannot draw from empty stock pile');
    }
    
    const newStockPile = [...state.stockPile];
    const drawnCard = newStockPile.shift()!; // Draw from top of stock pile
    
    return {
      card: drawnCard,
      newStockPile,
    };
  }

  private calculateLayOffs(
    opponentHand: Card[],
    knockerMelds: Meld[],
    opponentMelds: Meld[]
  ): Array<{
    playerId: string;
    cards: Card[];
    targetMeld: Meld;
  }> {
    const layOffs: Array<{
      playerId: string;
      cards: Card[];
      targetMeld: Meld;
    }> = [];

    // Get opponent's deadwood cards (cards not in their melds)
    const meldedCardIds = new Set(
      opponentMelds.flatMap(meld => meld.cards.map(card => card.id))
    );
    const deadwoodCards = opponentHand.filter(card => !meldedCardIds.has(card.id));

    // Check each deadwood card against each knocker meld
    for (const card of deadwoodCards) {
      for (const knockerMeld of knockerMelds) {
        if (this.canLayOffCard(card, knockerMeld)) {
          layOffs.push({
            playerId: 'opponent', // In 2-player game, opponent is the non-knocker
            cards: [card],
            targetMeld: knockerMeld,
          });
        }
      }
    }

    return layOffs;
  }

  /**
   * Check if a card can be laid off on a meld
   */
  private canLayOffCard(card: Card, meld: Meld): boolean {
    if (meld.type === 'set') {
      // Card can be added to set if same rank
      return card.rank === meld.cards[0].rank;
    } else if (meld.type === 'run') {
      // Card can be added to run if it extends the sequence
      return this.canExtendRun(card, meld.cards);
    }
    return false;
  }

  /**
   * Check if a card can extend a run
   */
  private canExtendRun(card: Card, runCards: Card[]): boolean {
    // Must be same suit
    if (card.suit !== runCards[0].suit) return false;

    // Sort run cards by rank value
    const sortedRun = [...runCards].sort((a, b) => this.getRankValue(a.rank) - this.getRankValue(b.rank));
    const cardValue = this.getRankValue(card.rank);
    const minValue = this.getRankValue(sortedRun[0].rank);
    const maxValue = this.getRankValue(sortedRun[sortedRun.length - 1].rank);

    // Card can extend at either end of the run
    return cardValue === minValue - 1 || cardValue === maxValue + 1;
  }

  private validateStartNewRound(
    state: GameState,
    action: any,
    sequenceNumber: number
  ): GameEvent | { error: string } {
    // Can only start new round when current round is over
    if (state.phase !== GamePhase.RoundOver) {
      return { error: 'Can only start new round when current round is over' };
    }

    // Game must not be over
    if (state.gameOver) {
      return { error: 'Cannot start new round - game is over' };
    }

    // Create new deck and deal cards
    const deck = shuffleDeck(createDeck());
    const player1Hand = deck.splice(0, 10);
    const player2Hand = deck.splice(0, 10);
    const topDiscardCard = deck.splice(0, 1)[0];
    const stockPile = deck;

    return createGameEvent(
      this.gameId,
      EventType.START_NEW_ROUND,
      {
        playerId: action.playerId,
        gameId: this.gameId,
        roundNumber: (state.roundNumber || 0) + 1,
        newDeal: {
          player1Hand,
          player2Hand,
          topDiscardCard,
          stockSize: stockPile.length,
          stockPile,
        },
      },
      action.playerId,
      sequenceNumber
    );
  }

  /**
   * Get numeric value for rank comparison
   */
  private getRankValue(rank: string): number {
    switch (rank) {
      case 'A': return 1;
      case '2': return 2;
      case '3': return 3;
      case '4': return 4;
      case '5': return 5;
      case '6': return 6;
      case '7': return 7;
      case '8': return 8;
      case '9': return 9;
      case '10': return 10;
      case 'J': return 11;
      case 'Q': return 12;
      case 'K': return 13;
      default: return 0;
    }
  }
}