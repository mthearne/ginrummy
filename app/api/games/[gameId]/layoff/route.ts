import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';
import { calculateScoreWithLayOffs } from '../../../../../packages/common/src/utils/scoring';
import { getCardValue } from '../../../../../packages/common/src/utils/cards';
import { maybeCaptureSnapshot } from '../../../../../src/services/snapshot';

const prisma = new PrismaClient();

const layoffRequestSchema = z.object({
  layOffs: z.array(z.object({
    cards: z.array(z.object({
      id: z.string(),
      rank: z.string(),
      suit: z.string()
    })),
    targetMeld: z.object({
      type: z.enum(['set', 'run']),
      cards: z.array(z.object({
        id: z.string(),
        rank: z.string(),
        suit: z.string()
      }))
    })
  }))
});

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    console.log('🃏 LayoffAPI: POST /api/games/[gameId]/layoff');
    
    const { gameId } = params;
    
    // Get current game state first to determine the defending player
    const currentState = await ReplayService.rebuildState(gameId);
    
    // Find the defending player (non-knocker)
    const defendingPlayer = currentState.state.players.find(p => !p.hasKnocked);
    const userId = defendingPlayer?.id || 'unknown-user';
    
    console.log(`👤 LayoffAPI: Using defending player ${userId} for game ${gameId}`);

    // Parse request body
    const body = await request.json();
    const parseResult = layoffRequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      console.log('❌ LayoffAPI: Invalid request body:', parseResult.error);
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 });
    }

    const { layOffs } = parseResult.data;
    console.log(`🃏 LayoffAPI: Processing ${layOffs.length} layoffs`);
    
    if (currentState.state.phase !== 'layoff') {
      console.log(`❌ LayoffAPI: Game not in layoff phase, current phase: ${currentState.state.phase}`);
      return NextResponse.json({ error: 'Game not in layoff phase' }, { status: 400 });
    }

    const knocker = currentState.state.players.find(p => p.hasKnocked);
    const opponent = currentState.state.players.find(p => !p.hasKnocked);

    const scoreSnapshot = knocker && opponent
      ? calculateScoreWithLayOffs(
          knocker.hand,
          knocker.melds || [],
          opponent.hand,
          opponent.melds || [],
          layOffs as any
        )
      : null;

    let expectedVersion = currentState.version;

    // Emit granular layoff events for turn history
    for (const layoff of layOffs) {
      const layoffEventData = {
        playerId: userId,
        cardsLayedOff: layoff.cards,
        targetMeld: layoff.targetMeld,
        deadwoodReduction: layoff.cards.reduce((total, card) => total + getCardValue(card), 0)
      };

      const layoffResult = await EventStore.appendEvent(
        gameId,
        randomUUID(),
        expectedVersion,
        'LAY_OFF',
        layoffEventData,
        userId
      );

      if (!layoffResult.success) {
        console.error('❌ LayoffAPI: Failed to append LAY_OFF event:', layoffResult.error);
        return NextResponse.json({ error: 'Failed to record layoff action' }, { status: 500 });
      }

      expectedVersion = layoffResult.sequence;
    }

    const layoffCompletedData = {
      gameId,
      playerId: userId,
      layoffs: layOffs,
      scoreAdjustment: scoreSnapshot?.layOffValue ?? 0,
      finalScores: scoreSnapshot
        ? { knocker: scoreSnapshot.knockerScore, opponent: scoreSnapshot.opponentScore }
        : { knocker: 0, opponent: 0 }
    };

    const layoffCompletedResult = await EventStore.appendEvent(
      gameId,
      randomUUID(),
      expectedVersion,
      'LAYOFF_COMPLETED',
      layoffCompletedData,
      userId
    );

    if (!layoffCompletedResult.success) {
      console.error('❌ LayoffAPI: Failed to append LAYOFF_COMPLETED event:', layoffCompletedResult.error);
      return NextResponse.json({ error: 'Failed to finalize layoffs' }, { status: 500 });
    }

    expectedVersion = layoffCompletedResult.sequence;
    console.log(`✅ LayoffAPI: Layoff completed for player ${userId} with ${layOffs.length} layoffs`);

    const updatedState = await ReplayService.rebuildState(gameId);

    // Record round summary for analytics/history
    if (knocker && opponent && scoreSnapshot) {
      const roundEndedResult = await EventStore.appendEvent(
        gameId,
        randomUUID(),
        expectedVersion,
        'ROUND_ENDED',
        {
          gameId,
          endType: scoreSnapshot.isGin ? 'GIN' : 'KNOCK',
          knockerId: knocker.id,
          knockerMelds: knocker.melds || [],
          opponentId: opponent.id,
          opponentMelds: opponent.melds || [],
          scores: {
            knocker: scoreSnapshot.knockerScore,
            opponent: scoreSnapshot.opponentScore
          }
        },
        knocker.id
      );

      if (!roundEndedResult.success) {
        console.error('❌ LayoffAPI: Failed to append ROUND_ENDED event:', roundEndedResult.error);
        return NextResponse.json({ error: 'Failed to record round summary' }, { status: 500 });
      }

      expectedVersion = roundEndedResult.sequence;
      await maybeCaptureSnapshot(gameId, expectedVersion, {
        eventType: 'ROUND_ENDED',
        force: true,
        state: updatedState.state
      });
    } else {
      await maybeCaptureSnapshot(gameId, expectedVersion, {
        eventType: 'LAYOFF_COMPLETED',
        state: updatedState.state
      });
    }

    // Check if game should be finished after layoff completion
    if (updatedState.state.gameOver) {
      console.log('🏁 LayoffAPI: Game finished detected, creating GAME_FINISHED event');
      
      // Find winner and loser
      const winner = updatedState.state.players.find(p => p.id === updatedState.state.winner);
      const loser = updatedState.state.players.find(p => p.id !== updatedState.state.winner);
      
      if (winner && loser) {
        const gameFinishedEventData = {
          gameId: gameId,
          winnerId: winner.id,
          winnerScore: winner.score,
          loserId: loser.id,
          loserScore: loser.score,
          endReason: 'KNOCK' as const, // Assuming knock since we're in layoff phase
          duration: 0
        };

        const finishedResult = await EventStore.appendEvent(
          gameId,
          randomUUID(),
          expectedVersion,
          'GAME_FINISHED',
          gameFinishedEventData,
          userId
        );

        if (!finishedResult.success) {
          console.error('❌ LayoffAPI: Failed to append GAME_FINISHED event:', finishedResult.error);
          return NextResponse.json({ error: 'Failed to finalize game' }, { status: 500 });
        }

        expectedVersion = finishedResult.sequence;
        const finalState = await ReplayService.rebuildState(gameId);
        await maybeCaptureSnapshot(gameId, expectedVersion, {
          eventType: 'GAME_FINISHED',
          force: true,
          state: finalState.state
        });

        console.log(`🏆 LayoffAPI: GAME_FINISHED event created for winner ${winner.id}`);
        
        // Update ELO ratings for PvP games
        if (!updatedState.state.vsAI) {
          try {
            console.log('🎯 LayoffAPI: Game completed, processing ELO updates');
            const { updatePlayerElos } = await import('../../../../../src/utils/elo');
            const eloChanges = await updatePlayerElos(winner.id, loser.id, gameId);
            console.log('✅ LayoffAPI: ELO ratings updated successfully');
            console.log(`📊 LayoffAPI: ELO changes - Winner: +${eloChanges.winner.change}, Loser: ${eloChanges.loser.change}`);
          } catch (eloError) {
            console.error('❌ LayoffAPI: Failed to update ELO ratings:', eloError);
            // Don't fail the whole request if ELO update fails
          }
        } else {
          console.log('🤖 LayoffAPI: Skipping ELO update for AI game');
        }
        
        // Update the games table to mark as finished
        await prisma.game.update({
          where: { id: gameId },
          data: {
            status: 'FINISHED',
            winnerId: winner.id
          }
        });
        
        console.log(`📊 LayoffAPI: Games table updated - status: FINISHED, winner: ${winner.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      layOffs,
      finalScores: scoreSnapshot
        ? { knocker: scoreSnapshot.knockerScore, opponent: scoreSnapshot.opponentScore }
        : { knocker: 0, opponent: 0 },
      message: 'Layoff completed successfully'
    });

  } catch (error) {
    console.error('💥 LayoffAPI: Error processing layoff:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
