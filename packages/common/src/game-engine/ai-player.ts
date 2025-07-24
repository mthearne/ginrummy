import { Card, GameMove, MoveType, Meld, GamePhase } from '../types/game';
import {
  getCardValue,
  findCardGroups,
  getRankValue,
  isValidRun,
  isValidSet,
} from '../utils/cards';
import { calculateDeadwood, findOptimalMelds } from '../utils/scoring';

/**
 * AI strategy for Gin Rummy
 * Uses heuristic evaluation to make decisions
 */
export class AIPlayer {
  private readonly playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Get AI thought process for display
   */
  public getThoughts(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number
  ): string[] {
    const thoughts: string[] = [];
    
    if (phase === GamePhase.Draw) {
      thoughts.push("Analyzing my hand...");
      
      const currentValue = this.evaluateHand(hand);
      const currentMelds = findOptimalMelds(hand);
      thoughts.push(`I have ${currentMelds.melds.length} melds, ${currentMelds.deadwood} deadwood`);
      
      if (discardPile.length > 0) {
        const topDiscard = discardPile[discardPile.length - 1];
        thoughts.push(`Considering ${topDiscard.rank} of ${topDiscard.suit.toLowerCase()}...`);
        
        const handWithDiscard = [...hand, topDiscard];
        const discardValue = this.evaluateHand(handWithDiscard);
        const improvement = discardValue - currentValue;
        
        if (improvement > 5) {
          thoughts.push("This card improves my hand significantly!");
          thoughts.push("Taking from discard pile");
        } else {
          thoughts.push("Not worth taking. Drawing from stock");
        }
      } else {
        thoughts.push("Drawing from stock pile");
      }
    } else if (phase === GamePhase.Discard) {
      thoughts.push("Time to discard...");
      
      const optimal = findOptimalMelds(hand);
      thoughts.push(`Current deadwood: ${optimal.deadwood}`);
      
      if (optimal.deadwood <= 10) {
        thoughts.push("I can knock! But let me think...");
      }
      
      const nonMeldedCards = hand.filter(card =>
        !optimal.melds.some(meld => meld.cards.some(c => c.id === card.id))
      );
      
      if (nonMeldedCards.length > 0) {
        const worstCard = nonMeldedCards.reduce((worst, card) =>
          getCardValue(card) > getCardValue(worst) ? card : worst
        );
        thoughts.push(`Discarding ${worstCard.rank} of ${worstCard.suit.toLowerCase()}`);
      } else {
        thoughts.push("Choosing least useful card...");
      }
    }
    
    return thoughts;
  }

  /**
   * Evaluate and return the best move for the current game state
   */
  public getMove(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number
  ): GameMove {
    console.log(`AI evaluating move: phase=${phase}, hand size=${hand.length}, discard pile size=${discardPile.length}`);
    if (phase === GamePhase.Draw) {
      const move = this.getDrawMove(hand, discardPile, stockCount);
      console.log(`AI chose draw move: ${move.type}`);
      return move;
    } else if (phase === GamePhase.Discard) {
      const move = this.getDiscardMove(hand);
      console.log(`AI chose discard move: ${move.type}`);
      return move;
    }

    throw new Error(`Invalid game phase for AI move: ${phase}`);
  }

  /**
   * Decide whether to draw from stock or discard pile
   */
  private getDrawMove(hand: Card[], discardPile: Card[], stockCount: number): GameMove {
    if (discardPile.length === 0) {
      return {
        type: MoveType.DrawStock,
        playerId: this.playerId,
      };
    }

    const topDiscard = discardPile[discardPile.length - 1];
    const handWithDiscard = [...hand, topDiscard];
    
    // Evaluate potential improvement by drawing discard
    const currentValue = this.evaluateHand(hand);
    const discardValue = this.evaluateHand(handWithDiscard);
    
    // If drawing discard significantly improves hand, do it
    if (discardValue > currentValue + 5) {
      return {
        type: MoveType.DrawDiscard,
        playerId: this.playerId,
      };
    }

    // Otherwise draw from stock
    return {
      type: MoveType.DrawStock,
      playerId: this.playerId,
    };
  }

  /**
   * Decide what to discard, or whether to knock/gin
   */
  private getDiscardMove(hand: Card[]): GameMove {
    const optimal = findOptimalMelds(hand);
    
    // Check for gin (no deadwood after discarding)
    const ginMove = this.checkForGin(hand, optimal.melds);
    if (ginMove) {
      return ginMove;
    }

    // Check if we can knock (≤10 deadwood after discarding)
    const knockMove = this.checkForKnock(hand, optimal.melds);
    if (knockMove) {
      return knockMove;
    }

    // Regular discard - choose worst card
    const discardCard = this.chooseBestDiscard(hand, optimal.melds);
    
    return {
      type: MoveType.Discard,
      playerId: this.playerId,
      cardId: discardCard.id,
    };
  }

  /**
   * Check if we can gin (all cards melded after discard)
   */
  private checkForGin(hand: Card[], melds: Meld[]): GameMove | null {
    const meldedCardIds = new Set(
      melds.flatMap(meld => meld.cards.map(card => card.id))
    );
    
    const unmeldedCards = hand.filter(card => !meldedCardIds.has(card.id));
    
    // Try discarding each unmelded card to see if we achieve gin
    for (const card of unmeldedCards) {
      const handAfterDiscard = hand.filter(c => c.id !== card.id);
      const newMelds = findOptimalMelds(handAfterDiscard);
      
      if (newMelds.deadwood === 0) {
        return {
          type: MoveType.Gin,
          playerId: this.playerId,
          cardId: card.id,
          melds: newMelds.melds,
        };
      }
    }

    return null;
  }

  /**
   * Check if we can knock (≤10 deadwood after discard)
   */
  private checkForKnock(hand: Card[], melds: Meld[]): GameMove | null {
    const meldedCardIds = new Set(
      melds.flatMap(meld => meld.cards.map(card => card.id))
    );
    
    const unmeldedCards = hand.filter(card => !meldedCardIds.has(card.id));
    
    // Try discarding each unmelded card
    for (const card of unmeldedCards) {
      const handAfterDiscard = hand.filter(c => c.id !== card.id);
      const deadwood = calculateDeadwood(handAfterDiscard, melds);
      
      if (deadwood <= 10) {
        return {
          type: MoveType.Knock,
          playerId: this.playerId,
          cardId: card.id,
          melds,
        };
      }
    }

    return null;
  }

  /**
   * Choose the best card to discard
   */
  private chooseBestDiscard(hand: Card[], melds: Meld[]): Card {
    const meldedCardIds = new Set(
      melds.flatMap(meld => meld.cards.map(card => card.id))
    );
    
    const unmeldedCards = hand.filter(card => !meldedCardIds.has(card.id));
    
    if (unmeldedCards.length === 0) {
      // Shouldn't happen, but fallback to highest card
      return hand.reduce((highest, card) => 
        getCardValue(card) > getCardValue(highest) ? card : highest
      );
    }

    // Score each unmelded card by potential value
    const cardScores = unmeldedCards.map(card => ({
      card,
      score: this.evaluateDiscardValue(card, hand),
    }));

    // Sort by score (lower is better for discard)
    cardScores.sort((a, b) => a.score - b.score);
    
    return cardScores[0].card;
  }

  /**
   * Evaluate how valuable keeping a card is (lower = better to discard)
   */
  private evaluateDiscardValue(card: Card, hand: Card[]): number {
    let value = 0;

    // Base penalty for card value (higher cards are worse to keep as deadwood)
    value += getCardValue(card);

    // Bonus for potential in runs
    value -= this.evaluateRunPotential(card, hand) * 3;

    // Bonus for potential in sets
    value -= this.evaluateSetPotential(card, hand) * 2;

    return value;
  }

  /**
   * Evaluate potential for card to form runs
   */
  private evaluateRunPotential(card: Card, hand: Card[]): number {
    const samesuit = hand.filter(c => c.suit === card.suit && c.id !== card.id);
    const cardRankValue = getRankValue(card.rank);
    let potential = 0;

    // Check for adjacent cards
    for (const otherCard of samesuit) {
      const otherRankValue = getRankValue(otherCard.rank);
      const diff = Math.abs(cardRankValue - otherRankValue);
      
      if (diff === 1) {
        potential += 2; // Adjacent card
      } else if (diff === 2) {
        potential += 1; // One gap
      }
    }

    return potential;
  }

  /**
   * Evaluate potential for card to form sets
   */
  private evaluateSetPotential(card: Card, hand: Card[]): number {
    const sameRank = hand.filter(c => c.rank === card.rank && c.id !== card.id);
    return sameRank.length * 2; // Each matching rank card adds potential
  }

  /**
   * Evaluate overall hand strength
   */
  private evaluateHand(hand: Card[]): number {
    const optimal = findOptimalMelds(hand);
    let score = 0;

    // Bonus for each melded card
    const meldedCount = optimal.melds.reduce((sum, meld) => sum + meld.cards.length, 0);
    score += meldedCount * 10;

    // Penalty for deadwood
    score -= optimal.deadwood * 2;

    // Bonus for potential melds (2-card combinations)
    score += this.evaluatePotentialMelds(hand) * 3;

    return score;
  }

  /**
   * Evaluate potential for forming future melds
   */
  private evaluatePotentialMelds(hand: Card[]): number {
    let potential = 0;

    // Check for 2-card combinations that could become runs
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        const card1 = hand[i];
        const card2 = hand[j];

        // Same suit, adjacent ranks
        if (card1.suit === card2.suit) {
          const rankDiff = Math.abs(getRankValue(card1.rank) - getRankValue(card2.rank));
          if (rankDiff === 1) {
            potential += 1;
          }
        }

        // Same rank
        if (card1.rank === card2.rank) {
          potential += 1;
        }
      }
    }

    return potential;
  }

  /**
   * Evaluate how much potential a specific card has for meld formation
   */
  private evaluateCardPotential(card: Card, hand: Card[]): number {
    const runPotential = this.evaluateRunPotential(card, hand);
    const setPotential = this.evaluateSetPotential(card, hand);
    return runPotential + setPotential;
  }

  /**
   * Evaluate danger of discarding a card (how much it might help opponent)
   */
  private evaluateDiscardDanger(card: Card): number {
    // High-value cards are more dangerous to discard (opponent gets more points)
    let danger = getCardValue(card) * 0.5;
    
    // Middle ranks (5-9) are more dangerous as they can form more runs
    const rankValue = getRankValue(card.rank);
    if (rankValue >= 5 && rankValue <= 9) {
      danger += 2;
    }
    
    return danger;
  }

  /**
   * Evaluate future potential of keeping a card
   */
  private evaluateFuturePotential(card: Card, hand: Card[]): number {
    const runPotential = this.evaluateRunPotential(card, hand);
    const setPotential = this.evaluateSetPotential(card, hand);
    
    // Give extra weight to cards that are close to forming melds
    let potential = runPotential + setPotential;
    
    // Low-value cards with meld potential are valuable to keep
    if (getCardValue(card) <= 5 && potential > 0) {
      potential += 3;
    }
    
    return potential;
  }

  /**
   * Get difficulty level adjustments
   */
  public static getDifficultyAdjustments(difficulty: 'easy' | 'medium' | 'hard') {
    switch (difficulty) {
      case 'easy':
        return {
          makeSuboptimalMoves: 0.25, // 25% chance of suboptimal move
          knockThreshold: 8, // Knock more aggressively (risky)
          discardRandomness: 0.3,
          drawDiscardThreshold: 2, // Lower threshold for drawing discard
          ginThreshold: 15, // Less likely to go for gin
        };
      case 'medium':
        return {
          makeSuboptimalMoves: 0.1, // 10% chance of suboptimal move
          knockThreshold: 10,
          discardRandomness: 0.15,
          drawDiscardThreshold: 3,
          ginThreshold: 10,
        };
      case 'hard':
        return {
          makeSuboptimalMoves: 0.03, // 3% chance of suboptimal move
          knockThreshold: 10, // Only knock when optimal
          discardRandomness: 0.05,
          drawDiscardThreshold: 4, // Higher threshold for drawing discard
          ginThreshold: 5, // More likely to go for gin
        };
      default:
        return {
          makeSuboptimalMoves: 0.1,
          knockThreshold: 10,
          discardRandomness: 0.15,
          drawDiscardThreshold: 3,
          ginThreshold: 10,
        };
    }
  }

  /**
   * Apply difficulty adjustments to move selection
   */
  public getMoveWithDifficulty(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): GameMove {
    const adjustments = AIPlayer.getDifficultyAdjustments(difficulty);
    
    // Sometimes make suboptimal moves based on difficulty
    if (Math.random() < adjustments.makeSuboptimalMoves) {
      return this.getSuboptimalMove(hand, phase, discardPile, stockCount);
    }
    
    return this.getMove(hand, phase, discardPile, stockCount);
  }

  /**
   * Generate intentionally suboptimal moves for easier difficulty
   */
  private getSuboptimalMove(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number
  ): GameMove {
    if (phase === GamePhase.Draw) {
      // Always draw from stock (suboptimal)
      return {
        type: MoveType.DrawStock,
        playerId: this.playerId,
      };
    } else if (phase === GamePhase.Discard) {
      // Discard randomly from unmelded cards
      const optimal = findOptimalMelds(hand);
      const meldedCardIds = new Set(
        optimal.melds.flatMap(meld => meld.cards.map(card => card.id))
      );
      const unmeldedCards = hand.filter(card => !meldedCardIds.has(card.id));
      
      if (unmeldedCards.length > 0) {
        const randomCard = unmeldedCards[Math.floor(Math.random() * unmeldedCards.length)];
        return {
          type: MoveType.Discard,
          playerId: this.playerId,
          cardId: randomCard.id,
        };
      }
    }
    
    // Fall back to optimal move if suboptimal generation fails
    return this.getMove(hand, phase, discardPile, stockCount);
  }
}