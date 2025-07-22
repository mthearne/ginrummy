import { Card, Suit, Rank } from '../types/game';

/**
 * Generate a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const suits = Object.values(Suit);
  const ranks = Object.values(Rank);

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        suit,
        rank,
        id: `${suit}_${rank}`,
      });
    }
  }

  return deck;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get the point value of a card for deadwood calculation
 */
export function getCardValue(card: Card): number {
  switch (card.rank) {
    case Rank.Ace:
      return 1;
    case Rank.Two:
      return 2;
    case Rank.Three:
      return 3;
    case Rank.Four:
      return 4;
    case Rank.Five:
      return 5;
    case Rank.Six:
      return 6;
    case Rank.Seven:
      return 7;
    case Rank.Eight:
      return 8;
    case Rank.Nine:
      return 9;
    case Rank.Ten:
    case Rank.Jack:
    case Rank.Queen:
    case Rank.King:
      return 10;
    default:
      return 0;
  }
}

/**
 * Get numeric value for rank comparison
 */
export function getRankValue(rank: Rank): number {
  switch (rank) {
    case Rank.Ace:
      return 1;
    case Rank.Two:
      return 2;
    case Rank.Three:
      return 3;
    case Rank.Four:
      return 4;
    case Rank.Five:
      return 5;
    case Rank.Six:
      return 6;
    case Rank.Seven:
      return 7;
    case Rank.Eight:
      return 8;
    case Rank.Nine:
      return 9;
    case Rank.Ten:
      return 10;
    case Rank.Jack:
      return 11;
    case Rank.Queen:
      return 12;
    case Rank.King:
      return 13;
    default:
      return 0;
  }
}

/**
 * Sort cards by suit and rank
 */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const suitOrder = [Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades];
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return getRankValue(a.rank) - getRankValue(b.rank);
  });
}

/**
 * Check if cards form a valid set (same rank, different suits)
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  
  const rank = cards[0].rank;
  const suits = new Set(cards.map(card => card.suit));
  
  return cards.every(card => card.rank === rank) && suits.size === cards.length;
}

/**
 * Check if cards form a valid run (consecutive ranks, same suit)
 */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  
  const suit = cards[0].suit;
  if (!cards.every(card => card.suit === suit)) return false;
  
  const sortedCards = [...cards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
  
  for (let i = 1; i < sortedCards.length; i++) {
    const prevValue = getRankValue(sortedCards[i - 1].rank);
    const currentValue = getRankValue(sortedCards[i].rank);
    if (currentValue !== prevValue + 1) return false;
  }
  
  return true;
}

/**
 * Find the best combination of cards that can form sets
 */
export function findCardGroups(cards: Card[]): Card[][] {
  const groups: Card[][] = [];
  const usedCards = new Set<string>();
  
  // Group by rank for sets
  const rankGroups = new Map<Rank, Card[]>();
  for (const card of cards) {
    if (!rankGroups.has(card.rank)) {
      rankGroups.set(card.rank, []);
    }
    rankGroups.get(card.rank)!.push(card);
  }
  
  // Find sets (can be 3 or 4 cards of same rank)
  for (const [rank, rankCards] of rankGroups) {
    if (rankCards.length >= 3) {
      // Use all available cards of the same rank (up to 4 for a complete set)
      groups.push(rankCards);
      rankCards.forEach(card => usedCards.add(card.id));
    }
  }
  
  // Group by suit for runs
  const suitGroups = new Map<Suit, Card[]>();
  for (const card of cards) {
    if (usedCards.has(card.id)) continue;
    if (!suitGroups.has(card.suit)) {
      suitGroups.set(card.suit, []);
    }
    suitGroups.get(card.suit)!.push(card);
  }
  
  // Find runs
  for (const [suit, suitCards] of suitGroups) {
    const sorted = suitCards.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
    let currentRun: Card[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const prevValue = getRankValue(currentRun[currentRun.length - 1].rank);
      const currentValue = getRankValue(sorted[i].rank);
      
      if (currentValue === prevValue + 1) {
        currentRun.push(sorted[i]);
      } else {
        if (currentRun.length >= 3) {
          groups.push([...currentRun]);
        }
        currentRun = [sorted[i]];
      }
    }
    
    if (currentRun.length >= 3) {
      groups.push([...currentRun]);
    }
  }
  
  return groups;
}