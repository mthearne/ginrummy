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
   * Get AI thought process for display (without revealing strategy)
   */
  public getThoughts(
    hand: Card[],
    phase: GamePhase,
    discardPile: Card[],
    stockCount: number
  ): string[] {
    const thoughts: string[] = [];
    
    if (phase === GamePhase.Draw) {
      thoughts.push("Looking at my cards...");
      
      if (discardPile.length > 0) {
        const topDiscard = discardPile[discardPile.length - 1];
        thoughts.push(`Hmm, should I take the ${topDiscard.rank}?`);
        
        // Don't reveal the actual evaluation
        const shouldTake = Math.random() > 0.6; // Just for thinking variety
        if (shouldTake) {
          thoughts.push("That could be useful...");
          thoughts.push("I'll take it");
        } else {
          thoughts.push("I'll pass on that");
          thoughts.push("Drawing from the deck");
        }
      } else {
        thoughts.push("Drawing from the deck");
      }
    } else if (phase === GamePhase.Discard) {
      thoughts.push("Which card should I discard?");
      thoughts.push("Let me think about this...");
      
      // Generic thoughts without revealing strategy
      const thinkingOptions = [
        "This one doesn't fit well",
        "I don't need this card",
        "This seems like the right choice",
        "Better to get rid of this one"
      ];
      
      const randomThought = thinkingOptions[Math.floor(Math.random() * thinkingOptions.length)];
      thoughts.push(randomThought);
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
    // Try discarding each card in hand to see if we achieve gin
    // We check ALL cards, not just unmelded ones, because sometimes
    // discarding a melded card allows for better meld formation
    for (const card of hand) {
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
    // Try discarding each card in hand and recalculate optimal melds
    // We check ALL cards because sometimes discarding a melded card
    // and reforming melds results in better deadwood totals
    for (const card of hand) {
      const handAfterDiscard = hand.filter(c => c.id !== card.id);
      const optimalMelds = findOptimalMelds(handAfterDiscard);
      
      if (optimalMelds.deadwood <= 10) {
        return {
          type: MoveType.Knock,
          playerId: this.playerId,
          cardId: card.id,
          melds: optimalMelds.melds,
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
   * Calculate optimal layoffs for AI player
   */
  public calculateOptimalLayoffs(
    hand: Card[],
    currentMelds: Meld[],
    opponentMelds: Meld[]
  ): Array<{ cards: Card[]; targetMeld: Meld }> {
    console.log(`🤖 AIPlayer.calculateOptimalLayoffs: Starting calculation`);
    console.log(`🤖 AIPlayer: Hand size: ${hand.length}, Current melds: ${currentMelds.length}, Opponent melds: ${opponentMelds.length}`);
    
    const layoffs: Array<{ cards: Card[]; targetMeld: Meld }> = [];
    
    // Get deadwood cards (cards not in current melds)
    const meldedCardIds = new Set(
      currentMelds.flatMap(meld => meld.cards.map(card => card.id))
    );
    const deadwoodCards = hand.filter(card => !meldedCardIds.has(card.id));
    
    console.log(`🤖 AIPlayer: Deadwood cards: ${deadwoodCards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
    console.log(`🤖 AIPlayer: Opponent melds: ${opponentMelds.map(m => `${m.type}[${m.cards.map(c => `${c.rank}${c.suit}`).join(',')}]`).join(', ')}`);
    
    // Try each deadwood card against each opponent meld
    for (const card of deadwoodCards) {
      console.log(`🤖 AIPlayer: Testing card ${card.rank}${card.suit} against all opponent melds`);
      for (const meld of opponentMelds) {
        console.log(`🤖 AIPlayer:   Testing against meld: ${meld.type}[${meld.cards.map(c => `${c.rank}${c.suit}`).join(',')}]`);
        if (this.canLayOffOnMeld(card, meld)) {
          console.log(`🤖 AIPlayer:   ✅ CAN LAYOFF ${card.rank}${card.suit} on ${meld.type}[${meld.cards.map(c => `${c.rank}${c.suit}`).join(',')}]`);
          // Check if we already have a layoff for this meld
          const existingLayoff = layoffs.find(lo => 
            lo.targetMeld.cards[0].id === meld.cards[0].id
          );
          
          if (existingLayoff) {
            existingLayoff.cards.push(card);
          } else {
            layoffs.push({
              cards: [card],
              targetMeld: meld
            });
          }
        } else {
          console.log(`🤖 AIPlayer:   ❌ Cannot layoff ${card.rank}${card.suit} on ${meld.type}[${meld.cards.map(c => `${c.rank}${c.suit}`).join(',')}]`);
        }
      }
    }
    
    console.log(`🤖 AIPlayer: Found ${layoffs.length} total layoffs`);
    return layoffs;
  }

  /**
   * Decide if AI should perform layoffs or skip
   */
  public shouldPerformLayoffs(
    hand: Card[],
    currentMelds: Meld[],
    opponentMelds: Meld[],
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): boolean {
    const availableLayoffs = this.calculateOptimalLayoffs(hand, currentMelds, opponentMelds);
    
    if (availableLayoffs.length === 0) {
      return false; // No layoffs available
    }
    
    const totalLayoffValue = availableLayoffs.reduce((total, layoff) => 
      total + layoff.cards.reduce((cardTotal, card) => cardTotal + getCardValue(card), 0), 0
    );
    
    // Always layoff if it saves significant points
    if (totalLayoffValue >= 15) {
      return true;
    }
    
    // Difficulty-based decision for smaller layoffs
    const adjustments = AIPlayer.getDifficultyAdjustments(difficulty);
    const layoffThreshold = {
      easy: 5,    // Lay off even small amounts
      medium: 8,  // Moderate threshold
      hard: 10    // Only lay off substantial amounts
    }[difficulty];
    
    return totalLayoffValue >= layoffThreshold;
  }

  /**
   * Check if a card can be laid off on a specific meld
   */
  private canLayOffOnMeld(card: Card, meld: Meld): boolean {
    console.log(`🤖 AIPlayer: Testing layoff - ${card.rank}${card.suit} on ${meld.type}[${meld.cards.map(c => `${c.rank}${c.suit}`).join(',')}]`);
    
    if (meld.type === 'set') {
      // For sets: card must have same rank as the set
      const canLayoff = card.rank === meld.cards[0].rank;
      console.log(`🤖 AIPlayer: Set layoff test - ${card.rank} === ${meld.cards[0].rank} = ${canLayoff}`);
      return canLayoff;
    } else {
      // For runs: card must extend the sequence and be same suit
      const meldSuit = meld.cards[0].suit;
      if (card.suit !== meldSuit) {
        console.log(`🤖 AIPlayer: Run layoff failed - different suit (${card.suit} vs ${meldSuit})`);
        return false;
      }
      
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const meldRanks = meld.cards.map(c => ranks.indexOf(c.rank)).sort((a, b) => a - b);
      const cardRank = ranks.indexOf(card.rank);
      
      // Card must extend either end of the run (not middle)
      const canExtendLow = cardRank === meldRanks[0] - 1 && cardRank >= 0;
      const canExtendHigh = cardRank === meldRanks[meldRanks.length - 1] + 1 && cardRank < ranks.length;
      
      const canLayoff = canExtendLow || canExtendHigh;
      console.log(`🤖 AIPlayer: Run layoff test - cardRank:${cardRank}, meldRanks:[${meldRanks.join(',')}], canExtendLow:${canExtendLow}, canExtendHigh:${canExtendHigh} = ${canLayoff}`);
      return canLayoff;
    }
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