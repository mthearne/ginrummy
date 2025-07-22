import { Socket, Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  ChatMessage,
  GamePhase,
  MoveType,
} from '@gin-rummy/common';
import { GameService } from '../services/game.js';
import { validateChatMessage } from '@gin-rummy/common';
import { prisma } from '../utils/database.js';

const gameService = GameService.getInstance();

/**
 * Handle AI move if it's the AI's turn
 */
async function handleAIMove(
  gameId: string,
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
) {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
      },
    });

    if (!game || !game.vsAI) return;

    const currentGameState = gameService.getPlayerGameState(gameId, game.player1Id);
    
    // Round over phase - wait for user to start next round
    if (currentGameState?.phase === GamePhase.RoundOver) {
      console.log('Round over - waiting for user to start next round');
      return;
    }
    
    if (currentGameState?.currentPlayerId === 'ai-player') {
      // Small delay for better UX
      setTimeout(async () => {
        const aiMove = gameService.getAIMove(gameId);
        if (aiMove) {
          console.log(`AI making move: ${aiMove.type}`);
          const aiResult = await gameService.makeMove(gameId, aiMove);
          console.log(`AI move result - success: ${aiResult.success}, gameEnded: ${aiResult.gameEnded}`);
          
          if (aiResult.success) {
            // Log AI move
            await prisma.gameEvent.create({
              data: {
                gameId,
                userId: null,
                eventType: aiMove.type,
                eventData: aiMove as any,
              },
            });

            // Send updated state only to the human player (player1)
            const updatedState = gameService.getPlayerGameState(gameId, game.player1Id);
            console.log(`Updated state after AI move - phase: ${updatedState?.phase}, currentPlayer: ${updatedState?.currentPlayerId}`);
            if (updatedState) {
              const player1Sockets = await io.in(gameId).fetchSockets();
              for (const socketInRoom of player1Sockets) {
                if (socketInRoom.data.userId === game.player1Id) {
                  socketInRoom.emit('game_state', updatedState);
                }
              }
            }

            // Check if AI move ended game
            if (aiResult.gameEnded) {
              const aiGameResult = aiResult.gameResult!;
              io.to(gameId).emit('game_ended', aiGameResult);
              await gameService.finishGame(gameId, aiGameResult);
              return; // Don't continue if game ended
            }

            // Recursively check if AI needs to move again (this will handle round over state)
            await handleAIMove(gameId, io);
          }
        }
      }, 500); // Reduced delay for faster play
    }
  } catch (error) {
    console.error('AI move error:', error);
  }
}

/**
 * Setup game-related socket event handlers
 */
export function setupGameHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
) {
  /**
   * Join a game room
   */
  socket.on('join_game', async (data) => {
    try {
      const { gameId } = data;
      const userId = socket.data.userId;
      console.log(`[SOCKET] User ${userId} attempting to join game ${gameId}`);

      // Verify user is part of this game
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { username: true } },
          player2: { select: { username: true } },
        },
      });

      if (!game) {
        console.log(`[SOCKET] Game ${gameId} not found in database`);
        socket.emit('game_error', 'Game not found');
        return;
      }

      console.log(`[SOCKET] Game found: ${gameId}, player1: ${game.player1Id}, player2: ${game.player2Id}, vsAI: ${game.vsAI}`);

      const isPlayer = game.player1Id === userId || game.player2Id === userId;
      if (!isPlayer) {
        console.log(`[SOCKET] User ${userId} is not a player in game ${gameId}`);
        socket.emit('game_error', 'You are not a player in this game');
        return;
      }

      // Join socket room
      socket.join(gameId);
      socket.data.gameId = gameId;

      // Notify other players
      socket.to(gameId).emit('player_joined', {
        id: userId,
        username: socket.data.username,
      });

      // Send current game state
      const gameState = gameService.getPlayerGameState(gameId, userId);
      console.log(`[SOCKET] Game state for ${userId} in ${gameId}:`, gameState ? 'Found' : 'NULL');
      console.log(`[SOCKET] Game details - vsAI: ${game.vsAI}, status: ${game.status}, player1: ${game.player1Id}, player2: ${game.player2Id}`);
      
      if (gameState) {
        console.log(`[SOCKET] Emitting game_state for ${gameId}`);
        socket.emit('game_state', gameState);
      } else {
        console.log(`[SOCKET] No game state found, checking game status for ${gameId}`);
        // Handle different scenarios when no game state exists
        if (game.vsAI && !gameService.getGame(gameId)) {
          console.log(`[SOCKET] Initializing AI game engine for ${gameId}`);
          const gameEngine = gameService.createGame(gameId, game.player1Id, 'ai-player', true);
          gameEngine.setPlayerUsernames({
            [game.player1Id]: game.player1.username || 'Player',
            'ai-player': 'AI'
          });
          const newGameState = gameService.getPlayerGameState(gameId, userId);
          if (newGameState) {
            socket.emit('game_state', newGameState);
          }
        } else if (!game.vsAI && game.status === 'WAITING') {
          // PvP game waiting for second player
          console.log(`[SOCKET] PvP game ${gameId} is waiting for second player - emitting game_waiting`);
          socket.emit('game_waiting', {
            gameId: game.id,
            status: 'WAITING',
            player1: {
              id: game.player1Id,
              username: game.player1?.username || 'Player 1'
            },
            vsAI: false,
            isPrivate: game.isPrivate
          });
        } else if (!game.vsAI && game.status === 'ACTIVE' && game.player2Id && !gameService.getGame(gameId)) {
          // PvP game is active with both players but no game engine - initialize it
          console.log(`[SOCKET] Initializing PvP game engine for ${gameId} with players:`);
          console.log(`  Player1: ${game.player1Id} (${game.player1.username})`);
          console.log(`  Player2: ${game.player2Id} (${game.player2?.username})`);
          
          const gameEngine = gameService.createGame(gameId, game.player1Id, game.player2Id, false);
          gameEngine.setPlayerUsernames({
            [game.player1Id]: game.player1.username || 'Player 1',
            [game.player2Id]: game.player2?.username || 'Player 2'
          });
          
          // Send personalized game state to both players
          console.log(`[SOCKET] Getting player1 state for: ${game.player1Id} (${game.player1.username})`);
          const player1State = gameService.getPlayerGameState(gameId, game.player1Id);
          console.log(`[SOCKET] Getting player2 state for: ${game.player2Id} (${game.player2?.username})`);
          const player2State = gameService.getPlayerGameState(gameId, game.player2Id);
          
          console.log(`[SOCKET] Player1 state - current player: ${player1State?.currentPlayerId}, players:`, 
            player1State?.players?.map(p => `${p.id}(${p.username})`));
          console.log(`[SOCKET] Player2 state - current player: ${player2State?.currentPlayerId}, players:`, 
            player2State?.players?.map(p => `${p.id}(${p.username})`));
          
          if (player1State && player2State) {
            console.log(`[SOCKET] Sending initialized game states to both players`);
            const socketsInRoom = await io.in(gameId).fetchSockets();
            for (const socketInRoom of socketsInRoom) {
              if (socketInRoom.data.userId === game.player1Id) {
                console.log(`[SOCKET] Sending player1 state to ${socketInRoom.data.username}`);
                socketInRoom.emit('game_state', player1State);
              } else if (socketInRoom.data.userId === game.player2Id) {
                console.log(`[SOCKET] Sending player2 state to ${socketInRoom.data.username}`);
                socketInRoom.emit('game_state', player2State);
              }
            }
          }
          
          // Notify all players in the room that the game has started
          io.to(gameId).emit('game_started');
        } else {
          console.log(`[SOCKET] Unexpected game state - vsAI: ${game.vsAI}, status: ${game.status}, hasGameEngine: ${!!gameService.getGame(gameId)}`);
        }
      }

      socket.emit('game_joined', gameId);
      
      // Trigger AI move if needed (e.g., AI needs to take first turn)
      await handleAIMove(gameId, io);
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('game_error', 'Failed to join game');
    }
  });

  /**
   * Leave a game room
   */
  socket.on('leave_game', async (data) => {
    try {
      const { gameId } = data;
      const userId = socket.data.userId;

      socket.leave(gameId);
      socket.data.gameId = undefined;

      // Notify other players
      socket.to(gameId).emit('player_left', userId);
    } catch (error) {
      console.error('Leave game error:', error);
      socket.emit('game_error', 'Failed to leave game');
    }
  });

  /**
   * Handle game moves
   */
  socket.on('play_move', async (move) => {
    try {
      const gameId = socket.data.gameId;
      if (!gameId) {
        socket.emit('game_error', 'Not in a game');
        return;
      }

      const result = await gameService.makeMove(gameId, move);
      
      if (!result.success) {
        socket.emit('game_error', result.error || 'Invalid move');
        return;
      }

      // Log the move
      await prisma.gameEvent.create({
        data: {
          gameId,
          userId: move.playerId,
          eventType: move.type,
          eventData: move as any,
        },
      });

      // Send updated game state to both players
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } },
        },
      });

      if (game) {
        // Send personalized state to each player (hiding opponent's hand)
        const player1State = gameService.getPlayerGameState(gameId, game.player1Id);
        const player2State = game.player2Id 
          ? gameService.getPlayerGameState(gameId, game.player2Id)
          : null;

        // Send player1's state only to player1
        if (player1State) {
          const player1Sockets = await io.in(gameId).fetchSockets();
          for (const socketInRoom of player1Sockets) {
            if (socketInRoom.data.userId === game.player1Id) {
              socketInRoom.emit('game_state', player1State);
            }
          }
        }

        // Send player2's state only to player2 (if exists and not AI)
        if (player2State && game.player2Id !== 'ai-player') {
          const player2Sockets = await io.in(gameId).fetchSockets();
          for (const socketInRoom of player2Sockets) {
            if (socketInRoom.data.userId === game.player2Id) {
              socketInRoom.emit('game_state', player2State);
            }
          }
        }

        // Check if game ended
        if (result.gameEnded) {
          const gameResult = result.gameResult!;
          io.to(gameId).emit('game_ended', gameResult);

          // Update database
          await gameService.finishGame(gameId, gameResult);
        }

        // Trigger AI move if needed
        await handleAIMove(gameId, io);
      }
    } catch (error) {
      console.error('Play move error:', error);
      socket.emit('game_error', 'Failed to play move');
    }
  });

  /**
   * Handle in-game chat
   */
  socket.on('send_chat', async (data) => {
    try {
      const { gameId, message } = data;
      const userId = socket.data.userId;

      // Validate message
      const validation = validateChatMessage(message);
      if (!validation.valid) {
        socket.emit('game_error', validation.error || 'Invalid message');
        return;
      }

      // Verify user is in the game
      if (socket.data.gameId !== gameId) {
        socket.emit('game_error', 'Not in this game');
        return;
      }

      const chatMessage: ChatMessage = {
        id: uuidv4(),
        playerId: userId,
        username: socket.data.username,
        message: message.trim(),
        timestamp: new Date().toISOString(),
      };

      // Broadcast to all players in the game
      io.to(gameId).emit('chat_message', chatMessage);

      // Log chat message
      await prisma.gameEvent.create({
        data: {
          gameId,
          userId,
          eventType: 'chat',
          eventData: chatMessage as any,
        },
      });
    } catch (error) {
      console.error('Send chat error:', error);
      socket.emit('game_error', 'Failed to send message');
    }
  });
}