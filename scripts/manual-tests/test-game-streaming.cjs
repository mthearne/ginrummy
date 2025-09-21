#!/usr/bin/env node

/**
 * Test Script: Game Streaming System
 * Tests the real-time game streaming system using Server-Sent Events (SSE)
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

async function loginPlayer(playerCreds) {
  console.log(`🔐 Logging in ${playerCreds.email}...`);
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, playerCreds);
    console.log(`✅ Login successful for ${playerCreds.email}`);
    return response.data.accessToken;
  } catch (error) {
    console.error(`❌ Login failed for ${playerCreds.email}:`, error.response?.data || error.message);
    return null;
  }
}

async function createPvPGame() {
  console.log('🎮 Creating PvP game (Player 1)...');
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
    console.log('✅ PvP Game created:', { gameId, streamVersion });
    return true;
  } catch (error) {
    console.error('❌ Game creation failed:', error.response?.data || error.message);
    return false;
  }
}

function createSSEConnection(token, playerId) {
  return new Promise((resolve, reject) => {
    const { EventSource } = require('eventsource');
    
    const streamUrl = `http://localhost:3001/api/games/stream?token=${encodeURIComponent(token)}`;
    console.log(`🔗 [${playerId}] Connecting to game streaming:`, streamUrl);
    
    const eventSource = new EventSource(streamUrl);
    const events = [];
    
    eventSource.onopen = () => {
      console.log(`🎮 [${playerId}] Game streaming connected`);
    };
    
    eventSource.onmessage = (event) => {
      try {
        const gameEvent = JSON.parse(event.data);
        console.log(`📡 [${playerId}] Received event:`, gameEvent.type, gameEvent.message || '');
        
        // Skip ping and connection events
        if (gameEvent.type !== 'ping' && gameEvent.type !== 'game_connected') {
          events.push(gameEvent);
        }
      } catch (error) {
        console.error(`❌ [${playerId}] Failed to parse event:`, error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error(`❌ [${playerId}] Streaming error:`, error);
    };
    
    // Return connection control
    resolve({
      eventSource,
      getEvents: () => events,
      close: () => {
        eventSource.close();
        console.log(`🔌 [${playerId}] Streaming connection closed`);
      }
    });
  });
}

async function testGameStreaming() {
  console.log('🚀 Starting Game Streaming System Test...\n');
  
  // Login both players
  player1Token = await loginPlayer(player1);
  if (!player1Token) return;
  
  player2Token = await loginPlayer(player2);
  if (!player2Token) return;
  
  // Create PvP game
  const gameCreated = await createPvPGame();
  if (!gameCreated) return;
  
  // Set up streaming connections for both players
  console.log('\n🔗 Setting up streaming connections...');
  const player1Stream = await createSSEConnection(player1Token, 'P1');
  const player2Stream = await createSSEConnection(player2Token, 'P2');
  
  // Wait a bit for connections to establish
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 1: Player 2 joins the game
  console.log('\n🤝 Test 1: Player 2 joining game...');
  try {
    const joinResponse = await axios.post(`${API_BASE}/games/${gameId}/join`, {
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    streamVersion = joinResponse.data.streamVersion;
    console.log('✅ Player 2 joined successfully');
    
    // Wait for streaming events
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error('❌ Player 2 join failed:', error.response?.data || error.message);
  }
  
  // Test 2: Player 1 takes upcard
  console.log('\n🎯 Test 2: Player 1 taking upcard...');
  try {
    const moveResponse = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      type: 'take_upcard',
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    
    streamVersion = moveResponse.data.streamVersion;
    console.log('✅ Player 1 took upcard successfully');
    
    // Wait for streaming events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('❌ Player 1 move failed:', error.response?.data || error.message);
  }

  // Test 2b: Player 1 discards to complete turn  
  console.log('\n🎯 Test 2b: Player 1 discarding to complete turn...');
  try {
    // Get current game state to find a card to discard
    const gameStateResponse = await axios.get(`${API_BASE}/games/${gameId}/state`, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    
    const gameState = gameStateResponse.data.state;
    const player1Hand = gameState.players.find(p => p.id === gameState.currentPlayerId)?.hand;
    
    if (player1Hand && player1Hand.length > 0) {
      // Discard the first card in hand
      const cardToDiscard = player1Hand[0];
      
      const moveResponse = await axios.post(`${API_BASE}/games/${gameId}/move`, {
        type: 'discard',
        cardId: cardToDiscard.id,
        requestId: uuidv4(),
        expectedVersion: streamVersion
      }, {
        headers: { Authorization: `Bearer ${player1Token}` }
      });
      
      streamVersion = moveResponse.data.streamVersion;
      console.log('✅ Player 1 discarded successfully');
      
      // Wait for streaming events
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('❌ Player 1 discard failed:', error.response?.data || error.message);
  }
  
  // Test 3: Player 2 draws from stock (now it's their turn)
  console.log('\n🎯 Test 3: Player 2 drawing from stock...');
  try {
    const moveResponse = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      type: 'draw_stock',
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    streamVersion = moveResponse.data.streamVersion;
    console.log('✅ Player 2 drew from stock successfully');
    
    // Wait for streaming events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('❌ Player 2 move failed:', error.response?.data || error.message);
  }
  
  // Analyze streaming results
  console.log('\n📊 Streaming Results Analysis:');
  
  const p1Events = player1Stream.getEvents();
  const p2Events = player2Stream.getEvents();
  
  console.log(`📡 Player 1 received ${p1Events.length} streaming events:`);
  p1Events.forEach((event, i) => {
    console.log(`   ${i + 1}. [${event.type}] ${event.message || 'No message'}`);
  });
  
  console.log(`📡 Player 2 received ${p2Events.length} streaming events:`);
  p2Events.forEach((event, i) => {
    console.log(`   ${i + 1}. [${event.type}] ${event.message || 'No message'}`);
  });
  
  // Close streaming connections
  player1Stream.close();
  player2Stream.close();
  
  // Test results
  const p1HasPlayerJoined = p1Events.some(e => e.type === 'player_joined');
  const p2HasPlayerJoined = p2Events.some(e => e.type === 'player_joined');
  const p1HasMoveMade = p1Events.some(e => e.type === 'move_made');
  const p2HasMoveMade = p2Events.some(e => e.type === 'move_made');
  const p1HasGameStateUpdated = p1Events.some(e => e.type === 'game_state_updated');
  const p2HasGameStateUpdated = p2Events.some(e => e.type === 'game_state_updated');
  
  console.log('\n🏁 Test Results:');
  console.log('✅ Player 1 Streaming Connection:', p1Events.length > 0 ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Streaming Connection:', p2Events.length > 0 ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 Received Player Joined:', p1HasPlayerJoined ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Received Player Joined:', p2HasPlayerJoined ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 Received Move Made:', p1HasMoveMade ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Received Move Made:', p2HasMoveMade ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 Received Game State Updated:', p1HasGameStateUpdated ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Received Game State Updated:', p2HasGameStateUpdated ? 'PASS' : 'FAIL');
  
  const results = [
    p1Events.length > 0,
    p2Events.length > 0,
    p1HasPlayerJoined,
    p2HasPlayerJoined,
    p1HasMoveMade,
    p2HasMoveMade,
    p1HasGameStateUpdated,
    p2HasGameStateUpdated
  ];
  
  const passCount = results.filter(r => r).length;
  console.log(`\n📊 Overall: ${passCount}/${results.length} streaming tests passed`);
  
  if (passCount === results.length) {
    console.log('🎉 Game streaming system working correctly!');
  } else {
    console.log('⚠️ Some streaming tests failed - investigation needed');
  }
}

// Handle dependency check
try {
  require('eventsource');
  testGameStreaming().catch(console.error);
} catch (error) {
  console.error('❌ Missing eventsource dependency. Install with: npm install eventsource');
  process.exit(1);
}