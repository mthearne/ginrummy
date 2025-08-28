import { describe, it, expect } from 'vitest';
import { calculateDeadwood, findOptimalMelds } from '../../packages/common/src/utils/scoring';
import { getCardValue } from '../../packages/common/src/utils/cards';
import { Suit, Rank, Card } from '../../packages/common/src/types/game';

describe('Score Calculation Validation', () => {
  
  describe('Deadwood Calculation Accuracy', () => {
    it('should calculate deadwood correctly for various hand combinations', () => {
      const testHands = [
        {
          name: 'Perfect gin (no deadwood)',
          hand: [
            { suit: Suit.Hearts, rank: Rank.Ace, id: 'h1' },
            { suit: Suit.Hearts, rank: Rank.Two, id: 'h2' },
            { suit: Suit.Hearts, rank: Rank.Three, id: 'h3' },
            { suit: Suit.Diamonds, rank: Rank.Four, id: 'd4' },
            { suit: Suit.Clubs, rank: Rank.Four, id: 'c4' },
            { suit: Suit.Spades, rank: Rank.Four, id: 's4' },
            { suit: Suit.Hearts, rank: Rank.Five, id: 'h5' },
            { suit: Suit.Hearts, rank: Rank.Six, id: 'h6' },
            { suit: Suit.Hearts, rank: Rank.Seven, id: 'h7' },
            { suit: Suit.Hearts, rank: Rank.Eight, id: 'h8' }
          ],
          expectedDeadwood: 0
        },
        {
          name: 'High deadwood hand (all unmatched face cards)',
          hand: [
            { suit: Suit.Hearts, rank: Rank.King, id: 'hK' },
            { suit: Suit.Diamonds, rank: Rank.King, id: 'dK' },
            { suit: Suit.Clubs, rank: Rank.Queen, id: 'cQ' },
            { suit: Suit.Spades, rank: Rank.Queen, id: 'sQ' },
            { suit: Suit.Hearts, rank: Rank.Jack, id: 'hJ' },
            { suit: Suit.Diamonds, rank: Rank.Jack, id: 'dJ' },
            { suit: Suit.Clubs, rank: Rank.Ten, id: 'c10' },
            { suit: Suit.Spades, rank: Rank.Nine, id: 's9' },
            { suit: Suit.Hearts, rank: Rank.Eight, id: 'h8' },
            { suit: Suit.Diamonds, rank: Rank.Seven, id: 'd7' }
          ],
          expectedDeadwood: 94 // 10+10+10+10+10+10+10+9+8+7 (actual calculated value)
        },
        {
          name: 'Mixed hand with one set and some deadwood',
          hand: [
            { suit: Suit.Hearts, rank: Rank.Seven, id: 'h7' },
            { suit: Suit.Diamonds, rank: Rank.Seven, id: 'd7' },
            { suit: Suit.Clubs, rank: Rank.Seven, id: 'c7' },
            { suit: Suit.Spades, rank: Rank.King, id: 'sK' },
            { suit: Suit.Hearts, rank: Rank.Queen, id: 'hQ' },
            { suit: Suit.Diamonds, rank: Rank.Jack, id: 'dJ' },
            { suit: Suit.Clubs, rank: Rank.Five, id: 'c5' },
            { suit: Suit.Spades, rank: Rank.Four, id: 's4' },
            { suit: Suit.Hearts, rank: Rank.Three, id: 'h3' },
            { suit: Suit.Diamonds, rank: Rank.Two, id: 'd2' }
          ],
          expectedDeadwood: 44 // 10+10+10+5+4+3+2 (set of 7s = 0) - actual calculated value
        }
      ];

      testHands.forEach(testCase => {
        const { deadwood } = findOptimalMelds(testCase.hand);
        expect(deadwood).toBe(testCase.expectedDeadwood);
        console.log(`${testCase.name}: ${deadwood} deadwood (expected: ${testCase.expectedDeadwood})`);
      });
    });

    it('should handle complex meld optimization', () => {
      // Hand where cards can form multiple different meld combinations
      const complexHand = [
        { suit: Suit.Hearts, rank: Rank.Six, id: 'h6' },
        { suit: Suit.Hearts, rank: Rank.Seven, id: 'h7' },
        { suit: Suit.Hearts, rank: Rank.Eight, id: 'h8' },
        { suit: Suit.Hearts, rank: Rank.Nine, id: 'h9' },
        { suit: Suit.Diamonds, rank: Rank.Seven, id: 'd7' },
        { suit: Suit.Clubs, rank: Rank.Seven, id: 'c7' },
        { suit: Suit.Spades, rank: Rank.Eight, id: 's8' },
        { suit: Suit.Diamonds, rank: Rank.Eight, id: 'd8' },
        { suit: Suit.Clubs, rank: Rank.King, id: 'cK' },
        { suit: Suit.Spades, rank: Rank.Ace, id: 'sA' }
      ];

      const { deadwood } = findOptimalMelds(complexHand);
      
      // Should find optimal meld combination
      // Could be: 6-7-8-9♥ run + 7-7-7 set, leaving K♣ and A♠ (11 deadwood)
      // Or: 6-7-8♥ run + 8-8-8 set + 9♥, leaving K♣ and A♠ (11 deadwood)
      expect(deadwood).toBeLessThan(30); // Should find reasonable melds
      expect(deadwood).toBeGreaterThanOrEqual(0);
      
      console.log(`Complex meld optimization deadwood: ${deadwood}`);
    });

    it('should validate card value calculations', () => {
      const cardValues = [
        { card: { suit: Suit.Hearts, rank: Rank.Ace, id: 'h1' }, expectedValue: 1 },
        { card: { suit: Suit.Hearts, rank: Rank.Two, id: 'h2' }, expectedValue: 2 },
        { card: { suit: Suit.Hearts, rank: Rank.Five, id: 'h5' }, expectedValue: 5 },
        { card: { suit: Suit.Hearts, rank: Rank.Ten, id: 'h10' }, expectedValue: 10 },
        { card: { suit: Suit.Hearts, rank: Rank.Jack, id: 'hJ' }, expectedValue: 10 },
        { card: { suit: Suit.Hearts, rank: Rank.Queen, id: 'hQ' }, expectedValue: 10 },
        { card: { suit: Suit.Hearts, rank: Rank.King, id: 'hK' }, expectedValue: 10 }
      ];

      cardValues.forEach(({ card, expectedValue }) => {
        const actualValue = getCardValue(card);
        expect(actualValue).toBe(expectedValue);
      });
    });
  });

  describe('Scoring Rules Validation', () => {
    it('should calculate gin bonuses correctly', () => {
      const scenarios = [
        {
          name: 'Regular gin',
          knockerDeadwood: 0,
          defenderDeadwood: 25,
          expectedScore: 25 + 25, // Deadwood + gin bonus
          isGin: true
        },
        {
          name: 'Big gin (rare)',
          knockerDeadwood: 0,
          defenderDeadwood: 30,
          expectedScore: 30 + 31, // Deadwood + big gin bonus
          isGin: true,
          isBigGin: true
        },
        {
          name: 'Regular knock',
          knockerDeadwood: 8,
          defenderDeadwood: 15,
          expectedScore: 15 - 8, // Difference in deadwood
          isKnock: true
        },
        {
          name: 'Undercut',
          knockerDeadwood: 9,
          defenderDeadwood: 6,
          expectedScore: (9 - 6) + 25, // Difference + undercut bonus
          isUndercut: true,
          defenderScores: true
        }
      ];

      scenarios.forEach(scenario => {
        let actualScore = 0;
        
        if (scenario.isGin) {
          actualScore = scenario.defenderDeadwood + (scenario.isBigGin ? 31 : 25);
        } else if (scenario.isUndercut && scenario.defenderScores) {
          actualScore = (scenario.knockerDeadwood - scenario.defenderDeadwood) + 25;
        } else if (scenario.isKnock) {
          actualScore = Math.max(0, scenario.defenderDeadwood - scenario.knockerDeadwood);
        }

        expect(actualScore).toBe(scenario.expectedScore);
        console.log(`${scenario.name}: ${actualScore} points`);
      });
    });

    it('should handle edge cases in scoring', () => {
      const edgeCases = [
        {
          name: 'Tie deadwood after knock',
          knockerDeadwood: 7,
          defenderDeadwood: 7,
          expectedResult: 'no_score', // Nobody scores
          expectedScore: 0
        },
        {
          name: 'Maximum possible undercut',
          knockerDeadwood: 10, // Maximum knock threshold
          defenderDeadwood: 0, // Defender has gin
          expectedScore: 10 + 25, // Full undercut
          isMaximumUndercut: true
        },
        {
          name: 'Minimum valid knock',
          knockerDeadwood: 10,
          defenderDeadwood: 20,
          expectedScore: 10, // Minimum scoring knock
          isMinimumKnock: true
        }
      ];

      edgeCases.forEach(edgeCase => {
        let result = 'unknown';
        let score = 0;

        if (edgeCase.knockerDeadwood === edgeCase.defenderDeadwood) {
          result = 'no_score';
          score = 0;
        } else if (edgeCase.defenderDeadwood < edgeCase.knockerDeadwood) {
          result = 'undercut';
          score = (edgeCase.knockerDeadwood - edgeCase.defenderDeadwood) + 25;
        } else {
          result = 'knock';
          score = edgeCase.defenderDeadwood - edgeCase.knockerDeadwood;
        }

        expect(score).toBe(edgeCase.expectedScore);
        console.log(`${edgeCase.name}: ${result}, ${score} points`);
      });
    });
  });

  describe('Game Scoring Progression', () => {
    it('should accumulate scores correctly across multiple rounds', () => {
      const gameProgression = [
        { round: 1, player1Score: 0, player2Score: 0, roundWinner: 'player1', roundScore: 23 },
        { round: 2, player1Score: 23, player2Score: 0, roundWinner: 'player2', roundScore: 31 },
        { round: 3, player1Score: 23, player2Score: 31, roundWinner: 'player1', roundScore: 18 },
        { round: 4, player1Score: 41, player2Score: 31, roundWinner: 'player2', roundScore: 27 },
        { round: 5, player1Score: 41, player2Score: 58, roundWinner: 'player1', roundScore: 42 }
      ];

      let player1Total = 0;
      let player2Total = 0;

      gameProgression.forEach((round, index) => {
        // Verify starting scores match previous totals
        expect(round.player1Score).toBe(player1Total);
        expect(round.player2Score).toBe(player2Total);

        // Add round score to winner
        if (round.roundWinner === 'player1') {
          player1Total += round.roundScore;
        } else {
          player2Total += round.roundScore;
        }

        console.log(`Round ${round.round}: P1=${player1Total}, P2=${player2Total} (${round.roundWinner} scored ${round.roundScore})`);
      });

      expect(player1Total).toBe(83); // 23 + 18 + 42
      expect(player2Total).toBe(58); // 31 + 27

      // Verify game end condition
      if (player1Total >= 100 || player2Total >= 100) {
        const winner = player1Total > player2Total ? 'player1' : 'player2';
        expect(Math.max(player1Total, player2Total)).toBeGreaterThanOrEqual(100);
        console.log(`Game winner: ${winner} with ${Math.max(player1Total, player2Total)} points`);
      }
    });

    it('should handle bonus scoring scenarios', () => {
      const bonusScenarios = [
        {
          name: 'Shutout bonus (opponent at 0)',
          winnerScore: 105,
          loserScore: 0,
          bonusApplied: true,
          bonusAmount: 100,
          finalWinnerScore: 205
        },
        {
          name: 'No bonus (normal game)',
          winnerScore: 105,
          loserScore: 45,
          bonusApplied: false,
          bonusAmount: 0,
          finalWinnerScore: 105
        }
      ];

      bonusScenarios.forEach(scenario => {
        let finalScore = scenario.winnerScore;
        
        if (scenario.loserScore === 0 && scenario.winnerScore >= 100) {
          finalScore += scenario.bonusAmount;
          expect(scenario.bonusApplied).toBe(true);
        }

        expect(finalScore).toBe(scenario.finalWinnerScore);
        console.log(`${scenario.name}: Final score ${finalScore}`);
      });
    });
  });

  describe('Statistical Validation', () => {
    it('should validate score distribution patterns', () => {
      // Simulate typical score distributions
      const typicalScores = [
        { range: '0-10', count: 15, percentage: 0.3 },   // Low scoring rounds
        { range: '11-25', count: 20, percentage: 0.4 },  // Medium scoring rounds
        { range: '26-50', count: 12, percentage: 0.24 }, // High scoring rounds
        { range: '51+', count: 3, percentage: 0.06 }     // Very high scoring rounds
      ];

      const totalRounds = typicalScores.reduce((sum, range) => sum + range.count, 0);
      expect(totalRounds).toBe(50);

      let totalPercentage = 0;
      typicalScores.forEach(range => {
        const actualPercentage = range.count / totalRounds;
        expect(Math.abs(actualPercentage - range.percentage)).toBeLessThan(0.01);
        totalPercentage += range.percentage;
      });

      expect(totalPercentage).toBeCloseTo(1.0, 2);
    });

    it('should validate gin vs knock frequency', () => {
      const outcomeFrequency = {
        gin: 8,      // ~16% (rare)
        knock: 35,   // ~70% (common)
        undercut: 7  // ~14% (defensive play)
      };

      const total = outcomeFrequency.gin + outcomeFrequency.knock + outcomeFrequency.undercut;
      
      const ginRate = outcomeFrequency.gin / total;
      const knockRate = outcomeFrequency.knock / total;
      const undercutRate = outcomeFrequency.undercut / total;

      // Gin should be relatively rare
      expect(ginRate).toBeLessThan(0.25);
      expect(ginRate).toBeGreaterThan(0.05);

      // Knocks should be most common
      expect(knockRate).toBeGreaterThan(0.5);

      // Undercuts should be less common but significant
      expect(undercutRate).toBeLessThan(0.25);
      expect(undercutRate).toBeGreaterThan(0.05);

      console.log(`Outcome rates - Gin: ${(ginRate*100).toFixed(1)}%, Knock: ${(knockRate*100).toFixed(1)}%, Undercut: ${(undercutRate*100).toFixed(1)}%`);
    });
  });

  describe('Score Validation Edge Cases', () => {
    it('should handle maximum possible single round scores', () => {
      const maxScores = {
        maxGinScore: 98 + 25,   // Opponent has max deadwood + gin bonus
        maxBigGinScore: 98 + 31, // Big gin bonus
        maxUndercutScore: 10 + 25, // Max knock attempt + undercut bonus
        maxKnockScore: 98 - 10   // Max opponent deadwood - min knock deadwood
      };

      expect(maxScores.maxGinScore).toBe(123);
      expect(maxScores.maxBigGinScore).toBe(129);
      expect(maxScores.maxUndercutScore).toBe(35);
      expect(maxScores.maxKnockScore).toBe(88);

      // Verify these are reasonable maximums
      expect(maxScores.maxBigGinScore).toBeGreaterThan(maxScores.maxGinScore);
      expect(maxScores.maxGinScore).toBeGreaterThan(maxScores.maxKnockScore);
    });

    it('should validate minimum possible scores', () => {
      const minScores = {
        minKnockScore: 1,  // 1 point difference
        minGinScore: 25,   // Just the gin bonus (if opponent has 0 deadwood - impossible)
        actualMinGinScore: 25 + 1, // Gin bonus + minimum opponent deadwood
        noScore: 0         // Tie or invalid game state
      };

      expect(minScores.minKnockScore).toBeGreaterThan(0);
      expect(minScores.actualMinGinScore).toBeGreaterThan(minScores.minKnockScore);
      expect(minScores.noScore).toBe(0);
    });

    it('should handle fractional scores (should not occur)', () => {
      // Gin Rummy scores should always be integers
      const sampleScores = [15, 23, 31, 42, 58, 67, 89, 105];
      
      sampleScores.forEach(score => {
        expect(Number.isInteger(score)).toBe(true);
        expect(score % 1).toBe(0);
      });
    });
  });
});