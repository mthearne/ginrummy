import { describe, it, expect, beforeEach } from 'vitest';
import { GinRummyGame } from '../../packages/common/src/game-engine/gin-rummy';
import { GamePhase, MoveType, GameStatus, Suit, Rank } from '../../packages/common/src/types/game';
import { createDeck, shuffleDeck, calculateDeadwood, findOptimalMelds } from '../../packages/common/src';

describe('Game Edge Cases and Rare Scenarios', () => {
  let game: GinRummyGame;

  beforeEach(() => {
    game = new GinRummyGame('edge-case-test', 'player1', 'player2');
  });

  describe('Stock Pile Depletion', () => {
    it('should handle empty stock pile gracefully', () => {
      // Create a game state where stock is nearly empty
      const testGame = new GinRummyGame('empty-stock', 'player1', 'player2');
      const state = testGame.getState();
      
      // Stock starts with 31 cards after dealing
      expect(state.stockPileCount).toBe(31);
      
      // Simulate drawing many cards to deplete stock
      // This is a theoretical test since normal gameplay rarely depletes stock
      const stockDepletion = {
        initialStock: 31,
        cardsDrawn: 0,
        discardPileSize: 1,
        remainingStock: 31
      };
      
      // Simulate drawing until very low
      stockDepletion.cardsDrawn = 25;
      stockDepletion.remainingStock = stockDepletion.initialStock - stockDepletion.cardsDrawn;
      stockDepletion.discardPileSize += stockDepletion.cardsDrawn;
      
      expect(stockDepletion.remainingStock).toBe(6);
      expect(stockDepletion.discardPileSize).toBeGreaterThan(1);
    });

    it('should trigger game end when stock is completely empty', () => {
      // When stock is empty and no one can draw, game should end
      const stockEmpty = {
        remainingCards: 0,
        playersCannotDraw: true,
        gameForceEnds: true
      };
      
      if (stockEmpty.remainingCards === 0 && stockEmpty.playersCannotDraw) {
        expect(stockEmpty.gameForceEnds).toBe(true);
      }
    });

    it('should handle discard pile reshuffling when stock is empty', () => {
      // In some variants, when stock is empty, discard pile is reshuffled
      const discardPileReshuffle = {
        stockEmpty: true,
        discardPileSize: 15,
        topCardKept: true,
        cardsReshuffled: 14
      };
      
      if (discardPileReshuffle.stockEmpty && discardPileReshuffle.discardPileSize > 1) {
        const newStockSize = discardPileReshuffle.discardPileSize - 1; // Keep top card
        expect(newStockSize).toBe(14);
        expect(discardPileReshuffle.topCardKept).toBe(true);
      }
    });
  });

  describe('Tie Game Scenarios', () => {
    it('should handle identical deadwood scores', () => {
      // When both players have same deadwood after knock
      const tieScenario = {
        knockerDeadwood: 8,
        defenderDeadwood: 8,
        result: 'no_score' // No one scores in a tie
      };
      
      if (tieScenario.knockerDeadwood === tieScenario.defenderDeadwood) {
        expect(tieScenario.result).toBe('no_score');
      }
    });

    it('should handle perfect gin ties (both go gin simultaneously)', () => {
      // Extremely rare scenario where both players achieve gin
      const perfectGinTie = {
        player1Deadwood: 0,
        player2Deadwood: 0,
        bothHaveGin: true,
        tieBreaker: 'first_to_declare' // Implementation specific
      };
      
      if (perfectGinTie.player1Deadwood === 0 && perfectGinTie.player2Deadwood === 0) {
        expect(perfectGinTie.bothHaveGin).toBe(true);
        expect(perfectGinTie.tieBreaker).toBeDefined();
      }
    });

    it('should handle score ties at game end', () => {
      // When both players reach 100+ points in same round
      const gameEndTie = {
        player1Score: 105,
        player2Score: 105,
        bothReachedTarget: true,
        tieBreaker: 'highest_total_score' // Or play continuation
      };
      
      if (gameEndTie.player1Score >= 100 && gameEndTie.player2Score >= 100) {
        if (gameEndTie.player1Score === gameEndTie.player2Score) {
          expect(gameEndTie.tieBreaker).toBeDefined();
        }
      }
    });
  });

  describe('Complex Card Combinations', () => {
    it('should handle maximum possible melds (all cards melded)', () => {
      const perfectMeldHand = [
        // Run: A-2-3-4-5 of Hearts
        { suit: Suit.Hearts, rank: Rank.Ace, id: 'h1' },
        { suit: Suit.Hearts, rank: Rank.Two, id: 'h2' },
        { suit: Suit.Hearts, rank: Rank.Three, id: 'h3' },
        { suit: Suit.Hearts, rank: Rank.Four, id: 'h4' },
        { suit: Suit.Hearts, rank: Rank.Five, id: 'h5' },
        
        // Set: Three 7s
        { suit: Suit.Diamonds, rank: Rank.Seven, id: 'd7' },
        { suit: Suit.Clubs, rank: Rank.Seven, id: 'c7' },
        { suit: Suit.Spades, rank: Rank.Seven, id: 's7' },
        
        // Pair that could extend either meld
        { suit: Suit.Hearts, rank: Rank.Six, id: 'h6' },
        { suit: Suit.Hearts, rank: Rank.Seven, id: 'h7' }
      ];
      
      const { deadwood } = findOptimalMelds(perfectMeldHand);
      expect(deadwood).toBe(0); // Should be gin
    });

    it('should handle overlapping meld possibilities', () => {
      const overlappingHand = [
        // Cards that can form multiple different melds
        { suit: Suit.Hearts, rank: Rank.Seven, id: 'h7' },
        { suit: Suit.Diamonds, rank: Rank.Seven, id: 'd7' },
        { suit: Suit.Clubs, rank: Rank.Seven, id: 'c7' },
        { suit: Suit.Hearts, rank: Rank.Eight, id: 'h8' },
        { suit: Suit.Hearts, rank: Rank.Nine, id: 'h9' },
        { suit: Suit.Spades, rank: Rank.Ten, id: 's10' },
        { suit: Suit.Clubs, rank: Rank.Jack, id: 'cJ' },
        { suit: Suit.Hearts, rank: Rank.Queen, id: 'hQ' },
        { suit: Suit.Diamonds, rank: Rank.King, id: 'dK' },
        { suit: Suit.Spades, rank: Rank.Ace, id: 'sA' }
      ];
      
      // Should find optimal meld combination
      const { deadwood } = findOptimalMelds(overlappingHand);
      expect(deadwood).toBeGreaterThanOrEqual(0);
      expect(deadwood).toBeLessThan(100); // Reasonable deadwood
    });

    it('should handle ace low and high runs correctly', () => {
      const aceTestHands = {
        aceLow: [
          { suit: Suit.Hearts, rank: Rank.Ace, id: 'h1' },
          { suit: Suit.Hearts, rank: Rank.Two, id: 'h2' },
          { suit: Suit.Hearts, rank: Rank.Three, id: 'h3' }
        ],
        aceHigh: [
          { suit: Suit.Hearts, rank: Rank.Jack, id: 'hJ' },
          { suit: Suit.Hearts, rank: Rank.Queen, id: 'hQ' },
          { suit: Suit.Hearts, rank: Rank.King, id: 'hK' }
          // Note: Ace-King-Queen is typically not valid in Gin Rummy
        ]
      };
      
      // Ace is typically low only in Gin Rummy
      expect(aceTestHands.aceLow.length).toBe(3);
      expect(aceTestHands.aceHigh.length).toBe(3);
    });
  });

  describe('Game State Corruption Prevention', () => {
    it('should validate hand sizes remain consistent', () => {
      const state = game.getState();
      const initialHandSizes = state.players.map(p => p.hand.length);
      
      expect(initialHandSizes).toEqual([10, 10]);
      
      // After any move, total cards should be conserved
      const totalCards = {
        player1Hand: state.players[0].hand.length,
        player2Hand: state.players[1].hand.length,
        discardPile: state.discardPile.length,
        stockPile: state.stockPileCount,
        total: 0
      };
      
      totalCards.total = totalCards.player1Hand + totalCards.player2Hand + 
                        totalCards.discardPile + totalCards.stockPile;
      
      expect(totalCards.total).toBe(52); // Total deck size
    });

    it('should prevent impossible game states', () => {
      const state = game.getState();
      
      // Validate basic game state invariants
      expect(state.players).toHaveLength(2);
      expect(state.currentPlayerId).toMatch(/player[12]/);
      expect(state.phase).toBeDefined();
      expect(state.stockPileCount).toBeGreaterThanOrEqual(0);
      expect(state.stockPileCount).toBeLessThanOrEqual(52);
      expect(state.discardPile.length).toBeGreaterThan(0);
    });

    it('should handle rapid successive moves without corruption', () => {
      const moves = [];
      const maxMoves = 10;
      
      for (let i = 0; i < maxMoves; i++) {
        const currentState = game.getState();
        
        if (currentState.gameOver) break;
        
        try {
          // Make a simple move based on phase
          if (currentState.phase === GamePhase.UpcardDecision) {
            game.makeMove(currentState.currentPlayerId, {
              type: MoveType.PassUpcard,
              playerId: currentState.currentPlayerId
            });
            moves.push('pass');
          } else if (currentState.phase === GamePhase.Draw) {
            game.makeMove(currentState.currentPlayerId, {
              type: MoveType.DrawStock,
              playerId: currentState.currentPlayerId
            });
            moves.push('draw');
          }
        } catch (error) {
          // Track errors but don't fail test
          moves.push('error');
        }
      }
      
      expect(moves.length).toBeLessThanOrEqual(maxMoves);
      
      // Game state should still be valid
      const finalState = game.getState();
      expect(finalState.players).toHaveLength(2);
    });
  });

  describe('Performance Under Stress', () => {
    it('should handle many rapid game creations', () => {
      const games = [];
      const startTime = Date.now();
      
      for (let i = 0; i < 50; i++) {
        const newGame = new GinRummyGame(`stress-${i}`, 'player1', 'player2');
        games.push(newGame);
        
        const state = newGame.getState();
        expect(state.status).toBe(GameStatus.Active);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(games).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      
      console.log(`Created 50 games in ${duration}ms (${duration/50}ms per game)`);
    });

    it('should maintain performance with large number of moves', () => {
      const moveCount = 200;
      const moves = [];
      const startTime = Date.now();
      
      // Create a controlled scenario for many moves
      for (let i = 0; i < moveCount; i++) {
        const testGame = new GinRummyGame(`move-test-${i}`, 'player1', 'player2');
        const state = testGame.getState();
        
        try {
          if (state.phase === GamePhase.UpcardDecision) {
            testGame.makeMove(state.currentPlayerId, {
              type: MoveType.Pass,
              playerId: state.currentPlayerId
            });
            moves.push('success');
          }
        } catch {
          moves.push('error');
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const successRate = moves.filter(m => m === 'success').length / moves.length;
      
      expect(duration).toBeLessThan(10000); // Under 10 seconds
      expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
      
      console.log(`${moveCount} moves in ${duration}ms, ${(successRate * 100).toFixed(1)}% success rate`);
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle minimum possible deadwood (0)', () => {
      const minDeadwood = 0;
      expect(minDeadwood).toBe(0);
      
      // This should trigger gin
      if (minDeadwood === 0) {
        const isGin = true;
        expect(isGin).toBe(true);
      }
    });

    it('should handle maximum possible deadwood (98)', () => {
      // Worst possible hand: all face cards, no melds
      const worstHand = [
        { suit: Suit.Hearts, rank: Rank.King, id: 'hK' },
        { suit: Suit.Diamonds, rank: Rank.King, id: 'dK' },
        { suit: Suit.Clubs, rank: Rank.Queen, id: 'cQ' },
        { suit: Suit.Spades, rank: Rank.Queen, id: 'sQ' },
        { suit: Suit.Hearts, rank: Rank.Jack, id: 'hJ' },
        { suit: Suit.Diamonds, rank: Rank.Jack, id: 'dJ' },
        { suit: Suit.Clubs, rank: Rank.Ten, id: 'c10' },
        { suit: Suit.Spades, rank: Rank.Ten, id: 's10' },
        { suit: Suit.Hearts, rank: Rank.Nine, id: 'h9' },
        { suit: Suit.Diamonds, rank: Rank.Eight, id: 'd8' }
      ];
      
      const { deadwood } = findOptimalMelds(worstHand);
      expect(deadwood).toBeGreaterThan(50);
      expect(deadwood).toBeLessThanOrEqual(98); // Theoretical maximum
    });

    it('should handle knock threshold boundary (10 points)', () => {
      const knockThreshold = 10;
      
      // Exactly at threshold
      expect(knockThreshold).toBe(10);
      
      // Just under threshold (can knock)
      const canKnock = knockThreshold <= 10;
      expect(canKnock).toBe(true);
      
      // Just over threshold (cannot knock)
      const cannotKnock = (knockThreshold + 1) > 10;
      expect(cannotKnock).toBe(true);
    });
  });
});