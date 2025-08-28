import { describe, it, expect } from 'vitest';
import { isValidMove } from '../src/utils/validation';
import { GamePhase, MoveType } from '../src/types/game';
import { SAMPLE_CARDS, TEST_HANDS } from './fixtures/hands';

describe('Move Validation', () => {
  describe('Turn Validation', () => {
    it('should allow moves from current player', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: 'player1',
        },
        GamePhase.UpcardDecision,
        'player1', // Current player
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        false
      );

      expect(result.valid).toBe(true);
    });

    it('should reject moves from non-current player', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: 'player2',
        },
        GamePhase.UpcardDecision,
        'player1', // Current player is player1, not player2
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        false
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });
  });

  describe('Phase-specific Move Validation', () => {
    describe('Upcard Decision Phase', () => {
      it('should allow TakeUpcard when upcard is available', () => {
        const result = isValidMove(
          {
            type: MoveType.TakeUpcard,
            playerId: 'player1',
          },
          GamePhase.UpcardDecision,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC], // Upcard available
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should reject TakeUpcard when no upcard available', () => {
        const result = isValidMove(
          {
            type: MoveType.TakeUpcard,
            playerId: 'player1',
          },
          GamePhase.UpcardDecision,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [], // No upcard
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('No upcard available');
      });

      it('should allow PassUpcard', () => {
        const result = isValidMove(
          {
            type: MoveType.PassUpcard,
            playerId: 'player1',
          },
          GamePhase.UpcardDecision,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should reject invalid moves in upcard decision phase', () => {
        const result = isValidMove(
          {
            type: MoveType.DrawStock,
            playerId: 'player1',
          },
          GamePhase.UpcardDecision,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only draw during draw phase');
      });
    });

    describe('Draw Phase', () => {
      it('should allow DrawStock', () => {
        const result = isValidMove(
          {
            type: MoveType.DrawStock,
            playerId: 'player1',
          },
          GamePhase.Draw,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should allow DrawDiscard when discard pile has cards', () => {
        const result = isValidMove(
          {
            type: MoveType.DrawDiscard,
            playerId: 'player1',
          },
          GamePhase.Draw,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC], // Cards in discard pile
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should reject DrawDiscard when discard pile is empty', () => {
        const result = isValidMove(
          {
            type: MoveType.DrawDiscard,
            playerId: 'player1',
          },
          GamePhase.Draw,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [], // Empty discard pile
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Discard pile is empty');
      });

      it('should reject invalid moves in draw phase', () => {
        const result = isValidMove(
          {
            type: MoveType.Discard,
            playerId: 'player1',
            cardId: SAMPLE_CARDS.KC.id,
          },
          GamePhase.Draw,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.QH],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only discard during discard phase');
      });
    });

    describe('Discard Phase', () => {
      it('should allow Discard with valid card', () => {
        const hand = TEST_HANDS.POTENTIAL_MELDS_HAND;
        const cardToDiscard = hand[0];

        const result = isValidMove(
          {
            type: MoveType.Discard,
            playerId: 'player1',
            cardId: cardToDiscard.id,
          },
          GamePhase.Discard,
          'player1',
          hand,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should reject Discard with card not in hand', () => {
        const result = isValidMove(
          {
            type: MoveType.Discard,
            playerId: 'player1',
            cardId: SAMPLE_CARDS.KC.id, // Not in test hand
          },
          GamePhase.Discard,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.QH],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Card not in hand');
      });

      it('should reject Discard without cardId', () => {
        const result = isValidMove(
          {
            type: MoveType.Discard,
            playerId: 'player1',
            // Missing cardId
          },
          GamePhase.Discard,
          'player1',
          TEST_HANDS.POTENTIAL_MELDS_HAND,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Card ID required for discard');
      });

      it('should allow Knock with valid melds and low deadwood', () => {
        const hand = TEST_HANDS.KNOCK_HAND;
        const cardToDiscard = hand[hand.length - 1]; // Last card

        const result = isValidMove(
          {
            type: MoveType.Knock,
            playerId: 'player1',
            cardId: cardToDiscard.id,
            melds: [
              {
                type: 'run',
                cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH],
              },
              {
                type: 'set',
                cards: [SAMPLE_CARDS.NineS, SAMPLE_CARDS.NineC, SAMPLE_CARDS.NineD],
              },
            ],
          },
          GamePhase.Discard,
          'player1',
          hand,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should allow Gin with valid melds and zero deadwood', () => {
        const hand = TEST_HANDS.GIN_HAND;
        const cardToDiscard = SAMPLE_CARDS.KC; // Extra card to discard

        const result = isValidMove(
          {
            type: MoveType.Gin,
            playerId: 'player1',
            cardId: cardToDiscard.id,
            melds: [
              {
                type: 'run',
                cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH],
              },
              {
                type: 'set',
                cards: [SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD],
              },
              {
                type: 'set',
                cards: [SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, SAMPLE_CARDS.JC],
              },
            ],
          },
          GamePhase.Discard,
          'player1',
          [...hand, cardToDiscard],
          [SAMPLE_CARDS.QH],
          false
        );

        expect(result.valid).toBe(true);
      });

      it('should reject Knock without melds', () => {
        const hand = TEST_HANDS.KNOCK_HAND;
        const cardToDiscard = hand[0];

        const result = isValidMove(
          {
            type: MoveType.Knock,
            playerId: 'player1',
            cardId: cardToDiscard.id,
            // Missing melds
          },
          GamePhase.Discard,
          'player1',
          hand,
          [SAMPLE_CARDS.KC],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Melds and discard card required for knock');
      });

      it('should reject Gin without melds', () => {
        const hand = TEST_HANDS.GIN_HAND;
        const cardToDiscard = SAMPLE_CARDS.KC;

        const result = isValidMove(
          {
            type: MoveType.Gin,
            playerId: 'player1',
            cardId: cardToDiscard.id,
            // Missing melds
          },
          GamePhase.Discard,
          'player1',
          [...hand, cardToDiscard],
          [SAMPLE_CARDS.QH],
          false
        );

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Melds and discard card required for gin');
      });
    });
  });

  describe('AI Game Validation', () => {
    it('should allow human moves in AI games', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: 'human-player',
        },
        GamePhase.UpcardDecision,
        'human-player',
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        true // AI game
      );

      expect(result.valid).toBe(true);
    });

    it('should handle AI player moves', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: 'ai-player',
        },
        GamePhase.UpcardDecision,
        'ai-player',
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        true // AI game
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('Card Ownership Validation', () => {
    it('should validate card exists in player hand for discard', () => {
      const hand = TEST_HANDS.POTENTIAL_MELDS_HAND;
      const validCard = hand[0];
      const invalidCard = SAMPLE_CARDS.KC; // Not in hand

      const validResult = isValidMove(
        {
          type: MoveType.Discard,
          playerId: 'player1',
          cardId: validCard.id,
        },
        GamePhase.Discard,
        'player1',
        hand,
        [SAMPLE_CARDS.QH],
        false
      );

      const invalidResult = isValidMove(
        {
          type: MoveType.Discard,
          playerId: 'player1',
          cardId: invalidCard.id,
        },
        GamePhase.Discard,
        'player1',
        hand,
        [SAMPLE_CARDS.QH],
        false
      );

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Card not in hand');
    });

    it('should validate meld cards exist in player hand', () => {
      const hand = TEST_HANDS.KNOCK_HAND;
      
      // Test with melds that should allow knocking (low deadwood)
      const validMelds = [
        {
          type: 'run' as const,
          cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH], // Run from hand
        },
        {
          type: 'set' as const,
          cards: [SAMPLE_CARDS.NineS, SAMPLE_CARDS.NineC, SAMPLE_CARDS.NineD], // Set from hand
        },
      ];
      
      const invalidMelds = [
        {
          type: 'set' as const,
          cards: [SAMPLE_CARDS.KC, SAMPLE_CARDS.QC, SAMPLE_CARDS.JC], // Not in hand
        },
      ];

      const validResult = isValidMove(
        {
          type: MoveType.Knock,
          playerId: 'player1',
          cardId: SAMPLE_CARDS.FourD.id, // High value card to discard
          melds: validMelds,
        },
        GamePhase.Discard,
        'player1',
        hand,
        [SAMPLE_CARDS.QH],
        false
      );

      const invalidResult = isValidMove(
        {
          type: MoveType.Knock,
          playerId: 'player1',
          cardId: SAMPLE_CARDS.AS.id, // Any card to discard
          melds: invalidMelds,
        },
        GamePhase.Discard,
        'player1',
        hand,
        [SAMPLE_CARDS.QH],
        false
      );

      // The valid result should work because we're using cards from hand and should have low deadwood
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Meld contains card not in hand');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined parameters gracefully', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: 'player1',
        },
        GamePhase.UpcardDecision,
        'player1',
        [], // Empty hand
        [], // Empty discard pile
        false
      );

      expect(result.valid).toBe(true); // PassUpcard should still work
    });

    it('should handle invalid move types', () => {
      const result = isValidMove(
        {
          type: 'invalid-move' as any,
          playerId: 'player1',
        },
        GamePhase.Draw,
        'player1',
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        false
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid move type');
    });

    it('should handle invalid game phases', () => {
      const result = isValidMove(
        {
          type: MoveType.DrawStock,
          playerId: 'player1',
        },
        'invalid-phase' as any,
        'player1',
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        false
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Can only draw during draw phase');
    });

    it('should reject moves with empty player ID', () => {
      const result = isValidMove(
        {
          type: MoveType.PassUpcard,
          playerId: '',
        },
        GamePhase.UpcardDecision,
        'player1',
        TEST_HANDS.POTENTIAL_MELDS_HAND,
        [SAMPLE_CARDS.KC],
        false
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });
  });
});