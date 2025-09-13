import { Card, Meld } from '../types/game';
import { getCardValue, findCardGroups } from './cards';

/**
 * Calculate deadwood value for a hand
 */
export function calculateDeadwood(hand: Card[], melds: Meld[] = []): number {
  const meldedCardIds = new Set(
    melds.flatMap(meld => meld.cards.map(card => card.id))
  );
  
  const deadwoodCards = hand.filter(card => !meldedCardIds.has(card.id));
  return deadwoodCards.reduce((total, card) => total + getCardValue(card), 0);
}

/**
 * Find the optimal melds in a hand to minimize deadwood
 */
export function findOptimalMelds(hand: Card[]): { melds: Meld[]; deadwood: number } {
  const groups = findCardGroups(hand);
  const melds: Meld[] = [];
  
  for (const group of groups) {
    if (group.length >= 3) {
      // Determine if it's a set or run
      const isSet = group.every(card => card.rank === group[0].rank);
      melds.push({
        type: isSet ? 'set' : 'run',
        cards: group,
      });
    }
  }
  
  const deadwood = calculateDeadwood(hand, melds);
  return { melds, deadwood };
}

/**
 * Check if a player can knock (deadwood <= 10)
 */
export function canKnock(hand: Card[], melds: Meld[] = []): boolean {
  const deadwood = calculateDeadwood(hand, melds);
  return deadwood <= 10;
}

/**
 * Check if a player has Gin (no deadwood)
 */
export function hasGin(hand: Card[], melds: Meld[] = []): boolean {
  const deadwood = calculateDeadwood(hand, melds);
  return deadwood === 0;
}

/**
 * Calculate round score when a player knocks
 */
export function calculateKnockScore(
  knockerHand: Card[],
  knockerMelds: Meld[],
  opponentHand: Card[],
  opponentMelds: Meld[]
): {
  knockerScore: number;
  opponentScore: number;
  knockerDeadwood: number;
  opponentDeadwood: number;
  isUndercut: boolean;
  isGin: boolean;
} {
  const knockerDeadwood = calculateDeadwood(knockerHand, knockerMelds);
  const opponentDeadwood = calculateDeadwood(opponentHand, opponentMelds);
  
  const isGin = knockerDeadwood === 0;
  const isUndercut = opponentDeadwood <= knockerDeadwood && !isGin;
  
  let knockerScore = 0;
  let opponentScore = 0;
  
  if (isGin) {
    // Gin: Knocker gets opponent deadwood + 25 bonus
    knockerScore = opponentDeadwood + 25;
  } else if (isUndercut) {
    // Undercut: Opponent gets deadwood difference + 25 bonus
    opponentScore = knockerDeadwood - opponentDeadwood + 25;
  } else {
    // Normal knock: Knocker gets deadwood difference
    knockerScore = opponentDeadwood - knockerDeadwood;
  }
  
  return {
    knockerScore,
    opponentScore,
    knockerDeadwood,
    opponentDeadwood,
    isUndercut,
    isGin,
  };
}

/**
 * Calculate score after applying lay-offs
 */
export function calculateScoreWithLayOffs(
  knockerHand: Card[],
  knockerMelds: Meld[],
  opponentHand: Card[],
  opponentMelds: Meld[],
  layOffs: Array<{ cards: Card[]; targetMeld: Meld }>
): {
  knockerScore: number;
  opponentScore: number;
  knockerDeadwood: number;
  opponentDeadwoodBefore: number;
  opponentDeadwoodAfter: number;
  layOffValue: number;
  isUndercut: boolean;
  isGin: boolean;
} {
  const knockerDeadwood = calculateDeadwood(knockerHand, knockerMelds);
  const opponentDeadwoodBefore = calculateDeadwood(opponentHand, opponentMelds);
  
  // Calculate lay-off value (total points of cards laid off)
  const layOffValue = layOffs.reduce((total, layOff) => 
    total + layOff.cards.reduce((cardTotal, card) => cardTotal + getCardValue(card), 0), 0
  );
  
  const opponentDeadwoodAfter = opponentDeadwoodBefore - layOffValue;
  
  const isGin = knockerDeadwood === 0;
  const isUndercut = opponentDeadwoodAfter <= knockerDeadwood && !isGin;
  
  let knockerScore = 0;
  let opponentScore = 0;
  
  if (isGin) {
    // Gin: Knocker gets opponent deadwood + 25 bonus (lay-offs don't affect gin bonus)
    knockerScore = opponentDeadwoodAfter + 25;
  } else if (isUndercut) {
    // Undercut: Opponent gets deadwood difference + 25 bonus
    opponentScore = (knockerDeadwood - opponentDeadwoodAfter) + 25;
  } else {
    // Normal knock: Knocker gets deadwood difference
    knockerScore = opponentDeadwoodAfter - knockerDeadwood;
  }
  
  return {
    knockerScore,
    opponentScore,
    knockerDeadwood,
    opponentDeadwoodBefore,
    opponentDeadwoodAfter,
    layOffValue,
    isUndercut,
    isGin,
  };
}

/**
 * Calculate ELO rating changes after a game
 */
export function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  kFactor: number = 32
): { winnerChange: number; loserChange: number } {
  const expectedWinnerScore = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoserScore = 1 - expectedWinnerScore;
  
  const winnerChange = Math.round(kFactor * (1 - expectedWinnerScore));
  const loserChange = Math.round(kFactor * (0 - expectedLoserScore));
  
  return { winnerChange, loserChange };
}

/**
 * Check if a game should end (player reaches 100 points)
 */
export function shouldGameEnd(scores: number[]): boolean {
  return scores.some(score => score >= 100);
}

/**
 * Get the winner of a game based on scores
 */
export function getGameWinner(playerScores: { [playerId: string]: number }): string | null {
  const entries = Object.entries(playerScores);
  if (entries.length !== 2) return null;
  
  const [player1, player2] = entries;
  const [id1, score1] = player1;
  const [id2, score2] = player2;
  
  if (score1 >= 100 || score2 >= 100) {
    return score1 > score2 ? id1 : id2;
  }
  
  return null;
}