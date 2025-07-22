import {
  Card,
  GameState,
  GameStatus,
  GamePhase,
  GameMove,
  MoveType,
  PlayerState,
  Meld,
} from '../types/game';
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
import { AIPlayer } from './ai-player';

/**
 * Core Gin Rummy game engine with server-authoritative logic
 */
export class GinRummyGame {
  private state: GameState;
  private deck: Card[];
  private aiPlayer: AIPlayer | null = null;

  constructor(gameId: string, player1Id: string, player2Id: string, vsAI = false) {
    this.deck = shuffleDeck(createDeck());
    
    // Initialize AI player if this is an AI game
    if (vsAI && player2Id === 'ai-player') {
      this.aiPlayer = new AIPlayer('ai-player');
    }

    this.state = {
      id: gameId,
      status: GameStatus.Active,
      phase: GamePhase.UpcardDecision,
      currentPlayerId: player2Id, // Non-dealer (player2) gets first upcard decision
      players: [
        {
          id: player1Id,
          username: '', // Will be set by game service
          hand: [],
          handSize: 10,
          score: 0,
          hasKnocked: false,
          hasGin: false,
          deadwood: 0,
          melds: [],
          lastDrawnCardId: undefined,
        },
        {
          id: player2Id,
          username: '', // Will be set by game service
          hand: [],
          handSize: 10,
          score: 0,
          hasKnocked: false,
          hasGin: false,
          deadwood: 0,
          melds: [],
          lastDrawnCardId: undefined,
        },
      ],
      stockPileCount: 32, // 52 - (10 + 10) - 1 (top discard)
      discardPile: [],
      turnTimer: 30,
      isPrivate: false,
      vsAI,
      gameOver: false,
    };

    this.dealInitialCards();
  }

  /**
   * Deal initial 10 cards to each player and set up discard pile
   */
  private dealInitialCards(): void {
    // Deal 10 cards to each player
    for (const player of this.state.players) {
      player.hand = this.deck.splice(0, 10);
      player.hand = sortCards(player.hand);
    }

    // Set up discard pile with top card
    if (this.deck.length > 0) {
      this.state.discardPile = [this.deck.shift()!];
      this.state.stockPileCount = this.deck.length;
    }
    
    // Calculate initial melds and deadwood for all players
    this.updateAllPlayersState();
  }

  /**
   * Execute a game move and return updated state
   */
  public makeMove(move: GameMove): { success: boolean; error?: string; state: GameState } {
    const player = this.getPlayer(move.playerId);
    if (!player) {
      return { success: false, error: 'Player not found', state: this.state };
    }

    // Validate move
    const validation = isValidMove(
      move,
      this.state.phase,
      this.state.currentPlayerId,
      player.hand,
      this.state.discardPile
    );

    if (!validation.valid) {
      return { success: false, error: validation.error, state: this.state };
    }

    // Execute move based on type
    switch (move.type) {
      case MoveType.TakeUpcard:
        return this.handleTakeUpcard(move.playerId);
      
      case MoveType.PassUpcard:
        return this.handlePassUpcard(move.playerId);
      
      case MoveType.DrawStock:
        return this.handleDrawStock(move.playerId);
      
      case MoveType.DrawDiscard:
        return this.handleDrawDiscard(move.playerId);
      
      case MoveType.Discard:
        return this.handleDiscard(move.playerId, move.cardId!);
      
      case MoveType.Knock:
        return this.handleKnock(move.playerId, move.cardId!, move.melds!);
      
      case MoveType.Gin:
        return this.handleGin(move.playerId, move.cardId!, move.melds!);
      
      case MoveType.StartNewRound:
        return this.handleStartNewRound();
      
      default:
        return { success: false, error: 'Invalid move type', state: this.state };
    }
  }

  private handleTakeUpcard(playerId: string): { success: boolean; error?: string; state: GameState } {
    if (this.state.discardPile.length === 0) {
      return { success: false, error: 'No upcard available', state: this.state };
    }

    const player = this.getPlayer(playerId)!;
    const upcard = this.state.discardPile.pop()!;
    
    player.hand.push(upcard);
    player.hand = sortCards(player.hand);
    player.lastDrawnCardId = upcard.id; // Track for UI highlighting
    
    // Player who takes upcard goes to discard phase
    this.state.phase = GamePhase.Discard;
    this.state.currentPlayerId = playerId;
    
    // Update melds and deadwood for all players
    this.updateAllPlayersState();

    return { success: true, state: this.state };
  }

  private handlePassUpcard(playerId: string): { success: boolean; error?: string; state: GameState } {
    // Determine who gets the next decision
    const player1Id = this.state.players[0].id;
    const player2Id = this.state.players[1].id;
    
    if (playerId === player2Id) {
      // Non-dealer passed, now dealer can decide
      this.state.currentPlayerId = player1Id;
      return { success: true, state: this.state };
    } else {
      // Dealer also passed, non-dealer starts drawing from stock
      this.state.currentPlayerId = player2Id;
      this.state.phase = GamePhase.Draw;
      return { success: true, state: this.state };
    }
  }

  private handleDrawStock(playerId: string): { success: boolean; error?: string; state: GameState } {
    if (this.deck.length === 0) {
      return { success: false, error: 'Stock pile is empty', state: this.state };
    }

    // Check for stock exhaustion rule (only 2 cards left)
    if (this.deck.length <= 2) {
      this.state.phase = GamePhase.GameOver;
      this.state.gameOver = true;
      return { success: true, state: this.state };
    }

    const player = this.getPlayer(playerId)!;
    const drawnCard = this.deck.shift()!;
    
    player.hand.push(drawnCard);
    player.hand = sortCards(player.hand);
    player.lastDrawnCardId = drawnCard.id; // Track for UI highlighting
    
    this.state.stockPileCount = this.deck.length;
    this.state.phase = GamePhase.Discard;
    
    // Update melds and deadwood for all players
    this.updateAllPlayersState();

    return { success: true, state: this.state };
  }

  private handleDrawDiscard(playerId: string): { success: boolean; error?: string; state: GameState } {
    if (this.state.discardPile.length === 0) {
      return { success: false, error: 'Discard pile is empty', state: this.state };
    }

    const player = this.getPlayer(playerId)!;
    const drawnCard = this.state.discardPile.pop()!;
    
    player.hand.push(drawnCard);
    player.hand = sortCards(player.hand);
    player.lastDrawnCardId = drawnCard.id; // Track for UI highlighting
    
    this.state.phase = GamePhase.Discard;
    
    // Update melds and deadwood for all players
    this.updateAllPlayersState();

    return { success: true, state: this.state };
  }

  private handleDiscard(playerId: string, cardId: string): { success: boolean; error?: string; state: GameState } {
    const player = this.getPlayer(playerId)!;
    const cardIndex = player.hand.findIndex(card => card.id === cardId);
    
    if (cardIndex === -1) {
      return { success: false, error: 'Card not found in hand', state: this.state };
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    this.state.discardPile.push(discardedCard);
    
    // Clear last drawn card indicator after discard
    player.lastDrawnCardId = undefined;

    // Update melds and deadwood for all players
    this.updateAllPlayersState();

    // Switch to next player
    this.nextTurn();

    return { success: true, state: this.state };
  }

  private handleKnock(
    playerId: string,
    cardId: string,
    melds: Meld[]
  ): { success: boolean; error?: string; state: GameState } {
    const player = this.getPlayer(playerId)!;
    
    // Validate melds
    const meldValidation = validateMelds(melds, player.hand);
    if (!meldValidation.valid) {
      return { success: false, error: meldValidation.error, state: this.state };
    }

    // Discard the card
    const cardIndex = player.hand.findIndex(card => card.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not found in hand', state: this.state };
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    this.state.discardPile.push(discardedCard);
    
    // Clear last drawn card indicator after discard
    player.lastDrawnCardId = undefined;

    // Set player melds and calculate deadwood
    player.melds = melds;
    player.deadwood = calculateDeadwood(player.hand, melds);
    player.hasKnocked = true;

    // End the game and calculate scores
    this.endRound();

    return { success: true, state: this.state };
  }

  private handleGin(
    playerId: string,
    cardId: string,
    melds: Meld[]
  ): { success: boolean; error?: string; state: GameState } {
    const player = this.getPlayer(playerId)!;
    
    // Validate melds
    const meldValidation = validateMelds(melds, player.hand);
    if (!meldValidation.valid) {
      return { success: false, error: meldValidation.error, state: this.state };
    }

    // Discard the card
    const cardIndex = player.hand.findIndex(card => card.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not found in hand', state: this.state };
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    this.state.discardPile.push(discardedCard);
    
    // Clear last drawn card indicator after discard
    player.lastDrawnCardId = undefined;

    // Verify gin (no deadwood)
    const deadwood = calculateDeadwood(player.hand, melds);
    if (deadwood > 0) {
      return { success: false, error: 'Cannot gin with deadwood', state: this.state };
    }

    // Set player melds
    player.melds = melds;
    player.deadwood = 0;
    player.hasGin = true;

    // End the game and calculate scores
    this.endRound();

    return { success: true, state: this.state };
  }

  private handleStartNewRound(): { success: boolean; error?: string; state: GameState } {
    if (this.state.phase !== GamePhase.RoundOver) {
      return { success: false, error: 'Can only start new round when current round is over', state: this.state };
    }

    this.startNewRound();
    return { success: true, state: this.state };
  }

  /**
   * End the current round and calculate scores
   */
  private endRound(): void {
    const [player1, player2] = this.state.players;
    
    let knocker: PlayerState;
    let opponent: PlayerState;
    
    if (player1.hasKnocked || player1.hasGin) {
      knocker = player1;
      opponent = player2;
    } else {
      knocker = player2;
      opponent = player1;
    }

    // Calculate opponent's optimal melds
    const opponentOptimal = findOptimalMelds(opponent.hand);
    opponent.melds = opponentOptimal.melds;
    opponent.deadwood = opponentOptimal.deadwood;

    // Calculate round scores
    const scoreResult = calculateKnockScore(
      knocker.hand,
      knocker.melds,
      opponent.hand,
      opponent.melds
    );

    // Update player scores
    knocker.score += scoreResult.knockerScore;
    opponent.score += scoreResult.opponentScore;

    // Store round scores for reference
    this.state.roundScores = {
      [knocker.id]: scoreResult.knockerScore,
      [opponent.id]: scoreResult.opponentScore,
    };

    // Check if game is over (first to 100 points)
    if (knocker.score >= 100 || opponent.score >= 100) {
      this.state.gameOver = true;
      this.state.status = GameStatus.Finished;
      this.state.phase = GamePhase.GameOver;
      this.state.winner = knocker.score > opponent.score ? knocker.id : opponent.id;
    } else {
      // Set round over phase to reveal cards before starting new round
      this.state.phase = GamePhase.RoundOver;
      // Note: startNewRound() will be called from UI or after a delay
    }
  }

  /**
   * Start a new round with fresh cards
   */
  public startNewRound(): void {
    // Reset player states for new round
    for (const player of this.state.players) {
      player.hand = [];
      player.handSize = 10;
      player.hasKnocked = false;
      player.hasGin = false;
      player.deadwood = 0;
      player.melds = [];
    }

    // Create a new shuffled deck
    this.deck = shuffleDeck(createDeck());
    
    // Deal new cards
    this.dealInitialCards();
    
    // Reset game state for new round
    this.state.phase = GamePhase.UpcardDecision;
    this.state.gameOver = false;
    this.state.roundScores = undefined;
    
    // Alternate dealer (non-dealer from previous round goes first)
    // In Gin Rummy, the non-dealer from previous round becomes dealer
    const [player1, player2] = this.state.players;
    this.state.currentPlayerId = player2.id; // Non-dealer gets first upcard decision
  }

  /**
   * Switch to the next player's turn
   */
  private nextTurn(): void {
    const currentIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    const nextIndex = (currentIndex + 1) % this.state.players.length;
    this.state.currentPlayerId = this.state.players[nextIndex].id;
    this.state.phase = GamePhase.Draw;
    this.state.turnTimer = 30;
  }

  /**
   * Get a player by ID
   */
  private getPlayer(playerId: string): PlayerState | undefined {
    return this.state.players.find(p => p.id === playerId);
  }

  /**
   * Get current game state
   */
  public getState(): GameState {
    return { ...this.state };
  }

  /**
   * Get game state for a specific player (hides opponent's hand except when round/game is over)
   */
  public getPlayerState(playerId: string): Partial<GameState> {
    const player = this.getPlayer(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const playerState = { ...this.state };
    
    // Reveal opponent's hand when round is over or game is finished
    const shouldRevealCards = this.state.phase === GamePhase.RoundOver || 
                             this.state.phase === GamePhase.GameOver;
    
    if (shouldRevealCards) {
      // Show all cards and melds when round/game is over
      playerState.players = playerState.players.map(p => ({ ...p }));
    } else {
      // Hide opponent's hand - only show hand size during active gameplay
      playerState.players = playerState.players.map(p => {
        if (p.id === playerId) {
          return { ...p };
        } else {
          return {
            ...p,
            hand: [], // Hide opponent's cards
            handSize: p.hand.length,
          };
        }
      });
    }

    return playerState;
  }

  /**
   * Set player usernames
   */
  public setPlayerUsernames(usernames: { [playerId: string]: string }): void {
    for (const player of this.state.players) {
      if (usernames[player.id]) {
        player.username = usernames[player.id];
      }
    }
  }

  /**
   * Check if the game can accept more players
   */
  public canAddPlayer(): boolean {
    return this.state.status === GameStatus.Waiting && this.state.players.length < 2;
  }

  /**
   * Update player's melds and deadwood calculation
   */
  private updatePlayerMeldsAndDeadwood(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (!player) return;

    const optimalMelds = findOptimalMelds(player.hand);
    player.melds = optimalMelds.melds;
    player.deadwood = optimalMelds.deadwood;
  }

  /**
   * Update all players' melds and deadwood
   */
  private updateAllPlayersState(): void {
    for (const player of this.state.players) {
      this.updatePlayerMeldsAndDeadwood(player.id);
    }
  }

  /**
   * Get suggested move for AI player using the sophisticated AIPlayer class
   */
  public getAISuggestion(): GameMove | null {
    const aiPlayerState = this.state.players.find(p => p.id === 'ai-player');
    if (!aiPlayerState || this.state.currentPlayerId !== aiPlayerState.id || !this.aiPlayer) {
      return null;
    }

    if (this.state.gameOver || this.state.phase === GamePhase.GameOver) {
      return null;
    }

    try {
      // Handle upcard decision phase
      if (this.state.phase === GamePhase.UpcardDecision) {
        if (this.state.discardPile.length > 0) {
          const upcard = this.state.discardPile[this.state.discardPile.length - 1];
          const handWithUpcard = [...aiPlayerState.hand, upcard];
          const withUpcardMelds = findOptimalMelds(handWithUpcard);
          const currentMelds = findOptimalMelds(aiPlayerState.hand);
          
          // Use AI evaluation to decide on upcard
          const improvement = currentMelds.deadwood - withUpcardMelds.deadwood;
          
          // AI takes upcard if it improves hand by 3+ points or creates good meld potential
          if (improvement >= 3 || (improvement >= 1 && withUpcardMelds.melds.length > currentMelds.melds.length)) {
            return {
              type: MoveType.TakeUpcard,
              playerId: aiPlayerState.id,
              gameId: this.state.id,
            };
          }
        }
        
        return {
          type: MoveType.PassUpcard,
          playerId: aiPlayerState.id,
          gameId: this.state.id,
        };
      }
      
      // For draw and discard phases, use the AIPlayer's sophisticated logic
      if (this.state.phase === GamePhase.Draw || this.state.phase === GamePhase.Discard) {
        const aiMove = this.aiPlayer.getMove(
          aiPlayerState.hand,
          this.state.phase,
          this.state.discardPile,
          this.state.stockPileCount
        );
        
        // Add gameId to the move
        if (aiMove) {
          aiMove.gameId = this.state.id;
        }
        
        return aiMove;
      }
      
    } catch (error) {
      console.error('AI suggestion error:', error);
      // Fallback to safe moves
      if (this.state.phase === GamePhase.UpcardDecision) {
        return {
          type: MoveType.PassUpcard,
          playerId: aiPlayerState.id,
          gameId: this.state.id,
        };
      } else if (this.state.phase === GamePhase.Draw) {
        return {
          type: MoveType.DrawStock,
          playerId: aiPlayerState.id,
          gameId: this.state.id,
        };
      } else if (this.state.phase === GamePhase.Discard && aiPlayerState.hand.length > 10) {
        // Discard a high deadwood card as fallback
        const optimal = findOptimalMelds(aiPlayerState.hand);
        const nonMeldedCards = aiPlayerState.hand.filter(card =>
          !optimal.melds.some(meld => meld.cards.some(c => c.id === card.id))
        );
        
        if (nonMeldedCards.length > 0) {
          return {
            type: MoveType.Discard,
            playerId: aiPlayerState.id,
            gameId: this.state.id,
            cardId: nonMeldedCards[0].id,
          };
        }
      }
    }

    return null;
  }
}