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
 * Find all possible meld combinations for a hand
 */
export function findAllMeldCombinations(hand: Card[]): Array<{ melds: Meld[]; deadwood: number }> {
  const combinations: Array<{ melds: Meld[]; deadwood: number }> = [];
  const cardGroups = findCardGroups(hand);
  
  console.log(`🔍 findAllMeldCombinations: Found ${cardGroups.length} card groups:`, 
    cardGroups.map(group => group.map(c => `${c.rank}${c.suit}`).join(',')));
  console.log('🔍 findAllMeldCombinations: Full hand for debugging:', 
    hand.map(c => `${c.rank}${c.suit}`).join(', '));
  
  // Generate all possible combinations of groups
  function generateCombinations(groups: Card[][], currentMelds: Meld[], remainingCards: Card[]): void {
    if (groups.length === 0) {
      // Calculate deadwood for this combination
      const deadwood = calculateDeadwood(hand, currentMelds);
      combinations.push({ melds: [...currentMelds], deadwood });
      return;
    }
    
    const [firstGroup, ...restGroups] = groups;
    
    // Option 1: Don't use this group
    generateCombinations(restGroups, currentMelds, remainingCards);
    
    // Option 2: Use this group if it doesn't conflict with existing melds
    const groupCards = new Set(firstGroup.map(c => c.id));
    const hasConflict = currentMelds.some(meld => 
      meld.cards.some(card => groupCards.has(card.id))
    );
    
    if (!hasConflict && firstGroup.length >= 3) {
      const isSet = firstGroup.every(card => card.rank === firstGroup[0].rank);
      const newMeld: Meld = {
        type: isSet ? 'set' : 'run',
        cards: firstGroup,
      };
      
      const newRemainingCards = remainingCards.filter(c => !groupCards.has(c.id));
      generateCombinations(restGroups, [...currentMelds, newMeld], newRemainingCards);
    }
  }
  
  generateCombinations(cardGroups, [], hand);
  
  // Sort by deadwood (best first)
  return combinations.sort((a, b) => a.deadwood - b.deadwood);
}

/**
 * Find which melds a specific card can belong to
 */
export function findCardMeldOptions(card: Card, hand: Card[]): Array<{ meld: Meld; alternativeIndex: number }> {
  const allCombinations = findAllMeldCombinations(hand);
  const cardOptions: Array<{ meld: Meld; alternativeIndex: number }> = [];
  
  console.log(`🔍 findCardMeldOptions: Checking card ${card.rank}${card.suit} across ${allCombinations.length} combinations`);
  
  allCombinations.forEach((combination, index) => {
    combination.melds.forEach(meld => {
      if (meld.cards.some(c => c.id === card.id)) {
        console.log(`🔍 findCardMeldOptions: Found ${card.rank}${card.suit} in ${meld.type}: ${meld.cards.map(c => `${c.rank}${c.suit}`).join(',')}`);
        cardOptions.push({ meld, alternativeIndex: index });
      }
    });
  });
  
  console.log(`🔍 findCardMeldOptions: Before deduplication, ${card.rank}${card.suit} has ${cardOptions.length} options`);
  
  // Remove duplicates (same meld structure)
  const uniqueOptions = cardOptions.filter((option, index, array) => {
    return array.findIndex(other => 
      other.meld.type === option.meld.type &&
      other.meld.cards.length === option.meld.cards.length &&
      other.meld.cards.every(c => option.meld.cards.some(oc => oc.id === c.id))
    ) === index;
  });
  
  console.log(`🔍 findCardMeldOptions: After deduplication, ${card.rank}${card.suit} has ${uniqueOptions.length} options`);
  
  return uniqueOptions;
}

/**
 * Switch a card to a different meld assignment
 */
export function switchCardMeld(hand: Card[], currentMelds: Meld[], cardId: string, targetMeldOption: { meld: Meld; alternativeIndex: number }): { melds: Meld[]; deadwood: number } {
  const allCombinations = findAllMeldCombinations(hand);
  const targetCombination = allCombinations[targetMeldOption.alternativeIndex];
  
  if (targetCombination) {
    return targetCombination;
  }
  
  // Fallback to current melds if switch fails
  return { melds: currentMelds, deadwood: calculateDeadwood(hand, currentMelds) };
}

/**
 * Find the optimal melds in a hand to minimize deadwood
 */
export function findOptimalMelds(hand: Card[]): { melds: Meld[]; deadwood: number } {
  const combinations = findAllMeldCombinations(hand);
  return combinations[0] || { melds: [], deadwood: calculateDeadwood(hand, []) };
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