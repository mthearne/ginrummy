#!/usr/bin/env node

/**
 * Debug Script: Turn Switching in PvP Games
 * Checks if turns switch properly after discard moves
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3001/api';

// Test user credentials
const player1 = { email: 'demo1@example.com', password: 'password123' };
const player2 = { email: 'demo2@example.com', password: 'Password123' };

let player1Token = null;
let player2Token = null;
let gameId = null;
let streamVersion = 0;

async function loginPlayer(playerCreds, name) {
  console.log(`🔐 Logging in ${name}...`);
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, playerCreds);
    console.log(`✅ Login successful for ${name}`);
    return response.data.accessToken;
  } catch (error) {
    console.error(`❌ Login failed for ${name}:`, error.response?.data || error.message);
    return null;
  }
}

async function createAndJoinGame() {
  console.log('🎮 Creating PvP game...');
  try {
    const response = await axios.post(`${API_BASE}/games`, {
      vsAI: false,
      isPrivate: false,
      maxPlayers: 2
    }, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    
    gameId = response.data.gameId;
    streamVersion = response.data.streamVersion;
    console.log('✅ Game created:', { gameId, streamVersion });
    
    // Player 2 joins
    const joinResponse = await axios.post(`${API_BASE}/games/${gameId}/join`, {
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    streamVersion = joinResponse.data.streamVersion;
    console.log('✅ Player 2 joined, streamVersion:', streamVersion);
    
    return true;
  } catch (error) {
    console.error('❌ Game creation/join failed:', error.response?.data || error.message);
    return false;
  }
}

async function getGameState() {
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/state`, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get game state:', error.response?.data || error.message);
    return null;
  }
}

async function makeMove(playerToken, moveData) {
  try {
    const response = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      ...moveData,
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    
    streamVersion = response.data.streamVersion;
    return { success: true, response: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

async function debugTurnSwitching() {
  console.log('🔍 Starting Turn Switching Debug...\n');
  
  // Login both players
  player1Token = await loginPlayer(player1, 'Player 1');
  player2Token = await loginPlayer(player2, 'Player 2');
  
  if (!player1Token || !player2Token) {
    console.log('❌ Login failed, exiting');
    return;
  }
  
  // Create and join game
  if (!await createAndJoinGame()) {
    return;
  }
  
  // Get initial state
  console.log('\n📊 Initial Game State:');
  let gameState = await getGameState();
  if (gameState) {
    console.log(`   Phase: ${gameState.state.phase}`);
    console.log(`   Current Player: ${gameState.state.currentPlayerId}`);
    console.log(`   Players:`, gameState.state.players.map(p => ({
      id: p.id, 
      username: p.username,
      seat: p.seat,
      handSize: p.hand?.length || p.handSize || 0
    })));
  }
  
  // Player 1 takes upcard
  console.log('\n🎯 Player 1 taking upcard...');
  let result = await makeMove(player1Token, { type: 'take_upcard' });
  if (result.success) {
    console.log('✅ Player 1 took upcard');
    
    // Check state after upcard
    gameState = await getGameState();
    if (gameState) {
      console.log(`   New Phase: ${gameState.state.phase}`);
      console.log(`   Current Player: ${gameState.state.currentPlayerId}`);
      console.log(`   Stream Version: ${streamVersion}`);
    }
  } else {
    console.log('❌ Player 1 upcard failed:', result.error);
  }
  
  // Player 1 discards 
  console.log('\n🎯 Player 1 discarding...');
  gameState = await getGameState();
  
  // Find current player by matching the current player ID
  const currentPlayerObj = gameState?.state.players.find(p => p.id === gameState.state.currentPlayerId);
  const currentPlayerHand = currentPlayerObj?.hand;
  
  console.log('   Current player found:', currentPlayerObj ? `${currentPlayerObj.username} with ${currentPlayerHand?.length || 0} cards` : 'Not found');
  
  if (currentPlayerHand && currentPlayerHand.length > 0) {
    const cardToDiscard = currentPlayerHand[0];
    result = await makeMove(player1Token, { 
      type: 'discard', 
      cardId: cardToDiscard.id 
    });
    
    if (result.success) {
      console.log('✅ Player 1 discarded');
      
      // Check state after discard - THIS IS THE CRITICAL PART
      gameState = await getGameState();
      if (gameState) {
        console.log(`   New Phase: ${gameState.state.phase}`);
        console.log(`   Current Player: ${gameState.state.currentPlayerId}`);
        console.log(`   Stream Version: ${streamVersion}`);
        
        // Find player 2 (the non-current player after discard)
        const allPlayers = gameState.state.players;
        const currentPlayer = allPlayers.find(p => p.id === gameState.state.currentPlayerId);
        const otherPlayer = allPlayers.find(p => p.id !== currentPlayer?.id);
        
        console.log(`   Current player now: ${currentPlayer?.username || 'Unknown'}`);
        console.log(`   Other player: ${otherPlayer?.username || 'Unknown'}`);
        console.log(`   Turn switched to Player 2: ${currentPlayer?.username === 'demo2'}`);
      }
    } else {
      console.log('❌ Player 1 discard failed:', result.error);
      return;
    }
  } else {
    console.log('❌ No cards in current player hand');
    return;
  }
  
  // NOW TEST: Can Player 2 make a move?
  console.log('\n🎯 Testing Player 2 move (should work now)...');
  result = await makeMove(player2Token, { type: 'draw_stock' });
  
  if (result.success) {
    console.log('✅ Player 2 successfully drew from stock!');
    console.log('🎉 Turn switching is working correctly!');
    
    // Final state check
    gameState = await getGameState();
    if (gameState) {
      console.log(`   Final Phase: ${gameState.state.phase}`);
      console.log(`   Final Current Player: ${gameState.state.currentPlayerId}`);
    }
  } else {
    console.log('❌ Player 2 move failed:', result.error);
    console.log('🔍 This indicates an issue with turn switching logic');
  }
}

debugTurnSwitching().catch(console.error);