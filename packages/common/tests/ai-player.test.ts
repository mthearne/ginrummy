import { describe, it, expect, beforeEach } from 'vitest';
import { AIPlayer } from '../src/game-engine/ai-player';
import { GamePhase, MoveType } from '../src/types/game';
import { AI_SCENARIOS, SAMPLE_CARDS, TEST_HANDS } from './fixtures/hands';

describe('AIPlayer', () => {
  let aiPlayer: AIPlayer;

  beforeEach(() => {
    aiPlayer = new AIPlayer('ai-player');
  });

  describe('Basic Move Generation', () => {
    it('should generate draw move in draw phase', () => {
      const move = aiPlayer.getMove(
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        GamePhase.Draw,
        [SAMPLE_CARDS.KC],
        25
      );

      expect(move).toBeDefined();
      expect(move.playerId).toBe('ai-player');
      expect([MoveType.DrawStock, MoveType.DrawDiscard]).toContain(move.type);
    });

    it('should generate discard move in discard phase', () => {
      const hand = [...TEST_HANDS.POTENTIAL_MELDS_HAND, SAMPLE_CARDS.KC]; // 11 cards
      const move = aiPlayer.getMove(
        hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.QH],
        25
      );

      expect(move).toBeDefined();
      expect(move.playerId).toBe('ai-player');
      expect([MoveType.Discard, MoveType.Knock, MoveType.Gin]).toContain(move.type);
      
      if (move.type === MoveType.Discard) {
        expect(move.cardId).toBeDefined();
        expect(hand.some(card => card.id === move.cardId)).toBe(true);
      }
    });

    it('should throw error for invalid phase', () => {
      expect(() => {
        aiPlayer.getMove(
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          GamePhase.UpcardDecision, // Invalid phase for getMove
          [SAMPLE_CARDS.KC],
          25
        );
      }).toThrow();
    });
  });

  describe('Draw Decision Logic', () => {
    it('should take upcard when it significantly improves hand', () => {
      const { hand, upcard, shouldTake } = AI_SCENARIOS.TAKE_UPCARD_SCENARIO;
      const discardPile = [SAMPLE_CARDS.KC, upcard];
      
      const move = aiPlayer.getMove(
        hand,
        GamePhase.Draw,
        discardPile,
        25
      );

      if (shouldTake) {
        expect(move.type).toBe(MoveType.DrawDiscard);
      } else {
        expect(move.type).toBe(MoveType.DrawStock);
      }
    });

    it('should pass upcard when it does not improve hand', () => {
      const { hand, upcard, shouldTake } = AI_SCENARIOS.PASS_UPCARD_SCENARIO;
      const discardPile = [SAMPLE_CARDS.KC, upcard];
      
      const move = aiPlayer.getMove(
        hand,
        GamePhase.Draw,
        discardPile,
        25
      );

      if (!shouldTake) {
        expect(move.type).toBe(MoveType.DrawStock);
      } else {
        expect(move.type).toBe(MoveType.DrawDiscard);
      }
    });

    it('should draw from stock when discard pile is empty', () => {
      const move = aiPlayer.getMove(
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        GamePhase.Draw,
        [], // Empty discard pile
        25
      );

      expect(move.type).toBe(MoveType.DrawStock);
    });
  });

  describe('Discard Decision Logic', () => {
    it('should choose optimal card to discard based on strategy', () => {
      const hand = [
        SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Run (keep)
        SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD, // Set (keep)
        SAMPLE_CARDS.AS, // Low deadwood (1)
        SAMPLE_CARDS.KC, // High deadwood (10)
        SAMPLE_CARDS.QH, // High deadwood (10)
        SAMPLE_CARDS.JD, // High deadwood (10)
        SAMPLE_CARDS.TenS, // High deadwood (10)
      ];

      const move = aiPlayer.getMove(
        hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25
      );

      expect(move.type).toBe(MoveType.Discard);
      expect(move.cardId).toBeDefined();
      
      // Should discard a card from unmelded cards (deadwood)
      const discardedCard = hand.find(card => card.id === move.cardId);
      expect(discardedCard).toBeDefined();
      
      // Should be one of the deadwood cards (not from melds)
      const meldCardIds = [
        SAMPLE_CARDS.ThreeH.id, SAMPLE_CARDS.FourH.id, SAMPLE_CARDS.FiveH.id,
        SAMPLE_CARDS.SevenS.id, SAMPLE_CARDS.SevenC.id, SAMPLE_CARDS.SevenD.id
      ];
      expect(meldCardIds).not.toContain(discardedCard!.id);
    });

    it('should not discard cards that are part of melds', () => {
      const hand = [
        SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Perfect run
        SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD, // Perfect set
        SAMPLE_CARDS.KC, SAMPLE_CARDS.QH, SAMPLE_CARDS.JD, SAMPLE_CARDS.TenS, // Deadwood
        SAMPLE_CARDS.AS, // Extra card to make 11
      ];

      const move = aiPlayer.getMove(
        hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25
      );

      expect(move.type).toBe(MoveType.Discard);
      
      const discardedCard = hand.find(card => card.id === move.cardId);
      expect(discardedCard).toBeDefined();
      
      // Should not discard cards from the run or set
      const meldCardIds = [
        SAMPLE_CARDS.ThreeH.id, SAMPLE_CARDS.FourH.id, SAMPLE_CARDS.FiveH.id,
        SAMPLE_CARDS.SevenS.id, SAMPLE_CARDS.SevenC.id, SAMPLE_CARDS.SevenD.id
      ];
      
      expect(meldCardIds).not.toContain(discardedCard!.id);
    });
  });

  describe('Knock/Gin Decision Logic', () => {
    it('should gin when possible', () => {
      const { hand, shouldGin, discardCard } = AI_SCENARIOS.GIN_SCENARIO;
      
      const move = aiPlayer.getMove(
        hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25
      );

      if (shouldGin) {
        expect(move.type).toBe(MoveType.Gin);
        expect(move.cardId).toBe(discardCard.id);
        expect(move.melds).toBeDefined();
        expect(move.melds!.length).toBeGreaterThan(0);
      }
    });

    it('should knock when deadwood is low enough', () => {
      const { hand, shouldKnock, discardCard } = AI_SCENARIOS.KNOCK_SCENARIO;
      
      const move = aiPlayer.getMove(
        hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25
      );

      if (shouldKnock) {
        expect(move.type).toBe(MoveType.Knock);
        expect(move.cardId).toBe(discardCard.id);
        expect(move.melds).toBeDefined();
        expect(move.melds!.length).toBeGreaterThan(0);
      }
    });

    it('should not knock when deadwood is too high', () => {
      const move = aiPlayer.getMove(
        TEST_HANDS.HIGH_DEADWOOD_HAND,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25
      );

      expect(move.type).toBe(MoveType.Discard);
      expect(move.cardId).toBeDefined();
    });
  });

  describe('Difficulty Levels', () => {
    it('should make optimal moves on hard difficulty', () => {
      const move = aiPlayer.getMoveWithDifficulty(
        AI_SCENARIOS.GIN_SCENARIO.hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.TwoD],
        25,
        'hard'
      );

      // With very low suboptimal move chance, should gin
      expect(move.type).toBe(MoveType.Gin);
    });

    it('should sometimes make suboptimal moves on easy difficulty', () => {
      // Run multiple times to test randomness
      let suboptimalCount = 0;
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const move = aiPlayer.getMoveWithDifficulty(
          AI_SCENARIOS.GIN_SCENARIO.hand,
          GamePhase.Discard,
          [SAMPLE_CARDS.TwoD],
          25,
          'easy'
        );

        if (move.type !== MoveType.Gin) {
          suboptimalCount++;
        }
      }

      // Should make some suboptimal moves (not always gin)
      expect(suboptimalCount).toBeGreaterThan(0);
    });

    it('should validate difficulty adjustment parameters', () => {
      const easyAdjustments = AIPlayer.getDifficultyAdjustments('easy');
      const mediumAdjustments = AIPlayer.getDifficultyAdjustments('medium');
      const hardAdjustments = AIPlayer.getDifficultyAdjustments('hard');

      expect(easyAdjustments.makeSuboptimalMoves).toBeGreaterThan(hardAdjustments.makeSuboptimalMoves);
      expect(mediumAdjustments.makeSuboptimalMoves).toBeLessThan(easyAdjustments.makeSuboptimalMoves);
      expect(mediumAdjustments.makeSuboptimalMoves).toBeGreaterThan(hardAdjustments.makeSuboptimalMoves);

      expect(easyAdjustments.knockThreshold).toBeLessThan(hardAdjustments.knockThreshold);
    });
  });

  describe('Thought Process', () => {
    it('should provide thoughts for draw phase', () => {
      const thoughts = aiPlayer.getThoughts(
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        GamePhase.Draw,
        [SAMPLE_CARDS.KC],
        25
      );

      expect(thoughts).toBeDefined();
      expect(thoughts.length).toBeGreaterThan(0);
      expect(thoughts.some(thought => thought.includes('Looking at'))).toBe(true);
    });

    it('should provide thoughts for discard phase', () => {
      const thoughts = aiPlayer.getThoughts(
        [...TEST_HANDS.POTENTIAL_MELDS_HAND, SAMPLE_CARDS.KC],
        GamePhase.Discard,
        [SAMPLE_CARDS.QH],
        25
      );

      expect(thoughts).toBeDefined();
      expect(thoughts.length).toBeGreaterThan(0);
      expect(thoughts.some(thought => thought.includes('discard'))).toBe(true);
    });

    it('should not reveal strategy in thoughts', () => {
      const thoughts = aiPlayer.getThoughts(
        AI_SCENARIOS.GIN_SCENARIO.hand,
        GamePhase.Discard,
        [SAMPLE_CARDS.QH],
        25
      );

      expect(thoughts).toBeDefined();
      
      // Should not reveal specific strategy details
      const thoughtText = thoughts.join(' ').toLowerCase();
      expect(thoughtText).not.toContain('gin');
      expect(thoughtText).not.toContain('knock');
      expect(thoughtText).not.toContain('deadwood');
      expect(thoughtText).not.toContain('optimal');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty hand gracefully', () => {
      // Empty hand should not be possible in actual gameplay, 
      // but AI should handle it without crashing
      const move = aiPlayer.getMove(
        [], // Empty hand
        GamePhase.Draw, // Use Draw phase since Discard requires cards
        [SAMPLE_CARDS.KC],
        25
      );
      
      expect(move).toBeDefined();
      expect(move.type).toBe(MoveType.DrawStock); // Should default to safe move
    });

    it('should handle single card hand', () => {
      const move = aiPlayer.getMove(
        [SAMPLE_CARDS.KC],
        GamePhase.Discard,
        [SAMPLE_CARDS.QH],
        25
      );

      // With single card, AI might try different strategies
      expect([MoveType.Discard, MoveType.Gin]).toContain(move.type);
      
      if (move.type === MoveType.Discard) {
        expect(move.cardId).toBe(SAMPLE_CARDS.KC.id);
      }
    });

    it('should handle low stock count appropriately', () => {
      const move = aiPlayer.getMove(
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        GamePhase.Draw,
        [SAMPLE_CARDS.KC],
        2 // Very low stock
      );

      expect(move).toBeDefined();
      // Should still make a valid move even with low stock
    });
  });
});