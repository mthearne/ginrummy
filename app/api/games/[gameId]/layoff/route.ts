import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';
import { calculateScoreWithLayOffs } from '../../../../../packages/common/src/utils/scoring';

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

    // Calculate final scores with layoffs applied
    const knocker = currentState.state.players.find(p => p.hasKnocked);
    const opponent = currentState.state.players.find(p => !p.hasKnocked);
    
    let finalScores: { knocker: number; opponent: number } | null = null;
    if (knocker && opponent) {
      console.log(`🎯 LayoffAPI: Calculating final scores with ${layOffs.length} layoffs`);
      
      // Calculate scores with layoffs applied
      const scores = calculateScoreWithLayOffs(
        knocker.hand,
        knocker.melds || [],
        opponent.hand,
        opponent.melds || [],
        layOffs as any // Type cast to fix suit type mismatch
      );
      
      finalScores = {
        knocker: scores.knockerScore,
        opponent: scores.opponentScore
      };
      
      console.log(`🎯 LayoffAPI: Final scores calculated:`, finalScores);
    }

    // Create layoff completion event
    const eventData = {
      playerId: userId,
      layOffs: layOffs,
      completed: true,
      finalScores: finalScores
    };

    await EventStore.appendEvent(
      gameId,
      null, // requestId
      currentState.version, // expectedVersion
      'LAYOFF_COMPLETED',
      eventData,
      userId
    );

    console.log(`✅ LayoffAPI: Layoff completed for player ${userId} with ${layOffs.length} layoffs`);

    // Check if game should be finished after layoff completion
    const updatedState = await ReplayService.rebuildState(gameId);
    
    if (updatedState.state.gameOver && updatedState.state.status === 'FINISHED') {
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
          duration: Date.now() - Date.now() // TODO: Use actual game start time
        };

        await EventStore.appendEvent(
          gameId,
          null, // requestId
          updatedState.version, // expectedVersion
          'GAME_FINISHED',
          gameFinishedEventData,
          userId
        );

        console.log(`🏆 LayoffAPI: GAME_FINISHED event created for winner ${winner.id}`);
        
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
      layOffs: layOffs,
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