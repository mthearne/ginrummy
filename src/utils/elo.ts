import { prisma } from './database';

/**
 * ELO Rating System for Gin Rummy
 * 
 * Standard ELO implementation with K-factors adjusted for card games
 */

// K-factors (rating change magnitude)
const K_FACTORS = {
  NOVICE: 32,    // < 30 games played
  INTERMEDIATE: 24, // 30-100 games played  
  EXPERT: 16     // > 100 games played
};

// Rating thresholds
export const ELO_RATINGS = {
  BEGINNER: 1000,
  AMATEUR: 1200,
  SKILLED: 1400,
  EXPERT: 1600,
  MASTER: 1800,
  GRANDMASTER: 2000
};

export interface EloCalculation {
  winner: {
    oldElo: number;
    newElo: number;
    change: number;
  };
  loser: {
    oldElo: number;
    newElo: number;
    change: number;
  };
}

/**
 * Calculate expected score based on ELO difference
 */
function calculateExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Get K-factor based on games played
 */
function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 30) return K_FACTORS.NOVICE;
  if (gamesPlayed < 100) return K_FACTORS.INTERMEDIATE;
  return K_FACTORS.EXPERT;
}

/**
 * Calculate ELO rating changes for both players
 */
export function calculateEloChanges(
  winnerElo: number,
  loserElo: number,
  winnerGamesPlayed: number,
  loserGamesPlayed: number
): EloCalculation {
  // Calculate expected scores
  const winnerExpected = calculateExpectedScore(winnerElo, loserElo);
  const loserExpected = calculateExpectedScore(loserElo, winnerElo);
  
  // Get K-factors
  const winnerK = getKFactor(winnerGamesPlayed);
  const loserK = getKFactor(loserGamesPlayed);
  
  // Calculate rating changes
  const winnerChange = Math.round(winnerK * (1 - winnerExpected));
  const loserChange = Math.round(loserK * (0 - loserExpected));
  
  return {
    winner: {
      oldElo: winnerElo,
      newElo: winnerElo + winnerChange,
      change: winnerChange
    },
    loser: {
      oldElo: loserElo,
      newElo: loserElo + loserChange,
      change: loserChange
    }
  };
}

/**
 * Update player ELO ratings after a game
 */
export async function updatePlayerElos(
  winnerId: string,
  loserId: string,
  gameId: string
): Promise<EloCalculation> {
  console.log(`🎯 ELO: Updating ratings for game ${gameId} - Winner: ${winnerId}, Loser: ${loserId}`);
  
  try {
    // Get current player stats
    const [winner, loser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: winnerId },
        select: { id: true, username: true, elo: true, gamesPlayed: true, gamesWon: true }
      }),
      prisma.user.findUnique({
        where: { id: loserId },
        select: { id: true, username: true, elo: true, gamesPlayed: true, gamesWon: true }
      })
    ]);

    if (!winner || !loser) {
      throw new Error('Player not found for ELO update');
    }

    console.log(`🎯 ELO: Current ratings - ${winner.username}: ${winner.elo} (${winner.gamesPlayed} games), ${loser.username}: ${loser.elo} (${loser.gamesPlayed} games)`);

    // Calculate ELO changes
    const eloChanges = calculateEloChanges(
      winner.elo,
      loser.elo,
      winner.gamesPlayed,
      loser.gamesPlayed
    );

    console.log(`🎯 ELO: Calculated changes - Winner: ${eloChanges.winner.change} (${winner.elo} → ${eloChanges.winner.newElo}), Loser: ${eloChanges.loser.change} (${loser.elo} → ${eloChanges.loser.newElo})`);

    // Update both players in a transaction
    await prisma.$transaction([
      // Update winner
      prisma.user.update({
        where: { id: winnerId },
        data: {
          elo: eloChanges.winner.newElo,
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: 1 }
        }
      }),
      
      // Update loser  
      prisma.user.update({
        where: { id: loserId },
        data: {
          elo: eloChanges.loser.newElo,
          gamesPlayed: { increment: 1 }
          // gamesWon stays the same for loser
        }
      }),
      
      // Record ELO history for winner
      prisma.eloHistory.create({
        data: {
          userId: winnerId,
          elo: eloChanges.winner.newElo,
          change: eloChanges.winner.change,
          gameId: gameId
        }
      }),
      
      // Record ELO history for loser
      prisma.eloHistory.create({
        data: {
          userId: loserId,
          elo: eloChanges.loser.newElo,
          change: eloChanges.loser.change,
          gameId: gameId
        }
      })
    ]);

    console.log(`✅ ELO: Successfully updated ratings for game ${gameId}`);
    return eloChanges;

  } catch (error) {
    console.error(`❌ ELO: Failed to update ratings for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Get ELO rating tier name
 */
export function getEloTier(elo: number): string {
  if (elo >= ELO_RATINGS.GRANDMASTER) return 'Grandmaster';
  if (elo >= ELO_RATINGS.MASTER) return 'Master';
  if (elo >= ELO_RATINGS.EXPERT) return 'Expert';
  if (elo >= ELO_RATINGS.SKILLED) return 'Skilled';
  if (elo >= ELO_RATINGS.AMATEUR) return 'Amateur';
  return 'Beginner';
}

/**
 * Get ELO rating color (for UI)
 */
export function getEloColor(elo: number): string {
  if (elo >= ELO_RATINGS.GRANDMASTER) return '#FFD700'; // Gold
  if (elo >= ELO_RATINGS.MASTER) return '#C0C0C0'; // Silver
  if (elo >= ELO_RATINGS.EXPERT) return '#CD7F32'; // Bronze
  if (elo >= ELO_RATINGS.SKILLED) return '#6B46C1'; // Purple
  if (elo >= ELO_RATINGS.AMATEUR) return '#059669'; // Green
  return '#6B7280'; // Gray
}

/**
 * Get player's ELO statistics
 */
export async function getPlayerEloStats(playerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: playerId },
    select: {
      username: true,
      elo: true,
      gamesPlayed: true,
      gamesWon: true,
      eloHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10 // Last 10 ELO changes
      }
    }
  });

  if (!user) return null;

  const winRate = user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0;

  return {
    username: user.username,
    elo: user.elo,
    tier: getEloTier(user.elo),
    tierColor: getEloColor(user.elo),
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    winRate: Math.round(winRate),
    recentHistory: user.eloHistory
  };
}

/**
 * Get ELO leaderboard
 */
export async function getEloLeaderboard(limit: number = 10) {
  const topPlayers = await prisma.user.findMany({
    orderBy: { elo: 'desc' },
    take: limit,
    select: {
      id: true,
      username: true,
      elo: true,
      gamesPlayed: true,
      gamesWon: true
    }
  });

  return topPlayers.map((player, index) => ({
    rank: index + 1,
    ...player,
    tier: getEloTier(player.elo),
    tierColor: getEloColor(player.elo),
    winRate: player.gamesPlayed > 0 ? Math.round((player.gamesWon / player.gamesPlayed) * 100) : 0
  }));
}