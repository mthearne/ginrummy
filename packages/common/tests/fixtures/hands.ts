import { Card, Suit, Rank, Meld } from '../../src/types/game';

/**
 * Test fixtures for various card hands and scenarios
 */

// Helper to create cards with IDs
function createCard(suit: Suit, rank: Rank, id?: string): Card {
  return {
    suit,
    rank,
    id: id || `${suit}-${rank}`,
  };
}

// Basic card collections
export const SAMPLE_CARDS = {
  // Hearts
  AH: createCard(Suit.Hearts, Rank.Ace, 'ah'),
  TwoH: createCard(Suit.Hearts, Rank.Two, '2h'),
  ThreeH: createCard(Suit.Hearts, Rank.Three, '3h'),
  FourH: createCard(Suit.Hearts, Rank.Four, '4h'),
  FiveH: createCard(Suit.Hearts, Rank.Five, '5h'),
  SixH: createCard(Suit.Hearts, Rank.Six, '6h'),
  SevenH: createCard(Suit.Hearts, Rank.Seven, '7h'),
  EightH: createCard(Suit.Hearts, Rank.Eight, '8h'),
  NineH: createCard(Suit.Hearts, Rank.Nine, '9h'),
  TenH: createCard(Suit.Hearts, Rank.Ten, '10h'),
  JH: createCard(Suit.Hearts, Rank.Jack, 'jh'),
  QH: createCard(Suit.Hearts, Rank.Queen, 'qh'),
  KH: createCard(Suit.Hearts, Rank.King, 'kh'),

  // Spades
  AS: createCard(Suit.Spades, Rank.Ace, 'as'),
  TwoS: createCard(Suit.Spades, Rank.Two, '2s'),
  ThreeS: createCard(Suit.Spades, Rank.Three, '3s'),
  FourS: createCard(Suit.Spades, Rank.Four, '4s'),
  FiveS: createCard(Suit.Spades, Rank.Five, '5s'),
  SixS: createCard(Suit.Spades, Rank.Six, '6s'),
  SevenS: createCard(Suit.Spades, Rank.Seven, '7s'),
  EightS: createCard(Suit.Spades, Rank.Eight, '8s'),
  NineS: createCard(Suit.Spades, Rank.Nine, '9s'),
  TenS: createCard(Suit.Spades, Rank.Ten, '10s'),
  JS: createCard(Suit.Spades, Rank.Jack, 'js'),
  QS: createCard(Suit.Spades, Rank.Queen, 'qs'),
  KS: createCard(Suit.Spades, Rank.King, 'ks'),

  // Diamonds
  AD: createCard(Suit.Diamonds, Rank.Ace, 'ad'),
  TwoD: createCard(Suit.Diamonds, Rank.Two, '2d'),
  ThreeD: createCard(Suit.Diamonds, Rank.Three, '3d'),
  FourD: createCard(Suit.Diamonds, Rank.Four, '4d'),
  FiveD: createCard(Suit.Diamonds, Rank.Five, '5d'),
  SixD: createCard(Suit.Diamonds, Rank.Six, '6d'),
  SevenD: createCard(Suit.Diamonds, Rank.Seven, '7d'),
  EightD: createCard(Suit.Diamonds, Rank.Eight, '8d'),
  NineD: createCard(Suit.Diamonds, Rank.Nine, '9d'),
  TenD: createCard(Suit.Diamonds, Rank.Ten, '10d'),
  JD: createCard(Suit.Diamonds, Rank.Jack, 'jd'),
  QD: createCard(Suit.Diamonds, Rank.Queen, 'qd'),
  KD: createCard(Suit.Diamonds, Rank.King, 'kd'),

  // Clubs
  AC: createCard(Suit.Clubs, Rank.Ace, 'ac'),
  TwoC: createCard(Suit.Clubs, Rank.Two, '2c'),
  ThreeC: createCard(Suit.Clubs, Rank.Three, '3c'),
  FourC: createCard(Suit.Clubs, Rank.Four, '4c'),
  FiveC: createCard(Suit.Clubs, Rank.Five, '5c'),
  SixC: createCard(Suit.Clubs, Rank.Six, '6c'),
  SevenC: createCard(Suit.Clubs, Rank.Seven, '7c'),
  EightC: createCard(Suit.Clubs, Rank.Eight, '8c'),
  NineC: createCard(Suit.Clubs, Rank.Nine, '9c'),
  TenC: createCard(Suit.Clubs, Rank.Ten, '10c'),
  JC: createCard(Suit.Clubs, Rank.Jack, 'jc'),
  QC: createCard(Suit.Clubs, Rank.Queen, 'qc'),
  KC: createCard(Suit.Clubs, Rank.King, 'kc'),
};

// Common hand scenarios
export const TEST_HANDS = {
  // Perfect gin hand (all melded, 0 deadwood)
  GIN_HAND: [
    SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Run
    SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD, // Set
    SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, SAMPLE_CARDS.JC, // 4-card set
  ],

  // Good knocking hand (low deadwood)
  KNOCK_HAND: [
    SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Run (0 deadwood)
    SAMPLE_CARDS.NineS, SAMPLE_CARDS.NineC, SAMPLE_CARDS.NineD, // Set (0 deadwood)
    SAMPLE_CARDS.AS, // 1 deadwood
    SAMPLE_CARDS.TwoD, // 2 deadwood
    SAMPLE_CARDS.ThreeS, // 3 deadwood
    SAMPLE_CARDS.FourD, // 4 deadwood = 10 total
  ],

  // High deadwood hand (can't knock)
  HIGH_DEADWOOD_HAND: [
    SAMPLE_CARDS.KH, SAMPLE_CARDS.QS, SAMPLE_CARDS.JD, // 30 deadwood
    SAMPLE_CARDS.TenC, SAMPLE_CARDS.NineH, SAMPLE_CARDS.EightS, // 27 deadwood
    SAMPLE_CARDS.SevenD, SAMPLE_CARDS.SixC, SAMPLE_CARDS.FiveH, // 18 deadwood
    SAMPLE_CARDS.AS, // 1 deadwood = 76 total
  ],

  // Hand with potential melds
  POTENTIAL_MELDS_HAND: [
    SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, // Run potential (need 5H or 2H)
    SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, // Set potential (need 7H or 7D)
    SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, // Set potential (need JD or JC)
    SAMPLE_CARDS.AS, SAMPLE_CARDS.TwoS, SAMPLE_CARDS.KD, SAMPLE_CARDS.QC, // Deadwood
  ],

  // Mixed melds hand
  MIXED_MELDS_HAND: [
    SAMPLE_CARDS.AH, SAMPLE_CARDS.TwoH, SAMPLE_CARDS.ThreeH, // Low run
    SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, // Set
    SAMPLE_CARDS.KS, SAMPLE_CARDS.QS, SAMPLE_CARDS.TenS, // High run (needs reorder)
    SAMPLE_CARDS.FiveC, // 5 deadwood
  ],
};

// Common meld patterns
export const TEST_MELDS = {
  // Runs
  LOW_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.AH, SAMPLE_CARDS.TwoH, SAMPLE_CARDS.ThreeH],
  },
  
  MID_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.FiveS, SAMPLE_CARDS.SixS, SAMPLE_CARDS.SevenS],
  },
  
  HIGH_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.JS, SAMPLE_CARDS.QS, SAMPLE_CARDS.KS],
  },
  
  LONG_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.ThreeD, SAMPLE_CARDS.FourD, SAMPLE_CARDS.FiveD, SAMPLE_CARDS.SixD, SAMPLE_CARDS.SevenD],
  },

  // Sets
  LOW_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.TwoH, SAMPLE_CARDS.TwoS, SAMPLE_CARDS.TwoD],
  },
  
  MID_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.SevenH, SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC],
  },
  
  FACE_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.JH, SAMPLE_CARDS.JS, SAMPLE_CARDS.JD],
  },
  
  FOUR_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.EightH, SAMPLE_CARDS.EightS, SAMPLE_CARDS.EightD, SAMPLE_CARDS.EightC],
  },
};

// Invalid meld examples
export const INVALID_MELDS = {
  // Invalid runs
  GAP_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FiveH, SAMPLE_CARDS.SixH], // Missing 4H
  },
  
  MIXED_SUIT_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourS, SAMPLE_CARDS.FiveD], // Different suits
  },
  
  WRAP_AROUND_RUN: {
    type: 'run' as const,
    cards: [SAMPLE_CARDS.QH, SAMPLE_CARDS.KH, SAMPLE_CARDS.AH], // King-Ace wrap
  },

  // Invalid sets
  MIXED_RANK_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.SevenH, SAMPLE_CARDS.EightS, SAMPLE_CARDS.NineD], // Different ranks
  },
  
  DUPLICATE_SUIT_SET: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.SevenH, SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenS], // Duplicate card
  },
  
  TOO_SHORT: {
    type: 'set' as const,
    cards: [SAMPLE_CARDS.KH, SAMPLE_CARDS.KS], // Only 2 cards
  },
};

// AI decision scenarios
export const AI_SCENARIOS = {
  // AI should take upcard (significant improvement)
  TAKE_UPCARD_SCENARIO: {
    hand: [
      SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, // Need 5H for run
      SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, // Need 7H or 7D for set
      SAMPLE_CARDS.KD, SAMPLE_CARDS.QC, SAMPLE_CARDS.JD, // High deadwood
      SAMPLE_CARDS.TenS, SAMPLE_CARDS.NineH, SAMPLE_CARDS.EightD,
    ],
    upcard: SAMPLE_CARDS.FiveH, // Completes run
    shouldTake: true,
  },

  // AI should pass upcard (no improvement)
  PASS_UPCARD_SCENARIO: {
    hand: [
      SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Complete run
      SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, // Complete set
      SAMPLE_CARDS.AS, SAMPLE_CARDS.TwoD, SAMPLE_CARDS.ThreeC, SAMPLE_CARDS.FourS,
    ],
    upcard: SAMPLE_CARDS.KC, // Doesn't help
    shouldTake: false,
  },

  // AI should knock
  KNOCK_SCENARIO: {
    hand: [
      SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Run
      SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD, // Set
      SAMPLE_CARDS.AS, SAMPLE_CARDS.TwoD, SAMPLE_CARDS.ThreeS, // 6 deadwood
      SAMPLE_CARDS.KC, // Will discard this (10 deadwood total, can knock)
    ],
    shouldKnock: true,
    discardCard: SAMPLE_CARDS.KC,
  },

  // AI should gin
  GIN_SCENARIO: {
    hand: [
      SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH, // Run
      SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD, // Set
      SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, SAMPLE_CARDS.JC, // 4-card set
      SAMPLE_CARDS.KC, // Will discard this for gin
    ],
    shouldGin: true,
    discardCard: SAMPLE_CARDS.KC,
  },
};