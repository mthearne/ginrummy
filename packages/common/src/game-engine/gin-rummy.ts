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
 * Turn state management for atomic operations
 */
interface TurnState {
  currentPlayerId: string;
  phase: GamePhase;
  isProcessing: boolean;
  lockTimestamp: number;
  moveQueue: GameMove[];
  isLoading?: boolean; // Flag to prevent AI processing during state restoration
}

/**
 * Move result with comprehensive state information
 */
interface MoveResult {
  success: boolean;
  error?: string;
  state: GameState;
  move?: GameMove; // The move that was executed
  nextMoves?: GameMove[]; // For AI chaining
  stateChanges?: string[]; // Debug information
}

/**
 * Core Gin Rummy game engine with server-authoritative logic
 * Rebuilt with atomic turn management and proper synchronization
 */
export class GinRummyGame {
  private state: GameState;
  private deck: Card[];
  private aiPlayer: AIPlayer | null = null;
  private turnState: TurnState;
  private readonly TURN_LOCK_TIMEOUT = 5000; // 5 seconds
  private readonly AI_PROCESSING_TIMEOUT = 3000; // 3 seconds
  private lastAiTurnId: number = -1; // Track last processed AI turn for deduplication

  constructor(gameId: string, player1Id: string, player2Id: string, vsAI = false) {
    this.deck = shuffleDeck(createDeck());
    
    // Initialize AI player if this is an AI game
    if (vsAI) {
      this.aiPlayer = new AIPlayer(player2Id);
    }

    this.state = {
      id: gameId,
      status: GameStatus.Active,
      phase: GamePhase.UpcardDecision,
      currentPlayerId: player1Id, // Player1 (human) gets first upcard decision
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
      turnId: 0, // Start at 0, increment at end of each turn
    };

    // Initialize turn state management
    this.turnState = {
      currentPlayerId: player1Id,
      phase: GamePhase.UpcardDecision,
      isProcessing: false,
      lockTimestamp: 0,
      moveQueue: [],
      isLoading: false
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
    
    // Sync turn state
    this.syncTurnState();
  }

  /**
   * Execute a game move with atomic turn management
   */
  public makeMove(move: GameMove): MoveResult {
    return this.executeAtomicMove(move);
  }

  /**
   * Execute a single move atomically with proper locking
   */
  private executeAtomicMove(move: GameMove): MoveResult {
    // Acquire turn lock
    if (!this.acquireTurnLock(move.playerId)) {
      return {
        success: false,
        error: 'Turn lock acquisition failed - another move is processing',
        state: this.state,
        stateChanges: [`Failed to acquire lock for player ${move.playerId}`]
      };
    }

    try {
      const result = this.processMove(move);
      
      // Handle AI moves if needed
      if (result.success && this.shouldProcessAIMoves()) {
        const aiMoves = this.generateAIMoves();
        result.nextMoves = aiMoves;
      }
      
      return result;
    } finally {
      this.releaseTurnLock();
    }
  }

  /**
   * Process AI moves synchronously
   */
  public processAIMoves(): MoveResult[] {
    console.log('\n=== AI MOVE PROCESSING START ===');
    
    // AI deduplication: don't process if we've already processed this turn
    const currentTurnId = this.state.turnId || 0;
    if (currentTurnId <= this.lastAiTurnId) {
      console.log(`AI deduplication: already processed turnId ${currentTurnId} (last processed: ${this.lastAiTurnId})`);
      return [];
    }
    
    // isProcessing guard: prevent concurrent AI processing
    if (this.isProcessing()) {
      console.log('AI processing skipped: game is already processing moves');
      return [];
    }
    
    const results: MoveResult[] = [];
    
    while (this.shouldProcessAIMoves()) {
      console.log(`AI move attempt ${results.length + 1}`);
      console.log('Should process AI moves:', this.shouldProcessAIMoves());
      console.log('Current player:', this.state.currentPlayerId);
      console.log('Current phase:', this.state.phase);
      
      const aiMove = this.getAISuggestion();
      if (!aiMove) {
        console.log('No AI move suggestion available, breaking chain');
        break;
      }
      
      console.log('Executing AI move:', aiMove.type);
      const result = this.executeAtomicMove(aiMove);
      // Add the move to the result for turn history tracking
      result.move = aiMove;
      results.push(result);
      
      console.log('AI move result:', result.success ? 'SUCCESS' : 'FAILED');
      if (result.error) console.log('AI move error:', result.error);
      if (result.stateChanges) console.log('State changes:', result.stateChanges);
      
      if (!result.success) {
        console.log('AI move failed, breaking chain');
        break;
      }
      
      // Log state after move
      console.log('After AI move - Phase:', this.state.phase, 'Current player:', this.state.currentPlayerId);
      
      // Prevent infinite loops
      if (results.length >= 5) {
        console.warn('AI move limit reached, breaking chain');
        break;
      }
    }
    
    // Update lastAiTurnId to current turnId to prevent reprocessing
    this.lastAiTurnId = this.state.turnId || 0;
    console.log(`Updated lastAiTurnId to ${this.lastAiTurnId}`);
    
    console.log('=== AI MOVE PROCESSING END ===\n');
    return results;
  }

  /**
   * Core move processing logic
   */
  private processMove(move: GameMove): MoveResult {
    const stateChanges: string[] = [];
    const player = this.getPlayer(move.playerId);
    
    if (!player) {
      return {
        success: false,
        error: 'Player not found',
        state: this.state,
        stateChanges: [`Player ${move.playerId} not found`]
      };
    }

    // Validate move against current turn state
    const validation = this.validateMoveWithTurnState(move, player);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        state: this.state,
        stateChanges: [`Move validation failed: ${validation.error}`]
      };
    }

    stateChanges.push(`Processing ${move.type} for player ${move.playerId}`);
    
    // Execute move based on type
    let result: { success: boolean; error?: string; state: GameState };
    
    switch (move.type) {
      case MoveType.TakeUpcard:
        result = this.handleTakeUpcard(move.playerId);
        stateChanges.push(`Upcard taken, phase: ${this.state.phase}`);
        break;
      
      case MoveType.PassUpcard:
        result = this.handlePassUpcard(move.playerId);
        stateChanges.push(`Upcard passed, next player: ${this.state.currentPlayerId}`);
        break;
      
      case MoveType.DrawStock:
        result = this.handleDrawStock(move.playerId);
        stateChanges.push(`Stock drawn, cards left: ${this.state.stockPileCount}`);
        break;
      
      case MoveType.DrawDiscard:
        result = this.handleDrawDiscard(move.playerId);
        stateChanges.push(`Discard drawn, pile size: ${this.state.discardPile.length}`);
        break;
      
      case MoveType.Discard:
        result = this.handleDiscard(move.playerId, move.cardId!);
        stateChanges.push(`Card discarded, next player: ${this.state.currentPlayerId}`);
        break;
      
      case MoveType.Knock:
        result = this.handleKnock(move.playerId, move.cardId!, move.melds!);
        stateChanges.push(`Player knocked, round ending`);
        break;
      
      case MoveType.Gin:
        result = this.handleGin(move.playerId, move.cardId!, move.melds!);
        stateChanges.push(`Player ginned, round ending`);
        break;
      
      case MoveType.StartNewRound:
        result = this.handleStartNewRound();
        stateChanges.push(`New round started`);
        break;
      
      default:
        result = { success: false, error: 'Invalid move type', state: this.state };
        stateChanges.push(`Invalid move type: ${move.type}`);
    }

    // Update turn state after successful move
    if (result.success) {
      this.syncTurnState();
      stateChanges.push(`Turn state synced: ${this.state.currentPlayerId} in ${this.state.phase}`);
    }

    return {
      ...result,
      stateChanges
    };
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
    
    // Sync turn state after phase change
    this.syncTurnState();

    return { success: true, state: this.state };
  }

  private handlePassUpcard(playerId: string): { success: boolean; error?: string; state: GameState } {
    // Determine who gets the next decision
    const player1Id = this.state.players[0].id;
    const player2Id = this.state.players[1].id;
    
    if (playerId === player2Id) {
      // Non-dealer passed, now dealer can decide
      this.state.currentPlayerId = player1Id;
      this.syncTurnState();
      return { success: true, state: this.state };
    } else {
      // Dealer also passed, non-dealer starts drawing from stock
      this.state.currentPlayerId = player2Id;
      this.state.phase = GamePhase.Draw;
      this.syncTurnState();
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
      this.syncTurnState();
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
    
    // Sync turn state after phase change
    this.syncTurnState();

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
    
    // Sync turn state after phase change
    this.syncTurnState();

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
    const [, player2] = this.state.players;
    this.state.currentPlayerId = player2.id; // Non-dealer gets first upcard decision
    
    // Sync turn state
    this.syncTurnState();
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
    
    // Increment turnId exactly once at end of turn for deduplication
    this.state.turnId = (this.state.turnId || 0) + 1;
    
    // Sync turn state
    this.syncTurnState();
  }

  /**
   * Sync turn state with game state
   */
  private syncTurnState(): void {
    this.turnState.currentPlayerId = this.state.currentPlayerId;
    this.turnState.phase = this.state.phase;
    
    // Dev assertion: validate currentPlayerId exists in players
    this.assertValidCurrentPlayer();
  }

  /**
   * Dev assertion to ensure currentPlayerId is valid
   */
  private assertValidCurrentPlayer(): void {
    if (this.state.phase === GamePhase.GameOver || this.state.phase === GamePhase.RoundOver) {
      return; // Skip validation for end states
    }
    
    const playerIds = this.state.players.map(p => p.id);
    if (!playerIds.includes(this.state.currentPlayerId)) {
      console.error('🚨 INVARIANT BREACH: currentPlayerId not found in players!');
      console.error('- currentPlayerId:', this.state.currentPlayerId);
      console.error('- available playerIds:', playerIds);
      console.error('- phase:', this.state.phase);
      console.error('- gameOver:', this.state.gameOver);
      
      // In development, throw an error to catch this immediately
      if (process.env.NODE_ENV === 'development') {
        throw new Error(`Invalid currentPlayerId: ${this.state.currentPlayerId} not in players: ${playerIds.join(', ')}`);
      }
    }
  }

  /**
   * Acquire turn lock for atomic operations
   */
  private acquireTurnLock(playerId: string): boolean {
    const now = Date.now();
    
    // Check if lock has expired
    if (this.turnState.isProcessing && (now - this.turnState.lockTimestamp) > this.TURN_LOCK_TIMEOUT) {
      console.warn('Turn lock expired, releasing stale lock');
      this.releaseTurnLock();
    }
    
    // Can't acquire if already processing
    if (this.turnState.isProcessing) {
      return false;
    }
    
    // Acquire lock
    this.turnState.isProcessing = true;
    this.turnState.lockTimestamp = now;
    return true;
  }

  /**
   * Release turn lock
   */
  private releaseTurnLock(): void {
    this.turnState.isProcessing = false;
    this.turnState.lockTimestamp = 0;
  }

  /**
   * Validate move with turn state
   */
  private validateMoveWithTurnState(move: GameMove, player: PlayerState): { valid: boolean; error?: string } {
    // Special case for start_new_round moves
    if (move.type === MoveType.StartNewRound) {
      // For AI games, the human player can always start a new round
      // For PvP games, either player can start a new round
      if (this.state.phase !== GamePhase.RoundOver) {
        return { valid: false, error: 'Can only start new round when current round is over' };
      }
      // Allow the move regardless of current player for round transitions
      return { valid: true };
    }

    // Basic turn validation for all other moves
    if (move.playerId !== this.state.currentPlayerId) {
      return {
        valid: false,
        error: `Not your turn. Current player: ${this.state.currentPlayerId}, attempted: ${move.playerId}`
      };
    }

    // Phase validation
    if (this.state.gameOver) {
      return { valid: false, error: 'Game is over' };
    }

    // Use existing validation logic
    return isValidMove(
      move,
      this.state.phase,
      this.state.currentPlayerId,
      player.hand,
      this.state.discardPile,
      this.state.vsAI
    );
  }

  /**
   * Check if AI moves should be processed
   */
  private shouldProcessAIMoves(): boolean {
    const should = this.state.vsAI && 
           this.state.currentPlayerId === this.getAIPlayerId() && 
           !this.state.gameOver &&
           this.state.phase !== GamePhase.GameOver &&
           this.state.phase !== GamePhase.RoundOver &&
           !this.turnState.isLoading; // Don't process AI moves during state loading
           
    console.log('Should process AI moves check:');
    console.log('- vsAI:', this.state.vsAI);
    console.log('- currentPlayerId:', this.state.currentPlayerId);
    console.log('- gameOver:', this.state.gameOver);
    console.log('- phase:', this.state.phase);
    console.log('- isLoading:', this.turnState.isLoading);
    console.log('- result:', should);
    
    return should;
  }

  /**
   * Generate AI moves for chaining
   */
  private generateAIMoves(): GameMove[] {
    const moves: GameMove[] = [];
    const aiMove = this.getAISuggestion();
    if (aiMove) {
      moves.push(aiMove);
    }
    return moves;
  }

  /**
   * Get turn state for debugging
   */
  public getTurnState(): TurnState {
    return { ...this.turnState };
  }

  /**
   * Check if game is processing moves
   */
  public isProcessing(): boolean {
    return this.turnState.isProcessing;
  }

  /**
   * Force synchronization of turn state with game state
   * Used by cache restoration to ensure consistency
   */
  public forceTurnStateSync(): void {
    this.syncTurnState();
  }

  /**
   * Set loading state to prevent AI processing during state restoration
   */
  public setLoadingState(isLoading: boolean): void {
    this.turnState.isLoading = isLoading;
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
    return { 
      ...this.state,
      players: this.state.players.map(p => ({
        ...p,
        hand: [...(p.hand || [])],
        melds: p.melds ? [...p.melds] : []
      })),
      discardPile: [...(this.state.discardPile || [])]
    };
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
      // Show all cards and melds when round/game is over - deep copy to avoid reference sharing
      playerState.players = playerState.players.map(p => ({ 
        ...p, 
        hand: [...(p.hand || [])],
        melds: p.melds ? [...p.melds] : []
      }));
    } else {
      // Hide opponent's hand - only show hand size during active gameplay
      playerState.players = playerState.players.map(p => {
        if (p.id === playerId) {
          // Deep copy for the requesting player's data
          return { 
            ...p,
            hand: [...(p.hand || [])],
            melds: p.melds ? [...p.melds] : []
          };
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
   * Get the AI player ID (helper for consistent AI player identification)
   */
  private getAIPlayerId(): string | null {
    if (!this.aiPlayer) return null;
    return this.state.players.find(p => p.id !== this.state.players[0].id)?.id || null;
  }

  /**
   * Get AI thought process for display
   */
  public getAIThoughts(): string[] {
    const aiPlayerState = this.state.players.find(p => p.id === this.getAIPlayerId());
    if (!aiPlayerState || this.state.currentPlayerId !== aiPlayerState.id || !this.aiPlayer) {
      return [];
    }

    if (this.state.gameOver || this.state.phase === GamePhase.GameOver) {
      return [];
    }

    try {
      return this.aiPlayer.getThoughts(
        aiPlayerState.hand,
        this.state.phase,
        this.state.discardPile,
        this.state.stockPileCount
      );
    } catch (error) {
      console.error('AI thoughts error:', error);
      return ['Thinking...'];
    }
  }

  /**
   * Get suggested move for AI player using the sophisticated AIPlayer class
   */
  public getAISuggestion(): GameMove | null {
    const aiPlayerState = this.state.players.find(p => p.id === this.getAIPlayerId());
    if (!aiPlayerState || this.state.currentPlayerId !== aiPlayerState.id || !this.aiPlayer) {
      console.log('AI suggestion failed: no AI player or not AI turn');
      return null;
    }

    if (this.state.gameOver || this.state.phase === GamePhase.GameOver) {
      console.log('AI suggestion failed: game is over');
      return null;
    }
    
    console.log(`\n=== AI SUGGESTION REQUEST ===`);
    console.log('AI hand size:', aiPlayerState.hand.length);
    console.log('Current phase:', this.state.phase);
    console.log('Stock count:', this.state.stockPileCount);
    console.log('Discard pile size:', this.state.discardPile.length);

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
      
      // Handle round over phase - AI should start the next round
      if (this.state.phase === GamePhase.RoundOver) {
        return {
          type: MoveType.StartNewRound,
          playerId: aiPlayerState.id,
          gameId: this.state.id,
        };
      }
      
      // For draw and discard phases, use the AIPlayer's sophisticated logic
      if (this.state.phase === GamePhase.Draw || this.state.phase === GamePhase.Discard) {
        // Defensive check: if AI has 11 cards but phase is Draw, it should be Discard
        let actualPhase = this.state.phase;
        if (this.state.phase === GamePhase.Draw && aiPlayerState.hand.length === 11) {
          console.warn('AI has 11 cards but phase is Draw, correcting to Discard phase');
          actualPhase = GamePhase.Discard;
          this.state.phase = GamePhase.Discard;
          this.syncTurnState();
        }
        
        const aiMove = this.aiPlayer.getMove(
          aiPlayerState.hand,
          actualPhase,
          this.state.discardPile,
          this.state.stockPileCount
        );
        
        // Add gameId to the move
        if (aiMove) {
          aiMove.gameId = this.state.id;
          console.log('AI move generated:', aiMove.type, 'for phase:', actualPhase);
        } else {
          console.log('AI move generation failed - no move returned');
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
        // Check if AI already has 11 cards (should be discarding)
        if (aiPlayerState.hand.length > 10) {
          console.warn('Fallback: AI has 11+ cards but phase is Draw, switching to discard');
          this.state.phase = GamePhase.Discard;
          this.syncTurnState();
          // Fall through to discard logic
        } else {
          return {
            type: MoveType.DrawStock,
            playerId: aiPlayerState.id,
            gameId: this.state.id,
          };
        }
      }
      
      if (this.state.phase === GamePhase.Discard && aiPlayerState.hand.length > 10) {
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