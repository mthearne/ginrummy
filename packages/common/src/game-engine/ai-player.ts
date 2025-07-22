import { Card, GameMove, MoveType, Meld, GamePhase } from '../types/game.js';
import {
  getCardValue,
  findCardGroups,
  getRankValue,
  isValidRun,
  isValidSet,
} from '../utils/cards.js';
import { calculateDeadwood, findOptimalMelds } from '../utils/scoring.js';

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
   * Evaluate and return the best move for the current game state
   */
  public getMove(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number
  ): GameMove {
    if (phase === GamePhase.Draw) {
      return this.getDrawMove(hand, discardPile, stockCount);
    } else if (phase === GamePhase.Discard) {
      return this.getDiscardMove(hand);
    }

    throw new Error('Invalid game phase for AI move');
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
      // Shouldn't happen, but fallback to first card
      return hand[0];
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
   * Get difficulty level adjustments
   */
  public static getDifficultyAdjustments(difficulty: 'easy' | 'medium' | 'hard') {
    switch (difficulty) {
      case 'easy':
        return {
          makeSuboptimalMoves: 0.3, // 30% chance of suboptimal move
          knockThreshold: 8, // Knock more aggressively
          discardRandomness: 0.2,
        };
      case 'medium':
        return {
          makeSuboptimalMoves: 0.1, // 10% chance of suboptimal move
          knockThreshold: 10,
          discardRandomness: 0.1,
        };
      case 'hard':
        return {
          makeSuboptimalMoves: 0.05, // 5% chance of suboptimal move
          knockThreshold: 10,
          discardRandomness: 0.05,
        };
      default:
        return {
          makeSuboptimalMoves: 0.1,
          knockThreshold: 10,
          discardRandomness: 0.1,
        };
    }
  }
}